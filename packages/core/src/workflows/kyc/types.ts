/**
 * KYC Workflow Types
 * Type definitions for KYC onboarding and upgrade workflows
 */

// ==========================================================================
// TIER TYPES
// ==========================================================================

/**
 * KYC tiers with increasing verification requirements
 */
export type KYCTier = 'none' | 'basic' | 'enhanced' | 'accredited';

/**
 * KYC status
 */
export type KYCStatus =
  | 'pending'
  | 'in_progress'
  | 'awaiting_user_action'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired';

/**
 * Individual step status
 */
export type StepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

// ==========================================================================
// WORKFLOW INPUT/OUTPUT
// ==========================================================================

/**
 * Address structure
 */
export interface Address {
  street: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * User data for KYC verification
 */
export interface KYCUserData {
  firstName: string;
  lastName: string;
  middleName?: string;
  dob: string; // YYYY-MM-DD
  ssn?: string;
  phone?: string;
  address?: Address;
  nationality?: string;
}

/**
 * Input for KYC onboarding workflow
 */
export interface KYCWorkflowInput {
  userId: string;
  email: string;
  targetTier: 'basic' | 'enhanced' | 'accredited';
  userData?: KYCUserData;
  requireBankLink?: boolean;
  walletAddress?: string;
  walletChain?: string;
}

/**
 * Output from KYC workflow
 */
export interface KYCWorkflowOutput {
  success: boolean;
  userId: string;
  tier: KYCTier;
  status: KYCStatus;
  rejectionReason?: string;
  completedAt?: string;
  expiresAt?: string;
}

/**
 * Input for KYC upgrade workflow
 */
export interface KYCUpgradeInput {
  userId: string;
  email: string;
  currentTier: KYCTier;
  targetTier: 'enhanced' | 'accredited';
  requireBankLink?: boolean;
}

// ==========================================================================
// WORKFLOW STATUS
// ==========================================================================

/**
 * Individual verification step
 */
export interface KYCStep {
  name: string;
  status: StepStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Current workflow status
 */
export interface KYCWorkflowStatus {
  workflowId: string;
  userId: string;
  targetTier: KYCTier;
  status: KYCStatus;
  currentStep: string;
  progress: number; // 0-100
  steps: KYCStep[];

  // Service-specific IDs
  sumsubApplicantId?: string;
  sumsubAccessToken?: string;
  checkrCandidateId?: string;
  checkrReportId?: string;
  parallelRequestId?: string;
  sanctionsScreeningId?: string;
  plaidItemId?: string;

  // Results
  sumsubResult?: SumsubResult;
  checkrResult?: CheckrResult;
  accreditationResult?: AccreditationResult;
  sanctionsResult?: SanctionsResult;
  plaidResult?: PlaidResult;

