import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustMotionSpeed,
  attentionPanes,
  commandIntent,
  hasResolvedTheme,
  navigatePages,
  normalizeSettings,
  paneIdentity,
  resolvePin,
  resolvePinRequest,
  snapshotFromApi,
  slotForCoordinates,
  visiblePageCount,
  wrappedIndex
} from "./model.ts";
import { themeFromHerdrConfig } from "../.preview/theme.js";
import { dialSvg, keySvg, stripRegionSvg } from "../.preview/render.js";

test("device state, pin identity, and device rendering stay coherent", () => {
  const settings = normalizeSettings({
    pageIndex: 8,
    pages: [{ name: "WORK", pins: [{ paneId: "w1:p1", label: "api" }] }]
  });
  assert.equal(settings.pageIndex, 0);
  assert.equal(settings.focusFeedback, false);
  assert.equal(settings.motionSpeed, 0.5);
  assert.equal(settings.logoAlignment, "right");
  assert.equal(settings.pages[0].pins.length, 6);
  assert.deepEqual(settings.pages[0].pins[0], { paneId: "w1:p1", label: "api" });
  assert.equal(normalizeSettings({ focusFeedback: true }).focusFeedback, true);
  assert.equal(normalizeSettings({ motionSpeed: 0.73 }).motionSpeed, 0.75);
  assert.equal(normalizeSettings({ logoAlignment: "center" }).logoAlignment, "center");
  assert.equal(normalizeSettings({ logoAlignment: "right" }).logoAlignment, "right");
  assert.equal(adjustMotionSpeed(0.5, 2), 0.6);
  assert.equal(adjustMotionSpeed(0.1, -1), 0.1);
  assert.equal(adjustMotionSpeed(1, 1), 1);
  assert.equal(slotForCoordinates(2, 0), 2);
  assert.equal(slotForCoordinates(0, 1), 3);
  assert.equal(slotForCoordinates(2, 1), 5);
  assert.equal(slotForCoordinates(3, 0), null);
  assert.equal(slotForCoordinates(3, 1), null);
  assert.equal(wrappedIndex(0, -1, 3), 2);
  const paged = normalizeSettings({
    pages: [{ name: "ONE", pins: [{ paneId: "p1", label: "one" }] }]
  });
  navigatePages(paged, 2);
  assert.equal(paged.pageIndex, 1);
  assert.equal(paged.pages.length, 2);
  assert.equal(visiblePageCount(paged), 2);
  navigatePages(paged, 1);
  assert.equal(paged.pageIndex, 1);
  paged.pages[1].pins[0] = { paneId: "p2", label: "two" };
  navigatePages(paged, 1);
  assert.equal(paged.pageIndex, 2);
  assert.equal(paged.pages.length, 3);
  navigatePages(paged, -99);
  assert.equal(paged.pageIndex, 0);
  const gappedPages = normalizeSettings({
    pages: [
      { name: "ONE", pins: [] },
      { name: "TWO", pins: [{ paneId: "p2", label: "two" }] },
      { name: "THREE", pins: [] }
    ]
  });
  assert.equal(visiblePageCount(gappedPages), 3);
  navigatePages(gappedPages, 2);
  assert.equal(gappedPages.pageIndex, 2);
  assert.deepEqual(
    attentionPanes({
      panes: [
        { pane_id: "blocked", focused: false, agent_status: "blocked" },
        { pane_id: "working", focused: false, agent_status: "working" }
      ]
    }).map((pane) => pane.pane_id),
    ["blocked"]
  );
  const stockSnapshot = {
    focused_pane_id: "blocked",
    panes: [{ pane_id: "blocked", focused: true, agent_status: "blocked" }]
  };
  assert.equal(snapshotFromApi({ result: stockSnapshot }), stockSnapshot);
  assert.equal(snapshotFromApi({ result: { snapshot: stockSnapshot } }), stockSnapshot);
  assert.equal(resolvePinRequest({ paneId: "blocked", requestedAt: "2026-08-03T12:00:00Z" }, stockSnapshot)?.pane_id, "blocked");
  assert.equal(resolvePinRequest({ paneId: "missing", requestedAt: "2026-08-03T12:00:00Z" }, stockSnapshot), undefined);
  assert.equal(resolvePinRequest({ paneId: "blocked" }, stockSnapshot), undefined);
  assert.deepEqual(commandIntent(0, false), { kind: "prompt", text: "Continue with your best judgment." });
  assert.deepEqual(commandIntent(4, false), { kind: "unavailable" });
  assert.deepEqual(commandIntent(5, false), { kind: "arm-stop" });
  assert.deepEqual(commandIntent(5, true), { kind: "stop" });
  const session = { source: "herdr:codex", agent: "codex", kind: "id", value: "session-1" };
  const pinned = { paneId: "old", label: "api", terminalId: "term-2", agentSession: session };
  assert.equal(resolvePin(pinned, {
    panes: [
      { pane_id: "new-1", terminal_id: "term-1", focused: false, agent_status: "idle", agent_session: session },
      { pane_id: "new-2", terminal_id: "term-2", focused: false, agent_status: "working", agent_session: session }
    ]
  })?.pane_id, "new-2");
  const renamedPane = resolvePin({ paneId: "old", label: "api", agentSession: session }, {
    panes: [
      { pane_id: "old", label: "renamed-api", focused: false, agent_status: "working", agent_session: session },
      { pane_id: "other", label: "other", focused: false, agent_status: "idle", agent_session: session }
    ]
  });
  assert.equal(renamedPane?.pane_id, "old");
  assert.equal(paneIdentity(renamedPane, null, "api").primary, "renamed-api");
  assert.equal(resolvePin(pinned, {
    panes: [
      { pane_id: "old", terminal_id: "term-2", focused: false, agent_status: "working", agent_session: { ...session, value: "different" } }
    ]
  })?.pane_id, "old");
  assert.equal(resolvePin(pinned, {
    panes: [{ pane_id: "shell", terminal_id: "term-2", focused: false, agent_status: "idle" }]
  }), undefined);
  assert.equal(resolvePin(pinned, {
    panes: [{ pane_id: "reopened", terminal_id: "term-2", agent: "codex", focused: false, agent_status: "idle" }]
  })?.pane_id, "reopened");
  assert.equal(resolvePin(pinned, {
    panes: [{
      pane_id: "moved", terminal_id: "term-3", agent: "codex", terminal_title_stripped: "api",
      focused: false, agent_status: "idle"
    }]
  })?.pane_id, "moved");
  assert.equal(resolvePin(pinned, {
    panes: ["one", "two"].map((pane_id) => ({
      pane_id, agent: "codex", terminal_title_stripped: "api", focused: false, agent_status: "idle"
    }))
  }), undefined);
  assert.equal(resolvePin(pinned, {
    panes: [{
      pane_id: "other-agent", terminal_id: "term-2", focused: false, agent_status: "working",
      agent_session: { ...session, agent: "claude", value: "different" }
    }]
  }), undefined);
  assert.equal(hasResolvedTheme(undefined), false);
  const palette = Object.fromEntries([
    "accent", "panel_bg", "surface0", "surface1", "surface_dim", "overlay0", "overlay1", "text",
    "subtext0", "mauve", "green", "yellow", "red", "blue", "teal", "peach"
  ].map((token) => [token, { r: 1, g: 2, b: 3 }]));
  assert.equal(hasResolvedTheme({ name: "herdr", appearance: "dark", palette }), true);
  assert.equal(hasResolvedTheme({ name: "herdr", appearance: "dark", palette: { ...palette, red: null } }), false);

  const identityPane = {
    pane_id: "w1:p2", workspace_id: "w1", tab_id: "w1:t3", label: "review-suite",
    terminal_title_stripped: "review-suite", cwd: "C:\\Code\\review-suite", focused: true, agent_status: "working"
  };
  assert.deepEqual(paneIdentity(identityPane, {
    panes: [identityPane],
    workspaces: [{ workspace_id: "w1", label: "TOOLS" }],
    tabs: [{ tab_id: "w1:t3", workspace_id: "w1", label: "2" }]
  }, "fallback"), { primary: "review-suite", context: "TOOLS › T2" });

  const copiedTheme = themeFromHerdrConfig(`
[theme]
name = "nord"

[theme.custom]
accent = "#123456"
red = "rgb(255, 85, 85)"
`);
  assert.equal(copiedTheme?.name, "nord");
  assert.deepEqual(copiedTheme?.palette.accent, { r: 18, g: 52, b: 86 });
  assert.deepEqual(copiedTheme?.palette.red, { r: 255, g: 85, b: 85 });
  assert.equal(themeFromHerdrConfig(`[theme]\nname = "tokyo-night-day"\nauto_switch = true`)?.name, "tokyo-night");
  assert.equal(themeFromHerdrConfig(`[theme]\nname = "not-a-theme"`)?.name, "catppuccin");
  assert.equal(themeFromHerdrConfig(`[theme]\nname = "terminal"`), null);
  assert.equal(themeFromHerdrConfig(`[theme] # palette\nname = 'nord' # TOML literal string`)?.name, "nord");

  const wrappedKey = keySvg({ label: "ABCDEFGHIJ" });
  assert.match(wrappedKey, />ABCDEFGH<\/text>/);
  assert.match(wrappedKey, />IJ<\/text>/);
  const mixedKey = keySvg({ label: "ABCDEFGHIJ-K" });
  assert.match(mixedKey, />ABCDEFGH<\/text>/);
  assert.match(mixedKey, />IJ-K<\/text>/);
  assert.match(keySvg({ label: "daedalus-architect" }), /font-size="22\.5"[^>]*>daedalus<\/text>.*font-size="22\.5"[^>]*>architect<\/text>/su);
  const herdrStreamDeckKey = keySvg({ label: "herdr-streamdeck", selected: true });
  assert.match(herdrStreamDeckKey, /x="72"[^>]*font-size="21"[^>]*letter-spacing="-0\.04em"[^>]*>herdr<\/text>.*x="72"[^>]*font-size="21"[^>]*letter-spacing="-0\.04em"[^>]*>streamdeck<\/text>/su);
  assert.doesNotMatch(herdrStreamDeckKey, /x="76"/);
  assert.match(keySvg({ label: "nextide-saas-vod-kraken" }), />nextide<\/text>.*>saas-vod<\/text>.*>kraken<\/text>/su);
  assert.match(keySvg({ label: "ABCDEFGHIJKLMNOPQRSTUVWXY" }), /font-size="18"[^>]*>ABCDEFGHIJKL<\/text>.*>MNOPQRSTUVWX<\/text>.*>Y<\/text>/su);
  assert.match(keySvg({ label: "nextide-saas-vod-intelligence" }), /font-size="18"[^>]*>nextide<\/text>.*>saas-vod<\/text>.*>intelligence<\/text>/su);
  assert.match(keySvg({ label: "ends-" }), />ends-<\/text>/);
  assert.match(keySvg({ label: "1234567😀" }), />1234567<\/text>.*>😀<\/text>/su);
  assert.match(keySvg({ label: "1234567e\u0301" }), />1234567é<\/text>/u);
  assert.match(keySvg({ label: "😀😀😀😀😀😀😀😀" }), />😀😀😀😀<\/text>.*>😀😀😀😀<\/text>/su);
  assert.match(keySvg({ label: "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣" }), />1️⃣2️⃣3️⃣4️⃣<\/text>.*>5️⃣6️⃣7️⃣8️⃣<\/text>/su);
  assert.match(keySvg({ label: "𠀀𠀀𠀀𠀀𠀀𠀀𠀀𠀀" }), />𠀀𠀀𠀀𠀀<\/text>.*>𠀀𠀀𠀀𠀀<\/text>/su);
  assert.match(keySvg({ label: "PANE", context: "VOD RESEARCH › T5" }), />VOD RE… · T5<\/text>/);
  assert.match(keySvg({ label: "PANE", context: "WORK › IMPLEMENTATION" }), />IMPLEMENTAT…<\/text>/);

  const threadKey = keySvg({ label: "research-vodint-graph", context: "VOD-INTELLIGENCE › T1", slot: 0, status: "working", selected: true });
  assert.match(threadKey, /y="47"[^>]*>research<\/text>.*y="76"[^>]*>vodint<\/text>.*y="105"[^>]*>graph<\/text>/s);
  assert.doesNotMatch(threadKey, /letter-spacing="-0\.04em"/);
  assert.doesNotMatch(threadKey, /<tspan/);
  assert.match(threadKey, /<rect x="4" y="4" width="136" height="136" rx="18"[^>]*stroke="#ffffff" stroke-width="5"/);
  assert.match(threadKey, /<rect x="11" y="11" width="122" height="122" rx="11"[^>]*stroke="#ffffff" stroke-width="3"/);
  assert.equal(threadKey.match(/stroke="#ffffff"/g)?.length, 2);
  assert.doesNotMatch(threadKey, /<circle|#202020/);
  assert.match(threadKey, /<rect width="144" height="144" fill="#000000"/);
  assert.doesNotMatch(threadKey, />1<\/text>/);
  assert.match(keySvg({ label: "idle" }), /<rect width="144" height="144" fill="#000000"/);
  const inboxKey = keySvg({ label: "INBOX", count: 12, status: "blocked" });
  assert.match(inboxKey, /y="36"[^>]*font-size="22"[^>]*>INBOX<\/text>/);
  assert.match(inboxKey, /y="116"[^>]*font-size="72"[^>]*>12<\/text>/);
  assert.match(keySvg({ label: "idle", status: "idle" }), /stroke-width="3"/);
  assert.match(keySvg({ label: "unknown", status: "unknown" }), /stroke-width="3" stroke-dasharray="10 8"/);
  assert.match(keySvg({ label: "done", status: "done" }), /stroke-width="7"/);
  const successKey = keySvg({ label: "THREAD UNPINNED", feedback: "success" }, copiedTheme);
  assert.match(successKey, /<rect width="144" height="144" fill="rgb\(\d+ \d+ \d+\)"/);
  assert.match(successKey, /fill="#000000"[^>]*>THREAD<\/text>.*fill="#000000"[^>]*>UNPINNED<\/text>/s);
  assert.doesNotMatch(successKey, /stroke-width=/);
  assert.match(keySvg({ label: "STOP", danger: true }), /stroke-width="7"/);
  const darkSwoosh = keySvg({ label: "working", status: "working", workingFrame: 4, workingMotion: "darken" });
  const lightSwoosh = keySvg({ label: "working", status: "working", workingFrame: 4, workingMotion: "lighten" });
  assert.equal(darkSwoosh.match(/stroke="#000000" stroke-opacity=/g)?.length, 19);
  assert.equal(lightSwoosh.match(/stroke-dasharray="4\.62 1021\.58"/g)?.length, 19);
  assert.match(lightSwoosh, /stroke-opacity="0\.02"/);
  assert.match(lightSwoosh, /stroke-opacity="0\.45"[^>]*stroke-dashoffset="-95\.4"/);
  assert.doesNotMatch(lightSwoosh, /pathLength=/);
  const rainbowKey = keySvg({ label: "working", status: "working", workingFrame: 4, workingMotion: "rainbow" });
  assert.equal(rainbowKey.match(/stroke-dasharray="4\.62 1021\.58"/g)?.length, 19);
  for (const color of ["rgb(175 46 255)", "rgb(255 51 85)", "rgb(255 218 83)", "rgb(30 228 188)"]) assert.match(rainbowKey, new RegExp(`stroke="${color.replace(/[()]/g, "\\$&")}"`));
  assert.match(keySvg({ label: "", slot: 0, empty: true }), />1<\/text>/);

  const lowContrastTheme = {
    name: "custom", appearance: "light",
    palette: { ...palette, text: { r: 10, g: 10, b: 10 }, subtext0: { r: 20, g: 20, b: 20 }, red: { r: 157, g: 0, b: 6 } }
  };
  const oledKey = keySvg({ label: "STOP", detail: "CONFIRM", danger: true }, lowContrastTheme);
  const customKey = keySvg({ label: "CUSTOM", detail: "DETAIL" }, lowContrastTheme);
  const hardwareDial = dialSvg("CURRENT", "review-suite", lowContrastTheme);
  assert.match(oledKey, /fill="#000000"/);
  assert.match(customKey, /font-size="27"/);
  assert.match(customKey, /font-size="18"/);
  assert.match(hardwareDial, /font-size="20"/);
  assert.match(hardwareDial, /font-size="28"/);
  assert.doesNotMatch(`${customKey}${hardwareDial}`, /<style|class=|font:/);
  assert.doesNotMatch(oledKey, /rgb\((?:10 10 10|20 20 20|157 0 6)\)/);
  assert.doesNotMatch(customKey, /rgb\((?:10 10 10|20 20 20)\)/);
  const pageStrip = [0, 1, 2, 3].map((region) => stripRegionSvg(region, {
    kind: "page", name: "ONE", position: "1 / 3", summary: "2 WORKING · 1 NEEDS YOU"
  }, lowContrastTheme));
  assert.match(pageStrip[0], /viewBox="0 0 200 100"/);
  assert.match(pageStrip[1], /viewBox="200 0 200 100"/);
  assert.match(pageStrip[3], /viewBox="600 0 200 100"/);
  assert.match(pageStrip.join(""), /font-size="50"[^>]*>ONE<\/text>/);
  assert.match(stripRegionSvg(0, { kind: "logo", image: "logo.png", alignment: "center" }, lowContrastTheme), /<image href="logo\.png" x="350" y="0" width="100" height="100"\/>/);
  assert.match(stripRegionSvg(0, { kind: "logo", image: "logo.png", alignment: "right" }, lowContrastTheme), /<image href="logo\.png" x="700" y="0" width="100" height="100"\/>/);
  assert.match(stripRegionSvg(0, { kind: "motion", name: "RAINBOW SWOOSH", position: "3 \/ 3" }, lowContrastTheme), />WORKING MOTION<\/text>.*>RAINBOW SWOOSH<\/text>/s);
  assert.match(stripRegionSvg(0, { kind: "speed", value: "0.7×" }, lowContrastTheme), /font-size="56"[^>]*>0\.7×<\/text>/);
  assert.match(stripRegionSvg(0, { kind: "command", label: "review-suite" }, lowContrastTheme), />ACTIONS FOR<\/text>.*>review-suite<\/text>/s);
  const attentionStrip = stripRegionSvg(0, { kind: "attention", label: "api-rewrite", position: "1 \/ 2", focused: true }, lowContrastTheme);
  assert.match(attentionStrip, />NEEDS YOU<\/text>/);
  assert.match(attentionStrip, />QUESTION IN HERDR<\/text>/);
  assert.match(stripRegionSvg(0, { kind: "attention", label: "api-rewrite", position: "1 \/ 2", focused: false }, lowContrastTheme), />PRESS DIAL 2<\/text>/);
  assert.doesNotMatch(`${pageStrip.join("")}${attentionStrip}`, /<style|class=|font:|<tspan/);
  const [, red, green, blue] = oledKey.match(/font-size="[^"]+" fill="rgb\((\d+) (\d+) (\d+)\)"/).map(Number);
  const luminance = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  assert.ok((0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] + 0.05) / 0.05 >= 4.5);
});
