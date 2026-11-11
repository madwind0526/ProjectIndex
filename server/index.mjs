import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { IMAGE_DIR, ROOT, loadOverrides, loadSettings, patchOverride, restoreHidden, saveSettings } from "./store.mjs";
import { githubRepoOf, scanLocal, slug } from "./scan.mjs";
import { listGithubRepos } from "./github.mjs";
import { analyseProject, isCommandInstalled } from "./llm.mjs";
import { COMFY_AUTO_ORDER, generateComfyImage, listComfyModels, startComfyUi } from "./comfy.mjs";
import { loadEnvFile, envValue } from "./env.mjs";

loadEnvFile(ROOT);
const PORT = Number(envValue(process.env, "PORT") || 4319);
const WEB_DIST = path.join(ROOT, "dist");
const MAX_BODY_BYTES = 1024 * 1024;
const CLI_COMMANDS = { "claude-cli": "claude", "codex-cli": "codex", "opencode-cli": "opencode" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Fallback until the LLM has analysed a project: first matching keyword group wins; unknown names stay "기타".
const CATEGORY_KEYWORDS = [
  ["음악", /music|song|audio|yue|lyric|음악|노래|곡|가사/],
  ["영상·미디어", /video|movie|montage|comfy|image|영상|이미지|다운로드|download/],
  ["AI·에이전트", /\bllm\b|agent|\bai\b|openai|에이전트/],
  ["금융·투자", /crypto|trading|upbit|coin|stock|코인|투자|매매/],
  ["게임", /game|strike|defen[cs]e|게임|방어/],
  ["통신·네트워크", /bluetooth|wifi|wi-fi|mesh|network|\blan\b|통신|네트워크/],
  ["생산성·노트", /note|memo|reader|meeting|obsidian|phonebook|address|club|노트|메모|회의|주소록|배송/],
  ["도구·유틸리티", /tool|util|desktop|calculator|도구|유틸/],
];
function guessCategory(text, categories) {
  const lower = text.toLowerCase();
  const hit = CATEGORY_KEYWORDS.find(([name, pattern]) => categories.includes(name) && pattern.test(lower));
  return hit ? hit[0] : "기타";
}

const imagePath = (id) => path.join(IMAGE_DIR, `${id}.png`);

/** Joins the local scan, the GitHub list and the saved edits into the cards the UI shows. */
async function buildProjects({ force = false } = {}) {
  const settings = await loadSettings();
  const [locals, github, overrides] = await Promise.all([scanLocal(settings.roots), listGithubRepos(settings.githubUser, { force }), loadOverrides()]);
  const byName = new Map(github.repos.map((repo) => [repo.name.toLowerCase(), repo]));
  const used = new Set();
  const items = [];

  const make = (local, repo) => {
    const id = local?.id ?? slug(repo.name);
    const o = overrides[id] ?? {};
    const release = repo?.release ?? null;
    const image = imagePath(id);
    return {
      id,
      name: o.name ?? local?.name ?? repo.name,
      localPath: local?.path ?? "",
      inLocal: Boolean(local),
      inGithub: Boolean(repo),
      isPrivate: repo?.isPrivate ?? false,
      github: o.github ?? repo?.url ?? local?.remote ?? "",
      link: o.link ?? local?.link ?? "",
      hasStart: local?.hasStart ?? false,
      hasStop: local?.hasStop ?? false,
      summary: o.summary ?? (local?.pkgDescription || repo?.description || local?.readmeSummary || ""),
      detail: o.detail ?? (local?.readme?.slice(0, 900) || repo?.description || ""),
      category: o.category ?? guessCategory(`${o.name ?? local?.name ?? repo.name} ${o.summary ?? (local?.pkgDescription || repo?.description || local?.readmeSummary || "")} ${local?.pkgDescription ?? ""}`, settings.categories),
      releaseDate: o.releaseDate ?? release?.publishedAt?.slice(0, 10) ?? "",
      releaseTag: release?.tag ?? local?.version ?? "",
      releaseUrl: release?.url ?? "",
      language: repo?.language ?? "",
      lastActivity: local?.lastCommit || repo?.pushedAt || "",
      hasLlm: o.hasLlm ?? local?.usesLlm ?? false,
      hasDocs: o.hasDocs ?? local?.hasDocs ?? false,
      hasRelease: o.hasRelease ?? Boolean(release || local?.gitTag),
      favorite: Boolean(o.favorite),
      working: Boolean(o.working),
      analyzed: Boolean(o.analyzed),
      edited: Boolean(o.edited),
      hidden: Boolean(o.hidden),
      imageUrl: existsSync(image) ? `/api/images/${id}.png?v=${Math.floor(statSync(image).mtimeMs)}` : "",
      // Only used server-side by the AI refresh; stripped before the list is sent.
      _readme: local?.readme ?? "",
      _pkgDescription: local?.pkgDescription ?? "",
      _githubDescription: repo?.description ?? "",
    };
  };

  for (const local of locals) {
    const remote = githubRepoOf(local.remote);
    const mine = remote && remote.owner.toLowerCase() === settings.githubUser.toLowerCase();
    // A clone of someone else's repo is still a local project, but it is not "on my GitHub".
    // Same-named repo of mine also matches when the remote belongs to another account (a moved/renamed owner).
    const repo = mine ? byName.get(remote.repo.toLowerCase()) : byName.get(local.name.toLowerCase());
    if (repo) used.add(repo.name);
    items.push(make(local, repo));
  }
  for (const repo of github.repos) if (!used.has(repo.name)) items.push(make(null, repo));
  items.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return { items, github, settings };
}

const publicItem = ({ _readme, _pkgDescription, _githubDescription, ...rest }) => rest;

async function findProject(id, options) {
  const result = await buildProjects(options);
  const project = result.items.find((item) => item.id === id);
  if (!project) throw new HttpError(404, "프로젝트를 찾을 수 없습니다.");
  return { project, settings: result.settings };
}

async function makeImage(project, settings, prompt) {
  const scene = prompt || project.summary || project.name;
  const bytes = await generateComfyImage({
    endpoint: settings.comfyUrl,
    prompt: `${settings.imageStyle}. Scene: ${scene}. No text, no lettering, no watermark.`,
    seed: Math.floor(Math.random() * 2 ** 31),
    model: settings.comfyModel,
    width: 1024,
    height: 640,
    ensureRunning: settings.comfyEnginePath ? () => startComfyUi({ endpoint: settings.comfyUrl, enginePath: settings.comfyEnginePath }) : undefined,
  });
  if (!bytes) throw new Error("ComfyUI가 꺼져 있거나 사용할 수 있는 이미지 모델이 없습니다.");
  await mkdir(IMAGE_DIR, { recursive: true });
  await writeFile(imagePath(project.id), bytes);
  // Remember which summary the picture was drawn from, so a later change to the summary is noticed.
  await patchOverride(project.id, { imageSummary: project.summary });
}

/** Refresh = re-read facts (always, since every list call scans) + LLM text unless hand-edited + image when missing. */
async function refreshProject(id, { images = true, overwrite = false, onlyIfChanged = false } = {}) {
  const { project, settings } = await findProject(id, { force: true });
  const notes = [];
  let imagePrompt = "";
  // Update All skips the (slow) LLM when the README/description it would read is the same as at the last analysis.
  const sourceHash = createHash("sha1").update(JSON.stringify([project._readme, project._pkgDescription, project._githubDescription])).digest("hex");
  const unchanged = onlyIfChanged && project.analyzed && (await loadOverrides())[id]?.sourceHash === sourceHash;
  if (settings.llmProvider !== "none" && (overwrite || !project.edited) && !unchanged) {
    try {
      const result = await analyseProject(settings, { name: project.name, pkgDescription: project._pkgDescription, githubDescription: project._githubDescription, language: project.language, readme: project._readme });
      const patch = { imagePrompt: result.imagePrompt, analyzed: true, sourceHash };
      if (result.summary) patch.summary = result.summary;
      if (result.detail) patch.detail = result.detail;
      if (result.category) patch.category = result.category;
      await patchOverride(id, patch);
      imagePrompt = result.imagePrompt;
    } catch (error) {
      notes.push(`LLM 분석 실패: ${error.message}`);
    }
  } else if (settings.llmProvider === "none") notes.push("LLM이 선택되지 않아 요약은 갱신하지 않았습니다.");
  // The picture is redrawn when it is missing or the summary changed since it was made (LLM rewrite or a hand edit).
  const current = (await findProject(id)).project;
  const saved = (await loadOverrides())[id] ?? {};
  if (images && (!current.imageUrl || saved.imageSummary !== current.summary)) {
    // A stored scene prompt belongs to LLM text; after a hand edit the summary itself is the better description.
    const scene = imagePrompt || (current.edited ? "" : saved.imagePrompt ?? "");
    try { await makeImage(current, settings, scene); } catch (error) { notes.push(`이미지 생성 실패: ${error.message}`); }
  }
  return { project: publicItem((await findProject(id)).project), notes };
}

// start.bat of several projects blocks (npm start), so it runs in its own console window. stop.bat runs first and is
// awaited, with "nopause" so a project that pauses at the end cannot hang this request.
function runStop(project) {
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", ["/d", "/c", "stop.bat", "nopause"], { cwd: project.localPath, windowsHide: true, stdio: "ignore", timeout: 30_000 });
    child.on("error", resolve);
    child.on("close", resolve);
  });
}

