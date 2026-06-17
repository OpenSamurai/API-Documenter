import { ipcMain, app } from 'electron'
import { BaseController } from './BaseController'
import fs from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'

export class DeploymentController extends BaseController {
    registerHandlers(): void {
        ipcMain.handle('deploy-to-vercel', this.deployToVercel.bind(this))
        ipcMain.handle('delete-vercel-project', this.deleteVercelProject.bind(this))
    }

    async deleteVercelProject(_event: any, params: { projectId: string, projectName: string }) {
        const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
        const serverPath = join(projectRoot, 'server')

        if (!fs.existsSync(serverPath)) return { success: false, error: 'Server path not found' }

        const sanitizedName = params.projectName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        const shortId = params.projectId.split('-')[0]
        const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

        const runVercelCommand = (commandOrArgs: string | string[]) => {
            return new Promise<{ success: boolean; error?: string; output?: string }>((resolve) => {
                const child = Array.isArray(commandOrArgs)
                    ? spawn('vercel', commandOrArgs, { cwd: serverPath, shell: process.platform === 'win32' })
                    : spawn(process.platform === 'win32' ? 'cmd' : 'sh', [process.platform === 'win32' ? '/c' : '-c', commandOrArgs], { cwd: serverPath })

                let output = ''
                child.stdout.on('data', (d) => output += d.toString())
                child.stderr.on('data', (d) => output += d.toString())
                child.on('close', (code) => {
                    if (code === 0) resolve({ success: true, output })
                    else resolve({ success: false, error: `Exit code ${code}`, output })
                })
            })
        }

        try {
            // We just need to unlink if it exists, or we could try to 'rm' if we had a token, 
            // but usually 'vercel rm' is enough.
            const res = await runVercelCommand(['rm', vercelProjectName, '--yes'])
            return res
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async deployToVercel(_event: any, params: { databaseUrl: string, adminToken?: string, projectId: string, projectName: string }) {
        const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
        const serverPath = join(projectRoot, 'server')

        if (!fs.existsSync(serverPath)) {
            console.error('[Deploy] Server path not found:', serverPath)
            return {
                success: false,
                error: `Deployment folder not found. If you are using the packaged app, please ensure the 'server' folder exists in the resources directory.`
            }
        }

        const sanitizedName = params.projectName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')

        const shortId = params.projectId.split('-')[0]
        const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

        const runVercelCommand = (commandOrArgs: string | string[], stdinValue?: string) => {
            return new Promise<{ success: boolean; error?: string; output?: string }>((resolve) => {
                const commandString = Array.isArray(commandOrArgs) ? `vercel ${commandOrArgs.join(' ')}` : commandOrArgs
                this.mainWindow?.webContents.send('deploy-output', `\n> Executing: ${commandString}\n`)

                let child: any
                if (Array.isArray(commandOrArgs)) {
                    child = spawn('vercel', commandOrArgs, { cwd: serverPath, shell: process.platform === 'win32' })
                } else {
                    const shell = process.platform === 'win32' ? 'cmd' : 'sh'
                    const args = process.platform === 'win32' ? ['/c', commandOrArgs] : ['-c', commandOrArgs]
                    child = spawn(shell, args, { cwd: serverPath })
                }

                let fullOutput = ''

                if (stdinValue) {
                    const lines = stdinValue.split('\n')
                    lines.forEach(line => {
                        child.stdin.write(line + '\n')
                    })
                }
                child.stdin.end()

                child.stdout.on('data', (data) => {
                    const s = data.toString()
                    fullOutput += s
                    this.mainWindow?.webContents.send('deploy-output', s)
                })

                child.stderr.on('data', (data) => {
                    const s = data.toString()
                    fullOutput += s
                    this.mainWindow?.webContents.send('deploy-output', s)
                })

                child.on('close', (code) => {
                    if (code === 0) {
                        resolve({ success: true, output: fullOutput })
                    } else {
                        resolve({ success: false, error: `Command failed with code ${code}`, output: fullOutput })
                    }
                })
            })
        }

        try {
            this.mainWindow?.webContents.send('deploy-output', `Starting deployment for project: ${vercelProjectName}...\n`)

            const linkRes = await runVercelCommand(`vercel link --yes --project ${vercelProjectName}`)
            if (!linkRes.success) return linkRes

            this.mainWindow?.webContents.send('deploy-output', `Setting environment variables...\n`)

            // Remove first to avoid "already exists" errors, ignore failures
            await runVercelCommand(['env', 'rm', 'DATABASE_URL', 'production', '--yes'])

            this.mainWindow?.webContents.send('deploy-output', `Adding DATABASE_URL...\n`)
            // Use --value and --yes for non-interactive addition (supported in newer Vercel CLI)
            await runVercelCommand(['env', 'add', 'DATABASE_URL', 'production', '--value', params.databaseUrl, '--yes'])

            if (params.adminToken) {
                await runVercelCommand(['env', 'rm', 'ADMIN_TOKEN', 'production', '--yes'])
                this.mainWindow?.webContents.send('deploy-output', `Adding ADMIN_TOKEN...\n`)
                await runVercelCommand(['env', 'add', 'ADMIN_TOKEN', 'production', '--value', params.adminToken, '--yes'])
            }

            this.mainWindow?.webContents.send('deploy-output', `Deploying to production...\n`)
            const deployRes = await runVercelCommand(`vercel --prod --yes`)

            if (deployRes.success) {
                // Try to find the production alias first (cleaner), then the production URL, then any vercel URL
                const aliasMatch = deployRes.output?.match(/Aliased:\s+(https:\/\/[a-z0-9-]+\.vercel\.app)/i)
                const prodMatch = deployRes.output?.match(/Production:\s+(https:\/\/[a-z0-9-]+\.vercel\.app)/i)
                const genericMatch = deployRes.output?.match(/https:\/\/[a-z0-9-]+\.vercel\.app/i)

                const deployUrl = aliasMatch ? aliasMatch[1] : (prodMatch ? prodMatch[1] : (genericMatch ? genericMatch[0] : null))
                return { success: true, url: deployUrl }
            }
            return deployRes
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
