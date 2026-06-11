import { describe, expect, it } from "vitest";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { parseAndValidateRows } from "./schemas";
import {
  buildKoboMediaZipIndex,
  loadKoboMediaZipArchive,
  MAX_KOBO_MEDIA_IMAGE_BYTES,
  readKoboMediaZipEntryAsSerializableFile,
} from "./kobo-media-zip";

const ZIP_WRITER_OPTIONS = { useWebWorkers: false } as const;

type ZipFixtureEntry = {
  path: string;
  content: BlobPart;
  type?: string;
};

async function createPhotoFolder(entries: ZipFixtureEntry[]): Promise<File> {
  const writer = new ZipWriter(new BlobWriter("application/zip"), ZIP_WRITER_OPTIONS);

  for (const entry of entries) {
    const blob = new Blob([entry.content], { type: entry.type ?? "application/octet-stream" });
    await writer.add(entry.path, new BlobReader(blob), ZIP_WRITER_OPTIONS);
  }

  const zipBlob = (await writer.close()) as Blob;
  return new File([zipBlob], "photos.zip", { type: "application/zip" });
}

function rejectFullFileArrayBuffer(file: File): File {
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.reject(new Error("The whole photo folder should not be buffered.")),
  });
  return file;
}

describe("Kobo photo folder indexing", () => {
  it("builds the photo index from zip metadata without buffering the whole folder", async () => {
    const photoFolder = rejectFullFileArrayBuffer(await createPhotoFolder([
      { path: "export/attachments/SUBMISSION-A/tree_a.JPG", content: "tree-a" },
      { path: "export/attachments/SUBMISSION-B/leaf_b.png", content: "leaf-b" },
      { path: "export/attachments/SUBMISSION-B/notes.txt", content: "not a photo" },
      { path: "export/unmatched/root_photo.jpg", content: "not under attachments" },
    ]));

    const index = await buildKoboMediaZipIndex(photoFolder);

    expect(index.fileName).toBe("photos.zip");
    expect(index.submissionCount).toBe(2);
    expect(index.entries).toEqual([
      expect.objectContaining({
        entryPath: "export/attachments/SUBMISSION-A/tree_a.JPG",
        fileName: "tree_a.JPG",
        normalizedFileName: "tree_a.jpg",
        submissionUuid: "submission-a",
        mimeType: "image/jpeg",
        uncompressedSize: 6,
      }),
      expect.objectContaining({
        entryPath: "export/attachments/SUBMISSION-B/leaf_b.png",
        fileName: "leaf_b.png",
        normalizedFileName: "leaf_b.png",
        submissionUuid: "submission-b",
        mimeType: "image/png",
        uncompressedSize: 6,
      }),
    ]);
  });

  it("extracts only the selected photo entry and keeps per-photo size validation", async () => {
    const photoFolder = rejectFullFileArrayBuffer(await createPhotoFolder([
      { path: "export/attachments/SUBMISSION-A/tree_a.jpg", content: "tree-a", type: "image/jpeg" },
      { path: "export/attachments/SUBMISSION-A/large.jpg", content: new Uint8Array(MAX_KOBO_MEDIA_IMAGE_BYTES + 1), type: "image/jpeg" },
    ]));

    const archive = await loadKoboMediaZipArchive(photoFolder);
    try {
      const photo = await readKoboMediaZipEntryAsSerializableFile({
        archive,
        entryPath: "export/attachments/SUBMISSION-A/tree_a.jpg",
        fileName: "tree_a.jpg",
        mimeType: "image/jpeg",
      });

      expect(photo.name).toBe("tree_a.jpg");
      expect(photo.type).toBe("image/jpeg");
      expect(photo.size).toBe(6);
      expect(new TextDecoder().decode(photo.arrayBuffer)).toBe("tree-a");

      await expect(readKoboMediaZipEntryAsSerializableFile({
        archive,
        entryPath: "export/attachments/SUBMISSION-A/large.jpg",
        fileName: "large.jpg",
        mimeType: "image/jpeg",
      })).rejects.toThrow("Photos must be 3 MB or smaller");
    } finally {
      await archive.close();
    }
  });
});

describe("Kobo row-to-photo matching", () => {
  it("matches photo file names to the row submission UUID before upload", async () => {
    const photoFolder = await createPhotoFolder([
      { path: "export/attachments/SUBMISSION-A/tree_a.JPG", content: "tree-a" },
      { path: "export/attachments/SUBMISSION-B/leaf_b.png", content: "leaf-b" },
    ]);
    const index = await buildKoboMediaZipIndex(photoFolder);

    const result = parseAndValidateRows(
      [
        { scientificName: "Acacia koa", eventDate: "2024-01-01", decimalLatitude: "1", decimalLongitude: "2" },
        { scientificName: "Quercus robur", eventDate: "2024-01-02", decimalLatitude: "3", decimalLongitude: "4" },
      ],
      [
        { _uuid: "uuid:SUBMISSION-A", photo_tree: "TREE_A.jpg", photo_leaf: "" },
        { "meta/rootUuid": "submission-b", photo_tree: "", photo_leaf: "leaf_b.png" },
      ],
      [
        { sourceColumn: "photo_tree", targetField: "photoUrl" },
        { sourceColumn: "photo_leaf", targetField: "photoUrl" },
      ],
      { koboMediaZipIndex: index },
    );

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]?.photos).toEqual([
      expect.objectContaining({
        source: "koboZip",
        entryPath: "export/attachments/SUBMISSION-A/tree_a.JPG",
        fileName: "tree_a.JPG",
        mimeType: "image/jpeg",
      }),
    ]);
    expect(result.valid[1]?.photos).toEqual([
      expect.objectContaining({
        source: "koboZip",
        entryPath: "export/attachments/SUBMISSION-B/leaf_b.png",
        fileName: "leaf_b.png",
        mimeType: "image/png",
      }),
    ]);
  });
});
