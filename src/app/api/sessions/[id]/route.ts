import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions } from '@/lib/db/schema';

export const runtime = 'nodejs';

export async function DELETE(
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

  // Vercel Blob 上の音声ファイルも削除（存在する場合）
  if (target.audioBlobUrl) {
    try {
      await del(target.audioBlobUrl);
    } catch (err) {
      console.warn('[sessions/DELETE] blob delete failed (continuing)', err);
    }
  }

  // transcripts / speaker_mappings / summaries は CASCADE で自動削除される
  await db
    .delete(recordingSessions)
    .where(eq(recordingSessions.id, id));

  return NextResponse.json({ ok: true });
}
