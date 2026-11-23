'use strict';
const PORTUGAL_SOURCE={title:'葡萄牙旅行',body:'随手拍了一张照片。',context:'作者提供的葡萄牙罗卡角悬崖海景实拍。画面中有海景、窗框和举杯。没有提供具体餐厅、消费、身份或办理经历。'};
const PORTUGAL_DEMO={
 '小红书':{title:'在罗卡角的日落里，想了想另一种生活',body:'悬崖把陆地交给大西洋，窗边的一杯酒，把日落留得慢了一点。\n\n旅行会让人想：如果把这里从目的地，变成日常呢？比起一张滤镜里的“理想生活”，我更想把住房、通勤、语言和长期居住的现实问题摆出来聊。\n\n如果你也在了解葡萄牙长期居住、移民路径或护照问题，可以从自己的生活需求开始整理问题，欢迎交流。\n\n商业合作示例｜涉及身份与政策的信息，请以官方最新要求和专业意见为准。',tags:['葡萄牙生活','罗卡角','海外生活'],angle:'海外生活关注者 · 风景引入，连接咨询需求',basis:'沿用作者提供的地点；把迁居作为讨论问题，不编造政策、身份或办理承诺。'},
 '抖音图文':{title:'这扇窗，直接把大西洋包场了',body:'别人追下班打卡，我追太阳沉进海里。\n悬崖、大西洋、落日，再把酒杯举高一点——葡萄牙的氛围，真的不需要多说。\n\n高档餐厅感的晚餐灵感：靠窗位置、暖光、日落，再配一杯葡萄酒。先把这一刻存下来，下次选餐厅就照这个氛围找。\n\n这顿“海景感”，你给几分？',tags:['葡萄牙旅行','落日氛围感','海景晚餐'],angle:'品质生活与旅行人群 · 视觉钩子，放大氛围',basis:'从画面里的海景、窗框与举杯设计表达；晚餐和葡萄酒是创作灵感，不伪称已到访某家餐厅。'}
};
async function renderExperience(){
 const root=$('linkedDemoPreviews');root.replaceChildren();
 for(const platform of LINK_PLATFORMS){
  const option=PORTUGAL_DEMO[platform],canvas=newCover(),card=node('article','lab-platform'),info=node('div','lab-platform-info');
  info.append(node('small','eyebrow','02 / '+(platform==='小红书'?'生活方式与商业表达':'日落与品质生活表达')),node('h3','',platform==='小红书'?'小红书':'抖音'),node('p','',option.angle),node('p','preview-copy',option.title+'\n\n'+option.body),node('p','preserved-copy','设计依据：'+option.basis));
  card.append(phone(option,platform,canvas),info);root.append(card);
  try{const image=await getImage('/assets/portugal-town.webp'),size=platformConfig(platform);canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d'),k=Math.max(canvas.width/image.width,canvas.height/image.height),w=image.width*k,h=image.height*k;ctx.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);}catch{card.append(node('p','plan-warning','照片读取失败，请刷新重试。'));}
 }
}
function usePortugalSource(){return loadCreationExample('portugal-r4');}
$('openPortugalDemo').addEventListener('click',usePortugalSource);
$('startCreating').replaceWith($('startCreating').cloneNode(true));$('startCreating').addEventListener('click',usePortugalSource);
$('startLinked').addEventListener('click',()=>activateView('workbench'));
renderExperience();

let primingCreation=false;
async function primeCreationExample(){
 if(primingCreation||!booted||hasCurrentContent()||busy||planPending||planLoading)return;
 const key='getie.creation.defaults.v1.'+storageIdentity;try{if(localStorage.getItem(key))return;}catch{}
 primingCreation=true;const identity=storageIdentity;
 try{
 if(identity!==storageIdentity||hasCurrentContent()||document.body.dataset.view!=='workbench')return;
 if(await loadCreationExample('portugal-r4',{automatic:true}))try{localStorage.setItem(key,'ready');}catch{}
 }finally{primingCreation=false;}
}
