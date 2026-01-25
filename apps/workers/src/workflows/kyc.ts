import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities/kyc";

const {
  createPersonaInquiry,
  checkPersonaStatus,
  createCheckrCandidate,
  createCheckrReport,
  checkCheckrStatus,
  screenWalletAddress,
  sendVerificationEmail,
  updateUserKYCStatus,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "2 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
});

// Signals for external events
export const emailVerifiedSignal = defineSignal("emailVerified");
export const personaCompletedSignal = defineSignal<[string, string]>(
  "personaCompleted"
);
export const checkrCompletedSignal = defineSignal<[string, string]>(
  "checkrCompleted"
);

interface KYCWorkflowParams {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  walletAddress?: string;
  templateId: string; // Persona template ID - must be passed as input for determinism
}

/**
 * Complete KYC onboarding workflow
 */
export async function kycOnboardingWorkflow(
  params: KYCWorkflowParams
): Promise<{ success: boolean; kycTier: string }> {
  const { userId, email, firstName, lastName, walletAddress, templateId } = params;

  // State tracking
  let emailVerified = false;
  let identityVerified = false;
  let backgroundCleared = false;
  let walletScreened = !walletAddress; // Skip if no wallet

  // Set up signal handlers
  setHandler(emailVerifiedSignal, () => {
    emailVerified = true;
  });

  setHandler(personaCompletedSignal, (status: string, _details: string) => {
    identityVerified = status === "completed";
  });

  setHandler(checkrCompletedSignal, (status: string, _details: string) => {
    backgroundCleared = status === "clear";
  });

  // Step 1: Send email verification
  await updateUserKYCStatus(userId, "pending");
  const verificationLink = `https://pull.app/verify?token=${crypto.randomUUID()}`;
  await sendVerificationEmail(email, verificationLink);

  // Wait for email verification (max 24 hours)
  const emailVerificationResult = await condition(
    () => emailVerified,
    "24 hours"
  );

  if (!emailVerificationResult) {
    await updateUserKYCStatus(userId, "rejected");
    return { success: false, kycTier: "none" };
  }

  await updateUserKYCStatus(userId, "email_verified");

  // Step 2: Screen wallet if provided (parallel with identity)
  let walletRisk = { risk: "low" as const, score: 0 };
  if (walletAddress) {
    walletRisk = await screenWalletAddress(walletAddress);
    walletScreened = walletRisk.risk !== "severe";

    if (!walletScreened) {
      await updateUserKYCStatus(userId, "rejected");
      return { success: false, kycTier: "none" };
    }
  }

  // Step 3: Create Persona identity verification
  await updateUserKYCStatus(userId, "identity_pending");
  const personaInquiry = await createPersonaInquiry(
    userId,
    templateId
  );

  // Poll for Persona completion (or wait for signal)
  for (let i = 0; i < 60 && !identityVerified; i++) {
    await sleep("5 minutes");
    const status = await checkPersonaStatus(personaInquiry.inquiryId);
    if (status.status === "completed") {
      identityVerified = true;
    } else if (status.status === "failed" || status.status === "expired") {
      break;
    }
  }

  if (!identityVerified) {
    await updateUserKYCStatus(userId, "rejected");
    return { success: false, kycTier: "none" };
  }

  await updateUserKYCStatus(userId, "identity_verified");

  // Step 4: Background check with Checkr
  await updateUserKYCStatus(userId, "background_pending");
  const checkrCandidate = await createCheckrCandidate(
    userId,
    email,
    firstName,
    lastName
  );
  const reportId = await createCheckrReport(checkrCandidate.candidateId);

  // Poll for Checkr completion (or wait for signal)
  for (let i = 0; i < 72 && !backgroundCleared; i++) {
    await sleep("1 hour");
    const status = await checkCheckrStatus(reportId);
    if (status.status === "clear") {
      backgroundCleared = true;
    } else if (status.status === "consider" || status.status === "suspended") {
      break;
    }
  }

  if (!backgroundCleared) {
    await updateUserKYCStatus(userId, "rejected");
    return { success: false, kycTier: "none" };
  }

  await updateUserKYCStatus(userId, "background_cleared");

  // Step 5: Determine final tier
  let kycTier = "verified";

  // Could elevate to premium based on additional factors
  if (walletRisk.score < 0.05 && backgroundCleared) {
    kycTier = "premium";
  }

  await updateUserKYCStatus(userId, "approved", kycTier);

  return { success: true, kycTier };
}
