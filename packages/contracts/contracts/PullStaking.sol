// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PullStaking
 * @author PULL Team
 * @notice Staking contract for PULL tokens with configurable rewards and lock periods
 * @dev Implements staking with time-based lock multipliers and emergency withdrawal
 *
 * Features:
 * - Stake PULL tokens to earn rewards
 * - Configurable APY (reward rate in basis points)
 * - Lock period multipliers for enhanced rewards
 * - Emergency withdrawal with penalty
 * - Role-based administration
 */
contract PullStaking is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Role identifier for addresses that can manage staking parameters
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice The PULL token contract
    IERC20 public immutable stakingToken;

    /// @notice Reward rate in basis points per year (e.g., 1000 = 10% APY)
    uint256 public rewardRate;

    /// @notice Total amount of tokens currently staked
    uint256 public totalStaked;

    /// @notice Emergency withdrawal penalty in basis points (e.g., 1000 = 10%)
    uint256 public emergencyPenalty;

    /// @notice Minimum stake amount
    uint256 public minStakeAmount;

    /// @notice Seconds per year for reward calculations
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice Basis points denominator
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Lock period options
    enum LockPeriod {
        NONE,       // No lock - 1x multiplier
        THIRTY_DAYS, // 30 days - 1.25x multiplier
        NINETY_DAYS, // 90 days - 1.5x multiplier
        ONE_YEAR    // 365 days - 2x multiplier
    }

    /**
     * @notice Information about a user's stake
     * @param amount The amount of tokens staked
     * @param startTime When the stake was initiated
     * @param lastClaimTime When rewards were last claimed
     * @param lockPeriod The chosen lock period
     * @param unlockTime When the stake can be withdrawn without penalty
     * @param rewardsClaimed Total rewards claimed so far
     */
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lastClaimTime;
        LockPeriod lockPeriod;
        uint256 unlockTime;
        uint256 rewardsClaimed;
    }

    /// @notice Mapping of user addresses to their stake information
    mapping(address => StakeInfo) public stakes;

    /// @notice Mapping of lock periods to their duration in seconds
    mapping(LockPeriod => uint256) public lockDurations;

    /// @notice Mapping of lock periods to their reward multipliers (in basis points)
    mapping(LockPeriod => uint256) public lockMultipliers;

    /// @dev Emitted when tokens are staked
    event Staked(
        address indexed user,
        uint256 amount,
        LockPeriod lockPeriod,
        uint256 unlockTime
    );

    /// @dev Emitted when tokens are unstaked
    event Unstaked(address indexed user, uint256 amount, uint256 rewards);

    /// @dev Emitted when rewards are claimed
    event RewardsClaimed(address indexed user, uint256 amount);

    /// @dev Emitted when emergency withdrawal occurs
    event EmergencyWithdraw(
        address indexed user,
        uint256 amount,
        uint256 penalty
    );

    /// @dev Emitted when reward rate is updated
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);

    /// @dev Emitted when emergency penalty is updated
    event EmergencyPenaltyUpdated(uint256 oldPenalty, uint256 newPenalty);

    /// @dev Emitted when minimum stake amount is updated
    event MinStakeAmountUpdated(uint256 oldAmount, uint256 newAmount);

    /// @dev Error thrown when amount is zero
    error ZeroAmount();

    /// @dev Error thrown when user has no stake
    error NoStake();

    /// @dev Error thrown when stake is still locked
    error StakeLocked(uint256 unlockTime);

    /// @dev Error thrown when amount exceeds stake
    error InsufficientStake(uint256 requested, uint256 available);

    /// @dev Error thrown when stake amount is below minimum
    error BelowMinimumStake(uint256 amount, uint256 minimum);

    /// @dev Error thrown when user already has an active stake
    error AlreadyStaking();

    /// @dev Error thrown when rate exceeds maximum
    error RateExceedsMaximum(uint256 rate, uint256 maximum);

    /**
     * @notice Deploys the PullStaking contract
     * @param _stakingToken Address of the PULL token contract
     * @param _rewardRate Initial reward rate in basis points (e.g., 1000 = 10%)
     * @param _emergencyPenalty Emergency withdrawal penalty in basis points
     * @param _minStakeAmount Minimum amount required to stake
     */
    constructor(
        address _stakingToken,
        uint256 _rewardRate,
        uint256 _emergencyPenalty,
        uint256 _minStakeAmount
    ) {
        require(_stakingToken != address(0), "Invalid token address");
        require(_rewardRate <= 5000, "Rate too high"); // Max 50% APY
        require(_emergencyPenalty <= 5000, "Penalty too high"); // Max 50%

        stakingToken = IERC20(_stakingToken);
        rewardRate = _rewardRate;
        emergencyPenalty = _emergencyPenalty;
        minStakeAmount = _minStakeAmount;

        // Set up roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        // Set lock durations
        lockDurations[LockPeriod.NONE] = 0;
        lockDurations[LockPeriod.THIRTY_DAYS] = 30 days;
        lockDurations[LockPeriod.NINETY_DAYS] = 90 days;
        lockDurations[LockPeriod.ONE_YEAR] = 365 days;

        // Set lock multipliers (in basis points, 10000 = 1x)
        lockMultipliers[LockPeriod.NONE] = 10000;        // 1x
        lockMultipliers[LockPeriod.THIRTY_DAYS] = 12500; // 1.25x
        lockMultipliers[LockPeriod.NINETY_DAYS] = 15000; // 1.5x
        lockMultipliers[LockPeriod.ONE_YEAR] = 20000;    // 2x
    }

    /**
     * @notice Stakes PULL tokens with an optional lock period
     * @dev Transfers tokens from user and records stake information
     * @param amount The amount of tokens to stake
     * @param lockPeriod The lock period to choose for enhanced rewards
     *
     * Requirements:
     * - Contract must not be paused
     * - Amount must be at least minStakeAmount
     * - User must not have an existing stake
     * - User must have approved this contract for the amount
     *
     * Emits a {Staked} event
     */
    function stake(uint256 amount, LockPeriod lockPeriod)
        external
        nonReentrant
        whenNotPaused
    {
        if (amount == 0) revert ZeroAmount();
        if (amount < minStakeAmount) {
            revert BelowMinimumStake(amount, minStakeAmount);
        }
        if (stakes[msg.sender].amount > 0) revert AlreadyStaking();

        uint256 unlockTime = block.timestamp + lockDurations[lockPeriod];

        stakes[msg.sender] = StakeInfo({
            amount: amount,
            startTime: block.timestamp,
            lastClaimTime: block.timestamp,
            lockPeriod: lockPeriod,
            unlockTime: unlockTime,
            rewardsClaimed: 0
        });

        totalStaked += amount;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount, lockPeriod, unlockTime);
    }

    /**
     * @notice Unstakes tokens and claims pending rewards
     * @dev Returns staked tokens plus accumulated rewards
     * @param amount The amount of tokens to unstake
     *
     * Requirements:
     * - User must have an active stake
     * - Amount must not exceed staked amount
     * - Lock period must have expired
     *
     * Emits an {Unstaked} event
     */
    function unstake(uint256 amount) external nonReentrant {
        StakeInfo storage stakeInfo = stakes[msg.sender];

        if (stakeInfo.amount == 0) revert NoStake();
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeInfo.amount) {
            revert InsufficientStake(amount, stakeInfo.amount);
        }
        if (block.timestamp < stakeInfo.unlockTime) {
            revert StakeLocked(stakeInfo.unlockTime);
        }

        uint256 rewards = _calculateRewards(msg.sender);

        stakeInfo.amount -= amount;
        stakeInfo.lastClaimTime = block.timestamp;
        stakeInfo.rewardsClaimed += rewards;
        totalStaked -= amount;

        // If fully unstaked, clear the stake
        if (stakeInfo.amount == 0) {
            delete stakes[msg.sender];
        }

        // Transfer staked tokens back
        stakingToken.safeTransfer(msg.sender, amount);

        // Transfer rewards (assuming contract has rewards balance)
        if (rewards > 0) {
            stakingToken.safeTransfer(msg.sender, rewards);
        }

        emit Unstaked(msg.sender, amount, rewards);
    }

    /**
     * @notice Claims pending rewards without unstaking
     * @dev Transfers accumulated rewards to the user
     *
     * Requirements:
     * - User must have an active stake
     * - Must have rewards to claim
     *
     * Emits a {RewardsClaimed} event
     */
    function claimRewards() external nonReentrant {
        StakeInfo storage stakeInfo = stakes[msg.sender];

        if (stakeInfo.amount == 0) revert NoStake();

        uint256 rewards = _calculateRewards(msg.sender);
        if (rewards == 0) revert ZeroAmount();

        stakeInfo.lastClaimTime = block.timestamp;
        stakeInfo.rewardsClaimed += rewards;

        stakingToken.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    /**
     * @notice Emergency withdrawal with penalty - bypasses lock period
     * @dev Returns staked tokens minus penalty, forfeits rewards
     *
     * Requirements:
     * - User must have an active stake
     *
     * Emits an {EmergencyWithdraw} event
     */
    function emergencyWithdraw() external nonReentrant {
        StakeInfo storage stakeInfo = stakes[msg.sender];

        if (stakeInfo.amount == 0) revert NoStake();

        uint256 stakedAmount = stakeInfo.amount;
        uint256 penalty = (stakedAmount * emergencyPenalty) / BASIS_POINTS;
        uint256 returnAmount = stakedAmount - penalty;

        totalStaked -= stakedAmount;
        delete stakes[msg.sender];

        // Transfer remaining tokens to user
        stakingToken.safeTransfer(msg.sender, returnAmount);

        // Penalty tokens stay in contract as additional rewards

        emit EmergencyWithdraw(msg.sender, returnAmount, penalty);
    }

    /**
     * @notice Returns stake information for a user
     * @param user The address to query
     * @return The user's StakeInfo struct
     */
    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return stakes[user];
    }

    /**
     * @notice Calculates pending rewards for a user
     * @param user The address to calculate rewards for
     * @return The amount of pending rewards
     */
    function calculateRewards(address user) external view returns (uint256) {
        return _calculateRewards(user);
    }

    /**
     * @notice Returns the effective APY for a given lock period
     * @param lockPeriod The lock period to query
     * @return The effective APY in basis points
     */
    function getEffectiveAPY(LockPeriod lockPeriod) external view returns (uint256) {
        return (rewardRate * lockMultipliers[lockPeriod]) / BASIS_POINTS;
    }

    /**
     * @notice Updates the reward rate
     * @param newRate The new reward rate in basis points
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     * - Rate must not exceed 50% (5000 basis points)
     *
     * Emits a {RewardRateUpdated} event
     */
    function setRewardRate(uint256 newRate) external onlyRole(ADMIN_ROLE) {
        if (newRate > 5000) revert RateExceedsMaximum(newRate, 5000);

        uint256 oldRate = rewardRate;
        rewardRate = newRate;

        emit RewardRateUpdated(oldRate, newRate);
    }

    /**
     * @notice Updates the emergency withdrawal penalty
     * @param newPenalty The new penalty in basis points
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     * - Penalty must not exceed 50%
     *
     * Emits an {EmergencyPenaltyUpdated} event
     */
    function setEmergencyPenalty(uint256 newPenalty) external onlyRole(ADMIN_ROLE) {
        require(newPenalty <= 5000, "Penalty too high");

        uint256 oldPenalty = emergencyPenalty;
        emergencyPenalty = newPenalty;

        emit EmergencyPenaltyUpdated(oldPenalty, newPenalty);
    }

    /**
     * @notice Updates the minimum stake amount
     * @param newAmount The new minimum stake amount
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     *
     * Emits a {MinStakeAmountUpdated} event
     */
    function setMinStakeAmount(uint256 newAmount) external onlyRole(ADMIN_ROLE) {
        uint256 oldAmount = minStakeAmount;
        minStakeAmount = newAmount;

        emit MinStakeAmountUpdated(oldAmount, newAmount);
    }

    /**
     * @notice Pauses staking operations
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses staking operations
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Allows admin to deposit reward tokens
     * @param amount The amount of tokens to deposit for rewards
     *
     * Requirements:
     * - Caller must have ADMIN_ROLE
     */
    function depositRewards(uint256 amount) external onlyRole(ADMIN_ROLE) {
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Returns the contract's reward token balance
     * @return The balance available for rewards
     */
    function rewardBalance() external view returns (uint256) {
        return stakingToken.balanceOf(address(this)) - totalStaked;
    }

    /**
     * @dev Internal function to calculate pending rewards
     * @param user The address to calculate rewards for
     * @return The amount of pending rewards
     */
    function _calculateRewards(address user) internal view returns (uint256) {
        StakeInfo storage stakeInfo = stakes[user];

        if (stakeInfo.amount == 0) return 0;

        uint256 timeElapsed = block.timestamp - stakeInfo.lastClaimTime;
        uint256 multiplier = lockMultipliers[stakeInfo.lockPeriod];

        // rewards = (stake * rate * time * multiplier) / (SECONDS_PER_YEAR * BASIS_POINTS * BASIS_POINTS)
        uint256 rewards = (stakeInfo.amount * rewardRate * timeElapsed * multiplier) /
            (SECONDS_PER_YEAR * BASIS_POINTS * BASIS_POINTS);

        return rewards;
    }
}
