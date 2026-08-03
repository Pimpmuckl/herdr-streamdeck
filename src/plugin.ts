import { readFileSync } from "node:fs";

import streamDeck, {
  action,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type WillAppearEvent
} from "@elgato/streamdeck";

import { HerdrBridge } from "./herdr.js";
import {
  attentionPanes,
  type DeckSettings,
  normalizeSettings,
  paneLabel,
  resolvePin,
  slotForCoordinates,
  wrappedIndex
} from "./model.js";
import { type BrandAssets, currentPane, dialSvg, keySvg } from "./render.js";

const HOLD_MS = 650;
const herdr = new HerdrBridge();
const brand: BrandAssets = {
  light: pngData(new URL("../imgs/herdr_logo_wide.png", import.meta.url)),
  dark: pngData(new URL("../imgs/herdr_logo_wide_dark.png", import.meta.url))
};

type Listener = () => void;

class DeckStore {
  private loadPromise: Promise<DeckSettings> | null = null;
  private readonly listeners = new Set<Listener>();

  get(): Promise<DeckSettings> {
    this.loadPromise ??= streamDeck.settings.getGlobalSettings<DeckSettings>().then(normalizeSettings);
    return this.loadPromise;
  }

  async update(change: (settings: DeckSettings) => void): Promise<void> {
    const settings = structuredClone(await this.get());
    change(settings);
    this.loadPromise = Promise.resolve(settings);
    await streamDeck.settings.setGlobalSettings(settings);
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }
}

class CommandState {
  active = false;
  targetPaneId: string | null = null;
  targetLabel = "";
  stopArmed = false;
  private readonly listeners = new Set<Listener>();

  enter(paneId: string, label: string): void {
    this.active = true;
    this.targetPaneId = paneId;
    this.targetLabel = label;
    this.stopArmed = false;
    this.emit();
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.targetPaneId = null;
    this.targetLabel = "";
    this.stopArmed = false;
    this.emit();
  }

  armStop(): void {
    this.stopArmed = true;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }
}

const deck = new DeckStore();
const command = new CommandState();

