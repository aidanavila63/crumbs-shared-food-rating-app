import { generateObject } from 'ai'
import { z } from 'zod'

const schema = z.object({ dishes: z.array(z.object({ name: z.string(), description: z.string(), price: z.number().nullable() })).max(12) })
export async function POST(request: Request) {
  const { name, address } = await request.json()
  if (!name) return Response.json({ error: 'Restaurant name is required' }, { status: 400 })
  const result = await generateObject({ model: 'openai/gpt-4o-mini', schema, prompt: `Suggest a concise menu for ${name}${address ? ` at ${address}` : ''}. Only include dishes this restaurant is plausibly known for. Mark these as suggestions in the UI.` })
  return Response.json(result.object)
}
