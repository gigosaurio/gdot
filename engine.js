// G. — engine: keyboard model, creatures, terrain, ecology and the turn loop. No DOM in here.
// Loads two ways: as a classic script in play.html (window.GDOT) and as a CommonJS
// module in Node for test/smoke.mjs and the tools/ scripts.
// Rules are documented in README.md; every rule change lands here first.
//
// Two rule sets, chosen per zone (zone.rules) or per level (level.rules):
//   classic   — reach the goal count (and hold every starfish); a creature on a tentacle kills you.
//   territory — fill every open key of the tank in as few presses as you can (par = the fewest).
//               A creature that lands on a tentacle takes that key (it is yours again once it leaves
//               and you fill it); you only lose when every tentacle is taken. You can only grab keys
//               next to one of your tentacles. A starfish, once held, turns the algae around it into
//               water: more tank to fill.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GDOT = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

/* ================= keyboard model (ANSI TKL) ================= */
const ROWY=[0,1.25,2.25,3.25,4.25,5.25];
const K=(code,label,row,x,w=1)=>({code,label,row,x,w});
const KEYS=[
  K('Escape','Esc',0,0),K('F1','F1',0,2),K('F2','F2',0,3),K('F3','F3',0,4),K('F4','F4',0,5),
  K('F5','F5',0,6.5),K('F6','F6',0,7.5),K('F7','F7',0,8.5),K('F8','F8',0,9.5),
  K('F9','F9',0,11),K('F10','F10',0,12),K('F11','F11',0,13),K('F12','F12',0,14),
  K('Backquote','`',1,0),K('Digit1','1',1,1),K('Digit2','2',1,2),K('Digit3','3',1,3),K('Digit4','4',1,4),K('Digit5','5',1,5),
  K('Digit6','6',1,6),K('Digit7','7',1,7),K('Digit8','8',1,8),K('Digit9','9',1,9),K('Digit0','0',1,10),
  K('Minus','-',1,11),K('Equal','=',1,12),K('Backspace','Bksp',1,13,2),
  K('Tab','Tab',2,0,1.5),K('KeyQ','Q',2,1.5),K('KeyW','W',2,2.5),K('KeyE','E',2,3.5),K('KeyR','R',2,4.5),K('KeyT','T',2,5.5),
  K('KeyY','Y',2,6.5),K('KeyU','U',2,7.5),K('KeyI','I',2,8.5),K('KeyO','O',2,9.5),K('KeyP','P',2,10.5),
  K('BracketLeft','[',2,11.5),K('BracketRight',']',2,12.5),K('Backslash','\\',2,13.5,1.5),
  K('CapsLock','Caps',3,0,1.75),K('KeyA','A',3,1.75),K('KeyS','S',3,2.75),K('KeyD','D',3,3.75),K('KeyF','F',3,4.75),K('KeyG','G',3,5.75),
  K('KeyH','H',3,6.75),K('KeyJ','J',3,7.75),K('KeyK','K',3,8.75),K('KeyL','L',3,9.75),K('Semicolon',';',3,10.75),K('Quote',"'",3,11.75),
  K('Enter','Enter',3,12.75,2.25),
  K('ShiftLeft','Shift',4,0,2.25),K('KeyZ','Z',4,2.25),K('KeyX','X',4,3.25),K('KeyC','C',4,4.25),K('KeyV','V',4,5.25),K('KeyB','B',4,6.25),
  K('KeyN','N',4,7.25),K('KeyM','M',4,8.25),K('Comma',',',4,9.25),K('Period','.',4,10.25),K('Slash','/',4,11.25),K('ShiftRight','Shift',4,12.25,2.75),
  K('ControlLeft','Ctrl',5,0,1.25),K('MetaLeft','Win',5,1.25,1.25),K('AltLeft','Alt',5,2.5,1.25),K('Space','',5,3.75,6.25),
  K('AltRight','Alt',5,10,1.25),K('MetaRight','Win',5,11.25,1.25),K('ContextMenu','Menu',5,12.5,1.25),K('ControlRight','Ctrl',5,13.75,1.25),
];
const KEYMAP=Object.fromEntries(KEYS.map(k=>[k.code,k]));
const IDX=Object.fromEntries(KEYS.map((k,i)=>[k.code,i]));
const EPS=0.05;
function adjacent(a,b){
  if(a===b) return false;
  const dr=Math.abs(a.row-b.row); if(dr>1) return false;
  const a0=a.x,a1=a.x+a.w,b0=b.x,b1=b.x+b.w;
  if(dr===0) return Math.abs(a1-b0)<EPS||Math.abs(b1-a0)<EPS;
  return Math.min(a1,b1)-Math.max(a0,b0)>0.1;
}
const NEI={},DIRS={};
for(const a of KEYS){
  const n=KEYS.filter(b=>adjacent(a,b)); NEI[a.code]=n.map(b=>b.code);
  const same=n.filter(b=>b.row===a.row), up=n.filter(b=>b.row===a.row-1).sort((p,q)=>p.x-q.x), dn=n.filter(b=>b.row===a.row+1).sort((p,q)=>p.x-q.x);
  const d={};
  d.E=(same.find(b=>b.x>a.x)||{}).code||null; d.W=(same.find(b=>b.x<a.x)||{}).code||null;
  d.NW=up.length?up[0].code:null; d.NE=up.length?up[up.length-1].code:null;
  d.SW=dn.length?dn[0].code:null; d.SE=dn.length?dn[dn.length-1].code:null;
  DIRS[a.code]=d;
}
const OPP={E:'W',W:'E',NE:'SW',SW:'NE',NW:'SE',SE:'NW'};
const L=c=>KEYMAP[c]?KEYMAP[c].label||'Space':c;

