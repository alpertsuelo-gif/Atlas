// =============================================================================
// Atlas × CouncilAI — Multi-Agent Stock Analysis
// =============================================================================
// Orchestrates a multi-agent debate:
//   1. Economic Advisor (Gemini) — macro, fundamentals, industry
//   2. Technical Analyst (Fireworks or Gemini) — price action, indicators
//   3. Consensus Judge — synthesizes both, finds agreement/disagreement
//   4. Devil's Advocate — challenges the consensus, surfaces hidden risks
//
// All four agents run in a structured pipeline. The full analysis is saved to
// the database and returned as JSON.
//
// If FIREWORKS_API_KEY is set, the Technical Analyst uses Fireworks (Llama)
// for a diversity of opinion. Otherwise it falls back to Gemini.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CORS_HEADERS, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { getDb, requireAuth } from "../_shared/db.ts";
import { GeminiProvider } from "../_shared/providers/gemini.ts";
import { FireworksProvider } from "../_shared/providers/fireworks.ts";
import type { AIProvider } from "../_shared/types.ts";
import type { ChatMessage } from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// Agent Prompts
// ---------------------------------------------------------------------------

const ECONOMIC_PROMPT = `You are the Economic Advisor at CouncilAI, an elite investment analysis firm. Your role is to analyze a stock purely from a macroeconomic, fundamental, and industry perspective.

You must NEVER use technical indicators (moving averages, RSI, MACD, support/resistance, chart patterns, volume analysis, etc.). Your analysis must be based entirely on:

- Macroeconomic conditions (interest rates, inflation, GDP, employment)
- Industry trends and competitive landscape
- Company fundamentals (revenue, earnings, margins, debt, cash flow, P/E, growth rates)
- Geopolitical risks and regulatory environment
- Management quality and corporate governance

Output your analysis as a valid JSON object with exactly these fields:
{
  "stance": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 to 1.0,
  "reasoning": "Detailed analysis with specific data points and rationale",
  "key_factors": ["list of 3-5 most important factors"],
  "risks": ["list of 2-4 key risks to your thesis"],
  "time_horizon": "short-term (1-3 months)" | "medium-term (3-12 months)" | "long-term (12+ months)"
}

Be decisive. Do not hedge excessively. Your confidence score should reflect genuine conviction.`;

const TECHNICAL_PROMPT = `You are the Technical Analyst at CouncilAI, an elite investment analysis firm. Your role is to analyze a stock purely from a technical analysis perspective.

You must NEVER use fundamental data (revenue, earnings, P/E ratios, management quality, industry trends, macroeconomics, etc.). Your analysis must be based entirely on:

- Price action and trend analysis
- Volume analysis
- Moving averages (SMA, EMA) and crossovers
- RSI, MACD, Stochastic oscillators
- Support and resistance levels
- Chart patterns (head and shoulders, triangles, flags, etc.)
- Momentum indicators
- Bollinger Bands, Fibonacci retracements

Output your analysis as a valid JSON object with exactly these fields:
{
  "stance": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 to 1.0,
  "signals": ["list of 3-5 specific technical signals"],
  "key_levels": { "support": number, "resistance": number },
  "risks": ["list of 2-4 technical risks"],
  "time_horizon": "short-term (1-3 months)" | "medium-term (3-12 months)" | "long-term (12+ months)"
}

Be decisive. Do not hedge excessively. Your confidence score should reflect genuine conviction.`;

