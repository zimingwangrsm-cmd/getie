'use strict';
let intentTimer,previewRun=0,homeRun=0,displayedHomePlatform,heroRun=0,heroDirection='original';
const AXIS_LABELS={tone:'表达风格',theme:'创作主题',audience:'目标人群',goal:'创作目标'};
const INTENT_CHOICES={
 goal:[['流行度','流行度','比较文案的流行度潜力']],
 audience:[['','由 AI 推荐','根据素材提出可核对的人群假设'],['旅行摄影爱好者','旅行摄影','关注路线、景观与摄影机位'],['海外生活与迁居关注者','海外生活','关注居住体验、生活成本与选择依据'],['都市品质生活人群','品质生活','关注餐饮、审美、休闲与生活体验'],['家居收纳与租房人群','家居租房','关注空间利用、收纳与预算'],['美妆穿搭爱好者','美妆穿搭','关注妆效、风格与适用场景'],['美食探店与烘焙人群','美食烘焙','关注口味、做法与餐饮体验'],['数码与效率工具爱好者','数码效率','关注设备体验、效率与使用场景']],
 tone:[['自然真实，保留个人表达','自然口语','像日常交流，少用套话'],['实用清晰，信息优先','严谨清晰','定义准确，逻辑明确'],['轻松有趣，有生活感','轻松幽默','轻松表达，避免过度夸张'],['温暖细腻，有故事感','温暖细腻','关注具体感受与细节'],['克制简洁，有设计感','克制简洁','用词精炼，减少修饰'],['鲜明有力，观点明确但不过度断言','鲜明有力','突出观点，说明依据与边界']]
};
function readIntentForm(){
 const b=state.brief;if($('planXhsNotes'))b.platformNotes={'小红书':$('planXhsNotes').value,'抖音图文':$('planDouyinNotes').value};b.goal='流行度';$('goal').value='流行度';b.model=$('modelSelect').value;
 if($('extraCompare').checked){b.count=2;b.comparisonAxis='theme';b.compareValue=$('compareValue').value;}
 const first={theme:b.creativeTheme||b.topic,audience:b.audience,goal:b.goal,tone:b.tone};
 b.variants=[first];if(b.count===2)b.variants.push({...first,[b.comparisonAxis]:b.compareValue.trim()});
 $('designMode').value=b.count===2?'compare':'single';
}
function syncIntentForm(){
 const b=state.brief,p=platformConfig(b.platform);b.goal='流行度';$('goal').value='流行度';if(b.comparisonAxis==='goal'){b.count=1;b.compareValue='';}$('globalPlatform').value=b.platform;$('platformContext').textContent=p.context;
 $('creativeTheme').value=b.creativeTheme||'';$('modelSelect').value=b.model||p.model;
 $('extraCompare').checked=b.count===2&&b.comparisonAxis==='theme';
 $('comparisonAxis').value='theme';$('compareValue').value=b.compareValue||'';updateComparisonControls();document.body.dataset.platform=p.key;
 document.querySelector('.publish-hint').textContent=b.platform==='小红书'?'素材导出后，请本人上传并选择「仅自己可见」。打开入口不会自动设置隐私或发布。':'这里只准备素材并打开'+b.platform+'入口。请本人确认可见范围后发布。';
 if($('planXhsNotes')){const notes=b.platformNotes||{};$('planXhsNotes').value=notes['小红书']||'';$('planDouyinNotes').value=notes['抖音图文']||'';}if(typeof restoreCreationPlatforms==='function')restoreCreationPlatforms();if(displayedHomePlatform!==b.platform){displayedHomePlatform=b.platform;renderHomeExamples();}
}
function renderIntentChoices(){
 for(const axis of ['goal','audience','tone']){
  const b=state.brief,values=INTENT_CHOICES[axis].map(v=>[...v]);if(axis==='goal')b.goal='流行度';
  const customs=new Set(b.customChoices?.[axis]||[]);
  for(const v of (axis==='goal'?[]:[b[axis],...(b.count===2&&b.comparisonAxis===axis?[b.compareValue]:[]),...customs]))if(v&&!values.some(x=>x[0]===v))values.push([v,v,'自定义创作要求']);
  $(axis+'Choices').replaceChildren(...values.map(([value,label,description])=>{
   const primary=b[axis]===value,secondary=!(typeof isMultiCreation==='function'&&isMultiCreation())&&b.count===2&&b.comparisonAxis===axis&&b.compareValue===value,selected=primary||secondary;
   const wrap=node('span','intent-chip'),button=node('button','intent-choice'+(selected?' selected':''),label);button.type='button';button.dataset.axis=axis;button.dataset.value=value;button.title=description;button.setAttribute('aria-pressed',String(selected));button.disabled=busy||exampleLoading;
   if(selected&&b.count===2&&!(typeof isMultiCreation==='function'&&isMultiCreation())){button.append(node('small','selection-letter',primary?'A':'B'));}
   button.addEventListener('click',()=>chooseIntent(axis,value));wrap.append(button);
   if(customs.has(value)){const remove=node('button','remove-choice','×');remove.type='button';remove.disabled=busy||exampleLoading;remove.setAttribute('aria-label','删除'+label);remove.addEventListener('click',()=>{if(busy||exampleLoading)return;const b=state.brief;if(b[axis]===value)chooseIntent(axis,value);else if(secondary)chooseIntent(axis,value);b.customChoices[axis]=b.customChoices[axis].filter(v=>v!==value);renderIntentChoices();scheduleSave();});wrap.append(remove);}
   return wrap;
  }));
  for(const element of document.querySelectorAll('[data-add-choice="'+axis+'"],#custom'+axis))element.disabled=busy||exampleLoading;
 }
}
function chooseIntent(axis,value){
 if(busy||exampleLoading||axis==='goal')return;const b=state.brief;if(typeof isMultiCreation==='function'&&isMultiCreation()){b[axis]=value;b.count=1;b.compareValue='';$(axis).value=value;updateComparisonControls();scheduleSave();return;}const pair=b.count===2&&b.comparisonAxis===axis;
 if(value===b[axis]){if(pair){b[axis]=b.compareValue;b.compareValue='';b.count=1;}else b[axis]='';}
 else if(pair&&b.compareValue===value){b.count=1;b.compareValue='';}
 else if(pair){toast('最多比较两个选项，请先取消一个。');return;}
 else if(!b[axis]||!value){b[axis]=value;}
 else if(b.count===2){toast('当前正在比较'+AXIS_LABELS[b.comparisonAxis]+'，请先只保留方向 A，再比较其他维度。');return;}
 else{b.count=2;b.comparisonAxis=axis;b.compareValue=value;$('extraCompare').checked=false;}
 $(axis).value=b[axis];updateComparisonControls();scheduleSave();
}
function addCustomChoice(axis){
 if(busy||exampleLoading)return;const input=$('custom'+axis),value=input.value.trim(),status=$(axis+'ChoiceStatus');
 const choices=state.brief.customChoices?.[axis]||[];
 if(!value){status.textContent='先填写一个标签。';return;}
 if(value.length>120){status.textContent='标签最多 120 字。';return;}
 if(choices.includes(value)||INTENT_CHOICES[axis].some(x=>x[0]===value||x[1]===value)){status.textContent='这个标签已经存在。';return;}
 if(choices.length>=8){status.textContent='每个维度最多保留 8 个自定义标签，可先删除旧标签。';return;}
 state.brief.customChoices={...state.brief.customChoices,[axis]:[...choices,value]};input.value='';status.textContent='已添加，点击标签即可选用。';renderIntentChoices();scheduleSave();
}
for(const axis of ['audience','tone']){
 document.querySelector('[data-add-choice="'+axis+'"]').addEventListener('click',()=>addCustomChoice(axis));
 $('custom'+axis).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addCustomChoice(axis);}});
}
$('keepSingle').addEventListener('click',()=>{if(busy)return;state.brief.count=1;state.brief.compareValue='';$('extraCompare').checked=false;updateComparisonControls();scheduleSave();});
function updateComparisonControls(){
 const b=state.brief,extra=$('extraCompare').checked;$('comparisonControls').hidden=!extra;$('keepSingle').hidden=b.count!==2;$('keepSingle').disabled=busy;
 $('compareValueLabel').textContent='方向 B 的创作主题';
 $('generationSummary').textContent=b.count===2?'比较生成 · 仅改变'+AXIS_LABELS[b.comparisonAxis]+'：'+(b[b.comparisonAxis==='theme'?'creativeTheme':b.comparisonAxis]||'AI 推荐')+' / '+(b.compareValue||'待填写'):'定向生成 · 1 套方案 · 未选维度由 AI 推荐';
 $('designMode').value=b.count===2?'compare':'single';if(!busy)$('generateBtn').firstElementChild.textContent=b.count===2?'比较生成两套方案':'定向生成一套方案';renderIntentChoices();if(typeof renderGenerationCost==='function')renderGenerationCost();if(typeof syncUnifiedCreation==='function')syncUnifiedCreation();
}
async function changePlatform(name){
 if(busy){$('globalPlatform').value=state.brief.platform;toast('当前设计生成完成后可切换平台。');return;}
 const old=state.brief.platform;readForm();state.brief.platform=old;
 state.platformDrafts=state.platformDrafts||{};
 state.platformDrafts[old]=structuredClone({brief:state.brief,result:state.result,selected:state.selected,sourceBrief:state.sourceBrief,planLink:state.planLink});
 const saved=state.platformDrafts[name];
 if(saved){Object.assign(state,structuredClone(saved));if(!saved.planLink)delete state.planLink;}
 else {state.brief={...structuredClone(state.brief),platform:name};state.result=null;state.sourceBrief=null;state.selected=0;delete state.planLink;}
 try{localStorage.setItem('resonance.platform',name);}catch{}
 applyState();if(!$('feedbackView').hidden&&typeof loadReview==='function')loadReview();if(!$('libraryView').hidden)loadLibrary();scheduleSave();
 toast(saved?'已恢复'+name+'的稿件与创作选择。':'已保留创作选择，开始'+name+'独立版本；切回可恢复原稿。');
}
$('globalPlatform').addEventListener('change',e=>changePlatform(e.target.value));$('platform').addEventListener('change',e=>changePlatform(e.target.value));
$('modelSelect').addEventListener('change',()=>{scheduleSave();updateComparisonControls();});
$('extraCompare').addEventListener('change',()=>{state.brief.count=$('extraCompare').checked?2:1;state.brief.comparisonAxis=$('comparisonAxis').value;state.brief.compareValue=$('compareValue').value;updateComparisonControls();scheduleSave();});
$('comparisonAxis').addEventListener('change',()=>{const axis=$('comparisonAxis').value;$('compareValue').value=axis==='theme'?'桌面好物分享':'关注居家办公效率的上班族';readIntentForm();updateComparisonControls();scheduleSave();});
$('compareValue').addEventListener('input',()=>{readIntentForm();updateComparisonControls();scheduleSave();});
// Homepage demonstrations are independent of the active project and model quota.
function renderHomeExamples(){}
function refreshIntentResults(){clearTimeout(intentTimer);intentTimer=setTimeout(renderIntentResults,300);}
function invalidateTextReference(){
 clearTimeout(intentTimer);previewRun++;$('resultPreviews').replaceChildren();
 const note=node('p','prediction-unavailable','文案已改动，原预览与评分已失效。'),button=node('button','text-button','更新图文预览与评分');button.type='button';button.id='refreshTextReference';button.addEventListener('click',refreshIntentResults);$('resultPrediction').replaceChildren(note,button);
}
async function renderIntentResults(){
 const run=++previewRun,platform=state.brief.platform,options=state.result?.options||[];$('resultPreviews').replaceChildren();$('resultPrediction').replaceChildren();
 $('publishBtn').disabled=!options.length||busy||(state.result?.platform||state.sourceBrief?.platform||platform)!==platform;
 if(!options.length)return;
 $('resultPreviews').classList.toggle('single-preview',options.length===1);
 for(const [i,o]of options.entries()){const article=node('article','phone-wrap');article.append(node('h3','',options.length===1?'当前设计':`方向 ${String.fromCharCode(65+i)} · ${o.design?.theme||o.angle}`));const c=newCover();article.append(phone(o,platform,c));if(o.design)article.append(node('p','composition-note',o.design.composition));$('resultPreviews').append(article);await renderCover(c,o,{platform});if(run!==previewRun)return;}
 let comparison=options,labels=options.map((o,i)=>options.length===1?'当前设计':'方向 '+String.fromCharCode(65+i));
 if(state.sourceBrief?.mode==='optimize'&&(state.sourceBrief.originalTitle?.trim()||state.sourceBrief.originalBody?.trim())){comparison=[{title:state.sourceBrief.originalTitle,body:state.sourceBrief.originalBody,tags:[],design:{goal:state.brief.goal}},...options];labels=[state.demoProject?'演示初稿':'原稿',...labels];}
 await predictionGraphic(comparison,$('resultPrediction'),platform,()=>run===previewRun,labels,comparison!==options?'original':'direction');
}
async function predictionGraphic(options,target,platform,isCurrent,labels=options.map((_,i)=>'方向 '+String.fromCharCode(65+i)),referenceKind='direction'){
 if(platform!=='小红书'){target.replaceChildren(node('p','prediction-unavailable',platform+'：尚无经验证的参与预测模型，不沿用小红书分数。'));return;}
 target.replaceChildren(node('p','prediction-unavailable','正在评估流行度…'));
 try{const data=await api('/api/popularity',{options:options.map(predictionRow)});if(!isCurrent())return;if(!data.ready){target.replaceChildren(node('p','',data.message));return;}
 const chart=node('div','prediction-chart prediction-compact'),original=referenceKind==='original',evaluation=data.comparison;
 chart.append(node('strong','',original?'文案优化筛选':'方向评分对照'));
 if(data.engine!=='rednoob'||data.metric!=='wlaes'||!evaluation?.ready||data.predictions.length!==options.length){target.replaceChildren(node('p','prediction-unavailable','本次评分无法核对，暂不推荐替换原稿。'));return;}
 if(options.length<2)chart.append(node('p','prediction-boundary','带入原稿后，可查看优化前后的变化。'));
 else {
  const improved=evaluation.candidates.filter(c=>c.status==='improved'),best=evaluation.recommendation_index;
  chart.dataset.recommendation=String(best);
  const recommendation=node('p','prediction-recommendation',original?(best>0?'优先考虑'+labels[best]+'，发布前仍需核对内容。':evaluation.candidates.some(c=>c.status==='lower')?'建议保留原稿，候选内容需继续调整。':'暂未发现更高评分的方案，建议保留原稿。'):'仅比较表达方向，不代表优化效果。');
  recommendation.setAttribute('role','status');chart.append(recommendation);
  const extent=Math.max(10,...improved.map(c=>c.score_change_pct||0));
  for(const c of evaluation.candidates){
   const label=labels[c.index],row=node('div','uplift-row'),value=node('strong','uplift-value');row.dataset.status=c.status;row.append(node('span','',label));
   if(c.status==='improved'&&Number.isFinite(c.score_change_pct)){
    row.classList.add('positive');value.textContent='约 +'+Math.round(c.score_change_pct)+'%';
    const track=node('div','uplift-track'),bar=node('span','uplift-fill');bar.style.width=(c.score_change_pct/extent*100)+'%';bar.style.left='0';track.append(bar);track.setAttribute('role','img');track.setAttribute('aria-label',label+' 相对 '+labels[0]+' 的文本流行度评分变化 '+value.textContent);row.append(track,value);
   }else{
    row.classList.add('neutral','uplift-status');value.textContent=c.status==='unavailable'?'评分不可用':c.status==='improved'?'评分较高':c.status==='lower'?'评分较低':'评分接近';row.append(value);
   }
   chart.append(row);
  }
  if(original&&best===0){const retained=node('details','retained-original');retained.append(node('summary','','查看建议保留的原稿'),node('h4','',options[0].title),node('p','',options[0].body),node('p','',(options[0].tags||[]).map(t=>'#'+t).join(' ')));chart.append(retained);}
 }
 chart.append(node('p','prediction-boundary','文本评分预估，仅供选稿参考。'));target.replaceChildren(chart);
 }catch{if(isCurrent())target.replaceChildren(node('p','prediction-unavailable','预测暂时不可用，仍可编辑与导出。'));}
}
$('compareBtn').addEventListener('click',renderIntentResults);
$('publishBtn').addEventListener('click',()=>preparePublishing());
async function setupIntent(){
 state.brief={...initialBrief(),...state.brief};syncIntentForm();
 try{const config=await api('/api/config');$('modelSelect').replaceChildren(...config.models.map(m=>{const o=node('option','',m.label+(m.id==='gpt-6.1-sol'?' · VIP':''));o.value=m.id;return o;}));$('modelSelect').value=state.brief.model||platformConfig(state.brief.platform).model;}catch{}
 refreshIntentResults();
}
setupIntent();
