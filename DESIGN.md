---
name: Herdr Stream Deck+
description: A dense, runtime-themed physical triage instrument for Herdr.
typography:
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

- **OLED field:** every key and dial background is fixed `#000000`; theme surface colors never tint unused pixels.
- **Surface role:** `surface1` defines only the resting key outline.
- **Text roles:** `text` and `subtext0` separate primary labels from slot numbers, titles, and hints.
- **Contrast adaptation:** configured text and semantic roles retain their hue and are lifted toward white only when needed to remain legible on black.
- **State roles:** `yellow` marks attention, `blue` marks working, `green` marks completed, `overlay0` marks idle, unknown, or offline, and `red` marks the armed destructive state.
- **Accent role:** `accent` anchors ordinary dial regions and non-destructive emphasis.

**The Herdr Owns Color Rule.** Never add plugin palette settings or hand-maintained swatches. The temporary generated palette copy must remain mechanically derived from Herdr and disappear when a resolved-theme API exists.

**The OLED Black Rule.** Keep every background pixel `#000000`. Theme roles color information only: text, state marks, rails, outlines, and dial bars.

**The OLED Contrast Rule.** Resolve every foreground from its actual configured RGB value, not the theme name or appearance. Text and small marks require 4.5:1 against black; outlines and bars require 3:1.

**The Meaning Is Redundant Rule.** Pair every runtime state color with a short label, a non-color mark, an outline, or a stable position; exact glyph artwork is not defined by this system.

## Typography

All device text follows one compact monospaced hierarchy. The normative tokens define size, weight, line rhythm, and tracking; they deliberately do not name a system-installed font family.

### Hierarchy

- **Primary label** (700, 26px, 29px line step): key names use at most two centered lines.
- **Dial value** (700, 28px): the current page, thread, or question state.
- **Status mark** (700, 22px): the compact upper-right state marker on a key.
- **Meta label** (700, 20px): slot numbers and compact key metadata.
- **Strip title** (700, 20px, 0.2px tracking): uppercase dial-region context.
- **Hint** (700, 18px, 0.1px tracking): secondary physical instructions such as `PRESS SEND`.

**The Physical Type Floor.** Informational device text never falls below 18 pixels on its authored key or dial canvas. Shorten, truncate, or omit secondary copy before reducing type.

**The Device SVG Rule.** Put font family, weight, size, color, alignment, and tracking directly on every SVG text element. Do not depend on embedded CSS, classes, or font shorthand in device images.

**The Operational Copy Rule.** Labels stay brief, literal, and free of implementation terminology; longer content belongs only in the coordinated Question surface.

## Layout

The key bank is a fixed four-column, two-row arrangement of full 144-by-144-pixel black canvases. Thread slots form a 3-by-2 block on the left; Inbox and Command form a persistent action rail on the right. A single outline sits 3 pixels from the edge; slot metadata sits at the upper left, the state mark at the upper right, and the primary label remains centered.

The touch strip is one uninterrupted 800-by-100-pixel black composition rendered through four adjacent 200-by-100-pixel regions. Titles and values share an 18-pixel left inset. Each region uses a 5-pixel full-height state bar at its left edge.

**The Fixed Geography Rule.** The rows remain `1 2 3 INBOX` and `4 5 6 COMMAND`. Preserve these positions across modes so one-handed muscle memory remains reliable.

## Elevation & Depth

The system uses no shadows, nested fills, or background artwork. Hierarchy comes only from type, state marks, rails, and border-weight changes for selection or danger.

**The Flat Instrument Rule.** Do not add decorative chrome, gradients, gloss, or simulated physical depth.

## Shapes

Keys use one 16-pixel-radius outline on the full black OLED field. The dial strip is rectangular and continuous; individual regions must not read as detached cards. Resting key borders are 2 pixels, selected borders are 5 pixels, and armed destructive borders are 7 pixels.

## Components

### Thread and action key

- **Canvas:** full 144 by 144 pixels of deep black with a 3-pixel inset outline.
- **Content:** slot number, compact workspace and tab context, the deepest useful pane identity, a state mark, and an optional short hint.
- **Label behavior:** split labels at word separators when possible, cap lines at 8 monospaced columns, and truncate overflow with an ellipsis. Context caps at 11 columns and prioritizes its trailing tab identity, dropping the workspace first when both do not fit. The deepest useful identity gets the largest type.
- **State:** focused keys use the stronger 5-pixel text-role border; ordinary keys use the 2-pixel surface-role border. A bottom rail and authored mark repeat state without relying on color alone.
- **Empty slot:** show only its slot number and a quiet plus mark.

### Dial region

- **Canvas:** 200 by 100 pixels, one quarter of the coordinated strip.
- **Content:** uppercase 20-pixel title at 18 by 32 pixels and 28-pixel primary value at 18 by 73 pixels.
- **Label behavior:** dial values cap at 10 monospaced columns and truncate with an ellipsis.
- **Field:** keep the full strip background deep black; only information-bearing pixels may light.

### Inbox takeover

- **Entry:** tapping Inbox immediately replaces all four dial regions; no second press is required.
- **Content:** show queue position, selected thread, needs-input state, and the available `OPEN` action.
- **Fallback:** when Herdr does not expose structured question content, never infer it from terminal text; identify the item and open it in Herdr.
- **Exit:** Command returns to the dashboard. An empty queue uses the same full-strip surface to report `ALL CLEAR`.

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
