/**
 * Email Templates for PULL
 * React Email-inspired HTML templates for transactional emails
 */

// ============================================================================
// Shared Styles and Components
// ============================================================================

const BRAND_COLOR = "#0066ff";
const BRAND_NAME = "PULL";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://app.pull.com";

const baseStyles = {
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  backgroundColor: "#f5f5f5",
  padding: "40px 20px",
};

const containerStyles = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "40px",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
};

const buttonStyles = {
  display: "inline-block",
  backgroundColor: BRAND_COLOR,
  color: "#ffffff",
  padding: "14px 28px",
  textDecoration: "none",
  borderRadius: "6px",
  fontWeight: "600",
  fontSize: "16px",
};

const footerStyles = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "1.5",
  marginTop: "32px",
  paddingTop: "32px",
  borderTop: "1px solid #eeeeee",
};

// ============================================================================
// Template Helper Functions
// ============================================================================

function createEmailWrapper(content: string, preheader?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${BRAND_NAME}</title>
  ${preheader ? `<span style="display: none; max-height: 0; overflow: hidden;">${preheader}</span>` : ""}
  <style>
    @media only screen and (max-width: 600px) {
      .container { padding: 20px !important; }
      .content { padding: 24px !important; }
    }
  </style>
</head>
<body style="font-family: ${baseStyles.fontFamily}; padding: ${baseStyles.padding}; background-color: ${baseStyles.backgroundColor}; margin: 0;">
  <div class="container" style="max-width: ${containerStyles.maxWidth}; margin: ${containerStyles.margin}; background-color: ${containerStyles.backgroundColor}; border-radius: ${containerStyles.borderRadius}; padding: ${containerStyles.padding}; box-shadow: ${containerStyles.boxShadow};">
    ${content}
    <div style="${Object.entries(footerStyles).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}">
      <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
      <p style="margin: 0;">
        <a href="${FRONTEND_URL}/unsubscribe?email={{email}}" style="color: #999999;">Unsubscribe</a> |
        <a href="${FRONTEND_URL}/preferences" style="color: #999999;">Email Preferences</a> |
        <a href="${FRONTEND_URL}/help" style="color: #999999;">Help Center</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function createButton(text: string, href: string): string {
  return `<a href="${href}" style="display: ${buttonStyles.display}; background-color: ${buttonStyles.backgroundColor}; color: ${buttonStyles.color}; padding: ${buttonStyles.padding}; text-decoration: ${buttonStyles.textDecoration}; border-radius: ${buttonStyles.borderRadius}; font-weight: ${buttonStyles.fontWeight}; font-size: ${buttonStyles.fontSize};">${text}</a>`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ============================================================================
// Email Template Types
// ============================================================================

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface WelcomeEmailData {
  userName: string;
  email: string;
}

export interface VerificationEmailData {
  email: string;
  token: string;
  userName?: string;
}

export interface PasswordResetEmailData {
  email: string;
  token: string;
  userName?: string;
  expiresIn?: string;
}

export interface OrderConfirmationEmailData {
  email: string;
  userName: string;
  orderId: string;
  marketName: string;
  outcome: string;
  side: "buy" | "sell";
  quantity: number;
  pricePerContract: number;
  totalCost: number;
  filledAt: string;
}

export interface WinNotificationEmailData {
  email: string;
  userName: string;
  marketName: string;
  outcome: string;
  quantity: number;
  winnings: number;
  resolvedAt: string;
}

export interface DepositConfirmationEmailData {
  email: string;
  userName: string;
  amount: number;
  method: string;
  transactionId: string;
  newBalance: number;
  depositedAt: string;
}

export interface WithdrawalConfirmationEmailData {
  email: string;
  userName: string;
  amount: number;
  method: string;
  destination: string;
  transactionId: string;
  estimatedArrival: string;
  withdrawnAt: string;
}

export interface WeeklyDigestEmailData {
  email: string;
  userName: string;
  weekStartDate: string;
  weekEndDate: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  netPnL: number;
  topWin?: { market: string; amount: number };
  openPositions: number;
  portfolioValue: number;
  trendingMarkets: Array<{ name: string; volume: number }>;
}

// ============================================================================
// Welcome Email
// ============================================================================

export function welcomeEmail(data: WelcomeEmailData): EmailTemplate {
  const { userName } = data;

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: ${BRAND_COLOR}; font-size: 32px; margin: 0 0 8px 0;">${BRAND_NAME}</h1>
    </div>

    <h1 style="color: #1a1a1a; font-size: 28px; margin: 0 0 24px 0;">Welcome to ${BRAND_NAME}, ${userName}!</h1>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We're thrilled to have you join our prediction markets community. You now have access to trade on thousands of events across politics, sports, entertainment, and more.
    </p>

    <h2 style="color: #1a1a1a; font-size: 18px; margin: 24px 0 16px 0;">Get started in 3 easy steps:</h2>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; margin-bottom: 16px;">
        <div style="width: 32px; height: 32px; background: ${BRAND_COLOR}; color: white; border-radius: 50%; text-align: center; line-height: 32px; font-weight: bold; margin-right: 16px; flex-shrink: 0;">1</div>
        <div>
          <strong style="color: #1a1a1a;">Complete verification</strong>
          <p style="color: #6a6a6a; margin: 4px 0 0 0; font-size: 14px;">Verify your identity to unlock all trading features</p>
        </div>
      </div>
      <div style="display: flex; margin-bottom: 16px;">
        <div style="width: 32px; height: 32px; background: ${BRAND_COLOR}; color: white; border-radius: 50%; text-align: center; line-height: 32px; font-weight: bold; margin-right: 16px; flex-shrink: 0;">2</div>
        <div>
          <strong style="color: #1a1a1a;">Fund your account</strong>
          <p style="color: #6a6a6a; margin: 4px 0 0 0; font-size: 14px;">Add funds via bank transfer, card, or crypto</p>
        </div>
      </div>
      <div style="display: flex;">
        <div style="width: 32px; height: 32px; background: ${BRAND_COLOR}; color: white; border-radius: 50%; text-align: center; line-height: 32px; font-weight: bold; margin-right: 16px; flex-shrink: 0;">3</div>
        <div>
          <strong style="color: #1a1a1a;">Start trading</strong>
          <p style="color: #6a6a6a; margin: 4px 0 0 0; font-size: 14px;">Browse markets and make your first prediction</p>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("Explore Markets", `${FRONTEND_URL}/markets`)}
    </div>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5;">
      Have questions? Our support team is here to help 24/7. Just reply to this email or visit our <a href="${FRONTEND_URL}/help" style="color: ${BRAND_COLOR};">Help Center</a>.
    </p>
  `, `Welcome to ${BRAND_NAME}! Start trading on prediction markets today.`);

  const text = `
Welcome to ${BRAND_NAME}, ${userName}!

We're thrilled to have you join our prediction markets community. You now have access to trade on thousands of events across politics, sports, entertainment, and more.

Get started in 3 easy steps:

1. Complete verification - Verify your identity to unlock all trading features
2. Fund your account - Add funds via bank transfer, card, or crypto
3. Start trading - Browse markets and make your first prediction

Explore Markets: ${FRONTEND_URL}/markets

Have questions? Our support team is here to help 24/7. Visit our Help Center at ${FRONTEND_URL}/help

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Welcome to ${BRAND_NAME} - Let's get started!`,
    html,
    text,
  };
}

