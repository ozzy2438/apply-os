import type { HumanApproval, LayoutReceipt, ResumeContext, ResumeDraft, ResumePlan, ResumePolicy, ReviewResult } from "./types";
import { guardDraft, selectedClaimIds } from "./guard";
import { hash } from "./identity";
import { RUBRIC_HASH } from "./questions";
import { composeReview } from "./rank";
/** Receipts come from authenticated server storage, NEVER client/LLM-supplied booleans. */
export function canMarkReady(input:{context:ResumeContext;plan:ResumePlan;draft:ResumeDraft;policy:ResumePolicy;
  review:ReviewResult|null;layout:LayoutReceipt|null;approval:HumanApproval|null;now?:Date}):{ready:boolean;reasons:string[]}{
  const {context:ctx,plan,draft,policy:p,review,layout,approval}=input;
  const guard=guardDraft(ctx,plan,draft,p);const reasons=[...guard.errors];
  const selected=new Set(selectedClaimIds(draft));
  const subjects=new Set(ctx.claims.filter(c=>selected.has(c.id)).map(c=>c.subject.id));
  for(const e of ctx.entities.filter(e=>subjects.has(e.subject.id))){
    if(!e.metadataApproved)reasons.push(`UNCONFIRMED_METADATA:${e.subject.id}`);
    if(["project","experience"].includes(e.subject.type) && (!e.period || e.engagement===null || e.engagement==="unknown"))reasons.push(`UNCONFIRMED_PERIOD_OR_ENGAGEMENT:${e.subject.id}`);
  }
  if(!review || review.status!=="scored" || review.mode!=="live" || review.draftHash!==guard.draftHash || review.rubricHash!==RUBRIC_HASH || review.policyHash!==hash(p))reasons.push("CURRENT_LIVE_REVIEW_REQUIRED");
  let recomputedReady=false;
  if(review?.status==="scored"){
    try{
      const answers=Object.fromEntries(review.dimensions.map(d=>[d.id,{score:d.raw,confidence:d.confidence}]));
      const recomputed=composeReview(answers,p,{draftHash:guard.draftHash,mode:review.mode,requestedModel:review.requestedModel,resolvedModel:review.resolvedModel});
      recomputedReady=recomputed.assessment==="READY_FOR_HUMAN_REVIEW";
    }catch{reasons.push("MALFORMED_QA_RECEIPT");}
  }
  if(!recomputedReady)reasons.push("RESUME_QA_NOT_READY");
  if(!layout || layout.measured!==true || layout.draftHash!==guard.draftHash || !/^[a-f0-9]{64}$/.test(layout.artifactHash) || !layout.rendererRevision ||
    layout.pageCount!==p.expectedPages || !Number.isFinite(layout.minFontSizePt) || layout.minFontSizePt<p.minFontSizePt || layout.extractedTextMatches!==true || layout.clippedContent!==false)reasons.push("MEASURED_EXPORT_CHECK_REQUIRED");
  const now=input.now??new Date();const approvedAt=approval?Date.parse(approval.approvedAt):NaN;
  if(!approval || !approval.actorId || approval.tenantId!==ctx.scope.tenantId || approval.candidateId!==ctx.scope.candidateId ||
    approval.draftHash!==guard.draftHash || approval.artifactHash!==layout?.artifactHash || !Number.isFinite(approvedAt) || approvedAt>now.getTime())reasons.push("CURRENT_HUMAN_APPROVAL_REQUIRED");
  if(guard.warnings.length && approval?.acceptedWarnings!==true)reasons.push("WARNINGS_NOT_ACKNOWLEDGED");
  return {ready:reasons.length===0,reasons:[...new Set(reasons)]};
}
