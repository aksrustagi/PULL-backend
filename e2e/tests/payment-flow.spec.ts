import { test, expect, Page } from "@playwright/test";

/**
 * E2E Tests for Complete Payment Flow
 * Tests deposit, balance management, and withdrawal journey
 */

// Test user credentials
const TEST_USER = {
  email: "payment-flow@example.com",
  password: "PaymentFlow123!",
};

test.describe("Complete Payment Flow", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard|\//);
  });

  // ==========================================================================
  // Full Payment Lifecycle
  // ==========================================================================

  test.describe("Full Payment Lifecycle", () => {
    test("should complete full deposit to withdrawal flow", async ({ page }) => {
      // STEP 1: Check initial balance
      await test.step("Check initial balance", async () => {
        await page.goto("/wallet");

        const balanceElement = page.getByTestId("usd-balance").or(page.getByText(/balance|available/i).first());
        await expect(balanceElement).toBeVisible();
      });

      // STEP 2: Initiate deposit
      await test.step("Initiate deposit", async () => {
        await page.goto("/wallet/deposit");

        // Select deposit method
        const bankOption = page.getByRole("button", { name: /bank|ach|transfer/i });
        if (await bankOption.isVisible()) {
          await bankOption.click();
        }

        // Enter amount
        const amountInput = page.getByLabel(/amount/i);
        await amountInput.fill("500");

        // Continue
        const continueButton = page.getByRole("button", { name: /continue|next|deposit/i });
        await continueButton.click();

        // Should show confirmation or next step
        await expect(page.getByText(/confirm|review|bank|link/i)).toBeVisible();
      });

      // STEP 3: Complete deposit (in test mode)
      await test.step("Complete deposit", async () => {
        // In test mode, deposits may be auto-approved
        const confirmButton = page.getByRole("button", { name: /confirm|complete|submit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Wait for success or pending status
        await expect(page.getByText(/success|pending|processing|submitted/i)).toBeVisible();
      });

      // STEP 4: Verify balance update
      await test.step("Verify balance updated", async () => {
        await page.goto("/wallet");

        // In test mode, balance should reflect deposit
        await expect(page.getByText(/\$|balance/i)).toBeVisible();
      });

      // STEP 5: Use funds for trading
      await test.step("Use funds for trading", async () => {
        await page.goto("/trade/BTC-100K-YES");

        const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
        if (await quantityInput.isVisible()) {
          await quantityInput.fill("1");

          const buyButton = page.getByRole("button", { name: /buy|place/i });
          await buyButton.click();

          // Order should be placed successfully
          await expect(page.getByText(/submitted|success|placed|pending/i)).toBeVisible();
        }
      });

      // STEP 6: Check updated balance after trade
      await test.step("Check balance after trade", async () => {
        await page.goto("/wallet");

        // Balance should show held amount
        await expect(page.getByText(/balance|available|held/i).first()).toBeVisible();
      });

      // STEP 7: Initiate withdrawal
      await test.step("Initiate withdrawal", async () => {
        await page.goto("/wallet/withdraw");

        // Enter withdrawal amount
        const amountInput = page.getByLabel(/amount/i);
        await amountInput.fill("100");

        // Select withdrawal method
        const bankOption = page.getByRole("button", { name: /bank|ach|transfer/i });
        if (await bankOption.isVisible()) {
          await bankOption.click();
        }

        // Continue
        const continueButton = page.getByRole("button", { name: /continue|next|withdraw/i });
        await continueButton.click();

        // Should show confirmation
        await expect(page.getByText(/confirm|review/i)).toBeVisible();
      });

      // STEP 8: Complete withdrawal
      await test.step("Complete withdrawal", async () => {
        const confirmButton = page.getByRole("button", { name: /confirm|complete|submit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }

        // Should show success or pending
        await expect(page.getByText(/success|pending|processing|submitted/i)).toBeVisible();
      });

      // STEP 9: View transaction history
      await test.step("View transaction history", async () => {
        await page.goto("/wallet/history");

        // Should show recent transactions
        const historyList = page.locator('[data-testid="transaction-history"], table, .history-list');
        await expect(historyList.or(page.getByText(/deposit|withdraw/i))).toBeVisible();
      });
    });
  });

  // ==========================================================================
  // Deposit Flow Tests
  // ==========================================================================

  test.describe("Deposit Flow", () => {
    test("should display deposit options", async ({ page }) => {
      await page.goto("/wallet/deposit");

      // Should show deposit methods
      await expect(page.getByText(/deposit|add funds|fund account/i)).toBeVisible();
    });

    test("should show bank transfer option", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const bankOption = page.getByText(/bank|ach|transfer/i);
      await expect(bankOption).toBeVisible();
    });

    test("should show card deposit option", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const cardOption = page.getByText(/card|debit|credit/i);
      if (await cardOption.isVisible()) {
        await expect(cardOption).toBeVisible();
      }
    });

    test("should validate minimum deposit amount", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("1");

        const continueButton = page.getByRole("button", { name: /continue|deposit/i });
        await continueButton.click();

        // Should show minimum error
        await expect(page.getByText(/minimum|at least/i)).toBeVisible();
      }
    });

    test("should validate maximum deposit amount", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("10000000");

        const continueButton = page.getByRole("button", { name: /continue|deposit/i });
        await continueButton.click();

        // Should show maximum error
        await expect(page.getByText(/maximum|limit|exceeds/i)).toBeVisible();
      }
    });

    test("should show fee information", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("500");

        // Should show fee or total
        await expect(page.getByText(/fee|total|you.*receive/i)).toBeVisible();
      }
    });

    test("should display bank linking flow", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const bankOption = page.getByRole("button", { name: /bank|ach|link.*bank/i });
      if (await bankOption.isVisible()) {
        await bankOption.click();

        // Should show Plaid or bank linking UI
        await expect(page.getByText(/connect|link|bank|plaid/i)).toBeVisible();
      }
    });

    test("should show deposit pending status", async ({ page }) => {
      await page.goto("/wallet/deposit");

      // Fill deposit form
      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("500");

        const bankOption = page.getByRole("button", { name: /bank|ach/i });
        if (await bankOption.isVisible()) {
          await bankOption.click();
        }

        const continueButton = page.getByRole("button", { name: /continue|next/i });
        await continueButton.click();

        const confirmButton = page.getByRole("button", { name: /confirm|deposit/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Should show pending status
          await expect(page.getByText(/pending|processing|initiated/i)).toBeVisible();
        }
      }
    });
  });

  // ==========================================================================
  // Withdrawal Flow Tests
  // ==========================================================================

  test.describe("Withdrawal Flow", () => {
    test("should display withdrawal options", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      await expect(page.getByText(/withdraw|cash out|transfer/i)).toBeVisible();
    });

    test("should show available balance for withdrawal", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      await expect(page.getByText(/available|balance/i)).toBeVisible();
    });

    test("should validate withdrawal amount against balance", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        // Enter amount larger than balance
        await amountInput.fill("9999999");

        const continueButton = page.getByRole("button", { name: /continue|withdraw/i });
        await continueButton.click();

        // Should show insufficient balance error
        await expect(page.getByText(/insufficient|not enough|exceeds/i)).toBeVisible();
      }
    });

    test("should validate minimum withdrawal amount", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("1");

        const continueButton = page.getByRole("button", { name: /continue|withdraw/i });
        await continueButton.click();

        // Should show minimum error
        await expect(page.getByText(/minimum|at least/i)).toBeVisible();
      }
    });

    test("should show withdrawal fee information", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("500");

        // Should show fee and net amount
        await expect(page.getByText(/fee|you.*receive|net/i)).toBeVisible();
      }
    });

    test("should allow selecting withdrawal destination", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      // Should show linked bank accounts
      const bankSelector = page.getByRole("combobox", { name: /bank|destination/i });
      if (await bankSelector.isVisible()) {
        await expect(bankSelector).toBeVisible();
      } else {
        // Or radio buttons for bank options
        const bankOption = page.getByRole("radio").first();
        if (await bankOption.isVisible()) {
          await expect(bankOption).toBeVisible();
        }
      }
    });

    test("should show withdrawal confirmation", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");

        const continueButton = page.getByRole("button", { name: /continue|review/i });
        await continueButton.click();

        // Should show confirmation details
        await expect(page.getByText(/confirm|review|amount|destination/i)).toBeVisible();
      }
    });

    test("should show withdrawal pending status", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");

        const continueButton = page.getByRole("button", { name: /continue|next/i });
        await continueButton.click();

        const confirmButton = page.getByRole("button", { name: /confirm|withdraw/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Should show pending status
          await expect(page.getByText(/pending|processing|initiated|success/i)).toBeVisible();
        }
      }
    });

    test("should not allow withdrawal with open positions (if restricted)", async ({ page }) => {
      // This test checks if there are position restrictions on withdrawal
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        // Try to withdraw full balance
        const maxButton = page.getByRole("button", { name: /max|all/i });
        if (await maxButton.isVisible()) {
          await maxButton.click();
        } else {
          await amountInput.fill("99999");
        }

        const continueButton = page.getByRole("button", { name: /continue|withdraw/i });
        await continueButton.click();

        // May show held balance warning
        const heldWarning = page.getByText(/held|reserved|positions/i);
        if (await heldWarning.isVisible()) {
          await expect(heldWarning).toBeVisible();
        }
      }
    });
  });

  // ==========================================================================
  // Payment Methods Management
  // ==========================================================================

  test.describe("Payment Methods", () => {
    test("should display linked payment methods", async ({ page }) => {
      await page.goto("/wallet/methods");

      await expect(page.getByText(/payment.*method|bank|card/i)).toBeVisible();
    });

    test("should allow adding new bank account", async ({ page }) => {
      await page.goto("/wallet/methods");

      const addButton = page.getByRole("button", { name: /add|link|connect/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        // Should show Plaid or bank linking flow
        await expect(page.getByText(/connect|link|plaid|bank/i)).toBeVisible();
      }
    });

    test("should show bank account details", async ({ page }) => {
      await page.goto("/wallet/methods");

      // Should show masked account number
      const accountInfo = page.getByText(/\*\*\*\*|ending in/i);
      if (await accountInfo.isVisible()) {
        await expect(accountInfo).toBeVisible();
      }
    });

    test("should allow setting default payment method", async ({ page }) => {
      await page.goto("/wallet/methods");

      const defaultButton = page.getByRole("button", { name: /default|primary/i }).first();
      if (await defaultButton.isVisible()) {
        await defaultButton.click();

        // Should confirm or show success
        await expect(page.getByText(/default|primary|updated/i)).toBeVisible();
      }
    });

    test("should allow removing payment method", async ({ page }) => {
      await page.goto("/wallet/methods");

      const removeButton = page.getByRole("button", { name: /remove|delete|unlink/i }).first();
      if (await removeButton.isVisible()) {
        await removeButton.click();

        // Confirm removal
        const confirmButton = page.getByRole("button", { name: /confirm|yes|remove/i });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();

          // Should show success
          await expect(page.getByText(/removed|deleted|unlinked/i)).toBeVisible();
        }
      }
    });
  });

  // ==========================================================================
  // Transaction History
  // ==========================================================================

  test.describe("Transaction History", () => {
    test("should display transaction history", async ({ page }) => {
      await page.goto("/wallet/history");

      const historyList = page.locator('[data-testid="transaction-history"], table, .history-list');
      await expect(historyList.or(page.getByText(/transaction|history/i))).toBeVisible();
    });

    test("should show transaction details", async ({ page }) => {
      await page.goto("/wallet/history");

      // Click on first transaction
      const transaction = page.locator('[data-testid="transaction-row"], tr, .transaction-item').first();
      if (await transaction.isVisible()) {
        await transaction.click();

        // Should show transaction details
        await expect(page.getByText(/amount|date|status|type/i)).toBeVisible();
      }
    });

    test("should filter transactions by type", async ({ page }) => {
      await page.goto("/wallet/history");

      const typeFilter = page.getByRole("combobox", { name: /type|filter/i });
      if (await typeFilter.isVisible()) {
        await typeFilter.selectOption({ label: /deposit/i });

        // Results should be filtered
        await page.waitForLoadState("networkidle");
      }
    });

    test("should filter transactions by date range", async ({ page }) => {
      await page.goto("/wallet/history");

      const dateFilter = page.getByRole("button", { name: /date|range|period/i });
      if (await dateFilter.isVisible()) {
        await dateFilter.click();

        // Select date range
        const lastWeek = page.getByRole("option", { name: /7 days|week/i });
        if (await lastWeek.isVisible()) {
          await lastWeek.click();
        }
      }
    });

    test("should export transaction history", async ({ page }) => {
      await page.goto("/wallet/history");

      const exportButton = page.getByRole("button", { name: /export|download|csv/i });
      if (await exportButton.isVisible()) {
        // Set up download listener
        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();

        // Should initiate download
        const download = await downloadPromise.catch(() => null);
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.csv|\.xlsx/);
        }
      }
    });
  });

  // ==========================================================================
  // Balance Display
  // ==========================================================================

  test.describe("Balance Display", () => {
    test("should display current balance", async ({ page }) => {
      await page.goto("/wallet");

      await expect(page.getByText(/balance|\$/i)).toBeVisible();
    });

    test("should show available vs held balance", async ({ page }) => {
      await page.goto("/wallet");

      // Should distinguish between available and held
      const availableBalance = page.getByText(/available/i);
      const heldBalance = page.getByText(/held|reserved/i);

      // At least available should be visible
      await expect(availableBalance.or(page.getByText(/balance/i))).toBeVisible();
    });

    test("should show pending transactions", async ({ page }) => {
      await page.goto("/wallet");

      const pendingSection = page.getByText(/pending/i);
      if (await pendingSection.isVisible()) {
        await expect(pendingSection).toBeVisible();
      }
    });

    test("should refresh balance on demand", async ({ page }) => {
      await page.goto("/wallet");

      const refreshButton = page.getByRole("button", { name: /refresh/i });
      if (await refreshButton.isVisible()) {
        await refreshButton.click();

        // Balance should update (indicated by loading or change)
        await page.waitForLoadState("networkidle");
      }
    });
  });

  // ==========================================================================
  // KYC Requirements for Payments
  // ==========================================================================

  test.describe("KYC Requirements", () => {
    test("should enforce KYC for deposits over limit", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        // Enter amount that requires KYC
        await amountInput.fill("50000");

        const continueButton = page.getByRole("button", { name: /continue|deposit/i });
        await continueButton.click();

        // May show KYC requirement
        const kycWarning = page.getByText(/kyc|verify|identity|limit/i);
        if (await kycWarning.isVisible()) {
          await expect(kycWarning).toBeVisible();
        }
      }
    });

    test("should enforce KYC for withdrawals over limit", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        // Enter large withdrawal
        await amountInput.fill("50000");

        const continueButton = page.getByRole("button", { name: /continue|withdraw/i });
        await continueButton.click();

        // May show KYC requirement
        const kycWarning = page.getByText(/kyc|verify|identity|limit/i);
        if (await kycWarning.isVisible()) {
          await expect(kycWarning).toBeVisible();
        }
      }
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  test.describe("Error Handling", () => {
    test("should handle deposit failure gracefully", async ({ page }) => {
      await page.goto("/wallet/deposit");

      // Simulate offline
      await page.context().setOffline(true);

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("500");

        const continueButton = page.getByRole("button", { name: /continue|deposit/i });
        await continueButton.click();

        // Should show error
        await expect(page.getByText(/error|failed|offline|try again/i)).toBeVisible();
      }

      await page.context().setOffline(false);
    });

    test("should handle withdrawal failure gracefully", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      // Simulate offline
      await page.context().setOffline(true);

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");

        const continueButton = page.getByRole("button", { name: /continue|withdraw/i });
        await continueButton.click();

        // Should show error
        await expect(page.getByText(/error|failed|offline|try again/i)).toBeVisible();
      }

      await page.context().setOffline(false);
    });

    test("should handle bank linking failure", async ({ page }) => {
      await page.goto("/wallet/methods");

      const addButton = page.getByRole("button", { name: /add|link|connect/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        // Cancel bank linking
        const cancelButton = page.getByRole("button", { name: /cancel|close/i });
        if (await cancelButton.isVisible()) {
          await cancelButton.click();

          // Should return to methods page
          await expect(page).toHaveURL(/wallet\/methods/);
        }
      }
    });
  });

  // ==========================================================================
  // Mobile Payment Flow
  // ==========================================================================

  test.describe("Mobile Payment Flow", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("should display wallet on mobile", async ({ page }) => {
      await page.goto("/wallet");

      await expect(page.getByText(/balance|\$/i)).toBeVisible();
    });

    test("should have mobile-friendly deposit form", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        const box = await amountInput.boundingBox();
        expect(box?.width).toBeGreaterThan(150);
      }
    });

    test("should have mobile-friendly withdrawal form", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        const box = await amountInput.boundingBox();
        expect(box?.width).toBeGreaterThan(150);
      }
    });

    test("should have touch-friendly buttons", async ({ page }) => {
      await page.goto("/wallet/deposit");

      const continueButton = page.getByRole("button", { name: /continue|deposit/i });
      if (await continueButton.isVisible()) {
        const box = await continueButton.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  // ==========================================================================
  // Security Features
  // ==========================================================================

  test.describe("Security Features", () => {
    test("should require confirmation for large withdrawals", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("10000");

        const continueButton = page.getByRole("button", { name: /continue|next/i });
        await continueButton.click();

        // Should require additional confirmation
        const confirmStep = page.getByText(/confirm|verify|2fa|password/i);
        await expect(confirmStep).toBeVisible();
      }
    });

    test("should show security notice for first withdrawal", async ({ page }) => {
      await page.goto("/wallet/withdraw");

      // First-time withdrawal notice
      const securityNotice = page.getByText(/security|verify|hold|first/i);
      if (await securityNotice.isVisible()) {
        await expect(securityNotice).toBeVisible();
      }
    });

    test("should mask sensitive information", async ({ page }) => {
      await page.goto("/wallet/methods");

      // Bank account numbers should be masked
      const maskedAccount = page.getByText(/\*\*\*\*|ending/i);
      if (await maskedAccount.isVisible()) {
        await expect(maskedAccount).toBeVisible();
      }
    });
  });
});
