import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TTL_MS = 5 * 60_000;
let cache = { user: "", at: 0, repos: [], source: "" };

const normalize = (repo) => ({
  name: repo.name,
  url: repo.url ?? repo.html_url,
  description: repo.description ?? "",
  pushedAt: repo.pushedAt ?? repo.pushed_at ?? "",
  isPrivate: Boolean(repo.isPrivate ?? repo.private),
  language: repo.primaryLanguage?.name ?? repo.language ?? "",
  release: repo.latestRelease ? { tag: repo.latestRelease.tagName, url: repo.latestRelease.url, publishedAt: repo.latestRelease.publishedAt } : null,
});

async function viaGh(user) {
  const { stdout } = await run("gh", ["repo", "list", user, "--limit", "200", "--json", "name,description,url,pushedAt,isPrivate,primaryLanguage,latestRelease"], { timeout: 30_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout).map(normalize);
}

// Fallback without the gh CLI: public repos only and no release info (it would cost one request per repo).
async function viaRest(user) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed`, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return (await response.json()).map(normalize);
}

/** Returns { repos, source, error }. A GitHub failure never breaks the local list. */
export async function listGithubRepos(user, { force = false } = {}) {
  if (!user) return { repos: [], source: "", error: "" };
  if (!force && cache.user === user && Date.now() - cache.at < TTL_MS) return { repos: cache.repos, source: cache.source, error: "" };
  try {
    let repos;
    let source = "gh";
    try { repos = await viaGh(user); } catch { source = "rest"; repos = await viaRest(user); }
    cache = { user, at: Date.now(), repos, source };
    return { repos, source, error: "" };
  } catch (error) {
    return { repos: cache.user === user ? cache.repos : [], source: cache.source, error: error instanceof Error ? error.message : String(error) };
  }
}
