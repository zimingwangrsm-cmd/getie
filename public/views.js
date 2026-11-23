'use strict';
const DEMO={image:'/assets/demo-desk.webp'};
let researchRefreshTimer;
function activateView(view){
 if(view==='insights')view='library';
 if(!['home','workbench','library','feedback','plans'].includes(view))view='home';
 document.body.dataset.view=view;
 const tools=document.querySelector('.nav-tools');if(tools)tools.open=['library','feedback'].includes(view);
 clearInterval(researchRefreshTimer);
 for(const [id,key]of[['homeView','home'],['workbenchView','workbench'],['libraryView','library'],['feedbackView','feedback'],['plansView','plans']])$(id).hidden=key!==view;
 for(const [id,key]of[['homeNav','home'],['workspaceNav','workbench'],['libraryNav','library'],['feedbackNav','feedback'],['plansNav','plans']])$(id).classList.toggle('active',key===view);
 $('viewName').textContent={home:'开始体验',workbench:'内容创作',library:'案例与研究',feedback:'发布复盘',plans:'续集创作'}[view];
 const hash=view==='home'?'':'#'+view;if(location.hash!==hash)location.hash=hash;
 window.scrollTo({top:0,behavior:'instant'});
 if(view==='plans'&&typeof loadPlans==='function'){planMode='series';loadPlans();}
 if(view==='workbench'&&typeof syncUnifiedCreation==='function'){syncUnifiedCreation();loadPlans();}
 if(view==='library'){loadLibrary();if(typeof loadInsightHome==='function')loadInsightHome();}
 if(view==='feedback'&&typeof loadReview==='function')loadReview();document.dispatchEvent(new CustomEvent('getie:viewchange',{detail:view}));
}
$('homeNav').addEventListener('click',()=>activateView('home'));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>activateView(b.dataset.view)));
window.addEventListener('hashchange',()=>document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===(location.hash.slice(1)||'home');b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');}));
$('workspaceNav').addEventListener('click',()=>activateView('workbench'));
$('libraryNav').addEventListener('click',()=>activateView('library'));
$('startCreating').addEventListener('click',()=>activateView('workbench'));
$('libraryBack').addEventListener('click',()=>activateView('workbench'));
$('mobileHome').addEventListener('click',()=>activateView('home'));
$('mobileProjects').addEventListener('click',()=>$('projectsBtn').click());
$('mobileNew').addEventListener('click',async()=>{if(await newProject())activateView('workbench');});
$('newBtn').addEventListener('click',()=>activateView('workbench'));
$('recentProjects').addEventListener('click',()=>activateView('workbench'));
$('projectList').addEventListener('click',e=>{if(e.target.closest('button'))activateView('workbench');});
document.querySelectorAll('.demo-image').forEach(img=>{img.src=DEMO.image;});
async function demoImageData(){try{const r=await fetch(DEMO.image);if(!r.ok)return '';const blob=await r.blob();return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});}catch{return '';}}

