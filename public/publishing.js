'use strict';
const PUBLISH_TAG='个贴创作辅助';
let publishSnapshot=null,publishBusy=false;
function publishText(option){
 const tags=[...new Set([...(option.tags||[]).map(t=>t.replace(/^[#＃]+/,'').trim()).filter(Boolean),PUBLISH_TAG])];
 const present=new Set(((option.title+'\n'+option.body).match(/[#＃][^\s#＃，。！？!?,]+/g)||[]).map(t=>t.replace(/^[#＃]/,'')));
 return [option.title,option.body,tags.filter(t=>!present.has(t)).map(t=>'#'+t).join(' ')].filter(Boolean).join('\n\n');
}
async function preparePublishing(){
 const option=currentOption(),platform=state.brief.platform;if(!option||busy||publishBusy)return;
 if((state.result?.platform||state.sourceBrief?.platform||platform)!==platform){toast('请先为当前平台生成文案。');return;}
 publishSnapshot={option:JSON.parse(JSON.stringify(option)),platform};$('publishCopy').value=publishText(option);$('publishDestination').href=platformConfig(platform).publish;$('publishDestination').textContent='前往'+platform+'编辑';$('rewardPlatform').value=platform;
 $('publishStatus').textContent='正在准备文案与封面…';$('publishDialog').showModal();publishBusy=true;
 // Open during the gesture to avoid popup blockers. Never send content or credentials in URLs.
 const tab=window.open(platformConfig(platform).publish,'_blank');if(tab)tab.opener=null;
 const status=[];
 try{await copyText($('publishCopy').value);status.push('文案已复制（含 #'+PUBLISH_TAG+'）');}catch{status.push('未能自动复制，请点击复制或选中下方全文');}
 try{await downloadCover();status.push('封面已导出');}catch{status.push('封面导出未完成，可关闭面板检查后重试');}
 if(!tab)status.push('浏览器拦截了新窗口，请点击下方平台入口');
 $('publishStatus').textContent=status.join('；')+'。';publishBusy=false;
 loadPublishRewards();
}
async function loadPublishRewards(){
 if(!accountState?.user){$('rewardHistory').replaceChildren();$('rewardStatus').replaceChildren(document.createTextNode('奖励需登录账号。'),accountLink({action:'login'}));return;}
 try{const data=await api('/api/publishing/rewards');$('rewardHistory').replaceChildren(...data.rewards.map(r=>node('p','plan-note',r.platform+' · '+({pending:'待核验',approved:'已赠10积分',rejected:'未通过'}[r.status])+(r.note?' · '+r.note:''))));$('rewardStatus').textContent='核实后赠10积分，每日最多3篇。';}catch(e){$('rewardStatus').textContent=e.message;}
}
$('closePublishDialog').addEventListener('click',()=>{$('publishDialog').close();});
$('recopyPublish').addEventListener('click',async()=>{try{await copyText($('publishCopy').value);$('publishStatus').textContent='完整文案已复制，包含 #'+PUBLISH_TAG+'。';}catch{$('publishCopy').focus();$('publishCopy').select();$('publishStatus').textContent='请手动复制选中的完整文案。';}});
$('retryPublishImage').addEventListener('click',async()=>{if(!publishSnapshot||publishSnapshot.platform!==state.brief.platform){toast('当前稿已变化，请重新准备发布。');return;}try{await downloadCover();}catch(e){toast(e.message);}});
$('openPublishReward').addEventListener('click',()=>{if(!$('publishDialog').open)$('publishDialog').showModal();$('publishRewardDetails').open=true;loadPublishRewards();});
$('publishRewardForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const data=await api('/api/publishing/rewards',{platform:$('rewardPlatform').value,url:$('rewardUrl').value.trim(),evidence:$('rewardEvidence').value.trim()});await loadPublishRewards();$('rewardStatus').textContent=data.reward.status==='approved'?'这篇帖子已发放奖励，无需重复申请。':data.reward.status==='rejected'?'这篇申请未通过：'+(data.reward.note||'请联系管理员核对。'):'申请已保存，等待核验；当前未发放积分。';}catch(e){$('rewardStatus').replaceChildren(document.createTextNode(e.message));const link=accountLink(e);if(link)$('rewardStatus').append(link);}finally{button.disabled=false;}});
async function renderAdminRewards(){
 if(!accountState?.unlimited)return;
 try{const data=await api('/api/admin/rewards');$('adminRewards').replaceChildren(...data.rewards.map(r=>{
  const card=node('section','reward-review'),link=node('a','',r.url);link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';card.append(node('strong','',r.username+' · '+r.platform),link,node('p','',r.evidence));
  const canonical=node('input');canonical.type='url';canonical.placeholder='浏览器展开后的完整原帖地址';canonical.setAttribute('aria-label','核验原帖完整链接');canonical.value=r.url;
  const author=node('input'),tag=node('input');author.type=tag.type='checkbox';const la=node('label','','已核实为申请人本人创作并实际发布'),lt=node('label','','已核实正文含 #'+PUBLISH_TAG);la.prepend(author);lt.prepend(tag);
  const note=node('textarea');note.placeholder='核验记录或拒绝原因';note.maxLength=1000;note.setAttribute('aria-label','发布奖励核验说明');card.append(canonical,la,lt,note);
  for(const [action,label]of [['approve','核实通过，赠10积分'],['reject','不通过']]){const b=node('button','button outline',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await api('/api/admin/rewards/review',{id:r.id,action,canonical:canonical.value,verified_author:author.checked,verified_tag:tag.checked,note:note.value});await renderAdminRewards();await refreshAccount();toast('核验已保存。');}catch(e){toast(e.message);}finally{b.disabled=false;}});card.append(b);}return card;
 }));if(!data.rewards.length)$('adminRewards').textContent='暂无待核验申请。';}catch(e){$('adminRewards').textContent=e.message;}
}
