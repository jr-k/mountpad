import styled from 'styled-components'

export const TextEditorRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: ${({ theme }) => theme.color.bg};
`
TextEditorRoot.displayName = 'TextEditor.Root'

export const EditorWrap = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;

  /* The CodeMirror root inserted by @uiw/react-codemirror. */
  & > .cm-theme,
  & > .cm-theme-dark,
  & > .cm-theme-light,
  & .cm-editor {
    height: 100% !important;
  }
  & .cm-editor.cm-focused {
    outline: 0;
  }
`
EditorWrap.displayName = 'TextEditor.EditorWrap'

// ReadonlyOverlay is the centered banner that appears on top of the
// editor when the file is non-editable (currently: symbolic links).
// It uses pointer-events: none on the wrapper so it doesn't trap the
// cursor (the editor below stays focusable for selection + copy), and
// re-enables them only on the Card so the link/dismiss-style chrome
// is still interactive if we add buttons later.
export const ReadonlyOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[6]};
  pointer-events: none;
  background: ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.bg} 70%, transparent)`};
  backdrop-filter: blur(2px);
  z-index: 5;
`
ReadonlyOverlay.displayName = 'TextEditor.ReadonlyOverlay'

export const ReadonlyCard = styled.div`
  pointer-events: auto;
  max-width: 480px;
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  text-align: center;
  color: ${({ theme }) => theme.color.text};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`
ReadonlyCard.displayName = 'TextEditor.ReadonlyCard'

export const ReadonlyTitle = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: 600;
`
ReadonlyTitle.displayName = 'TextEditor.ReadonlyTitle'

export const ReadonlyBody = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.textMuted};
`
ReadonlyBody.displayName = 'TextEditor.ReadonlyBody'

export const StatusBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  padding: 4px ${({ theme }) => theme.space[4]};
  border-top: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
`
StatusBar.displayName = 'TextEditor.StatusBar'

export const StatusLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
`
StatusLeft.displayName = 'TextEditor.StatusLeft'

export const StatusRight = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  font-family: ${({ theme }) => theme.font.mono};
  letter-spacing: 0.02em;
`
StatusRight.displayName = 'TextEditor.StatusRight'

export const StatusText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
StatusText.displayName = 'TextEditor.StatusText'

export const LangBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.accentMuted};
  color: ${({ theme }) => theme.color.accent};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: lowercase;
`
LangBadge.displayName = 'TextEditor.LangBadge'
