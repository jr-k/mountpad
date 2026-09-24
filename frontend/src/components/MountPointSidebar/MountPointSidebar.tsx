import React, { useEffect, useState } from 'react'
import { useTheme } from 'styled-components'
import { usePage } from '@inertiajs/react'
import type { MountPoint } from '@/types/files'
import { Tooltip, TooltipParts as T } from '@/components/Tooltip'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { initialFor, resolveAvatarColor } from '@/components/Avatar'
import { api, HttpError } from '@/lib/api'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

interface MountPointSidebarProps {
  mountPoints: MountPoint[]
  activeMountId?: number
  onSelect: (mp: MountPoint) => void
}

const LS_KEY = 'mountpad:mount-sidebar:collapsed'

// Identity helpers - both the glyph (first letter) and the background
// colour are derived once per mount. The colour falls back to the
// deterministic palette entry from the mount id when no explicit
// override is set on the row, so every mount looks "owned" without
// requiring an admin to revisit each one.
const mountInitial = (mp: MountPoint): string => initialFor(mp.name, mp.slug)
const mountColor   = (mp: MountPoint): string => resolveAvatarColor(mp.avatar_color, mp.id)
const mountAvatarContent = (mp: MountPoint): React.ReactNode => {
  if (mp.has_avatar_image) {
    return <S.AvatarImage src={`/api/mount-points/${mp.id}/avatar`} alt="" />
  }
  return <S.AvatarGlyph $emoji={!!mp.avatar_emoji}>{mp.avatar_emoji || mountInitial(mp)}</S.AvatarGlyph>
}

const buildTooltip = (mp: MountPoint) => (
  <>
    <T.Title>{mp.name}</T.Title>
    {mp.description
      ? <div>{mp.description}</div>
      : <T.Muted>No description.</T.Muted>}
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div><T.Muted>slug:</T.Muted> <T.Code>{mp.slug}</T.Code></div>
      <div><T.Muted>host:</T.Muted> <T.Code>{mp.host_path}</T.Code></div>
    </div>
  </>
)