/* ================= creatures ================= */
// A type is a preset of these fields. Ecology fields, all lists of creature types:
//   eats    — when this creature and one of these meet on a key (or cross paths), the other dies.
//             Terrain protects the victim exactly as it protects a tentacle (cave: from all but
//             cave dwellers; reef: from small eaters).
//   chases  — chase movers step toward the nearest target of the first kind in this list that is
//             within range ('tentacle' = your tentacles). A target it does not eat is followed at
//             one key's distance. So ['fish','tentacle'] = distracted by fish; ['shark'] = follows sharks.
//   flees   — flee movers step away when one of these is next to them.
// A level can override any preset per type (level.ecology = {crab:{eats:[]}}), a zone can too
// (zone.ecology, applied under the level's), and a single creature can carry its own fields.
const PRESETS={
  shark:    {label:'Shark',     size:'big',   mover:'dir',  dir:'NE', speed:1,   prey:false, cave:false, wake:false, eats:['eel','fish','seal','pilot']},
  barracuda:{label:'Barracuda', size:'small', mover:'dir',  dir:'E',  speed:2,   prey:false, cave:false, wake:false, eats:['fish','pilot']},
  crab:     {label:'Crab',      size:'small', mover:'dir',  dir:'E',  speed:0.5, prey:false, cave:false, wake:false, eats:['urchin']},
  eel:      {label:'Moray eel', size:'big',   mover:'chase',dir:'E',  speed:1,   prey:false, cave:true,  wake:true,  chases:['tentacle']},
  urchin:   {label:'Urchin',    size:'big',   mover:'still',dir:'E',  speed:0,   prey:false, cave:false, wake:false},
  fish:     {label:'Fish',      size:'small', mover:'flee', dir:'E',  speed:0.5, prey:true,  cave:false, wake:false, flees:['tentacle']},
  seal:     {label:'Seal',      size:'big',   mover:'chase',dir:'E',  speed:1,   prey:false, cave:false, wake:false, chases:['fish','pilot','tentacle'], eats:['fish','pilot']},
  pilot:    {label:'Pilot fish',size:'small', mover:'chase',dir:'E',  speed:1,   prey:true,  cave:false, wake:false, chases:['shark']},
};
const TYPES=Object.keys(PRESETS);
const TARGETS=['tentacle',...TYPES];
const MOVERS=['path','dir','chase','flee','still'];
const HEADINGS=['E','W','NE','NW','SE','SW'];
const TERRAINS=['algae','rock','reef','cave'];
const LIFTS=['any','one','none'];

const clone=o=>JSON.parse(JSON.stringify(o));
const slug=s=>(s||'level').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'level';
function expandPath(c){ const p=(c.path||[]).filter(k=>KEYMAP[k]); if(c.loop==='pingpong'&&p.length>2) return p.concat(p.slice(1,-1).reverse()); return p; }

// Fill a level's optional fields in place (so the editor's JSON shows them) and return it.
function normalizeLevel(l){
  l.creatures=l.creatures||[]; l.start=l.start||[]; l.required=l.required||[]; l.terrain=l.terrain||{};
  l.name=l.name||'Level'; l.id=l.id||slug(l.name); return l;
}
// A level as played inside its zone: the zone's ecology sits under the level's own.
function resolveLevel(level,zone){
  if(zone&&zone.rules&&!level.rules) level=Object.assign({},level,{rules:zone.rules});
  if(!zone||!zone.ecology) return level;
  const eco={}; for(const t of new Set([...Object.keys(zone.ecology),...Object.keys(level.ecology||{})])) eco[t]=Object.assign({},zone.ecology[t],(level.ecology||{})[t]);
  return Object.assign({},level,{ecology:eco});
}
// Effective ecology for one creature spec: creature fields, then level ecology, then the preset.
function ecologyOf(c,level){
  const p=PRESETS[c.type]||{}, e=((level&&level.ecology)||{})[c.type]||{};
  const pick=k=>Array.isArray(c[k])?c[k]:Array.isArray(e[k])?e[k]:Array.isArray(p[k])?p[k]:null;
  return {eats:pick('eats')||[],chases:pick('chases')||['tentacle'],flees:pick('flees')||['tentacle'],range:c.range!=null?+c.range:e.range!=null?+e.range:p.range!=null?p.range:7};
}

