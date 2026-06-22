// Verifies CLI telemetry sends can opt out of session transcript mirroring.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { runMessageAction } from "./message-action-runner.js";

const sendServiceMocks = vi.hoisted(() => ({
  executeSendAction: vi.fn(async () => ({
    handledBy: "core" as const,
    payload: {},
    toolResult: undefined,
    sendResult: { status: "sent" as const, results: [] },
  })),
}));

vi.mock("./outbound-send-service.js", async () => {
  const actual = await vi.importActual<typeof import("./outbound-send-service.js")>(
    "./outbound-send-service.js",
  );
  return {
    ...actual,
    executeSendAction: sendServiceMocks.executeSendAction,
  };
});

function readExecuteSendCtx(callIndex = 0): Record<string, unknown> {
  const call = sendServiceMocks.executeSendAction.mock.calls[callIndex]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error(`Expected executeSendAction call ${callIndex}`);
  }
  return call as Record<string, unknown>;
}

describe("runMessageAction transcript mirroring", () => {
  afterEach(() => {
    sendServiceMocks.executeSendAction.mockClear();
    setActivePluginRegistry(createTestRegistry([]));
  });

  it("skips delivery-mirror transcript writes when noTranscriptMirror is set", async () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "telegram",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "telegram",
            outbound: { deliveryMode: "direct", sendText: vi.fn() },
            messaging: {
              normalizeTarget: (raw) => (raw === "6113773579" ? "telegram:6113773579" : undefined),
              targetResolver: { looksLikeId: (raw) => raw === "6113773579" },
            },
          }),
        },
      ]),
    );

    await runMessageAction({
      cfg: {
        channels: { telegram: { botToken: "123:test" } },
      } as OpenClawConfig,
      action: "send",
      params: {
        channel: "telegram",
        target: "6113773579",
        message: "Fleet task update",
        noTranscriptMirror: true,
      },
      dryRun: false,
    });

    expect(readExecuteSendCtx().mirror).toBeUndefined();
  });
});
