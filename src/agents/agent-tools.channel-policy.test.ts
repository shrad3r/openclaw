import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createOpenClawCodingTools } from "./agent-tools.js";

describe("createOpenClawCodingTools channel policy", () => {
  it("applies agents.list[].tools.byChannel overrides for inbound surfaces", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "kai",
            workspace: "~/openclaw",
            tools: {
              byChannel: {
                imessage: {
                  allow: ["message", "session_status", "sessions_spawn", "read"],
                },
                webchat: {
                  allow: ["message", "session_status", "read", "write", "exec"],
                },
              },
            },
          },
        ],
      },
    };

    const imessageTools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:kai:imessage:dm:+15555550123",
      messageProvider: "imessage",
      workspaceDir: "/tmp/test-kai-imessage",
      agentDir: "/tmp/agent-kai",
    });
    const imessageNames = new Set(imessageTools.map((tool) => tool.name));
    expect(imessageNames).toEqual(new Set(["message", "session_status", "sessions_spawn", "read"]));

    const webchatTools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:kai:webchat:dm:u1",
      messageProvider: "webchat",
      workspaceDir: "/tmp/test-kai-webchat",
      agentDir: "/tmp/agent-kai",
    });
    const webchatNames = new Set(webchatTools.map((tool) => tool.name));
    expect(webchatNames.has("message")).toBe(true);
    expect(webchatNames.has("exec")).toBe(true);
    expect(webchatNames.has("sessions_spawn")).toBe(false);
  });

  it("keeps full toolchain when no channel policy matches", () => {
    const cfg: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "kai",
            workspace: "~/openclaw",
            tools: {
              byChannel: {
                imessage: { allow: ["message", "session_status"] },
              },
            },
          },
        ],
      },
    };

    const cliTools = createOpenClawCodingTools({
      config: cfg,
      sessionKey: "agent:kai:main",
      workspaceDir: "/tmp/test-kai-cli",
      agentDir: "/tmp/agent-kai",
    });
    const cliNames = new Set(cliTools.map((tool) => tool.name));
    expect(cliNames.has("exec")).toBe(true);
    expect(cliNames.has("write")).toBe(true);
  });
});