/* ================= game state ================= */
// createGame never mutates the level it is given.
function createGame(level){
  const LV=level||{};
  const max=+LV.maxTentacles>0?Math.floor(+LV.maxTentacles):0;
  let TER=Object.assign({},LV.terrain||{}); // this game's own copy: a starfish can turn algae into water
  if(Array.isArray(LV.tank)){ // a closed tank: every key outside it that has no terrain of its own is algae
    const inside=new Set(LV.tank); TER=Object.assign({},TER);
    for(const k of KEYS) if(!inside.has(k.code)&&!TER[k.code]) TER[k.code]='algae';
  }
  const g={level:LV,phase:'ready',turn:0,fingers:new Set(),revealed:new Set(),
    TER,START:(LV.start||[]).filter(k=>KEYMAP[k]),REQ:(LV.required||[]).filter(k=>KEYMAP[k]),GOAL:max?Math.min(LV.goal||8,max):(LV.goal||8),
    MAX:max,LIFT:LIFTS.includes(LV.lift)?LV.lift:'any',liftPending:false,lifted:null,creatures:[],last:null,
    MODE:LV.rules==='territory'?'territory':'classic',grown:new Set()};
  if(g.MODE==='territory') g.MAX=0; // fill everything: no cap
  g.creatures=(LV.creatures||[]).map((c,n)=>{
    const eco=ecologyOf(c,LV);
    const r={id:n,type:c.type,label:(PRESETS[c.type]||{}).label||c.type,size:c.size||'big',mover:c.mover||'dir',dir:c.dir||'E',speed:c.speed==null?1:Number(c.speed),
      prey:!!c.prey,cave:!!c.cave,wake:!!c.wake,eats:eco.eats,chases:eco.chases,flees:eco.flees,range:eco.range,
      seen:false,awake:!c.wake,alive:true,acc:0,run:[],i:0,pos:null,prev:null};
    if(r.mover==='path'){ r.run=expandPath(c); r.i=Math.min(c.pathIndex||0,Math.max(0,r.run.length-1)); if(!r.run.length){r.mover='still';r.pos=KEYMAP[c.at]?c.at:null;} }
    else r.pos=KEYMAP[c.at]?c.at:null;
    if(r.mover==='path') r.pos=r.run[r.i];
    r.prev=r.pos;
    return r;
  }).filter(c=>c.pos);
  if(g.MODE==='territory') g.GOAL=fillable(g);
  return g;
}
function cloneGame(g){ return Object.assign({},g,{fingers:new Set(g.fingers),revealed:new Set(g.revealed),grown:new Set(g.grown||[]),creatures:g.creatures.map(c=>Object.assign({},c)),last:null}); }
// Territory: the keys you have to fill. Grip keys joined to a start key through grip keys; a key where a
// creature never moves (an urchin) is a wall. Grows when a starfish opens algae, or when that creature is eaten.
function territory(g){
  const wall=new Set(); for(const c of g.creatures) if(c.alive&&!c.prey&&(c.mover==='still'||c.speed<=0)) wall.add(c.pos);
  const seen=new Set(), q=[...g.START];
  while(q.length){ const k=q.pop(); if(seen.has(k)||!grip(g,k)||wall.has(k)) continue; seen.add(k); for(const n of NEI[k]) if(!seen.has(n)) q.push(n); }
  return seen;
}
// A creature's key is its tile: the tank is clear when every key of the territory is yours or has a creature on it.
const creatureKeys=g=>{ const s=new Set(); for(const c of g.creatures) if(c.alive&&!c.prey) s.add(c.pos); return s; };
function unfilled(g){ const t=territory(g), ck=creatureKeys(g); let n=0; for(const k of t) if(!g.fingers.has(k)&&!ck.has(k)) n++; return n; }
// keys you can still fill right now (the live goal the tray shows)
function fillable(g){ const t=territory(g), ck=creatureKeys(g); let n=0; for(const k of t) if(!ck.has(k)) n++; return n; }

const isRock=(g,k)=>g.TER[k]==='rock';
const passable=(g,k)=>!!KEYMAP[k]&&!isRock(g,k);
const grip=(g,k)=>{ const t=g.TER[k]; return t!=='algae'&&t!=='rock'; };

