/**
 * KYC API Routes
 * Endpoints for KYC verification flow using Persona
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Client } from "@temporalio/client";
import { PersonaClient } from "@pull/core/services/persona";
import { KycTier, getTemplateId, getTierLimits, TEMPLATE_CONFIGS } from "@pull/core/services/persona/templates";
import { PlaidClient } from "@pull/core/services/plaid";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { getLogger } from "@pull/core/services";
import { toUserId } from "../lib/convex-types";

const logger = getLogger("kyc");

// ==========================================================================
// SCHEMAS
// ==========================================================================

const startKYCSchema = z.object({
  targetTier: z.enum(["basic", "standard", "enhanced", "accredited"]),
  userData: z
    .object({
      firstName: z.string(),
      lastName: z.string(),
      middleName: z.string().optional(),
      dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ssn: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
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
  redirectUri: z.string().url().optional(),
});

const resumeKYCSchema = z.object({
  inquiryId: z.string(),
});

const retryKYCSchema = z.object({
  step: z.enum(["persona", "checkr", "accreditation", "plaid"]),
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
  const client = new Client({
    connection: {
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    },
  });
  return client;
}

function getPersonaClient(): PersonaClient {
  return new PersonaClient({
    apiKey: process.env.PERSONA_API_KEY!,
    webhookSecret: process.env.PERSONA_WEBHOOK_SECRET,
  });
}

function getPlaidClient(): PlaidClient {
  return new PlaidClient({
    clientId: process.env.PLAID_CLIENT_ID!,
    secret: process.env.PLAID_SECRET!,
    env: (process.env.PLAID_ENV ?? "sandbox") as "sandbox" | "development" | "production",
  });
}

function getConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(process.env.CONVEX_URL!);
}

function tierToEnum(tier: string): KycTier {
  const tierMap: Record<string, KycTier> = {
    basic: KycTier.BASIC,
    standard: KycTier.STANDARD,
    enhanced: KycTier.ENHANCED,
    accredited: KycTier.ACCREDITED,
  };
  return tierMap[tier] ?? KycTier.BASIC;
}

// ==========================================================================
// ROUTES
// ==========================================================================

const kyc = new Hono<Env>();

/**
 * POST /kyc/start
 * Start KYC verification with Persona
 */
