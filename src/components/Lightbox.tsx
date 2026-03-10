import { useEffect } from 'react'
import type { ImageItem } from '../lib/gallery'
import { ExifPanel } from './ExifPanel'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

export function Lightbox({
    index,
    images,
    exif,
    setExif,
    onClose,
    onPrev,
    onNext,
    thumbsManifest
}: {
    index: number
    images: ImageItem[]
    exif: { fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null
    setExif: (v: any) => void
    onClose: () => void
    onPrev: () => void
    onNext: () => void
    thumbsManifest: Record<string, string>
}) {
    const current = images[index]

    // Use the watermarked original if it was built
    const manifestKey = current.originalPath.replace(/^\.\//, '/src/') + '__original'
    const watermarkedSrc = thumbsManifest[manifestKey]
    const fullSrc = watermarkedSrc || current.src

    console.log('[DEBUG Lightbox]', {
        currentSrc: current.src,
        originalPath: current.originalPath,
        manifestKey,
        watermarkedSrc,
        fullSrc,
        hasKey: !!thumbsManifest[manifestKey]
    })

    // Preload adjacent original images so swiping feels instant
    useEffect(() => {
        const n = images.length
        if (n === 0) return
        const adjacentItems = [
            images[(index + 1) % n],
            images[(index + n - 1) % n],
        ]
        const imgs = adjacentItems.map(item => {
            const adjManifestKey = item.originalPath.replace(/^\.\//, '/src/') + '__original'
            const adjWatermarkedSrc = thumbsManifest[adjManifestKey]

            const img = new Image()
            img.fetchPriority = 'low'
            img.decoding = 'async'
            img.src = adjWatermarkedSrc || item.src
            return img
        })
        return () => { imgs.forEach(img => { img.src = '' }) }
    }, [index, images, thumbsManifest])

    return (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
            <button className="lightbox-close" aria-label="Close" onClick={onClose}>×</button>
            <button className="lightbox-prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); onPrev() }}>‹</button>
            <div className="lightbox-img-wrap" onClick={(e) => e.stopPropagation()}>
                <div className="jg-shimmer" aria-hidden="true" />
                <TransformWrapper
                    initialScale={1}
                    minScale={0.5}
                    maxScale={5}
                    centerOnInit={true}
                    wheel={{ step: 0.1 }}
                >
                    <TransformComponent wrapperStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <img
                            key={fullSrc}
                            className="lightbox-image"
                            src={fullSrc}
                            alt={current.alt}
                            decoding="async"
                            fetchPriority="high"
                            onLoad={(e) => e.currentTarget.closest('.lightbox-img-wrap')?.classList.add('loaded')}
                            onError={(e) => e.currentTarget.closest('.lightbox-img-wrap')?.classList.add('loaded')}
                        />
                    </TransformComponent>
                </TransformWrapper>
            </div>
            <ExifPanel
                key={current.src}
                src={current.src}
                exif={exif}
                setExif={setExif}
            />
            <button className="lightbox-next" aria-label="Next" onClick={(e) => { e.stopPropagation(); onNext() }}>›</button>
        </div>
    )
}
