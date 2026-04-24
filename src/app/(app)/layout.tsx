import { AppHeader } from '@/components/layout/AppHeader';
import { Toaster } from '@/components/ui/sonner';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
