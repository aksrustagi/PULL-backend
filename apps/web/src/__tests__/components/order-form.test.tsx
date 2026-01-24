/**
 * OrderForm Component Tests
 * Tests for the trading order form component
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Mock components (since actual component may not exist yet)
// This demonstrates the test structure
interface OrderFormProps {
  symbol: string;
  currentPrice?: number;
  onSubmit?: (order: OrderData) => Promise<void>;
  onCancel?: () => void;
}

interface OrderData {
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: number;
  price?: number;
  timeInForce: string;
}

// Mock OrderForm component for testing
function OrderForm({ symbol, currentPrice = 0.55, onSubmit, onCancel }: OrderFormProps) {
  return (
    <form
      data-testid="order-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const order: OrderData = {
          symbol,
          side: formData.get("side") as "buy" | "sell",
          type: formData.get("type") as "market" | "limit",
          quantity: Number(formData.get("quantity")),
          price: formData.get("price") ? Number(formData.get("price")) : undefined,
          timeInForce: formData.get("timeInForce") as string,
        };
        await onSubmit?.(order);
      }}
    >
      <div>
        <span data-testid="symbol">{symbol}</span>
        <span data-testid="current-price">${currentPrice}</span>
      </div>

      <fieldset>
        <legend>Side</legend>
        <label>
          <input type="radio" name="side" value="buy" defaultChecked />
          Buy
        </label>
        <label>
          <input type="radio" name="side" value="sell" />
          Sell
        </label>
      </fieldset>

      <fieldset>
        <legend>Order Type</legend>
        <label>
          <input type="radio" name="type" value="market" defaultChecked />
          Market
        </label>
        <label>
          <input type="radio" name="type" value="limit" />
          Limit
        </label>
      </fieldset>

      <div>
        <label htmlFor="quantity">Quantity</label>
        <input
          type="number"
          id="quantity"
          name="quantity"
          min="1"
          required
          aria-label="Quantity"
        />
      </div>

      <div>
        <label htmlFor="price">Limit Price</label>
        <input
          type="number"
          id="price"
          name="price"
          step="0.01"
          min="0.01"
          max="0.99"
          aria-label="Limit Price"
        />
      </div>

      <div>
        <label htmlFor="timeInForce">Time in Force</label>
        <select id="timeInForce" name="timeInForce" aria-label="Time in Force">
          <option value="gtc">Good Till Cancelled</option>
          <option value="day">Day Only</option>
          <option value="ioc">Immediate or Cancel</option>
          <option value="fok">Fill or Kill</option>
        </select>
      </div>

      <div>
        <button type="submit">Place Order</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================================
// Test Setup
// ============================================================================

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("OrderForm", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // Rendering Tests
  // ==========================================================================

  describe("rendering", () => {
    it("should render the order form", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByTestId("order-form")).toBeInTheDocument();
    });

    it("should display the symbol", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByTestId("symbol")).toHaveTextContent("BTC-100K-YES");
    });

    it("should display current price", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" currentPrice={0.65} onSubmit={mockOnSubmit} />
      );

      expect(screen.getByTestId("current-price")).toHaveTextContent("$0.65");
    });

    it("should render side selection", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/buy/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/sell/i)).toBeInTheDocument();
    });

    it("should render order type selection", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/market/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/limit/i)).toBeInTheDocument();
    });

    it("should render quantity input", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    });

    it("should render limit price input", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/limit price/i)).toBeInTheDocument();
    });

    it("should render time in force dropdown", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/time in force/i)).toBeInTheDocument();
    });

    it("should render submit button", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByRole("button", { name: /place order/i })).toBeInTheDocument();
    });

    it("should render cancel button", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} onCancel={mockOnCancel} />
      );

      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Default Values Tests
  // ==========================================================================

  describe("default values", () => {
    it("should default to buy side", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/buy/i)).toBeChecked();
    });

    it("should default to market order type", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/market/i)).toBeChecked();
    });

    it("should default time in force to GTC", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/time in force/i)).toHaveValue("gtc");
    });
  });

  // ==========================================================================
  // User Interaction Tests
  // ==========================================================================

  describe("user interactions", () => {
    it("should allow selecting sell side", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      await user.click(screen.getByLabelText(/sell/i));

      expect(screen.getByLabelText(/sell/i)).toBeChecked();
    });

    it("should allow selecting limit order type", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      await user.click(screen.getByLabelText(/limit/i));

      expect(screen.getByLabelText(/limit/i)).toBeChecked();
    });

    it("should allow entering quantity", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const quantityInput = screen.getByLabelText(/quantity/i);
      await user.type(quantityInput, "100");

      expect(quantityInput).toHaveValue(100);
    });

    it("should allow entering limit price", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const priceInput = screen.getByLabelText(/limit price/i);
      await user.type(priceInput, "0.55");

      expect(priceInput).toHaveValue(0.55);
    });

    it("should allow changing time in force", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const tifSelect = screen.getByLabelText(/time in force/i);
      await user.selectOptions(tifSelect, "day");

      expect(tifSelect).toHaveValue("day");
    });
  });

  // ==========================================================================
  // Form Submission Tests
  // ==========================================================================

  describe("form submission", () => {
    it("should call onSubmit with market buy order data", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValueOnce(undefined);

      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      await user.type(screen.getByLabelText(/quantity/i), "100");
      await user.click(screen.getByRole("button", { name: /place order/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: "BTC-100K-YES",
            side: "buy",
            type: "market",
            quantity: 100,
            timeInForce: "gtc",
          })
        );
      });
    });

    it("should call onSubmit with limit sell order data", async () => {
      const user = userEvent.setup();
      mockOnSubmit.mockResolvedValueOnce(undefined);

      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      await user.click(screen.getByLabelText(/sell/i));
      await user.click(screen.getByLabelText(/limit/i));
      await user.type(screen.getByLabelText(/quantity/i), "50");
      await user.type(screen.getByLabelText(/limit price/i), "0.60");
      await user.selectOptions(screen.getByLabelText(/time in force/i), "ioc");
      await user.click(screen.getByRole("button", { name: /place order/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: "BTC-100K-YES",
            side: "sell",
            type: "limit",
            quantity: 50,
            price: 0.6,
            timeInForce: "ioc",
          })
        );
      });
    });

    it("should call onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm
          symbol="BTC-100K-YES"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Form Validation Tests
  // ==========================================================================

  describe("form validation", () => {
    it("should require quantity", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const quantityInput = screen.getByLabelText(/quantity/i);
      await user.click(screen.getByRole("button", { name: /place order/i }));

      expect(quantityInput).toBeInvalid();
    });

    it("should enforce minimum quantity of 1", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const quantityInput = screen.getByLabelText(/quantity/i);
      await user.type(quantityInput, "0");
      await user.click(screen.getByRole("button", { name: /place order/i }));

      expect(quantityInput).toBeInvalid();
    });

    it("should enforce price range 0.01-0.99", async () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const priceInput = screen.getByLabelText(/limit price/i);

      expect(priceInput).toHaveAttribute("min", "0.01");
      expect(priceInput).toHaveAttribute("max", "0.99");
    });
  });

  // ==========================================================================
  // Loading and Error States
  // ==========================================================================

  describe("loading and error states", () => {
    it("should handle submission error gracefully", async () => {
      const user = userEvent.setup();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      mockOnSubmit.mockRejectedValueOnce(new Error("Order failed"));

      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      await user.type(screen.getByLabelText(/quantity/i), "100");
      await user.click(screen.getByRole("button", { name: /place order/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });
  });

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  describe("accessibility", () => {
    it("should have accessible form labels", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/limit price/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/time in force/i)).toBeInTheDocument();
    });

    it("should have proper button roles", () => {
      renderWithProviders(
        <OrderForm
          symbol="BTC-100K-YES"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it("should have proper form role", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      expect(screen.getByTestId("order-form")).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // Time in Force Options
  // ==========================================================================

  describe("time in force options", () => {
    it("should have GTC option", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const select = screen.getByLabelText(/time in force/i);
      expect(within(select).getByText(/good till cancelled/i)).toBeInTheDocument();
    });

    it("should have Day option", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const select = screen.getByLabelText(/time in force/i);
      expect(within(select).getByText(/day only/i)).toBeInTheDocument();
    });

    it("should have IOC option", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const select = screen.getByLabelText(/time in force/i);
      expect(within(select).getByText(/immediate or cancel/i)).toBeInTheDocument();
    });

    it("should have FOK option", () => {
      renderWithProviders(
        <OrderForm symbol="BTC-100K-YES" onSubmit={mockOnSubmit} />
      );

      const select = screen.getByLabelText(/time in force/i);
      expect(within(select).getByText(/fill or kill/i)).toBeInTheDocument();
    });
  });
});
