import { test } from "node:test";
import assert from "node:assert/strict";
import { clampView, cropBox, cropRect, cropSize, initialView, panView, zoomView } from "./photocrop.js";

// gleiche Fälle wie src/domain/photoCrop.test.ts
test("Bildausschnitt: Start, Zoom, Verschieben, Grenzen", () => {
  assert.deepEqual(cropRect(1200, 800, initialView(1200, 800)), { sx: 200, sy: 0, sw: 800, sh: 800, size: 800 });
  assert.deepEqual(cropRect(600, 900, initialView(600, 900)), { sx: 0, sy: 150, sw: 600, sh: 600, size: 600 });
  assert.equal(cropSize(1200, 800, 2), 400);
  assert.equal(cropSize(1200, 800, 10), 200);
  assert.deepEqual(cropRect(1200, 800, zoomView(1200, 800, initialView(1200, 800), 2)), { sx: 400, sy: 200, sw: 400, sh: 400, size: 400 });
  const v = initialView(1200, 800);
  assert.equal(cropRect(1200, 800, panView(1200, 800, v, 25, 0, 200)).sx, 100);
  assert.equal(cropRect(1200, 800, panView(1200, 800, v, 500, 0, 200)).sx, 0);
  assert.equal(cropRect(1200, 800, panView(1200, 800, v, -500, 0, 200)).sx, 400);
  assert.deepEqual(clampView(100, 100, { zoom: Number.NaN, cx: Number.NaN, cy: 1e9 }), { zoom: 1, cx: 50, cy: 50 });
});

test("Bildausschnitt: Seitenverhältnis 3:4 und 4:3 (wie am PC)", () => {
  assert.deepEqual(cropBox(1200, 800, 1, 0.75), { w: 600, h: 800 });
  const r = cropRect(900, 1600, initialView(900, 1600), 4 / 3);
  assert.deepEqual([r.sx, r.sw, r.sh], [0, 900, 675]);
  assert.equal(cropRect(900, 1600, panView(900, 1600, initialView(900, 1600), 0, 5000, 300, 4 / 3), 4 / 3).sy, 0);
});
