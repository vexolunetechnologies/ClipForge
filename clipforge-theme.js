(()=>{'use strict';
const frameCss=[
':root{--bg:#090e1b;--pn:#111a2c;--ln:rgba(148,163,184,.16);--tx:#edf2ff;--mu:#93a2bd;--ac:#8b7cff;--acx:#fff;color-scheme:dark}',
':root[data-theme=light]{--bg:#f4f6fb;--pn:#fff;--ln:rgba(31,45,72,.12);--tx:#172033;--mu:#65718a;--ac:#6555e8;--acx:#fff;color-scheme:light}',
'body{background:var(--bg)!important;color:var(--tx)!important;font-family:Inter,system-ui,sans-serif!important}',
'.panel,.it,.aud,details{background:var(--pn)!important;color:var(--tx)!important;border-color:var(--ln)!important}',
'h1,h2,h3,b,strong,label,summary{color:var(--tx)!important}',
'p,.hint,.aud span{color:var(--mu)!important}',
'button.alt,.chip,.it button{background:var(--pn)!important;color:var(--tx)!important;border-color:var(--ln)!important}',
'button.main,.chip[aria-pressed=true],a.dl{background:linear-gradient(110deg,var(--ac),#5a9cff)!important;color:#fff!important;border-color:transparent!important}',
'input,textarea{background:var(--pn)!important;color:var(--tx)!important;border-color:var(--ln)!important}',
'.bar{background:var(--ln)!important}.bar i{background:linear-gradient(90deg,var(--ac),#4dd8e8)!important}'
].join('\\n');
function apply(frame){try{const doc=frame.contentDocument;if(!doc||!doc.head)return;let style=doc.getElementById('cf-unified-theme');if(!style){style=doc.createElement('style');style.id='cf-unified-theme';doc.head.appendChild(style)}style.textContent=frameCss;const theme=document.documentElement.dataset.theme;if(theme)doc.documentElement.dataset.theme=theme;else doc.documentElement.removeAttribute('data-theme')}catch(e){}}
function sync(){document.querySelectorAll('iframe').forEach(apply)}
new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
document.addEventListener('load',e=>{if(e.target instanceof HTMLIFrameElement)apply(e.target)},true);
document.addEventListener('click',e=>{if(e.target.closest('#theme'))requestAnimationFrame(sync)},true);
sync();
})();