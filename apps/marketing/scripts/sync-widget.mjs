import { mkdir, copyFile } from 'node:fs/promises';

const source = new URL('../../../packages/widget/dist/widget.js', import.meta.url);
const targetDir = new URL('../public/vendor/', import.meta.url);
const target = new URL('../public/vendor/widget.js', import.meta.url);

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);

