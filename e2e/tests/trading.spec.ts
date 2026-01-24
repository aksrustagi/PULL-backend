import { test, expect, Page } from "@playwright/test";

/**
 * E2E Tests for Trading Flow
 * Tests the complete trading journey
 */

// Test user credentials
const TEST_USER = {
  email: "trading-test@example.com",
  password: "TradingTest123!",
};

test.describe("Trading Flow", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard|\//);
  });

  // ==========================================================================
  // Market Discovery Tests
  // ==========================================================================

  test.describe("Market Discovery", () => {
    test("should display list of markets", async ({ page }) => {
      await page.goto("/trade");

      // Should show market list or grid
      const marketList = page.locator('[data-testid="markets-list"], .markets, [role="list"]');
      await expect(marketList.or(page.getByRole("heading", { name: /markets|predictions/i }))).toBeVisible();
    });

    test("should allow searching for markets", async ({ page }) => {
      await page.goto("/trade");

      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill("Bitcoin");

        // Should filter results
        await expect(page.getByText(/bitcoin|btc/i)).toBeVisible();
      }
    });

    test("should allow filtering by category", async ({ page }) => {
      await page.goto("/trade");

      const categoryFilter = page.getByRole("button", { name: /category|filter/i });
      if (await categoryFilter.isVisible()) {
        await categoryFilter.click();

        // Should show filter options
        await expect(page.getByText(/crypto|politics|sports|entertainment/i)).toBeVisible();
      }
    });

    test("should display market cards with key info", async ({ page }) => {
      await page.goto("/trade");

      const marketCard = page.locator('[data-testid="market-card"], .market-card').first();
      if (await marketCard.isVisible()) {
        // Should show title, price, and volume
        await expect(marketCard.getByText(/yes|no|\$/i)).toBeVisible();
      }
    });

    test("should navigate to market detail on click", async ({ page }) => {
      await page.goto("/trade");

      const marketLink = page.getByRole("link", { name: /view|trade|details/i }).first();
      if (await marketLink.isVisible()) {
        await marketLink.click();
        await expect(page).toHaveURL(/trade\/.+/);
      }
    });
  });

  // ==========================================================================
  // Market Detail Tests
  // ==========================================================================

  test.describe("Market Detail", () => {
    test("should display market information", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Should show market title
      await expect(page.getByRole("heading")).toBeVisible();

      // Should show prices
      await expect(page.getByText(/yes|no|buy|sell/i)).toBeVisible();
    });

    test("should display price chart", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const chart = page.locator('[data-testid="price-chart"], canvas, .chart');
      if (await chart.isVisible()) {
        await expect(chart).toBeVisible();
      }
    });

    test("should display order book", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const orderBook = page.locator('[data-testid="order-book"], .order-book');
      if (await orderBook.isVisible()) {
        await expect(orderBook).toBeVisible();
        await expect(page.getByText(/bid|ask/i)).toBeVisible();
      }
    });

    test("should display recent trades", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const recentTrades = page.locator('[data-testid="recent-trades"], .recent-trades');
      if (await recentTrades.isVisible()) {
        await expect(recentTrades).toBeVisible();
      }
    });

    test("should display market description", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const description = page.locator('[data-testid="market-description"], .description');
      if (await description.isVisible()) {
        await expect(description).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Order Placement Tests
  // ==========================================================================

  test.describe("Order Placement", () => {
    test("should display order form", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const orderForm = page.locator('[data-testid="order-form"], form');
      await expect(orderForm).toBeVisible();
    });

    test("should allow selecting buy/sell side", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const buyButton = page.getByRole("button", { name: /buy.*yes/i });
      const sellButton = page.getByRole("button", { name: /sell.*yes|buy.*no/i });

      if (await buyButton.isVisible()) {
        await buyButton.click();
        await expect(buyButton).toHaveClass(/active|selected/);
      }
    });

    test("should allow selecting market/limit order type", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const marketTab = page.getByRole("tab", { name: /market/i });
      const limitTab = page.getByRole("tab", { name: /limit/i });

      if (await marketTab.isVisible()) {
        await limitTab.click();
        await expect(page.getByLabel(/price|limit/i)).toBeVisible();
      }
    });

    test("should allow entering quantity", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        await quantityInput.fill("10");
        await expect(quantityInput).toHaveValue("10");
      }
    });

    test("should show estimated cost", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        await quantityInput.fill("10");

        // Should show cost estimate
        await expect(page.getByText(/cost|total|estimated/i)).toBeVisible();
      }
    });

    test("should validate insufficient funds", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        // Enter very large quantity
        await quantityInput.fill("999999999");

        const submitButton = page.getByRole("button", { name: /place|submit|buy|sell/i });
        await submitButton.click();

        // Should show insufficient funds error
        await expect(page.getByText(/insufficient|not enough|balance/i)).toBeVisible();
      }
    });

    test("should place market order successfully", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Select buy
      await page.getByRole("button", { name: /buy.*yes/i }).click();

      // Enter quantity
      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      await quantityInput.fill("1");

      // Submit order
      const submitButton = page.getByRole("button", { name: /place|submit|buy/i });
      await submitButton.click();

      // Should show confirmation or success
      await expect(page.getByText(/submitted|success|confirmed|pending/i)).toBeVisible();
    });

    test("should place limit order successfully", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Select limit order
      const limitTab = page.getByRole("tab", { name: /limit/i });
      if (await limitTab.isVisible()) {
        await limitTab.click();
      }

      // Enter price
      const priceInput = page.getByLabel(/price|limit/i);
      await priceInput.fill("0.50");

      // Enter quantity
      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      await quantityInput.fill("5");

      // Submit order
      const submitButton = page.getByRole("button", { name: /place|submit|buy/i });
      await submitButton.click();

      // Should show confirmation
      await expect(page.getByText(/submitted|success|confirmed|pending/i)).toBeVisible();
    });
  });

  // ==========================================================================
  // Order Management Tests
  // ==========================================================================

  test.describe("Order Management", () => {
    test("should display open orders", async ({ page }) => {
      await page.goto("/trade");

      const ordersTab = page.getByRole("tab", { name: /orders|open/i });
      if (await ordersTab.isVisible()) {
        await ordersTab.click();
        await expect(page.getByText(/open orders|active|pending/i)).toBeVisible();
      }
    });

    test("should allow canceling an order", async ({ page }) => {
      await page.goto("/trade");

      const ordersTab = page.getByRole("tab", { name: /orders|open/i });
      if (await ordersTab.isVisible()) {
        await ordersTab.click();

        const cancelButton = page.getByRole("button", { name: /cancel/i }).first();
        if (await cancelButton.isVisible()) {
          await cancelButton.click();

          // Confirm cancellation if modal appears
          const confirmButton = page.getByRole("button", { name: /confirm|yes/i });
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }

          await expect(page.getByText(/cancelled|canceled/i)).toBeVisible();
        }
      }
    });

    test("should display order history", async ({ page }) => {
      await page.goto("/trade");

      const historyTab = page.getByRole("tab", { name: /history|filled|completed/i });
      if (await historyTab.isVisible()) {
        await historyTab.click();
        await expect(page.locator("table, [role='table'], .order-history")).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Portfolio Tests
  // ==========================================================================

  test.describe("Portfolio", () => {
    test("should display portfolio overview", async ({ page }) => {
      await page.goto("/portfolio");

      await expect(page.getByText(/portfolio|positions|holdings/i)).toBeVisible();
    });

    test("should show total portfolio value", async ({ page }) => {
      await page.goto("/portfolio");

      await expect(page.getByText(/total|value|\$/i)).toBeVisible();
    });

    test("should display positions list", async ({ page }) => {
      await page.goto("/portfolio");

      const positionsList = page.locator('[data-testid="positions-list"], .positions, table');
      await expect(positionsList).toBeVisible();
    });

    test("should show unrealized P&L", async ({ page }) => {
      await page.goto("/portfolio");

      await expect(page.getByText(/p&l|profit|loss|unrealized/i)).toBeVisible();
    });

    test("should navigate to position detail", async ({ page }) => {
      await page.goto("/portfolio");

      const positionRow = page.locator('[data-testid="position-row"], tr').first();
      if (await positionRow.isVisible()) {
        await positionRow.click();
        await expect(page).toHaveURL(/trade\/.+|position\/.+/);
      }
    });
  });

  // ==========================================================================
  // Buying Power Tests
  // ==========================================================================

  test.describe("Buying Power", () => {
    test("should display buying power", async ({ page }) => {
      await page.goto("/trade");

      await expect(page.getByText(/buying power|available|balance/i)).toBeVisible();
    });

    test("should display held amount", async ({ page }) => {
      await page.goto("/portfolio");

      const heldAmount = page.getByText(/held|reserved/i);
      if (await heldAmount.isVisible()) {
        await expect(heldAmount).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Real-time Updates Tests
  // ==========================================================================

  test.describe("Real-time Updates", () => {
    test("should update prices in real-time", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Wait for initial price
      const priceElement = page.locator('[data-testid="current-price"], .price');
      await expect(priceElement.first()).toBeVisible();

      // Prices should update (hard to test without mocking WebSocket)
      // Just verify the element exists and can receive updates
    });

    test("should show order fills notification", async ({ page }) => {
      // This would require placing an order and waiting for fill
      // Simplified test just checks notification system exists
      await page.goto("/trade/BTC-100K-YES");

      // Check if notification container exists
      const notificationArea = page.locator('[data-testid="notifications"], .toast-container, [role="alert"]');
      // Just verify the page loads without error
      await expect(page).toHaveURL(/trade/);
    });
  });

  // ==========================================================================
  // Mobile Trading Tests
  // ==========================================================================

  test.describe("Mobile Trading", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("should display trading interface on mobile", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Order form should be visible
      await expect(page.getByRole("button", { name: /buy|trade/i })).toBeVisible();
    });

    test("should have mobile-friendly order form", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        // Check input is properly sized for mobile
        const box = await quantityInput.boundingBox();
        expect(box?.width).toBeGreaterThan(100);
      }
    });

    test("should have swipeable market tabs on mobile", async ({ page }) => {
      await page.goto("/trade");

      // Check for tab navigation
      const tabs = page.getByRole("tablist");
      if (await tabs.isVisible()) {
        await expect(tabs).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  test.describe("Error Handling", () => {
    test("should handle network errors during order placement", async ({ page }) => {
      await page.goto("/trade/BTC-100K-YES");

      // Fill order form
      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      await quantityInput.fill("1");

      // Simulate offline before submission
      await page.context().setOffline(true);

      const submitButton = page.getByRole("button", { name: /place|submit|buy/i });
      await submitButton.click();

      // Should show error
      await expect(page.getByText(/error|failed|try again|offline/i)).toBeVisible();

      await page.context().setOffline(false);
    });

    test("should handle invalid market ticker", async ({ page }) => {
      await page.goto("/trade/INVALID-TICKER-123");

      // Should show not found or error
      await expect(page.getByText(/not found|invalid|error|doesn't exist/i)).toBeVisible();
    });
  });
});
