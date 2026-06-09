import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { go } from '@codemirror/lang-go'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { php } from '@codemirror/lang-php'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'

/**
 * Map a file name (or path) to a CodeMirror language extension based on its
 * extension and, for a small set of well-known names, the full basename
 * (e.g. "Dockerfile", "Makefile").
 *
 * Returns `null` when no language can be detected; the editor then falls
 * back to plain text with line numbers but no highlighting.
 */
export function detectLanguage(fileName: string): Extension | null {
  if (!fileName) return null
  const lower = fileName.toLowerCase()
  const base = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower

  // Filenames without a meaningful extension, matched by basename.
  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return StreamLanguage.define(dockerFile)
  if (base === 'makefile' || base === 'gnumakefile') return StreamLanguage.define(properties)
  if (base.startsWith('nginx') && base.endsWith('.conf')) return StreamLanguage.define(nginx)

  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''

  switch (ext) {
    case 'js': case 'jsx': case 'mjs': case 'cjs':
      return javascript({ jsx: true })
    case 'ts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ jsx: true, typescript: true })
    case 'json': case 'jsonc':
      return json()
    case 'md': case 'markdown': case 'mdx':
      return markdown()
    case 'html': case 'htm':
      return html()
    case 'css': case 'scss': case 'sass': case 'less':
      return css()
    case 'py': case 'pyi':
      return python()
    case 'go':
      return go()
    case 'rs':
      return rust()
    case 'sql':
      return sql()
    case 'yml': case 'yaml':
      return yaml()
    case 'xml': case 'svg': case 'xhtml':
      return xml()
    case 'c': case 'h': case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hh':
      return cpp()
    case 'java':
      return java()
    case 'php':
      return php()
    case 'rb': case 'rake':
      return StreamLanguage.define(ruby)
    case 'lua':
      return StreamLanguage.define(lua)
    case 'sh': case 'bash': case 'zsh': case 'ksh': case 'fish':
      return StreamLanguage.define(shell)
    case 'toml':
      return StreamLanguage.define(toml)
    case 'ini': case 'conf': case 'cfg': case 'properties': case 'env':
      return StreamLanguage.define(properties)
    case 'patch': case 'diff':
      return StreamLanguage.define(diff)
    default:
      return null
  }
}

/** Human label for the bottom-right "language indicator", e.g. "TypeScript". */
export function languageLabel(fileName: string): string {
  if (!fileName) return 'Plain'
  const lower = fileName.toLowerCase()
  const base = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower
  if (base === 'dockerfile' || base.endsWith('.dockerfile')) return 'Dockerfile'
  if (base === 'makefile' || base === 'gnumakefile') return 'Makefile'

  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  const map: Record<string, string> = {
    js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
    ts: 'TypeScript', tsx: 'TypeScript',
    json: 'JSON', jsonc: 'JSON',
    md: 'Markdown', markdown: 'Markdown', mdx: 'MDX',
    html: 'HTML', htm: 'HTML',
    css: 'CSS', scss: 'SCSS', sass: 'Sass', less: 'Less',
    py: 'Python', pyi: 'Python',
    go: 'Go', rs: 'Rust', sql: 'SQL',
    yml: 'YAML', yaml: 'YAML',
    xml: 'XML', svg: 'SVG', xhtml: 'XHTML',
    c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++', hh: 'C++',
    java: 'Java', php: 'PHP',
    rb: 'Ruby', rake: 'Ruby', lua: 'Lua',
    sh: 'Shell', bash: 'Bash', zsh: 'Zsh', ksh: 'Shell', fish: 'Fish',
    toml: 'TOML', ini: 'INI', conf: 'Config', cfg: 'Config', properties: 'Properties', env: 'Env',
    patch: 'Diff', diff: 'Diff',
  }
  return map[ext] ?? (ext ? ext.toUpperCase() : 'Plain')
}
