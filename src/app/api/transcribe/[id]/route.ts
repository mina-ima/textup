import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions } from '@/lib/db/schema';
import { transcribeAudio } from '@/features/transcription/transcribeAudio';
import { summarizeError, getCategorySummary } from '@/lib/error-messages';

// 5 分以上更新が無い processing は「stuck」とみなして再実行を許可する
const PROCESSING_LOCK_MS = 5 * 60 * 1000;

export const runtime = 'nodejs';
export const maxDuration = 300;

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
  if (!target.audioBlobUrl) {
    return NextResponse.json({ error: 'No audio uploaded yet' }, { status: 400 });
  }

  if (target.status === 'processing') {
    const updatedAt =
      target.updatedAt instanceof Date
        ? target.updatedAt
        : new Date(target.updatedAt);
    const elapsed = Date.now() - updatedAt.getTime();
    if (elapsed < PROCESSING_LOCK_MS) {
      return NextResponse.json(
        {
          error: 'Already processing',
          summary: getCategorySummary('already_processing'),
          category: 'already_processing',
        },
        { status: 409 },
      );
    }
    console.warn(
      `[transcribe] stuck processing detected for ${id} (${Math.round(elapsed / 1000)}s), allowing retry`,
    );
  }

  try {
    await transcribeAudio(id);
    const [updated] = await db
      .select()
      .from(recordingSessions)
      .where(eq(recordingSessions.id, id));
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error('[transcribe] failed', err);
    const { summary, category, detail } = summarizeError(err);
    return NextResponse.json(
      { error: 'Transcription failed', summary, category, detail },
      { status: 500 },
    );
  }
}
