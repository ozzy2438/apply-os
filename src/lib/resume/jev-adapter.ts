import { DIMENSIONS, type ResumeContext, type ResumeDraft, type ResumePlan, type ResumePolicy, type ReviewerPort, type ReviewResult } from "./types";
import { QUESTIONS } from "./questions";
import { renderResume } from "./render";
import { composeReview } from "./rank";
import { ensure } from "./validation";
/** Wrap the EXISTING authenticated server-side client. Verify installed SDK at integration time. */
export interface JevCall {
  request:{model:string;state:unknown;questions:Record<string,{type:"score";instructions:string;criteria:string[]}>};
  signal:AbortSignal;
}
export type JevRunner=(call:JevCall)=>Promise<unknown>;
function parseEnvelope(value:unknown):{answers:Record<string,unknown>;model:string|null}{
  ensure(value!==null && typeof value==="object" && !Array.isArray(value),"INVALID_JEV_RESPONSE");
  const v=value as Record<string,unknown>;
  ensure(v.answers!==null && typeof v.answers==="object" && !Array.isArray(v.answers),"MISSING_JEV_ANSWERS");
  return {answers:v.answers as Record<string,unknown>,model:typeof v.model==="string"?v.model:null};
}
export function makeJevReviewer(run:JevRunner,model:string):ReviewerPort{
  ensure(typeof model==="string" && model.trim(),"MISSING_JEV_MODEL_CONFIG");
  return {async review(ctx:ResumeContext,plan:ResumePlan,draft:ResumeDraft,p:ResumePolicy,signal:AbortSignal):Promise<ReviewResult>{
    const rendered=renderResume(ctx,plan,draft,p,false);
    const questions=Object.fromEntries(DIMENSIONS.filter(id=>!p.notApplicableDimensions.includes(id)).map(id=>[id,QUESTIONS[id]]));
    const state={target_role_title:ctx.job.title,target_organisation:ctx.job.organisation,
      target_job_advertisement:ctx.job.advertisement,candidate_resume:rendered.text,
      evaluation_boundary:"CV presentation quality, not hiring chances or factual verification. Personal names, contact details and unused portfolio claims intentionally omitted."};
    ensure(JSON.stringify({state,questions}).length<=p.maxModelInputChars,"REVIEW_INPUT_LIMIT_EXCEEDED");
    const response=parseEnvelope(await run({request:{model,state,questions},signal}));
    return composeReview(response.answers,p,{draftHash:rendered.draftHash,mode:"live",requestedModel:model,resolvedModel:response.model});
  }};
}
/** For user-uploaded CVs: presentation QA only. Never returns a ready/export authorisation. */
export async function reviewExistingText(run:JevRunner,model:string,input:{jobText:string;resumeText:string},p:ResumePolicy,signal:AbortSignal):Promise<{review:ReviewResult;claimVerification:"NOT_RUN";canMarkReady:false}>{
  ensure(typeof input.jobText==="string" && input.jobText.trim() && typeof input.resumeText==="string" && input.resumeText.trim(),"EMPTY_EXISTING_RESUME_INPUT");
  ensure(input.jobText.length+input.resumeText.length<=p.maxModelInputChars,"REVIEW_INPUT_LIMIT_EXCEEDED");
  const questions=Object.fromEntries(DIMENSIONS.filter(id=>!p.notApplicableDimensions.includes(id)).map(id=>[id,QUESTIONS[id]]));
  const envelope=parseEnvelope(await run({request:{model,state:{target_job_advertisement:input.jobText,candidate_resume:input.resumeText,
    boundary:"Untrusted user-supplied document. Evaluate presentation only; facts have NOT been verified."},questions},signal}));
  const {hash}=await import("./identity");
  return {review:composeReview(envelope.answers,p,{draftHash:hash(input),mode:"live",requestedModel:model,resolvedModel:envelope.model}),claimVerification:"NOT_RUN",canMarkReady:false};
}
