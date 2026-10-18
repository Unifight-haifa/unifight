import venues from '../../content/venues.json';
import { activeChanges, checkChanges, jerusalemToday } from './schedule-changes.mjs';

const byName = (g: Record<string, unknown>) => Object.entries(g).map(([p, v]) => [p.split('/').pop()!, v] as [string, any]);
const files = import.meta.glob('../../content/schedule-changes/*.json', { eager: true, import: 'default' });
export const schedules = Object.fromEntries(
  byName(import.meta.glob('../../content/schedule/*.json', { eager: true, import: 'default' })).map(([f, s]) => [f.slice(0, -5), s]),
);
export { venues };

export const TODAY = jerusalemToday();
// a bad file fails the build; expired changes never reach the HTML (the daily CI rebuild drops them)
export const CHANGES = activeChanges(checkChanges(byName(files), schedules, venues), TODAY);
