import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { hasResolvedTheme, type HerdrSnapshot, type ResolvedThemeSnapshot } from "./model.js";

const run = promisify(execFile);

type Listener = () => void;

export class HerdrBridge {
  snapshot: HerdrSnapshot | null = null;
  theme: ResolvedThemeSnapshot | null = null;
  private readonly listeners = new Set<Listener>();
  private running = false;
  private signature = "";

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
      const envelope = JSON.parse(stdout.toString()) as { result?: { snapshot?: HerdrSnapshot } };
      const snapshot = envelope.result?.snapshot;
      if (!snapshot || !Array.isArray(snapshot.panes)) throw new Error("invalid session snapshot");
      const signature = JSON.stringify({
        focused: snapshot.focused_pane_id,
        panes: snapshot.panes.map((pane) => [pane.pane_id, pane.agent_status, pane.focused, pane.label]),
        theme: snapshot.theme
      });
      this.snapshot = snapshot;
      if (hasResolvedTheme(snapshot.theme)) this.theme = snapshot.theme;
      if (signature !== this.signature) {
        this.signature = signature;
        this.emit();
      }
    } catch {
      if (this.snapshot !== null) {
        this.snapshot = null;
        this.signature = "";
        this.emit();
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
