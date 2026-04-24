import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions, transcripts } from '@/lib/db/schema';

const PatchBody = z.object({
  speakerLabel: z.number().int().min(0).max(99),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const { id, tid } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [row] = await db
    .select()
    .from(recordingSessions)
    .where(
      and(
        eq(recordingSessions.id, id),
        eq(recordingSessions.userId, session.user.id),
      ),
    );
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = PatchBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  await db
    .update(transcripts)
    .set({ speakerLabel: body.data.speakerLabel })
    .where(
      and(eq(transcripts.id, tid), eq(transcripts.sessionId, id)),
    );

  return NextResponse.json({ ok: true });
}