function actionGlyph(symbol,label){const s=node('span','phone-action',symbol);if(label)s.append(node('small','',label));return s;}
function phone(option,platform,canvas,config={}){
  canvas.dataset.phonePlatform=platform;
  if(platform==='抖音图文')canvas.setAttribute('aria-label','抖音纯图片背景');
  if(platform==='小红书')canvas.setAttribute('aria-label','小红书纯图片内容');
  const style=platform==='Instagram'?'ig':platform==='抖音图文'?'douyin':platform==='微信公众号'?'wechat':'xhs';const root=node('div','phone phone-'+style);const status=node('div','phone-status');status.append(node('span','','9:41'),node('span','','▮▮  ▰'));root.append(status);
  const header=node('div','phone-header');
  if(style==='ig'){header.append(node('span','ig-wordmark','Instagram'),node('span','phone-more','♡  ◇'));root.append(header);const account=node('div','phone-header');account.append(node('span','phone-avatar','创'),node('span','phone-user','your.creative.space'),node('span','phone-more','···'));root.append(account);}
  else if(style!=='douyin'){header.append(node('span','phone-back','‹'));if(style==='wechat'){header.append(node('span','phone-user',''),node('span','phone-more','···'));}else{header.append(node('span','phone-avatar','创'),node('span','phone-user','我的创作'),node('span','phone-follow','关注'),node('span','phone-more','↗'));}root.append(header);}
  const content=node('div','phone-content');
  const caption=node('div','phone-caption');caption.append(node('h4','',option.title),node('p','',option.body));const tags=node('div','phone-tags',(option.tags||[]).map(x=>'#'+x.replace(/^#+/,'')).join(' '));caption.append(tags,node('div','phone-time','内容预览 · 未发布'));
  if(style==='douyin'){const tabs=node('div','douyin-tabs');tabs.append(node('span','','关注'),node('span','','朋友'),node('strong','','推荐'),node('span','','⌕'));content.append(tabs,canvas);const overlay=node('div','douyin-caption');overlay.append(node('strong','','@我的创作'),node('p','',option.title+'\n'+option.body),node('span','',tags.textContent));const acts=node('div','douyin-actions');for(const s of ['♡','◯','☆','↗']){const a=node('span','',s);a.append(node('small','','—'));acts.append(a);}content.append(overlay,acts);root.append(content);const nav=node('div','phone-bottom');for(const text of ['首页','朋友','＋','消息','我'])nav.append(node('span','',text));root.append(nav);}
  else if(style==='wechat'){caption.replaceChildren(node('h4','',option.title),node('div','wechat-author','原创  我的创作  ·  预览时间'));caption.append(canvas,node('p','',option.body));content.append(caption);root.append(content);const bottom=node('div','phone-bottom');bottom.append(node('span','','阅读 —'),node('span','','分享  ♡  在看'));root.append(bottom);}
  else if(style==='ig'){content.append(canvas);const bottom=node('div','phone-bottom');bottom.append(actionGlyph('♡'),actionGlyph('◯'),actionGlyph('↗'),node('span','phone-save','♧'));content.append(bottom,caption);root.append(content);}
  else{content.append(canvas,caption);root.append(content);const bottom=node('div','phone-bottom');bottom.append(node('span','phone-commentbox','说点什么…'),actionGlyph('♡','—'),actionGlyph('☆','—'),actionGlyph('◯','—'));root.append(bottom);}
  root.append(node('div','phone-homebar'));return root;
}
function newCover(){const c=node('canvas');c.width=1080;c.height=1440;c.setAttribute('aria-label','平台帖子封面');return c;}
async function showComparison(options,platform,customPainter=null,config={}){const run=++comparisonRun;$('comparisonPlatform').textContent=platform;$('phoneComparison').replaceChildren();$('predictionComparison').replaceChildren();for(const [i,o] of options.entries()){const wrap=node('article','phone-wrap');wrap.append(node('h3','',(config.labels?.[i]||(customPainter?i===0?'原稿':'设计优化':'方案 '+String.fromCharCode(65+i)))+' · '+(o.angle||'图文预览')));const canvas=newCover();wrap.append(phone(o,platform,canvas));if(typeof appendFullCopy==='function')appendFullCopy(wrap,o);$('phoneComparison').append(wrap);if(customPainter)await customPainter(canvas,i);else await renderCover(canvas,o);}$('compareDialog').showModal();if(config.estimate===false)return;if(platform==='小红书')await loadPrediction(options,$('predictionComparison'),run);else $('predictionComparison').append(node('p','model-note','该平台暂不提供流行度预测。'));}
function predictionRow(o){const body=String(o.body||'');const tags=(o.tags||[]).map(t=>'#'+t.replace(/^#+/,''));return {title:o.title||'',body:(body+'\n'+tags.filter(t=>!body.includes(t)).join(' ')).trim().slice(0,12000),tags:o.tags||[],image_num:o.image_num||1};}
async function loadPrediction(options,target,run){return predictionGraphic(options,target,'小红书',()=>run===comparisonRun);}

let libraryExamples=[],selectedCategory='全部',selectedPopularity='all',casePopularity=new Map(),libraryLoad=null;
function groupCasePopularity(examples){
 const groups=new Map(),result=new Map();
 for(const e of examples){const m=e.metrics||{},values=['likes','collects','comments'].map(k=>m[k]);if(!Number.isFinite(m.impressions)||m.impressions<=0||values.some(v=>!Number.isFinite(v)||v<0))continue;const row={id:e.id,rate:values.reduce((a,b)=>a+b,0)/m.impressions};if(!groups.has(e.category))groups.set(e.category,[]);groups.get(e.category).push(row);}
 for(const rows of groups.values()){
  const sorted=rows.map(r=>r.rate).sort((a,b)=>a-b),low=sorted[Math.floor((sorted.length-1)*.25)],high=sorted[Math.ceil((sorted.length-1)*.75)];
  for(const row of rows)result.set(row.id,{rate:row.rate,level:rows.length<4?'middle':row.rate>0&&row.rate>=high&&row.rate>low?'high':row.rate<=low?'low':'middle'});
 }
 return result;
}

async function loadLibrary(force=false){
 if(libraryLoad)return libraryLoad;
 if(libraryExamples.length&&!force){renderLibrary();return;}
 const status=$('libraryStatus');status.textContent='正在加载案例…';
 libraryLoad=(async()=>{try{
  const data=await api('/api/research');libraryExamples=data.reference_examples||data.examples||[];casePopularity=groupCasePopularity(libraryExamples);renderCreativeExamples(data.creative_examples||[]);
  const categories=['全部',...new Set(libraryExamples.map(x=>x.category))];if(!categories.includes(selectedCategory))selectedCategory='全部';
  $('categoryFilters').replaceChildren(...categories.map(c=>{const b=node('button',c===selectedCategory?'selected':'',c);b.type='button';b.setAttribute('aria-pressed',String(c===selectedCategory));b.addEventListener('click',()=>{selectedCategory=c;renderLibrary();});return b;}));renderLibrary();
 }catch{status.replaceChildren(document.createTextNode('案例暂时无法加载。'),Object.assign(node('button','text-button','重试'),{type:'button',onclick:()=>loadLibrary(true)}));}})();
 try{return await libraryLoad;}finally{libraryLoad=null;}
}
function renderLibrary(){for(const b of document.querySelectorAll('#categoryFilters button')){const selected=b.textContent===selectedCategory;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}const query=$('librarySearch').value.trim().toLowerCase();let examples=libraryExamples.filter(e=>(selectedPopularity==='all'||casePopularity.get(e.id)?.level===selectedPopularity)&&(typeof relatedIds==='undefined'||relatedIds===null||relatedIds.has(e.id))&&(!$('pairedOnly').checked||e.pair_id)&&(selectedCategory==='全部'||e.category===selectedCategory)&&(!query||(e.title+e.body+e.tags.join(' ')).toLowerCase().includes(query)));if(selectedPopularity!=='all')examples.sort((a,b)=>selectedPopularity==='high'?casePopularity.get(b.id).rate-casePopularity.get(a.id).rate:casePopularity.get(a.id).rate-casePopularity.get(b.id).rate);for(const b of document.querySelectorAll('#popularityFilters button[data-popularity]')){const selected=b.dataset.popularity===selectedPopularity;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}$('libraryStatus').textContent='共 '+examples.length+' 篇'+(selectedPopularity==='high'?' · 同类较高表现':selectedPopularity==='low'?' · 同类较低表现':'')+($('pairedOnly').checked?' · 同主题配对':'');$('resetLibraryFilters').hidden=!query&&selectedCategory==='全部'&&!$('pairedOnly').checked&&selectedPopularity==='all';$('exampleGrid').replaceChildren(...examples.map(e=>{const card=node('article','example-card'),cover=node('div','example-cover');card.dataset.caseId=e.id;card.dataset.popularity=casePopularity.get(e.id)?.level||'unknown';if(e.thumbnail){cover.classList.add('original-gallery');cover.tabIndex=0;cover.setAttribute('aria-label','原图组，可横向滚动');for(const [i,src] of (e.images?.length?e.images:[e.thumbnail]).entries()){const img=node('img');img.src=src;img.alt=e.title+' · 原图 '+(i+1);img.loading='lazy';cover.append(img);}}else cover.append(node('small','','原始图片待恢复'),node('p','',''+e.image_status));const content=node('div','example-card-content');content.append(node('small','pair-topic',e.pair_theme?'配对主题：'+e.pair_theme:'历史主题参考 · '+e.category),node('h3','',e.title));const level=casePopularity.get(e.id)?.level;if(level==='high'||level==='low')content.append(node('span','case-performance '+level,level==='high'?'同类较高表现':'同类较低表现'));content.append(node('p','',e.body),node('div','example-tags',e.tags.map(t=>'#'+t).join(' ')));const metrics=node('div','example-metrics');for(const [k,label]of[['likes','点赞'],['collects','收藏'],['comments','评论']]){const m=node('div');m.append(node('strong','',e.metrics?.[k]?.toLocaleString()??'—'),node('span','',label));metrics.append(m);}content.append(metrics);const actions=node('div','example-actions');const b=node('button','text-button','以此为原稿创作 ↗');b.addEventListener('click',()=>applyStarterExample(e));const compare=node('button','text-button','查看固定同主题对照');compare.addEventListener('click',()=>showHistoricalCompare(e));compare.hidden=!e.pair_id;const series=node('button','text-button','从这篇延展续集');series.addEventListener('click',()=>startSeriesFromExample(e));actions.append(b,compare,series);content.append(actions);card.append(cover,content);return card;}));if(!examples.length)$('exampleGrid').append(node('p','empty-list','没有找到相关笔记，试试其他关键词或清除筛选。'));}
function drawHistorical(canvas,example){const ctx=canvas.getContext('2d');ctx.fillStyle='#e6ecdf';ctx.fillRect(0,0,1080,1440);ctx.textBaseline='top';ctx.fillStyle='#60774f';ctx.font='28px sans-serif';ctx.fillText(example.category+' / 历史笔记',70,90);ctx.font='bold 78px "PingFang SC","Microsoft YaHei",sans-serif';wrap(ctx,example.title,65,250,950,110,7);ctx.font='30px sans-serif';wrap(ctx,example.tags.map(t=>'#'+t).join(' '),70,1110,940,48,3);ctx.fillStyle='#fff';ctx.fillRect(50,1310,980,80);ctx.fillStyle='#536943';ctx.font='28px sans-serif';ctx.fillText('文字内容重排 · 未取得原始封面',75,1335);}
async function showHistoricalCompare(example){try{const result=await api('/api/compare-samples',{id:example.id});const box=node('div','model-note');if(!result.match){comparisonRun++;box.textContent=result.message;$('comparisonPlatform').textContent='小红书';$('phoneComparison').replaceChildren();$('predictionComparison').replaceChildren(box);$('compareDialog').showModal();return;}const a=example,b=result.match;await showComparison([a,b],'小红书',async(canvas,i)=>{const sample=[a,b][i];if(sample.thumbnail){const img=await getImage(sample.thumbnail);canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);}else{drawHistorical(canvas,sample);}},{labels:['历史样本 A','历史样本 B'],estimate:false});box.append(node('strong','','历史观察性对照 · 不是同一作品优化前后'));box.append(node('p','',result.controls));for(const item of [a,b])box.append(node('p','',`${item.title}：历史点赞 ${item.metrics.likes}，收藏 ${item.metrics.collects}，评论 ${item.metrics.comments}；曝光 ${item.metrics.impressions}。`));box.append(node('p','',result.limitations));$('predictionComparison').append(box);}catch(e){toast(e.message,e);}}
$('resetLibraryFilters').addEventListener('click',()=>{selectedCategory='全部';$('librarySearch').value='';$('pairedOnly').checked=false;selectedPopularity='all';renderLibrary();});
document.querySelectorAll('#popularityFilters button[data-popularity]').forEach(b=>b.addEventListener('click',()=>{selectedPopularity=b.dataset.popularity;renderLibrary();}));
$('librarySearch').addEventListener('input',renderLibrary);$('pairedOnly').addEventListener('change',renderLibrary);
const initialView=location.hash.slice(1);if(initialView!=='account')activateView(['workbench','library','feedback','insights','plans'].includes(initialView)?initialView:'home');
$('compareDialog').addEventListener('close',()=>{comparisonRun++;});
window.addEventListener('hashchange',()=>{const view=location.hash.slice(1);if(view!=='account')activateView(['workbench','library','feedback','insights','plans'].includes(view)?view:'home');});
let comparisonRun=0;

let starterExamples=[],exampleLoading=false;
async function loadStarterExamples(){
 try{const data=await api('/api/research');starterExamples=[...(data.starter_examples||data.examples||[]),{id:'complete-coffee',kind:'demo',title:'周末咖啡课',thumbnail:'/assets/demo-coffee.webp'}];
 const placeholder=node('option','','选择示例，自动带入图文');placeholder.value='';
 $('realExampleSelect').replaceChildren(placeholder,...starterExamples.map(e=>{const o=node('option','',(e.kind==='creator'?'我的实拍':e.kind==='demo'?'创作示例':'历史笔记 · '+e.category)+' · '+e.title);o.value=e.id;return o;}));renderStarterExampleStatus();offerIncomingExample();
 }catch{$('realExampleStatus').textContent='示例暂时无法载入，可以上传图片或直接创作。';}
}
function clearIncomingExample(){const url=new URL(location.href);url.searchParams.delete('sample');history.replaceState(null,'',url);$('incomingExample').hidden=true;}
function offerIncomingExample(){const id=new URLSearchParams(location.search).get('sample'),example=starterExamples.find(e=>e.id===id);if(!example)return;$('incomingExampleTitle').textContent='教程素材：'+example.title;$('incomingExample').hidden=false;}
$('applyIncomingExample').addEventListener('click',async()=>{if(!booted||busy||exampleLoading){toast('请等待当前内容载入完成。');return;}const example=starterExamples.find(e=>e.id===new URLSearchParams(location.search).get('sample'));if(example&&await applyStarterExample(example))clearIncomingExample();});
$('cancelIncomingExample').addEventListener('click',clearIncomingExample);
function renderStarterExampleStatus(){
 if(state.demoProject){$('realExampleSelect').value=({'portugal-r4':'creator-portugal-sunset','desk-r4':'demo-desk-two-angles',coffee:'complete-coffee'})[state.demoProject]||'';$('realExampleStatus').textContent='完整示例 · 原图、文案与平台设置已同步，可继续编辑。';return;}
 const e=starterExamples.find(x=>x.id===state.brief.sourceExample?.id);
 $('realExampleSelect').value=e?.id||'';
 if(!e){$('realExampleStatus').textContent='选择后自动同步图片、标题和正文，替换当前素材。';return;}
 if(e.kind==='creator'||e.kind==='demo'){$('realExampleStatus').textContent=(e.kind==='creator'?'我的实拍':'创作示例')+' · 完整图文已带入，暂无真实发布互动数据。';return;}
 $('realExampleStatus').replaceChildren(document.createTextNode('历史笔记 · 点赞 '+e.metrics.likes+' / 收藏 '+e.metrics.collects+' / 评论 '+e.metrics.comments+'。'+(e.thumbnail?(state.brief.image?'已同步来源原图。':'原图已可用，可重新带入。'):'暂无可用图片。')));
 const link=node('a','text-button','查看来源 ↗');link.href=e.source_url;link.target='_blank';link.rel='noopener noreferrer';$('realExampleStatus').append(link);if(e.thumbnail&&!state.brief.image){const reload=node('button','text-button','补全这篇帖子的原图');reload.type='button';reload.addEventListener('click',()=>applyStarterExample(e));$('realExampleStatus').append(reload);}
}
async function applyStarterExample(e){
 const scene=({'creator-portugal-sunset':'portugal-r4','demo-desk-two-angles':'desk-r4','complete-coffee':'coffee'})[e.id];if(scene&&typeof loadCreationExample==='function'){const loaded=await loadCreationExample(scene);renderStarterExampleStatus();return loaded;}
 if(busy||exampleLoading){toast('请等待当前操作完成。');return false;}
 if(hasCurrentContent()&&!confirm('将用这个示例的图文替换当前素材，旧创作会保留在历史记录中。继续吗？')){renderStarterExampleStatus();return false;}
 exampleLoading=true;$('realExampleSelect').disabled=true;$('generateBtn').disabled=true;if(typeof renderIntentChoices==='function')renderIntentChoices();
 const identity=storageIdentity,startedState=state,startedBrief=JSON.stringify(state.brief);
 try{
  let image='';if(e.thumbnail){const response=await fetch(e.thumbnail);if(!response.ok)throw new Error('示例图片读取失败，当前内容未改动，请稍后重试。');const blob=await response.blob();image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsDataURL(blob);});await getImage(image);}
  if(identity!==storageIdentity||busy||state!==startedState||JSON.stringify(state.brief)!==startedBrief)throw new Error('创作状态已变化，请重新选择示例。');
  if(!await newProject())return false;
  state.brief={...initialBrief(),platform:'小红书',model:platformConfig('小红书').model,goal:'流行度',tone:platformConfig('小红书').tone,mode:'optimize',originalTitle:e.title,originalBody:e.body,additionalPrompt:e.material_context||'',image,creativeTheme:e.theme||'',sourceExample:{id:e.id,kind:e.kind||'historical',source:e.source,source_url:e.source_url,note_idx:e.note_idx}};
  applyState();activateView('workbench');await save();renderStarterExampleStatus();toast(e.thumbnail?'示例图片与文案已同步替换。':'真实原文已带入；原图待恢复，旧图已清除。');return true;
 }catch(error){renderStarterExampleStatus();toast(error.message,error);return false;}
 finally{exampleLoading=false;$('realExampleSelect').disabled=busy;$('generateBtn').disabled=busy;if(typeof renderIntentChoices==='function')renderIntentChoices();if(typeof syncCreationExamples==='function')syncCreationExamples();if(typeof syncUnifiedCreation==='function')syncUnifiedCreation();}
}
$('realExampleSelect').addEventListener('change',()=>{const e=starterExamples.find(x=>x.id===$('realExampleSelect').value);if(e)applyStarterExample(e);});
function renderCreativeExamples(examples){
 $('creativeCaseList').replaceChildren(...examples.map(e=>{
 const card=node('article','creative-case panel'),image=node('img');image.src=e.thumbnail;image.alt=e.source+' · '+e.title;image.loading='lazy';const content=node('div');
 content.append(node('small','eyebrow',e.kind==='creator'?'我的实拍':'创作示例'),node('h2','',e.title),node('p','complete-example-copy',e.body));
 const actions=node('div','example-actions'),start=node('button','button outline','带入这份素材');start.type='button';start.addEventListener('click',()=>applyStarterExample(e));
 const compare=node('button','text-button','查看两种完整表达 →');compare.type='button';compare.addEventListener('click',()=>showExampleDesigns(e));actions.append(start,compare);content.append(actions);card.append(image,content);return card;
 }));
}
loadStarterExamples();
