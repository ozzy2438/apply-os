import Link from "next/link";
import type { ComposedEvaluation, Opportunity } from "@/lib/jev/types";

export function pct(n: number): string {
  return `${Math.round(n * 100)}`;
}

export function FitMeter({ fit, label }: { fit: number; label?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-xs text-mute">
        <span>FIT</span>
        <span className="text-paper">{pct(fit)}</span>
      </div>
      <div className="h-1.5 w-full bg-line">
        <div className="h-1.5 bg-brass" style={{ width: `${Math.min(100, Math.max(0, fit * 100))}%` }} />
      </div>
      {label ? <p className="mt-1 text-xs text-mute">{label}</p> : null}
    </div>
  );
}

export function DistBars({
  probabilities,
}: {
  probabilities: Record<string, number>;
}) {
  const entries = Object.entries(probabilities);
  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 font-mono text-[10px]">
          <span className="truncate text-mute">{key.replaceAll("_", " ")}</span>
          <div className="h-1 bg-line">
            <div className="h-1 bg-sky" style={{ width: `${value * 100}%` }} />
          </div>
          <span className="text-right text-paper">{pct(value)}</span>
        </div>
      ))}
    </div>
  );
}

export function GateChips({ composed }: { composed: ComposedEvaluation }) {
  return (
    <div className="flex flex-wrap gap-1">
      {composed.gates.map((gate) => {
        const color =
          gate.outcome === "fail"
            ? "border-clay text-clay"
            : gate.outcome === "review"
              ? "border-brass text-brass"
              : "border-moss text-moss";
        return (
          <span key={gate.id} className={`border px-2 py-0.5 font-mono text-[10px] uppercase ${color}`}>
            {gate.id.replaceAll("_", " ")} {gate.outcome} {pct(gate.noul)}
          </span>
        );
      })}
    </div>
  );
}

export function OpportunityCard({
  opportunity,
  composed,
  href,
}: {
  opportunity: Opportunity;
  composed: ComposedEvaluation;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-line bg-panel p-4 transition hover:border-brass"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-mute">
            {opportunity.company} · {opportunity.sourceType.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 text-lg text-paper">{opportunity.title}</h3>
          <p className="text-sm text-mute">
            {opportunity.location}
            {opportunity.compensation ? ` · ${opportunity.compensation}` : ""}
          </p>
        </div>
        <div className="w-28 shrink-0">
          <FitMeter fit={composed.fit} />
          <p className="mt-2 font-mono text-[10px] uppercase text-brass">{composed.action.replaceAll("_", " ")}</p>
          <p className="font-mono text-[10px] text-mute">conf {pct(composed.actionConfidence)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-mute">{composed.label}</p>
      <div className="mt-3">
        <GateChips composed={composed} />
      </div>
    </Link>
  );
}

import type { DeskDiscoveryFacts } from "@/lib/discovery/desk";

export function DiscoveryFactsStrip(facts: DeskDiscoveryFacts) {
  return (
    <div className="border border-line bg-panel-2 p-3 font-mono text-[11px] text-mute">
      <p className="uppercase text-brass">
        {facts.mock ? "MOCK discovery" : facts.live ? "Live discovery" : "Discovery"} ·{" "}
        {facts.providers.join(" · ") || "provider"} ·{" "}
        {facts.ageDays == null ? "freshness unknown" : `${Math.max(0, Math.round(facts.ageDays))}d old`}
      </p>
      <p className="mt-1 text-paper">
        Role Fit {facts.roleFit == null ? "n/a" : pct(facts.roleFit)} · evidence{" "}
        {facts.evidenceCoverage == null ? "n/a" : pct(facts.evidenceCoverage)} · {facts.decision ?? "unevaluated"}
      </p>
      <p className="mt-1">Not a hiring probability.</p>
      {facts.gaps.length ? <p className="mt-1">Gaps: {facts.gaps.join(" ")}</p> : null}
      <ul className="mt-2 list-disc pl-4">
        {facts.why.slice(0, 5).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {facts.sourceUrls[0] ? (
        <p className="mt-2 truncate">
          Source {facts.sourceUrls[0]}
          {facts.sourceUrls.length > 1 ? ` · +${facts.sourceUrls.length - 1} provenance URLs` : ""}
        </p>
      ) : null}
    </div>
  );
}
