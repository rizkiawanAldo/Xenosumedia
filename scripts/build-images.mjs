import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { watermarkConfig } from './watermark.config.mjs'

const ROOT = path.resolve(process.cwd())
const SRC_PHOTOS_DIR = path.join(ROOT, 'src', 'assets', 'photos')
const SRC_BANNER_DIR = path.join(ROOT, 'src', 'assets', 'banner')
const OUT_DIR = path.join(ROOT, 'public', 'thumbs')
// Original images with watermark (if enabled)
const WATERMARKED_DIR = path.join(ROOT, 'public', 'watermarked')
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

function getWatermarkSvg(width, height) {
  const { text, position, opacity, fontSize, color } = watermarkConfig

  // Base font size assumes a ~2000px wide image, scale relative to actual image
  const scale = Math.max(0.4, width / 2000)
  const actualSize = Math.round(fontSize * scale)
  const margin = Math.round(actualSize * 1.5)

  let x, y, anchor, dominantBaseline

  switch (position) {
    case 'center':
      x = width / 2
      y = height / 2
      anchor = 'middle'
      dominantBaseline = 'middle'
      break
    case 'top-left':
      x = margin
      y = margin
      anchor = 'start'
      dominantBaseline = 'hanging'
      break
    case 'top-right':
      x = width - margin
      y = margin
      anchor = 'end'
      dominantBaseline = 'hanging'
      break
    case 'bottom-left':
      x = margin
      y = height - margin
      anchor = 'start'
      dominantBaseline = 'auto'
      break
    case 'bottom-right':
    default:
      x = width - margin
      y = height - margin
      anchor = 'end'
      dominantBaseline = 'auto'
      break
  }

  // Use a slight drop shadow for readability on light backgrounds
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <text
        x="${x}" y="${y}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${actualSize}px"
        font-weight="bold"
        fill="#000000"
        fill-opacity="${opacity * 0.8}"
        text-anchor="${anchor}"
        dominant-baseline="${dominantBaseline}"
      >
        ${text}
      </text>
      <text
        x="${x - 1}" y="${y - 1}"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="${actualSize}px"
        font-weight="bold"
        fill="${color}"
        fill-opacity="${opacity}"
        text-anchor="${anchor}"
        dominant-baseline="${dominantBaseline}"
      >
        ${text}
      </text>
    </svg>
  `)
}

/**
 * Process a single image file: generate WebP thumbnails and watermarked full-res if needed
 */
async function processImage(file) {
  const baseName = path.basename(file, path.extname(file))
  const ext = path.extname(file)
  const urls = {}
  let generated = 0
  let skipped = 0
  let aspectRatio = null

  // Check if thumbnails exist
  const thumbPaths = WIDTHS.map(w => path.join(OUT_DIR, `${baseName}-${w}.webp`))
  let allThumbsExist = true
  for (const t of thumbPaths) {
    if (!(await exists(t))) allThumbsExist = false
  }

  // Check if watermarked original exists (if we need one)
  const wmOriginalPath = path.join(WATERMARKED_DIR, `${baseName}${ext}`)
  const needWmOriginal = watermarkConfig.enabled && ['originals', 'both'].includes(watermarkConfig.applyTo)
  const wmOriginalExists = needWmOriginal ? await exists(wmOriginalPath) : true

  if (allThumbsExist && wmOriginalExists) {
    if (needWmOriginal) urls.original = `/watermarked/${baseName}${ext}`

    // Set thumb URLs
    for (const w of WIDTHS) {
      urls[w] = `/thumbs/${baseName}-${w}.webp`
    }

    // Read only metadata for aspect ratio
    try {
      const meta = await sharp(file).metadata()
      if (meta.width && meta.height) {
        aspectRatio = Math.round((meta.width / meta.height) * 10000) / 10000
      }
    } catch { /* ignore */ }

    return { urls, aspectRatio }
  }

  // Not everything is cached, we need to read the buffer
  const originalBuffer = await fs.readFile(file)
  const meta = await sharp(originalBuffer).metadata()
  const width = meta.width || 2000
  const height = meta.height || 1333
  aspectRatio = Math.round((width / height) * 10000) / 10000

  let sourceBufferForThumbs = originalBuffer

  // 1. Watermark the original
  if (needWmOriginal) {
    if (!wmOriginalExists) {
      const compositeBuffer = await sharp(originalBuffer)
        .composite([{ input: getWatermarkSvg(width, height), blend: 'over' }])
        .toBuffer()

      await sharp(compositeBuffer).toFile(wmOriginalPath)

      if (watermarkConfig.applyTo === 'both') {
        sourceBufferForThumbs = compositeBuffer
      }
      generated++
    }
    urls.original = `/watermarked/${baseName}${ext}`
  } else if (watermarkConfig.enabled && watermarkConfig.applyTo === 'thumbnails') {
    // Need to composite the source buffer just for the thumbnails without saving full-res
    sourceBufferForThumbs = await sharp(originalBuffer)
      .composite([{ input: getWatermarkSvg(width, height), blend: 'over' }])
      .toBuffer()
  }

  // 2. Generate Thumbnails
  for (const w of WIDTHS) {
    const outPath = path.join(OUT_DIR, `${baseName}-${w}.webp`)
    if (!(await exists(outPath))) {
      const target = Math.min(width, w)
      await sharp(sourceBufferForThumbs)
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: qualityFor(w), effort: 5 })
        .toFile(outPath)
      generated++
    } else {
      skipped++
    }
    urls[w] = `/thumbs/${baseName}-${w}.webp`
  }

  const status = `✓ generated ${generated}`
  console.log(`  ${status}: ${path.relative(ROOT, file)}`)

  return { urls, aspectRatio }
}

async function build() {
  const manifest = {}
  await ensureDir(OUT_DIR)
  await ensureDir(WATERMARKED_DIR)
  await ensureDir(path.dirname(MANIFEST_PATH))

  console.log('Processing photos…')
  for await (const file of walk(SRC_PHOTOS_DIR)) {
    if (!isImage(file)) continue

    const relFromSrc = '/' + path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/')
    const { urls, aspectRatio } = await processImage(file)

    const prodSrc = `/assets/${path.basename(file)}`
    const srcset = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    // Production paths (used in the built site)
    manifest[prodSrc] = urls[800] || urls[1200]
    manifest[prodSrc + '__srcset'] = srcset
    if (aspectRatio !== null) manifest[prodSrc + '__ar'] = aspectRatio
    if (urls.original) manifest[prodSrc + '__original'] = urls.original

    // Dev paths (used by Vite dev server, which serves from /src/)
    manifest['/src' + relFromSrc] = urls[800] || urls[1200]
    manifest['/src' + relFromSrc + '__srcset'] = srcset
    if (aspectRatio !== null) manifest['/src' + relFromSrc + '__ar'] = aspectRatio
    if (urls.original) manifest['/src' + relFromSrc + '__original'] = urls.original
  }

  console.log('Processing banners…')
  for await (const file of walk(SRC_BANNER_DIR)) {
    if (!isImage(file)) continue

    const relFromSrc = '/' + path.relative(path.join(ROOT, 'src'), file).replace(/\\/g, '/')
    const { urls, aspectRatio } = await processImage(file)

    const prodSrc = `/assets/${path.basename(file)}`
    const srcset = `${urls[400]} 400w, ${urls[800]} 800w, ${urls[1200]} 1200w`

    manifest[prodSrc] = urls[800] || urls[1200]
    manifest[prodSrc + '__srcset'] = srcset
    if (aspectRatio !== null) manifest[prodSrc + '__ar'] = aspectRatio
    if (urls.original) manifest[prodSrc + '__original'] = urls.original

    // Dev paths (used by Vite dev server, which serves from /src/)
    manifest['/src' + relFromSrc] = urls[800] || urls[1200]
    manifest['/src' + relFromSrc + '__srcset'] = srcset
    if (aspectRatio !== null) manifest['/src' + relFromSrc + '__ar'] = aspectRatio
    if (urls.original) manifest['/src' + relFromSrc + '__original'] = urls.original
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`\nWrote manifest with ${Object.keys(manifest).length} entries → ${MANIFEST_PATH}`)
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
