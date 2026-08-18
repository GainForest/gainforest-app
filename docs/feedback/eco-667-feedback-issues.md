# ECO-667 team feedback issues

Source: Linear issue `ECO-667` — “Collect team feedback for Bumicerts rewrite”
App reviewed: <https://certs-rewrite.gainforest.app>
Created from comments by Fatin, Niña, and Karma on 2026-06-08.

Screenshots downloaded for review are in [`docs/feedback/eco-667/screenshots/`](./eco-667/screenshots/).

## How to read this feedback

The main takeaway is **not** “there are 32 issues” or “the browse page has bugs.” Those are true details, but they miss the product direction.

The main takeaway is: **Bumicerts should feel like a Manage + evidence platform.** Stewards manage their organization profile, create Bumicerts as the main public impact story, and connect uploads as supporting evidence. Public browsing, cards, labels, timelines, observations, and donations should all support that same story in plain language.

When summarizing this document, lead with the product/evidence model first. Mention browse bugs as urgent implementation work, not as the overall theme.

Use the **eight-theme summary below as the canonical summary**. If asked “what is in `docs/feedback`?” or “summarize the feedback,” answer with these **8 numbered themes**. Do not collapse it into seven bullets: the evidence/timeline model is its own theme and should stay separate from general Manage page work.

## Canonical 8-theme summary

### 1. Product structure needs tightening

The biggest theme is that the app should feel like a Manage + evidence platform, not just a public certificate browser.

Key issues:
- Rename/rework the current “Organization” manage area into a broader Manage page.
- Show organization profile at the top.
- Group manage actions into:
  - **Impact certificates** → Bumicerts
  - **Data uploads** → Biodiversity Observations, Sites, Audio, Trees, Drone, Documents, Data council
- Make public timeline filters match these same upload categories.
- Add a simple visual showing uploads feeding into Bumicerts.

### 2. Bumicert cards need more useful context

Reviewers found public cards attractive but sometimes unclear.

Key issues:
- Titles are cut off too soon; allow at least two lines.
- Add location: city/town + country.
- Add programme/funding tags like “Ma Earth Round 3”.
- Remove or explain unclear logos/icons under cards.
- Hide test Bumicerts from public browse.
- Fix A→Z and newest/oldest sorting.

### 3. Several labels are confusing — Done

A lot of feedback is about wording not being clear enough.

Labels to revisit:
- “Completed gifts”
- “Contributors credited”
- “Bumicerts with photos”
- “Profiles with photos”
- “Places shown on map”
- “Reviewed organization”
- “Mapped”
- “Supporters counted”
- “Average donation size”
- “Countries with organizations”

The pattern: replace vague/internal-sounding labels with plain user-facing wording.

### 4. Evidence/timeline model needs to be clearer

This should stay as its own theme when summarizing the feedback. It is related to the Manage page, but it is not the same thing.

Fatin’s feedback strongly pushes toward Bumicerts as the public story that collects supporting evidence.

Key issues:
- Replace “Profile Ready” achievement with “Bumicert linked to evidence”.
- Timeline filters should be:
  - All
  - Biodiversity Observations
  - Sites
  - Audio
  - Trees
  - Drone
  - Documents
- Documents should support file uploads and described links.

### 5. Browse/filter behavior has bugs — Done

Several reviewers hit broken or confusing filtering.

Key issues:
- Organization country filter only shows some countries.
- Some country filters do not work.
- “With images” organization filter appears broken.
- Sorting behaves incorrectly.
- Empty grid slots suggest invalid/missing items.
- Map “Load more” behavior is confusing.

These are probably high-priority because they make the app feel broken.

### 6. Observations page should feel less technical — Done

The observations page is liked, but the content presentation is intimidating.

Key issues:
- Show common/local names first, not scientific names.
- Add city/town + country.
- Add filters like plants, trees, birds, flowers.
- Clarify that audio items are field/nature sound recordings, not meeting recordings.

### 7. Some pages/sections may not belong — Done

Reviewers questioned whether some areas are useful to users.

