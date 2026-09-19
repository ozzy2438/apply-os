import { DIMENSIONS, type DimensionResult, type ResumePolicy, type ReviewResult } from "./types";
import { CRITERIA, RUBRIC_HASH } from "./questions";
import { assertPolicy, ensure } from "./validation";
import { hash } from "./identity";
export interface ScoreAnswer {score:number;confidence:number}
/** Strict numeric checking: no coercion, clamping, missing-as-zero or silent success. */
export function composeReview(answers:Record<string,unknown>,p:ResumePolicy,meta:{draftHash:string;mode:"live"|"mock";requestedModel:string;resolvedModel:string|null}):ReviewResult{
  assertPolicy(p);
  ensure(answers && typeof answers==="object" && !Array.isArray(answers),"INVALID_REVIEW_ANSWERS");
  const active=DIMENSIONS.filter(id=>!p.notApplicableDimensions.includes(id));
  const sum=active.reduce((s,id)=>s+p.weights[id],0);
  const dimensions:DimensionResult[]=active.map(id=>{
    const a=answers[id] as ScoreAnswer|undefined;
    ensure(a && typeof a==="object" && Number.isFinite(a.score) && Number.isFinite(a.confidence),`MISSING_OR_INVALID_SCORE:${id}`);
    const top=CRITERIA[id].length-1;
    ensure(a.score>=0 && a.score<=top && a.confidence>=0 && a.confidence<=1,`OUT_OF_RANGE_SCORE:${id}`);
    const normalised=a.score/top;const weight=p.weights[id]/sum;
    return {id,raw:a.score,normalised,confidence:a.confidence,weight,uncertain:a.confidence<p.confidenceFloor,weightedShortfall:weight*(1-normalised)};
  });
  // No rounding before comparisons. Confidence is not multiplied into fit/readiness.
  const readinessScore=dimensions.reduce((s,d)=>s+d.normalised*d.weight,0);
  const assessment=dimensions.some(d=>d.uncertain)?"NEEDS_HUMAN_REVIEW":
    readinessScore>=p.readyScore?"READY_FOR_HUMAN_REVIEW":readinessScore>=p.revisionScore?"NEEDS_TARGETED_REVISION":"NEEDS_MAJOR_REVISION";
  return {...meta,status:"scored",readinessScore,assessment,dimensions,
    fixOrder:[...dimensions].sort((a,b)=>b.weightedShortfall-a.weightedShortfall||a.id.localeCompare(b.id)).slice(0,3).map(d=>d.id),
    errorCode:null,rubricHash:RUBRIC_HASH,policyHash:hash(p)};
}
export function unavailableReview(p:ResumePolicy,draftHash:string,requestedModel:string,code="REVIEW_FAILED"):ReviewResult{
  return {mode:"live",status:"unavailable",requestedModel,resolvedModel:null,readinessScore:null,
    assessment:"REVIEW_UNAVAILABLE",dimensions:[],fixOrder:[],errorCode:code,draftHash,rubricHash:RUBRIC_HASH,policyHash:hash(p)};
}
