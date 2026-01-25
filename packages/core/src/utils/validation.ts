/**
 * Validation utilities for PULL
 */

import { z } from "zod";

/**
 * Validate email format
 */
export const emailSchema = z.string().email("Invalid email format").toLowerCase();

/**
 * Validate password strength
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Validate Ethereum wallet address
 */
export const walletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");

/**
 * Validate phone number (E.164 format)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format");

/**
 * Validate username
 */
export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores"
  )
  .toLowerCase();

/**
 * Validate positive number
 */
export const positiveNumberSchema = z.number().positive("Must be a positive number");

/**
 * Validate order quantity
 */
export const quantitySchema = z
  .number()
  .positive("Quantity must be positive")
  .int("Quantity must be a whole number");

/**
 * Validate price (max 2 decimal places for USD)
 */
export const priceSchema = z
  .number()
  .positive("Price must be positive")
  .multipleOf(0.01, "Price can have at most 2 decimal places");

/**
 * Validate prediction market price (0-100 cents)
 */
export const predictionPriceSchema = z
  .number()
  .min(1, "Price must be at least 1 cent")
  .max(99, "Price must be at most 99 cents")
  .int("Price must be in whole cents");

/**
 * Validate referral code
 */
export const referralCodeSchema = z
  .string()
  .length(8, "Referral code must be 8 characters")
  .regex(/^[A-Z0-9]+$/, "Invalid referral code format")
  .toUpperCase();

/**
 * Validate pagination parameters
 */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/**
 * Validate date range
 */
export const dateRangeSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine((data) => data.end >= data.start, {
    message: "End date must be after start date",
  });

/**
 * Sanitize string input by HTML-encoding dangerous characters.
 * Prevents XSS via angle brackets, quotes, backticks, and ampersands.
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/`/g, "&#x60;");
}

/**
 * Check if value is valid UUID
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
