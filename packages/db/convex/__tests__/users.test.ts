/**
 * Convex Users Function Tests
 * Tests for user queries and mutations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import {
  getById,
  getByEmail,
  getByUsername,
  getByWalletAddress,
  getByReferralCode,
  getProfile,
  search,
  list,
  create,
  update,
  updateKYCStatus,
  verifyEmail,
  connectWallet,
  updateLastLogin,
  suspend,
} from "../users";

// ============================================================================
// Test Setup
// ============================================================================

const t = convexTest(schema);

// Test data factory
function createTestUser(overrides = {}) {
  return {
    email: "test@example.com",
    emailVerified: true,
    phoneVerified: false,
    displayName: "Test User",
    username: "testuser",
    status: "active" as const,
    kycStatus: "approved" as const,
    kycTier: "verified" as const,
    authProvider: "email" as const,
    referralCode: "TESTCODE",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// Query Tests
// ============================================================================

describe("User Queries", () => {
  describe("getById", () => {
    it("should return user by ID", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        const user = await ctx.runQuery(getById, { id: userId });

        expect(user).not.toBeNull();
        expect(user?.email).toBe("test@example.com");
        expect(user?.displayName).toBe("Test User");
      });
    });

    it("should return null for non-existent ID", async () => {
      await t.run(async (ctx) => {
        // Create a dummy user to get a valid ID format, then use a different ID
        const userId = await ctx.db.insert("users", createTestUser());
        await ctx.db.delete(userId);

        const user = await ctx.runQuery(getById, { id: userId });

        expect(user).toBeNull();
      });
    });
  });

  describe("getByEmail", () => {
    it("should return user by email", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ email: "john@example.com" }));

        const user = await ctx.runQuery(getByEmail, { email: "john@example.com" });

        expect(user).not.toBeNull();
        expect(user?.email).toBe("john@example.com");
      });
    });

    it("should be case insensitive", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ email: "john@example.com" }));

        const user = await ctx.runQuery(getByEmail, { email: "JOHN@EXAMPLE.COM" });

        expect(user).not.toBeNull();
      });
    });

    it("should return null for non-existent email", async () => {
      await t.run(async (ctx) => {
        const user = await ctx.runQuery(getByEmail, { email: "nonexistent@example.com" });

        expect(user).toBeNull();
      });
    });
  });

  describe("getByUsername", () => {
    it("should return user by username", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ username: "johndoe" }));

        const user = await ctx.runQuery(getByUsername, { username: "johndoe" });

        expect(user).not.toBeNull();
        expect(user?.username).toBe("johndoe");
      });
    });

    it("should be case insensitive", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ username: "johndoe" }));

        const user = await ctx.runQuery(getByUsername, { username: "JOHNDOE" });

        expect(user).not.toBeNull();
      });
    });
  });

  describe("getByWalletAddress", () => {
    it("should return user by wallet address", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert(
          "users",
          createTestUser({ walletAddress: "0x1234567890abcdef" })
        );

        const user = await ctx.runQuery(getByWalletAddress, {
          walletAddress: "0x1234567890abcdef",
        });

        expect(user).not.toBeNull();
        expect(user?.walletAddress).toBe("0x1234567890abcdef");
      });
    });

    it("should be case insensitive", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert(
          "users",
          createTestUser({ walletAddress: "0x1234567890abcdef" })
        );

        const user = await ctx.runQuery(getByWalletAddress, {
          walletAddress: "0x1234567890ABCDEF",
        });

        expect(user).not.toBeNull();
      });
    });
  });

  describe("getByReferralCode", () => {
    it("should return user by referral code", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ referralCode: "ABC123" }));

        const user = await ctx.runQuery(getByReferralCode, { referralCode: "ABC123" });

        expect(user).not.toBeNull();
        expect(user?.referralCode).toBe("ABC123");
      });
    });

    it("should be case insensitive", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ referralCode: "ABC123" }));

        const user = await ctx.runQuery(getByReferralCode, { referralCode: "abc123" });

        expect(user).not.toBeNull();
      });
    });
  });

  describe("getProfile", () => {
    it("should return user profile with extended data", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        // Add points balance
        await ctx.db.insert("balances", {
          userId,
          assetType: "points",
          assetId: "PULL_POINTS",
          symbol: "PTS",
          available: 1000,
          held: 0,
          pending: 0,
          updatedAt: Date.now(),
        });

        const profile = await ctx.runQuery(getProfile, { userId });

        expect(profile).not.toBeNull();
        expect(profile?.pointsBalance).toBe(1000);
        expect(profile?.referralCount).toBe(0);
      });
    });

    it("should count referrals", async () => {
      await t.run(async (ctx) => {
        const referrerId = await ctx.db.insert("users", createTestUser());

        // Create referred users
        await ctx.db.insert(
          "users",
          createTestUser({
            email: "referred1@example.com",
            referredBy: referrerId,
          })
        );
        await ctx.db.insert(
          "users",
          createTestUser({
            email: "referred2@example.com",
            referredBy: referrerId,
          })
        );

        const profile = await ctx.runQuery(getProfile, { userId: referrerId });

        expect(profile?.referralCount).toBe(2);
      });
    });

    it("should return null for non-existent user", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());
        await ctx.db.delete(userId);

        const profile = await ctx.runQuery(getProfile, { userId });

        expect(profile).toBeNull();
      });
    });
  });

  describe("search", () => {
    it("should search users by display name", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ displayName: "John Smith" }));
        await ctx.db.insert(
          "users",
          createTestUser({ email: "jane@example.com", displayName: "Jane Doe" })
        );

        const results = await ctx.runQuery(search, { query: "John" });

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some((u) => u.displayName === "John Smith")).toBe(true);
      });
    });

    it("should filter by status", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert(
          "users",
          createTestUser({ displayName: "Active User", status: "active" })
        );
        await ctx.db.insert(
          "users",
          createTestUser({
            email: "suspended@example.com",
            displayName: "Suspended User",
            status: "suspended" as "active",
          })
        );

        const results = await ctx.runQuery(search, {
          query: "User",
          status: "active",
        });

        expect(results.every((u) => u.status === "active")).toBe(true);
      });
    });

    it("should respect limit", async () => {
      await t.run(async (ctx) => {
        for (let i = 0; i < 10; i++) {
          await ctx.db.insert(
            "users",
            createTestUser({
              email: `user${i}@example.com`,
              displayName: `Test User ${i}`,
            })
          );
        }

        const results = await ctx.runQuery(search, { query: "Test", limit: 5 });

        expect(results.length).toBeLessThanOrEqual(5);
      });
    });
  });

  describe("list", () => {
    it("should list users with pagination", async () => {
      await t.run(async (ctx) => {
        for (let i = 0; i < 5; i++) {
          await ctx.db.insert(
            "users",
            createTestUser({ email: `user${i}@example.com` })
          );
        }

        const result = await ctx.runQuery(list, { limit: 3 });

        expect(result.users.length).toBe(3);
        expect(result.hasMore).toBe(true);
        expect(result.nextCursor).toBeDefined();
      });
    });

    it("should filter by status", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ status: "active" }));
        await ctx.db.insert(
          "users",
          createTestUser({
            email: "suspended@example.com",
            status: "suspended" as "active",
          })
        );

        const result = await ctx.runQuery(list, { status: "active" });

        expect(result.users.every((u) => u.status === "active")).toBe(true);
      });
    });
  });
});

// ============================================================================
// Mutation Tests
// ============================================================================

describe("User Mutations", () => {
  describe("create", () => {
    it("should create a new user", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.runMutation(create, {
          email: "newuser@example.com",
          authProvider: "email",
          displayName: "New User",
        });

        const user = await ctx.db.get(userId);

        expect(user).not.toBeNull();
        expect(user?.email).toBe("newuser@example.com");
        expect(user?.status).toBe("active");
        expect(user?.kycStatus).toBe("pending");
        expect(user?.referralCode).toBeDefined();
      });
    });

    it("should normalize email to lowercase", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.runMutation(create, {
          email: "UPPERCASE@EXAMPLE.COM",
          authProvider: "email",
        });

        const user = await ctx.db.get(userId);

        expect(user?.email).toBe("uppercase@example.com");
      });
    });

    it("should initialize USD balance", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.runMutation(create, {
          email: "balance@example.com",
          authProvider: "email",
        });

        const balance = await ctx.db
          .query("balances")
          .withIndex("by_user_asset", (q) =>
            q.eq("userId", userId).eq("assetType", "usd").eq("assetId", "USD")
          )
          .unique();

        expect(balance).not.toBeNull();
        expect(balance?.available).toBe(0);
      });
    });

    it("should initialize points balance", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.runMutation(create, {
          email: "points@example.com",
          authProvider: "email",
        });

        const balance = await ctx.db
          .query("balances")
          .withIndex("by_user_asset", (q) =>
            q.eq("userId", userId).eq("assetType", "points").eq("assetId", "PULL_POINTS")
          )
          .unique();

        expect(balance).not.toBeNull();
      });
    });

    it("should throw error for duplicate email", async () => {
      await t.run(async (ctx) => {
        await ctx.runMutation(create, {
          email: "duplicate@example.com",
          authProvider: "email",
        });

        await expect(
          ctx.runMutation(create, {
            email: "duplicate@example.com",
            authProvider: "google",
          })
        ).rejects.toThrow("User with this email already exists");
      });
    });

    it("should track referral", async () => {
      await t.run(async (ctx) => {
        const referrerId = await ctx.runMutation(create, {
          email: "referrer@example.com",
          authProvider: "email",
        });

        const referrer = await ctx.db.get(referrerId);

        const referredId = await ctx.runMutation(create, {
          email: "referred@example.com",
          authProvider: "email",
          referredBy: referrer?.referralCode,
        });

        const referred = await ctx.db.get(referredId);

        expect(referred?.referredBy).toBe(referrerId);
      });
    });

    it("should create audit log", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.runMutation(create, {
          email: "audit@example.com",
          authProvider: "email",
        });

        const audit = await ctx.db
          .query("auditLog")
          .filter((q) =>
            q.and(
              q.eq(q.field("userId"), userId),
              q.eq(q.field("action"), "user.created")
            )
          )
          .first();

        expect(audit).not.toBeNull();
      });
    });
  });

  describe("update", () => {
    it("should update user profile", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(update, {
          id: userId,
          displayName: "Updated Name",
          firstName: "John",
          lastName: "Doe",
        });

        const user = await ctx.db.get(userId);

        expect(user?.displayName).toBe("Updated Name");
        expect(user?.firstName).toBe("John");
        expect(user?.lastName).toBe("Doe");
      });
    });

    it("should normalize username to lowercase", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(update, {
          id: userId,
          username: "NewUsername",
        });

        const user = await ctx.db.get(userId);

        expect(user?.username).toBe("newusername");
      });
    });

    it("should throw error for duplicate username", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", createTestUser({ username: "takenname" }));
        const userId2 = await ctx.db.insert(
          "users",
          createTestUser({ email: "user2@example.com", username: "othername" })
        );

        await expect(
          ctx.runMutation(update, {
            id: userId2,
            username: "takenname",
          })
        ).rejects.toThrow("Username already taken");
      });
    });

    it("should throw error for non-existent user", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());
        await ctx.db.delete(userId);

        await expect(
          ctx.runMutation(update, {
            id: userId,
            displayName: "New Name",
          })
        ).rejects.toThrow("User not found");
      });
    });

    it("should create audit log", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(update, {
          id: userId,
          displayName: "Audit Test",
        });

        const audit = await ctx.db
          .query("auditLog")
          .filter((q) =>
            q.and(
              q.eq(q.field("userId"), userId),
              q.eq(q.field("action"), "user.updated")
            )
          )
          .first();

        expect(audit).not.toBeNull();
        expect(audit?.changes).toMatchObject({ displayName: "Audit Test" });
      });
    });
  });

  describe("updateKYCStatus", () => {
    it("should update KYC status", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser({ kycStatus: "pending" }));

        await ctx.runMutation(updateKYCStatus, {
          id: userId,
          kycStatus: "approved",
          kycTier: "verified",
        });

        const user = await ctx.db.get(userId);

        expect(user?.kycStatus).toBe("approved");
        expect(user?.kycTier).toBe("verified");
      });
    });

    it("should create audit log with old and new values", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert(
          "users",
          createTestUser({ kycStatus: "pending", kycTier: "none" })
        );

        await ctx.runMutation(updateKYCStatus, {
          id: userId,
          kycStatus: "identity_verified",
          kycTier: "basic",
        });

        const audit = await ctx.db
          .query("auditLog")
          .filter((q) =>
            q.and(
              q.eq(q.field("userId"), userId),
              q.eq(q.field("action"), "user.kyc_updated")
            )
          )
          .first();

        expect(audit?.changes).toMatchObject({
          old: { kycStatus: "pending", kycTier: "none" },
          new: { kycStatus: "identity_verified", kycTier: "basic" },
        });
      });
    });
  });

  describe("verifyEmail", () => {
    it("should mark email as verified", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert(
          "users",
          createTestUser({ emailVerified: false, kycStatus: "pending" })
        );

        await ctx.runMutation(verifyEmail, { id: userId });

        const user = await ctx.db.get(userId);

        expect(user?.emailVerified).toBe(true);
        expect(user?.kycStatus).toBe("email_verified");
      });
    });

    it("should not change kycStatus if already past pending", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert(
          "users",
          createTestUser({ emailVerified: false, kycStatus: "approved" })
        );

        await ctx.runMutation(verifyEmail, { id: userId });

        const user = await ctx.db.get(userId);

        expect(user?.emailVerified).toBe(true);
        expect(user?.kycStatus).toBe("approved");
      });
    });
  });

  describe("connectWallet", () => {
    it("should connect wallet address", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(connectWallet, {
          id: userId,
          walletAddress: "0xnewwallet123",
        });

        const user = await ctx.db.get(userId);

        expect(user?.walletAddress).toBe("0xnewwallet123");
      });
    });

    it("should normalize wallet to lowercase", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(connectWallet, {
          id: userId,
          walletAddress: "0xABCDEF123",
        });

        const user = await ctx.db.get(userId);

        expect(user?.walletAddress).toBe("0xabcdef123");
      });
    });

    it("should throw error if wallet already connected to another user", async () => {
      await t.run(async (ctx) => {
        await ctx.db.insert(
          "users",
          createTestUser({ walletAddress: "0xexistingwallet" })
        );
        const userId2 = await ctx.db.insert(
          "users",
          createTestUser({ email: "user2@example.com" })
        );

        await expect(
          ctx.runMutation(connectWallet, {
            id: userId2,
            walletAddress: "0xexistingwallet",
          })
        ).rejects.toThrow("Wallet already connected to another account");
      });
    });
  });

  describe("updateLastLogin", () => {
    it("should update last login timestamp", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());
        const beforeUpdate = Date.now();

        await ctx.runMutation(updateLastLogin, { id: userId });

        const user = await ctx.db.get(userId);

        expect(user?.lastLoginAt).toBeDefined();
        expect(user?.lastLoginAt).toBeGreaterThanOrEqual(beforeUpdate);
      });
    });
  });

  describe("suspend", () => {
    it("should suspend user", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser({ status: "active" }));

        await ctx.runMutation(suspend, {
          id: userId,
          reason: "Violation of terms",
        });

        const user = await ctx.db.get(userId);

        expect(user?.status).toBe("suspended");
      });
    });

    it("should create audit log with reason", async () => {
      await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", createTestUser());

        await ctx.runMutation(suspend, {
          id: userId,
          reason: "Suspicious activity",
        });

        const audit = await ctx.db
          .query("auditLog")
          .filter((q) =>
            q.and(
              q.eq(q.field("userId"), userId),
              q.eq(q.field("action"), "user.suspended")
            )
          )
          .first();

        expect(audit?.metadata).toMatchObject({ reason: "Suspicious activity" });
      });
    });
  });
});
