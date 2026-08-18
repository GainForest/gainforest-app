import { NextResponse } from "next/server";
import { fetchAuthSession } from "@/app/_lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await fetchAuthSession();

  return NextResponse.json({ session });
}
