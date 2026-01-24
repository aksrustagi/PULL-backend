/**
 * PULL Token Service
 * Service for interacting with PULL token and staking contracts
 */

import { ethers } from "ethers";
import type {
  TokenInfo,
  TokenBalance,
  TokenAllowance,
  StakeInfo,
  StakingStats,
  TransactionResult,
  TransactionReceipt,
  NetworkConfig,
} from "./types";
import {
  PULL_TOKEN_ABI,
  PULL_STAKING_ABI,
  TokenServiceError,
  TOKEN_ERRORS,
  NETWORKS,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

export interface PullTokenServiceConfig {
  network: keyof typeof NETWORKS | NetworkConfig;
  signerPrivateKey?: string;
  fireblocksVaultId?: string; // For Fireblocks signer integration
  gasMultiplier?: number;
  maxRetries?: number;
  logger?: Logger;
}

interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// PULL Token Service
// ============================================================================

export class PullTokenService {
  private readonly provider: ethers.JsonRpcProvider;
  private readonly signer: ethers.Wallet | null;
  private readonly tokenContract: ethers.Contract;
  private readonly stakingContract: ethers.Contract;
  private readonly networkConfig: NetworkConfig;
  private readonly gasMultiplier: number;
  private readonly maxRetries: number;
  private readonly logger: Logger;

  constructor(config: PullTokenServiceConfig) {
    this.networkConfig =
      typeof config.network === "string" ? NETWORKS[config.network] : config.network;

    if (!this.networkConfig) {
      throw new TokenServiceError("Invalid network", "INVALID_NETWORK");
    }

    this.provider = new ethers.JsonRpcProvider(this.networkConfig.rpcUrl);

    // Setup signer if private key provided
    this.signer = config.signerPrivateKey
      ? new ethers.Wallet(config.signerPrivateKey, this.provider)
      : null;

    // Initialize contracts
    const signerOrProvider = this.signer || this.provider;

    this.tokenContract = new ethers.Contract(
      this.networkConfig.tokenAddress,
      PULL_TOKEN_ABI,
      signerOrProvider
    );

    this.stakingContract = new ethers.Contract(
      this.networkConfig.stakingAddress,
      PULL_STAKING_ABI,
      signerOrProvider
    );

    this.gasMultiplier = config.gasMultiplier ?? 1.2;
    this.maxRetries = config.maxRetries ?? 3;
    this.logger = config.logger ?? this.createDefaultLogger();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[PullToken] ${msg}`, meta),
      info: (msg, meta) => console.info(`[PullToken] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[PullToken] ${msg}`, meta),
      error: (msg, meta) => console.error(`[PullToken] ${msg}`, meta),
    };
  }

  // ==========================================================================
  // Token Info Methods
  // ==========================================================================

  /**
   * Get token information
   */
  async getTokenInfo(): Promise<TokenInfo> {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      this.tokenContract.name(),
      this.tokenContract.symbol(),
      this.tokenContract.decimals(),
      this.tokenContract.totalSupply(),
    ]);

    return {
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: BigInt(totalSupply),
      contractAddress: this.networkConfig.tokenAddress,
      chainId: this.networkConfig.chainId,
    };
  }

  /**
   * Get token balance for an address
   */
  async getBalance(address: string): Promise<TokenBalance> {
    if (!ethers.isAddress(address)) {
      throw new TokenServiceError("Invalid address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const balance = await this.tokenContract.balanceOf(address);
    const decimals = await this.tokenContract.decimals();

    return {
      address,
      balance: BigInt(balance),
      balanceFormatted: ethers.formatUnits(balance, decimals),
    };
  }

  /**
   * Get token allowance
   */
  async getAllowance(owner: string, spender: string): Promise<TokenAllowance> {
    if (!ethers.isAddress(owner) || !ethers.isAddress(spender)) {
      throw new TokenServiceError("Invalid address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const allowance = await this.tokenContract.allowance(owner, spender);
    const decimals = await this.tokenContract.decimals();

    return {
      owner,
      spender,
      allowance: BigInt(allowance),
      allowanceFormatted: ethers.formatUnits(allowance, decimals),
    };
  }

  // ==========================================================================
  // Token Transfer Methods
  // ==========================================================================

  /**
   * Transfer tokens
   */
  async transfer(to: string, amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    if (!ethers.isAddress(to)) {
      throw new TokenServiceError("Invalid recipient address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    this.logger.info("Transferring tokens", {
      to,
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.tokenContract.transfer.estimateGas(to, parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.tokenContract.transfer(to, parsedAmount, { gasLimit });
    });

    this.logger.info("Transfer submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  /**
   * Approve token spending
   */
  async approve(spender: string, amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    if (!ethers.isAddress(spender)) {
      throw new TokenServiceError("Invalid spender address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    this.logger.info("Approving tokens", {
      spender,
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.tokenContract.approve.estimateGas(spender, parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.tokenContract.approve(spender, parsedAmount, { gasLimit });
    });

    this.logger.info("Approval submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  // ==========================================================================
  // Admin Methods (Mint/Burn)
  // ==========================================================================

  /**
   * Mint new tokens (admin only)
   */
  async mint(to: string, amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    if (!ethers.isAddress(to)) {
      throw new TokenServiceError("Invalid recipient address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    this.logger.info("Minting tokens", {
      to,
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.tokenContract.mint.estimateGas(to, parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.tokenContract.mint(to, parsedAmount, { gasLimit });
    });

    this.logger.info("Mint submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  /**
   * Burn tokens
   */
  async burn(amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    this.logger.info("Burning tokens", {
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.tokenContract.burn.estimateGas(parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.tokenContract.burn(parsedAmount, { gasLimit });
    });

    this.logger.info("Burn submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  // ==========================================================================
  // Staking Methods
  // ==========================================================================

  /**
   * Stake PULL tokens
   */
  async stake(amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    // Check if approval is needed
    const signerAddress = await this.signer!.getAddress();
    const allowance = await this.getAllowance(signerAddress, this.networkConfig.stakingAddress);

    if (allowance.allowance < parsedAmount) {
      this.logger.info("Approving staking contract");
      // Approve only the required amount plus 10% buffer, never unlimited
      const approvalAmount = (parsedAmount * 110n) / 100n;
      const approveTx = await this.approve(
        this.networkConfig.stakingAddress,
        approvalAmount.toString()
      );
      await approveTx.wait();
    }

    this.logger.info("Staking tokens", {
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.stakingContract.stake.estimateGas(parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.stakingContract.stake(parsedAmount, { gasLimit });
    });

    this.logger.info("Stake submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  /**
   * Unstake PULL tokens
   */
  async unstake(amount: bigint | string): Promise<TransactionResult> {
    this.requireSigner();

    const parsedAmount = typeof amount === "string" ? ethers.parseUnits(amount, 18) : amount;

    this.logger.info("Unstaking tokens", {
      amount: parsedAmount.toString(),
    });

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.stakingContract.unstake.estimateGas(parsedAmount);
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.stakingContract.unstake(parsedAmount, { gasLimit });
    });

    this.logger.info("Unstake submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  /**
   * Get stake info for an address
   */
  async getStakeInfo(address: string): Promise<StakeInfo> {
    if (!ethers.isAddress(address)) {
      throw new TokenServiceError("Invalid address", TOKEN_ERRORS.INVALID_ADDRESS);
    }

    const [stakedAmount, earnedRewards] = await Promise.all([
      this.stakingContract.balanceOf(address),
      this.stakingContract.earned(address),
    ]);

    // Try to get detailed stake info if available
    let stakeTimestamp = 0;
    try {
      const info = await this.stakingContract.getStakeInfo(address);
      stakeTimestamp = Number(info.stakeTimestamp);
    } catch {
      // Contract may not have this method
    }

    const now = Math.floor(Date.now() / 1000);

    return {
      address,
      stakedAmount: BigInt(stakedAmount),
      stakedAmountFormatted: ethers.formatUnits(stakedAmount, 18),
      earnedRewards: BigInt(earnedRewards),
      earnedRewardsFormatted: ethers.formatUnits(earnedRewards, 18),
      stakeTimestamp,
      stakeDuration: stakeTimestamp > 0 ? now - stakeTimestamp : 0,
    };
  }

  /**
   * Claim staking rewards
   */
  async claimRewards(): Promise<TransactionResult> {
    this.requireSigner();

    this.logger.info("Claiming rewards");

    const tx = await this.executeWithRetry(async () => {
      const gasEstimate = await this.stakingContract.claimRewards.estimateGas();
      const gasLimit = (gasEstimate * BigInt(Math.floor(this.gasMultiplier * 100))) / 100n;

      return this.stakingContract.claimRewards({ gasLimit });
    });

    this.logger.info("Claim submitted", { hash: tx.hash });

    return {
      hash: tx.hash,
      wait: () => this.waitForTransaction(tx),
    };
  }

  /**
   * Get staking statistics
   */
  async getStakingStats(): Promise<StakingStats> {
    const [totalStaked, rewardRate, rewardPerToken] = await Promise.all([
      this.stakingContract.totalSupply(),
      this.stakingContract.rewardRate(),
      this.stakingContract.rewardPerToken(),
    ]);

    return {
      totalStaked: BigInt(totalStaked),
      totalStakedFormatted: ethers.formatUnits(totalStaked, 18),
      rewardRate: BigInt(rewardRate),
      rewardPerToken: BigInt(rewardPerToken),
      periodFinish: 0, // Would need to add this to contract
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private requireSigner(): void {
    if (!this.signer) {
      throw new TokenServiceError(
        "Signer required for this operation",
        TOKEN_ERRORS.UNAUTHORIZED
      );
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Attempt ${attempt + 1} failed`, {
          error: lastError.message,
        });

        // Don't retry on certain errors
        if (
          lastError.message.includes("insufficient funds") ||
          lastError.message.includes("nonce")
        ) {
          throw error;
        }

        // Wait before retry with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        );
      }
    }

    throw lastError;
  }

  private async waitForTransaction(tx: ethers.TransactionResponse): Promise<TransactionReceipt> {
    const receipt = await tx.wait();

    if (!receipt) {
      throw new TokenServiceError("Transaction failed", TOKEN_ERRORS.TRANSFER_FAILED);
    }

    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status ?? 0,
      gasUsed: receipt.gasUsed,
      effectiveGasPrice: receipt.gasPrice ?? 0n,
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
      })),
    };
  }

  /**
   * Get signer address
   */
  getSignerAddress(): string | null {
    return this.signer?.address ?? null;
  }

  /**
   * Get network config
   */
  getNetworkConfig(): NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Check if contract is paused
   */
  async isPaused(): Promise<boolean> {
    try {
      return await this.tokenContract.paused();
    } catch {
      return false; // Contract may not have pause functionality
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  /**
   * Get gas price
   */
  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice ?? 0n;
  }
}

export default PullTokenService;
