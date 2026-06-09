import React, { useEffect, useMemo, useState } from 'react'
import { usePage } from '@inertiajs/react'
import { useTheme } from 'styled-components'
import { AppShell } from '@/layouts/AppShell'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Avatar, AVATAR_PALETTE } from '@/components/Avatar'
import { RowMenu } from '@/components/RowMenu'
import { api } from '@/lib/api'
import type { User, Group } from '@/types/users'
import type { SharedProps } from '@/types/inertia'
import type { Theme } from '@/styles/theme'
import { SP } from '@/layouts/SettingsPage'

import * as S from './styled'

const AccessIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="18" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="2" />
  </svg>
)

// Tiny 16x16 icons used inside the per-row overflow menus. They live next
// to the page that consumes them rather than a global icon set because
// each row menu has a very narrow icon vocabulary: edit, delete, key,
// users. Inline keeps bundle size down and lets strokes inherit the
// current menu-item color (red on the danger tone).
const EditIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 17.25V20h2.75l8.06-8.06-2.75-2.75L4 17.25z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14.06 7.94l2.75 2.75 1.94-1.94a1.5 1.5 0 0 0 0-2.12l-.63-.63a1.5 1.5 0 0 0-2.12 0L14.06 7.94z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

const DeleteIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 7h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)

const GroupsIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 19c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 11a3 3 0 0 0 0-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M17 15c2.6 0.5 4 2.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const KeyIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="8" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11 12l9-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 7l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14 9l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const emptyUserForm = { username: '', password: '', display_name: '', is_admin: false }
// Empty `avatar_color` means "use the deterministic palette entry", which
// matches the backend's convention for the column default.
const emptyGroupForm = { name: '', description: '', avatar_color: '' }

