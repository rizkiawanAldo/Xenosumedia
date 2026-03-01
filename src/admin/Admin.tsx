import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Env ─────────────────────────────────────────────────────────────────
const PASS_HASH = import.meta.env.VITE_ADMIN_PASS_HASH as string | undefined
const PAT = import.meta.env.VITE_GITHUB_PAT as string | undefined
const OWNER = import.meta.env.VITE_GITHUB_OWNER as string | undefined
const REPO = import.meta.env.VITE_GITHUB_REPO as string | undefined
const BRANCH = (import.meta.env.VITE_GITHUB_BRANCH as string | undefined) || 'main'
const PHOTOS_PATH = 'src/assets/photos'
const IS_DEV = import.meta.env.DEV

// ─── Types ───────────────────────────────────────────────────────────────
type GhFile = { name: string; path: string; sha: string; download_url: string; type: 'file' | 'dir' }
type Status = { type: 'success' | 'error' | 'info'; msg: string }
type Progress = { done: number; total: number; current: string }

// ─── GitHub API ──────────────────────────────────────────────────────────
async function ghFetch(path: string, opts?: RequestInit) {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
        ...opts,
        headers: {
            Authorization: `Bearer ${PAT}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(opts?.headers ?? {}),
        },
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message ?? `GitHub API ${res.status}`)
    }
    return res.json()
}

// ─── Local dev API ───────────────────────────────────────────────────────
async function localFetch(endpoint: string, body?: object) {
    const res = await fetch(`/_admin${endpoint}`, {
        method: body ? 'POST' : 'GET',
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Local API ${res.status}`)
    }
    return res.json()
}

// ─── Unified data operations ─────────────────────────────────────────────
const ops = {
    async getCategories(): Promise<string[]> {
        if (IS_DEV) return localFetch('/cats')
        const data = await ghFetch(PHOTOS_PATH) as GhFile[]
        return data.filter(f => f.type === 'dir').map(f => f.name).sort()
    },

    async getImages(cat: string): Promise<GhFile[]> {
        if (IS_DEV) return localFetch(`/images?cat=${encodeURIComponent(cat)}`)
        const data = await ghFetch(`${PHOTOS_PATH}/${cat}`) as GhFile[]
        return data.filter(f => f.type === 'file' && /\.(jpe?g|png|webp)$/i.test(f.name))
    },

    async uploadImage(cat: string, file: File): Promise<void> {
        const content = await fileToBase64(file)
        if (IS_DEV) {
            await localFetch('/upload', { cat, name: file.name, content })
        } else {
            await ghFetch(`${PHOTOS_PATH}/${cat}/${file.name}`, {
                method: 'PUT',
                body: JSON.stringify({ message: `admin: add ${file.name}`, content, branch: BRANCH }),
            })
        }
    },

    async deleteImage(img: GhFile): Promise<void> {
        if (IS_DEV) {
            await localFetch('/delete', { path: img.path })
        } else {
            await ghFetch(img.path, {
                method: 'DELETE',
                body: JSON.stringify({ message: `admin: remove ${img.name}`, sha: img.sha, branch: BRANCH }),
            })
        }
    },

    async moveImage(img: GhFile, fromCat: string, toCat: string): Promise<void> {
        if (IS_DEV) {
            await localFetch('/move', { name: img.name, fromCat, toCat })
        } else {
            const fileData = await ghFetch(img.path) as { content: string; sha: string }
            const content = fileData.content.replace(/\n/g, '')
            await ghFetch(`${PHOTOS_PATH}/${toCat}/${img.name}`, {
                method: 'PUT',
                body: JSON.stringify({ message: `admin: move ${img.name} → ${toCat}`, content, branch: BRANCH }),
            })
            await ghFetch(img.path, {
                method: 'DELETE',
                body: JSON.stringify({ message: `admin: move cleanup`, sha: img.sha, branch: BRANCH }),
            })
        }
    },

    async createCategory(name: string): Promise<void> {
        if (IS_DEV) {
            await localFetch('/mkdir', { name })
        } else {
            await ghFetch(`${PHOTOS_PATH}/${name}/.gitkeep`, {
                method: 'PUT',
                body: JSON.stringify({ message: `admin: create category ${name}`, content: btoa(''), branch: BRANCH }),
            })
        }
    },

    async deleteCategory(name: string): Promise<void> {
        if (IS_DEV) {
            await localFetch('/rmdir', { name })
        } else {
            const files = await ghFetch(`${PHOTOS_PATH}/${name}`).catch(() => []) as GhFile[]
            for (const f of files) {
                await ghFetch(f.path, {
                    method: 'DELETE',
                    body: JSON.stringify({ message: `admin: remove ${f.path}`, sha: f.sha, branch: BRANCH }),
                })
            }
        }
    },
}

