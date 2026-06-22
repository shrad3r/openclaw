// Measures session transcript size for compaction and memory flush triggers.
import fs from "node:fs";
import { isTranscriptOnlyOpenClawAssistantMessage } from "../../shared/transcript-only-openclaw-assistant.js";
import { streamSessionTranscriptLines } from "./transcript-stream.js";

function isBookkeepingTranscriptLine(line: string): boolean {
  try {
    const parsed = JSON.parse(line) as { message?: unknown };
    if (!parsed.message || typeof parsed.message !== "object") {
      return false;
    }
    return isTranscriptOnlyOpenClawAssistantMessage(parsed.message);
  } catch {
    return false;
  }
}

/** Returns transcript byte size, optionally excluding OpenClaw bookkeeping assistant rows. */
export async function measureSessionTranscriptByteSize(
  sessionFile: string,
  options?: { excludeTranscriptOnlyOpenClawAssistant?: boolean },
): Promise<number | undefined> {
  const normalizedPath = sessionFile.trim();
  if (!normalizedPath) {
    return undefined;
  }
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(normalizedPath);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) {
    return undefined;
  }
  const rawSize = Math.floor(stat.size);
  if (!Number.isFinite(rawSize) || rawSize < 0) {
    return undefined;
  }
  if (rawSize === 0) {
    return 0;
  }
  if (options?.excludeTranscriptOnlyOpenClawAssistant !== true) {
    return rawSize;
  }

  let modelVisibleBytes = 0;
  for await (const line of streamSessionTranscriptLines(normalizedPath)) {
    if (isBookkeepingTranscriptLine(line)) {
      continue;
    }
    // Match JSONL on-disk size: trimmed line plus trailing newline.
    modelVisibleBytes += Buffer.byteLength(line, "utf8") + 1;
  }
  return modelVisibleBytes;
}
