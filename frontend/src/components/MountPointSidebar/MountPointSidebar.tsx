import React, { useEffect, useState } from 'react'
import type { MountPoint } from '@/types/files'
import { Tooltip, TooltipParts as T } from '@/components/Tooltip'

import * as S from './styled'

interface MountPointSidebarProps {
  mountPoints: MountPoint[]
  activeMountId?: number
  onSelect: (mp: MountPoint) => void
}

const LS_KEY = 'mountpad:mount-sidebar:collapsed'

// First non-whitespace character of the mount name (or slug as a fallback),
// uppercased. Used both as the avatar glyph and as the tooltip anchor when
// the rail is collapsed.
const initialFor = (mp: MountPoint): string => {
  const src = (mp.name || mp.slug || '?').trim()
  return (src.charAt(0) || '?').toUpperCase()
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

export const MountPointSidebar: React.FC<MountPointSidebarProps> = ({
  mountPoints, activeMountId, onSelect,
}) => {
  // Collapsed by default. The state survives reloads via localStorage so
  // the operator only has to set their preference once.
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

  return (
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

      {mountPoints.map((mp) => {
        const active = mp.id === activeMountId
        const letter = initialFor(mp)
        if (collapsed) {
          return (
            <Tooltip key={mp.id} placement="right" content={buildTooltip(mp)}>
              <S.RailItem $active={active} onClick={() => onSelect(mp)}>
                <S.Avatar $active={active}>{letter}</S.Avatar>
              </S.RailItem>
            </Tooltip>
          )
        }
        return (
          <Tooltip key={mp.id} placement="right" content={buildTooltip(mp)}>
            <S.Item $active={active} onClick={() => onSelect(mp)}>
              <S.Avatar $active={active}>{letter}</S.Avatar>
              <S.Meta>
                <S.Name>{mp.name}</S.Name>
                <S.Path>{mp.host_path}</S.Path>
              </S.Meta>
            </S.Item>
          </Tooltip>
        )
      })}
    </S.MountPointSidebarRoot>
  )
}
