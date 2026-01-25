/**
 * Utility functions for ID generation
 * Provides portable UUID generation that works across environments
 */

/**
 * Generate a unique ID
 * Uses crypto.randomUUID() when available, falls back to custom implementation
 */
export function generateId(prefix?: string): string {
  // Try to use native crypto.randomUUID() if available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    const uuid = crypto.randomUUID();
    return prefix ? `${prefix}_${uuid}` : uuid;
  }

  // Fallback implementation for environments without crypto.randomUUID()
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const id = `${timestamp}_${random}`;
  
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a short ID (non-UUID format)
 * Useful for display purposes or when full UUID is not needed
 */
export function generateShortId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  const id = `${timestamp}${random}`;
  
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Validate if a string is a valid UUID v4
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
