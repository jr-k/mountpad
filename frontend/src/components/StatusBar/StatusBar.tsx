import React from 'react'

import * as S from './styled'

interface StatusBarProps {
  /**
   * Page-specific metrics rendered on the left. Pages compose their
   * own `<S.Metric>` chips (separated by `<S.Sep />`) and pass them
   * through here so the bar layout stays uniform.
   */
  metrics?: React.ReactNode
  /** App version string, rendered on the right next to the GitHub link. */
  version?: string
  /** Repo URL - defaults to the upstream MountPad repository. */
  repoUrl?: string
}

// Official GitHub mark, sized to the bar's 22px height. We inline
// the SVG (instead of pulling an icon library) so the colour
// inherits `currentColor` and the bundle stays small.
const GitHubIcon: React.FC = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

/**
 * StatusBar is the discreet ambient strip at the bottom of every
 * page in the app shell. Pages bubble page-specific metrics through
 * `metrics`; the bar always renders the app version + a GitHub link
 * on the right so brand/build info stays one glance away regardless
 * of where the user is.
 */
export const StatusBar: React.FC<StatusBarProps> = ({
  metrics, version, repoUrl = 'https://github.com/jr-k/mountpad',
}) => {
  return (
    <S.StatusBarRoot role="contentinfo" aria-label="Status">
      <S.Left>{metrics}</S.Left>
      <S.Right>
        {version && (
          <S.Metric title={`MountPad ${version}`}>
            <b>{version}</b>
          </S.Metric>
        )}
        <S.Link
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="MountPad on GitHub"
          title="MountPad on GitHub"
        >
          <GitHubIcon />
          <span>GitHub</span>
        </S.Link>
      </S.Right>
    </S.StatusBarRoot>
  )
}

StatusBar.displayName = 'StatusBar'
