export const backgroundMediaJobs = new Set<AbortController>();
export function cancelBackgroundMediaJobs() {
  for (const job of backgroundMediaJobs) job.abort();
}
