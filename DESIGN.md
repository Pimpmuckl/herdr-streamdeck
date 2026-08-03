---
name: Herdr Stream Deck+
description: A dense, runtime-themed physical triage instrument for Herdr.
typography:
  primary-label:
    fontSize: "19px"
    fontWeight: 700
    lineHeight: "24px"
  status-mark:
    fontSize: "20px"
    fontWeight: 700
  meta-label:
    fontSize: "14px"
    fontWeight: 700
  strip-title:
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.8px"
  hint:
    fontSize: "10px"
    fontWeight: 600
    letterSpacing: "0.4px"
rounded:
  key-shell: "18px"
  key-face: "14px"
spacing:
  key-inset: "7px"
  strip-content-inset: "18px"
components:
  key-shell:
    width: "144px"
    height: "144px"
    rounded: "{rounded.key-shell}"
  key-face:
    width: "130px"
    height: "130px"
    rounded: "{rounded.key-face}"
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

The implementation is flat, compact, and terminal-like. Herdr supplies the resolved active palette at runtime, while this plugin supplies geometry, type scale, state hierarchy, and interaction marks. The matching wide Herdr logo sits across the strip at low opacity as a quiet shared underlay.

**Key Characteristics:**

- Fixed 4-by-2 key bank above one 800-by-100-pixel dial strip.
- Short, bold monospaced labels with small uppercase strip titles.
- Strong border changes for focus and armed destructive state.
- Turns preview and presses commit, except direct thread scrolling.
- One-shot Command mode preserves fixed command positions.

**Build limitations:** The current SVGs depend on Unicode status glyphs and prefer system-installed Consolas or Cascadia Mono. Those dependencies are shipped implementation constraints, not canonical iconography or typeface assets.

## Colors

The plugin has no independent palette. Until Herdr exposes its resolved runtime palette, rendering uses a generated compatibility copy of Herdr's 17 RGB built-in themes plus the saved theme name and custom RGB overrides from Herdr's config. The host-derived `terminal` palette falls back to monochrome.

### Runtime roles

- **Panel and surface roles:** `panel_bg`, `surface0`, and `surface1` define the shell, face, and resting border.
- **Text roles:** `text` and `subtext0` separate primary labels from slot numbers, titles, and hints.
- **State roles:** `yellow` marks attention, `blue` marks working, `green` marks completed, `overlay0` marks idle, unknown, or offline, and `red` marks the armed destructive state.
- **Accent role:** `accent` anchors ordinary dial regions and non-destructive emphasis.

**The Herdr Owns Color Rule.** Never add plugin palette settings or hand-maintained swatches. The temporary generated palette copy must remain mechanically derived from Herdr and disappear when a resolved-theme API exists.

**The Meaning Is Redundant Rule.** Pair every runtime state color with a short label, a non-color mark, an outline, or a stable position; exact glyph artwork is not defined by this system.

## Typography

All device text follows one compact monospaced hierarchy. The normative tokens define size, weight, line rhythm, and tracking; they deliberately do not name a system-installed font family.

### Hierarchy

- **Primary label** (700, 19px, 24px line step): key names and dial values; key labels use at most two centered lines.
- **Status mark** (700, 20px): the compact upper-right state marker on a key.
- **Meta label** (700, 14px): slot numbers and compact key metadata.
- **Strip title** (700, 12px, 0.8px tracking): uppercase dial-region context.
- **Hint** (600, 10px, 0.4px tracking): secondary physical instructions such as `HOLD TO PIN`.

**The Operational Copy Rule.** Labels stay brief, literal, and free of implementation terminology; longer content belongs only in the coordinated Question surface.

## Layout

The key bank is a fixed four-column, two-row arrangement of 144-by-144-pixel canvases. Each key face is inset by 7 pixels, leaving a 130-by-130-pixel inner surface. Slot metadata sits at the upper left, the state mark at the upper right, and the primary label remains centered.

The touch strip is one 800-by-100-pixel composition rendered through four adjacent 200-by-100-pixel regions. Every region aligns the same 800-by-100-pixel wide logo with a negative 200-pixel offset per column, so the underlay remains continuous across all four canvases. Titles and values share an 18-pixel left inset. Each region uses a 5-pixel full-height state bar at its left edge.

**The Fixed Geography Rule.** Preserve key and command positions across modes so one-handed muscle memory remains reliable.

## Elevation & Depth

The system uses no shadows. Depth comes only from nested flat fills, a key-face border, and border-weight changes for selection or danger. The wide logo underlay is rendered at 10% opacity and must remain quieter than live text and state.

**The Flat Instrument Rule.** Do not add decorative chrome, gradients, gloss, or simulated physical depth.

## Shapes

Keys use one recurring nested silhouette: an outer 18-pixel rounded shell and an inner 14-pixel rounded face. The dial strip is rectangular and continuous; individual regions must not read as detached cards. Resting key borders are 2 pixels, selected borders are 5 pixels, and armed destructive borders are 7 pixels.

## Components

### Thread and action key

- **Canvas:** 144 by 144 pixels with a 7-pixel inset face.
- **Content:** slot number, compact workspace and tab context, the deepest useful pane identity, a state mark, and an optional short hint.
- **Label behavior:** split labels at word separators when possible, cap lines at 13 characters, and truncate overflow with an ellipsis. The deepest useful identity gets the largest type.
- **State:** focused keys use the stronger 5-pixel text-role border; ordinary keys use the 2-pixel surface-role border. A bottom rail and authored mark repeat state without relying on color alone.
- **Empty slot:** show only its slot number and a quiet plus mark.

### Dial region

- **Canvas:** 200 by 100 pixels, one quarter of the coordinated strip.
- **Content:** uppercase title at 18 by 31 pixels and primary value at 18 by 67 pixels.
- **Label behavior:** dial values cap at 17 characters and truncate with an ellipsis.
- **Identity:** use the appearance-matched wide logo as one aligned 800-by-100-pixel, 10%-opacity underlay across all four regions.

### Command bank

- **Positions:** keys 1 through 6 remain `CONTINUE`, `STATUS`, `VERIFY`, `ZOOM`, unassigned, and `STOP`; the final two keys remain attention and cancel.
- **Target:** the third dial region identifies the frozen command target.
- **Lifecycle:** entering Command mode swaps the six thread keys in place; one successful action acknowledges and returns to the dashboard.

### Armed Stop

- **First press:** changes only key 6 to `STOP AGAIN`, switches label and border to Herdr's resolved red role, and increases the border to 7 pixels.
- **Second press:** commits Stop on the same key.
- **Cancellation:** the fixed cancel key exits without executing the destructive action.

## Do's and Don'ts

### Do:

- **Do** keep dashboard labels short enough to scan at physical-device size.
- **Do** preserve the continuous four-region strip and aligned quiet logo underlay.
- **Do** use border weight, wording, and stable position alongside runtime color.
- **Do** keep turns as previews and presses as commits unless the control is direct thread scrolling.

### Don't:

- **Don't** introduce plugin theme settings, hand-maintained colors, manual appearance controls, or values sampled from preview images.
- **Don't** turn the dial regions into separate cards or add decorative depth.
- **Don't** use color alone to communicate focus, attention, completion, offline state, or danger.
- **Don't** canonize the current Unicode status glyphs or system-installed font preferences as reusable design assets.
