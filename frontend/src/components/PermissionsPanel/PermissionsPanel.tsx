import React, { useEffect, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { PermissionMatrix } from '@/components/PermissionMatrix'
import { api, fsApi, HttpError } from '@/lib/api'
import type { ACLView, SystemPermissionsView } from '@/types/files'
import type { User, Group } from '@/types/users'
import type { SharedProps } from '@/types/inertia'
import { formatMode, modeToOctal } from '@/lib/permissions'

import * as S from './styled'

interface PermissionsPanelProps {
  open: boolean
  mountId: number
  path: string
  /**
   * Optional pre-fetched user/group lists. When omitted, the panel fetches
   * them lazily the first time it's opened (best-effort: a non-admin user
   * may not have access to /api/users; in that case the dropdowns simply
   * fall back to the "inherited" option only, which matches their actual
   * authority anyway).
   */
  users?: User[]
  groups?: Group[]
  canChown: boolean
  onClose: () => void
  onSaved: () => void
}

const parseSystemID = (value: string): number =>
  value.trim() === '' ? Number.NaN : Number(value)

export const PermissionsPanel: React.FC<PermissionsPanelProps> = ({
  open, mountId, path, users: usersProp, groups: groupsProp, canChown, onClose, onSaved,
}) => {
  // The viewing user determines what they can actually mutate; we mirror
  // the backend rule (admin OR owner = chmod/chgrp; admin only = chown).
  const { props: pageProps } = usePage<SharedProps & Record<string, unknown>>()
  const viewer = pageProps.auth.user

  const [acl, setAcl] = useState<ACLView | null>(null)
  const [mode, setMode] = useState(0)
  const [ownerId, setOwnerId] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [systemPermissions, setSystemPermissions] = useState<SystemPermissionsView | null>(null)
  const [systemMode, setSystemMode] = useState(0)
  const [systemUID, setSystemUID] = useState('')
  const [systemGID, setSystemGID] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // canModify gates chmod and chgrp: only the file owner (or any admin) can
  // change the mode bits or the group. Computed from the loaded ACL so it
  // updates when the panel reopens on a different path.
  const canModify = useMemo(() => {
    if (viewer?.is_admin) return true
    if (!viewer || !acl) return false
    return acl.owner_id !== null && acl.owner_id === viewer.id
  }, [viewer, acl])

  // Lazily fetched lists. Cached across open/close cycles of the same panel
  // instance so we only hit the API once per session.
  const [fetchedUsers, setFetchedUsers] = useState<User[] | null>(null)
  const [fetchedGroups, setFetchedGroups] = useState<Group[] | null>(null)
  const users = usersProp ?? fetchedUsers ?? []
  const groups = groupsProp ?? fetchedGroups ?? []

  useEffect(() => {
    if (!open) return
    setErr(null)
    setAcl(null)
    setSystemPermissions(null)
    void fsApi(mountId).acl(path).then((res) => {
      setAcl(res)
      setMode(res.mode)
      setOwnerId(res.owner_id)
      setGroupId(res.group_id)
    }).catch((e) => setErr(e instanceof HttpError && e.body ? e.body : String(e)))
    if (canChown) {
      void fsApi(mountId).systemPermissions(path).then((res) => {
        setSystemPermissions(res)
        setSystemMode(res.mode)
        setSystemUID(String(res.uid))
        setSystemGID(String(res.gid))
      }).catch((e) => setErr(e instanceof HttpError && e.body ? e.body : String(e)))
    }
  }, [open, mountId, path, canChown])

  useEffect(() => {
    if (!open) return
    if (usersProp === undefined && fetchedUsers === null) {
      api.get<User[] | null>('/api/users')
        .then((r) => setFetchedUsers(r ?? []))
        .catch(() => setFetchedUsers([]))
    }
    if (groupsProp === undefined && fetchedGroups === null) {
      api.get<Group[] | null>('/api/groups')
        .then((r) => setFetchedGroups(r ?? []))
        .catch(() => setFetchedGroups([]))
    }
  }, [open, usersProp, groupsProp, fetchedUsers, fetchedGroups])

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      if (canModify && acl && mode !== acl.mode) await fsApi(mountId).setMode(path, mode)
      if (canChown && acl && ownerId !== acl.owner_id) await fsApi(mountId).chown(path, ownerId)
      if (canModify && acl && groupId !== acl.group_id) await fsApi(mountId).chgrp(path, groupId)
      if (canChown && systemPermissions && (
        systemMode !== systemPermissions.mode
        || parseSystemID(systemUID) !== systemPermissions.uid
        || parseSystemID(systemGID) !== systemPermissions.gid
      )) {
        const uid = parseSystemID(systemUID)
        const gid = parseSystemID(systemGID)
        if (!Number.isInteger(uid) || uid < 0 || !Number.isInteger(gid) || gid < 0) {
          throw new Error('Host UID and GID must be non-negative integers.')
        }
        await fsApi(mountId).setSystemPermissions({ path, mode: systemMode, uid, gid })
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof HttpError && e.body ? e.body : String(e))
    } finally { setSaving(false) }
  }

  // When the viewer can mutate nothing at all (not admin, not owner) we
  // still render the panel because reading the ACL is valuable on its own,
  // but the Save button has nothing to commit so we hide its enabled state.
  const readOnly = !canModify && !canChown
  const mountPadDirty = !!acl && (
    (canModify && mode !== acl.mode)
    || (canChown && ownerId !== acl.owner_id)
    || (canModify && groupId !== acl.group_id)
  )
  const systemDirty = !!systemPermissions && canChown && (
    systemMode !== systemPermissions.mode
    || parseSystemID(systemUID) !== systemPermissions.uid
    || parseSystemID(systemGID) !== systemPermissions.gid
  )
  const canSave = mountPadDirty || systemDirty

  return (
    <Modal
      open={open}
      title={`Permissions · /${path}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && (
            <Button variant="primary" onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : 'Save'}</Button>
          )}
        </>
      }
    >
      <S.PermissionsPanelRoot>
        {err && <S.ErrorText>{err}</S.ErrorText>}
        <S.Intro>
          These are two independent permission layers. MountPad permissions control access inside
          this application; host permissions are the real Unix metadata on disk.
        </S.Intro>
        <S.Panes>
          <S.Pane>
            <S.PaneHeader>
              <div>
                <S.Heading>MountPad access</S.Heading>
                <S.PaneLead>Used by MountPad only. Does not run chmod or chown on the host.</S.PaneLead>
              </div>
            </S.PaneHeader>
            <S.Section>
              <S.Heading>RWX mode</S.Heading>
              <S.MatrixWrap>
                <PermissionMatrix mode={mode} onChange={setMode} disabled={!canModify} />
                <S.Subtle>{formatMode(mode)} · {modeToOctal(mode)}</S.Subtle>
              </S.MatrixWrap>
              {!canModify && acl && (
                <S.Subtle>Only the MountPad owner or an administrator can change this mode.</S.Subtle>
              )}
            </S.Section>
            <S.Section>
              <S.Heading>MountPad ownership</S.Heading>
              <S.Row>
                <Select
                  label="User"
                  value={ownerId ?? ''}
                  disabled={!canChown}
                  onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: 'inherited' },
                    ...users.map((u) => ({
                      value: u.id,
                      label: u.display_name ? `${u.display_name} (${u.username})` : u.username,
                    })),
                  ]}
                />
                <Select
                  label="Group"
                  value={groupId ?? ''}
                  disabled={!canModify}
                  onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
                  options={[
                    { value: '', label: 'inherited' },
                    ...groups.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                />
              </S.Row>
              <S.Subtle>Source: {acl?.source ?? 'loading…'}.</S.Subtle>
            </S.Section>
          </S.Pane>

          <S.Pane $host>
            <S.PaneHeader>
              <div>
                <S.Heading>Host filesystem</S.Heading>
                <S.PaneLead>Real Unix mode, UID and GID. Changes affect every process using this storage.</S.PaneLead>
              </div>
            </S.PaneHeader>
            {canChown ? systemPermissions ? (
              <>
                <S.Section>
                  <S.Heading>Unix RWX mode</S.Heading>
                  <S.MatrixWrap>
                    <PermissionMatrix mode={systemMode} onChange={setSystemMode} ownerLabel="Owner" />
                    <S.Subtle>{formatMode(systemMode)} · {modeToOctal(systemMode)}</S.Subtle>
                  </S.MatrixWrap>
                </S.Section>
                <S.Section>
                  <S.Heading>Numeric ownership</S.Heading>
                  <S.Row>
                    <Input
                      label="UID"
                      type="number"
                      min={0}
                      step={1}
                      value={systemUID}
                      onChange={(e) => setSystemUID(e.target.value)}
                    />
                    <Input
                      label="GID"
                      type="number"
                      min={0}
                      step={1}
                      value={systemGID}
                      onChange={(e) => setSystemGID(e.target.value)}
                    />
                  </S.Row>
                </S.Section>
                <S.HostWarning>
                  The MountPad process must have OS permission to run chmod/chown. Direct and
                  intermediate symlinks are refused for these privileged changes.
                </S.HostWarning>
              </>
            ) : <S.Subtle>Loading host metadata…</S.Subtle> : (
              <S.HostLocked>
                Host UID, GID and mode are restricted to MountPad administrators.
              </S.HostLocked>
            )}
          </S.Pane>
        </S.Panes>
      </S.PermissionsPanelRoot>
    </Modal>
  )
}
