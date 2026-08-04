#!/bin/sh
set -eu

root=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
source_plugin="$root/dev.herdr.streamdeck.sdPlugin"
herdr_path=$(command -v herdr)

if [ ! -f "$source_plugin/bin/plugin.js" ]; then
  echo "The prebuilt Stream Deck plugin is missing." >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    output="$root/dist"
    package="$output/herdr-streamdeck.streamDeckPlugin"
    staging=$(mktemp -d)
    trap 'rm -rf "$staging"' EXIT HUP INT TERM
    staged_plugin="$staging/dev.herdr.streamdeck.sdPlugin"
    mkdir -p "$output"
    cp -R "$source_plugin" "$staged_plugin"
    rm -rf "$staged_plugin/logs"
    printf '%s' "$herdr_path" > "$staged_plugin/herdr-path.txt"
    rm -f "$package"
    /usr/bin/ditto -c -k --keepParent "$staged_plugin" "$package"
    open "$package"
    echo "Opened the Stream Deck installer. Accept its install prompt to finish."
    ;;
  Linux)
    node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)
    if [ -z "$node_major" ] || [ "$node_major" -lt 20 ] 2>/dev/null; then
      echo "OpenDeck requires Node.js 20 or newer to run this plugin." >&2
      exit 1
    fi

    normal_root="${XDG_CONFIG_HOME:-$HOME/.config}/opendeck"
    flatpak_root="$HOME/.var/app/me.amankhanna.opendeck/config/opendeck"
    if command -v opendeck >/dev/null 2>&1; then
      opendeck_root="$normal_root"
    elif command -v flatpak >/dev/null 2>&1 && flatpak info me.amankhanna.opendeck >/dev/null 2>&1; then
      opendeck_root="$flatpak_root"
    elif [ -d "$normal_root" ]; then
      opendeck_root="$normal_root"
    elif [ -d "$flatpak_root" ]; then
      opendeck_root="$flatpak_root"
    else
      echo "Install and launch OpenDeck once, then rerun this command." >&2
      echo "https://github.com/nekename/OpenDeck" >&2
      exit 1
    fi

    target="$opendeck_root/plugins/dev.herdr.streamdeck.sdPlugin"
    mkdir -p "$target"
    cp -R "$source_plugin/." "$target/"
    printf '%s' "$herdr_path" > "$target/herdr-path.txt"
    echo "Installed Herdr for OpenDeck. Restart OpenDeck to load it."
    ;;
  *)
    echo "Unsupported operating system: $(uname -s)" >&2
    exit 1
    ;;
esac
