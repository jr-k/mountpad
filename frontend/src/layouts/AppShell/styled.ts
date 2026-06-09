import styled, { css } from 'styled-components'

// Drawer width on mobile; capped so it always leaves room for the backdrop
// (an off-canvas drawer that covers the entire viewport defeats the
// purpose of having a backdrop you can tap to close).
const DRAWER_WIDTH = 'min(88vw, 360px)'

export const AppShellRoot = styled.div<{ $withBanner?: boolean; $bare?: boolean }>`
  display: grid;
  /* The sidebar column is sized to its content so the mount sidebar can
     collapse from ~220px to ~56px (Slack-style) without the grid having
     to know about it. The explorer column reads its width from the
     --explorer-width CSS variable, which AppShell sets from its
     resize-handle state (with a sane 320px fallback). The main column
     fills whatever is left. */
  grid-template-columns: ${({ $bare }) => ($bare ? '1fr' : 'auto var(--explorer-width, 320px) 1fr')};
  /* Status bar gets its own auto-sized track at the bottom: the
     StatusBar component has an intrinsic 22px height, so we let the
     grid pick it up instead of hard-coding a value here (keeps the
     row in sync if we ever bump the bar's height). */
  grid-template-rows: ${({ $withBanner }) => ($withBanner ? '32px 48px 1fr auto' : '48px 1fr auto')};
  grid-template-areas: ${({ $withBanner, $bare }) => {
    if ($bare) {
      return $withBanner
        ? `'banner' 'header' 'main' 'status'`
        : `'header' 'main' 'status'`
    }
    return $withBanner
      ? `'banner banner banner' 'header header header' 'sidebar explorer main' 'status status status'`
      : `'header header header' 'sidebar explorer main' 'status status status'`
  }};
  height: 100vh;
  background: ${({ theme }) => theme.color.bg};

  /* Below the lg breakpoint the layout collapses to a single column.
     The sidebar and explorer become off-canvas drawers (see Sidebar /
     Explorer rules), so the grid only tracks the header (+ optional
     banner), the main content and the status strip. Content stays full
     width: that is the content-first goal. */
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    grid-template-columns: 1fr;
    grid-template-areas: ${({ $withBanner }) =>
      $withBanner ? `'banner' 'header' 'main' 'status'` : `'header' 'main' 'status'`};
  }
`

export const Banner = styled.div<{ $tone: 'warn' | 'danger' }>`
  grid-area: banner;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  /* The banner sits on a vivid danger/warning surface, so we always want a
     near-black text regardless of the app theme: in dark mode it pops over
     the saturated yellow/red; in light mode the bright surfaces still need
     a dark legend to stay legible. */
  color: #0b1220;
  ${({ $tone, theme }) =>
    $tone === 'danger'
      ? css`background: ${theme.color.danger}; color: #fff;`
      : css`background: ${theme.color.warning};`}
`

export const Header = styled.header`
  grid-area: header;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
  padding: 0 ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};

  /* Tighten the header on narrow viewports so the brand + actions cluster
     still fits next to the hamburger button. */
  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    padding: 0 ${({ theme }) => theme.space[2]};
    gap: ${({ theme }) => theme.space[1]};
  }
`

// Hamburger toggle. Only visible below the lg breakpoint because the
// side panels live in the grid itself on desktop. Sized to a comfortable
// tap target (40px) while still aligning with the 48px-tall header.
export const MenuButton = styled.button<{ $open?: boolean }>`
  display: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  padding: 0;
  margin-right: ${({ theme }) => theme.space[1]};
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ $open, theme }) =>
    $open ? theme.color.bgElev : theme.color.bgSubtle};
  color: ${({ $open, theme }) => ($open ? theme.color.text : theme.color.textMuted)};
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.bgElev};
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
  svg { display: block; }

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: inline-flex;
  }
`
MenuButton.displayName = 'AppShell.MenuButton'

// Backdrop sits behind the open drawer and dims the main content. Tap to
// close - managed in AppShell.tsx. Rendered conditionally so it doesn't
// intercept clicks when no drawer is open.
export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.color.overlay};
  z-index: ${({ theme }) => theme.z.drawer};
  /* Backdrops live below the drawer panel itself, which is at drawer + 1. */
`
Backdrop.displayName = 'AppShell.Backdrop'

