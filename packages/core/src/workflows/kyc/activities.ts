/**
 * KYC Workflow Activities
 *
 * Activities are the building blocks of Temporal workflows.
 * They perform the actual work: API calls, database operations, etc.
 * Activities automatically retry on failure and can be interrupted.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

// =============================================================================
// SERVICE CLIENTS
// =============================================================================

// Lazy initialization for service clients
let convexClient: ConvexHttpClient | null = null;
let personaClient: PersonaClient | null = null;
let checkrClient: CheckrClient | null = null;
let chainalysisClient: ChainalysisClient | null = null;
let resendClient: ResendClient | null = null;

function getConvex(): ConvexHttpClient {
  if (!convexClient) {
    convexClient = new ConvexHttpClient(process.env.CONVEX_URL!);
  }
  return convexClient;
}

// =============================================================================
// EMAIL VERIFICATION ACTIVITIES
// =============================================================================

export interface SendVerificationEmailInput {
  email: string;
  ipAddress?: string;
}

export async function sendVerificationEmail(
  input: SendVerificationEmailInput
): Promise<{ sent: boolean }> {
  const code = generateSecureCode();
  const convex = getConvex();

  // Store verification code in Convex
  await convex.mutation(api.functions.auth.storeVerificationCode, {
    email: input.email,
    code,
    type: "email_verification",
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });

  // Send email via Resend
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <noreply@pull.app>",
      to: input.email,
      subject: "Verify your PULL account",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Welcome to PULL</h1>
          <p>Your verification code is:</p>
          <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code expires in 24 hours.</p>
          <p style="color: #666; font-size: 12px;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send verification email: ${response.statusText}`);
  }

  return { sent: true };
}

export interface ValidateVerificationCodeInput {
  email: string;
  code: string;
}

export async function validateVerificationCode(
  input: ValidateVerificationCodeInput
): Promise<boolean> {
  const convex = getConvex();

  const result = await convex.mutation(api.functions.auth.validateVerificationCode, {
    email: input.email,
    code: input.code,
  });

  return result.valid;
}

// =============================================================================
// ACCOUNT CREATION ACTIVITIES
// =============================================================================

export interface CreateAccountRecordInput {
  email: string;
  referralCode?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateAccountRecordOutput {
  accountId: string;
  userId: string;
}

export async function createAccountRecord(
  input: CreateAccountRecordInput
): Promise<CreateAccountRecordOutput> {
  const convex = getConvex();

  // Generate unique account ID
  const accountId = `acc_${generateId()}`;

  // Create user in Convex
  const userId = await convex.mutation(api.functions.users.create, {
    accountId,
    email: input.email,
    referralCode: input.referralCode,
  });

  return { accountId, userId };
}

// =============================================================================
// PERSONA (IDV) ACTIVITIES
// =============================================================================

export interface InitiatePersonaInquiryInput {
  accountId: string;
  email: string;
}

export interface InitiatePersonaInquiryOutput {
  inquiryId: string;
  sessionToken: string;
  inquiryUrl: string;
}

export async function initiatePersonaInquiry(
  input: InitiatePersonaInquiryInput
): Promise<InitiatePersonaInquiryOutput> {
  const response = await fetch("https://withpersona.com/api/v1/inquiries", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
      "Content-Type": "application/json",
      "Persona-Version": "2023-01-05",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          "inquiry-template-id": process.env.PERSONA_TEMPLATE_ID,
          "reference-id": input.accountId,
          fields: {
            "email-address": input.email,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Persona API error: ${error}`);
  }

  const data = await response.json();
  const inquiry = data.data;

  return {
    inquiryId: inquiry.id,
    sessionToken: inquiry.attributes["session-token"],
    inquiryUrl: `https://withpersona.com/verify?inquiry-id=${inquiry.id}`,
  };
}

export interface CheckPersonaInquiryStatusInput {
  inquiryId: string;
}

export interface CheckPersonaInquiryStatusOutput {
  status: "pending" | "completed" | "failed" | "needs_review";
  tier?: string;
}

export async function checkPersonaInquiryStatus(
  input: CheckPersonaInquiryStatusInput
): Promise<CheckPersonaInquiryStatusOutput> {
  const response = await fetch(
    `https://withpersona.com/api/v1/inquiries/${input.inquiryId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
        "Persona-Version": "2023-01-05",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Persona API error: ${response.statusText}`);
  }

  const data = await response.json();
  const status = data.data.attributes.status;

  const statusMap: Record<string, CheckPersonaInquiryStatusOutput["status"]> = {
    created: "pending",
    pending: "pending",
    completed: "completed",
    failed: "failed",
    needs_review: "needs_review",
    approved: "completed",
    declined: "failed",
  };

  return {
    status: statusMap[status] || "pending",
  };
}

// =============================================================================
// CHECKR (BACKGROUND CHECK) ACTIVITIES
// =============================================================================

export interface RunCheckrBackgroundCheckInput {
  accountId: string;
}

export interface RunCheckrBackgroundCheckOutput {
  reportId: string;
  status: "pending" | "complete" | "consider" | "suspended";
}

export async function runCheckrBackgroundCheck(
  input: RunCheckrBackgroundCheckInput
): Promise<RunCheckrBackgroundCheckOutput> {
  const convex = getConvex();

  // Get user data from Convex
  const user = await convex.query(api.functions.users.getByAccountId, {
    accountId: input.accountId,
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Create candidate in Checkr
  const candidateResponse = await fetch(
    "https://api.checkr.com/v1/candidates",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: user.name?.split(" ")[0] || "Unknown",
        last_name: user.name?.split(" ").slice(1).join(" ") || "User",
        email: user.email,
        // SSN and DOB would come from KYC data in production
      }),
    }
  );

  if (!candidateResponse.ok) {
    throw new Error(`Checkr candidate creation failed: ${candidateResponse.statusText}`);
  }

  const candidate = await candidateResponse.json();

  // Create report
  const reportResponse = await fetch("https://api.checkr.com/v1/reports", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      candidate_id: candidate.id,
      package: "tasker_standard", // Or appropriate package for your use case
    }),
  });

  if (!reportResponse.ok) {
    throw new Error(`Checkr report creation failed: ${reportResponse.statusText}`);
  }

  const report = await reportResponse.json();

  // Store in Convex
  await convex.mutation(api.functions.kyc.storeBackgroundCheck, {
    userId: user._id,
    checkrCandidateId: candidate.id,
    checkrReportId: report.id,
    status: "pending",
  });

  return {
    reportId: report.id,
    status: report.status,
  };
}

export interface PollCheckrStatusInput {
  reportId: string;
}

export async function pollCheckrStatus(
  input: PollCheckrStatusInput
): Promise<RunCheckrBackgroundCheckOutput> {
  const response = await fetch(
    `https://api.checkr.com/v1/reports/${input.reportId}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Checkr API error: ${response.statusText}`);
  }

  const report = await response.json();

  return {
    reportId: report.id,
    status: report.status,
  };
}

// =============================================================================
// CHAINALYSIS (WALLET SCREENING) ACTIVITIES
// =============================================================================

export interface ScreenWalletChainalysisInput {
  accountId: string;
  walletAddress: string;
}

export interface ScreenWalletChainalysisOutput {
  risk: "low" | "medium" | "high" | "severe";
  flags: string[];
  riskScore: number;
}

export async function screenWalletChainalysis(
  input: ScreenWalletChainalysisInput
): Promise<ScreenWalletChainalysisOutput> {
  // Chainalysis KYT API
  const response = await fetch(
    "https://api.chainalysis.com/api/kyt/v2/users",
    {
      method: "POST",
      headers: {
        Token: process.env.CHAINALYSIS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: input.accountId,
      }),
    }
  );

  if (!response.ok) {
    // If Chainalysis is unavailable, default to medium risk
    console.error(`Chainalysis API error: ${response.statusText}`);
    return { risk: "medium", flags: ["service_unavailable"], riskScore: 50 };
  }

  // Register the transfer/address
  const screenResponse = await fetch(
    `https://api.chainalysis.com/api/kyt/v2/users/${input.accountId}/withdrawaladdresses`,
    {
      method: "POST",
      headers: {
        Token: process.env.CHAINALYSIS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        network: "Polygon",
        asset: "MATIC",
        address: input.walletAddress,
      }),
    }
  );

  if (!screenResponse.ok) {
    return { risk: "medium", flags: ["screening_failed"], riskScore: 50 };
  }

  const screening = await screenResponse.json();

  // Map risk score to levels
  const riskScore = screening.risk?.riskScore || 0;
  let risk: ScreenWalletChainalysisOutput["risk"] = "low";

  if (riskScore >= 80) {
    risk = "severe";
  } else if (riskScore >= 60) {
    risk = "high";
  } else if (riskScore >= 40) {
    risk = "medium";
  }

  const flags = (screening.risk?.alerts || []).map(
    (alert: { category: string }) => alert.category
  );

  // Store screening result
  const convex = getConvex();
  const user = await convex.query(api.functions.users.getByAccountId, {
    accountId: input.accountId,
  });

  if (user) {
    await convex.mutation(api.functions.kyc.storeWalletScreening, {
      userId: user._id,
      walletAddress: input.walletAddress,
      chain: "polygon",
      riskScore,
      riskLevel: risk,
      alerts: flags.map((f: string) => ({
        category: f,
        severity: risk,
        description: f,
      })),
    });
  }

  return { risk, flags, riskScore };
}

// =============================================================================
// AGREEMENT ACTIVITIES
// =============================================================================

export interface ValidateAgreementsInput {
  accountId: string;
  agreements: string[];
}

export async function validateAgreements(
  input: ValidateAgreementsInput
): Promise<boolean> {
  const requiredAgreements = [
    "tos",
    "privacy",
    "trading_disclosure",
    "risk_disclosure",
  ];

  const missingAgreements = requiredAgreements.filter(
    (a) => !input.agreements.includes(a)
  );

  if (missingAgreements.length > 0) {
    throw new Error(
      `Missing required agreements: ${missingAgreements.join(", ")}`
    );
  }

  // Store signed agreements in Convex
  const convex = getConvex();
  await convex.mutation(api.functions.users.recordAgreements, {
    accountId: input.accountId,
    agreements: input.agreements.map((a) => ({
      type: a,
      signedAt: Date.now(),
      version: "1.0",
    })),
  });

  return true;
}

// =============================================================================
// ACCOUNT ACTIVATION ACTIVITIES
// =============================================================================

export interface ActivateAccountInput {
  accountId: string;
  kycTier: string;
  hasComplianceBlockers: boolean;
}

export async function activateAccount(
  input: ActivateAccountInput
): Promise<boolean> {
  const convex = getConvex();

  await convex.mutation(api.functions.users.updateKycStatus, {
    accountId: input.accountId,
    kycTier: input.kycTier as "none" | "basic" | "enhanced" | "accredited",
    kycStatus: input.hasComplianceBlockers ? "review" : "approved",
  });

  return true;
}

export interface SendWelcomeEmailInput {
  email: string;
  accountId: string;
}

export async function sendWelcomeEmail(
  input: SendWelcomeEmailInput
): Promise<boolean> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <hello@pull.app>",
      to: input.email,
      subject: "Welcome to PULL! 🎉",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Welcome to PULL!</h1>
          <p>Your account is now active and ready to use.</p>
          <p>Here's what you can do:</p>
          <ul>
            <li>Trade prediction markets on sports, politics, and more</li>
            <li>Invest in fractional Pokemon cards and collectibles</li>
            <li>Earn points and rewards with every action</li>
            <li>Connect with other traders in group chats</li>
          </ul>
          <a href="https://pull.app/dashboard" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
            Get Started
          </a>
        </div>
      `,
    }),
  });

  return true;
}

export interface CreditReferralBonusInput {
  accountId: string;
  referralCode: string;
}

export async function creditReferralBonus(
  input: CreditReferralBonusInput
): Promise<boolean> {
  const convex = getConvex();

  // Find referrer
  const referrer = await convex.query(api.functions.users.getByReferralCode, {
    referralCode: input.referralCode,
  });

  if (!referrer) {
    return false;
  }

  // Credit points to both referrer and referee
  const referrerBonus = 500;
  const refereeBonus = 250;

  await convex.mutation(api.functions.rewards.creditReferralBonus, {
    referrerId: referrer._id,
    referrerBonus,
    refereeAccountId: input.accountId,
    refereeBonus,
  });

  return true;
}

// =============================================================================
// EVENT RECORDING ACTIVITIES
// =============================================================================

export interface RecordOnboardingEventInput {
  email: string;
  event: string;
  step: string;
  metadata?: Record<string, unknown>;
}

export async function recordOnboardingEvent(
  input: RecordOnboardingEventInput
): Promise<void> {
  const convex = getConvex();

  await convex.mutation(api.functions.analytics.recordEvent, {
    eventType: `onboarding.${input.event}`,
    properties: {
      email: input.email,
      step: input.step,
      ...input.metadata,
    },
    timestamp: Date.now(),
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateSecureCode(): string {
  // Generate 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// TYPE STUBS FOR EXTERNAL CLIENTS
// =============================================================================

interface PersonaClient {}
interface CheckrClient {}
interface ChainalysisClient {}
interface ResendClient {}
