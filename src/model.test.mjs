import assert from "node:assert/strict";
import test from "node:test";

import {
  attentionPanes,
  commandIntent,
  hasResolvedTheme,
  normalizeSettings,
  paneIdentity,
  resolvePin,
  resolvePinRequest,
  snapshotFromApi,
  slotForCoordinates,
  wrappedIndex
} from "./model.ts";
import { themeFromHerdrConfig } from "../.preview/theme.js";
import { dialSvg, keySvg } from "../.preview/render.js";

test("device state keeps six pins and soft navigation wraps", () => {
  const settings = normalizeSettings({
    pageIndex: 8,
    pages: [{ name: "WORK", pins: [{ paneId: "w1:p1", label: "api" }] }]
  });
  assert.equal(settings.pageIndex, 0);
  assert.equal(settings.pages[0].pins.length, 6);
  assert.deepEqual(settings.pages[0].pins[0], { paneId: "w1:p1", label: "api" });
  assert.equal(slotForCoordinates(2, 0), 2);
  assert.equal(slotForCoordinates(0, 1), 3);
  assert.equal(slotForCoordinates(2, 1), 5);
  assert.equal(slotForCoordinates(3, 0), null);
  assert.equal(slotForCoordinates(3, 1), null);
  assert.equal(wrappedIndex(0, -1, 3), 2);
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
  assert.equal(resolvePin(pinned, {
    panes: [
      { pane_id: "old", terminal_id: "term-2", focused: false, agent_status: "working", agent_session: { ...session, value: "different" } }
    ]
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
  assert.match(wrappedKey, />ABCDEFGH<\/tspan>/);
  assert.match(wrappedKey, />IJ<\/tspan>/);
  const mixedKey = keySvg({ label: "ABCDEFGHIJ-K" });
  assert.match(mixedKey, />ABCDEFGH<\/tspan>/);
  assert.match(mixedKey, />IJ K<\/tspan>/);
  assert.match(keySvg({ label: "1234567😀" }), />1234567<\/tspan><tspan[^>]*>😀<\/tspan>/u);
  assert.match(keySvg({ label: "1234567e\u0301" }), />1234567é<\/tspan>/u);
  assert.match(keySvg({ label: "😀😀😀😀😀😀😀😀" }), />😀😀😀😀<\/tspan><tspan[^>]*>😀😀😀😀<\/tspan>/u);
  assert.match(keySvg({ label: "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣" }), />1️⃣2️⃣3️⃣4️⃣<\/tspan><tspan[^>]*>5️⃣6️⃣7️⃣8️⃣<\/tspan>/u);
  assert.match(keySvg({ label: "𠀀𠀀𠀀𠀀𠀀𠀀𠀀𠀀" }), />𠀀𠀀𠀀𠀀<\/tspan><tspan[^>]*>𠀀𠀀𠀀𠀀<\/tspan>/u);
  assert.match(keySvg({ label: "PANE", context: "VOD RESEARCH › T5" }), />VOD R… › T5<\/text>/);
  assert.match(keySvg({ label: "PANE", context: "WORK › IMPLEMENTATION" }), />IMPLEMENTA…<\/text>/);

  const lowContrastTheme = {
    name: "custom", appearance: "light",
    palette: { ...palette, text: { r: 10, g: 10, b: 10 }, subtext0: { r: 20, g: 20, b: 20 }, red: { r: 157, g: 0, b: 6 } }
  };
  const oledKey = keySvg({ label: "STOP", detail: "CONFIRM", danger: true }, lowContrastTheme);
  const customKey = keySvg({ label: "CUSTOM", detail: "DETAIL" }, lowContrastTheme);
  const hardwareDial = dialSvg("CURRENT", "review-suite", lowContrastTheme);
  assert.match(oledKey, /fill="#000000"/);
  assert.match(customKey, /font-size="26"/);
  assert.match(customKey, /font-size="18"/);
  assert.match(hardwareDial, /font-size="20"/);
  assert.match(hardwareDial, /font-size="28"/);
  assert.doesNotMatch(`${customKey}${hardwareDial}`, /<style|class=|font:/);
  assert.doesNotMatch(oledKey, /rgb\((?:10 10 10|20 20 20|157 0 6)\)/);
  assert.doesNotMatch(customKey, /rgb\((?:10 10 10|20 20 20)\)/);
  const [, red, green, blue] = oledKey.match(/font-size="26" fill="rgb\((\d+) (\d+) (\d+)\)"/).map(Number);
  const luminance = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  assert.ok((0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] + 0.05) / 0.05 >= 4.5);
});
