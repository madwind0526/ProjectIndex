import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "cross-spawn";

const CLI_TIMEOUT_MS = 180_000;
const COMMANDS = { "claude-cli": "claude", "codex-cli": "codex", "opencode-cli": "opencode" };
const WINDOWS_EXTENSIONS = ["", ".cmd", ".exe", ".ps1", ".bat"];

/** Scans PATH for the command without spawning it, so the health poll stays cheap. */
export function isCommandInstalled(command, env = process.env) {
  const dirs = (env.PATH || env.Path || "").split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => WINDOWS_EXTENSIONS.some((ext) => existsSync(path.join(dir, `${command}${ext}`))));
}

// Runs in the OS temp dir: a CLI started inside a project would load that project's CLAUDE.md and
// answer in its persona. The prompt goes through stdin because a large argument is mangled by the
// Windows .cmd wrapper. cross-spawn keeps args out of a shell string.
function run(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { timeout: CLI_TIMEOUT_MS, windowsHide: true, cwd: os.tmpdir() });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${command} 종료 코드 ${code}: ${stderr.trim().slice(0, 300)}`))));
    child.stdin?.end(stdin);
  });
}

const stripAnsi = (text) => String(text).replace(/\u001B\[[0-9;?]*[A-Za-z]/g, "");

export async function askLlm(settings, systemPrompt, userPrompt) {
  const { llmProvider: provider, llmModel: model } = settings;
  if (provider === "none") throw new Error("설정에서 LLM을 선택해 주세요.");
  if (provider === "ollama") {
    const response = await fetch(`${settings.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "llama3.1",
        stream: false,
        // Thinking models otherwise spend the answer on reasoning and return no JSON; format forces valid JSON.
        think: false,
        format: "json",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(CLI_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    return (await response.json()).message?.content ?? "";
  }
  const command = COMMANDS[provider];
  const combined = `${systemPrompt}\n\n${userPrompt}`;
  if (provider === "claude-cli") return stripAnsi(await run(command, ["-p", "--system-prompt", systemPrompt, ...(model ? ["--model", model] : [])], userPrompt));
  if (provider === "codex-cli") return stripAnsi(await run(command, ["exec", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", ...(model ? ["--model", model] : []), "-"], combined));
  return stripAnsi(await run(command, ["run", "--pure", ...(model ? ["--model", model] : [])], combined));
}

/** Pulls the first JSON object out of an LLM answer, tolerating code fences and chatter around it. */
export function parseJsonAnswer(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM 응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(text.slice(start, end + 1));
}

const SYSTEM = "You analyse a software project from its metadata and README and describe it for a project catalogue. Reply with one JSON object only, no other text.";

export async function analyseProject(settings, project) {
  const user = [
    `Project folder: ${project.name}`,
    project.pkgDescription ? `package.json description: ${project.pkgDescription}` : "",
    project.githubDescription ? `GitHub description: ${project.githubDescription}` : "",
    project.language ? `Main language: ${project.language}` : "",
    `README (may be truncated):\n${project.readme || "(none)"}`,
    "",
    "Return JSON with exactly these keys:",
    '"summary": one or two Korean sentences, at most 110 characters, what the project is for;',
    '"detail": Korean Markdown (use ## headings and - bullet lists, no title line): purpose, main features, tech stack, how it is used; 6 to 14 lines;',
    `"category": exactly one of ${JSON.stringify(settings.categories)};`,
    '"imagePrompt": English, one sentence describing a visual scene that represents the project, no text or lettering in the picture.',
  ].filter(Boolean).join("\n");
  const answer = parseJsonAnswer(await askLlm(settings, SYSTEM, user));
  const text = (value) => (typeof value === "string" ? value.trim() : "");
  return {
    summary: text(answer.summary).slice(0, 200),
    detail: text(answer.detail),
    category: settings.categories.includes(answer.category) ? answer.category : "",
    imagePrompt: text(answer.imagePrompt),
  };
}
