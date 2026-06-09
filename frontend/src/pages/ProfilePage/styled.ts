import styled from 'styled-components'

// HeroBlock houses the big avatar + name preview at the top of the page.
// It mirrors the SP.Hero layout but pulls in the user's selected colour
// to tint the surrounding card, giving each profile a unique feel.
export const PreviewCard = styled.div<{ $accent: string }>`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: ${({ theme }) => theme.space[5]};
  align-items: center;
  padding: ${({ theme }) => theme.space[5]} ${({ theme }) => theme.space[6]};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: linear-gradient(
    135deg,
    ${({ $accent }) => `color-mix(in srgb, ${$accent} 14%, transparent)`} 0%,
    ${({ theme }) => theme.color.bgPanel} 70%
  );
`
PreviewCard.displayName = 'ProfilePage.PreviewCard'

export const PreviewMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`
PreviewMeta.displayName = 'ProfilePage.PreviewMeta'

export const PreviewName = styled.div`
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
  letter-spacing: -0.01em;
`
PreviewName.displayName = 'ProfilePage.PreviewName'

export const PreviewSub = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]};
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.sm};
`
PreviewSub.displayName = 'ProfilePage.PreviewSub'

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[5]}`};

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`
FormGrid.displayName = 'ProfilePage.FormGrid'

export const FullRow = styled.div`
  grid-column: 1 / -1;
`
FullRow.displayName = 'ProfilePage.FullRow'

// The colour picker is a horizontal swatch row. Each swatch shows the
// hue and, when active, gains a contrasting ring so the selection is
// obvious without relying on copy alone.
// Actions is the submit bar at the bottom of the profile page. It sits as
// a direct child of SettingsPageRoot (not inside a Section), so we draw it
// as a self-contained card: same border colour, same radius, and the same
// subtle background as a Section header. Without this, the previous
// `border-top`-only style made the bar read as a card footer whose card
// had gone missing - visually floating and cut off on the sides.
export const Actions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bgSubtle};
`
Actions.displayName = 'ProfilePage.Actions'

export const StatusText = styled.span<{ $tone: 'idle' | 'saving' | 'saved' | 'error' }>`
  margin-right: auto;
  align-self: center;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ $tone, theme }) => {
    if ($tone === 'saved') return theme.color.success
    if ($tone === 'error') return theme.color.danger
    if ($tone === 'saving') return theme.color.accent
    return theme.color.textFaint
  }};
`
StatusText.displayName = 'ProfilePage.StatusText'
