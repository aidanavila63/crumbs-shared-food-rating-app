import { WORDMARK_ASPECT, WORDMARK_DATA_URI } from './og-wordmark'

// The share card a /r/… link shows in chats and feeds (1200×630). Kept apart from the route so it
// can be drawn in a test without the database.
export type ShareCard = { name: string; meta: string | null; score: string | null; known?: string | null }

export function shareCard({ name, meta, score, known }: ShareCard) {
  return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#FBF4E8',
          color: '#1C2A23',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- share images are drawn, not served */}
        <img src={WORDMARK_DATA_URI} alt="" height={60} width={Math.round(60 * WORDMARK_ASPECT)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: name.length > 28 ? 76 : 96, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          {meta ? <div style={{ fontSize: 40, color: '#5F6E65' }}>{meta}</div> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 38 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {score ? <div style={{ color: '#7B2D5B', fontWeight: 700 }}>{`Rated ${score}`}</div> : null}
            {known ? <div style={{ color: '#C9752A' }}>{`Known for ${known.slice(0, 40)}`}</div> : null}
          </div>
          <div style={{ color: '#5F6E65', fontSize: 30 }}>Shared food ratings</div>
        </div>
      </div>
  )
}
