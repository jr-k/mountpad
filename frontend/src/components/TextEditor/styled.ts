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
