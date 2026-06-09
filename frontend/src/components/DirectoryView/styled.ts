import styled from 'styled-components'

export const DirectoryViewRoot = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${({ theme }) => theme.color.bg};
`

// The header sits directly under the FileToolbar and shares its visual
// rhythm: same horizontal padding, same compact vertical padding, and
// `align-items: center` so the "Folder" label, the ViewToggle button
// and the entry-count meta share the same optical mid-line. (Earlier
// versions used `baseline`, which left the xs meta text floating below
// the larger toggle since baselines don't share between mixed-height
// inline-flex children.)
export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  flex-shrink: 0;
`

export const HeaderLabel = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.textFaint};
`

// HeaderMeta is the trailing "X folders · Y files" line. It sits right
// after the ViewToggle (which already has margin-left: auto) and we add
// a small left margin to breathe between the toggle and the counts.
// The parent Header uses align-items: center, so this xs text is
// optically centred with the larger toggle next to it.
export const HeaderMeta = styled.span`
  margin-left: ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
  line-height: 1;
`

// HeaderActions hosts the list/grid toggle. We push it to the right with
// `margin-left: auto` so it always sits on the trailing edge of the
// header, regardless of what (if anything) precedes it. It collapses
// gracefully when no actions are rendered.
export const HeaderActions = styled.div`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
`

export const ViewToggle = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 2px;
  gap: 2px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgElev};
`

export const ViewToggleButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  padding: 0;
  border: 0;
  background: ${({ $active, theme }) =>
    $active ? theme.color.bgPanel : 'transparent'};
  color: ${({ $active, theme }) =>
    $active ? theme.color.text : theme.color.textFaint};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
  box-shadow: ${({ $active, theme }) =>
    $active ? `inset 0 0 0 1px ${theme.color.border}` : 'none'};

  &:hover {
    color: ${({ theme }) => theme.color.text};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }
`

// ScrollBody hosts the listing AND the absolutely-positioned marquee
// overlay. `position: relative` anchors the overlay's coordinate system
// to the scroll container, which means the rubber-band rectangle stays
// glued to the content even while the user scrolls during a drag.
export const ScrollBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
`

// MarqueeBox is the dotted rubber-band rectangle drawn while the user
// drags on empty space. Positioned in CONTENT coordinates (not viewport)
// so it follows the scroll. Pointer events are disabled so the moving
// box never swallows the mouseup that ends the drag.
export const MarqueeBox = styled.div`
  position: absolute;
  border: 1px dashed ${({ theme }) => theme.color.accent};
  background: ${({ theme }) => `color-mix(in srgb, ${theme.color.accent} 12%, transparent)`};
  pointer-events: none;
  z-index: 2;
`

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.font.size.sm};

  thead {
    position: sticky;
    top: 0;
    background: ${({ theme }) => theme.color.bgSubtle};
    z-index: 1;
  }

  th {
    text-align: left;
    font-weight: 500;
    font-size: ${({ theme }) => theme.font.size.xs};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: ${({ theme }) => theme.color.textFaint};
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    white-space: nowrap;
  }

  td {
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    color: ${({ theme }) => theme.color.text};
    white-space: nowrap;
  }

  td.name {
    width: 40%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  td.meta {
    color: ${({ theme }) => theme.color.textMuted};
    font-family: ${({ theme }) => theme.font.mono};
    font-size: ${({ theme }) => theme.font.size.xs};
  }
`

// user-select: none keeps double-clicks from highlighting the row's
// text — without it the activation gesture would smear a text selection
// across the cells before opening the entry, which feels broken even
// though the click handler still fires.
export const Row = styled.tr<{ $active?: boolean }>`
  cursor: pointer;
  user-select: none;
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  &:hover {
    background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : theme.color.bgElev)};
  }
`

export const Icon = styled.span`
  display: inline-block;
  width: 22px;
  text-align: center;
  font-size: 16px;
  line-height: 1;
  margin-right: ${({ theme }) => theme.space[2]};
  vertical-align: middle;
  font-family:
    "Apple Color Emoji",
    "Segoe UI Emoji",
    "Noto Color Emoji",
    "Twemoji Mozilla",
    sans-serif;
`

export const EmptyCell = styled.td`
  /* Used for the "nothing here" placeholder; spans the whole row visually. */
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[4]}`} !important;
  text-align: center;
  color: ${({ theme }) => theme.color.textFaint};
`

// ───────────────────────────────────────────────────────────────────────
// Grid mode: tile-style listing inspired by Windows Explorer's "medium
// icons". The grid auto-fills with ~128px-wide cards, each with the file
// icon front and center, the filename underneath, and a single line of
// secondary metadata (size for files, dimensions/units could come later).

// grid-auto-rows pinned to the same min-height as the tiles guarantees
// every row in the grid has identical dimensions. That uniformity is what
// makes marquee selection feel predictable: an empty rectangle dragged
// through the layout collides with tiles in a regular pattern instead
// of catching some rows that happened to be taller than others.
export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  grid-auto-rows: 132px;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[3]};
`

// Tiles use a fixed min-height so two-line filenames don't push their
// neighbours taller. The whole rectangle is clickable (it is the
// button), giving each item the "invisible bounding box" required for
// consistent marquee collision.
export const Tile = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-height: 132px;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[2]}`};
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.color.accent : 'transparent'};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, theme }) =>
    $active ? theme.color.accentMuted : 'transparent'};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  user-select: none;
  text-align: center;
  min-width: 0;
  transition: background 120ms ease, border-color 120ms ease;

  &:hover {
    background: ${({ $active, theme }) =>
      $active ? theme.color.accentMuted : theme.color.bgElev};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 2px;
  }
`

export const TileIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  line-height: 1;
  width: 56px;
  height: 56px;
  font-family:
    "Apple Color Emoji",
    "Segoe UI Emoji",
    "Noto Color Emoji",
    "Twemoji Mozilla",
    sans-serif;
`

export const TileName = styled.span`
  /* Two-line clamp keeps the grid rows even when a single filename runs
     long. Falls back to ellipsis on browsers without -webkit-line-clamp. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
  font-size: ${({ theme }) => theme.font.size.sm};
  line-height: 1.25;
  max-width: 100%;
`

export const TileMeta = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textFaint};
`

export const EmptyTile = styled.div`
  grid-column: 1 / -1;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[4]}`};
  text-align: center;
  color: ${({ theme }) => theme.color.textFaint};
  font-size: ${({ theme }) => theme.font.size.sm};
`
