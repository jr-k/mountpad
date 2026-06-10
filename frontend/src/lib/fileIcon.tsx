import React from 'react'
import { Icon, addIcon } from '@iconify/react'
import type { FileEntry } from '@/types/files'

// Per-icon ES-module imports: each is ~150 bytes raw and the bundler
// tree-shakes anything we don't reference, so the whole file-icon
// system lands in <10 KiB minified. CRUCIALLY, this also means we
// NEVER round-trip through api.iconify.design - the icons are
// registered into the iconify runtime at app boot below and render
// from local memory, even in air-gapped deployments.
import defaultFile          from '@iconify-icons/vscode-icons/default-file'
import defaultFolder        from '@iconify-icons/vscode-icons/default-folder'
import defaultFolderOpened  from '@iconify-icons/vscode-icons/default-folder-opened'

import fileTypeMarkdown     from '@iconify-icons/vscode-icons/file-type-markdown'
import fileTypeText         from '@iconify-icons/vscode-icons/file-type-text'
import fileTypeLog          from '@iconify-icons/vscode-icons/file-type-log'
import fileTypeExcel        from '@iconify-icons/vscode-icons/file-type-excel'

import fileTypeImage        from '@iconify-icons/vscode-icons/file-type-image'
import fileTypeSvg          from '@iconify-icons/vscode-icons/file-type-svg'
import fileTypeFavicon      from '@iconify-icons/vscode-icons/file-type-favicon'

import fileTypeAudio        from '@iconify-icons/vscode-icons/file-type-audio'
import fileTypeVideo        from '@iconify-icons/vscode-icons/file-type-video'
import fileTypePdf          from '@iconify-icons/vscode-icons/file-type-pdf2'

import fileTypeZip          from '@iconify-icons/vscode-icons/file-type-zip'

import fileTypeJson         from '@iconify-icons/vscode-icons/file-type-json'
import fileTypeYaml         from '@iconify-icons/vscode-icons/file-type-yaml'
import fileTypeToml         from '@iconify-icons/vscode-icons/file-type-toml'
import fileTypeDotenv       from '@iconify-icons/vscode-icons/file-type-dotenv'
import fileTypeConfig       from '@iconify-icons/vscode-icons/file-type-config'
import fileTypeXml          from '@iconify-icons/vscode-icons/file-type-xml'

import fileTypeJs           from '@iconify-icons/vscode-icons/file-type-js-official'
import fileTypeTs           from '@iconify-icons/vscode-icons/file-type-typescript-official'
import fileTypeReactJs      from '@iconify-icons/vscode-icons/file-type-reactjs'
import fileTypeReactTs      from '@iconify-icons/vscode-icons/file-type-reactts'
import fileTypePython       from '@iconify-icons/vscode-icons/file-type-python'
import fileTypeGo           from '@iconify-icons/vscode-icons/file-type-go-gopher'
import fileTypeRust         from '@iconify-icons/vscode-icons/file-type-rust'
import fileTypeRuby         from '@iconify-icons/vscode-icons/file-type-ruby'
import fileTypeJava         from '@iconify-icons/vscode-icons/file-type-java'
import fileTypeKotlin       from '@iconify-icons/vscode-icons/file-type-kotlin'
import fileTypeC            from '@iconify-icons/vscode-icons/file-type-c3'
import fileTypeCpp          from '@iconify-icons/vscode-icons/file-type-cpp3'
import fileTypeCppHeader    from '@iconify-icons/vscode-icons/file-type-cppheader'
import fileTypeCsharp       from '@iconify-icons/vscode-icons/file-type-csharp'
import fileTypePhp          from '@iconify-icons/vscode-icons/file-type-php'
import fileTypeSwift        from '@iconify-icons/vscode-icons/file-type-swift'
import fileTypeDart         from '@iconify-icons/vscode-icons/file-type-dartlang'
import fileTypeLua          from '@iconify-icons/vscode-icons/file-type-lua'
import fileTypeVue          from '@iconify-icons/vscode-icons/file-type-vue'
import fileTypeSvelte       from '@iconify-icons/vscode-icons/file-type-svelte'

import fileTypeShell        from '@iconify-icons/vscode-icons/file-type-shell'
import fileTypePowerShell   from '@iconify-icons/vscode-icons/file-type-powershell'

