import React, { useEffect, useState } from 'react'
import { useTheme } from 'styled-components'
import { usePage } from '@inertiajs/react'
import type { MountPoint } from '@/types/files'
import { Tooltip, TooltipParts as T } from '@/components/Tooltip'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { AvatarColorPicker, initialFor, resolveAvatarColor } from '@/components/Avatar'
import { api, HttpError } from '@/lib/api'
import type { MountLayout, MountLayoutItem, SharedProps } from '@/types/inertia'

import * as S from './styled'

interface MountPointSidebarProps {
  mountPoints: MountPoint[]
  layout?: MountLayout
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

type FolderLayoutItem = Extract<MountLayoutItem, { type: 'folder' }>
const folderColor = (folder: FolderLayoutItem): string => {
  const seed = [...folder.id].reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 0)
  return resolveAvatarColor(folder.avatar_color, seed)
}
const folderAvatarContent = (folder: FolderLayoutItem): React.ReactNode =>
  folder.has_avatar_image
    ? <S.AvatarImage src={`/api/me/mount-folders/${encodeURIComponent(folder.id)}/avatar`} alt="" />
    : <S.AvatarGlyph $emoji={!!folder.icon}>{folder.icon || '📁'}</S.AvatarGlyph>

const normalizeLayout = (layout: MountLayout | undefined, mounts: MountPoint[]): MountLayout => {
  const available = new Set(mounts.map((mount) => mount.id))
  const used = new Set<number>()
  const items: MountLayoutItem[] = []
  for (const item of layout?.items ?? []) {
    if (item.type === 'mount') {
      if (available.has(item.mount_id) && !used.has(item.mount_id)) {
        items.push(item)
        used.add(item.mount_id)
      }
      continue
    }
    const mountIds = item.mount_ids.filter((id) => available.has(id) && !used.has(id))
    mountIds.forEach((id) => used.add(id))
    items.push({ ...item, mount_ids: mountIds })
  }
  for (const mount of mounts) {
    if (!used.has(mount.id)) items.push({ type: 'mount', mount_id: mount.id })
  }
  return { items }
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
  mountPoints, layout: layoutProp, activeMountId, onSelect,
}) => {
  const theme = useTheme() as { bp: { lg: string } }
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const [layout, setLayout] = useState<MountLayout>(() => normalizeLayout(layoutProp, mountPoints))
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderDraft, setOrderDraft] = useState<MountLayout>(() => normalizeLayout(layoutProp, mountPoints))
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [folderAvatarFiles, setFolderAvatarFiles] = useState<Record<string, File>>({})
  const [removedFolderAvatars, setRemovedFolderAvatars] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const canConfigure = !!props.auth.user && !props.auth.user.synthetic && mountPoints.length > 0
  const mountsByID = new Map(mountPoints.map((mount) => [mount.id, mount]))

  useEffect(() => {
    setLayout(normalizeLayout(layoutProp, mountPoints))
  }, [layoutProp, mountPoints])

  const openOrder = () => {
    setOrderDraft(layout)
    setFolderAvatarFiles({})
    setRemovedFolderAvatars(new Set())
    setOrderError(null)
    setOrderOpen(true)
  }

  const saveOrder = async () => {
    setOrderBusy(true)
    setOrderError(null)
    try {
      let saved = await api.put<MountLayout>('/api/me/mount-layout', orderDraft)
      setLayout(normalizeLayout(saved, mountPoints))
      const savedFolderIDs = new Set(saved.items.flatMap((item) => item.type === 'folder' ? [item.id] : []))
      for (const folderID of removedFolderAvatars) {
        if (!savedFolderIDs.has(folderID) || folderAvatarFiles[folderID]) continue
        await api.del(`/api/me/mount-folders/${encodeURIComponent(folderID)}/avatar`)
      }
      for (const [folderID, file] of Object.entries(folderAvatarFiles)) {
        if (!savedFolderIDs.has(folderID)) continue
        const body = new FormData()
        body.append('avatar', file)
        const response = await fetch(`/api/me/mount-folders/${encodeURIComponent(folderID)}/avatar`, {
          method: 'POST',
          credentials: 'same-origin',
          body,
        })
        if (!response.ok) {
          throw new HttpError(response.status, `HTTP ${response.status}`, await response.text())
        }
      }
      saved = {
        items: saved.items.map((item) => item.type === 'folder'
          ? {
              ...item,
              has_avatar_image: folderAvatarFiles[item.id]
                ? true
                : removedFolderAvatars.has(item.id) ? false : item.has_avatar_image,
            }
          : item),
      }
      setLayout(normalizeLayout(saved, mountPoints))
      setOrderOpen(false)
    } catch (error: unknown) {
      setOrderError(error instanceof HttpError && error.body ? error.body : 'Unable to save mount layout.')
    } finally {
      setOrderBusy(false)
    }
  }

  const toggleFolder = (id: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const orderedMountPoints = layout.items.flatMap((item) => {
    if (item.type === 'mount') {
      const mount = mountsByID.get(item.mount_id)
      return mount ? [mount] : []
    }
    return item.mount_ids.flatMap((id) => {
      const mount = mountsByID.get(id)
      return mount ? [mount] : []
    })
  })

  useEffect(() => {
    if (activeMountId == null) return
    const activeFolder = layout.items.find(
      (item): item is Extract<MountLayoutItem, { type: 'folder' }> =>
        item.type === 'folder' && item.mount_ids.includes(activeMountId),
    )
    if (!activeFolder) return
    setExpandedFolders((current) => {
      if (current.has(activeFolder.id)) return current
      const next = new Set(current)
      next.add(activeFolder.id)
      return next
    })
  }, [activeMountId, layout])

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
            layout={layout}
            activeMountId={activeMountId}
            onSelect={onSelect}
          />
          {canConfigure && (
            <S.OrderButton type="button" onClick={openOrder} title="Organize mounts" aria-label="Organize mounts">
              <ReorderIcon />
            </S.OrderButton>
          )}
        </S.MobileSidebarWrap>
        <MountLayoutModal
          open={orderOpen}
          layout={orderDraft}
          mounts={mountPoints}
          avatarFiles={folderAvatarFiles}
          removedAvatars={removedFolderAvatars}
          busy={orderBusy}
          error={orderError}
          onChange={setOrderDraft}
          onAvatarFile={(folderID, file) => {
            setFolderAvatarFiles((current) => ({ ...current, [folderID]: file }))
            setRemovedFolderAvatars((current) => {
              const next = new Set(current)
              next.delete(folderID)
              return next
            })
          }}
          onRemoveAvatar={(folderID) => {
            setFolderAvatarFiles((current) => {
              const next = { ...current }
              delete next[folderID]
              return next
            })
            setRemovedFolderAvatars((current) => new Set(current).add(folderID))
          }}
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

      {layout.items.map((item) => {
        if (item.type === 'mount') {
          const mount = mountsByID.get(item.mount_id)
          if (!mount) return null
          const active = mount.id === activeMountId
          return collapsed ? (
            <Tooltip key={`mount-${mount.id}`} placement="right" content={buildTooltip(mount)}>
              <S.RailItem $active={active} onClick={() => onSelect(mount)}>
                <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
              </S.RailItem>
            </Tooltip>
          ) : (
            <Tooltip key={`mount-${mount.id}`} placement="right" content={buildTooltip(mount)}>
              <S.Item $active={active} onClick={() => onSelect(mount)}>
                <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
                <S.Meta>
                  <S.Name>{mount.name}</S.Name>
                  <S.Path>{mount.host_path}</S.Path>
                </S.Meta>
              </S.Item>
            </Tooltip>
          )
        }

        const folderMounts = item.mount_ids.flatMap((id) => {
          const mount = mountsByID.get(id)
          return mount ? [mount] : []
        })
        if (folderMounts.length === 0) return null
        const open = expandedFolders.has(item.id)
        const active = folderMounts.some((mount) => mount.id === activeMountId)
        return (
          <S.FolderBlock key={`folder-${item.id}`} $collapsed={collapsed} $open={open}>
            <Tooltip placement="right" content={<T.Title>{item.name}</T.Title>}>
              <S.FolderButton
                type="button"
                $collapsed={collapsed}
                $active={active}
                $open={open}
                onClick={() => toggleFolder(item.id)}
                aria-expanded={open}
              >
                <S.FolderAvatar $bg={folderColor(item)}>{folderAvatarContent(item)}</S.FolderAvatar>
                {!collapsed && (
                  <>
                    <S.Meta>
                      <S.Name>{item.name}</S.Name>
                      <S.Path>{folderMounts.length} mount{folderMounts.length === 1 ? '' : 's'}</S.Path>
                    </S.Meta>
                    <S.FolderCaret $open={open}><CaretDownIcon /></S.FolderCaret>
                  </>
                )}
              </S.FolderButton>
            </Tooltip>
            {open && (
              <S.FolderChildren $collapsed={collapsed}>
                {folderMounts.map((mount) => {
                  const mountActive = mount.id === activeMountId
                  return collapsed ? (
                    <Tooltip key={mount.id} placement="right" content={buildTooltip(mount)}>
                      <S.RailItem $active={mountActive} onClick={() => onSelect(mount)}>
                        <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
                      </S.RailItem>
                    </Tooltip>
                  ) : (
                    <Tooltip key={mount.id} placement="right" content={buildTooltip(mount)}>
                      <S.FolderMountItem $active={mountActive} onClick={() => onSelect(mount)}>
                        <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
                        <S.Meta>
                          <S.Name>{mount.name}</S.Name>
                          <S.Path>{mount.host_path}</S.Path>
                        </S.Meta>
                      </S.FolderMountItem>
                    </Tooltip>
                  )
                })}
              </S.FolderChildren>
            )}
          </S.FolderBlock>
        )
      })}
        {canConfigure && (
          <S.OrderFooter>
            <Tooltip placement="right" content={<T.Muted>Organize mounts</T.Muted>}>
              <S.OrderButton type="button" onClick={openOrder} aria-label="Organize mounts">
                <ReorderIcon />
              </S.OrderButton>
            </Tooltip>
          </S.OrderFooter>
        )}
      </S.MountPointSidebarRoot>
      <MountLayoutModal
        open={orderOpen}
        layout={orderDraft}
        mounts={mountPoints}
        avatarFiles={folderAvatarFiles}
        removedAvatars={removedFolderAvatars}
        busy={orderBusy}
        error={orderError}
        onChange={setOrderDraft}
        onAvatarFile={(folderID, file) => {
          setFolderAvatarFiles((current) => ({ ...current, [folderID]: file }))
          setRemovedFolderAvatars((current) => {
            const next = new Set(current)
            next.delete(folderID)
            return next
          })
        }}
        onRemoveAvatar={(folderID) => {
          setFolderAvatarFiles((current) => {
            const next = { ...current }
            delete next[folderID]
            return next
          })
          setRemovedFolderAvatars((current) => new Set(current).add(folderID))
        }}
        onSave={saveOrder}
        onClose={() => setOrderOpen(false)}
      />
    </>
  )
}

