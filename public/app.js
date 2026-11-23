'use strict';
const $ = id => document.getElementById(id);
const initialBrief = () => {const platform=preferredPlatform(),p=platformConfig(platform);return {mode:'topic',topic:'',creativeTheme:'',originalTitle:'',originalBody:'',platform,audience:'',goal:'流行度',tone:p.tone,model:p.model,additionalPrompt:'',customChoices:{goal:[],audience:[],tone:[]},count:1,comparisonAxis:'tone',compareValue:'克制简洁，有设计感',image:''};};
const initialState = () => ({brief:initialBrief(),result:null,selected:0,template:'auto',palette:'auto',adjust:{position:50,brightness:100,saturation:100},job:null,sourceBrief:null});
let state=initialState(),projectId=null,busy=false,saveTimer,pollTimer,clockTimer,startedAt=0,saveQueue=Promise.resolve(),toastTimer,booted=false;
const storageKey='resonance.current.v1';
let storageIdentity='guest',identityIsCurrent=true;
const fields=['creativeTheme','topic','originalTitle','originalBody','platform','audience','goal','tone','additionalPrompt'];
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function accountLink(error){if(!['login','register','upgrade','credits'].includes(error?.action))return null;const a=node('a','account-action-link',{login:'立即登录 / 注册',register:'免费注册，继续创作',upgrade:'登录 / 查看会员',credits:'查看充值与免费额度'}[error.action]);a.href='/?auth='+error.action+'#account';a.dataset.accountRoute=error.action;return a;}
function toast(text,error){clearTimeout(toastTimer);$('toast').replaceChildren(document.createTextNode(text));const a=accountLink(error);if(a)$('toast').append(a);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,a?12000:4000);}
function showError(message,error){$('errorBox').replaceChildren(document.createTextNode(message));const a=accountLink(error);if(a)$('errorBox').append(a);$('errorBox').hidden=!message;}
async function api(path,body){let response;try{response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Studio-Identity':storageIdentity}:{},body:body?JSON.stringify(body):undefined});}catch{throw new Error('网络连接中断，草稿仍保留在本机。请稍后重试。');}let data;try{data=await response.json();}catch{throw new Error('服务连接暂时中断，请保留页面后重试。');}if(!response.ok){const error=new Error(data.error||'操作未完成，请稍后重试。');error.status=response.status;error.action=data.action;throw error;}return data;}
function readForm(){fields.forEach(k=>state.brief[k]=$(k).value);if(typeof readIntentForm==='function')readIntentForm();}
function remember(){if(!identityIsCurrent)return;try{localStorage.setItem(storageKey,JSON.stringify({id:projectId,state,identity:storageIdentity}));}catch{$('saveStatus').textContent='本地空间不足，正在保存到项目';}}
function save(snapshot=false,label='手动保存'){
  readForm();if(state.sourceBrief)delete state.sourceBrief.image;remember();const data=JSON.parse(JSON.stringify(state));
  $('saveStatus').textContent='正在保存…';
  const pending=saveQueue.catch(()=>{}).then(async()=>{const saved=await api('/api/projects',{id:projectId,state:data,snapshot,label});projectId=saved.id;remember();$('saveStatus').textContent='已自动保存';return saved;});
  saveQueue=pending;return pending.catch(error=>{$('saveStatus').textContent='暂未同步，草稿留在本机';throw error;});
}
function scheduleSave(){readForm();if(typeof syncCreativeTools==='function')syncCreativeTools();remember();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),700);}
function currentOption(){return state.result?.options?.[state.selected||0];}
function setMode(mode){state.brief.mode=mode;$('topicFields').hidden=mode!=='topic';$('originalFields').hidden=mode!=='optimize';for(const [id,value] of [['topicMode','topic'],['optimizeMode','optimize']]){$(id).classList.toggle('selected',mode===value);$(id).setAttribute('aria-selected',String(mode===value));}}
function applyState(){fields.forEach(k=>$(k).value=state.brief[k]??initialBrief()[k]??'');setMode(state.brief.mode||'topic');state.adjust={position:50,brightness:100,saturation:100,...state.adjust};$('imagePosition').value=state.adjust.position;$('imageBrightness').value=state.adjust.brightness;$('imageSaturation').value=state.adjust.saturation;showImage();if(typeof syncIntentForm==='function')syncIntentForm();if(typeof renderStarterExampleStatus==='function')renderStarterExampleStatus();if(typeof syncCreativeTools==='function')syncCreativeTools();if(typeof syncCreationExamples==='function')syncCreationExamples();renderResults();renderCover();}
function showImage(){const image=state.brief.image;$('imageThumb').hidden=!image;$('removeImage').hidden=!image;$('uploadArea').classList.toggle('has-image',!!image);if(image)$('imageThumb').src=image;else $('imageThumb').removeAttribute('src');$('imageAdjustments').hidden=!image;}
function renderResults(){
  const result=state.result;
  $('recordFinalBtn').disabled=!result||busy;
  $('emptyState').hidden=!!result||busy;$('results').hidden=!result;$('coverEditing').hidden=!result;$('downloadBtn').disabled=!result;
  $('resultBadge').textContent=busy?'正在创作':result?result.options.length+' 套设计 · 可编辑':'等待灵感';
  if(!result){$('audienceSuggestions').replaceChildren();$('themeRecommendations').hidden=true;$('resultPreviews').replaceChildren();$('resultPrediction').replaceChildren();$('optionTabs').replaceChildren();$('publishBtn').disabled=true;return;}
  state.selected=Math.min(state.selected||0,result.options.length-1);
  const tabs=result.options.map((o,i)=>{const b=node('button',i===state.selected?'selected':'',`方案 ${String.fromCharCode(65+i)}`);b.type='button';b.role='tab';b.setAttribute('aria-selected',String(i===state.selected));b.append(node('strong','',o.angle));b.addEventListener('click',()=>{state.selected=i;renderResults();renderCover();scheduleSave();});return b;});$('optionTabs').replaceChildren(...tabs);
  renderThemeRecommendations(result);const o=currentOption();$('resultTitle').value=o.title;$('resultBody').value=o.body;$('resultTags').value=o.tags.map(t=>'#'+t.replace(/^#+/,'')).join(' ');$('styleBadge').textContent=o.style;$('targetAudience').textContent='面向 · '+o.audience;$('titleCount').textContent=o.title.length+' 字';$('coverHeadline').value=o.cover.headline;$('coverSubtitle').value=o.cover.subtitle;
  $('reasons').replaceChildren(...(o.explanationStale?[node('p','plan-warning','正文已手动修改。以下是生成时的历史设计依据，尚未重新核查当前文案。')]:[]),...o.reasons.map((r,i)=>{const el=node('article','reason');const head=node('div','reason-title');head.append(node('span','reason-index','0'+(i+1)),node('span','',r.action),node('span','evidence-type',r.evidence));const detail=node('details');detail.append(node('summary','','查看依据'));for(const [label,text]of[['观察到什么',r.observation],['为什么',r.reason]]){const p=node('p');p.append(node('b','',label+'：'),document.createTextNode(text));detail.append(p);}el.append(head,detail);return el;}));
  $('assessmentContent').replaceChildren(...[['表达优势',o.assessment.strength],['当前限制',o.assessment.limitation],['下一步验证',o.assessment.next_step]].map(([label,text])=>{const p=node('p');p.append(node('strong','',label+'：'),document.createTextNode(text));return p;}));
  if(o.explanationStale)$('assessmentContent').prepend(node('p','plan-note','以下评估来自生成时版本；手动改稿后尚未重新核查。'));
  const diagnostics=result.diagnostics||[];$('diagnosis').hidden=!diagnostics.length;$('diagnosisCount').textContent=diagnostics.length+' 处';$('diagnosisContent').replaceChildren(...diagnostics.map(d=>{const el=node('div','diagnostic');el.append(node('h4','',d.location),node('del','',d.original),node('ins','',d.replacement),node('p','',d.reason));const b=node('button','text-button','应用到原文');b.type='button';b.disabled=busy;b.addEventListener('click',()=>{readForm();const k=state.brief.originalTitle.includes(d.original)?'originalTitle':state.brief.originalBody.includes(d.original)?'originalBody':null;if(!k){toast('原文已发生变化，请重新生成诊断。');return;}state.brief[k]=state.brief[k].replace(d.original,d.replacement);$(k).value=state.brief[k];b.textContent='已应用 · 重新生成可更新方案';b.disabled=true;scheduleSave();toast('已修改输入原文，可重新生成设计方案。');});el.append(b);return el;}));
  $('imageInsight').hidden=!result.image_observation;$('imageObservation').textContent=result.image_observation||'';
  if(typeof refreshIntentResults==='function')refreshIntentResults();if(typeof refreshDesignAudit==='function')refreshDesignAudit();
  $('audienceSuggestions').replaceChildren(...result.audiences.map(a=>{const b=node('button',state.brief.audience===a.name?'selected':'',a.name);b.type='button';b.title=a.need+'\n匹配依据（模型推测）：'+a.basis;b.disabled=busy;b.addEventListener('click',()=>{state.brief.audience=a.name;$('audience').value=a.name;if(state.brief.comparisonAxis==='audience'){state.brief.count=1;state.brief.compareValue='';}updateComparisonControls();scheduleSave();toast('已选用该人群，可继续编辑或重新生成。');});return b;}));
}
function setBusy(value){busy=value;document.body.classList.toggle('is-busy',value);$('generateBtn').disabled=value;for(const el of document.querySelectorAll('.custom-choice-entry input,.custom-choice-entry button'))el.disabled=value;$('keepSingle').disabled=value;if($('globalPlatform'))$('globalPlatform').disabled=value;$('generateBtn').firstElementChild.textContent=value?'正在生成，请稍候':(state.brief.count===2?'生成两个设计方向':'生成一套设计方案');$('loadingState').hidden=!value;for(const el of $('briefForm').querySelectorAll('input,select,textarea'))el.disabled=value;['topicMode','optimizeMode','removeImage'].forEach(id=>$(id).disabled=value);renderResults();if(typeof syncCreativeTools==='function')syncCreativeTools();if(typeof renderIntentChoices==='function')renderIntentChoices();if(value){clearInterval(clockTimer);clockTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-startedAt)/1000);$('elapsed').textContent=seconds+'s';$('loadingText').textContent=seconds<15?'正在理解你的创作意图':seconds<45?'正在设计指定的表达方向':'正在完善文案与设计依据';},1000);}else{clearInterval(clockTimer);$('elapsed').textContent='0s';}}
async function generateContent(){
  if(busy||(typeof exampleLoading!=='undefined'&&exampleLoading)|| (typeof planPending!=='undefined'&&(planPending||planLoading)))return;if(typeof isMultiCreation==='function'&&isMultiCreation())return generateUnified();readForm();showError('');const b=state.brief;
  if(b.mode==='topic'&&!b.topic.trim()&&!b.creativeTheme?.trim()&&!b.image){showError('写下主题，或直接上传一张图片，让 AI 推荐主题并生成文案。');$('topic').focus();return;}
  if(b.count===2&&!b.compareValue?.trim()){showError('请填写方向 B，才能比较不同设计。');$('compareValue').focus();return;}
  if(b.mode==='optimize'&&!b.originalTitle.trim()&&!b.originalBody.trim()&&!b.image){showError('请粘贴已有标题、正文或上传原图，再开始优化。');$('originalBody').focus();return;}
  clearTimeout(saveTimer);startedAt=Date.now();setBusy(true);
  try{await save();const job=await api('/api/generate',{project:projectId,brief:state.brief});state.job={id:job.id,started:startedAt};remember();await save();pollJob();}
  catch(error){setBusy(false);showError(error.message,error);if(typeof refreshAccount==='function')refreshAccount();}
}
async function pollJob(){
  clearTimeout(pollTimer);if(!state.job)return;
  try{const job=await api('/api/jobs/'+state.job.id);
    if(job.status==='completed'){state.result=job.result;const {image,...source}=state.brief;state.sourceBrief=JSON.parse(JSON.stringify(source));state.selected=0;state.job=null;setBusy(false);renderResults();renderCover();await save(true,'AI 生成 · '+state.brief.platform);await loadProjects();toast('设计已就绪，可以编辑、导出或调整方向。');if(typeof refreshAccount==='function')refreshAccount();return;}
    if(job.status==='failed'){state.job=null;setBusy(false);showError(job.error||'生成未完成，请重试。');await save();if(typeof refreshAccount==='function')refreshAccount();return;}
    pollTimer=setTimeout(pollJob,1800);
  }catch(error){if(Date.now()-startedAt>220000){setBusy(false);showError('任务连接中断。重新打开该项目可继续检查，已有结果已保留。');return;}pollTimer=setTimeout(pollJob,3500);}
}
async function loadProjects(){const {projects}=await api('/api/projects');$('recentProjects').replaceChildren(...projects.slice(0,3).map(p=>{const b=node('button','',p.title);b.title=p.title;b.addEventListener('click',()=>openProject(p.id));return b;}));if(!projects.length)$('recentProjects').append(node('p','','让第一个想法在这里开始。'));$('projectList').replaceChildren(...projects.map(p=>{const row=node('div','project-row'),info=node('div');info.append(node('p','',p.title),node('small','',new Date(p.updated*1000).toLocaleString('zh-CN')));const b=node('button','button outline small','打开项目');b.addEventListener('click',()=>openProject(p.id));row.append(info,b);return row;}));if(!projects.length)$('projectList').append(node('p','empty-list','还没有项目。写下主题，开始第一份创作。'));}
function hasCurrentContent(){readForm();return !!(projectId||state.result||state.brief.creativeTheme?.trim()||state.brief.additionalPrompt?.trim()||state.brief.topic.trim()||state.brief.originalTitle.trim()||state.brief.originalBody.trim()||state.brief.image);}
async function openProject(id){if(busy||planPending||planLoading||planMutation){toast('当前内容仍在生成，完成后可以切换项目。');return;}if(linkedDirty.size){toast('请先保存两平台的修改。');return;}try{clearTimeout(saveTimer);if(hasCurrentContent())await save();await saveQueue.catch(()=>{});const p=await api('/api/projects/'+id);projectId=id;state=p.state;planCurrent=null;planDesired=null;$('unifiedPlanDetail').replaceChildren();applyState();remember();$('projectsDialog').close();showError('');activateView('workbench');if(state.linkedPlanId)await openContentPlan(state.linkedPlanId);if(state.job){startedAt=state.job.started||Date.now();setBusy(true);pollJob();}toast('已打开项目');}catch(e){toast(e.message,e);}}
async function newProject(){if(busy||planPending||planLoading||planMutation){toast('当前方案仍在生成，完成后可以开始新创作。');return false;}if(linkedDirty.size){toast('请先保存两平台的修改。');return false;}try{clearTimeout(saveTimer);if(hasCurrentContent())await save();await saveQueue.catch(()=>{});projectId=null;state=initialState();planCurrent=null;planDesired=null;$('unifiedPlanDetail').replaceChildren();applyState();remember();showError('');$('saveStatus').textContent='新创作 · 草稿自动保存';$('topic').focus();return true;}catch(e){showError(e.message);return false;}}
async function copyText(text){
  if(typeof window.asteam?.rpc==='function'){try{const r=JSON.parse(window.asteam.rpc(JSON.stringify({method:'device.writeClipboard',params:{text}})));if(r.error)throw new Error(r.error.message);return;}catch{/* Browser fallback below. */}}
  if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{/* HTTP fallback. */}}
  const el=node('textarea');el.value=text;el.className='clipboard-fallback';el.setAttribute('readonly','');(document.querySelector('dialog[open]')||document.body).append(el);el.select();const ok=document.execCommand('copy');el.remove();if(!ok)throw new Error('当前浏览器未允许复制，请选中文案后手动复制。');
}
async function uploadImage(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请上传 JPG、PNG 或 WebP 图片。');return;}if(file.size>12*1024*1024){toast('图片请控制在 12 MB 以内。');return;}try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();state.brief.image=c.toDataURL('image/webp',.82);delete state.brief.sourceExample;if(state.brief.image.length>3500000)throw new Error('图片处理后仍过大，请换一张较小的图片。');state.adjust={position:50,brightness:100,saturation:100};$('imagePosition').value=50;$('imageBrightness').value=100;$('imageSaturation').value=100;showImage();if(typeof renderStarterExampleStatus==='function')renderStarterExampleStatus();renderCover();scheduleSave();toast('图片已添加。主题可以留空，AI 会看图推荐主题并生成文案。');}catch(e){toast(e.message||'图片读取失败，请换一张图片。');}finally{$('imageInput').value='';}}

const palettes={forest:{bg:'#e6ecdf',ink:'#294335',soft:'#b5c8a6',paper:'#f9fbf5'},blue:{bg:'#e3eaf0',ink:'#334e68',soft:'#abc1d0',paper:'#f7fafc'},rose:{bg:'#f1e6e5',ink:'#794e54',soft:'#d3afb0',paper:'#fcf7f6'},mono:{bg:'#e9e9e5',ink:'#34372f',soft:'#bbbfb2',paper:'#fafaf7'}};
let loadedImage='',imagePromise=null;const renderCounters=new WeakMap();
function getImage(src){if(!src)return Promise.resolve(null);if(src!==loadedImage){loadedImage=src;imagePromise=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}return imagePromise;}
function coverLines(ctx,text,width){let line='',lines=[];for(const char of String(text||'')){if(char==='\n'||(line&&ctx.measureText(line+char).width>width)){lines.push(line);line=char==='\n'?'':char;}else line+=char;}if(line)lines.push(line);return lines;}
function wrap(ctx,text,x,y,width,lineHeight,maxLines){const original=ctx.font,size=Number(original.match(/([\d.]+)px/)?.[1]||32);let lines=coverLines(ctx,text,width),scaled=size;
 while(lines.length>maxLines&&scaled>Math.max(18,size*.36)){scaled-=2;ctx.font=original.replace(/[\d.]+px/,scaled+'px');lines=coverLines(ctx,text,width);}
 if(lines.length>maxLines){ctx.canvas.dataset.textOverflow='true';lines=lines.slice(0,maxLines);let last=lines[maxLines-1]||'';while(ctx.measureText(last+'…').width>width&&last)last=last.slice(0,-1);lines[maxLines-1]=last+'…';}
 lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));ctx.font=original;return lines.length*lineHeight;}

