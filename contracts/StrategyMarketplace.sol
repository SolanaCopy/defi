// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external returns (uint256);
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

contract StrategyMarketplace {
    // ===== CONSTANTS =====
    uint256 public constant TOTAL_FEE = 2000;       // 20% in basis points
    uint256 public constant PROVIDER_FEE = 1500;     // 15% to provider
    uint256 public constant PLATFORM_FEE = 500;      // 5% to platform
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_COLLATERAL = 5e6;     // $5 USDC (6 decimals)
    uint256 public constant COPY_WINDOW = 5 minutes;
    int256 public constant MAX_RESULT_PCT = 5000;     // max +/- 50%
    uint256 public constant EMERGENCY_DELAY = 7 days;
    uint256 public constant PRICE_PRECISION = 1e10;
    uint256 public constant LEVERAGE_PRECISION = 1e3;

    // ===== STATE =====
    address public admin;
    address public pendingAdmin;
    IERC20 public immutable usdc;
    IGNSMultiCollatDiamond public immutable diamond;

    bool public paused;
    uint256 private _locked; // 1 = unlocked, 2 = locked
    uint32 public nextTradeIndex;
    uint256 public platformFeesCollected;

    // ===== PROVIDER =====
    struct Provider {
        bool registered;
        uint256 signalCount;
        uint256 totalFeesEarned;
        uint256 feesUnclaimed;
    }

    mapping(address => Provider) public providers;
    address[] public providerList;

    // ===== SIGNALS =====
    struct SignalCore {
        address provider;
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
        uint32 copierCount;
    }

    uint256 public globalSignalCount;
    mapping(uint256 => SignalCore) public signalCore;
    mapping(uint256 => SignalMeta) public signalMeta;

    // ===== POSITIONS =====
    struct UserPosition {
        uint256 collateral;
        uint32 tradeIndex;
        bool claimed;
    }

    mapping(address => mapping(uint256 => UserPosition)) public positions;
    mapping(address => uint256[]) public userSignalIds;

    // ===== FOLLOWS =====
    struct FollowConfig {
        uint256 amountPerTrade;
        bool enabled;
    }

    mapping(address => mapping(address => FollowConfig)) public follows; // follower => provider => config
    mapping(address => address[]) public followerProviders; // follower => list of providers they follow
    mapping(address => address[]) public providerFollowers; // provider => list of followers

    // ===== EVENTS =====
    event ProviderRegistered(address indexed provider);
    event SignalPosted(uint256 indexed signalId, address indexed provider, bool long, uint64 entryPrice, uint64 tp, uint64 sl, uint24 leverage);
    event SignalClosed(uint256 indexed signalId, address indexed provider, int256 resultPct);
    event SignalCancelled(uint256 indexed signalId, address indexed provider);
    event TradeCopied(address indexed user, uint256 indexed signalId, uint256 amount);
    event ProceedsClaimed(address indexed user, uint256 indexed signalId, uint256 payout, uint256 providerFee, uint256 platformFee);
    event FollowEnabled(address indexed follower, address indexed provider, uint256 amount);
    event FollowDisabled(address indexed follower, address indexed provider);
    event ProviderFeeClaimed(address indexed provider, uint256 amount);
    event PlatformFeeWithdrawn(uint256 amount);
    event AdminTransferStarted(address indexed newAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ===== MODIFIERS =====
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyProvider() {
        require(providers[msg.sender].registered, "Not a provider");
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
        admin = msg.sender;
        usdc = IERC20(_usdc);
        diamond = IGNSMultiCollatDiamond(_diamond);
        _locked = 1;

        // Approve gTrade diamond to spend USDC
        IERC20(_usdc).approve(_diamond, type(uint256).max);
    }

    // ===== PROVIDER MANAGEMENT =====

    /// @notice Anyone can register as a strategy provider
    function registerProvider() external {
        require(!providers[msg.sender].registered, "Already registered");
        providers[msg.sender] = Provider(true, 0, 0, 0);
        providerList.push(msg.sender);
        emit ProviderRegistered(msg.sender);
    }

    /// @notice Provider posts a new signal
    function postSignal(bool _long, uint64 _entry, uint64 _tp, uint64 _sl, uint24 _lev) external onlyProvider whenNotPaused {
        require(_entry > 0 && _tp > 0 && _sl > 0, "Invalid prices");
        require(_lev >= 2000 && _lev <= 250000, "Leverage 2x-250x");

        globalSignalCount++;
        uint256 id = globalSignalCount;
        providers[msg.sender].signalCount++;

        signalCore[id] = SignalCore(msg.sender, _long, true, false, _entry, _tp, _sl, _lev, 0);
        signalMeta[id] = SignalMeta(block.timestamp, 0, 0, 0);

        emit SignalPosted(id, msg.sender, _long, _entry, _tp, _sl, _lev);
    }

    /// @notice Provider or admin closes a signal with result
    function closeSignal(uint256 _id, int256 _result) external {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(msg.sender == c.provider || msg.sender == admin, "Not authorized");
        require(_result >= -MAX_RESULT_PCT && _result <= MAX_RESULT_PCT, "Result out of range");

        c.active = false;
        c.closed = true;
        c.resultPct = _result;
        signalMeta[_id].closedAt = block.timestamp;

        emit SignalClosed(_id, c.provider, _result);
    }

    /// @notice Provider or admin cancels an active signal (no trades happened or refund)
    function cancelSignal(uint256 _id) external {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(msg.sender == c.provider || msg.sender == admin, "Not authorized");

        c.active = false;
        c.closed = true;
        c.resultPct = 0;
        signalMeta[_id].closedAt = block.timestamp;

        emit SignalCancelled(_id, c.provider);
    }

    // ===== COPY TRADING =====

    /// @notice Copy a signal manually
    function copySignal(uint256 _id, uint256 _amount) external whenNotPaused noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.active && !c.closed, "Not active");
        require(block.timestamp <= signalMeta[_id].timestamp + COPY_WINDOW, "Copy window closed");
        require(_amount >= MIN_COLLATERAL, "Min $5 USDC");
        require(_amount <= type(uint120).max, "Too large");
        require(positions[msg.sender][_id].collateral == 0, "Already copied");

        // State updates first (CEI)
        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[msg.sender][_id] = UserPosition(_amount, tradeIdx, false);
        userSignalIds[msg.sender].push(_id);

        SignalMeta storage m = signalMeta[_id];
        m.totalCopied += _amount;
        m.copierCount++;

        emit TradeCopied(msg.sender, _id, _amount);

        // External calls last
        require(usdc.transferFrom(msg.sender, address(this), _amount), "Transfer failed");
        _openGTrade(c, _amount);
    }

    /// @notice Bot executes auto-copy for a follower of a provider
    function executeCopyFor(address _follower, uint256 _signalId) external onlyAdmin whenNotPaused noReentrant {
        SignalCore storage c = signalCore[_signalId];
        require(c.active && !c.closed, "Not active");
        require(block.timestamp <= signalMeta[_signalId].timestamp + COPY_WINDOW, "Copy window closed");
        require(positions[_follower][_signalId].collateral == 0, "Already copied");

        FollowConfig storage fc = follows[_follower][c.provider];
        require(fc.enabled, "Not following this provider");
        require(fc.amountPerTrade >= MIN_COLLATERAL, "Amount too low");

        uint256 amount = fc.amountPerTrade;

        // Check balance and allowance
        uint256 userBal = usdc.balanceOf(_follower);
        if (userBal < amount) return; // skip silently
        uint256 allowance = usdc.allowance(_follower, address(this));
        if (allowance < amount) return; // skip silently

        // State updates
        uint32 tradeIdx = nextTradeIndex;
        nextTradeIndex++;
        positions[_follower][_signalId] = UserPosition(amount, tradeIdx, false);
        userSignalIds[_follower].push(_signalId);

        SignalMeta storage m = signalMeta[_signalId];
        m.totalCopied += amount;
        m.copierCount++;

        emit TradeCopied(_follower, _signalId, amount);

        // External calls
        require(usdc.transferFrom(_follower, address(this), amount), "Transfer failed");
        _openGTrade(c, amount);
    }

    // ===== CLAIM =====

    /// @notice Claim proceeds after signal is closed
    function claimProceeds(uint256 _id) external noReentrant {
        SignalCore storage c = signalCore[_id];
        require(c.closed, "Not closed");

        UserPosition storage pos = positions[msg.sender][_id];
        require(pos.collateral > 0, "No position");
        require(!pos.claimed, "Already claimed");

        uint256 col = pos.collateral;
        uint256 payout;
        uint256 provFee;
        uint256 platFee;

        if (c.resultPct >= 0) {
            uint256 grossProfit = col * uint256(c.resultPct) * c.leverage;
            uint256 profit = grossProfit / (BASIS_POINTS * LEVERAGE_PRECISION);

            provFee = (grossProfit * PROVIDER_FEE) / (BASIS_POINTS * BASIS_POINTS * LEVERAGE_PRECISION);
            platFee = (grossProfit * PLATFORM_FEE) / (BASIS_POINTS * BASIS_POINTS * LEVERAGE_PRECISION);

            if (provFee + platFee > profit) {
                provFee = profit * PROVIDER_FEE / TOTAL_FEE;
                platFee = profit - provFee;
            }

            payout = col + profit - provFee - platFee;
        } else {
            uint256 loss = (col * uint256(-c.resultPct) * c.leverage) / (BASIS_POINTS * LEVERAGE_PRECISION);
            payout = loss >= col ? 0 : col - loss;
            provFee = 0;
            platFee = 0;
        }

        // Check available balance
        uint256 contractBal = usdc.balanceOf(address(this));
        uint256 totalFees = platformFeesCollected + _totalProviderFees();
        uint256 available = contractBal > totalFees ? contractBal - totalFees : 0;

        if (payout > available) {
            require(available >= (payout * 9) / 10, "Insufficient balance");
            payout = available;
        }

        // State updates
        pos.claimed = true;
        providers[c.provider].totalFeesEarned += provFee;
        providers[c.provider].feesUnclaimed += provFee;
        platformFeesCollected += platFee;

        emit ProceedsClaimed(msg.sender, _id, payout, provFee, platFee);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Transfer failed");
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
        uint256 payout = col > contractBal ? contractBal : col;

        emit ProceedsClaimed(msg.sender, _id, payout, 0, 0);

        if (payout > 0) {
            require(usdc.transfer(msg.sender, payout), "Failed");
        }
    }

    // ===== FOLLOW SYSTEM =====

    /// @notice Follow a provider with auto-copy amount
    function followProvider(address _provider, uint256 _amountPerTrade) external {
        require(providers[_provider].registered, "Not a provider");
        require(_amountPerTrade >= MIN_COLLATERAL, "Min $5 USDC");
        require(_provider != msg.sender, "Cannot follow yourself");

        if (!follows[msg.sender][_provider].enabled) {
            followerProviders[msg.sender].push(_provider);
            providerFollowers[_provider].push(msg.sender);
        }

        follows[msg.sender][_provider] = FollowConfig(_amountPerTrade, true);
        emit FollowEnabled(msg.sender, _provider, _amountPerTrade);
    }

    /// @notice Unfollow a provider
    function unfollowProvider(address _provider) external {
        require(follows[msg.sender][_provider].enabled, "Not following");
        follows[msg.sender][_provider].enabled = false;
        emit FollowDisabled(msg.sender, _provider);
    }

    // ===== FEE CLAIMS =====

    /// @notice Provider claims their earned fees
    function claimProviderFees() external onlyProvider noReentrant {
        uint256 amount = providers[msg.sender].feesUnclaimed;
        require(amount > 0, "No fees");
        providers[msg.sender].feesUnclaimed = 0;
        require(usdc.transfer(msg.sender, amount), "Transfer failed");
        emit ProviderFeeClaimed(msg.sender, amount);
    }

    /// @notice Admin withdraws platform fees
    function withdrawPlatformFees() external onlyAdmin noReentrant {
        uint256 f = platformFeesCollected;
        require(f > 0, "No fees");
        platformFeesCollected = 0;
        require(usdc.transfer(admin, f), "Transfer failed");
        emit PlatformFeeWithdrawn(f);
    }

    // ===== ADMIN =====

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
    }

    function transferAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Zero");
        pendingAdmin = _newAdmin;
        emit AdminTransferStarted(_newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending");
        emit AdminTransferred(admin, pendingAdmin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    /// @notice Admin deposits USDC for payouts
    function adminDeposit(uint256 _amount) external onlyAdmin noReentrant {
        require(usdc.transferFrom(admin, address(this), _amount), "Failed");
    }

    /// @notice Close a gTrade position (admin/bot)
    function closeTradeMarket(uint32 _index, uint64 _expectedPrice) external onlyAdmin {
        diamond.closeTradeMarket(_index, _expectedPrice);
    }

    // ===== VIEW FUNCTIONS =====

    function getProviderCount() external view returns (uint256) {
        return providerList.length;
    }

    function getProviderList() external view returns (address[] memory) {
        return providerList;
    }

    function getProviderFollowers(address _provider) external view returns (address[] memory) {
        return providerFollowers[_provider];
    }

    function getFollowerProviders(address _follower) external view returns (address[] memory) {
        return followerProviders[_follower];
    }

    function getUserSignalIds(address _user) external view returns (uint256[] memory) {
        return userSignalIds[_user];
    }

    function getProviderSignals(address _provider, uint256 _from, uint256 _count) external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](_count);
        uint256 found = 0;
        for (uint256 i = _from; i >= 1 && found < _count; i--) {
            if (signalCore[i].provider == _provider) {
                ids[found] = i;
                found++;
            }
            if (i == 1) break;
        }
        // Trim array
        uint256[] memory result = new uint256[](found);
        for (uint256 i = 0; i < found; i++) {
            result[i] = ids[i];
        }
        return result;
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

    function _totalProviderFees() internal view returns (uint256 total) {
        for (uint256 i = 0; i < providerList.length; i++) {
            total += providers[providerList[i]].feesUnclaimed;
        }
    }
}
