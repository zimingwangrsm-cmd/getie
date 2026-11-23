'use strict';
let seriesDemoPending=null,seriesInputRevision=0;
for(const id of ['planSourceText','seriesQuestions','planRequest'])$(id).addEventListener('input',()=>seriesInputRevision++);
$('seriesStrategy').addEventListener('change',()=>seriesInputRevision++);
async function ensureDemoSeries(force=false){
 if(seriesDemoPending)return seriesDemoPending;
 const identity=storageIdentity,revision=seriesInputRevision;
 seriesDemoPending=(async()=>{try{const plan=await api('/api/plans/example',{scene:'series-desk-r4'});if(identity!==storageIdentity)return null;
  if(revision===seriesInputRevision&&!planPending&&!planLoading){
   if(force||!$('planSourceText').value.trim()){$('planSourceText').value=plan.data.source.title+'\n\n'+plan.data.source.body;planSourceImage=plan.data.source.image;rememberPlanSource();}
   if(force||!$('seriesQuestions').value.trim())$('seriesQuestions').value=plan.data.reader_questions||'';
   if(force||!$('planRequest').value.trim())$('planRequest').value='沿用分区思路，给后续内容增加可执行的方法；缺少尺寸与经历时先列素材清单。';
   $('seriesStrategy').value='mixed';$('planSourceStatus').textContent='已带入书桌续集演示。追问为合成示例；可全部替换。';
  }
  return plan;
 }catch(e){planMessage(e.message,e);return null;}finally{seriesDemoPending=null;}})();return seriesDemoPending;
}
function renderReviewDemo(force=false){
 const root=$('reviewDemo');if(!root)return;root.hidden=reviewRecords.length>0&&!force;if(root.hidden)return;
 root.replaceChildren();const heading=node('div','demo-summary-row');heading.append(node('h2','','同一账号、同一主题，怎样复盘？'),node('span','demo-data-badge','小红书演示 · 非真实发布'));root.append(heading,node('p','','书桌布局示例：互动口径为点赞 + 收藏 + 评论。两篇都回答“怎样把桌面变清爽”，把泛泛的整理感受改成分区与收线步骤。账号、粉丝数、图片和24小时窗口保持一致。'));
 const grid=node('div','demo-metric-grid');for(const item of [{label:'原表达',title:'今天也想把书桌整理一下',body:'窗边的桌面，电脑、纸笔、杯子和绿植。把东西摆一摆，看着舒服一点。\n\n想让书桌清爽，你会先从哪里开始？',likes:48,collects:24,comments:8,rate:4},{label:'具体步骤表达',title:'桌面变清爽，先把书桌分成这3块',body:'① 中间留工作区，给电脑与手臂留出操作空间。\n② 一侧放纸笔，常用物件用完回到同一处。\n③ 边角放绿植和水杯，与电脑保持距离。\n\n沿桌后收线，把最常用的那一根留在顺手处。先清出一块空白，再决定要不要买收纳盒。\n\n你书桌上最难安置的是什么？',likes:60,collects:40,comments:12,rate:5.6}]){
  const card=node('article','demo-metric-card'),image=node('img','review-demo-image');image.src='/assets/demo-desk.webp';image.alt='两篇复盘示例沿用同一张书桌照片';card.append(image,node('small','eyebrow',item.label),node('h3','',item.title));const full=node('details');full.open=true;full.append(node('summary','','完整示例文案'),node('p','',item.body+'\n\n#书桌收纳 #桌面布局 #个贴创作辅助'));card.append(full);const metrics=node('div','demo-metric-line');metrics.append(node('span','','曝光 2,000'),node('span','','点赞 '+item.likes),node('span','','收藏 '+item.collects),node('span','','评论 '+item.comments));card.append(metrics,node('p','',item.rate.toFixed(1)+'% 互动 / 曝光（演示）'));const track=node('div','demo-rate-bar'),fill=node('span');fill.style.width=item.rate/6*100+'%';track.setAttribute('role','img');track.setAttribute('aria-label',item.label+'演示互动率'+item.rate+'%');track.append(fill);card.append(track);grid.append(card);
 }
 root.append(grid,node('p','','演示观察：互动 / 曝光从4.0%到5.6%，相对变化约 +40%。示例粉丝均为1,200、未投流、同一张图、发布后24小时采集；不同推荐受众与时间仍可能影响结果，不能证明设计造成增长。'));
 const reflection=node('details');reflection.open=true;reflection.append(node('summary','','观察 → 假设 → 下一篇验证'),node('p','','观察：示例中收藏24→40，评论8→12。\n假设：分区与收线动作更具体，可能方便读者对照自己的空间。\n下一篇验证：继续使用相同照片和主题，只改变是否提供尺寸核对清单，并记录相同窗口的曝光与互动。\n示例追问：“小桌面只有80厘米宽，能不能出个尺寸清单？”（合成示例）'));root.append(reflection);
 const next=node('button','button primary','用这条追问继续下一集 →');next.type='button';next.addEventListener('click',async()=>{activateView('plans');const p=await ensureDemoSeries();if(!p)return;$('planSourceText').value=p.data.source.title+'\n\n'+p.data.source.body;planSourceImage=p.data.source.image;rememberPlanSource();$('seriesQuestions').value='小桌面只有80厘米宽，能不能出个布局尺寸清单？';seriesInputRevision++;$('planSourceStatus').textContent='来自复盘演示的合成追问，可编辑。';await openContentPlan(p.id);});root.append(next,node('p','plan-note','以上示例不写入本人发布记录、积分流水或训练数据。真实记录与指标填写在下方。'));
}

