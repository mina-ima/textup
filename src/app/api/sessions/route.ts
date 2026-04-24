import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions } from '@/lib/db/schema';

const CreateBody = z.object({
  title: z.string().min(1).max(120).optional(),
  recordingMode: z.enum(['close', 'meeting', 'lecture', 'web']).optional(),
  gainValue: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = CreateBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const [created] = await db
    .insert(recordingSessions)
    .values({
      userId: session.user.id,
      title: body.data.title ?? '無題の録音',
      recordingMode: body.data.recordingMode ?? 'meeting',
      gainValue: body.data.gainValue ?? 1,
      status: 'uploading',
    })
    .returning();

  return NextResponse.json({ session: created }, { status: 201 });
}
