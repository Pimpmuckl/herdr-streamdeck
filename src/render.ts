import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

export type BrandAssets = { light: string; dark: string };

type KeyView = {
  label: string;
  context?: string;
  detail?: string;
  slot?: number;
  status?: AgentStatus | "offline";
  selected?: boolean;
  empty?: boolean;
  danger?: boolean;
};

export function keySvg(view: KeyView, theme?: ResolvedThemeSnapshot | null): string {
  const palette = theme?.palette;
  const background = palette ? color(palette.panel_bg) : "#000000";
  const surface = palette ? color(palette.surface0) : "#111216";
  const text = palette ? color(view.danger ? palette.red : palette.text) : "#ffffff";
  const subtext = palette ? color(palette.subtext0) : "#9a9ca5";
  const statusVisual = statusAppearance(view.status, theme);
  const border = palette ? color(view.danger ? palette.red : view.selected ? palette.text : palette.surface1) : (view.selected || view.danger ? "#ffffff" : "#34363f");
  const lines = splitLabel(view.label, 13);
  const labelSize = Math.max(...lines.map((line) => line.length)) > 11 ? 16 : 19;
  const slot = view.slot === undefined ? "" : `<text x="14" y="23" class="meta">${view.slot + 1}</text>`;
  const status = statusVisual ? statusMark(view.status, statusVisual.color) : "";
  const rail = statusVisual ? `<path d="M22 132H122" stroke="${statusVisual.color}" stroke-width="6" stroke-linecap="round"/>` : "";
  const empty = view.empty ? `<path d="M57 72H87M72 57V87" stroke="${subtext}" stroke-width="5" stroke-linecap="round"/>` : "";
  const context = view.context ? `<text x="72" y="45" class="context">${escapeXml(truncate(view.context.toUpperCase(), 20))}</text>` : "";
  const detail = view.detail ? `<text x="72" y="116" class="detail">${escapeXml(truncate(view.detail.toUpperCase(), 19))}</text>` : "";
  const labelY = view.context ? (lines.length === 1 ? 81 : 70) : (lines.length === 1 ? 80 : 69);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <style>.label{font:700 ${labelSize}px Consolas,'Cascadia Mono',monospace;fill:${text};text-anchor:middle}.meta{font:700 14px Consolas,'Cascadia Mono',monospace;fill:${subtext}}.context,.detail{font:700 10px Consolas,'Cascadia Mono',monospace;fill:${subtext};text-anchor:middle;letter-spacing:.35px}</style>
    <rect width="144" height="144" rx="18" fill="${background}"/>
    <rect x="7" y="7" width="130" height="130" rx="14" fill="${surface}" stroke="${border}" stroke-width="${view.danger ? 7 : view.selected ? 5 : 2}"/>
    ${slot}${status}
    ${context}
    ${view.empty ? "" : `<text x="72" y="${labelY}" class="label">${lines.map((line, index) => `<tspan x="72" dy="${index ? 22 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`}
    ${detail}${empty}${rail}
  </svg>`;
}

export function dialSvg(
  column: number,
  title: string,
  value: string,
  theme: ResolvedThemeSnapshot | null | undefined,
  accentToken: keyof ResolvedThemeSnapshot["palette"] = "accent",
  brand?: BrandAssets
): string {
  const palette = theme?.palette;
  const background = palette ? color(palette.panel_bg) : "#000000";
  const text = palette ? color(palette.text) : "#ffffff";
  const subtext = palette ? color(palette.subtext0) : "#9a9ca5";
  const accent = palette ? color(palette[accentToken]) : "#ffffff";
  const brandImage = theme ? brand?.[theme.appearance] : undefined;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <style>.title{font:700 12px Consolas,'Cascadia Mono',monospace;fill:${subtext};letter-spacing:.8px}.value{font:700 19px Consolas,'Cascadia Mono',monospace;fill:${text}}</style>
    <rect width="200" height="100" fill="${background}"/>
    ${brandImage ? `<image href="${brandImage}" x="${column * -200}" y="0" width="800" height="100" opacity=".10"/>` : ""}
    <rect x="0" y="0" width="5" height="100" fill="${accent}"/>
    <text x="18" y="31" class="title">${escapeXml(title.toUpperCase())}</text>
    <text x="18" y="67" class="value">${escapeXml(truncate(value, 17))}</text>
  </svg>`;
}

function statusAppearance(status: KeyView["status"], theme?: ResolvedThemeSnapshot | null): { color: string } | null {
  const palette = theme?.palette;
  switch (status) {
    case "blocked": return { color: palette ? color(palette.yellow) : "#ffffff" };
    case "working": return { color: palette ? color(palette.blue) : "#ffffff" };
    case "done": return { color: palette ? color(palette.green) : "#ffffff" };
    case "idle": case "unknown": case "offline": return { color: palette ? color(palette.overlay0) : "#9a9ca5" };
    default: return null;
  }
}

function statusMark(status: KeyView["status"], fill: string): string {
  switch (status) {
    case "blocked": return `<circle cx="121" cy="21" r="9" fill="none" stroke="${fill}" stroke-width="2"/><text x="121" y="26" text-anchor="middle" font-family="Consolas,monospace" font-size="14" font-weight="700" fill="${fill}">?</text>`;
    case "working": return `<path d="M116 13L128 21L116 29Z" fill="${fill}"/>`;
    case "done": return `<path d="M113 21L119 27L130 14" fill="none" stroke="${fill}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "idle": return `<circle cx="121" cy="21" r="5" fill="${fill}"/>`;
    case "unknown": return `<circle cx="121" cy="21" r="5" fill="none" stroke="${fill}" stroke-width="2"/>`;
    case "offline": return `<path d="M115 15L127 27M127 15L115 27" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>`;
    default: return "";
  }
}

export function currentPane(panes: PaneSnapshot[], paneId?: string): PaneSnapshot | undefined {
  return panes.find((pane) => pane.pane_id === paneId);
}

function color(rgb: { r: number; g: number; b: number }): string {
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
}

function splitLabel(value: string, width: number): string[] {
  const clean = value.trim() || "EMPTY";
  if (clean.length <= width) return [clean];
  const words = clean.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1) return [truncate(clean, width), truncate(clean.slice(width), width)];
  const first: string[] = [];
  while (words.length && `${first.join(" ")} ${words[0]}`.trim().length <= width) first.push(words.shift()!);
  return [first.join(" ") || truncate(clean, width), truncate(words.join(" "), width)];
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