function drawImageCrop(ctx,img,x,y,w,h){const ratio=Math.max(w/img.width,h/img.height);const dw=img.width*ratio,dh=img.height*ratio;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.filter=`brightness(${state.adjust.brightness}%) saturate(${state.adjust.saturation}%)`;ctx.drawImage(img,x-(dw-w)/2,y-(dh-h)*state.adjust.position/100,dw,dh);ctx.restore();}
const IMAGE_FILTERS={original:'none',clean:'brightness(1.08) contrast(1.06) saturate(1.04)',warm:'sepia(.16) saturate(1.12) brightness(1.04)',soft:'saturate(.72) contrast(.95) brightness(1.08)',mono:'grayscale(1) contrast(1.1)'};
function suggestedFilter(o){return /温暖|生活|故事/.test(o?.style||'')?'warm':/实用|清晰/.test(o?.style||'')?'clean':/克制|简洁/.test(o?.style||'')?'soft':'original';}
async function renderCover(canvas=$('coverCanvas'),overrideOption=null,config={}){
 const serial=(renderCounters.get(canvas)||0)+1;renderCounters.set(canvas,serial);
 const platform=config.platform||canvas.dataset.phonePlatform||state.brief.platform,dim=platformConfig(platform),o=overrideOption||currentOption();
 const photoOnly=['小红书','抖音图文'].includes(canvas.dataset.phonePlatform);
 const src=Object.hasOwn(config,'image')?config.image:state.brief.image;let img=null;try{img=await getImage(src);}catch{}if(serial!==renderCounters.get(canvas))return;
 canvas.dataset.textOverflow='false';canvas.width=dim.width;canvas.height=dim.height;const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');
 const adjust=config.adjust||o?.imageAdjust||{position:50,brightness:100,saturation:100};const filter=config.filter||o?.imageFilter||suggestedFilter(o);
 ctx.fillStyle='#f1f3ed';ctx.fillRect(0,0,w,h);ctx.textBaseline='top';
 // Feed media stays separate from caption and app chrome; cover exports keep their own composition.
 const photoHeight=photoOnly?h:Math.round(h*.70);
 if(img){const ratio=Math.max(w/img.width,photoHeight/img.height),dw=img.width*ratio,dh=img.height*ratio;ctx.save();ctx.beginPath();ctx.rect(0,0,w,photoHeight);ctx.clip();ctx.filter=(IMAGE_FILTERS[filter]||'none')+` brightness(${adjust.brightness}%) saturate(${adjust.saturation}%)`;ctx.drawImage(img,-(dw-w)/2,-(dh-photoHeight)*adjust.position/100,dw,dh);ctx.restore();}
 else{ctx.fillStyle='#dce6d4';ctx.fillRect(0,0,w,photoHeight);if(!photoOnly){ctx.fillStyle='#375940';ctx.font='bold '+Math.round(h*.06)+'px sans-serif';wrap(ctx,o?.design?.theme||'你的下一次创作',64,photoHeight*.37,w-128,h*.085,3);}}
 if(!photoOnly){
 ctx.fillStyle='#f8faf4';ctx.fillRect(0,photoHeight,w,h-photoHeight);ctx.fillStyle='#294335';ctx.font='bold '+Math.round(h*.054)+'px "PingFang SC","Microsoft YaHei",sans-serif';
 wrap(ctx,o?.cover?.headline||'把想法，表达清楚。',w*.06,h*.742,w*.88,h*.07,2);
 ctx.font=Math.round(h*.022)+'px "PingFang SC","Microsoft YaHei",sans-serif';wrap(ctx,o?.cover?.subtitle||'围绕主题、人群与目标设计。',w*.06,h*.93,w*.88,h*.034,1);
 }
 if(canvas===$('coverCanvas')){
  let warning=$('coverOverflowWarning');if(!warning){warning=node('p','plan-warning');warning.id='coverOverflowWarning';canvas.parentElement.append(warning);}warning.hidden=canvas.dataset.textOverflow!=='true';warning.textContent='封面文字过长，预览已用省略号标出。请缩短标题或副标题后再导出。';
  $('coverRatio').textContent=dim.width+' : '+dim.height;$('exportSize').textContent=dim.width+' × '+dim.height;
  $('imageFilter').value=filter;$('imagePosition').value=adjust.position;$('imageBrightness').value=adjust.brightness;$('imageSaturation').value=adjust.saturation;
  if(typeof refreshIntentResults==='function')refreshIntentResults();
 }
}
async function downloadCover(){if(!currentOption())return;await renderCover();if($('coverCanvas').dataset.textOverflow==='true')throw Error('封面文字超出可读空间，请缩短后再导出。');const data=$('coverCanvas').toDataURL('image/png');const filename='AI社交内容-'+(state.selected===0?'A':'B')+'-'+Date.now()+'.png';if(typeof window.asteam?.rpc==='function'){try{const r=JSON.parse(window.asteam.rpc(JSON.stringify({method:'file.save',params:{name:filename,mime:'image/png',base64:data.split(',')[1]}})));if(r.error)throw new Error(r.error.message);toast('封面已保存到下载目录');return;}catch{/* Standard browser download fallback. */}}const blob=await new Promise(resolve=>$('coverCanvas').toBlob(resolve,'image/png'));const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('封面已导出为 PNG');}

