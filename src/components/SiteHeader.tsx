import { siteConfig } from '../site.config'

export function SiteHeader() {
    return (
        <header className="site-header">
            <div className="site-header-inner">
                <div className="brand">
                    <a href="#hero" className="brand-logo-link" aria-label={`${siteConfig.name} Home`}>
                        <img
                            className="brand-logo"
                            src={`${import.meta.env.BASE_URL}${siteConfig.logoSrc}`}
                            alt={`${siteConfig.name} logo`}
                            decoding="async"
                            fetchPriority="low"
                        />
                    </a>
                </div>
                <nav className="nav">
                    {siteConfig.features.showAbout && <a href="#about">About</a>}
                    {siteConfig.features.showContact && <a href="#contact">Contact</a>}
                </nav>
            </div>
        </header>
    )
}
