import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const src=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const p0=src.indexOf("function planFrames(S,ww,t0){"),p1=src.indexOf("/* tighten a caption segment",p0);
assert.ok(p0>=0&&p1>p0,"Expected framing planner");
const c={Math,Float32Array};runInNewContext(src.slice(p0,p1),c);
const frames=[];
for(let i=0;i<28;i++){
 const time=i*.25,cx=time<3?.28:.74;
 frames.push({t:time,cut:i===0,faces:[{c:cx,l:cx-.05,r:cx+.05,w:.1,m:.1}],mc:new Float32Array(16)});
}
const keys=c.planFrames(frames,.3,0);
assert.ok(keys.length>=2,"Subject switch should generate new tracking keys");
assert.equal(keys.filter((k,i)=>i>0&&k.cut).length,0,
 "Face movement within one shot must never abruptly cut the crop");
const realCut=frames.map(x=>({...x,cut:x.t===3}));
const shotKeys=c.planFrames(realCut,.3,0);
assert.ok(shotKeys.filter(x=>x.cut).length>=2,"Genuine scene cuts must remain separate compositions");

const u0=src.indexOf("function camUpdate(t,dt,lc){"),u1=src.indexOf("// Redraw the preview",u0);
assert.ok(u0>=0&&u1>u0,"Camera update implementation not found");
const moving={cam:{keys:[{t:0,t0:0,x:.25,cut:true},{t:.1,t0:.1,x:.75,cut:false}],k:0,x:.25,tx:.25,vx:0,ww:.3,pg:null}};
runInNewContext(src.slice(u0,u1),moving);
for(let i=1;i<=75;i++){
 const old=moving.cam.x;
 moving.camUpdate(i/30,1/30,false);
 assert.ok(Math.abs(moving.cam.x-old)<=.3*.7/30+.00001,"In-shot motion exceeds smooth camera speed");
}
assert.ok(moving.cam.x>.62,"Camera should follow subject after ~2.5 seconds");
assert.ok(moving.cam.x<=.85,"Crop cannot move beyond source boundary");
const scene={cam:{keys:[{t:0,t0:0,x:.25,cut:true},{t:1,t0:1,x:.75,cut:true}],k:0,x:.25,tx:.25,vx:0,ww:.3,pg:null}};
runInNewContext(src.slice(u0,u1),scene);
scene.camUpdate(1.1,1/30,false);
assert.equal(scene.cam.x,.75,"Actual scene cut should recenter crop immediately");
console.log("ClipForge Shorts framing: smooth in-shot pans, speed cap, boundaries and genuine shot cuts passed.");