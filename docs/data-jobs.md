# Data batch jobs (field-partner bulk ingest)

Field partners collect data in bulk — folders of photos plus KoboToolbox CSV
exports whose columns vary between organisations. Those archives (5–10GB) are
far too large for the normal in-app upload flows, so they are submitted as
**jobs**: the zip goes straight from the partner's browser to object storage,
and the GainForest team reviews each batch remotely before publishing the
observations to the partner's account with their permission.

## Moving parts

| Piece | Where |
|---|---|
| Partner submit page | `app/submit-data/` |
| Owner API (create / list / presign parts / complete / cancel) | `app/api/jobs/**` |
| Admin tab ("Data batches" on `/admin`) | `app/admin/_components/AdminDataJobsPanel.tsx` |
| Admin API (status, note, download link, remote zip inspection) | `app/api/admin/jobs/**` |
| Job model + agent-key custody | `app/_lib/data-jobs.ts`, `app/_lib/data-jobs-shared.ts` |
| Minimal SigV4 S3 client (no SDK dependency) | `app/_lib/s3-storage.ts` (+ `.test.ts`) |

## How an upload works

1. `POST /api/jobs` registers the job. On the partner's **first** submission
   the form requires a plain-language consent checkbox; the server then mints
   a regular GainForest agent key (`gf_pat_…`) named
   `DATA_JOBS_AGENT_KEY_NAME` ("Batch uploads — GainForest team") via the
   central auth service — the same mechanism Tainá uses. The key is stored
   AES-256-GCM-encrypted in the bucket (`agent-keys/{did}.json`); revoking it
   in Settings → AI agent keys instantly disables publishing.
2. The server opens a multipart upload and the browser PUTs 64MB parts
   directly to the bucket with presigned URLs (4 in parallel, 3 retries each,
   fresh URL per attempt). Vercel's ~4.5MB body limit is never involved.
3. `POST /api/jobs/{id}/complete` assembles the archive and flips the job to
   `received`. Statuses: `uploading → received → inReview → published |
   needsAttention` (admin-driven after `received`).

Bucket layout: `jobs/{jobId}/archive.zip`, `meta/{jobId}.json`,
`by-user/{did}/{jobId}`, `agent-keys/{did}.json`. There is no database — the
bucket is the source of truth.

## Remote inspection (no 10GB downloads)

Zip central directories sit at the end of the file, so
`GET /api/admin/jobs/{id}/contents` lists the whole archive with a few HTTP
range reads (`@zip.js/zip.js` `HttpRangeReader` over a presigned URL), and
`?path=…` extracts a single CSV for preview. Team agents can do the same with
any S3 client / `rclone` against a presigned or credentialed URL, then publish
via the canonical `/skill.md` flow using the submitter's stored agent key
(`readStoredAgentKey`). Never build a bespoke upload endpoint for this.

## Configuration

```
DATA_JOBS_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DATA_JOBS_S3_BUCKET=gainforest-data-jobs
DATA_JOBS_S3_ACCESS_KEY_ID=…
DATA_JOBS_S3_SECRET_ACCESS_KEY=…
DATA_JOBS_S3_REGION=auto            # optional, default "auto"
DATA_JOBS_KEY_SECRET=…              # required in production (agent-key encryption)
```

Cloudflare R2 is the intended target (S3-compatible, zero egress fees — the
team re-reads these archives a lot), but any S3 API works. When the env vars
are missing the feature degrades gracefully: the submit page shows a
"not available" notice and the admin tab reports storage as unconfigured.

### Bucket CORS (required)

Browser part uploads must be able to read the `ETag` response header:

```json
[
  {
    "AllowedOrigins": ["https://www.gainforest.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your dev origin (e.g. `http://localhost:3040`) for local testing.

### Recommended lifecycle rules

- Abort incomplete multipart uploads after 7 days (cleans up abandoned jobs).
- Optionally expire `jobs/*` archives ~90 days after publishing to cap costs;
  keep `meta/*` so the history stays visible.
