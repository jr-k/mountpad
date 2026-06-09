import styled from 'styled-components'

/**
 * Local primitives for the Access settings page: chip rows that render
 * a user's groups (or a group's members) inline in the table, and a
 * scrollable check-list used by the "Manage memberships" modal.
 *
 * Pills come from SP.Pill; this file owns layout-only concerns.
 */

export const ChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  max-width: 320px;
`

ChipList.displayName = 'AccessSettingsPage.ChipList'

export const EmptyChips = styled.span`
  font-style: italic;
  font-size: 12px;
  color: ${({ theme }) => theme.color.textFaint};
`

EmptyChips.displayName = 'AccessSettingsPage.EmptyChips'

/**
 * CheckList shows every group (or every user) as a clickable row with a
 * checkbox, name and description. Used by the memberships modal so the
 * operator can see the whole catalog and tick/untick affiliations in one
 * pass instead of editing user-by-user.
 */
export const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  max-height: 360px;
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg};
`

CheckList.displayName = 'AccessSettingsPage.CheckList'

export const CheckRow = styled.label`
  display: grid;
  grid-template-columns: 18px 1fr;
  column-gap: ${({ theme }) => theme.space[3]};
  align-items: start;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  cursor: pointer;
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  transition: background 120ms ease;

  &:last-child {
    border-bottom: 0;
  }
  &:hover {
    background: ${({ theme }) => theme.color.bgElev};
  }

  & input[type='checkbox'] {
    margin-top: 2px;
  }
`

CheckRow.displayName = 'AccessSettingsPage.CheckRow'

export const CheckRowBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

CheckRowBody.displayName = 'AccessSettingsPage.CheckRowBody'

export const CheckRowTitle = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text};
`

CheckRowTitle.displayName = 'AccessSettingsPage.CheckRowTitle'

export const CheckRowDesc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.4;
`

CheckRowDesc.displayName = 'AccessSettingsPage.CheckRowDesc'

export const ModalFootnote = styled.p`
  margin: ${({ theme }) => theme.space[2]} 0 0;
  font-size: 12px;
  color: ${({ theme }) => theme.color.textFaint};
  line-height: 1.5;
`

ModalFootnote.displayName = 'AccessSettingsPage.ModalFootnote'
