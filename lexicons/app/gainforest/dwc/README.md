# GainForest Darwin Core identification

`app.gainforest.dwc.identification` stores a labeler's proposed taxonomic
identification as a structured record in the labeler's own AT Protocol repo.

The `subject` strong reference pins the exact
`app.gainforest.dwc.occurrence` version reviewed. Publishing an identification
does not mutate the occurrence: the observer remains responsible for accepting
it and updating their own record.

Until the public indexer exposes identification queries, the app also creates a
tagged `app.gainforest.feed.post` reply. That reply provides discovery and owner
notifications; its `identification:<rkey>` tag points back to the structured
record, which the observation page reads directly from the labeler's PDS.
