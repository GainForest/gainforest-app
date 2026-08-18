# `/_test` UI experience registry

> **Parity invariant for developers and AI agents:** every registered experience renders the production component itself. Mock only fixture data, persistence, workflow navigation, and external side effects. Never copy or fork production markup, styles, validation, state labels, or interaction logic into this folder. Any UI or UX change must affect the mock and real experience in the same manner.

## Why the folder is named `%5Ftest`

Next.js treats a literal leading-underscore folder as private and does not create a route for it. `%5Ftest` is the encoded route segment that produces the public URL `/_test`.

`/_test` is an index only: it lists registered experiences and never embeds a flow directly. Every experience must live on a dedicated subroute such as `/_test/donation-flow`.

## Safety contract

- Registry experiences are public and must contain no secrets, privileged controls, or real personal data.
- The route is excluded from indexing through page metadata, `robots.txt`, and an `X-Robots-Tag` response header. These controls are not authentication.
- Mock experiences must not call live mutation, payment, wallet, publishing, or recipient-verification services.
- Mock state must not read from or write to a visitor's production state. `AppCartProvider` disables root cart persistence on this route, and the donation experience uses its own `CartProvider persistence="memory"`.
- If a production component gains a new external side effect, its mock adapter and safety coverage must be updated in the same change.
- If the UI changes, edit the shared production component. Do not patch the registry to imitate it.

## Donation experience

The first registered experience lives at `/_test/donation-flow` and stages the real components in this order:

1. `DonateButton` and `AmountModal`
2. `CartView`
3. `CheckoutView`

`CheckoutView sideEffects="mock"` uses the same UI and in-app state machine while replacing recipient lookup, tip lookup, wallet connection, balance reads, and settlement with local fixtures. The amount modal uses `ModalPortal`, preserving the registry's memory-backed cart context inside the root modal chrome.

## Invitation delivery experience

`/_test/invitation-delivery` renders the production `PendingInvitationRow` for sent, delayed, manual-link, and role-restricted states. Its retry, copy, and cancel callbacks update fixture state only; the route never calls invitation, notification, clipboard, or membership APIs.

## BioBlitz notification experience

`/_test/bioblitz-notifications` renders the production moderator status row for sent, delayed, missing-email, lookup-failure, and setup-failure states. **Mark handled manually** updates fixture state only; it never reads awards, writes the outbox, or contacts a winner.

## Community events experience

`/_test/community-events` renders the production Events surfaces — `EventsDiscoveryClient`, `EventDetailClient`, and `HostEventClient` — behind a fixture `EventsAdapter`. RSVP, publishing, editing, and host-cancelling all mutate in-memory fixtures only; the adapter never touches the indexer, a PDS, the manage proxy, or blob upload, and its sign-in hand-off shows an inline notice instead of redirecting. A "Signed in" toggle simulates the signed-out RSVP prompt. Card links point at the real `/events` routes (fixtures only exist inside the experience), so the tab bar at the top is the supported way to move between the mock views.

## Project updates experience

`/_test/project-updates` renders the production update composer (`EvidenceAdder`, including the WYSIWYG editor) and the production read-only timeline (`ProjectTimelineReadonly`) against a fixture activity. Posting runs the real draft validation and record building, but the composer's `createAttachment` seam is a local mock: the resulting `pub.leaflet.pages.linearDocument` record only feeds the on-page timeline state and disappears on reload. No record, blob, or account is ever touched.
