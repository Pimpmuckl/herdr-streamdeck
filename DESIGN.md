---
name: Herdr Stream Deck+
description: A dense, runtime-themed physical triage instrument for Herdr.
typography:
  attention-count:
    fontSize: "72px"
    fontWeight: 700
  primary-label:
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "29px"
  dial-value:
    fontSize: "28px"
    fontWeight: 700
  status-mark:
    fontSize: "22px"
    fontWeight: 700
  meta-label:
    fontSize: "20px"
    fontWeight: 700
  strip-title:
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "0.2px"
  hint:
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "0.1px"
rounded:
  key-outline: "16px"
spacing:
  key-inset: "3px"
  strip-content-inset: "18px"
components:
  key-canvas:
    width: "144px"
    height: "144px"
  key-outline:
    width: "138px"
    height: "138px"
    rounded: "{rounded.key-outline}"
  dial-region:
    width: "200px"
    height: "100px"
  dial-accent-bar:
    width: "5px"
    height: "100px"
---

# Design System: Herdr Stream Deck+

## Overview

**Creative North Star: "The Dense Terminal Instrument"**

Herdr Stream Deck+ is a one-handed physical triage surface, not a miniature application. Eight fixed keys carry terse operational labels and state marks; four adjacent dial regions read as one continuous status strip. The visual hierarchy favors instant recognition, stable positions, and deliberate commits over decoration.

The implementation is flat, compact, and terminal-like. Every unused OLED pixel is true black; Herdr supplies text, state, and focus colors while the plugin supplies geometry, type scale, and interaction marks.

**Key Characteristics:**

- Fixed 4-by-2 key bank above one 800-by-100-pixel dial strip.
- Short, bold monospaced labels with small uppercase strip titles.
- Strong border changes for focus and armed destructive state.
- Turns preview and presses commit, except direct page and thread navigation.
- One-shot Command mode preserves fixed command positions.

**Build limitations:** The current SVGs depend on Unicode status glyphs and prefer system-installed Consolas or Cascadia Mono. Those dependencies are shipped implementation constraints, not canonical iconography or typeface assets.

## Colors

The plugin has no independent palette. Until Herdr exposes its resolved runtime palette, rendering uses a generated compatibility copy of Herdr's 17 RGB built-in themes plus the saved theme name and custom RGB overrides from Herdr's config. The host-derived `terminal` palette falls back to monochrome.

### Runtime roles

- **OLED field:** every key and dial background is fixed `#000000`; the selected thread alone uses fixed `#202020` plus its focus dot. Theme surface colors never tint unused pixels.
- **Idle brand mark:** the exact Herdr vector uses `#959391` on the black dial strip so it stays quieter than live status content.
- **Surface role:** `surface1` defines only the resting key outline.
- **Text roles:** `text` and `subtext0` separate primary labels from slot numbers, titles, and hints.
- **Contrast adaptation:** configured text and semantic roles retain their hue and are lifted toward white only when needed to remain legible on black.
- **State roles:** `yellow` marks attention, `blue` marks working, `green` marks completed, `overlay0` marks idle, unknown, or offline, and `red` marks the armed destructive state.
- **Accent role:** `accent` anchors ordinary dial regions and non-destructive emphasis.

**The Herdr Owns Color Rule.** Never add plugin palette settings or hand-maintained swatches. The temporary generated palette copy must remain mechanically derived from Herdr and disappear when a resolved-theme API exists.

**The OLED Black Rule.** Keep every background pixel `#000000` except the selected thread's `#202020` field. This fixed neutral is selection geometry, not a plugin theme color. Theme roles color information only: text, lifecycle outlines, the focus dot, and dial bars.

**The OLED Contrast Rule.** Resolve every foreground from its actual configured RGB value, not the theme name or appearance. Text and small marks require 4.5:1 against black; outlines and bars require 3:1.

**The Meaning Is Redundant Rule.** Pair every runtime state color with a short label, a non-color mark, an outline, or a stable position; exact glyph artwork is not defined by this system.

## Typography

All device text follows one compact monospaced hierarchy. The normative tokens define size, weight, line rhythm, and tracking; they deliberately do not name a system-installed font family.

### Hierarchy

