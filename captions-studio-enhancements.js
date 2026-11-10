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
/* Optional Captions Studio-only styling. Neutral defaults preserve the old renderer. */
const defaultLook=()=>({
 font:"auto",color:"#ffffff",customColor:false,outlineColor:"#050505",
 outline:0,shadow:0,background:0,tracking:0,
 effect:"template",speed:1,duration:.6,safe:false,platform:"reels"
});
const fonts={
 arial:"Arial,sans-serif",georgia:"Georgia,serif",
 impact:"Impact,Arial,sans-serif",mono:'"Courier New",monospace',
 nastaliq:'"Noto Nastaliq Urdu","Noto Naskh Arabic",serif',
 naskh:'"Noto Naskh Arabic",serif',
 devanagari:'"Noto Sans Devanagari",sans-serif'
};
function normaliseLook(data={}){
 const p=defaultLook(),hex=(v,fallback)=>/^#[a-f0-9]{6}$/i.test(v||"")?v:fallback;
 return {
  font:fonts[data.font]?data.font:"auto",
  color:hex(data.color,p.color),customColor:!!data.customColor,
  outlineColor:hex(data.outlineColor,p.outlineColor),
  outline:clamp(Number(data.outline)||0,0,12),
  shadow:clamp(Number(data.shadow)||0,0,30),
  background:clamp(Number(data.background)||0,0,85),
  tracking:clamp(Number(data.tracking)||0,-2,8),
  effect:["template","fade","slide","bounce","typewriter"].includes(data.effect)?data.effect:"template",
  speed:clamp(Number(data.speed)||1,.5,2),
  duration:clamp(Number(data.duration)||.6,.2,2),
  safe:!!data.safe,
  platform:["reels","tiktok","shorts"].includes(data.platform)?data.platform:"reels"
 };
}
function decorateContext(ctx,look,w){
 const font=fonts[look.font],spacing=look.tracking*(w/720);
 const overrideText=look.customColor||look.outline>0||look.shadow>0;
 if(!font&&!overrideText&&!look.tracking)return ctx;
 return new Proxy(ctx,{
  get(target,prop){
   if(prop==="fillText")return (...args)=>{
    if(!overrideText)return target.fillText(...args);
    target.save();
    if(look.customColor)target.fillStyle=look.color;
    if(look.shadow>0){
     target.shadowColor="rgba(0,0,0,.94)";
     target.shadowBlur=look.shadow*w/720;
     target.shadowOffsetY=look.shadow*w/1500;
    }
    if(look.outline>0){
     target.strokeStyle=look.outlineColor;target.lineWidth=look.outline*w/720;
     target.lineJoin="round";target.strokeText(...args);
    }
    const result=target.fillText(...args);
    target.restore();
    return result;
   };
   if(prop==="strokeText"&&look.outline>0)return ()=>{};
   const value=Reflect.get(target,prop,target);
   return typeof value==="function"?value.bind(target):value;
  },
  set(target,prop,value){
   if(prop==="font"&&font){
    const match=String(value).match(/^(.*?\d+(?:\.\d+)?px)\s+.+$/);
    target.font=match?match[1]+" "+font:value;
    if("letterSpacing" in target&&look.tracking)target.letterSpacing=spacing+"px";
    return true;
   }
   if(prop==="font"&&look.tracking&&"letterSpacing" in target)target.letterSpacing=spacing+"px";
   Reflect.set(target,prop,value,target);
   return true;
  }
 });
}
function guideBox(w,h,platform){
 const left=w*(platform==="tiktok"?.10:.09),right=w*(platform==="tiktok"?.22:.10);
 const top=h*.14,bottom=h*(platform==="shorts"?.23:.27);
 return {x:left,y:top,width:w-left-right,height:h-top-bottom};
}
function drawSafeGuide(ctx,w,h,platform="reels"){
 const b=guideBox(w,h,platform);
 ctx.save();
 ctx.setLineDash([Math.max(3,w*.008),Math.max(3,w*.007)]);
 ctx.strokeStyle="rgba(96,238,217,.92)";
 ctx.lineWidth=Math.max(1,w/500);
 ctx.strokeRect(b.x,b.y,b.width,b.height);
 ctx.setLineDash([]);
 ctx.fillStyle="rgba(4,12,23,.78)";
 ctx.font=Math.max(9,w*.018)+"px Arial,sans-serif";
 ctx.textAlign="left";ctx.textBaseline="top";
 ctx.fillText("SAFE AREA · PREVIEW ONLY",b.x+5,b.y+5);
 ctx.restore();
}
function draw(ctx,text,key,w,h,t=0,d=2,placement=null,lookData=null){
 if(!text||w<=0||h<=0)return null;
 const renderer=isStudioStyle(key)?drawStudioStyle:window.ClipForgeCaptionStyles.draw;
 if(!placement){renderer(ctx,text,key,w,h,t,d);return null}
 const p=safePlacement(placement,text,key,w,h),look=normaliseLook(lookData||{});
 const nativeAnchor=isStudioStyle(key)||window.ClipForgeCaptionStyles.modernPresets.some(r=>r[0]===key)?.75:.78;
 const time=t*look.speed*(.6/look.duration);
 const phase=clamp(t*look.speed/look.duration,0,1);
 ctx.save();
 ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
 if(look.background>0){
  const bw=Math.min(w*.95,w*p.widthRatio+Math.max(8,w*.03));
  const bh=Math.min(h*.90,h*p.heightRatio+Math.max(6,h*.016));
  ctx.fillStyle="rgba(5,9,19,"+(look.background/100)+")";
  round(ctx,p.x*w-bw/2,p.y*h-bh/2,bw,bh,Math.max(3,w*.012));
 }
 if(look.effect!=="template"){
  const cx=p.x*w,cy=p.y*h;
  if(look.effect==="fade")ctx.globalAlpha*=phase;
  if(look.effect==="slide")ctx.translate(0,h*.06*(1-Math.pow(1-phase,3)));
  if(look.effect==="bounce"){
   const pop=1+.19*(1-phase)*Math.sin(Math.PI*phase*2);
   ctx.translate(cx,cy);ctx.scale(pop,pop);ctx.translate(-cx,-cy);
  }
  if(look.effect==="typewriter"){
   const b=guideBox(w,h,"reels");
   // Reveal as a clip, not trimmed characters, preserving Urdu/Hindi shaping.
   const maxWidth=Math.min(w*.98,Math.max(w*p.widthRatio+40,b.width*.60));
   const x=cx-maxWidth/2;
   const rtl=/[\u0590-\u08ff]/.test(text);
   ctx.beginPath();
   ctx.rect(rtl?x+maxWidth*(1-phase):x,0,Math.max(0,maxWidth*phase),h);
   ctx.clip();
  }
 }
 ctx.translate((p.x-.5)*w,(p.y-.77)*h); // Neutral default retains the old style's own anchor.
 ctx.translate(w/2,nativeAnchor*h);ctx.scale(p.size,p.size);ctx.translate(-w/2,-nativeAnchor*h);
 renderer(decorateContext(ctx,look,w),text,key,w,h,time,d);
 ctx.restore();
 return p;
}
window.ClipForgeStudioCaptions={
 presets,draw,safePlacement,defaultPlacement,normalisePlacement,isStudioStyle,
 defaultLook,normaliseLook,drawSafeGuide,guideBox
};
})();
