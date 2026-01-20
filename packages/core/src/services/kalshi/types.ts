/**
 * Kalshi API Types
 * Type definitions for Kalshi prediction market API
 */

// ============================================================================
// Common Types
// ============================================================================

export type OrderStatus =
  | "resting"
  | "canceled"
  | "executed"
  | "pending";

export type OrderType = "limit" | "market";

export type Side = "yes" | "no";

export type OrderAction = "buy" | "sell";

export type MarketStatus =
  | "open"
  | "closed"
  | "settled";

export type MarketResult = "yes" | "no" | "void" | null;

// ============================================================================
// Exchange Status
// ============================================================================

export interface ExchangeStatus {
  exchange_active: boolean;
  trading_active: boolean;
}

// ============================================================================
// Market Types
// ============================================================================

export interface Market {
  ticker: string;
  event_ticker: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title: string;
  no_sub_title: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  status: MarketStatus;
  result: MarketResult;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  previous_yes_bid: number;
  previous_yes_ask: number;
  previous_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  dollar_volume: number;
  dollar_open_interest: number;
  cap_strike: number | null;
  floor_strike: number | null;
  risk_limit_cents: number;
  tick_size: number;
  rules_primary: string;
  rules_secondary: string;
  expected_expiration_time: string | null;
  expiration_value: string | null;
  category: string;
  series_ticker: string;
  tags: string[];
  mutually_exclusive: boolean;
  functional_strike: number | null;
  estimated_settlement_time: string | null;
  settlement_timer_seconds: number | null;
  settlement_value: number | null;
  can_close_early: boolean;
  response_price_units: string;
}

export interface MarketsResponse {
  markets: Market[];
  cursor: string | null;
}

export interface GetMarketsParams {
  limit?: number;
  cursor?: string;
  event_ticker?: string;
  series_ticker?: string;
  max_close_ts?: number;
  min_close_ts?: number;
  status?: MarketStatus;
  tickers?: string[];
}

// ============================================================================
// Event Types
// ============================================================================

export interface Event {
  event_ticker: string;
  series_ticker: string;
  sub_title: string;
  title: string;
  mutually_exclusive: boolean;
  category: string;
  markets: Market[];
  strike_date: string | null;
  strike_period: string | null;
}

export interface EventsResponse {
  events: Event[];
  cursor: string | null;
}

export interface GetEventsParams {
  limit?: number;
  cursor?: string;
  status?: MarketStatus;
  series_ticker?: string;
  with_nested_markets?: boolean;
}

// ============================================================================
// Series Types
// ============================================================================

export interface Series {
  ticker: string;
  title: string;
  category: string;
  tags: string[];
  settlement_sources: SettlementSource[];
}

export interface SettlementSource {
  url: string;
  name: string;
}

// ============================================================================
// Orderbook Types
// ============================================================================

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface Orderbook {
  ticker: string;
  yes: OrderbookLevel[];
  no: OrderbookLevel[];
}

// ============================================================================
// Trade Types
// ============================================================================

export interface Trade {
  trade_id: string;
  ticker: string;
  count: number;
  yes_price: number;
  no_price: number;
  taker_side: Side;
  created_time: string;
}

export interface TradesResponse {
  trades: Trade[];
  cursor: string | null;
}

export interface GetTradesParams {
  ticker?: string;
  limit?: number;
  cursor?: string;
  min_ts?: number;
  max_ts?: number;
}

// ============================================================================
// Balance Types
// ============================================================================

export interface Balance {
  balance: number;
  portfolio_value: number;
  available_balance: number;
  payout: number;
}

// ============================================================================
// Position Types
// ============================================================================

export interface Position {
  ticker: string;
  event_ticker: string;
  event_exposure: number;
  market_exposure: number;
  realized_pnl: number;
  resting_order_count: number;
  total_cost: number;
  position: number;
  fees_paid: number;
}

export interface PositionsResponse {
  market_positions: Position[];
  event_positions: EventPosition[];
  cursor: string | null;
}

export interface EventPosition {
  event_ticker: string;
  event_exposure: number;
  realized_pnl: number;
  total_cost: number;
  fees_paid: number;
}

export interface GetPositionsParams {
  limit?: number;
  cursor?: string;
  ticker?: string;
  event_ticker?: string;
  count_filter?: "position" | "resting_orders" | "total_traded";
  settlement_status?: "unsettled" | "settled" | "all";
}

