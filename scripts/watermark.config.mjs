/**
 * Watermark Config for Image Build Pipeline
 * 
 * Note: This file is plain JavaScript (.mjs) so the build script can read it
 * without compiling TypeScript.
 */

export const watermarkConfig = {
    enabled: true,         // Set to true to apply watermark
    text: "© Xenosumedia",
    position: "center",    // "center", "bottom-right", "bottom-left", "top-right", "top-left"
    opacity: 0.55,         // 0.0 - 1.0
    fontSize: 42,          // pixels (scales down for smaller images)
    color: "#ffffff",

    // "originals" = only apply to the big images shown in lightbox
    // "thumbnails" = only apply to the small grid images
    // "both" = apply everywhere
    applyTo: "both",
}