async function runProject(project) {
  if (!project.inLocal || !project.hasStart) throw new HttpError(400, "이 프로젝트에는 start.bat이 없습니다.");
  if (project.hasStop) await runStop(project);
  const title = project.name.replace(/[^\w .-]/g, "");
  const child = spawn("cmd.exe", ["/d", "/c", `start "${title}" /D "${project.localPath}" "${path.join(project.localPath, "start.bat")}"`], { cwd: project.localPath, detached: true, stdio: "ignore", windowsVerbatimArguments: true });
  child.on("error", () => {});
  child.unref();
}

const execFileAsync = promisify(execFile);
const REPO_NAME = "ProjectIndex";

async function tool(command, args) {
  try {
    return (await execFileAsync(command, args, { cwd: ROOT, timeout: 120_000, windowsHide: true })).stdout.trim();
  } catch (error) {
    throw new HttpError(502, `${command} ${args[0]} 실패: ${String(error.stderr || error.message).trim().slice(0, 400)}`);
  }
}

/** Commits everything not git-ignored (data/runtime, .env and node_modules are ignored) and pushes it to <githubUser>/ProjectIndex. */
async function pushToGithub() {
  const { githubUser } = await loadSettings();
  if (!githubUser) throw new HttpError(400, "설정에서 GitHub 사용자를 입력해 주세요.");
  const steps = [];
  if (!existsSync(path.join(ROOT, ".git"))) {
    await tool("git", ["init", "-b", "main"]);
    steps.push("git 저장소를 만들었습니다.");
  }
  const remotes = (await tool("git", ["remote"])).split(/\s+/);
  if (!remotes.includes("origin")) {
    const slugName = `${githubUser}/${REPO_NAME}`;
    const exists = await execFileAsync("gh", ["repo", "view", slugName], { cwd: ROOT, windowsHide: true }).then(() => true, () => false);
    // A missing repo is created private; making it public is left to the user.
    if (!exists) {
      await tool("gh", ["repo", "create", slugName, "--private"]);
      steps.push(`GitHub에 비공개 저장소 ${slugName}를 만들었습니다.`);
    }
    await tool("git", ["remote", "add", "origin", `https://github.com/${slugName}.git`]);
  }
  await tool("git", ["add", "-A"]);
  const staged = await execFileAsync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT, windowsHide: true }).then(() => false, () => true);
  if (staged) {
    await tool("git", ["commit", "-m", `Update Project Index ${new Date().toISOString().slice(0, 16).replace("T", " ")}`]);
    steps.push("변경 사항을 커밋했습니다.");
  } else steps.push("커밋할 변경 사항이 없습니다.");
  await tool("git", ["push", "-u", "origin", "HEAD"]);
  steps.push("GitHub에 푸시했습니다.");
  return { steps };
}

