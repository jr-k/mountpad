import React, { useState } from 'react'
import * as S from './styled'

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf'

// Inline music-note SVG so the audio card carries some identity
// instead of just a stray browser transport widget.
const MusicNoteIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
       strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)

interface MediaPreviewProps {
  /** Absolute or root-relative URL of the file to render. */
  src: string
  /** Display name, shown in the header and in audio captions. */
  fileName: string
  /** Classification driving which native element renders the file. */
  kind: MediaKind
  /** Size in bytes; surfaced in the header for context. */
  size?: number
}

const fmtBytes = (n?: number): string => {
  if (typeof n !== 'number' || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`
}

/**
 * MediaPreview renders an image, video, audio or PDF file inline
 * using the browser's native viewer, pointed at the backend's /raw
 * endpoint. Replaces the hex preview when the listing classifies the
 * file as media. The component is intentionally dumb: any decode
 * error from the underlying element falls back to a "cannot
 * preview" card instead of exploding the layout.
 */
export const MediaPreview: React.FC<MediaPreviewProps> = ({ src, fileName, kind, size }) => {
  const [failed, setFailed] = useState(false)

  const header = (
    <S.Header>
      <S.KindBadge>{kind}</S.KindBadge>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fileName}
      </span>
      {size != null && <span>· {fmtBytes(size)}</span>}
    </S.Header>
  )

  if (kind === 'pdf') {
    return (
      <S.MediaRoot>
        {header}
        <S.PdfBody>
          <S.PdfFrame src={src} title={fileName} />
        </S.PdfBody>
      </S.MediaRoot>
    )
  }

  if (failed) {
    return (
      <S.MediaRoot>
        {header}
        <S.Body>
          <S.FallbackError>
            <strong>Cannot preview this file</strong>
            The browser refused to decode it (unsupported codec, corrupted bytes,
            or a format mismatch). Try downloading it instead.
          </S.FallbackError>
        </S.Body>
      </S.MediaRoot>
    )
  }

  return (
    <S.MediaRoot>
      {header}
      <S.Body>
        {kind === 'image' && (
          <S.Image
            src={src}
            alt={fileName}
            loading="eager"
            onError={() => setFailed(true)}
          />
        )}
        {kind === 'video' && (
          <S.Video
            src={src}
            controls
            preload="metadata"
            onError={() => setFailed(true)}
          />
        )}
        {kind === 'audio' && (
          <S.AudioCard>
            <S.AudioIconWrap>
              <MusicNoteIcon />
            </S.AudioIconWrap>
            <S.AudioTitle>{fileName}</S.AudioTitle>
            {size != null && <S.AudioMeta>Audio · {fmtBytes(size)}</S.AudioMeta>}
            <S.AudioPlayer
              src={src}
              controls
              preload="metadata"
              onError={() => setFailed(true)}
            />
          </S.AudioCard>
        )}
      </S.Body>
    </S.MediaRoot>
  )
}
