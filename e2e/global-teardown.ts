import { FullConfig } from "@playwright/test";

/**
 * Global E2E Test Teardown
 * Runs after all tests
 */
async function globalTeardown(config: FullConfig) {
  console.log("Running global E2E teardown...");

  // Clean up test data if needed
  // For example, delete test users created during tests

  // Clean up environment
  delete process.env.E2E_RUNNING;

  console.log("Global E2E teardown complete");
}

export default globalTeardown;
