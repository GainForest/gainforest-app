import { describe, expect, it } from "vitest";
import {
  SITE_DEFAULT_POINTER_COLLECTION,
  SITE_ORG_PROFILE_COLLECTION,
  SITE_PROJECT_COLLECTION,
  scanSiteReferences,
  siteInUseMessage,
} from "./site-references";

const DID = "did:plc:test";
const SITE_URI = `at://${DID}/app.certified.location/site-1`;
const OTHER_SITE_URI = `at://${DID}/app.certified.location/site-2`;

const emptyRepo = {
  certs: [],
  projects: [],
  orgProfile: null,
  defaultSitePointer: null,
};

describe("scanSiteReferences", () => {
  it("finds nothing in an empty repo", () => {
    const scan = scanSiteReferences(SITE_URI, emptyRepo);
    expect(scan.blockingCertTitles).toEqual([]);
    expect(scan.cleanups).toEqual([]);
  });

  it("blocks when a Cert lists the site as a place", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      certs: [
        {
          uri: `at://${DID}/org.hypercerts.claim.activity/cert-1`,
          value: { title: "Forest Nursery", locations: [{ uri: OTHER_SITE_URI }, { uri: SITE_URI }] },
        },
        {
          uri: `at://${DID}/org.hypercerts.claim.activity/cert-2`,
          value: { title: "Unrelated Cert", locations: [{ uri: OTHER_SITE_URI }] },
        },
      ],
    });
    expect(scan.blockingCertTitles).toEqual(["Forest Nursery"]);
    expect(scan.cleanups).toEqual([]);
  });

  it("labels untitled Certs without crashing", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      certs: [{ uri: `at://${DID}/org.hypercerts.claim.activity/cert-1`, value: { locations: [{ uri: SITE_URI }] } }],
    });
    expect(scan.blockingCertTitles).toEqual(["an untitled Cert"]);
  });

  it("drops the location pointer from projects that reference the site", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      projects: [
        {
          uri: `at://${DID}/org.hypercerts.collection/proj-1`,
          value: { title: "My project", location: { uri: SITE_URI, cid: "bafy..." }, items: [] },
        },
        {
          uri: `at://${DID}/org.hypercerts.collection/proj-2`,
          value: { title: "Elsewhere", location: { uri: OTHER_SITE_URI, cid: "bafy..." } },
        },
      ],
    });
    expect(scan.blockingCertTitles).toEqual([]);
    expect(scan.cleanups).toEqual([
      {
        kind: "putRecord",
        collection: SITE_PROJECT_COLLECTION,
        rkey: "proj-1",
        record: { title: "My project", items: [] },
      },
    ]);
  });

  it("drops the org profile's location pointer", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      orgProfile: {
        rkey: "self",
        value: { $type: "app.certified.actor.organization", location: { uri: SITE_URI, cid: "bafy..." }, urls: [] },
      },
    });
    expect(scan.cleanups).toEqual([
      {
        kind: "putRecord",
        collection: SITE_ORG_PROFILE_COLLECTION,
        rkey: "self",
        record: { $type: "app.certified.actor.organization", urls: [] },
      },
    ]);
  });

  it("deletes the default-site pointer when it points at the site", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      defaultSitePointer: { rkey: "self", value: { site: SITE_URI, createdAt: "2026-01-01T00:00:00Z" } },
    });
    expect(scan.cleanups).toEqual([
      { kind: "deleteRecord", collection: SITE_DEFAULT_POINTER_COLLECTION, rkey: "self" },
    ]);
  });

  it("leaves unrelated pointers alone", () => {
    const scan = scanSiteReferences(SITE_URI, {
      ...emptyRepo,
      orgProfile: { rkey: "self", value: { location: { uri: OTHER_SITE_URI } } },
      defaultSitePointer: { rkey: "self", value: { site: OTHER_SITE_URI } },
    });
    expect(scan.cleanups).toEqual([]);
  });

  it("tolerates malformed records", () => {
    const scan = scanSiteReferences(SITE_URI, {
      certs: [
        { uri: `at://${DID}/org.hypercerts.claim.activity/bad-1`, value: null },
        { uri: `at://${DID}/org.hypercerts.claim.activity/bad-2`, value: { locations: "not-an-array" } },
      ],
      projects: [{ uri: `at://${DID}/org.hypercerts.collection/bad-3`, value: 42 }],
      orgProfile: { rkey: "self", value: "nope" },
      defaultSitePointer: { rkey: "self", value: null },
    });
    expect(scan.blockingCertTitles).toEqual([]);
    expect(scan.cleanups).toEqual([]);
  });
});

describe("siteInUseMessage", () => {
  it("names a single Cert", () => {
    expect(siteInUseMessage(["Forest Nursery"])).toBe(
      "This site can't be deleted because the Cert “Forest Nursery” uses it as a place. Remove the site from that Cert (or delete the Cert) first.",
    );
  });

  it("counts and names multiple Certs", () => {
    const message = siteInUseMessage(["A", "B"]);
    expect(message).toContain("2 Certs");
    expect(message).toContain("“A”, “B”");
  });
});
