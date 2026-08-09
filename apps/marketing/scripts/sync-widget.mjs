import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../../../packages/widget/dist/widget.js', import.meta.url);
const targetDir = new URL('../public/vendor/', import.meta.url);
const target = new URL('../public/vendor/widget.js', import.meta.url);

await mkdir(targetDir, { recursive: true });
const compiled = await readFile(source, 'utf8');
const browserScript = compiled.replace(/\nexport \{\};\s*$/u, '\n');

if (/\n\s*(?:import|export)\s/u.test(browserScript)) {
  throw new Error('Widget browser bundle contains module syntax and cannot be loaded as a classic script');
}

await writeFile(target, browserScript, 'utf8');
