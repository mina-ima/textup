import 'server-only';
import { GoogleGenerativeAI, type GenerativeModel, type Part } from '@google/generative-ai';

// 静的フォールバック候補（ListModels API が失敗したときだけ使う）。
// 動的取得が成功すればこのリストは無視される。
const DEFAULT_CANDIDATES = [
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const;

// ListModels API キャッシュ（プロセスメモリ、TTL 1h）
type CachedModels = { fetchedAt: number; models: string[] };
let modelsCache: CachedModels | null = null;
const MODELS_TTL_MS = 60 * 60 * 1000;

type ListModelsEntry = {
  name: string;
  supportedGenerationMethods?: string[];
};

// gemini-X.Y[-variant] を [メジャー, マイナー, 階層スコア] に分解。
// 階層スコア: pro=3, flash=2, flash-lite=1。exp/preview/latest は -5 で降格。
function parseModelVersion(name: string): {
  major: number;
  minor: number;
  tier: number;
} {
  const m = name.match(/^gemini-(\d+)(?:\.(\d+))?(?:-(.+))?$/);
  if (!m) return { major: 0, minor: 0, tier: 0 };
  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  const variant = m[3] ?? '';
  let tier = 0;
  if (variant.startsWith('pro')) tier = 3;
  else if (variant.startsWith('flash-lite')) tier = 1;
  else if (variant.startsWith('flash')) tier = 2;
  if (
    variant.includes('exp') ||
    variant.includes('preview') ||
    variant.includes('latest')
  ) {
    tier -= 5;
  }
  return { major, minor, tier };
}

function compareModelVersions(a: string, b: string): number {
  const va = parseModelVersion(a);
  const vb = parseModelVersion(b);
  if (va.major !== vb.major) return vb.major - va.major;
  if (va.minor !== vb.minor) return vb.minor - va.minor;
  return vb.tier - va.tier;
}

async function fetchAvailableModels(): Promise<string[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      console.warn(`[gemini] ListModels failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { models?: ListModelsEntry[] };
    const list = (data.models ?? [])
      .filter((m) =>
        m.supportedGenerationMethods?.includes('generateContent'),
      )
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => n.startsWith('gemini-') && /^gemini-\d/.test(n))
      // 文字起こし用途に不適切なバリアント・重複バージョンを除外:
      // -image / -tts / -computer-use / -customtools / 日付・リビジョンサフィックス
      .filter((n) => !/-(image|tts|computer-use|customtools)/.test(n))
      .filter((n) => !/-\d{3,4}$/.test(n))
      .filter((n) => !/-\d{2}-\d{4}$/.test(n))
      // preview / exp / latest を除外:
      // 文字起こしは確定用途で、preview 系は無料枠が厳しく無駄打ちで
      // クォータを消費するだけ。stable がリリースされれば自動採用される。
      .filter((n) => !/-(preview|exp|latest)\b/.test(n));
    list.sort(compareModelVersions);
    return list;
  } catch (err) {
    console.warn(`[gemini] ListModels fetch error: ${(err as Error).message}`);
    return null;
  }
}

async function getCandidates(): Promise<string[]> {
  const override = process.env.GEMINI_MODEL_CANDIDATES;
  if (override) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const now = Date.now();
  if (modelsCache && now - modelsCache.fetchedAt < MODELS_TTL_MS) {
    return modelsCache.models;
  }

  const dynamic = await fetchAvailableModels();
  if (dynamic && dynamic.length > 0) {
    modelsCache = { fetchedAt: now, models: dynamic };
    console.log(
      `[gemini] dynamic candidates (${dynamic.length}): ${dynamic.slice(0, 5).join(', ')}${dynamic.length > 5 ? ', ...' : ''}`,
    );
    return dynamic;
  }

  console.warn('[gemini] using static DEFAULT_CANDIDATES fallback');
  return [...DEFAULT_CANDIDATES];
}

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenerativeAI(key);
}

// 429 エラーが Google RetryInfo を含む場合に秒数を抽出する。
// 例: `"retryDelay": "5s"` / `retryDelay: 5s` / `retryDelay: "5.5s"` 等
// 取得できなければ null。長すぎる遅延は ms 上限でクランプ。
const MAX_RETRY_DELAY_MS = 30_000;

export function parseRetryDelayMs(message: string): number | null {
  const m = message.match(/retryDelay["'\s:]+([0-9]+(?:\.[0-9]+)?)s/i);
  if (!m) return null;
  const sec = parseFloat(m[1]);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.min(Math.round(sec * 1000), MAX_RETRY_DELAY_MS);
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('429') || msg.includes('rate limit');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// フォールバック対象とすべきエラーか判定
function isFallbackError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('billing') ||
    msg.includes('permission') ||
    msg.includes('unsupported') ||
    msg.includes('429') ||
    msg.includes('403') ||
    // 一時的なサーバーエラー / 高負荷 → 別モデルで試す
    msg.includes('503') ||
    msg.includes('service unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('500') ||
    msg.includes('internal error') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('deadline')
  );
}

export type GenerateInput = {
  prompt: string;
  parts?: Part[];
  responseMimeType?: 'text/plain' | 'application/json';
  systemInstruction?: string;
};

export type GenerateResult = {
  text: string;
  model: string;
};

// モデルフォールバックを内蔵した generate 関数
export async function generateWithFallback(
  input: GenerateInput,
): Promise<GenerateResult> {
  const client = getClient();
  const candidates = await getCandidates();
  const errors: Array<{ model: string; error: string }> = [];

  for (const modelName of candidates) {
    const model: GenerativeModel = client.getGenerativeModel({
      model: modelName,
      generationConfig: input.responseMimeType
        ? { responseMimeType: input.responseMimeType }
        : undefined,
      systemInstruction: input.systemInstruction,
    });
    const contents: Part[] = [
      { text: input.prompt },
      ...(input.parts ?? []),
    ];

    // 同モデルで最大 2 回（初回 + retryDelay 待ち再試行）試行する。
    // 429 で retryDelay が取れたときだけ待機 → 再試行。それ以外は即フォールバック。
    let attempt = 0;
    while (attempt < 2) {
      try {
        const result = await model.generateContent(contents);
        const text = result.response.text();
        console.log(
          `[gemini] success with model: ${modelName}${attempt > 0 ? ' (after retry)' : ''}`,
        );
        return { text, model: modelName };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const delayMs =
          attempt === 0 && isRateLimitError(err)
            ? parseRetryDelayMs(msg)
            : null;
        if (delayMs !== null) {
          console.warn(
            `[gemini] 429 on ${modelName}, waiting ${delayMs}ms then retrying once`,
          );
          await sleep(delayMs);
          attempt += 1;
          continue;
        }
        errors.push({ model: modelName, error: msg });
        if (isFallbackError(err)) {
          console.warn(`[gemini] fallback from ${modelName}: ${msg}`);
          break; // 次のモデルへ
        }
        throw err;
      }
    }
  }

  throw new Error(
    `All Gemini model candidates failed: ${JSON.stringify(errors)}`,
  );
}

export { getCandidates as getGeminiCandidates };
export { fetchAvailableModels as fetchGeminiAvailableModels };
