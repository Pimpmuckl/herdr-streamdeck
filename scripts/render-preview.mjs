import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { dialSvg, keySvg } from "../.preview/render.js";

const pluginImages = resolve("dev.herdr.streamdeck.sdPlugin/imgs");
const brand = {
  light: pngData(resolve(pluginImages, "herdr_logo_wide.png")),
  dark: pngData(resolve(pluginImages, "herdr_logo_wide_dark.png"))
};

const herdrThemeSource = readFileSync(resolve(process.env.HERDR_SOURCE || "../herdr/src/app/state.rs"), "utf8");
const dark = themeFromHerdr("catppuccin", "dark");
const light = themeFromHerdr("catppuccin_latte", "light");

mkdirSync("artifacts", { recursive: true });
for (const [name, value] of [["dark", dark], ["light", light]]) {
  writeFileSync(`artifacts/device-preview-${name}.svg`, cleanSvg(devicePreview(value)));
}
writeFileSync("artifacts/device-preview-command-dark.svg", cleanSvg(devicePreview(dark, "command")));
writeFileSync("artifacts/device-preview-stop-armed-dark.svg", cleanSvg(devicePreview(dark, "stop")));

function devicePreview(activeTheme, mode = "dashboard") {
  const dashboardKeys = [
    { label: "api-rewrite", slot: 0, status: "blocked", selected: true },
    { label: "review-suite", slot: 1, status: "working" },
    { label: "kraken-backup", slot: 2, status: "done" },
    { label: "EMPTY", slot: 3, empty: true },
    { label: "daedalus", slot: 4, status: "idle" },
    { label: "vod-graph", slot: 5, status: "working" },
    { label: "INBOX 2", status: "blocked" },
    { label: "COMMAND" }
  ];
  const commandKeys = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "—", mode === "stop" ? "STOP AGAIN" : "STOP"]
    .map((label, slot) => ({ label, slot, danger: mode === "stop" && slot === 5 }))
    .concat([{ label: "INBOX 2", status: "blocked" }, { label: "CANCEL" }]);
  const keys = (mode === "dashboard" ? dashboardKeys : commandKeys).map((view) => keySvg(view, activeTheme));
  const dashboardDials = [
    dialSvg(0, "PINNED PAGE", "WORK", activeTheme, "accent", brand),
    dialSvg(1, "ATTENTION 2", "api-rewrite", activeTheme, "yellow", brand),
    dialSvg(2, "CURRENT · LIVE", "review-suite", activeTheme, "blue", brand),
    dialSvg(3, "QUESTION", "OPEN HERDR", activeTheme, "yellow", brand)
  ];
  const commandDials = [
    dialSvg(0, "PINNED PAGE", "WORK", activeTheme, "accent", brand),
    dialSvg(1, "ATTENTION 2", "api-rewrite", activeTheme, "yellow", brand),
    dialSvg(2, "COMMAND TARGET", "review-suite", activeTheme, "accent", brand),
    dialSvg(3, "QUICK SELECT", "NO QUESTION", activeTheme, "overlay0", brand)
  ];
  const dials = mode === "dashboard" ? dashboardDials : commandDials;
  const placedKeys = keys.map((svg, index) => place(svg, 88 + (index % 4) * 160, 18 + Math.floor(index / 4) * 160)).join("\n");
  const placedDials = dials.map((svg, index) => place(svg, index * 200, 348)).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="466" viewBox="0 0 800 466">
    <rect width="800" height="466" rx="28" fill="#101015"/>
    ${placedKeys}
    <rect y="342" width="800" height="112" rx="10" fill="#050507"/>
    ${placedDials}
  </svg>`;
}

function place(svg, x, y) {
  return svg.replace("<svg ", `<svg x="${x}" y="${y}" `);
}

function themeFromHerdr(functionName, appearance) {
  const start = herdrThemeSource.indexOf(`pub fn ${functionName}()`);
  const end = herdrThemeSource.indexOf("\n    pub fn ", start + 1);
  if (start < 0 || end < 0) throw new Error(`Herdr theme not found: ${functionName}`);
  const block = herdrThemeSource.slice(start, end);
  const tokens = {};
  for (const match of block.matchAll(/(\w+): Color::Rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)) {
    tokens[match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return {
    name: functionName.replaceAll("_", "-"),
    appearance,
    palette: Object.fromEntries(Object.entries(tokens).map(([key, [r, g, b]]) => [key, { r, g, b }]))
  };
}

function pngData(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}

function cleanSvg(svg) {
  return svg.replace(/[ \t]+$/gm, "");
}
