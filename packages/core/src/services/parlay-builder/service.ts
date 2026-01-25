/**
 * Parlay Builder Service
 * Build, validate, and manage parlays with real-time odds
 */

import type {
  Parlay,
  ParlayLeg,
  ParlayStatus,
  LegStatus,
  BetType,
  ParlayCard,
  AISuggestion,
  SuggestionCategory,
  OddsBoost,
  CreateParlayRequest,
  AddLegRequest,
  UpdateParlayRequest,
  SubmitParlayRequest,
  CashoutRequest,
  GenerateCardRequest,
  GetSuggestionsRequest,
  ParlayOddsResponse,
  ParlayValidation,
} from "./types";
import { ParlayOddsCalculator, OddsConverter, createOddsCalculator } from "./odds";
import { ParlayCardGenerator, createParlayCardGenerator } from "./cards";

// ============================================================================
// MOCK DATA - In production, fetch from odds API
// ============================================================================

interface EventOdds {
  eventId: string;
  eventName: string;
  sport: string;
  league: string;
  startTime: number;
  markets: Array<{
    type: BetType;
    selections: Array<{
      name: string;
      details: string;
      line?: number;
      odds: number;
    }>;
  }>;
}

// ============================================================================
// PARLAY BUILDER SERVICE
// ============================================================================

export class ParlayBuilderService {
  private parlays: Map<string, Parlay> = new Map();
  private cards: Map<string, ParlayCard> = new Map();
  private suggestions: Map<string, AISuggestion[]> = new Map();
  private oddsBoosts: Map<string, OddsBoost> = new Map();

  private calculator: ParlayOddsCalculator;
  private cardGenerator: ParlayCardGenerator;

  constructor() {
    this.calculator = createOddsCalculator();
    this.cardGenerator = createParlayCardGenerator();
    this.initializeOddsBoosts();
  }

  // ==========================================================================
  // PARLAY BUILDING
  // ==========================================================================

