# AudioMoth spectrogram labels as Darwin Core occurrences

## Status

This is the persistence decision for the AudioMoth spectrogram labelling UI in
`app/audiomoth/_components/LabelTab.tsx`.

The first UI prototype saved label drafts in browser `localStorage`. That is
useful for crash recovery, but it is **not the source of truth**. The completed
feature must save every confirmed time/frequency box as a new AT Protocol
`app.gainforest.dwc.occurrence` record in the signed-in publisher's repository.

Do not model these records as `app.gainforest.evaluator.evaluation`. A human
marking a wildlife sound is asserting that an organism occurred at a place and
time. That is a Darwin Core occurrence, not an assessment of another record.

## Core decision

**One saved spectrogram box equals one Darwin Core occurrence.**

The source recording remains an `app.gainforest.ac.audio` record. Many
occurrences can point to the same recording.

```text
app.gainforest.dwc.event
          ^ eventRef
          |
app.gainforest.ac.deployment
          ^ deploymentRef
          |
app.gainforest.ac.audio  <---- associatedMedia ----  app.gainforest.dwc.occurrence
       one recording                               one record per labelled box
```

The occurrence points to the audio using `associatedMedia`. Do not duplicate
the audio blob onto every occurrence.

## Why `dwc.occurrence` fits

The existing occurrence schema already provides:

- `basisOfRecord` for human versus machine detection;
- `scientificName`, `vernacularName`, and the Darwin Core taxonomy fields;
- `eventDate` for the detection time or interval;
- `eventRef` for the survey/deployment event;
- `occurrenceRemarks` and `identificationRemarks` for notes;
- `associatedMedia` for the source `at://` audio URI;
- `dynamicProperties` for structured fields that are not standard Darwin Core
  terms, including the relative time and frequency bounds.

Schema source:
[`app/docs/lexicons/_schemas/app/gainforest/dwc/occurrence.json`](../app/docs/lexicons/_schemas/app/gainforest/dwc/occurrence.json)

The source recording schema is:
[`app/docs/lexicons/_schemas/app/gainforest/ac/audio.json`](../app/docs/lexicons/_schemas/app/gainforest/ac/audio.json)

## Preconditions for publishing

A confirmed occurrence needs a stable source recording reference. Therefore:

1. The WAV is uploaded through the AudioMoth Upload flow.
2. Upload creates an `app.gainforest.ac.audio` record.
3. The labelling UI works against that audio record and knows its AT-URI, CID,
   recording start time, duration, sample rate, and deployment reference.
4. Saving a box creates an occurrence in the same publishing context.

A local WAV may still be used to build the spectrogram. If it has not yet been
matched to an uploaded `ac.audio` record, its boxes are drafts and the Save
control must explain that the recording needs to be uploaded first.

Never invent an AT-URI from a filename. Match a local file to an uploaded audio
record using stable record data, and ask the user to resolve ambiguous matches.
A filename alone is not globally unique.

## Record mapping

| UI concept | Darwin Core occurrence field | Rule |
|---|---|---|
| Saved label | New occurrence record | One box per record |
| Human-created box | `basisOfRecord` | `HumanObservation` |
| Future model-created box | `basisOfRecord` | `MachineObservation` |
| Sound evidence | `dcType` | `Sound` |
| Species scientific name | `scientificName` | Use the accepted scientific name when known |
| Common/local name | `vernacularName` | Optional |
| Broad animal choice | taxonomy fields | Use the broad fallback mapping below |
| Recording segment time | `eventDate` | Absolute ISO-8601 interval derived from recording start + box offsets |
| Source audio record | `associatedMedia` | Exact `at://.../app.gainforest.ac.audio/...` URI |
| Survey event | `eventRef` | Resolve through the audio's deployment when available |
| User note | `occurrenceRemarks` | Plain-language observation note |
| Identification note | `identificationRemarks` | Only notes specifically about taxon identification |
| Present detection | `occurrenceStatus` | `present` |
| Time/frequency box | `dynamicProperties` | JSON shape defined below |
| Search/filter hints | `tags` | Include `bioacoustics` and the broad category |
| Record identifier | `occurrenceID` | `urn:uuid:${crypto.randomUUID()}` |
| Creation time | `createdAt` | Current ISO timestamp |

### Broad taxonomy fallback

The occurrence schema requires `scientificName`. When the user knows only a
broad group, publish the most specific honest taxon rather than fabricating a
species.

