/* ============================================================
   CHAMADA DE MEDIUNS - app.js
   Versao: 2026-01-15-d
   FIXES:
   (1) Resumo % baseado em TODOS os ativos (não só marcados)
   (2) Rotação: se não houve clique (ts vazio), usa "último da fila" por ordem_grupo/sort_order
   (3) Destaques (classes) para "próximo da mesa" e "próximo da psicografia"
   (4) Mensagem correta: "nenhuma chamada salva ainda" quando não existir registro no banco para a data
   ============================================================ */

console.log("APP.JS CARREGADO: 2026-01-15-d");

/* ====== SUPABASE ====== */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

function headersJson(prefer = "return=representation") {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headersJson() });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return t ? JSON.parse(t) : [];
}

async function sbPost(path, body, prefer = "return=minimal") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: headersJson(prefer),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return t ? JSON.parse(t) : [];
}

async function sbPatch(path, body, prefer = "return=minimal") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headersJson(prefer),
    body: JSON.stringify(body),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return t ? JSON.parse(t) : [];
}

/* Upsert de chamadas por conflito medium_id,data (precisa unique no banco) */
async function sbUpsertChamadas(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/chamadas?on_conflict=medium_id,data`, {
    method: "POST",
    headers: {
      ...headersJson("resolution=merge-duplicates,return=minimal"),
    },
    body: JSON.stringify(rows),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return true;
}

/* ====== DOM ====== */
const $ = (id) => document.getElementById(id);
function must(id) {
  const e = $(id);
  if (!e) throw new Error(`ID NAO ENCONTRADO NO HTML: ${id}`);
  return e;
}

/* Tabs */
const tabChamada = must("tabChamada");
const tabParticipantes = must("tabParticipantes");
const viewChamada = must("viewChamada");
const viewParticipantes = must("viewParticipantes");

/* Status */
const statusPill = must("statusPill");
const statusText = must("statusText");
const msgTopo = must("msgTopo");
const msgErro = must("msgErro");

/* Chamada */
const dataChamada = must("dataChamada");
const btnVerificar = must("btnVerificar");
const btnSalvar = must("btnSalvar");

const resumoGeral = must("resumoGeral");
const reservasMesa = must("reservasMesa");

/* Proximos */
const nextMesaDirigenteName = must("nextMesaDirigenteName");
const nextPsicoDirigenteName = must("nextPsicoDirigenteName");
const nextMesaIncorpName = must("nextMesaIncorpName");
const nextMesaDesenvName = must("nextMesaDesenvName");

/* Listas */
const listaDirigentes = must("listaDirigentes");
const listaIncorporacao = must("listaIncorporacao");
const listaDesenvolvimento = must("listaDesenvolvimento");
const listaCarencia = must("listaCarencia");

/* Participantes */
const partFiltroGrupo = must("partFiltroGrupo");
const partBusca = must("partBusca");
const btnRecarregarParticipantes = must("btnRecarregarParticipantes");
const listaParticipantes = must("listaParticipantes");
const partMsg = must("partMsg");
const partErr = must("partErr");

const novoNome = must("novoNome");
const novoGrupo = must("novoGrupo");
const novoAtivo = must("novoAtivo");
const novoMesa = must("novoMesa");
const novoPsico = must("novoPsico");
const btnAdicionarParticipante = must("btnAdicionarParticipante");

/* ====== ESTADO ====== */
let mediumsAll = [];
let rotacao = {
  mesa_dirigente: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null,
  psicografia: null,
};
let currentDateISO = null;

let chamadasMap = new Map();
let dateHasSavedCall = false;

/* timestamps de clique: last-click wins */
const tsMesa = new Map();
const tsPsico = new Map();

/* refs das linhas para highlight */
const rowById = new Map();

/* ====== UI helpers ====== */
function setOk(msg = "") { msgTopo.textContent = msg; msgErro.textContent = ""; }
function setErro(msg = "") { msgErro.textContent = msg; }
function setConn(ok, msg) { statusText.textContent = msg; }

function pOk(msg = "") { partMsg.textContent = msg; partErr.textContent = ""; }
function pErr(msg = "") { partErr.textContent = msg; partMsg.textContent = ""; }

function nameOf(m) { return m.name ?? m.nome ?? "(sem nome)"; }
function numOrInf(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/* ORDENACAO CORRETA: fila por ordem_grupo / sort_order / nome */
function byQueue(a, b) {
  const ag = numOrInf(a.ordem_grupo);
  const bg = numOrInf(b.ordem_grupo);
  if (ag !== bg) return ag - bg;

  const as = numOrInf(a.sort_order);
  const bs = numOrInf(b.sort_order);
  if (as !== bs) return as - bs;

  return nameOf(a).localeCompare(nameOf(b), "pt-BR", { sensitivity: "base" });
}

function eligible(group_type) {
  return mediumsAll
    .filter((m) => m.active === true && m.group_type === group_type)
    .slice()
    .sort(byQueue);
}

/* regra: todo dirigente pode psicografar */
function eligiblePsicoDirigentes() {
  return eligible("dirigente");
}

/* ====== ROTACAO ====== */
function computeNext(list, lastId) {
  if (!list.length) return null;
  if (!lastId) return list[0];
  const idx = list.findIndex((x) => x.id === lastId);
  if (idx === -1) return list[0];
  return list[(idx + 1) % list.length];
}

function computeNextSkip(list, lastId, skipId) {
  if (!list.length) return null;
  let n = computeNext(list, lastId);
  if (!skipId || list.length === 1) return n;
  if (n && n.id === skipId) n = computeNext(list, n.id);
  return n;
}

/* 1) Se houver timestamps, pega o último clicado */
function pickLastClicked(ids, tsMap) {
  let bestId = null;
  let bestTs = -1;
  for (const id of ids) {
    const ts = tsMap.get(id);
    if (typeof ts === "number" && ts > bestTs) {
      bestTs = ts;
      bestId = id;
    }
  }
  return bestId;
}

/* 2) Se NÃO houver timestamps (carregado do banco), pega o "último da fila" (maior índice na lista ordenada) */
function pickLastByQueue(ids, listOrdered) {
  if (!ids.length) return null;
  const pos = new Map();
  listOrdered.forEach((m, i) => pos.set(m.id, i));
  let bestId = ids[0];
  let bestPos = pos.has(bestId) ? pos.get(bestId) : -1;

  for (const id of ids) {
    const p = pos.has(id) ? pos.get(id) : -1;
    if (p > bestPos) {
      bestPos = p;
      bestId = id;
    }
  }
  return bestId;
}

/* ====== LOAD ====== */
async function loadMediums() {
  mediumsAll = await sbGet(
    "mediums?select=id,name,group_type,active,presencas,faltas,mesa,psicografia,ordem_grupo,sort_order"
  );
}

async function loadRotacao() {
  const rows = await sbGet("rotacao?select=group_type,last_medium_id");
  rotacao = {
    mesa_dirigente: null,
    mesa_incorporacao: null,
    mesa_desenvolvimento: null,
    psicografia: null,
  };
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(rotacao, r.group_type)) {
      rotacao[r.group_type] = r.last_medium_id || null;
    }
  }
}

async function loadChamadasForDate(iso) {
  chamadasMap = new Map();
  tsMesa.clear();
  tsPsico.clear();
  dateHasSavedCall = false;

  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  if (rows && rows.length) dateHasSavedCall = true;

  for (const r of rows) {
    chamadasMap.set(r.medium_id, (r.status || "").toUpperCase());
  }
}

/* ====== PROXIMOS + HIGHLIGHT ====== */
function clearHighlights() {
  for (const el of rowById.values()) {
    el.classList.remove("nextMesa");
    el.classList.remove("nextPsico");
  }
}

function applyHighlights(nextMesaDir, nextMesaInc, nextMesaDes, nextPsico) {
  clearHighlights();

  if (nextMesaDir?.id && rowById.has(nextMesaDir.id)) rowById.get(nextMesaDir.id).classList.add("nextMesa");
  if (nextMesaInc?.id && rowById.has(nextMesaInc.id)) rowById.get(nextMesaInc.id).classList.add("nextMesa");
  if (nextMesaDes?.id && rowById.has(nextMesaDes.id)) rowById.get(nextMesaDes.id).classList.add("nextMesa");

  if (nextPsico?.id && rowById.has(nextPsico.id)) rowById.get(nextPsico.id).classList.add("nextPsico");
}

/*
  OBS: essas classes dependem do CSS.
  Se no seu style.css antigo era:
    .nextMesa { border: 2px solid #f1c40f; }   // amarelo
    .nextPsico{ border: 2px solid #e74c3c; }   // vermelho
  mantenha/recupere isso lá.
*/
function renderProximos() {
  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  const nextMesaDir = computeNext(dir, rotacao.mesa_dirigente);
  const nextMesaInc = computeNext(inc, rotacao.mesa_incorporacao);
  const nextMesaDes = computeNext(des, rotacao.mesa_desenvolvimento);
  const nextPsico   = computeNextSkip(ps, rotacao.psicografia, nextMesaDir ? nextMesaDir.id : null);

  nextMesaDirigenteName.textContent = nextMesaDir ? nameOf(nextMesaDir) : "—";
  nextMesaIncorpName.textContent    = nextMesaInc ? nameOf(nextMesaInc) : "—";
  nextMesaDesenvName.textContent    = nextMesaDes ? nameOf(nextMesaDes) : "—";
  nextPsicoDirigenteName.textContent= nextPsico ? nameOf(nextPsico) : "—";

  applyHighlights(nextMesaDir, nextMesaInc, nextMesaDes, nextPsico);
}

/* ====== RESUMO ====== */
function renderResumo() {
  const active = mediumsAll.filter((m) => m.active === true);

  let p = 0, m = 0, f = 0, ps = 0;
  const mesa = [];

  for (const med of active) {
    const st = (chamadasMap.get(med.id) || "").toUpperCase();
    if (st === "P") p++;
    if (st === "M") { m++; mesa.push(nameOf(med)); }
    if (st === "F") f++;
    if (st === "PS") ps++;
  }

  /* FIX: % calculado em cima de TODOS os ativos */
  const totalAtivos = active.length;
  const presPct = totalAtivos ? Math.round(((p + m) / totalAtivos) * 100) : 0;
  const faltPct = totalAtivos ? Math.round((f / totalAtivos) * 100) : 0;

  resumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${presPct}% | Faltas:${faltPct}%`;
  reservasMesa.textContent = mesa.length ? mesa.join(", ") : "—";
}

