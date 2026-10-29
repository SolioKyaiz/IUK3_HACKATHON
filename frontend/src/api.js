import { getState, setState } from "./store";

const BASE = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api(path, { method = "GET", body, signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  const { token } = getState();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("network", 0);
  }
  if (res.status === 401 && token) setState({ token: null, phone: null });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(data?.code || "unknown", res.status);
  return data;
}

export function chatStream(body, signal) {
  const { token } = getState();
  return fetch(BASE + "/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
}

export const snowUrl = BASE + "/snow/basins.geojson";
