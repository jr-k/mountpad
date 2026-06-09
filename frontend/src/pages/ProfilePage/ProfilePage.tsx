import React, { useEffect, useMemo, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { AppShell } from '@/layouts/AppShell'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Avatar, AVATAR_PALETTE, resolveAvatarColor } from '@/components/Avatar'
import { api, HttpError } from '@/lib/api'
import type { User } from '@/types/users'
import type { SharedProps } from '@/types/inertia'
import { SP } from '@/layouts/SettingsPage'

import * as S from './styled'

const ProfileIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

// Profile is wired against GET/PATCH /api/me rather than the admin /users
// endpoints, so the very same page works for any signed-in user. We mirror
// the layout primitives of the other settings screens to keep visual rhythm.
const ProfilePage: React.FC = () => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const authUser = props.auth.user
  const [user, setUser] = useState<User | null>(null)
  const [form, setForm] = useState({
    display_name: '',
    first_name: '',
    last_name: '',
    email: '',
    avatar_color: '',
  })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<{ tone: 'idle' | 'saving' | 'saved' | 'error'; msg: string }>({ tone: 'idle', msg: '' })

  // Pull the canonical user record once on mount. We don't trust the Inertia
  // shared props alone because /api/me returns *all* the profile fields
  // including email and avatar_color, which the shared block also has but
  // which can be stale across reloads.
  useEffect(() => {
    void (async () => {
      try {
        const me = await api.get<User>('/api/me')
        setUser(me)
        setForm({
          display_name: me.display_name ?? '',
          first_name:   me.first_name ?? '',
          last_name:    me.last_name ?? '',
          email:        me.email ?? '',
          avatar_color: me.avatar_color ?? '',
        })
      } catch {
        setStatus({ tone: 'error', msg: 'Could not load your profile.' })
      }
    })()
  }, [])

  const effectiveColor = useMemo(
    () => resolveAvatarColor(form.avatar_color, user?.id ?? authUser?.id ?? null),
    [form.avatar_color, user?.id, authUser?.id],
  )
  const fullName = `${form.first_name} ${form.last_name}`.trim()
  const previewName = form.display_name || fullName || user?.username || 'Profile'

  const save = async () => {
    setStatus({ tone: 'saving', msg: 'Saving…' })
    if (password && password !== confirm) {
      setStatus({ tone: 'error', msg: 'New passwords do not match.' })
      return
    }
    if (password && password.length < 8) {
      setStatus({ tone: 'error', msg: 'New password must be at least 8 characters.' })
      return
    }
    try {
      const updated = await api.patch<User>('/api/me', {
        ...form,
        ...(password ? { password } : {}),
      })
      setUser(updated)
      setPassword(''); setConfirm('')
      setStatus({ tone: 'saved', msg: 'Saved.' })
      // Refresh the Inertia shared props so the header chip picks up the
      // new avatar color + name immediately without a hard reload.
      router.reload({ only: ['auth'] })
      window.setTimeout(() => setStatus((s) => (s.tone === 'saved' ? { tone: 'idle', msg: '' } : s)), 2000)
    } catch (e: unknown) {
      const msg = e instanceof HttpError ? `Save failed (${e.status})` : 'Save failed'
      setStatus({ tone: 'error', msg })
    }
  }

  return (
    <AppShell
      main={
        <SP.SettingsPageRoot>
          <SP.Hero>
            <SP.HeroIcon><ProfileIcon /></SP.HeroIcon>
            <SP.HeroBody>
              <SP.Eyebrow>Account</SP.Eyebrow>
              <SP.Heading>Your profile</SP.Heading>
              <SP.Lead>
                Update how you appear to the rest of the team. Changes apply immediately to
                the header chip, the access tables, and anywhere else your name is shown.
              </SP.Lead>
            </SP.HeroBody>
          </SP.Hero>

          <S.PreviewCard $accent={effectiveColor}>
            <Avatar
              id={user?.id ?? authUser?.id ?? -1}
              color={form.avatar_color}
              labels={[previewName, form.first_name, user?.username]}
              size={84}
            />
            <S.PreviewMeta>
              <S.PreviewName>{previewName}</S.PreviewName>
              <S.PreviewSub>
                <span><code>{user?.username ?? authUser?.username ?? '—'}</code></span>
                {form.email && <span>{form.email}</span>}
                <SP.Pill $tone={authUser?.is_admin ? 'warn' : 'neutral'}>
                  {authUser?.is_admin ? 'admin' : 'member'}
                </SP.Pill>
              </S.PreviewSub>
            </S.PreviewMeta>
          </S.PreviewCard>

          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Identity</SP.SectionTitle>
                <SP.SectionLead>
                  Your display name is what shows in the header and on file ownership labels.
                  First and last name are optional but help fill out the directory.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
            </SP.SectionHeader>
            <S.FormGrid>
              <Input
                label="Display name"
                placeholder={user?.username ?? ''}
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
              <Input
                label="Email (optional)"
                type="email"
                placeholder="alice@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="First name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
              <Input
                label="Last name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </S.FormGrid>
          </SP.Section>

          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Avatar color</SP.SectionTitle>
                <SP.SectionLead>
                  Pick a color or leave the default for a deterministic palette entry derived
                  from your account ID.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
            </SP.SectionHeader>
            <S.FormGrid>
              <S.FullRow>
                <S.Swatches>
                  <S.SwatchAuto
                    type="button"
                    $color="transparent"
                    $active={form.avatar_color === ''}
                    onClick={() => setForm({ ...form, avatar_color: '' })}
                    title="Use the automatic color"
                    aria-label="Automatic color"
                  />
                  {AVATAR_PALETTE.map((c) => (
                    <S.Swatch
                      key={c}
                      type="button"
                      $color={c}
                      $active={form.avatar_color.toLowerCase() === c.toLowerCase()}
                      onClick={() => setForm({ ...form, avatar_color: c })}
                      title={c}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </S.Swatches>
              </S.FullRow>
            </S.FormGrid>
          </SP.Section>

          <SP.Section>
            <SP.SectionHeader>
              <SP.SectionTitleWrap>
                <SP.SectionTitle>Password</SP.SectionTitle>
                <SP.SectionLead>
                  Leave blank to keep your current password. Otherwise pick at least 8 characters.
                </SP.SectionLead>
              </SP.SectionTitleWrap>
            </SP.SectionHeader>
            <S.FormGrid>
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </S.FormGrid>
          </SP.Section>

          <S.Actions>
            <S.StatusText $tone={status.tone}>{status.msg}</S.StatusText>
            <Button variant="primary" onClick={save} disabled={status.tone === 'saving'}>
              {status.tone === 'saving' ? 'Saving…' : 'Save changes'}
            </Button>
          </S.Actions>
        </SP.SettingsPageRoot>
      }
    />
  )
}

export default ProfilePage
