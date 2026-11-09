const TOKEN_KEY = "ikart_token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Query;
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

function errorMessage(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const d = detail[0] as { loc?: (string | number)[]; msg?: string };
    const field = d.loc?.[d.loc.length - 1];
    const msg = (d.msg || "Invalid value").replace(/^Value error, /, "");
    if (typeof field === "string" && field !== "body") {
      return `${field.replace(/_/g, " ")}: ${msg.replace(/String should match pattern .*/, "invalid format")}`;
    }
    return msg;
  }
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return "Request failed";
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path + buildQuery(opts.query), {
      method: opts.method || (body ? "POST" : "GET"),
      headers,
      body,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event("ikart:logout"));
    }
    throw new ApiError(errorMessage(data, res.status), res.status);
  }
  return data as T;
}

export async function downloadFile(path: string, query: Query, filename: string) {
  const token = tokenStore.get();
  const res = await fetch(path + buildQuery(query), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError("Download failed", res.status);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const r = await api<{ url: string }>("/api/admin/uploads", { form });
  return r.url;
}
