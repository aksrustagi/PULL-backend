/**
 * KYC API Routes
 * Endpoints for KYC verification flow
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Client } from "@temporalio/client";
import { SumsubClient } from "@pull/core/services/sumsub";
import { PlaidClient } from "@pull/core/services/plaid";

// ==========================================================================
// SCHEMAS
// ==========================================================================

const startKYCSchema = z.object({
  targetTier: z.enum(["basic", "enhanced", "accredited"]),
  userData: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      middleName: z.string().optional(),
      dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ssn: z.string().optional(),
      phone: z.string().optional(),
      address: z
        .object({
          street: z.string(),
          street2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          postalCode: z.string(),
          country: z.string(),
        })
        .optional(),
      nationality: z.string().optional(),
    })
    .optional(),
  requireBankLink: z.boolean().optional(),
  walletAddress: z.string().optional(),
  walletChain: z.string().optional(),
});

const retryKYCSchema = z.object({
  step: z.enum(["sumsub", "checkr", "accreditation", "plaid"]),
});

const plaidExchangeSchema = z.object({
  publicToken: z.string(),
  accountId: z.string(),
  institutionId: z.string().optional(),
  institutionName: z.string().optional(),
  accountMask: z.string().optional(),
});

// ==========================================================================
// TYPES
// ==========================================================================

interface Env {
  Variables: {
    userId: string;
    email: string;
  };
}

// ==========================================================================
// HELPERS
// ==========================================================================

function getTemporalClient(): Client {
  // TODO: Initialize Temporal client from environment
  const client = new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
  return client;
}

function getSumsubClient(): SumsubClient {
  return new SumsubClient({
    appToken: process.env.SUMSUB_APP_TOKEN!,
    secretKey: process.env.SUMSUB_SECRET_KEY!,
    webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET,
  });
}

function getPlaidClient(): PlaidClient {
  return new PlaidClient({
    clientId: process.env.PLAID_CLIENT_ID!,
    secret: process.env.PLAID_SECRET!,
    env: (process.env.PLAID_ENV ?? "sandbox") as "sandbox" | "development" | "production",
  });
}

// ==========================================================================
// ROUTES
// ==========================================================================

const kyc = new Hono<Env>();

/**
 * POST /kyc/start
 * Start KYC verification workflow
 */
