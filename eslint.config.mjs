import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'next-env.d.ts'] },
  {
    rules: {
      // Supabase rows are loosely typed throughout.
      '@typescript-eslint/no-explicit-any': 'off',
      // Deliberate here: loading data, resetting on sign-out, syncing forms to partner edits.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]
export default config
