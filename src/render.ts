import { MOTION_BASE_WIDTH, type AgentStatus, type IdleLayout, type PaneSnapshot, type ResolvedThemeSnapshot, type WorkingMotion } from "./model.js";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const monoFont = `font-family="Consolas" font-weight="700"`;

export const MOTION_CYCLE_FRAMES = 21;

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
  feedback?: "success";
  workingFrame?: number;
  workingMotion?: WorkingMotion;
  workingWidth?: number;
  workingIntensity?: number;
};

export type StripView = (
  | {
      kind: "idle";
      mode: IdleLayout;
      image: string;
      page: string;
      position: string;
      label: string;
      status: AgentStatus | "offline";
      blocked: number;
      working: number;
      frame: number;
    }
  | { kind: "page"; name: string; position: string; image: string; blocked: number; working: number }
  | { kind: "attention"; label: string; position: string; focused: boolean }
  | { kind: "clear" }
  | { kind: "command"; label: string }
  | { kind: "speed"; value: string }
  | { kind: "settings"; editing: boolean; name: string; value: string; position: string }
) & { timeout?: number };

export function keySvg(view: KeyView, theme?: ResolvedThemeSnapshot | null): string {
  const palette = theme?.palette;
  const feedbackColor = view.feedback === "success" ? palette ? oledColor(palette.green) : "#ffffff" : null;
  const text = feedbackColor ? "#000000" : palette && view.danger ? oledColor(palette.red) : oledForeground(theme, "text");
  const subtext = feedbackColor ? "#000000" : oledForeground(theme, "subtext");
  const statusVisual = feedbackColor ? null : statusAppearance(view.status, theme);
  const labelColumns = displayWidth(view.label.trim() || "EMPTY") > 24 ? 12 : 8;
  let lines = splitLabel(view.label, labelColumns);
  if (labelColumns < 12 && lines.length === 3 && displayWidth(lines[2]) <= 3) {
    const balanced = splitLabel(view.label, 12);
    if (balanced.length === 2 && labelFontSize(balanced) >= 20) lines = balanced;
  }
  const labelSize = labelFontSize(lines);
  const labelTracking = Math.max(...lines.map(displayWidth)) >= 9 ? ' letter-spacing="-0.04em"' : "";
  const outlineColor = view.danger
    ? palette ? oledColor(palette.red) : "#ffffff"
    : statusVisual?.color;
  const slot = view.empty && view.slot !== undefined
    ? `<text x="16" y="32" ${monoFont} font-size="26" fill="${subtext}">${view.slot + 1}</text>`
    : "";
  const selection = view.selected && !feedbackColor
    ? `<rect x="11" y="11" width="122" height="122" rx="11" fill="none" stroke="${outlineColor ?? oledForeground(theme, "text")}" stroke-width="3"/>`
    : "";
  const outline = outlineColor
    ? `<rect ${keyOutlineGeometry()} fill="none" stroke="${outlineColor}" stroke-width="${view.danger ? 7 : statusVisual?.width ?? 5}"${statusVisual?.dash ? ` stroke-dasharray="${statusVisual.dash}"` : ""}/>`
    : "";
  const workingHighlight = workingAnimation(view, theme);
  const empty = view.empty ? `<path d="M57 76H87M72 61V91" stroke="${subtext}" stroke-width="6" stroke-linecap="round"/>` : "";
  const footerValue = (view.detail || view.context)?.replaceAll(" › ", " · ");
  const footer = footerValue
    ? `<text x="72" y="130" ${monoFont} font-size="18" fill="${subtext}" text-anchor="middle" letter-spacing=".1">${escapeXml(compactContext(footerValue.toUpperCase(), 12))}</text>`
    : "";
  const labelY = lines.length === 1 ? 84 : lines.length === 2 ? 64 : 47;
  const label = view.empty ? "" : view.count === undefined
    ? lines.map((line, index) =>
        `<text x="72" y="${labelY + index * 29}" ${monoFont} font-size="${labelSize}" fill="${text}" text-anchor="middle"${labelTracking}>${escapeXml(line)}</text>`
      ).join("")
    : `<text x="72" y="36" ${monoFont} font-size="22" fill="${text}" text-anchor="middle">${escapeXml(view.label.toUpperCase())}</text>
      <text x="72" y="116" ${monoFont} font-size="72" fill="${statusVisual?.color ?? text}" text-anchor="middle">${view.count}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
    <rect width="144" height="144" fill="${feedbackColor ?? "#000000"}"/>
    ${selection}${outline}${workingHighlight}${slot}
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
    case "idle":
      content = idleStrip(view, theme);
      break;
    case "page":
      content = `<rect width="6" height="100" fill="${accent}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${subtext}">${escapeXml(`PINNED · ${view.position}`)}</text>
        <text x="28" y="74" ${monoFont} font-size="44" fill="${text}">${escapeXml(truncate(view.name, 17))}</text>
        ${stripBaseline(view, theme)}`;
      break;
    case "attention":
      content = `<rect width="6" height="100" fill="${yellow}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${yellow}">NEEDS YOU</text>
        <text x="28" y="70" ${monoFont} font-size="42" fill="${text}">${escapeXml(truncate(view.label, 16))}</text>
        <text x="772" y="27" ${monoFont} font-size="19" fill="${subtext}" text-anchor="end">${escapeXml(view.position)}</text>
        <text x="772" y="70" ${monoFont} font-size="21" fill="${text}" text-anchor="end">${view.focused ? "QUESTION IN HERDR" : "PRESS DIAL 2"}</text>`;
      break;
    case "clear":
      content = `<text x="400" y="65" ${monoFont} font-size="42" fill="${text}" text-anchor="middle">ALL CLEAR</text>`;
      break;
    case "command":
      content = `<rect width="6" height="100" fill="${accent}"/>
        <text x="28" y="27" ${monoFont} font-size="19" fill="${accent}">ACTIONS FOR</text>
        <text x="28" y="70" ${monoFont} font-size="42" fill="${text}">${escapeXml(truncate(view.label, 22))}</text>`;
      break;
    case "speed":
      content = `<rect width="6" height="100" fill="${palette ? oledColor(palette.blue, 3) : "#ffffff"}"/>
        <text x="400" y="27" ${monoFont} font-size="19" fill="${subtext}" text-anchor="middle">WORKING SPEED</text>
        <text x="400" y="82" ${monoFont} font-size="56" fill="${text}" text-anchor="middle">${escapeXml(view.value)}</text>`;
      break;
    case "settings": {
      const control = view.editing
        ? [["DIAL TURN", "CHANGE"], ["DIAL PRESS", "DONE"], ["DIAL HOLD", "EXIT"]]
        : [["DIAL TURN", "BROWSE"], ["DIAL PRESS", "EDIT"], ["DIAL HOLD", "EXIT"]];
      content = `<text x="24" y="27" ${monoFont} font-size="19" fill="${view.editing ? accent : subtext}">${view.editing ? "EDITING" : "SETTINGS"} · ${escapeXml(view.position)}</text>
        <text x="24" y="72" ${monoFont} font-size="34" fill="${text}">${escapeXml(truncate(view.name, 17))}</text>
        <text x="510" y="72" ${monoFont} font-size="34" fill="${view.editing ? accent : text}" text-anchor="end">${escapeXml(truncate(view.value, 12))}</text>
        <line x1="575" y1="0" x2="575" y2="100" stroke="${subtext}" stroke-opacity=".45"/>
        <text x="702" y="19" ${monoFont} font-size="18" fill="${subtext}" text-anchor="middle">CONTROLS</text>
        <line x1="702" y1="29" x2="702" y2="92" stroke="${subtext}" stroke-opacity=".45"/>
        ${control.map(([input, action], index) => `<text x="590" y="${42 + index * 23}" ${monoFont} font-size="18" fill="${subtext}">${input}</text><text x="716" y="${42 + index * 23}" ${monoFont} font-size="18" fill="${index === 0 ? text : subtext}">${action}</text>`).join("")}`;
      break;
    }
  }

  const timeoutBar = view.timeout
    ? `<rect x="0" y="96" width="${(800 * view.timeout).toFixed(1)}" height="4" fill="${accent}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="${region * 200} 0 200 100">
    <rect width="800" height="100" fill="#000000"/>
    ${content}${timeoutBar}
  </svg>`;
}

function idleStrip(view: Extract<StripView, { kind: "idle" }>, theme?: ResolvedThemeSnapshot | null): string {
  const palette = theme?.palette;
  const text = oledForeground(theme, "text");
  const subtext = oledForeground(theme, "subtext");
  const blue = palette ? oledColor(palette.blue, 3) : "#ffffff";
  const yellow = palette ? oledColor(palette.yellow, 3) : "#ffffff";
  const indicator = threadStatusIndicator(view.status, view.frame, theme);
  const baseline = stripBaseline(view, theme);

  if (view.mode === "triage") {
    return `<text x="24" y="27" ${monoFont} font-size="19" fill="${subtext}">${escapeXml(`${truncate(view.page, 15)} · ${view.position}`)}</text>
      ${indicator}<text x="60" y="75" ${monoFont} font-size="40" fill="${text}">${escapeXml(truncate(view.label, 19))}</text>
      ${baseline}`;
  }

  if (view.mode === "focus") {
    return `<text x="24" y="27" ${monoFont} font-size="19" fill="${subtext}">CURRENT</text>
      ${indicator}<text x="60" y="75" ${monoFont} font-size="44" fill="${text}">${escapeXml(truncate(view.label, 17))}</text>
      ${baseline}`;
  }

  const trailWidth = 440;
  const runnerCount = Math.min(view.working, 4);
  const runners = Array.from({ length: runnerCount }, (_, runner) => {
    const head = (view.frame * 6 + runner * 103) % trailWidth;
    const y = 18 + runner * 21;
    return [0, 1, 2].map((dot) => {
      const x = 24 + ((head - dot * 12 + trailWidth) % trailWidth);
      return `<circle cx="${x}" cy="${y}" r="${dot ? 3 : 4}" fill="${blue}" fill-opacity="${[1, 0.55, 0.25][dot]}"/>`;
    }).join("");
  }).join("");
  const blockers = Array.from({ length: Math.min(view.blocked, 3) }, (_, index) =>
    `<circle cx="${480 + index * 14}" cy="50" r="5" fill="${yellow}"/>`
  ).join("");
  const empty = runnerCount ? "" : `<text x="244" y="59" ${monoFont} font-size="24" fill="${subtext}" text-anchor="middle">${view.status === "offline" ? "HERDR OFFLINE" : "HERD IDLE"}</text>`;
  return `${runners}${blockers}${empty}
    ${baseline}`;
}

function stripBaseline(
  view: { image: string; blocked: number; working: number },
  theme?: ResolvedThemeSnapshot | null
): string {
  const palette = theme?.palette;
  const subtext = oledForeground(theme, "subtext");
  const blue = palette ? oledColor(palette.blue, 3) : "#ffffff";
  const yellow = palette ? oledColor(palette.yellow, 3) : "#ffffff";
  return `<text x="676" y="34" ${monoFont} font-size="20" fill="${view.working ? blue : subtext}" text-anchor="end">${view.working ? `${view.working} RUNNING` : "HERD IDLE"}</text>
    <text x="676" y="72" ${monoFont} font-size="20" fill="${view.blocked ? yellow : subtext}" text-anchor="end">${view.blocked ? `${view.blocked} NEED YOU` : "ALL CLEAR"}</text>
    <image href="${view.image}" x="700" y="0" width="100" height="100"/>`;
}

function threadStatusIndicator(
  status: AgentStatus | "offline",
  frame: number,
  theme?: ResolvedThemeSnapshot | null
): string {
  const color = statusAppearance(status, theme)?.color ?? oledForeground(theme, "subtext");
  if (status === "working") {
    const positions = [[30, 49], [43, 49], [43, 62], [43, 75], [30, 75], [30, 62]];
    const head = Math.round(frame * 2) % positions.length;
    return positions.map(([x, y], index) => {
      const distance = (head - index + positions.length) % positions.length;
      return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" fill-opacity="${[1, 0.55, 0.25][distance] ?? 0.08}"/>`;
    }).join("");
  }
  if (status === "blocked") {
    return `<circle cx="36.5" cy="62" r="9" fill="none" stroke="${color}" stroke-width="4"/>
      <circle cx="36.5" cy="62" r="3.5" fill="${color}"/>`;
  }
  if (status === "done") return `<circle cx="36.5" cy="62" r="8" fill="${color}"/>`;
  if (status === "idle") return `<path d="M27.5 62L34 68.5L46 54.5" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<circle cx="36.5" cy="62" r="8" fill="none" stroke="${color}" stroke-width="3"/>`;
}

