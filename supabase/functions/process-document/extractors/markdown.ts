// =============================================================================
// Atlas — Markdown Text Extractor
// =============================================================================
// Extracts raw text from Markdown files. The text is returned as-is — no
// HTML rendering or frontmatter stripping is performed, because:
//   1. Frontmatter (--- delimited YAML) often contains useful metadata
//   2. The chunker handles structural splitting downstream
//   3. The LLM can interpret Markdown formatting natively

import type { ExtractionResult, DocumentMetadata } from "../../_shared/types.ts";
import { ProcessingError } from "../../_shared/errors.ts";

export function extractMarkdown(
  buffer: Uint8Array,
  fileName: string,
): ExtractionResult {
  const decoder = new TextDecoder("utf-8");
  let text: string;

  try {
    text = decoder.decode(buffer);
  } catch {
    throw new ProcessingError(
      `Could not decode "${fileName}" as UTF-8. Ensure the file is text-based.`,
      "",
    );
  }

  if (!text.trim()) {
    throw new ProcessingError(
      `"${fileName}" is empty. Please upload a Markdown file with content.`,
      "",
    );
  }

  const metadata: DocumentMetadata = {
    // Estimate "page count" as 1 page per ~3000 characters (rough MD equivalent)
    page_count: Math.max(1, Math.ceil(text.length / 3000)),
  };

  return {
    text: text.trim(),
    metadata,
    pageCount: metadata.page_count!,
  };
}