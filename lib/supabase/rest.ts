const SUPABASE_REST_PATH = "/rest/v1";

export class SupabaseRestError extends Error {
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

export async function supabaseUpsert(path: string, value: Record<string, unknown>, onConflict = "id"): Promise<void> {
  const headers = serviceRoleHeaders({
    "content-type": "application/json",
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(supabaseUrl(`${path}${separator}on_conflict=${encodeURIComponent(onConflict)}`), {
    method: "POST",
    headers,
    body: JSON.stringify(value),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
}

export async function supabaseDelete(pathAndQuery: string): Promise<void> {
  const response = await fetch(supabaseUrl(pathAndQuery), {
    method: "DELETE",
    headers: serviceRoleHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw await parseSupabaseError(response);
}
