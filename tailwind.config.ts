import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        surface: 'var(--surface)',
        soft: 'var(--soft)',
        shell: 'var(--shell)',
        focus: 'var(--focus)',
        coral: { DEFAULT: 'var(--coral)', base: 'var(--coral-base)' },
        pink: { DEFAULT: 'var(--pink)', base: 'var(--pink-base)' },
        cream: { DEFAULT: 'var(--cream)', base: 'var(--cream-base)' },
        mint: { DEFAULT: 'var(--mint)', base: 'var(--mint-base)' },
        sky: { DEFAULT: 'var(--sky)', base: 'var(--sky-base)' },
        lilac: { DEFAULT: 'var(--lilac)', base: 'var(--lilac-base)' },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
        display: ['Georgia', '"Noto Serif SC"', 'serif'],
      },
      boxShadow: {
        toy: 'var(--shadow)',
      },
      maxWidth: {
        page: '1180px',
      },
      transitionDuration: {
        press: '110ms',
      },
    },
  },
  plugins: [],
}

export default config
