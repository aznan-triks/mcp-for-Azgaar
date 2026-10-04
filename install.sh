#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org, then run ./install.sh again."
  exit 1
fi
npm install --no-audit --no-fund && npm run setup
