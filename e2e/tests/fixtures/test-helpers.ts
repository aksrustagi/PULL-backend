/**
 * E2E Test Helpers
 * Reusable functions for common test operations
 */

import { Page, expect } from "@playwright/test";
import { TestUser, KYCPersonalInfo, KYCAddress } from "./test-data";

// =============================================================================
// Authentication Helpers
// =============================================================================

/**
 * Log in a user
 */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard|\/(?!login)/);
}

/**
 * Register a new user
 */
export async function register(page: Page, user: TestUser): Promise<void> {
  await page.goto("/register");
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);

  // Accept terms if present
  const termsCheckbox = page.getByRole("checkbox", { name: /terms|agree/i });
  if (await termsCheckbox.isVisible()) {
    await termsCheckbox.check();
  }

  await page.getByRole("button", { name: /sign up|create account|register/i }).click();
  await page.waitForURL(/verify|onboarding|dashboard/);
}

/**
 * Logout current user
 */
export async function logout(page: Page): Promise<void> {
  // Try profile menu first
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

  await expect(page).toHaveURL(/login|\/$/);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  await page.goto("/dashboard");
  return !page.url().includes("login");
}

// =============================================================================
// KYC Helpers
// =============================================================================

/**
 * Fill personal information form
 */
export async function fillPersonalInfo(
  page: Page,
  info: KYCPersonalInfo
): Promise<void> {
  await page.getByLabel(/first.*name/i).fill(info.firstName);
  await page.getByLabel(/last.*name/i).fill(info.lastName);

  const dobInput = page.getByLabel(/date.*birth|dob/i);
  if (await dobInput.isVisible()) {
    await dobInput.fill(info.dateOfBirth);
  }

  if (info.ssn) {
    const ssnInput = page.getByLabel(/ssn|social.*security/i);
    if (await ssnInput.isVisible()) {
      await ssnInput.fill(info.ssn);
    }
  }

  if (info.phone) {
    const phoneInput = page.getByLabel(/phone|mobile/i);
    if (await phoneInput.isVisible()) {
      await phoneInput.fill(info.phone);
    }
  }
}

/**
 * Fill address form
 */
export async function fillAddress(page: Page, address: KYCAddress): Promise<void> {
  const streetInput = page.getByLabel(/address|street/i);
  if (await streetInput.isVisible()) {
    await streetInput.fill(address.street);
  }

  const cityInput = page.getByLabel(/city/i);
  if (await cityInput.isVisible()) {
    await cityInput.fill(address.city);
  }

  const stateInput = page.getByLabel(/state|province/i);
  if (await stateInput.isVisible()) {
    await stateInput.fill(address.state);
  }

  const zipInput = page.getByLabel(/zip|postal/i);
  if (await zipInput.isVisible()) {
    await zipInput.fill(address.zipCode);
  }

  const countryInput = page.getByLabel(/country/i);
  if (await countryInput.isVisible()) {
    await countryInput.fill(address.country);
  }
}

/**
 * Complete basic KYC flow
 */
export async function completeBasicKYC(
  page: Page,
  personalInfo: KYCPersonalInfo,
  address: KYCAddress
): Promise<void> {
  await page.goto("/onboarding/kyc");

  const startButton = page.getByRole("button", { name: /start|begin|verify/i });
  if (await startButton.isVisible()) {
    await startButton.click();
  }

  // Fill personal info
  await fillPersonalInfo(page, personalInfo);

  // Continue to address
  const continueButton = page.getByRole("button", { name: /continue|next/i });
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }

  // Fill address
  await fillAddress(page, address);

  // Submit
  const submitButton = page.getByRole("button", { name: /continue|next|submit/i });
  if (await submitButton.isVisible()) {
    await submitButton.click();
  }
}

// =============================================================================
// Payment Helpers
// =============================================================================

/**
 * Initiate a deposit
 */
export async function initiateDeposit(
  page: Page,
  amount: string,
  method = "bank"
): Promise<void> {
  await page.goto("/wallet/deposit");

  const amountInput = page.getByLabel(/amount/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill(amount);
  }

  const methodButton = page.getByRole("button", { name: new RegExp(method, "i") });
  if (await methodButton.isVisible()) {
    await methodButton.click();
  }

  const continueButton = page.getByRole("button", { name: /continue|next|deposit/i });
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
}

/**
 * Initiate a withdrawal
 */
export async function initiateWithdrawal(
  page: Page,
  amount: string
): Promise<void> {
  await page.goto("/wallet/withdraw");

  const amountInput = page.getByLabel(/amount/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill(amount);
  }

  const continueButton = page.getByRole("button", { name: /continue|next|withdraw/i });
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
}

/**
 * Get current balance
 */
export async function getBalance(page: Page): Promise<string | null> {
  await page.goto("/wallet");
  const balanceElement = page.getByTestId("usd-balance").or(page.getByText(/\$[\d,]+\.\d{2}/));
  if (await balanceElement.isVisible()) {
    return balanceElement.textContent();
  }
  return null;
}

// =============================================================================
// Trading Helpers
// =============================================================================

/**
 * Navigate to a market
 */
export async function navigateToMarket(page: Page, marketId: string): Promise<void> {
  await page.goto(`/trade/${marketId}`);
  await page.waitForLoadState("networkidle");
}

/**
 * Place a market order
 */
