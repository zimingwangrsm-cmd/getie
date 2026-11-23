'use strict';
let creatorProfileRevision=0,creatorProfileIdentity=null,profilePending=false,auditRun=0,auditTimer,currentDesignAudit=null,decisionState=null;
const PROFILE_FIELDS={name:'profileName',voice:'profileVoice',audience:'profileAudience',facts:'profileFacts',avoid:'profileAvoid'};
function profileSnapshot(){return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([key,id])=>[key,$(id).value.trim()]));}
function syncCreativeTools(){
 if(typeof syncInsightState==='function')syncInsightState();
 if(typeof syncPlanEditor==='function')syncPlanEditor();
 const p=state.brief.creatorProfile;$('appliedProfileStatus').textContent=p?'本篇已应用「'+(p.name||'我的表达档案')+'」快照；档案后续修改不会自动改写本篇。':'保存你的语气、长期人群和事实边界，需要时带入当前创作。';$('detachCreatorProfile').hidden=!p;$('openCreatorProfile').disabled=busy;$('detachCreatorProfile').disabled=busy;
 if(decisionState!==state){decisionState=state;fillDecision();}
 if(state.result&&currentDesignAudit)invalidateDesignAudit();
}
function fillDecision(){
 const d=state.decision||{};$('decisionSelected').value=d.selected||'undecided';$('decisionReason').value=d.reason||'';$('decisionHypothesis').value=d.hypothesis||'';$('decisionMetric').value=d.metric||'collects';$('decisionWindow').value=String(d.window||24);
 $('decisionSaveStatus').textContent=d.saved_at?'已保存选稿记录；更新检查后可确认与当前作品是否一致。':'选稿记录保存在当前项目中。';
}
async function openCreatorProfile(){
 if(busy)return;const identity=storageIdentity;creatorProfileIdentity=null;$('creatorProfileStatus').textContent='正在读取私有表达档案…';$('creatorProfileDialog').showModal();
 $('saveCreatorProfile').disabled=$('applyCreatorProfile').disabled=true;
 try{const response=await api('/api/creator-profile');if(identity!==storageIdentity)throw new Error('账号已变化，请关闭后重新打开。');creatorProfileRevision=response.revision;creatorProfileIdentity=identity;for(const [key,id]of Object.entries(PROFILE_FIELDS))$(id).value=response.profile[key]||'';$('creatorProfileStatus').textContent=response.revision?'档案版本 '+response.revision+'；保存为本人声明，不视为第三方核实。':'尚未保存档案。游客档案随当前浏览器身份保存。';$('saveCreatorProfile').disabled=$('applyCreatorProfile').disabled=false;}catch(error){$('creatorProfileStatus').textContent=error.message;}
}
async function saveCreatorProfile(apply){
 if(profilePending||busy)return;if(creatorProfileIdentity!==storageIdentity){$('creatorProfileStatus').textContent='账号已变化，请重新打开档案。';return;}
 const profile=profileSnapshot(),identity=storageIdentity,project=state;
 if(!Object.values(profile).some(Boolean)){$('creatorProfileStatus').textContent='先填写一项表达习惯、事实或边界。';return;}
 profilePending=true;$('saveCreatorProfile').disabled=$('applyCreatorProfile').disabled=true;
 try{
  const response=await api('/api/creator-profile',{profile,revision:creatorProfileRevision});if(identity!==storageIdentity)throw new Error('账号已变化，请重新打开。');creatorProfileRevision=response.revision;
  if(apply){if(state!==project)throw new Error('档案已保存；当前项目已切换，请重新打开档案后应用。');state.brief.creatorProfile=structuredClone(response.profile);scheduleSave();syncCreativeTools();$('creatorProfileDialog').close();if(state.result)$('resultBadge').textContent='表达档案已更新 · 重新生成可应用';toast('已应用表达档案快照；生成时将遵守本篇配置与事实边界。');}
  else $('creatorProfileStatus').textContent='已保存版本 '+response.revision+'。当前项目快照保持不变。';
 }catch(error){$('creatorProfileStatus').textContent=error.message;}
 finally{profilePending=false;$('saveCreatorProfile').disabled=$('applyCreatorProfile').disabled=false;}
}
$('openCreatorProfile').addEventListener('click',openCreatorProfile);$('closeCreatorProfile').addEventListener('click',()=>$('creatorProfileDialog').close());
$('saveCreatorProfile').addEventListener('click',()=>saveCreatorProfile(false));$('applyCreatorProfile').addEventListener('click',()=>saveCreatorProfile(true));
$('detachCreatorProfile').addEventListener('click',()=>{if(busy)return;delete state.brief.creatorProfile;scheduleSave();syncCreativeTools();toast('本篇已移除表达档案；保存的档案仍可再次使用。');});
function invalidateDesignAudit(){
 auditRun++;currentDesignAudit=null;for(const id of ['designAuditChecks','designDifferenceList','designFeatureList'])$(id).hidden=true;$('designAuditStatus').textContent='作品或配置已修改，请更新检查后再保存选稿记录。';if(state.decision)$('decisionSaveStatus').textContent='已有记录可能对应旧版本，请更新检查并重新确认。';
}
function refreshDesignAudit(){clearTimeout(auditTimer);auditTimer=setTimeout(runDesignAudit,180);}
async function runDesignAudit(){
 if(!state.result)return;readForm();const run=++auditRun,identity=storageIdentity,snapshot=JSON.stringify(state);$('designAuditStatus').textContent='正在核对方向与生成配置…';
 try{const audit=await api('/api/design-audit',{state:JSON.parse(snapshot)});if(run!==auditRun||identity!==storageIdentity||snapshot!==JSON.stringify(state))return;
  currentDesignAudit=audit;renderDesignAudit(audit);
 }catch(error){if(run===auditRun){currentDesignAudit=null;$('designAuditStatus').textContent=error.message;}}
}
function renderDesignAudit(audit){
 for(const id of ['designAuditChecks','designDifferenceList','designFeatureList'])$(id).hidden=false;
 $('designAuditStatus').textContent=audit.fresh===false?'输入已变化：当前结果属于之前的生成配置。':audit.fresh===null?'旧作品未记录生成指纹，仍可保存选稿理由。':'输入与生成时一致。';
 $('designAuditChecks').replaceChildren(...audit.checks.map(c=>{const row=node('details','audit-check audit-'+c.status);const summary=node('summary');summary.append(node('span','',c.status==='pass'?'已核对':c.status==='fail'?'需更新':'待验证'),document.createTextNode(c.label));row.append(summary,node('p','',c.detail));return row;}));
 $('designDifferenceList').replaceChildren(...audit.differences.map(d=>{const block=node('div','design-difference');block.append(node('strong','','改变的维度：'+d.label),node('p','','A · '+d.a),node('p','','B · '+d.b));return block;}));
 if(!audit.differences.length)$('designDifferenceList').append(node('p','audit-note','当前没有显式的单维度差异；可以记录本次单方案选择。'));
 $('designFeatureList').replaceChildren(...audit.features.map(f=>{const row=node('p','design-feature');row.append(node('strong','','方案 '+f.label),node('span','',f.title_chars+' 字标题 · '+f.body_chars+' 字正文 · '+f.tags.length+' 个标签'));return row;}));
 $('decisionSelected').querySelector('[value="B"]').disabled=audit.features.length<2;
 if(audit.features.length<2&&$('decisionSelected').value==='B')$('decisionSelected').value='undecided';
 if(state.decision)$('decisionSaveStatus').textContent=audit.decision_current?'选稿记录与当前作品一致。':'作品或配置与记录时不同，请重新确认选择。';
}
$('refreshDesignAudit').addEventListener('click',()=>{runDesignAudit();refreshIntentResults();});
$('saveDesignDecision').addEventListener('click',async()=>{
 if(busy)return;readForm();await runDesignAudit();if(!currentDesignAudit){toast('请完成当前作品检查后再保存。');return;}
 const d={selected:$('decisionSelected').value,reason:$('decisionReason').value.trim(),hypothesis:$('decisionHypothesis').value.trim(),metric:$('decisionMetric').value,window:Number($('decisionWindow').value),signature:currentDesignAudit.signature,saved_at:new Date().toISOString()};
 if(d.selected!=='undecided'&&!d.reason){$('decisionSaveStatus').textContent='请简要写下选这一版的理由。';$('decisionReason').focus();return;}
 const identity=storageIdentity,project=state,previous=state.decision;state.decision=d;
 try{await save(true,'选稿决策 · '+d.selected);if(identity!==storageIdentity||state!==project)return;$('decisionSaveStatus').textContent='已保存选稿理由与验证计划，修改作品后需重新确认。';await runDesignAudit();toast('选稿记录已保存到当前项目版本。');}catch(error){if(state===project)state.decision=previous;$('decisionSaveStatus').textContent=error.message;}
});
$('exportDesignReport').addEventListener('click',async()=>{
 if(busy)return;readForm();const identity=storageIdentity,snapshot=JSON.stringify(state);
 try{const result=await api('/api/design-report',{state:JSON.parse(snapshot)});if(identity!==storageIdentity||snapshot!==JSON.stringify(state))throw new Error('作品已变化，请重新导出。');
  const blob=new Blob([result.markdown],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=node('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('已导出当前作品和已保存选稿记录，不含完整表达档案。');
 }catch(error){toast(error.message,error);}
});
$('decisionReview').addEventListener('click',()=>activateView('feedback'));
window.addEventListener('storage',event=>{if(event.key==='resonance.auth.changed'){$('creatorProfileDialog').close();creatorProfileIdentity=null;currentDesignAudit=null;auditRun++;}});
syncCreativeTools();if(state.result)refreshDesignAudit();
