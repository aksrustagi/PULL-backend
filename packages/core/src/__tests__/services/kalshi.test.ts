/**
 * KalshiClient Unit Tests
 * Comprehensive tests for the Kalshi prediction market API client
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { KalshiClient, KalshiClientConfig } from "../../services/kalshi/client";
import { KalshiApiError } from "../../services/kalshi/types";
import {
  mockFetch,
  createMockFetchResponse,
  createMockFetchError,
  mockLogger,
  factories,
  fixtures,
} from "../setup";

// ============================================================================
// Test Configuration
// ============================================================================

const testConfig: KalshiClientConfig = {
  apiKeyId: "test-api-key",
  privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0m59l2u9iDnMbrXHfqkOrn2dVQ3vfBJqcDuFUK03d+1PZGbV
test-key-data
-----END RSA PRIVATE KEY-----`,
  demoMode: true,
  timeout: 5000,
  maxRetries: 2,
  logger: mockLogger,
};

describe("KalshiClient", () => {
  let client: KalshiClient;

  beforeEach(() => {
    client = new KalshiClient(testConfig);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor & Configuration
  // ==========================================================================

  describe("constructor", () => {
    it("should create client with valid config", () => {
      expect(client).toBeInstanceOf(KalshiClient);
    });

    it("should use demo URL when demoMode is true", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ trading_active: true, exchange_active: true })
      );

      await client.getExchangeStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("demo-api.kalshi.co"),
        expect.any(Object)
      );
    });

    it("should use production URL when demoMode is false", async () => {
      const prodClient = new KalshiClient({
        ...testConfig,
        demoMode: false,
        baseUrl: undefined,
      });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ trading_active: true, exchange_active: true })
      );

      await prodClient.getExchangeStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.elections.kalshi.com"),
        expect.any(Object)
      );
    });

    it("should use custom baseUrl when provided", async () => {
      const customClient = new KalshiClient({
        ...testConfig,
        baseUrl: "https://custom.kalshi.com",
      });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ trading_active: true, exchange_active: true })
      );

      await customClient.getExchangeStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("custom.kalshi.com"),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Market Data (Public Endpoints)
  // ==========================================================================

  describe("getExchangeStatus", () => {
    it("should return exchange status", async () => {
      const mockStatus = {
        trading_active: true,
        exchange_active: true,
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockStatus));

      const status = await client.getExchangeStatus();

      expect(status).toEqual(mockStatus);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/exchange/status"),
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should not require authentication", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ trading_active: true, exchange_active: true })
      );

      await client.getExchangeStatus();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers).not.toHaveProperty("KALSHI-ACCESS-KEY");
    });
  });

  describe("getMarkets", () => {
    it("should return list of markets", async () => {
      const mockResponse = {
        markets: fixtures.kalshiMarkets,
        cursor: null,
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const response = await client.getMarkets();

      expect(response.markets).toHaveLength(3);
      expect(response.markets[0].ticker).toBe("BTC-100K-YES");
    });

    it("should pass query parameters", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ markets: [], cursor: null })
      );

      await client.getMarkets({
        status: "open",
        series_ticker: "CRYPTO",
        limit: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/status=open/),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/series_ticker=CRYPTO/),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/limit=10/),
        expect.any(Object)
      );
    });

    it("should handle pagination cursor", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          markets: fixtures.kalshiMarkets.slice(0, 2),
          cursor: "next-page-cursor",
        })
      );

      const response = await client.getMarkets({ cursor: "previous-cursor" });

      expect(response.cursor).toBe("next-page-cursor");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/cursor=previous-cursor/),
        expect.any(Object)
      );
    });
  });

  describe("getMarket", () => {
    it("should return single market details", async () => {
      const mockMarket = factories.market({ ticker: "BTC-100K-YES" });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ market: mockMarket })
      );

      const market = await client.getMarket("BTC-100K-YES");

      expect(market.ticker).toBe("BTC-100K-YES");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/markets/BTC-100K-YES"),
        expect.any(Object)
      );
    });

    it("should throw error for non-existent market", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchError("Market not found", "MARKET_NOT_FOUND", 404)
      );

      await expect(client.getMarket("INVALID-TICKER")).rejects.toThrow(
        KalshiApiError
      );
    });
  });

  describe("getMarketOrderbook", () => {
    it("should return orderbook for market", async () => {
      const mockOrderbook = {
        yes: [
          [0.55, 100],
          [0.54, 200],
        ],
        no: [
          [0.45, 150],
          [0.44, 250],
        ],
      };

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ orderbook: mockOrderbook })
      );

      const orderbook = await client.getMarketOrderbook("BTC-100K-YES");

      expect(orderbook.yes).toHaveLength(2);
      expect(orderbook.no).toHaveLength(2);
    });

    it("should pass depth parameter", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ orderbook: { yes: [], no: [] } })
      );

      await client.getMarketOrderbook("BTC-100K-YES", 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/depth=5/),
        expect.any(Object)
      );
    });
  });

  describe("getEvents", () => {
    it("should return list of events", async () => {
      const mockEvents = [
        { event_ticker: "CRYPTO", title: "Crypto Events", markets: [] },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ events: mockEvents, cursor: null })
      );

      const response = await client.getEvents();

      expect(response.events).toHaveLength(1);
    });

    it("should filter by status", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ events: [], cursor: null })
      );

      await client.getEvents({ status: "open" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/status=open/),
        expect.any(Object)
      );
    });
  });

  describe("getEvent", () => {
    it("should return single event", async () => {
      const mockEvent = { event_ticker: "CRYPTO", title: "Crypto Events" };

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ event: mockEvent })
      );

      const event = await client.getEvent("CRYPTO");

      expect(event.event_ticker).toBe("CRYPTO");
    });

    it("should include nested markets when requested", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          event: { event_ticker: "CRYPTO", markets: fixtures.kalshiMarkets },
        })
      );

      await client.getEvent("CRYPTO", true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/with_nested_markets=true/),
        expect.any(Object)
      );
    });
  });

  describe("getTrades", () => {
    it("should return recent trades for market", async () => {
      const mockTrades = [
        { trade_id: "t1", price: 0.55, count: 10, taker_side: "yes" },
        { trade_id: "t2", price: 0.54, count: 5, taker_side: "no" },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ trades: mockTrades, cursor: null })
      );

      const response = await client.getTrades("BTC-100K-YES");

      expect(response.trades).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Portfolio (Authenticated Endpoints)
  // ==========================================================================

  describe("getBalance", () => {
    it("should return account balance", async () => {
      const mockBalance = factories.balance();

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockBalance));

      const balance = await client.getBalance();

      expect(balance.balance).toBe(10000);
      expect(balance.available_balance).toBe(8000);
    });

    it("should include authentication headers", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(factories.balance())
      );

      await client.getBalance();

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers["KALSHI-ACCESS-KEY"]).toBe("test-api-key");
      expect(callArgs.headers["KALSHI-ACCESS-SIGNATURE"]).toBeDefined();
      expect(callArgs.headers["KALSHI-ACCESS-TIMESTAMP"]).toBeDefined();
    });
  });

  describe("getPositions", () => {
    it("should return user positions", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          positions: fixtures.kalshiPositions,
          cursor: null,
        })
      );

      const response = await client.getPositions();

      expect(response.positions).toHaveLength(2);
      expect(response.positions[0].ticker).toBe("BTC-100K-YES");
    });

    it("should filter by settlement status", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ positions: [], cursor: null })
      );

      await client.getPositions({ settlement_status: "settled" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/settlement_status=settled/),
        expect.any(Object)
      );
    });
  });

  describe("getOrders", () => {
    it("should return user orders", async () => {
      const mockOrders = [
        factories.order({ orderId: "o1", status: "pending" }),
        factories.order({ orderId: "o2", status: "filled" }),
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ orders: mockOrders, cursor: null })
      );

      const response = await client.getOrders();

      expect(response.orders).toHaveLength(2);
    });

    it("should filter by status", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ orders: [], cursor: null })
      );

      await client.getOrders({ status: "resting" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/status=resting/),
        expect.any(Object)
      );
    });
  });

  describe("getOrder", () => {
    it("should return single order", async () => {
      const mockOrder = factories.order({ orderId: "ord_123" });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ order: mockOrder })
      );

      const order = await client.getOrder("ord_123");

      expect(order.orderId).toBe("ord_123");
    });
  });

  describe("getFills", () => {
    it("should return trade fills", async () => {
      const mockFills = [
        { fill_id: "f1", order_id: "o1", price: 0.55, count: 10 },
        { fill_id: "f2", order_id: "o2", price: 0.54, count: 5 },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ fills: mockFills, cursor: null })
      );

      const response = await client.getFills();

      expect(response.fills).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Trading
  // ==========================================================================

  describe("createOrder", () => {
    it("should create a new order", async () => {
      const mockOrder = factories.order({ orderId: "ord_new" });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ order: mockOrder })
      );

      const order = await client.createOrder({
        ticker: "BTC-100K-YES",
        side: "yes",
        type: "limit",
        count: 10,
        yes_price: 55,
        action: "buy",
      });

      expect(order.orderId).toBe("ord_new");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/orders"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("BTC-100K-YES"),
        })
      );
    });

    it("should log order creation", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          order: factories.order({ order_id: "ord_123" }),
        })
      );

      await client.createOrder({
        ticker: "BTC-100K-YES",
        side: "yes",
        type: "market",
        count: 10,
        action: "buy",
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Order created",
        expect.objectContaining({ ticker: "BTC-100K-YES" })
      );
    });
  });

  describe("batchCreateOrders", () => {
    it("should create multiple orders", async () => {
      const mockOrders = [
        factories.order({ orderId: "o1" }),
        factories.order({ orderId: "o2" }),
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ orders: mockOrders })
      );

      const orders = await client.batchCreateOrders({
        orders: [
          { ticker: "BTC-100K-YES", side: "yes", type: "limit", count: 10, yes_price: 55, action: "buy" },
          { ticker: "ETH-10K-YES", side: "yes", type: "limit", count: 5, yes_price: 45, action: "buy" },
        ],
      });

      expect(orders).toHaveLength(2);
    });
  });

  describe("cancelOrder", () => {
    it("should cancel an order", async () => {
      const mockOrder = factories.order({ orderId: "ord_123", status: "cancelled" as "pending" });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ order: mockOrder })
      );

      const order = await client.cancelOrder("ord_123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/orders/ord_123"),
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("batchCancelOrders", () => {
    it("should cancel multiple orders", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          canceled: ["o1", "o2"],
          failed: [],
        })
      );

      const result = await client.batchCancelOrders(["o1", "o2"]);

      expect(result.canceled).toContain("o1");
      expect(result.canceled).toContain("o2");
    });

    it("should report failed cancellations", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          canceled: ["o1"],
          failed: ["o2"],
        })
      );

      const result = await client.batchCancelOrders(["o1", "o2"]);

      expect(result.canceled).toContain("o1");
      expect(result.failed).toContain("o2");
    });
  });

  describe("amendOrder", () => {
    it("should amend an existing order", async () => {
      const mockOrder = factories.order({ orderId: "ord_123", price: 0.60 });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ order: mockOrder })
      );

      const order = await client.amendOrder("ord_123", { count: 20 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/orders/ord_123/amend"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("decreaseOrder", () => {
    it("should decrease order size", async () => {
      const mockOrder = factories.order({ orderId: "ord_123", quantity: 80 });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ order: mockOrder })
      );

      const order = await client.decreaseOrder("ord_123", 20);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/portfolio/orders/ord_123/decrease"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("20"),
        })
      );
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe("error handling", () => {
    it("should throw KalshiApiError on 4xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchError("Invalid request", "INVALID_REQUEST", 400)
      );

      await expect(client.getBalance()).rejects.toThrow(KalshiApiError);
    });

    it("should include error details in KalshiApiError", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchError("Order not found", "ORDER_NOT_FOUND", 404)
      );

      try {
        await client.getOrder("invalid-id");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(KalshiApiError);
        expect((error as KalshiApiError).code).toBe("ORDER_NOT_FOUND");
        expect((error as KalshiApiError).statusCode).toBe(404);
      }
    });

    it("should retry on 5xx errors", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockFetchError("Server error", "SERVER_ERROR", 500))
        .mockResolvedValueOnce(createMockFetchResponse(factories.balance()));

      const balance = await client.getBalance();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(balance.balance).toBe(10000);
    });

    it("should retry on rate limiting (429)", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockFetchError("Rate limited", "RATE_LIMITED", 429))
        .mockResolvedValueOnce(createMockFetchResponse(factories.balance()));

      const balance = await client.getBalance();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should not retry on 4xx errors (except 429)", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchError("Bad request", "BAD_REQUEST", 400)
      );

      await expect(client.getBalance()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw after max retries exceeded", async () => {
      mockFetch
        .mockResolvedValueOnce(createMockFetchError("Server error", "SERVER_ERROR", 500))
        .mockResolvedValueOnce(createMockFetchError("Server error", "SERVER_ERROR", 500))
        .mockResolvedValueOnce(createMockFetchError("Server error", "SERVER_ERROR", 500));

      await expect(client.getBalance()).rejects.toThrow(KalshiApiError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should handle timeout errors", async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error("Timeout");
        error.name = "AbortError";
        return Promise.reject(error);
      });
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(factories.balance()));

      const balance = await client.getBalance();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  describe("rate limiting", () => {
    it("should track rate limit info", async () => {
      mockFetch.mockResolvedValueOnce(createMockFetchResponse(factories.balance()));

      await client.getBalance();

      const rateLimitInfo = client.getRateLimitInfo();
      expect(rateLimitInfo).not.toBeNull();
      expect(rateLimitInfo?.limit).toBe(100);
      expect(rateLimitInfo?.remaining).toBe(99);
    });
  });

  // ==========================================================================
  // Pagination Helpers
  // ==========================================================================

  describe("paginateMarkets", () => {
    it("should iterate through all pages", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockFetchResponse({
            markets: [factories.market({ ticker: "M1" })],
            cursor: "page2",
          })
        )
        .mockResolvedValueOnce(
          createMockFetchResponse({
            markets: [factories.market({ ticker: "M2" })],
            cursor: "page3",
          })
        )
        .mockResolvedValueOnce(
          createMockFetchResponse({
            markets: [factories.market({ ticker: "M3" })],
            cursor: null,
          })
        );

      const markets: string[] = [];
      for await (const market of client.paginateMarkets()) {
        markets.push(market.ticker);
      }

      expect(markets).toEqual(["M1", "M2", "M3"]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("paginateOrders", () => {
    it("should iterate through all pages of orders", async () => {
      mockFetch
        .mockResolvedValueOnce(
          createMockFetchResponse({
            orders: [factories.order({ orderId: "o1" })],
            cursor: "page2",
          })
        )
        .mockResolvedValueOnce(
          createMockFetchResponse({
            orders: [factories.order({ orderId: "o2" })],
            cursor: null,
          })
        );

      const orders: string[] = [];
      for await (const order of client.paginateOrders()) {
        orders.push(order.orderId);
      }

      expect(orders).toEqual(["o1", "o2"]);
    });
  });
});
