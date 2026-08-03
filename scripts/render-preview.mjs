import { mkdirSync, writeFileSync } from "node:fs";

import { dialSvg, keySvg } from "../.preview/render.js";
import { copiedHerdrTheme } from "../.preview/herdr-themes.js";

const dark = copiedHerdrTheme("catppuccin");
const light = copiedHerdrTheme("catppuccin-latte");
if (!dark || !light) throw new Error("Copied Herdr preview themes are missing");

mkdirSync("artifacts", { recursive: true });
for (const [name, value] of [["dark", dark], ["light", light]]) {
  writeFileSync(`artifacts/device-preview-${name}.svg`, cleanSvg(devicePreview(value)));
}
writeFileSync("artifacts/device-preview-command-dark.svg", cleanSvg(devicePreview(dark, "command")));
writeFileSync("artifacts/device-preview-stop-armed-dark.svg", cleanSvg(devicePreview(dark, "stop")));

function devicePreview(activeTheme, mode = "dashboard") {
  const dashboardKeys = [
    { label: "api-rewrite", context: "KRAKEN › T6", slot: 0, status: "blocked", selected: true },
    { label: "review-suite", context: "TOOLS › T2", slot: 1, status: "working" },
    { label: "kraken-backup", context: "AUDIT › T1", slot: 2, status: "done" },
    { label: "", slot: 3, empty: true },
    { label: "daedalus", context: "DAEDALUS › T1", slot: 4, status: "idle" },
    { label: "vod-graph", context: "VOD RESEARCH › T5", slot: 5, status: "working" },
    { label: "INBOX", detail: "2 NEED YOU", status: "blocked" },
    { label: "COMMAND", detail: "TAP FOR ACTIONS" }
  ];
  const commandKeys = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "—", mode === "stop" ? "STOP AGAIN" : "STOP"]
    .map((label, slot) => ({ label, context: "COMMAND", detail: mode === "stop" && slot === 5 ? "PRESS TO CONFIRM" : slot === 4 ? "UNASSIGNED" : "PRESS TO SEND", slot, danger: mode === "stop" && slot === 5 }))
    .concat([{ label: "INBOX", detail: "2 NEED YOU", status: "blocked" }, { label: "CANCEL", context: "COMMAND", detail: "review-suite" }]);
  const keys = (mode === "dashboard" ? dashboardKeys : commandKeys).map((view) => keySvg(view, activeTheme));
  const dashboardDials = [
    dialSvg("PINNED PAGE", "WORK", activeTheme, "accent"),
    dialSvg("ATTENTION 2", "api-rewrite", activeTheme, "yellow"),
    dialSvg("CURRENT · LIVE", "review-suite", activeTheme, "blue"),
    dialSvg("QUESTION", "OPEN HERDR", activeTheme, "yellow")
  ];
  const commandDials = [
    dialSvg("PINNED PAGE", "WORK", activeTheme, "accent"),
    dialSvg("ATTENTION 2", "api-rewrite", activeTheme, "yellow"),
    dialSvg("COMMAND TARGET", "review-suite", activeTheme, "accent"),
    dialSvg("QUICK SELECT", "NO QUESTION", activeTheme, "overlay0")
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

function cleanSvg(svg) {
  return svg.replace(/[ \t]+$/gm, "");
}
