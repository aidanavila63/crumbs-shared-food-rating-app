// The web-push library, the same way for version 3 (older CommonJS: everything hangs off a default
// export) and version 4 (ES module: named exports only, no default). Round 85: version 4 broke
// `import webpush from 'web-push'` — the build only warned, and push notifications would have
// stopped working on the live site.
import * as webpushModule from 'web-push'

type WebPush = typeof import('web-push')
export const webpush: WebPush = ((webpushModule as unknown as { default?: WebPush }).default ??
  webpushModule) as WebPush
