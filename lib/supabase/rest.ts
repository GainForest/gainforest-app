import "server-only";

const SUPABASE_REST_PATH = "/rest/v1";
export const SUPABASE_RPC_TIMEOUT_MS = 10_000;

class SupabaseRestError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SupabaseRestError";
    this.status = status;
    this.details = details;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function supabaseUrl(path: string): string {
  return new URL(`${SUPABASE_REST_PATH}${path}`, requiredEnv("SUPABASE_URL").replace(/\/$/, "")).toString();
}

function serviceRoleHeaders(extra?: HeadersInit): Headers {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(extra);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  return headers;
}

async function parseSupabaseError(response: Response): Promise<SupabaseRestError> {
  const data = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  const message = data?.message ?? data?.error ?? `Supabase request failed (${response.status})`;
  return new SupabaseRestError(message, response.status, data);
}

export function supabaseFilterValue(value: string): string {
  return encodeURIComponent(value);
}

export async function supabaseRpc<T>(functionName: string, parameters: Record<string, unknown>): Promise<T> {
  const headers = serviceRoleHeaders({
    accept: "application/json",
    "content-type": "application/json",
  });
  const signal = AbortSignal.timeout(SUPABASE_RPC_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(supabaseUrl(`/rpc/${encodeURIComponent(functionName)}`), {
      method: "POST",
      headers,
      body: JSON.stringify(parameters),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new SupabaseRestError("Supabase RPC timed out. Check Supabase availability and retry.", 504);
    }
    throw error;
  }
  if (!response.ok) throw await parseSupabaseError(response);
  try {
    return await response.json() as T;
  } catch {
    if (signal.aborted) {
      throw new SupabaseRestError("Supabase RPC timed out. Check Supabase availability and retry.", 504);
    }
    return null as T;
  }
}

export async function supabaseSelect<T>(pathAndQuery: string): Promise<T[]> {
  const response = await fetch(supabaseUrl(pathAndQuery), {
    headers: serviceRoleHeaders({ accept: "application/json" }),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data as T[] : [];
}

export async function supabaseInsert<T>(path: string, value: Record<string, unknown>): Promise<T> {
  const headers = serviceRoleHeaders({
    accept: "application/json",
    "content-type": "application/json",
    prefer: "return=representation",
  });
  const response = await fetch(supabaseUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
  const data = await response.json().catch(() => []);
  if (Array.isArray(data) && data.length > 0) return data[0] as T;
  throw new SupabaseRestError("Supabase insert returned no row", response.status);
}

export async function supabasePatch<T>(pathAndQuery: string, value: Record<string, unknown>): Promise<T[]> {
  const headers = serviceRoleHeaders({
    accept: "application/json",
    "content-type": "application/json",
    prefer: "return=representation",
  });
  const response = await fetch(supabaseUrl(pathAndQuery), {
    method: "PATCH",
    headers,
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data as T[] : [];
}

export async function supabaseUpsert(
  path: string,
  value: Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  const query = new URLSearchParams({ on_conflict: onConflict });
  const headers = serviceRoleHeaders({
    accept: "application/json",
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  const response = await fetch(supabaseUrl(`${path}?${query}`), {
    method: "POST",
    headers,
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
}
