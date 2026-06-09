import styled, { keyframes } from 'styled-components'

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`

/**
 * Shared layout primitives for the settings pages (Mounts, Users,
 * Groups). They give every settings screen a substantial, consistent feel:
 * - A hero with title + lead paragraph + optional stats/badge row + action.
 * - Section cards with a header and an optional lead.
 * - A polished empty-table row.
 */

// SP.SettingsPageRoot is the scroll container for every settings screen. The parent
// (AppShell's <Main>) is `overflow: hidden`, so we must own the scroll here.
// Otherwise long tables get clipped at the viewport edge instead of being
// reachable. Children are constrained to a 1100px column and centered.
export const SettingsPageRoot = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[12]};
  gap: ${({ theme }) => theme.space[6]};
  animation: ${fadeUp} 240ms ease-out;

  & > * {
    width: 100%;
    max-width: 1100px;
    flex-shrink: 0;
  }

  @media (max-width: ${({ theme }) => theme.bp.md}) {
    padding: ${({ theme }) => theme.space[5]} ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[10]};
    gap: ${({ theme }) => theme.space[4]};
  }
`
SettingsPageRoot.displayName = 'SettingsPage.Root'

export const Hero = styled.header`
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: ${({ theme }) => theme.space[5]};
  padding-bottom: ${({ theme }) => theme.space[5]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};

  /* Below the md breakpoint the action chip moves under the lead
     paragraph so the title does not compete with the button for the
     limited horizontal space. Icon stays inline with the title to
     preserve identity. */
  @media (max-width: ${({ theme }) => theme.bp.md}) {
    grid-template-columns: auto 1fr;
    & > *:nth-child(3) { grid-column: 1 / -1; justify-self: start; }
  }
`
Hero.displayName = 'SettingsPage.Hero'

export const HeroIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radius.lg};
  display: grid;
  place-items: center;
  background: linear-gradient(
    160deg,
    ${({ theme }) => theme.color.accentMuted},
    ${({ theme }) => theme.color.bgPanel}
  );
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.accent};
  box-shadow: ${({ theme }) => theme.shadow.sm};
`
HeroIcon.displayName = 'SettingsPage.HeroIcon'

export const HeroBody = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`
HeroBody.displayName = 'SettingsPage.HeroBody'

export const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${({ theme }) => theme.color.textFaint};
`
Eyebrow.displayName = 'SettingsPage.Eyebrow'

export const Heading = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: 600;
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.color.text};
`
Heading.displayName = 'SettingsPage.Heading'

export const Lead = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.md};
  line-height: 1.6;
  color: ${({ theme }) => theme.color.textMuted};
  max-width: 68ch;

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    background: ${({ theme }) => theme.color.bgElev};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 0 4px;
    border-radius: 4px;
    color: ${({ theme }) => theme.color.text};
  }
`
Lead.displayName = 'SettingsPage.Lead'

export const HeroAction = styled.div`
  align-self: center;
`
HeroAction.displayName = 'SettingsPage.HeroAction'

export const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: ${({ theme }) => theme.space[1]};
`
StatRow.displayName = 'SettingsPage.StatRow'

export const Stat = styled.div`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  background: ${({ theme }) => theme.color.bgElev};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};

  & strong {
    color: ${({ theme }) => theme.color.text};
    font-weight: 600;
    font-family: ${({ theme }) => theme.font.mono};
  }
`
Stat.displayName = 'SettingsPage.Stat'

export const Section = styled.section`
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.lg};
  overflow: hidden;
`
Section.displayName = 'SettingsPage.Section'

// TableHost is the recommended wrapper for any <SP.Table> in a settings
// section. It gives the table horizontal scrolling on narrow viewports
// (where 8-column user tables don't fit) without affecting form-only
// sections that have neighbouring Sections without tables. Use it as the
// immediate child of <SP.Section> in place of an unwrapped <SP.Table>.
export const TableHost = styled.div`
  width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
`
TableHost.displayName = 'SettingsPage.TableHost'

export const SectionHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[5]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};

  /* Stack the title block and the action button on narrow screens so
     long descriptions don't get squeezed into a 60px column next to a
     primary CTA. */
  @media (max-width: ${({ theme }) => theme.bp.md}) {
    flex-direction: column;
    padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
    gap: ${({ theme }) => theme.space[3]};
  }
`
SectionHeader.displayName = 'SettingsPage.SectionHeader'

export const SectionTitleWrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`
SectionTitleWrap.displayName = 'SettingsPage.SectionTitleWrap'

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: 600;
  color: ${({ theme }) => theme.color.text};
`
SectionTitle.displayName = 'SettingsPage.SectionTitle'

export const SectionLead = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;
  max-width: 64ch;
`
SectionLead.displayName = 'SettingsPage.SectionLead'

export const SectionBody = styled.div`
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[5]};
`
SectionBody.displayName = 'SettingsPage.SectionBody'

