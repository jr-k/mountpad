import React from 'react'

import * as S from './styled'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Input: React.FC<InputProps> = ({ label, ...rest }) => {
  if (!label) return <S.Control {...rest} />
  return (
    <S.InputField>
      {label}
      <S.Control {...rest} />
    </S.InputField>
  )
}
