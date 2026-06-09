import React, { useEffect, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Select } from '@/components/Select'
import { PermissionMatrix } from '@/components/PermissionMatrix'
import { api, fsApi } from '@/lib/api'
import type { ACLView } from '@/types/files'
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
    void fsApi(mountId).acl(path).then((res) => {
      setAcl(res)
      setMode(res.mode)
      setOwnerId(res.owner_id)
      setGroupId(res.group_id)
    }).catch((e) => setErr(String(e)))
  }, [open, mountId, path])

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
      if (canModify) await fsApi(mountId).setMode(path, mode)
      if (canChown) await fsApi(mountId).chown(path, ownerId)
      if (canModify) await fsApi(mountId).chgrp(path, groupId)
      onSaved()
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally { setSaving(false) }
  }

  // When the viewer can mutate nothing at all (not admin, not owner) we
  // still render the panel because reading the ACL is valuable on its own,
  // but the Save button has nothing to commit so we hide its enabled state.
  const readOnly = !canModify && !canChown

  return (
    <Modal
      open={open}
      title={`Permissions · /${path}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
          {!readOnly && (
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          )}
        </>
      }
    >
      <S.PermissionsPanelRoot>
        {err && <S.ErrorText>{err}</S.ErrorText>}
        <S.Section>
          <S.Heading>Mode</S.Heading>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <PermissionMatrix mode={mode} onChange={setMode} disabled={!canModify} />
            <S.Subtle style={{ alignSelf: 'flex-end' }}>
              {formatMode(mode)} · {modeToOctal(mode)}
            </S.Subtle>
          </div>
          {!canModify && acl && (
            <S.Subtle>Only the owner (or an administrator) can change permissions.</S.Subtle>
          )}
        </S.Section>
        <S.Section>
          <S.Heading>Ownership</S.Heading>
          <S.Row>
            <Select
              label="Owner"
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
          {!canChown && <S.Subtle>Only administrators can change the owner.</S.Subtle>}
        </S.Section>
      </S.PermissionsPanelRoot>
    </Modal>
  )
}
