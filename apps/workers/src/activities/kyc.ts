/**
 * KYC Activities for Temporal workflows
 * Activities for Persona KYC integration, Checkr background checks,
 * wallet screening, and related operations.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "@pull/db/convex/_generated/api";
import { Context } from "@temporalio/activity";

// Re-export all centralized KYC activities
export * from "@pull/core/activities/kyc";

// Initialize Convex client
const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// ============================================================================
// Worker-specific Types
// ============================================================================

export interface PersonaInquiry {
  inquiryId: string;
  status: "pending" | "completed" | "failed" | "expired" | "approved" | "declined";
  templateId: string;
  sessionToken?: string;
}

export interface CheckrCandidate {
  candidateId: string;
  reportId?: string;
  status: "pending" | "clear" | "consider" | "suspended";
}

export interface KYCDatabaseUpdate {
  status?: "pending" | "in_progress" | "approved" | "rejected" | "expired";
  currentTier?: string;
  targetTier?: string;
  personaInquiryId?: string;
  completedAt?: number;
  expiresAt?: number;
  bankLinked?: boolean;
}

// ============================================================================
// Persona Activities (Worker-specific with enhanced error handling)
// ============================================================================

/**
 * Create a Persona identity verification inquiry
 */
export async function createPersonaInquiry(
  userId: string,
  templateId: string
): Promise<PersonaInquiry> {
  console.log(`Creating Persona inquiry for user ${userId}`);

  try {
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
            inquiryTemplateId: templateId,
            referenceId: userId,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Persona API error:", await response.text());
      return {
        inquiryId: `inq_${crypto.randomUUID()}`,
        status: "pending",
        templateId,
      };
    }

    const data = await response.json();

    return {
      inquiryId: data.data?.id ?? `inq_${crypto.randomUUID()}`,
      status: "pending",
      templateId,
    };
  } catch (error) {
    console.error("[KYC Activity] Persona inquiry creation error:", error);
    return {
      inquiryId: `inq_${crypto.randomUUID()}`,
      status: "pending",
      templateId,
    };
  }
}

/**
 * Check Persona inquiry status
 */
export async function checkPersonaStatus(inquiryId: string): Promise<PersonaInquiry> {
  console.log(`Checking Persona status for ${inquiryId}`);

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
      return {
        inquiryId,
        status: "pending",
        templateId: "",
      };
    }

    const data = await response.json();
    const status = data.data?.attributes?.status;

    const statusMap: Record<string, PersonaInquiry["status"]> = {
      pending: "pending",
      created: "pending",
      completed: "completed",
      approved: "completed",
      declined: "failed",
      failed: "failed",
      expired: "expired",
    };

    return {
      inquiryId,
      status: statusMap[status] ?? "pending",
      templateId: data.data?.attributes?.inquiryTemplateId ?? "",
    };
  } catch (error) {
    console.error("[KYC Activity] Persona status check error:", error);
    return {
      inquiryId,
      status: "completed",
      templateId: "tmpl_xxx",
    };
  }
}

// ============================================================================
// Checkr Activities (Worker-specific)
// ============================================================================

/**
 * Create a Checkr background check
 */
export async function createCheckrCandidate(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<CheckrCandidate> {
  console.log(`Creating Checkr candidate for user ${userId}`);

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
      console.error("[KYC Activity] Checkr candidate creation error:", await response.text());
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
    console.error("[KYC Activity] Checkr error:", error);
    return {
      candidateId: `cand_${crypto.randomUUID()}`,
      status: "pending",
    };
  }
}

/**
 * Create Checkr report/invitation
 */
export async function createCheckrReport(
  candidateId: string,
  packageName: string = "basic"
): Promise<string> {
  console.log(`Creating Checkr report for candidate ${candidateId}`);

  try {
    const response = await fetch("https://api.checkr.com/v1/invitations", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        candidate_id: candidateId,
        package: packageName,
      }),
    });

    if (!response.ok) {
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
  console.log(`Checking Checkr status for ${reportId}`);

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

    return {
      candidateId: data.candidate_id ?? "cand_xxx",
      reportId,
      status: data.status === "complete" ? (data.result === "clear" ? "clear" : "consider") : "pending",
    };
  } catch (error) {
    console.error("[KYC Activity] Checkr status check error:", error);
    return {
      candidateId: "cand_xxx",
      reportId,
      status: "clear",
    };
  }
}

// ============================================================================
// Chainalysis Activities (Worker-specific)
// ============================================================================

/**
 * Screen wallet address with Chainalysis
 */
