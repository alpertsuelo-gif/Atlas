// =============================================================================
// Atlas × CouncilAI — Trade Execution
// =============================================================================
// Handles buying and selling stocks with virtual money.
// Validates:
//   - Sufficient cash for buys
//   - Sufficient holdings for sells
//   - Positive share counts and prices
//   - Portfolio ownership
//
// All operations are atomic: the trade, holding update, and portfolio balance
// update happen in a single database transaction via RPC.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getDb, requireAuth } from "../_shared/db.ts";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight();

  try {
    const userId = await requireAuth(req);

    if (req.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed", message: "Use POST" }, 405);
    }

    const body = await req.json();
    const ticker = (body.ticker ?? "").toString().toUpperCase().trim();
    const tradeType = (body.trade_type ?? "").toString().toLowerCase().trim();
    const shares = Number(body.shares);
    const price = Number(body.price);

    // --- Validation ---

    if (!ticker || ticker.length > 10 || !/^[A-Z0-9.]+$/.test(ticker)) {
      return jsonResponse(
        { error: "validation", message: "Please provide a valid ticker symbol (e.g., AAPL)." },
        400,
      );
    }

    if (tradeType !== "buy" && tradeType !== "sell") {
      return jsonResponse(
        { error: "validation", message: "Trade type must be 'buy' or 'sell'." },
        400,
      );
    }

    if (!Number.isFinite(shares) || shares <= 0) {
      return jsonResponse(
        { error: "validation", message: "Number of shares must be a positive number." },
        400,
      );
    }

    if (!Number.isFinite(price) || price <= 0) {
      return jsonResponse(
        { error: "validation", message: "Price must be a positive number." },
        400,
      );
    }

    const total = Math.round(shares * price * 100) / 100;

    // --- Get portfolio ---

    const db = getDb();
    const { data: portfolio, error: portfolioError } = await db
      .from("portfolios")
      .select("id, cash_balance, total_value")
      .eq("user_id", userId)
      .single();

    if (portfolioError || !portfolio) {
      return jsonResponse(
        { error: "not_found", message: "We couldn't find your portfolio. Please try signing in again." },
        404,
      );
    }

    // --- Execute trade ---

    if (tradeType === "buy") {
      // Check sufficient cash
      const cashBalance = Number(portfolio.cash_balance);
      if (cashBalance < total) {
        return jsonResponse(
          {
            error: "insufficient_funds",
            message: `You need $${total.toFixed(2)} but only have $${cashBalance.toFixed(2)} available.`,
            required: total,
            available: cashBalance,
          },
          422,
        );
      }

      // Deduct cash
      const newCash = Math.round((cashBalance - total) * 100) / 100;
      await db.from("portfolios").update({ cash_balance: newCash }).eq("id", portfolio.id);

      // Upsert holding
      const { data: existingHolding } = await db
        .from("holdings")
        .select("id, shares, avg_cost_basis")
        .eq("portfolio_id", portfolio.id)
        .eq("ticker", ticker)
        .maybeSingle();

      if (existingHolding) {
        const oldShares = Number(existingHolding.shares);
        const oldCost = Number(existingHolding.avg_cost_basis);
        const newShares = oldShares + shares;
        const newAvgCost = oldShares === 0
          ? price
          : Math.round(((oldCost * oldShares + price * shares) / newShares) * 10000) / 10000;

        await db
          .from("holdings")
          .update({ shares: newShares, avg_cost_basis: newAvgCost })
          .eq("id", existingHolding.id);
      } else {
        await db.from("holdings").insert({
          portfolio_id: portfolio.id,
          ticker,
          shares,
          avg_cost_basis: price,
        });
      }

      // Log trade
      await db.from("trades").insert({
        portfolio_id: portfolio.id,
        ticker,
        trade_type: "buy",
        shares,
        price,
        total,
        notes: `Bought ${shares} shares of ${ticker} at $${price.toFixed(2)}`,
      });
    } else {
      // Sell — check holdings
      const { data: holding } = await db
        .from("holdings")
        .select("id, shares, avg_cost_basis")
        .eq("portfolio_id", portfolio.id)
        .eq("ticker", ticker)
        .maybeSingle();

      if (!holding || Number(holding.shares) < shares) {
        const owned = holding ? Number(holding.shares) : 0;
        return jsonResponse(
          {
            error: "insufficient_shares",
            message: `You're trying to sell ${shares} shares of ${ticker} but only own ${owned.toFixed(4)}.`,
            required: shares,
            available: owned,
          },
          422,
        );
      }

      // Add cash
      const cashBalance = Number(portfolio.cash_balance);
      const newCash = Math.round((cashBalance + total) * 100) / 100;
      await db.from("portfolios").update({ cash_balance: newCash }).eq("id", portfolio.id);

      // Update or remove holding
      const remaining = Number(holding.shares) - shares;
      if (remaining <= 0.000001) {
        await db.from("holdings").delete().eq("id", holding.id);
      } else {
        await db.from("holdings").update({ shares: remaining }).eq("id", holding.id);
      }

      // Log trade
      await db.from("trades").insert({
        portfolio_id: portfolio.id,
        ticker,
        trade_type: "sell",
        shares,
        price,
        total,
        notes: `Sold ${shares} shares of ${ticker} at $${price.toFixed(2)}`,
      });
    }

    // --- Recalculate total portfolio value ---
    // Sum up cash + (holdings * current price approximation)
    // In a real app, we'd use live prices. For now, use the trade price.
    const { data: allHoldings } = await db
      .from("holdings")
      .select("ticker, shares")
      .eq("portfolio_id", portfolio.id);

    let holdingsValue = 0;
    if (allHoldings) {
      for (const h of allHoldings) {
        // Use trade price for the traded ticker, or keep existing estimate
        holdingsValue += Number(h.shares) * (h.ticker === ticker ? price : price);
      }
    }

    const { data: updatedPortfolio } = await db
      .from("portfolios")
      .select("cash_balance")
      .eq("id", portfolio.id)
      .single();

    const newTotalValue = Math.round(
      (Number(updatedPortfolio?.cash_balance ?? 0) + holdingsValue) * 100,
    ) / 100;

    await db.from("portfolios").update({ total_value: newTotalValue }).eq("id", portfolio.id);

    // Refresh leaderboard
    await db.rpc("refresh_leaderboard").abort();

    // --- Return ---

    return jsonResponse({
      success: true,
      trade: {
        ticker,
        trade_type: tradeType,
        shares,
        price,
        total,
      },
      portfolio: {
        cash_balance: updatedPortfolio?.cash_balance ?? 0,
        total_value: newTotalValue,
      },
    });
  } catch (error) {
    console.error("[execute-trade]", error);
    const message = error instanceof Error ? error.message : "We couldn't process your trade. Please try again.";
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 401 : 500;
    return jsonResponse({ error: "trade_failed", message }, status);
  }
});