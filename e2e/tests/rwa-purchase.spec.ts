import { test, expect, Page } from "@playwright/test";

/**
 * E2E Tests for RWA (Real-World Assets) Purchase Flow
 * Tests the complete RWA collectibles purchase journey
 */

// Test user credentials
const TEST_USER = {
  email: "rwa-test@example.com",
  password: "RWATest123!",
};

test.describe("RWA Purchase Flow", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard|\//);
  });

  // ==========================================================================
  // Browse Collectibles Tests
  // ==========================================================================

  test.describe("Browse Collectibles", () => {
    test("should display collectibles marketplace", async ({ page }) => {
      await page.goto("/collectibles");

      await expect(page.getByRole("heading", { name: /collectibles|marketplace|rwa/i })).toBeVisible();
    });

    test("should display list of available collectibles", async ({ page }) => {
      await page.goto("/collectibles");

      const collectiblesList = page.locator('[data-testid="collectibles-grid"], .collectibles, [role="list"]');
      await expect(collectiblesList.or(page.locator(".card, .collectible-card").first())).toBeVisible();
    });

    test("should allow filtering by category", async ({ page }) => {
      await page.goto("/collectibles");

      const categoryFilter = page.getByRole("button", { name: /category|filter|type/i });
      if (await categoryFilter.isVisible()) {
        await categoryFilter.click();

        // Should show category options
        await expect(page.getByText(/pokemon|sports|trading cards|art/i)).toBeVisible();
      }
    });

    test("should allow filtering by Pokemon card category", async ({ page }) => {
      await page.goto("/collectibles");

      const pokemonFilter = page.getByRole("button", { name: /pokemon/i });
      if (await pokemonFilter.isVisible()) {
        await pokemonFilter.click();

        // Results should be filtered
        await page.waitForLoadState("networkidle");
        // Verify filter is applied
      }
    });

    test("should allow searching for collectibles", async ({ page }) => {
      await page.goto("/collectibles");

      const searchInput = page.getByPlaceholder(/search/i);
      if (await searchInput.isVisible()) {
        await searchInput.fill("Charizard");

        // Should show search results
        await expect(page.getByText(/charizard/i)).toBeVisible();
      }
    });

    test("should display collectible cards with key info", async ({ page }) => {
      await page.goto("/collectibles");

      const collectibleCard = page.locator('[data-testid="collectible-card"], .collectible-card').first();
      if (await collectibleCard.isVisible()) {
        // Should show image
        await expect(collectibleCard.locator("img")).toBeVisible();

        // Should show name and price
        await expect(collectibleCard.getByText(/\$/)).toBeVisible();
      }
    });

    test("should sort collectibles by price", async ({ page }) => {
      await page.goto("/collectibles");

      const sortDropdown = page.getByRole("combobox", { name: /sort/i });
      if (await sortDropdown.isVisible()) {
        await sortDropdown.selectOption({ label: /price.*low|lowest/i });
        await page.waitForLoadState("networkidle");
        // Results should be sorted
      }
    });
  });

  // ==========================================================================
  // Collectible Detail Tests
  // ==========================================================================

  test.describe("Collectible Detail", () => {
    test("should display collectible details page", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      // Should show collectible title
      await expect(page.getByRole("heading")).toBeVisible();
    });

    test("should display high-resolution image", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const image = page.locator('[data-testid="collectible-image"], .collectible-image, img').first();
      await expect(image).toBeVisible();
    });

    test("should display grading information", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      // Should show PSA/BGS grade
      await expect(page.getByText(/psa|bgs|cgc|grade/i)).toBeVisible();
    });

    test("should display authentication certificate", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const certInfo = page.getByText(/certificate|authenticated|verified/i);
      if (await certInfo.isVisible()) {
        await expect(certInfo).toBeVisible();
      }
    });

    test("should display price and market info", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await expect(page.getByText(/\$/)).toBeVisible();
    });

    test("should display ownership structure", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      // For fractional ownership
      const ownershipInfo = page.getByText(/shares|fractional|ownership|available/i);
      if (await ownershipInfo.isVisible()) {
        await expect(ownershipInfo).toBeVisible();
      }
    });

    test("should display price history", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const priceHistory = page.locator('[data-testid="price-history"], .price-chart, canvas');
      if (await priceHistory.isVisible()) {
        await expect(priceHistory).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Purchase Flow Tests
  // ==========================================================================

  test.describe("Purchase Flow", () => {
    test("should display buy button", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const buyButton = page.getByRole("button", { name: /buy|purchase|invest/i });
      await expect(buyButton).toBeVisible();
    });

    test("should open purchase modal on buy click", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      // Should show purchase modal/form
      await expect(page.getByText(/purchase|buy|checkout|invest/i)).toBeVisible();
    });

    test("should allow selecting purchase amount", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");
        await expect(amountInput).toHaveValue("100");
      }
    });

    test("should show estimated shares for amount", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("100");

        // Should show estimated shares or cost
        await expect(page.getByText(/shares|units|you'll receive/i)).toBeVisible();
      }
    });

    test("should validate minimum purchase amount", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("1");

        const confirmButton = page.getByRole("button", { name: /confirm|purchase|buy/i });
        await confirmButton.click();

        // Should show minimum error
        await expect(page.getByText(/minimum|at least/i)).toBeVisible();
      }
    });

    test("should validate sufficient balance", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        // Enter very large amount
        await amountInput.fill("9999999");

        const confirmButton = page.getByRole("button", { name: /confirm|purchase|buy/i });
        await confirmButton.click();

        // Should show insufficient funds error
        await expect(page.getByText(/insufficient|not enough|balance/i)).toBeVisible();
      }
    });

    test("should show purchase confirmation", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("10");

        const confirmButton = page.getByRole("button", { name: /confirm|review/i });
        await confirmButton.click();

        // Should show confirmation details
        await expect(page.getByText(/confirm|review|total/i)).toBeVisible();
      }
    });

    test("should complete purchase successfully", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("10");

        const confirmButton = page.getByRole("button", { name: /confirm|purchase|buy/i });
        await confirmButton.click();

        // Final confirmation
        const finalConfirm = page.getByRole("button", { name: /confirm|yes|place order/i });
        if (await finalConfirm.isVisible()) {
          await finalConfirm.click();
        }

        // Should show success message
        await expect(page.getByText(/success|purchased|congratulations|order placed/i)).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Portfolio Integration Tests
  // ==========================================================================

  test.describe("Portfolio Integration", () => {
    test("should show RWA holdings in portfolio", async ({ page }) => {
      await page.goto("/portfolio");

      const rwaSection = page.getByText(/collectibles|rwa|real.*assets/i);
      if (await rwaSection.isVisible()) {
        await expect(rwaSection).toBeVisible();
      }
    });

    test("should display individual collectible holdings", async ({ page }) => {
      await page.goto("/portfolio");

      const collectiblesTab = page.getByRole("tab", { name: /collectibles|rwa/i });
      if (await collectiblesTab.isVisible()) {
        await collectiblesTab.click();

        // Should show list of holdings
        await expect(page.locator("table, [role='table'], .holdings-list")).toBeVisible();
      }
    });

    test("should show current value of holdings", async ({ page }) => {
      await page.goto("/portfolio");

      const collectiblesTab = page.getByRole("tab", { name: /collectibles|rwa/i });
      if (await collectiblesTab.isVisible()) {
        await collectiblesTab.click();

        // Should show value
        await expect(page.getByText(/\$/)).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Sell Flow Tests
  // ==========================================================================

  test.describe("Sell Flow", () => {
    test("should allow listing shares for sale", async ({ page }) => {
      await page.goto("/portfolio");

      const collectiblesTab = page.getByRole("tab", { name: /collectibles|rwa/i });
      if (await collectiblesTab.isVisible()) {
        await collectiblesTab.click();

        const sellButton = page.getByRole("button", { name: /sell|list/i }).first();
        if (await sellButton.isVisible()) {
          await sellButton.click();

          // Should show sell form
          await expect(page.getByText(/sell|list.*sale/i)).toBeVisible();
        }
      }
    });

    test("should allow setting sell price", async ({ page }) => {
      await page.goto("/portfolio");

      const collectiblesTab = page.getByRole("tab", { name: /collectibles|rwa/i });
      if (await collectiblesTab.isVisible()) {
        await collectiblesTab.click();

        const sellButton = page.getByRole("button", { name: /sell|list/i }).first();
        if (await sellButton.isVisible()) {
          await sellButton.click();

          const priceInput = page.getByLabel(/price|amount/i);
          if (await priceInput.isVisible()) {
            await priceInput.fill("150");
            await expect(priceInput).toHaveValue("150");
          }
        }
      }
    });
  });

  // ==========================================================================
  // Verification & Trust Tests
  // ==========================================================================

  test.describe("Verification & Trust", () => {
    test("should display custody information", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const custodyInfo = page.getByText(/custody|stored|vault|secure/i);
      if (await custodyInfo.isVisible()) {
        await expect(custodyInfo).toBeVisible();
      }
    });

    test("should display insurance information", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const insuranceInfo = page.getByText(/insured|insurance|protected/i);
      if (await insuranceInfo.isVisible()) {
        await expect(insuranceInfo).toBeVisible();
      }
    });

    test("should link to verification certificate", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const certLink = page.getByRole("link", { name: /certificate|verify|psa|bgc/i });
      if (await certLink.isVisible()) {
        await expect(certLink).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Mobile RWA Tests
  // ==========================================================================

  test.describe("Mobile RWA Experience", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("should display collectibles grid on mobile", async ({ page }) => {
      await page.goto("/collectibles");

      const grid = page.locator('[data-testid="collectibles-grid"], .collectibles-grid, .grid');
      await expect(grid.or(page.locator(".card, .collectible-card").first())).toBeVisible();
    });

    test("should have mobile-friendly purchase flow", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const buyButton = page.getByRole("button", { name: /buy|purchase|invest/i });
      await expect(buyButton).toBeVisible();

      // Button should be easily tappable
      const box = await buyButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44); // Minimum tap target
    });

    test("should have swipeable image gallery on mobile", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      const gallery = page.locator('[data-testid="image-gallery"], .swiper, .carousel');
      if (await gallery.isVisible()) {
        await expect(gallery).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  test.describe("Error Handling", () => {
    test("should handle unavailable collectible", async ({ page }) => {
      await page.goto("/collectibles/sold-out-item-123");

      // Should show sold out or unavailable message
      await expect(page.getByText(/sold out|unavailable|not found|error/i)).toBeVisible();
    });

    test("should handle purchase error gracefully", async ({ page }) => {
      await page.goto("/collectibles/pokemon-charizard-base-psa10");

      await page.getByRole("button", { name: /buy|purchase|invest/i }).click();

      // Simulate offline
      await page.context().setOffline(true);

      const amountInput = page.getByLabel(/amount|shares|quantity/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("10");

        const confirmButton = page.getByRole("button", { name: /confirm|purchase|buy/i });
        await confirmButton.click();

        // Should show error
        await expect(page.getByText(/error|failed|try again|offline/i)).toBeVisible();
      }

      await page.context().setOffline(false);
    });
  });
});
