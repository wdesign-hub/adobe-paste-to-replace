// Minimal in-memory model of the Illustrator DOM, covering only what
// PasteToReplace_Illustrator.jsx touches. Stacking: items[0] is top-most.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let nextId = 1;

class Container {
  constructor() { this.items = []; }
  get pageItems() { return this.items; }
}

class Item {
  constructor(typename, opts = {}) {
    this.uid = nextId++;
    this.typename = typename;
    this.name = opts.name || "";
    this.locked = !!opts.locked;
    this.hidden = !!opts.hidden;
    this.clipping = !!opts.clipping;
    this._bounds = opts.bounds ? opts.bounds.slice() : null; // [l, t, r, b]
    this.strokeWidth = opts.strokeWidth || 1;
    this.parent = null;
  }
  get layer() {
    let p = this.parent;
    while (p && p.typename !== "Layer") p = p.parent;
    return p;
  }
  get geometricBounds() { return this._bounds.slice(); }
  detach() {
    const arr = this.parent.items;
    arr.splice(arr.indexOf(this), 1);
    this.parent = null;
  }
  remove() { this.detach(); }
  clone() {
    const c = new Item(this.typename, { name: this.name, bounds: this._bounds, strokeWidth: this.strokeWidth, clipping: this.clipping });
    return c;
  }
  duplicate(rel, placement) {
    if (placement !== "PLACEBEFORE") throw new Error("mock: unsupported placement");
    const c = this.clone();
    if (rel.parent.locked) throw new Error("Target container is locked");
    const arr = rel.parent.items;
    arr.splice(arr.indexOf(rel), 0, c);
    c.parent = rel.parent;
    return c;
  }
  move(container, placement) {
    if (placement !== "PLACEATEND") throw new Error("mock: unsupported placement");
    this.detach();
    container.items.push(this);
    this.parent = container;
  }
  translate(dx, dy) {
    const b = this._bounds;
    this._bounds = [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
  }
  _scaleAbout(cx, cy, s, lw) {
    const b = this._bounds;
    this._bounds = [cx + (b[0] - cx) * s, cy + (b[1] - cy) * s, cx + (b[2] - cx) * s, cy + (b[3] - cy) * s];
    this.strokeWidth *= lw;
  }
  resize(sx, sy, a, b, c, d, lw, anchor) {
    if (anchor !== "CENTER") throw new Error("mock: expected center anchor");
    if (sx !== sy) throw new Error("mock: expected proportional scale");
    const g = this.geometricBounds;
    this._scaleAbout((g[0] + g[2]) / 2, (g[1] + g[3]) / 2, sx / 100, lw / 100);
  }
}

class GroupItem extends Item {
  constructor(opts = {}) {
    super("GroupItem", opts);
    this.items = [];
    this.clipped = !!opts.clipped;
  }
  get pageItems() { return this.items; }
  get pathItems() { return this.items.filter((i) => i.typename === "PathItem"); }
  get geometricBounds() {
    if (!this.items.length) return [0, 0, 0, 0];
    const bs = this.items.map((i) => i.geometricBounds);
    return [Math.min(...bs.map((b) => b[0])), Math.max(...bs.map((b) => b[1])),
            Math.max(...bs.map((b) => b[2])), Math.min(...bs.map((b) => b[3]))];
  }
  add(child) { child.parent = this; this.items.push(child); return child; }
  clone() {
    const g = new GroupItem({ name: this.name, clipped: this.clipped });
    for (const ch of this.items) g.add(ch.clone());
    return g;
  }
  translate(dx, dy) { for (const ch of this.items) ch.translate(dx, dy); }
  _scaleAbout(cx, cy, s, lw) { for (const ch of this.items) ch._scaleAbout(cx, cy, s, lw); }
}

class Layer extends Container {
  constructor(doc, name, opts = {}) {
    super();
    this.typename = "Layer";
    this.name = name;
    this.parent = doc;
    this.locked = !!opts.locked;
    this.visible = opts.visible !== false;
  }
  add(item, atTop = false) {
    item.parent = this;
    if (atTop) this.items.unshift(item); else this.items.push(item);
    return item;
  }
}

function makeIllustrator() {
  const alerts = [];
  const menuCommands = [];
  const doc = {
    typename: "Document",
    layers: [],
    _selection: [],
    activeLayer: null,
    get selection() { return this._selection; },
    set selection(v) { this._selection = v == null ? [] : Array.from(v); },
    groupItems: {
      add() {
        const g = new GroupItem();
        doc.activeLayer.add(g, true);
        return g;
      },
    },
    addLayer(name, opts) { const l = new Layer(doc, name, opts); this.layers.push(l); if (!this.activeLayer) this.activeLayer = l; return l; },
  };
  const app = {
    documents: { length: 1 },
    activeDocument: doc,
    clipboard: [],          // items (prototypes) that app.paste() clones
    paste() {
      if (!this.clipboard.length) return; // real Illustrator: nothing happens
      const layer = doc.activeLayer;
      if (layer.locked || !layer.visible) throw new Error("Target layer cannot be modified");
      const pasted = this.clipboard.map((p) => p.clone());
      // pasted lands at top, keeping clipboard order (index 0 = top)
      for (let i = pasted.length - 1; i >= 0; i--) layer.add(pasted[i], true);
      doc.selection = pasted;
    },
    executeMenuCommand(cmd) {
      menuCommands.push(cmd);
      if (cmd !== "group") throw new Error("mock: unknown menu command " + cmd);
      const sel = doc.selection;
      const first = sel[0];
      const parent = first.parent;
      const g = new GroupItem();
      const idx = parent.items.indexOf(first);
      for (const it of sel) { it.detach(); }
      parent.items.splice(Math.min(idx, parent.items.length), 0, g);
      g.parent = parent;
      for (const it of sel) g.add(it);
      doc.selection = [g];
    },
    redraw() { throw new Error("redraw must not be called"); },
  };
  const context = {
    app,
    alert: (msg) => alerts.push(String(msg)),
    ElementPlacement: { PLACEBEFORE: "PLACEBEFORE", PLACEATEND: "PLACEATEND" },
    Transformation: { CENTER: "CENTER" },
    Math, isFinite, NaN,
  };
  return { app, doc, alerts, menuCommands, context, Item, GroupItem };
}

function runScript(ctx, overrides = {}) {
  let src = fs.readFileSync(path.join(__dirname, "..", "PasteToReplace_Illustrator.jsx"), "utf8");
  if (overrides.scaleToFit) src = src.replace("var scaleToFit = false;", "var scaleToFit = true;");
  if (overrides.scaleStrokes === false) src = src.replace("var scaleStrokes = true;", "var scaleStrokes = false;");
  vm.runInNewContext(src, ctx.context);
}

module.exports = { makeIllustrator, runScript, Item, GroupItem };
