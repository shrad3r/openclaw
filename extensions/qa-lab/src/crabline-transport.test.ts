// Qa Lab tests cover Crabline fake-provider transport integration behavior.
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CRABLINE_FAKE_PROVIDER_CHANNELS,
  OPENCLAW_CRABLINE_MANIFEST_PATH,
} from "@openclaw/crabline";
import { fetchWithSsrFGuard } from "openclaw/plugin-sdk/ssrf-runtime";
import { withTempDir } from "openclaw/plugin-sdk/test-env";
import { describe, expect, it } from "vitest";
import { createQaBusState } from "./bus-state.js";
import {
  createQaCrablineTransportAdapter,
  type QaCrablineChannelDriverSelection,
  type QaCrablineProviderChannel,
} from "./crabline-transport.js";

function createSelection(
  channel: QaCrablineProviderChannel = "telegram",
): QaCrablineChannelDriverSelection {
  return {
    capabilityMatrixPath: "crabline-fake-provider-capabilities.json",
    channel,
    channelDriver: "crabline",
    smokeArtifactPath: "crabline-fake-provider-smoke.json",
  } as const;
}

function supportsCrablineFakeProvider(channel: QaCrablineProviderChannel) {
  return (CRABLINE_FAKE_PROVIDER_CHANNELS as readonly string[]).includes(channel);
}

