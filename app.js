/* ===========================================================================
   MAIN APPLICATION SCRIPT  (ClipForge Studio)
   All the logic of the page. Sections, in order:
     1. Basic helpers (toast, $ selectors, theme button)
     2. Scoring maths (pure functions: features, windows, camera plan, caption trim)
     3. App state, browser support checks, stop / abort handling
     4. Option chips, file loading, seeking, audio graph helpers
     5. Video analysis (audio features, motion probe, planning, logo finder)
     6. Tool switching (Shorts / Trailer / Image Animator)
     7. Trailer: plan, sound effects, music, text overlays, recording engine
     8. Shorts: analyze button, result list, drawing on the canvas
     9. Captions (Whisper), silence trim, helper media elements
    10. Smart reframe (face detection and camera plan)
    11. Load from link, MP4 fallback recorder (WebCodecs), export and save
    13. Project save and preview (at the end of this script)
   (The Image Animator has its own script block after this one.)
   =========================================================================== */
/* ===== 1. BASIC HELPERS ===== */
// Show a message in the red box at the bottom of the screen (it hides itself after 15 seconds).
const err=t=>{const e=document.getElementById('toast');e.textContent=t;e.style.display='block';clearTimeout(err.t);err.t=setTimeout(()=>e.style.display='none',15000)};
// Short selectors: $(css) = first matching element, $$(css) = all matching elements.
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
// Footer: show the current year.
$('#yr').textContent=new Date().getFullYear();

// Restore the saved light/dark theme (storage can be blocked, so errors are ignored).
try{const t=localStorage.getItem('cf-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}
// Theme button: switch between light and dark, apply it and remember the choice.
$('#theme').onclick=()=>{const r=document.documentElement,cur=r.dataset.theme||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'),nx=cur==='dark'?'light':'dark';r.dataset.theme=nx;try{localStorage.setItem('cf-theme',nx)}catch(e){}};
// Any async error that nobody caught is shown in the red box instead of being lost.
window.addEventListener('unhandledrejection',e=>{err('Something went wrong: '+((e.reason&&e.reason.message)||e.reason||'unknown error'))});
// If the "Fast" caption model is chosen together with Urdu or Hindi, show a tip that a bigger model is more accurate.
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-k=lang]');if(b&&/urdu|hindi/.test(b.dataset.v)&&S.model==='tiny'){const n=$('#capnote');if(n)n.textContent='Tip: for Urdu/Hindi the Fast model is often inaccurate. Choose Better or Best.'}});
/* ===== 2. SCORING MATHS =====
   Pure functions: they only work on numbers and never touch the page.
   They turn per-second audio / motion measurements into an "interest" score
   and then pick the best windows for shorts and trailers. */
// PURE-START
// Limit a number to the range 0..1.
const clamp01=x=>x>1?1:(x>0?x:0);
// Loudness (l) and speech-likeness (c = how much the loudness varies) of one audio slice, measured in 20 ms blocks.
function featOf(arr,sr,a,n){
 const fl=Math.max(8,Math.round(sr*.02)),m=Math.floor(n/fl);if(m<4)return{l:0,c:0};
 let sum=0,sq=0;
 for(let k=0;k<m;k++){let s=0,q=0;const o=a+k*fl;for(let i=0;i<fl;i+=2){const x=arr[o+i]||0;s+=x*x;q++}const r=Math.sqrt(s/Math.max(1,q));sum+=r;sq+=r*r}
 const mean=sum/m,vr=Math.max(0,sq/m-mean*mean);
 return{l:mean,c:mean>1e-5?Math.sqrt(vr)/mean:0}}
// Fill gaps (NaN = seconds that were not scanned) by copying / interpolating the neighbouring values.
function fillNaN(a){const n=a.length;let first=-1;for(let i=0;i<n;i++)if(a[i]===a[i]){first=i;break}if(first<0)return null;
 for(let i=0;i<first;i++)a[i]=a[first];let p=first;
 for(let i=first+1;i<n;i++){if(a[i]===a[i]){if(i-p>1){const x0=a[p],x1=a[i];for(let k=p+1;k<i;k++)a[k]=x0+(x1-x0)*(k-p)/(i-p)}p=i}}
 for(let i=p+1;i<n;i++)a[i]=a[p];return a}
// Percentile: the value below which the fraction q of the numbers fall.
function pct(a,q){const s=Array.from(a).sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*q))]||0}
// Rolling median over +-h samples (used as a local loudness baseline).
function rollMed(a,h){const n=a.length,o=new Float32Array(n);for(let i=0;i<n;i++){const s=Array.prototype.slice.call(a,Math.max(0,i-h),Math.min(n,i+h+1)).sort((x,y)=>x-y);o[i]=s[s.length>>1]}return o}
// Scale an array so its 95th percentile becomes 1 (values are capped at 1).
function norm(a){const m=pct(a,.95)||1e-9;return a.map(x=>Math.min(1,x/m))}
// Combine audio and motion into per-second scores: sp = speech, pk = peak above the local level, ac = activity, mo = motion, sc = final score (smoothed).
function comps(A,M,D){
 const sp=new Float32Array(D),pk=new Float32Array(D),ac=new Float32Array(D),mo=new Float32Array(D);
 if(A){const db=Float32Array.from(A.lvl,x=>20*Math.log10(x+1e-5)),fl=pct(db,.1),md=rollMed(db,45);
  for(let i=0;i<D;i++){ac[i]=clamp01((db[i]-fl-6)/22);pk[i]=clamp01((db[i]-md[i])/12);sp[i]=clamp01((A.cv[i]-.35)/.9)*ac[i]}}
 if(M){const m=norm(M);for(let i=0;i<D;i++)mo[i]=m[i]}
 const sc=new Float32Array(D);
 for(let i=0;i<D;i++)sc[i]=A&&M?.4*sp[i]+.28*pk[i]+.12*ac[i]+.2*mo[i]:A?.45*sp[i]+.33*pk[i]+.22*ac[i]:mo[i];
 for(let r=0;r<2;r++){const t=sc.slice();for(let i=0;i<D;i++)sc[i]=((t[i-1]??t[i])+t[i]*2+(t[i+1]??t[i]))/4}
 return{sp,pk,ac,mo,sc}}
// Pick the best non-overlapping windows of o.L seconds from the score array (options: count, spread over the video, random variety, range, windows already used, speech limits).
function pickWindows(C,o){
 const sc=C.sc,D=sc.length,dur=o.dur,L=Math.max(5,Math.min(o.L,Math.floor(dur)));
 const P=new Float64Array(D+1);for(let i=0;i<D;i++)P[i+1]=P[i]+sc[i];
 const lo=Math.max(0,Math.min(o.lo,D-L)),hi=Math.min(D,Math.max(o.hi,lo+L));
 const ab=(a,x,y)=>{x=Math.max(0,x);y=Math.min(D,y);let t=0;for(let i=x;i<y;i++)t+=a[i];return y>x?t/(y-x):0};
 const msp=o.minSp||0,W=[];for(let s=lo;s+L<=hi;s++){if(msp&&ab(C.sp,s,s+L)<msp)continue;if(o.maxSp!=null&&ab(C.sp,s,s+L)>o.maxSp)continue;const hk=Math.min(D,s+3),h3=(P[hk]-P[s])/Math.max(1,hk-s),on=Math.max(0,ab(C.sp,s,s+3)-ab(C.sp,s-2,s));
  W.push({s,w:(P[s+L]-P[s])/L+.3*h3+.25*on})}
 if(!W.length)W.push({s:lo,w:0});
 W.forEach(x=>x.k=o.rnd?x.w*(.75+.5*Math.random()):x.w);
 if(o.seen&&o.seen.length)W.forEach(x=>{for(const q of o.seen)if(Math.abs(q-x.s)<L*1.2){x.k*=.45;break}});
 const n=o.n==='auto'?0:o.n;let pk=[];
 if(n&&o.spread&&hi-lo>=n*L){const bw=(hi-lo)/n;
  for(let i=0;i<n;i++){const b0=lo+i*bw,b1=b0+bw;let b=null;for(const x of W)if(x.s>=b0-.001&&x.s+L<=b1+1&&(!b||x.k>b.k))b=x;if(b)pk.push(b)}}
 else{const gap=n?L:Math.max(L,(hi-lo)/16),lim=n||10,srt=[...W].sort((a,b)=>b.k-a.k);
  for(const x of srt){if(pk.length>=lim)break;if(!n&&pk.length&&x.k<pk[0].k*.7)break;if(pk.every(p=>Math.abs(p.s-x.s)>=gap))pk.push(x)}}
 pk.sort((a,b)=>a.s-b.s);
 const ws=W.map(x=>x.w).sort((a,b)=>a-b);
 const rank=w=>{let a=0,b=ws.length;while(a<b){const m=(a+b)>>1;if(ws[m]<=w)a=m+1;else b=m}return a};
 const av=(arr,s0,e0)=>{let t=0;for(let i=s0;i<Math.min(D,e0);i++)t+=arr[i];return t/Math.max(1,Math.min(D,e0)-s0)};
 return pk.map(x=>{const tags=[];
  if(av(C.sp,x.s,x.s+3)>.5)tags.push('Strong hook');if(av(C.sp,x.s,x.s+L)>.5)tags.push('Dialogue');
  if(av(C.pk,x.s,x.s+L)>.3)tags.push('Emotional peak');if(av(C.mo,x.s,x.s+L)>.5)tags.push('Lots of motion');
  return{s:x.s,e:Math.min(dur,x.s+L),w:x.w,score:Math.round(100*rank(x.w)/ws.length),tags,blob:null,pcm:null}})}
// "Split evenly" mode: cut the video into equal pieces instead of choosing by score.
function evenPlan(dur,L,n){L=Math.max(5,Math.min(L,dur));const tot=Math.max(1,Math.floor(dur/L)),cnt=n==='auto'?tot:Math.min(n,tot),out=[];
 for(let i=0;i<cnt;i++){const s=cnt===tot?i*L:Math.round((dur-L)*i/Math.max(1,cnt-1));out.push({s,e:Math.min(dur,s+L)})}
 if(cnt===tot&&out.length&&dur-out[cnt-1].e<5)out[cnt-1].e=dur;return out}

/* Camera plan. S = frame samples [{t,cut,faces:[{l,r,c,w,m}],mc:[16 column motion]}], ww = crop width (0-1).
   Returns keys [{t,t0,x,cut}]: one static crop per shot, moved only when the subject really moves. */
function planFrames(S,ww,t0){
 const lo=ww/2,hi=1-ww/2,cl=x=>Math.max(lo,Math.min(hi,x));
 if(!S.length)return[{t:t0,t0:t0,x:.5,cut:true}];
 const shots=[];let cur={a:0,e:t0,l:t0};
 for(let k=1;k<S.length;k++)if(S[k].cut){cur.b=k;shots.push(cur);cur={a:k,e:S[k-1].t,l:S[k].t}}
 cur.b=S.length;shots.push(cur);const keys=[];
 shots.forEach((sh,si)=>{
  const n=sh.b-sh.a,tg=new Array(n).fill(null);let prev=null,lastSw=-9,tk=[];
  for(let i=0;i<n;i++){const s=S[sh.a+i],F=s.faces||[];if(!F.length)continue;
   const mw=Math.max(...F.map(f=>f.w)),G=F.filter(f=>f.w>=mw*.45);let l=1,r=0;G.forEach(f=>{l=Math.min(l,f.l);r=Math.max(r,f.r)});let x;
   if(r-l<=ww*.88)x=(l+r)/2;
   else{G.forEach(f=>{let q=null,bd=.15;tk.forEach(t=>{const d=Math.abs(t.c-f.c);if(d<bd){bd=d;q=t}});if(!q){q={c:f.c,e:0};tk.push(q)}q.c=f.c;q.e=q.e*.75+(f.m||0)*.25;f.q=q});
    const cur=prev===null?null:G.find(f=>Math.abs(f.c-prev)<ww*.25),top=G.reduce((a,b)=>b.q.e+b.w*.01>a.q.e+a.w*.01?b:a);
    x=(cur&&!(top!==cur&&top.q.e>cur.q.e*1.6+.003&&s.t-lastSw>=1.5))?cur.c:top.c}
   if(prev!==null&&Math.abs(x-prev)>ww*.25)lastSw=s.t;prev=x;tg[i]=x}
  if(tg.some(v=>v!==null)){for(let i=0;i<n;i++)if(tg[i]===null){let d=1,f=null;while(f===null&&(i-d>=0||i+d<n)){if(i-d>=0&&tg[i-d]!==null)f=tg[i-d];else if(i+d<n&&tg[i+d]!==null)f=tg[i+d];d++}tg[i]=f}}
  else{const col=new Float32Array(16);for(let i=0;i<n;i++){const m=S[sh.a+i].mc;if(m)for(let j=0;j<16;j++)col[j]+=m[j]}
   const Wc=Math.max(1,Math.round(ww*16));let bj=-1,bs=0;for(let j=0;j+Wc<=16;j++){let s=0;for(let q=j;q<j+Wc;q++)s+=col[q];if(s>bs){bs=s;bj=j}}
   const all=col.reduce((a,b)=>a+b,0),x=bj>=0&&bs>=all*.5?(bj+Wc/2)/16:.5;tg.fill(x)}
  // Median-filter isolated detector noise, then apply a bidirectional low-pass
  // so the planned crop follows a subject without twitching between nearby samples.
  const med=tg.map((_,i)=>{const w=tg.slice(Math.max(0,i-2),Math.min(n,i+3)).sort((a,b)=>a-b);return w[w.length>>1]});
  const fwd=new Array(n),bwd=new Array(n);fwd[0]=med[0];
  for(let i=1;i<n;i++){const d=med[i]-fwd[i-1];fwd[i]=Math.abs(d)<ww*.025?fwd[i-1]:fwd[i-1]+d*.34}
  bwd[n-1]=med[n-1];for(let i=n-2;i>=0;i--){const d=med[i]-bwd[i+1];bwd[i]=Math.abs(d)<ww*.025?bwd[i+1]:bwd[i+1]+d*.34}
  const sm=med.map((x,i)=>cl(fwd[i]*.5+bwd[i]*.5));
  let curx=cl(sm[0]);keys.push({t:si?sh.l:t0,t0:si?sh.e:t0,x:curx,cut:true});
  let streak=0;const dead=ww*.14;
  for(let i=1;i<n;i++){const x=cl(sm[i]),tt=S[sh.a+i].t,lk=keys[keys.length-1],dx=Math.abs(x-curx);
   if(dx>ww*.3){if(++streak>=2&&tt-lk.t>1.2){curx=x;const ct=Math.max(lk.t+.05,tt-.5);keys.push({t:ct,t0:ct,x:curx,cut:true});streak=0}}
   else if(dx>ww*.2){if(++streak>=4){curx=x;keys.push({t:tt,t0:tt,x:curx,cut:false});streak=0}}
   else streak=0}
 });
 return keys}
/* tighten a caption segment [t0,t1] (seconds, relative to pcm) to the voiced part of the audio */
function snapSeg(pcm,t0,t1){
 const fl=800,n=Math.floor(pcm.length/fl);if(n<4)return[t0,t1];const e=new Float32Array(n);
 for(let i=0;i<n;i++){let s=0;for(let j=0;j<fl;j+=4){const x=pcm[i*fl+j]||0;s+=x*x}e[i]=Math.sqrt(s/(fl/4))}
 const so=Array.from(e).sort((a,b)=>a-b),thr=Math.max(.004,so[Math.floor(n*.9)]*.12);
 const a=Math.round(t0*20),b=Math.round(t1*20);let s=t0,f=t1;
 for(let i=Math.max(0,a-8);i<=Math.min(n-1,a+12);i++)if(e[i]>thr){s=i/20;break}
 for(let i=Math.min(n-1,b+8);i>=Math.max(0,b-12);i--)if(e[i]>thr){f=(i+1)/20+.12;break}
 if(f<s+.3)f=s+.3;return[s,f]}
// PURE-END

/* ===== 3. APP STATE AND BROWSER SUPPORT ===== */
// Main elements: v = the video player, cv = preview / recording canvas, ctx = its 2D drawing context.
const v=$('#src'),cv=$('#cv'),ctx=cv.getContext('2d');
// S = every user setting (count, length, framing, captions, trailer options...). Option buttons write into it through their data-k / data-v attributes.
let S={n:'auto',len:30,mode:'best',deep:'0',fit:'smart',cap:'off',lang:'auto',model:'base',cs:'classic',res:'720',tr:'off',logo:'on',tl:'60',cin:'off',tstyle:'clean',align:'off',tasp:'wide',tres:'720',tool:'shorts',sfx:'off',ovl:'on',vr:'spread',skip:'on'};
// Runtime state: clips (the plan), busy flag, RUN token (changing it cancels running work), loaded file info, and audio analysis data (ENV = loudness every 0.1 s).
let clips=[],busy=false,RUN=0,url=null,fname='video',file=null,PL=30,cues=[],capOn=false,AUD=null,ENV=null,LAST=null,REC=null,ALL=false,RECING=false;
// Web Audio objects: actx = audio context, src = video as audio source, adest = stream that is recorded, outG = speaker volume, recG = recording volume.
let actx=null,src=null,adest=null,outG=null,recG=null,EL={v2:null,a:null};
// Format seconds as m:ss.
const fmt=t=>{t=Math.round(t);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
// MP4 formats to try with the browser's built-in recorder (best first).
const mimes=['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1.4d4028,mp4a.40.2','video/mp4;codecs=avc1.42E01F,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=h264,aac','video/mp4'];
// The first MP4 format this browser can record natively (null if none).
const mime=window.MediaRecorder?mimes.find(m=>MediaRecorder.isTypeSupported(m)):null;
// WC = true when there is no native MP4 recorder but WebCodecs is available (fallback recorder, see makeWC).
const WC=!mime&&!!(window.VideoEncoder&&window.AudioEncoder&&window.MediaStreamTrackProcessor);
// WCok = the WebCodecs recorder can be used (also as an automatic second attempt when the native recorder makes an unusable file).
const WCok=!!(window.VideoEncoder&&window.AudioEncoder&&window.MediaStreamTrackProcessor);
// Output file extension.
const ext='mp4';
// Show a status line under the buttons.
const say=t=>$('#msg').textContent=t;
// Small async helpers: tick = give the browser a moment, sleep = wait.
const tick=()=>new Promise(r=>setTimeout(r,0));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Warn at start-up if this browser cannot record MP4 in any way.
if(!mime&&!WC)setTimeout(()=>say('This browser cannot record MP4. Use the latest Chrome or Edge (v126+), or Safari.'),0);

/* ---------- stop / abort ---------- */
// Abort handlers registered by running tasks; doStop() calls all of them.
const ABORT=new Set();
// Throw "Stopped" if the task was cancelled (RUN changed after it started).
const alive=tok=>{if(tok!==RUN)throw new Error('Stopped')};
// Wrap a promise with a time limit and make it cancellable; rejects with a readable message when it takes too long.
function guard(p,ms,label){const tok=RUN;return new Promise((res,rej)=>{
 if(tok!==RUN)return rej(new Error('Stopped'));
 let tm=null;const fin=()=>{ABORT.delete(h);clearTimeout(tm)},h=()=>{fin();rej(new Error('Stopped'))};
 ABORT.add(h);if(ms)tm=setTimeout(()=>{fin();rej(new Error((label||'Step')+' timed out'))},ms);
 Promise.resolve(p).then(x=>{fin();tok!==RUN?rej(new Error('Stopped')):res(x)},e=>{fin();rej(e)})})}
// Stop button logic: invalidate the running task and cancel anything it is waiting for.
function doStop(){RUN++;ABORT.forEach(h=>h());ABORT.clear();
 try{v.pause()}catch(e){}try{EL.v2&&EL.v2.pause()}catch(e){}try{EL.a&&EL.a.el.pause()}catch(e){}
 try{REC&&REC.state!=='inactive'&&REC.stop()}catch(e){}
 if(outG)outG.gain.value=1;if(recG)recG.gain.value=0;busy=false;ALL=false;RECING=false;lock(false);
 Object.keys(ST).forEach(k=>delete ST[k]);$('#pbar').classList.add('hide');say('Stopped.');if(clips.length)render();if(v.videoWidth)draw()}
// Stop button.
$('#stop').onclick=doStop;
// Status texts from several parallel jobs (analysis, captions...) that are shown together in one line.
const ST={};
// Update one job's status text and refresh the combined status line.
function stat(k,t){ST[k]=t;const s=Object.values(ST).filter(Boolean).join(' · ');if(!RECING)say(s?'Preparing: '+s:'');if(k==='cap'&&t)$('#capnote').textContent=t}

/* ===== 4. OPTION CHIPS, FILE LOADING, SEEKING AND AUDIO HELPERS ===== */
// Build a row of option chips (buttons) for one setting; clicking a chip selects it in S.
function chips(box,vals,key,fmtL){vals.forEach(n=>{const b=document.createElement('button');b.className='chip'+(S[key]===n?' on':'');b.textContent=fmtL(n);
 b.onclick=()=>{S[key]=n;box.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));if(key==='n')$('#custom').value=''};box.append(b)})}
// "How many shorts" chips.
chips($('#counts'),[1,3,5,8,10,'auto'],'n',n=>n==='auto'?'Auto':n);
// Custom count box (1-50).
const ci=document.createElement('input');ci.type='number';ci.id='custom';ci.min=1;ci.max=50;ci.placeholder='Other';
ci.oninput=()=>{const n=Math.max(1,Math.min(50,+ci.value||0));if(n){S.n=n;$$('#counts .chip').forEach(c=>c.classList.remove('on'))}};$('#counts').append(ci);
// "Length of each short" chips (15/30/45/60/90 s, custom, auto, full video).
chips($('#lens'),[15,30,45,60,90,'custom','auto','full'],'len',n=>n==='custom'?'Custom':n==='auto'?'Auto':n==='full'?'Full video':n+'s');
// Chosen clip length in seconds (null = auto).
const lenVal=()=>S.len==='custom'?Math.max(10,Math.min(90,+$('#cl').value||30)):(S.len==='auto'?null:+S.len);
// Show the custom-seconds box only when "Custom" is selected.
$$('#lens .chip').forEach(b=>b.addEventListener('click',()=>{$('#cl').classList.toggle('hide',S.len!=='custom');$('#fullnote').classList.toggle('hide',S.len!=='full')}));
// Generic option buttons: a button with data-k / data-v sets S[data-k] = data-v and highlights itself.
$$('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;S[k]=b.dataset.v;$$('[data-k="'+k+'"]').forEach(c=>c.classList.toggle('on',c===b));
 $('#posbox').classList.toggle('hide',S.fit!=='crop');$('#depthbox').classList.toggle('hide',S.mode!=='best');
 capOn=S.cap!=='off';$('#capbox').classList.toggle('hide',S.cap!=='file');$('#autobox').classList.toggle('hide',!(S.cap==='auto'||S.tr==='speech'));$('#stylebox').classList.toggle('hide',!capOn);
 if(k==='fit'||k==='cap'||k==='cs'){$('#pnote').textContent=S.fit==='smart'?'Preview is centered. Faces are tracked per shot while exporting.':'';if(v.videoWidth)draw()}});
// The crop-position slider redraws the preview.
$('#pos').oninput=draw;

// Load a chosen video: reset everything from the previous video, show the player and the options.
function load(f){if(!f)return;doStop();TRAILER=null;$('#trl').classList.add('hide');file=f;AUD=null;ENV=null;cues=[];LAST=null;clips=[];
 try{EL.v2&&EL.v2.remove()}catch(e){}EL={v2:null,a:null};
 if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);fname=f.name.replace(/\.[^.]+$/,'');v.src=url;say('');
 v.onloadedmetadata=()=>{$('#work').classList.remove('hide');$('#res').classList.add('hide');say(fmt(v.duration)+' video loaded.');projOffer()};
 v.onerror=()=>err('This browser cannot play that video format. Convert it to H.264 MP4 and try again.')}
// File picker.
$('#file').onchange=e=>load(e.target.files[0]);
// Drag-and-drop onto the upload box.
const dr=$('#drop');dr.ondragover=e=>e.preventDefault();dr.ondrop=e=>{e.preventDefault();load(e.dataTransfer.files[0])};

// Update the progress bar (p = 0..1).
function prog(p){const b=$('#pbar');b.classList.remove('hide');const i=b.querySelector('i');if(i)i.style.width=Math.round(Math.max(0,Math.min(1,p))*100)+'%'}
// User-facing progress: show only the current task and its overall progress, never backend or data-routing details.
function workProgress(label,p){const pc=Math.max(0,Math.min(100,Math.round(p)));prog(pc/100);say(label+' · '+pc+'%')}
// How many bytes of audio this device can safely decode in memory; bigger files are scanned by sampling instead.
const decodeLimit=()=>navigator.deviceMemory?Math.min(600e6,navigator.deviceMemory*60e6):250e6;

// Seek the video to time t and wait until it has really arrived (with a time limit).
function seek(el,t){return guard(new Promise(r=>{let d=0,to;const f=()=>{if(d)return;d=1;el.removeEventListener('seeked',f);clearTimeout(to);r()};
 to=setTimeout(f,5000);el.addEventListener('seeked',f);if(Math.abs(el.currentTime-t)<.01){setTimeout(f,0);return}el.currentTime=t}))}

// Wait until the video has a fresh frame to draw after a seek (at most 0.5 s).
function frameReady(el){return new Promise(res=>{let d=0;const fin=()=>{if(!d){d=1;res()}};setTimeout(fin,500);
 if(el.requestVideoFrameCallback)el.requestVideoFrameCallback(()=>fin());else{let n=0;const t=()=>{if(++n>=3&&el.readyState>=2)fin();else requestAnimationFrame(t)};requestAnimationFrame(t)}})}

/* ---------- audio graph ---------- */
// Create the Web Audio graph once (video source, speaker output and the stream that gets recorded).
function setupAudio(){if(actx)return;actx=new(window.AudioContext||window.webkitAudioContext)();src=actx.createMediaElementSource(v);adest=actx.createMediaStreamDestination();
 outG=actx.createGain();recG=actx.createGain();recG.gain.value=0;src.connect(outG);outG.connect(actx.destination);src.connect(recG);recG.connect(adest)}
// Make sure the audio graph exists and is running (browsers keep audio suspended until the user taps something).
async function audioReady(){setupAudio();if(actx.state==='suspended')await guard(actx.resume(),8000,'Audio start')}
// Capture raw audio samples from an audio node (silent tap) and hand them to a callback.
function startTap(node,cb){const p=actx.createScriptProcessor(4096,1,1),z=actx.createGain();z.gain.value=0;node.connect(p);p.connect(z);z.connect(actx.destination);
 p.onaudioprocess=e=>cb(new Float32Array(e.inputBuffer.getChannelData(0)));
 return{stop(){try{p.onaudioprocess=null;node.disconnect(p);p.disconnect();z.disconnect()}catch(_){}}}}
// Join several Float32 arrays into one.
const cat=bufs=>{let n=0;bufs.forEach(b=>n+=b.length);const o=new Float32Array(n);let k=0;bufs.forEach(b=>{o.set(b,k);k+=b.length});return o};
// Resample audio to 16 kHz (scoring and the speech model use 16 kHz).
function to16k(a,sr){if(sr===16000)return a;const r=sr/16000,n=Math.floor(a.length/r),o=new Float32Array(n);
 for(let i=0;i<n;i++){const s=Math.floor(i*r),e=Math.max(s+1,Math.floor((i+1)*r));let t=0;for(let j=s;j<e;j++)t+=a[j];o[i]=t/(e-s)}return o}

/* ===== 5. VIDEO ANALYSIS (audio features, motion probe, planning, logo finder) ===== */
/* ---------- analysis ---------- */
// Decode the file's audio (when small enough) and measure loudness / speech-likeness per second; also fills ENV (loudness every 0.1 s).
async function decodeFullAudioForAI(tok){
 const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 const oc=new AC(1,1,16000);
 const buf=await guard(oc.decodeAudioData(await file.arrayBuffer()),300000,'Audio decode');
 alive(tok);AUD=to16k(buf.getChannelData(0),buf.sampleRate);return AUD
}
async function audioFeats(D,tok){
 const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext,oc=new AC(1,1,16000);
 const buf=await guard(oc.decodeAudioData(await file.arrayBuffer()),300000,'Audio decode');alive(tok);const d=buf.getChannelData(0),sr=buf.sampleRate;AUD=d;
 const lvl=new Float32Array(D),cvv=new Float32Array(D);let mx=0;
 for(let t=0;t<D;t++){const a=t*sr,n=Math.min(sr,d.length-a);
  if(n<sr*.3){lvl[t]=lvl[t-1]||0;cvv[t]=cvv[t-1]||0;continue}
  const f=featOf(d,sr,a,n);lvl[t]=f.l;cvv[t]=f.c;if(f.l>mx)mx=f.l;if(t%200===0){alive(tok);prog(.1+.2*t/D);await tick()}}
 const m=Math.floor(d.length/(sr/10));ENV=new Float32Array(m);
 for(let k=0;k<m;k++){let s=0,q=0;const o=k*sr/10;for(let i=0;i<sr/10;i+=2){const x=d[Math.floor(o+i)]||0;s+=x*x;q++}ENV[k]=Math.sqrt(s/Math.max(1,q))}
 return mx>1e-4?{lvl,cv:cvv}:null}

// For long videos: instead of decoding everything, play short samples (step seconds apart) and measure audio / motion from them.
async function probeScan(D,lo,hi,step,wantAudio,wantMotion,tok){
 await audioReady();v.pause();v.muted=false;outG.gain.value=0;recG.gain.value=0;
 const lvl=new Float32Array(D).fill(NaN),cvv=new Float32Array(D).fill(NaN),mot=new Float32Array(D).fill(NaN);
 const tc=document.createElement('canvas');tc.width=32;tc.height=18;const tx=tc.getContext('2d',{willReadFrequently:true});
 const times=[];for(let t=lo;t<hi-1;t+=step)times.push(t);const dwell=1.0,sr=actx.sampleRate;
 try{
 for(let k=0;k<times.length;k++){
  alive(tok);const t=times[k];await seek(v,t);
  const bufs=[];let got=0;const tap=wantAudio?startTap(src,b=>{bufs.push(b);got+=b.length}):null;
  let prev=null,ms=0,mn=0,last=0;
  try{await guard(v.play(),15000,'Video play')}catch(e){tap&&tap.stop();throw e.message==='Stopped'?e:new Error('Video could not play: '+(e.message||e))}
  const t1=performance.now();
  await guard(new Promise(res=>{const f=()=>{const now=performance.now();
   if(wantMotion&&now-last>=125){last=now;tx.drawImage(v,0,0,32,18);const d=tx.getImageData(0,0,32,18).data;if(prev){let s=0;for(let i=0;i<d.length;i+=4)s+=Math.abs(d[i]-prev[i]);ms+=s;mn++}prev=d}
   if((wantAudio?got>=sr*(dwell+.2):now-t1>=dwell*1000)||now-t1>3500||tok!==RUN)res();else setTimeout(f,40)};f()}));
  v.pause();tap&&tap.stop();const sec=Math.min(D-1,Math.floor(t));
  if(wantAudio&&got>=sr*.7){const arr=cat(bufs),a0=Math.floor(sr*.2),f=featOf(arr,sr,a0,arr.length-a0);lvl[sec]=f.l;cvv[sec]=f.c}
  if(wantMotion&&mn>2)mot[sec]=ms/mn;
  prog(.05+.9*(k+1)/times.length);say('Scanning '+(k+1)+'/'+times.length+' · about '+Math.max(1,Math.ceil((times.length-k-1)*1.5/60))+' min left');
 }}finally{v.pause();if(outG)outG.gain.value=1}
 let A=null;if(wantAudio){const l=fillNaN(lvl),c=fillNaN(cvv);if(l&&c&&Math.max(...l)>1e-4)A={lvl:l,cv:c}}
 return{A,M:wantMotion?fillNaN(mot):null}}

/* full spoken lines (start and end on a pause) found from the loudness envelope; null when there is no usable audio */
function dlgLines(C,lo,hi,dur){
 if(!ENV||ENV.length<100)return null;
 const n=ENV.length,sm=new Float32Array(n);for(let i=0;i<n;i++)sm[i]=(ENV[Math.max(0,i-1)]+ENV[i]*2+ENV[Math.min(n-1,i+1)])/4;
 const so=Float32Array.from(sm).sort(),q=p=>so[Math.min(n-1,Math.floor(p*n))],b=q(.3),tp=q(.92),thr=b+.28*(tp-b);
 if(!(tp>b*1.6))return null;
 const raw=[];let st=-1,en=-1,gap=0;const i0=Math.max(0,Math.round(lo*10)),i1=Math.min(n,Math.round(hi*10));
 for(let i=i0;i<i1;i++){if(sm[i]>thr){if(st<0)st=i;en=i;gap=0}else if(st>=0&&++gap>4){raw.push([st,en]);st=-1}}
 if(st>=0)raw.push([st,en]);
 const out=[],av=(a,x,y)=>{let t=0,k=0;for(let i=Math.floor(x);i<Math.min(a.length,Math.ceil(y));i++){t+=a[i];k++}return k?t/k:0};
 for(const[a,z]of raw){if(z-a<6)continue;let s0=Math.max(0,a/10-.15);const e0=Math.min(dur,(z+1)/10+.25);
  while(e0-s0>7.2){let bi=-1,bv=1e9;for(let i=Math.round((s0+3)*10);i<=Math.round((s0+7)*10)&&i<n;i++)if(sm[i]<bv){bv=sm[i];bi=i}if(bi<0)break;out.push([s0,bi/10]);s0=bi/10}
  out.push([s0,e0])}
 return out.filter(x=>x[1]-x[0]>=1.4).map(x=>({s:x[0],e:x[1],w:av(C.sc,x[0],x[1])*(.6+.4*av(C.sp,x[0],x[1]))}))}
function pickLines(L,k,minGap,ex){const r=[];for(const x of [...L].sort((a,b)=>b.w-a.w)){if(r.length>=k)break;if(x.e-x.s<1.6||x.e-x.s>7.2)continue;
  if(ex.concat(r).some(p=>x.s<p.e+.4&&x.e>p.s-.4))continue;if(r.every(p=>Math.abs(p.s-x.s)>=minGap))r.push(x)}return r}
// Move time t to the quietest point within +-r seconds so cuts land on pauses.
function snapT(t,r){if(!ENV)return t;const i0=Math.max(1,Math.round((t-r)*10)),i1=Math.min(ENV.length-2,Math.round((t+r)*10));if(i1<=i0)return t;
 let bi=-1,bv=1e9;for(let i=i0;i<=i1;i++){const x=(ENV[i-1]+ENV[i]*2+ENV[i+1])/4+.0015*Math.abs(i/10-t);if(x<bv){bv=x;bi=i}}return bi<0?t:bi/10}

// For "auto" length: find a pause 22-58 s after s to end the clip (falls back to 40 s).
function endPause(s,dur){const a=Math.min(dur,s+22),b=Math.min(dur,s+58);if(!ENV||b-a<4)return Math.min(dur,s+40);let bi=-1,bv=1e9;
 for(let i=Math.round(a*10);i<=Math.round(b*10)&&i<ENV.length-1;i++){const x=(ENV[i-1]+ENV[i]*2+ENV[i+1])/4+.0008*Math.abs(i/10-(s+38));if(x<bv){bv=x;bi=i}}
 return bi<0?Math.min(dur,s+40):Math.min(dur,bi/10+.15)}
// Make a short start at the beginning of a spoken line and end at the end of one, so no sentence is cut in half.
// The length may change a little: up to 30% shorter, or longer by at most 25% / 6 s. prev / next = neighbouring shorts (never overlapped).
function fitLines(c,LN,prev,next,dur){
 const L0=c.e-c.s,lim=next?next.s-.5:dur,fl=prev?prev.e:0;
 let s=c.s;
 const a=LN.find(x=>x.s<s&&x.e>s+.3);
 if(a&&s-a.s<=4&&a.s>=fl)s=a.s;
 const t=s+L0,mx=Math.min(lim,t+Math.min(.25*L0,6)),mn=s+.7*L0;
 const b=LN.find(x=>x.s<t-.2&&x.e>t+.2);
 let e=t;
 if(b){let dn=-1;for(const x of LN)if(x.e<=t+.2&&x.e>dn)dn=x.e;
  const cu=b.e<=mx?b.e-t:1e9,cd=(dn>=mn&&dn>s)?t-dn:1e9;
  if(cu<1e9||cd<1e9)e=cu<=cd?b.e:dn}
 c.s=s;c.e=Math.min(dur,e)}
// Build the plan: choose clips from the scores (with random variety when rnd = true) and tidy their start / end times.
function doPlan(rnd){
 const{D,lo,hi,dur,C}=LAST,auto=S.len==='auto',L=auto?40:PL,base={n:S.n,spread:S.vr==='spread',rnd,lo,hi,dur,seen:LAST.seen};
 let r=pickWindows(C,{...base,L});
 r.forEach(c=>{if(ENV){const s=Math.max(0,snapT(c.s,2.5));c.s=s;c.e=auto?endPause(s,dur):Math.min(dur,Math.max(s+L*.8,snapT(s+L,2)))}else if(auto)c.e=Math.min(dur,c.s+40)});
 r.sort((a,b)=>a.s-b.s);r=r.filter((c,i)=>i===0||c.s>=r[i-1].e-.5);
 // Fit every short to whole spoken lines (only when the audio loudness data is available).
 {const LN=ENV?dlgLines(C,lo,hi,dur):null;if(LN&&LN.length)r.forEach((c,i)=>fitLines(c,LN,r[i-1],r[i+1],dur))}
 r.forEach(c=>LAST.seen.push(c.s));return r}

// Score how strongly a set of sample frames contains a static overlay (logo, banner or title card).
function overlayScore(F,w,h){const n=w*h,m=new Float32Array(n),st=new Uint8Array(n);
 for(let i=0;i<n;i++){let a=255,b=0,s=0;for(const f of F){const x=f[i];if(x<a)a=x;if(x>b)b=x;s+=x}m[i]=s/F.length;st[i]=(b-a)<=12?1:0}
 let sc=0;for(let i=0;i<n;i++)sc+=st[i];
 const se=new Uint8Array(n);for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){const i=y*w+x;if(st[i]&&Math.abs(m[i+1]-m[i])+Math.abs(m[i+w]-m[i])>40)se[i]=1}
 const R=[[0,0,.3,.22],[.7,0,.3,.22],[0,.78,.3,.22],[.7,.78,.3,.22],[0,0,1,.14],[0,.86,1,.14]];
 const reg=R.map(([a,b,c,d])=>{let t=0,k=0;for(let y=Math.floor(b*h);y<Math.floor((b+d)*h);y++)for(let x=Math.floor(a*w);x<Math.floor((a+c)*w);x++){t+=se[y*w+x];k++}return t/k});
 return{reg,frozen:sc/n>.97}}

// Fraction of the frame edge kept as margin by the logo check.
const LOGOMARGIN=.03;
// Grab k small greyscale frames between t0 and t1 for the overlay check.
async function frameSet(t0,t1,k,tok){const tc=document.createElement('canvas');tc.width=160;tc.height=90;const x=tc.getContext('2d',{willReadFrequently:true}),F=[];v.pause();
 for(let i=0;i<k;i++){alive(tok);await seek(v,Math.min(v.duration-.2,t0+(t1-t0)*(i+.5)/k));x.drawImage(v,0,0,160,90);const d=x.getImageData(0,0,160,90).data,g=new Uint8Array(14400);for(let j=0;j<14400;j++)g[j]=(d[j*4]*.3+d[j*4+1]*.59+d[j*4+2]*.11)|0;F.push(g)}
 return F}
/* ---------- logo finder (learns a repeating logo, then checks every pick) ---------- */
// Logo finder settings: working size and the zones (corners / edges) where logos usually sit.
const LG={W:320,H:180,ZN:[['top-left',0,0,.34,.26],['top-right',.66,0,.34,.26],['bottom-left',0,.74,.34,.26],['bottom-right',.66,.74,.34,.26]]};
// Seek to time t and return one greyscale frame at the logo-finder size.
async function grabLuma(t,tok){alive(tok);v.pause();await seek(v,Math.max(0,Math.min(v.duration-.2,t)));
 if(!LG.x){LG.c=document.createElement('canvas');LG.c.width=LG.W;LG.c.height=LG.H;LG.x=LG.c.getContext('2d',{willReadFrequently:true})}
 LG.x.drawImage(v,0,0,LG.W,LG.H);const d=LG.x.getImageData(0,0,LG.W,LG.H).data,g=new Uint8Array(LG.W*LG.H);for(let j=0;j<g.length;j++)g[j]=(d[j*4]*.3+d[j*4+1]*.59+d[j*4+2]*.11)|0;return g}
// Grab k evenly spread frames between t0 and t1.
async function frameSetN(t0,t1,k,tok){const F=[];for(let i=0;i<k;i++)F.push(await grabLuma(t0+(t1-t0)*(i+.5)/k,tok));return F}
// True if pixel i of frame f lies on an edge.
function lgEdge(f,i){const W=LG.W;return i%W<W-1&&i+W<f.length&&Math.abs(f[i+1]-f[i])+Math.abs(f[i+W]-f[i])>40}
// True if a frame matches the learned logo template in zone z (85% of the edge points agree).
function matchZone(f,z){let ok=0;const n=z.idx.length;for(let k=0;k<n;k++)if(Math.abs(f[z.idx[k]]-z.tm[k])<=14)ok++;return ok>=.85*n}
// Learn a repeating logo: sample many frames and find edges that stay in the same place in one zone.
async function learnLogo(tok,lo,hi){const P=28,T=[],F=[],W=LG.W,H=LG.H;
 for(let i=0;i<P;i++){const t=lo+(hi-lo-1)*(i+.5)/P;T.push(t);F.push(await grabLuma(t,tok))}
 const gap=Math.max(20,(hi-lo)/10),out={zones:[],persist:[],pairs:0};
 for(const[name,x0,y0,zw,zh]of LG.ZN){const px=[];for(let y=Math.floor(y0*H);y<Math.floor((y0+zh)*H);y++)for(let x=Math.floor(x0*W);x<Math.floor((x0+zw)*W);x++)px.push(y*W+x);
  const cnt=new Uint16Array(px.length);let pairs=0;
  for(let i=0;i<P;i++)for(let j=i+1;j<P;j++)if(T[j]-T[i]>=gap){pairs++;const a=F[i],b=F[j];for(let k=0;k<px.length;k++){const q=px[k];if(lgEdge(a,q)&&Math.abs(a[q]-b[q])<=6)cnt[k]++}}
  out.pairs=Math.max(out.pairs,pairs);if(pairs<6)continue;
  const lowT=Math.max(4,Math.round(.04*pairs)),hiT=Math.round(.55*pairs),idx=[],per=[];
  for(let k=0;k<px.length;k++){if(cnt[k]>=hiT)per.push(px[k]);else if(cnt[k]>=lowT)idx.push(px[k])}
  if(per.length>=20){out.persist.push(name);continue}
  if(idx.length>=25&&idx.length<=.14*px.length){const tm=new Uint8Array(idx.length);
   for(let k=0;k<idx.length;k++){const vals=[];for(const f of F)if(lgEdge(f,idx[k]))vals.push(f[idx[k]]);vals.sort((p,q)=>p-q);tm[k]=vals.length?vals[vals.length>>1]:128}
   out.zones.push({name,idx,tm})}}
 return out}
// Check every chosen clip for the learned logo and swap out clips that show it.
async function logoFilter(tok){if(LAST&&LAST.semanticPool){LAST.logoNote='AI-selected dialogue moments are preserved. Review visible logos in the preview.';return 0}const{lo,hi}=LAST;say('Looking for logos and banners…');
 if(!LAST.logoL)LAST.logoL=await learnLogo(tok,lo,hi);const L=LAST.logoL;LAST.logoNote='';
 if(L.persist.length)LAST.logoNote='A logo shows on almost every frame ('+L.persist.join(', ')+'). It cannot be avoided by choosing other scenes; Smart reframe or center crop often removes a corner logo.';
 if(!L.zones.length){if(!L.persist.length)LAST.logoNote='No repeating logo was found in this video, so nothing was skipped.';return 0}
 if(S.tool==='trailer')return 0;
 const orig=clips.slice();
 const bad=async c=>{const k=Math.max(2,Math.min(14,Math.round((c.e-c.s)/.8)));return(await frameSetN(c.s,c.e,k,tok)).some(f=>L.zones.some(z=>matchZone(f,z)))};
 let dropped=0;
 for(let round=0;round<4;round++){let flagged=0;
  for(const c of clips){if(c._ok)continue;if(await bad(c)){c._bad=1;flagged++}else c._ok=1}
  if(!flagged)break;dropped+=flagged;clips=clips.filter(c=>!c._bad);
  const extra=doPlan(true).filter(n=>!clips.some(c=>Math.abs(c.s-n.s)<PL));clips=clips.concat(extra).slice(0,S.n==='auto'?99:S.n);clips.sort((a,b)=>a.s-b.s)}
 for(const c of clips.filter(c=>!c._ok)){if(await bad(c))c._bad=1;else c._ok=1}clips=clips.filter(c=>!c._bad);
 if(!clips.length){clips=orig;clips.forEach(c=>{c._bad=0;c._ok=0;c.tags.push('Logo may be visible')});LAST.logoNote='Every pick in this video shows the logo, so the best picks were kept anyway. Try another part of the video.';return 0}
 clips.forEach(c=>{if(c._ok)c.tags.push('Logo check passed')});
 return dropped}


/* ---------- tools (shorts / trailer) ---------- */
/* ===== 6. TOOL SWITCHING (Shorts / Trailer / Image Animator) ===== */
// ZOOM, SHX, SHY = trailer punch-in zoom and camera shake; WIDEREC = recording 16:9; _langSave / _modeSave = settings remembered while a tool is open.
let _langSave=null,ZOOM=1,SHX=0,SHY=0,WIDEREC=false,_modeSave=null;
// Switch between tools (shorts / trailer / animator): updates the page, the tabs and the options for the selected tool.
function setTool(t,scroll){S.tool=t;document.body.dataset.tool=t;
 $$('#tooltabs [data-tool]').forEach(b=>{const on=b.dataset.tool===t;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
 if(t==='trailer'){if(S.lang==='auto'){_langSave='auto';S.lang='urdu';$$('[data-k=lang]').forEach(c=>c.classList.toggle('on',c.dataset.v==='urdu'))}if(S.mode!=='best'){_modeSave=S.mode;S.mode='best'}$('#go').textContent='Analyze video'}
 else{if(_langSave){S.lang=_langSave;_langSave=null;$$('[data-k=lang]').forEach(c=>c.classList.toggle('on',c.dataset.v===S.lang))}if(_modeSave){S.mode=_modeSave;_modeSave=null}$('#go').textContent='Find AI-selected moments'}
 if(scroll)$('#tool').scrollIntoView({behavior:'smooth'})}
// Address-hash routing: #shorts, #trailer, #animator and #tools decide which tool is shown.
function route(){const h=location.hash.replace('#','');
 if(h==='shorts'||h==='trailer'){document.body.classList.add('solo');setTool(h);document.title=(h==='trailer'?'Trailer / Promo':'Long Video → Shorts')+' – ClipForge Studio';window.scrollTo(0,0)}
 else if(h===''||h==='tools'){document.body.classList.remove('solo');document.title='ClipForge Studio'}}
// Re-route whenever the address hash changes, and once at start-up (see route() below).
addEventListener('hashchange',route);
// Trailer style buttons (Clean / Cinematic): update the options that depend on the style.
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-k=tstyle]');if(b){const cl=b.dataset.v==='clean';S.cin=cl?'off':'on';S.sfx=cl?'off':'on';[['cin',S.cin],['sfx',S.sfx]].forEach(([k,v])=>$$('[data-k='+k+']').forEach(c=>c.classList.toggle('on',c.dataset.v===v)))}});
// Clicking a tool card or the home link opens that tool / goes back to the tool list.
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a.toolcard,#homeLink');if(a&&busy){e.preventDefault();say('Stop the current job first, then go back.')}});
route();
/* ---------- trailer ---------- */
/* ===== 7. TRAILER ===== */
// The current trailer plan (parts, texts, music) or null.
let TRAILER=null;
// Real running time of a trailer plan in seconds (montage parts play faster in Cinematic style).
function realLen(T){const CL=S.tstyle==='clean',m=T.segs.filter(g=>g.a3).length;let t=T.segs.reduce((a,g)=>a+((g.a3&&!CL)?(g.e-g.s)/1.5:(g.e-g.s)),0);
 if(S.ovl==='on'){if(T.tag)t+=2.6;if(T.cast&&m)t+=2.2;if(T.rel)t+=4.2;if(T.words&&T.words.length)t+=Math.ceil(m/3)*.6}return t}
// Show the trailer plan (parts and length) with its Export / Save buttons.
function renderTrailer(){const b=$('#trlbox');b.innerHTML='';if(!TRAILER)return;const T=TRAILER,tot=T.segs.reduce((a,g)=>a+g.e-g.s,0),w=document.createElement('div');
 w.innerHTML='<p class="note"><b>'+T.segs.length+' parts · about '+Math.round(realLen(T))+' s</b>'+(T.note?' · '+T.note:'')+'</p><video class="thumb'+(T.blob?'':' hide')+'" playsinline controls></video><div class="bar"><i></i></div><div class="parts"></div>';
 const th=w.querySelector('video');if(T.blob){th.src=URL.createObjectURL(T.blob);w.querySelector('.bar i').style.width='100%'}
 const P=w.querySelector('.parts');T.segs.forEach((g,k)=>{const r=document.createElement('div');r.className='row';r.style.cssText='justify-content:space-between;font-size:13px;margin-top:4px';
  r.innerHTML='<span>'+(k+1)+'. '+fmt(g.s)+' – '+fmt(g.e)+(g.a3?' · montage':g.a4?' · closing':'')+'</span>';const x=document.createElement('button');x.className='sm';x.textContent='✕';x.setAttribute('aria-label','Remove part '+(k+1));
  x.onclick=()=>{if(busy||T.segs.length<2)return;T.segs.splice(k,1);T.s=T.segs[0].s;T.e=Math.max(...T.segs.map(g=>g.e));T.blob=null;renderTrailer()};
  // Extra part controls: move up / down (only inside the same group: dialogue, montage or closing) and replace with another part.
  const bx=document.createElement('span');bx.style.cssText='display:flex;gap:4px';
  const mkb=(txt,lab,fn)=>{const y=document.createElement('button');y.className='sm';y.textContent=txt;y.setAttribute('aria-label',lab);y.onclick=()=>{if(!busy)fn()};return y};
  const same=(a,b)=>!!b&&!!a.a3===!!b.a3&&!!a.a4===!!b.a4,upd=()=>{T.s=T.segs[0].s;T.e=Math.max(...T.segs.map(q=>q.e));T.blob=null;renderTrailer()};
  const mv=d=>{const o=T.segs[k+d];if(!same(g,o))return;T.segs[k]=o;T.segs[k+d]=g;upd()};
  bx.append(mkb('▶','Preview part '+(k+1),()=>previewSeg(g.s,g.e)));
  if(same(g,T.segs[k-1]))bx.append(mkb('▲','Move part '+(k+1)+' up',()=>mv(-1)));
  if(same(g,T.segs[k+1]))bx.append(mkb('▼','Move part '+(k+1)+' down',()=>mv(1)));
  if(!g.a3&&!g.a4&&LAST)bx.append(mkb('↻','Replace part '+(k+1)+' with another',()=>{
   // Find the best unused spoken line (or window) and put it in the same place; parts already replaced are not offered again.
   const{C,lo,hi,dur}=LAST,len=g.e-g.s,rej=T.rej||(T.rej=[]),ex=T.segs.concat(rej);let n=null;const LN=ENV?dlgLines(C,lo,hi,dur):null;
   if(LN&&LN.length){const r2=pickLines(LN,1,0,ex);if(r2[0])n={s:r2[0].s,e:r2[0].e}}
   else{const w2=pickWindows(C,{n:1,L:len,spread:true,rnd:true,lo,hi,dur,seen:ex.map(q=>q.s)});if(w2[0])n={s:w2[0].s,e:Math.min(dur,w2[0].s+len)}}
   if(!n)return err('No other part found.');rej.push(g);T.segs[k]=g.h?{...n,h:1}:n;upd()}));
  bx.append(x);r.append(bx);P.append(r)});
 const eb=document.createElement('button');eb.className='sm exp'+(T.blob?' p':'');eb.textContent=T.blob?'Save trailer':'Export trailer';eb.style.marginTop='8px';eb.onclick=()=>{if(T.blob)save(T,'T');else exportClip('T')};w.append(eb);
 if(T.blob)w.append(shareRow(T,'T'));
 T._el=w;b.append(w);projSave()}

/* ---------- trailer sound effects and text ---------- */
// Sound-effect state: output gain node and a noise buffer.
let sfxG=null,noiseBuf=null;
// Create the sound-effects output once.
function sfxInit(){if(sfxG)return;sfxG=actx.createGain();sfxG.gain.value=.55;sfxG.connect(adest);
 noiseBuf=actx.createBuffer(1,actx.sampleRate*2,actx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
// Play a synthesized sound effect (hit, boom, riser...).
function sfx(kind){try{sfxInit();const t=actx.currentTime,mk=(dur,type,f0,f1,q,g0,g1)=>{const n=actx.createBufferSource();n.buffer=noiseBuf;const f=actx.createBiquadFilter(),g=actx.createGain();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(g0,t+dur*.45);g.gain.exponentialRampToValueAtTime(g1,t+dur);n.connect(f);f.connect(g);g.connect(sfxG);n.start(t);n.stop(t+dur+.05)};
 if(kind==='whoosh')mk(.45,'bandpass',350,3500,1.2,.9,.001);
 else if(kind==='riser')mk(2.4,'bandpass',200,5000,2,.7,.001);
 else{const o=actx.createOscillator(),g=actx.createGain(),big=kind==='boom';o.type='sine';o.frequency.setValueAtTime(big?110:90,t);o.frequency.exponentialRampToValueAtTime(30,t+(big?1.4:.9));
  g.gain.setValueAtTime(big?1.1:.8,t);g.gain.exponentialRampToValueAtTime(.001,t+(big?1.5:1));o.connect(g);g.connect(sfxG);o.start(t);o.stop(t+1.6);mk(.5,'lowpass',2500,120,.7,.8,.001)}}catch(e){}}
// Convert a source time t into trailer time (time elapsed through the chosen parts).
function ttOf(segs,t){let a=0;for(const g of segs){if(t<g.s)return a;if(t<=g.e)return a+(t-g.s);a+=g.e-g.s}return a}
// Draw one block of overlay text on the canvas (handles right-to-left text such as Urdu).
function ovBlock(txt,y,px,al,wt){if(!txt||al<=0)return;const rtl=/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(txt),W=cv.width,k=WIDEREC?cv.height/900:W/720;
 ctx.save();ctx.globalAlpha=Math.min(1,al);ctx.font=(wt||800)+' '+Math.round(px*k)+'px '+(rtl?FONT_RTL:FONT_LATIN);ctx.textAlign='center';ctx.textBaseline='middle';try{ctx.direction=rtl?'rtl':'ltr'}catch(e){}
 const words=txt.split(/\s+/),lines=[];let ln='';for(const w of words){const t=ln?ln+' '+w:w;if(ctx.measureText(t).width>W*.84&&ln){lines.push(ln);ln=w}else ln=t}if(ln)lines.push(ln);
 const lh=px*k*1.3;let yy=y*cv.height-(lines.length-1)*lh/2;ctx.lineJoin='round';ctx.lineWidth=7*k;ctx.strokeStyle='rgba(0,0,0,.85)';ctx.fillStyle='#fff';
 for(const l of lines){ctx.strokeText(l,W/2,yy);ctx.fillText(l,W/2,yy);yy+=lh}ctx.restore()}
// Draw the trailer text overlays for the current moment.
function trlOverlay(T,tt,holdT,held){if(S.ovl!=='on')return;const W=cv.width,H=cv.height;
 if(held){const a=Math.min(1,holdT/.4);ctx.save();ctx.globalAlpha=a*.8;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();ovBlock(T.title,.36,40,a,700);ovBlock(T.rel,.5,54,a);return}
 if(tt<3.4){const a=Math.min(1,tt/.5,(3.4-tt)/.7);ctx.save();ctx.globalAlpha=Math.max(0,a)*.45;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();ovBlock(T.title,.45,62,a);ovBlock(T.tag,.56,34,a,600)}}

/* ---------- cinematic trailer engine ---------- */
// Start the trailer music: your own file if given, otherwise a synthesized drone. Returns an object with stop().
async function startMusic(c,TOT){const nodes=[],t0=actx.currentTime,end=t0+TOT+8;let buf=null;
 if(c.music){try{buf=await actx.decodeAudioData(await c.music.arrayBuffer())}catch(e){$('#capnote').textContent='Music file could not be read, using the built-in score.'}}
 sfxInit();const g=actx.createGain();g.gain.setValueAtTime(.0001,t0);g.connect(adest);
 if(buf){const o=actx.createBufferSource();o.buffer=buf;o.loop=true;o.connect(g);o.start(t0);g.gain.linearRampToValueAtTime(.32,t0+2);nodes.push(o)}
 else{const f=actx.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(180,t0);f.frequency.exponentialRampToValueAtTime(1200,t0+TOT);f.connect(g);
  [[55,'sawtooth'],[55.5,'sawtooth'],[110.4,'triangle']].forEach(([fr,ty])=>{const o=actx.createOscillator();o.type=ty;o.frequency.setValueAtTime(fr,t0);o.frequency.exponentialRampToValueAtTime(fr*1.5,t0+TOT);o.connect(f);o.start(t0);nodes.push(o)});
  g.gain.linearRampToValueAtTime(.22,t0+TOT*.9)}
 return{stop(){const t=actx.currentTime;try{g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(Math.max(.0001,g.gain.value),t);g.gain.linearRampToValueAtTime(.0001,t+.8)}catch(e){}
  setTimeout(()=>nodes.forEach(o=>{try{o.stop()}catch(e){}}),900)},synth:!buf}}
// One synthesized heartbeat thump.
function thump(vol){try{sfxInit();const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(32,t+.22);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(sfxG);o.start(t);o.stop(t+.35)}catch(e){}}
// Apply the cinematic look to the frame just drawn: colour grade, vignette, flash, fade to black, 2.39:1 bars.
function gradeFrame(a){const W=cv.width,H=cv.height;ctx.save();
 if(S.cin==='on'){ctx.globalCompositeOperation='overlay';let gr=ctx.createLinearGradient(0,0,0,H);gr.addColorStop(0,'rgba(0,90,120,.42)');gr.addColorStop(1,'rgba(150,70,0,.34)');ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='source-over';gr=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.72);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
  if(WIDEREC){const bh=Math.max(0,(H-W/2.39)/2);ctx.fillStyle='#000';ctx.fillRect(0,0,W,bh);ctx.fillRect(0,H-bh,W,bh)}}
 if(a.flash>0){ctx.globalAlpha=Math.min(.6,a.flash*.6);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H)}
 if(a.black>0){ctx.globalAlpha=Math.min(1,a.black);ctx.fillStyle='#000';ctx.fillRect(0,0,W,H)}
 ctx.restore()}
// Draw a black text card (opening line, middle card or final title).
function cardFrame(cd){const W=cv.width,H=cv.height;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const al=cd.fast?Math.max(0,Math.min(1,cd.el/.08,(cd.dur-cd.el)/.1)):Math.max(0,Math.min(1,cd.el/.5,(cd.dur-cd.el)/.5));
 cd.lines.forEach(([t,y,px,wt])=>{if(t)ovBlock(/[\u0590-\u08FF]/.test(t)?t:t.toUpperCase(),y,px,al,wt)})}
// Play and record the trailer: walks through the planned parts, seeks between them, draws cards and overlays, and drives the recorder (it is paused while the video seeks).
async function runTrailer(c,tok,rec,bar){
// The parts, the total length and the running start time of each part.
 const segs=c.segs,n=segs.length,TOT=segs.reduce((a,g)=>a+g.e-g.s,0),cum=[];let acc=0;segs.forEach(g=>{cum.push(acc);acc+=g.e-g.s});
// Settings read once: where the montage starts (act3), overlays on, sound effects on, cinematic on, clean style.
 const act3=segs.findIndex(g=>g.a3),on=S.ovl==='on',fx=S.sfx==='on',cin=S.cin==='on',clean=S.tstyle==='clean';
// Start the music (when sound effects are on or your own music file was chosen).
 const music=(fx||c.music)?await startMusic(c,TOT):null;alive(tok);
 return new Promise(res=>{recG.gain.value=1;let fIdx=-1,pendR=false,ci=0,pun=0,wp=0,word='',wi=0,idx=0,sk=false,card=null,last=performance.now(),flash=0,rised=false,nextP=actx.currentTime+.4,done=false;
// finish(): reset zoom and volume, stop the music and end.
  const finish=()=>{if(done)return;done=true;ZOOM=1;SHX=SHY=0;v.playbackRate=1;recG.gain.value=1;music&&music.stop();res()};
// mk(): show a black text card for dur seconds (the video pauses meanwhile).
  const mk=(lines,dur,final,fast)=>{card={lines,dur,el:0,final,fast};v.pause();if(fx)sfx(final?'boom':'hit')};
// Opening line card.
  if(on&&c.tag)mk([[c.tag,.5,44,600]],2.6,false);
// Main loop, runs on every animation frame.
  const loop=()=>{
   if(tok!==RUN){finish();return}
   const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;
// While a card is showing: draw it, resume the recorder, and carry on when it ends.
   if(card){if(!v.paused)v.pause();card.el+=dt;cardFrame(card);if(pendR){pendR=false;try{rec.resume()}catch(e){}}
    if(card.el>=card.dur){const f=card.final;card=null;if(f){finish();return}v.play().catch(()=>{})}
    requestAnimationFrame(loop);return}
// Current part g, current video time and trailer time.
   const g=segs[idx],cur=v.currentTime,tt=cum[idx]+Math.max(0,cur-g.s);
// Fade the sound out during the last 0.1 s of a part so cuts do not click.
   if(!sk&&fIdx!==idx&&g.e-cur<.1){fIdx=idx;try{const tn=actx.currentTime;recG.gain.cancelScheduledValues(tn);recG.gain.setValueAtTime(recG.gain.value,tn);recG.gain.linearRampToValueAtTime(.0001,tn+.08)}catch(e){}}
// The part has finished: go to the next one (or show the title card / finish after the last part).
   if(!sk&&cur>=g.e-.04){idx++;
    if(idx>=n){v.pause();if(on&&(c.title||c.rel))mk([[c.title,.42,70,800],[c.rel,.58,38,600]],4.2,true);else{finish();return}requestAnimationFrame(loop);return}
// Pause the recorder, jump to the next part, then un-mute and carry on.
    sk=true;try{rec.pause()}catch(e){}
    seek(v,segs[idx].s).then(()=>frameReady(v)).then(()=>{const m3=!!segs[idx].a3,fast=m3&&!clean,mute=!!(segs[idx].a3||segs[idx].a4);recG.gain.cancelScheduledValues(actx.currentTime);recG.gain.setValueAtTime(mute?0:.0001,actx.currentTime);if(!mute)recG.gain.linearRampToValueAtTime(1,actx.currentTime+.07);v.playbackRate=fast?1.5:1;pendR=true;if(fx){sfx('whoosh');if(m3)sfx('hit')}flash=clean?0:(m3?1:.5);sk=false;if(m3){ci++;pun=1;if(on&&c.words&&c.words.length&&ci%3===1)mk([[c.words[wi++%c.words.length],.5,96,900]],.6,false,true)}
     if(idx===act3&&on&&c.cast)mk([[c.cast,.5,40,600]],2.2,false)},()=>{sk=false})}
// Cinematic extras: punch-in zoom, shake, flashes and montage words (not used in Clean style).
   const pr=Math.min(1,Math.max(0,(cur-g.s)/Math.max(.5,g.e-g.s)));if(cin){if(g.a3){const ty=ci%3;ZOOM=ty===0?1+.22*pun:ty===1?1.08:1+.07*pr+.1*pun;const k2=cv.width/1280;SHX=ty===1?(Math.random()-.5)*44*pun*k2:0;SHY=ty===1?(Math.random()-.5)*30*pun*k2:0}else{ZOOM=1+.07*pr;SHX=SHY=0}}else{ZOOM=1;SHX=SHY=0}pun=Math.max(0,pun-dt*5);
// Draw this frame on the canvas.
   draw();
// Fade in from black at the start and out at the end (Cinematic only).
   const left=g.e-cur,black=clean?0:Math.max(tt<.8?1-tt/.8:0,idx===n-1&&left<.6?1-left/.6:0);
// Apply the look and draw the montage word while one is showing.
   gradeFrame({flash,black});flash=Math.max(0,flash-dt*5);if(wp>0&&word){ovBlock(/[\u0590-\u08FF]/.test(word)?word:word.toUpperCase(),.5,92*(1+.7*wp),Math.min(1,(1-wp)*4+.4),900);wp=Math.max(0,wp-dt*1.6)}
// Riser sound shortly before the end.
   if(fx&&!rised&&tt>TOT-2.6){rised=true;sfx('riser')}
// Heartbeat thumps that speed up towards the end (built-in score only).
   if(fx&&music&&music.synth&&tt>TOT*.2&&actx.currentTime>=nextP){thump(.7);nextP=actx.currentTime+Math.max(.3,1.1-.8*tt/TOT)}
// Update the progress bar and resume the recorder after a seek.
   bar.style.width=Math.min(100,tt/TOT*100)+'%';if(pendR){pendR=false;try{rec.resume()}catch(e){}}
   requestAnimationFrame(loop)};
  loop()})}
// "Make trailer" button: choose the parts, build the plan (TRAILER) and show it.
$('#trlgo').onclick=async()=>{if(busy)return;if(!LAST)return err('Run "Find shorts" on the video first (Best-moments mode), then make the trailer.');
 const tok=RUN;busy=true;lock(true);
// Read the analysis result and work out the trailer sizes.
 try{const{lo,hi,dur,C}=LAST,len=5,n=Math.max(4,Math.round(+S.tl/len)),hi2=Math.round(hi-(hi-lo)*.08);
  say('Choosing trailer parts…');const Tc=Math.max(20,+S.tl-6),n1=Math.max(3,Math.round(Tc*.62/5.5)),n3=Math.max(4,Math.round(Tc*.38/2));
// segs = the parts [{s, e}] (a3 = montage hit, a4 = ending, h = opening dialogue line).
  let segs,note='';
// CLEAN style: dialogue scenes first, then a fast montage, then a closing shot.
  if(S.tstyle==='clean'){const T0=+S.tl,actT=T0*.74,monT=T0*.12,pat=[3,2,4.5,2.4,2.2,2,3.2,1.6,1.2,1.5,1.8,1.6,2.5],lens=[];
// Build the list of part lengths for the dialogue section.
   for(let tt=0,i=0;tt<actT-1;i++){lens.push(pat[i%pat.length]);tt+=pat[i%pat.length]}
   const nA=lens.length,nM=Math.max(6,Math.round(monT/.4));
// Choose scene windows by score, spread over the video.
   let r=[];for(const ms of [.5,.35,0]){r=pickWindows(C,{n:nA,spread:true,rnd:false,lo,hi:hi2,dur,seen:[],L:5,minSp:ms});if(r.length>=Math.ceil(nA*.7))break}
// Sort them by time.
   const aW=r.sort((a,b)=>a.s-b.s);
// Move each start to a quiet point (a pause).
   if(ENV)aW.forEach(c=>{c.s=Math.max(0,snapT(c.s,2))});
// Default parts: a fixed length from each window start.
   let A=aW.map((c,i)=>({s:c.s,e:Math.min(dur,c.s+lens[i%lens.length])}));
// If the audio allows it, replace them with whole spoken lines: the best 4-5 open the trailer, then more full lines follow.
   {const LN=dlgLines(C,lo,hi2,dur);if(LN){const H=pickLines(LN,5,8,[]);
     if(H.length>=3){let tot=H.reduce((a,x)=>a+x.e-x.s,0);const R=[];for(const x of pickLines(LN.filter(z=>!H.includes(z)),14,3.5,H)){if(tot>=actT)break;R.push(x);tot+=x.e-x.s}
      A=H.sort((a,b)=>a.s-b.s).map(x=>({s:x.s,e:x.e,h:1})).concat(R.sort((a,b)=>a.s-b.s).map(x=>({s:x.s,e:x.e})));note=H.length+' full dialogue lines open the trailer'}}}
// quiet(): find calmer windows (little speech) for the montage and the ending.
   const quiet=(n,L)=>{let q=[];for(const mx of [.25,.4,1]){q=pickWindows(C,{n,spread:true,rnd:false,lo,hi:hi2,dur,seen:[],L,maxSp:mx});if(q.length>=Math.ceil(n*.6))break}return q};
// free(): true if a window does not overlap the dialogue parts.
   const free=x=>!A.some(p=>x.s<p.e+1&&x.e>p.s-1);
// Pick the closing shot(s).
   let endW=quiet(6,5).filter(x=>free({s:x.s,e:x.s+4.5})).sort((a,b)=>(b.w||0)-(a.w||0)).slice(0,2);
   const used=A.concat(endW.map(c=>({s:c.s,e:c.s+4.5})));
// Montage clips: short hits taken from the quieter windows.
   let m=quiet(nM+4,5);
   m=m.flatMap(x=>{const sc=[];for(let t=x.s;t<=x.s+3;t++)sc.push([((C.sc[t]||0)+(C.sc[t+1]||0))*(1-Math.min(1,(C.sp[t]||0))),t]);sc.sort((a,b)=>b[0]-a[0]);const out=[{s:sc[0][1],e:Math.min(dur,sc[0][1]+.45),w:x.w}],o=sc.find(q=>Math.abs(q[1]-sc[0][1])>=2);if(o)out.push({s:o[1],e:Math.min(dur,o[1]+.45),w:x.w*.99});return out}).filter(x=>!used.some(p=>x.s<p.e+1&&x.e>p.s-1)).slice(0,nM);
   m.sort((a,b)=>(a.w||0)-(b.w||0));
// Ending parts.
   const E=[];if(endW[0])E.push({s:endW[0].s,e:Math.min(dur,endW[0].s+4.5),a4:1});if(endW[1])E.push({s:endW[1].s,e:Math.min(dur,endW[1].s+.6),a4:1});
// Join: dialogue + montage + ending.
   segs=A.concat(m.map(x=>({s:x.s,e:x.e,a3:1}))).concat(E)}
// CINEMATIC style: longer scenes, then fast 1.5 s montage hits.
  else{
  let r=[];for(const ms of [.5,.35,0]){r=pickWindows(C,{n:n1,spread:true,rnd:false,lo,hi:hi2,dur,seen:[],L:5.5,minSp:ms});if(r.length>=Math.ceil(n1*.7))break}
  r.forEach(c=>{if(ENV){c.s=Math.max(0,snapT(c.s,2.5));c.e=Math.min(dur,Math.max(c.s+4.5,snapT(c.s+5.5,2)))}});
  r.sort((a,b)=>a.s-b.s);r=r.filter((c,i)=>i===0||c.s>=r[i-1].e);
  let m=[];for(const ms of [.35,0]){m=pickWindows(C,{n:Math.max(6,Math.round(Tc*.38/1.0)),spread:true,rnd:false,lo,hi:hi2,dur,seen:[],L:5,minSp:ms});if(m.length>=4)break}
  m=m.map(x=>{let bt=x.s,bv=-1;for(let t=x.s;t<=x.s+3;t++){const q=(C.sc[t]||0)+(C.sc[t+1]||0);if(q>bv){bv=q;bt=t}}return{s:bt,e:Math.min(dur,bt+1.5),w:x.w,a3:1}}).filter(x=>!r.some(p=>x.s<p.e+1&&x.e>p.s-1));
  m.sort((a,b)=>(a.w||0)-(b.w||0));
  segs=r.map(c=>({s:c.s,e:c.e})).concat(m.map(x=>({s:x.s,e:x.e,a3:1})));}
// Optional: align the cut points to full spoken lines with Whisper (slow; can be skipped).
  if(S.align==='on'){const _m=S.model;try{if(S.model==='tiny')S.model='base';const ns=segs.filter(g=>!g.a3&&!g.a4);
   let skipped=false;const tStart=Date.now(),sp=new Promise(r=>{['#skipAlign','#skipAlign2'].forEach(id=>{const bt=$(id);bt.hidden=false;bt.onclick=()=>{skipped=true;r()}})});
   for(let i=0;i<ns.length;i++){if(skipped||Date.now()-tStart>150000){note=skipped?'dialogue alignment skipped':'dialogue alignment took too long and was skipped';break}const g=ns[i];stat('al','dialogue '+(i+1)+' of '+ns.length+(AUD?'':' (real time, keep this screen on)'));alive(tok);
    const t0=Math.max(0,g.s-2),t1=Math.min(dur,g.e+4),got=await Promise.race([sp,new Promise(r=>setTimeout(()=>r('SLOW'),60000)),(async()=>{const pcm=await clipPCM({s:t0,e:t1,pcm:null},tok);alive(tok);return buildCues(await transcribe(pcm,tok),t0,pcm)})()]);if(skipped){note='dialogue alignment skipped';break}if(got==='SLOW'){note='dialogue alignment was too slow on this device and was skipped';break}const q=got;
    const a=q.find(x=>x.s<=g.s+.3&&x.e>g.s+.3),b=q.find(x=>x.s<g.e-.3&&x.e>=g.e-.3);let s2=a?Math.max(t0,a.s-.1):g.s,e2=b?Math.min(t1,b.e+.2):g.e;if(e2-s2<=10){g.s=s2;g.e=e2}}}
   catch(e){if(e.message==='Stopped')throw e;note=/dynamically imported|Failed to fetch|NetworkError|network/i.test(e.message||'')?'speech model could not be downloaded (check your internet), so cuts were not aligned to dialogue':'dialogue alignment failed ('+(e.message||e)+')'}finally{S.model=_m;stat('al','');stat('cap','');['#skipAlign','#skipAlign2'].forEach(id=>$(id).hidden=true)}}
// Keep the opening dialogues first, sort the other parts by time and remove overlaps.
  {const H=segs.filter(g=>g.h),A=segs.filter(g=>!g.a3&&!g.a4&&!g.h).sort((a,b)=>a.s-b.s),M=segs.filter(g=>g.a3),E=segs.filter(g=>g.a4);segs=H.concat(A.filter((g,i)=>(i===0||g.s>=A[i-1].e)&&!H.some(p=>g.s<p.e&&g.e>p.s))).concat(M).concat(E)}
// Logo check: drop parts that show a logo or banner.
  if(S.logo==='on'&&LAST.logoL&&LAST.logoL.zones.length&&v.videoWidth){const L=LAST.logoL,keep=[];for(const g of segs){alive(tok);const k=Math.max(2,Math.min(8,Math.round((g.e-g.s)/.6)));if((await frameSetN(g.s,g.e,k,tok)).some(f=>L.zones.some(z=>matchZone(f,z))))continue;keep.push(g)}
   if(keep.length&&keep.length<segs.length)note=(note?note+' · ':'')+'dropped '+(segs.length-keep.length)+' part(s) showing a logo';if(keep.length)segs=keep}
  else if(S.logo==='on'&&LAST.logoL&&!LAST.logoL.zones.length)note=(note?note+' · ':'')+(LAST.logoNote||'no repeating logo found');
  else if(S.logo==='on')note=(note?note+' · ':'')+'logo check not run (needs the logo option on during Analyze)';
// At least 2 parts are needed.
  if(segs.length<2)throw new Error('Could not find enough parts. Try a longer video.');
// Store the plan with the typed texts (words, cast, title, release line) and your music file, then show it.
  TRAILER={words:($('#tWords').value||'').split(/[,،]/).map(x=>x.trim()).filter(Boolean),cast:$('#tCast').value.trim(),music:$('#tMusic').files[0]||null,title:$('#tTitle').value.trim(),tag:$('#tTag').value.trim(),rel:$('#tRel').value.trim(),trailer:1,s:segs[0].s,e:segs[segs.length-1].e,segs,note,blob:null,tags:[],pcm:null};renderTrailer();say('Trailer parts ready. Remove any you do not want, then Export trailer.')
// Report a failure to the user.
 }catch(e){if(e.message!=='Stopped'){say('Trailer failed: '+(e.message||e));err('Trailer failed: '+(e.message||e))}}
// Always unlock the interface at the end.
 if(tok===RUN){busy=false;lock(false)}};
/* ===== 8. SHORTS: ANALYZE BUTTON, RESULT LIST, DRAWING ===== */
// "Analyze & create plan" button (Shorts and Trailer): scans the video, scores every second, then builds the plan.
$('#go').onclick=async()=>{
 if(busy)return;const tok=RUN;busy=true;lock(true);$('#res').classList.add('hide');PL=lenVal()||45;prog(.01);
 try{
  const dur=v.duration,D=Math.ceil(dur);LAST=null;
  if(S.len==='full'){clips=[{s:0,e:dur,score:null,tags:['Full video'],full:1,blob:null,pcm:null}];const mb=Math.round((S.res==='1080'?8:4)/8*dur);say('Full video: '+Math.round(dur/60)+' min of real-time export, roughly '+mb+' MB. Keep this screen on.')}
  else if(S.tool==='trailer'&&S.mode==='even'){clips=evenPlan(dur,PL,S.n).map(x=>({...x,score:null,tags:[],blob:null,pcm:null}));say('Split into '+clips.length+' trailer parts.')}
  else{
   let lo=0,hi=D;if(S.skip==='on'&&D>300){lo=Math.min(90,Math.round(D*.04));hi=D-Math.min(120,Math.round(D*.05))}
   if(S.tool==='shorts'){
    if(file.size>decodeLimit())throw new Error('This video is too large for reliable on-device dialogue analysis on this device. Try a shorter or smaller source video.');
    workProgress('Preparing audio',8);
    try{await decodeFullAudioForAI(tok)}catch(e){if(e.message==='Stopped')throw e;AUD=null;throw new Error('Could not decode this video’s audio for AI dialogue analysis: '+(e.message||e))}
    alive(tok);LAST={D,lo,hi,dur,seen:[]};
    workProgress('Transcribing audio',12);clips=await semanticShortPlan(tok,dur);
   }else{
    let A=null,M=null;
    if(file.size<=decodeLimit()){say('Reading audio…');try{A=await audioFeats(D,tok)}catch(e){if(e.message==='Stopped')throw e;A=null;AUD=null;ENV=null}}
    if(!A){const step=S.deep==='1'?6:12,n=Math.ceil((hi-lo)/step);
     say('Scanning '+n+' points across the video (about '+Math.max(1,Math.ceil(n*1.5/60))+' min). Keep this screen on.');
     const P=await probeScan(D,lo,hi,step,true,true,tok);A=P.A;M=P.M}
    else if(S.deep==='1'){say('Scanning motion…');M=(await probeScan(D,lo,hi,8,false,true,tok)).M}
    alive(tok);
    if(!A&&!M)throw new Error('Could not read audio or video frames from this file.');
    LAST={D,lo,hi,dur,seen:[],C:comps(A,M,D)};clips=doPlan(false);
   }
   if(S.logo==='on'&&v.videoWidth){try{const dn=await logoFilter(tok);$('#capnote').textContent=(dn?'Replaced '+dn+' short(s) that showed a logo. ':'')+(LAST.logoNote||'')}catch(e){if(e.message==='Stopped')throw e;$('#capnote').textContent='Logo check skipped: '+(e.message||e)}}
   if(!clips.length)throw new Error('No moments found. Try a shorter length.');
   say(clips.length<S.n?'Only '+clips.length+' non-overlapping shorts fit. Try a shorter length.':'Found '+clips.length+' moments spread across the video. Tap "Different picks" for another set.')}
  prog(1);render();if(S.tool==='trailer')say('Analysis done. Choose the length and format below, then make your trailer.');$('#res').classList.remove('hide');$('#trl').classList.remove('hide');TRAILER=null;renderTrailer();$('#res').scrollIntoView({behavior:'smooth'})
 }catch(e){if(e.message!=='Stopped'){say('Analysis failed: '+(e.message||e));err('Analysis failed: '+(e.message||e))}}
 if(tok===RUN){setTimeout(()=>$('#pbar').classList.add('hide'),600);busy=false;lock(false)}};
// "Different picks" button: build a new plan with some random variety.
$('#shuf').onclick=()=>{if(busy||!LAST)return;if(LAST.semanticPool&&LAST.semanticPool.length){const pool=LAST.semanticPool,n=S.n==='auto'?Math.min(10,Math.max(3,Math.round((LAST.dur||180)/180))):Math.max(1,Math.min(50,+S.n||3)),start=LAST.semanticCursor||0;clips=Array.from({length:Math.min(n,pool.length)},(_,i)=>{const q=pool[(start+i)%pool.length];return{...q,tags:[...q.tags],blob:null,pcm:null,cap:false}});LAST.semanticCursor=(start+clips.length)%pool.length;render();say('Showing another set of AI-selected dialogue moments.')}else{clips=doPlan(true);render();say('New set of picks.')}};

// Draw the list of shorts (thumbnail, score, tags, Export / Save buttons).
function render(){
 const L=$('#list');L.innerHTML='';$('#rtitle').textContent=clips.length+' shorts';$('#shuf').classList.toggle('hide',!LAST);
 clips.forEach((c,i)=>{const r=document.createElement('div');r.className='clip';
  r.innerHTML='<video class="thumb" muted playsinline preload="metadata"></video><div class="info"><b>'+(c.full?'Full video':'Short '+(i+1))+(c.score!=null?' <span class="score">'+c.score+'</span>':'')+c.tags.map(t=>'<span class="tag">'+t+'</span>').join('')+'</b><span class="t">'+fmt(c.s)+' – '+fmt(c.e)+' ('+Math.round(c.e-c.s)+'s)</span><div class="bar"><i></i></div></div>';
  if(c.ai&&c.reason){const why=document.createElement('span');why.className='ai-reason';why.textContent=c.reason;r.querySelector('.info').append(why)}
  const th=r.querySelector('.thumb');
  if(c.blob){th.src=URL.createObjectURL(c.blob);th.onclick=()=>th.paused?th.play():th.pause();r.querySelector('.bar i').style.width='100%'}else th.src=url+'#t='+(c.s+.1);
  const tr=document.createElement('div');tr.className='row';tr.style.marginTop='6px';
  [['◂ start','s',-1],['start ▸','s',1],['◂ end','e',-1],['end ▸','e',1]].forEach(([t,k2,d])=>{const x=document.createElement('button');x.className='sm';x.style.cssText='padding:3px 7px;font-size:12px';x.textContent=t;
   x.onclick=()=>{if(busy)return;const o={s:c.s,e:c.e};o[k2]+=d;if(o.s<0||o.e>v.duration||o.e-o.s<3)return;c.s=o.s;c.e=o.e;c.blob=null;c.pcm=null;c.plan=null;c.cap=S.cap==='file';render()};tr.append(x)});
  // Preview: plays this short in the player above, from its start to its end.
  {const pv=document.createElement('button');pv.className='sm';pv.style.cssText='padding:3px 7px;font-size:12px';pv.textContent='▶ preview';pv.onclick=()=>previewSeg(c.s,c.e);tr.append(pv)}
  r.querySelector('.info').append(tr);
  // After export: share buttons.
  if(c.blob)r.querySelector('.info').append(shareRow(c,i));
  const b=document.createElement('button');b.className='sm exp'+(c.blob?' p':'');b.textContent=c.blob?'Save':'Export';b.onclick=()=>{if(c.blob)save(c,i);else exportClip(i)};
  r.append(b);c._el=r;L.append(r)});
 // Automatic save of the plan.
 projSave()}

/* ---------- drawing ---------- */
// Smart-reframe camera: x = current position, tx = target, keys = camera keyframes, ww = crop width as a fraction of the video width.
const cam={x:.5,tx:.5,k:0,keys:[{t:0,t0:0,x:.5,cut:true}],ww:.316,pg:null,lc:null};
// Left pixel of the crop for a camera centre, kept inside the video.
const srcX=(cx,ww,vw)=>Math.max(0,Math.min(vw-ww,cx*vw-ww/2));
// Draw the current video frame on the canvas with the chosen framing (smart reframe or centre crop), then the captions.
function draw(){const w=cv.width,h=cv.height,vw=v.videoWidth,vh=v.videoHeight;if(!vw)return;
 if(WIDEREC){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);const sc=Math.min(w/vw,h/vh)*ZOOM,dw=vw*sc,dh=vh*sc;ctx.drawImage(v,(w-dw)/2+SHX,(h-dh)/2+SHY,dw,dh);return}
 if(S.fit==='crop'){const sc=Math.max(w/vw,h/vh),dw=vw*sc,dh=vh*sc,p=$('#pos').value/100;ctx.drawImage(v,-(dw-w)*p,-(dh-h)/2,dw,dh)}
 else if(S.fit==='smart'){const ww=Math.min(vw,vh*w/h),wh=ww*h/w;ctx.drawImage(v,srcX(RECING?cam.x:.5,ww,vw),(vh-wh)/2,ww,wh,0,0,w,h)}
 else{const sc=Math.max(w/vw,h/vh),dw=vw*sc,dh=vh*sc,t=draw.t||(draw.t=document.createElement('canvas'));t.width=24;t.height=42;
  t.getContext('2d').drawImage(v,-(dw/30-24)/2,-(dh/30-42)/2,dw/30,dh/30);ctx.drawImage(t,0,0,w,h);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,w,h);
  const fh=vh*w/vw;ctx.drawImage(v,0,(h-fh)/2,w,fh)}
 drawCap()}
// Fonts for the captions (Latin, Arabic / Urdu, Devanagari).
const FONT_LATIN='system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
 FONT_RTL='"Noto Nastaliq Urdu","Noto Naskh Arabic","Jameel Noori Nastaleeq","Segoe UI",Tahoma,"Geeza Pro","Arial Unicode MS",Arial,sans-serif',
 FONT_DEV='"Noto Sans Devanagari","Nirmala UI","Kohinoor Devanagari",Mangal,"Arial Unicode MS",sans-serif';
// Ask the browser to load the caption fonts once.
let fontsAsked=false;function loadCapFonts(){if(fontsAsked||!document.fonts)return;fontsAsked=true;
 ['700 40px "Noto Nastaliq Urdu"','700 40px "Noto Naskh Arabic"','700 40px "Noto Sans Devanagari"'].forEach((f,i)=>document.fonts.load(f,i?'हिन्दी':'اردو کیپشن').catch(()=>{}))}
loadCapFonts();
// Word-by-word caption styles. Whisper gives times per phrase, so the time of each word is estimated from its length.
// "karaoke": words already spoken turn yellow. "hl" (highlight): the spoken word sits on an orange box.
function drawCapWords(c,t){
 const w=cv.width,k=w/720,rtl=/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(c.text),dev=/[\u0900-\u097F]/.test(c.text),hl=S.cs==='hl';
 const words=c.text.split(/\s+/).filter(Boolean).map(x=>(hl&&!rtl&&!dev)?x.toUpperCase():x);if(!words.length)return;
 // Whisper currently returns phrase-level timestamps in this browser model.
 // Use balanced word timing for Urdu/Arabic instead of treating joined-script
 // character counts as pronunciation lengths; Latin text keeps proportional timing.
 const weights=words.map(x=>rtl?1:Array.from(x).length+1),tot=weights.reduce((a,x)=>a+x,0);let a0=c.s;
 const tm=words.map((x,i)=>{const d=(c.e-c.s)*weights[i]/tot,r=[a0,a0+d];a0+=d;return r});
 let cur=tm.findIndex(r=>t>=r[0]&&t<r[1]);if(cur<0)cur=t>=c.e?words.length-1:0;
 const size=Math.round(50*k);
 ctx.font=(rtl||dev?'700 ':'800 ')+size+'px '+(rtl?FONT_RTL:dev?FONT_DEV:FONT_LATIN);ctx.textAlign='left';ctx.lineJoin='round';
 try{ctx.direction=rtl?'rtl':'ltr'}catch(e){}
 const sp=ctx.measureText(' ').width,ww=words.map(x=>ctx.measureText(x).width);
 const lines=[];let ln=[],lw=0;
 words.forEach((x,i)=>{const add=(ln.length?sp:0)+ww[i];if(ln.length&&lw+add>w-90*k){lines.push(ln);ln=[];lw=0}lw+=(ln.length?sp:0)+ww[i];ln.push(i)});
 if(ln.length)lines.push(ln);
 const lh=(hl?72:62)*k*(rtl?1.3:1);let y=cv.height*.72-(lines.length-1)*lh/2;
 for(const L of lines){
  const W=L.reduce((s0,i,j)=>s0+ww[i]+(j?sp:0),0);
  let x=rtl?w/2+W/2:w/2-W/2;                    // left-to-right starts at the left end of the centred line, right-to-left at the right end
  for(const i of L){
   const x0=rtl?x-ww[i]:x,on=(i===cur);
   if(hl&&on){const px=14*k;ctx.fillStyle='#ff5a1f';ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x0-px,y-size*.95,ww[i]+2*px,size*1.25,16*k);else ctx.rect(x0-px,y-size*.95,ww[i]+2*px,size*1.25);ctx.fill()}
   if(!(hl&&on)){ctx.lineWidth=(rtl||dev?7:11)*k;ctx.strokeStyle='#000';ctx.strokeText(words[i],x0,y)}
   ctx.fillStyle=(!hl&&i<=cur)?'#ffe14d':'#fff';ctx.fillText(words[i],x0,y);
   x+=rtl?-(ww[i]+sp):(ww[i]+sp)}
  y+=lh}
 try{ctx.direction='ltr'}catch(e){}ctx.textAlign='center'}
// Draw the caption text for the current time (Classic, Pop, Box, Neon, Minimal here; Karaoke and Highlight in drawCapWords).
function drawCap(){if(!capOn||!cues.length)return;const t=v.currentTime,c=cues.find(q=>t>=q.s&&t<=q.e);if(!c)return;
 if(S.cs==='karaoke'||S.cs==='hl')return drawCapWords(c,t);
 const w=cv.width,k=w/720,pop=S.cs==='pop',pill=S.cs==='pill',news=S.cs==='news',urduStyle=S.cs==='urdu',outline=S.cs==='outline',rtl=/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(c.text),dev=/[\u0900-\u097F]/.test(c.text),txt=(pop&&!rtl&&!dev)?c.text.toUpperCase():c.text;
 ctx.font=(rtl||dev?'700 ':'800 ')+Math.round(pop?54*k:(urduStyle&&rtl?56*k:S.cs==='min'?38*k:46*k))+'px '+(rtl?FONT_RTL:dev?FONT_DEV:FONT_LATIN);ctx.textAlign='center';ctx.lineJoin='round';
 try{ctx.direction=rtl?'rtl':'ltr'}catch(e){}
 const lines=[];let l='';for(const x of txt.split(/\s+/)){const tt=l?l+' '+x:x;if(ctx.measureText(tt).width>w-90*k&&l){lines.push(l);l=x}else l=tt}lines.push(l);
 const lh=(pop?64:56)*k*(rtl?1.3:1);let y=cv.height*.72-(lines.length-1)*lh/2;ctx.lineWidth=(rtl||dev?7:11)*k;ctx.strokeStyle='#000';ctx.fillStyle=pop?'#ffe14d':S.cs==='neon'?'#7df9ff':'#fff';
 if(S.cs==='box'||pill||news){const mw=Math.max(...lines.map(x=>ctx.measureText(x).width))+40*k,top=y-lh*.8,bh=lh*lines.length+16*k;ctx.fillStyle=news?'rgba(8,20,42,.94)':pill?'rgba(12,16,26,.78)':'rgba(0,0,0,.72)';ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(w/2-mw/2,top,mw,bh,news?8*k:22*k);else ctx.rect(w/2-mw/2,top,mw,bh);ctx.fill();if(news){ctx.fillStyle='#ffd84d';ctx.fillRect(w/2-mw/2,top,6*k,bh)}ctx.fillStyle='#fff'}
 // Neon: glowing cyan text. Minimal: smaller white text with a soft shadow and no outline.
 if(S.cs==='neon'){ctx.shadowColor='#00e5ff';ctx.shadowBlur=26*k;ctx.lineWidth=5*k;ctx.strokeStyle='#022'}
 if(S.cs==='min'){ctx.shadowColor='rgba(0,0,0,.85)';ctx.shadowBlur=10*k;ctx.shadowOffsetY=2*k}
 if(outline){ctx.lineWidth=13*k;ctx.strokeStyle='#000'}
 for(const ln of lines){if(S.cs!=='box'&&S.cs!=='min'&&!pill&&!news)ctx.strokeText(ln,w/2,y);ctx.fillText(ln,w/2,y);y+=lh}
 ctx.shadowBlur=0;ctx.shadowColor='transparent';ctx.shadowOffsetY=0;
 try{ctx.direction='ltr'}catch(e){}}

/* ===== 9. HELPER MEDIA, CLIP AUDIO, CAPTIONS (Whisper), SILENCE TRIM ===== */
/* ---------- helper media elements (so the main player is never disturbed) ---------- */
// A second hidden video player used for scanning, so the main player is never disturbed.
function getV2(){if(!EL.v2){const e=document.createElement('video');e.muted=true;e.playsInline=true;e.preload='auto';e.src=url;
 e.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;opacity:.02;pointer-events:none';document.body.append(e);EL.v2=e}return EL.v2}
// A helper media element for audio, created once.
async function getAV(){if(EL.a)return EL.a;await audioReady();
 const mk=k=>{const e=document.createElement(k);e.preload='auto';e.src=url;if(k==='video'){e.playsInline=true;e.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;opacity:.02;pointer-events:none';document.body.append(e)}e.load();return e};
 const ready=e=>guard(new Promise(r=>{if(e.readyState>=1)return r(true);e.addEventListener('loadedmetadata',()=>r(true),{once:true});e.addEventListener('error',()=>r(false),{once:true})}),20000,'Audio load').catch(x=>{if(x.message==='Stopped')throw x;return false});
 let el=mk('audio');if(!await ready(el)){el=mk('video');if(!await ready(el))throw new Error('Could not read this video’s audio')}
 EL.a={el,node:actx.createMediaElementSource(el)};return EL.a}

/* ---------- clip audio (for captions and silence trim) ---------- */
// Play a clip silently and capture its audio samples.
async function captureClip(c,tok){
 const a=await getAV();alive(tok);const sr=actx.sampleRate;a.el.pause();await seek(a.el,c.s);
 const bufs=[],tap=startTap(a.node,b=>bufs.push(b));
 try{await guard(a.el.play(),15000,'Audio play');
  await guard(new Promise(res=>{const f=()=>{if(tok!==RUN||a.el.currentTime>=c.e||a.el.ended||a.el.paused)res();else{stat('aud','reading audio '+Math.round((a.el.currentTime-c.s)/(c.e-c.s)*100)+'%');setTimeout(f,200)}};f()}))
 }finally{a.el.pause();tap.stop();stat('aud','')}
 alive(tok);return to16k(cat(bufs),sr)}
// Get the clip's 16 kHz audio (cached).
function clipPCM(c,tok){if(c.pcm)return Promise.resolve(c.pcm);
 if(AUD){c.pcm=AUD.slice(Math.floor(c.s*16000),Math.floor(c.e*16000));return Promise.resolve(c.pcm)}
 if(!c._pp)c._pp=captureClip(c,tok).then(p=>{c.pcm=p;return p}).finally(()=>{c._pp=null});
 return c._pp}
// Loudness (RMS) of a range of audio.
const rmsRange=(a,s,e)=>{const i=Math.max(0,Math.floor(s*16000)),j=Math.min(a.length,Math.floor(e*16000));let t=0,n=0;for(let k=i;k<j;k+=4){t+=a[k]*a[k];n++}return Math.sqrt(t/Math.max(1,n))};
// "Speech" silence trim: find the quiet gaps between speech so they can be skipped.
async function speechSkip(c,tok){const pcm=await clipPCM(c,tok);alive(tok);
 if(rmsRange(pcm,0,pcm.length/16000)<.003)return[];
 let q;if(S.cap==='auto'){await ensureCaps(c,tok);q=cues.filter(x=>x.e>c.s&&x.s<c.e)}
 else{stat('cap','finding dialogue…');q=buildCues(await transcribe(pcm,tok),c.s,pcm);stat('cap','')}
 alive(tok);q.sort((x,y)=>x.s-y.s);
 if(!q.length){$('#capnote').textContent='Dialogue trim: no speech found in this short, so nothing was cut.';return[]}
 const out=[],pad=.1,add=(x,y)=>{if(y-x>.3)out.push([x,y])};
 add(c.s,q[0].s-pad);for(let i=0;i<q.length-1;i++)add(q[i].e+pad,q[i+1].s-pad);add(q[q.length-1].e+pad,c.e);
 return out}
// Work out which time ranges to skip while exporting (the Trim silence option).
async function skipMap(c,tok){if(S.tr==='off')return[];if(S.tr==='speech')return speechSkip(c,tok);const a=await clipPCM(c,tok),st=1600,n=Math.floor(a.length/st),r=[];
 for(let i=0;i<n;i++){let q=0;for(let j=0;j<st;j+=4){const x=a[i*st+j]||0;q+=x*x}r.push(Math.sqrt(q/(st/4)))}
 const so=[...r].sort((x,y)=>x-y),thr=Math.max(.008,so[Math.floor(n*.95)]*.12),ml={gentle:9,normal:6,strong:4}[S.tr],out=[];
 for(let i=0;i<n;){if(r[i]<thr){let j=i;while(j<n&&r[j]<thr)j++;if(j-i>=ml){const x=c.s+(i+1)/10,y=c.s+(j-1)/10;if(y-x>.2)out.push([x,y])}i=j}else i++}
 return out}

/* ---------- captions ---------- */
// Cache of loaded Whisper models.
const ASRP={};
// Load the Whisper speech model in the browser (downloaded once).
function loadASR(){const m=S.model;if(ASRP[m])return ASRP[m];
 ASRP[m]=(async()=>{const mb={tiny:'~40',base:'~75',small:'~250'}[m];stat('cap','loading speech library…');
  const T=await guard(import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1'),120000,'Speech library download');
  try{T.env.backends.onnx.wasm.proxy=true}catch(e){}
  stat('cap','loading speech model (first time '+mb+'MB)…');
  let lastEv=Date.now(),wd=null,wdRej;const stuck=new Promise((_,r)=>{wdRej=r});
  wd=setInterval(()=>{if(Date.now()-lastEv>90000){clearInterval(wd);wdRej(new Error('The speech model did not start on this browser (it stopped after downloading). Reload the page, try Chrome, or choose the Fast model.'))}},3000);
  const cb=x=>{lastEv=Date.now();if(x.status==='progress'&&/onnx/.test(x.file||'')){const pc=Math.round(x.progress);stat('cap',pc>=100?'starting speech model (can take up to a minute)…':'downloading speech model '+pc+'%')}else if(x.status==='ready'){stat('cap','')}};
  try{return await Promise.race([guard(T.pipeline('automatic-speech-recognition','onnx-community/whisper-'+m,{revision:'main',progress_callback:cb}),900000,'Speech model download'),stuck])}finally{clearInterval(wd)}})();
 ASRP[m].catch(()=>{delete ASRP[m]});return ASRP[m]}
// Encode a 16 kHz mono Float32 audio slice as a compact PCM WAV upload.
function pcmWavBase64(pcm){
 const bytes=new Uint8Array(44+pcm.length*2),v=new DataView(bytes.buffer);
 const put=(o,s)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i)};
 put(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);put(8,'WAVE');put(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);
 v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,pcm.length*2,true);
 for(let i=0;i<pcm.length;i++){const x=Math.max(-1,Math.min(1,pcm[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}
 let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(bytes.length,i+0x8000)));
 return btoa(bin)
}
// Run transcription on Cloudflare AI instead of downloading a large speech model to the device.
// Cloudflare Whisper requires ISO language codes, not UI labels such as "english".
function whisperLanguageCode(value){
 const v=String(value||'').trim().toLowerCase();if(!v||v==='auto'||v==='automatic'||v==='auto detect')return undefined;
 const names={english:'en',urdu:'ur',hindi:'hi',arabic:'ar',spanish:'es',french:'fr',german:'de',italian:'it',portuguese:'pt',russian:'ru',turkish:'tr',persian:'fa',farsi:'fa',punjabi:'pa',bengali:'bn',chinese:'zh',japanese:'ja',korean:'ko',dutch:'nl',polish:'pl',swedish:'sv',danish:'da',norwegian:'no',finnish:'fi',greek:'el',hebrew:'he',thai:'th',vietnamese:'vi',indonesian:'id',malay:'ms',ukrainian:'uk',romanian:'ro',czech:'cs',hungarian:'hu',bulgarian:'bg',croatian:'hr',serbian:'sr',slovak:'sk',swahili:'sw',nepali:'ne',tamil:'ta',telugu:'te',marathi:'mr',gujarati:'gu',assamese:'as',odia:'or',oriya:'or'};
 return names[v]||(/^[a-z]{2,3}$/.test(v)?v:undefined)
}
async function transcribe(pcm,tok=RUN){
 const sr=16000,chunkSec=30,overlapSec=1.25,total=Math.ceil(pcm.length/sr),count=Math.ceil(total/chunkSec),out=new Array(count);
 if(!pcm||!pcm.length)return [];
 workProgress('Transcribing audio',12);
 let next=0,done=0;const workers=Array.from({length:Math.min(3,count)},async()=>{
  while(true){
   const i=next++;if(i>=count)return;alive(tok);
   const start=Math.max(0,Math.floor(i*chunkSec*sr-(i?overlapSec*sr:0)));
   const end=Math.min(pcm.length,Math.ceil((i+1)*chunkSec*sr+(i<count-1?overlapSec*sr:0)));
   const audio=pcmWavBase64(pcm.subarray(start,end));
   workProgress('Transcribing audio · '+Math.min(total,(i+1)*chunkSec)+'s of '+total+'s',12+Math.round(done/Math.max(1,count)*48));
   const req=fetch('/api/v1/shorts/transcribe',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({audio,language:whisperLanguageCode(S.lang)})});
   const res=await guard(req,180000,'AI transcription'),raw=await res.text();alive(tok);
   let data;try{data=JSON.parse(raw)}catch{throw new Error('Speech service returned an invalid response ('+res.status+').')}
   if(!res.ok)throw new Error(data.error||('Speech transcription failed ('+res.status+').'));
   const segs=Array.isArray(data.segments)?data.segments:[];
   out[i]=segs.map(q=>({text:String(q.text||''),timestamp:[Math.max(0,Number(q.start)||0)+start/sr,Math.max(0,Number(q.end)||0)+start/sr]}));
   if(!out[i].length&&data.text)out[i]=[{text:String(data.text),timestamp:[start/sr,end/sr]}];
   done++;workProgress('Transcribing audio · '+done+'/'+count+' parts',12+Math.round(done/Math.max(1,count)*48));
  }
 });
 await Promise.all(workers);alive(tok);
 return out.flat().filter(q=>q.text&&q.timestamp[1]>q.timestamp[0])
}

const SEMANTIC_ENDPOINT='/api/v1/shorts/semantic-plan';
// Audio is transcribed by the Cloudflare Worker; transcript text and timestamps are then sent for semantic ranking.
async function semanticShortPlan(tok,dur){
 if(!AUD||!AUD.length)throw new Error('AI dialogue analysis needs a full audio read. This file is too large for safe on-device transcription; try a shorter or smaller source video.');
 const raw=await transcribe(AUD,tok);alive(tok);
 const segments=(raw||[]).map(q=>{
  const st=Number(q.timestamp&&q.timestamp[0]),en=Number(q.timestamp&&q.timestamp[1]);
  return{start:Number.isFinite(st)?Math.max(0,st):0,end:Number.isFinite(en)&&en>st?Math.min(dur,en):Math.min(dur,(Number.isFinite(st)?st:0)+3),text:normalizeCaptionText(q.text)};
 }).filter(q=>q.text&&q.end>q.start);
 if(!segments.length)throw new Error('No clear dialogue was detected. Check that the video has audible speech.');
 if(segments.length>2500)throw new Error('This video has too much dialogue for one analysis pass. Try a shorter section first.');
 const wanted=S.n==='auto'?Math.min(10,Math.max(3,Math.round(dur/180))):Math.max(1,Math.min(50,+S.n||3));
 workProgress('Finding the best moments',66);
 const response=await guard(fetch(SEMANTIC_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({duration:dur,targetLength:PL,count:wanted,language:S.lang,segments})}),120000,'AI dialogue analysis');
 const responseText=await response.text();alive(tok);workProgress('Selecting the strongest moments',86);
 let data=null;try{data=JSON.parse(responseText)}catch(e){
  const preview=String(responseText||'').replace(/\s+/g,' ').slice(0,160);
  if(/<\s*!doctype|<\s*html/i.test(responseText))throw new Error('The AI API returned an HTML page instead of JSON. The live Worker route or deployment is not serving this API response. Please check the Cloudflare Pages deployment.');
  throw new Error('The AI API returned an unreadable response ('+response.status+'): '+(preview||'empty response'));
 }
 if(!response.ok)throw new Error(data.error||('AI analysis failed ('+response.status+').'));
 if(!data||!Array.isArray(data.clips))throw new Error('The AI API response is missing its clips list. Please try again.');
 const minClip=Math.max(8,Math.round(PL*.8)),maxClip=Math.min(110,Math.round(PL*1.25));
 const pool=(data.clips||[]).map(q=>({s:Number(q.start),e:Number(q.end),score:Math.max(0,Math.min(100,Math.round(Number(q.score)||0))),tags:[String(q.category||'AI selected').slice(0,32)],reason:String(q.reason||'').slice(0,240),hook:String(q.hook||'').slice(0,120),blob:null,pcm:null,cap:false,ai:true}))
  .filter(q=>Number.isFinite(q.s)&&Number.isFinite(q.e)&&q.s>=0&&q.e<=dur&&q.e-q.s>=minClip&&q.e-q.s<=maxClip);
 if(!pool.length)throw new Error('AI could not find enough strong dialogue moments. Try another source or a longer target length.');
 pool.sort((a,b)=>b.score-a.score);LAST.semanticPool=pool;LAST.semanticCursor=Math.min(wanted,pool.length);
 workProgress('Preparing your Shorts',96);return pool.slice(0,wanted).map(q=>({...q,tags:[...q.tags]}));
}

// Phrases Whisper invents on silence (like "thanks for watching"); they are removed.
const JUNK=/^(thanks? for watching|thank you( so much)?( for watching)?|please subscribe|subscribe|bye|you|\.+|music|\[.*\]|\(.*\)|♪.*)[.!\s]*$/i;
// Normalize common Arabic-codepoint variants that Whisper sometimes emits in Urdu transcripts.
const normalizeCaptionText=s=>{let t=String(s||'').normalize('NFC').replace(/[يىئ]/g,'ی').replace(/ك/g,'ک').replace(/ۀ/g,'ہ').replace(/[\u0640]/g,'').replace(/[\t\u00a0 ]+/g,' ').trim();
 if(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(t))t=t.replace(/,/g,'،').replace(/;/g,'؛').replace(/\?/g,'؟').replace(/\.(?=\s|$)/g,'۔');
 return t.replace(/\s+([،؛؟۔,.!?])/g,'$1').replace(/([،؛؟۔!?])(?=\S)/g,'$1 ')}
// Turn Whisper chunks into timed caption cues (words and short lines).
function buildCues(ch,off,pcm){let out=[];
 ch.forEach(h=>{const w=normalizeCaptionText(h.text).split(/\s+/).filter(Boolean);if(!w.length)return;
  const a0=h.timestamp[0]||0,b0=h.timestamp[1]??(pcm.length/16000),[a,b]=snapSeg(pcm,a0,b0),t0=off+a,t1=off+b;
  const parts=[];let line=[];for(const word of w){line.push(word);const sentenceEnd=/[۔.!?؟]$/.test(word);if(line.length>=5||(sentenceEnd&&line.length>=2)){parts.push(line.join(' '));line=[]}}if(line.length)parts.push(line.join(' '));
  const weights=parts.map(p=>Math.max(1,p.split(/\s+/).length)),tot=weights.reduce((a,b)=>a+b,0);let t=t0;parts.forEach((p,i)=>{const d=(t1-t0)*weights[i]/tot;out.push({s:t,e:t+d,text:p});t+=d})});
 out=out.filter(q=>!JUNK.test(q.text)&&rmsRange(pcm,q.s-off,q.e-off)>.004);
 out=out.filter((q,i)=>!(i>1&&q.text===out[i-1].text&&q.text===out[i-2].text));
 for(let i=0;i<out.length;i++){const nx=out[i+1];if(nx&&out[i].e>nx.s)out[i].e=nx.s;else if(nx)out[i].e=Math.min(nx.s,out[i].e+.25)}
 return out}
// Make sure captions exist for a clip (generated only once).
function ensureCaps(c,tok){if(c.cap||S.cap!=='auto')return Promise.resolve();
 if(!c._cp)c._cp=(async()=>{const pcm=await clipPCM(c,tok);alive(tok);
  if(rmsRange(pcm,0,pcm.length/16000)<.003){c.cap=true;stat('cap','');$('#capnote').textContent='No speech detected in this short.';return}
  const ch=await transcribe(pcm,tok);alive(tok);
  cues=cues.filter(q=>q.e<=c.s||q.s>=c.e).concat(buildCues(ch,c.s,pcm)).sort((a,b)=>a.s-b.s);c.cap=true;stat('cap','');$('#capnote').textContent='Captions ready. '+cues.length+' lines.'})().finally(()=>{c._cp=null});
 return c._cp}
// "Generate captions for all shorts" button.
$('#capgo').onclick=async()=>{if(busy)return;if(!clips.length){$('#capnote').textContent='Create the plan first, then generate captions.';return}
 if(S.cap!=='auto')return;const tok=RUN;busy=true;lock(true);
 try{for(const c of clips){alive(tok);await ensureCaps(c,tok)}}catch(e){if(e.message!=='Stopped')$('#capnote').textContent='Captions failed: '+(e.message||e)}
 if(tok===RUN){busy=false;lock(false);say('');draw()}};
// Read .srt / .vtt subtitle text into caption cues.
function parseSub(txt){const ts=x=>{const m=x.trim().replace(',','.').split(':').map(parseFloat);return m.length===3?m[0]*3600+m[1]*60+m[2]:m[0]*60+m[1]},out=[];
 txt.replace(/\r/g,'').split(/\n\n+/).forEach(b=>{const L=b.split('\n'),i=L.findIndex(x=>x.includes('-->'));if(i<0)return;const[a,e]=L[i].split('-->');
  out.push({s:ts(a),e:ts(e.trim().split(' ')[0]),text:L.slice(i+1).join(' ').replace(/<[^>]+>/g,'').trim()})});return out.filter(c=>c.text)}
// Subtitle file picker.
$('#subf').onchange=async e=>{const f=e.target.files[0];if(!f)return;cues=parseSub(await f.text());$('#capnote').textContent=cues.length?cues.length+' captions loaded.':'No captions found in that file.';clips.forEach(c=>c.cap=true);draw()};

/* ===== 10. SMART REFRAME (face detection and camera plan) ===== */
/* ---------- smart reframe: pre-pass finds faces and shots, then one steady crop per shot ---------- */
// The face detector (MediaPipe), loaded on first use.
let FDP=null;
// Load the face detector (downloaded once).
function getFD(){if(FDP)return FDP;
 FDP=(async()=>{let fd=null;
  try{let m=null;for(const u of['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs','https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14']){try{m=await import(u);if(m&&m.FaceDetector)break}catch(e){}}
   if(!m||!m.FaceDetector)throw 0;
   const vs=await m.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
   const mk=d=>m.FaceDetector.createFromOptions(vs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',delegate:d},runningMode:'IMAGE',minDetectionConfidence:.5});
   let d;try{d=await mk('GPU')}catch(e){d=await mk('CPU')}fd={k:'mp',d}
  }catch(e){if(window.FaceDetector){try{fd={k:'native',d:new FaceDetector({fastMode:true,maxDetectedFaces:6})}}catch(_){}}}
  return fd})();return FDP}
// Run the face detector on one crop of a frame.
async function detectIn(fd,el,sx,sy,sw,sh,out,vw,vh){const N=384,c=detectIn.c||(detectIn.c=document.createElement('canvas'));c.width=c.height=N;
 const x=c.getContext('2d');x.drawImage(el,sx,sy,sw,sh,0,0,N,N);let boxes=[];
 try{if(fd.k==='mp')boxes=fd.d.detect(c).detections.map(d=>({x:d.boundingBox.originX,y:d.boundingBox.originY,w:d.boundingBox.width,h:d.boundingBox.height}));
  else boxes=(await fd.d.detect(c)).map(d=>({x:d.boundingBox.x,y:d.boundingBox.y,w:d.boundingBox.width,h:d.boundingBox.height}))}catch(e){return}
 boxes.forEach(q=>{const l=(sx+q.x/N*sw)/vw,r=(sx+(q.x+q.w)/N*sw)/vw,t=(sy+q.y/N*sh)/vh,b=(sy+(q.y+q.h)/N*sh)/vh;if(r-l>.02)out.push({l,r,t,b,c:(l+r)/2,w:r-l,m:0})})}
let missRun=0;
// Find faces in a frame (checks left, centre and right squares of wide frames).
async function detectFaces(fd,el){const vw=el.videoWidth,vh=el.videoHeight,F=[];if(!fd||!vw)return F;const side=Math.min(vw,vh);
 const xs=vw>side*1.05?[0,(vw-side)/2,vw-side]:[0];
 for(const sx of xs)await detectIn(fd,el,sx,0,side,side,F,vw,vh);
 if(!F.length&&(missRun++%4===0)){const s2=side*.5;for(const sy of[side*.08,side*.4])for(let sx=0;sx+s2<=vw+1;sx+=s2*.8)await detectIn(fd,el,Math.min(sx,vw-s2),sy,s2,s2,F,vw,vh)}
 else if(F.length)missRun=0;
 F.sort((p,q)=>q.w-p.w);const out=[];for(const f of F)if(!out.some(g=>Math.abs(g.c-f.c)<.6*Math.max(g.w,f.w)&&Math.abs((g.t+g.b)/2-(f.t+f.b)/2)<.5*Math.max(g.b-g.t,f.b-f.t)))out.push(f);return out}
// 16-bin brightness histogram (used to detect scene cuts).
const hist16=g=>{const h=new Float32Array(16);for(let i=0;i<g.length;i++)h[g[i]>>4]++;for(let i=0;i<16;i++)h[i]/=g.length;return h};
// Scan a clip: sample frames, detect faces and shot changes.
async function frameScan(c,fd,tok){
 const v2=getV2();v2.pause();await seek(v2,c.s);alive(tok);
 const g=document.createElement('canvas');g.width=160;g.height=90;const gx=g.getContext('2d',{willReadFrequently:true});
 const out=[],mads=[];let pg=null,ph=null,nextT=c.s,rate=3;
 try{v2.playbackRate=rate}catch(e){}
 await guard(v2.play(),15000,'Video play');
 try{
  while(true){alive(tok);const t=v2.currentTime;
   if(t>=c.e-.05||v2.ended||(v2.paused&&t>c.s+.2))break;
   if(t>=nextT){const t1=performance.now(),smp={t,faces:[],cut:false,mc:null};
    gx.drawImage(v2,0,0,160,90);const d=gx.getImageData(0,0,160,90).data,gray=new Uint8Array(14400);
    for(let i=0,j=0;i<d.length;i+=4,j++)gray[j]=(d[i]*3+d[i+1]*6+d[i+2])/10|0;
    const h=hist16(gray);
    if(pg){let s=0;const col=new Float32Array(16);for(let y=0;y<90;y++)for(let u=0;u<160;u++){const k=y*160+u,df=Math.abs(gray[k]-pg[k]);s+=df;col[u/10|0]+=df}
     const mad=s/14400/255;let hd=0;for(let i=0;i<16;i++)hd+=Math.abs(h[i]-ph[i]);hd/=2;
     const rec=mads.slice(-12).sort((a,b)=>a-b),med=rec.length?rec[rec.length>>1]:0;
     smp.cut=(mad>Math.max(.09,med*3.2))||(hd>.5&&mad>.05);mads.push(smp.cut?med:mad);if(!smp.cut)smp.mc=col}
    smp.faces=await detectFaces(fd,v2);
    if(pg&&!smp.cut)smp.faces.forEach(f=>{const x0=Math.max(0,Math.floor(f.l*160)),x1=Math.min(160,Math.ceil(f.r*160)),y0=Math.max(0,Math.floor(f.t*90)),y1=Math.min(90,Math.ceil(f.b*90));let s=0,q=0;
     for(let y=y0;y<y1;y++)for(let u=x0;u<x1;u++){s+=Math.abs(gray[y*160+u]-pg[y*160+u]);q++}f.m=q?s/q/255:0});
    out.push(smp);pg=gray;ph=h;nextT=t+.25;
    stat('fr','framing '+Math.round((t-c.s)/(c.e-c.s)*100)+'%');
    if(performance.now()-t1>160&&rate>1){rate=Math.max(1,rate/1.5);try{v2.playbackRate=rate}catch(e){}}}
   await sleep(10)}
 }finally{v2.pause()}
 return out}
// Build the camera plan for a clip before it is recorded (only once per clip).
async function prepFrame(c,tok){if(c.plan)return;
 const vw=v.videoWidth,vh=v.videoHeight,ww=Math.min(1,vh*9/16/vw);
 if(ww>=.98){c.plan=[{t:c.s,t0:c.s,x:.5,cut:true}];return}
 stat('fr','framing 0%');
 const fd=await guard(getFD(),120000,'Face detector download').catch(e=>{if(e.message==='Stopped')throw e;return null});alive(tok);
 const smp=await frameScan(c,fd,tok);alive(tok);
 c.plan=planFrames(smp,ww,c.s);c.planInfo={faces:smp.filter(s=>s.faces.length).length,n:smp.length,cuts:smp.filter(s=>s.cut).length,fd:!!fd};stat('fr','')}
// Put the camera at the start of a clip.
function camInit(c){cam.ww=Math.min(1,v.videoHeight*9/16/v.videoWidth);cam.keys=c.plan&&c.plan.length?c.plan:[{t:c.s,t0:c.s,x:.5,cut:true}];cam.k=0;cam.x=cam.tx=cam.keys[0].x;cam.vx=0;cam.pg=null}
// A tiny canvas used to detect scene cuts live while recording.
const lcv=document.createElement('canvas');lcv.width=32;lcv.height=18;const lcx=lcv.getContext('2d',{willReadFrequently:true});
// Detect a scene cut live while recording.
function liveCut(){lcx.drawImage(v,0,0,32,18);const d=lcx.getImageData(0,0,32,18).data;let r=false;
 if(cam.pg){let s=0;for(let i=0;i<d.length;i+=4)s+=Math.abs(d[i]-cam.pg[i])+Math.abs(d[i+1]-cam.pg[i+1])+Math.abs(d[i+2]-cam.pg[i+2]);r=s/(576*3*255)>.1}
 cam.pg=d.slice();return r}
// Move the camera towards its target every frame (hard cut on scene changes, smooth otherwise).
function camUpdate(t,dt,lc){const K=cam.keys,was=cam.k;
 while(cam.k+1<K.length){const n=K[cam.k+1],due=n.cut?(t>=n.t||(lc&&t>=n.t0-.05)):(t>=n.t-.25);if(!due)break;cam.k++;cam.tx=n.x}
 // A planned shot cut is a real edit point: change crop on that frame, not with a fast pan.
 if(cam.k!==was&&K[cam.k].cut){cam.x=cam.tx;cam.vx=0;return}
 // Critically damped spring: smooth in-shot subject movement without abrupt velocity changes.
 const step=Math.max(.001,Math.min(.05,dt||0)),omega=5.2,y=cam.x-cam.tx,e=Math.exp(-omega*step),temp=(cam.vx+omega*y)*step;
 cam.x=cam.tx+(y+temp)*e;cam.vx=(cam.vx-omega*temp)*e;
 const maxV=.9;if(cam.vx>maxV)cam.vx=maxV;else if(cam.vx< -maxV)cam.vx=-maxV;
 if(Math.abs(cam.tx-cam.x)<.001&&Math.abs(cam.vx)<.01){cam.x=cam.tx;cam.vx=0}}
// Redraw the preview when the player seeks or its time changes (not while recording).
v.addEventListener('seeked',()=>{if(!busy)draw()});v.addEventListener('timeupdate',()=>{if(!busy)draw()});v.addEventListener('loadeddata',()=>draw());

/* ===== 11. LOAD FROM LINK, RECORDER, EXPORT ===== */
// Direct media URLs can be loaded when the host permits browser access (CORS).
// Social share URLs are identified explicitly; they are not treated as downloadable files.
function socialLinkHelp(host){
 const h=String(host||'').toLowerCase().replace(/^www\./,'');
 if(h==='youtube.com'||h==='m.youtube.com'||h==='youtu.be'||h.endsWith('.youtube.com'))return 'YouTube share links are not directly importable. For your own video, export/download it from YouTube Studio, then upload the MP4 here.';
 if(h==='facebook.com'||h==='m.facebook.com'||h==='fb.watch'||h.endsWith('.facebook.com'))return 'Facebook share links are not direct video files. For a video you own or have permission to edit, download/export the original from Facebook, then upload the MP4 here.';
 if(h==='instagram.com'||h==='m.instagram.com'||h.endsWith('.instagram.com'))return 'Instagram links open posts/Reels, not downloadable video files. For your own content, save/export the original video and upload its MP4 here.';
 if(h==='tiktok.com'||h==='vm.tiktok.com'||h==='vt.tiktok.com'||h.endsWith('.tiktok.com'))return 'TikTok share links are not direct video files. For your own video, use TikTok’s Save video option (if enabled), then upload the saved file here.';
 if(h==='x.com'||h==='twitter.com'||h.endsWith('.twitter.com'))return 'X post links are not direct video files. Upload a video file you own or have permission to edit.';
 if(h==='vimeo.com'||h.endsWith('.vimeo.com'))return 'Vimeo page links are not direct video files. Use the original downloadable file if the owner has enabled downloads.';
 return '';
}
$('#lgo').onclick=async()=>{
 const u=$('#lnk').value.trim(),m=t=>$('#lmsg').textContent=t;
 if(!u)return;
 let pu;try{pu=new URL(u)}catch(e){return m('Enter a valid https:// video URL.')}
 if(!/^https?:$/.test(pu.protocol))return m('Only http or https links can be loaded.');
 const socialHelp=socialLinkHelp(pu.hostname);
 if(socialHelp)return m(socialHelp);
 try{
  m('Loading direct video file…');
  const r=await fetch(u);
  if(!r.ok)throw new Error('The link returned HTTP '+r.status+'.');
  const b=await r.blob();
  if(!b.type.startsWith('video/'))throw new Error('This URL did not return a video file. Use a direct MP4/WebM video URL.');
  load(new File([b],(pu.pathname.split('/').pop()||'video').split('?')[0],{type:b.type}));
  m('');
 }catch(e){
  m('Could not load this URL. It must point directly to a video file and allow browser CORS access. For social share links, upload the original video file instead.');
 }
};
/* ---------- MP4 fallback recorder (WebCodecs + mp4-muxer) for browsers without native MP4 MediaRecorder ---------- */
async function makeWC(aTrack,br){
// Load the MP4 muxer library (needed to build the file).
 const M=await guard(import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs'),60000,'MP4 library download');
 const W=cv.width,H=cv.height,sr=actx.sampleRate;
// Probe which video codec / hardware setting really works on this device.
 let vc=null,vm='avc',vhw='no-preference';
 const probe=async cfg=>{try{if(!(await VideoEncoder.isConfigSupported(cfg)).supported)return false;let got=0,bad=false;const e=new VideoEncoder({output:()=>{got++},error:()=>{bad=true}});e.configure(cfg);
  const pc=document.createElement('canvas');pc.width=cfg.width;pc.height=cfg.height;const px=pc.getContext('2d');
  for(let i=0;i<4;i++){px.fillStyle=i%2?'#445':'#a63';px.fillRect(0,0,pc.width,pc.height);const f=new VideoFrame(pc,{timestamp:i*33333});e.encode(f,{keyFrame:i===0});f.close()}
  try{await Promise.race([e.flush(),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),5000))])}catch(x){bad=true}
  try{e.close()}catch(x){}return got>0&&!bad}catch(x){return false}};
 const lv=W*H>1280*720?'28':'1f';
 find:for(const pr of ['64','4d','42'])for(const hw of ['no-preference','prefer-software','prefer-hardware']){const cfg={codec:'avc1.'+pr+'00'+lv,width:W,height:H,bitrate:br,framerate:30,hardwareAcceleration:hw};if(await probe(cfg)){vc=cfg.codec;vhw=hw;break find}}
 if(!vc){const cfg={codec:'vp09.00.40.08',width:W,height:H,bitrate:br,framerate:30};if(await probe(cfg)){vc=cfg.codec;vm='vp9'}}
 if(!vc)throw new Error('This device could not start a video encoder at '+W+'×'+H+'. Choose 720p, or use Chrome or Edge on a computer.');
// Audio: AAC if supported, otherwise Opus.
 let ac='mp4a.40.2',am='aac';
 if(!(await AudioEncoder.isConfigSupported({codec:ac,sampleRate:sr,numberOfChannels:2,bitrate:128000})).supported){ac='opus';am='opus'}
// Create the MP4 muxer (builds the file in memory).
 const tg=new M.ArrayBufferTarget(),mux=new M.Muxer({target:tg,video:{codec:vm,width:W,height:H,frameRate:30},audio:{codec:am,numberOfChannels:2,sampleRate:sr},fastStart:'in-memory'});
// R imitates the MediaRecorder interface (start, pause, resume, stop).
 const R={state:'inactive',out:null,err:null,onstop:null};
// Timing state: pt = total paused time, aAcc = running position of the audio track.
 let kfNext=false,nV=0,t0=0,pt=0,ps=0,lastV=-1,n=0,timer=null,stopping=false,aFirst=null,lastA=-1,aAcc=0,rd=null;
// Video encoder: collects the encoded picture chunks.
 const ve=new VideoEncoder({output:(c,m)=>{nV++;mux.addVideoChunk(c,m)},error:e=>{R.err=e}});
 ve.configure({codec:vc,width:W,height:H,bitrate:br,framerate:30,hardwareAcceleration:vhw});
// Audio encoder: chunk times come from the running audio duration, so pauses cannot break the file.
 const ae=new AudioEncoder({output:(c,m)=>{const du=c.duration||Math.round((am==='aac'?1024:960)*1e6/sr);let ts=Math.max(aAcc,lastA+1);lastA=ts;aAcc=ts+du;mux.addAudioChunk(c,m,ts)},error:e=>{R.err=e}});
 ae.configure({codec:ac,sampleRate:sr,numberOfChannels:2,bitrate:128000});
// 30 times a second: copy the canvas into the video encoder (only while recording).
 const tickV=()=>{if(ve.state==='closed'&&!R.err)R.err=new Error('The video encoder stopped on this device.');if(R.state==='recording'&&ve.state!=='closed'&&ve.encodeQueueSize<10){const ts=Math.round((performance.now()-t0-pt)*1000);
   if(ts>lastV){const f=new VideoFrame(cv,{timestamp:ts});ve.encode(f,{keyFrame:(n++%60===0)||kfNext});kfNext=false;f.close();lastV=ts}}
  if(!stopping)timer=setTimeout(tickV,1000/30)};
// Read raw audio from the recording stream and encode it (only while recording).
 const pump=async()=>{rd=new MediaStreamTrackProcessor({track:aTrack}).readable.getReader();
  while(true){const{value:d,done}=await rd.read();if(done)break;
   if(R.state==='recording'){if(aFirst===null)aFirst=d.timestamp;if(ae.encodeQueueSize<60)ae.encode(d)}d.close()}};
// start / pause / resume / stop of the fallback recorder.
 R.start=()=>{t0=performance.now();R.state='recording';tickV();pump().catch(()=>{})};
 R.pause=()=>{if(R.state==='recording'){ps=performance.now();R.state='paused'}};
 R.resume=()=>{if(R.state==='paused'){kfNext=true;pt+=performance.now()-ps;R.state='recording'}};
 R.stop=async()=>{if(stopping)return;stopping=true;R.state='inactive';clearTimeout(timer);try{rd&&rd.cancel()}catch(e){}
  try{await ve.flush();if(nV===0)throw R.err||new Error('The video encoder produced no picture on this device. Choose 720p and try again.');if(aFirst!==null)await ae.flush();mux.finalize();R.out=new Blob([tg.buffer],{type:'video/mp4'})}catch(e){R.err=R.err||e}
  R.onstop&&R.onstop()};
 return R}

/* ---------- export ---------- */
// Record one clip (or the trailer when i is "T") in real time and put the finished file in the list.
async function exportClip(i,forceWC){
 if(!mime&&!WC)return err('This browser cannot record MP4. Use the latest Chrome or Edge (v126+), or Safari.');if(busy)return err('Please wait, another task is still running.');
// Keep the screen awake while recording.
 const tok=RUN;let retry=false;busy=true;lock(true);Object.keys(ST).forEach(k=>delete ST[k]);let wl=null;try{wl=navigator.wakeLock?await navigator.wakeLock.request('screen'):null}catch(e){}
// c = the clip or trailer being exported, TRL = true for the trailer.
 const c=i==='T'?TRAILER:clips[i],TRL=!!c.trailer,_fit=S.fit;if(TRL&&S.fit==='smart')S.fit='crop';const bar=c._el.querySelector('.bar i'),btn=c._el.querySelector('button.exp');btn.textContent='Preparing…';say('Preparing…');
 try{
// Prepare in parallel: captions, smart-reframe plan and silence-trim ranges.
  let skip=[];const soft=(n,p)=>p.catch(e=>{if(e.message==='Stopped')throw e;$('#capnote').textContent=n+' skipped: '+(e.message||e)});
  const jobs=[];
  if(S.cap==='auto'&&!TRL)jobs.push(soft('Captions',ensureCaps(c,tok)));
  if(S.fit==='smart'&&!TRL)jobs.push(soft('Smart reframe',prepFrame(c,tok)));
  if(S.tr!=='off'&&!TRL)jobs.push(soft('Silence trim',skipMap(c,tok).then(s=>{skip=s})));
// Trailer: the "skip" ranges are the gaps between its parts.
  await Promise.all(jobs);alive(tok);if(TRL)skip=c.segs.slice(1).map((g,k)=>[c.segs[k].e,g.s]);
  btn.textContent='Exporting…';say('Exporting… keep this tab open and the screen on.');
// Canvas size for the chosen format and quality.
  const WIDE=TRL&&S.tasp==='wide',hq=(TRL?S.tres:S.res)==='1080',cw=WIDE?(hq?1920:1280):(hq?1080:720),ch=WIDE?cw*9/16:cw*16/9;if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch}WIDEREC=WIDE;
// Switch audio on and move the video to the start of the clip.
  await audioReady();outG.gain.value=0;recG.gain.value=1;v.muted=false;v.pause();await seek(v,c.s);alive(tok);
  camInit(c);RECING=true;
// Record the canvas and the audio stream together.
  if(!cv.captureStream)throw new Error('This browser cannot record the canvas. Open the page in Chrome.');
  const st=cv.captureStream(30);adest.stream.getAudioTracks().forEach(t=>st.addTrack(t));
// Create the recorder: the browser's MP4 MediaRecorder, or the WebCodecs fallback.
  const rbr=cv.width>720?8e6:4e6,rec=(mime&&!forceWC)?new MediaRecorder(st,{mimeType:mime,videoBitsPerSecond:rbr,bitrateMode:'constant'}):await makeWC(adest.stream.getAudioTracks()[0],rbr);REC=rec;const parts=[];rec.ondataavailable=e=>e.data.size&&parts.push(e.data);
// Start recording and play the video.
  const done=new Promise(r=>{rec.onstop=r;rec.onerror=e=>{rec.err=e.error||new Error('The browser video recorder failed')}});if(TRL){ctx.fillStyle='#000';ctx.fillRect(0,0,cv.width,cv.height)}else draw();rec.start(500);
  try{await guard(v.play(),15000,'Video play')}catch(e){throw e.message==='Stopped'?e:new Error('Video could not play: '+(e.message||e))}
  if(ALL&&S.cap==='auto'&&clips[i+1])ensureCaps(clips[i+1],tok).catch(()=>{});
// Loop state.
  let sk=false,pend=false,last=performance.now(),held=false,hold=0,rised=false;const TOT=TRL?c.segs.reduce((a,g)=>a+g.e-g.s,0):0;
// Trailer: run the trailer engine. Other clips: draw every frame until the clip ends, skipping silent ranges.
  if(TRL)await runTrailer(c,tok,rec,bar);else await new Promise(res=>{const loop=()=>{
   if(tok!==RUN){res();return}
   const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;
// Jump over silent ranges (the recorder pauses while the video seeks).
   if(!sk){const q=skip.find(x=>v.currentTime>=x[0]&&v.currentTime<x[1]);
    if(q){sk=true;try{rec.pause()}catch(e){}seek(v,q[1]).then(()=>frameReady(v)).then(()=>{pend=true;sk=false},()=>{sk=false})}}
// Update the smart-reframe camera.
   if(S.fit==='smart')camUpdate(v.currentTime,dt,liveCut());
// Draw the frame (and trailer text) and update the progress bar.
   draw();if(TRL){const tt=ttOf(c.segs,v.currentTime);if(!rised&&S.sfx==='on'&&tt>TOT-2.4){rised=true;sfx('riser')}if(held)hold+=dt;trlOverlay(c,tt,hold,held)}bar.style.width=Math.min(100,(v.currentTime-c.s)/(c.e-c.s)*100)+'%';if(pend){pend=false;try{rec.resume()}catch(e){}}
// Detect the end of the clip.
   const endHit=v.currentTime>=c.e-.05||v.ended||(v.paused&&!sk&&!held&&v.currentTime>c.s);
// Trailer: hold the last frame while the release line is shown.
   if(endHit&&TRL&&S.ovl==='on'&&c.rel&&!held){held=true;v.pause();if(S.sfx==='on')sfx('boom')}
   if(held){if(hold>=3.2)res();else requestAnimationFrame(loop)}else if(endHit)res();else requestAnimationFrame(loop)};loop()});
// Stop recording and wait for the file.
  alive(tok);v.pause();if(rec.state!=='inactive')rec.stop();await done;alive(tok);
// Check that the finished file really plays, then store it.
  if(rec.err)throw rec.err;const bl=rec.out||new Blob(parts,{type:'video/mp4'});say('Checking the finished file…');const vr=await verifyVideo(bl);if(!vr.ok)throw new Error('The finished file is not usable ('+(vr.why||'unknown problem')+'), so it was not saved. Choose 720p and try again, or use Chrome or Edge on a computer.');c.blob=bl;const chk=' File check: '+(vr.dur?vr.dur.toFixed(1)+' s, ':'length not readable, ')+vr.w+'×'+vr.h+(vr.seek?', plays to the end.':'.');say((c.planInfo&&c.planInfo.n?'Done. Faces found in '+c.planInfo.faces+' of '+c.planInfo.n+' frames, '+c.planInfo.cuts+' scene cuts.':'Done.')+chk)
// Report a failure.
 }catch(e){if(e.message!=='Stopped'){try{REC&&REC.state!=='inactive'&&REC.stop()}catch(_){}v.pause();
  // Native recorder gave an unusable file: try again once with the WebCodecs recorder.
  if(!forceWC&&mime&&WCok&&(/not usable|recorder|recording/i.test(e.message||''))){retry=true;say('The first export was not usable. Retrying with the compatibility encoder…')}else{say('Export failed: '+(e.message||e));err('Export failed: '+(e.message||e))}}}
 try{wl&&wl.release()}catch(e){}
// Always restore the settings and unlock the interface.
 S.fit=_fit;WIDEREC=false;ZOOM=1;SHX=SHY=0;v.playbackRate=1;if(tok===RUN){if(cv.width!==720||cv.height!==1280){cv.width=720;cv.height=1280}RECING=false;if(outG)outG.gain.value=1;if(recG)recG.gain.value=0;busy=false;lock(false);render();renderTrailer()}
 if(retry&&tok===RUN)return exportClip(i,true)}
// Open the finished file in a hidden video to prove that it is playable.
function verifyVideo(b){return new Promise(res=>{const u=URL.createObjectURL(b),x=document.createElement('video');x.muted=true;x.preload='auto';x.playsInline=true;let done=false,tm=null,dt=null;
 const fin=o=>{if(done)return;done=true;clearTimeout(tm);clearTimeout(dt);x.onerror=x.onloadeddata=x.ondurationchange=x.onseeked=null;x.removeAttribute('src');try{x.load()}catch(e){}URL.revokeObjectURL(u);res(o)};
 const seekEnd=()=>{const d=x.duration;if(!Number.isFinite(d)||d<=.5)return fin({ok:false,why:'the MP4 duration was not finalized',dur:null,w:x.videoWidth,h:x.videoHeight,seek:false});
  x.onseeked=()=>fin({ok:x.videoWidth>0&&x.videoHeight>0&&x.readyState>=2,why:'the end of the file cannot be decoded',dur:d,w:x.videoWidth,h:x.videoHeight,seek:true});
  try{x.currentTime=Math.max(0,d-.3)}catch(e){fin({ok:false,why:'the end of the file cannot be reached',dur:d,w:x.videoWidth,h:x.videoHeight,seek:false})}};
 tm=setTimeout(()=>fin({ok:false,why:'the check timed out'}),20000);x.onerror=()=>fin({ok:false,why:'the file cannot be read'});
 x.onloadeddata=()=>{if(!(x.videoWidth>0&&x.videoHeight>0))return fin({ok:false,why:'the file has no picture'});
  if(Number.isFinite(x.duration))seekEnd();else{x.ondurationchange=()=>{if(Number.isFinite(x.duration)){x.ondurationchange=null;seekEnd()}};dt=setTimeout(()=>fin({ok:false,why:'the MP4 duration was not finalized',dur:null,w:x.videoWidth,h:x.videoHeight,seek:false}),6000)}};
 x.src=u})}
// Download a finished clip.
function save(c,i){const a=document.createElement('a');a.href=URL.createObjectURL(c.blob);a.download=fname+(c.trailer?'-trailer':c.full?'-full-9x16':'-short-'+(i+1))+'.'+ext;document.body.append(a);a.click();a.remove()}
// Share a finished file. "Share…" opens the phone's own share menu (YouTube, Instagram, Facebook, WhatsApp...) with the video attached.
// The site buttons save the file first, then open that site's upload page in a new tab (a web page cannot upload to your account by itself: you pick the saved file there).
const SHARE_SITES=[['YouTube','https://www.youtube.com/upload'],['Facebook','https://www.facebook.com/reels/create'],['Instagram','https://www.instagram.com/'],['TikTok','https://www.tiktok.com/upload']];
function shareRow(c,i){const d=document.createElement('div');d.className='row';d.style.marginTop='6px';
 const mk=(txt,fn)=>{const x=document.createElement('button');x.className='sm';x.style.cssText='padding:3px 8px;font-size:12px';x.textContent=txt;x.onclick=fn;d.append(x)};
 const nm=()=>fname+(c.trailer?'-trailer':c.full?'-full-9x16':'-short-'+(i+1))+'.'+ext;
 const fl=()=>new File([c.blob],nm(),{type:(c.blob.type||'video/mp4').split(';')[0]});
 try{if(navigator.share&&navigator.canShare&&navigator.canShare({files:[fl()]}))mk('Share…',()=>{navigator.share({files:[fl()],title:fname}).catch(e=>{if(e&&e.name!=='AbortError')err('Sharing failed: '+(e.message||e))})})}catch(e){}
 SHARE_SITES.forEach(([n,u])=>mk(n,()=>{save(c,i);window.open(u,'_blank','noopener');say('Saved. On '+n+' tap upload and choose the file you just saved.')}));
 return d}
// Disable / enable the buttons while work is running (the Stop button stays active).
function lock(b){$$('button.sm,button.main,#all,button.chip').forEach(x=>{if(x.id!=='stop'&&x.id!=='skipAlign'&&x.id!=='skipAlign2')x.disabled=b});$('#stop').classList.toggle('hide',!b)}
// "Export all" button: export every clip that has no file yet.
$('#all').onclick=async()=>{if(busy)return;const tok=RUN;ALL=true;
 try{for(let i=0;i<clips.length;i++){if(tok!==RUN)break;if(!clips[i].blob)await exportClip(i)}}finally{if(tok===RUN)ALL=false}
 if(tok===RUN)say('Done. Tap Save on each short.')};
// Warn if the tab is hidden while recording or scanning.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)err('Keep this tab open and the screen on while it works, otherwise recording and scanning can break.')});
/* ===== 13. PROJECT SAVE AND PREVIEW ===== */
// Saved plans live in this browser only (localStorage). The video itself is NOT saved: open the same file again and tap "Restore".
var PRV=null;
// Key of the current video: file name and size.
function projKey(){return file?file.name+'|'+file.size:null}
// Save the current shorts plan and trailer plan (times, tags, texts). Keeps the 8 most recent videos.
function projSave(){try{const k=projKey();if(!k||(!clips.length&&!TRAILER))return;
 const all=JSON.parse(localStorage.getItem('cf_projects')||'{}');
 all[k]={t:Date.now(),clips:clips.map(c=>({s:c.s,e:c.e,score:c.score,tags:c.tags||[],full:c.full||0})),
  trailer:TRAILER?{words:TRAILER.words,cast:TRAILER.cast,title:TRAILER.title,tag:TRAILER.tag,rel:TRAILER.rel,note:TRAILER.note,segs:TRAILER.segs.map(g=>({s:g.s,e:g.e,a3:g.a3,a4:g.a4,h:g.h}))}:null};
 Object.keys(all).sort((a,b)=>all[b].t-all[a].t).slice(8).forEach(x=>delete all[x]);
 localStorage.setItem('cf_projects',JSON.stringify(all))}catch(e){}}
// Read the saved plan of the current video (or null).
function projGet(){try{const k=projKey();if(!k)return null;const p=(JSON.parse(localStorage.getItem('cf_projects')||'{}'))[k];return p&&((p.clips&&p.clips.length)||p.trailer)?p:null}catch(e){return null}}
// After a video loads: if a saved plan exists for it, show a "Restore" notice at the top of the work area.
function projOffer(){try{const old=$('#restoreBox');if(old)old.remove();const p=projGet();if(!p)return;
 const n=p.clips.length,box=document.createElement('div');box.id='restoreBox';box.className='note restore';
 box.innerHTML='<span>Saved plan found for this video: '+(n?n+' short'+(n>1?'s':''):'')+(n&&p.trailer?' and ':'')+(p.trailer?'a trailer':'')+'.</span>';
 const b=document.createElement('button');b.className='sm';b.textContent='Restore';b.onclick=()=>{projRestore(p);box.remove()};box.append(b);$('#work').prepend(box)}catch(e){}}
// Put the saved shorts and trailer back. "Different picks" and the replace button need a fresh analysis, so they stay hidden until you analyze again.
function projRestore(p){if(busy)return;
 if(p.clips.length){clips=p.clips.map(c=>({...c,blob:null,pcm:null}));$('#res').classList.remove('hide');render()}
 if(p.trailer){const t=p.trailer,sg=t.segs;
  TRAILER={words:t.words||[],cast:t.cast||'',music:null,title:t.title||'',tag:t.tag||'',rel:t.rel||'',trailer:1,s:sg[0].s,e:Math.max(...sg.map(g=>g.e)),segs:sg,note:t.note||'',blob:null,tags:[],pcm:null};
  const set=(id,val)=>{const el=$(id);if(el)el.value=val};set('#tWords',TRAILER.words.join(', '));set('#tCast',TRAILER.cast);set('#tTitle',TRAILER.title);set('#tTag',TRAILER.tag);set('#tRel',TRAILER.rel);
  $('#trl').classList.remove('hide');renderTrailer()}
 say('Saved plan restored. Analyze again if you want new picks.')}
// Preview: play the main player from s to e and stop. Starting another preview, or pausing, cancels the previous one.
function previewSeg(s,e){if(busy)return;if(PRV)PRV();
 const chk=()=>{if(v.currentTime>=e-.05){v.pause();off()}},off=()=>{v.removeEventListener('timeupdate',chk);v.removeEventListener('pause',off);PRV=null};
 PRV=off;v.addEventListener('timeupdate',chk);
 seek(v,s).then(()=>{v.play().catch(()=>{});v.addEventListener('pause',off,{once:true})}).catch(()=>off());
 try{v.scrollIntoView({behavior:'smooth',block:'center'})}catch(e2){}}

;

/* ===== 12. IMAGE ANIMATOR (separate small tool) =====
   The Image Animator is a complete mini-page stored as one long escaped
   string (IA_HTML below). It is shown inside an iframe so it stays separate
   from the rest of the app. The code here only mounts it and keeps it in sync. */
(function(){
// The embedded Image Animator page (one long escaped string; do not edit by hand).
const IA_HTML=JSON.parse("\"<!doctype html>\\n<html lang=\\\"en\\\">\\n<head>\\n<meta charset=\\\"utf-8\\\">\\n<meta name=\\\"viewport\\\" content=\\\"width=device-width,initial-scale=1\\\">\\n<title>Image Animator – ClipForge</title>\\n<style>\\n:root{--bg:#090e1b;--pn:#111a2c;--ln:rgba(148,163,184,.16);--tx:#edf2ff;--mu:#93a2bd;--ac:#8b7cff;--acx:#fff}\\n:root[data-theme=dark]{--bg:#090e1b;--pn:#111a2c;--ln:rgba(148,163,184,.16);--tx:#edf2ff;--mu:#93a2bd;--ac:#8b7cff;--acx:#fff}\\n:root[data-theme=light]{--bg:#f4f6fb;--pn:#fff;--ln:rgba(31,45,72,.12);--tx:#172033;--mu:#65718a;--ac:#6555e8;--acx:#fff}\\n*{box-sizing:border-box}\\n@media(min-width:1100px){main{max-width:1440px;padding:28px clamp(24px,3vw,48px) 56px;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:22px}header,.wide{grid-column:1/-1}.stage{min-height:420px;top:24px}.panel{padding:22px;border-radius:16px}.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}\\n@media(min-width:1600px){main{max-width:1600px;gap:26px}.panel{padding:26px}}\\n@media(max-width:859px){main{grid-template-columns:minmax(0,1fr)}.stage{position:relative;top:auto;min-height:220px}}\\nbody{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,\\\"Segoe UI\\\",Roboto,sans-serif}\\nmain{max-width:980px;margin:0 auto;padding:20px 16px 48px;display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}\\n@media(min-width:860px){main{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}header,.wide{grid-column:1/-1}}\\nh1{margin:0;font-size:26px;letter-spacing:-.01em}h2{margin:0;font-size:16px}\\nheader p{margin:4px 0 0;color:var(--mu);max-width:62ch}\\n.stage{background:#000;border-radius:14px;overflow:hidden;display:grid;place-items:center;min-height:220px;border:1px solid var(--ln);position:sticky;top:8px}\\ncanvas{max-width:100%;max-height:62vh;display:block}\\n.panel{background:var(--pn);border:1px solid var(--ln);border-radius:12px;padding:16px;display:grid;gap:12px}\\ntextarea,input[type=text],input[type=number]{width:100%;font:inherit;color:var(--tx);background:transparent;border:1px solid var(--ln);border-radius:8px;padding:9px 10px}\\ntextarea{min-height:84px;resize:vertical}\\n.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\\n.chip,button.alt{font:inherit;font-size:13px;color:var(--tx);background:transparent;border:1px solid var(--ln);border-radius:999px;padding:6px 12px;cursor:pointer}\\nbutton.main{font:inherit;font-weight:600;background:var(--ac);color:var(--acx);border:0;border-radius:12px;padding:12px 16px;cursor:pointer;flex:1}\\nbutton:disabled{opacity:.45;cursor:not-allowed}\\n:focus-visible{outline:2px solid var(--ac);outline-offset:2px}\\n.hint{font-size:13px;color:var(--mu);margin:0}\\n.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}\\n.it{border:1px solid var(--ln);border-radius:10px;padding:6px;display:grid;gap:5px;font-size:12px}\\n.it canvas{width:100%;height:84px;object-fit:cover;border-radius:6px;max-height:none}\\n.it input{padding:5px 7px;font-size:12px}\\n.it .row{gap:4px}.it button{font:inherit;font-size:12px;padding:2px 8px;border:1px solid var(--ln);background:transparent;color:var(--tx);border-radius:6px;cursor:pointer}\\n.bar{height:8px;background:var(--ln);border-radius:9px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--ac)}\\n#msg{font-size:14px;min-height:20px}.err{color:#c0392b}\\n#plan{font-size:14px;margin:0;padding:10px 12px;border-radius:8px;background:rgba(127,127,127,.12)}\\na.dl{display:inline-block;font-weight:700;color:var(--acx);background:var(--ac);padding:11px 16px;border-radius:10px;text-decoration:none}\\n.aud{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:14px;border:1px solid var(--ln);border-radius:8px;padding:8px 10px}\\n.aud span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu)}\\n.chip[aria-pressed=true]{background:var(--ac);border-color:var(--ac);color:var(--acx);font-weight:600}\\ndetails{border:1px solid var(--ln);border-radius:10px;padding:10px 12px}summary{cursor:pointer;font-weight:600}details[open]>summary{margin-bottom:10px}\\ndetails details{border:0;padding:6px 0 0}.vbox{display:grid;gap:10px}.vbox>*{margin:0}.aud audio{width:100%;margin-top:6px}.aud{flex-wrap:wrap}\\n[hidden]{display:none!important}\\n</style>\\n</head>\\n<body>\\n<main>\\n<header>\\n <h1>Image Animator</h1>\\n <p>Add several pictures, choose an animation, optionally add music and a voiceover, and get one video. Everything runs in your browser and nothing is uploaded.</p>\\n</header>\\n\\n<section><div class=\\\"stage\\\"><canvas id=\\\"cv\\\" width=\\\"1280\\\" height=\\\"720\\\" aria-label=\\\"Preview\\\"></canvas></div></section>\\n\\n<section class=\\\"panel\\\">\\n <div class=\\\"row\\\"><h2>1. Pictures</h2><span class=\\\"hint\\\" id=\\\"cnt\\\">none yet</span></div>\\n <div class=\\\"row\\\"><button class=\\\"alt\\\" id=\\\"addp\\\">Add pictures</button><button class=\\\"alt\\\" id=\\\"addv2\\\">Add pictures from a video</button><button class=\\\"alt\\\" id=\\\"clr\\\" disabled>Remove all</button></div>\\n <input type=\\\"file\\\" id=\\\"file\\\" accept=\\\"image/*\\\" multiple hidden><input type=\\\"file\\\" id=\\\"vfile\\\" accept=\\\"video/*\\\" hidden>\\n <div id=\\\"vpanel\\\" class=\\\"panel\\\" hidden style=\\\"padding:10px\\\"><div class=\\\"hint\\\" id=\\\"vinfo\\\"></div>\\n  <div class=\\\"row\\\"><label for=\\\"vn\\\" style=\\\"margin:0\\\">How many pictures do you want?</label><input type=\\\"number\\\" id=\\\"vn\\\" min=\\\"1\\\" max=\\\"40\\\" step=\\\"1\\\" placeholder=\\\"Type a number\\\" inputmode=\\\"numeric\\\" style=\\\"width:140px\\\"><button class=\\\"alt\\\" id=\\\"vgo\\\">Take pictures</button></div>\\n  <p class=\\\"hint\\\">Pictures are taken at the video's full quality (up to 1920 px), from the sharpest frames spread across the video. The first and last 5% and near-duplicates are skipped. Remove any you do not want with ✕ below.</p></div>\\n <div class=\\\"grid\\\" id=\\\"grid\\\"></div>\\n \\n\\n <h2>2. Animation</h2>\\n <div class=\\\"row\\\" id=\\\"anims\\\"></div>\\n <p class=\\\"hint\\\" id=\\\"animdesc\\\"></p>\\n <div class=\\\"row\\\"><label for=\\\"sec\\\" style=\\\"margin:0\\\">Seconds per picture</label><input type=\\\"number\\\" id=\\\"sec\\\" min=\\\"0.5\\\" max=\\\"30\\\" step=\\\"0.5\\\" value=\\\"3\\\" inputmode=\\\"decimal\\\" style=\\\"width:90px\\\"><span class=\\\"hint\\\" id=\\\"tot\\\"></span></div>\\n <div class=\\\"row\\\"><span class=\\\"hint\\\">Shape</span><span id=\\\"shp\\\" class=\\\"row\\\"></span></div>\\n <div class=\\\"row\\\"><span class=\\\"hint\\\">Music</span><span id=\\\"mus\\\" class=\\\"row\\\"></span></div>\\n <details><summary>More options</summary><div class=\\\"vbox\\\">\\n  <div class=\\\"row\\\"><span class=\\\"hint\\\">Picture fit</span><span id=\\\"fit\\\" class=\\\"row\\\"></span></div>\\n  <div class=\\\"row\\\"><span class=\\\"hint\\\">Look</span><span id=\\\"lk\\\" class=\\\"row\\\"></span></div>\\n  <div class=\\\"row\\\"><span class=\\\"hint\\\">Sound effects</span><span id=\\\"sfxo\\\" class=\\\"row\\\"></span></div>\\n  <div class=\\\"row\\\"><span class=\\\"hint\\\">Fade in and out</span><span id=\\\"fdo\\\" class=\\\"row\\\"></span></div>\\n </div></details>\\n <p id=\\\"plan\\\">Add pictures to begin.</p>\\n</section>\\n\\n<section class=\\\"panel wide\\\">\\n <h2>3. Sound (optional)</h2>\\n <div class=\\\"row\\\"><button class=\\\"alt\\\" id=\\\"addm\\\">Use my own music</button><button class=\\\"alt\\\" id=\\\"addv\\\">Add voiceover file</button><button class=\\\"alt\\\" id=\\\"prev\\\">Preview built-in sound</button><button class=\\\"alt\\\" id=\\\"rec\\\">Record my voice</button></div>\\n <input type=\\\"file\\\" id=\\\"mf\\\" accept=\\\"audio/*\\\" hidden><input type=\\\"file\\\" id=\\\"vf\\\" accept=\\\"audio/*\\\" hidden>\\n <div id=\\\"auds\\\"></div>\\n <p class=\\\"hint\\\">Music and sound effects are built in and chosen from your prompt: say “emotional”, “epic”, “upbeat” or “calm”, or “no music” / “no sound effects” to turn them off. They are simple synthesized sounds, not a composed soundtrack. Voiceover: record yourself, or add a file made with a voice tool. A natural Urdu or English voice cannot be generated inside this page, and the browser’s built-in speech voices cannot be saved into a video. Music plays quietly under the voice.</p>\\n <div class=\\\"row\\\"><button class=\\\"main\\\" id=\\\"go\\\" disabled>Create and save video</button></div>\\n <div class=\\\"bar\\\" id=\\\"barw\\\" hidden><i id=\\\"bar\\\"></i></div>\\n <div id=\\\"msg\\\" role=\\\"status\\\" aria-live=\\\"polite\\\"></div>\\n <div id=\\\"out\\\"></div>\\n <p class=\\\"hint\\\">These animations only move the camera (zoom, pan, shake) over each picture; people or objects inside a picture do not move by themselves. Export runs in real time: a 2 minute video takes about 2 minutes and this screen must stay on. Output is MP4 where your browser supports it, otherwise WebM.</p>\\n</section>\\n</main>\\n\\n<script>\\nconst $=s=>document.querySelector(s),cv=$('#cv'),ctx=cv.getContext('2d');\\nconst S={items:[],music:null,voice:null,raf:0,busy:false,cancel:false,outUrl:null,G:null,T:null,micRec:null};\\nconst SHAPES={tall:['9:16',720,1280],wide:['16:9',1280,720],sq:['1:1',900,900]};\\nconst R={push:/zoom(ing)? in|push|closer|approach|dolly in|aage|qareeb|nazdeek/,pull:/zoom(ing)? out|pull|reveal|away|wider|peeche|door/,\\n left:/pan(ning)? left|towards left|to the left|bayen|baen/,right:/pan(ning)? right|towards right|to the right|dayen|daen/,\\n up:/tilt(ing)? up|rise|rising|look up|upar/,down:/tilt(ing)? down|look down|sink|neeche|niche/,shake:/shake|shaky|earthquake|handheld|chaos|panic|jhatk|hilna|tense/};\\nconst NAMES={push:'zoom in',pull:'zoom out',left:'pan left',right:'pan right',up:'tilt up',down:'tilt down',shake:'handheld shake'};\\nconst CYC=['push','left','pull','right','up','push','down','pull'];\\n\\n/* ---- timeline ---- */\\nconst ANIMS={slow:{n:'Slow zoom',d:'Gentle zoom in with soft crossfades.',moves:i=>['push'],int:.4,tr:'fade',xf:.8},\\n ken:{n:'Ken Burns',d:'Zoom and pan together, documentary style.',moves:i=>['push',i%2?'right':'left'],int:.5,tr:'fade',xf:.9},\\n pan:{n:'Smooth pan',d:'Pictures slide in from the side.',moves:i=>[i%2?'right':'left'],int:.6,tr:'slide',xf:.6},\\n dram:{n:'Dramatic',d:'Fast push, shake and a white flash on every cut.',moves:i=>['push','shake'],int:.9,tr:'flash',xf:.3},\\n mix:{n:'Mix',d:'A different move for each picture (zoom in, pan, zoom out, tilt) with soft crossfades.',moves:i=>[['push','left','pull','right','up','push','down','pull'][i%8]],int:.6,tr:'fade',xf:.7},\\n punch:{n:'Punchy',d:'Quick pops and hard cuts, reels style.',moves:i=>['push'],int:1,tr:'cut',xf:.15,pop:true}};\\nS.o={anim:'mix',sec:3,shape:'auto',music:'cinematic',fit:'auto',look:'cine',sfx:'on',fade:'on'};\\nfunction build(){const o=S.o,A=ANIMS[o.anim],n=S.items.length;\\n const G={shape:o.shape,fit:o.fit,bw:o.look==='bw',grade:o.look==='cine',fade:o.fade==='on',nomusic:o.music==='none',nosfx:o.sfx==='off',mood:o.music==='none'?'cinematic':o.music,named:true,moves:A.moves(0),int:A.int,anim:o.anim};S.G=G;\\n if(G.fit==='auto')G.fit=(n&&S.items.every(i=>i.vid))?'blur':'fill';\\n if(G.shape==='auto'){const f=S.items[0],r=f?f.w/f.h:1.78;G.shape=r<.85?'tall':r>1.2?'wide':'sq'}\\n if(!n){S.T=null;return}\\n const per=Math.max(.5,Math.min(30,+o.sec||3)),xf=n>1?Math.min(A.xf,per*.45):0,total=per*n-(n-1)*xf;\\n const segs=S.items.map((it,i)=>({it,start:i*(per-xf),dur:per,moves:A.moves(i),int:A.int,tr:A.tr,pop:!!A.pop}));\\n S.T={segs,total,xf,per}}\\nfunction describe(){const G=S.G,T=S.T,A=ANIMS[S.o.anim];if(!T)return 'Add pictures to begin.';\\n const m=T.total>=90?(T.total/60).toFixed(1)+' min':Math.round(T.total)+' s';\\n return S.items.length+' pictures × '+T.per+' s = about '+m+' · '+SHAPES[G.shape][0]+' · '+A.n+(G.fit==='blur'?' · whole picture with blur':' · fills the frame')+(G.bw?' · black and white':G.grade?' · cinematic look':'')+' · sound: '+soundText()+(S.voice&&T.total<S.voice.dur?' · note: the video is shorter than your voiceover':'')}\\nfunction soundText(){const G=S.G;return (S.music?'your music':G.nomusic?'no music':G.mood+' music (built-in)')+(G.nosfx?', no effects':' + sound effects')}\\nfunction update(){build();$('#plan').textContent=describe();if(S.G){const[,w,h]=SHAPES[S.G.shape];if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}}\\n $('#go').disabled=!S.items.length;$('#clr').disabled=!S.items.length;$('#cnt').textContent=S.items.length?S.items.length+' added':'none yet';start()}\\n\\nfunction chipsO(box,items,key,after){const el=$(box);items.forEach(([v,l])=>{const b=document.createElement('button');b.className='chip';b.textContent=l;b.dataset.v=v;b.onclick=()=>{S.o[key]=v;syncO();update();if(after)after()};el.append(b)})}\\nfunction syncO(){[['#anims','anim'],['#shp','shape'],['#mus','music'],['#fit','fit'],['#lk','look'],['#sfxo','sfx'],['#fdo','fade']].forEach(([b,k])=>$(b).querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.v===S.o[k])));$('#animdesc').textContent=ANIMS[S.o.anim].d}\\nchipsO('#anims',['mix','slow','ken','pan','dram','punch'].map(k=>[k,ANIMS[k].n]),'anim');\\nchipsO('#shp',[['auto','Match first picture'],['tall','9:16'],['wide','16:9'],['sq','1:1']],'shape');\\nchipsO('#mus',[['cinematic','Epic'],['emotional','Emotional'],['upbeat','Upbeat'],['calm','Calm'],['none','None']],'music');\\nchipsO('#fit',[['auto','Auto'],['blur','Whole picture + blur'],['fill','Fill the frame']],'fit');\\nchipsO('#lk',[['cine','Cinematic'],['normal','Normal'],['bw','Black and white']],'look');\\nchipsO('#sfxo',[['on','On'],['off','Off']],'sfx');chipsO('#fdo',[['on','On'],['off','Off']],'fade');\\n$('#sec').oninput=e=>{const v=parseFloat(e.target.value);if(v>0){S.o.sec=Math.max(.5,Math.min(30,v));update()}};\\n$('#sec').onchange=e=>{const v=parseFloat(e.target.value);S.o.sec=v>0?Math.max(.5,Math.min(30,v)):3;e.target.value=S.o.sec;update()};\\nsyncO();\\n\\n/* ---- pictures ---- */\\nfunction msg(t,bad){const m=$('#msg');m.textContent=t;m.className=bad?'err':''}\\nfunction addImage(f){return new Promise(res=>{const u=URL.createObjectURL(f),im=new Image();\\n im.onload=()=>{const sc=Math.min(1,2000/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*sc);c.height=Math.round(im.naturalHeight*sc);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);S.items.push({c,w:c.width,h:c.height,prompt:'',name:f.name});res(true)};\\n im.onerror=()=>{URL.revokeObjectURL(u);res(false)};im.src=u})}\\nasync function addFiles(list){const fs=[...list].filter(f=>f.type.startsWith('image/'));if(!fs.length)return msg('Choose image files (JPG, PNG, WebP).',1);\\n if(S.items.length+fs.length>40)return msg('Up to 40 pictures at a time.',1);let bad=0;for(const f of fs)if(!await addImage(f))bad++;\\n msg(bad?bad+' file(s) could not be opened.':fs.length+' picture(s) added.',!!bad);renderGrid();update()}\\nfunction renderGrid(){const g=$('#grid');g.innerHTML='';S.items.forEach((it,i)=>{const d=document.createElement('div');d.className='it';\\n const th=document.createElement('canvas');th.width=160;th.height=96;const x=th.getContext('2d'),sc=Math.max(160/it.w,96/it.h);x.drawImage(it.c,(160-it.w*sc)/2,(96-it.h*sc)/2,it.w*sc,it.h*sc);d.append(th);\\n \\n const r=document.createElement('div');r.className='row';\\n [['←',()=>mv(i,-1),i===0],['→',()=>mv(i,1),i===S.items.length-1],['✕',()=>{S.items.splice(i,1);renderGrid();update()},false]].forEach(([l,fn,dis])=>{const b=document.createElement('button');b.textContent=l;b.disabled=dis;b.setAttribute('aria-label',{'←':'Move earlier','→':'Move later','✕':'Remove'}[l]);b.onclick=fn;r.append(b)});\\n d.append(r);g.append(d)})}\\nfunction mv(i,d){const j=i+d;if(j<0||j>=S.items.length)return;[S.items[i],S.items[j]]=[S.items[j],S.items[i]];renderGrid();update()}\\n$('#addp').onclick=()=>$('#file').click();$('#file').onchange=e=>{addFiles(e.target.files);e.target.value=''};\\n$('#clr').onclick=()=>{if(confirm('Remove all pictures?')){S.items=[];renderGrid();update()}};\\ndocument.body.ondragover=e=>e.preventDefault();document.body.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files)};\\n\\n/* ---- pictures from a video ---- */\\nconst vSeek=(v,t)=>new Promise(res=>{let d=0;const f=()=>{if(!d){d=1;v.removeEventListener('seeked',f);res()}};v.addEventListener('seeked',f);v.currentTime=Math.max(0,Math.min(v.duration-.05,t));setTimeout(f,4000)});\\nlet VP=null;\\nasync function grabFrames(v,n,name){const D=v.duration,lo=D*.05,hi=D*.95,span=(hi-lo)/n,out=[],k=Math.min(1,1920/Math.max(v.videoWidth,v.videoHeight)),W=Math.round(v.videoWidth*k),H=Math.round(v.videoHeight*k);\\n const sc=document.createElement('canvas');sc.width=320;sc.height=Math.max(8,Math.round(320*v.videoHeight/v.videoWidth));const sx=sc.getContext('2d',{willReadFrequently:true});\\n const analyse=()=>{sx.drawImage(v,0,0,sc.width,sc.height);const d=sx.getImageData(0,0,sc.width,sc.height).data,w=sc.width,h=sc.height,g=new Float32Array(w*h);for(let i=0;i<g.length;i++)g[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;\\n  let a=0,b=0,c=0;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,l=4*g[i]-g[i-1]-g[i+1]-g[i-w]-g[i+w];a+=l;b+=l*l;c++}\\n  const tiny=new Float32Array(144);for(let y=0;y<9;y++)for(let x=0;x<16;x++)tiny[y*16+x]=g[Math.floor(y*h/9)*w+Math.floor(x*w/16)];return{sharp:b/c-(a/c)*(a/c),tiny}};\\n let prev=null;\\n for(let i=0;i<n;i++){msg('Taking picture '+(i+1)+' of '+n+'…');const tc=lo+span*(i+.5),wd=Math.min(span*.4,1.2),cand=[];\\n  for(const o of [-1,-.5,0,.5,1]){const t=Math.max(0,Math.min(D-.05,tc+o*wd));await vSeek(v,t);const a=analyse();cand.push({t,sharp:a.sharp,tiny:a.tiny})}\\n  cand.sort((a,b)=>b.sharp-a.sharp);let pick=cand[0];\\n  if(prev){const diff=c=>c.tiny.reduce((q,x,j)=>q+Math.abs(x-prev[j]),0)/144,ok=cand.find(c=>diff(c)>=8);if(ok)pick=ok}\\n  await vSeek(v,pick.t);const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(v,0,0,W,H);prev=pick.tiny;\\n  out.push({c,w:W,h:H,prompt:'',name:name.replace(/\\\\.[^.]+$/,'').slice(0,14)+' @'+pick.t.toFixed(1)+'s',vid:true})}\\n const bs=out.map(o=>barsOf(o.c)),m={l:Math.min(...bs.map(b=>b.l)),r:Math.min(...bs.map(b=>b.r)),t:Math.min(...bs.map(b=>b.t)),b:Math.min(...bs.map(b=>b.b))};\\n if(Math.max(m.l,m.r,m.t,m.b)>=.03&&1-m.l-m.r>=.3&&1-m.t-m.b>=.3)out.forEach(o=>{const x0=Math.round(o.w*m.l),y0=Math.round(o.h*m.t),w2=Math.round(o.w*(1-m.l-m.r)),h2=Math.round(o.h*(1-m.t-m.b)),c2=document.createElement('canvas');c2.width=w2;c2.height=h2;c2.getContext('2d').drawImage(o.c,x0,y0,w2,h2,0,0,w2,h2);o.c=c2;o.w=w2;o.h=h2;o.bars=true});\\n return out}\\nfunction barsOf(c){const w=160,h=Math.max(8,Math.round(160*c.height/c.width)),t=document.createElement('canvas');t.width=w;t.height=h;const x=t.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0,w,h);const d=x.getImageData(0,0,w,h).data,lit=i=>d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11>22;\\n const col=X=>{let n=0;for(let y=0;y<h;y++)if(lit(y*w+X))n++;return n>h*.03},row=Y=>{let n=0;for(let X=0;X<w;X++)if(lit(Y*w+X))n++;return n>w*.03};\\n let l=0;while(l<w-1&&!col(l))l++;let r=0;while(r<w-1&&!col(w-1-r))r++;let tp=0;while(tp<h-1&&!row(tp))tp++;let b=0;while(b<h-1&&!row(h-1-b))b++;return{l:l/w,r:r/w,t:tp/h,b:b/h}}\\n$('#addv2').onclick=()=>$('#vfile').click();\\n$('#vfile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!f.type.startsWith('video/'))return msg('Choose a video file (MP4 or WebM).',1);\\n const u=URL.createObjectURL(f),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';\\n v.onloadedmetadata=()=>{if(VP)URL.revokeObjectURL(VP.u);VP={f,u,v};$('#vpanel').hidden=false;$('#vinfo').textContent=f.name+' · '+v.videoWidth+'×'+v.videoHeight+' · '+v.duration.toFixed(1)+' s';$('#vn').value='';$('#vn').focus();msg('Type how many pictures you want from this video, then press Take pictures.')};\\n v.onerror=()=>{URL.revokeObjectURL(u);msg('This browser cannot play that video. Try an MP4 (H.264) or WebM file.',1)};v.src=u};\\n$('#vgo').onclick=async()=>{if(!VP)return;const n=Math.floor(+$('#vn').value);if(!(n>=1))return msg('Type how many pictures you want, as a whole number (for example 8).',1);\\n if(S.items.length+n>40)return msg('That would make more than 40 pictures in total. Type a smaller number.',1);\\n $('#vgo').disabled=true;S.extracting=true;notifyBusy();try{const out=await grabFrames(VP.v,n,VP.f.name);out.forEach(o=>S.items.push(o));renderGrid();update();msg(out.length+' pictures taken from the video'+(out[0]&&out[0].bars?' (black bars around the picture were cut off)':'')+'. Remove any you do not want with ✕.')}catch(e){msg('Could not take pictures: '+(e.message||e),1)}S.extracting=false;notifyBusy();$('#vgo').disabled=false};\\n\\n/* ---- audio ---- */\\nlet AC0=null;const ac=()=>AC0||(AC0=new(window.AudioContext||window.webkitAudioContext)());\\nasync function decode(blob){return ac().decodeAudioData(await blob.arrayBuffer())}\\nfunction renderAud(){const b=$('#auds');b.innerHTML='';[['music','Music'],['voice','Voiceover']].forEach(([k,l])=>{const a=S[k];if(!a)return;const d=document.createElement('div');d.className='aud';\\n d.innerHTML='<b>'+l+'</b>';const sp=document.createElement('span');sp.textContent=a.name+' · '+a.dur.toFixed(1)+' s';const x=document.createElement('button');x.className='alt';x.textContent='Remove';x.onclick=()=>{if(a.url)URL.revokeObjectURL(a.url);S[k]=null;renderAud();update()};d.append(sp,x);if(a.url){const au=document.createElement('audio');au.controls=true;au.src=a.url;d.append(au)}b.append(d)})}\\nasync function setAudio(k,f){try{const buf=await decode(f);if(S[k]&&S[k].url)URL.revokeObjectURL(S[k].url);S[k]={buf,dur:buf.duration,name:f.name||'recording',url:k==='voice'?URL.createObjectURL(f):null};renderAud();update();msg((k==='music'?'Music':'Voiceover')+' added.')}catch(e){msg('This audio file could not be read. Try MP3, M4A, WAV or OGG.',1)}}\\n$('#addm').onclick=()=>$('#mf').click();$('#addv').onclick=()=>$('#vf').click();\\n$('#mf').onchange=e=>{if(e.target.files[0])setAudio('music',e.target.files[0]);e.target.value=''};\\n$('#vf').onchange=e=>{if(e.target.files[0])setAudio('voice',e.target.files[0]);e.target.value=''};\\n$('#rec').onclick=async()=>{\\n if(S.micRec){S.micRec.stop();return}\\n if(!navigator.mediaDevices||!window.MediaRecorder)return msg('Recording needs a recent Chrome, Edge or Safari.',1);\\n try{const st=await navigator.mediaDevices.getUserMedia({audio:true}),ch=[],r=new MediaRecorder(st);S.micRec=r;notifyBusy();\\n  r.ondataavailable=e=>{if(e.data.size)ch.push(e.data)};\\n  r.onstop=async()=>{st.getTracks().forEach(t=>t.stop());S.micRec=null;notifyBusy();$('#rec').textContent='Record my voice';if(ch.length)await setAudio('voice',Object.assign(new Blob(ch,{type:r.mimeType}),{name:'My recording'}))};\\n  r.start();$('#rec').textContent='Stop recording';msg('Recording… speak now, then press Stop.')}\\n catch(e){msg('Microphone is blocked or not available. Allow microphone access for this page and try again.',1)}};\\n\\n\\n/* ---- drawing ---- */\\nconst oc=p=>1-Math.pow(1-Math.max(0,Math.min(1,p)),3),ioc=p=>{p=Math.max(0,Math.min(1,p));return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2};const ease=p=>.5-.5*Math.cos(Math.PI*p);let tiny=null;\\nfunction blurBg(it){const w=cv.width,h=cv.height;if(!tiny)tiny=document.createElement('canvas');tiny.width=32;tiny.height=Math.max(8,Math.round(32*h/w));tiny.getContext('2d').drawImage(it.c,0,0,tiny.width,tiny.height);\\n const sc=Math.max(w/tiny.width,h/tiny.height);ctx.drawImage(tiny,(w-tiny.width*sc)/2,(h-tiny.height*sc)/2,tiny.width*sc,tiny.height*sc);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,w,h)}\\nfunction drawSeg(sg,t,alpha){const w=cv.width,h=cv.height,it=sg.it,G=S.G,k2=w/720,p=ease(Math.max(0,Math.min(1,t/sg.dur))),I=sg.int,M=sg.moves,has=k=>M.includes(k);\\n const base=G.fit==='fill'?Math.max(w/it.w,h/it.h):Math.min(w/it.w,h/it.h);let z=1.06+.1*I,ox=0,oy=0;\\n if(has('push'))z+=.3*I*p;if(has('pull'))z+=.3*I*(1-p);if(sg.pop)z*=1+.12*(1-oc(t/.3));if(has('left')||has('right')||has('up')||has('down'))z+=.08+.14*I;\\n const dw=it.w*base*z,dh=it.h*base*z,sx=Math.max(0,(dw-w)/2),sy=Math.max(0,(dh-h)/2),mv=p*2-1;\\n if(has('left'))ox-=mv*sx*.95;if(has('right'))ox+=mv*sx*.95;if(has('up'))oy-=mv*sy*.95;if(has('down'))oy+=mv*sy*.95;\\n if(has('shake')){const a=(8+16*I)*k2;ox+=(Math.sin(t*23)+Math.sin(t*37+1))*a*.5;oy+=(Math.sin(t*29+2)+Math.sin(t*41))*a*.5}\\n ctx.save();ctx.globalAlpha=alpha;if(G.fit==='blur')blurBg(it);ctx.drawImage(it.c,(w-dw)/2+ox,(h-dh)/2+oy,dw,dh);ctx.restore()}\\nfunction draw(t){const w=cv.width,h=cv.height,T=S.T,G=S.G;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(!T)return;\\n const cur=T.segs.filter(s=>t>=s.start&&t<s.start+s.dur+.001);\\n if(!cur.length)drawSeg(T.segs[T.segs.length-1],T.per,1);\\n else if(cur.length===1)drawSeg(cur[0],t-cur[0].start,1);\\n else{const a=cur[cur.length-2],b=cur[cur.length-1],p=Math.min(1,(t-b.start)/Math.max(.01,T.xf));\\n  if(b.tr==='slide'){const e=ioc(p);ctx.save();ctx.translate(-e*w*.3,0);drawSeg(a,t-a.start,1);ctx.restore();ctx.save();ctx.translate((1-e)*w,0);drawSeg(b,t-b.start,1);ctx.restore()}\\n  else if(b.tr==='flash'||b.tr==='cut'){const q=p<.5?a:b;drawSeg(q,t-q.start,1);if(b.tr==='flash'){ctx.save();ctx.fillStyle='rgba(255,255,255,'+(.9*(1-Math.abs(2*p-1)))+')';ctx.fillRect(0,0,w,h);ctx.restore()}}\\n  else{drawSeg(a,t-a.start,1);drawSeg(b,t-b.start,p)}}\\n if(G.bw){ctx.save();ctx.globalCompositeOperation='saturation';ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.restore()}\\n if(G.grade){ctx.save();ctx.globalCompositeOperation='overlay';let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(0,90,120,.35)');g.addColorStop(1,'rgba(150,70,0,.28)');ctx.fillStyle=G.bw?'rgba(0,0,0,0)':g;ctx.fillRect(0,0,w,h);ctx.restore();\\n  g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.35,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.55)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h)}\\n if(G.fade){const f=Math.min(.7,T.total*.08),a=Math.max(f-t,t-(T.total-f),0)/f;if(a>0){ctx.fillStyle='rgba(0,0,0,'+Math.min(1,a)+')';ctx.fillRect(0,0,w,h)}}}\\nfunction start(){cancelAnimationFrame(S.raf);if(!S.T||S.busy){if(!S.T){ctx.fillStyle='#000';ctx.fillRect(0,0,cv.width,cv.height)}return}\\n const t0=performance.now(),loop=n=>{if(S.busy)return;const L=S.T.total+.8;draw(Math.min(S.T.total,((n-t0)/1000)%L));S.raf=requestAnimationFrame(loop)};S.raf=requestAnimationFrame(loop)}\\n\\n\\n/* ---- built-in music and sound effects (made inside the browser) ---- */\\nlet NB=null;const noiseBuf=A=>NB&&NB.sampleRate===A.sampleRate?NB:(NB=(()=>{const b=A.createBuffer(1,A.sampleRate*2,A.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b})());\\nconst NOTE=m=>440*Math.pow(2,(m-69)/12);\\nfunction tone(A,dst,type,f,t,dur,g,att,lp,nodes){const o=A.createOscillator(),e=A.createGain();o.type=type;o.frequency.value=f;e.gain.setValueAtTime(0.0001,t);e.gain.linearRampToValueAtTime(g,t+att);e.gain.exponentialRampToValueAtTime(.0001,t+dur);\\n if(lp){const q=A.createBiquadFilter();q.type='lowpass';q.frequency.value=lp;o.connect(q);q.connect(e)}else o.connect(e);e.connect(dst);o.start(t);o.stop(t+dur+.05);nodes.push(o)}\\nfunction burst(A,dst,t,dur,type,f0,f1,g,nodes){const n=A.createBufferSource(),q=A.createBiquadFilter(),e=A.createGain();n.buffer=noiseBuf(A);q.type=type;q.frequency.setValueAtTime(f0,t);q.frequency.exponentialRampToValueAtTime(f1,t+dur);\\n e.gain.setValueAtTime(.0001,t);e.gain.exponentialRampToValueAtTime(g,t+dur*.4);e.gain.exponentialRampToValueAtTime(.0001,t+dur);n.connect(q);q.connect(e);e.connect(dst);n.start(t);n.stop(t+dur+.05);nodes.push(n)}\\nfunction thumpAt(A,dst,t,g,len,nodes){const o=A.createOscillator(),e=A.createGain();o.type='sine';o.frequency.setValueAtTime(len>.5?110:75,t);o.frequency.exponentialRampToValueAtTime(30,t+len);e.gain.setValueAtTime(g,t);e.gain.exponentialRampToValueAtTime(.0001,t+len);o.connect(e);e.connect(dst);o.start(t);o.stop(t+len+.05);nodes.push(o)}\\nfunction makeScore(A,dest,mood,total,t0,vol,nodes){\\n const sr=A.sampleRate,master=A.createGain();master.gain.setValueAtTime(0,t0);master.gain.linearRampToValueAtTime(vol,t0+2);master.gain.setValueAtTime(vol,t0+Math.max(2,total-2.5));master.gain.linearRampToValueAtTime(0,t0+total);master.connect(dest);\\n const rv=A.createConvolver(),ib=A.createBuffer(2,sr*2,sr);for(let c=0;c<2;c++){const d=ib.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.5)}rv.buffer=ib;\\n const wet=A.createGain();wet.gain.value=.4;rv.connect(wet);wet.connect(master);const out=A.createGain();out.connect(master);out.connect(rv);\\n const minor=mood==='emotional'||mood==='cinematic',prog=minor?[[57,60,64],[53,57,60],[60,64,67],[55,59,62]]:[[60,64,67],[67,71,74],[69,72,76],[65,69,72]];\\n const bpm={emotional:70,cinematic:84,upbeat:112,calm:60}[mood],beat=60/bpm;let next=t0+.1,b=0;\\n const step=(b,t)=>{const ch=prog[Math.floor(b/8)%4],pos=b%8,root=ch[0],prog01=(t-t0)/total;\\n  if(mood==='emotional'){if(pos===0){ch.forEach(m=>{tone(A,out,'sine',NOTE(m),t,beat*8,.07,1.2,900,nodes);tone(A,out,'triangle',NOTE(m),t,beat*8,.04,1.2,900,nodes)});tone(A,out,'sine',NOTE(root-12),t,beat*4,.22,.05,0,nodes)}\\n   if(pos%2===0){const m=ch[[0,1,2,1][(pos/2)|0]]+12;tone(A,out,'triangle',NOTE(m),t,1.6,.2,.006,2200,nodes)}}\\n  else if(mood==='cinematic'){if(pos===0){ch.forEach(m=>tone(A,out,'sawtooth',NOTE(m-12),t,beat*8,.05,1.6,260+700*prog01,nodes));tone(A,out,'sine',NOTE(root-24),t,beat*6,.34,.1,0,nodes)}\\n   if(pos%4===0&&prog01>.12)thumpAt(A,out,t,.5,.28,nodes);if(pos===4&&prog01>.3)tone(A,out,'triangle',NOTE(ch[2]+12),t,beat*3,.08,.8,1800,nodes)}\\n  else if(mood==='upbeat'){if(pos%2===0)thumpAt(A,out,t,.55,.2,nodes);else burst(A,out,t,.06,'highpass',6000,9000,.1,nodes);\\n   if([0,3,4,6].includes(pos))tone(A,out,'sawtooth',NOTE(root-12),t,beat*.9,.16,.01,420,nodes);if(pos===2||pos===6)ch.forEach(m=>tone(A,out,'triangle',NOTE(m),t,beat*.8,.07,.01,2500,nodes))}\\n  else{if(pos===0)ch.forEach(m=>{tone(A,out,'sine',NOTE(m),t,beat*8,.08,1.8,800,nodes);tone(A,out,'triangle',NOTE(m+12),t,beat*8,.025,1.8,900,nodes)});\\n   if(pos===0||pos===5)tone(A,out,'sine',NOTE(ch[(pos+1)%3]+24),t,2.2,.07,.01,0,nodes)}};\\n const iv=setInterval(()=>{while(next<A.currentTime+1.2&&next<t0+total){step(b,next);next+=beat/2;b++}},200);\\n return{stop(){clearInterval(iv)}}}\\nfunction sfxPlan(A,dest,mood,T,t0,g,nodes){const bus=A.createGain();bus.gain.value=g;bus.connect(dest);const big=mood==='cinematic'||mood==='upbeat';\\n if(big)thumpAt(A,bus,t0+.15,.9,1.1,nodes);\\n T.segs.forEach((sg,i)=>{if(!i)return;const t=t0+sg.start;burst(A,bus,t-.25,.5,'bandpass',350,3500,.5,nodes);if(big&&i%2===1)thumpAt(A,bus,t,.6,.35,nodes)});\\n if(big){burst(A,bus,t0+T.total-2.6,2.2,'bandpass',200,5000,.35,nodes);thumpAt(A,bus,t0+T.total-.9,1,1.4,nodes)}}\\n\\nlet PV=null;\\n$('#prev').onclick=async()=>{\\n if(PV){PV.stop();return}\\n if(!S.G)build();const G=S.G;if(S.music)return msg('You added your own music, so the built-in music is not used. Remove yours to preview the built-in one.',1);\\n if(G.nomusic&&G.nosfx)return msg('Your prompt says no music and no sound effects.',1);\\n try{const A=ac();if(A.state==='suspended')await A.resume();const nodes=[],t0=A.currentTime+.1,total=14;let ctl=null;\\n  if(!G.nomusic)ctl=makeScore(A,A.destination,G.mood,total,t0,.5,nodes);\\n  if(!G.nosfx)sfxPlan(A,A.destination,G.mood,{total,segs:[{start:0},{start:5},{start:10}]},t0,.6,nodes);\\n  const end=setTimeout(()=>PV&&PV.stop(),total*1000+300);\\n  PV={stop(){clearTimeout(end);ctl&&ctl.stop();nodes.forEach(n=>{try{n.stop()}catch(e){}});PV=null;$('#prev').textContent='Preview built-in sound';msg('')}};\\n  $('#prev').textContent='Stop preview';msg('Playing the '+(G.nomusic?'sound effects':G.mood+' music')+' preview (14 s). Change the mood by writing emotional, epic, upbeat or calm in the prompt.')}\\n catch(e){msg('Could not play sound: '+(e.message||e),1)}};\\n\\n/* ---- export ---- */\\nfunction pickMime(){const c=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];return window.MediaRecorder&&c.find(t=>MediaRecorder.isTypeSupported(t))||''}\\n$('#go').onclick=async()=>{\\n if(S.busy){S.cancel=true;return}\\n if(!S.items.length)return msg('Add at least one picture.',1);\\n if(S.micRec)return msg('Stop the voice recording first.',1);\\n const mime=pickMime();if(!mime)return msg('This browser cannot record video. Try Chrome, Edge or Safari 14.1 or newer.',1);\\n update();const T=S.T,chunks=[];let nodes=[],scoreCtl=null;\\n S.busy=true;notifyBusy();S.cancel=false;cancelAnimationFrame(S.raf);$('#go').textContent='Cancel';$('#barw').hidden=false;$('#bar').style.width='0';$('#out').innerHTML='';\\n if(S.outUrl){URL.revokeObjectURL(S.outUrl);S.outUrl=null}\\n try{const A=ac();if(A.state==='suspended')await A.resume();const dest=A.createMediaStreamDestination(),now=A.currentTime+.15;\\n  const G=S.G,builtin=!S.music&&!G.nomusic,sfxOn=!G.nosfx,useAudio=!!(S.music||S.voice||builtin||sfxOn);\\n  if(S.music){const s=A.createBufferSource(),g=A.createGain();s.buffer=S.music.buf;s.loop=true;const vol=S.voice?.16:.45;g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(vol,now+1.5);g.gain.setValueAtTime(vol,now+Math.max(1.5,T.total-2));g.gain.linearRampToValueAtTime(0,now+T.total);s.connect(g);g.connect(dest);s.start(now);nodes.push(s)}\\n  else if(builtin)scoreCtl=makeScore(A,dest,G.mood,T.total,now,S.voice?.2:.5,nodes);\\n  if(sfxOn)sfxPlan(A,dest,G.mood,T,now,S.voice?.35:.6,nodes);\\n  if(S.voice){const s=A.createBufferSource(),g=A.createGain();s.buffer=S.voice.buf;g.gain.value=1;s.connect(g);g.connect(dest);s.start(now+.3);nodes.push(s)}\\n  const vs=cv.captureStream(30),tracks=[...vs.getVideoTracks(),...(useAudio?dest.stream.getAudioTracks():[])],st=new MediaStream(tracks),\\n   rec=new MediaRecorder(st,{mimeType:mime,videoBitsPerSecond:cv.width>1000?8e6:5e6});\\n  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};\\n  const done=new Promise((res,rej)=>{rec.onstop=res;rec.onerror=e=>rej(e.error||new Error('Recording failed'))});\\n  msg('Creating video… keep this screen on.');draw(0);rec.start(500);const t0=performance.now()+150;\\n  await new Promise(r=>{const loop=n=>{const t=(n-t0)/1000;if(S.cancel||t>=T.total){r();return}draw(Math.max(0,t));$('#bar').style.width=Math.max(0,t/T.total*100)+'%';requestAnimationFrame(loop)};requestAnimationFrame(loop)});\\n  draw(T.total);await new Promise(r=>setTimeout(r,150));rec.stop();await done;scoreCtl&&scoreCtl.stop();nodes.forEach(n=>{try{n.stop()}catch(e){}});st.getTracks().forEach(t=>t.stop());\\n  if(S.cancel)msg('Cancelled.');else{const ext=mime.includes('mp4')?'mp4':'webm',blob=new Blob(chunks,{type:mime.split(';')[0]});\\n   S.outUrl=URL.createObjectURL(blob);$('#bar').style.width='100%';msg('Done. '+(blob.size/1048576).toFixed(1)+' MB, '+ext.toUpperCase()+'.');\\n   $('#out').innerHTML='<a class=\\\"dl\\\" download=\\\"animated-pictures.'+ext+'\\\" href=\\\"'+S.outUrl+'\\\">Save video</a>'}\\n }catch(e){scoreCtl&&scoreCtl.stop();nodes.forEach(n=>{try{n.stop()}catch(x){}});msg('Export failed: '+(e.message||e)+'. Try fewer pictures or a shorter video.',1)}\\n S.busy=false;notifyBusy();$('#go').textContent='Create and save video';$('#barw').hidden=true;start()};\\nwindow.addEventListener('beforeunload',()=>{if(S.outUrl)URL.revokeObjectURL(S.outUrl)});\\nfunction notifyBusy(){try{parent.postMessage({ia:'busy',v:!!(S.busy||S.micRec||S.extracting)},'*')}catch(e){}}\\naddEventListener('message',e=>{const d=e.data||{};if(d.ia==='theme'){if(d.v)document.documentElement.dataset.theme=d.v;else delete document.documentElement.dataset.theme}});\\ntry{new ResizeObserver(()=>{try{parent.postMessage({ia:'h',v:document.documentElement.scrollHeight},'*')}catch(e){}}).observe(document.body)}catch(e){}\\nupdate();\\n</script>\\n\\n</body>\\n</html>\\n\"");
// box = where the iframe goes, note = message line; fr = the iframe, iaBusy = the animator is working, onIa = the animator is open.
const box=document.getElementById('iaBox'),note=document.getElementById('iaNote');let fr=null,iaBusy=false,onIa=false;
// Tell the animator which theme (light / dark) is active.
function sendTheme(){try{fr&&fr.contentWindow.postMessage({ia:'theme',v:document.documentElement.dataset.theme||''},'*')}catch(e){}}
// Create the iframe once and fill it with IA_HTML.
function mount(){if(fr)return;fr=document.createElement('iframe');fr.title='Image Animator';fr.setAttribute('allow','microphone; autoplay');fr.style.cssText='width:100%;border:0;min-height:900px;display:block;background:transparent';fr.onload=sendTheme;fr.srcdoc=IA_HTML;box.append(fr)}
// Send the theme again whenever it changes.
new MutationObserver(sendTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
// Messages from the animator: its busy state and its height.
addEventListener('message',e=>{if(!fr||e.source!==fr.contentWindow)return;const d=e.data||{};if(d.ia==='busy')iaBusy=!!d.v;else if(d.ia==='h')fr.style.height=Math.max(700,+d.v+8)+'px'});
// Show the animator when the address is #animator; refuse to leave while it is busy.
function route(){const h=location.hash.replace('#','');
 if(h==='animator'){onIa=true;document.body.classList.add('solo');document.body.dataset.tool='animator';document.title='Image Animator – ClipForge Studio';note.textContent='';mount();window.scrollTo(0,0)}
 else if(onIa){if(iaBusy){location.hash='#animator';return}onIa=false}}
// Block other links while the animator is busy and show a message.
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href^="#"]');if(a&&onIa&&iaBusy&&a.getAttribute('href')!=='#animator'){e.preventDefault();note.textContent='Image Animator is working. Wait for it to finish (or press Cancel inside it) before leaving this page.'}},true);
// Run on every hash change and once now.
addEventListener('hashchange',route);route();
})();

;

/* ===========================================================================
   14. VIDEO REVERSER (separate small tool, #reverse)
   Rebuilds a video backwards, frame by frame, with WebCodecs and writes an MP4.
   It does not use any of the Shorts / Trailer code, so it cannot affect them.
     1. Load the chosen video and its sound
     2. Find a video encoder that works on this device (H.264, else VP9)
     3. For every output frame: jump to that moment of the source (starting at
        the END), draw it on a canvas and send it to the encoder
     4. Reverse the sound samples and encode them (AAC, else Opus)
     5. Mux everything into an MP4 (mp4-muxer, loaded from a CDN) and show it
   =========================================================================== */
(function(){
'use strict';
const $=s=>document.querySelector(s);
const E={file:$('#rvFile'),drop:$('#rvDrop'),work:$('#rvWork'),src:$('#rvSrc'),est:$('#rvEst'),go:$('#rvGo'),stop:$('#rvStop'),bar:$('#rvBar'),
  msg:$('#rvMsg'),out:$('#rvOut'),res:$('#rvRes'),save:$('#rvSave'),back:$('#rvBack')};
if(!E.file)return;
// O = chosen options (the frame rate is not an option: the result keeps the frame rate of your video); file / url = the source video; busy / cancel = running state.
const O={sound:'rev',size:'1080'};
let file=null,url=null,outUrl=null,busy=false,cancel=false,outName='video_reversed.mp4';
const say=t=>{E.msg.textContent=t||''};
const prog=p=>{E.bar.firstElementChild.style.width=(Math.max(0,Math.min(1,p))*100)+'%'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mmss=t=>{t=Math.max(0,Math.round(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
// This tool needs WebCodecs (Chrome, Edge, recent Safari / Firefox).
const CAN=!!(window.VideoEncoder&&window.VideoFrame);
if(!CAN){E.go.disabled=true;say('This browser cannot build video files for this tool. Please use Chrome or Edge.')}

// ---- option chips (sound / size)
[['#rvSound','sound'],['#rvSize','size']].forEach(([id,k])=>{
  $(id).addEventListener('click',e=>{const b=e.target.closest('button[data-v]');if(!b||busy)return;O[k]=b.dataset.v;
    [...$(id).children].forEach(c=>c.classList.toggle('on',c===b));estimate()})});

// Show how many frames will be rebuilt and a warning for long videos.
function estimate(){const d=E.src.duration;if(!isFinite(d)||!d){E.est.textContent='';return}
  E.est.textContent=mmss(d)+' long. The result keeps the frame rate of your video. Every frame is rebuilt one by one, so expect several times the video length. Keep this tab open and visible.'+(d>600?' This video is long: consider reversing a shorter part.':'')}

// ---- loading a video
function load(f){if(!f||busy)return;
  if(!/^video\//.test(f.type)&&!/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)){say('Please choose a video file.');return}
  file=f;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(f);
  if(outUrl){URL.revokeObjectURL(outUrl);outUrl=null}
  E.out.classList.add('hide');E.res.removeAttribute('src');
  outName=f.name.replace(/\.[^.]+$/,'')+'_reversed.mp4';
  E.src.onloadedmetadata=estimate;
  E.src.onerror=()=>say('This browser cannot play that video format. Convert it to H.264 MP4 and try again.');
  E.src.src=url;if(CAN)say('');E.work.classList.remove('hide')}
E.file.addEventListener('change',()=>load(E.file.files[0]));
['dragover','drop'].forEach(ev=>E.drop.addEventListener(ev,e=>{e.preventDefault();if(ev==='drop')load(e.dataTransfer.files[0])}));

// H.264 level that fits the picture size and frame rate (macroblocks per second).
function level(w,h,fps){const mb=Math.ceil(w/16)*Math.ceil(h/16)*Math.ceil(fps);
  return mb<=108000?'1f':mb<=245760?'28':mb<=522240?'2a':mb<=589824?'32':'33'}

// Measure the frame rate of the video: play it silently for about a second and look at the time between two shown frames.
// The result is matched to a common value (23.976, 24, 25, 29.97, 30, 50, 59.94, 60). If it cannot be measured, 30 is used.
async function detectFps(v){
  if(!('requestVideoFrameCallback' in v))return 30;
  const times=[];
  await new Promise(res=>{
    const to=setTimeout(res,2500);
    const cb=(now,md)=>{times.push(md.mediaTime);if(times.length>=24){clearTimeout(to);res()}else v.requestVideoFrameCallback(cb)};
    v.requestVideoFrameCallback(cb);
    v.play().catch(()=>{clearTimeout(to);res()})});
  try{v.pause()}catch(e){}
  const d=[];for(let i=1;i<times.length;i++){const x=times[i]-times[i-1];if(x>.004&&x<.2)d.push(x)}
  if(d.length<5)return 30;
  d.sort((a,b)=>a-b);const f=1/d[Math.floor(d.length/2)];      // the middle value ignores a few skipped frames
  let best=null;for(const c of [24000/1001,24,25,30000/1001,30,48,50,60000/1001,60])if(Math.abs(f-c)/c<.04&&(!best||Math.abs(f-c)<Math.abs(f-best)))best=c;
  return best||Math.max(15,Math.min(60,Math.round(f)))}

// ---- the reversing job
async function run(){
  if(busy||!file||!CAN)return;
  busy=true;cancel=false;
  E.go.classList.add('hide');E.stop.classList.remove('hide');E.bar.classList.remove('hide');E.out.classList.add('hide');prog(0);
  let pv=null,ve=null,ae=null,wl=null,encErr=null;const notes=[];
  try{
    try{wl=await navigator.wakeLock.request('screen')}catch(e){}
    const dur=E.src.duration;
    if(!isFinite(dur)||dur<=0)throw new Error('Could not read the length of this video.');
    // Output size: keep the picture shape, limit the long side, use even numbers.
    let w=E.src.videoWidth,h=E.src.videoHeight;
    if(O.size!=='orig'){const lim=O.size==='1080'?1920:1280,m=Math.max(w,h);if(m>lim){const k=lim/m;w=Math.round(w*k);h=Math.round(h*k)}}
    w&=~1;h&=~1;
    if(w<16||h<16)throw new Error('The video picture is too small.');

    // 1. MP4 library
    say('Loading the MP4 library…');
    const M=await Promise.race([import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs'),
      sleep(60000).then(()=>{throw new Error('The MP4 library could not be downloaded. Check your internet connection.')})]);
    if(cancel)throw new Error('Stopped');

    // 2. Sound: decode it, then reverse it later (needs AudioEncoder).
    let abuf=null,sr=48000,nch=2,ac='mp4a.40.2',am='aac';
    if(O.sound==='rev'){
      if(!(window.AudioEncoder&&window.AudioData))notes.push('This browser cannot encode sound, so the result has no sound.');
      else{say('Reading the sound…');
        try{const AC=window.AudioContext||window.webkitAudioContext;let cx;try{cx=new AC({sampleRate:48000})}catch(e){cx=new AC()}
          abuf=await cx.decodeAudioData(await file.arrayBuffer());try{cx.close()}catch(e){}
          sr=abuf.sampleRate;nch=Math.min(2,abuf.numberOfChannels);
          if(!(await AudioEncoder.isConfigSupported({codec:ac,sampleRate:sr,numberOfChannels:nch,bitrate:128000})).supported){
            ac='opus';am='opus';
            if(!(await AudioEncoder.isConfigSupported({codec:ac,sampleRate:sr,numberOfChannels:nch,bitrate:128000})).supported)throw new Error('no audio codec')}
        }catch(e){abuf=null;notes.push('The sound could not be read, so the result has no sound.')}}}
    if(cancel)throw new Error('Stopped');

    // 2b. A second, hidden player does the seeking so the visible one is never disturbed. It also tells us the frame rate.
    say('Opening the video…');
    pv=document.createElement('video');pv.muted=true;pv.playsInline=true;pv.preload='auto';pv.src=url;
    await new Promise((res,rej)=>{if(pv.readyState>=2)return res();
      const to=setTimeout(()=>rej(new Error('The video could not be opened for processing.')),20000);
      pv.addEventListener('loadeddata',()=>{clearTimeout(to);res()},{once:true});
      pv.addEventListener('error',()=>{clearTimeout(to);rej(new Error('This browser cannot decode that video.'))},{once:true})});
    const fps=await detectFps(pv);          // the result keeps the frame rate of the source video
    if(cancel)throw new Error('Stopped');

    // 3. Find a video encoder that really works here (same test the recorder in Shorts uses).
    say('Preparing the video encoder…');
    const br=Math.min(20e6,Math.max(1.5e6,Math.round(w*h*fps*0.09)));
    let vc=null,vm='avc',vhw='no-preference';
    const probe=async cfg=>{try{if(!(await VideoEncoder.isConfigSupported(cfg)).supported)return false;let got=0,bad=false;
      const e=new VideoEncoder({output:()=>{got++},error:()=>{bad=true}});e.configure(cfg);
      const pc=document.createElement('canvas');pc.width=cfg.width;pc.height=cfg.height;const px=pc.getContext('2d');
      for(let i=0;i<4;i++){px.fillStyle=i%2?'#445':'#a63';px.fillRect(0,0,pc.width,pc.height);const f=new VideoFrame(pc,{timestamp:i*33333});e.encode(f,{keyFrame:i===0});f.close()}
      try{await Promise.race([e.flush(),sleep(5000).then(()=>{throw new Error('timeout')})])}catch(x){bad=true}
      try{e.close()}catch(x){}return got>0&&!bad}catch(x){return false}};
    const lv=level(w,h,fps);
    find:for(const pr of ['64','4d','42'])for(const hw of ['no-preference','prefer-software','prefer-hardware']){
      const cfg={codec:'avc1.'+pr+'00'+lv,width:w,height:h,bitrate:br,framerate:fps,hardwareAcceleration:hw};
      if(await probe(cfg)){vc=cfg.codec;vhw=hw;break find}}
    if(!vc){const cfg={codec:'vp09.00.40.08',width:w,height:h,bitrate:br,framerate:fps};if(await probe(cfg)){vc=cfg.codec;vm='vp9';vhw='no-preference'}}
    if(!vc)throw new Error('This device could not start a video encoder at '+w+'×'+h+'. Choose "Up to 720p", or use Chrome or Edge on a computer.');
    if(cancel)throw new Error('Stopped');

    // 4. Muxer and encoders
    const tg=new M.ArrayBufferTarget();
    const mo={target:tg,video:{codec:vm,width:w,height:h,frameRate:fps},fastStart:'in-memory'};
    if(abuf)mo.audio={codec:am,numberOfChannels:nch,sampleRate:sr};
    const mux=new M.Muxer(mo);
    ve=new VideoEncoder({output:(c,m)=>mux.addVideoChunk(c,m),error:e=>{encErr=e}});
    ve.configure({codec:vc,width:w,height:h,bitrate:br,framerate:fps,hardwareAcceleration:vhw});
    if(abuf){ae=new AudioEncoder({output:(c,m)=>mux.addAudioChunk(c,m),error:e=>{encErr=e}});
      ae.configure({codec:ac,sampleRate:sr,numberOfChannels:nch,bitrate:128000})}

    // 5. The hidden player opened above does the seeking, so the visible one is never disturbed.
    // Jump to time t and wait for the picture (continues after 8 s so one slow jump cannot hang the job).
    const seekTo=t=>new Promise(res=>{let done=false;const fin=()=>{if(done)return;done=true;clearTimeout(to);pv.removeEventListener('seeked',fin);res()};
      const to=setTimeout(fin,8000);pv.addEventListener('seeked',fin);pv.currentTime=t});
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const cx=cv.getContext('2d',{alpha:false});

    // 6. Frames, from the last one to the first one
    const N=Math.max(1,Math.floor(dur*fps)),t0=performance.now(),kf=Math.max(1,Math.round(fps*2));
    for(let i=0;i<N;i++){
      if(cancel)throw new Error('Stopped');
      if(encErr)throw encErr;
      const T=Math.max(0,Math.min(dur-.001,dur-(i+.5)/fps));      // output frame i shows this moment of the source
      await seekTo(T);
      cx.drawImage(pv,0,0,w,h);
      const f=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
      ve.encode(f,{keyFrame:i%kf===0});f.close();
      while(ve.encodeQueueSize>6){await sleep(4);if(cancel)throw new Error('Stopped')}
      if(i%4===0){prog(i/N*(abuf?.92:.97));
        const left=(performance.now()-t0)/(i+1)*(N-i-1)/1000;say('Frame '+(i+1)+' of '+N+(i>8?' · about '+mmss(left)+' left':'')+'. Keep this tab open.')}}

    // 7. Sound: flip every channel and encode it in 0.1 s pieces
    if(abuf){say('Reversing the sound…');prog(.93);
      const ch=[];for(let c=0;c<nch;c++){const d=abuf.getChannelData(c);d.reverse();ch.push(d)}
      const total=ch[0].length,CH=Math.round(sr/10);
      for(let p=0;p<total;p+=CH){
        if(cancel)throw new Error('Stopped');if(encErr)throw encErr;
        const n=Math.min(CH,total-p),data=new Float32Array(n*nch);
        for(let c=0;c<nch;c++)data.set(ch[c].subarray(p,p+n),c*n);
        const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:nch,timestamp:Math.round(p*1e6/sr),data});
        ae.encode(ad);ad.close();
        while(ae.encodeQueueSize>20){await sleep(2)}}}

    // 8. Finish the file
    say('Finishing the file…');prog(.97);
    await ve.flush();if(ae)await ae.flush();
    if(encErr)throw encErr;
    mux.finalize();
    const blob=new Blob([tg.buffer],{type:'video/mp4'});
    if(blob.size<2000)throw new Error('The reversed file came out empty. Try "Up to 720p".');
    outUrl=URL.createObjectURL(blob);E.res.src=outUrl;E.out.classList.remove('hide');prog(1);
    say('Done: '+mmss(N/fps)+' reversed video, '+(blob.size/1048576).toFixed(1)+' MB.'+(notes.length?' '+notes.join(' '):''));
  }catch(e){
    say(e&&e.message==='Stopped'?'Stopped.':'Could not reverse this video: '+((e&&e.message)||e));
  }finally{
    try{ve&&ve.state!=='closed'&&ve.close()}catch(e){}
    try{ae&&ae.state!=='closed'&&ae.close()}catch(e){}
    if(pv){try{pv.removeAttribute('src');pv.load()}catch(e){}}
    try{wl&&wl.release()}catch(e){}
    busy=false;E.go.classList.remove('hide');E.stop.classList.add('hide');E.bar.classList.add('hide');
  }
}
E.go.addEventListener('click',run);
E.stop.addEventListener('click',()=>{cancel=true});
// Save button: download the reversed MP4.
E.save.addEventListener('click',()=>{if(!outUrl)return;const a=document.createElement('a');a.href=outUrl;a.download=outName;document.body.append(a);a.click();a.remove()});
// Do not leave this tool by accident while it is working.
E.back.addEventListener('click',e=>{if(busy){e.preventDefault();say('Stop the current job first, then go back.')}});

// ---- routing: show this tool when the address is #reverse
let onRv=false;
function route(){const h=location.hash.replace('#','');
  if(h==='reverse'){onRv=true;document.body.classList.add('solo');document.body.dataset.tool='reverse';document.title='Reverse Video – ClipForge Studio';window.scrollTo(0,0)}
  else if(onRv){if(busy){location.hash='#reverse';return}onRv=false}}
addEventListener('hashchange',route);route();
})();


/* ===== merged from clipforge-v2.js ===== */
/* ClipForge V2 — Vexolune Technologies. No project persistence. */
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=(msg)=>{const t=$('#toast');if(t){t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',6500)}};
const brand=$('header .brand');
if(brand)brand.innerHTML='<svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true"><defs><linearGradient id="cfmark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8b7cff"/><stop offset="1" stop-color="#4dd8e8"/></linearGradient></defs><rect x="1" y="1" width="34" height="34" rx="11" fill="url(#cfmark)"/><path d="M14 10.5 26 18l-12 7.5z" fill="#fff"/></svg><span>ClipForge<small style="display:block;font-size:9px;letter-spacing:.12em;color:var(--muted);font-weight:700;text-transform:uppercase">by Vexolune Technologies</small></span>';
const hero=$('.hero');
if(hero&&!hero.querySelector('.hero-copy')){hero.innerHTML='<h1>Make every frame count.</h1><p>One creative workspace for shorts, trailers, animated visuals and professional video edits. Built by Vexolune Technologies.</p>'}
const oldCards=$$('.toolcard');
oldCards.forEach(a=>{
 const h=a.querySelector('h3');
 if(h&&/Image Animator/i.test(h.textContent)){
  a.innerHTML='<span class="ttag">IMAGE TO VIDEO · AI MOTION</span><h3>Picture to Video</h3><p>Turn your still photos into a smooth, animated video in your browser.</p><ul><li>Combine multiple pictures into one sequence</li><li>Create cinematic zooms, pans and camera moves</li><li>Choose 9:16, 16:9 or square video format</li><li>Add music, sound effects or your own voiceover</li><li>Preview and export as MP4 or WebM</li><li>Your pictures stay on your device</li></ul><span class="go">Open workspace ↗</span>';
 }
 if(h&&/Long Video/i.test(h.textContent))h.textContent='AI Shorts Maker';
});
const cardGrid=$('.tools');
if(cardGrid){
 const add=(href,tag,title,desc,bullets)=>{if(cardGrid.querySelector('a.toolcard[href="'+href+'"]'))return;const a=document.createElement('a');a.className='card toolcard';a.href=href;a.innerHTML='<span class="ttag">'+tag+'</span><h3>'+title+'</h3><p>'+desc+'</p><ul>'+bullets.map(x=>'<li>'+x+'</li>').join('')+'</ul><span class="go">Open workspace ↗</span>';cardGrid.append(a)};
 add('#montage','MULTI-CLIP WORKFLOW','Video Montage Maker','Combine multiple clips into one polished sequence.',['Add and reorder multiple videos','Trim each clip independently','Choose aspect ratio and fade transitions','Add a music track and title overlay','Preview and export a single video']);
 add('#editor','MULTI-TRACK STARTER','Editor','A practical browser-based editing workspace for everyday video production.',['Import multiple video clips','Trim, split, reorder and remove clips','Set canvas ratio, visual look and title text','Add a music bed and export the timeline','No project saving — export your finished edit']);
}
const footerCopy=$('.copy');
if(footerCopy){footerCopy.innerHTML='<span>© '+new Date().getFullYear()+' ClipForge Studio. A Vexolune Technologies product.</span><span>Temporary browser sessions · Your media stays on your device</span>'}
const how=$('#how');if(how){const p=how.querySelector('.grid');if(p&&p.children[0])p.children[0].querySelector('p').textContent='Choose a creative tool and import media directly from your device.';if(p&&p.children[1])p.children[1].querySelector('p').textContent='Configure the workflow, review your edit and adjust the details.';if(p&&p.children[2])p.children[2].querySelector('p').textContent='Render in your browser, preview the result and download it.'}
const featureCards=$$('#features .card');
if(featureCards[3]){featureCards[3].querySelector('h3').textContent='Private, temporary sessions';featureCards[3].querySelector('p').textContent='Media is processed in your browser. ClipForge does not keep a project library or save your editing sessions.'}
/* Remove the old local project restore system. Theme preference remains separate. */
try{localStorage.removeItem('cf_projects')}catch(e){}
if(typeof window.projSave==='function')window.projSave=function(){};
if(typeof window.projOffer==='function')window.projOffer=function(){};
const addWorkspace=(id,html)=>{let el=document.getElementById(id);if(!el){el=document.createElement('section');el.id=id;el.className='cf-workspace';el.style.display='none';const home=$('.wrap');const tools=$('#tools');if(home&&tools&&tools.parentNode===home)tools.insertAdjacentElement('afterend',el);else if(home)home.append(el);else document.body.append(el)}el.innerHTML=html;return el};
const shell=(title,desc,tag)=>'<a class="cf-back" href="#tools">← All creative tools</a><div class="cf-page-head"><div><div class="cf-kicker">'+tag+'</div><h2>'+title+'</h2><p>'+desc+'</p></div><span class="cf-badge">● Local browser session</span></div>';
const montageHTML=shell('Video Montage Maker','Bring multiple clips together, refine the order and create a clean montage with optional music and title text.','CLIPFORGE / MONTAGE')+
'<div class="cf-grid"><div class="cf-panel"><div class="cf-field"><label>ADD VIDEO CLIPS</label><input id="vmFiles" type="file" accept="video/*" multiple></div><div id="vmEmpty" class="cf-empty">Choose two or more video clips to start your montage.</div><div id="vmTimeline" class="cf-timeline"></div><video id="vmPreview" class="cf-preview" controls playsinline></video><div class="cf-row" style="margin-top:12px"><button class="sm" id="vmPreviewBtn">Preview selected clip</button><button class="sm" id="vmClear">Clear clips</button></div></div><div class="cf-panel"><div class="cf-kicker">OUTPUT SETTINGS</div><div class="cf-field"><label>VIDEO FORMAT</label><select id="vmRatio"><option value="9:16">9:16 · Reels / Shorts</option><option value="16:9" selected>16:9 · YouTube</option><option value="1:1">1:1 · Square</option></select></div><div class="cf-field"><label>TRANSITION</label><select id="vmTransition"><option value="fade">Fade between clips</option><option value="cut">Straight cuts</option></select></div><div class="cf-field"><label>VIDEO TITLE (OPTIONAL)</label><input id="vmTitle" maxlength="90" placeholder="Your montage title"></div><div class="cf-field"><label>BACKGROUND MUSIC (OPTIONAL)</label><input id="vmMusic" type="file" accept="audio/*"></div><div class="cf-field"><label>CAPTIONS (OPTIONAL · SRT / VTT)</label><input id="vmCaptions" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip"><select id="vmCaptionStyle"><option value="classic">Classic</option><option value="box">Box</option><option value="news">News bar</option><option value="minimal">Minimal</option></select><button class="sm" id="vmCaptionClear" type="button">No captions / Clear</button><small id="vmCaptionStatus" class="cf-muted">No captions added. Export remains unchanged.</small></div><div class="cf-stat"><b id="vmCount">0 clips</b><span id="vmDuration">Add media to calculate duration</span></div><button class="main" id="vmExport">Render montage</button><button class="sm" id="vmStop" style="display:none;margin-top:8px">Stop rendering</button><div class="cf-progress"><i id="vmProgress"></i></div><div id="vmStatus" class="cf-status" role="status"></div><div id="vmOutput" class="cf-output"></div></div></div>';
const editorHTML='<div class="cf-studio-topbar"><a class="cf-studio-brand" href="#top" aria-label="Back to ClipForge home"><span class="cf-studio-mark">▶</span><span>CLIPFORGE <b>STUDIO</b></span></a><span class="cf-studio-mode">VIDEO EDITOR</span><a class="cf-studio-exit" href="#top">← Exit Studio</a></div>'+shell('Editor','A focused editing workspace with a clip timeline, trim controls, split and reorder tools, visual treatments, titles and export.','CLIPFORGE / EDITOR')+
'<div class="cf-panel"><div class="cf-row cf-toolbar"><label class="sm" for="edFiles" style="cursor:pointer">＋ Import videos</label><input id="edFiles" type="file" accept="video/*" multiple style="display:none"><button class="sm" id="edSplit">Split selected</button><button class="sm" id="edRemove">Remove selected</button><button class="sm" id="edClear">Clear timeline</button><span class="cf-muted" id="edCount">0 clips</span></div><div id="edEmpty" class="cf-empty" style="margin-top:12px">Import videos to build your editing timeline.</div><div id="edTimeline" class="cf-timeline"></div></div>'+
'<div class="cf-grid"><div class="cf-panel"><video id="edPreview" class="cf-preview" controls playsinline></video><div class="cf-row" style="margin-top:12px"><button class="sm" id="edPlay">Preview selected</button><span class="cf-muted" id="edPreviewInfo">Select a clip to inspect it.</span></div></div><div class="cf-panel"><div class="cf-kicker">CLIP CONTROLS</div><div class="cf-field"><label>TRIM START (SECONDS)</label><input id="edStart" type="number" min="0" step=".1" value="0"></div><div class="cf-field"><label>TRIM END (SECONDS)</label><input id="edEnd" type="number" min="0" step=".1" value="0"></div><button class="sm p" id="edApply">Apply trim</button><div class="cf-field"><label>CANVAS RATIO</label><select id="edRatio"><option value="9:16">9:16 · Vertical</option><option value="16:9" selected>16:9 · Landscape</option><option value="1:1">1:1 · Square</option></select></div><div class="cf-field"><label>VISUAL LOOK</label><select id="edFilter"><option value="none">Original</option><option value="cinema">Cinematic</option><option value="mono">Black &amp; white</option><option value="warm">Warm</option></select></div><div class="cf-field"><label>TITLE / TEXT OVERLAY</label><input id="edTitle" maxlength="100" placeholder="Add a title to your video"></div><div class="cf-field"><label>BACKGROUND MUSIC (OPTIONAL)</label><input id="edMusic" type="file" accept="audio/*"></div><div class="cf-field"><label>CAPTIONS (OPTIONAL · SRT / VTT)</label><input id="edCaptions" type="file" accept=".srt,.vtt,text/vtt,application/x-subrip"><select id="edCaptionStyle"><option value="classic">Classic</option><option value="box">Box</option><option value="news">News bar</option><option value="minimal">Minimal</option></select><button class="sm" id="edCaptionClear" type="button">No captions / Clear</button><small id="edCaptionStatus" class="cf-muted">No captions added. Export remains unchanged.</small></div><div class="cf-stat"><b id="edDuration">0:00</b><span>Timeline duration</span></div><button class="main" id="edExport">Export edited video</button><button class="sm" id="edStop" style="display:none;margin-top:8px">Stop export</button><div class="cf-progress"><i id="edProgress"></i></div><div id="edStatus" class="cf-status" role="status"></div><div id="edOutput" class="cf-output"></div></div></div>'+
'<p class="cf-muted">Note: this first editor release is a browser-rendered single video timeline. Advanced multi-track keyframes and project recovery are not part of this no-save version.</p>';
addWorkspace('vmTool',montageHTML);addWorkspace('editorTool',editorHTML);
const activeWorkspace=()=>['montage','editor'].includes(location.hash.slice(1));
// Routing is owned by the final page router in index.html. Keeping a second
// router here caused competing .solo/data-tool updates on hash navigation.
/* Reusable in-memory timeline engine. Files and exports are never written to storage. */
function mountTimeline(prefix,mode){
 const el=id=>document.getElementById(prefix+id),state={clips:[],selected:0,music:null,captions:[],captionStyle:'classic',busy:false,cancel:false,outUrl:null};
 const isEditor=mode==='editor';
 const ratio=()=>el('Ratio').value;
 const setStatus=t=>{el('Status').textContent=t||''};
 const duration=()=>state.clips.reduce((n,c)=>n+Math.max(.05,c.end-c.start),0);
 const fmt=t=>{t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
 const selected=()=>state.clips[state.selected]||null;
 const revoke=c=>{try{URL.revokeObjectURL(c.url)}catch(e){}};
 const render=()=>{
  const timeline=el('Timeline'),empty=el('Empty');timeline.innerHTML='';
  empty.style.display=state.clips.length?'none':'block';
  state.clips.forEach((c,i)=>{
   const d=document.createElement('div');d.className='cf-clip'+(i===state.selected?' active':'');
   d.innerHTML='<strong>'+esc(c.file.name)+'</strong><small>'+fmt(c.end-c.start)+' · '+c.width+'×'+c.height+'</small>';
   const actions=document.createElement('div');actions.className='cf-clip-actions';
   const btn=(label,fn)=>{const b=document.createElement('button');b.className='sm';b.textContent=label;b.onclick=fn;actions.append(b)};
   btn('Select',()=>{state.selected=i;render();loadPreview()});
   btn('↑',()=>move(i,-1));btn('↓',()=>move(i,1));btn('Remove',()=>remove(i));d.append(actions);timeline.append(d);
  });
  if(isEditor){el('Count').textContent=state.clips.length+' clips';el('Duration').textContent=fmt(duration());}
  else{el('Count').textContent=state.clips.length+' clips';el('Duration').textContent=state.clips.length?fmt(duration())+' total duration':'Add media to calculate duration'}
  const c=selected();
  if(isEditor){el('Start').value=c?c.start.toFixed(1):0;el('End').value=c?c.end.toFixed(1):0;el('Start').max=c?c.duration:0;el('End').max=c?c.duration:0;el('PreviewInfo').textContent=c?c.file.name+' · '+fmt(c.duration)+' source length':'Select a clip to inspect it.'}
 };
 function loadPreview(){
  const c=selected(),v=el('Preview');
  if(!c){v.removeAttribute('src');v.load();return}
  v.src=c.url;v.onloadedmetadata=()=>{v.currentTime=Math.min(c.start,Math.max(0,c.duration-.05))};
  v.onended=()=>{try{v.pause()}catch(e){}};
 }
 function move(i,dir){const j=i+dir;if(j<0||j>=state.clips.length)return;[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];state.selected=j;render();loadPreview()}
 function remove(i){const c=state.clips[i];if(c)revoke(c);state.clips.splice(i,1);state.selected=Math.max(0,Math.min(state.selected,state.clips.length-1));render();loadPreview()}
 async function addFiles(files){
  for(const file of Array.from(files||[])){
   if(!file.type.startsWith('video/'))continue;
   const url=URL.createObjectURL(file),v=document.createElement('video');v.preload='metadata';v.muted=true;v.src=url;
   try{await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('Could not read '+file.name))});
    if(!isFinite(v.duration)||v.duration<=0)throw new Error('Invalid video duration');
    state.clips.push({file,url,duration:v.duration,start:0,end:v.duration,width:v.videoWidth,height:v.videoHeight});
   }catch(e){URL.revokeObjectURL(url);setStatus(e.message)}
  }
  if(state.clips.length)state.selected=state.clips.length-1;
  render();loadPreview();setStatus(state.clips.length+' clips ready. Files remain in this browser session only.');
 }
 const input=el('Files');input.addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
 if(isEditor){
  el('Apply').onclick=()=>{const c=selected();if(!c)return setStatus('Import and select a clip first.');
   const a=Math.max(0,Math.min(c.duration,Number(el('Start').value)||0)),b=Math.max(a+.1,Math.min(c.duration,Number(el('End').value)||c.duration));
   if(b<=a)return setStatus('End time must be after start time.');c.start=a;c.end=b;render();loadPreview();setStatus('Trim applied to '+c.file.name)};
  el('Split').onclick=()=>{const c=selected();if(!c)return setStatus('Select a clip to split.');
   const mid=c.start+(c.end-c.start)/2;if(mid-c.start<.15||c.end-mid<.15)return setStatus('Clip is too short to split.');
   const second={...c,start:mid};c.end=mid;state.clips.splice(state.selected+1,0,second);state.selected++;render();loadPreview();setStatus('Clip split into two editable timeline segments.')};
  el('Remove').onclick=()=>{if(!selected())return;remove(state.selected);setStatus('Selected clip removed.')};
  el('Clear').onclick=clear;
 }else{
  el('Clear').onclick=clear;
  el('PreviewBtn').onclick=()=>{const c=selected(),v=el('Preview');if(!c)return setStatus('Add a clip first.');v.currentTime=c.start;v.play().catch(()=>setStatus('Tap the preview player to start playback.'))};
 }
 function clear(){if(state.busy)return;state.clips.forEach(revoke);state.clips=[];state.selected=0;render();loadPreview();setStatus('Timeline cleared.');}
 const musicInput=el('Music');
 musicInput.addEventListener('change',e=>{const f=e.target.files[0];if(state.music)URL.revokeObjectURL(state.music);state.music=f?URL.createObjectURL(f):null;setStatus(f?'Music track ready.':'Music removed.');e.target.value=''});
 const captionInput=el('Captions'),captionStyleInput=el('CaptionStyle'),captionStatus=el('CaptionStatus'),captionClear=el('CaptionClear');
 const parseSubtitle=source=>{const src=String(source||'').replace(/^\uFEFF/,'').replace(/\r/g,'');const blocks=src.split(/\n\s*\n/);const out=[];const toSec=value=>{const p=value.replace(',','.').split(':');return p.reduce((n,x)=>n*60+Number(x),0)};for(const block of blocks){const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);const ti=lines.findIndex(x=>/(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}/.test(x));if(ti<0)continue;const m=lines[ti].match(/((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})/);if(!m)continue;const start=toSec(m[1]),end=toSec(m[2]),caption=lines.slice(ti+1).join(' ').replace(/<[^>]+>/g,'').trim();if(end>start&&caption)out.push({start,end,text:caption})}return out.sort((a,b)=>a.start-b.start)};
 if(captionInput)captionInput.addEventListener('change',async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;try{const cues=parseSubtitle(await file.text());if(!cues.length)throw new Error('No valid SRT/VTT caption cues were found.');state.captions=cues;if(captionStatus)captionStatus.textContent=cues.length+' caption cues loaded. Times follow the final combined timeline.';setStatus('Captions loaded for export.')}catch(err){state.captions=[];if(captionStatus)captionStatus.textContent=err.message||'Could not read captions.';setStatus(err.message||'Could not read captions.')}e.target.value=''});
 if(captionStyleInput)captionStyleInput.addEventListener('change',()=>{state.captionStyle=captionStyleInput.value||'classic'});
 if(captionClear)captionClear.addEventListener('click',()=>{state.captions=[];if(captionStatus)captionStatus.textContent='No captions added. Export remains unchanged.';setStatus('Captions cleared. Export will have no subtitles.')});
 function dimensions(){
  const r=ratio(),long=isEditor?1080:1080;
  if(r==='9:16')return[720,1280];if(r==='1:1')return[1080,1080];return[1280,720];
 }
 const waitEvent=(target,event,timeout=15000)=>new Promise((res,rej)=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);target.removeEventListener(event,finish);target.removeEventListener('error',bad);res()};const bad=()=>{if(done)return;done=true;clearTimeout(timer);rej(new Error('The selected video could not be decoded.'))};const timer=setTimeout(()=>{if(done)return;done=true;target.removeEventListener(event,finish);target.removeEventListener('error',bad);rej(new Error('Timed out while opening a video.'))},timeout);target.addEventListener(event,finish,{once:true});target.addEventListener('error',bad,{once:true})});
 function drawFrame(ctx,v,w,h,title,filter,alpha,caption){
  ctx.save();ctx.globalAlpha=alpha==null?1:alpha;ctx.fillStyle='#05070d';ctx.fillRect(0,0,w,h);
  const vw=v.videoWidth||w,vh=v.videoHeight||h,scale=Math.max(w/vw,h/vh),dw=vw*scale,dh=vh*scale;
  ctx.filter=filter==='mono'?'grayscale(1)':filter==='warm'?'sepia(.28) saturate(1.2)':filter==='cinema'?'contrast(1.12) saturate(1.08)':'none';
  ctx.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh);ctx.filter='none';
  if(title){const size=Math.max(24,Math.round(w*.042)),y=h*.82;ctx.font='800 '+size+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(4,size*.13);ctx.strokeStyle='rgba(0,0,0,.82)';ctx.fillStyle='#fff';const words=title.split(/\s+/);let lines=[],line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>w*.84&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);lines.slice(0,3).forEach((t,i)=>{const yy=y+(i-(Math.min(3,lines.length)-1)/2)*size*1.2;ctx.strokeText(t,w/2,yy);ctx.fillText(t,w/2,yy)})}
  if(caption){const fs=Math.max(22,Math.round(w*.035)),maxW=w*.86;ctx.save();ctx.globalAlpha=1;ctx.font='700 '+fs+'px "Noto Naskh Arabic","Noto Sans",system-ui,sans-serif';ctx.textAlign=/[\u0600-\u06FF]/.test(caption)?'right':'center';ctx.textBaseline='middle';const words=caption.split(/\s+/),lines=[];let line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);const visible=lines.slice(0,3),lineH=fs*1.28,base=h*.82,boxH=visible.length*lineH+fs*.55,x=ctx.textAlign==='right'?w*.91:w/2;if(state.captionStyle!=='minimal'){ctx.fillStyle=state.captionStyle==='news'?'rgba(12,12,12,.94)':'rgba(0,0,0,.72)';ctx.fillRect(w*.06,base-boxH/2,w*.88,boxH)}ctx.fillStyle=state.captionStyle==='news'?'#f7d34a':'#fff';visible.forEach((t,i)=>{const y=base+(i-(visible.length-1)/2)*lineH;if(state.captionStyle==='classic'||state.captionStyle==='minimal'){ctx.lineWidth=Math.max(3,fs*.12);ctx.strokeStyle='rgba(0,0,0,.9)';ctx.strokeText(t,x,y)}ctx.fillText(t,x,y)});ctx.restore()}
  ctx.restore();
 }
 async function exportTimeline(){
  if(state.busy)return;if(!state.clips.length)return setStatus('Add at least one video clip first.');
  const clips=state.clips.slice();state.busy=true;state.cancel=false;
  const button=el('Export'),stop=el('Stop'),bar=el('Progress'),output=el('Output');button.disabled=true;stop.style.display='inline-block';output.innerHTML='';bar.style.width='0%';
  if(state.outUrl){URL.revokeObjectURL(state.outUrl);state.outUrl=null}
  let recorder=null,stream=null,video=null,audioCtx=null,musicEl=null,raf=0;
  try{
   const [w,h]=dimensions(),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});
   stream=canvas.captureStream(30);
   const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('This browser cannot export video. Try the latest Chrome or Edge.');
   let audioDest=null,source=null;
   try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioDest=audioCtx.createMediaStreamDestination();
    video=document.createElement('video');video.playsInline=true;video.preload='auto';video.muted=false;
    source=audioCtx.createMediaElementSource(video);source.connect(audioDest);source.connect(audioCtx.destination);
    if(state.music){musicEl=new Audio(state.music);musicEl.loop=true;musicEl.crossOrigin='anonymous';const ms=audioCtx.createMediaElementSource(musicEl);const gain=audioCtx.createGain();gain.gain.value=.32;ms.connect(gain);gain.connect(audioDest);await audioCtx.resume();musicEl.play().catch(()=>{});}
    audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
   }catch(e){setStatus('Video audio will be omitted on this browser. Rendering video…')}
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(12000000,w*h*8)});
   const chunks=[];recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
   const finished=new Promise((res,rej)=>{recorder.onstop=res;recorder.onerror=e=>rej(e.error||new Error('Recording failed'))});
   recorder.start(500);
   const total=clips.reduce((n,c)=>n+(c.end-c.start),0),transition=el('Transition')?el('Transition').value:'fade',title=el('Title')?el('Title').value.trim():'',filter=isEditor?el('Filter').value:'none';
   let elapsed=0;const fps=30;
   for(let i=0;i<clips.length;i++){
    if(state.cancel)throw new Error('Export stopped.');
    const c=clips[i];video.src=c.url;video.load();await waitEvent(video,'loadedmetadata');
    const seekTarget=Math.min(c.start,Math.max(0,c.duration-.05));if(Math.abs(video.currentTime-seekTarget)>.04){const seekDone=waitEvent(video,'seeked');video.currentTime=seekTarget;await seekDone;}
    await video.play();const start=performance.now(),clipDur=c.end-c.start;
    while(video.currentTime<c.end-.035&&!video.ended){
     if(state.cancel)throw new Error('Export stopped.');
     const p=Math.max(0,Math.min(1,(video.currentTime-c.start)/clipDur));
     const timelineTime=elapsed+Math.max(0,video.currentTime-c.start),activeCaption=state.captions.find(q=>timelineTime>=q.start&&timelineTime<q.end);drawFrame(ctx,video,w,h,title,filter,1,activeCaption&&activeCaption.text);
     if(transition==='fade'&&(p<.045||p>.94)){const a=p<.045?1-p/.045:(p-.94)/.06;ctx.fillStyle='rgba(0,0,0,'+Math.max(0,Math.min(.85,a*.85))+')';ctx.fillRect(0,0,w,h)}
     const done=elapsed+Math.max(0,video.currentTime-c.start);bar.style.width=Math.min(99,done/total*100)+'%';el('Status').textContent='Rendering clip '+(i+1)+' of '+clips.length+' · '+fmt(done)+' / '+fmt(total);
     await new Promise(r=>{raf=requestAnimationFrame(r)});
     if(performance.now()-start>Math.max(clipDur*5000,clipDur*10000))throw new Error('Rendering is taking too long. Try shorter clips or lower resolution.');
    }
    video.pause();elapsed+=clipDur;
   }
   if(recorder.state!=='inactive')recorder.stop();await finished;
   const blob=new Blob(chunks,{type:mime.split(';')[0]});if(blob.size<2000)throw new Error('The exported video is empty. Please try again.');
   state.outUrl=URL.createObjectURL(blob);const ext=mime.includes('mp4')?'mp4':'webm';
   output.innerHTML='<video controls playsinline src="'+state.outUrl+'"></video><div class="cf-row" style="margin-top:10px"><a class="sm p" style="text-decoration:none;padding:10px 14px" download="clipforge-'+mode+'-'+Date.now()+'.'+ext+'" href="'+state.outUrl+'">Download '+ext.toUpperCase()+'</a><span class="cf-muted">'+(blob.size/1048576).toFixed(1)+' MB</span></div>';
   bar.style.width='100%';setStatus('Export complete. Your file is ready to download. This session will not be saved.');
  }catch(e){if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(x){}}setStatus(e.message||'Export failed.');}
  finally{
   cancelAnimationFrame(raf);if(video){video.pause();video.removeAttribute('src');video.load()}
   if(musicEl){musicEl.pause();musicEl.removeAttribute('src')}
   if(stream)stream.getTracks().forEach(t=>t.stop());if(audioCtx)audioCtx.close().catch(()=>{});
   state.busy=false;button.disabled=false;stop.style.display='none';
  }
 }
 el('Export').onclick=exportTimeline;el('Stop').onclick=()=>{state.cancel=true;setStatus('Stopping export…')};
 render();loadPreview();
 window.addEventListener('beforeunload',()=>{state.clips.forEach(revoke);if(state.music)URL.revokeObjectURL(state.music);if(state.outUrl)URL.revokeObjectURL(state.outUrl)});
}
mountTimeline('vm','montage');mountTimeline('ed','editor');
/* Clear temporary output URLs when navigating away from the tool page. */
addEventListener('hashchange',()=>{if(!activeWorkspace()){$$('.cf-output video').forEach(v=>{v.pause();v.removeAttribute('src')})}});
})();

/* ===== merged from clipforge-v2-patch.js ===== */
(function(){
  const play = document.getElementById('edPlay');
  const preview = document.getElementById('edPreview');
  const start = document.getElementById('edStart');
  const end = document.getElementById('edEnd');
  if (play && preview) {
    let stopAt = 0;
    play.addEventListener('click', function () {
      if (!preview.src) return;
      const a = Math.max(0, Number(start && start.value) || 0);
      stopAt = Math.max(a + .1, Number(end && end.value) || preview.duration || a + 1);
      preview.currentTime = a;
      preview.play().catch(function(){});
    });
    preview.addEventListener('timeupdate', function () {
      if (stopAt && preview.currentTime >= stopAt) {
        preview.pause();
        stopAt = 0;
      }
    });
  }
})();

/* ===== merged from clipforge-editor-pro.js ===== */
(function(){
'use strict';
const root=document.getElementById('editorTool');if(!root||root.dataset.proReady==='1')return;root.dataset.proReady='1';
const by=id=>document.getElementById(id),status=t=>{const n=by('edStatus');if(n)n.textContent=t||''},esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=t=>{t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')},state={clips:[],selected:0,music:null,musicUrl:null,outUrl:null,busy:false,cancel:false};
const current=()=>state.clips[state.selected]||null,defaults={brightness:100,contrast:100,saturation:100,exposure:0,temperature:0,tint:0,hue:0,vignette:0,blur:0};
const controls='<div class="cf-advanced" id="edProControls">'+
'<div class="cf-section"><div class="cf-section-title"><h3>Color correction & grading</h3><small>Live preview + export</small></div><div class="cf-control-grid">'+
[['Brightness','25','200','100','%'],['Contrast','25','200','100','%'],['Saturation','0','250','100','%'],['Exposure','-100','100','0',''],['Temperature','-100','100','0',''],['Tint','-100','100','0',''],['Hue','-180','180','0','°'],['Vignette','0','100','0',''],['Blur','0','8','0','px']].map(x=>'<div class="cf-control"><label for="ed'+x[0]+'">'+x[0].toUpperCase()+' <output id="ed'+x[0]+'Val">'+x[3]+x[4]+'</output></label><input id="ed'+x[0]+'" type="range" min="'+x[1]+'" max="'+x[2]+'" value="'+x[3]+'" step="'+(x[0]==='Blur'?'.5':'1')+'"></div>').join('')+
'<div class="cf-control"><label>COLOR PRESET</label><select id="edLook"><option value="none">Original / Reset</option><option value="cinema">Cinematic</option><option value="vivid">Vivid</option><option value="warm">Golden hour</option><option value="cool">Cool blue</option><option value="mono">Black & white</option><option value="fade">Matte / faded</option><option value="vintage">Vintage</option></select></div><div class="cf-control full"><button class="sm" id="edResetGrade" type="button">Reset color settings</button></div></div></div>'+
'<div class="cf-section"><div class="cf-section-title"><h3>Motion & animation</h3><small>Camera movement and transitions</small></div><div class="cf-control-grid">'+
'<div class="cf-control"><label>CAMERA ANIMATION</label><select id="edMotion"><option value="none">Static</option><option value="kenburns">Ken Burns</option><option value="zoom-in">Slow zoom in</option><option value="zoom-out">Slow zoom out</option><option value="pan-left">Pan left</option><option value="pan-right">Pan right</option><option value="pan-up">Pan up</option><option value="pan-down">Pan down</option><option value="drift">Cinematic drift</option><option value="pulse">Pulse</option><option value="shake">Handheld shake</option></select></div>'+
'<div class="cf-control"><label>CLIP TRANSITION</label><select id="edTransition"><option value="fade">Fade through black</option><option value="cut">Hard cut</option><option value="flash">Flash</option><option value="zoom">Zoom fade</option></select></div>'+
'<div class="cf-control"><label>MOTION STRENGTH <output id="edMotionStrengthVal">50%</output></label><input id="edMotionStrength" type="range" min="0" max="100" value="50"></div>'+
'<div class="cf-control"><label>MOTION SPEED</label><select id="edMotionEase"><option value="slow">Slow / smooth</option><option value="normal" selected>Balanced</option><option value="fast">Fast</option></select></div></div></div>'+
'<div class="cf-section"><div class="cf-section-title"><h3>Text & title animation</h3><small>Burned into exported video</small></div><div class="cf-control-grid">'+
'<div class="cf-control"><label>TEXT ANIMATION</label><select id="edTitleMotion"><option value="none">Static</option><option value="fade">Fade in</option><option value="slide">Slide up</option><option value="pop">Pop in</option><option value="bounce">Bounce</option><option value="type">Typewriter</option></select></div>'+
'<div class="cf-control"><label>TITLE POSITION</label><select id="edTitlePosition"><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select></div>'+
'<div class="cf-control"><label>TITLE COLOR</label><input id="edTitleColor" type="color" value="#ffffff"></div>'+
'<div class="cf-control"><label>TITLE SIZE <output id="edTitleSizeVal">4.2%</output></label><input id="edTitleSize" type="range" min="2" max="9" step=".2" value="4.2"></div>'+
'<div class="cf-control"><label>TITLE BACKGROUND</label><select id="edTitleBg"><option value="none">None</option><option value="bar">Dark bar</option><option value="pill">Rounded panel</option></select></div>'+
'<div class="cf-control"><label>TITLE FONT</label><select id="edTitleFont"><option value="system">Modern sans</option><option value="serif">Editorial serif</option><option value="mono">Mono</option></select></div></div></div>'+
'<div class="cf-section"><div class="cf-section-title"><h3>Export quality</h3><small>Choose based on device power</small></div><div class="cf-control-grid">'+
'<div class="cf-control"><label>RESOLUTION</label><select id="edQuality"><option value="720">720p · Mobile recommended</option><option value="1080">1080p · High quality</option></select></div>'+
'<div class="cf-control"><label>FRAME RATE</label><select id="edFps"><option value="24">24 FPS · Cinematic</option><option value="30" selected>30 FPS · Standard</option></select></div></div></div></div>';
const side=root.querySelector('.cf-grid .cf-panel:last-child');if(side){const stat=side.querySelector('.cf-stat');if(stat)stat.insertAdjacentHTML('beforebegin',controls);}
const preview=by('edPreview');if(preview&&!preview.parentElement.classList.contains('cf-preview-wrap')){const wrap=document.createElement('div');wrap.className='cf-preview-wrap';preview.parentNode.insertBefore(wrap,preview);wrap.appendChild(preview);}
const val=id=>Number(by(id)?.value||0),grade=()=>({brightness:val('edBrightness'),contrast:val('edContrast'),saturation:val('edSaturation'),exposure:val('edExposure'),temperature:val('edTemperature'),tint:val('edTint'),hue:val('edHue'),vignette:val('edVignette'),blur:val('edBlur')});
function liveGrade(){const g=grade();if(!preview)return;preview.style.filter='brightness('+Math.max(.1,g.brightness/100*Math.pow(2,g.exposure/100))+') contrast('+(g.contrast/100)+') saturate('+(g.saturation/100)+') hue-rotate('+g.hue+'deg) blur('+g.blur+'px)';const wrap=preview.parentElement;let overlay=wrap.querySelector('.cf-live-grade-overlay');if(!overlay){overlay=document.createElement('div');overlay.className='cf-live-grade-overlay';overlay.style.cssText='position:absolute;inset:0;pointer-events:none;';wrap.style.position='relative';wrap.appendChild(overlay);}const layers=[];if(g.temperature)layers.push(g.temperature>0?'linear-gradient(rgba(255,130,45,'+(Math.abs(g.temperature)/500)+'),rgba(255,130,45,'+(Math.abs(g.temperature)/500)+'))':'linear-gradient(rgba(50,130,255,'+(Math.abs(g.temperature)/500)+'),rgba(50,130,255,'+(Math.abs(g.temperature)/500)+'))');if(g.tint)layers.push(g.tint>0?'linear-gradient(rgba(220,70,170,'+(Math.abs(g.tint)/770)+'),rgba(220,70,170,'+(Math.abs(g.tint)/770)+'))':'linear-gradient(rgba(60,210,150,'+(Math.abs(g.tint)/770)+'),rgba(60,210,150,'+(Math.abs(g.tint)/770)+'))');if(g.vignette)layers.push('radial-gradient(ellipse at center,transparent 35%,rgba(0,0,0,'+(g.vignette/100*.78)+') 100%)');overlay.style.background=layers.join(',');}
function labels(){['Brightness','Contrast','Saturation','Exposure','Temperature','Tint','Hue','Vignette','Blur','MotionStrength','TitleSize'].forEach(k=>{const n=by('ed'+k),o=by('ed'+k+'Val');if(!n||!o)return;let suffix=['Brightness','Contrast','Saturation','MotionStrength','TitleSize'].includes(k)?'%':k==='Hue'?'°':k==='Blur'?'px':'';o.textContent=n.value+suffix;});liveGrade();}
document.querySelectorAll('#edProControls input[type=range]').forEach(n=>n.addEventListener('input',labels));
const presets={none:defaults,cinema:{brightness:96,contrast:118,saturation:112,exposure:0,temperature:14,tint:2,hue:0,vignette:24,blur:0},vivid:{brightness:105,contrast:115,saturation:150,exposure:4,temperature:0,tint:0,hue:0,vignette:8,blur:0},warm:{brightness:105,contrast:108,saturation:122,exposure:5,temperature:48,tint:8,hue:-4,vignette:12,blur:0},cool:{brightness:100,contrast:112,saturation:110,exposure:0,temperature:-42,tint:-8,hue:8,vignette:18,blur:0},mono:{brightness:102,contrast:125,saturation:0,exposure:0,temperature:0,tint:0,hue:0,vignette:20,blur:0},fade:{brightness:108,contrast:82,saturation:82,exposure:8,temperature:8,tint:0,hue:0,vignette:0,blur:0},vintage:{brightness:103,contrast:92,saturation:76,exposure:4,temperature:28,tint:12,hue:-8,vignette:35,blur:.5}};
by('edLook').onchange=()=>{Object.entries(presets[by('edLook').value]||defaults).forEach(([k,v])=>{const n=by('ed'+k[0].toUpperCase()+k.slice(1));if(n)n.value=v;});labels();};
by('edResetGrade').onclick=()=>{Object.entries(defaults).forEach(([k,v])=>{const n=by('ed'+k[0].toUpperCase()+k.slice(1));if(n)n.value=v;});by('edLook').value='none';labels();};labels();
function render(){const list=by('edTimeline'),empty=by('edEmpty');list.innerHTML='';if(empty)empty.style.display=state.clips.length?'none':'block';state.clips.forEach((c,i)=>{const d=document.createElement('div');d.className='cf-clip'+(i===state.selected?' active':'');d.innerHTML='<strong>'+esc(c.file.name)+'</strong><small>'+fmt(c.end-c.start)+' · '+c.width+'×'+c.height+'</small>';const a=document.createElement('div');a.className='cf-clip-actions';[['Select',()=>select(i)],['↑',()=>move(i,-1)],['↓',()=>move(i,1)],['Remove',()=>remove(i)]].forEach(pair=>{const b=document.createElement('button');b.className='sm';b.type='button';b.textContent=pair[0];b.onclick=pair[1];a.append(b);});d.append(a);list.append(d);});by('edCount').textContent=state.clips.length+' clips';by('edDuration').textContent=fmt(state.clips.reduce((n,c)=>n+c.end-c.start,0));const c=current();by('edStart').value=c?c.start.toFixed(2):0;by('edEnd').value=c?c.end.toFixed(2):0;by('edStart').max=c?c.duration:0;by('edEnd').max=c?c.duration:0;by('edPreviewInfo').textContent=c?c.file.name+' · '+fmt(c.duration)+' source length':'Select a clip to inspect it.';}
function load(){const c=current();if(!preview)return;if(!c){preview.removeAttribute('src');preview.load();return;}preview.src=c.url;preview.onloadedmetadata=()=>{preview.currentTime=Math.min(c.start,Math.max(0,c.duration-.05));};}
function select(i){state.selected=i;render();load();}
function move(i,d){const j=i+d;if(j<0||j>=state.clips.length)return;[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];state.selected=j;render();load();}
function remove(i){const c=state.clips[i];if(c)URL.revokeObjectURL(c.url);state.clips.splice(i,1);state.selected=Math.max(0,Math.min(i,state.clips.length-1));render();load();}
async function importFiles(files){for(const file of Array.from(files||[])){if(!file.type.startsWith('video/'))continue;const url=URL.createObjectURL(file),v=document.createElement('video');v.preload='metadata';v.muted=true;v.src=url;try{await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(new Error('Could not read '+file.name));});if(!isFinite(v.duration)||v.duration<=0)throw new Error('Invalid video duration');state.clips.push({file,url,duration:v.duration,start:0,end:v.duration,width:v.videoWidth,height:v.videoHeight});}catch(e){URL.revokeObjectURL(url);status(e.message);}}state.selected=Math.max(0,state.clips.length-1);render();load();status(state.clips.length+' clips ready.');}
by('edFiles').addEventListener('change',e=>{importFiles(e.target.files);e.target.value='';},true);
by('edApply').onclick=()=>{const c=current();if(!c)return status('Select a clip first.');const a=Math.max(0,Math.min(c.duration,val('edStart'))),b=Math.min(c.duration,Number(by('edEnd').value)||c.duration);if(b<=a+.05)return status('End must be after start.');c.start=a;c.end=b;render();load();status('Trim applied.');};
by('edSplit').onclick=()=>{const c=current();if(!c)return status('Select a clip first.');const mid=(c.start+c.end)/2;if(mid-c.start<.15||c.end-mid<.15)return status('Clip is too short to split.');const second={...c,start:mid};c.end=mid;state.clips.splice(state.selected+1,0,second);state.selected++;render();load();status('Clip split.');};
by('edRemove').onclick=()=>{if(current())remove(state.selected);};
by('edClear').onclick=()=>{if(state.busy)return;state.clips.forEach(c=>URL.revokeObjectURL(c.url));state.clips=[];state.selected=0;render();load();status('Timeline cleared.');};
by('edMusic').addEventListener('change',e=>{if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);state.music=e.target.files[0]||null;state.musicUrl=state.music?URL.createObjectURL(state.music):null;status(state.music?'Music track ready.':'Music removed.');},true);
by('edPlay').onclick=()=>{const c=current();if(!c)return status('Select a clip first.');preview.currentTime=c.start;preview.play().catch(()=>status('Tap preview to play.'));};
function draw(ctx,v,w,h,t,d,settings,title){
 const g=settings.grade,p=Math.min(1,Math.max(0,t/Math.max(.01,d))),strength=settings.strength/100,e=settings.speed==='fast'?p*p:settings.speed==='slow'?p*p*(3-2*p):p;
 let z=settings.motion==='zoom-in'?1+.18*e:settings.motion==='zoom-out'?1.18-.18*e:settings.motion==='kenburns'?1+.11*e:settings.motion==='pulse'?1+.025*Math.sin(p*Math.PI*6):settings.motion==='drift'?1+.06*e:1;z*=1+strength*.05;
 let x=0,y=0;if(settings.motion==='pan-left'||settings.motion==='drift')x=(.5-e)*w*.12*strength;if(settings.motion==='pan-right')x=(e-.5)*w*.12*strength;if(settings.motion==='pan-up')y=(.5-e)*h*.12*strength;if(settings.motion==='pan-down')y=(e-.5)*h*.12*strength;if(settings.motion==='shake'){x=Math.sin(t*19)*w*.006*strength;y=Math.cos(t*23)*h*.006*strength;}
 const vw=v.videoWidth||w,vh=v.videoHeight||h,s=Math.max(w/vw,h/vh)*z,dw=vw*s,dh=vh*s,bright=Math.max(.1,g.brightness/100*Math.pow(2,g.exposure/100));
 ctx.save();ctx.fillStyle='#05070d';ctx.fillRect(0,0,w,h);ctx.filter='brightness('+bright+') contrast('+(g.contrast/100)+') saturate('+(g.saturation/100)+') hue-rotate('+g.hue+'deg) blur('+g.blur+'px)';ctx.translate(w/2+x,h/2+y);ctx.drawImage(v,-dw/2,-dh/2,dw,dh);ctx.filter='none';ctx.setTransform(1,0,0,1,0,0);
 if(g.temperature){ctx.fillStyle=g.temperature>0?'rgba(255,130,45,'+(Math.abs(g.temperature)/500)+')':'rgba(50,130,255,'+(Math.abs(g.temperature)/500)+')';ctx.fillRect(0,0,w,h);}if(g.tint){ctx.fillStyle=g.tint>0?'rgba(220,70,170,'+(Math.abs(g.tint)/770)+')':'rgba(60,210,150,'+(Math.abs(g.tint)/770)+')';ctx.fillRect(0,0,w,h);}
 if(g.vignette){const grad=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.12,w/2,h/2,Math.max(w,h)*.72);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,'rgba(0,0,0,'+(g.vignette/100*.78)+')');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);}
 if(title){const m=settings.titleMotion,tt=Math.min(1,t/.7);let alpha=1,dy=0,text=title;if(m==='fade'||m==='slide'||m==='pop'||m==='bounce')alpha=tt;if(m==='slide')dy=(1-tt)*h*.08;if(m==='bounce')dy=(1-tt)*-h*.08*Math.sin(tt*Math.PI);if(m==='type')text=title.slice(0,Math.max(1,Math.floor(title.length*Math.min(1,t/Math.max(.4,title.length*.055)))));
 ctx.save();ctx.globalAlpha=alpha;const size=Math.max(20,w*settings.titleSize/100),font=settings.titleFont==='serif'?'Georgia,serif':settings.titleFont==='mono'?'monospace':'system-ui,sans-serif';ctx.font='800 '+size+'px '+font;ctx.textAlign='center';ctx.textBaseline='middle';let lines=[],line='';text.split(/\\s+/).forEach(word=>{const test=line?line+' '+word:word;if(ctx.measureText(test).width>w*.84&&line){lines.push(line);line=word;}else line=test;});if(line)lines.push(line);lines=lines.slice(0,3);const pos=settings.titlePosition==='top'?h*.14:settings.titlePosition==='center'?h*.5:h*.84,total=lines.length*size*1.2;lines.forEach((lineText,i)=>{const yy=pos-total/2+i*size*1.2+dy,tw=ctx.measureText(lineText).width,pad=size*.34;if(settings.titleBg!=='none'){ctx.fillStyle='rgba(5,8,16,.72)';const bx=w/2-tw/2-pad,by=yy-size*.56,bw=tw+pad*2,bh=size*1.12;if(settings.titleBg==='pill'){ctx.beginPath();ctx.roundRect(bx,by,bw,bh,size*.2);ctx.fill();}else ctx.fillRect(bx,by,bw,bh);}ctx.lineWidth=Math.max(3,size*.1);ctx.strokeStyle='rgba(0,0,0,.78)';ctx.strokeText(lineText,w/2,yy);ctx.fillStyle=settings.titleColor;ctx.fillText(lineText,w/2,yy);});ctx.restore();}
 const edge=Math.min(t,d),tr=settings.transition;if(tr==='fade'&&edge<.35){ctx.fillStyle='rgba(0,0,0,'+(1-Math.max(0,edge/.35))+')';ctx.fillRect(0,0,w,h);}if(tr==='flash'&&edge<.12){ctx.fillStyle='rgba(255,255,255,'+(1-edge/.12)*.55+')';ctx.fillRect(0,0,w,h);}if(tr==='zoom'&&edge<.35){ctx.fillStyle='rgba(0,0,0,'+(1-Math.max(0,edge/.35))*.7+')';ctx.fillRect(0,0,w,h);}ctx.restore();
}
function wait(v,event){return new Promise((res,rej)=>{const timer=setTimeout(()=>{clean();rej(new Error('Timed out opening video.'));},15000),ok=()=>{clearTimeout(timer);clean();res();},bad=()=>{clearTimeout(timer);clean();rej(new Error('Could not decode video.'));},clean=()=>{v.removeEventListener(event,ok);v.removeEventListener('error',bad);};v.addEventListener(event,ok,{once:true});v.addEventListener('error',bad,{once:true});});}
async function exportPro(){
 if(state.busy)return;if(!state.clips.length)return status('Import at least one video first.');if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)return status('This browser cannot export video. Try the latest Chrome or Edge.');
 state.busy=true;state.cancel=false;const button=by('edExport'),stop=by('edStop'),bar=by('edProgress'),out=by('edOutput');button.disabled=true;stop.style.display='inline-block';out.innerHTML='';bar.style.width='0%';if(state.outUrl)URL.revokeObjectURL(state.outUrl);
 let recorder=null,stream=null,video=null,audioCtx=null,musicEl=null,raf=0;
 try{
  const ratio=by('edRatio').value,q=by('edQuality').value,short=q==='1080'?1080:720;let w,h;if(ratio==='9:16'){h=short;w=Math.round(short*9/16);}else if(ratio==='1:1'){w=h=short;}else{w=Math.round(short*16/9);h=short;}
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas unavailable.');
  stream=canvas.captureStream(Number(by('edFps').value));video=document.createElement('video');video.preload='auto';video.playsInline=true;video.muted=false;
  try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();const dest=audioCtx.createMediaStreamDestination(),src=audioCtx.createMediaElementSource(video);src.connect(dest);if(state.musicUrl){musicEl=new Audio(state.musicUrl);musicEl.loop=true;const ms=audioCtx.createMediaElementSource(musicEl),gain=audioCtx.createGain();gain.gain.value=.28;ms.connect(gain);gain.connect(dest);}await audioCtx.resume();dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}catch(e){status('Audio mixing unavailable; rendering without mixed audio.');}
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('No supported export codec on this browser.');
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:q==='1080'?9000000:5000000});const chunks=[];recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data);};const done=new Promise((r,j)=>{recorder.onstop=r;recorder.onerror=e=>j(e.error||new Error('Recording failed.'));});recorder.start(500);
  const settings={grade:grade(),motion:by('edMotion').value,strength:val('edMotionStrength'),speed:by('edMotionEase').value,transition:by('edTransition').value,titleMotion:by('edTitleMotion').value,titlePosition:by('edTitlePosition').value,titleColor:by('edTitleColor').value,titleSize:val('edTitleSize'),titleBg:by('edTitleBg').value,titleFont:by('edTitleFont').value};
  const title=by('edTitle').value.trim(),clips=state.clips.slice(),total=clips.reduce((n,c)=>n+c.end-c.start,0);let elapsed=0;if(musicEl)musicEl.play().catch(()=>{});
  for(let i=0;i<clips.length;i++){if(state.cancel)throw new Error('Export stopped.');const c=clips[i];video.src=c.url;video.load();await wait(video,'loadedmetadata');const seek=Math.min(c.start,Math.max(0,c.duration-.05));if(Math.abs(video.currentTime-seek)>.04){const p=wait(video,'seeked');video.currentTime=seek;await p;}await video.play();const dur=c.end-c.start;while(video.currentTime<c.end-.04&&!video.ended){if(state.cancel)throw new Error('Export stopped.');const t=Math.max(0,video.currentTime-c.start);draw(ctx,video,w,h,t,dur,settings,title);const doneSec=elapsed+t;bar.style.width=Math.min(99,doneSec/total*100)+'%';status('Rendering clip '+(i+1)+' of '+clips.length+' · '+fmt(doneSec)+' / '+fmt(total));await new Promise(r=>{raf=requestAnimationFrame(r);});}video.pause();elapsed+=dur;}
  if(recorder.state!=='inactive')recorder.stop();await done;const blob=new Blob(chunks,{type:mime.split(';')[0]});if(blob.size<1500)throw new Error('Export is empty. Try a shorter clip or another browser.');state.outUrl=URL.createObjectURL(blob);const ext=mime.includes('mp4')?'mp4':'webm';out.innerHTML='<video controls playsinline src="'+state.outUrl+'"></video><div class="cf-row" style="margin-top:10px"><a class="sm p" style="text-decoration:none;padding:10px 14px" download="clipforge-editor-'+Date.now()+'.'+ext+'" href="'+state.outUrl+'">Download '+ext.toUpperCase()+'</a><span class="cf-muted">'+(blob.size/1048576).toFixed(1)+' MB · '+q+'p</span></div>';bar.style.width='100%';status('Export complete. Download your edit. Nothing was saved to a project library.');
 }catch(e){if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch(x){}}status(e.message||'Export failed.');}
 finally{cancelAnimationFrame(raf);if(video){video.pause();video.removeAttribute('src');video.load();}if(musicEl){musicEl.pause();musicEl.removeAttribute('src');}if(stream)stream.getTracks().forEach(t=>t.stop());if(audioCtx)audioCtx.close().catch(()=>{});state.busy=false;button.disabled=false;stop.style.display='none';}
}
by('edExport').onclick=exportPro;by('edStop').onclick=()=>{state.cancel=true;status('Stopping export…');};
window.addEventListener('beforeunload',()=>{state.clips.forEach(c=>URL.revokeObjectURL(c.url));if(state.musicUrl)URL.revokeObjectURL(state.musicUrl);if(state.outUrl)URL.revokeObjectURL(state.outUrl);});
render();status('Editor Pro ready. Import videos to begin.');
})();

/* ===== merged from clipforge-studio.js ===== */
(()=>{'use strict';
const root=document.getElementById('editorTool');if(!root||root.dataset.studioReady)return;root.dataset.studioReady='1';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S={media:[],clips:[],titles:[],audio:null,audioTracks:[],overlays:[],adjustments:[],captions:[],sel:null,time:0,zoom:80,playing:false,exportQuality:720,exportFps:30,videoTrackCount:4,sequenceWidth:null,sequenceHeight:null,fitMode:'contain',inPoint:null,outPoint:null,undo:[],redo:[]};
root.innerHTML=[
'<div class="st-head"><div><a class="st-back" href="#tools">← All tools</a><div class="st-eyebrow">CLIPFORGE STUDIO / EDITOR</div><h2>Video Editor</h2><p>Multi-track editing workspace · Local browser session</p></div><div class="st-head-actions"><button class="st-btn" id="stUndo">↶ Undo</button><button class="st-btn" id="stRedo">↷ Redo</button><button class="st-btn st-primary" id="stExport">Export video</button></div></div>',
'<div class="st-workspace"><aside class="st-assets"><div class="st-panel-title">MEDIA LIBRARY <span id="stMediaCount">0</span></div><label class="st-import" for="stImport">＋ Import media<small>Video / audio / images</small></label><input id="stImport" type="file" accept="video/*,audio/*,image/*" multiple hidden><div id="stMedia" class="st-media"><div class="st-empty">Your media appears here.</div></div><div class="st-panel-title st-spaced">TEXT & GRAPHICS</div><button class="st-tool" id="stAddText">＋ Add text overlay</button><div class="st-panel-title st-spaced">SESSION</div><div class="st-project-note">Temporary browser session<br><small>Nothing is uploaded or saved.</small></div></aside>',
'<main class="st-main"><div class="st-preview-row"><section class="st-preview-panel"><div class="st-panel-title">PREVIEW <span id="stTimecode">00:00:00</span></div><div class="st-canvas-wrap"><canvas id="stCanvas" width="1920" height="1080"></canvas><div id="stPreviewEmpty">Import a video to begin editing</div></div><div class="st-transport"><button id="stPlay" class="st-play">▶</button><button id="stStop">■</button><span id="stCurrent">00:00</span><input id="stScrub" type="range" min="0" max="1000" value="0"><span id="stTotal">00:00</span><select id="stRatio" aria-label="Sequence aspect ratio"><option value="source">Auto / Source</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="4:3">4:3</option><option value="21:9">21:9</option><option value="custom">Custom</option></select><span class="st-sequence-size"><input id="stSeqW" type="number" min="16" max="7680" value="1920" aria-label="Sequence width"> × <input id="stSeqH" type="number" min="16" max="7680" value="1080" aria-label="Sequence height"></span><select id="stFitMode" aria-label="Preview fit"><option value="contain">Fit</option><option value="cover">Fill</option></select></div></section><aside class="st-inspector"><div class="st-panel-title">INSPECTOR</div><div id="stInspector" class="st-inspector-body"><div class="st-empty">Select a clip on the timeline to edit it.</div></div></aside></div>',
'<section class="st-timeline-panel"><div class="st-timeline-top"><div class="st-panel-title">TIMELINE <span id="stDuration">00:00</span></div><div class="st-timeline-actions"><button class="st-btn" id="stMarkIn" title="Mark sequence In · I">I In</button><button class="st-btn" id="stMarkOut" title="Mark sequence Out · O">O Out</button><button class="st-btn" id="stClearMarks" title="Clear In/Out · Ctrl+Shift+X">Clear</button><button class="st-btn" id="stSplit">Split</button><button class="st-btn" id="stDelete">Delete</button><button class="st-btn" id="stZoomOut" title="Zoom out">−</button><input id="stZoom" aria-label="Timeline zoom" type="range" min="0.2" max="180" step="0.1" value="80"><button class="st-btn" id="stZoomIn" title="Zoom in">＋</button><button class="st-btn" id="stZoomFit" title="Fit project to timeline">Fit</button></div></div><div class="st-timeline-scroll"><div class="st-timeline-inner" id="stInner"><div class="st-ruler"><div class="st-track-label">TIME</div><div id="stRuler" class="st-ruler-content"></div></div><div class="st-lane"><div class="st-track-label">VIDEO 1</div><div id="stVideoLane" class="st-lane-content"></div></div><div class="st-lane"><div class="st-track-label">VIDEO 2</div><div id="stVideoLane2" class="st-lane-content"></div></div><div class="st-lane"><div class="st-track-label">TEXT / OVERLAY</div><div id="stTextLane" class="st-lane-content"></div></div><div class="st-lane"><div class="st-track-label">AUDIO 1</div><div id="stAudioLane" class="st-lane-content"></div></div><div id="stPlayhead" class="st-playhead"></div></div></div><div class="st-timeline-foot"><span>Drag video clips to reorder · Select a clip to inspect · Click ruler to seek</span><span id="stSelection">No clip selected</span></div></section></main></div><div class="st-export-status" id="stStatus"></div>'
].join('');
const fmt=t=>String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')+':'+String(Math.floor(Math.max(0,t)%60)).padStart(2,'0'),msg=t=>$('stStatus').textContent=t||'';
function snap(){S.undo.push({videoTrackCount:S.videoTrackCount||4,clips:S.clips.map(c=>({...c,keyframes:(c.keyframes||[]).map(k=>({...k}))})),titles:S.titles.map(c=>({...c})),overlays:(S.overlays||[]).map(c=>({...c})),adjustments:(S.adjustments||[]).map(c=>({...c})),captions:(S.captions||[]).map(c=>({...c})),audio:S.audio?{...S.audio}:null,audioTracks:(S.audioTracks||[]).map(a=>({...a}))});if(S.undo.length>30)S.undo.shift();S.redo=[];buttons()}
function buttons(){$('stUndo').disabled=!S.undo.length;$('stRedo').disabled=!S.redo.length}
function total(){return Math.max(1,...S.clips.map(c=>c.start+c.duration),...S.titles.map(c=>c.start+c.duration),...(S.overlays||[]).map(c=>c.start+c.duration),...(S.adjustments||[]).map(c=>c.start+c.duration),...(S.captions||[]).map(c=>c.start+c.duration),...(S.audioTracks||[]).map(a=>a.start+a.duration),S.audio?S.audio.start+S.audio.duration:0)}
function current(){return S.clips.find(c=>c.id===S.sel)||S.titles.find(c=>c.id===S.sel)||(S.overlays||[]).find(c=>c.id===S.sel)||(S.adjustments||[]).find(c=>c.id===S.sel)||(S.captions||[]).find(c=>c.id===S.sel)||(S.audioTracks||[]).find(a=>a.id===S.sel)||(S.audio&&S.audio.id===S.sel?S.audio:null)}
function mediaRender(){$('stMediaCount').textContent=S.media.length;$('stMedia').innerHTML=S.media.map(m=>'<button class="st-media-item" data-mid="'+m.id+'">'+(m.kind==='image'?'<img class="st-image-thumb" src="'+m.url+'" alt="">':'<span class="st-media-icon">'+(m.kind==='audio'?'♫':'▶')+'</span>')+'<span class="st-media-copy"><b>'+esc(m.name)+'</b><small>'+(m.kind==='audio'?'Audio':m.kind==='image'?'Image · 5 sec':fmt(m.duration))+'</small></span><span class="st-media-preview" data-media-preview="'+m.id+'" role="button" tabindex="0" title="Preview in Source Monitor">SOURCE</span></button>').join('')||'<div class="st-empty">Your media appears here.</div>';document.querySelectorAll('#stMedia [data-mid]').forEach(b=>b.onclick=()=>addToTimeline(b.dataset.mid))}
function addToTimeline(id){const m=S.media.find(x=>x.id===id);if(!m)return;snap();S.audioTracks=S.audioTracks||(S.audio?[S.audio]:[]);if(m.kind==='audio'){const a={id:crypto.randomUUID(),name:m.name,file:m.file||null,audio:m.audio,url:m.url,start:0,in:0,out:m.duration,sourceDuration:m.duration,duration:m.duration,volume:80,track:S.audioTracks.length+1,waveform:m.waveform||null};S.audioTracks.push(a);if(!S.audio)S.audio=a;S.sel=a.id}else{const duration=m.kind==='image'?5:m.duration;const c={id:crypto.randomUUID(),name:m.name,file:m.file||null,video:m.video||null,image:m.image||null,kind:m.kind,url:m.url,start:S.clips.length?Math.max(...S.clips.map(x=>x.start+x.duration)):0,in:0,out:duration,sourceDuration:duration,duration,track:1,filter:'none',brightness:100,contrast:100,saturation:100,blur:0,vignette:0,hue:0,scale:100,rotation:0,x:50,y:50,speed:1,audioVolume:100,audioFadeIn:0,audioFadeOut:0,keyframes:[]};S.clips.push(c);S.sel=c.id;if(m.kind==='video'&&Array.isArray(m.waveform)){const linked={id:crypto.randomUUID(),name:m.name+' · Linked audio',file:m.file||null,url:m.url,audio:null,linkedVideoId:c.id,visualOnly:true,start:c.start,in:0,out:duration,sourceDuration:duration,duration,volume:100,track:S.audioTracks.length+1,waveform:m.waveform};S.audioTracks.push(linked);c.linkedAudioId=linked.id;}if(S.clips.length===1&&(S.audioTracks||[]).length===0){const sc=$('stInner')?.closest('.st-timeline-scroll'),available=Math.max(180,(sc?.clientWidth||900)-190);S.zoom=Math.max(.2,Math.min(180,available/Math.max(1,c.duration)));const zoomInput=$('stZoom');if(zoomInput){zoomInput.min='0.2';zoomInput.step='0.1';zoomInput.value=String(S.zoom)}}}render()}
function block(c,type){
  const wave = type === "audio" && Array.isArray(c.waveform)
    ? '<span class="st-waveform">' + c.waveform.map(v => '<i style="height:' + Math.max(8,Math.min(100,Math.round(v*100))) + '%"></i>').join("") + '</span>'
    : "";
  return `<button draggable="${c.visualOnly?'false':'true'}" class="st-clip-block ${type}${S.sel===c.id?' is-selected':''}" data-id="${c.id}" style="left:${c.start*S.zoom}px;width:${Math.max(46,c.duration*S.zoom)}px"><span class="st-trim-handle left" data-trim="left" aria-label="Trim clip start"></span><b>${esc(c.name)}</b><small>${fmt(c.duration)}</small>${wave}${c.linkedVideoId?'<span class="st-audio-detach" data-detach="'+c.id+'" role="button" tabindex="0" title="Detach audio from video">↗</span>':''}<span class="st-trim-handle right" data-trim="right" aria-label="Trim clip end"></span></button>`;
}
function timeline(){
 const inner=$('stInner'),scroll=inner?.closest('.st-timeline-scroll'),d=total(),w=Math.max(1100,d*S.zoom+260);
 if(!inner.querySelector('.st-inout-range')){const range=document.createElement('div');range.className='st-inout-range';range.id='stInOutRange';inner.appendChild(range)}const inRange=inner.querySelector('.st-inout-range');if(inRange){inRange.style.display=S.inPoint==null?'none':'block';inRange.style.left=(150+S.inPoint*S.zoom)+'px';inRange.style.width=S.outPoint==null?'2px':Math.max(2,(S.outPoint-S.inPoint)*S.zoom)+'px';inRange.dataset.in=String(S.inPoint);inRange.dataset.out=S.outPoint==null?'':String(S.outPoint)}
 $('stDuration').textContent=fmt(d);$('stTotal').textContent=fmt(d);
 inner.style.width=w+'px';
 const playhead=$('stPlayhead');
 $('stRuler').style.width=(w-150)+'px';
 inner.querySelectorAll('.st-lane').forEach(lane=>lane.remove());
 const step=[1,2,5,10,15,30,60,120,300,600,1200,1800].find(value=>value*S.zoom>=80)||3600;
 let ticks='';for(let t=0;t<=d+step;t+=step)ticks+='<span style="left:'+(t*S.zoom)+'px">'+fmt(t)+'</span>';
 $('stRuler').innerHTML=ticks;
 $('stZoom').value=String(S.zoom);
 const mediaAt=(event,content)=>Math.max(0,(event.clientX-content.getBoundingClientRect().left)/S.zoom);
 // Keep linked source-audio strips aligned with their parent video edit.
 (S.audioTracks||[]).forEach(track=>{if(!track.linkedVideoId)return;const parent=S.clips.find(c=>c.id===track.linkedVideoId);if(parent){track.start=parent.start;track.in=parent.in;track.out=parent.out;track.duration=parent.duration;}});
 const allAudio=(S.audioTracks&&S.audioTracks.length)?S.audioTracks:(S.audio?[S.audio]:[]);
 const lanes=[
  ...Array.from({length:Math.max(2,Math.min(8,Number(S.videoTrackCount)||4))},(_,i)=>({label:'VIDEO '+(i+1),kind:'video',track:i+1,items:S.clips.filter(c=>(Number(c.track)||1)===i+1)})),
  {label:'OVERLAYS',kind:'overlay',items:(S.overlays||[]),track:0},{label:'ADJUSTMENT LAYERS',kind:'adjustment',items:(S.adjustments||[]),track:0},
  {label:'CAPTIONS / TITLES',kind:'caption',items:[...(S.titles||[]),...(S.captions||[])],track:0},
  ...allAudio.map((audio,i)=>({label:'AUDIO '+(i+1)+(audio.linkedVideoId?' · LINKED':''),kind:'audio',track:i+1,items:[audio]}))
 ];
 function createLane(spec){
  const lane=document.createElement('div');lane.className='st-lane st-pro-lane';lane.dataset.laneKind=spec.kind;lane.dataset.track=String(spec.track||0);
  const label=document.createElement('div');label.className='st-track-label';label.textContent=spec.label;
  const content=document.createElement('div');content.className='st-lane-content';content.dataset.laneKind=spec.kind;content.dataset.track=String(spec.track||0);
  content.innerHTML=spec.items.map(c=>block(c,spec.kind==='video'?'video':spec.kind==='audio'?'audio':spec.kind==='overlay'?'overlay':spec.kind==='adjustment'?'adjustment':(S.titles.includes(c)?'title':'caption'))).join('');
  lane.append(label,content);
  content.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('application/x-clipforge-media')||e.dataTransfer?.types?.includes('text/plain'))e.preventDefault()});
  content.addEventListener('drop',e=>{
   e.preventDefault();
   const mediaId=e.dataTransfer?.getData('application/x-clipforge-media');
   if(mediaId){
    const before=new Set([...S.clips,...(S.audioTracks||[]),...(S.titles||[]),...(S.overlays||[]),...(S.captions||[])].map(x=>x.id));
    addToTimeline(mediaId);
    const added=[...S.clips,...(S.audioTracks||[]),...(S.titles||[]),...(S.overlays||[]),...(S.captions||[])].find(x=>!before.has(x.id));
    if(added){added.start=mediaAt(e,content);if(spec.kind==='video'&&S.clips.includes(added))added.track=spec.track;if(spec.kind==='audio'&&(S.audioTracks||[]).includes(added))added.track=spec.track;render()}
    return;
   }
   const id=e.dataTransfer?.getData('text/plain');if(!id)return;
   const clip=S.clips.find(x=>x.id===id),audio=(S.audioTracks||[]).find(x=>x.id===id),overlay=(S.overlays||[]).find(x=>x.id===id),adjustment=(S.adjustments||[]).find(x=>x.id===id);
   if(spec.kind==='video'&&clip){snap();clip.track=spec.track;clip.start=mediaAt(e,content);render()}
   else if(spec.kind==='audio'&&audio){snap();audio.track=spec.track;audio.start=mediaAt(e,content);render()}
   else if(spec.kind==='overlay'&&overlay){snap();overlay.start=mediaAt(e,content);render()}else if(spec.kind==='adjustment'&&adjustment){snap();adjustment.start=mediaAt(e,content);render()}
  });
  inner.insertBefore(lane,playhead);
 }
 lanes.forEach(createLane);
 document.querySelectorAll('#stInner [data-id]').forEach(button=>{
  const itemId=button.dataset.id;
  button.onclick=event=>{if(event.target.closest('[data-trim]'))return;const detach=event.target.closest('[data-detach]');if(detach){event.preventDefault();event.stopPropagation();const track=(S.audioTracks||[]).find(x=>x.id===detach.dataset.detach);if(!track||!track.linkedVideoId)return;const parent=S.clips.find(x=>x.id===track.linkedVideoId);if(!parent)return;snap();track.linkedVideoId=null;track.visualOnly=false;track.name=track.name.replace(' · Linked audio',' · Detached audio');track.audio=new Audio(track.url);track.audio.preload='auto';track.audio.volume=Math.max(0,Math.min(1,Number(track.volume??100)/100));parent.audioDetached=true;S.sel=track.id;render();msg('Audio detached — move, trim and adjust it independently.');return}S.sel=itemId;inspector();timeline()};
  button.ondragstart=e=>{e.dataTransfer.setData('text/plain',itemId);e.dataTransfer.effectAllowed='move'};
  button.querySelectorAll('[data-trim]').forEach(handle=>{
   handle.onpointerdown=e=>{
    e.preventDefault();e.stopPropagation();
    const item=S.clips.find(x=>x.id===itemId)||(S.audioTracks||[]).find(x=>x.id===itemId)||S.titles.find(x=>x.id===itemId)||(S.overlays||[]).find(x=>x.id===itemId)||(S.adjustments||[]).find(x=>x.id===itemId)||(S.captions||[]).find(x=>x.id===itemId);
    if(!item)return;
    snap();S.sel=item.id;
    const side=handle.dataset.trim,x0=e.clientX,start0=Number(item.start)||0,in0=Number(item.in)||0,out0=Number(item.out)||Number(item.duration)||1,speed=Math.max(.01,Number(item.speed)||1),max=Number(item.sourceDuration)||Number(item.video?.duration)||Number(item.duration)||out0;
    const move=ev=>{
     const delta=(ev.clientX-x0)/S.zoom*speed;
     if(side==='left'){
      const nextIn=Math.max(0,Math.min(out0-.1,in0+delta));
      item.in=nextIn;item.start=Math.max(0,start0+(nextIn-in0)/speed);item.duration=Math.max(.1,(out0-nextIn)/speed);
     }else{
      const nextOut=Math.max(in0+.1,Math.min(max,out0+delta));
      item.out=nextOut;item.duration=Math.max(.1,(nextOut-in0)/speed);
     }
     button.style.left=(item.start*S.zoom)+'px';button.style.width=Math.max(46,item.duration*S.zoom)+'px';
     const small=button.querySelector('small');if(small)small.textContent=fmt(item.duration);
    };
    const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);render()};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});
   };
  });
 });
 const rangeMarker=inner.querySelector('.st-inout-range');if(rangeMarker){rangeMarker.style.display=S.inPoint==null?'none':'block';rangeMarker.style.left=(150+S.inPoint*S.zoom)+'px';rangeMarker.style.width=S.outPoint==null?'2px':Math.max(2,(S.outPoint-S.inPoint)*S.zoom)+'px'}
 $('stPlayhead').style.left=(150+S.time*S.zoom)+'px';
 $('stCurrent').textContent=fmt(S.time);$('stTimecode').textContent=fmt(S.time);
}
function inspector(){const c=current();$('stSelection').textContent=c?c.name:'No clip selected';if(!c){$('stInspector').innerHTML='<div class="st-empty">Select a clip on the timeline to edit it.</div>';return}const title=!!c.text,audio=!!c.audio&&!c.video,adjustment=(S.adjustments||[]).includes(c);let h='<div class="st-inspector-name">'+esc(c.name)+'</div><div class="st-prop"><label>START (SECONDS)</label><input id="pStart" type="number" step=".1" value="'+c.start+'"></div><div class="st-prop"><label>TRIM IN</label><input id="pIn" type="number" step=".1" value="'+(c.in||0)+'"></div><div class="st-prop"><label>TRIM OUT</label><input id="pOut" type="number" step=".1" value="'+(c.out||c.duration)+'"></div>';
if(adjustment)h+='<div class="st-panel-title st-spaced">ADJUSTMENT LAYER</div>'+[['brightness','BRIGHTNESS',0,200,100],['contrast','CONTRAST',0,200,100],['saturation','SATURATION',0,250,100],['hue','HUE SHIFT',-180,180,0],['blur','BLUR',0,20,0],['vignette','VIGNETTE',0,100,0],['opacity','LAYER OPACITY',0,100,100]].map(([key,label,min,max,fallback])=>'<div class="st-prop"><label>'+label+' <output id="o'+key+'">'+(c[key]??fallback)+'</output></label><input id="p'+key+'" type="range" min="'+min+'" max="'+max+'" value="'+(c[key]??fallback)+'"></div>').join('')+'<div class="st-prop"><label>BLEND MODE</label><select id="pBlend"><option value="source-over">Normal</option><option value="screen">Screen</option><option value="multiply">Multiply</option><option value="overlay">Overlay</option><option value="darken">Darken</option><option value="lighten">Lighten</option></select></div>';else if(title)h+='<div class="st-prop"><label>TEXT</label><textarea id="pText">'+esc(c.text)+'</textarea></div><div class="st-prop"><label>COLOR</label><input id="pColor" type="color" value="'+c.color+'"></div><div class="st-prop"><label>SIZE</label><input id="pSize" type="range" min="2" max="12" value="'+c.size+'"></div><div class="st-prop"><label>ANIMATION</label><select id="pAnim"><option>None</option><option>Fade</option><option>Slide</option><option>Pop</option><option>Typewriter</option></select></div>';
else if(audio)h+='<div class="st-prop"><label>VOLUME <output id="oVolume">'+(c.volume??80)+'</output></label><input id="pVolume" type="range" min="0" max="100" value="'+(c.volume??80)+'"></div><div class="st-prop"><label>FADE IN (SECONDS)</label><input id="pFadeIn" type="number" min="0" max="30" step="0.1" value="'+(c.fadeIn||0)+'"></div><div class="st-prop"><label>FADE OUT (SECONDS)</label><input id="pFadeOut" type="number" min="0" max="30" step="0.1" value="'+(c.fadeOut||0)+'"></div>';
else h+='<div class="st-prop"><label>FILTER</label><select id="pFilter"><option value="none">Original</option><option value="cinema">Cinematic</option><option value="mono">Black & white</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="vivid">Vivid</option></select></div>'+['brightness','contrast','saturation','scale'].map(k=>'<div class="st-prop"><label>'+k.toUpperCase()+' <output id="o'+k+'">'+c[k]+'</output></label><input id="p'+k+'" type="range" min="'+(k==='scale'?50:k==='saturation'?0:25)+'" max="'+(k==='scale'?200:k==='saturation'?250:200)+'" value="'+c[k]+'"></div>').join('')+'<div class="st-prop"><label>ROTATION</label><input id="pRotation" type="number" value="'+c.rotation+'"></div>'+[["POSITION X","x"],["POSITION Y","y"],["OPACITY","opacity"]].map(([label,key])=>'<div class="st-prop"><label>'+label+' <output id="o'+key+'">'+(c[key]??(key==="opacity"?100:50))+'</output></label><input id="p'+key+'" type="range" min="0" max="100" value="'+(c[key]??(key==="opacity"?100:50))+'"></div>').join('')+'<button class="st-btn" id="pKey">＋ Add keyframe at playhead</button><small class="st-hint">'+c.keyframes.length+' keyframes · Clip-relative time</small><section class="st-keyframe-editor" id="stKeyframeEditor"><div class="st-keyframe-heading"><b>KEYFRAME GRAPH</b><select id="pGraphProperty"><option value="scale">Scale</option><option value="opacity">Opacity</option><option value="x">Position X</option><option value="y">Position Y</option><option value="rotation">Rotation</option></select></div><svg id="pGraphSvg" viewBox="0 0 300 100" role="img" aria-label="Selected animation property curve"><path d="M10 50H290" class="st-graph-axis"/><polyline id="pGraphLine" points="10,50 290,50" class="st-graph-line"/><g id="pGraphPoints"></g></svg><div class="st-keyframe-ease"><label>Interpolation</label><select id="pKeyEase"><option value="linear">Linear</option><option value="ease-in">Ease In</option><option value="ease-out">Ease Out</option><option value="ease-in-out">Ease In / Out</option></select></div><div id="pKeyframeRows" class="st-keyframe-rows"></div></section>';
if(!title&&!audio&&!adjustment)h+='<div class="st-panel-title st-spaced">EFFECTS CONTROLS</div>'+[['blur','BLUR',0,20],['vignette','VIGNETTE',0,100],['hue','HUE SHIFT',-180,180]].map(([key,label,min,max])=>'<div class="st-prop"><label>'+label+' <output id="o'+key+'">'+(c[key]??0)+'</output></label><input id="p'+key+'" type="range" min="'+min+'" max="'+max+'" value="'+(c[key]??0)+'"></div>').join('')+'<div class="st-prop"><label>BLEND MODE</label><select id="pBlend"><option value="source-over">Normal</option><option value="screen">Screen</option><option value="multiply">Multiply</option><option value="overlay">Overlay</option><option value="darken">Darken</option><option value="lighten">Lighten</option></select></div>';h+='<button class="st-btn st-danger" id="pRemove">Remove clip</button>';$('stInspector').innerHTML=h;
const bind=(id,key,parse=v=>v)=>{const n=$(id);if(n)n.onchange=()=>{snap();c[key]=parse(n.value);if(key==='in'||key==='out'){const sourceMax=Number(c.video?.duration||c.sourceDuration||c.out||c.duration*(c.speed||1));c.in=Math.max(0,Math.min(sourceMax-.1,Number(c.in)||0));c.out=Math.max(c.in+.1,Math.min(sourceMax,Number(c.out)||sourceMax));c.duration=Math.max(.1,(c.out-c.in)/(c.speed||1));}render()}};[['pStart','start',Number],['pIn','in',Number],['pOut','out',Number],['pText','text'],['pColor','color'],['pSize','size',Number],['pAnim','animation'],['pVolume','volume',Number],['pFadeIn','fadeIn',Number],['pFadeOut','fadeOut',Number],['pFilter','filter'],['pBlend','blendMode'],['pbrightness','brightness',Number],['pcontrast','contrast',Number],['psaturation','saturation',Number],['pblur','blur',Number],['pvignette','vignette',Number],['phue','hue',Number],['pscale','scale',Number],['pRotation','rotation',Number],['px','x',Number],['py','y',Number],['popacity','opacity',Number]].forEach(x=>bind(x[0],x[1],x[2]));['x','y','opacity','blur','vignette','hue','brightness','contrast','saturation'].forEach(k=>{const n=$('p'+k),o=$('o'+k);if(n&&o)n.oninput=()=>o.textContent=n.value});if($('pBlend'))$('pBlend').value=c.blendMode||'source-over';wireKeyframeGraph(c);if($('pKey'))$('pKey').onclick=()=>{snap();c.keyframes=c.keyframes||[];const time=Math.max(0,S.time-c.start),key={time,scale:Number(c.scale)||100,rotation:Number(c.rotation)||0,x:Number(c.x??50),y:Number(c.y??50),opacity:Number(c.opacity??100),ease:$('pKeyEase')?.value||'linear'};const existing=c.keyframes.findIndex(k=>Math.abs(k.time-time)<.025);if(existing>=0)c.keyframes[existing]=key;else c.keyframes.push(key);c.keyframes.sort((a,b)=>a.time-b.time);msg('Keyframe set at '+fmt(time)+'.');render()};$('pRemove').onclick=()=>{snap();S.clips=S.clips.filter(x=>x.id!==c.id);S.titles=S.titles.filter(x=>x.id!==c.id);S.overlays=(S.overlays||[]).filter(x=>x.id!==c.id);S.adjustments=(S.adjustments||[]).filter(x=>x.id!==c.id);S.captions=(S.captions||[]).filter(x=>x.id!==c.id);S.audioTracks=(S.audioTracks||[]).filter(x=>{if(x.id===c.id||x.linkedVideoId===c.id){try{x.audio?.pause();if(x.audio&&x.audio.src?.startsWith('blob:'))x.audio.removeAttribute('src')}catch(e){}return false}return true});if(S.audio&&S.audio.id===c.id)S.audio=S.audioTracks[0]||null;S.sel=null;window.ClipForgeEditor?.render?.()||render()}}
function updateKeyframeGraph(c) {
 const editor=$('stKeyframeEditor');
 if(!editor)return;
 const property=$('pGraphProperty')?.value||'scale';
 const keys=(c.keyframes||[]).slice().sort((a,b)=>a.time-b.time);
 const min=property==='scale'?50:(property==='rotation'?-180:0);
 const max=property==='scale'?200:(property==='rotation'?180:100);
 const duration=Math.max(.1,Number(c.duration)||1);
 const x=time=>10+Math.max(0,Math.min(1,Number(time||0)/duration))*280;
 const fallback=property==='rotation'?0:(property==='scale'||property==='opacity'?100:50);
 const y=value=>{
  const numeric=Number(value??fallback);
  const ratio=Math.max(0,Math.min(1,(numeric-min)/(max-min)));
  return 90-ratio*80;
 };
 const points=keys.map(key=>x(key.time)+','+y(key[property])).join(' ');
 $('pGraphLine').setAttribute('points',points||'10,50 290,50');
 $('pGraphPoints').innerHTML=keys.map((key,index)=>'<circle cx="'+x(key.time)+'" cy="'+y(key[property])+'" r="4" data-key-point="'+index+'" class="st-graph-point"></circle>').join('');
 $('pKeyframeRows').innerHTML=keys.map((key,index)=>{
  const value=Number(key[property]??fallback);
  return '<div class="st-keyframe-row"><input type="number" step=".01" min="0" max="'+duration+'" value="'+Number(key.time||0).toFixed(2)+'" data-key-index="'+index+'" data-key-field="time" aria-label="Keyframe time"><input type="number" step=".1" value="'+value+'" data-key-index="'+index+'" data-key-field="'+property+'" aria-label="Keyframe '+property+' value"><button type="button" data-key-remove="'+index+'" title="Delete keyframe">×</button></div>';
 }).join('')||'<small class="st-hint">Add a keyframe at the playhead to start animating.</small>';
 const last=keys[keys.length-1];
 if(last&&$('pKeyEase'))$('pKeyEase').value=last.ease||'linear';
}
function wireKeyframeGraph(c){const editor=$('stKeyframeEditor');if(!editor)return;const property=$('pGraphProperty');const update=()=>updateKeyframeGraph(c);property.onchange=update;editor.addEventListener('click',event=>{const point=event.target.closest('[data-key-point]');if(point){const key=c.keyframes[Number(point.dataset.keyPoint)];if(key){stop();seek(c.start+key.time)}return}const remove=event.target.closest('[data-key-remove]');if(remove){snap();c.keyframes.splice(Number(remove.dataset.keyRemove),1);render()}});editor.addEventListener('change',event=>{const field=event.target.dataset.keyField;if(field){snap();const key=c.keyframes[Number(event.target.dataset.keyIndex)];if(key){key[field]=Number(event.target.value);c.keyframes.sort((a,b)=>a.time-b.time);render()}return}if(event.target.id==='pKeyEase'){const last=c.keyframes[c.keyframes.length-1];if(last){snap();last.ease=event.target.value;update()}}});update();}
function render(){mediaRender();timeline();inspector();draw();buttons()}
function dimensions(){const q=Math.max(480,Math.min(1080,Number(S.exportQuality)||1080)),w=Math.max(16,Number(S.sequenceWidth)||1920),h=Math.max(16,Number(S.sequenceHeight)||1080),ratio=w/h;return ratio>=1?[Math.round(q*ratio),q]:[q,Math.round(q/ratio)]}
function applyVignette(ctx,c,w,h){const amount=Math.max(0,Math.min(100,Number(c.vignette)||0));if(!amount)return;const gradient=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.16,w/2,h/2,Math.max(w,h)*.72);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(1,'rgba(0,0,0,'+(amount/100*.78)+')');ctx.save();ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.restore()}
function applyAdjustmentLayers(ctx,canvas,w,h){const layers=(S.adjustments||[]).filter(x=>S.time>=x.start&&S.time<x.start+x.duration);if(!layers.length)return;const scratch=S.adjustmentCanvas||(S.adjustmentCanvas=document.createElement('canvas'));if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h}const sc=scratch.getContext('2d');layers.forEach(layer=>{sc.clearRect(0,0,w,h);sc.drawImage(canvas,0,0);ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=Math.max(0,Math.min(1,Number(layer.opacity??100)/100));ctx.globalCompositeOperation=layer.blendMode||'source-over';ctx.filter='brightness('+Math.max(.05,Number(layer.brightness??100)/100)+') contrast('+Math.max(.05,Number(layer.contrast??100)/100)+') saturate('+Math.max(0,Number(layer.saturation??100)/100)+') hue-rotate('+Number(layer.hue||0)+'deg) blur('+Math.max(0,Number(layer.blur||0))+'px)';ctx.drawImage(scratch,0,0);ctx.restore();const amount=Math.max(0,Math.min(100,Number(layer.vignette)||0));if(amount){const g=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.16,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+(amount/100*.78)+')');ctx.save();ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.restore()}})}
function draw(){const cv=$('stCanvas'),d=dimensions();if(cv.width!==d[0]||cv.height!==d[1]){cv.width=d[0];cv.height=d[1]}const ctx=cv.getContext('2d');ctx.fillStyle='#080b13';ctx.fillRect(0,0,d[0],d[1]);const active=S.clips.filter(x=>S.time>=x.start&&S.time<x.start+x.duration).sort((a,b)=>(a.track||1)-(b.track||1));const c=active[0];active.forEach(c=>{if(c&&c.image){const local=S.time-c.start,keys=(c.keyframes||[]).slice().sort((a,b)=>a.time-b.time);let animatedScale=Number(c.scale)||100,animatedRotation=Number(c.rotation)||0,animatedX=Number(c.x??50),animatedY=Number(c.y??50),animatedOpacity=Number(c.opacity??100);if(keys.length){let before=keys[0],after=keys[keys.length-1];for(let i=0;i<keys.length-1;i++){if(local>=keys[i].time&&local<=keys[i+1].time){before=keys[i];after=keys[i+1];break}}const mix=(key,fallback)=>{const a=Number(before[key]??fallback),b=Number(after[key]??fallback);if(after.time<=before.time)return a;let p=Math.max(0,Math.min(1,(local-before.time)/(after.time-before.time)));const ease=after.ease||'linear';if(ease==='ease-in')p=p*p;else if(ease==='ease-out')p=1-(1-p)*(1-p);else if(ease==='ease-in-out')p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;return a+(b-a)*p};animatedScale=mix('scale',animatedScale);animatedRotation=mix('rotation',animatedRotation);animatedX=mix('x',animatedX);animatedY=mix('y',animatedY);animatedOpacity=mix('opacity',animatedOpacity)}const iw=c.image.naturalWidth,ih=c.image.naturalHeight,sc=(S.fitMode==='cover'?Math.max(d[0]/iw,d[1]/ih):Math.min(d[0]/iw,d[1]/ih))*animatedScale/100;ctx.save();ctx.globalCompositeOperation=c.blendMode||'source-over';ctx.globalAlpha=Math.max(0,Math.min(1,animatedOpacity/100));const edge=Math.min(1,local/.4,(c.duration-local)/.4);if(c.transition==='fade')ctx.globalAlpha*=edge;const motion=Math.max(0,Math.min(1,local/Math.max(.1,c.duration)));if(c.transition==='zoom')animatedScale*=.88+.12*motion;if(c.transition==='wipe-left'||c.transition==='wipe-right'){const reveal=Math.max(.02,Math.min(1,local/.45));ctx.beginPath();ctx.rect(c.transition==='wipe-left'?0:d[0]*(1-reveal),0,d[0]*reveal,d[1]);ctx.clip()}ctx.translate(d[0]*(animatedX/100),d[1]*(animatedY/100));ctx.rotate(animatedRotation*Math.PI/180);ctx.filter='brightness('+Math.max(.1,(Number(c.brightness??100)/100)*Math.pow(2,Number(c.exposure||0))+Number(c.shadows||0)/500-Number(c.highlights||0)/700)+') contrast('+Math.max(.1,(Number(c.contrast??100)+Number(c.highlights||0)*.16-Number(c.shadows||0)*.1)/100)+') saturate('+Math.max(0,(Number(c.saturation??100)/100)*(Number(c.vibrance??100)/100))+') hue-rotate('+((Number(c.tint||0)*.35+Number(c.hue||0))+(Number(c.temperature||0)<0?Math.abs(Number(c.temperature))*-.12:0)+(c.filter==='cool'?-8:c.filter==='teal-orange'?10:0))+'deg) '+(Number(c.temperature||0)>0?'sepia('+Math.min(.45,Number(c.temperature)/220)+') ':'')+(c.filter==='mono'||c.filter==='noir'?'grayscale(1)':c.filter==='warm'?'sepia(.3)':c.filter==='vintage'?'sepia(.25) contrast(.92) saturate(.85)':c.filter==='film'?'contrast(1.08) saturate(.88)':c.filter==='bleach'?'contrast(1.35) saturate(.65)':c.filter==='dream'?'brightness(1.08) saturate(.82)':c.filter==='teal-orange'?'contrast(1.12) saturate(1.18)':c.filter==='cool'?'hue-rotate(18deg)':c.filter==='cinema'?'contrast(1.15) saturate(1.08)':c.filter==='vivid'?'saturate(1.35) contrast(1.08)' :'')+' blur('+Math.max(0,Number(c.blur||0))+'px)';ctx.drawImage(c.image,-iw*sc/2,-ih*sc/2,iw*sc,ih*sc);ctx.restore();applyVignette(ctx,c,d[0],d[1])}else if(c&&c.video&&c.video.readyState>=2){const v=c.video,local=S.time-c.start,keys=(c.keyframes||[]).slice().sort((a,b)=>a.time-b.time);let animatedScale=Number(c.scale)||100,animatedRotation=Number(c.rotation)||0,animatedX=Number(c.x??50),animatedY=Number(c.y??50),animatedOpacity=Number(c.opacity??100);if(keys.length){let before=keys[0],after=keys[keys.length-1];for(let i=0;i<keys.length-1;i++){if(local>=keys[i].time&&local<=keys[i+1].time){before=keys[i];after=keys[i+1];break}}const mix=(key,fallback)=>{const a=Number(before[key]??fallback),b=Number(after[key]??fallback);if(after.time<=before.time)return a;let p=Math.max(0,Math.min(1,(local-before.time)/(after.time-before.time)));const ease=after.ease||'linear';if(ease==='ease-in')p=p*p;else if(ease==='ease-out')p=1-(1-p)*(1-p);else if(ease==='ease-in-out')p=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;return a+(b-a)*p};animatedScale=mix('scale',animatedScale);animatedRotation=mix('rotation',animatedRotation);animatedX=mix('x',animatedX);animatedY=mix('y',animatedY);animatedOpacity=mix('opacity',animatedOpacity)}const scale=(S.fitMode==='cover'?Math.max(d[0]/v.videoWidth,d[1]/v.videoHeight):Math.min(d[0]/v.videoWidth,d[1]/v.videoHeight))*animatedScale/100,w=v.videoWidth*scale,h=v.videoHeight*scale;ctx.save();ctx.globalCompositeOperation=c.blendMode||'source-over';const edge=Math.min(1,local/.4,(c.duration-local)/.4);ctx.globalAlpha=Math.max(0,Math.min(1,animatedOpacity/100));if(c.transition==='fade')ctx.globalAlpha*=edge;const motion=Math.max(0,Math.min(1,local/Math.max(.1,c.duration)));if(c.transition==='zoom')animatedScale*=.88+.12*motion;if(c.transition==='wipe-left'||c.transition==='wipe-right'){const reveal=Math.max(.02,Math.min(1,local/.45));ctx.beginPath();ctx.rect(c.transition==='wipe-left'?0:d[0]*(1-reveal),0,d[0]*reveal,d[1]);ctx.clip()}ctx.translate(d[0]*(animatedX/100),d[1]*(animatedY/100));ctx.rotate(animatedRotation*Math.PI/180);ctx.filter='brightness('+Math.max(.1,(Number(c.brightness??100)/100)*Math.pow(2,Number(c.exposure||0))+Number(c.shadows||0)/500-Number(c.highlights||0)/700)+') contrast('+Math.max(.1,(Number(c.contrast??100)+Number(c.highlights||0)*.16-Number(c.shadows||0)*.1)/100)+') saturate('+Math.max(0,(Number(c.saturation??100)/100)*(Number(c.vibrance??100)/100))+') hue-rotate('+((Number(c.tint||0)*.35+Number(c.hue||0))+(Number(c.temperature||0)<0?Math.abs(Number(c.temperature))*-.12:0)+(c.filter==='cool'?-8:c.filter==='teal-orange'?10:0))+'deg) '+(Number(c.temperature||0)>0?'sepia('+Math.min(.45,Number(c.temperature)/220)+') ':'')+(c.filter==='mono'||c.filter==='noir'?'grayscale(1)':c.filter==='warm'?'sepia(.3)':c.filter==='vintage'?'sepia(.25) contrast(.92) saturate(.85)':c.filter==='film'?'contrast(1.08) saturate(.88)':c.filter==='bleach'?'contrast(1.35) saturate(.65)':c.filter==='dream'?'brightness(1.08) saturate(.82)':c.filter==='teal-orange'?'contrast(1.12) saturate(1.18)':c.filter==='cool'?'hue-rotate(18deg)':c.filter==='cinema'?'contrast(1.15) saturate(1.08)':c.filter==='vivid'?'saturate(1.35) contrast(1.08)' :'')+' blur('+Math.max(0,Number(c.blur||0))+'px)';ctx.drawImage(v,-w/2,-h/2,w,h);ctx.restore();applyVignette(ctx,c,d[0],d[1])}});const t=S.titles.find(x=>S.time>=x.start&&S.time<x.start+x.duration);if(t){const local=S.time-t.start,progress=Math.max(0,Math.min(1,local/.45));let titleText=String(t.text||''),y=d[1]*(Number(t.positionY)||82)/100,scale=1;ctx.save();if(t.animation==='Fade')ctx.globalAlpha=progress;else if(t.animation==='Slide'){ctx.globalAlpha=progress;y+=d[1]*.08*(1-progress)}else if(t.animation==='Pop'){ctx.globalAlpha=progress;scale=.82+.18*progress}else if(t.animation==='Typewriter')titleText=titleText.slice(0,Math.ceil(titleText.length*Math.max(.02,Math.min(1,local/Math.max(.3,Math.min(2,titleText.length*.055))))));ctx.translate(d[0]/2,y);ctx.scale(scale,scale);ctx.fillStyle=t.color;ctx.font='bold '+Math.round(d[1]*t.size/100)+'px '+(t.fontFamily||'system-ui');ctx.textAlign='center';ctx.shadowColor=t.shadowColor||'#000';ctx.shadowBlur=t.shadow===false?0:14;if(t.stroke){ctx.lineWidth=Math.max(2,d[1]*.003);ctx.strokeStyle=t.stroke;ctx.strokeText(titleText,0,0)}ctx.fillText(titleText,0,0);ctx.restore()}$('stPreviewEmpty').style.display=c||t?'none':'grid';window.ClipForgeEditor?.drawExtras?.();applyAdjustmentLayers(ctx,cv,d[0],d[1]);$('stPlayhead').style.left=(150+S.time*S.zoom)+'px';$('stCurrent').textContent=fmt(S.time);$('stTimecode').textContent=fmt(S.time);if(S.playing){const sc=$('stInner')?.closest('.st-timeline-scroll'),px=150+S.time*S.zoom;if(sc){const target=Math.max(0,px-sc.clientWidth*.52);sc.scrollLeft+=(target-sc.scrollLeft)*.18}}}
function seek(t){S.time=Math.max(0,Math.min(total(),t));$('stScrub').value=String(Math.round(S.time/Math.max(1,total())*1000));const c=S.clips.find(x=>S.time>=x.start&&S.time<x.start+x.duration);if(c&&c.video){const p=(c.in||0)+(S.time-c.start)*(c.speed||1);if(Math.abs(c.video.currentTime-p)>.25)c.video.currentTime=p}draw()}
function stop(){S.playing=false;S.lastTick=0;cancelAnimationFrame(S.raf);S.clips.forEach(c=>c.video?.pause());(S.audioTracks||[S.audio]).filter(Boolean).forEach(a=>a.audio?.pause());$('stPlay').textContent='▶'}
function tick(){if(!S.playing)return;const now=performance.now(),delta=S.lastTick?Math.min(.1,Math.max(0,(now-S.lastTick)/1000)):1/Math.max(1,Number(S.exportFps)||30);S.lastTick=now;S.time+=delta;seek(S.time);const active=S.clips.filter(x=>S.time>=x.start&&S.time<x.start+x.duration);S.clips.forEach(x=>{if(!active.includes(x))x.video?.pause()});active.forEach(c=>{if(!c.video)return;const p=(c.in||0)+(S.time-c.start)*(c.speed||1);c.video.playbackRate=c.speed||1;c.video.muted=!!c.audioDetached;const clipLocal=S.time-c.start,clipFadeIn=c.audioFadeIn?Math.min(1,Math.max(0,clipLocal/c.audioFadeIn)):1,clipFadeOut=c.audioFadeOut?Math.min(1,Math.max(0,(c.duration-clipLocal)/c.audioFadeOut)):1;c.video.volume=Math.max(0,Math.min(1,(Number(c.audioVolume??100)/100)*clipFadeIn*clipFadeOut));if(Math.abs(c.video.currentTime-p)>.35)c.video.currentTime=p;if(c.video.paused)c.video.play().catch(()=>{})});(S.audioTracks||[S.audio]).filter(Boolean).forEach(a=>{if(!a.audio)return;const ap=a.in+S.time-a.start;if(S.time>=a.start&&S.time<a.start+a.duration){a.audio.volume=Math.max(0,Math.min(1,(Number(a.volume??80)/100)*(a.fadeIn?Math.min(1,Math.max(0,(S.time-a.start)/a.fadeIn)):1)*(a.fadeOut?Math.min(1,Math.max(0,(a.start+a.duration-S.time)/a.fadeOut)):1)));if(Math.abs(a.audio.currentTime-ap)>.35)a.audio.currentTime=Math.max(0,ap);if(a.audio.paused)a.audio.play().catch(()=>{})}else a.audio.pause()});if(S.time>=total()){stop();return}S.raf=requestAnimationFrame(tick)}
async function buildAudioWaveform(file){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;const ac=new C();try{const data=await file.arrayBuffer(),buf=await ac.decodeAudioData(data.slice(0)),channel=buf.getChannelData(0),count=96,step=Math.max(1,Math.floor(channel.length/count)),bars=[];for(let i=0;i<count;i++){let peak=0,end=Math.min(channel.length,(i+1)*step);for(let j=i*step;j<end;j+=4)peak=Math.max(peak,Math.abs(channel[j]));bars.push(Math.max(.035,peak))}return bars}catch(e){return null}finally{ac.close().catch(()=>{})}}
$('stImport').onchange=e=>{Array.from(e.target.files).forEach(f=>{const url=URL.createObjectURL(f);if(f.type.startsWith('audio/')){const a=new Audio(url);a.onloadedmetadata=()=>{const media={id:crypto.randomUUID(),name:f.name,file:f,url,kind:'audio',duration:a.duration,audio:a,waveform:null};S.media.push(media);mediaRender();buildAudioWaveform(f).then(wave=>{if(!wave)return;media.waveform=wave;(S.audioTracks||[]).filter(x=>x.url===url).forEach(x=>x.waveform=wave);if(S.audio?.url===url)S.audio.waveform=wave;window.ClipForgeEditor?.render?.()})}}else if(f.type.startsWith('image/')){const image=new Image();image.onload=()=>{S.media.push({id:crypto.randomUUID(),name:f.name,file:f,url,kind:'image',duration:5,image});mediaRender()};image.onerror=()=>{URL.revokeObjectURL(url);msg('Could not load image: '+f.name)};image.src=url}else{const v=document.createElement('video');v.src=url;v.preload='auto';v.muted=false;v.playsInline=true;v.onloadedmetadata=()=>{const media={id:crypto.randomUUID(),name:f.name,file:f,url,kind:'video',duration:v.duration,video:v,waveform:null};if(!S.sequenceWidth&&!S.sequenceHeight){S.sequenceWidth=v.videoWidth||1920;S.sequenceHeight=v.videoHeight||1080;const ratio=$('stRatio');ratio.value='source';$('stSeqW').value=String(S.sequenceWidth);$('stSeqH').value=String(S.sequenceHeight);draw()}S.media.push(media);mediaRender();buildAudioWaveform(f).then(wave=>{if(!wave)return;media.waveform=wave;window.ClipForgeEditor?.render?.()})}}});e.target.value=''};
$('stAddText').onclick=()=>{snap();const t={id:crypto.randomUUID(),name:'Text overlay',text:'Your title here',start:S.time,in:0,out:4,duration:4,color:'#ffffff',size:5,animation:'Fade'};S.titles.push(t);S.sel=t.id;render()};
$('stPlay').onclick=()=>{if(S.playing)stop();else{S.playing=true;S.lastTick=0;$('stPlay').textContent='Ⅱ';tick()}};$('stStop').onclick=()=>{stop();seek(0)};
$('stScrub').oninput=e=>{stop();seek(Number(e.target.value)/1000*total())};const setSequence=(w,h)=>{S.sequenceWidth=Math.max(16,Math.min(7680,Math.round(Number(w)||1920)));S.sequenceHeight=Math.max(16,Math.min(7680,Math.round(Number(h)||1080)));$('stSeqW').value=String(S.sequenceWidth);$('stSeqH').value=String(S.sequenceHeight);draw()};$('stRatio').onchange=()=>{const value=$('stRatio').value,source=S.media.find(m=>m.kind==='video'&&m.video);if(value==='source'){if(source)setSequence(source.video.videoWidth,source.video.videoHeight)}else if(value==='16:9')setSequence(1920,1080);else if(value==='9:16')setSequence(1080,1920);else if(value==='1:1')setSequence(1080,1080);else if(value==='4:5')setSequence(1080,1350);else if(value==='4:3')setSequence(1440,1080);else if(value==='21:9')setSequence(2520,1080);else draw()};$('stSeqW').onchange=()=>{$('stRatio').value='custom';setSequence($('stSeqW').value,$('stSeqH').value)};$('stSeqH').onchange=()=>{$('stRatio').value='custom';setSequence($('stSeqW').value,$('stSeqH').value)};$('stFitMode').onchange=()=>{S.fitMode=$('stFitMode').value;draw()};
$('stSplit').onclick=()=>{const c=S.clips.find(x=>x.id===S.sel);if(!c||S.time<=c.start+.05||S.time>=c.start+c.duration-.05){msg('Put the playhead inside a selected video clip to split it.');return}snap();const offset=S.time-c.start,sourceOffset=offset*(c.speed||1),keys=(c.keyframes||[]).slice().sort((a,b)=>a.time-b.time),stateAt=time=>{const base={scale:Number(c.scale)||100,rotation:Number(c.rotation)||0,x:Number(c.x??50),y:Number(c.y??50),opacity:Number(c.opacity??100)};if(!keys.length)return base;let before=keys[0],after=keys[keys.length-1];for(let i=0;i<keys.length-1;i++){if(time>=keys[i].time&&time<=keys[i+1].time){before=keys[i];after=keys[i+1];break}}const result={};Object.keys(base).forEach(key=>{const a=Number(before[key]??base[key]),b=Number(after[key]??base[key]),p=after.time<=before.time?0:Math.max(0,Math.min(1,(time-before.time)/(after.time-before.time)));result[key]=a+(b-a)*p});return result};const boundary={time:offset,...stateAt(offset)},firstKeys=keys.filter(k=>k.time<offset).map(k=>({...k})),secondKeys=keys.filter(k=>k.time>offset).map(k=>({...k,time:k.time-offset})),copy={...c,id:crypto.randomUUID(),keyframes:[{...boundary,time:0},...secondKeys],name:c.name+' (split)',start:S.time,in:(c.in||0)+sourceOffset,duration:c.duration-offset,out:c.out};c.keyframes=keys.length?[...firstKeys,boundary]:[];c.duration=offset;c.out=(c.in||0)+sourceOffset;S.clips.splice(S.clips.indexOf(c)+1,0,copy);S.sel=copy.id;render()};
$('stDelete').onclick=()=>{const c=current();if(!c)return;snap();S.clips=S.clips.filter(x=>x.id!==c.id);S.titles=S.titles.filter(x=>x.id!==c.id);S.overlays=(S.overlays||[]).filter(x=>x.id!==c.id);S.adjustments=(S.adjustments||[]).filter(x=>x.id!==c.id);S.captions=(S.captions||[]).filter(x=>x.id!==c.id);S.audioTracks=(S.audioTracks||[]).filter(x=>x.id!==c.id&&x.linkedVideoId!==c.id);if(S.audio&&S.audio.id===c.id)S.audio=S.audioTracks[0]||null;S.sel=null;window.ClipForgeEditor?.render?.()||render()};
$('stZoom').oninput=e=>{const sc=$('stInner').closest('.st-timeline-scroll'),anchor=S.time;S.zoom=Number(e.target.value);timeline();if(sc)sc.scrollLeft=Math.max(0,150+anchor*S.zoom-Math.min(sc.clientWidth*.35,260))};$('stZoomIn').onclick=()=>{$('stZoom').value=Math.min(180,Number($('stZoom').value)+10);$('stZoom').oninput({target:$('stZoom')})};$('stZoomOut').onclick=()=>{$('stZoom').value=Math.max(.2,Number($('stZoom').value)-10);$('stZoom').oninput({target:$('stZoom')})};$('stZoomFit').onclick=()=>{const sc=$('stInner').closest('.st-timeline-scroll'),available=Math.max(250,(sc?.clientWidth||900)-190);S.zoom=Math.max(.2,Math.min(180,available/Math.max(1,total())));timeline();if(sc)sc.scrollTo({left:0,behavior:'smooth'})};
$('stUndo').onclick=()=>{if(!S.undo.length)return;S.redo.push({videoTrackCount:S.videoTrackCount||4,clips:S.clips.map(c=>({...c,keyframes:(c.keyframes||[]).map(k=>({...k}))})),titles:S.titles.map(c=>({...c})),overlays:(S.overlays||[]).map(c=>({...c})),adjustments:(S.adjustments||[]).map(c=>({...c})),captions:(S.captions||[]).map(c=>({...c})),audio:S.audio?{...S.audio}:null,audioTracks:(S.audioTracks||[]).map(a=>({...a}))});const x=S.undo.pop();S.videoTrackCount=x.videoTrackCount||4;S.clips=x.clips;S.titles=x.titles;S.overlays=x.overlays||[];S.adjustments=x.adjustments||[];S.captions=x.captions||[];S.audio=x.audio;S.audioTracks=x.audioTracks||[];window.ClipForgeEditor?.render?.()||render()};$('stRedo').onclick=()=>{if(!S.redo.length)return;S.undo.push({videoTrackCount:S.videoTrackCount||4,clips:S.clips.map(c=>({...c,keyframes:(c.keyframes||[]).map(k=>({...k}))})),titles:S.titles.map(c=>({...c})),overlays:(S.overlays||[]).map(c=>({...c})),adjustments:(S.adjustments||[]).map(c=>({...c})),captions:(S.captions||[]).map(c=>({...c})),audio:S.audio?{...S.audio}:null,audioTracks:(S.audioTracks||[]).map(a=>({...a}))});const x=S.redo.pop();S.videoTrackCount=x.videoTrackCount||4;S.clips=x.clips;S.titles=x.titles;S.overlays=x.overlays||[];S.adjustments=x.adjustments||[];S.captions=x.captions||[];S.audio=x.audio;S.audioTracks=x.audioTracks||[];window.ClipForgeEditor?.render?.()||render()};
// Premiere-inspired keyboard map. Commands are scoped to the active Studio workspace.
if(!root.dataset.proShortcutsReady){
 root.dataset.proShortcutsReady='1';
 let lastTransportDirection=0;
 const frameStep=1/Math.max(1,Number(S.exportFps)||30);
 const activeVideo=()=>S.clips.filter(x=>S.time>=x.start-.001&&S.time<x.start+x.duration+.001).sort((a,b)=>(Number(b.track)||1)-(Number(a.track)||1))[0];
 const splitAtPlayhead=()=>{
  const selected=S.clips.find(x=>x.id===S.sel);
  const clip=selected&&S.time>selected.start+.05&&S.time<selected.start+selected.duration-.05?selected:activeVideo();
  if(!clip){msg('Place the playhead inside a video clip to split it.');return}
  S.sel=clip.id;$('stSplit')?.click();
 };
 const zoomBy=amount=>{const z=$('stZoom');if(!z)return;z.value=String(Math.max(.2,Math.min(180,Number(z.value)+amount)));z.dispatchEvent(new Event('input',{bubbles:true}))};
 const setRailTab=tab=>root.querySelector('[data-rail-tab="'+tab+'"]')?.click();
 document.addEventListener('keydown',event=>{
  if(!document.body.classList.contains('solo')||document.body.dataset.tool!=='editor')return;
  const target=event.target,typing=target.matches('input,textarea,select,[contenteditable=true]')||target.isContentEditable;
  if(typing)return;
  const key=event.key.toLowerCase(),mod=event.ctrlKey||event.metaKey,shift=event.shiftKey;
  if(event.code==='Space'){event.preventDefault();$('stPlay')?.click();return}
  if(mod&&key==='z'){event.preventDefault();(shift?$('stRedo'):$('stUndo'))?.click();return}
  if(mod&&key==='y'){event.preventDefault();$('stRedo')?.click();return}
  if(mod&&key==='s'){event.preventDefault();$('stProjectSave')?.click();return}
  if(mod&&key==='o'){event.preventDefault();$('stAppOpen')?.click();return}
  if(mod&&key==='i'){event.preventDefault();$('stImport')?.click();return}
  if(mod&&shift&&key==='e'){event.preventDefault();$('stExport')?.click();return}
  if(mod&&key==='k'||!mod&&key==='c'){event.preventDefault();splitAtPlayhead();return}
  if(key==='delete'||key==='backspace'){event.preventDefault();if(S.sel)$('stDelete')?.click();return}
  if(key==='j'){event.preventDefault();stop();seek(S.time-(shift?5:1));lastTransportDirection=-1;return}
  if(key==='k'&&!mod){event.preventDefault();stop();lastTransportDirection=0;return}
  if(key==='l'){event.preventDefault();if(!S.playing)$('stPlay')?.click();lastTransportDirection=1;return}
  if(key==='arrowleft'||key==='arrowright'||key===','||key==='.'){
   event.preventDefault();stop();const dir=(key==='arrowleft'||key===', ')?-1:1;seek(S.time+dir*frameStep*(shift?5:1));return;
  }
  if(key==='home'){event.preventDefault();stop();seek(0);return}
  if(key==='end'){event.preventDefault();stop();seek(total());return}
  if(!mod&&!shift&&key==='i'){event.preventDefault();markInOut('in');return}
  if(!mod&&!shift&&key==='o'){event.preventDefault();markInOut('out');return}
  if(mod&&shift&&key==='x'){event.preventDefault();clearInOut();return}
  if(!mod&&!shift&&key==='n'){event.preventDefault();const snap=$('stSnap');if(snap){snap.checked=!snap.checked;snap.dispatchEvent(new Event('change',{bubbles:true}));msg('Timeline snapping '+(snap.checked?'enabled.':'disabled.'));}return}
  if(!mod&&!shift&&key==='f'){event.preventDefault();$('stZoomFit')?.click();return}
  if(!mod&&!shift&&(key==='+'||key==='=')){event.preventDefault();zoomBy(10);return}
  if(!mod&&!shift&&key==='-'){event.preventDefault();zoomBy(-10);return}
  if(!mod&&!shift&&key==='d'){event.preventDefault();S.sel=null;api.render();return}
  if(!mod&&!shift&&['1','2','3','4','5','6','7','8'].includes(key)){
   event.preventDefault();setRailTab(({1:'media',2:'audio',3:'text',4:'captions',5:'effects',6:'transitions',7:'stickers',8:'tracks'})[key]);return;
  }
  if(!mod&&!shift&&key==='?'){event.preventDefault();root.querySelector('[data-pro-command="shortcuts"]')?.click();return}
 });
}const markInOut=kind=>{if(kind==='in'){S.inPoint=S.time;if(S.outPoint!=null&&S.outPoint<=S.inPoint)S.outPoint=null}else{S.outPoint=S.time;if(S.inPoint==null)S.inPoint=0;if(S.outPoint<=S.inPoint){msg('Out point must be after In point.');S.outPoint=null}}timeline();msg(kind==='in'?'Sequence In set at '+fmt(S.time):'Sequence Out set at '+fmt(S.time))};const clearInOut=()=>{S.inPoint=null;S.outPoint=null;timeline();msg('Sequence In/Out cleared.')};$('stMarkIn').onclick=()=>markInOut('in');$('stMarkOut').onclick=()=>markInOut('out');$('stClearMarks').onclick=clearInOut;$('stInner').onclick=e=>{if(e.target.closest('[data-id]'))return;const r=$('stInner').getBoundingClientRect();stop();seek(Math.max(0,(e.clientX-r.left-150)/S.zoom))};const timelineScroll=$('stInner').closest('.st-timeline-scroll');if(timelineScroll){timelineScroll.addEventListener('wheel',e=>{if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)){e.preventDefault();timelineScroll.scrollLeft+=e.deltaX||e.deltaY}else if(e.ctrlKey||e.metaKey){e.preventDefault();const z=$('stZoom');z.value=String(Math.max(.2,Math.min(180,Number(z.value)+(e.deltaY<0?5:-5))));z.dispatchEvent(new Event('input'))}},{passive:false});timelineScroll.addEventListener('pointerdown',e=>{if(e.button!==1||e.target.closest('[data-id]'))return;e.preventDefault();const x=e.clientX,left=timelineScroll.scrollLeft;const move=ev=>timelineScroll.scrollLeft=left-(ev.clientX-x);const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up)};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true})})};
$('stExport').onclick=async()=>{
 if(!S.clips.length){msg('Import a video before exporting.');return}
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){msg('Browser export is unavailable. Use a current Chrome or Edge.');return}
 stop();
 S.exportCancel=false;S.exporting=true;root.classList.add('is-exporting');
 const stream=$('stCanvas').captureStream(S.exportFps||30);
 let audioCtx=null,audioDest=null,rec=null;
 const audioItems=(S.audioTracks||[S.audio]).filter(Boolean).filter(a=>a.audio);
 const videoItems=[...new Set(S.clips.map(c=>c.video).filter(Boolean))];
 const routedMedia=[...new Set([...audioItems.map(a=>a.audio),...videoItems])];
 const cleanup=()=>{
  S.clips.forEach(c=>c.video?.pause());
  audioItems.forEach(a=>a.audio?.pause());
  if(stream)stream.getTracks().forEach(t=>t.stop());
  if(audioDest){
   routedMedia.forEach(media=>{const source=window.__clipForgeStudioAudioSources?.get(media);if(source){source.disconnect();source.connect(audioCtx.destination)}});
   audioDest.stream.getTracks().forEach(t=>t.stop());
  }
  S.exporting=false;S.exportRaf=0;root.classList.remove('is-exporting');
  $('stExport').disabled=false;
  const cancel=$('stAppCancel');if(cancel)cancel.hidden=true;
 };
 if(audioItems.length||videoItems.length){
  try{
   audioCtx=window.__clipForgeStudioAudioContext||(window.__clipForgeStudioAudioContext=new AudioContext());
   window.__clipForgeStudioAudioSources=window.__clipForgeStudioAudioSources||new WeakMap();
   audioDest=audioCtx.createMediaStreamDestination();
   routedMedia.forEach(media=>{
    let source=window.__clipForgeStudioAudioSources.get(media);
    if(!source){source=audioCtx.createMediaElementSource(media);window.__clipForgeStudioAudioSources.set(media,source)}
    source.disconnect();source.connect(audioDest);
   });
   audioItems.forEach(a=>{a.audio.currentTime=a.in||0;a.audio.volume=1});
   videoItems.forEach(video=>{video.muted=false;video.volume=1});
   audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
   await audioCtx.resume();
  }catch(e){msg('One or more audio tracks could not be attached; continuing with available audio.')}
 }
 const mime=typeof MediaRecorder.isTypeSupported==='function'?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x)):undefined;
 try{rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:(S.exportQuality||720)*9000}:{videoBitsPerSecond:(S.exportQuality||720)*9000})}
 catch(e){cleanup();msg('The browser encoder could not start.');return}
 const chunks=[];
 rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 rec.onstop=()=>{
  const cancelled=!!S.exportCancel;
  if(cancelled){cleanup();S.exportCancel=false;msg('Export cancelled. Your original media and edit remain in this session.');return}
  const blob=new Blob(chunks,{type:rec.mimeType||'video/webm'});
  if(blob.size<1500){cleanup();msg('Export output was empty. Try a shorter clip or another browser.');return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
  const projectName=(document.getElementById('stProjectName')?.value||'clipforge-edit').trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-+|-+$/g,'')||'clipforge-edit';
  a.download=projectName+'.'+(rec.mimeType&&rec.mimeType.includes('mp4')?'mp4':'webm');a.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  cleanup();msg('Export downloaded as '+(rec.mimeType&&rec.mimeType.includes('mp4')?'MP4':'WebM')+'.');
 };
 rec.onerror=()=>{S.exportCancel=true;try{if(rec.state!=='inactive')rec.stop()}catch(e){cleanup();msg('Video export failed.')}};
 $('stExport').disabled=true;
 const cancelButton=$('stAppCancel');if(cancelButton)cancelButton.hidden=false;
 msg('Rendering… keep this tab open. You can cancel the export at any time.');
 const exportStart=S.inPoint==null?0:Math.max(0,S.inPoint),exportEnd=S.outPoint==null?total():Math.min(total(),S.outPoint);if(exportEnd<=exportStart){cleanup();msg('Set an Out point after the In point before exporting.');return}let t=exportStart,last=performance.now();
 rec.start(200);
 const frame=()=>{
  if(S.exportCancel){if(rec.state!=='inactive')rec.stop();return}
  const now=performance.now();t+=(now-last)/1000;last=now;seek(t);
  msg('Rendering… '+Math.min(100,Math.round((t-exportStart)/Math.max(1,exportEnd-exportStart)*100))+'%');
  const active=S.clips.filter(x=>t>=x.start&&t<x.start+x.duration);
  active.forEach(c=>{if(!c.video)return;const p=(c.in||0)+(t-c.start)*(c.speed||1);if(Math.abs(c.video.currentTime-p)>.3)c.video.currentTime=p;c.video.playbackRate=c.speed||1;c.video.muted=false;const clipLocal=t-c.start,clipFadeIn=c.audioFadeIn?Math.min(1,Math.max(0,clipLocal/c.audioFadeIn)):1,clipFadeOut=c.audioFadeOut?Math.min(1,Math.max(0,(c.duration-clipLocal)/c.audioFadeOut)):1;c.video.volume=Math.max(0,Math.min(1,(Number(c.audioVolume??100)/100)*clipFadeIn*clipFadeOut));c.video.play().catch(()=>{})});
  (S.audioTracks||[S.audio]).filter(Boolean).forEach(a=>{
   if(!a.audio)return;
   if(t>=a.start&&t<a.start+a.duration){
    const p=a.in+t-a.start;if(Math.abs(a.audio.currentTime-p)>.3)a.audio.currentTime=p;
    a.audio.volume=Math.max(0,Math.min(1,(Number(a.volume??80)/100)*(a.fadeIn?Math.min(1,Math.max(0,(t-a.start)/a.fadeIn)):1)*(a.fadeOut?Math.min(1,Math.max(0,(a.start+a.duration-t)/a.fadeOut)):1)));
    a.audio.play().catch(()=>{});
   }else a.audio.pause();
  });
  if(t>=exportEnd){seek(exportEnd);rec.stop();return}
  S.exportRaf=requestAnimationFrame(frame);
 };
 frame();
};
window.ClipForgeEditor={state:S,render,seek,stop,snap,total,current,draw,timeline,inspector,addToTimeline,msg,format:fmt};render();window.addEventListener('beforeunload',()=>S.media.forEach(m=>URL.revokeObjectURL(m.url)));
})();

/* ===== merged from clipforge-theme.js ===== */
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
].join('\n');
function apply(frame){try{const doc=frame.contentDocument;if(!doc||!doc.head)return;let style=doc.getElementById('cf-unified-theme');if(!style){style=doc.createElement('style');style.id='cf-unified-theme';doc.head.appendChild(style)}if(style.textContent!==frameCss)style.textContent=frameCss;const theme=document.documentElement.dataset.theme;if(theme)doc.documentElement.dataset.theme=theme;else doc.documentElement.removeAttribute('data-theme')}catch(e){}}
function sync(){document.querySelectorAll('iframe').forEach(apply)}
new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-theme']});
document.addEventListener('load',e=>{if(e.target instanceof HTMLIFrameElement)apply(e.target)},true);
document.addEventListener('click',e=>{if(e.target.closest('#theme'))requestAnimationFrame(sync)},true);
sync();
})();