Key issues:
- “Tainá field devices” may confuse users on a Bumicerts site.
- “Site Health” is unclear and may not need to be in public navigation.
- These should either be removed, hidden, or explained much more clearly.

### 8. Visual polish and performance

Karma’s screenshots point to polish/performance improvements.

Key issues:
- Dark mode step numbers are too low-contrast.
- Some small text may be too small.
- Lighthouse/PageSpeed performance was weak, especially:
  - LCP around 6.5s
  - Speed Index around 10.7s
- Consider smaller initial page size, e.g. 12 items instead of 48.

### Delivery order

This is a practical delivery sequence, not the product story. The product story remains: **Manage + Bumicerts + supporting evidence**.

1. Fix public bugs: sorting, filters, test items, broken images, empty grid.
2. Rework Manage page structure.
3. Align timeline/upload categories.
4. Improve Bumicert cards with title, location, programme tags.
5. Clean up confusing labels across the app.
6. Improve observations page names, locations, and filters.
7. Remove or clarify confusing sections like field devices and Site Health.
8. Do dark mode and performance pass.

## What reviewers liked

- Overall look and feel is a strong foundation for a data upload and evidence-linking platform.
- Metrics at the top of list pages.
- Categories on organization pages.
- Observations and donations pages.
- “Ways to explore” on the homepage.
- Bumicert detail panel/opening on the right.
- “Work period” on Bumicert pages.

## Priority 1 — Core product structure

### 1. Rework the current organization management page into a Manage page

**Source:** Fatin
**Screenshots:**
- Current page: [`fatin-01-org-manage-current.png`](./eco-667/screenshots/fatin-01-org-manage-current.png)
- Proposed layout: [`fatin-02-manage-data-flow.png`](./eco-667/screenshots/fatin-02-manage-data-flow.png)

**Feedback / issue:**
The current manage area is framed as “Organization”, but the desired product direction is a broader Manage page where stewards manage their profile, Bumicerts, and supporting uploads in one place.

**Requested change:**
- Keep the organization profile card at the top: name, description, location, website, and Edit profile.
- Rename/reframe the sidebar Manage area from “Organization” to “Manage”.
- Add two grouped sections below the profile:
  - **Impact certificates**
    - Bumicerts only.
    - Explain that Bumicerts connect uploaded information into project updates.
  - **Data uploads**
    - Biodiversity Observations
    - Sites
    - Audio
    - Trees
    - Drone
    - Documents
    - Data council
- Make the sidebar Manage section use the same grouping and ordering.
- Add a simple visual that shows how uploads feed into Bumicerts.
- Documents should support two types:
  - file upload, downloadable later
  - link with description

**Acceptance notes:**
- The Manage page should make it obvious that Bumicerts are the main public story and uploads are the supporting evidence.
- The same labels should be used consistently in Manage and public timelines.

---

### 2. Align organization profile fields with Ma Earth onboarding

**Source:** Fatin

**Feedback / issue:**
Since Bumicerts is being positioned as a data upload platform, including for Ma Earth, the organization profile should match Ma Earth onboarding where possible.

**Requested change:**
- Use Ma Earth’s organization onboarding questions for the organization profile.
- Keep the split clear:
  - organization profile = organization information
  - Bumicert page = project information

**Acceptance notes:**
- Do not put project-specific questions in the organization profile.
- Check whether any current organization fields are missing from the Ma Earth organization onboarding flow.

---

### 3. Replace “Profile Ready” achievement with evidence-linking achievement

**Source:** Fatin
**Screenshots:**
- Current achievements: [`fatin-03-achievements-current.png`](./eco-667/screenshots/fatin-03-achievements-current.png)
- Proposed achievements: [`fatin-04-achievements-proposed.png`](./eco-667/screenshots/fatin-04-achievements-proposed.png)

**Feedback / issue:**
“Profile Ready” should not be shown as a Bumicert achievement because profile setup should already happen during onboarding.

**Requested change:**
Final achievements list should be:
1. Bumicert Steward
2. Bumicert linked to evidence
3. Community Backed

**Trigger requested:**
“Bumicert linked to evidence” should become complete when a Bumicert has uploaded information connected to it as evidence.

---

