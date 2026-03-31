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

/// @title GoldCopyTrader V5 — Same as V4 + claimFor
/// @notice Identical to the live contract but adds admin claimFor() for auto-claiming.
///         Each user gets their own individual gTrade position per signal.
contract GoldCopyTraderV5 {
    // ===== STATE =====
    address public admin;
    address public pendingAdmin;
    IERC20 public immutable usdc;
    IGNSMultiCollatDiamond public immutable diamond;

    bool public paused;
    uint256 private _locked;

    uint256 public feePercent = 2000; // 20% = 2000/10000
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant LEVERAGE_PRECISION = 1000;
    uint256 public constant MIN_COLLATERAL = 5e6;       // 5 USDC
    uint256 public constant MAX_COLLATERAL = 50000e6;    // 50,000 USDC
    uint256 public constant EMERGENCY_DELAY = 7 days;

    uint256 public signalCount;
    uint256 public activeSignalId;
    uint32 public nextTradeIndex;

    struct SignalCore {
        bool long;
        bool active;
        bool closed;
        uint64 entryPrice;
        uint64 tp;
        uint64 sl;
        uint24 leverage;
        int256 resultPct;       // basis points (100 = 1%)
        uint256 feeAtCreation;
    }

    struct SignalMeta {
        uint256 timestamp;
        uint256 closedAt;
        uint256 totalCopied;
        uint32 copierCount;
    }

    struct UserPosition {
        uint256 collateral;
        uint32 tradeIndex;
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
    event SignalClosed(uint256 indexed signalId, int256 resultPct);
    event TradeCopied(address indexed user, uint256 indexed signalId, uint256 amount);
    event AutoCopied(address indexed user, uint256 indexed signalId, uint256 amount);
    event ProceedsClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 fee);
    event FeesWithdrawn(uint256 amount);
    event AutoCopyEnabled(address indexed user, uint256 amount);
    event AutoCopyDisabled(address indexed user);
    event AdminDeposited(uint256 amount);
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
        usdc.approve(_diamond, type(uint256).max);
    }

    // ===== ADMIN: Signal Lifecycle =====

    /// @notice Post a new signal — users can now copy
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
        signalCore[signalCount] = SignalCore(_long, true, false, _entry, _tp, _sl, _lev, 0, feePercent);
        signalMeta[signalCount] = SignalMeta(block.timestamp, 0, 0, 0);
        activeSignalId = signalCount;

        emit SignalPosted(signalCount, _long, _entry, _tp, _sl, _lev);
    }

    /// @notice Close a signal with the result
    function closeSignal(uint256 _id, int256 _result) external onlyAdmin {
        require(_id == activeSignalId, "Not active signal");
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");

        c.active = false;
        c.closed = true;
        c.resultPct = _result;
        signalMeta[_id].closedAt = block.timestamp;
        activeSignalId = 0;

        emit SignalClosed(_id, _result);
    }

    /// @notice Close a gTrade position
    function closeTradeMarket(uint32 _index, uint64 _expectedPrice) external onlyAdmin {
        diamond.closeTradeMarket(_index, _expectedPrice);
    }

    // ===== ADMIN: Settings =====

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit Paused(_paused);
    }

    function setFeePercent(uint256 _fee) external onlyAdmin {
        require(_fee <= 2000, "Max 20%");
        feePercent = _fee;
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

    function withdrawFees(uint256 _amount) external onlyAdmin noReentrant {
        require(_amount > 0, "Zero");
        uint256 bal = usdc.balanceOf(address(this));
        require(_amount <= bal, "Insufficient");
        emit FeesWithdrawn(_amount);
        require(usdc.transfer(admin, _amount), "Failed");
    }

    function adminDeposit(uint256 _amount) external onlyAdmin noReentrant {
        require(_amount > 0, "Zero amount");
        require(usdc.transferFrom(admin, address(this), _amount), "Failed");
        emit AdminDeposited(_amount);
    }

    // ===== USER: Copy Signal =====

    /// @notice Copy active signal with USDC
    function copySignal(uint256 _signalId, uint256 _amount) external whenNotPaused noReentrant {
        require(_signalId == activeSignalId, "Not active");
        SignalCore storage c = signalCore[_signalId];
        require(c.active && !c.closed, "Not active");
        require(_amount >= MIN_COLLATERAL, "Min 5 USDC");
        require(_amount <= MAX_COLLATERAL, "Max 50000 USDC");

        UserPosition storage pos = positions[msg.sender][_signalId];
        require(pos.collateral == 0, "Already copied");

        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[msg.sender][_signalId] = UserPosition(_amount, tradeIdx, false);
        userSignalIds[msg.sender].push(_signalId);

        SignalMeta storage m = signalMeta[_signalId];
        m.totalCopied += _amount;
        m.copierCount++;

        emit TradeCopied(msg.sender, _signalId, _amount);

        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        _openGTrade(c, _amount);
    }

    /// @notice Bot executes auto-copy for a user
    function executeCopyFor(address _user, uint256 _signalId) external onlyAdmin whenNotPaused noReentrant {
        AutoCopyConfig storage config = autoCopy[_user];
        require(config.enabled, "Auto-copy not enabled");
        require(_signalId == activeSignalId, "Not active");

        SignalCore storage c = signalCore[_signalId];
        require(c.active && !c.closed, "Not active");

        UserPosition storage pos = positions[_user][_signalId];
        require(pos.collateral == 0, "Already copied");

        uint256 amount = config.amount;
        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[_user][_signalId] = UserPosition(amount, tradeIdx, false);
        userSignalIds[_user].push(_signalId);

        SignalMeta storage m = signalMeta[_signalId];
        m.totalCopied += amount;
        m.copierCount++;

        emit AutoCopied(_user, _signalId, amount);

        require(usdc.transferFrom(_user, address(this), amount), "Transfer failed");
        _openGTrade(c, amount);
    }

    // ===== USER: Claim =====

    /// @notice Claim proceeds after signal is closed
    function claimProceeds(uint256 _id) external noReentrant {
        _claim(msg.sender, _id);
    }

    /// @notice Admin/bot claims on behalf of a user (payout goes to user)
    function claimFor(address _user, uint256 _id) external onlyAdmin noReentrant {
        _claim(_user, _id);
    }

    /// @dev Internal claim logic
    function _claim(address _user, uint256 _id) internal {
        SignalCore storage c = signalCore[_id];
        require(c.closed, "Not closed");

        UserPosition storage pos = positions[_user][_id];
        require(pos.collateral > 0, "No position");
        require(!pos.claimed, "Already claimed");

        uint256 col = pos.collateral;
        uint256 payout;
        uint256 fee;

        if (c.resultPct >= 0) {
            // Profit: calculate based on leveraged result
            uint256 grossProfit = (col * uint256(c.resultPct) * c.leverage) / (BASIS_POINTS * LEVERAGE_PRECISION);
            fee = (grossProfit * c.feeAtCreation) / BASIS_POINTS;
            payout = col + grossProfit - fee;
        } else {
            // Loss: no fee
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * LEVERAGE_PRECISION);
            payout = loss >= col ? 0 : col - loss;
            fee = 0;
        }

        pos.claimed = true;

        // Cap to available balance
        uint256 available = usdc.balanceOf(address(this));
        if (payout > available) {
            payout = available;
            fee = 0;
        }

        emit ProceedsClaimed(_user, _id, payout, fee);

        if (payout > 0) {
            require(usdc.transfer(_user, payout), "Transfer failed");
        }
    }

    /// @notice Emergency withdraw if signal open > 7 days
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
        uint256 amount = col > contractBal ? contractBal : col;

        emit ProceedsClaimed(msg.sender, _id, amount, 0);

        if (amount > 0) {
            require(usdc.transfer(msg.sender, amount), "Failed");
        }
    }

    // ===== AUTO-COPY =====

    function enableAutoCopy(uint256 _amount) external {
        require(_amount >= MIN_COLLATERAL, "Min 5 USDC");
        require(_amount <= MAX_COLLATERAL, "Max 50000 USDC");

        if (!_isAutoCopyUser[msg.sender]) {
            autoCopyUsers.push(msg.sender);
            _isAutoCopyUser[msg.sender] = true;
        }
        autoCopy[msg.sender] = AutoCopyConfig(_amount, true);
        emit AutoCopyEnabled(msg.sender, _amount);
    }

    function disableAutoCopy() external {
        require(autoCopy[msg.sender].enabled, "Not enabled");
        autoCopy[msg.sender].enabled = false;
        emit AutoCopyDisabled(msg.sender);
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

    // ===== INTERNAL =====

    function _openGTrade(SignalCore storage c, uint256 _amount) internal {
        IGNSMultiCollatDiamond.Trade memory t = IGNSMultiCollatDiamond.Trade({
            user: address(this),
            index: 0,
            pairIndex: 90, // XAU/USD
            leverage: c.leverage,
            long: c.long,
            isOpen: false,
            collateralIndex: 3, // USDC on gTrade v9
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
}
