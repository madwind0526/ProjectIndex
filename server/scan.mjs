import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const run = promisify(execFile);
const SKIP = /^(memory-bank|_template|node_modules)$|\.worktrees$|^\./i;
const LLM_PATTERN = /ollama|anthropic|openai|gemini|llm_provider|claude-cli|codex-cli|opencode|langchain/i;

export const slug = (name) => name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");

const read = (file, max = 20_000) => readFile(file, "utf8").then((text) => text.slice(0, max), () => "");
const exists = (file) => stat(file).then(() => true, () => false);
const git = (dir, ...args) => run("git", ["-C", dir, ...args], { timeout: 8000, windowsHide: true }).then((r) => r.stdout.trim(), () => "");

/** A remote URL can carry a token (https://token@github.com/...). Strip it so it never reaches the UI or disk. */
export const cleanRemote = (url) => url.replace(/^(https?:\/\/)[^@/\s]+@/i, "$1").replace(/\.git$/i, "");

function remoteRepo(url) {
  const match = /github\.com[/:]([^/]+)\/([^/\s]+?)$/i.exec(url);
  return match ? { owner: match[1], repo: match[2] } : null;
}

// First port found in start.bat; the web (UI) port wins over the API port.
function portFrom(startBat) {
  for (const pattern of [/WEB_PORT=(\d+)/, /UI_PORT=(\d+)/, /https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/, /\bPORT=(\d+)/, /API_PORT=(\d+)/]) {
    const match = pattern.exec(startBat);
    if (match) return Number(match[1]);
  }
  return null;
}

function firstParagraph(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, "").split(/\r?\n/);
  const body = text.filter((line) => line.trim() && !/^(#|!\[|\[!\[|>|\||---|<|https?:)/.test(line.trim()));
  return body.slice(0, 3).join(" ").replace(/[*_`[\]]/g, "").slice(0, 160);
}

async function scanOne(dir, name) {
  const [pkgText, readme, startBat, hasStop, env, reqs, remote, tags, last] = await Promise.all([
    read(path.join(dir, "package.json")),
    read(path.join(dir, "README.md"), 6000),
    read(path.join(dir, "start.bat")),
    exists(path.join(dir, "stop.bat")),
    read(path.join(dir, ".env.example"), 4000),
    Promise.all([read(path.join(dir, "requirements.txt"), 4000), read(path.join(dir, "pyproject.toml"), 4000)]).then((parts) => parts.join("\n")),
    git(dir, "remote", "get-url", "origin"),
    git(dir, "tag", "-l"),
    git(dir, "log", "-1", "--format=%cI"),
  ]);
  let pkg = {};
  try { pkg = JSON.parse(pkgText); } catch { /* not a node project */ }
  const hasDocs = readme.length > 200 || (await exists(path.join(dir, "docs")));
  const port = portFrom(startBat);
  return {
    id: slug(name),
    name,
    path: dir,
    pkgDescription: typeof pkg.description === "string" ? pkg.description : "",
    version: typeof pkg.version === "string" ? pkg.version : "",
    readme,
    readmeSummary: firstParagraph(readme),
    remote: cleanRemote(remote),
    gitTag: Boolean(tags),
    lastCommit: last,
    hasStart: startBat.length > 0,
    hasStop,
    link: port ? `http://127.0.0.1:${port}` : "",
    hasDocs,
    usesLlm: LLM_PATTERN.test(pkgText) || LLM_PATTERN.test(env) || LLM_PATTERN.test(reqs),
  };
}

export async function scanLocal(roots) {
  const found = [];
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP.test(entry.name)) found.push([path.join(root, entry.name), entry.name]);
    }
  }
  const projects = await Promise.all(found.map(([dir, name]) => scanOne(dir, name)));
  // Two roots can hold a folder of the same name; the later one gets a drive suffix so ids stay unique.
  const seen = new Set();
  for (const project of projects) {
    if (seen.has(project.id)) {
      const byDrive = `${project.id}-${project.path[0].toLowerCase()}`;
      // Same name on the same drive too: fall back to a short hash of the full path.
      project.id = seen.has(byDrive) ? `${project.id}-${createHash("sha1").update(project.path).digest("hex").slice(0, 6)}` : byDrive;
    }
    seen.add(project.id);
  }
  return projects;
}

export const githubRepoOf = remoteRepo;
