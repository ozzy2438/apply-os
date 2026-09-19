#!/usr/bin/env python3
"""One-shot V1.0 → V1.1 canonical profile / policy / schema repair."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

SRC_PROFILE = Path("/home/ubuntu/.cursor/projects/workspace/uploads/candidate-profile_2ffa.json")
SRC_SCHEMA = Path("/home/ubuntu/.cursor/projects/workspace/uploads/candidate-profile.schema_8725.json")
SRC_POLICY = Path("/home/ubuntu/.cursor/projects/workspace/uploads/decision-policy_1698.json")
OUT = Path("/workspace/data")

ROLE_FAMILY_IDS = {
    "AI Engineer": "ai_engineering",
    "Machine Learning Engineer": "machine_learning_engineering",
    "MLOps Engineer": "mlops_engineering",
    "Data Scientist": "data_science",
    "Data Engineer / Cloud Data": "data_engineering_cloud",
    "Analytics Engineer": "analytics_engineering",
    "Data Quality / Data Governance": "data_quality_governance",
    "Data Analyst / Insights Analyst": "data_analytics_insights",
    "AI Solution Architecture": "ai_solution_architecture",
    "BI / Reporting Developer": "bi_reporting",
}

PAID = {"contract", "freelance"}
INDEPENDENT = {"independent", "portfolio"}


def derive_commercial(engagement_types: list[str]):
    if any(t in PAID for t in engagement_types):
        return True
    if engagement_types and all(t in INDEPENDENT for t in engagement_types):
        return False
    return "unknown"


def date_certainty_for(start, end) -> str:
    has_date = bool(start) or bool(end)
    return "stated_in_source" if has_date else "not_stated"


def migrate_profile(raw: dict) -> dict:
    p = deepcopy(raw)
    p["schema_version"] = "1.1.0"

    projects = {proj["project_id"]: proj for proj in p["projects"]}

    for proj in p["projects"]:
        proj["date_certainty"] = date_certainty_for(proj.get("start_date"), proj.get("end_date"))
        fams = proj.get("role_families_supported") or []
        proj["role_family_ids"] = [ROLE_FAMILY_IDS[f] for f in fams if f in ROLE_FAMILY_IDS]

    for skill in p["skills"]:
        types = [projects[pid]["engagement_type"] for pid in skill.get("project_ids", []) if pid in projects]
        skill["commercial_evidence"] = derive_commercial(types)

    for ev in p["evidence"]:
        pid = ev.pop("project_id")
        ev["subject"] = {"type": "project", "id": pid}

    for rt in p["role_targets"]:
        rt["role_family_id"] = ROLE_FAMILY_IDS[rt["role_family"]]

    p["career_objectives"]["deliberate_differentiators"] = [
        "Has repeatedly reported negative findings and declined to automate on measured evidence (P40 InkBridge, P55 VoltDesk, P60 Cloud FinOps, P62 student services, P54 abstention study).",
        "Has disproved stakeholder assumptions on real data rather than confirming them (P29 last-mile, P51 CorridorIQ).",
        "AI agent governance in depth: allow-listed tools, RBAC, row-level security, append-only audit, database-level enforcement (P38, P45, P48, P49, P64).",
        "Consistent automated testing across deliverables, including ML regression tests, golden evaluations and concurrency tests (P40, P41, P45, P48, P52, P53, P35, P36).",
        "Australian regulated and public-sector datasets: AR-DRG and IHACPA, AIHW, APRA, QILT, ABS SEIFA, AusTender, AEMO, GTFS-R, ASIC RG 271.",
    ]

    p["constraints"]["hard_blockers"] = [
        b
        for b in p["constraints"]["hard_blockers"]
        if "years in a titled role" not in b["blocker"].lower()
    ]
    p["constraints"]["compensation"]["note"] = (
        "No compensation floor has been stated. Observed applications sit roughly between "
        "A$90,000 and A$160,000 plus superannuation. That range is observational, not a floor."
    )

    for cert in p["certifications"]:
        cert.pop("status", None)
        cert["achievement_status"] = "completed"
        name = cert.get("name", "").lower()
        if "pipelines with azure" in name or "course" in name:
            cert["current_validity"] = "not_applicable"
        else:
            cert["current_validity"] = "unverified"

    cp = p["claim_policy"]
    unsupported = cp.pop("unsupported_claims")
    forbidden = []
    gaps = []
    for item in unsupported:
        claim = item["claim"]
        if any(
            key in claim
            for key in (
                "Project 02",
                "named client",
                "independent build was delivered",
                "Team delivery on any independent",
                "Line management",
                "Employment with any organisation between December 2020",
            )
        ):
            forbidden.append(item)
        elif any(key in claim for key in ("Jira", "Kubernetes", "postgraduate")):
            gaps.append(item)
        else:
            gaps.append(item)
    forbidden.append(
        {
            "claim": "Converting simulated, modelled, backtested or controlled-validation outcomes into realised revenue or live client impact",
            "reason": "Measurement context must travel with every number. Simulated or modelled results are not realised commercial outcomes.",
        }
    )
    cp["forbidden_claims"] = forbidden
    cp["not_currently_evidenced"] = gaps

    prefs = p["preferences"]
    prefs["application_strategy"] = [
        item
        for item in prefs.get("application_strategy", [])
        if "80 percent" not in item.lower() and "80%" not in item
    ]

    recon = p["provenance"].setdefault("reconciliation", [])
    if isinstance(recon, list):
        recon.append(
            {
                "item": "schema 1.1.0 migration",
                "note": "Evidence now uses subject references; commercial_evidence recalculated from engagement types; claim_policy split into forbidden_claims vs not_currently_evidenced; role_family_id added; certification validity split from achievement; P30 date_certainty aligned to stated start_date.",
            }
        )
    return p


def migrate_schema(raw: dict) -> dict:
    s = deepcopy(raw)
    s["description"] = (
        "Machine-readable canonical career profile used by Apply OS as its source of truth. "
        "Schema 1.1.0: evidence is subject-referenced (project, experience, education, certification, candidate_fact). "
        "Holds the full project evidence library, not a CV."
    )
    s["$defs"]["role_family_id"] = {
        "type": "string",
        "enum": list(ROLE_FAMILY_IDS.values()),
    }
    s["$defs"]["evidence_subject"] = {
        "type": "object",
        "additionalProperties": False,
        "required": ["type", "id"],
        "properties": {
            "type": {
                "type": "string",
                "enum": ["project", "experience", "education", "certification", "candidate_fact"],
            },
            "id": {"type": "string", "minLength": 1},
        },
    }
    s["$defs"]["id_evidence"] = {
        "type": "string",
        "pattern": "^EV-[A-Z0-9]+-[0-9]{2}$",
        "description": "Existing project evidence IDs keep the EV-Pnn-nn form. Future non-project evidence may use EV-EXP-nn, EV-EDU-nn, EV-CERT-nn, EV-FACT-nn.",
    }
    s["$defs"]["evidence_record"] = {
        "type": "object",
        "additionalProperties": False,
        "required": ["evidence_id", "subject", "claim", "source_text", "source_document", "evidence_strength"],
        "properties": {
            "evidence_id": {"$ref": "#/$defs/id_evidence"},
            "subject": {"$ref": "#/$defs/evidence_subject"},
            "claim": {"type": "string"},
            "source_text": {
                "type": "string",
                "description": "Verbatim or near-verbatim excerpt from the source document. Never paraphrased upward.",
            },
            "source_document": {"type": "string"},
            "source_locator": {"type": "string"},
            "evidence_strength": {"$ref": "#/$defs/evidence_strength"},
        },
    }
    cert = s["$defs"]["certification"]
    cert["required"] = ["name", "provider", "achievement_status", "current_validity"]
    props = cert["properties"]
    props.pop("status", None)
    props["achievement_status"] = {"type": "string", "enum": ["completed", "in_progress", "unknown"]}
    props["current_validity"] = {
        "type": "string",
        "enum": ["valid", "expired", "not_applicable", "unverified"],
        "description": "Completion does not imply current validity. Unverified when expiry is unknown.",
    }
    rt = s["$defs"]["role_target"]
    rt["required"] = [
        "role_family_id",
        "role_family",
        "priority",
        "acceptable_titles",
        "core_requirements",
        "supporting_skill_ids",
        "supporting_project_ids",
    ]
    rt["properties"] = {
        "role_family_id": {"$ref": "#/$defs/role_family_id"},
        **rt["properties"],
    }
    proj_props = s["$defs"]["project"]["properties"]
    proj_props["role_family_ids"] = {"type": "array", "items": {"$ref": "#/$defs/role_family_id"}}
    cp = s["$defs"]["claim_policy"]
    cp["required"] = [
        "principles",
        "supported_claims",
        "qualified_claims",
        "forbidden_claims",
        "not_currently_evidenced",
        "boundaries",
        "uncertain_facts",
    ]
    props = cp["properties"]
    props.pop("unsupported_claims", None)
    claim_reason_item = {
        "type": "object",
        "additionalProperties": False,
        "required": ["claim", "reason"],
        "properties": {"claim": {"type": "string"}, "reason": {"type": "string"}},
    }
    props["forbidden_claims"] = {
        "type": "array",
        "description": "Must never be claimed from current evidence, in any wording.",
        "items": claim_reason_item,
    }
    props["not_currently_evidenced"] = {
        "type": "array",
        "description": "Current skill or evidence gap. Not permanently forbidden; may become supported later.",
        "items": claim_reason_item,
    }
    s["$defs"]["career_objectives"]["properties"]["deliberate_differentiators"]["description"] = (
        "Factual capability signals only. Ranking and application strategy live in decision-policy.json."
    )
    return s


def migrate_policy(raw: dict, profile: dict) -> dict:
    pol = deepcopy(raw)
    pol["policy_version"] = "1.1.0"
    pol["derived_from"] = "candidate-profile.json schema_version 1.1.0"

    enabled_primary = {
        "ai_engineering",
        "mlops_engineering",
        "data_engineering_cloud",
        "data_science",
    }
    targets = []
    for t in pol["active_discovery_targets"]:
        fid = ROLE_FAMILY_IDS[t["role_family"]]
        targets.append(
            {
                "role_family_id": fid,
                "role_family": t["role_family"],
                "priority": t["priority"],
                "enabled_for_discovery": fid in enabled_primary,
                "rationale": t["rationale"],
            }
        )
    pol["active_discovery_targets"] = targets

    pol["hard_constraints"]["blockers"] = [
        b
        for b in pol["hard_constraints"]["blockers"]
        if "years in a titled role" not in b["blocker"].lower()
    ]
    pol["hard_constraints"]["years_in_title_rule"] = {
        "default_route": "HUMAN_REVIEW",
        "hard_reject_only_when": (
            "The posting states the exact titled-years requirement as non-negotiable or regulatory "
            "and adjacent equivalent experience cannot satisfy it."
        ),
        "note": (
            "A stated years requirement in a particular job title is not a HARD BLOCKER merely because "
            "the candidate has not held that exact title."
        ),
    }

    pol["triage_policy"] = {
        "buckets": ["HARD_REJECT", "LOW_PRIORITY_ARCHIVE", "DEEP_REVIEW", "HUMAN_REVIEW"],
        "reject_on": ["HARD BLOCKER only (see hard_constraints)"],
        "never_auto_reject_on": [
            "a SOFT NEGATIVE alone",
            "compensation uncertainty or pay below observed_target_range alone",
            "requirement-match percentage alone",
            "an EVIDENCE GAP in a not_currently_evidenced item alone",
            "a stated years-in-title requirement alone",
        ],
        "route_to": {
            "HARD_REJECT": "Genuine hard constraint match, including regulatory exact-title years that cannot be satisfied.",
            "LOW_PRIORITY_ARCHIVE": "No hard blocker, but the title/family is not a plausible capability match. Do not spend deep-review budget.",
            "DEEP_REVIEW": "Plausible role-family relevance and no hard blocker. Retrieve a relevant evidence subset, then ask Jev for typed judgments.",
            "HUMAN_REVIEW": "Ambiguity: years-in-title, compensation uncertainty, missing critical fields, or a must-have evidence gap.",
        },
        "do_not_send_every_non_blocked_job_to_deep_review": True,
    }

    pol["deep_review_policy"] = {
        "reserved_for": "Jobs with plausible role-family relevance.",
        "still_review_even_if_below_heuristic_when": [
            "missing requirements are clearly optional",
            "the candidate has strong adjacent evidence",
            "the role has unusually high strategic value",
            "the posting is ambiguous",
            "the missing requirement can reasonably be learned",
            "the requirement is a preference rather than a must-have",
        ],
    }

    for boost in pol["ranking_policy"].get("boost_signals", []):
        boost.pop("note", None)
    pol["ranking_policy"]["differentiator_weights"] = [
        {
            "when": "posting concerns trust, safety, governance, evaluation or regulated decisions",
            "boost": "high",
            "based_on": "Repeated negative findings and declined automation (P40, P54, P55, P60, P62).",
        },
        {
            "when": "posting asks for hypothesis testing or analytical independence",
            "boost": "high",
            "based_on": "Disproved stakeholder assumptions on real data (P29, P51).",
        },
        {
            "when": "posting mentions agent permissions, guardrails or auditability",
            "boost": "high",
            "based_on": "Agent governance depth across P38, P45, P48, P49, P64.",
        },
    ]

    # Keep the 80% heuristic once, as guidance only.
    pol["application_strategy"]["requirement_match_guidance"] = {
        "heuristic": (
            "Roughly 80 percent of a posting's stated requirements is a useful focusing guideline, "
            "not an automatic cutoff. 20 focused applications beat 200 scattered ones."
        ),
        "never_an_automatic_rejection_threshold": True,
        "still_review_even_if_below_heuristic_when": pol["deep_review_policy"]["still_review_even_if_below_heuristic_when"],
    }

    pol["compensation_policy"]["routing_rule"] = (
        "Do not reject a posting on salary alone. Unstated pay, or pay materially below the observed "
        "range, routes to HUMAN_REVIEW."
    )

    pol["claim_use_policy"]["forbidden_claims_rule"] = (
        "Items in candidate-profile.json claim_policy.forbidden_claims must never be used in any "
        "application material, in any wording."
    )
    pol["claim_use_policy"]["not_currently_evidenced_rule"] = (
        "Items in candidate-profile.json claim_policy.not_currently_evidenced are an EVIDENCE GAP, "
        "not a forbidden claim. Do not claim them today; if a posting requires one as a must-have, "
        "route to HUMAN_REVIEW rather than silently rejecting or silently claiming it."
    )
    return pol


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    profile = migrate_profile(json.loads(SRC_PROFILE.read_text()))
    schema = migrate_schema(json.loads(SRC_SCHEMA.read_text()))
    policy = migrate_policy(json.loads(SRC_POLICY.read_text()), profile)

    (OUT / "candidate-profile.json").write_text(json.dumps(profile, indent=2, ensure_ascii=False) + "\n")
    (OUT / "candidate-profile.schema.json").write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
    (OUT / "decision-policy.json").write_text(json.dumps(policy, indent=2, ensure_ascii=False) + "\n")

    assert profile["schema_version"] == "1.1.0"
    assert len(profile["projects"]) == 64
    assert len(profile["evidence"]) == 169
    assert len({e["evidence_id"] for e in profile["evidence"]}) == 169
    assert all("project_id" not in e and e["subject"]["type"] == "project" for e in profile["evidence"])
    p30 = next(x for x in profile["projects"] if x["project_id"] == "P30")
    assert p30["start_date"] == "2026" and p30["date_certainty"] == "stated_in_source"
    print("migrated", len(profile["projects"]), "projects", len(profile["evidence"]), "evidence")


if __name__ == "__main__":
    main()
