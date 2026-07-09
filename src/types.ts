// =============================================================================
// Atlas × CouncilAI — Frontend Types
// =============================================================================

export type DocumentStatus = "uploading" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  title: string;
  file_type: string;
  status: DocumentStatus;
  error_message?: string;
  chunk_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  created_at: string;
}

export interface Citation {
  chunk_id: string;
  document_id: string;
  content_snippet: string;
  similarity: number;
}

// =============================================================================
// CouncilAI — Investment Types
// =============================================================================

export type View = "dashboard" | "research" | "documents" | "chat" | "leaderboard";

export interface Portfolio {
  id: string;
  user_id: string;
  cash_balance: number;
  total_value: number;
  created_at: string;
  updated_at: string;
}

export interface Holding {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  avg_cost_basis: number;
  created_at: string;
  updated_at: string;
}

export interface Trade {
  id: string;
  portfolio_id: string;
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  price: number;
  total: number;
  notes?: string;
  created_at: string;
}

export interface AgentStance {
  stance: "bullish" | "bearish" | "neutral";
  confidence: number;
}

export interface EconomicAnalysis extends AgentStance {
  reasoning: string;
  key_factors: string[];
  risks: string[];
  time_horizon: string;
}

export interface TechnicalAnalysis extends AgentStance {
  signals: string[];
  key_levels: { support: number; resistance: number };
  risks: string[];
  time_horizon: string;
}

export interface ConsensusAnalysis {
  agreement_level: string;
  final_stance: "bullish" | "bearish" | "neutral";
  final_confidence: number;
  synthesis: string;
  areas_of_agreement: string[];
  areas_of_disagreement: string[];
  weighted_rationale: string;
  uncertainty_factors: string[];
  recommendation: "BUY" | "SELL" | "HOLD";
}

export interface DevilsAdvocateAnalysis {
  challenges_consensus: boolean;
  counterargument_strength: "weak" | "moderate" | "strong" | "very_strong";
  counter_stance: "bullish" | "bearish" | "neutral";
  reasoning: string;
  hidden_risks: string[];
  behavioral_biases: string[];
  worst_case_scenario: string;
  alternative_view: string;
}

export interface FinalVerdict {
  ticker: string;
  recommendation: "BUY" | "SELL" | "HOLD";
  confidence: number;
  stance: "bullish" | "bearish" | "neutral";
  agreement_level: string;
  challenged: boolean;
  counterargument_strength: string;
  timestamp: string;
}

export interface StockAnalysis {
  analysis_id: string | null;
  ticker: string;
  economic_analysis: EconomicAnalysis;
  technical_analysis: TechnicalAnalysis;
  consensus: ConsensusAnalysis;
  devils_advocate: DevilsAdvocateAnalysis;
  final_verdict: FinalVerdict;
}

export type AnalysisStatus = "pending" | "in_progress" | "completed" | "error";

export interface AnalysisRecord {
  id: string;
  ticker: string;
  company_name?: string;
  final_verdict: FinalVerdict;
  status: AnalysisStatus;
  created_at: string;
}

export interface AgentCredibility {
  agent_type: "economic" | "technical" | "consensus" | "devils_advocate";
  total_predictions: number;
  verified_predictions: number;
  correct_predictions: number;
  accuracy: number;
  avg_confidence: number;
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  total_value: number;
  profit_loss: number;
  profit_loss_pct: number;
  total_trades: number;
  updated_at: string;
}

export interface TradeRequest {
  ticker: string;
  trade_type: "buy" | "sell";
  shares: number;
  price: number;
}

export interface TradeResponse {
  success: boolean;
  trade: {
    ticker: string;
    trade_type: string;
    shares: number;
    price: number;
    total: number;
  };
  portfolio: {
    cash_balance: number;
    total_value: number;
  };
}