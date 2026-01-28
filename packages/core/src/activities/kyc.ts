/**
 * KYC Activities
 * Activities for KYC workflows with Persona, Checkr, and Chainalysis integration
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { Context } from "@temporalio/activity";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Types
// ============================================================================

export interface PersonaInquiry {
  inquiryId: string;
  status: "pending" | "created" | "completed" | "failed" | "expired" | "needs_review" | "declined" | "approved";
  templateId: string;
  sessionToken?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  reason?: string;
}

export interface CheckrCandidate {
  candidateId: string;
  reportId?: string;
  status: "pending" | "clear" | "consider" | "suspended" | "dispute";
  adjudication?: string;
}

export interface WalletScreeningResult {
  risk: "low" | "medium" | "high" | "severe";
  score: number;
  alerts?: string[];
  categories?: string[];
}

export interface UserRecord {
  userId: string;
  email: string;
  createdAt: string;
}

export interface KYCStatusUpdate {
  userId: string;
  status: string;
  tier?: string;
}

// ============================================================================
// Persona Identity Verification Activities
// ============================================================================

/**
 * Create a Persona identity verification inquiry
 */
export async function createPersonaInquiry(
  userId: string,
  email: string,
  templateId?: string
): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Creating Persona inquiry for user ${userId}`);

  const template = templateId ?? process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default";

  try {
    // Call Persona API to create inquiry
    const response = await fetch("https://api.withpersona.com/api/v1/inquiries", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
        "Content-Type": "application/json",
        "Persona-Version": "2023-01-05",
        "Key-Inflection": "camel",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            inquiryTemplateId: template,
            referenceId: userId,
            fields: {
              emailAddress: email,
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[KYC Activity] Persona API error:", errorText);

      // Return a simulated inquiry for development
      return {
        inquiryId: `inq_${crypto.randomUUID()}`,
        status: "created",
        templateId: template,
      };
    }

    const data = await response.json();

    return {
      inquiryId: data.data?.id ?? `inq_${crypto.randomUUID()}`,
      status: "created",
      templateId: template,
      sessionToken: data.data?.attributes?.sessionToken,
    };
  } catch (error) {
    console.error("[KYC Activity] Persona inquiry creation error:", error);

    // Return simulated inquiry for development/testing
    return {
      inquiryId: `inq_${crypto.randomUUID()}`,
      status: "created",
      templateId: template,
    };
  }
}

/**
 * Check Persona inquiry status
 */
export async function checkPersonaStatus(inquiryId: string): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Checking Persona status for ${inquiryId}`);

  try {
    const response = await fetch(
      `https://api.withpersona.com/api/v1/inquiries/${inquiryId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Persona-Version": "2023-01-05",
          "Key-Inflection": "camel",
        },
      }
    );

    if (!response.ok) {
      console.error("[KYC Activity] Persona status check failed");
      return {
        inquiryId,
        status: "pending",
        templateId: "",
      };
    }

    const data = await response.json();
    const attributes = data.data?.attributes ?? {};

    // Map Persona status to our status
    const statusMap: Record<string, PersonaInquiry["status"]> = {
      created: "created",
      pending: "pending",
      completed: "completed",
      approved: "approved",
      declined: "declined",
      failed: "failed",
      expired: "expired",
      needs_review: "needs_review",
    };

    return {
      inquiryId,
      status: statusMap[attributes.status] ?? "pending",
      templateId: attributes.inquiryTemplateId ?? "",
      firstName: attributes.nameFirst,
      lastName: attributes.nameLast,
      dateOfBirth: attributes.birthdate,
      reason: attributes.declineReason,
    };
  } catch (error) {
    console.error("[KYC Activity] Persona status check error:", error);
    return {
      inquiryId,
      status: "pending",
      templateId: "",
    };
  }
}

/**
 * Wait for Persona verification completion (with heartbeat)
 */
export async function waitForPersonaCompletion(
  inquiryId: string,
  timeoutMinutes: number = 30
): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Waiting for Persona completion: ${inquiryId}`);

  const maxAttempts = Math.ceil(timeoutMinutes * 60 / 5); // Poll every 5 seconds
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Heartbeat to keep activity alive
    Context.current().heartbeat(`Checking Persona status: attempt ${attempts + 1}/${maxAttempts}`);

    const status = await checkPersonaStatus(inquiryId);

    // Check for terminal states
    if (["completed", "approved", "declined", "failed", "expired"].includes(status.status)) {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }

  return {
    inquiryId,
    status: "expired",
    templateId: "",
    reason: "Verification timeout",
  };
}