  // Metadata
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  expiresAt?: number;
  error?: string;
}

// ==========================================================================
// SERVICE RESULTS
// ==========================================================================

/**
 * Sumsub verification result
 */
export interface SumsubResult {
  applicantId: string;
  reviewStatus: string;
  reviewAnswer: 'GREEN' | 'RED' | 'ERROR';
  rejectLabels?: string[];
  moderationComment?: string;
  completedAt: number;
}

/**
 * Checkr background check result
 */
export interface CheckrResult {
  candidateId: string;
  reportId: string;
  status: 'pending' | 'complete' | 'suspended' | 'dispute';
  result: 'clear' | 'consider' | 'adverse_action' | null;
  completedAt?: number;
}

/**
 * Parallel Markets accreditation result
 */
export interface AccreditationResult {
  requestId: string;
  status: string;
  method?: string;
  expiresAt?: number;
  completedAt?: number;
}

/**
 * Sanctions screening result
 */
export interface SanctionsResult {
  screeningId: string;
  match: boolean;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hitsCount: number;
  completedAt: number;
}

/**
 * Plaid bank linking result
 */
export interface PlaidResult {
  itemId: string;
  accountId: string;
  institutionName?: string;
  accountMask?: string;
  linkedAt: number;
}

// ==========================================================================
// SIGNALS
// ==========================================================================

/**
 * Signal: Sumsub verification completed
 */
export interface SumsubCompletedSignal {
  applicantId: string;
  reviewStatus: string;
  reviewAnswer: 'GREEN' | 'RED' | 'ERROR';
  rejectLabels?: string[];
  moderationComment?: string;
}

/**
 * Signal: Checkr report completed
 */
export interface CheckrCompletedSignal {
  reportId: string;
  status: 'complete' | 'suspended' | 'dispute';
  result: 'clear' | 'consider' | 'adverse_action' | null;
}

/**
 * Signal: Parallel Markets accreditation completed
 */
export interface AccreditationCompletedSignal {
  requestId: string;
  status: 'approved' | 'rejected' | 'expired';
  method?: string;
  rejectionReason?: string;
  expiresAt?: number;
}

/**
 * Signal: Plaid account linked
 */
export interface PlaidLinkedSignal {
  publicToken: string;
  accountId: string;
  institutionId?: string;
  institutionName?: string;
  accountMask?: string;
}

/**
 * Signal: Sanctions screening completed
 */
export interface SanctionsCompletedSignal {
  screeningId: string;
  match: boolean;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hitsCount: number;
}

// ==========================================================================
// ACTIVITY PARAMETERS
// ==========================================================================

/**
 * Parameters for creating Sumsub applicant
 */
export interface CreateSumsubApplicantParams {
  userId: string;
  email: string;
  tier: 'basic' | 'enhanced' | 'accredited';
  userData?: KYCUserData;
}

/**
 * Parameters for creating Checkr candidate and report
 */
export interface CreateCheckrReportParams {
  userId: string;
  email: string;
  userData: KYCUserData;
  package: 'tasker_standard' | 'driver_pro' | 'international_basic';
}

/**
 * Parameters for Parallel Markets accreditation
 */
export interface CreateAccreditationParams {
  userId: string;
  email: string;
  name: string;
  type: 'accredited_investor' | 'qualified_purchaser' | 'qualified_client';
}

/**
 * Parameters for sanctions screening
 */
export interface ScreenUserParams {
  userId: string;
  name: string;
  dob?: string;
  country?: string;
  nationality?: string;
}

/**
 * Parameters for Plaid link token creation
 */
export interface CreatePlaidLinkTokenParams {
  userId: string;
  products: string[];
  redirectUri?: string;
}

/**
 * Parameters for updating KYC status
 */
export interface UpdateKYCStatusParams {
  userId: string;
  status: KYCStatus;
  tier?: KYCTier;
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

/**
 * Parameters for sending KYC notification
 */
export interface SendKYCNotificationParams {
  userId: string;
  email: string;
  type: 'started' | 'approved' | 'rejected' | 'action_required' | 'expiring';
  data?: Record<string, unknown>;
}

/**
 * Parameters for logging audit events
 */
export interface LogAuditEventParams {
  userId: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// ==========================================================================
// WORKFLOW CONFIGURATION
// ==========================================================================

/**
 * Tier configuration with required verifications
 */
export const TIER_CONFIG: Record<'basic' | 'enhanced' | 'accredited', {
  sumsubLevel: string;
  requiresCheckr: boolean;
  checkrPackage?: string;
  requiresAccreditation: boolean;
  description: string;
}> = {
  basic: {
    sumsubLevel: 'basic-kyc-level',
    requiresCheckr: false,
    requiresAccreditation: false,
    description: 'ID + Selfie verification',
  },
  enhanced: {
    sumsubLevel: 'enhanced-kyc-level',
    requiresCheckr: true,
    checkrPackage: 'tasker_standard',
    requiresAccreditation: false,
    description: 'ID + Selfie + Proof of Address + Liveness + Background Check',
  },
  accredited: {
    sumsubLevel: 'accredited-kyc-level',
    requiresCheckr: true,
    checkrPackage: 'international_basic',
    requiresAccreditation: true,
    description: 'Full verification for accredited investors',
  },
};

/**
 * Workflow timeout configurations
 */
export const WORKFLOW_TIMEOUTS = {
  sumsubCompletion: '24 hours',
  checkrCompletion: '7 days',
  accreditationCompletion: '14 days',
  plaidLinking: '1 hour',
  sanctionsScreening: '30 seconds',
};

/**
 * KYC expiration periods
 */
export const KYC_EXPIRATION = {
  basic: 365 * 24 * 60 * 60 * 1000, // 1 year
  enhanced: 365 * 24 * 60 * 60 * 1000, // 1 year
  accredited: 90 * 24 * 60 * 60 * 1000, // 90 days (SEC requirement)
};
