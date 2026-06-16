"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useTranslations } from "./audio-copy";
import { ChevronLeftIcon, HelpCircleIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import TelegramIcon from "@/icons/TelegramIcon";
import { AudioSectionTabs } from "./AudioSectionTabs";
import { CreatePanel, DetailPanel, ListPanel } from "./AudioPanels";
import { FlowChart } from "./FlowChart";
import { MODES, SECTIONS, TELEGRAM_BOT_URL, type AudioWorkspaceData, type Section } from "./types";
import { manageApiHref, type ManageTarget } from "@/lib/links";
import { canCreateRecord, canUpdateRecord } from "../../_lib/cgs-permissions";
import { configureAudioMutationRepo } from "./audio-mutations";

type Mode = (typeof MODES)[number];

const QUERY_STATE_OPTIONS = { history: "replace", scroll: false, shallow: true } as const;
const SEARCH_QUERY_STATE_OPTIONS = { ...QUERY_STATE_OPTIONS, throttleMs: 200 } as const;

interface AudioClientProps {
  did: string;
  target: ManageTarget;
}

export function AudioClient({ did, target }: AudioClientProps) {
  const t = useTranslations("upload.audio");
  const [section, setSection] = useQueryState(
    "section",
    parseAsStringEnum<Section>([...SECTIONS]).withDefault("events").withOptions(QUERY_STATE_OPTIONS),
  );
  const [mode, setMode] = useQueryState(
    "mode",
    parseAsStringEnum<Mode>([...MODES]).withDefault("list").withOptions(QUERY_STATE_OPTIONS),
  );
  const [selectedUri, setSelectedUri] = useQueryState(
    "uri",
    parseAsString.withDefault("").withOptions(QUERY_STATE_OPTIONS),
  );
  const [searchQuery, setSearchQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions(SEARCH_QUERY_STATE_OPTIONS),
  );

  const [workspace, setWorkspace] = useState<AudioWorkspaceData>({ events: [], deployments: [], recordings: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createPermission = canCreateRecord(target);
  const updatePermission = canUpdateRecord(target);

  const loadAudio = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(manageApiHref("/api/manage/audio", target), { cache: "no-store" });
      const data = (await response.json()) as AudioWorkspaceData | { error?: string };
      if (!response.ok || "error" in data) {
        const message = "error" in data ? data.error : null;
        setError(message ?? "Could not load audio.");
        return;
      }
      setWorkspace(data as AudioWorkspaceData);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setIsLoading(false);
    }
  }, [target]);

  useEffect(() => {
    configureAudioMutationRepo(target.kind === "group" ? target.did : null);
    return () => configureAudioMutationRepo(null);
  }, [target]);

  useEffect(() => {
    void loadAudio();
  }, [loadAudio]);

  const invalidateAudio = () => {
    void loadAudio();
  };

  const showList = (target: Section) => {
    void setSection(target);
    void setMode("list");
    void setSelectedUri("");
  };

  const openNew = (target: Section) => {
    if (!createPermission.allowed) {
      setError(createPermission.reason ?? "You cannot create audio records for this organization.");
      return;
    }
    void setSection(target);
    void setMode("new");
    void setSelectedUri("");
  };

  const openDetail = (target: Section, uri: string) => {
    void setSection(target);
    void setMode("detail");
    void setSelectedUri(uri);
  };

  const backToList = () => {
    void setMode("list");
    void setSelectedUri("");
  };

  const { events, deployments, recordings } = workspace;

  const selectedEvent = useMemo(
    () => events.find((event) => event.metadata.uri === selectedUri) ?? null,
    [events, selectedUri],
  );
  const selectedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.metadata.uri === selectedUri) ?? null,
    [deployments, selectedUri],
  );
  const selectedRecording = useMemo(
    () => recordings.find((recording) => recording.metadata.uri === selectedUri) ?? null,
    [recordings, selectedUri],
  );

  const activeTitle =
    section === "events"
      ? t("sections.events")
      : section === "deployments"
        ? t("sections.deployments")
        : t("sections.recordings");

  return (
    <Container className="pt-4 pb-10 space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-xl">
            <h1 className="font-instrument text-2xl font-medium italic tracking-[-0.03em] text-foreground sm:text-3xl">My Audio</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("intro")}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button asChild size="sm">
              <Link href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
                <TelegramIcon />
                <span className="sm:hidden">{t("useTaina")}</span>
                <span className="hidden sm:inline">{t("useTainaLong")}</span>
              </Link>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <HelpCircleIcon className="size-3.5" />
                  {t("whatIsTaina")}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <TelegramIcon className="size-4 text-primary" />
                  <span className="font-instrument text-base font-medium italic text-foreground">
                    {t("tainaTitle")}
                  </span>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{t("tainaBody")}</p>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
                    <TelegramIcon /> {t("tainaCta")}
                  </Link>
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="rounded-2xl bg-muted p-1 text-sm text-muted-foreground">
          <p className="px-3 pt-1 pb-2 text-center text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {t("howDoesThisWork")}
          </p>
          <FlowChart />
          <p className="px-3 mt-1 text-center">{t("fileSizeNote")}</p>
        </div>
      </header>

      <AudioSectionTabs
        value={section}
        counts={{
          events: events.length,
          deployments: deployments.length,
          recordings: recordings.length,
        }}
        onChange={showList}
      />

      {mode !== "list" && (
        <Button variant="ghost" onClick={backToList} className="-ml-2">
          <ChevronLeftIcon className="size-4" />{" "}
          {t("backTo", { section: activeTitle.toLowerCase() })}
        </Button>
      )}

      {isLoading ? (
        <div className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center text-sm text-destructive">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadAudio()} className="mt-4">
            Retry
          </Button>
        </div>
      ) : mode === "new" ? (
        <CreatePanel
          section={section}
          events={events}
          deployments={deployments}
          createDisabledReason={createPermission.reason}
          onCreated={invalidateAudio}
          onOpenDetail={openDetail}
        />
      ) : mode === "detail" ? (
        <DetailPanel
          section={section}
          selectedEvent={selectedEvent}
          selectedDeployment={selectedDeployment}
          selectedRecording={selectedRecording}
          events={events}
          deployments={deployments}
          recordings={recordings}
          updateDisabledReason={updatePermission.reason}
          onUpdated={invalidateAudio}
          onOpenDetail={openDetail}
        />
      ) : (
        <ListPanel
          section={section}
          searchQuery={searchQuery}
          onSearchChange={(value) => void setSearchQuery(value || "")}
          events={events}
          deployments={deployments}
          recordings={recordings}
          createDisabledReason={createPermission.reason}
          onNew={() => openNew(section)}
          onOpenDetail={openDetail}
        />
      )}
    </Container>
  );
}