// ─── Utils ───────────────────────────────────────────────────────────────
// Pure-JS SHA-256 — synchronous, no Web Crypto, unaffected by bundler shims.
function sha256hex(message: string): string {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]
    const b = Array.from(new TextEncoder().encode(message))
    const L = b.length; b.push(0x80)
    while (b.length % 64 !== 56) b.push(0)
    const bits = L * 8
    for (let i = 7; i >= 0; i--) b.push((bits / 2 ** (i * 8)) >>> 0 & 0xff)
    let [h0, h1, h2, h3, h4, h5, h6, h7] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    for (let o = 0; o < b.length; o += 64) {
        const W = new Array(64)
        for (let i = 0; i < 16; i++) W[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3]
        for (let i = 16; i < 64; i++) {
            const s0 = ((W[i - 15] >>> 7) | (W[i - 15] << 25)) ^ ((W[i - 15] >>> 18) | (W[i - 15] << 14)) ^ (W[i - 15] >>> 3)
            const s1 = ((W[i - 2] >>> 17) | (W[i - 2] << 15)) ^ ((W[i - 2] >>> 19) | (W[i - 2] << 13)) ^ (W[i - 2] >>> 10)
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0
        }
        let [a, b2, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7]
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
            const ch = (e & f) ^ (~e & g)
            const t1 = (h + S1 + ch + K[i] + W[i]) | 0
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
            const maj = (a & b2) ^ (a & c) ^ (b2 & c)
            const t2 = (S0 + maj) | 0
            h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0
        }
        h0 = (h0 + a) | 0; h1 = (h1 + b2) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
        h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('')
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

const successMsg = (msg: string) => IS_DEV
    ? `${msg} Commit & push to deploy.`
    : `${msg} CI rebuild triggered (~3 min).`

// ─── Styles ──────────────────────────────────────────────────────────────
const C = {
    bg: '#0d0d0d', surface: '#161616', surface2: '#1c1c1c',
    border: 'rgba(255,255,255,0.08)', border2: 'rgba(255,255,255,0.05)',
    text: '#e8e8e8', muted: '#666', subtle: '#444',
    accent: '#c9a84c', accentBg: 'rgba(201,168,76,0.12)',
    danger: '#f87171', dangerBg: 'rgba(239,68,68,0.12)', dangerBorder: 'rgba(239,68,68,0.25)',
}

