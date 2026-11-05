/* Shared caption-style library: previews and all exports use this renderer. */
(()=>{'use strict';
const classicList=[["classic","Classic"],["pop","Pop"],["box","Box"],["karaoke","Karaoke"],["karaoke-pro","Karaoke Captions"],["hl","Highlight"],["neon","Neon"],["min","Minimal"],["pill","Pill"],["news","News bar"],["outline","Bold outline"],["urdu","Urdu Nastaliq"],["hormozi","Hormozi Style"],["mrbeast","MrBeast Style"],["alex","Alex Style"],["word","Word-by-Word Captions"],["dynamic","Dynamic Captions"],["popup","Pop-up Captions"],["glow","Glow Captions"],["impact","Bold Impact Captions"],["highlight-word","Highlight Word Captions"],["bounce","Bounce Captions"],["neon-pro","Neon Captions"],["podcast","Podcast Captions"],["tiktok","TikTok Viral Captions"],["reels","Instagram Reels Captions"],["kinetic","Kinetic Typography"],["typewriter","Typewriter Captions"],["boxed","Boxed Captions"],["minimal-white","Minimal White Captions"],["animated","Animated Subtitles"],["punch","Punch Captions"],["gaming","Gaming Captions"],["news-caption","News Captions"],["cinematic","Cinematic Captions"],["red","Red Highlight Captions"],["sliding","Sliding Captions"],["bubble","Bubble Captions"],["aesthetic","Aesthetic Captions"],["multi","Multi-Color Captions"],["trending","Trending Shorts Captions"]];

/* 2026-inspired, original styles. Legacy IDs remain for existing saved projects. */
const modernPresets=[
 ["creator-yellow","Creator Yellow"],["word-spotlight","Word Spotlight"],
 ["pop-punch","Bold Pop"],["karaoke-wave","Karaoke Wave"],
 ["marker-sweep","Marker Highlight"],["glass-subtitle","Glass Subtitle"],
 ["cinema-gold","Cinema Gold"],["drama-white","Drama Dialogue"],
 ["podcast-lime","Podcast Lime"],["bubble-blue","Bubble Blue"],
 ["editorial-minimal","Editorial Minimal"],["neon-coral","Coral Glow"],
 ["urdu-cinema","Urdu Cinema"],["bold-stack","Stacked Hook"]
];
const groups=[
 {id:"trending",label:"Trending",ids:modernPresets.map(x=>x[0])},
 {id:"drama",label:"Drama",ids:["cinema-gold","drama-white","urdu-cinema","glass-subtitle","editorial-minimal","classic","urdu","cinematic"]},
 {id:"bold",label:"Bold & Pop",ids:["creator-yellow","word-spotlight","pop-punch","karaoke-wave","marker-sweep","podcast-lime","bubble-blue","bold-stack","hormozi","word","bounce"]},
 {id:"clean",label:"Clean",ids:["glass-subtitle","editorial-minimal","drama-white","cinema-gold","classic","minimal-white","min","box"]},
 {id:"classic",label:"Original 41",ids:classicList.map(x=>x[0])},
 {id:"all",label:"All",ids:[...modernPresets,...classicList].map(x=>x[0])}
];
const list=[...modernPresets,...classicList];
function drawModern(ctx,text,key,w,h,t,d){
 const rtl=/[\u0590-\u08ff]/.test(text),dev=/[\u0900-\u097f]/.test(text);
 const scale=w/720,fs=Math.max(11,Math.round((
  ["pop-punch","bold-stack"].includes(key)?76:
  ["creator-yellow","word-spotlight","marker-sweep"].includes(key)?56:
  ["cinema-gold","editorial-minimal","drama-white","urdu-cinema"].includes(key)?42:49
 )*scale));
 const font=rtl?'"Noto Nastaliq Urdu","Noto Naskh Arabic",serif':
   dev?'"Noto Sans Devanagari",sans-serif':
   ["cinema-gold","editorial-minimal","urdu-cinema"].includes(key)?'Georgia,serif':'Arial,sans-serif';
 const raw=text.split(/\s+/).filter(Boolean);
 if(!raw.length)return;
 const phase=Math.max(0,Math.min(.999,(Number(t)||0)/Math.max(.2,Number(d)||2)));
 const active=Math.min(raw.length-1,Math.floor(phase*raw.length));
 const single=["pop-punch","bold-stack","bubble-blue"].includes(key);
 const words=single?(key==="bold-stack"?raw.slice(active,active+2):[raw[active]]):raw;
 const fx=(key==="bold-stack"?Math.round(fs*.78):fs);
 const max=w*.88,lh=fx*(rtl?1.63:1.24),centerY=h*.75;
 const round=(x,y,ww,hh,r=10)=>{
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(x,y,ww,hh,r);
  else ctx.rect(x,y,ww,hh);
  ctx.fill();
 };
 ctx.save();
 ctx.direction=rtl?'rtl':'ltr';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
 ctx.font=(rtl||dev?'700 ':'900 ')+fx+'px '+font;
 let lines=[],line=[];
 for(const word of words){
  let joined=[...line,word].join(' ');
  if(line.length&&ctx.measureText(joined).width>max){lines.push(line);line=[word]}else line.push(word);
 }
 if(line.length)lines.push(line);
 lines=lines.slice(0,3);
 const maxLineWidth=Math.max(...lines.map(ln=>ctx.measureText(ln.join(' ')).width)),padding=fx*.36;
 const height=lines.length*lh+fx*.45;
 const top=centerY-height/2,blockWidth=Math.min(w*.94,maxLineWidth+padding*2);
 if(["glass-subtitle","podcast-lime","bubble-blue"].includes(key)){
  ctx.fillStyle=key==="podcast-lime"?"rgba(11,17,23,.92)":key==="bubble-blue"?"#126cf4":"rgba(18,24,36,.83)";
  round((w-blockWidth)/2,top,blockWidth,height,fx*.35);
  if(key==="podcast-lime"){ctx.fillStyle="#afff58";round((w-blockWidth)/2,top,5*scale,height,2*scale)}
 }
 if(["cinema-gold","urdu-cinema"].includes(key)){
  ctx.fillStyle="rgba(6,9,20,.73)";
  round((w-blockWidth)/2-7*scale,top-6*scale,blockWidth+14*scale,height+12*scale,5*scale);
  ctx.fillStyle="#dcb878";round((w-blockWidth)/2,top-7*scale,blockWidth,2*scale,1*scale);
 }
 if(key==="drama-white"){
  ctx.fillStyle="rgba(7,9,17,.51)";
  round((w-blockWidth)/2,top,blockWidth,height,4*scale);
 }
 const lime="#c3ff5a",yellow="#ffe04e",coral="#ff7667",blue="#6fd6ff";
 let wi=single?active:0;
 lines.forEach((parts,row)=>{
  const full=parts.join(' '),total=ctx.measureText(full).width,sp=ctx.measureText(' ').width;
  let x=rtl?w/2+total/2:w/2-total/2;
  const y=centerY-(lines.length-1)*lh/2+row*lh;
  parts.forEach(word=>{
   const length=ctx.measureText(word).width,x0=rtl?x-length:x;
   const on=single||wi===active,done=wi<=active;
   let color="#fff",yy=y;
   if(key==="creator-yellow")color=on?yellow:"#fff";
   if(key==="word-spotlight")color=on?"#fff":"#aeb5c0";
   if(key==="pop-punch")color=coral;
   if(key==="karaoke-wave")color=done?yellow:"#fff";
   if(key==="marker-sweep")color=on?"#101d1f":"#fff";
   if(key==="glass-subtitle")color=on?blue:"#fff";
   if(key==="cinema-gold")color="#f9dfad";
   if(key==="drama-white")color="#fff";
   if(key==="podcast-lime")color=on?lime:"#fff";
   if(key==="bubble-blue")color="#fff";
   if(key==="editorial-minimal")color="#faf8f3";
   if(key==="neon-coral")color=on?coral:"#fff";
   if(key==="urdu-cinema")color=on?yellow:"#fff";
   if(key==="bold-stack")color=on?yellow:"#fff";
   if(key==="marker-sweep"&&on){ctx.fillStyle=yellow;round(x0-5*scale,y-fx*.6,length+10*scale,fx*1.17,4*scale)}
   if(key==="word-spotlight"&&on){ctx.fillStyle="#4379ff";round(x0-5*scale,y-fx*.6,length+10*scale,fx*1.17,8*scale)}
   if(key==="pop-punch"){yy-=Math.sin(phase*Math.PI)*fx*.12;ctx.shadowColor=coral;ctx.shadowBlur=fx*.22}
   if(key==="neon-coral"&&on){ctx.shadowColor=coral;ctx.shadowBlur=fx*.45}
   ctx.fillStyle=color;
   if(["creator-yellow","pop-punch","karaoke-wave","drama-white","neon-coral","bold-stack","urdu-cinema"].includes(key)){
    ctx.strokeStyle="rgba(5,8,13,.94)";ctx.lineWidth=fx*(rtl?.09:.16);
    ctx.strokeText(word,x0+length/2,yy);
   }
   ctx.fillText(word,x0+length/2,yy);
   ctx.shadowBlur=0;ctx.shadowColor="transparent";
   x+=rtl?-(length+sp):length+sp;wi++;
  });
 });
 if(key==="cinema-gold"||key==="editorial-minimal"){
  ctx.fillStyle=key==="cinema-gold"?"#c69b66":"rgba(255,255,255,.75)";
  round(w*.36,top+height+6*scale,w*.28,2*scale,1*scale);
 }
 ctx.restore();
}

const normalize=k=>k==='minimal'?'min':k==='news-bar'?'news':(k||'classic');
function draw(ctx,text,key,w,h,t=0,d=2){
 key=normalize(key);text=String(text||'').trim();if(!text||!w||!h)return;
 if(modernPresets.some(x=>x[0]===key)){drawModern(ctx,text,key,w,h,t,d);return}
 const rtl=/[\u0590-\u08ff]/.test(text),dev=/[\u0900-\u097f]/.test(text);
 const font=rtl?'"Noto Nastaliq Urdu","Noto Naskh Arabic",serif':dev?'"Noto Sans Devanagari",sans-serif':'Arial,sans-serif';
 const scale=w/720,fs=Math.max(16,Math.round((key==='urdu'&&rtl?48:['min','minimal-white','aesthetic'].includes(key)?34:['impact','mrbeast','punch','gaming'].includes(key)?54:42)*scale));
 const words=text.split(/\s+/).filter(Boolean),max=w*.86,lh=fs*(rtl?1.42:1.2),center=h*.78;
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.direction=rtl?'rtl':'ltr';ctx.font=(rtl||dev?'700 ':'800 ')+fs+'px '+font;
 let lines=[],line='';for(const word of words){const q=line?line+' '+word:word;if(ctx.measureText(q).width>max&&line){lines.push(line);line=word}else line=q}if(line)lines.push(line);lines=lines.slice(0,3);
 const widths=lines.map(x=>ctx.measureText(x).width),pad=fs*.34,bw=Math.min(max,Math.max(...widths)+pad*2),bh=lines.length*lh+pad,top=center-(lines.length-1)*lh/2-lh/2-pad/2;
 const round=(x,y,ww,hh,r)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,ww,hh,r);else ctx.rect(x,y,ww,hh);ctx.fill()};
 const bg=(color,r=8)=>{ctx.fillStyle=color;round((w-bw)/2,top,bw,bh,r*scale)};
 if(['box','boxed','hl','highlight-word','pill','bubble','podcast','gaming'].includes(key))bg(['hl','highlight-word'].includes(key)?'#f5bd32':'rgba(0,0,0,.78)',['pill','bubble'].includes(key)?bh/2:8);
 if(['news','news-caption'].includes(key)){ctx.fillStyle='rgba(8,10,14,.95)';ctx.fillRect(w*.04,top,w*.92,bh);ctx.fillStyle=key==='news'?'#f4d34e':'#e53935';ctx.fillRect(w*.04,top,7*scale,bh)}
 if(key==='podcast'){ctx.fillStyle='rgba(16,18,26,.94)';round(w*.08,top,w*.84,bh,12);ctx.fillStyle='#65e6ce';ctx.fillRect(w*.08,top,5*scale,bh)}
 if(['neon','neon-pro','glow'].includes(key)){ctx.shadowColor=key==='neon-pro'?'#ff3be8':'#35e6ff';ctx.shadowBlur=fs*.65}
 if(key==='aesthetic'){ctx.shadowColor='rgba(0,0,0,.7)';ctx.shadowBlur=fs*.3;ctx.shadowOffsetY=2*scale}
 const active=Math.min(words.length-1,Math.floor(Math.max(0,Math.min(.999,t/Math.max(.1,d)))*words.length));let wordIndex=0;
 lines.forEach((ln,i)=>{const y=center-(lines.length-1)*lh/2+i*lh,parts=ln.split(/\s+/);
  if(['word','dynamic','popup','kinetic','animated','sliding','bounce','highlight-word','red','multi','karaoke','karaoke-pro','hl','punch'].includes(key)){
   const total=ctx.measureText(ln).width,space=ctx.measureText(' ').width;let x=rtl?w/2+total/2:w/2-total/2;
   parts.forEach(p=>{const ww=ctx.measureText(p).width,idx=wordIndex++,on=idx===active,done=idx<=active;let yy=y,x0=rtl?x-ww:x;
    if(['bounce','popup','punch'].includes(key)&&on)yy-=Math.abs(Math.sin(t*8))*fs*.16;
    if(key==='sliding'&&on){const shift=Math.sin(t*8)*fs*.12;x+=rtl?-shift:shift;x0+=rtl?-shift:shift}
    if(['highlight-word','hl'].includes(key)&&on){ctx.fillStyle='#ffc629';round(x0-pad*.3,yy-fs*.8,ww+pad*.6,fs*1.15,5);ctx.fillStyle='#171717'}
    else if(key==='red'&&on){ctx.fillStyle='#e53935';round(x0-pad*.3,yy-fs*.8,ww+pad*.6,fs*1.15,4);ctx.fillStyle='#fff'}
    else if(key==='multi')ctx.fillStyle=['#ffdf4d','#55e6ff','#ff77ad','#a6ff78'][idx%4];
    else if(['karaoke','karaoke-pro','hl'].includes(key))ctx.fillStyle=done?'#ffe14d':'#fff';
    else if(['word','dynamic','popup','kinetic','animated','bounce','punch'].includes(key))ctx.fillStyle=on?'#ffe14d':'#fff';
    else ctx.fillStyle='#fff';
    if(key==='kinetic'&&on){ctx.shadowColor='#ffb000';ctx.shadowBlur=fs*.5}
    if(key==='gaming'){ctx.lineWidth=fs*.13;ctx.strokeStyle='#050505';ctx.strokeText(p,x0+ww/2,yy)}
    ctx.fillText(p,x0+ww/2,yy);ctx.shadowBlur=0;ctx.font=(rtl||dev?'700 ':'800 ')+fs+'px '+font;x+=rtl?-(ww+space):(ww+space);
   });
  }else{
   if(['classic','pop','min','outline','urdu','minimal-white','cinematic','aesthetic','hormozi','alex','mrbeast','impact','gaming','tiktok','reels','trending','punch'].includes(key)){ctx.lineWidth=fs*(['outline','impact','mrbeast'].includes(key)?.24:.13);ctx.strokeStyle='#050505';ctx.strokeText(ln,w/2,y)}
   ctx.fillStyle=['pop','hormozi'].includes(key)?'#ffe34d':['neon','neon-pro','glow'].includes(key)?'#e9fdff':key==='news'?'#fff':key==='red'?'#ff4b4b':key==='bubble'?'#1b2230':key==='multi'?['#ffdf4d','#55e6ff','#ff77ad'][i%3]:'#fff';
   if(key==='typewriter')ctx.fillText(ln.slice(0,Math.max(1,Math.ceil(ln.length*t/Math.max(.1,d)))),w/2,y);else ctx.fillText(ln,w/2,y);
  }
 });
 if(key==='cinematic'){ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(0,h*.69,w,h*.22);ctx.fillStyle='#e8c98b';ctx.fillRect(w*.12,h*.69,w*.12,2*scale)}
 if(key==='aesthetic'){ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=scale;ctx.beginPath();ctx.moveTo(w*.3,h*.88);ctx.lineTo(w*.7,h*.88);ctx.stroke()}
 ctx.restore();
}
function populateSelect(select){if(!select)return;const value=normalize(select.value);select.innerHTML='';list.forEach(([id,label])=>{const o=document.createElement('option');o.value=id;o.textContent=label;select.append(o)});select.value=list.some(x=>x[0]===value)?value:'classic'}
window.ClipForgeCaptionStyles={list,draw,normalize,populateSelect,modernPresets,groups};
})();