import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [existing] = await db
    .select()
    .from(recordingSessions)
    .where(
      and(
        eq(recordingSessions.id, id),
        eq(recordingSessions.userId, session.user.id),
      ),
    );

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contentType = request.headers.get('content-type') ?? 'audio/webm';
  const durationHeader = request.headers.get('x-duration-ms');
  const durationMs = durationHeader ? parseInt(durationHeader, 10) : 0;
  const durationSec = Number.isFinite(durationMs) ? Math.round(durationMs / 1000) : 0;

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const ext = contentType.includes('mp4') ? 'mp4' : 'webm';
  const blob = await put(`recordings/${session.user.id}/${id}.${ext}`, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const [updated] = await db
    .update(recordingSessions)
    .set({
      audioBlobUrl: blob.url,
      audioMimeType: contentType,
      durationSec,
      endedAt: new Date(),
      status: 'processing',
      updatedAt: new Date(),
    })
    .where(eq(recordingSessions.id, id))
    .returning();

  return NextResponse.json({ session: updated });
}
