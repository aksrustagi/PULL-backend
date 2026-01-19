// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title PullRewardsNFT
 * @dev ERC1155 NFTs for PULL rewards, achievements, and collectibles
 *
 * Token Types:
 * - 1-999: Achievement badges
 * - 1000-9999: Referral rewards
 * - 10000-99999: Trading milestones
 * - 100000+: Special event NFTs
 */
contract PullRewardsNFT is
    ERC1155,
    ERC1155Burnable,
    ERC1155Supply,
    AccessControl,
    Pausable
{
    using Strings for uint256;

    // =============================================================================
    // CONSTANTS & ROLES
    // =============================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    // Token type ranges
    uint256 public constant ACHIEVEMENT_START = 1;
    uint256 public constant ACHIEVEMENT_END = 999;
    uint256 public constant REFERRAL_START = 1000;
    uint256 public constant REFERRAL_END = 9999;
    uint256 public constant MILESTONE_START = 10000;
    uint256 public constant MILESTONE_END = 99999;
    uint256 public constant SPECIAL_START = 100000;

    // =============================================================================
    // STATE
    // =============================================================================

    string public name = "PULL Rewards";
    string public symbol = "PULL-NFT";
    string private _baseURI;

    // Token metadata
    struct TokenInfo {
        string name;
        string description;
        uint256 maxSupply; // 0 = unlimited
        bool transferable;
        uint256 pointsValue; // Points awarded when earned
    }

    mapping(uint256 => TokenInfo) public tokenInfo;
    mapping(address => mapping(uint256 => bool)) public hasEarned; // Track if user has earned an achievement

    // =============================================================================
    // EVENTS
    // =============================================================================

    event TokenTypeCreated(
        uint256 indexed tokenId,
        string name,
        uint256 maxSupply,
        bool transferable
    );
    event AchievementUnlocked(
        address indexed user,
        uint256 indexed tokenId,
        string name
    );

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor(string memory baseURI) ERC1155(baseURI) {
        _baseURI = baseURI;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(URI_SETTER_ROLE, msg.sender);

        // Initialize some achievement types
        _createTokenType(1, "Early Adopter", "Joined PULL during beta", 0, false, 100);
        _createTokenType(2, "First Trade", "Completed first trade", 0, false, 50);
        _createTokenType(3, "Prediction Pro", "Won 10 prediction markets", 0, false, 200);
        _createTokenType(4, "Collector", "Purchased first RWA", 0, false, 150);
        _createTokenType(5, "Social Butterfly", "Invited 5 friends", 0, false, 250);
        _createTokenType(6, "Streak Master", "30-day login streak", 0, false, 300);
        _createTokenType(7, "Diamond Hands", "Held position for 30 days", 0, false, 100);
        _createTokenType(8, "Whale Watcher", "Traded over $10,000", 0, false, 500);

        // Referral rewards
        _createTokenType(1000, "Referral Bronze", "Referred 1 user", 0, true, 100);
        _createTokenType(1001, "Referral Silver", "Referred 5 users", 0, true, 300);
        _createTokenType(1002, "Referral Gold", "Referred 25 users", 0, true, 1000);
        _createTokenType(1003, "Referral Platinum", "Referred 100 users", 0, true, 5000);
    }

    // =============================================================================
    // TOKEN MANAGEMENT
    // =============================================================================

    /**
     * @dev Create a new token type
     */
    function createTokenType(
        uint256 tokenId,
        string memory tokenName,
        string memory description,
        uint256 maxSupply,
        bool transferable,
        uint256 pointsValue
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _createTokenType(tokenId, tokenName, description, maxSupply, transferable, pointsValue);
    }

    function _createTokenType(
        uint256 tokenId,
        string memory tokenName,
        string memory description,
        uint256 maxSupply,
        bool transferable,
        uint256 pointsValue
    ) internal {
        require(bytes(tokenInfo[tokenId].name).length == 0, "PullRewardsNFT: token exists");

        tokenInfo[tokenId] = TokenInfo({
            name: tokenName,
            description: description,
            maxSupply: maxSupply,
            transferable: transferable,
            pointsValue: pointsValue
        });

        emit TokenTypeCreated(tokenId, tokenName, maxSupply, transferable);
    }

    // =============================================================================
    // MINTING
    // =============================================================================

    /**
     * @dev Mint a reward NFT to a user
     */
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        TokenInfo memory info = tokenInfo[tokenId];
        require(bytes(info.name).length > 0, "PullRewardsNFT: token type not defined");

        if (info.maxSupply > 0) {
            require(
                totalSupply(tokenId) + amount <= info.maxSupply,
                "PullRewardsNFT: exceeds max supply"
            );
        }

        _mint(to, tokenId, amount, data);

        // Track achievement unlock
        if (tokenId >= ACHIEVEMENT_START && tokenId <= ACHIEVEMENT_END) {
            if (!hasEarned[to][tokenId]) {
                hasEarned[to][tokenId] = true;
                emit AchievementUnlocked(to, tokenId, info.name);
            }
        }
    }

    /**
     * @dev Batch mint multiple token types
     */
    function mintBatch(
        address to,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            TokenInfo memory info = tokenInfo[tokenIds[i]];
            require(bytes(info.name).length > 0, "PullRewardsNFT: token type not defined");

            if (info.maxSupply > 0) {
                require(
                    totalSupply(tokenIds[i]) + amounts[i] <= info.maxSupply,
                    "PullRewardsNFT: exceeds max supply"
                );
            }
        }

        _mintBatch(to, tokenIds, amounts, data);
    }

    /**
     * @dev Mint achievement if user qualifies (one per user)
     */
    function mintAchievement(
        address to,
        uint256 tokenId
    ) external onlyRole(MINTER_ROLE) {
        require(tokenId >= ACHIEVEMENT_START && tokenId <= ACHIEVEMENT_END, "PullRewardsNFT: not an achievement");
        require(!hasEarned[to][tokenId], "PullRewardsNFT: already earned");

        mint(to, tokenId, 1, "");
    }

    // =============================================================================
    // URI
    // =============================================================================

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(_baseURI, tokenId.toString(), ".json"));
    }

    function setBaseURI(string memory newBaseURI) external onlyRole(URI_SETTER_ROLE) {
        _baseURI = newBaseURI;
    }

    // =============================================================================
    // TRANSFER RESTRICTIONS
    // =============================================================================

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) whenNotPaused {
        // Check transferability for each token
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                require(
                    tokenInfo[ids[i]].transferable,
                    "PullRewardsNFT: token not transferable"
                );
            }
        }

        super._update(from, to, ids, values);
    }

    // =============================================================================
    // VIEW FUNCTIONS
    // =============================================================================

    /**
     * @dev Check if user has earned a specific achievement
     */
    function hasAchievement(address user, uint256 tokenId) external view returns (bool) {
        return hasEarned[user][tokenId];
    }

    /**
     * @dev Get all achievements for a user
     */
    function getUserAchievements(address user) external view returns (uint256[] memory) {
        uint256 count = 0;

        // Count achievements
        for (uint256 i = ACHIEVEMENT_START; i <= ACHIEVEMENT_END; i++) {
            if (hasEarned[user][i]) count++;
        }

        // Build array
        uint256[] memory achievements = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = ACHIEVEMENT_START; i <= ACHIEVEMENT_END; i++) {
            if (hasEarned[user][i]) {
                achievements[index] = i;
                index++;
            }
        }

        return achievements;
    }

    /**
     * @dev Get token type category
     */
    function getTokenCategory(uint256 tokenId) external pure returns (string memory) {
        if (tokenId >= ACHIEVEMENT_START && tokenId <= ACHIEVEMENT_END) return "achievement";
        if (tokenId >= REFERRAL_START && tokenId <= REFERRAL_END) return "referral";
        if (tokenId >= MILESTONE_START && tokenId <= MILESTONE_END) return "milestone";
        if (tokenId >= SPECIAL_START) return "special";
        return "unknown";
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
    // SUPPORTSINTERFACE
    // =============================================================================

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