function distMap(g,sources,cap){ // BFS over passable keys
  const d={}; let q=[]; for(const s of sources){d[s]=0;q.push(s);}
  while(q.length){ const nq=[]; for(const k of q){ if(d[k]>=cap) continue; for(const n of NEI[k]) if(passable(g,n)&&d[n]===undefined){d[n]=d[k]+1;nq.push(n);} } q=nq; }
  return d;
}
// Keys where targets of one kind are: your tentacles, or every other living creature of that type.
function targetKeys(g,c,kind){
  if(kind==='tentacle') return [...g.fingers];
  const out=[]; for(const o of g.creatures) if(o!==c&&o.alive&&o.type===kind) out.push(o.pos); return out;
}
function moveOnce(g,c){
  if(c.mover==='path'){ c.i=(c.i+1)%c.run.length; c.pos=c.run[c.i]; return; }
  if(c.mover==='dir'){
    let n=DIRS[c.pos][c.dir];
    if(!n||isRock(g,n)){ c.dir=OPP[c.dir]; n=DIRS[c.pos][c.dir]; if(!n||isRock(g,n)) return; }
    c.pos=n; return;
  }
  if(c.mover==='chase'){
    for(const kind of c.chases||['tentacle']){
      const src=targetKeys(g,c,kind); if(!src.length) continue;
      const d=distMap(g,src,c.range||7); const cur=d[c.pos]; if(cur===undefined) continue;
      const stop=(kind==='tentacle'||(c.eats||[]).includes(kind))?0:1; // follow what you don't eat at one key
      if(cur<=stop) return;
      let best=null,bd=cur; for(const n of NEI[c.pos]) if(passable(g,n)&&d[n]!==undefined&&d[n]<bd){bd=d[n];best=n;}
      if(best) c.pos=best; return;
    }
    return;
  }
  if(c.mover==='flee'){
    const src=[]; for(const kind of c.flees||['tentacle']) src.push(...targetKeys(g,c,kind));
    if(!src.length) return; const d=distMap(g,src,3); const cur=d[c.pos]; if(cur===undefined||cur>1) return;
    let best=null,bd=cur; for(const n of NEI[c.pos]) if(passable(g,n)&&!g.fingers.has(n)){ const dn=d[n]===undefined?9:d[n]; if(dn>bd){bd=dn;best=n;} }
    if(best) c.pos=best; return;
  }
}
// Does the terrain at k protect a tentacle (or a creature) there from attacker c?
function hidden(g,c,k){ const t=g.TER[k]; if(t==='cave') return !c.cave; if(t==='reef') return c.size==='small'; return false; }
function canEat(g,eater,victim){ return eater.alive&&victim.alive&&(eater.eats||[]).includes(victim.type)&&!hidden(g,eater,victim.pos); }
// How many steps a creature takes this turn (consumes its speed accumulator).
function stepsThisTurn(c){
  if(!c.alive||!c.seen||!c.awake||c.speed<=0) return 0;
  c.acc+=c.speed; let n=0; while(c.acc>=1&&n<4){ c.acc-=1; n++; } return n;
}
// Every seen, awake creature takes its steps. Then creatures that end the turn on the same key, or
// that swapped keys head-on, meet, and an eater eats. One rule for tentacles and creatures alike: a
// square a speed-2 creature only hops over is not touched. If both could eat the other, the one that
// arrived eats; if both arrived, the bigger one; then the one listed first.
function stepAll(g){
  const stepped=[];
  for(const c of g.creatures){
    c.route=[c.pos]; const n=stepsThisTurn(c);
    for(let i=0;i<n;i++){ moveOnce(g,c); if(c.pos!==c.route[c.route.length-1]) c.route.push(c.pos); }
    if(c.route.length>1) stepped.push(c);
  }
  const meals=[], cs=g.creatures, moved=x=>!!x.route&&x.route.length>1;
  for(let i=0;i<cs.length;i++) for(let j=i+1;j<cs.length;j++){
    const a=cs[i], b=cs[j]; if(!a.alive||!b.alive) continue;
    const same=a.pos===b.pos, swap=moved(a)&&moved(b)&&a.pos===b.prev&&b.pos===a.prev;
    if(!same&&!swap) continue;
    const ab=canEat(g,a,b), ba=canEat(g,b,a); let eater=null, victim=null;
    if(ab&&!ba){ eater=a; victim=b; } else if(ba&&!ab){ eater=b; victim=a; }
    else if(ab&&ba){ const pick=moved(a)!==moved(b)?(moved(a)?a:b):(a.size==='big')!==(b.size==='big')?(a.size==='big'?a:b):a; eater=pick; victim=pick===a?b:a; }
    if(eater){ victim.alive=false; meals.push({eater,victim,key:victim.pos}); }
  }
  return {stepped,meals};
}
// Intent: where each creature will be after your next press (it moves before your tentacle lands),
// as {id, from, to, route}. A creature that stays put this turn has to===from. Only seen, awake, living
// creatures; nothing is changed.
function intents(g){
  const h=cloneGame(g), out=[];
  for(const c of h.creatures){ if(!c.alive||!c.seen||!c.awake) continue; const from=c.pos, route=[from]; const n=stepsThisTurn(c);
    for(let i=0;i<n;i++){ moveOnce(h,c); if(c.pos!==route[route.length-1]) route.push(c.pos); }
    out.push({id:c.id,from,to:c.pos,route}); }
  return out;
}
// Back-compat single-creature step (tools use it to preview where a creature goes next).
function stepCreature(g,c){ const n=stepsThisTurn(c); let moved=false; for(let i=0;i<n;i++){ const b=c.pos; moveOnce(g,c); if(c.pos!==b) moved=true; } return moved; }
// Drawn on the board? (the UI adds its own designer/editor overrides)
function isVisible(g,c){ return c.alive&&g.TER[c.pos]!=='cave'&&g.revealed.has(c.pos); }
// Keys a creature will pass through: the path for path movers, the next 24 bounces for dir movers.
function lane(g,c){
  if(c.mover==='path') return c.run.slice();
  if(c.mover==='dir'){ const ghost={mover:'dir',pos:c.pos,dir:c.dir}, out=[]; for(let s=0;s<24;s++){ moveOnce(g,ghost); out.push(ghost.pos); } return out; }
  return [];
}
function reveal(g,code,ring=1){ const before=g.revealed.size; g.revealed.add(code); for(const n of NEI[code]){ g.revealed.add(n); if(ring>1) for(const m of NEI[n]) g.revealed.add(m); } return g.revealed.size-before; }

