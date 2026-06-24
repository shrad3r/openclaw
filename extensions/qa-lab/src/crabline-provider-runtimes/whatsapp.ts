// Qa Lab plugin module implements WhatsApp-specific fake-provider runtime setup.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV } from "@openclaw/whatsapp/api.js";
import type { QaCrablineProviderRuntime, QaStartedOpenClawCrablineAdapter } from "./types.js";

const WHATSAPP_SOCKET_FACTORY_SOURCE_PATH = fileURLToPath(
  new URL("./whatsapp-socket-factory.mjs", import.meta.url),
);

async function stageWhatsAppAuthDir(params: {
  adapter: QaStartedOpenClawCrablineAdapter;
  outputDir: string;
}): Promise<string> {
  const selfJid = params.adapter.manifest.selfJid?.trim() || "15550000000@s.whatsapp.net";
  const authDir = path.join(params.outputDir, "artifacts", "crabline", "whatsapp-auth");
  await fs.mkdir(authDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(authDir, "creds.json"),
    `${JSON.stringify({ me: { id: selfJid } }, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  return authDir;
}

async function stageWhatsAppSocketFactory(outputDir: string): Promise<string> {
  const factoryPath = path.join(outputDir, "artifacts", "crabline", "whatsapp-socket-factory.mjs");
  await fs.mkdir(path.dirname(factoryPath), { recursive: true });
  await fs.copyFile(WHATSAPP_SOCKET_FACTORY_SOURCE_PATH, factoryPath);
  await fs.chmod(factoryPath, 0o600);
  return factoryPath;
}

export const WHATSAPP_FAKE_PROVIDER_RUNTIME: QaCrablineProviderRuntime = {
  channel: "whatsapp",
  async setup({ adapter, outputDir }) {
    const authDir = await stageWhatsAppAuthDir({ adapter, outputDir });
    const socketFactoryPath = await stageWhatsAppSocketFactory(outputDir);
    return {
      augmentGatewayConfig(config) {
        const channels = config.channels ?? {};
        const whatsapp = channels.whatsapp ?? {};
        const accounts = whatsapp.accounts ?? {};
        const accountConfig = accounts[adapter.accountId] ?? {};
        return {
          ...config,
          channels: {
            ...channels,
            whatsapp: {
              ...whatsapp,
              accounts: {
                ...accounts,
                [adapter.accountId]: {
                  ...accountConfig,
                  authDir,
                  enabled: true,
                },
              },
            },
          },
        };
      },
      createRuntimeEnvPatch() {
        const {
          CRABLINE_WHATSAPP_ACCESS_TOKEN,
          CRABLINE_WHATSAPP_ADMIN_TOKEN: _adminToken,
          CRABLINE_WHATSAPP_API_ROOT,
          CRABLINE_WHATSAPP_SELF_JID,
          ...rest
        } = adapter.createChannelDriverSmokeEnv({});
        return {
          ...rest,
          [OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE_ENV]: pathToFileURL(socketFactoryPath).href,
          OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN: CRABLINE_WHATSAPP_ACCESS_TOKEN,
          OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCOUNT_ID: adapter.accountId,
          OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT: CRABLINE_WHATSAPP_API_ROOT,
          OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH: adapter.manifest.recorderPath,
          OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID: CRABLINE_WHATSAPP_SELF_JID,
        };
      },
    };
  },
};
