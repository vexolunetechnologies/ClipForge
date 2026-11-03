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
    <a class="st-app-exit" href="#top">Exit Studio ↗</a>`;
  root.prepend(bar);
  $("stAppUndo").onclick = () => $("stUndo")?.click();
  $("stAppRedo").onclick = () => $("stRedo")?.click();
  $("stAppSave").onclick = () => $("stProjectSave")?.click();
  $("stAppExport").onclick = () => $("stExport")?.click();

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
      </div>
      <div class="st-tool-pane" data-st-pane="media">
        <p>Import video, audio and images. Select an asset to add it to the timeline.</p>
        <div class="st-media-filters"><button type="button" data-st-filter="all" class="active">All</button><button type="button" data-st-filter="video">Video</button><button type="button" data-st-filter="audio">Audio</button><button type="button" data-st-filter="image">Images</button></div>
      </div>
      <div class="st-tool-pane" data-st-pane="audio" hidden>
        <p>Import music, narration or sound effects, then select an audio asset to add another audio lane.</p>
        <button type="button" class="st-tool-action" data-st-action="import">＋ Import audio</button>
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
      <div class="st-tool-pane" data-st-pane="transitions" hidden>
        <p>Choose a transition treatment for the selected video clip.</p>
        <button type="button" class="st-tool-action" data-st-transition="fade">Fade in / out</button>
        <button type="button" class="st-tool-action secondary" data-st-transition="none">No transition</button>
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
    const tagMedia = () => {
      assets.querySelectorAll(".st-media-item[data-mid]").forEach(item => {
        const media = state.media.find(x => x.id === item.dataset.mid);
        if (media) item.dataset.kind = media.kind;
      });
      filterMedia();
    };
    new MutationObserver(tagMedia).observe($("stMedia"), {childList:true,subtree:true});
    tagMedia();
    shelf.addEventListener("click", event => {
      const tab = event.target.closest("[data-st-tab]");
      if (tab) { setTab(tab.dataset.stTab); return; }
      const filter = event.target.closest("[data-st-filter]");
      if (filter) { setFilter(filter.dataset.stFilter); return; }
      const action = event.target.closest("[data-st-action]");
      if (action) {
        const ids = {text:"stAddText",caption:"stCaption",sticker:"stSticker",shape:"stShape",subtitles:"stSubFile"};
        if (action.dataset.stAction === "import") $("stImport")?.click();
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
        api.msg(clip.transition === "fade" ? "Fade in / out applied." : "Transition removed.");
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