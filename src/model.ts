export type RgbColor = { r: number; g: number; b: number };

export type ThemePalette = {
  accent: RgbColor | null;
  panel_bg: RgbColor | null;
  surface0: RgbColor | null;
  surface1: RgbColor | null;
  surface_dim: RgbColor | null;
  overlay0: RgbColor | null;
  overlay1: RgbColor | null;
  text: RgbColor | null;
  subtext0: RgbColor | null;
  mauve: RgbColor | null;
  green: RgbColor | null;
  yellow: RgbColor | null;
  red: RgbColor | null;
  blue: RgbColor | null;
  teal: RgbColor | null;
  peach: RgbColor | null;
};

export type ThemeSnapshot = {
  name: string;
  appearance: "dark" | "light" | null;
  palette: ThemePalette;
};

export type ResolvedThemeSnapshot = ThemeSnapshot & {
  appearance: "dark" | "light";
  palette: { [K in keyof ThemePalette]: RgbColor };
};

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type PaneSnapshot = {
  pane_id: string;
  agent?: string;
  workspace_id?: string;
  tab_id?: string;
  terminal_id?: string;
  focused: boolean;
  agent_status: AgentStatus;
  agent_session?: AgentSessionRef;
  label?: string;
  terminal_title_stripped?: string;
  cwd?: string;
};

export type TabSnapshot = { tab_id: string; workspace_id: string; label?: string; number?: number };
export type WorkspaceSnapshot = { workspace_id: string; label?: string; number?: number };

export type AgentSessionRef = {
  source: string;
  agent: string;
  kind: string;
  value: string;
};

export type HerdrSnapshot = {
  focused_pane_id?: string;
  panes: PaneSnapshot[];
  tabs?: TabSnapshot[];
  workspaces?: WorkspaceSnapshot[];
  theme?: ThemeSnapshot;
};

export type PaneIdentity = { primary: string; context?: string };

export type PinRequest = { paneId: string; requestedAt: string };

export type CommandIntent =
  | { kind: "prompt"; text: string }
  | { kind: "zoom" }
  | { kind: "arm-stop" }
  | { kind: "stop" }
  | { kind: "unavailable" };

export type Pin = {
  paneId: string;
  label: string;
  terminalId?: string;
  agentSession?: AgentSessionRef;
};
export type PinPage = { name: string; pins: Array<Pin | null> };
export type LogoAlignment = "center" | "right";
export type DeckSettings = {
  pageIndex: number;
  pages: PinPage[];
  focusFeedback: boolean;
  motionSpeed: number;
  logoAlignment: LogoAlignment;
};

export const DEFAULT_SETTINGS: DeckSettings = {
  pageIndex: 0,
  pages: ["ONE", "TWO", "THREE"].map((name) => ({ name, pins: Array(6).fill(null) })),
  focusFeedback: false,
  motionSpeed: 1,
  logoAlignment: "center"
};

export function normalizeSettings(value: unknown): DeckSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SETTINGS);
  const input = value as Partial<DeckSettings>;
  const pages = Array.isArray(input.pages)
    ? input.pages.flatMap((page, index) => {
        if (!page || typeof page !== "object") return [];
        const raw = page as Partial<PinPage>;
        const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `PAGE ${index + 1}`;
        const source = Array.isArray(raw.pins) ? raw.pins : [];
        const pins = Array.from({ length: 6 }, (_, slot) => normalizePin(source[slot]));
        return [{ name, pins }];
      })
    : [];
  const safePages = pages.length ? pages : structuredClone(DEFAULT_SETTINGS.pages);
  const requested = Number.isInteger(input.pageIndex) ? Number(input.pageIndex) : 0;
  return {
    pageIndex: Math.max(0, Math.min(requested, safePages.length - 1)),
    pages: safePages,
    focusFeedback: input.focusFeedback === true,
    motionSpeed: typeof input.motionSpeed === "number" && Number.isFinite(input.motionSpeed)
      ? adjustMotionSpeed(input.motionSpeed, 0)
      : 1,
    logoAlignment: input.logoAlignment === "right" ? "right" : "center"
  };
}

