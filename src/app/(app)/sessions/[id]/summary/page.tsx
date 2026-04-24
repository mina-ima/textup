import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions, summaries } from '@/lib/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerateSummaryButton } from '@/components/session/GenerateSummaryButton';
import { MarkdownView } from '@/components/session/MarkdownView';

export const dynamic = 'force-dynamic';

export default async function SummaryPage({
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

  if (!item) notFound();

  const [summary] = await db
    .select()
    .from(summaries)
    .where(eq(summaries.sessionId, id));

  const canGenerate = item.status === 'ready';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <div>
        <Link
          href={`/sessions/${id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          文字起こしに戻る
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{item.title} / 要約</CardTitle>
          {canGenerate && (
            <GenerateSummaryButton
              sessionId={id}
              label={summary ? '再生成' : '要約を生成'}
            />
          )}
        </CardHeader>
        <CardContent>
          {!canGenerate && (
            <p className="text-sm text-muted-foreground">
              文字起こしが完了していません。ステータスが「完了」になったら要約を生成できます。
            </p>
          )}
          {canGenerate && !summary && (
            <p className="text-sm text-muted-foreground">
              「要約を生成」ボタンを押すと Gemini が Markdown 形式の要約を生成します。
            </p>
          )}
          {summary && <MarkdownView markdown={summary.markdown} />}
        </CardContent>
      </Card>

      {summary && (
        <p className="text-xs text-muted-foreground text-center">
          生成モデル: {summary.model} / {new Date(summary.generatedAt).toLocaleString('ja-JP')}
        </p>
      )}
    </div>
  );
}