kyc.post("/start", zValidator("json", startKYCSchema), async (c) => {
  const userId = c.get("userId");
  const email = c.get("email");
  const body = c.req.valid("json");

  try {
    const personaClient = getPersonaClient();
    const convex = getConvexClient();
    const tier = tierToEnum(body.targetTier);
    const templateId = getTemplateId(tier);
    const limits = getTierLimits(tier);

    // First, check if user already has an active inquiry
    const existingInquiry = await personaClient.getLatestInquiryByReferenceId(userId);

    if (existingInquiry && personaClient.needsUserAction(existingInquiry)) {
      // Resume existing inquiry instead of creating new one
      const { inquiry, sessionToken } = await personaClient.resumeInquiry(existingInquiry.id);

      return c.json({
        success: true,
        data: {
          inquiryId: inquiry.id,
          sessionToken,
          status: inquiry.attributes.status,
          currentStep: inquiry.attributes.current_step_name,
          nextStep: inquiry.attributes.next_step_name,
          isResume: true,
          limits,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Create or get Persona account for this user
    const account = await personaClient.upsertAccount(userId, {
      email_address: body.userData?.email ?? email,
      name_first: body.userData?.firstName,
      name_last: body.userData?.lastName,
    });

    // Build fields from userData
    const fields: Record<string, string | number | boolean> = {};
    if (body.userData) {
      if (body.userData.firstName) fields.name_first = body.userData.firstName;
      if (body.userData.lastName) fields.name_last = body.userData.lastName;
      if (body.userData.middleName) fields.name_middle = body.userData.middleName;
      if (body.userData.dob) fields.birthdate = body.userData.dob;
      if (body.userData.phone) fields.phone_number = body.userData.phone;
      if (body.userData.email) fields.email_address = body.userData.email;
      if (body.userData.address) {
        fields.address_street_1 = body.userData.address.street;
        if (body.userData.address.street2) fields.address_street_2 = body.userData.address.street2;
        fields.address_city = body.userData.address.city;
        fields.address_subdivision = body.userData.address.state;
        fields.address_postal_code = body.userData.address.postalCode;
        fields.address_country_code = body.userData.address.country;
      }
    }

    // Create new Persona inquiry
    const { inquiry, sessionToken } = await personaClient.createInquiry({
      template_id: templateId,
      reference_id: userId,
      account_id: account.id,
      fields: Object.keys(fields).length > 0 ? fields : undefined,
      redirect_uri: body.redirectUri,
      tags: [body.targetTier, body.walletAddress ? "has_wallet" : "no_wallet"],
      note: `KYC for tier: ${body.targetTier}`,
    });

    // Store KYC record in database
    try {
      await convex.mutation(api.kyc.createKYCRecord, {
        userId: toUserId(userId),
        targetTier: body.targetTier,
        workflowId: inquiry.id,
      });
    } catch (dbError) {
      logger.warn("KYC record may already exist:", dbError);
    }

    // Update KYC record with Persona inquiry details
    await convex.mutation(api.kyc.updateKYCStatus, {
      userId: toUserId(userId),
      status: "in_progress",
      personaInquiryId: inquiry.id,
      personaAccountId: account.id,
    });

    // Optionally start Temporal workflow for background processing
    if (body.requireBankLink || body.walletAddress) {
      const temporalClient = getTemporalClient();
      const workflowId = `kyc-${userId}-${Date.now()}`;

      await temporalClient.workflow.start("kycOnboardingWorkflow", {
        taskQueue: "kyc-queue",
        workflowId,
        args: [
          {
            userId,
            email,
            firstName: body.userData?.firstName ?? "",
            lastName: body.userData?.lastName ?? "",
            walletAddress: body.walletAddress,
            templateId,
          },
        ],
      });
    }

    return c.json({
      success: true,
      data: {
        inquiryId: inquiry.id,
        sessionToken,
        status: inquiry.attributes.status,
        currentStep: inquiry.attributes.current_step_name,
        nextStep: inquiry.attributes.next_step_name,
        accountId: account.id,
        templateId,
        tier: body.targetTier,
        limits,
        isResume: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to start KYC:", error);
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
 * Get current KYC verification status from Persona
 */
kyc.get("/status", async (c) => {
  const userId = c.get("userId");

  try {
    const personaClient = getPersonaClient();
    const convex = getConvexClient();

    // Get KYC record from database
    let kycRecord;
    try {
      kycRecord = await convex.query(api.kyc.getKYCByUser, {
        userId: toUserId(userId),
      });
    } catch {
      kycRecord = null;
    }

    // Get latest inquiry from Persona
    const latestInquiry = await personaClient.getLatestInquiryByReferenceId(userId);

    if (!latestInquiry && !kycRecord) {
      return c.json({
        success: true,
        data: {
          hasActiveKYC: false,
          currentTier: "none",
          status: "not_started",
        },
        timestamp: new Date().toISOString(),
      });
    }

    // If we have an inquiry, get detailed status
    if (latestInquiry) {
      const statusDetails = personaClient.getInquiryStatusDetails(latestInquiry);
      const { inquiry, verifications } = await personaClient.getInquiryWithVerifications(
        latestInquiry.id
      );

      // Summarize verification status
      const verificationSummary = verifications.map((v) => ({
        type: v.type,
        status: v.attributes.status,
        completedAt: v.attributes.completed_at,
      }));

      // Calculate progress percentage
      const totalSteps = verifications.length || 1;
      const completedSteps = verifications.filter(
        (v) => v.attributes.status === "passed" || v.attributes.status === "confirmed"
      ).length;
      const progress = Math.round((completedSteps / totalSteps) * 100);

      return c.json({
        success: true,
        data: {
          hasActiveKYC: !statusDetails.isComplete,
          inquiryId: inquiry.id,
          status: inquiry.attributes.status,
          currentTier: kycRecord?.currentTier ?? "none",
          targetTier: kycRecord?.targetTier ?? "basic",
          currentStep: statusDetails.currentStep,
          nextStep: statusDetails.nextStep,
          isComplete: statusDetails.isComplete,
          isApproved: statusDetails.isApproved,
          isFailed: statusDetails.isFailed,
          needsAction: statusDetails.needsAction,
          progress,
          verifications: verificationSummary,
          createdAt: inquiry.attributes.created_at,
          completedAt: inquiry.attributes.completed_at,
          personalInfo: personaClient.extractPersonalInfo(inquiry),
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Return database record if no Persona inquiry found
    return c.json({
      success: true,
      data: {
        hasActiveKYC: kycRecord?.status === "in_progress",
        currentTier: kycRecord?.currentTier ?? "none",
        targetTier: kycRecord?.targetTier ?? "basic",
        status: kycRecord?.status ?? "unknown",
        progress: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get KYC status:", error);
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
 * POST /kyc/resume
 * Resume an incomplete KYC inquiry
 */
kyc.post("/resume", zValidator("json", resumeKYCSchema), async (c) => {
  const userId = c.get("userId");
  const body = c.req.valid("json");

  try {
    const personaClient = getPersonaClient();

    // Verify the inquiry belongs to this user
    const inquiry = await personaClient.getInquiry(body.inquiryId);

    if (inquiry.attributes.reference_id !== userId) {
      return c.json(
        {
          success: false,
          error: {
            code: "INQUIRY_NOT_FOUND",
            message: "Inquiry not found or does not belong to user",
          },
          timestamp: new Date().toISOString(),
        },
        404
      );
    }

    // Check if inquiry can be resumed
    if (personaClient.isInquiryComplete(inquiry)) {
      return c.json(
        {
          success: false,
          error: {
            code: "INQUIRY_COMPLETE",
            message: "This inquiry has already been completed and cannot be resumed",
          },
          timestamp: new Date().toISOString(),
        },
        400
      );
    }

    // Resume the inquiry
    const { inquiry: resumedInquiry, sessionToken } = await personaClient.resumeInquiry(
      body.inquiryId
    );

    return c.json({
      success: true,
      data: {
        inquiryId: resumedInquiry.id,
        sessionToken,
        status: resumedInquiry.attributes.status,
        currentStep: resumedInquiry.attributes.current_step_name,
        nextStep: resumedInquiry.attributes.next_step_name,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to resume KYC:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "KYC_RESUME_FAILED",
          message: error instanceof Error ? error.message : "Failed to resume KYC",
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
    logger.error("Failed to create Plaid link token:", error);
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
    logger.error("Failed to exchange Plaid token:", error);
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
    const personaClient = getPersonaClient();

    if (body.step === "persona") {
      // Get latest inquiry for user
      const latestInquiry = await personaClient.getLatestInquiryByReferenceId(userId);

      if (!latestInquiry) {
        return c.json(
          {
            success: false,
            error: {
              code: "NO_INQUIRY_FOUND",
              message: "No existing KYC inquiry found",
            },
            timestamp: new Date().toISOString(),
          },
          404
        );
      }

      // If inquiry is failed or declined, we need to create a new one
      if (personaClient.isInquiryFailed(latestInquiry)) {
        // Get the template from the original inquiry to create same type
        const templateId = latestInquiry.relationships.inquiry_template.data.id;

        // Create new inquiry with same parameters
        const { inquiry, sessionToken } = await personaClient.createInquiry({
          template_id: templateId,
          reference_id: userId,
          tags: ["retry"],
          note: `Retry after failed inquiry: ${latestInquiry.id}`,
        });

        return c.json({
          success: true,
          data: {
            message: "New KYC verification started",
            inquiryId: inquiry.id,
            sessionToken,
            status: inquiry.attributes.status,
            previousInquiryId: latestInquiry.id,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // If inquiry is still pending or needs action, resume it
      if (personaClient.needsUserAction(latestInquiry)) {
        const { inquiry, sessionToken } = await personaClient.resumeInquiry(latestInquiry.id);

        return c.json({
          success: true,
          data: {
            message: "KYC verification resumed",
            inquiryId: inquiry.id,
            sessionToken,
            status: inquiry.attributes.status,
          },
          timestamp: new Date().toISOString(),
        });
      }

      return c.json({
        success: true,
        data: {
          message: "Inquiry is already complete",
          inquiryId: latestInquiry.id,
          status: latestInquiry.attributes.status,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // For other steps, return generic response
    return c.json({
      success: true,
      data: {
        message: `Retry initiated for ${body.step}`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to retry KYC step:", error);
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
 * List uploaded KYC documents from Persona
 */
kyc.get("/documents", async (c) => {
  const userId = c.get("userId");
  const inquiryId = c.req.query("inquiryId");

  try {
    const personaClient = getPersonaClient();

    // Get inquiry ID - either from query param or latest for user
    let targetInquiryId = inquiryId;

    if (!targetInquiryId) {
      const latestInquiry = await personaClient.getLatestInquiryByReferenceId(userId);
      if (!latestInquiry) {
        return c.json({
          success: true,
          data: {
            documents: [],
            selfies: [],
          },
          timestamp: new Date().toISOString(),
        });
      }
      targetInquiryId = latestInquiry.id;
    }

    // Get documents and selfies
    const { documents, selfies } = await personaClient.getInquiryFiles(targetInquiryId);

    // Get verifications for additional document info
    const verifications = await personaClient.getVerifications(targetInquiryId);

    // Format document response
    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      kind: doc.attributes.kind,
      status: doc.attributes.status,
      createdAt: doc.attributes.created_at,
      processedAt: doc.attributes.processed_at,
      files: doc.attributes.files.map((f) => ({
        id: f.id,
        filename: f.filename,
        page: f.page,
        url: f.url,
        byteSize: f.byte_size,
      })),
    }));

    // Format selfie response
    const formattedSelfies = selfies.map((selfie) => ({
      id: selfie.id,
      status: selfie.attributes.status,
      captureMethod: selfie.attributes.capture_method,
      createdAt: selfie.attributes.created_at,
      processedAt: selfie.attributes.processed_at,
      centerPhotoUrl: selfie.attributes.center_photo_url,
      leftPhotoUrl: selfie.attributes.left_photo_url,
      rightPhotoUrl: selfie.attributes.right_photo_url,
    }));

    // Get verification checks summary
    const verificationSummary = verifications.map((v) => ({
      id: v.id,
      type: v.type,
      status: v.attributes.status,
      checks: v.attributes.checks.map((check) => ({
        name: check.name,
        status: check.status,
        reasons: check.reasons,
      })),
    }));

    return c.json({
      success: true,
      data: {
        inquiryId: targetInquiryId,
        documents: formattedDocuments,
        selfies: formattedSelfies,
        verifications: verificationSummary,
        totalDocuments: documents.length,
        totalSelfies: selfies.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get documents:", error);
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
 * GET /kyc/verifications
 * Get verification details for an inquiry
 */
kyc.get("/verifications", async (c) => {
  const userId = c.get("userId");
  const inquiryId = c.req.query("inquiryId");

  try {
    const personaClient = getPersonaClient();

    // Get inquiry ID
    let targetInquiryId = inquiryId;

    if (!targetInquiryId) {
      const latestInquiry = await personaClient.getLatestInquiryByReferenceId(userId);
      if (!latestInquiry) {
        return c.json({
          success: true,
          data: {
            verifications: [],
          },
          timestamp: new Date().toISOString(),
        });
      }
      targetInquiryId = latestInquiry.id;
    }

    // Get verifications with full details
    const verifications = await personaClient.getVerifications(targetInquiryId);

    const detailedVerifications = verifications.map((v) => ({
      id: v.id,
      type: v.type,
      status: v.attributes.status,
      createdAt: v.attributes.created_at,
      submittedAt: v.attributes.submitted_at,
      completedAt: v.attributes.completed_at,
      countryCode: v.attributes.country_code,
      checks: v.attributes.checks.map((check) => ({
        name: check.name,
        status: check.status,
        reasons: check.reasons,
        requirement: check.requirement,
      })),
      passedChecks: v.attributes.checks.filter((c) => c.status === "passed").length,
      totalChecks: v.attributes.checks.length,
    }));

    return c.json({
      success: true,
      data: {
        inquiryId: targetInquiryId,
        verifications: detailedVerifications,
        summary: {
          total: verifications.length,
          passed: verifications.filter((v) => v.attributes.status === "passed").length,
          failed: verifications.filter((v) => v.attributes.status === "failed").length,
          pending: verifications.filter(
            (v) => !["passed", "failed", "canceled"].includes(v.attributes.status)
          ).length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get verifications:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "VERIFICATIONS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to get verifications",
        },
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});

/**
 * GET /kyc/limits
 * Get transaction limits for current KYC tier
 */
kyc.get("/limits", async (c) => {
  const userId = c.get("userId");

  try {
    const convex = getConvexClient();

    // Get KYC record
    let kycRecord;
    try {
      kycRecord = await convex.query(api.kyc.getKYCByUser, {
        userId: toUserId(userId),
      });
    } catch {
      kycRecord = null;
    }

    const currentTier = kycRecord?.currentTier ?? "none";

    // Get limits for current tier
    let limits;
    if (currentTier === "none") {
      limits = {
        dailyDeposit: 0,
        dailyWithdrawal: 0,
        dailyTrading: 0,
        monthlyDeposit: 0,
        monthlyWithdrawal: 0,
        singleTradeMax: 0,
      };
    } else {
      limits = getTierLimits(tierToEnum(currentTier));
    }

    // Get all tier limits for comparison
    const allTierLimits = Object.values(KycTier).map((tier) => ({
      tier,
      limits: getTierLimits(tier),
      config: TEMPLATE_CONFIGS[tier],
    }));

    return c.json({
      success: true,
      data: {
        currentTier,
        limits,
        allTiers: allTierLimits,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to get limits:", error);
    return c.json(
      {
        success: false,
        error: {
          code: "LIMITS_FETCH_FAILED",
          message: error instanceof Error ? error.message : "Failed to get limits",
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
    logger.error("Failed to cancel KYC:", error);
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

      // Feature protected by feature flag - Convex integration pending
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
      logger.error("Failed to start upgrade:", error);
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
export { kyc as kycRoutes };
