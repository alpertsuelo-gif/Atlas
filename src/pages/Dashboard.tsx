import { useState, useEffect } from "react";
import type { Portfolio, Holding, Trade } from "../types";
import { getPortfolio, getHoldings, getTrades } from "../lib/api";

// ---------------------------------------------------------------------------
// Dashboard — Portfolio overview, holdings, recent trades
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [p, h, t] = await Promise.all([
        getPortfolio().catch(() => null),
        getHoldings().catch(() => []),
        getTrades(10).catch(() => []),
      ]);
      setPortfolio(p);
      setHoldings(h);
      setTrades(t);
    } catch {
      setError("We couldn't load your portfolio right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const profitLoss = portfolio ? portfolio.total_value - 100000 : 0;
  const profitLossPct = portfolio ? ((portfolio.total_value - 100000) / 100000) * 100 : 0;

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
            <AlertIcon />
          </div>
          <p className="text-foreground font-medium">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:brightness-110 transition-all duration-150 cursor-pointer active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state (no portfolio — shouldn't happen, but handle gracefully)
  // ---------------------------------------------------------------------------
  if (!portfolio) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-surface border border-border flex items-center justify-center">
            <BriefcaseIcon />
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Welcome to Atlas
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            Your portfolio isn't ready yet. Head over to the Research tab to analyze your first stock and start building your virtual portfolio.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Dashboard content
  // ---------------------------------------------------------------------------
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted mt-1">Your virtual portfolio at a glance</p>
        </div>

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Value"
            value={`$${portfolio.total_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            icon={<BriefcaseIcon />}
          />
          <SummaryCard
            label="Cash Balance"
            value={`$${portfolio.cash_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            icon={<DollarIcon />}
          />
          <SummaryCard
            label="Profit / Loss"
            value={`${profitLoss >= 0 ? "+" : ""}$${Math.abs(profitLoss).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
            trend={profitLossPct}
            icon={<TrendIcon trend={profitLoss >= 0} />}
          />
          <SummaryCard
            label="Total Trades"
            value={String(trades.length)}
            icon={<ActivityIcon />}
          />
        </div>

        {/* Holdings & Recent Trades */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Holdings */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="font-heading text-base font-semibold text-foreground mb-4">
              Holdings
            </h3>
            {holdings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted text-sm">No holdings yet.</p>
                <p className="text-muted/60 text-xs mt-1">
                  Research a stock and make your first trade to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {holdings.map((h) => {
                  const marketValue = h.shares * h.avg_cost_basis;
                  return (
                    <div
                      key={h.id}
                      className="flex items-center justify-between py-3 px-3 rounded-lg bg-elevated/50 hover:bg-elevated transition-colors duration-150"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground font-mono">
                          {h.ticker}
                        </p>
                        <p className="text-xs text-muted">
                          {h.shares.toFixed(4)} shares
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          ${marketValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted">
                          @ ${h.avg_cost_basis.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Trades */}
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="font-heading text-base font-semibold text-foreground mb-4">
              Recent Trades
            </h3>
            {trades.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted text-sm">No trades yet.</p>
                <p className="text-muted/60 text-xs mt-1">
                  Your trade history will appear here once you start trading.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {trades.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-3 px-3 rounded-lg bg-elevated/50"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          t.trade_type === "buy" ? "bg-success" : "bg-destructive"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-mono font-semibold">{t.ticker}</span>
                          {" "}
                          <span className={t.trade_type === "buy" ? "text-success" : "text-destructive"}>
                            {t.trade_type.toUpperCase()}
                          </span>
                        </p>
                        <p className="text-xs text-muted">
                          {t.shares.toFixed(4)} @ ${t.price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      ${t.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  trend,
  icon,
}: {
  label: string;
  value: string;
  trend?: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/20 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
        <span className="text-muted/60">{icon}</span>
      </div>
      <p className="text-xl font-semibold text-foreground font-heading">{value}</p>
      {trend !== undefined && (
        <p
          className={`text-xs mt-1.5 font-medium ${
            trend >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {trend >= 0 ? "+" : ""}{trend.toFixed(2)}% all time
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function BriefcaseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function TrendIcon({ trend }: { trend: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={trend ? "text-success" : "text-destructive"}>
      {trend ? (
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      ) : (
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      )}
      {trend ? (
        <polyline points="17 6 23 6 23 12" />
      ) : (
        <polyline points="17 18 23 18 23 12" />
      )}
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-destructive">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}