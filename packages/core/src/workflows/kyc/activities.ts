/**
 * KYC Activities
 * All activities for KYC-related workflows
 */

import { Context } from "@temporalio/activity";
import { SumsubClient, type VerificationLevel } from '../../services/sumsub';
import { PlaidClient, type PlaidProduct } from '../../services/plaid';
import { CheckrClient, type CheckrPackage } from '../../services/checkr';
import { ParallelMarketsClient, type AccreditationType } from '../../services/parallel-markets';
import { SanctionsClient } from '../../services/sanctions';
import type {
  KYCUserData,
  SumsubResult,
  CheckrResult,
  AccreditationResult,
  SanctionsResult,
  PlaidResult,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface PersonaInquiry {
  inquiryId: string;
  status: "pending" | "completed" | "failed" | "expired" | "needs_review" | "declined";
  templateId: string;
  firstName?: string;
  lastName?: string;
  reason?: string;
}

export interface CheckrCandidate {
  candidateId: string;
  reportId: string;
  status: "pending" | "clear" | "consider" | "suspended";
}

export interface AccountRecord {
  userId: string;
  email: string;
  createdAt: string;
}

export interface UserKYCStatus {
  userId: string;
  email: string;
  tier: "basic" | "enhanced" | "accredited";
  status: "pending" | "approved" | "rejected" | "needs_review";
  lastVerifiedAt: string;
}

export interface DocumentExpirationResult {
  anyExpired: boolean;
  expiredDocuments: string[];
  expiringDocuments: string[];
  expiringWithinDays: (days: number) => boolean;
}

export interface ScreeningResult {
  matched: boolean;
  matchDetails?: string;
  score?: number;
}

export interface VerificationResult {
  verificationId: string;
  status: "approved" | "rejected" | "needs_additional" | "pending";
  reason?: string;
  requiredDocuments?: string[];
}

// ============================================================================
// Email Activities
// ============================================================================

/**
 * Send verification email to user
 */
export async function sendVerificationEmail(
  email: string,
  verificationLink: string
): Promise<void> {
  console.log(`[KYC Activity] Sending verification email to ${email}`);

  // TODO: Integrate with Resend API
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
        <h1>Welcome to PULL!</h1>
        <p>Click the link below to verify your email address:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send verification email: ${response.statusText}`);
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
    failed: "PULL Account Creation Failed",
  };

  // TODO: Integrate with Resend API
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
      html: `<p>${message ?? `Your account status has been updated to: ${status}`}</p>`,
    }),
  });
}

/**
 * Send Re-KYC reminder
 */
export async function sendReKYCReminder(
  email: string,
  type: "document_expiring" | "reverification_required" | "periodic",
  message: string
): Promise<void> {
  console.log(`[KYC Activity] Sending Re-KYC reminder to ${email}: ${type}`);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <support@pull.com>",
      to: email,
      subject: "Action Required: PULL Account Verification",
      html: `<p>${message}</p>`,
    }),
  });
}

// ============================================================================
// Account Activities
// ============================================================================

/**
 * Create initial account record
 */
export async function createAccountRecord(input: {
  email: string;
  verificationToken: string;
  referralCode?: string;
  walletAddress?: string;
}): Promise<AccountRecord> {
  console.log(`[KYC Activity] Creating account record for ${input.email}`);

  // TODO: Call Convex mutation
  const userId = `user_${crypto.randomUUID()}`;

  return {
    userId,
    email: input.email,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create finalized Convex user
 */
export async function createConvexUser(input: {
  tempUserId: string;
  email: string;
  kycStatus: string;
  kycTier: string;
  walletAddress?: string;
  agreementIds: string[];
  personaInquiryId: string;
}): Promise<void> {
  console.log(`[KYC Activity] Finalizing Convex user ${input.tempUserId}`);

  // TODO: Call Convex mutation to finalize user
}

/**
 * Get user KYC status
 */
export async function getUserKYCStatus(userId: string): Promise<UserKYCStatus> {
  console.log(`[KYC Activity] Getting KYC status for ${userId}`);

  // TODO: Call Convex query
  return {
    userId,
    email: "user@example.com",
    tier: "basic",
    status: "approved",
    lastVerifiedAt: new Date().toISOString(),
  };
}

/**
 * Get user's last verification date
 */
export async function getUserLastVerificationDate(userId: string): Promise<string> {
  console.log(`[KYC Activity] Getting last verification date for ${userId}`);

  // TODO: Call Convex query
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago
}

/**
 * Update KYC tier
 */
export async function updateKYCTier(
  userId: string,
  tier: "basic" | "enhanced" | "accredited"
): Promise<void> {
  console.log(`[KYC Activity] Updating KYC tier for ${userId} to ${tier}`);

  // TODO: Call Convex mutation
}

/**
 * Suspend user account
 */
export async function suspendUserAccount(userId: string, reason: string): Promise<void> {
  console.log(`[KYC Activity] Suspending account ${userId}: ${reason}`);

  // TODO: Call Convex mutation
}

// ============================================================================
// Persona Activities
// ============================================================================

/**
 * Initiate Persona identity verification
 */
export async function initiatePersonaInquiry(
  userId: string,
  email: string
): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Initiating Persona inquiry for ${userId}`);

  // TODO: Call Persona API
  const response = await fetch("https://api.withpersona.com/api/v1/inquiries", {
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
          "reference-id": userId,
          "fields": {
            "email-address": email,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Persona inquiry: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    inquiryId: data.data?.id ?? `inq_${crypto.randomUUID()}`,
    status: "pending",
    templateId: process.env.PERSONA_TEMPLATE_ID ?? "tmpl_default",
  };
}

/**
 * Wait for Persona verification completion (with heartbeat)
 */
export async function waitForPersonaCompletion(inquiryId: string): Promise<PersonaInquiry> {
  console.log(`[KYC Activity] Waiting for Persona completion: ${inquiryId}`);

  const maxAttempts = 60; // 5 minutes with 5 second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Heartbeat to keep activity alive
    Context.current().heartbeat(`Checking Persona status: attempt ${attempts + 1}`);

    // TODO: Poll Persona API
    const response = await fetch(
      `https://api.withpersona.com/api/v1/inquiries/${inquiryId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PERSONA_API_KEY}`,
          "Persona-Version": "2023-01-05",
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const status = data.data?.attributes?.status;

      if (status === "completed" || status === "approved") {
        return {
          inquiryId,
          status: "completed",
          templateId: data.data?.attributes?.["inquiry-template-id"],
          firstName: data.data?.attributes?.["name-first"],
          lastName: data.data?.attributes?.["name-last"],
        };
      }

      if (status === "failed" || status === "declined") {
        return {
          inquiryId,
          status: status as "failed" | "declined",
          templateId: data.data?.attributes?.["inquiry-template-id"],
          reason: data.data?.attributes?.["decline-reason"],
        };
      }

      if (status === "needs_review") {
        return {
          inquiryId,
          status: "needs_review",
          templateId: data.data?.attributes?.["inquiry-template-id"],
        };
      }
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
// Checkr Activities
// ============================================================================

/**
 * Run Checkr background check
 */
export async function runCheckrBackgroundCheck(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Running Checkr background check for ${userId}`);

  // TODO: Call Checkr API
  // Create candidate
  const candidateResponse = await fetch("https://api.checkr.com/v1/candidates", {
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

  const candidateId = `cand_${crypto.randomUUID()}`;

  // Create invitation/report
  const reportResponse = await fetch("https://api.checkr.com/v1/invitations", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(process.env.CHECKR_API_KEY + ":").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      candidate_id: candidateId,
      package: process.env.CHECKR_PACKAGE ?? "tasker_standard",
    }),
  });

  return {
    candidateId,
    reportId: `rep_${crypto.randomUUID()}`,
    status: "pending",
  };
}

/**
 * Wait for Checkr completion (with heartbeat)
 */
export async function waitForCheckrCompletion(reportId: string): Promise<CheckrCandidate> {
  console.log(`[KYC Activity] Waiting for Checkr completion: ${reportId}`);

  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    Context.current().heartbeat(`Checking Checkr status: attempt ${attempts + 1}`);

    // TODO: Poll Checkr API
    // Simulated response
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // For now, return completed after first attempt (replace with real API call)
    return {
      candidateId: "cand_xxx",
      reportId,
      status: "clear",
    };
  }

  return {
    candidateId: "cand_xxx",
    reportId,
    status: "pending",
  };
}

// ============================================================================
// Chainalysis Activities
// ============================================================================

/**
 * Screen wallet address with Chainalysis
 */
export async function screenWalletChainalysis(
  walletAddress: string
): Promise<{ risk: "low" | "medium" | "high" | "severe"; score: number }> {
  console.log(`[KYC Activity] Screening wallet ${walletAddress}`);

  // TODO: Call Chainalysis API
  const response = await fetch(
    `https://api.chainalysis.com/api/risk/v2/entities/${walletAddress}`,
    {
      headers: {
        Token: process.env.CHAINALYSIS_API_KEY ?? "",
      },
    }
  );

  if (!response.ok) {
    // Default to low risk if API fails (should be handled better in production)
    return { risk: "low", score: 0.1 };
  }

  const data = await response.json();

  // Map Chainalysis risk score to our risk levels
  const riskScore = data.risk ?? 0;
  let risk: "low" | "medium" | "high" | "severe" = "low";

  if (riskScore >= 0.8) risk = "severe";
  else if (riskScore >= 0.6) risk = "high";
  else if (riskScore >= 0.4) risk = "medium";

  return { risk, score: riskScore };
}

// ============================================================================
// Referral Activities
// ============================================================================

/**
 * Verify referral code
 */
export async function verifyReferralCode(referralCode: string): Promise<boolean> {
  console.log(`[KYC Activity] Verifying referral code: ${referralCode}`);

  // TODO: Call Convex query to verify referral code exists and is valid
  return true;
}

/**
 * Apply referral bonus
 */
export async function applyReferralBonus(userId: string, referralCode: string): Promise<void> {
  console.log(`[KYC Activity] Applying referral bonus for ${userId} with code ${referralCode}`);

  // TODO: Call Convex mutation to credit both referrer and referee
}

// ============================================================================
// NFT Activities
// ============================================================================

/**
 * Mint welcome NFT for referred users
 */
export async function mintWelcomeNFT(
  userId: string,
  walletAddress?: string
): Promise<{ tokenId: string; txHash: string }> {
  console.log(`[KYC Activity] Minting welcome NFT for ${userId}`);

  if (!walletAddress) {
    throw new Error("Wallet address required for NFT minting");
  }

  // TODO: Call smart contract to mint NFT
  return {
    tokenId: `token_${crypto.randomUUID()}`,
    txHash: `0x${crypto.randomUUID().replace(/-/g, "")}`,
  };
}

// ============================================================================
// Document Verification Activities
// ============================================================================

/**
 * Check document expiration status
 */
export async function checkDocumentExpiration(userId: string): Promise<DocumentExpirationResult> {
  console.log(`[KYC Activity] Checking document expiration for ${userId}`);

  // TODO: Call Convex query to get user documents
  return {
    anyExpired: false,
    expiredDocuments: [],
    expiringDocuments: [],
    expiringWithinDays: () => false,
  };
}

/**
 * Initiate enhanced verification
 */
export async function initiateEnhancedVerification(
  userId: string,
  documentIds: string[]
): Promise<VerificationResult> {
  console.log(`[KYC Activity] Initiating enhanced verification for ${userId}`);

  return {
    verificationId: `ver_${crypto.randomUUID()}`,
    status: "pending",
  };
}

/**
 * Initiate accredited verification
 */
export async function initiateAccreditedVerification(
  userId: string,
  documentIds: string[]
): Promise<{
  verificationId: string;
  incomeDocumentIds: string[];
  netWorthDocumentIds: string[];
  letterDocumentId?: string;
}> {
  console.log(`[KYC Activity] Initiating accredited verification for ${userId}`);

  return {
    verificationId: `ver_${crypto.randomUUID()}`,
    incomeDocumentIds: documentIds.filter((d) => d.includes("income")),
    netWorthDocumentIds: documentIds.filter((d) => d.includes("networth")),
    letterDocumentId: documentIds.find((d) => d.includes("letter")),
  };
}

/**
 * Wait for document verification
 */
export async function waitForDocumentVerification(
  verificationId: string,
  additionalDocuments?: string[]
): Promise<VerificationResult> {
  console.log(`[KYC Activity] Waiting for document verification: ${verificationId}`);

  Context.current().heartbeat("Verifying documents...");

  // Simulated verification
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    verificationId,
    status: "approved",
  };
}

/**
 * Verify income documents
 */
export async function verifyIncomeDocuments(
  userId: string,
  documentIds: string[]
): Promise<{ verified: boolean; alternatePathAvailable: boolean }> {
  console.log(`[KYC Activity] Verifying income documents for ${userId}`);

  return {
    verified: true,
    alternatePathAvailable: true,
  };
}

/**
 * Verify net worth documents
 */
export async function verifyNetWorthDocuments(
  userId: string,
  documentIds: string[]
): Promise<{ verified: boolean }> {
  console.log(`[KYC Activity] Verifying net worth documents for ${userId}`);

  return { verified: true };
}

/**
 * Verify accredited investor letter
 */
export async function verifyAccreditedInvestorLetter(
  userId: string,
  letterId?: string
): Promise<{ verified: boolean }> {
  console.log(`[KYC Activity] Verifying accredited investor letter for ${userId}`);

  return { verified: letterId !== undefined };
}

/**
 * Request additional documents
 */
export async function requestAdditionalDocuments(
  userId: string,
  requiredDocuments: string[]
): Promise<void> {
  console.log(`[KYC Activity] Requesting additional documents for ${userId}: ${requiredDocuments.join(", ")}`);

  // TODO: Send notification and update user record
}

/**
 * Perform manual review
 */
export async function performManualReview(
  userId: string,
  context: {
    targetTier: string;
    documents: string[];
    additionalDocuments: string[];
  }
): Promise<void> {
  console.log(`[KYC Activity] Triggering manual review for ${userId}`);

  // TODO: Create review task in admin system
}

// ============================================================================
// Screening Activities
// ============================================================================

/**
 * Run sanctions screening
 */
export async function runSanctionsScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running sanctions screening for ${userId}`);

  // TODO: Call sanctions screening API
  return { matched: false };
}

/**
 * Run watchlist screening
 */
export async function runWatchlistScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running watchlist screening for ${userId}`);

  // TODO: Call watchlist screening API
  return { matched: false };
}