### 4. Add programme/funding tags to Bumicerts

**Source:** Fatin
**Screenshot:** [`fatin-05-programme-tags.png`](./eco-667/screenshots/fatin-05-programme-tags.png)

**Feedback / issue:**
Each Bumicert should show which programme or funding initiative it belongs to, for example “Ma Earth Round 3” or “Klarna AI for Climate Good”.

**Requested change:**
- Add internally managed programme/funding tags to Bumicerts.
- Stewards should not be able to add or edit these tags themselves for now.
- Tags should appear:
  1. on the public Bumicert card
  2. under each Bumicert in the steward’s manage profile

**Acceptance notes:**
- If a funder/programme wants to be added, they should contact the team.
- Tags should not crowd out the title, location, or core project context.

---

### 5. Make public timeline filters match Manage upload categories

**Source:** Fatin
**Screenshot:** [`fatin-06-timeline-tabs-current.png`](./eco-667/screenshots/fatin-06-timeline-tabs-current.png)

**Feedback / issue:**
The current public timeline filters do not match the upload categories stewards see in Manage.

**Current tabs:**
- All
- Trees
- Sounds
- Nature
- Files

**Requested tabs:**
- All
- Biodiversity Observations
- Sites
- Audio
- Trees
- Drone
- Documents

**Acceptance notes:**
- Public timeline labels should match Manage upload labels exactly.
- This helps funders understand how the evidence they see connects to what stewards uploaded.

---

## Priority 2 — Broken or confusing browse behavior

### 6. Fix organization country filters

**Sources:** Niña, Karma
**Screenshot:** related search/filter context in [`karma-06-observations-country-filter-context.png`](./eco-667/screenshots/karma-06-observations-country-filter-context.png)

**Feedback / issue:**
- Organization country filter only shows 10 countries.
- Country filtering does not work for all countries.
- A reviewer also noted a country-style filter/search issue while viewing observations.

**Requested change:**
- Show all available countries or provide searchable country selection.
- Make country filters work consistently across organizations and observations.
- Confirm empty states only appear when there truly are no matching results.

---

### 7. Fix “With images” organization filter

**Source:** Niña
**Screenshot:** [`karma-05-org-filter-empty-state.png`](./eco-667/screenshots/karma-05-org-filter-empty-state.png)

**Feedback / issue:**
The “With images” filter appears not to return organizations even though metrics say many profiles have photos.

**Requested change:**
- Check whether the filter is using the right image field.
- Ensure organizations with cover photos and/or profile images appear when “With images” is selected.
- If “image” means only a specific type of image, rename the filter to be clearer.

---

### 8. Fix sorting on Bumicerts and organizations

**Sources:** Niña, Karma
**Screenshot:** [`nina-09-az-filter-messy.png`](./eco-667/screenshots/nina-09-az-filter-messy.png)

**Feedback / issue:**
- A→Z sort looks messy.
- Newest/oldest sorting behaves incorrectly.
- Karma observed that the created date query is always descending, even when oldest first is selected.
- A→Z does not work correctly.

**Requested change:**
- Fix sort query direction for newest and oldest.
- Fix A→Z ordering.
- Decide how cards with missing titles/images should sort.
- Add regression coverage if there are existing tests for filters/sorting.

---

### 9. Hide or remove test Bumicerts from the public browse page

**Source:** Niña
**Screenshot:** [`nina-08-test-bumicerts.png`](./eco-667/screenshots/nina-08-test-bumicerts.png)

**Feedback / issue:**
Public browse currently shows obvious test items like “test” and “My awesome...”.

**Requested change:**
- Confirm whether test Bumicerts are intentional.
- If not intentional, filter them out or remove them from the source data.
- Add a rule for excluding drafts/test content from public pages.

---

### 10. Fix awkward empty grid slot / invalid returned items

**Source:** Karma
**Screenshot note:** Karma attached a screenshot in this part of the thread, but the downloaded image appears to show the map “Load more” state rather than the grid gap. The issue below comes from the written feedback.

**Feedback / issue:**
An empty-looking space in the grid makes it feel like an item failed to render or all Bumicerts have loaded. Karma suspected invalid data being returned.

