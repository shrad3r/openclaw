// Verifies transcript byte sizing excludes OpenClaw bookkeeping rows when requested.
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempDir } from "../../test-helpers/temp-dir.js";
import { measureSessionTranscriptByteSize } from "./transcript-byte-size.js";

describe("measureSessionTranscriptByteSize", () => {
  it("returns raw file size when bookkeeping exclusion is disabled", async () => {
    await withTempDir({ prefix: "transcript-byte-size" }, async (dir) => {
      const sessionFile = path.join(dir, "session.jsonl");
      const mirrorLine = JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          provider: "openclaw",
          model: "delivery-mirror",
          content: [{ type: "text", text: "x".repeat(512) }],
        },
      });
      await fs.writeFile(sessionFile, `${mirrorLine}\n`, "utf8");
      const stat = await fs.stat(sessionFile);

      await expect(measureSessionTranscriptByteSize(sessionFile)).resolves.toBe(stat.size);
    });
  });

  it("excludes delivery-mirror and gateway-injected assistant rows from model-visible size", async () => {
    await withTempDir({ prefix: "transcript-byte-size" }, async (dir) => {
      const sessionFile = path.join(dir, "session.jsonl");
      const userLine = JSON.stringify({
        type: "message",
        message: { role: "user", content: "hello" },
      });
      const mirrorLine = JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          provider: "openclaw",
          model: "delivery-mirror",
          content: [{ type: "text", text: "x".repeat(4_096) }],
        },
      });
      const injectedLine = JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          provider: "openclaw",
          model: "gateway-injected",
          content: [{ type: "text", text: "y".repeat(4_096) }],
        },
      });
      await fs.writeFile(sessionFile, `${userLine}\n${mirrorLine}\n${injectedLine}\n`, "utf8");

      const rawSize = await measureSessionTranscriptByteSize(sessionFile);
      const modelVisibleSize = await measureSessionTranscriptByteSize(sessionFile, {
        excludeTranscriptOnlyOpenClawAssistant: true,
      });

      expect(rawSize).toBeGreaterThan(modelVisibleSize ?? 0);
      expect(modelVisibleSize).toBe(Buffer.byteLength(userLine, "utf8") + 1);
    });
  });
});