/**
 * Run PEP (Politically Exposed Person) screening
 */
export async function runPEPScreening(
  userId: string,
  kycData: UserKYCStatus
): Promise<ScreeningResult> {
  console.log(`[KYC Activity] Running PEP screening for ${userId}`);

  // TODO: Call PEP screening API
  return { matched: false };
}

/**
 * Initiate re-verification
 */
export async function initiateReVerification(
  userId: string,
  context: {
    reason: string;
    requiredDocuments: string[];
  }
): Promise<{ verificationId: string }> {
  console.log(`[KYC Activity] Initiating re-verification for ${userId}`);

  return { verificationId: `rever_${crypto.randomUUID()}` };
}

// ============================================================================
// Audit Activities
// ============================================================================

/**
 * Log audit event
 */
export async function logAuditEvent(event: {
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  console.log(`[KYC Activity] Audit log: ${event.action} for ${event.userId}`);

  // TODO: Call Convex mutation to log audit event
}

// ============================================================================
// Service Client Factories
// ============================================================================

function getSumsubClient(): SumsubClient {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  const webhookSecret = process.env.SUMSUB_WEBHOOK_SECRET;

  if (!appToken || !secretKey) {
    throw new Error('Sumsub credentials not configured');
  }

  return new SumsubClient({
    appToken,
    secretKey,
    webhookSecret,
  });
}

function getPlaidClient(): PlaidClient {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? 'sandbox') as 'sandbox' | 'development' | 'production';

  if (!clientId || !secret) {
    throw new Error('Plaid credentials not configured');
  }

  return new PlaidClient({
    clientId,
    secret,
    env,
  });
}

