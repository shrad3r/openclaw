// Whatsapp plugin module resolves optional socket factory modules.
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { WhatsAppCreateSocket } from "./connection-controller.js";

export const OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV =
  "OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE";

type WhatsAppSocketFactoryModule = {
  createWhatsAppSocket?: unknown;
  default?: unknown;
};

function resolveSocketFactoryModuleSpecifier(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return value;
  }
  return pathToFileURL(path.resolve(value)).href;
}

function readSocketFactory(moduleExports: WhatsAppSocketFactoryModule): WhatsAppCreateSocket {
  const factory = moduleExports.createWhatsAppSocket ?? moduleExports.default;
  if (typeof factory !== "function") {
    throw new Error(
      "WhatsApp socket factory module must export createWhatsAppSocket() or a default function.",
    );
  }
  return factory as WhatsAppCreateSocket;
}

export async function loadWhatsAppSocketFactoryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<WhatsAppCreateSocket | undefined> {
  const moduleSpecifier = env[OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV]?.trim();
  if (!moduleSpecifier) {
    return undefined;
  }
  const moduleExports = (await import(
    resolveSocketFactoryModuleSpecifier(moduleSpecifier)
  )) as WhatsAppSocketFactoryModule;
  return readSocketFactory(moduleExports);
}
