import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions, speakerMappings } from '@/lib/db/schema';

const PatchBody = z.object({
  speakerLabel: z.number().int().min(0).max(99),
  displayName: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

async function authorize(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' as const, status: 401 };
  const [row] = await db
    .select()
    .from(recordingSessions)
    .where(
      and(
        eq(recordingSessions.id, id),
        eq(recordingSessions.userId, session.user.id),
      ),
    );
  if (!row) return { error: 'Not found' as const, status: 404 };
  return { userId: session.user.id };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authResult = await authorize(id);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = PatchBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { speakerLabel, displayName, color } = body.data;

  const [existing] = await db
    .select()
    .from(speakerMappings)
    .where(
      and(
        eq(speakerMappings.sessionId, id),
        eq(speakerMappings.speakerLabel, speakerLabel),
      ),
    );

  if (existing) {
    await db
      .update(speakerMappings)
      .set({
        displayName,
        ...(color ? { color } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(speakerMappings.sessionId, id),
          eq(speakerMappings.speakerLabel, speakerLabel),
        ),
      );
  } else {
    await db.insert(speakerMappings).values({
      sessionId: id,
      speakerLabel,
      displayName,
      color: color ?? '#6366f1',
    });
  }

  return NextResponse.json({ ok: true });
}
