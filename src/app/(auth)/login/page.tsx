import { signIn } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white">
            <Mic className="h-6 w-6" />
          </div>
        </div>
        <CardTitle className="text-2xl">textup</CardTitle>
        <CardDescription>
          会議・講義を録音して、文字起こし・要約を自動生成します
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={async () => {
            'use server';
            await signIn('google', {
              redirectTo: callbackUrl ?? '/dashboard',
            });
          }}
        >
          <Button type="submit" className="w-full" size="lg">
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.5 2.3 2 6.8 2 12.3S6.5 22.3 12 22.3c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2h-11z"
              />
            </svg>
            Googleでログイン
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