import fileTypeHtml         from '@iconify-icons/vscode-icons/file-type-html'
import fileTypeCss          from '@iconify-icons/vscode-icons/file-type-css'
import fileTypeScss         from '@iconify-icons/vscode-icons/file-type-scss'
import fileTypeSass         from '@iconify-icons/vscode-icons/file-type-sass'
import fileTypeLess         from '@iconify-icons/vscode-icons/file-type-less'

import fileTypeSql          from '@iconify-icons/vscode-icons/file-type-sql'
import fileTypeGraphql      from '@iconify-icons/vscode-icons/file-type-graphql'
import fileTypeProtobuf     from '@iconify-icons/vscode-icons/file-type-protobuf'

import fileTypeDocker       from '@iconify-icons/vscode-icons/file-type-docker2'
import fileTypeMakefile     from '@iconify-icons/vscode-icons/file-type-makefile'
import fileTypeCmake        from '@iconify-icons/vscode-icons/file-type-cmake'
import fileTypeGit          from '@iconify-icons/vscode-icons/file-type-git'
import fileTypeEditorconfig from '@iconify-icons/vscode-icons/file-type-editorconfig'
import fileTypeEslint       from '@iconify-icons/vscode-icons/file-type-eslint'
import fileTypePrettier     from '@iconify-icons/vscode-icons/file-type-light-prettier'
import fileTypeNode         from '@iconify-icons/vscode-icons/file-type-node'
import fileTypeTsconfig     from '@iconify-icons/vscode-icons/file-type-tsconfig'
import fileTypeYarn         from '@iconify-icons/vscode-icons/file-type-yarn'
import fileTypePnpm         from '@iconify-icons/vscode-icons/file-type-pnpm'
import fileTypeLicense      from '@iconify-icons/vscode-icons/file-type-license'
import fileTypeCargo        from '@iconify-icons/vscode-icons/file-type-cargo'

// Iconify namespace for every icon we register. Names returned by
// iconNameFor are prefixed with this so the <Icon> component (and
// the rest of iconify's tooling) can route through the same
// resolution path it uses for online icon sets.
const NS = 'vscode-icons'

// One-shot registration into the iconify runtime registry. Idempotent
// thanks to the module being imported exactly once at app start.
// Using a record keeps the names DRY: same string we register here
// is what iconNameFor emits, and what <Icon icon=...> looks up.
const REGISTRY = {
  'default-file':                defaultFile,
  'default-folder':              defaultFolder,
  'default-folder-opened':       defaultFolderOpened,
  'file-type-markdown':          fileTypeMarkdown,
  'file-type-text':              fileTypeText,
  'file-type-log':               fileTypeLog,
  'file-type-excel':             fileTypeExcel,
  'file-type-image':             fileTypeImage,
  'file-type-svg':               fileTypeSvg,
  'file-type-favicon':           fileTypeFavicon,
  'file-type-audio':             fileTypeAudio,
  'file-type-video':             fileTypeVideo,
  'file-type-pdf2':              fileTypePdf,
  'file-type-zip':               fileTypeZip,
  'file-type-json':              fileTypeJson,
  'file-type-yaml':              fileTypeYaml,
  'file-type-toml':              fileTypeToml,
  'file-type-dotenv':            fileTypeDotenv,
  'file-type-config':            fileTypeConfig,
  'file-type-xml':               fileTypeXml,
  'file-type-js-official':       fileTypeJs,
  'file-type-typescript-official': fileTypeTs,
  'file-type-reactjs':           fileTypeReactJs,
  'file-type-reactts':           fileTypeReactTs,
  'file-type-python':            fileTypePython,
  'file-type-go-gopher':         fileTypeGo,
  'file-type-rust':              fileTypeRust,
  'file-type-ruby':              fileTypeRuby,
  'file-type-java':              fileTypeJava,
  'file-type-kotlin':            fileTypeKotlin,
  'file-type-c3':                fileTypeC,
  'file-type-cpp3':              fileTypeCpp,
  'file-type-cppheader':         fileTypeCppHeader,
  'file-type-csharp':            fileTypeCsharp,
  'file-type-php':               fileTypePhp,
  'file-type-swift':             fileTypeSwift,
  'file-type-dartlang':          fileTypeDart,
  'file-type-lua':               fileTypeLua,
  'file-type-vue':               fileTypeVue,
  'file-type-svelte':            fileTypeSvelte,
  'file-type-shell':             fileTypeShell,
  'file-type-powershell':        fileTypePowerShell,
  'file-type-html':              fileTypeHtml,
  'file-type-css':               fileTypeCss,
  'file-type-scss':              fileTypeScss,
  'file-type-sass':              fileTypeSass,
  'file-type-less':              fileTypeLess,
  'file-type-sql':               fileTypeSql,
  'file-type-graphql':           fileTypeGraphql,
  'file-type-protobuf':          fileTypeProtobuf,
  'file-type-docker2':           fileTypeDocker,
  'file-type-makefile':          fileTypeMakefile,
  'file-type-cmake':             fileTypeCmake,
  'file-type-git':               fileTypeGit,
  'file-type-editorconfig':      fileTypeEditorconfig,
  'file-type-eslint':            fileTypeEslint,
  'file-type-light-prettier':    fileTypePrettier,
  'file-type-node':              fileTypeNode,
  'file-type-tsconfig':          fileTypeTsconfig,
  'file-type-yarn':              fileTypeYarn,
  'file-type-pnpm':              fileTypePnpm,
  'file-type-license':           fileTypeLicense,
  'file-type-cargo':             fileTypeCargo,
} as const

