'use strict';
let relatedIds=null,relatedRun=0;
function appendFullCopy(parent,option){const full=node('section','full-example-copy');full.append(node('h4','',option.title||''),node('p','',option.body||''),node('p','phone-tags',(option.tags||[]).map(t=>'#'+t.replace(/^#+/,'')).join(' ')));parent.append(full);}
async function showExampleDesigns(example){
 comparisonRun++;$('phoneComparison').replaceChildren();$('predictionComparison').replaceChildren();$('comparisonPlatform').textContent='同一素材 · 两种完整表达';
 for(const [index,option]of example.designs.entries()){
  const platform=option.platform||'小红书',wrap=node('article','phone-wrap'),canvas=newCover();wrap.append(node('h3','',option.angle||'方向 '+(index+1)),phone(option,platform,canvas));appendFullCopy(wrap,option);$('phoneComparison').append(wrap);await renderCover(canvas,option,{image:example.thumbnail,platform});
 }
 $('predictionComparison').append(node('p','model-note','预设创作示例，没有实际发布或流量提升记录。'));$('compareDialog').showModal();
}
async function openRelatedNotes(option=currentOption(),platform=state.brief.platform,theme=''){
 if(!option){toast('先生成或选择一份内容。');return;}
 const query=[option.title,theme||state.brief.creativeTheme,option.body?.slice(0,200)].filter(Boolean).join(' ').slice(0,300),run=++relatedRun;
 relatedIds=new Set();selectedPopularity='all';selectedCategory='全部';$('librarySearch').value='';$('pairedOnly').checked=false;
 $('relatedTitle').textContent=option.title||'';$('relatedBody').textContent=[option.body,(option.tags||[]).map(t=>'#'+t).join(' ')].filter(Boolean).join('\n\n');$('relatedContext').hidden=false;$('relatedCurrent').open=true;
 $('relatedStatus').textContent='正在按当前主题匹配…';activateView('library');
 try{const data=await api('/api/inspiration',{topic:query,focus:(theme||state.brief.creativeTheme||option.title||'').slice(0,300),limit:12});if(run!==relatedRun)return;relatedIds=new Set(data.notes.map(n=>n.id));renderLibrary();$('relatedStatus').textContent=data.notes.length?'找到 '+data.notes.length+' 篇同主题小红书历史参考。'+(platform!=='小红书'?'仅借鉴选题，不代表该平台的表现。':'历史互动不等同于本篇优化收益。'):'本地库暂未找到同主题帖子。可返回全部案例，换关键词查找；不会用无关热门帖补齐。';$('relatedContext').scrollIntoView({block:'start'});}
 catch(error){if(run===relatedRun)$('relatedStatus').textContent=error.message;}
}
$('viewRelatedNotes').addEventListener('click',()=>openRelatedNotes());
$('clearRelatedNotes').addEventListener('click',()=>{relatedRun++;relatedIds=null;$('relatedContext').hidden=true;$('librarySearch').value='';selectedCategory='全部';selectedPopularity='all';$('pairedOnly').checked=false;renderLibrary();});

// The library navigation always opens independent browsing, not an earlier project filter.
$('libraryNav').addEventListener('click',()=>{$('clearRelatedNotes').click();});
document.querySelectorAll('button[data-view="library"]').forEach(button=>button.addEventListener('click',()=>{$('clearRelatedNotes').click();}));
