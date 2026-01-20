/**
 * PlaidClient Unit Tests
 * Comprehensive tests for the Plaid banking API client
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PlaidClient, PlaidClientConfig } from "../../services/plaid/client";
import { PlaidApiError } from "../../services/plaid/types";
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

const testConfig: PlaidClientConfig = {
  clientId: "test-client-id",
  secret: "test-secret",
  env: "sandbox",
  timeout: 5000,
  logger: mockLogger,
};

describe("PlaidClient", () => {
  let client: PlaidClient;

  beforeEach(() => {
    client = new PlaidClient(testConfig);
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor & Configuration
  // ==========================================================================

  describe("constructor", () => {
    it("should create client with valid config", () => {
      expect(client).toBeInstanceOf(PlaidClient);
    });

    it("should use sandbox URL for sandbox environment", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-token-123",
          expiration: new Date(Date.now() + 3600000).toISOString(),
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("sandbox.plaid.com"),
        expect.any(Object)
      );
    });

    it("should use production URL for production environment", async () => {
      const prodClient = new PlaidClient({
        ...testConfig,
        env: "production",
      });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-token-123",
          expiration: new Date(Date.now() + 3600000).toISOString(),
          request_id: "req-123",
        })
      );

      await prodClient.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("production.plaid.com"),
        expect.any(Object)
      );
    });

    it("should use development URL for development environment", async () => {
      const devClient = new PlaidClient({
        ...testConfig,
        env: "development",
      });

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-token-123",
          expiration: new Date(Date.now() + 3600000).toISOString(),
          request_id: "req-123",
        })
      );

      await devClient.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("development.plaid.com"),
        expect.any(Object)
      );
    });
  });

  describe("getEnvironment", () => {
    it("should return the configured environment", () => {
      expect(client.getEnvironment()).toBe("sandbox");
    });
  });

  describe("isSandbox", () => {
    it("should return true for sandbox environment", () => {
      expect(client.isSandbox()).toBe(true);
    });

    it("should return false for production environment", () => {
      const prodClient = new PlaidClient({ ...testConfig, env: "production" });
      expect(prodClient.isSandbox()).toBe(false);
    });
  });

  // ==========================================================================
  // Link Token
  // ==========================================================================

  describe("createLinkToken", () => {
    it("should create a link token", async () => {
      const mockResponse = {
        link_token: "link-sandbox-123",
        expiration: "2024-12-31T23:59:59Z",
        request_id: "req-123",
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await client.createLinkToken({
        userId: "user_123",
        products: ["auth", "transactions"],
      });

      expect(result.link_token).toBe("link-sandbox-123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/link/token/create"),
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should include client_id and secret in request body", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-123",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.client_id).toBe("test-client-id");
      expect(body.secret).toBe("test-secret");
    });

    it("should pass all link token parameters", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-123",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth", "identity"],
        clientName: "My App",
        countryCodes: ["US", "CA"],
        language: "en",
        webhook: "https://example.com/webhook",
        redirectUri: "https://example.com/redirect",
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.products).toEqual(["auth", "identity"]);
      expect(body.client_name).toBe("My App");
      expect(body.country_codes).toEqual(["US", "CA"]);
      expect(body.webhook).toBe("https://example.com/webhook");
    });

    it("should log link token creation", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-123",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Creating link token",
        expect.objectContaining({ userId: "user_123" })
      );
    });
  });

  // ==========================================================================
  // Token Exchange
  // ==========================================================================

  describe("exchangePublicToken", () => {
    it("should exchange public token for access token", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          access_token: "access-sandbox-123",
          item_id: "item-123",
          request_id: "req-123",
        })
      );

      const result = await client.exchangePublicToken("public-sandbox-123");

      expect(result.accessToken).toBe("access-sandbox-123");
      expect(result.itemId).toBe("item-123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/item/public_token/exchange"),
        expect.any(Object)
      );
    });

    it("should log successful exchange", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          access_token: "access-123",
          item_id: "item-123",
          request_id: "req-123",
        })
      );

      await client.exchangePublicToken("public-123");

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Token exchanged",
        expect.objectContaining({ itemId: "item-123" })
      );
    });
  });

  describe("getItem", () => {
    it("should return item information", async () => {
      const mockItem = {
        item_id: "item-123",
        institution_id: "ins_123",
        webhook: "https://example.com/webhook",
        error: null,
        available_products: ["transactions"],
        billed_products: ["auth"],
        consent_expiration_time: null,
      };

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          item: mockItem,
          status: { transactions: {} },
          request_id: "req-123",
        })
      );

      const item = await client.getItem("access-123");

      expect(item.item_id).toBe("item-123");
    });
  });

  describe("removeItem", () => {
    it("should remove an item", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ request_id: "req-123" })
      );

      await client.removeItem("access-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/item/remove"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith("Item removed");
    });
  });

  // ==========================================================================
  // Auth
  // ==========================================================================

  describe("getAuth", () => {
    it("should return auth data with account and routing numbers", async () => {
      const mockAuth = {
        accounts: fixtures.plaidAccounts,
        numbers: {
          ach: [
            { account_id: "acc_checking", account: "1234567890", routing: "011000015", wire_routing: null },
          ],
        },
        item: { item_id: "item-123" },
        request_id: "req-123",
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockAuth));

      const response = await client.getAuth("access-123");

      expect(response.accounts).toHaveLength(2);
      expect(response.numbers.ach[0].routing).toBe("011000015");
    });
  });

  // ==========================================================================
  // Identity
  // ==========================================================================

  describe("getIdentity", () => {
    it("should return identity information", async () => {
      const mockIdentity = {
        accounts: [
          {
            ...factories.plaidAccount(),
            owners: [
              {
                names: ["John Doe"],
                phone_numbers: [{ data: "+1234567890", primary: true, type: "mobile" }],
                emails: [{ data: "john@example.com", primary: true, type: "primary" }],
                addresses: [
                  {
                    data: {
                      city: "San Francisco",
                      region: "CA",
                      street: "123 Main St",
                      postal_code: "94105",
                      country: "US",
                    },
                    primary: true,
                  },
                ],
              },
            ],
          },
        ],
        item: { item_id: "item-123" },
        request_id: "req-123",
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockIdentity));

      const response = await client.getIdentity("access-123");

      expect(response.accounts[0].owners[0].names).toContain("John Doe");
    });
  });

  // ==========================================================================
  // Balance
  // ==========================================================================

  describe("getBalance", () => {
    it("should return account balances", async () => {
      const mockBalance = {
        accounts: fixtures.plaidAccounts,
        item: { item_id: "item-123" },
        request_id: "req-123",
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockBalance));

      const response = await client.getBalance("access-123");

      expect(response.accounts).toHaveLength(2);
      expect(response.accounts[0].balances.available).toBe(5000);
    });

    it("should filter by account IDs when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          accounts: [fixtures.plaidAccounts[0]],
          item: { item_id: "item-123" },
          request_id: "req-123",
        })
      );

      await client.getBalance("access-123", ["acc_checking"]);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.options.account_ids).toEqual(["acc_checking"]);
    });
  });

  describe("getAccounts", () => {
    it("should return accounts without balance refresh", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          accounts: fixtures.plaidAccounts,
          item: { item_id: "item-123" },
          request_id: "req-123",
        })
      );

      const result = await client.getAccounts("access-123");

      expect(result.accounts).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/accounts/get"),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Transfers
  // ==========================================================================

  describe("createTransfer", () => {
    it("should create an ACH transfer", async () => {
      const mockTransfer = factories.transfer();

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfer: mockTransfer,
          request_id: "req-123",
        })
      );

      const transfer = await client.createTransfer({
        accessToken: "access-123",
        accountId: "acc_123",
        type: "debit",
        network: "ach",
        amount: "100.00",
        achClass: "ppd",
        description: "Test transfer",
        user: {
          legal_name: "John Doe",
        },
      });

      expect(transfer.id).toBe("transfer_123");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/transfer/create"),
        expect.any(Object)
      );
    });

    it("should log transfer creation", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfer: factories.transfer({ id: "tr_new" }),
          request_id: "req-123",
        })
      );

      await client.createTransfer({
        accessToken: "access-123",
        accountId: "acc_123",
        type: "debit",
        network: "ach",
        amount: "50.00",
        description: "Test",
        user: { legal_name: "Test User" },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Transfer created",
        expect.objectContaining({ transferId: "tr_new" })
      );
    });
  });

  describe("getTransfer", () => {
    it("should return transfer details", async () => {
      const mockTransfer = factories.transfer();

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfer: mockTransfer,
          request_id: "req-123",
        })
      );

      const transfer = await client.getTransfer("transfer_123");

      expect(transfer.id).toBe("transfer_123");
    });
  });

  describe("listTransfers", () => {
    it("should return list of transfers", async () => {
      const mockTransfers = [
        factories.transfer({ id: "t1" }),
        factories.transfer({ id: "t2" }),
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfers: mockTransfers,
          request_id: "req-123",
        })
      );

      const transfers = await client.listTransfers();

      expect(transfers).toHaveLength(2);
    });

    it("should pass filter parameters", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfers: [],
          request_id: "req-123",
        })
      );

      await client.listTransfers({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        count: 10,
        offset: 5,
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.start_date).toBe("2024-01-01");
      expect(body.end_date).toBe("2024-12-31");
      expect(body.count).toBe(10);
      expect(body.offset).toBe(5);
    });
  });

  describe("cancelTransfer", () => {
    it("should cancel a pending transfer", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({ request_id: "req-123" })
      );

      await client.cancelTransfer("transfer_123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/transfer/cancel"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Transfer canceled",
        expect.objectContaining({ transferId: "transfer_123" })
      );
    });
  });

  describe("getTransferEvents", () => {
    it("should return transfer events", async () => {
      const mockEvents = [
        {
          event_id: "e1",
          timestamp: "2024-01-15T10:00:00Z",
          event_type: "pending",
          account_id: "acc_123",
          transfer_id: "t1",
          origination_account_id: null,
          transfer_type: "debit",
          transfer_amount: "100.00",
          failure_reason: null,
          sweep_id: null,
          sweep_amount: null,
        },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          transfer_events: mockEvents,
          request_id: "req-123",
        })
      );

      const events = await client.getTransferEvents({ transferId: "t1" });

      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("pending");
    });
  });

  // ==========================================================================
  // Processor Tokens
  // ==========================================================================

  describe("createProcessorToken", () => {
    it("should create a processor token", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          processor_token: "processor-sandbox-123",
          request_id: "req-123",
        })
      );

      const token = await client.createProcessorToken(
        "access-123",
        "acc_123",
        "stripe"
      );

      expect(token).toBe("processor-sandbox-123");
    });
  });

  describe("createStripeBankAccountToken", () => {
    it("should create a Stripe bank account token", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          stripe_bank_account_token: "btok_123",
          request_id: "req-123",
        })
      );

      const token = await client.createStripeBankAccountToken(
        "access-123",
        "acc_123"
      );

      expect(token).toBe("btok_123");
    });
  });

  // ==========================================================================
  // Webhooks
  // ==========================================================================

  describe("updateWebhook", () => {
    it("should update webhook URL", async () => {
      const mockItem = {
        item_id: "item-123",
        institution_id: "ins_123",
        webhook: "https://new.example.com/webhook",
        error: null,
        available_products: [],
        billed_products: [],
        consent_expiration_time: null,
      };

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          item: mockItem,
          request_id: "req-123",
        })
      );

      const item = await client.updateWebhook(
        "access-123",
        "https://new.example.com/webhook"
      );

      expect(item.webhook).toBe("https://new.example.com/webhook");
    });
  });

  // ==========================================================================
  // Institutions
  // ==========================================================================

  describe("getInstitution", () => {
    it("should return institution details", async () => {
      const mockInstitution = {
        institution_id: "ins_123",
        name: "Chase",
        products: ["auth", "transactions"],
        country_codes: ["US"],
        url: "https://chase.com",
        primary_color: "#117ACA",
        logo: null,
        routing_numbers: ["021000021"],
        oauth: false,
      };

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          institution: mockInstitution,
          request_id: "req-123",
        })
      );

      const institution = await client.getInstitution("ins_123");

      expect(institution.name).toBe("Chase");
      expect(institution.institution_id).toBe("ins_123");
    });
  });

  describe("searchInstitutions", () => {
    it("should search for institutions", async () => {
      const mockInstitutions = [
        { institution_id: "ins_1", name: "Chase", products: ["auth"], country_codes: ["US"], oauth: false },
        { institution_id: "ins_2", name: "Charles Schwab", products: ["auth"], country_codes: ["US"], oauth: true },
      ];

      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          institutions: mockInstitutions,
          request_id: "req-123",
        })
      );

      const institutions = await client.searchInstitutions("cha");

      expect(institutions).toHaveLength(2);
      expect(institutions[0].name).toBe("Chase");
    });

    it("should pass search parameters", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          institutions: [],
          request_id: "req-123",
        })
      );

      await client.searchInstitutions(
        "bank",
        ["auth", "identity"],
        ["US", "CA"],
        20
      );

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.query).toBe("bank");
      expect(body.products).toEqual(["auth", "identity"]);
      expect(body.country_codes).toEqual(["US", "CA"]);
      expect(body.count).toBe(20);
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe("error handling", () => {
    it("should throw PlaidApiError on API error", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error_type: "INVALID_REQUEST",
            error_code: "INVALID_FIELD",
            error_message: "Invalid field value",
            display_message: "Please check your input",
            request_id: "req-123",
          },
          400
        )
      );

      await expect(client.getBalance("access-123")).rejects.toThrow(PlaidApiError);
    });

    it("should include error details in PlaidApiError", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error_type: "ITEM_ERROR",
            error_code: "ITEM_LOGIN_REQUIRED",
            error_message: "User must re-authenticate",
            display_message: "Please log in again",
            request_id: "req-123",
          },
          400
        )
      );

      try {
        await client.getBalance("access-123");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PlaidApiError);
        expect((error as PlaidApiError).errorType).toBe("ITEM_ERROR");
        expect((error as PlaidApiError).errorCode).toBe("ITEM_LOGIN_REQUIRED");
      }
    });

    it("should handle timeout errors", async () => {
      mockFetch.mockImplementationOnce(() => {
        const error = new Error("Timeout");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      try {
        await client.getBalance("access-123");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PlaidApiError);
        expect((error as PlaidApiError).errorCode).toBe("TIMEOUT");
      }
    });

    it("should handle network errors", async () => {
      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(new Error("Network error"));
      });

      try {
        await client.getBalance("access-123");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PlaidApiError);
        expect((error as PlaidApiError).errorCode).toBe("INTERNAL_ERROR");
      }
    });

    it("should log errors", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(
          {
            error_type: "INVALID_REQUEST",
            error_code: "INVALID_ACCESS_TOKEN",
            error_message: "Invalid access token",
            display_message: null,
            request_id: "req-123",
          },
          401
        )
      );

      await expect(client.getBalance("invalid-token")).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Plaid API error",
        expect.objectContaining({
          errorType: "INVALID_REQUEST",
          errorCode: "INVALID_ACCESS_TOKEN",
        })
      );
    });
  });

  // ==========================================================================
  // Request Headers
  // ==========================================================================

  describe("request headers", () => {
    it("should include Plaid-Version header", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-123",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers["Plaid-Version"]).toBe("2020-09-14");
    });

    it("should include Content-Type header", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse({
          link_token: "link-123",
          expiration: "2024-12-31T23:59:59Z",
          request_id: "req-123",
        })
      );

      await client.createLinkToken({
        userId: "user_123",
        products: ["auth"],
      });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers["Content-Type"]).toBe("application/json");
    });
  });
});