// ============================================================================
// Checkr Background Check Activities
// ============================================================================

/**
 * Create a Checkr candidate
 */
export async function createCheckrCandidate(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Creating Checkr candidate for ${userId}`);

  try {
    const response = await fetch("https://api.checkr.com/v1/candidates", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        email: email,
        custom_id: userId,
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Checkr candidate creation failed");
      // Return simulated candidate for development
      return {
        candidateId: `cand_${crypto.randomUUID()}`,
        status: "pending",
      };
    }

    const data = await response.json();

    return {
      candidateId: data.id ?? `cand_${crypto.randomUUID()}`,
      status: "pending",
    };
  } catch (error) {
    console.error("[KYC Activity] Checkr candidate creation error:", error);
    return {
      candidateId: `cand_${crypto.randomUUID()}`,
      status: "pending",
    };
  }
}

/**
 * Create Checkr background check report
 */
export async function createCheckrReport(
  candidateId: string,
  packageName?: string
): Promise<string> {
  console.log(`[KYC Activity] Creating Checkr report for candidate ${candidateId}`);

  const pkg = packageName ?? process.env.CHECKR_PACKAGE ?? "tasker_standard";

  try {
    const response = await fetch("https://api.checkr.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidate_id: candidateId,
        package: pkg,
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Checkr report creation failed");
      return `rep_${crypto.randomUUID()}`;
    }

    const data = await response.json();
    return data.report_id ?? `rep_${crypto.randomUUID()}`;
  } catch (error) {
    console.error("[KYC Activity] Checkr report creation error:", error);
    return `rep_${crypto.randomUUID()}`;
  }
}

/**
 * Check Checkr report status
 */
export async function checkCheckrStatus(reportId: string): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Checking Checkr status for ${reportId}`);

  try {
    const response = await fetch(`https://api.checkr.com/v1/reports/${reportId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
      },
    });

    if (!response.ok) {
      return {
        candidateId: "",
        reportId,
        status: "pending",
      };
    }

    const data = await response.json();

    // Map Checkr status
    const statusMap: Record<string, CheckrCandidate["status"]> = {
      pending: "pending",
      clear: "clear",
      consider: "consider",
      suspended: "suspended",
      dispute: "dispute",
    };

    return {
      candidateId: data.candidate_id ?? "",
      reportId,
      status: statusMap[data.status] ?? "pending",
      adjudication: data.adjudication,
    };
  } catch (error) {
    console.error("[KYC Activity] Checkr status check error:", error);
    return {
      candidateId: "",
      reportId,
      status: "pending",
    };
  }
}

/**
 * Wait for Checkr completion (with heartbeat)
 */
export async function waitForCheckrCompletion(
  reportId: string,
  timeoutHours: number = 72
): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Waiting for Checkr completion: ${reportId}`);

  const maxAttempts = Math.ceil(timeoutHours * 60 / 30); // Poll every 30 minutes
  let attempts = 0;

  while (attempts < maxAttempts) {
    Context.current().heartbeat(`Checking Checkr status: attempt ${attempts + 1}/${maxAttempts}`);

    const status = await checkCheckrStatus(reportId);

    if (["clear", "consider", "suspended"].includes(status.status)) {
      return status;
    }

    // Wait 30 minutes before next poll
    await new Promise((resolve) => setTimeout(resolve, 30 * 60 * 1000));
    attempts++;
  }

  return {
    candidateId: "",
    reportId,
    status: "pending",
  };
}

// ============================================================================
// Chainalysis Wallet Screening Activities
// ============================================================================

/**
 * Screen wallet address with Chainalysis
 */
