// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PullToken
 * @dev $PULL utility token for the PULL Super App ecosystem
 *
 * Features:
 * - ERC20 with permit (gasless approvals)
 * - Burnable
 * - Role-based access control
 * - Pausable
 * - Vesting schedules for team/investors
 * - Staking with rewards
 * - Points conversion bridge
 */
contract PullToken is
    ERC20,
    ERC20Burnable,
    ERC20Permit,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    // =============================================================================
    // CONSTANTS
    // =============================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100M initial (10%)

    // Staking parameters
    uint256 public constant MIN_STAKE_AMOUNT = 100 * 10**18; // 100 PULL minimum
    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    // =============================================================================
    // STATE VARIABLES
    // =============================================================================

    // Vesting
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliffDuration;
        bool revocable;
        bool revoked;
    }

    mapping(address => VestingSchedule) public vestingSchedules;
    uint256 public totalVested;

    // Staking
    struct StakeInfo {
        uint256 amount;
        uint256 stakedAt;
        uint256 lastRewardClaim;
        uint256 pendingRewards;
        uint256 unstakeRequestedAt;
        uint256 unstakeAmount;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;
    uint256 public rewardRatePerSecond; // Rewards per second per token staked
    uint256 public lastRewardUpdate;
    uint256 public accRewardPerShare;

    // Points bridge
    uint256 public pointsConversionRate = 1000; // 1000 points = 1 PULL
    mapping(bytes32 => bool) public processedConversions;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 duration,
        uint256 cliffDuration
    );
    event TokensVested(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 unvestedAmount);

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt);
    event RewardsClaimed(address indexed user, uint256 amount);
    event RewardRateUpdated(uint256 newRate);

    event PointsConverted(
        address indexed user,
        uint256 points,
        uint256 tokens,
        bytes32 indexed conversionId
    );

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() ERC20("PULL", "PULL") ERC20Permit("PULL") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(BRIDGE_ROLE, msg.sender);

        // Mint initial supply to deployer for distribution
        _mint(msg.sender, INITIAL_SUPPLY);

        // Initialize staking rewards
        rewardRatePerSecond = 317097919837; // ~1% APY
        lastRewardUpdate = block.timestamp;
    }

    // =============================================================================
    // MINTING
    // =============================================================================

    /**
     * @dev Mint new tokens (respects max supply)
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "PullToken: exceeds max supply");
        _mint(to, amount);
    }

    // =============================================================================
    // VESTING
    // =============================================================================

    /**
     * @dev Create a vesting schedule for a beneficiary
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 duration,
        uint256 cliffDuration,
        bool revocable
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(beneficiary != address(0), "PullToken: zero address");
        require(amount > 0, "PullToken: zero amount");
        require(duration > 0, "PullToken: zero duration");
        require(cliffDuration <= duration, "PullToken: cliff > duration");
        require(vestingSchedules[beneficiary].totalAmount == 0, "PullToken: schedule exists");
        require(totalSupply() + amount <= MAX_SUPPLY, "PullToken: exceeds max supply");

        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            releasedAmount: 0,
            startTime: block.timestamp,
            duration: duration,
            cliffDuration: cliffDuration,
            revocable: revocable,
            revoked: false
        });

        totalVested += amount;

        // Mint tokens to this contract for vesting
        _mint(address(this), amount);

        emit VestingScheduleCreated(
            beneficiary,
            amount,
            block.timestamp,
            duration,
            cliffDuration
        );
    }

    /**
     * @dev Release vested tokens to beneficiary
     */
    function releaseVestedTokens() external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.totalAmount > 0, "PullToken: no vesting schedule");
        require(!schedule.revoked, "PullToken: vesting revoked");
        require(
            block.timestamp >= schedule.startTime + schedule.cliffDuration,
            "PullToken: cliff not reached"
        );

        uint256 vested = _vestedAmount(schedule);
        uint256 releasable = vested - schedule.releasedAmount;
        require(releasable > 0, "PullToken: nothing to release");

        schedule.releasedAmount = vested;
        totalVested -= releasable;

        _transfer(address(this), msg.sender, releasable);

        emit TokensVested(msg.sender, releasable);
    }

    /**
     * @dev Revoke vesting schedule (only for revocable schedules)
     */
    function revokeVesting(address beneficiary) external onlyRole(DEFAULT_ADMIN_ROLE) {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        require(schedule.totalAmount > 0, "PullToken: no vesting schedule");
        require(schedule.revocable, "PullToken: not revocable");
        require(!schedule.revoked, "PullToken: already revoked");

        uint256 vested = _vestedAmount(schedule);
        uint256 unvested = schedule.totalAmount - vested;

        schedule.revoked = true;
        totalVested -= unvested;

        // Return unvested tokens to admin
        if (unvested > 0) {
            _transfer(address(this), msg.sender, unvested);
        }

        emit VestingRevoked(beneficiary, unvested);
    }

    /**
     * @dev Calculate vested amount for a schedule
     */
    function _vestedAmount(VestingSchedule memory schedule) internal view returns (uint256) {
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) {
            return 0;
        }

        uint256 elapsed = block.timestamp - schedule.startTime;
        if (elapsed >= schedule.duration) {
            return schedule.totalAmount;
        }

        return (schedule.totalAmount * elapsed) / schedule.duration;
    }

    /**
     * @dev Get vesting info for a beneficiary
     */
    function getVestingInfo(address beneficiary) external view returns (
        uint256 totalAmount,
        uint256 vestedAmount,
        uint256 releasedAmount,
        uint256 releasableAmount,
        bool revoked
    ) {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        totalAmount = schedule.totalAmount;
        vestedAmount = _vestedAmount(schedule);
        releasedAmount = schedule.releasedAmount;
        releasableAmount = vestedAmount - releasedAmount;
        revoked = schedule.revoked;
    }

    // =============================================================================
    // STAKING
    // =============================================================================

    /**
     * @dev Stake tokens
     */
    function stake(uint256 amount) external whenNotPaused nonReentrant {
        require(amount >= MIN_STAKE_AMOUNT, "PullToken: below minimum stake");
        require(balanceOf(msg.sender) >= amount, "PullToken: insufficient balance");

        _updateRewards();

        StakeInfo storage info = stakes[msg.sender];

        // Claim any pending rewards first
        if (info.amount > 0) {
            uint256 pending = _calculatePendingRewards(msg.sender);
            if (pending > 0) {
                info.pendingRewards += pending;
            }
        }

        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);

        info.amount += amount;
        info.stakedAt = block.timestamp;
        info.lastRewardClaim = block.timestamp;
        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    /**
     * @dev Request unstake (starts cooldown period)
     */
    function requestUnstake(uint256 amount) external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        require(info.amount >= amount, "PullToken: insufficient stake");
        require(info.unstakeAmount == 0, "PullToken: pending unstake exists");

        _updateRewards();

        // Claim rewards before unstaking
        uint256 pending = _calculatePendingRewards(msg.sender);
        if (pending > 0) {
            info.pendingRewards += pending;
        }

        info.unstakeRequestedAt = block.timestamp;
        info.unstakeAmount = amount;
        info.lastRewardClaim = block.timestamp;

        emit UnstakeRequested(msg.sender, amount, block.timestamp + UNSTAKE_COOLDOWN);
    }

    /**
     * @dev Complete unstake after cooldown
     */
    function unstake() external nonReentrant {
        StakeInfo storage info = stakes[msg.sender];
        require(info.unstakeAmount > 0, "PullToken: no pending unstake");
        require(
            block.timestamp >= info.unstakeRequestedAt + UNSTAKE_COOLDOWN,
            "PullToken: cooldown not complete"
        );

        uint256 amount = info.unstakeAmount;
        info.amount -= amount;
        info.unstakeAmount = 0;
        info.unstakeRequestedAt = 0;
        totalStaked -= amount;

        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @dev Claim staking rewards
     */
    function claimRewards() external nonReentrant {
        _updateRewards();

        StakeInfo storage info = stakes[msg.sender];
        uint256 pending = _calculatePendingRewards(msg.sender) + info.pendingRewards;
        require(pending > 0, "PullToken: no rewards");

        info.pendingRewards = 0;
        info.lastRewardClaim = block.timestamp;

        // Mint rewards (up to max supply)
        if (totalSupply() + pending <= MAX_SUPPLY) {
            _mint(msg.sender, pending);
            emit RewardsClaimed(msg.sender, pending);
        }
    }

    /**
     * @dev Update global reward tracking
     */
    function _updateRewards() internal {
        if (totalStaked == 0) {
            lastRewardUpdate = block.timestamp;
            return;
        }

        uint256 elapsed = block.timestamp - lastRewardUpdate;
        uint256 reward = elapsed * rewardRatePerSecond;
        accRewardPerShare += (reward * 1e12) / totalStaked;
        lastRewardUpdate = block.timestamp;
    }

    /**
     * @dev Calculate pending rewards for a user
     */
    function _calculatePendingRewards(address user) internal view returns (uint256) {
        StakeInfo memory info = stakes[user];
        if (info.amount == 0) return 0;

        uint256 elapsed = block.timestamp - info.lastRewardClaim;
        return (info.amount * elapsed * rewardRatePerSecond) / 1e18;
    }

    /**
     * @dev Get staking info for a user
     */
    function getStakingInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        uint256 unstakeAmount,
        uint256 unstakeAvailableAt
    ) {
        StakeInfo memory info = stakes[user];
        stakedAmount = info.amount;
        pendingRewards = _calculatePendingRewards(user) + info.pendingRewards;
        unstakeAmount = info.unstakeAmount;
        unstakeAvailableAt = info.unstakeRequestedAt > 0
            ? info.unstakeRequestedAt + UNSTAKE_COOLDOWN
            : 0;
    }

    /**
     * @dev Update reward rate (admin only)
     */
    function setRewardRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _updateRewards();
        rewardRatePerSecond = newRate;
        emit RewardRateUpdated(newRate);
    }

    // =============================================================================
    // POINTS BRIDGE
    // =============================================================================

    /**
     * @dev Convert off-chain points to PULL tokens
     * Called by the bridge service with a signed conversion request
     */
    function convertPointsToTokens(
        address user,
        uint256 points,
        bytes32 conversionId,
        bytes calldata signature
    ) external onlyRole(BRIDGE_ROLE) nonReentrant {
        require(!processedConversions[conversionId], "PullToken: already processed");
        require(points >= pointsConversionRate, "PullToken: below minimum");

        // Verify signature (simplified - use proper ECDSA in production)
        bytes32 messageHash = keccak256(abi.encodePacked(user, points, conversionId));
        require(_verifySignature(messageHash, signature), "PullToken: invalid signature");

        processedConversions[conversionId] = true;

        uint256 tokens = (points * 1e18) / pointsConversionRate;
        require(totalSupply() + tokens <= MAX_SUPPLY, "PullToken: exceeds max supply");

        _mint(user, tokens);

        emit PointsConverted(user, points, tokens, conversionId);
    }

    /**
     * @dev Update points conversion rate
     */
    function setPointsConversionRate(uint256 newRate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRate > 0, "PullToken: zero rate");
        pointsConversionRate = newRate;
    }

    /**
     * @dev Simplified signature verification (use proper ECDSA in production)
     */
    function _verifySignature(bytes32 messageHash, bytes memory signature) internal view returns (bool) {
        // In production, implement proper ECDSA signature verification
        // This is a placeholder that always returns true for testing
        return signature.length > 0;
    }

    // =============================================================================
    // PAUSABLE
    // =============================================================================

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =============================================================================
    // OVERRIDES
    // =============================================================================

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
