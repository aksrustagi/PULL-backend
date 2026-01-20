/**
 * Password Hashing Utilities for PULL API
 * Uses Argon2id for secure password hashing
 */

// Note: In production, use argon2 npm package
// For Bun runtime, we use the built-in password hashing

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  // Use Bun's built-in password hashing if available
  if (typeof Bun !== "undefined" && Bun.password) {
    return await Bun.password.hash(password, {
      algorithm: "argon2id",
      memoryCost: 65536, // 64 MB
      timeCost: 3,
    });
  }

  // Fallback for Node.js - use bcrypt-compatible hashing via Web Crypto
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const data = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    "raw",
    data,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));

  return `$pbkdf2-sha256$100000$${saltBase64}$${hashBase64}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  // Use Bun's built-in password verification if available
  if (typeof Bun !== "undefined" && Bun.password) {
    return await Bun.password.verify(password, hash);
  }

  // Fallback for PBKDF2 hashes
  if (hash.startsWith("$pbkdf2-sha256$")) {
    const parts = hash.split("$");
    if (parts.length !== 5) return false;

    const iterations = parseInt(parts[2]!, 10);
    const saltBase64 = parts[3]!;
    const expectedHashBase64 = parts[4]!;

    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const data = encoder.encode(password);

    const key = await crypto.subtle.importKey(
      "raw",
      data,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      key,
      256
    );

    const hashArray = new Uint8Array(derivedBits);
    const computedHashBase64 = btoa(String.fromCharCode(...hashArray));

    return computedHashBase64 === expectedHashBase64;
  }

  // Handle argon2 hashes if argon2 package is available
  try {
    const argon2 = await import("argon2");
    return await argon2.verify(hash, password);
  } catch {
    // argon2 not available
    return false;
  }
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a short numeric OTP
 */
export function generateOTP(length: number = 6): string {
  const digits = "0123456789";
  let otp = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) {
    otp += digits[bytes[i]! % 10];
  }
  return otp;
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (password.length > 128) {
    errors.push("Password must be less than 128 characters");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check for common passwords (simplified list)
  const commonPasswords = [
    "password",
    "123456",
    "12345678",
    "qwerty",
    "abc123",
    "password1",
  ];
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push("Password is too common");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