const CONSENSUS_PROMPT = `You are the Consensus Judge at CouncilAI. You have received two independent analyses of a stock — one from the Economic Advisor (fundamental/macro) and one from the Technical Analyst (price action/indicators). Your job is to synthesize them into one coherent verdict.

Rules:
- Identify where the two analyses AGREE and where they DISAGREE
- If they disagree, explain which analysis carries more weight and why
- If they agree, the confidence should compound (higher than either individually)
- If they strongly disagree, explain the uncertainty honestly
- Produce a single, actionable final verdict

Output as JSON:
{
  "agreement_level": "strong_agreement" | "partial_agreement" | "neutral" | "partial_disagreement" | "strong_disagreement",
  "final_stance": "bullish" | "bearish" | "neutral",
  "final_confidence": 0.0 to 1.0,
  "synthesis": "Detailed synthesis explaining how you weighed the two analyses",
  "areas_of_agreement": ["list of points where both analyses align"],
  "areas_of_disagreement": ["list of points where analyses diverge"],
  "weighted_rationale": "Which analysis carried more weight and why",
  "uncertainty_factors": ["key sources of uncertainty in this verdict"],
  "recommendation": "BUY" | "SELL" | "HOLD"
}`;

const DEVILS_ADVOCATE_PROMPT = `You are the Devil's Advocate at CouncilAI. Your job is to challenge the consensus recommendation with the strongest possible counterargument. You are not a contrarian for its own sake — you must find genuine, well-reasoned risks that could invalidate the consensus thesis.

Rules:
- Challenge EVERY aspect of the consensus: the stance, confidence, reasoning, and assumptions
- Identify hidden risks that neither the Economic Advisor nor Technical Analyst surfaced
- Consider black swan scenarios, behavioral biases, and market irrationality
- If the consensus is genuinely flawless, say so — but be skeptical
- Your counterargument must be specific and data-driven, not generic

Output as JSON:
{
  "challenges_consensus": true | false,
  "counterargument_strength": "weak" | "moderate" | "strong" | "very_strong",
  "counter_stance": "bullish" | "bearish" | "neutral",
  "reasoning": "Detailed counterargument with specific risks",
  "hidden_risks": ["list of risks the other agents missed"],
  "behavioral_biases": ["potential cognitive biases in the consensus"],
  "worst_case_scenario": "Description of the worst plausible outcome",
  "alternative_view": "What the market might be missing"
}`;

// ---------------------------------------------------------------------------
// Provider instantiation
// ---------------------------------------------------------------------------

function getGemini(): GeminiProvider {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GeminiProvider(key);
}