export async function placeMarketOrder(
  page: Page,
  side: "buy" | "sell",
  quantity: string
): Promise<void> {
  // Select side
  const sideButton = page.getByRole("button", { name: new RegExp(side, "i") }).first();
  if (await sideButton.isVisible()) {
    await sideButton.click();
  }

  // Enter quantity
  const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
  if (await quantityInput.isVisible()) {
    await quantityInput.fill(quantity);
  }

  // Submit order
  const submitButton = page.getByRole("button", { name: /place|submit|buy|sell/i });
  if (await submitButton.isVisible()) {
    await submitButton.click();
  }

  // Wait for confirmation
  await expect(page.getByText(/submitted|success|confirmed|pending/i)).toBeVisible();
}

/**
 * Place a limit order
 */
export async function placeLimitOrder(
  page: Page,
  side: "buy" | "sell",
  quantity: string,
  price: string
): Promise<void> {
  // Select limit order type
  const limitTab = page.getByRole("tab", { name: /limit/i });
  if (await limitTab.isVisible()) {
    await limitTab.click();
  }

  // Select side
  const sideButton = page.getByRole("button", { name: new RegExp(side, "i") }).first();
  if (await sideButton.isVisible()) {
    await sideButton.click();
  }

  // Enter price
  const priceInput = page.getByLabel(/price|limit/i);
  if (await priceInput.isVisible()) {
    await priceInput.fill(price);
  }

  // Enter quantity
  const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
  if (await quantityInput.isVisible()) {
    await quantityInput.fill(quantity);
  }

  // Submit order
  const submitButton = page.getByRole("button", { name: /place|submit/i });
  if (await submitButton.isVisible()) {
    await submitButton.click();
  }

  // Wait for confirmation
  await expect(page.getByText(/submitted|success|confirmed|pending/i)).toBeVisible();
}

/**
 * Cancel an order
 */
export async function cancelOrder(page: Page): Promise<void> {
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

// =============================================================================
// Social Helpers
// =============================================================================

/**
 * Follow a user
 */
export async function followUser(page: Page, username: string): Promise<void> {
  await page.goto(`/user/${username}`);

  const followButton = page.getByRole("button", { name: /follow/i });
  if (await followButton.isVisible()) {
    await followButton.click();
    await expect(page.getByText(/following|followed/i)).toBeVisible();
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(page: Page, username: string): Promise<void> {
  await page.goto(`/user/${username}`);

  const unfollowButton = page.getByRole("button", { name: /following|unfollow/i });
  if (await unfollowButton.isVisible()) {
    await unfollowButton.click();

    // Confirm if modal appears
    const confirmButton = page.getByRole("button", { name: /confirm|yes|unfollow/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    await expect(page.getByRole("button", { name: /follow/i })).toBeVisible();
  }
}

/**
 * Enable copy trading for a user
 */
export async function enableCopyTrading(
  page: Page,
  username: string,
  settings: { percentage: string; maxAmount: string }
): Promise<void> {
  await page.goto(`/user/${username}`);

  const copyTradeButton = page.getByRole("button", { name: /copy.*trade|copy/i });
  if (await copyTradeButton.isVisible()) {
    await copyTradeButton.click();

    // Configure settings
    const percentageInput = page.getByLabel(/percentage|amount/i);
    if (await percentageInput.isVisible()) {
      await percentageInput.fill(settings.percentage);
    }

    const maxAmountInput = page.getByLabel(/max|limit/i);
    if (await maxAmountInput.isVisible()) {
      await maxAmountInput.fill(settings.maxAmount);
    }

    // Confirm
    const confirmButton = page.getByRole("button", { name: /confirm|start|enable/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    await expect(page.getByText(/copying|enabled|active/i)).toBeVisible();
  }
}

// =============================================================================
// Prediction Helpers
// =============================================================================

/**
 * Place a prediction
 */
export async function placePrediction(
  page: Page,
  marketId: string,
  outcome: "yes" | "no",
  amount: string
): Promise<void> {
  await page.goto(`/markets/${marketId}`);

  // Select outcome
  const outcomeButton = page.getByRole("button", { name: new RegExp(outcome, "i") });
  if (await outcomeButton.isVisible()) {
    await outcomeButton.click();
  }

  // Enter amount
  const amountInput = page.getByLabel(/amount|stake/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill(amount);
  }

  // Confirm prediction
  const confirmButton = page.getByRole("button", { name: /predict|confirm|place/i });
  if (await confirmButton.isVisible()) {
    await confirmButton.click();
  }

  await expect(page.getByText(/submitted|success|placed/i)).toBeVisible();
}

// =============================================================================
// Utility Helpers
// =============================================================================

/**
 * Wait for network to be idle
 */
export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * Take screenshot for debugging
 */
export async function takeDebugScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({ path: `./e2e/debug/${name}-${Date.now()}.png` });
}

/**
 * Clear all browser state
 */
export async function clearBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * Simulate network offline
 */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/**
 * Simulate network online
 */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

/**
 * Wait for toast/notification
 */
export async function waitForToast(
  page: Page,
  textPattern: RegExp
): Promise<void> {
  const toast = page.locator('[role="alert"], .toast, .notification').filter({
    hasText: textPattern,
  });
  await expect(toast).toBeVisible({ timeout: 5000 });
}

/**
 * Dismiss toast/notification
 */
export async function dismissToast(page: Page): Promise<void> {
  const closeButton = page.locator('[role="alert"] button, .toast button').first();
  if (await closeButton.isVisible()) {
    await closeButton.click();
  }
}

/**
 * Check if element is in viewport
 */
export async function isInViewport(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector).first();
  const boundingBox = await element.boundingBox();

  if (!boundingBox) return false;

  const viewportSize = page.viewportSize();
  if (!viewportSize) return false;

  return (
    boundingBox.x >= 0 &&
    boundingBox.y >= 0 &&
    boundingBox.x + boundingBox.width <= viewportSize.width &&
    boundingBox.y + boundingBox.height <= viewportSize.height
  );
}
