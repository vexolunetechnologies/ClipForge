/* ClipForge Phase 1 UX: lightweight guidance, no changes to media engines. */
(function(){
 'use strict';
 var workflows={
  shorts:{name:'Video to Shorts',headline:'Turn one long video into Shorts',steps:['Add your video','Find strong moments','Preview and save each Short'],tip:'Auto count and 1080p are already selected. Change them only if you want.',best:'Short clips from one longer recording',task:'Make short clips',file:'#file'},
  trailer:{name:'Trailer Maker',headline:'Build a trailer from your footage',steps:['Upload a video','Analyze and edit trailer parts','Preview and export MP4'],tip:'Start with the automatic plan. Opening text, title and music are optional.',best:'A trailer or promo for a video',task:'Make a trailer',file:'#file'},
  animator:{name:'Picture to Video',headline:'Animate your photos in a few steps',steps:['Add pictures','Pick motion and duration','Create and save the video'],tip:'The picture uploader opens just below. You can add music and voiceover later.',best:'A slideshow with camera movement',task:'Animate photos',file:null},
  reverse:{name:'Reverse Video',headline:'Play a video backwards',steps:['Choose a video','Pick sound and size','Reverse and save MP4'],tip:'Keep the default settings for a quick reverse, or turn the sound off.',best:'A backward-playing video',task:'Reverse a video',file:'#rvFile'},
  montage:{name:'Video Montage',headline:'Combine several clips into one video',steps:['Add two or more videos','Arrange and preview','Export one MP4'],tip:'Ratio matches your first video by default. Music, captions and transitions are optional.',best:'Combining several clips into one',task:'Combine videos',file:'#vmFiles'},
  highlights:{name:'Highlights Studio',headline:'Make a highlight reel automatically',steps:['Add a long video','Choose a final duration','Generate and save highlights'],tip:'AI creates short scenes with music. Original dialogue is muted in the finished highlight reel.',best:'A music-backed highlight montage',task:'Make highlights',file:'#hsVideo'},
  editor:{name:'Studio Editor',headline:'Create a custom edit on a timeline',steps:['Import media','Trim and arrange on the timeline','Preview and export'],tip:'Start with a video. You can use advanced timeline controls as you need them.',best:'Hands-on multi-track video editing',task:'Edit a video',file:'#stImport'},
  captions:{name:'Captions Studio',headline:'Add subtitles to your entire video',steps:['Upload a video','Generate and review captions','Choose a style and export'],tip:'Generate captions first, then adjust text, position or animation as needed.',best:'Subtitles for an entire video',task:'Add subtitles',file:'#cfCapFile'}
 };
 var panels={shorts:'tool',trailer:'tool',animator:'iaTool',reverse:'rvTool',montage:'vmTool',highlights:'highlightsTool',editor:'editorTool',captions:'cfCaptionsWorkspace'};
 var order=['shorts','trailer','animator','reverse','montage','highlights','editor','captions'];

 function el(tag,cls,text){
  var node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 }
 function pickKey(anchor){
  var raw=anchor.getAttribute('href')||'';
  var hit=/^(?:#|\/tools\/)(shorts|trailer|animator|reverse|montage|highlights|editor|captions)\/?$/.exec(raw);
  return hit&&hit[1];
 }
 function buildCatalog(){
  var section=document.getElementById('tools'),grid=section&&section.querySelector('.grid.tools');
  if(!grid||document.getElementById('cf-ux-chooser'))return;
  var chooser=el('div','cf-ux-chooser');chooser.id='cf-ux-chooser';
  chooser.setAttribute('aria-label','Find the right video tool');
  var intro=el('div','cf-ux-chooser-intro');
  intro.append(el('strong','', 'What do you want to make?'));
  intro.append(el('span','','Choose your goal and ClipForge opens the right tool.'));
  chooser.append(intro);
  var links=el('div','cf-ux-chooser-links');
  for(var i=0;i<order.length;i++){
   var key=order[i],cfg=workflows[key],a=el('a','cf-ux-choice');
   a.href='/tools/'+key+'/';
   a.append(el('strong','',cfg.task));
   a.append(el('small','',cfg.best));
   links.append(a);
  }
  chooser.append(links);
  grid.parentNode.insertBefore(chooser,grid);
  var cards=grid.querySelectorAll('a.toolcard[href]');
  for(var j=0;j<cards.length;j++){
   var card=cards[j],type=pickKey(card),config=workflows[type];
   if(!config||card.querySelector('.cf-ux-best'))continue;
   var best=el('span','cf-ux-best','Best for: '+config.best);
   var heading=card.querySelector('h3');
   if(heading)heading.insertAdjacentElement('afterend',best);
  }
 }
 function makeGuide(key){
  var config=workflows[key],guide=el('div','cf-ux-guide');
  guide.dataset.uxFor=key;
  guide.setAttribute('aria-label',config.name+' quick start');
  var head=el('div','cf-ux-guide-head'),copy=el('div','cf-ux-guide-copy');
  copy.append(el('span','cf-ux-eyebrow','QUICK START · 3 STEPS'));
  copy.append(el('strong','cf-ux-guide-title',config.headline));
  head.append(copy);
  var button=el('button','cf-ux-open',key==='animator'?'See picture uploader':key==='editor'?'Import media':key==='montage'?'Add clips':'Choose video');
  button.type='button';
  button.setAttribute('aria-label',button.textContent+' for '+config.name);
  button.addEventListener('click',function(){
   var input=config.file&&document.querySelector(config.file);
   if(input&&!input.disabled){input.click();return;}
   var target=key==='animator'?document.querySelector('#iaTool iframe, #iaBox'):document.getElementById(panels[key]);
   if(target){target.scrollIntoView({behavior:'smooth',block:'start'});if(target.focus)target.focus();}
  });
  head.append(button);
  guide.append(head);
  var steps=el('ol','cf-ux-steps');
  for(var i=0;i<config.steps.length;i++){
   var item=el('li','cf-ux-step');
   item.append(el('span','cf-ux-step-number',String(i+1)));
   item.append(el('span','cf-ux-step-label',config.steps[i]));
   steps.append(item);
  }
  guide.append(steps);
  guide.append(el('p','cf-ux-guide-tip',config.tip));
  return guide;
 }
 function update(){
  var key=document.body.dataset.page==='workspace'?document.body.dataset.tool:null;
  if(!key||!workflows[key])return;
  var panel=document.getElementById(panels[key]);
  if(!panel||panel.querySelector('.cf-ux-guide[data-ux-for="'+key+'"]'))return;
  var guide=makeGuide(key);
  if(key==='editor'){
   var toolbar=panel.querySelector('.st-appbar, .cf-studio-topbar');
   if(toolbar)toolbar.insertAdjacentElement('afterend',guide);
   else panel.insertBefore(guide,panel.firstChild);
  }else if(key==='captions'){
   var header=panel.querySelector('.cf-page-head');
   if(header)header.insertAdjacentElement('afterend',guide);
   else panel.insertBefore(guide,panel.firstChild);
  }else{
   var heading=panel.querySelector('.cf-page-head');
   if(heading)heading.insertAdjacentElement('afterend',guide);
   else panel.insertBefore(guide,panel.firstChild);
  }
 }
 function setup(){
  buildCatalog();
  update();
  window.addEventListener('hashchange',function(){requestAnimationFrame(update)});
  new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['data-page','data-tool']});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
 else setup();
})();
