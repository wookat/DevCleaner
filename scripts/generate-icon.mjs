import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../src-tauri/icons/icon.svg');
const outPath = resolve(__dirname, '../src-tauri/icons/icon.png');

const svg = readFileSync(svgPath);

await sharp(svg)
  .resize(1024, 1024)
  .png()
  .toFile(outPath);

console.log('Generated icon.png (1024x1024)');