const AccessSettingsPage: React.FC = () => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const t = useTheme() as Theme

  // Users
  const [users, setUsers] = useState<User[]>([])
  const [openNewUser, setOpenNewUser] = useState(false)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState(emptyUserForm)
  const [resetPwd, setResetPwd] = useState('')

  // Groups
  const [groups, setGroups] = useState<Group[]>([])
  // `null` = modal closed. `'new'` = creating. A Group value = editing it.
  const [editingGroup, setEditingGroup] = useState<Group | 'new' | null>(null)
  const [groupForm, setGroupForm] = useState(emptyGroupForm)
  const [deleteGroup, setDeleteGroup] = useState<Group | null>(null)

  // Memberships: the modal lets you flip a user's group affiliations in
  // one pass. We hold the current selection as a Set for fast lookup and
  // diff against the user's existing group_ids on save.
  const [manageUser, setManageUser] = useState<User | null>(null)
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set())
  const [savingMemberships, setSavingMemberships] = useState(false)

  const loadUsers = async () => setUsers((await api.get<User[] | null>('/api/users')) ?? [])
  const loadGroups = async () => setGroups((await api.get<Group[] | null>('/api/groups')) ?? [])

  useEffect(() => { void loadUsers(); void loadGroups() }, [])

  // Maps used to render group chips on the users table and member chips on
  // the groups table. Both views read from the same source of truth: the
  // user list with its `group_ids` field, which is computed server-side.
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])
  const membersByGroup = useMemo(() => {
    const m = new Map<number, User[]>()
    for (const u of users) {
      for (const gid of u.group_ids ?? []) {
        const list = m.get(gid) ?? []
        list.push(u)
        m.set(gid, list)
      }
    }
    return m
  }, [users])

  // User CRUD
  const submitNewUser = async () => {
    await api.post('/api/users', userForm)
    setOpenNewUser(false)
    setUserForm(emptyUserForm)
    await loadUsers()
  }

  const submitResetUser = async () => {
    if (!resetUser || !resetPwd) return
    await api.patch(`/api/users/${resetUser.id}`, { password: resetPwd })
    setResetUser(null); setResetPwd('')
    await loadUsers()
  }

  const submitDeleteUser = async () => {
    if (!deleteUser) return
    await api.del(`/api/users/${deleteUser.id}`)
    setDeleteUser(null)
    await loadUsers()
  }

  // Group CRUD
  const openNewGroup = () => {
    setGroupForm(emptyGroupForm)
    setEditingGroup('new')
  }
  const openEditGroup = (g: Group) => {
    setGroupForm({ name: g.name, description: g.description, avatar_color: g.avatar_color ?? '' })
    setEditingGroup(g)
  }
  const closeGroupForm = () => {
    setEditingGroup(null)
    setGroupForm(emptyGroupForm)
  }
  const submitGroup = async () => {
    if (!editingGroup) return
    if (editingGroup === 'new') {
      await api.post('/api/groups', groupForm)
    } else {
      await api.patch(`/api/groups/${editingGroup.id}`, groupForm)
    }
    closeGroupForm()
    await loadGroups()
  }
  const submitDeleteGroup = async () => {
    if (!deleteGroup) return
    await api.del(`/api/groups/${deleteGroup.id}`)
    setDeleteGroup(null)
    await loadGroups()
    // Reload users too: removed group disappears from any user.group_ids.
    await loadUsers()
  }

  // Memberships
  const openManage = (u: User) => {
    setManageUser(u)
    setSelectedGroups(new Set(u.group_ids ?? []))
  }
  const toggleMembership = (gid: number) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return next
    })
  }
  const submitMemberships = async () => {
    if (!manageUser) return
    setSavingMemberships(true)
    try {
      const current = new Set(manageUser.group_ids ?? [])
      const toAdd: number[] = []
      const toRemove: number[] = []
      for (const gid of selectedGroups) if (!current.has(gid)) toAdd.push(gid)
      for (const gid of current) if (!selectedGroups.has(gid)) toRemove.push(gid)
      // Sequence the calls so a transient failure leaves the UI consistent.
      // Each endpoint is idempotent on the backend.
      for (const gid of toAdd) await api.post(`/api/users/${manageUser.id}/groups`, { group_id: gid })
      for (const gid of toRemove) await api.del(`/api/users/${manageUser.id}/groups/${gid}`)
      setManageUser(null)
      await loadUsers()
    } finally {
      setSavingMemberships(false)
    }
  }

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.is_admin).length
    const active = users.filter((u) => u.is_active).length
    return {
      totalUsers: users.length,
      admins,
      active,
      totalGroups: groups.length,
    }
  }, [users, groups])

  const renderGroupsCell = (u: User) => {
    const ids = u.group_ids ?? []
    if (ids.length === 0) return <S.EmptyChips>no groups</S.EmptyChips>
    return (
      <S.ChipList>
        {ids.map((gid) => {
          const g = groupById.get(gid)
          if (!g) return null
          return <SP.Pill key={gid} $tone="info">{g.name}</SP.Pill>
        })}
      </S.ChipList>
    )
  }

  const renderMembersCell = (g: Group) => {
    const members = membersByGroup.get(g.id) ?? []
    if (members.length === 0) return <S.EmptyChips>no members</S.EmptyChips>
    return (
      <S.ChipList>
        {members.map((m) => (
          <SP.Pill key={m.id} $tone={m.is_admin ? 'warn' : 'neutral'}>{m.username}</SP.Pill>
        ))}
      </S.ChipList>
    )
  }

  return (
    <AppShell
      main={
        <SP.SettingsPageRoot>
          <SP.Hero>
            <SP.HeroIcon><AccessIcon /></SP.HeroIcon>
            <SP.HeroBody>
              <SP.Eyebrow>Identity &amp; permissions</SP.Eyebrow>
              <SP.Heading>Access</SP.Heading>
              <SP.Lead>
                Manage who can sign in, their role, and how they're grouped for ACL scoping.
              </SP.Lead>
              <SP.StatRow>
                <SP.Stat><strong>{stats.totalUsers}</strong> user{stats.totalUsers === 1 ? '' : 's'}</SP.Stat>
                <SP.Stat><strong>{stats.admins}</strong> admin{stats.admins === 1 ? '' : 's'}</SP.Stat>
                <SP.Stat><strong>{stats.active}</strong> active</SP.Stat>
                <SP.Stat><strong>{stats.totalGroups}</strong> group{stats.totalGroups === 1 ? '' : 's'}</SP.Stat>
                {/* The auth pill is only shown to flag the abnormal SAFE_MODE
                    state. Authentication being on is the default, so we don't
                    waste a chip on the obvious. */}
                {props.auth.safe_mode && <SP.Pill $tone="danger">SAFE MODE</SP.Pill>}
              </SP.StatRow>
            </SP.HeroBody>
          </SP.Hero>

          {/* Users */}
          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Users</SP.SectionTitle>
                <SP.SectionLead>
                  Local accounts that sign into MountPad. Admins bypass ACL checks. Use <strong>Groups</strong> to manage memberships.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
              <Button variant="primary" onClick={() => setOpenNewUser(true)}>+ New user</Button>
            </SP.SectionHeader>
            <SP.TableHost>
            <SP.Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th aria-label="Avatar" />
                  <th>Username</th>
                  <th>Display name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Groups</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <SP.EmptyRow>
                    <td colSpan={8}>
                      <b>No users yet</b>
                      Create one to start signing in, or enable the authentication wizard above.
                    </td>
                  </SP.EmptyRow>
                ) : users.map((u, idx) => (
                  <tr key={u.id}>
                    <td><SP.RowNum>{idx + 1}</SP.RowNum></td>
                    <td style={{ width: 40, paddingRight: 0 }}>
                      <Avatar
                        id={u.id}
                        color={u.avatar_color}
                        labels={[u.display_name, u.first_name, u.username]}
                        size={32}
                      />
                    </td>
                    <td>
                      <SP.LinkCell
                        type="button"
                        onClick={() => openManage(u)}
                        title={`Manage groups for ${u.username}`}
                      >
                        <code>{u.username}</code>
                      </SP.LinkCell>
                    </td>
                    <td>
                      {u.display_name
                        ? (
                          <SP.LinkCell
                            type="button"
                            onClick={() => openManage(u)}
                            title={`Manage groups for ${u.username}`}
                          >
                            {u.display_name}
                          </SP.LinkCell>
                        )
                        : <span style={{ color: t.color.textFaint }}>-</span>}
                    </td>
                    <td>{u.is_admin ? <SP.Pill $tone="warn">admin</SP.Pill> : <SP.Pill>member</SP.Pill>}</td>
                    <td>{u.is_active ? <SP.Pill $tone="success">active</SP.Pill> : <SP.Pill $tone="neutral">disabled</SP.Pill>}</td>
                    <td>{renderGroupsCell(u)}</td>
                    <td>
                      <SP.RowActions>
                        <RowMenu
                          label={`Actions for ${u.display_name || u.username}`}
                          items={[
                            { key: 'groups', label: 'Manage groups',  icon: <GroupsIcon />, onSelect: () => openManage(u) },
                            { key: 'reset',  label: 'Reset password', icon: <KeyIcon />,    onSelect: () => setResetUser(u) },
                            { key: 'sep',    type: 'divider' },
                            { key: 'del',    label: 'Delete user',    icon: <DeleteIcon />, tone: 'danger', onSelect: () => setDeleteUser(u) },
                          ]}
                        />
                      </SP.RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SP.Table>
            </SP.TableHost>
          </SP.Section>

          {/* Groups */}
          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Groups</SP.SectionTitle>
                <SP.SectionLead>
                  Bundle users to share permissions on mounts and folders. A user can belong to any number of groups.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
              <Button variant="primary" onClick={openNewGroup}>+ New group</Button>
            </SP.SectionHeader>
            <SP.TableHost>
            <SP.Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th aria-label="Avatar" />
                  <th>Name</th>
                  <th>Description</th>
                  <th>Members</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <SP.EmptyRow>
                    <td colSpan={6}>
                      <b>No groups yet</b>
                      Create one to start scoping permissions across users. Conventional names:
                      <code> readers</code>, <code>editors</code>, <code>ops</code>.
                    </td>
                  </SP.EmptyRow>
                ) : groups.map((g, idx) => (
                  <tr key={g.id}>
                    <td><SP.RowNum>{idx + 1}</SP.RowNum></td>
                    <td style={{ width: 40, paddingRight: 0 }}>
                      <Avatar id={g.id} color={g.avatar_color} labels={[g.name]} size={32} />
                    </td>
                    <td>
                      <SP.LinkCell
                        type="button"
                        onClick={() => openEditGroup(g)}
                        title={`Edit ${g.name}`}
                      >
                        <code>{g.name}</code>
                      </SP.LinkCell>
                    </td>
                    <td>{g.description || <span style={{ color: t.color.textFaint }}>-</span>}</td>
                    <td>{renderMembersCell(g)}</td>
                    <td>
                      <SP.RowActions>
                        <RowMenu
                          label={`Actions for ${g.name}`}
                          items={[
                            { key: 'edit', label: 'Edit group',   icon: <EditIcon />,   onSelect: () => openEditGroup(g) },
                            { key: 'sep',  type: 'divider' },
                            { key: 'del',  label: 'Delete group', icon: <DeleteIcon />, tone: 'danger', onSelect: () => setDeleteGroup(g) },
                          ]}
                        />
                      </SP.RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </SP.Table>
            </SP.TableHost>
          </SP.Section>

          {/* ── Modals ──────────────────────────────────────────────── */}
          <Modal
            open={openNewUser}
            title="New user"
            onClose={() => setOpenNewUser(false)}
            onSubmit={submitNewUser}
            footer={<>
              <Button variant="ghost" onClick={() => setOpenNewUser(false)}>Cancel</Button>
              <Button variant="primary" onClick={submitNewUser}>Create</Button>
            </>}
          >
            <SP.HelpText>
              The new account can sign in immediately. Administrators bypass ACL checks and can manage
              users, groups and mounts. You can assign groups right after creation.
            </SP.HelpText>
            <Input label="Username" placeholder="alice" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
            <Input label="Display name (optional)" placeholder="Alice Liddell" value={userForm.display_name} onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })} />
            <Input label="Password" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.color.textMuted, marginTop: 4 }}>
              <input type="checkbox" checked={userForm.is_admin} onChange={(e) => setUserForm({ ...userForm, is_admin: e.target.checked })} />
              Grant administrator role
            </label>
          </Modal>

          <Modal
            open={resetUser !== null}
            title={`Reset password: ${resetUser?.username ?? ''}`}
            onClose={() => { setResetUser(null); setResetPwd('') }}
            onSubmit={submitResetUser}
            footer={<>
              <Button variant="ghost" onClick={() => { setResetUser(null); setResetPwd('') }}>Cancel</Button>
              <Button variant="primary" onClick={submitResetUser}>Set new password</Button>
            </>}
          >
            <SP.HelpText>
              The user keeps their existing sessions until they expire. They will need this password
              on their next sign-in.
            </SP.HelpText>
            <Input label="New password" type="password" autoFocus value={resetPwd} onChange={(e) => setResetPwd(e.target.value)} />
          </Modal>

          {/* Manage memberships modal: one place to add or remove all of a
              user's group affiliations. The footer label reflects the diff
              so the operator knows how many calls will be issued. */}
          <Modal
            open={manageUser !== null}
            title={manageUser ? `Groups for ${manageUser.username}` : 'Manage memberships'}
            onClose={() => setManageUser(null)}
            footer={<>
              <Button variant="ghost" onClick={() => setManageUser(null)} disabled={savingMemberships}>Cancel</Button>
              <Button variant="primary" onClick={submitMemberships} disabled={savingMemberships}>
                {savingMemberships ? 'Saving…' : 'Apply'}
              </Button>
            </>}
          >
            <SP.HelpText>
              Tick the groups <code>{manageUser?.username}</code> should belong to. Changes are
              applied when you click Apply; until then nothing is sent to the server.
            </SP.HelpText>
            {groups.length === 0 ? (
              <S.EmptyChips>No groups defined yet. Create one in the Groups section first.</S.EmptyChips>
            ) : (
              <S.CheckList>
                {groups.map((g) => (
                  <S.CheckRow key={g.id}>
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(g.id)}
                      onChange={() => toggleMembership(g.id)}
                    />
                    <S.CheckRowBody>
                      <S.CheckRowTitle>{g.name}</S.CheckRowTitle>
                      {g.description && <S.CheckRowDesc>{g.description}</S.CheckRowDesc>}
                    </S.CheckRowBody>
                  </S.CheckRow>
                ))}
              </S.CheckList>
            )}
            {manageUser && (
              <S.ModalFootnote>
                {selectedGroups.size} selected
              </S.ModalFootnote>
            )}
          </Modal>

          {/* Create/Edit group modal */}
          <Modal
            open={editingGroup !== null}
            title={editingGroup === 'new' ? 'New group' : `Edit group: ${typeof editingGroup === 'object' ? editingGroup?.name : ''}`}
            onClose={closeGroupForm}
            onSubmit={submitGroup}
            footer={<>
              <Button variant="ghost" onClick={closeGroupForm}>Cancel</Button>
              <Button variant="primary" onClick={submitGroup}>
                {editingGroup === 'new' ? 'Create' : 'Save changes'}
              </Button>
            </>}
          >
            <SP.HelpText>
              Pick a short, stable name. It will show up in the permissions panel next to file owners,
              and you can assign it to any user from the Users table.
            </SP.HelpText>
            <Input label="Name" placeholder="editors" autoFocus value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} />
            <Input label="Description (optional)" value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, color: t.color.textMuted }}>Avatar color</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar
                  id={typeof editingGroup === 'object' && editingGroup ? editingGroup.id : -1}
                  color={groupForm.avatar_color}
                  labels={[groupForm.name || 'G']}
                  size={40}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setGroupForm({ ...groupForm, avatar_color: '' })}
                    title="Use the automatic color"
                    aria-label="Automatic color"
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: groupForm.avatar_color === '' ? `2px solid ${t.color.accent}` : '0',
                      cursor: 'pointer',
                      background: `repeating-linear-gradient(135deg, ${t.color.bgElev} 0, ${t.color.bgElev} 4px, ${t.color.border} 4px, ${t.color.border} 8px)`,
                    }}
                  />
                  {AVATAR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setGroupForm({ ...groupForm, avatar_color: c })}
                      title={c}
                      aria-label={`Color ${c}`}
                      style={{
                        width: 24, height: 24, borderRadius: '50%',
                        border: groupForm.avatar_color.toLowerCase() === c.toLowerCase() ? `2px solid ${t.color.accent}` : '0',
                        cursor: 'pointer',
                        background: c,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Modal>

          <ConfirmDialog
            open={deleteUser !== null}
            destructive
            title="Delete user"
            confirmLabel="Delete"
            message={<>Delete user <code>{deleteUser?.username}</code>? This cannot be undone. The user's group memberships are removed; file ownership falls back to the mount point default.</>}
            onConfirm={submitDeleteUser}
            onCancel={() => setDeleteUser(null)}
          />

          <ConfirmDialog
            open={deleteGroup !== null}
            destructive
            title="Delete group"
            confirmLabel="Delete"
            message={<>
              Delete group <code>{deleteGroup?.name}</code>? Every membership is removed, but the
              users themselves are kept. Files that were owned by this group revert to the mount's
              default group until you assign a new one.
            </>}
            onConfirm={submitDeleteGroup}
            onCancel={() => setDeleteGroup(null)}
          />
        </SP.SettingsPageRoot>
      }
    />
  )
}

export default AccessSettingsPage
