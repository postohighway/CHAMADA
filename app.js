/* ========= CONFIG SUPABASE =========
   Preencha com seus dados do Supabase.
   Recomendação: use ANON KEY (public) com RLS bem configurado.
*/
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

async function sbFetch(path, { method="GET", body=null } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function sbSelect(table, query) {
  return sbFetch(`${table}?${query}`);
}

async function sbUpsert(table, rows, onConflict) {
  // Supabase REST upsert: POST com Prefer: resolution=merge-duplicates e on_conflict
  const url = `${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation,resolution=merge-duplicates"
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function sbPatch(table, filter, patchObj) {
  return sbFetch(`${table}?${filter}`, { method: "PATCH", body: patchObj });
}

/* ========= DOM ========= */
const el = (id) => document.getElementById(id);

const tabChamada = el("tabChamada");
const tabParticipantes = el("tabParticipantes");
const viewChamada = el("viewChamada");
const viewParticipantes = el("viewParticipantes");

const statusPill = el("statusPill");
const statusText = el("statusText");
const msgTopo = el("msgTopo");
const msgErro = el("msgErro");

const dataChamada = el("dataChamada");
const btnVerificar = el("btnVerificar");
const btnSalvar = el("btnSalvar");

const resumoGeral = el("resumoGeral");
const reservasMesa = el("reservasMesa");

const nextMesaDirigenteName = el("nextMesaDirigenteName");
const nextPsicoDirigenteName = el("nextPsicoDirigenteName");
const nextMesaIncorpName = el("nextMesaIncorpName");
const nextMesaDesenvName = el("nextMesaDesenvName");

const listaDirigentes = el("listaDirigentes");
const listaIncorporacao = el("listaIncorporacao");
const listaDesenvolvimento = el("listaDesenvolvimento");

const busca = el("busca");
const filtroGrupo = el("filtroGrupo");
const listaParticipantes = el("listaParticipantes");

/* ========= ESTADO ========= */
let mediumsAll = [];
let rotacao = {}; // group_type -> last_medium_id
let currentDateISO = null;

const chamadasMap = new Map(); // medium_id -> status do dia

// IMPORTANTÍSSIMO: “último clique” manda.
const tsMesa = new Map();  // medium_id -> timestamp quando marcou M
const tsPsico = new Map(); // medium_id -> timestamp quando marcou PS

/* ========= UI helpers ========= */
function setOk(msg){
  msgErro.textContent = "";
  msgTopo.textContent = msg || "";
}
function setErro(msg){
  msgTopo.textContent = "";
  msgErro.textContent = msg || "";
}

function sortByNome(a,b){
  return (a.nome||"").localeCompare(b.nome||"", "pt-BR", { sensitivity:"base" });
}

function computeNext(list, lastId){
  if(!list.length) return null;
  if(!lastId) return list[0];
  const idx = list.findIndex(x => x.id === lastId);
  if(idx === -1) return list[0];
  return list[(idx+1) % list.length];
}

// evita que PS pegue a mesma pessoa que mesa_dirigente
function computeNextSkip(list, lastId, skipId){
  if(!list.length) return null;
  let next = computeNext(list, lastId);
  if(!skipId) return next;
  if(list.length === 1) return next;
  if(next && next.id === skipId){
    // avança mais um
    next = computeNext(list, next.id);
  }
  return next;
}

// escolhe o ID com maior timestamp (último clique)
function pickLastClicked(candidateIds, tsMap){
  let bestId = null;
  let bestTs = -1;
  for(const id of candidateIds){
    const ts = tsMap.get(id);
    if(typeof ts === "number" && ts > bestTs){
      bestTs = ts;
      bestId = id;
    }
  }
  if(!bestId && candidateIds.length) bestId = candidateIds[candidateIds.length-1];
  return bestId;
}

/* ========= Carregamento ========= */
async function pingSupabase(){
  try{
    await sbSelect("rotacao", "select=group_type,last_medium_id&limit=1");
    statusPill.textContent = "Supabase OK";
    statusText.textContent = "Supabase OK";
    statusPill.style.borderColor = "rgba(35,197,94,.6)";
    setOk("");
  }catch(e){
    statusPill.textContent = "Erro";
    statusText.textContent = "Falha ao conectar";
    statusPill.style.borderColor = "rgba(239,68,68,.6)";
    setErro("Falha ao conectar: " + e.message);
  }
}

async function loadBase(){
  // mediums
  mediumsAll = await sbSelect("mediums", "select=id,nome,group_type,active,presencas,faltas&order=nome.asc");
  mediumsAll.sort(sortByNome);

  // rotacao
  const r = await sbSelect("rotacao", "select=group_type,last_medium_id");
  rotacao = {};
  for(const row of r){
    rotacao[row.group_type] = row.last_medium_id;
  }
}

async function loadChamadasForDate(dateISO){
  chamadasMap.clear();
  tsMesa.clear();
  tsPsico.clear();

  const rows = await sbSelect("chamadas", `select=medium_id,status&data=eq.${dateISO}`);
  for(const row of rows){
    chamadasMap.set(row.medium_id, row.status);
    // sem timestamp histórico — só será preenchido nos cliques do dia
  }
}

/* ========= Rotação (grupos) ========= */
function eligibleByGroup(group){
  return mediumsAll.filter(m => m.active === true && m.group_type === group).sort(sortByNome);
}
function eligibleDirigentePsico(){
  // psicografia é dentro de dirigente, filtrado por “active”
  return eligibleByGroup("dirigente");
}

function renderProximos(){
  const dirList = eligibleByGroup("dirigente");
  const incList = eligibleByGroup("incorporacao");
  const desList = eligibleByGroup("desenvolvimento");
  const psList  = eligibleDirigentePsico();

  const nextMesaDir = computeNext(dirList, rotacao["mesa_dirigente"]);
  const nextMesaInc = computeNext(incList, rotacao["mesa_incorporacao"]);
  const nextMesaDes = computeNext(desList, rotacao["mesa_desenvolvimento"]);
  const nextPsico   = computeNextSkip(psList, rotacao["psicografia_dirigente"], nextMesaDir ? nextMesaDir.id : null);

  nextMesaDirigenteName.textContent = nextMesaDir ? nextMesaDir.nome : "—";
  nextMesaIncorpName.textContent    = nextMesaInc ? nextMesaInc.nome : "—";
  nextMesaDesenvName.textContent    = nextMesaDes ? nextMesaDes.nome : "—";
  nextPsicoDirigenteName.textContent= nextPsico ? nextPsico.nome : "—";
}

/* ========= Resumo ========= */
function renderResumo(){
  const activeOnly = mediumsAll.filter(m => m.active === true);
  let p=0,m=0,f=0,ps=0;

  const mesaNames = [];

  for(const med of activeOnly){
    const st = (chamadasMap.get(med.id)||"").toUpperCase();
    if(st==="P") p++;
    if(st==="M"){ m++; mesaNames.push(med.nome); }
    if(st==="F") f++;
    if(st==="PS") ps++;
  }

  const total = p+m+f;
  const presPct = total ? Math.round(((p+m)/total)*100) : 0;
  const faltPct = total ? Math.round((f/total)*100) : 0;

  resumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${presPct}% | Faltas:${faltPct}%`;
  reservasMesa.textContent = mesaNames.length ? mesaNames.join(" | ") : "—";
}

/* ========= Render listas (chamada) ========= */
function makeItem(med, opts){
  const st = (chamadasMap.get(med.id)||"").toUpperCase();

  const wrap = document.createElement("div");
  wrap.className = "item";

  const header = document.createElement("div");
  header.className = "itemHeader";

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = med.nome;

  const pres = med.presencas ?? 0;
  const falt = med.faltas ?? 0;
  const tot = pres + falt;
  const presPct = tot ? Math.round((pres/tot)*100) : 0;
  const faltPct = tot ? Math.round((falt/tot)*100) : 0;

  const stats = document.createElement("div");
  stats.className = "stats";
  stats.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  left.appendChild(name);
  left.appendChild(stats);

  const right = document.createElement("div");
  if(opts && opts.badge){
    const b = document.createElement("div");
    b.className = "badge " + (opts.badgeClass||"");
    b.textContent = opts.badge;
    right.appendChild(b);
  }

  header.appendChild(left);
  header.appendChild(right);

  wrap.appendChild(header);

  // controles
  const controls = document.createElement("div");
  controls.className = "controls";

  function addRadio(label, value){
    const l = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `st_${med.id}`;
    input.value = value;
    input.checked = (st === value);

    input.addEventListener("change", () => {
      const val = input.value;
      chamadasMap.set(med.id, val);

      // registra timestamps do “último clique”
      if(val === "M") tsMesa.set(med.id, Date.now());
      else tsMesa.delete(med.id);

      if(val === "PS") tsPsico.set(med.id, Date.now());
      else tsPsico.delete(med.id);

      renderResumo();
    });

    l.appendChild(input);
    const t = document.createElement("span");
    t.textContent = label;
    l.appendChild(t);
    controls.appendChild(l);
  }

  addRadio("P", "P");
  addRadio("M", "M");
  addRadio("F", "F");
  if(med.group_type === "dirigente") addRadio("PS", "PS");

  wrap.appendChild(controls);
  return wrap;
}

function computeBadges(){
  // badges são “próximos”
  const dirList = eligibleByGroup("dirigente");
  const incList = eligibleByGroup("incorporacao");
  const desList = eligibleByGroup("desenvolvimento");
  const psList  = eligibleDirigentePsico();

  const nextMesaDir = computeNext(dirList, rotacao["mesa_dirigente"]);
  const nextMesaInc = computeNext(incList, rotacao["mesa_incorporacao"]);
  const nextMesaDes = computeNext(desList, rotacao["mesa_desenvolvimento"]);
  const nextPsico   = computeNextSkip(psList, rotacao["psicografia_dirigente"], nextMesaDir ? nextMesaDir.id : null);

  return {
    nextMesaDirId: nextMesaDir?.id || null,
    nextMesaIncId: nextMesaInc?.id || null,
    nextMesaDesId: nextMesaDes?.id || null,
    nextPsicoId: nextPsico?.id || null
  };
}

function renderChamada(){
  const badges = computeBadges();

  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";

  const dir = eligibleByGroup("dirigente");
  const inc = eligibleByGroup("incorporacao");
  const des = eligibleByGroup("desenvolvimento");

  for(const m of dir){
    let badge = null, badgeClass = "";
    if(m.id === badges.nextMesaDirId){ badge = "Mesa (próximo dirigente)"; badgeClass = "badgeMesa"; }
    if(m.id === badges.nextPsicoId){ badge = "Psicografia (próximo)"; badgeClass = "badgePsico"; }
    listaDirigentes.appendChild(makeItem(m, badge ? { badge, badgeClass } : null));
  }

  for(const m of inc){
    let badge = null, badgeClass = "";
    if(m.id === badges.nextMesaIncId){ badge = "Mesa (próximo incorp.)"; badgeClass = "badgeMesa"; }
    listaIncorporacao.appendChild(makeItem(m, badge ? { badge, badgeClass } : null));
  }

  for(const m of des){
    let badge = null, badgeClass = "";
    if(m.id === badges.nextMesaDesId){ badge = "Mesa (próximo desenv.)"; badgeClass = "badgeMesa"; }
    listaDesenvolvimento.appendChild(makeItem(m, badge ? { badge, badgeClass } : null));
  }

  renderResumo();
  renderProximos();
}

/* ========= Persistência ========= */
async function sbUpsertChamadas(rows){
  // onConflict: data,medium_id (você precisa ter unique para isso)
  return sbUpsert("chamadas", rows, "data,medium_id");
}

async function sbPatchRotacao(group_type, last_medium_id){
  // garante upsert por group_type
  return sbUpsert("rotacao", [{ group_type, last_medium_id }], "group_type");
}

/* ========= Ações ========= */
btnVerificar.addEventListener("click", async () => {
  try{
    const v = dataChamada.value;
    if(!v) return setErro("Selecione a data.");
    currentDateISO = v;

    await loadChamadasForDate(currentDateISO);
    setOk(`Data válida: ${currentDateISO}`);
    renderChamada();
  }catch(e){
    setErro("Erro ao verificar data: " + e.message);
  }
});

btnSalvar.addEventListener("click", async () => {
  if(!currentDateISO) return setErro("Selecione uma data e clique em Verificar data.");

  try{
    const activeOnly = mediumsAll.filter(m => m.active === true);

    // salva chamada
    const valid = new Set(["P","M","F","PS"]);
    const rows = [];
    for(const m of activeOnly){
      const st = String(chamadasMap.get(m.id)||"").toUpperCase();
      if(valid.has(st)) rows.push({ data: currentDateISO, medium_id: m.id, status: st });
    }
    if(rows.length) await sbUpsertChamadas(rows);

    // ROTACAO pelo último clique (exatamente o seu fluxo)
    const dirMesaIds = activeOnly.filter(m=>m.group_type==="dirigente" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").map(m=>m.id);
    const incMesaIds = activeOnly.filter(m=>m.group_type==="incorporacao" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").map(m=>m.id);
    const desMesaIds = activeOnly.filter(m=>m.group_type==="desenvolvimento" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").map(m=>m.id);
    const psicoIds   = activeOnly.filter(m=>m.group_type==="dirigente" && (chamadasMap.get(m.id)||"").toUpperCase()==="PS").map(m=>m.id);

    const lastMesaDir = pickLastClicked(dirMesaIds, tsMesa);
    const lastMesaInc = pickLastClicked(incMesaIds, tsMesa);
    const lastMesaDes = pickLastClicked(desMesaIds, tsMesa);
    let lastPsico     = pickLastClicked(psicoIds, tsPsico);

    // evita PS = Mesa dirigente por engano
    if(lastMesaDir && lastPsico && lastMesaDir === lastPsico){
      const psList = eligibleDirigentePsico();
      lastPsico = computeNextSkip(psList, lastPsico, lastMesaDir)?.id || lastPsico;
    }

    if(lastMesaDir) await sbPatchRotacao("mesa_dirigente", lastMesaDir);
    if(lastMesaInc) await sbPatchRotacao("mesa_incorporacao", lastMesaInc);
    if(lastMesaDes) await sbPatchRotacao("mesa_desenvolvimento", lastMesaDes);
    if(lastPsico)   await sbPatchRotacao("psicografia_dirigente", lastPsico);

    // recarrega base/rotacao e re-renderiza
    await loadBase();
    await loadChamadasForDate(currentDateISO);
    renderChamada();

    setOk("Chamada salva. Rotação atualizada pelo último clique (Mesa/PS).");
  }catch(e){
    setErro("Erro ao salvar chamada: " + e.message);
  }
});

/* ========= Participantes ========= */
function renderParticipantes(){
  const q = (busca.value||"").trim().toLowerCase();
  const g = filtroGrupo.value;

  const list = mediumsAll
    .filter(m => (g ? m.group_type===g : true))
    .filter(m => (q ? (m.nome||"").toLowerCase().includes(q) : true))
    .sort(sortByNome);

  listaParticipantes.innerHTML = "";
  for(const m of list){
    const div = document.createElement("div");
    div.className = "item";
    const pres = m.presencas ?? 0;
    const falt = m.faltas ?? 0;
    div.innerHTML = `
      <div class="name">${m.nome}</div>
      <div class="stats">Grupo: ${m.group_type} | Presenças: ${pres} | Faltas: ${falt}</div>
    `;
    listaParticipantes.appendChild(div);
  }
}

busca.addEventListener("input", renderParticipantes);
filtroGrupo.addEventListener("change", renderParticipantes);

/* ========= Tabs ========= */
tabChamada.addEventListener("click", () => {
  tabChamada.classList.add("active");
  tabParticipantes.classList.remove("active");
  viewChamada.classList.remove("hidden");
  viewParticipantes.classList.add("hidden");
});

tabParticipantes.addEventListener("click", () => {
  tabParticipantes.classList.add("active");
  tabChamada.classList.remove("active");
  viewParticipantes.classList.remove("hidden");
  viewChamada.classList.add("hidden");
  renderParticipantes();
});

/* ========= init ========= */
(async function init(){
  await pingSupabase();
  await loadBase();
  renderChamada();
})();
