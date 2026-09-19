import { DISCOVERY_CAPABILITIES, type DiscoveryBatch, type DiscoveryProvider, type RawDiscoveryItem } from "../types";

export const FIXTURE_NOW = "2026-09-19T09:00:00.000Z";

const DS_BODY = `Must have right to work in Australia. Australian citizens and permanent residents welcome.

We need a mid/senior data scientist to own weekly demand forecasts for 200 stores. You will ship a Python pipeline on scheduled cloud jobs, monitor error and drift, and sit with commercial stakeholders who decide promotions from your numbers.

Must-haves: Python, SQL, forecasting, cloud jobs, monitoring, clear decision writing.
Nice: LightGBM, dbt, Airflow.
This is an IC role, not a graduate programme. Hybrid Melbourne or Australia-remote.`;

function item(partial: Omit<RawDiscoveryItem, "live" | "raw"> & { raw?: Record<string, unknown> }): RawDiscoveryItem {
  return {
    ...partial,
    live: false,
    raw: { fixture: true, ...(partial.raw ?? {}) },
  };
}

export const FIXTURE_ITEMS: RawDiscoveryItem[] = [
  item({
    providerId: "exa",
    url: "https://careers.horizonretail.example/jobs/ds-forecast?utm_source=exa",
    title: "Data Scientist — Demand Forecasting",
    company: "Horizon Retail AU",
    location: "Melbourne, VIC (hybrid)",
    snippet: DS_BODY.slice(0, 180),
    publishedAt: "2026-09-17T00:00:00.000Z",
    author: "Horizon Retail AU",
    externalId: "horizon-ds-forecast",
    raw: { description: DS_BODY },
  }),
  item({
    providerId: "feeds",
    url: "https://www.seek.com.au/job/8881111",
    title: "Data Scientist — Demand Forecasting",
    company: "Horizon Retail AU",
    location: "Melbourne, VIC (hybrid)",
    snippet: DS_BODY.slice(0, 180),
    publishedAt: "2026-09-17T00:00:00.000Z",
    author: "Horizon Retail AU",
    externalId: "seek:8881111",
    raw: { description: DS_BODY },
  }),
  item({
    providerId: "exa",
    url: "https://jobs.harborlabs.example/data-scientist-sydney",
    title: "Data Scientist — Experimentation",
    company: "Harbor Labs",
    location: "Sydney, NSW (hybrid)",
    snippet: "Python SQL experimentation platform. Right to work in Australia.",
    publishedAt: "2026-09-16T00:00:00.000Z",
    author: "Harbor Labs",
    externalId: "harbor-ds",
    raw: {
      description: `Must have right to work in Australia.

A mid/senior data scientist for an experimentation platform: Python, SQL, hypothesis testing, and stakeholder-facing analysis. Hybrid Sydney. Independent IC role.`,
    },
  }),
  item({
    providerId: "exa",
    url: "https://careers.ledgergrain.example/ai-engineer",
    title: "AI Engineer — Governed Agents",
    company: "Ledger & Grain",
    location: "Melbourne / Australia remote",
    snippet: "LLM agents, evaluation, guardrails. Right to work in Australia.",
    publishedAt: "2026-09-18T00:00:00.000Z",
    author: "Ledger & Grain",
    externalId: "ledger-ai",
    raw: {
      description: `Must have right to work in Australia. Melbourne hybrid or Australia remote.

Build governed AI agents with evaluation, permissions, and audit trails. Python, retrieval, and policy gates. IC role, not people management.`,
    },
  }),
  item({
    providerId: "exa",
    url: "https://jobs.oldco.example/stale-ds",
    title: "Data Scientist — Legacy Platform",
    company: "Old Co",
    location: "Melbourne, VIC",
    snippet: "Python SQL. Posted last month.",
    publishedAt: "2026-08-01T00:00:00.000Z",
    author: "Old Co",
    externalId: "old-ds",
    raw: { description: "Python SQL forecasting. Right to work in Australia." },
  }),
  item({
    providerId: "exa",
    url: "https://jobs.shipfast.example/warehouse-operator",
    title: "Warehouse Operator",
    company: "ShipFast Logistics",
    location: "Melbourne, VIC",
    snippet: "Pick pack and dispatch. Forklift licence preferred.",
    publishedAt: "2026-09-18T00:00:00.000Z",
    author: "ShipFast Logistics",
    externalId: "shipfast-wh",
    raw: { description: "Warehouse operator for a Melbourne DC. Pick, pack, dispatch. Forklift licence preferred. Full time onsite." },
  }),
  item({
    providerId: "exa",
    url: "https://boards.greenhouse.io/thinboard/jobs/441122",
    title: "Data Scientist",
    company: "Thinboard",
    location: "Melbourne, VIC",
    snippet: "Python and SQL. Right to work in Australia.",
    publishedAt: "2026-09-18T00:00:00.000Z",
    author: "Thinboard",
    externalId: "greenhouse:441122",
  }),
  item({
    providerId: "exa",
    url: "https://careers.mysterypay.example/data-scientist",
    title: "Data Scientist",
    company: "Mystery Pay",
    location: "Melbourne hybrid",
    snippet: null,
    publishedAt: "2026-09-17T00:00:00.000Z",
    author: "Mystery Pay",
    externalId: "mystery-ds",
    raw: {
      description: `Right to work in Australia.

Data scientist for forecasting and decision support. Python, SQL, stakeholder writing. Pay not stated. Hybrid Melbourne.`,
    },
  }),
  item({
    providerId: "exa",
    url: "https://jobs.remotenorth.example/data-scientist",
    title: "Data Scientist",
    company: "Remote North",
    location: "Sydney, NSW (hybrid)",
    snippet: "Australia-based hybrid. Python SQL.",
    publishedAt: "2026-09-16T00:00:00.000Z",
    author: "Remote North",
    externalId: "remote-north-ds",
    raw: {
      description: `Right to work in Australia. Hybrid in Sydney.

Data scientist to own Python/SQL forecasting for an Australian team. Soft location preference against Melbourne — not a relocation requirement.`,
    },
  }),
  item({
    providerId: "exa",
    url: "https://jobs.research.example/research-scientist",
    title: "Research Scientist",
    company: "Pure Lab",
    location: "Melbourne, VIC",
    snippet: "PhD-track research publications.",
    publishedAt: "2026-09-18T00:00:00.000Z",
    author: "Pure Lab",
    externalId: "research-sci",
    raw: { description: "Research scientist, publications, PhD track. Not an applied engineering role." },
  }),
];

function withDescription(item: RawDiscoveryItem): RawDiscoveryItem {
  const description = typeof item.raw.description === "string" ? item.raw.description : null;
  if (!description) return item;
  return {
    ...item,
    snippet: item.snippet ?? description.slice(0, 220),
    raw: { ...item.raw, description },
  };
}

export function createFixtureProvider(items: RawDiscoveryItem[] = FIXTURE_ITEMS): DiscoveryProvider {
  return {
    id: "fixture",
    async discover(): Promise<DiscoveryBatch> {
      void DISCOVERY_CAPABILITIES.automaticApplication;
      return {
        providerId: "fixture",
        live: false,
        items: items.map(withDescription),
        nextCursor: null,
      };
    },
  };
}

export function createFailingProvider(id = "broken"): DiscoveryProvider {
  return {
    id,
    async discover() {
      throw new Error("PROVIDER_UNAVAILABLE");
    },
  };
}
