import { Activity, ArrowDownAZ, ArrowUpAZ, CalendarClock, Image as ImageIcon, Package, Search, Tags, X } from "lucide-react";
import type { Health, SortDir, SortKey } from "../types";

const PROVIDER_LABELS: Record<string, string> = {
  "claude-cli": "Claude CLI",
  "codex-cli": "Codex CLI",
  "opencode-cli": "OpenCode CLI",
  ollama: "Ollama",
};

const SORTS: { key: SortKey; label: string; icon: typeof Package }[] = [
  { key: "name", label: "이름순", icon: ArrowDownAZ },
  { key: "activity", label: "최근 활동순", icon: CalendarClock },
  { key: "release", label: "릴리스 날짜순", icon: Package },
  { key: "category", label: "카테고리순", icon: Tags },
];

interface TopbarProps {
  title: string;
  health: Health | null;
  query: string;
  onQueryChange: (query: string) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey) => void;
}

export function Topbar({ title, health, query, onQueryChange, sortKey, sortDir, onSortChange }: TopbarProps) {
  const provider = health ? PROVIDER_LABELS[health.llmProvider] ?? "" : "";
  return (
    <header className="topbar">
      <div className="top-title"><span>WORKSPACE</span><strong>{title}</strong></div>
      <div className="top-search">
        <label className="search-box"><Search size={14} /><input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="이름·요약·카테고리 검색" aria-label="검색" />{query && <button type="button" onClick={() => onQueryChange("")} aria-label="검색어 지우기"><X size={13} /></button>}</label>
        <div className="sort-group" role="group" aria-label="정렬">
          {SORTS.map(({ key, label, icon: Icon }) => {
            const active = sortKey === key;
            const Shown = active && sortDir === "desc" && key === "name" ? ArrowUpAZ : Icon;
            return <button key={key} type="button" className={`sort-btn ${active ? "active" : ""}`} onClick={() => onSortChange(key)} title={`${label}${active ? (sortDir === "asc" ? " (오름차순)" : " (내림차순)") : ""} · 다시 누르면 방향 전환`} aria-pressed={active}><Shown size={16} />{active && <i>{sortDir === "asc" ? "↑" : "↓"}</i>}</button>;
          })}
        </div>
      </div>
      <div className="server-summary">
        <span title={provider ? `요약 생성에 쓰는 LLM: ${provider}` : "설정에서 LLM을 선택해 주세요"}>
          <i className={health?.llm ? "online" : "offline"} /><Activity size={14} /> LLM{provider && <em className="llm-provider">{provider}</em>}
        </span>
        <span title="카드 이미지를 만드는 ComfyUI"><i className={health?.comfy ? "online" : "offline"} /><ImageIcon size={14} /> ComfyUI</span>
      </div>
    </header>
  );
}
