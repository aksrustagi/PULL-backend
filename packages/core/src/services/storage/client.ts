/**
 * S3/R2 Storage Client
 * Client for file storage, documents, and attachments
 */

import * as crypto from "crypto";
import type {
  StorageClientConfig,
  Logger,
  StorageObject,
  UploadParams,
  UploadResult,
  DownloadParams,
  DownloadResult,
  ListParams,
  ListResult,
  SignedUrlParams,
  SignedUrlResult,
  CopyParams,
  DeleteParams,
  DeleteMultipleParams,
  DeleteResult,
  EmailAttachment,
  Document,
  DocumentType,
  ProfileImage,
  ImageSize,
  AssetImage,
} from "./types";
import { StorageError } from "./types";

// ============================================================================
// Storage Client
// ============================================================================

export class StorageClient {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;
  private readonly timeout: number;
  private readonly publicUrl: string;
  private readonly logger: Logger;

  constructor(config: StorageClientConfig) {
    this.region = config.region;
    this.bucket = config.bucket;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.forcePathStyle = config.forcePathStyle ?? true;
    this.timeout = config.timeout ?? 60000;
    this.logger = config.logger ?? this.createDefaultLogger();

    // Set endpoint (S3 or R2/custom)
    if (config.endpoint) {
      this.endpoint = config.endpoint;
    } else {
      this.endpoint = `https://s3.${this.region}.amazonaws.com`;
    }

    // Public URL for generating accessible links
    this.publicUrl = config.publicUrl ?? this.getDefaultPublicUrl();
  }

  private createDefaultLogger(): Logger {
    return {
      debug: (msg, meta) => console.debug(`[Storage] ${msg}`, meta),
      info: (msg, meta) => console.info(`[Storage] ${msg}`, meta),
      warn: (msg, meta) => console.warn(`[Storage] ${msg}`, meta),
      error: (msg, meta) => console.error(`[Storage] ${msg}`, meta),
    };
  }

  private getDefaultPublicUrl(): string {
    if (this.forcePathStyle) {
      return `${this.endpoint}/${this.bucket}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  // ==========================================================================
  // AWS Signature V4
  // ==========================================================================

  private sign(
    method: string,
    path: string,
    headers: Record<string, string>,
    payload: Buffer | string = ""
  ): Record<string, string> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const payloadHash = crypto
      .createHash("sha256")
      .update(typeof payload === "string" ? payload : payload)
      .digest("hex");

    const signedHeaders: Record<string, string> = {
      ...headers,
      host: new URL(this.endpoint).host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    // Create canonical request
    const sortedHeaderKeys = Object.keys(signedHeaders).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k.toLowerCase()}:${signedHeaders[k].trim()}`)
      .join("\n");
    const signedHeadersStr = sortedHeaderKeys
      .map((k) => k.toLowerCase())
      .join(";");

    const canonicalRequest = [
      method,
      path,
      "", // query string
      canonicalHeaders,
      "",
      signedHeadersStr,
      payloadHash,
    ].join("\n");

    // Create string to sign
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    // Calculate signature
    const kDate = crypto
      .createHmac("sha256", `AWS4${this.secretAccessKey}`)
      .update(dateStamp)
      .digest();
    const kRegion = crypto
      .createHmac("sha256", kDate)
      .update(this.region)
      .digest();
    const kService = crypto
      .createHmac("sha256", kRegion)
      .update("s3")
      .digest();
    const kSigning = crypto
      .createHmac("sha256", kService)
      .update("aws4_request")
      .digest();
    const signature = crypto
      .createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    // Create authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

    return {
      ...signedHeaders,
      Authorization: authorization,
    };
  }

  private getObjectUrl(key: string): string {
    if (this.forcePathStyle) {
      return `${this.endpoint}/${this.bucket}/${encodeURIComponent(key)}`;
    }
    const url = new URL(this.endpoint);
    url.hostname = `${this.bucket}.${url.hostname}`;
    url.pathname = `/${encodeURIComponent(key)}`;
    return url.toString();
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Upload an object
   */
  async upload(params: UploadParams): Promise<UploadResult> {
    const path = `/${this.bucket}/${params.key}`;
    const body =
      typeof params.body === "string"
        ? Buffer.from(params.body)
        : params.body instanceof Buffer
          ? params.body
          : Buffer.from(params.body as Uint8Array);

    const headers: Record<string, string> = {
      "Content-Type": params.contentType ?? "application/octet-stream",
      "Content-Length": String((body as Buffer).length),
    };

    if (params.cacheControl) {
      headers["Cache-Control"] = params.cacheControl;
    }
    if (params.contentDisposition) {
      headers["Content-Disposition"] = params.contentDisposition;
    }
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        headers[`x-amz-meta-${key}`] = value;
      }
    }
    if (params.acl) {
      headers["x-amz-acl"] = params.acl;
    }

