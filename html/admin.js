// ====== Config ======
let awaitingServerState = false;
let seedTimer = null;
const SEED_TIMEOUT_MS = 1200;
const WS_URL = new URLSearchParams(location.search).get("ws") || "ws://localhost:8443";
const TOKEN  = new URLSearchParams(location.search).get("token") || "";
const COND_URL = "conditions.json";
const PERSONAJES_URL = "personajes.json";

let CONDITIONS = [];
let condIndex = { get: () => null, norm: (s) => String(s || "").trim().toLowerCase() };

let PERSONAJES = [];
let personajesIndex = { get: () => null, norm: (s) => String(s || "").trim().toLowerCase() };


function isVisible(p){ return p && p.visible !== false; }

function nextVisibleIndex(start){
  const n = state.party.length; if (!n) return -1;
  for (let k=1; k<=n; k++){
    const j = (start + k) % n;
    if (isVisible(state.party[j])) return j;
  }
  return -1;
}

function prevVisibleIndex(start){
  const n = state.party.length; if (!n) return -1;
  for (let k=1; k<=n; k++){
    const j = (start - k + n) % n;
    if (isVisible(state.party[j])) return j;
  }
  return -1;
}

function setActiveIdx(idx, opts = { reset: true }){
  const { reset = true } = opts;
  state.activeIdx = idx;
  if (state.party[idx] && reset) resetForTurn(state.party[idx]);
  sync(); render();
}

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

async function loadPersonajes() {
  try {
    const res = await fetch(PERSONAJES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    PERSONAJES = await res.json();
  } catch (_) {
    PERSONAJES = [];
  }
  const map = {};
  const norm = (s) => String(s || "").trim().toLowerCase();
  for (const c of PERSONAJES) {
    if (c.nombre) map[norm(c.nombre)] = c;
  }
  personajesIndex = { get: (n) => map[norm(n)] || null, norm };
}

function buildCharDatalist() {
  const names = PERSONAJES.map(p => p.nombre).filter(Boolean)
    .sort((a,b)=> a.localeCompare(b, "es", {sensitivity:"base"}));

  let dl = document.getElementById("char-suggestions");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "char-suggestions";
    document.body.appendChild(dl);
  }
  dl.innerHTML = "";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    dl.appendChild(o);
  }
}


// --- Sugerencias de condiciones (autocompletado) ---
function buildCondDatalist() {
  // Unificamos español, inglés y sinónimos del conditions.json
  const set = new Set();
  for (const c of CONDITIONS) {
    if (c.spanish) set.add(c.spanish);
    if (c.english) set.add(c.english);
    (c.synonyms || []).forEach(s => set.add(s));
  }
  const opts = Array.from(set).sort((a,b)=> a.localeCompare(b, "es", {sensitivity:"base"}));

  // Crea (o reutiliza) el datalist global
  let dl = document.getElementById("cond-suggestions");
  if (!dl) {
    dl = document.createElement("datalist");
    dl.id = "cond-suggestions";
    document.body.appendChild(dl);
  }
  dl.innerHTML = "";
  for (const v of opts) {
    const o = document.createElement("option");
    o.value = v;
    dl.appendChild(o);
  }
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

function makeNum(initialValue, onConfirm, classNames = "small no-spin") {
  let committed = Number.isFinite(initialValue) ? initialValue : 0;

  const ip = document.createElement("input");
  ip.type = "number";
  ip.value = committed;
  ip.inputMode = "numeric";
  ip.className = classNames;

  const tryCommit = () => {
    const v = toNumberLocale(ip.value);
    if (Number.isFinite(v)) {
      committed = v;
      onConfirm(v);      // el caller hace clamp/redibujado/sync
    } else {
      // inválido → no confirmamos y restauramos visualmente
      ip.value = committed;
    }
  };

  // Seleccionar todo al enfocar
  ip.addEventListener("focus", () => ip.select());

  // Confirmar con Enter, Tab; cancelar con Esc
  ip.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();   // confirmamos y nos quedamos en el campo
      tryCommit();
    } else if (e.key === "Tab") {
      // no evitamos el tabulado: confirmamos y dejamos que avance el foco
      tryCommit();
      // NO e.preventDefault()
    } else if (e.key === "Escape") {
      e.preventDefault();
      ip.value = committed; // cancelar → restaurar último valor confirmado
      ip.blur();
    }
  });

  // Salir del campo (click fuera / shift+tab / etc.) también confirma
  ip.addEventListener("blur", tryCommit);

  return ip;
}

