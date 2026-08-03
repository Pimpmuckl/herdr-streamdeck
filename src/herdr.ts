import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  hasResolvedTheme,
  type HerdrSnapshot,
  type PaneSnapshot,
  type ResolvedThemeSnapshot,
  resolvePinRequest,
  snapshotFromApi
} from "./model.js";
import { copiedThemeFromHerdrConfig } from "./theme.js";

const run = promisify(execFile);

type Listener = () => void;
type PinRequestListener = (pane: PaneSnapshot) => void;

const pinRequestPath = join(process.env.LOCALAPPDATA || tmpdir(), "Herdr Stream Deck", "pin-request.json");

export class HerdrBridge {
  snapshot: HerdrSnapshot | null = null;
  theme: ResolvedThemeSnapshot | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly pinRequestListeners = new Set<PinRequestListener>();
  private running = false;
  private signature = "";

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribePinRequests(listener: PinRequestListener): () => void {
    this.pinRequestListeners.add(listener);
    return () => this.pinRequestListeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll();
  }

  async focusPane(paneId: string): Promise<void> {
    await this.command(["agent", "focus", paneId]);
    await this.refresh();
  }

  async prompt(paneId: string, text: string): Promise<void> {
    await this.command(["agent", "prompt", paneId, text]);
  }

  async toggleZoom(paneId: string): Promise<void> {
    await this.command(["pane", "zoom", paneId, "--toggle"]);
  }

  async stop(paneId: string): Promise<void> {
    await this.command(["agent", "send-keys", paneId, "ctrl+c"]);
  }

  private async poll(): Promise<void> {
    while (this.running) {
      await this.refresh();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async refresh(): Promise<void> {
    try {
      const { stdout } = await this.command(["api", "snapshot"]);
      const snapshot = snapshotFromApi(JSON.parse(stdout.toString()));
      if (!snapshot) throw new Error("invalid session snapshot");
      this.snapshot = snapshot;
      this.theme = hasResolvedTheme(snapshot.theme) ? snapshot.theme : await copiedThemeFromHerdrConfig();
      const signature = JSON.stringify({
        focused: snapshot.focused_pane_id,
        panes: snapshot.panes.map((pane) => [
          pane.pane_id, pane.agent_status, pane.focused, pane.label, pane.terminal_title_stripped,
          pane.cwd, pane.workspace_id, pane.tab_id
        ]),
        tabs: snapshot.tabs,
        workspaces: snapshot.workspaces,
        theme: this.theme
      });
      await this.consumePinRequest(snapshot);
      if (signature !== this.signature) {
        this.signature = signature;
        this.emit();
      }
    } catch {
      if (this.snapshot !== null) {
        this.snapshot = null;
        this.theme = null;
        this.signature = "";
        this.emit();
      }
    }
  }

  private async consumePinRequest(snapshot: HerdrSnapshot): Promise<void> {
    const claimedPath = `${pinRequestPath}.${randomUUID()}.claimed`;
    let claimed = false;
    try {
      await rename(pinRequestPath, claimedPath);
      claimed = true;
      const request = JSON.parse(await readFile(claimedPath, "utf8"));
      await unlink(claimedPath);
      const pane = resolvePinRequest(request, snapshot);
      if (pane) for (const listener of this.pinRequestListeners) listener(pane);
    } catch (error) {
      if (claimed && (error as NodeJS.ErrnoException).code !== "ENOENT") {
        try { await unlink(claimedPath); } catch { /* already gone */ }
      }
    }
  }

  private command(args: string[]): ReturnType<typeof run> {
    return run(process.env.HERDR_PATH || "herdr", args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 2500,
      windowsHide: true
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
