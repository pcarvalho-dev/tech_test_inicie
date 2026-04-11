import { build } from 'esbuild';
import { copyFileSync } from 'fs';

// Copy manifest to out/
copyFileSync('manifest.json', 'out/manifest.json');
console.log('✓ manifest.json → out/manifest.json');

// Compile background service worker
await build({
  entryPoints: ['background/index.ts'],
  bundle: true,
  outfile: 'out/background.js',
  platform: 'browser',
  target: 'chrome120',
  format: 'esm',
  define: { 'process.env.NODE_ENV': '"production"' },
});

console.log('✓ background/index.ts → out/background.js');
console.log('\n✅ Extension build complete! Load the out/ folder in chrome://extensions');
