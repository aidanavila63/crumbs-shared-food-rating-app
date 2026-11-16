// Round 77 (E23): each scheduled chore writes one row in job_runs (Admin → Last runs), so a job
// that stopped running, or keeps failing, shows up instead of going quiet. Before the Round 77 SQL
// has run there's no table: the chore still runs, it just isn't recorded.
import { logServerError } from '@/lib/server-errors'

export { JOB_LATE_HOURS, jobIsLate } from '@/lib/jobs-shared'

/** Runs one chore, records it, and answers with what it returned (or its error). */
export async function recordJob(
  db: any,
  job: string,
  work: () => Promise<Record<string, unknown>>,
): Promise<Response> {
  const { data: run } = await db
    .from('job_runs')
    .insert({ job })
    .select('id')
    .maybeSingle()
    .then(
      (r: any) => r,
      () => ({ data: null }),
    )
  try {
    const detail = await work()
    if (run?.id)
      await db
        .from('job_runs')
        .update({ finished_at: new Date().toISOString(), ok: !detail.failed, detail })
        .eq('id', run.id)
    return Response.json(detail)
  } catch (error: any) {
    const message = String(error?.message ?? error ?? 'failed').slice(0, 300)
    if (run?.id)
      await db
        .from('job_runs')
        .update({ finished_at: new Date().toISOString(), ok: false, detail: { error: message } })
        .eq('id', run.id)
    await logServerError(`job ${job}`, error)
    return Response.json({ error: message }, { status: 500 })
  }
}
