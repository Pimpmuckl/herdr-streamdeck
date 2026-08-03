---
name: streamdeck-live-capture
description: Capture and inspect the visible live Stream Deck desktop app surface on Windows. Use when validating Stream Deck plugin rendering, comparing live UI output with previews, or diagnosing visual readability without interacting with or restarting the app.
---

# Stream Deck Live Capture

## Workflow

1. Keep capture and inspection read-only. Do not focus, click, restart, commit, push, or edit unless the caller separately requests it.
2. If implementation was separately requested and completed, restart the plugin before capture with `.\node_modules\.bin\streamdeck.cmd restart dev.herdr.streamdeck` from the repository root.
3. From the repository root, run `.\.agents\skills\streamdeck-live-capture\scripts\capture-streamdeck.ps1`, optionally passing an explicit PNG output path as its first argument. By default it writes to the system temporary directory outside the repository.
4. Inspect the returned PNG with `view_image` and compare the live app rendering, not only fixture-based previews.
5. Treat physical Stream Deck hardware as the final authority for optical readability.

The Stream Deck SDK is write-only for rendered images through `setImage` and `setFeedback`; it does not expose the Deck framebuffer for capture. `localhost:23654` is property-inspector DevTools, not the Deck framebuffer. Use the bundled window-capture script for the live desktop surface.
