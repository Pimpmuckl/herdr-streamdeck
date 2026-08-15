import streamDeck, {
  action,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type DialUpEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  SingletonAction,
  type TouchTapEvent,
  type WillAppearEvent
} from "@elgato/streamdeck";
import { readFileSync } from "node:fs";

import { HerdrBridge } from "./herdr.js";
import {
  adjustMotionScale,
  adjustMotionSpeed,
  attentionPanes,
  CommandState,
  commandIntent,
  type DeckSettings,
  MOTION_BASE_SPEED,
  navigatePages,
  normalizeSettings,
  type PaneSnapshot,
  paneIdentity,
  paneLabel,
  RecentPaneHistory,
  resolvePin,
  slotForCoordinates,
  visiblePageCount,
  type WorkingMotion,
  wrappedIndex
} from "./model.js";
import {
  currentPane,
  dialSvg,
  keySvg,
  MOTION_CYCLE_FRAMES,
  oledForeground,
  stripRegionSvg,
  type StripView
} from "./render.js";

const HOLD_MS = 650;
const LCD_TIMEOUT_BAR_MS = 2000;
const LCD_PANEL_TIMEOUT_MS = 5000;
const LCD_SETTINGS_TIMEOUT_MS = 15000;
const KEY_ANIMATION_MS = 128;
const SHEEP_ANIMATION_FRAMES = 26;
const SHEEP_ANIMATION_MS = 96;
const logoSvg = readFileSync(new URL("../imgs/herdr_logo.svg", import.meta.url), "utf8");
let cachedLogoColor = "";
let cachedLogoImage = "";
const herdr = new HerdrBridge();
const transientKeyFeedback = new Set<string>();
const transientDialFeedback = new Set<string>();
const motionVariants = [
  { id: "darken", name: "DARK" },
  { id: "lighten", name: "LIGHT" },
  { id: "rainbow", name: "RAINBOW" }
] satisfies Array<{ id: WorkingMotion; name: string }>;
const settingNames = ["WORKING SPEED", "WORKING MOTION", "WORKING WIDTH", "WORKING INTENSITY", "FOCUS FEEDBACK"] as const;
let pendingSettingsSave: DeckSettings | null = null;
let settingsSaveTask: Promise<void> | null = null;

type Listener = () => void;

class DeckStore {
  private loadPromise: Promise<DeckSettings> | null = null;
  private updatePromise = Promise.resolve();
  private readonly listeners = new Set<Listener>();

  constructor() {
    streamDeck.settings.onDidReceiveGlobalSettings<DeckSettings>((event) => {
      this.loadPromise = Promise.resolve(normalizeSettings(event.settings));
      for (const listener of this.listeners) listener();
    });
  }

  get(): Promise<DeckSettings> {
    this.loadPromise ??= streamDeck.settings.getGlobalSettings<DeckSettings>().then(normalizeSettings);
    return this.loadPromise;
  }

  async reload(): Promise<DeckSettings> {
    const previous = this.loadPromise;
    const request = streamDeck.settings.getGlobalSettings<DeckSettings>().then(normalizeSettings);
    this.loadPromise = request;
    try {
      return await request;
    } catch (error) {
      if (this.loadPromise === request) this.loadPromise = previous;
      throw error;
    }
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
  expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  open(paneId: string | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.active = true;
    this.paneId = paneId;
    this.expiresAt = Date.now() + LCD_PANEL_TIMEOUT_MS;
    this.emit();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.cancel();
    }, LCD_PANEL_TIMEOUT_MS);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.expiresAt = 0;
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
  takeover: "page" | "recent" | null = null;
  recentPaneId: string | null = null;
  idleFrame = 0;
  sheepFrame: number | null = null;
  sheepBaas: Array<{ frame: number; count: number }> = [];
  expiresAt = 0;
  private sheepRun = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<number, () => Promise<void>>();

