/* ClipForge Studio UI: functional tool rail and editor command bar. */
(() => {
  "use strict";
  const root = document.getElementById("editorTool");
  const api = window.ClipForgeEditor;
  if (!root || !api || root.dataset.proUiReady === "1") return;
  root.dataset.proUiReady = "1";
  const $ = id => document.getElementById(id);
  const state = api.state;

  // Replace the generic page heading with a dedicated editor command bar.
  const oldHead = root.querySelector(".st-head");
  if (oldHead) oldHead.hidden = true;
  const bar = document.createElement("div");
  bar.className = "st-appbar";
  bar.innerHTML = `
    <a class="st-appbrand" href="#top" aria-label="Exit Studio and return to ClipForge">
      <span class="st-appbrand-mark">▶</span><span>CLIPFORGE <b>STUDIO</b></span>
    </a>
    <span class="st-app-divider"></span>
    <label class="st-project-name-wrap"><small>PROJECT</small><input id="stProjectName" maxlength="70" value="Untitled Project" aria-label="Project name"></label>
    <span class="st-app-spacer"></span>
    <button class="st-btn" id="stAppUndo" title="Undo (Ctrl+Z)">↶ <span>Undo</span></button>
    <button class="st-btn" id="stAppRedo" title="Redo (Ctrl+Shift+Z)">↷ <span>Redo</span></button>
    <button class="st-btn" id="stAppSave" title="Export editable project file">Project file</button>
    <button class="st-btn st-primary" id="stAppExport">Export video</button>
    <button class="st-btn st-cancel-export" id="stAppCancel" hidden>Cancel export</button>
    <a class="st-app-exit" href="#top">Exit Studio ↗</a>`;
  root.prepend(bar);
  $("stAppUndo").onclick = () => $("stUndo")?.click();
  $("stAppRedo").onclick = () => $("stRedo")?.click();
  $("stAppSave").onclick = () => $("stProjectSave")?.click();
  $("stAppExport").onclick = () => $("stExport")?.click();
  $("stAppCancel").onclick = () => { if (!state.exporting) return; state.exportCancel = true; api.msg("Stopping export…"); };

  // A real tool rail: each tab changes the visible media filter or exposes
  // controls already wired to the editor engine.
  const assets = root.querySelector(".st-assets");
  if (assets) {
    const shelf = document.createElement("section");
    shelf.className = "st-tool-shelf";
    shelf.innerHTML = `
      <div class="st-tool-shelf-title">WORKSPACE TOOLS</div>
      <div class="st-tool-tabs" role="tablist" aria-label="Studio tools">
        <button type="button" data-st-tab="media" class="active" role="tab" aria-selected="true">Media</button>
        <button type="button" data-st-tab="audio" role="tab" aria-selected="false">Audio</button>
        <button type="button" data-st-tab="text" role="tab" aria-selected="false">Text</button>
        <button type="button" data-st-tab="captions" role="tab" aria-selected="false">Captions</button>
        <button type="button" data-st-tab="stickers" role="tab" aria-selected="false">Stickers</button>
        <button type="button" data-st-tab="effects" role="tab" aria-selected="false">Effects</button>
        <button type="button" data-st-tab="transitions" role="tab" aria-selected="false">Transitions</button>
        <button type="button" data-st-tab="tracks" role="tab" aria-selected="false">Tracks</button>
      </div>
      <div class="st-tool-pane" data-st-pane="media">
        <p>Import video, audio and images. Select an asset to add it to the timeline.</p>
        <div class="st-media-filters"><button type="button" data-st-filter="all" class="active">All</button><button type="button" data-st-filter="video">Video</button><button type="button" data-st-filter="audio">Audio</button><button type="button" data-st-filter="image">Images</button></div>
      </div>
      <div class="st-tool-pane" data-st-pane="audio" hidden>
        <p>Import music, narration or sound effects, then select an audio asset to add another audio lane.</p>
        <button type="button" class="st-tool-action" data-st-action="import">＋ Import audio</button><button type="button" class="st-tool-action secondary" data-st-action="voiceover">● Record voiceover</button><small class="st-hint">Microphone access is requested only after you press Record. The recording stays in this browser session.</small>
      </div>
      <div class="st-tool-pane" data-st-pane="text" hidden>
        <p>Add editable titles and text overlays to your video.</p>
        <button type="button" class="st-tool-action" data-st-action="text">＋ Add text</button>
      </div>
      <div class="st-tool-pane" data-st-pane="captions" hidden>
        <p>Create captions manually or import subtitle timing from SRT/VTT.</p>
        <button type="button" class="st-tool-action" data-st-action="caption">＋ Add caption</button>
        <button type="button" class="st-tool-action secondary" data-st-action="subtitles">Import SRT / VTT</button>
      </div>
      <div class="st-tool-pane" data-st-pane="stickers" hidden>
        <p>Add simple shapes and symbols as editable overlay clips.</p>
        <button type="button" class="st-tool-action" data-st-action="sticker">＋ Add sticker</button>
        <button type="button" class="st-tool-action secondary" data-st-action="shape">＋ Add shape</button>
      </div>
      <div class="st-tool-pane" data-st-pane="effects" hidden>
        <p>Apply a visual look to the selected video clip.</p>
        <div class="st-effect-grid">
          <button type="button" data-st-effect="none">Original</button>
          <button type="button" data-st-effect="cinema">Cinematic</button>
          <button type="button" data-st-effect="mono">B&amp;W</button>
          <button type="button" data-st-effect="warm">Warm</button>
          <button type="button" data-st-effect="cool">Cool</button>
          <button type="button" data-st-effect="vivid">Vivid</button>
        </div>
      </div>
      <div class="st-tool-pane" data-st-pane="tracks" hidden>
        <p>Add additional video layers. Audio lanes are created automatically when you add more audio clips.</p>
        <button type="button" class="st-tool-action" data-st-action="video-track">＋ Add video track</button>
      </div>
      <div class="st-tool-pane" data-st-pane="transitions" hidden>
        <p>Choose a transition treatment for the selected video clip.</p>
        <div class="st-effect-grid"><button type="button" data-st-transition="fade">Fade</button><button type="button" data-st-transition="wipe-left">Wipe left</button><button type="button" data-st-transition="wipe-right">Wipe right</button><button type="button" data-st-transition="zoom">Zoom</button><button type="button" data-st-transition="none">None</button></div>
        <small class="st-hint">More transition types will be added after the core timeline and renderer are hardened.</small>
      </div>`;
    const mediaTitle = assets.querySelector(".st-panel-title");
    if (mediaTitle) mediaTitle.insertAdjacentElement("afterend", shelf);
    else assets.prepend(shelf);

    const setTab = tab => {
      shelf.querySelectorAll("[data-st-tab]").forEach(b => {
        const active = b.dataset.stTab === tab;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", String(active));
      });
      shelf.querySelectorAll("[data-st-pane]").forEach(p => p.hidden = p.dataset.stPane !== tab);
      if (tab === "audio") setFilter("audio");
      else if (tab === "media") setFilter("all");
    };
    let mediaFilter = "all";
    function setFilter(filter) {
      mediaFilter = filter;
      shelf.querySelectorAll("[data-st-filter]").forEach(b => b.classList.toggle("active", b.dataset.stFilter === filter));
      filterMedia();
    }
    function filterMedia() {
      assets.querySelectorAll(".st-media-item[data-kind]").forEach(item => {
        item.hidden = mediaFilter !== "all" && item.dataset.kind !== mediaFilter;
      });
    }
    new MutationObserver(tagMedia).observe($("stMedia"), {childList:true,subtree:true});
    tagMedia();
    let voiceRecorder = null, voiceStream = null, voiceChunks = [], voiceButton = null;
    async function toggleVoiceover(button) {
      if (voiceRecorder && voiceRecorder.state !== "inactive") {
        button.disabled = true;
        voiceRecorder.stop();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        api.msg("Voice recording is not supported in this browser. Import an audio file instead.");
        return;
      }
      try {
        voiceStream = await navigator.mediaDevices.getUserMedia({audio:true});
        voiceChunks = [];
        const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(x => MediaRecorder.isTypeSupported(x));
        voiceRecorder = new MediaRecorder(voiceStream, mime ? {mimeType:mime} : undefined);
        voiceButton = button;
        voiceRecorder.ondataavailable = e => { if (e.data?.size) voiceChunks.push(e.data); };
        voiceRecorder.onstop = () => {
          const type = voiceRecorder.mimeType || "audio/webm";
          const blob = new Blob(voiceChunks, {type});
          const ext = type.includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], "Voiceover-" + new Date().toISOString().replace(/[:.]/g,"-") + "." + ext, {type});
          const url = URL.createObjectURL(blob), audio = new Audio(url);
          audio.preload = "metadata";
          audio.onloadedmetadata = () => {
            state.media.push({id:crypto.randomUUID(),name:file.name,file,url,kind:"audio",duration:audio.duration,audio});
            api.render();
            api.msg("Voiceover added to Media. Select it to place it on an audio track.");
          };
          audio.onerror = () => api.msg("The voice recording was created but this browser could not read its audio metadata.");
          audio.src = url;
          voiceStream?.getTracks().forEach(track => track.stop());
          voiceStream = null; voiceRecorder = null; voiceChunks = [];
          if (voiceButton) { voiceButton.disabled = false; voiceButton.textContent = "● Record voiceover"; }
        };
        voiceRecorder.start(250);
        button.textContent = "■ Stop recording";
        api.msg("Recording voiceover… Press Stop recording when finished.");
      } catch (error) {
        voiceStream?.getTracks().forEach(track => track.stop());
        voiceStream = null;
        api.msg(error?.name === "NotAllowedError" ? "Microphone permission was not granted." : "Could not start microphone recording.");
      }
    }
    async function makeWaveform(media) {
      if (!media || media.kind !== "audio" || !media.file || media.waveform || media.waveformLoading || media.file.size > 100*1024*1024) return;
      media.waveformLoading = true;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      let context;
      try {
        context = new AudioContextClass();
        const buffer = await media.file.arrayBuffer();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        const channel = decoded.getChannelData(0), bars = 84, peaks = [];
        const step = Math.max(1, Math.floor(channel.length / bars));
        for (let i=0;i<bars;i++) {
          let peak=0, start=i*step, end=Math.min(channel.length,start+step);
          for(let j=start;j<end;j++) peak=Math.max(peak,Math.abs(channel[j]));
          peaks.push(Math.max(.04,peak));
        }
        media.waveform = peaks; media.waveformLoading = false;
        (state.audioTracks || []).filter(x => x.name === media.name).forEach(x => x.waveform = peaks);
        if (state.audio && state.audio.name === media.name) state.audio.waveform = peaks;
        api.render();
      } catch (_) {
        media.waveformLoading = false;
        // Audio decoding is optional; editing and playback remain available.
      } finally {
        if (context) context.close().catch(() => {});
      }
    }
    const tagMedia = () => {
      assets.querySelectorAll(".st-media-item[data-mid]").forEach(item => {
        const media = state.media.find(x => x.id === item.dataset.mid);
        if (media) { item.dataset.kind = media.kind; if (media.kind === "audio") makeWaveform(media); }
      });
      filterMedia();
    };
    shelf.addEventListener("click", event => {
      const tab = event.target.closest("[data-st-tab]");
      if (tab) { setTab(tab.dataset.stTab); return; }
      const filter = event.target.closest("[data-st-filter]");
      if (filter) { setFilter(filter.dataset.stFilter); return; }
      const action = event.target.closest("[data-st-action]");
      if (action) {
        const ids = {text:"stAddText",caption:"stCaption",sticker:"stSticker",shape:"stShape",subtitles:"stSubFile","video-track":"stAddVideoTrack"};
        if (action.dataset.stAction === "import") $("stImport")?.click();
        else if (action.dataset.stAction === "voiceover") toggleVoiceover(action);
        else if (action.dataset.stAction === "subtitles") $(ids.subtitles)?.click();
        else $(ids[action.dataset.stAction])?.click();
        return;
      }
      const effect = event.target.closest("[data-st-effect]");
      if (effect) {
        const clip = state.clips.find(x => x.id === state.sel);
        if (!clip) { api.msg("Select a video clip on the timeline first."); return; }
        api.snap(); clip.filter = effect.dataset.stEffect; api.render();
        api.msg(effect.dataset.stEffect === "none" ? "Original look restored." : effect.textContent + " look applied.");
        return;
      }
      const transition = event.target.closest("[data-st-transition]");
      if (transition) {
        const clip = state.clips.find(x => x.id === state.sel);
        if (!clip) { api.msg("Select a video clip on the timeline first."); return; }
        api.snap(); clip.transition = transition.dataset.stTransition; api.render();
        api.msg(clip.transition === "none" ? "Transition removed." : transition.textContent + " transition applied.");
      }
    });
    setTab("media");
  }

  // Keep keyboard commands predictable and connected to the same undo stack.
  document.addEventListener("keydown", event => {
    if (event.target.matches("input,textarea,select,[contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      (event.shiftKey ? $("stRedo") : $("stUndo"))?.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); $("stProjectSave")?.click();
    }
  });
})();