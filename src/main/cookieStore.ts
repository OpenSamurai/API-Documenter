import { CookieJar, Cookie } from 'tough-cookie'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'

interface SerializedJar {
    cookies: any[]
}

export class CookieStore {
    private jar: CookieJar
    private whitelist: Set<string>
    private storagePath: string | null = null

    constructor() {
        this.jar = new CookieJar()
        this.whitelist = new Set()
        // Initialization happens lazily in ensureInitialized()
    }

    private ensureInitialized() {
        if (this.storagePath) return

        try {
            this.storagePath = path.join(app.getPath('userData'), 'local-cookies.json')
            if (fs.existsSync(this.storagePath)) {
                const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'))
                if (data.jar) {
                    this.jar = CookieJar.fromJSON(JSON.stringify(data.jar))
                }
                if (data.whitelist) {
                    this.whitelist = new Set(data.whitelist)
                }
            }
        } catch (e) {
            console.error('[CookieStore] Failed to initialize:', e)
            // Fallback: use fresh jar if path fails (unlikely in main process)
            this.storagePath = 'FAILED' 
        }
    }

    private save() {
        this.ensureInitialized()
        if (!this.storagePath || this.storagePath === 'FAILED') return

        try {
            const data = {
                jar: this.jar.toJSON(),
                whitelist: Array.from(this.whitelist)
            }
            fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
        } catch (e) {
            console.error('[CookieStore] Failed to save:', e)
        }
    }

    async getCookieString(url: string): Promise<string> {
        this.ensureInitialized()
        return await this.jar.getCookieString(url)
    }

    async setCookie(url: string, cookieHeader: string | string[]): Promise<void> {
        this.ensureInitialized()
        const domain = new URL(url).hostname
        
        if (!this.isWhitelisted(domain)) {
            return
        }

        if (Array.isArray(cookieHeader)) {
            for (const h of cookieHeader) {
                await this.jar.setCookie(h, url)
            }
        } else {
            await this.jar.setCookie(cookieHeader, url)
        }
        this.save()
    }

    async updateCookieFromRaw(domain: string, rawString: string, oldName?: string): Promise<void> {
        this.ensureInitialized()
        const cookie = Cookie.parse(rawString)
        if (!cookie) throw new Error('Invalid cookie string')

        // Ensure domain is set correctly if not in the raw string
        if (!cookie.domain) {
            cookie.domain = domain.replace(/^\./, '')
        }

        // If we are renaming or updating an existing cookie, we might need to delete the old one first
        // tough-cookie handles overwriting if the key/domain/path match, but if they change, we should be careful.
        if (oldName && oldName !== cookie.key) {
            await this.deleteCookie(`https://${domain.replace(/^\./, '')}`, oldName)
        }

        await this.jar.setCookie(cookie, `https://${domain.replace(/^\./, '')}`)
        this.save()
    }

    async addCookieManually(domain: string, cookieData: { name: string, value: string, path?: string }): Promise<void> {
        this.ensureInitialized()
        const cookie = new Cookie({
            key: cookieData.name,
            value: cookieData.value,
            domain: domain.replace(/^\./, ''),
            path: cookieData.path || '/',
            httpOnly: false,
            secure: false
        })
        await this.jar.setCookie(cookie, `https://${domain.replace(/^\./, '')}`)
        this.save()
    }

    async deleteCookie(url: string, name: string): Promise<void> {
        this.ensureInitialized()
        const cookies = await this.jar.getCookies(url)
        const target = cookies.find(c => c.key === name)
        if (target) {
            target.expires = new Date(0)
            await this.jar.setCookie(target, url)
            this.save()
        }
    }

    async clearDomainCookies(domain: string): Promise<void> {
        this.ensureInitialized()
        const json = this.jar.toJSON()
        json.cookies = json.cookies.filter((c: any) => c.domain !== domain && c.domain !== `.${domain}`)
        this.jar = CookieJar.fromJSON(JSON.stringify(json))
        this.save()
    }

    async clearAllCookies(): Promise<void> {
        this.ensureInitialized()
        this.jar = new CookieJar()
        this.save()
    }

    async getAllCookiesByDomain(): Promise<Record<string, any[]>> {
        this.ensureInitialized()
        const json = this.jar.toJSON()
        const grouped: Record<string, any[]> = {}
        json.cookies.forEach((c: any) => {
            const domain = c.domain
            if (!grouped[domain]) grouped[domain] = []
            grouped[domain].push(c)
        })
        return grouped
    }

    getWhitelist(): string[] {
        this.ensureInitialized()
        return Array.from(this.whitelist)
    }

    addToWhitelist(domain: string): void {
        this.ensureInitialized()
        this.whitelist.add(domain.toLowerCase())
        this.save()
    }

    removeFromWhitelist(domain: string): void {
        this.ensureInitialized()
        this.whitelist.delete(domain.toLowerCase())
        this.save()
    }

    isWhitelisted(domain: string): boolean {
        this.ensureInitialized()
        const lowerDomain = domain.toLowerCase()
        if (this.whitelist.size === 0) return true 
        return Array.from(this.whitelist).some(w => lowerDomain === w || lowerDomain.endsWith(`.${w}`))
    }
}

export const cookieStore = new CookieStore()