export function adjustMotionSpeed(speed: number, ticks: number): number {
  return Math.max(0.2, Math.min(2, Math.round((speed + ticks * 0.1) * 10) / 10));
}

function normalizePin(value: unknown): Pin | null {
  if (!value || typeof value !== "object") return null;
  const pin = value as Partial<Pin>;
  if (typeof pin.paneId !== "string" || !pin.paneId.trim()) return null;
  const terminalId = typeof pin.terminalId === "string" && pin.terminalId ? pin.terminalId : undefined;
  const agentSession = normalizeAgentSession(pin.agentSession);
  return {
    paneId: pin.paneId,
    label: typeof pin.label === "string" && pin.label.trim() ? pin.label.trim() : pin.paneId,
    ...(terminalId ? { terminalId } : {}),
    ...(agentSession ? { agentSession } : {})
  };
}

function normalizeAgentSession(value: unknown): AgentSessionRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const session = value as Partial<AgentSessionRef>;
  if (![session.source, session.agent, session.kind, session.value].every((part) => typeof part === "string" && part)) return undefined;
  return session as AgentSessionRef;
}

export function slotForCoordinates(column: number, row: number): number | null {
  return column >= 0 && column < 3 && row >= 0 && row < 2 ? row * 3 + column : null;
}

export function wrappedIndex(index: number, ticks: number, length: number): number {
  if (length <= 0) return 0;
  return ((index + ticks) % length + length) % length;
}

export function navigatePages(settings: DeckSettings, ticks: number): void {
  const direction = Math.sign(ticks);
  for (let step = 0; step < Math.abs(ticks); step++) {
    if (direction < 0) {
      settings.pageIndex = Math.max(0, settings.pageIndex - 1);
      continue;
    }
    if (settings.pageIndex >= lastUsedPageIndex(settings) + 1) return;
    if (settings.pageIndex === settings.pages.length - 1) {
      settings.pages.push({ name: `PAGE ${settings.pages.length + 1}`, pins: Array(6).fill(null) });
    }
    settings.pageIndex++;
  }
}

export function visiblePageCount(settings: DeckSettings): number {
  return Math.max(settings.pageIndex + 1, lastUsedPageIndex(settings) + 2);
}

function lastUsedPageIndex(settings: DeckSettings): number {
  for (let index = settings.pages.length - 1; index >= 0; index--) {
    if (settings.pages[index].pins.some(Boolean)) return index;
  }
  return -1;
}

export function attentionPanes(snapshot: HerdrSnapshot | null): PaneSnapshot[] {
  return snapshot?.panes.filter((pane) => pane.agent_status === "blocked") ?? [];
}

export function snapshotFromApi(value: unknown): HerdrSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const result = (value as { result?: unknown }).result;
  if (!result || typeof result !== "object") return undefined;
  const candidate = (result as { snapshot?: unknown }).snapshot ?? result;
  if (!candidate || typeof candidate !== "object" || !Array.isArray((candidate as HerdrSnapshot).panes)) return undefined;
  return candidate as HerdrSnapshot;
}

