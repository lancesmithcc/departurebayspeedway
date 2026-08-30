#!/usr/bin/env bash
# redeploy.sh — pull and restart on lanc3lot-ressurection.
#
# The box serves the working tree straight off disk, so a deploy is a fetch and a
# bounce. Run it from anywhere:  ssh lanc3lot-ressurection 'bash -lc "~/apps/departurebayspeedway/tools/redeploy.sh"'
set -euo pipefail

APP=~/apps/departurebayspeedway
cd "$APP"

git fetch --depth 1 origin main
git reset --hard origin/main
echo "now at: $(git log --oneline -1)"

systemctl --user restart departurebayspeedway.service
sleep 2
systemctl --user is-active departurebayspeedway.service

# index.html is served no-cache, but the assets are held for a week by ETag, so a
# changed file is picked up on its next revalidation rather than needing a purge.
code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT:-8047}/")
echo "origin responds: $code"
[ "$code" = "200" ]
