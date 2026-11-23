'use strict';
let reviewRecords=[],reviewSelected=null,reviewCaptureContext=null,reviewNonce='',reviewRun=0,reviewCompareRun=0,captureInProgress=false;
const metricKeys=['impressions','clicks','likes','collects','comments','shares'];
const metricLabels={impressions:'曝光',clicks:'点击',likes:'点赞',collects:'收藏',comments:'评论',shares:'分享'};
const metricIds={impressions:'metricImpressions',clicks:'metricClicks',likes:'metricLikes',collects:'metricCollects',comments:'metricComments',shares:'metricShares'};
const localDate=value=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const displayDate=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})+' 北京时间':'尚未发布';
function reviewError(id,message=''){$(id).textContent=message;$(id).hidden=!message;}
function optionalInteger(id){const value=$(id).value.trim();if(!value)return null;const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error('指标与粉丝数需为非负整数，未知请留空。');return n;}
function isoInput(id){const value=$(id).value;if(!value)return null;return new Date(value).toISOString();}
async function withReviewButton(id,task){const b=$(id);b.disabled=true;try{return await task();}finally{b.disabled=false;}}
async function loadReview(){
 const run=++reviewRun;reviewCompareRun++;
 try{const data=await api('/api/publications');if(run!==reviewRun)return;reviewRecords=data.publications.filter(r=>r.platform===state.brief.platform);renderPublicationList();renderReviewSelectors();if(typeof renderReviewDemo==='function')renderReviewDemo();reviewError('reviewError');if(reviewSelected&&!reviewRecords.some(r=>r.id===reviewSelected)){reviewSelected=null;$('publicationDetail').hidden=true;}$('reviewComparison').replaceChildren();}
 catch(e){reviewError('reviewError',e.message);$('publicationList').replaceChildren(node('p','review-empty','记录尚未读取成功，点击“刷新记录”重试。'));}
}
function renderPublicationList(){
 $('publicationList').replaceChildren();
 if(!reviewRecords.length){const empty=node('div','review-empty');empty.append(node('h3','','还没有'+state.brief.platform+'作品记录'),node('p','','在创作台选择最终方案，点击“记录当前方案”。发布前可留草稿；本人发布后记录发布时间，再回填指标。'));$('publicationList').append(empty);return;}
 for(const r of reviewRecords){const card=node('article','publication-card');card.classList.toggle('selected',reviewSelected===r.id);const heading=node('div','publication-heading');heading.append(node('span','publication-state',r.status==='published'?'已发布 · 本人记录':'待发布 · 版本留存'),node('small','',r.platform));card.append(heading,node('h3','',r.snapshot.option.title),node('p','',r.theme+' · '+r.goal+' · '+r.account),node('small','review-record-id','编号 '+r.id));
 const meta=node('p','publication-latest');meta.textContent=r.latest?'最近采集：'+displayDate(r.latest.observed_at)+' · '+r.latest.window_hours+' 小时窗口':'尚未回填指标';card.append(meta);const b=node('button','button outline small','查看作品与回填');b.addEventListener('click',()=>selectPublication(r.id));card.append(b);$('publicationList').append(card);}
}
function renderReviewSelectors(){
 for(const id of ['reviewA','reviewB']){const value=$(id).value;const placeholder=node('option','','选择实际发布作品');placeholder.value='';$(id).replaceChildren(placeholder,...reviewRecords.filter(r=>r.status==='published').map(r=>{const o=node('option','',r.snapshot.option.title+' · '+r.account);o.value=r.id;return o;}));$(id).value=reviewRecords.some(r=>r.id===value)?value:'';}
}
async function selectPublication(ident){
 reviewSelected=ident;$('publicationDetail').hidden=true;renderPublicationList();reviewError('metricError');
 try{const data=await api('/api/publications/'+ident);if(reviewSelected!==ident)return;const r=data.publication;$('publicationDetail').hidden=false;$('publicationDetailTitle').textContent=r.snapshot.option.title;$('publicationMeta').textContent=r.platform+' · '+r.account+' · '+displayDate(r.published_at)+' · 发布时粉丝 '+(r.followers??'未知');
 $('publicationContent').replaceChildren(node('p','',r.snapshot.option.body),node('p','',(r.snapshot.option.tags||[]).map(t=>'#'+t).join(' ')),node('small','','作品版本 '+r.snapshot.version_id+'；后续编辑不会改写此快照。'));
 if(r.snapshot.decision){const d=r.snapshot.decision;const block=node('section','record-decision');block.append(node('h3','','选稿时的验证计划'),node('p','','选择 '+(d.selected==='undecided'?'暂不决定':d.selected)+' · '+(!d.current_at_capture?'记录对应较早版本，需核对':d.selected_matches_capture===false?'本次冻结的是另一方案，请核对选择':'记录与冻结版本一致')),node('p','',d.reason),node('p','','待验证：'+(d.hypothesis||'尚未填写')),node('small','',d.window+' 小时 · '+(metricLabels[d.metric]||d.metric)+' / 曝光'));$('publicationContent').append(block);}
 if(r.snapshot.cover_hash){const image=node('img','recorded-cover');image.src='/api/publications/'+ident+'/cover';image.alt='记录时的最终封面';$('publicationContent').prepend(image);const link=node('a','button outline small','下载记录封面');link.href=image.src;link.download='resonance-record-'+ident+'.png';$('publicationContent').append(link);}
 $('publishedRecordForm').hidden=r.status!=='draft';$('savedPublishedAt').value=localDate();$('savedPostUrl').value=r.post_url||'';$('savedFollowers').value=r.followers??'';$('savedPromoted').value=r.promoted;$('savedPublishConfirmed').checked=false;reviewError('savedPublishError');$('metricForm').hidden=r.status!=='published';$('metricObserved').value=localDate();for(const key of metricKeys)$(metricIds[key]).value='';
 const timeline=$('metricTimeline');timeline.replaceChildren(node('h3','','指标快照'));
 if(!data.snapshots.length)timeline.append(node('p','review-empty',r.status==='published'?'尚未回填。建议在发布后 24 / 72 小时记录。':'这是待发布版本。本人发布后，在上方补记发布时间，即可在同一记录继续回填。'));
 for(const m of data.snapshots){const row=node('article','metric-snapshot');row.append(node('strong','',displayDate(m.observed_at)+' · '+m.window_hours+' 小时'));const grid=node('div','metric-values');for(const k of metricKeys){const item=node('span','',metricLabels[k]+' ');item.append(node('b','',m[k]===null?'未知':m[k].toLocaleString()));grid.append(item);}row.append(grid);timeline.append(row);}
 $('publicationDetail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){reviewError('reviewError',e.message);}
}
async function capturePublication(){
 if(captureInProgress)return;
 reviewError('reviewError');if(busy){toast('生成完成后可以记录最终作品。');return;}if(!currentOption()){activateView('workbench');toast('先生成并选择一套方案，再记录最终作品。');return;}
 const platform=state.brief.platform;if((state.result.platform||state.sourceBrief?.platform||platform)!==platform){toast('请先为当前平台重新生成方案。');return;}
 captureInProgress=true;const locked=[...document.querySelectorAll('input,textarea,select,button')].map(el=>[el,el.disabled]);locked.forEach(([el])=>el.disabled=true);
 try{const saved=await save(true,'发布复盘 · 最终作品快照');await renderCover();const o=currentOption();reviewCaptureContext={project:projectId,version_id:saved.version_id,option_index:state.selected,platform,cover_image:$('coverCanvas').toDataURL('image/png')};reviewNonce=makeNonce();$('publicationEditor').hidden=false;$('recordSource').textContent=platform+' · '+o.title;$('recordTheme').value=o.design?.theme||state.brief.creativeTheme||state.brief.topic.slice(0,120);$('recordStatus').value='draft';syncPublicationStatus();$('recordPublished').value=localDate();$('recordUrl').value='';reviewError('publicationError');activateView('feedback');$('publicationEditor').scrollIntoView({behavior:'smooth',block:'start'});$('recordAccount').focus();}
 catch(e){reviewError('reviewError',e.message);toast(e.message,e);}
 finally{captureInProgress=false;locked.forEach(([el,disabled])=>el.disabled=disabled);}
}
function makeNonce(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
function syncPublicationStatus(){const published=$('recordStatus').value==='published';$('publishedFields').hidden=!published;$('recordPublished').required=published;}
$('feedbackNav').addEventListener('click',()=>activateView('feedback'));
$('reviewReload').addEventListener('click',loadReview);
$('reviewCapture').addEventListener('click',capturePublication);
$('recordFinalBtn').addEventListener('click',capturePublication);
$('recordStatus').addEventListener('change',syncPublicationStatus);
$('publicationForm').addEventListener('submit',async e=>{
 e.preventDefault();reviewError('publicationError');if(!reviewCaptureContext){reviewError('publicationError','请先点击“记录当前方案”。');return;}
 if(reviewCaptureContext.platform!==state.brief.platform){reviewError('publicationError','平台已改变，请重新记录当前方案。');return;}
 try{await withReviewButton('publicationSubmit',async()=>{const data={...reviewCaptureContext,nonce:reviewNonce,account:$('recordAccount').value.trim(),theme:$('recordTheme').value.trim(),status:$('recordStatus').value,published_at:isoInput('recordPublished'),post_url:$('recordUrl').value.trim(),followers:optionalInteger('recordFollowers'),promoted:$('recordPromoted').value};const saved=await api('/api/publications',data);$('publicationEditor').hidden=true;reviewCaptureContext=null;await loadReview();await selectPublication(saved.id);toast('最终作品已独立保存，可按观察窗口回填指标。');});}
 catch(error){reviewError('publicationError',error.message);}
});
$('publishedRecordForm').addEventListener('submit',async e=>{
 e.preventDefault();reviewError('savedPublishError');const ident=reviewSelected,identity=storageIdentity;if(!ident)return;
 try{await withReviewButton('savedPublishSubmit',async()=>{const data=await api('/api/publications/publish',{publication_id:ident,published_at:isoInput('savedPublishedAt'),post_url:$('savedPostUrl').value.trim(),followers:optionalInteger('savedFollowers'),promoted:$('savedPromoted').value,confirmed:$('savedPublishConfirmed').checked});if(identity!==storageIdentity)return;await loadReview();if(reviewSelected===ident)await selectPublication(ident);toast(data.deduplicated?'这份作品的发布信息已保存。':'已补记发布时间，可以在同一作品继续回填。');});}
 catch(error){if(identity===storageIdentity&&reviewSelected===ident)reviewError('savedPublishError',error.message);}
});
$('metricForm').addEventListener('submit',async e=>{
 e.preventDefault();reviewError('metricError');try{await withReviewButton('metricSubmit',async()=>{const body={publication_id:reviewSelected,observed_at:isoInput('metricObserved')};for(const k of metricKeys)body[k]=optionalInteger(metricIds[k]);const data=await api('/api/publications/metrics',body);await loadReview();await selectPublication(reviewSelected);toast(data.deduplicated?'相同指标已存在，已跳过重复。':'指标快照已保存。');});}catch(error){reviewError('metricError',error.message);}
});
function invalidateReviewComparison(){reviewCompareRun++;$('reviewComparison').replaceChildren(node('p','review-boundary','条件已变化，请重新比较。'));}
for(const id of ['reviewA','reviewB','reviewWindow','reviewMetric'])$(id).addEventListener('change',invalidateReviewComparison);
$('reviewCompareForm').addEventListener('submit',async e=>{
 e.preventDefault();reviewError('reviewError');const run=++reviewCompareRun,identity=storageIdentity;
 $('reviewComparison').replaceChildren(node('p','','正在检查当前对照条件…'));
 try{await withReviewButton('reviewCompareSubmit',async()=>{const result=await api('/api/publications/compare',{a:$('reviewA').value,b:$('reviewB').value,window:Number($('reviewWindow').value),metric:$('reviewMetric').value});if(run===reviewCompareRun&&identity===storageIdentity)renderReviewComparison(result);});}
 catch(error){if(run===reviewCompareRun&&identity===storageIdentity)$('reviewComparison').replaceChildren(node('p','plan-warning',error.message+' 本次未生成对照结果。'));}
});
function renderReviewComparison(data){
 const target=$('reviewComparison');target.replaceChildren(node('h3','',data.eligible?'条件齐备的历史观察对照':'对照条件尚不齐备'));
 const checks=node('ul','review-checks');for(const c of data.checks){const li=node('li',c.passed?'check-pass':'check-missing');li.append(node('strong','',(c.passed?'已具备 · ':'待补充 · ')+c.label),node('span','',c.detail));checks.append(li);}target.append(checks);
 const summary=node('div','review-rate-summary');for(const [i,r]of data.records.entries()){const card=node('article');card.append(node('strong','',String.fromCharCode(65+i)+' · '+r.title),node('p','',(r.metric??'未知')+' 次'+metricLabels[data.metric]+' / '+(r.impressions??'未知')+' 次曝光'),node('p','',r.rate===null?'无可用分母':(r.rate*100).toFixed(2)+' 次 / 每百次曝光'));summary.append(card);}target.append(summary);
 if(data.eligible)target.append(node('p',data.delta_percentage_points>=0?'delta-positive':'delta-negative','B 相对 A：'+(data.delta_percentage_points>=0?'+':'')+data.delta_percentage_points.toFixed(2)+' 次'+metricLabels[data.metric]+' / 每百次曝光'));
 else target.append(node('p','review-boundary','条件缺失时不计算方向差值；上方仅保留原始观测。'));
 target.append(node('p','review-boundary',data.scope));
}
function downloadReviewText(text,filename,mime='text/csv;charset=utf-8'){
 const blob=new Blob(['\ufeff',text],{type:mime}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
$('metricTemplate').addEventListener('click',()=>{
 const ident=reviewSelected||reviewRecords.find(r=>r.status==='published')?.id||'请替换为作品编号';
 const row=[ident,new Date().toISOString(),...metricKeys.map(()=>'')].join(',');
 downloadReviewText(['publication_id,observed_at,'+metricKeys.join(','),row].join('\r\n')+'\r\n','resonance-metric-template.csv');toast('模板已导出，未知值保持空白。');
});
$('metricCsv').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;try{if(file.size>500000)throw Error('CSV 请控制在 500 KB 以内。');$('csvStatus').textContent='正在校验整批指标…';e.target.disabled=true;const data=await api('/api/publications/import',{csv:await file.text()});$('csvStatus').textContent='已导入 '+data.created+' 条，跳过 '+data.skipped+' 条重复。';await loadReview();if(reviewSelected)await selectPublication(reviewSelected);}
 catch(error){$('csvStatus').textContent=error.message;}finally{e.target.value='';e.target.disabled=false;}
});
$('reviewExport').addEventListener('click',async()=>{try{const data=await api('/api/publications/export');downloadReviewText(data.csv,data.filename);toast('作品与全部指标快照已导出。');}catch(error){reviewError('reviewError',error.message);}});
if(!$('feedbackView').hidden)loadReview();
