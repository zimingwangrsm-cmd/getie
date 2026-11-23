'use strict';
let inspirationRun=0,diagnosticRun=0,diagnosticReport=null,diagnosticSnapshot=null,diagnosticContext='current',insightIdentity=null,inspirationLoaded=false;

function diagnosticViewKey(){
 return JSON.stringify({brief:state.brief,options:state.result?.options||[],adjust:state.adjust,target:$('diagnosticTarget').value,plan:typeof planCurrent!=='undefined'&&planCurrent?.kind==='adaptation'?[planCurrent.id,planCurrent.revision]:null});
}
function syncInsightState(){
 const switched=insightIdentity!==storageIdentity;
 if(switched){insightIdentity=storageIdentity;diagnosticRun++;$('runDiagnostic').disabled=busy;diagnosticReport=null;diagnosticSnapshot=null;$('diagnosticReport').replaceChildren();$('diagnosticReport').hidden=true;$('diagnosticHistory').replaceChildren();$('diagnosticStatus').textContent='';}
 syncDiagnosticTargets();const count=state.result?.options?.length||0;
 $('diagnosticInputStatus').textContent='当前：'+(state.brief.platform||'小红书')+' · '+(state.brief.mode==='optimize'&&(state.brief.originalTitle?.trim()||state.brief.originalBody?.trim())?'已有原文':'主题 / 素材输入')+(count?' + '+count+' 套方案':' · 尚未生成方案');
 if($('diagnosticTarget').value!=='editor')$('diagnosticInputStatus').textContent='当前：'+$('diagnosticTarget').value+' · 已保存的联创版本';
 $('runDiagnostic').disabled=busy;
 if(diagnosticReport&&diagnosticContext==='current'&&diagnosticSnapshot!==diagnosticViewKey()){
  $('diagnosticStatus').textContent='图文或配置已修改，下方是修改前的报告。请重新诊断后再作取舍。';
  $('diagnosticReport').classList.add('diagnostic-stale');
 }
 if(switched&&document.body.dataset.view==='library')loadDiagnosticHistory();
}
function syncDiagnosticTargets(){
 const target=$('diagnosticTarget'),has=typeof planCurrent!=='undefined'&&planCurrent?.kind==='adaptation';
 const key=has?planCurrent.id:'editor';if(target.dataset.plan===key)return;
 const previous=target.value;target.replaceChildren();for(const [value,label]of [['editor','当前素材与单平台方案'],...(has?[['小红书','小红书 · 联创已保存版本'],['抖音图文','抖音 · 联创已保存版本']]:[])]){const option=node('option','',label);option.value=value;target.append(option);}target.value=has&&previous==='editor'&&isMultiCreation()?'小红书':previous;if(!target.value)target.value='editor';target.dataset.plan=key;
}
function currentDiagnosticState(){
 const platform=$('diagnosticTarget').value;if(platform==='editor'||!planCurrent||planCurrent.kind!=='adaptation')return structuredClone(state);
 const version=planCurrent.data.versions.find(v=>v.platform===platform),source=planCurrent.data.source,option=linkedCurrent(version);
 return {brief:{mode:'optimize',platform,goal:'流行度',originalTitle:source.title||'',originalBody:source.body||'',creativeTheme:source.topic||'',image:source.image||'',creatorProfile:source.profile||{}},selected:0,result:{options:[option]}};
}
$('diagnosticTarget').addEventListener('change',syncInsightState);
function loadInsightHome(){syncInsightState();loadDiagnosticHistory();}
function openInsights(tab='diagnosis'){
 activateView('library');
 if(tab==='diagnosis'){$('libraryDiagnostic').open=true;loadInsightHome();$('libraryDiagnostic').scrollIntoView({block:'start'});}
 else {$('pairedOnly').checked=false;$('librarySearch').value=(state.brief.creativeTheme||state.brief.originalTitle||state.brief.topic||'').slice(0,100);renderLibrary();}
}
$('workbenchInspire').addEventListener('click',()=>{readForm();openInsights('inspiration');});
$('workbenchDiagnose').addEventListener('click',()=>{openInsights('diagnosis');runDiagnostic();});
$('openLibraryDiagnosis').addEventListener('click',()=>openInsights('diagnosis'));
$('browseLibrary').addEventListener('click',()=>{$('libraryDiagnostic').open=false;$('librarySearch').focus();});
function referenceCard(note,{compact=false}={}){
 const article=node('article','insight-reference'+(compact?' compact-reference':''));
 if(note.thumbnail){const img=node('img','reference-cover');img.src=note.thumbnail;img.alt=note.title+' · 对应历史原图';img.loading='lazy';article.append(img);}
 else article.append(node('div','reference-no-image','对应原图待恢复'));
 const content=node('div','reference-content');content.append(node('small','reference-kind',note.category+' · 历史笔记'),node('h3','',note.title),node('p','reference-reason',note.reason));
 const full=node('details');full.append(node('summary','','查看完整笔记'));full.append(node('p','reference-body',note.body),node('p','reference-tags',(note.tags||[]).map(t=>'#'+t).join(' ')));
 const m=note.metrics||{};full.append(node('p','reference-metrics','数据集记录：点赞 '+(m.likes??'未知')+' · 收藏 '+(m.collects??'未知')+' · 评论 '+(m.comments??'未知')+' · 曝光 '+(m.impressions??'未知')),node('p','insight-note',note.controls));
 const source=node('a','text-button','查看来源 ↗');source.href=note.source_url;source.target='_blank';source.rel='noopener noreferrer';full.append(source);content.append(full);
 const actions=node('div','reference-actions'),use=node('button','button outline','以此为原稿创作');use.type='button';use.addEventListener('click',async()=>{use.disabled=true;try{await applyStarterExample(note);}finally{use.disabled=busy;}});
 const angle=node('button','text-button','仅借鉴主题，不替换素材');angle.type='button';angle.addEventListener('click',()=>{
  if(busy){toast('请等当前生成结束。');return;}
  if(!confirm('仅把这篇标题设为当前创作主题，保留你的图片与正文。继续吗？'))return;
  state.brief.creativeTheme=note.title;$('creativeTheme').value=note.title;scheduleSave();activateView('workbench');toast('已带入参考主题。请改成自己的角度，并核实原文中的事实。');
 });actions.append(use,angle);content.append(actions);article.append(content);return article;
}
async function runDiagnostic(){
 if(busy){toast('请等生成完成后再诊断。');return;}if(typeof linkedDirty!=='undefined'&&linkedDirty.size){toast('请先保存两平台修改，再诊断当前版本。');return;}readForm();syncInsightState();
 const project=state,identity=storageIdentity,snapshot=diagnosticViewKey(),run=++diagnosticRun;
 $('runDiagnostic').disabled=true;$('diagnosticStatus').textContent='正在检查原文、方案、结构与参考证据…';
 try{
  const report=await api('/api/diagnostics',{state:currentDiagnosticState()});
  if(run!==diagnosticRun||identity!==storageIdentity)return;
  if(project!==state||snapshot!==diagnosticViewKey()){$('diagnosticStatus').textContent='检查期间创作已变化。报告保存在记录中，请重新诊断当前图文。';await loadDiagnosticHistory();return;}
  diagnosticReport=report;diagnosticSnapshot=snapshot;diagnosticContext='current';
  renderDiagnosticReport(report);$('diagnosticStatus').textContent=(report.reused?'已读取相同内容的报告':'已完成检查并保存报告')+' · '+report.notes.length+' 份图文';await loadDiagnosticHistory();
 }catch(error){if(run===diagnosticRun)$('diagnosticStatus').textContent=error.message;}
 finally{if(run===diagnosticRun)$('runDiagnostic').disabled=busy;}
}
$('runDiagnostic').addEventListener('click',runDiagnostic);

