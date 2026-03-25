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

contract GoldCopyTrader {
    // ===== STATE =====
    address public admin;
    address public pendingAdmin;    // FIX #6: two-step admin transfer
    IERC20 public usdc;
    IGNSMultiCollatDiamond public diamond;

    bool public paused;
    uint256 private _locked;        // 1 = unlocked, 2 = locked

    uint256 public feePercent = 2000; // 20% = 2000/10000
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_COLLATERAL = 1e6;    // FIX #4: minimum 1 USDC (6 decimals)
    int256 public constant MAX_RESULT_PCT = 5000;     // FIX #8: max +/- 50%

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

    mapping(uint256 => SignalCore) public signalCore;
    mapping(uint256 => SignalMeta) public signalMeta;
    mapping(address => mapping(uint256 => UserPosition)) public positions;
    mapping(address => uint256[]) public userSignalIds;

    // ===== EVENTS =====
    event SignalPosted(uint256 indexed signalId, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage);
    event SignalClosed(uint256 indexed signalId, int256 resultPct);
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
        usdc.approve(_diamond, type(uint256).max);
    }

    // ===== ADMIN =====

    function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external onlyAdmin whenNotPaused {
        require(_lev >= 2000 && _lev <= 250000, "Lev 2x-250x");
        require(_entry > 0 && _tp > 0 && _sl > 0, "Bad prices");
        require(activeSignalId == 0, "Close active signal first"); // only 1 active at a time

        signalCount++;
        signalCore[signalCount] = SignalCore(_long, true, false, _entry, _tp, _sl, _lev, 0);
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

    function adminDeposit(uint256 _amount) external onlyAdmin {
        require(usdc.transferFrom(admin, address(this), _amount), "Failed");
    }

    // ===== USER =====

    // FIX #10: als gTrade openTrade reverts, revert de hele tx → user's USDC gaat nooit verloren
    // Dit is al het geval door Solidity's default revert behavior, maar we maken het expliciet
    function copyTrade(uint256 _id, uint256 _amount) external whenNotPaused noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(_amount >= MIN_COLLATERAL, "Min 1 USDC");  // FIX #4
        require(positions[msg.sender][_id].collateral == 0, "Already copied");

        // Transfer USDC from user — if this fails, whole tx reverts
        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        // Open on gTrade — if this fails, whole tx reverts including the transferFrom above
        _openGTrade(c, _amount);

        positions[msg.sender][_id] = UserPosition(_amount, nextTradeIndex, false);
        nextTradeIndex++;
        userSignalIds[msg.sender].push(_id);

        SignalMeta storage m = signalMeta[_id];
        m.totalCopied += _amount;
        m.copierCount++;

        emit TradeCopied(msg.sender, _id, _amount);
    }

    function _openGTrade(SignalCore storage c, uint256 _amount) internal {
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

    function claimProceeds(uint256 _id) external noReentrant {  // FIX #3
        SignalCore storage c = signalCore[_id];
        require(c.closed, "Not closed");

        UserPosition storage pos = positions[msg.sender][_id];
        require(pos.collateral > 0, "No position");
        require(!pos.claimed, "Claimed");

        // State update BEFORE transfer (checks-effects-interactions)  // FIX #1
        pos.claimed = true;
        uint256 col = pos.collateral;

        uint256 payout;
        uint256 fee;

        if (c.resultPct >= 0) {
            uint256 profit = (col * uint256(c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            fee = (profit * feePercent) / BASIS_POINTS;
            totalFeesCollected += fee;
            payout = col + profit - fee;
        } else {
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            payout = loss >= col ? 0 : col - loss;
            fee = 0;
        }

        // Cap payout to available balance (prevents stuck USDC from gTrade fees)
        uint256 available = usdc.balanceOf(address(this));
        if (payout > available) {
            payout = available;
        }

        emit ProceedsClaimed(msg.sender, _id, payout, fee);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Failed");
        }
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
            uint256 profit = (col * uint256(c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            uint256 fee = (profit * feePercent) / BASIS_POINTS;
            return col + profit - fee;
        } else {
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * 1000);
            if (loss >= col) return 0;
            return col - loss;
        }
    }
}
