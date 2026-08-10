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

export const STOP_CONFIRM_TIMEOUT_MS = 3000;

export class CommandState {
  active = false;
  targetPaneId: string | null = null;
  targetLabel = "";
  stopArmed = false;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();

  enter(paneId: string, label: string): void {
    this.clearStopTimer();
    this.active = true;
    this.targetPaneId = paneId;
    this.targetLabel = label;
    this.stopArmed = false;
    this.emit();
  }

  cancel(): void {
    this.clearStopTimer();
    if (!this.active) return;
    this.active = false;
    this.targetPaneId = null;
    this.targetLabel = "";
    this.stopArmed = false;
    this.emit();
  }

  armStop(): void {
    this.clearStopTimer();
    this.stopArmed = true;
    this.emit();
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined;
      this.stopArmed = false;
      this.emit();
    }, STOP_CONFIRM_TIMEOUT_MS);
  }

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  private clearStopTimer(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export type Pin = {
  paneId: string;
  label: string;
  terminalId?: string;
  agentSession?: AgentSessionRef;
};
export type PinPage = { name: string; pins: Array<Pin | null> };
export type WorkingMotion = "darken" | "lighten" | "rainbow";
export const MOTION_BASE_SPEED = 0.35;
export const MOTION_BASE_WIDTH = 1.4;
export type DeckSettings = {
  pageIndex: number;
  pages: PinPage[];
  focusFeedback: boolean;
  motionSpeed: number;
  workingMotion: WorkingMotion;
  motionWidth: number;
  motionIntensity: number;
  motionTuningVersion: 1;
};

export const DEFAULT_SETTINGS: DeckSettings = {
  pageIndex: 0,
  pages: [1, 2, 3].map((page) => ({ name: `Page ${page}`, pins: Array(6).fill(null) })),
  focusFeedback: false,
  motionSpeed: MOTION_BASE_SPEED,
  workingMotion: "darken",
  motionWidth: 1,
  motionIntensity: 1,
  motionTuningVersion: 1
};

export function normalizeSettings(value: unknown): DeckSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_SETTINGS);
  const input = value as Partial<DeckSettings>;
  const pages = Array.isArray(input.pages)
    ? input.pages.flatMap((page, index) => {
        if (!page || typeof page !== "object") return [];
        const raw = page as Partial<PinPage>;
        const name = normalizePageName(raw.name, index);
        const source = Array.isArray(raw.pins) ? raw.pins : [];
        const pins = Array.from({ length: 6 }, (_, slot) => normalizePin(source[slot]));
        return [{ name, pins }];
      })
    : [];
  const safePages = pages.length ? pages : structuredClone(DEFAULT_SETTINGS.pages);
  const requested = Number.isInteger(input.pageIndex) ? Number(input.pageIndex) : 0;
  const calibrated = input.motionTuningVersion === 1;
  return {
    pageIndex: Math.max(0, Math.min(requested, safePages.length - 1)),
    pages: safePages,
    focusFeedback: input.focusFeedback === true,
    motionSpeed: calibrated && typeof input.motionSpeed === "number" && Number.isFinite(input.motionSpeed)
      ? adjustMotionSpeed(input.motionSpeed, 0)
      : MOTION_BASE_SPEED,
    workingMotion: input.workingMotion === "lighten" || input.workingMotion === "rainbow" ? input.workingMotion : "darken",
    motionWidth: calibrated && typeof input.motionWidth === "number" && Number.isFinite(input.motionWidth)
      ? adjustMotionScale(input.motionWidth, 0)
      : 1,
    motionIntensity: calibrated && typeof input.motionIntensity === "number" && Number.isFinite(input.motionIntensity)
      ? adjustMotionScale(input.motionIntensity, 0)
      : 1,
    motionTuningVersion: 1
  };
}

export function adjustMotionSpeed(speed: number, ticks: number): number {
  const step = MOTION_BASE_SPEED * 0.1;
  const units = Math.max(2, Math.min(20, Math.round(speed / step) + ticks));
  return Math.round(units * step * 1000) / 1000;
}

export function adjustMotionScale(value: number, ticks: number): number {
  return Math.max(0.5, Math.min(2, Math.round((value + ticks * 0.1) * 10) / 10));
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

export class RecentPaneHistory {
  private focusedPaneId: string | null | undefined;
  private paneIds: string[] = [];

  observe(snapshot: HerdrSnapshot | null): void {
    if (!snapshot) return;
    const focused = snapshot.focused_pane_id ?? null;
    const livePaneIds = new Set(snapshot.panes.map((pane) => pane.pane_id));
    this.paneIds = this.paneIds.filter((paneId) => livePaneIds.has(paneId));
    if (this.focusedPaneId === undefined) {
      this.focusedPaneId = focused;
      return;
    }
    if (focused !== this.focusedPaneId) {
      const previous = this.focusedPaneId;
      this.paneIds = [...(previous && livePaneIds.has(previous) ? [previous] : []), ...this.paneIds]
        .filter((paneId, index, paneIds) => paneId !== focused && paneIds.indexOf(paneId) === index)
        .slice(0, 12);
      this.focusedPaneId = focused;
    }
  }

  panes(snapshot: HerdrSnapshot | null): PaneSnapshot[] {
    return this.paneIds.flatMap((paneId) => snapshot?.panes.find((pane) => pane.pane_id === paneId) ?? []);
  }
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
      settings.pages.push({ name: `Page ${settings.pages.length + 1}`, pins: Array(6).fill(null) });
    }
    settings.pageIndex++;
  }
}

function normalizePageName(value: unknown, index: number): string {
  const name = typeof value === "string" && value.trim() ? value.trim() : `Page ${index + 1}`;
  const legacy = ["ONE", "TWO", "THREE"][index];
  return name === legacy || name.toUpperCase() === `PAGE ${index + 1}` ? `Page ${index + 1}` : name;
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
