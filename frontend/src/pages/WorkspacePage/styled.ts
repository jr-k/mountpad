import styled from 'styled-components'

// MainPanel wraps the entire main column (toolbar + body) so the
// drag-and-drop overlay can be positioned over the full surface
// without re-laying out the existing flex tree. `position: relative`
// is what anchors the absolutely-positioned overlay; `min-height: 0`
// and the flex column wiring mirror what AppShell's <Main> provides
// so the inner scroll containers keep behaving correctly.
export const MainPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  position: relative;
`
MainPanel.displayName = 'WorkspacePage.MainPanel'

export const MainBody = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
`

// DropOverlay covers the entire MainPanel when one or more files are
// being dragged over the workspace. We dim the background slightly,
// add a dashed accent border, and centre a short call-to-action that
// names the folder the drop will land in. The high z-index sits
// above the panel content but below the modal layer, so an open
// dialog can't be accidentally smothered by the overlay.
export const DropOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[5]};
  pointer-events: none;
  background: ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.accent} 12%, ${theme.color.bg} 88%)`};
  outline: 2px dashed ${({ theme }) => theme.color.accent};
  outline-offset: -8px;
  border-radius: ${({ theme }) => theme.radius.md};
  z-index: ${({ theme }) => theme.z.overlay};
  animation: dropFadeIn 120ms ease-out;
  @keyframes dropFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`
DropOverlay.displayName = 'WorkspacePage.DropOverlay'

export const DropCallout = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  text-align: center;
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: 500;

  & .target {
    margin-top: 4px;
    font-family: ${({ theme }) => theme.font.mono};
    font-size: ${({ theme }) => theme.font.size.sm};
    color: ${({ theme }) => theme.color.textMuted};
    word-break: break-all;
  }
  & svg {
    color: ${({ theme }) => theme.color.accent};
  }
`
DropCallout.displayName = 'WorkspacePage.DropCallout'

// HiddenFileInput is the actual <input type="file"> that the toolbar
// Upload button proxies a click into. Hidden visually but kept in
// the DOM (display: none would dodge change events on some
// browsers); the inline style replicates the standard
// visually-hidden recipe so focus and pointer interactions are
// neutralised without affecting accessibility.
export const HiddenFileInput = styled.input.attrs({ type: 'file', multiple: true })`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`
HiddenFileInput.displayName = 'WorkspacePage.HiddenFileInput'

// UploadError mirrors DeleteError but for the per-file upload result
// banner: stays inside the upload-result modal body. Same family of
// red-tinted treatment so the visual language is consistent across
// failure modes.
export const UploadError = styled.p`
  margin: 0;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.danger};
  background: ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.danger} 10%, transparent)`};
  border: 1px solid ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.danger} 30%, transparent)`};
  border-radius: ${({ theme }) => theme.radius.md};
`
UploadError.displayName = 'WorkspacePage.UploadError'

// UploadList is the structured per-file summary surfaced after a
// multi-file upload. Status icons drive colour, file paths render in
// mono so long names stay readable, the row is dense enough to fit a
// dozen entries without scrolling.
export const UploadList = styled.ul`
  margin: 0;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgSubtle};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  display: flex;
  flex-direction: column;
  gap: 4px;

  & li {
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${({ theme }) => theme.color.text};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  & li.ok    { color: ${({ theme }) => theme.color.success}; }
  & li.warn  { color: ${({ theme }) => theme.color.warning}; }
  & li.err   { color: ${({ theme }) => theme.color.danger}; }
`
UploadList.displayName = 'WorkspacePage.UploadList'

export const EditorWrap = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`

// DetailsBackdrop dims the page when the details drawer is open on
// narrow viewports. It's a no-op on desktop where the panel lives in the
// flex flow next to the editor and clicking outside has no meaning. Tap
// to close: the click handler is wired up in WorkspacePage.
export const DetailsBackdrop = styled.div`
  display: none;
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: block;
    position: fixed;
    inset: 0;
    background: ${({ theme }) => theme.color.overlay};
    z-index: ${({ theme }) => theme.z.drawer};
  }
`
DetailsBackdrop.displayName = 'WorkspacePage.DetailsBackdrop'

export const DeleteMessage = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text};
  line-height: 1.5;

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    background: ${({ theme }) => theme.color.bgElev};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 1px 6px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`

DeleteMessage.displayName = 'WorkspacePage.DeleteMessage'

export const DeleteHint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;
`

DeleteHint.displayName = 'WorkspacePage.DeleteHint'

export const DeleteOption = styled.label<{ $danger?: boolean }>`
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: ${({ theme }) => theme.space[3]};
  align-items: start;
  padding: ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ $danger, theme }) => ($danger
    ? `color-mix(in srgb, ${theme.color.danger} 45%, transparent)`
    : theme.color.border)};
  background: ${({ $danger, theme }) => ($danger
    ? `color-mix(in srgb, ${theme.color.danger} 8%, transparent)`
    : 'transparent')};
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &:hover {
    border-color: ${({ $danger, theme }) => ($danger
      ? `color-mix(in srgb, ${theme.color.danger} 70%, transparent)`
      : theme.color.borderStrong)};
  }

  & > input[type='checkbox'] {
    margin-top: 2px;
    accent-color: ${({ theme }) => theme.color.danger};
    cursor: pointer;
  }

  & strong {
    display: block;
    font-size: ${({ theme }) => theme.font.size.md};
    color: ${({ $danger, theme }) => ($danger ? theme.color.danger : theme.color.text)};
    font-weight: 600;
    margin-bottom: 2px;
  }

  & p {
    margin: 0;
    font-size: ${({ theme }) => theme.font.size.sm};
    color: ${({ theme }) => theme.color.textMuted};
    line-height: 1.5;
  }
`

DeleteOption.displayName = 'WorkspacePage.DeleteOption'

// DeleteList renders the bulleted paths inside the bulk-delete dialog.
// We cap the visible height so a 200-item selection doesn't take the
// whole viewport, while keeping each item readable in mono.
export const DeleteList = styled.ul`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgSubtle};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text};

  & li {
    padding: 2px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  & li.dir::before { content: '📁  '; }
  & li.file::before { content: '📄  '; }
`
DeleteList.displayName = 'WorkspacePage.DeleteList'

// DeleteError is the red banner that surfaces when a bulk delete had
// failures. It sits at the bottom of the dialog body, replacing the
// generic hint, and stays until the user retries or cancels.
export const DeleteError = styled.p`
  margin: 0;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.danger};
  background: ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.danger} 10%, transparent)`};
  border: 1px solid ${({ theme }) =>
    `color-mix(in srgb, ${theme.color.danger} 30%, transparent)`};
  border-radius: ${({ theme }) => theme.radius.md};
`
DeleteError.displayName = 'WorkspacePage.DeleteError'

// DownloadError mirrors DeleteError but lives inside its own dedicated
// modal (rather than tacked onto another dialog). The styling matches
// intentionally so the user reads the two error treatments as part of
// the same family.
export const DownloadError = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.md};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.text};
`
DownloadError.displayName = 'WorkspacePage.DownloadError'
