(()=>{'use strict';
const frameCss=[
':root{--bg:#090e1b;--pn:#111a2c;--ln:rgba(148,163,184,.16);--tx:#edf2ff;--mu:#93a2bd;--ac:#8b7cff;--acx:#fff;--panel:var(--pn);--line:var(--ln);--text:var(--tx);--muted:var(--mu);color-scheme:dark}',
':root[data-theme=light]{--bg:#f4f6fb;--pn:#fff;--ln:rgba(31,45,72,.12);--tx:#172033;--mu:#65718a;--ac:#6555e8;--acx:#fff;--panel:var(--pn);--line:var(--ln);--text:var(--tx);--muted:var(--mu);color-scheme:light}',
'*{box-sizing:border-box}',
'html,body{min-height:100%;background:var(--bg)!important;color:var(--tx)!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif!important}',
'body{margin:0!important;font-size:14px!important;line-height:1.55!important}',
'main{width:min(100%,1240px)!important;max-width:1240px!important;margin:0 auto!important;padding:24px clamp(14px,2vw,28px) 48px!important;gap:18px!important;grid-template-columns:minmax(0,1fr)!important}',
'@media(min-width:900px){main{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;align-items:start!important}header,.wide{grid-column:1/-1!important}}',
'header{background:transparent!important;color:var(--tx)!important;border:0!important;padding:0!important}',
'h1{font-size:clamp(24px,3vw,32px)!important;line-height:1.15!important;letter-spacing:-.035em!important;color:var(--tx)!important}',
'h2{font-size:16px!important;font-weight:700!important;color:var(--tx)!important}',
'h1,h2,h3,h4,b,strong,label,summary{color:var(--tx)!important}',
'p,.hint,.aud span,small{color:var(--mu)!important}',
'.panel,.it,.aud,details,.stage{background:var(--pn)!important;color:var(--tx)!important;border:1px solid var(--ln)!important;border-radius:16px!important;box-shadow:0 12px 32px rgba(0,0,0,.12)!important}',
'.panel{padding:18px!important}',
'.stage{background:#050914!important;overflow:hidden!important;min-height:240px!important}',
'button,select,input,textarea{font:inherit!important;border-radius:10px!important}',
'button.alt,.chip,.it button,button:not(.main){background:var(--pn)!important;color:var(--tx)!important;border:1px solid var(--ln)!important;transition:border-color .18s,background .18s,transform .18s!important}',
'button:hover,.chip:hover,.it button:hover{border-color:var(--ac)!important}',
'button.main,.chip[aria-pressed=true],a.dl{background:linear-gradient(110deg,var(--ac),#5a9cff)!important;color:#fff!important;border:1px solid transparent!important;font-weight:700!important}',
'button:disabled{opacity:.48!important;cursor:not-allowed!important}',
'input:not([type=file]),textarea,select{background:color-mix(in srgb,var(--pn) 82%,var(--bg))!important;color:var(--tx)!important;border:1px solid var(--ln)!important;padding:10px 12px!important}',
'input::placeholder,textarea::placeholder{color:var(--mu)!important;opacity:.8!important}',
'input[type=file]{max-width:100%;color:var(--mu)!important}',
'input[type=range]{accent-color:var(--ac)!important}',
'.bar{background:var(--ln)!important;border-radius:999px!important;overflow:hidden!important}.bar i{background:linear-gradient(90deg,var(--ac),#4dd8e8)!important}',
'.it{padding:12px!important}.it button{border-radius:9px!important}',
'.aud{padding:12px!important}',
'canvas{border-radius:12px!important}',
'a{color:var(--ac)!important}',
':focus-visible{outline:2px solid #4dd8e8!important;outline-offset:2px!important}'
].join('\\n');
function apply(frame){try{const doc=frame.contentDocument;if(!doc||!doc.head)return;let style=doc.getElementById('cf-unified-theme');if(!style){style=doc.createElement('style');style.id='cf-unified-theme';doc.head.appendChild(style)}if(style.textContent!==frameCss)style.textContent=frameCss;const theme=document.documentElement.dataset.theme;if(theme)doc.documentElement.dataset.theme=theme;else doc.documentElement.removeAttribute('data-theme')}catch(e){}}
function sync(){document.querySelectorAll('iframe').forEach(apply)}
new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
document.addEventListener('load',e=>{if(e.target instanceof HTMLIFrameElement)apply(e.target)},true);
document.addEventListener('click',e=>{if(e.target.closest('#theme'))requestAnimationFrame(sync)},true);
sync();
})();