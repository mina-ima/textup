import 'server-only';
import { eq } from 'drizzle-orm';
import { generateWithFallback } from '@/lib/gemini';
import { db } from '@/lib/db';
import { recordingSessions, transcripts, speakerMappings } from '@/lib/db/schema';

const TRANSCRIBE_PROMPT = `添付の音声を日本語で文字起こししてください。

【規則】
- 聞き取れた内容を忠実に書き起こす。聞こえていない言葉を補完しない。
- 話者が複数いる場合は speaker を 0,1,2 の整数で区別（同じ声は同じ番号）。
- 話者が1人なら全て 0。
- 相槌（「はい」「うん」）が不自然に連続する結果は誤認識の可能性が高いので、その箇所は推測せず実際に聞こえる単語だけ出力する。
- フィラー（えー、あのー等）は省略可。
- 句読点を含む自然な日本語に整える。

【出力形式】
JSON のみを返す。前後の説明やコードフェンスは不要。

{
  "segments": [
    { "speaker": 0, "startMs": 0, "endMs": 1500, "text": "発言内容" }
  ]
}

startMs, endMs は音声開始からのミリ秒。`;

type TranscribeSegment = {
  speaker: number;
  startMs: number;
  endMs: number;
  text: string;
};

type TranscribeResult = {
  segments: TranscribeSegment[];
};

function parseResult(text: string): TranscribeResult {
  // Gemini は稀に markdown code fence や前後の説明文を付けることがあるので
  // 中身の JSON オブジェクトだけを抽出してパースする。
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && Array.isArray(parsed.segments)) {
        return parsed as TranscribeResult;
      }
    } catch {
      // 次の候補を試す
    }
  }

  console.warn('[transcribe] could not parse JSON from Gemini response, treating as empty:',
    text.slice(0, 500));
  return { segments: [] };
}

async function fetchAudioAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio: ${res.status}`);
  }
  const mimeType = res.headers.get('content-type') ?? 'audio/webm';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { base64: buffer.toString('base64'), mimeType };
}

export async function transcribeAudio(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(recordingSessions)
    .where(eq(recordingSessions.id, sessionId));

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  if (!session.audioBlobUrl) {
    throw new Error(`Session has no audio: ${sessionId}`);
  }

  await db
    .update(recordingSessions)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(recordingSessions.id, sessionId));

  try {
    const { base64, mimeType } = await fetchAudioAsBase64(session.audioBlobUrl);

    const result = await generateWithFallback({
      prompt: TRANSCRIBE_PROMPT,
      parts: [
        {
          inlineData: {
            data: base64,
            mimeType,
          },
        },
      ],
      responseMimeType: 'application/json',
    });

    const parsed = parseResult(result.text);

    // 既存の transcripts を削除して書き直し（冪等性のため）
    await db.delete(transcripts).where(eq(transcripts.sessionId, sessionId));

    if (parsed.segments.length > 0) {
      await db.insert(transcripts).values(
        parsed.segments.map((seg, idx) => ({
          sessionId,
          seq: idx,
          speakerLabel: seg.speaker,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
        })),
      );
    }

    // 話者ラベルのデフォルトマッピングを生成（未設定の分だけ）
    const uniqueSpeakers = Array.from(
      new Set(parsed.segments.map((s) => s.speaker)),
    ).sort((a, b) => a - b);

    const existing = await db
      .select()
      .from(speakerMappings)
      .where(eq(speakerMappings.sessionId, sessionId));
    const existingLabels = new Set(existing.map((e) => e.speakerLabel));

    const newMappings = uniqueSpeakers
      .filter((label) => !existingLabels.has(label))
      .map((label) => ({
        sessionId,
        speakerLabel: label,
        displayName: `話者${String.fromCharCode(65 + label)}`,
        color: COLORS[label % COLORS.length],
      }));

    if (newMappings.length > 0) {
      await db.insert(speakerMappings).values(newMappings);
    }

    await db
      .update(recordingSessions)
      .set({
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(recordingSessions.id, sessionId));
  } catch (err) {
    console.error('[transcribe] Gemini call failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Gemini の一時エラー（ネットワーク / 429 / 一時的な内部エラー）は「詰まり」として扱い、
    // status を processing のまま残さず failed にしてユーザーが再実行できるようにする。
    await db
      .update(recordingSessions)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(recordingSessions.id, sessionId));
    throw err;
  }
}

const COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
];
