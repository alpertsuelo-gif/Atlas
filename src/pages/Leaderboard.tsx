import { useState, useEffect } from "react";
import type { LeaderboardEntry } from "../types";
import { getLeaderboard } from "../lib/api";

// ---------------------------------------------------------------------------
// Leaderboard — Ranked investor performance
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaderboard();
      setEntries(data);
    } catch {
      setError("We couldn't load the leaderboard right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error
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
            onClick={loadLeaderboard}
            className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-lg hover:brightness-110 transition-all duration-150 cursor-pointer active:scale-[0.97]"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (entries.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 lg:p-8">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-foreground">Leaderboard</h2>
            <p className="text-sm text-muted mt-1">See how your portfolio stacks up</p>
          </div>
          <div className="mt-8 bg-surface border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center mb-4">
              <TrophyIcon />
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
              No investors yet
            </h3>
            <p className="text-sm text-muted max-w-sm leading-relaxed">
              The leaderboard will fill up as more users build their portfolios. Be the first to make a trade and claim the top spot!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Leaderboard
  // ---------------------------------------------------------------------------
  const topEntry = entries[0];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-8">
        <div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Leaderboard</h2>
          <p className="text-sm text-muted mt-1">Ranked by portfolio value — all trades are simulated</p>
        </div>

        {/* Top Performer */}
        {topEntry && (
          <div className="bg-surface border border-primary/20 rounded-xl p-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <TrophyIcon filled />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-primary uppercase tracking-wider">Top Performer</p>
              <p className="font-heading text-xl font-semibold text-foreground mt-0.5">
                {topEntry.full_name ?? "Anonymous Investor"}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-foreground font-mono font-semibold">
                  ${topEntry.total_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-sm font-medium ${topEntry.profit_loss_pct >= 0 ? "text-success" : "text-destructive"}`}>
                  {topEntry.profit_loss_pct >= 0 ? "+" : ""}{topEntry.profit_loss_pct.toFixed(2)}%
                </span>
                <span className="text-xs text-muted">{topEntry.total_trades} trades</span>
              </div>
            </div>
          </div>
        )}

        {/* Rankings Table */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 bg-elevated/50 border-b border-border text-xs font-medium text-muted uppercase tracking-wider">
            <span className="w-10">Rank</span>
            <span>Investor</span>
            <span className="text-right w-24">Value</span>
            <span className="text-right w-20">P&amp;L</span>
            <span className="text-right w-16">Trades</span>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {entries.map((entry, i) => (
              <div
                key={entry.user_id}
                className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3.5 items-center transition-colors duration-150 hover:bg-elevated/30 ${
                  i === 0 ? "bg-primary/5" : ""
                }`}
              >
                {/* Rank */}
                <div className="w-10 flex justify-center">
                  {i === 0 ? (
                    <span className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      1
                    </span>
                  ) : i === 1 ? (
                    <span className="w-7 h-7 rounded-full bg-muted/10 flex items-center justify-center text-xs font-bold text-muted">
                      2
                    </span>
                  ) : i === 2 ? (
                    <span className="w-7 h-7 rounded-full bg-amber-700/20 flex items-center justify-center text-xs font-bold text-amber-600">
                      3
                    </span>
                  ) : (
                    <span className="text-sm text-muted font-medium">{i + 1}</span>
                  )}
                </div>

                {/* Investor */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-elevated border border-border flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-muted">
                      {(entry.full_name ?? "A")[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">
                    {entry.full_name ?? "Anonymous Investor"}
                  </span>
                </div>

                {/* Value */}
                <span className="text-sm font-mono font-semibold text-foreground text-right w-24">
                  ${entry.total_value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                </span>

                {/* P&L */}
                <span
                  className={`text-sm font-medium text-right w-20 ${
                    entry.profit_loss_pct >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {entry.profit_loss_pct >= 0 ? "+" : ""}{entry.profit_loss_pct.toFixed(1)}%
                </span>

                {/* Trades */}
                <span className="text-sm text-muted text-right w-16">
                  {entry.total_trades}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function TrophyIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={filled ? "text-primary" : "text-muted"}
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
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