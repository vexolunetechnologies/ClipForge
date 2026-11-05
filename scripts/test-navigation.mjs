import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const nav = readFileSync(new URL("../navigation.js", import.meta.url), "utf8");
const tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
const origin = "https://clipforgestudio.pages.dev";

function harness(start) {
  const handlers = { window: new Map(), document: new Map() };
  const location = { origin };
  const events = [];
  function apply(url) {
    const parsed = new URL(url, origin);
    location.href = parsed.href;
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  }
  apply(start);
  function add(which, type, fn) {
    const arr = handlers[which].get(type) || [];
    arr.push(fn); handlers[which].set(type, arr);
  }
  function dispatch(which, type, data = {}) {
    events.push(type);
    for (const fn of handlers[which].get(type) || []) fn({type, ...data});
  }
  const history = {
    state: null, calls: [],
    pushState(state, _, url) { this.calls.push({kind:"push",url});this.state=state;apply(url); },
    replaceState(state, _, url) { this.calls.push({kind:"replace",url});this.state=state;apply(url); }
  };
  const document = {
    addEventListener(type, fn) { add("document",type,fn); },
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    location, history,
    addEventListener(type, fn) { add("window",type,fn); },
    dispatchEvent(event) { dispatch("window",event.type); }
  };
  class Event { constructor(type){ this.type=type; } }
  runInNewContext(nav, {window,document,location,history,URL,Event});
  dispatch("document","DOMContentLoaded");
  function click(href, options={}) {
    const anchor = {
      target:"",
      hasAttribute(){return false;},
      getAttribute(name){return name==="href"?href:null;}
    };
    const e = {
      button:0, defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},
      target:{closest(selector){return selector==="a[href]"?anchor:null;}},
      ...options
    };
    dispatch("document","click",e);
    return e;
  }
  return {location,history,events,window,click,
    backTo(url){apply(url);dispatch("window","popstate");}};
}

for(const tool of tools){
  const h=harness("/tools/"+tool+"/");
  assert.equal(h.location.hash,"");
  assert.equal(h.window.ClipForgeNavigation.current(),tool);
  const result=h.click("#shorts");
  assert.equal(result.defaultPrevented,true);
  assert.equal(h.location.pathname,"/tools/shorts/");
  assert.equal(h.location.hash,"");
}
{
  const h=harness("/tools/shorts/#shorts");
  assert.equal(h.location.href,origin+"/tools/shorts/");
  assert.equal(h.history.calls[0].kind,"replace");
}
{
  const h=harness("/#captions");
  assert.equal(h.location.href,origin+"/tools/captions/");
}
{
  const h=harness("/");
  assert.equal(h.click("#editor").defaultPrevented,true);
  assert.equal(h.location.pathname,"/tools/editor/");
  assert.equal(h.location.hash,"");
  const count=h.history.calls.length;
  h.click("#reverse");
  assert.equal(h.location.pathname,"/tools/reverse/");
  assert.equal(h.history.calls.length,count+1);
  h.backTo("/tools/editor/");
  assert.equal(h.window.ClipForgeNavigation.current(),"editor");
  h.click("#tools");
  assert.equal(h.location.pathname,"/");
  assert.equal(h.location.hash,"#tools");
}
{
  const h=harness("/tools/animator/");
  h.window.ClipForgeNavigation.setBusy("animator",true);
  h.click("#reverse");
  assert.equal(h.location.pathname,"/tools/animator/","Active export must not be interrupted");
  h.window.ClipForgeNavigation.setBusy("animator",false);
  h.click("/tools/reverse/");
  assert.equal(h.location.pathname,"/tools/reverse/");
}
{
  const h=harness("/tools/reverse/");
  const modified=h.click("#captions",{metaKey:true});
  assert.equal(modified.defaultPrevented,false,"Modified clicks should keep browser native handling");
  assert.equal(h.location.pathname,"/tools/reverse/");
  const external=h.click("/privacy.html");
  assert.equal(external.defaultPrevented,false,"Legal pages keep normal navigation");
}
console.log("ClipForge: clean URLs and no-reload history routing checks passed.");
