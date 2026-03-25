// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract SmartTradingGoldBot {
    address public owner;
    IERC20 public usdcToken;
    
    struct User {
        uint256 depositedAmount;
        uint256 rewardDebt;
        uint256 lastActionTime;
    }
    
    mapping(address => User) public users;
    
    uint256 public constant DAILY_REWARD_RATE = 200; // 2% = 200 / 10000
    uint256 public constant SECONDS_PER_DAY = 86400;
    
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 reward);
    event RewardClaimed(address indexed user, uint256 reward);
    event OwnerWithdrawn(uint256 amount);
    event OwnerDeposited(uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized: Owner only");
        _;
    }
    
    constructor(address _usdcAddress) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcAddress);
    }
    
    // Utility to get only Monday-Friday seconds between two timestamps
    function getWeekdaySeconds(uint256 start, uint256 end) public pure returns (uint256) {
        if (end <= start) return 0;
        uint256 totalSeconds = end - start;
        uint256 fullWeeks = totalSeconds / (7 days);
        uint256 weekdaySeconds = fullWeeks * 5 days;
        uint256 currentSec = start + (fullWeeks * 7 days);
        
        for (uint i = 0; i < 7; i++) {
            if (currentSec >= end) break;
            uint256 endOfDay = ((currentSec / 1 days) + 1) * 1 days;
            if (endOfDay > end) endOfDay = end;
            
            // Jan 1 1970 was a Thursday (index 4)
            uint256 dayOfWeek = ((currentSec / 1 days) + 4) % 7;
            
            // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
            if (dayOfWeek > 0 && dayOfWeek < 6) {
                weekdaySeconds += (endOfDay - currentSec);
            }
            currentSec = endOfDay;
        }
        
        return weekdaySeconds;
    }
    
    // Calculates pending rewards (2% daily)
    function pendingReward(address _user) public view returns (uint256) {
        User storage user = users[_user];
        if (user.depositedAmount == 0) {
            return user.rewardDebt;
        }
        
        // Only count Monday through Friday
        uint256 weekdayElapsed = getWeekdaySeconds(user.lastActionTime, block.timestamp);
        // Calculation: Principal * 2% * (weekday_seconds / 86400)
        uint256 reward = (user.depositedAmount * DAILY_REWARD_RATE * weekdayElapsed) / (10000 * SECONDS_PER_DAY);
        
        return user.rewardDebt + reward;
    }
    
    // User deposits USDC into the contract
    function deposit(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");
        
        User storage user = users[msg.sender];
        
        // Update reward debt before modifying amount
        if (user.depositedAmount > 0) {
            user.rewardDebt = pendingReward(msg.sender);
        }
        
        user.depositedAmount += _amount;
        user.lastActionTime = block.timestamp;
        
        require(usdcToken.transferFrom(msg.sender, address(this), _amount), "USDC Transfer failed");
        
        emit Deposited(msg.sender, _amount);
    }
    
    // User withdraws exactly their specified principal, plus any accumulated rewards
    function withdraw(uint256 _amount) external {
        User storage user = users[msg.sender];
        require(user.depositedAmount >= _amount, "Insufficient deposited balance");
        require(_amount > 0, "Amount must be greater than 0");
        
        uint256 totalReward = pendingReward(msg.sender);
        
        user.depositedAmount -= _amount;
        user.rewardDebt = 0; // Paying out all accumulated rewards
        user.lastActionTime = block.timestamp;
        
        uint256 amountToTransfer = _amount + totalReward;
        
        require(usdcToken.balanceOf(address(this)) >= amountToTransfer, "Contract has insufficient liquidity");
        require(usdcToken.transfer(msg.sender, amountToTransfer), "USDC Transfer failed");
        
        emit Withdrawn(msg.sender, _amount, totalReward);
    }
    
    // User claims rewards without touching the principal
    function claimReward() external {
        User storage user = users[msg.sender];
        require(block.timestamp >= user.lastActionTime + 24 hours, "Rewards can only be claimed every 24 hours");
        
        uint256 reward = pendingReward(msg.sender);
        require(reward > 0, "No rewards available to claim");
        
        user.rewardDebt = 0;
        user.lastActionTime = block.timestamp;
        
        require(usdcToken.balanceOf(address(this)) >= reward, "Contract has insufficient liquidity");
        require(usdcToken.transfer(msg.sender, reward), "USDC Transfer failed");
        
        emit RewardClaimed(msg.sender, reward);
    }
    
    // --- Admin (Owner) Functions ---
    
    // Admin withdraws USDC to trade on Vantage
    function ownerWithdraw(uint256 _amount) external onlyOwner {
        require(usdcToken.balanceOf(address(this)) >= _amount, "Insufficient liquidity");
        require(usdcToken.transfer(owner, _amount), "USDC Transfer failed");
        emit OwnerWithdrawn(_amount);
    }
    
    // Admin deposits profits back to the contract from Vantage
    function ownerDeposit(uint256 _amount) external onlyOwner {
        require(usdcToken.transferFrom(owner, address(this), _amount), "USDC transfer failed. Did you approve?");
        emit OwnerDeposited(_amount);
    }
}
