import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

export function useContainerWidth<T extends HTMLElement>(): [MutableRefObject<T | null>, number] {
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
