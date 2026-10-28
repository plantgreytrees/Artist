// Colour grammar and colour parsing (ARCH-DIRECTIONS-08, ARCH-DIRECTIONS-15): only numeric colour arguments are
// accepted, and every accepted form is scored with its units honoured.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCssValue, contrast } from "./directions.mjs";

const rejects = (v) =>
  assert.throws(
    () => checkCssValue(v),
    (e) => e.exitCode === 2 && e.reason === "css-value",
    v,
  );

test("colour functions with non-numeric arguments exit 2", () => {
  for (const v of ["rgb(abc def ghi)", "hsl(abc 50% 50%)", "rgb(none 0 0)", "oklch(50% abc 120)", "rgb(0 0 0 / x)"])
    rejects(v);
});

test("hue units other than deg exit 2", () => {
  for (const v of ["hsl(0.5turn 50% 50%)", "hsl(1rad 50% 50%)", "oklch(50% 0.1 100grad)"]) rejects(v);
});

test("numeric colour forms are still accepted", () => {
  for (const v of [
    "rgb(255 0 0)",
    "rgba(0, 0, 0, 0.5)",
    "rgb(0 0 0 / 50%)",
    "hsl(210 40% 50%)",
    "hsl(210deg 40% 50% / 0.8)",
    "hsla(210, 40%, 50%, 0.8)",
    "oklch(62% 0.19 250)",
    "oklch(0.62 0.19 250deg / 0.9)",
  ])
    assert.equal(checkCssValue(v), v);
});

test("a colour with a non-numeric part is not scored", () => {
  assert.equal(contrast("#ffffff", "hsl(abc 50% 50%)"), null);
  assert.equal(contrast("#ffffff", "hsl(none 50% 50%)"), null);
  assert.equal(contrast("rgb(none 0 0)", "#ffffff"), null);
});

test("oklch percentage chroma maps 100% to 0.4", () => {
  const pct = contrast("oklch(50% 40% 120)", "#000000");
  assert.equal(pct.toFixed(2), contrast("oklch(0.5 0.16 120)", "#000000").toFixed(2));
  assert.equal(pct.toFixed(2), "3.66");
});

test("hsl saturation and lightness are clamped to 0..100%", () => {
  assert.equal(contrast("hsl(0 50% 150%)", "#ffffff").toFixed(2), "1.00");
  assert.equal(contrast("hsl(0 150% 50%)", "#ffffff").toFixed(2), contrast("#ff0000", "#ffffff").toFixed(2));
});
