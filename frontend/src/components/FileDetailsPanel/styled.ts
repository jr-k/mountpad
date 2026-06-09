import styled from 'styled-components'

export const FileDetailsPanelRoot = styled.aside`
  width: 300px;
  border-left: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  padding: ${({ theme }) => theme.space[4]};
  overflow-y: auto;
  font-size: ${({ theme }) => theme.font.size.sm};

  /* Below the lg breakpoint the details panel becomes a slide-in drawer
     from the right so it never competes with the main editor/folder
     view for horizontal space. WorkspacePage renders a backdrop
     alongside the panel when it is open, so tapping outside closes it
     via the toolbar toggle. */
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(90vw, 360px);
    z-index: ${({ theme }) => theme.z.drawer + 1};
    box-shadow: ${({ theme }) => theme.shadow.lg};
  }
`

export const Title = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: ${({ theme }) => theme.color.textFaint};
  margin-bottom: ${({ theme }) => theme.space[2]};
`

export const Group = styled.div`
  margin-bottom: ${({ theme }) => theme.space[5]};
`

export const Row = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.textMuted};
`

export const Value = styled.span`
  color: ${({ theme }) => theme.color.text};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`
