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

// HeaderActions hosts the three logical control groups along the
// trailing edge of the header: Sort (button + order toggle), Columns
// dropdown, and the list/grid ViewToggle. We push the whole cluster
// to the right with `margin-left: auto` so it always sits on that
// edge, regardless of what precedes it. `gap: space[3]` separates
// the three groups laterally — without it the borders touch and the
// reader can't tell where one control ends and the next begins.
// (Within each group the buttons still share their own tighter spacing
// — e.g. Sort + Asc use HeaderButtonGroup's 4px gap.)
export const HeaderActions = styled.div`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
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

// HeaderButton is the shared visual primitive for the sort, columns
// and order controls. It mirrors the small <Button> variant used in
// other toolbars (height, radius, padding) so the header reads as a
// uniform action row. `$wide` gives the labelled buttons (Sort,
// Columns) a sensible minimum width; the icon-only order toggle
// stays square.
export const HeaderButton = styled.button<{ $active?: boolean; $wide?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: ${({ $wide }) => ($wide ? '0 10px' : '0')};
  width: ${({ $wide }) => ($wide ? 'auto' : '28px')};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ $active, theme }) => ($active ? theme.color.text : theme.color.textMuted)};
  background: ${({ $active, theme }) => ($active ? theme.color.bgPanel : 'transparent')};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  &:hover { color: ${({ theme }) => theme.color.text}; border-color: ${({ theme }) => theme.color.borderStrong}; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }
`

// HeaderButtonGroup glues the sort dropdown and the order toggle into
// a single visual pill: shared border colour, no gap between them.
// `position: relative` anchors the sort popover under the dropdown.
export const HeaderButtonGroup = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
`

// MenuPopover floats just below its anchoring trigger; we right-align
// to the trigger's edge so it grows leftwards and never overflows the
// header on a narrow viewport. z-index sits above the table sticky
// thead but below modals.
export const MenuPopover = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 180px;
  padding: 4px;
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.md};
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

// MenuItem renders a clickable row inside MenuPopover. Active state is
// used by the sort menu to mark the current selection with a check.
export const MenuItem = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  width: 100%;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.sm};
  cursor: pointer;
  text-align: left;
  &:hover { background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : theme.color.bgElev)}; }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: -2px;
  }
`

// MenuCheck is the leading 14px slot in a MenuItem reserved for the
// active checkmark / column checkbox glyph. We always reserve the
// slot so labels stay aligned whether the row is active or not.
export const MenuCheck = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.accent};
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
//
// $dragging: applied to the source rows while a drag is in progress.
// We dim them in place (instead of removing them from the layout) so
// the user sees a "hole" where the items used to sit — matches the
// Windows Explorer convention of "the file is being moved out of here".
//
// $dropTarget: applied to a folder row when the active drag could
// land on it. Drawing a strong inset ring is more reliable than a
// border-color change at small row heights — it doesn't shift the
// row by 1px or clash with the active-selection background.
export const Row = styled.tr<{ $active?: boolean; $dragging?: boolean; $dropTarget?: boolean }>`
  cursor: pointer;
  user-select: none;
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : 'transparent')};
  /* Even-row striping: a subtle alternating tint helps the eye track
     a single row across many narrow columns (owner / group / size /
     mtime). $active still wins so a highlighted row reads identically
     whether it lands on an odd or even slot. nth-of-type counts from
     the first <tr> in the <tbody>, so the synthetic ".." row gets the
     odd (untinted) slot and real entries naturally alternate from
     there. */
  &:nth-of-type(even) {
    background: ${({ $active, theme }) => ($active ? theme.color.accentMuted : theme.color.bgSubtle)};
  }
  box-shadow: ${({ $dropTarget, theme }) =>
    $dropTarget ? `inset 0 0 0 2px ${theme.color.accent}` : 'none'};
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
// $dragging / $dropTarget mirror the table-Row's behaviour: dim the
// source tiles in place during a drag, ring the drop target with an
// accent-coloured border so the user knows where the release would
// land. The border slot is already used for $active highlighting; we
// upgrade it to a thicker accent ring for $dropTarget without growing
// the tile box (still 1px reserved, the second pixel comes from
// outline so it doesn't push neighbours).
export const Tile = styled.button<{ $active?: boolean; $dragging?: boolean; $dropTarget?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-height: 132px;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[2]}`};
  border: 1px solid ${({ $active, $dropTarget, theme }) =>
    $dropTarget ? theme.color.accent : $active ? theme.color.accent : 'transparent'};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, $dropTarget, theme }) =>
    $dropTarget ? theme.color.accentMuted : $active ? theme.color.accentMuted : 'transparent'};
  color: ${({ theme }) => theme.color.text};
  cursor: pointer;
  user-select: none;
  text-align: center;
  min-width: 0;
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  outline: ${({ $dropTarget, theme }) =>
    $dropTarget ? `1px solid ${theme.color.accent}` : 'none'};
  outline-offset: -2px;
  transition: background 120ms ease, border-color 120ms ease;

  &:hover {
    background: ${({ $active, $dropTarget, theme }) =>
      $dropTarget ? theme.color.accentMuted : $active ? theme.color.accentMuted : theme.color.bgElev};
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

// DragGhost is the floating preview rendered next to the cursor while
// the user drags one (or many) entries. It lives permanently in the
// DOM at off-screen coordinates so we can mutate its content from
// onDragStart and immediately feed it to dataTransfer.setDragImage —
// the browser snapshots the node at that moment and detaches it from
// our DOM for the rest of the drag.
//
// position: fixed + top:-10000px keeps it invisible to the user but
// laid out (setDragImage requires a rendered, non-display:none node
// to take a usable snapshot in every browser).
export const DragGhost = styled.div`
  position: fixed;
  top: -10000px;
  left: -10000px;
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  max-width: 320px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.color.borderStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgPanel};
  color: ${({ theme }) => theme.color.text};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-family: ${({ theme }) => theme.font.family};
  box-shadow: ${({ theme }) => theme.shadow.md};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

// GhostIcon mirrors the file-icon glyph style used by the rows/tiles
// so the preview reads as "one of those things you just grabbed".
export const GhostIcon = styled.span`
  font-size: 16px;
  line-height: 1;
  font-family:
    "Apple Color Emoji",
    "Segoe UI Emoji",
    "Noto Color Emoji",
    "Twemoji Mozilla",
    sans-serif;
`

// GhostBadge is the "+ N" pill rendered for a multi-selection drag.
// Keeps the count visible without truncating the leading filename.
export const GhostBadge = styled.span`
  padding: 1px 6px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.accent};
  color: ${({ theme }) => theme.color.bgPanel};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: 600;
  line-height: 1.4;
`
