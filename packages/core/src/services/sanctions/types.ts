/**
 * Sanctions.io Service Types
 * Sanctions/PEP/watchlist screening
 */

import { z } from 'zod';

// ==========================================================================
// ENUMS AND CONSTANTS
// ==========================================================================

/**
 * Entity type for screening
 */
export type EntityType = 'individual' | 'entity';

/**
 * Screening status
 */
export type ScreeningStatus =
  | 'pending'
  | 'completed'
  | 'error'
  | 'rate_limited';

/**
 * Match strength
 */
export type MatchStrength =
  | 'exact'
  | 'strong'
  | 'medium'
  | 'weak'
  | 'none';

/**
 * Dataset types
 */
export type DatasetType =
  | 'sanctions'      // OFAC, UN, EU, HMT, etc.
  | 'pep'           // Politically Exposed Persons
  | 'adverse_media' // News screening
  | 'criminal'      // Interpol, FBI, etc.
  | 'regulatory';   // Financial regulators

/**
 * Specific sanction lists
 */
export type SanctionList =
  | 'OFAC_SDN'      // US OFAC SDN List
  | 'OFAC_CONS'     // US OFAC Consolidated List
  | 'UN_SC'         // UN Security Council
  | 'EU_EEAS'       // EU Consolidated List
  | 'UK_HMT'        // UK HM Treasury
  | 'AU_DFAT'       // Australia DFAT
  | 'CA_OSFI'       // Canada OSFI
  | 'FR_TRESOR'     // France Treasury
  | 'DE_BAFA'       // Germany BAFA
  | 'CH_SECO'       // Switzerland SECO
  | 'JP_MOF'        // Japan MOF
  | 'SG_MAS'        // Singapore MAS
  | 'INTERPOL_RN'   // Interpol Red Notices
  | 'FBI_MW'        // FBI Most Wanted
  | 'WORLD_PEP';    // Global PEP Database

/**
 * Monitoring alert types
 */
export type AlertType =
  | 'new_match'
  | 'match_updated'
  | 'match_removed'
  | 'entity_added'
  | 'entity_removed'
  | 'list_updated';

// ==========================================================================
// ZOD SCHEMAS
// ==========================================================================

export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

export const IdentifierSchema = z.object({
  type: z.string(), // passport, ssn, tax_id, etc.
  value: z.string(),
  country: z.string().optional(),
});

export const HitEntitySchema = z.object({
  name: z.string(),
  type: z.enum(['individual', 'entity']),
  aliases: z.array(z.string()).optional(),
  date_of_birth: z.string().optional(),
  place_of_birth: z.string().optional(),
  nationality: z.array(z.string()).optional(),
  addresses: z.array(AddressSchema).optional(),
  identifiers: z.array(IdentifierSchema).optional(),
  listed_on: z.string().optional(),
  remarks: z.string().optional(),
});

export const HitSchema = z.object({
  id: z.string(),
  list: z.string(),
  list_name: z.string(),
  match_score: z.number(),
  match_strength: z.enum(['exact', 'strong', 'medium', 'weak', 'none']),
  entity: HitEntitySchema,
  match_reasons: z.array(z.string()).optional(),
  source_url: z.string().optional(),
});

export const ScreeningResultSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'completed', 'error', 'rate_limited']),
  match: z.boolean(),
  hits: z.array(HitSchema),
  risk_score: z.number(), // 0-100
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  screened_at: z.string(),
  datasets_checked: z.array(z.string()),
  query: z.object({
    name: z.string(),
    type: z.enum(['individual', 'entity']),
    date_of_birth: z.string().optional(),
    country: z.string().optional(),
    identifiers: z.array(IdentifierSchema).optional(),
  }),
});

export const BatchScreeningResultSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'error']),
  total_entries: z.number(),
  completed_entries: z.number(),
  matches_found: z.number(),
  created_at: z.string(),
  completed_at: z.string().optional(),
  results: z.array(ScreeningResultSchema).optional(),
});

export const MonitoringEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['individual', 'entity']),
  date_of_birth: z.string().optional(),
  country: z.string().optional(),
  identifiers: z.array(IdentifierSchema).optional(),
  external_id: z.string().optional(),
  datasets: z.array(z.string()),
  status: z.enum(['active', 'paused', 'removed']),
  last_screened_at: z.string().optional(),
  next_screening_at: z.string().optional(),
  created_at: z.string(),
});

export const MonitoringAlertSchema = z.object({
  id: z.string(),
  entity_id: z.string(),
  type: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  created_at: z.string(),
  acknowledged_at: z.string().optional(),
  resolved_at: z.string().optional(),
});