  /**
   * Create a new parlay
   */
  async createParlay(userId: string, request: CreateParlayRequest): Promise<Parlay> {
    const parlayId = `parlay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build legs from requests
    const legs: ParlayLeg[] = [];
    for (const legRequest of request.legs) {
      const leg = await this.buildLeg(legRequest);
      legs.push(leg);
    }

    // Calculate combined odds
    const oddsResult = this.calculator.calculateParlayOdds(legs, request.stake ?? 0);

    const parlay: Parlay = {
      id: parlayId,
      userId,
      legs,
      legCount: legs.length,
      combinedOdds: oddsResult.combinedOdds,
      combinedDecimalOdds: oddsResult.decimalOdds,
      impliedProbability: oddsResult.impliedProbability,
      stake: request.stake ?? 0,
      potentialPayout: oddsResult.potentialPayout,
      parlayBonus: oddsResult.parlayBonus,
      insuranceEligible: legs.length >= 4,
      insuranceApplied: false,
      status: "building",
      settledLegs: 0,
      wonLegs: 0,
      lostLegs: 0,
      pushedLegs: 0,
      cashoutAvailable: false,
      isPublic: request.isPublic ?? false,
      aiSuggested: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.parlays.set(parlayId, parlay);
    return parlay;
  }

  /**
   * Add a leg to existing parlay
   */
  async addLeg(parlayId: string, request: AddLegRequest): Promise<Parlay> {
    const parlay = this.parlays.get(parlayId);
    if (!parlay) throw new Error("Parlay not found");
    if (parlay.status !== "building") throw new Error("Cannot modify submitted parlay");

    // Validate max legs
    if (parlay.legs.length >= 15) {
      throw new Error("Maximum 15 legs allowed");
    }

    // Check for duplicate selection
    const isDuplicate = parlay.legs.some(
      (leg) => leg.eventId === request.eventId &&
        leg.betType === request.betType &&
        leg.selection === request.selection
    );
    if (isDuplicate) {
      throw new Error("Duplicate selection");
    }

    const leg = await this.buildLeg(request);
    parlay.legs.push(leg);
    parlay.legCount = parlay.legs.length;

    // Recalculate odds
    const oddsResult = this.calculator.calculateParlayOdds(parlay.legs, parlay.stake);
    parlay.combinedOdds = oddsResult.combinedOdds;
    parlay.combinedDecimalOdds = oddsResult.decimalOdds;
    parlay.impliedProbability = oddsResult.impliedProbability;
    parlay.potentialPayout = oddsResult.potentialPayout;
    parlay.parlayBonus = oddsResult.parlayBonus;
    parlay.insuranceEligible = parlay.legs.length >= 4;
    parlay.updatedAt = Date.now();

    this.parlays.set(parlayId, parlay);
    return parlay;
  }

  /**
   * Remove a leg from parlay
   */
  async removeLeg(parlayId: string, legId: string): Promise<Parlay> {
    const parlay = this.parlays.get(parlayId);
    if (!parlay) throw new Error("Parlay not found");
    if (parlay.status !== "building") throw new Error("Cannot modify submitted parlay");

    const legIndex = parlay.legs.findIndex((leg) => leg.id === legId);
    if (legIndex === -1) throw new Error("Leg not found");

    parlay.legs.splice(legIndex, 1);
    parlay.legCount = parlay.legs.length;

    // Recalculate odds
    if (parlay.legs.length > 0) {
      const oddsResult = this.calculator.calculateParlayOdds(parlay.legs, parlay.stake);
      parlay.combinedOdds = oddsResult.combinedOdds;
      parlay.combinedDecimalOdds = oddsResult.decimalOdds;
      parlay.impliedProbability = oddsResult.impliedProbability;
      parlay.potentialPayout = oddsResult.potentialPayout;
      parlay.parlayBonus = oddsResult.parlayBonus;
    } else {
      parlay.combinedOdds = 0;
      parlay.combinedDecimalOdds = 1;
      parlay.impliedProbability = 1;
      parlay.potentialPayout = 0;
      parlay.parlayBonus = undefined;
    }

    parlay.insuranceEligible = parlay.legs.length >= 4;
    parlay.updatedAt = Date.now();

    this.parlays.set(parlayId, parlay);
    return parlay;
  }

  /**
   * Update parlay settings
   */
  async updateParlay(parlayId: string, request: UpdateParlayRequest): Promise<Parlay> {
    const parlay = this.parlays.get(parlayId);
    if (!parlay) throw new Error("Parlay not found");
    if (parlay.status !== "building") throw new Error("Cannot modify submitted parlay");

    if (request.stake !== undefined) {
      parlay.stake = request.stake;
      const oddsResult = this.calculator.calculateParlayOdds(parlay.legs, parlay.stake);
      parlay.potentialPayout = oddsResult.potentialPayout;
      parlay.parlayBonus = oddsResult.parlayBonus;
    }

    if (request.isPublic !== undefined) {
      parlay.isPublic = request.isPublic;
    }

    if (request.oddsBoostId) {
      const boost = this.oddsBoosts.get(request.oddsBoostId);
      if (boost && this.isBoostEligible(parlay, boost)) {
        parlay.boostedOdds = boost.boostedOdds;
        parlay.oddsBoostId = request.oddsBoostId;
        // Recalculate payout with boosted odds
        const boostedDecimal = this.calculator.getConverter().americanToDecimal(boost.boostedOdds);
        parlay.potentialPayout = parlay.stake * boostedDecimal;
      }
    }

    parlay.updatedAt = Date.now();
    this.parlays.set(parlayId, parlay);
    return parlay;
  }

  /**
   * Build a single leg from request
   */
  private async buildLeg(request: AddLegRequest): Promise<ParlayLeg> {
    // In production, fetch real odds from API
    const odds = this.fetchMockOdds(request);

    const legId = `leg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const converter = this.calculator.getConverter();

    return {
      id: legId,
      eventId: request.eventId,
      eventName: odds.eventName,
      sport: odds.sport,
      league: odds.league,
      startTime: odds.startTime,
      isLive: Date.now() > odds.startTime,
      betType: request.betType,
      selection: request.selection,
      selectionDetails: odds.selectionDetails,
      line: request.line,
      odds: odds.americanOdds,
      decimalOdds: converter.americanToDecimal(odds.americanOdds),
      impliedProbability: converter.impliedProbability(odds.americanOdds),
      originalOdds: odds.americanOdds,
      status: "pending",
      addedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * Fetch mock odds (replace with real API in production)
   */
  private fetchMockOdds(request: AddLegRequest): {
    eventName: string;
    sport: string;
    league: string;
    startTime: number;
    selectionDetails: string;
    americanOdds: number;
  } {
    // Mock data - in production, call odds API
    const mockOdds = [
      { odds: -110, details: "Moneyline" },
      { odds: -115, details: "Spread" },
      { odds: +150, details: "Moneyline" },
      { odds: -105, details: "Over/Under" },
      { odds: +200, details: "Prop" },
    ];

    const mock = mockOdds[Math.floor(Math.random() * mockOdds.length)];

    return {
      eventName: `Team A vs Team B`,
      sport: "nfl",
      league: "NFL",
      startTime: Date.now() + 86400000, // Tomorrow
      selectionDetails: mock.details,
      americanOdds: mock.odds,
    };
  }

  // ==========================================================================
  // VALIDATION & SUBMISSION
  // ==========================================================================

  /**
   * Validate a parlay
   */
  validateParlay(parlay: Parlay): ParlayValidation {
    const errors: ParlayValidation["errors"] = [];
    const warnings: string[] = [];

    // Minimum legs
    if (parlay.legs.length < 2) {
      errors.push({
        code: "MIN_LEGS",
        message: "Parlay requires at least 2 legs",
      });
    }

    // Maximum legs
    if (parlay.legs.length > 15) {
      errors.push({
        code: "MAX_LEGS",
        message: "Maximum 15 legs allowed",
      });
    }

    // Stake validation
    if (parlay.stake <= 0) {
      errors.push({
        code: "INVALID_STAKE",
        message: "Stake must be greater than 0",
      });
    }

    // Check for conflicting legs
    const conflicts = this.findConflictingLegs(parlay.legs);
    for (const conflict of conflicts) {
      errors.push({
        code: "CONFLICTING_LEGS",
        message: `Cannot combine ${conflict.leg1} with ${conflict.leg2}`,
        legId: conflict.legId,
      });
    }

    // Check for expired events
    for (const leg of parlay.legs) {
      if (leg.startTime < Date.now()) {
        errors.push({
          code: "EVENT_STARTED",
          message: `Event has already started: ${leg.eventName}`,
          legId: leg.id,
        });
      }
    }

    // Warnings for correlations
    const correlatedGroups = this.findCorrelatedLegs(parlay.legs);
    if (correlatedGroups > 0) {
      warnings.push(`This parlay includes ${correlatedGroups} same-game parlay(s) which may have adjusted odds`);
    }

    // Warnings for low probability
    if (parlay.impliedProbability < 0.01) {
      warnings.push("This parlay has less than 1% implied probability");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      minStake: 1,
      maxStake: 10000, // In production, based on user limits
    };
  }

  /**
   * Find conflicting legs (opposing sides)
   */
  private findConflictingLegs(legs: ParlayLeg[]): Array<{
    leg1: string;
    leg2: string;
    legId: string;
  }> {
    const conflicts: Array<{ leg1: string; leg2: string; legId: string }> = [];

    for (let i = 0; i < legs.length; i++) {
      for (let j = i + 1; j < legs.length; j++) {
        const leg1 = legs[i];
        const leg2 = legs[j];

        // Same event, same market, opposite sides
        if (
          leg1.eventId === leg2.eventId &&
          leg1.betType === leg2.betType &&
          leg1.selection !== leg2.selection
        ) {
          // Check if they're opposites (e.g., Over vs Under)
          const isOpposite =
            (leg1.selection.includes("Over") && leg2.selection.includes("Under")) ||
            (leg1.selection.includes("Under") && leg2.selection.includes("Over"));

          if (isOpposite || leg1.betType === "moneyline") {
            conflicts.push({
              leg1: leg1.selection,
              leg2: leg2.selection,
              legId: leg2.id,
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find correlated legs (same game)
   */
  private findCorrelatedLegs(legs: ParlayLeg[]): number {
    const eventCounts = new Map<string, number>();
    for (const leg of legs) {
      eventCounts.set(leg.eventId, (eventCounts.get(leg.eventId) ?? 0) + 1);
    }
    return Array.from(eventCounts.values()).filter((count) => count > 1).length;
  }

  /**
   * Submit parlay for betting
   */
  async submitParlay(request: SubmitParlayRequest): Promise<Parlay> {
    const parlay = this.parlays.get(request.parlayId);
    if (!parlay) throw new Error("Parlay not found");
    if (parlay.status !== "building") throw new Error("Parlay already submitted");

    // Validate
    const validation = this.validateParlay(parlay);
    if (!validation.isValid) {
      throw new Error(validation.errors[0].message);
    }

    // Check for odds changes
    const currentOdds = this.calculator.calculateParlayOdds(parlay.legs, request.stake);
    if (currentOdds.hasOddsChanged && !request.acceptOddsChanges) {
      throw new Error("Odds have changed. Please review and accept.");
    }

    // Update parlay
    parlay.stake = request.stake;
    parlay.combinedOdds = currentOdds.combinedOdds;
    parlay.combinedDecimalOdds = currentOdds.decimalOdds;
    parlay.potentialPayout = currentOdds.potentialPayout;
    parlay.parlayBonus = currentOdds.parlayBonus;
    parlay.status = "pending";
    parlay.submittedAt = Date.now();
    parlay.cashoutAvailable = true;
    parlay.updatedAt = Date.now();

    // Update leg odds to current
    for (const leg of parlay.legs) {
      leg.originalOdds = leg.odds;
    }

    this.parlays.set(request.parlayId, parlay);

    // In production: Place bet with sportsbook
    return parlay;
  }

  // ==========================================================================
  // CASHOUT
  // ==========================================================================

  /**
   * Get cashout value
   */
  async getCashoutValue(parlayId: string): Promise<number | null> {
    const parlay = this.parlays.get(parlayId);
    if (!parlay) throw new Error("Parlay not found");

    return this.calculator.calculateCashoutValue(parlay);
  }

  /**
   * Process cashout
   */
  async cashout(request: CashoutRequest): Promise<Parlay> {
    const parlay = this.parlays.get(request.parlayId);
    if (!parlay) throw new Error("Parlay not found");
    if (!parlay.cashoutAvailable) throw new Error("Cashout not available");

    const cashoutValue = await this.getCashoutValue(request.parlayId);
    if (cashoutValue === null) throw new Error("Cannot calculate cashout value");

    if (request.acceptValue !== undefined && cashoutValue < request.acceptValue) {
      throw new Error(`Cashout value (${cashoutValue}) is below minimum (${request.acceptValue})`);
    }

    parlay.status = "cashed_out";
    parlay.cashoutAvailable = false;
    parlay.cashoutValue = cashoutValue;
    parlay.cashedOutAt = Date.now();
    parlay.cashoutAmount = cashoutValue;
    parlay.actualPayout = cashoutValue;
    parlay.updatedAt = Date.now();

    this.parlays.set(request.parlayId, parlay);

    // In production: Process payout
    return parlay;
  }

  // ==========================================================================
  // CARDS & SHARING
  // ==========================================================================

  /**
   * Generate shareable card
   */
  async generateCard(
    parlayId: string,
    username: string,
    request: GenerateCardRequest
  ): Promise<ParlayCard> {
    const parlay = this.parlays.get(parlayId);
    if (!parlay) throw new Error("Parlay not found");

    const card = this.cardGenerator.generateCard(parlay, username, request);

    parlay.cardUrl = card.imageUrl;
    parlay.shareUrl = card.shareUrl;
    this.parlays.set(parlayId, parlay);

    this.cards.set(card.id, card);
    return card;
  }

  /**
   * Get card by ID
   */
  getCard(cardId: string): ParlayCard | null {
    return this.cards.get(cardId) ?? null;
  }

  /**
   * Track card view
   */
  async trackCardView(cardId: string): Promise<void> {
    const card = this.cards.get(cardId);
    if (card) {
      card.views += 1;
      this.cards.set(cardId, card);
    }
  }

  /**
   * Copy a parlay (tail)
   */
  async copyParlay(parlayId: string, userId: string): Promise<Parlay> {
    const original = this.parlays.get(parlayId);
    if (!original) throw new Error("Parlay not found");
    if (!original.isPublic) throw new Error("Parlay is not public");

    // Create new parlay with same legs
    const newParlay = await this.createParlay(userId, {
      legs: original.legs.map((leg) => ({
        eventId: leg.eventId,
        betType: leg.betType,
        selection: leg.selection,
        line: leg.line,
      })),
      isPublic: false,
    });

    // Track copy
    const card = Array.from(this.cards.values()).find((c) => c.parlayId === parlayId);
    if (card) {
      card.copies += 1;
      this.cards.set(card.id, card);
    }

    return newParlay;
  }

  // ==========================================================================
  // AI SUGGESTIONS
  // ==========================================================================

  /**
   * Get AI-suggested parlays
   */
  async getSuggestions(
    userId: string,
    request: GetSuggestionsRequest
  ): Promise<AISuggestion[]> {
    // In production, call AI service
    // For now, generate mock suggestions

    const suggestions: AISuggestion[] = [];
    const categories: SuggestionCategory[] = request.category
      ? [request.category]
      : ["best_value", "safe_play", "longshot"];

    for (const category of categories) {
      const suggestion = this.generateMockSuggestion(userId, category, request);
      suggestions.push(suggestion);
    }

    this.suggestions.set(userId, suggestions);
    return suggestions;
  }

  /**
   * Create parlay from AI suggestion
   */
  async createFromSuggestion(
    userId: string,
    suggestionId: string
  ): Promise<Parlay> {
    const userSuggestions = this.suggestions.get(userId) ?? [];
    const suggestion = userSuggestions.find((s) => s.id === suggestionId);
    if (!suggestion) throw new Error("Suggestion not found or expired");

    const parlay = await this.createParlay(userId, {
      legs: suggestion.legs.map((leg) => ({
        eventId: leg.eventId,
        betType: "moneyline" as BetType,
        selection: leg.selection,
      })),
      isPublic: false,
    });

    parlay.aiSuggested = true;
    parlay.aiConfidence = suggestion.confidence;
    parlay.aiReasoning = suggestion.reasoning;

    this.parlays.set(parlay.id, parlay);
    return parlay;
  }

  /**
   * Generate mock AI suggestion
   */
  private generateMockSuggestion(
    userId: string,
    category: SuggestionCategory,
    request: GetSuggestionsRequest
  ): AISuggestion {
    const legCount = Math.max(request.minLegs ?? 3, Math.min(request.maxLegs ?? 5, 4));
    const legs: AISuggestion["legs"] = [];

    for (let i = 0; i < legCount; i++) {
      legs.push({
        eventId: `event_${i}`,
        eventName: `Team ${i * 2 + 1} vs Team ${i * 2 + 2}`,
        sport: request.sport ?? "nfl",
        selection: `Team ${i * 2 + 1}`,
        odds: category === "longshot" ? 250 : -110,
        confidence: category === "safe_play" ? 70 : 55,
        reasoning: "Strong historical performance in similar matchups",
      });
    }

    let combinedOdds = 1;
    for (const leg of legs) {
      combinedOdds *= this.calculator.getConverter().americanToDecimal(leg.odds);
    }

    return {
      id: `suggestion_${category}_${Date.now()}`,
      userId,
      legs,
      combinedOdds: this.calculator.getConverter().decimalToAmerican(combinedOdds),
      impliedProbability: 1 / combinedOdds,
      confidence: category === "safe_play" ? 65 : category === "longshot" ? 25 : 50,
      expectedValue: category === "best_value" ? 0.12 : 0.05,
      reasoning: this.getCategoryReasoning(category),
      keyFactors: ["Historical trends", "Recent form", "Head-to-head record"],
      risks: ["Injury concerns", "Weather conditions"],
      category,
      sport: request.sport,
      validUntil: Date.now() + 3600000, // 1 hour
      createdAt: Date.now(),
    };
  }

  /**
   * Get reasoning text for category
   */
  private getCategoryReasoning(category: SuggestionCategory): string {
    switch (category) {
      case "best_value":
        return "These picks offer positive expected value based on our models vs market odds.";
      case "safe_play":
        return "Higher probability selections with solid fundamentals backing each pick.";
      case "longshot":
        return "Higher risk, higher reward. These underdogs have upset potential.";
      case "trending":
        return "Popular picks that are generating significant action from sharp bettors.";
      case "contrarian":
        return "Going against the public. These picks have value on the less-popular side.";
      default:
        return "AI-selected picks based on comprehensive data analysis.";
    }
  }

  // ==========================================================================
  // ODDS BOOSTS
  // ==========================================================================

  /**
   * Initialize sample odds boosts
   */
  private initializeOddsBoosts(): void {
    const boosts: OddsBoost[] = [
      {
        id: "boost_daily_1",
        name: "Daily Parlay Boost",
        description: "Get boosted odds on your first 4+ leg parlay",
        boostType: "percentage",
        boostValue: 25,
        originalOdds: 0,
        boostedOdds: 0,
        minLegs: 4,
        maxStake: 50,
        maxUsesPerUser: 1,
        totalUses: 0,
        usedByUser: false,
        startsAt: Date.now(),
        endsAt: Date.now() + 86400000,
        isActive: true,
      },
      {
        id: "boost_weekend",
        name: "Weekend Special",
        description: "50% odds boost on any NFL parlay",
        boostType: "percentage",
        boostValue: 50,
        originalOdds: 0,
        boostedOdds: 0,
        sports: ["nfl"],
        maxStake: 25,
        maxUsesPerUser: 1,
        totalUses: 0,
        usedByUser: false,
        startsAt: Date.now(),
        endsAt: Date.now() + 172800000,
        isActive: true,
      },
    ];

    for (const boost of boosts) {
      this.oddsBoosts.set(boost.id, boost);
    }
  }

  /**
   * Get available odds boosts for user
   */
  getAvailableBoosts(userId: string, parlay?: Parlay): OddsBoost[] {
    const boosts = Array.from(this.oddsBoosts.values()).filter((boost) => {
      if (!boost.isActive) return false;
      if (boost.usedByUser) return false;
      if (boost.endsAt < Date.now()) return false;

      if (parlay) {
        return this.isBoostEligible(parlay, boost);
      }

      return true;
    });

    return boosts;
  }

  /**
   * Check if boost is eligible for parlay
   */
  private isBoostEligible(parlay: Parlay, boost: OddsBoost): boolean {
    if (boost.minLegs && parlay.legCount < boost.minLegs) return false;
    if (boost.maxLegs && parlay.legCount > boost.maxLegs) return false;
    if (boost.maxStake && parlay.stake > boost.maxStake) return false;

    if (boost.sports && boost.sports.length > 0) {
      const parlaySports = new Set(parlay.legs.map((l) => l.sport.toLowerCase()));
      const hasEligibleSport = boost.sports.some((s) => parlaySports.has(s.toLowerCase()));
      if (!hasEligibleSport) return false;
    }

    return true;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  /**
   * Get parlay by ID
   */
  getParlay(parlayId: string): Parlay | null {
    return this.parlays.get(parlayId) ?? null;
  }

  /**
   * Get user's parlays
   */
  getUserParlays(
    userId: string,
    status?: ParlayStatus,
    limit: number = 50
  ): Parlay[] {
    let parlays = Array.from(this.parlays.values()).filter(
      (p) => p.userId === userId
    );

    if (status) {
      parlays = parlays.filter((p) => p.status === status);
    }

    return parlays
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Get public parlays
   */
  getPublicParlays(limit: number = 50): Parlay[] {
    return Array.from(this.parlays.values())
      .filter((p) => p.isPublic && p.status !== "building")
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * Get odds calculator
   */
  getCalculator(): ParlayOddsCalculator {
    return this.calculator;
  }

  /**
   * Get card generator
   */
  getCardGenerator(): ParlayCardGenerator {
    return this.cardGenerator;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createParlayBuilderService(): ParlayBuilderService {
  return new ParlayBuilderService();
}