**Requested change:**
- Filter out invalid/incomplete items before rendering.
- Preserve grid alignment when an item is skipped.
- Show a clear loading or end-of-results state when appropriate.

---

### 11. Improve map pagination UX

**Source:** Karma
**Screenshot:** [`karma-04-map-load-more.png`](./eco-667/screenshots/karma-04-map-load-more.png)

**Feedback / issue:**
The “Load more” button under the map is unintuitive. It looks like leftover list pagination, but it actually paginates map listings.

**Requested change:**
- Make map pagination behavior clear.
- Consider loading all map points separately from card/list pagination.
- If a button is still needed, label it in a way that explains what will happen.

---

## Priority 3 — Bumicert browse and detail improvements

### 12. Keep Bumicert card titles visible for at least two lines

**Source:** Niña
**Screenshot:** [`nina-02-card-title-clamped.png`](./eco-667/screenshots/nina-02-card-title-clamped.png)

**Feedback / issue:**
Many Bumicert titles are cut off too aggressively. Reviewers want enough title context while scrolling.

**Requested change:**
- Allow at least two title lines on Bumicert cards.
- Avoid making the grid feel uneven.
- Ensure long titles still truncate gracefully after enough context is shown.

---

### 13. Add location to Bumicert cards

**Source:** Niña
**Screenshot:** [`nina-05-card-logos-location-tags.png`](./eco-667/screenshots/nina-05-card-logos-location-tags.png)

**Feedback / issue:**
Bumicert cards need clearer place context.

**Requested change:**
- Add city/town and country where available.
- Use a short, readable format similar to Ma Earth.
- Prefer location and programme tags over unclear icon-only metadata.

---

### 14. Explain or remove unclear logos/icons under Bumicert cards

**Source:** Niña
**Screenshot:** [`nina-05-card-logos-location-tags.png`](./eco-667/screenshots/nina-05-card-logos-location-tags.png)

**Feedback / issue:**
Logos/icons under Bumicert cards are not intuitive.

**Requested change:**
- Add short hover/help text if they remain.
- Or remove them and use location plus programme tags instead.
- Do not rely on icon-only meaning for important metadata.

---

### 15. Rework Bumicert browse filters

**Source:** Niña
**Screenshot:** [`nina-04-bumicert-filters-unclear.png`](./eco-667/screenshots/nina-04-bumicert-filters-unclear.png)

**Feedback / issue:**
Current filters do not make sense to the reviewer: “All Projects”, “Photos”, “Sites”, “Contributors”, “Active period”.

**Requested change:**
- Reconsider which filters are useful for funders and stewards.
- Use labels that describe the result clearly.
- Make sure each filter actually narrows results in an understandable way.

---

### 16. Rework top metrics on Bumicerts page

**Source:** Niña
**Screenshot:** [`nina-03-unclear-bumicert-metrics.png`](./eco-667/screenshots/nina-03-unclear-bumicert-metrics.png)

**Feedback / issue:**
- “Bumicerts with photos” does not feel impactful.
- “Contributors credited” is unclear.

**Requested change:**
- Replace or rename unclear metrics.
- Prioritize metrics that communicate impact, funding, evidence, locations, or active projects.

---

### 17. Reduce oversized project description text on Bumicert detail pages

**Source:** Niña
**Screenshot:** [`nina-06-description-font-large.png`](./eco-667/screenshots/nina-06-description-font-large.png)

**Feedback / issue:**
The project description font feels too large and inconsistent.

**Requested change:**
- Reduce description body font size.
- Keep readable hierarchy between title, tags, and body copy.
- Check long descriptions and links for comfortable scanning.

---

### 18. Rename “Completed gifts” in Bumicert donation panels

**Source:** Niña
**Screenshot:** [`nina-07-completed-gifts-unclear.png`](./eco-667/screenshots/nina-07-completed-gifts-unclear.png)

**Feedback / issue:**
“Completed gifts” is unclear.

**Requested change:**
Use clearer donation wording, for example:
- “Completed donations”
- “Donations”
- “Direct donations”

---

## Priority 4 — Organizations page improvements

