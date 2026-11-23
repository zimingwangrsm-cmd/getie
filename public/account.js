'use strict';
let accountState=null,activePaymentOrder=null,paymentOrders=[],firstTopupAvailable=true,accountIntent='login';
async function refreshAccount(){
 try{accountState=await api('/api/account');renderAccount();return accountState;}catch(e){$('accountSummary').textContent=e.message;return null;}
}
function renderGenerationCost(){
 const target=$('generationCost');if(!target)return;
 const premium=(typeof isMultiCreation==='function'&&isMultiCreation())||state.brief.count===2||state.brief.model==='gpt-6.1-sol',a=accountState,r=a?.rules;
 if(!a){target.textContent='正在读取可用创作额度…';return;}
 if(a.unlimited){target.textContent='管理员 · 全部已接入模型与比较功能 · 不限积分额度';return;}
 if(!a.user&&a.guest_full_trial){target.textContent='首次完整创作免费 · 无需登录 · 支持精细模型与双方案比较 · 失败不计次数';return;}
 const cost=premium?r.premium_cost:r.basic_cost;
 target.textContent=premium?'本次 '+cost+' 积分 · 需要 VIP'+(a.user?' · 当前余额 '+a.credits+' 积分':' · 登录后查看会员权益'):a.user?'本次 '+cost+' 积分 · 当前余额 '+a.credits+' 积分':'基础单方案免费体验 · 剩余 '+a.guest_remaining+' 次';
 target.textContent+=' · 生成失败不扣额度';
}
function renderAccount(){
 const a=accountState,u=a?.user;if(!a)return;if(u)firstTopupAvailable=a.first_topup;renderGenerationCost();
 $('accountButton').textContent=u?(a.unlimited?'管理员 · ':a.vip?'VIP · ':'')+u.username+' · '+(a.unlimited?'不限额度':a.credits+' 积分'):'登录 / 注册';
 $('accountGuest').hidden=!!u;$('accountMember').hidden=!u;
 $('accountSummary').textContent=a.unlimited?'管理员账号 · 全部已接入功能 · 无积分与会员期限限制':u?(a.vip?'VIP 有效至 '+new Date(u.vip_until*1000).toLocaleDateString():'普通创作账号')+' · '+a.credits+' 积分':'免登录还可生成 '+a.guest_remaining+' 次'+(a.guest_full_trial?' · 首次支持精细模型与比较':' · 基础单方案')+' · 注册领取 '+a.rules.signup+' 积分';
 if(!u)return;
 $('accountName').textContent=u.username;$('creditBalance').textContent=a.unlimited?'∞':a.credits;$('checkinButton').disabled=a.checked_in;$('checkinButton').textContent=a.checked_in?'今日已签到':'签到领 '+a.rules.checkin+' 积分';
 $('inviteCode').textContent=u.invite_code;
 $('creditLedger').replaceChildren(...a.ledger.map(r=>{const p=node('p');const reasons={signup:'注册赠送',checkin:'每日签到',generation:'创作使用',refund:'失败退回',invite_host:'邀请奖励',invite_join:'受邀奖励',vip_purchase:'VIP 额度',topup:'积分充值',first_topup_bonus:'首充双倍赠送',publication_reward:'带标签发布奖励'};p.append(node('span','',reasons[r.reason]||r.reason),node('strong','',(r.delta>0?'+':'')+r.delta),node('small','',new Date(r.created*1000).toLocaleString()));return p;}));
}
async function openAccount(mode='login'){
 accountIntent=mode;
 if(!$('accountDialog').open)$('accountDialog').showModal();setAuthMode(['register','recover'].includes(mode)?mode:'login');await refreshAccount();
}
function accountRoute(){const mode=new URLSearchParams(location.search).get('auth');return ['login','register','recover','upgrade','credits'].includes(mode)?mode:'login';}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-account-route]');if(!a||e.ctrlKey||e.metaKey)return;e.preventDefault();openAccount(a.dataset.accountRoute);});