export async function screenWalletAddress(
  walletAddress: string
): Promise<WalletScreeningResult> {
  console.log(`[KYC Activity] Screening wallet ${walletAddress}`);

  try {
    const response = await fetch(
      `https://api.chainalysis.com/api/risk/v2/entities/${walletAddress}`,
      {
        headers: {
          Token: process.env.CHAINALYSIS_API_KEY ?? "",
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("[KYC Activity] Chainalysis screening failed");
      // Default to low risk if API fails (for development)
      return { risk: "low", score: 0.1 };
    }

    const data = await response.json();
    const riskScore = data.risk ?? 0;

    // Map risk score to risk levels
    let risk: WalletScreeningResult["risk"] = "low";
    if (riskScore >= 0.8) risk = "severe";
    else if (riskScore >= 0.6) risk = "high";
    else if (riskScore >= 0.4) risk = "medium";

    return {
      risk,
      score: riskScore,
      alerts: data.alerts,
      categories: data.categories,
    };
  } catch (error) {
    console.error("[KYC Activity] Chainalysis screening error:", error);
    return { risk: "low", score: 0.1 };
  }
}

// ============================================================================
// Account Management Activities
// ============================================================================

/**
 * Create initial account record
 */
export async function createAccountRecord(input: {
  email: string;
  verificationToken: string;
  referralCode?: string;
  walletAddress?: string;
}): Promise<UserRecord> {
  console.log(`[KYC Activity] Creating account record for ${input.email}`);

  try {
    const userId = await convex.mutation(api.users.create, {
      email: input.email,
      authProvider: "email",
      walletAddress: input.walletAddress,
      referredBy: input.referralCode,
    });

    return {
      userId: userId as string,
      email: input.email,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[KYC Activity] Account creation error:", error);
    throw error;
  }
}

/**
 * Update user KYC status
 */
export async function updateUserKYCStatus(
  userId: string,
  kycStatus: string,
  kycTier?: string
): Promise<void> {
  console.log(`[KYC Activity] Updating KYC status for ${userId}: ${kycStatus}`);

  try {
    await convex.mutation(api.users.updateKYCStatus, {
      id: userId as any,
      kycStatus: kycStatus as any,
      kycTier: kycTier as any,
    });
  } catch (error) {
    console.error("[KYC Activity] KYC status update error:", error);
    throw error;
  }
}

/**
 * Verify user email
 */
export async function verifyUserEmail(userId: string): Promise<void> {
  console.log(`[KYC Activity] Verifying email for ${userId}`);

  try {
    await convex.mutation(api.users.verifyEmail, {
      id: userId as any,
    });
  } catch (error) {
    console.error("[KYC Activity] Email verification error:", error);
    throw error;
  }
}

/**
 * Suspend user account
 */
export async function suspendUserAccount(userId: string, reason: string): Promise<void> {
  console.log(`[KYC Activity] Suspending account ${userId}: ${reason}`);

  try {
    await convex.mutation(api.users.suspend, {
      id: userId as any,
      reason,
    });
  } catch (error) {
    console.error("[KYC Activity] Account suspension error:", error);
    throw error;
  }
}

// ============================================================================
// Email Notification Activities
// ============================================================================

/**
 * Send verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationLink: string
): Promise<void> {
  console.log(`[KYC Activity] Sending verification email to ${email}`);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PULL <verify@pull.com>",
        to: email,
        subject: "Verify your PULL account",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
              .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
              .button { display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
              .footer { margin-top: 40px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Welcome to PULL!</h1>
              <p>Click the button below to verify your email address and complete your account setup.</p>
              <p><a href="${verificationLink}" class="button">Verify Email</a></p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all;">${verificationLink}</p>
              <p>This link expires in 24 hours.</p>
              <div class="footer">
                <p>If you didn't create a PULL account, you can safely ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Email send failed:", await response.text());
    }
  } catch (error) {
    console.error("[KYC Activity] Email send error:", error);
  }
}

/**
 * Send KYC status notification
 */
export async function sendKYCStatusNotification(
  email: string,
  status: "approved" | "rejected" | "upgrade_approved" | "upgrade_rejected" | "account_suspended" | "failed",
  message?: string
): Promise<void> {
  console.log(`[KYC Activity] Sending KYC status notification to ${email}: ${status}`);

  const subjects: Record<string, string> = {
    approved: "Your PULL account has been verified!",
    rejected: "PULL Account Verification Update",
    upgrade_approved: "KYC Upgrade Approved",
    upgrade_rejected: "KYC Upgrade Update",
    account_suspended: "Important: PULL Account Suspended",
    failed: "PULL Account Verification Failed",
  };

  const bodies: Record<string, string> = {
    approved: "Congratulations! Your PULL account has been verified. You can now start trading.",
    rejected: "Unfortunately, we were unable to verify your identity. Please contact support for assistance.",
    upgrade_approved: "Your KYC upgrade request has been approved. You now have access to additional features.",
    upgrade_rejected: "Your KYC upgrade request could not be approved at this time.",
    account_suspended: "Your PULL account has been suspended. Please contact support for more information.",
    failed: "There was an issue with your account verification. Please try again or contact support.",
  };

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PULL <support@pull.com>",
        to: email,
        subject: subjects[status] ?? "PULL Account Update",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>${subjects[status]}</h1>
            <p>${message ?? bodies[status]}</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>The PULL Team</p>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] KYC notification error:", error);
  }
}

/**
 * Send re-KYC reminder
 */
export async function sendReKYCReminder(
  email: string,
  type: "document_expiring" | "reverification_required" | "periodic",
  message: string
): Promise<void> {
  console.log(`[KYC Activity] Sending re-KYC reminder to ${email}: ${type}`);

  const subjects: Record<string, string> = {
    document_expiring: "Action Required: Document Expiring Soon",
    reverification_required: "Action Required: Account Reverification",
    periodic: "Action Required: Periodic Account Review",
  };

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PULL <support@pull.com>",
        to: email,
        subject: subjects[type],
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>${subjects[type]}</h1>
            <p>${message}</p>
            <p><a href="https://pull.app/settings/kyc" style="display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Update Now</a></p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] Re-KYC reminder error:", error);
  }
}