function getCheckrClient(): CheckrClient {
  const apiKey = process.env.CHECKR_API_KEY;
  const webhookSecret = process.env.CHECKR_WEBHOOK_SECRET;

  if (!apiKey) {
    throw new Error('Checkr credentials not configured');
  }

  return new CheckrClient({
    apiKey,
    webhookSecret,
  });
}

function getParallelMarketsClient(): ParallelMarketsClient {
  const apiKey = process.env.PARALLEL_API_KEY;
  const webhookSecret = process.env.PARALLEL_WEBHOOK_SECRET;

  if (!apiKey) {
    throw new Error('Parallel Markets credentials not configured');
  }

  return new ParallelMarketsClient({
    apiKey,
    webhookSecret,
  });
}

function getSanctionsClient(): SanctionsClient {
  const apiKey = process.env.SANCTIONS_API_KEY;

  if (!apiKey) {
    throw new Error('Sanctions.io credentials not configured');
  }

  return new SanctionsClient({
    apiKey,
  });
}

// ============================================================================
// Sumsub Activities
// ============================================================================

/**
 * Create a Sumsub applicant
 */
export async function createSumsubApplicant(
  userId: string,
  email: string,
  tier: 'basic' | 'enhanced' | 'accredited',
  userData?: KYCUserData
): Promise<{ applicantId: string }> {
  console.log(`[KYC Activity] Creating Sumsub applicant for user: ${userId}`);

  const client = getSumsubClient();
  const levelName = SumsubClient.getTierLevelName(tier);

  const applicant = await client.createApplicant({
    externalUserId: userId,
    levelName,
    email,
    info: userData
      ? {
          firstName: userData.firstName,
          lastName: userData.lastName,
          middleName: userData.middleName,
          dob: userData.dob,
          phone: userData.phone,
          country: userData.nationality,
          addresses: userData.address
            ? [
                {
                  country: userData.address.country,
                  postCode: userData.address.postalCode,
                  town: userData.address.city,
                  street: userData.address.street,
                  subStreet: userData.address.street2,
                  state: userData.address.state,
                },
              ]
            : undefined,
        }
      : undefined,
  });

  console.log(`[KYC Activity] Created Sumsub applicant: ${applicant.id}`);
  return { applicantId: applicant.id };
}

