import type { TripCategory } from './types';

/**
 * Categories belong to a trip, so every group can add and remove its own.
 * The list below is only the starting set (the database seeds it on trip
 * creation) and the fallback used while the real list is still loading.
 */
export const DEFAULT_CATEGORIES: Omit<TripCategory, 'id' | 'trip_id'>[] = [
  { key: 'lodging',   label: 'לינה',          emoji: '🏨', color: '#5b5bd6', sort_order: 1,  archived: false },
  { key: 'food',      label: 'אוכל ושתייה',   emoji: '🍽️', color: '#d98324', sort_order: 2,  archived: false },
  { key: 'transport', label: 'תחבורה',        emoji: '🚕', color: '#0ea5e9', sort_order: 3,  archived: false },
  { key: 'flights',   label: 'טיסות',         emoji: '✈️', color: '#8b5cf6', sort_order: 4,  archived: false },
  { key: 'activity',  label: 'אטרקציות',      emoji: '🎟️', color: '#10b981', sort_order: 5,  archived: false },
  { key: 'shopping',  label: 'קניות',         emoji: '🛍️', color: '#ec4899', sort_order: 6,  archived: false },
  { key: 'nightlife', label: 'בילויים',       emoji: '🍻', color: '#f43f5e', sort_order: 7,  archived: false },
  { key: 'groceries', label: 'סופר',          emoji: '🛒', color: '#84cc16', sort_order: 8,  archived: false },
  { key: 'health',    label: 'בריאות וביטוח', emoji: '🏥', color: '#ef4444', sort_order: 9,  archived: false },
  { key: 'comms',     label: 'סים ואינטרנט',  emoji: '📱', color: '#06b6d4', sort_order: 10, archived: false },
  { key: 'fees',      label: 'עמלות ומזומן',  emoji: '💱', color: '#a16207', sort_order: 11, archived: false },
  { key: 'other',     label: 'אחר',           emoji: '📦', color: '#64748b', sort_order: 12, archived: false },
];

/** Colours offered when someone adds a category of their own. */
export const CATEGORY_PALETTE = [
  '#5b5bd6', '#d98324', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899',
  '#f43f5e', '#84cc16', '#ef4444', '#06b6d4', '#a16207', '#64748b',
];

export const CATEGORY_EMOJIS = [
  '🏷️', '🎯', '🤿', '⛷️', '🎣', '🎸', '🧺', '🚲', '🐫', '🎿',
  '🧗', '🏄', '🎭', '☕', '🍦', '💊', '🧴', '🎁', '🅿️', '🧳',
];

/** Looks a category up by key, with a safe stand-in for one that was deleted. */
export function findCategory(categories: TripCategory[], key: string): {
  key: string; label: string; emoji: string; color: string;
} {
  const hit = categories.find((c) => c.key === key);
  if (hit) return hit;
  const fallback = DEFAULT_CATEGORIES.find((c) => c.key === key);
  if (fallback) return fallback;
  return { key, label: 'ללא קטגוריה', emoji: '📦', color: '#64748b' };
}

/** Only the categories that should appear in a picker. */
export function pickable(categories: TripCategory[]): TripCategory[] {
  return categories.filter((c) => !c.archived).sort((a, b) => a.sort_order - b.sort_order);
}

/** Turns a Hebrew label into a stable key, falling back to a random suffix. */
export function keyFromLabel(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `c-${slug || 'cat'}-${Math.random().toString(36).slice(2, 6)}`;
}
