//@target indesign
/*
 * PasteToReplace_InDesign.jsx
 * ------------------------------------------------------------------
 * Figma-style "Paste to Replace" for Adobe InDesign.
 *
 * HOW TO USE
 *   1. Copy the replacement object (Cmd/Ctrl + C). One object, a group,
 *      or several loose objects (they get grouped automatically).
 *   2. Select one or more placeholder frames/objects in the layout.
 *   3. Run this script.
 *
 * Each selected placeholder is replaced by a copy of the clipboard contents:
 *   - centred on the placeholder,
 *   - on the same layer and spread, directly in front of where the
 *     placeholder was in the stacking order,
 *   - optionally scaled proportionally to fit the placeholder (scaleToFit).
 * The new objects are left selected. The whole run is ONE undo step
 * ("Undo Paste to Replace").
 * ------------------------------------------------------------------
 */

(function () {

    // =================== SETTINGS ===================

    // false = keep the replacement at its original copied size (default).
    // true  = scale the replacement proportionally (up OR down) so it fits
    //         inside the placeholder's bounding box.
    var scaleToFit = false;

    // ================================================

    var SCRIPT_NAME = "Paste to Replace";

    // Content types that live inside a frame. If one is selected with the
    // Direct Selection tool, we replace its frame instead.
    var FRAME_CONTENT = {
        "Image": 1, "EPS": 1, "PDF": 1, "PICT": 1, "WMF": 1,
        "ImportedPage": 1, "SVG": 1, "Graphic": 1, "Movie": 1, "Sound": 1
    };

    // ---------- helpers ----------

    function ctorName(obj) {
        try { return obj.constructor.name; } catch (e) { return ""; }
    }

    function isPageItem(obj) {
        try {
            return obj.geometricBounds !== undefined && typeof obj.duplicate === "function";
        } catch (e) {
            return false;
        }
    }

    function describe(item) {
        var n = "";
        try { n = item.name; } catch (e) { /* ignore */ }
        return (n ? "\"" + n + "\"" : "unnamed") + " " + ctorName(item);
    }

    // Reason the item cannot be replaced, or "" if it can be.
    function whyNotReplaceable(item) {
        try {
            if (item.locked) { return "locked"; }
            if (item.visible === false) { return "hidden"; }
            var layer = item.itemLayer;
            if (layer.locked) { return "on a locked layer"; }
            if (!layer.visible) { return "on a hidden layer"; }
            var p = ctorName(item.parent);
            if (p === "Group") {
                return "inside a group (InDesign scripting cannot add items to an existing group; ungroup it first)";
            }
            if (p !== "Spread" && p !== "MasterSpread") {
                return "anchored in text or pasted inside another frame";
            }
        } catch (e) {
            return "could not be inspected (" + e.message + ")";
        }
        return "";
    }

    // Move `item` (a whole page item) to the target's layer, spread and stacking slot.
    function placeInFrontOf(item, target) {
        item.itemLayer = target.itemLayer;
        item.bringToFront(target);
    }

    // Scale (optional) and centre `item` on `target`.
    // geometricBounds = [top, left, bottom, right], y grows downward.
    function fitAndCenter(item, target) {
        var tb = target.geometricBounds;
        var tw = tb[3] - tb[1], th = tb[2] - tb[0];

        if (scaleToFit) {
            var sb = item.geometricBounds;
            var sw = sb[3] - sb[1], sh = sb[2] - sb[0];
            var s = NaN;
            if (sw > 0 && sh > 0) { s = Math.min(tw / sw, th / sh); }
            else if (sw > 0) { s = tw / sw; }   // horizontal line
            else if (sh > 0) { s = th / sh; }   // vertical line
            if (isFinite(s) && s > 0 && Math.abs(s - 1) > 1e-6) {
                var m = app.transformationMatrices.add({
                    horizontalScaleFactor: s,
                    verticalScaleFactor: s
                });
                item.transform(CoordinateSpaces.PASTEBOARD_COORDINATES,
                    AnchorPoint.CENTER_ANCHOR, m);
            }
        }

        var b = item.geometricBounds;
        var dx = (tb[1] + tb[3]) / 2 - (b[1] + b[3]) / 2;
        var dy = (tb[0] + tb[2]) / 2 - (b[0] + b[2]) / 2;
        if (dx !== 0 || dy !== 0) { item.move(undefined, [dx, dy]); }
    }

    // ---------- main ----------

    function main() {
        var doc = app.activeDocument;
        var sel = app.selection;

        if (!sel || sel.length === 0) {
            alert("Nothing is selected.\n\n1. Copy the replacement object (Cmd/Ctrl + C).\n2. Select the placeholder frame(s).\n3. Run the script again.", SCRIPT_NAME);
            return;
        }

        // Normalise the selection into whole page items.
        var targets = [], skipped = [], seen = {}, i, it, why;
        for (i = 0; i < sel.length; i++) {
            it = sel[i];
            if (FRAME_CONTENT[ctorName(it)] && isPageItem(it.parent)) { it = it.parent; }
            if (!isPageItem(it)) {
                alert("You have text selected.\n\nPress Esc, then select the placeholder frame(s) with the Selection tool (V).", SCRIPT_NAME);
                return;
            }
            if (seen[it.id]) { continue; }
            seen[it.id] = true;
            why = whyNotReplaceable(it);
            if (why) { skipped.push(describe(it) + ": " + why); }
            else { targets.push(it); }
        }
        if (targets.length === 0) {
            alert("None of the selected objects can be replaced:\n\n" + skipped.join("\n"), SCRIPT_NAME);
            return;
        }

        // Paste once, onto the (unlocked, visible) layer of the first target.
        var prevLayer = doc.activeLayer;
        try { doc.activeLayer = targets[0].itemLayer; } catch (e) { /* keep current layer */ }
        app.select(NothingEnum.NOTHING);

        var pasted = null;
        try {
            app.paste();
            pasted = app.selection;
        } catch (e) {
            pasted = null;
        }
        var pastedItems = [];
        if (pasted) {
            for (i = 0; i < pasted.length; i++) {
                if (isPageItem(pasted[i])) { pastedItems.push(pasted[i]); }
            }
        }
        if (pastedItems.length === 0) {
            try { doc.activeLayer = prevLayer; } catch (e2) { /* ignore */ }
            try { app.select(targets); } catch (e3) { /* ignore */ }
            alert("The clipboard is empty or does not contain objects InDesign can paste.\n\nCopy the replacement object first (Cmd/Ctrl + C), then select the placeholders and run the script again.", SCRIPT_NAME);
            return;
        }

        // Several loose items: put them on one layer and group them
        // (groups.add keeps their stacking order).
        var source;
        if (pastedItems.length === 1) {
            source = pastedItems[0];
        } else {
            for (i = 1; i < pastedItems.length; i++) {
                pastedItems[i].itemLayer = pastedItems[0].itemLayer;
            }
            source = pastedItems[0].parent.groups.add(pastedItems);
        }

        // Replace each target with its own copy of the source.
        var created = [], failed = [], dup, t;
        for (i = 0; i < targets.length; i++) {
            t = targets[i];
            dup = null;
            try {
                dup = source.duplicate(t.parent);   // same spread (or master spread)
                placeInFrontOf(dup, t);
                fitAndCenter(dup, t);
                t.remove();
                created.push(dup);
            } catch (e) {
                if (dup) { try { dup.remove(); } catch (e4) { /* ignore */ } }
                failed.push(describe(t) + ": " + e.message);
            }
        }

        source.remove();
        try { doc.activeLayer = prevLayer; } catch (e5) { /* ignore */ }
        try { app.select(created.length ? created : NothingEnum.NOTHING); } catch (e6) { /* ignore */ }

        var problems = skipped.concat(failed);
        if (problems.length) {
            alert("Replaced " + created.length + " of " + (created.length + problems.length) + " object(s).\n\nSkipped:\n" + problems.join("\n"), SCRIPT_NAME);
        }
    }

    // Measure everything from the spread origin so bounds of items on
    // different pages are comparable, then restore the user's settings.
    function run() {
        var doc = app.activeDocument;
        var vp = doc.viewPreferences;
        var oldOrigin = vp.rulerOrigin;
        var oldZero = doc.zeroPoint;
        try {
            try { vp.rulerOrigin = RulerOrigin.SPREAD_ORIGIN; } catch (e3) { /* keep */ }
            try { doc.zeroPoint = [0, 0]; } catch (e4) { /* keep */ }
            main();
        } catch (err) {
            alert("Something went wrong:\n" + err.message + (err.line ? " (line " + err.line + ")" : ""), SCRIPT_NAME);
        } finally {
            try { vp.rulerOrigin = oldOrigin; } catch (e1) { /* ignore */ }
            try { doc.zeroPoint = oldZero; } catch (e2) { /* ignore */ }
        }
    }

    if (app.documents.length === 0) {
        alert("Open a document first.", SCRIPT_NAME);
        return;
    }
    if (ctorName(app.activeWindow) !== "LayoutWindow") {
        alert("Switch to the layout view (close the Story Editor) and try again.", SCRIPT_NAME);
        return;
    }

    // One undo step for everything.
    app.doScript(run, ScriptLanguage.JAVASCRIPT, undefined,
        UndoModes.ENTIRE_SCRIPT, SCRIPT_NAME);

}());
