import type { AgentStatus, PaneSnapshot, ResolvedThemeSnapshot } from "./model.js";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const monoFont = `font-family="Consolas" font-weight="700"`;

export type WorkingMotion = "darken" | "lighten" | "rainbow";

type KeyView = {
  label: string;
  count?: number;
  context?: string;
  detail?: string;
  slot?: number;
  status?: AgentStatus | "offline";
  selected?: boolean;
  empty?: boolean;
  danger?: boolean;
  workingFrame?: number;
  workingMotion?: WorkingMotion;
};

export type StripView =
  | { kind: "logo"; image: string }
  | { kind: "page"; name: string; position: string; summary: string }
  | { kind: "attention"; label: string; position: string }
  | { kind: "clear" }
  | { kind: "command"; label: string }
  | { kind: "motion"; name: string; position: string };

export function keySvg(view: KeyView, theme?: ResolvedThemeSnapshot | null): string {
  const palette = theme?.palette;
  const text = palette && view.danger ? oledColor(palette.red) : oledForeground(theme, "text");
  const subtext = oledForeground(theme, "subtext");
  const statusVisual = statusAppearance(view.status, theme);
  const lines = splitLabel(view.label, 8);
  const labelSize = Math.max(24, 36 - Math.max(...lines.map(displayWidth)) * 1.5);
  const outlineColor = view.danger
    ? palette ? oledColor(palette.red) : "#ffffff"
    : statusVisual?.color;
  const slot = view.empty && view.slot !== undefined
    ? `<text x="16" y="32" ${monoFont} font-size="26" fill="${subtext}">${view.slot + 1}</text>`
    : "";
  const focus = view.selected ? `<circle cx="124" cy="20" r="6" fill="${oledForeground(theme, "text")}"/>` : "";
  const outline = outlineColor
    ? `<rect x="4" y="4" width="136" height="136" rx="18" fill="none" stroke="${outlineColor}" stroke-width="${view.danger ? 7 : statusVisual?.width ?? 5}"${statusVisual?.dash ? ` stroke-dasharray="${statusVisual.dash}"` : ""}/>`
    : "";
  const workingHighlight = workingAnimation(view, theme);
  const empty = view.empty ? `<path d="M57 76H87M72 61V91" stroke="${subtext}" stroke-width="6" stroke-linecap="round"/>` : "";
  const footerValue = (view.detail || view.context)?.replaceAll(" › ", " · ");
  const footer = footerValue
    ? `<text x="76" y="130" ${monoFont} font-size="18" fill="${subtext}" text-anchor="middle" letter-spacing=".1">${escapeXml(compactContext(footerValue.toUpperCase(), 12))}</text>`
    : "";
  const labelY = lines.length === 1 ? 84 : lines.length === 2 ? 64 : 47;
  const label = view.empty ? "" : view.count === undefined
    ? lines.map((line, index) =>
        `<text x="76" y="${labelY + index * 29}" ${monoFont} font-size="${labelSize}" fill="${text}" text-anchor="middle">${escapeXml(line)}</text>`
      ).join("")
    : `<text x="76" y="36" ${monoFont} font-size="22" fill="${text}" text-anchor="middle">${escapeXml(view.label.toUpperCase())}</text>
      <text x="76" y="116" ${monoFont} font-size="72" fill="${statusVisual?.color ?? text}" text-anchor="middle">${view.count}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="#000000"/>
    ${outline}${workingHighlight}${slot}${focus}
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

export function stripRegionSvg(
  region: number,
  view: StripView,
  theme?: ResolvedThemeSnapshot | null
): string {
  const palette = theme?.palette;
  const text = oledForeground(theme, "text");
  const subtext = oledForeground(theme, "subtext");
  const accent = palette ? oledColor(palette.accent, 3) : "#ffffff";
  const yellow = palette ? oledColor(palette.yellow, 3) : "#ffffff";
  let content: string;

  switch (view.kind) {
    case "logo":
      content = `<image href="${view.image}" x="350" y="0" width="100" height="100"/>`;
      break;
    case "page":
      content = `<rect width="6" height="100" fill="${accent}"/>
        <text x="28" y="61" ${monoFont} font-size="50" fill="${text}">${escapeXml(truncate(view.name.toUpperCase(), 16))}</text>
        <text x="31" y="89" ${monoFont} font-size="19" fill="${subtext}">${escapeXml(view.summary)}</text>
        <text x="772" y="31" ${monoFont} font-size="20" fill="${subtext}" text-anchor="end">${escapeXml(view.position)}</text>`;
      break;
    case "attention":
      content = `<rect width="6" height="100" fill="${yellow}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${yellow}">NEEDS YOU</text>
        <text x="28" y="70" ${monoFont} font-size="42" fill="${text}">${escapeXml(truncate(view.label, 16))}</text>
        <text x="772" y="27" ${monoFont} font-size="19" fill="${subtext}" text-anchor="end">${escapeXml(view.position)}</text>
        <text x="772" y="70" ${monoFont} font-size="21" fill="${text}" text-anchor="end">PRESS OPEN</text>`;
      break;
    case "clear":
      content = `<text x="400" y="65" ${monoFont} font-size="42" fill="${text}" text-anchor="middle">ALL CLEAR</text>`;
      break;
    case "command":
      content = `<rect width="6" height="100" fill="${accent}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${accent}">COMMAND</text>
        <text x="28" y="70" ${monoFont} font-size="42" fill="${text}">${escapeXml(truncate(view.label, 22))}</text>`;
      break;
    case "motion":
      content = `<rect width="6" height="100" fill="${palette ? oledColor(palette.blue, 3) : "#ffffff"}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${subtext}">WORKING MOTION</text>
        <text x="28" y="70" ${monoFont} font-size="42" fill="${text}">${escapeXml(view.name)}</text>
        <text x="772" y="29" ${monoFont} font-size="20" fill="${subtext}" text-anchor="end">${escapeXml(view.position)}</text>`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${region * 200} 0 200 100">
    <rect width="800" height="100" fill="#000000"/>
    ${content}
  </svg>`;
}

