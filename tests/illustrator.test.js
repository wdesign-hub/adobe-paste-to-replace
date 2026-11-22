const { test } = require("node:test");
const assert = require("node:assert");
const { makeIllustrator, runScript, Item, GroupItem } = require("./illustrator-mock");

const center = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const size = (b) => [b[2] - b[0], b[1] - b[3]];

function setup() {
  const ai = makeIllustrator();
  const L1 = ai.doc.addLayer("Layer 1");
  const L2 = ai.doc.addLayer("Layer 2");
  return { ...ai, L1, L2 };
}

test("alerts when no document is open", () => {
  const ai = setup();
  ai.app.documents.length = 0;
  runScript(ai);
  assert.match(ai.alerts[0], /Open a document/);
});

test("alerts when nothing is selected", () => {
  const ai = setup();
  ai.L1.add(new Item("PathItem", { bounds: [0, 100, 100, 0] }));
  ai.app.clipboard = [new Item("PathItem", { bounds: [0, 10, 10, 0] })];
  runScript(ai);
  assert.match(ai.alerts[0], /Nothing is selected/);
  assert.strictEqual(ai.L1.items.length, 1);
});

test("alerts when the user is editing text", () => {
  const ai = setup();
  ai.doc._selection = { typename: "TextRange", length: 3 };
  runScript(ai);
  assert.match(ai.alerts[0], /editing text/);
});

test("alerts on empty clipboard and leaves the placeholder untouched", () => {
  const ai = setup();
  const t = ai.L1.add(new Item("PathItem", { name: "ph", bounds: [0, 100, 100, 0] }));
  ai.doc.selection = [t];
  runScript(ai);
  assert.match(ai.alerts[0], /clipboard is empty/);
  assert.deepStrictEqual(ai.L1.items, [t]);
  assert.deepStrictEqual(ai.doc.selection, [t]);
});

test("replaces a single target: centred, same layer, same z-order, original size", () => {
  const ai = setup();
  const above = ai.L1.add(new Item("PathItem", { name: "above", bounds: [-50, 50, -40, 40] }));
  const t = ai.L1.add(new Item("PathItem", { name: "placeholder", bounds: [100, 400, 300, 200] }));
  const below = ai.L1.add(new Item("PathItem", { name: "below", bounds: [0, 10, 10, 0] }));
  ai.app.clipboard = [new Item("PathItem", { name: "logo", bounds: [0, 50, 80, 0] })];
  ai.doc.selection = [t];

  runScript(ai);

  assert.deepStrictEqual(ai.alerts, []);
  assert.strictEqual(ai.L1.items.length, 3);
  const r = ai.L1.items[1];
  assert.strictEqual(r.name, "logo");
  assert.strictEqual(ai.L1.items[0], above);
  assert.strictEqual(ai.L1.items[2], below);
  assert.ok(!ai.L1.items.includes(t), "placeholder removed");
  assert.deepStrictEqual(center(r.geometricBounds), [200, 300]);
  assert.deepStrictEqual(size(r.geometricBounds), [80, 50]);
  assert.deepStrictEqual(ai.doc.selection, [r]);
  assert.strictEqual(ai.L2.items.length, 0, "no stray pasted source left behind");
});

test("replaces several targets across layers and inside groups", () => {
  const ai = setup();
  const t1 = ai.L1.add(new Item("PathItem", { bounds: [0, 100, 100, 0] }));
  const grp = ai.L2.add(new GroupItem({ name: "card" }));
  const g0 = grp.add(new Item("PathItem", { name: "g0", bounds: [500, 600, 520, 580] }));
  const t2 = grp.add(new Item("PathItem", { bounds: [1000, 1000, 1200, 900] }));
  const g2 = grp.add(new Item("PathItem", { name: "g2", bounds: [500, 600, 520, 580] }));
  ai.app.clipboard = [new Item("PathItem", { name: "icon", bounds: [0, 20, 20, 0] })];
  ai.doc.selection = [t1, t2];

  runScript(ai);

  assert.deepStrictEqual(ai.alerts, []);
  assert.strictEqual(ai.L1.items.length, 1);
  assert.strictEqual(ai.L1.items[0].name, "icon");
  assert.deepStrictEqual(center(ai.L1.items[0].geometricBounds), [50, 50]);
  assert.deepStrictEqual(grp.items.map((i) => i.name), ["g0", "icon", "g2"]);
  assert.deepStrictEqual(center(grp.items[1].geometricBounds), [1100, 950]);
  assert.strictEqual(ai.doc.selection.length, 2);
  void g0; void g2;
});

