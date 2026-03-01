import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(process.cwd())
const SRC_PHOTOS_DIR = path.join(ROOT, 'src', 'assets', 'photos')
const SRC_BANNER_DIR = path.join(ROOT, 'src', 'assets', 'banner')
const OUT_DIR = path.join(ROOT, 'public', 'thumbs')
const MANIFEST_PATH = path.join(ROOT, 'src', 'generated', 'manifest.json')

const WIDTHS = [400, 800, 1200]
const qualityFor = (w) => (w <= 400 ? 40 : w <= 800 ? 38 : 35)

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function exists(file) {
  return fs.access(file).then(() => true).catch(() => false)
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

function isImage(file) {
  return /\.(jpe?g|png|webp)$/i.test(file)
}

/**
 * Process a single image file: generate WebP thumbnails (skipping any that
 * already exist on disk) and return the thumb URL map.
 */
async function processImage(file) {
  const baseName = path.basename(file, path.extname(file))
  const urls = {}
  let generated = 0
  let skipped = 0

  for (const w of WIDTHS) {
    const outPath = path.join(OUT_DIR, `${baseName}-${w}.webp`)
    if (await exists(outPath)) {
      // Thumbnail already on disk (restored from cache or prior run)
      urls[w] = `/thumbs/${baseName}-${w}.webp`
      skipped++
      continue
    }

    // Only read + decode if we actually need to generate at least one thumb
    if (!urls._buffer) {
      urls._buffer = await fs.readFile(file)
      const meta = await sharp(urls._buffer).metadata()
      urls._width = meta.width || 2000
    }

    const target = Math.min(urls._width, w)
    await sharp(urls._buffer)
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: qualityFor(w), effort: 5 })
      .toFile(outPath)

    urls[w] = `/thumbs/${baseName}-${w}.webp`
    generated++
  }

  // Clean up internal keys
  delete urls._buffer
  delete urls._width

  const status = generated > 0
    ? `✓ generated ${generated}, skipped ${skipped}`
    : `↩ all cached (${skipped} thumbs)`
  console.log(`  ${status}: ${path.relative(ROOT, file)}`)

  return urls
}

async function build() {
  const manifest = {}
  await ensureDir(OUT_DIR)
  await ensureDir(path.dirname(MANIFEST_PATH))

  console.log('Processing photos…')
  for await (const file of walk(SRC_PHOTOS_DIR)) {
    if (!isImage(file)) continue

    const relFromSrc = '/' + path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/')
    const urls = await processImage(file)

    const prodSrc = `/assets/${path.basename(file)}`
    const srcset = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    // Production paths (used in the built site)
    manifest[prodSrc] = urls[800] || urls[1200]
    manifest[prodSrc + '__srcset'] = srcset

    // Dev paths (used by Vite dev server, which serves from /src/)
    manifest['/src' + relFromSrc] = urls[800] || urls[1200]
    manifest['/src' + relFromSrc + '__srcset'] = srcset
  }

  console.log('Processing banners…')
  for await (const file of walk(SRC_BANNER_DIR)) {
    if (!isImage(file)) continue

    const relFromSrc = '/' + path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/')
    const urls = await processImage(file)

    const prodSrc = `/assets/${path.basename(file)}`
    const srcset = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    manifest[prodSrc] = urls[800] || urls[1200]
    manifest[prodSrc + '__srcset'] = srcset
    manifest['/src' + relFromSrc] = urls[800] || urls[1200]
    manifest['/src' + relFromSrc + '__srcset'] = srcset
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`\nWrote manifest with ${Object.keys(manifest).length} entries → ${MANIFEST_PATH}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
