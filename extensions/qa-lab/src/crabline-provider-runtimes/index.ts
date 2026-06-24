// Qa Lab plugin module resolves fake-provider runtime setup.
import { SLACK_FAKE_PROVIDER_RUNTIME } from "./slack.js";
import { TELEGRAM_FAKE_PROVIDER_RUNTIME } from "./telegram.js";
import type { QaCrablineProviderChannel, QaCrablineProviderRuntime } from "./types.js";
import { WHATSAPP_FAKE_PROVIDER_RUNTIME } from "./whatsapp.js";

const QA_FAKE_PROVIDER_RUNTIMES = {
  slack: SLACK_FAKE_PROVIDER_RUNTIME,
  telegram: TELEGRAM_FAKE_PROVIDER_RUNTIME,
  whatsapp: WHATSAPP_FAKE_PROVIDER_RUNTIME,
} satisfies Record<QaCrablineProviderChannel, QaCrablineProviderRuntime>;

export function getQaCrablineProviderRuntime(
  channel: QaCrablineProviderChannel,
): QaCrablineProviderRuntime {
  return QA_FAKE_PROVIDER_RUNTIMES[channel];
}

export type {
  QaCrablineChannelDriverSelection,
  QaCrablineProviderChannel,
  QaCrablineProviderRuntimeSetup,
  QaStartedOpenClawCrablineAdapter,
} from "./types.js";
