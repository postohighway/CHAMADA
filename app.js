/* ============================================================
   CHAMADA DE MÉDIUNS - app.js
   Versão: 2026-01-21-a

   OBJETIVO (FIX DEFINITIVO):
   1) PRÉ-RESERVA VISUAL automática quando NÃO existir chamada salva no dia:
      - Mesa Dirigente = próximo da fila (M)  -> BORDA AMARELA + label "PRÓXIMO (MESA)"
      - Mesa Incorporação = próximo da fila (M) -> BORDA AMARELA + label
      - Mesa Desenvolvimento = próximo da fila (M) -> BORDA AMARELA + label
      - Psicografia (Dirigentes) = próximo da fila (PS) evitando coincidir com Mesa Dirigente -> BORDA VERMELHA + label "PRÓXIMO (PS)"
      - Campo "Reservas da mesa (M)" vem preenchido com os 3 nomes de M (Dir+Inc+Des) na pré-reserva.
      - Isso NÃO salva no banco. Só salva quando você clicar "Salvar chamada".

   2) Ao SALVAR:
      - Upsert em chamadas (medium_id,data)
      - Atualiza rotacao via RPC no banco (recalcula baseado no dia salvo)
        -> garante que a rotação do banco bate com a chamada salva (sem “correr atrás do rabo”)

   3) Mantém ordenação por (ordem_grupo, sort_order, name) em todas as filas.
   ============================================================ */

console.log("APP.JS CARREGADO: 2026-01-21-a");

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
    headers: { ...headersJson("resolution=merge-duplicates,return=minimal") },
    body: JSON.stringify(rows),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return true;
}

/* RPC: recalcula rotacao a partir do dia salvo (função criada no banco) */
async function sbRpc(fnName, payload = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: headersJson("return=minimal"),
    body: JSON.stringify(payload),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${t}`);
  return t ? JSON.parse(t) : null;
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

/* Próximos */
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

/* Chamadas carregadas do banco (status real) */
let chamadasMap = new Map();

/* Pré-reservas visuais (apenas UI) */
let preReservaMesaIds = new Set(); // ids marcados como M por pré-reserva
let preReservaPsicoId = null;      // id marcado como PS por pré-reserva
let hasSavedCallForDay = false;    // se existe qualquer registro em chamadas naquele dia

/* timestamps de clique: last-click wins */
const tsMesa = new Map();
const tsPsico = new Map();

/* ====== UI helpers ====== */
function setOk(msg = "") { msgTopo.textContent = msg; msgErro.textContent = ""; }
function setErro(msg = "") { msgErro.textContent = msg; }
function setConn(ok, msg) {
  statusText.textContent = msg;
  if (statusPill) statusPill.classList.toggle("bad", !ok);
}

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

function pickLastClicked(ids, tsMap) {
  let bestId = null;
  let bestTs = -1;
  for (const id of ids) {
    const ts = tsMap.get(id);
    if (typeof ts === "number" && ts > bestTs) {
      bestTs = ts;
      bestId = id;
      bestTs = ts;
    }
  }
  if (!bestId && ids.length) bestId = ids[ids.length - 1];
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

/* carrega chamadas do dia; retorna quantos registros existem */
async function loadChamadasForDate(iso) {
  chamadasMap = new Map();
  tsMesa.clear();
  tsPsico.clear();
  preReservaMesaIds = new Set();
  preReservaPsicoId = null;
  hasSavedCallForDay = false;

  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  hasSavedCallForDay = rows.length > 0;

  for (const r of rows) {
    chamadasMap.set(r.medium_id, (r.status || "").toUpperCase());
    if ((r.status || "").toUpperCase() === "M") tsMesa.set(r.medium_id, Date.now());
    if ((r.status || "").toUpperCase() === "PS") tsPsico.set(r.medium_id, Date.now());
  }
  return rows.length;
}

/* ====== PRÉ-RESERVA (UI) ====== */
function applyPreReservaIfEmptyDay() {
  // Só aplica se NÃO houver nada salvo no banco nesse dia.
  if (hasSavedCallForDay) return;

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  const nextMesaDir = computeNext(dir, rotacao.mesa_dirigente);
  const nextMesaInc = computeNext(inc, rotacao.mesa_incorporacao);
  const nextMesaDes = computeNext(des, rotacao.mesa_desenvolvimento);

  const nextPsico = computeNextSkip(ps, rotacao.psicografia, nextMesaDir ? nextMesaDir.id : null);

  // Marca no mapa (somente UI)
  if (nextMesaDir) {
    chamadasMap.set(nextMesaDir.id, "M");
    preReservaMesaIds.add(nextMesaDir.id);
    tsMesa.set(nextMesaDir.id, Date.now());
  }
  if (nextMesaInc) {
    chamadasMap.set(nextMesaInc.id, "M");
    preReservaMesaIds.add(nextMesaInc.id);
    tsMesa.set(nextMesaInc.id, Date.now());
  }
  if (nextMesaDes) {
    chamadasMap.set(nextMesaDes.id, "M");
    preReservaMesaIds.add(nextMesaDes.id);
    tsMesa.set(nextMesaDes.id, Date.now());
  }

  if (nextPsico) {
    chamadasMap.set(nextPsico.id, "PS");
    preReservaPsicoId = nextPsico.id;
    tsPsico.set(nextPsico.id, Date.now());
  }
}

/* ====== PRÓXIMOS ====== */
function renderProximos() {
  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  const nextMesaDir = computeNext(dir, rotacao.mesa_dirigente);
  const nextMesaInc = computeNext(inc, rotacao.mesa_incorporacao);
  const nextMesaDes = computeNext(des, rotacao.mesa_desenvolvimento);

  const nextPsico = computeNextSkip(ps, rotacao.psicografia, nextMesaDir ? nextMesaDir.id : null);

  nextMesaDirigenteName.textContent = nextMesaDir ? nameOf(nextMesaDir) : "—";
  nextMesaIncorpName.textContent    = nextMesaInc ? nameOf(nextMesaInc) : "—";
  nextMesaDesenvName.textContent    = nextMesaDes ? nameOf(nextMesaDes) : "—";
  nextPsicoDirigenteName.textContent= nextPsico ? nameOf(nextPsico) : "—";
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

  const total = p + m + f;
  const presPct = total ? Math.round(((p + m) / total) * 100) : 0;
  const faltPct = total ? Math.round((f / total) * 100) : 0;

  resumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${presPct}% | Faltas:${faltPct}%`;
  reservasMesa.textContent = mesa.length ? mesa.join(", ") : "—";
}

