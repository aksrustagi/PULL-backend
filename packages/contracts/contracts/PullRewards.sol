// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PullRewards
 * @author PULL Team
 * @notice Converts PULL points to PULL tokens (one-way conversion)
 * @dev Implements a points-to-tokens conversion system with cooldown and rate limiting
 *
 * Features:
 * - One-way conversion of points to PULL tokens
 * - Configurable conversion rate
 * - Cooldown period between conversions
 * - Rate set by admin
 * - Maximum conversion limits
 */
contract PullRewards is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Role identifier for reward administrators
    bytes32 public constant REWARDS_ADMIN_ROLE = keccak256("REWARDS_ADMIN_ROLE");

    /// @notice Role identifier for the points oracle/backend
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice The PULL token contract
    IERC20 public immutable pullToken;

    /// @notice Conversion rate: tokens per 1000 points (basis points precision)
    /// @dev Example: 100 = 0.1 tokens per point, 1000 = 1 token per point
    uint256 public conversionRate;

    /// @notice Cooldown period between conversions in seconds
    uint256 public cooldownPeriod;

    /// @notice Maximum points that can be converted in a single transaction
    uint256 public maxConversionAmount;

    /// @notice Maximum points that can be converted per day per user
    uint256 public dailyConversionLimit;

    /// @notice Precision for conversion rate calculations
    uint256 public constant RATE_PRECISION = 1000;

    /**
     * @notice User conversion information
     * @param lastConversionTime Timestamp of last conversion
     * @param totalPointsConverted Total points ever converted
     * @param totalTokensReceived Total tokens ever received
     * @param dailyConvertedPoints Points converted in current day
     * @param dailyResetTime When daily limit resets
     */
    struct UserInfo {
        uint256 lastConversionTime;
        uint256 totalPointsConverted;
        uint256 totalTokensReceived;
        uint256 dailyConvertedPoints;
        uint256 dailyResetTime;
    }

    /// @notice Mapping of user addresses to their conversion info
    mapping(address => UserInfo) public userInfo;

    /// @notice Mapping of user addresses to their approved points balance
    /// @dev Points are added by the oracle and can only be spent via conversion
    mapping(address => uint256) public pointsBalance;

    /// @notice Total points distributed across all users
    uint256 public totalPointsDistributed;

    /// @notice Total points converted to tokens
    uint256 public totalPointsConverted;

    /// @notice Total tokens distributed through conversions
    uint256 public totalTokensDistributed;

    /// @dev Emitted when points are added to a user's balance
    event PointsAdded(address indexed user, uint256 amount, string reason);

    /// @dev Emitted when points are converted to tokens
    event PointsConverted(
        address indexed user,
        uint256 pointsAmount,
        uint256 tokensReceived
    );

    /// @dev Emitted when conversion rate is updated
    event ConversionRateUpdated(uint256 oldRate, uint256 newRate);

    /// @dev Emitted when cooldown period is updated
    event CooldownPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);

    /// @dev Emitted when max conversion amount is updated
    event MaxConversionAmountUpdated(uint256 oldAmount, uint256 newAmount);

    /// @dev Emitted when daily limit is updated
    event DailyLimitUpdated(uint256 oldLimit, uint256 newLimit);

    /// @dev Error thrown when conversion is on cooldown
    error CooldownNotExpired(uint256 remainingTime);

    /// @dev Error thrown when points amount exceeds max
    error ExceedsMaxConversion(uint256 requested, uint256 maximum);

    /// @dev Error thrown when daily limit exceeded
    error DailyLimitExceeded(uint256 requested, uint256 remaining);

    /// @dev Error thrown when insufficient points balance
    error InsufficientPoints(uint256 requested, uint256 available);

    /// @dev Error thrown when contract has insufficient tokens
    error InsufficientTokens(uint256 required, uint256 available);

    /// @dev Error thrown when amount is zero
    error ZeroAmount();

    /// @dev Error thrown when address is zero
    error ZeroAddress();

    /// @dev Error thrown when rate is zero
    error ZeroRate();

    /**
     * @notice Deploys the PullRewards contract
     * @param _pullToken Address of the PULL token contract
     * @param _conversionRate Initial conversion rate (tokens per 1000 points)
     * @param _cooldownPeriod Initial cooldown period in seconds
     * @param _maxConversionAmount Maximum points per conversion
     * @param _dailyConversionLimit Maximum points per day per user
     */
    constructor(
        address _pullToken,
        uint256 _conversionRate,
        uint256 _cooldownPeriod,
        uint256 _maxConversionAmount,
        uint256 _dailyConversionLimit
    ) {
        require(_pullToken != address(0), "Invalid token address");
        require(_conversionRate > 0, "Rate must be positive");

        pullToken = IERC20(_pullToken);
        conversionRate = _conversionRate;
        cooldownPeriod = _cooldownPeriod;
        maxConversionAmount = _maxConversionAmount;
        dailyConversionLimit = _dailyConversionLimit;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REWARDS_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
    }

    /**
     * @notice Adds points to a user's balance (called by oracle/backend)
     * @param user The address to add points to
     * @param amount The amount of points to add
     * @param reason Description of why points were awarded
     *
     * Requirements:
     * - Caller must have ORACLE_ROLE
     * - User cannot be zero address
     * - Amount must be greater than zero
     *
     * Emits a {PointsAdded} event
     */
    function addPoints(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyRole(ORACLE_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        pointsBalance[user] += amount;
        totalPointsDistributed += amount;

        emit PointsAdded(user, amount, reason);
    }

    /**
     * @notice Adds points to multiple users in a batch
     * @param users Array of user addresses
     * @param amounts Array of point amounts
     * @param reason Description of why points were awarded
     *
     * Requirements:
     * - Caller must have ORACLE_ROLE
     * - Arrays must have same length
     */
    function addPointsBatch(
        address[] calldata users,
        uint256[] calldata amounts,
        string calldata reason
    ) external onlyRole(ORACLE_ROLE) {
        require(users.length == amounts.length, "Length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == address(0)) continue;
            if (amounts[i] == 0) continue;

            pointsBalance[users[i]] += amounts[i];
            totalPointsDistributed += amounts[i];

            emit PointsAdded(users[i], amounts[i], reason);
        }
    }

    /**
     * @notice Converts points to PULL tokens
     * @param pointsAmount The amount of points to convert
     *
     * Requirements:
     * - Contract must not be paused
     * - Amount must be greater than zero
     * - Amount must not exceed max conversion
     * - Amount must not exceed daily limit
     * - User must have sufficient points balance
     * - Cooldown period must have elapsed
     * - Contract must have sufficient token balance
     *
     * Emits a {PointsConverted} event
     */
    function convertPoints(uint256 pointsAmount) external nonReentrant whenNotPaused {
        if (pointsAmount == 0) revert ZeroAmount();
        if (pointsAmount > maxConversionAmount) {
            revert ExceedsMaxConversion(pointsAmount, maxConversionAmount);
        }
        if (pointsBalance[msg.sender] < pointsAmount) {
            revert InsufficientPoints(pointsAmount, pointsBalance[msg.sender]);
        }

        UserInfo storage user = userInfo[msg.sender];

        // Check cooldown
        if (block.timestamp < user.lastConversionTime + cooldownPeriod) {
            uint256 remaining = (user.lastConversionTime + cooldownPeriod) - block.timestamp;
            revert CooldownNotExpired(remaining);
        }

        // Reset daily limit if new day
        if (block.timestamp >= user.dailyResetTime) {
            user.dailyConvertedPoints = 0;
            user.dailyResetTime = block.timestamp + 1 days;
        }

        // Check daily limit
        uint256 remainingDaily = dailyConversionLimit - user.dailyConvertedPoints;
        if (pointsAmount > remainingDaily) {
            revert DailyLimitExceeded(pointsAmount, remainingDaily);
        }

        // Calculate tokens to receive
        uint256 tokensAmount = (pointsAmount * conversionRate) / RATE_PRECISION;

        // Check contract balance
        uint256 contractBalance = pullToken.balanceOf(address(this));
        if (tokensAmount > contractBalance) {
            revert InsufficientTokens(tokensAmount, contractBalance);
        }

        // Update state
        pointsBalance[msg.sender] -= pointsAmount;
        user.lastConversionTime = block.timestamp;
        user.totalPointsConverted += pointsAmount;
        user.totalTokensReceived += tokensAmount;
        user.dailyConvertedPoints += pointsAmount;

        totalPointsConverted += pointsAmount;
        totalTokensDistributed += tokensAmount;

        // Transfer tokens
        pullToken.safeTransfer(msg.sender, tokensAmount);

        emit PointsConverted(msg.sender, pointsAmount, tokensAmount);
    }

    /**
     * @notice Calculates the token amount for a given points amount
     * @param pointsAmount The points amount to calculate
     * @return The token amount that would be received
     */
    function calculateTokenAmount(uint256 pointsAmount) external view returns (uint256) {
        return (pointsAmount * conversionRate) / RATE_PRECISION;
    }

    /**
     * @notice Returns user information
     * @param user The address to query
     * @return points Current points balance
     * @return info User conversion info struct
     */
    function getUserInfo(address user)
        external
        view
        returns (uint256 points, UserInfo memory info)
    {
        return (pointsBalance[user], userInfo[user]);
    }

    /**
     * @notice Returns time until next conversion is allowed
     * @param user The address to check
     * @return Seconds until cooldown expires (0 if ready)
     */
    function getCooldownRemaining(address user) external view returns (uint256) {
        UserInfo storage info = userInfo[user];
        uint256 cooldownEnd = info.lastConversionTime + cooldownPeriod;

        if (block.timestamp >= cooldownEnd) {
            return 0;
        }
        return cooldownEnd - block.timestamp;
    }

    /**
     * @notice Returns remaining daily conversion allowance
     * @param user The address to check
     * @return Remaining points that can be converted today
     */
    function getDailyRemaining(address user) external view returns (uint256) {
        UserInfo storage info = userInfo[user];

        // If past reset time, full allowance
        if (block.timestamp >= info.dailyResetTime) {
            return dailyConversionLimit;
        }

        return dailyConversionLimit - info.dailyConvertedPoints;
    }

    /**
     * @notice Updates the conversion rate
     * @param newRate The new conversion rate
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     * - Rate must be greater than zero
     *
     * Emits a {ConversionRateUpdated} event
     */
    function setConversionRate(uint256 newRate) external onlyRole(REWARDS_ADMIN_ROLE) {
        if (newRate == 0) revert ZeroRate();

        uint256 oldRate = conversionRate;
        conversionRate = newRate;

        emit ConversionRateUpdated(oldRate, newRate);
    }

    /**
     * @notice Updates the cooldown period
     * @param newPeriod The new cooldown period in seconds
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     *
     * Emits a {CooldownPeriodUpdated} event
     */
    function setCooldownPeriod(uint256 newPeriod) external onlyRole(REWARDS_ADMIN_ROLE) {
        uint256 oldPeriod = cooldownPeriod;
        cooldownPeriod = newPeriod;

        emit CooldownPeriodUpdated(oldPeriod, newPeriod);
    }

    /**
     * @notice Updates the maximum conversion amount
     * @param newAmount The new maximum amount
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     *
     * Emits a {MaxConversionAmountUpdated} event
     */
    function setMaxConversionAmount(uint256 newAmount) external onlyRole(REWARDS_ADMIN_ROLE) {
        uint256 oldAmount = maxConversionAmount;
        maxConversionAmount = newAmount;

        emit MaxConversionAmountUpdated(oldAmount, newAmount);
    }

    /**
     * @notice Updates the daily conversion limit
     * @param newLimit The new daily limit
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     *
     * Emits a {DailyLimitUpdated} event
     */
    function setDailyConversionLimit(uint256 newLimit) external onlyRole(REWARDS_ADMIN_ROLE) {
        uint256 oldLimit = dailyConversionLimit;
        dailyConversionLimit = newLimit;

        emit DailyLimitUpdated(oldLimit, newLimit);
    }

    /**
     * @notice Deposits PULL tokens for rewards distribution
     * @param amount The amount of tokens to deposit
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     */
    function depositTokens(uint256 amount) external onlyRole(REWARDS_ADMIN_ROLE) {
        pullToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraws excess PULL tokens
     * @param amount The amount to withdraw
     * @param to The address to send tokens to
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     */
    function withdrawTokens(uint256 amount, address to)
        external
        onlyRole(REWARDS_ADMIN_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        pullToken.safeTransfer(to, amount);
    }

    /**
     * @notice Pauses all conversions
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     */
    function pause() external onlyRole(REWARDS_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses conversions
     *
     * Requirements:
     * - Caller must have REWARDS_ADMIN_ROLE
     */
    function unpause() external onlyRole(REWARDS_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Returns the available token balance for rewards
     * @return The token balance of this contract
     */
    function availableTokens() external view returns (uint256) {
        return pullToken.balanceOf(address(this));
    }
}
