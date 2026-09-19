import type { ResumeContext, ResumeDraft, ResumePolicy, ReviewerPort, ReviewResult, StudioResult, WriterPort } from "./types";
import { makePlan } from "./planner";
import { guardDraft } from "./guard";
import { assertContext, assertPolicy, ensure, parseDraft } from "./validation";
import { WRITER_INSTRUCTIONS, templateWriter, withDeadline, writerState } from "./writer";
import { unavailableReview } from "./rank";
import { renderResume } from "./render";
/** No applications, messages, uploads, DB writes or automatic approval occur here. */
export async function buildResume(input:{context:ResumeContext;policy:ResumePolicy;userRequested:boolean;
  writer?:WriterPort;reviewer?:ReviewerPort;signal?:AbortSignal}):Promise<StudioResult>{
  ensure(input.userRequested===true,"USER_BUILD_REQUEST_REQUIRED");
  // Freeze a consistent snapshot for the whole run. The host checks again when persisting/approving.
  const ctx=structuredClone(input.context),p=structuredClone(input.policy);
  assertContext(ctx);assertPolicy(p);
  const plan=makePlan(ctx,p);const warnings=[...plan.warnings];
  const generation:{mode:"live"|"template"|"not_run";writerRevision:string|null;writerCallAttempts:number}={mode:"not_run",writerRevision:null,writerCallAttempts:0};
  if(!plan.entryIds.length)return {generation,status:"NEEDS_CLAIM_REVIEW",plan,draft:null,guard:null,review:null,revisionAttempts:0,warnings};
  const writer=input.writer??templateWriter(ctx,plan,p);
  generation.mode=writer.mode;generation.writerRevision=writer.revision;
  const callWriter=async(phase:"draft"|"revision",review:ReviewResult|null)=>{
    if(writer.mode==="live")generation.writerCallAttempts++;
    return parseDraft(await withDeadline(p.timeoutMs,signal=>writer.write({instructions:WRITER_INSTRUCTIONS,
      state:writerState(ctx,plan,p,review),signal,phase}),input.signal));
  };
  let draft:ResumeDraft;
  try{draft=await callWriter("draft",null);}catch(e){
    warnings.push(`Draft generation failed: ${e instanceof Error && ["PROVIDER_TIMEOUT","REQUEST_CANCELLED"].includes(e.message)?e.message:"WRITER_FAILED"}`);
    return {generation,status:"BLOCKED",plan,draft:null,guard:null,review:null,revisionAttempts:0,warnings};
  }
  let guard=guardDraft(ctx,plan,draft,p);
  if(!guard.passed)return {generation,status:"BLOCKED",plan,draft,guard,review:null,revisionAttempts:0,warnings};
  try{renderResume(ctx,plan,draft,p);}catch{return {generation,status:"BLOCKED",plan,draft,guard,review:null,revisionAttempts:0,warnings:[...warnings,"RENDER_VALIDATION_FAILED"]};}
  const assess=async(d:ResumeDraft):Promise<ReviewResult>=>{
    const h=guardDraft(ctx,plan,d,p).draftHash;
    if(!input.reviewer)return unavailableReview(p,h,"not-configured","REVIEWER_NOT_CONFIGURED");
    try{return await withDeadline(p.timeoutMs,s=>input.reviewer!.review(ctx,plan,d,p,s),input.signal);}
    catch{return unavailableReview(p,h,"configured-in-host","REVIEW_FAILED_OR_TIMED_OUT");}
  };
  let review=await assess(draft);let revisionAttempts=0;
  if(p.maxRevisions===1 && writer.mode==="live" && review.status==="scored" &&
    ["NEEDS_TARGETED_REVISION","NEEDS_MAJOR_REVISION"].includes(review.assessment)){
    revisionAttempts=1;
    try{
      const next=await callWriter("revision",review);const nextGuard=guardDraft(ctx,plan,next,p);
      if(!nextGuard.passed)warnings.push("Rejected unsafe revision; original draft retained.");
      else{
        renderResume(ctx,plan,next,p);const nextReview=await assess(next);
        if(nextReview.status==="scored" && !nextReview.dimensions.some(d=>d.uncertain) &&
          nextGuard.warnings.length<=guard.warnings.length && (nextReview.readinessScore??-1)>(review.readinessScore??-1)){
          draft=next;guard=nextGuard;review=nextReview;
        }else warnings.push("Revision did not demonstrate a safer, clearer improvement; original draft retained.");
      }
    }catch{warnings.push("Revision failed; original draft retained.");}
  }
  // Ready is intentionally NOT a pipeline output. Approval + measured export are separate.
  const status=review.status==="scored" && ["NEEDS_TARGETED_REVISION","NEEDS_MAJOR_REVISION"].includes(review.assessment)?"NEEDS_REVISION":"AWAITING_HUMAN_REVIEW";
  return {generation,status,plan,draft,guard,review,revisionAttempts,warnings};
}
