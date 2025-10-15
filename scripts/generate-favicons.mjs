import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const projectRoot = process.cwd();
const publicDir = path.resolve(projectRoot, 'public');
const sourceLogo = path.resolve(publicDir, 'logo-dark.png');

const faviconPngSizes = [16, 32, 48, 64];
const touchSize = 180; // apple-touch-icon
const androidSizes = [192, 512];

async function ensureSourceExists() {
  try {
    await fs.access(sourceLogo);
  } catch {
    throw new Error(`Source logo not found at ${sourceLogo}`);
  }
}

async function makeDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function generatePng(size, outfile) {
  await sharp(sourceLogo)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outfile);
}

async function generateFavicons() {
  await ensureSourceExists();
  await makeDir(publicDir);

  const generatedPngs = [];

  // Standard PNG favicons
  for (const size of faviconPngSizes) {
    const outfile = path.join(publicDir, `favicon-${size}.png`);
    await generatePng(size, outfile);
    generatedPngs.push(outfile);
  }

  // Apple touch icon
  const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png');
  await generatePng(touchSize, appleTouchPath);

  // Android Chrome PNGs
  for (const size of androidSizes) {
    const outfile = path.join(publicDir, `android-chrome-${size}x${size}.png`);
    await generatePng(size, outfile);
  }

  // ICO file from multiple PNGs
  const icoPngs = faviconPngSizes.map((s) => path.join(publicDir, `favicon-${s}.png`));
  const icoBuffer = await pngToIco(icoPngs);
  await fs.writeFile(path.join(publicDir, 'favicon.ico'), icoBuffer);

  console.log('Favicons generated in /public');
}

generateFavicons().catch((err) => {
  console.error(err);
  process.exit(1);
});


