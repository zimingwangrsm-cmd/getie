'use strict';
// One input workflow. Platforms affect output count, never the source material.
function creationPlatforms(){return Array.from(document.querySelectorAll('[name=creationPlatform]:checked'),e=>e.value);}
function isMultiCreation(){return creationPlatforms().length===2;}
function placePlanStatus(){const target=(planPending?.kind==='adaptation'||document.body.dataset.view==='workbench')?$('unifiedPlanStatus'):$('planCreateOptions');if(target&&!target.contains($('planTaskStatus'))){if(target.id==='unifiedPlanStatus')target.append($('planTaskStatus'));else target.after($('planTaskStatus'));}}
function syncUnifiedCreation(){
 const platforms=creationPlatforms(),multi=platforms.length===2;
 document.body.classList.toggle('multi-creation',multi);
 $('creationPlatformStatus').textContent=multi?'两平台一起生成，表达分别编辑':'为'+(platforms[0]||'小红书')+'生成';
 $('planPlatformNotes').hidden=!multi;
 $('unifiedPlanDetail').hidden=!multi||planCurrent?.kind!=='adaptation';
 const locked=busy||!!planPending||planLoading||planMutation||exampleLoading;
 for(const e of document.querySelectorAll('[name=creationPlatform]'))e.disabled=locked;
 if(multi){$('generationSummary').textContent='小红书 + 抖音 · 两个独立版本 · 共同事实可联动';if(!locked)$('generateBtn').firstElementChild.textContent='生成两平台内容';$('generationCost').textContent=planCostText('adaptation');}
 $('generateBtn').disabled=locked||exampleLoading;
 placePlanStatus();
}
async function generateUnified(){
 if(busy||planPending||planLoading||planMutation||exampleLoading)return;
 if(linkedDirty.size){showError('请先保存当前两平台的修改，再生成新版本。');return;}
 readForm();const b=state.brief,hasText=b.mode==='optimize'?(b.originalTitle.trim()||b.originalBody.trim()):(b.topic.trim()||b.creativeTheme.trim());
 if(!hasText&&!b.image){showError('上传图片，或填写主题 / 已有正文后再生成。');return;}
 showError('');await startPlanTask('adaptation');syncUnifiedCreation();
}
function displayPlanDestination(plan){
 const destination=plan.kind==='series'?'plans':'workbench';
 if(plan.kind==='adaptation'){
  state.brief.creationPlatforms=[...LINK_PLATFORMS];for(const e of document.querySelectorAll('[name=creationPlatform]'))e.checked=true;
  document.body.classList.add('multi-creation');$('unifiedPlanDetail').hidden=false;
 }
 // A refresh must not steal focus from a different page.
 if(document.body.dataset.view==='plans'||document.body.dataset.view==='workbench'){if(document.body.dataset.view!==destination){document.body.dataset.view=destination;for(const [id,key]of [['plansView','plans'],['workbenchView','workbench']])$(id).hidden=key!==destination;location.hash='#'+destination;}}
 syncUnifiedCreation();
}
function renderLinkedPopularity(root,plan){
 const source=plan.data.source;
 if(source.input_mode!=='optimize'||!(source.title?.trim()||source.body?.trim()))return;
 const section=node('section','panel linked-popularity'),target=node('div');section.append(target);root.append(section);
 const version=plan.data.versions.find(v=>v.platform==='小红书');if(!version){section.remove();return;}
 if(linkedDirty.has('小红书')){target.append(node('p','prediction-unavailable','文案已改动，保存小红书版本后重新评估。'));return;}
 const current=linkedCurrent(version);
 predictionGraphic([{title:source.title,body:source.body,tags:source.tags||[]},current],target,'小红书',()=>target.isConnected&&planCurrent?.id===plan.id&&planCurrent?.revision===plan.revision&&!linkedDirty.has('小红书'),[plan.data.demo?'演示初稿':'原稿','小红书候选稿'],'original');
}
function invalidateLinkedPopularity(platform){if(platform==='小红书')document.querySelectorAll('.linked-popularity').forEach(section=>section.replaceChildren(node('p','prediction-unavailable','文案已改动，保存小红书版本后重新评估。')));}
async function startSeriesFromExample(example){
 if(planPending||busy||exampleLoading){toast('请等待当前任务完成。');return;}
 if(!await applyStarterExample(example))return;
 planMode='series';planSourceImage='';$('planSourceText').value='';rememberPlanSource();
 activateView('plans');$('planCreateOptions').open=true;$('planCreateOptions').scrollIntoView({block:'start'});
 $('planRequest').value='从这篇已有帖子延展三个不重复的后续主题。';
}
// Controls persist with each project; switching count does not wipe manual drafts.
for(const element of document.querySelectorAll('[name=creationPlatform]'))element.addEventListener('change',async()=>{
 if(exampleLoading||planLoading||planMutation||planPending||busy){restoreCreationPlatforms();return;}
 if(linkedDirty.size){element.checked=!element.checked;toast('请先保存两平台修改。');return;}if(!creationPlatforms().length){element.checked=true;toast('至少选择一个平台。');return;}
 const platforms=creationPlatforms(),previous=state.brief.creationPlatforms||[state.brief.platform];
 if(planCurrent?.kind==='adaptation'&&state.linkedPlanId===planCurrent.id){
  if(previous.length===1&&platforms.length===2&&state.result){state.planLink={id:planCurrent.id,revision:planCurrent.revision,platform:state.brief.platform,episode:null,title:planCurrent.title};if(!await saveCurrentPlanDraft()){restoreCreationPlatforms();return;}}
  if(previous.length===2&&platforms.length===1)await refreshLinkedCopies(planCurrent,{force:true});
 }
 state.brief.creationPlatforms=platforms;
 if(platforms.length===1&&state.brief.platform!==platforms[0]){await changePlatform(platforms[0]);state.brief.creationPlatforms=platforms;}
 for(const e of document.querySelectorAll('[name=creationPlatform]'))e.checked=platforms.includes(e.value);
 updateComparisonControls();syncUnifiedCreation();scheduleSave();
});
function restoreCreationPlatforms(){
 const selected=state.brief.creationPlatforms||[state.brief.platform];
 for(const element of document.querySelectorAll('[name=creationPlatform]'))element.checked=selected.includes(element.value);
 if(!creationPlatforms().length)document.querySelector('[name=creationPlatform]').checked=true;
 syncUnifiedCreation();
}
// Keep the single editor and both platform copies on the same confirmed plan.
async function refreshLinkedCopies(plan,{force=false}={}){
 if(plan.kind!=='adaptation'||state.linkedPlanId!==plan.id)return;
 const project=state,identity=storageIdentity,revision=state.linkedCopyRevision;
 const draftSnapshot=JSON.stringify([state.brief,state.result,state.selected]);
 if(!force&&revision?.id===plan.id&&revision.revision===plan.revision)return;
 const active=state.brief.platform,platforms=state.brief.creationPlatforms||[active];
 const changed=force||!!revision&&revision.id===plan.id&&revision.revision!==plan.revision;
 const copies=await Promise.all(plan.data.versions.filter(v=>v.status!=='published'&&(changed||!(v.platform===active?Object.hasOwn(state,'result'):state.platformDrafts?.[v.platform]))).map(async v=>[v.platform,(await api('/api/plans/editor',{id:plan.id,revision:plan.revision,platform:v.platform,source_input:true})).state]));
 if(identity!==storageIdentity||state!==project||planDesired!==plan.id||planCurrent?.revision!==plan.revision||draftSnapshot!==JSON.stringify([state.brief,state.result,state.selected]))return;
 state.platformDrafts=state.platformDrafts||{};
 for(const [platform,copy]of copies){copy.brief={...initialBrief(),...copy.brief,creationPlatforms:[...platforms],platformNotes:structuredClone(plan.data.platform_notes||{})};copy.linkedPlanId=plan.id;
  if(platform===active){Object.assign(state,copy);}else state.platformDrafts[platform]=Object.fromEntries(['brief','result','selected','sourceBrief','planLink'].map(k=>[k,structuredClone(copy[k])]));
 }
 state.linkedCopyRevision={id:plan.id,revision:plan.revision};
 if(copies.length)applyState();remember();
}
for(const id of ['planXhsNotes','planDouyinNotes'])$(id).addEventListener('input',scheduleSave);
const notes=$('planPlatformNotes');$('directionTitle').closest('.direction-panel').append(notes);
$('useSeriesQuestions').addEventListener('click',()=>{if(typeof seriesInputRevision!=='undefined')seriesInputRevision++;$('seriesQuestions').value='UP什么时候出个不自驾的罗卡角路线？\n能不能讲讲日落拍照机位和返程安排？';$('planSourceStatus').textContent='已填入可编辑的示例追问，非真实采集评论。';});
restoreCreationPlatforms();
