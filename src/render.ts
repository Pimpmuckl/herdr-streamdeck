import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const monoFont = `font-family="Consolas" font-weight="700"`;

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
  const lines = splitLabel(view.label, 9);
  const labelSize = Math.max(24, 36 - Math.max(...lines.map(displayWidth)) * 1.5);
  const railColor = view.danger
    ? palette ? oledColor(palette.red) : "#ffffff"
    : statusVisual?.color;
  const slot = view.empty && view.slot !== undefined
    ? `<text x="16" y="32" ${monoFont} font-size="26" fill="${subtext}">${view.slot + 1}</text>`
    : "";
  const focus = view.selected ? `<circle cx="124" cy="20" r="6" fill="${oledForeground(theme, "text")}"/>` : "";
  const rail = railColor ? `<rect x="3" y="12" width="6" height="120" rx="3" fill="${railColor}"/>` : "";
  const frame = view.danger ? `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${railColor}" stroke-width="5"/>` : "";
  const empty = view.empty ? `<path d="M57 76H87M72 61V91" stroke="${subtext}" stroke-width="6" stroke-linecap="round"/>` : "";
  const footerValue = (view.detail || view.context)?.replaceAll(" › ", " · ");
  const footer = footerValue
    ? `<text x="76" y="130" ${monoFont} font-size="18" fill="${subtext}" text-anchor="middle" letter-spacing=".1">${escapeXml(compactContext(footerValue.toUpperCase(), 12))}</text>`
    : "";
  const labelY = lines.length === 1 ? 84 : lines.length === 2 ? 64 : 47;
  const label = view.empty ? "" : lines.map((line, index) =>
    `<text x="76" y="${labelY + index * 29}" ${monoFont} font-size="${labelSize}" fill="${text}" text-anchor="middle">${escapeXml(line)}</text>`
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#000000"/>
    ${rail}${frame}${slot}${focus}
    ${label}
    ${footer}${empty}
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
    <rect width="200" height="100" fill="#000000"/>
    <rect x="0" y="0" width="5" height="100" fill="${accent}"/>
    <text x="18" y="32" ${monoFont} font-size="20" fill="${subtext}" letter-spacing=".2">${escapeXml(title.toUpperCase())}</text>
    <text x="18" y="73" ${monoFont} font-size="28" fill="${text}">${escapeXml(truncate(value, 10))}</text>
  </svg>`;
}

function statusAppearance(status: KeyView["status"], theme?: ResolvedThemeSnapshot | null): { color: string } | null {
  const palette = theme?.palette;
  switch (status) {
    case "blocked": return { color: palette ? oledColor(palette.yellow) : "#ffffff" };
    case "working": return { color: palette ? oledColor(palette.blue) : "#ffffff" };
    case "done": case "idle": case "unknown": case "offline": return { color: palette ? oledColor(palette.overlay0) : "#9a9ca5" };
    default: return null;
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
  const parts = (clean.match(/[^-_\s]+(?:[-_]+|$)/g) || [clean]).flatMap((word) => {
    const chunks: string[] = [];
    while (displayWidth(word) > width) {
      const [chunk, rest] = splitAtWidth(word, width);
      chunks.push(chunk);
      word = rest;
    }
    return word ? [...chunks, word] : chunks;
  });
  const lines: string[] = [];
  for (const part of parts) {
    const previous = lines.at(-1) || "";
    const combined = `${previous}${previous && !/[-_]$/.test(previous) ? " " : ""}${part}`;
    if (lines.length && displayWidth(combined) <= width) lines[lines.length - 1] = combined;
    else lines.push(part);
  }
  return lines.length <= 3 ? lines : [...lines.slice(0, 2), truncate(lines.slice(2).join(" "), width)];
}

function truncate(value: string, width: number): string {
  return displayWidth(value) <= width ? value : `${splitAtWidth(value, Math.max(1, width - 1))[0]}…`;
}

function compactContext(value: string, width: number): string {
  if (displayWidth(value) <= width) return value;
  const separator = [" · ", " › "].find((candidate) => value.includes(candidate));
  if (!separator) return truncate(value, width);
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
  return /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u.test(value) ? 2 : 1;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