- **Primary label** (700, 24px default, 18px floor, 29px line step): key names use at most three centered lines and shrink only when the default 24-column capacity overflows.
- **Attention count** (700, 72px): the dominant datum on the active Inbox key.
- **Dial value** (700, 28px): the current page, thread, or question state.
- **Status mark** (700, 22px): the compact upper-right state marker on a key.
- **Meta label** (700, 20px): slot numbers and compact key metadata.
- **Strip title** (700, 20px, 0.2px tracking): uppercase dial-region context.
- **Hint** (700, 18px, 0.1px tracking): secondary physical instructions such as `PRESS SEND`.

**The Physical Type Floor.** Informational device text never falls below 18 pixels on its authored key or dial canvas. Shorten, truncate, or omit secondary copy before reducing type.

**The Device SVG Rule.** Put font family, weight, size, color, alignment, and tracking directly on every SVG text element. Do not depend on embedded CSS, classes, or font shorthand in device images.

**The Operational Copy Rule.** Labels stay brief, literal, and free of implementation terminology; longer content belongs only in the coordinated Question surface.

**The Authored Action Feedback Rule.** Every interactive key and dial owns its pending, success, failure, and restore behavior. An immediate authored state change such as focus, page, Inbox, or Command mode is sufficient acknowledgement; otherwise the affected control briefly renders a literal outcome such as `PINNED`, `UNPINNED`, `FOCUSED`, or `SENT`. Failures name the cause and recovery on the affected control. Never call Stream Deck's generic `showOk()` or `showAlert()` overlays, and never let a rejected action fall through to host-owned feedback.

**The Actionable Error Rule.** Never use the host warning triangle. Render a short cause and recovery hint on the affected key or dial, then restore its normal state.

**The Working Motion Rule.** Keep working labels and the blue lifecycle outline static; animate only a 12% swoosh carried by that same outline. Render explicit SVG frames every 128 milliseconds only on visible working keys. Motion never adds an interior ornament, replaces semantic color, or overwrites pressed, success, or failure feedback. Dial 4 compares darkening, lightening, and Nextide rainbow treatments on identical geometry and timing; the treatment remains under physical-device comparison and is not yet locked.

## Layout

The key bank is a fixed four-column, two-row arrangement of full 144-by-144-pixel canvases. Thread slots form a 3-by-2 block on the left; Inbox and Command form a persistent action rail on the right. A single outline sits 3 pixels from the edge; slot metadata sits at the upper left, the state mark at the upper right, and the primary label remains centered. The selected thread alone receives the fixed near-black field.

The touch strip is one uninterrupted 800-by-100-pixel black composition rendered through four adjacent 200-by-100-pixel regions. Titles and values share an 18-pixel left inset. Each region uses a 5-pixel full-height state bar at its left edge.

**The Fixed Geography Rule.** The rows remain `1 2 3 INBOX` and `4 5 6 COMMAND`. Preserve these positions across modes so one-handed muscle memory remains reliable.

## Elevation & Depth

The system uses no shadows, nested fills, or background artwork. Hierarchy comes only from type, border-carried lifecycle cues, the selected-thread field and focus dot, and border-weight changes for completion or danger.

**The Flat Instrument Rule.** Do not add decorative chrome, gradients, gloss, or simulated physical depth.

## Shapes

Keys use one rounded outline on the OLED field. The dial strip is rectangular and continuous; individual regions must not read as detached cards. Working, blocked, and offline borders are 5 pixels; completed and armed destructive borders are 7 pixels; idle borders are 3 pixels; and unknown borders are 3-pixel dashed outlines. Selection combines the fixed near-black field with the upper-right focus dot without changing lifecycle geometry.

## Components

### Thread and action key

- **Canvas:** full 144 by 144 pixels with a 3-pixel inset outline; only the selected thread changes from black to the fixed near-black field.
- **Content:** the deepest useful pane identity, a border-carried state cue, and an optional short actionable footer. Slot numbers appear only when empty. Page and queue context use temporary full-strip takeovers; the idle strip remains the Herdr logo.
- **Label behavior:** split labels at word separators when possible and use no more than three centered lines. Keep the default 8-column measure at 24px or larger; names beyond its 24-column capacity may expand to 12 columns and shrink as far as the 18px physical type floor. Truncate only after that wider measure is exhausted. The deepest useful identity gets the largest type.
- **Hold feedback:** crossing the 650ms pin threshold commits the change immediately. Keep `RELEASED · LET GO` visible after an unpin until the physical key is released, then restore the empty slot.
- **State:** lifecycle color is repeated through border weight, border pattern, working motion, or a literal footer. Selection uses the near-black field plus the upper-right focus dot. Do not restore interior status glyphs or the removed bottom rail.
- **Inbox exception:** when attention exists, place `INBOX` at the top and render the queue count as the dominant 72-pixel number. Do not add a footer or icon.
- **Empty slot:** show only its slot number and a quiet plus mark.

