# Inbox receipt contract

## Current surface

The Stream Deck adapter polls `herdr api snapshot` once per second
(`src/herdr.ts`) and derives Inbox items from panes whose `agent_status` is
`blocked` (`src/model.ts`). Inbox selection and cycling use only `pane_id`, and
the takeover can display only pane identity and queue position (`src/plugin.ts`).

Herdr already exposes unseen completion: `done` is an idle agent whose pane has
not been seen, and focusing the pane changes it to `idle`
(`C:/Code/herdr/src/app/api_helpers.rs`). Herdr also emits
`pane.agent_status_changed` with pane identity, status, and presentation fields
(`C:/Code/herdr/src/api/schema/events.rs`, `C:/Code/herdr/src/app/api.rs`). The
event has no stable receipt identity, structured question/options, explicit
agent error, resolution, or acknowledgement fields. `agent.prompt` accepts only
free text (`C:/Code/herdr/src/app/api/agents.rs`).

Therefore completion is observable today, questions are only coarsely visible
as `blocked`, and explicit errors are absent. Question and error support must not
be inferred from terminal output.

## Minimum Herdr contract

Add current open receipts to `session.snapshot` and emit the complete record as
`attention.receipt_changed` whenever it changes:

```json
{
  "id": "opaque-stable-receipt-id",
  "type": "question | error | completion",
  "pane_id": "w1:p1",
  "display_text": "short Herdr-owned text",
  "options": [{"id": "opaque-stable-option-id", "label": "visible answer"}],
  "state": "open | resolved",
  "acknowledged": false,
  "created_seq": 42
}
```

- `id` is immutable for one logical receipt and changes for a new receipt in
  the same pane. `pane_id` routes to the thread but is not receipt identity.
- `options` exists only for questions. Answers use stable receipt and option
  IDs, never labels or positions.
- `display_text` is presentation-safe text supplied by Herdr or its native
  agent integration. The Stream Deck plugin never reads terminal text.
- `state` and `acknowledged` are authoritative. Resolved or acknowledged items
  leave the active queue after the corresponding full-record update.
- `created_seq` only needs to be monotonic within one running Herdr session.

Add two fail-closed operations:

- `attention.answer(receipt_id, option_id)` atomically rejects a missing,
  changed, or resolved question.
- `attention.acknowledge(receipt_id)` idempotently acknowledges an error or
  completion. Herdr may map completion acknowledgement to its existing pane
  `seen` transition internally.

No transcript, receipt history, timestamps, severity taxonomy, pagination API,
or plugin-side persistence is needed.

## Inbox behavior

Count every open, unacknowledged receipt on the existing Inbox key. Sort by
`question`, `error`, then `completion`; within each type sort by `created_seq`
ascending and then `id`. Inbox taps and Dial 1 wrap through that one list.
Preserve selection by receipt `id`; when it leaves the queue, select the item at
the same index and wrap if needed. Passive arrivals update the count only.

Opening a question focuses its pane but does not acknowledge it; answering
resolves it. Error and completion acknowledgement must be explicit through the
receipt operation so a preview cannot silently consume an item.

## Herdr-owned follow-ups

1. The agent integration layer must capture native question IDs, text, options,
   and resolution.
2. The API schema, snapshot, and event hub must own receipts, stable IDs,
   ordering, state, and acknowledgement.
3. The agent/API command surface must own atomic answer and acknowledge calls
   plus CLI wrappers.
4. Lifecycle policy must define which agent-native failures become explicit
   error receipts; generic CLI and plugin-command errors must not qualify.
5. Pane focus/seen handling must reconcile completion acknowledgement while
   keeping the receipt update observable.

Until those seams exist, structured questions and explicit errors are blocked.
Adding `done` panes alone would create a temporary second queue model, so no
Stream Deck runtime change is recommended.