  show(takeover: "page"): void {
    this.cancelSheep();
    if (this.timer) clearTimeout(this.timer);
    this.takeover = takeover;
    this.recentPaneId = null;
    this.expiresAt = Date.now() + LCD_PANEL_TIMEOUT_MS;
    void this.emit();
    this.timer = setTimeout(() => {
      this.takeover = null;
      this.recentPaneId = null;
      this.expiresAt = 0;
      void this.emit();
    }, LCD_PANEL_TIMEOUT_MS);
  }

  showRecent(paneId: string): void {
    this.cancelSheep();
    if (this.timer) clearTimeout(this.timer);
    this.takeover = "recent";
    this.recentPaneId = paneId;
    this.expiresAt = Date.now() + LCD_PANEL_TIMEOUT_MS;
    void this.emit();
    this.timer = setTimeout(() => this.showIdle(), LCD_PANEL_TIMEOUT_MS);
  }

  showIdle(): void {
    this.cancelSheep();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.takeover = null;
    this.recentPaneId = null;
    this.expiresAt = 0;
    void this.emit();
  }

  async tickIdle(regions: readonly number[]): Promise<void> {
    await this.emit(regions);
    this.idleFrame = (this.idleFrame + 1) % 6;
  }

  refresh(regions: readonly number[]): Promise<void> {
    return this.emit(regions);
  }

  async playSheep(): Promise<void> {
    if (this.sheepFrame !== null) return;
    const run = ++this.sheepRun;
    this.sheepBaas = [8, 11, 14, 17, 20].map((frame) => ({ frame, count: Math.floor(Math.random() * 4) }));
    try {
      for (let frame = 0; frame < SHEEP_ANIMATION_FRAMES && run === this.sheepRun; frame++) {
        this.sheepFrame = frame;
        await this.emit([0, 1, 2, 3]);
        await delay(SHEEP_ANIMATION_MS);
      }
    } finally {
      if (run === this.sheepRun) {
        this.sheepFrame = null;
        this.sheepBaas = [];
      }
    }
    if (run !== this.sheepRun) return;
    await this.emit([0, 1, 2, 3]);
  }

  subscribe(region: number, listener: () => Promise<void>): void {
    this.listeners.set(region, listener);
  }

  private cancelSheep(): void {
    if (this.sheepFrame === null) return;
    this.sheepRun++;
    this.sheepFrame = null;
    this.sheepBaas = [];
  }

  private async emit(regions?: readonly number[]): Promise<void> {
    const listeners = regions
      ? regions.flatMap((region) => this.listeners.get(region) ?? [])
      : Array.from(this.listeners.values());
    await Promise.all(listeners.map((listener) => listener()));
  }
}

class SettingsMenuState {
  active = false;
  editing = false;
  index = 0;
  draft: DeckSettings | null = null;
  expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<Listener>();

  enter(): void {
    this.active = true;
    this.editing = false;
    this.draft = null;
    this.resetTimeout();
    this.emit();
  }

  move(ticks: number): void {
    this.index = Math.max(0, Math.min(settingNames.length - 1, this.index + ticks));
    this.resetTimeout();
    this.emit();
  }

  begin(settings: DeckSettings): void {
    this.editing = true;
    this.draft ??= structuredClone(settings);
    this.resetTimeout();
    this.emit();
  }

  change(ticks: number): DeckSettings | null {
    if (!this.draft) return null;
    adjustSetting(this.draft, this.index, ticks);
    this.resetTimeout();
    this.emit();
    return structuredClone(this.draft);
  }

  done(): void {
    this.editing = false;
    this.resetTimeout();
    this.emit();
  }

  exit(): void {
    if (!this.active) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.expiresAt = 0;
    this.active = false;
    this.editing = false;
    this.draft = null;
    this.emit();
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private resetTimeout(): void {
    if (this.timer) clearTimeout(this.timer);
    this.expiresAt = Date.now() + LCD_SETTINGS_TIMEOUT_MS;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.exit();
    }, LCD_SETTINGS_TIMEOUT_MS);
  }
}