/**
 * Generate Sumsub SDK access token for frontend
 */
export async function generateSumsubToken(
  applicantId: string,
  tier: 'basic' | 'enhanced' | 'accredited'
): Promise<{ accessToken: string; expiresAt: number }> {
  console.log(`[KYC Activity] Generating Sumsub token for applicant: ${applicantId}`);

  const client = getSumsubClient();
  const ttlInSecs = 3600; // 1 hour

  const response = await client.generateAccessTokenForApplicant(applicantId, ttlInSecs);

  return {
    accessToken: response.token,
    expiresAt: Date.now() + ttlInSecs * 1000,
  };
}

/**
 * Get Sumsub applicant status
 */
export async function getSumsubStatus(
  applicantId: string
): Promise<{ status: string; reviewStatus?: string; reviewAnswer?: string }> {
  console.log(`[KYC Activity] Getting Sumsub status for: ${applicantId}`);

  const client = getSumsubClient();
  const applicant = await client.getApplicant(applicantId);

  return {
    status: applicant.review?.reviewStatus ?? 'init',
    reviewStatus: applicant.review?.reviewStatus,
    reviewAnswer: applicant.review?.reviewResult?.reviewAnswer,
  };
}

/**
 * Reset Sumsub applicant for re-verification
 */
export async function resetSumsubApplicant(applicantId: string): Promise<void> {
  console.log(`[KYC Activity] Resetting Sumsub applicant: ${applicantId}`);

  const client = getSumsubClient();
  await client.resetApplicant(applicantId);
}

