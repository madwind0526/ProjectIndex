import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "cross-spawn";

const first = (names, patterns) => {
  for (const pattern of patterns) {
    const found = names.find((name) => pattern.test(name));
    if (found) return found;
  }
  return null;
};
const optionsOf = (info, node, field) => (info?.[node]?.input?.required?.[field]?.[0] ?? []).filter((item) => typeof item === "string");

const NEGATIVE_QWEN = "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。构图混乱。文字模糊，扭曲";

function loaders(models, clipType) {
  return {
    1: { class_type: "UNETLoader", inputs: { unet_name: models.unet, weight_dtype: "default" } },
    2: { class_type: "CLIPLoader", inputs: { clip_name: models.clip, type: clipType, device: "default" } },
    3: { class_type: "VAELoader", inputs: { vae_name: models.vae } },
  };
}

export const COMFY_PROFILES = Object.freeze({
  // Krea 2 Turbo: 8 steps, follows a scene description closely.
  krea2: {
    label: "Krea 2 Turbo",
    pick: (info) => {
      const unet = first(optionsOf(info, "UNETLoader", "unet_name"), [/krea2_turbo_fp8_scaled/i, /krea2_turbo_fp8\.safetensors/i, /krea2_turbo_nvfp4/i]);
      const clip = first(optionsOf(info, "CLIPLoader", "clip_name"), [/qwen3vl_4b_fp8_scaled/i]);
      const vae = first(optionsOf(info, "VAELoader", "vae_name"), [/(^|[\\/])qwen_image_vae\.safetensors$/i]);
      return unet && clip && vae ? { unet, clip, vae } : null;
    },
    build: ({ models, prompt, seed, width, height }) => ({
      ...loaders(models, "krea2"),
      4: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
      5: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      6: { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
      7: { class_type: "KSampler", inputs: { model: ["1", 0], seed, steps: 8, cfg: 1.0, sampler_name: "euler", scheduler: "simple", positive: ["4", 0], negative: ["5", 0], latent_image: ["6", 0], denoise: 1.0 } },
      8: { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
      9: { class_type: "PreviewImage", inputs: { images: ["8", 0] } },
    }),
  },
  // FLUX.2 klein 4B (distilled): 4 steps.
  flux2: {
    label: "FLUX.2 klein",
    pick: (info) => {
      const unet = first(optionsOf(info, "UNETLoader", "unet_name"), [/flux-2-klein-4b\.safetensors$/i]);
      const clip = first(optionsOf(info, "CLIPLoader", "clip_name"), [/(^|[\\/])qwen_3_4b\.safetensors$/i]);
      const vae = first(optionsOf(info, "VAELoader", "vae_name"), [/flux2[\\/]flux2-vae\.safetensors$/i]);
      return unet && clip && vae ? { unet, clip, vae } : null;
    },
    build: ({ models, prompt, seed, width, height }) => ({
      ...loaders(models, "flux2"),
      4: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
      5: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      6: { class_type: "KSamplerSelect", inputs: { sampler_name: "euler" } },
      7: { class_type: "Flux2Scheduler", inputs: { steps: 4, width, height } },
      8: { class_type: "CFGGuider", inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], cfg: 1 } },
      9: { class_type: "EmptyFlux2LatentImage", inputs: { width, height, batch_size: 1 } },
      10: { class_type: "RandomNoise", inputs: { noise_seed: seed } },
      11: { class_type: "SamplerCustomAdvanced", inputs: { noise: ["10", 0], guider: ["8", 0], sampler: ["6", 0], sigmas: ["7", 0], latent_image: ["9", 0] } },
      12: { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["3", 0] } },
      13: { class_type: "PreviewImage", inputs: { images: ["12", 0] } },
    }),
  },
  // Qwen-Image 2512: the most faithful to a long description, and the slowest.
  qwen: {
    label: "Qwen-Image 2512",
    pick: (info) => {
      const unet = first(optionsOf(info, "UNETLoader", "unet_name"), [/qwen_image_2512-nvfp4/i, /qwen_image_2512_fp8/i]);
      const clip = first(optionsOf(info, "CLIPLoader", "clip_name"), [/qwen_2\.5_vl_7b_fp8_scaled/i]);
      const vae = first(optionsOf(info, "VAELoader", "vae_name"), [/qwen[\\/]qwen_image_vae\.safetensors$/i, /(^|[\\/])qwen_image_vae\.safetensors$/i]);
      return unet && clip && vae ? { unet, clip, vae } : null;
    },
    build: ({ models, prompt, seed, width, height }) => ({
      ...loaders(models, "qwen_image"),
      4: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
      5: { class_type: "CLIPTextEncode", inputs: { text: NEGATIVE_QWEN, clip: ["2", 0] } },
      6: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.1 } },
      7: { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
      8: { class_type: "KSampler", inputs: { model: ["6", 0], seed, steps: 30, cfg: 4, sampler_name: "euler", scheduler: "simple", positive: ["4", 0], negative: ["5", 0], latent_image: ["7", 0], denoise: 1.0 } },
      9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      10: { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
    }),
  },
  // Qwen-Image 2.1: its own text encoder (Qwen3-VL 8B), its own 4-channel VAE and a dedicated text-encode node that
  // ComfyUI only has in newer versions, so a ComfyUI without that node cannot run it. Steps, cfg and sampler are the
  // ones of ComfyUI's template (25 steps, cfg 1, euler); the turbo checkpoint is a fallback and needs far fewer steps.
  qwen21: {
    label: "Qwen Image 2.1",
    requiresNode: "TextEncodeQwenImage21",
    pick: (info) => {
      if (!info?.TextEncodeQwenImage21) return null;
      const units = optionsOf(info, "UNETLoader", "unet_name");
      const turbo = !first(units, [/qwen_image_2\.1_int8_convrot/i, /qwen_image_2\.1_bf16/i]);
      const unet = first(units, [/qwen_image_2\.1_int8_convrot/i, /qwen_image_2\.1_bf16/i, /qwen_image_2\.1_turbo_int8_convrot/i, /qwen_image_2\.1_turbo_bf16/i]);
      const clip = first(optionsOf(info, "CLIPLoader", "clip_name"), [/qwen3vl_8b_int8_convrot/i, /qwen3vl_8b_fp8_scaled/i, /qwen3vl_8b_bf16/i]);
      const vae = first(optionsOf(info, "VAELoader", "vae_name"), [/qwen_image_2\.1_vae_bf16/i]);
      return unet && clip && vae ? { unet, clip, vae, turbo } : null;
    },
    build: ({ models, prompt, seed, width, height }) => ({
      ...loaders(models, "qwen_image"),
      4: { class_type: "TextEncodeQwenImage21", inputs: { clip: ["2", 0], vae: ["3", 0], prompt, negative_prompt: "", resolution: 1024 } },
      5: { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } },
      6: { class_type: "KSampler", inputs: { model: ["1", 0], seed, steps: models.turbo ? 8 : 25, cfg: 1, sampler_name: "euler", scheduler: "simple", positive: ["4", 0], negative: ["4", 1], latent_image: ["5", 0], denoise: 1.0 } },
      7: { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["3", 0] } },
      8: { class_type: "PreviewImage", inputs: { images: ["7", 0] } },
    }),
  },
  // Z-Image Turbo: the older model SongYUE2 uses for its own covers.
  zimage: {
    label: "Z-Image Turbo",
    pick: (info) => {
      const unet = first(optionsOf(info, "UNETLoader", "unet_name"), [/z[_-]?image[_-]?turbo.*nvfp4/i, /z[_-]?image[_-]?turbo.*fp8/i, /z[_-]?image[_-]?turbo.*bf16/i]);
      const clip = first(optionsOf(info, "CLIPLoader", "clip_name"), [/qwen_3_4b_fp8_mixed/i, /qwen_3_4b_fp4_mixed/i, /qwen_3_4b\.safetensors$/i]);
      const vae = first(optionsOf(info, "VAELoader", "vae_name"), [/(^|[\\/])ae\.safetensors$/i]);
      return unet && clip && vae ? { unet, clip, vae } : null;
    },
    build: ({ models, prompt, seed, width, height }) => ({
      ...loaders(models, "lumina2"),
      4: { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
      5: { class_type: "ConditioningZeroOut", inputs: { conditioning: ["4", 0] } },
      6: { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.0 } },
      7: { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
      8: { class_type: "KSampler", inputs: { model: ["6", 0], seed, steps: 8, cfg: 1.0, sampler_name: "res_multistep", scheduler: "simple", positive: ["4", 0], negative: ["5", 0], latent_image: ["7", 0], denoise: 1.0 } },
      9: { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      10: { class_type: "PreviewImage", inputs: { images: ["9", 0] } },
    }),
  },
});

