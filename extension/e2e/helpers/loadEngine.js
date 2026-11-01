import { build } from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const enginePath = join(root, '../../src/portalEngine.js');

export async function bundleEngine() {
  const result = await build({
    entryPoints: [enginePath],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'JobFitlyEngine',
    platform: 'browser',
  });
  return `${result.outputFiles[0].text}\nwindow.PortalEngine = JobFitlyEngine.PortalEngine;`;
}

export async function loadEngine(page) {
  const code = await bundleEngine();
  await page.evaluate((src) => {
    // eslint-disable-next-line no-new-func
    new Function(src)();
  }, code);
}
