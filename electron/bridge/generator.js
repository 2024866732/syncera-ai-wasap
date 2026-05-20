'use strict'
/**
 * SYNCERA Installer Generator (Seller Mode)
 *
 * Generates a FRESH, EMPTY SYNCERA installer for redistribution to customers.
 * Bundles Ollama installer alongside so customer gets AI ready out-of-the-box.
 *
 * Customer experience after install:
 *   1. Run SYNCERA installer → installs SYNCERA
 *   2. On first launch, app offers to install Ollama (bundled .exe in app folder)
 *   3. Once Ollama installed, AI works locally
 */

const { app, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const cp   = require('child_process')

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const CUSTOMER_OUT_DIR = path.join(PROJECT_ROOT, 'dist-customers')
const PLANS = {
  demo: {
    id: 'demo',
    name: 'Demo',
    features: ['chats', 'ai_basic', 'knowledge_base', 'quicksend_single', 'calendar_basic', 'templates', 'demo_limited'],
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    features: ['chats', 'ai_basic', 'knowledge_base', 'quicksend_single', 'calendar_basic', 'templates', 'theme'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    features: ['chats', 'ai_basic', 'knowledge_base', 'status_wa', 'quicksend_bulk', 'broadcast', 'calendar_ai', 'reports', 'analytics', 'templates', 'orders', 'reminders', 'pipeline', 'insights', 'drive_backup', 'group_sync'],
  },
  pro_max: {
    id: 'pro_max',
    name: 'Pro Max',
    features: ['all', 'installer_generator', 'bundle_ollama', 'customer_package', 'advanced_ai', 'backup_restore', 'finance_import'],
  },
}

let buildInProgress = false
let lastBuild = null
let mainWindow = null

function setWindow(w) { mainWindow = w }

function emit(state, data = {}) {
  lastBuild = { state, ...data, timestamp: Date.now() }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('generator:status', lastBuild)
  }
}

function getStatus() { return lastBuild || { state: 'idle' } }

/**
 * Build a fresh installer.
 * @param {object} opts
 * @param {boolean} opts.bundleOllama - copy Ollama installer into resources
 * @param {'demo'|'basic'|'pro'|'pro_max'} opts.plan - customer package plan
 */
async function buildInstaller(opts = {}) {
  if (buildInProgress) return { ok: false, error: 'Build already in progress' }
  if (!fs.existsSync(PROJECT_ROOT) || !fs.existsSync(path.join(PROJECT_ROOT, 'package.json'))) {
    return { ok: false, error: 'Project root not found' }
  }

  buildInProgress = true
  const plan = PLANS[opts.plan] || PLANS.pro
  const shouldBundleOllama = plan.id === 'pro_max' && !!opts.bundleOllama
  emit('starting', { plan: plan.id, planName: plan.name })
  let planFile = null
  let ollamaHoldFile = null

  try {
    // 1. Prepare extra resources folder for Ollama
    const extrasDir = path.join(PROJECT_ROOT, 'build', 'extras')
    if (!fs.existsSync(extrasDir)) fs.mkdirSync(extrasDir, { recursive: true })
    planFile = path.join(extrasDir, 'syncera-plan.json')
    fs.writeFileSync(planFile, JSON.stringify({
      ...plan,
      bundleOllama: shouldBundleOllama,
      generatedAt: new Date().toISOString(),
      generatedFrom: 'SYNCERA latest local source',
    }, null, 2))

    // 2. Find Ollama installer (user should drop OllamaSetup.exe into build/extras)
    const ollamaSrc = path.join(extrasDir, 'OllamaSetup.exe')
    if (shouldBundleOllama && !fs.existsSync(ollamaSrc)) {
      emit('warning', { message: 'Ollama installer not found at build/extras/OllamaSetup.exe — building without Ollama bundle', plan: plan.id, planName: plan.name })
    }
    if (!shouldBundleOllama && fs.existsSync(ollamaSrc)) {
      ollamaHoldFile = path.join(PROJECT_ROOT, 'build', `OllamaSetup.${Date.now()}.hold`)
      fs.renameSync(ollamaSrc, ollamaHoldFile)
    }

    // 3. Run vite build
    emit('vite-build', { plan: plan.id, planName: plan.name })
    await runCmd('npm', ['run', 'vite:build'], PROJECT_ROOT)

    // 4. Run electron-builder
    emit('electron-build', { plan: plan.id, planName: plan.name })
    await runCmd('npx', ['electron-builder', '--win', 'nsis', '--config.directories.output=dist-customers'], PROJECT_ROOT)

    // 5. Locate output
    const outDir = CUSTOMER_OUT_DIR
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.exe') && f.startsWith('SYNCERA-Setup-'))
    if (files.length === 0) throw new Error('Installer not found after build')

    const installer = files.sort().reverse()[0]
    const fullPath = path.join(outDir, installer)
    const planInstaller = installer.replace('SYNCERA-Setup-', `SYNCERA-${plan.name.replace(/\s+/g, '')}-Setup-`)
    const planPath = path.join(outDir, planInstaller)
    fs.copyFileSync(fullPath, planPath)
    const sizeMB = (fs.statSync(planPath).size / 1024 / 1024).toFixed(1)

    emit('done', { installer: planInstaller, path: planPath, sizeMB, plan: plan.id, planName: plan.name })
    return { ok: true, path: planPath, sizeMB, plan: plan.id, planName: plan.name }
  } catch (e) {
    emit('error', { message: String(e.message || e), plan: plan.id, planName: plan.name })
    return { ok: false, error: String(e.message || e) }
  } finally {
    if (planFile) {
      try { fs.unlinkSync(planFile) } catch {}
    }
    if (ollamaHoldFile) {
      try { fs.renameSync(ollamaHoldFile, path.join(PROJECT_ROOT, 'build', 'extras', 'OllamaSetup.exe')) } catch {}
    }
    buildInProgress = false
  }
}

function runCmd(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(cmd, args, { cwd, shell: true })
    let output = ''
    proc.stdout.on('data', (d) => {
      const s = d.toString()
      output += s
      // Emit lightweight progress lines
      const last = s.trim().split('\n').slice(-1)[0]
      if (last) emit('progress', { line: last.slice(0, 200) })
    })
    proc.stderr.on('data', (d) => { output += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve(output)
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

async function revealInFolder() {
  if (lastBuild && lastBuild.path) {
    shell.showItemInFolder(lastBuild.path)
    return { ok: true }
  }
  return { ok: false, error: 'No build output yet' }
}

module.exports = { setWindow, buildInstaller, getStatus, revealInFolder }
