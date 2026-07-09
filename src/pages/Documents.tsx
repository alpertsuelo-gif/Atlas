import { useState } from "react";
import type { Document } from "../types";

// ---------------------------------------------------------------------------
// Mock data for testing when Supabase is not connected
// ---------------------------------------------------------------------------

const MOCK_DOCUMENTS: Document[] = [
  {
    id: "1",
    title: "transformer-paper.pdf",
    file_type: "pdf",
    status: "ready",
    chunk_count: 42,
    created_at: "2026-07-05T10:00:00Z",
    updated_at: "2026-07-05T10:02:00Z",
  },
  {
    id: "2",
    title: "react-patterns.md",
    file_type: "markdown",
    status: "ready",
    chunk_count: 18,
    created_at: "2026-07-06T14:30:00Z",
    updated_at: "2026-07-06T14:31:00Z",
  },
  {
    id: "3",
    title: "my-notes.txt",
    file_type: "txt",
    status: "processing",
    created_at: "2026-07-07T09:15:00Z",
    updated_at: "2026-07-07T09:15:00Z",
  },
];

// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const [documents] = useState<Document[]>(MOCK_DOCUMENTS);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setUploadedFile(file);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setUploadedFile(file);
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h2 className="font-heading text-2xl font-semibold text-foreground">
            Documents
          </h2>
          <p className="text-muted mt-1">
            Upload PDFs, Markdown, code, or text files. Atlas will read them so
            you can ask questions.
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer
            ${dragOver
              ? "border-primary bg-primary/10"
              : "border-border hover:border-muted bg-surface"}`}
        >
          {uploadedFile ? (
            <div className="space-y-2">
              <div className="w-10 h-10 mx-auto rounded-lg bg-success/20 flex items-center justify-center">
                <CheckIcon />
              </div>
              <p className="text-foreground font-medium">{uploadedFile.name}</p>
              <p className="text-xs text-muted">
                {(uploadedFile.size / 1024).toFixed(1)} KB —{" "}
                {uploadedFile.type || "unknown type"}
              </p>
              <p className="text-xs text-success mt-2">
                Ready to upload! (Supabase connection needed to process)
              </p>
              <button
                className="mt-3 px-5 py-2 bg-primary text-on-primary rounded-lg font-medium text-sm transition-all duration-150 hover:brightness-110 active:scale-[0.97] cursor-pointer"
                onClick={() => setUploadedFile(null)}
              >
                Clear & try another
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl bg-elevated flex items-center justify-center">
                <UploadIcon />
              </div>
              <div>
                <p className="text-foreground font-medium">
                  Drop your file here
                </p>
                <p className="text-sm text-muted mt-1">
                  or{" "}
                  <label className="text-primary cursor-pointer hover:underline">
                    browse files
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.md,.txt,.js,.ts,.py,.rs,.go,.java,.c,.cpp,.html,.css,.json,.yaml,.toml"
                      onChange={handleFilePick}
                    />
                  </label>
                </p>
              </div>
              <p className="text-xs text-muted">
                PDF, Markdown, TXT, Code — up to 20MB
              </p>
            </div>
          )}
        </div>

        {/* Document List */}
        <div className="mt-10">
          <h3 className="font-heading text-lg font-medium text-foreground mb-4">
            Your Documents
          </h3>

          {documents.length === 0 ? (
            <div className="text-center py-16 bg-surface rounded-xl border border-border">
              <div className="w-12 h-12 mx-auto rounded-xl bg-elevated flex items-center justify-center mb-3">
                <EmptyDocIcon />
              </div>
              <p className="text-foreground font-medium">No documents yet</p>
              <p className="text-sm text-muted mt-1">
                Upload your first document to start learning with Atlas
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="mt-10 p-4 rounded-lg bg-surface border border-border">
          <p className="text-xs text-muted leading-relaxed">
            <strong className="text-foreground">Note:</strong> Supabase is not
            yet connected to this project. Document upload, processing, and RAG
            queries require a Supabase backend. The UI shown here is a
            functional mock — connect Supabase to enable the full pipeline.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DocumentRow({ doc }: { doc: Document }) {
  const statusConfig = {
    ready: { label: "Ready", className: "bg-success/15 text-success" },
    processing: {
      label: "Processing...",
      className: "bg-primary/15 text-primary",
    },
    error: { label: "Error", className: "bg-destructive/15 text-destructive" },
    uploading: {
      label: "Uploading...",
      className: "bg-muted/15 text-muted",
    },
  };

  const status = statusConfig[doc.status];

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-surface border border-border hover:border-muted transition-all duration-150 cursor-pointer">
      {/* File type icon */}
      <div className="w-9 h-9 shrink-0 rounded-lg bg-elevated flex items-center justify-center">
        <FileTypeIcon type={doc.file_type} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {doc.title}
        </p>
        <p className="text-xs text-muted">
          {doc.file_type.toUpperCase()}
          {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ""}
        </p>
      </div>

      {/* Status badge */}
      <span
        className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.className}`}
      >
        {status.label}
      </span>
    </div>
  );
}

function FileTypeIcon({ type }: { type: string }) {
  const color = {
    pdf: "text-destructive",
    markdown: "text-primary",
    txt: "text-muted",
    code: "text-accent",
  }[type] ?? "text-muted";

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
      className={color}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline icons
// ---------------------------------------------------------------------------

function UploadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-success"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EmptyDocIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}