// Newest and fastest first; the first one whose files are installed is used.
export const COMFY_AUTO_ORDER = Object.freeze(["krea2", "flux2", "qwen", "zimage"]);

/** The models the settings page offers for the album picture. */
export const COVER_MODEL_CHOICES = Object.freeze(["zimage", "krea2", "qwen21"]);
export const DEFAULT_COVER_MODEL = "krea2";

/** A saved choice that is not one of the offered models (including the older "auto") is Krea2. */
export function normalizeCoverModel(value) {
  return COVER_MODEL_CHOICES.includes(value) ? value : DEFAULT_COVER_MODEL;
}

// What the profiles need to find among ComfyUI's loaders; the Qwen 2.1 profile also needs its own node.
const INFO_NODES = ["UNETLoader", "CLIPLoader", "VAELoader", "TextEncodeQwenImage21"];

async function readComfyInfo({ endpoint, fetchImpl }) {
  const entries = await Promise.all(INFO_NODES.map((node) => fetchImpl(`${endpoint}/object_info/${node}`).then((response) => (response.ok ? response.json() : {}), () => ({}))));
  return Object.assign({}, ...entries);
}

/**
 * Which of the offered models can run on this ComfyUI right now, with the reason when one cannot, so the settings page
 * can say so instead of the pictures quietly coming out of another model.
 */