| UI choice | `scientificName` | Additional taxonomy |
|---|---|---|
| Bird | `Aves` | `kingdom: Animalia`, `phylum: Chordata`, `class: Aves`, `taxonRank: class` |
| Frog | `Anura` | `kingdom: Animalia`, `phylum: Chordata`, `class: Amphibia`, `order: Anura`, `taxonRank: order` |
| Insect | `Insecta` | `kingdom: Animalia`, `phylum: Arthropoda`, `class: Insecta`, `taxonRank: class` |
| Unidentified biological sound | `Biota` | Do not claim a narrower rank |

When a taxon picker resolves a species, replace the broad fallback with the
resolved scientific name and populate the available taxonomy fields. Do not
put a common name into `scientificName`.

A note about rain, machinery, wind, or another non-biological sound is not a
biodiversity occurrence. It can remain a recording-level note or use a future
acoustic-annotation schema, but must not be published as a fake organism. A
note-only occurrence is valid only when the user is recording an unidentified
biological presence; use `scientificName: "Biota"` and put the explanation in
`occurrenceRemarks`.

## Time semantics

Box coordinates in the UI are relative to the start of the audio file. Darwin
Core `eventDate` should be an absolute time.

Given:

- recording `metadata.recordedAt = 2024-04-07T01:00:00.000Z`;
- box start `11.3` seconds;
- box end `30.4` seconds;

publish:

```text
2024-04-07T01:00:11.300Z/2024-04-07T01:00:30.400Z
```

Preserve millisecond precision. Clamp offsets to the recording duration and
reject zero-length or inverted intervals before publishing.

If `metadata.recordedAt` is unavailable or invalid, do not silently substitute
the browser's current time. Ask the user to supply or confirm the recording
start time.

## `dynamicProperties` contract

Time and frequency bounds are meaningful acoustic metadata but are not native
Darwin Core occurrence terms. Store them in Darwin Core's standard
`dynamicProperties` JSON string.

Use this versioned shape:

```json
{
  "gainforestBioacoustics": {
    "version": 1,
    "sourceAudioUri": "at://did:example/app.gainforest.ac.audio/3k...",
    "startTimeSeconds": 11.3,
    "endTimeSeconds": 30.4,
    "minFrequencyHz": 6200,
    "maxFrequencyHz": 15000,
    "labelCategory": "frog"
  }
}
```

Rules:

- Serialize it as a single-line JSON string in the ATProto record.
- Keep values numeric, not formatted strings such as `"6.2 kHz"`.
- `sourceAudioUri` must equal the URI in `associatedMedia`.
- `version` starts at `1`; bump it only for a breaking shape change.
- Preserve unknown keys when updating an existing occurrence.
- Treat `dynamicProperties` as supporting metadata, not the only relationship
  to the audio. `associatedMedia` remains the canonical Darwin Core link.

## Example occurrence record

```json
{
  "$type": "app.gainforest.dwc.occurrence",
  "occurrenceID": "urn:uuid:0eac2dc9-9c87-4da3-a39d-57db27cd9f52",
  "basisOfRecord": "HumanObservation",
  "dcType": "Sound",
  "scientificName": "Anura",
  "vernacularName": "Tree frog",
  "kingdom": "Animalia",
  "phylum": "Chordata",
  "class": "Amphibia",
  "order": "Anura",
  "taxonRank": "order",
  "eventDate": "2024-04-07T01:00:11.300Z/2024-04-07T01:00:30.400Z",
  "occurrenceStatus": "present",
  "associatedMedia": "at://did:example/app.gainforest.ac.audio/3kexample",
  "occurrenceRemarks": "Three clear calls above the background insects",
  "tags": ["bioacoustics", "frog"],
  "dynamicProperties": "{\"gainforestBioacoustics\":{\"version\":1,\"sourceAudioUri\":\"at://did:example/app.gainforest.ac.audio/3kexample\",\"startTimeSeconds\":11.3,\"endTimeSeconds\":30.4,\"minFrequencyHz\":6200,\"maxFrequencyHz\":15000,\"labelCategory\":\"frog\"}}",
  "createdAt": "2026-07-14T12:00:00.000Z"
}
```

If the deployment resolves to a Darwin Core event, also set `eventRef`. Follow
the existing audio occurrence flow in
`app/(manage)/manage/audio/_components/AudioForms.tsx`: it copies relevant
location, country, and habitat context from the deployment/event onto the
occurrence when available.

## Relationship direction and cardinality

### Do

