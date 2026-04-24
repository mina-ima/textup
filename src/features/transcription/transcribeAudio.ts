import 'server-only';
import { eq } from 'drizzle-orm';
import { generateWithFallback } from '@/lib/gemini';
import { db } from '@/lib/db';
import { recordingSessions, transcripts, speakerMappings } from '@/lib/db/schema';

const TRANSCRIBE_PROMPT = `以下の音声を日本語で文字起こししてください。話者が複数いる場合は話者を区別してください。

出力は以下のJSON形式で：
{
  "segments": [
    { "speaker": 0, "startMs": 0, "endMs": 1500, "text": "発言内容" }
  ]
}

規則:
- speaker は整数（0, 1, 2, ...）。同じ声には同じ番号を使うこと。
- startMs, endMs は音声の開始からのミリ秒。
- text は句読点を含む自然な日本語に整えること。
- 無音や雑音は含めない。
- フィラー（えー、あのー等）は必要に応じて省略可。
- セグメントは発話単位で区切る（長くなりすぎる場合は文単位で）。`;

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
  // Gemini は稀に markdown code fence で囲むことがある
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed || !Array.isArray(parsed.segments)) {
    throw new Error('Invalid Gemini response: missing segments array');
  }
  return parsed as TranscribeResult;
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
