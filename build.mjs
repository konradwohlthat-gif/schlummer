import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const header = readFileSync('src/header.txt', 'utf8').replace('{{VERSION}}', pkg.version);

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/schlummer.user.js',
  banner: { js: header.trimEnd() },
  target: ['safari16', 'chrome110'],
  legalComments: 'none',
  charset: 'utf8',
  minify: false,
});
console.log('gebaut: dist/schlummer.user.js');
