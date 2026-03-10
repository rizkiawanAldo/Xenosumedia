import { siteConfig } from '../site.config'

export function InfoGrid() {
    const showAbout = siteConfig.features.showAbout
    const showContact = siteConfig.features.showContact

    if (!showAbout && !showContact) return null

    return (
        <div className="info-grid reveal">
            {showAbout && (
                <div className="info-block" id="about">
                    <h2>About</h2>
                    <p>{siteConfig.aboutText}</p>
                    <p style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                        {siteConfig.aboutLocation}
                    </p>
                </div>
            )}

            {showContact && (
                <div className="info-block" id="contact">
                    <h2>Contact</h2>
                    {siteConfig.email && (
                        <a className="contact-link" href={`mailto:${siteConfig.email}`}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 9.5 6.5a1 1 0 0 0 1 0L22 7" /></svg>
                            {siteConfig.email}
                        </a>
                    )}
                    {siteConfig.instagram && (
                        <a className="contact-link" href={`https://www.instagram.com/${siteConfig.instagram.replace('@', '')}/`} target="_blank" rel="noopener noreferrer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
                            @{siteConfig.instagram.replace('@', '')}
                        </a>
                    )}
                    {siteConfig.contactNote && (
                        <p style={{ marginTop: '20px', fontSize: '0.85rem', color: 'var(--color-muted)', lineHeight: 1.7 }}>
                            {siteConfig.contactNote}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