function renderDiagnosticReport(report){
 const root=$('diagnosticReport');root.hidden=false;root.classList.remove('diagnostic-stale');root.replaceChildren();
 const heading=node('div','insight-report-heading');const intro=node('div');intro.append(node('small','eyebrow',diagnosticContext==='history'?'已保存的历史报告':'当前图文的检查'),node('h2','',report.topic),node('p','insight-note',report.platform+' · '+new Date(report.created*1000).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})+' 北京时间'+' · '+report.notes.length+' 份图文'));
 const exportButton=node('button','button outline','导出完整报告 ↓');exportButton.type='button';exportButton.addEventListener('click',()=>exportDiagnostic(report.id));heading.append(intro,exportButton);root.append(heading);
 const metrics=node('section','panel diagnostic-metrics');metrics.append(node('h2','','六项结构，一眼对照'),node('p','insight-note','与同类笔记的常见表达对照。'));
 const tableWrap=node('div','diagnostic-table-wrap'),table=node('table','diagnostic-table'),thead=node('thead'),tr=node('tr');
 for(const label of ['结构指标',...report.notes.map(n=>n.label),'同类参考'])tr.append(node('th','',label));thead.append(tr);table.append(thead);
 const tbody=node('tbody');for(const [i,m]of report.notes[0].metrics.entries()){const row=node('tr');row.append(node('th','',m.label));for(const note of report.notes)row.append(node('td','',note.metrics[i].value+' '+m.unit));row.append(node('td','',m.median===null?'样本不足（n='+m.n+'）':'中位 '+m.median+' / '+m.q25+'–'+m.q75+' '+m.unit));tbody.append(row);}table.append(tbody);tableWrap.append(table);metrics.append(tableWrap);root.append(metrics);
 for(const note of report.notes){
  const section=node('section','panel diagnostic-note');section.append(node('h2','',note.label+' · 原句与改进方向'));
  const original=node('details');original.append(node('summary','','核对报告对应的完整文案'),node('h3','',note.title),node('p','reference-body',note.body),node('p','reference-tags',note.tags.map(t=>'#'+t).join(' ')));section.append(original);
  if(!note.checks.length)section.append(node('p','insight-note','未发现明显表达问题，发布前请核对事实。'));
  for(const check of note.checks){const item=node('article','diagnostic-evidence');item.append(node('strong','',check.label),node('small','',check.location));if(check.quote)item.append(node('blockquote','',check.quote));item.append(node('p','',check.suggestion));section.append(item);}
  root.append(section);
 }
 const image=node('section','panel diagnostic-image');image.append(node('h2','','图片与文字，需要一起核对'),node('p','',report.image.present?'发布前确认图片与文案一致。':'添加图片后，可一起核对图文。'));if(report.image.generation_observation)image.append(node('h3','','本次生成时的图像观察'),node('p','',report.image.generation_observation),node('small','insight-note','请结合原图确认。'));root.append(image);
 const ref=node('section','diagnostic-references');ref.append(node('h2','','相关笔记'));const refs=node('div','inspiration-results');refs.append(...report.references.map(n=>referenceCard(n,{compact:true})));if(!report.references.length)refs.append(node('p','insight-empty','暂未找到相关笔记，可换个主题试试。'));ref.append(refs);root.append(ref);

 const next=node('section','panel diagnostic-next');next.append(node('strong','','把建议变成你的下一版'));const edit=node('button','button primary','回工作台修改与生成 ↗');edit.type='button';edit.addEventListener('click',()=>activateView('workbench'));const review=node('button','text-button','已选好稿？去记录发布复盘 →');review.type='button';review.addEventListener('click',()=>activateView('feedback'));next.append(edit,review);root.append(next);
}

