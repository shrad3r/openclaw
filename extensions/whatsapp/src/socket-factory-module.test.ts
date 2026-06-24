// Whatsapp tests cover alternative socket factory module loading.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadWhatsAppSocketFactoryFromEnv,
  OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV,
} from "./socket-factory-module.js";

const tempDirs: string[] = [];

function writeModule(source: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "wa-socket-factory-"));
  tempDirs.push(dir);
  const modulePath = path.join(dir, `factory-${Date.now()}-${tempDirs.length}.mjs`);
  writeFileSync(modulePath, source, "utf8");
  return modulePath;
}

describe("loadWhatsAppSocketFactoryFromEnv", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it("returns undefined when no socket factory module is configured", async () => {
    await expect(loadWhatsAppSocketFactoryFromEnv({})).resolves.toBeUndefined();
  });

  it("loads createWhatsAppSocket from an absolute module path", async () => {
    const modulePath = writeModule("export function createWhatsAppSocket() { return 'ok'; }\n");

    const factory = await loadWhatsAppSocketFactoryFromEnv({
      [OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV]: modulePath,
    });

    expect(await factory?.(false, false, {} as never)).toBe("ok");
  });

  it("loads the default export from a module URL", async () => {
    const modulePath = writeModule(
      "export default function createSocket() { return 'default'; }\n",
    );

    const factory = await loadWhatsAppSocketFactoryFromEnv({
      [OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV]: pathToFileURL(modulePath).href,
    });

    expect(await factory?.(false, false, {} as never)).toBe("default");
  });

  it("throws when the module does not export a socket factory function", async () => {
    const modulePath = writeModule("export const createWhatsAppSocket = 'nope';\n");

    await expect(
      loadWhatsAppSocketFactoryFromEnv({
        [OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV]: modulePath,
      }),
    ).rejects.toThrow(/must export createWhatsAppSocket/u);
  });
});
