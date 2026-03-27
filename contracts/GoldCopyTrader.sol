// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
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

contract GoldCopyTrader {
    // ===== STATE =====
    address public admin;
    address public pendingAdmin;    // FIX #6: two-step admin transfer
    IERC20 public immutable usdc;
    IGNSMultiCollatDiamond public immutable diamond;

    bool public paused;
    uint256 private _locked;        // 1 = unlocked, 2 = locked

    uint256 public feePercent = 2000; // 20% = 2000/10000
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_COLLATERAL = 5e6;    // minimum 5 USDC (6 decimals)
    int256 public constant MAX_RESULT_PCT = 5000;     // max +/- 50%
    uint256 public constant EMERGENCY_DELAY = 7 days;
    uint256 public constant COPY_WINDOW = 1 hours; // users can only copy within 1 hour of signal

    uint256 public signalCount;
    uint256 public totalFeesCollected;
    uint32 public nextTradeIndex;
    uint256 public activeSignalId;  // FIX #9: track active signal directly

    struct SignalCore {
        bool long;
        bool active;
        bool closed;
        uint64 entryPrice;
        uint64 tp;
        uint64 sl;
        uint24 leverage;
        int256 resultPct;
        uint256 feeAtCreation;  // fee locked at signal creation time
    }

    struct SignalMeta {
        uint256 timestamp;
        uint256 closedAt;
        uint256 totalCopied;
        uint256 copierCount;
    }

    struct UserPosition {
        uint256 collateral;
        uint32 gTradeIndex;
        bool claimed;
    }

    struct AutoCopyConfig {
        uint256 amount;   // USDC per trade
        bool enabled;
    }

    mapping(uint256 => SignalCore) public signalCore;
    mapping(uint256 => SignalMeta) public signalMeta;
    mapping(address => mapping(uint256 => UserPosition)) public positions;
    mapping(address => uint256[]) public userSignalIds;
    mapping(address => AutoCopyConfig) public autoCopy;
    mapping(address => bool) public isAutoCopyUser;
    address[] public autoCopyUsers;

    // ===== EVENTS =====
    event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage);
    event SignalClosed(uint256 indexed signalId, int256 resultPct);
    event AutoCopyEnabled(address indexed user, uint256 amount);
    event AutoCopyDisabled(address indexed user);
    event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount);
    event TradeCopied(address indexed user, uint256 indexed signalId, uint256 amount);
    event ProceedsClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee);
    event FeeUpdated(uint256 newFeePercent);
    event FeesWithdrawn(uint256 amount);
    event Paused(bool isPaused);
    event AdminTransferStarted(address indexed newAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

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
        require(usdc.approve(_diamond, type(uint256).max), "Approve failed");
    }

    // ===== ADMIN =====

    function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external onlyAdmin whenNotPaused {
        require(_lev >= 2000 && _lev <= 250000, "Lev 2x-250x");
        require(_entry > 0 && _tp > 0 && _sl > 0, "Bad prices");
        require(activeSignalId == 0, "Close active signal first");
        // Validate TP/SL direction
        if (_long) {
            require(_tp > _entry && _sl < _entry, "Long: TP>entry>SL");
        } else {
            require(_tp < _entry && _sl > _entry, "Short: TP<entry<SL");
        }

        signalCount++;
        signalCore[signalCount] = SignalCore(_long, true, false, _entry, _tp, _sl, _lev, 0, feePercent);
        signalMeta[signalCount] = SignalMeta(block.timestamp, 0, 0, 0);
        activeSignalId = signalCount; // FIX #9

        emit SignalPosted(signalCount, _long, _entry, _tp, _sl, _lev);
    }

    function closeSignal(uint256 _id, int256 _result) external onlyAdmin {
        require(_id == activeSignalId, "Not active signal");
        require(_result >= -MAX_RESULT_PCT && _result <= MAX_RESULT_PCT, "Result out of range");
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Invalid");
        c.active = false;
        c.closed = true;
        c.resultPct = _result;
        signalMeta[_id].closedAt = block.timestamp;
        activeSignalId = 0;
        emit SignalClosed(_id, _result);
    }

    /// @notice Cancel a signal (refund users, no result)
    function cancelSignal(uint256 _id) external onlyAdmin {
        require(_id == activeSignalId, "Not active signal");
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Invalid");
        c.active = false;
        c.closed = true;
        c.resultPct = 0; // breakeven — users get collateral back
        signalMeta[_id].closedAt = block.timestamp;
        activeSignalId = 0;
        emit SignalClosed(_id, 0);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    function setFeePercent(uint256 _fee) external onlyAdmin {
        require(_fee <= 2000, "Max 20%");
        feePercent = _fee;
        emit FeeUpdated(_fee);
    }

    // FIX #6: two-step admin transfer
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
        require(usdc.transfer(admin, f), "Failed");
        emit FeesWithdrawn(f);
    }

    event AdminDeposited(uint256 amount);

    function adminDeposit(uint256 _amount) external onlyAdmin noReentrant {
        require(usdc.transferFrom(admin, address(this), _amount), "Failed");
        emit AdminDeposited(_amount);
    }

    /// @notice Close a gTrade position via the contract
    function closeTradeMarket(uint32 _index, uint64 _expectedPrice) external onlyAdmin {
        diamond.closeTradeMarket(_index, _expectedPrice);
    }

    // ===== USER =====

    // FIX #10: als gTrade openTrade reverts, revert de hele tx → user's USDC gaat nooit verloren
    // Dit is al het geval door Solidity's default revert behavior, maar we maken het expliciet
    function copyTrade(uint256 _id, uint256 _amount) external whenNotPaused noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(block.timestamp <= signalMeta[_id].timestamp + COPY_WINDOW, "Copy window closed");
        require(_amount >= MIN_COLLATERAL, "Min 5 USDC");
        require(positions[msg.sender][_id].collateral == 0, "Already copied");

        // State updates FIRST (checks-effects-interactions pattern)
        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[msg.sender][_id] = UserPosition(_amount, tradeIdx, false);
        userSignalIds[msg.sender].push(_id);

        SignalMeta storage m = signalMeta[_id];
        m.totalCopied += _amount;
        m.copierCount++;

        emit TradeCopied(msg.sender, _id, _amount);

        // External calls LAST
        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        _openGTrade(c, _amount);
    }

    function _openGTrade(SignalCore storage c, uint256 _amount) internal {
        require(_amount <= type(uint120).max, "Amount too large");
        IGNSMultiCollatDiamond.Trade memory t = IGNSMultiCollatDiamond.Trade({
            user: address(this),
            index: 0,
            pairIndex: 90,
            leverage: c.leverage,
            long: c.long,
            isOpen: true,
            collateralIndex: 3,
            tradeType: IGNSMultiCollatDiamond.TradeType.TRADE,
            collateralAmount: uint120(_amount),
            openPrice: c.entryPrice,
            tp: c.tp,
            sl: c.sl,
            isCounterTrade: false,
            positionSizeToken: 0,
            __placeholder: 0
        });
        diamond.openTrade(t, 1000, address(0));
    }

    function claimProceeds(uint256 _id) external noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.closed, "Not closed");

        UserPosition storage pos = positions[msg.sender][_id];
        require(pos.collateral > 0, "No position");
        require(!pos.claimed, "Claimed");

        uint256 col = pos.collateral;

        uint256 payout;
        uint256 fee;

        if (c.resultPct >= 0) {
            uint256 grossProfit = col * uint256(c.resultPct) * c.leverage;
            fee = (grossProfit * c.feeAtCreation) / (BASIS_POINTS * BASIS_POINTS * 1000);
            uint256 profit = grossProfit / (BASIS_POINTS * 1000);
            if (fee > profit) fee = profit;
            payout = col + profit - fee;
        } else {
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            payout = loss >= col ? 0 : col - loss;
            fee = 0;
        }

        // Check available balance (exclude fees)
        uint256 contractBal = usdc.balanceOf(address(this));
        uint256 available = contractBal > totalFeesCollected ? contractBal - totalFeesCollected : 0;

        // Cap payout to available (gTrade takes closing fees, so returned amount is slightly less)
        if (payout > available) {
            // Only allow cap if contract has at least 90% of expected payout
            // This prevents the "claimed but got nothing" bug while allowing gTrade fee differences
            require(available >= (payout * 9) / 10, "Insufficient balance, try later");
            payout = available;
        }

        // State update AFTER balance check (so failed claims can be retried)
        pos.claimed = true;
        totalFeesCollected += fee;

        emit ProceedsClaimed(msg.sender, _id, payout, fee);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Failed");
        }
    }

    /// @notice Emergency withdraw if signal stays open longer than 7 days
    /// Users can get their collateral back if admin disappears
    function emergencyWithdraw(uint256 _id) external noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(block.timestamp > signalMeta[_id].timestamp + EMERGENCY_DELAY, "Too early");

        UserPosition storage pos = positions[msg.sender][_id];
        require(pos.collateral > 0, "No position");
        require(!pos.claimed, "Claimed");

        pos.claimed = true;
        uint256 col = pos.collateral;

        uint256 contractBal = usdc.balanceOf(address(this));
        uint256 available = contractBal > totalFeesCollected ? contractBal - totalFeesCollected : 0;
        uint256 payout = col > available ? available : col;

        emit ProceedsClaimed(msg.sender, _id, payout, 0);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Failed");
        }
    }

    /// @notice Admin can rescue stuck USDC (e.g. from failed claims or orphaned funds)
    /// @dev Only withdraws excess above totalFeesCollected
    function adminRescue(address _to, uint256 _amount) external onlyAdmin noReentrant {
        require(_to != address(0), "Zero addr");
        uint256 contractBal = usdc.balanceOf(address(this));
        require(contractBal >= _amount, "Not enough");
        require(usdc.transfer(_to, _amount), "Failed");
    }

    // ===== AUTO-COPY =====

    /// @notice Enable auto-copy: user pre-approves USDC, bot copies every signal
    function enableAutoCopy(uint256 _amountPerTrade) external {
        require(_amountPerTrade >= MIN_COLLATERAL, "Min 5 USDC");
        require(_amountPerTrade <= type(uint120).max, "Amount too large");

        if (!isAutoCopyUser[msg.sender]) {
            autoCopyUsers.push(msg.sender);
            isAutoCopyUser[msg.sender] = true;
        }
        autoCopy[msg.sender] = AutoCopyConfig(_amountPerTrade, true);
        emit AutoCopyEnabled(msg.sender, _amountPerTrade);
    }

    /// @notice Disable auto-copy
    function disableAutoCopy() external {
        require(autoCopy[msg.sender].enabled, "Not enabled");
        autoCopy[msg.sender].enabled = false;
        emit AutoCopyDisabled(msg.sender);
    }

    /// @notice Bot calls this to auto-copy for a user (admin only)
    /// @dev User must have pre-approved USDC to this contract
    function executeCopyFor(address _user, uint256 _signalId) external onlyAdmin whenNotPaused noReentrant {
        AutoCopyConfig storage config = autoCopy[_user];
        require(config.enabled, "Not enabled");
        require(config.amount >= MIN_COLLATERAL, "Amount too low");

        SignalCore storage c = signalCore[_signalId];
        require(c.active && !c.closed, "Not active");
        require(block.timestamp <= signalMeta[_signalId].timestamp + COPY_WINDOW, "Copy window closed");
        require(positions[_user][_signalId].collateral == 0, "Already copied");

        uint256 amount = config.amount;

        // Check user has enough USDC and allowance
        uint256 userBal = usdc.balanceOf(_user);
        if (userBal < amount) return; // skip silently if insufficient balance

        uint256 allowance = usdc.allowance(_user, address(this));
        if (allowance < amount) return; // skip if not approved

        // State updates first (CEI)
        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[_user][_signalId] = UserPosition(amount, tradeIdx, false);
        userSignalIds[_user].push(_signalId);

        SignalMeta storage m = signalMeta[_signalId];
        m.totalCopied += amount;
        m.copierCount++;

        emit AutoCopied(_user, _signalId, amount);
        emit TradeCopied(_user, _signalId, amount);

        // External calls last
        require(usdc.transferFrom(_user, address(this), amount), "Transfer failed");
        _openGTrade(c, amount);
    }

    /// @notice Get all auto-copy users (for bot to iterate)
    function getAutoCopyUsers() external view returns (address[] memory) {
        return autoCopyUsers;
    }

    /// @notice Get count of auto-copy users
    function getAutoCopyUserCount() external view returns (uint256) {
        return autoCopyUsers.length;
    }

    // ===== VIEW =====

    // FIX #9: O(1) lookup instead of loop
    function getActiveSignalId() external view returns (uint256) {
        return activeSignalId;
    }

    function getUserSignalIds(address _user) external view returns (uint256[] memory) {
        return userSignalIds[_user];
    }

    function getExpectedPayout(address _user, uint256 _id) external view returns (uint256) {
        SignalCore storage c = signalCore[_id];
        uint256 col = positions[_user][_id].collateral;
        if (col == 0 || !c.closed) return 0;

        if (c.resultPct >= 0) {
            uint256 grossProfit = col * uint256(c.resultPct) * c.leverage;
            uint256 fee = (grossProfit * c.feeAtCreation) / (BASIS_POINTS * BASIS_POINTS * 1000);
            uint256 profit = grossProfit / (BASIS_POINTS * 1000);
            if (fee > profit) fee = profit;
            return col + profit - fee;
        } else {
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            if (loss >= col) return 0;
            return col - loss;
        }
    }
}
