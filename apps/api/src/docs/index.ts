/**
 * OpenAPI Documentation Module
 *
 * This module provides comprehensive API documentation for the PULL Super App.
 *
 * Available exports:
 * - openApiSpec: The complete OpenAPI 3.1 specification object
 * - schemas: All Zod validation schemas for request/response types
 *
 * Documentation is served at:
 * - /docs - Swagger UI (interactive API explorer)
 * - /docs/redoc - ReDoc (alternative documentation UI)
 * - /docs/overview - HTML overview page with all endpoints
 * - /docs/openapi.json - Raw OpenAPI specification (JSON)
 * - /docs/openapi.yaml - Raw OpenAPI specification (YAML)
 */

export { openApiSpec } from "./openapi";
export type { OpenAPISpec } from "./openapi";

export * from "./schemas";
export { schemas, default as allSchemas } from "./schemas";