function makeText(initialValue, onConfirm, classNames = "", { listId, autoCommitOnDatalist = true } = {}) {
  let committed = String(initialValue ?? "");
  let lastAutoCommitted = null;

  const ip = document.createElement("input");
  ip.type = "text";
  ip.value = committed;
  ip.className = classNames;
  if (listId) ip.setAttribute("list", listId);

  const tryCommit = () => {
    const v = String(ip.value ?? "");
    committed = v;
    onConfirm(v);
  };

  // Seleccionar todo al enfocar
  ip.addEventListener("focus", () => ip.select());

  // Enter/Tab confirman, Esc cancela, blur confirma
  ip.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); tryCommit(); }
    else if (e.key === "Tab") { tryCommit(); }
    else if (e.key === "Escape") { e.preventDefault(); ip.value = committed; ip.blur(); }
  });
  ip.addEventListener("blur", tryCommit);

  // AUTOCOMMIT: si el valor coincide exactamente con una opción del datalist
  if (listId && autoCommitOnDatalist) {
    // 1) Cuando cambia el valor (tecleo o selección de sugerencia)
    ip.addEventListener("input", (ev) => {
      const val = String(ip.value ?? "");
      if (hasExactDatalistOption(listId, val)) {
        if (lastAutoCommitted !== val) {
          lastAutoCommitted = val;
          tryCommit();                 // aplica sin pulsar Enter
        }
      } else {
        lastAutoCommitted = null;
      }
    });
    // 2) Algunos navegadores solo confirman selección como "change"
    ip.addEventListener("change", () => {
      const val = String(ip.value ?? "");
      if (hasExactDatalistOption(listId, val)) {
        if (lastAutoCommitted !== val) {
          lastAutoCommitted = val;
          tryCommit();
        }
      }
    });
  }

  return ip;
}

// admite "7,5" o "7.5"
function toNumberLocale(s) {
  if (typeof s !== "string") s = String(s ?? "");
  s = s.replace(",", ".").trim();
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}
function roundToHalf(n) {
  return Math.round(n * 2) / 2;
}

function sortPartyByIni() {
  const curId = state.party[state.activeIdx]?.id;
  state.party.sort((a, b) => {
    const ai = Number.isFinite(a?.ini) ? a.ini : -Infinity;
    const bi = Number.isFinite(b?.ini) ? b.ini : -Infinity;
    if (bi !== ai) return bi - ai;
    // desempate estable por nombre
    return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {sensitivity:"base"});
  });
  if (curId) {
    const i = state.party.findIndex(x => x.id === curId);
    state.activeIdx = i >= 0 ? i : 0;
  }
}

function hasExactDatalistOption(listId, value) {
  const dl = document.getElementById(listId);
  if (!dl) return false;
  const v = String(value ?? "");
  for (const opt of dl.querySelectorAll("option")) {
    if (opt.value === v) return true;
  }
  return false;
}