kyc.post("/start", zValidator("json", startKYCSchema), async (c) => {
  const userId = c.get("userId");
  const email = c.get("email");
  const body = c.req.valid("json");

  try {
    const client = getTemporalClient();
    const sumsubClient = getSumsubClient();

    // Start workflow
    const workflowId = `kyc-onboarding-${userId}-${Date.now()}`;
    const handle = await client.workflow.start("onboardingKYCWorkflow", {
      taskQueue: "kyc-queue",
      workflowId,
      args: [
        {
          userId,
          email,
          targetTier: body.targetTier,
          userData: body.userData,
          requireBankLink: body.requireBankLink,
          walletAddress: body.walletAddress,
          walletChain: body.walletChain,
        },
      ],
    });

    // Query for initial status to get Sumsub token
    const status = await handle.query("getKYCStatus");

    return c.json({
      success: true,
      data: {
        workflowId,
        sumsubAccessToken: status.sumsubAccessToken,
        sumsubApplicantId: status.sumsubApplicantId,
        status: status.status,
        currentStep: status.currentStep,
        progress: status.progress,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to start KYC:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "KYC_START_FAILED",
          message: error instanceof Error ? error.message : "Failed to start KYC",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /kyc/status
 * Get current KYC verification status
 */
kyc.get("/status", async (c) => {
  const userId = c.get("userId");

  try {
    const client = getTemporalClient();

    // Find active workflow for user
    const workflows = client.workflow.list({
      query: `WorkflowId STARTS_WITH "kyc-" AND WorkflowId CONTAINS "${userId}"`,
    });

    let latestWorkflow = null;
    for await (const workflow of workflows) {
      if (
        workflow.status.name === "RUNNING" ||
        !latestWorkflow ||
        workflow.startTime > latestWorkflow.startTime
      ) {
        latestWorkflow = workflow;
      }
    }

    if (!latestWorkflow) {
      return c.json({
        success: true,
        data: {
          hasActiveKYC: false,
          currentTier: "none",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Query workflow status
    const handle = client.workflow.getHandle(latestWorkflow.workflowId);
    const status = await handle.query("getKYCStatus");

    return c.json({
      success: true,
      data: {
        hasActiveKYC: latestWorkflow.status.name === "RUNNING",
        workflowId: latestWorkflow.workflowId,
        ...status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get KYC status:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "KYC_STATUS_FAILED",
          message: error instanceof Error ? error.message : "Failed to get KYC status",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /kyc/plaid/link-token
 * Generate Plaid Link token for bank account linking
 */
kyc.post("/plaid/link-token", async (c) => {
  const userId = c.get("userId");

  try {
    const plaidClient = getPlaidClient();

    const response = await plaidClient.createLinkToken({
      userId,
      products: ["auth", "identity"],
    });

    return c.json({
      success: true,
      data: {
        linkToken: response.link_token,
        expiration: response.expiration,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to create Plaid link token:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "PLAID_LINK_TOKEN_FAILED",
          message: error instanceof Error ? error.message : "Failed to create link token",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /kyc/plaid/exchange
 * Exchange Plaid public token after successful link
 */
kyc.post("/plaid/exchange", zValidator("json", plaidExchangeSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  try {
    const client = getTemporalClient();

    // Find active KYC workflow
    const workflows = client.workflow.list({
      query: `WorkflowId STARTS_WITH "kyc-" AND WorkflowId CONTAINS "${userId}" AND ExecutionStatus = "Running"`,
    });

    let workflowHandle = null;
    for await (const workflow of workflows) {
      workflowHandle = client.workflow.getHandle(workflow.workflowId);
      break;
    }

    if (!workflowHandle) {
      return c.json(
        {
          success: false,
          error: {
            code: "NO_ACTIVE_KYC",
            message: "No active KYC workflow found",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Signal workflow with Plaid data
    await workflowHandle.signal("plaidLinked", {
      publicToken: body.publicToken,
      accountId: body.accountId,
      institutionId: body.institutionId,
      institutionName: body.institutionName,
      accountMask: body.accountMask,
    });

    return c.json({
      success: true,
      data: {
        message: "Plaid link completed",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to exchange Plaid token:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "PLAID_EXCHANGE_FAILED",
          message: error instanceof Error ? error.message : "Failed to exchange token",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /kyc/retry
 * Retry a failed KYC verification step
 */
kyc.post("/retry", zValidator("json", retryKYCSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  try {
    const sumsubClient = getSumsubClient();

    if (body.step === "sumsub") {
      // Get applicant by external user ID and reset
      const applicant = await sumsubClient.getApplicantByExternalId(userId);
      if (applicant) {
        await sumsubClient.resetApplicant(applicant.id);

        // Generate new access token
        const { token } = await sumsubClient.generateAccessTokenForApplicant(applicant.id);

        return c.json({
          success: true,
          data: {
            message: "Sumsub verification reset",
            sumsubAccessToken: token,
            sumsubApplicantId: applicant.id,
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    return c.json({
      success: true,
      data: {
        message: `Retry initiated for ${body.step}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to retry KYC step:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "KYC_RETRY_FAILED",
          message: error instanceof Error ? error.message : "Failed to retry",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /kyc/documents
 * List uploaded KYC documents
 */
kyc.get("/documents", async (c) => {
  const userId = c.get("userId");

  try {
    const sumsubClient = getSumsubClient();

    // Get applicant
    const applicant = await sumsubClient.getApplicantByExternalId(userId);
    if (!applicant) {
      return c.json({
        success: true,
        data: {
          documents: [],
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get verification steps to see document status
    const steps = await sumsubClient.getVerificationSteps(applicant.id);

    return c.json({
      success: true,
      data: {
        applicantId: applicant.id,
        steps,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to get documents:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "DOCUMENTS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to get documents",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /kyc/cancel
 * Cancel active KYC workflow
 */
kyc.post("/cancel", async (c) => {
  const userId = c.get("userId");

  try {
    const client = getTemporalClient();

    // Find active workflow
    const workflows = client.workflow.list({
      query: `WorkflowId STARTS_WITH "kyc-" AND WorkflowId CONTAINS "${userId}" AND ExecutionStatus = "Running"`,
    });

    let cancelled = false;
    for await (const workflow of workflows) {
      const handle = client.workflow.getHandle(workflow.workflowId);
      await handle.signal("cancelKYC");
      cancelled = true;
    }

    if (!cancelled) {
      return c.json(
        {
          success: false,
          error: {
            code: "NO_ACTIVE_KYC",
            message: "No active KYC workflow to cancel",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        message: "KYC workflow cancelled",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to cancel KYC:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "KYC_CANCEL_FAILED",
          message: error instanceof Error ? error.message : "Failed to cancel KYC",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * POST /kyc/upgrade
 * Start KYC tier upgrade workflow
 */
kyc.post(
  "/upgrade",
  zValidator(
    "json",
    z.object({
      targetTier: z.enum(["enhanced", "accredited"]),
      requireBankLink: z.boolean().optional(),
    })
  ),
  async (c) => {
    const userId = c.get("userId");
    const email = c.get("email");
    const body = c.req.valid("json");

    try {
      const client = getTemporalClient();

      // TODO: Get current tier from database
      const currentTier = "basic"; // Placeholder

      const workflowId = `kyc-upgrade-${userId}-${Date.now()}`;
      const handle = await client.workflow.start("upgradeKYCWorkflow", {
        taskQueue: "kyc-queue",
        workflowId,
        args: [
          {
            userId,
            email,
            currentTier,
            targetTier: body.targetTier,
            requireBankLink: body.requireBankLink,
          },
        ],
      });

      const status = await handle.query("getUpgradeStatus");

      return c.json({
        success: true,
        data: {
          workflowId,
          status: status.status,
          currentStep: status.currentStep,
          progress: status.progress,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to start upgrade:", error);
      return c.json(
        {
          success: false,
          error: {
            code: "UPGRADE_START_FAILED",
            message: error instanceof Error ? error.message : "Failed to start upgrade",
          },
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }
);

export default kyc;
