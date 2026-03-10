export type GalleryLayout = 'justified' | 'grid' | 'orientation-dense'

export const siteConfig = {
    // ── Identity ─────────────────────────────────────────────────
    name: "Xenosumedia",
    tagline: "Tell your moments, tell your story",
    metaDescription: "Xenosumedia photography portfolio — portraits, events, sports, and landscapes. Feel the story in every frame.",
    logoSrc: "logo-dark.png",

    // ── Hero ──────────────────────────────────────────────────────
    heroTitle: "Xenosumedia",
    heroSubtitle: "feel it",

    // ── About section ─────────────────────────────────────────────
    aboutText: "Xenosumedia captures authentic moments across portraits, events, sports, and landscapes. The goal is simple: make you feel the story in every frame.",
    aboutLocation: "Available for bookings in Jakarta and surrounding areas.",

    // ── Contact ───────────────────────────────────────────────────
    email: "xenosumedia@gmail.com",
    instagram: "xenosumedia",
    contactNote: "Pricing varies by shoot type and duration — reach out for a custom quote.",

    // ── Features (toggle on/off) ──────────────────────────────────
    features: {
        showExif: true,
        showAbout: true,
        showContact: true,
        galleryLayout: "justified" as GalleryLayout, // "justified" | "grid" | "orientation-dense"
    },

    // ── Watermark ─────────────────────────────────────────────────
    // Note: The build script reads from scripts/watermark.config.mjs
    // Ensure that file is updated if you want to change watermark settings for the build.

    // ── Theme (maps to CSS custom properties) ─────────────────────
    theme: {
        accentColor: "#c9a84c", // warm gold
        fontDisplay: "'Playfair Display', Georgia, serif",
        fontBody: "'Inter', system-ui, -apple-system, sans-serif",
        radius: "10px",
    },
}
