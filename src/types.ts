export type SortKey = "name" | "activity" | "release" | "category";
export type SortDir = "asc" | "desc";
export type PageId = "local" | "github" | "favorites" | "settings";

export interface Project {
  id: string;
  name: string;
  localPath: string;
  inLocal: boolean;
  inGithub: boolean;
  isPrivate: boolean;
  github: string;
  link: string;
  hasStart: boolean;
  hasStop: boolean;
  summary: string;
  detail: string;
  category: string;
  releaseDate: string;
  releaseTag: string;
  releaseUrl: string;
  language: string;
  lastActivity: string;
  hasLlm: boolean;
  hasDocs: boolean;
  hasRelease: boolean;
  favorite: boolean;
  working: boolean;
  analyzed: boolean;
  edited: boolean;
  imageUrl: string;
}

export type LlmProviderId = "none" | "claude-cli" | "codex-cli" | "opencode-cli" | "ollama";
export type ComfyModelId = "krea2" | "zimage" | "qwen21" | "auto";

export interface Settings {
  llmProvider: LlmProviderId;
  llmModel: string;
  ollamaUrl: string;
  comfyUrl: string;
  comfyModel: ComfyModelId;
  comfyEnginePath: string;
  imageStyle: string;
  githubUser: string;
  roots: string[];
  categories: string[];
}

export interface Health {
  llmProvider: LlmProviderId;
  llm: boolean;
  comfy: boolean;
  comfyModels: { id: string; label: string; available: boolean; reason: string }[];
}

export interface ProjectList {
  projects: Project[];
  hiddenCount: number;
  githubError: string;
  githubSource: string;
}
