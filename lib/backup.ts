// #89 Automatic backups: once a week every Crumbs table is saved as one compressed JSON file in
// a private storage bucket, newest 8 kept (~2 months). Runs from a scheduled job; needs the
// server key. Photos stay where they are (they're files already); sign-in accounts are kept by
// the database host.
export const BACKUP_BUCKET = 'crumbs-backups'
export const KEEP_BACKUPS = 8

/** Tables worth restoring. EVERY table must be named here or in NOT_BACKED_UP below — a test
 * (tests/backup.test.ts) reads the SQL files and fails when a new table is in neither list.
 * (Found Nov 15: 13 tables holding real data were in neither list and were silently skipped.) */
export const BACKUP_TABLES = [
  'profiles',
  'private_places',
  'profile_picks',
  'handle_reservations',
  'blocked_handle_words',
  'access_requests',
  'groups',
  'group_members',
  'group_join_requests',
  'group_locations',
  'places',
  'place_ratings',
  'place_private_notes',
  'place_visits',
  'place_facts',
  'dishes',
  'dish_ratings',
  'lists',
  'list_places',
  'list_shares',
  'home_meals',
  'home_meal_ratings',
  'home_meal_cooks',
  'recipe_saves',
  'activity',
  'reactions',
  'comments',
  'plans',
  'plan_rsvps',
  'swipe_sessions',
  'swipe_votes',
  'restaurants',
  'restaurant_slugs',
  'restaurant_reservations',
  'restaurant_question_skips',
  'dish_of_week',
  'restaurant_dishes',
  'restaurant_dish_votes',
  'restaurant_dish_prices',
  'restaurant_facts',
  'restaurant_claims',
  'restaurant_managers',
  'contribution_points',
  'menu_contributions',
  'menu_counts',
  'point_rules',
  'usage_budgets',
  'feature_flags',
  'feedback',
  'admin_alerts',
  'recipe_reviews',
  'table_orders',
  'swipe_limits',
  'group_goals',
  'restaurant_posts',
  'restaurant_menu_files',
  'restaurant_attr_votes',
  'restaurant_tips',
  'restaurant_tip_votes',
  'waitlist',
  'crumbs_migrations',
] as const

/** Left out on purpose: they rebuild themselves, or (push keys) are no use once restored. */
export const NOT_BACKED_UP = [
  'site_read_cache', // what a restaurant's website said last time: read again when needed
  'menu_read_cache', // same, for menus
  'usage_counts', // today's allowance counters
  'push_subscriptions', // phones' notification keys: each phone signs up again by itself
  'client_errors', // the last 500 app errors
] as const

/** crumbs-2026-10-26.json.gz */
export const backupName = (when: Date) => `crumbs-${when.toISOString().slice(0, 10)}.json.gz`

/** Which old backups to delete so only the newest `keep` remain. */
export function oldBackups(names: string[], keep = KEEP_BACKUPS) {
  return names
    .filter((n) => /^crumbs-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n))
    .sort()
    .reverse()
    .slice(keep)
}