test("multiple copied items are grouped, keeping their stacking order", () => {
  const ai = setup();
  const t = ai.L1.add(new Item("PathItem", { bounds: [0, 100, 100, 0] }));
  ai.app.clipboard = [
    new Item("PathItem", { name: "top", bounds: [0, 10, 10, 0] }),
    new Item("PathItem", { name: "bottom", bounds: [30, 40, 40, 30] }),
  ];
  ai.doc.selection = [t];

  runScript(ai);

  assert.deepStrictEqual(ai.menuCommands, ["group"]);
  assert.strictEqual(ai.L1.items.length, 1);
  const g = ai.L1.items[0];
  assert.strictEqual(g.typename, "GroupItem");
  assert.deepStrictEqual(g.items.map((i) => i.name), ["top", "bottom"]);
  assert.deepStrictEqual(center(g.geometricBounds), [50, 50]);
  assert.deepStrictEqual(size(g.geometricBounds), [40, 40]);
});

test("scaleToFit = true scales up proportionally to fit (contain) and recentres", () => {
  const ai = setup();
  const t = ai.L1.add(new Item("PathItem", { bounds: [0, 100, 200, 0] })); // 200 x 100
  ai.app.clipboard = [new Item("PathItem", { name: "sq", bounds: [0, 10, 10, 0], strokeWidth: 1 })];
  ai.doc.selection = [t];

  runScript(ai, { scaleToFit: true });

  const r = ai.L1.items[0];
  assert.deepStrictEqual(size(r.geometricBounds), [100, 100]);
  assert.deepStrictEqual(center(r.geometricBounds), [100, 50]);
  assert.strictEqual(r.strokeWidth, 10);
});

test("scaleToFit = true scales down too; scaleStrokes = false keeps stroke weight", () => {
  const ai = setup();
  const t = ai.L1.add(new Item("PathItem", { bounds: [0, 50, 50, 0] }));
  ai.app.clipboard = [new Item("PathItem", { bounds: [0, 100, 400, 0], strokeWidth: 2 })];
  ai.doc.selection = [t];

  runScript(ai, { scaleToFit: true, scaleStrokes: false });

  const r = ai.L1.items[0];
  assert.deepStrictEqual(size(r.geometricBounds), [50, 12.5]);
  assert.deepStrictEqual(center(r.geometricBounds), [25, 25]);
  assert.strictEqual(r.strokeWidth, 2);
});

test("skips locked objects and objects on locked/hidden layers, reports them", () => {
  const ai = setup();
  const L3 = ai.doc.addLayer("Locked", { locked: true });
  const ok = ai.L1.add(new Item("PathItem", { bounds: [0, 10, 10, 0] }));
  const locked = ai.L1.add(new Item("PathItem", { name: "lockedOne", locked: true, bounds: [0, 10, 10, 0] }));
  const onLocked = L3.add(new Item("PathItem", { name: "onLockedLayer", bounds: [0, 10, 10, 0] }));
  ai.app.clipboard = [new Item("PathItem", { name: "new", bounds: [0, 4, 4, 0] })];
  ai.doc.selection = [ok, locked, onLocked];

  runScript(ai);

  assert.deepStrictEqual(ai.L1.items.map((i) => i.name), ["new", "lockedOne"]);
  assert.deepStrictEqual(L3.items, [onLocked]);
  assert.match(ai.alerts[0], /Replaced 1 of 3/);
  assert.match(ai.alerts[0], /lockedOne.*locked/);
  assert.match(ai.alerts[0], /onLockedLayer.*locked layer/);
});

test("all targets ineligible: alert and nothing pasted", () => {
  const ai = setup();
  const locked = ai.L1.add(new Item("PathItem", { locked: true, bounds: [0, 10, 10, 0] }));
  ai.app.clipboard = [new Item("PathItem", { bounds: [0, 4, 4, 0] })];
  ai.doc.selection = [locked];
  runScript(ai);
  assert.match(ai.alerts[0], /None of the selected/);
  assert.deepStrictEqual(ai.L1.items, [locked]);
});

test("clipping-group placeholders are measured by their clipping path", () => {
  const ai = setup();
  const cg = ai.L1.add(new GroupItem({ clipped: true }));
  cg.add(new Item("PathItem", { clipping: true, bounds: [0, 100, 100, 0] }));
  cg.add(new Item("PathItem", { bounds: [-500, 500, 1000, -500] })); // big hidden image
  ai.app.clipboard = [new Item("PathItem", { bounds: [0, 10, 10, 0] })];
  ai.doc.selection = [cg];

  runScript(ai);

  assert.deepStrictEqual(center(ai.L1.items[0].geometricBounds), [50, 50]);
});

test("pastes onto the first target's layer and restores the active layer", () => {
  const ai = setup();
  ai.doc.activeLayer = ai.L1;
  const t = ai.L2.add(new Item("PathItem", { bounds: [0, 10, 10, 0] }));
  ai.app.clipboard = [new Item("PathItem", { name: "x", bounds: [0, 4, 4, 0] })];
  ai.doc.selection = [t];
  runScript(ai);
  assert.strictEqual(ai.doc.activeLayer, ai.L1);
  assert.deepStrictEqual(ai.L1.items, []);
  assert.deepStrictEqual(ai.L2.items.map((i) => i.name), ["x"]);
});
