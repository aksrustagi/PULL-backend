/**
 * PULL Token Types
 * Type definitions for PULL token service
 */

// ============================================================================
// Contract ABIs
// ============================================================================

export const PULL_TOKEN_ABI = [
  // ERC20 Standard
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",

  // Mintable/Burnable
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function burnFrom(address account, uint256 amount)",

  // Pausable
  "function paused() view returns (bool)",
  "function pause()",
  "function unpause()",

  // Access Control
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  "function revokeRole(bytes32 role, address account)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Paused(address account)",
  "event Unpaused(address account)",
];

export const PULL_STAKING_ABI = [
  // Staking
  "function stake(uint256 amount)",
  "function unstake(uint256 amount)",
  "function claimRewards()",
  "function exit()",

  // View functions
  "function balanceOf(address account) view returns (uint256)",
  "function earned(address account) view returns (uint256)",
  "function getRewardForDuration() view returns (uint256)",
  "function lastTimeRewardApplicable() view returns (uint256)",
  "function rewardPerToken() view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function stakingToken() view returns (address)",
  "function rewardsToken() view returns (address)",

  // Stake info
  "function getStakeInfo(address account) view returns (uint256 stakedAmount, uint256 earnedRewards, uint256 stakeTimestamp)",

  // Admin
  "function notifyRewardAmount(uint256 reward)",
  "function setRewardsDuration(uint256 duration)",
  "function recoverERC20(address tokenAddress, uint256 tokenAmount)",

  // Events
  "event Staked(address indexed user, uint256 amount)",
  "event Withdrawn(address indexed user, uint256 amount)",
  "event RewardPaid(address indexed user, uint256 reward)",
  "event RewardAdded(uint256 reward)",
  "event RewardsDurationUpdated(uint256 newDuration)",
  "event Recovered(address token, uint256 amount)",
];

// ============================================================================
// Token Info Types
// ============================================================================

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  contractAddress: string;
  chainId: number;
}

export interface TokenBalance {
  address: string;
  balance: bigint;
  balanceFormatted: string;
}

export interface TokenAllowance {
  owner: string;
  spender: string;
  allowance: bigint;
  allowanceFormatted: string;
}

// ============================================================================
// Staking Types
// ============================================================================

export interface StakeInfo {
  address: string;
  stakedAmount: bigint;
  stakedAmountFormatted: string;
  earnedRewards: bigint;
  earnedRewardsFormatted: string;
  stakeTimestamp: number;
  stakeDuration: number; // seconds
}

export interface StakingStats {
  totalStaked: bigint;
  totalStakedFormatted: string;
  rewardRate: bigint;
  rewardPerToken: bigint;
  periodFinish: number;
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface TokenTransaction {
  hash: string;
  from: string;
  to: string;
  amount: bigint;
  amountFormatted: string;
  timestamp: number;
  blockNumber: number;
  status: "pending" | "confirmed" | "failed";
  type: "transfer" | "mint" | "burn" | "stake" | "unstake" | "claim";
}

export interface TransactionResult {
  hash: string;
  wait: () => Promise<TransactionReceipt>;
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  status: number; // 1 = success, 0 = failure
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

// ============================================================================
// Event Types
// ============================================================================

export interface TransferEvent {
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface ApprovalEvent {
  owner: string;
  spender: string;
  value: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface StakedEvent {
  user: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface WithdrawnEvent {
  user: string;
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
}

export interface RewardPaidEvent {
  user: string;
  reward: bigint;
  blockNumber: number;
  transactionHash: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class TokenServiceError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TokenServiceError";
    this.code = code;
    this.details = details;
  }
}

// Error codes
export const TOKEN_ERRORS = {
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INSUFFICIENT_ALLOWANCE: "INSUFFICIENT_ALLOWANCE",
  TRANSFER_FAILED: "TRANSFER_FAILED",
  APPROVAL_FAILED: "APPROVAL_FAILED",
  MINT_FAILED: "MINT_FAILED",
  BURN_FAILED: "BURN_FAILED",
  STAKE_FAILED: "STAKE_FAILED",
  UNSTAKE_FAILED: "UNSTAKE_FAILED",
  CLAIM_FAILED: "CLAIM_FAILED",
  CONTRACT_PAUSED: "CONTRACT_PAUSED",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_ADDRESS: "INVALID_ADDRESS",
  NETWORK_ERROR: "NETWORK_ERROR",
  GAS_ESTIMATION_FAILED: "GAS_ESTIMATION_FAILED",
  TRANSACTION_TIMEOUT: "TRANSACTION_TIMEOUT",
} as const;

// ============================================================================
// Role Constants
// ============================================================================

export const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
  MINTER_ROLE: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6", // keccak256("MINTER_ROLE")
  PAUSER_ROLE: "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a", // keccak256("PAUSER_ROLE")
  BURNER_ROLE: "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848", // keccak256("BURNER_ROLE")
} as const;

// ============================================================================
// Network Configuration
// ============================================================================

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  tokenAddress: string;
  stakingAddress: string;
}

function requireEnvOrThrow(key: string, network: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `FATAL: ${key} is required for ${network} network. ` +
      "Set this environment variable in your deployment configuration."
    );
  }
  return value;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: process.env.ETH_MAINNET_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/",
    blockExplorer: "https://etherscan.io",
    get tokenAddress() { return requireEnvOrThrow("PULL_TOKEN_MAINNET", "mainnet"); },
    get stakingAddress() { return requireEnvOrThrow("PULL_STAKING_MAINNET", "mainnet"); },
  },
  polygon: {
    chainId: 137,
    name: "Polygon Mainnet",
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/",
    blockExplorer: "https://polygonscan.com",
    get tokenAddress() { return requireEnvOrThrow("PULL_TOKEN_POLYGON", "polygon"); },
    get stakingAddress() { return requireEnvOrThrow("PULL_STAKING_POLYGON", "polygon"); },
  },
  base: {
    chainId: 8453,
    name: "Base Mainnet",
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    blockExplorer: "https://basescan.org",
    get tokenAddress() { return requireEnvOrThrow("PULL_TOKEN_BASE", "base"); },
    get stakingAddress() { return requireEnvOrThrow("PULL_STAKING_BASE", "base"); },
  },
  sepolia: {
    chainId: 11155111,
    name: "Sepolia Testnet",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/",
    blockExplorer: "https://sepolia.etherscan.io",
    get tokenAddress() { return requireEnvOrThrow("PULL_TOKEN_SEPOLIA", "sepolia"); },
    get stakingAddress() { return requireEnvOrThrow("PULL_STAKING_SEPOLIA", "sepolia"); },
  },
};
