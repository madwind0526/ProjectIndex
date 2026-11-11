import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { ProjectDialog } from "./components/ProjectDialog";
import type { CardActions } from "./components/ProjectCard";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { Health, PageId, Project, Settings, SortDir, SortKey } from "./types";

const titles: Record<PageId, string> = { local: "Local", github: "GitHub", favorites: "즐겨찾기", settings: "설정" };
const descriptions: Record<Exclude<PageId, "settings">, string> = {
  local: "이 PC의 Claude 폴더에 있는 프로젝트입니다.",
  github: "GitHub에 올라간 프로젝트입니다. 이 PC에 없는 저장소도 표시합니다.",
  favorites: "즐겨찾기에 추가한 프로젝트입니다.",
};
const HEALTH_POLL_INTERVAL_MS = 15000;

export default function App() {
  const [page, setPage] = useState<PageId>("local");
  const [projects, setProjects] = useState<Project[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [githubError, setGithubError] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState("");
  const [progress, setProgress] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sidebarJob, setSidebarJob] = useState<"" | "update" | "push">("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const result = await api.list(refresh);
      setProjects(result.projects);
      setHiddenCount(result.hiddenCount);
      setGithubError(result.githubError);
      return result.projects;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void api.getSettings().then(setSettings).catch(() => undefined);
  }, [load]);

  // Health makes outbound requests (ComfyUI, Ollama), so it is polled slowly.
  useEffect(() => {
    let active = true;
    const check = () => api.health().then((result) => { if (active) setHealth(result); }, () => undefined);
    void check();
    const timer = window.setInterval(check, HEALTH_POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const replace = useCallback((project: Project) => setProjects((current) => current.map((p) => (p.id === project.id ? project : p))), []);
  const setBusy = (id: string, on: boolean) => setBusyIds((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });

  async function guarded(project: Project, work: () => Promise<string | void>) {
    setNotice("");
    setBusy(project.id, true);
    try {
      const done = await work();
      if (done) setNotice(done);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(project.id, false);
    }
  }

  const actions: CardActions = {
    onOpen: (project) => setOpenId(project.id),
    onFavorite: (project) => {
      replace({ ...project, favorite: !project.favorite });
      api.update(project.id, { favorite: !project.favorite }).catch(() => replace(project));
    },
    onWorking: (project) => {
      replace({ ...project, working: !project.working });
      api.update(project.id, { working: !project.working }).catch(() => replace(project));
    },
    onRun: (project) => guarded(project, async () => { await api.run(project.id); return `${project.name}: stop.bat → start.bat을 실행했습니다. 서버가 뜨면 브라우저가 열립니다.`; }),
    onRefresh: (project) => guarded(project, async () => {
      const result = await api.refresh(project.id);
      replace(result.project);
      return result.notes.length ? `${project.name}: ${result.notes.join(" / ")}` : `${project.name}: 새로고침했습니다.`;
    }),
    onDelete: (project) => {
      if (!window.confirm(`"${project.name}" 카드를 목록에서 삭제할까요?\n폴더와 GitHub 저장소는 지워지지 않으며, 설정에서 다시 표시할 수 있습니다.`)) return;
      void guarded(project, async () => {
        await api.remove(project.id);
        setProjects((current) => current.filter((p) => p.id !== project.id));
        setHiddenCount((count) => count + 1);
      });
    },
  };

  // Runs the LLM over every card it has not analysed yet, one at a time (the CLIs are slow); images are left to the per-card refresh.
  async function analyseAll() {
    const todo = projects.filter((p) => !p.analyzed && !p.edited);
    setNotice("");
    for (const [index, project] of todo.entries()) {
      setProgress(`AI 분석 중 ${index + 1}/${todo.length} · ${project.name}`);
      try {
        replace((await api.refresh(project.id, { images: false })).project);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "AI 분석에 실패했습니다.");
        break;
      }
    }
    setProgress("");
  }

  // Re-scans folders and GitHub first (so deleted folders drop out of the list), then refreshes every remaining card one by one.
  async function updateAll() {
    setSidebarJob("update");
    setNotice("");
    const failed: string[] = [];
    try {
      const list = await load(true);
      for (const [index, project] of list.entries()) {
        setProgress(`전체 업데이트 ${index + 1}/${list.length} · ${project.name}`);
        try {
          const result = await api.refresh(project.id, { changed: true });
          replace(result.project);
          if (result.notes.some((note) => note.includes("실패"))) failed.push(project.name);
        } catch {
          failed.push(project.name);
        }
      }
      setNotice(failed.length ? `전체 업데이트 완료. 일부 항목을 갱신하지 못했습니다: ${failed.join(", ")}` : `전체 업데이트 완료 (${list.length}개).`);
    } finally {
      setProgress("");
      setSidebarJob("");
    }
  }

  async function pushGithub() {
    if (!window.confirm("ProjectIndex의 변경 사항을 GitHub에 커밋하고 푸시할까요?")) return;
    setSidebarJob("push");
    setProgress("GitHub에 반영하는 중...");
    try {
      setNotice(`GitHub 반영: ${(await api.pushToGithub()).steps.join(" ")}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "GitHub에 반영하지 못했습니다.");
    } finally {
      setProgress("");
      setSidebarJob("");
    }
  }

  const shown = useMemo(() => ({
    local: projects.filter((p) => p.inLocal),
    github: projects.filter((p) => p.inGithub),
    favorites: projects.filter((p) => p.favorite),
  }), [projects]);
  // Dates sort newest first by default and names A→Z; clicking the active sort flips the direction.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = projects.filter((p) => !needle || `${p.name} ${p.summary} ${p.detail} ${p.category}`.toLowerCase().includes(needle));
    const value = (p: Project) => (sortKey === "name" ? p.name.toLowerCase() : sortKey === "activity" ? p.lastActivity : sortKey === "release" ? p.releaseDate : p.category);
    const sign = sortDir === "asc" ? 1 : -1;
    // Empty values (no release date, no activity) always go last.
    return list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (!x !== !y) return x ? -1 : 1;
      return sign * x.localeCompare(y, "ko") || a.name.localeCompare(b.name, "en");
    });
  }, [projects, query, sortKey, sortDir]);
  const pageIds = new Set((page === "settings" ? [] : shown[page]).map((p) => p.id));
  const pageProjects = visible.filter((p) => pageIds.has(p.id));

  function changeSort(key: SortKey) {
    if (key === sortKey) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "category" ? "asc" : "desc"); }
  }

  const counts = { local: shown.local.length, github: shown.github.length, favorites: shown.favorites.length };
  const openProject = projects.find((p) => p.id === openId);

  return <div className="app-shell"><Sidebar page={page} onPageChange={(next) => { setPage(next); setNotice(""); }} counts={counts} health={health} job={sidebarJob} onUpdateAll={() => void updateAll()} onPush={() => void pushGithub()} /><main><Topbar title={titles[page]} health={health} query={query} onQueryChange={setQuery} sortKey={sortKey} sortDir={sortDir} onSortChange={changeSort} />
    {page === "settings" ? (settings && <SettingsPage settings={settings} health={health} hiddenCount={hiddenCount} onSaved={(saved) => { setSettings(saved); void load(); }} onRestored={() => void load()} />) : (
      <ProjectsPage key={page} title={titles[page]} description={descriptions[page]} projects={pageProjects} categories={settings?.categories ?? []} loading={loading} busyIds={busyIds} notice={notice} githubError={page === "github" ? githubError : ""} actions={actions} onReload={() => void load(true)} onAnalyse={() => void analyseAll()} progress={progress} pending={projects.filter((p) => !p.analyzed && !p.edited).length} llmReady={health?.llm ?? false} />
    )}
    {openProject && <ProjectDialog key={openProject.id} project={openProject} categories={settings?.categories ?? []} onClose={() => setOpenId("")} onChanged={replace} />}
  </main></div>;
}
