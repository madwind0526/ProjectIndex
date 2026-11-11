import { Save } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { ComfyModelId, Health, LlmProviderId, Settings } from "../types";

interface Props {
  settings: Settings;
  health: Health | null;
  hiddenCount: number;
  onSaved: (settings: Settings) => void;
  onRestored: () => void;
}

const providers: { value: LlmProviderId; label: string; note: string }[] = [
  { value: "none", label: "사용 안 함", note: "요약·상세·카테고리를 자동으로 만들지 않습니다. 직접 수정해서 입력합니다." },
  { value: "claude-cli", label: "Claude", note: "claude 명령이 로그인되어 있으면 API 키 없이 사용합니다." },
  { value: "codex-cli", label: "Codex", note: "codex 명령이 로그인되어 있으면 API 키 없이 사용합니다." },
  { value: "opencode-cli", label: "OpenCode", note: "opencode 명령이 로그인되어 있으면 API 키 없이 사용합니다." },
  { value: "ollama", label: "Ollama (로컬)", note: "로컬 Ollama 서버에 요청합니다. 모델 이름을 입력해 주세요." },
];

const comfyModels: { value: ComfyModelId; label: string }[] = [
  { value: "krea2", label: "Krea 2 Turbo" },
  { value: "zimage", label: "Z-Image Turbo" },
  { value: "qwen21", label: "Qwen Image 2.1" },
  { value: "auto", label: "자동 (설치된 모델 중 최신)" },
];

// One entry per line in the textareas; blank lines are dropped on the server.
const toLines = (text: string) => text.split(/\r?\n/);

export function SettingsPage({ settings, health, hiddenCount, onSaved, onRestored }: Props) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState("");
  const [rootsText, setRootsText] = useState(settings.roots.join("\n"));
  const [categoriesText, setCategoriesText] = useState(settings.categories.join("\n"));
  const field = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const provider = providers.find((p) => p.value === draft.llmProvider);
  const modelStatus = health?.comfyModels.find((m) => m.id === draft.comfyModel);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const saved = await api.saveSettings({ ...draft, roots: toLines(rootsText), categories: toLines(categoriesText) });
      setDraft(saved);
      setRootsText(saved.roots.join("\n"));
      setCategoriesText(saved.categories.join("\n"));
      onSaved(saved);
      setMessage("설정을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    }
  }

  async function restore() {
    try {
      const { restored } = await api.restoreHidden();
      onRestored();
      setMessage(`숨겼던 프로젝트 ${restored}개를 다시 표시합니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "숨긴 프로젝트를 복원하지 못했습니다.");
    }
  }

  return <section className="standard-page page-scroll settings-page"><div className="page-heading"><span className="eyebrow">SETTINGS</span><h1>설정</h1><p>요약을 만들 LLM, 카드 이미지를 만들 ComfyUI, 프로젝트를 찾을 폴더를 설정합니다.</p></div>
    <form onSubmit={save} className="settings-form">
      <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>LLM</h2><p>간단 요약·상세 요약·카테고리를 만들 모델을 선택합니다.</p></div></div>
        <div className="form-grid">
          <label className="form-field full"><span>제공자</span><select value={draft.llmProvider} onChange={(e) => field("llmProvider", e.target.value as LlmProviderId)}>{providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
            <small className={draft.llmProvider !== "none" && health && health.llmProvider === draft.llmProvider && !health.llm ? "field-warn" : undefined}>{provider?.note}{draft.llmProvider !== "none" && health && health.llmProvider === draft.llmProvider && !health.llm && " 현재 사용할 수 없습니다. (저장 후 다시 확인)"}</small></label>
          <label className="form-field full"><span>모델 <em>선택</em></span><input value={draft.llmModel} onChange={(e) => field("llmModel", e.target.value)} placeholder={draft.llmProvider === "ollama" ? "llama3.1" : "비워 두면 CLI 기본 모델 사용"} /></label>
          {draft.llmProvider === "ollama" && <label className="form-field full"><span>Ollama 주소</span><input type="url" value={draft.ollamaUrl} onChange={(e) => field("ollamaUrl", e.target.value)} placeholder="http://127.0.0.1:11434" /></label>}
        </div></section>

      <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>ComfyUI</h2><p>카드 대표 이미지를 만드는 ComfyUI 서버입니다. MusicAutomation의 표지 생성과 같은 모델을 씁니다.</p></div><span className="connection-pill"><i className={health?.comfy ? "" : "offline"} /> {health?.comfy ? "연결됨" : "연결 안 됨"}</span></div>
        <div className="form-grid">
          <label className="form-field"><span>서버 주소</span><input type="url" value={draft.comfyUrl} onChange={(e) => field("comfyUrl", e.target.value)} placeholder="http://127.0.0.1:8190" /></label>
          <label className="form-field"><span>이미지 모델</span><select value={draft.comfyModel} onChange={(e) => field("comfyModel", e.target.value as ComfyModelId)}>{comfyModels.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
            {modelStatus && !modelStatus.available && <small className="field-warn">{modelStatus.reason}</small>}</label>
          <label className="form-field full"><span>ComfyUI 엔진 폴더 <em>선택</em></span><input value={draft.comfyEnginePath} onChange={(e) => field("comfyEnginePath", e.target.value)} placeholder="예: C:\Claude\SongYUE2\engine\ComfyUI" /><small>입력하면 ComfyUI가 꺼져 있을 때 이미지를 만들면서 자동으로 실행합니다. (.venv\Scripts\python.exe가 있는 폴더)</small></label>
          <label className="form-field full"><span>이미지 스타일</span><input value={draft.imageStyle} onChange={(e) => field("imageStyle", e.target.value)} /><small>모든 카드 이미지 앞에 붙는 공통 스타일입니다. 장면은 프로젝트 내용에 맞게 LLM이 정합니다.</small></label>
        </div></section>

      <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>Local 프로젝트 위치</h2><p>Claude 프로젝트가 들어 있는 폴더입니다. 한 줄에 하나씩 입력하면 각 폴더의 하위 폴더를 프로젝트로 찾습니다.</p></div></div>
        <label className="form-field"><span>폴더 목록</span><textarea rows={4} value={rootsText} onChange={(e) => setRootsText(e.target.value)} placeholder={"C:\\Claude\nE:\\Claude\nG:\\Claude"} spellCheck={false} /></label></section>

      <section className="panel settings-panel"><div className="settings-panel-heading"><div><h2>GitHub · 카테고리</h2><p>GitHub 목록은 설치된 gh CLI(로그인 상태)로 읽고, 없으면 공개 저장소만 읽습니다.</p></div></div>
        <div className="form-grid">
          <label className="form-field full"><span>GitHub 사용자</span><input value={draft.githubUser} onChange={(e) => field("githubUser", e.target.value)} placeholder="madwind0526" /></label>
          <div className="form-field full"><span>숨긴 프로젝트</span><button type="button" className="soft-button" disabled={hiddenCount === 0} onClick={restore}>{hiddenCount}개 다시 표시</button><small>카드의 삭제 버튼은 목록에서만 숨기며 폴더·저장소는 지우지 않습니다.</small></div>
          <label className="form-field full"><span>카테고리 목록</span><textarea rows={5} value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} spellCheck={false} /><small>한 줄에 하나씩. LLM은 이 중에서 하나를 고릅니다.</small></label>
        </div></section>

      <div className="settings-actions">{message && <p>{message}</p>}<button className="primary-button" type="submit"><Save /> 설정 저장</button></div>
    </form></section>;
}