// Brand is the app-name + logo cluster on the top-left. It is also rendered
// as an Inertia <Link> to "/", so the styles strip the default <a> look
// (underline, link blue) and add a subtle hover state.
export const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-weight: 600;
  letter-spacing: 0.3px;
  color: ${({ theme }) => theme.color.text};
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  min-width: 0;
  transition: opacity 120ms ease;
  &:hover { color: ${({ theme }) => theme.color.text}; opacity: 0.85; }

  /* The app name truncates instead of pushing the user cluster off the
     screen on narrow viewports. */
  & > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    & > span { display: none; }
  }
`

export const BrandDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.accent};
`

BrandDot.displayName = 'AppShell.BrandDot'

export const BrandMark = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.color.accent};
`

BrandMark.displayName = 'AppShell.BrandMark'

export const Nav = styled.nav`
  display: flex;
  gap: ${({ theme }) => theme.space[1]};

  /* Header nav is hidden below the lg breakpoint; the same links are
     re-rendered inside the drawer (see DrawerNav). */
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: none;
  }
`

export const NavLink = styled.a<{ $active?: boolean }>`
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ $active, theme }) => ($active ? theme.color.text : theme.color.textMuted)};
  background: ${({ $active, theme }) => ($active ? theme.color.bgElev : 'transparent')};
  &:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.bgElev}; }
`

// PanelGroup wraps both the mount sidebar and the file explorer. On
// desktop it acts as a layout passthrough (display: contents) so each
// child uses its own grid-area from the outer Shell grid. Below the lg
// breakpoint it becomes a fixed-position drawer that slides in from the
// left, and the children stack vertically inside it.
//
// On mobile the drawer itself is the scroll container. We deliberately
// don't try to give each child its own scroll region (the way the
// desktop layout does) - on a short phone viewport the cumulative
// height of DrawerHeader + DrawerNav + mount trigger + a deeply
// expanded file tree easily exceeds 100vh, and a `flex: 1` Explorer
// would get squashed to 0px while the rest was clipped by overflow.
// One outer scroll keeps everything reachable and matches the
// expectation users have for "long menu in a drawer".
export const PanelGroup = styled.div<{ $open?: boolean }>`
  display: contents;

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    width: ${DRAWER_WIDTH};
    background: ${({ theme }) => theme.color.bgPanel};
    border-right: 1px solid ${({ theme }) => theme.color.border};
    z-index: ${({ theme }) => theme.z.drawer + 1};
    box-shadow: ${({ theme }) => theme.shadow.lg};
    transform: ${({ $open }) => ($open ? 'translateX(0)' : 'translateX(-100%)')};
    transition: transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
    overflow-y: auto;
    overflow-x: hidden;
    /* Touch momentum on iOS; contain stops a bounce here from
       jiggling the body underneath. */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
`
PanelGroup.displayName = 'AppShell.PanelGroup'

// DrawerHeader is only rendered (and only visible) on mobile. Hosts a
// title + close button so the drawer feels like a first-class panel
// instead of a slide-in afterthought.
export const DrawerHeader = styled.div`
  display: none;
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    flex-shrink: 0;
  }
`
DrawerHeader.displayName = 'AppShell.DrawerHeader'

export const DrawerTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.sm};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.textFaint};
`
DrawerTitle.displayName = 'AppShell.DrawerTitle'

export const DrawerClose = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.color.textMuted};
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.bgElev}; }
  svg { display: block; }
`
DrawerClose.displayName = 'AppShell.DrawerClose'

// DrawerNav re-renders the top-level page links inside the mobile
// drawer. It's hidden on desktop where the same links live in the header.
export const DrawerNav = styled.div`
  display: none;
  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: ${({ theme }) => theme.space[2]};
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    flex-shrink: 0;
  }
`
DrawerNav.displayName = 'AppShell.DrawerNav'

export const DrawerNavLink = styled.a<{ $active?: boolean }>`
  display: block;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.md};
  text-decoration: none;
  color: ${({ $active, theme }) => ($active ? theme.color.text : theme.color.textMuted)};
  background: ${({ $active, theme }) => ($active ? theme.color.bgElev : 'transparent')};
  &:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.bgElev}; }
`
DrawerNavLink.displayName = 'AppShell.DrawerNavLink'

export const Sidebar = styled.aside`
  grid-area: sidebar;
  border-right: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    /* Inside the mobile drawer the sidebar is just a horizontal strip
       above the explorer; trim its borders and let it shrink. */
    grid-area: auto;
    border-right: 0;
    border-bottom: 1px solid ${({ theme }) => theme.color.border};
    flex-shrink: 0;
  }
