"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

type PersonId = "maria" | "kai" | "ana";
type AppId = "forest" | "feed";

// Fictional people with distinct colors so their packets are easy to follow.
// Names are not UI copy, same convention as the CGS shared-repo toy.
const PEOPLE: { id: PersonId; name: string; color: string; y: number }[] = [
  { id: "maria", name: "Maria", color: "#10b981", y: 62 },
  { id: "kai", name: "Kai", color: "#0ea5e9", y: 150 },
  { id: "ana", name: "Ana", color: "#f59e0b", y: 238 },
];

const RELAY = { x: 360, y: 150 };
const APPS: { id: AppId; x: number; y: number }[] = [
  { id: "forest", x: 610, y: 84 },
  { id: "feed", x: 610, y: 216 },
];
const PDS_X = 110;

type Packet = {
  id: number;
  color: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  fanOut?: boolean;
  app?: AppId;
};

// The publish playground: tap a person and watch their record travel from
// their own data server to the relay, then fan out to every app that listens
// to the shared firehose. Both apps see the same record at the same time.
export function Firehose() {
  const t = useTranslations("common.atproto.flow");
  const [packets, setPackets] = useState<Packet[]>([]);
  const [counts, setCounts] = useState<Record<AppId, number>>({ forest: 0, feed: 0 });
  const nextId = useRef(1);

  function publish(person: (typeof PEOPLE)[number]) {
    const id = nextId.current++;
    setPackets((current) => [
      ...current,
      {
        id,
        color: person.color,
        from: { x: PDS_X + 62, y: person.y },
        to: { x: RELAY.x, y: RELAY.y },
        fanOut: true,
      },
    ]);
  }

  function packetDone(packet: Packet) {
    // First leg finished at the relay: fan out one packet per app. The new
    // packets are built outside the state updater so it stays pure.
    const fanned = packet.fanOut
      ? APPS.map((app) => ({
          id: nextId.current++,
          color: packet.color,
          from: { x: RELAY.x, y: RELAY.y },
          to: { x: app.x - 66, y: app.y },
          app: app.id,
        }))
      : [];
    setPackets((current) => [...current.filter((p) => p.id !== packet.id), ...fanned]);
    if (packet.app) {
      const app = packet.app;
      setCounts((c) => ({ ...c, [app]: c[app] + 1 }));
    }
  }

  const appLabels: Record<AppId, string> = {
    forest: t("appForest"),
    feed: t("appFeed"),
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap justify-center gap-2">
        {PEOPLE.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => publish(person)}
            className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors hover:bg-primary/10"
            style={{ borderColor: `${person.color}66`, color: person.color }}
          >
            {t("publishAs", { name: person.name })}
          </button>
        ))}
      </div>

      <svg viewBox="0 0 720 300" className="mx-auto block w-full" style={{ maxWidth: 640 }} role="img" aria-label={t("aria")}>
        {/* wires */}
        {PEOPLE.map((p) => (
          <line key={p.id} x1={PDS_X + 62} y1={p.y} x2={RELAY.x - 52} y2={RELAY.y} stroke="var(--border)" strokeDasharray="3 4" />
        ))}
        {APPS.map((a) => (
          <line key={a.id} x1={RELAY.x + 52} y1={RELAY.y} x2={a.x - 66} y2={a.y} stroke="var(--border)" strokeDasharray="3 4" />
        ))}

        {/* people and their data servers */}
        {PEOPLE.map((p) => (
          <g key={p.id}>
            <circle cx={34} cy={p.y} r={13} fill={`${p.color}22`} stroke={p.color} strokeWidth={1.2} />
            <text x={34} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill={p.color}>
              {p.name[0]}
            </text>
            <rect x={PDS_X - 52} y={p.y - 19} width={114} height={38} rx={10} fill="var(--background)" stroke="var(--border)" />
            <text x={PDS_X + 5} y={p.y + 4} textAnchor="middle" fontSize="11.5" className="font-mono" fill="var(--muted-foreground)">
              {t("pdsLabel")}
            </text>
            <line x1={47} y1={p.y} x2={PDS_X - 52} y2={p.y} stroke="var(--border)" />
          </g>
        ))}

        {/* relay */}
        <rect x={RELAY.x - 52} y={RELAY.y - 26} width={104} height={52} rx={12} fill="var(--background)" stroke="var(--primary)" strokeWidth={1.3} />
        <text x={RELAY.x} y={RELAY.y + 4.5} textAnchor="middle" fontSize="12.5" className="font-mono" fill="var(--primary)">
          {t("relayLabel")}
        </text>

        {/* apps with live counters */}
        {APPS.map((a) => (
          <g key={a.id}>
            <rect x={a.x - 66} y={a.y - 26} width={150} height={52} rx={12} fill="var(--background)" stroke="var(--border)" />
            <text x={a.x + 9} y={a.y - 3} textAnchor="middle" fontSize="12" className="font-mono" fill="var(--foreground)">
              {appLabels[a.id]}
            </text>
            <text x={a.x + 9} y={a.y + 15} textAnchor="middle" fontSize="10.5" className="font-mono" fill="var(--muted-foreground)">
              {t("received", { count: counts[a.id] })}
            </text>
          </g>
        ))}

        {/* traveling records */}
        {packets.map((packet) => (
          <motion.circle
            key={packet.id}
            r={5.5}
            fill={packet.color}
            initial={{ cx: packet.from.x, cy: packet.from.y, opacity: 0.4 }}
            animate={{ cx: packet.to.x, cy: packet.to.y, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            onAnimationComplete={() => packetDone(packet)}
          />
        ))}
      </svg>

      <p className="mx-auto mt-3 max-w-xl text-center text-[12.5px] leading-relaxed text-muted-foreground/80">
        {t("caption")}
      </p>
    </div>
  );
}
