import { afterEach, describe, expect, it, vi } from "vitest";
import { isGatewayRestartPending } from "../infra/restart.js";
import {
  createGatewayMethodRegistry,
  createPluginGatewayMethodDescriptor,
} from "./methods/registry.js";
import { handleGatewayRequest } from "./server-methods.js";
import type { GatewayRequestHandler } from "./server-methods/types.js";

vi.mock("../infra/restart.js", () => ({
  isGatewayRestartPending: vi.fn(),
}));

describe("gateway method restart blocking", () => {
  afterEach(() => {
    vi.mocked(isGatewayRestartPending).mockReset();
  });

  async function testMethod(method: string) {
    const handler: GatewayRequestHandler = ({ respond }) => respond(true, { ok: true });
    const methodRegistry = createGatewayMethodRegistry([
      createPluginGatewayMethodDescriptor({
        pluginId: "test-plugin",
        name: method,
        handler,
        scope: "operator.write",
      }),
    ]);
    const respond = vi.fn();

    await handleGatewayRequest({
      req: { type: "req", id: "req-1", method, params: {} },
      respond,
      client: {
        connId: "conn-1",
        connect: {
          role: "operator",
          scopes: ["operator.write"],
          client: { id: "test", version: "1", platform: "test", mode: "test" },
          minProtocol: 1,
          maxProtocol: 1,
        },
      } as any,
      isWebchatConnect: () => false,
      context: { logGateway: { warn: vi.fn() } } as any,
      methodRegistry,
    });
    return respond;
  }

  it("allows non-blocked methods during pending restart", async () => {
    vi.mocked(isGatewayRestartPending).mockReturnValue(true);
    const respond = await testMethod("gateway.identity.get");
    expect(respond).toHaveBeenCalledWith(true, { ok: true });
  });

  it("blocks target methods during pending restart", async () => {
    vi.mocked(isGatewayRestartPending).mockReturnValue(true);

    for (const method of ["agent", "chat.send", "sessions.send", "workboard.cards.dispatch"]) {
      const respond = await testMethod(method);
      expect(respond).toHaveBeenCalledWith(
        false,
        undefined,
        expect.objectContaining({
          code: "UNAVAILABLE",
          message: expect.stringContaining("restarting"),
        }),
      );
    }
  });

  it("allows target methods when restart is not pending", async () => {
    vi.mocked(isGatewayRestartPending).mockReturnValue(false);

    for (const method of ["agent", "chat.send", "sessions.send", "workboard.cards.dispatch"]) {
      const respond = await testMethod(method);
      expect(respond).toHaveBeenCalledWith(true, { ok: true });
    }
  });
});
