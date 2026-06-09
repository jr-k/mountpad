import React from 'react'

interface LogoProps {
  size?: number
  color?: string
  title?: string
}

/**
 * MountPad mark: square brackets enclosing a forward slash.
 *   [ / ]
 * The brackets evoke a mount/scope; the slash evokes a filesystem path.
 * Drawn with rounded caps and balanced negative space so it scales cleanly
 * from a 16px favicon to a 96px hero.
 */
export const Logo: React.FC<LogoProps> = ({ size = 32, color = 'currentColor', title = 'MountPad' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* left bracket */}
      <path
        d="M14 7 H7 V41 H14"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* right bracket */}
      <path
        d="M34 7 H41 V41 H34"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* forward slash */}
      <path
        d="M30 11 L18 37"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  )
}

Logo.displayName = 'Logo'
