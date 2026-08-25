import React from 'react'
import { BITS, toggleBit } from '@/lib/permissions'

import * as S from './styled'

interface PermissionMatrixProps {
  mode: number
  onChange: (next: number) => void
  /**
   * When true, the matrix renders the current mode but every cell is a
   * non-interactive, visually muted button. Use it whenever the viewing
   * user lacks chmod rights so they understand the current ACL without
   * being able to mutate it.
   */
  disabled?: boolean
}

const ROWS: { label: string; bits: [number, number, number] }[] = [
  { label: 'User',   bits: [BITS.UR, BITS.UW, BITS.UX] },
  { label: 'Group',  bits: [BITS.GR, BITS.GW, BITS.GX] },
  { label: 'Others', bits: [BITS.OR, BITS.OW, BITS.OX] },
]
const PERMISSIONS = ['read', 'write', 'execute'] as const

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ mode, onChange, disabled = false }) => (
  <S.PermissionMatrixRoot role="group" aria-label="Permission mode">
    <S.HeaderCell />
    <S.HeaderCell>Read</S.HeaderCell>
    <S.HeaderCell>Write</S.HeaderCell>
    <S.HeaderCell>Execute</S.HeaderCell>

    {ROWS.map((row) => (
      <React.Fragment key={row.label}>
        <S.RowLabel>{row.label}</S.RowLabel>
        {row.bits.map((bit, idx) => (
          <S.Cell
            key={bit}
            type="button"
            $on={(mode & bit) !== 0}
            aria-label={`${row.label} ${PERMISSIONS[idx]}`}
            aria-pressed={(mode & bit) !== 0}
            disabled={disabled}
            onClick={() => onChange(toggleBit(mode, bit))}
          >
            {['r', 'w', 'x'][idx]}
          </S.Cell>
        ))}
      </React.Fragment>
    ))}
  </S.PermissionMatrixRoot>
)
