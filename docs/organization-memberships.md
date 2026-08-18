# Organization membership projection

GainForest keeps a private Supabase projection of Certified Group Service (CGS) organization rosters. CGS remains the membership authority; this table exists so server-side features can query organization DIDs, member DIDs, and roles without an interactive CGS request.

## Synchronization

After a full authenticated app load, Next.js schedules synchronization with `after()` so page rendering does not wait for it:

1. List every CGS organization available to the signed-in session, following all cursor pages.
2. For each organization, read its latest `roster_synced_at` from Supabase.
3. Skip a roster successfully synchronized less than 30 minutes ago.
4. Otherwise, fetch every CGS member page using the signed-in session.
5. Atomically replace that organization's projection through `organization_memberships_replace_roster`.

A failed, empty, malformed, or incomplete CGS roster is never stored. One organization's failure does not block another organization from synchronizing.

After GainForest successfully creates an organization, adds or removes a member, changes a role, or accepts an email invitation, it also schedules a forced refresh of that one organization's complete roster. This runs after the response so a projection outage never turns a successful CGS mutation into a failed user action. The forced refresh bypasses the 30-minute interval.

The projection is still eventually consistent. Existing organizations are backfilled when a current member next loads GainForest, including CGS changes made outside GainForest or a failed forced refresh. A person who removes themselves can no longer read that organization's roster, so that case refreshes when another current member loads GainForest. Do not use this table as an authorization authority; permission checks must continue to use CGS.

## Stored state

`public.organization_memberships` contains one row per organization/member pair:

- `organization_did`
- `member_did`
- `role`: `owner`, `admin`, or `member`
- `last_confirmed_at`: latest complete snapshot containing the member
- `removed_at`: `NULL` while active
- `roster_synced_at`: latest complete snapshot applied to the organization

Removed rows are retained so membership history is not silently discarded. A later snapshot can reactivate a member and update their current role.

The table has RLS enabled and is not available to browser roles. The service role may inspect freshness and query the projection, but roster writes go through the service-role-only replacement RPC.

## Database installation

The schema and its follow-up RPC repair are in:

```text
supabase/migrations/20260817143000_organization_memberships.sql
supabase/migrations/20260818140000_fix_organization_memberships_coalesce.sql
```

Apply both migrations to each Supabase environment before deploying application code that schedules membership synchronization. The database contract is in `tests/database/organization-memberships-contract.sql` and runs as part of `pnpm test:db`.