function workingAnimation(view: KeyView, theme?: ResolvedThemeSnapshot | null): string {
  if (view.status !== "working" || view.workingFrame === undefined) return "";
  const frame = Math.max(0, view.workingFrame);
  const motion = view.workingMotion ?? "lighten";
  const width = (view.workingWidth ?? 1) * MOTION_BASE_WIDTH;
  const baseIntensity = motion === "darken" ? 1.3 : motion === "lighten" ? 2 : 1.6;
  const intensityScale = (view.workingIntensity ?? 1) * baseIntensity;
  const outlinePerimeter = 400 + 36 * Math.PI;
  const center = ((frame % MOTION_CYCLE_FRAMES) / MOTION_CYCLE_FRAMES) * outlinePerimeter;
  const segmentCount = Math.round(19 * width);
  const segmentLength = outlinePerimeter * 0.009;
  const segmentSpacing = outlinePerimeter * 0.008;
  const rect = `${keyOutlineGeometry()} fill="none" stroke-width="5"`;
  return Array.from({ length: segmentCount }, (_, index) => {
    const progress = index / (segmentCount - 1);
    const intensity = Math.min(1, (0.02 + 0.43 * Math.sin(Math.PI * progress) ** 2) * intensityScale);
    const position = (center + (index - (segmentCount - 1) / 2) * segmentSpacing + outlinePerimeter) % outlinePerimeter;
    const color = motion === "darken"
      ? "#000000"
      : motion === "lighten"
        ? oledForeground(theme, "text")
        : rainbowSwooshColor(progress);
    return `<rect ${rect} stroke="${color}" stroke-opacity="${intensity.toFixed(2)}" stroke-dasharray="${segmentLength.toFixed(2)} ${(outlinePerimeter * 2 - segmentLength).toFixed(2)}" stroke-dashoffset="${(-(position - segmentLength / 2)).toFixed(1)}"/>`;
  }).join("");
}

