#!/usr/bin/env bash
set -euo pipefail

CONNECTOR_ROOT="$1"
NODE_HOME="$HOME/.local/node-v22.14.0-linux-x64"
if [ ! -x "$NODE_HOME/bin/node" ]; then
	mkdir -p "$HOME/.local"
	curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz | tar -xJ -C "$HOME/.local"
fi
export PATH="$NODE_HOME/bin:$PATH"
export PUPPETEER_SKIP_DOWNLOAD=1
mkdir -p "$HOME/.local/bin"
if ! command -v jq >/dev/null 2>&1; then
	curl -fsSL https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 -o "$HOME/.local/bin/jq"
	chmod +x "$HOME/.local/bin/jq"
fi
export PATH="$HOME/.local/bin:$PATH"

cd "$CONNECTOR_ROOT"
if [ ! -d node_modules ]; then
	npm install --no-audit --no-fund
fi
./build.sh -p b -v 0.1.0
