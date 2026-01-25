/**
 * Order Execution Workflow Unit Tests
 * Tests for Temporal order execution workflow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker, Runtime, DefaultLogger, LogEntry } from "@temporalio/worker";
import {
  orderExecutionWorkflow,
  cancelOrderSignal,
  getOrderStatusQuery,
  type OrderExecutionInput,
  type OrderStatus,
} from "../../workflows/trading/order-execution.workflow";
import { factories } from "../setup";

// ============================================================================
// Mock Activities
// ============================================================================

const mockActivities = {
  validateKYCStatus: vi.fn(),
  checkBuyingPower: vi.fn(),
  holdBuyingPower: vi.fn(),
  releaseBuyingPower: vi.fn(),
  submitOrderToKalshi: vi.fn(),
  cancelKalshiOrder: vi.fn(),
  pollOrderStatus: vi.fn(),
  settleOrder: vi.fn(),
  updateConvexBalances: vi.fn(),
  sendOrderNotification: vi.fn(),
  recordAuditLog: vi.fn(),
};

// ============================================================================
// Test Configuration
// ============================================================================

const defaultInput: OrderExecutionInput = {
  userId: "user_123",
  assetType: "prediction",
  assetId: "BTC-100K-YES",
  side: "buy",
  orderType: "limit",
  quantity: 100,
  limitPrice: 0.55,
};

describe("orderExecutionWorkflow", () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up default mock implementations
    mockActivities.validateKYCStatus.mockResolvedValue({
      allowed: true,
      tier: "verified",
    });

    mockActivities.checkBuyingPower.mockResolvedValue({
      available: 10000,
      held: 0,
    });

    mockActivities.holdBuyingPower.mockResolvedValue({
      holdId: "hold_123",
      amount: 55,
    });

    mockActivities.submitOrderToKalshi.mockResolvedValue({
      externalOrderId: "kalshi_order_123",
      status: "pending",
    });

    mockActivities.pollOrderStatus.mockResolvedValue({
      status: "filled",
      fills: [
        { quantity: 100, price: 0.55, timestamp: new Date().toISOString() },
      ],
    });

    mockActivities.settleOrder.mockResolvedValue({ success: true });
    mockActivities.updateConvexBalances.mockResolvedValue({ success: true });
    mockActivities.releaseBuyingPower.mockResolvedValue({ success: true });
    mockActivities.sendOrderNotification.mockResolvedValue({ success: true });
    mockActivities.recordAuditLog.mockResolvedValue({ success: true });
    mockActivities.cancelKalshiOrder.mockResolvedValue({ success: true });

    // Create test environment
    testEnv = await TestWorkflowEnvironment.createLocal();

    // Create worker with mock activities
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: "test-order-execution",
      workflowsPath: require.resolve("../../workflows/trading/order-execution.workflow"),
      activities: mockActivities,
    });
  });

  afterEach(async () => {
    await testEnv?.teardown();
  });

  // ==========================================================================
  // Happy Path Tests
  // ==========================================================================

  describe("happy path", () => {
    it("should execute order successfully", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-1",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        const result = await handle.result();

        expect(result.orderId).toBeDefined();
        expect(result.status.status).toBe("filled");
        expect(result.status.filledQuantity).toBe(100);
      });
    });

    it("should validate KYC status first", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-2",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.validateKYCStatus).toHaveBeenCalledWith(
          "user_123",
          "prediction"
        );
      });
    });

    it("should check and hold buying power", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-3",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.checkBuyingPower).toHaveBeenCalledWith(
          "user_123",
          "prediction"
        );
        expect(mockActivities.holdBuyingPower).toHaveBeenCalled();
      });
    });

    it("should submit order to Kalshi", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-4",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.submitOrderToKalshi).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user_123",
            assetId: "BTC-100K-YES",
            side: "buy",
            orderType: "limit",
            quantity: 100,
            limitPrice: 0.55,
          })
        );
      });
    });

    it("should settle order after fill", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-5",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.settleOrder).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user_123",
            filledQuantity: 100,
          })
        );
      });
    });

    it("should update Convex balances", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-6",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.updateConvexBalances).toHaveBeenCalled();
      });
    });

    it("should send fill notification", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-7",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.sendOrderNotification).toHaveBeenCalledWith(
          "user_123",
          expect.any(String),
          "filled",
          undefined,
          expect.objectContaining({
            filledQuantity: 100,
          })
        );
      });
    });

    it("should record audit logs", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-order-8",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.recordAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user_123",
            action: "order_submitted",
          })
        );
        expect(mockActivities.recordAuditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user_123",
            action: "order_completed",
          })
        );
      });
    });
  });

  // ==========================================================================
  // Partial Fill Tests
  // ==========================================================================

  describe("partial fills", () => {
    it("should handle partial fill followed by complete fill", async () => {
      mockActivities.pollOrderStatus
        .mockResolvedValueOnce({
          status: "partial",
          fills: [{ quantity: 50, price: 0.55, timestamp: new Date().toISOString() }],
        })
        .mockResolvedValueOnce({
          status: "filled",
          fills: [
            { quantity: 50, price: 0.55, timestamp: new Date().toISOString() },
            { quantity: 50, price: 0.54, timestamp: new Date().toISOString() },
          ],
        });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-partial-1",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("filled");
        expect(result.status.filledQuantity).toBe(100);
        expect(result.status.fills).toHaveLength(2);
      });
    });

    it("should calculate correct average price for partial fills", async () => {
      mockActivities.pollOrderStatus.mockResolvedValueOnce({
        status: "filled",
        fills: [
          { quantity: 60, price: 0.55, timestamp: new Date().toISOString() },
          { quantity: 40, price: 0.50, timestamp: new Date().toISOString() },
        ],
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-partial-2",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        const result = await handle.result();

        // Average price: (60 * 0.55 + 40 * 0.50) / 100 = 0.53
        expect(result.status.averagePrice).toBeCloseTo(0.53, 2);
      });
    });
  });

  // ==========================================================================
  // Failure Tests
  // ==========================================================================

  describe("failure scenarios", () => {
    it("should reject order when KYC validation fails", async () => {
      mockActivities.validateKYCStatus.mockResolvedValue({
        allowed: false,
        reason: "KYC not completed",
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-kyc-fail",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await expect(handle.result()).rejects.toThrow("KYC validation failed");
      });
    });

    it("should reject order when insufficient buying power", async () => {
      mockActivities.checkBuyingPower.mockResolvedValue({
        available: 10,
        held: 0,
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-buying-power-fail",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await expect(handle.result()).rejects.toThrow("Insufficient buying power");
      });
    });

    it("should send rejection notification on failure", async () => {
      mockActivities.validateKYCStatus.mockResolvedValue({
        allowed: false,
        reason: "Account suspended",
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-notify-fail",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await expect(handle.result()).rejects.toThrow();

        expect(mockActivities.sendOrderNotification).toHaveBeenCalledWith(
          "user_123",
          expect.any(String),
          "rejected",
          "Account suspended"
        );
      });
    });

    it("should handle order rejection from exchange", async () => {
      mockActivities.pollOrderStatus.mockResolvedValue({
        status: "rejected",
        fills: [],
        reason: "Market closed",
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-exchange-reject",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("rejected");
        expect(result.status.failureReason).toBe("Market closed");
      });
    });

    it("should release held funds on rejection", async () => {
      mockActivities.pollOrderStatus.mockResolvedValue({
        status: "rejected",
        fills: [],
        reason: "Insufficient liquidity",
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-release-funds",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();

        expect(mockActivities.releaseBuyingPower).toHaveBeenCalled();
      });
    });

    it("should record audit log on failure", async () => {
      mockActivities.validateKYCStatus.mockResolvedValue({
        allowed: false,
        reason: "KYC expired",
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-audit-fail",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await expect(handle.result()).rejects.toThrow();
      });
    });
  });

  // ==========================================================================
  // Cancellation Tests
  // ==========================================================================

  describe("cancellation scenarios", () => {
    it("should cancel order before submission", async () => {
      // Delay the submission to allow cancellation signal
      mockActivities.holdBuyingPower.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { holdId: "hold_123", amount: 55 };
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-before-submit",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        // Send cancellation signal
        await handle.signal(cancelOrderSignal);

        const result = await handle.result();

        expect(result.status.status).toBe("cancelled");
        expect(mockActivities.submitOrderToKalshi).not.toHaveBeenCalled();
      });
    });

    it("should cancel order during execution", async () => {
      // First poll returns pending, second returns after cancellation
      mockActivities.pollOrderStatus
        .mockResolvedValueOnce({
          status: "pending",
          fills: [],
        })
        .mockResolvedValueOnce({
          status: "cancelled",
          fills: [],
        });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-during",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        // Wait for order to be submitted, then cancel
        await new Promise((resolve) => setTimeout(resolve, 50));
        await handle.signal(cancelOrderSignal);

        const result = await handle.result();

        expect(result.status.cancellationRequested).toBe(true);
      });
    });

    it("should cancel order on exchange when requested", async () => {
      mockActivities.pollOrderStatus.mockResolvedValueOnce({
        status: "pending",
        fills: [],
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-exchange",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        await handle.signal(cancelOrderSignal);

        await handle.result();

        expect(mockActivities.cancelKalshiOrder).toHaveBeenCalledWith(
          "kalshi_order_123"
        );
      });
    });

    it("should settle partial fill on cancellation", async () => {
      mockActivities.pollOrderStatus.mockResolvedValueOnce({
        status: "partial",
        fills: [{ quantity: 50, price: 0.55, timestamp: new Date().toISOString() }],
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-partial",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        await handle.signal(cancelOrderSignal);

        const result = await handle.result();

        expect(result.status.status).toBe("cancelled");
        expect(result.status.filledQuantity).toBe(50);
        expect(mockActivities.settleOrder).toHaveBeenCalled();
      });
    });

    it("should release unused hold on cancellation", async () => {
      mockActivities.pollOrderStatus.mockResolvedValueOnce({
        status: "partial",
        fills: [{ quantity: 50, price: 0.55, timestamp: new Date().toISOString() }],
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-release",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        await handle.signal(cancelOrderSignal);

        await handle.result();

        expect(mockActivities.releaseBuyingPower).toHaveBeenCalled();
      });
    });

    it("should send cancellation notification", async () => {
      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-cancel-notify",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.signal(cancelOrderSignal);
        await handle.result();

        expect(mockActivities.sendOrderNotification).toHaveBeenCalledWith(
          "user_123",
          expect.any(String),
          "cancelled"
        );
      });
    });
  });

  // ==========================================================================
  // Query Tests
  // ==========================================================================

  describe("status queries", () => {
    it("should return current order status via query", async () => {
      mockActivities.pollOrderStatus.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {
          status: "filled",
          fills: [{ quantity: 100, price: 0.55, timestamp: new Date().toISOString() }],
        };
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-query-status",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        // Query while workflow is in progress
        await new Promise((resolve) => setTimeout(resolve, 50));
        const status = await handle.query(getOrderStatusQuery);

        expect(status).toBeDefined();
        expect(status.orderId).toBeDefined();
        expect(["validating", "holding_funds", "submitted", "pending"]).toContain(
          status.status
        );

        await handle.result();
      });
    });

    it("should track fill progress", async () => {
      let pollCount = 0;
      mockActivities.pollOrderStatus.mockImplementation(async () => {
        pollCount++;
        if (pollCount < 3) {
          return {
            status: "partial",
            fills: Array(pollCount)
              .fill(null)
              .map((_, i) => ({
                quantity: 33,
                price: 0.55,
                timestamp: new Date().toISOString(),
              })),
          };
        }
        return {
          status: "filled",
          fills: [
            { quantity: 33, price: 0.55, timestamp: new Date().toISOString() },
            { quantity: 33, price: 0.55, timestamp: new Date().toISOString() },
            { quantity: 34, price: 0.54, timestamp: new Date().toISOString() },
          ],
        };
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-query-progress",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        await handle.result();
      });
    });
  });

  // ==========================================================================
  // Market Order Tests
  // ==========================================================================

  describe("market orders", () => {
    it("should handle market order with estimated cost buffer", async () => {
      const marketOrderInput: OrderExecutionInput = {
        ...defaultInput,
        orderType: "market",
        limitPrice: undefined,
      };

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-market-order",
          taskQueue: "test-order-execution",
          args: [marketOrderInput],
        });

        await handle.result();

        expect(mockActivities.holdBuyingPower).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Sell Order Tests
  // ==========================================================================

  describe("sell orders", () => {
    it("should not require buying power hold for sell orders", async () => {
      const sellOrderInput: OrderExecutionInput = {
        ...defaultInput,
        side: "sell",
      };

      mockActivities.pollOrderStatus.mockResolvedValue({
        status: "filled",
        fills: [{ quantity: 100, price: 0.55, timestamp: new Date().toISOString() }],
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-sell-order",
          taskQueue: "test-order-execution",
          args: [sellOrderInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("filled");
      });
    });
  });

  // ==========================================================================
  // Activity Retry Tests
  // ==========================================================================

  describe("activity retries", () => {
    it("should retry failed activities", async () => {
      let attempts = 0;
      mockActivities.submitOrderToKalshi.mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary failure");
        }
        return {
          externalOrderId: "kalshi_order_123",
          status: "pending",
        };
      });

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-retry",
          taskQueue: "test-order-execution",
          args: [defaultInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("filled");
        expect(attempts).toBe(2);
      });
    });
  });

  // ==========================================================================
  // Different Asset Types
  // ==========================================================================

  describe("different asset types", () => {
    it("should handle RWA orders", async () => {
      const rwaInput: OrderExecutionInput = {
        ...defaultInput,
        assetType: "rwa",
        assetId: "pokemon-card-123",
      };

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-rwa-order",
          taskQueue: "test-order-execution",
          args: [rwaInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("filled");
        expect(mockActivities.validateKYCStatus).toHaveBeenCalledWith(
          "user_123",
          "rwa"
        );
      });
    });

    it("should handle crypto orders", async () => {
      const cryptoInput: OrderExecutionInput = {
        ...defaultInput,
        assetType: "crypto",
        assetId: "BTC",
      };

      await worker.runUntil(async () => {
        const handle = await testEnv.client.workflow.start(orderExecutionWorkflow, {
          workflowId: "test-crypto-order",
          taskQueue: "test-order-execution",
          args: [cryptoInput],
        });

        const result = await handle.result();

        expect(result.status.status).toBe("filled");
        expect(mockActivities.validateKYCStatus).toHaveBeenCalledWith(
          "user_123",
          "crypto"
        );
      });
    });
  });
});
