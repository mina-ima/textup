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
import { RetryTranscribeButton } from '@/components/session/RetryTranscribeButton';
import { DeleteSessionButton } from '@/components/session/DeleteSessionButton';
import { getCategorySummary, type ErrorCategory } from '@/lib/error-messages';

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

  // 詰まり検出: processing のまま 3 分以上 updatedAt が古い場合は詰まり扱い
  const stuckThresholdMs = 3 * 60 * 1000;
  const isStuck =
    item.status === 'processing' &&
    Date.now() - new Date(item.updatedAt).getTime() > stuckThresholdMs;
  // 処理中でなく音声がある限り、いつでも再実行できる（結果が空/不満な場合にも対応）
  const canRetryTranscribe = !!item.audioBlobUrl && !isBusy;
  const isEmptyReady =
    item.status === 'ready' && segments.length === 0;

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
          <CardTitle className="min-w-0 truncate">{item.title}</CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={status.variant}>{status.label}</Badge>
            <DeleteSessionButton
              sessionId={id}
              title={item.title}
              redirectTo="/dashboard"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {item.audioBlobUrl && (
            <audio controls src={item.audioBlobUrl} className="w-full" />
          )}
          {isBusy && !isStuck && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {status.label}...（約5秒ごとに自動更新）
            </div>
          )}
          {isStuck && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                処理が止まっているようです
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                通信断などで文字起こしが開始できなかった可能性があります。再実行してください。
              </p>
            </div>
          )}
          {item.status === 'failed' && (
            <div className="space-y-1 text-sm">
              <p className="text-destructive">
                {item.lastErrorCategory
                  ? getCategorySummary(item.lastErrorCategory as ErrorCategory)
                  : '文字起こしに失敗しました。再実行するか、時間をおいて再度お試しください。'}
              </p>
              {item.retryCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  再試行回数: {item.retryCount} 回
                  {item.lastErrorAt &&
                    `（最終: ${new Intl.DateTimeFormat('ja-JP', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(item.lastErrorAt))}）`}
                </p>
              )}
            </div>
          )}
          {isEmptyReady && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                文字起こし結果が空でした
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                無音や短すぎる音声の可能性があります。必要なら再実行できます。
              </p>
            </div>
          )}
          {canRetryTranscribe && (
            <div>
              <RetryTranscribeButton
                sessionId={id}
                hasExisting={segments.length > 0}
              />
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

    </div>
  );
}