/* ====== LISTA / RADIOS ====== */
function buildStatusOptions(m) {
  const base = ["P", "M", "F"];
  if (m.group_type === "dirigente") base.push("PS");
  return base;
}

function makeRow(m) {
  const wrap = document.createElement("div");
  wrap.className = "itemRow";
  wrap.dataset.mid = m.id;
  wrap.dataset.group = m.group_type;

  rowById.set(m.id, wrap);

  const left = document.createElement("div");
  left.className = "itemLeft";

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = nameOf(m);

  const pres = Number(m.presencas || 0);
  const falt = Number(m.faltas || 0);
  const denom = pres + falt;
  const presPct = denom ? Math.round((pres / denom) * 100) : 0;
  const faltPct = denom ? Math.round((falt / denom) * 100) : 0;

  const meta = document.createElement("div");
  meta.className = "itemMeta";
  meta.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "itemRight";

  const radios = document.createElement("div");
  radios.className = "radioGroup";

  const current = (chamadasMap.get(m.id) || "").toUpperCase();

  for (const s of buildStatusOptions(m)) {
    const rid = `r_${m.id}_${s}`;

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;
    inp.id = rid;
    inp.value = s;
    inp.checked = current === s;

    const lbl = document.createElement("label");
    lbl.className = "radioLbl";
    lbl.setAttribute("for", rid);

    const dot = document.createElement("span");
    dot.className = "dot";
    const txt = document.createElement("span");
    txt.className = "radioTxt";
    txt.textContent = s;

    lbl.appendChild(dot);
    lbl.appendChild(txt);

    inp.addEventListener("change", () => {
      if (!currentDateISO) {
        setErro("Selecione a data e clique em Verificar data.");
        return;
      }

      chamadasMap.set(m.id, s);

      /* timestamp só para interações ao vivo */
      if (s === "M") tsMesa.set(m.id, Date.now()); else tsMesa.delete(m.id);
      if (s === "PS") tsPsico.set(m.id, Date.now()); else tsPsico.delete(m.id);

      renderResumo();
      renderProximos();
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  right.appendChild(radios);
  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function renderChamada() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
  rowById.clear();

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const car = eligible("carencia");

  for (const m of dir) listaDirigentes.appendChild(makeRow(m));
  for (const m of inc) listaIncorporacao.appendChild(makeRow(m));
  for (const m of des) listaDesenvolvimento.appendChild(makeRow(m));
  for (const m of car) listaCarencia.appendChild(makeRow(m));

  renderResumo();
  renderProximos();
}

/* ====== ROTACAO: persistência robusta ====== */
async function persistRotacaoFromCurrentMap() {
  const active = mediumsAll.filter((m) => m.active === true);

  const dirList = eligible("dirigente");
  const incList = eligible("incorporacao");
  const desList = eligible("desenvolvimento");
  const psList  = eligiblePsicoDirigentes();

  const dirMesaIds = active
    .filter((m) => m.group_type === "dirigente" && (chamadasMap.get(m.id) || "") === "M")
    .map((m) => m.id);

  const incMesaIds = active
    .filter((m) => m.group_type === "incorporacao" && (chamadasMap.get(m.id) || "") === "M")
    .map((m) => m.id);

  const desMesaIds = active
    .filter((m) => m.group_type === "desenvolvimento" && (chamadasMap.get(m.id) || "") === "M")
    .map((m) => m.id);

  const psicoIds = active
    .filter((m) => m.group_type === "dirigente" && (chamadasMap.get(m.id) || "") === "PS")
    .map((m) => m.id);

  /* Se houver clique, respeita clique; senão usa "último da fila" */
  const lastMesaDir =
    pickLastClicked(dirMesaIds, tsMesa) ?? pickLastByQueue(dirMesaIds, dirList);

  const lastMesaInc =
    pickLastClicked(incMesaIds, tsMesa) ?? pickLastByQueue(incMesaIds, incList);

  const lastMesaDes =
    pickLastClicked(desMesaIds, tsMesa) ?? pickLastByQueue(desMesaIds, desList);

  let lastPsico =
    pickLastClicked(psicoIds, tsPsico) ?? pickLastByQueue(psicoIds, psList);

  /* regra: não deixa o mesmo dirigente ser mesa e psicografia na rotação */
  if (lastMesaDir && lastPsico && lastMesaDir === lastPsico) {
    lastPsico = computeNextSkip(psList, lastPsico, lastMesaDir)?.id || lastPsico;
  }

  if (lastMesaDir) await sbPatch(`rotacao?group_type=eq.mesa_dirigente`, { last_medium_id: lastMesaDir });
  if (lastMesaInc) await sbPatch(`rotacao?group_type=eq.mesa_incorporacao`, { last_medium_id: lastMesaInc });
  if (lastMesaDes) await sbPatch(`rotacao?group_type=eq.mesa_desenvolvimento`, { last_medium_id: lastMesaDes });
  if (lastPsico)   await sbPatch(`rotacao?group_type=eq.psicografia`, { last_medium_id: lastPsico });
}

/* ====== SALVAR ====== */
async function onSalvarTudo() {
  if (!currentDateISO) return setErro("Selecione a data e clique em Verificar data.");

  try {
    const active = mediumsAll.filter((m) => m.active === true);
    const rows = [];

    for (const m of active) {
      const st = (chamadasMap.get(m.id) || "").toUpperCase();
      if (["P", "M", "F", "PS"].includes(st)) {
        rows.push({ medium_id: m.id, data: currentDateISO, status: st });
      }
    }

    if (rows.length) {
      await sbUpsertChamadas(rows);
      dateHasSavedCall = true;
    }

    await persistRotacaoFromCurrentMap();
    await loadRotacao();
    renderProximos();

    setOk("Chamada salva e rotação atualizada.");
  } catch (e) {
    setErro("Erro ao salvar: " + e.message);
  }
}

/* ====== PRE-RESERVA (opcional): aplica M/PS dos próximos sem salvar ======
   Se você NÃO quiser mais isso, basta não chamar applyPreReserva() no onVerificar.
*/
function applyPreReservaIfEmpty() {
  // só aplica se NÃO houver chamada salva e não houver nada marcado ainda
  if (dateHasSavedCall) return;

  const anyMarked = Array.from(chamadasMap.values()).some((st) =>
    ["P", "M", "F", "PS"].includes((st || "").toUpperCase())
  );
  if (anyMarked) return;

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  const nextMesaDir = computeNext(dir, rotacao.mesa_dirigente);
  const nextMesaInc = computeNext(inc, rotacao.mesa_incorporacao);
  const nextMesaDes = computeNext(des, rotacao.mesa_desenvolvimento);
  const nextPsico   = computeNextSkip(ps, rotacao.psicografia, nextMesaDir ? nextMesaDir.id : null);

  if (nextMesaDir) chamadasMap.set(nextMesaDir.id, "M");
  if (nextMesaInc) chamadasMap.set(nextMesaInc.id, "M");
  if (nextMesaDes) chamadasMap.set(nextMesaDes.id, "M");
  if (nextPsico)   chamadasMap.set(nextPsico.id, "PS");
}

/* ====== VERIFICAR DATA ====== */
async function onVerificar() {
  setErro("");
  const iso = (dataChamada.value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return setErro("Data inválida.");

  currentDateISO = iso;
  await loadChamadasForDate(iso);

  // aplica pré-reserva só se estiver vazio e não houver chamada salva
  applyPreReservaIfEmpty();

  if (dateHasSavedCall) {
    setOk(`Data carregada: ${iso}`);
  } else {
    setOk(`Data carregada: ${iso} (nenhuma chamada salva ainda)`);
  }

  renderChamada();
}

/* ====== PARTICIPANTES ====== */
function matchesFilter(m) {
  const g = (partFiltroGrupo.value || "").trim();
  const q = (partBusca.value || "").trim().toLowerCase();
  if (g && m.group_type !== g) return false;
  if (q && !nameOf(m).toLowerCase().includes(q)) return false;
  return true;
}

function renderParticipants() {
  listaParticipantes.innerHTML = "";
  const filtered = mediumsAll.filter(matchesFilter).sort(byQueue);

  if (!filtered.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "Nenhum participante encontrado.";
    listaParticipantes.appendChild(div);
    return;
  }

  for (const m of filtered) {
    const row = document.createElement("div");
    row.className = "itemRow";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName">${nameOf(m)}</div>
        <div class="itemMeta">Grupo: ${m.group_type} | Ativo: ${m.active ? "Sim" : "Não"} | Ordem: ${m.ordem_grupo ?? "-"} / ${m.sort_order ?? "-"}</div>
      </div>
      <div class="itemRight"></div>
    `;
    listaParticipantes.appendChild(row);
  }
}

async function reloadParticipants() {
  await loadMediums();
  renderParticipants();
  renderChamada();
}

async function onAdicionarParticipante() {
  pOk(""); pErr("");

  const name = (novoNome.value || "").trim();
  const group_type = (novoGrupo.value || "").trim();
  const active = !!novoAtivo.checked;

  if (!name) return pErr("Informe o nome.");
  if (!group_type) return pErr("Informe o grupo.");

  try {
    await sbPost("mediums", [{
      name,
      group_type,
      active,
      mesa: novoMesa.checked ? 1 : 0,
      psicografia: novoPsico.checked ? 1 : 0,
      presencas: 0,
      faltas: 0,
      ordem_grupo: null,
      sort_order: null
    }], "return=minimal");

    pOk("Participante adicionado.");
    novoNome.value = "";
    novoMesa.checked = false;
    novoPsico.checked = false;
    novoAtivo.checked = true;

    await reloadParticipants();
  } catch (e) {
    pErr("Erro ao adicionar: " + e.message);
  }
}

/* ====== TABS ====== */
function showTab(which) {
  const isChamada = which === "chamada";
  viewChamada.style.display = isChamada ? "" : "none";
  viewParticipantes.style.display = isChamada ? "none" : "";
  tabChamada.classList.toggle("active", isChamada);
  tabParticipantes.classList.toggle("active", !isChamada);
  if (!isChamada) renderParticipants();
}

/* ====== INIT ====== */
(async function init() {
  try {
    setConn(false, "Conectando...");
    await sbGet("rotacao?select=group_type,last_medium_id&limit=1");
    setConn(true, "Supabase OK");

    await loadMediums();
    await loadRotacao();

    setOk("Selecione a data e clique em Verificar data.");
    renderChamada();
    renderParticipants();
  } catch (e) {
    setConn(false, "Erro");
    setErro("Falha ao conectar: " + e.message);
  }

  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvarTudo);

  tabChamada.addEventListener("click", () => showTab("chamada"));
  tabParticipantes.addEventListener("click", () => showTab("participantes"));

  btnRecarregarParticipantes.addEventListener("click", async () => {
    try { await reloadParticipants(); pOk("Recarregado."); }
    catch (e) { pErr("Erro ao recarregar: " + e.message); }
  });

  partFiltroGrupo.addEventListener("change", renderParticipants);
  partBusca.addEventListener("input", renderParticipants);

  btnAdicionarParticipante.addEventListener("click", onAdicionarParticipante);
})();
