import { siteConfig } from '../site.config'

export function HeroSection({
    heroThumbnail,
    bannerUrl,
}: {
    heroThumbnail: string
    bannerUrl: string
}) {
    return (
        <section id="hero" className="hero">
            <div className="hero-bg">
                {heroThumbnail && (
                    <img
                        className="hero-img"
                        src={heroThumbnail}
                        alt=""
                        decoding="async"
                        fetchPriority="high"
                        width="1200"
                        height="450"
                        style={{ aspectRatio: '16/6' }}
                        onError={(e) => {
                            // Fallback to original if thumbnail fails
                            if (e.currentTarget.src !== bannerUrl) {
                                e.currentTarget.src = bannerUrl
                            }
                        }}
                    />
                )}
            </div>
            <div className="hero-scrim" />
            <div className="hero-content">
                <h1 className="hero-title">{siteConfig.heroTitle}</h1>
                <p className="hero-subtitle">{siteConfig.heroSubtitle}</p>
            </div>
        </section>
    )
}
