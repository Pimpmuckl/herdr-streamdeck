---
version: 1
slug: "dev-herdr-streamdeck-sdplugin-manifest-json"
primary_target: "dev.herdr.streamdeck.sdPlugin/manifest.json"
related_targets: ["src/render.ts"]
---

## FORM seed

- **Intent:** a physical triage panel for operators supervising several Herdr threads with one hand.
- **Chosen direction:** dense terminal instrument; eight fixed keys above one continuous four-dial status strip.
- **Content:** workspace and tab context, the deepest useful pane identity, distinct status symbols, page and attention state, frozen command target, and explicit acknowledgements.
- **Interaction:** turns preview unless the control is thread scrolling; presses commit; Command is one-shot; Stop arms before execution.
- **Visual language:** true-black OLED fields, the active resolved Herdr palette on information-bearing pixels only, monospaced labels, and strong focus/armed outlines.

## Scope and mode

Operate surface: the complete Stream Deck Plus keypad and 800x100 touch strip, rendered as one physical control panel.

## Audience and job

Herdr operators need to identify the thread that needs them, focus it, and issue a small safe command without reading a second dashboard. The primary task is one-handed triage; the proof is live thread state and focused selection from Herdr itself.

## Direction

Herdr owns the information colors while every unused OLED pixel remains deep black. Dense 144px keys prioritize the deepest useful identity, retain workspace and tab as compact context, and repeat status with both a mark and color. Empty slots remain almost blank. The four dial canvases read as one uninterrupted black strip.

The memorable moment is one-shot Command Mode: tap Command, the six thread keys become a compact action bank around a visibly frozen target, then one successful action acknowledges and returns to the dashboard. Stop becomes destructive only after its first press arms a red `STOP AGAIN` state.

Dial 3 is input-inert. Its passive encoder action remains bound only so the third LCD region stays part of the continuous status strip; all motion and idle-layout controls live in Dial 4 Settings.

## Constraints

No tinted backgrounds, independent Stream Deck themes, hand-maintained information colors, long dashboard text, decorative chrome, hover-only meaning, or destructive single presses. A generated compatibility copy of Herdr's 17 RGB built-in palettes is allowed only until a resolved-theme API exists; the host-derived `terminal` palette uses monochrome. Color always has a label, symbol, or position cue.

## Unresolved

Structured Question Mode, client activation, exact command copy, live automatic appearance switching, and physical-device timing calibration await the corresponding Herdr APIs or further hardware validation.
