/**
 * KUBO Anywhere — single source of truth for the multi-platform execution and
 * billing model.
 *
 * Two execution models exist and they are billed differently:
 *  - `cloud`  → code runs in an ephemeral KUBO Cloud container (iOS/iPadOS,
 *               Android). Billed per active container minute.
 *  - `local`  → code runs on the user's own hardware through the KUBO Local
 *               Agent daemon (Windows, macOS, Linux). No infrastructure cost
 *               for us, so it is billed per AI action, exactly like Vibe Code.
 */

export type ExecutionModel = "cloud" | "local";

export type PlatformId = "windows" | "macos" | "linux" | "ios" | "android";

export interface BillingModel {
  model: ExecutionModel;
  /** Human label used across the UI. */
  label: string;
  /** Short explanation shown next to the label. */
  description: string;
}

export const BILLING_MODELS: Record<ExecutionModel, BillingModel> = {
  cloud: {
    model: "cloud",
    label: "Per container minute",
    description:
      "The device only controls a remote session. Each active minute of the temporary Vertal Cloud container uses credits from the same balance.",
  },
  local: {
    model: "local",
    label: "Per AI action",
    description:
      "Code runs on your own computer, so there is no container to host. You pay only for AI actions, the same as Vibe Code on the web.",
  },
};

/** Credits charged for cloud execution. Mirrors the `cloud-sessions` function. */
export const CLOUD_CREDIT_COSTS = {
  perMinute: 1,
  build: 2,
  deploy: 4,
} as const;

/** Credits charged for local execution (AI actions only). */
export const LOCAL_CREDIT_COSTS = {
  chatMessage: 1,
  codeEdit: 2,
  agentRun: 4,
  terminalCommand: 0,
  gitOperation: 0,
} as const;

export interface PlatformSpec {
  id: PlatformId;
  name: string;
  family: "desktop" | "mobile";
  execution: ExecutionModel;
  client: string;
  status: "available" | "beta" | "planned";
  /** What the client can genuinely do on that platform. */
  capabilities: string[];
  /** Explicit non-goals, so expectations stay honest. */
  limitations: string[];
  /** Download artifact, when the platform ships an installer. */
  download?: { label: string; href: string; size?: string };
}

export const PLATFORMS: PlatformSpec[] = [
  {
    id: "windows",
    name: "Windows",
    family: "desktop",
    execution: "local",
    client: "Vertal Local Agent + VS Code / Cursor extension",
    status: "beta",
    capabilities: [
      "Background agent that watches your workspace",
      "Your own PowerShell terminal, no remote container",
      "Your local git, synced with GitHub",
      "Standalone app and VS Code / Cursor extension share the same daemon",
    ],
    limitations: [
      "The installer is not signed yet, so SmartScreen shows a warning",
      "Folder access is granted per project, never filesystem-wide",
    ],
    download: { label: "Download for Windows", href: "/downloads/kubo-local-agent-setup.exe" },
  },
  {
    id: "macos",
    name: "macOS",
    family: "desktop",
    execution: "local",
    client: "Vertal Local Agent + Xcode integration",
    status: "beta",
    capabilities: [
      "Same agent as on Windows and Linux",
      "Xcode, Swift toolchain and Simulator integration",
      "Your own zsh terminal and local git",
      "One-click bridge into VS Code or Cursor",
    ],
    limitations: ["Not notarized yet, so Gatekeeper shows a warning"],
    download: { label: "Download for macOS", href: "/downloads/kubo-local-agent.dmg" },
  },
  {
    id: "linux",
    name: "Linux",
    family: "desktop",
    execution: "local",
    client: "Vertal Local Agent (systemd service)",
    status: "beta",
    capabilities: [
      "Same daemon binary, installed as a systemd user service",
      "Your own shell and local git",
      "Headless-friendly: works over SSH sessions",
    ],
    limitations: ["No graphical installer"],
    download: { label: "Download for Linux", href: "/downloads/kubo-local-agent.tar.gz" },
  },
  {
    id: "ios",
    name: "iOS / iPadOS",
    family: "mobile",
    execution: "cloud",
    client: "Native shell around the Vertal Mobile Agent client",
    status: "available",
    capabilities: [
      "Native code editor over a local copy, so edits work offline",
      "Terminal client streaming a remote container session",
      "Git through the API, never a local git binary",
      "Live preview rendered from the cloud build",
      "Push notification when a build or deploy finishes",
    ],
    limitations: [
      "The device never runs code: no local shell and no local build",
      "No Xcode / Simulator on the device: that stays a Mac job",
    ],
  },
  {
    id: "android",
    name: "Android",
    family: "mobile",
    execution: "cloud",
    client: "Capacitor client + FCM push",
    status: "available",
    capabilities: [
      "Identical architecture to iOS: same endpoints, same tables",
      "FCM instead of APNs for build notifications",
      "Editor, chat, terminal client and live preview",
    ],
    limitations: [
      "Local execution via Termux is an opt-in advanced mode, not the default path",
    ],
  },
];

export function platformsByFamily(family: PlatformSpec["family"]): PlatformSpec[] {
  return PLATFORMS.filter((p) => p.family === family);
}

export function billingFor(platform: PlatformSpec): BillingModel {
  return BILLING_MODELS[platform.execution];
}
