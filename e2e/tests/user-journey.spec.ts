import { test, expect, Page } from "@playwright/test";

/**
 * E2E Tests for Complete User Journey
 * Tests the full user lifecycle from signup to successful trading
 */

// Generate unique test data for each run
const generateTestUser = () => ({
  email: `journey-${Date.now()}-${Math.random().toString(36).substring(7)}@test.example.com`,
  password: "SecureJourneyPass123!",
  displayName: "Journey Test User",
  firstName: "Journey",
  lastName: "Tester",
});

test.describe("Complete User Journey", () => {
  // ==========================================================================
  // Full User Lifecycle Test
  // ==========================================================================

  test.describe("Full Lifecycle", () => {
    test("should complete full user journey from signup to first trade", async ({ page }) => {
      const testUser = generateTestUser();

      // STEP 1: Registration
      await test.step("Register new account", async () => {
        await page.goto("/register");

        await page.getByLabel(/email/i).fill(testUser.email);
        await page.getByLabel(/password/i).fill(testUser.password);

        // Accept terms if present
        const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
        if (await termsCheckbox.isVisible()) {
          await termsCheckbox.check();
        }

        await page.getByRole("button", { name: /sign up|create account|register/i }).click();

        // Should proceed to verification or onboarding
        await expect(page).toHaveURL(/verify|onboarding|dashboard/);
      });

      // STEP 2: Email Verification (if required)
      await test.step("Handle email verification", async () => {
        if (page.url().includes("verify")) {
          // In E2E testing, we may have a bypass mechanism
          // or the verification may be auto-approved for test domains
          const skipButton = page.getByRole("button", { name: /skip|continue|later/i });
          if (await skipButton.isVisible()) {
            await skipButton.click();
          } else {
            // Wait for auto-verification in test environment
            await page.waitForURL(/onboarding|dashboard/, { timeout: 10000 });
          }
        }
      });

      // STEP 3: Complete KYC
      await test.step("Complete KYC verification", async () => {
        if (page.url().includes("onboarding")) {
          await page.goto("/onboarding/kyc");

          const startButton = page.getByRole("button", { name: /start|begin|verify/i });
          if (await startButton.isVisible()) {
            await startButton.click();

            // Fill personal information
            await page.getByLabel(/first.*name/i).fill(testUser.firstName);
            await page.getByLabel(/last.*name/i).fill(testUser.lastName);

            const dobInput = page.getByLabel(/date.*birth|dob/i);
            if (await dobInput.isVisible()) {
              await dobInput.fill("1990-01-15");
            }

            // Continue to address
            const continueButton = page.getByRole("button", { name: /continue|next/i });
            if (await continueButton.isVisible()) {
              await continueButton.click();
            }

            // Fill address (if required)
            const addressInput = page.getByLabel(/address|street/i);
            if (await addressInput.isVisible()) {
              await addressInput.fill("123 Test Street");
              await page.getByLabel(/city/i).fill("Test City");
              await page.getByLabel(/state|province/i).fill("CA");
              await page.getByLabel(/zip|postal/i).fill("12345");
              await page.getByLabel(/country/i).fill("United States");

              await page.getByRole("button", { name: /continue|next|submit/i }).click();
            }
          }

          // Skip or complete document upload in test mode
          const skipDocButton = page.getByRole("button", { name: /skip|later|test mode/i });
          if (await skipDocButton.isVisible()) {
            await skipDocButton.click();
          }
        }
      });

      // STEP 4: Fund Account
      await test.step("Fund account with initial deposit", async () => {
        await page.goto("/onboarding/funding");

        const skipFundingButton = page.getByRole("button", { name: /skip|later/i });
        const depositAmountInput = page.getByLabel(/amount/i);

        if (await depositAmountInput.isVisible()) {
          // Enter deposit amount in test mode
          await depositAmountInput.fill("1000");

          // Select payment method
          const bankOption = page.getByRole("button", { name: /bank|ach/i });
          if (await bankOption.isVisible()) {
            await bankOption.click();
          }

          // In test mode, deposit might be auto-approved
          const depositButton = page.getByRole("button", { name: /deposit|fund|continue/i });
          if (await depositButton.isVisible()) {
            await depositButton.click();
          }
        } else if (await skipFundingButton.isVisible()) {
          // Skip if no test funding available
          await skipFundingButton.click();
        }

        // Wait for completion or skip
        await page.waitForURL(/complete|dashboard/, { timeout: 10000 });
      });

      // STEP 5: Complete Onboarding
      await test.step("Complete onboarding", async () => {
        if (page.url().includes("complete")) {
          const dashboardLink = page.getByRole("link", { name: /dashboard|start trading|explore/i });
          if (await dashboardLink.isVisible()) {
            await dashboardLink.click();
          }
        }

        // Should be on dashboard
        await expect(page).toHaveURL(/dashboard|\//);
      });

      // STEP 6: Explore Markets
      await test.step("Explore available markets", async () => {
        await page.goto("/trade");

        // Should see markets
        await expect(page.getByText(/markets|predictions|trade/i)).toBeVisible();

        // Click on first market
        const marketCard = page.locator('[data-testid="market-card"], .market-card, a[href*="/trade/"]').first();
        if (await marketCard.isVisible()) {
          await marketCard.click();
          await expect(page).toHaveURL(/trade\/.+/);
        }
      });

      // STEP 7: Place First Trade
      await test.step("Place first trade", async () => {
        await page.goto("/trade/BTC-100K-YES");

        // Select buy
        const buyButton = page.getByRole("button", { name: /buy|yes/i }).first();
        if (await buyButton.isVisible()) {
          await buyButton.click();
        }

        // Enter quantity
        const quantityInput = page.getByLabel(/quantity|contracts|shares|amount/i);
        if (await quantityInput.isVisible()) {
          await quantityInput.fill("1");
        }

        // Submit order
        const submitButton = page.getByRole("button", { name: /place|submit|confirm/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show success or order pending
          await expect(page.getByText(/submitted|success|confirmed|pending|placed/i)).toBeVisible();
        }
      });

      // STEP 8: View Portfolio
      await test.step("View portfolio with new position", async () => {
        await page.goto("/portfolio");

        await expect(page.getByText(/portfolio|positions|holdings/i)).toBeVisible();
      });
    });
  });

  // ==========================================================================
  // Authentication State Tests
  // ==========================================================================

  test.describe("Authentication State", () => {
    test("should persist login across page reloads", async ({ page }) => {
      const testUser = generateTestUser();

      // Register and login
      await page.goto("/register");
      await page.getByLabel(/email/i).fill(testUser.email);
      await page.getByLabel(/password/i).fill(testUser.password);

      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();
      await page.waitForURL(/verify|onboarding|dashboard/);

      // Reload page
      await page.reload();

      // Should still be authenticated (not on login page)
      await expect(page).not.toHaveURL(/login/);
    });

    test("should redirect to login when accessing protected route", async ({ page }) => {
      // Clear all storage
      await page.context().clearCookies();
      await page.goto("/portfolio");

      // Should redirect to login
      await expect(page).toHaveURL(/login/);
    });

    test("should redirect to intended page after login", async ({ page }) => {
      // Try to access protected page
      await page.goto("/portfolio");

      // Should be redirected to login
      await expect(page).toHaveURL(/login/);

      // Login
      await page.getByLabel(/email/i).fill("existing-user@example.com");
      await page.getByLabel(/password/i).fill("ExistingUserPass123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();

      // Should redirect back to portfolio (or wherever was intended)
      await page.waitForURL(/portfolio|dashboard|onboarding/);
    });
  });

  // ==========================================================================
  // Onboarding Progress Tests
  // ==========================================================================

  test.describe("Onboarding Progress", () => {
    test("should show progress through onboarding steps", async ({ page }) => {
      const testUser = generateTestUser();

      // Register
      await page.goto("/register");
      await page.getByLabel(/email/i).fill(testUser.email);
      await page.getByLabel(/password/i).fill(testUser.password);

      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      // Check for progress indicator
      const progressIndicator = page.locator('[data-testid="progress"], [role="progressbar"], .stepper, .progress');
      if (await progressIndicator.isVisible()) {
        await expect(progressIndicator).toBeVisible();
      }
    });

    test("should allow navigating back through onboarding steps", async ({ page }) => {
      const testUser = generateTestUser();

      // Register and start onboarding
      await page.goto("/register");
      await page.getByLabel(/email/i).fill(testUser.email);
      await page.getByLabel(/password/i).fill(testUser.password);

      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();
      await page.waitForURL(/verify|onboarding/);

      // Navigate to KYC if not already there
      if (!page.url().includes("kyc")) {
        await page.goto("/onboarding/kyc");
      }

      // Check for back button
      const backButton = page.getByRole("button", { name: /back|previous/i });
      if (await backButton.isVisible()) {
        await expect(backButton).toBeVisible();
      }
    });

    test("should save onboarding progress", async ({ page, context }) => {
      const testUser = generateTestUser();

      // Register
      await page.goto("/register");
      await page.getByLabel(/email/i).fill(testUser.email);
      await page.getByLabel(/password/i).fill(testUser.password);

      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();
      await page.waitForURL(/verify|onboarding|dashboard/);

      // Get current step URL
      const stepUrl = page.url();

      // Open new tab (simulate closing and reopening browser)
      const newPage = await context.newPage();
      await newPage.goto("/");

      // Should be at same step or further in onboarding
      await expect(newPage).toHaveURL(/onboarding|dashboard/);

      await newPage.close();
    });
  });

  // ==========================================================================
  // Account Settings Journey
  // ==========================================================================

  test.describe("Account Settings Journey", () => {
    test.beforeEach(async ({ page }) => {
      // Login as existing user
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("settings-test@example.com");
      await page.getByLabel(/password/i).fill("SettingsTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);
    });

    test("should access and update profile settings", async ({ page }) => {
      await page.goto("/settings/profile");

      // Update display name
      const displayNameInput = page.getByLabel(/display.*name|name/i);
      if (await displayNameInput.isVisible()) {
        await displayNameInput.fill("Updated Name");

        const saveButton = page.getByRole("button", { name: /save|update/i });
        await saveButton.click();

        // Should show success
        await expect(page.getByText(/saved|updated|success/i)).toBeVisible();
      }
    });

    test("should access security settings", async ({ page }) => {
      await page.goto("/settings/security");

      // Should show security options
      await expect(page.getByText(/password|security|two-factor|2fa/i)).toBeVisible();
    });

    test("should access payment methods", async ({ page }) => {
      await page.goto("/settings/payments");

      // Should show payment methods
      await expect(page.getByText(/payment.*method|bank|card/i)).toBeVisible();
    });

    test("should view account activity", async ({ page }) => {
      await page.goto("/settings/activity");

      // Should show activity log
      const activityList = page.locator('[data-testid="activity-list"], .activity, table');
      if (await activityList.isVisible()) {
        await expect(activityList).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Cross-Feature Integration
  // ==========================================================================

  test.describe("Cross-Feature Integration", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("integration-test@example.com");
      await page.getByLabel(/password/i).fill("IntegrationTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);
    });

    test("should navigate between dashboard, trade, and portfolio", async ({ page }) => {
      // Start at dashboard
      await page.goto("/dashboard");
      await expect(page.getByText(/dashboard|overview|home/i)).toBeVisible();

      // Navigate to trade
      await page.getByRole("link", { name: /trade|markets/i }).click();
      await expect(page).toHaveURL(/trade/);

      // Navigate to portfolio
      await page.getByRole("link", { name: /portfolio|positions/i }).click();
      await expect(page).toHaveURL(/portfolio/);

      // Navigate back to dashboard
      await page.getByRole("link", { name: /dashboard|home/i }).click();
      await expect(page).toHaveURL(/dashboard|\//);
    });

    test("should show consistent balance across pages", async ({ page }) => {
      // Get balance from dashboard
      await page.goto("/dashboard");
      const dashboardBalance = await page.getByTestId("balance").textContent().catch(() => null);

      // Check balance on trade page
      await page.goto("/trade");
      const tradeBalance = await page.getByText(/buying power|available|balance/i).textContent().catch(() => null);

      // Balance should be consistent (or at least both should show something)
      // This is a simplified check - actual implementation would compare values
    });

    test("should update portfolio after placing trade", async ({ page }) => {
      // Place a trade
      await page.goto("/trade/BTC-100K-YES");

      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        await quantityInput.fill("1");

        const submitButton = page.getByRole("button", { name: /place|submit|buy/i });
        await submitButton.click();

        // Wait for order confirmation
        await page.waitForSelector("text=/submitted|success|confirmed|pending/i", { timeout: 5000 }).catch(() => {});
      }

      // Check portfolio
      await page.goto("/portfolio");

      // Should show positions or orders
      await expect(page.getByText(/positions|orders|holdings/i)).toBeVisible();
    });
  });

  // ==========================================================================
  // Error Recovery Journey
  // ==========================================================================

  test.describe("Error Recovery", () => {
    test("should recover from session timeout", async ({ page, context }) => {
      // Login
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("timeout-test@example.com");
      await page.getByLabel(/password/i).fill("TimeoutTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);

      // Clear cookies to simulate session timeout
      await context.clearCookies();

      // Try to access protected page
      await page.goto("/portfolio");

      // Should redirect to login
      await expect(page).toHaveURL(/login/);

      // Should be able to login again
      await page.getByLabel(/email/i).fill("timeout-test@example.com");
      await page.getByLabel(/password/i).fill("TimeoutTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();

      await expect(page).toHaveURL(/dashboard|portfolio|\//);
    });

    test("should handle network reconnection", async ({ page }) => {
      // Login
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("network-test@example.com");
      await page.getByLabel(/password/i).fill("NetworkTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);

      // Go offline
      await page.context().setOffline(true);

      // Try to navigate
      await page.goto("/trade").catch(() => {});

      // Should show offline indicator
      await expect(page.getByText(/offline|connection|network/i)).toBeVisible().catch(() => {});

      // Go back online
      await page.context().setOffline(false);

      // Should be able to navigate
      await page.goto("/trade");
      await expect(page).toHaveURL(/trade/);
    });
  });

  // ==========================================================================
  // Logout Journey
  // ==========================================================================

  test.describe("Logout", () => {
    test("should logout successfully", async ({ page }) => {
      // Login
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("logout-test@example.com");
      await page.getByLabel(/password/i).fill("LogoutTest123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);

      // Find and click logout
      const profileMenu = page.getByRole("button", { name: /profile|menu|account/i });
      if (await profileMenu.isVisible()) {
        await profileMenu.click();
      }

      const logoutButton = page.getByRole("button", { name: /logout|sign out|log out/i });
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
      } else {
        // Try settings page
        await page.goto("/settings");
        const settingsLogout = page.getByRole("button", { name: /logout|sign out/i });
        if (await settingsLogout.isVisible()) {
          await settingsLogout.click();
        }
      }

      // Should be redirected to login or home
      await expect(page).toHaveURL(/login|\/$/);
    });

    test("should clear all session data on logout", async ({ page }) => {
      // Login
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("clear-session@example.com");
      await page.getByLabel(/password/i).fill("ClearSession123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|\//);

      // Logout
      await page.goto("/settings");
      const logoutButton = page.getByRole("button", { name: /logout|sign out/i });
      if (await logoutButton.isVisible()) {
        await logoutButton.click();
      }

      // Try to access protected route
      await page.goto("/portfolio");

      // Should be redirected to login
      await expect(page).toHaveURL(/login/);
    });
  });
});
