// #89 Automatic backups: once a week every Crumbs table is saved as one compressed JSON file in
// a private storage bucket, newest 8 kept (~2 months). Runs from a scheduled job; needs the
// server key. Photos stay where they are (they're files already); sign-in accounts are kept by
// the database host.
export const BACKUP_BUCKET = 'crumbs-backups'
export const KEEP_BACKUPS = 8

/** Tables worth restoring (not caches, counters or phone push keys). */
export const BACKUP_TABLES = [
  'profiles',
  'groups',
  'group_members',
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
  'activity',
  'reactions',
  'comments',
  'plans',
  'plan_rsvps',
  'swipe_sessions',
  'swipe_votes',
  'restaurants',
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