// ============================================================================
// Verification Email
// ============================================================================

export function verificationEmail(data: VerificationEmailData): EmailTemplate {
  const { token, userName } = data;
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = userName ? `Hi ${userName},` : "Hi there,";

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #e3f2fd; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px;">&#9993;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 24px 0; text-align: center;">Verify your email address</h1>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      ${greeting}
    </p>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Thanks for signing up for ${BRAND_NAME}! Please verify your email address by clicking the button below.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("Verify Email Address", verifyUrl)}
    </div>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5; margin: 24px 0;">
      Or copy and paste this link into your browser:
    </p>
    <p style="color: ${BRAND_COLOR}; font-size: 14px; word-break: break-all; background: #f8f9fa; padding: 12px; border-radius: 4px;">
      ${verifyUrl}
    </p>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5; margin: 24px 0 0 0;">
      This link will expire in 24 hours. If you didn't create an account with ${BRAND_NAME}, you can safely ignore this email.
    </p>
  `, `Verify your email to complete your ${BRAND_NAME} registration.`);

  const text = `
Verify your email address

${greeting}

Thanks for signing up for ${BRAND_NAME}! Please verify your email address by visiting the link below:

${verifyUrl}

This link will expire in 24 hours. If you didn't create an account with ${BRAND_NAME}, you can safely ignore this email.

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Verify your ${BRAND_NAME} email address`,
    html,
    text,
  };
}

// ============================================================================
// Password Reset Email
// ============================================================================

export function passwordResetEmail(data: PasswordResetEmailData): EmailTemplate {
  const { token, userName, expiresIn = "1 hour" } = data;
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = userName ? `Hi ${userName},` : "Hi there,";

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #fff3e0; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px;">&#128274;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 24px 0; text-align: center;">Reset your password</h1>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      ${greeting}
    </p>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      We received a request to reset the password for your ${BRAND_NAME} account. Click the button below to create a new password.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("Reset Password", resetUrl)}
    </div>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5; margin: 24px 0;">
      Or copy and paste this link into your browser:
    </p>
    <p style="color: ${BRAND_COLOR}; font-size: 14px; word-break: break-all; background: #f8f9fa; padding: 12px; border-radius: 4px;">
      ${resetUrl}
    </p>

    <div style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 0 4px 4px 0;">
      <p style="color: #856404; font-size: 14px; margin: 0;">
        <strong>Security note:</strong> This link expires in ${expiresIn}. If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security.
      </p>
    </div>
  `, `Reset your ${BRAND_NAME} password`);

  const text = `
Reset your password

${greeting}

We received a request to reset the password for your ${BRAND_NAME} account. Visit the link below to create a new password:

${resetUrl}

This link expires in ${expiresIn}. If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security.

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Reset your ${BRAND_NAME} password`,
    html,
    text,
  };
}

