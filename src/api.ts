import type { Health, Project, ProjectList, Settings } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "요청을 처리하지 못했습니다.");
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const base = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export const api = {
  list: (refresh = false) => request<ProjectList>(`/api/projects${refresh ? "?refresh=1" : ""}`),
  update: (id: string, patch: Partial<Omit<Project, "link" | "github" | "releaseDate">> & { link?: string | null; github?: string | null; releaseDate?: string | null }) => request<{ project: Project }>(base(id), send("PUT", patch)),
  remove: (id: string) => request<{ ok: true }>(base(id), send("DELETE")),
  refresh: (id: string, { images = true, force = false, changed = false } = {}) => request<{ project: Project; notes: string[] }>(`${base(id)}/refresh?images=${images ? 1 : 0}&force=${force ? 1 : 0}&changed=${changed ? 1 : 0}`, send("POST")),
  run: (id: string) => request<{ ok: true }>(`${base(id)}/run`, send("POST")),
  makeImage: (id: string) => request<{ project: Project }>(`${base(id)}/image`, send("POST")),
  openFolder: (id: string) => request<{ ok: true }>(`${base(id)}/open-folder`, send("POST")),
  restoreHidden: () => request<{ restored: number }>("/api/projects/restore-hidden", send("POST")),
  getSettings: () => request<Settings>("/api/settings"),
  saveSettings: (settings: Settings) => request<Settings>("/api/settings", send("PUT", settings)),
  pushToGithub: () => request<{ steps: string[] }>("/api/git/push", send("POST")),
  health: () => request<Health>("/api/health"),
};
