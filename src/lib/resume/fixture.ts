/** Entirely fictional fixtures. Approval receipts below are TEST DATA, not user approvals. */
import type { ClaimCard, Evidence, ResumeContext, ResumePolicy, SourceEntity } from "./types";
import { claimHash, hash } from "./identity";
import { WEIGHTS } from "./weights";
export function fixturePolicy():ResumePolicy{return {
  version:"1.0.0",maxEntries:4,maxBulletsPerEntry:4,maxSummaryClaims:2,maxSkills:8,maxCredentialClaims:6,
  maxWords:650,maxRevisions:1,timeoutMs:200,maxModelInputChars:40000,confidenceFloor:.6,readyScore:.75,revisionScore:.6,
  weights:structuredClone(WEIGHTS["data-analyst"]!),notApplicableDimensions:[],expectedPages:1,minFontSizePt:10.5};}
export function fixtureContext():ResumeContext{
  const profileHash=hash("FICTIONAL_PROFILE_V1");
  const scope={tenantId:"demo-tenant",candidateId:"demo-candidate",jobId:"demo-job",profileVersion:"1.1.0",profileHash,
    decisionPolicyVersion:"1.0.0",decisionPolicyHash:hash("demo-decision-policy"),jobHash:hash("demo-job")};
  const ent=(id:string,title:string,engagement:SourceEntity["engagement"],type:SourceEntity["subject"]["type"]="project"):SourceEntity=>({
    subject:{type,id},title,organisation:engagement==="contract"?"Confidential client — synthetic fixture":null,period:"2025",engagement,
    cvUsage:"standard",metadataApproved:true,exclusiveGroup:null,boundaries:["This is fictional test data, not a real employment claim."]});
  const entities=[ent("demo-pipeline","Reporting pipeline","independent"),ent("demo-reporting","Reporting analyst","contract","experience"),
    ent("demo-excluded","Excluded project","independent"),ent("demo-person","Professional identity",null,"candidate_fact"),
    ent("demo-education","Diploma of Information Technology",null,"education")];
  entities[2]!.cvUsage="excluded";
  const evidence:Evidence[]=[];const claims:ClaimCard[]=[];
  function add(id:string,entityId:string,kind:ClaimCard["kind"],text:string,measurementContext:ClaimCard["measurementContext"]="not_applicable",requiredQualifiers:string[]=[]){
    const subject=entities.find(e=>e.subject.id===entityId)!.subject;const eid=`evidence-${id}`;
    evidence.push({id:eid,subject,sourceText:text,sourceDocument:"SYNTHETIC TEST FIXTURE",sourceLocator:id,strength:"self_reported"});
    const c:ClaimCard={id,subject,kind,text,evidenceIds:[eid],requiredQualifiers,measurementContext,
      approval:{status:"approved",method:"human",profileHash,contentHash:null}};
    c.approval.contentHash=claimHash(c);claims.push(c);
  }
  add("c-sql","demo-pipeline","bullet","Built a SQL reporting pipeline with explicit validation and reconciliation.");
  add("c-python","demo-pipeline","bullet","Reduced runtime from 50 to 34 seconds in a controlled benchmark using Python.","controlled_validation",["in a controlled benchmark"]);
  add("c-stakeholder","demo-reporting","bullet","Partnered with finance stakeholders to define reporting requirements and explain exceptions.");
  add("c-reporting","demo-reporting","bullet","Delivered a documented reporting handover with clear metric definitions.");
  add("c-excluded","demo-excluded","bullet","Built an AWS service on public data.");
  add("c-summary","demo-person","summary","Data practitioner with evidence-led reporting and SQL pipeline experience.");
  add("c-skill-sql","demo-pipeline","skill","SQL");add("c-skill-python","demo-pipeline","skill","Python");
  add("c-education","demo-education","education","Diploma of Information Technology — Fictional Training Provider, completed 2025.");
  return {scope,header:{fullName:"Alex Taylor — fictional example",location:"Melbourne, VIC",email:"alex@example.com",phone:null,
    links:[{label:"Portfolio",url:"https://example.com/portfolio"}]},
    job:{title:"Data Analyst",organisation:"Example Company — fictional job",roleFamilyId:"data_analytics_insights",
      advertisement:"Build SQL pipelines. Use Python for data validation. Communicate with finance stakeholders. AWS is desirable.",
      requirements:[{id:"r-sql",text:"SQL pipelines",importance:"MUST",sourceQuote:"Build SQL pipelines."},
        {id:"r-python",text:"Python validation",importance:"MUST",sourceQuote:"Use Python for data validation."},
        {id:"r-stakeholder",text:"Stakeholder communication",importance:"SHOULD",sourceQuote:"Communicate with finance stakeholders."},
        {id:"r-aws",text:"AWS",importance:"NICE",sourceQuote:"AWS is desirable."}]},entities,evidence,claims,
    matches:[{requirementId:"r-sql",claimIds:["c-sql","c-summary","c-skill-sql"],support:"SUPPORTED"},
      {requirementId:"r-python",claimIds:["c-python","c-skill-python"],support:"SUPPORTED"},
      {requirementId:"r-stakeholder",claimIds:["c-stakeholder"],support:"SUPPORTED"},
      {requirementId:"r-aws",claimIds:["c-excluded"],support:"SUPPORTED"}]};
}
