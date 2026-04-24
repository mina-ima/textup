import Link from 'next/link';
import { Mic } from 'lucide-react';
import { auth } from '@/lib/auth';
import { UserMenu } from './UserMenu';

export async function AppHeader() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/80 backdrop-blur-md dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500 text-white">
            <Mic className="h-4 w-4" />
          </div>
          <span className="font-semibold">textup</span>
        </Link>
        {user && (
          <UserMenu name={user.name} email={user.email} image={user.image} />
        )}
      </div>
    </header>
  );
}
