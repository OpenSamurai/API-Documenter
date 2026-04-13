import { BrowserWindow, dialog } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import MarkdownIt from 'markdown-it'

/**
 * Exports raw HTML content to a PDF file.
 */
export async function exportHtmlToPdf(html: string, fileName: string): Promise<void> {
    const win = new BrowserWindow({
        show: false,
        width: 900,
        height: 1200
    })
    const tempHtmlPath = path.join(os.tmpdir(), `api-doc-export-${Date.now()}.html`)
    fs.writeFileSync(tempHtmlPath, html)

    try {
        await win.loadFile(tempHtmlPath)
    } catch (e) {
        console.error("Failed to load temp HTML file for PDF generation", e)
    }

    const pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: {
            marginType: 'none'
        }
    })

    try {
        if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath)
        }
    } catch (e) {
        console.error("Failed to cleanup temp HTML file", e)
    }

    const { filePath } = await dialog.showSaveDialog({
        defaultPath: fileName
    })

    if (filePath) {
        fs.writeFileSync(filePath, pdf)
    }

    win.close()
}

/**
 * Generates a PDF buffer from Markdown content.
 * Internal helper used for both preview and save.
 */
async function generatePdfBuffer(markdownContent: string): Promise<Buffer> {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    })

    const htmlContent = md.render(markdownContent)
    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {
                size: A4;
                margin: 25mm;
            }
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #111827;
                background-color: #ffffff;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
            }
            .container {
                width: 100%;
                max-width: 800px;
                margin: 0 auto;
            }
            
            /* --- Typography --- */
            h1 {
                font-size: 3.5rem;
                font-weight: 900;
                color: #111827;
                margin-top: 0;
                margin-bottom: 32px;
                letter-spacing: -0.04em;
                line-height: 1.1;
                text-align: center;
            }
            h2 {
                font-size: 2.2rem;
                font-weight: 800;
                color: #111827;
                margin-top: 64px;
                margin-bottom: 24px;
                letter-spacing: -0.02em;
                border-bottom: 2px solid #F3F4F6;
                padding-bottom: 12px;
            }
            h3 {
                font-size: 1.6rem;
                font-weight: 700;
                color: #1F2937;
                margin-top: 40px;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
            }
            h4 {
                font-size: 1.1rem;
                font-weight: 700;
                color: #6B7280;
                margin-top: 28px;
                margin-bottom: 12px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            p {
                margin: 16px 0;
                color: #374151;
                font-size: 1.05rem;
            }

            /* --- API Method Badges --- */
            .method {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 6px;
                font-family: monospace;
                font-weight: 800;
                font-size: 0.85em;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-right: 8px;
            }
            .method-GET { background: #ECFDF5; color: #065F46; border: 1px solid #D1FAE5; }
            .method-POST { background: #EFF6FF; color: #1E40AF; border: 1px solid #DBEAFE; }
            .method-PUT { background: #FFFBEB; color: #92400E; border: 1px solid #FEF3C7; }
            .method-DELETE { background: #FEF2F2; color: #991B1B; border: 1px solid #FEE2E2; }
            .method-PATCH { background: #F5F3FF; color: #5B21B6; border: 1px solid #EDE9FE; }

            .status-code {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 700;
                font-size: 0.9em;
                margin-left: 8px;
            }
            .status-2xx { background: #DCFCE7; color: #166534; }
            .status-3xx { background: #E0F2FE; color: #075985; }
            .status-4xx { background: #FFEDD5; color: #9A3412; }
            .status-5xx { background: #FEE2E2; color: #991B1B; }

            /* --- Table of Contents (Premium Modern) --- */
            .toc-container { margin: 80px 0; }
            .toc-title-bar { border-bottom: 3px solid #3B82F6; margin-bottom: 48px; padding-bottom: 24px; }
            .toc-title-bar h2 { margin: 0 !important; font-size: 3rem !important; border-bottom: none !important; color: #111827 !important; }
            .toc-list { display: flex; flex-direction: column; gap: 32px; }
            .toc-folder-group { position: relative; }
            .toc-folder-item { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
            .toc-folder-number { background: #F3F4F6; color: #3B82F6; font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.9em; min-width: 32px; text-align: center; font-family: monospace; }
            .toc-folder-link { color: #111827; text-decoration: none; font-size: 1.4rem; font-weight: 800; }
            .toc-endpoints-container { border-left: 2px solid #F3F4F6; margin-left: 15px; padding-left: 32px; display: flex; flex-direction: column; gap: 12px; }
            .toc-endpoint-item { display: flex; align-items: center; gap: 12px; position: relative; }
            .toc-endpoint-item::before { content: ""; position: absolute; left: -33px; top: 50%; width: 12px; height: 2px; background: #F3F4F6; }
            .toc-endpoint-bullet { display: none; }
            .toc-endpoint-link { color: #4B5563; text-decoration: none; font-size: 1.1rem; font-weight: 500; }

            /* --- Code & Pre --- */
            pre { background-color: #f8fafc; color: #1e293b; padding: 24px; border-radius: 12px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.9rem; line-height: 1.7; white-space: pre-wrap; word-break: break-all; margin: 24px 0; border: 1px solid #e2e8f0; }
            code { font-family: inherit; background-color: #f1f5f9; color: #475569; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
            pre code { background-color: transparent; color: inherit; padding: 0; }

            /* --- Tables --- */
            table { width: 100%; border-collapse: collapse; margin: 32px 0; }
            table th, table td { padding: 14px 16px; border: 1px solid #E5E7EB; text-align: left; vertical-align: top; }
            table th { background-color: #F9FAFB; font-weight: 700; color: #374151; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }

            /* --- Helpers --- */
            .page-break { page-break-after: always; }
            blockquote { border-left: 4px solid #3B82F6; padding: 8px 16px; margin: 24px 0; background: #F9FAFB; color: #4B5563; font-style: italic; border-radius: 0 8px 8px 0; }
            img { max-width: 100%; border-radius: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            ${htmlContent}
        </div>
    </body>
    </html>
    `

    // Write HTML to a temp file so BrowserWindow can load it as a local file
    const tempHtmlPath = path.join(os.tmpdir(), `api-doc-pdf-${Date.now()}.html`)
    fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8')

    const win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 1600,
        webPreferences: { javascript: false }
    })

    try {
        await win.loadFile(tempHtmlPath)
        // Wait for fonts/images to settle
        await new Promise(resolve => setTimeout(resolve, 500))

        const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { marginType: 'none' }
        })

        return Buffer.from(pdfBuffer)
    } finally {
        win.close()
        try { fs.unlinkSync(tempHtmlPath) } catch (_) { /* ignore cleanup errors */ }
    }
}

/**
 * Generates a PDF buffer for preview from Markdown content.
 */
export async function previewMarkdownToPdf(markdownContent: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    try {
        const buffer = await generatePdfBuffer(markdownContent)
        return { success: true, data: buffer }
    } catch (error: any) {
        console.error('Error during PDF preview generation:', error)
        return { success: false, error: error.message }
    }
}

/**
 * Generates and saves a PDF file from Markdown content.
 */
export async function generateMarkdownToPdf(markdownContent: string, fileName: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { filePath } = await dialog.showSaveDialog({
            defaultPath: fileName,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        })

        if (!filePath) return { success: false, error: 'Cancelled' }

        const buffer = await generatePdfBuffer(markdownContent)
        fs.writeFileSync(filePath, buffer)

        return { success: true }
    } catch (error: any) {
        console.error('Error during PDF conversion:', error)
        return { success: false, error: error.message }
    }
}
