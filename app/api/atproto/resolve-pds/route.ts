import { NextResponse } from "next/server";

interface DidDocument {
  service?: Array<{
    id?: string;
    type?: string;
    serviceEndpoint?: string;
  }>;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const did = searchParams.get("did");

  if (!did) {
    return NextResponse.json({ error: "did is required" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to resolve DID" }, { status: 502 });
    }

    const didDoc = (await response.json()) as DidDocument;
    const atprotoService = didDoc.service?.find((service) => service.type === "AtprotoPersonalDataServer");
    const pdsUrl = atprotoService?.serviceEndpoint;

    if (!pdsUrl) {
      return NextResponse.json({ error: "No PDS found for DID" }, { status: 404 });
    }

    if (!/^https?:\/\//i.test(pdsUrl)) {
      return NextResponse.json({ error: "Invalid PDS endpoint in DID document" }, { status: 502 });
    }

    return NextResponse.json({ pdsUrl });
  } catch {
    return NextResponse.json({ error: "Failed to resolve DID" }, { status: 500 });
  }
}