// ============================================================================
// Order Confirmation Email
// ============================================================================

export function orderConfirmationEmail(data: OrderConfirmationEmailData): EmailTemplate {
  const {
    userName,
    orderId,
    marketName,
    outcome,
    side,
    quantity,
    pricePerContract,
    totalCost,
    filledAt,
  } = data;

  const actionText = side === "buy" ? "Bought" : "Sold";
  const actionColor = side === "buy" ? "#28a745" : "#dc3545";

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #e8f5e9; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px; color: #28a745;">&#10003;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 8px 0; text-align: center;">Order Confirmed</h1>
    <p style="color: #6a6a6a; font-size: 14px; text-align: center; margin: 0 0 32px 0;">Order ID: ${orderId}</p>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Hi ${userName}, your order has been successfully filled.
    </p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
      <div style="margin-bottom: 16px;">
        <span style="display: inline-block; background: ${actionColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
          ${actionText}
        </span>
      </div>

      <h3 style="color: #1a1a1a; font-size: 18px; margin: 0 0 8px 0;">${marketName}</h3>
      <p style="color: ${BRAND_COLOR}; font-size: 16px; font-weight: 600; margin: 0;">${outcome}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Contracts</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right; font-weight: 600;">${quantity}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Price per Contract</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${formatCurrency(pricePerContract)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Total</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right; font-weight: 600; font-size: 18px;">${formatCurrency(totalCost)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6a6a6a;">Filled At</td>
        <td style="padding: 12px 0; color: #1a1a1a; text-align: right;">${formatDate(filledAt)}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("View Position", `${FRONTEND_URL}/portfolio`)}
    </div>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5; text-align: center;">
      Track this position and all your trades in your <a href="${FRONTEND_URL}/portfolio" style="color: ${BRAND_COLOR};">portfolio</a>.
    </p>
  `, `Order confirmed: ${actionText} ${quantity} contracts on ${marketName}`);

  const text = `
Order Confirmed

Order ID: ${orderId}

Hi ${userName}, your order has been successfully filled.

${actionText.toUpperCase()}
${marketName}
${outcome}

Contracts: ${quantity}
Price per Contract: ${formatCurrency(pricePerContract)}
Total: ${formatCurrency(totalCost)}
Filled At: ${formatDate(filledAt)}

View your position: ${FRONTEND_URL}/portfolio

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Order Confirmed - ${actionText} ${quantity} contracts`,
    html,
    text,
  };
}

// ============================================================================
// Win Notification Email
// ============================================================================

export function winNotificationEmail(data: WinNotificationEmailData): EmailTemplate {
  const { userName, marketName, outcome, quantity, winnings, resolvedAt } = data;

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #ffd700 0%, #ffb300 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(255, 179, 0, 0.4);">
        <span style="font-size: 40px;">&#127942;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 28px; margin: 0 0 8px 0; text-align: center;">Congratulations!</h1>
    <p style="color: #28a745; font-size: 32px; font-weight: 700; text-align: center; margin: 0 0 32px 0;">
      You won ${formatCurrency(winnings)}
    </p>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Great call, ${userName}! Your prediction on <strong>${marketName}</strong> was correct.
    </p>

    <div style="background: linear-gradient(135deg, #f0fff4 0%, #e8f5e9 100%); border: 1px solid #c8e6c9; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
      <h3 style="color: #1a1a1a; font-size: 18px; margin: 0 0 16px 0;">Winning Position</h3>

      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6a6a6a;">Market</td>
          <td style="padding: 8px 0; color: #1a1a1a; text-align: right; font-weight: 500;">${marketName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6a6a6a;">Outcome</td>
          <td style="padding: 8px 0; color: #28a745; text-align: right; font-weight: 600;">${outcome}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6a6a6a;">Contracts</td>
          <td style="padding: 8px 0; color: #1a1a1a; text-align: right;">${quantity}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6a6a6a;">Resolved</td>
          <td style="padding: 8px 0; color: #1a1a1a; text-align: right;">${formatDate(resolvedAt)}</td>
        </tr>
      </table>
    </div>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
      <p style="color: #6a6a6a; font-size: 14px; margin: 0 0 8px 0;">Winnings credited to your account</p>
      <p style="color: #28a745; font-size: 28px; font-weight: 700; margin: 0;">${formatCurrency(winnings)}</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("Find More Markets", `${FRONTEND_URL}/markets`)}
    </div>
  `, `You won ${formatCurrency(winnings)} on ${marketName}!`);

  const text = `
Congratulations, ${userName}!

You won ${formatCurrency(winnings)}

Your prediction on ${marketName} was correct!

Winning Position:
- Market: ${marketName}
- Outcome: ${outcome}
- Contracts: ${quantity}
- Resolved: ${formatDate(resolvedAt)}

Winnings have been credited to your account.

Find more markets: ${FRONTEND_URL}/markets

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `You won ${formatCurrency(winnings)}!`,
    html,
    text,
  };
}

// ============================================================================
// Deposit Confirmation Email
// ============================================================================

export function depositConfirmationEmail(data: DepositConfirmationEmailData): EmailTemplate {
  const { userName, amount, method, transactionId, newBalance, depositedAt } = data;

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #e8f5e9; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px; color: #28a745;">&#10003;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 24px 0; text-align: center;">Deposit Received</h1>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Hi ${userName}, we've received your deposit and it has been credited to your account.
    </p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
      <p style="color: #6a6a6a; font-size: 14px; margin: 0 0 8px 0;">Amount Deposited</p>
      <p style="color: #28a745; font-size: 36px; font-weight: 700; margin: 0;">${formatCurrency(amount)}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Payment Method</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${method}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Transaction ID</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right; font-family: monospace; font-size: 12px;">${transactionId}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Date</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${formatDate(depositedAt)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6a6a6a;">New Balance</td>
        <td style="padding: 12px 0; color: ${BRAND_COLOR}; text-align: right; font-weight: 600; font-size: 18px;">${formatCurrency(newBalance)}</td>
      </tr>
    </table>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("Start Trading", `${FRONTEND_URL}/markets`)}
    </div>

    <p style="color: #6a6a6a; font-size: 14px; line-height: 1.5; text-align: center;">
      Your funds are now available. Browse markets and start making predictions!
    </p>
  `, `Your ${formatCurrency(amount)} deposit has been received`);

  const text = `
Deposit Received

Hi ${userName}, we've received your deposit and it has been credited to your account.

Amount Deposited: ${formatCurrency(amount)}

Details:
- Payment Method: ${method}
- Transaction ID: ${transactionId}
- Date: ${formatDate(depositedAt)}
- New Balance: ${formatCurrency(newBalance)}

Your funds are now available. Start trading: ${FRONTEND_URL}/markets

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Deposit Confirmed: ${formatCurrency(amount)}`,
    html,
    text,
  };
}

