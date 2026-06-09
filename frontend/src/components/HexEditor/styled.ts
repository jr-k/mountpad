import styled from 'styled-components'

// Three-column hex view: offset · grouped hex bytes · ASCII gutter.
// The whole thing is rendered as a single monospace text block - we
// build the lines as plain strings and let the browser scroll them,
// which keeps the implementation tiny and avoids virtualisation
// for the 256 KiB cap (≈ 16k rows worst case).
export const HexEditorRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg};
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.55;
`
HexEditorRoot.displayName = 'HexEditor.Root'

// Banner at the top: file size + truncation notice. Sits flush with
// the toolbar above to read as an extension of it (same bgSubtle,
// same xs font).
export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  color: ${({ theme }) => theme.color.textMuted};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  white-space: nowrap;
  flex-shrink: 0;
`
Header.displayName = 'HexEditor.Header'

export const TruncatedNote = styled.span`
  color: ${({ theme }) => theme.color.warning};
`
TruncatedNote.displayName = 'HexEditor.TruncatedNote'

// Sticky column-header row showing the 0-F byte indexes above each
// hex column. It scrolls horizontally with the body but stays
// pinned vertically so the offsets stay readable.
export const ColumnRuler = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `4px ${theme.space[3]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  color: ${({ theme }) => theme.color.textFaint};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  letter-spacing: 0.04em;
  white-space: pre;
  flex-shrink: 0;
`
ColumnRuler.displayName = 'HexEditor.ColumnRuler'

export const Scroll = styled.pre`
  margin: 0;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  white-space: pre;
  /* Native momentum scrolling on iOS. */
  -webkit-overflow-scrolling: touch;
`
Scroll.displayName = 'HexEditor.Scroll'

// One row = "offset:  hex group A  hex group B  |ascii|". Inline
// spans keep the three sub-columns easy to colour individually.
export const Row = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  white-space: pre;
`
Row.displayName = 'HexEditor.Row'

export const Offset = styled.span`
  color: ${({ theme }) => theme.color.textFaint};
  flex-shrink: 0;
`
Offset.displayName = 'HexEditor.Offset'

export const Hex = styled.span`
  color: ${({ theme }) => theme.color.text};
  flex-shrink: 0;
  white-space: pre;
`
Hex.displayName = 'HexEditor.Hex'

export const Ascii = styled.span`
  color: ${({ theme }) => theme.color.textMuted};
  flex-shrink: 0;
  white-space: pre;
`
Ascii.displayName = 'HexEditor.Ascii'
