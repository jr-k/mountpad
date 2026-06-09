import React from 'react'
import { usePage } from '@inertiajs/react'
import { Logo } from '@/components/Logo'
import type { SharedProps } from '@/types/inertia'

import * as S from './styled'

interface Step {
  number: number
  title: string
  description: React.ReactNode
}

interface WelcomeScreenProps {
  title: string
  lead: React.ReactNode
  steps?: Step[]
  actions: React.ReactNode
  /** Optional small line under the actions, e.g. command-line hint or env var doc. */
  footnote?: React.ReactNode
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ title, lead, steps, actions, footnote }) => {
  const { props } = usePage<SharedProps & Record<string, unknown>>()
  const appName = props.app?.name ?? 'MountPad'
  return (
    <S.WelcomeScreenRoot>
      <S.Backdrop aria-hidden />
      <S.Card>
        <S.Mark>
          <Logo size={56} title={appName} />
        </S.Mark>
        <S.Eyebrow>{appName}</S.Eyebrow>
        <S.Title>{title}</S.Title>
        <S.Lead>{lead}</S.Lead>

        {steps && steps.length > 0 && (
          <S.Steps>
            {steps.map((s) => (
              <S.Step key={s.number}>
                <S.StepNumber>{s.number}</S.StepNumber>
                <S.StepBody>
                  <S.StepTitle>{s.title}</S.StepTitle>
                  <S.StepDesc>{s.description}</S.StepDesc>
                </S.StepBody>
              </S.Step>
            ))}
          </S.Steps>
        )}

        <S.Actions>{actions}</S.Actions>
        {footnote && <S.Footnote>{footnote}</S.Footnote>}
      </S.Card>
    </S.WelcomeScreenRoot>
  )
}

WelcomeScreen.displayName = 'WelcomeScreen'
