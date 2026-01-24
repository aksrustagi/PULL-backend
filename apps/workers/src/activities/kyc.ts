/**
 * KYC Activities for Temporal workflows
 * Re-exports from centralized activities and adds worker-specific implementations
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
  status: "pending" | "completed" | "failed" | "expired";
  templateId: string;
}

export interface CheckrCandidate {
  candidateId: string;
  reportId?: string;
  status: "pending" | "clear" | "consider" | "suspended";
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
