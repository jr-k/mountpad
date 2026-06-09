/**
 * The setup wizard reuses the LoginPage's IDE/terminal frame so the operator
 * never feels like they've landed on a different app. The wizard just adds
 * a "Lead" paragraph (context) and a `Fields` wrapper to keep the form
 * inputs at a comfortable rhythm; they would otherwise be too tight when
 * stacked four-high.
 */
export {
  // The wrapping shell is borrowed from LoginPage but re-exported under a
  // SetupPage-specific name so consumers see <S.SetupPageRoot> rather than
  // the unrelated <S.LoginPageRoot> - the prefix convention stays clean
  // even when one page reuses another's chrome.
  LoginPageRoot as SetupPageRoot,
  Frame,
  Card,
  BrandRow,
  BrandText,
  BrandName,
  BrandTag,
  Prompt,
  Divider,
  Actions,
  ErrorMsg,
  Footer,
  TopBar,
} from '@/pages/LoginPage/styled'

import styled from 'styled-components'

export const Lead = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.textMuted};
  line-height: 1.55;
  font-size: ${({ theme }) => theme.font.size.sm};

  & code {
    font-family: ${({ theme }) => theme.font.mono};
    background: ${({ theme }) => theme.color.bg};
    border: 1px solid ${({ theme }) => theme.color.border};
    padding: 1px 6px;
    border-radius: ${({ theme }) => theme.radius.sm};
    color: ${({ theme }) => theme.color.text};
  }
`

Lead.displayName = 'SetupPage.Lead'

export const Fields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`

Fields.displayName = 'SetupPage.Fields'
