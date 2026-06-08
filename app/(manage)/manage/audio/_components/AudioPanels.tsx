"use client";

import { useMemo, type ReactNode } from "react";
import { CirclePlusIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "./audio-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AudioRecordingItem } from "@/app/_lib/indexer";
import type { AudioDeploymentItem } from "@/app/_lib/indexer";
import type { AudioEventItem } from "@/app/_lib/indexer";
import { formatDate, getAudioMeta, textFromDescription } from "./audio-utils";
import type { Section } from "./types";
import { AudioForm, DeploymentForm, EventForm } from "./AudioForms";

export function ListPanel(props: {
  section: Section;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  events: AudioEventItem[];
  deployments: AudioDeploymentItem[];
  recordings: AudioRecordingItem[];
  onNew: () => void;
  onOpenDetail: (section: Section, uri: string) => void;
}) {
  const t = useTranslations("upload.audio");

  const filtered = useMemo(() => {
    const query = props.searchQuery.toLowerCase();
    if (props.section === "events") {
      return props.events.filter((event) =>
        [
          event.record.eventID,
          event.record.eventDate,
          event.record.locality,
          event.record.country,
        ].some((value) => (value ?? "").toLowerCase().includes(query)),
      );
    }
    if (props.section === "deployments") {
      return props.deployments.filter((deployment) =>
        [
          deployment.record.name,
          deployment.record.deviceModel,
          deployment.record.habitat,
        ].some((value) => (value ?? "").toLowerCase().includes(query)),
      );
    }
    return props.recordings.filter((recording) =>
      [
        recording.record.name,
        textFromDescription(recording.record.description),
      ].some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  }, [
    props.deployments,
    props.events,
    props.recordings,
    props.searchQuery,
    props.section,
  ]);

  const sectionLabel =
    props.section === "events"
      ? t("sections.events")
      : props.section === "deployments"
        ? t("sections.deployments")
        : t("sections.recordings");

  const emptyMessage =
    props.section === "events"
      ? t("list.emptyEvents")
      : props.section === "deployments"
        ? t("list.emptyDeployments")
        : t("list.emptyRecordings");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between w-full gap-2">
        <div className="relative max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.searchQuery}
            onChange={(event) => props.onSearchChange(event.target.value)}
            placeholder={t("list.searchPlaceholder", {
              section: sectionLabel.toLowerCase(),
            })}
            className="pl-9"
          />
        </div>
        <Button onClick={props.onNew} className="rounded-full">
          <CirclePlusIcon className="size-4" /> {t("list.new")}
        </Button>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {props.searchQuery
              ? t("list.noResults", {
                  section: sectionLabel.toLowerCase(),
                  query: props.searchQuery,
                })
              : t("list.noYet", { section: sectionLabel.toLowerCase() })}
          </p>
          {!props.searchQuery && (
            <p className="mx-auto mt-2 max-w-md">{emptyMessage}</p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((item) => {
            if (props.section === "events") {
              const event = item as AudioEventItem;
              const linkedDeployments = props.deployments.filter(
                (deployment) =>
                  deployment.record.eventRef === event.metadata.uri,
              ).length;
              const linkedAudio = props.recordings.filter((recording) =>
                props.deployments.some(
                  (deployment) =>
                    deployment.metadata.uri ===
                      recording.record.deploymentRef &&
                    deployment.record.eventRef === event.metadata.uri,
                ),
              ).length;
              return (
                <RecordCard
                  key={event.metadata.uri}
                  title={event.record.eventID}
                  subtitle={event.record.eventDate}
                  meta={t("list.eventMeta", {
                    deployments: linkedDeployments,
                    audio: linkedAudio,
                  })}
                  onClick={() =>
                    props.onOpenDetail("events", event.metadata.uri)
                  }
                />
              );
            }
            if (props.section === "deployments") {
              const deployment = item as AudioDeploymentItem;
              const linkedAudio = props.recordings.filter(
                (recording) =>
                  recording.record.deploymentRef === deployment.metadata.uri,
              ).length;
              return (
                <RecordCard
                  key={deployment.metadata.uri}
                  title={deployment.record.name}
                  subtitle={deployment.record.deviceModel}
                  meta={t("list.deploymentMeta", {
                    audio: linkedAudio,
                    date: formatDate(deployment.record.deployedAt),
                  })}
                  onClick={() =>
                    props.onOpenDetail("deployments", deployment.metadata.uri)
                  }
                />
              );
            }
            const recording = item as AudioRecordingItem;
            const meta = getAudioMeta(recording);
            return (
              <RecordCard
                key={recording.metadata.uri}
                title={recording.record.name ?? t("list.untitledRecording")}
                subtitle={String(meta.recordedAt ?? t("list.noDate"))}
                meta={`${String(meta.duration ?? "0")}s · ${String(meta.sampleRate ?? "?")} Hz`}
                onClick={() =>
                  props.onOpenDetail("recordings", recording.metadata.uri)
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function RecordCard(props: {
  title: string | null;
  subtitle?: string | null;
  meta: string;
  onClick: () => void;
}) {
  const t = useTranslations("upload.audio.detail");
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-2xl border p-4 text-left transition hover:border-primary/50 hover:bg-muted/30"
    >
      <p className="font-medium">{props.title ?? t("untitled")}</p>
      {props.subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{props.subtitle}</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{props.meta}</p>
    </button>
  );
}

export function CreatePanel(props: {
  section: Section;
  events: AudioEventItem[];
  deployments: AudioDeploymentItem[];
  onCreated: () => void;
  onOpenDetail: (section: Section, uri: string) => void;
}) {
  if (props.section === "events")
    return (
      <EventForm
        mode="create"
        onSaved={(uri) => {
          props.onCreated();
          props.onOpenDetail("events", uri);
        }}
      />
    );
  if (props.section === "deployments")
    return (
      <DeploymentForm
        mode="create"
        events={props.events}
        onSaved={(uri) => {
          props.onCreated();
          props.onOpenDetail("deployments", uri);
        }}
      />
    );
  return (
    <AudioForm
      mode="create"
      events={props.events}
      deployments={props.deployments}
      onSaved={(uri) => {
        props.onCreated();
        props.onOpenDetail("recordings", uri);
      }}
    />
  );
}

export function DetailPanel(props: {
  section: Section;
  selectedEvent: AudioEventItem | null;
  selectedDeployment: AudioDeploymentItem | null;
  selectedRecording: AudioRecordingItem | null;
  events: AudioEventItem[];
  deployments: AudioDeploymentItem[];
  recordings: AudioRecordingItem[];
  onUpdated: () => void;
  onOpenDetail: (section: Section, uri: string) => void;
}) {
  const t = useTranslations("upload.audio.detail");

  if (props.section === "events" && props.selectedEvent) {
    const eventDeployments = props.deployments.filter(
      (deployment) =>
        deployment.record.eventRef === props.selectedEvent?.metadata.uri,
    );
    const eventAudio = props.recordings.filter((recording) =>
      eventDeployments.some(
        (deployment) =>
          recording.record.deploymentRef === deployment.metadata.uri,
      ),
    );
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EventForm
          mode="edit"
          event={props.selectedEvent}
          onSaved={() => props.onUpdated()}
        />
        <RelationshipPanel title={t("inThisEvent")}>
          {eventDeployments.length === 0 && eventAudio.length === 0 && (
            <EmptyRelation>{t("emptyEvent")}</EmptyRelation>
          )}
          {eventDeployments.map((deployment) => (
            <MiniLink
              key={deployment.metadata.uri}
              label={deployment.record.name}
              detail={t("deploymentLabel")}
              onClick={() =>
                props.onOpenDetail("deployments", deployment.metadata.uri)
              }
            />
          ))}
          {eventAudio.map((recording) => (
            <MiniLink
              key={recording.metadata.uri}
              label={recording.record.name ?? t("untitled")}
              detail={t("audioLabel")}
              onClick={() =>
                props.onOpenDetail("recordings", recording.metadata.uri)
              }
            />
          ))}
        </RelationshipPanel>
      </div>
    );
  }
  if (props.section === "deployments" && props.selectedDeployment) {
    const linkedEvent =
      props.events.find(
        (event) =>
          event.metadata.uri === props.selectedDeployment?.record.eventRef,
      ) ?? null;
    const deploymentAudio = props.recordings.filter(
      (recording) =>
        recording.record.deploymentRef ===
        props.selectedDeployment?.metadata.uri,
    );
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DeploymentForm
          mode="edit"
          deployment={props.selectedDeployment}
          events={props.events}
          onSaved={() => props.onUpdated()}
        />
        <RelationshipPanel title={t("relatedItems")}>
          {!linkedEvent && deploymentAudio.length === 0 && (
            <EmptyRelation>{t("emptyDeployment")}</EmptyRelation>
          )}
          {linkedEvent && (
            <MiniLink
              label={linkedEvent.record.eventID}
              detail={t("eventLabel")}
              onClick={() =>
                props.onOpenDetail("events", linkedEvent.metadata.uri)
              }
            />
          )}
          {deploymentAudio.map((recording) => (
            <MiniLink
              key={recording.metadata.uri}
              label={recording.record.name ?? t("untitled")}
              detail={t("audioLabel")}
              onClick={() =>
                props.onOpenDetail("recordings", recording.metadata.uri)
              }
            />
          ))}
        </RelationshipPanel>
      </div>
    );
  }
  if (props.section === "recordings" && props.selectedRecording) {
    const linkedDeployment =
      props.deployments.find(
        (deployment) =>
          deployment.metadata.uri ===
          props.selectedRecording?.record.deploymentRef,
      ) ?? null;
    const linkedEvent =
      props.events.find(
        (event) => event.metadata.uri === linkedDeployment?.record.eventRef,
      ) ?? null;
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AudioForm
          mode="edit"
          recording={props.selectedRecording}
          events={props.events}
          deployments={props.deployments}
          onSaved={() => props.onUpdated()}
        />
        <RelationshipPanel title={t("audioContext")}>
          {!linkedDeployment && !linkedEvent && (
            <EmptyRelation>{t("emptyRecording")}</EmptyRelation>
          )}
          {linkedDeployment && (
            <MiniLink
              label={linkedDeployment.record.name}
              detail={t("deploymentLabel")}
              onClick={() =>
                props.onOpenDetail("deployments", linkedDeployment.metadata.uri)
              }
            />
          )}
          {linkedEvent && (
            <MiniLink
              label={linkedEvent.record.eventID}
              detail={t("eventLabel")}
              onClick={() =>
                props.onOpenDetail("events", linkedEvent.metadata.uri)
              }
            />
          )}
        </RelationshipPanel>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
      {t("notFound")}
    </div>
  );
}

function RelationshipPanel(props: { title: string; children: ReactNode }) {
  return (
    <aside className="space-y-3 rounded-2xl border p-4">
      <h3 className="font-medium">{props.title}</h3>
      <div className="space-y-2">{props.children}</div>
    </aside>
  );
}

function EmptyRelation(props: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
      {props.children}
    </p>
  );
}

function MiniLink(props: {
  label: string | null;
  detail: string | null;
  onClick: () => void;
}) {
  const t = useTranslations("upload.audio.detail");
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="w-full rounded-xl border p-3 text-left text-sm hover:bg-muted/40"
    >
      <p className="font-medium">{props.label ?? t("untitled")}</p>
      {props.detail && (
        <p className="text-xs text-muted-foreground">{props.detail}</p>
      )}
    </button>
  );
}
