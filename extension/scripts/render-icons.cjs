'use strict';

/**
 * Rasterize public/icons/icon{16,48,128}.svg → crisp PNG (with alpha).
 * Run: node scripts/render-icons.cjs
 * Needs: npm i -D @resvg/resvg-js (dev-only; not required at runtime)
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'public/icons');
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const svg = fs.readFileSync(path.join(dir, `icon${size}.svg`));
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  });
  const png = resvg.render().asPng();
  const out = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`ok icon${size}.png (${png.length} B)`);
}
