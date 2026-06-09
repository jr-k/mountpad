import React from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'

import * as S from './styled'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  destructive, onConfirm, onCancel,
}) => (
  <Modal
    open={open}
    title={title}
    onClose={onCancel}
    footer={
      <>
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>
    }
  >
    <S.Body>{message}</S.Body>
  </Modal>
)