// ====== Estado ======
let state = {
  activeIdx: 0,
  party: [
  { id:"1", "nombre": "Grerin Beibalar", "icon": "grerin.webp", "ca": 16, "pv": {"cur":33, "max":33, "tmp":0}, "mov": {"cur":9,"max":9}, accion:false, adicional:false, reaccion:false, condiciones:[]},
  { id:"2", "nombre": "Elkyz Myrthar", "icon": "elkyz.webp", "ca": 12, "pv": {"cur":34,"max":34, "tmp":0}, "mov": {"cur":9,"max":9}, "accion":false, "adicional":false, "reaccion":false, condiciones:[]},
  { id:"3", "nombre": "Ragdahr Kindhammer", "icon": "ragdahr.webp", "ca": 16, "pv": {"cur":48, "max":48,"tmp":0}, "mov": {"cur":9,"max":9}, accion:false, adicional:false, reaccion:false, condiciones:[]},
  { id:"4", "nombre": "Rairish Drechash", "icono": "rairish.webp", "ca": 18, "pv": {"cur": 49, "max":49, "tmp":0}, "mov": {"cur":9,"max":9}, accion:false, adicional:false, reaccion:false, condiciones:[]}
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
    const tr=document.createElement("tr");
    if(idx===state.activeIdx) tr.classList.add("active");
    if (p.visible === false) tr.classList.add("hidden-for-clients");
    if(typeof p.pv!=="object") p.pv={cur:p.pv??0,max:p.pv??0};
    if(typeof p.mov==="number") p.mov={cur:p.mov,max:p.mov};
    if(!p.mov) p.mov={cur:0,max:0};

    const initials = p.nombre?.split(/\s+/).map(w=>w[0]).join("") || "??";
    const iconSrc = p.icon || svgAvatar(initials);

    const tdIni = td();
    {
      const ip = makeNum(p.ini ?? 0, (v) => {
        p.ini = Math.round(v);           // entero
        sortPartyByIni();                // reordenar
        sync(); render();
      }, "small no-spin");
      ip.step = "1";
      ip.inputMode = "numeric";
      tdIni.appendChild(ip);
    }

    const tdIcon=td(); tdIcon.innerHTML=`<span class="avatar"><img alt="" src="${iconSrc}" /></span>`;

    const tdNom=td();
    {
      const ip = makeText(p.nombre || "", (v) => {
        p.nombre = v;
        // Si coincide con un personaje conocido, aplicar plantilla
        const tpl = personajesIndex.get(v);
        if (tpl) {
          applyCharacterTemplate(p, tpl);
        }
        sync(); render();
      }, "tools", { listId: "char-suggestions" });
      ip.style.width = "160px";
      tdNom.appendChild(ip);
    }

    const tdCA = td(); {
      const ip = makeNum(p.ca ?? 0, (v) => {
        p.ca = Math.max(0, Math.round(v));
        sync(); render();
      });
      tdCA.appendChild(ip);
      }

    const tdPV = td(); {
      const cur = makeNum(p.pv.cur ?? 0, (v) => {
        p.pv.cur = Math.max(0, Math.round(v));
        if (typeof p.pv.max !== "number") p.pv.max = 0;
        if (p.pv.cur > p.pv.max) p.pv.cur = p.pv.max;
        sync(); render();
      });
      const max = makeNum(p.pv.max ?? 0, (v) => {
        p.pv.max = Math.max(0, Math.round(v));
        if (p.pv.cur > p.pv.max) p.pv.cur = p.pv.max;
        sync(); render();
      });
      max.style.marginLeft = "6px";
      tdPV.append(cur, document.createTextNode(" / "), max);
    }

    const tdA=td(); tdA.appendChild(togglePill(p,"accion"));
    const tdB=td(); tdB.appendChild(togglePill(p,"adicional"));
    const tdR=td(); tdR.appendChild(togglePill(p,"reaccion"));

    const tdM = td(); {
      const cur = makeNum(p.mov.cur ?? 0, (v) => {
        p.mov.cur = Math.max(0, roundToHalf(v));
        if (typeof p.mov.max !== "number") p.mov.max = 0;
        p.mov.cur = Math.min(val, p.mov.max);
        sync(); render();
      });
      const max = makeNum(p.mov.max ?? 0, (v) => {
        p.mov.max = Math.max(0, Math.roundToHalf(v));
        if (p.mov.cur > p.mov.max) p.mov.cur = p.mov.max;
        sync(); render();
      });
      cur.step = "0.5";
      max.step = "0.5";
      max.style.marginLeft = "6px";
      const box = document.createElement("span"); box.className = "mv";
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

    // 👁 / 🙈 toggle de visibilidad
    const eyeBtn = btn((p.visible === false) ? "🙈" : "👁");
    eyeBtn.classList.add("emoji");
    const setEyeUI = () => {
      eyeBtn.textContent = (p.visible === false) ? "🙈" : "👁";
      eyeBtn.title = (p.visible === false) ? "Oculta para clientes" : "Visible para clientes";
    };
    setEyeUI();
    eyeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      p.visible = !(p.visible !== false); // toggle (default visible)
      setEyeUI();
      sync(); render();
    });

    const addInput=document.createElement("input");
    addInput.type="text";
    addInput.placeholder="condición…";
    addInput.style.width="80px";
    addInput.setAttribute("list", "cond-suggestions");

    const addBtn=btn("＋");
    addBtn.classList.add("small");

    // Misma lógica para click y Enter
    const addCond = () => {
      const v = addInput.value.trim();
      if (!v) return;
      const norm = condIndex.norm(v);
      const arr = (p.condiciones || (p.condiciones = []));
      if (!arr.some(x => condIndex.norm(x) === norm)) {
        arr.push(v);
      }
      addInput.value = "";
      sync(); render();
      addInput.focus();
    };

    addBtn.addEventListener("click",(e)=>{ e.stopPropagation(); addCond(); });

    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        addCond();
      } else if (e.key === "Tab") {
        // confirma también con Tab, pero dejamos que avance al siguiente campo
        addCond();
        // NO e.preventDefault()
      } else if (e.key === "Escape") {
        // opcional: limpiar texto al cancelar
        // addInput.value = "";
      }
    })

    let lastAutoAdded = null;
    addInput.addEventListener("input", () => {
      const val = addInput.value.trim();
      if (!val) { lastAutoAdded = null; return; }
      if (hasExactDatalistOption("cond-suggestions", val)) {
        if (val !== lastAutoAdded) {
          lastAutoAdded = val;
          addCond();
          lastAutoAdded = null; // se limpia porque vaciamos el input en addCond()
        }
      }
    });

    tr.addEventListener("click",(e)=>{ if(e.target.closest("input,button,.chip")) return; setActiveIdx(idx); });
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        addCond();
      } else if (e.key === "Tab") {
        // confirma también con Tab, pero dejamos que avance al siguiente campo
        addCond();
        // NO e.preventDefault()
      } else if (e.key === "Escape") {
        // opcional: limpiar texto al cancelar
        // addInput.value = "";
      }
    });

    const delBtn=btn("🗑"); delBtn.classList.add("danger"); delBtn.title="Eliminar personaje";
    delBtn.addEventListener("click",(e)=>{ e.stopPropagation(); state.party.splice(idx,1);
      if(state.activeIdx>=state.party.length) state.activeIdx=Math.max(0,state.party.length-1); sync(); render(); });

    tdTools.append(eyeBtn, document.createTextNode(" "), addInput, addBtn, document.createTextNode(" "), delBtn);

    tr.append(tdIni,tdIcon,tdNom,tdCA,tdPV,tdA,tdB,tdR,tdM,tdC,tdTools);
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

