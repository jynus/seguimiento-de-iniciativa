// ====== Config ======
const WS_URL = new URLSearchParams(location.search).get("ws") || "wss://jynus.com:8443";
const TOKEN  = new URLSearchParams(location.search).get("token") || "";
const COND_URL = "../common/conditions.json";

// ====== Condiciones ======
let CONDITIONS = [];
let condIndex = { get: () => null, norm: (s) => String(s || "").trim().toLowerCase() };

async function loadConditions() {
  try {
    const res = await fetch(COND_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    CONDITIONS = await res.json();
  } catch (_) {
    CONDITIONS = [];
  }
  const map = {};
  const norm = (s) => String(s || "").trim().toLowerCase();
  for (const c of CONDITIONS) {
    [c.key, c.english, c.spanish, ...(c.synonyms || [])].forEach(k => k && (map[norm(k)] = c));
  }
  condIndex = { get: (n) => map[norm(n)] || null, norm };
}

function contrastText(hex) {
  try {
    const h = String(hex).replace('#','');
    const v = h.length === 3 ? h.split('').map(x=>x+x).join('') : h;
    const int = parseInt(v, 16);
    const r = (int>>16)&255, g = (int>>8)&255, b = int&255;
    return ((r*299 + g*587 + b*114)/1000) >= 160 ? "#0b1220" : "#fff";
  } catch { return "#fff"; }
}
function paintChip(el, hex){
  el.style.background  = `color-mix(in oklab, ${hex} 22%, transparent)`;
  el.style.borderColor = `color-mix(in oklab, ${hex} 55%, transparent)`;
  el.style.color       = contrastText(hex);
}
function svgAvatar(initials,bg="#60a5fa",fg="#0f1115"){
  const t=(initials||"??").toUpperCase().slice(0,2);
  const svg = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>
      <rect width='100%' height='100%' rx='128' ry='128' fill='${bg}'/>
      <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle'
        font-family='Segoe UI, Roboto, Arial' font-weight='700' font-size='110' fill='${fg}'>${t}</text>
    </svg>`
  );
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

// ====== Estado ======
let state = {
  activeIdx: 0,
  party: [
    { id:"1", nombre:"Elkyz Myrthar", ca:19, pv:{cur:38,max:45}, mov:{cur:9,max:9}, accion:false, adicional:false, reaccion:false, icon:"../common/elkyz.webp", condiciones:["concentrado"] },
    { id:"2", nombre:"Ragdahr Kindhammer",    ca:17, pv:{cur:26,max:33}, mov:{cur:6,max:6}, accion:false, adicional:false, reaccion:false, icon:"../common/ragdahr.webp", condiciones:["envenenado"] },
    { id:"3", nombre:"Rairish Drechash",    ca:15, pv:{cur:22,max:28}, mov:{cur:9,max:9}, accion:false, adicional:false, reaccion:false, icon:"../common/rairsish.webp", condiciones:["miedo","prone"] },
    { id:"4", nombre:"Grerin Beibalar",    ca:16, pv:{cur:18,max:24}, mov:{cur:7,max:7}, accion:false, adicional:false, reaccion:false, icon:"../common/grerin.webp", condiciones:["escondido"] }
  ]
};

// ====== Render ======
const rows = document.getElementById("rows");
const $ = (sel, ctx=document) => ctx.querySelector(sel);
function td(text=""){ const c=document.createElement("td"); if(text!==""&&text!==null) c.textContent=text; return c; }
function btn(t){ const b=document.createElement("button"); b.className="btn"; b.type="button"; b.textContent=t; return b; }

function chips(list, pv, onToggle){
  const out = Array.isArray(list) ? [...list] : [];
  if (pv && typeof pv.cur==="number" && typeof pv.max==="number" && pv.max>0){
    const below = pv.cur < pv.max/2;
    const has = out.some(x => condIndex.norm(x)==="sangrando" || condIndex.norm(x)==="bleeding");
    if (below && !has) out.push("sangrando");
    if (!below && has) for(let i=out.length-1;i>=0;i--){const k=condIndex.norm(out[i]); if(k==="sangrando"||k==="bleeding") out.splice(i,1); }
  }
  const box=document.createElement("div"); box.className="chips";
  const seen=new Set();
  for(const raw of out){
    const key=condIndex.norm(raw); if(seen.has(key)) continue; seen.add(key);
    const def=condIndex.get(raw);
    const span=document.createElement("span"); span.className="chip";
    span.textContent = def?.spanish || String(raw);
    paintChip(span, def?.color || "#8b5cf6");
    if (onToggle && key!=="sangrando" && key!=="bleeding") {
      span.addEventListener("click",(e)=>{ e.stopPropagation(); onToggle(raw); });
      span.title = "Click para quitar";
    }
    box.appendChild(span);
  }
  return box;
}

function togglePill(p,field){
  const el=document.createElement("span");
  el.className="pill "+(p[field]?"on":"off");
  el.textContent=p[field]?"Usada":"Disponible";
  el.title=field;
  el.addEventListener("click",(e)=>{ e.stopPropagation(); p[field]=!p[field]; el.className="pill "+(p[field]?"on":"off"); el.textContent=p[field]?"Usada":"Disponible"; sync(); });
  return el;
}

function render(){
  rows.innerHTML="";
  state.party.forEach((p,idx)=>{
    const tr=document.createElement("tr"); if(idx===state.activeIdx) tr.classList.add("active");
    if(typeof p.pv!=="object") p.pv={cur:p.pv??0,max:p.pv??0};
    if(typeof p.mov==="number") p.mov={cur:p.mov,max:p.mov};
    if(!p.mov) p.mov={cur:0,max:0};

    const initials = p.nombre?.split(/\s+/).map(w=>w[0]).join("") || "??";
    const iconSrc = p.icon || svgAvatar(initials);

    const tdIcon=td(); tdIcon.innerHTML=`<span class="avatar"><img alt="" src="${iconSrc}" /></span>`;

    const tdNom=td(); { const ip=document.createElement("input"); ip.type="text"; ip.value=p.nombre||""; ip.style.width="140px";
      ip.addEventListener("change",()=>{ p.nombre=ip.value; sync(); render(); }); tdNom.appendChild(ip); }

    const tdCA=td(); { const ip=document.createElement("input"); ip.type="number"; ip.value=p.ca??0; ip.className="small";
      ip.addEventListener("change",()=>{ p.ca=Number(ip.value)||0; sync(); render(); }); tdCA.appendChild(ip); }

    const tdPV=td(); {
      const cur=document.createElement("input"); cur.type="number"; cur.value=p.pv.cur??0; cur.className="small";
      const max=document.createElement("input"); max.type="number"; max.value=p.pv.max??0; max.className="small"; max.style.marginLeft="6px";
      const upd=()=>{ p.pv.cur=Math.max(0, Number(cur.value)||0); p.pv.max=Math.max(0, Number(max.value)||0); if(p.pv.cur>p.pv.max) p.pv.cur=p.pv.max; sync(); render(); };
      cur.addEventListener("change",upd); max.addEventListener("change",upd);
      tdPV.append(cur, document.createTextNode(" / "), max);
    }

    const tdA=td(); tdA.appendChild(togglePill(p,"accion"));
    const tdB=td(); tdB.appendChild(togglePill(p,"adicional"));
    const tdR=td(); tdR.appendChild(togglePill(p,"reaccion"));

    const tdM=td(); {
      const cur=document.createElement("input"); cur.type="number"; cur.value=p.mov.cur??0; cur.className="small";
      const max=document.createElement("input"); max.type="number"; max.value=p.mov.max??0; max.className="small"; max.style.marginLeft="6px";
      const upd=()=>{ p.mov.cur=Math.max(0, Number(cur.value)||0); p.mov.max=Math.max(0, Number(max.value)||0); if(p.mov.cur>p.mov.max) p.mov.cur=p.mov.max; sync(); render(); };
      cur.addEventListener("change",upd); max.addEventListener("change",upd);
      const box=document.createElement("span"); box.className="mv";
      box.append(cur, document.createTextNode(" / "), max, document.createTextNode(" m"));
      tdM.appendChild(box);
    }

    const tdC=td(); tdC.appendChild(chips(p.condiciones||[], p.pv, (name)=>{
      const k=condIndex.norm(name);
      const arr=p.condiciones||(p.condiciones=[]);
      const i = arr.findIndex(x=>condIndex.norm(x)===k);
      if (i>=0) arr.splice(i,1); else arr.push(name);
      sync(); render();
    }));

    const tdTools=td(); tdTools.className="tools";
    const addInput=document.createElement("input"); addInput.type="text"; addInput.placeholder="condición…"; addInput.style.width="80px";
    const addBtn=btn("＋"); addBtn.classList.add("small");
    addBtn.addEventListener("click",(e)=>{ e.stopPropagation(); const v=addInput.value.trim(); if(!v) return;
      (p.condiciones||(p.condiciones=[])).push(v); addInput.value=""; sync(); render(); });
    const delBtn=btn("🗑"); delBtn.classList.add("danger"); delBtn.title="Eliminar personaje";
    delBtn.addEventListener("click",(e)=>{ e.stopPropagation(); state.party.splice(idx,1);
      if(state.activeIdx>=state.party.length) state.activeIdx=Math.max(0,state.party.length-1); sync(); render(); });

    tdTools.append(addInput, addBtn, document.createTextNode(" "), delBtn);

    tr.addEventListener("click",(e)=>{ if(e.target.closest("input,button,.chip")) return; setActiveIdx(idx); });

    tr.append(tdIcon,tdNom,tdCA,tdPV,tdA,tdB,tdR,tdM,tdC,tdTools);
    rows.appendChild(tr);
  });
}

// ====== Turnos ======
function resetForTurn(p){
  p.accion=false; p.adicional=false; p.reaccion=false;
  if(typeof p.mov==="number") p.mov={cur:p.mov,max:p.mov};
  if(!p.mov) p.mov={cur:0,max:0};
  if(typeof p.mov.max!=="number") p.mov.max=p.mov.cur??0;
  p.mov.cur=p.mov.max;
}
function setActiveIdx(idx){ state.activeIdx=idx; if(state.party[idx]) resetForTurn(state.party[idx]); sync(); render(); }

// ====== WS Sync ======
let ws, retry=0, sendTimer=null;

function broadcastState(){
  const msg = { type:"state", state };
  try{ ws && ws.readyState===1 && ws.send(JSON.stringify(msg)); }catch{}
}
function scheduleSend(){ clearTimeout(sendTimer); sendTimer = setTimeout(broadcastState, 120); }
function sync(){ try{ localStorage.setItem("mini_turnos_state", JSON.stringify(state)); }catch{} scheduleSend(); }

function connect(){
  ws = new WebSocket(WS_URL);
  ws.addEventListener("open", ()=>{
    retry=0;
    ws.send(JSON.stringify({type:"hello", role:"admin", token: TOKEN || undefined}));
    broadcastState(); // envía el estado actual
  });
  ws.addEventListener("message", (ev)=>{
    try{
      const msg=JSON.parse(ev.data);
      if (msg.type==="state" && msg.state){ // por si hay varios admins
        state = msg.state; render();
      }
    }catch{}
  });
  ws.addEventListener("close", ()=>{ setTimeout(connect, Math.min(1000*(++retry), 5000)); });
  ws.addEventListener("error", ()=>{ try{ws.close();}catch{} });
}

// ====== Init ======
document.getElementById("nextBtn").addEventListener("click",(e)=>{ e.stopPropagation(); const next=(state.activeIdx+1)%state.party.length; setActiveIdx(next); });
document.getElementById("resetBtn").addEventListener("click",(e)=>{ e.stopPropagation(); state.party.forEach(p=>resetForTurn(p)); sync(); render(); });
document.getElementById("broadcastBtn").addEventListener("click",(e)=>{ e.stopPropagation(); broadcastState(); });
document.getElementById("addBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  const id=String(Date.now());
  state.party.push({ id, nombre:"Nuevo", ca:10, pv:{cur:10,max:10}, mov:{cur:9,max:9}, accion:false, adicional:false, reaccion:false, icon:null, condiciones:[] });
  sync(); render();
});

(async function init(){
  try{ const saved=localStorage.getItem("mini_turnos_state"); if(saved){ state=JSON.parse(saved); } }catch{}
  await loadConditions();
  connect();
  render();
})();