for (const [name, data] of Object.entries(REGISTRY)) {
  addIcon(`${NS}:${name}`, data)
}

const FOLDER_CLOSED = `${NS}:default-folder`
const FOLDER_OPEN   = `${NS}:default-folder-opened`
const FILE_DEFAULT  = `${NS}:default-file`

// Extension → registered icon name. Grouped by category so adding
// a new format is a one-line change here. Keys are lowercase,
// dot-free; callers strip the dot themselves. Names MUST be keys
// of REGISTRY above - mis-spellings would silently fall back to
// the default file icon.
const EXT_TO_ICON: Record<string, string> = {
  md:        'file-type-markdown',
  markdown:  'file-type-markdown',
  txt:       'file-type-text',
  rst:       'file-type-text',
  log:       'file-type-log',
  csv:       'file-type-excel',
  tsv:       'file-type-excel',

  // Image extensions: in DirectoryView these usually render as
  // real thumbnails. The icon here is the fallback for when the
  // thumbnailer 415s (oversized source) or errors out - we want
  // SOMETHING visible that says "image" rather than a broken
  // image placeholder.
  png:       'file-type-image',
  jpg:       'file-type-image',
  jpeg:      'file-type-image',
  gif:       'file-type-image',
  webp:      'file-type-image',
  svg:       'file-type-svg',
  bmp:       'file-type-image',
  ico:       'file-type-favicon',
  avif:      'file-type-image',

  mp3:       'file-type-audio',
  wav:       'file-type-audio',
  ogg:       'file-type-audio',
  oga:       'file-type-audio',
  flac:      'file-type-audio',
  m4a:       'file-type-audio',
  m4b:       'file-type-audio',
  aac:       'file-type-audio',
  opus:      'file-type-audio',
  mp4:       'file-type-video',
  mov:       'file-type-video',
  mkv:       'file-type-video',
  webm:      'file-type-video',
  avi:       'file-type-video',
  m4v:       'file-type-video',
  pdf:       'file-type-pdf2',

  zip:       'file-type-zip',
  tar:       'file-type-zip',
  gz:        'file-type-zip',
  tgz:       'file-type-zip',
  bz2:       'file-type-zip',
  tbz:       'file-type-zip',
  tbz2:      'file-type-zip',
  '7z':      'file-type-zip',
  rar:       'file-type-zip',

  json:      'file-type-json',
  yaml:      'file-type-yaml',
  yml:       'file-type-yaml',
  toml:      'file-type-toml',
  env:       'file-type-dotenv',
  ini:       'file-type-config',
  conf:      'file-type-config',
  xml:       'file-type-xml',
  plist:     'file-type-xml',

  js:        'file-type-js-official',
  mjs:       'file-type-js-official',
  cjs:       'file-type-js-official',
  jsx:       'file-type-reactjs',
  ts:        'file-type-typescript-official',
  tsx:       'file-type-reactts',
  py:        'file-type-python',
  pyc:       'file-type-python',
  go:        'file-type-go-gopher',
  rs:        'file-type-rust',
  rb:        'file-type-ruby',
  java:      'file-type-java',
  kt:        'file-type-kotlin',
  c:         'file-type-c3',
  h:         'file-type-c3',
  cpp:       'file-type-cpp3',
  cc:        'file-type-cpp3',
  cxx:       'file-type-cpp3',
  hpp:       'file-type-cppheader',
  cs:        'file-type-csharp',
  php:       'file-type-php',
  swift:     'file-type-swift',
  dart:      'file-type-dartlang',
  lua:       'file-type-lua',
  vue:       'file-type-vue',
  svelte:    'file-type-svelte',

  sh:        'file-type-shell',
  bash:      'file-type-shell',
  zsh:       'file-type-shell',
  fish:      'file-type-shell',
  ps1:       'file-type-powershell',

  html:      'file-type-html',
  htm:       'file-type-html',
  css:       'file-type-css',
  scss:      'file-type-scss',
  sass:      'file-type-sass',
  less:      'file-type-less',

  sql:       'file-type-sql',
  graphql:   'file-type-graphql',
  gql:       'file-type-graphql',
  proto:     'file-type-protobuf',
}

