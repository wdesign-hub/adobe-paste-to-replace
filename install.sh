#!/bin/bash
# Installs the Paste to Replace scripts on macOS.
#   - Illustrator: every installed "Adobe Illustrator*" in /Applications, every language
#   - InDesign:    every InDesign version/language in your user Scripts Panel folder
#
# Usage (from this folder):   bash install.sh
# Quit Illustrator first (InDesign picks the script up without a restart).

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
AI_FILE="$HERE/PasteToReplace_Illustrator.jsx"
ID_FILE="$HERE/PasteToReplace_InDesign.jsx"
APPS_DIR="${PTR_APPS_DIR:-/Applications}"   # override only for testing
PREFS_DIR="${PTR_PREFS_DIR:-$HOME/Library/Preferences}"

for f in "$AI_FILE" "$ID_FILE"; do
  if [ ! -f "$f" ]; then
    echo "Missing $(basename "$f"). Run this script from the folder that contains both .jsx files." >&2
    exit 1
  fi
done

installed=0

copy_to() {  # copy_to <file> <dir>
  if cp "$1" "$2/" 2>/dev/null; then
    echo "  ✓ $2/$(basename "$1")"
    installed=$((installed + 1))
  else
    # The Illustrator folder in /Applications can need admin rights.
    echo "  Needs admin rights for: $2"
    if sudo cp "$1" "$2/"; then
      echo "  ✓ $2/$(basename "$1")"
      installed=$((installed + 1))
    else
      echo "  ✗ Could not copy to $2" >&2
    fi
  fi
}

shopt -s nullglob

echo "Illustrator:"
found=0
for dir in "$APPS_DIR"/Adobe\ Illustrator*/Presets*/*/Scripts; do
  [ -d "$dir" ] || continue
  found=1
  copy_to "$AI_FILE" "$dir"
done
[ $found -eq 1 ] || echo "  – No Illustrator Scripts folder found in $APPS_DIR"

echo "InDesign:"
found=0
for dir in "$PREFS_DIR"/Adobe\ InDesign/Version*/*/Scripts/Scripts\ Panel; do
  [ -d "$dir" ] || continue
  found=1
  copy_to "$ID_FILE" "$dir"
done
[ $found -eq 1 ] || echo "  – No InDesign Scripts Panel folder found (launch InDesign once, then run this again)"

echo
if [ $installed -gt 0 ]; then
  echo "Done: $installed file(s) installed."
  echo "Illustrator: restart it, then File › Scripts › PasteToReplace_Illustrator"
  echo "InDesign:    Window › Utilities › Scripts › User › PasteToReplace_InDesign.jsx"
  echo "Keyboard shortcut setup: see README.md"
else
  echo "Nothing was installed." >&2
  exit 1
fi
