import { useState, useRef, useEffect } from "react";
import type { Message } from "../types";

// ---------------------------------------------------------------------------
// Mock messages for demo
// ---------------------------------------------------------------------------

const INITIAL_MESSAGES: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hi! I'm Atlas, your AI learning companion. I can answer questions about your uploaded documents.\n\nUpload some documents first, then ask me anything about their contents. I'll ground my answers in what you've shared.",
    created_at: new Date().toISOString(),
  },
];

// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent]);

  function handleSend() {
    const query = input.trim();
    if (!query || streaming) return;

    // Add user message
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamedContent("");

    // Simulate streaming response (mock — replace with real API call)
    simulateStreamingResponse(query);
  }

  function simulateStreamingResponse(query: string) {
    const responses: Record<string, string> = {
      default:
        "That's a great question! In a production setup, I would search through your document chunks using vector similarity and provide a grounded answer.\n\nRight now, Supabase isn't connected to this project. Connect it to enable:\n\n- **Document processing** — extract text, chunk, and embed\n- **Vector search** — find the most relevant passages\n- **RAG responses** — streaming answers grounded in your documents\n\nTry uploading a document on the Documents page first!",
    };

    const response =
      Object.entries(responses).find(([key]) =>
        query.toLowerCase().includes(key),
      )?.[1] ?? responses.default;

    const words = response.split(" ");
    let i = 0;

    const interval = setInterval(() => {
      if (i < words.length) {
        setStreamedContent(
          (prev) => prev + (prev ? " " : "") + words[i],
        );
        i++;
      } else {
        clearInterval(interval);
        // Commit the full message
        setStreamedContent("");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: response,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreaming(false);
      }
    }, 40);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen">
      {/* Chat Header */}
      <div className="px-8 py-5 border-b border-border shrink-0">
        <h2 className="font-heading text-lg font-semibold text-foreground">
          Chat
        </h2>
        <p className="text-xs text-muted mt-0.5">
          Ask questions about your documents
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming message */}
        {streaming && streamedContent && (
          <div className="flex gap-3">
            <div className="w-8 h-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
              <span className="text-primary text-xs font-bold">A</span>
            </div>
            <div className="max-w-[75%] text-sm text-foreground leading-relaxed">
              {streamedContent}
              <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-8 py-4 border-t border-border shrink-0">
        <div className="flex gap-3 items-end max-w-3xl">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            rows={1}
            className="flex-1 resize-none bg-surface border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all duration-150"
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center transition-all duration-150 hover:brightness-110 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <SendIcon />
          </button>
        </div>
        <p className="text-xs text-muted mt-2">
          {streaming
            ? "Atlas is responding..."
            : "Press Enter to send, Shift+Enter for new line"}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-primary/15 text-foreground text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 shrink-0 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
        <span className="text-primary text-xs font-bold">A</span>
      </div>
      <div className="max-w-[75%] text-sm text-foreground leading-relaxed">
        <MarkdownContent content={message.content} />
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            <p className="text-xs font-medium text-muted">Sources</p>
            {message.citations.map((c, i) => (
              <div key={c.chunk_id} className="text-xs text-muted">
                <span className="text-primary font-medium">[{i + 1}]</span>{" "}
                {c.content_snippet}{" "}
                <span className="text-muted/60">
                  ({Math.round(c.similarity * 100)}% match)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple markdown renderer
// ---------------------------------------------------------------------------

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Bold text: **text**
    const boldRegex = /\*\*(.+?)\*\*/g;

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="font-heading text-base font-semibold mt-4 mb-1 text-foreground">
          {renderInline(line.slice(3), boldRegex)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-foreground">
          {renderInline(line.slice(2), boldRegex)}
        </li>,
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-foreground">
          {renderInline(line, boldRegex)}
        </p>,
      );
    }
    i++;
  }

  return <>{elements}</>;
}

function renderInline(text: string, boldRegex: RegExp): React.ReactNode {
  const parts = text.split(boldRegex);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}