// SVG arrows toggle the rail. Pointing right when collapsed (to expand),
// left when expanded (to collapse). Tiny inline component so we don't drag
// in an icon set.
const ChevronIcon: React.FC<{ direction: 'left' | 'right' }> = ({ direction }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d={direction === 'right' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

// Caret used by the mobile dropdown trigger. Always points down at
// rest; the wrapping span flips it via CSS when the popover is open.
const CaretDownIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
    <polyline points="3,5.5 8,10.5 13,5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ReorderIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4 5v14m0 0-2-2m2 2 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Synchronously evaluate a CSS media query so the first render already
// matches the viewport (no flash of desktop layout on a phone). The
// listener keeps the value in sync if the user rotates the device or
// resizes the window across the breakpoint.
const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export const MountPointSidebar: React.FC<MountPointSidebarProps> = ({
  mountPoints, activeMountId, onSelect,
}) => {
  const theme = useTheme() as { bp: { lg: string } }
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const [orderedMountPoints, setOrderedMountPoints] = useState(mountPoints)
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderDraft, setOrderDraft] = useState<MountPoint[]>([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const canReorder = !!props.auth.user && !props.auth.user.synthetic && orderedMountPoints.length > 1

  useEffect(() => {
    setOrderedMountPoints(mountPoints)
  }, [mountPoints])

  const openOrder = () => {
    setOrderDraft(orderedMountPoints)
    setOrderError(null)
    setOrderOpen(true)
  }

  const moveMount = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= orderDraft.length) return
    setOrderDraft((current) => {
      const next = [...current]
      const moved = next[index]
      next[index] = next[target]
      next[target] = moved
      return next
    })
  }

  const saveOrder = async () => {
    setOrderBusy(true)
    setOrderError(null)
    try {
      await api.put('/api/me/mount-order', { mount_ids: orderDraft.map((mount) => mount.id) })
      setOrderedMountPoints(orderDraft)
      setOrderOpen(false)
    } catch (error: unknown) {
      setOrderError(error instanceof HttpError && error.body ? error.body : 'Unable to save mount order.')
    } finally {
      setOrderBusy(false)
    }
  }
  // The drawer takes over below `lg`. We swap the desktop rail for a
  // dropdown there: a stacked list of full-width cards reads as
  // repetitive on a phone, and the collapse arrow does nothing in the
  // drawer (width is already forced to 100%).
  const isMobile = useMediaQuery(`(max-width: ${theme.bp.lg})`)

  // Collapsed by default. The state survives reloads via localStorage so
  // the operator only has to set their preference once. Only meaningful
  // on desktop - the mobile dropdown ignores it.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(LS_KEY)
    if (stored === null) return true
    return stored === '1'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LS_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  if (isMobile) {
    return (
      <>
        <S.MobileSidebarWrap>
          <MobileMountDropdown
            mountPoints={orderedMountPoints}
            activeMountId={activeMountId}
            onSelect={onSelect}
          />
          {canReorder && (
            <S.OrderButton type="button" onClick={openOrder} title="Change mount order" aria-label="Change mount order">
              <ReorderIcon />
            </S.OrderButton>
          )}
        </S.MobileSidebarWrap>
        <MountOrderModal
          open={orderOpen}
          mounts={orderDraft}
          busy={orderBusy}
          error={orderError}
          onMove={moveMount}
          onSave={saveOrder}
          onClose={() => setOrderOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <S.MountPointSidebarRoot $collapsed={collapsed}>
      <S.Header $collapsed={collapsed}>
        {!collapsed && <S.Heading>Mounts</S.Heading>}
        <Tooltip
          placement="right"
          delay={500}
          content={<T.Muted>{collapsed ? 'Expand mount rail' : 'Collapse mount rail'}</T.Muted>}
        >
          <S.ToggleButton
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand mounts' : 'Collapse mounts'}
          >
            <ChevronIcon direction={collapsed ? 'right' : 'left'} />
          </S.ToggleButton>
        </Tooltip>
      </S.Header>

      {orderedMountPoints.map((mp) => {
        const active = mp.id === activeMountId
        const bg = mountColor(mp)
        if (collapsed) {
          return (
            <Tooltip key={mp.id} placement="right" content={buildTooltip(mp)}>
              <S.RailItem $active={active} onClick={() => onSelect(mp)}>
                <S.Avatar $bg={bg}>{mountAvatarContent(mp)}</S.Avatar>
              </S.RailItem>
            </Tooltip>
          )
        }
        return (
          <Tooltip key={mp.id} placement="right" content={buildTooltip(mp)}>
            <S.Item $active={active} onClick={() => onSelect(mp)}>
              <S.Avatar $bg={bg}>{mountAvatarContent(mp)}</S.Avatar>
              <S.Meta>
                <S.Name>{mp.name}</S.Name>
                <S.Path>{mp.host_path}</S.Path>
              </S.Meta>
            </S.Item>
          </Tooltip>
        )
      })}
        {canReorder && (
          <S.OrderFooter>
            <Tooltip placement="right" content={<T.Muted>Change mount order</T.Muted>}>
              <S.OrderButton type="button" onClick={openOrder} aria-label="Change mount order">
                <ReorderIcon />
              </S.OrderButton>
            </Tooltip>
          </S.OrderFooter>
        )}
      </S.MountPointSidebarRoot>
      <MountOrderModal
        open={orderOpen}
        mounts={orderDraft}
        busy={orderBusy}
        error={orderError}
        onMove={moveMount}
        onSave={saveOrder}
        onClose={() => setOrderOpen(false)}
      />
    </>
  )
}

interface MountOrderModalProps {
  open: boolean
  mounts: MountPoint[]
  busy: boolean
  error: string | null
  onMove: (index: number, direction: -1 | 1) => void
  onSave: () => void
  onClose: () => void
}

const MountOrderModal: React.FC<MountOrderModalProps> = ({
  open, mounts, busy, error, onMove, onSave, onClose,
}) => (
  <Modal
    open={open}
    title="Mount order"
    onClose={() => { if (!busy) onClose() }}
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={onSave} disabled={busy}>
        {busy ? 'Saving…' : 'Save order'}
      </Button>
    </>}
  >
    <S.OrderList>
      {mounts.map((mount, index) => (
        <S.OrderRow key={mount.id}>
          <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
          <S.Name>{mount.name}</S.Name>
          <S.OrderActions>
            <S.OrderMoveButton
              type="button"
              disabled={busy || index === 0}
              onClick={() => onMove(index, -1)}
              aria-label={`Move ${mount.name} up`}
            >
              ↑
            </S.OrderMoveButton>
            <S.OrderMoveButton
              type="button"
              disabled={busy || index === mounts.length - 1}
              onClick={() => onMove(index, 1)}
              aria-label={`Move ${mount.name} down`}
            >
              ↓
            </S.OrderMoveButton>
          </S.OrderActions>
        </S.OrderRow>
      ))}
    </S.OrderList>
    {error && <S.OrderError>{error}</S.OrderError>}
  </Modal>
)

// MobileMountDropdown is the mount picker shown inside the mobile
// drawer. It renders a trigger row (the active mount, with the same
// avatar + meta + caret rhythm the user sees on every other dropdown
// in the app) and, on tap, opens a centred Modal listing every mount
// as a selectable option.
//
// Using the shared Modal here - rather than a hand-rolled popover -
// solves three things at once:
//   - the dialog escapes the drawer's overflow context (Modal portals
//     to document.body) so it can never be clipped or get a
//     scroll-inside-a-scroll situation;
//   - it inherits the modalStack gate, so app-wide keyboard shortcuts
//     correctly back off while the picker is open;
//   - long mount lists scroll *inside* the dialog body (Modal now
//     caps Dialog at 92vh with an internal scrollable Body), keeping
//     header + footer pinned and the layout predictable.
const MobileMountDropdown: React.FC<MountPointSidebarProps> = ({
  mountPoints, activeMountId, onSelect,
}) => {
  const [open, setOpen] = useState(false)
  const active = mountPoints.find((m) => m.id === activeMountId) ?? null

  // Defensive housekeeping: if the mount list shrinks while the
  // dialog is open (e.g. an admin removes a mount in another tab and
  // the app refreshes the list), we close so the user doesn't keep
  // staring at a now-stale picker.
  useEffect(() => {
    if (open && mountPoints.length === 0) setOpen(false)
  }, [open, mountPoints.length])

  return (
    <S.DropdownRoot>
      <S.DropdownTrigger
        type="button"
        $open={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {active ? (
          <>
            <S.Avatar $bg={mountColor(active)}>{mountAvatarContent(active)}</S.Avatar>
            <S.Meta>
              <S.Name>{active.name}</S.Name>
              <S.Path>{active.host_path}</S.Path>
            </S.Meta>
          </>
        ) : (
          <S.DropdownPlaceholder>Select a mount</S.DropdownPlaceholder>
        )}
        <S.DropdownCaret $open={open}><CaretDownIcon /></S.DropdownCaret>
      </S.DropdownTrigger>

      <Modal
        open={open}
        title="Switch mount"
        onClose={() => setOpen(false)}
      >
        {/* role="listbox" + role="option" so AT can announce this as
            a single-select widget. The Modal body owns the scroll
            when the option list exceeds the dialog max-height. */}
        <S.OptionList role="listbox" aria-label="Available mounts">
          {mountPoints.map((mp) => {
            const isActive = mp.id === activeMountId
            return (
              <S.DropdownOption
                key={mp.id}
                type="button"
                role="option"
                aria-selected={isActive}
                $active={isActive}
                onClick={() => { onSelect(mp); setOpen(false) }}
              >
                <S.Avatar $bg={mountColor(mp)}>{mountAvatarContent(mp)}</S.Avatar>
                <S.Meta>
                  <S.Name>{mp.name}</S.Name>
                  <S.Path>{mp.host_path}</S.Path>
                </S.Meta>
              </S.DropdownOption>
            )
          })}
        </S.OptionList>
      </Modal>
    </S.DropdownRoot>
  )
}
