import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImageItem, JustifiedItem } from '../lib/gallery'
import {
    computeRows,
    findThumbnail,
    loadImageAspect,
} from '../lib/gallery'
import { useContainerWidth } from '../hooks/useContainerWidth'
import { siteConfig } from '../site.config'

// How many rows to always keep mounted regardless of scroll position (for LCP)
const ALWAYS_MOUNT_ROWS = 3

function JustifiedGallery({
    items,
    onOpen,
    thumbsByOriginal,
    eagerRowCount,
    layout,
}: {
    items: (ImageItem & { originalIndex: number })[]
    onOpen: (originalIndex: number) => void
    thumbsByOriginal: Record<string, string>
    eagerRowCount: number
    layout: 'justified' | 'orientation-dense'
}) {
    const gap = 14
    const [ref, width] = useContainerWidth<HTMLDivElement>()
    const [withRatios, setWithRatios] = useState<JustifiedItem[]>([])

    useEffect(() => {
        // Fast path: use aspect ratios baked into the manifest at build time
        let itemsWithBakedRatios: JustifiedItem[] = items.map((it) => {
            const arKey = it.originalPath.replace(/^\.\//, '/src/') + '__ar'
            const bakedAr = thumbsByOriginal[arKey]
            const aspectRatio = bakedAr ? Math.max(0.3, Math.min(3.5, Number(bakedAr))) : 1.5
            return { ...it, aspectRatio, __globalIndex: it.originalIndex }
        })

        // If orientation-dense, sort them so portraits and landscapes are grouped
        if (layout === 'orientation-dense') {
            const portraits = itemsWithBakedRatios.filter((it) => it.aspectRatio < 1)
            const landscapes = itemsWithBakedRatios.filter((it) => it.aspectRatio >= 1)
            itemsWithBakedRatios = [...portraits, ...landscapes]
        }

        setWithRatios(itemsWithBakedRatios)

        // Fallback async probe
        const missing = itemsWithBakedRatios
            .map((it, i) => ({ it, i }))
            .filter(({ it }) => it.aspectRatio === 1.5 && !thumbsByOriginal[it.originalPath.replace(/^\.\//, '/src/') + '__ar'])

        if (missing.length === 0) return

        let cancelled = false
            ; (async () => {
                const enriched = [...itemsWithBakedRatios]
                await Promise.all(
                    missing.map(async ({ it, i }) => {
                        try {
                            const thumb = findThumbnail(it.originalPath, thumbsByOriginal)
                            const ratio = await loadImageAspect(thumb || it.src)
                            const aspectRatio = Math.max(0.3, Math.min(3.5, ratio))
                            enriched[i] = { ...it, aspectRatio } as JustifiedItem
                        } catch {
                            /* keep default */
                        }
                    })
                )
                if (!cancelled) setWithRatios(enriched)
            })()

        return () => {
            cancelled = true
        }
    }, [items, thumbsByOriginal, layout])

    const baseRowHeight = width >= 1024 ? 260 : width >= 640 ? 220 : 200
    const rows = useMemo(
        () => computeRows(withRatios, width, gap, baseRowHeight),
        [withRatios, width, gap, baseRowHeight]
    )

    const [mountedRows, setMountedRows] = useState<Set<number>>(
        () => new Set(Array.from({ length: ALWAYS_MOUNT_ROWS }, (_, i) => i))
    )

    useEffect(() => {
        setMountedRows(new Set(Array.from({ length: ALWAYS_MOUNT_ROWS }, (_, i) => i)))
    }, [items])

    const rowRefs = useRef<(HTMLDivElement | null)[]>([])
    useEffect(() => {
        if (rows.length === 0) return
        const io = new IntersectionObserver(
            (entries) => {
                const toAdd: number[] = []
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const idx = Number((entry.target as HTMLElement).dataset.rowIdx)
                        if (!Number.isNaN(idx)) toAdd.push(idx)
                    }
                }
                if (toAdd.length > 0) {
                    setMountedRows((prev) => {
                        const next = new Set(prev)
                        toAdd.forEach((i) => next.add(i))
                        return next
                    })
                }
            },
            { rootMargin: '600px 0px', threshold: 0 }
        )
        rowRefs.current.forEach((el) => el && io.observe(el))
        return () => io.disconnect()
    }, [rows.length])

    useEffect(() => {
        if (rows.length === 0) return
        const mountAll = () => {
            setMountedRows((prev) => {
                if (prev.size >= rows.length) return prev
                const next = new Set(prev)
                for (let i = 0; i < rows.length; i++) next.add(i)
                return next
            })
        }
        const ric =
            typeof requestIdleCallback !== 'undefined'
                ? requestIdleCallback(mountAll, { timeout: 1500 })
                : (setTimeout(mountAll, 800) as unknown as number)
        return () => {
            if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(ric)
            else clearTimeout(ric)
        }
    }, [rows.length])

    return (
        <div ref={ref} className="jg">
            {rows.map((row, ri) => {
                const isMounted = mountedRows.has(ri)
                const rowHeight = Math.round(row.height)
                return (
                    <div
                        key={ri}
                        ref={(el) => {
                            rowRefs.current[ri] = el
                        }}
                        data-row-idx={String(ri)}
                        className="jg-row"
                        style={{
                            display: 'flex',
                            gap: `${gap}px`,
                            marginBottom: `${gap}px`,
                            ...(isMounted ? {} : { height: `${rowHeight}px`, flexWrap: 'wrap' }),
                        }}
                    >
                        {isMounted &&
                            row.items.map(({ item, width: w, height: h, globalIndex }) => {
                                const displaySrc = findThumbnail(item.originalPath, thumbsByOriginal) || item.src
                                const isPriorityRow = ri < Math.max(0, eagerRowCount || 0)
                                const loading = isPriorityRow ? 'eager' : 'lazy'
                                const fetchPriority = isPriorityRow ? 'high' : 'low'
                                return (
                                    <button
                                        key={item.src}
                                        className="jg-item"
                                        data-index={globalIndex}
                                        onClick={() => onOpen(globalIndex)}
                                        aria-label={`Open ${item.alt}`}
                                        style={{
                                            width: `${w}px`,
                                            height: `${h}px`,
                                            padding: 0,
                                            border: 0,
                                            background: 'transparent',
                                            cursor: 'zoom-in',
                                        }}
                                    >
                                        <div className="jg-img" style={{ width: '100%', height: '100%' }}>
                                            <div className="jg-shimmer" aria-hidden="true" />
                                            <img
                                                loading={loading as any}
                                                decoding="async"
                                                fetchPriority={fetchPriority as any}
                                                src={displaySrc}
                                                alt={item.alt}
                                                width={w}
                                                height={h}
                                                onLoad={(e) =>
                                                    (e.currentTarget.parentElement as HTMLElement)?.classList.add('loaded')
                                                }
                                                onError={(e) =>
                                                    (e.currentTarget.parentElement as HTMLElement)?.classList.add('loaded')
                                                }
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'cover',
                                                    borderRadius: 'var(--radius)',
                                                    display: 'block',
                                                }}
                                            />
                                        </div>
                                    </button>
                                )
                            })}
                    </div>
                )
            })}
        </div>
    )
}