// ============================================================================
// Plaid Activities
// ============================================================================

/**
 * Create Plaid Link token
 */
export async function createPlaidLinkToken(
  userId: string,
  products: string[]
): Promise<{ linkToken: string; expiration: string }> {
  console.log(`[KYC Activity] Creating Plaid link token for user: ${userId}`);

  const client = getPlaidClient();
  const response = await client.createLinkToken({
    userId,
    products: products as PlaidProduct[],
  });

  return {
    linkToken: response.link_token,
    expiration: response.expiration,
  };
}

/**
 * Create Plaid Identity Verification session
 */
export async function createPlaidIDV(
  userId: string,
  templateId: string
): Promise<{ idvId: string; shareableUrl: string | null }> {
  console.log(`[KYC Activity] Creating Plaid IDV for user: ${userId}`);

  const client = getPlaidClient();
  const response = await client.createIdentityVerification({
    clientUserId: userId,
    templateId,
    isShareable: true,
  });

  return {
    idvId: response.id,
    shareableUrl: response.shareable_url,
  };
}

/**
 * Get Plaid Identity Verification status
 */
export async function getPlaidIDVStatus(
  idvId: string
): Promise<{ status: string; completedAt: string | null }> {
  console.log(`[KYC Activity] Getting Plaid IDV status: ${idvId}`);

  const client = getPlaidClient();
  const response = await client.getIdentityVerification(idvId);

  return {
    status: response.status,
    completedAt: response.completed_at,
  };
}

/**
 * Exchange Plaid public token for access token
 */
export async function exchangePlaidToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  console.log(`[KYC Activity] Exchanging Plaid public token`);

  const client = getPlaidClient();
  const response = await client.exchangePublicToken(publicToken);

  return {
    accessToken: response.accessToken,
    itemId: response.itemId,
  };
}

