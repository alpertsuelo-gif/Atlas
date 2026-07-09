// =============================================================================
// Atlas × CouncilAI — API Client
// =============================================================================

import type {
  Document, Conversation, Message,
  Portfolio, Holding, Trade, StockAnalysis,
  AnalysisRecord, LeaderboardEntry, TradeRequest, TradeResponse,
} from "../types";

const FUNCTIONS_BASE = "/api";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("atlas_token") ?? ""}`,
  };
}

function apiError(res: Response, fallback: string): Error {
  return new Error(`[${res.status}] ${fallback}`);
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export async function getPortfolio(): Promise<Portfolio> {
  const res = await fetch(`${FUNCTIONS_BASE}/portfolio`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load portfolio");
  return res.json();
}

export async function getHoldings(): Promise<Holding[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/holdings`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load holdings");
  const data = await res.json();
  return data.holdings ?? [];
}

export async function getTrades(limit = 50): Promise<Trade[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/trades?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load trades");
  const data = await res.json();
  return data.trades ?? [];
}

export async function executeTrade(req: TradeRequest): Promise<TradeResponse> {
  const res = await fetch(`${FUNCTIONS_BASE}/execute-trade`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Trade failed");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Stock Analysis
// ---------------------------------------------------------------------------

export async function analyzeStock(ticker: string): Promise<StockAnalysis> {
  const res = await fetch(`${FUNCTIONS_BASE}/analyze-stock`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? "Analysis failed");
  }
  return res.json();
}

export async function getAnalyses(limit = 20): Promise<AnalysisRecord[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/analyses?limit=${limit}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load analyses");
  const data = await res.json();
  return data.analyses ?? [];
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/leaderboard`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load leaderboard");
  const data = await res.json();
  return data.leaderboard ?? [];
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function getDocuments(): Promise<Document[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/documents`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load documents");
  const data = await res.json();
  return data.documents ?? [];
}

export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${FUNCTIONS_BASE}/process-document`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw apiError(res, "Failed to upload document");
  return res.json();
}

// ---------------------------------------------------------------------------
// Chat / RAG Query
// ---------------------------------------------------------------------------

export interface QueryParams {
  conversation_id?: string;
  document_id?: string;
  query: string;
}

export function streamQuery(
  params: QueryParams,
  onToken: (token: string) => void,
  onCitations: (citations: unknown[]) => void,
  onDone: (messageId: string) => void,
  onError: (error: string) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${FUNCTIONS_BASE}/rag-query`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        onError(err.message ?? "Query failed");
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError("No response stream"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "citation": onCitations(event.chunks ?? []); break;
              case "token": onToken(event.content ?? ""); break;
              case "done": onDone(event.message_id ?? ""); break;
              case "error": onError(event.message ?? "Unknown error"); break;
            }
          } catch { /* skip malformed events */ }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(err.message ?? "Network error");
    });

  return controller;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${FUNCTIONS_BASE}/conversations`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw apiError(res, "Failed to load conversations");
  const data = await res.json();
  return data.conversations ?? [];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(
    `${FUNCTIONS_BASE}/conversations/${conversationId}/messages`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw apiError(res, "Failed to load messages");
  const data = await res.json();
  return data.messages ?? [];
}