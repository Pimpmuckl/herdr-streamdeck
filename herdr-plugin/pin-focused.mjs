import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const paneId = process.env.HERDR_PANE_ID;
if (!paneId) throw new Error("Herdr did not provide a focused pane");

const directory = join(process.env.LOCALAPPDATA || tmpdir(), "Herdr Stream Deck");
const request = join(directory, "pin-request.json");
const temporary = `${request}.${process.pid}.tmp`;
await mkdir(directory, { recursive: true });
await writeFile(temporary, JSON.stringify({ paneId, requestedAt: new Date().toISOString() }), "utf8");
await rm(request, { force: true });
await rename(temporary, request);