function GridGallery({
    items,
    onOpen,
    thumbsByOriginal,
    eagerRowCount,
}: {
    items: (ImageItem & { originalIndex: number })[]
    onOpen: (originalIndex: number) => void
    thumbsByOriginal: Record<string, string>
    eagerRowCount: number
}) {
    return (
        <div className="gallery-grid">
            {items.map((item, index) => {
                const displaySrc = findThumbnail(item.originalPath, thumbsByOriginal) || item.src
                const isPriority = index < (eagerRowCount > 0 ? 8 : 0)
                return (
                    <button
                        key={item.src}
                        className="grid-item"
                        data-index={item.originalIndex}
                        onClick={() => onOpen(item.originalIndex)}
                        aria-label={`Open ${item.alt}`}
                    >
                        <div className="jg-img">
                            <div className="jg-shimmer" aria-hidden="true" />
                            <img
                                loading={isPriority ? 'eager' : 'lazy'}
                                decoding="async"
                                fetchPriority={isPriority ? 'high' : 'low'}
                                src={displaySrc}
                                alt={item.alt}
                                onLoad={(e) => (e.currentTarget.parentElement as HTMLElement)?.classList.add('loaded')}
                                onError={(e) => (e.currentTarget.parentElement as HTMLElement)?.classList.add('loaded')}
                            />
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

export function GallerySection({
    category,
    items,
    thumbsByOriginal,
    eagerRowCount,
    onOpen,
}: {
    category: string
    items: (ImageItem & { originalIndex: number })[]
    thumbsByOriginal: Record<string, string>
    eagerRowCount: number
    onOpen: (originalIndex: number) => void
}) {
    const layout = siteConfig.features.galleryLayout

    return (
        <section id={category.toLowerCase()} className="gallery-section reveal">
            <div className="section-header">
                <h2>{category}</h2>
            </div>
            {layout === 'grid' ? (
                <GridGallery
                    items={items}
                    thumbsByOriginal={thumbsByOriginal}
                    eagerRowCount={eagerRowCount}
                    onOpen={onOpen}
                />
            ) : (
                <JustifiedGallery
                    items={items}
                    thumbsByOriginal={thumbsByOriginal}
                    eagerRowCount={eagerRowCount}
                    layout={layout}
                    onOpen={onOpen}
                />
            )}
        </section>
    )
}
