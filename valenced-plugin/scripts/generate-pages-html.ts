import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

interface IndexJson {
  name?: string
  description?: string
  plugins?: Record<
    string,
    {
      name?: string
      channels?: Record<string, string>
      versions?: Record<string, { url?: string }>
    }
  >
}

const DEFAULT_BASE_URL = 'https://horndogcop.github.io'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(
  text: string,
  copySvg: string,
  baseUrl: string,
  indexData: IndexJson | null,
): string {
  // Replace placeholder base URL anywhere in inline text
  let processed = text.replaceAll(DEFAULT_BASE_URL, baseUrl)

  // Replace [Title](url) markdown links, attaching a copy icon button for .zip or index.json links
  const placeholders: string[] = []
  const stash = (html: string): string => {
    const token = `\u0000LINK${placeholders.length}\u0000`
    placeholders.push(html)
    return token
  }

  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, rawLabel: string, rawHref: string) => {
    let label = rawLabel
    let href = rawHref.replaceAll(DEFAULT_BASE_URL, baseUrl)

    // If this link targets a plugin archive in pool/, sync version & URL from index.json if present
    const poolMatch = href.match(/\/pool\/([a-zA-Z0-9.-]+)@([^/]+)\.zip$/)
    if (poolMatch && indexData?.plugins) {
      const pluginId = poolMatch[1]!
      const pluginEntry = indexData.plugins[pluginId]
      const latestVer =
        pluginEntry?.channels?.latest ??
        Object.keys(pluginEntry?.versions ?? {}).pop()
      if (latestVer && pluginEntry?.versions?.[latestVer]?.url) {
        href = pluginEntry.versions[latestVer]!.url!
        label = label.replace(/v\d+(?:\.\d+)*(?:-[a-z0-9]+)?/i, `v${latestVer}`)
      }
    }

    const isCopyableResource =
      href.endsWith('.zip') || href.endsWith('/index.json')

    if (isCopyableResource) {
      return stash(
        `<span class="link-row">` +
          `<a class="titled-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>` +
          `<button type="button" class="copy-btn" data-copy-url="${escapeHtml(href)}" title="Copy link to clipboard" aria-label="Copy ${escapeHtml(label)} link to clipboard">${copySvg}</button>` +
          `</span>`,
      )
    }

    const formattedLabel = escapeHtml(label).replace(
      /`([^`]+)`/g,
      '<code>$1</code>',
    )

    return stash(
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${formattedLabel}</a>`,
    )
  })

  // Escape remaining text, then restore inline code & emphasis
  let html = escapeHtml(processed)
  html = html.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  for (let i = 0; i < placeholders.length; i++) {
    html = html.replace(`\u0000LINK${i}\u0000`, placeholders[i]!)
  }
  return html
}

function renderRepoUrlRow(repoIndexUrl: string, copySvg: string): string {
  return (
    `<div class="link-card">` +
    `<span class="link-row">` +
    `<a class="titled-link" href="${escapeHtml(repoIndexUrl)}">Valenced Repository Index (index.json)</a>` +
    `<button type="button" class="copy-btn" data-copy-url="${escapeHtml(repoIndexUrl)}" title="Copy repository URL to clipboard" aria-label="Copy repository URL to clipboard">${copySvg}</button>` +
    `</span>` +
    `</div>`
  )
}

function markdownToHtml(
  markdown: string,
  baseUrl: string,
  indexData: IndexJson | null,
  copySvg: string,
): { title: string; bodyHtml: string } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let title = indexData?.name ?? 'Valenced Plugins'
  let inList = false
  let inOrderedList = false
  let inCodeBlock = false
  let codeLines: string[] = []

  const closeLists = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
    if (inOrderedList) {
      out.push('</ol>')
      inOrderedList = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!

    if (line.trim().startsWith('```')) {
      closeLists()
      if (!inCodeBlock) {
        inCodeBlock = true
        codeLines = []
      } else {
        inCodeBlock = false
        const rawBlock = codeLines.join('\n').trim().replaceAll(DEFAULT_BASE_URL, baseUrl)
        // If this code block in README holds the repo URL, render a titled text link + copy icon instead of a code block
        if (/^https?:\/\/\S+\/index\.json$/i.test(rawBlock)) {
          out.push(renderRepoUrlRow(rawBlock, copySvg))
        } else {
          out.push(`<pre><code>${escapeHtml(rawBlock)}</code></pre>`)
        }
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) {
      closeLists()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      closeLists()
      const level = headingMatch[1]!.length
      const content = headingMatch[2]!
      if (level === 1) {
        title = content
      }
      out.push(
        `<h${level}>${renderInlineMarkdown(content, copySvg, baseUrl, indexData)}</h${level}>`,
      )
      continue
    }

    if (trimmed.startsWith('> ')) {
      closeLists()
      const quoteText = trimmed.slice(2)
      out.push(
        `<blockquote><p>${renderInlineMarkdown(quoteText, copySvg, baseUrl, indexData)}</p></blockquote>`,
      )
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (inOrderedList) {
        out.push('</ol>')
        inOrderedList = false
      }
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      const itemText = trimmed.replace(/^[-*]\s+/, '')
      out.push(
        `<li>${renderInlineMarkdown(itemText, copySvg, baseUrl, indexData)}</li>`,
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      if (!inOrderedList) {
        out.push('<ol>')
        inOrderedList = true
      }
      const itemText = trimmed.replace(/^\d+\.\s+/, '')
      out.push(
        `<li>${renderInlineMarkdown(itemText, copySvg, baseUrl, indexData)}</li>`,
      )
      continue
    }

    closeLists()
    out.push(
      `<p>${renderInlineMarkdown(trimmed, copySvg, baseUrl, indexData)}</p>`,
    )
  }

  closeLists()
  return { title, bodyHtml: out.join('\n') }
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    readme: { type: 'string' },
    index: { type: 'string' },
    'base-url': { type: 'string', default: DEFAULT_BASE_URL },
    out: { type: 'string', default: 'build/pages/index.html' },
  },
})

