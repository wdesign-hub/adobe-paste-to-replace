# Paste to Replace for Illustrator & InDesign

A Figma-style **Paste to Replace** (`Shift + Cmd/Ctrl + R`) for Adobe Illustrator and Adobe InDesign. These are ExtendScript `.jsx` files and work in current versions of both apps.

Copy something, select one or more placeholders, run the script. Each placeholder is replaced by a copy of what's on your clipboard.

| File | App |
| --- | --- |
| `PasteToReplace_Illustrator.jsx` | Adobe Illustrator |
| `PasteToReplace_InDesign.jsx` | Adobe InDesign |

## What it does

1. Copy the replacement object or group (`Cmd/Ctrl + C`).
2. Select one or more placeholder objects.
3. Run the script.

For every selected placeholder:

- A copy of the clipboard contents is pasted and **centred** on the placeholder.
- It goes on the **same layer**, directly in front of the placeholder in the **stacking order**. In Illustrator it also stays inside the same group or clipping group.
- The placeholder is deleted.
- If you copied **several loose objects**, they're grouped first, so each placeholder gets the whole set.
- The new objects are left selected.
- **One `Cmd/Ctrl + Z` undoes the whole run.** InDesign uses `app.doScript(..., UndoModes.ENTIRE_SCRIPT)`. Illustrator keeps a script's changes in one undo step, and the script never calls `app.redraw()`, which would split it.

### Scale to fit (optional)

By default the replacement keeps its copied size. To scale each replacement proportionally to fit inside its placeholder's bounding box, open the `.jsx` file in any text editor and change the setting at the top. It scales both up and down.

```js
var scaleToFit = false;   // change to true
```

Illustrator has one more setting: `var scaleStrokes = true;` controls whether stroke weights and effects scale along with the artwork.

### Error handling

You get a clear alert when:

- no document is open, or nothing is selected,
- you're editing text instead of selecting objects,
- the clipboard is empty or holds nothing the app can paste,
- some placeholders were skipped (locked, hidden, on a locked or hidden layer, etc.). The alert names each one and gives the reason. The others are still replaced.

## Installation

### Quick install (installer scripts)

Download or clone this repo. Quit Illustrator, then run the installer from the repo folder. It copies each script into every Illustrator and InDesign version and language it finds.

- **macOS:** run this in Terminal from the repo folder. You may be asked for your password, because the Illustrator folder in `/Applications` can need admin rights.

  ```bash
  bash install.sh
  ```

  It also assigns **`Shift + Cmd + R`** to the Illustrator script through a macOS App Shortcut, which you'll see after restarting Illustrator. To skip that, run `bash install.sh --no-shortcut`. You still set the InDesign shortcut by hand, as described below.

- **Windows:** right-click `install.ps1` › **Run with PowerShell**, or run the command below. Writing to `Program Files` needs an **Administrator** PowerShell.

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\install.ps1
  ```

InDesign creates its Scripts folder the first time it starts, so launch it once before installing.

To install by hand instead, follow the steps below.

### Illustrator

1. Quit Illustrator.
2. Copy `PasteToReplace_Illustrator.jsx` into the Scripts folder:
   - **macOS:** `/Applications/Adobe Illustrator 2026/Presets.localized/<language>/Scripts/` (for example `en_US`)
   - **Windows:** `C:\Program Files\Adobe\Adobe Illustrator 2026\Presets\<language>\Scripts\`

   Use your installed version's folder name.
3. Start Illustrator. The script is in **File › Scripts › PasteToReplace_Illustrator**.

To run a script once without installing it, use **File › Scripts › Other Script…** (`Cmd/Ctrl + F12`).

### InDesign

1. Open **Window › Utilities › Scripts**.
2. In the Scripts panel, right-click the **User** folder and choose **Reveal in Finder / Reveal in Explorer**.
3. Copy `PasteToReplace_InDesign.jsx` into that folder. It's normally:
   - **macOS:** `~/Library/Preferences/Adobe InDesign/Version <n>/<language>/Scripts/Scripts Panel/`
   - **Windows:** `%APPDATA%\Adobe\InDesign\Version <n>\<language>\Scripts\Scripts Panel\`
4. The script appears under **User** in the Scripts panel straight away. Double-click it to run.

## Assigning `Shift + Cmd/Ctrl + R`

### InDesign (built in)

1. **Edit › Keyboard Shortcuts…**
2. If the set is **[Default]**, click **New Set…** and give it a name. The default set can't be edited.
3. Set **Product Area** to **Scripts** and select `PasteToReplace_InDesign.jsx`.
4. Click in **New Shortcut** and press `Shift + Cmd + R` (macOS) or `Shift + Ctrl + R` (Windows).
5. Set **Context** to **Default**, click **Assign**, then **OK**.

InDesign will say the keys are already used by *Align Right*, which is a text shortcut. If you'd rather keep that, pick another combination.

### Illustrator

Illustrator's Keyboard Shortcuts dialog doesn't list scripts. Use one of these options:

**macOS (recommended): App Shortcuts.** This works because every script is a menu item.

1. Open **System Settings › Keyboard › Keyboard Shortcuts… › App Shortcuts** and click **+**.
2. Set **Application** to Adobe Illustrator.
3. Set **Menu Title** to `PasteToReplace_Illustrator`, exactly as it appears in File › Scripts.
4. Set **Keyboard Shortcut** to `Shift + Cmd + R`.
5. Restart Illustrator.

**Windows or macOS: an Action with a function key.**

1. In the **Actions** panel, create a new Action and give it a function key, for example `Shift + F5`. Actions can only use F-keys.
2. In the panel menu, choose **Insert Menu Item…**, then pick **File › Scripts › PasteToReplace_Illustrator**.
3. Stop recording.

Some Illustrator versions forget script menu items in actions after a restart. If that happens, re-insert the menu item.

**Windows, exact `Shift + Ctrl + R`:** use a hotkey tool such as AutoHotkey to send the menu path or the Action's F-key while Illustrator is active.

## Limitations

- **InDesign groups:** InDesign scripting can't add an item to an existing group. Placeholders *inside* a group are skipped and reported. Ungroup first, or select the whole group as the placeholder.
- **InDesign anchored / inline objects** and items pasted *inside* another frame are skipped.
- **Illustrator clipping paths** (the mask shape itself) are skipped. Select the clipping group instead.
- In InDesign, if you select an image with the Direct Selection tool, its **frame** is replaced.
- Locked or hidden objects, and objects on locked or hidden layers, are skipped.
- Centring and scaling use the **geometric bounds**, which exclude stroke width. For an Illustrator clipping group, the bounds come from its clipping path.

## Testing

Illustrator and InDesign can't run headless, so the repo checks the scripts in two ways:

- an **ES3 syntax check** (ExtendScript is an ES3 engine), and
- **behaviour tests** that run both `.jsx` files against small in-memory models of the Illustrator and InDesign object models. They cover selection handling, centring, scaling, layer and stacking order, grouping of multi-item clipboards, skipped items, error alerts, and the single undo step.

```bash
npm install
npm test
```

These tests check the script logic, not Adobe's own behaviour. Do a quick manual check in each app after installing.

## License

MIT
