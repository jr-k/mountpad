import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
// The installed package is `@uiw/codemirror-theme-tokyo-night`, which only
// ships the base `tokyoNight` palette. The "storm" variant lives in a
// separate sibling package; we don't pull that one in to keep the dep
// footprint small; the base theme is already a great fit for our palette.
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night'
import { useTheme } from 'styled-components'
import type { Theme } from '@/styles/theme'
import { detectLanguage, languageLabel } from './languages'

import * as S from './styled'

interface TextEditorProps {
  value: string
  onChange: (value: string) => void
  status?: string
  readOnly?: boolean
  /**
   * The file's path or name; used to detect the language for highlighting
   * (e.g. `src/main.tsx` → TypeScript JSX). When omitted, the editor falls
   * back to plain text with line numbers but no token coloring.
   */
  fileName?: string
}

// buildEditorTheme produces the CodeMirror wrapper styles for the current
// MountPad palette. We rebuild it whenever the app theme flips (light <-> dark)
// so the editor blends with the surrounding chrome instead of fighting it.
// The `{ dark }` flag is what CodeMirror uses internally to pick sensible
// defaults for any style we don't explicitly override.
const buildEditorTheme = (palette: Theme) => {
  const isDark = palette.appearance === 'dark'
  // Translucent accent overlays: derived from the accent so light/dark both
  // get a tinted highlight that reads correctly against the local bg.
  const overlayActive   = isDark ? 'rgba(106,160,255,0.06)' : 'rgba(9,105,218,0.08)'
  const overlayGutter   = isDark ? 'rgba(106,160,255,0.10)' : 'rgba(9,105,218,0.14)'
  const overlaySelection = isDark ? 'rgba(106,160,255,0.25)' : 'rgba(9,105,218,0.20)'
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: palette.color.bg,
        color: palette.color.text,
        fontSize: palette.font.size.md,
      },
      '.cm-scroller': {
        fontFamily: palette.font.mono,
        lineHeight: '1.55',
      },
      '.cm-content': {
        caretColor: palette.color.accent,
        padding: '8px 0',
      },
      '.cm-gutters': {
        backgroundColor: palette.color.bgSubtle,
        borderRight: `1px solid ${palette.color.border}`,
        color: palette.color.textFaint,
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 12px 0 16px',
        minWidth: '36px',
      },
      '.cm-activeLine': {
        backgroundColor: overlayActive,
      },
      '.cm-activeLineGutter': {
        backgroundColor: overlayGutter,
        color: palette.color.text,
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: `${overlaySelection} !important`,
      },
      '.cm-cursor': {
        borderLeftColor: palette.color.accent,
      },
      '.cm-tooltip': {
        backgroundColor: palette.color.bgPanel,
        border: `1px solid ${palette.color.border}`,
        color: palette.color.text,
      },
    },
    { dark: isDark },
  )
}

export const TextEditor: React.FC<TextEditorProps> = ({ value, onChange, status, readOnly, fileName }) => {
  const palette = useTheme() as Theme
  const isDark = palette.appearance === 'dark'

  // The wrapper theme is cheap to rebuild but allocates a CM compartment, so
  // we memoize on `appearance`. Languages are also memoized on filename to
  // avoid reparsing the extension list on every keystroke.
  const extensions = useMemo(() => {
    const exts = [buildEditorTheme(palette), EditorView.lineWrapping]
    const lang = fileName ? detectLanguage(fileName) : null
    if (lang) exts.push(lang)
    return exts
    // We only need to rebuild when the appearance flips; passing the whole
    // palette would re-trigger on every styled-components context churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark, fileName])

  const label = languageLabel(fileName ?? '')
  const lineCount = useMemo(() => value.split('\n').length, [value])

  return (
    <S.TextEditorRoot>
      <S.EditorWrap>
        <CodeMirror
          value={value}
          // In dark mode we lean on the Tokyo Night syntax theme; in light
          // mode we let CodeMirror's default highlighting through, which
          // already reads well on the GitHub-flavoured light palette.
          theme={isDark ? tokyoNight : 'light'}
          extensions={extensions}
          onChange={onChange}
          editable={!readOnly}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            indentOnInput: true,
            highlightSelectionMatches: true,
            tabSize: 2,
            // Save is wired via the global useSaveShortcut hook so CodeMirror
            // doesn't need its own Mod-s binding here.
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
          }}
          height="100%"
          style={{ height: '100%' }}
        />
      </S.EditorWrap>
      <S.StatusBar>
        <S.StatusLeft>
          <S.LangBadge>{label}</S.LangBadge>
          {status && <S.StatusText>{status}</S.StatusText>}
        </S.StatusLeft>
        <S.StatusRight>
          <span>{lineCount} line{lineCount === 1 ? '' : 's'}</span>
          <span>UTF-8</span>
        </S.StatusRight>
      </S.StatusBar>
    </S.TextEditorRoot>
  )
}

TextEditor.displayName = 'TextEditor'
