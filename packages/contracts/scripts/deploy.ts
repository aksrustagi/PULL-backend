import { ethers, run, network } from "hardhat";
import { PullToken, PullStaking, PullVesting, PullRewards } from "../typechain-types";

/**
 * Deployment configuration
 */
interface DeploymentConfig {
  // Staking config
  stakingRewardRate: bigint; // Basis points (e.g., 1000 = 10% APY)
  stakingEmergencyPenalty: bigint; // Basis points (e.g., 1000 = 10%)
  stakingMinAmount: bigint; // Minimum stake in wei

  // Rewards config
  rewardsConversionRate: bigint; // Tokens per 1000 points
  rewardsCooldownPeriod: bigint; // Seconds
  rewardsMaxConversion: bigint; // Max points per conversion
  rewardsDailyLimit: bigint; // Max points per day
}

/**
 * Deployment result
 */
interface DeploymentResult {
  pullToken: string;
  pullStaking: string;
  pullVesting: string;
  pullRewards: string;
  deployer: string;
  network: string;
  chainId: number;
  blockNumber: number;
}

/**
 * Default deployment configuration
 */
const defaultConfig: DeploymentConfig = {
  // 10% APY base rate
  stakingRewardRate: 1000n,
  // 10% emergency withdrawal penalty
  stakingEmergencyPenalty: 1000n,
  // Minimum stake of 100 PULL tokens
  stakingMinAmount: ethers.parseEther("100"),

  // 1 PULL token per 1000 points (1:1 ratio)
  rewardsConversionRate: 1000n,
  // 24 hour cooldown between conversions
  rewardsCooldownPeriod: 86400n,
  // Max 10,000 points per conversion
  rewardsMaxConversion: 10000n,
  // Max 50,000 points per day
  rewardsDailyLimit: 50000n,
};

/**
 * Waits for a specified number of block confirmations
 */
async function waitForConfirmations(txHash: string, confirmations: number = 5): Promise<void> {
  console.log(`  Waiting for ${confirmations} confirmations...`);
  const receipt = await ethers.provider.waitForTransaction(txHash, confirmations);
  if (!receipt) {
    throw new Error("Transaction receipt not found");
  }
  console.log(`  ✓ Confirmed at block ${receipt.blockNumber}`);
}

/**
 * Verifies a contract on the block explorer
 */
