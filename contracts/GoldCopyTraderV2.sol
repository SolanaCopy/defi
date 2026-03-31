// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IGNSMultiCollatDiamond {
    enum TradeType { TRADE, LIMIT, STOP }

    struct Trade {
        address user;
        uint32 index;
        uint16 pairIndex;
        uint24 leverage;
        bool long;
        bool isOpen;
        uint8 collateralIndex;
        TradeType tradeType;
        uint120 collateralAmount;
        uint64 openPrice;
        uint64 tp;
        uint64 sl;
        bool isCounterTrade;
        uint160 positionSizeToken;
        uint24 __placeholder;
    }

    function openTrade(Trade calldata trade, uint16 maxSlippageP, address referrer) external;
    function closeTradeMarket(uint32 index, uint64 expectedPrice) external;
}

/// @title GoldCopyTrader V2 — Pool-based copy trading
/// @notice Users deposit into a pool per signal. Admin opens one gTrade position.
///         Settlement is based on actual USDC returned, not admin-set results.
contract GoldCopyTraderV2 {
    // ===== STATE =====
    address public admin;
    address public pendingAdmin;
    IERC20 public immutable usdc;
    IGNSMultiCollatDiamond public immutable diamond;

    bool public paused;
    uint256 private _locked;

    uint256 public feePercent = 2000; // 20% = 2000/10000
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_DEPOSIT = 5e6;       // 5 USDC
    uint256 public constant MAX_DEPOSIT = 50000e6;   // 50,000 USDC per user
    uint256 public constant MAX_POOL = 500000e6;     // 500,000 USDC max pool
    uint256 public constant EMERGENCY_DELAY = 7 days;
    uint256 public constant COLLECTING_TIMEOUT = 24 hours; // users can self-cancel after this

    uint256 public signalCount;
    uint256 public totalFeesCollected;
    uint256 public activeSignalId;
    uint256 public reservedForSignals; // USDC reserved for unsettled signals
    uint256 public totalAdminDeposited; // track admin deposits to prevent settle manipulation

    enum SignalPhase { NONE, COLLECTING, TRADING, SETTLED }

    struct SignalCore {
        bool long;
        SignalPhase phase;
        uint64 entryPrice;
        uint64 tp;
        uint64 sl;
        uint24 leverage;
        uint256 feeAtCreation;
        uint32 gTradeIndex;
    }

    struct SignalMeta {
        uint256 timestamp;
        uint256 closedAt;
        uint256 totalDeposited;          // current deposited (reduced by withdrawDeposit only)
        uint256 totalReturned;           // USDC returned from gTrade
        uint256 copierCount;
        uint256 originalDeposited;       // snapshot at trade open, never modified
        uint256 totalEmergencyWithdrawn; // total withdrawn via emergency
        uint256 totalClaimed;            // tracks total USDC claimed to prevent over-payout
        uint256 balanceAtOpen;           // contract USDC balance when trade opened
    }

    struct UserPosition {
        uint256 deposit;
        bool claimed;
    }

    mapping(uint256 => SignalCore) public signalCore;
    mapping(uint256 => SignalMeta) public signalMeta;
    mapping(address => mapping(uint256 => UserPosition)) public positions;
    mapping(address => uint256[]) public userSignalIds;

    // ===== AUTO-COPY =====
    struct AutoCopyConfig {
        uint256 amount;
        bool enabled;
    }
    mapping(address => AutoCopyConfig) public autoCopy;
    address[] public autoCopyUsers;
    mapping(address => bool) private _isAutoCopyUser;

    // ===== EVENTS =====
    event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage);
    event SignalOpened(uint256 indexed signalId, uint256 totalDeposited, uint32 gTradeIndex);
    event SignalSettled(uint256 indexed signalId, uint256 totalDeposited, uint256 totalReturned, int256 resultPct);
    event UserDeposited(address indexed user, uint256 indexed signalId, uint256 amount);
    event UserWithdrawn(address indexed user, uint256 indexed signalId, uint256 amount);
    event UserClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee);
    event FeeUpdated(uint256 newFeePercent);
    event FeesWithdrawn(uint256 amount);
    event AdminDeposited(uint256 amount);
    event Paused(bool isPaused);
    event AdminTransferStarted(address indexed newAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event AutoCopyEnabled(address indexed user, uint256 amount);
    event AutoCopyDisabled(address indexed user);
    event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount);

    // ===== MODIFIERS =====
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier noReentrant() {
        require(_locked != 2, "Reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ===== CONSTRUCTOR =====
    constructor(address _usdc, address _diamond) {
        require(_usdc != address(0) && _diamond != address(0), "Zero addr");
        admin = msg.sender;
        _locked = 1;
        usdc = IERC20(_usdc);
        diamond = IGNSMultiCollatDiamond(_diamond);
        usdc.approve(_diamond, type(uint256).max);
    }

    // ===== ADMIN: Signal Lifecycle =====

    /// @notice Step 1: Post a signal — users can now deposit
    function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external onlyAdmin whenNotPaused {
        require(_lev >= 2000 && _lev <= 250000, "Lev 2x-250x");
        require(_entry > 0 && _tp > 0 && _sl > 0, "Bad prices");
        require(activeSignalId == 0, "Close active signal first");

        if (_long) {
            require(_tp > _entry && _sl < _entry, "Long: TP>entry>SL");
        } else {
            require(_tp < _entry && _sl > _entry, "Short: TP<entry<SL");
        }

        signalCount++;
        signalCore[signalCount] = SignalCore(_long, SignalPhase.COLLECTING, _entry, _tp, _sl, _lev, feePercent, 0);
        signalMeta[signalCount] = SignalMeta(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0);
        activeSignalId = signalCount;

        emit SignalPosted(signalCount, _long, _entry, _tp, _sl, _lev);
    }

    /// @notice Step 2: Open the gTrade position with the total pool
    function openTrade(uint32 _gTradeIndex) external onlyAdmin {
        require(activeSignalId > 0, "No active signal");
        SignalCore storage c = signalCore[activeSignalId];
        SignalMeta storage m = signalMeta[activeSignalId];
        require(c.phase == SignalPhase.COLLECTING, "Not collecting");
        require(m.totalDeposited > 0, "No deposits");
        require(m.totalDeposited <= type(uint120).max, "Pool too large");

        c.phase = SignalPhase.TRADING;
        c.gTradeIndex = _gTradeIndex;
        m.originalDeposited = m.totalDeposited;
        m.balanceAtOpen = usdc.balanceOf(address(this)); // snapshot to detect manipulation
        reservedForSignals += m.totalDeposited;

        IGNSMultiCollatDiamond.Trade memory t = IGNSMultiCollatDiamond.Trade({
            user: address(this),
            index: 0,
            pairIndex: 90,
            leverage: c.leverage,
            long: c.long,
            isOpen: true,
            collateralIndex: 3,
            tradeType: IGNSMultiCollatDiamond.TradeType.TRADE,
            collateralAmount: uint120(m.totalDeposited),
            openPrice: c.entryPrice,
            tp: c.tp,
            sl: c.sl,
            isCounterTrade: false,
            positionSizeToken: 0,
            __placeholder: 0
        });

        diamond.openTrade(t, 1000, address(0));
        emit SignalOpened(activeSignalId, m.totalDeposited, _gTradeIndex);
    }

    /// @notice Step 2b: Close a gTrade position via the contract
    function closeTrade(uint32 _index, uint64 _expectedPrice) external onlyAdmin {
        require(activeSignalId > 0, "No active signal");
        SignalCore storage c = signalCore[activeSignalId];
        require(c.phase == SignalPhase.TRADING, "Not trading");
        require(_index == c.gTradeIndex, "Wrong trade index");
        diamond.closeTradeMarket(_index, _expectedPrice);
    }

    /// @notice Step 3: Settle — record actual USDC returned from gTrade
    /// @dev Uses balanceAtOpen snapshot to detect manipulation via direct transfers
    function settleSignal(uint256 _totalReturned) external onlyAdmin {
        require(activeSignalId > 0, "No active signal");
        SignalCore storage c = signalCore[activeSignalId];
        SignalMeta storage m = signalMeta[activeSignalId];
        require(c.phase == SignalPhase.TRADING, "Not trading");

        uint256 effectiveDeposit = m.originalDeposited - m.totalEmergencyWithdrawn;
        uint256 contractBalance = usdc.balanceOf(address(this));

        // Check 1: _totalReturned can't exceed what gTrade realistically returned
        // Balance at open had the deposits. After trade, gTrade sends back USDC.
        // Max possible return = current balance - (balanceAtOpen - originalDeposited) + emergencyWithdrawn
        // This accounts for: other funds in contract at open, and emergency withdrawals during trade
        uint256 nonTradeBalance = m.balanceAtOpen > m.originalDeposited
            ? m.balanceAtOpen - m.originalDeposited
            : 0;
        uint256 maxFromTrade = contractBalance > nonTradeBalance
            ? contractBalance - nonTradeBalance + m.totalEmergencyWithdrawn
            : 0;
        require(_totalReturned <= maxFromTrade, "More than trade returned");

        // Check 2: sanity cap — max 3x effective deposit
        require(_totalReturned <= effectiveDeposit * 3, "Result too high");

        // Check 3: contract must have enough after reserving for claimers
        require(contractBalance >= _totalReturned, "Insufficient balance");

        // Update state
        c.phase = SignalPhase.SETTLED;
        m.totalReturned = _totalReturned;
        m.closedAt = block.timestamp;

        // Update reserves: remove old reservation, add new one for claimers
        uint256 stillReserved = effectiveDeposit;
        if (reservedForSignals >= stillReserved) {
            reservedForSignals -= stillReserved;
        } else {
            reservedForSignals = 0;
        }
        reservedForSignals += _totalReturned;

        uint256 effectivePool = effectiveDeposit;
        int256 resultPct = 0;
        if (effectivePool > 0) {
            if (_totalReturned >= effectivePool) {
                resultPct = int256((_totalReturned - effectivePool) * BASIS_POINTS / effectivePool);
            } else {
                resultPct = -int256((effectivePool - _totalReturned) * BASIS_POINTS / effectivePool);
            }
        }

        uint256 sid = activeSignalId;
        activeSignalId = 0;
        emit SignalSettled(sid, m.totalDeposited, _totalReturned, resultPct);
    }

    /// @notice Cancel a signal — full refund (COLLECTING phase only)
    function cancelSignal() external onlyAdmin {
        require(activeSignalId > 0, "No active signal");
        SignalCore storage c = signalCore[activeSignalId];
        SignalMeta storage m = signalMeta[activeSignalId];
        require(c.phase == SignalPhase.COLLECTING, "Can only cancel during collection");

        m.originalDeposited = m.totalDeposited; // snapshot so claim() works
        c.phase = SignalPhase.SETTLED;
        m.totalReturned = m.totalDeposited;
        m.closedAt = block.timestamp;
        reservedForSignals += m.totalDeposited; // reserve for claimers

        uint256 sid = activeSignalId;
        activeSignalId = 0;
        emit SignalSettled(sid, m.totalDeposited, m.totalDeposited, 0);
    }

    // ===== ADMIN: Settings =====

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    function setFeePercent(uint256 _fee) external onlyAdmin {
        require(_fee <= 2000, "Max 20%");
        feePercent = _fee;
        emit FeeUpdated(_fee);
    }

    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Zero addr");
        pendingAdmin = _newAdmin;
        emit AdminTransferStarted(_newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        emit AdminTransferred(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    function withdrawFees() external onlyAdmin noReentrant {
        uint256 f = totalFeesCollected;
        require(f > 0, "No fees");
        totalFeesCollected = 0;
        emit FeesWithdrawn(f);
        require(usdc.transfer(admin, f), "Failed");
    }

    function adminDeposit(uint256 _amount) external onlyAdmin noReentrant {
        require(_amount > 0, "Zero amount");
        totalAdminDeposited += _amount;
        require(usdc.transferFrom(admin, address(this), _amount), "Failed");
        emit AdminDeposited(_amount);
    }

    function adminWithdrawDeposit(uint256 _amount) external onlyAdmin noReentrant {
        require(activeSignalId == 0, "Signal active");
        require(_amount <= totalAdminDeposited, "More than deposited");
        uint256 available = usdc.balanceOf(address(this));
        require(available >= _amount + reservedForSignals + totalFeesCollected, "Would underfund claims");
        totalAdminDeposited -= _amount;
        require(usdc.transfer(admin, _amount), "Failed");
    }

    // ===== USER =====

    /// @notice Deposit USDC into the current signal pool
    function deposit(uint256 _amount) external whenNotPaused noReentrant {
        require(activeSignalId > 0, "No active signal");
        SignalCore storage c = signalCore[activeSignalId];
        SignalMeta storage m = signalMeta[activeSignalId];
        require(c.phase == SignalPhase.COLLECTING, "Not accepting deposits");
        require(msg.sender != admin, "Admin use adminDeposit");
        require(_amount >= MIN_DEPOSIT, "Min 5 USDC");
        require(_amount <= MAX_DEPOSIT, "Max 50000 USDC");
        require(m.totalDeposited + _amount <= MAX_POOL, "Pool full");
        UserPosition storage existingPos = positions[msg.sender][activeSignalId];
        require(existingPos.deposit == 0 && !existingPos.claimed, "Already deposited");

        positions[msg.sender][activeSignalId] = UserPosition(_amount, false);
        userSignalIds[msg.sender].push(activeSignalId);
        m.totalDeposited += _amount;
        m.copierCount++;

        emit UserDeposited(msg.sender, activeSignalId, _amount);

        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
    }

    /// @notice Claim proportional share of returned USDC
    function claim(uint256 _signalId) external noReentrant {
        _claim(msg.sender, _signalId);
    }

    /// @notice Admin/bot claims on behalf of a user (payout goes to user)
    function claimFor(address _user, uint256 _signalId) external onlyAdmin noReentrant {
        _claim(_user, _signalId);
    }

    /// @dev Internal claim logic — used by both claim() and claimFor()
    ///      Uses originalDeposited (not totalDeposited) for proportional math.
    ///      Accounts for emergency withdrawals by using the effective pool.
    function _claim(address _user, uint256 _signalId) internal {
        SignalCore storage c = signalCore[_signalId];
        SignalMeta storage m = signalMeta[_signalId];
        require(c.phase == SignalPhase.SETTLED, "Not settled");

        UserPosition storage pos = positions[_user][_signalId];
        require(pos.deposit > 0, "No position");
        require(!pos.claimed, "Already claimed");

        pos.claimed = true;

        // Effective pool = original minus emergency withdrawals
        uint256 effectivePool = m.originalDeposited - m.totalEmergencyWithdrawn;
        require(effectivePool > 0, "No pool");

        // Proportional share of returned USDC based on effective pool
        uint256 userShare = (m.totalReturned * pos.deposit) / effectivePool;

        // Cap userShare — can't exceed remaining claimable USDC
        uint256 remainingClaimable = m.totalReturned > m.totalClaimed ? m.totalReturned - m.totalClaimed : 0;
        if (userShare > remainingClaimable) {
            userShare = remainingClaimable;
        }

        // Fee only on profit
        uint256 fee = 0;
        if (userShare > pos.deposit) {
            uint256 profit = userShare - pos.deposit;
            fee = (profit * c.feeAtCreation) / BASIS_POINTS;
        }

        uint256 payout = userShare - fee;

        // Cap to available balance
        uint256 available = usdc.balanceOf(address(this));
        if (payout > available) {
            payout = available;
            fee = 0;
        }
        totalFeesCollected += fee;

        // Track actual amount leaving the contract (payout + fee)
        m.totalClaimed += payout + fee;

        // Reduce reserved
        if (reservedForSignals >= payout + fee) {
            reservedForSignals -= (payout + fee);
        } else {
            reservedForSignals = 0;
        }

        emit UserClaimed(_user, _signalId, payout, fee);

        if (payout > 0) {
            require(usdc.transfer(_user, payout), "Failed");
        }
    }

    /// @notice Emergency withdraw if signal stays in TRADING for 7+ days
    /// @dev totalDeposited is NOT modified — totalEmergencyWithdrawn tracks separately.
    ///      This preserves proportional math for remaining claimers after settlement.
    function emergencyWithdraw(uint256 _signalId) external noReentrant {
        SignalCore storage c = signalCore[_signalId];
        SignalMeta storage m = signalMeta[_signalId];
        require(c.phase == SignalPhase.TRADING, "Not in trading");
        require(block.timestamp > m.timestamp + EMERGENCY_DELAY, "Too early");

        UserPosition storage pos = positions[msg.sender][_signalId];
        require(pos.deposit > 0, "No position");
        require(!pos.claimed, "Already claimed");

        pos.claimed = true;
        uint256 amount = pos.deposit;

        m.totalEmergencyWithdrawn += amount;
        require(m.totalEmergencyWithdrawn <= m.originalDeposited, "Emergency overflow");
        if (m.copierCount > 0) {
            m.copierCount--;
        }
        if (reservedForSignals >= amount) {
            reservedForSignals -= amount;
        }

        uint256 available = usdc.balanceOf(address(this));
        uint256 payout = amount > available ? available : amount;

        emit UserClaimed(msg.sender, _signalId, payout, 0);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Failed");
        }
    }

    /// @notice Withdraw deposit before trade opens (COLLECTING phase only)
    function withdrawDeposit(uint256 _signalId) external noReentrant {
        SignalCore storage c = signalCore[_signalId];
        SignalMeta storage m = signalMeta[_signalId];
        require(c.phase == SignalPhase.COLLECTING, "Trade already opened");

        UserPosition storage pos = positions[msg.sender][_signalId];
        require(pos.deposit > 0, "No position");
        require(!pos.claimed, "Already withdrawn");

        pos.claimed = true;
        uint256 amount = pos.deposit;
        pos.deposit = 0; // clear for clean off-chain reads
        m.totalDeposited -= amount;
        if (m.copierCount > 0) {
            m.copierCount--;
        }

        emit UserWithdrawn(msg.sender, _signalId, amount);

        require(usdc.transfer(msg.sender, amount), "Failed");
    }

    /// @notice Anyone can cancel a signal if COLLECTING phase exceeds timeout
    function userCancelExpiredSignal(uint256 _signalId) external {
        require(_signalId == activeSignalId, "Not active signal");
        SignalCore storage c = signalCore[_signalId];
        SignalMeta storage m = signalMeta[_signalId];
        require(c.phase == SignalPhase.COLLECTING, "Not in collecting");
        require(block.timestamp > m.timestamp + COLLECTING_TIMEOUT, "Not expired");

        m.originalDeposited = m.totalDeposited; // snapshot so claim() works
        c.phase = SignalPhase.SETTLED;
        m.totalReturned = m.totalDeposited;
        m.closedAt = block.timestamp;
        reservedForSignals += m.totalDeposited; // reserve for claimers

        uint256 sid = activeSignalId;
        activeSignalId = 0;
        emit SignalSettled(sid, m.totalDeposited, m.totalDeposited, 0);
    }

    // ===== AUTO-COPY =====

    /// @notice Enable auto-copy with a specific amount per trade
    function enableAutoCopy(uint256 _amount) external {
        require(_amount >= MIN_DEPOSIT, "Min 5 USDC");
        require(_amount <= MAX_DEPOSIT, "Max 50000 USDC");
        require(msg.sender != admin, "Admin cannot auto-copy");

        if (!_isAutoCopyUser[msg.sender]) {
            autoCopyUsers.push(msg.sender);
            _isAutoCopyUser[msg.sender] = true;
        }
        autoCopy[msg.sender] = AutoCopyConfig(_amount, true);
        emit AutoCopyEnabled(msg.sender, _amount);
    }

    /// @notice Disable auto-copy
    function disableAutoCopy() external {
        require(autoCopy[msg.sender].enabled, "Not enabled");
        autoCopy[msg.sender].enabled = false;
        emit AutoCopyDisabled(msg.sender);
    }

    /// @notice Bot executes auto-copy deposit for a user
    function executeCopyFor(address _user, uint256 _signalId) external onlyAdmin whenNotPaused noReentrant {
        AutoCopyConfig storage config = autoCopy[_user];
        require(config.enabled, "Auto-copy not enabled");

        SignalCore storage c = signalCore[_signalId];
        SignalMeta storage m = signalMeta[_signalId];
        require(c.phase == SignalPhase.COLLECTING, "Not collecting");

        UserPosition storage existingPos = positions[_user][_signalId];
        require(existingPos.deposit == 0 && !existingPos.claimed, "Already deposited");

        uint256 amount = config.amount;
        require(m.totalDeposited + amount <= MAX_POOL, "Pool full");

        positions[_user][_signalId] = UserPosition(amount, false);
        userSignalIds[_user].push(_signalId);
        m.totalDeposited += amount;
        m.copierCount++;

        emit AutoCopied(_user, _signalId, amount);

        require(usdc.transferFrom(_user, address(this), amount), "Transfer failed");
    }

    // ===== VIEW =====

    function getActiveSignalId() external view returns (uint256) {
        return activeSignalId;
    }

    function getUserSignalIds(address _user) external view returns (uint256[] memory) {
        return userSignalIds[_user];
    }

    function getAutoCopyUsers() external view returns (address[] memory) {
        return autoCopyUsers;
    }

    function getAutoCopyUserCount() external view returns (uint256) {
        return autoCopyUsers.length;
    }

    function getExpectedPayout(address _user, uint256 _id) external view returns (uint256) {
        SignalCore storage c = signalCore[_id];
        SignalMeta storage m = signalMeta[_id];
        UserPosition storage pos = positions[_user][_id];
        if (pos.deposit == 0 || pos.claimed || c.phase != SignalPhase.SETTLED) return 0;

        uint256 effectivePool = m.originalDeposited - m.totalEmergencyWithdrawn;
        if (effectivePool == 0) return 0;

        uint256 userShare = (m.totalReturned * pos.deposit) / effectivePool;
        uint256 remainingClaimable = m.totalReturned > m.totalClaimed ? m.totalReturned - m.totalClaimed : 0;
        if (userShare > remainingClaimable) userShare = remainingClaimable;

        if (userShare > pos.deposit) {
            uint256 profit = userShare - pos.deposit;
            uint256 fee = (profit * c.feeAtCreation) / BASIS_POINTS;
            return userShare - fee;
        }
        return userShare;
    }
}
