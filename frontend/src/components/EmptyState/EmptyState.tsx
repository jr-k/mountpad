import React from 'react'

import * as S from './styled'

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <S.EmptyStateRoot>
    <div>
      <S.Title>{title}</S.Title>
      {description && <S.Desc>{description}</S.Desc>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  </S.EmptyStateRoot>
)