async function health() {
  const settings = await loadSettings();
  const command = CLI_COMMANDS[settings.llmProvider];
  const llmOk = settings.llmProvider === "none" ? false : command ? isCommandInstalled(command) : await fetch(`${settings.ollamaUrl.replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
  const comfy = await listComfyModels({ endpoint: settings.comfyUrl }).catch(() => ({ comfyRunning: false, models: [] }));
  return { llmProvider: settings.llmProvider, llm: llmOk, comfy: comfy.comfyRunning, comfyModels: comfy.models };
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "요청이 너무 큽니다.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "JSON 형식이 올바르지 않습니다."); }
}

const sendJson = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

// A web page open in the same browser could otherwise POST here and launch batch files, so any request that
// names a non-local Origin is refused.
function assertLocalOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  let host = "";
  try { host = new URL(origin).hostname; } catch { /* treated as foreign below */ }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) throw new HttpError(403, "허용되지 않은 요청입니다.");
}

async function route(request, response, url) {
  const { pathname } = url;
  const method = request.method ?? "GET";
  if (method !== "GET") assertLocalOrigin(request);

  if (pathname === "/api/health") return sendJson(response, 200, await health());
  if (pathname === "/api/settings") {
    if (method === "PUT") return sendJson(response, 200, await saveSettings(await readBody(request)));
    return sendJson(response, 200, await loadSettings());
  }
  if (pathname === "/api/projects" && method === "GET") {
    const { items, github } = await buildProjects({ force: url.searchParams.get("refresh") === "1" });
    return sendJson(response, 200, { projects: items.filter((item) => !item.hidden).map(publicItem), hiddenCount: items.filter((item) => item.hidden).length, githubError: github.error, githubSource: github.source });
  }
  if (pathname === "/api/projects/restore-hidden" && method === "POST") return sendJson(response, 200, { restored: await restoreHidden() });

  const image = /^\/api\/images\/([\w가-힣-]+)\.png$/.exec(pathname);
  if (image && method === "GET") {
    const file = imagePath(image[1]);
    if (!existsSync(file)) throw new HttpError(404, "이미지가 없습니다.");
    response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000" });
    return createReadStream(file).pipe(response);
  }

  const match = /^\/api\/projects\/([^/]+)(?:\/(refresh|run|image|open-folder))?$/.exec(pathname);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const action = match[2];
    if (!action && method === "PUT") {
      const patch = await readBody(request);
      await patchOverride(id, patch);
      return sendJson(response, 200, { project: publicItem((await findProject(id)).project) });
    }
    if (!action && method === "DELETE") {
      await findProject(id);
      await patchOverride(id, { hidden: true });
      return sendJson(response, 200, { ok: true });
    }
    if (method === "POST" && action === "refresh") return sendJson(response, 200, await refreshProject(id, { images: url.searchParams.get("images") !== "0", overwrite: url.searchParams.get("force") === "1", onlyIfChanged: url.searchParams.get("changed") === "1" }));
    if (method === "POST" && action === "run") {
      await runProject((await findProject(id)).project);
      return sendJson(response, 200, { ok: true });
    }
    if (method === "POST" && action === "image") {
      const { project, settings } = await findProject(id);
      const overrides = await loadOverrides();
      try { await makeImage(project, settings, overrides[id]?.imagePrompt ?? ""); } catch (error) { throw new HttpError(502, error.message); }
      return sendJson(response, 200, { project: publicItem((await findProject(id)).project) });
    }
    if (method === "POST" && action === "open-folder") {
      const { project } = await findProject(id);
      if (!project.localPath) throw new HttpError(400, "이 PC에 없는 프로젝트입니다.");
      spawn("explorer.exe", [project.localPath], { detached: true, stdio: "ignore" }).unref();
      return sendJson(response, 200, { ok: true });
    }
  }
  if (pathname === "/api/git/push" && method === "POST") return sendJson(response, 200, await pushToGithub());
  if (pathname.startsWith("/api/")) throw new HttpError(404, "알 수 없는 요청입니다.");
  return serveStatic(response, pathname);
}

function serveStatic(response, pathname) {
  let file = path.join(WEB_DIST, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(WEB_DIST)) throw new HttpError(403, "허용되지 않은 경로입니다.");
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(WEB_DIST, "index.html");
  if (!existsSync(file)) throw new HttpError(404, "빌드된 화면이 없습니다. npm run build 후 다시 실행하거나 start.bat(개발 모드)을 사용하세요.");
  response.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}

const server = createServer((request, response) => {
  route(request, response, new URL(request.url ?? "/", "http://localhost")).catch((error) => {
    if (response.headersSent) return response.end();
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Project Index API: http://127.0.0.1:${PORT}`));
