import type { AppSection } from '../store'

export type LicensePlan = 'demo' | 'basic' | 'pro' | 'pro_max'

export const PLAN_SECTIONS: Record<LicensePlan, AppSection[]> = {
  demo: ['chats', 'quicksend', 'calendar', 'templates'],
  basic: ['chats', 'quicksend', 'calendar', 'templates'],
  pro: [
    'chats',
    'status',
    'quicksend',
    'dashboard',
    'pipeline',
    'broadcast',
    'templates',
    'orders',
    'reminders',
    'calendar',
    'analytics',
    'reports',
    'insights',
  ],
  pro_max: [
    'chats',
    'status',
    'quicksend',
    'dashboard',
    'pipeline',
    'broadcast',
    'templates',
    'orders',
    'reminders',
    'calendar',
    'analytics',
    'reports',
    'insights',
  ],
}

export function normalizePlan(plan?: string | null): LicensePlan {
  const value = String(plan || '').toLowerCase()
  if (value === 'demo' || value === 'basic' || value === 'pro' || value === 'pro_max') return value
  return 'pro_max'
}

export function sectionsForPlan(plan?: string | null): AppSection[] {
  return PLAN_SECTIONS[normalizePlan(plan)]
}

export function canUseSection(plan: string | null | undefined, section: string): section is AppSection {
  return sectionsForPlan(plan).includes(section as AppSection)
}
