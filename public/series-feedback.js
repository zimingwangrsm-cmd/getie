'use strict';
// Deliberately synthetic inputs; never imported into publication records or training.
const SERIES_FEEDBACK_DEMO={
 '小红书':{comments:'UP什么时候出个80厘米小书桌的尺寸清单？电脑和本子总是挤在一起。\n桌面看着很清爽，可电源线藏到哪里了？能拍一下桌子背面吗？\n不想再买收纳盒，能不能只用现有物件整理一次？',metrics:{impressions:2000,likes:60,collects:40,comments:12,shares:6,followers:1200,window:24,account:'书桌演示·小红书',promoted:'no'}},
 '抖音图文':{comments:'能不能拍个整理前后对比？想一眼看清你到底挪了什么。\n合租卧室白天办公晚上化妆，这张小桌子怎么快速切换？\n收线过程别跳过，想看一步一步操作。',metrics:{impressions:3000,likes:96,collects:24,comments:18,shares:9,followers:1200,window:24,account:'书桌演示·抖音',promoted:'no'}}
};
function isSeriesFeedbackDemo(plan){return plan.data.demo==='desk-series-r4';}
function renderFeedbackDemoComparison(section,plan){
 if(!isSeriesFeedbackDemo(plan)||(plan.proposals||[]).length)return;
 const comparison=node('details','feedback-demo-comparison');comparison.open=true;
 comparison.append(node('summary','','下一集调整对照 · 预设演示'));
 const grid=node('div','linked-grid');
 for(const row of [
  {platform:'小红书',episode:'第1集 · 尺寸与收线清单',observation:'曝光2,000，收藏40（2.0%）；三条示例评论分别追问尺寸、收线和零购入整理。',hypothesis:'具体测量清单可能更适合收藏备用；样本很小，不能推断所有读者偏好。',before:'把三分区原则展开为五项测量清单。',after:'新增80厘米桌面的可填写布局表、桌后走线照片和“先整理再购买”核对步骤。80厘米来自读者情境，不是作者实测结论。',materials:'桌宽桌深、电脑占位尺寸、桌后走线实拍；现有物件清单。',test:'同账号、同类主题、24小时窗口记录收藏/曝光；保留粉丝量与投流条件，核对是否解决尺寸追问。',quote:SERIES_FEEDBACK_DEMO['小红书'].comments.split('\n')[0]},
  {platform:'抖音图文',episode:'第2集 · 双用途桌面切换',observation:'曝光3,000，评论18（0.6%）；示例评论要求前后对照、办公化妆切换和完整收线步骤。',hypothesis:'同机位变化与动作顺序可能更易理解；不能据此判断平台机制或把表现归因为剪辑。',before:'介绍固定区、可移动区与任务切换物件。',after:'第一张放同机位前后对照，随后逐张展示移走、留下、归位；补一组办公→化妆切换与收线近景。',materials:'相同机位前后照片、真实切换物件、逐步收线照片；没有化妆场景就换成作者真实任务。',test:'保持主题与观察窗口，记录评论/曝光及读者是否继续追问步骤。两平台账号和受众不同，不直接横比互动率。',quote:SERIES_FEEDBACK_DEMO['抖音图文'].comments.split('\n')[1]}
 ]){
  const card=node('article','linked-version');card.append(node('h4','',row.platform+' · '+row.episode),planParagraph('原计划',row.before),planParagraph('观察',row.observation),planParagraph('可能解释',row.hypothesis),planParagraph('建议调整',row.after),planParagraph('待补素材',row.materials),planParagraph('下一篇验证',row.test),node('blockquote','','评论依据：“'+row.quote+'”'));grid.append(card);
 }
 comparison.append(grid,node('p','plan-note','评论与指标均为合成演示；以上为预设对照，未修改计划。点击分析可根据当前输入生成草案，核对后再确认。'));section.append(comparison);
}
function renderPlatformFeedbackInputs(section,plan){
 if(!planCommentDrafts.has(plan.id)&&isSeriesFeedbackDemo(plan))planCommentDrafts.set(plan.id,structuredClone(SERIES_FEEDBACK_DEMO));
 const saved=planCommentDrafts.get(plan.id),draft=typeof saved==='object'?saved:{'小红书':{comments:typeof saved==='string'?saved:''},'抖音图文':{comments:''}},grid=node('div','linked-grid'),forms={};
 if(isSeriesFeedbackDemo(plan)){
  const header=node('div','demo-summary-row');header.append(node('span','demo-data-badge','合成评论与指标 · 可编辑'));
  const reload=planButton('重新填入反馈示例',()=>{if(!confirm('替换两平台反馈输入？已保存计划保留。'))return;planCommentDrafts.set(plan.id,structuredClone(SERIES_FEEDBACK_DEMO));renderContentPlan();});header.append(reload);section.append(header);
 }
 for(const [index,p]of LINK_PLATFORMS.entries()){
  const card=node('section','linked-version');card.append(node('h4','',p+'反馈'));const c=linkedInput(card,'评论原文 · 一行一条',draft[p]?.comments||'',4);c.id=index?'planDouyinComments':'planComments';c.maxLength=6000;
  const detail=node('details');detail.open=isSeriesFeedbackDemo(plan);detail.append(node('summary','','指标与观察条件（可选）'),node('p','plan-note','未知留空；0表示已确认没有。'));
  const selector=node('select');selector.setAttribute('aria-label',p+'选择已记录作品');selector.append(node('option','','从发布复盘带入指标…'));detail.append(selector);
  const metrics=node('div','feedback-metrics'),fields={};
  for(const [key,label]of [['impressions','曝光'],['likes','点赞'],['collects','收藏'],['comments','评论数'],['shares','分享'],['followers','粉丝数'],['window','观察窗口（小时）'],['account','账号代称']]){const input=linkedInput(metrics,label,draft[p]?.metrics?.[key]??'');input.dataset.metric=key;input.id='seriesMetric'+index+key;if(key!=='account'){input.type='number';input.min=key==='window'?'1':'0';input.step='1';}fields[key]=input;}
  const promoted=node('select');for(const [value,label]of [['unknown','投流未知'],['no','未投流'],['yes','有投流']]){const o=node('option','',label);o.value=value;promoted.append(o);}promoted.value=draft[p]?.metrics?.promoted||'unknown';metrics.append(promoted);detail.append(metrics);card.append(detail);forms[p]={comments:c,fields,promoted};
  const identity=storageIdentity;api('/api/publications').then(data=>{if(identity!==storageIdentity||!selector.isConnected)return;const records=data.publications.filter(r=>r.platform===p&&r.latest);for(const r of records){const o=node('option','',r.snapshot.option.title);o.value=r.id;selector.append(o);}selector.addEventListener('change',()=>{const r=records.find(r=>r.id===selector.value);if(!r)return;for(const key of ['impressions','likes','collects','comments','shares'])fields[key].value=r.latest[key]??'';fields.followers.value=r.followers??'';fields.account.value=r.account;fields.window.value=r.latest.window_hours?Math.max(1,Math.round(r.latest.window_hours)):24;promoted.value=r.promoted;capture();});}).catch(()=>{});
  grid.append(card);
 }
 function channels(){return Object.fromEntries(Object.entries(forms).map(([p,f])=>{const any=['impressions','likes','collects','comments','shares'].some(k=>f.fields[k].value!=='');const metrics=any?Object.fromEntries(Object.entries(f.fields).map(([k,e])=>[k,k==='account'?e.value:e.value===''?null:Number(e.value)])):null;if(metrics)metrics.promoted=f.promoted.value;return [p,{comments:f.comments.value,metrics}];}));}
 function capture(){planCommentDrafts.set(plan.id,channels());}
 for(const f of Object.values(forms))for(const e of [f.comments,...Object.values(f.fields),f.promoted])e.addEventListener('input',capture);
 section.append(grid);return channels;
}
function renderReflections(box,p){
 for(const r of p.reflections||[]){const item=node('section','feedback-observation');item.append(node('h4','',r.platform+' · 解释与下一次验证'),planParagraph('观察到什么',r.observation),planParagraph('可能相关的元素',r.hypothesis),planParagraph('下一篇如何验证',r.experiment));
 for(const id of r.comment_ids){const c=p.comments.find(c=>c.id===id);if(c)item.append(node('blockquote','',c.platform+' 原评论：'+c.text));}
 for(const id of r.metric_ids){const m=p.metrics?.find(m=>m.id===id);if(m)item.append(planParagraph('原始指标依据',formatSeriesMetrics(m)));}box.append(item);}
}
function formatSeriesMetrics(m){return m.platform+' · '+(m.account||'账号未知')+' · '+m.window+'小时；曝光 '+(m.impressions??'未知')+'，赞 '+(m.likes??'未知')+'，藏 '+(m.collects??'未知')+'，评 '+(m.comments??'未知')+'，分享 '+(m.shares??'未知')+'；粉丝 '+(m.followers??'未知')+'；投流 '+({unknown:'未知',no:'无',yes:'有'}[m.promoted])+'；'+m.source;}
