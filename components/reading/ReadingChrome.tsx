import { ReadingNav } from "@/components/reading/ReadingNav";

export function ReadingChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="full-bleed min-h-dvh bg-bg">
      <div className="mx-auto max-w-6xl px-5 pt-[calc(var(--safe-top)+1rem)]">
        <ReadingNav />
      </div>

      <div className="mx-auto w-full max-w-[40rem] px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
        {children}
      </div>
    </main>
  );
}