/* ================= the turn ================= */
function start(g){ if(g.phase==='ready') g.phase='play'; return g; }
function kill(g,why,cause){ g.phase='dead'; return (g.last={type:'dead',why,cause:cause||'letgo',kind:cause||'letgo',by:null,key:null}); }
// Why a tentacle cannot be lifted right now: null (it can), 'empty', 'none' (this level never
// lets go), 'one' (one at a time: place the lifted tentacle first).
function liftBlock(g,code){
  if(!g.fingers.has(code)) return 'empty';
  if(g.LIFT==='none') return 'none';
  if(g.LIFT==='one'&&g.liftPending) return 'one';
  return null;
}
function pickup(g,code){ if(liftBlock(g,code)) return false; g.fingers.delete(code); g.liftPending=true; g.lifted=code; return true; }
// Why a key cannot take a tentacle right now: null, or 'held' | 'fog' | 'algae' | 'rock' | 'reach' | 'max'.
function placeBlock(g,code){
  if(g.fingers.has(code)) return 'held';
  if(g.phase==='ready'||g.turn===0) return g.START.includes(code)?null:'start'; // the first tentacle goes on a start key
  if(!g.revealed.has(code)) return 'fog';
  const t=g.TER[code]; if(t==='algae'||t==='rock') return t;
  if(g.MODE==='territory'&&code!==g.lifted&&!NEI[code].some(n=>g.fingers.has(n))) return 'reach'; // only next to a tentacle (or back where you lifted)
  if(g.MAX&&g.fingers.size>=g.MAX) return 'max';
  return null;
}

// One placement. Returns an event the UI turns into cues and sounds:
//  {type:'noop'} | {type:'refused',reason} | {type:'dead',kind,why,by,key,from,...}
//  | {type:'placed'|'won', stepped, meals, ate, woke, newly, reqLeft}
// death kinds: 'going' (you pressed where it was going), 'there' (it was on that key and did not
// move), 'hiding' (same, but you could not see it), 'caught' (a chaser reached a tentacle),
// 'swung' (it moved onto a tentacle already down).
function place(g,code){
  if(g.phase==='dead'||g.phase==='won') return {type:'noop',code};
  const why0=placeBlock(g,code);
  if(why0==='held') return {type:'noop',code};
  if(why0) return {type:'refused',reason:why0,code};
  g.phase='play'; g.turn++;
  for(const c of g.creatures){ c.prev=c.pos; c.vis0=isVisible(g,c); }
  // 1. everything already seen and awake takes its steps (reacting to the board before the new tentacle lands);
  //    creatures that meet may eat each other
  const {stepped,meals}=stepAll(g);
  g.fingers.add(code); g.liftPending=false; g.lifted=null;
  // 2. reveal around the new tentacle
  reveal(g,code,1);
  // 3. discover creatures on revealed water (cave dwellers stay hidden inside caves)
  const newly=[]; for(const c of g.creatures) if(c.alive&&!c.seen&&g.revealed.has(c.pos)&&g.TER[c.pos]!=='cave'){c.seen=true;newly.push(c);}
  // 3b. sleepers wake when a tentacle touches their key or a neighbour
  const woke=[]; for(const c of g.creatures) if(c.alive&&!c.awake&&(g.fingers.has(c.pos)||NEI[c.pos].some(n=>g.fingers.has(n)))){c.awake=true;c.seen=true;woke.push(c);}
  if(g.MODE==='territory') return territoryEnd(g,code,{stepped,meals,woke,newly});
  // 4. collisions with tentacles
  const ate=[];
  for(const c of g.creatures){
    if(!c.alive||!g.fingers.has(c.pos)) continue;
    if(c.prey){ c.alive=false; ate.push(c); reveal(g,c.pos,2); continue; }
    if(hidden(g,c,c.pos)) continue;
    const where=L(c.pos), name=c.label.toLowerCase(), moved=stepped.includes(c);
    let kind,why;
    if(c.pos===code&&moved){ kind='going'; why=`You put a tentacle right where the ${name} was going.`; }
    else if(c.pos===code&&c.vis0){ kind='there'; why=c.speed>0?`The ${name} was still on ${where}.`:`The ${name} was on ${where}.`; }
    else if(c.pos===code){ kind='hiding'; why=`A ${name} was hiding under ${where}.`; }
    else if(c.mover==='chase'){ kind='caught'; why=`The ${name} caught the tentacle on ${where}.`; }
    else { kind='swung'; why=`The ${name} swung back through ${where}.`; }
    g.phase='dead';
    const r=c.route||[c.prev], from=r.length>1?r[r.length-2]:c.prev;
    return (g.last={type:'dead',kind,why,cause:'eaten',by:c,key:c.pos,from,code,stepped,meals,ate,woke,newly});
  }
  if(ate.length) for(const c of g.creatures) if(c.alive&&!c.seen&&g.revealed.has(c.pos)&&g.TER[c.pos]!=='cave'){c.seen=true;newly.push(c);}
  const reqLeft=g.REQ.filter(k=>!g.fingers.has(k)).length;
  const ev={type:'placed',code,stepped,meals,ate,woke,newly,reqLeft};
  if(g.fingers.size>=g.GOAL&&reqLeft===0){ g.phase='won'; ev.type='won'; }
  return (g.last=ev);
}

