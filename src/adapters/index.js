import { netflix } from './netflix.js';
import { disney } from './disney.js';

export const adapters = [netflix, disney];

export function pickAdapter(loc = location) {
  return adapters.find((a) => a.matches(loc)) || null;
}
