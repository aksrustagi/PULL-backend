import type {
  VirtualCard,
  InstantWithdrawal,
  CryptoWallet,
  TaxDocument,
  AutoInvestConfig,
  DepositBonus,
  FinanceConfig,
  WithdrawalDestination,
} from './types';

/**
 * FinanceService - Enhanced financial services
 * Integrates with Stripe, Plaid, and crypto payment processors
 */
export class FinanceService {
  private static instance: FinanceService;
  private config: FinanceConfig;

  private constructor(config: Partial<FinanceConfig> = {}) {
    this.config = {
      stripeSecretKey: config.stripeSecretKey,
      plaidClientId: config.plaidClientId,
      cryptoProviders: config.cryptoProviders ?? {},
      withdrawalFeesPercent: config.withdrawalFeesPercent ?? 0.02,
      instantWithdrawalFeeFlat: config.instantWithdrawalFeeFlat ?? 2.99,
    };
  }

  static getInstance(config?: Partial<FinanceConfig>): FinanceService {
    if (!FinanceService.instance) {
      FinanceService.instance = new FinanceService(config);
    }
    return FinanceService.instance;
  }

  async createVirtualCard(userId: string): Promise<VirtualCard> {
    // TODO: Integration with Stripe Issuing or similar
    // 1. Create virtual card via Stripe
    // 2. Store only the Stripe token, never raw card number
    // 3. Set initial balance to 0
    // 4. Configure cashback rate based on user tier

    const cardId = `card_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    return {
      cardId,
      userId,
      stripeCardToken: `tok_${Math.random().toString(36).substring(2)}`, // Stripe token placeholder
      last4: '0000',
      expiryMonth: 12,
      expiryYear: 2025,
      balance: 0,
      cashbackRate: 0.02,
      status: 'active',
      createdAt: new Date(),
    };
  }

  async processInstantWithdrawal(
    userId: string,
    amount: number,
    destination: WithdrawalDestination
  ): Promise<InstantWithdrawal> {
    // TODO: Process instant withdrawal
    // 1. Verify user balance
    // 2. Calculate fees
    // 3. Route to appropriate provider (Stripe for bank, PayPal/Venmo APIs, crypto)
    // 4. Process withdrawal
    // 5. Update user balance

    const fee = this.config.instantWithdrawalFeeFlat + (amount * this.config.withdrawalFeesPercent);

    return {
      withdrawalId: crypto.randomUUID(),
      userId,
      amount,
      fee,
      destination,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  async connectCryptoWallet(userId: string, walletAddress: string, blockchain: CryptoWallet['blockchain']): Promise<CryptoWallet> {
    // TODO: Connect crypto wallet
    // 1. Validate wallet address format
    // 2. Optional: Request signature for ownership verification
    // 3. Save wallet connection
    // 4. Fetch balances from blockchain

    return {
      walletId: crypto.randomUUID(),
      userId,
      walletAddress,
      blockchain,
      balances: {},
      connectedAt: new Date(),
      verified: false,
    };
  }

  async generateTaxDocument(userId: string, taxYear: number): Promise<TaxDocument> {
    // TODO: Generate tax documents
    // 1. Query all winnings/deposits for year
    // 2. Calculate totals
    // 3. Generate PDF using template
    // 4. Store in secure location
    // 5. Return URL for download

    return {
      documentId: crypto.randomUUID(),
      userId,
      taxYear,
      documentType: '1099-MISC',
      totalWinnings: 0,
      totalWithheld: 0,
      fileUrl: '',
      status: 'draft',
      generatedAt: new Date(),
    };
  }

  async configureAutoInvest(userId: string, config: Partial<AutoInvestConfig>): Promise<AutoInvestConfig> {
    // TODO: Configure auto-invest
    // When user wins, automatically invest % into savings/crypto/external account

    return {
      configId: crypto.randomUUID(),
      userId,
      enabled: config.enabled ?? false,
      percentage: config.percentage ?? 10,
      minThreshold: config.minThreshold ?? 100,
      destination: config.destination ?? 'savings',
      externalAccount: config.externalAccount,
    };
  }

  async applyDepositBonus(userId: string, depositAmount: number): Promise<DepositBonus | null> {
    // TODO: Apply deposit bonus with wagering requirements
    // E.g., "100% match up to $100, 3x wagering"
    // User deposits $50, gets $50 bonus, needs to wager $150 before withdrawing

    return null;
  }

  async getCryptoBalance(walletId: string): Promise<CryptoWallet['balances']> {
    // TODO: Fetch current crypto balances from blockchain
    return {};
  }

  private calculateWithdrawalFee(amount: number, destination: WithdrawalDestination): number {
    // Different fees for different destinations
    if (destination.type === 'crypto') {
      return 0; // Or network gas fee
    }
    return this.config.instantWithdrawalFeeFlat + (amount * this.config.withdrawalFeesPercent);
  }
}

export const financeService = FinanceService.getInstance();
