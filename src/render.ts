import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

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
  const text = palette && view.danger ? oledColor(palette.red) : oledForeground(theme, "text");
  const subtext = oledForeground(theme, "subtext");
  const statusVisual = statusAppearance(view.status, theme);
  const border = palette ? oledColor(view.danger ? palette.red : view.selected ? palette.text : palette.surface1, 3) : (view.selected || view.danger ? "#ffffff" : "#34363f");
  const lines = splitLabel(view.label, 9);
  const slot = view.slot === undefined ? "" : `<text x="14" y="23" class="meta">${view.slot + 1}</text>`;
  const status = statusVisual ? statusMark(view.status, statusVisual.color) : "";
  const rail = statusVisual ? `<path d="M18 136H126" stroke="${statusVisual.color}" stroke-width="6" stroke-linecap="round"/>` : "";
  const empty = view.empty ? `<path d="M57 72H87M72 57V87" stroke="${subtext}" stroke-width="5" stroke-linecap="round"/>` : "";
  const context = view.context ? `<text x="72" y="45" class="context">${escapeXml(truncate(view.context.toUpperCase(), 17))}</text>` : "";
  const detail = view.detail ? `<text x="72" y="117" class="detail">${escapeXml(truncate(view.detail.toUpperCase(), 17))}</text>` : "";
  const labelY = view.context ? (lines.length === 1 ? 82 : 69) : (lines.length === 1 ? 81 : 68);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <style>.label{font:700 22px Consolas,'Cascadia Mono',monospace;fill:${text};text-anchor:middle}.meta{font:700 15px Consolas,'Cascadia Mono',monospace;fill:${subtext}}.context,.detail{font:700 12px Consolas,'Cascadia Mono',monospace;fill:${subtext};text-anchor:middle;letter-spacing:.2px}</style>
    <rect width="144" height="144" fill="#000000"/>
    <rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${border}" stroke-width="${view.danger ? 7 : view.selected ? 5 : 2}"/>
    ${slot}${status}
    ${context}
    ${view.empty ? "" : `<text x="72" y="${labelY}" class="label">${lines.map((line, index) => `<tspan x="72" dy="${index ? 25 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`}
    ${detail}${empty}${rail}
  </svg>`;
}

export function dialSvg(
  title: string,
  value: string,
  theme: ResolvedThemeSnapshot | null | undefined,
  accentToken: keyof ResolvedThemeSnapshot["palette"] = "accent"
): string {
  const palette = theme?.palette;
  const text = oledForeground(theme, "text");
  const subtext = oledForeground(theme, "subtext");
  const accent = palette ? oledColor(palette[accentToken], 3) : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <style>.title{font:700 15px Consolas,'Cascadia Mono',monospace;fill:${subtext};letter-spacing:.4px}.value{font:700 24px Consolas,'Cascadia Mono',monospace;fill:${text}}</style>
    <rect width="200" height="100" fill="#000000"/>
    <rect x="0" y="0" width="5" height="100" fill="${accent}"/>
    <text x="18" y="30" class="title">${escapeXml(title.toUpperCase())}</text>
    <text x="18" y="70" class="value">${escapeXml(truncate(value, 12))}</text>
  </svg>`;
}

function statusAppearance(status: KeyView["status"], theme?: ResolvedThemeSnapshot | null): { color: string } | null {
  const palette = theme?.palette;
  switch (status) {
    case "blocked": return { color: palette ? oledColor(palette.yellow) : "#ffffff" };
    case "working": return { color: palette ? oledColor(palette.blue) : "#ffffff" };
    case "done": return { color: palette ? oledColor(palette.green) : "#ffffff" };
    case "idle": case "unknown": case "offline": return { color: palette ? oledColor(palette.overlay0) : "#9a9ca5" };
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

function oledForeground(theme: ResolvedThemeSnapshot | null | undefined, role: "text" | "subtext"): string {
  if (!theme) return role === "text" ? "#ffffff" : "#9a9ca5";
  return oledColor(role === "text" ? theme.palette.text : theme.palette.subtext0);
}

function oledColor(rgb: { r: number; g: number; b: number }, minimumContrast = 4.5): string {
  if ((relativeLuminance(rgb) + 0.05) / 0.05 >= minimumContrast) return color(rgb);
  let low = 0;
  let high = 1;
  let adjusted = rgb;
  for (let step = 0; step < 8; step++) {
    const amount = (low + high) / 2;
    adjusted = {
      r: Math.round(rgb.r + (255 - rgb.r) * amount),
      g: Math.round(rgb.g + (255 - rgb.g) * amount),
      b: Math.round(rgb.b + (255 - rgb.b) * amount)
    };
    if ((relativeLuminance(adjusted) + 0.05) / 0.05 >= minimumContrast) high = amount;
    else low = amount;
  }
  return color({
    r: Math.round(rgb.r + (255 - rgb.r) * high),
    g: Math.round(rgb.g + (255 - rgb.g) * high),
    b: Math.round(rgb.b + (255 - rgb.b) * high)
  });
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function splitLabel(value: string, width: number): string[] {
  const clean = value.trim() || "EMPTY";
  if (clean.length <= width) return [clean];
  const words = clean.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1) return [clean.slice(0, width), truncate(clean.slice(width), width)];
  const first: string[] = [];
  while (words.length && `${first.join(" ")} ${words[0]}`.trim().length <= width) first.push(words.shift()!);
  if (first.length) return [first.join(" "), truncate(words.join(" "), width)];
  const word = words.shift()!;
  return [word.slice(0, width), truncate([word.slice(width), ...words].filter(Boolean).join(" "), width)];
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