async function waitForLength<T>(items: T[], length: number): Promise<T[]> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (items.length >= length) {
      return items;
    }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${length} items; saw ${items.length}.`);
}

describe("crabline transport", () => {
  it("configures OpenClaw's Telegram plugin against a Crabline fake provider server", async () => {
    await withTempDir("qa-crabline-transport-", async (outputDir) => {
      const transport = await createQaCrablineTransportAdapter({
        outputDir,
        selection: createSelection(),
        state: createQaBusState(),
      });

      try {
        expect(transport.id).toBe("crabline");
        expect(transport.requiredPluginIds).toEqual(["telegram"]);
        expect(transport.createGatewayConfig({ baseUrl: "http://127.0.0.1:1" })).toMatchObject({
          channels: {
            telegram: {
              apiRoot: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/u),
              botToken: "424242:crabline-telegram-token",
              dmPolicy: "open",
              enabled: true,
              groupPolicy: "open",
            },
          },
        });
        expect(transport.buildAgentDelivery({ target: "dm:alice" })).toEqual({
          channel: "telegram",
          to: "100001",
          replyChannel: "telegram",
          replyTo: "100001",
        });

        const manifest = JSON.parse(
          await fs.readFile(path.join(outputDir, OPENCLAW_CRABLINE_MANIFEST_PATH), "utf8"),
        ) as {
          provider?: string;
        };
        expect(manifest.provider).toBe("telegram");
      } finally {
        await transport.cleanup?.();
      }
    });
  });

  it.runIf(supportsCrablineFakeProvider("slack"))(
    "configures OpenClaw's Slack plugin against a Crabline fake provider server",
    async () => {
      await withTempDir("qa-crabline-transport-", async (outputDir) => {
        const transport = await createQaCrablineTransportAdapter({
          outputDir,
          selection: createSelection("slack"),
          state: createQaBusState(),
        });

        try {
          expect(transport.requiredPluginIds).toEqual(["slack"]);
          expect(transport.createGatewayConfig({ baseUrl: "http://127.0.0.1:1" })).toMatchObject({
            channels: {
              slack: {
                botToken: "xoxb-crabline-slack-token",
                enabled: true,
                mode: "http",
                signingSecret: "crabline-slack-signing-secret",
              },
            },
          });
          const runtimeEnvPatch = transport.createRuntimeEnvPatch?.() ?? {};
          expect(runtimeEnvPatch).toMatchObject({
            OPENCLAW_SLACK_API_URL: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/api\/$/u),
            SLACK_BOT_TOKEN: "xoxb-crabline-slack-token",
            SLACK_SIGNING_SECRET: "crabline-slack-signing-secret",
          });
          expect(runtimeEnvPatch).not.toHaveProperty("SLACK_API_URL");

          const manifest = JSON.parse(
            await fs.readFile(path.join(outputDir, OPENCLAW_CRABLINE_MANIFEST_PATH), "utf8"),
          ) as {
            provider?: string;
          };
          expect(manifest.provider).toBe("slack");
        } finally {
          await transport.cleanup?.();
        }
      });
    },
  );

  it.runIf(supportsCrablineFakeProvider("whatsapp"))(
    "configures OpenClaw's WhatsApp plugin against a Crabline fake provider server",
    async () => {
      await withTempDir("qa-crabline-transport-", async (outputDir) => {
        const transport = await createQaCrablineTransportAdapter({
          outputDir,
          selection: createSelection("whatsapp"),
          state: createQaBusState(),
        });

        try {
          expect(transport.requiredPluginIds).toEqual(["whatsapp"]);
          expect(transport.createGatewayConfig({ baseUrl: "http://127.0.0.1:1" })).toMatchObject({
            channels: {
              whatsapp: {
                accounts: {
                  default: {
                    authDir: expect.stringMatching(/whatsapp-auth$/u),
                    enabled: true,
                  },
                },
                allowFrom: ["*"],
                dmPolicy: "open",
                enabled: true,
                groupAllowFrom: ["*"],
                groupPolicy: "open",
              },
            },
          });
          const runtimeEnvPatch = transport.createRuntimeEnvPatch?.() ?? {};
          expect(runtimeEnvPatch).toMatchObject({
            OPENCLAW_WHATSAPP_SOCKET_FACTORY_MODULE: expect.stringContaining(
              "whatsapp-socket-factory.mjs",
            ),
            OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN: "crabline-whatsapp-access-token",
            OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCOUNT_ID: "default",
            OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT: expect.stringMatching(
              /^http:\/\/127\.0\.0\.1:\d+\/crabline\/whatsapp$/u,
            ),
            OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH: expect.stringMatching(
              /whatsapp-fake-provider\.jsonl$/u,
            ),
            OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID: "15550000000@s.whatsapp.net",
          });
          expect(runtimeEnvPatch).not.toHaveProperty("CRABLINE_WHATSAPP_ADMIN_TOKEN");
          expect(runtimeEnvPatch).not.toHaveProperty("NODE_OPTIONS");
          await expect(
            fs.readFile(
              path.join(outputDir, "artifacts", "crabline", "whatsapp-auth", "creds.json"),
              "utf8",
            ),
          ).resolves.toContain("15550000000@s.whatsapp.net");
          await expect(
            fs.readFile(
              path.join(outputDir, "artifacts", "crabline", "whatsapp-socket-factory.mjs"),
              "utf8",
            ),
          ).resolves.toContain("createWhatsAppBaileysMockSocket");
          await expect(
            fs.readFile(
              path.join(outputDir, "artifacts", "crabline", "whatsapp-socket-factory.mjs"),
              "utf8",
            ),
          ).resolves.toContain("createWhatsAppSocket");

          const manifest = JSON.parse(
            await fs.readFile(path.join(outputDir, OPENCLAW_CRABLINE_MANIFEST_PATH), "utf8"),
          ) as {
            provider?: string;
          };
          expect(manifest.provider).toBe("whatsapp");
        } finally {
          await transport.cleanup?.();
        }
      });
    },
  );

  it.runIf(supportsCrablineFakeProvider("whatsapp"))(
    "does not replay old WhatsApp recorder inbound lines across socket factories",
    async () => {
      await withTempDir("qa-crabline-whatsapp-socket-", async (outputDir) => {
        const recorderPath = path.join(outputDir, "whatsapp.jsonl");
        const previousEnv = {
          accessToken: process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN,
          apiRoot: process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT,
          recorderPath: process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH,
          selfJid: process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID,
        };
        process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN = "token";
        process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT =
          "http://127.0.0.1:1/crabline/whatsapp";
        process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH = recorderPath;
        process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID = "15550000000@s.whatsapp.net";

        const { createWhatsAppSocket } =
          (await import("./crabline-provider-runtimes/whatsapp-socket-factory.mjs")) as {
            createWhatsAppSocket: (
              printQr: boolean,
              verbose: boolean,
              options?: Record<string, unknown>,
            ) => Promise<{
              end: () => Promise<void>;
              ev: {
                on(event: string, handler: (payload: unknown) => void): void;
              };
            }>;
          };

        try {
          const firstSocket = await createWhatsAppSocket(false, false);
          const firstMessages: unknown[] = [];
          firstSocket.ev.on("messages.upsert", (payload) => firstMessages.push(payload));
          await fs.appendFile(
            recorderPath,
            `${JSON.stringify({
              body: {
                chatJid: "15551110000@s.whatsapp.net",
                senderJid: "15551110000@s.whatsapp.net",
                text: "first",
              },
              path: "/crabline/whatsapp/inbound",
              type: "admin",
            })}\n`,
            "utf8",
          );
          await expect(waitForLength(firstMessages, 1)).resolves.toHaveLength(1);
          await firstSocket.end();

          const secondSocket = await createWhatsAppSocket(false, false);
          const secondMessages: unknown[] = [];
          secondSocket.ev.on("messages.upsert", (payload) => secondMessages.push(payload));
          await sleep(150);
          expect(secondMessages).toHaveLength(0);

          await fs.appendFile(
            recorderPath,
            `${JSON.stringify({
              body: {
                chatJid: "15552220000@s.whatsapp.net",
                senderJid: "15552220000@s.whatsapp.net",
                text: "second",
              },
              path: "/crabline/whatsapp/inbound",
              type: "admin",
            })}\n`,
            "utf8",
          );
          await expect(waitForLength(secondMessages, 1)).resolves.toHaveLength(1);
          await secondSocket.end();
        } finally {
          if (previousEnv.accessToken === undefined) {
            delete process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN;
          } else {
            process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN = previousEnv.accessToken;
          }
          if (previousEnv.apiRoot === undefined) {
            delete process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT;
          } else {
            process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT = previousEnv.apiRoot;
          }
          if (previousEnv.recorderPath === undefined) {
            delete process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH;
          } else {
            process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH = previousEnv.recorderPath;
          }
          if (previousEnv.selfJid === undefined) {
            delete process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID;
          } else {
            process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID = previousEnv.selfJid;
          }
        }
      });
    },
  );

  it("reports unavailable fake-provider channels from the installed Crabline package", async () => {
    if (supportsCrablineFakeProvider("slack")) {
      return;
    }
    await withTempDir("qa-crabline-transport-", async (outputDir) => {
      await expect(
        createQaCrablineTransportAdapter({
          outputDir,
          selection: createSelection("slack"),
          state: createQaBusState(),
        }),
      ).rejects.toThrow(/does not provide a slack fake provider server/u);
    });
  });

  it("injects inbound messages through Crabline and mirrors Telegram sends into normalized state", async () => {
    await withTempDir("qa-crabline-transport-", async (outputDir) => {
      const transport = await createQaCrablineTransportAdapter({
        outputDir,
        selection: createSelection(),
        state: createQaBusState(),
      });

      try {
        await transport.state.addInboundMessage({
          conversation: {
            id: "alice",
            kind: "direct",
          },
          senderId: "alice",
          senderName: "Alice",
          text: "DM baseline marker check.",
        });

        const config = transport.createGatewayConfig({ baseUrl: "http://127.0.0.1:1" });
        const telegram = config.channels?.telegram as
          | { apiRoot?: string; botToken?: string }
          | undefined;
        expect(telegram?.apiRoot).toBeTruthy();
        expect(telegram?.botToken).toBeTruthy();
        const { response, release } = await fetchWithSsrFGuard({
          url: `${telegram?.apiRoot}/bot${telegram?.botToken}/sendMessage`,
          init: {
            body: JSON.stringify({
              chat_id: "100001",
              text: "assistant via fake telegram",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
          policy: { allowPrivateNetwork: true },
          auditContext: "qa-lab-crabline-transport-test",
        });
        await release();
        expect(response.ok).toBe(true);

        await expect(
          transport.state.waitFor({
            direction: "outbound",
            kind: "message-text",
            textIncludes: "assistant via fake telegram",
            timeoutMs: 1_000,
          }),
        ).resolves.toMatchObject({
          conversation: {
            id: "alice",
            kind: "direct",
          },
          direction: "outbound",
          text: "assistant via fake telegram",
        });

        await transport.state.reset();
        const delivery = transport.buildAgentDelivery({ target: "dm:qa-operator" });
        const { response: directResponse, release: directRelease } = await fetchWithSsrFGuard({
          url: `${telegram?.apiRoot}/bot${telegram?.botToken}/sendMessage`,
          init: {
            body: JSON.stringify({
              chat_id: delivery.to,
              text: "assistant after reset",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
          policy: { allowPrivateNetwork: true },
          auditContext: "qa-lab-crabline-transport-reset-test",
        });
        await directRelease();
        expect(directResponse.ok).toBe(true);

        await expect(
          transport.state.waitFor({
            direction: "outbound",
            kind: "message-text",
            textIncludes: "assistant after reset",
            timeoutMs: 1_000,
          }),
        ).resolves.toMatchObject({
          conversation: {
            id: "qa-operator",
            kind: "direct",
          },
          direction: "outbound",
          text: "assistant after reset",
        });
      } finally {
        await transport.cleanup?.();
      }
    });
  });
});