export const SectionBodyFlush = styled.div`
  /* No padding: used when a Table fills the section corner-to-corner. */
`
SectionBodyFlush.displayName = 'SettingsPage.SectionBodyFlush'

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.font.size.sm};

  @media (max-width: ${({ theme }) => theme.bp.md}) {
    /* Wrapped in SP.TableHost (overflow-x: auto), this minimum width lets
       the table keep its column density on narrow viewports instead of
       wrapping cell contents into multi-line columns. */
    min-width: 720px;
  }

  & th,
  & td {
    padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    vertical-align: middle;
  }
  & thead th {
    background: ${({ theme }) => theme.color.bgSubtle};
    color: ${({ theme }) => theme.color.textFaint};
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.1em;
    font-weight: 600;
  }
  & tbody tr:last-child td {
    border-bottom: 0;
  }
  & tbody tr {
    transition: background 120ms ease;
  }
  & tbody tr:hover {
    background: ${({ theme }) => theme.color.bgElev};
  }
  & code {
    font-family: ${({ theme }) => theme.font.mono};
    font-size: 0.9em;
    color: ${({ theme }) => theme.color.text};
  }
`
Table.displayName = 'SettingsPage.Table'

export const Pill = styled.span<{ $tone?: 'success' | 'warn' | 'danger' | 'neutral' | 'info' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  border-radius: 999px;
  border: 1px solid transparent;

  ${({ $tone = 'neutral', theme }) => {
    // We derive the pill backgrounds from the active palette via color-mix
    // so each tone stays consistent across light and dark modes instead of
    // freezing to a single hex value.
    const tint = (token: string, alphaBg = 12, alphaBorder = 30) =>
      `color: ${token};
       background: color-mix(in srgb, ${token} ${alphaBg}%, transparent);
       border-color: color-mix(in srgb, ${token} ${alphaBorder}%, transparent);`
    switch ($tone) {
      case 'success': return tint(theme.color.success)
      case 'warn':    return tint(theme.color.warning)
      case 'danger':  return tint(theme.color.danger)
      case 'info':
        return `color: ${theme.color.accent}; background: ${theme.color.accentMuted}; border-color: color-mix(in srgb, ${theme.color.accent} 30%, transparent);`
      default:
        return `color: ${theme.color.textMuted}; background: ${theme.color.bgElev}; border-color: ${theme.color.border};`
    }
  }}

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }
`
Pill.displayName = 'SettingsPage.Pill'

export const EmptyRow = styled.tr`
  & td {
    text-align: center;
    padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[4]};
    color: ${({ theme }) => theme.color.textMuted};
    font-size: ${({ theme }) => theme.font.size.sm};

    & b {
      display: block;
      color: ${({ theme }) => theme.color.text};
      font-size: ${({ theme }) => theme.font.size.md};
      margin-bottom: 4px;
      font-weight: 600;
    }
  }
`
EmptyRow.displayName = 'SettingsPage.EmptyRow'

export const RowActions = styled.div`
  display: flex;
  gap: 6px;
  justify-content: flex-end;
`
RowActions.displayName = 'SettingsPage.RowActions'

// RowNum is the small monospace index cell rendered in the first column
// of every settings table. It's intentionally separated from the DB id so
// the operator gets a stable 1..N count tied to the current view order,
// without leaking internal primary keys.
export const RowNum = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.textFaint};
  letter-spacing: 0.04em;
`
RowNum.displayName = 'SettingsPage.RowNum'

// Faint renders inline metadata next to a primary value (e.g. the octal
// representation that complements the rwx triplets in the mount mode
// column). It tones the text down so the eye lands on the main value
// first, while keeping the secondary info readable.
export const Faint = styled.span`
  color: ${({ theme }) => theme.color.textFaint};
`
Faint.displayName = 'SettingsPage.Faint'

// LinkCell turns a table cell's primary text (name, label, identifier...)
// into a one-click shortcut to the row's edit workflow. Looks like plain
// text at rest so the table doesn't read like a sea of hyperlinks, but
// reveals the accent colour + underline on hover/focus to make the
// affordance discoverable. The trigger is a real <button> so keyboard
// users hit Tab + Enter, and it inherits font/colour so embedded markup
// like <code> still renders as if it were a plain cell.
export const LinkCell = styled.button`
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: color 120ms ease;
  &:hover {
    color: ${({ theme }) => theme.color.accent};
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`
LinkCell.displayName = 'SettingsPage.LinkCell'

// AvatarButton makes the avatar tile in a settings-table row clickable
// without changing how it looks at rest. The button is sized like the
// inline Avatar (40x40 with the default 32px circle, but we let
// callers control it through inline width/height when they want a
// tighter cell). A faint ring appears on hover/focus so the affordance
// is discoverable without competing with the LinkCell text trigger
// next to it. Inherits border-radius from the inner Avatar (circle).
export const AvatarButton = styled.button`
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  cursor: pointer;
  transition: box-shadow 120ms ease, transform 120ms ease;
  &:hover { box-shadow: 0 0 0 2px ${({ theme }) => theme.color.accent}; }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.accent};
  }
  &:active { transform: scale(0.96); }
`
AvatarButton.displayName = 'SettingsPage.AvatarButton'

export const HelpText = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.5;
`
HelpText.displayName = 'SettingsPage.HelpText'