// Territory: the end of a press. A creature on a tentacle takes the key (prey is eaten as always);
// a held starfish opens the algae around it; no tentacles left = the tank is lost; every key filled = clear.
// Event: {type:'placed'|'won'|'dead', taken:[{key,by,from,landed}], ate, grew, left, ...}
function territoryEnd(g,code,ev){
  const taken=[], ate=[];
  for(const c of g.creatures){
    if(!c.alive||!g.fingers.has(c.pos)) continue;
    if(c.prey){ c.alive=false; ate.push(c); reveal(g,c.pos,2); continue; }
    if(hidden(g,c,c.pos)) continue;
    const r=c.route||[c.prev], from=r.length>1?r[r.length-2]:c.prev;
    g.fingers.delete(c.pos); taken.push({key:c.pos,by:c,from,landed:c.pos===code});
  }
  if(ate.length) for(const c of g.creatures) if(c.alive&&!c.seen&&g.revealed.has(c.pos)&&g.TER[c.pos]!=='cave'){c.seen=true;ev.newly.push(c);}
  const grew=[];
  for(const k of g.REQ) if(g.fingers.has(k)&&!g.grown.has(k)){
    g.grown.add(k); let copied=false;
    for(const n of NEI[k]) if(g.TER[n]==='algae'){ if(!copied){ g.TER=Object.assign({},g.TER); copied=true; } delete g.TER[n]; grew.push(n); g.revealed.add(n); }
  }
  g.GOAL=fillable(g);
  const left=unfilled(g);
  const out=Object.assign({type:'placed',code,taken,ate,grew,left,reqLeft:0},ev);
  if(!g.fingers.size){
    g.phase='dead'; const t=taken[taken.length-1]||{};
    return (g.last=Object.assign(out,{type:'dead',kind:'overrun',cause:'overrun',why:'Every tentacle was taken.',by:t.by||null,key:t.key||null,from:t.from||null}));
  }
  if(left===0){ g.phase='won'; out.type='won'; }
  return (g.last=out);
}

