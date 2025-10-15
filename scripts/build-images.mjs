import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(process.cwd())
const SRC_PHOTOS_DIR = path.join(ROOT, 'src', 'assets', 'photos')
const SRC_BANNER_DIR = path.join(ROOT, 'src', 'assets', 'banner')
const OUT_DIR = path.join(ROOT, 'public', 'thumbs')
const MANIFEST_PATH = path.join(ROOT, 'public', 'generated', 'manifest.json')

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

function isImage(file) {
  return /\.(jpe?g|png|webp)$/i.test(file)
}

async function build() {
  const manifest = {}
  await ensureDir(OUT_DIR)
  await ensureDir(path.dirname(MANIFEST_PATH))

  // Process photos directory
  for await (const file of walk(SRC_PHOTOS_DIR)) {
    if (!isImage(file)) continue
    const relFromSrc = "/" + (path.relative(path.join(ROOT, "/src/"), file).replace(/\\/g, '/')) // e.g. assets/photos/event/img.jpg
    const relPhotos = path.relative(SRC_PHOTOS_DIR, file).replace(/\\/g, '/') // e.g. event/img.jpg
    // Flatten: write all thumbnails directly under public/thumbs
    const outDirForFile = OUT_DIR
    await ensureDir(OUT_DIR)

    const baseName = path.basename(file, path.extname(file))
    const buffer = await fs.readFile(file)
    const image = sharp(buffer)
    const meta = await image.metadata()
    const origWidth = meta.width || 2000

    const widths = [400, 800, 1200]
    const qualityFor = (w) => (w <= 400 ? 40 : w <= 800 ? 38 : 35)
    const urls = {}
    for (const w of widths) {
      const target = Math.min(origWidth, w)
      const outPath = path.join(outDirForFile, `${baseName}-${w}.webp`)
      await sharp(buffer)
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: qualityFor(w), effort: 5 })
        .toFile(outPath)
      urls[w] = `/thumbs/${baseName}-${w}.webp`
    }

    // Default to 800 for src to balance quality/perf
    const defaultUrl = urls[800] || urls[widths[widths.length-1]]
    const prodsrc = `/assets/${path.basename(file)}`
    manifest[prodsrc] = defaultUrl
    manifest[prodsrc+"__srcset"] = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    // for local development, include /src path mapping too
    manifest['/src'+relFromSrc] = defaultUrl
    manifest['/src'+relFromSrc+"__srcset"] = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`
  }

  // Process banner directory
  for await (const file of walk(SRC_BANNER_DIR)) {
    if (!isImage(file)) continue
    const relFromSrc = "/" + (path.relative(path.join(ROOT, "/src/"), file).replace(/\\/g, '/')) // e.g. assets/banner/img.jpg
    
    const baseName = path.basename(file, path.extname(file))
    const buffer = await fs.readFile(file)
    const image = sharp(buffer)
    const meta = await image.metadata()
    const origWidth = meta.width || 2000

    const widths = [400, 800, 1200]
    const qualityFor = (w) => (w <= 400 ? 40 : w <= 800 ? 38 : 35)
    const urls = {}
    for (const w of widths) {
      const target = Math.min(origWidth, w)
      const outPath = path.join(OUT_DIR, `${baseName}-${w}.webp`)
      await sharp(buffer)
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: qualityFor(w), effort: 5 })
        .toFile(outPath)
      urls[w] = `/thumbs/${baseName}-${w}.webp`
    }

    // Default to 800 for src to balance quality/perf
    const defaultUrl = urls[800] || urls[widths[widths.length-1]]
    const prodsrc = `/assets/${path.basename(file)}`
    manifest[prodsrc] = defaultUrl
    manifest[prodsrc+"__srcset"] = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    // for local development, include /src path mapping too
    manifest['/src'+relFromSrc] = defaultUrl
    manifest['/src'+relFromSrc+"__srcset"] = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`Wrote manifest with ${Object.keys(manifest).length} entries to ${MANIFEST_PATH}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