function applyCharacterTemplate(p, tpl) {
  if (!tpl) return;

  const icon = tpl.icon ?? tpl.icono ?? "";
  p.icon = icon || null;

  if (typeof tpl.ca === "number") p.ca = Math.max(0, Math.round(tpl.ca));

  // PV
  const maxPv = Number(tpl.pv);
  if (Number.isFinite(maxPv)) {
    if (!p.pv || typeof p.pv !== "object") p.pv = { cur: 0, max: 0 };
    p.pv.max = Math.max(0, Math.round(maxPv));
    p.pv.cur = p.pv.max; // al elegirlo, cur = max
  }

  // Movimiento
  const maxMov = toNumberLocale(tpl.mov);
  if (Number.isFinite(maxMov)) {
    if (!p.mov || typeof p.mov !== "object") p.mov = { cur: 0, max: 0 };
    p.mov.max = Math.max(0, roundToHalf(maxMov));
    p.mov.cur = p.mov.max; // al elegirlo, cur = max
  }

  // Reset de acciones y condiciones por defecto
  p.accion = false;
  p.adicional = false;
  p.reaccion = false;
  p.condiciones = [];
}


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
    retry = 0;

    // Tell server we're admin; do NOT broadcast immediately
    ws.send(JSON.stringify({type:"hello", role:"admin", token: TOKEN || undefined}));

    // Wait for server's last_state; if none arrives, seed with local
    awaitingServerState = true;
    clearTimeout(seedTimer);
    seedTimer = setTimeout(() => {
      if (awaitingServerState) {
        // No state received → seed server with our local state
        broadcastState();
        awaitingServerState = false;
      }
    }, SEED_TIMEOUT_MS);
  });

  ws.addEventListener("message", (ev)=>{
    try{
      const msg = JSON.parse(ev.data);
      if (msg.type === "state" && msg.state){
        // First state after connect: adopt server memory
        if (awaitingServerState) {
          awaitingServerState = false;
        }
        state = msg.state;
        try { localStorage.setItem("mini_turnos_state", JSON.stringify(state)); } catch {}
        render();
      }
    }catch{}
  });

  ws.addEventListener("close", ()=>{
    clearTimeout(seedTimer);
    setTimeout(connect, Math.min(1000*(++retry), 5000));
  });

  ws.addEventListener("error", ()=>{
    clearTimeout(seedTimer);
    try{ws.close();}catch{}
  });
}

// ====== Init ======
document.getElementById("nextBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  const next = nextVisibleIndex(state.activeIdx);
  if (next !== -1) setActiveIdx(next, { reset: true });
});

document.getElementById("prevBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  const prev = prevVisibleIndex(state.activeIdx);
  if (prev !== -1) setActiveIdx(prev, { reset: false });
});

document.getElementById("resetBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  state.party.forEach(p=>resetForTurn(p));
  sync(); render(); 
});

document.getElementById("broadcastBtn").addEventListener("click",(e)=>{ e.stopPropagation(); broadcastState(); });
document.getElementById("addBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  const id=String(Date.now());
  state.party.push({ id, nombre:"Nuevo", ini:0, ca:10, pv:{cur:10,max:10}, mov:{cur:9,max:9}, accion:false, adicional:false, reaccion:false, icon:null, condiciones:[] });
  sync(); render();
});
document.getElementById("addHiddenBtn").addEventListener("click",(e)=>{
  e.stopPropagation();
  const id = String(Date.now());
  state.party.push({
    id, nombre:"(Oculto)", ini:0, ca:10, pv:{cur:10,max:10}, mov:{cur:9,max:9},
    accion:false, adicional:false, reaccion:false, icon:null,
    condiciones:[],
    visible: false                 // ← crea oculta por defecto
  });
  sync(); render();
});

(async function init(){
  try{ const saved=localStorage.getItem("mini_turnos_state"); if(saved){ state=JSON.parse(saved); } }catch{}
  await loadConditions();
  buildCondDatalist();

  await loadPersonajes();
  buildCharDatalist();

  sortPartyByIni();

  connect();
  render();
})();

