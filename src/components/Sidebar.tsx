import { FolderGit2, HardDrive, LayoutGrid, Loader2, RefreshCw, Settings, Star, Upload } from "lucide-react";
import type { Health, PageId } from "../types";

interface SidebarProps {
  page: PageId;
  onPageChange: (page: PageId) => void;
  counts: Record<"local" | "github" | "favorites", number>;
  health: Health | null;
  job: "" | "update" | "push";
  onUpdateAll: () => void;
  onPush: () => void;
}

export function Sidebar({ page, onPageChange, counts, health, job, onUpdateAll, onPush }: SidebarProps) {
  const items = [
    { id: "local" as const, label: "Local", icon: HardDrive, count: counts.local },
    { id: "github" as const, label: "GitHub", icon: FolderGit2, count: counts.github },
    { id: "favorites" as const, label: "즐겨찾기", icon: Star, count: counts.favorites },
  ];

  return (
    <aside className="sidebar">
      <button type="button" className="brand" onClick={() => onPageChange("local")} aria-label="Project Index 홈">
        <span className="brand-mark"><LayoutGrid size={17} /></span>
        <span className="brand-copy">Project <b>Index</b><small>Claude Project Catalog</small></span>
      </button>

      <nav aria-label="주 메뉴">
        <span className="nav-caption">PROJECTS</span>
        {items.map(({ id, label, icon: Icon, count }) => (
          <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => onPageChange(id)}>
            <Icon size={18} /><span>{label}</span><em>{count}</em>
          </button>
        ))}
      </nav>

      <nav className="sidebar-bottom" aria-label="관리 메뉴">
        <button className="nav-item" disabled={job !== ""} onClick={onPush} title="ProjectIndex 변경 사항을 GitHub에 푸시">
          {job === "push" ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}<span>GitHub에 반영</span>
        </button>
        <button className="nav-item" disabled={job !== ""} onClick={onUpdateAll} title="폴더·GitHub를 다시 읽고 모든 카드를 새로고침">
          {job === "update" ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}<span>Update All</span>
        </button>
        <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => onPageChange("settings")}>
          <Settings size={18} /><span>설정</span>
        </button>
      </nav>
      <div className="local-status">
        <strong><i className={health?.comfy ? "" : "offline"} /> ComfyUI</strong>
        <p>{health?.comfy ? "연결됨 · 카드 이미지 생성 가능" : "연결되지 않음 · 이미지를 만들려면 실행해 주세요"}</p>
      </div>
      <p className="privacy">프로젝트 정보와 설정은 이 PC에만 저장됩니다.</p>
    </aside>
  );
}
