// Round 78: sending Crumbs' few emails (the drafts in lib/legal-text.ts: none is marketing).
// Uses Resend (free: 3,000 a month, 100 a day) when RESEND_API_KEY and EMAIL_FROM are set in
// Vercel (EMAIL_FROM like "Crumbs <hello@your-domain>", on a domain verified in Resend). Without
// them nothing is sent and the caller gets the text back to send by hand. Server only.
const FOOTER = '\n\n—\nCrumbs is run by Aidan Avila in Toronto. Questions: crumbs.foodapp@gmail.com'

export const emailReady = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const body = text + FOOTER
  if (!emailReady()) return { sent: false as const, subject, body }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text: body }),
  })
  if (!response.ok) throw new Error(`Email not sent (${response.status})`)
  return { sent: true as const, subject, body }
}

/** Draft 2: the one waitlist email. */
export function waitlistInvitation(link: string) {
  return {
    subject: 'Your spot on Crumbs is ready',
    text: `You asked to be told when Crumbs had room. It now does!\n\nStart here: ${link}\n\nCrumbs is a place to keep track of where you eat, on your own or with people you choose. This is the only email you'll get from the waitlist, and your address has now been removed from it.`,
  }
}
