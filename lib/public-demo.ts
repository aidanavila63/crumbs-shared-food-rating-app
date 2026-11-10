// Demo-mode stand-ins for the public pages (no database): /r/etobicoke/lantern-pho and /u/mayaeats.
import type { PublicProfile, PublicRestaurant } from './public-page'

export const DEMO_RESTAURANT: PublicRestaurant = {
  id: '00000000-0000-0000-0000-00000000d001',
  name: 'Lantern Pho',
  city: 'etobicoke',
  slug: 'lantern-pho',
  claimed: false,
  google_place_id: null,
  cuisine: 'Vietnamese',
  price_level: 2,
  address: '1234 Sample Rd, Etobicoke, ON',
  phone: '(416) 555-0199',
  website: 'https://example.com',
  source_urls: { hours: 'https://example.com/contact', phone: 'https://example.com/contact' },
  source_at: { hours: '2026-11-03T15:00:00Z', phone: '2026-11-03T15:00:00Z' },
  hours: {
    utc: -300,
    periods: [1, 2, 3, 4, 5, 6, 0].map((d) => ({ o: [d, 11, 0], c: [d, 22, 0] })) as never,
  },
  business_status: 'OPERATIONAL',
  lat: 43.65,
  lng: -79.52,
  saved_by_groups: 12,
  rating: { avg: 4.4, groups: 12, ratings: 19, hist: { '5': 10, '4': 6, '3': 2, '2': 1, '1': 0 }, would_return: 92 },
  visits: 31,
  known_for: [
    { reason: 'Great broth', n: 9 },
    { reason: 'Good value', n: 7 },
    { reason: 'Fast', n: 5 },
  ],
  top_dishes: [
    { name: 'Beef pho', points: 94, groups: 11 },
    { name: 'Spring rolls', points: 86, groups: 6 },
    { name: 'Iced coffee', points: 82, groups: 4 },
  ],
  menu: [
    { name: 'Spring rolls', price: 7, course: 'starter', dietary: null, description: 'Shrimp, herbs, peanut sauce', claimed: false },
    { name: 'Beef pho', price: 15.5, course: 'main', dietary: null, description: 'Slow-simmered broth, rare beef', claimed: false },
    { name: 'Vermicelli bowl', price: 16, course: 'main', dietary: null, description: null, claimed: false },
    { name: 'Iced coffee', price: 5, course: 'drink', dietary: null, description: null, claimed: false },
  ],
  spend: { per_head: 22, lunch: 17, dinner: 27 },
  wait: 10,
  busy: [
    { dow: 5, meal: 'dinner', n: 9 },
    { dow: 6, meal: 'dinner', n: 8 },
  ],
  good_to_know: {
    cards: { verdict: true, owner: null },
    tap: { verdict: true, owner: null },
    walk_ins: { verdict: true, owner: null },
    step_free: { verdict: true, owner: null },
  },
  tips: [{ kind: 'entrance', body: 'Door is on the side street, past the bakery.', photo_path: null }],
  posts: [],
}

export const DEMO_PROFILE: PublicProfile = {
  handle: 'mayaeats',
  name: 'Maya',
  avatar_url: null,
  bio: 'Soup first, everything else second.',
  show: { favourites: true, dishes: true, badges: true, map: false, passport: true },
  stats: { places: 87, cuisines: 19, cities: 6, visits: 412 },
  badges: [
    { key: 'soup', label: 'Soup scholar', emoji: '🍜' },
    { key: 'early', label: 'Early bird', emoji: '🌅' },
  ],
  passport: [
    { city: 'Toronto', count: 41 },
    { city: 'Etobicoke', count: 12 },
  ],
  places: [
    { name: 'Lantern Pho', city: 'etobicoke', slug: 'lantern-pho', cuisine: 'Vietnamese', score: 4.7, lat: null, lng: null },
  ],
  dishes: [{ dish: 'Beef pho', restaurant: 'Lantern Pho', city: 'etobicoke', slug: 'lantern-pho' }],
}
