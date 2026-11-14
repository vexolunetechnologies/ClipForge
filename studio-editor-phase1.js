/*
 * ClipForge Studio Phase 1: desktop panel shell and functional tool-category wiring.
 * No media engine, renderer, timeline editing, state schema, export, or mobile DOM replacement.
 * Mounts after studio-ui.js; all actions delegate to existing working editor controls.
 */
(() => {
  "use strict";
  const root = document.getElementById("editorTool");
  if (!root || root.dataset.phase1Ready === "1" || root.dataset.proUiReady !== "1") return;
  root.dataset.phase1Ready = "1";
  root.classList.add("st-phase1");
  const $ = selector => root.querySelector(selector);
  const toolbar = document.createElement("nav");
  toolbar.className = "st-p1-toolbar";
  toolbar.setAttribute("aria-label", "Studio creator tools");
  let applyMediaFilter = () => {};
  // One consistent 16px line-icon language instead of mixed oversized symbols.
  // Static SVG markup is decorative; real buttons and their click handlers remain.
  const svg = body => '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  const icons = {
    media:svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z"/>'),
    audio:svg('<path d="M9 18V5l12-2v13"/><path d="M9 8l12-2"/><ellipse cx="6" cy="19" rx="3" ry="2"/><ellipse cx="18" cy="17" rx="3" ry="2"/>'),
    text:svg('<path d="M4 6h16M12 6v13m-5 0h10"/>'),
    stickers:svg('<path d="m12 3 2.7 5.7L21 9.6l-4.5 4.2 1 6.2L12 17l-5.5 3 1-6.2L3 9.6l6.3-.9z"/>'),
    effects:svg('<path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8zM19 2v4m-2-2h4"/>'),
    transitions:svg('<path d="M3 12h8m-4-4 4 4-4 4M21 12h-8m4-4-4 4 4 4"/>'),
    filters:svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>'),
    adjustment:svg('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#202125"/><circle cx="16" cy="12" r="2" fill="#202125"/><circle cx="10" cy="18" r="2" fill="#202125"/>')
  };
  const categories = [
    ["media","Media"],["audio","Audio"],["text","Text"],
    ["stickers","Stickers"],["effects","Effects"],["transitions","Transitions"],
    ["filters","Filters"],["adjustment","Adjustment"]
  ];
  toolbar.innerHTML = categories.map(([key,label]) =>
    '<button type="button" data-p1-tool="' + key + '" aria-pressed="' + (key === "media") +
    '" title="' + label + '"><span aria-hidden="true" class="st-p1-icon">' +
    icons[key] + '</span><span>' + label + '</span></button>'
  ).join("");
  root.querySelector(".st-menubar")?.insertAdjacentElement("afterend", toolbar);

  const assets = $(".st-assets");
  const sourcePanel = $(".st-source-panel");
  const inspector = $("#stInspector");
  const inspectorBox = $(".st-inspector");
  if (!assets || !sourcePanel || !inspector || !inspectorBox) return;

  function activateTool(key) {
    const map = {filters:"effects", adjustment:"effects"};
    const original = map[key] || key;
    const rail = $('[data-rail-tab="' + original + '"]');
    if (rail) rail.click();
    // The rail only opens the project tab for Media. The hidden original tab
    // is still a real handler, and resets the media-category filter.
    if (original === "media") $('[data-st-tab="media"]')?.click();
    toolbar.querySelectorAll("[data-p1-tool]").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.p1Tool === key))
    );
    assets.dataset.phaseTool = key;
    const selectedPane = assets.querySelector('[data-project-pane="tools"]');
    if ((key === "filters" || key === "adjustment") && selectedPane) {
      const button = key === "filters" ?
        selectedPane.querySelector("[data-st-effect]") :
        selectedPane.querySelector('[data-st-action="adjustment"]');
      button?.scrollIntoView({block:"nearest",behavior:"instant"});
    }
    if (key === "media") applyMediaFilter();
  }
  toolbar.addEventListener("click", event => {
    const button = event.target.closest("[data-p1-tool]");
    if (button) activateTool(button.dataset.p1Tool);
  });

  // A usable media-bin search and category filter, not decorative controls.
  // The original media collection, thumbnails and drag events are not cloned.
  const mediaList = $("#stMedia");
  if (mediaList) {
    const search = document.createElement("div");
    search.className = "st-p1-media-search";
    search.innerHTML =
      '<label for="stP1Search">Search imported media</label>' +
      '<input id="stP1Search" type="search" placeholder="Search clips by file name…" autocomplete="off">' +
      '<div class="st-p1-filter" role="group" aria-label="Filter imported media">' +
      '<button type="button" data-p1-filter="all" aria-pressed="true">All</button>' +
      '<button type="button" data-p1-filter="video" aria-pressed="false">Video</button>' +
      '<button type="button" data-p1-filter="audio" aria-pressed="false">Audio</button>' +
      '<button type="button" data-p1-filter="image" aria-pressed="false">Images</button></div>';
    mediaList.insertAdjacentElement("beforebegin", search);
    let filter = "all";
    const input = search.querySelector("#stP1Search");
    const apply = () => {
      const query = input.value.trim().toLocaleLowerCase();
      mediaList.querySelectorAll(".st-media-item").forEach(item => {
        const kind = item.dataset.kind || (
          item.classList.contains("st-image-item") ? "image" :
          (window.ClipForgeEditor?.state?.media?.find(m => m.id === item.dataset.mid)?.kind || "")
        );
        const name = (item.querySelector("b")?.textContent || item.getAttribute("aria-label") || "").toLocaleLowerCase();
        item.hidden = (filter !== "all" && kind !== filter) || !name.includes(query);
      });
    };
    window.ClipForgeEditor?.state?.media && apply();
    input.addEventListener("input", apply);
    search.addEventListener("click", e => {
      const b = e.target.closest("[data-p1-filter]");
      if (!b) return;
      filter = b.dataset.p1Filter;
      search.querySelectorAll("[data-p1-filter]").forEach(x =>
        x.setAttribute("aria-pressed", String(x === b)));
      apply();
    });
    // Editor re-renders media buttons on import. Observe only children, not
    // hidden attributes, so filtering never creates an observer loop.
    new MutationObserver(apply).observe(mediaList, {childList:true});
    const originalApply = apply;
    // Reset hidden legacy filters so they cannot override the visible Project-bin filter.
    applyMediaFilter = () => {
      $('[data-st-filter="all"]')?.click();
      originalApply();
    };
    root.addEventListener("click", e => {
      const link = e.target.closest('[data-project-tab="project"]');
      if (link) queueMicrotask(originalApply);
    });
    // Alias for the top Media tool, keeping one source of truth.
    toolbar.addEventListener("click", e => {
      if (e.target.closest('[data-p1-tool="media"]')) queueMicrotask(applyMediaFilter);
    });
  }

  const tabs = document.createElement("nav");
  tabs.className = "st-p1-inspector-tabs";
  tabs.setAttribute("aria-label", "Selected clip properties");
  const properties = [
    ["video", "Video"], ["audio", "Audio"], ["speed", "Speed"],
    ["animation", "Animation"], ["adjust", "Adjust"], ["source", "Source"]
  ];
  tabs.innerHTML = properties.map(([key,label]) =>
    '<button type="button" data-p1-inspector="' + key + '" aria-pressed="' +
    (key === "video") + '">' + label + '</button>').join("");
  sourcePanel.insertBefore(tabs, sourcePanel.firstChild);
  let activeProperty = "video";
  function inspectCategory(key) {
    activeProperty = key;
    tabs.querySelectorAll("[data-p1-inspector]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.p1Inspector === key)));
    sourcePanel.querySelector('[data-left-tab="' + (key === "source" ? "source" : "effects") + '"]')?.click();
    if (key !== "source") filterInspector();
  }
  const matchers = {
    video:/start|trim|position|scale|rotation|opacity|crop|blend mode|freeze|duration|size|color|text/i,
    audio:/volume|audio|fade in|fade out/i,
    speed:/playback speed|speed/i,
    animation:/animation|interpolation|keyframe/i,
    adjust:/filter|brightness|contrast|saturation|exposure|vibrance|temperature|tint|highlights|shadows|blur|vignette|hue|blend|color/i
  };
  const note = document.createElement("p");
  note.className = "st-p1-inspector-note";
  note.hidden = true;
  // Use the controls that app.js and timeline.js render and bind. Visibility
  // filtering must never remove, replace, clone, or disable those controls.
  function filterInspector() {
    if (activeProperty === "source") return;
    const matcher = matchers[activeProperty];
    let count = 0;
    inspector.querySelectorAll(".st-prop").forEach(group => {
      const label = group.querySelector("label")?.textContent ||
        group.querySelector("span")?.textContent || "";
      const visible = matcher.test(label);
      group.hidden = !visible;
      if (visible) count++;
    });
    inspector.querySelectorAll(".st-keyframe-editor, #pKey, #exFreeze").forEach(item => {
      item.hidden = activeProperty !== (item.id === "exFreeze" ? "video" : "animation");
    });
    inspector.querySelectorAll(".st-grade-panel").forEach(item => {
      item.hidden = activeProperty !== "adjust";
    });
    // This note accurately explains missing per-clip options, and does not
    // create pretend sliders or mutate a selected clip.
    const explanation = count ? "" :
      activeProperty === "speed" ? "Select a video clip to change its real playback speed." :
      activeProperty === "audio" ? "Select a video or audio clip to edit its sound." :
      activeProperty === "animation" ? "Select a clip with animation controls or keyframes." :
      activeProperty === "adjust" ? "Select a clip or adjustment layer to edit its colors." :
      "Select a clip on the timeline to edit it.";
    if (note.parentElement !== inspector) inspector.append(note);
    if (note.textContent !== explanation) note.textContent = explanation;
    note.hidden = !explanation;
  }
  tabs.addEventListener("click", event => {
    const button = event.target.closest("[data-p1-inspector]");
    if (button) inspectCategory(button.dataset.p1Inspector);
  });
  new MutationObserver(filterInspector).observe(inspector,{childList:true});
  inspectCategory("video");
  // Source preview from a media item must remain reachable when old source
  // button is clicked. The existing source module owns loadSource().
  root.addEventListener("click", event => {
    if (event.target.closest("[data-media-preview]"))
      queueMicrotask(() => {
        activeProperty = "source";
        tabs.querySelectorAll("[data-p1-inspector]").forEach(x =>
          x.setAttribute("aria-pressed", String(x.dataset.p1Inspector === "source")));
      });
  });
})();