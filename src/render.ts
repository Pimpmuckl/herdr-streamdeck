import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

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
  const lines = splitLabel(view.label, 8);
  const slot = view.slot === undefined ? "" : `<text x="14" y="28" class="meta">${view.slot + 1}</text>`;
  const status = statusVisual ? statusMark(view.status, statusVisual.color) : "";
  const rail = statusVisual ? `<path d="M18 136H126" stroke="${statusVisual.color}" stroke-width="6" stroke-linecap="round"/>` : "";
  const empty = view.empty ? `<path d="M57 72H87M72 57V87" stroke="${subtext}" stroke-width="5" stroke-linecap="round"/>` : "";
  const context = view.context ? `<text x="72" y="48" class="context">${escapeXml(compactContext(view.context.toUpperCase(), 11))}</text>` : "";
  const detail = view.detail ? `<text x="72" y="124" class="detail">${escapeXml(truncate(view.detail.toUpperCase(), 11))}</text>` : "";
  const labelY = lines.length === 1 ? 84 : 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <style>.label{font:700 26px Consolas,'Cascadia Mono',monospace;fill:${text};text-anchor:middle}.meta{font:700 20px Consolas,'Cascadia Mono',monospace;fill:${subtext}}.context,.detail{font:700 18px Consolas,'Cascadia Mono',monospace;fill:${subtext};text-anchor:middle;letter-spacing:.1px}</style>
    <rect width="144" height="144" fill="#000000"/>
    <rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${border}" stroke-width="${view.danger ? 7 : view.selected ? 5 : 2}"/>
    ${slot}${status}
    ${context}
    ${view.empty ? "" : `<text x="72" y="${labelY}" class="label">${lines.map((line, index) => `<tspan x="72" dy="${index ? 29 : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`}
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
    <style>.title{font:700 20px Consolas,'Cascadia Mono',monospace;fill:${subtext};letter-spacing:.2px}.value{font:700 28px Consolas,'Cascadia Mono',monospace;fill:${text}}</style>
    <rect width="200" height="100" fill="#000000"/>
    <rect x="0" y="0" width="5" height="100" fill="${accent}"/>
    <text x="18" y="32" class="title">${escapeXml(title.toUpperCase())}</text>
    <text x="18" y="73" class="value">${escapeXml(truncate(value, 10))}</text>
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
    case "blocked": return `<circle cx="119" cy="22" r="11" fill="none" stroke="${fill}" stroke-width="3"/><text x="119" y="30" text-anchor="middle" font-family="Consolas,monospace" font-size="22" font-weight="700" fill="${fill}">?</text>`;
    case "working": return `<path d="M113 12L129 22L113 32Z" fill="${fill}"/>`;
    case "done": return `<path d="M110 22L117 30L130 13" fill="none" stroke="${fill}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "idle": return `<circle cx="119" cy="22" r="7" fill="${fill}"/>`;
    case "unknown": return `<circle cx="119" cy="22" r="7" fill="none" stroke="${fill}" stroke-width="3"/>`;
    case "offline": return `<path d="M112 15L126 29M126 15L112 29" stroke="${fill}" stroke-width="4" stroke-linecap="round"/>`;
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
  if (displayWidth(clean) <= width) return [clean];
  const words = clean.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 1) {
    const [first, rest] = splitAtWidth(clean, width);
    return [first, truncate(rest, width)];
  }
  const first: string[] = [];
  while (words.length && displayWidth(`${first.join(" ")} ${words[0]}`.trim()) <= width) first.push(words.shift()!);
  if (first.length) return [first.join(" "), truncate(words.join(" "), width)];
  const [firstPart, rest] = splitAtWidth(words.shift()!, width);
  return [firstPart, truncate([rest, ...words].filter(Boolean).join(" "), width)];
}

function truncate(value: string, width: number): string {
  return displayWidth(value) <= width ? value : `${splitAtWidth(value, Math.max(1, width - 1))[0]}…`;
}

function compactContext(value: string, width: number): string {
  if (displayWidth(value) <= width) return value;
  const separator = " › ";
  const split = value.lastIndexOf(separator);
  if (split < 0) return truncate(value, width);
  const suffix = value.slice(split);
  const suffixWidth = displayWidth(suffix);
  if (suffixWidth > width - 2) return truncate(value.slice(split + separator.length), width);
  return `${truncate(value.slice(0, split), width - suffixWidth)}${suffix}`;
}

function graphemes(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

function splitAtWidth(value: string, width: number): [string, string] {
  const characters = graphemes(value);
  let index = 0;
  let used = 0;
  while (index < characters.length && used + graphemeWidth(characters[index]) <= width) used += graphemeWidth(characters[index++]);
  return [characters.slice(0, index).join(""), characters.slice(index).join("")];
}

function displayWidth(value: string): number {
  return graphemes(value).reduce((width, character) => width + graphemeWidth(character), 0);
}

// ponytail: Device labels use terminal-style cell widths; measure the shipped font only if physical overflow proves this estimate insufficient.
function graphemeWidth(value: string): number {
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u.test(value) ? 2 : 1;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
