import styled from 'styled-components'

// MediaPreview hosts the native viewer for image / video / audio /
// pdf files. The root claims the whole editor area (flex: 1, min-*: 0)
// so it can centre images regardless of container size, and so video
// / pdf can stretch corner-to-corner when the user goes fullscreen.
export const MediaRoot = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: ${({ theme }) => theme.color.bg};
`
MediaRoot.displayName = 'MediaPreview.Root'

// Header is the slim banner above the media itself; mirrors the
// HexEditor header so the two preview modes feel like siblings.
export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.bgSubtle};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textMuted};
  font-family: ${({ theme }) => theme.font.mono};
  flex-shrink: 0;
`
Header.displayName = 'MediaPreview.Header'

export const KindBadge = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: ${({ theme }) => theme.color.accent};
`
KindBadge.displayName = 'MediaPreview.KindBadge'

// Body is the scroll/centring container. Images get centred both
// axes; video keeps its native ratio centred at the top; pdf
// stretches via iframe.
export const Body = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[4]};
  background:
    repeating-conic-gradient(
      ${({ theme }) => theme.color.bgSubtle} 0% 25%,
      ${({ theme }) => theme.color.bg} 0% 50%
    );
  background-size: 24px 24px;
`
Body.displayName = 'MediaPreview.Body'

// Image: cap visual size to the body, preserve aspect ratio. The
// drop shadow + faint border lifts it off the checker pattern so
// the edges of light transparent images stay readable.
export const Image = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bgPanel};
  box-shadow: ${({ theme }) => theme.shadow.md};
`
Image.displayName = 'MediaPreview.Image'

export const Video = styled.video`
  max-width: 100%;
  max-height: 100%;
  background: #000;
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: ${({ theme }) => theme.shadow.md};
`
Video.displayName = 'MediaPreview.Video'

// Audio sits in a centred card rather than the corner: a bare
// <audio> control would otherwise float ambiguously inside a huge
// empty body. The card pads it and stacks an icon + filename above
// the transport controls so the panel reads as "this is a track"
// rather than "stray browser widget".
export const AudioCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[6]} ${({ theme }) => theme.space[5]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  box-shadow: ${({ theme }) => theme.shadow.md};
  max-width: 480px;
  width: 100%;
`
AudioCard.displayName = 'MediaPreview.AudioCard'

// Circular badge holding the music-note SVG. Uses the accent
// colour at 12% alpha for the disc so the icon stays visible in
// both themes without us hand-picking colours.
export const AudioIconWrap = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.color.accent}1f;
  color: ${({ theme }) => theme.color.accent};

  & svg {
    width: 32px;
    height: 32px;
  }
`
AudioIconWrap.displayName = 'MediaPreview.AudioIconWrap'

export const AudioTitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.md};
  color: ${({ theme }) => theme.color.text};
  font-weight: 600;
  text-align: center;
  word-break: break-all;
  max-width: 100%;
`
AudioTitle.displayName = 'MediaPreview.AudioTitle'

export const AudioMeta = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`
AudioMeta.displayName = 'MediaPreview.AudioMeta'

// The transport itself. width:100% so the timeline fills the card,
// margin-top:auto so it pins to the bottom of the card if the
// title wraps.
export const AudioPlayer = styled.audio`
  width: 100%;
  margin-top: ${({ theme }) => theme.space[1]};
`
AudioPlayer.displayName = 'MediaPreview.AudioPlayer'

// PDF uses an iframe so we get the browser's built-in viewer
// (search, zoom, page nav, print). The Body wrapper drops its
// padding for pdf to give the iframe edge-to-edge room.
export const PdfBody = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
`
PdfBody.displayName = 'MediaPreview.PdfBody'

export const PdfFrame = styled.iframe`
  width: 100%;
  height: 100%;
  border: 0;
  background: ${({ theme }) => theme.color.bgPanel};
`
PdfFrame.displayName = 'MediaPreview.PdfFrame'

// FallbackError is shown when an image fails to decode or a video
// errors out (codec not supported by the browser, file truncated,
// etc.). Keeps the layout stable instead of leaving an empty white
// rectangle.
export const FallbackError = styled.div`
  padding: ${({ theme }) => theme.space[5]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bgPanel};
  border: 1px solid ${({ theme }) => theme.color.border};
  color: ${({ theme }) => theme.color.textMuted};
  font-size: ${({ theme }) => theme.font.size.sm};
  max-width: 480px;
  text-align: center;

  & strong {
    display: block;
    margin-bottom: 4px;
    color: ${({ theme }) => theme.color.text};
    font-size: ${({ theme }) => theme.font.size.md};
  }
`
FallbackError.displayName = 'MediaPreview.FallbackError'