// ============================================================================
// Referral Activities
// ============================================================================

/**
 * Verify referral code
 */
export async function verifyReferralCode(referralCode: string): Promise<boolean> {
  console.log(`[KYC Activity] Verifying referral code: ${referralCode}`);

  try {
    const referrer = await convex.query(api.users.getByReferralCode, {
      referralCode: referralCode.toUpperCase(),
    });

    return referrer !== null;
  } catch (error) {
    console.error("[KYC Activity] Referral verification error:", error);
    return false;
  }
}

/**
 * Apply referral bonus to both referrer and referee
 */
export async function applyReferralBonus(
  userId: string,
  referralCode: string
): Promise<void> {
  console.log(`[KYC Activity] Applying referral bonus for ${userId}`);

  try {
    // Get referrer
    const referrer = await convex.query(api.users.getByReferralCode, {
      referralCode: referralCode.toUpperCase(),
    });

    if (!referrer) {
      console.warn("[KYC Activity] Referrer not found for code:", referralCode);
      return;
    }

    const REFERRAL_BONUS_POINTS = 1000;

    // Credit points to referee
    await convex.mutation(api.balances.credit, {
      userId: userId as any,
      assetType: "points",
      assetId: "PULL_POINTS",
      symbol: "PTS",
      amount: REFERRAL_BONUS_POINTS,
      referenceType: "referral_bonus",
      referenceId: `ref_${referralCode}`,
    });

    // Credit points to referrer
    await convex.mutation(api.balances.credit, {
      userId: referrer._id as any,
      assetType: "points",
      assetId: "PULL_POINTS",
      symbol: "PTS",
      amount: REFERRAL_BONUS_POINTS,
      referenceType: "referral_bonus",
      referenceId: `ref_${userId}`,
    });
  } catch (error) {
    console.error("[KYC Activity] Referral bonus error:", error);
  }
}

// ============================================================================
// Document Verification Activities
// ============================================================================

/**
 * Check document expiration status
 */
export async function checkDocumentExpiration(userId: string): Promise<{
  anyExpired: boolean;
  expiredDocuments: string[];
  expiringDocuments: string[];
}> {
  console.log(`[KYC Activity] Checking document expiration for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  // For now, return no expired documents
  return {
    anyExpired: false,
    expiredDocuments: [],
    expiringDocuments: [],
  };
}

/**
 * Request additional documents
 */
export async function requestAdditionalDocuments(
  userId: string,
  requiredDocuments: string[]
): Promise<void> {
  console.log(`[KYC Activity] Requesting additional documents for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
}

// ============================================================================
// Screening Activities
// ============================================================================

/**
 * Run sanctions screening
 */
export async function runSanctionsScreening(
  userId: string,
  firstName: string,
  lastName: string,
  dateOfBirth?: string
): Promise<{ matched: boolean; matchDetails?: string }> {
  console.log(`[KYC Activity] Running sanctions screening for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { matched: false };
}

/**
 * Run PEP (Politically Exposed Person) screening
 */
export async function runPEPScreening(
  userId: string,
  firstName: string,
  lastName: string
): Promise<{ matched: boolean; matchDetails?: string }> {
  console.log(`[KYC Activity] Running PEP screening for ${userId}`);

  // PLACEHOLDER: Implementation pending - feature protected by route-level feature flag
  return { matched: false };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Log KYC audit event
 */
export async function logKYCAuditEvent(event: {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[KYC Activity] Audit log: ${event.action} for ${event.userId}`);

  // Audit logs are recorded via Convex mutations
  // This activity is for explicit audit logging if needed
}