/* ====== LISTA / RADIOS + DESTAQUES ====== */
function buildStatusOptions(m) {
  const base = ["P", "M", "F"];
  if (m.group_type === "dirigente") base.push("PS");
  return base;
}

/* injeta estilos da marcação (amarelo mesa / vermelho psico) sem depender do CSS externo */
function ensureHighlightStyles() {
  if (document.getElementById("preReservaStyles")) return;
  const st = document.createElement("style");
  st.id = "preReservaStyles";
  st.textContent = `
    .itemRow.preMesa {
      outline: 2px solid rgba(255, 199, 0, 0.85);
      box-shadow: 0 0 0 2px rgba(255, 199, 0, 0.25) inset;
    }
    .itemRow.prePsico {
      outline: 2px solid rgba(255, 77, 79, 0.85);
      box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.25) inset;
    }
    .itemRow .tagNext {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      letter-spacing: 0.3px;
      opacity: 0.95;
      width: fit-content;
    }
    .itemRow .tagMesa {
      border: 1px solid rgba(255, 199, 0, 0.65);
      color: rgba(255, 199, 0, 0.95);
      background: rgba(255, 199, 0, 0.08);
    }
    .itemRow .tagPsico {
      border: 1px solid rgba(255, 77, 79, 0.65);
      color: rgba(255, 77, 79, 0.95);
      background: rgba(255, 77, 79, 0.08);
    }
  `;
  document.head.appendChild(st);
}

function makeRow(m) {
  ensureHighlightStyles();

  const wrap = document.createElement("div");
  wrap.className = "itemRow";

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

  // Tags de pré-reserva
  const stNow = (chamadasMap.get(m.id) || "").toUpperCase();
  const isPreMesa = !hasSavedCallForDay && preReservaMesaIds.has(m.id) && stNow === "M";
  const isPrePsico = !hasSavedCallForDay && preReservaPsicoId === m.id && stNow === "PS";

  if (isPreMesa) {
    wrap.classList.add("preMesa");
    const tag = document.createElement("div");
    tag.className = "tagNext tagMesa";
    tag.textContent = "PRÓXIMO (MESA)";
    left.appendChild(tag);
  }
  if (isPrePsico) {
    wrap.classList.add("prePsico");
    const tag = document.createElement("div");
    tag.className = "tagNext tagPsico";
    tag.textContent = "PRÓXIMO (PSICOGRAFIA)";
    left.appendChild(tag);
  }

  const right = document.createElement("div");
  right.className = "itemRight";

  const radios = document.createElement("div");
  radios.className = "radioGroup";

  for (const s of buildStatusOptions(m)) {
    const rid = `r_${m.id}_${s}`;

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;
    inp.id = rid;
    inp.value = s;
    inp.checked = stNow === s;

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

      // Ao usuário mexer manualmente, a pré-reserva deixa de ser “dona” daquela linha
      if (preReservaMesaIds.has(m.id)) preReservaMesaIds.delete(m.id);
      if (preReservaPsicoId === m.id) preReservaPsicoId = null;

      chamadasMap.set(m.id, s);

      if (s === "M") tsMesa.set(m.id, Date.now()); else tsMesa.delete(m.id);
      if (s === "PS") tsPsico.set(m.id, Date.now()); else tsPsico.delete(m.id);

      renderResumo();
      renderChamada(); // re-render para atualizar marcação (amarelo/vermelho) e tag
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

    if (rows.length) await sbUpsertChamadas(rows);

    // Recalcula rotacao no BANCO (fix definitivo)
    // Função criada no banco: update_rotacao_from_date(p_data date)
    await sbRpc("update_rotacao_from_date", { p_data: currentDateISO });

    // Recarrega rotacao para UI ficar igual ao banco
    await loadRotacao();

    // Agora esse dia passa a ser “salvo”
    hasSavedCallForDay = true;
    preReservaMesaIds = new Set();
    preReservaPsicoId = null;

    renderProximos();
    setOk("Chamada salva. Rotação recalculada no banco com base no dia salvo.");
  } catch (e) {
    setErro("Erro ao salvar: " + e.message);
  }
}

/* ====== VERIFICAR DATA ====== */
async function onVerificar() {
  setErro("");
  const iso = (dataChamada.value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return setErro("Data inválida (use AAAA-MM-DD).");

  currentDateISO = iso;

  // 1) carrega o que existe no banco
  const qtd = await loadChamadasForDate(iso);

  // 2) se não existe nada, aplica PRÉ-RESERVA VISUAL (amarelo/vermelho)
  applyPreReservaIfEmptyDay();

  // 3) mensagens
  if (qtd === 0) {
    setOk(`Data carregada: ${iso} (pré-reserva aplicada — ainda não está salva)`);
  } else {
    setOk(`Data carregada: ${iso} (chamada já existe no banco)`);
  }

  // 4) render final
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
