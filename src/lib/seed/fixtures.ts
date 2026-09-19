import type { Constraints, CvBullet, PostingInput, Weights } from "@/lib/jev/types";
import { DEFAULT_WEIGHTS } from "@/lib/jev/questions";

export const SAMPLE_CONSTRAINTS: Constraints = {
  workRights: "Australian citizen; unrestricted right to work in Australia",
  locations: ["Melbourne", "Australia remote", "Hybrid Melbourne"],
  workMode: "Hybrid Melbourne or Australia-remote. Not onsite-only overseas.",
  compensationFloorAud: 120000,
  seniorityBand: "Mid to senior IC (Data Scientist / Applied ML / AI Engineer). Not graduate. Not people-manager-only.",
};

export const SAMPLE_GOALS = `I want roles where I own a bounded production decision: forecasting, ranking, or governed AI agents. Prefer Melbourne hybrid/remote AU teams that value evidence quality over keyword stuffing. I will not claim enterprise production ownership I do not have. I want work that compounds my independent decisioning systems into operated products with monitoring, human approval, and measurable outcomes.`;

export const SAMPLE_WEIGHTS: Weights = { ...DEFAULT_WEIGHTS };

export const SAMPLE_BULLETS: CvBullet[] = [
  {
    id: "cv-forecast",
    kind: "independent",
    sortOrder: 1,
    text: "Built a retail-fuel demand forecasting pipeline in Python with scheduled cloud jobs, walk-forward validation, and a dashboard of forecast error, drift, and freshness. Independent product; production-style operation, not a named enterprise owner.",
  },
  {
    id: "cv-decision",
    kind: "independent",
    sortOrder: 2,
    text: "Designed a governed Purchase-to-Pay decision system: LightGBM risk scores, deterministic policy, human-in-the-loop approval, durable workflow, independent read-back, and an append-only decision ledger. LLM explains outcomes only; it has no action authority.",
  },
  {
    id: "cv-agent",
    kind: "independent",
    sortOrder: 3,
    text: "Built a counterfactual order-recovery agent that simulates interventions, applies policy limits, executes allow-listed tools, and attributes expected versus realised value. Independent product with synthetic retailer data.",
  },
  {
    id: "cv-stack",
    kind: "learning",
    sortOrder: 4,
    text: "Daily tools: Python, SQL, FastAPI, Airflow, LightGBM, Postgres, dbt, MLflow, AWS, GCP, Azure. Comfortable writing tests, CI, and model cards. Australian citizen based in Melbourne.",
  },
  {
    id: "cv-comms",
    kind: "delivery",
    sortOrder: 5,
    text: "Translates model outputs into decision memos for non-technical stakeholders: what changed, what is uncertain, what action is permitted, and what evidence would falsify the call.",
  },
];

