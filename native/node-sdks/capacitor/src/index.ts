import { registerPlugin } from "@capacitor/core";
import type { VertalNodePlugin } from "./definitions";

/** Plugin nativo "VertalNode" (Android). Na web/iOS cai no stub que diz "indisponível". */
export const VertalNode = registerPlugin<VertalNodePlugin>("VertalNode", {
  web: () => import("./web").then((m) => new m.VertalNodeWeb()),
});

export * from "./definitions";