- Create one occurrence per box.
- Point every occurrence to the same source audio URI using `associatedMedia`.
- Allow one audio recording to have zero, one, or many occurrences.
- Read occurrences by exact source audio URI.

### Do not

- Do not use `app.gainforest.evaluator.evaluation` for a human occurrence.
- Do not write every box into one evaluation result.
- Do not duplicate the audio in `audioEvidence` for every occurrence.
- Do not set `app.gainforest.ac.audio.occurrenceRef` for this workflow. It is a
  singular field and cannot represent many boxes from one recording.
- Do not overwrite the audio record when adding another occurrence.

## Publishing context and permissions

The available Save action must be gated before the user can trigger it.

- Personal audio: write the occurrence to the signed-in user's repository via
  the session-gated `/api/manage/proxy` mutation route.
- Organization audio: publish to the organization repository through CGS only
  when the current member can create occurrence records.
- Never accept the publisher DID from the request body for a personal write;
  derive it from the authenticated session.
- If the user can view but not publish for the selected account, disable Save
  and show a plain-language reason.

The occurrence and source audio should normally share a publishing context. If
a future workflow allows cross-repository annotation, preserve the external
`associatedMedia` URI and make the publishing account explicit in the UI.

## Create, edit, and delete behavior

### Create

`Save label` performs `createRecord` in
`app.gainforest.dwc.occurrence`. Only show success after the PDS write returns a
URI and CID. Store those values in UI state so later edits address the actual
record.

### Edit

Editing a box performs a read-modify-write `putRecord` on the same occurrence
rkey. Preserve unrelated Darwin Core fields and unknown `dynamicProperties`
keys. Do not create a duplicate occurrence for a normal edit.

### Delete

Deleting a label performs `deleteRecord` on its occurrence rkey after a clear
confirmation. Remove it optimistically only when rollback behavior exists;
otherwise wait for the PDS response.

## Reading labels

For immediate consistency, list `app.gainforest.dwc.occurrence` records directly
from the publisher's PDS and filter records where:

1. `associatedMedia` contains the exact source audio AT-URI; and
2. `dynamicProperties.gainforestBioacoustics` is present and valid.

The indexer can provide discovery and public browsing later, but it may lag a
fresh write. The editing UI should not depend on indexer freshness.

Malformed `dynamicProperties` must not crash the workspace. Ignore the box
metadata, retain the occurrence in diagnostics, and allow the rest of the
recording to load.

## Browser drafts

Browser storage is allowed only as a draft/recovery layer:

- draft boxes may be saved before an ATProto write;
- successful PDS writes should replace drafts with `{ uri, cid, rkey }` backed
  occurrences;
- the UI must distinguish **Unsaved draft**, **Saving**, **Saved**, and **Save
  failed**;
- clearing browser storage must not delete ATProto occurrences;
- deleting an ATProto occurrence must be an explicit remote mutation.

CSV export is a convenience, not persistence.

## Suggested implementation boundary

Keep ATProto record logic out of the canvas component. A suitable module split
is:

```text
app/_lib/audiomoth/occurrences.ts
  buildAudioOccurrenceRecord()
  createAudioOccurrence()
  updateAudioOccurrence()
  deleteAudioOccurrence()
  listAudioOccurrences()
  parseAudioSegmentDynamicProperties()

app/audiomoth/_components/LabelTab.tsx
  file/recording selection
  spectrogram rendering
  box editing
  mutation states and user feedback
```

The record builder should be pure and unit tested. Network helpers should use
the same mutation and direct-PDS patterns as `app/_lib/ac-audio.ts` and the
existing observation mutation helpers.

## Required tests

At minimum, cover:

1. box coordinates map to correct relative seconds and frequencies;
2. relative offsets map to the correct absolute `eventDate` interval;
3. Bird/Frog/Insect broad taxonomy fallbacks;
4. resolved species override broad fallback without losing higher taxonomy;
5. notes map to `occurrenceRemarks`;
6. the source audio URI appears in both `associatedMedia` and
   `dynamicProperties`;
7. invalid recording timestamps block publishing;
8. a recording can load multiple occurrence records;
9. edits preserve unrelated Darwin Core fields and unknown dynamic properties;
10. delete targets only the selected occurrence;
11. viewers without create/update/delete permission cannot trigger mutations;
12. a failed PDS write remains visibly unsaved and can be retried.

An end-to-end smoke test should upload or select a real AudioMoth recording,
draw two boxes, publish both, reload the page, verify both occurrences return
from the PDS, edit one, delete the other, and confirm the source audio record is
unchanged.
