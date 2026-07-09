// =============================================================================
// Atlas — Extractor Router
// =============================================================================
// Routes to the correct text extractor based on file type.
// Each extractor has the same signature: (buffer, fileName) → ExtractionResult

import type { ExtractionResult } from "../../_shared/types.ts";
import { ValidationError } from "../../_shared/errors.ts";
import { extractPdf } from "./pdf.ts";
import { extractMarkdown } from "./markdown.ts";
import { extractCode } from "./code.ts";
import { extractText } from "./text.ts";

type FileType = "pdf" | "markdown" | "txt" | "code" | "image";

/**
 * Dispatch to the correct extractor for the given file type.
 * Throws ValidationError for unsupported file types.
 */
export async function extractTextFromFile(
  buffer: Uint8Array,
  fileType: FileType,
  fileName: string,
): Promise<ExtractionResult> {
  switch (fileType) {
    case "pdf":
      return extractPdf(buffer, fileName);

    case "markdown":
      return extractMarkdown(buffer, fileName);

    case "code":
      return extractCode(buffer, fileName);

    case "txt":
      return extractText(buffer, fileName);

    case "image":
      throw new ValidationError(
        "Image OCR is not yet supported. Images will be available in a future update. " +
          "For now, please upload PDFs, Markdown, text, or code files.",
        "file_type",
      );

    default:
      throw new ValidationError(
        `Unsupported file type: "${fileType}". Supported types: pdf, markdown, txt, code.`,
        "file_type",
      );
  }
}