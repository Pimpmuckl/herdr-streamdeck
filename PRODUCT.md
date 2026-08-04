# Herdr Stream Deck+

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

- Stream Deck plugin: TypeScript with Elgato's official Node SDK.
- Herdr capabilities: stock Herdr plugin and CLI APIs only; Herdr core remains out of scope.
- Validate and ship Windows first. Preserve macOS and Linux as intended future targets.

## Users

Technically fluent developers and operators who supervise several coding-agent threads in Herdr while actively working elsewhere on their computer. The primary usage is fast, one-handed triage without navigating a second software interface.

## Product Purpose

Herdr Stream Deck+ is a physical triage and control panel for Herdr. It keeps important threads physically reachable, shows actionable state at a glance, brings the right thread forward on demand, and handles structured questions safely from the device.

Success means the user can notice, select, inspect, and resolve routine agent attention without hunting through Herdr, while detailed work remains in Herdr itself.

## Positioning

This is not a miniature Herdr UI or a generic macro pad. Its distinct mechanism combines user-arranged physical thread slots, an actionable attention queue, state-aware controls, and structured agent questions on the Stream Deck+ touch strip.

## Operating Context

- The primary surface is an Elgato Stream Deck+ with eight LCD keys, four dials, and an 800 x 100 touch strip composed of four coordinated 200 x 100 encoder regions.
- The fixed key rows are `1 2 3 INBOX` and `4 5 6 COMMAND`.
- The user normally operates it with one hand while Herdr is open in the background.
- The Herdr client may be foreground, background, or closed. Device actions may focus an existing client but never launch one implicitly.
- A bundled Stream Deck+ profile owns all four encoder positions so Question Mode can appear as one coordinated strip.
- Runtime distribution remains undecided. GitHub/manual installation, Herdr distribution, and Elgato Marketplace submission are separate decisions.

## Capabilities and Constraints

### Interaction vocabulary

- **Pinned:** stored in a physical slot on a named page.
- **Previewed:** selected on the device without changing Herdr state.
- **Focused:** selected inside Herdr.
- **Command target:** the focused thread frozen when Command Mode opens.
- **Attention item:** a structured question or approval, explicit error, or unseen completion that needs human action.

### Pin pages and six thread keys

- Pages grow on demand without a fixed limit. Dial 1 exposes used pages plus exactly one empty next page; another page appears only after that page receives a pin.
- Turning dial 1 immediately switches the active page and redraws the six thread keys.
- Stream Deck settings are the primary page manager for create, rename, reorder, and delete.
- A single pin tap focuses its thread inside Herdr without stealing operating-system focus.
- Tapping an empty slot pins Herdr's focused thread.
- A second tap raises the existing Herdr client.
- Holding an occupied slot unpins it. Replacement requires unpinning first.
- Offline pins remain visible. A restarted agent reconnects by exact session, then the same terminal and agent, then one unique exact label for that agent. Ambiguous or different agents stay offline.
- Herdr should expose `Pin to Stream Deck...` on a thread. It opens a compact page-and-slot map that shows occupied slots and allows direct placement.
- Both configuration surfaces operate on one shared pin and page model.

### Attention queue and Inbox key

- The queue contains structured questions or approvals, explicit errors, and unseen completions.
- Working and ordinary idle threads do not enter the queue.
- Inbox immediately replaces the full touch strip with the selected attention item and focuses it in the background. Repeated taps cycle the queue.
- Holding Inbox opens the attention queue in Herdr.
- Resolved items leave the queue automatically. An empty queue reports `ALL CLEAR` across the strip.
- Passive arrivals update status but never steal operating-system focus or replace the dashboard.
- Dial 2 previews questions or details within the selected attention item and presses to select the preview.

### Thread navigation and dial 3

- In the dashboard, turning dial 3 scrolls the focused thread immediately.
- Pressing dial 3 returns to live output and follow behavior.
- In Question Mode, dial 3 pages long question text. Do not use a marquee.

### Structured Question Mode and dial 4

- Question Mode is first-release scope, not a later enhancement.
- A selected structured interaction coordinates all four touch-strip regions into one question surface.
- The surface shows the thread, question position, question text, selected option, and option position. It does not show the full transcript.
- Dial 2 navigates question 1 through N when an interaction contains multiple questions.
- Dial 3 pages question text that does not fit.
- Dial 4 moves one option per detent without wraparound. Turning never mutates Herdr.
- No option is initially selected; the first turn selects one.
- Pressing dial 4 submits an ordinary selected answer.
- Approvals or destructive choices require an armed confirmation.
- Submission must include a stable interaction ID. If the interaction changed or resolved, submit nothing and show `QUESTION CHANGED`.
- Free-form or unsupported interactions show `OPEN HERDR`; the device never guesses an answer from terminal text.
- Command cancels Question Mode and returns to the dashboard.

### One-shot Command Mode and Command key

