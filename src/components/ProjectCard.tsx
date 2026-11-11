import { Bot, BookOpen, Loader2, Package, Play, RefreshCw, Star, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { Project } from "../types";

export interface CardActions {
  onOpen: (project: Project) => void;
  onFavorite: (project: Project) => void;
  onWorking: (project: Project) => void;
  onRun: (project: Project) => void;
  onRefresh: (project: Project) => void;
  onDelete: (project: Project) => void;
}

/** Tag pill that is lit when the project has the feature and dimmed when it does not. */
export function FeatureTags({ project }: { project: Project }) {
  const tags = [
    { on: project.hasLlm, label: "LLM 사용", icon: Bot },
    { on: project.hasDocs, label: "설명서", icon: BookOpen },
    { on: project.hasRelease, label: "배포판", icon: Package },
  ];
  return <>{tags.map(({ on, label, icon: Icon }) => <span key={label} className={`tag ${on ? "on" : "off"}`} title={on ? label : `${label} 없음`}><Icon size={11} />{label}</span>)}</>;
}

export function ProjectCard({ project, busy, actions }: { project: Project; busy: boolean; actions: CardActions }) {
  // The corner buttons sit on top of the clickable card, so their clicks must not also open the popup.
  const stop = (handler: (project: Project) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    handler(project);
  };
  const canRun = project.inLocal && project.hasStart;
  return (
    <article className={`project-card${project.working ? " working" : ""}${project.inGithub ? (project.isPrivate ? " private" : " public") : ""}`} onClick={() => actions.onOpen(project)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") actions.onOpen(project); }}>
      <div className="card-image">
        {project.imageUrl ? <img src={project.imageUrl} alt="" loading="lazy" /> : <span className="card-image-empty">{project.name.slice(0, 2).toUpperCase()}</span>}
        <button type="button" className={`card-btn card-star ${project.favorite ? "on" : ""}`} onClick={stop(actions.onFavorite)} aria-label={project.favorite ? "즐겨찾기 해제" : "즐겨찾기"} title="즐겨찾기">
          <Star size={15} />
        </button>
        <label className="card-working" onClick={(event) => event.stopPropagation()} title="작업 중인 프로젝트로 표시"><input type="checkbox" checked={project.working} onChange={() => actions.onWorking(project)} /> 작업중</label>
        <div className="card-tools">
          <button type="button" className="card-btn" disabled={!canRun || busy} onClick={stop(actions.onRun)} aria-label="실행 (stop.bat → start.bat)" title={canRun ? "실행 (stop.bat → start.bat)" : "start.bat이 없어 실행할 수 없습니다"}><Play size={15} /></button>
          <button type="button" className="card-btn" disabled={busy} onClick={stop(actions.onRefresh)} aria-label="새로고침" title="새로고침 (정보·요약·이미지 갱신)">{busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}</button>
          <button type="button" className="card-btn danger" disabled={busy} onClick={stop(actions.onDelete)} aria-label="삭제" title="목록에서 삭제 (폴더는 그대로)"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="card-body">
        <div className="card-title"><h3>{project.name}</h3><span className="card-where">{project.inLocal && "Local"}{project.inLocal && project.inGithub && " · "}{project.inGithub && <span className={`vis ${project.isPrivate ? "private" : "public"}`}>{project.isPrivate ? "GitHub Private" : "GitHub Public"}</span>}</span></div>
        <p className="card-summary">{project.summary || "요약이 없습니다. 새로고침하거나 수정해서 입력해 주세요."}</p>
        <div className="card-tags"><span className="tag category">{project.category}</span><FeatureTags project={project} /></div>
      </div>
    </article>
  );
}
