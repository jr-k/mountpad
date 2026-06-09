import React from 'react'

import * as S from './styled'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string | number; label: string }[]
}

export const Select: React.FC<SelectProps> = ({ label, options, ...rest }) => {
  const control = (
    <S.Control {...rest}>
      {options.map((opt) => (
        <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
      ))}
    </S.Control>
  )
  if (!label) return control
  return <S.SelectField>{label}{control}</S.SelectField>
}