/* ================= par: the fewest presses (territory) ================= */
// A* over whole game states. A move is one press, alone or after a free lift ({pickup, place}; pickup
// equal to place is a wait). Heuristic: the keys still to fill, divided by 1 + the moving creatures (a press
// fills one key and each creature can cover at most one more), so it never overestimates and the first clear
// found is the shortest. Returns {solved, par, moves, nodes, exhausted}.
function solvePar(level,opts){
  const budget=(opts&&opts.budget)||200000, g0=createGame(level);
  if(g0.MODE!=='territory') return {solved:false,par:null,moves:null,nodes:0,exhausted:false,reason:'not a territory level'};
  const moves=g=>{ const out=[];
    if(g.phase==='ready'||g.turn===0){ for(const k of g.START) out.push({place:k}); return out; }
    for(const k of legalPlacements(g)) out.push({place:k});
    if(g.LIFT!=='none') for(const f of g.fingers){ const h=cloneGame(g); if(!pickup(h,f)) continue; for(const k of legalPlacements(h)) out.push({pickup:f,place:k}); }
    return out; };
  const heap=[], push=n=>{ heap.push(n); let i=heap.length-1; while(i){ const p=(i-1)>>1; if(less(heap[p],heap[i])) break; [heap[p],heap[i]]=[heap[i],heap[p]]; i=p; } };
  const less=(a,b)=>a.f<b.f||(a.f===b.f&&a.g.turn>b.g.turn);
  const pop=()=>{ const top=heap[0], last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ const l=2*i+1, r=l+1; let m=i; if(l<heap.length&&less(heap[l],heap[m])) m=l; if(r<heap.length&&less(heap[r],heap[m])) m=r; if(m===i) break; [heap[m],heap[i]]=[heap[i],heap[m]]; i=m; } } return top; };
  const movers=g=>g.creatures.filter(c=>c.alive&&!c.prey&&c.mover!=='still'&&c.speed>0).length;
  const est=g=>Math.ceil(unfilled(g)/(1+movers(g)));
  const best=new Map(); let nodes=0;
  push({g:g0,f:est(g0),parent:null,act:null}); best.set(stateKey(g0),0);
  while(heap.length){
    const n=pop();
    if(n.g.phase==='won'){ const path=[]; for(let x=n;x.parent;x=x.parent) path.unshift(x.act); return {solved:true,par:n.g.turn,moves:path,nodes,exhausted:false}; }
    if(++nodes>budget) return {solved:false,par:null,moves:null,nodes,exhausted:true};
    for(const a of moves(n.g)){
      const h=cloneGame(n.g); if(a.pickup&&!pickup(h,a.pickup)) continue;
      const ev=place(h,a.place); if(ev.type==='refused'||ev.type==='noop'||ev.type==='dead') continue;
      const k=stateKey(h); if(best.has(k)&&best.get(k)<=h.turn) continue; best.set(k,h.turn);
      push({g:h,f:h.turn+(h.phase==='won'?0:est(h)),parent:n,act:a});
    }
  }
  return {solved:false,par:null,moves:null,nodes,exhausted:false};
}

/* ================= moving a tank sideways ================= */
// Grip keys reachable from the start keys through grip keys (ignoring creatures): the tank's water.
function tankWater(level){
  const g=createGame(level), seen=new Set(), q=[...g.START];
  while(q.length){ const k=q.pop(); if(seen.has(k)||!grip(g,k)) continue; seen.add(k); for(const n of NEI[k]) if(!seen.has(n)) q.push(n); }
  return seen;
}
// The unit keys of rows 1-4 form a regular lattice: give each a column u so that the key at
// (row r, u) touches (r, u±1), (r-1, u), (r-1, u+1), (r+1, u-1) and (r+1, u). The number row sits half a
// key further left than the letters, hence its -1. Moving a pattern by (drow, du) keeps every
// neighbour relation, so a tank moved this way is the same puzzle.
const LAT={}, LATKEY={};
for(const r of [1,2,3,4]){ KEYS.filter(k=>k.row===r&&k.w===1).sort((a,b)=>a.x-b.x).forEach((k,i)=>{ const u=i-(r===1?1:0); LAT[k.code]=[r,u]; LATKEY[r+':'+u]=k.code; }); }
function shiftKey(code,du,dr=0){ const p=LAT[code]; if(!p) return null; return LATKEY[(p[0]+dr)+':'+(p[1]+du)]||null; }
// [du, dr] that moves key `from` onto key `to`, or null when either is not a lattice key.
function latticeOffset(from,to){ const a=LAT[from], b=LAT[to]; return a&&b?[b[1]-a[1],b[0]-a[0]]:null; }
// Same-row distance in keys, or null (kept for callers that only move sideways).
function rowOffset(from,to){ const o=latticeOffset(from,to); return o&&o[1]===0?o[0]:null; }
// A copy of the level moved by (du, dr), as a closed tank (everything outside it is algae), or null
// when a key of the tank, a creature or a mark has nowhere to go, or when a bouncing creature would
// not trace the same lane (a keyboard edge it bounced off is not there any more, or a new one is).
function shiftLevel(level,du,dr=0){
  if(!du&&!dr) return clone(level);
  const water=tankWater(level), ter=level.terrain||{};
  const inside=new Set([...water,...(level.start||[]),...(level.required||[])]);
  for(const [k,t] of Object.entries(ter)) if(t!=='algae') inside.add(k);
  const m=k=>shiftKey(k,du,dr), out=clone(level);
  const tank=[...inside].map(m); if(tank.some(k=>!k)) return null;
  out.tank=tank; out.terrain={};
  for(const k of inside){ if(ter[k]&&ter[k]!=='algae') out.terrain[m(k)]=ter[k]; }
  out.start=(level.start||[]).map(m); out.required=(level.required||[]).map(m);
  if(out.coach&&typeof out.coach==='object'){ // key tokens in coach lines move with the tank: {L} becomes the key L lands on
    const byLabel={}; for(const k of KEYS) if(k.label&&!byLabel[k.label]) byLabel[k.label]=k.code; byLabel.Space='Space';
    const own=new Set([...inside,...(level.start||[]),...(level.required||[])]);
    for(const c of level.creatures||[]){ if(c.at) own.add(c.at); for(const p of c.path||[]) own.add(p); }
    for(const moment of Object.keys(out.coach)) out.coach[moment]=String(out.coach[moment]).replace(/\{([^{}]+)\}/g,(tok,t0)=>{
      const pre=t0[0]==='~'&&t0.length>1?'~':'', t=pre?t0.slice(1):t0; // {~L}: a key named but not pulsing
      const c=KEYMAP[t]?t:(byLabel[t]||byLabel[t.toUpperCase()]); if(!c||!own.has(c)) return tok;
      const n=m(c); if(!n) return tok; const nl=KEYMAP[n].label; return '{'+pre+(nl&&byLabel[nl]===n?nl:n)+'}'; });
  }
  for(const c of out.creatures||[]){
    if(c.at){ const a=m(c.at); if(!a) return null; c.at=a; }
    if(c.path&&c.path.length){ const p=c.path.map(m); if(p.some(k=>!k)) return null; c.path=p; }
  }
  const g0=createGame(level), g1=createGame(out);
  for(let i=0;i<g0.creatures.length;i++){ const a=g0.creatures[i], b=g1.creatures[i]; if(!b) return null;
    if(a.mover==='dir'&&lane(g0,a).some((k,j)=>m(k)!==lane(g1,b)[j])) return null; }
  return out;
}

