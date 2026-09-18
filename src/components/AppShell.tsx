import Link from "next/link";

const NAV = [
  { href: "/", label: "Morning desk" },
  { href: "/inbox", label: "Inbox" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/ingest", label: "Ingest" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-brass">APPLY OS · JEV</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-paper">Career decision engine</h1>
          <p className="mt-1 max-w-xl text-sm text-mute">
            Not keyword search. Typed judgments, calibrated confidence, citation-gated letters.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 font-mono text-xs">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-line bg-panel px-3 py-1.5 text-paper hover:border-brass hover:text-brass"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {demo ? (
        <p className="mb-6 border border-brass-dim bg-panel-2 px-3 py-2 font-mono text-xs text-brass">
          Demo mode — <code>TYPESAFE_API_KEY</code> is unset. A typed mock client returns fixture-calibrated answers.
          Cover letters use the template fallback unless an OpenAI key is present.
        </p>
      ) : null}
      {children}
    </div>
  );
}
