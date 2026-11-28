import { WebPlugin } from "@capacitor/core";
import type { VertalNodeActivateResult, VertalNodePlugin, VertalNodeStatus } from "./definitions";

const UNAVAILABLE: VertalNodeStatus = {
  available: false,
  reason: "unsupported_platform",
  provider: "cashraven",
  platform: "web",
  optedIn: false,
  running: false,
  paused: false,
};

/** Web (e iOS): o SDK da Cash Raven só existe para Android e desktop. Nunca liga nada. */
export class VertalNodeWeb extends WebPlugin implements VertalNodePlugin {
  async status(): Promise<VertalNodeStatus> {
    return UNAVAILABLE;
  }
  async activate(): Promise<VertalNodeActivateResult> {
    return { ...UNAVAILABLE, accepted: false };
  }
  async pause(): Promise<VertalNodeStatus> {
    return UNAVAILABLE;
  }
  async optOut(): Promise<VertalNodeStatus> {
    return UNAVAILABLE;
  }
}