- Tap Command to enter Command Mode. Holding another control simultaneously is never required.
- Entry freezes and visibly identifies the focused command target.
- One successful action returns automatically to the dashboard. Command cancels.
- The six thread keys become fixed command positions:
  1. `CONTINUE`: send a fixed continue-with-best-judgment prompt.
  2. `STATUS`: request a concise completed, next, and blocked report.
  3. `VERIFY`: request relevant checks and their result.
  4. `ZOOM`: toggle the target pane's zoom.
  5. Unassigned until real usage identifies a frequent action.
  6. `STOP`: arm in red, then require a second press on the same key.
- Prompt commands are unavailable while a structured question is active.
- Every command acknowledges `SENT`, `QUEUED`, or `FAILED` before returning.
- Failures render a short cause and recovery hint on the affected key or dial; the generic Stream Deck warning triangle is never used.

### Status and display language

- Normal display content remains operational and short: the deepest useful pane identity on each key, page or attention context on the full strip, actionable counts, and brief acknowledgements.
- Question Mode is the only mode that uses the full strip for longer content.
- Herdr remains the only theme source. Until Herdr exposes its resolved palette, the plugin uses a generated compatibility copy of Herdr's 17 RGB built-in themes plus the saved theme name and custom RGB overrides in Herdr's config.
- The plugin has no theme settings or manual light/dark override. `npm run themes:sync` refreshes the temporary generated copy from a local Herdr checkout.
- Saved palette changes redraw every visible key and encoder region. The host-derived `terminal` palette, unsaved previews, and automatic appearance changes require a future resolved-theme API.
- Every OLED background is fixed deep black. Herdr themes color text, lifecycle outlines, the focus dot, and dial bars only.
- Foreground colors retain their configured hue and are lifted only when required to meet the black-field contrast floor.
- Pinned keys show only the deepest available pane or thread label; actionable status may temporarily use the footer. Page and queue context appear only during their full-strip takeovers; the idle strip remains the Herdr logo. Empty slots stay almost blank.
- Status colors are paired with a label, motion, or border geometry:
  - amber: needs-input label;
  - red: explicit error or offline label;
  - green: completed and unseen with the strongest lifecycle outline;
  - blue: working with a moving border highlight;
  - gray: idle with a thin solid outline, unknown with a dashed outline;
  - white outline or marker: focused.
- Do not infer review-ready, test-failed, approval, or question semantics from arbitrary terminal text.

### Required Herdr extension seams

- Include the active theme name, resolved RGB palette, and light/dark appearance in the session snapshot API. Resolution of terminal-default and ANSI colors belongs to Herdr, not the Stream Deck plugin.
- Read the current structured interaction, including type, text, options, and stable ID.
- Submit an option only when the stable interaction ID is still current.
- Activate an attached Herdr client without launching a new client.
- Scroll a pane and return it to live output without taking terminal attach ownership.
- Allow a declared plugin action to appear in a pane or agent context menu and open the plugin's slot-picker popup.
- Herdr plugin v1 does not currently provide native context-menu contributions; keep this addition narrow and declarative rather than introducing a general UI plugin framework.

### Open decisions

- Exact attention-queue tie-breaking within each priority class.
- Exact canned prompt copy for `CONTINUE`, `STATUS`, and `VERIFY`.
- Hold, double-tap, confirmation, and acknowledgement timing values; these require device testing.
- Distribution and update channel.
- Physical-device brightness and acknowledgement timing calibration.

## Brand Commitments

- Product name: Herdr Stream Deck+.
- Preserve the existing Herdr name and sheep/terminal mark.
- Keep user-facing copy brief, operational, and free of implementation terminology.

## Evidence on Hand

- `herdr_logo.svg`: primary square Herdr mark and OLED baseline source.
- `herdr_logo_wide.png`: wide mark for light surfaces.
- `herdr_logo_wide_dark.png`: wide mark for dark surfaces.
- A runnable Stream Deck plugin slice and actual-resolution rendered previews now cover the dashboard, light/dark Herdr theme sync, one-shot Command Mode, and armed Stop state.
- The dashboard, pin chooser, eight keys, and four encoder regions have been exercised on a physical Stream Deck+. Timing and legibility still require continued hardware iteration.

## Product Principles

1. Physical triage and control, not a second UI.
2. One hand must complete every routine interaction.
3. Turns preview selections; page and thread navigation act immediately.
4. Stable targets, explicit acknowledgement, and fail-closed answers prevent wrong-thread actions.
5. Preserve muscle memory while allowing users to opt into named pages.

## Accessibility & Inclusion

- Never rely on color alone; pair every state with a short label, symbol, or outline.
- Preserve one-handed operation and avoid simultaneous holds or chords.
- Keep touch-strip text readable at its physical size and page overflow rather than animating it.
- Keep all authored informational device text at 18 pixels or larger; shorten copy before reducing type.
- Destructive actions require an explicit armed state and confirmation.
