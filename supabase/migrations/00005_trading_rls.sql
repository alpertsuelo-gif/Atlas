-- =============================================================================
-- Atlas — Migration 005: RLS for Trading Tables
-- =============================================================================
-- Enables RLS on all trading & CouncilAI tables and creates ownership policies.

BEGIN;

-- ===========================================================================
-- portfolios
-- ===========================================================================

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios_owner_access" ON portfolios
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- holdings
-- ===========================================================================

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

-- Holdings are accessed through their portfolio. Check that the portfolio
-- belongs to the authenticated user.
CREATE POLICY "holdings_via_portfolio" ON holdings
  FOR ALL USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()
    )
  );

-- ===========================================================================
-- trades
-- ===========================================================================

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_via_portfolio" ON trades
  FOR ALL USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()
    )
  );

-- ===========================================================================
-- analyses
-- ===========================================================================

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analyses_owner_access" ON analyses
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- agent_predictions
-- ===========================================================================

ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;

-- Predictions are accessed through their parent analysis.
CREATE POLICY "predictions_via_analysis" ON agent_predictions
  FOR ALL USING (
    analysis_id IN (
      SELECT id FROM analyses WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    analysis_id IN (
      SELECT id FROM analyses WHERE user_id = auth.uid()
    )
  );

-- ===========================================================================
-- leaderboard
-- ===========================================================================

-- The leaderboard is a public read-only view. Everyone can see rankings.
ALTER MATERIALIZED VIEW leaderboard ENABLE ROW LEVEL SECURITY;

-- No RLS policy needed — the view is read-only with no sensitive data.
-- Users can only see aggregated stats they could compute from public data.

COMMIT;