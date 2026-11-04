/* Shared caption-style library: previews and all exports use this renderer. */
(()=>{'use strict';
const list=[["classic","Classic"],["pop","Pop"],["box","Box"],["karaoke","Karaoke"],["hl","Highlight"],["neon","Neon"],["min","Minimal"],["pill","Pill"],["news","News bar"],["outline","Bold outline"],["urdu","Urdu Nastaliq"],["hormozi","Hormozi Style"],["mrbeast","MrBeast Style"],["alex","Alex Style"],["word","Word-by-Word Captions"],["dynamic","Dynamic Captions"],["popup","Pop-up Captions"],["glow","Glow Captions"],["impact","Bold Impact Captions"],["highlight-word","Highlight Word Captions"],["bounce","Bounce Captions"],["neon-pro","Neon Captions"],["podcast","Podcast Captions"],["tiktok","TikTok Viral Captions"],["reels","Instagram Reels Captions"],["kinetic","Kinetic Typography"],["typewriter","Typewriter Captions"],["boxed","Boxed Captions"],["minimal-white","Minimal White Captions"],["animated","Animated Subtitles"],["punch","Punch Captions"],["gaming","Gaming Captions"],["news-caption","News Captions"],["cinematic","Cinematic Captions"],["red","Red Highlight Captions"],["sliding","Sliding Captions"],["bubble","Bubble Captions"],["aesthetic","Aesthetic Captions"],["multi","Multi-Color Captions"],["trending","Trending Shorts Captions"]];
const normalize=k=>k==='minimal'?'min':k==='news-bar'?'news':(k||'classic');
function draw(ctx,text,key,w,h,t=0,d=2){
 key=normalize(key);text=String(text||'').trim();if(!text||!w||!h)return;
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
  if(['word','dynamic','popup','kinetic','animated','sliding','bounce','highlight-word','red','multi','karaoke','hl','punch'].includes(key)){
   const total=ctx.measureText(ln).width,space=ctx.measureText(' ').width;let x=w/2-total/2;
   parts.forEach(p=>{const ww=ctx.measureText(p).width,idx=wordIndex++,on=idx===active,done=idx<=active;let yy=y;
    if(['bounce','popup','punch'].includes(key)&&on)yy-=Math.abs(Math.sin(t*8))*fs*.16;
    if(key==='sliding'&&on)x+=Math.sin(t*8)*fs*.12;
    if(['highlight-word','hl'].includes(key)&&on){ctx.fillStyle='#ffc629';round(x-pad*.3,yy-fs*.8,ww+pad*.6,fs*1.15,5);ctx.fillStyle='#171717'}
    else if(key==='red'&&on){ctx.fillStyle='#e53935';round(x-pad*.3,yy-fs*.8,ww+pad*.6,fs*1.15,4);ctx.fillStyle='#fff'}
    else if(key==='multi')ctx.fillStyle=['#ffdf4d','#55e6ff','#ff77ad','#a6ff78'][idx%4];
    else if(['karaoke','hl'].includes(key))ctx.fillStyle=done?'#ffe14d':'#fff';
    else if(['word','dynamic','popup','kinetic','animated','bounce','punch'].includes(key))ctx.fillStyle=on?'#ffe14d':'#fff';
    else ctx.fillStyle='#fff';
    if(key==='kinetic'&&on){ctx.shadowColor='#ffb000';ctx.shadowBlur=fs*.5}
    if(key==='gaming'){ctx.lineWidth=fs*.13;ctx.strokeStyle='#050505';ctx.strokeText(p,x+ww/2,yy)}
    ctx.fillText(p,x+ww/2,yy);ctx.shadowBlur=0;ctx.font=(rtl||dev?'700 ':'800 ')+fs+'px '+font;x+=ww+space;
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
window.ClipForgeCaptionStyles={list,draw,normalize,populateSelect};
})();