const s = {
    root: { display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14 } as React.CSSProperties,
    loginWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%' } as React.CSSProperties,
    loginCard: { width: 360, padding: '48px 40px', border: `1px solid ${C.border}`, borderRadius: 16, background: C.surface } as React.CSSProperties,
    loginTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.8rem', fontStyle: 'italic', margin: '0 0 6px' } as React.CSSProperties,
    loginSub: { color: C.muted, fontSize: '0.82rem', margin: '0 0 32px' } as React.CSSProperties,
    input: { width: '100%', padding: '10px 14px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: '0.95rem', outline: 'none', marginBottom: 14 } as React.CSSProperties,
    btn: { width: '100%', padding: '11px 0', background: C.accent, border: 'none', borderRadius: 8, color: '#0d0d0d', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', letterSpacing: '0.04em' } as React.CSSProperties,
    btnSm: { padding: '6px 13px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' } as React.CSSProperties,
    btnAccent: { padding: '6px 11px', background: C.accent, border: 'none', borderRadius: 6, color: '#0d0d0d', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' } as React.CSSProperties,
    btnDanger: { padding: '4px 9px', background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 5, color: C.danger, fontSize: '0.72rem', cursor: 'pointer' } as React.CSSProperties,
    btnGhost: { padding: '6px 13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: '0.76rem', cursor: 'pointer' } as React.CSSProperties,
    sidebar: { width: 228, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface } as React.CSSProperties,
    sidebarTop: { padding: '18px 16px 12px', borderBottom: `1px solid ${C.border2}` } as React.CSSProperties,
    sidebarTitle: { fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: '1.05rem', margin: 0 } as React.CSSProperties,
    sidebarSub: { color: C.subtle, fontSize: '0.7rem', margin: '3px 0 0' } as React.CSSProperties,
    catList: { flex: 1, overflowY: 'auto', padding: '6px 0' } as React.CSSProperties,
    catLabel: { fontSize: '0.65rem', color: C.subtle, margin: '8px 16px 4px', textTransform: 'uppercase', letterSpacing: '0.1em' } as React.CSSProperties,
    catItem: (active: boolean): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px 8px 16px', cursor: 'pointer', fontSize: '0.82rem',
        background: active ? C.accentBg : 'transparent', color: active ? C.accent : '#999',
        borderLeft: active ? `2px solid ${C.accent}` : '2px solid transparent', transition: 'all 0.12s',
    }),
    catBadge: { fontSize: '0.68rem', color: C.subtle, background: 'rgba(255,255,255,0.05)', borderRadius: 999, padding: '1px 7px' } as React.CSSProperties,
    catDeleteBtn: { background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '1px 4px', borderRadius: 3, opacity: 0 } as React.CSSProperties,
    sidebarBottom: { padding: '12px 16px', borderTop: `1px solid ${C.border2}` } as React.CSSProperties,
    newCatRow: { display: 'flex', gap: 6, marginBottom: 10 } as React.CSSProperties,
    newCatInput: { flex: 1, padding: '6px 10px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: '0.78rem', outline: 'none' } as React.CSSProperties,
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as React.CSSProperties,
    toolbar: { padding: '13px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.surface, minHeight: 54 } as React.CSSProperties,
    toolbarTitle: { flex: 1, fontWeight: 600, fontSize: '0.92rem', margin: 0, textTransform: 'capitalize' } as React.CSSProperties,
    devBadge: { fontSize: '0.68rem', color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 4, padding: '2px 8px' } as React.CSSProperties,
    dropZone: (drag: boolean): React.CSSProperties => ({
        margin: '14px 22px 0', padding: '18px',
        border: `1.5px dashed ${drag ? C.accent : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 9, textAlign: 'center', cursor: 'pointer',
        background: drag ? 'rgba(201,168,76,0.04)' : 'rgba(255,255,255,0.015)',
        transition: 'all 0.2s', fontSize: '0.78rem', color: C.muted,
    }),
    imageGrid: { flex: 1, overflowY: 'auto', padding: '16px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignContent: 'start' } as React.CSSProperties,
    imageCard: { position: 'relative', borderRadius: 7, overflow: 'hidden', background: C.surface2, border: `1px solid ${C.border}`, aspectRatio: '4/3', cursor: 'zoom-in' } as React.CSSProperties,
    imageThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as React.CSSProperties,
    imageOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 7, opacity: 0, transition: 'all 0.18s', pointerEvents: 'none' } as React.CSSProperties,
    imageName: { fontSize: '0.62rem', color: '#ddd', background: 'rgba(0,0,0,0.7)', borderRadius: 3, padding: '2px 5px', wordBreak: 'break-all' as const, lineHeight: 1.4, alignSelf: 'flex-start' } as React.CSSProperties,
    imageActions: { display: 'flex', gap: 5, pointerEvents: 'auto' } as React.CSSProperties,
    progressBar: (pct: number): React.CSSProperties => ({ height: 3, background: `linear-gradient(to right, ${C.accent} ${pct}%, rgba(255,255,255,0.06) ${pct}%)`, margin: '0 22px', borderRadius: 2, transition: 'background 0.3s' }),
    status: (type: Status['type']): React.CSSProperties => ({
        padding: '9px 18px', margin: '10px 22px 0', borderRadius: 7, fontSize: '0.8rem',
        background: type === 'success' ? 'rgba(34,197,94,0.09)' : type === 'error' ? 'rgba(239,68,68,0.09)' : 'rgba(99,171,194,0.09)',
        color: type === 'success' ? '#4ade80' : type === 'error' ? C.danger : '#93c5fd',
        border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.18)' : type === 'error' ? 'rgba(239,68,68,0.18)' : 'rgba(99,171,194,0.18)'}`,
    }),
    spinner: { display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.12)', borderTopColor: C.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 5 } as React.CSSProperties,
    empty: { gridColumn: '1 / -1', textAlign: 'center', color: C.subtle, paddingTop: 50, fontSize: '0.82rem' } as React.CSSProperties,
    lbOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties,
    lbImg: { maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', objectFit: 'contain' } as React.CSSProperties,
    lbBar: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' } as React.CSSProperties,
    lbName: { color: '#666', fontSize: '0.76rem' } as React.CSSProperties,
    modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' } as React.CSSProperties,
    modalCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 28, width: 320 } as React.CSSProperties,
    catSelect: { width: '100%', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: '0.85rem', marginBottom: 16, outline: 'none' } as React.CSSProperties,
}

// ─── Component ────────────────────────────────────────────────────────────
export default function Admin() {
    const [authed, setAuthed] = useState(() => sessionStorage.getItem('xeno_admin') === '1')
    const [passInput, setPassInput] = useState('')
    const [loginErr, setLoginErr] = useState('')
    const [loginLoading, setLoginLoading] = useState(false)
    const [categories, setCategories] = useState<string[]>([])
    const [selectedCat, setSelectedCat] = useState<string | null>(null)
    const [images, setImages] = useState<GhFile[]>([])
    const [catCounts, setCatCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<Status | null>(null)
    const [drag, setDrag] = useState(false)
    const [progress, setProgress] = useState<Progress | null>(null)
    const [newCatName, setNewCatName] = useState('')
    const [previewImg, setPreviewImg] = useState<GhFile | null>(null)
    const [moveImg, setMoveImg] = useState<GhFile | null>(null)
    const [moveDest, setMoveDest] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const showStatus = useCallback((type: Status['type'], msg: string) => {
        setStatus({ type, msg })
        setTimeout(() => setStatus(s => s?.msg === msg ? null : s), 7000)
    }, [])

    // ── Auth ──────────────────────────────────────────────────────────────
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!PASS_HASH) { setLoginErr('VITE_ADMIN_PASS_HASH not set.'); return }
        setLoginLoading(true); setLoginErr('')
        try {
            const hash = sha256hex(passInput)
            if (hash === PASS_HASH.toLowerCase()) {
                sessionStorage.setItem('xeno_admin', '1'); setAuthed(true)
            } else setLoginErr('Incorrect password.')
        } finally { setLoginLoading(false) }
    }

    const handleLogout = () => { sessionStorage.removeItem('xeno_admin'); setAuthed(false); setPassInput('') }

    // ── Categories ────────────────────────────────────────────────────────
    const loadCategories = useCallback(async (keepSelected?: string) => {
        try {
            const dirs = await ops.getCategories()
            setCategories(dirs)
            setSelectedCat(prev => keepSelected ?? prev ?? (dirs[0] || null))
        } catch (err) { showStatus('error', `Categories: ${(err as Error).message}`) }
    }, [showStatus])

    useEffect(() => { if (authed) loadCategories() }, [authed, loadCategories])

    // ── Images ────────────────────────────────────────────────────────────
    const loadImages = useCallback(async (cat: string) => {
        setLoading(true); setImages([])
        try {
            const imgs = await ops.getImages(cat)
            setImages(imgs)
            setCatCounts(prev => ({ ...prev, [cat]: imgs.length }))
        } catch (err) { showStatus('error', `Images: ${(err as Error).message}`) }
        finally { setLoading(false) }
    }, [showStatus])

    useEffect(() => { if (authed && selectedCat) loadImages(selectedCat) }, [authed, selectedCat, loadImages])

    // ── Upload ────────────────────────────────────────────────────────────
    const handleFiles = useCallback(async (files: File[]) => {
        if (!selectedCat) { showStatus('error', 'No category selected.'); return }
        const imgs = files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name))
        if (!imgs.length) { showStatus('error', 'Select JPG, PNG, or WebP files.'); return }
        let ok = 0
        for (let i = 0; i < imgs.length; i++) {
            setProgress({ done: i, total: imgs.length, current: imgs[i].name })
            try { await ops.uploadImage(selectedCat, imgs[i]); ok++ }
            catch (err) { showStatus('error', `${imgs[i].name}: ${(err as Error).message}`) }
        }
        setProgress(null)
        if (ok > 0) {
            showStatus('success', successMsg(`Uploaded ${ok}/${imgs.length} photo(s).`))
            loadImages(selectedCat)
        }
    }, [selectedCat, showStatus, loadImages])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDrag(false); handleFiles(Array.from(e.dataTransfer.files))
    }, [handleFiles])

    // ── Delete image ──────────────────────────────────────────────────────
    const handleDeleteImg = async (img: GhFile) => {
        if (!confirm(`Delete "${img.name}"?`)) return
        try {
            await ops.deleteImage(img)
            showStatus('success', successMsg(`Deleted "${img.name}".`))
            setImages(prev => prev.filter(f => f.sha !== img.sha))
            setCatCounts(prev => ({ ...prev, [selectedCat!]: Math.max(0, (prev[selectedCat!] ?? 1) - 1) }))
            if (previewImg?.sha === img.sha) setPreviewImg(null)
        } catch (err) { showStatus('error', `Delete failed: ${(err as Error).message}`) }
    }

    // ── Delete category ───────────────────────────────────────────────────
    const handleDeleteCategory = async (cat: string) => {
        if (!confirm(`Delete category "${cat}" and all its contents?`)) return
        try {
            await ops.deleteCategory(cat)
            showStatus('success', successMsg(`Deleted category "${cat}".`))
            await loadCategories()
        } catch (err) { showStatus('error', `Delete category failed: ${(err as Error).message}`) }
    }

    // ── Move image ────────────────────────────────────────────────────────
    const handleMoveConfirm = async () => {
        if (!moveImg || !moveDest || moveDest === selectedCat) { setMoveImg(null); return }
        try {
            await ops.moveImage(moveImg, selectedCat!, moveDest)
            showStatus('success', successMsg(`Moved "${moveImg.name}" → ${moveDest}.`))
            setImages(prev => prev.filter(f => f.sha !== moveImg.sha))
            setCatCounts(prev => ({ ...prev, [selectedCat!]: Math.max(0, (prev[selectedCat!] ?? 1) - 1) }))
        } catch (err) { showStatus('error', `Move failed: ${(err as Error).message}`) }
        finally { setMoveImg(null); setMoveDest('') }
    }

    // ── New category ──────────────────────────────────────────────────────
    const handleCreateCat = async () => {
        const name = newCatName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        if (!name) return
        try {
            await ops.createCategory(name)
            setNewCatName('')
            showStatus('success', `Category "${name}" created.`)
            await loadCategories(name)
        } catch (err) { showStatus('error', `Create failed: ${(err as Error).message}`) }
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setPreviewImg(null); setMoveImg(null) }
            if (previewImg) {
                const i = images.findIndex(f => f.sha === previewImg.sha)
                if (e.key === 'ArrowRight' && i < images.length - 1) setPreviewImg(images[i + 1])
                if (e.key === 'ArrowLeft' && i > 0) setPreviewImg(images[i - 1])
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [previewImg, images])

    // ── LOGIN ─────────────────────────────────────────────────────────────
    if (!authed) return (
        <div style={s.loginWrap}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={s.loginCard}>
                <h1 style={s.loginTitle}>Admin</h1>
                <p style={s.loginSub}>Xenosumedia · {IS_DEV ? '🖥 Local mode' : '☁ GitHub mode'}</p>
                <form onSubmit={handleLogin}>
                    <input type="password" placeholder="Password" value={passInput}
                        onChange={e => setPassInput(e.target.value)} style={s.input} autoFocus />
                    {loginErr && <p style={{ color: C.danger, fontSize: '0.8rem', margin: '-6px 0 12px' }}>{loginErr}</p>}
                    <button type="submit" style={s.btn} disabled={loginLoading}>
                        {loginLoading ? 'Checking…' : 'Sign in'}
                    </button>
                </form>
                {!PASS_HASH && <p style={{ color: '#f59e0b', fontSize: '0.76rem', marginTop: 14, lineHeight: 1.6 }}>
                    ⚠ VITE_ADMIN_PASS_HASH not set in .env.local
                </p>}
            </div>
        </div>
    )

    const uploadPct = progress ? Math.round((progress.done / progress.total) * 100) : 0

    // ── DASHBOARD ─────────────────────────────────────────────────────────
    return (
        <div style={s.root}>
            <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .img-card:hover .img-overlay{opacity:1!important;background:rgba(0,0,0,0.5)!important}
        .cat-row:hover .cat-del{opacity:1!important}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.09);border-radius:3px}
      `}</style>

            {/* ── Lightbox ── */}
            {previewImg && (
                <div style={s.lbOverlay} onClick={() => setPreviewImg(null)}>
                    <img src={previewImg.download_url} alt={previewImg.name} style={s.lbImg}
                        onClick={e => e.stopPropagation()} />
                    <div style={s.lbBar} onClick={e => e.stopPropagation()}>
                        <span style={{ color: '#666', fontSize: '0.76rem' }}>{previewImg.name}</span>
                        <button style={s.btnSm} onClick={() => { const i = images.findIndex(f => f.sha === previewImg.sha); if (i > 0) setPreviewImg(images[i - 1]) }}>‹</button>
                        <button style={s.btnSm} onClick={() => { const i = images.findIndex(f => f.sha === previewImg.sha); if (i < images.length - 1) setPreviewImg(images[i + 1]) }}>›</button>
                        <button style={s.btnDanger} onClick={() => { setPreviewImg(null); handleDeleteImg(previewImg) }}>Delete</button>
                        <button style={s.btnGhost} onClick={() => setPreviewImg(null)}>✕ Close</button>
                    </div>
                    <p style={{ color: '#333', fontSize: '0.68rem', marginTop: 8 }}>← → keys · Esc to close</p>
                </div>
            )}

            {/* ── Move modal ── */}
            {moveImg && (
                <div style={s.modalBackdrop} onClick={() => setMoveImg(null)}>
                    <div style={s.modalCard} onClick={e => e.stopPropagation()}>
                        <p style={{ margin: '0 0 16px', fontWeight: 600 }}>Move "{moveImg.name}"</p>
                        <select value={moveDest} onChange={e => setMoveDest(e.target.value)} style={s.catSelect}>
                            <option value="">Select destination…</option>
                            {categories.filter(c => c !== selectedCat).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button style={{ ...s.btnAccent, flex: 1 }} onClick={handleMoveConfirm} disabled={!moveDest}>Move</button>
                            <button style={s.btnGhost} onClick={() => setMoveImg(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sidebar ── */}
            <aside style={s.sidebar}>
                <div style={s.sidebarTop}>
                    <p style={s.sidebarTitle}>Xenosumedia</p>
                    <p style={s.sidebarSub}>Admin{IS_DEV ? ' · Local' : ' · GitHub'}</p>
                </div>

                <div style={s.catList}>
                    <p style={s.catLabel}>Categories</p>
                    {categories.map(cat => (
                        <div key={cat} className="cat-row" style={s.catItem(cat === selectedCat)} onClick={() => setSelectedCat(cat)}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{cat}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                {catCounts[cat] !== undefined && <span style={s.catBadge}>{catCounts[cat]}</span>}
                                <button className="cat-del" style={s.catDeleteBtn} title="Delete category"
                                    onClick={e => { e.stopPropagation(); handleDeleteCategory(cat) }}>✕</button>
                            </div>
                        </div>
                    ))}
                    {!categories.length && <p style={{ fontSize: '0.76rem', color: C.subtle, padding: '8px 16px' }}>No categories yet.</p>}
                </div>

                <div style={s.sidebarBottom}>
                    <p style={{ fontSize: '0.65rem', color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 7px' }}>New Category</p>
                    <div style={s.newCatRow}>
                        <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateCat()}
                            placeholder="folder-name" style={s.newCatInput} />
                        <button onClick={handleCreateCat} style={s.btnAccent}>+</button>
                    </div>
                    <button onClick={() => selectedCat && loadImages(selectedCat)} style={{ ...s.btnGhost, width: '100%', marginBottom: 7 }}>↻ Refresh</button>
                    <button onClick={handleLogout} style={{ ...s.btnGhost, width: '100%' }}>Sign out</button>
                </div>
            </aside>

            {/* ── Main ── */}
            <main style={s.main}>
                <div style={s.toolbar}>
                    <p style={s.toolbarTitle}>{selectedCat ?? 'Select a category'}</p>
                    {IS_DEV && <span style={s.devBadge}>🖥 Local</span>}
                    {!IS_DEV && !PAT && <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>⚠ PAT not set</span>}
                    {progress && <span style={{ fontSize: '0.76rem', color: C.muted }}>{progress.done}/{progress.total} — {progress.current}</span>}
                    <button style={s.btnSm} onClick={() => fileInputRef.current?.click()} disabled={!selectedCat || !!progress}>↑ Upload</button>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                        onChange={e => e.target.files && handleFiles(Array.from(e.target.files))} />
                </div>

                {progress && <div style={s.progressBar(uploadPct)} />}
                {status && <div style={s.status(status.type)}>{status.msg}</div>}

                {selectedCat && (
                    <div style={s.dropZone(drag)}
                        onDragOver={e => { e.preventDefault(); setDrag(true) }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}>
                        {drag ? '📂 Drop to upload' : 'Drag & drop photos here, or click to select · JPG PNG WebP'}
                    </div>
                )}

                {loading ? (
                    <p style={{ padding: '40px 22px', color: C.muted, fontSize: '0.82rem' }}>
                        <span style={s.spinner} />Loading…
                    </p>
                ) : (
                    <div style={s.imageGrid}>
                        {!images.length && selectedCat && <p style={s.empty}>No images in "{selectedCat}" yet. Upload some above.</p>}
                        {images.map(img => (
                            <div key={img.sha} className="img-card" style={s.imageCard} onClick={() => setPreviewImg(img)}>
                                <img src={img.download_url} alt={img.name} style={s.imageThumb} loading="lazy" />
                                <div className="img-overlay" style={s.imageOverlay}>
                                    <span style={s.imageName}>{img.name}</span>
                                    <div style={s.imageActions} onClick={e => e.stopPropagation()}>
                                        <button style={s.btnSm} onClick={() => { setMoveImg(img); setMoveDest('') }}>Move</button>
                                        <button style={s.btnDanger} onClick={() => handleDeleteImg(img)}>Delete</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}
