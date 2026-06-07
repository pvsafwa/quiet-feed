#!/bin/bash
# Quiet Feed launcher (macOS) — serves the pre-built app on localhost so YouTube playback + tracking work.
cd "$(dirname "$0")/app"
PORT=8000
BASE="http://localhost:${PORT}/"
URL="${BASE}?v=$(date +%s)"   # changing tag each launch defeats browser caching
clear
echo "──────────────────────────────────────────────"
echo "   Quiet Feed"
echo "   Opening ${BASE}"
echo ""
echo "   • Keep this window OPEN while you watch."
echo "   • To stop: close this window or press Control-C."
echo "──────────────────────────────────────────────"
echo ""
( sleep 1; open "${URL}" ) &
if ruby -e 'exit' >/dev/null 2>&1; then
  ruby -run -e httpd . -p "${PORT}"
elif python3 -c 'pass' >/dev/null 2>&1; then
  python3 -m http.server "${PORT}"
else
  echo "Couldn't find Ruby or Python to run the local server."
  echo "Install Python from https://www.python.org/downloads/macos/ then double-click this again."
  read -n 1 -s -r -p "Press any key to close this window."
fi
