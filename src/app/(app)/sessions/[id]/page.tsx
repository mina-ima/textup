import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions, transcripts, speakerMappings } from '@/lib/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { StatusPoller } from '@/components/session/StatusPoller';
import { TranscriptList } from '@/components/session/TranscriptList';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  uploading: { label: 'アップロード中', variant: 'secondary' },
  processing: { label: '文字起こし中', variant: 'secondary' },
  ready: { label: '完了', variant: 'default' },
  failed: { label: '失敗', variant: 'destructive' },
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id!;

  const [item] = await db
    .select()
    .from(recordingSessions)
    .where(
      and(eq(recordingSessions.id, id), eq(recordingSessions.userId, userId)),
    );

  if (!item) {
    notFound();
  }

  const [segments, speakers] = await Promise.all([
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

  const isBusy = item.status === 'uploading' || item.status === 'processing';
  const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.uploading;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <StatusPoller status={item.status} />

      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          ダッシュボード
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{item.title}</CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {item.audioBlobUrl && (
            <audio controls src={item.audioBlobUrl} className="w-full" />
          )}
          {isBusy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status.label}...（約5秒ごとに自動更新）
            </div>
          )}
          {item.status === 'failed' && (
            <div className="text-sm text-destructive">
              文字起こしに失敗しました。時間をおいて再度お試しください。
            </div>
          )}
        </CardContent>
      </Card>

      {segments.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">文字起こし</CardTitle>
            <Link
              href={`/sessions/${id}/summary`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <FileText className="mr-1 h-4 w-4" />
              要約を見る
            </Link>
          </CardHeader>
          <CardContent>
            <TranscriptList
              sessionId={id}
              segments={segments.map((s) => ({
                id: s.id,
                speakerLabel: s.speakerLabel,
                startMs: s.startMs,
                endMs: s.endMs,
                text: s.text,
              }))}
              speakers={speakers.map((s) => ({
                speakerLabel: s.speakerLabel,
                displayName: s.displayName,
                color: s.color,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {!isBusy && segments.length === 0 && item.status === 'ready' && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            文字起こし結果が空でした
          </CardContent>
        </Card>
      )}
    </div>
  );
}
