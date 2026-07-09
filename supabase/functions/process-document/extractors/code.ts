// =============================================================================
// Atlas — Code File Extractor
// =============================================================================
// Extracts raw source code from code files. The entire file content is
// returned as a single text block with the language preserved in metadata.
// Unlike PDFs/Markdown, code files are NOT heavily chunked — we keep files
// as single logical units where possible, since code review needs full context.

import type { ExtractionResult, DocumentMetadata } from "../../_shared/types.ts";
import { ProcessingError } from "../../_shared/errors.ts";

/**
 * Maps common file extensions to language identifiers.
 * Used for both metadata tagging and syntax-highlighting hints.
 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  rb: "ruby",
  c: "c",
  cpp: "c++",
  cs: "csharp",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  php: "php",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
};

export function extractCode(
  buffer: Uint8Array,
  fileName: string,
): ExtractionResult {
  const decoder = new TextDecoder("utf-8");
  let text: string;

  try {
    text = decoder.decode(buffer);
  } catch {
    throw new ProcessingError(
      `Could not decode "${fileName}" as UTF-8. Binary files are not supported.`,
      "",
    );
  }

  if (!text.trim()) {
    throw new ProcessingError(
      `"${fileName}" is empty.`,
      "",
    );
  }

  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const language = EXTENSION_LANGUAGE_MAP[extension] ?? extension;

  const metadata: DocumentMetadata = {
    language,
    source_filename: fileName,
    line_count: text.split("\n").length,
  };

  return {
    text,
    metadata,
    pageCount: 1,
  };
}