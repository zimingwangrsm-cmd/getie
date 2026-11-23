'use strict';
let planMode='series',planCurrent=null,planIdentity=null,planPending=null,planPollTimer,planLoading=false,planMutation=false,planListRun=0,planOpenRun=0,planDesired=null;
let planCommentDrafts=new Map();
const PLAN_STATUS={planned:'待创作',drafting:'创作中',published:'已发布 · 已冻结'};
function planKey(){return 'resonance.plans.job.'+storageIdentity;}
function planMessage(message,error){if(typeof placePlanStatus==='function')placePlanStatus();$('planTaskStatus').replaceChildren(document.createTextNode(message));const link=accountLink(error);if(link)$('planTaskStatus').append(link);}
function planButton(label,handler,kind='outline'){const b=node('button','button '+kind,label);b.type='button';b.addEventListener('click',handler);return b;}
function planParagraph(label,value){const p=node('p','plan-copy');p.append(node('strong','',label+'：'),document.createTextNode(value||'暂无'));return p;}
function planListBlock(label,values){const section=node('div','plan-field');section.append(node('h4','',label));if(!values?.length)section.append(node('p','plan-note','暂无；创作前仍需核对事实与素材。'));else{const ul=node('ul');for(const value of values)ul.append(node('li','',value));section.append(ul);}return section;}
function planCostText(kind){
 const premium=kind==='adaptation'||$('planModel').value==='gpt-6.1-sol',a=accountState;
 if(!a)return '正在读取创作额度…';
 if(a.unlimited)return '管理员：已接入规划功能不限积分。';
 if(!a.user&&a.guest_full_trial)return '可使用首次免登录完整试用；失败不计次数。';
 if(!a.user&&a.guest_remaining>0&&!premium)return '可使用剩余基础免费试用；失败不计次数。';
 return (!a.user?'需注册 / 登录继续；':'')+'本次 '+(premium?'15 积分 · 需 VIP':'5 积分')+'，失败退回。';
}
function syncPlanEditor(){
 if(planIdentity!==storageIdentity){planIdentity=storageIdentity;planCurrent=null;planDesired=null;planPending=null;planLoading=false;planMutation=false;planSourceUploading=false;planCommentDrafts=new Map();linkedDirty.clear();linkedDrafts.clear();planListRun++;planOpenRun++;clearTimeout(planPollTimer);$('planList').replaceChildren();$('planDetail').replaceChildren();$('unifiedPlanDetail').replaceChildren();for(const id of ['planRequest','seriesQuestions'])$(id).value='';restorePlanSource();planMessage('');}
 const link=state.planLink;$('planEditorLink').hidden=!link;
 if(link){$('planEditorLabel').textContent=link.title+' · '+link.platform;$('savePlanDraft').disabled=busy||planMutation||link.platform!==state.brief.platform;$('planEditorStatus').textContent=link.platform!==state.brief.platform?'平台已切换，请从计划进入对应平台版本。':'编辑后请点击「保存回计划」。';}
 if(document.body.dataset.view==='plans')renderPlanCreate();
}
function renderPlanCreate(){
 const o=currentOption(),b=state.brief,title=o?.title||b.originalTitle||b.creativeTheme||b.topic;
 $('planSourceSummary').textContent=($('planSourceText').value.trim()||planSourceImage)?'将使用下方新素材，当前编辑稿保留。':title?'当前素材：'+title.slice(0,150)+(b.creatorProfile&&Object.values(b.creatorProfile).some(Boolean)?' · 沿用本篇表达档案':' · 未应用表达档案'):'粘贴原文或上传图片，直接开始。';
 $('planModeDescription').textContent=planMode==='series'?'从已有内容延展三集，分别维护两平台的创作状态与反馈。':'一份素材设计两平台版本。共同事实经确认同步，各自保留目标、人群、风格与手动修改。';
 $('planPlatformNotes').hidden=typeof isMultiCreation==='function'?!isMultiCreation():true;
 $('planCost').textContent=planCostText(planMode)+' 评论分析单独计费，确认与状态更新免费。';
 $('createContentPlan').textContent=planMode==='series'?'从当前帖子生成三集计划':'生成小红书与抖音两个版本';
 $('createContentPlan').disabled=!!planPending||planLoading||busy||planMutation;
 $('planModel').disabled=$('planRequest').disabled=!!planPending||planLoading;for(const id of ['planSourceText','planSourceFile','planSourceRemoveImage','planUseEditor'])$(id).disabled=!!planPending||planLoading||planSourceUploading;$('createContentPlan').disabled ||= planSourceUploading;$('seriesQuestions').disabled=$('useSeriesQuestions').disabled=!!planPending||planLoading;
 for(const id of ['planXhsNotes','planDouyinNotes'])$(id).disabled=!!planPending||planLoading;
 if($('planFeedbackSubmit'))$('planFeedbackSubmit').disabled=!!planPending||planLoading||busy||planMutation||planCurrent?.data.episodes?.every(e=>e.status==='published');
 if($('planFeedbackCost'))$('planFeedbackCost').textContent='当前模型：'+$('planModel').value+'；'+planCostText('feedback');if(typeof syncUnifiedCreation==='function')syncUnifiedCreation();
 for(const [id,kind] of [['seriesPlanTab','series'],['adaptPlanTab','adaptation']]){$(id).classList.toggle('selected',kind===planMode);$(id).setAttribute('aria-selected',String(kind===planMode));$(id).tabIndex=kind===planMode?0:-1;}
 $('planCreate').setAttribute('role','tabpanel');$('planCreate').setAttribute('aria-labelledby',planMode==='series'?'seriesPlanTab':'adaptPlanTab');
}
async function loadPlans(){
 syncPlanEditor();if(planCurrent)renderContentPlan();const identity=storageIdentity,run=++planListRun;
 try{const data=await api('/api/plans');if(identity!==storageIdentity||run!==planListRun)return;
  if(document.body.dataset.view==='plans'&&!data.plans.some(p=>p.kind==='series')&&!planPending&&typeof ensureDemoSeries==='function'){const demo=await ensureDemoSeries();if(identity!==storageIdentity||run!==planListRun)return;if(demo){data.plans.unshift({id:demo.id,title:demo.title,kind:demo.kind,revision:demo.revision,updated:demo.updated});planCurrent=demo;planDesired=demo.id;}}
  const seriesPlans=data.plans.filter(p=>p.kind==='series');$('planList').replaceChildren(...seriesPlans.map(p=>{const b=planButton(p.title,()=>openContentPlan(p.id),'subtle');b.classList.add('plan-list-item');b.setAttribute('aria-current',p.id===planCurrent?.id?'true':'false');b.append(node('small','',p.kind==='series'?'三集连载':'小红书 × 抖音'));return b;}));
  if(!seriesPlans.length)$('planList').append(node('p','plan-note','还没有计划。从上方生成第一份，或回编辑器准备原稿。'));
  if(!planPending){let local;try{local=JSON.parse(localStorage.getItem(planKey())||'null');}catch{}
   const running=data.jobs.find(j=>j.status==='running');planPending=local||(running?{id:running.id}:null);if(planPending)pollPlanJob();}
  const desired=document.body.dataset.view==='plans'?(planCurrent?.kind==='series'?planCurrent.id:seriesPlans[0]?.id):(state.linkedPlanId||(planCurrent?.kind==='adaptation'?planCurrent.id:null));if(desired)await openContentPlan(desired,false,false);
  renderPlanCreate();
 }catch(error){if(identity===storageIdentity)planMessage(error.message,error);}
}
async function openContentPlan(id,refreshList=true,navigate=true){
 if(planCurrent&&id!==planCurrent.id&&linkedDirty.size){if(!confirm('两平台有未保存修改，切换将放弃它们。继续吗？'))return;linkedDirty.clear();linkedDrafts.clear();}
 const identity=storageIdentity,run=++planOpenRun;planDesired=id;
 try{const p=await api('/api/plans/'+id);if(identity!==storageIdentity||run!==planOpenRun)return;planCurrent=p;await refreshLinkedCopies(p);if(identity!==storageIdentity||run!==planOpenRun)return;if(navigate&&typeof displayPlanDestination==='function')displayPlanDestination(p);renderContentPlan();if(refreshList)await loadPlans();}
 catch(error){if(identity===storageIdentity)planMessage(error.message,error);}
}
async function startPlanTask(kind,extra={}){
 if(planPending||planLoading||busy)return;
 const identity=storageIdentity;planLoading=true;renderPlanCreate();planMessage('正在提交，原稿和已有计划会保留…');
 try{
  readForm();const unified=kind==='adaptation',payload={task:kind,model:unified?$('modelSelect').value:$('planModel').value,request:unified?state.brief.additionalPrompt:[$('planRequest').value,$('seriesQuestions').value.trim()?'作者提供的读者追问（待核对，非平台自动采集）：'+$('seriesQuestions').value:''].filter(Boolean).join('\n'),...extra};
  if(kind!=='feedback'){payload.state=JSON.parse(JSON.stringify(state));if(unified){payload.state.result=null;if(!payload.state.brief.originalBody&&!payload.state.brief.topic&&payload.state.brief.creativeTheme)payload.state.brief.topic=payload.state.brief.creativeTheme;}if(!extra.from_plan&&!unified){const text=$('planSourceText').value.trim();if(text||planSourceImage){payload.state={brief:{...state.brief,mode:'optimize',topic:'',creativeTheme:'',originalTitle:'',originalBody:text,image:planSourceImage},result:null,selected:0};}}}
  if(kind==='series'){payload.expansion_strategy=$('seriesStrategy').value;payload.reader_questions=$('seriesQuestions').value.trim();}
  if(kind==='adaptation')payload.platform_notes={'小红书':$('planXhsNotes').value,'抖音图文':$('planDouyinNotes').value};
  const job=await api('/api/plans/generate',payload);if(identity!==storageIdentity)return;
  planPending={id:job.id,kind};localStorage.setItem(planKey(),JSON.stringify(planPending));pollPlanJob();
 }catch(error){if(identity===storageIdentity)planMessage(error.message,error);}
 finally{if(identity===storageIdentity){planLoading=false;renderPlanCreate();}}
}
async function pollPlanJob(){
 clearTimeout(planPollTimer);const pending=planPending,identity=storageIdentity;if(!pending)return;
 try{const job=await api('/api/jobs/'+pending.id);if(identity!==storageIdentity||planPending!==pending)return;
  if(job.status==='running'){planMessage('正在设计计划与可核对依据，可离开本页，回来后继续查看。');planPollTimer=setTimeout(pollPlanJob,1800);return;}
  if(job.status==='completed'){if(job.result.kind==='adaptation'){state.linkedPlanId=job.result.plan_id;state.linkedCopyRevision={id:job.result.plan_id,revision:0};await save();}const originView=document.body.dataset.view;planMessage(job.result.kind==='feedback'?'评论分析已保存为草案；请核对原句并勾选确认后再更新计划。':'已保存内容计划，选择一集或平台版本进入编辑器。');await openContentPlan(job.result.plan_id,true,originView===(job.result.kind==='adaptation'?'workbench':'plans'));if(identity!==storageIdentity||planPending!==pending)return;notifyPlanComplete(job.result);}
  else planMessage(job.error||'生成未完成，原内容保留，可重试。');
  if(identity!==storageIdentity||planPending!==pending)return;planPending=null;localStorage.removeItem(planKey());
  if(typeof refreshAccount==='function')await refreshAccount();renderPlanCreate();
 }catch(error){if(identity!==storageIdentity)return;planMessage(error.message+' 稍后自动检查任务。',error);planPollTimer=setTimeout(pollPlanJob,4000);}
}
async function planUpdate(payload){
 if(!planCurrent||planMutation)return;const identity=storageIdentity,target=planCurrent.id;planMutation=true;renderPlanCreate();
 try{const p=await api('/api/plans/update',{id:planCurrent.id,revision:planCurrent.revision,...payload});if(identity!==storageIdentity||planDesired!==target)return;planCurrent=p;await refreshLinkedCopies(p,{force:true});renderContentPlan();if(state.linkedPlanId===p.id)await save();return true;}
 catch(error){if(identity===storageIdentity)planMessage(error.message,error);return false;}
 finally{if(identity===storageIdentity){planMutation=false;renderPlanCreate();}}
}
function renderContentPlan(){
 const plan=planCurrent;if(!plan)return;const root=plan.kind==='adaptation'?$('unifiedPlanDetail'):$('planDetail'),signature=JSON.stringify([storageIdentity,plan.id,plan.revision,plan.proposals.map(p=>[p.id,p.status])]);
 if(plan.kind==='adaptation'&&typeof syncUnifiedCreation==='function')syncUnifiedCreation();if(root.dataset.planSignature===signature&&root.children.length)return;
 root.dataset.planSignature=signature;if(plan.kind==='series'&&$('planCreateOptions').dataset.plan!==plan.id){$('planCreateOptions').open=!!plan.data.demo;$('planCreateOptions').dataset.plan=plan.id;}const head=node('section','panel plan-detail-heading');
 head.append(node('small','eyebrow',plan.kind==='series'?'三集连载':'跨平台联创'),node('h2','',plan.title),node('p','plan-note','版本 '+plan.revision+' · '+new Date(plan.updated*1000).toLocaleString('zh-CN')));
 const source=node('details','plan-source');source.append(node('summary','','查看原稿与表达档案状态'),node('h3','',plan.data.source.title),node('p','plan-source-text',plan.data.source.body),node('p','plan-note',Object.values(plan.data.source.profile).some(Boolean)?'已保存原帖主动应用的表达档案快照，后续编辑沿用。':'原帖未应用表达档案。可在编辑器应用后继续创作。'));
 if(plan.data.source.image){const image=node('img','plan-source-image');image.src=plan.data.source.image;image.alt='本计划的原始图片素材';source.append(image);}if(plan.data.request)source.append(planParagraph('本次要求',plan.data.request));for(const [platform,note]of Object.entries(plan.data.platform_notes||{}))if(note)source.append(planParagraph(platform+'作者观察与要求',note));
 head.append(source);root.replaceChildren(head);
 if(plan.kind==='series')head.append(planParagraph('连载主线',plan.data.throughline));
 if(plan.data.source_analysis){const a=plan.data.source_analysis,section=node('section','panel source-analysis');section.append(node('h3','','从原帖沿用什么'));for(const o of a.observations){if(o.quote)section.append(node('blockquote','',o.quote));section.append(planParagraph('观察',o.observation),planParagraph('表达假设 · 待验证',o.hypothesis));}section.append(planListBlock('可复用元素',a.reusable_elements),planListBlock('证据缺口',a.unknowns));root.append(section);}
 if(plan.data.demo)head.append(node('p','plan-warning','预设演示 · 未发布；再次打开恢复已保存进度。'));
 if(plan.data.parent){const back=planButton('查看关联的双平台原稿',()=>openContentPlan(plan.data.parent));head.append(back);}
 if(plan.kind==='adaptation'){renderLinkedEditing(root,plan);renderLinkedPopularity(root,plan);}
 if(plan.kind==='adaptation'){
  const previews=node('details','panel plan-preview-section');previews.open=!!plan.data.demo;previews.append(node('summary','','查看两平台界面预览'),node('p','plan-note','使用对应平台的模拟界面；已保存编辑稿优先显示，未保存的编辑不会同步到这里。'));
  const grid=node('div','plan-platform-previews');
  for(const v of plan.data.versions){const draft=v.drafts[v.platform],saved=draft?.state,option=saved?.result?.options?.[saved.selected||0]||{...v,cover:{headline:v.cover_headline||v.title,subtitle:v.cover_subtitle||''}},canvas=newCover(),article=node('article');
   article.append(node('h4','',v.platform),phone(option,v.platform,canvas));if(plan.data.demo)appendFullCopy(article,option);grid.append(article);
   renderCover(canvas,option,{platform:v.platform,image:(plan.data.images||[plan.data.source.image])[v.image_order?.[0]??0]??saved?.brief.image??plan.data.source.image}).catch(()=>{});
  }
  previews.append(grid);root.append(previews);
 }
 for(const item of plan.data.episodes||[]){
  const article=node('article','panel plan-episode'),heading=node('div','plan-episode-heading');
  heading.append(node('span','plan-number',plan.kind==='series'?'第 '+item.number+' 集':item.platform),node('strong','plan-state',PLAN_STATUS[item.status]));
  article.append(heading,node('h3','',item.title));
  if(plan.kind==='series')article.append(planParagraph('解决的问题',item.problem),planListBlock('这一集新增什么',item.new_content),planListBlock('还缺哪些素材',item.missing_materials));
  else{
   article.append(planParagraph('切入点',item.angle),planParagraph('目标 / 人群 / 风格',item.goal+' / '+item.audience+' / '+item.tone),node('p','plan-source-text',item.body),node('p','plan-tags',item.tags.map(t=>'#'+t).join(' ')),planParagraph('视觉设计建议',item.visual),planListBlock('相对原稿的改动',item.changes),planListBlock('还缺哪些素材',item.missing_materials));
  }
  const explanation=node('details','plan-explanation');explanation.append(node('summary','','为什么这样安排'),planParagraph('设计依据（模型推测）',item.reason));
  if(item.outline)explanation.append(planListBlock('创作提纲',item.outline));
  if(item.feedback_reason){explanation.append(planParagraph('作者已确认的评论调整',item.feedback_reason));for(const quote of item.feedback_evidence||[])explanation.append(node('blockquote','',quote));}
  if(item.extension){const x=item.extension,extension=node('section','series-extension');extension.append(node('span','extension-distance',x.distance),planListBlock('沿用',x.keep),planListBlock('改变',x.change),planParagraph('与原帖的区别',x.difference),planListBlock('标题备选',x.title_candidates));if(item.feedback_reason||Object.values(item.platforms||{}).some(v=>v.feedback_reason))extension.append(node('p','plan-note','以上为最初扩展依据；当前计划已按反馈更新，以各平台确认内容为准。'));article.append(extension);}
  article.append(explanation);
  if(item.needs_refresh)article.append(node('p','plan-warning','计划已按评论更新，已存草稿仍是旧版。进入编辑器核对要求并重新生成或修改，再保存回计划。'));
  const actions=node('div','plan-actions');
  renderSeriesVersions(article,item);
  root.append(article);
 }
 const repeat=node('details','panel plan-repetition');repeat.append(node('summary','','重复检查'));
 for(const m of plan.repetition.matches)repeat.append(node('p','plan-warning',m.a+' ↔ '+m.b+'：文字片段重合约 '+m.overlap+'%。'+m.detail));
 if(!plan.repetition.matches.length)repeat.append(node('p','','未发现明显文字重复。'));
 const method=node('details');method.append(node('summary','','查看检查范围'),node('p','plan-note',plan.repetition.method),node('p','plan-note',plan.repetition.scope));repeat.append(method);const history=plan.history_repetition;if(history){repeat.append(node('h4','','本人历史稿件重复片段'));for(const m of history.matches){const p=node('p','plan-warning',m.platform+' ↔ '+m.title+'：'+m.characters+' 字连续重复');p.append(node('blockquote','',m.quote));repeat.append(p);}repeat.append(node('p','plan-note',history.scope));}root.append(repeat);
 const reasons=node('details','panel plan-explanations');reasons.append(node('summary','','可解释设计元素'));
 for(const r of plan.data.explanations||[])reasons.append(planParagraph(r.evidence+' · '+r.action,r.observation+'；'+r.reason));root.append(reasons);
 if(plan.kind==='series')renderPlanFeedback(root,plan);
 else{const boundary=node('p','plan-note','平台适配为编辑建议；标签非实时热点。');root.append(boundary);}
}
function renderPlanFeedback(root,plan){
 const section=node('section','panel plan-feedback');section.append(node('h3','','让评论推动下一集'),node('p','','每行一条评论，去除个人信息。核对依据后确认调整。'));
 const channels=renderPlatformFeedbackInputs(section,plan);
 const button=planButton('分析两平台反馈，提出下一集调整',()=>startPlanTask('feedback',{id:plan.id,revision:plan.revision,channels:channels()}),'primary');
 button.id='planFeedbackSubmit';
 const cost=node('p','plan-note','当前模型：'+$('planModel').value+'；'+planCostText('feedback'));cost.id='planFeedbackCost';
 button.disabled=!!planPending||planLoading||plan.data.episodes.every(e=>e.status==='published');section.append(cost,button);root.append(section);
 renderFeedbackDemoComparison(section,plan);
 const proposals=plan.proposals||[];
 for(const proposal of proposals){
  const box=node('section','panel plan-proposal'),p=proposal.data,current=proposal.status==='pending'&&proposal.revision===plan.revision;
  box.append(node('h3','',proposal.status==='confirmed'?'已确认的评论调整':current?'待确认的调整草案':'旧版调整草案 · 需重新分析'),node('p','',p.summary));
  const quotes=Object.fromEntries(p.comments.map(c=>[c.id,c.text]));
  for(const group of p.groups){const block=node('div','plan-comment-group');block.append(node('strong','',(group.platform?group.platform+' · ':'')+group.category+'：'+group.need));for(const id of group.comment_ids)block.append(node('blockquote','','评论 '+id+'：'+quotes[id]));box.append(block);}
  renderReflections(box,p);
  const selected=[];
  p.updates.forEach((u,i)=>{const row=node('div','plan-update');const l=node('label','plan-confirm-choice'),check=node('input');check.type='checkbox';check.checked=current;check.disabled=!current;check.value=String(i);selected.push(check);l.append(check,document.createTextNode('更新第 '+u.episode+' 集'+(u.platform?' · '+u.platform:'')+'：'+u.problem));row.append(l,planListBlock('新增内容',u.new_content),planListBlock('缺少素材',u.missing_materials),planParagraph('调整理由',u.reason));for(const id of u.comment_ids)row.append(node('blockquote','','原评论 '+id+'：'+quotes[id]));for(const id of u.metric_ids||[]){const m=p.metrics.find(m=>m.id===id);if(m)row.append(planParagraph('指标依据',formatSeriesMetrics(m)));}box.append(row);});
  if(current&&p.updates.length)box.append(planButton('确认勾选调整，更新未发布计划',()=>{const selections=selected.filter(x=>x.checked).map(x=>Number(x.value));if(!selections.length){planMessage('请至少勾选一项调整。');return;}planUpdate({action:'confirm',proposal:proposal.id,selections});},'primary'));
  if(current&&p.groups.length)box.append(planButton('仅保存待回答问题，保留原计划',()=>planUpdate({action:'confirm',proposal:proposal.id,selections:[]}),'outline'));
  if(!p.updates.length)box.append(node('p','plan-note','这批评论没有形成可应用的后续调整，原计划保持不变。'));root.append(box);
 }
 const questions=node('section','panel plan-questions');questions.append(node('h3','','待回答问题'));
 for(const q of plan.data.questions){const l=node('label','plan-question'),check=node('input');check.type='checkbox';check.checked=q.answered;check.addEventListener('change',()=>planUpdate({action:'question',question:q.id,answered:check.checked}));l.append(check,node('span','',(q.answered?'已回答 · ':'待回答 · ')+(q.platform?q.platform+' · ':'')+q.category+'：'+q.text),node('small','','依据：'+q.quote));questions.append(l);}
 if(!plan.data.questions.length)questions.append(node('p','plan-note','确认评论调整后，相关问题会保存在这里。'));root.append(questions);
}
async function openPlanEditor(episode,platform){
 if(busy||planMutation||planPending){planMessage('请等待当前任务或保存完成。');return;}
 const identity=storageIdentity;
 if(hasCurrentContent()&&!confirm('将打开计划中的'+platform+'版本，当前编辑会先保存到历史。继续吗？'))return;
 try{const response=await api('/api/plans/editor',{id:planCurrent.id,revision:planCurrent.revision,episode,platform});if(identity!==storageIdentity)return;
  if(!await newProject())return;if(identity!==storageIdentity)return;
  state=response.state;projectId=null;applyState();remember();activateView('workbench');await save();toast('已进入现有编辑器。编辑后可保存回计划。');
 }catch(error){if(identity===storageIdentity)planMessage(error.message,error);}
}
async function saveCurrentPlanDraft(){
 const link=state.planLink;if(!link||busy||planMutation)return;const identity=storageIdentity,project=state;planMutation=true;syncPlanEditor();
 try{readForm();const snapshot=JSON.parse(JSON.stringify(state));await save();if(identity!==storageIdentity||state!==project)return;const p=await api('/api/plans/draft',{...link,id:link.id,state:snapshot});if(identity!==storageIdentity||state!==project)return;
  state.planLink.revision=p.revision;planCurrent=p;planDesired=p.id;await refreshLinkedCopies(p,{force:true});remember();await save();renderContentPlan();$('planEditorStatus').textContent='已同步到内容计划，重复提醒已更新。';toast('当前平台文案已保存回计划。');return true;
 }catch(error){if(identity===storageIdentity){$('planEditorStatus').textContent=error.message;toast(error.message,error);}return false;}
 finally{if(identity===storageIdentity){planMutation=false;$('savePlanDraft').disabled=busy;}}
}
let planSourceImage='',planSourceUploading=false;
function rememberPlanSource(){try{sessionStorage.setItem('getie.source.'+storageIdentity,JSON.stringify({text:$('planSourceText').value,image:planSourceImage}));}catch{$('planSourceStatus').textContent='本页可继续创作；刷新前请自行保留素材。';}syncPlanSource();}
function restorePlanSource(){let d={};try{d=JSON.parse(sessionStorage.getItem('getie.source.'+storageIdentity)||'{}');}catch{}if(!d||typeof d!=='object'||Array.isArray(d))d={};$('planSourceText').value=typeof d.text==='string'?d.text.slice(0,12000):'';planSourceImage=typeof d.image==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/.test(d.image)?d.image:'';syncPlanSource();}
function syncPlanSource(){$('planSourceImagePreview').hidden=!planSourceImage;$('planSourceImageThumb').src=planSourceImage||'';$('planUseEditor').hidden=!planSourceImage&&!$('planSourceText').value.trim();}
$('planSourceText').addEventListener('input',()=>{rememberPlanSource();renderPlanCreate();});
$('planSourceRemoveImage').addEventListener('click',()=>{planSourceImage='';$('planSourceFile').value='';rememberPlanSource();renderPlanCreate();});
$('planUseEditor').addEventListener('click',()=>{planSourceImage='';$('planSourceText').value='';$('planSourceFile').value='';$('planSourceStatus').textContent='';rememberPlanSource();renderPlanCreate();});
$('planSourceFile').addEventListener('change',async()=>{
 const f=$('planSourceFile').files[0],identity=storageIdentity;if(!f)return;planSourceUploading=true;renderPlanCreate();
 try{if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>12*1024*1024)throw Error('请选择12MB以内的JPG、PNG或WebP。');const image=await createImageBitmap(f);if(image.width*image.height>50000000){image.close();throw Error('图片过大，请缩小后上传。');}const k=Math.min(1,900/Math.max(image.width,image.height)),c=document.createElement('canvas');c.width=Math.round(image.width*k);c.height=Math.round(image.height*k);c.getContext('2d').drawImage(image,0,0,c.width,c.height);image.close();if(identity!==storageIdentity)return;planSourceImage=c.toDataURL('image/webp',.8);$('planSourceStatus').textContent='图片已加入本次素材。';rememberPlanSource();}
 catch(e){if(identity===storageIdentity)$('planSourceStatus').textContent=/[\u4e00-\u9fff]/.test(e.message)?e.message:'图片无法读取，请更换JPG、PNG或WebP。';}
 finally{if(identity===storageIdentity){planSourceUploading=false;renderPlanCreate();}$('planSourceFile').value='';}
});
$('seriesPlanTab').addEventListener('click',()=>{planMode='series';renderPlanCreate();});
$('adaptPlanTab').addEventListener('click',()=>activateView('workbench'));
for(const id of ['seriesPlanTab','adaptPlanTab'])$(id).addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();planMode=event.key==='Home'?'series':event.key==='End'?'adaptation':planMode==='series'?'adaptation':'series';renderPlanCreate();$(planMode==='series'?'seriesPlanTab':'adaptPlanTab').focus();});
$('planModel').addEventListener('change',renderPlanCreate);
$('createContentPlan').addEventListener('click',()=>startPlanTask(planMode));
$('refreshPlans').addEventListener('click',loadPlans);
$('savePlanDraft').addEventListener('click',saveCurrentPlanDraft);
$('backToPlan').addEventListener('click',()=>{activateView('plans');if(state.planLink)openContentPlan(state.planLink.id);});
if(location.hash==='#plans')activateView('plans');

function notifyPlanComplete(result){
 const label=result.kind==='feedback'?'反馈分析已完成':result.kind==='series'?'三集计划已生成':'两平台内容已生成';toast(label+'。');clearTimeout(toastTimer);const button=node('button','toast-action','查看结果');button.type='button';button.addEventListener('click',()=>{activateView(result.kind==='adaptation'?'workbench':'plans');openContentPlan(result.plan_id);$('toast').hidden=true;});$('toast').append(button);toastTimer=setTimeout(()=>$('toast').hidden=true,15000);
}
