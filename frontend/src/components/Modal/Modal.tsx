import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

import { pushModal, popModal, isTopModal } from '@/lib/modalStack'

import * as S from './styled'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  footer?: React.ReactNode
  children: React.ReactNode
  /**
   * Optional submit handler. When provided, the modal wraps its body
   * + footer in a `<form>`, so pressing Enter inside any input triggers
   * this callback - same effect as clicking the primary action button.
   * Useful for short forms (rename, create file/folder, reset password)
   * where Enter is the user's natural confirmation gesture.
   */
  onSubmit?: () => void
  /**
   * Dialog width. `md` (default, 520px) for short forms;
   * `lg` (720px) for content that needs horizontal room
   * (folder pickers, permission matrices, etc.). Pick `lg`
   * whenever the body would otherwise overflow horizontally
   * - the Body has `overflow-y: auto`, which the CSS spec
   * promotes to auto on the X axis too, so any overflow shows
   * up as an unsightly inner scrollbar.
   */
  size?: 'md' | 'lg'
}

/**
 * Modal renders into a portal on `document.body` so it always covers the
 * whole viewport, regardless of where it's mounted in the React tree.
 *
 * Without the portal the overlay would inherit:
 *   - any `width / max-width` set by the parent on `& > *` (common in our
 *     settings-page layout, which caps direct children at 1100px),
 *   - the containing block of any transformed/filtered ancestor (CSS rule:
 *     a transformed ancestor becomes the containing block for
 *     position: fixed descendants), breaking `inset: 0`.
 * Portalling to body sidesteps both classes of bug.
 */
export const Modal: React.FC<ModalProps> = ({ open, title, onClose, footer, children, onSubmit, size = 'md' }) => {
  // While the modal is open we (a) own Escape to close ourselves -
  // but only when we are the topmost dialog (otherwise stacked
  // modals would all dismiss in a single keystroke instead of peeling
  // off one at a time) - and (b) raise the shared "any modal open"
  // gate so window-level shortcuts elsewhere in the app
  // (DirectoryView arrow navigation, the Cmd+S save shortcut, …)
  // stop firing for keys typed inside the dialog. The stack survives
  // nested modals correctly: push on mount, pop on unmount, in
  // symmetric pairs.
  useEffect(() => {
    if (!open) return
    const id = pushModal()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!isTopModal(id)) return
      // stopPropagation isn't enough here: every open modal's effect
      // attaches its OWN window-level listener and they all fire on
      // the same event, regardless of registration order. Guarding
      // with isTopModal is the only way to keep the close to a
      // single dialog per Escape.
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      popModal(id)
    }
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined') return null

  // When the caller provides `onSubmit`, wrap the content in a real
  // <form>. `display: contents` keeps the existing dialog grid intact,
  // and a visually-hidden submit button guarantees Enter triggers
  // submission even when several inputs share the form (browsers only
  // auto-submit single-input forms by default).
  const body = (
    <>
      <S.Body>{children}</S.Body>
      {footer && <S.Footer>{footer}</S.Footer>}
    </>
  )

  return createPortal(
    <S.ModalOverlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <S.Dialog $width={size} role="dialog" aria-modal="true" aria-label={title}>
        <S.Header>{title}</S.Header>
        {onSubmit ? (
          <S.Form
            onSubmit={(e) => { e.preventDefault(); onSubmit() }}
          >
            <button
              type="submit"
              aria-hidden
              tabIndex={-1}
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0 }}
            />
            {body}
          </S.Form>
        ) : body}
      </S.Dialog>
    </S.ModalOverlay>,
    document.body,
  )
}
