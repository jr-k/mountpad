import React from 'react'

import * as S from './styled'

interface LoadingStateProps {
  label?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label }) => (
  <S.LoadingStateRoot>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <S.Spinner />
      {label && <span>{label}</span>}
    </div>
  </S.LoadingStateRoot>
)
