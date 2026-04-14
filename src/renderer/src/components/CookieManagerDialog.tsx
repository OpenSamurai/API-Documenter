import { useState, useEffect, useMemo } from 'react'
import { v4 as uuid } from 'uuid'

interface Cookie {
    key: string
    value: string
    domain: string
    path: string
    expires?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: string
}

interface Props {
    isOpen: boolean
    onClose: () => void
}

export function CookieManagerDialog({ isOpen, onClose }: Props) {
    const [allCookies, setAllCookies] = useState<Record<string, Cookie[]>>({})
    const [whitelist, setWhitelist] = useState<string[]>([])
    const [showWhitelist, setShowWhitelist] = useState(false)
    const [newWhitelistDomain, setNewWhitelistDomain] = useState('')
    const [newDomainInput, setNewDomainInput] = useState('')
    
    // Selection for editing
    const [selectedCookie, setSelectedCookie] = useState<{ domain: string, name: string } | null>(null)
    const [editRawValue, setEditRawValue] = useState('')
    const [isAddingNew, setIsAddingNew] = useState<{ domain: string } | null>(null)

    useEffect(() => {
        if (isOpen) {
            refreshData()
        }
    }, [isOpen])

    const refreshData = async () => {
        const cookies = await (window as any).electronAPI.getAllCookies()
        const wl = await (window as any).electronAPI.getCookieWhitelist()
        setAllCookies(cookies)
        setWhitelist(wl)
    }

    // --- Actions ---
    const handleAddDomain = () => {
        if (!newDomainInput) return
        const d = newDomainInput.trim().toLowerCase().replace(/^\./, '')
        if (!allCookies[d]) {
            setAllCookies(prev => ({ ...prev, [d]: [] }))
        }
        setNewDomainInput('')
    }

    const handleClearAll = async () => {
        if (confirm('Are you sure you want to delete ALL cookies across ALL domains?')) {
            await (window as any).electronAPI.clearAllCookies()
            refreshData()
        }
    }

    const handleDeleteCookie = async (domain: string, name: string) => {
        const url = `https://${domain.replace(/^\./, '')}`
        await (window as any).electronAPI.deleteCookie(url, name)
        if (selectedCookie?.domain === domain && selectedCookie?.name === name) {
            setSelectedCookie(null)
        }
        refreshData()
    }

    const startEditing = (cookie: Cookie) => {
        setSelectedCookie({ domain: cookie.domain.replace(/^\./, ''), name: cookie.key })
        setIsAddingNew(null)
        
        // Construct raw string
        let raw = `${cookie.key}=${cookie.value}; Path=${cookie.path || '/'};`
        if (cookie.domain) raw += ` Domain=${cookie.domain};`
        if (cookie.expires && cookie.expires !== 'Infinity' && cookie.expires !== '-000001-01-01T00:00:00.000Z') {
            raw += ` Expires=${new Date(cookie.expires).toUTCString()};`
        }
        if (cookie.httpOnly) raw += ` HttpOnly;`
        if (cookie.secure) raw += ` Secure;`
        if (cookie.sameSite) raw += ` SameSite=${cookie.sameSite};`
        
        setEditRawValue(raw)
    }

    const startAdding = (domain: string) => {
        setIsAddingNew({ domain })
        setSelectedCookie(null)
        setEditRawValue(`Cookie_Name=value; Path=/; Domain=${domain};`)
    }

    const handleSaveEdit = async () => {
        if (!editRawValue) return
        try {
            const domain = selectedCookie?.domain || isAddingNew?.domain || ''
            const oldName = selectedCookie?.name
            await (window as any).electronAPI.updateCookieRaw(domain, editRawValue, oldName)
            setSelectedCookie(null)
            setIsAddingNew(null)
            refreshData()
        } catch (e: any) {
            alert('Failed to save cookie: ' + e.message)
        }
    }

    // --- Whitelist Management ---
    const addWhitelist = async () => {
        if (!newWhitelistDomain) return
        await (window as any).electronAPI.addToWhitelist(newWhitelistDomain)
        setNewWhitelistDomain('')
        refreshData()
    }

    const removeWhitelist = async (d: string) => {
        await (window as any).electronAPI.removeFromWhitelist(d)
        refreshData()
    }

    // Combine domains from cookies and whitelist for the list
    const domains = useMemo(() => {
        const dSet = new Set([...Object.keys(allCookies).map(d => d.replace(/^\./, '')), ...whitelist])
        return Array.from(dSet).sort()
    }, [allCookies, whitelist])

    if (!isOpen) return null

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ position: 'fixed', inset: 0 }} onClick={onClose} />
            
            <div className="glass-panel" style={{ position: 'relative', width: '100%', maxWidth: '900px', height: '100%', maxHeight: '800px', background: '#0F0F0F', border: '1px solid #1F1F1F', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 64px rgba(0,0,0,0.9)' }}>
                
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid #1F1F1F' }}>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <button style={{ background: 'none', border: 'none', padding: '0 0 4px', fontSize: '15px', fontWeight: 700, color: '#FFF', borderBottom: '2px solid #FF5000', cursor: 'pointer' }}>Manage Cookies</button>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                </div>

                {/* Add Domain Bar */}
                <div style={{ padding: '24px 32px', display: 'flex', gap: '12px' }}>
                    <input 
                        value={newDomainInput} 
                        onChange={e => setNewDomainInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                        placeholder="Type a domain name" 
                        style={{ flex: 1, background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '10px 16px', color: '#FFF', fontSize: '14px', outline: 'none' }} 
                    />
                    <button onClick={handleAddDomain} style={{ background: '#2A2A2A', border: 'none', color: '#FFF', padding: '0 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Add domain</button>
                </div>

                {/* Main Content Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 40px' }}>
                    {domains.map(domain => {
                        const cookies = [...(allCookies[domain] || []), ...(allCookies['.' + domain] || [])]
                        return (
                            <div key={domain} style={{ marginBottom: '32px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFF', margin: 0 }}>{domain}</h3>
                                        <span style={{ fontSize: '12px', color: '#6B7280' }}>{cookies.length} {cookies.length === 1 ? 'cookie' : 'cookies'}</span>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (confirm(`Delete all cookies for ${domain}?`)) {
                                                await (window as any).electronAPI.clearDomainCookies(domain)
                                                refreshData()
                                            }
                                        }}
                                        style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                                    >
                                        Clear all
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {cookies.map(c => {
                                        const isSelected = selectedCookie?.domain === domain && selectedCookie?.name === c.key
                                        return (
                                            <div key={c.key} style={{ display: 'flex', alignItems: 'center', background: isSelected ? '#333' : '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', overflow: 'hidden' }}>
                                                <button 
                                                    onClick={() => startEditing(c)}
                                                    style={{ background: 'none', border: 'none', padding: '8px 12px', color: '#FFF', fontSize: '13px', cursor: 'pointer', transition: '0.1s' }}
                                                >
                                                    {c.key}
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteCookie(domain, c.key)}
                                                    style={{ background: 'none', border: 'none', padding: '8px 10px', color: '#6B7280', fontSize: '12px', cursor: 'pointer', borderLeft: '1px solid #2A2A2A' }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#FFF'}
                                                    onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )
                                    })}
                                    <button 
                                        onClick={() => startAdding(domain)}
                                        style={{ background: 'none', border: 'none', padding: '8px 12px', color: '#6B7280', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        onMouseEnter={e => e.currentTarget.style.color = '#FFF'}
                                        onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                                    >
                                        + Add Cookie
                                    </button>
                                </div>

                                {/* Raw Editor for this domain */}
                                {(selectedCookie?.domain === domain || isAddingNew?.domain === domain) && (
                                    <div style={{ marginTop: '20px', background: '#0A0A0A', border: '1px solid #1F1F1F', borderRadius: '12px', padding: '20px', animation: 'slideDown 0.2s ease' }}>
                                        <textarea 
                                            value={editRawValue}
                                            onChange={e => setEditRawValue(e.target.value)}
                                            style={{ width: '100%', height: '100px', background: 'transparent', border: 'none', color: '#FF5000', fontFamily: 'monospace', fontSize: '14px', outline: 'none', resize: 'none' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                                            <button 
                                                onClick={() => { setSelectedCookie(null); setIsAddingNew(null) }}
                                                style={{ background: '#1A1A1A', border: 'none', color: '#FFF', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={handleSaveEdit}
                                                style={{ background: '#FF5000', border: 'none', color: '#FFF', padding: '10px 24px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Footer Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderTop: '1px solid #1F1F1F', background: '#0D0D0D' }}>
                    <button 
                        onClick={() => setShowWhitelist(true)}
                        style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', color: '#FFF', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Domains Allowlist
                    </button>
                    <button 
                        onClick={handleClearAll}
                        style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '13px', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#FFF'}
                        onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                    >
                        Clear All Cookies
                    </button>
                </div>

                {/* Whitelist Overlay */}
                {showWhitelist && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: '#0F0F0F', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', borderBottom: '1px solid #1F1F1F' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF', margin: 0 }}>Domains Allowlist</h3>
                            <button onClick={() => setShowWhitelist(false)} style={{ background: 'none', border: 'none', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Back to cookies</button>
                        </div>
                        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                            <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>Whitelisted domains will automatically capture and store cookies from server responses. If the whitelist is empty, all domains are allowed.</p>
                            
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                <input 
                                    value={newWhitelistDomain} 
                                    onChange={e => setNewWhitelistDomain(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addWhitelist()}
                                    placeholder="e.g. example.com" 
                                    style={{ flex: 1, background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '10px 16px', color: '#FFF', fontSize: '14px', outline: 'none' }} 
                                />
                                <button onClick={addWhitelist} style={{ background: '#FFF', color: '#000', border: 'none', padding: '0 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>Add Domain</button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {whitelist.map(d => (
                                    <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '10px' }}>
                                        <span style={{ fontSize: '14px', color: '#FFF' }}>{d}</span>
                                        <button onClick={() => removeWhitelist(d)} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: '13px', cursor: 'pointer' }}>Remove</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}} />
        </div>
    )
}
