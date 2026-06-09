import React, { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { api, HttpError } from '@/lib/api'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

const LoginPage: React.FC = () => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Safe-mode bypasses sign-in (recovery flow); the workspace renders
    // with the synthetic admin user.
    if (props.auth.safe_mode) {
      router.visit('/workspace', { replace: true })
      return
    }
    // No users yet means the setup wizard hasn't run; the server will
    // also 302, but doing it client-side keeps the URL clean if the
    // operator pasted /login manually.
    if (!props.auth.enabled) {
      router.visit('/setup', { replace: true })
    }
  }, [props.auth.enabled, props.auth.safe_mode])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      await api.post('/login', { username, password })
      router.visit('/workspace')
    } catch (e: unknown) {
      if (e instanceof HttpError && e.status === 401) setErr('Invalid credentials.')
      else if (e instanceof HttpError && e.status === 429) setErr('Too many attempts. Try again later.')
      else setErr('Sign-in failed.')
    } finally { setBusy(false) }
  }

  return (
    <S.LoginPageRoot>
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
            <span className="path">~/auth</span>
            <span className="arrow">▸</span>
            <span className="verb">sign-in</span>
            <span className="caret" aria-hidden />
          </S.Prompt>

          <S.Divider />

          <Input
            label="Username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {err && <S.ErrorMsg>{err}</S.ErrorMsg>}

          <S.Actions>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </S.Actions>
        </S.Card>

        <S.Footer>mount · edit · share · locally yours</S.Footer>
      </S.Frame>
    </S.LoginPageRoot>
  )
}

export default LoginPage
