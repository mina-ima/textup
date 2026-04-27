import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions, speakerMappings, summaries, transcripts } from '@/lib/db/schema';
import { generateWithFallback } from '@/lib/gemini';
import { buildSummaryPrompt } from '@/features/summary/promptBuilder';
import { summarizeError } from '@/lib/error-messages';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [target] = await db
    .select()
    .from(recordingSessions)
    .where(
      and(
        eq(recordingSessions.id, id),
        eq(recordingSessions.userId, session.user.id),
      ),
    );
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.status !== 'ready') {
    return NextResponse.json({ error: 'Session not ready yet' }, { status: 400 });
  }

  const [segs, spks] = await Promise.all([
    db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, id))
      .orderBy(asc(transcripts.seq)),
    db
      .select()
      .from(speakerMappings)
      .where(eq(speakerMappings.sessionId, id)),
  ]);

  if (segs.length === 0) {
    return NextResponse.json({ error: 'No transcripts' }, { status: 400 });
  }

  const speakerMap: Record<number, string> = {};
  for (const s of spks) speakerMap[s.speakerLabel] = s.displayName;

  const prompt = buildSummaryPrompt(target.title, segs.map((s) => ({
    speakerLabel: s.speakerLabel,
    startMs: s.startMs,
    text: s.text,
  })), speakerMap);

  try {
    const result = await generateWithFallback({
      prompt,
      responseMimeType: 'text/plain',
    });

    // summary は sessionId unique なので upsert
    const [existing] = await db
      .select()
      .from(summaries)
      .where(eq(summaries.sessionId, id));

    if (existing) {
      await db
        .update(summaries)
        .set({
          markdown: result.text,
          model: result.model,
          generatedAt: new Date(),
        })
        .where(eq(summaries.sessionId, id));
    } else {
      await db.insert(summaries).values({
        sessionId: id,
        markdown: result.text,
        model: result.model,
      });
    }

    return NextResponse.json({ markdown: result.text, model: result.model });
  } catch (err) {
    console.error('[summarize] failed', err);
    const { summary, category, detail } = summarizeError(err);
    return NextResponse.json(
      { error: 'Summarization failed', summary, category, detail },
      { status: 500 },
    );
  }
}
