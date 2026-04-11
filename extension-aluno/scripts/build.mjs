import { build } from 'esbuild';
import { copyFileSync, renameSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

copyFileSync('manifest.json', 'out/manifest.json');
console.log('✓ manifest.json → out/manifest.json');

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

renameSync('out/_next', 'out/next_static');
console.log('✓ out/_next → out/next_static');

const htmlFiles = readdirSync('out').filter((f) => f.endsWith('.html'));
for (const file of htmlFiles) {
  const path = join('out', file);
  const content = readFileSync(path, 'utf8');
  writeFileSync(path, content.replaceAll('/_next/', '/next_static/'));
}
console.log(`✓ Fixed /_next/ references in ${htmlFiles.length} HTML file(s)`);

console.log('\n✅ Extension build complete! Load the out/ folder in chrome://extensions');
