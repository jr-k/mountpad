import React, { useEffect, useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { Logo } from '@/components/Logo'
import { Avatar } from '@/components/Avatar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { api } from '@/lib/api'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

// MenuIcon / CloseIcon: lightweight inline SVGs so the hamburger button
// has no dependency on any icon font and inherits theme color.
const MenuIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

async function logout() {
  try {
    await api.post('/logout', {})
  } catch {
    // Best-effort: even if the request fails (e.g. session already gone),
    // continue with the redirect so the user lands on /login.
  }
  window.location.href = '/login'
}

interface AppShellProps {
  sidebar?: React.ReactNode
  explorer?: React.ReactNode
  main: React.ReactNode
}

export const AppShell: React.FC<AppShellProps> = ({ sidebar, explorer, main }) => {
  const { props, url } = usePage<SharedProps & Record<string, unknown>>()
  const auth = props.auth
  const user = auth.user
  // App name is set server-side via MOUNTPAD_APP_NAME. The fallback keeps
  // existing dev tooling working if the prop is somehow absent.
  const appName = props.app?.name ?? 'MountPad'
  const banner = auth.safe_mode
    ? { tone: 'danger' as const, text: 'SAFE MODE: authentication is bypassed' }
    : !auth.enabled
    ? { tone: 'warn' as const, text: 'Authentication is disabled: anyone with network access can use this app' }
    : null
  // When neither side panel is provided, render a single full-width column so
  // empty states (welcome screen, "no mounts") are properly centered.
  const bare = sidebar == null && explorer == null

  // Drawer state for the mobile (<lg) layout. We keep a single drawer that
  // wraps the mount sidebar + file explorer because they're always shown
  // together on desktop, and stacking them in one off-canvas panel matches
  // how the workspace is laid out logically (mounts → files).
  const [drawerOpen, setDrawerOpen] = useState(false)
  const closeDrawer = () => setDrawerOpen(false)

  // Close the drawer whenever the user navigates: Inertia routes update
  // `url` synchronously so we just react to it. Without this, tapping a
  // sidebar nav link would leave the drawer open over the new page.
  useEffect(() => { closeDrawer() }, [url])

  // ESC closes the drawer too; common keyboard expectation for overlays.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // The hamburger only makes sense if there's something behind it. For an
  // admin every page has at least nav links to expose; for a member the
  // drawer is useless on settings pages (none reachable) and only helpful
  // on the workspace itself when there's an actual sidebar/explorer.
  const hasDrawerContent = (user?.is_admin ?? false) || !bare

  const navLinks: Array<{ href: string; label: string; active: boolean }> = user?.is_admin
    ? [
        { href: '/workspace', label: 'Explorer', active: url.startsWith('/workspace') || url === '/' },
        { href: '/settings/mount-points', label: 'Mounts', active: url.startsWith('/settings/mount-points') },
        { href: '/settings/access', label: 'Access', active: url.startsWith('/settings/access') },
      ]
    : []

  return (
    <S.AppShellRoot $withBanner={!!banner} $bare={bare}>
      {banner && <S.Banner $tone={banner.tone}>{banner.text}</S.Banner>}
      <S.Header>
        {hasDrawerContent && (
          <S.MenuButton
            type="button"
            $open={drawerOpen}
            aria-expanded={drawerOpen}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <CloseIcon /> : <MenuIcon />}
          </S.MenuButton>
        )}
        {/* The brand is also the home link: clicking the logo or app name
            sends the user back to /, which is the workspace root. */}
        <S.Brand as={Link} href="/">
          <S.BrandMark><Logo size={20} title={appName} /></S.BrandMark>
          <span>{appName}</span>
        </S.Brand>
        <S.Nav>
          {/* A simple member only ever has the Explorer tab, which feels
              awkward as a one-item nav. We hide the bar entirely in that
              case; admins get the full set (Explorer · Mounts · Access). */}
          {navLinks.map((l) => (
            <S.NavLink key={l.href} as={Link} href={l.href} $active={l.active}>
              {l.label}
            </S.NavLink>
          ))}
        </S.Nav>
        <S.UserMenu>
          {/* Theme picker sits in the top-right cluster regardless of auth
              state: even on the login/setup screens we want it reachable so
              users can match the OS theme before signing in. */}
          <ThemeToggle />
          {user && (
            <>
              {/* Synthetic SAFE_MODE admin has no DB row, so the profile
                  page would 403. We render the same chip but inert in
                  that case (still useful as a status badge). */}
              <S.UserChip
                as={user.synthetic ? 'div' : (Link as React.ElementType)}
                href={user.synthetic ? undefined : '/profile'}
                title={user.synthetic ? undefined : 'Edit your profile'}
              >
                <Avatar
                  id={user.id}
                  color={user.avatar_color}
                  labels={[user.display_name, user.first_name, user.username]}
                  size={26}
                />
                <S.UserMeta>
                  <S.UserName>{user.display_name || user.username}</S.UserName>
                  <S.UserRole $admin={user.is_admin}>
                    {user.is_admin ? 'admin' : 'member'}
                  </S.UserRole>
                </S.UserMeta>
              </S.UserChip>
              {!user.synthetic && (
                <S.LogoutButton type="button" onClick={logout} title="Sign out" aria-label="Sign out">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M15 17l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M12 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </S.LogoutButton>
              )}
            </>
          )}
        </S.UserMenu>
      </S.Header>
      {/* Backdrop is rendered only while the drawer is open so it doesn't
          intercept clicks on desktop (where PanelGroup is
          `display: contents`). Tapping the backdrop closes the drawer. */}
      {drawerOpen && <S.Backdrop onClick={closeDrawer} />}
      {hasDrawerContent && (
        <S.PanelGroup $open={drawerOpen}>
          {/* Drawer chrome only shows below `lg`: a small title + close
              affordance and the same nav links as the header. On desktop
              every child of PanelGroup either has its own grid-area
              (Sidebar/Explorer) or is hidden by media query. */}
          <S.DrawerHeader>
            <S.DrawerTitle>Menu</S.DrawerTitle>
            <S.DrawerClose type="button" onClick={closeDrawer} aria-label="Close menu">
              <CloseIcon />
            </S.DrawerClose>
          </S.DrawerHeader>
          {navLinks.length > 0 && (
            <S.DrawerNav>
              {navLinks.map((l) => (
                <S.DrawerNavLink
                  key={l.href}
                  as={Link}
                  href={l.href}
                  $active={l.active}
                  onClick={closeDrawer}
                >
                  {l.label}
                </S.DrawerNavLink>
              ))}
            </S.DrawerNav>
          )}
          {!bare && <S.Sidebar>{sidebar}</S.Sidebar>}
          {!bare && <S.Explorer>{explorer}</S.Explorer>}
        </S.PanelGroup>
      )}
      <S.Main>{main}</S.Main>
    </S.AppShellRoot>
  )
}
