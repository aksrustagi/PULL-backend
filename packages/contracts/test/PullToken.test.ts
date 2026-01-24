import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  PullToken,
  PullStaking,
  PullVesting,
  PullRewards,
} from "../typechain-types";

describe("PULL Token Ecosystem", function () {
  // Constants
  const MAX_SUPPLY = ethers.parseEther("1000000000"); // 1 billion
  const INITIAL_SUPPLY = ethers.parseEther("100000000"); // 100 million (10%)

  /**
   * Deployment fixture
   */
  async function deployFixture() {
    const [deployer, admin, minter, pauser, user1, user2, oracle] = await ethers.getSigners();

    // Deploy PullToken
    const PullToken = await ethers.getContractFactory("PullToken");
    const pullToken = await PullToken.deploy() as unknown as PullToken;

    // Deploy PullStaking
    const PullStaking = await ethers.getContractFactory("PullStaking");
    const pullStaking = await PullStaking.deploy(
      await pullToken.getAddress(),
      1000n, // 10% APY
      1000n, // 10% emergency penalty
      ethers.parseEther("100") // 100 PULL minimum
    ) as unknown as PullStaking;

    // Deploy PullVesting
    const PullVesting = await ethers.getContractFactory("PullVesting");
    const pullVesting = await PullVesting.deploy(await pullToken.getAddress()) as unknown as PullVesting;

    // Deploy PullRewards
    const PullRewards = await ethers.getContractFactory("PullRewards");
    const pullRewards = await PullRewards.deploy(
      await pullToken.getAddress(),
      1000n, // 1:1 conversion rate
      3600n, // 1 hour cooldown
      10000n, // Max 10000 points per conversion
      50000n // Max 50000 points per day
    ) as unknown as PullRewards;

    return {
      pullToken,
      pullStaking,
      pullVesting,
      pullRewards,
      deployer,
      admin,
      minter,
      pauser,
      user1,
      user2,
      oracle,
    };
  }

  // ============================================
  // PullToken Tests
  // ============================================
  describe("PullToken", function () {
    describe("Deployment", function () {
      it("Should set correct name and symbol", async function () {
        const { pullToken } = await loadFixture(deployFixture);
        expect(await pullToken.name()).to.equal("PULL");
        expect(await pullToken.symbol()).to.equal("PULL");
      });

      it("Should mint initial supply to deployer", async function () {
        const { pullToken, deployer } = await loadFixture(deployFixture);
        expect(await pullToken.balanceOf(deployer.address)).to.equal(INITIAL_SUPPLY);
      });

      it("Should set correct max supply", async function () {
        const { pullToken } = await loadFixture(deployFixture);
        expect(await pullToken.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
      });

      it("Should grant roles to deployer", async function () {
        const { pullToken, deployer } = await loadFixture(deployFixture);
        const DEFAULT_ADMIN_ROLE = await pullToken.DEFAULT_ADMIN_ROLE();
        const MINTER_ROLE = await pullToken.MINTER_ROLE();
        const PAUSER_ROLE = await pullToken.PAUSER_ROLE();

        expect(await pullToken.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
        expect(await pullToken.hasRole(MINTER_ROLE, deployer.address)).to.be.true;
        expect(await pullToken.hasRole(PAUSER_ROLE, deployer.address)).to.be.true;
      });
    });

    describe("Minting", function () {
      it("Should allow minter to mint tokens", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        const amount = ethers.parseEther("1000");

        await pullToken.connect(deployer).mint(user1.address, amount);
        expect(await pullToken.balanceOf(user1.address)).to.equal(amount);
      });

      it("Should prevent non-minters from minting", async function () {
        const { pullToken, user1, user2 } = await loadFixture(deployFixture);
        const amount = ethers.parseEther("1000");

        await expect(
          pullToken.connect(user1).mint(user2.address, amount)
        ).to.be.reverted;
      });

      it("Should prevent minting beyond max supply", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        const remaining = MAX_SUPPLY - INITIAL_SUPPLY;
        const excess = remaining + 1n;

        await expect(
          pullToken.connect(deployer).mint(user1.address, excess)
        ).to.be.revertedWithCustomError(pullToken, "ExceedsMaxSupply");
      });

      it("Should allow minting up to max supply", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        const remaining = MAX_SUPPLY - INITIAL_SUPPLY;

        await pullToken.connect(deployer).mint(user1.address, remaining);
        expect(await pullToken.totalSupply()).to.equal(MAX_SUPPLY);
      });

      it("Should return correct mintable supply", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        const mintAmount = ethers.parseEther("1000");

        const initialMintable = await pullToken.mintableSupply();
        expect(initialMintable).to.equal(MAX_SUPPLY - INITIAL_SUPPLY);

        await pullToken.connect(deployer).mint(user1.address, mintAmount);
        expect(await pullToken.mintableSupply()).to.equal(initialMintable - mintAmount);
      });

      it("Should reject minting to zero address", async function () {
        const { pullToken, deployer } = await loadFixture(deployFixture);
        await expect(
          pullToken.connect(deployer).mint(ethers.ZeroAddress, ethers.parseEther("100"))
        ).to.be.revertedWithCustomError(pullToken, "ZeroAddress");
      });

      it("Should reject minting zero amount", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        await expect(
          pullToken.connect(deployer).mint(user1.address, 0n)
        ).to.be.revertedWithCustomError(pullToken, "ZeroAmount");
      });
    });

    describe("Burning", function () {
      it("Should allow users to burn their tokens", async function () {
        const { pullToken, deployer } = await loadFixture(deployFixture);
        const burnAmount = ethers.parseEther("1000");
        const initialBalance = await pullToken.balanceOf(deployer.address);

        await pullToken.connect(deployer).burn(burnAmount);
        expect(await pullToken.balanceOf(deployer.address)).to.equal(initialBalance - burnAmount);
      });

      it("Should allow burning from approved account", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        const burnAmount = ethers.parseEther("1000");

        await pullToken.connect(deployer).approve(user1.address, burnAmount);
        await pullToken.connect(user1).burnFrom(deployer.address, burnAmount);
      });
    });

    describe("Pausing", function () {
      it("Should allow pauser to pause transfers", async function () {
        const { pullToken, deployer } = await loadFixture(deployFixture);
        await pullToken.connect(deployer).pause();
        expect(await pullToken.paused()).to.be.true;
      });

      it("Should prevent transfers when paused", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        await pullToken.connect(deployer).pause();

        await expect(
          pullToken.connect(deployer).transfer(user1.address, ethers.parseEther("100"))
        ).to.be.reverted;
      });

      it("Should allow transfers after unpause", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);
        await pullToken.connect(deployer).pause();
        await pullToken.connect(deployer).unpause();

        await pullToken.connect(deployer).transfer(user1.address, ethers.parseEther("100"));
        expect(await pullToken.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      });

      it("Should prevent non-pausers from pausing", async function () {
        const { pullToken, user1 } = await loadFixture(deployFixture);
        await expect(pullToken.connect(user1).pause()).to.be.reverted;
      });
    });

    describe("Permit", function () {
      it("Should support EIP-2612 permit", async function () {
        const { pullToken, deployer, user1 } = await loadFixture(deployFixture);

        const domain = {
          name: "PULL",
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await pullToken.getAddress(),
        };

        const types = {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        };

        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = await pullToken.nonces(deployer.address);
        const value = ethers.parseEther("100");

        const message = {
          owner: deployer.address,
          spender: user1.address,
          value,
          nonce,
          deadline,
        };

        const signature = await deployer.signTypedData(domain, types, message);
        const { v, r, s } = ethers.Signature.from(signature);

        await pullToken.permit(deployer.address, user1.address, value, deadline, v, r, s);
        expect(await pullToken.allowance(deployer.address, user1.address)).to.equal(value);
      });
    });
  });

  // ============================================
  // PullStaking Tests
  // ============================================
  describe("PullStaking", function () {
    async function stakingFixture() {
      const fixture = await deployFixture();
      const { pullToken, pullStaking, deployer, user1 } = fixture;

      // Transfer tokens to user1 for staking
      const stakeAmount = ethers.parseEther("10000");
      await pullToken.connect(deployer).transfer(user1.address, stakeAmount);
      await pullToken.connect(user1).approve(await pullStaking.getAddress(), stakeAmount);

      // Deposit rewards to staking contract
      const rewardsAmount = ethers.parseEther("100000");
      await pullToken.connect(deployer).approve(await pullStaking.getAddress(), rewardsAmount);
      await pullStaking.connect(deployer).depositRewards(rewardsAmount);

      return { ...fixture, stakeAmount };
    }

    describe("Staking", function () {
      it("Should allow users to stake tokens", async function () {
        const { pullStaking, user1, stakeAmount } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 0); // No lock
        const stakeInfo = await pullStaking.getStakeInfo(user1.address);

        expect(stakeInfo.amount).to.equal(amount);
        expect(await pullStaking.totalStaked()).to.equal(amount);
      });

      it("Should enforce minimum stake amount", async function () {
        const { pullStaking, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("10"); // Below 100 minimum

        await expect(
          pullStaking.connect(user1).stake(amount, 0)
        ).to.be.revertedWithCustomError(pullStaking, "BelowMinimumStake");
      });

      it("Should prevent double staking", async function () {
        const { pullStaking, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 0);
        await expect(
          pullStaking.connect(user1).stake(amount, 0)
        ).to.be.revertedWithCustomError(pullStaking, "AlreadyStaking");
      });

      it("Should apply lock period multipliers", async function () {
        const { pullStaking, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        // Stake with 30-day lock (1.25x multiplier)
        await pullStaking.connect(user1).stake(amount, 1);
        const stakeInfo = await pullStaking.getStakeInfo(user1.address);

        // Verify lock period
        expect(stakeInfo.lockPeriod).to.equal(1);
        expect(stakeInfo.unlockTime).to.be.gt(stakeInfo.startTime);
      });
    });

    describe("Rewards", function () {
      it("Should calculate rewards over time", async function () {
        const { pullStaking, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 0);

        // Advance time by 1 year
        await time.increase(365 * 24 * 60 * 60);

        const rewards = await pullStaking.calculateRewards(user1.address);
        // With 10% APY and no lock (1x multiplier), rewards should be ~100 tokens
        expect(rewards).to.be.closeTo(ethers.parseEther("100"), ethers.parseEther("1"));
      });

      it("Should apply lock multipliers to rewards", async function () {
        const { pullStaking, pullToken, deployer, user2 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        // Setup user2 for staking
        await pullToken.connect(deployer).transfer(user2.address, amount);
        await pullToken.connect(user2).approve(await pullStaking.getAddress(), amount);

        // Stake with 1-year lock (2x multiplier)
        await pullStaking.connect(user2).stake(amount, 3);

        // Advance time by 1 year
        await time.increase(365 * 24 * 60 * 60);

        const rewards = await pullStaking.calculateRewards(user2.address);
        // With 10% APY and 2x multiplier, rewards should be ~200 tokens
        expect(rewards).to.be.closeTo(ethers.parseEther("200"), ethers.parseEther("2"));
      });

      it("Should allow claiming rewards", async function () {
        const { pullStaking, pullToken, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 0);
        await time.increase(30 * 24 * 60 * 60); // 30 days

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullStaking.connect(user1).claimRewards();
        const finalBalance = await pullToken.balanceOf(user1.address);

        expect(finalBalance).to.be.gt(initialBalance);
      });
    });

    describe("Unstaking", function () {
      it("Should allow unstaking after lock period", async function () {
        const { pullStaking, pullToken, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 0); // No lock

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullStaking.connect(user1).unstake(amount);
        const finalBalance = await pullToken.balanceOf(user1.address);

        expect(finalBalance).to.be.gte(initialBalance + amount);
      });

      it("Should prevent unstaking during lock period", async function () {
        const { pullStaking, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 1); // 30-day lock

        await expect(
          pullStaking.connect(user1).unstake(amount)
        ).to.be.revertedWithCustomError(pullStaking, "StakeLocked");
      });
    });

    describe("Emergency Withdraw", function () {
      it("Should allow emergency withdraw with penalty", async function () {
        const { pullStaking, pullToken, user1 } = await loadFixture(stakingFixture);
        const amount = ethers.parseEther("1000");

        await pullStaking.connect(user1).stake(amount, 3); // 1-year lock

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullStaking.connect(user1).emergencyWithdraw();
        const finalBalance = await pullToken.balanceOf(user1.address);

        // Should receive 90% (10% penalty)
        const expectedReturn = (amount * 9000n) / 10000n;
        expect(finalBalance - initialBalance).to.equal(expectedReturn);
      });
    });

    describe("Admin Functions", function () {
      it("Should allow admin to update reward rate", async function () {
        const { pullStaking, deployer } = await loadFixture(stakingFixture);

        await pullStaking.connect(deployer).setRewardRate(2000n);
        expect(await pullStaking.rewardRate()).to.equal(2000n);
      });

      it("Should prevent excessive reward rate", async function () {
        const { pullStaking, deployer } = await loadFixture(stakingFixture);

        await expect(
          pullStaking.connect(deployer).setRewardRate(6000n) // 60% > 50% max
        ).to.be.revertedWithCustomError(pullStaking, "RateExceedsMaximum");
      });
    });
  });

  // ============================================
  // PullVesting Tests
  // ============================================
  describe("PullVesting", function () {
    async function vestingFixture() {
      const fixture = await deployFixture();
      const { pullToken, pullVesting, deployer } = fixture;

      // Deposit tokens to vesting contract
      const vestingPool = ethers.parseEther("10000000"); // 10M tokens
      await pullToken.connect(deployer).approve(await pullVesting.getAddress(), vestingPool);
      await pullVesting.connect(deployer).depositTokens(vestingPool);

      return { ...fixture, vestingPool };
    }

    describe("Creating Vesting Schedules", function () {
      it("Should create vesting schedule", async function () {
        const { pullVesting, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();
        const cliff = 90 * 24 * 60 * 60; // 90 days
        const duration = 365 * 24 * 60 * 60; // 1 year

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          cliff,
          duration,
          true // revocable
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);
        expect(schedules.length).to.equal(1);

        const schedule = await pullVesting.getVestingSchedule(schedules[0]);
        expect(schedule.totalAmount).to.equal(amount);
        expect(schedule.beneficiary).to.equal(user1.address);
        expect(schedule.cliffDuration).to.equal(cliff);
        expect(schedule.duration).to.equal(duration);
        expect(schedule.revocable).to.be.true;
      });

      it("Should reject cliff longer than duration", async function () {
        const { pullVesting, deployer, user1 } = await loadFixture(vestingFixture);

        await expect(
          pullVesting.connect(deployer).createVestingSchedule(
            user1.address,
            ethers.parseEther("1000"),
            await time.latest(),
            365 * 24 * 60 * 60, // 1 year cliff
            30 * 24 * 60 * 60, // 30 day duration
            true
          )
        ).to.be.revertedWithCustomError(pullVesting, "CliffExceedsDuration");
      });
    });

    describe("Releasing Tokens", function () {
      it("Should not release before cliff", async function () {
        const { pullVesting, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();
        const cliff = 90 * 24 * 60 * 60; // 90 days

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          cliff,
          365 * 24 * 60 * 60,
          true
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);

        // Before cliff
        await time.increase(30 * 24 * 60 * 60); // 30 days
        const releasable = await pullVesting.computeReleasableAmount(schedules[0]);
        expect(releasable).to.equal(0);
      });

      it("Should release linearly after cliff", async function () {
        const { pullVesting, pullToken, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();
        const duration = 365 * 24 * 60 * 60; // 1 year

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          0, // No cliff
          duration,
          true
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);

        // After 6 months (~50% vested)
        await time.increase(duration / 2);

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullVesting.connect(user1).release(schedules[0]);
        const finalBalance = await pullToken.balanceOf(user1.address);

        // Should have received approximately 50% of tokens
        const received = finalBalance - initialBalance;
        expect(received).to.be.closeTo(amount / 2n, ethers.parseEther("100"));
      });

      it("Should fully release after duration", async function () {
        const { pullVesting, pullToken, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();
        const duration = 365 * 24 * 60 * 60;

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          0,
          duration,
          true
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);

        // After full duration
        await time.increase(duration + 1);

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullVesting.connect(user1).release(schedules[0]);
        const finalBalance = await pullToken.balanceOf(user1.address);

        expect(finalBalance - initialBalance).to.equal(amount);
      });
    });

    describe("Revoking", function () {
      it("Should allow admin to revoke revocable schedule", async function () {
        const { pullVesting, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          0,
          365 * 24 * 60 * 60,
          true // revocable
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);

        // Revoke after 6 months
        await time.increase(180 * 24 * 60 * 60);
        await pullVesting.connect(deployer).revoke(schedules[0]);

        const schedule = await pullVesting.getVestingSchedule(schedules[0]);
        expect(schedule.revoked).to.be.true;
      });

      it("Should not allow revoking non-revocable schedule", async function () {
        const { pullVesting, deployer, user1 } = await loadFixture(vestingFixture);
        const amount = ethers.parseEther("10000");
        const startTime = await time.latest();

        await pullVesting.connect(deployer).createVestingSchedule(
          user1.address,
          amount,
          startTime,
          0,
          365 * 24 * 60 * 60,
          false // non-revocable
        );

        const schedules = await pullVesting.getBeneficiarySchedules(user1.address);

        await expect(
          pullVesting.connect(deployer).revoke(schedules[0])
        ).to.be.revertedWithCustomError(pullVesting, "ScheduleNotRevocable");
      });
    });
  });

  // ============================================
  // PullRewards Tests
  // ============================================
  describe("PullRewards", function () {
    async function rewardsFixture() {
      const fixture = await deployFixture();
      const { pullToken, pullRewards, deployer, oracle, user1 } = fixture;

      // Grant oracle role
      const ORACLE_ROLE = await pullRewards.ORACLE_ROLE();
      await pullRewards.connect(deployer).grantRole(ORACLE_ROLE, oracle.address);

      // Deposit tokens for rewards
      const rewardsPool = ethers.parseEther("1000000"); // 1M tokens
      await pullToken.connect(deployer).approve(await pullRewards.getAddress(), rewardsPool);
      await pullRewards.connect(deployer).depositTokens(rewardsPool);

      return { ...fixture, rewardsPool };
    }

    describe("Adding Points", function () {
      it("Should allow oracle to add points", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 1000n, "Test reward");

        const [points] = await pullRewards.getUserInfo(user1.address);
        expect(points).to.equal(1000n);
      });

      it("Should allow batch adding points", async function () {
        const { pullRewards, oracle, user1, user2 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPointsBatch(
          [user1.address, user2.address],
          [1000n, 2000n],
          "Batch reward"
        );

        const [points1] = await pullRewards.getUserInfo(user1.address);
        const [points2] = await pullRewards.getUserInfo(user2.address);

        expect(points1).to.equal(1000n);
        expect(points2).to.equal(2000n);
      });

      it("Should prevent non-oracle from adding points", async function () {
        const { pullRewards, user1, user2 } = await loadFixture(rewardsFixture);

        await expect(
          pullRewards.connect(user1).addPoints(user2.address, 1000n, "Test")
        ).to.be.reverted;
      });
    });

    describe("Converting Points", function () {
      it("Should convert points to tokens", async function () {
        const { pullRewards, pullToken, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 5000n, "Test");

        const initialBalance = await pullToken.balanceOf(user1.address);
        await pullRewards.connect(user1).convertPoints(1000n);
        const finalBalance = await pullToken.balanceOf(user1.address);

        // 1:1 ratio, so 1000 points = 1 token (1000 * 1000 / 1000 = 1000 tokens in wei = 1000)
        // Actually the conversion rate is per 1000 points, so 1000 points at rate 1000 = 1000 tokens
        const expectedTokens = (1000n * 1000n) / 1000n; // points * rate / precision
        expect(finalBalance - initialBalance).to.equal(expectedTokens);
      });

      it("Should enforce cooldown period", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 5000n, "Test");
        await pullRewards.connect(user1).convertPoints(1000n);

        await expect(
          pullRewards.connect(user1).convertPoints(1000n)
        ).to.be.revertedWithCustomError(pullRewards, "CooldownNotExpired");
      });

      it("Should allow conversion after cooldown", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 5000n, "Test");
        await pullRewards.connect(user1).convertPoints(1000n);

        // Wait for cooldown (1 hour)
        await time.increase(3601);

        await pullRewards.connect(user1).convertPoints(1000n);
      });

      it("Should enforce max conversion limit", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 50000n, "Test");

        await expect(
          pullRewards.connect(user1).convertPoints(15000n) // > 10000 max
        ).to.be.revertedWithCustomError(pullRewards, "ExceedsMaxConversion");
      });

      it("Should enforce daily limit", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 100000n, "Test");

        // Convert max allowed multiple times to hit daily limit
        await pullRewards.connect(user1).convertPoints(10000n);
        await time.increase(3601);
        await pullRewards.connect(user1).convertPoints(10000n);
        await time.increase(3601);
        await pullRewards.connect(user1).convertPoints(10000n);
        await time.increase(3601);
        await pullRewards.connect(user1).convertPoints(10000n);
        await time.increase(3601);
        await pullRewards.connect(user1).convertPoints(10000n);
        await time.increase(3601);

        // Daily limit of 50000 reached
        await expect(
          pullRewards.connect(user1).convertPoints(1000n)
        ).to.be.revertedWithCustomError(pullRewards, "DailyLimitExceeded");
      });

      it("Should reset daily limit after 24 hours", async function () {
        const { pullRewards, oracle, user1 } = await loadFixture(rewardsFixture);

        await pullRewards.connect(oracle).addPoints(user1.address, 100000n, "Test");

        // Hit daily limit
        for (let i = 0; i < 5; i++) {
          await pullRewards.connect(user1).convertPoints(10000n);
          await time.increase(3601);
        }

        // Wait for daily reset
        await time.increase(24 * 60 * 60);

        // Should work now
        await pullRewards.connect(user1).convertPoints(1000n);
      });
    });

    describe("Admin Functions", function () {
      it("Should allow updating conversion rate", async function () {
        const { pullRewards, deployer } = await loadFixture(rewardsFixture);

        await pullRewards.connect(deployer).setConversionRate(2000n);
        expect(await pullRewards.conversionRate()).to.equal(2000n);
      });

      it("Should prevent zero conversion rate", async function () {
        const { pullRewards, deployer } = await loadFixture(rewardsFixture);

        await expect(
          pullRewards.connect(deployer).setConversionRate(0n)
        ).to.be.revertedWithCustomError(pullRewards, "ZeroRate");
      });
    });
  });

  // ============================================
  // Integration Tests
  // ============================================
  describe("Integration", function () {
    it("Should work end-to-end: mint -> stake -> earn -> claim", async function () {
      const { pullToken, pullStaking, deployer, user1 } = await loadFixture(deployFixture);

      // Mint tokens to staking for rewards
      const rewardsAmount = ethers.parseEther("100000");
      await pullToken.connect(deployer).approve(await pullStaking.getAddress(), rewardsAmount);
      await pullStaking.connect(deployer).depositRewards(rewardsAmount);

      // Transfer tokens to user
      const userAmount = ethers.parseEther("10000");
      await pullToken.connect(deployer).transfer(user1.address, userAmount);

      // User stakes
      const stakeAmount = ethers.parseEther("1000");
      await pullToken.connect(user1).approve(await pullStaking.getAddress(), stakeAmount);
      await pullStaking.connect(user1).stake(stakeAmount, 0);

      // Time passes
      await time.increase(180 * 24 * 60 * 60); // 6 months

      // User claims rewards
      const balanceBefore = await pullToken.balanceOf(user1.address);
      await pullStaking.connect(user1).claimRewards();
      const balanceAfter = await pullToken.balanceOf(user1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should work end-to-end: create vesting -> wait -> release", async function () {
      const { pullToken, pullVesting, deployer, user1 } = await loadFixture(deployFixture);

      // Deposit to vesting
      const vestAmount = ethers.parseEther("100000");
      await pullToken.connect(deployer).approve(await pullVesting.getAddress(), vestAmount);
      await pullVesting.connect(deployer).depositTokens(vestAmount);

      // Create vesting schedule
      const amount = ethers.parseEther("10000");
      const startTime = await time.latest();
      const duration = 365 * 24 * 60 * 60;

      await pullVesting.connect(deployer).createVestingSchedule(
        user1.address,
        amount,
        startTime,
        0,
        duration,
        false
      );

      // Wait for full vesting
      await time.increase(duration + 1);

      // Release all tokens
      const schedules = await pullVesting.getBeneficiarySchedules(user1.address);
      await pullVesting.connect(user1).release(schedules[0]);

      expect(await pullToken.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should work end-to-end: earn points -> convert to tokens", async function () {
      const { pullToken, pullRewards, deployer, oracle, user1 } = await loadFixture(deployFixture);

      // Setup oracle role
      const ORACLE_ROLE = await pullRewards.ORACLE_ROLE();
      await pullRewards.connect(deployer).grantRole(ORACLE_ROLE, oracle.address);

      // Deposit rewards
      const rewardsAmount = ethers.parseEther("100000");
      await pullToken.connect(deployer).approve(await pullRewards.getAddress(), rewardsAmount);
      await pullRewards.connect(deployer).depositTokens(rewardsAmount);

      // User earns points
      await pullRewards.connect(oracle).addPoints(user1.address, 5000n, "Activity reward");

      // User converts points
      await pullRewards.connect(user1).convertPoints(5000n);

      // User should have received tokens
      const expectedTokens = (5000n * 1000n) / 1000n; // 5000 tokens
      expect(await pullToken.balanceOf(user1.address)).to.equal(expectedTokens);
    });
  });
});