function setAuthMode(mode){$('authMode').value=mode;$('inviteField').hidden=mode!=='register';$('recoveryField').hidden=mode!=='recover';$('authSubmit').textContent={login:'登录并进入创作台',register:'免费注册，领取积分',recover:'重设密码'}[mode];$('authPassword').autocomplete=mode==='login'?'current-password':'new-password';document.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.authMode===mode));$('authError').hidden=true;}
async function resetIdentityView(){
 const identity=await api('/api/account');storageIdentity=identity.user?.id||'guest';
 clearTimeout(saveTimer);clearTimeout(pollTimer);localStorage.removeItem(storageKey);state=initialState();projectId=null;
 const data=await api('/api/projects');if(data.projects.length){const p=await api('/api/projects/'+data.projects[0].id);state=p.state;projectId=p.id;}
 applyState();remember();localStorage.setItem('resonance.auth.changed',String(Date.now()));await loadProjects();if(typeof loadReview==='function')await loadReview();if(document.body.dataset.view==='plans'&&typeof loadPlans==='function')await loadPlans();
}
$('accountButton').addEventListener('click',()=>openAccount());document.querySelectorAll('[data-open-account]').forEach(b=>b.addEventListener('click',()=>openAccount(b.dataset.openAccount||'login')));
$('closeAccount').addEventListener('click',()=>{$('recoveryOutput').textContent='';$('recoveryNotice').hidden=true;$('accountDialog').close();});
for(const b of document.querySelectorAll('[data-auth-mode]'))b.addEventListener('click',()=>setAuthMode(b.dataset.authMode));
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();if(busy){toast('当前生成结束后再切换账号。');return;}$('authSubmit').disabled=true;$('authError').hidden=true;
 try{clearTimeout(saveTimer);await saveQueue.catch(()=>{});const mode=$('authMode').value;const data=await api('/api/account/'+mode,{username:$('authUsername').value,password:$('authPassword').value,invite:$('authInvite').value,recovery:$('authRecovery').value});$('authPassword').value='';$('authRecovery').value='';
 if(data.recovery_code){$('recoveryOutput').textContent=data.recovery_code;$('recoveryNotice').hidden=false;}
 if(mode==='recover'){toast('密码已重设，请使用新密码登录；新的恢复码请妥善保存。');setAuthMode('login');return;}
 await resetIdentityView();await refreshAccount();activateView('workbench');toast('已进入你的创作空间。');
 }catch(error){$('authError').textContent=error.message;$('authError').hidden=false;}finally{$('authSubmit').disabled=false;}
});
$('logoutButton').addEventListener('click',async()=>{if(busy){toast('生成结束后再退出。');return;}try{clearTimeout(saveTimer);await saveQueue.catch(()=>{});await api('/api/account/logout',{});await resetIdentityView();$('recoveryNotice').hidden=true;$('recoveryOutput').textContent='';await refreshAccount();toast('已退出，私人项目保留在账号内。');}catch(e){toast(e.message,e);}});
$('checkinButton').addEventListener('click',async()=>{try{const data=await api('/api/account/checkin',{});toast(data.added?'签到成功，+'+data.added+' 积分':'今天已经签到');await refreshAccount();}catch(e){toast(e.message,e);}});
$('shareInvite').addEventListener('click',async()=>{if(!accountState?.user)return;const url=new URL(location.origin+'/');url.searchParams.set('invite',accountState.user.invite_code);try{await copyText('用 AI 设计适合社交平台的图文。注册填写邀请码 '+accountState.user.invite_code+'，首次创作成功双方各得 10 积分：'+url);toast('邀请链接已复制。好友首次创作成功后奖励入账。');}catch(e){toast(e.message,e);}});
const invitation=new URLSearchParams(location.search).get('invite');if(invitation)$('authInvite').value=invitation.slice(0,20);
refreshAccount();
if(location.hash==='#account'||new URLSearchParams(location.search).has('payment'))openAccount(accountRoute());
window.addEventListener('hashchange',()=>{if(location.hash==='#account'&&!$('accountDialog').open)openAccount(accountRoute());});
$('accountDialog').addEventListener('close',()=>{if(location.hash==='#account'){const view=[['workbenchView','workbench'],['libraryView','library'],['feedbackView','feedback']].find(([id])=>!$(id).hidden)?.[1];history.replaceState(null,'',location.pathname+location.search+(view?'#'+view:''));}$('manualTransaction').value='';$('authPassword').value='';$('authRecovery').value='';$('recoveryOutput').textContent='';$('recoveryNotice').hidden=true;});

window.addEventListener('storage',e=>{if(e.key==='resonance.auth.changed'){identityIsCurrent=false;clearTimeout(saveTimer);clearTimeout(pollTimer);location.reload();}});
