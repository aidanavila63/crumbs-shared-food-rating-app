'use client'
import { useState } from 'react'
import { MessageCircle, Send, SmilePlus } from 'lucide-react'
import { REACTION_EMOJI, useSocial } from '@/hooks/use-social'
import { haptic } from '@/lib/motion'

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * #11 Reactions + comments under a rating or feed item. Shows the emoji everyone used, a
 * picker, and a small comment thread that opens with a tap.
 */
export function ReactionBar({ target, names }: { target: string; names: Record<string, string> }) {
  const social = useSocial()
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  if (!social?.enabled) return null
  const mine = social.userId
  const here = social.reactions.filter((r) => r.target === target)
  const thread = social.comments.filter((c) => c.target === target)
  const counts = REACTION_EMOJI.map((emoji) => ({
    emoji,
    users: here.filter((r) => r.emoji === emoji).map((r) => r.user_id),
  })).filter((item) => item.users.length)

  function react(emoji: string) {
    haptic('select')
    social!.toggleReaction(target, emoji)
    setPicking(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {counts.map(({ emoji, users }) => (
          <button
            key={emoji}
            className={`reaction-pill ${users.includes(mine ?? '') ? 'reaction-mine' : ''}`}
            aria-label={`${emoji} from ${users.map((u) => (u === mine ? 'you' : (names[u] ?? 'someone'))).join(', ')}`}
            onClick={() => react(emoji)}
          >
            <span key={users.length} className="reaction-pop">
              {emoji}
            </span>
            {users.length > 1 && <span>{users.length}</span>}
          </button>
        ))}
        {picking ? (
          <span className="reaction-picker" role="group" aria-label="Pick a reaction">
            {REACTION_EMOJI.map((emoji, i) => (
              <button
                key={emoji}
                style={{ animationDelay: `${i * 30}ms` }}
                aria-label={`React ${emoji}`}
                onClick={() => react(emoji)}
              >
                {emoji}
              </button>
            ))}
          </span>
        ) : (
          <button
            className="reaction-add"
            aria-label="Add a reaction"
            onClick={() => setPicking(true)}
          >
            <SmilePlus size={16} />
          </button>
        )}
        <button
          className="reaction-add gap-1 !w-auto px-2 text-xs"
          aria-expanded={open}
          aria-label={thread.length ? `${thread.length} comments` : 'Comment'}
          onClick={() => setOpen(!open)}
        >
          <MessageCircle size={15} />
          {thread.length > 0 && thread.length}
        </button>
      </div>
      {open && (
        <div className="comment-thread flex flex-col gap-1.5">
          {thread.map((comment) => (
            <p key={comment.id} className="text-sm">
              <strong>
                {comment.user_id === mine ? 'You' : (names[comment.user_id] ?? 'Someone')}
              </strong>{' '}
              {comment.body}{' '}
              <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
              {comment.user_id === mine && (
                <button
                  className="ml-2 text-xs text-muted-foreground underline"
                  onClick={() => social.removeComment(comment.id)}
                >
                  Delete
                </button>
              )}
            </p>
          ))}
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault()
              if (await social.addComment(target, draft)) {
                haptic('tap')
                setDraft('')
              }
            }}
          >
            <input
              className="field !min-h-10 !py-2 text-sm"
              aria-label="Write a comment"
              placeholder="Say something…"
              maxLength={500}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              className="primary !min-h-10 !px-3"
              aria-label="Send comment"
              disabled={!draft.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
