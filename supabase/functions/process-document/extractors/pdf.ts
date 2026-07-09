// =============================================================================
// Atlas — PDF Text Extractor
// =============================================================================
// Extracts text content from PDF files using pdf-parse (pdf.js wrapper).
// Handles text-based PDFs only. Scanned/image-based PDFs without an embedded
// text layer will return empty text — OCR support is a future enhancement.
//
// pdf-parse reads the buffer and returns:
//   - text: concatenated text from all pages
//   - numpages: page count
//   - info: PDF metadata (author, title, etc.)
//   - metadata: raw metadata object

import type { ExtractionResult, DocumentMetadata } from "../../_shared/types.ts";
import { ProcessingError } from "../../_shared/errors.ts";
import pdfParse from "npm:pdf-parse@1";

export async function extractPdf(
  buffer: Uint8Array,
  fileName: string,
): Promise<ExtractionResult> {
  try {
    // pdf-parse expects a Buffer-compatible object; Uint8Array works in Deno
    const data = await pdfParse(Buffer.from(buffer));

    if (!data.text || data.text.trim().length === 0) {
      throw new ProcessingError(
        `Could not extract text from "${fileName}". The PDF may be scanned or image-based. ` +
          "Try uploading a PDF with an embedded text layer.",
        "",
      );
    }

    const metadata: DocumentMetadata = {};

    if (data.numpages) {
      metadata.page_count = data.numpages;
    }

    if (data.info) {
      if (data.info.Author) metadata.author = data.info.Author;
      if (data.info.Title) metadata.title = data.info.Title;
    }

    // Clean up extracted text: normalize whitespace, remove excessive newlines
    const cleanedText = cleanPdfText(data.text);

    return {
      text: cleanedText,
      metadata,
      pageCount: data.numpages ?? 0,
    };
  } catch (error) {
    if (error instanceof ProcessingError) throw error;

    throw new ProcessingError(
      `Failed to parse PDF "${fileName}": ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      "",
    );
  }
}

/**
 * Cleans common PDF extraction artifacts:
 * - Multiple consecutive newlines → double newline
 * - Lines broken by PDF layout → rejoined
 * - Non-printable characters → stripped
 * - Excessive whitespace → normalized
 */
function cleanPdfText(text: string): string {
  return text
    // Replace 3+ newlines with 2
    .replace(/\n{3,}/g, "\n\n")
    // Replace 3+ spaces with 1 (but preserve leading whitespace structure)
    .replace(/[^\S\n]{3,}/g, " ")
    // Remove null bytes and other non-printable characters (except newlines/tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
    // Normalize lines: if a line ends with a hyphen and the next line starts
    // with a lowercase letter, merge them (de-hyphenation)
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .trim();
}