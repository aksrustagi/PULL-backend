// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PullToken
 * @author PULL Team
 * @notice The official PULL token - ERC-20 with minting, burning, pausing, and permit capabilities
 * @dev Implements role-based access control for minting and pausing operations
 *
 * Token Economics:
 * - Max Supply: 1,000,000,000 (1 billion) PULL tokens
 * - Initial Mint: 10% (100,000,000) minted to deployer for initial distribution
 * - Decimals: 18 (standard ERC-20)
 *
 * Roles:
 * - DEFAULT_ADMIN_ROLE: Can grant/revoke roles
 * - MINTER_ROLE: Can mint new tokens up to max supply
 * - PAUSER_ROLE: Can pause/unpause token transfers
 */
contract PullToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl, Pausable {
    /// @notice Role identifier for addresses that can mint new tokens
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Role identifier for addresses that can pause/unpause transfers
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Maximum token supply (1 billion tokens with 18 decimals)
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Initial supply minted at deployment (10% of max supply)
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10 ** 18;

    /// @dev Emitted when tokens are minted
    event TokensMinted(address indexed to, uint256 amount, address indexed minter);

    /// @dev Emitted when the contract is paused
    event TransfersPaused(address indexed pauser);

    /// @dev Emitted when the contract is unpaused
    event TransfersUnpaused(address indexed pauser);

    /**
     * @dev Error thrown when minting would exceed max supply
     * @param requested The amount requested to mint
     * @param available The amount available to mint
     */
    error ExceedsMaxSupply(uint256 requested, uint256 available);

    /**
     * @dev Error thrown when amount is zero
     */
    error ZeroAmount();

    /**
     * @dev Error thrown when address is zero
     */
    error ZeroAddress();

    /**
     * @notice Deploys the PULL token contract
     * @dev Mints initial 10% supply to the deployer and sets up roles
     *
     * The deployer receives:
     * - DEFAULT_ADMIN_ROLE: Full administrative control
     * - MINTER_ROLE: Ability to mint new tokens
     * - PAUSER_ROLE: Ability to pause/unpause transfers
     * - Initial 10% token supply (100M PULL)
     */
    constructor() ERC20("PULL", "PULL") ERC20Permit("PULL") {
        // Grant roles to deployer
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        // Mint initial 10% supply to deployer for initial distribution
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @notice Mints new PULL tokens to a specified address
     * @dev Only callable by addresses with MINTER_ROLE
     * @param to The address to receive the minted tokens
     * @param amount The amount of tokens to mint (in wei, 18 decimals)
     *
     * Requirements:
     * - Caller must have MINTER_ROLE
     * - `to` cannot be zero address
     * - `amount` must be greater than zero
     * - Total supply after minting must not exceed MAX_SUPPLY
     *
     * Emits a {TokensMinted} event
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 available = MAX_SUPPLY - totalSupply();
        if (amount > available) {
            revert ExceedsMaxSupply(amount, available);
        }

        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    /**
     * @notice Pauses all token transfers
     * @dev Only callable by addresses with PAUSER_ROLE
     *
     * While paused:
     * - No transfers can occur (including minting and burning)
     * - Approvals can still be made
     *
     * Requirements:
     * - Caller must have PAUSER_ROLE
     * - Contract must not already be paused
     *
     * Emits a {TransfersPaused} event
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
        emit TransfersPaused(msg.sender);
    }

    /**
     * @notice Unpauses token transfers
     * @dev Only callable by addresses with PAUSER_ROLE
     *
     * Requirements:
     * - Caller must have PAUSER_ROLE
     * - Contract must be paused
     *
     * Emits a {TransfersUnpaused} event
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
        emit TransfersUnpaused(msg.sender);
    }

    /**
     * @notice Returns the remaining amount of tokens that can be minted
     * @return The number of tokens available for minting
     */
    function mintableSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    /**
     * @notice Hook that is called before any token transfer
     * @dev Overrides ERC20 _update to add pause functionality
     * @param from The address tokens are transferred from
     * @param to The address tokens are transferred to
     * @param value The amount of tokens being transferred
     *
     * Requirements:
     * - Contract must not be paused
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }

    /**
     * @notice Checks if the contract supports a given interface
     * @dev Overrides AccessControl supportsInterface
     * @param interfaceId The interface identifier to check
     * @return True if the interface is supported
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
