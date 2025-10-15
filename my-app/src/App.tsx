import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

type CategoryKey = string

type ImageItem = {
  src: string
  alt: string
  category: CategoryKey
}

type JustifiedItem = ImageItem & {
  aspectRatio: number
}

type JustifiedRow = {
  items: { item: JustifiedItem, width: number, height: number, globalIndex: number }[]
  height: number
}

function getFilenameSeed(s: string): number {
  const name = s.split('?')[0].split('#')[0].split('/').pop() || s
  let h = 2166136261 >>> 0 // FNV-1a basis
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
    h >>>= 0
  }
  // map to [0,1)
  return (h % 100000) / 100000
}

function useContainerWidth<T extends HTMLElement>(): [MutableRefObject<T | null>, number] {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        setWidth(Math.floor(cr.width))
      }
    })
    ro.observe(el)
    setWidth(Math.floor(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function loadImageAspect(src: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.naturalHeight === 0) {
        resolve(1)
        return
      }
      resolve(img.naturalWidth / img.naturalHeight)
    }
    img.onerror = () => resolve(1)
    img.src = src
  })
}

function computeRows(
  items: JustifiedItem[],
  containerWidth: number,
  gap: number,
  baseRowHeight: number
): JustifiedRow[] {
  const rows: JustifiedRow[] = []
  if (containerWidth <= 0 || items.length === 0) return rows

  let currentRow: JustifiedItem[] = []
  let currentWidthAtBase = 0 // sum of (aspect * baseRowHeight) + gaps
  let rowIndex = 0

  const pushRow = (rowItems: JustifiedItem[]) => {
    if (rowItems.length === 0) return
    // subtle, stable jitter per row based on first item's seed
    const seed = getFilenameSeed(rowItems[0].src)
    const jitter = 1 + (seed - 0.5) * 0.12 // ±6%
    const targetRowHeight = baseRowHeight * jitter

    const totalAspect = rowItems.reduce((sum, it) => sum + it.aspectRatio, 0)
    const totalGap = gap * (rowItems.length - 1)
    const height = (containerWidth - totalGap) / totalAspect
    const finalHeight = Math.max(80, Math.min(targetRowHeight, height * 1.2))

    const itemsWithSizes = rowItems.map((it) => {
      const width = it.aspectRatio * finalHeight
      return { item: it, width, height: finalHeight, globalIndex: (it as any).__globalIndex as number }
    })
    rows.push({ items: itemsWithSizes, height: finalHeight })
    rowIndex++
  }

  for (const it of items) {
    const tentativeWidth = it.aspectRatio * baseRowHeight
    const gaps = gap * (currentRow.length)
    if (currentRow.length > 0 && currentWidthAtBase + tentativeWidth + gaps > containerWidth * 1.15) {
      pushRow(currentRow)
      currentRow = []
      currentWidthAtBase = 0
    }
    currentRow.push(it)
    currentWidthAtBase += tentativeWidth
  }
  if (currentRow.length) pushRow(currentRow)
  return rows
}