// ============================================================================
// Withdrawal Confirmation Email
// ============================================================================

export function withdrawalConfirmationEmail(data: WithdrawalConfirmationEmailData): EmailTemplate {
  const { userName, amount, method, destination, transactionId, estimatedArrival, withdrawnAt } = data;

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #e3f2fd; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
        <span style="font-size: 32px;">&#128176;</span>
      </div>
    </div>

    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0 0 24px 0; text-align: center;">Withdrawal Processed</h1>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Hi ${userName}, your withdrawal request has been processed and funds are on their way.
    </p>

    <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
      <p style="color: #6a6a6a; font-size: 14px; margin: 0 0 8px 0;">Amount Withdrawn</p>
      <p style="color: #1a1a1a; font-size: 36px; font-weight: 700; margin: 0;">${formatCurrency(amount)}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Withdrawal Method</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${method}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Destination</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${destination}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Transaction ID</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right; font-family: monospace; font-size: 12px;">${transactionId}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #6a6a6a;">Processed On</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #1a1a1a; text-align: right;">${formatDate(withdrawnAt)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6a6a6a;">Estimated Arrival</td>
        <td style="padding: 12px 0; color: ${BRAND_COLOR}; text-align: right; font-weight: 600;">${estimatedArrival}</td>
      </tr>
    </table>

    <div style="background: #fff8e1; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 0 4px 4px 0;">
      <p style="color: #856404; font-size: 14px; margin: 0;">
        <strong>Note:</strong> Arrival times may vary based on your bank or payment provider. If you don't see the funds within the estimated timeframe, please contact your financial institution.
      </p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("View Transaction History", `${FRONTEND_URL}/wallet/history`)}
    </div>
  `, `Your ${formatCurrency(amount)} withdrawal is on its way`);

  const text = `
