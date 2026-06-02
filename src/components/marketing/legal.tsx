import type { ReactNode } from "react";

/** Shared layout + prose styling for the Privacy and Terms pages. */
export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-[var(--content-max-width)] px-5 py-16 sm:px-6 sm:py-20">
      <header className="mb-10">
        <span className="t-label">Legal</span>
        <h1 className="mt-3 text-[32px] font-semibold tracking-[-0.02em] text-fg-1 sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-fg-3">Last updated {updated}</p>
        <p className="mt-5 text-[15px] leading-[26px] text-fg-2">{intro}</p>
      </header>
      <div className="space-y-8">{children}</div>
    </article>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-fg-1">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-[14px] leading-[24px] text-fg-2">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-fg-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
