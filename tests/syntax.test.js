// ExtendScript is an ES3 engine: make sure no modern syntax slipped in.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const files = ["PasteToReplace_Illustrator.jsx", "PasteToReplace_InDesign.jsx"];

for (const f of files) {
  test(`${f} parses as ECMAScript 3`, () => {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.doesNotThrow(() => acorn.parse(src, { ecmaVersion: 3, allowReserved: true }));
  });

  test(`${f} avoids ES5+ library calls missing from ExtendScript`, () => {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    const banned = [/\.forEach\(/, /\.map\(/, /\.filter\(/, /\.indexOf\(/, /Object\.keys/, /JSON\./, /\.trim\(/, /Array\.isArray/];
    for (const re of banned) assert.ok(!re.test(src), `uses ${re}`);
  });
}

test("Illustrator script never calls app.redraw (it would split the undo step)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", files[0]), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/app\.redraw\s*\(/.test(code));
});

test("scaleToFit defaults to false in both scripts", () => {
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.match(src, /var scaleToFit = false;/);
  }
});
