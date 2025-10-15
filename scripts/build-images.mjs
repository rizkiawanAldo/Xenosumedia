import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(process.cwd())
const SRC_PHOTOS_DIR = path.join(ROOT, 'src', 'assets', 'photos')
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

  for await (const file of walk(SRC_PHOTOS_DIR)) {
    if (!isImage(file)) continue
    const relFromSrc = path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/') // e.g. assets/photos/event/img.jpg
    const relPhotos = path.relative(SRC_PHOTOS_DIR, file).replace(/\\/g, '/') // e.g. event/img.jpg
    const outDirForFile = path.join(OUT_DIR, path.dirname(relPhotos))
    await ensureDir(outDirForFile)

    const baseName = path.basename(file, path.extname(file))
    const outWebp = path.join(outDirForFile, `${baseName}.webp`)

    // Generate a reasonably sized thumbnail for grid; keep aspect ratio, cap width
    const buffer = await fs.readFile(file)
    const image = sharp(buffer)
    const meta = await image.metadata()
    const targetWidth = 1200
    const width = meta.width || targetWidth

    const pipeline = sharp(buffer)
      .resize({ width: Math.min(width, targetWidth), withoutEnlargement: true })
      .webp({ quality: 70, effort: 5 })

    await pipeline.toFile(outWebp)

    const publicThumbPath = `/thumbs/${relPhotos.replace(/\\/g, '/').replace(/\.[^.]+$/, '.webp')}`
    manifest[relFromSrc] = publicThumbPath
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`Wrote manifest with ${Object.keys(manifest).length} entries to ${MANIFEST_PATH}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
