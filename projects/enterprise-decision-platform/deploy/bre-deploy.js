'use strict';
/* BusinessRuleEngine schema deploy — direct Web API, idempotent, qdb_edp_ namespace. */
const fs = require('fs');
const https = require('https');

const ENV_PATH = (process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env');
const SOLUTION = 'BusinessRuleEngine';
const PREFIX = 'qdb_edp_';
function loadEnv(p){const o={};for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)o[m[1]]=m[2].trim();}return o;}
const env=loadEnv(ENV_PATH);
const ORG=(env.DATAVERSE_URL||'https://org5869857f.crm4.dynamics.com').replace(/\/$/,'');
const HOST=new URL(ORG).host;
const API=`/api/data/v9.2`;

function raw(method,path,token,body,extraHeaders){
  return new Promise((res,rej)=>{
    const data=body==null?null:(typeof body==='string'?body:JSON.stringify(body));
    const headers={Accept:'application/json','OData-Version':'4.0','OData-MaxVersion':'4.0',...(extraHeaders||{})};
    if(token)headers.Authorization=`Bearer ${token}`;
    if(data){headers['Content-Type']='application/json';headers['Content-Length']=Buffer.byteLength(data);}
    const req=https.request({host:HOST,path,method,headers},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res({status:r.statusCode,body:b}));});
    req.on('error',rej);if(data)req.write(data);req.end();
  });
}
async function token(){
  const form=`client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG+'/.default')}`;
  const r=await new Promise((res,rej)=>{const req=https.request({host:'login.microsoftonline.com',path:`/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(form)}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>res({status:x.statusCode,body:b}));});req.on('error',rej);req.write(form);req.end();});
  if(r.status!==200)throw new Error('token '+r.status+' '+r.body.slice(0,300));
  return JSON.parse(r.body).access_token;
}
const solHdr={'MSCRM.SolutionUniqueName':SOLUTION};
const label=t=>({'@odata.type':'Microsoft.Dynamics.CRM.Label',LocalizedLabels:[{'@odata.type':'Microsoft.Dynamics.CRM.LocalizedLabel',Label:t,LanguageCode:1033}]});
const req0={'@odata.type':'Microsoft.Dynamics.CRM.AttributeRequiredLevelManagedProperty',Value:'None',CanBeChanged:true,ManagedPropertyLogicalName:'canmodifyrequirementlevelsettings'};
function strAttr(name,disp,max=200,primary=false){return{'@odata.type':'Microsoft.Dynamics.CRM.StringAttributeMetadata',SchemaName:PREFIX+name,RequiredLevel:req0,MaxLength:max,FormatName:{Value:'Text'},DisplayName:label(disp),IsPrimaryName:primary};}
function memoAttr(name,disp,max=1048576){return{'@odata.type':'Microsoft.Dynamics.CRM.MemoAttributeMetadata',SchemaName:PREFIX+name,RequiredLevel:req0,MaxLength:max,DisplayName:label(disp)};}
function boolAttr(name,disp){return{'@odata.type':'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',SchemaName:PREFIX+name,RequiredLevel:req0,DisplayName:label(disp),OptionSet:{'@odata.type':'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',TrueOption:{Value:1,Label:label('Yes')},FalseOption:{Value:0,Label:label('No')}}};}
function intAttr(name,disp){return{'@odata.type':'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',SchemaName:PREFIX+name,RequiredLevel:req0,DisplayName:label(disp)};}
function dtAttr(name,disp){return{'@odata.type':'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',SchemaName:PREFIX+name,RequiredLevel:req0,Format:'DateAndTime',DisplayName:label(disp)};}

// Entity defs: [logical-suffix, DisplayName, DisplayCollection, primaryLabel, [extra non-lookup attrs]]
const ENTITIES=[
 ['rule','EDP Rule','EDP Rules','Rule Name',[strAttr('rulekey','Rule Key',100),memoAttr('description','Description',4000)]],
 ['ruleversion','EDP Rule Version','EDP Rule Versions','Version Label',[intAttr('versionnumber','Version Number'),memoAttr('pcrmjson','PCRM JSON'),memoAttr('jdmsourcejson','JDM Source JSON'),boolAttr('ispinned','Is Pinned'),strAttr('pinjustificationnote','Pin Justification Note',500)]],
 ['ruleapproval','EDP Rule Approval','EDP Rule Approvals','Approval Name',[memoAttr('comments','Comments',4000),strAttr('actor','Actor',200),dtAttr('decidedon','Decided On')]],
 ['ruleaudit','EDP Rule Audit','EDP Rule Audits','Audit Name',[strAttr('action','Action',200),strAttr('actor','Actor',200),dtAttr('auditedon','Audited On'),memoAttr('details','Details',8000)]],
 ['ruleexecutionlog','EDP Rule Execution Log','EDP Rule Execution Logs','Execution Name',[strAttr('resolvedversion','Resolved Version',100),strAttr('wouldresolveversion','Would-Resolve Version',100),boolAttr('pinned','Pinned'),strAttr('actor','Actor',200),dtAttr('executedon','Executed On'),strAttr('outcome','Outcome',200),intAttr('durationms','Duration (ms)')]],
 ['ruletest','EDP Rule Test','EDP Rule Tests','Test Name',[memoAttr('testcasesjson','Test Cases JSON'),strAttr('lastresult','Last Result',100)]],
 ['rulesimulationrun','EDP Rule Simulation Run','EDP Rule Simulation Runs','Simulation Name',[memoAttr('inputjson','Input JSON'),memoAttr('outputjson','Output JSON'),dtAttr('ranon','Ran On')]],
 ['ruleanalytics','EDP Rule Analytics','EDP Rule Analytics','Analytics Name',[memoAttr('metricsjson','Metrics JSON'),dtAttr('periodstart','Period Start'),dtAttr('periodend','Period End')]],
 ['rulefunction','EDP Rule Function','EDP Rule Functions','Function Name',[strAttr('signature','Signature',400),memoAttr('semantics','Semantics',4000),boolAttr('isbuiltin','Is Built-In')]],
 ['rulecategory','EDP Rule Category','EDP Rule Categories','Category Name',[memoAttr('description','Description',4000)]],
 ['rulefolder','EDP Rule Folder','EDP Rule Folders','Folder Name',[strAttr('path','Path',400)]],
 ['rulepackage','EDP Rule Package','EDP Rule Packages','Package Name',[memoAttr('contentjson','Content JSON'),strAttr('packageversion','Package Version',50)]],
 ['ruletemplate','EDP Rule Template','EDP Rule Templates','Template Name',[memoAttr('templatejson','Template JSON'),memoAttr('parametersjson','Parameters JSON'),strAttr('industry','Industry',100)]],
 ['ruletag','EDP Rule Tag','EDP Rule Tags','Tag Name',[strAttr('color','Color',30)]],
 ['ruledocumentation','EDP Rule Documentation','EDP Rule Documentation','Documentation Name',[memoAttr('content','Content')]],
 ['ruledependency','EDP Rule Dependency','EDP Rule Dependencies','Dependency Name',[strAttr('fromref','From Ref',200),strAttr('toref','To Ref',200)]],
 ['ruleconfiguration','EDP Rule Configuration','EDP Rule Configurations','Config Key',[strAttr('value','Value',2000),memoAttr('valuejson','Value JSON',8000)]],
 ['featureflag','EDP Feature Flag','EDP Feature Flags','Flag Name',[boolAttr('isenabled','Is Enabled'),memoAttr('description','Description',4000)]],
 ['metadataentitydef','EDP Metadata Entity Definition','EDP Metadata Entity Definitions','Entity Logical Name',[strAttr('displayname','Display Name',200),memoAttr('metadatajson','Metadata JSON'),strAttr('versiontoken','Version Token',100)]],
 ['metadataattributedef','EDP Metadata Attribute Definition','EDP Metadata Attribute Definitions','Attribute Logical Name',[strAttr('displayname','Display Name',200),strAttr('attributetype','Attribute Type',100),memoAttr('metadatajson','Metadata JSON')]],
 ['metadataoptionsetdef','EDP Metadata Option Set Definition','EDP Metadata Option Set Definitions','Option Set Name',[memoAttr('optionsjson','Options JSON')]],
 ['ruleimportrecord','EDP Rule Import Record','EDP Rule Import Records','Import Name',[strAttr('sourceformat','Source Format',50),strAttr('importstatus','Import Status',50),memoAttr('log','Log',8000),dtAttr('importedon','Imported On')]],
];

// picklist attrs bound to existing global optionsets: [entitySuffix, attrName, disp, optionsetName]
const PICKLISTS=[
 ['ruleversion','lifecyclestate','Lifecycle State','qdb_edp_lifecyclestate'],
 ['ruleversion','pinjustificationcode','Pin Justification Code','qdb_edp_pinjustificationcode'],
 ['ruleexecutionlog','pinjustificationcode','Pin Justification Code','qdb_edp_pinjustificationcode'],
 ['ruleapproval','approvalstatus','Approval Status','qdb_edp_approvalstatus'],
 ['ruledependency','dependencytype','Dependency Type','qdb_edp_dependencytype'],
 ['ruleconfiguration','environmenttier','Environment Tier','qdb_edp_environmenttier'],
 ['rule','authoringstyle','Authoring Style','qdb_edp_authoringstyle'],
];

// lookups: [referenced(parent) suffix, referencing(child) suffix, lookupAttrName, disp]
const LOOKUPS=[
 ['rule','ruleversion','ruleid','Rule'],
 ['ruleversion','ruleapproval','ruleversionid','Rule Version'],
 ['ruleversion','ruleexecutionlog','ruleversionid','Rule Version'],
 ['ruleversion','ruleaudit','ruleversionid','Rule Version'],
 ['ruleversion','rulesimulationrun','ruleversionid','Rule Version'],
 ['rule','ruletest','ruleid','Rule'],
 ['rule','ruleanalytics','ruleid','Rule'],
 ['rule','ruledocumentation','ruleid','Rule'],
 ['rulecategory','rule','categoryid','Category'],
 ['rulefolder','rule','folderid','Folder'],
 ['rulepackage','rule','packageid','Package'],
 ['metadataentitydef','metadataattributedef','entitydefid','Metadata Entity'],
];

const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);

async function entityExists(t,logical){const r=await raw('GET',`${API}/EntityDefinitions(LogicalName='${logical}')?$select=LogicalName`,t);return r.status===200;}
async function attrExists(t,logical,attr){const r=await raw('GET',`${API}/EntityDefinitions(LogicalName='${logical}')/Attributes(LogicalName='${attr}')?$select=LogicalName`,t);return r.status===200;}

async function createEntity(t,[suffix,disp,coll,primLbl,extra]){
  const logical=PREFIX+suffix;
  if(await entityExists(t,logical)){log('  = entity exists',logical);return true;}
  const primary=strAttr(suffix+'name',primLbl,300,true);
  const payload={'@odata.type':'Microsoft.Dynamics.CRM.EntityMetadata',SchemaName:PREFIX+suffix,DisplayName:label(disp),DisplayCollectionName:label(coll),OwnershipType:'UserOwned',HasActivities:false,HasNotes:false,IsActivity:false,
    Attributes:[primary,...extra]};
  const r=await raw('POST',`${API}/EntityDefinitions`,t,payload,solHdr);
  if(r.status>=200&&r.status<300){log('  + entity',logical);return true;}
  log('  ! entity FAIL',logical,r.status,r.body.slice(0,400));return false;
}
async function addPicklist(t,osMap,[suffix,attr,disp,osName]){
  const logical=PREFIX+suffix,attrLogical=PREFIX+attr;
  if(await attrExists(t,logical,attrLogical)){log('  = picklist exists',logical,attrLogical);return true;}
  const osid=osMap[osName];if(!osid){log('  ! optionset missing',osName);return false;}
  const payload={'@odata.type':'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',SchemaName:PREFIX+attr,RequiredLevel:req0,DisplayName:label(disp),'GlobalOptionSet@odata.bind':`/GlobalOptionSetDefinitions(${osid})`};
  const r=await raw('POST',`${API}/EntityDefinitions(LogicalName='${logical}')/Attributes`,t,payload,solHdr);
  if(r.status>=200&&r.status<300){log('  + picklist',logical,attrLogical);return true;}
  log('  ! picklist FAIL',logical,attrLogical,r.status,r.body.slice(0,300));return false;
}
async function relExists(t,schema){const r=await raw('GET',`${API}/RelationshipDefinitions(SchemaName='${schema}')?$select=SchemaName`,t);return r.status===200;}
async function addLookup(t,[parent,child,attr,disp]){
  const schema=`${PREFIX}${parent}_${child}_${attr}`;
  if(await relExists(t,schema)){log('  = lookup exists',schema);return true;}
  const payload={'@odata.type':'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',SchemaName:schema,ReferencedEntity:PREFIX+parent,ReferencingEntity:PREFIX+child,
    Lookup:{'@odata.type':'Microsoft.Dynamics.CRM.LookupAttributeMetadata',SchemaName:PREFIX+attr,RequiredLevel:req0,DisplayName:label(disp)},
    CascadeConfiguration:{Assign:'NoCascade',Delete:'RemoveLink',Merge:'NoCascade',Reparent:'NoCascade',Share:'NoCascade',Unshare:'NoCascade'}};
  const r=await raw('POST',`${API}/RelationshipDefinitions`,t,payload,solHdr);
  if(r.status>=200&&r.status<300){log('  + lookup',schema);return true;}
  log('  ! lookup FAIL',schema,r.status,r.body.slice(0,300));return false;
}

(async()=>{
  const t=await token();log('AUTH ok');
  // optionset id map
  const osr=await raw('GET',`${API}/GlobalOptionSetDefinitions?$select=Name,MetadataId`,t);
  const osMap={};for(const o of (JSON.parse(osr.body).value||[]))if(o.Name&&o.Name.startsWith('qdb_edp_'))osMap[o.Name]=o.MetadataId;
  log('optionsets found:',Object.keys(osMap).join(','));
  let ec=0;log('=== PASS 1: entities ===');
  for(const e of ENTITIES){if(await createEntity(t,e))ec++;}
  log('entities ok:',ec,'/',ENTITIES.length);
  let pc=0;log('=== PASS 2: picklists ===');
  for(const p of PICKLISTS){if(await addPicklist(t,osMap,p))pc++;}
  log('picklists ok:',pc,'/',PICKLISTS.length);
  let lc=0;log('=== PASS 3: lookups ===');
  for(const l of LOOKUPS){if(await addLookup(t,l))lc++;}
  log('lookups ok:',lc,'/',LOOKUPS.length);
  log('=== PUBLISH ===');
  const pub=await raw('POST',`${API}/PublishAllXml`,t,{});log('publish',pub.status);
  log('DONE entities',ec,'picklists',pc,'lookups',lc);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
