// QA Lab socket factory for OpenClaw's WhatsApp-compatible fake provider.
import fs from "node:fs/promises";

const RECORDER_POLL_MS = 50;
const RECORDER_BRIDGE_STATE_KEY = Symbol.for("openclaw.qaLab.whatsappFakeProviderRecorderBridge");

function readNonEmptyString(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function getRecorderBridgeState(recorderPath) {
  const existing = globalThis[RECORDER_BRIDGE_STATE_KEY];
  const states = existing instanceof Map ? existing : new Map();
  if (!(existing instanceof Map)) {
    globalThis[RECORDER_BRIDGE_STATE_KEY] = states;
  }
  const state = states.get(recorderPath) ?? { cursor: 0, syncPromise: null };
  states.set(recorderPath, state);
  return state;
}

function buildMessage(body, lineIndex) {
  const chatJid = readNonEmptyString(body?.chatJid ?? body?.chatId);
  const senderJid = readNonEmptyString(body?.senderJid ?? body?.from);
  const text = readNonEmptyString(body?.text);
  if (!chatJid || !senderJid || !text) {
    return null;
  }
  const id =
    readNonEmptyString(body?.messageId) ?? `wamid.FAKEQA${String(lineIndex + 1).padStart(8, "0")}`;
  return {
    key: {
      fromMe: false,
      id,
      ...(chatJid.endsWith("@g.us") ? { participant: senderJid } : {}),
      remoteJid: chatJid,
    },
    message: {
      conversation: text,
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: readNonEmptyString(body?.pushName) ?? "Test User",
  };
}

async function readRecorderLines(recorderPath) {
  const text = await fs.readFile(recorderPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  });
  return text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
}

function startRecorderBridge(socket, recorderPath) {
  if (!recorderPath) {
    return () => {};
  }

  const state = getRecorderBridgeState(recorderPath);
  const sync = async () => {
    if (state.syncPromise) {
      await state.syncPromise;
      return;
    }
    state.syncPromise = (async () => {
      const lines = await readRecorderLines(recorderPath);
      if (lines.length < state.cursor) {
        state.cursor = 0;
      }
      for (let lineIndex = state.cursor; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const event = JSON.parse(line);
        if (
          event?.type !== "admin" ||
          typeof event?.path !== "string" ||
          !event.path.endsWith("/crabline/whatsapp/inbound")
        ) {
          continue;
        }
        const message = buildMessage(event.body, lineIndex);
        if (message) {
          socket.ev.emit("messages.upsert", { messages: [message], type: "notify" });
        }
      }
      state.cursor = lines.length;
    })();
    try {
      await state.syncPromise;
    } finally {
      state.syncPromise = null;
    }
  };

  const interval = setInterval(() => {
    void sync().catch(() => undefined);
  }, RECORDER_POLL_MS);
  interval.unref?.();

  void sync().catch(() => undefined);

  return () => {
    clearInterval(interval);
  };
}

function withRuntimeCompatibility(socket, stopRecorderBridge) {
  return {
    ...socket,
    async end() {
      stopRecorderBridge();
    },
    async groupFetchAllParticipating() {
      return {};
    },
    async groupMetadata(jid) {
      return {
        id: jid,
        participants: [],
        subject: "Test Group",
      };
    },
    async readMessages() {},
  };
}

export async function createWhatsAppSocket(_printQr, _verbose, options = {}) {
  const accessToken = readNonEmptyString(process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_ACCESS_TOKEN);
  const apiRoot = readNonEmptyString(process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_API_ROOT);
  if (!accessToken || !apiRoot) {
    throw new Error("WhatsApp fake provider requires access token and API root environment.");
  }

  const { createWhatsAppBaileysMockSocket } = await import("@openclaw/crabline");
  if (typeof createWhatsAppBaileysMockSocket !== "function") {
    throw new Error(
      "@openclaw/crabline does not expose createWhatsAppBaileysMockSocket(). Install a version with WhatsApp fake-provider support.",
    );
  }

  const socket = createWhatsAppBaileysMockSocket({
    accessToken,
    apiRoot,
    selfJid:
      readNonEmptyString(process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_SELF_JID) ??
      readNonEmptyString(options.selfJid),
  });
  const stopRecorderBridge = startRecorderBridge(
    socket,
    readNonEmptyString(process.env.OPENCLAW_WHATSAPP_FAKE_PROVIDER_RECORDER_PATH),
  );
  const openTimer = setTimeout(() => {
    socket.ev.emit("connection.update", { connection: "open" });
  }, 0);
  openTimer.unref?.();

  return withRuntimeCompatibility(socket, () => {
    clearTimeout(openTimer);
    stopRecorderBridge();
  });
}

export default createWhatsAppSocket;
