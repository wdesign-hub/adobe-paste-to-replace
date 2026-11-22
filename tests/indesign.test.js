const { test } = require("node:test");
const assert = require("node:assert");
const M = require("./indesign-mock");

const center = (b) => [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2]; // [x, y]
const size = (b) => [b[3] - b[1], b[2] - b[0]];               // [w, h]

function setup() {
  const id = M.makeInDesign();
  const L1 = new M.Layer("Layer 1");
  const L2 = new M.Layer("Layer 2");
  id.doc.layers.push(L1, L2);
  id.doc.activeLayer = L1;
  const S1 = new M.Spread("Spread 1");
  const S2 = new M.Spread("Spread 2");
  id.doc.spreads.push(S1, S2);
  return { ...id, L1, L2, S1, S2 };
}

test("alerts when no document is open", () => {
  const id = setup();
  id.app.documents.length = 0;
  M.runScript(id);
  assert.match(id.alerts[0], /Open a document/);
  assert.strictEqual(id.doScriptCalls.length, 0);
});

test("alerts when the Story Editor is active", () => {
  const id = setup();
  id.app.activeWindow = new M.StoryWindow();
  M.runScript(id);
  assert.match(id.alerts[0], /layout view/);
});

test("alerts when nothing is selected", () => {
  const id = setup();
  M.runScript(id);
  assert.match(id.alerts[0], /Nothing is selected/);
});

test("alerts when text is selected", () => {
  const id = setup();
  id.app.selection = [new M.InsertionPoint()];
  M.runScript(id);
  assert.match(id.alerts[0], /text selected/);
});

test("alerts on empty clipboard (paste throws) and keeps the placeholder", () => {
  const id = setup();
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 100] }));
  id.app.selection = [t];
  M.runScript(id);
  assert.match(id.alerts[0], /clipboard is empty/);
  assert.deepStrictEqual(id.S1.items, [t]);
  assert.deepStrictEqual(id.app.selection, [t]);
});

test("alerts on empty clipboard (paste silently does nothing)", () => {
  const id = setup();
  id.app.pasteThrowsWhenEmpty = false;
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 100] }));
  id.app.selection = [t];
  M.runScript(id);
  assert.match(id.alerts[0], /clipboard is empty/);
  assert.deepStrictEqual(id.S1.items, [t]);
});

test("runs as a single undo step and restores ruler settings", () => {
  const id = setup();
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 100] }));
  id.app.clipboard = [new M.Oval({ bounds: [0, 0, 10, 10] })];
  id.app.selection = [t];
  let originDuringPaste;
  const realPaste = id.app.paste.bind(id.app);
  id.app.paste = () => { originDuringPaste = [id.doc.viewPreferences.rulerOrigin, id.doc.zeroPoint]; realPaste(); };

  M.runScript(id);

  assert.deepStrictEqual(id.doScriptCalls, [{ lang: "JAVASCRIPT", undoMode: "ENTIRE_SCRIPT", name: "Paste to Replace" }]);
  assert.deepStrictEqual(originDuringPaste, ["SPREAD_ORIGIN", [0, 0]]);
  assert.strictEqual(id.doc.viewPreferences.rulerOrigin, "PAGE_ORIGIN");
  assert.deepStrictEqual(id.doc.zeroPoint, [12, 34]);
});

test("replaces one target: centred, same layer & z-order, original size", () => {
  const id = setup();
  const front = id.S1.add(new M.Rectangle({ name: "front", layer: id.L1, bounds: [0, 0, 5, 5] }));
  const t = id.S1.add(new M.Rectangle({ name: "placeholder", layer: id.L1, bounds: [100, 200, 300, 600] }));
  const back = id.S1.add(new M.Rectangle({ name: "back", layer: id.L1, bounds: [0, 0, 5, 5] }));
  id.app.clipboard = [new M.Oval({ name: "logo", bounds: [0, 0, 40, 80] })];
  id.app.selection = [t];

  M.runScript(id);

  assert.deepStrictEqual(id.alerts, []);
  assert.deepStrictEqual(id.S1.items.map((i) => i.name), ["front", "logo", "back"]);
  const r = id.S1.items[1];
  assert.strictEqual(r.itemLayer, id.L1);
  assert.deepStrictEqual(center(r.geometricBounds), [400, 200]);
  assert.deepStrictEqual(size(r.geometricBounds), [80, 40]);
  assert.ok(t.removed);
  assert.deepStrictEqual(id.app.selection, [r]);
  void front; void back;
});

test("replaces targets on other spreads and layers", () => {
  const id = setup();
  const t1 = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 100] }));
  const keep = id.S2.add(new M.Rectangle({ name: "keep", layer: id.L2, bounds: [0, 0, 5, 5] }));
  const t2 = id.S2.add(new M.TextFrame({ layer: id.L2, bounds: [500, 500, 700, 900] }));
  id.app.clipboard = [new M.Oval({ name: "icon", bounds: [0, 0, 20, 20] })];
  id.app.selection = [t1, t2];

  M.runScript(id);

  assert.deepStrictEqual(id.alerts, []);
  assert.deepStrictEqual(id.S1.items.map((i) => i.name), ["icon"]);
  assert.deepStrictEqual(id.S2.items.map((i) => i.name), ["keep", "icon"]);
  const r2 = id.S2.items[1];
  assert.strictEqual(r2.itemLayer, id.L2);
  assert.deepStrictEqual(center(r2.geometricBounds), [700, 600]);
  assert.strictEqual(id.app.selection.length, 2);
  void keep;
});

