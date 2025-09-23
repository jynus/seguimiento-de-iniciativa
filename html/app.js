// ====== Config ======
const WS_URL = new URLSearchParams(location.search).get("ws") || "wss://jynus.com:8443";
const COND_URL = "conditions.json";

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

// Muestra 7 en vez de 7.0, pero deja 7.5 tal cual
function fmtHalf(n) {
  return Number.isFinite(n)
    ? (Number.isInteger(n) ? String(n) : String(n).replace(/\.0$/, ""))
    : "-";
}

// ====== Estado ======
let state = { party: [], activeIdx: 0 };

// ====== Render ======
const rows = document.getElementById("rows");
function td(text=""){ const c=document.createElement("td"); if(text!==""&&text!==null) c.textContent=text; return c; }

function chips(list) {
  const box = document.createElement("div"); box.className = "chips";
  const seen = new Set();
  for (const raw of (list || [])) {
    const key = condIndex.norm(raw);
    if (seen.has(key)) continue; seen.add(key);
    const def = condIndex.get(raw);
    const span = document.createElement("span"); span.className = "chip";
    span.textContent = def?.spanish || String(raw);
    paintChip(span, def?.color || "#8b5cf6");
    box.appendChild(span);
  }
  return box;
}

function render(){
  rows.innerHTML = "";
  const list = (state.party || []).filter(p => p.visible !== false);
  if (!list.length){
    const tr=document.createElement("tr");
    const td0=td("Sin datos");
    td0.colSpan=7;
    td0.className="muted";
    tr.appendChild(td0);
    rows.appendChild(tr);
    return;
  }
  list.forEach((p,idx)=>{
    const tr=document.createElement("tr");
    if(state.party[state.activeIdx]?.id === p.id) tr.classList.add("active");
    if(typeof p.pv!=="object") p.pv={cur:p.pv??0,max:p.pv??0};
    if(typeof p.mov==="number") p.mov={cur:p.mov,max:p.mov};
    if(!p.mov) p.mov={cur:0,max:0};

    const initials = p.nombre?.split(/\s+/).map(w=>w[0]).join("") || "??";
    const iconSrc = p.icon || svgAvatar(initials);

    const tdIcon=td(); tdIcon.innerHTML=`<span class="avatar"><img alt="" src="${iconSrc}" /></span>`;
    const tdNom = td(p.nombre ?? "—");
    const tdA=td(); tdA.innerHTML=`<span class="pill ${p.accion?'on':'off'}">${p.accion?'Usada':'Disponible'}</span>`;
    const tdB=td(); tdB.innerHTML=`<span class="pill ${p.adicional?'on':'off'}">${p.adicional?'Usada':'Disponible'}</span>`;
    const tdR=td(); tdR.innerHTML=`<span class="pill ${p.reaccion?'on':'off'}">${p.reaccion?'Usada':'Disponible'}</span>`;
    const tdM=td(); {
      const box=document.createElement("span"); box.className="mv";
      const pr=document.createElement("span"); pr.className="pair";
      pr.textContent = `${fmtHalf(p.mov.cur)}/${fmtHalf(p.mov.max)}`;
      box.append(pr,document.createTextNode(" m"));
      tdM.appendChild(box);
    }
    const tdC=td(); tdC.appendChild(chips(p.condiciones||[]));

    tr.append(tdIcon,tdNom,tdA,tdB,tdR,tdM,tdC);
    rows.appendChild(tr);
  });
}

// ====== WebSocket ======
let ws, retry=0;
function connect(){
  ws = new WebSocket(WS_URL);
  ws.addEventListener("open", ()=>{ retry=0; ws.send(JSON.stringify({type:"hello", role:"viewer"})); });
  ws.addEventListener("message", (ev)=>{
    try{
      const msg = JSON.parse(ev.data);
      if (msg.type==="state" && msg.state){
        state = msg.state;
        render();
      }
    }catch{}
  });
  ws.addEventListener("close", ()=>{ setTimeout(connect, Math.min(1000*(++retry), 5000)); });
  ws.addEventListener("error", ()=>{ try{ws.close();}catch{} });
}

(async function init(){
  await loadConditions();
  connect();
  render(); // placeholder hasta recibir estado
})();