/* ================= levels.js source ================= */
// The whole levels.js file for a set of zones and levels; the editor's export and tools/campaign.mjs both use it.
function levelsSource(zones,levels){
  const j=x=>JSON.stringify(x);
  const NL=String.fromCharCode(10);
  const lvl=l=>{ const o=Object.assign({},l); const ter=o.terrain||{}, cr=o.creatures||[]; delete o.terrain; delete o.creatures;
    const head=j(o).slice(0,-1);
    return ' '+head+(head.length>1?',':'')+NL+'  "terrain":'+j(ter)+','+NL+'  "creatures":['+cr.map(j).join(','+NL+'    ')+']}'; };
  return [
    '// G. levels: the zones and the campaign, in play order. This file is the source of truth.',
    '// Edit here, or in the in-game editor and use "Copy levels.js" / "Download levels.js" to replace this file.',
    '// tools/campaign.mjs rebuilds it from specs and recipes. Key codes are physical (KeyboardEvent.code); see README.md.',
    'window.GDOT_ZONES=[',
    (zones||[]).map(z=>' '+j(z)).join(','+NL),
    '];',
    'window.GDOT_LEVELS=[',
    (levels||[]).map(lvl).join(','+NL),
    '];',
    ''].join(NL);
}

/* ================= helpers for tools and tests ================= */
// Keys a placement may land on right now (ready: the start keys; play: revealed water with grip, under the cap).
function legalPlacements(g){
  if(g.phase==='ready'||(g.phase==='play'&&g.turn===0)) return g.START.filter(k=>grip(g,k));
  if(g.phase!=='play') return [];
  if(g.MAX&&g.fingers.size>=g.MAX) return [];
  return KEYS.map(k=>k.code).filter(k=>!g.fingers.has(k)&&grip(g,k)&&g.revealed.has(k)&&(g.MODE!=='territory'||k===g.lifted||NEI[k].some(n=>g.fingers.has(n))));
}
function bits(set){ let a=0,b=0,c=0; for(const k of set){ const i=IDX[k]; if(i<30) a|=1<<i; else if(i<60) b|=1<<(i-30); else c|=1<<(i-60); } return a.toString(36)+'.'+b.toString(36)+'.'+c.toString(36); }
// Canonical key of the whole game state (fingers, fog, every creature) for search memo tables.
function stateKey(g){
  return g.phase[0]+(g.liftPending?'L'+(g.lifted?IDX[g.lifted]:''):'')+bits(g.fingers)+'|'+bits(g.revealed)+(g.grown&&g.grown.size?'|g'+bits(g.grown):'')+'|'+g.creatures.map(c=>!c.alive?'x':
    IDX[c.pos]+(c.mover==='path'?':'+c.i:c.mover==='dir'?':'+c.dir:'')+(c.acc?'a'+c.acc:'')+(c.seen?'s':'')+(c.awake?'w':'')).join(',');
}

return {ROWY,KEYS,KEYMAP,IDX,NEI,DIRS,OPP,L,adjacent,PRESETS,TYPES,TARGETS,MOVERS,HEADINGS,TERRAINS,LIFTS,clone,slug,expandPath,normalizeLevel,resolveLevel,ecologyOf,
  levelsSource,tankWater,shiftKey,shiftLevel,rowOffset,latticeOffset,createGame,cloneGame,isRock,passable,grip,distMap,targetKeys,moveOnce,stepAll,stepCreature,hidden,canEat,isVisible,lane,reveal,
  intents,territory,unfilled,fillable,creatureKeys,territoryEnd,solvePar,start,kill,liftBlock,pickup,placeBlock,place,legalPlacements,stateKey};
});