function workingAnimation(view: KeyView, theme?: ResolvedThemeSnapshot | null): string {
  if (view.status !== "working" || view.workingFrame === undefined) return "";
  const frame = Math.max(0, view.workingFrame);
  const offset = -((frame % 16) / 16) * 100;
  const rect = `x="4" y="4" width="136" height="136" rx="18" pathLength="100" fill="none" stroke-linecap="round" stroke-width="5"`;
  switch (view.workingMotion ?? "lighten") {
    case "darken":
      return `<rect ${rect} stroke="#000000" stroke-opacity=".72" stroke-dasharray="12 88" stroke-dashoffset="${offset.toFixed(1)}"/>`;
    case "lighten":
      return `<rect ${rect} stroke="${oledForeground(theme, "text")}" stroke-dasharray="12 88" stroke-dashoffset="${offset.toFixed(1)}"/>`;
    case "rainbow":
      return ["#af2eff", "#ff3355", "#ffda53", "#1ee4bc"].map((color, index) =>
        `<rect ${rect} stroke="${color}" stroke-dasharray="3 97" stroke-dashoffset="${(offset - index * 3).toFixed(1)}"/>`
      ).join("");
  }
}

function statusAppearance(status: KeyView["status"], theme?: ResolvedThemeSnapshot | null): { color: string; width: number; dash?: string } | null {
  const palette = theme?.palette;
  switch (status) {
    case "blocked": return { color: palette ? oledColor(palette.yellow) : "#ffffff", width: 5 };
    case "working": return { color: palette ? oledColor(palette.blue) : "#ffffff", width: 5 };
    case "done": return { color: palette ? oledColor(palette.green) : "#ffffff", width: 7 };
    case "offline": return { color: palette ? oledColor(palette.red) : "#ffffff", width: 5 };
    case "idle": return { color: palette ? oledColor(palette.overlay0) : "#9a9ca5", width: 3 };
    case "unknown": return { color: palette ? oledColor(palette.overlay0) : "#9a9ca5", width: 3, dash: "10 8" };
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
  const [first, rest] = splitLabelLine(clean, width);
  return rest ? [first, truncate(rest, width)] : [first];
}

function splitLabelLine(value: string, width: number): [string, string] {
  const characters = graphemes(value);
  const [hardLine] = splitAtWidth(value, width);
  const hardLength = graphemes(hardLine).length;
  let breakAt = -1;
  for (let index = hardLength - 1; index >= 0; index--) {
    if (/[-_\s]/u.test(characters[index])) {
      breakAt = index;
      break;
    }
  }
  if (breakAt > 0) {
    const keepSeparator = !/\s/u.test(characters[breakAt]);
    return [
      characters.slice(0, breakAt + Number(keepSeparator)).join("").trim(),
      characters.slice(breakAt + 1).join("").trim()
    ];
  }
  const rest = characters.slice(hardLength);
  if (rest[0] && /[-_\s]/u.test(rest[0])) rest.shift();
  return [hardLine, rest.join("").trim()];
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
