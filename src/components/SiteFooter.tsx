import { siteConfig } from '../site.config'

export function SiteFooter() {
    return (
        <footer className="site-footer">
            <small>© {new Date().getFullYear()} {siteConfig.name}. All rights reserved.</small>
            <div className="footer-links">
                <a href="#hero">Home</a>
                {siteConfig.features.showAbout && <a href="#about">About</a>}
                {siteConfig.features.showContact && <a href="#contact">Contact</a>}
                {siteConfig.instagram && (
                    <a href={`https://www.instagram.com/${siteConfig.instagram.replace('@', '')}/`} target="_blank" rel="noopener noreferrer">
                        Instagram
                    </a>
                )}
            </div>
        </footer>
    )
}