export const SAMPLE_POSTINGS: Array<PostingInput & { id: string }> = [
  {
    id: "job-horizon",
    sourceType: "job_posting",
    title: "Data Scientist — Demand Forecasting",
    company: "Horizon Retail AU",
    location: "Melbourne, VIC (hybrid)",
    compensation: "AUD $140,000–$160,000",
    url: null,
    rawText: `Title: Data Scientist — Demand Forecasting
Company: Horizon Retail AU
Location: Melbourne, VIC (hybrid 3 days)
Salary: AUD $140,000–$160,000 plus super
Must have right to work in Australia. Australian citizens and permanent residents welcome.

We need a mid/senior data scientist to own weekly demand forecasts for 200 stores. You will ship a Python pipeline on scheduled cloud jobs, monitor error and drift, and sit with commercial stakeholders who decide promotions from your numbers.

Must-haves: Python, SQL, forecasting, cloud jobs, monitoring, clear decision writing.
Nice: LightGBM, dbt, Airflow.
This is an IC role, not a graduate programme.`,
  },
  {
    id: "job-ledger",
    sourceType: "job_posting",
    title: "Applied ML Engineer — Decisioning Platform",
    company: "Ledger & Grain",
    location: "Melbourne / Australia remote",
    compensation: "AUD $150,000–$175,000",
    url: null,
    rawText: `Title: Applied ML Engineer — Decisioning Platform
Company: Ledger & Grain
Location: Melbourne hybrid or Australia remote
Salary: AUD $150,000–$175,000
Work rights: must be able to work in Australia. No US-only restriction.

Build a governed decision service for operational risk. Models score cases; deterministic policy selects actions; high-impact steps pause for a human. You will care about audit trails, verification, and not letting an LLM take unattended actions.

Must-haves: Python, ML ranking/classification, policy-aware systems, human approval design.
Seniority: senior IC.`,
  },
  {
    id: "job-southbank",
    sourceType: "job_posting",
    title: "AI Engineer — Governed Agents",
    company: "Southbank Systems",
    location: "Melbourne, VIC",
    compensation: "AUD $145,000–$165,000",
    url: null,
    rawText: `Title: AI Engineer — Governed Agents
Company: Southbank Systems
Location: Melbourne, VIC hybrid
Salary: AUD $145,000–$165,000
Australian citizen or PR preferred.

We are productising an order-recovery / exception agent: simulate interventions, apply cost limits, execute allow-listed tools, measure recovered value. GenAI is used for explanations, not as the policy.

Must-haves: Python, LLM tool-use with guardrails, evaluation, logging.
This is a mid-senior IC role.`,
  },
  {
    id: "job-staff-ml",
    sourceType: "job_posting",
    title: "Staff Machine Learning Engineer",
    company: "Pacific Lattice",
    location: "Sydney / Melbourne hybrid",
    compensation: "AUD $200,000–$230,000",
    url: null,
    rawText: `Title: Staff Machine Learning Engineer
Company: Pacific Lattice
Location: Sydney or Melbourne hybrid
Salary: AUD $200,000–$230,000
Right to work in Australia required.

Staff-level IC. You will set technical direction for three ML pods, define platform standards, and still write code. 8+ years preferred. PhD nice-to-have, not required.

Must-haves: staff-level systems design, mentoring, production ML platform ownership at company scale.`,
  },
  {
    id: "job-nyc",
    sourceType: "job_posting",
    title: "Machine Learning Engineer",
    company: "Helio Markets",
    location: "New York, NY (onsite)",
    compensation: "USD $180,000–$210,000",
    url: null,
    rawText: `Title: Machine Learning Engineer
Company: Helio Markets
Location: Onsite in New York, five days a week. United States only.
Must be a US citizen or green card holder. No visa sponsorship.

Build ranking models for a trading console. Onsite collaboration is mandatory.`,
  },
  {
    id: "job-grad",
    sourceType: "job_posting",
    title: "Graduate Data Scientist",
    company: "Riverbank Analytics",
    location: "Melbourne, VIC",
    compensation: "AUD $85,000",
    url: null,
    rawText: `Title: Graduate Data Scientist
Company: Riverbank Analytics
Location: Melbourne, VIC
Salary: AUD $85,000
Graduate / entry level programme. Interns and juniors welcome.

You will rotate through notebooks and dashboarding with close supervision. No production ownership in year one.`,
  },
  {
    id: "job-underpaid",
    sourceType: "job_posting",
    title: "Data Scientist",
    company: "Little Leaf Apps",
    location: "Remote Australia",
    compensation: "AUD $70,000",
    url: null,
    rawText: `Title: Data Scientist
Company: Little Leaf Apps
Location: Remote Australia
Salary: AUD $70,000
Must have right to work in Australia.

Python and SQL to build churn scores for a consumer app. Mid-level title, junior budget.`,
  },
  {
    id: "job-recruiter",
    sourceType: "recruiter_inbound",
    title: "Exciting data opportunity",
    company: "Confidential / recruiter",
    location: "Unspecified",
    compensation: null,
    url: null,
    rawText: `Hi, I came across your profile and thought you could be a fit for an exciting data opportunity with a leading organisation. Competitive salary. Are you open to a chat? Not much I can share until you sign an NDA. Kind regards, Sam`,
  },
  {
    id: "job-warehouse",
    sourceType: "job_posting",
    title: "Data Engineer — Warehouse & Operational Analytics",
    company: "Mallee Health",
    location: "Melbourne, VIC (hybrid)",
    compensation: "AUD $135,000–$150,000",
    url: null,
    rawText: `Title: Data Engineer — Warehouse & Operational Analytics
Company: Mallee Health
Location: Melbourne hybrid
Salary: AUD $135,000–$150,000
Right to work in Australia.

dbt, Postgres, orchestration, SLAs. Limited modelling; this is warehouse and operational analytics engineering, not a data scientist seat.`,
  },
  {
    id: "job-phd",
    sourceType: "job_posting",
    title: "Research Scientist, Algorithms",
    company: "North Grid Labs",
    location: "Canberra / Melbourne",
    compensation: "AUD $160,000",
    url: null,
    rawText: `Title: Research Scientist, Algorithms
Company: North Grid Labs
Location: Canberra or Melbourne
Salary: AUD $160,000
PhD required in statistics, electrical engineering, or equivalent. Must have a PhD.

Publishable work on signal algorithms. Australian citizen required for clearance later.`,
  },
];
