/* ClipForge client-side navigation. Video tools stay mounted in one document. */
(function () {
  "use strict";

  var tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
  var toolPattern = /^\/tools\/(shorts|trailer|animator|reverse|montage|highlights|editor|captions)\/(?:index\.html)?$/;
  var legacy = {
    "#top": "/", "#tools": "/#tools", "#features": "/#features",
    "#faq": "/#faq", "#how": "/#how", "#tool": "/tools/shorts/"
  };
  tools.forEach(function (tool) { legacy["#" + tool] = "/tools/" + tool + "/"; });
  var busy = Object.create(null);

  function toolAt(path) {
    var match = toolPattern.exec(path);
    return match ? match[1] : null;
  }

  function current() {
    return toolAt(location.pathname) ||
      (location.hash ? location.hash.slice(1) : "top") || "top";
  }

  function canonicalize() {
    var hash = location.hash.replace(/^#/, "");
    var tool = toolAt(location.pathname);
    if (tools.indexOf(hash) >= 0) {
      history.replaceState(history.state, "", "/tools/" + hash + "/" + location.search);
    } else if (tool && /\/index\.html$/.test(location.pathname)) {
      history.replaceState(history.state, "", "/tools/" + tool + "/" + location.search + location.hash);
    }
  }

  canonicalize();

  function setBusy(tool, value) {
    if (tools.indexOf(tool) >= 0) busy[tool] = !!value;
  }

  function isBusy() {
    var active = current();
    if (busy[active]) return true;
    // app.js declares its Shorts/Trailer busy state in the shared classic-script scope.
    try { if ((active === "shorts" || active === "trailer") &&
        typeof window.ClipForgeMainBusy === "function" && window.ClipForgeMainBusy()) return true; }
    catch (_) {}

    var stopId = {
      reverse: "rvStop", montage: "vmStop",
      highlights: "hsStop", captions: "cfCapStop"
    }[active];
    var stop = stopId && document.getElementById(stopId);
    if (active === "reverse" && stop && !stop.classList.contains("hide")) return true;
    if ((active === "montage" || active === "highlights") && stop &&
        stop.style.display !== "none" && !stop.hidden) return true;
    if (active === "captions" && stop && !stop.disabled) return true;
    if (active === "editor" &&
        (document.getElementById("editorTool")?.classList.contains("is-exporting") ||
          window.ClipForgeEditor?.state?.exporting)) return true;
    return false;
  }

  function explainBusy() {
    var note = document.getElementById("iaNote") ||
      document.getElementById("toast");
    if (note) {
      note.textContent = "Stop or finish the current export before changing tools.";
      if (note.id === "toast") note.style.display = "block";
    }
  }

  var previousRoute = current();

  function pauseInactive(route) {
    if (route === current()) return;
    var panels = {
      shorts: "tool", trailer: "tool", animator: "iaTool", reverse: "rvTool",
      montage: "vmTool", highlights: "highlightsTool", editor: "editorTool",
      captions: "cfCaptionsWorkspace"
    };
    var old = document.getElementById(panels[route]);
    if (old) old.querySelectorAll("video").forEach(function (video) { video.pause(); });
  }

  function notify() {
    var next = current();
    if (previousRoute !== next) pauseInactive(previousRoute);
    previousRoute = next;
    window.dispatchEvent(new Event("hashchange"));
  }

  function restore(tool) {
    if (tools.indexOf(tool) < 0) return;
    history.replaceState(history.state, "", "/tools/" + tool + "/");
    notify();
  }

  function navigate(destination, replace) {
    var url = new URL(destination, location.href);
    if (url.origin !== location.origin) return false;
    var target = url.pathname + url.search + url.hash;
    var now = location.pathname + location.search + location.hash;
    if (target === now) return true;
    if (isBusy()) { explainBusy(); return false; }
    history[replace ? "replaceState" : "pushState"](history.state, "", target);
    notify();
    return true;
  }

  function resolveLink(anchor) {
    if (anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")) return null;
    var raw = anchor.getAttribute("href");
    if (!raw) return null;
    if (Object.prototype.hasOwnProperty.call(legacy, raw)) return legacy[raw];
    var url;
    try { url = new URL(raw, location.href); } catch (_) { return null; }
    if (url.origin !== location.origin) return null;
    var tool = toolAt(url.pathname);
    if (tool) return "/tools/" + tool + "/" + url.search;
    if (url.pathname === "/" &&
        (!url.hash || Object.prototype.hasOwnProperty.call(legacy, url.hash))) {
      if (tools.indexOf(url.hash.slice(1)) >= 0 || url.hash === "#tool")
        return legacy[url.hash];
      if (url.hash === "#top") return "/";
      return url.pathname + url.search + url.hash;
    }
    return null;
  }

  function click(event) {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.shiftKey || event.metaKey || event.altKey) return;
    var anchor = event.target.closest && event.target.closest("a[href]");
    if (!anchor) return;
    var to = resolveLink(anchor);
    if (!to) return;
    event.preventDefault();
    navigate(to, false);
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Register after the legacy tool handlers so their preventDefault guards win.
    document.addEventListener("click", click);
  });

  window.addEventListener("popstate", function () {
    if (previousRoute !== current() && isBusy()) {
      restore(previousRoute);
      explainBusy();
      return;
    }
    notify();
  });

  window.addEventListener("hashchange", canonicalize);

  window.addEventListener("beforeunload", function (event) {
    // An actual browser leave still warns about unsaved source files.
    if (!toolAt(location.pathname)) return;
    var files = document.querySelectorAll('input[type="file"]');
    for (var i = 0; i < files.length; i++) {
      if (files[i].files && files[i].files.length) {
        event.preventDefault();
        event.returnValue = "";
        return;
      }
    }
  });

  window.ClipForgeNavigation = { current: current, navigate: navigate, restore: restore, setBusy: setBusy };
})();
