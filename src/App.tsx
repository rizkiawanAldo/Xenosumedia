import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { SiteHeader } from './components/SiteHeader'
import { HeroSection } from './components/HeroSection'
import { GallerySection } from './components/GallerySection'
import { InfoGrid } from './components/InfoGrid'
import { SiteFooter } from './components/SiteFooter'
import { Lightbox } from './components/Lightbox'
import { siteConfig } from './site.config'
import type { ImageItem } from './lib/gallery'

// import manifest data
import thumbsManifestData from './generated/manifest.json'

function App() {
  const base = import.meta.env.BASE_URL
  const thumbsManifest: Record<string, string> = Object.fromEntries(
    Object.entries(thumbsManifestData as Record<string, string | number>).map(([k, v]) => [
      k,
      typeof v === 'number'
        ? String(v)
        : (v as string).replace(/(^|,\s*)\//g, `$1${base}`),
    ])
  )

  const { imagesByCategory, allImagesWithIndex } = useMemo(() => {
    const all = import.meta.glob('./assets/photos/*/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    const byCat: Record<string, (ImageItem & { originalIndex: number })[]> = {}
    const flatList: ImageItem[] = []

    Object.entries(all)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([path, url]) => {
        const parts = path.split('/')
        const folder = parts[parts.indexOf('photos') + 1] || 'Misc'
        const category = titleCase(folder)
        const filename = parts[parts.length - 1] || ''
        const name = filename.replace(/\.[^.]+$/, '')

        flatList.push({ src: url, alt: `${category} ${name}`, category, originalPath: path })
      })

    // Now assign originalIndex
    flatList.forEach((item, index) => {
      if (!byCat[item.category]) byCat[item.category] = []
      byCat[item.category].push({ ...item, originalIndex: index })
    })

    return { imagesByCategory: byCat, allImagesWithIndex: flatList }
  }, [])

  const bannerUrl = useMemo(() => {
    const banners = import.meta.glob('./assets/banner/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
    const first = Object.entries(banners).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))[0]?.[1]
    return first || ''
  }, [])

  const heroThumbnail = useMemo(() => {
    if (!bannerUrl) return ''
    const filename = bannerUrl.split('/').pop() || ''
    const manifestKey = `/assets/${filename}`
    return thumbsManifest[manifestKey] || bannerUrl
  }, [bannerUrl, thumbsManifest])

  const categories = useMemo(() => Object.keys(imagesByCategory), [imagesByCategory])

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [exif, setExif] = useState<{ fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null>(null)

  const previousUrlRef = useRef<string | null>(null)
  const savedScrollRef = useRef<number>(0)

  const openLightbox = (index: number) => {
    savedScrollRef.current = window.scrollY
    previousUrlRef.current = window.location.href
    const newHash = `#lb=${index}`
    if (window.location.hash !== newHash) {
      window.history.pushState({ lb: index }, '', newHash)
    } else {
      window.history.pushState({ lb: index, dup: Date.now() }, '')
    }
    setLightboxIndex(index)
  }

  const closeLightbox = () => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#lb=')) {
      const prev = previousUrlRef.current
      if (prev) {
        window.history.replaceState(null, '', prev)
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    setLightboxIndex(null)
    setExif(null)
  }

  useEffect(() => {
    function onPopState() {
      if (lightboxIndex !== null) {
        setLightboxIndex(null)
        setExif(null)
        const y = savedScrollRef.current
        if (typeof y === 'number') {
          setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' as any }), 0)
        }
      } else {
        const m = /^#lb=(\d+)$/.exec(window.location.hash)
        if (m) {
          const idx = parseInt(m[1], 10)
          if (!Number.isNaN(idx)) {
            setLightboxIndex(idx)
          }
        }
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [lightboxIndex])

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
    return (idx + allImagesWithIndex.length - 1) % allImagesWithIndex.length
  })

  const showNext = () => setLightboxIndex((idx) => {
    if (idx === null) return null
    setExif(null)
    return (idx + 1) % allImagesWithIndex.length
  })

  useEffect(() => {
    if (lightboxIndex !== null) {
      setExif(null)
    }
  }, [lightboxIndex])

  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (!els.length) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [categories])

  // Apply theme variables from config
  useEffect(() => {
    Object.entries(siteConfig.theme).forEach(([key, value]) => {
      // transform camelCase to kebab-case
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`
      document.documentElement.style.setProperty(cssVar, value)
    })
  }, [])

  return (
    <div className="site">
      <SiteHeader />

      <main>
        <HeroSection heroThumbnail={heroThumbnail} bannerUrl={bannerUrl} />

        {categories.map((cat, catIdx) => (
          <GallerySection
            key={cat}
            category={cat}
            items={imagesByCategory[cat]}
            thumbsByOriginal={thumbsManifest}
            eagerRowCount={catIdx === 0 ? 1 : 0}
            onOpen={openLightbox}
          />
        ))}

        <InfoGrid />
      </main>

      {lightboxIndex !== null && (
        <Lightbox
          index={lightboxIndex}
          images={allImagesWithIndex}
          exif={exif}
          setExif={setExif}
          onClose={closeLightbox}
          onPrev={showPrev}
          onNext={showNext}
          thumbsManifest={thumbsManifest}
        />
      )}

      <SiteFooter />
    </div>
  )
}

export default App
