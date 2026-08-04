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
import { readFileSync } from "node:fs";

import { HerdrBridge } from "./herdr.js";
import {
  attentionPanes,
  commandIntent,
  type DeckSettings,
  navigatePages,
  normalizeSettings,
  type PaneSnapshot,
  paneIdentity,
  paneLabel,
  resolvePin,
  slotForCoordinates,
  visiblePageCount,
  wrappedIndex
} from "./model.js";
import { currentPane, dialSvg, keySvg, stripRegionSvg, type StripView, type WorkingMotion } from "./render.js";

const HOLD_MS = 650;
const LCD_TAKEOVER_MS = 5000;
const KEY_ANIMATION_MS = 128;
const KEY_ANIMATION_FRAMES = 240;
const logoImage = svgImage(readFileSync(new URL("../imgs/herdr_logo.svg", import.meta.url), "utf8").replace("currentColor", "#959391"));
const herdr = new HerdrBridge();
const transientKeyFeedback = new Set<string>();
const transientDialFeedback = new Set<string>();
const motionVariants = [
  { id: "darken", name: "DARK SWOOSH" },
  { id: "lighten", name: "LIGHT SWOOSH" },
  { id: "rainbow", name: "RAINBOW SWOOSH" }
] satisfies Array<{ id: WorkingMotion; name: string }>;
let motionVariantIndex = 1;

type Listener = () => void;

class DeckStore {
  private loadPromise: Promise<DeckSettings> | null = null;
  private updatePromise = Promise.resolve();
  private readonly listeners = new Set<Listener>();

  get(): Promise<DeckSettings> {
    this.loadPromise ??= streamDeck.settings.getGlobalSettings<DeckSettings>().then(normalizeSettings);
    return this.loadPromise;
  }