/**
 * Get Plaid auth data (account and routing numbers)
 */
export async function getPlaidAuth(
  accessToken: string
): Promise<{ accounts: Array<{ accountId: string; mask: string; name: string }> }> {
  console.log(`[KYC Activity] Getting Plaid auth data`);

  const client = getPlaidClient();
  const response = await client.getAuth(accessToken);

  return {
    accounts: response.accounts.map((account) => ({
      accountId: account.account_id,
      mask: account.mask ?? '',
      name: account.name,
    })),
  };
}

/**
 * Get Plaid identity data for matching
 */
export async function getPlaidIdentity(
  accessToken: string
): Promise<{ names: string[]; emails: string[]; phones: string[] }> {
  console.log(`[KYC Activity] Getting Plaid identity data`);

  const client = getPlaidClient();
  const response = await client.getIdentity(accessToken);

  const names: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];

  for (const account of response.accounts) {
    for (const owner of account.owners) {
      names.push(...owner.names);
      emails.push(...owner.emails.map((e) => e.data));
      phones.push(...owner.phone_numbers.map((p) => p.data));
    }
  }

  return {
    names: [...new Set(names)],
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
  };
}

// ============================================================================
// Checkr Activities (Enhanced)
// ============================================================================

/**
 * Create Checkr candidate and background check
 */
export async function createCheckrCandidateAndReport(
  userId: string,
  email: string,
  userData: KYCUserData,
  packageName: CheckrPackage = 'tasker_standard'
): Promise<{ candidateId: string; reportId: string }> {
  console.log(`[KYC Activity] Creating Checkr candidate and report for user: ${userId}`);

  const client = getCheckrClient();

  const candidate = await client.createCandidate({
    firstName: userData.firstName,
    lastName: userData.lastName,
    email,
    dob: userData.dob,
    ssn: userData.ssn,
    phone: userData.phone,
    zipcode: userData.address?.postalCode,
    customId: userId,
  });

  const report = await client.createReport({
    candidateId: candidate.id,
    package: packageName,
  });

  return {
    candidateId: candidate.id,
    reportId: report.id,
  };
}

/**
 * Get Checkr report status
 */
export async function getCheckrReportStatus(
  reportId: string
): Promise<CheckrResult> {
  console.log(`[KYC Activity] Getting Checkr report status: ${reportId}`);

  const client = getCheckrClient();
  const report = await client.getReport(reportId);

  return {
    candidateId: report.candidate_id,
    reportId: report.id,
    status: report.status,
    result: report.result,
    completedAt: report.completed_at ? new Date(report.completed_at).getTime() : undefined,
  };
}

// ============================================================================
// Parallel Markets Activities
// ============================================================================

/**
 * Create accreditation verification request
 */
export async function createAccreditationRequest(
  userId: string,
  email: string,
  name: string,
  type: AccreditationType = 'accredited_investor'
): Promise<{ requestId: string; verificationUrl: string | null }> {
  console.log(`[KYC Activity] Creating accreditation request for user: ${userId}`);

  const client = getParallelMarketsClient();
  const request = await client.createAccreditationRequest({
    investorEmail: email,
    investorName: name,
    type,
  });

  return {
    requestId: request.id,
    verificationUrl: request.verification_url,
  };
}

/**
 * Get accreditation status
 */
export async function getAccreditationStatus(
  requestId: string
): Promise<AccreditationResult> {
  console.log(`[KYC Activity] Getting accreditation status: ${requestId}`);

  const client = getParallelMarketsClient();
  const request = await client.getAccreditationStatus(requestId);

  return {
    requestId: request.id,
    status: request.status,
    method: request.method ?? undefined,
    expiresAt: request.expires_at ? new Date(request.expires_at).getTime() : undefined,
    completedAt: request.completed_at ? new Date(request.completed_at).getTime() : undefined,
  };
}

/**
 * Download accreditation certificate
 */
export async function downloadAccreditationCertificate(
  requestId: string
): Promise<{ certificateData: string }> {
  console.log(`[KYC Activity] Downloading accreditation certificate: ${requestId}`);

  const client = getParallelMarketsClient();
  const pdfBuffer = await client.downloadAccreditationCertificate(requestId);

  return {
    certificateData: pdfBuffer.toString('base64'),
  };
}