`

export const Explorer = styled.section`
  grid-area: explorer;
  border-right: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgPanel};
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* position: relative anchors the absolutely-positioned ExplorerResizer
     to this pane's right edge. */
  position: relative;

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    grid-area: auto;
    border-right: 0;
    /* In the mobile drawer Explorer is just another stacked block
       sized to its natural content height; the outer PanelGroup
       owns the scroll. flex: 0 0 auto disables shrinking so the
       file tree extends as deep as it needs to, and overflow:
       visible lets the inner List spill into the PanelGroup
       scroll context. */
    flex: 0 0 auto;
    overflow: visible;
    min-height: 0;
  }
`

// ExplorerResizer is the 6px-wide drag strip glued to the right edge
// of the Explorer pane. The visible accent line sits in the middle of
// that strip (via box-shadow), giving a clean ~1px guide while keeping
// a comfortable hit area for the pointer.
//
// Pure-desktop affordance: the entire handle is hidden below `lg`
// because the explorer becomes an off-canvas drawer there and resize
// would be meaningless.
//
// `$resizing` paints the active accent state continuously during the
// drag so the user keeps a clear visual lock on the handle even when
// the cursor wanders outside the strip itself (pointer capture means
// move events still reach it, but the hover styles wouldn't apply).
export const ExplorerResizer = styled.div<{ $resizing?: boolean }>`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 6px;
  z-index: 4;
  cursor: col-resize;
  user-select: none;
  touch-action: none;
  background: ${({ $resizing, theme }) =>
    $resizing ? `color-mix(in srgb, ${theme.color.accent} 25%, transparent)` : 'transparent'};
  transition: background 120ms ease;

  &:hover {
    background: ${({ theme }) => `color-mix(in srgb, ${theme.color.accent} 18%, transparent)`};
  }

  @media (max-width: ${({ theme }) => theme.bp.lg}) {
    display: none;
  }
`
ExplorerResizer.displayName = 'AppShell.ExplorerResizer'

export const Main = styled.section`
  grid-area: main;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`

// Grid-area slot for the StatusBar. The bar itself owns its own
// border/background; this wrapper just parks it in the right row
// and lets it span every column.
export const Status = styled.div`
  grid-area: status;
  min-width: 0;
`
Status.displayName = 'AppShell.Status'

export const UserMenu = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;

  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    gap: ${({ theme }) => theme.space[1]};
  }
`

UserMenu.displayName = 'AppShell.UserMenu'

// UserChip is rendered as an Inertia <Link> to /profile, so styles strip
// the default <a> chrome (underline + link color) and add a hover state
// hinting that the chip is interactive.
export const UserChip = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 4px 10px 4px 4px;
  border: 1px solid ${({ theme }) => theme.color.border};
  border-radius: 999px;
  background: ${({ theme }) => theme.color.bgElev};
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
  &:hover {
    border-color: ${({ theme }) => theme.color.borderStrong};
    background: ${({ theme }) => theme.color.bgPanel};
  }

  /* Drop the right-side padding when there's no text next to the avatar
     so the chip becomes a perfect circle on phones. */
  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    padding: 2px;
    border-radius: 999px;
  }
`

UserChip.displayName = 'AppShell.UserChip'

// UserMeta is the name/role block sitting next to the avatar in the
// header chip. On very small viewports it collapses to icon-only so the
// chip stops eating header real estate.
export const UserMeta = styled.div`
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  gap: 2px;
  min-width: 0;

  @media (max-width: ${({ theme }) => theme.bp.sm}) {
    display: none;
  }
`

UserMeta.displayName = 'AppShell.UserMeta'

export const UserName = styled.span`
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: 500;
  color: ${({ theme }) => theme.color.text};
`

UserName.displayName = 'AppShell.UserName'

export const UserRole = styled.span<{ $admin?: boolean }>`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: lowercase;
  color: ${({ $admin, theme }) => ($admin ? theme.color.warning : theme.color.textFaint)};
`

UserRole.displayName = 'AppShell.UserRole'

export const LogoutButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgElev};
  color: ${({ theme }) => theme.color.textMuted};
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.color.danger};
    border-color: color-mix(in srgb, ${({ theme }) => theme.color.danger} 40%, transparent);
    background: color-mix(in srgb, ${({ theme }) => theme.color.danger} 8%, transparent);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent};
    outline-offset: 1px;
  }
`

LogoutButton.displayName = 'AppShell.LogoutButton'
