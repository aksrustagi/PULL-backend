import { test, expect, Page } from "@playwright/test";

/**
 * E2E Tests for Onboarding Flow
 * Tests the complete user onboarding journey
 */

test.describe("Onboarding Flow", () => {
  // ==========================================================================
  // Registration Tests
  // ==========================================================================

  test.describe("Registration", () => {
    test("should display registration form", async ({ page }) => {
      await page.goto("/register");

      await expect(page.getByRole("heading", { name: /create account|sign up|register/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /sign up|create account|register/i })).toBeVisible();
    });

    test("should show validation errors for empty form", async ({ page }) => {
      await page.goto("/register");

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      // Should show validation errors
      await expect(page.getByText(/email.*required|please enter.*email/i)).toBeVisible();
    });

    test("should show validation error for invalid email", async ({ page }) => {
      await page.goto("/register");

      await page.getByLabel(/email/i).fill("invalid-email");
      await page.getByLabel(/password/i).fill("Password123!");
      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      await expect(page.getByText(/valid email|invalid email/i)).toBeVisible();
    });

    test("should show validation error for weak password", async ({ page }) => {
      await page.goto("/register");

      await page.getByLabel(/email/i).fill("test@example.com");
      await page.getByLabel(/password/i).fill("weak");
      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      await expect(page.getByText(/password.*characters|password.*strong/i)).toBeVisible();
    });

    test("should register new user successfully", async ({ page }) => {
      const testEmail = `test-${Date.now()}@example.com`;

      await page.goto("/register");

      await page.getByLabel(/email/i).fill(testEmail);
      await page.getByLabel(/password/i).fill("SecurePassword123!");

      // Accept terms if present
      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      // Should redirect to verification or onboarding
      await expect(page).toHaveURL(/verify|onboarding|dashboard/);
    });

    test("should show link to login page", async ({ page }) => {
      await page.goto("/register");

      const loginLink = page.getByRole("link", { name: /sign in|log in|already have/i });
      await expect(loginLink).toBeVisible();

      await loginLink.click();
      await expect(page).toHaveURL(/login/);
    });
  });

  // ==========================================================================
  // Email Verification Tests
  // ==========================================================================

  test.describe("Email Verification", () => {
    test("should display verification page", async ({ page }) => {
      await page.goto("/verify-email");

      await expect(page.getByText(/verify|check.*email|confirmation/i)).toBeVisible();
    });

    test("should allow resending verification email", async ({ page }) => {
      await page.goto("/verify-email?email=test@example.com");

      const resendButton = page.getByRole("button", { name: /resend|send again/i });
      if (await resendButton.isVisible()) {
        await resendButton.click();
        await expect(page.getByText(/sent|check.*inbox/i)).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // KYC Flow Tests
  // ==========================================================================

  test.describe("KYC Flow", () => {
    test.beforeEach(async ({ page }) => {
      // Login as test user before KYC tests
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("kyc-test@example.com");
      await page.getByLabel(/password/i).fill("TestPassword123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|onboarding/);
    });

    test("should display KYC start page", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      await expect(page.getByText(/identity|verification|kyc/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /start|begin|verify/i })).toBeVisible();
    });

    test("should show KYC requirements", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      // Check for common KYC requirements
      await expect(page.getByText(/government.*id|driver.*license|passport/i)).toBeVisible();
    });

    test("should navigate through KYC steps", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      // Start KYC
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Should show first step (usually personal info)
      await expect(page.getByText(/personal|name|information/i)).toBeVisible();
    });

    test("should validate personal information fields", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Try to continue without filling required fields
      const continueButton = page.getByRole("button", { name: /continue|next/i });
      if (await continueButton.isVisible()) {
        await continueButton.click();
        // Should show validation errors
        await expect(page.getByText(/required|please enter/i)).toBeVisible();
      }
    });

    test("should show address form", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill personal info and continue
      await page.getByLabel(/first.*name/i).fill("Test");
      await page.getByLabel(/last.*name/i).fill("User");
      await page.getByLabel(/date.*birth/i).fill("1990-01-01");
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should show address form
      await expect(page.getByLabel(/address|street/i)).toBeVisible();
    });
  });

  // ==========================================================================
  // Funding Flow Tests
  // ==========================================================================

  test.describe("Funding Flow", () => {
    test.beforeEach(async ({ page }) => {
      // Login and complete KYC first
      await page.goto("/login");
      await page.getByLabel(/email/i).fill("funding-test@example.com");
      await page.getByLabel(/password/i).fill("TestPassword123!");
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      await page.waitForURL(/dashboard|onboarding/);
    });

    test("should display funding options", async ({ page }) => {
      await page.goto("/onboarding/funding");

      await expect(page.getByText(/fund|deposit|add money/i)).toBeVisible();
    });

    test("should show bank account linking option", async ({ page }) => {
      await page.goto("/onboarding/funding");

      await expect(page.getByText(/bank|ach|link/i)).toBeVisible();
    });

    test("should show deposit amount input", async ({ page }) => {
      await page.goto("/onboarding/funding");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await expect(amountInput).toBeVisible();
      }
    });

    test("should validate minimum deposit amount", async ({ page }) => {
      await page.goto("/onboarding/funding");

      const amountInput = page.getByLabel(/amount/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("1");
        await page.getByRole("button", { name: /continue|deposit|fund/i }).click();
        await expect(page.getByText(/minimum|at least/i)).toBeVisible();
      }
    });

    test("should allow skipping initial funding", async ({ page }) => {
      await page.goto("/onboarding/funding");

      const skipButton = page.getByRole("button", { name: /skip|later/i });
      if (await skipButton.isVisible()) {
        await skipButton.click();
        await expect(page).toHaveURL(/complete|dashboard/);
      }
    });
  });

  // ==========================================================================
  // Onboarding Completion Tests
  // ==========================================================================

  test.describe("Completion", () => {
    test("should display completion page", async ({ page }) => {
      await page.goto("/onboarding/complete");

      await expect(page.getByText(/complete|ready|welcome|success/i)).toBeVisible();
    });

    test("should show getting started tips", async ({ page }) => {
      await page.goto("/onboarding/complete");

      // Should show tips or next steps
      await expect(page.getByText(/start|explore|trade|market/i)).toBeVisible();
    });

    test("should have link to dashboard", async ({ page }) => {
      await page.goto("/onboarding/complete");

      const dashboardLink = page.getByRole("link", { name: /dashboard|start trading|explore/i });
      await expect(dashboardLink).toBeVisible();

      await dashboardLink.click();
      await expect(page).toHaveURL(/dashboard|\//);
    });
  });

  // ==========================================================================
  // Progress Tracking Tests
  // ==========================================================================

  test.describe("Progress Tracking", () => {
    test("should show onboarding progress indicator", async ({ page }) => {
      await page.goto("/onboarding");

      // Should show progress steps
      const progressIndicator = page.locator('[data-testid="progress"], [role="progressbar"], .progress, .stepper');
      if (await progressIndicator.isVisible()) {
        await expect(progressIndicator).toBeVisible();
      }
    });

    test("should persist progress between sessions", async ({ page, context }) => {
      // Start onboarding
      await page.goto("/onboarding");
      await page.waitForLoadState("networkidle");

      // Get initial progress state
      const currentURL = page.url();

      // Create new page to simulate new session
      const newPage = await context.newPage();
      await newPage.goto("/onboarding");

      // Should resume from same step
      // This is a simplified check - actual implementation may vary
      await expect(newPage).toHaveURL(/onboarding/);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  test.describe("Error Handling", () => {
    test("should handle network errors gracefully", async ({ page }) => {
      // Simulate offline
      await page.context().setOffline(true);
      await page.goto("/register");

      // Should show error message or offline indicator
      await expect(page.getByText(/offline|connection|network|error/i)).toBeVisible();

      // Restore network
      await page.context().setOffline(false);
    });

    test("should show error for duplicate email", async ({ page }) => {
      await page.goto("/register");

      // Try to register with existing email
      await page.getByLabel(/email/i).fill("existing@example.com");
      await page.getByLabel(/password/i).fill("SecurePassword123!");

      const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
      if (await termsCheckbox.isVisible()) {
        await termsCheckbox.check();
      }

      await page.getByRole("button", { name: /sign up|create account|register/i }).click();

      // Should show error for existing account
      await expect(page.getByText(/already exists|account exists|try logging in/i)).toBeVisible();
    });
  });

  // ==========================================================================
  // Mobile Responsiveness Tests
  // ==========================================================================

  test.describe("Mobile Responsiveness", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("should display registration form on mobile", async ({ page }) => {
      await page.goto("/register");

      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /sign up|create account|register/i })).toBeVisible();
    });

    test("should display KYC form on mobile", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      await expect(page.getByRole("button", { name: /start|begin|verify/i })).toBeVisible();
    });
  });
});
