import 'server-only';
import { GoogleGenerativeAI, type GenerativeModel, type Part } from '@google/generative-ai';

// 候補順は「実在が確認できるモデルを上位、未来モデル枠を最後に少数」。
// 常時 404 を返すと判明したモデル（3.5-flash, 3.0-flash, 2.0-flash-exp,
// 1.5-flash, 1.5-flash-latest）は除外し、無駄なフォールバックを減らす。
// 未来モデルは 1 段だけ先頭に残し、リリース時にコード変更なしで自動採用。
const DEFAULT_CANDIDATES = [
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
] as const;

function getCandidates(): string[] {
  const override = process.env.GEMINI_MODEL_CANDIDATES;
  if (override) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_CANDIDATES];
}

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return new GoogleGenerativeAI(key);
}

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
  const candidates = getCandidates();
  const errors: Array<{ model: string; error: string }> = [];

  for (const modelName of candidates) {
    try {
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
      const result = await model.generateContent(contents);
      const text = result.response.text();
      console.log(`[gemini] success with model: ${modelName}`);
      return { text, model: modelName };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ model: modelName, error: msg });
      if (isFallbackError(err)) {
        console.warn(`[gemini] fallback from ${modelName}: ${msg}`);
        continue;
      }
      // フォールバック対象外のエラー（認証エラーなど）は即座に投げる
      throw err;
    }
  }

  throw new Error(
    `All Gemini model candidates failed: ${JSON.stringify(errors)}`,
  );
}

export { getCandidates as getGeminiCandidates };
