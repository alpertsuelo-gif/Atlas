-- =============================================================================
-- Atlas — Migration 004: Trading & CouncilAI Tables
-- =============================================================================
-- Adds the portfolio, holdings, trades, analyses, and agent_predictions tables
-- required by the analyze-stock and execute-trade Edge Functions.
--
-- Also creates the leaderboard materialized view, the refresh_leaderboard()
-- RPC, and updates the handle_new_user trigger to auto-create a portfolio
-- with $100,000 virtual cash on signup.

BEGIN;

-- ===========================================================================
-- PORTFOLIOS
-- ===========================================================================
-- One per user. Created automatically on signup with $100,000 virtual cash.
-- ===========================================================================

CREATE TABLE portfolios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  total_value  NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);

-- ===========================================================================
-- HOLDINGS
-- ===========================================================================
-- Current stock positions. One row per (portfolio, ticker) pair.
-- ===========================================================================

CREATE TABLE holdings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id   UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker         TEXT NOT NULL,
  shares         NUMERIC(14, 6) NOT NULL DEFAULT 0,
  avg_cost_basis NUMERIC(14, 4) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),

  UNIQUE (portfolio_id, ticker)
);

CREATE INDEX idx_holdings_portfolio_id ON holdings(portfolio_id);

-- ===========================================================================
-- TRADES
-- ===========================================================================
-- Append-only trade log. Every buy and sell writes one row.
-- ===========================================================================

CREATE TABLE trades (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  trade_type   TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  shares       NUMERIC(14, 6) NOT NULL,
  price        NUMERIC(14, 4) NOT NULL,
  total        NUMERIC(14, 2) NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trades_portfolio_id ON trades(portfolio_id);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- ===========================================================================
-- ANALYSES
-- ===========================================================================
-- Stores the full multi-agent stock analysis results from CouncilAI.
-- ===========================================================================

CREATE TABLE analyses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker             TEXT NOT NULL,
  company_name       TEXT,
  economic_analysis  JSONB NOT NULL,
  technical_analysis JSONB NOT NULL,
  consensus          JSONB NOT NULL,
  devils_advocate    JSONB NOT NULL,
  final_verdict      JSONB NOT NULL,
  status             TEXT NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('pending', 'in_progress', 'completed', 'error')),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_ticker ON analyses(ticker);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);

-- ===========================================================================
-- AGENT PREDICTIONS
-- ===========================================================================
-- Per-agent prediction records for credibility tracking.
-- One row per agent per analysis (4 rows per analysis).
-- ===========================================================================

CREATE TABLE agent_predictions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id      UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  agent_type       TEXT NOT NULL CHECK (agent_type IN ('economic', 'technical', 'consensus', 'devils_advocate')),
  ticker           TEXT NOT NULL,
  predicted_stance TEXT NOT NULL CHECK (predicted_stance IN ('bullish', 'bearish', 'neutral')),
  confidence       NUMERIC(4, 3) NOT NULL DEFAULT 0.500,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_predictions_analysis_id ON agent_predictions(analysis_id);
CREATE INDEX idx_predictions_agent_type ON agent_predictions(agent_type);

-- ===========================================================================
-- LEADERBOARD (Materialized View)
-- ===========================================================================
-- Joins portfolios, profiles, and trades to produce the leaderboard.
-- Refreshed via refresh_leaderboard() RPC after each trade.
-- ===========================================================================

CREATE MATERIALIZED VIEW leaderboard AS
SELECT
  p.user_id,
  pr.full_name,
  pr.avatar_url,
  p.total_value,
  (p.total_value - 100000.00) AS profit_loss,
  CASE
    WHEN p.total_value > 0
    THEN ROUND(((p.total_value - 100000.00) / 100000.00) * 100, 2)
    ELSE 0
  END AS profit_loss_pct,
  COALESCE(t.trade_count, 0) AS total_trades,
  p.updated_at
FROM portfolios p
JOIN profiles pr ON pr.id = p.user_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS trade_count
  FROM trades
  WHERE trades.portfolio_id = p.id
) t ON true
ORDER BY p.total_value DESC;

CREATE UNIQUE INDEX idx_leaderboard_user_id ON leaderboard(user_id);

-- ===========================================================================
-- refresh_leaderboard() RPC
-- ===========================================================================
-- Called by execute-trade after every trade to keep the leaderboard current.
-- ===========================================================================

CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- Updated-at triggers for new tables
-- ===========================================================================

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- Update handle_new_user to also create a portfolio
-- ===========================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );

  INSERT INTO streaks (user_id)
  VALUES (NEW.id);

  INSERT INTO portfolios (user_id, cash_balance, total_value)
  VALUES (NEW.id, 100000.00, 100000.00);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;