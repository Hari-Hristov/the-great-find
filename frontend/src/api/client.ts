const BASE = "/api";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

type FetchOpts = RequestInit & { json?: unknown };

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { json, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  };

  const res = await fetch(`${BASE}${path}`, init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: unknown = undefined;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }
  return payload as T;
}
