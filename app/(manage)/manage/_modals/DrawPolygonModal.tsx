"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal/modal";
import { useModal } from "@/components/ui/modal/context";
import { ChevronLeftIcon, Loader2Icon } from "lucide-react";

export const DrawPolygonModalId = "draw-polygon";
const POLYGONS_APP_URL = "https://polygons-gainforest.vercel.app";

type Point = { lng: number; lat: number };

function pointsToGeoJSON(points: Point[]): string {
  if (points.length < 3) throw new Error("A drawn map area needs at least 3 points.");
  const coordinates = points.map((p) => [p.lng, p.lat] as [number, number]);
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    coordinates.push([first[0], first[1]]);
  }
  return JSON.stringify({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coordinates] },
    properties: {},
  });
}

function processPolygonData(data: unknown): string | null {
  if (data === null || (Array.isArray(data) && data.length === 0)) return null;
  if (Array.isArray(data)) {
    try { return pointsToGeoJSON(data as Point[]); } catch { return null; }
  }
  if (typeof data === "string") {
    try { JSON.parse(data); return data; } catch { return null; }
  }
  if (data && typeof data === "object") {
    try { return JSON.stringify(data); } catch { return null; }
  }
  return null;
}

export type DrawPolygonModalProps = {
  onSubmit: (polygonJSONString: string) => void;
};

export function DrawPolygonModal({ onSubmit }: DrawPolygonModalProps) {
  const { popModal, stack, hide } = useModal();
  const [polygonData, setPolygonData] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== POLYGONS_APP_URL) return;
      if (event.data?.type === "polygon-data") {
        setPolygonData(processPolygonData(event.data.data));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!polygonData) return;
    onSubmit(polygonData);
    if (stack.length === 1) {
      hide().then(() => popModal());
    } else {
      popModal();
    }
  }, [polygonData, onSubmit, stack.length, hide, popModal]);

  return (
    <ModalContent className="px-0 py-0" dismissible={false}>
      <div className="sr-only">
        <ModalHeader>
          <ModalTitle>Draw site boundary</ModalTitle>
          <ModalDescription>
            Draw a map area to define your site boundary.
          </ModalDescription>
        </ModalHeader>
      </div>
      <div className="relative w-full">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted">
            <Loader2Icon className="animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          src={`${POLYGONS_APP_URL}/draw`}
          className="h-[500px] w-full overflow-hidden rounded-lg"
          title="Draw site area"
          onLoad={() => setIframeLoaded(true)}
        />
        {stack.length > 1 && (
          <Button
            className="absolute left-3 top-3 rounded-full"
            variant="outline"
            size="icon-sm"
            onClick={() => popModal()}
          >
            <ChevronLeftIcon />
          </Button>
        )}
      </div>
      <ModalFooter>
        <Button onClick={handleSubmit} disabled={!polygonData}>
          Done
        </Button>
      </ModalFooter>
    </ModalContent>
  );
}
