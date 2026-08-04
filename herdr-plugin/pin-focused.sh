#!/bin/sh
set -eu

: "${HERDR_PANE_ID:?Herdr did not provide a focused pane}"

directory="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-streamdeck"
request="$directory/pin-request.json"
temporary="$request.$$.tmp"

mkdir -p "$directory"
trap 'rm -f "$temporary"' EXIT HUP INT TERM
printf '{"paneId":"%s","requestedAt":"%s"}' \
  "$HERDR_PANE_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$temporary"
mv -f "$temporary" "$request"
