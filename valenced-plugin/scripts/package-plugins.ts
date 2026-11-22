import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { deflateRawSync } from 'node:zlib'

interface PluginManifest {
  format: number
  id: string
  name: string
  version: string
  dist?: {
    script?: string
    jar?: string
  }
}

interface ZipEntry {
  name: string
  data: Buffer
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const raw = entry.data
    const compressed = deflateRawSync(raw)
    const useDeflate = compressed.length < raw.length
    const payload = useDeflate ? compressed : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6) // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0x5421, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(payload.length, 18)
    localHeader.writeUInt32LE(raw.length, 22)
    localHeader.writeUInt16LE(nameBytes.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localParts.push(localHeader, nameBytes, payload)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0x5421, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(payload.length, 20)
    centralHeader.writeUInt32LE(raw.length, 24)
    centralHeader.writeUInt16LE(nameBytes.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralParts.push(centralHeader, nameBytes)
    offset += localHeader.length + nameBytes.length + payload.length
  }

  const centralDir = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDir, eocd])
}

function collectFilesRecursively(dir: string, baseDir: string, prefix: string): ZipEntry[] {
  const results: ZipEntry[] = []
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...collectFilesRecursively(fullPath, baseDir, prefix))
    } else if (stat.isFile()) {
      const rel = relative(baseDir, fullPath).replace(/\\/g, '/')
      results.push({
        name: `${prefix}/${rel}`,
        data: readFileSync(fullPath),
      })
    }
  }
  return results
}

const rootDir = process.cwd()
const pluginsDir = join(rootDir, 'plugins')
const distDir = join(rootDir, 'build', 'dist')

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

if (!existsSync(pluginsDir)) {
  throw new Error(`No plugins directory found at ${pluginsDir}`)
}

const pluginFolders = readdirSync(pluginsDir).sort((a, b) => a.localeCompare(b))
let packagedCount = 0

for (const folder of pluginFolders) {
  const pluginDir = join(pluginsDir, folder)
  const manifestPath = join(pluginDir, 'manifest.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
  if (!manifest.id || !manifest.version) {
    throw new Error(`${folder}: manifest.json must define 'id' and 'version'`)
  }

  const entries: ZipEntry[] = [
    {
      name: 'manifest.json',
      data: readFileSync(manifestPath),
    },
  ]

  const scriptName = manifest.dist?.script
  if (scriptName) {
    const builtScriptPath = join(pluginDir, 'build', 'js', 'index.js')
    if (!existsSync(builtScriptPath)) {
      throw new Error(
        `${folder}: missing built JS bundle at ${builtScriptPath}. Run 'bun run --bun build' first.`,
      )
    }
    entries.push({
      name: scriptName,
      data: readFileSync(builtScriptPath),
    })
  }

  const assetsDir = join(pluginDir, 'assets')
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
    entries.push(...collectFilesRecursively(assetsDir, assetsDir, 'assets'))
  }

  const archiveName = `${manifest.id}@${manifest.version}.zip`
  const archivePath = join(distDir, archiveName)
  writeFileSync(archivePath, createZipBuffer(entries))

  // Also ensure no stale staging artifacts remain
  if (existsSync(join(distDir, folder))) {
    cpSync(archivePath, archivePath)
  }

  packagedCount += 1
  console.log(`✓ Packaged ${manifest.id} -> build/dist/${archiveName}`)
}

if (packagedCount === 0) {
  throw new Error('No plugins were found to package.')
}