export async function listComfyModels({ endpoint, fetchImpl = globalThis.fetch }) {
  const alive = await fetchImpl(`${endpoint}/system_stats`, { signal: AbortSignal.timeout(2500) }).then((response) => response.ok, () => false);
  const models = [];
  const info = alive ? await readComfyInfo({ endpoint, fetchImpl }) : {};
  for (const name of COVER_MODEL_CHOICES) {
    const profile = COMFY_PROFILES[name];
    let reason = "";
    if (!alive) reason = "ComfyUI가 꺼져 있습니다.";
    else if (!profile.pick(info)) {
      reason = profile.requiresNode && !info[profile.requiresNode]
        ? `설치된 ComfyUI에 ${profile.label}용 노드(${profile.requiresNode})가 없습니다. ComfyUI를 업데이트해 주세요.`
        : `${profile.label} 모델 파일이 ComfyUI에 없습니다.`;
    }
    models.push({ id: name, label: profile.label, available: !reason, reason });
  }
  return { comfyRunning: alive, models };
}

let comfyStarting = null;

/**
 * Starts the ComfyUI that SongYUE2 keeps under its engine folder (same command line SongYUE2 uses, with Comfy Kitchen
 * attention) and waits until it answers. Resolves true when it is running, false when it cannot be started here
 * (a remote address, no engine folder). Callers at the same time share one start.
 */
export function startComfyUi({ endpoint, enginePath, fetchImpl = globalThis.fetch, spawnImpl = spawn, fileExists = existsSync, waitMs = 90000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  comfyStarting ??= (async () => {
    let url;
    try { url = new URL(endpoint); } catch { return false; }
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) return false;
    const python = path.join(enginePath, ".venv", "Scripts", "python.exe");
    if (!fileExists(python)) return false;
    const child = spawnImpl(python, ["main.py", "--listen", url.hostname, "--port", url.port || "8188", "--disable-auto-launch", "--use-ck-attention"], { cwd: enginePath, windowsHide: true, detached: true, stdio: "ignore" });
    child.on?.("error", () => {});
    child.unref?.();
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      if (await fetchImpl(`${endpoint}/system_stats`, { signal: AbortSignal.timeout(1500) }).then((response) => response.ok, () => false)) return true;
      await sleep(1500);
    }
    return false;
  })().finally(() => { comfyStarting = null; });
  return comfyStarting;
}

/**
 * Makes one picture with the chosen ComfyUI model (`model` is a profile name or "auto") and returns
 * the image bytes, or null when ComfyUI is not running or the model files are not installed.
 */
export async function generateComfyImage({ endpoint, prompt, seed, model = "auto", width = 1280, height = 1280, timeoutMs = 300000, fetchImpl = globalThis.fetch, ensureRunning, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const json = async (url, init) => {
    const response = await fetchImpl(url, init);
    if (!response.ok) throw new Error(`ComfyUI ${response.status}`);
    return response.json();
  };
  const isAlive = () => fetchImpl(`${endpoint}/system_stats`, { signal: AbortSignal.timeout(2500) }).then((response) => response.ok, () => false);
  // A ComfyUI that is not running is started here when the caller knows how, so the picture does not depend on
  // something else having started it earlier.
  const alive = (await isAlive()) || (ensureRunning ? await ensureRunning().catch(() => false) : false);
  if (!alive) return null;

  const info = await readComfyInfo({ endpoint, fetchImpl });
  // A chosen model that this ComfyUI cannot run falls back to the usual order, so the album still gets a picture.
  const candidates = model === "auto" || !COMFY_PROFILES[model] ? COMFY_AUTO_ORDER : [model, ...COMFY_AUTO_ORDER.filter((name) => name !== model)];
  let chosen = null;
  for (const name of candidates) {
    const profile = COMFY_PROFILES[name];
    const models = profile?.pick(info);
    if (models) {
      chosen = { profile, models };
      if (model !== "auto" && name !== model) console.warn(`[cover] ${COMFY_PROFILES[model]?.label ?? model} 을(를) 쓸 수 없어 ${profile.label} 으로 그립니다.`);
      break;
    }
  }
  if (!chosen) return null;

  const queued = await json(`${endpoint}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: chosen.profile.build({ models: chosen.models, prompt, seed, width, height }) }),
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = (await json(`${endpoint}/history/${queued.prompt_id}`))[queued.prompt_id];
    if (entry?.status?.status_str === "error") {
      const failure = (entry.status.messages ?? []).find((message) => message[0] === "execution_error");
      throw new Error(failure?.[1]?.exception_message ?? "ComfyUI reported an error");
    }
    if (entry?.status?.completed) {
      const image = Object.values(entry.outputs ?? {}).flatMap((node) => node.images ?? [])[0];
      if (!image) throw new Error("ComfyUI returned no picture");
      const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder ?? "", type: image.type ?? "temp" });
      const picture = await fetchImpl(`${endpoint}/view?${query}`);
      if (!picture.ok) throw new Error(`ComfyUI view ${picture.status}`);
      return Buffer.from(await picture.arrayBuffer());
    }
    await sleep(1000);
  }
  throw new Error("cover generation timed out");
}
