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
    img.decoding = 'async'
    img.fetchPriority = 'low' as any
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

function JustifiedGallery({ items, onOpen, thumbsByOriginal }: { items: ImageItem[], onOpen: (globalIndex: number) => void, thumbsByOriginal: Record<string, string> }) {
  const gap = 14
  const [ref, width] = useContainerWidth<HTMLDivElement>()
  const [withRatios, setWithRatios] = useState<JustifiedItem[]>([])

  // Parallelize aspect loading with a small concurrency limit to avoid bursts
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const concurrency = 8
      const queue: Promise<void>[] = []
      const enriched: JustifiedItem[] = new Array(items.length)

      let nextIndex = 0
      async function worker() {
        while (true) {
          const i = nextIndex++
          if (i >= items.length) break
          const it = items[i]
          const ratio = await loadImageAspect(it.src)
          const r = getFilenameSeed(it.src)
          const tweak = 1 + (r - 0.5) * 0.2
          const aspectRatio = Math.max(0.3, Math.min(3.5, ratio * tweak))
          const e = { ...it, aspectRatio } as JustifiedItem & { __globalIndex?: number }
          ;(e as any).__globalIndex = i
          enriched[i] = e
        }
      }
      for (let c = 0; c < concurrency; c++) queue.push(worker())
      await Promise.all(queue)
      if (!cancelled) setWithRatios(enriched)
    })()
    return () => { cancelled = true }
  }, [items])

  const baseRowHeight = width >= 1024 ? 260 : width >= 640 ? 220 : 200
  const rows = useMemo(() => computeRows(withRatios, width, gap, baseRowHeight), [withRatios, width, gap, baseRowHeight])

  // Virtualize rows based on scroll position relative to gallery container
  const containerRef = ref
  const [visibleRange, setVisibleRange] = useState<{ start: number, end: number }>({ start: 0, end: 0 })
  const totalHeights = useMemo(() => {
    const heights = rows.map((r) => r.height)
    return heights
  }, [rows])
  const cumulative = useMemo(() => {
    const out: number[] = new Array(totalHeights.length + 1)
    out[0] = 0
    for (let i = 0; i < totalHeights.length; i++) {
      // include margin gap between rows except before the first
      out[i + 1] = out[i] + totalHeights[i] + (i === totalHeights.length - 1 ? 0 : gap)
    }
    return out
  }, [totalHeights, gap])
  const totalHeight = cumulative[cumulative.length - 1] || 0

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const rect = el.getBoundingClientRect()
        const viewportTop = Math.max(0, -rect.top)
        const viewportHeight = window.innerHeight
        const buffer = 800
        const viewStart = Math.max(0, viewportTop - buffer)
        const viewEnd = viewportTop + viewportHeight + buffer
        // binary search cumulative to find indices
        const start = Math.max(0, lowerBound(cumulative, viewStart) - 1)
        const end = Math.min(rows.length, lowerBound(cumulative, viewEnd) + 1)
        setVisibleRange((prev) => (prev.start !== start || prev.end !== end ? { start, end } : prev))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [containerRef, cumulative, rows.length])

  const startIndex = visibleRange.start
  const endIndex = Math.min(rows.length, Math.max(visibleRange.end, startIndex + 6)) // ensure some rows on first render
  const topSpacer = cumulative[startIndex] || 0
  const bottomSpacer = totalHeight - (cumulative[endIndex] || 0)

  return (
    <div ref={ref} className="jg">
      {topSpacer > 0 && (
        <div style={{ height: `${topSpacer}px` }} />
      )}
      {rows.slice(startIndex, endIndex).map((row, ri) => (
        <div key={startIndex + ri} className="jg-row" style={{ display: 'flex', gap: `${gap}px`, marginBottom: `${gap}px`, contentVisibility: 'auto', containIntrinsicSize: `${Math.round(row.height)}px` as any }}>
          {row.items.map(({ item, width: w, height: h, globalIndex }) => {
            const thumb = thumbsByOriginal[item.src]
            {if (!thumbsByOriginal) {
              console.log("missing thumbsByOriginal")
            }}
            {if (!thumb) {
              console.log("missing thumb for ", item.src)
            }}
            const displaySrc = thumb || item.src
            return (
              <button
                key={item.src}
                className="jg-item"
                onClick={() => onOpen(globalIndex)}
                aria-label={`Open ${item.alt}`}
                style={{ width: `${w}px`, height: `${h}px`, padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in' }}
              >
                <img loading="lazy" decoding="async" fetchPriority="low" src={displaySrc} alt={item.alt} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)', display: 'block' }} />
              </button>
            )
          })}
        </div>
      ))}
      {bottomSpacer > 0 && (
        <div style={{ height: `${bottomSpacer}px` }} />
      )}
    </div>
  )
}

function lowerBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function ExifPanel({ src, exif, setExif }: { src: string, exif: { fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null, setExif: (v: any) => void }) {
  useEffect(() => {
    let cancelled = false
    if (!src) return
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
  const [thumbsManifest, setThumbsManifest] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    fetch('/generated/manifest.json')
      .then((r) => r.ok ? r.json() : {})
      .then((m) => { if (!cancelled) setThumbsManifest(m || {}) })
      .catch(() => { if (!cancelled) setThumbsManifest({}) })
    return () => { cancelled = true }
  }, [])

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

  // Track URL and scroll to keep UX stable on mobile back/close
  const previousUrlRef = useRef<string | null>(null)
  const savedScrollRef = useRef<number>(0)

  const openLightbox = (index: number) => {
    savedScrollRef.current = window.scrollY
    // Save previous URL including hash to restore on manual close
    previousUrlRef.current = window.location.href
    // Push a hash identifying the lightbox so Back will close it
    const newHash = `#lb=${index}`
    if (window.location.hash !== newHash) {
      window.history.pushState({ lb: index }, '', newHash)
    } else {
      // Ensure we still create a history entry even if same hash
      window.history.pushState({ lb: index, dup: Date.now() }, '')
    }
    setLightboxIndex(index)
  }

  const closeLightbox = () => {
    // If we are currently showing a lightbox hash, restore previous URL without navigating
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#lb=')) {
      const prev = previousUrlRef.current
      if (prev) {
        window.history.replaceState(null, '', prev)
      } else {
        // If no previous captured, just remove the hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    setLightboxIndex(null)
    setExif(null)
  }

  // Close lightbox on browser Back. Preserve scroll position.
  useEffect(() => {
    function onPopState() {
      // If leaving a lightbox state, close it and restore scroll
      if (lightboxIndex !== null) {
        setLightboxIndex(null)
        setExif(null)
        // Defer to override any hash-scroll that may occur
        const y = savedScrollRef.current
        if (typeof y === 'number') {
          setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' as any }), 0)
        }
      } else {
        // Handle deep-links like #lb=12 opened directly
        const m = /^#lb=(\d+)$/.exec(window.location.hash)
        if (m) {
          const idx = parseInt(m[1], 10)
          if (!Number.isNaN(idx)) {
            // Don't push new state here; just set UI state
            setLightboxIndex(idx)
          }
        }
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [lightboxIndex])

  // On initial load, open lightbox if URL contains an lb hash
  useEffect(() => {
    const m = /^#lb=(\d+)$/.exec(window.location.hash)
    if (m) {
      const idx = parseInt(m[1], 10)
      if (!Number.isNaN(idx)) {
        previousUrlRef.current = window.location.href
        setLightboxIndex(idx)
      }
    }
  }, [])
  const showPrev = () => setLightboxIndex((idx) => {
    if (idx === null) return null
    setExif(null)
    return (idx + allImages.length - 1) % allImages.length
  })
  const showNext = () => setLightboxIndex((idx) => {
    if (idx === null) return null
    setExif(null)
    return (idx + 1) % allImages.length
  })

  // Clear EXIF whenever the displayed image changes so it refetches
  useEffect(() => {
    if (lightboxIndex !== null) {
      setExif(null)
    }
  }, [lightboxIndex])

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <div className="brand">
            <a href="#hero" className="brand-logo-link" aria-label="Xenosumedia Home">
              <img className="brand-logo" src="/logo-dark.png" alt="Xenosumedia logo" decoding="async" fetchPriority="low" />
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
            {bannerUrl && <img className="hero-img" src={bannerUrl} alt="" decoding="async" fetchPriority="high" />}
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
              thumbsByOriginal={thumbsManifest}
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
            decoding="async"
            fetchPriority="high"
          />
          {/* EXIF on-demand */}
          <ExifPanel
            key={allImages[lightboxIndex].src}
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