// ============================================================================
// Sanctions.io Activities
// ============================================================================

/**
 * Screen user against sanctions lists
 */
export async function screenUserSanctions(
  userId: string,
  name: string,
  dob?: string,
  country?: string,
  nationality?: string
): Promise<SanctionsResult> {
  console.log(`[KYC Activity] Screening user against sanctions: ${userId}`);

  const client = getSanctionsClient();
  const result = await client.screenIndividual({
    name,
    dateOfBirth: dob,
    country,
    nationality,
  });

  return {
    screeningId: result.id,
    match: result.match,
    riskScore: result.risk_score,
    riskLevel: result.risk_level,
    hitsCount: result.hits.length,
    completedAt: Date.now(),
  };
}

/**
 * Screen crypto wallet address
 */
export async function screenWalletSanctions(
  walletAddress: string,
  chain: string
): Promise<{ screeningId: string; match: boolean; riskScore: number }> {
  console.log(`[KYC Activity] Screening wallet: ${walletAddress}`);

  const client = getSanctionsClient();
  const result = await client.screenEntity({
    name: walletAddress,
    country: undefined,
    datasets: ['sanctions'],
  });

  return {
    screeningId: result.id,
    match: result.match,
    riskScore: result.risk_score,
  };
}

/**
 * Add user to ongoing monitoring
 */
export async function addToOngoingMonitoring(
  userId: string,
  userData: { name: string; dob?: string; country?: string }
): Promise<{ monitoringId: string }> {
  console.log(`[KYC Activity] Adding user to ongoing monitoring: ${userId}`);

  const client = getSanctionsClient();
  const entity = await client.addToMonitoring({
    name: userData.name,
    type: 'individual',
    dateOfBirth: userData.dob,
    country: userData.country,
    externalId: userId,
    datasets: ['sanctions', 'pep'],
    screeningFrequency: 'daily',
  });

  return { monitoringId: entity.id };
}

// ============================================================================
// KYC Status Activities
// ============================================================================

/**
 * Update KYC status in database
 */
export async function updateKYCStatusInDB(
  userId: string,
  updates: {
    status?: string;
    tier?: string;
    sumsubApplicantId?: string;
    sumsubResult?: SumsubResult;
    checkrCandidateId?: string;
    checkrReportId?: string;
    checkrResult?: CheckrResult;
    parallelRequestId?: string;
    accreditationResult?: AccreditationResult;
    sanctionsScreeningId?: string;
    sanctionsResult?: SanctionsResult;
    plaidItemId?: string;
    plaidAccessToken?: string;
    plaidAccountId?: string;
    plaidResult?: PlaidResult;
    rejectionReason?: string;
    workflowId?: string;
    completedAt?: number;
    expiresAt?: number;
  }
): Promise<void> {
  console.log(`[KYC Activity] Updating KYC status for user: ${userId}`);

  // TODO: Implement actual Convex mutation call
  // This would call the Convex function to update the KYC record
}

/**
 * Create KYC record in database
 */
export async function createKYCRecord(
  userId: string,
  targetTier: 'basic' | 'enhanced' | 'accredited',
  workflowId: string
): Promise<{ recordId: string }> {
  console.log(`[KYC Activity] Creating KYC record for user: ${userId}`);

  // TODO: Implement actual Convex mutation call
  return { recordId: `kyc_${crypto.randomUUID()}` };
}

/**
 * Send KYC notification to user
 */
export async function sendKYCUserNotification(
  userId: string,
  email: string,
  type: 'started' | 'approved' | 'rejected' | 'action_required' | 'expiring',
  data?: Record<string, unknown>
): Promise<void> {
  console.log(`[KYC Activity] Sending KYC notification: ${type} to ${userId}`);

  const notificationMessages: Record<typeof type, string> = {
    started: 'Your KYC verification has started.',
    approved: 'Congratulations! Your KYC verification has been approved.',
    rejected: 'Your KYC verification was not approved. Please contact support.',
    action_required: 'Additional action is required for your KYC verification.',
    expiring: 'Your KYC verification is expiring soon. Please renew.',
  };

  // TODO: Integrate with email service (Resend, SendGrid, etc.)
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PULL <kyc@pull.com>",
      to: email,
      subject: `PULL KYC: ${type.replace('_', ' ').toUpperCase()}`,
      html: `<p>${notificationMessages[type]}</p>`,
    }),
  });
}
