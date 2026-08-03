# Herdr Stream Deck+

A Windows Stream Deck+ control surface for six pinned Herdr threads, attention triage, and safe one-shot commands. It uses the existing Herdr client and never launches a client implicitly.

## Prerequisites

- Windows 10 or newer
- Stream Deck 7.1 or newer and a Stream Deck+ (`20GBD9901`, DeviceType 7)
- Herdr 0.7.5 on `PATH`
- Node.js 24 and npm

## Local setup

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

For a non-development Herdr install from GitHub, use `herdr plugin install Pimpmuckl/herdr-streamdeck`; use `herdr plugin link (Get-Location) --enabled` only for a local checkout.

Import `dist\Herdr-Stream-Deck-Plus-0.1.0.streamDeckProfile` in the Stream Deck app. The profile assigns pinned threads to keys 1-6, Attention to key 7, Command to key 8, and all four Herdr encoders. `scripts\install-local.ps1` performs the same local links; add `-OpenProfile` to open the generated profile for import.

For a packaged install, build with `npm run package`, open the versioned `.streamDeckPlugin`, then open the `.streamDeckProfile`. Release tags run the same packaging on Windows and upload both files as workflow artifacts; they do not publish to Elgato Marketplace.

In Herdr, open keyboard shortcut settings and assign a shortcut to **Pin focused pane to Stream Deck**. The same action is available from Herdr's plugin action surfaces.

## Controls

| Control | Dashboard | Command mode |
| --- | --- | --- |
| Keys 1-6 | Focus pinned thread; hold to pin/unpin | Continue, Status, Verify, Zoom, unused, armed Stop |
| Key 7 | Cycle attention items | Attention |
| Key 8 | Enter/cancel Command mode | Cancel |
| Dial 1 | Preview and select pinned page | Pinned page |
| Dial 2 | Preview and open attention item | Attention queue |
| Dial 3 | Show current thread | Frozen command target |
| Dial 4 | Open the current question in Herdr | Open question |

## Herdr 0.7.5 capability matrix

| Capability | Status |
| --- | --- |
| Six stable pinned slots and page selection | Supported |
| Focus an existing pane without launching Herdr | Supported |
| Attention from blocked/needs-input snapshot state | Supported |
| Continue, Status, Verify, Zoom, and confirm-to-Stop | Supported |
| Resolved Herdr light/dark palette and supplied logos | Supported |
| Pin-focused-pane Herdr plugin action | Supported |
| Raise an existing client window | Not exposed by stock 0.7.5 |
| Scroll/follow control from dial 3 | Not exposed by stock 0.7.5 |
| Structured multi-question paging and answer submission | Not exposed by stock 0.7.5; dial 4 opens the item in Herdr |

The profile source is committed under `profiles/`; generated `.streamDeckPlugin` and `.streamDeckProfile` archives remain ignored. Validate without writing archives with `npm run package:dry-run`.

## Uninstall

Remove the imported **Herdr Stream Deck+** profile in Stream Deck, then unlink both local plugins:

```powershell
npx streamdeck unlink dev.herdr.streamdeck
herdr plugin unlink dev.herdr.streamdeck
```

Packaged Stream Deck installs can instead be removed from Stream Deck Preferences. This repository currently has no license; no reuse permission is granted by default.
