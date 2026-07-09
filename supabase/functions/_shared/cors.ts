// =============================================================================
// Atlas — CORS Helpers
// =============================================================================
// Every Edge Function that handles HTTP requests must include CORS headers
// and respond to OPTIONS preflight requests. This module provides a consistent
// implementation used across all functions.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

/**
 * Returns a Response for OPTIONS preflight requests.
 * Call this at the top of every Edge Function handler:
 *
 *   if (req.method === "OPTIONS") return handleCorsPreflight();
 */
export function handleCorsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Applies CORS headers to an existing Response.
 * Use when you already have a Response object (e.g. from json(), streaming, etc.)
 * and need to add CORS headers.
 */
export function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Builds a JSON response with CORS headers and the given status code.
 */
export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Builds a streaming (SSE) response with appropriate headers and CORS.
 */
export function streamResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}