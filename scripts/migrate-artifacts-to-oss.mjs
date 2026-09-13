/**
 * 存量图片产物迁移到阿里云 OSS。
 *
 * 用法（在项目根目录）：
 *   $env:OSS_BUCKET="nexora-studio"
 *   $env:OSS_ENDPOINT="oss-cn-beijing.aliyuncs.com"
 *   $env:OSS_ACCESS_KEY_ID="LTAI..."
 *   $env:OSS_ACCESS_KEY_SECRET="..."
 *   & "D:\work space\NodeJS\node.exe" scripts/migrate-artifacts-to-oss.mjs
 *
 * 行为：
 *  - 遍历 artifacts 表中 type='image' 且 url 不是 OSS 链接的记录；
 *  - 本地文件（/api/artifact-images/...）直接读盘上传；远程 URL 先下载再上传；
 *  - 上传成功 → 更新 DB content.url 为 OSS 链接；本地来源同时删除本地副本；
 *  - 上传失败 → 保留原 URL，打印错误，不删本地。
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const Database = require('better-sqlite3')
const OSS = require('ali-oss')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = process.cwd()
const DB_PATH = path.join(ROOT, '.agenthub-data', 'agenthub.db')
const IMG_DIR = path.join(ROOT, '.agenthub-data', 'artifact-images')

const bucket = process.env.OSS_BUCKET
const endpoint = process.env.OSS_ENDPOINT
const accessKeyId = process.env.OSS_ACCESS_KEY_ID
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET

if (!bucket || !endpoint || !accessKeyId || !accessKeySecret) {
  console.error('Missing OSS config. Set OSS_BUCKET / OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET env vars first.')
  process.exit(1)
}

const db = new Database(DB_PATH)

function sniffExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (buf.toString('latin1', 0, 6) === 'GIF87a' || buf.toString('latin1', 0, 6) === 'GIF89a') return 'gif'
  return 'bin'
}

async function resolveBuffer(url) {
  if (url.startsWith('/api/artifact-images/')) {
    const name = url.slice('/api/artifact-images/'.length)
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null
    try { return fs.readFileSync(path.join(IMG_DIR, name)) } catch { return null }
  }
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',')
    if (comma < 0) return null
    const meta = url.slice(5, comma)
    const payload = url.slice(comma + 1)
    try {
      if (/;base64(?:;|$)/i.test(meta)) return Buffer.from(payload.replace(/[\s\r\n]/g, ''), 'base64')
      return Buffer.from(decodeURIComponent(payload), 'utf8')
    } catch { return null }
  }
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > 25 * 1024 * 1024) return null
    return buf
  } catch { return null }
}

async function main() {
  const client = new OSS({ bucket, endpoint, accessKeyId, accessKeySecret, secure: true })
  const rows = db
    .prepare("SELECT id, title, content FROM artifacts WHERE type = 'image'")
    .all()
    .filter((r) => {
      try { return !JSON.parse(r.content).url.includes('.oss-') } catch { return false }
    })

  console.log(`Found ${rows.length} image artifact(s) to migrate.`)
  const update = db.prepare('UPDATE artifacts SET content = ? WHERE id = ?')
  let ok = 0
  let failed = 0

  for (const row of rows) {
    const c = JSON.parse(row.content)
    const oldUrl = c.url
    const buf = await resolveBuffer(oldUrl)
    if (!buf) {
      console.error(`  [FAIL] ${row.id} ${row.title}: unreachable (${oldUrl.slice(0, 80)})`)
      failed++
      continue
    }
    const key = `artifacts/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${sniffExt(buf)}`
    try {
      await client.put(key, buf, { headers: { 'x-oss-object-acl': 'public-read' } })
      c.url = `https://${bucket}.${endpoint}/${key}`
      update.run(JSON.stringify(c), row.id)
      // 本地来源 → 删除本地副本（仅上传成功后）
      if (oldUrl.startsWith('/api/artifact-images/')) {
        const name = oldUrl.slice('/api/artifact-images/'.length)
        fs.rmSync(path.join(IMG_DIR, name), { force: true })
        console.log(`  [OK] ${row.id} ${row.title}: local ${name} -> oss (local removed)`)
      } else {
        console.log(`  [OK] ${row.id} ${row.title}: ${oldUrl.slice(0, 60)}... -> oss`)
      }
      ok++
    } catch (e) {
      console.error(`  [FAIL] ${row.id} ${row.title}: ${e.message}`)
      failed++
    }
  }

  console.log(`Done. migrated=${ok} failed=${failed}`)
  db.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
