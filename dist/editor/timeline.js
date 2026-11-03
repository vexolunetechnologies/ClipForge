/* ClipForge Studio: extended timeline tools, subtitle cues and local project exchange. */
(() => {
  "use strict";
  const api = window.ClipForgeEditor;
  if (!api || !api.state) return;
  const S = api.state;
  S.overlays = S.overlays || [];
  S.adjustments = S.adjustments || [];
  S.captions = S.captions || [];
  S.snapEnabled = true;
  const $ = (id) => document.getElementById(id);
  const uid = () => crypto.randomUUID();
  const say = (message) => { if ($("stStatus")) $("stStatus").textContent = message; };
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const getClip = (id) => S.clips.find(x => x.id === id) || S.titles.find(x => x.id === id) || S.overlays.find(x => x.id === id) || S.adjustments.find(x => x.id === id) || S.captions.find(x => x.id === id) || (S.audioTracks || []).find(x => x.id === id) || (S.audio && S.audio.id === id ? S.audio : null);
  const len = (x) => Math.max(.1, Number(x.duration) || .1);
  const timelineItems = () => [
    ...S.clips, ...S.titles, ...S.overlays, ...S.adjustments, ...S.captions,
    ...(S.audioTracks || []), ...(S.audio && !(S.audioTracks || []).some(a => a.id === S.audio.id) ? [S.audio] : [])
  ];
  function snapTime(time, moving) {
    const value = Math.max(0, Number(time) || 0);
    if (!S.snapEnabled) return value;
    const threshold = 9 / Math.max(10, Number(S.zoom) || 1);
    let best = value, distance = threshold;
    for (const item of timelineItems()) {
      if (!item || item.id === moving?.id) continue;
      for (const edge of [Number(item.start) || 0, (Number(item.start) || 0) + len(item)]) {
        const delta = Math.abs(edge - value);
        if (delta <= distance) { best = edge; distance = delta; }
      }
    }
    return Math.max(0, best);
  }

  function snapshot() {
    S.undo.push({
      videoTrackCount:Math.max(4,Math.min(8,Number(S.videoTrackCount)||4)), clips: S.clips.map(x => ({...x,keyframes:(x.keyframes || []).map(k => ({...k}))})), titles: S.titles.map(x => ({...x})),
      overlays: S.overlays.map(x => ({...x})), adjustments:S.adjustments.map(x => ({...x})), captions: S.captions.map(x => ({...x})),
      audio: S.audio ? {...S.audio} : null,
      audioTracks: (S.audioTracks || []).map(x => ({...x}))
    });
    if (S.undo.length > 40) S.undo.shift();
    S.redo = [];
  }

  function clipButton(x, kind) {
    return '<button type="button" class="st-clip-block ' + kind + (S.sel === x.id ? ' is-selected' : '')
      + '" data-id="' + safe(x.id) + '" style="left:' + (x.start * S.zoom) + 'px;width:' + Math.max(46, len(x) * S.zoom) + 'px">'
      + '<span class="st-trim-handle left" data-trim="left"></span><b>' + safe(x.name || x.text || kind)
      + '</b><small>' + len(x).toFixed(1) + 's</small>' + (kind === "audio" && Array.isArray(x.waveform) ? '<span class="st-waveform">' + x.waveform.map(v => '<i style="height:' + Math.max(8,Math.min(100,Math.round(v*100))) + '%"></i>').join("") + '</span>' : "") + '<span class="st-trim-handle right" data-trim="right"></span></button>';
  }

  function lane(id, label, after, items, kind) {
    let row = $(id);
    if (!row) {
      row = document.createElement("div");
      row.id = id;
      row.className = "st-lane";
      row.innerHTML = '<div class="st-track-label">' + label + '</div><div class="st-lane-content"></div>';
      const anchor = $(after);
      if (anchor && anchor.parentElement) anchor.parentElement.after(row);
      else $("stInner").append(row);
    }
    const content = row.querySelector(".st-lane-content");
    const html = items.map(x => clipButton(x, kind)).join("");
    if (content.innerHTML !== html) content.innerHTML = html;
  }

  function renderLanes() {
    if (!$("stInner")) return;
    const maxVideoTracks = Math.max(4, Math.min(8, Number(S.videoTrackCount) || 4));
    for (let stale = maxVideoTracks + 1; stale <= 12; stale++) $( "stVideoLane" + stale + "Row")?.remove();
    const addTrackButton = $("stAddVideoTrack");
    if (addTrackButton) addTrackButton.disabled = maxVideoTracks >= 8;
    let previousVideoLane = "stVideoLane2";
    for (let track = 3; track <= Math.min(8, Math.max(4, Number(S.videoTrackCount) || 4)); track++) {
      const rowId = "stVideoLane" + track + "Row";
      lane(rowId, "VIDEO " + track, previousVideoLane, S.clips.filter(x => Number(x.track || 1) === track), "video");
      previousVideoLane = rowId;
    }
    lane("stOverlayLaneRow", "OVERLAYS", "stTextLane", S.overlays, "overlay");
    lane("stCaptionLaneRow", "CAPTIONS", "stOverlayLaneRow", S.captions, "caption");
    let previousAudioLane = "stAudioLane";
    for (let index = 1; index < (S.audioTracks || []).length; index++) {
      const rowId = "stAudioLane" + (index + 1) + "Row";
      lane(rowId, "AUDIO " + (index + 1), previousAudioLane, [S.audioTracks[index]], "audio");
      previousAudioLane = rowId;
    }
  }

  function actions() {
    if ($("stCreativeTools")) return;
    const panel = document.createElement("section");
    panel.id = "stCreativeTools";
    panel.className = "st-advanced-tools";
    panel.innerHTML = '<div class="st-panel-title">CREATIVE TOOLS</div>'
      + '<button class="st-tool" id="stShape">＋ Add shape</button>'
      + '<button class="st-tool" id="stAddAdjustment">＋ Add adjustment layer</button>'
      + '<button class="st-tool" id="stSticker">＋ Add sticker</button>'
      + '<button class="st-tool" id="stCaption">＋ Add caption</button>'
      + '<button class="st-tool" id="stAddVideoTrack">＋ Add video track</button>'
      + '<label class="st-tool st-file-action">Import subtitles (.srt / .vtt)<input id="stSubFile" type="file" accept=".srt,.vtt,text/vtt" hidden></label>'
      + '<div class="st-panel-title st-spaced">TIMELINE</div>'
      + '<label class="st-toggle"><input id="stSnap" type="checkbox" checked> Snap to clips</label>'
      + '<label class="st-prop"><span>Export resolution</span><select id="stQuality"><option value="480">480p</option><option value="720" selected>720p</option><option value="1080">1080p</option></select></label>'
      + '<label class="st-prop"><span>Frame rate</span><select id="stFps"><option value="24">24 FPS</option><option value="30" selected>30 FPS</option><option value="60">60 FPS</option></select></label>'
      + '<button class="st-tool" id="stProjectSave">↓ Export project file</button>'
      + '<label class="st-tool st-file-action">Load project file<input id="stProjectLoad" type="file" accept=".clipforge,.json,application/json" hidden></label>'
      + '<small class="st-hint">Project files store edit decisions only. Import original media first, then load the project file. Nothing is uploaded or autosaved.</small>';
    document.querySelector(".st-assets")?.append(panel);
    $("stShape").onclick = () => addOverlay("rect");
    $("stAddAdjustment").onclick = addAdjustment;
    $("stSticker").onclick = () => addOverlay("sticker");
    $("stCaption").onclick = () => addCaption("Your caption");
    $("stAddVideoTrack").onclick = () => { const current = Math.min(8, Math.max(4, Number(S.videoTrackCount) || 4)); if (current >= 8) { say("Studio supports up to 8 video tracks."); $("stAddVideoTrack").disabled = true; return; } snapshot(); S.videoTrackCount = current + 1; api.render(); $("stAddVideoTrack").disabled = S.videoTrackCount >= 8; say("Video track " + S.videoTrackCount + " added. Drag a clip onto the new lane."); };
    $("stSnap").onchange = e => { S.snapEnabled = e.target.checked; };
    $("stQuality").onchange = e => { S.exportQuality = Number(e.target.value); api.render(); say("Export resolution set to " + e.target.value + "p."); };
    $("stFps").onchange = e => { S.exportFps = Number(e.target.value); say("Export frame rate set to " + e.target.value + " FPS."); };
    $("stSubFile").onchange = importSubtitles;
    $("stProjectSave").onclick = saveProject;
    $("stProjectLoad").onchange = loadProject;
  }

  function addOverlay(shape) {
    snapshot();
    const x = { id:uid(), name:shape === "sticker" ? "Sticker" : "Shape overlay", shape,
      text:shape === "sticker" ? "★" : "", color:"#8b7cff", x:50, y:50, w:28, h:16,
      size:9, opacity:1, start:S.time, duration:4 };
    S.overlays.push(x); S.sel = x.id; api.render();
    say("Overlay added. Select it to adjust its position, size and color.");
  }

  function addAdjustment() {
    snapshot();
    const x={id:uid(),name:"Adjustment Layer",start:S.time,duration:Math.max(1,Math.min(10,api.total()-S.time||4)),brightness:100,contrast:100,saturation:100,hue:0,blur:0,vignette:0,opacity:100,blendMode:"source-over"};
    S.adjustments.push(x);S.sel=x.id;api.render();say("Adjustment layer added. Extend or trim it on the timeline, then adjust its effect controls.");
  }

  function addCaption(text) {
    snapshot();
    const x = { id:uid(), name:"Caption", text, start:S.time, duration:3, color:"#ffffff" };
    S.captions.push(x); S.sel = x.id; api.render();
  }

  function seconds(value) {
    const p = value.trim().replace(",", ".").split(":");
    const s = Number(p.pop()), m = Number(p.pop() || 0), h = Number(p.pop() || 0);
    return h * 3600 + m * 60 + s;
  }

  async function importSubtitles(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const raw = (await file.text()).replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n/, "");
      const cues = [];
      raw.split(/\n{2,}/).forEach(part => {
        const lines = part.split("\n").map(x => x.trim()).filter(Boolean);
        const index = lines.findIndex(x => x.includes("-->"));
        if (index < 0) return;
        const times = lines[index].split("-->").map(x => x.trim().split(/\s+/)[0]);
        const start = seconds(times[0]), end = seconds(times[1]);
        const text = lines.slice(index + 1).join(" ").replace(/<[^>]*>/g, "");
        if (text && end > start) cues.push({ id:uid(), name:"Subtitle", text, start, duration:end-start, color:"#ffffff" });
      });
      if (!cues.length) throw new Error("No valid subtitle cues found.");
      snapshot(); S.captions.push(...cues); api.render(); say(cues.length + " subtitle cues imported.");
    } catch (error) { say(error.message || "Could not read subtitle file."); }
    event.target.value = "";
  }

  function saveProject() {
    const data = {
      format:"clipforge-project", version:3, projectName:$("stProjectName")?.value || "Untitled Project", ratio:$("stRatio")?.value || "source", sequenceWidth:S.sequenceWidth || 1920, sequenceHeight:S.sequenceHeight || 1080, fitMode:S.fitMode || "contain", inPoint:S.inPoint, outPoint:S.outPoint, videoTrackCount:S.videoTrackCount || 4, exportQuality:S.exportQuality || 720, exportFps:S.exportFps || 30, zoom:S.zoom || 80, snapEnabled:$("stSnap")?.checked !== false,
      clips:S.clips.map(x => ({name:x.name,kind:x.kind || "video",start:x.start,in:x.in,out:x.out,sourceDuration:x.sourceDuration || x.video?.duration || x.out,sourceSize:x.file?.size || x.sourceSize || null,sourceLastModified:x.file?.lastModified || x.sourceLastModified || null,sourceType:x.file?.type || x.sourceType || null,duration:x.duration,track:x.track,filter:x.filter,brightness:x.brightness,contrast:x.contrast,saturation:x.saturation,exposure:x.exposure,temperature:x.temperature,tint:x.tint,vibrance:x.vibrance,highlights:x.highlights,shadows:x.shadows,blur:x.blur,vignette:x.vignette,hue:x.hue,blendMode:x.blendMode,scale:x.scale,rotation:x.rotation,speed:x.speed,audioVolume:x.audioVolume,audioFadeIn:x.audioFadeIn,audioFadeOut:x.audioFadeOut,x:x.x,y:x.y,transition:x.transition,keyframes:x.keyframes || []})),
      titles:S.titles.map(x => ({name:x.name,text:x.text,start:x.start,duration:x.duration,color:x.color,size:x.size,animation:x.animation,fontFamily:x.fontFamily,positionY:x.positionY,stroke:x.stroke,shadowColor:x.shadowColor,shadow:x.shadow})),
      overlays:S.overlays.map(x => ({...x})), adjustments:S.adjustments.map(x => ({...x})), captions:S.captions.map(x => ({...x})),
      audio:S.audio ? {name:S.audio.name,start:S.audio.start,in:S.audio.in,out:S.audio.out,duration:S.audio.duration,volume:S.audio.volume,fadeIn:S.audio.fadeIn,fadeOut:S.audio.fadeOut} : null,
      audioTracks:(S.audioTracks || []).map(x => ({name:x.name,start:x.start,in:x.in,out:x.out,duration:x.duration,sourceDuration:x.sourceDuration || x.audio?.duration || x.out,sourceSize:x.file?.size || x.sourceSize || null,sourceLastModified:x.file?.lastModified || x.sourceLastModified || null,sourceType:x.file?.type || x.sourceType || null,volume:x.volume,fadeIn:x.fadeIn,fadeOut:x.fadeOut,track:x.track}))
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:"application/json"}));
    const a = document.createElement("a"); a.href=url; const projectName = (document.getElementById("stProjectName")?.value || "clipforge-project").trim().replace(/[^a-z0-9-_]+/gi,"-").replace(/^-+|-+$/g,"") || "clipforge-project"; a.download=projectName+".clipforge"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    say("Project edit file exported. Media remains on this device.");
  }

  async function loadProject(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== "clipforge-project" || !Array.isArray(data.clips)) throw new Error("Invalid ClipForge project file.");
      snapshot();
      const findAsset = saved => S.media.find(m => m.name === saved.name && (!saved.sourceSize || m.file?.size === saved.sourceSize) && (!saved.sourceLastModified || m.file?.lastModified === saved.sourceLastModified) && (!saved.sourceType || m.file?.type === saved.sourceType)) || S.media.find(m => m.name === saved.name);
      const missing = [];
      S.clips = data.clips.flatMap(saved => {
        const m = findAsset(saved);
        if (!m) { missing.push(saved.name); return []; }
        return [{...saved,id:uid(),file:m.file || null,track:Math.min(8,Math.max(1,Number(saved.track)||1)),video:m.video || null,image:m.image || null,url:m.url,kind:m.kind}];
      });
      S.titles = (data.titles || []).map(x => ({...x,id:uid()}));
      S.overlays = (data.overlays || []).map(x => ({...x,id:uid()}));
      S.adjustments = (data.adjustments || []).map(x => ({...x,id:uid()}));
      S.captions = (data.captions || []).map(x => ({...x,id:uid()}));
      const savedAudio = data.audioTracks || (data.audio ? [data.audio] : []);
      S.audioTracks = savedAudio.flatMap(saved => {
        const m = findAsset(saved);
        if (!m || !m.audio) { if (saved.name) missing.push(saved.name); return []; }
        return [{...saved,id:uid(),file:m.file || null,audio:m.audio,url:m.url,waveform:m.waveform || null}];
      });
      S.audio = S.audioTracks[0] || null;
      if ($("stRatio") && data.ratio) $("stRatio").value = data.ratio; S.sequenceWidth=Math.max(16,Math.min(7680,Number(data.sequenceWidth)||1920)); S.sequenceHeight=Math.max(16,Math.min(7680,Number(data.sequenceHeight)||1080)); S.fitMode=data.fitMode==="cover"?"cover":"contain"; S.inPoint=data.inPoint==null?null:(Number.isFinite(Number(data.inPoint))?Number(data.inPoint):null); S.outPoint=data.outPoint==null?null:(Number.isFinite(Number(data.outPoint))?Number(data.outPoint):null); if($("stSeqW"))$("stSeqW").value=String(S.sequenceWidth); if($("stSeqH"))$("stSeqH").value=String(S.sequenceHeight); if($("stFitMode"))$("stFitMode").value=S.fitMode;
      if ($("stProjectName") && data.projectName) $("stProjectName").value = data.projectName;
      S.exportQuality = [480,720,1080].includes(Number(data.exportQuality)) ? Number(data.exportQuality) : 720;
      S.exportFps = [24,30,60].includes(Number(data.exportFps)) ? Number(data.exportFps) : 30;
      S.zoom = Math.max(40,Math.min(180,Number(data.zoom)||80));
      if ($("stQuality")) $("stQuality").value = String(S.exportQuality);
      if ($("stFps")) $("stFps").value = String(S.exportFps);
      if ($("stZoom")) $("stZoom").value = String(S.zoom);
      if ($("stSnap")) $("stSnap").checked = data.snapEnabled !== false;
      S.videoTrackCount = Math.max(4,Math.min(8,Math.max(Number(data.videoTrackCount)||4,data.clips.reduce((max,x)=>Math.max(max,Number(x.track)||1),1))));
      S.sel = null; api.render();
      say(missing.length ? "Project loaded. Re-import media: " + missing.join(", ") : "Project loaded.");
    } catch (error) { say(error.message || "Could not load project."); }
    event.target.value = "";
  }

  function drawExtras() {
    const canvas = $("stCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    S.overlays.forEach(x => {
      if (S.time < x.start || S.time >= x.start + x.duration) return;
      ctx.save(); ctx.globalAlpha = Number(x.opacity ?? 1); ctx.fillStyle = x.color || "#8b7cff";
      if (x.shape === "circle") { ctx.beginPath(); ctx.arc(w*x.x/100,h*x.y/100,h*x.size/100,0,Math.PI*2); ctx.fill(); }
      else if (x.shape === "sticker") { ctx.font = Math.round(h*x.size/100)+"px system-ui"; ctx.textAlign="center"; ctx.fillText(x.text || "★",w*x.x/100,h*x.y/100); }
      else ctx.fillRect(w*x.x/100-w*x.w/200,h*x.y/100-h*x.h/200,w*x.w/100,h*x.h/100);
      ctx.restore();
    });
    S.captions.forEach(x => {
      if (S.time < x.start || S.time >= x.start + x.duration) return;
      ctx.save(); ctx.font = "700 "+Math.round(h*.035)+"px system-ui"; ctx.textAlign="center";
      ctx.lineWidth = Math.max(3,h*.004); ctx.strokeStyle="#000"; ctx.fillStyle=x.color || "#fff";
      ctx.strokeText(x.text,w/2,h*.91,w*.88); ctx.fillText(x.text,w/2,h*.91,w*.88); ctx.restore();
    });
  }

  function inspectExtra() {
    const x = getClip(S.sel), panel = $("stInspector");
    if (!x || !panel) return;
    if (S.overlays.includes(x)) {
      panel.innerHTML = '<div class="st-inspector-name">'+safe(x.name)+'</div>'
        + '<div class="st-prop"><label>SHAPE</label><select id="oxShape"><option value="rect">Rectangle</option><option value="circle">Circle</option><option value="sticker">Sticker</option></select></div>'
        + '<div class="st-prop"><label>TEXT / SYMBOL</label><input id="oxText" value="'+safe(x.text)+'"></div>'
        + '<div class="st-prop"><label>COLOR</label><input id="oxColor" type="color" value="'+x.color+'"></div>'
        + '<div class="st-prop"><label>HORIZONTAL POSITION</label><input id="oxX" type="range" min="0" max="100" value="'+x.x+'"></div>'
        + '<div class="st-prop"><label>VERTICAL POSITION</label><input id="oxY" type="range" min="0" max="100" value="'+x.y+'"></div>'
        + '<div class="st-prop"><label>SIZE</label><input id="oxSize" type="range" min="2" max="30" value="'+x.size+'"></div>'
        + '<div class="st-prop"><label>START</label><input id="oxStart" type="number" step=".1" value="'+x.start+'"></div>'
        + '<div class="st-prop"><label>DURATION</label><input id="oxDuration" type="number" step=".1" value="'+x.duration+'"></div>'
        + '<button class="st-btn st-danger" id="oxDelete">Remove overlay</button>';
      $("oxShape").value = x.shape;
      [["oxShape","shape"],["oxText","text"],["oxColor","color"],["oxX","x"],["oxY","y"],["oxSize","size"],["oxStart","start"],["oxDuration","duration"]].forEach(([id,key]) => {
        $(id).onchange = e => { snapshot(); x[key] = ["oxX","oxY","oxSize","oxStart","oxDuration"].includes(id) ? Number(e.target.value) : e.target.value; api.render(); };
      });
      $("oxDelete").onclick = () => { snapshot(); S.overlays = S.overlays.filter(y => y.id !== x.id); S.adjustments = S.adjustments.filter(y => y.id !== x.id); S.sel=null; api.render(); };
    } else if (S.captions.includes(x)) {
      panel.innerHTML = '<div class="st-inspector-name">Caption</div><div class="st-prop"><label>TEXT</label><textarea id="cxText">'+safe(x.text)+'</textarea></div>'
        + '<div class="st-prop"><label>START</label><input id="cxStart" type="number" step=".1" value="'+x.start+'"></div>'
        + '<div class="st-prop"><label>DURATION</label><input id="cxDuration" type="number" step=".1" value="'+x.duration+'"></div>'
        + '<div class="st-prop"><label>COLOR</label><input id="cxColor" type="color" value="'+x.color+'"></div>';
      [["cxText","text"],["cxStart","start"],["cxDuration","duration"],["cxColor","color"]].forEach(([id,key]) => {
        $(id).onchange = e => { snapshot(); x[key] = ["cxStart","cxDuration"].includes(id) ? Number(e.target.value) : e.target.value; api.render(); };
      });
    }
  }


  function inspectClip() {
    const x = S.clips.find(y => y.id === S.sel);
    const audio = (S.audioTracks || []).find(y => y.id === S.sel);
    const title = S.titles.find(y => y.id === S.sel);
    const panel = $("stInspector");
    if (!panel) return;
    if (x) {
      panel.insertAdjacentHTML("beforeend",
        '<div class="st-prop"><label>PLAYBACK SPEED</label><select id="exSpeed"><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div>'
        + '<div class="st-prop"><label>ORIGINAL CLIP AUDIO</label><input id="exAudioVolume" type="range" min="0" max="100" value="' + (x.audioVolume ?? 100) + '"></div>'
        + '<div class="st-prop"><label>CLIP AUDIO FADE IN (SEC)</label><input id="exClipFadeIn" type="number" min="0" max="10" step=".1" value="' + (x.audioFadeIn || 0) + '"></div>'
        + '<div class="st-prop"><label>CLIP AUDIO FADE OUT (SEC)</label><input id="exClipFadeOut" type="number" min="0" max="10" step=".1" value="' + (x.audioFadeOut || 0) + '"></div>'
        + '<div class="st-prop"><label>HORIZONTAL POSITION</label><input id="exX" type="range" min="0" max="100" value="' + (x.x ?? 50) + '"></div>'
        + '<div class="st-prop"><label>VERTICAL POSITION</label><input id="exY" type="range" min="0" max="100" value="' + (x.y ?? 50) + '"></div>'
        + '<div class="st-prop"><label>CROP / SCALE</label><input id="exScale" type="range" min="25" max="250" value="' + (x.scale || 100) + '"></div>'
        + '<div class="st-prop"><label>TRANSITION</label><select id="exTransition"><option value="none">None</option><option value="fade">Fade in / out</option><option value="wipe-left">Wipe from left</option><option value="wipe-right">Wipe from right</option><option value="zoom">Zoom reveal</option></select></div>'
        + '<button class="st-tool" id="exFreeze">＋ Create freeze-frame image</button>');
      $("exSpeed").value = String(x.speed || 1);
      $("exTransition").value = x.transition || "none";
      [["exSpeed","speed"],["exAudioVolume","audioVolume"],["exClipFadeIn","audioFadeIn"],["exClipFadeOut","audioFadeOut"],["exX","x"],["exY","y"],["exScale","scale"],["exTransition","transition"]].forEach(([id,key]) => {
        $(id).onchange = e => { snapshot(); if (id === "exSpeed") { const speed = Math.max(.25,Number(e.target.value)||1); const sourceLength = Math.max(.1,Number(x.out ?? ((x.in||0)+x.duration*(x.speed||1))) - Number(x.in||0)); x.speed = speed; if (x.video) x.duration = sourceLength / speed; } else x[key] = ["exAudioVolume","exClipFadeIn","exClipFadeOut","exX","exY","exScale"].includes(id) ? Number(e.target.value) : e.target.value; api.render(); };
      });
      $("exFreeze").onclick = () => {
        if (!x.video || x.video.readyState < 2) { say("Move the playhead onto a loaded video frame first."); return; }
        const canvas = document.createElement("canvas");
        canvas.width = x.video.videoWidth; canvas.height = x.video.videoHeight;
        canvas.getContext("2d").drawImage(x.video,0,0);
        canvas.toBlob(blob => {
          if (!blob) { say("Could not capture this frame."); return; }
          const url = URL.createObjectURL(blob), image = new Image();
          image.onload = () => {
            S.media.push({id:uid(),name:"Freeze frame",url,kind:"image",image,duration:3});
            api.render(); say("Freeze frame added to the media library.");
          };
          image.src = url;
        });
      };
    } else if (audio) {
      panel.insertAdjacentHTML("beforeend",
        '<div class="st-prop"><label>FADE IN (SECONDS)</label><input id="exFadeIn" type="number" min="0" max="10" step=".1" value="' + (audio.fadeIn || 0) + '"></div>'
        + '<div class="st-prop"><label>FADE OUT (SECONDS)</label><input id="exFadeOut" type="number" min="0" max="10" step=".1" value="' + (audio.fadeOut || 0) + '"></div>'
        + '<button class="st-tool" id="exDownloadAudio">↓ Download source audio</button>');
      $("exDownloadAudio").onclick = () => { const link=document.createElement("a"); link.href=audio.url; link.download=audio.name || "clipforge-audio"; link.click(); };
      [["exFadeIn","fadeIn"],["exFadeOut","fadeOut"]].forEach(([id,key]) => {
        $(id).onchange = e => { snapshot(); audio[key] = Math.max(0,Number(e.target.value)||0); };
      });
    } else if (title) {
      panel.insertAdjacentHTML("beforeend",
        '<div class="st-prop"><label>FONT FAMILY</label><select id="exFont"><option value="system-ui">Modern sans</option><option value="Georgia">Editorial serif</option><option value="monospace">Mono</option></select></div>'
        + '<div class="st-prop"><label>TEXT POSITION</label><input id="exTextY" type="range" min="10" max="95" value="' + (title.positionY || 82) + '"></div>'
        + '<div class="st-prop"><label>STROKE COLOR</label><input id="exStroke" type="color" value="' + (title.stroke || "#000000") + '"></div>');
      $("exFont").value = title.fontFamily || "system-ui";
      [["exFont","fontFamily"],["exTextY","positionY"],["exStroke","stroke"]].forEach(([id,key]) => {
        $(id).onchange = e => { snapshot(); title[key] = id === "exTextY" ? Number(e.target.value) : e.target.value; api.render(); };
      });
    }
  }


  function inspectColor() {
    const clip = S.clips.find(item => item.id === S.sel);
    const panel = $("stInspector");
    if (!clip || !panel || panel.querySelector(".st-grade-panel")) return;
    const fields = [
      ["exposure","Exposure","-2","2","0.1",0],
      ["temperature","Temperature","-100","100","1",0],
      ["tint","Tint","-100","100","1",0],
      ["vibrance","Vibrance","0","200","1",100],
      ["highlights","Highlights","-100","100","1",0],
      ["shadows","Shadows","-100","100","1",0]
    ];
    const section = document.createElement("section");
    section.className = "st-grade-panel";
    section.innerHTML = '<div class="st-grade-heading"><strong>COLOR CORRECTION</strong><span>Primary grade</span></div>' +
      fields.map(([key,label,min,max,step,fallback]) => {
        const value = Number(clip[key] ?? fallback);
        return '<label class="st-grade-control"><span>'+label+'</span><output data-grade-value="'+key+'">'+value+'</output><input type="range" data-grade-key="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></label>';
      }).join("") +
      '<div class="st-grade-actions"><button type="button" class="st-btn" data-grade-reset>Reset grade</button><small>Adjustments are applied to preview and export.</small></div>';
    panel.append(section);
    let captured = false;
    section.addEventListener("pointerdown", event => {
      if (event.target.matches('input[type="range"]') && !captured) { snapshot(); captured = true; }
    });
    section.addEventListener("input", event => {
      const input = event.target.closest("[data-grade-key]");
      if (!input) return;
      const key = input.dataset.gradeKey;
      clip[key] = Number(input.value);
      const output = section.querySelector('[data-grade-value="'+key+'"]');
      if (output) output.textContent = input.value;
      api.draw();
    });
    section.addEventListener("change", event => {
      if (event.target.matches("[data-grade-key]")) { captured = false; api.render(); }
    });
    section.querySelector("[data-grade-reset]").addEventListener("click", () => {
      snapshot();
      fields.forEach(([key,,,,,fallback]) => { clip[key] = fallback; });
      api.render();
      say("Color correction reset.");
    });
  }

  const originalRender = api.render;
  // app.js owns the single authoritative NLE timeline. The legacy lane
  // renderer duplicated every track and distorted sequence layout, so only
  // retain its inspector extensions and creative tools.
  api.render = function() { originalRender(); actions(); inspectExtra(); inspectClip(); inspectColor(); };
  api.drawExtras = drawExtras;
  window.addEventListener("clipforge:image-imported", event => {
    const a = event.detail;
    if (!a || S.media.some(x => x.id === a.id)) return;
    S.media.push({id:a.id,name:a.file.name,file:a.file,url:a.url,kind:"image",image:a.image,duration:5});
    api.render();
  });

  let pointer = null;
  $("stInner")?.addEventListener("pointerdown", event => {
    const node = event.target.closest(".st-clip-block[data-id]");
    if (!node) return;
    const x = getClip(node.dataset.id);
    if (!x) return;
    event.preventDefault(); api.stop(); S.sel=x.id; snapshot(); node.setPointerCapture?.(event.pointerId);
    pointer={x, id:x.id, px:event.clientX, start:x.start, duration:len(x), mode:event.target.closest("[data-trim]")?.dataset.trim || "move"};
  });
  $("stInner")?.addEventListener("pointermove", event => {
    if (!pointer) return;
    const delta=(event.clientX-pointer.px)/Math.max(10,S.zoom), x=pointer.x;
    if (pointer.mode==="left") { const speed=Number(x.speed)||1,shift=Math.max(-Number(x.in||0)/speed,Math.min(pointer.duration-.1,delta)); x.start=Math.max(0,pointer.start+shift); x.in=Math.max(0,Number(x.in||0)+(x.start-pointer.start)*speed); x.duration=Math.max(.1,pointer.duration-(x.start-pointer.start)); }
    else if (pointer.mode==="right") { const speed=Number(x.speed)||1,sourceMax=Number(x.video?.duration||x.audio?.duration||x.sourceDuration||Infinity),maxDuration=Number.isFinite(sourceMax)?Math.max(.1,(sourceMax-Number(x.in||0))/speed):Infinity; x.duration=Math.min(maxDuration,Math.max(.1,pointer.duration+delta)); if (Number.isFinite(Number(x.in))) x.out=Number(x.in||0)+x.duration*speed; }
    else { x.start=snapTime(pointer.start+delta,x); const hit=document.elementFromPoint(event.clientX,event.clientY); const row=hit?.closest(".st-lane"); const label=row?.querySelector(".st-track-label")?.textContent || ""; if(x.video || x.kind==="image"){ const trackMatch=label.match(/^VIDEO (\d+)$/);if(trackMatch)x.track=Number(trackMatch[1]); } }
    const node=document.querySelector('[data-id="'+CSS.escape(pointer.id)+'"]');
    if (node) { node.style.left=(x.start*S.zoom)+"px"; node.style.width=Math.max(46,x.duration*S.zoom)+"px"; }
  });
  const finishPointer=()=>{ if(pointer){pointer=null;api.render();} };
  $("stInner")?.addEventListener("pointerup",finishPointer);
  $("stInner")?.addEventListener("pointercancel",finishPointer);

  // Keyboard shortcuts are centralized in app.js to prevent duplicate key handling.


  actions();
  // Media drop handling belongs to app.js lane targets only; a second
  // bubbling handler here previously inserted every dropped file twice.
})();