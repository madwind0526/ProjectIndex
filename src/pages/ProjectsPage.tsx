import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectCard, type CardActions } from "../components/ProjectCard";
import type { Project } from "../types";

interface Props {
  title: string;
  description: string;
  projects: Project[];
  categories: string[];
  loading: boolean;
  busyIds: Set<string>;
  notice: string;
  githubError: string;
  actions: CardActions;
  onReload: () => void;
  onAnalyse: () => void;
  progress: string;
  pending: number;
  llmReady: boolean;
}

export function ProjectsPage({ title, description, projects, categories, loading, busyIds, notice, githubError, actions, onReload, onAnalyse, progress, pending, llmReady }: Props) {
  const [category, setCategory] = useState("");
  const shown = useMemo(() => projects.filter((p) => !category || p.category === category), [projects, category]);

  return (
    <section className="standard-page page-scroll projects-page">
      <div className="page-heading"><span className="eyebrow">PROJECTS</span><h1>{title}</h1><p>{description}</p></div>
      <div className="toolbar">
        <div className="chips" role="group" aria-label="카테고리 필터">
          <button type="button" className={`chip ${category === "" ? "active" : ""}`} onClick={() => setCategory("")}>전체</button>
          {categories.map((c) => <button key={c} type="button" className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
        <button type="button" className="soft-button" disabled={!llmReady || pending === 0 || Boolean(progress)} onClick={onAnalyse} title={llmReady ? "아직 분석하지 않은 카드의 요약·상세·카테고리를 LLM으로 만듭니다" : "설정에서 LLM을 선택해 주세요"}>{progress ? <Loader2 className="spin" /> : <Sparkles />} AI 분석 ({pending})</button>
        <button type="button" className="soft-button" disabled={loading} onClick={onReload}>{loading ? <Loader2 className="spin" /> : <RefreshCw />} 목록 새로고침</button>
      </div>
      {progress && <p className="form-message form-message-ok">{progress}</p>}
      {notice && <p className="form-message form-message-ok">{notice}</p>}
      {githubError && <p className="form-message">GitHub 목록을 불러오지 못했습니다: {githubError}</p>}
      {shown.length === 0 && !loading ? <p className="empty-hint">표시할 프로젝트가 없습니다.</p> : (
        <div className="card-grid">{shown.map((p) => <ProjectCard key={p.id} project={p} busy={busyIds.has(p.id)} actions={actions} />)}</div>
      )}
    </section>
  );
}
