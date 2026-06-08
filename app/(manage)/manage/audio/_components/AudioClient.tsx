"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "./audio-copy";
import { ChevronLeftIcon } from "lucide-react";
import Container from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import TelegramIcon from "@/icons/TelegramIcon";
import { AudioSectionTabs } from "./AudioSectionTabs";
import { CreatePanel, DetailPanel, ListPanel } from "./AudioPanels";
import { FlowChart } from "./FlowChart";
import { MODES, SECTIONS, TELEGRAM_BOT_URL, type AudioWorkspaceData, type Section } from "./types";

type Mode = (typeof MODES)[number];

interface AudioClientProps {
  did: string;
}

function isSection(value: string | null): value is Section {
  return SECTIONS.includes(value as Section);
}

function isMode(value: string | null): value is Mode {
  return MODES.includes(value as Mode);
}

export function AudioClient({ did }: AudioClientProps) {
  const t = useTranslations("upload.audio");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = isSection(searchParams.get("section")) ? searchParams.get("section") as Section : "events";
  const mode = isMode(searchParams.get("mode")) ? searchParams.get("mode") as Mode : "list";
  const selectedUri = searchParams.get("uri") ?? "";
  const searchQuery = searchParams.get("q") ?? "";

  const [workspace, setWorkspace] = useState<AudioWorkspaceData>({ events: [], deployments: [], recordings: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setQueryState = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadAudio = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/manage/audio", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void loadAudio();
  }, [loadAudio]);

  const invalidateAudio = () => {
    void loadAudio();
  };

  const showList = (target: Section) => {
    setQueryState({ section: target, mode: "list", uri: null });
  };

  const openNew = (target: Section) => {
    setQueryState({ section: target, mode: "new", uri: null });
  };

  const openDetail = (target: Section, uri: string) => {
    setQueryState({ section: target, mode: "detail", uri });
  };

  const backToList = () => {
    setQueryState({ mode: "list", uri: null });
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
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="ml-2 font-medium text-lg">
            {t("howDoesThisWork")}
          </span>
          <Button asChild size="sm">
            <Link href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer">
              <TelegramIcon /> {t("useTaina")}
            </Link>
          </Button>
        </div>
        <div className="rounded-2xl bg-muted p-1 text-sm text-muted-foreground">
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
          onUpdated={invalidateAudio}
          onOpenDetail={openDetail}
        />
      ) : (
        <ListPanel
          section={section}
          searchQuery={searchQuery}
          onSearchChange={(value) => setQueryState({ q: value || null })}
          events={events}
          deployments={deployments}
          recordings={recordings}
          onNew={() => openNew(section)}
          onOpenDetail={openDetail}
        />
      )}
    </Container>
  );
}
