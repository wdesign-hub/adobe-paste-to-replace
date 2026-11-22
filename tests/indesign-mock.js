// Minimal in-memory model of the InDesign DOM, covering only what
// PasteToReplace_InDesign.jsx touches. Stacking: spread.items[0] is front-most.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let nextId = 100;

class PageItem {
  constructor(opts = {}) {
    this.id = nextId++;
    this.name = opts.name || "";
    this.locked = !!opts.locked;
    this.visible = opts.visible !== false;
    this.itemLayer = opts.layer || null;
    this._bounds = opts.bounds ? opts.bounds.slice() : [0, 0, 0, 0]; // [t, l, b, r]
    this.parent = null;
    this.content = null; // for frames holding an image
  }
  get geometricBounds() { return this._bounds.slice(); }
  _detach() {
    if (!this.parent) return;
    const arr = this.parent.items;
    arr.splice(arr.indexOf(this), 1);
    this.parent = null;
  }
  remove() { this._detach(); this.removed = true; }
  _clone() {
    const C = this.constructor;
    const c = new C({ name: this.name, layer: this.itemLayer, bounds: this._bounds });
    return c;
  }
  duplicate(to) {
    if (!(to instanceof Spread)) throw new Error("mock: duplicate expects a Spread");
    const c = this._clone();
    to.items.unshift(c); // front of spread (real InDesign: front of its layer)
    c.parent = to;
    return c;
  }
  bringToFront(ref) {
    if (ref.parent !== this.parent) throw new Error("Reference is on a different spread");
    if (ref.itemLayer !== this.itemLayer) throw new Error("Reference is on a different layer");
    this._detach();
    const arr = ref.parent.items;
    arr.splice(arr.indexOf(ref), 0, this);
    this.parent = ref.parent;
  }
  move(to, by) {
    if (to !== undefined) throw new Error("mock: only relative move supported");
    const [dx, dy] = by;
    this._shift(dx, dy);
  }
  _shift(dx, dy) {
    const b = this._bounds;
    this._bounds = [b[0] + dy, b[1] + dx, b[2] + dy, b[3] + dx];
  }
  _scaleAbout(cx, cy, s) {
    const b = this._bounds;
    this._bounds = [cy + (b[0] - cy) * s, cx + (b[1] - cx) * s, cy + (b[2] - cy) * s, cx + (b[3] - cx) * s];
  }
  transform(space, anchor, m) {
    if (space !== "PASTEBOARD_COORDINATES" || anchor !== "CENTER_ANCHOR") throw new Error("mock: bad transform args");
    if (m.horizontalScaleFactor !== m.verticalScaleFactor) throw new Error("mock: expected proportional scale");
    const g = this.geometricBounds;
    this._scaleAbout((g[1] + g[3]) / 2, (g[0] + g[2]) / 2, m.horizontalScaleFactor);
  }
}
class Rectangle extends PageItem {}
class TextFrame extends PageItem {}
class Oval extends PageItem {}

class Group extends PageItem {
  constructor(opts = {}) { super(opts); this.items = []; }
  get geometricBounds() {
    const bs = this.items.map((i) => i.geometricBounds);
    return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])),
            Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
  }
  _clone() {
    const g = new Group({ name: this.name, layer: this.itemLayer });
    for (const ch of this.items) { const c = ch._clone(); c.parent = g; g.items.push(c); }
    return g;
  }
  _shift(dx, dy) { for (const ch of this.items) ch._shift(dx, dy); }
  _scaleAbout(cx, cy, s) { for (const ch of this.items) ch._scaleAbout(cx, cy, s); }
  get groups() { return makeGroups(this); }
}

// Graphic content placed inside a frame (selected with Direct Selection).
class Image {
  constructor(frame) { this.parent = frame; this.geometricBounds = frame.geometricBounds; this.id = nextId++; }
  duplicate() { throw new Error("should not duplicate image content"); }
}
// Text selection: no geometricBounds.
class InsertionPoint { constructor() { this.index = 0; } }