$('showReviewDemo').addEventListener('click',()=>{renderReviewDemo(true);$('reviewDemo').scrollIntoView({block:'start'});});

$('loadSeriesDemo').addEventListener('click',async()=>{if(planPending||planLoading||busy)return;if(($('planSourceText').value.trim()||$('seriesQuestions').value.trim())&&!confirm('载入示例将替换本页素材与追问，已保存的作品和计划保留。继续吗？'))return;const p=await ensureDemoSeries(true);if(p){await openContentPlan(p.id);$('planCreateOptions').open=true;}});
function syncCreationExamples(){for(const button of document.querySelectorAll('[data-creation-demo]')){button.setAttribute('aria-pressed',String(state.demoProject===button.dataset.creationDemo));button.disabled=exampleLoading||busy||!!planPending||planLoading||planMutation;}if(!exampleLoading)renderStarterExampleStatus();}
async function loadCreationExample(scene='portugal-r4',{automatic=false}={}){
 if(!booted||planPending||planLoading||planMutation||busy||exampleLoading||linkedDirty.size){if(!automatic)toast('请先完成当前任务并保存修改。');return false;}
 if(!automatic&&hasCurrentContent()&&!confirm('切换到完整示例，当前作品会先保存。已有示例恢复上次编辑。继续吗？'))return false;
 readForm();const identity=storageIdentity,previous=state,snapshot=JSON.stringify(state.brief);exampleLoading=true;syncCreationExamples();syncUnifiedCreation();$('creationExampleStatus').textContent='正在载入完整图文与设置…';
 try{
  const project=await api('/api/projects/example',{scene});
  if(identity!==storageIdentity||previous!==state||snapshot!==JSON.stringify(state.brief)){toast('当前素材已变化，保留你的编辑。请重新选择示例。');return false;}
  await openProject(project.id);if(projectId!==project.id)return false;
  $('planTaskStatus').textContent='';$('creationExampleStatus').textContent='完整图文与设置已带入，可直接编辑、预览和导出。';toast('完整示例已载入，不消耗生成额度。');return true;
 }catch(e){$('creationExampleStatus').textContent='示例暂时无法载入，可重新选择；当前内容保留。';showError(e.message,e);return false;}
 finally{exampleLoading=false;syncCreationExamples();syncUnifiedCreation();renderIntentChoices();}
}
$('loadCreationDemo').addEventListener('click',()=>loadCreationExample());
document.querySelectorAll('[data-creation-demo]').forEach(button=>button.addEventListener('click',()=>loadCreationExample(button.dataset.creationDemo)));
document.addEventListener('getie:viewchange',syncCreationExamples);
