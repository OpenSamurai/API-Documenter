import { request, FormData, Agent, setGlobalDispatcher, interceptors } from 'undici'
import fs from 'fs'
import path from 'path'

// Global connection pool (huge perf win)
const agent = new Agent({
    connections: 100,           // Parallel connections
    pipelining: 10,             // HTTP/1.1 pipelining
    keepAliveTimeout: 60000,    // Reuse connections
    keepAliveMaxTimeout: 60000,
    headersTimeout: 30000,
    bodyTimeout: 30000
})

setGlobalDispatcher(agent)


export interface HttpRequestOptions {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    formFields?: { key: string, value: string, type: 'text' | 'file' }[]
}

export interface HttpResponse {
    success: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    time: number
    size?: number
    error?: string
}

/**
 * Sends an HTTP request using Undici for better performance and control.
 */
export async function sendHttpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
    const start = performance.now()
    try {
        const url = new URL(opts.url)
        const method = opts.method.toUpperCase() as any
        const headers: Record<string, string> = { ...opts.headers }

        let requestBody: any = opts.body

        // Handle multipart/form-data
        if (opts.formFields && opts.formFields.length > 0 && !['GET', 'HEAD'].includes(method)) {
            const formData = new FormData()
            for (const field of opts.formFields) {
                if (field.type === 'file') {
                    let filePaths: string[] = []
                    try {
                        const parsed = JSON.parse(field.value)
                        filePaths = Array.isArray(parsed) ? parsed : [field.value]
                    } catch (e) {
                        filePaths = field.value ? [field.value] : []
                    }

                    for (const fp of filePaths) {
                        if (fp && fs.existsSync(fp)) {
                            const buffer = fs.readFileSync(fp)
                            formData.append(field.key, new Blob([buffer]), path.basename(fp))
                        }
                    }
                } else {
                    formData.append(field.key, field.value)
                }
            }
            requestBody = formData

            // Remove manual Content-Type if it was set to multipart/form-data, 
            // undici will set it with the correct boundary
            const ctKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type')
            if (ctKey && headers[ctKey].toLowerCase().includes('multipart/form-data')) {
                delete headers[ctKey]
            }
        }

        const { statusCode, headers: resHeaders, body } = await request(url.toString(), {
            method,
            headers,
            body: requestBody,
            // Enhanced options
            headersTimeout: 10000,
            bodyTimeout: 10000,
            // Use global agent with redirect interceptor
            dispatcher: agent.compose(
                interceptors.redirect({
                    maxRedirections: 5
                })
            ) as any
        })

        const bodyText = await body.text()
        const elapsed = Math.round(performance.now() - start)

        // Convert undici headers (IncomingHttpHeaders) to plain Record<string, string>
        const formattedHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(resHeaders)) {
            if (value !== undefined) {
                formattedHeaders[key] = Array.isArray(value) ? value.join(', ') : (value as string)
            }
        }

        return {
            success: true,
            status: statusCode,
            statusText: getStatusText(statusCode),
            headers: formattedHeaders,
            body: bodyText,
            time: elapsed,
            size: Buffer.byteLength(bodyText, 'utf8')
        }
    } catch (error: any) {
        const elapsed = Math.round(performance.now() - start)
        return {
            success: false,
            error: error.message || String(error),
            time: elapsed
        }
    }
}

/**
 * Helper to get status text from status code since Undici response doesn't provide it directly.
 */
function getStatusText(code: number): string {
    const statusTexts: Record<number, string> = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    }
    return statusTexts[code] || `Status ${code}`
}