class Layer {
  constructor(name, opts = {}) { this.name = name; this.locked = !!opts.locked; this.visible = opts.visible !== false; }
}

function makeGroups(container) {
  return {
    add(items) {
      const layers = new Set(items.map((i) => i.itemLayer));
      if (layers.size > 1) throw new Error("Grouped items must be on the same layer");
      // keep stacking order as found in the container
      const ordered = container.items.filter((i) => items.includes(i));
      const g = new Group({ layer: items[0].itemLayer });
      const idx = container.items.indexOf(ordered[0]);
      for (const it of ordered) it._detach();
      container.items.splice(idx, 0, g);
      g.parent = container;
      for (const it of ordered) { it.parent = g; g.items.push(it); }
      return g;
    },
  };
}

class Spread {
  constructor(name) { this.name = name; this.items = []; }
  add(item) { item.parent = this; this.items.push(item); return item; } // push = further back
  get groups() { return makeGroups(this); }
}
class LayoutWindow {}
class StoryWindow {}

function makeInDesign() {
  const alerts = [];
  const doScriptCalls = [];
  const doc = {
    layers: [],
    spreads: [],
    activeLayer: null,
    viewPreferences: { rulerOrigin: "PAGE_ORIGIN" },
    _zero: [12, 34],
    get zeroPoint() { return this._zero; },
    set zeroPoint(v) { this._zero = Array.from(v); },
  };
  const app = {
    documents: { length: 1 },
    activeDocument: doc,
    activeWindow: new LayoutWindow(),
    selection: [],
    clipboard: [],      // prototypes cloned by paste()
    pasteThrowsWhenEmpty: true,
    select(x) {
      if (x === "NOTHING") this.selection = [];
      else this.selection = Array.isArray(x) ? Array.from(x) : [x];
    },
    paste() {
      if (!this.clipboard.length) {
        if (this.pasteThrowsWhenEmpty) throw new Error("Cannot paste: the clipboard is empty");
        return;
      }
      const layer = doc.activeLayer;
      if (layer.locked || !layer.visible) throw new Error("Cannot paste onto a locked layer");
      // "Paste remembers layers" off: everything goes to the active layer, active spread
      const spread = doc.spreads[0];
      const pasted = this.clipboard.map((p) => { const c = p._clone(); c.itemLayer = layer; return c; });
      for (let i = pasted.length - 1; i >= 0; i--) { pasted[i].parent = spread; spread.items.unshift(pasted[i]); }
      this.selection = pasted;
    },
    doScript(fn, lang, args, undoMode, name) {
      doScriptCalls.push({ lang, undoMode, name });
      fn();
    },
    transformationMatrices: { add(props) { return Object.assign({}, props); } },
  };
  const context = {
    app,
    alert: (msg) => alerts.push(String(msg)),
    NothingEnum: { NOTHING: "NOTHING" },
    ScriptLanguage: { JAVASCRIPT: "JAVASCRIPT" },
    UndoModes: { ENTIRE_SCRIPT: "ENTIRE_SCRIPT" },
    CoordinateSpaces: { PASTEBOARD_COORDINATES: "PASTEBOARD_COORDINATES" },
    AnchorPoint: { CENTER_ANCHOR: "CENTER_ANCHOR" },
    RulerOrigin: { SPREAD_ORIGIN: "SPREAD_ORIGIN" },
    Math, isFinite, NaN,
  };
  return { app, doc, alerts, doScriptCalls, context };
}

function runScript(ctx, overrides = {}) {
  let src = fs.readFileSync(path.join(__dirname, "..", "PasteToReplace_InDesign.jsx"), "utf8");
  if (overrides.scaleToFit) src = src.replace("var scaleToFit = false;", "var scaleToFit = true;");
  vm.runInNewContext(src, ctx.context);
}

module.exports = {
  makeInDesign, runScript,
  Rectangle, TextFrame, Oval, Group, Image, InsertionPoint, Layer, Spread, LayoutWindow, StoryWindow,
};