### 19. Improve organization metrics labels and color consistency

**Source:** Niña
**Screenshots:**
- Light mode: [`nina-10-org-metrics-copy-colors-light.png`](./eco-667/screenshots/nina-10-org-metrics-copy-colors-light.png)
- Dark mode: [`nina-11-org-metrics-copy-colors-dark.png`](./eco-667/screenshots/nina-11-org-metrics-copy-colors-dark.png)

**Feedback / issue:**
- “Profiles with photos” is unclear: what kind of photos?
- “Places shown on map” might be clearer as “project sites”.
- Metric number colors look inconsistent, including in dark mode.

**Requested change:**
- Rename metrics in plain language.
- Make metric color treatment consistent across cards and themes.
- If “map places” means organization locations, avoid calling them project sites unless they truly are project sites.

---

### 20. Explain or rename “Reviewed organization”

**Source:** Niña
**Screenshot:** [`nina-12-reviewed-organization-unclear.png`](./eco-667/screenshots/nina-12-reviewed-organization-unclear.png)

**Feedback / issue:**
The label “Reviewed organization” is unclear.

**Requested change:**
- Explain what review means in user-facing language.
- Or rename to a clearer status.
- Avoid showing the status if users cannot understand or act on it.

---

### 21. Fix organization cover photos and “Mapped” wording

**Source:** Niña
**Screenshot:** [`nina-13-org-cover-photos-mapped.png`](./eco-667/screenshots/nina-13-org-cover-photos-mapped.png)

**Feedback / issue:**
- Organization cover photos are not loading.
- “Mapped” is unclear.

**Requested change:**
- Fix missing cover image rendering.
- Rename “Mapped” to clearer wording, such as “Location shown”, if that is accurate.
- Ensure image placeholders do not dominate the card when a cover image is missing.

---

## Priority 5 — Observations and audio improvements

### 22. Clarify audio recordings on observations page

**Source:** Niña
**Screenshot:** [`nina-14-observations-recordings.png`](./eco-667/screenshots/nina-14-observations-recordings.png)

**Feedback / issue:**
The reviewer asked whether the recordings are meeting recordings. The current card copy does say “Field sound recording”, but the section may still need clearer context.

**Requested change:**
- Make it clear these are nature/field sound recordings.
- Ensure audio cards show enough context: place, organization, recording type, and date if available.

---

### 23. Add observation category filters

**Source:** Niña

**Feedback / issue:**
Observation filters should support categories like plants, trees, birds, flowers, etc.

**Requested change:**
- Add user-friendly category filters where data supports them.
- Avoid exposing scientific classification as the primary browsing path.

---

### 24. Use common/local names by default for observations and add location

**Source:** Niña
**Screenshot:** [`nina-15-observation-scientific-name-location.png`](./eco-667/screenshots/nina-15-observation-scientific-name-location.png)

**Feedback / issue:**
Scientific names are intimidating as the main card title. Common/local names are currently only available on hover.

**Requested change:**
- Show common/local name by default when available.
- Keep scientific name secondary.
- Add city/town and country where the observation was found.

---

## Priority 6 — Donations page copy

### 25. Rename donation metrics

**Source:** Niña
**Screenshot:** [`nina-16-donation-metrics-copy.png`](./eco-667/screenshots/nina-16-donation-metrics-copy.png)

**Feedback / issue:**
Several donation metrics are unclear or could be more direct.

**Requested copy changes:**
- “Completed donations” → “Donations” or “Direct donations”
- “Supporters counted” → “Unique donors”
- “Average donation size” → “Average donation” or “Average donation amount”
- “Countries with organizations” → “Countries with Bumicerts”

---

## Priority 7 — Homepage and global navigation/content

### 26. Keep the language option on the homepage

**Source:** Niña

**Feedback / issue:**
The homepage should keep the language option.

**Requested change:**
- Ensure language selection remains available and easy to find.

---

### 27. Highlight key homepage role phrases in green

**Source:** Niña
**Screenshot:** [`nina-01-homepage-highlight-roles.png`](./eco-667/screenshots/nina-01-homepage-highlight-roles.png)

