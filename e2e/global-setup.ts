import { chromium, FullConfig } from "@playwright/test";

/**
 * Global E2E Test Setup
 * Runs before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log("Running global E2E setup...");

  // Set up test environment variables
  process.env.E2E_RUNNING = "true";

  // Create test users and data if needed
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for services to be ready
    const baseURL = config.projects[0]?.use?.baseURL || "http://localhost:3000";
    const apiURL = process.env.E2E_API_URL || "http://localhost:3001";

    // Check web app is ready
    await page.goto(baseURL, { waitUntil: "networkidle" });
    console.log("Web app is ready");

    // Check API is ready
    const apiResponse = await page.request.get(`${apiURL}/health`);
    if (apiResponse.ok()) {
      console.log("API is ready");
    } else {
      console.warn("API health check failed, some tests may fail");
    }

    // Store authentication state for reuse
    // This can be used to skip login in tests
    // await page.context().storageState({ path: './e2e/.auth/user.json' });

  } catch (error) {
    console.error("Global setup error:", error);
    // Don't fail setup, let tests handle missing services
  } finally {
    await browser.close();
  }

  console.log("Global E2E setup complete");
}

export default globalSetup;
