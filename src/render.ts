import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

export type BrandAssets = { light: string; dark: string };

type KeyView = {
  label: string;
  slot?: number;
  status?: AgentStatus | "offline";
  selected?: boolean;
  empty?: boolean;
  danger?: boolean;
};

export function keySvg(view: KeyView, theme: ResolvedThemeSnapshot): string {
  const palette = theme.palette;
  const background = color(palette.panel_bg);
  const surface = color(palette.surface0);
  const text = color(view.danger ? palette.red : palette.text);
  const subtext = color(palette.subtext0);
  const statusVisual = statusAppearance(view.status, theme);
  const border = color(view.danger ? palette.red : view.selected ? palette.text : palette.surface1);
  const lines = splitLabel(view.label, 15);
  const slot = view.slot === undefined ? "" : `<text x="14" y="23" class="meta">${view.slot + 1}</text>`;
  const status = statusVisual ? `<text x="121" y="25" class="status" fill="${statusVisual.color}">${statusVisual.symbol}</text>` : "";
  const empty = view.empty ? `<text x="72" y="88" class="hint">HOLD TO PIN</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <style>.label{font:700 19px Consolas,'Cascadia Mono',monospace;fill:${text};text-anchor:middle}.meta{font:700 14px Consolas,'Cascadia Mono',monospace;fill:${subtext}}.hint{font:600 10px Consolas,'Cascadia Mono',monospace;fill:${subtext};text-anchor:middle;letter-spacing:.4px}.status{font:700 20px Consolas,'Cascadia Mono',monospace;text-anchor:middle}</style>
    <rect width="144" height="144" rx="18" fill="${background}"/>
    <rect x="7" y="7" width="130" height="130" rx="14" fill="${surface}" stroke="${border}" stroke-width="${view.danger ? 7 : view.selected ? 5 : 2}"/>
    ${slot}${status}
    <text x="72" y="${lines.length === 1 ? 77 : 67}" class="label">${lines.map((line, index) => `<tspan x="72" dy="${index ? 24 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>
    ${empty}
  </svg>`;
}

export function dialSvg(
  column: number,
  title: string,
  value: string,
  theme: ResolvedThemeSnapshot,
  accentToken: keyof ResolvedThemeSnapshot["palette"] = "accent",
  brand?: BrandAssets
): string {
  const palette = theme.palette;
  const background = color(palette.panel_bg);
  const text = color(palette.text);
  const subtext = color(palette.subtext0);
  const accent = color(palette[accentToken]);
  const brandImage = brand?.[theme.appearance];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <style>.title{font:700 12px Consolas,'Cascadia Mono',monospace;fill:${subtext};letter-spacing:.8px}.value{font:700 19px Consolas,'Cascadia Mono',monospace;fill:${text}}</style>
    <rect width="200" height="100" fill="${background}"/>
    ${brandImage ? `<image href="${brandImage}" x="${column * -200}" y="0" width="800" height="100" opacity=".10"/>` : ""}
    <rect x="0" y="0" width="5" height="100" fill="${accent}"/>
    <text x="18" y="31" class="title">${escapeXml(title.toUpperCase())}</text>
    <text x="18" y="67" class="value">${escapeXml(truncate(value, 17))}</text>
  </svg>`;
}

function statusAppearance(status: KeyView["status"], theme: ResolvedThemeSnapshot): { color: string; symbol: string } | null {
  const palette = theme.palette;
  switch (status) {
    case "blocked": return { color: color(palette.yellow), symbol: "?" };
    case "working": return { color: color(palette.blue), symbol: "▶" };
    case "done": return { color: color(palette.green), symbol: "✓" };
    case "idle": return { color: color(palette.overlay0), symbol: "•" };
    case "unknown": return { color: color(palette.overlay0), symbol: "·" };
    case "offline": return { color: color(palette.overlay0), symbol: "×" };
    default: return null;
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
