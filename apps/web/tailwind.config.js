/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: '#fbf7f1',
          100: '#f5efe4',
          200: '#ebe3d2',
          300: '#d9cdb3',
          400: '#b8a889',
          500: '#8a7a5d',
          600: '#5e5240',
          700: '#3d352a',
          800: '#2a251e',
          900: '#1a1713',
        },
        vesper: {
          50: '#f3f1fb',
          100: '#e5e1f5',
          200: '#c8c0ea',
          300: '#a396d8',
          400: '#7a6bc0',
          500: '#5849a2',
          600: '#453780',
          700: '#362a63',
          800: '#261d47',
          900: '#17112c',
        },
        dawn: {
          50: '#fdf7e7',
          100: '#f9ebc1',
          200: '#f2d98a',
          300: '#e6bd4d',
          400: '#c89a28',
          500: '#a67b15',
          600: '#7d5c0e',
        },
        sage: { 100: '#e3ebe0', 300: '#9db494', 500: '#5e7a54' },
        ember: {
          50: '#fbeee9',
          100: '#f5d8cd',
          300: '#d98a70',
          500: '#b4442a',
          600: '#8f2f1c',
        },
        warm: {
          50: '#fdf4e0',
          100: '#f8e3ad',
          300: '#e2b352',
          500: '#a2781c',
        },
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia Fallback', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Helvetica', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        'warm-xs': '0 1px 2px 0 rgba(42, 37, 30, 0.04)',
        'warm-sm': '0 1px 2px 0 rgba(42, 37, 30, 0.05), 0 1px 3px 0 rgba(42, 37, 30, 0.06)',
        'warm-md': '0 4px 6px -2px rgba(42, 37, 30, 0.05), 0 2px 4px -2px rgba(42, 37, 30, 0.06)',
        'warm-lg': '0 10px 15px -3px rgba(42, 37, 30, 0.07), 0 4px 6px -4px rgba(42, 37, 30, 0.08)',
      },
      maxWidth: { feed: '720px', detail: '720px' },
      animation: {
        'check-bloom': 'checkBloom 360ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-down': 'slideDown 260ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        checkBloom: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
