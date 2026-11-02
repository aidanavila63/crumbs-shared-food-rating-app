// #214 Menu PDF queue: reads owners' menu PDFs with the AI allowance that's left at the end of the
// month (so free credit never goes unused), oldest upload first. Server only.
import { generateObject } from 'ai'
import { z } from 'zod'
import type { LimitReport } from './limits'

/** AI budgets whose unused monthly allowance can go to the queue. */
export const AI_KINDS = ['ai', 'menu_import', 'menu_photo_ai', 'menu_pdf']

/** Monthly AI allowance not used yet (sum over the AI budgets that have a monthly total). */
export function leftoverAi(budgets: LimitReport['budgets']) {
  return budgets
    .filter((b) => AI_KINDS.includes(b.kind) && b.monthly_total)
    .reduce((n, b) => n + Math.max(0, (b.monthly_total ?? 0) - b.month), 0)
}

/** The last `days` days of the month (when the queue runs by itself). */
export function isMonthEnd(now = new Date(), days = 3) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return now.getDate() > last - days
}

const schema = z.object({
  dishes: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        price: z.number().nullable(),
        course: z.enum(['starter', 'main', 'side', 'dessert', 'drink']).nullable(),
      }),
    )
    .max(200),
})

/** Reads up to `max` queued PDFs (a few at once, to fit the job's time limit). */
export async function processMenuQueue(db: any, max: number) {
  if (max <= 0) return { read: 0, failed: 0 }
  const { data: files } = await db
    .from('restaurant_menu_files')
    .select('id,path,restaurant_id,restaurants(name)')
    .eq('status', 'queued')
    .order('created_at')
    .limit(Math.min(max, 4))
  let read = 0
  let failed = 0
  await Promise.all(
    (files ?? []).map(async (f: any) => {
      await db.from('restaurant_menu_files').update({ status: 'reading' }).eq('id', f.id)
      try {
        const { data: blob, error } = await db.storage.from('crumbs-menus').download(f.path)
        if (error || !blob) throw new Error('Could not open the PDF')
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const result = await generateObject({
          model: 'openai/gpt-4o-mini',
          schema,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: [
                    `This PDF is the menu of "${String(f.restaurants?.name ?? 'a restaurant').slice(0, 120)}".`,
                    'List every dish with its name exactly as written.',
                    'Price: the number shown for that dish (main size if there are several), else null.',
                    'Description: the short text with the dish, else an empty string.',
                    'Course: starter, main, side, dessert or drink if the section makes it clear, else null.',
                    'Never invent dishes or prices. If it is not a menu, return an empty list.',
                  ].join('\n'),
                },
                { type: 'file', data: bytes, mediaType: 'application/pdf' },
              ],
            },
          ],
        })
        const dishes = result.object.dishes.filter((d) => d.name.trim())
        const { error: saveError } = await db.rpc('import_menu_file', { file: f.id, dishes })
        if (saveError) throw saveError
        read += 1
      } catch (error: any) {
        failed += 1
        await db
          .from('restaurant_menu_files')
          .update({
            status: 'failed',
            error: String(error?.message ?? 'Could not read it').slice(0, 300),
          })
          .eq('id', f.id)
      }
    }),
  )
  // Count what was spent against the "menu_pdf" budget (everyone-together row).
  if (read + failed) {
    const day = new Date().toISOString().slice(0, 10)
    const everyone = '00000000-0000-0000-0000-000000000000'
    const { data: row } = await db
      .from('usage_counts')
      .select('count')
      .eq('kind', 'menu_pdf')
      .eq('day', day)
      .eq('user_id', everyone)
      .maybeSingle()
    await db.from('usage_counts').upsert({
      kind: 'menu_pdf',
      day,
      user_id: everyone,
      count: (row?.count ?? 0) + read + failed,
    })
  }
  return { read, failed }
}