### Dial region

- **Canvas:** 200 by 100 pixels, one quarter of the coordinated strip.
- **Content:** uppercase 20-pixel title at 18 by 32 pixels and 28-pixel primary value at 18 by 73 pixels.
- **Label behavior:** dial values cap at 10 monospaced columns and truncate with an ellipsis.
- **Field:** keep the full strip background deep black; only information-bearing pixels may light.

### Inbox takeover

- **Entry:** tapping Inbox immediately replaces all four dial regions; no second press is required.
- **Content:** show queue position, selected thread, needs-input state, and either `PRESS DIAL 2` for a soft preview or `QUESTION IN HERDR` after focus. Never imply that dial 4 can open unsupported question content.
- **Fallback:** when Herdr does not expose structured question content, never infer it from terminal text; identify the item and open it in Herdr.
- **Exit:** Command returns to the dashboard. The takeover also returns to the Herdr logo after five seconds. An empty queue uses the same full-strip surface to report `ALL CLEAR`.

### Structured question takeover

- **Entry:** Inbox selects or cycles the question and focuses its thread inside Herdr without raising the operating-system window.
- **Question phase:** use the full strip for thread identity, question position, and one readable text page. Each dial 2 detent advances one page.
- **Neutral gate:** one detent after the last page displays `TURN FOR ANSWERS`; it separates reading from selection without a blank frame.
- **Answer phase:** further dial 2 turns highlight one answer at a time. Reverse turns cross the neutral gate and return to the question pages.
- **Press:** with no answer selected, keep the thread focused and raise its Herdr client. With an answer selected, submit according to the plugin-wide `IMMEDIATE` or `CONFIRM` setting; `IMMEDIATE` is the initial default.
- **Integrity:** send stable interaction and option identifiers. A stale or resolved interaction submits nothing and displays `QUESTION CHANGED`.
- **Dependency:** runtime support requires Herdr to expose structured interactions, stable submission, and a client-owned raise command. Never infer questions or terminal-window ownership from terminal text or process heuristics.

### Page takeover

- **Entry:** turning dial 1 immediately switches the six pinned keys and replaces the whole strip with the active page.
- **Content:** show the page name, its position among currently reachable pages, and a terse status summary.
- **Exit:** return to the Herdr logo five seconds after the latest page turn.
- **Boundary:** expose every used page and exactly one empty next page; do not wrap or scroll through additional blanks.

### Command bank

- **Positions:** the six thread slots remain `CONTINUE`, `STATUS`, `VERIFY`, `ZOOM`, unassigned, and `STOP`; Inbox stays top-right and Command becomes Cancel at bottom-right.
- **Target:** the third dial region identifies the frozen command target.
- **Lifecycle:** entering Command mode swaps the six thread keys in place; one successful action acknowledges and returns to the dashboard.

### Armed Stop

- **First press:** changes only key 6 to `STOP AGAIN`, switches label and border to Herdr's resolved red role, and increases the border to 7 pixels.
- **Second press:** commits Stop on the same key.
- **Cancellation:** the fixed cancel key exits without executing the destructive action.

## Do's and Don'ts

### Do:

- **Do** keep dashboard labels short enough to scan at physical-device size.
- **Do** preserve the continuous true-black field across all four dial regions.
- **Do** use border weight, wording, and stable position alongside runtime color.
- **Do** keep turns as previews and presses as commits unless the control directly navigates pages or threads.

### Don't:

- **Don't** introduce plugin theme settings, hand-maintained colors, manual appearance controls, or values sampled from preview images.
- **Don't** turn the dial regions into separate cards or add decorative depth.
- **Don't** use color alone to communicate focus, attention, completion, offline state, or danger.
- **Don't** canonize the current Unicode status glyphs or system-installed font preferences as reusable design assets.
