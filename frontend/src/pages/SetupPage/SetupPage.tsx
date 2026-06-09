import React, { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { api, HttpError } from '@/lib/api'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

/**
 * /setup: the mandatory first-admin wizard.
 *
 * While no user exists (and SAFE_MODE is off), the backend funnels every
 * route here, so this page is the only thing the operator can interact
 * with. It intentionally renders without the AppShell: no sidebar, no nav,
 * no escape hatch. The only way out is to create the administrator.
 *
 * Once setup succeeds, auth is enabled, a session cookie is set and we
 * hard-redirect to /workspace. We use window.location instead of
 * router.visit so Inertia's shared props (auth state, mounts) are
 * fully refetched on the new authenticated request.
 */
const SetupPage: React.FC = () => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // If the operator lands on /setup after the wizard has already been
    // completed (race, manual URL paste, browser back), bounce them away.
    // The backend would 302 too, but doing it client-side avoids a flash
    // of the form on slow connections.
    if (props.auth.enabled || props.auth.user_count > 0) {
      if (!props.auth.safe_mode) router.visit('/workspace', { replace: true })
    }
  }, [props.auth.enabled, props.auth.user_count, props.auth.safe_mode])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!username.trim() || !password) { setErr('Username and password are required.'); return }
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    setBusy(true)
    try {
      await api.post('/api/auth/setup', {
        username: username.trim(),
        password,
        display_name: displayName.trim(),
      })
      window.location.href = '/workspace'
    } catch (e: unknown) {
      if (e instanceof HttpError) setErr(`Setup failed (${e.status}): ${e.body || e.message}`)
      else setErr('Setup failed')
      setBusy(false)
    }
  }

  return (
    <S.SetupPageRoot>
      <S.TopBar><ThemeToggle /></S.TopBar>
      <S.Frame>
        <span className="corner-tr" />
        <span className="corner-bl" />

        <S.Card onSubmit={submit}>
          <S.BrandRow>
            <Logo size={40} title={props.app?.name ?? 'MountPad'} />
            <S.BrandText>
              <S.BrandName>{props.app?.name ?? 'MountPad'}</S.BrandName>
              <S.BrandTag>self-hosted filesystem · editor</S.BrandTag>
            </S.BrandText>
          </S.BrandRow>

          <S.Prompt>
            <span className="path">~/init</span>
            <span className="arrow">▸</span>
            <span className="verb">create-admin</span>
            <span className="caret" aria-hidden />
          </S.Prompt>

          <S.Divider />

          <S.Lead>
            This instance has no users yet. Create the first administrator to lock down access:
            from now on everyone signs in. Lost your credentials? Restart with{' '}
            <code>MOUNTPAD_SAFE_MODE=true</code> to reset any password.
          </S.Lead>

          <S.Fields>
            <Input
              label="Username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Display name (optional)"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </S.Fields>

          {err && <S.ErrorMsg>{err}</S.ErrorMsg>}

          <S.Actions>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Creating administrator…' : 'Create administrator'}
            </Button>
          </S.Actions>
        </S.Card>

        <S.Footer>mount · edit · share · locally yours</S.Footer>
      </S.Frame>
    </S.SetupPageRoot>
  )
}

export default SetupPage
