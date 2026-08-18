"use client";

import { useEffect, useState } from "react";

/**
 * Whether the signed-in account currently holds a Rewilding the Web grant
 * slot — the sidebar uses it to reveal the "My grant" / "My recorders"
 * entries. Cosmetic only (the routes re-check server-side), so it fails
 * closed to false and caches per DID for the session: enrollment changes at
 * most a handful of times over the whole program.
 */
const enrollmentByDid = new Map<string, boolean>();
const inflightByDid = new Map<string, Promise<boolean>>();

async function fetchEnrollment(did: string): Promise<boolean> {
  const cached = enrollmentByDid.get(did);
  if (cached !== undefined) return cached;
  let inflight = inflightByDid.get(did);
  if (!inflight) {
    inflight = fetch("/api/rewilding/enrollment")
      .then(async (response) => {
        if (!response.ok) return false;
        const json = (await response.json().catch(() => null)) as { enrolled?: boolean } | null;
        return json?.enrolled === true;
      })
      .catch(() => false)
      .then((enrolled) => {
        enrollmentByDid.set(did, enrolled);
        inflightByDid.delete(did);
        return enrolled;
      });
    inflightByDid.set(did, inflight);
  }
  return inflight;
}

export function useIsRewildingGrantee(sessionDid: string | null): boolean {
  const [enrolled, setEnrolled] = useState(
    () => (sessionDid ? enrollmentByDid.get(sessionDid) : undefined) ?? false,
  );

  useEffect(() => {
    if (!sessionDid) {
      setEnrolled(false);
      return;
    }
    let cancelled = false;
    fetchEnrollment(sessionDid).then((value) => {
      if (!cancelled) setEnrolled(value);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionDid]);

  return sessionDid ? enrolled : false;
}
