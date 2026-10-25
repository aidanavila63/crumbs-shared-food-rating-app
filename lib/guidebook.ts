// #168 The walkthrough shown once when you join, and the Guidebook in Settings.

export const TOUR = [
  {
    emoji: '🍜',
    title: 'Welcome to Crumbs',
    text: 'A food map you share with your people. Save places, rate them together and always know where to eat next.',
  },
  {
    emoji: '➕',
    title: 'Add places',
    text: 'Tap + to search a restaurant, paste a map link, or share one into Crumbs from another app. Mark it Been or Want to try.',
  },
  {
    emoji: '⭐',
    title: 'Rate & remember dishes',
    text: 'Open a place to rate it, score each dish, add photos, and leave a private “next time” note for yourself.',
  },
  {
    emoji: '✅',
    title: 'Log visits in seconds',
    text: 'Tap Log when you’re out: what it cost, who came, how it was. Snap the receipt to fill in what you ordered — and split the bill.',
  },
  {
    emoji: '🎲',
    title: 'Can’t decide?',
    text: 'Decide & Plan has Surprise us, Decide together (swipe and match), Decide in 60 seconds and plans everyone can join.',
  },
  {
    emoji: '👥',
    title: 'Your group',
    text: 'See what everyone’s been up to, react and comment, invite people, and set what you get notified about.',
  },
]

export const GUIDE: { title: string; emoji: string; points: string[] }[] = [
  {
    title: 'Places & lists',
    emoji: '📍',
    points: [
      'Search, paste a map link, share from another app, or import from a maps export in Settings → Bring your places.',
      'Filters, sort by nearest and your saved areas (Settings → Your preferences) narrow the list.',
      'Smart lists fill themselves: Top rated, Best value, Hidden gems, Been a while and your vibe tags.',
      'Lists can be trips or food crawls; copy a list to another group from the list itself.',
    ],
  },
  {
    title: 'Rating',
    emoji: '⭐',
    points: [
      'Rate the place, then food, service, vibe and value if you like. “Why?” chips explain a score in one tap.',
      'Score each visit and your rating follows your visits — recent ones count most.',
      'Blind ratings (Settings) hide others’ scores until you’ve rated.',
      'Draft ratings stay private until you post them.',
    ],
  },
  {
    title: 'Dishes & menus',
    emoji: '🍽️',
    points: [
      'Score dishes out of 100; MUST TRY and “skip the…” appear by themselves.',
      'Menu photos and receipts fill the shared menu; tick ✓ to confirm dishes and prices.',
      'Order for the table saves your group’s shareables with prices and splits the cost.',
      'Make it at home turns a dish into a home-cooking meal to compare.',
    ],
  },
  {
    title: 'Deciding & plans',
    emoji: '🎲',
    points: [
      'Surprise us spins the wheel over your want-to-try list.',
      'Decide together: everyone swipes; one veto each; private limits show only the overlap.',
      'Plans have RSVPs, reservation details, a calendar file and a reminder the day before.',
      'After a plan, say if you went and if it was a good pick — suggestions learn from it.',
    ],
  },
  {
    title: 'Home cooking',
    emoji: '🍳',
    points: [
      'Our kitchen keeps your group’s meals and recipes; Everyone’s recipes is what others shared.',
      'Share a recipe on Crumbs to get ratings and tips from everyone.',
    ],
  },
  {
    title: 'Building Crumbs',
    emoji: '🏗️',
    points: [
      'New details you add (hours, phone, Good to know…) earn points; points raise your tier and your daily limits.',
      'Quick questions ask about things Crumbs doesn’t know yet — Yes, No or Snap a picture.',
      'Own a restaurant? Claim it to get Verified by Owner, post specials and see your insights.',
    ],
  },
  {
    title: 'Offline',
    emoji: '📴',
    points: [
      'With no signal you see the copy saved on your phone. Quick logs send themselves later.',
      'Other changes wait as drafts — review and apply them when you’re back online.',
    ],
  },
]

export const TIPS = [
  'Long-press the app icon for Log a visit and Add a place shortcuts.',
  'Type @Name in a comment to notify someone.',
  'Hold the phone over a receipt in Quick log to fill in what you ordered.',
  '“Closed or full?” on a place finds a Plan B nearby.',
  'Wrapped (Profile) is your year in food — great to share in January.',
  'Settings → Remember my last choices pre-fills how you usually log.',
  'Safe for me (Settings) marks dishes that fit your diet — always confirm allergies with the restaurant.',
  'Guests (Group settings) can look around your group without changing anything.',
]

const KEY = 'crumbs-tour-done'
export function tourDone() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}
export function setTourDone(done = true) {
  try {
    if (done) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {}
}
