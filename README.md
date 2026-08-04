# Herdr Stream Deck+

A Stream Deck+ control surface for six pinned Herdr threads, attention triage, and safe one-shot commands. It uses the existing Herdr client and never launches a client implicitly.

## Install

Install [Herdr 0.8.0 or newer](https://herdr.dev), then prepare the controller software for your platform:

- Windows 10 or newer: Stream Deck 7.1 or newer. This is the supported and tested platform.
- macOS 13 or newer: Stream Deck 7.1 or newer. Support is experimental and unproven.
- Linux: [OpenDeck 2.14 or newer](https://github.com/nekename/OpenDeck) and Node.js 20 or newer. Support is experimental and unproven. Launch OpenDeck once before installing.

Then run one command on every platform:

```text
herdr plugin install Pimpmuckl/herdr-streamdeck
```

On Windows and macOS, accept the Stream Deck install prompt. The Stream Deck+ profile installs with the plugin. On Linux, restart OpenDeck after the command finishes. OpenDeck can run the same plugin, but its profile import is not yet verified, so the eight keys and four dials may need to be assigned once in OpenDeck.

In Herdr, open keyboard shortcut settings and assign a shortcut to **Pin focused pane to Stream Deck**. The same action is available from Herdr's plugin action surfaces.

## Development

Clone the repository, then run:

```powershell
npm ci
npm run check
npm run typecheck
npm run build
herdr plugin link (Get-Location) --enabled
npx streamdeck link dev.herdr.streamdeck.sdPlugin
npm run package
```

The profile assigns pinned threads to keys 1-6, Attention to key 7, Command to key 8, and all four Herdr encoders. `scripts\install-local.ps1` performs the local links; add `-OpenProfile` to open the generated profile for import.

For a packaged development install, build with `npm run package` and open the versioned `.streamDeckPlugin`. Node.js 24 and npm are development dependencies only; the Elgato app supplies the plugin runtime on Windows and macOS. OpenDeck uses the system Node.js runtime on Linux.

## Controls

| Control | Dashboard | Command mode |
| --- | --- | --- |
| Thread keys 1-6 | Focus a pin; tap empty to pin; hold occupied to unpin | Three fixed prompts, Herdr Zoom, unused, armed Ctrl+C interrupt |
| Inbox (top-right) | Open/cycle the full attention strip | Attention |
| Command (bottom-right) | Enter/cancel Command mode | Cancel |
| Dial 1 | Switch pinned page immediately; cycle items while Inbox is open | Navigation |
| Dial 2 | Open the selected Inbox item; owns its structured question when available | Selected attention item |
| Dial 3 | Turn for working-motion speed; press to cycle Triage, Focus, and Ambient Herd | Reserved |
| Dial 4 | Compare working-motion variants; reserved in Inbox | Reserved |

## Herdr 0.8.0 capability matrix

| Capability | Status |
| --- | --- |
| Six stable pinned slots and page selection | Supported |
| Focus an existing pane without launching Herdr | Supported |
| Attention from blocked/needs-input snapshot state | Supported |
| Continue, Status, Verify, Zoom, and confirm-to-Stop | Supported |
| Saved RGB built-in theme and custom RGB override sync | Supported through a generated compatibility copy |
| Host-derived `terminal` palette | Awaiting a resolved-theme snapshot API; uses monochrome fallback |
| Automatic host-appearance theme switching | Awaiting a resolved-theme snapshot API |
| Pin-focused-pane Herdr plugin action | Supported |
| Raise an existing client window | Not exposed by stock 0.8.0 |
| Scroll/follow control from dial 3 | Not exposed by stock 0.8.0 |
| Structured multi-question paging and answer submission | Not exposed by stock 0.8.0; the attention strip identifies the item while Question Mode awaits a structured interaction API |

The profile source is committed under `profiles/`; generated standalone archives remain ignored. The installable plugin contains a prebuilt runtime and bundled profile. Validate without writing archives with `npm run package:dry-run`.

Herdr still owns the palette. `npm run themes:sync` regenerates the temporary built-in theme copy from a sibling Herdr checkout; saved theme and custom RGB changes redraw automatically. Unsaved previews and host-driven automatic switching require Herdr to expose its resolved palette.

## Uninstall

Remove **Herdr Stream Deck+** in Stream Deck or OpenDeck, then uninstall the Herdr plugin:

```text
herdr plugin uninstall dev.herdr.streamdeck
```

Local development links still use `npx streamdeck unlink dev.herdr.streamdeck` and `herdr plugin unlink dev.herdr.streamdeck`. This repository currently has no license; no reuse permission is granted by default.
