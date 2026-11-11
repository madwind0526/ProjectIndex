import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_DIR = path.join(ROOT, "data", "runtime");
export const IMAGE_DIR = path.join(RUNTIME_DIR, "images");
const SETTINGS_FILE = path.join(RUNTIME_DIR, "settings.json");
const PROJECTS_FILE = path.join(RUNTIME_DIR, "projects.json");

export const LLM_PROVIDERS = ["none", "claude-cli", "codex-cli", "opencode-cli", "ollama"];
export const COMFY_MODELS = ["krea2", "zimage", "qwen21", "auto"];

export const DEFAULT_SETTINGS = Object.freeze({
  llmProvider: "none",
  llmModel: "",
  ollamaUrl: "http://127.0.0.1:11434",
  comfyUrl: "http://127.0.0.1:8190",
  comfyModel: "krea2",
  comfyEnginePath: "",
  imageStyle: "polished app key art, cinematic lighting, rich colors, dark moody background",
  githubUser: "madwind0526",
  roots: ["C:\\Claude", "E:\\Claude", "G:\\Claude"],
  categories: ["음악", "영상·미디어", "AI·에이전트", "도구·유틸리티", "생산성·노트", "통신·네트워크", "금융·투자", "게임", "기타"],
});

const str = (value, fallback) => (typeof value === "string" ? value.trim() : fallback);
const lines = (value, fallback) => {
  const list = (Array.isArray(value) ? value : []).map((item) => String(item).trim()).filter(Boolean);
  return list.length ? [...new Set(list)] : [...fallback];
};

export function normalizeSettings(input = {}) {
  const d = DEFAULT_SETTINGS;
  return {
    llmProvider: LLM_PROVIDERS.includes(input.llmProvider) ? input.llmProvider : d.llmProvider,
    llmModel: str(input.llmModel, ""),
    ollamaUrl: str(input.ollamaUrl, d.ollamaUrl) || d.ollamaUrl,
    comfyUrl: (str(input.comfyUrl, d.comfyUrl) || d.comfyUrl).replace(/\/+$/, ""),
    comfyModel: COMFY_MODELS.includes(input.comfyModel) ? input.comfyModel : d.comfyModel,
    comfyEnginePath: str(input.comfyEnginePath, ""),
    imageStyle: str(input.imageStyle, d.imageStyle) || d.imageStyle,
    githubUser: str(input.githubUser, d.githubUser),
    roots: lines(input.roots, d.roots),
    categories: lines(input.categories, d.categories),
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Write to a temp file first so a crash mid-write cannot leave a truncated JSON behind.
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

export const loadSettings = async () => normalizeSettings(await readJson(SETTINGS_FILE, {}));
export async function saveSettings(input) {
  const settings = normalizeSettings(input);
  await writeJson(SETTINGS_FILE, settings);
  return settings;
}

export const loadOverrides = () => readJson(PROJECTS_FILE, {});

/** Fields a user (or the LLM) may set on a project card; everything else is derived from disk/GitHub. */
const PATCH_FIELDS = ["favorite", "hidden", "edited", "name", "summary", "detail", "category", "releaseDate", "link", "github", "hasLlm", "hasDocs", "hasRelease", "imagePrompt", "working", "analyzed", "sourceHash", "imageSummary"];

// Read-modify-write of projects.json runs one at a time, so a refresh and a favourite toggle cannot overwrite each other.
let writeQueue = Promise.resolve();
const serial = (work) => {
  const run = writeQueue.then(work);
  writeQueue = run.catch(() => {});
  return run;
};

export const patchOverride = (id, patch) => serial(async () => {
  const all = await loadOverrides();
  const next = { ...(all[id] ?? {}) };
  for (const key of PATCH_FIELDS) {
    if (!(key in patch)) continue;
    // null clears an override so the derived value shows through again.
    if (patch[key] === null) delete next[key];
    else next[key] = patch[key];
  }
  all[id] = next;
  await writeJson(PROJECTS_FILE, all);
  return next;
});

export const restoreHidden = () => serial(async () => {
  const all = await loadOverrides();
  let count = 0;
  for (const entry of Object.values(all)) if (entry.hidden) { delete entry.hidden; count += 1; }
  await writeJson(PROJECTS_FILE, all);
  return count;
});
