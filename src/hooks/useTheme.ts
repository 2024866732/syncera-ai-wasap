import { useEffect } from 'react'
import { useStore } from '../store'

export type Theme = 'dark' | 'light' | 'system'

export function applyTheme(theme: Theme) {
  const resolved: 'dark' | 'light' = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme
  document.documentElement.setAttribute('data-theme', resolved)
}

export function useTheme() {
  const { appSettings } = useStore()
  const theme = (appSettings['theme'] as Theme) || 'dark'

  useEffect(() => {
    applyTheme(theme)

    // If theme is "system", react to OS theme changes
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return theme
}