// ==========================================================================
// TYPE INTERFACES
// ==========================================================================

export type Address = z.infer<typeof AddressSchema>;
export type Identifier = z.infer<typeof IdentifierSchema>;
export type HitEntity = z.infer<typeof HitEntitySchema>;
export type Hit = z.infer<typeof HitSchema>;
export type ScreeningResult = z.infer<typeof ScreeningResultSchema>;
export type BatchScreeningResult = z.infer<typeof BatchScreeningResultSchema>;
export type MonitoringEntity = z.infer<typeof MonitoringEntitySchema>;
export type MonitoringAlert = z.infer<typeof MonitoringAlertSchema>;

/**
 * Screen individual parameters
 */
export interface ScreenIndividualParams {
  name: string;
  dateOfBirth?: string;
  country?: string;
  nationality?: string;
  identifiers?: Identifier[];
  datasets?: DatasetType[];
  matchThreshold?: number; // 0-100, default 75
}

/**
 * Screen entity parameters
 */
export interface ScreenEntityParams {
  name: string;
  country?: string;
  registrationNumber?: string;
  datasets?: DatasetType[];
  matchThreshold?: number;
}

/**
 * Batch screening entry
 */
export interface BatchScreeningEntry {
  externalId?: string;
  type: EntityType;
  name: string;
  dateOfBirth?: string;
  country?: string;
  identifiers?: Identifier[];
}

/**
 * Add to monitoring parameters
 */
export interface AddToMonitoringParams {
  name: string;
  type: EntityType;
  dateOfBirth?: string;
  country?: string;
  identifiers?: Identifier[];
  externalId?: string;
  datasets?: DatasetType[];
  screeningFrequency?: 'daily' | 'weekly' | 'monthly';
}

/**
 * Client configuration
 */
export interface SanctionsClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  logger?: Logger;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

// ==========================================================================
// ERROR CLASSES
// ==========================================================================

/**
 * Base error class for Sanctions.io API errors
 */
export class SanctionsApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'SanctionsApiError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.details = params.details;
  }

  /**
   * Check if the error is retryable
   */
  isRetryable(): boolean {
    return this.statusCode >= 500 || this.statusCode === 429;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Check if authentication error
   */
  isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403;
  }
}

// ==========================================================================
// DEFAULT LOGGER
// ==========================================================================

export const defaultLogger: Logger = {
  debug: (message: string, ...args: unknown[]) =>
    console.debug(`[Sanctions] ${message}`, ...args),
  info: (message: string, ...args: unknown[]) =>
    console.info(`[Sanctions] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) =>
    console.warn(`[Sanctions] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(`[Sanctions] ${message}`, ...args),
};

// ==========================================================================
// CONSTANTS
// ==========================================================================

export const SANCTIONS_IO_BASE_URL = 'https://api.sanctions.io/v2';

/**
 * Risk score thresholds
 */
export const RISK_THRESHOLDS = {
  low: 25,
  medium: 50,
  high: 75,
  critical: 90,
};

/**
 * Dataset descriptions
 */
export const DATASET_DESCRIPTIONS: Record<DatasetType, string> = {
  sanctions: 'Global sanctions lists (OFAC, UN, EU, HMT, etc.)',
  pep: 'Politically Exposed Persons database',
  adverse_media: 'Negative news and media screening',
  criminal: 'Criminal databases (Interpol, FBI, etc.)',
  regulatory: 'Financial regulatory enforcement actions',
};

/**
 * Sanction list descriptions
 */
export const SANCTION_LIST_DESCRIPTIONS: Record<SanctionList, string> = {
  OFAC_SDN: 'US OFAC Specially Designated Nationals',
  OFAC_CONS: 'US OFAC Consolidated List',
  UN_SC: 'UN Security Council Sanctions',
  EU_EEAS: 'EU Consolidated Sanctions List',
  UK_HMT: 'UK HM Treasury Sanctions',
  AU_DFAT: 'Australia DFAT Sanctions',
  CA_OSFI: 'Canada OSFI Sanctions',
  FR_TRESOR: 'France Treasury Sanctions',
  DE_BAFA: 'Germany BAFA Sanctions',
  CH_SECO: 'Switzerland SECO Sanctions',
  JP_MOF: 'Japan Ministry of Finance Sanctions',
  SG_MAS: 'Singapore MAS Sanctions',
  INTERPOL_RN: 'Interpol Red Notices',
  FBI_MW: 'FBI Most Wanted',
  WORLD_PEP: 'Global PEP Database',
};
