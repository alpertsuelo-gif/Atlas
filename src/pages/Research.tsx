import { useState } from "react";
import type { StockAnalysis, TradeRequest } from "../types";
import { analyzeStock, executeTrade } from "../lib/api";

// ---------------------------------------------------------------------------
// Research — Multi-Agent Stock Analysis & Trade Execution
// ---------------------------------------------------------------------------

export default function ResearchPage() {
  const [ticker, setTicker] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"consensus" | "economic" | "technical" | "devil">("consensus");

  // Trade state
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [trading, setTrading] = useState(false);
  const [tradeResult, setTradeResult] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setTradeResult(null);
    setTradeError(null);

    try {
      const result = await analyzeStock(symbol);
      setAnalysis(result);
      // Pre-fill price from technical analysis if available
      if (result.technical_analysis?.key_levels) {
        const midPrice = (result.technical_analysis.key_levels.support + result.technical_analysis.key_levels.resistance) / 2;
        setPrice(midPrice.toFixed(2));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't analyze that stock. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!analysis || !shares || !price) return;

    setTrading(true);
    setTradeError(null);
    setTradeResult(null);

    try {
      const req: TradeRequest = {
        ticker: analysis.ticker,
        trade_type: tradeType,
        shares: Number(shares),
        price: Number(price),
      };
      const result = await executeTrade(req);
      setTradeResult(
        `${tradeType === "buy" ? "Bought" : "Sold"} ${req.shares} shares of ${req.ticker} at $${req.price.toFixed(2)} — total $${result.trade.total.toFixed(2)}`
      );
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : "Trade failed. Please try again.");
    } finally {
      setTrading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Research</h2>
          <p className="text-sm text-muted mt-1">
            Multi-agent analysis powered by Gemini (fundamentals) and Fireworks (technicals)
          </p>
        </div>

        {/* Ticker Input */}
        <form onSubmit={handleAnalyze} className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm font-mono font-bold">
              $
            </span>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="Enter ticker (e.g., AAPL)"
              maxLength={10}
              className="w-full pl-8 pr-4 py-2.5 bg-surface border border-border rounded-lg text-foreground text-sm font-mono placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 transition-all duration-150 cursor-pointer active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>

        {/* Loading */}
        {loading && (
          <div className="bg-surface border border-border rounded-xl p-12 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-foreground font-medium">Analyzing {ticker}...</p>
              <p className="text-xs text-muted mt-1">
                Economic Advisor and Technical Analyst are researching this stock
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !analysis && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 flex items-start gap-3">
            <div className="w-5 h-5 shrink-0 mt-0.5 text-destructive">
              <AlertIcon />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{error}</p>
              <p className="text-xs text-muted mt-1">Try a different ticker or check your connection.</p>
            </div>
          </div>
        )}

        {/* Analysis Result */}
        {analysis && (
          <div className="space-y-6">
            {/* Final Verdict Banner */}
            <FinalVerdictBanner verdict={analysis.final_verdict} />

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border w-fit">
              {(["consensus", "economic", "technical", "devil"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                    activeTab === tab
                      ? "bg-primary/15 text-primary"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {tab === "consensus" && "Consensus"}
                  {tab === "economic" && "Economic"}
                  {tab === "technical" && "Technical"}
                  {tab === "devil" && "Devil's Advocate"}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-surface border border-border rounded-xl p-6">
              {activeTab === "consensus" && <ConsensusView consensus={analysis.consensus} />}
              {activeTab === "economic" && <EconomicView econ={analysis.economic_analysis} />}
              {activeTab === "technical" && <TechnicalView tech={analysis.technical_analysis} />}
              {activeTab === "devil" && <DevilsAdvocateView devil={analysis.devils_advocate} />}
            </div>

            {/* Trade Execution */}
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="font-heading text-base font-semibold text-foreground mb-4">
                Execute Trade
              </h3>
              <form onSubmit={handleTrade} className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1 max-w-[200px]">
                    <label className="block text-xs font-medium text-muted mb-1.5">Type</label>
                    <div className="flex gap-1 bg-elevated rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => setTradeType("buy")}
                        className={`flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                          tradeType === "buy"
                            ? "bg-success/20 text-success"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        onClick={() => setTradeType("sell")}
                        className={`flex-1 py-2 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer ${
                          tradeType === "sell"
                            ? "bg-destructive/20 text-destructive"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 max-w-[160px]">
                    <label className="block text-xs font-medium text-muted mb-1.5">Shares</label>
                    <input
                      type="number"
                      value={shares}
                      onChange={(e) => setShares(e.target.value)}
                      placeholder="10"
                      min="0.0001"
                      step="any"
                      className="w-full px-3 py-2 bg-elevated border border-border rounded-lg text-foreground text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
                    />
                  </div>
                  <div className="flex-1 max-w-[160px]">
                    <label className="block text-xs font-medium text-muted mb-1.5">Price ($)</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="150.00"
                      min="0.01"
                      step="any"
                      className="w-full px-3 py-2 bg-elevated border border-border rounded-lg text-foreground text-sm placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-150"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={trading || !shares || !price}
                      className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed ${
                        tradeType === "buy"
                          ? "bg-success text-on-primary"
                          : "bg-destructive text-white"
                      }`}
                    >
                      {trading ? "Processing..." : tradeType === "buy" ? "Buy" : "Sell"}
                    </button>
                  </div>
                </div>
              </form>

              {tradeResult && (
                <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <p className="text-sm text-success font-medium">{tradeResult}</p>
                </div>
              )}
              {tradeError && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">{tradeError}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state — no analysis yet */}
        {!analysis && !loading && !error && (
          <div className="bg-surface border border-border rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-elevated border border-border flex items-center justify-center mb-4">
              <SearchIcon />
            </div>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-2">
              Research any stock
            </h3>
            <p className="text-sm text-muted max-w-sm leading-relaxed">
              Enter a ticker symbol above and our AI agents — Economic Advisor and Technical Analyst — will debate and deliver a consensus recommendation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final Verdict Banner
// ---------------------------------------------------------------------------

function FinalVerdictBanner({ verdict }: { verdict: StockAnalysis["final_verdict"] }) {
  const isBuy = verdict.recommendation === "BUY";
  const isSell = verdict.recommendation === "SELL";

  const bgColor = isBuy ? "bg-success/10 border-success/20" : isSell ? "bg-destructive/10 border-destructive/20" : "bg-warning/10 border-warning/20";
  const textColor = isBuy ? "text-success" : isSell ? "text-destructive" : "text-warning";

  return (
    <div className={`${bgColor} border rounded-xl p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Council Verdict</p>
          <div className="flex items-center gap-3 mt-1">
            <span className={`font-heading text-2xl font-bold ${textColor}`}>
              {verdict.recommendation}
            </span>
            <span className="text-sm text-muted">
              {verdict.ticker} • Confidence: {(verdict.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Stance: <span className="capitalize font-medium text-foreground">{verdict.stance}</span>
            {" • "}
            Agreement: <span className="font-medium text-foreground">{verdict.agreement_level.replace(/_/g, " ")}</span>
            {verdict.challenged && (
              <>
                {" • "}
                Counter: <span className="font-medium text-foreground">{verdict.counterargument_strength}</span>
              </>
            )}
          </p>
        </div>
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center ${
            isBuy ? "bg-success/20 text-success" : isSell ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning"
          }`}
        >
          {isBuy ? <ArrowUpIcon /> : isSell ? <ArrowDownIcon /> : <MinusIcon />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consensus View
// ---------------------------------------------------------------------------

function ConsensusView({ consensus }: { consensus: StockAnalysis["consensus"] }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <ScaleIcon />
        </div>
        <h3 className="font-heading text-lg font-semibold text-foreground">Consensus Judge</h3>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{consensus.synthesis}</p>
      <p className="text-sm text-foreground leading-relaxed">{consensus.weighted_rationale}</p>
      {consensus.areas_of_agreement.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-success uppercase tracking-wider mb-2">Areas of Agreement</p>
          <ul className="space-y-1.5">
            {consensus.areas_of_agreement.map((a, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-success mt-1 shrink-0"><CheckIcon /></span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {consensus.areas_of_disagreement.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Areas of Disagreement</p>
          <ul className="space-y-1.5">
            {consensus.areas_of_disagreement.map((a, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-destructive mt-1 shrink-0"><XIcon /></span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
      {consensus.uncertainty_factors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warning uppercase tracking-wider mb-2">Uncertainty Factors</p>
          <ul className="space-y-1.5">
            {consensus.uncertainty_factors.map((u, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-warning mt-1 shrink-0"><AlertTriangleIcon /></span>
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Economic View
// ---------------------------------------------------------------------------

function EconomicView({ econ }: { econ: StockAnalysis["economic_analysis"] }) {
  const stanceColor = econ.stance === "bullish" ? "text-success" : econ.stance === "bearish" ? "text-destructive" : "text-warning";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <GlobeIcon />
        </div>
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Economic Advisor</h3>
          <p className="text-xs text-muted">Powered by Gemini — Fundamentals &amp; Macroeconomics</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold uppercase ${stanceColor}`}>{econ.stance}</span>
        <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              econ.stance === "bullish" ? "bg-success" : econ.stance === "bearish" ? "bg-destructive" : "bg-warning"
            }`}
            style={{ width: `${econ.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted font-medium">{(econ.confidence * 100).toFixed(0)}%</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{econ.reasoning}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Key Factors</p>
          <ul className="space-y-1.5">
            {econ.key_factors.map((f, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary mt-1 shrink-0"><DotIcon /></span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Risks</p>
          <ul className="space-y-1.5">
            {econ.risks.map((r, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-destructive mt-1 shrink-0"><DotIcon /></span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted">Time Horizon: {econ.time_horizon}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical View
// ---------------------------------------------------------------------------

function TechnicalView({ tech }: { tech: StockAnalysis["technical_analysis"] }) {
  const stanceColor = tech.stance === "bullish" ? "text-success" : tech.stance === "bearish" ? "text-destructive" : "text-warning";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <ChartIcon />
        </div>
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Technical Analyst</h3>
          <p className="text-xs text-muted">Powered by Fireworks — Price Action &amp; Indicators</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold uppercase ${stanceColor}`}>{tech.stance}</span>
        <div className="flex-1 h-1.5 bg-elevated rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              tech.stance === "bullish" ? "bg-success" : tech.stance === "bearish" ? "bg-destructive" : "bg-warning"
            }`}
            style={{ width: `${tech.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted font-medium">{(tech.confidence * 100).toFixed(0)}%</span>
      </div>
      {tech.key_levels && (
        <div className="flex gap-4">
          <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
            <p className="text-xs text-muted">Support</p>
            <p className="text-lg font-mono font-bold text-success">${tech.key_levels.support?.toFixed(2) ?? "—"}</p>
          </div>
          <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
            <p className="text-xs text-muted">Resistance</p>
            <p className="text-lg font-mono font-bold text-destructive">${tech.key_levels.resistance?.toFixed(2) ?? "—"}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Signals</p>
          <ul className="space-y-1.5">
            {tech.signals.map((s, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-accent mt-1 shrink-0"><DotIcon /></span>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Risks</p>
          <ul className="space-y-1.5">
            {tech.risks.map((r, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-destructive mt-1 shrink-0"><DotIcon /></span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-xs text-muted">Time Horizon: {tech.time_horizon}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Devil's Advocate View
// ---------------------------------------------------------------------------

function DevilsAdvocateView({ devil }: { devil: StockAnalysis["devils_advocate"] }) {
  const strengthColor =
    devil.counterargument_strength === "very_strong" ? "text-destructive" :
    devil.counterargument_strength === "strong" ? "text-destructive/80" :
    devil.counterargument_strength === "moderate" ? "text-warning" : "text-muted";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center">
          <FlameIcon />
        </div>
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Devil's Advocate</h3>
          <p className="text-xs text-muted">Challenging the consensus</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold uppercase ${strengthColor}`}>
          {devil.challenges_consensus ? `Challenges consensus — ${devil.counterargument_strength.replace(/_/g, " ")}` : "Does not challenge consensus"}
        </span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{devil.reasoning}</p>
      {devil.hidden_risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">Hidden Risks</p>
          <ul className="space-y-1.5">
            {devil.hidden_risks.map((r, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-destructive mt-1 shrink-0"><AlertTriangleIcon /></span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {devil.behavioral_biases.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Behavioral Biases Identified</p>
          <ul className="space-y-1.5">
            {devil.behavioral_biases.map((b, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-muted mt-1 shrink-0"><DotIcon /></span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="bg-elevated rounded-lg p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Worst Case Scenario</p>
        <p className="text-sm text-foreground leading-relaxed">{devil.worst_case_scenario}</p>
      </div>
      <div className="bg-elevated rounded-lg p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">What the Market Might Be Missing</p>
        <p className="text-sm text-foreground leading-relaxed">{devil.alternative_view}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-destructive">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}