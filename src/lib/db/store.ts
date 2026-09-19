import { randomUUID } from "node:crypto";
import { getDriver } from "./driver";
import { nowIso } from "@/lib/time";
import { composeEvaluation, type EvaluationAnswers } from "@/lib/jev/compose";
import type {
  Briefing,
  BulletKind,
  ComposedEvaluation,
  Constraints,
  CoverLetterCheck,
  Claim,
  CvBullet,
  Opportunity,
  Profile,
  SourceType,
  Status,
  StatusEvent,
  StoredCoverLetter,
  StoredEvaluation,
  Weights,
} from "@/lib/jev/types";
import { DEFAULT_WEIGHTS } from "@/lib/jev/questions";

type ProfileRow = {
  id: string;
  goals: string;
  constraints_json: string;
  weights_json: string;
  updated_at: string;
};

type BulletRow = {
  id: string;
  text: string;
  kind: string;
  sort_order: number;
};

type OppRow = {
  id: string;
  source_type: string;
  title: string;
  company: string;
  location: string;
  compensation: string | null;
  url: string | null;
  raw_text: string;
  status: string;
  created_at: string;
};

type EvalRow = {
  id: string;
  opportunity_id: string;
  model: string;
  demo: number | boolean;
  answers_json: string;
  composed_json: string;
  created_at: string;
};

type LetterRow = {
  id: string;
  opportunity_id: string;
  body: string;
  claims_json: string;
  check_json: string;
  created_at: string;
};

type BriefRow = {
  brief_date: string;
  opportunity_ids_json: string;
  created_at: string;
};

type EventRow = {
  id: string;
  opportunity_id: string;
  status: string;
  note: string | null;
  at: string;
};

function mapOpp(row: OppRow): Opportunity {
  return {
    id: row.id,
    sourceType: row.source_type as SourceType,
    title: row.title,
    company: row.company,
    location: row.location,
    compensation: row.compensation,
    url: row.url,
    rawText: row.raw_text,
    status: row.status as Status,
    createdAt: row.created_at,
  };
}

function mapEval(row: EvalRow): StoredEvaluation {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    model: row.model,
    demo: Boolean(row.demo),
    answers: JSON.parse(row.answers_json),
    composed: JSON.parse(row.composed_json) as ComposedEvaluation,
    createdAt: row.created_at,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const db = getDriver();
  const row = await db.get<ProfileRow>("SELECT * FROM profiles WHERE id = ?", ["default"]);
  if (!row) return null;
  const bullets = await db.all<BulletRow>("SELECT * FROM cv_bullets ORDER BY sort_order ASC");
  return {
    id: row.id,
    goals: row.goals,
    constraints: JSON.parse(row.constraints_json) as Constraints,
    weights: JSON.parse(row.weights_json) as Weights,
    bullets: bullets.map((b) => ({
      id: b.id,
      text: b.text,
      kind: b.kind as BulletKind,
      sortOrder: Number(b.sort_order),
    })),
    updatedAt: row.updated_at,
  };
}

export async function saveProfile(input: {
  goals: string;
  constraints: Constraints;
  weights: Weights;
  bullets: Array<{ id?: string; text: string; kind: BulletKind; sortOrder: number }>;
}): Promise<Profile> {
  const db = getDriver();
  const updatedAt = nowIso();
  await db.execute(
    `INSERT INTO profiles (id, goals, constraints_json, weights_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       goals = excluded.goals,
       constraints_json = excluded.constraints_json,
       weights_json = excluded.weights_json,
       updated_at = excluded.updated_at`,
    ["default", input.goals, JSON.stringify(input.constraints), JSON.stringify(input.weights), updatedAt],
  );
  await db.execute("DELETE FROM cv_bullets", []);
  const bullets: CvBullet[] = [];
  for (const b of input.bullets) {
    const id = b.id || randomUUID();
    await db.execute("INSERT INTO cv_bullets (id, text, kind, sort_order) VALUES (?, ?, ?, ?)", [
      id,
      b.text,
      b.kind,
      b.sortOrder,
    ]);
    bullets.push({ id, text: b.text, kind: b.kind, sortOrder: b.sortOrder });
  }
  return {
    id: "default",
    goals: input.goals,
    constraints: input.constraints,
    weights: input.weights,
    bullets,
    updatedAt,
  };
}

export async function listOpportunities(): Promise<Opportunity[]> {
  const db = getDriver();
  const rows = await db.all<OppRow>("SELECT * FROM opportunities ORDER BY created_at DESC");
  return rows.map(mapOpp);
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const db = getDriver();
  const row = await db.get<OppRow>("SELECT * FROM opportunities WHERE id = ?", [id]);
  return row ? mapOpp(row) : null;
}

