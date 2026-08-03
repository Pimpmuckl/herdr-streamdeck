---
version: 1
slug: "dev-herdr-streamdeck-sdplugin-manifest-json"
primary_target: "dev.herdr.streamdeck.sdPlugin/manifest.json"
related_targets: ["src/render.ts"]
---

## FORM seed

- **Intent:** a physical triage panel for operators supervising several Herdr threads with one hand.
- **Chosen direction:** dense terminal instrument; eight fixed keys above one continuous four-dial status strip.
- **Content:** short thread labels, distinct status symbols, page and attention state, frozen command target, and explicit acknowledgements.
- **Interaction:** turns preview unless the control is thread scrolling; presses commit; Command is one-shot; Stop arms before execution.
- **Visual language:** the active resolved Herdr palette, flat terminal surfaces, monospaced labels, strong focus/armed outlines, and the matching supplied wide Herdr logo as a quiet strip underlay.

## Scope and mode

Operate surface: the complete Stream Deck Plus keypad and 800x100 touch strip, rendered as one physical control panel.

## Audience and job

Herdr operators need to identify the thread that needs them, focus it, and issue a small safe command without reading a second dashboard. The primary task is one-handed triage; the proof is live thread state and focused selection from Herdr itself.

## Direction

Herdr owns the visual world. Every surface color comes from the resolved active Herdr palette, including custom overrides and automatic appearance changes. Dense 144px keys use one label, one status symbol, and a focus outline. The four dial canvases read as one continuous strip, using the matching supplied light or dark wide Herdr logo as a quiet shared underlay.

The memorable moment is one-shot Command Mode: tap Command, the six thread keys become a compact action bank around a visibly frozen target, then one successful action acknowledges and returns to the dashboard. Stop becomes destructive only after its first press arms a red `STOP AGAIN` state.

## Constraints

No independent Stream Deck themes, copied runtime palettes, long dashboard text, decorative chrome, hover-only meaning, or destructive single presses. Color always has a label, symbol, or position cue.

## Unresolved

Structured Question Mode, dial-three scrolling, client activation, exact command copy, and physical-device timing calibration await the corresponding Herdr APIs or hardware validation.