Withdrawal Processed

Hi ${userName}, your withdrawal request has been processed and funds are on their way.

Amount Withdrawn: ${formatCurrency(amount)}

Details:
- Withdrawal Method: ${method}
- Destination: ${destination}
- Transaction ID: ${transactionId}
- Processed On: ${formatDate(withdrawnAt)}
- Estimated Arrival: ${estimatedArrival}

Note: Arrival times may vary based on your bank or payment provider.

View transaction history: ${FRONTEND_URL}/wallet/history

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Withdrawal Processed: ${formatCurrency(amount)}`,
    html,
    text,
  };
}

// ============================================================================
// Weekly Digest Email
// ============================================================================

export function weeklyDigestEmail(data: WeeklyDigestEmailData): EmailTemplate {
  const {
    userName,
    weekStartDate,
    weekEndDate,
    totalTrades,
    winningTrades,
    losingTrades,
    netPnL,
    topWin,
    openPositions,
    portfolioValue,
    trendingMarkets,
  } = data;

  const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
  const pnlColor = netPnL >= 0 ? "#28a745" : "#dc3545";
  const pnlPrefix = netPnL >= 0 ? "+" : "";

  const html = createEmailWrapper(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h2 style="color: #6a6a6a; font-size: 14px; font-weight: 400; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Weekly Digest</h2>
      <h1 style="color: #1a1a1a; font-size: 20px; margin: 0;">${weekStartDate} - ${weekEndDate}</h1>
    </div>

    <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
      Hi ${userName}, here's your weekly trading summary.
    </p>

    <!-- Performance Summary -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; color: white;">
      <h3 style="margin: 0 0 16px 0; font-size: 16px; opacity: 0.9;">Your Week at a Glance</h3>
      <div style="display: flex; justify-content: space-between; text-align: center;">
        <div style="flex: 1;">
          <p style="font-size: 28px; font-weight: 700; margin: 0;">${totalTrades}</p>
          <p style="font-size: 12px; opacity: 0.8; margin: 4px 0 0 0;">Total Trades</p>
        </div>
        <div style="flex: 1;">
          <p style="font-size: 28px; font-weight: 700; margin: 0;">${winRate}%</p>
          <p style="font-size: 12px; opacity: 0.8; margin: 4px 0 0 0;">Win Rate</p>
        </div>
        <div style="flex: 1;">
          <p style="font-size: 28px; font-weight: 700; margin: 0;">${pnlPrefix}${formatCurrency(netPnL)}</p>
          <p style="font-size: 12px; opacity: 0.8; margin: 4px 0 0 0;">Net P&L</p>
        </div>
      </div>
    </div>

    <!-- Trade Breakdown -->
    <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="color: #1a1a1a; font-size: 16px; margin: 0 0 16px 0;">Trade Breakdown</h3>
      <div style="display: flex; gap: 16px;">
        <div style="flex: 1; text-align: center; padding: 16px; background: white; border-radius: 8px;">
          <p style="color: #28a745; font-size: 24px; font-weight: 600; margin: 0;">${winningTrades}</p>
          <p style="color: #6a6a6a; font-size: 12px; margin: 4px 0 0 0;">Winning</p>
        </div>
        <div style="flex: 1; text-align: center; padding: 16px; background: white; border-radius: 8px;">
          <p style="color: #dc3545; font-size: 24px; font-weight: 600; margin: 0;">${losingTrades}</p>
          <p style="color: #6a6a6a; font-size: 12px; margin: 4px 0 0 0;">Losing</p>
        </div>
        <div style="flex: 1; text-align: center; padding: 16px; background: white; border-radius: 8px;">
          <p style="color: ${BRAND_COLOR}; font-size: 24px; font-weight: 600; margin: 0;">${openPositions}</p>
          <p style="color: #6a6a6a; font-size: 12px; margin: 4px 0 0 0;">Open</p>
        </div>
      </div>
    </div>

    ${topWin ? `
    <!-- Top Win -->
    <div style="background: linear-gradient(135deg, #f0fff4 0%, #e8f5e9 100%); border: 1px solid #c8e6c9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h3 style="color: #1a1a1a; font-size: 16px; margin: 0 0 12px 0;">Best Trade This Week</h3>
      <p style="color: #4a4a4a; margin: 0 0 8px 0;">${topWin.market}</p>
      <p style="color: #28a745; font-size: 24px; font-weight: 700; margin: 0;">+${formatCurrency(topWin.amount)}</p>
    </div>
    ` : ""}

    <!-- Portfolio Value -->
    <div style="text-align: center; padding: 24px; border: 2px solid #eee; border-radius: 8px; margin-bottom: 24px;">
      <p style="color: #6a6a6a; font-size: 14px; margin: 0 0 8px 0;">Current Portfolio Value</p>
      <p style="color: #1a1a1a; font-size: 32px; font-weight: 700; margin: 0;">${formatCurrency(portfolioValue)}</p>
    </div>

    ${trendingMarkets.length > 0 ? `
    <!-- Trending Markets -->
    <div style="margin-bottom: 24px;">
      <h3 style="color: #1a1a1a; font-size: 16px; margin: 0 0 16px 0;">Trending Markets</h3>
      ${trendingMarkets.slice(0, 3).map((market, index) => `
        <div style="display: flex; align-items: center; padding: 12px; background: ${index % 2 === 0 ? '#f8f9fa' : 'white'}; border-radius: 4px; margin-bottom: 4px;">
          <span style="color: #6a6a6a; font-size: 14px; width: 24px;">${index + 1}.</span>
          <span style="color: #1a1a1a; flex: 1;">${market.name}</span>
          <span style="color: #6a6a6a; font-size: 12px;">${formatCurrency(market.volume)} vol</span>
        </div>
      `).join("")}
    </div>
    ` : ""}

    <div style="text-align: center; margin: 32px 0;">
      ${createButton("View Full Report", `${FRONTEND_URL}/portfolio/analytics`)}
    </div>
  `, `Your weekly trading summary: ${pnlPrefix}${formatCurrency(netPnL)} P&L`);

  const text = `
Weekly Digest: ${weekStartDate} - ${weekEndDate}

Hi ${userName}, here's your weekly trading summary.

YOUR WEEK AT A GLANCE
- Total Trades: ${totalTrades}
- Win Rate: ${winRate}%
- Net P&L: ${pnlPrefix}${formatCurrency(netPnL)}

TRADE BREAKDOWN
- Winning: ${winningTrades}
- Losing: ${losingTrades}
- Open Positions: ${openPositions}

${topWin ? `BEST TRADE THIS WEEK
${topWin.market}
+${formatCurrency(topWin.amount)}

` : ""}CURRENT PORTFOLIO VALUE
${formatCurrency(portfolioValue)}

${trendingMarkets.length > 0 ? `TRENDING MARKETS
${trendingMarkets.slice(0, 3).map((market, index) => `${index + 1}. ${market.name} (${formatCurrency(market.volume)} vol)`).join("\n")}

` : ""}View full report: ${FRONTEND_URL}/portfolio/analytics

---
(c) ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
`;

  return {
    subject: `Your Weekly Digest: ${pnlPrefix}${formatCurrency(netPnL)} P&L`,
    html,
    text,
  };
}

// ============================================================================
// Export All Templates
// ============================================================================

export const emailTemplates = {
  welcome: welcomeEmail,
  verification: verificationEmail,
  passwordReset: passwordResetEmail,
  orderConfirmation: orderConfirmationEmail,
  winNotification: winNotificationEmail,
  depositConfirmation: depositConfirmationEmail,
  withdrawalConfirmation: withdrawalConfirmationEmail,
  weeklyDigest: weeklyDigestEmail,
};

export type EmailTemplateType = keyof typeof emailTemplates;

export default emailTemplates;