export async function insertOpportunity(input: Omit<Opportunity, "id" | "createdAt"> & { id?: string }): Promise<Opportunity> {
  const db = getDriver();
  const opportunity: Opportunity = {
    ...input,
    id: input.id || randomUUID(),
    createdAt: nowIso(),
  };
  await db.execute(
    `INSERT INTO opportunities
      (id, source_type, title, company, location, compensation, url, raw_text, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opportunity.id,
      opportunity.sourceType,
      opportunity.title,
      opportunity.company,
      opportunity.location,
      opportunity.compensation,
      opportunity.url,
      opportunity.rawText,
      opportunity.status,
      opportunity.createdAt,
    ],
  );
  await addStatusEvent(opportunity.id, opportunity.status, "ingested");
  return opportunity;
}

export async function updateOpportunityStatus(id: string, status: Status, note?: string): Promise<void> {
  const db = getDriver();
  await db.execute("UPDATE opportunities SET status = ? WHERE id = ?", [status, id]);
  await addStatusEvent(id, status, note);
}

export async function addStatusEvent(opportunityId: string, status: Status, note?: string): Promise<StatusEvent> {
  const db = getDriver();
  const event: StatusEvent = {
    id: randomUUID(),
    opportunityId,
    status,
    note: note ?? null,
    at: nowIso(),
  };
  await db.execute(
    "INSERT INTO status_events (id, opportunity_id, status, note, at) VALUES (?, ?, ?, ?, ?)",
    [event.id, event.opportunityId, event.status, event.note, event.at],
  );
  return event;
}

export async function listStatusEvents(opportunityId: string): Promise<StatusEvent[]> {
  const db = getDriver();
  const rows = await db.all<EventRow>(
    "SELECT * FROM status_events WHERE opportunity_id = ? ORDER BY at DESC",
    [opportunityId],
  );
  return rows.map((r) => ({
    id: r.id,
    opportunityId: r.opportunity_id,
    status: r.status as Status,
    note: r.note,
    at: r.at,
  }));
}

export async function insertEvaluation(input: {
  opportunityId: string;
  model: string;
  demo: boolean;
  answers: unknown;
  composed: ComposedEvaluation;
}): Promise<StoredEvaluation> {
  const db = getDriver();
  const row: StoredEvaluation = {
    id: randomUUID(),
    opportunityId: input.opportunityId,
    model: input.model,
    demo: input.demo,
    answers: input.answers,
    composed: input.composed,
    createdAt: nowIso(),
  };
  await db.execute(
    `INSERT INTO evaluations (id, opportunity_id, model, demo, answers_json, composed_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.opportunityId,
      row.model,
      row.demo ? 1 : 0,
      JSON.stringify(row.answers),
      JSON.stringify(row.composed),
      row.createdAt,
    ],
  );
  return row;
}

export async function latestEvaluation(opportunityId: string): Promise<StoredEvaluation | null> {
  const db = getDriver();
  const row = await db.get<EvalRow>(
    "SELECT * FROM evaluations WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 1",
    [opportunityId],
  );
  return row ? mapEval(row) : null;
}

export async function listLatestEvaluations(): Promise<StoredEvaluation[]> {
  const opps = await listOpportunities();
  const out: StoredEvaluation[] = [];
  for (const opp of opps) {
    const evaluation = await latestEvaluation(opp.id);
    if (evaluation) out.push(evaluation);
  }
  return out;
}

export async function recomposeAll(): Promise<void> {
  const profile = await getProfile();
  const weights = profile?.weights ?? DEFAULT_WEIGHTS;
  const db = getDriver();
  const rows = await db.all<EvalRow>("SELECT * FROM evaluations");
  for (const row of rows) {
    const answers = JSON.parse(row.answers_json) as EvaluationAnswers;
    const composed = composeEvaluation(answers, weights);
    await db.execute("UPDATE evaluations SET composed_json = ? WHERE id = ?", [
      JSON.stringify(composed),
      row.id,
    ]);
  }
}

export async function insertCoverLetter(input: {
  opportunityId: string;
  body: string;
  claims: Claim[];
  check: CoverLetterCheck;
}): Promise<StoredCoverLetter> {
  const db = getDriver();
  const letter: StoredCoverLetter = {
    id: randomUUID(),
    opportunityId: input.opportunityId,
    body: input.body,
    claims: input.claims,
    check: input.check,
    createdAt: nowIso(),
  };
  await db.execute(
    `INSERT INTO cover_letters (id, opportunity_id, body, claims_json, check_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      letter.id,
      letter.opportunityId,
      letter.body,
      JSON.stringify(letter.claims),
      JSON.stringify(letter.check),
      letter.createdAt,
    ],
  );
  return letter;
}

export async function latestCoverLetter(opportunityId: string): Promise<StoredCoverLetter | null> {
  const db = getDriver();
  const row = await db.get<LetterRow>(
    "SELECT * FROM cover_letters WHERE opportunity_id = ? ORDER BY created_at DESC LIMIT 1",
    [opportunityId],
  );
  if (!row) return null;
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    body: row.body,
    claims: JSON.parse(row.claims_json) as Claim[],
    check: JSON.parse(row.check_json) as CoverLetterCheck,
    createdAt: row.created_at,
  };
}

export async function getBriefing(date: string): Promise<Briefing | null> {
  const db = getDriver();
  const row = await db.get<BriefRow>("SELECT * FROM briefings WHERE brief_date = ?", [date]);
  if (!row) return null;
  return {
    date: row.brief_date,
    opportunityIds: JSON.parse(row.opportunity_ids_json) as string[],
    createdAt: row.created_at,
  };
}

export async function saveBriefing(date: string, opportunityIds: string[]): Promise<Briefing> {
  const db = getDriver();
  const createdAt = nowIso();
  await db.execute(
    `INSERT INTO briefings (brief_date, opportunity_ids_json, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(brief_date) DO UPDATE SET
       opportunity_ids_json = excluded.opportunity_ids_json,
       created_at = excluded.created_at`,
    [date, JSON.stringify(opportunityIds), createdAt],
  );
  return { date, opportunityIds, createdAt };
}

export async function countOpportunities(): Promise<number> {
  const db = getDriver();
  const row = await db.get<{ n: number | string }>("SELECT COUNT(*) as n FROM opportunities");
  return Number(row?.n ?? 0);
}
