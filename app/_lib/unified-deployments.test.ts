import { describe, expect, it } from "vitest";

import type { AcDeploymentItem } from "./ac-deployment";
import type { DeploymentEventItem } from "./deployment-events";
import {
  chimeDeploymentName,
  eventRenameEdit,
  isChimeEventUri,
  unifyDeployments,
} from "./unified-deployments";

const DID = "did:plc:owner";

function makeFolder(patch: Partial<AcDeploymentItem> & { uri: string }): AcDeploymentItem {
  return {
    $type: "app.gainforest.ac.deployment",
    name: "Folder",
    deviceModel: "AudioMoth",
    deployedAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    rkey: patch.uri.split("/").pop() ?? "",
    cid: "cid-folder",
    did: DID,
    ...patch,
  };
}

function makeEvent(patch: Partial<DeploymentEventItem> & { uri: string }): DeploymentEventItem {
  return {
    $type: "app.gainforest.dwc.event",
    eventID: "aabbccdd00112233",
    eventDate: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    rkey: patch.uri.split("/").pop() ?? "",
    cid: "cid-event",
    did: DID,
    ...patch,
  };
}

const folderUri = (rkey: string) => `at://${DID}/app.gainforest.ac.deployment/${rkey}`;
const eventUri = (rkey: string) => `at://${DID}/app.gainforest.dwc.event/${rkey}`;

describe("unifyDeployments", () => {
  it("shows a folder and its chime as one deployment, under the folder's name", () => {
    const event = makeEvent({ uri: eventUri("e1"), locality: "Old chime name" });
    const folder = makeFolder({ uri: folderUri("f1"), name: "River bend", eventRef: event.uri });

    const unified = unifyDeployments([folder], [event]);

    expect(unified).toHaveLength(1);
    expect(unified[0]!.name).toBe("River bend");
    expect(unified[0]!.uri).toBe(folder.uri);
    expect(unified[0]!.folder).toBe(folder);
    expect(unified[0]!.event).toBe(event);
    expect(unified[0]!.detailPath).toContain("/deployments/");
  });

  it("lists a chime with no folder as its own deployment, selectable by the event URI", () => {
    const event = makeEvent({ uri: eventUri("e1"), locality: "Ridge camp" });

    const unified = unifyDeployments([], [event]);

    expect(unified).toHaveLength(1);
    expect(unified[0]!.uri).toBe(event.uri);
    expect(unified[0]!.name).toBe("Ridge camp");
    expect(unified[0]!.folder).toBeNull();
    expect(unified[0]!.event).toBe(event);
  });

  it("never lists the same deployment twice, whatever the mix", () => {
    const chimed = makeEvent({ uri: eventUri("paired"), locality: "Paired" });
    const alone = makeEvent({ uri: eventUri("alone"), locality: "Alone" });
    const folderWithChime = makeFolder({
      uri: folderUri("with"),
      name: "Paired",
      eventRef: chimed.uri,
    });
    const plainFolder = makeFolder({ uri: folderUri("plain"), name: "Uploaded card" });

    const unified = unifyDeployments([folderWithChime, plainFolder], [chimed, alone]);

    expect(unified).toHaveLength(3);
    expect(unified.map((d) => d.uri).sort()).toEqual(
      [folderWithChime.uri, plainFolder.uri, alone.uri].sort(),
    );
  });

  it("keeps a folder whose chime record is gone, without inventing a chime row", () => {
    const folder = makeFolder({
      uri: folderUri("f1"),
      name: "Orphan",
      eventRef: eventUri("deleted"),
    });

    const unified = unifyDeployments([folder], []);

    expect(unified).toHaveLength(1);
    expect(unified[0]!.event).toBeNull();
    // The detail link still works — the page reads the event straight from the PDS.
    expect(unified[0]!.detailPath).toContain("/deployments/");
  });

  it("pairs a chime with only the first folder pointing at it", () => {
    const event = makeEvent({ uri: eventUri("e1") });
    const first = makeFolder({ uri: folderUri("f1"), name: "First", eventRef: event.uri });
    const second = makeFolder({ uri: folderUri("f2"), name: "Second", eventRef: event.uri });

    const unified = unifyDeployments([first, second], [event]);

    expect(unified).toHaveLength(2);
    expect(unified.find((d) => d.uri === first.uri)?.event).toBe(event);
    expect(unified.find((d) => d.uri === second.uri)?.event).toBeNull();
  });

  it("orders newest deployment first across both kinds", () => {
    const oldFolder = makeFolder({
      uri: folderUri("old"),
      name: "Old",
      deployedAt: "2026-01-01T00:00:00.000Z",
    });
    const newEvent = makeEvent({
      uri: eventUri("new"),
      locality: "New",
      eventDate: "2026-07-01T00:00:00.000Z",
    });

    const unified = unifyDeployments([oldFolder], [newEvent]);

    expect(unified.map((d) => d.name)).toEqual(["New", "Old"]);
  });
});

describe("chimeDeploymentName", () => {
  it("uses the site name, falling back to the chime ID", () => {
    expect(chimeDeploymentName(makeEvent({ uri: eventUri("e1"), locality: "Creek" }))).toBe("Creek");
    expect(chimeDeploymentName(makeEvent({ uri: eventUri("e2") }))).toBe(
      "AudioMoth aabbccdd00112233",
    );
  });
});

describe("isChimeEventUri", () => {
  it("tells chime events and folder records apart by their URI", () => {
    expect(isChimeEventUri(eventUri("e1"))).toBe(true);
    expect(isChimeEventUri(folderUri("f1"))).toBe(false);
    expect(isChimeEventUri("not-a-uri")).toBe(false);
  });
});

describe("eventRenameEdit", () => {
  it("renames without touching the linked recorder", () => {
    const event = makeEvent({
      uri: eventUri("e1"),
      locality: "Before",
      equipmentUsed: "Unit 4 (AM-1234)",
      eventRemarks: `Chime deployment ID aabbccdd00112233. Equipment record: ${folderUri("eq")}`,
    });
    const edit = eventRenameEdit(event, "After");
    expect(edit.siteName).toBe("After");
    expect(edit.equipment?.uri).toBe(folderUri("eq"));
    expect(edit.equipment?.name).toBe("Unit 4 (AM-1234)");
  });

  it("keeps an unlinked deployment unlinked", () => {
    const event = makeEvent({ uri: eventUri("e1"), locality: "Before" });
    expect(eventRenameEdit(event, "After").equipment).toBeNull();
  });
});
