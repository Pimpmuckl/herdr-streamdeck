import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { copiedHerdrTheme } from "./herdr-themes.js";
import type { ResolvedThemeSnapshot, RgbColor, ThemePalette } from "./model.js";

const paletteTokens = [
  "accent", "panel_bg", "surface0", "surface1", "surface_dim", "overlay0", "overlay1", "text",
  "subtext0", "mauve", "green", "yellow", "red", "blue", "teal", "peach"
] as const satisfies ReadonlyArray<keyof ThemePalette>;

const platformConfigRoot = process.platform === "win32"
  ? process.env.APPDATA ?? join(homedir(), "AppData", "Roaming")
  : join(homedir(), ".config");
const configPath = process.env.HERDR_CONFIG_PATH
  ?? join(process.env.XDG_CONFIG_HOME ?? platformConfigRoot, "herdr", "config.toml");

export async function copiedThemeFromHerdrConfig(): Promise<ResolvedThemeSnapshot | null> {
  try {
    return themeFromHerdrConfig(await readFile(configPath, "utf8"));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? copiedHerdrTheme("catppuccin") ?? null : null;
  }
}

export function themeFromHerdrConfig(source: string): ResolvedThemeSnapshot | null {
  let section = "";
  let name = "catppuccin";
  let autoSwitch = false;
  let darkName: string | undefined;
  const custom: Partial<Record<keyof ThemePalette, string>> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const stringValue = line.match(/^([\w-]+)\s*=\s*(['"])(.*?)\2(?:\s*#.*)?$/);
    const boolValue = line.match(/^([\w-]+)\s*=\s*(true|false)\b/);
    if (section === "theme" && stringValue?.[1] === "name") name = stringValue[3];
    if (section === "theme" && stringValue?.[1] === "dark_name") darkName = stringValue[3];
    if (section === "theme" && boolValue?.[1] === "auto_switch") autoSwitch = boolValue[2] === "true";
    if (section === "theme.custom" && stringValue && paletteTokens.includes(stringValue[1] as keyof ThemePalette)) {
      custom[stringValue[1] as keyof ThemePalette] = stringValue[3];
    }
  }

  const selectedName = autoSwitch ? darkName || darkSibling(name) : name;
  const theme = copiedHerdrTheme(selectedName)
    ?? (normalizeName(selectedName) === "terminal" ? undefined : copiedHerdrTheme("catppuccin"));
  if (!theme) return null;
  for (const token of paletteTokens) {
    const override = custom[token];
    if (!override) continue;
    const parsed = parseColor(override);
    if (parsed) theme.palette[token] = parsed;
  }
  return theme;
}

function darkSibling(name: string): string {
  const normalized = normalizeName(name);
  if (["catppuccin-latte", "latte", "light"].includes(normalized)) return "catppuccin";
  if (["tokyo-night-day", "tokyo-day", "tokyonight-day"].includes(normalized)) return "tokyo-night";
  if (normalized === "gruvbox-light") return "gruvbox";
  if (["one-light", "onelight"].includes(normalized)) return "one-dark";
  if (normalized === "solarized-light") return "solarized";
  if (["kanagawa-lotus", "lotus"].includes(normalized)) return "kanagawa";
  if (["rose-pine-dawn", "rosepine-dawn", "dawn"].includes(normalized)) return "rose-pine";
  return name;
}

function parseColor(value: string): RgbColor | undefined {
  const input = value.trim().toLowerCase();
  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex;
    return { r: parseInt(expanded.slice(0, 2), 16), g: parseInt(expanded.slice(2, 4), 16), b: parseInt(expanded.slice(4, 6), 16) };
  }
  const rgb = input.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) {
    const values = rgb.slice(1).map(Number);
    if (values.every((part) => part <= 255)) return { r: values[0], g: values[1], b: values[2] };
  }
  return undefined;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[ _]+/g, "-");
}
