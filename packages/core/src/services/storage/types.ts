/**
 * S3/R2 Storage Types
 * Types for file storage, documents, and attachments
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface StorageClientConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  timeout?: number;
  publicUrl?: string;
  logger?: Logger;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ============================================================================
// Object Types
// ============================================================================

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ObjectContent {
  body: Buffer | ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadParams {
  key: string;
  body: Buffer | Uint8Array | string | ReadableStream<Uint8Array>;
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
  acl?: ObjectAcl;
}

export interface UploadResult {
  key: string;
  etag: string;
  location: string;
  bucket: string;
}

export interface MultipartUploadParams {
  key: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface MultipartUploadPart {
  partNumber: number;
  body: Buffer | Uint8Array;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export type ObjectAcl =
  | "private"
  | "public-read"
  | "public-read-write"
  | "authenticated-read";

// ============================================================================
// Download Types
// ============================================================================

export interface DownloadParams {
  key: string;
  range?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: Date;
}

export interface DownloadResult {
  body: Buffer;
  contentType: string;
  contentLength: number;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

// ============================================================================
// List Types
// ============================================================================

export interface ListParams {
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListResult {
  objects: StorageObject[];
  prefixes: string[];
  isTruncated: boolean;
  continuationToken?: string;
}

// ============================================================================
// Signed URL Types
// ============================================================================

export interface SignedUrlParams {
  key: string;
  expiresIn?: number; // seconds
  method?: "GET" | "PUT";
  contentType?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface SignedUrlResult {
  url: string;
  expiresAt: Date;
}

// ============================================================================
// Copy/Delete Types
// ============================================================================

export interface CopyParams {
  sourceKey: string;
  destinationKey: string;
  sourceBucket?: string;
  metadata?: Record<string, string>;
  metadataDirective?: "COPY" | "REPLACE";
}

export interface DeleteParams {
  key: string;
}

export interface DeleteMultipleParams {
  keys: string[];
}

export interface DeleteResult {
  deleted: string[];
  errors: Array<{ key: string; code: string; message: string }>;
}

// ============================================================================
// Domain-Specific Types
// ============================================================================

// Email attachments
export interface EmailAttachment {
  attachmentId: string;
  emailId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: Date;
}

// Document storage
export interface Document {
  documentId: string;
  userId: string;
  type: DocumentType;
  filename: string;
  contentType: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: Date;
  processedAt?: Date;
  metadata?: Record<string, string>;
}

export type DocumentType =
  | "identity"
  | "proof_of_address"
  | "bank_statement"
  | "tax_form"
  | "contract"
  | "rwa_certificate"
  | "other";

export type DocumentStatus =
  | "pending"
  | "processing"
  | "verified"
  | "rejected"
  | "expired";

// User avatar/profile images
export interface ProfileImage {
  userId: string;
  type: "avatar" | "banner";
  size: ImageSize;
  url: string;
  uploadedAt: Date;
}

export type ImageSize = "small" | "medium" | "large" | "original";

// RWA asset images
export interface AssetImage {
  assetId: string;
  imageIndex: number;
  type: "front" | "back" | "detail" | "certificate";
  url: string;
  thumbnailUrl?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly key?: string
  ) {
    super(message);
    this.name = "StorageError";
  }
}
