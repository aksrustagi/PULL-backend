/**
 * LMSR Market Maker Tests
 */

import { describe, it, expect } from "vitest";
import {
  LMSRMarketMaker,
  createMatchupMarket,
  calculateCashOutValue,
} from "../market-maker";

describe("LMSR Market Maker", () => {
  describe("LMSRMarketMaker.costFunction", () => {
    it("should calculate cost correctly for initial state", () => {
      const quantities = [0, 0];
      const b = 100;

      const cost = LMSRMarketMaker.costFunction(quantities, b);

      // ln(e^0 + e^0) * b = ln(2) * 100 ≈ 69.31
      expect(cost).toBeCloseTo(69.31, 1);
    });

    it("should increase cost when buying shares", () => {
      const b = 100;
      const initialCost = LMSRMarketMaker.costFunction([0, 0], b);
      const afterBuyCost = LMSRMarketMaker.costFunction([10, 0], b);

      expect(afterBuyCost).toBeGreaterThan(initialCost);
    });
  });

  describe("LMSRMarketMaker.price", () => {
    it("should return 0.5 for equal quantities", () => {
      const quantities = [0, 0];
      const b = 100;

      const price0 = LMSRMarketMaker.price(quantities, 0, b);
      const price1 = LMSRMarketMaker.price(quantities, 1, b);

      expect(price0).toBeCloseTo(0.5, 2);
      expect(price1).toBeCloseTo(0.5, 2);
    });

    it("should sum to 1 for binary market", () => {
      const quantities = [50, 30];
      const b = 100;

      const price0 = LMSRMarketMaker.price(quantities, 0, b);
      const price1 = LMSRMarketMaker.price(quantities, 1, b);

      expect(price0 + price1).toBeCloseTo(1, 5);
    });

    it("should increase price when more shares bought", () => {
      const b = 100;

      const priceBefore = LMSRMarketMaker.price([0, 0], 0, b);
      const priceAfter = LMSRMarketMaker.price([20, 0], 0, b);

      expect(priceAfter).toBeGreaterThan(priceBefore);
    });

    it("should decrease opposing outcome price", () => {
      const b = 100;

      const priceBefore = LMSRMarketMaker.price([0, 0], 1, b);
      const priceAfter = LMSRMarketMaker.price([20, 0], 1, b);

      expect(priceAfter).toBeLessThan(priceBefore);
    });
  });

  describe("LMSRMarketMaker.costToBuy", () => {
    it("should return positive cost for buying shares", () => {
      const quantities = [0, 0];
      const b = 100;
      const sharesToBuy = 10;

      const cost = LMSRMarketMaker.costToBuy(quantities, 0, sharesToBuy, b);

      expect(cost).toBeGreaterThan(0);
    });

    it("should be approximately price * shares for small buys", () => {
      const quantities = [0, 0];
      const b = 100;
      const sharesToBuy = 1;

      const price = LMSRMarketMaker.price(quantities, 0, b);
      const cost = LMSRMarketMaker.costToBuy(quantities, 0, sharesToBuy, b);

      // For small purchases, cost ≈ price * shares
      expect(cost).toBeCloseTo(price * sharesToBuy, 1);
    });

    it("should exhibit slippage for large orders", () => {
      const quantities = [0, 0];
      const b = 100;

      const smallOrderCost = LMSRMarketMaker.costToBuy(quantities, 0, 1, b);
      const largeOrderCost = LMSRMarketMaker.costToBuy(quantities, 0, 50, b);

      // Large order should have higher average cost per share
      const avgSmall = smallOrderCost / 1;
      const avgLarge = largeOrderCost / 50;

      expect(avgLarge).toBeGreaterThan(avgSmall);
    });
  });

  describe("LMSRMarketMaker.priceToAmericanOdds", () => {
    it("should convert favorite prices correctly", () => {
      // 60% implied = -150 American
      const odds = LMSRMarketMaker.priceToAmericanOdds(0.6);
      expect(odds).toBeCloseTo(-150, 0);
    });

    it("should convert underdog prices correctly", () => {
      // 40% implied = +150 American
      const odds = LMSRMarketMaker.priceToAmericanOdds(0.4);
      expect(odds).toBeCloseTo(150, 0);
    });

    it("should return +100/-100 for even odds", () => {
      const odds = LMSRMarketMaker.priceToAmericanOdds(0.5);
      expect(Math.abs(odds)).toBe(100);
    });
  });

  describe("createMatchupMarket", () => {
    it("should create a valid matchup market", () => {
      const market = createMatchupMarket({
        leagueId: "league-1",
        matchupId: "matchup-1",
        week: 5,
        homeTeam: { id: "team-a", name: "Team Alpha" },
        awayTeam: { id: "team-b", name: "Team Beta" },
        closesAt: Date.now() + 86400000,
        initialLiquidity: 1000,
      });

      expect(market).toMatchObject({
        type: "matchup",
        status: "open",
        outcomes: expect.arrayContaining([
          expect.objectContaining({ label: "Team Alpha wins" }),
          expect.objectContaining({ label: "Team Beta wins" }),
        ]),
      });

      // Initial probabilities should be roughly equal
      expect(market.outcomes[0].impliedProbability).toBeCloseTo(0.5, 1);
      expect(market.outcomes[1].impliedProbability).toBeCloseTo(0.5, 1);
    });
  });

  describe("calculateCashOutValue", () => {
    it("should return positive value when winning", () => {
      const position = {
        outcomeId: "outcome-1",
        shares: 10,
        avgPurchasePrice: 0.4,
      };

      const market = {
        outcomes: [
          { id: "outcome-1", impliedProbability: 0.6 },
          { id: "outcome-2", impliedProbability: 0.4 },
        ],
        quantities: [100, 50],
        liquidity: 1000,
      };

      const value = calculateCashOutValue(position, market as any);

      // Current value should be higher than purchase price
      const purchaseCost = 10 * 0.4;
      expect(value).toBeGreaterThan(purchaseCost);
    });

    it("should return lower value when losing", () => {
      const position = {
        outcomeId: "outcome-1",
        shares: 10,
        avgPurchasePrice: 0.6,
      };

      const market = {
        outcomes: [
          { id: "outcome-1", impliedProbability: 0.4 },
          { id: "outcome-2", impliedProbability: 0.6 },
        ],
        quantities: [50, 100],
        liquidity: 1000,
      };

      const value = calculateCashOutValue(position, market as any);

      // Current value should be lower than purchase price
      const purchaseCost = 10 * 0.6;
      expect(value).toBeLessThan(purchaseCost);
    });
  });
});