async function loadDiagnosticHistory(){
 const identity=storageIdentity;try{const data=await api('/api/diagnostics');if(identity!==storageIdentity)return;
  $('diagnosticHistory').replaceChildren(...data.reports.map(report=>{const b=node('button','diagnostic-history-row');b.type='button';b.append(node('strong','',report.title||'未命名图文'),node('small','',new Date(report.created*1000).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})+' 北京时间'));b.addEventListener('click',()=>openDiagnosticHistory(report.id));return b;}));if(!data.reports.length)$('diagnosticHistory').append(node('p','insight-note','还没有诊断报告。粘贴原文或生成方案后，点击上方诊断。'));
 }catch(error){if(identity===storageIdentity)$('diagnosticHistory').textContent=error.message;}
}
async function openDiagnosticHistory(id){
 const identity=storageIdentity,run=++diagnosticRun;$('runDiagnostic').disabled=busy;try{const report=await api('/api/diagnostics/'+id);if(identity!==storageIdentity||run!==diagnosticRun)return;diagnosticReport=report;diagnosticContext='history';diagnosticSnapshot=null;renderDiagnosticReport(report);$('diagnosticStatus').textContent='正在查看历史快照；不会覆盖当前素材。点击「诊断当前图文」可重新检查。';$('diagnosticReport').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){if(identity===storageIdentity&&run===diagnosticRun)$('diagnosticStatus').textContent=error.message;}
}
$('reloadDiagnostics').addEventListener('click',loadDiagnosticHistory);
async function exportDiagnostic(id){
 const identity=storageIdentity;try{const result=await api('/api/diagnostics/'+id+'/export');if(identity!==storageIdentity)return;const url=URL.createObjectURL(new Blob([result.markdown],{type:'text/markdown;charset=utf-8'})),link=node('a');link.href=url;link.download=result.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('完整诊断已导出，包含对应文案、证据和历史参考。');}catch(error){toast(error.message,error);}
}
window.addEventListener('storage',event=>{if(event.key==='resonance.auth.changed'){diagnosticRun++;diagnosticReport=null;diagnosticSnapshot=null;$('diagnosticReport').replaceChildren();$('diagnosticReport').hidden=true;$('diagnosticHistory').replaceChildren();$('diagnosticStatus').textContent='身份已变化，请刷新后读取本人记录。';}});
syncInsightState();if(document.body.dataset.view==='library')loadInsightHome();