    const signedHeaders = this.sign("PUT", path, headers, body as Buffer);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.getObjectUrl(params.key), {
        method: "PUT",
        headers: signedHeaders,
        body: body as Buffer,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new StorageError(
          `Upload failed: ${errorText}`,
          "UploadFailed",
          response.status,
          params.key
        );
      }

      const etag = response.headers.get("etag") ?? "";

      this.logger.info("Object uploaded", {
        key: params.key,
        size: (body as Buffer).length,
      });

      return {
        key: params.key,
        etag,
        location: `${this.publicUrl}/${params.key}`,
        bucket: this.bucket,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof StorageError) {
        throw error;
      }

      throw new StorageError(
        (error as Error).message,
        "UploadFailed",
        500,
        params.key
      );
    }
  }

  /**
   * Download an object
   */
  async download(params: DownloadParams): Promise<DownloadResult> {
    const path = `/${this.bucket}/${params.key}`;
    const headers: Record<string, string> = {};

    if (params.range) {
      headers["Range"] = params.range;
    }
    if (params.ifMatch) {
      headers["If-Match"] = params.ifMatch;
    }
    if (params.ifNoneMatch) {
      headers["If-None-Match"] = params.ifNoneMatch;
    }
    if (params.ifModifiedSince) {
      headers["If-Modified-Since"] = params.ifModifiedSince.toUTCString();
    }

    const signedHeaders = this.sign("GET", path, headers);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.getObjectUrl(params.key), {
        method: "GET",
        headers: signedHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new StorageError(
            "Object not found",
            "NotFound",
            404,
            params.key
          );
        }
        throw new StorageError(
          `Download failed`,
          "DownloadFailed",
          response.status,
          params.key
        );
      }

      const body = Buffer.from(await response.arrayBuffer());
      const metadata: Record<string, string> = {};

      response.headers.forEach((value, key) => {
        if (key.startsWith("x-amz-meta-")) {
          metadata[key.replace("x-amz-meta-", "")] = value;
        }
      });

      return {
        body,
        contentType:
          response.headers.get("content-type") ?? "application/octet-stream",
        contentLength: body.length,
        etag: response.headers.get("etag") ?? "",
        lastModified: new Date(
          response.headers.get("last-modified") ?? Date.now()
        ),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof StorageError) {
        throw error;
      }

      throw new StorageError(
        (error as Error).message,
        "DownloadFailed",
        500,
        params.key
      );
    }
  }

  /**
   * Check if object exists
   */
  async exists(key: string): Promise<boolean> {
    const path = `/${this.bucket}/${key}`;
    const signedHeaders = this.sign("HEAD", path, {});

    try {
      const response = await fetch(this.getObjectUrl(key), {
        method: "HEAD",
        headers: signedHeaders,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get object metadata
   */
  async head(key: string): Promise<StorageObject | null> {
    const path = `/${this.bucket}/${key}`;
    const signedHeaders = this.sign("HEAD", path, {});

    try {
      const response = await fetch(this.getObjectUrl(key), {
        method: "HEAD",
        headers: signedHeaders,
      });

      if (!response.ok) {
        return null;
      }

      const metadata: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key.startsWith("x-amz-meta-")) {
          metadata[key.replace("x-amz-meta-", "")] = value;
        }
      });

      return {
        key,
        size: parseInt(response.headers.get("content-length") ?? "0", 10),
        lastModified: new Date(
          response.headers.get("last-modified") ?? Date.now()
        ),
        etag: response.headers.get("etag") ?? "",
        contentType: response.headers.get("content-type") ?? undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete an object
   */
  async delete(params: DeleteParams): Promise<void> {
    const path = `/${this.bucket}/${params.key}`;
    const signedHeaders = this.sign("DELETE", path, {});

    const response = await fetch(this.getObjectUrl(params.key), {
      method: "DELETE",
      headers: signedHeaders,
    });

    if (!response.ok && response.status !== 404) {
      throw new StorageError(
        "Delete failed",
        "DeleteFailed",
        response.status,
        params.key
      );
    }

    this.logger.info("Object deleted", { key: params.key });
  }

  /**
   * Delete multiple objects
   */
  async deleteMultiple(params: DeleteMultipleParams): Promise<DeleteResult> {
    const deleted: string[] = [];
    const errors: Array<{ key: string; code: string; message: string }> = [];

    // Delete objects in parallel batches
    const batchSize = 10;
    for (let i = 0; i < params.keys.length; i += batchSize) {
      const batch = params.keys.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((key) => this.delete({ key }))
      );

      results.forEach((result, index) => {
        const key = batch[index];
        if (result.status === "fulfilled") {
          deleted.push(key);
        } else {
          errors.push({
            key,
            code: "DeleteFailed",
            message: result.reason?.message ?? "Unknown error",
          });
        }
      });
    }

    return { deleted, errors };
  }

  /**
   * Copy an object
   */
  async copy(params: CopyParams): Promise<UploadResult> {
    const path = `/${this.bucket}/${params.destinationKey}`;
    const sourceBucket = params.sourceBucket ?? this.bucket;
    const headers: Record<string, string> = {
      "x-amz-copy-source": `/${sourceBucket}/${encodeURIComponent(params.sourceKey)}`,
    };

    if (params.metadataDirective) {
      headers["x-amz-metadata-directive"] = params.metadataDirective;
    }
    if (params.metadata && params.metadataDirective === "REPLACE") {
      for (const [key, value] of Object.entries(params.metadata)) {
        headers[`x-amz-meta-${key}`] = value;
      }
    }

    const signedHeaders = this.sign("PUT", path, headers);

    const response = await fetch(this.getObjectUrl(params.destinationKey), {
      method: "PUT",
      headers: signedHeaders,
    });

    if (!response.ok) {
      throw new StorageError(
        "Copy failed",
        "CopyFailed",
        response.status,
        params.destinationKey
      );
    }

    this.logger.info("Object copied", {
      source: params.sourceKey,
      destination: params.destinationKey,
    });

    return {
      key: params.destinationKey,
      etag: response.headers.get("etag") ?? "",
      location: `${this.publicUrl}/${params.destinationKey}`,
      bucket: this.bucket,
    };
  }

  // ==========================================================================
  // Signed URLs
  // ==========================================================================

  /**
   * Generate a presigned URL
   */
  async getSignedUrl(params: SignedUrlParams): Promise<SignedUrlResult> {
    const expiresIn = params.expiresIn ?? 3600; // 1 hour default
    const method = params.method ?? "GET";
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const credential = `${this.accessKeyId}/${credentialScope}`;

    const queryParams = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": credential,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    });

    if (params.responseContentType) {
      queryParams.set("response-content-type", params.responseContentType);
    }
    if (params.responseContentDisposition) {
      queryParams.set(
        "response-content-disposition",
        params.responseContentDisposition
      );
    }

    const host = new URL(this.endpoint).host;
    const path = this.forcePathStyle
      ? `/${this.bucket}/${params.key}`
      : `/${params.key}`;

    const canonicalRequest = [
      method,
      path,
      queryParams.toString(),
      `host:${host}`,
      "",
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    // Calculate signature
    const kDate = crypto
      .createHmac("sha256", `AWS4${this.secretAccessKey}`)
      .update(dateStamp)
      .digest();
    const kRegion = crypto
      .createHmac("sha256", kDate)
      .update(this.region)
      .digest();
    const kService = crypto
      .createHmac("sha256", kRegion)
      .update("s3")
      .digest();
    const kSigning = crypto
      .createHmac("sha256", kService)
      .update("aws4_request")
      .digest();
    const signature = crypto
      .createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    queryParams.set("X-Amz-Signature", signature);

    const url = `${this.getObjectUrl(params.key)}?${queryParams.toString()}`;

    return {
      url,
      expiresAt: new Date(now.getTime() + expiresIn * 1000),
    };
  }

  // ==========================================================================
  // Domain-Specific: Email Attachments
  // ==========================================================================

  /**
   * Upload email attachment
   */
  async uploadEmailAttachment(
    userId: string,
    emailId: string,
    filename: string,
    content: Buffer,
    contentType: string
  ): Promise<EmailAttachment> {
    const attachmentId = crypto.randomUUID();
    const key = `attachments/${userId}/${emailId}/${attachmentId}/${filename}`;

    await this.upload({
      key,
      body: content,
      contentType,
      metadata: {
        userId,
        emailId,
        filename,
      },
    });

    return {
      attachmentId,
      emailId,
      userId,
      filename,
      contentType,
      size: content.length,
      uploadedAt: new Date(),
    };
  }

  /**
   * Get email attachment
   */
  async getEmailAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
    filename: string
  ): Promise<DownloadResult> {
    const key = `attachments/${userId}/${emailId}/${attachmentId}/${filename}`;
    return this.download({ key });
  }

  // ==========================================================================
  // Domain-Specific: Documents
  // ==========================================================================

  /**
   * Upload document
   */
  async uploadDocument(
    userId: string,
    type: DocumentType,
    filename: string,
    content: Buffer,
    contentType: string
  ): Promise<Document> {
    const documentId = crypto.randomUUID();
    const key = `documents/${userId}/${type}/${documentId}/${filename}`;

    await this.upload({
      key,
      body: content,
      contentType,
      metadata: {
        userId,
        type,
        documentId,
        filename,
      },
    });

    return {
      documentId,
      userId,
      type,
      filename,
      contentType,
      size: content.length,
      status: "pending",
      uploadedAt: new Date(),
    };
  }

  /**
   * Get document download URL
   */
  async getDocumentUrl(
    userId: string,
    type: DocumentType,
    documentId: string,
    filename: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const key = `documents/${userId}/${type}/${documentId}/${filename}`;
    const result = await this.getSignedUrl({
      key,
      expiresIn,
      responseContentDisposition: `attachment; filename="${filename}"`,
    });
    return result.url;
  }

  // ==========================================================================
  // Domain-Specific: Profile Images
  // ==========================================================================

  /**
   * Upload profile image
   */
  async uploadProfileImage(
    userId: string,
    type: "avatar" | "banner",
    content: Buffer,
    contentType: string,
    size: ImageSize = "original"
  ): Promise<ProfileImage> {
    const extension = contentType.split("/")[1] ?? "jpg";
    const key = `profiles/${userId}/${type}/${size}.${extension}`;

    await this.upload({
      key,
      body: content,
      contentType,
      cacheControl: "public, max-age=31536000",
      acl: "public-read",
    });

    return {
      userId,
      type,
      size,
      url: `${this.publicUrl}/${key}`,
      uploadedAt: new Date(),
    };
  }

  // ==========================================================================
  // Domain-Specific: RWA Asset Images
  // ==========================================================================

  /**
   * Upload RWA asset image
   */
  async uploadAssetImage(
    assetId: string,
    imageIndex: number,
    type: "front" | "back" | "detail" | "certificate",
    content: Buffer,
    contentType: string
  ): Promise<AssetImage> {
    const extension = contentType.split("/")[1] ?? "jpg";
    const key = `assets/${assetId}/${type}_${imageIndex}.${extension}`;
    const thumbnailKey = `assets/${assetId}/${type}_${imageIndex}_thumb.${extension}`;

    await this.upload({
      key,
      body: content,
      contentType,
      cacheControl: "public, max-age=31536000",
    });

    // Note: Thumbnail generation would typically be done by a separate service
    // This is a placeholder for the URL

    return {
      assetId,
      imageIndex,
      type,
      url: `${this.publicUrl}/${key}`,
      thumbnailUrl: `${this.publicUrl}/${thumbnailKey}`,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get public URL for an object
   */
  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const path = `/${this.bucket}`;
      const signedHeaders = this.sign("HEAD", path, {});

      const url = this.forcePathStyle
        ? `${this.endpoint}/${this.bucket}`
        : this.getDefaultPublicUrl();

      const response = await fetch(url, {
        method: "HEAD",
        headers: signedHeaders,
      });

      return response.ok || response.status === 403; // 403 means bucket exists but no list permission
    } catch {
      return false;
    }
  }
}

export default StorageClient;