  update(change: (settings: DeckSettings) => void): Promise<void> {
    const update = this.updatePromise.then(async () => {
      const settings = structuredClone(await this.get());
      change(settings);
      this.loadPromise = Promise.resolve(settings);
      await streamDeck.settings.setGlobalSettings(settings);
      for (const listener of this.listeners) listener();
    });
    this.updatePromise = update.catch(() => undefined);
    return update;
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

class PinChooserState {
  pane: PaneSnapshot | null = null;
  private readonly listeners = new Set<Listener>();

  enter(pane: PaneSnapshot): void {
    command.cancel();
    this.pane = pane;
    this.emit();
  }

  cancel(): void {
    if (!this.pane) return;
    this.pane = null;
    this.emit();
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

class InboxState {
  active = false;
  paneId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  open(paneId: string | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.active = true;
    this.paneId = paneId;
    this.emit();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.cancel();
    }, LCD_TAKEOVER_MS);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.active) return;
    this.active = false;
    this.paneId = null;
    this.emit();
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

class StripState {
  takeover: "page" | "motion" | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  show(takeover: "page" | "motion"): void {
    if (this.timer) clearTimeout(this.timer);
    this.takeover = takeover;
    this.emit();
    this.timer = setTimeout(() => {
      this.takeover = null;
      this.emit();
    }, LCD_TAKEOVER_MS);
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const deck = new DeckStore();
const command = new CommandState();
const pinChooser = new PinChooserState();
const inbox = new InboxState();
const strip = new StripState();
herdr.subscribePinRequests((pane) => {
  inbox.cancel();
  pinChooser.enter(pane);
});

@action({ UUID: "dev.herdr.streamdeck.pin" })
class PinnedThreadAction extends SingletonAction {
  private readonly downAt = new Map<string, number>();
  private animationFrame = 0;
  private animationBusy = false;

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    pinChooser.subscribe(() => void this.renderAll());
    setInterval(() => void this.renderWorkingFrame(), KEY_ANIMATION_MS);
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
      if (pinChooser.pane) {
        if (await this.pinSelected(slot)) await showKeySuccess(event.action, "PINNED", () => this.render(event.action));
        else await showKeyError(event.action, "SLOT BUSY", "UNPIN FIRST", slot, () => this.render(event.action));
      } else if (command.active) {
        if (await this.runCommand(slot, event.action)) {
          await showKeySuccess(event.action, "SENT", async () => {
            command.cancel();
            await this.render(event.action);
          });
        }
      } else if (Date.now() - started >= HOLD_MS) {
        const change = await this.togglePin(slot);
        if (change) await showKeySuccess(event.action, change === "pinned" ? "PINNED" : "UNPINNED", () => this.render(event.action));
        else await showKeyError(event.action, "NO THREAD", "FOCUS HERDR", slot, () => this.render(event.action));
      } else {
        const settings = await deck.get();
        const pin = settings.pages[settings.pageIndex].pins[slot];
        if (!pin) {
          const change = await this.togglePin(slot);
          if (change) await showKeySuccess(event.action, "PINNED", () => this.render(event.action));
          else await showKeyError(event.action, "NO THREAD", "FOCUS HERDR", slot, () => this.render(event.action));
          return;
        }
        const pane = resolvePin(pin, herdr.snapshot);
        if (!pane) return showKeyError(event.action, "OFFLINE", "THREAD LOST", slot, () => this.render(event.action));
        await herdr.focusPane(pane.pane_id);
        await showKeySuccess(event.action, "FOCUSED", () => this.render(event.action));
      }
    } catch (error) {
      streamDeck.logger.error(`Pinned thread action failed: ${String(error)}`);
      if (command.active) {
        await showKeyError(event.action, "FAILED", "NOT SENT", slot, () => this.render(event.action));
        return;
      }
      await showKeyError(event.action, "FAILED", "TRY AGAIN", slot, () => this.render(event.action));
    }
  }

  private async pinSelected(slot: number): Promise<boolean> {
    const pane = pinChooser.pane;
    const settings = await deck.get();
    if (!pane || settings.pages[settings.pageIndex].pins[slot]) return false;
    await deck.update((settings) => {
      settings.pages[settings.pageIndex].pins[slot] = {
        paneId: pane.pane_id,
        label: paneLabel(pane, pane.pane_id),
        terminalId: pane.terminal_id,
        agentSession: pane.agent_session
      };
    });
    pinChooser.cancel();
    return true;
  }

  private async togglePin(slot: number): Promise<"pinned" | "unpinned" | null> {
    const focused = herdr.snapshot?.panes.find((pane) => pane.pane_id === herdr.snapshot?.focused_pane_id);
    const settings = await deck.get();
    const change = settings.pages[settings.pageIndex].pins[slot] ? "unpinned" : "pinned";
    if (change === "pinned" && !focused) return null;
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
    return change;
  }

  private async runCommand(slot: number, action: KeyAction): Promise<boolean> {
    const paneId = command.targetPaneId;
    if (!paneId) {
      await showKeyError(action, "NO TARGET", "FOCUS THREAD", slot, () => this.render(action));
      return false;
    }
    const intent = commandIntent(slot, command.stopArmed);
    switch (intent.kind) {
      case "zoom":
        await herdr.toggleZoom(paneId);
        return true;
      case "arm-stop":
        command.armStop();
        return false;
      case "stop":
        await herdr.stop(paneId);
        return true;
      case "prompt":
        await herdr.prompt(paneId, intent.text);
        return true;
      case "unavailable":
        await showKeyError(action, "NO ACTION", "UNASSIGNED", slot, () => this.render(action));
        return false;
    }
  }

  private async render(action: KeyAction): Promise<void> {
    if (transientKeyFeedback.has(action.id)) return;
    const slot = keySlot(action);
    if (slot === null) return;
    const theme = herdr.theme;
    const settings = await deck.get();
    if (transientKeyFeedback.has(action.id)) return;
    if (pinChooser.pane) {
      const occupied = settings.pages[settings.pageIndex].pins[slot];
      return renderKey(action, keySvg({
        label: occupied ? "OCCUPIED" : "PIN HERE",
        context: `SLOT ${slot + 1}`,
        detail: occupied ? "UNPIN FIRST" : "PRESS PLACE",
        slot,
        danger: Boolean(occupied)
      }, theme));
    }
    if (command.active) {
      const labels = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "—", "STOP"];
      const armed = slot === 5 && command.stopArmed;
      const label = armed ? "STOP AGAIN" : labels[slot];
      return renderKey(action, keySvg({
        label,
        context: "COMMAND",
        detail: armed ? "PRESS AGAIN" : slot === 4 ? "UNASSIGNED" : "PRESS SEND",
        slot,
        danger: armed
      }, theme));
    }
    const pin = settings.pages[settings.pageIndex].pins[slot];
    const pane = resolvePin(pin, herdr.snapshot);
    const identity = paneIdentity(pane, herdr.snapshot, pin?.label || "");
    const detail = !pin ? undefined : !pane ? "OFFLINE" : pane.agent_status === "blocked" ? "NEEDS YOU" : undefined;
    return renderKey(action, keySvg({
      label: identity.primary,
      detail,
      slot,
      status: pin ? pane?.agent_status ?? "offline" : undefined,
      selected: Boolean(pane?.focused),
      empty: !pin
    }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isKey() && !transientKeyFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }

  private async renderWorkingFrame(): Promise<void> {
    if (this.animationBusy || command.active || pinChooser.pane) return;
    this.animationBusy = true;
    this.animationFrame = (this.animationFrame + 1) % KEY_ANIMATION_FRAMES;
    try {
      const settings = await deck.get();
      const page = settings.pages[settings.pageIndex];
      await Promise.all(this.actions.toArray().flatMap((item) => {
        if (!item.isKey() || transientKeyFeedback.has(item.id) || this.downAt.has(item.id)) return [];
        const slot = keySlot(item);
        const pin = slot === null ? null : page.pins[slot];
        const pane = resolvePin(pin, herdr.snapshot);
        if (slot === null || !pin || pane?.agent_status !== "working") return [];
        const identity = paneIdentity(pane, herdr.snapshot, pin.label);
        return [item.setImage(svgImage(keySvg({
          label: identity.primary,
          slot,
          status: "working",
          selected: pane.focused,
          workingFrame: this.animationFrame,
          workingMotion: motionVariants[motionVariantIndex].id
        }, herdr.theme)))];
      }));
    } finally {
      this.animationBusy = false;
    }
  }
}

@action({ UUID: "dev.herdr.streamdeck.attention" })
class AttentionAction extends SingletonAction {
  private readonly downAt = new Map<string, number>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
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
    if (duration >= HOLD_MS) return showKeyError(event.action, "TAP INBOX", "HOLD UNUSED", undefined, () => this.render(event.action));
    const queue = attentionPanes(herdr.snapshot);
    command.cancel();
    pinChooser.cancel();
    if (!queue.length) {
      inbox.open(null);
      return;
    }
    const current = inbox.active ? queue.findIndex((pane) => pane.pane_id === inbox.paneId) : -1;
    const pane = queue[current >= 0 ? wrappedIndex(current, 1, queue.length) : 0];
    inbox.open(pane.pane_id);
    try {
      await herdr.focusPane(pane.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Attention action failed: ${String(error)}`);
      await showKeyError(event.action, "FAILED", "HERDR OFFLINE", undefined, () => this.render(event.action));
    }
  }

  private render(action: KeyAction): Promise<void> {
    if (transientKeyFeedback.has(action.id)) return Promise.resolve();
    const theme = herdr.theme;
    const count = attentionPanes(herdr.snapshot).length;
    return renderKey(action, keySvg({
      label: "INBOX",
      count: count || undefined,
      status: count ? "blocked" : undefined
    }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isKey() && !transientKeyFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

@action({ UUID: "dev.herdr.streamdeck.command" })
class CommandAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    pinChooser.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isKey()) return this.render(event.action);
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    if (inbox.active) {
      inbox.cancel();
      return;
    }
    if (pinChooser.pane) {
      pinChooser.cancel();
      return;
    }
    if (command.active) {
      command.cancel();
      return;
    }
    const pane = currentPane(herdr.snapshot?.panes ?? [], herdr.snapshot?.focused_pane_id);
    if (!pane) return showKeyError(event.action, "NO TARGET", "FOCUS THREAD", undefined, () => this.render(event.action));
    if (pane.agent_status === "blocked") return showKeyError(event.action, "NEEDS INPUT", "USE INBOX", undefined, () => this.render(event.action));
    inbox.cancel();
    command.enter(pane.pane_id, paneIdentity(pane, herdr.snapshot, pane.pane_id).primary);
  }

  private render(action: KeyAction): Promise<void> {
    if (transientKeyFeedback.has(action.id)) return Promise.resolve();
    const theme = herdr.theme;
    if (pinChooser.pane) {
      const identity = paneIdentity(pinChooser.pane, herdr.snapshot, pinChooser.pane.pane_id);
      return renderKey(action, keySvg({ label: "CANCEL", context: "PIN MODE", detail: identity.primary }, theme));
    }
    if (inbox.active) return renderKey(action, keySvg({ label: "BACK", context: "INBOX", detail: "RETURN" }, theme));
    if (command.active) return renderKey(action, keySvg({ label: "CANCEL", context: "COMMAND", detail: command.targetLabel }, theme));
    return renderKey(action, keySvg({ label: "COMMAND" }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isKey() && !transientKeyFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

@action({ UUID: "dev.herdr.streamdeck.pages" })
class PagesDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    strip.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    if (inbox.active) return;
    await deck.update((settings) => {
      navigatePages(settings, event.payload.ticks);
    });
    strip.show("page");
  }

  override async onDialDown(): Promise<void> {
    if (inbox.active) return;
    await deck.update((settings) => {
      settings.pageIndex = 0;
    });
    strip.show("page");
  }

  private async render(action: DialAction): Promise<void> {
    return renderStrip(action, 0);
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isDial() && !transientDialFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

@action({ UUID: "dev.herdr.streamdeck.attention-dial" })
class AttentionDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    strip.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override onDialRotate(event: DialRotateEvent): void {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return;
    const current = queue.findIndex((pane) => pane.pane_id === inbox.paneId);
    const start = current >= 0 ? current : event.payload.ticks > 0 ? -1 : 0;
    inbox.open(queue[wrappedIndex(start, event.payload.ticks, queue.length)].pane_id);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) {
      inbox.open(null);
      return;
    }
    const pane = selectedAttentionPane() ?? queue[0];
    try {
      inbox.open(pane.pane_id);
      await herdr.focusPane(pane.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Attention dial failed: ${String(error)}`);
      await showDialError(event.action, "FAILED", "HERDR OFFLINE", () => this.render(event.action));
    }
  }

  private render(action: DialAction): Promise<void> {
    return renderStrip(action, 1);
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isDial() && !transientDialFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

@action({ UUID: "dev.herdr.streamdeck.thread" })
class ThreadDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    strip.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  private render(action: DialAction): Promise<void> {
    return renderStrip(action, 2);
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isDial() && !transientDialFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

@action({ UUID: "dev.herdr.streamdeck.answer" })
class AnswerDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    strip.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    if (inbox.active || command.active) return;
    motionVariantIndex = wrappedIndex(motionVariantIndex, event.payload.ticks, motionVariants.length);
    strip.show("motion");
  }

  private render(action: DialAction): Promise<void> {
    return renderStrip(action, 3);
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) =>
      item.isDial() && !transientDialFeedback.has(item.id) ? [this.render(item)] : []
    ));
  }
}

function selectedAttentionPane(): PaneSnapshot | undefined {
  return attentionPanes(herdr.snapshot).find((pane) => pane.pane_id === inbox.paneId);
}

async function renderStrip(action: DialAction, region: number): Promise<void> {
  if (transientDialFeedback.has(action.id)) return;
  const settings = await deck.get();
  if (transientDialFeedback.has(action.id)) return;
  let view: StripView;
  if (inbox.active) {
    const queue = attentionPanes(herdr.snapshot);
    const pane = selectedAttentionPane() ?? queue[0];
    const index = pane ? queue.findIndex((item) => item.pane_id === pane.pane_id) : -1;
    view = pane
      ? {
          kind: "attention",
          label: paneIdentity(pane, herdr.snapshot, "BLOCKED").primary,
          position: `${index + 1} / ${queue.length}`,
          focused: pane.pane_id === herdr.snapshot?.focused_pane_id
        }
      : { kind: "clear" };
  } else if (command.active) {
    view = { kind: "command", label: command.targetLabel };
  } else if (strip.takeover === "page") {
    const page = settings.pages[settings.pageIndex];
    view = {
      kind: "page",
      name: page.name,
      position: `${settings.pageIndex + 1} / ${visiblePageCount(settings)}`,
      summary: pageSummary(page.pins)
    };
  } else if (strip.takeover === "motion") {
    view = {
      kind: "motion",
      name: motionVariants[motionVariantIndex].name,
      position: `${motionVariantIndex + 1} / ${motionVariants.length}`
    };
  } else {
    view = { kind: "logo", image: logoImage };
  }
  return action.setFeedback({ "full-canvas": svgImage(stripRegionSvg(region, view, herdr.theme)) });
}

function pageSummary(pins: DeckSettings["pages"][number]["pins"]): string {
  const panes = pins.map((pin) => resolvePin(pin, herdr.snapshot)).filter((pane): pane is PaneSnapshot => Boolean(pane));
  const parts = [
    [panes.filter((pane) => pane.agent_status === "working").length, "WORKING"],
    [panes.filter((pane) => pane.agent_status === "blocked").length, "NEEDS YOU"]
  ].filter(([count]) => count);
  return parts.length ? parts.map(([count, label]) => `${count} ${label}`).join(" · ") : `${pins.filter(Boolean).length} PINNED`;
}

async function showKeyError(
  action: KeyAction,
  label: string,
  detail: string,
  slot: number | undefined,
  restore: () => Promise<void>
): Promise<void> {
  transientKeyFeedback.add(action.id);
  try {
    await renderKey(action, keySvg({ label, detail, slot, danger: true }, herdr.theme));
    await delay(700);
  } finally {
    transientKeyFeedback.delete(action.id);
  }
  await restore();
}

async function showKeySuccess(
  action: KeyAction,
  label: string,
  restore: () => Promise<void>
): Promise<void> {
  transientKeyFeedback.add(action.id);
  try {
    await renderKey(action, keySvg({ label, status: "done" }, herdr.theme));
    await delay(500);
  } finally {
    transientKeyFeedback.delete(action.id);
  }
  await restore();
}

async function showDialError(action: DialAction, title: string, value: string, restore: () => Promise<void>): Promise<void> {
  transientDialFeedback.add(action.id);
  try {
    await action.setFeedback({ "full-canvas": svgImage(dialSvg(title, value, herdr.theme, "red")) });
    await delay(700);
  } finally {
    transientDialFeedback.delete(action.id);
  }
  await restore();
}

function keySlot(action: KeyAction): number | null {
  const coordinates = action.coordinates;
  return coordinates ? slotForCoordinates(coordinates.column, coordinates.row) : null;
}

async function renderKey(action: KeyAction, image: string): Promise<void> {
  await Promise.all([action.setImage(svgImage(image)), action.setTitle()]);
}

function svgImage(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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
