// Shared keyboard model + renderer for the prototypes (window.KB). Same ANSI TKL geometry as engine.js.
(function(){
'use strict';
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
  const same=n.filter(b=>b.row===a.row);
  DIRS[a.code]={E:(same.find(b=>b.x>a.x)||{}).code||null, W:(same.find(b=>b.x<a.x)||{}).code||null};
}
const L=c=>KEYMAP[c]?KEYMAP[c].label||'Space':c;
// label -> code, for writing tanks by key label ("Q W E ...")
const BY_LABEL={}; for(const k of KEYS) if(k.label&&!BY_LABEL[k.label]) BY_LABEL[k.label]=k.code; BY_LABEL.Space='Space';
const codes=s=>s.trim().split(/\s+/).map(l=>{ const c=BY_LABEL[l]; if(!c) throw new Error('no key '+l); return c; });
// graph distance inside a set of keys (BFS); Map code -> steps
function dist(from,within){ const d=new Map([[from,0]]); const q=[from]; while(q.length){ const c=q.shift(); for(const n of NEI[c]) if(within.has(n)&&!d.has(n)){ d.set(n,d.get(c)+1); q.push(n); } } return d; }
// pixel sprites: '.' clear, '#' currentColor, 'o' white
const px=rows=>{ const w=rows[0].length,h=rows.length; let r=''; rows.forEach((row,y)=>{ for(let x=0;x<w;){ const ch=row[x]; if(ch==='.'){x++;continue;} let n=1; while(x+n<w&&row[x+n]===ch) n++; r+=`<rect x="${x}" y="${y}" width="${n}" height="1"${ch==='o'?' fill="#fff" fill-opacity=".8"':' fill="currentColor"'}/>`; x+=n; } }); return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`; };
const SPR={
  crab:px(['.##..........##.','.###........###.','..##........##..','...##.o..o.##...','....########....','..############..','.##############.','..############..','..#.#.#..#.#.#..','.#..#..#.#..#..#']),
  shark:px(['................','.......##.......','.......###......','.#.....####.....','.##.##########..','..#############.','.##.##########o#','.#...#####......','......##........','................']),
  eel:px(['................','................','..###......###..','.#####....#####.','##...##..##...##','#.....####.....#','...............o','................','................','................']),
  jelly:px(['.....######.....','...##########...','..############..','..############..','...#.##.##.#....','...#.#..#..#....','..#..#..#...#...','..#.#...#...#...','.#..#..#.....#..','................']),
  star:px(['.......#........','......###.......','......###.......','.#############..','..###########...','...#########....','....#######.....','....###.###.....','...###...###....','..##.......##...']),
  arm:px(['................','......#####.....','....###...##....','...##......##...','..##........##..','..##.....#..##..','..##....###.##..','...##...####....','....#######.....','......####......']),
  fish:px(['................','................','......####......','..#..######.....','.###########o...','..#..######.....','......####......','................','................','................']),
  claw:px(['.##.','###.','.##.','.#..','##..','.#..']),
};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Build the whole keyboard inside el. Returns els (code -> div). opts.onKey(code), opts.onMark(code).
function board(el,opts){
  el.classList.add('board'); el.innerHTML=''; const els={};
  for(const k of KEYS){ const d=document.createElement('div'); d.className='k'+(k.w>1.3?' wide':''); d.dataset.code=k.code;
    d.style.left=`calc(var(--u)*${k.x})`; d.style.top=`calc(var(--u)*${ROWY[k.row]})`; d.style.width=`calc(var(--u)*${k.w})`;
    d.innerHTML=`<span class="lbl">${esc(k.label)}</span><span class="face"></span>`; el.appendChild(d); els[k.code]=d; }
  el.addEventListener('mousedown',e=>{ const d=e.target.closest('.k'); if(!d) return; e.preventDefault(); const c=d.dataset.code;
    if(e.button===2||e.shiftKey){ opts.onMark&&opts.onMark(c); } else if(e.button===0){ opts.onKey&&opts.onKey(c); } });
  el.addEventListener('contextmenu',e=>e.preventDefault());
  return els;
}
// Keyboard input: fn(code, shift) returns true when it handled the key (then the browser does not see it).
function keys(fn){ window.addEventListener('keydown',e=>{ if(e.repeat||e.ctrlKey||e.altKey||e.metaKey) return; if(/^Shift/.test(e.code)) return; if(fn(e.code,e.shiftKey)) e.preventDefault(); }); }
// Tiny seeded RNG so a tank can be replayed (mulberry32)
function rng(seed){ let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const pick=(r,arr)=>arr[Math.floor(r()*arr.length)];
window.KB={KEYS,KEYMAP,NEI,DIRS,ROWY,L,codes,dist,SPR,px,esc,board,keys,rng,pick};
})();
