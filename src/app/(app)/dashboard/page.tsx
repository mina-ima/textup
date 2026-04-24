import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { Mic, FileAudio } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordingSessions } from '@/lib/db/schema';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  uploading: { label: 'アップロード中', variant: 'secondary' },
  processing: { label: '文字起こし中', variant: 'secondary' },
  ready: { label: '完了', variant: 'default' },
  failed: { label: '失敗', variant: 'destructive' },
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const items = await db
    .select()
    .from(recordingSessions)
    .where(eq(recordingSessions.userId, userId))
    .orderBy(desc(recordingSessions.startedAt))
    .limit(50);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">録音</h1>
        <Link href="/record" className={buttonVariants({ size: 'lg' })}>
          <Mic className="mr-2 h-4 w-4" />
          新しい録音
        </Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-500 dark:bg-indigo-950">
              <FileAudio className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold">録音はまだありません</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              「新しい録音」ボタンから会議・講義を録音しましょう。録音後に Gemini が自動で文字起こし・話者分離・要約を生成します。
            </p>
            <Link
              href="/record"
              className={`${buttonVariants({})} mt-6`}
            >
              <Mic className="mr-2 h-4 w-4" />
              録音を開始
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const status = STATUS_LABEL[item.status] ?? STATUS_LABEL.uploading;
            return (
              <Link key={item.id} href={`/sessions/${item.id}`}>
                <Card className="transition-colors hover:border-indigo-300">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{formatDate(item.startedAt)}</span>
                    <span>{formatDuration(item.durationSec)}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