function keyOutlineGeometry(): string {
  return `x="4" y="4" width="136" height="136" rx="18"`;
}

const rainbowSwooshStops = [
  [175, 46, 255],
  [255, 51, 85],
  [255, 218, 83],
  [30, 228, 188]
] as const;

function rainbowSwooshColor(progress: number): string {
  const position = progress * (rainbowSwooshStops.length - 1);
  const index = Math.min(Math.floor(position), rainbowSwooshStops.length - 2);
  const amount = position - index;
  const start = rainbowSwooshStops[index];
  const end = rainbowSwooshStops[index + 1];
  return `rgb(${start.map((channel, channelIndex) => Math.round(channel + (end[channelIndex] - channel) * amount)).join(" ")})`;
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
  const lines: string[] = [];
  let rest = clean;
  for (let remainingLines = 3; remainingLines > 1 && displayWidth(rest) > width; remainingLines--) {
    let [line, tail] = splitLabelLine(rest, width);
    if (displayWidth(tail) > width * (remainingLines - 1)) {
      [line, tail] = splitAtWidth(rest, width);
      tail = tail.replace(/^[-_\s]+/u, "").trim();
    }
    lines.push(line);
    rest = tail;
  }
  if (rest) lines.push(truncate(rest, width));
  return lines.map((line, index) => index < lines.length - 1 && line.endsWith("-") ? line.slice(0, -1) : line);
}

function labelFontSize(lines: string[]): number {
  return Math.max(18, 36 - Math.max(...lines.map(displayWidth)) * 1.5);
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
