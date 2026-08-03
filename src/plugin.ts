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
  commandIntent,
  type DeckSettings,
  normalizeSettings,
  type PaneSnapshot,
  paneIdentity,
  paneLabel,
  resolvePin,
  slotForCoordinates,
  wrappedIndex
} from "./model.js";
import { currentPane, dialSvg, keySvg } from "./render.js";

const HOLD_MS = 650;
const herdr = new HerdrBridge();

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
  private readonly listeners = new Set<Listener>();

  open(paneId: string | null): void {
    this.active = true;
    this.paneId = paneId;
    this.emit();
  }

  cancel(): void {
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

const deck = new DeckStore();
const command = new CommandState();
const pinChooser = new PinChooserState();
const inbox = new InboxState();
herdr.subscribePinRequests((pane) => {
  inbox.cancel();
  pinChooser.enter(pane);
});

@action({ UUID: "dev.herdr.streamdeck.pin" })
class PinnedThreadAction extends SingletonAction {
  private readonly downAt = new Map<string, number>();

  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    command.subscribe(() => void this.renderAll());
    pinChooser.subscribe(() => void this.renderAll());
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
        if (await this.pinSelected(slot)) await event.action.showOk();
        else await event.action.showAlert();
      } else if (command.active) {
        if (await this.runCommand(slot, event.action)) {
          await renderKey(event.action, keySvg({ label: "SENT", context: "COMMAND", detail: "DELIVERED", slot, status: "done" }, herdr.theme));
          await delay(400);
          command.cancel();
        }
      } else if (Date.now() - started >= HOLD_MS) {
        if (await this.togglePin(slot)) await event.action.showOk();
        else await event.action.showAlert();
      } else {
        const settings = await deck.get();
        const pin = settings.pages[settings.pageIndex].pins[slot];
        if (!pin) {
          if (await this.togglePin(slot)) await event.action.showOk();
          else await event.action.showAlert();
          return;
        }
        const pane = resolvePin(pin, herdr.snapshot);
        if (!pane) return event.action.showAlert();
        await herdr.focusPane(pane.pane_id);
      }
    } catch (error) {
      streamDeck.logger.error(`Pinned thread action failed: ${String(error)}`);
      if (command.active) {
        await renderKey(event.action, keySvg({ label: "FAILED", context: "COMMAND", detail: "NOT SENT", slot, danger: true }, herdr.theme));
        await delay(600);
        await this.render(event.action);
        return;
      }
      await event.action.showAlert();
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

  private async togglePin(slot: number): Promise<boolean> {
    const focused = herdr.snapshot?.panes.find((pane) => pane.pane_id === herdr.snapshot?.focused_pane_id);
    const settings = await deck.get();
    if (!settings.pages[settings.pageIndex].pins[slot] && !focused) return false;
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
    return true;
  }

  private async runCommand(slot: number, action: KeyAction): Promise<boolean> {
    const paneId = command.targetPaneId;
    if (!paneId) {
      await action.showAlert();
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
        await action.showAlert();
        return false;
    }
  }

  private async render(action: KeyAction): Promise<void> {
    const slot = keySlot(action);
    if (slot === null) return;
    const theme = herdr.theme;
    const settings = await deck.get();
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
    return renderKey(action, keySvg({
      label: identity.primary,
      context: identity.context,
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
    if (duration >= HOLD_MS) return event.action.showAlert();
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
      await event.action.showAlert();
    }
  }

  private render(action: KeyAction): Promise<void> {
    const theme = herdr.theme;
    const count = attentionPanes(herdr.snapshot).length;
    return renderKey(action, keySvg({
      label: "INBOX",
      detail: count ? `${count} NEED YOU` : "ALL CLEAR",
      status: count ? "blocked" : "idle",
      selected: inbox.active
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
    if (!pane || pane.agent_status === "blocked") return event.action.showAlert();
    inbox.cancel();
    command.enter(pane.pane_id, paneIdentity(pane, herdr.snapshot, pane.pane_id).primary);
  }

  private render(action: KeyAction): Promise<void> {
    const theme = herdr.theme;
    if (pinChooser.pane) {
      const identity = paneIdentity(pinChooser.pane, herdr.snapshot, pinChooser.pane.pane_id);
      return renderKey(action, keySvg({ label: "CANCEL", context: "PIN MODE", detail: identity.primary }, theme));
    }
    if (inbox.active) return renderKey(action, keySvg({ label: "BACK", context: "INBOX", detail: "RETURN" }, theme));
    if (command.active) return renderKey(action, keySvg({ label: "CANCEL", context: "COMMAND", detail: command.targetLabel }, theme));
    const pane = currentPane(herdr.snapshot?.panes ?? [], herdr.snapshot?.focused_pane_id);
    const available = pane && pane.agent_status !== "blocked";
    return renderKey(action, keySvg({ label: "COMMAND", detail: available ? "TAP ACTIONS" : "NO TARGET" }, theme));
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isKey() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.pages" })
class PagesDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    deck.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    if (inbox.active) return;
    await deck.update((settings) => {
      settings.pageIndex = wrappedIndex(settings.pageIndex, event.payload.ticks, settings.pages.length);
    });
  }

  private async render(action: DialAction): Promise<void> {
    if (inbox.active) return renderInboxDial(action, 0);
    const theme = herdr.theme;
    const settings = await deck.get();
    await action.setFeedback({ "full-canvas": svgImage(dialSvg("PINNED PAGE", settings.pages[settings.pageIndex].name, theme, "accent")) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

@action({ UUID: "dev.herdr.streamdeck.attention-dial" })
class AttentionDialAction extends SingletonAction {
  constructor() {
    super();
    herdr.subscribe(() => void this.renderAll());
    inbox.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialRotate(event: DialRotateEvent): Promise<void> {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return;
    const current = queue.findIndex((pane) => pane.pane_id === inbox.paneId);
    const start = current >= 0 ? current : event.payload.ticks > 0 ? -1 : 0;
    inbox.open(queue[wrappedIndex(start, event.payload.ticks, queue.length)].pane_id);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const queue = attentionPanes(herdr.snapshot);
    if (!queue.length) return event.action.showAlert();
    const pane = selectedAttentionPane() ?? queue[0];
    try {
      inbox.open(pane.pane_id);
      await herdr.focusPane(pane.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Attention dial failed: ${String(error)}`);
      await event.action.showAlert();
    }
  }

  private render(action: DialAction): Promise<void> {
    if (inbox.active) return renderInboxDial(action, 1);
    const theme = herdr.theme;
    const queue = attentionPanes(herdr.snapshot);
    const pane = queue[0];
    const value = queue.length ? paneIdentity(pane, herdr.snapshot, "BLOCKED").primary : "CLEAR";
    return action.setFeedback({ "full-canvas": svgImage(dialSvg(`ATTENTION ${queue.length}`, value, theme, queue.length ? "yellow" : "overlay0")) });
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
    inbox.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  private render(action: DialAction): Promise<void> {
    if (inbox.active) return renderInboxDial(action, 2);
    const theme = herdr.theme;
    const snapshot = herdr.snapshot;
    if (command.active) {
      return action.setFeedback({ "full-canvas": svgImage(dialSvg("COMMAND TARGET", command.targetLabel, theme, "accent")) });
    }
    const pane = currentPane(snapshot?.panes ?? [], snapshot?.focused_pane_id);
    return action.setFeedback({ "full-canvas": svgImage(dialSvg(pane ? "CURRENT · LIVE" : "CURRENT", paneIdentity(pane, snapshot, "HERDR OFFLINE").primary, theme, pane?.agent_status === "working" ? "blue" : "accent")) });
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
    inbox.subscribe(() => void this.renderAll());
  }

  override onWillAppear(event: WillAppearEvent): Promise<void> | void {
    if (event.action.isDial()) return this.render(event.action);
  }

  override async onDialDown(event: DialDownEvent): Promise<void> {
    const blocked = selectedAttentionPane() ?? attentionPanes(herdr.snapshot)[0];
    if (!blocked) return event.action.showAlert();
    try {
      await herdr.focusPane(blocked.pane_id);
    } catch (error) {
      streamDeck.logger.error(`Answer dial failed: ${String(error)}`);
      await event.action.showAlert();
    }
  }

  private render(action: DialAction): Promise<void> {
    if (inbox.active) return renderInboxDial(action, 3);
    const theme = herdr.theme;
    const blocked = attentionPanes(herdr.snapshot)[0];
    return action.setFeedback({ "full-canvas": svgImage(dialSvg(blocked ? "QUESTION" : "QUICK SELECT", blocked ? "FOCUS IN HERDR" : "NO QUESTION", theme, blocked ? "yellow" : "overlay0")) });
  }

  private async renderAll(): Promise<void> {
    await Promise.all(this.actions.toArray().flatMap((item) => item.isDial() ? [this.render(item)] : []));
  }
}

function selectedAttentionPane(): PaneSnapshot | undefined {
  return attentionPanes(herdr.snapshot).find((pane) => pane.pane_id === inbox.paneId);
}

function renderInboxDial(action: DialAction, region: number): Promise<void> {
  const queue = attentionPanes(herdr.snapshot);
  const pane = selectedAttentionPane() ?? queue[0];
  const index = pane ? queue.findIndex((item) => item.pane_id === pane.pane_id) : -1;
  const identity = paneIdentity(pane, herdr.snapshot, "BLOCKED").primary;
  const content = queue.length
    ? [["INBOX", `${index + 1} OF ${queue.length}`], ["THREAD", identity], ["NEEDS INPUT", "IN HERDR"], ["PRESS DIAL", "OPEN"]]
    : [["INBOX", "ALL CLEAR"], ["QUEUE", "EMPTY"], ["NO ACTION", "NEEDED"], ["COMMAND", "BACK"]];
  const [title, value] = content[region];
  return action.setFeedback({ "full-canvas": svgImage(dialSvg(title, value, herdr.theme, queue.length ? "yellow" : "overlay0")) });
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
