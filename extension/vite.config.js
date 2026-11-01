import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './public/manifest.json' assert { type: 'json' }

/**
 * Programmatic re-inject of content.js must be idempotent. Rollup emits
 * top-level `const _ = …` (PortalEngine); a second inject throws
 * "Identifier '_' has already been declared". Wrap the content chunk in an IIFE.
 */
function contentScriptIife() {
  return {
    name: 'jobfitly-content-iife',
    renderChunk(code, chunk) {
      if (chunk.name !== 'content' && chunk.fileName !== 'content.js') return null;
      if (code.startsWith('(function(){')) return null;
      return {
        code: `(function(){\n${code}\n})();\n`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    contentScriptIife(),
  ],
  build: {
    rollupOptions: {
      input: {
        // Content script is handled separately, not bundled with React
        content: './src/content.js'
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'content') {
            return 'content.js'
          }
          return 'assets/[name]-[hash].js'
        }
      }
    }
  }
})
