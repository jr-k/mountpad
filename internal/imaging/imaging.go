// Package imaging owns the in-process thumbnail generator used by
// the file-explorer grid to render real previews of image files
// instead of a generic emoji icon. It intentionally keeps the
// surface tiny - one Thumbnail() entry point - so the handler can
// stay focused on HTTP plumbing (ETag / Content-Type / caching).
//
// Supported decoders are wired in via blank imports so callers
// only ever go through the standard image.Decode pipeline. JPEG,
// PNG and GIF come from the standard library; WebP and BMP come
// from x/image. SVG is intentionally not decoded here - the
// frontend points the <img> at /raw directly for SVGs, since
// vector files are already cheap to render at any size.
package imaging

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"

	"golang.org/x/image/draw"

	// Decoder side-effect imports - register handlers with
	// image.RegisterFormat so image.Decode auto-detects the input
	// based on its magic bytes.
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"
)

// ErrUnsupported is returned when image.Decode cannot identify the
// stream as one of the registered formats. Callers map this to a
// 415 / fall back to the emoji icon on the frontend rather than
// surfacing a generic 500.
var ErrUnsupported = errors.New("imaging: unsupported image format")

// MaxThumbDim caps the size param the HTTP handler accepts. 512px
// is a comfortable upper bound: it covers retina grid tiles
// (256px @ 2x) without giving callers room to weaponise the
// endpoint into a CPU sink ("?size=10000" decode at that resolution
// would chew memory pointlessly).
const MaxThumbDim = 512

// Thumbnail decodes the supplied image, scales it down to fit
// inside a maxDim×maxDim box preserving aspect ratio, and encodes
// the result as JPEG (quality 80 - virtually indistinguishable
// from 90 at thumbnail sizes, ~25% smaller payload).
//
// The function NEVER upscales: a tiny 32×32 source comes back
// untouched. Upscaling would just waste bytes (the browser can
// stretch on its own) and add subjective blur that hurts the
// preview's main job - "what is this file?".
//
// maxDim is clamped to the [16, MaxThumbDim] range. Callers can
// pass any positive integer; out-of-range values are silently
// snapped to the bound so a stray "?size=9999" doesn't 400 a
// preview the user just wants to see.
func Thumbnail(src io.Reader, maxDim int) ([]byte, error) {
	if maxDim < 16 {
		maxDim = 16
	}
	if maxDim > MaxThumbDim {
		maxDim = MaxThumbDim
	}

	img, _, err := image.Decode(src)
	if err != nil {
		// image.ErrFormat is returned when nothing registered with
		// image.RegisterFormat matched the magic header. Map it to
		// our sentinel so the handler can pick the right HTTP code.
		if errors.Is(err, image.ErrFormat) {
			return nil, ErrUnsupported
		}
		return nil, fmt.Errorf("decode: %w", err)
	}

	b := img.Bounds()
	srcW, srcH := b.Dx(), b.Dy()
	if srcW <= 0 || srcH <= 0 {
		return nil, fmt.Errorf("decode: empty bounds")
	}

	// Compute the destination box. The longer edge becomes maxDim;
	// the shorter edge scales proportionally. We never go below 1px
	// (a 4096×1 panorama capped at 128 would otherwise round to 0).
	dstW, dstH := srcW, srcH
	if srcW > maxDim || srcH > maxDim {
		if srcW >= srcH {
			dstW = maxDim
			dstH = (srcH * maxDim) / srcW
		} else {
			dstH = maxDim
			dstW = (srcW * maxDim) / srcH
		}
		if dstW < 1 {
			dstW = 1
		}
		if dstH < 1 {
			dstH = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	// CatmullRom gives a noticeably crisper result than ApproxBiLinear
	// at the cost of ~3-4× CPU. For 128×128 thumbnails this is still
	// sub-millisecond on a modern machine and the perceived quality
	// jump is significant - thumbnail rendering is a textbook
	// "spend the CPU once, save it on every paint" scenario.
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 80}); err != nil {
		return nil, fmt.Errorf("encode: %w", err)
	}
	return buf.Bytes(), nil
}
