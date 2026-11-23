'use strict';
const PLATFORM_CONFIG={
 '小红书':{key:'xhs',width:1080,height:1440,model:'gpt-6-luna',goal:'流行度',tone:'实用清晰，信息优先',context:'图文笔记 · 3:4 · 文本流行度参考',publish:'https://creator.xiaohongshu.com/publish/publish?source=official',scheme:'xhsdiscover://'},
 'Instagram':{key:'ig',width:1080,height:1350,model:'gpt-6-luna',goal:'流行度',tone:'克制简洁，有设计感',context:'Feed 图文 · 4:5 · 暂无适用的参与预测模型',publish:'https://www.instagram.com/',scheme:'instagram://app'},
 '抖音图文':{key:'douyin',width:1080,height:1920,model:'gpt-6-luna',goal:'流行度',tone:'轻松有趣，有生活感',context:'竖屏图文 · 9:16 · 暂无适用的参与预测模型',publish:'https://creator.douyin.com/',scheme:'snssdk1128://'},
 '微信公众号':{key:'wechat',width:1080,height:608,model:'gpt-6-luna',goal:'流行度',tone:'实用清晰，信息优先',context:'文章与横向封面 · 暂无适用的参与预测模型',publish:'https://mp.weixin.qq.com/',scheme:'weixin://'}
};
function preferredPlatform(){try{return localStorage.getItem('resonance.platform')||'小红书';}catch{return '小红书';}}
function platformConfig(name){return PLATFORM_CONFIG[name]||PLATFORM_CONFIG['小红书'];}
