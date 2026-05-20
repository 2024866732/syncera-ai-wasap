/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme colors (CSS variables — switch dark/light via data-theme attr)
        bg: {
          primary:   'rgb(var(--bg-primary)   / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--bg-tertiary)  / <alpha-value>)',
          hover:     'rgb(var(--bg-hover)     / <alpha-value>)',
          active:    'rgb(var(--bg-active)    / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border)       / <alpha-value>)',
          light:   'rgb(var(--border-light) / <alpha-value>)',
        },
        text: {
          primary:   'rgb(var(--text-primary)   / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted:     'rgb(var(--text-muted)     / <alpha-value>)',
        },
        // Brand accents — same for both themes (always vibrant)
        accent: {
          green:        '#25D366',
          'green-dark': '#128C7E',
          blue:         '#58A6FF',
          purple:       '#BC8CFF',
          orange:       '#F78166',
        },
        status: {
          success: '#3FB950',
          warning: '#D29922',
          danger:  '#F85149',
          info:    '#58A6FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-dot': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-soft': 'pulseSoft 4s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-up': 'slideInUp 0.2s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'typing': 'typing 1.4s infinite',
        'sidebar-collapse': 'sidebarCollapse 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sidebar-expand':   'sidebarExpand 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%':      { opacity: '0.8', transform: 'scale(1.04)' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        slideInUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        typing: {
          '0%, 60%, 100%': { transform: 'translateY(0)' },
          '30%':           { transform: 'translateY(-6px)' },
        },
        sidebarCollapse: {
          from: { width: '340px', opacity: '1' },
          to:   { width: '60px',  opacity: '1' },
        },
        sidebarExpand: {
          from: { width: '60px',  opacity: '1' },
          to:   { width: '340px', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
