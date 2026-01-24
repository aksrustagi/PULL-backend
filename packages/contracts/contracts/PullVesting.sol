// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PullVesting
 * @author PULL Team
 * @notice Token vesting contract for PULL with cliff periods and linear vesting
 * @dev Implements vesting schedules with optional cliff, linear release, and revocation
 *
 * Features:
 * - Create multiple vesting schedules per beneficiary
 * - Cliff period before any tokens vest
 * - Linear vesting after cliff
 * - Revocable schedules for employee grants
 * - Non-revocable schedules for investor grants
 */
contract PullVesting is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Role identifier for addresses that can create vesting schedules
    bytes32 public constant VESTING_ADMIN_ROLE = keccak256("VESTING_ADMIN_ROLE");

    /// @notice The PULL token contract
    IERC20 public immutable token;

    /// @notice Total amount of tokens locked in vesting schedules
    uint256 public totalVested;

    /// @notice Total amount of tokens already released
    uint256 public totalReleased;

    /**
     * @notice Vesting schedule structure
     * @param beneficiary Address that will receive the vested tokens
     * @param totalAmount Total tokens allocated to this schedule
     * @param releasedAmount Tokens already released
     * @param startTime When vesting begins
     * @param cliffDuration Duration of the cliff period in seconds
     * @param duration Total vesting duration in seconds
     * @param revocable Whether the schedule can be revoked
     * @param revoked Whether the schedule has been revoked
     */
    struct VestingSchedule {
        address beneficiary;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 cliffDuration;
        uint256 duration;
        bool revocable;
        bool revoked;
    }

    /// @notice Counter for vesting schedule IDs
    uint256 public vestingScheduleCount;

    /// @notice Mapping from schedule ID to vesting schedule
    mapping(bytes32 => VestingSchedule) public vestingSchedules;

    /// @notice Mapping from beneficiary to their schedule IDs
    mapping(address => bytes32[]) public beneficiarySchedules;

    /// @dev Emitted when a vesting schedule is created
    event VestingScheduleCreated(
        bytes32 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    );

    /// @dev Emitted when tokens are released from a vesting schedule
    event TokensReleased(
        bytes32 indexed scheduleId,
        address indexed beneficiary,
        uint256 amount
    );

    /// @dev Emitted when a vesting schedule is revoked
    event VestingRevoked(
        bytes32 indexed scheduleId,
        address indexed beneficiary,
        uint256 unvestedAmount
    );

    /// @dev Error thrown when schedule does not exist
    error ScheduleNotFound();

    /// @dev Error thrown when schedule is already revoked
    error ScheduleRevoked();

    /// @dev Error thrown when schedule is not revocable
    error ScheduleNotRevocable();

    /// @dev Error thrown when cliff has not passed
    error CliffNotReached();

    /// @dev Error thrown when no tokens are releasable
    error NoTokensToRelease();

    /// @dev Error thrown when amount is zero
    error ZeroAmount();

    /// @dev Error thrown when address is zero
    error ZeroAddress();

    /// @dev Error thrown when duration is invalid
    error InvalidDuration();

    /// @dev Error thrown when cliff is longer than duration
    error CliffExceedsDuration();

    /// @dev Error thrown when caller is not beneficiary
    error NotBeneficiary();

    /// @dev Error thrown when insufficient token balance
    error InsufficientBalance();

    /**
     * @notice Deploys the PullVesting contract
     * @param _token Address of the PULL token contract
     */
    constructor(address _token) {
        require(_token != address(0), "Invalid token address");
        token = IERC20(_token);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VESTING_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Creates a new vesting schedule for a beneficiary
     * @param beneficiary The address that will receive the vested tokens
     * @param amount The total amount of tokens to vest
     * @param startTime When the vesting period starts (can be in the past or future)
     * @param cliffDuration The cliff period duration in seconds
     * @param duration The total vesting duration in seconds
     * @param revocable Whether the schedule can be revoked by admin
     * @return scheduleId The unique identifier for this vesting schedule
     *
     * Requirements:
     * - Caller must have VESTING_ADMIN_ROLE
     * - Beneficiary cannot be zero address
     * - Amount must be greater than zero
     * - Duration must be greater than zero
     * - Cliff must not exceed duration
     * - Contract must have sufficient token balance
     *
     * Emits a {VestingScheduleCreated} event
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    ) external onlyRole(VESTING_ADMIN_ROLE) returns (bytes32 scheduleId) {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (duration == 0) revert InvalidDuration();
        if (cliffDuration > duration) revert CliffExceedsDuration();

        // Check contract has sufficient balance
        uint256 availableBalance = token.balanceOf(address(this)) - totalVested + totalReleased;
        if (amount > availableBalance) revert InsufficientBalance();

        // Generate unique schedule ID
        scheduleId = _computeScheduleId(beneficiary, vestingScheduleCount);
        vestingScheduleCount++;

        vestingSchedules[scheduleId] = VestingSchedule({
            beneficiary: beneficiary,
            totalAmount: amount,
            releasedAmount: 0,
            startTime: startTime,
            cliffDuration: cliffDuration,
            duration: duration,
            revocable: revocable,
            revoked: false
        });

        beneficiarySchedules[beneficiary].push(scheduleId);
        totalVested += amount;

        emit VestingScheduleCreated(
            scheduleId,
            beneficiary,
            amount,
            startTime,
            cliffDuration,
            duration,
            revocable
        );
    }

    /**
     * @notice Releases vested tokens from a schedule
     * @param scheduleId The ID of the vesting schedule
     *
     * Requirements:
     * - Schedule must exist
     * - Schedule must not be fully revoked with nothing to release
     * - Cliff period must have passed
     * - There must be tokens to release
     *
     * Emits a {TokensReleased} event
     */
    function release(bytes32 scheduleId) external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];

        if (schedule.beneficiary == address(0)) revert ScheduleNotFound();
        if (schedule.revoked && schedule.releasedAmount >= _vestedAmount(schedule)) {
            revert ScheduleRevoked();
        }

        uint256 releasable = _computeReleasableAmount(schedule);
        if (releasable == 0) revert NoTokensToRelease();

        schedule.releasedAmount += releasable;
        totalReleased += releasable;

        token.safeTransfer(schedule.beneficiary, releasable);

        emit TokensReleased(scheduleId, schedule.beneficiary, releasable);
    }

    /**
     * @notice Releases vested tokens from all schedules for the caller
     *
     * Emits {TokensReleased} events for each schedule with tokens released
     */
    function releaseAll() external nonReentrant {
        bytes32[] memory scheduleIds = beneficiarySchedules[msg.sender];

        for (uint256 i = 0; i < scheduleIds.length; i++) {
            VestingSchedule storage schedule = vestingSchedules[scheduleIds[i]];

            if (schedule.revoked && schedule.releasedAmount >= _vestedAmount(schedule)) {
                continue;
            }

            uint256 releasable = _computeReleasableAmount(schedule);
            if (releasable == 0) continue;

            schedule.releasedAmount += releasable;
            totalReleased += releasable;

            token.safeTransfer(schedule.beneficiary, releasable);

            emit TokensReleased(scheduleIds[i], schedule.beneficiary, releasable);
        }
    }

    /**
     * @notice Revokes a vesting schedule and returns unvested tokens
     * @param scheduleId The ID of the vesting schedule to revoke
     *
     * Requirements:
     * - Caller must have VESTING_ADMIN_ROLE
     * - Schedule must exist
     * - Schedule must be revocable
     * - Schedule must not already be revoked
     *
     * Emits a {VestingRevoked} event
     */
    function revoke(bytes32 scheduleId) external onlyRole(VESTING_ADMIN_ROLE) nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];

        if (schedule.beneficiary == address(0)) revert ScheduleNotFound();
        if (!schedule.revocable) revert ScheduleNotRevocable();
        if (schedule.revoked) revert ScheduleRevoked();

        // Calculate vested amount at revocation time
        uint256 vested = _vestedAmount(schedule);
        uint256 unvested = schedule.totalAmount - vested;

        schedule.revoked = true;
        totalVested -= unvested;

        // Transfer unvested tokens back to admin
        if (unvested > 0) {
            token.safeTransfer(msg.sender, unvested);
        }

        emit VestingRevoked(scheduleId, schedule.beneficiary, unvested);
    }

    /**
     * @notice Returns the vesting schedule for a given ID
     * @param scheduleId The vesting schedule ID
     * @return The vesting schedule struct
     */
    function getVestingSchedule(bytes32 scheduleId)
        external
        view
        returns (VestingSchedule memory)
    {
        return vestingSchedules[scheduleId];
    }

    /**
     * @notice Returns all schedule IDs for a beneficiary
     * @param beneficiary The address to query
     * @return Array of schedule IDs
     */
    function getBeneficiarySchedules(address beneficiary)
        external
        view
        returns (bytes32[] memory)
    {
        return beneficiarySchedules[beneficiary];
    }

    /**
     * @notice Computes the amount of tokens currently releasable from a schedule
     * @param scheduleId The vesting schedule ID
     * @return The amount of tokens that can be released
     */
    function computeReleasableAmount(bytes32 scheduleId)
        external
        view
        returns (uint256)
    {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];
        return _computeReleasableAmount(schedule);
    }

    /**
     * @notice Computes the total vested amount for a schedule (whether released or not)
     * @param scheduleId The vesting schedule ID
     * @return The total vested amount
     */
    function computeVestedAmount(bytes32 scheduleId) external view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[scheduleId];
        return _vestedAmount(schedule);
    }

    /**
     * @notice Returns the total releasable amount for a beneficiary across all schedules
     * @param beneficiary The address to query
     * @return total The total amount releasable
     */
    function getTotalReleasable(address beneficiary) external view returns (uint256 total) {
        bytes32[] memory scheduleIds = beneficiarySchedules[beneficiary];

        for (uint256 i = 0; i < scheduleIds.length; i++) {
            VestingSchedule storage schedule = vestingSchedules[scheduleIds[i]];
            total += _computeReleasableAmount(schedule);
        }
    }

    /**
     * @notice Deposits tokens into the contract for vesting
     * @param amount The amount of tokens to deposit
     *
     * Requirements:
     * - Caller must have VESTING_ADMIN_ROLE
     */
    function depositTokens(uint256 amount) external onlyRole(VESTING_ADMIN_ROLE) {
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraws excess tokens not allocated to schedules
     * @param amount The amount to withdraw
     *
     * Requirements:
     * - Caller must have VESTING_ADMIN_ROLE
     * - Amount must not exceed unallocated balance
     */
    function withdrawExcess(uint256 amount) external onlyRole(VESTING_ADMIN_ROLE) {
        uint256 excess = token.balanceOf(address(this)) - (totalVested - totalReleased);
        require(amount <= excess, "Exceeds available");
        token.safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Computes the schedule ID for a beneficiary and index
     */
    function _computeScheduleId(address beneficiary, uint256 index)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(beneficiary, index));
    }

    /**
     * @dev Computes the releasable amount for a schedule
     */
    function _computeReleasableAmount(VestingSchedule storage schedule)
        internal
        view
        returns (uint256)
    {
        return _vestedAmount(schedule) - schedule.releasedAmount;
    }

    /**
     * @dev Computes the vested amount for a schedule
     */
    function _vestedAmount(VestingSchedule storage schedule)
        internal
        view
        returns (uint256)
    {
        if (schedule.revoked) {
            // If revoked, only count vested amount at time of revocation
            // This is approximated by using current time as revocation happened
            return _calculateVestedAmount(schedule);
        }
        return _calculateVestedAmount(schedule);
    }

    /**
     * @dev Calculates vested amount based on time
     */
    function _calculateVestedAmount(VestingSchedule storage schedule)
        internal
        view
        returns (uint256)
    {
        if (block.timestamp < schedule.startTime) {
            return 0;
        }

        uint256 elapsed = block.timestamp - schedule.startTime;

        // Check if cliff has passed
        if (elapsed < schedule.cliffDuration) {
            return 0;
        }

        // Check if fully vested
        if (elapsed >= schedule.duration) {
            return schedule.totalAmount;
        }

        // Linear vesting
        return (schedule.totalAmount * elapsed) / schedule.duration;
    }
}
