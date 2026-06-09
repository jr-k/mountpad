import React, { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'styled-components'
import { usePage } from '@inertiajs/react'
import { AppShell } from '@/layouts/AppShell'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Logo } from '@/components/Logo'
import { PermissionMatrix } from '@/components/PermissionMatrix'
import { RowMenu } from '@/components/RowMenu'
import { Avatar, AvatarColorPicker } from '@/components/Avatar'
import { HostPathPicker } from '@/components/HostPathPicker'
import { api, HttpError } from '@/lib/api'
import { formatMode, modeToOctal } from '@/lib/permissions'
import type { MountPoint } from '@/types/files'
import type { SharedProps } from '@/types/inertia'
import type { Theme } from '@/styles/theme'
import { SP } from '@/layouts/SettingsPage'

// Compact 16x16 icons used by the per-row overflow menu. We keep them
// inline (rather than pulling an icon library) so the bundle stays small
// and the strokes inherit `currentColor` from the active menu item tone.
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

interface MountForm {
  slug: string
  name: string
  description: string
  host_path: string
  is_active: boolean
  default_mode: number
  /** Empty string = use the deterministic palette derived from the id. */
  avatar_color: string
  /** Per-mount override of MOUNTPAD_FOLLOW_SYMLINK. */
  follow_symlinks: boolean
}

const emptyForm: MountForm = {
  slug: '', name: '', description: '', host_path: '',
  is_active: true, default_mode: 0o750, avatar_color: '',
  follow_symlinks: true,
}

const formFromMount = (m: MountPoint): MountForm => ({
  slug: m.slug,
  name: m.name,
  description: m.description,
  host_path: m.host_path,
  is_active: m.is_active,
  default_mode: m.default_mode,
  avatar_color: m.avatar_color ?? '',
  // Default to true for legacy rows that may not yet have the
  // column populated (or for safety when the API contract changes).
  follow_symlinks: m.follow_symlinks ?? true,
})

