import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { keySvg, stripRegionSvg } from "../.preview/render.js";
import { copiedHerdrTheme } from "../.preview/herdr-themes.js";

const dark = copiedHerdrTheme("catppuccin");
const light = copiedHerdrTheme("catppuccin-latte");
if (!dark || !light) throw new Error("Copied Herdr preview themes are missing");
const logoImage = `data:image/svg+xml;base64,${Buffer.from(readFileSync("dev.herdr.streamdeck.sdPlugin/imgs/herdr_logo.svg", "utf8").replace("currentColor", "#959391")).toString("base64")}`;

mkdirSync("artifacts", { recursive: true });
for (const [name, value] of [["dark", dark], ["light", light]]) {
  writeFileSync(`artifacts/device-preview-${name}.svg`, cleanSvg(devicePreview(value)));
}
writeFileSync("artifacts/device-preview-command-dark.svg", cleanSvg(devicePreview(dark, "command")));
writeFileSync("artifacts/device-preview-attention-dark.svg", cleanSvg(devicePreview(dark, "attention")));
writeFileSync("artifacts/device-preview-stop-armed-dark.svg", cleanSvg(devicePreview(dark, "stop")));

function devicePreview(activeTheme, mode = "dashboard") {
  const dashboardKeys = [
    { label: "research-vodint-graph", detail: "NEEDS YOU", slot: 0, status: "blocked", selected: true },
    { label: "review-suite", slot: 1, status: "working", workingFrame: 5, workingMotion: "lighten" },
    { label: "kraken-backup", slot: 2, status: "working", workingFrame: 5, workingMotion: "darken" },
    { label: "INBOX", count: 2, status: "blocked" },
    { label: "", slot: 3, empty: true },
    { label: "daedalus", slot: 4, status: "idle" },
    { label: "vod-graph", slot: 5, status: "working", workingFrame: 5, workingMotion: "rainbow" },
    { label: "ACTIONS" }
  ];
  const commandActions = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "—", mode === "stop" ? "STOP AGAIN" : "STOP"]
    .map((label, slot) => ({ label, detail: mode === "stop" && slot === 5 ? "PRESS AGAIN" : slot === 4 ? "UNASSIGNED" : undefined, slot, danger: mode === "stop" && slot === 5 }));
  const commandKeys = [
    ...commandActions.slice(0, 3),
    { label: "INBOX", count: 2, status: "blocked" },
    ...commandActions.slice(3),
    { label: "BACK" }
  ];
  const keys = (["command", "stop"].includes(mode) ? commandKeys : dashboardKeys).map((view) => keySvg(view, activeTheme));
  const strip = mode === "attention"
    ? { kind: "attention", label: "api-rewrite", position: "1 / 2", focused: true }
    : mode === "dashboard"
      ? { kind: "logo", image: logoImage, alignment: "center" }
      : { kind: "command", label: "review-suite" };
  const dials = [0, 1, 2, 3].map((region) => stripRegionSvg(region, strip, activeTheme));
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
