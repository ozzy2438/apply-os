import Link from "next/link";
import { browserModeLabel } from "@/lib/browser/flags";

const NAV = [
  { href: "/", label: "Morning desk" },
  { href: "/inbox", label: "Inbox" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/discover", label: "Discovery" },
  { href: "/ingest", label: "Ingest" },
  { href: "/evidence", label: "Evidence" },
  { href: "/profile", label: "Profile" },
  { href: "/audit", label: "Audit" },
];

export function AppShell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  const browser = browserModeLabel();
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-mono text-xs tracking-[0.2em] text-brass">APPLY OS · JEV</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-paper">Career decision engine</h1>
          <p className="mt-1 max-w-xl text-sm text-mute">
            Decide which jobs deserve time. Drafts are evidence-grounded. Nothing is submitted for you.
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
        <p className="mb-4 border border-brass-dim bg-panel-2 px-3 py-2 font-mono text-xs text-brass">
          Demo mode — typed mock Jev, template drafts. Job Discovery uses a simulated board, never a real
          browser.
        </p>
      ) : null}
      <p className="mb-6 font-mono text-[10px] uppercase tracking-wider text-mute">
        Browser assist: {browser.replaceAll("-", " ")} · Assistant, not an autonomous applicant
      </p>
      {children}
    </div>
  );
}
