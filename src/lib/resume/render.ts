import type { ResumeContext, ResumeDraft, ResumePlan, ResumePolicy } from "./types";
import { guardDraft } from "./guard";
import { ensure } from "./validation";
export interface RenderedResume { text:string; html:string; draftHash:string; wordCount:number; rendererRevision:"single-column-v1" }
export function escapeHtml(text:string):string{return text.replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]!));}
function safeLink(url:string):string|null{
  try{const u=new URL(url);return ["https:","http:"].includes(u.protocol)?u.href:null;}catch{return null;}
}
/** Exactly the same approved atoms feed both text and HTML, in reading order. */
export function renderResume(ctx:ResumeContext,plan:ResumePlan,d:ResumeDraft,p:ResumePolicy,includeContact=true):RenderedResume{
  const guard=guardDraft(ctx,plan,d,p);ensure(guard.passed,`UNSAFE_DRAFT:${guard.errors.join(",")}`);
  const claims=new Map(ctx.claims.map(c=>[c.id,c]));
  const entities=new Map(ctx.entities.map(e=>[e.subject.id,e]));
  const atom=(id:string)=>claims.get(id)!.text;
  const lines:string[]=[], html:string[]=[];
  const block=(text:string,tag:"h1"|"h2"|"h3"|"p"="p")=>{lines.push(text);html.push(`<${tag}>${escapeHtml(text)}</${tag}>`);};
  if(includeContact){
    block(ctx.header.fullName,"h1");
    block([ctx.header.location,ctx.header.email,ctx.header.phone].filter(Boolean).join(" | "));
    const links=ctx.header.links.map(l=>({label:l.label,url:safeLink(l.url)})).filter(l=>l.url!==null);
    if(links.length){
      lines.push(links.map(l=>`${l.label}: ${l.url}`).join(" | "));
      html.push(`<p>${links.map(l=>`<a href="${escapeHtml(l.url!)}" rel="noreferrer">${escapeHtml(l.label)}: ${escapeHtml(l.url!)}</a>`).join(" | ")}</p>`);
    }
  }
  block(`Target role: ${ctx.job.title}`);
  if(d.summaryClaimIds.length){block("Professional profile","h2");for(const id of d.summaryClaimIds)block(atom(id));}
  if(d.skillClaimIds.length){block("Key skills","h2");block(d.skillClaimIds.map(atom).join(" • "));}
  block("Selected experience and delivery","h2");
  for(const entry of d.entries){
    const e=entities.get(entry.subjectId)!;
    block(e.title,"h3");
    const labels:Record<string,string>={contract:"Contract",freelance:"Freelance",independent:"Independent project",portfolio:"Portfolio project",employment:"Employment",unknown:"Engagement basis unconfirmed"};
    block([e.organisation,e.engagement?labels[e.engagement]:null,e.period??"Period unconfirmed"].filter(Boolean).join(" | "));
    html.push("<ul>");
    for(const id of entry.claimIds){lines.push(`• ${atom(id)}`);html.push(`<li>${escapeHtml(atom(id))}</li>`);}
    html.push("</ul>");
  }
  for(const [title,ids] of [["Education",d.educationClaimIds],["Certifications and training",d.certificationClaimIds]] as const){
    if(ids.length){block(title,"h2");for(const id of ids)block(atom(id));}
  }
  const text=lines.join("\n");const wordCount=text.split(/\s+/).filter(Boolean).length;
  ensure(wordCount<=p.maxWords,"RENDER_WORD_BUDGET_EXCEEDED");
  // A4 intent is NOT a one-page guarantee. Actual PDF rendering must be measured.
  const document=`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resume preview</title><style>
  @page {size:A4;margin:13mm 14mm;} *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${p.minFontSizePt}pt;line-height:1.2;color:#000;background:#fff;max-width:182mm;margin:12mm auto;}
  h1{font-size:18pt;margin:0 0 3pt;} h2{font-size:11pt;margin:9pt 0 4pt;border-bottom:1px solid #000;break-after:avoid;}
  h3{font-size:${p.minFontSizePt}pt;margin:7pt 0 2pt;break-after:avoid;} p{margin:0 0 3pt;} ul{margin:3pt 0 6pt;padding-left:13pt;} li{margin:0 0 3pt;break-inside:avoid;}
  a{color:#000;text-decoration:none;} @media print{body{max-width:none;margin:0;}a{color:#000;}}
  </style></head><body>${html.join("\n")}</body></html>`;
  return {text,html:document,draftHash:guard.draftHash,wordCount,rendererRevision:"single-column-v1"};
}