// slugify normalises a display name into a URL-safe slug:
//   "Alice's Notes (2026)" → "alices-notes-2026"
// It folds accents to plain ASCII, lowercases, replaces every run of non
// [a-z0-9] chars with a single hyphen, and trims hyphens from both ends.
const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const MountPointsSettingsPage: React.FC = () => {
  const t = useTheme() as Theme
  // Global MOUNTPAD_FOLLOW_SYMLINK exposed by the Inertia share-props
  // pipeline. The runtime check is `global && per-mount`, so when the
  // global flag is off the per-mount checkbox is effectively a no-op
  // - we render it disabled with a hint instead of letting the admin
  // toggle a setting that won't have any effect.
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const globalFollowSymlinks = !!props.app?.follow_symlinks
  const [mounts, setMounts] = useState<MountPoint[]>([])

  // `null` = modal closed. `'new'` = creating. A MountPoint value = editing it.
  const [editing, setEditing] = useState<MountPoint | 'new' | null>(null)
  const [form, setForm] = useState<MountForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Once the user types into the slug field manually, stop deriving it from
  // the display name. Reset to false for "new", true for "edit" (existing
  // slugs are never auto-overwritten as the user retypes the name).
  const [slugTouched, setSlugTouched] = useState(false)

  // Separate dialog so delete confirmations don't collide with the edit modal.
  const [deleting, setDeleting] = useState<MountPoint | null>(null)
  // Folder picker modal for the Host path field. Decoupled state so
  // opening it doesn't fight with the edit modal's input focus.
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = async () => setMounts((await api.get<MountPoint[] | null>('/api/mount-points')) ?? [])
  useEffect(() => { void load() }, [])

  const openNew = () => {
    setForm(emptyForm)
    setErr(null)
    setSlugTouched(false)
    setEditing('new')
  }
  const openEdit = (m: MountPoint) => {
    setForm(formFromMount(m))
    setErr(null)
    // An existing record already has a slug; don't overwrite it as the
    // user edits the display name. Treat the slug field as user-managed.
    setSlugTouched(true)
    setEditing(m)
  }
  const closeForm = () => {
    setEditing(null)
    setErr(null)
    setBusy(false)
  }

  const onNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: slugTouched ? prev.slug : slugify(name),
    }))
  }

  const onSlugChange = (slug: string) => {
    // Mark as touched on the first keystroke so subsequent name edits
    // leave the user-typed slug alone, even if they clear it back to "".
    if (!slugTouched) setSlugTouched(true)
    setForm((prev) => ({ ...prev, slug }))
  }

  const submit = async () => {
    if (!editing) return
    setBusy(true); setErr(null)
    try {
      if (editing === 'new') {
        await api.post('/api/mount-points', form)
      } else {
        await api.patch(`/api/mount-points/${editing.id}`, form)
      }
      closeForm()
      await load()
    } catch (e: unknown) {
      setErr(e instanceof HttpError && e.body ? e.body : 'Save failed.')
    } finally { setBusy(false) }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    await api.del(`/api/mount-points/${deleting.id}`)
    setDeleting(null)
    await load()
  }

  const stats = useMemo(() => {
    const active = mounts.filter((m) => m.is_active).length
    return { total: mounts.length, active, disabled: mounts.length - active }
  }, [mounts])

  return (
    <AppShell
      main={
        <SP.SettingsPageRoot>
          <SP.Hero>
            <SP.HeroIcon><Logo size={28} /></SP.HeroIcon>
            <SP.HeroBody>
              <SP.Eyebrow>Workspace configuration</SP.Eyebrow>
              <SP.Heading>Mounts</SP.Heading>
              <SP.Lead>
                A named host directory exposed to the workspace, with its own default ownership and permissions.
              </SP.Lead>
              <SP.StatRow>
                <SP.Stat><strong>{stats.total}</strong> total</SP.Stat>
                <SP.Stat><strong>{stats.active}</strong> active</SP.Stat>
                <SP.Stat><strong>{stats.disabled}</strong> disabled</SP.Stat>
              </SP.StatRow>
            </SP.HeroBody>
            <SP.HeroAction>
              <Button variant="primary" onClick={openNew}>+ New mount point</Button>
            </SP.HeroAction>
          </SP.Hero>

          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Configured mounts</SP.SectionTitle>
                <SP.SectionLead>
                  Shown in the sidebar in this order. Disabled ones are hidden from non-admin users.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
            </SP.SectionHeader>
            <SP.TableHost>
            <SP.Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Host path</th>
                  <th>Default mode</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mounts.length === 0 ? (
                  <SP.EmptyRow>
                    <td colSpan={6}>
                      <b>No mounts yet</b>
                      Define your first one to start exposing files. A typical setup mounts
                      <code> /storage</code> as the root pad.
                    </td>
                  </SP.EmptyRow>
                ) : (
                  mounts.map((m, idx) => (
                    <tr key={m.id}>
                      <td><SP.RowNum>{idx + 1}</SP.RowNum></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <SP.AvatarButton
                            type="button"
                            onClick={() => openEdit(m)}
                            title={`Edit ${m.name}`}
                            aria-label={`Edit ${m.name}`}
                          >
                            <Avatar
                              id={m.id}
                              color={m.avatar_color}
                              labels={[m.name, m.slug]}
                              size={28}
                            />
                          </SP.AvatarButton>
                          <SP.LinkCell
                            type="button"
                            onClick={() => openEdit(m)}
                            title={`Edit ${m.name}`}
                          >
                            {m.name}
                          </SP.LinkCell>
                        </div>
                      </td>
                      <td><code>{m.host_path}</code></td>
                      <td>
                        {/* Symbolic rwx triplets first (the operator-friendly
                            view: owner, group, others) then the octal in
                            parens so the table doubles as a quick cheat
                            sheet between both representations. */}
                        <code>
                          {formatMode(m.default_mode).match(/.{3}/g)?.join(' ')}
                          {' '}
                          <SP.Faint>(0{modeToOctal(m.default_mode)})</SP.Faint>
                        </code>
                      </td>
                      <td>
                        {m.is_active
                          ? <SP.Pill $tone="success">active</SP.Pill>
                          : <SP.Pill $tone="neutral">disabled</SP.Pill>}
                      </td>
                      <td>
                        <SP.RowActions>
                          <RowMenu
                            label={`Actions for ${m.name}`}
                            items={[
                              { key: 'edit', label: 'Edit mount', icon: <EditIcon />, onSelect: () => openEdit(m) },
                              { key: 'sep',  type: 'divider' },
                              { key: 'del',  label: 'Delete mount', icon: <DeleteIcon />, tone: 'danger', onSelect: () => setDeleting(m) },
                            ]}
                          />
                        </SP.RowActions>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </SP.Table>
            </SP.TableHost>
          </SP.Section>

          <Modal
            open={editing !== null}
            title={editing === 'new' ? 'New mount point' : `Edit · ${typeof editing === 'object' ? editing?.slug : ''}`}
            onClose={closeForm}
            onSubmit={() => { if (!busy) void submit() }}
            footer={<>
              <Button variant="ghost" onClick={closeForm} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={busy}>
                {busy ? 'Saving…' : (editing === 'new' ? 'Create' : 'Save changes')}
              </Button>
            </>}
          >
            <SP.HelpText>
              {editing === 'new'
                ? 'Define a new named entry point onto the host filesystem. All fields except description are required.'
                : 'Changes apply immediately. Renaming the slug also changes the URL of every file under this mount.'}
            </SP.HelpText>
            <Input
              label="Display name"
              placeholder="Documents"
              autoFocus
              value={form.name}
              onChange={(e) => onNameChange(e.target.value)}
            />
            <Input
              label={`Slug${editing === 'new' && !slugTouched ? ' (auto)' : ''}`}
              placeholder="documents"
              value={form.slug}
              onChange={(e) => onSlugChange(e.target.value)}
            />
            <SP.Field>
              <span>Host path</span>
              <SP.PathRow>
                <SP.PathControl
                  placeholder="/storage/docs"
                  value={form.host_path}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(e) => setForm({ ...form, host_path: e.target.value })}
                />
                <SP.PathPickerButton
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  title="Browse the host filesystem"
                  aria-label="Browse the host filesystem"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  Browse
                </SP.PathPickerButton>
              </SP.PathRow>
            </SP.Field>
            <Input label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: t.color.textMuted }}>Avatar</span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 12px',
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.md,
                background: t.color.bgSubtle,
              }}>
                {/* Live preview. Pass the id when editing so the auto
                    swatch lands on the same deterministic palette
                    entry that the sidebar will render; for new mounts
                    we pass -1 (= neutral graphite slot) until the row
                    actually exists. */}
                <Avatar
                  id={typeof editing === 'object' ? editing?.id ?? -1 : -1}
                  color={form.avatar_color}
                  labels={[form.name, form.slug]}
                  size={40}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <AvatarColorPicker
                    value={form.avatar_color}
                    onChange={(c) => setForm({ ...form, avatar_color: c })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: t.color.textMuted }}>Default permission mode</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                <PermissionMatrix
                  mode={form.default_mode}
                  onChange={(next) => setForm({ ...form, default_mode: next })}
                />
                <span style={{
                  alignSelf: 'flex-end',
                  fontFamily: t.font.mono,
                  fontSize: 12,
                  color: t.color.textMuted,
                  letterSpacing: '0.04em',
                }}>
                  {formatMode(form.default_mode)} · 0{modeToOctal(form.default_mode)}
                </span>
              </div>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.color.textMuted, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active &middot; visible in the workspace sidebar
            </label>
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                fontSize: 13,
                color: t.color.textMuted,
                marginTop: 4,
                opacity: globalFollowSymlinks ? 1 : 0.55,
                cursor: globalFollowSymlinks ? 'pointer' : 'not-allowed',
              }}
            >
              <input
                type="checkbox"
                checked={form.follow_symlinks}
                disabled={!globalFollowSymlinks}
                onChange={(e) => setForm({ ...form, follow_symlinks: e.target.checked })}
                style={{ marginTop: 2 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>Follow symbolic links inside this mount</span>
                <span style={{ fontSize: 12, color: t.color.textMuted }}>
                  {globalFollowSymlinks
                    ? 'Uncheck to keep this mount strict. Useful for user-writable trees where a planted symlink could escape the root.'
                    : 'Symbolic links are disabled server-wide.'}
                </span>
              </span>
            </label>
            {err && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 6,
                background: `color-mix(in srgb, ${t.color.danger} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${t.color.danger} 30%, transparent)`,
                color: t.color.danger, fontSize: 13, fontFamily: t.font.mono,
              }}>{err}</div>
            )}
          </Modal>

          <HostPathPicker
            open={pickerOpen}
            initialPath={form.host_path || '/'}
            onClose={() => setPickerOpen(false)}
            onPick={(p) => { setForm((prev) => ({ ...prev, host_path: p })); setPickerOpen(false) }}
          />

          <ConfirmDialog
            open={deleting !== null}
            destructive
            title="Delete mount point"
            confirmLabel="Delete"
            message={<>
              Delete the mount point <code>{deleting?.slug}</code>?<br />
              The host directory <code>{deleting?.host_path}</code> stays untouched on disk, but it
              will no longer be reachable from MountPad and the ACL manifests inside it are orphaned
              until you re-mount that path.
            </>}
            onConfirm={confirmDelete}
            onCancel={() => setDeleting(null)}
          />
        </SP.SettingsPageRoot>
      }
    />
  )
}

export default MountPointsSettingsPage
