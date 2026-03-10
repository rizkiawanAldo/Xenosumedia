import { useEffect } from 'react'
import { siteConfig } from '../site.config'

export function ExifPanel({
    src,
    exif,
    setExif
}: {
    src: string,
    exif: { fNumber?: number, exposureTime?: number, ISO?: number, focalLength?: number } | null,
    setExif: (v: any) => void
}) {
    useEffect(() => {
        let cancelled = false
        if (!src || !siteConfig.features.showExif) return
            ; (async () => {
                try {
                    const { parse } = await import('exifr')
                    const data = await parse(src, {
                        pick: ['FNumber', 'ExposureTime', 'ISO', 'FocalLength']
                    }) as any

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

    if (!siteConfig.features.showExif || !exif) return null

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
