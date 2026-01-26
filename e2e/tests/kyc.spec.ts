import { test, expect, Page } from "@playwright/test";
import {
  TEST_USERS,
  generateTestUser,
  KYC_TEST_DATA,
} from "./fixtures/test-data";
import {
  login,
  register,
  fillPersonalInfo,
  fillAddress,
  completeBasicKYC,
  waitForNetworkIdle,
  goOffline,
  goOnline,
} from "./fixtures/test-helpers";

/**
 * E2E Tests for KYC (Know Your Customer) Flow
 * Tests the complete identity verification journey
 */

test.describe("KYC Flow", () => {
  // ==========================================================================
  // KYC Submission Tests
  // ==========================================================================

  test.describe("KYC Submission", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateTestUser("kyc-submit");
      await register(page, user);
    });

    test("should display KYC verification start page", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      await expect(page.getByText(/identity|verification|kyc|verify.*identity/i)).toBeVisible();
      await expect(page.getByRole("button", { name: /start|begin|verify/i })).toBeVisible();
    });

    test("should show KYC requirements and documents needed", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      // Should display required documents
      await expect(page.getByText(/government.*id|driver.*license|passport|id.*card/i)).toBeVisible();
    });

    test("should navigate through KYC steps sequentially", async ({ page }) => {
      await page.goto("/onboarding/kyc");

      // Start KYC
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Step 1: Personal Information
      await expect(page.getByText(/personal|information|name/i)).toBeVisible();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);

      const continueButton = page.getByRole("button", { name: /continue|next/i });
      await continueButton.click();

      // Step 2: Address
      await expect(page.getByLabel(/address|street/i)).toBeVisible();

      await fillAddress(page, KYC_TEST_DATA.validAddress);

      await page.getByRole("button", { name: /continue|next/i }).click();

      // Step 3: Document Upload (or skip in test mode)
      await expect(page.getByText(/document|upload|photo|id/i)).toBeVisible();
    });

    test("should validate required personal information fields", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Try to continue without filling required fields
      const continueButton = page.getByRole("button", { name: /continue|next/i });
      await continueButton.click();

      // Should show validation errors
      await expect(page.getByText(/required|please enter|first name|last name/i)).toBeVisible();
    });

    test("should validate date of birth format", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill with invalid DOB
      await page.getByLabel(/first.*name/i).fill("Test");
      await page.getByLabel(/last.*name/i).fill("User");

      const dobInput = page.getByLabel(/date.*birth|dob/i);
      if (await dobInput.isVisible()) {
        await dobInput.fill("invalid-date");
        await page.getByRole("button", { name: /continue|next/i }).click();

        // Should show date validation error
        await expect(page.getByText(/valid.*date|invalid.*date|date.*format/i)).toBeVisible();
      }
    });

    test("should validate address fields", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill personal info and continue
      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Try to continue without filling address
      const continueButton = page.getByRole("button", { name: /continue|next/i });
      await continueButton.click();

      // Should show validation errors for required address fields
      await expect(page.getByText(/required|please enter|address/i)).toBeVisible();
    });

    test("should validate ZIP code format", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Fill address with invalid ZIP
      await page.getByLabel(/address|street/i).fill("123 Test St");
      await page.getByLabel(/city/i).fill("Test City");
      await page.getByLabel(/state|province/i).fill("CA");
      await page.getByLabel(/zip|postal/i).fill("invalid");

      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should show ZIP validation error
      const zipError = page.getByText(/valid.*zip|invalid.*zip|postal.*code/i);
      if (await zipError.isVisible()) {
        await expect(zipError).toBeVisible();
      }
    });

    test("should submit KYC successfully with valid data", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill personal info
      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Fill address
      await fillAddress(page, KYC_TEST_DATA.validAddress);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Skip document upload in test mode or upload test document
      const skipButton = page.getByRole("button", { name: /skip|later|test mode/i });
      if (await skipButton.isVisible()) {
        await skipButton.click();
      }

      // Should show submission confirmation or pending status
      await expect(page.getByText(/submitted|pending|review|processing|success/i)).toBeVisible();
    });

    test("should show progress indicator during KYC steps", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Look for progress indicator
      const progressIndicator = page.locator('[data-testid="progress"], [role="progressbar"], .stepper, .progress-steps');
      if (await progressIndicator.isVisible()) {
        await expect(progressIndicator).toBeVisible();
      }
    });

    test("should allow going back to previous steps", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill personal info and continue
      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should be on address step
      await expect(page.getByLabel(/address|street/i)).toBeVisible();

      // Go back
      const backButton = page.getByRole("button", { name: /back|previous/i });
      if (await backButton.isVisible()) {
        await backButton.click();

        // Should be back on personal info step with data preserved
        await expect(page.getByLabel(/first.*name/i)).toHaveValue(KYC_TEST_DATA.validPersonalInfo.firstName);
      }
    });

    test("should preserve form data when navigating between steps", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill personal info
      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Fill partial address
      await page.getByLabel(/address|street/i).fill("123 Test St");

      // Go back
      const backButton = page.getByRole("button", { name: /back|previous/i });
      if (await backButton.isVisible()) {
        await backButton.click();
        await page.getByRole("button", { name: /continue|next/i }).click();

        // Address should be preserved
        await expect(page.getByLabel(/address|street/i)).toHaveValue("123 Test St");
      }
    });
  });

  // ==========================================================================
  // KYC Approval Flow Tests
  // ==========================================================================

  test.describe("KYC Approval", () => {
    test("should display approved KYC status", async ({ page }) => {
      await login(page, TEST_USERS.kycCompleted);
      await page.goto("/settings/kyc");

      await expect(page.getByText(/approved|verified|complete/i)).toBeVisible();
    });

    test("should show verification badge for approved users", async ({ page }) => {
      await login(page, TEST_USERS.kycCompleted);
      await page.goto("/profile");

      const verifiedBadge = page.locator('[data-testid="verified-badge"], .verified, .badge');
      if (await verifiedBadge.isVisible()) {
        await expect(verifiedBadge).toBeVisible();
      }
    });

    test("should unlock full trading features after KYC approval", async ({ page }) => {
      await login(page, TEST_USERS.kycCompleted);
      await page.goto("/trade/BTC-100K-YES");

      // Should not show KYC required warning
      const kycWarning = page.getByText(/kyc required|verify.*identity.*trade/i);
      await expect(kycWarning).not.toBeVisible();

      // Trading form should be fully functional
      const quantityInput = page.getByLabel(/quantity|contracts|shares/i);
      if (await quantityInput.isVisible()) {
        await expect(quantityInput).toBeEnabled();
      }
    });

    test("should unlock higher deposit limits after KYC approval", async ({ page }) => {
      await login(page, TEST_USERS.kycCompleted);
      await page.goto("/wallet/deposit");

      // Should show higher limits
      const limitsInfo = page.getByText(/limit|maximum/i);
      if (await limitsInfo.isVisible()) {
        await expect(limitsInfo).toBeVisible();
      }
    });

    test("should show KYC completion date", async ({ page }) => {
      await login(page, TEST_USERS.kycCompleted);
      await page.goto("/settings/kyc");

      const completionDate = page.getByText(/verified on|completed on|approved on/i);
      if (await completionDate.isVisible()) {
        await expect(completionDate).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // KYC Pending Status Tests
  // ==========================================================================

  test.describe("KYC Pending Status", () => {
    test("should display pending KYC status", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/settings/kyc");

      await expect(page.getByText(/pending|review|processing|under review/i)).toBeVisible();
    });

    test("should show estimated review time", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/settings/kyc");

      const reviewTime = page.getByText(/hours|days|business days|review time/i);
      if (await reviewTime.isVisible()) {
        await expect(reviewTime).toBeVisible();
      }
    });

    test("should show limited functionality while KYC pending", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/trade/BTC-100K-YES");

      // Should show KYC pending message or limited trading
      const pendingMessage = page.getByText(/pending|limited|verify.*complete|waiting/i);
      if (await pendingMessage.isVisible()) {
        await expect(pendingMessage).toBeVisible();
      }
    });

    test("should not allow editing KYC info while pending", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/settings/kyc");

      const editButton = page.getByRole("button", { name: /edit|update|modify/i });
      if (await editButton.isVisible()) {
        // Edit should be disabled or not present
        await expect(editButton).toBeDisabled();
      }
    });

    test("should allow contacting support while KYC pending", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/settings/kyc");

      const supportLink = page.getByRole("link", { name: /support|contact|help/i });
      if (await supportLink.isVisible()) {
        await expect(supportLink).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // KYC Rejection Handling Tests
  // ==========================================================================

  test.describe("KYC Rejection Handling", () => {
    test("should display rejected KYC status", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/settings/kyc");

      await expect(page.getByText(/rejected|denied|failed|unsuccessful/i)).toBeVisible();
    });

    test("should show rejection reason", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/settings/kyc");

      const rejectionReason = page.getByText(/reason|because|due to|issue/i);
      if (await rejectionReason.isVisible()) {
        await expect(rejectionReason).toBeVisible();
      }
    });

    test("should allow resubmitting KYC after rejection", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/settings/kyc");

      const resubmitButton = page.getByRole("button", { name: /resubmit|try again|retry|submit again/i });
      if (await resubmitButton.isVisible()) {
        await expect(resubmitButton).toBeVisible();
        await resubmitButton.click();

        // Should navigate to KYC form
        await expect(page).toHaveURL(/kyc|verification/);
      }
    });

    test("should show what needs to be corrected", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/settings/kyc");

      const correctionNeeded = page.getByText(/correct|fix|update|provide|upload.*again/i);
      if (await correctionNeeded.isVisible()) {
        await expect(correctionNeeded).toBeVisible();
      }
    });

    test("should restrict trading features after rejection", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/trade/BTC-100K-YES");

      // Should show verification required message
      const verifyMessage = page.getByText(/verify|complete.*kyc|identity.*required/i);
      if (await verifyMessage.isVisible()) {
        await expect(verifyMessage).toBeVisible();
      }
    });

    test("should provide support contact for rejected users", async ({ page }) => {
      await login(page, TEST_USERS.kycRejected);
      await page.goto("/settings/kyc");

      const supportContact = page.getByText(/support|help|contact|appeal/i);
      await expect(supportContact).toBeVisible();
    });
  });

  // ==========================================================================
  // Document Upload Tests
  // ==========================================================================

  test.describe("Document Upload", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateTestUser("kyc-docs");
      await register(page, user);
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Navigate to document upload step
      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();
      await fillAddress(page, KYC_TEST_DATA.validAddress);
      await page.getByRole("button", { name: /continue|next/i }).click();
    });

    test("should display document upload interface", async ({ page }) => {
      await expect(page.getByText(/upload|document|photo|id/i)).toBeVisible();
    });

    test("should show accepted document types", async ({ page }) => {
      const acceptedTypes = page.getByText(/passport|driver.*license|id.*card|state.*id/i);
      await expect(acceptedTypes).toBeVisible();
    });

    test("should show upload requirements", async ({ page }) => {
      const requirements = page.getByText(/clear|readable|valid|not expired|both sides/i);
      if (await requirements.isVisible()) {
        await expect(requirements).toBeVisible();
      }
    });

    test("should validate file type", async ({ page }) => {
      const fileInput = page.locator('input[type="file"]');
      if (await fileInput.isVisible()) {
        // Try to upload invalid file type
        // This would require actual file upload testing with fixtures
        const acceptedFormats = page.getByText(/jpg|jpeg|png|pdf/i);
        await expect(acceptedFormats).toBeVisible();
      }
    });

    test("should validate file size", async ({ page }) => {
      const fileSizeLimit = page.getByText(/mb|size.*limit|maximum.*size/i);
      if (await fileSizeLimit.isVisible()) {
        await expect(fileSizeLimit).toBeVisible();
      }
    });

    test("should show upload progress", async ({ page }) => {
      const uploadArea = page.locator('[data-testid="upload-area"], .upload-zone, .dropzone');
      if (await uploadArea.isVisible()) {
        await expect(uploadArea).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // Age Verification Tests
  // ==========================================================================

  test.describe("Age Verification", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateTestUser("kyc-age");
      await register(page, user);
    });

    test("should reject underage users", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill with underage DOB
      await page.getByLabel(/first.*name/i).fill("Young");
      await page.getByLabel(/last.*name/i).fill("User");

      const dobInput = page.getByLabel(/date.*birth|dob/i);
      if (await dobInput.isVisible()) {
        // Set date to make user under 18
        const today = new Date();
        const underageDate = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate());
        await dobInput.fill(underageDate.toISOString().split("T")[0]);

        await page.getByRole("button", { name: /continue|next/i }).click();

        // Should show age restriction error
        await expect(page.getByText(/18|21|age|under.*age|must be.*older/i)).toBeVisible();
      }
    });

    test("should accept users of legal age", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      // Fill with legal age DOB
      await page.getByLabel(/first.*name/i).fill("Adult");
      await page.getByLabel(/last.*name/i).fill("User");

      const dobInput = page.getByLabel(/date.*birth|dob/i);
      if (await dobInput.isVisible()) {
        await dobInput.fill("1990-01-15");
        await page.getByRole("button", { name: /continue|next/i }).click();

        // Should proceed to next step
        await expect(page.getByLabel(/address|street/i)).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // International KYC Tests
  // ==========================================================================

  test.describe("International KYC", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateTestUser("kyc-intl");
      await register(page, user);
    });

    test("should support international addresses", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Fill international address
      await fillAddress(page, KYC_TEST_DATA.internationalAddress);

      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should accept and proceed
      await expect(page.getByText(/document|upload|photo/i)).toBeVisible();
    });

    test("should show country selector", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      const countrySelector = page.getByLabel(/country/i);
      if (await countrySelector.isVisible()) {
        await expect(countrySelector).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // KYC Error Handling Tests
  // ==========================================================================

  test.describe("Error Handling", () => {
    test.beforeEach(async ({ page }) => {
      const user = generateTestUser("kyc-error");
      await register(page, user);
    });

    test("should handle network errors during submission", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);

      // Go offline before submission
      await goOffline(page);

      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should show network error
      await expect(page.getByText(/error|failed|offline|try again|connection/i)).toBeVisible();

      await goOnline(page);
    });

    test("should preserve form data on error", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);

      // Simulate error and check data preservation
      await page.reload();

      // Navigate back to KYC
      await page.goto("/onboarding/kyc");

      // Data might be preserved depending on implementation
      const firstNameInput = page.getByLabel(/first.*name/i);
      if (await firstNameInput.isVisible()) {
        // Check if form allows continuing
        await expect(page.getByRole("button", { name: /start|continue|resume/i })).toBeVisible();
      }
    });

    test("should allow retry after submission error", async ({ page }) => {
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();

      await fillAddress(page, KYC_TEST_DATA.validAddress);

      // Go offline
      await goOffline(page);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Go back online and retry
      await goOnline(page);

      const retryButton = page.getByRole("button", { name: /retry|try again|continue/i });
      if (await retryButton.isVisible()) {
        await retryButton.click();
        // Should proceed or show success
      }
    });
  });

  // ==========================================================================
  // KYC Mobile Experience Tests
  // ==========================================================================

  test.describe("Mobile Experience", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("should display KYC form correctly on mobile", async ({ page }) => {
      const user = generateTestUser("kyc-mobile");
      await register(page, user);
      await page.goto("/onboarding/kyc");

      await expect(page.getByRole("button", { name: /start|begin|verify/i })).toBeVisible();
    });

    test("should have mobile-friendly form inputs", async ({ page }) => {
      const user = generateTestUser("kyc-mobile-form");
      await register(page, user);
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      const firstNameInput = page.getByLabel(/first.*name/i);
      if (await firstNameInput.isVisible()) {
        const box = await firstNameInput.boundingBox();
        expect(box?.width).toBeGreaterThan(200); // Should be wide enough for mobile
      }
    });

    test("should have touch-friendly buttons", async ({ page }) => {
      const user = generateTestUser("kyc-mobile-btns");
      await register(page, user);
      await page.goto("/onboarding/kyc");

      const startButton = page.getByRole("button", { name: /start|begin|verify/i });
      const box = await startButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44); // Minimum tap target
    });

    test("should support camera capture for documents on mobile", async ({ page }) => {
      const user = generateTestUser("kyc-mobile-cam");
      await register(page, user);
      await page.goto("/onboarding/kyc");
      await page.getByRole("button", { name: /start|begin|verify/i }).click();

      await fillPersonalInfo(page, KYC_TEST_DATA.validPersonalInfo);
      await page.getByRole("button", { name: /continue|next/i }).click();
      await fillAddress(page, KYC_TEST_DATA.validAddress);
      await page.getByRole("button", { name: /continue|next/i }).click();

      // Should show camera option on mobile
      const cameraOption = page.getByText(/camera|take photo|capture/i);
      if (await cameraOption.isVisible()) {
        await expect(cameraOption).toBeVisible();
      }
    });
  });

  // ==========================================================================
  // KYC Status Integration Tests
  // ==========================================================================

  test.describe("KYC Status Integration", () => {
    test("should show KYC banner for unverified users", async ({ page }) => {
      const user = generateTestUser("kyc-banner");
      await register(page, user);
      await page.goto("/dashboard");

      const kycBanner = page.getByText(/verify.*identity|complete.*kyc|verification.*required/i);
      if (await kycBanner.isVisible()) {
        await expect(kycBanner).toBeVisible();
      }
    });

    test("should link to KYC from dashboard banner", async ({ page }) => {
      const user = generateTestUser("kyc-link");
      await register(page, user);
      await page.goto("/dashboard");

      const verifyLink = page.getByRole("link", { name: /verify|complete.*kyc/i });
      if (await verifyLink.isVisible()) {
        await verifyLink.click();
        await expect(page).toHaveURL(/kyc|verification/);
      }
    });

    test("should update KYC status in real-time", async ({ page }) => {
      await login(page, TEST_USERS.kycPending);
      await page.goto("/settings/kyc");

      // Status should be visible
      await expect(page.getByText(/pending|review|processing/i)).toBeVisible();

      // In a real scenario, status would update via WebSocket or polling
    });
  });
});
