/**
 * The Odds API Service
 * Sports betting odds data integration
 */

export { OddsApiClient, getOddsApiClient, initOddsApiClient, default } from "./client";
export { OddsPoller, getOddsPoller, initOddsPoller } from "./polling";
export * from "./types";
