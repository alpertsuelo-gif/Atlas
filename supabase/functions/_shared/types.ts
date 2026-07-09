// =============================================================================
// Atlas — Shared Type Definitions
// =============================================================================
// Every type used across Edge Functions, the AI provider layer, and the
// database layer is defined here. Nothing is duplicated across modules.

// -----------------------------------------------------------------------------
// Database Row Types (mirrors the PostgreSQL schema exactly)
// -----------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = "processing" | "ready" | "error";
export type FileType = "pdf" | "markdown" | "txt" | "code" | "image";

export interface Document {
  id: string;
  user_id: string;
  title: string;
  file_type: FileType;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  metadata: DocumentMetadata;
  created_at: string;
  updated_at: string;
}

export interface DocumentMetadata {
  author?: string;
  page_count?: number;
  source_url?: string;
  language?: string;
  [key: string]: unknown;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  user_id: string;
  chunk_index: number;
  content: string;
  token_count: number | null;
  embedding: number[] | null; // vector(768) deserialised
  metadata: ChunkMetadata;
  created_at: string;
}

export interface ChunkMetadata {
  heading?: string;
  page_number?: number;
  start_char?: number;
  end_char?: number;
  [key: string]: unknown;
}

export type ConversationContextType = "general" | "document" | "project" | "code";

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  context_type: ConversationContextType;
  context_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Citation {
  chunk_id: string;
  document_id: string;
  content_snippet: string;
  similarity: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  token_count: number | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  source_type: "document" | "manual" | "web-clip" | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  completed_at: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type CardRating = "again" | "hard" | "good" | "easy";

export interface LearningCard {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  source_type: "document" | "quiz" | "manual" | null;
  source_id: string | null;
  difficulty: number; // 1-5
  due_date: string;
  interval_days: number;
  ease_factor: number; // min 1.3
  review_count: number;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface CardReview {
  id: string;
  card_id: string;
  user_id: string;
  rating: CardRating;
  reviewed_at: string;
  time_taken_ms: number | null;
}

export interface QuizQuestion {
  question: string;
  options: string[]; // 4 options for MCQ
  correct_index: number;
  explanation: string;
}

export interface QuizAnswer {
  question_index: number;
  selected_option: number | null;
  answer_text: string | null;
  is_correct: boolean | null;
}

export interface QuizSession {
  id: string;
  user_id: string;
  title: string | null;
  source_ids: string[];
  question_count: number;
  questions: QuizQuestion[];
  user_answers: QuizAnswer[] | null;
  score: number | null; // 0.0 to 1.0
  created_at: string;
}

export interface CodeSnippet {
  id: string;
  user_id: string;
  title: string | null;
  language: string;
  code: string;
  source_document_id: string | null;
  created_at: string;
}

export interface CodeReviewResult {
  overall_score: number;
  bugs: CodeIssue[];
  style: StyleIssue[];
  security: SecurityIssue[];
  performance: PerformanceIssue[];
  summary: string;
}

export interface CodeIssue {
  severity: "critical" | "high" | "medium" | "low";
  line: number | null;
  description: string;
  fix: string;
}

export interface StyleIssue {
  suggestion: string;
  rationale: string;
}

export interface SecurityIssue {
  vulnerability: string;
  severity: "critical" | "high" | "medium" | "low";
  fix: string;
}

export interface PerformanceIssue {
  issue: string;
  impact: string;
  suggestion: string;
}

export interface CodeReview {
  id: string;
  snippet_id: string;
  user_id: string;
  review_result: CodeReviewResult;
  model_used: string | null;
  token_count: number | null;
  created_at: string;
}

export type ProgressEventType =
  | "document_uploaded"
  | "note_created"
  | "quiz_completed"
  | "card_reviewed"
  | "task_completed"
  | "streak_day";

export interface ProgressEvent {
  id: string;
  user_id: string;
  event_type: ProgressEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Streak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// AI Provider Types
// -----------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: "text" | "json";
}

export interface ChatResponse {
  content: string;
  usage: ChatUsage;
  model: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export interface AIProvider {
  /** Generate embeddings for multiple texts in a single batch call. */
  embed(texts: string[]): Promise<number[][]>;

  /** Convenience wrapper that embeds a single text. */
  embedSingle(text: string): Promise<number[]>;

  /** Non-streaming chat completion. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Streaming chat completion returning an async iterable of chunks. */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<ChatChunk>;
}

// -----------------------------------------------------------------------------
// API Request / Response Types
// -----------------------------------------------------------------------------

// POST /api/query
export interface QueryRequest {
  conversation_id: string;
  document_id?: string | null;
  query: string;
}

export interface QueryCitationEvent {
  type: "citation";
  chunks: Citation[];
}

export interface QueryTokenEvent {
  type: "token";
  content: string;
}

export interface QueryDoneEvent {
  type: "done";
  message_id: string;
  usage: ChatUsage;
}

export type QuerySSEEvent = QueryCitationEvent | QueryTokenEvent | QueryDoneEvent;

// POST /api/summarize
export type SummaryDepth = "short" | "medium" | "detailed";

export interface SummarizeRequest {
  document_id: string;
  depth: SummaryDepth;
  max_tokens?: number;
}

// POST /api/quiz/generate
export type QuizQuestionType = "mcq" | "short_answer";

export interface GenerateQuizRequest {
  document_ids: string[];
  question_count: number;
  types: QuizQuestionType[];
}

export interface GenerateQuizResponse {
  quiz_id: string;
  title: string;
  questions: QuizQuestion[];
}

// POST /api/quiz/:id/submit
export interface SubmitQuizRequest {
  answers: {
    question_index: number;
    selected_option?: number;
    answer_text?: string;
  }[];
}

export interface SubmitQuizResponse {
  score: number;
  graded_questions: (QuizQuestion & {
    user_answer: QuizAnswer;
  })[];
}

// POST /api/code/review
export type ReviewFocus = "bugs" | "style" | "security" | "performance";

export interface CodeReviewRequest {
  code: string;
  language: string;
  focus?: ReviewFocus[];
}

export interface CodeReviewResponse {
  review: CodeReviewResult;
}

// GET /api/progress
export interface ProgressResponse {
  current_streak: number;
  longest_streak: number;
  total_documents: number;
  total_quizzes: number;
  total_cards_reviewed: number;
  weekly_activity: { date: string; event_count: number }[];
  recent_events: ProgressEvent[];
}

// Generic API wrapper
export interface ApiSuccessResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// -----------------------------------------------------------------------------
// Document Processing Types
// -----------------------------------------------------------------------------

export interface ExtractionResult {
  text: string;
  metadata: DocumentMetadata;
  pageCount: number;
}

export interface ChunkResult {
  content: string;
  index: number;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ProcessDocumentPayload {
  document_id: string;
  user_id: string;
  storage_path: string;
  file_type: FileType;
}

// -----------------------------------------------------------------------------
// Vector Search Types
// -----------------------------------------------------------------------------

export interface VectorSearchResult {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: ChunkMetadata;
}