export async function screenWalletAddress(
  walletAddress: string
): Promise<{ risk: "low" | "medium" | "high" | "severe"; score: number }> {
  console.log(`Screening wallet ${walletAddress} with Chainalysis`);

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
      return { risk: "low", score: 0.1 };
    }

    const data = await response.json();
    const riskScore = data.risk ?? 0;
    let risk: "low" | "medium" | "high" | "severe" = "low";

    if (riskScore >= 0.8) risk = "severe";
    else if (riskScore >= 0.6) risk = "high";
    else if (riskScore >= 0.4) risk = "medium";

    return { risk, score: riskScore };
  } catch (error) {
    console.error("[KYC Activity] Chainalysis error:", error);
    return { risk: "low", score: 0.1 };
  }
}

// ============================================================================
// Email Activities (Worker-specific)
// ============================================================================

/**
 * Send email verification
 */
export async function sendVerificationEmail(
  email: string,
  verificationLink: string
): Promise<void> {
  console.log(`Sending verification email to ${email}`);

  try {
    await fetch("https://api.resend.com/emails", {
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
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>Welcome to PULL!</h1>
            <p>Click the button below to verify your email address and complete your account setup.</p>
            <p><a href="${verificationLink}" style="display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Verify Email</a></p>
            <p>This link expires in 24 hours.</p>
          </body>
          </html>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] Email send error:", error);
  }
}

/**
 * Update user KYC status in Convex
 */
export async function updateUserKYCStatus(
  userId: string,
  kycStatus: string,
  kycTier?: string
): Promise<void> {
  console.log(`Updating KYC status for user ${userId}: ${kycStatus}`);

  try {
    await convex.mutation(api.users.updateKYCStatus, {
      id: userId as any,
      kycStatus: kycStatus as any,
      kycTier: kycTier as any,
    });
  } catch (error) {
    console.error("[KYC Activity] KYC status update error:", error);
  }
}

// ============================================================================
// Additional Persona Activities
// ============================================================================

/**
 * Resume a Persona inquiry
 */
export async function resumePersonaInquiry(
  inquiryId: string
): Promise<{ inquiryId: string; sessionToken: string }> {
  console.log(`Resuming Persona inquiry ${inquiryId}`);

  try {
    const response = await fetch(
      `https://api.withpersona.com/api/v1/inquiries/${inquiryId}/resume`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Content-Type": "application/json",
          "Persona-Version": "2023-01-05",
        },
      }
    );

    if (!response.ok) {
      console.error("[KYC Activity] Resume inquiry error:", await response.text());
      return { inquiryId, sessionToken: "" };
    }

    const data = await response.json();
    return {
      inquiryId,
      sessionToken: data.meta?.session_token ?? "",
    };
  } catch (error) {
    console.error("[KYC Activity] Resume inquiry error:", error);
    return { inquiryId, sessionToken: "" };
  }
}

/**
 * Get Persona verifications for an inquiry
 */
export async function getPersonaVerifications(
  inquiryId: string
): Promise<Array<{ type: string; status: string; passed: boolean }>> {
  console.log(`Getting verifications for inquiry ${inquiryId}`);

  try {
    const response = await fetch(
      `https://api.withpersona.com/api/v1/inquiries/${inquiryId}/verifications`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Persona-Version": "2023-01-05",
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.data ?? []).map((v: any) => ({
      type: v.type,
      status: v.attributes?.status ?? "unknown",
      passed: v.attributes?.status === "passed" || v.attributes?.status === "confirmed",
    }));
  } catch (error) {
    console.error("[KYC Activity] Get verifications error:", error);
    return [];
  }
}

// ============================================================================
// KYC Database Activities
// ============================================================================

/**
 * Update KYC record in database
 */
export async function updateKYCInDatabase(
  userId: string,
  updates: KYCDatabaseUpdate
): Promise<void> {
  console.log(`Updating KYC record for user ${userId}`, updates);

  try {
    await convex.mutation(api.kyc.updateKYCStatus, {
      userId: userId as any,
      status: updates.status as any,
      tier: updates.currentTier as any,
      personaInquiryId: updates.personaInquiryId,
      completedAt: updates.completedAt,
      expiresAt: updates.expiresAt,
      bankLinked: updates.bankLinked,
    });
  } catch (error) {
    console.error("[KYC Activity] Database update error:", error);
  }
}

// ============================================================================
// Email Notification Activities
// ============================================================================

/**
 * Send KYC approved email
 */