**Feedback / issue:**
The phrases “support a project” and “nature steward” should be highlighted in green.

**Requested change:**
- Apply green emphasis to those phrases while preserving readability.
- Check both light and dark modes.

---

### 28. Reconsider GainForest field devices section

**Source:** Niña

**Feedback / issue:**
“Tainá field devices” may not make sense on the Bumicerts website and could confuse users.

**Requested change:**
- Remove, hide, or relocate this section unless it has a clear purpose for Bumicerts users.
- If retained, explain why it matters in plain language.

---

### 29. Reconsider Site Health section

**Source:** Niña

**Feedback / issue:**
The Site Health page/section is unclear: reviewer did not understand what it is about or why it matters here.

**Requested change:**
- Remove from main navigation if it is not useful to public users.
- Or explain it plainly and only show it where relevant.

---

## Priority 8 — Accessibility, dark mode, and performance

### 30. Improve dark mode contrast for step numbers and small text

**Source:** Karma
**Screenshots:**
- Step numbers: [`karma-01-dark-mode-number-contrast.png`](./eco-667/screenshots/karma-01-dark-mode-number-contrast.png)
- Accordion/number text: [`karma-02-dark-mode-small-font.png`](./eco-667/screenshots/karma-02-dark-mode-small-font.png)

**Feedback / issue:**
The numbers “01”, “02”, “03”, etc. are too dark in dark mode. Some text also appears too small.

**Requested change:**
- Increase contrast for numbered labels in dark mode.
- Review small font sizes in accordions and homepage sections.
- Check WCAG contrast for text against dark backgrounds.

---

### 31. Improve homepage performance

**Source:** Karma
**Screenshot:** [`karma-03-performance-report.png`](./eco-667/screenshots/karma-03-performance-report.png)

**Feedback / issue:**
Performance score is low in the attached Lighthouse/PageSpeed context.

**Observed numbers in screenshot:**
- Performance: 61
- Accessibility: 98
- Best Practices: 96
- SEO: 100
- First Contentful Paint: 1.7s
- Largest Contentful Paint: 6.5s
- Total Blocking Time: 310ms
- Speed Index: 10.7s
- Cumulative Layout Shift: 0

**Requested change:**
- Run Lighthouse/PageSpeed locally or against deployed app.
- Focus on LCP and Speed Index first.
- Review image sizes, initial data fetching, font loading, and large client-side bundles.

---

### 32. Consider smaller initial page size or infinite pagination

**Source:** Karma

**Feedback / issue:**
Explore may feel faster if it initially queries 12 items instead of 48 and then paginates/infinite-loads.

**Requested change:**
- Consider reducing initial item count.
- Add infinite pagination or a clearer “load more” pattern later.
- Balance perceived performance with browsing usability.

---

## Cross-cutting copy cleanup

Several reviewers flagged labels that sound unclear or not impactful. These should be reviewed together so the app uses consistent plain-language terms.

Labels to revisit:
- “Bumicerts with photos”
- “Contributors credited”
- “Completed gifts”
- “Profiles with photos”
- “Places shown on map”
- “Reviewed organization”
- “Mapped”
- “Supporters counted”
- “Average donation size”
- “Countries with organizations”
- “All Projects”, “Photos”, “Sites”, “Contributors”, “Active period” as browse filters

## Suggested delivery order

This order is about reducing visible brokenness while building toward the larger product direction. Do not summarize the feedback as bug-first overall; summarize it as a Manage + evidence platform direction, with public browse bugs as urgent cleanup.

Keep this as **8 steps**, matching the canonical 8-theme summary above. Do not merge step 2 and step 3.

1. Fix broken public data behavior: test Bumicerts, filters, sorting, missing images, empty grid slot.
2. Rework Manage page structure.
3. Clarify the evidence/timeline model and align upload/timeline categories.
4. Improve Bumicert cards: title, location, tags, unclear icons.
5. Update achievements and donation/metric copy.
6. Improve observations names, filters, locations, and audio clarity.
7. Clean up confusing navigation/content: field devices and Site Health.
8. Run performance and dark-mode/accessibility pass.