async function verifyContract(
  address: string,
  constructorArguments: unknown[],
  contractName: string
): Promise<void> {
  // Skip verification on local networks
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log(`  Skipping verification for ${contractName} (local network)`);
    return;
  }

  console.log(`  Verifying ${contractName}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`  ✓ ${contractName} verified`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("Already Verified")) {
      console.log(`  ✓ ${contractName} already verified`);
    } else {
      console.error(`  ✗ Failed to verify ${contractName}:`, errorMessage);
    }
  }
}

/**
 * Main deployment function
 */
async function deploy(config: DeploymentConfig = defaultConfig): Promise<DeploymentResult> {
  console.log("\n🚀 PULL Token Ecosystem Deployment\n");
  console.log("=".repeat(50));

  // Get deployer
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log(`Network: ${network.name}`);
  console.log(`Chain ID: ${network.config.chainId}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH/MATIC\n`);

  // Check minimum balance
  const minBalance = ethers.parseEther("0.1");
  if (balance < minBalance && network.name !== "hardhat" && network.name !== "localhost") {
    throw new Error(`Insufficient balance. Need at least ${ethers.formatEther(minBalance)} ETH/MATIC`);
  }

  const deployedContracts: DeploymentResult = {
    pullToken: "",
    pullStaking: "",
    pullVesting: "",
    pullRewards: "",
    deployer: deployerAddress,
    network: network.name,
    chainId: Number(network.config.chainId),
    blockNumber: 0,
  };

  // 1. Deploy PullToken
  console.log("1. Deploying PullToken...");
  const PullToken = await ethers.getContractFactory("PullToken");
  const pullToken = await PullToken.deploy() as unknown as PullToken;
  await pullToken.waitForDeployment();
  const pullTokenAddress = await pullToken.getAddress();
  deployedContracts.pullToken = pullTokenAddress;
  console.log(`  ✓ PullToken deployed at: ${pullTokenAddress}`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await waitForConfirmations(pullToken.deploymentTransaction()!.hash);
  }

  // 2. Deploy PullStaking
  console.log("\n2. Deploying PullStaking...");
  const PullStaking = await ethers.getContractFactory("PullStaking");
  const pullStaking = await PullStaking.deploy(
    pullTokenAddress,
    config.stakingRewardRate,
    config.stakingEmergencyPenalty,
    config.stakingMinAmount
  ) as unknown as PullStaking;
  await pullStaking.waitForDeployment();
  const pullStakingAddress = await pullStaking.getAddress();
  deployedContracts.pullStaking = pullStakingAddress;
  console.log(`  ✓ PullStaking deployed at: ${pullStakingAddress}`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await waitForConfirmations(pullStaking.deploymentTransaction()!.hash);
  }

  // 3. Deploy PullVesting
  console.log("\n3. Deploying PullVesting...");
  const PullVesting = await ethers.getContractFactory("PullVesting");
  const pullVesting = await PullVesting.deploy(pullTokenAddress) as unknown as PullVesting;
  await pullVesting.waitForDeployment();
  const pullVestingAddress = await pullVesting.getAddress();
  deployedContracts.pullVesting = pullVestingAddress;
  console.log(`  ✓ PullVesting deployed at: ${pullVestingAddress}`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await waitForConfirmations(pullVesting.deploymentTransaction()!.hash);
  }

  // 4. Deploy PullRewards
  console.log("\n4. Deploying PullRewards...");
  const PullRewards = await ethers.getContractFactory("PullRewards");
  const pullRewards = await PullRewards.deploy(
    pullTokenAddress,
    config.rewardsConversionRate,
    config.rewardsCooldownPeriod,
    config.rewardsMaxConversion,
    config.rewardsDailyLimit
  ) as unknown as PullRewards;
  await pullRewards.waitForDeployment();
  const pullRewardsAddress = await pullRewards.getAddress();
  deployedContracts.pullRewards = pullRewardsAddress;
  console.log(`  ✓ PullRewards deployed at: ${pullRewardsAddress}`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    await waitForConfirmations(pullRewards.deploymentTransaction()!.hash);
  }

  // 5. Configure Roles
  console.log("\n5. Configuring roles...");

  // Grant MINTER_ROLE to staking and vesting contracts (so they can mint rewards)
  const MINTER_ROLE = await pullToken.MINTER_ROLE();

  console.log("  Granting MINTER_ROLE to PullStaking...");
  const tx1 = await pullToken.grantRole(MINTER_ROLE, pullStakingAddress);
  await tx1.wait();
  console.log(`  ✓ MINTER_ROLE granted to PullStaking`);

  // Note: Vesting and Rewards contracts receive tokens transferred by admin
  // They don't need MINTER_ROLE as they distribute from their balance

  // Get current block number
  deployedContracts.blockNumber = await ethers.provider.getBlockNumber();

  // 6. Verify contracts on block explorer
  console.log("\n6. Verifying contracts...");
  await verifyContract(pullTokenAddress, [], "PullToken");
  await verifyContract(pullStakingAddress, [
    pullTokenAddress,
    config.stakingRewardRate,
    config.stakingEmergencyPenalty,
    config.stakingMinAmount,
  ], "PullStaking");
  await verifyContract(pullVestingAddress, [pullTokenAddress], "PullVesting");
  await verifyContract(pullRewardsAddress, [
    pullTokenAddress,
    config.rewardsConversionRate,
    config.rewardsCooldownPeriod,
    config.rewardsMaxConversion,
    config.rewardsDailyLimit,
  ], "PullRewards");

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("📋 DEPLOYMENT SUMMARY");
  console.log("=".repeat(50));
  console.log(`Network:      ${deployedContracts.network}`);
  console.log(`Chain ID:     ${deployedContracts.chainId}`);
  console.log(`Block:        ${deployedContracts.blockNumber}`);
  console.log(`Deployer:     ${deployedContracts.deployer}`);
  console.log("-".repeat(50));
  console.log(`PullToken:    ${deployedContracts.pullToken}`);
  console.log(`PullStaking:  ${deployedContracts.pullStaking}`);
  console.log(`PullVesting:  ${deployedContracts.pullVesting}`);
  console.log(`PullRewards:  ${deployedContracts.pullRewards}`);
  console.log("=".repeat(50));
  console.log("\n✅ Deployment complete!\n");

  // Save deployment info to file
  const fs = await import("fs");
  const deploymentPath = `./deployments/${network.name}`;

  if (!fs.existsSync("./deployments")) {
    fs.mkdirSync("./deployments");
  }
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${deploymentPath}/deployment-${timestamp}.json`;

  fs.writeFileSync(filename, JSON.stringify({
    ...deployedContracts,
    config: {
      stakingRewardRate: config.stakingRewardRate.toString(),
      stakingEmergencyPenalty: config.stakingEmergencyPenalty.toString(),
      stakingMinAmount: config.stakingMinAmount.toString(),
      rewardsConversionRate: config.rewardsConversionRate.toString(),
      rewardsCooldownPeriod: config.rewardsCooldownPeriod.toString(),
      rewardsMaxConversion: config.rewardsMaxConversion.toString(),
      rewardsDailyLimit: config.rewardsDailyLimit.toString(),
    },
    timestamp: new Date().toISOString(),
  }, null, 2));

  console.log(`📁 Deployment info saved to: ${filename}\n`);

  return deployedContracts;
}

/**
 * Export for use as module
 */
export { deploy, DeploymentConfig, DeploymentResult, defaultConfig };

/**
 * Run deployment if executed directly
 */
async function main(): Promise<void> {
  try {
    await deploy();
  } catch (error) {
    console.error("\n❌ Deployment failed:", error);
    process.exitCode = 1;
  }
}

// Execute if running directly
main();
