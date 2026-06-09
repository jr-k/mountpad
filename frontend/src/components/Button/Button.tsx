import React from 'react'

import * as S from './styled'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...rest
}) => {
  return <S.ButtonRoot $variant={variant} $size={size} type={type} {...rest} />
}
