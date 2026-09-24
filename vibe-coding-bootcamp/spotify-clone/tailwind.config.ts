import type { Config } from 'tailwindcss';

// Colors resolve to CSS variables (see src/styles/tailwind.css) so light/dark
// themes are a single class switch on <html>.
const withAlpha = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('bg'),
        surface: withAlpha('surface'),
        elevated: withAlpha('elevated'),
        border: withAlpha('border'),
        fg: withAlpha('fg'),
        muted: withAlpha('muted'),
        accent: withAlpha('accent'),
        'accent-fg': withAlpha('accent-fg'),
        danger: withAlpha('danger'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        eq: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 180ms ease-out',
        eq: 'eq 900ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
