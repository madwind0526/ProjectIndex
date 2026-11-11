import { ExternalLink, FolderOpen, ImagePlus, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import { api } from "../api";
import type { Project } from "../types";
import { FeatureTags } from "./ProjectCard";

interface Props {
  project: Project;
  categories: string[];
  onClose: () => void;
  onChanged: (project: Project) => void;
}

type Draft = Pick<Project, "name" | "category" | "summary" | "detail" | "releaseDate" | "link" | "github" | "hasLlm" | "hasDocs" | "hasRelease">;

const toDraft = (p: Project): Draft => ({ name: p.name, category: p.category, summary: p.summary, detail: p.detail, releaseDate: p.releaseDate, link: p.link, github: p.github, hasLlm: p.hasLlm, hasDocs: p.hasDocs, hasRelease: p.hasRelease });

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="meta-row"><dt>{label}</dt><dd>{children}</dd></div>;
const Url = ({ href }: { href: string }) => (href ? <a href={href} target="_blank" rel="noopener noreferrer">{href}<ExternalLink size={11} /></a> : <span className="muted">없음</span>);

export function ProjectDialog({ project, categories, onClose, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(project));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  // A saved category that was later removed from settings must still be selectable, or the select would silently change it.
  const options = categories.includes(draft.category) ? categories : [...categories, draft.category];

  async function guarded(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); } finally { setBusy(false); }
  }
  const save = () => guarded(async () => {
    // Link/GitHub typed over with an empty string go back to the detected value (null clears the override).
    const result = await api.update(project.id, { ...draft, link: draft.link || null as never, github: draft.github || null as never, releaseDate: draft.releaseDate || null as never, edited: true });
    onChanged(result.project);
    setDraft(toDraft(result.project));
    setEditing(false);
  });
  const makeImage = () => guarded(async () => onChanged((await api.makeImage(project.id)).project));
  const aiDetail = () => guarded(async () => {
    const result = await api.refresh(project.id, { images: false, force: true });
    onChanged(result.project);
    if (result.notes.length) setMessage(result.notes.join(" / "));
  });
  const openFolder = () => guarded(async () => { await api.openFolder(project.id); });

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="project-dialog" role="dialog" aria-modal="true" aria-label={`${project.name} 상세`}>
        <header>
          <div>
            <span className="eyebrow">{project.category.toUpperCase()}</span>
            {editing ? <input className="title-input" value={draft.name} onChange={(e) => set("name", e.target.value)} aria-label="이름" /> : <h2>{project.name}</h2>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </header>

        <div className="dialog-body">
          {project.imageUrl && !editing && <img className="dialog-image" src={project.imageUrl} alt="" />}
          {editing ? (
            <div className="form-grid">
              <label className="form-field"><span>카테고리</span><select value={draft.category} onChange={(e) => set("category", e.target.value)}>{options.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label className="form-field"><span>릴리스 날짜</span><input type="date" value={draft.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} /></label>
              <label className="form-field full"><span>간단 요약</span><input value={draft.summary} onChange={(e) => set("summary", e.target.value)} /></label>
              <label className="form-field full"><span>상세 요약</span><textarea rows={8} value={draft.detail} onChange={(e) => set("detail", e.target.value)} /></label>
              <label className="form-field"><span>링크</span><input value={draft.link} onChange={(e) => set("link", e.target.value)} placeholder="http://127.0.0.1:5189" /></label>
              <label className="form-field"><span>GitHub 주소</span><input value={draft.github} onChange={(e) => set("github", e.target.value)} placeholder="https://github.com/…" /></label>
              <div className="check-row full">
                <label className="check-field"><input type="checkbox" checked={draft.hasLlm} onChange={(e) => set("hasLlm", e.target.checked)} /><span><b>LLM 사용</b></span></label>
                <label className="check-field"><input type="checkbox" checked={draft.hasDocs} onChange={(e) => set("hasDocs", e.target.checked)} /><span><b>설명서 있음</b></span></label>
                <label className="check-field"><input type="checkbox" checked={draft.hasRelease} onChange={(e) => set("hasRelease", e.target.checked)} /><span><b>배포판 있음</b></span></label>
              </div>
              <small className="form-hint full">수정하면 새로고침을 눌러도 요약·상세·카테고리가 AI로 덮어써지지 않습니다.</small>
            </div>
          ) : (
            <>
              <p className="dialog-summary">{project.summary || "요약이 없습니다."}</p>
              <div className="card-tags"><span className="tag category">{project.category}</span><FeatureTags project={project} /></div>
              <h3 className="dialog-heading">상세 요약</h3>
              <div className="markdown">{project.detail ? <Markdown>{project.detail}</Markdown> : <p className="muted">상세 요약이 없습니다. AI로 만들거나 수정해서 입력해 주세요.</p>}</div>
              <dl className="meta">
                <Row label="릴리스 날짜">{project.releaseDate ? <>{project.releaseDate}{project.releaseTag && ` (${project.releaseTag})`}{project.releaseUrl && <> · <a href={project.releaseUrl} target="_blank" rel="noopener noreferrer">릴리스 보기</a></>}</> : <span className="muted">없음</span>}</Row>
                <Row label="링크"><Url href={project.link} /></Row>
                <Row label="GitHub"><Url href={project.github} />{project.inGithub && project.isPrivate && <span className="muted"> (비공개)</span>}</Row>
                <Row label="로컬 경로">{project.localPath ? <code>{project.localPath}</code> : <span className="muted">이 PC에 없음</span>}</Row>
                {project.language && <Row label="언어">{project.language}</Row>}
                {project.lastActivity && <Row label="마지막 활동">{project.lastActivity.slice(0, 10)}</Row>}
              </dl>
            </>
          )}
          {message && <p className="form-message">{message}</p>}
        </div>

        <footer>
          <div className="dialog-actions">
            {project.inLocal && <button type="button" className="ghost-button" disabled={busy} onClick={openFolder}><FolderOpen size={13} /> 폴더 열기</button>}
            <button type="button" className="ghost-button" disabled={busy} onClick={aiDetail} title="LLM으로 요약·상세·카테고리를 다시 만듭니다 (수정한 내용도 덮어씀)"><Sparkles size={13} /> AI 상세 요약</button>
            <button type="button" className="ghost-button" disabled={busy} onClick={makeImage}>{busy ? <Loader2 size={13} className="spin" /> : <ImagePlus size={13} />} 이미지 다시 만들기</button>
          </div>
          <div className="dialog-actions">
            {editing ? (
              <>
                <button type="button" className="ghost-button" disabled={busy} onClick={() => { setDraft(toDraft(project)); setEditing(false); }}>취소</button>
                <button type="button" className="primary-button small" disabled={busy} onClick={save}>저장</button>
              </>
            ) : (
              <button type="button" className="primary-button small" onClick={() => setEditing(true)}><Pencil size={13} /> 수정</button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
