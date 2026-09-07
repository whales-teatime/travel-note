export type LocalPlanSummary = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
};

const RECENT_KEY = 'travel-note-recent-plans-v1';
const FAVORITES_KEY = 'travel-note-favorite-plans-v1';
const MAX_RECENT = 8;
const MAX_FAVORITES = 40;

function read(key: string, limit: number) {
  if (typeof window === 'undefined') return [] as LocalPlanSummary[];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalPlanSummary => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string' && typeof value.title === 'string' && typeof value.destination === 'string'
        && typeof value.startDate === 'string' && typeof value.endDate === 'string' && typeof value.people === 'number';
    }).slice(0, limit);
  } catch { return []; }
}

function write(key: string, items: LocalPlanSummary[], limit: number) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(items.slice(0, limit))); } catch { /* Storage can be unavailable in private browsing. */ }
}

export function readRecentPlans() { return read(RECENT_KEY, MAX_RECENT); }
export function readFavoritePlans() { return read(FAVORITES_KEY, MAX_FAVORITES); }

export function rememberPlanVisit(plan: LocalPlanSummary) {
  const next = [plan, ...readRecentPlans().filter(item => item.id !== plan.id)];
  write(RECENT_KEY, next, MAX_RECENT);
}

export function togglePlanFavorite(plan: LocalPlanSummary) {
  const current = readFavoritePlans();
  const exists = current.some(item => item.id === plan.id);
  write(FAVORITES_KEY, exists ? current.filter(item => item.id !== plan.id) : [plan, ...current], MAX_FAVORITES);
  return !exists;
}
