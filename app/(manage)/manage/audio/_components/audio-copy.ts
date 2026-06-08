"use client";

const MESSAGES = {
  upload: {
    actions: {
      retry: "Retry",
      back: "Back",
      edit: "Edit",
      delete: "Delete",
      save: "Save",
      saving: "Saving…",
      upload: "Upload",
      uploading: "Uploading…",
      confirm: "Confirm",
      add: "Add",
      cancel: "Cancel",
      registerOrganization: "Register as an Organization",
      apply: "Apply",
      clear: "Clear",
    },
    errors: {
      audioTitle: "Could not load audio",
      audioDescription: "Refresh the page and try again.",
      tryAgain: "Try again",
    },
    audio: {
      title: "Audio Recordings",
      description: "Upload and manage audio recordings for your organization.",
      searchPlaceholder: "Search recordings…",
      emptyTitle: "No recordings yet",
      emptyDescription: "Upload your first audio recording to get started.",
      noSearchResults: "No recordings match your search.",
      addRecording: "Add recording",
      untitled: "Untitled Recording",
      untitledShort: "Untitled",
      uploadSuccess: "Recording uploaded successfully",
      updateSuccess: "Recording updated successfully",
      editTitle: "Edit: {name}",
      addTitle: "Add a Recording",
      replaceFile: "Replace audio file (optional)",
      audioFile: "Audio file",
      dropPlaceholder: "Drop or click to upload audio",
      fileRequirements: "WAV, MP3, M4A, AAC, FLAC, OGG, WebM, AIFF (max 100 MB)",
      name: "Name",
      namePlaceholder: "Morning bird calls",
      descriptionOptional: "Description (optional)",
      descriptionPlaceholder: "Recorded at the main observation site",
      recordedAt: "Recorded at",
      browserUnsupported: "Your browser does not support the audio element.",
      unavailable: "Audio unavailable",
      deleteConfirmTitle: "Delete this recording?",
      deleteConfirmDescription: "This action cannot be undone.",
      howDoesThisWork: "How does this work?",
      useTaina: "Use Taina",
      fileSizeNote: "Files uploaded here must be 4MB or smaller. For larger AudioMoth files, please use Taina.",
      loading: "Loading audio workspace…",
      backTo: "Back to {section}",
      sections: {
        events: "Events",
        deployments: "Deployments",
        recordings: "Audio recordings",
        recordingsTab: "Audio",
      },
      list: {
        new: "New",
        noYet: "No {section} yet",
        searchPlaceholder: "Search {section}…",
        noResults: "No {section} match \"{query}\".",
        emptyEvents: "Create an event to anchor where and when the acoustic survey happened.",
        emptyDeployments: "Add a deployment to connect an AudioMoth or recorder to an event.",
        emptyRecordings: "Upload a short recording here, or use Taina for files larger than 4MB.",
        eventMeta: "{deployments} deployments · {audio} recordings",
        deploymentMeta: "{audio} recordings · deployed {date}",
        untitledRecording: "Untitled recording",
        noDate: "No recording date",
      },
      detail: {
        inThisEvent: "In this event",
        relatedItems: "Related items",
        audioContext: "Audio context",
        emptyEvent: "Deployments and recordings linked to this event will appear here.",
        emptyDeployment: "Link this deployment to an event, then attach recordings to build context.",
        emptyRecording: "Select a deployment to connect this recording to place and survey context.",
        notFound: "Item not found. It may still be getting ready.",
        audioLabel: "Audio",
        eventLabel: "Event",
        deploymentLabel: "Deployment",
        untitled: "Untitled",
      },
      forms: {
        createEvent: "Create event",
        editEvent: "Edit event",
        createDeployment: "Create deployment",
        editDeployment: "Edit deployment",
        uploadRecording: "Upload audio recording",
        editRecording: "Edit audio recording",
        eventId: "Event name",
        eventDateRange: "Event date/range",
        samplingProtocol: "How was the audio collected?",
        recordedBy: "Recorded by",
        habitat: "Habitat",
        latitude: "Latitude",
        longitude: "Longitude",
        country: "Country",
        locality: "Locality",
        weatherRemarks: "Weather remarks",
        eventRemarks: "Event remarks",
        deploymentName: "Deployment name",
        event: "Event",
        noEventSelected: "No event selected",
        deviceModel: "Device model",
        serialNumber: "Serial number",
        gain: "Gain",
        sampleRateHz: "Configured sample rate Hz",
        recordingSchedule: "Recording schedule",
        deployedAt: "Deployed at",
        retrievedAt: "Retrieved at",
        altitude: "Altitude",
        remarks: "Remarks",
        name: "Name",
        deployment: "Deployment",
        noDeploymentSelected: "No deployment selected",
        linkedEvent: "Linked event: {eventId}",
        description: "Description",
        recordedAt: "Recorded at",
        license: "License",
        tags: "Tags",
        dropPlaceholder: "Drop or click to upload audio",
        fileFormats: "WAV, MP3, M4A, AAC, FLAC, OGG, Opus, WebM, or AIFF. Files must be {maxSize} or smaller; send larger AudioMoth files through Taina.",
        fileTooLarge: "This file is larger than 4MB. Please use @TheTainaBot for larger files.",
        optionalSpecies: "Optional species found",
        optionalSpeciesHint: "Add the species you or a tool identified in this recording.",
        scientificName: "Scientific name",
        commonName: "Common/local name",
        basisOfRecord: "Observation type",
        machineObservation: "Machine observation",
        humanObservation: "Human observation",
        identifiedBy: "Identified by",
        identificationRemarks: "Identification remarks",
        speciesNotes: "Species notes",
        savingUpload: "Saving your upload",
        recordedAtInvalid: "Please enter a valid recorded at date.",
      },
    },
  },
} as const;

type MessageTree = string | { readonly [key: string]: MessageTree };

function lookup(namespace: string, key: string): string {
  const parts = `${namespace}.${key}`.split(".");
  let current: MessageTree = MESSAGES;
  for (const part of parts) {
    if (typeof current === "string") return key;
    current = current[part];
    if (current === undefined) return key;
  }
  return typeof current === "string" ? current : key;
}

function interpolate(template: string, values?: Record<string, string | number | null | undefined>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

export function useTranslations(namespace: string) {
  return (key: string, values?: Record<string, string | number | null | undefined>) => interpolate(lookup(namespace, key), values);
}

export function useFormatter() {
  return {
    dateTime(date: Date, options?: Intl.DateTimeFormatOptions) {
      return new Intl.DateTimeFormat("en-US", options).format(date);
    },
    number(value: number, options?: Intl.NumberFormatOptions) {
      return new Intl.NumberFormat("en-US", options).format(value);
    },
  };
}
