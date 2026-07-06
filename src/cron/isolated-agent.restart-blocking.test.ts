import { afterEach, describe, expect, it, vi } from "vitest";
import { isGatewayRestartPending } from "../infra/restart.js";
import {
  makeIsolatedAgentJobFixture,
  makeIsolatedAgentParamsFixture,
} from "./isolated-agent/job-fixtures.js";
import { setupRunCronIsolatedAgentTurnSuite } from "./isolated-agent/run.suite-helpers.js";
import {
  loadRunCronIsolatedAgentTurn,
  runEmbeddedAgentMock,
} from "./isolated-agent/run.test-harness.js";

vi.mock("../infra/restart.js", () => ({
  isGatewayRestartPending: vi.fn(),
}));

const runCronIsolatedAgentTurn = await loadRunCronIsolatedAgentTurn();

describe("runCronIsolatedAgentTurn restart blocking", () => {
  setupRunCronIsolatedAgentTurnSuite();

  afterEach(() => {
    vi.mocked(isGatewayRestartPending).mockReset();
  });

  it("blocks cron agent turn if gateway restart is pending", async () => {
    vi.mocked(isGatewayRestartPending).mockReturnValue(true);

    const params = makeIsolatedAgentParamsFixture({
      job: makeIsolatedAgentJobFixture({
        delivery: { mode: "none" },
        payload: { kind: "agentTurn", message: "do it" },
      }),
      message: "do it",
      sessionKey: "cron:job-1",
    });

    const result = await runCronIsolatedAgentTurn(params);

    expect(result.status).toBe("error");
    expect(result.error).toContain("Gateway is reloading configuration/restarting");
    expect(runEmbeddedAgentMock).not.toHaveBeenCalled();
  });

  it("runs cron agent turn normally if gateway restart is not pending", async () => {
    vi.mocked(isGatewayRestartPending).mockReturnValue(false);

    const params = makeIsolatedAgentParamsFixture({
      job: makeIsolatedAgentJobFixture({
        delivery: { mode: "none" },
        payload: { kind: "agentTurn", message: "do it" },
      }),
      message: "do it",
      sessionKey: "cron:job-1",
    });

    const result = await runCronIsolatedAgentTurn(params);

    // Should proceed past the restart check and invoke the embedded run (or try to, resulting in success/mock call)
    expect(result.status).not.toBe("error");
  });
});
