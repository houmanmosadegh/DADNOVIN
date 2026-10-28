/** Typed fetch layer — credentials + CSRF header + error normalization. */

const BASE = (import.meta.env.VITE_API_URL ?? "") + "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: {
      "X-Requested-With": "fetch",
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    ...options,
  });
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-json */
  }
  if (!res.ok) {
    const detail = (body as { detail?: { code?: string; message?: string } | string })
      ?.detail;
    const code =
      typeof detail === "object" && detail ? detail.code ?? "error" : "error";
    const message =
      typeof detail === "object" && detail
        ? detail.message ?? "خطای سرور"
        : typeof detail === "string"
          ? detail
          : "خطای سرور";
    throw new ApiError(res.status, code, message);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
};

export const AUTH_BYPASS = { base: BASE };
