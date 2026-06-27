// Model special token helpers strip model control tokens outside code regions.
import { findCodeRegions, isInsideCode } from "./code-regions.js";

// Match both ASCII pipe <|...|> and full-width pipe <｜...｜> (U+FF5C) variants.
const MODEL_SPECIAL_TOKEN_RE = /<[|｜][^|｜]*[|｜]>/g;
// SentencePiece decoders sometimes leak U+2581 (LOW LINE) instead of ASCII space.
const MODEL_WHITESPACE_MARKER_RE = /\u2581/g;

function overlapsCodeRegion(
  start: number,
  end: number,
  codeRegions: { start: number; end: number }[],
): boolean {
  return codeRegions.some((region) => start < region.end && end > region.start);
}

function shouldInsertSeparator(before: string | undefined, after: string | undefined): boolean {
  return Boolean(before && after && !/\s/.test(before) && !/\s/.test(after));
}

/**
 * Strips leaked model control tokens like `<|assistant|>` or full-width pipe variants.
 * Code examples are preserved; remove this when providers stop emitting these tokens.
 *
 * @see https://github.com/openclaw/openclaw/issues/40020
 */
export function stripModelSpecialTokens(text: string): string {
  if (!text) {
    return text;
  }
  MODEL_SPECIAL_TOKEN_RE.lastIndex = 0;
  if (!MODEL_SPECIAL_TOKEN_RE.test(text)) {
    return text;
  }
  MODEL_SPECIAL_TOKEN_RE.lastIndex = 0;

  const codeRegions = findCodeRegions(text);
  let out = "";
  let cursor = 0;
  for (const match of text.matchAll(MODEL_SPECIAL_TOKEN_RE)) {
    const matched = match[0];
    const start = match.index ?? 0;
    const end = start + matched.length;
    out += text.slice(cursor, start);
    if (isInsideCode(start, codeRegions) || overlapsCodeRegion(start, end, codeRegions)) {
      out += matched;
    } else if (shouldInsertSeparator(text[start - 1], text[end])) {
      out += " ";
    }
    cursor = end;
  }
  out += text.slice(cursor);
  return out;
}

/** Normalize tokenizer space markers (for example SentencePiece ▁) to ASCII space. */
export function normalizeModelWhitespaceMarkers(text: string): string {
  if (!text || !MODEL_WHITESPACE_MARKER_RE.test(text)) {
    return text;
  }
  MODEL_WHITESPACE_MARKER_RE.lastIndex = 0;
  return text.replace(MODEL_WHITESPACE_MARKER_RE, " ");
}