export function resolvePinRequest(value: unknown, snapshot: HerdrSnapshot | null): PaneSnapshot | undefined {
  if (!value || typeof value !== "object" || !snapshot) return undefined;
  const request = value as Partial<PinRequest>;
  if (typeof request.paneId !== "string" || !request.paneId || typeof request.requestedAt !== "string") return undefined;
  const matches = snapshot.panes.filter((pane) => pane.pane_id === request.paneId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function commandIntent(slot: number, stopArmed: boolean): CommandIntent {
  if (slot === 3) return { kind: "zoom" };
  if (slot === 5) return { kind: stopArmed ? "stop" : "arm-stop" };
  const prompts = [
    "Continue with your best judgment.",
    "Report what is complete, what is next, and what is blocked.",
    "Run the relevant verification and report the result."
  ];
  return prompts[slot] ? { kind: "prompt", text: prompts[slot] } : { kind: "unavailable" };
}

export function paneLabel(pane: PaneSnapshot | undefined, fallback: string): string {
  if (!pane) return fallback;
  if (pane.label?.trim()) return pane.label.trim();
  if (pane.terminal_title_stripped?.trim()) return pane.terminal_title_stripped.trim();
  const cwd = pane.cwd?.replace(/[\\/]+$/, "");
  return cwd?.split(/[\\/]/).pop() || fallback;
}

export function paneIdentity(pane: PaneSnapshot | undefined, snapshot: HerdrSnapshot | null, fallback: string): PaneIdentity {
  if (!pane) return { primary: fallback };
  const workspace = snapshot?.workspaces?.find((item) => item.workspace_id === pane.workspace_id);
  const tab = snapshot?.tabs?.find((item) => item.tab_id === pane.tab_id);
  const repo = pane.cwd?.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  const primary = firstDistinct(pane.label, pane.terminal_title_stripped, repo, fallback) || fallback;
  const workspaceLabel = cleanLabel(workspace?.label) || (workspace?.number ? `SPACE ${workspace.number}` : undefined);
  const rawTab = cleanLabel(tab?.label);
  const tabLabel = rawTab ? (/^\d+$/.test(rawTab) ? `T${rawTab}` : rawTab) : (tab?.number ? `T${tab.number}` : undefined);
  const context = [workspaceLabel, tabLabel].filter((value, index, values) => value && value !== primary && values.indexOf(value) === index).join(" › ");
  return { primary, ...(context ? { context } : {}) };
}

export function resolvePin(pin: Pin | null, snapshot: HerdrSnapshot | null): PaneSnapshot | undefined {
  if (!pin || !snapshot) return undefined;
  const agentSession = pin.agentSession;
  if (agentSession) {
    const matches = snapshot.panes.filter((pane) => sameSession(pane.agent_session, agentSession));
    if (matches.length === 1) return matches[0];
    const samePane = matches.find((pane) => pane.pane_id === pin.paneId);
    if (samePane) return samePane;
    if (pin.terminalId) {
      const replacements = snapshot.panes.filter((pane) => pane.terminal_id === pin.terminalId
        && (sameAgent(pane.agent_session, agentSession) || (!pane.agent_session && pane.agent === agentSession.agent)));
      if (replacements.length === 1) return replacements[0];
    }
    const labelMatches = snapshot.panes.filter((pane) => paneLabel(pane, pane.pane_id) === pin.label
      && (sameAgent(pane.agent_session, agentSession) || (!pane.agent_session && pane.agent === agentSession.agent)));
    if (labelMatches.length === 1) return labelMatches[0];
    return undefined;
  }
  if (pin.terminalId) {
    const matches = snapshot.panes.filter((pane) => pane.terminal_id === pin.terminalId);
    if (matches.length === 1) return matches[0];
    return undefined;
  }
  return snapshot.panes.find((pane) => pane.pane_id === pin.paneId);
}

export function hasResolvedTheme(theme: ThemeSnapshot | undefined): theme is ResolvedThemeSnapshot {
  return Boolean(theme?.appearance && Object.values(theme.palette).every((token) => token !== null));
}

function sameSession(left: AgentSessionRef | undefined, right: AgentSessionRef): boolean {
  return sameAgent(left, right) && left?.value === right.value;
}

function sameAgent(left: AgentSessionRef | undefined, right: AgentSessionRef): boolean {
  return Boolean(left && left.source === right.source && left.agent === right.agent && left.kind === right.kind);
}

function cleanLabel(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function firstDistinct(...values: Array<string | undefined>): string | undefined {
  return values.map(cleanLabel).find(Boolean);
}
