/**
 * Email Service for PULL API
 * Handles sending authentication-related emails using SendGrid or similar
 */

// Email configuration from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL ?? "noreply@pull.app";
const FROM_NAME = process.env.FROM_NAME ?? "PULL";
const APP_URL = process.env.APP_URL ?? "https://pull.app";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email via SendGrid
 */
async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.warn("[Email] SendGrid not configured. Email not sent:", options.subject);
    // In development, log the email content
    console.log("[Email] Would have sent:", JSON.stringify(options, null, 2));
    return true; // Return true in dev to not block flows
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: options.subject,
        content: [
          ...(options.text ? [{ type: "text/plain", value: options.text }] : []),
          { type: "text/html", value: options.html },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Email] SendGrid error:", error);
      return false;
    }

    console.log(`[Email] Sent "${options.subject}" to ${options.to}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  displayName?: string
): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
  const greeting = displayName ? `Hi ${displayName}` : "Hi there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">PULL</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Verify your email address</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${greeting},</p>

    <p style="font-size: 16px;">Welcome to PULL! Please verify your email address by clicking the button below:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email</a>
    </div>

    <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 14px; color: #667eea; word-break: break-all;">${verifyUrl}</p>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">This link expires in 24 hours. If you didn't create an account with PULL, you can safely ignore this email.</p>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} PULL. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting},

Welcome to PULL! Please verify your email address by clicking the link below:

${verifyUrl}

This link expires in 24 hours.

If you didn't create an account with PULL, you can safely ignore this email.

- The PULL Team
  `.trim();

  return sendEmail({
    to: email,
    subject: "Verify your PULL account",
    html,
    text,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  displayName?: string
): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const greeting = displayName ? `Hi ${displayName}` : "Hi there";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">PULL</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Password Reset Request</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${greeting},</p>

    <p style="font-size: 16px;">We received a request to reset your password. Click the button below to create a new password:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
    </div>

    <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 14px; color: #667eea; word-break: break-all;">${resetUrl}</p>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will not be changed.</p>

    <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin-top: 20px;">
      <p style="font-size: 14px; color: #856404; margin: 0;"><strong>Security tip:</strong> PULL will never ask for your password via email. If you receive suspicious emails, please report them to security@pull.app</p>
    </div>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} PULL. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting},

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link expires in 1 hour.

If you didn't request a password reset, you can safely ignore this email - your password will not be changed.

Security tip: PULL will never ask for your password via email. If you receive suspicious emails, please report them to security@pull.app

- The PULL Team
  `.trim();

  return sendEmail({
    to: email,
    subject: "Reset your PULL password",
    html,
    text,
  });
}

/**
 * Send password changed confirmation email
 */
export async function sendPasswordChangedEmail(
  email: string,
  displayName?: string
): Promise<boolean> {
  const greeting = displayName ? `Hi ${displayName}` : "Hi there";
  const supportUrl = `${APP_URL}/support`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password changed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">PULL</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Security Notice</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px;">${greeting},</p>

    <p style="font-size: 16px;">Your password has been successfully changed. If you made this change, no further action is required.</p>

    <div style="background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <p style="font-size: 14px; color: #721c24; margin: 0;"><strong>Didn't make this change?</strong> If you did not change your password, please contact our support team immediately at <a href="${supportUrl}" style="color: #721c24;">support</a> or reply to this email.</p>
    </div>

    <p style="font-size: 14px; color: #666;">For your security, we recommend:</p>
    <ul style="font-size: 14px; color: #666;">
      <li>Using a unique password for PULL</li>
      <li>Enabling two-factor authentication</li>
      <li>Never sharing your credentials</li>
    </ul>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} PULL. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting},

Your password has been successfully changed. If you made this change, no further action is required.

Didn't make this change? If you did not change your password, please contact our support team immediately.

For your security, we recommend:
- Using a unique password for PULL
- Enabling two-factor authentication
- Never sharing your credentials

- The PULL Team
  `.trim();

  return sendEmail({
    to: email,
    subject: "Your PULL password has been changed",
    html,
    text,
  });
}

/**
 * Send welcome email after email verification
 */
export async function sendWelcomeEmail(
  email: string,
  displayName?: string
): Promise<boolean> {
  const greeting = displayName ? `Welcome, ${displayName}!` : "Welcome!";
  const loginUrl = `${APP_URL}/login`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to PULL</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">PULL</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your email is verified!</p>
  </div>

  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 20px; font-weight: 600;">${greeting}</p>

    <p style="font-size: 16px;">Your email has been verified and your PULL account is now active. You're ready to start trading, investing, and earning rewards!</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${loginUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">Get Started</a>
    </div>

    <p style="font-size: 16px; font-weight: 600;">What you can do with PULL:</p>
    <ul style="font-size: 14px; color: #666;">
      <li>Trade crypto with zero fees</li>
      <li>Make predictions on real-world events</li>
      <li>Invest in tokenized real estate</li>
      <li>Earn rewards and climb the leaderboard</li>
    </ul>

    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; text-align: center;">
      &copy; ${new Date().getFullYear()} PULL. All rights reserved.
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting}

Your email has been verified and your PULL account is now active. You're ready to start trading, investing, and earning rewards!

What you can do with PULL:
- Trade crypto with zero fees
- Make predictions on real-world events
- Invest in tokenized real estate
- Earn rewards and climb the leaderboard

Get started: ${loginUrl}

- The PULL Team
  `.trim();

  return sendEmail({
    to: email,
    subject: "Welcome to PULL - Your account is ready!",
    html,
    text,
  });
}