const scriptDir = import.meta.dir
const defaultReadmeCandidates = [
  values.readme,
  resolve(process.cwd(), '../README.md'),
  resolve(process.cwd(), 'README.md'),
].filter((p): p is string => Boolean(p))

const readmePath = defaultReadmeCandidates.find(p => existsSync(p))
if (!readmePath) {
  throw new Error(
    `Could not locate README.md. Checked: ${defaultReadmeCandidates.join(', ')}`,
  )
}

const copySvgPath = join(scriptDir, 'icons', 'copy.svg')
const checkSvgPath = join(scriptDir, 'icons', 'check.svg')
const copySvg = readFileSync(copySvgPath, 'utf8').trim()
const checkSvg = readFileSync(checkSvgPath, 'utf8').trim()

const indexData: IndexJson | null =
  values.index && existsSync(values.index)
    ? (JSON.parse(readFileSync(values.index, 'utf8')) as IndexJson)
    : null

const baseUrl = values['base-url'].replace(/\/+$/, '')
const readmeText = readFileSync(readmePath, 'utf8')
const { title, bodyHtml } = markdownToHtml(readmeText, baseUrl, indexData, copySvg)

const htmlDocument = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --surface: #171a23;
      --surface-hover: #1e2330;
      --border: #2a3040;
      --text: #e6e8ef;
      --muted: #9aa3b5;
      --accent: #5865f2;
      --accent-hover: #6c77f7;
      --ok: #23a55a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2.5rem 1.25rem 4rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.65;
    }
    main {
      max-width: 780px;
      margin: 0 auto;
    }
    h1, h2, h3 {
      line-height: 1.3;
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
    }
    h1 { font-size: 1.85rem; margin-top: 0; }
    h2 { font-size: 1.35rem; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
    h3 { font-size: 1.1rem; }
    p { margin: 0.65rem 0; color: var(--text); }
    a { color: #8ea1ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote {
      margin: 1rem 0;
      padding: 0.65rem 1rem;
      border-left: 3px solid var(--accent);
      background: var(--surface);
      border-radius: 0 8px 8px 0;
    }
    blockquote p { margin: 0; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88em;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 0.12rem 0.38rem;
    }
    pre {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.9rem 1rem;
      overflow-x: auto;
    }
    pre code {
      background: none;
      border: none;
      padding: 0;
    }
    ul, ol {
      padding-left: 1.35rem;
      margin: 0.65rem 0;
    }
    li { margin: 0.4rem 0; }
    .link-card {
      margin: 0.85rem 0;
      padding: 0.75rem 0.95rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      display: inline-flex;
      max-width: 100%;
    }
    .link-row {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      flex-wrap: wrap;
    }
    .titled-link {
      font-weight: 600;
      color: #a3b3ff;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: var(--surface-hover);
      color: var(--muted);
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .copy-btn:hover {
      background: var(--accent);
      border-color: var(--accent-hover);
      color: #ffffff;
    }
    .copy-btn.copied {
      background: var(--ok);
      border-color: var(--ok);
      color: #ffffff;
    }
    .copy-btn svg {
      width: 15px;
      height: 15px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <main>
${bodyHtml}
  </main>
  <script>
    const COPY_ICON = ${JSON.stringify(copySvg)};
    const CHECK_ICON = ${JSON.stringify(checkSvg)};
    async function copyText(value) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    document.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const value = btn.getAttribute('data-copy-url');
        if (!value) return;
        try {
          await copyText(value);
          btn.classList.add('copied');
          btn.innerHTML = CHECK_ICON;
          window.setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = COPY_ICON;
          }, 1500);
        } catch (err) {
          console.error('Clipboard copy failed:', err);
        }
      });
    });
  </script>
</body>
</html>
`

mkdirSync(dirname(values.out), { recursive: true })
writeFileSync(values.out, htmlDocument, 'utf8')
console.log(`✓ Generated ${values.out}`)
