export type CategoryKey = string

export type ImageItem = {
    src: string
    alt: string
    category: CategoryKey
    originalPath: string
}

export type JustifiedItem = ImageItem & {
    aspectRatio: number
    __globalIndex?: number
}

export type JustifiedRow = {
    items: { item: JustifiedItem; width: number; height: number; globalIndex: number }[]
    height: number
}

export function getFilenameSeed(s: string): number {
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

export function computeRows(
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
            return { item: it, width, height: finalHeight, globalIndex: it.__globalIndex as number }
        })
        rows.push({ items: itemsWithSizes, height: finalHeight })
        rowIndex++
    }

    for (const it of items) {
        const tentativeWidth = it.aspectRatio * baseRowHeight
        const gaps = gap * currentRow.length
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

// Simple thumbnail lookup function
export function findThumbnail(originalPath: string, thumbsManifest: Record<string, string>): string | undefined {
    const manifestKey = originalPath.replace(/^\.\//, '/src/')
    return thumbsManifest[manifestKey]
}

// Load image aspect ratio efficiently
export function loadImageAspect(src: string): Promise<number> {
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