test("multiple copied items are grouped in their stacking order", () => {
  const id = setup();
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 100] }));
  id.app.clipboard = [
    new M.Oval({ name: "top", bounds: [0, 0, 10, 10] }),
    new M.Rectangle({ name: "bottom", bounds: [30, 30, 40, 40] }),
  ];
  id.app.selection = [t];

  M.runScript(id);

  assert.strictEqual(id.S1.items.length, 1);
  const g = id.S1.items[0];
  assert.ok(g instanceof M.Group);
  assert.deepStrictEqual(g.items.map((i) => i.name), ["top", "bottom"]);
  assert.deepStrictEqual(center(g.geometricBounds), [50, 50]);
  assert.deepStrictEqual(size(g.geometricBounds), [40, 40]);
});

test("scaleToFit = true scales up to fit (contain) and recentres", () => {
  const id = setup();
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 100, 200] })); // w200 h100
  id.app.clipboard = [new M.Oval({ bounds: [0, 0, 10, 10] })];
  id.app.selection = [t];
  M.runScript(id, { scaleToFit: true });
  const r = id.S1.items[0];
  assert.deepStrictEqual(size(r.geometricBounds), [100, 100]);
  assert.deepStrictEqual(center(r.geometricBounds), [100, 50]);
});

test("scaleToFit = true scales down too", () => {
  const id = setup();
  const t = id.S1.add(new M.Rectangle({ layer: id.L1, bounds: [0, 0, 50, 50] }));
  id.app.clipboard = [new M.Oval({ bounds: [0, 0, 100, 400] })];
  id.app.selection = [t];
  M.runScript(id, { scaleToFit: true });
  const r = id.S1.items[0];
  assert.deepStrictEqual(size(r.geometricBounds), [50, 12.5]);
  assert.deepStrictEqual(center(r.geometricBounds), [25, 25]);
});

test("Direct-selected image content replaces its frame (once)", () => {
  const id = setup();
  const frame = id.S1.add(new M.Rectangle({ name: "frame", layer: id.L1, bounds: [0, 0, 100, 100] }));
  const img = new M.Image(frame);
  id.app.clipboard = [new M.Oval({ name: "new", bounds: [0, 0, 10, 10] })];
  id.app.selection = [img, frame];
  M.runScript(id);
  assert.deepStrictEqual(id.alerts, []);
  assert.deepStrictEqual(id.S1.items.map((i) => i.name), ["new"]);
});

test("skips locked items, locked layers and items inside groups, and reports them", () => {
  const id = setup();
  const LL = new M.Layer("Locked", { locked: true });
  const ok = id.S1.add(new M.Rectangle({ name: "ok", layer: id.L1, bounds: [0, 0, 10, 10] }));
  const locked = id.S1.add(new M.Rectangle({ name: "lockedOne", locked: true, layer: id.L1, bounds: [0, 0, 10, 10] }));
  const onLocked = id.S1.add(new M.Rectangle({ name: "onLockedLayer", layer: LL, bounds: [0, 0, 10, 10] }));
  const grp = id.S1.add(new M.Group({ layer: id.L1 }));
  const inGroup = new M.Rectangle({ name: "inGroup", layer: id.L1, bounds: [0, 0, 10, 10] });
  inGroup.parent = grp; grp.items.push(inGroup);
  id.app.clipboard = [new M.Oval({ name: "new", bounds: [0, 0, 4, 4] })];
  id.app.selection = [ok, locked, onLocked, inGroup];

  M.runScript(id);

  assert.ok(ok.removed);
  assert.ok(!locked.removed && !onLocked.removed && !inGroup.removed);
  assert.match(id.alerts[0], /Replaced 1 of 4/);
  assert.match(id.alerts[0], /lockedOne.*locked/);
  assert.match(id.alerts[0], /onLockedLayer.*locked layer/);
  assert.match(id.alerts[0], /inGroup.*inside a group/);
});

test("pastes onto the first target's layer and restores the active layer", () => {
  const id = setup();
  id.doc.activeLayer = id.L1;
  const t = id.S1.add(new M.Rectangle({ layer: id.L2, bounds: [0, 0, 10, 10] }));
  id.app.clipboard = [new M.Oval({ name: "x", bounds: [0, 0, 4, 4] })];
  id.app.selection = [t];
  M.runScript(id);
  assert.strictEqual(id.doc.activeLayer, id.L1);
  assert.strictEqual(id.S1.items[0].itemLayer, id.L2);
  assert.strictEqual(id.S1.items.length, 1);
});
