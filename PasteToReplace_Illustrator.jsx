//@target illustrator
/*
 * PasteToReplace_Illustrator.jsx
 * ------------------------------------------------------------------
 * Figma-style "Paste to Replace" for Adobe Illustrator.
 *
 * HOW TO USE
 *   1. Copy the replacement artwork (Cmd/Ctrl + C). One object, a group,
 *      or several loose objects (they get grouped automatically).
 *   2. Select one or more placeholder objects in the document.
 *   3. Run this script.
 *
 * Each selected placeholder is replaced by a copy of the clipboard contents:
 *   - centred on the placeholder,
 *   - on the same layer / inside the same group, at the same stacking order,
 *   - optionally scaled proportionally to fit the placeholder (scaleToFit).
 * The new objects are left selected. One Cmd/Ctrl + Z undoes the whole run.
 *
 * NOTE: This script deliberately never calls app.redraw(), because every
 * redraw creates a separate undo step in Illustrator.
 * ------------------------------------------------------------------
 */

(function () {

    // =================== SETTINGS ===================

    // false = keep the replacement at its original copied size (default).
    // true  = scale the replacement proportionally (up OR down) so it fits
    //         inside the placeholder's bounding box.
    var scaleToFit = false;

    // Only used when scaleToFit = true:
    // true = stroke weights and effects are scaled together with the artwork.
    var scaleStrokes = true;

    // ================================================

    var SCRIPT_NAME = "Paste to Replace";

    // ---------- helpers ----------

    // Bounds as [left, top, right, bottom]. For clipping groups we use the
    // clipping path, because geometricBounds would include hidden artwork.
    function getBounds(item) {
        try {
            if (item.typename === "GroupItem" && item.clipped) {
                var clip = findClipPath(item);
                if (clip) { return clip.geometricBounds; }
            }
        } catch (e) { /* fall through */ }
        return item.geometricBounds;
    }

    function findClipPath(group) {
        var items = group.pageItems, i, it;
        for (i = 0; i < items.length; i++) {
            it = items[i];
            if (it.typename === "PathItem" && it.clipping) { return it; }
            if (it.typename === "CompoundPathItem" &&
                    it.pathItems.length > 0 && it.pathItems[0].clipping) { return it; }
        }
        return null;
    }

    // Reason the item cannot be replaced, or "" if it can be.
    function whyNotReplaceable(item) {
        try {
            if (item.locked) { return "locked"; }
            if (item.hidden) { return "hidden"; }
            if (item.typename === "PathItem" && item.clipping) { return "is a clipping path"; }
            var p = item.parent;
            while (p && p.typename !== "Document") {
                if (p.typename === "Layer") {
                    if (p.locked) { return "on a locked layer"; }
                    if (!p.visible) { return "on a hidden layer"; }
                } else if (p.typename === "GroupItem") {
                    if (p.locked) { return "inside a locked group"; }
                    if (p.hidden) { return "inside a hidden group"; }
                }
                p = p.parent;
            }
        } catch (e) {
            return "could not be inspected (" + e.message + ")";
        }
        return "";
    }

    function describe(item) {
        var n = "";
        try { n = item.name; } catch (e) { /* ignore */ }
        return (n ? "\"" + n + "\"" : "unnamed") + " " + item.typename;
    }

    function toArray(sel) {
        var out = [], i;
        for (i = 0; i < sel.length; i++) { out.push(sel[i]); }
        return out;
    }

    // Combine several pasted items into one group, keeping their stacking order.
    function groupItems(doc, items) {
        if (items.length === 1) { return items[0]; }
        // Preferred: Illustrator's own Group command (exactly like Cmd/Ctrl + G).
        try {
            doc.selection = items;
            app.executeMenuCommand("group");
            var s = doc.selection;
            if (s && s.length === 1 && s[0].typename === "GroupItem") { return s[0]; }
        } catch (e) { /* fall back below */ }
        // Fallback: build the group manually. The selection is listed top-most
        // first, so appending each item to the end keeps the original order.
        var group = doc.groupItems.add(), i;
        for (i = 0; i < items.length; i++) {
            items[i].move(group, ElementPlacement.PLACEATEND);
        }
        return group;
    }

    // Scale (optional) and centre `item` on `target`.
    function fitAndCenter(item, target) {
        var tb = getBounds(target);
        var tw = tb[2] - tb[0], th = tb[1] - tb[3];

        if (scaleToFit) {
            var sb = getBounds(item);
            var sw = sb[2] - sb[0], sh = sb[1] - sb[3];
            var s = NaN;
            if (sw > 0 && sh > 0) { s = Math.min(tw / sw, th / sh); }
            else if (sw > 0) { s = tw / sw; }   // horizontal line
            else if (sh > 0) { s = th / sh; }   // vertical line
            if (isFinite(s) && s > 0 && Math.abs(s - 1) > 1e-6) {
                var pct = s * 100;
                item.resize(pct, pct, true, true, true, true,
                    scaleStrokes ? pct : 100, Transformation.CENTER);
            }
        }

        var b = getBounds(item);
        var dx = (tb[0] + tb[2]) / 2 - (b[0] + b[2]) / 2;
        var dy = (tb[1] + tb[3]) / 2 - (b[1] + b[3]) / 2;
        if (dx !== 0 || dy !== 0) { item.translate(dx, dy); }
    }

    // ---------- main ----------

    function main() {
        if (app.documents.length === 0) {
            alert("Open a document first.", SCRIPT_NAME);
            return;
        }
        var doc = app.activeDocument;
        var sel = doc.selection;

        // While editing text, selection is a TextRange, not an array of objects.
        if (sel && sel.typename === "TextRange") {
            alert("You are editing text.\n\nPress Esc, then select the placeholder objects with the Selection tool (V).", SCRIPT_NAME);
            return;
        }
        if (!sel || sel.length === 0) {
            alert("Nothing is selected.\n\n1. Copy the replacement artwork (Cmd/Ctrl + C).\n2. Select the placeholder object(s).\n3. Run the script again.", SCRIPT_NAME);
            return;
        }

        var targets = [], skipped = [], i, why;
        sel = toArray(sel);
        for (i = 0; i < sel.length; i++) {
            why = whyNotReplaceable(sel[i]);
            if (why) { skipped.push(describe(sel[i]) + ": " + why); }
            else { targets.push(sel[i]); }
        }
        if (targets.length === 0) {
            alert("None of the selected objects can be replaced:\n\n" + skipped.join("\n"), SCRIPT_NAME);
            return;
        }

        // Paste once, onto the (unlocked, visible) layer of the first target.
        var prevLayer = doc.activeLayer;
        try { doc.activeLayer = targets[0].layer; } catch (e) { /* keep current layer */ }
        doc.selection = null;

        var pasted = null;
        try {
            app.paste();
            pasted = doc.selection;
        } catch (e) {
            pasted = null;
        }
        if (!pasted || pasted.typename === "TextRange" || pasted.length === 0) {
            try { doc.activeLayer = prevLayer; } catch (e2) { /* ignore */ }
            try { doc.selection = sel; } catch (e3) { /* ignore */ }
            alert("The clipboard is empty or does not contain artwork Illustrator can paste.\n\nCopy the replacement object first (Cmd/Ctrl + C), then select the placeholders and run the script again.", SCRIPT_NAME);
            return;
        }

        var source = groupItems(doc, toArray(pasted));

        // Replace each target with its own copy of the source.
        var created = [], failed = [], dup, t;
        for (i = 0; i < targets.length; i++) {
            t = targets[i];
            dup = null;
            try {
                // PLACEBEFORE = directly in front of the target, in the same
                // container (layer / group / clipping group).
                dup = source.duplicate(t, ElementPlacement.PLACEBEFORE);
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
        try { doc.selection = created.length ? created : null; } catch (e6) { /* ignore */ }

        var problems = skipped.concat(failed);
        if (problems.length) {
            alert("Replaced " + created.length + " of " + sel.length + " object(s).\n\nSkipped:\n" + problems.join("\n"), SCRIPT_NAME);
        }
    }

    try {
        main();
    } catch (err) {
        alert("Something went wrong:\n" + err.message + (err.line ? " (line " + err.line + ")" : ""), SCRIPT_NAME);
    }

}());
