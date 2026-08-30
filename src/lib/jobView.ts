import type { JobRow } from "./db";

/** Strip server-side paths and add the URLs the client actually needs. */
export function publicJob(job: JobRow, includeText = false) {
  const { output_file, text, ...rest } = job;
  return {
    ...rest,
    ...(includeText ? { text } : {}),
    audioUrl: output_file ? `/api/jobs/${job.id}/audio` : null,
    downloadUrl: output_file ? `/api/jobs/${job.id}/audio?download=1` : null,
    srtUrl: job.has_subs ? `/api/jobs/${job.id}/subtitles` : null,
  };
}
