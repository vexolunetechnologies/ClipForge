/* ClipForge Studio UI: functional tool rail and editor command bar. */
(() => {
  "use strict";
  const root = document.getElementById("editorTool");
  const api = window.ClipForgeEditor;
  if (!root || !api || root.dataset.proUiReady === "1") return;
  root.dataset.proUiReady = "1";
  const $ = id => document.getElementById(id);
  const state = api.state;
  const audioPicker = document.createElement("input");
  audioPicker.type = "file"; audioPicker.accept = "audio/*"; audioPicker.multiple = true;
  audioPicker.hidden = true; audioPicker.setAttribute("aria-label","Import audio files");
  root.append(audioPicker);
  audioPicker.addEventListener("change", () => {
    Array.from(audioPicker.files || []).forEach(file => {
      if (!file.type.startsWith("audio/")) return;
      const url = URL.createObjectURL(file), audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        state.media.push({id:crypto.randomUUID(),name:file.name,file,url,kind:"audio",duration:audio.duration,audio});
        api.render(); api.msg(file.name + " added to Media.");
      };
      audio.onerror = () => { URL.revokeObjectURL(url); api.msg("Could not read " + file.name + "."); };
      audio.src = url;
    });
    audioPicker.value = "";
  });

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
    <span class="st-app-status" id="stAppStatus" role="status">Ready to edit</span>
    <span class="st-app-spacer"></span>
    <button class="st-btn" id="stAppUndo" title="Undo (Ctrl+Z)">↶ <span>Undo</span></button>
    <button class="st-btn" id="stAppRedo" title="Redo (Ctrl+Shift+Z)">↷ <span>Redo</span></button>
    <button class="st-btn" id="stAppOpen" title="Open editable project file">Open project</button>
    <button class="st-btn" id="stAppSave" title="Save editable project file">Save project</button>
    <button class="st-btn st-primary" id="stAppExport">Export video</button>
    <button class="st-btn st-cancel-export" id="stAppCancel" hidden>Cancel export</button>
    <a class="st-app-exit" href="#top">Exit Studio ↗</a>`;
  root.prepend(bar);
  $("stAppUndo").onclick = () => $("stUndo")?.click();
  $("stAppRedo").onclick = () => $("stRedo")?.click();
  $("stAppOpen").onclick = () => $("stProjectLoad")?.click();
  $("stAppSave").onclick = () => $("stProjectSave")?.click();
  $("stAppExport").onclick = () => $("stExport")?.click();
  const syncToolbar = () => {
    const exporting = root.classList.contains("is-exporting");
    $("stAppUndo").disabled = exporting || !!$("stUndo")?.disabled;
    $("stAppRedo").disabled = exporting || !!$("stRedo")?.disabled;
    $("stAppOpen").disabled = exporting;
    $("stAppSave").disabled = exporting;
    $("stAppExport").disabled = exporting;
    $("stProjectName").disabled = exporting;
    $("stAppCancel").disabled = !exporting;
  };
  ["stUndo","stRedo"].forEach(id => {
    if ($(id)) new MutationObserver(syncToolbar).observe($(id), {attributes:true,attributeFilter:["disabled"]});
  });
  new MutationObserver(syncToolbar).observe(root, {attributes:true,attributeFilter:["class"]});
  syncToolbar();
  const statusSource = $("stStatus");
  const mirrorStatus = () => { $("stAppStatus").textContent = statusSource?.textContent?.trim() || "Ready to edit"; };
  if (statusSource) new MutationObserver(mirrorStatus).observe(statusSource,{childList:true,subtree:true,characterData:true});
  mirrorStatus();
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
        <p>Click an asset to add it at the end, or drag it onto a track to place it precisely.</p>
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

    // Premiere-style Project panel tabs: keep media import/bin clean and move
    // creative controls into their own tab instead of one long scrolling column.
    const importLabel = assets.querySelector(".st-import");
    const importInput = assets.querySelector("#stImport");
    const mediaList = assets.querySelector("#stMedia");
    const panelTabs = document.createElement("div");
    panelTabs.className = "st-project-tabs";
    panelTabs.setAttribute("role", "tablist");
    panelTabs.innerHTML = '<button type="button" class="active" data-project-tab="project" role="tab" aria-selected="true">Project</button><button type="button" data-project-tab="tools" role="tab" aria-selected="false">Tools</button><button type="button" data-project-tab="browser" role="tab" aria-selected="false">Media Browser</button><button type="button" data-project-tab="libraries" role="tab" aria-selected="false">Libraries</button><button type="button" data-project-tab="info" role="tab" aria-selected="false">Info</button>';
    const projectPane = document.createElement("div"); projectPane.className = "st-project-pane"; projectPane.dataset.projectPane = "project";
    const toolsPane = document.createElement("div"); toolsPane.className = "st-project-pane"; toolsPane.dataset.projectPane = "tools"; toolsPane.hidden = true;
    const browserPane = document.createElement("div"); browserPane.className = "st-project-pane st-project-placeholder"; browserPane.dataset.projectPane = "browser"; browserPane.hidden = true; browserPane.innerHTML = '<strong>Media Browser</strong><p>Import files from your device into this temporary project. Your original files stay on your device.</p><button type="button" data-open-import>＋ Browse files</button>';
    const librariesPane = document.createElement("div"); librariesPane.className = "st-project-pane st-project-placeholder"; librariesPane.dataset.projectPane = "libraries"; librariesPane.hidden = true; librariesPane.innerHTML = '<strong>Libraries</strong><p>Reusable assets and saved libraries are not connected in this local-session editor yet.</p>';
    const infoPane = document.createElement("div"); infoPane.className = "st-project-pane st-project-placeholder"; infoPane.dataset.projectPane = "info"; infoPane.hidden = true; infoPane.innerHTML = '<strong>Project Info</strong><p>Temporary browser session · No cloud upload or autosave.</p>';
    assets.insertBefore(panelTabs, shelf);
    if (importLabel) projectPane.append(importLabel);
    if (importInput) projectPane.append(importInput);
    if (mediaList) projectPane.append(mediaList);
    toolsPane.append(shelf);
    assets.querySelectorAll(".st-spaced, #stAddText, .st-project-note").forEach(node => toolsPane.append(node));
    assets.append(projectPane, toolsPane, browserPane, librariesPane, infoPane);
    const setProjectPanel = tab => {
      panelTabs.querySelectorAll("[data-project-tab]").forEach(button => {
        const active = button.dataset.projectTab === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
      assets.querySelectorAll("[data-project-pane]").forEach(pane => pane.hidden = pane.dataset.projectPane !== tab);
    };
    panelTabs.addEventListener("click", event => {
      const button = event.target.closest("[data-project-tab]");
      if (button) setProjectPanel(button.dataset.projectTab);
    });
    browserPane.querySelector("[data-open-import]")?.addEventListener("click", () => importInput?.click());
    // Timeline tools are mounted by the timeline module; move them into Tools
    // as soon as they exist, keeping the Project bin free of unrelated controls.
    const moveAdvancedTools = () => {
      const advanced = assets.querySelector(".st-advanced-tools");
      if (advanced && advanced.parentElement !== toolsPane) toolsPane.append(advanced);
    };
    moveAdvancedTools();
    const advancedObserver = new MutationObserver(moveAdvancedTools);
    advancedObserver.observe(assets, {childList:true,subtree:true});

    // Native desktop drag-and-drop import into the Project bin.
    if (importLabel && importInput) {
      importLabel.addEventListener("dragover", event => { event.preventDefault(); importLabel.classList.add("is-drop-target"); });
      importLabel.addEventListener("dragleave", () => importLabel.classList.remove("is-drop-target"));
      importLabel.addEventListener("drop", event => {
        event.preventDefault(); importLabel.classList.remove("is-drop-target");
        const files = Array.from(event.dataTransfer?.files || []);
        if (!files.length) return;
        const transfer = new DataTransfer();
        files.forEach(file => transfer.items.add(file));
        importInput.files = transfer.files;
        importInput.dispatchEvent(new Event("change", {bubbles:true}));
      });
    }

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

    assets.addEventListener("dragstart", event => {
      const item = event.target.closest(".st-media-item[data-mid]");
      if (!item || !event.dataTransfer) return;
      event.dataTransfer.setData("application/x-clipforge-media", item.dataset.mid);
      event.dataTransfer.effectAllowed = "copy";
      item.classList.add("is-dragging");
    });
    assets.addEventListener("dragend", event => event.target.closest(".st-media-item")?.classList.remove("is-dragging"));
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
        if (media) { item.dataset.kind = media.kind; item.draggable = true; if (media.kind === "audio") makeWaveform(media); }
      });
      filterMedia();
    };
    tagMedia();
    new MutationObserver(tagMedia).observe($("stMedia"), {childList:true,subtree:true});
    shelf.addEventListener("click", event => {
      const tab = event.target.closest("[data-st-tab]");
      if (tab) { setTab(tab.dataset.stTab); return; }
      const filter = event.target.closest("[data-st-filter]");
      if (filter) { setFilter(filter.dataset.stFilter); return; }
      const action = event.target.closest("[data-st-action]");
      if (action) {
        const ids = {text:"stAddText",caption:"stCaption",sticker:"stSticker",shape:"stShape",subtitles:"stSubFile","video-track":"stAddVideoTrack"};
        if (action.dataset.stAction === "import") audioPicker.click();
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

  // Recompose the editor into a professional NLE layout without replacing
  // the existing editing controls or disconnecting their event handlers.
  const workspace = root.querySelector(".st-workspace");
  const main = root.querySelector(".st-main");
  const previewRow = root.querySelector(".st-preview-row");
  const preview = previewRow?.querySelector(".st-preview-panel");
  const inspector = previewRow?.querySelector(".st-inspector");
  const timeline = main?.querySelector(".st-timeline-panel");
  const assetPanel = root.querySelector(".st-assets");
  if (workspace && main && preview && inspector && timeline && assetPanel) {
    const stage = document.createElement("div");
    stage.className = "st-pro-stage";
    const rail = document.createElement("aside");
    rail.className = "st-vertical-rail";
    rail.setAttribute("aria-label", "Editing tool categories");
    rail.innerHTML = `
      <div class="st-rail-brand" title="ClipForge tools">CF</div>
      <button type="button" class="active" data-rail-tab="media" title="Project / Media" aria-label="Project and media"><svg viewBox="0 0 24 24"><path d="M3 6.5h7l2 2h9v10H3zM3 6.5V5h7l2 1.5"/></svg></button>
      <button type="button" data-rail-tab="audio" title="Audio" aria-label="Audio"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13M9 8l12-2M5 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg></button>
      <button type="button" data-rail-tab="text" title="Text" aria-label="Text"><svg viewBox="0 0 24 24"><path d="M4 5h16M12 5v14m-5 0h10"/></svg></button>
      <button type="button" data-rail-tab="captions" title="Captions" aria-label="Captions"><svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3zM8 10h3m2 0h3M8 13h8"/></svg></button>
      <button type="button" data-rail-tab="stickers" title="Graphics" aria-label="Graphics"><svg viewBox="0 0 24 24"><path d="m12 3 9 9-9 9-9-9zM9 12h6M12 9v6"/></svg></button>
      <button type="button" data-rail-tab="effects" title="Effects" aria-label="Effects"><svg viewBox="0 0 24 24"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></svg></button>
      <button type="button" data-rail-tab="transitions" title="Transitions" aria-label="Transitions"><svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 13h7v7h-7zM13 4l7 7m-7-7v7h7"/></svg></button>
      <button type="button" data-rail-tab="tracks" title="Tracks" aria-label="Tracks"><svg viewBox="0 0 24 24"><path d="M3 5h18M3 12h18M3 19h18M7 3v4m10-4v4M7 10v4m10-4v4M7 17v4m10-4v4"/></svg></button>
      <span class="st-rail-spacer"></span><span class="st-rail-foot">EDIT</span>`;
    rail.addEventListener("click", event => {
      const button = event.target.closest("[data-rail-tab]");
      if (!button) return;
      const tab = button.dataset.railTab;
      const panelTab = tab === "media" ? "project" : "tools";
      assetPanel.querySelector('[data-project-tab="' + panelTab + '"]')?.click();
      if (tab !== "media") assetPanel.querySelector('[data-st-tab="' + tab + '"]')?.click();
      rail.querySelectorAll("[data-rail-tab]").forEach(item => item.classList.toggle("active", item === button));
    });
    const monitorPair = document.createElement("div");
    monitorPair.className = "st-monitor-pair";
    const sourcePanel = document.createElement("section");
    sourcePanel.className = "st-source-panel";
    sourcePanel.innerHTML = '<div class="st-left-tabs" role="tablist" aria-label="Source and effect panels"><button type="button" class="active" data-left-tab="effects" role="tab" aria-selected="true">Effect Controls</button><button type="button" data-left-tab="source" role="tab" aria-selected="false">Source</button><span class="st-source-meta">No source loaded</span></div><div class="st-source-view"><div class="st-source-empty">Select SOURCE on a media item to preview it here.</div></div><div class="st-source-footer"><span>CLIPFORGE SOURCE</span><span>Local preview</span></div>';
    const sourceView = sourcePanel.querySelector(".st-source-view");
    const activateLeftTab = tab => {
      sourcePanel.dataset.leftTab = tab;
      sourcePanel.querySelectorAll("[data-left-tab]").forEach(button => {
        const active = button.dataset.leftTab === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      });
    };
    sourcePanel.dataset.leftTab = "effects";
    sourcePanel.addEventListener("click", event => {
      const button = event.target.closest("[data-left-tab]");
      if (button) activateLeftTab(button.dataset.leftTab);
    });
    const loadSource = media => {
      activateLeftTab("source");
      sourceView.replaceChildren();
      sourcePanel.querySelector(".st-source-meta").textContent = media.name;
      if (media.kind === "image") {
        const image = document.createElement("img"); image.src = media.url; image.alt = media.name; sourceView.append(image);
      } else if (media.kind === "audio") {
        const audio = document.createElement("audio"); audio.src = media.url; audio.controls = true; audio.preload = "metadata"; audio.style.width = "100%"; sourceView.append(audio);
      } else {
        const video = document.createElement("video");
        video.src = media.url; video.preload = "auto"; video.playsInline = true; video.muted = false;
        video.controls = false; video.disablePictureInPicture = false; video.style.width = "100%"; video.style.height = "100%";
        const transport = document.createElement("div"); transport.className = "st-source-transport";
        const play = document.createElement("button"); play.type = "button"; play.className = "st-source-play"; play.textContent = "▶"; play.title = "Play / Pause source";
        const current = document.createElement("span"); current.textContent = "00:00";
        const scrub = document.createElement("input"); scrub.type = "range"; scrub.min = "0"; scrub.max = "1000"; scrub.value = "0"; scrub.setAttribute("aria-label","Source position");
        const duration = document.createElement("span"); duration.textContent = "00:00";
        const clock = value => { const n=Math.max(0,Number(value)||0); return String(Math.floor(n/60)).padStart(2,"0")+":"+String(Math.floor(n%60)).padStart(2,"0"); };
        play.addEventListener("click", async () => {
          if (video.paused) { try { await video.play(); } catch (_) { sourcePanel.querySelector(".st-source-meta").textContent = "Playback blocked — press Play again"; } }
          else video.pause();
        });
        video.addEventListener("play",()=>{play.textContent="Ⅱ";});
        video.addEventListener("pause",()=>{play.textContent="▶";});
        video.addEventListener("loadedmetadata",()=>{duration.textContent=clock(video.duration);});
        video.addEventListener("timeupdate",()=>{current.textContent=clock(video.currentTime);if(Number.isFinite(video.duration)&&video.duration>0)scrub.value=String(Math.round(video.currentTime/video.duration*1000));});
        scrub.addEventListener("input",()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Number(scrub.value)/1000*video.duration;});
        transport.append(play,current,scrub,duration);
        sourceView.append(video,transport);
      }
      sourcePanel.dataset.loaded = "true";
    };
    root.addEventListener("click", event => {
      const trigger = event.target.closest("[data-media-preview]");
      if (!trigger || !root.contains(trigger)) return;
      event.preventDefault(); event.stopPropagation();
      const media = state.media.find(item => item.id === trigger.dataset.mediaPreview);
      if (media) loadSource(media);
    }, true);
    root.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-media-preview]")) { event.preventDefault(); event.target.closest("[data-media-preview]").click(); }
    }, true);
    // Premiere-inspired four-panel composition:
    // Source / Effect Controls (top-left), Program Monitor (top-right),
    // Project bin (bottom-left), and the multi-track timeline (bottom-right).
    sourcePanel.append(inspector);
    monitorPair.append(sourcePanel, preview);
    stage.append(rail, assetPanel, monitorPair);
    main.replaceChildren(stage, timeline);
    workspace.replaceChildren(main);
    workspace.classList.add("st-pro-workspace");
    main.classList.add("st-pro-main");
    previewRow?.remove();

    const projectTitle = assetPanel.querySelector(".st-panel-title");
    if (projectTitle && projectTitle.firstChild) projectTitle.firstChild.textContent = "PROJECT / MEDIA BIN ";
    const previewTitle = preview.querySelector(".st-panel-title");
    if (previewTitle && previewTitle.firstChild) previewTitle.firstChild.textContent = "PROGRAM MONITOR ";
    const inspectorTitle = inspector.querySelector(".st-panel-title");
    if (inspectorTitle && inspectorTitle.firstChild) inspectorTitle.firstChild.textContent = "EFFECT CONTROLS ";

    const menu = document.createElement("nav");
    menu.className = "st-menubar";
    menu.setAttribute("aria-label", "Studio menus");
    menu.innerHTML = `
      <details><summary>File</summary><div class="st-menu-pop"><button data-pro-command="import">Import media…</button><button data-pro-command="open">Open project…</button><button data-pro-command="save">Save project as…</button><button data-pro-command="export">Export video…</button></div></details>
      <details><summary>Edit</summary><div class="st-menu-pop"><button data-pro-command="undo">Undo <kbd>Ctrl Z</kbd></button><button data-pro-command="redo">Redo <kbd>Ctrl Shift Z</kbd></button><button data-pro-command="split">Split clip <kbd>S</kbd></button><button data-pro-command="delete">Delete selected</button></div></details>
      <details><summary>Clip</summary><div class="st-menu-pop"><button data-pro-command="text">New text layer</button><button data-pro-command="caption">New caption</button><button data-pro-command="sticker">Add graphic / sticker</button></div></details>
      <details><summary>Sequence</summary><div class="st-menu-pop"><button data-pro-command="fit">Fit timeline to sequence</button><button data-pro-command="ratio">Cycle preview ratio</button></div></details>
      <details><summary>View</summary><div class="st-menu-pop"><button data-pro-command="fit">Fit timeline</button><button data-pro-command="inspector">Toggle Effect Controls</button></div></details>
      <details><summary>Help</summary><div class="st-menu-pop"><button data-pro-command="shortcuts">Keyboard shortcuts</button></div></details>
      <span class="st-menu-workspace">EDITING WORKSPACE <i>●</i></span>`;
    bar.insertAdjacentElement("afterend", menu);
    // Only one application menu can be open at a time.
    menu.querySelectorAll("details").forEach(details => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        menu.querySelectorAll("details").forEach(other => { if (other !== details) other.open = false; });
      });
    });

    const inspectorTabs = document.createElement("div");
    inspectorTabs.className = "st-inspector-tabs";
    inspectorTabs.setAttribute("role", "tablist");
    inspectorTabs.setAttribute("aria-label", "Effect control categories");
    inspectorTabs.innerHTML = `
      <button type="button" class="active" data-pro-inspector="all" role="tab" aria-selected="true">All</button>
      <button type="button" data-pro-inspector="motion" role="tab" aria-selected="false">Motion</button>
      <button type="button" data-pro-inspector="color" role="tab" aria-selected="false">Color</button>
      <button type="button" data-pro-inspector="audio" role="tab" aria-selected="false">Audio</button>
      <button type="button" data-pro-inspector="text" role="tab" aria-selected="false">Text</button>`;
    inspectorTitle?.insertAdjacentElement("afterend", inspectorTabs);
    let inspectorMode = "all";
    const filterInspector = () => {
      const groups = inspector.querySelectorAll(".st-prop");
      groups.forEach(group => {
        const label = group.querySelector("label")?.textContent?.toLowerCase() || "";
        const matches = inspectorMode === "all" ||
          (inspectorMode === "motion" && /start|trim|position|rotation|scale|keyframe|opacity/.test(label)) ||
          (inspectorMode === "color" && /filter|brightness|contrast|saturation|color/.test(label)) ||
          (inspectorMode === "audio" && /volume|fade|audio/.test(label)) ||
          (inspectorMode === "text" && /text|size|animation|font|color/.test(label));
        group.hidden = !matches;
      });
    };
    inspectorTabs.addEventListener("click", event => {
      const button = event.target.closest("[data-pro-inspector]");
      if (!button) return;
      inspectorMode = button.dataset.proInspector;
      inspectorTabs.querySelectorAll("[data-pro-inspector]").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      filterInspector();
    });
    new MutationObserver(filterInspector).observe(inspector, {childList:true,subtree:true});
    filterInspector();

    menu.addEventListener("click", event => {
      const button = event.target.closest("[data-pro-command]");
      if (!button) return;
      const commands = {
        import:"stImport",open:"stAppOpen",save:"stAppSave",export:"stAppExport",
        undo:"stUndo",redo:"stRedo",split:"stSplit",delete:"stDelete",
        text:"stAddText",caption:"stCaption",sticker:"stSticker",fit:"stZoomFit"
      };
      const command = button.dataset.proCommand;
      if (command === "ratio") {
        const ratio = $("stRatio");
        if (ratio) { ratio.selectedIndex = (ratio.selectedIndex + 1) % ratio.options.length; ratio.dispatchEvent(new Event("change",{bubbles:true})); }
      } else if (command === "inspector") {
        inspector.hidden = !inspector.hidden;
      } else if (command === "shortcuts") {
        api.msg("Shortcuts: Space = play/pause · S = split · Ctrl/Cmd+Z = undo · Ctrl/Cmd+Shift+Z = redo · Ctrl/Cmd+S = save project · ←/→ = frame step.");
      } else if (commands[command]) {
        $(commands[command])?.click();
      }
      menu.querySelectorAll("details[open]").forEach(item => item.open = false);
    });
  }

  window.addEventListener("hashchange", () => {
    if (location.hash !== "#editor") {
      if (state.exporting) state.exportCancel = true;
      if (voiceRecorder && voiceRecorder.state !== "inactive") voiceRecorder.stop();
    }
  });
  window.addEventListener("beforeunload", () => {
    if (voiceRecorder && voiceRecorder.state !== "inactive") {
      try { voiceRecorder.stop(); } catch (_) {}
    }
    voiceStream?.getTracks().forEach(track => track.stop());
  });

  // Keep keyboard commands predictable and connected to the same undo stack.
  document.addEventListener("keydown", event => {
    if (event.target.matches("input,textarea,select,[contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      (event.shiftKey ? $("stRedo") : $("stUndo"))?.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); $("stProjectSave")?.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
      event.preventDefault(); $("stProjectLoad")?.click();
    } else if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault(); $("stSplit")?.click();
    } else if (!event.ctrlKey && !event.metaKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault(); api.stop();
      const step = 1 / Math.max(1,Number(state.exportFps)||30);
      api.seek(state.time + (event.key === "ArrowRight" ? step : -step));
    }
  });
})();