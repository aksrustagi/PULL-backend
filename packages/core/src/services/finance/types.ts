/**
 * Embedded Financial Services
 * Virtual cards, instant withdrawals, crypto support, and tax documents
 */

export interface VirtualCard {
  cardId: string;
  userId: string;
  cardNumber: string; // Masked
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  cvv?: string; // Only for creation
  balance: number;
  cashbackRate: number; // e.g., 0.02 for 2%
  status: 'active' | 'suspended' | 'closed';
  createdAt: Date;
}

export interface InstantWithdrawal {
  withdrawalId: string;
  userId: string;
  amount: number;
  fee: number;
  destination: WithdrawalDestination;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedArrival?: Date;
  createdAt: Date;
}

export interface WithdrawalDestination {
  type: 'bank' | 'paypal' | 'venmo' | 'crypto';
  accountId: string;
  accountName?: string;
  last4?: string;
}

export interface CryptoWallet {
  walletId: string;
  userId: string;
  walletAddress: string;
  blockchain: 'bitcoin' | 'ethereum' | 'solana' | 'polygon';
  balances: {
    btc?: number;
    eth?: number;
    usdc?: number;
    sol?: number;
  };
  connectedAt: Date;
  verified: boolean;
}

export interface TaxDocument {
  documentId: string;
  userId: string;
  taxYear: number;
  documentType: '1099-MISC' | '1099-K' | 'W-9';
  totalWinnings: number;
  totalWithheld: number;
  fileUrl: string;
  status: 'draft' | 'final' | 'amended';
  generatedAt: Date;
}

export interface AutoInvestConfig {
  configId: string;
  userId: string;
  enabled: boolean;
  percentage: number; // % of winnings to auto-invest
  minThreshold: number; // Min amount before triggering
  destination: 'savings' | 'crypto' | 'external';
  externalAccount?: string;
}

export interface DepositBonus {
  bonusId: string;
  userId: string;
  bonusAmount: number;
  wageringRequirement: number; // e.g., 3x means need to wager 3x bonus
  currentWagered: number;
  expiresAt: Date;
  status: 'active' | 'completed' | 'expired' | 'forfeited';
  createdAt: Date;
}

export interface FinanceConfig {
  stripeSecretKey?: string;
  plaidClientId?: string;
  cryptoProviders: {
    bitcoin?: string;
    ethereum?: string;
    solana?: string;
  };
  withdrawalFeesPercent: number;
  instantWithdrawalFeeFlat: number;
}