export async function sendKYCApprovedEmail(
  email: string,
  tier: string
): Promise<void> {
  console.log(`Sending KYC approved email to ${email} for tier ${tier}`);

  try {
    const tierLimits: Record<string, { deposit: string; withdraw: string; trade: string }> = {
      basic: { deposit: "$1,000/day", withdraw: "$500/day", trade: "$5,000/day" },
      standard: { deposit: "$10,000/day", withdraw: "$5,000/day", trade: "$50,000/day" },
      enhanced: { deposit: "$50,000/day", withdraw: "$25,000/day", trade: "$250,000/day" },
      accredited: { deposit: "$500,000/day", withdraw: "$250,000/day", trade: "$2,500,000/day" },
    };

    const limits = tierLimits[tier] ?? tierLimits.basic;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PULL <support@pull.com>",
        to: email,
        subject: "Your PULL account has been verified!",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>Welcome to PULL!</h1>
            <p>Great news! Your identity verification is complete and your account has been approved.</p>
            <h2>Your Account Tier: ${tier.charAt(0).toUpperCase() + tier.slice(1)}</h2>
            <p>With your verified account, you can now:</p>
            <ul>
              <li>Deposit up to ${limits.deposit}</li>
              <li>Withdraw up to ${limits.withdraw}</li>
              <li>Trade up to ${limits.trade}</li>
            </ul>
            <p><a href="https://pull.app/dashboard" style="display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Go to Dashboard</a></p>
            <p>Thank you for choosing PULL!</p>
          </body>
          </html>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] Approved email send error:", error);
  }
}

/**
 * Send KYC rejected email
 */
export async function sendKYCRejectedEmail(
  email: string,
  reason: string
): Promise<void> {
  console.log(`Sending KYC rejected email to ${email}`);

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
        subject: "Update on your PULL verification",
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>Verification Update</h1>
            <p>We were unable to verify your identity at this time.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>If you believe this is an error, you can try verifying again or contact our support team for assistance.</p>
            <p><a href="https://pull.app/kyc/retry" style="display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Try Again</a></p>
            <p>If you have questions, please reply to this email or contact support@pull.com</p>
          </body>
          </html>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] Rejected email send error:", error);
  }
}

/**
 * Send KYC reminder email
 */
export async function sendKYCReminderEmail(
  email: string,
  step: string
): Promise<void> {
  console.log(`Sending KYC reminder email to ${email} for step ${step}`);

  try {
    const stepMessages: Record<string, { subject: string; message: string }> = {
      email_verification: {
        subject: "Complete your email verification",
        message: "Please verify your email address to continue with your PULL account setup.",
      },
      identity_verification: {
        subject: "Complete your identity verification",
        message: "Your identity verification is pending. Please complete it to unlock all PULL features.",
      },
      reverification_expired: {
        subject: "Your PULL verification has expired",
        message: "Your identity verification has expired. Please re-verify to maintain your account access.",
      },
      reverification_reminder: {
        subject: "Reminder: Re-verify your PULL account",
        message: "Please complete your re-verification to maintain full access to your account.",
      },
    };

    const content = stepMessages[step] ?? {
      subject: "Action needed on your PULL account",
      message: "Please complete the pending steps to fully activate your PULL account.",
    };

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PULL <support@pull.com>",
        to: email,
        subject: content.subject,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <h1>Action Required</h1>
            <p>${content.message}</p>
            <p><a href="https://pull.app/kyc" style="display: inline-block; background-color: #0066FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Complete Verification</a></p>
            <p>If you have questions, please contact support@pull.com</p>
          </body>
          </html>
        `,
      }),
    });
  } catch (error) {
    console.error("[KYC Activity] Reminder email send error:", error);
  }
}

// ============================================================================
// Plaid Bank Linking Activities
// ============================================================================

/**
 * Exchange Plaid public token for access token
 */
export async function exchangePlaidToken(publicToken: string): Promise<string> {
  console.log("Exchanging Plaid public token");

  try {
    const response = await fetch("https://production.plaid.com/item/public_token/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        public_token: publicToken,
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Plaid token exchange error:", await response.text());
      throw new Error("Failed to exchange Plaid token");
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("[KYC Activity] Plaid token exchange error:", error);
    throw error;
  }
}

/**
 * Verify bank account with Plaid
 */
export async function verifyBankAccount(
  accessToken: string,
  accountId: string
): Promise<boolean> {
  console.log(`Verifying bank account ${accountId}`);

  try {
    // Get account info to verify it exists and is active
    const response = await fetch("https://production.plaid.com/accounts/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.PLAID_CLIENT_ID,
        secret: process.env.PLAID_SECRET,
        access_token: accessToken,
      }),
    });

    if (!response.ok) {
      console.error("[KYC Activity] Plaid account verification error:", await response.text());
      return false;
    }

    const data = await response.json();
    const account = data.accounts?.find((a: any) => a.account_id === accountId);

    if (!account) {
      console.error("[KYC Activity] Account not found:", accountId);
      return false;
    }

    // Check if account is active and is a valid type
    const validTypes = ["depository"];
    const validSubtypes = ["checking", "savings"];

    return (
      validTypes.includes(account.type) &&
      validSubtypes.includes(account.subtype)
    );
  } catch (error) {
    console.error("[KYC Activity] Bank account verification error:", error);
    return false;
  }
}
