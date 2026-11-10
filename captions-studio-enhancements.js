/* Captions Studio ONLY: optional placement, size, and eight extra motion/pro looks.
   Shorts and the 55-item shared style library are deliberately unchanged. */
(()=>{
'use strict';
const presets=[
 ["motion-rise","Motion Rise"],["motion-slide","Slide Reveal"],
 ["motion-type","Type Reveal"],["motion-flash","Impact Flash"],
 ["pro-lowerthird","Broadcast Lower Third"],["pro-documentary","Documentary Gold"],
 ["pro-editorial","Editorial Title"],["pro-glass","Studio Glass"]
];
const isStudioStyle=key=>presets.some(row=>row[0]===key);
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const defaultPlacement=()=>({x:.5,y:.77,size:1});
const normalisePlacement=(data={})=>({
 x:clamp(Number.isFinite(+data.x)?+data.x:.5,0,1),
 y:clamp(Number.isFinite(+data.y)?+data.y:.77,0,1),
 size:clamp(Number.isFinite(+data.size)?+data.size:1,.6,1.5)
});
function safePlacement(data,text,key,w,h){
 const p=normalisePlacement(data),s=String(text||'').trim();
 // Conservative bounds for long multiline phrases and wide title bars.
 const wordCount=s.split(/\s+/).filter(Boolean).length;
 let widthRatio=clamp(s.length*.018+wordCount*.027,.28,.91);
 if(['news','news-caption','cinematic'].includes(key))widthRatio=.94;
 if(key==='podcast')widthRatio=Math.max(.84,widthRatio);
 if(key==='pro-lowerthird')widthRatio=Math.max(.78,widthRatio);
 if(key==='pro-glass')widthRatio=Math.max(.70,widthRatio);
 const wide=clamp(widthRatio*p.size/2+.045,.05,.49);
 let heightRatio=s.length>38?.30:s.length>22?.23:.17;
 if(/[\u0590-\u08ff]/.test(s))heightRatio*=1.18;
 const tall=clamp(heightRatio*p.size/2+.055,.07,.47);
 return {x:clamp(p.x,wide,1-wide),y:clamp(p.y,tall,1-tall),size:p.size,
  widthRatio:clamp(widthRatio*p.size,.12,.97),heightRatio:clamp(heightRatio*p.size,.10,.80)};
}
function round(ctx,x,y,w,h,r){
 if(w<=0||h<=0)return;
 ctx.beginPath();
 if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,Math.min(r,h/2,w/2));
 else ctx.rect(x,y,w,h);
 ctx.fill();
}
function linesFor(ctx,text,maxWidth){
 const words=String(text||'').trim().split(/\s+/).filter(Boolean),rows=[];
 let row='';
 for(const word of words){
  const joined=row?row+' '+word:word;
  if(row&&ctx.measureText(joined).width>maxWidth){rows.push(row);row=word}
  else row=joined;
 }
 if(row)rows.push(row);
 return rows.slice(0,3);
}
function drawStudioStyle(ctx,text,key,w,h,t=0,d=2){
 if(!text)return;
 const rtl=/[\u0590-\u08ff]/.test(text),dev=/[\u0900-\u097f]/.test(text);
 const scale=w/720,fs=Math.max(9,Math.round((key==='pro-documentary'?43:key==='pro-lowerthird'?39:key==='pro-editorial'?53:key==='motion-flash'?66:52)*scale));
 const font=rtl?'"Noto Nastaliq Urdu","Noto Naskh Arabic",serif':
  dev?'"Noto Sans Devanagari",sans-serif':
  key==='pro-documentary'?'Georgia,serif':'Arial,sans-serif';
 const elapsed=Math.max(0,Number(t)||0),entrance=clamp(elapsed/.46,0,1);
 const ease=1-Math.pow(1-entrance,3);
 const mid=h*.77,lh=fs*(rtl?1.58:1.24);
 ctx.save();
 ctx.direction=rtl?'rtl':'ltr';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font=(rtl||dev?'700 ':'900 ')+fs+'px '+font;
 const lines=linesFor(ctx,text,w*.78);
 if(!lines.length){ctx.restore();return}
 const maxLine=Math.max(...lines.map(s=>ctx.measureText(s).width));
 const bw=Math.min(w*.89,maxLine+fs*.72),bh=lines.length*lh+fs*.4;
 const left=(w-bw)/2,top=mid-bh/2;
 if(key==='motion-rise'){
  ctx.globalAlpha=entrance;
  const pop=entrance<.75?.83+ease*.24:1+.07*(1-entrance);
  ctx.translate(w/2,mid+fs*.55*(1-ease));ctx.scale(pop,pop);ctx.translate(-w/2,-mid);
  ctx.fillStyle='rgba(4,10,19,.72)';round(ctx,left,top,bw,bh,fs*.14);
 }else if(key==='motion-slide'){
  ctx.globalAlpha=entrance;
  ctx.translate((rtl?1:-1)*w*.20*(1-ease),0);
  ctx.fillStyle='rgba(7,19,35,.80)';round(ctx,left,top,bw,bh,fs*.16);
  ctx.fillStyle='#4ae0e2';round(ctx,rtl?left+bw-5*scale:left,top,5*scale,bh,2*scale);
 }else if(key==='motion-type'){
  ctx.fillStyle='rgba(3,10,25,.83)';round(ctx,left,top,bw,bh,fs*.2);
  ctx.beginPath();
  if(rtl)ctx.rect(left+bw*(1-entrance),top,bw*entrance,bh);
  else ctx.rect(left,top,bw*entrance,bh);
  ctx.clip();
 }else if(key==='motion-flash'){
  ctx.globalAlpha=Math.max(.17,entrance);
  const pulse=1+.08*Math.sin(Math.min(1,elapsed/.45)*Math.PI);
  ctx.translate(w/2,mid);ctx.scale(pulse,pulse);ctx.translate(-w/2,-mid);
  ctx.shadowColor='#ffc43f';ctx.shadowBlur=fs*(.22+.16*(1-entrance));
 }else if(key==='pro-lowerthird'){
  ctx.fillStyle='rgba(9,14,31,.93)';round(ctx,left,top,bw,bh,fs*.13);
  const g=ctx.createLinearGradient(left,0,left+bw,0);g.addColorStop(0,'#7159fa');g.addColorStop(1,'#33bfd9');
  ctx.fillStyle=g;round(ctx,left,top,7*scale,bh,3*scale);
  ctx.fillStyle='#61e5e7';round(ctx,left+fs*.25,top+6*scale,bw-fs*.50,2*scale,1*scale);
 }else if(key==='pro-documentary'){
  ctx.fillStyle='rgba(7,12,20,.69)';round(ctx,left-fs*.15,top-fs*.16,bw+fs*.3,bh+fs*.4,fs*.04);
  ctx.fillStyle='#d9b97d';round(ctx,left,top+bh+fs*.18,bw,2*scale,1*scale);
 }else if(key==='pro-editorial'){
  ctx.fillStyle='rgba(3,7,18,.88)';round(ctx,left,top,bw,bh,fs*.04);
  ctx.fillStyle='#f16f62';round(ctx,left-fs*.08,top-fs*.15,fs*.28,fs*.28,fs*.04);
  ctx.fillStyle='#65e3f1';round(ctx,left+fs*.3,top+bh+3*scale,bw-fs*.6,3*scale,1*scale);
 }else if(key==='pro-glass'){
  const g=ctx.createLinearGradient(0,top,w,top+bh);
  g.addColorStop(0,'rgba(34,47,90,.93)');g.addColorStop(1,'rgba(25,31,65,.87)');
  ctx.fillStyle=g;round(ctx,left,top,bw,bh,fs*.25);
  ctx.strokeStyle='rgba(160,209,255,.70)';ctx.lineWidth=Math.max(1,1.4*scale);
  ctx.beginPath();ctx.roundRect?.(left,top,bw,bh,fs*.25);ctx.stroke();
  ctx.fillStyle='#57dbe9';round(ctx,left+bw*.13,top+bh-4*scale,bw*.74,2*scale,1*scale);
 }
 ctx.shadowColor=key==='motion-flash'?'#edbe45':'rgba(0,0,0,.55)';
 ctx.shadowBlur=key==='motion-flash'?ctx.shadowBlur:fs*.12;
 ctx.lineJoin='round';
 lines.forEach((line,i)=>{
  const y=mid-(lines.length-1)*lh/2+i*lh;
  ctx.lineWidth=fs*.11;ctx.strokeStyle='rgba(2,5,14,.78)';
  if(['motion-flash','motion-rise','pro-editorial'].includes(key))ctx.strokeText(line,w/2,y);
  ctx.fillStyle=key==='motion-flash'?'#ffd746':key==='pro-documentary'?'#f5ddb5':
   key==='motion-slide'?'#a6f6f0':key==='motion-rise'?'#f7fffb':'#fff';
  ctx.fillText(line,w/2,y);
 });
 ctx.restore(); // Restore the drawing state, including any reveal clip.
}
function draw(ctx,text,key,w,h,t=0,d=2,placement=null){
 if(!text||w<=0||h<=0)return null;
 const renderer=isStudioStyle(key)?drawStudioStyle:window.ClipForgeCaptionStyles.draw;
 if(!placement){renderer(ctx,text,key,w,h,t,d);return null}
 const p=safePlacement(placement,text,key,w,h);
 const nativeAnchor=isStudioStyle(key)||window.ClipForgeCaptionStyles.modernPresets.some(r=>r[0]===key)?.75:.78;
 ctx.save();
 ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
 ctx.translate((p.x-.5)*w,(p.y-nativeAnchor)*h);
 ctx.translate(w/2,nativeAnchor*h);ctx.scale(p.size,p.size);ctx.translate(-w/2,-nativeAnchor*h);
 renderer(ctx,text,key,w,h,t,d);
 ctx.restore();
 return p;
}
window.ClipForgeStudioCaptions={presets,draw,safePlacement,defaultPlacement,normalisePlacement,isStudioStyle};
})();