const deck = new DeckStore();
const command = new CommandState();
const pinChooser = new PinChooserState();
const inbox = new InboxState();
const strip = new StripState();
const settingsMenu = new SettingsMenuState();
const recent = new RecentPaneHistory();
let startupLogged = false;
herdr.subscribe(() => {
  recent.observe(herdr.snapshot);
  if (strip.recentPaneId && !recent.panes(herdr.snapshot).some((pane) => pane.pane_id === strip.recentPaneId)) strip.showIdle();
  void logStartupState();
});
deck.subscribe(() => void logStartupState());
herdr.subscribePinRequests((pane) => {
  closeSettings();
  inbox.cancel();
  strip.showIdle();
  pinChooser.enter(pane);
});

@action({ UUID: "dev.herdr.streamdeck.pin" })
class PinnedThreadAction extends SingletonAction {
  private readonly downKeys = new Set<string>();
  private readonly holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly holdTasks = new Map<string, Promise<void>>();
  private animationFrame = 0;
  private animationAt = performance.now();
  private keyAnimationBusy = false;

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    pinChooser.subscribe(() => void this.renderAll());
    void this.runStripLoop();
    setTimeout(() => setInterval(() => void this.renderWorkingKeys(), KEY_ANIMATION_MS), KEY_ANIMATION_MS / 2);
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isKey()) return this.render(event.action);
  }

  override onKeyDown(event: KeyDownEvent): void {
    this.downKeys.add(event.action.id);
    if (settingsMenu.active) closeSettings();
    strip.showIdle();
    if (pinChooser.pane || command.active) return;
    const slot = keySlot(event.action);
    if (slot === null) return;
    this.holdTimers.set(event.action.id, setTimeout(() => {
      this.holdTimers.delete(event.action.id);
      this.holdTasks.set(event.action.id, this.commitHold(slot, event.action));
    }, HOLD_MS));
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    const holdTimer = this.holdTimers.get(event.action.id);
    if (holdTimer) clearTimeout(holdTimer);
    this.holdTimers.delete(event.action.id);
    this.downKeys.delete(event.action.id);
    const holdTask = this.holdTasks.get(event.action.id);
    if (holdTask) {
      try {
        await holdTask;
      } finally {
        this.holdTasks.delete(event.action.id);
        transientKeyFeedback.delete(event.action.id);
        await this.render(event.action);
      }
      return;
    }
    const slot = keySlot(event.action);
    if (slot === null) return;

    try {
      if (pinChooser.pane) {
        if (await this.pinSelected(slot)) await this.render(event.action);
        else await showKeyError(event.action, "SLOT BUSY", "UNPIN FIRST", slot, () => this.render(event.action));
      } else if (command.active) {
        const feedback = await this.runCommand(slot, event.action);
        if (feedback) {
          await showKeySuccess(event.action, feedback, async () => {
            command.cancel();
            await this.render(event.action);
          });
        }
      } else {
        const settings = await deck.get();
        const pin = settings.pages[settings.pageIndex].pins[slot];
        if (!pin) {
          const change = await this.togglePin(slot);
          if (change) await this.render(event.action);
          else await showKeyError(event.action, "NO THREAD", "FOCUS HERDR", slot, () => this.render(event.action));
          return;
        }
        const pane = resolvePin(pin, herdr.snapshot);
        if (!pane) return showKeyError(event.action, "OFFLINE", "THREAD LOST", slot, () => this.render(event.action));
        await herdr.focusPane(pane.pane_id);
        if (settings.focusFeedback) await showKeySuccess(event.action, "FOCUSED", () => this.render(event.action));
        else await this.render(event.action);
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

  private async commitHold(slot: number, action: KeyAction): Promise<void> {
    transientKeyFeedback.add(action.id);
    try {
      const settings = await deck.get();
      if (!settings.pages[settings.pageIndex].pins[slot]) return;
      await deck.update((settings) => {
        settings.pages[settings.pageIndex].pins[slot] = null;
      });
      await renderKey(action, keySvg({ label: "THREAD UNPINNED", feedback: "success" }, herdr.theme));
      await delay(500);
    } catch (error) {
      streamDeck.logger.error(`Pinned thread hold failed: ${String(error)}`);
      await renderKey(action, keySvg({ label: "FAILED", detail: "LET GO", slot, danger: true }, herdr.theme));
    }
  }

  private async runCommand(slot: number, action: KeyAction): Promise<"PROMPT SENT" | "ZOOMED" | "INTERRUPTED" | null> {
    const paneId = command.targetPaneId;
    if (!paneId) {
      await showKeyError(action, "NO TARGET", "FOCUS THREAD", slot, () => this.render(action));
      return null;
    }
    const intent = commandIntent(slot, command.stopArmed);
    switch (intent.kind) {
      case "zoom":
        await herdr.toggleZoom(paneId);
        return "ZOOMED";
      case "arm-stop":
        command.armStop();
        return null;
      case "stop":
        await herdr.stop(paneId);
        return "INTERRUPTED";
      case "prompt":
        await herdr.prompt(paneId, intent.text);
        return "PROMPT SENT";
      case "unavailable":
        return null;
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
      if (slot === 4) return renderKey(action, keySvg({ label: "", blank: true }, theme));
      const labels = ["CONTINUE", "STATUS", "VERIFY", "ZOOM", "", "STOP"];
      const details = ["PROMPT", "PROMPT", "PROMPT", "HERDR", "", "CTRL+C"];
      const armed = slot === 5 && command.stopArmed;
      const label = armed ? "STOP AGAIN" : labels[slot];
      return renderKey(action, keySvg({
        label,
        detail: armed ? "PRESS AGAIN" : details[slot],
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

  private async renderWorkingKeys(): Promise<void> {
    if (this.keyAnimationBusy) return;
    if (command.active || pinChooser.pane) {
      this.animationAt = performance.now();
      return;
    }
    this.keyAnimationBusy = true;
    try {
      const storedSettings = await deck.get();
      const settings = settingsMenu.draft ?? storedSettings;
      const now = performance.now();
      this.animationFrame = (this.animationFrame + (now - this.animationAt) / KEY_ANIMATION_MS * settings.motionSpeed / MOTION_BASE_SPEED) % MOTION_CYCLE_FRAMES;
      this.animationAt = now;
      const page = settings.pages[settings.pageIndex];
      await Promise.all(this.actions.toArray().flatMap((item) => {
        if (!item.isKey() || transientKeyFeedback.has(item.id) || this.downKeys.has(item.id)) return [];
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
          workingMotion: settings.workingMotion,
          workingWidth: settings.motionWidth,
          workingIntensity: settings.motionIntensity
        }, herdr.theme)))];
      }));
    } finally {
      this.keyAnimationBusy = false;
    }
  }

  private async runStripLoop(): Promise<void> {
    let interval = KEY_ANIMATION_MS;
    try {
      const speed = await this.renderStripFrame();
      interval = KEY_ANIMATION_MS * MOTION_BASE_SPEED / speed;
    } catch (error) {
      streamDeck.logger.error(`Strip animation failed: ${String(error)}`);
    }
    setTimeout(() => void this.runStripLoop(), interval);
  }

  private async renderStripFrame(): Promise<number> {
    if (activeTimeoutProgress() > 0) await strip.refresh([0, 1, 2, 3]);
    if (command.active || pinChooser.pane || settingsMenu.active) return MOTION_BASE_SPEED;
    const settings = await deck.get();
    const focused = currentPane(herdr.snapshot?.panes ?? [], herdr.snapshot?.focused_pane_id);
    const animateIdle = !inbox.active && strip.takeover === null && focused?.agent_status === "working";
    if (!animateIdle) return MOTION_BASE_SPEED;
    await strip.tickIdle([0]);
    return settings.motionSpeed;
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
    if (duration >= HOLD_MS) return;
    if (settingsMenu.active) closeSettings();
    strip.showIdle();
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

  override onKeyDown(): void {
    strip.showIdle();
  }

  override async onKeyUp(event: KeyUpEvent): Promise<void> {
    strip.showIdle();
    if (settingsMenu.active) closeSettings();
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
    if (command.active) return renderKey(action, keySvg({ label: "BACK" }, theme));
    return renderKey(action, keySvg({ label: "ACTIONS" }, theme));
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
    settingsMenu.subscribe(() => void this.renderAll());
    strip.subscribe(0, () => this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    strip.showIdle();
    if (settingsMenu.active) return;
    if (inbox.active) {
      const queue = attentionPanes(herdr.snapshot);
      if (!queue.length) return;
      const current = queue.findIndex((pane) => pane.pane_id === inbox.paneId);
      const start = current >= 0 ? current : event.payload.ticks > 0 ? -1 : 0;
      inbox.open(queue[wrappedIndex(start, event.payload.ticks, queue.length)].pane_id);
      return;
    }
    await deck.update((settings) => {
      navigatePages(settings, event.payload.ticks);
    });
    strip.show("page");
  }

  override async onDialDown(): Promise<void> {
    strip.showIdle();
    if (settingsMenu.active || inbox.active) return;
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
    settingsMenu.subscribe(() => void this.renderAll());
    strip.subscribe(1, () => this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    strip.showIdle();
    if (settingsMenu.active) return;
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
class DisplayDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    settingsMenu.subscribe(() => void this.renderAll());
    strip.subscribe(2, () => this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    if (inbox.active || command.active || pinChooser.pane || settingsMenu.active) return;
    const panes = recent.panes(herdr.snapshot);
    if (!panes.length) return;
    const current = panes.findIndex((pane) => pane.pane_id === strip.recentPaneId);
    const start = current >= 0 ? current : event.payload.ticks > 0 ? -1 : 0;
    strip.showRecent(panes[wrappedIndex(start, event.payload.ticks, panes.length)].pane_id);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    if (inbox.active || command.active || pinChooser.pane || settingsMenu.active) return;
    const pane = recent.panes(herdr.snapshot).find((pane) => pane.pane_id === strip.recentPaneId);
    if (!pane) return;
    strip.showIdle();
    try {
      await herdr.focusPane(pane.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Recent thread dial failed: ${String(error)}`);
      await showDialError(event.action, "FAILED", "HERDR OFFLINE", () => this.render(event.action));
    }
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
  private readonly holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly held = new Set<string>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    settingsMenu.subscribe(() => void this.renderAll());
    strip.subscribe(3, () => this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    if (inbox.active || command.active || pinChooser.pane) return;
    strip.showIdle();
    if (!settingsMenu.active) {
      settingsMenu.enter();
      return;
    }
    if (!settingsMenu.editing) {
      settingsMenu.move(event.payload.ticks);
      return;
    }
    const draft = settingsMenu.change(event.payload.ticks);
    if (draft) queueSettingsSave(draft);
  }

  override onTouchTap(event: TouchTapEvent): Promise<void> | void {
    if (
      event.payload.hold || event.payload.tapPos[0] < 100 || inbox.active || command.active
      || pinChooser.pane || settingsMenu.active || strip.takeover
    ) return;
    return strip.playSheep();
  }

  override onDialDown(event: DialDownEvent): void {
    if (inbox.active || command.active || pinChooser.pane) return;
    strip.showIdle();
    this.holdTimers.set(event.action.id, setTimeout(() => {
      this.holdTimers.delete(event.action.id);
      this.held.add(event.action.id);
      this.handleHold();
    }, HOLD_MS));
  }

  override async onDialUp(event: DialUpEvent): Promise<void> {
    const timer = this.holdTimers.get(event.action.id);
    if (timer) clearTimeout(timer);
    this.holdTimers.delete(event.action.id);
    if (this.held.delete(event.action.id) || inbox.active || command.active || pinChooser.pane) return;
    if (!settingsMenu.active) {
      strip.showIdle();
      settingsMenu.enter();
    } else if (settingsMenu.editing) {
      settingsMenu.done();
    } else {
      settingsMenu.begin(await deck.get());
    }
  }

  private handleHold(): void {
    if (!settingsMenu.active) return;
    settingsMenu.exit();
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
  const storedSettings = await deck.get();
  const settings = settingsMenu.draft ?? storedSettings;
  if (transientDialFeedback.has(action.id)) return;
  const snapshot = herdr.snapshot;
  const baseline = { image: themedLogoImage() };
  let view: StripView;
  if (settingsMenu.active) {
    view = {
      kind: "settings",
      editing: settingsMenu.editing,
      name: settingNames[settingsMenu.index],
      value: settingValue(settings, settingsMenu.index),
      position: `${settingsMenu.index + 1}/${settingNames.length}`
    };
  } else if (inbox.active) {
    const queue = attentionPanes(snapshot);
    const pane = selectedAttentionPane() ?? queue[0];
    const index = pane ? queue.findIndex((item) => item.pane_id === pane.pane_id) : -1;
    view = pane
      ? {
          kind: "attention",
          label: paneIdentity(pane, snapshot, "BLOCKED").primary,
          position: `${index + 1} / ${queue.length}`,
          focused: pane.pane_id === snapshot?.focused_pane_id
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
      slots: page.pins.map((pin) => pin
        ? resolvePin(pin, snapshot)?.agent_status ?? "offline"
        : null),
      ...baseline
    };
  } else if (strip.takeover === "recent") {
    const panes = recent.panes(snapshot);
    const pane = panes.find((pane) => pane.pane_id === strip.recentPaneId);
    const identity = paneIdentity(pane, snapshot, "THREAD");
    view = pane
      ? { kind: "recent", label: identity.primary, context: identity.context, position: `${panes.indexOf(pane) + 1} / ${panes.length}` }
      : { kind: "idle", ...baseline, page: settings.pages[settings.pageIndex].name, label: "NO THREAD", status: snapshot ? "idle" : "offline", frame: strip.idleFrame };
  } else {
    const focused = currentPane(snapshot?.panes ?? [], snapshot?.focused_pane_id);
    const page = settings.pages[settings.pageIndex];
    view = {
      kind: "idle",
      ...baseline,
      page: page.name,
      label: focused ? paneIdentity(focused, snapshot, focused.pane_id).primary : "NO THREAD",
      status: focused?.agent_status ?? (snapshot ? "idle" : "offline"),
      frame: strip.idleFrame,
      sheepFrame: strip.sheepFrame ?? undefined,
      sheepBaas: strip.sheepBaas
    };
  }
  view.timeout = activeTimeoutProgress();
  return action.setFeedback({ "full-canvas": svgImage(stripRegionSvg(region, view, herdr.theme)) });
}

function activeTimeoutProgress(): number {
  const expiresAt = settingsMenu.active
    ? settingsMenu.expiresAt
    : inbox.active
      ? inbox.expiresAt
      : strip.takeover
        ? strip.expiresAt
        : 0;
  return expiresAt ? Math.max(0, Math.min(1, 1 - (expiresAt - Date.now()) / LCD_TIMEOUT_BAR_MS)) : 0;
}

function settingValue(settings: DeckSettings, index: number): string {
  if (index === 0) return `${(settings.motionSpeed / MOTION_BASE_SPEED).toFixed(1)}×`;
  if (index === 1) return motionVariants.find((variant) => variant.id === settings.workingMotion)?.name ?? "DARK";
  if (index === 2) return `${settings.motionWidth.toFixed(1)}×`;
  if (index === 3) return `${Math.round(settings.motionIntensity * 100)}%`;
  return settings.focusFeedback ? "ON" : "OFF";
}

function adjustSetting(settings: DeckSettings, index: number, ticks: number): void {
  if (index === 0) {
    settings.motionSpeed = adjustMotionSpeed(settings.motionSpeed, ticks);
  } else if (index === 1) {
    const current = motionVariants.findIndex((variant) => variant.id === settings.workingMotion);
    settings.workingMotion = motionVariants[wrappedIndex(Math.max(0, current), ticks, motionVariants.length)].id;
  } else if (index === 2) {
    settings.motionWidth = adjustMotionScale(settings.motionWidth, ticks);
  } else if (index === 3) {
    settings.motionIntensity = adjustMotionScale(settings.motionIntensity, ticks);
  } else if (ticks) {
    settings.focusFeedback = ticks > 0;
  }
}

function closeSettings(): void {
  settingsMenu.exit();
}

function queueSettingsSave(settings: DeckSettings): void {
  pendingSettingsSave = settings;
  settingsSaveTask ??= flushSettingsSaves();
}

async function flushSettingsSaves(): Promise<void> {
  try {
    while (pendingSettingsSave) {
      const settings = pendingSettingsSave;
      pendingSettingsSave = null;
      await saveSettings(settings);
    }
  } catch (error) {
    pendingSettingsSave = null;
    streamDeck.logger.error(`Auto-saving settings failed: ${String(error)}`);
  } finally {
    settingsSaveTask = null;
  }
}

function saveSettings(draft: DeckSettings): Promise<void> {
  return deck.update((settings) => {
    settings.motionSpeed = draft.motionSpeed;
    settings.workingMotion = draft.workingMotion;
    settings.motionWidth = draft.motionWidth;
    settings.motionIntensity = draft.motionIntensity;
    settings.focusFeedback = draft.focusFeedback;
  });
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
    await renderKey(action, keySvg({ label, feedback: "success" }, herdr.theme));
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

function themedLogoImage(): string {
  const color = oledForeground(herdr.theme, "text");
  if (color !== cachedLogoColor) {
    cachedLogoColor = color;
    cachedLogoImage = svgImage(logoSvg.replace("currentColor", color));
  }
  return cachedLogoImage;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function logStartupState(): Promise<void> {
  const snapshot = herdr.snapshot;
  if (startupLogged || !snapshot) return;
  let settings: DeckSettings;
  try {
    settings = await deck.get();
  } catch (error) {
    streamDeck.logger.error(`Startup state unavailable: ${String(error)}`);
    return;
  }
  if (startupLogged) return;
  let pins = 0;
  let resolved = 0;
  for (const page of settings.pages) {
    for (const pin of page.pins) {
      if (!pin) continue;
      pins++;
      if (resolvePin(pin, snapshot)) resolved++;
    }
  }
  startupLogged = true;
  streamDeck.logger.info(
    `Startup state: pins=${pins} panes=${snapshot.panes.length} resolved=${resolved} page=${settings.pageIndex + 1}`
  );
}

async function replayDeck(reason: string): Promise<void> {
  try {
    await deck.reload();
    streamDeck.logger.info(`Deck state reloaded after ${reason}`);
  } catch (error) {
    streamDeck.logger.error(`Deck state reload failed after ${reason}: ${String(error)}`);
  } finally {
    herdr.replay();
  }
}

streamDeck.logger.setLevel("info");
streamDeck.devices.onDeviceDidConnect(() => void replayDeck("device connect"));
streamDeck.system.onSystemDidWakeUp(() => void replayDeck("system wake"));
streamDeck.actions.registerAction(new PinnedThreadAction());
streamDeck.actions.registerAction(new AttentionAction());
streamDeck.actions.registerAction(new CommandAction());
streamDeck.actions.registerAction(new PagesDialAction());
streamDeck.actions.registerAction(new AttentionDialAction());
streamDeck.actions.registerAction(new DisplayDialAction());
streamDeck.actions.registerAction(new AnswerDialAction());
streamDeck.connect();
herdr.start();
