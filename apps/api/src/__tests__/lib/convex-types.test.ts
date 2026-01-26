/**
 * Convex Types Tests
 * Tests for type-safe Convex ID utilities
 */

import { describe, it, expect } from "vitest";
import {
  isValidConvexIdFormat,
  toConvexId,
  toConvexIdSafe,
  toUserId,
  toOrderId,
  toRewardId,
  userIdParam,
  markValidatedUserId,
  validatedUserIdToConvex,
} from "../../lib/convex-types";

describe("Convex Types", () => {
  describe("isValidConvexIdFormat", () => {
    it("should return true for valid Convex ID format", () => {
      expect(isValidConvexIdFormat("k17abcdefghijk")).toBe(true);
      expect(isValidConvexIdFormat("abc123XYZ456789")).toBe(true);
      expect(isValidConvexIdFormat("someValidId12345")).toBe(true);
    });

    it("should return false for IDs that are too short", () => {
      expect(isValidConvexIdFormat("short")).toBe(false);
      expect(isValidConvexIdFormat("abc")).toBe(false);
      expect(isValidConvexIdFormat("")).toBe(false);
    });

    it("should return false for IDs with special characters", () => {
      expect(isValidConvexIdFormat("abc-123-xyz")).toBe(false);
      expect(isValidConvexIdFormat("abc_123_xyz")).toBe(false);
      expect(isValidConvexIdFormat("abc.123.xyz")).toBe(false);
      expect(isValidConvexIdFormat("abc@123#xyz")).toBe(false);
    });

    it("should return false for non-string values", () => {
      expect(isValidConvexIdFormat(null as any)).toBe(false);
      expect(isValidConvexIdFormat(undefined as any)).toBe(false);
      expect(isValidConvexIdFormat(12345 as any)).toBe(false);
    });
  });

  describe("toConvexId", () => {
    it("should convert valid string to Convex ID", () => {
      const id = toConvexId("k17abcdefghijk", "users");
      expect(id).toBe("k17abcdefghijk");
    });

    it("should throw for invalid ID format", () => {
      expect(() => toConvexId("short", "users")).toThrow("Invalid users ID format");
      expect(() => toConvexId("", "orders")).toThrow("Invalid orders ID format");
      expect(() => toConvexId("abc-def-ghi", "rewards")).toThrow("Invalid rewards ID format");
    });

    it("should include table name in error message", () => {
      expect(() => toConvexId("bad", "users")).toThrow("users");
      expect(() => toConvexId("bad", "orders")).toThrow("orders");
      expect(() => toConvexId("bad", "balances")).toThrow("balances");
    });
  });

  describe("toConvexIdSafe", () => {
    it("should return typed ID for valid format", () => {
      const id = toConvexIdSafe("k17abcdefghijk", "users");
      expect(id).toBe("k17abcdefghijk");
    });

    it("should return null for invalid format", () => {
      expect(toConvexIdSafe("short", "users")).toBeNull();
      expect(toConvexIdSafe("abc-def", "orders")).toBeNull();
    });

    it("should return null for undefined", () => {
      expect(toConvexIdSafe(undefined, "users")).toBeNull();
    });

    it("should return null for null", () => {
      expect(toConvexIdSafe(null, "users")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(toConvexIdSafe("", "users")).toBeNull();
    });
  });

  describe("toUserId", () => {
    it("should convert valid string to user ID", () => {
      const id = toUserId("k17useridexample");
      expect(id).toBe("k17useridexample");
    });

    it("should throw for invalid user ID", () => {
      expect(() => toUserId("bad")).toThrow("Invalid users ID format");
    });
  });

  describe("toOrderId", () => {
    it("should convert valid string to order ID", () => {
      const id = toOrderId("k17orderidexample");
      expect(id).toBe("k17orderidexample");
    });

    it("should throw for invalid order ID", () => {
      expect(() => toOrderId("bad")).toThrow("Invalid orders ID format");
    });
  });

  describe("toRewardId", () => {
    it("should convert valid string to reward ID", () => {
      const id = toRewardId("k17rewardidexample");
      expect(id).toBe("k17rewardidexample");
    });

    it("should throw for invalid reward ID", () => {
      expect(() => toRewardId("bad")).toThrow("Invalid rewards ID format");
    });
  });

  describe("userIdParam", () => {
    it("should create parameter object with userId", () => {
      const param = userIdParam("k17useridexample");
      expect(param).toEqual({ userId: "k17useridexample" });
    });

    it("should throw for invalid user ID", () => {
      expect(() => userIdParam("bad")).toThrow("Invalid users ID format");
    });
  });

  describe("ValidatedUserId", () => {
    it("should mark user ID as validated", () => {
      const validatedId = markValidatedUserId("k17useridexample");
      expect(validatedId).toBe("k17useridexample");
    });

    it("should convert validated user ID to Convex ID", () => {
      const validatedId = markValidatedUserId("k17useridexample");
      const convexId = validatedUserIdToConvex(validatedId);
      expect(convexId).toBe("k17useridexample");
    });
  });

  describe("Type safety", () => {
    it("should work with all supported table types", () => {
      // These should not throw
      expect(toConvexId("validid12345678", "users")).toBeDefined();
      expect(toConvexId("validid12345678", "orders")).toBeDefined();
      expect(toConvexId("validid12345678", "trades")).toBeDefined();
      expect(toConvexId("validid12345678", "balances")).toBeDefined();
      expect(toConvexId("validid12345678", "positions")).toBeDefined();
      expect(toConvexId("validid12345678", "predictions")).toBeDefined();
      expect(toConvexId("validid12345678", "markets")).toBeDefined();
      expect(toConvexId("validid12345678", "rewards")).toBeDefined();
      expect(toConvexId("validid12345678", "pointsTransactions")).toBeDefined();
      expect(toConvexId("validid12345678", "kycRecords")).toBeDefined();
    });
  });
});
