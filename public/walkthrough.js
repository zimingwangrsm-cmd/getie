'use strict';
// A zero-cost, non-mutating first-visit walkthrough. The author can close or replay it.
let guideStep=0,guidePreviousFocus=null,guideActive=false,guideFrame=0;
const guideDetails=new Map();
const GUIDE_STEPS=[
 {title:'欢迎来到个贴创作台',text:'AI 个性化表达、跨平台内容适配、连续创作。从选平台、带素材开始，不消耗额度。'},
 {target:'.creation-platforms',title:'选择一个或两个平台',text:'单平台定向创作；同时勾选小红书和抖音，就一起生成、分别编辑。'},
 {target:'.direction-grid',title:'确定人群与表达',text:'选择人群、风格，或添加自己的标签。支持自定义标签和补充要求。'},
 {target:'#uploadArea',title:'带入已有素材',text:'上传照片，或填写主题与已有图文。只有图片也能开始。'},
 {target:'#modelSelect',title:'按需生成',text:'选择模型和补充要求，再点击生成。素材与草稿会保留。'},
 {target:'.insight-workbench-entry',reveal:'.insight-workbench-entry',title:'找参考，也检查自己的稿件',text:'按主题查看历史笔记，或诊断原稿与当前方案。这里保留真实原图、原文与数据来源；历史表现供参考，不等于本篇效果。'},
 {target:'.expression-profile-bar',reveal:'.expression-profile-bar',title:'保存自己的表达档案',text:'保存常用语气、长期人群和事实边界。主动应用后，创作与续集沿用这份背景；每篇也可以单独停用。'},
 {target:()=>isMultiCreation()?'#unifiedPlanDetail':'.result-panel',title:'编辑、对照，再发布',text:'修改正文与图片，查看同主题笔记。需要接着写，就去“续集创作”。'}
];
const guideLayer=node('div','guide-layer');guideLayer.hidden=true;guideLayer.setAttribute('role','dialog');guideLayer.setAttribute('aria-modal','true');guideLayer.setAttribute('aria-labelledby','guideTitle');
const guideFocus=node('div','guide-focus'),guideCard=node('section','guide-card'),guideClose=node('button','guide-close','×');guideClose.type='button';guideClose.id='closeCreationGuide';guideClose.setAttribute('aria-label','关闭使用引导');
const guideTitle=node('h2');guideTitle.id='guideTitle';const guideText=node('p'),guideFooter=node('div','guide-footer'),guideCounter=node('span'),guidePrev=node('button','button outline','上一步'),guideNext=node('button','button primary','下一步');guidePrev.type=guideNext.type='button';guideNext.id='guideNext';guidePrev.id='guidePrevious';guideFooter.append(guideCounter,guidePrev,guideNext);guideCard.append(guideClose,guideTitle,guideText,guideFooter);guideLayer.append(guideFocus,guideCard);document.body.append(guideLayer);
function guideKey(){return 'getie.creation.guide.v2.'+storageIdentity;}
function guideTarget(){const step=GUIDE_STEPS[guideStep],selector=typeof step.target==='function'?step.target():step.target;return selector?document.querySelector(selector):null;}
function positionGuide(){
 if(!guideActive)return;const target=guideTarget(),rect=target?.getBoundingClientRect(),margin=16,w=innerWidth,h=innerHeight;
 guideCard.style.maxHeight=Math.max(160,h-32)+'px';
 if(rect&&rect.width&&rect.height){
  const top=Math.max(8,rect.top-6),bottom=Math.min(h-8,rect.bottom+6),left=Math.max(8,rect.left-6),right=Math.min(w-8,rect.right+6);
  guideFocus.hidden=false;Object.assign(guideFocus.style,{top:top+'px',left:left+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
  const cardHeight=guideCard.offsetHeight,cardWidth=guideCard.offsetWidth;let y=bottom+16;
  if(y+cardHeight>h-margin)y=top-cardHeight-16;if(y<margin)y=Math.max(margin,h-cardHeight-margin);
  guideCard.style.top=y+'px';guideCard.style.left=Math.min(Math.max(margin,left),Math.max(margin,w-cardWidth-margin))+'px';
 }else{guideFocus.hidden=true;guideCard.style.top=Math.max(margin,(h-guideCard.offsetHeight)/2)+'px';guideCard.style.left=Math.max(margin,(w-guideCard.offsetWidth)/2)+'px';}
}
function restoreGuideDetails(){for(const [details,wasOpen]of guideDetails)details.open=wasOpen;}
function renderGuide(){
 restoreGuideDetails();const step=GUIDE_STEPS[guideStep];if(step.reveal){const details=document.querySelector(step.reveal);if(details){if(!guideDetails.has(details))guideDetails.set(details,details.open);details.open=true;}}guideTitle.textContent=step.title;guideText.textContent=step.text;guideCounter.textContent=(guideStep+1)+' / '+GUIDE_STEPS.length;guidePrev.disabled=guideStep===0;guideNext.textContent=guideStep===GUIDE_STEPS.length-1?'开始创作':'下一步';
 guideTarget()?.scrollIntoView({block:'center',behavior:'instant'});positionGuide();requestAnimationFrame(positionGuide);guideNext.focus({preventScroll:true});
}
function showCreationGuide(){if(guideActive||document.body.dataset.view!=='workbench')return;guideActive=true;guidePreviousFocus=document.activeElement;guideStep=0;guideLayer.hidden=false;document.body.classList.add('creation-guide-active');for(const e of document.body.children)if(e!==guideLayer&&e.tagName!=='SCRIPT'&&e.tagName!=='DIALOG'&&!e.inert){e.dataset.guideInert='true';e.inert=true;}renderGuide();}
function closeCreationGuide(){if(!guideActive)return;guideActive=false;restoreGuideDetails();guideDetails.clear();guideLayer.hidden=true;document.body.classList.remove('creation-guide-active');for(const e of document.querySelectorAll('[data-guide-inert]')){e.inert=false;delete e.dataset.guideInert;}try{localStorage.setItem(guideKey(),'seen');}catch{}guidePreviousFocus?.focus({preventScroll:true});}
async function maybeCreationGuide(){if(guideActive||document.body.dataset.view!=='workbench'||!booted||document.querySelector('dialog[open]'))return;if(typeof primeCreationExample==='function')await primeCreationExample();if(guideActive||document.body.dataset.view!=='workbench')return;try{if(localStorage.getItem(guideKey())==='seen')return;}catch{}showCreationGuide();}
guideClose.addEventListener('click',closeCreationGuide);guidePrev.addEventListener('click',()=>{if(guideStep>0){guideStep--;renderGuide();}});guideNext.addEventListener('click',()=>{if(guideStep===GUIDE_STEPS.length-1)closeCreationGuide();else{guideStep++;renderGuide();}});
guideLayer.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeCreationGuide();}else if(event.key==='Tab'){const controls=[guideClose,...(guidePrev.disabled?[]:[guidePrev]),guideNext],index=controls.indexOf(document.activeElement);event.preventDefault();controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();}});
for(const type of ['resize','scroll'])window.addEventListener(type,()=>{if(guideActive){cancelAnimationFrame(guideFrame);guideFrame=requestAnimationFrame(positionGuide);}},true);
new ResizeObserver(()=>{if(guideActive)positionGuide();}).observe(guideCard);
document.addEventListener('getie:viewchange',e=>{if(e.detail!=='workbench')closeCreationGuide();else setTimeout(maybeCreationGuide,0);});
$('showCreationGuide').addEventListener('click',showCreationGuide);
let guideStartupAttempts=0;const guideStartup=setInterval(()=>{if(booted||guideStartupAttempts++>50){clearInterval(guideStartup);maybeCreationGuide();}},100);

$('accountDialog').addEventListener('close',()=>setTimeout(maybeCreationGuide,0));
