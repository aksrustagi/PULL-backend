import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy PULL Token
  console.log("\n1. Deploying PullToken...");
  const PullToken = await ethers.getContractFactory("PullToken");
  const pullToken = await PullToken.deploy();
  await pullToken.waitForDeployment();
  const pullTokenAddress = await pullToken.getAddress();
  console.log("PullToken deployed to:", pullTokenAddress);

  // Deploy Rewards NFT
  console.log("\n2. Deploying PullRewardsNFT...");
  const baseURI = process.env.NFT_BASE_URI || "https://api.pull.app/nft/metadata/";
  const PullRewardsNFT = await ethers.getContractFactory("PullRewardsNFT");
  const rewardsNFT = await PullRewardsNFT.deploy(baseURI);
  await rewardsNFT.waitForDeployment();
  const rewardsNFTAddress = await rewardsNFT.getAddress();
  console.log("PullRewardsNFT deployed to:", rewardsNFTAddress);

  // Grant MINTER_ROLE to a backend service address if provided
  const backendAddress = process.env.BACKEND_MINTER_ADDRESS;
  if (backendAddress) {
    console.log("\n3. Setting up roles...");

    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const BRIDGE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BRIDGE_ROLE"));

    // Grant minter role on token
    await pullToken.grantRole(MINTER_ROLE, backendAddress);
    console.log("Granted MINTER_ROLE to backend on PullToken");

    // Grant bridge role on token
    await pullToken.grantRole(BRIDGE_ROLE, backendAddress);
    console.log("Granted BRIDGE_ROLE to backend on PullToken");

    // Grant minter role on NFT
    await rewardsNFT.grantRole(MINTER_ROLE, backendAddress);
    console.log("Granted MINTER_ROLE to backend on PullRewardsNFT");
  }

  // Summary
  console.log("\n========================================");
  console.log("Deployment Summary");
  console.log("========================================");
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);
  console.log(`PullToken: ${pullTokenAddress}`);
  console.log(`PullRewardsNFT: ${rewardsNFTAddress}`);
  console.log("========================================\n");

  // Verify on Etherscan if API key is set
  if (process.env.POLYGONSCAN_API_KEY) {
    console.log("Waiting for block confirmations before verification...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds

    try {
      console.log("Verifying PullToken on Polygonscan...");
      await run("verify:verify", {
        address: pullTokenAddress,
        constructorArguments: [],
      });

      console.log("Verifying PullRewardsNFT on Polygonscan...");
      await run("verify:verify", {
        address: rewardsNFTAddress,
        constructorArguments: [baseURI],
      });

      console.log("Verification complete!");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
