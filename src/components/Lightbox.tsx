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

    // Fall back to original raw image if watermark wasn't built yet
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

            {/* left/right invisible click zones like IG stories */}
            <div className="lightbox-nav-zone prev-zone" onClick={(e) => { e.stopPropagation(); onPrev() }} />
            <div className="lightbox-nav-zone next-zone" onClick={(e) => { e.stopPropagation(); onNext() }} />

            <TransformWrapper
                initialScale={1}
                minScale={1}
                maxScale={5}
                centerOnInit={true}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: true }} // Disabling momentum to make click vs pan easier to distinguish
            >
                {({ instance }) => (
                    <TransformComponent
                        wrapperStyle={{ width: "100vw", height: "100vh" }}
                        contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                        <div
                            className="lightbox-img-wrap"
                            style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}
                            onClick={(e) => {
                                // If zoomed out completely, clicking anywhere not on the image itself closes it
                                // Make sure we only close if we click on the wrapper directly, not its children
                                if (e.target === e.currentTarget && instance.transformState.scale === 1) {
                                    onClose();
                                }
                            }}
                        >
                            <div className="jg-shimmer" aria-hidden="true">
                                <span className="lightbox-loader"></span>
                            </div>
                            <img
                                key={fullSrc}
                                className="lightbox-image"
                                src={fullSrc}
                                alt={current.alt}
                                decoding="async"
                                fetchPriority="high"
                                onLoad={(e) => {
                                    // adding 'loaded' to the wrap
                                    const wrap = e.currentTarget.closest('.lightbox-img-wrap');
                                    wrap?.classList.add('loaded');
                                    // and also trigger the flash on the nav zones by adding a brief class to lightbox root
                                    const root = e.currentTarget.closest('.lightbox') as HTMLElement | null;
                                    root?.classList.remove('flash-nav');
                                    // force reflow
                                    void root?.offsetWidth;
                                    root?.classList.add('flash-nav');
                                }}
                                onError={(e) => e.currentTarget.closest('.lightbox-img-wrap')?.classList.add('loaded')}
                                // Stop propagation entirely from the image
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    </TransformComponent>
                )}
            </TransformWrapper>

            <ExifPanel
                key={current.src}
                src={current.src}
                exif={exif}
                setExif={setExif}
            />
        </div>
    )
}
