import React from 'react'

import * as S from './styled'

interface ErrorStateProps {
  title?: string
  description?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  description,
}) => (
  <S.ErrorStateRoot>
    <div>
      <S.Title>{title}</S.Title>
      {description && <S.Desc>{description}</S.Desc>}
    </div>
  </S.ErrorStateRoot>
)