function JustifiedGallery({ items, onOpen }: { items: ImageItem[], onOpen: (globalIndex: number) => void }) {
  const gap = 14
  const [ref, width] = useContainerWidth<HTMLDivElement>()
  const [withRatios, setWithRatios] = useState<JustifiedItem[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const enriched: JustifiedItem[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const ratio = await loadImageAspect(it.src)
        // subtle, stable per-image tweak ±10% to aspect weight
        const r = getFilenameSeed(it.src)
        const tweak = 1 + (r - 0.5) * 0.2
        const aspectRatio = Math.max(0.3, Math.min(3.5, ratio * tweak))
        const e = { ...it, aspectRatio } as JustifiedItem & { __globalIndex?: number }
        ;(e as any).__globalIndex = i
        enriched.push(e)
      }
      if (!cancelled) setWithRatios(enriched)
    })()
    return () => { cancelled = true }
  }, [items])

  const baseRowHeight = width >= 1024 ? 260 : width >= 640 ? 220 : 200
  const rows = useMemo(() => computeRows(withRatios, width, gap, baseRowHeight), [withRatios, width, gap, baseRowHeight])

  return (
    <div ref={ref} className="jg">
      {rows.map((row, ri) => (
        <div key={ri} className="jg-row" style={{ display: 'flex', gap: `${gap}px`, marginBottom: `${gap}px` }}>
          {row.items.map(({ item, width: w, height: h, globalIndex }) => (
            <button
              key={item.src}
              className="jg-item"
              onClick={() => onOpen(globalIndex)}
              aria-label={`Open ${item.alt}`}
              style={{ width: `${w}px`, height: `${h}px`, padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in' }}
            >
              <img loading="lazy" src={item.src} alt={item.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)', display: 'block' }} />
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function ExifPanel({ src, exif, setExif }: { src: string, exif: { fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null, setExif: (v: any) => void }) {
  useEffect(() => {
    let cancelled = false
    if (!src || exif) return
    ;(async () => {
      try {
        const { parse } = await import('exifr')
        const data = await parse(src, { pick: [
          'FNumber', 'ExposureTime', 'ISO', 'FocalLength'
        ] }) as any
        if (cancelled) return
        setExif({
          fNumber: data?.FNumber,
          exposureTime: data?.ExposureTime,
          ISO: data?.ISO,
          focalLength: data?.FocalLength
        })
      } catch {
        if (!cancelled) setExif(null)
      }
    })()
    return () => { cancelled = true }
  }, [src])

  if (!exif) return null

  const fmtAperture = exif.fNumber ? `f/${exif.fNumber.toFixed(1)}` : '—'
  const fmtExposure = typeof exif.exposureTime === 'number'
    ? (exif.exposureTime >= 1 ? `${exif.exposureTime.toFixed(0)} sec` : `1/${Math.round(1 / exif.exposureTime)} sec`)
    : '—'
  const fmtISO = exif.ISO ? `ISO ${exif.ISO}` : '—'
  const fmtFocal = exif.focalLength ? `${Math.round(exif.focalLength)} mm` : '—'

  return (
    <div className="exif-panel" onClick={(e) => e.stopPropagation()}>
      <div className="exif-item">{fmtAperture}</div>
      <div className="exif-sep">•</div>
      <div className="exif-item">{fmtExposure}</div>
      <div className="exif-sep">•</div>
      <div className="exif-item">{fmtISO}</div>
      <div className="exif-sep">•</div>
      <div className="exif-item">{fmtFocal}</div>
    </div>
  )
}

function App() {
  const imagesByCategory: Record<CategoryKey, ImageItem[]> = useMemo(() => {
    // Import all images in any subfolder under photos as URLs (Vite v7: use query/import)
    const all = import.meta.glob('./assets/photos/*/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

    const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    const byCat: Record<CategoryKey, ImageItem[]> = {}
    Object.entries(all)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([path, url]) => {
        // path example: './assets/photos/event/20251011-XNS03439.jpg'
        const parts = path.split('/')
        const folder = parts[parts.indexOf('photos') + 1] || 'Misc'
        const category = titleCase(folder)
        const filename = parts[parts.length - 1] || ''
        const name = filename.replace(/\.[^.]+$/, '')
        const item: ImageItem = { src: url, alt: `${category} ${name}`, category }
        if (!byCat[category]) byCat[category] = []
        byCat[category].push(item)
      })

    return byCat
  }, [])

  // Hero banner: import first image from src/assets/banner
  const bannerUrl = useMemo(() => {
    const banners = import.meta.glob('./assets/banner/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    const first = Object.entries(banners).sort(([a],[b]) => a.localeCompare(b, undefined, { numeric: true }))[0]?.[1]
    return first || ''
  }, [])

  const categories: CategoryKey[] = useMemo(() => Object.keys(imagesByCategory), [imagesByCategory])
  const allImages: ImageItem[] = useMemo(() => categories.flatMap((c) => imagesByCategory[c] || []), [categories, imagesByCategory])

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [exif, setExif] = useState<{ fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null>(null)

  const openLightbox = (index: number) => setLightboxIndex(index)
  const closeLightbox = () => { setLightboxIndex(null); setExif(null) }
  const showPrev = () => setLightboxIndex((idx) => (idx === null ? null : (idx + allImages.length - 1) % allImages.length))
  const showNext = () => setLightboxIndex((idx) => (idx === null ? null : (idx + 1) % allImages.length))

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            <a href="#hero" className="brand-logo-link" aria-label="Xenosumedia Home">
              <img className="brand-logo" src="/logo-dark.png" alt="Xenosumedia logo" />
            </a>
          </div>
          <nav className="nav">
      
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
        </div>
      </header>

      <main>
        <section id="hero" className="hero">
          <div className="hero-bg">
            {bannerUrl && <img className="hero-img" src={bannerUrl} alt="" />}
          </div>
          <div className="hero-scrim" />
          <div className="hero-content">
            <h1 className="hero-title">Xenosumedia</h1>
            <p className="hero-subtitle">Tell your moments, tell your story</p>
          </div>
        </section>

        {categories.map((cat) => (
          <section key={cat} id={cat.toLowerCase()} className="gallery-section">
            <div className="section-header">
              <h2>{cat}</h2>
            </div>
            <JustifiedGallery
              items={imagesByCategory[cat]}
              onOpen={(globalIndex) => {
                const img = imagesByCategory[cat][globalIndex]
                const idx = allImages.findIndex((g) => g === img)
                if (idx >= 0) openLightbox(idx)
              }}
            />
          </section>
        ))}

        <section id="pricing" className="pricing">
          <h2>Pricing</h2>
          <span>Contact for pricing</span>
        </section>

        <section id="about" className="about">
          <h2>About</h2>
          <p>
            Xenosumedia captures authentic moments across portraits, events, sports, and landscapes. The goal is simple:
            make you feel the story in every frame.
          </p>
        </section>

        <section id="contact" className="contact">
          <h2>Contact</h2>
          <p>Email: <a href="mailto:hello@xenosumedia.com">xenosumedia@gmail.com</a></p>
          <p>Instagram: <a href="https://www.instagram.com/xenosumedia/">@xenosumedia</a></p>
        </section>
      </main>

      {lightboxIndex !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={closeLightbox}>
          <button className="lightbox-close" aria-label="Close" onClick={closeLightbox}>×</button>
          <button className="lightbox-prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); showPrev(); }}>‹</button>
          <img
            className="lightbox-image"
            src={allImages[lightboxIndex].src}
            alt={allImages[lightboxIndex].alt}
            onClick={(e) => e.stopPropagation()}
          />
          {/* EXIF on-demand */}
          <ExifPanel
            src={allImages[lightboxIndex].src}
            exif={exif}
            setExif={setExif}
          />
          <button className="lightbox-next" aria-label="Next" onClick={(e) => { e.stopPropagation(); showNext(); }}>›</button>
        </div>
      )}

      <footer className="site-footer">
        <small>© {new Date().getFullYear()} Xenosumedia. All rights reserved.</small>
      </footer>
    </div>
  )
}

export default App