/** Returns Fireworks if the key is available, otherwise falls back to Gemini. */
function getTechnicalProvider(): AIProvider {
  const fireworksKey = Deno.env.get("FIREWORKS_API_KEY");
  if (fireworksKey) return new FireworksProvider(fireworksKey);
  return getGemini();
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

function extractJson(raw: string): Record<string, unknown> {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // fall through
      }
    }
    // Try to find JSON object boundaries
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error("Failed to parse agent response as JSON");
  }
}

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

    if (!ticker || ticker.length > 10 || !/^[A-Z0-9.]+$/.test(ticker)) {
      return jsonResponse(
        { error: "validation", message: "Please provide a valid ticker symbol (e.g., AAPL, TSLA)." },
        400,
      );
    }

    const gemini = getGemini();
    const technical = getTechnicalProvider();

    // --- Step 1: Economic Advisor (Gemini) + Technical Analyst (Fireworks/Gemini) in parallel ---

    const economicMessages: ChatMessage[] = [
      { role: "system", content: ECONOMIC_PROMPT },
      { role: "user", content: `Analyze ${ticker}. Provide your fundamental and macroeconomic analysis.` },
    ];

    const technicalMessages: ChatMessage[] = [
      { role: "system", content: TECHNICAL_PROMPT },
      { role: "user", content: `Analyze ${ticker}. Provide your technical analysis with specific price levels and indicators.` },
    ];

    const [economicResult, technicalResult] = await Promise.all([
      gemini.chat(economicMessages, { temperature: 0.4, maxTokens: 1500, responseFormat: "json" }),
      technical.chat(technicalMessages, { temperature: 0.4, maxTokens: 1500, responseFormat: "json" }),
    ]);

    const economicAnalysis = extractJson(economicResult.content);
    const technicalAnalysis = extractJson(technicalResult.content);

    // --- Step 2: Consensus Judge ---

    const consensusMessages: ChatMessage[] = [
      { role: "system", content: CONSENSUS_PROMPT },
      {
        role: "user",
        content: `Synthesize these two analyses for ${ticker}:\n\nECONOMIC ANALYSIS:\n${JSON.stringify(economicAnalysis, null, 2)}\n\nTECHNICAL ANALYSIS:\n${JSON.stringify(technicalAnalysis, null, 2)}`,
      },
    ];

    const consensusResult = await gemini.chat(consensusMessages, {
      temperature: 0.3,
      maxTokens: 1500,
      responseFormat: "json",
    });

    const consensus = extractJson(consensusResult.content);

    // --- Step 3: Devil's Advocate ---

    const devilsAdvocateMessages: ChatMessage[] = [
      { role: "system", content: DEVILS_ADVOCATE_PROMPT },
      {
        role: "user",
        content: `Challenge this consensus analysis for ${ticker}:\n\nECONOMIC:\n${JSON.stringify(economicAnalysis, null, 2)}\n\nTECHNICAL:\n${JSON.stringify(technicalAnalysis, null, 2)}\n\nCONSENSUS:\n${JSON.stringify(consensus, null, 2)}`,
      },
    ];

    const devilResult = await gemini.chat(devilsAdvocateMessages, {
      temperature: 0.5,
      maxTokens: 1200,
      responseFormat: "json",
    });

    const devilsAdvocate = extractJson(devilResult.content);

    // --- Step 4: Build final verdict ---

    const finalVerdict = {
      ticker,
      recommendation: consensus.recommendation ?? "HOLD",
      confidence: consensus.final_confidence ?? 0.5,
      stance: consensus.final_stance ?? "neutral",
      agreement_level: consensus.agreement_level ?? "neutral",
      challenged: devilsAdvocate.challenges_consensus ?? false,
      counterargument_strength: devilsAdvocate.counterargument_strength ?? "moderate",
      timestamp: new Date().toISOString(),
    };

    // --- Step 5: Store in database ---

    const db = getDb();
    const { data: analysis, error: insertError } = await db
      .from("analyses")
      .insert({
        user_id: userId,
        ticker,
        economic_analysis: economicAnalysis,
        technical_analysis: technicalAnalysis,
        consensus,
        devils_advocate: devilsAdvocate,
        final_verdict: finalVerdict,
        status: "completed",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save analysis:", insertError);
    }

    // --- Step 6: Store agent predictions for credibility tracking ---

    if (analysis) {
      const predictions = [
        {
          analysis_id: analysis.id,
          agent_type: "economic",
          ticker,
          predicted_stance: (economicAnalysis.stance as string) ?? "neutral",
          confidence: (economicAnalysis.confidence as number) ?? 0.5,
        },
        {
          analysis_id: analysis.id,
          agent_type: "technical",
          ticker,
          predicted_stance: (technicalAnalysis.stance as string) ?? "neutral",
          confidence: (technicalAnalysis.confidence as number) ?? 0.5,
        },
        {
          analysis_id: analysis.id,
          agent_type: "consensus",
          ticker,
          predicted_stance: (consensus.final_stance as string) ?? "neutral",
          confidence: (consensus.final_confidence as number) ?? 0.5,
        },
        {
          analysis_id: analysis.id,
          agent_type: "devils_advocate",
          ticker,
          predicted_stance: (devilsAdvocate.counter_stance as string) ?? "neutral",
          confidence: 0.5,
        },
      ];

      await db.from("agent_predictions").insert(predictions);
    }

    // --- Return ---

    return jsonResponse({
      analysis_id: analysis?.id ?? null,
      ticker,
      economic_analysis: economicAnalysis,
      technical_analysis: technicalAnalysis,
      consensus,
      devils_advocate: devilsAdvocate,
      final_verdict: finalVerdict,
    });
  } catch (error) {
    console.error("[analyze-stock]", error);
    const message = error instanceof Error ? error.message : "Something went wrong analyzing this stock. Please try again.";
    const status = error instanceof Error && error.name === "UnauthorizedError" ? 401 : 500;
    return jsonResponse({ error: "analysis_failed", message }, status);
  }
});