interface MountLayoutModalProps {
  open: boolean
  layout: MountLayout
  mounts: MountPoint[]
  avatarFiles: Record<string, File>
  removedAvatars: Set<string>
  busy: boolean
  error: string | null
  onChange: (layout: MountLayout) => void
  onAvatarFile: (folderID: string, file: File) => void
  onRemoveAvatar: (folderID: string) => void
  onSave: () => void
  onClose: () => void
}

const MountLayoutModal: React.FC<MountLayoutModalProps> = ({
  open, layout, mounts, avatarFiles, removedAvatars, busy, error,
  onChange, onAvatarFile, onRemoveAvatar, onSave, onClose,
}) => {
  const mountsByID = new Map(mounts.map((mount) => [mount.id, mount]))
  const folders = layout.items.filter(
    (item): item is Extract<MountLayoutItem, { type: 'folder' }> => item.type === 'folder',
  )

  const moveTopLevel = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= layout.items.length) return
    const items = [...layout.items]
    const moved = items[index]
    items[index] = items[target]
    items[target] = moved
    onChange({ items })
  }

  const updateFolder = (
    id: string,
    changes: Partial<Pick<FolderLayoutItem, 'name' | 'icon' | 'avatar_color'>>,
  ) => {
    onChange({
      items: layout.items.map((item) =>
        item.type === 'folder' && item.id === id ? { ...item, ...changes } : item),
    })
  }

  const addFolder = () => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`
    onChange({
      items: [...layout.items, {
        type: 'folder', id, name: 'New folder', icon: '📁', avatar_color: '', mount_ids: [],
      }],
    })
  }

  const removeFolder = (id: string) => {
    onRemoveAvatar(id)
    const items: MountLayoutItem[] = []
    for (const item of layout.items) {
      if (item.type === 'folder' && item.id === id) {
        item.mount_ids.forEach((mountID) => items.push({ type: 'mount', mount_id: mountID }))
      } else {
        items.push(item)
      }
    }
    onChange({ items })
  }

  const assignMount = (mountID: number, folderID: string) => {
    const items: MountLayoutItem[] = layout.items
      .filter((item) => !(item.type === 'mount' && item.mount_id === mountID))
      .map((item) => item.type === 'folder'
        ? { ...item, mount_ids: item.mount_ids.filter((id) => id !== mountID) }
        : item)
    if (folderID) {
      onChange({
        items: items.map((item) =>
          item.type === 'folder' && item.id === folderID
            ? { ...item, mount_ids: [...item.mount_ids, mountID] }
            : item),
      })
    } else {
      onChange({ items: [...items, { type: 'mount', mount_id: mountID }] })
    }
  }

  const moveInsideFolder = (folderID: string, index: number, direction: -1 | 1) => {
    onChange({
      items: layout.items.map((item) => {
        if (item.type !== 'folder' || item.id !== folderID) return item
        const target = index + direction
        if (target < 0 || target >= item.mount_ids.length) return item
        const mountIds = [...item.mount_ids]
        const moved = mountIds[index]
        mountIds[index] = mountIds[target]
        mountIds[target] = moved
        return { ...item, mount_ids: mountIds }
      }),
    })
  }

  const invalid = folders.some((folder) => folder.name.trim() === '')

  return (
    <Modal
      open={open}
      size="lg"
      title="Organize mounts"
      onClose={() => { if (!busy) onClose() }}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={onSave} disabled={busy || invalid}>
          {busy ? 'Saving…' : 'Save layout'}
        </Button>
      </>}
    >
      <S.LayoutToolbar>
        <S.LayoutHint>Create folders, choose their name and icon, then assign mounts to them.</S.LayoutHint>
        <Button variant="secondary" onClick={addFolder} disabled={busy}>+ New folder</Button>
      </S.LayoutToolbar>
      <S.OrderList>
        {layout.items.map((item, index) => {
          if (item.type === 'mount') {
            const mount = mountsByID.get(item.mount_id)
            if (!mount) return null
            return (
              <S.OrderRow key={`mount-${mount.id}`}>
                <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
                <S.OrderIdentity>
                  <S.Name>{mount.name}</S.Name>
                  <S.Path>{mount.host_path}</S.Path>
                </S.OrderIdentity>
                {folders.length > 0 && (
                  <S.FolderSelect
                    value=""
                    onChange={(event) => assignMount(mount.id, event.target.value)}
                    aria-label={`Move ${mount.name} to folder`}
                  >
                    <option value="">No folder</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </S.FolderSelect>
                )}
                <S.OrderActions>
                  <S.OrderMoveButton type="button" disabled={busy || index === 0} onClick={() => moveTopLevel(index, -1)}>↑</S.OrderMoveButton>
                  <S.OrderMoveButton type="button" disabled={busy || index === layout.items.length - 1} onClick={() => moveTopLevel(index, 1)}>↓</S.OrderMoveButton>
                </S.OrderActions>
              </S.OrderRow>
            )
          }

          return (
            <S.FolderEditor key={`folder-${item.id}`}>
              <S.FolderEditorHeader>
                <S.FolderIconInput
                  aria-label="Folder icon"
                  value={item.icon}
                  maxLength={16}
                  onChange={(event) => updateFolder(item.id, { icon: event.target.value })}
                />
                <Input
                  aria-label="Folder name"
                  value={item.name}
                  maxLength={80}
                  onChange={(event) => updateFolder(item.id, { name: event.target.value })}
                />
                <S.OrderActions>
                  <S.OrderMoveButton type="button" disabled={busy || index === 0} onClick={() => moveTopLevel(index, -1)}>↑</S.OrderMoveButton>
                  <S.OrderMoveButton type="button" disabled={busy || index === layout.items.length - 1} onClick={() => moveTopLevel(index, 1)}>↓</S.OrderMoveButton>
                  <S.FolderDeleteButton type="button" disabled={busy} onClick={() => removeFolder(item.id)}>Remove</S.FolderDeleteButton>
                </S.OrderActions>
              </S.FolderEditorHeader>
              <FolderAppearanceEditor
                folder={item}
                file={avatarFiles[item.id]}
                removed={removedAvatars.has(item.id)}
                disabled={busy}
                onColorChange={(avatar_color) => updateFolder(item.id, { avatar_color })}
                onFile={(file) => onAvatarFile(item.id, file)}
                onRemove={() => onRemoveAvatar(item.id)}
              />
              <S.FolderEditorChildren>
                {item.mount_ids.length === 0 && <S.EmptyFolder>Use a mount’s folder selector to add it here.</S.EmptyFolder>}
                {item.mount_ids.map((mountID, childIndex) => {
                  const mount = mountsByID.get(mountID)
                  if (!mount) return null
                  return (
                    <S.FolderEditorMount key={mount.id}>
                      <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
                      <S.Name>{mount.name}</S.Name>
                      <S.FolderSelect
                        value={item.id}
                        onChange={(event) => assignMount(mount.id, event.target.value)}
                        aria-label={`Move ${mount.name} to folder`}
                      >
                        <option value="">No folder</option>
                        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                      </S.FolderSelect>
                      <S.OrderActions>
                        <S.OrderMoveButton type="button" disabled={busy || childIndex === 0} onClick={() => moveInsideFolder(item.id, childIndex, -1)}>↑</S.OrderMoveButton>
                        <S.OrderMoveButton type="button" disabled={busy || childIndex === item.mount_ids.length - 1} onClick={() => moveInsideFolder(item.id, childIndex, 1)}>↓</S.OrderMoveButton>
                        <S.FolderDeleteButton type="button" disabled={busy} onClick={() => assignMount(mount.id, '')}>Remove</S.FolderDeleteButton>
                      </S.OrderActions>
                    </S.FolderEditorMount>
                  )
                })}
              </S.FolderEditorChildren>
            </S.FolderEditor>
          )
        })}
      </S.OrderList>
      {error && <S.OrderError>{error}</S.OrderError>}
    </Modal>
  )
}

interface FolderAppearanceEditorProps {
  folder: FolderLayoutItem
  file?: File
  removed: boolean
  disabled: boolean
  onColorChange: (color: string) => void
  onFile: (file: File) => void
  onRemove: () => void
}

const FolderAppearanceEditor: React.FC<FolderAppearanceEditorProps> = ({
  folder, file, removed, disabled, onColorChange, onFile, onRemove,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [previewURL, setPreviewURL] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setPreviewURL(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewURL(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const imageURL = previewURL || (folder.has_avatar_image && !removed
    ? `/api/me/mount-folders/${encodeURIComponent(folder.id)}/avatar`
    : null)

  return (
    <S.FolderAppearance>
      <S.FolderAvatar $bg={folderColor(folder)}>
        {imageURL
          ? <S.AvatarImage src={imageURL} alt="" />
          : <S.AvatarGlyph $emoji={!!folder.icon}>{folder.icon || '📁'}</S.AvatarGlyph>}
      </S.FolderAvatar>
      <AvatarColorPicker
        value={folder.avatar_color ?? ''}
        onChange={onColorChange}
        size={24}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (selected) onFile(selected)
          event.target.value = ''
        }}
      />
      <Button size="sm" variant="ghost" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Upload image
      </Button>
      {(file || (folder.has_avatar_image && !removed)) && (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onRemove}>
          Remove image
        </Button>
      )}
    </S.FolderAppearance>
  )
}

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
  mountPoints, layout, activeMountId, onSelect,
}) => {
  const [open, setOpen] = useState(false)
  const active = mountPoints.find((m) => m.id === activeMountId) ?? null
  const mountsByID = new Map(mountPoints.map((mount) => [mount.id, mount]))
  const mobileLayout = normalizeLayout(layout, mountPoints)

  const optionFor = (mount: MountPoint) => {
    const isActive = mount.id === activeMountId
    return (
      <S.DropdownOption
        key={mount.id}
        type="button"
        role="option"
        aria-selected={isActive}
        $active={isActive}
        onClick={() => { onSelect(mount); setOpen(false) }}
      >
        <S.Avatar $bg={mountColor(mount)}>{mountAvatarContent(mount)}</S.Avatar>
        <S.Meta>
          <S.Name>{mount.name}</S.Name>
          <S.Path>{mount.host_path}</S.Path>
        </S.Meta>
      </S.DropdownOption>
    )
  }

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
          {mobileLayout.items.map((item) => {
            if (item.type === 'mount') {
              const mount = mountsByID.get(item.mount_id)
              return mount ? optionFor(mount) : null
            }
            const children = item.mount_ids.flatMap((id) => {
              const mount = mountsByID.get(id)
              return mount ? [mount] : []
            })
            if (children.length === 0) return null
            return (
              <S.MobileFolderGroup key={item.id} role="group" aria-label={item.name}>
                <S.MobileFolderName>
                  <S.FolderAvatar $bg={folderColor(item)}>{folderAvatarContent(item)}</S.FolderAvatar>
                  {item.name}
                </S.MobileFolderName>
                {children.map(optionFor)}
              </S.MobileFolderGroup>
            )
          })}
        </S.OptionList>
      </Modal>
    </S.DropdownRoot>
  )
}
