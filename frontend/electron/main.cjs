const { app, BrowserWindow, Menu, nativeTheme, protocol } = require('electron')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { readFile } = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const tcp = require('node:net')

protocol.registerSchemesAsPrivileged([
  { scheme: 'acc', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

let port
let apiProcess
let mainWindow
let shutdownStarted = false

function ensureSettings() {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json')
  mkdirSync(path.dirname(settingsPath), { recursive: true })
  let settings = {}
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')) } catch { settings = {} }
  }
  if (!settings.apiToken) settings.apiToken = randomBytes(32).toString('hex')
  if (!settings.allowedRoots) settings.allowedRoots = app.getPath('home')
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 })
  return settings
}

function waitForApi() {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      http.get(`http://127.0.0.1:${port}/api/health`, response => {
        response.resume()
        if (response.statusCode === 200) return resolve()
        retry()
      }).on('error', retry)
      function retry() {
        if (Date.now() - started > 30000) return reject(new Error('ACC API failed to start'))
        setTimeout(check, 300)
      }
    }
    check()
  })
}

function startApi(settings) {
  return new Promise((resolve, reject) => {
    const probe = tcp.createServer()
    probe.listen(0, '127.0.0.1', () => {
      port = probe.address().port
      probe.close(resolve)
    })
    probe.on('error', reject)
  }).then(() => {
  const env = { ...process.env, ACC_API_TOKEN: settings.apiToken, ACC_ALLOWED_ROOTS: settings.allowedRoots,
    ACC_DATA_DIR: path.join(app.getPath('userData'), 'data'), ACC_API_PORT: String(port) }
  if (app.isPackaged) {
    apiProcess = spawn(path.join(process.resourcesPath, 'backend', 'acc-api.exe'), [], { env, windowsHide: true, stdio: 'ignore' })
  } else {
    const root = path.resolve(__dirname, '..', '..')
    const python = path.join(root, 'backend', '.venv', 'Scripts', 'python.exe')
    apiProcess = spawn(python, ['-m', 'acc.desktop'], { cwd: path.join(root, 'backend'), env: { ...env, PYTHONPATH: path.join(root, 'backend') }, windowsHide: true, stdio: 'ignore' })
  }
  apiProcess.on('error', error => console.error('Could not start ACC API:', error.message))
  apiProcess.on('exit', code => { if (code && !app.isQuitting) console.error(`ACC API stopped (${code})`) })
  return waitForApi()
  })
}

function createWindow(settings) {
  mainWindow = new BrowserWindow({ width: 1440, height: 920, minWidth: 900, minHeight: 640,
    backgroundColor: '#111315', title: 'Agent Command Center', autoHideMenuBar: true,
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#16181b', symbolColor: '#b0b7c0', height: 36 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false,
      additionalArguments: [`--acc-api-token=${settings.apiToken}`, `--acc-api-port=${port}`],
    } })
  mainWindow.loadURL('acc://app/')
}

app.whenReady().then(async () => {
  try {
    if (process.platform === 'win32') {
      nativeTheme.themeSource = 'dark'
      Menu.setApplicationMenu(null)
    }
    const appRoot = path.resolve(__dirname, '..', 'dist')
    protocol.handle('acc', async request => {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      const target = path.resolve(appRoot, pathname === '/' ? 'index.html' : `.${pathname}`)
      const relative = path.relative(appRoot, target)
      if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 })
      try {
        const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
        const contentType = contentTypes[path.extname(target)] ?? 'application/octet-stream'
        return new Response(await readFile(target), { headers: { 'Content-Type': contentType } })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })
    const settings = ensureSettings()
    await startApi(settings)
    createWindow(settings)
  }
  catch (error) { console.error(error); app.quit() }
})
app.on('before-quit', event => {
  app.isQuitting = true
  if (!apiProcess || apiProcess.exitCode !== null || apiProcess.signalCode !== null) return

  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true

  const finishQuit = () => app.exit(0)
  if (process.platform === 'win32' && apiProcess.pid) {
    const killer = spawn('taskkill.exe', ['/PID', String(apiProcess.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    killer.once('close', finishQuit)
    killer.once('error', () => {
      apiProcess.kill()
      finishQuit()
    })
    return
  }

  apiProcess.kill()
  apiProcess.once('exit', finishQuit)
  setTimeout(finishQuit, 3000).unref()
})
app.on('window-all-closed', () => app.quit())
