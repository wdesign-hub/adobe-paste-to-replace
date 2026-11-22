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
ai_found=$found
[ $found -eq 1 ] || echo "  – No Illustrator Scripts folder found in $APPS_DIR"

echo "InDesign:"
found=0
for dir in "$PREFS_DIR"/Adobe\ InDesign/Version*/*/Scripts/Scripts\ Panel; do
  [ -d "$dir" ] || continue
  found=1
  copy_to "$ID_FILE" "$dir"
done
[ $found -eq 1 ] || echo "  – No InDesign Scripts Panel folder found (launch InDesign once, then run this again)"

# --- Illustrator keyboard shortcut (macOS App Shortcut) ---------------------
# Illustrator can't bind shortcuts to scripts itself, but every script is a
# menu item (File › Scripts › PasteToReplace_Illustrator), so a macOS App
# Shortcut works. "@$r" = Cmd + Shift + R. Skip with: bash install.sh --no-shortcut
shortcut_set=0
if [ "${1:-}" != "--no-shortcut" ] && [ $ai_found -eq 1 ]; then
  echo "Illustrator shortcut:"
  bundles=""
  for app in "$APPS_DIR"/Adobe\ Illustrator*/Adobe\ Illustrator*.app; do
    id="$(defaults read "$app/Contents/Info" CFBundleIdentifier 2>/dev/null)"
    [ -n "$id" ] && bundles="$bundles $id"
  done
  [ -n "$bundles" ] || bundles="com.adobe.illustrator"
  for id in $(printf '%s\n' $bundles | sort -u); do
    if defaults write "$id" NSUserKeyEquivalents -dict-add "PasteToReplace_Illustrator" '@$r'; then
      echo "  ✓ Shift + Cmd + R → PasteToReplace_Illustrator ($id)"
      shortcut_set=1
    else
      echo "  ✗ Could not set the shortcut for $id" >&2
    fi
  done
fi

echo
if [ $installed -gt 0 ]; then
  echo "Done: $installed file(s) installed."
  echo "Illustrator: restart it, then File › Scripts › PasteToReplace_Illustrator"
  [ $shortcut_set -eq 1 ] && echo "             (Shift + Cmd + R is shown next to it after the restart)"
  echo "InDesign:    Window › Utilities › Scripts › User › PasteToReplace_InDesign.jsx"
  echo "             Shortcut: Edit › Keyboard Shortcuts › New Set… › Product Area: Scripts"
  echo "             › PasteToReplace_InDesign.jsx › press Shift + Cmd + R › Context: Default › Assign"
else
  echo "Nothing was installed." >&2
  exit 1
fi
