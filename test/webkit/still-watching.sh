#!/bin/sh
# Prüft den "Schaust du noch?"-Klickpfad für Netflix und Disney+ in WebKits
# isolierter Welt mit einer echten Tonspur als Video und nachgebauten Dialogen.
set -e
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
say -r 90 -o "$tmp/clip.aiff" "$(python3 -c 'print("Schlummer Test. "*40)')"
afconvert -f m4af -d aac -b 32000 "$tmp/clip.aiff" "$tmp/clip.m4a"
base64 -i "$tmp/clip.m4a" -o "$tmp/clip.b64"
for m in netflix disney; do
  echo "== $m =="
  xcrun swift test/webkit/harness-still.swift dist/schlummer.user.js "$m" "$tmp/clip.b64" 2>&1 | grep -E "ohne Sitzung|mit Sitzung|timeout|error:"
done
rm -rf "$tmp"