// Filename → icon. Tried BEFORE extension matching so well-known
// dotted filenames (.gitignore, .eslintrc, ...) and extensionless
// files (Dockerfile, Makefile, LICENSE) get their dedicated icon
// instead of falling through to the generic default.
const NAME_TO_ICON: Record<string, string> = {
  'dockerfile':         'file-type-docker2',
  'makefile':           'file-type-makefile',
  'cmakelists.txt':     'file-type-cmake',
  '.gitignore':         'file-type-git',
  '.gitattributes':     'file-type-git',
  '.gitkeep':           'file-type-git',
  '.gitmodules':        'file-type-git',
  '.editorconfig':      'file-type-editorconfig',
  '.prettierrc':        'file-type-light-prettier',
  '.eslintrc':          'file-type-eslint',
  '.eslintrc.json':     'file-type-eslint',
  '.eslintrc.js':       'file-type-eslint',
  'package.json':       'file-type-node',
  'package-lock.json':  'file-type-node',
  'tsconfig.json':      'file-type-tsconfig',
  'yarn.lock':          'file-type-yarn',
  'pnpm-lock.yaml':     'file-type-pnpm',
  'license':            'file-type-license',
  'license.md':         'file-type-license',
  'license.txt':        'file-type-license',
  'readme.md':          'file-type-markdown',
  'go.mod':             'file-type-go-gopher',
  'go.sum':             'file-type-go-gopher',
  'cargo.toml':         'file-type-cargo',
  'cargo.lock':         'file-type-cargo',
  '.env':               'file-type-dotenv',
}

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * iconNameFor maps a file entry to its registered iconify icon
 * identifier. Folders use the appropriate open / closed glyph;
 * files go through filename → extension tables and fall back to
 * a generic default-file when nothing matches.
 */
export const iconNameFor = (entry: FileEntry, open: boolean): string => {
  if (entry.is_dir) return open ? FOLDER_OPEN : FOLDER_CLOSED
  const lower = entry.name.toLowerCase()
  if (NAME_TO_ICON[lower]) return `${NS}:${NAME_TO_ICON[lower]}`
  const ext = extOf(lower)
  if (ext && EXT_TO_ICON[ext]) return `${NS}:${EXT_TO_ICON[ext]}`
  return FILE_DEFAULT
}

interface FileIconProps {
  entry: FileEntry
  /** Folders only - flips between open / closed glyphs. */
  open?: boolean
  /** Rendered width / height in CSS px. Square by convention. */
  size?: number
  className?: string
}

/**
 * FileIcon renders the iconify glyph for a file entry. Renders
 * entirely from the in-memory registry populated at module import
 * time, so no network round-trip is ever made - the explorer
 * shows real icons immediately, even in offline environments.
 */
export const FileIcon: React.FC<FileIconProps> = ({ entry, open, size = 16, className }) => (
  <Icon
    icon={iconNameFor(entry, !!open)}
    width={size}
    height={size}
    className={className}
    aria-hidden
  />
)