@action({ UUID: "dev.herdr.streamdeck.pin" })
class PinnedThreadAction extends SingletonAction {
  private readonly downAt = new Map<string, number>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isKey()) return this.render(event.action);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.downAt.set(event.action.id, Date.now());
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    const started = this.downAt.get(event.action.id) ?? Date.now();
    this.downAt.delete(event.action.id);
    const slot = keySlot(event.action);
    if (slot === null) return;

    try {
      if (command.active) {
        if (await this.runCommand(slot, event.action)) {
          const theme = herdr.theme;
          if (theme) await event.action.setImage(keySvg({ label: "SENT", slot }, theme));
          await delay(400);
          command.cancel();
        }
      } else if (Date.now() - started >= HOLD_MS) {
        await this.togglePin(slot);
        await event.action.showOk();
      } else {
        const settings = await deck.get();
        const pin = settings.pages[settings.pageIndex].pins[slot];
        const pane = resolvePin(pin, herdr.snapshot);
        if (!pane) return event.action.showAlert();
        await herdr.focusPane(pane.pane_id);
      }
    } catch (error) {
      streamDeck.logger.error(`Pinned thread action failed: ${String(error)}`);
      if (command.active && herdr.theme) {
        await event.action.setImage(keySvg({ label: "FAILED", slot, danger: true }, herdr.theme));
        await delay(600);
        await this.render(event.action);
        return;
      }
      await event.action.showAlert();
    }
  }

  private async togglePin(slot: number): Promise<void> {
    const focused = herdr.snapshot?.panes.find((pane) => pane.pane_id === herdr.snapshot?.focused_pane_id);
    await deck.update((settings) => {
      const pins = settings.pages[settings.pageIndex].pins;
      if (pins[slot]) {
        pins[slot] = null;
      } else if (focused) {
        pins[slot] = {
          paneId: focused.pane_id,
          label: paneLabel(focused, focused.pane_id),
          terminalId: focused.terminal_id,
          agentSession: focused.agent_session
        };
      }
    });
  }

  private async runCommand(slot: number, action: KeyAction): Promise<boolean> {
    const paneId = command.targetPaneId;
    if (!paneId || slot === 4) {
      await action.showAlert();
      return false;
    }
    if (slot === 3) {
      await herdr.toggleZoom(paneId);
      return true;
    }
    if (slot === 5) {
      if (!command.stopArmed) {
        command.armStop();
        return false;
      }
      await herdr.stop(paneId);
      return true;
    }
    const prompts = [
      "Continue.",
      "Give me a concise status update.",
      "Run the relevant verification."
    ];
    await herdr.prompt(paneId, prompts[slot]);
    return true;
  }

  private async render(action: KeyAction): Promise<void> {
    const slot = keySlot(action);
    if (slot === null) return;
    const theme = herdr.theme;
    if (!theme) return;
    if (command.active) {
      const labels = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "—", "STOP"];
      const armed = slot === 5 && command.stopArmed;
      await action.setImage(keySvg({ label: armed ? "STOP AGAIN" : labels[slot], slot, danger: armed }, theme));
      return;
    }
    const settings = await deck.get();
    const pin = settings.pages[settings.pageIndex].pins[slot];
    const pane = resolvePin(pin, herdr.snapshot);
    await action.setImage(keySvg({
      label: pin ? paneLabel(pane, pin.label) : "EMPTY",
      slot,
      status: pin ? pane?.agent_status ?? "offline" : undefined,
      selected: Boolean(pane?.focused),
      empty: !pin
    }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isKey() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.attention" })
class AttentionAction extends SingletonAction {
  private readonly downAt = new Map<string, number>();
  private cursor = 0;

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isKey()) return this.render(event.action);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.downAt.set(event.action.id, Date.now());
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    const duration = Date.now() - (this.downAt.get(event.action.id) ?? Date.now());
    this.downAt.delete(event.action.id);
    if (duration >= HOLD_MS) return event.action.showAlert();
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return event.action.showAlert();
    try {
      const focused = queue.findIndex((pane) => pane.pane_id === herdr.snapshot?.focused_pane_id);
      this.cursor = focused >= 0 ? wrappedIndex(focused, 1, queue.length) : wrappedIndex(this.cursor, 0, queue.length);
      await herdr.focusPane(queue[this.cursor].pane_id);
      this.cursor = wrappedIndex(this.cursor, 1, queue.length);
    } catch (error) {
      streamDeck.logger.error(`Attention action failed: ${String(error)}`);
      await event.action.showAlert();
    }
  }

  private render(action: KeyAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return Promise.resolve();
    const count = attentionPanes(herdr.snapshot).length;
    return action.setImage(keySvg({
      label: count ? `INBOX ${count}` : "INBOX CLEAR",
      status: count ? "blocked" : "idle"
    }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isKey() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.command" })
class CommandAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isKey()) return this.render(event.action);
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    if (command.active) {
      command.cancel();
      return;
    }
    const pane = currentPane(herdr.snapshot?.panes ?? [], herdr.snapshot?.focused_pane_id);
    if (!pane) return event.action.showAlert();
    command.enter(pane.pane_id, paneLabel(pane, pane.pane_id));
  }

  private render(action: KeyAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return Promise.resolve();
    return action.setImage(keySvg({ label: command.active ? "CANCEL" : "COMMAND" }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isKey() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.pages" })
class PagesDialAction extends SingletonAction {
  private readonly preview = new Map<string, number>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    const settings = await deck.get();
    const current = this.preview.get(event.action.id) ?? settings.pageIndex;
    this.preview.set(event.action.id, wrappedIndex(current, event.payload.ticks, settings.pages.length));
    await this.render(event.action);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const page = this.preview.get(event.action.id);
    if (page === undefined) return;
    await deck.update((settings) => { settings.pageIndex = page; });
    this.preview.delete(event.action.id);
  }

  private async render(action: DialAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return;
    const settings = await deck.get();
    const page = this.preview.get(action.id) ?? settings.pageIndex;
    const title = this.preview.has(action.id) ? "PAGE PREVIEW" : "PINNED PAGE";
    await action.setFeedback({ "full-canvas": dialSvg(0, title, settings.pages[page].name, theme, "accent", brand) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.attention-dial" })
class AttentionDialAction extends SingletonAction {
  private readonly preview = new Map<string, number>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return;
    const current = this.preview.get(event.action.id) ?? 0;
    this.preview.set(event.action.id, wrappedIndex(current, event.payload.ticks, queue.length));
    await this.render(event.action);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return event.action.showAlert();
    const index = this.preview.get(event.action.id) ?? 0;
    try {
      await herdr.focusPane(queue[index].pane_id);
      this.preview.delete(event.action.id);
    } catch (error) {
      streamDeck.logger.error(`Attention dial failed: ${String(error)}`);
      await event.action.showAlert();
    }
  }

  private render(action: DialAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return Promise.resolve();
    const queue = attentionPanes(herdr.snapshot);
    const index = this.preview.get(action.id) ?? 0;
    const value = queue.length ? paneLabel(queue[Math.min(index, queue.length - 1)], "BLOCKED") : "CLEAR";
    return action.setFeedback({ "full-canvas": dialSvg(1, `ATTENTION ${queue.length}`, value, theme, queue.length ? "yellow" : "overlay0", brand) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.thread" })
class ThreadDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  private render(action: DialAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return Promise.resolve();
    const snapshot = herdr.snapshot;
    if (command.active) {
      return action.setFeedback({ "full-canvas": dialSvg(2, "COMMAND TARGET", command.targetLabel, theme, "accent", brand) });
    }
    const pane = currentPane(snapshot?.panes ?? [], snapshot?.focused_pane_id);
    return action.setFeedback({ "full-canvas": dialSvg(2, pane ? "CURRENT · LIVE" : "CURRENT", paneLabel(pane, "HERDR OFFLINE"), theme, pane?.agent_status === "working" ? "blue" : "accent", brand) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.answer" })
class AnswerDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const blocked = attentionPanes(herdr.snapshot)[0];
    if (!blocked) return event.action.showAlert();
    try {
      await herdr.focusPane(blocked.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Answer dial failed: ${String(error)}`);
      await event.action.showAlert();
    }
  }

  private render(action: DialAction): Promise<void> {
    const theme = herdr.theme;
    if (!theme) return Promise.resolve();
    const blocked = attentionPanes(herdr.snapshot)[0];
    return action.setFeedback({ "full-canvas": dialSvg(3, blocked ? "QUESTION" : "QUICK SELECT", blocked ? "OPEN HERDR" : "NO QUESTION", theme, blocked ? "yellow" : "overlay0", brand) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

function keySlot(action: KeyAction): number | null {
  const coordinates = action.coordinates;
  return coordinates ? slotForCoordinates(coordinates.column, coordinates.row) : null;
}

function pngData(url: URL): string {
  return `data:image/png;base64,${readFileSync(url).toString("base64")}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new PinnedThreadAction());
streamDeck.actions.registerAction(new AttentionAction());
streamDeck.actions.registerAction(new CommandAction());
streamDeck.actions.registerAction(new PagesDialAction());
streamDeck.actions.registerAction(new AttentionDialAction());
streamDeck.actions.registerAction(new ThreadDialAction());
streamDeck.actions.registerAction(new AnswerDialAction());
streamDeck.connect();
herdr.start();
