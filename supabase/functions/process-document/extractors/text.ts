// =============================================================================
// Atlas — Plain Text Extractor
// =============================================================================
// Handles .txt files and unknown text-based formats. Returns the raw content
// as-is. No special parsing is needed — the chunker handles structural
// boundaries downstream.

import type { ExtractionResult, DocumentMetadata } from "../../_shared/types.ts";
import { ProcessingError } from "../../_shared/errors.ts";

export function extractText(
  buffer: Uint8Array,
  fileName: string,
): ExtractionResult {
  const decoder = new TextDecoder("utf-8");
  let text: string;

  try {
    text = decoder.decode(buffer);
  } catch {
    throw new ProcessingError(
      `Could not decode "${fileName}" as UTF-8. Please ensure the file is text-based.`,
      "",
    );
  }

  const trimmed = text.trim();

  if (!trimmed) {
    throw new ProcessingError(
      `"${fileName}" is empty. Please upload a file with content.`,
      "",
    );
  }

  const metadata: DocumentMetadata = {
    page_count: Math.max(1, Math.ceil(trimmed.length / 3000)),
  };

  return {
    text: trimmed,
    metadata,
    pageCount: metadata.page_count!,
  };
}