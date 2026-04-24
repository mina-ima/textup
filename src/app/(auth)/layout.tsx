export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950">
      {children}
    </div>
  );
}