// ============================================================================
// Order Types
// ============================================================================

export interface Order {
  order_id: string;
  user_id: string;
  ticker: string;
  status: OrderStatus;
  yes_price: number;
  no_price: number;
  created_time: string;
  expiration_time: string | null;
  action: OrderAction;
  side: Side;
  type: OrderType;
  client_order_id: string | null;
  order_group_id: string | null;
  remaining_count: number;
  queue_position: number | null;
  taker_fill_count: number;
  taker_fill_cost: number;
  maker_fill_count: number;
  maker_fill_cost: number;
  place_count: number;
  decrease_count: number;
  taker_fees: number;
  close_cancel_count: number;
  amend_count: number;
  amend_taker_fill_count: number;
  self_trade_prevention_type: string | null;
  last_update_time: string;
}

export interface OrdersResponse {
  orders: Order[];
  cursor: string | null;
}

export interface GetOrdersParams {
  limit?: number;
  cursor?: string;
  ticker?: string;
  event_ticker?: string;
  status?: OrderStatus;
  min_ts?: number;
  max_ts?: number;
}

export interface CreateOrderParams {
  ticker: string;
  client_order_id?: string;
  side: Side;
  action: OrderAction;
  count: number;
  type: OrderType;
  yes_price?: number;
  no_price?: number;
  expiration_time?: string;
  self_trade_prevention_type?: "cancel_new" | "cancel_old" | "cancel_both";
  buy_max_cost?: number;
}

export interface CreateOrderResponse {
  order: Order;
}

export interface BatchCreateOrdersParams {
  orders: CreateOrderParams[];
}

export interface BatchCreateOrdersResponse {
  orders: Order[];
}

export interface AmendOrderParams {
  count?: number;
  price?: number;
}

export interface DecreaseOrderParams {
  reduce_by: number;
}

// ============================================================================
// Fill Types
// ============================================================================

export interface Fill {
  trade_id: string;
  order_id: string;
  ticker: string;
  side: Side;
  action: OrderAction;
  count: number;
  yes_price: number;
  no_price: number;
  is_taker: boolean;
  created_time: string;
}

export interface FillsResponse {
  fills: Fill[];
  cursor: string | null;
}

export interface GetFillsParams {
  limit?: number;
  cursor?: string;
  ticker?: string;
  order_id?: string;
  min_ts?: number;
  max_ts?: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export type WebSocketChannel =
  | "orderbook_delta"
  | "ticker"
  | "trade"
  | "fill"
  | "order";

export interface WebSocketMessage {
  id: number;
  cmd: "subscribe" | "unsubscribe" | "update_subscription";
}

export interface WebSocketSubscription {
  channel: WebSocketChannel;
  market_tickers?: string[];
  event_tickers?: string[];
}

export interface WebSocketAuth {
  type: "auth";
  token: string;
}

// Orderbook Delta
export interface OrderbookDeltaMessage {
  type: "orderbook_delta";
  msg: {
    market_ticker: string;
    price: number;
    delta: number;
    side: Side;
    seq: number;
  };
}

// Ticker Update
export interface TickerMessage {
  type: "ticker";
  msg: {
    market_ticker: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    last_price: number;
    volume: number;
    open_interest: number;
    ts: number;
  };
}

// Trade Message
export interface TradeMessage {
  type: "trade";
  msg: {
    market_ticker: string;
    trade_id: string;
    count: number;
    yes_price: number;
    no_price: number;
    taker_side: Side;
    ts: number;
  };
}

// Fill Message (authenticated)
export interface FillMessage {
  type: "fill";
  msg: {
    trade_id: string;
    order_id: string;
    market_ticker: string;
    side: Side;
    action: OrderAction;
    count: number;
    yes_price: number;
    no_price: number;
    is_taker: boolean;
    ts: number;
  };
}

// Order Update (authenticated)
export interface OrderUpdateMessage {
  type: "order";
  msg: {
    order_id: string;
    market_ticker: string;
    status: OrderStatus;
    remaining_count: number;
    ts: number;
  };
}

export type KalshiWebSocketMessage =
  | OrderbookDeltaMessage
  | TickerMessage
  | TradeMessage
  | FillMessage
  | OrderUpdateMessage;

// ============================================================================
// Error Types
// ============================================================================

export interface KalshiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class KalshiApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "KalshiApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// ============================================================================
// Rate Limit Types
// ============================================================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}