$('briefForm').addEventListener('submit',e=>{e.preventDefault();generateContent();});
fields.filter(id=>id!=='platform').forEach(id=>$(id).addEventListener('input',()=>{if(booted){scheduleSave();if(state.result)$('resultBadge').textContent='输入已更新 · 可重新生成';}}));
$('topicMode').addEventListener('click',()=>{setMode('topic');scheduleSave();});$('optimizeMode').addEventListener('click',()=>{setMode('optimize');scheduleSave();});
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;setMode('topic');$('topic').value=b.dataset.example;state.brief.topic=b.dataset.example;scheduleSave();$('topic').focus();}));
['resultTitle','resultBody','resultTags','coverHeadline','coverSubtitle'].forEach(id=>$(id).addEventListener('input',()=>{const o=currentOption();if(!o)return;o.explanationStale=true;o.editedAt=Date.now();if(!$('reasons').querySelector('.plan-warning'))$('reasons').prepend(node('p','plan-warning','正文已手动修改。以下是生成时的历史设计依据，尚未重新核查当前文案。'));if(typeof invalidateDesignAudit==='function')invalidateDesignAudit();if(id==='resultTitle'){o.title=$(id).value;$('titleCount').textContent=o.title.length+' 字';}if(id==='resultBody')o.body=$(id).value;if(id==='resultTags')o.tags=$(id).value.split(/[\s#＃,，]+/).filter(Boolean);if(id==='coverHeadline')o.cover.headline=$(id).value;if(id==='coverSubtitle')o.cover.subtitle=$(id).value;if(['resultTitle','resultBody','resultTags'].includes(id)&&typeof invalidateTextReference==='function')invalidateTextReference();renderCover();scheduleSave();}));
$('copyBtn').addEventListener('click',async()=>{const o=currentOption();if(!o)return;try{await copyText(publishText(o));toast('文案已复制，可以去发布了。');}catch(e){toast(e.message,e);}});
$('imageInput').addEventListener('change',e=>uploadImage(e.target.files[0]));$('removeImage').addEventListener('click',()=>{state.brief.image='';showImage();if(typeof renderStarterExampleStatus==='function')renderStarterExampleStatus();renderCover();scheduleSave();});
function setDesignOverride(key,value){const o=currentOption();if(!o)return;o.designOverrides={...o.designOverrides};if(value==='auto')delete o.designOverrides[key];else o.designOverrides[key]=value;state[key]='auto';renderCover();scheduleSave();}
document.querySelectorAll('[data-template]').forEach(b=>b.addEventListener('click',()=>setDesignOverride('template',b.dataset.template)));document.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>setDesignOverride('palette',b.dataset.palette)));
for(const [id,key]of[['imagePosition','position'],['imageBrightness','brightness'],['imageSaturation','saturation']])$(id).addEventListener('input',()=>{const o=currentOption();if(o)o.imageAdjust={position:50,brightness:100,saturation:100,...o.imageAdjust,[key]:Number($(id).value)};else state.adjust[key]=Number($(id).value);renderCover();scheduleSave();});
$('imageFilter').addEventListener('change',()=>{const o=currentOption();if(o)o.imageFilter=$('imageFilter').value;renderCover();scheduleSave();});
$('resetImage').addEventListener('click',()=>{const o=currentOption();if(o){o.imageAdjust={position:50,brightness:100,saturation:100};o.imageFilter='original';}state.adjust={position:50,brightness:100,saturation:100};$('imagePosition').value=50;$('imageBrightness').value=100;$('imageSaturation').value=100;renderCover();scheduleSave();});
$('downloadBtn').addEventListener('click',()=>downloadCover().catch(e=>toast(e.message||'导出失败，请重试。')));
$('newBtn').addEventListener('click',newProject);$('workspaceNav').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('projectsBtn').addEventListener('click',async()=>{try{await loadProjects();$('projectsDialog').showModal();}catch(e){toast(e.message,e);}});
$('saveVersion').addEventListener('click',async()=>{if(busy){toast('当前任务完成后会自动保存版本。');return;}try{await save(true);await loadProjects();toast('当前编辑已保存为新版本');}catch(e){toast(e.message,e);}});
$('historyBtn').addEventListener('click',async()=>{try{$('versionList').replaceChildren();if(projectId){const {versions}=await api('/api/versions/'+projectId);for(const v of versions){const row=node('div','version-row'),info=node('div');info.append(node('p','',v.label),node('small','',new Date(v.created*1000).toLocaleString('zh-CN')));const b=node('button','button outline small','恢复');b.addEventListener('click',async()=>{if(busy){toast('生成完成后可恢复版本。');return;}try{await save(true,'恢复前自动备份');const old=await api('/api/version/'+v.id);state=old.state;state.job=null;applyState();await save();$('historyDialog').close();toast('已恢复该版本，恢复前的编辑也已备份。');}catch(e){toast(e.message,e);}});row.append(info,b);$('versionList').append(row);}}if(!$('versionList').children.length)$('versionList').append(node('p','empty-list','还没有版本。生成方案后会自动记录，也可以点击「保存版本」。'));$('historyDialog').showModal();}catch(e){toast(e.message,e);}});
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&e.offsetX>=d.clientWidth)d.close();}));
window.addEventListener('beforeunload',()=>{readForm();remember();});
async function boot(){
  try{const identity=await api('/api/account');storageIdentity=identity.user?.id||'guest';}catch{}
  let local;try{local=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
  if(local&&((local.identity&&local.identity!==storageIdentity)||(!local.identity&&storageIdentity!=='guest')))local=null;
  if(local?.state?.brief){state={...initialState(),...local.state};projectId=local.id||null;}
  try{applyState();}catch{const draft=state.brief;state=initialState();for(const k of fields)if(typeof draft?.[k]==='string')state.brief[k]=draft[k];if(draft?.mode==='optimize')state.brief.mode='optimize';projectId=null;applyState();showError('草稿格式不完整，已保留可读取的文字。可从「我的项目」重新打开已保存版本。');}booted=true;
  try{const health=await api('/api/health');if(!health.model_ready)showError('模型连接暂不可用，你可以先编辑并保存创作草稿。');if(projectId){try{const remote=await api('/api/projects/'+projectId);if(!local?.state)state=remote.state;}catch(error){projectId=null;if(error.status===404){state=initialState();applyState();remember();}}}
    await loadProjects();if(state.job){startedAt=state.job.started||Date.now();setBusy(true);pollJob();}
  }catch{$('saveStatus').textContent='连接中断 · 本机草稿已保留';}
}
boot();

function renderThemeRecommendations(result){
 const themes=result.themes||[];$('themeRecommendations').hidden=!themes.length;
 $('themeSuggestionList').replaceChildren(...themes.map(t=>{const article=node('article','theme-suggestion');article.append(node('strong','',t.name),node('p','',t.angle),node('small','','推荐依据：'+t.basis));const b=node('button','text-button','用此主题创作');b.type='button';b.disabled=busy;b.addEventListener('click',()=>{if(busy)return;state.brief.creativeTheme=t.name;$('creativeTheme').value=t.name;scheduleSave();generateContent();});article.append(b);return article;}));
}

async function clearCreationHistory(ask=true){
 if(busy){toast('生成完成后可清空历史。');return false;}
 if(ask&&!confirm('清空当前身份的创作历史和当前草稿？账号、积分、内容计划与发布复盘会保留。'))return false;
 clearTimeout(saveTimer);await saveQueue.catch(()=>{});
 try{const result=await api('/api/projects/clear',{});projectId=null;state=initialState();applyState();remember();showError('');await loadProjects();$('saveStatus').textContent='新创作 · 草稿自动保存';localStorage.setItem('resonance.history.cleared',JSON.stringify({identity:storageIdentity,at:Date.now()}));toast('创作历史已清空，可以从新素材开始。');return result;}catch(e){toast(e.message,e);return false;}
}
$('clearHistory').addEventListener('click',()=>clearCreationHistory());

window.addEventListener('storage',event=>{if(event.key!=='resonance.history.cleared')return;let notice;try{notice=JSON.parse(event.newValue);}catch{return;}if(notice?.identity!==storageIdentity)return;clearTimeout(saveTimer);projectId=null;state=initialState();applyState();remember();loadProjects().catch(()=>{});toast('创作历史已在其他标签页清空。');});

$('clearHistoryDialog').addEventListener('click',async()=>{if(await clearCreationHistory())$('projectsDialog').close();});
