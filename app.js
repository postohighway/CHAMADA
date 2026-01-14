/* ============================================================
   CHAMADA DE MÉDIUNS - app.js (ROTAÇÃO 3 FILAS + PS SEPARADO)
   Tabelas: public.mediums, public.chamadas, public.feriados, public.rotacao
   Regras:
     - Dirigente: P/F + (M se mesa=1) + (PS se psicografia=1)
     - Incorporação: P/F + (M se mesa=1)
     - Desenvolvimento: P/F + (M se mesa=1)
     - Carência: P/F (sem mesa)
   Rotação (tabela rotacao):
     - mesa_dirigente
     - mesa_incorporacao
     - mesa_desenvolvimento
     - psicografia_dirigente
   ============================================================ */

/** 🔑 COLE AQUI */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ====== DOM ====== */
const $ = (id) => document.getElementById(id);

/** ====== Tabs ====== */
const tabChamada = $("tabChamada");
const tabParticipantes = $("tabParticipantes");
const viewChamada = $("viewChamada");
const viewParticipantes = $("viewParticipantes");

/** ====== CHAMADA UI ====== */
const elStatusPill = $("statusPill");
const elStatusText = $("statusText");
const elMsgTopo = $("msgTopo");
const elMsgErro = $("msgErro");
const elData = $("dataChamada");
const btnVerificar = $("btnVerificar");
const btnSalvar = $("btnSalvar");

const listaDirigentes = $("listaDirigentes");
const listaIncorporacao = $("listaIncorporacao");
const listaDesenvolvimento = $("listaDesenvolvimento");
const listaCarencia = $("listaCarencia");

const elResumoGeral = $("resumoGeral");
const elReservasMesa = $("reservasMesa");

/** ====== Cabeçalho “Próximos para a mesa” (próxima reunião) ====== */
const elNextMesaDirigenteName = $("nextMesaDirigenteName");
const elNextPsicoDirigenteName = $("nextPsicoDirigenteName");
const elNextMesaIncorpName = $("nextMesaIncorpName");
const elNextMesaDesenvName = $("nextMesaDesenvName");

/** ====== PARTICIPANTES UI ====== */
const partFiltroGrupo = $("partFiltroGrupo");
const partBusca = $("partBusca");
const btnRecarregarParticipantes = $("btnRecarregarParticipantes");
const listaParticipantes = $("listaParticipantes");
const novoNome = $("novoNome");
const novoGrupo = $("novoGrupo");
const novoAtivo = $("novoAtivo");
const novoMesa = $("novoMesa");
const novoPsico = $("novoPsico");
const btnAdicionarParticipante = $("btnAdicionarParticipante");
const partMsg = $("partMsg");
const partErr = $("partErr");

/** ====== Estado ====== */
let feriadosSet = new Set();
let mediumsAll = [];
let chamadasMap = new Map();

// rotação global (tabela rotacao)
let rotacao = {
  mesa_dirigente: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null,
  psicografia_dirigente: null,
};

// rotação “base” no início da chamada (para avançar corretamente no Salvar)
let rotacaoStart = null;

let nextMesaDirigenteId = null;
let nextMesaIncorpId = null;
let nextMesaDesenvId = null;
let nextPsicoDirigenteId = null;

let currentDateISO = null;

/** ====== UI utils ====== */
function setOk(msg = "") {
  if (elMsgTopo) elMsgTopo.textContent = msg;
  if (elMsgErro) elMsgErro.textContent = "";
}
function setErro(msg = "") {
  if (elMsgErro) elMsgErro.textContent = msg;
}
function setConn(ok, msg) {
  if (!elStatusPill || !elStatusText) return;
  elStatusPill.classList.toggle("ok", !!ok);
  elStatusPill.classList.toggle("bad", !ok);
  elStatusText.textContent = msg || (ok ? "Supabase OK" : "Sem conexão");
}
function pOk(msg = "") {
  if (partMsg) partMsg.textContent = msg;
  if (partErr) partErr.textContent = "";
}
function pErr(msg = "") {
  if (partErr) partErr.textContent = msg;
  if (partMsg) partMsg.textContent = "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function parseBRtoISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((br || "").trim());
  if (!m) return null;
  const dd = +m[1],
    mm = +m[2],
    yy = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}
function isTuesday(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.getDay() === 2;
}
function formatISOtoBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** ====== Supabase REST ====== */
function headersJson() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headersJson() });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}
async function sbPost(table, rows, prefer = "return=minimal") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headersJson(), Prefer: prefer },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  try {
    return await r.json();
  } catch {
    return [];
  }
}
async function sbPatch(table, whereQS, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${whereQS}`, {
    method: "PATCH",
    headers: { ...headersJson(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
}
async function sbDelete(table, whereQS) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${whereQS}`, {
    method: "DELETE",
    headers: { ...headersJson(), Prefer: "return=minimal" },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
}
async function sbUpsertChamadas(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/chamadas?on_conflict=medium_id,data`, {
    method: "POST",
    headers: { ...headersJson(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
}
async function sbPatchRotacao(group_type, last_medium_id) {
  const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.${encodeURIComponent(group_type)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...headersJson(), Prefer: "return=minimal" },
    body: JSON.stringify({ last_medium_id, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  rotacao[group_type] = last_medium_id || null;
}

/** ====== Loads ====== */
async function loadBase() {
  const fer = await sbGet(`feriados?select=data`);
  feriadosSet = new Set(fer.map((x) => x.data));

  mediumsAll = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );

  const rot = await sbGet(`rotacao?select=group_type,last_medium_id`);
  rotacao = {
    mesa_dirigente: null,
    mesa_incorporacao: null,
    mesa_desenvolvimento: null,
    psicografia_dirigente: null,
  };
  for (const r of rot) {
    if (rotacao.hasOwnProperty(r.group_type)) rotacao[r.group_type] = r.last_medium_id || null;
  }

  renderProximosHeader();
}

async function loadChamadasForDate(iso) {
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  chamadasMap = new Map(rows.map((r) => [r.medium_id, (r.status || "").toUpperCase()]));
}

/** ====== Regras de elegibilidade (para rotação) ====== */
function sortByName(a, b) {
  return (a.name || "").localeCompare(b.name || "", "pt-BR");
}
function eligibleMesa(group_type) {
  return mediumsAll
    .filter((m) => m.active === true && m.group_type === group_type && Number(m.mesa) === 1)
    .sort(sortByName);
}
function eligiblePsicoDirigente() {
  return mediumsAll
    .filter((m) => m.active === true && m.group_type === "dirigente" && Number(m.psicografia) === 1)
    .sort(sortByName);
}
function eligibleAllByGroup(group_type) {
  return mediumsAll.filter((m) => m.active === true && m.group_type === group_type).sort(sortByName);
}

function computeNext(list, lastId) {
  if (!list || list.length === 0) return null;
  const idx = list.findIndex((x) => x.id === lastId);
  if (idx === -1) return list[0].id;
  return list[(idx + 1) % list.length].id;
}
function computeNextSkip(list, lastId, skipId) {
  if (!list || list.length === 0) return null;
  let candidate = computeNext(list, lastId);
  if (!skipId) return candidate;

  // evita loop infinito se lista tem 1 item
  let guard = 0;
  while (candidate === skipId && guard < list.length + 2) {
    candidate = computeNext(list, candidate);
    guard++;
  }
  return candidate;
}

// avança N passos e retorna novo lastId (o último que “sentou”)
function advanceLastId(list, lastId, steps) {
  if (!steps || steps <= 0) return lastId || null;
  if (!list || list.length === 0) return lastId || null;

  let cur = lastId || null;
  for (let i = 0; i < steps; i++) {
    cur = computeNext(list, cur);
  }
  return cur;
}

function findNameById(id) {
  if (!id) return "—";
  const m = mediumsAll.find((x) => x.id === id);
  return m?.name || "—";
}

/** ====== Próximos (para a próxima reunião) ====== */
function renderProximosHeader() {
  const dirMesaList = eligibleMesa("dirigente");
  const incMesaList = eligibleMesa("incorporacao");
  const desMesaList = eligibleMesa("desenvolvimento");
  const psList = eligiblePsicoDirigente();

  const nextDirMesaId = computeNext(dirMesaList, rotacao.mesa_dirigente);
  const nextIncMesaId = computeNext(incMesaList, rotacao.mesa_incorporacao);
  const nextDesMesaId = computeNext(desMesaList, rotacao.mesa_desenvolvimento);

  // psico não pode cair no mesmo dirigente que vai para a mesa
  const nextPsicoId = computeNextSkip(psList, rotacao.psicografia_dirigente, nextDirMesaId);

  if (elNextMesaDirigenteName) elNextMesaDirigenteName.textContent = findNameById(nextDirMesaId);
  if (elNextMesaIncorpName) elNextMesaIncorpName.textContent = findNameById(nextIncMesaId);
  if (elNextMesaDesenvName) elNextMesaDesenvName.textContent = findNameById(nextDesMesaId);
  if (elNextPsicoDirigenteName) elNextPsicoDirigenteName.textContent = findNameById(nextPsicoId);
}

/** ====== Marcadores amarelo/vermelho na chamada (somente 1 por fila) ====== */
function recomputeRotationBadges() {
  const dirMesaList = eligibleMesa("dirigente");
  const incMesaList = eligibleMesa("incorporacao");
  const desMesaList = eligibleMesa("desenvolvimento");
  const psList = eligiblePsicoDirigente();

  nextMesaDirigenteId = computeNext(dirMesaList, rotacao.mesa_dirigente);
  nextMesaIncorpId = computeNext(incMesaList, rotacao.mesa_incorporacao);
  nextMesaDesenvId = computeNext(desMesaList, rotacao.mesa_desenvolvimento);

  nextPsicoDirigenteId = computeNextSkip(psList, rotacao.psicografia_dirigente, nextMesaDirigenteId);
}

/** ====== Render CHAMADA ====== */
function buildStatusOptions(m) {
  const opts = [];

  // Sempre pode Presente/Falta
  opts.push("P");
  opts.push("F");

  // Mesa (somente se mesa=1 e não for carência)
  if (Number(m.mesa) === 1 && (m.group_type === "dirigente" || m.group_type === "incorporacao" || m.group_type === "desenvolvimento")) {
    opts.splice(1, 0, "M"); // fica P, M, F (mais bonito)
  }

  // Psicografia (somente dirigente com psicografia=1)
  if (m.group_type === "dirigente" && Number(m.psicografia) === 1) {
    opts.push("PS");
  }

  return opts;
}

function makeRowChamada(m) {
  const current = (chamadasMap.get(m.id) || "").toUpperCase();

  const wrap = document.createElement("div");
  wrap.className = "itemRow";

  // amarelo nos 3 grupos, vermelho só em dirigente
  if (m.group_type === "dirigente") {
    if (m.id === nextMesaDirigenteId) wrap.classList.add("nextMesa");
    if (m.id === nextPsicoDirigenteId) wrap.classList.add("nextPsico");
  }
  if (m.group_type === "incorporacao" && m.id === nextMesaIncorpId) wrap.classList.add("nextMesa");
  if (m.group_type === "desenvolvimento" && m.id === nextMesaDesenvId) wrap.classList.add("nextMesa");

  const left = document.createElement("div");
  left.className = "itemLeft";

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = m.name || "(sem nome)";

  const meta = document.createElement("div");
  meta.className = "itemMeta";
  const pres = Number(m.presencas || 0),
    falt = Number(m.faltas || 0);
  const denom = pres + falt;
  const presPct = denom ? Math.round((pres / denom) * 100) : 0;
  const faltPct = denom ? Math.round((falt / denom) * 100) : 0;
  meta.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  const badges = document.createElement("div");
  badges.className = "badges";

  if (m.group_type === "dirigente" && m.id === nextMesaDirigenteId) {
    const b = document.createElement("span");
    b.className = "badge badgeMesa";
    b.textContent = "Mesa (próximo dirigente)";
    badges.appendChild(b);
  }
  if (m.group_type === "incorporacao" && m.id === nextMesaIncorpId) {
    const b = document.createElement("span");
    b.className = "badge badgeMesa";
    b.textContent = "Mesa (próximo incorp.)";
    badges.appendChild(b);
  }
  if (m.group_type === "desenvolvimento" && m.id === nextMesaDesenvId) {
    const b = document.createElement("span");
    b.className = "badge badgeMesa";
    b.textContent = "Mesa (próximo desenv.)";
    badges.appendChild(b);
  }
  if (m.group_type === "dirigente" && m.id === nextPsicoDirigenteId) {
    const b = document.createElement("span");
    b.className = "badge badgePsico";
    b.textContent = "Psicografia (próximo)";
    badges.appendChild(b);
  }

  left.appendChild(title);
  left.appendChild(meta);
  left.appendChild(badges);

  const right = document.createElement("div");
  right.className = "itemRight";

  const radios = document.createElement("div");
  radios.className = "radioGroup";

  for (const s of buildStatusOptions(m)) {
    const id = `r_${m.id}_${s}`;

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;
    inp.id = id;
    inp.value = s;
    inp.checked = current === s;

    const lbl = document.createElement("label");
    lbl.className = "radioLbl";
    lbl.setAttribute("for", id);

    const dot = document.createElement("span");
    dot.className = "dot";
    const txt = document.createElement("span");
    txt.className = "radioTxt";
    txt.textContent = s;

    lbl.appendChild(dot);
    lbl.appendChild(txt);

    // Salvamento por clique (não mexe em rotação/counters aqui)
    inp.addEventListener("change", async () => {
      if (!currentDateISO) return setErro("Selecione a data e verifique.");
      const val = String(inp.value || "").toUpperCase();

      chamadasMap.set(m.id, val);
      renderResumo();

      try {
        await sbUpsertChamadas([{ medium_id: m.id, data: currentDateISO, status: val }]);
        setOk("Salvo.");
      } catch (e) {
        setErro("Erro ao salvar: " + e.message);
      }
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  const btn = document.createElement("button");
  btn.className = "btnSmall";
  btn.textContent = "Limpar";
  btn.addEventListener("click", async () => {
    if (!currentDateISO) return setErro("Selecione a data e verifique.");
    try {
      // remove do banco (não grava status vazio para não estourar CHECK)
      await sbDelete("chamadas", `data=eq.${currentDateISO}&medium_id=eq.${m.id}`);
      chamadasMap.delete(m.id);
      renderChamada();
      setOk("Limpo.");
    } catch (e) {
      setErro("Erro ao limpar: " + e.message);
    }
  });

  right.appendChild(radios);
  right.appendChild(btn);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function clearChamadaLists() {
  if (listaDirigentes) listaDirigentes.innerHTML = "";
  if (listaIncorporacao) listaIncorporacao.innerHTML = "";
  if (listaDesenvolvimento) listaDesenvolvimento.innerHTML = "";
  if (listaCarencia) listaCarencia.innerHTML = "";
}

function renderChamada() {
  clearChamadaLists();
  recomputeRotationBadges();

  const grupos = {
    dirigente: listaDirigentes,
    incorporacao: listaIncorporacao,
    desenvolvimento: listaDesenvolvimento,
    carencia: listaCarencia,
  };

  const activeOnly = mediumsAll.filter((m) => m.active === true);
  for (const m of activeOnly) {
    const target = grupos[m.group_type];
    if (!target) continue;
    target.appendChild(makeRowChamada(m));
  }

  renderResumo();
}

function renderResumo() {
  let p = 0,
    mm = 0,
    f = 0,
    ps = 0;
  const reservas = [];

  const activeOnly = mediumsAll.filter((m) => m.active === true);

  for (const med of activeOnly) {
    const st = (chamadasMap.get(med.id) || "").toUpperCase();
    if (st === "P") p++;
    if (st === "M") {
      mm++;
      reservas.push(med.name);
    }
    if (st === "F") f++;
    if (st === "PS") ps++;
  }

  const total = p + mm + f + ps;
  const presPct = total ? Math.round(((p + mm + ps) / total) * 100) : 0; // PS conta como presença
  const faltPct = total ? Math.round((f / total) * 100) : 0;

  if (elResumoGeral) elResumoGeral.textContent = `P:${p} M:${mm} F:${f} PS:${ps} | Presença:${presPct}% | Faltas:${faltPct}%`;
  if (elReservasMesa) elReservasMesa.textContent = reservas.length ? reservas.join(", ") : "—";
}

/** ====== Contadores (presencas/faltas) - recalcula 100% (mais confiável) ====== */
async function recomputeCountersFromChamadas() {
  // Busca todas as chamadas (se volume for pequeno, funciona muito bem)
  // Se você tiver MUITAS linhas, podemos otimizar depois.
  const rows = await sbGet(`chamadas?select=medium_id,status&status=in.(P,M,F,PS)`);
  const counts = new Map(); // id -> {pres,falt}

  for (const r of rows) {
    const id = r.medium_id;
    const st = String(r.status || "").toUpperCase();
    if (!counts.has(id)) counts.set(id, { pres: 0, falt: 0 });
    const c = counts.get(id);
    if (st === "F") c.falt++;
    if (st === "P" || st === "M" || st === "PS") c.pres++;
  }

  // Atualiza somente quando muda (evita PATCH desnecessário)
  for (const m of mediumsAll) {
    const c = counts.get(m.id) || { pres: 0, falt: 0 };
    const oldPres = Number(m.presencas || 0);
    const oldFalt = Number(m.faltas || 0);
    if (oldPres === c.pres && oldFalt === c.falt) continue;

    await sbPatch("mediums", `id=eq.${m.id}`, {
      presencas: c.pres,
      faltas: c.falt,
      updated_at: new Date().toISOString(),
    });

    m.presencas = c.pres;
    m.faltas = c.falt;
  }
}

/** ====== Verificar data / salvar tudo ====== */
async function onVerificar() {
  setErro("");
  const val = elData?.value || "";

  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) iso = val;
  else iso = parseBRtoISO(val);

  if (!iso) return setErro("Data inválida.");
  if (!isTuesday(iso)) return setErro("Essa data não é terça-feira.");
  if (feriadosSet.has(iso)) return setErro("Essa data está marcada como feriado.");

  currentDateISO = iso;
  rotacaoStart = deepCopy(rotacao); // base do dia (importantíssimo)

  setOk(`Data válida: ${formatISOtoBR(iso)}.`);

  await loadChamadasForDate(iso);
  renderChamada();
}

async function onSalvarTudo() {
  if (!currentDateISO) return setErro("Selecione uma data e clique em Verificar data.");

  try {
    // 1) Recria a chamada do dia (limpa e insere só o que está marcado)
    await sbDelete("chamadas", `data=eq.${currentDateISO}`);

    const rows = [];
    for (const m of mediumsAll.filter((x) => x.active)) {
      const st = (chamadasMap.get(m.id) || "").toUpperCase();
      if (st === "P" || st === "M" || st === "F" || st === "PS") {
        rows.push({ medium_id: m.id, data: currentDateISO, status: st });
      }
    }
    if (rows.length) await sbPost("chamadas", rows, "return=minimal");

    // 2) Avança rotação (somente a partir do estado do início da chamada)
    const base = rotacaoStart || deepCopy(rotacao);

    const dirMesaList = eligibleMesa("dirigente");
    const incMesaList = eligibleMesa("incorporacao");
    const desMesaList = eligibleMesa("desenvolvimento");
    const psList = eligiblePsicoDirigente();

    const active = mediumsAll.filter((x) => x.active === true);

    const countMesaDir = active.filter(
      (m) => m.group_type === "dirigente" && Number(m.mesa) === 1 && (chamadasMap.get(m.id) || "").toUpperCase() === "M"
    ).length;
    const countMesaInc = active.filter(
      (m) => m.group_type === "incorporacao" && Number(m.mesa) === 1 && (chamadasMap.get(m.id) || "").toUpperCase() === "M"
    ).length;
    const countMesaDes = active.filter(
      (m) => m.group_type === "desenvolvimento" && Number(m.mesa) === 1 && (chamadasMap.get(m.id) || "").toUpperCase() === "M"
    ).length;
    const countPsico = active.filter(
      (m) => m.group_type === "dirigente" && Number(m.psicografia) === 1 && (chamadasMap.get(m.id) || "").toUpperCase() === "PS"
    ).length;

    const newLastMesaDir = advanceLastId(dirMesaList, base.mesa_dirigente, countMesaDir);
    const newLastMesaInc = advanceLastId(incMesaList, base.mesa_incorporacao, countMesaInc);
    const newLastMesaDes = advanceLastId(desMesaList, base.mesa_desenvolvimento, countMesaDes);
    const newLastPsico = advanceLastId(psList, base.psicografia_dirigente, countPsico);

    if (countMesaDir > 0) await sbPatchRotacao("mesa_dirigente", newLastMesaDir);
    if (countMesaInc > 0) await sbPatchRotacao("mesa_incorporacao", newLastMesaInc);
    if (countMesaDes > 0) await sbPatchRotacao("mesa_desenvolvimento", newLastMesaDes);
    if (countPsico > 0) await sbPatchRotacao("psicografia_dirigente", newLastPsico);

    // 3) Recalcula presenças/faltas (super confiável)
    await recomputeCountersFromChamadas();

    // 4) Atualiza “Próximos” + marcadores com a rotação nova
    rotacaoStart = null;
    renderProximosHeader();
    renderChamada();

    setOk("Chamada salva. Próximos para a próxima reunião atualizados.");
  } catch (e) {
    setErro("Erro ao salvar chamada: " + e.message);
  }
}

/** ====== PARTICIPANTES (CRUD) ====== */
function groupLabel(gt) {
  if (gt === "dirigente") return "Dirigente";
  if (gt === "incorporacao") return "Incorporação";
  if (gt === "desenvolvimento") return "Desenvolvimento";
  if (gt === "carencia") return "Carência";
  return gt || "—";
}

function matchesFilter(m) {
  const g = (partFiltroGrupo?.value || "").trim();
  const q = (partBusca?.value || "").trim().toLowerCase();
  if (g && m.group_type !== g) return false;
  if (q && !(m.name || "").toLowerCase().includes(q)) return false;
  return true;
}

function makeRowParticipante(m) {
  const wrap = document.createElement("div");
  wrap.className = "partRow";

  const left = document.createElement("div");
  left.className = "partLeft";

  const title = document.createElement("div");
  title.className = "partName";
  title.textContent = m.name || "(sem nome)";

  const meta = document.createElement("div");
  meta.className = "partMeta";
  meta.textContent = `${groupLabel(m.group_type)} • ${m.active ? "Ativo" : "Inativo"} • Mesa:${Number(m.mesa) === 1 ? "Sim" : "Não"} • Psicografia:${
    Number(m.psicografia) === 1 ? "Sim" : "Não"
  }`;

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "partRight";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btnSmall";
  btnEdit.textContent = "Editar";
  btnEdit.addEventListener("click", () => openEditor(m));

  const btnDel = document.createElement("button");
  btnDel.className = "btnSmall danger";
  btnDel.textContent = "Excluir";
  btnDel.addEventListener("click", async () => {
    if (!confirm(`Excluir "${m.name}"?`)) return;
    try {
      await sbDelete("mediums", `id=eq.${m.id}`);
      pOk("Excluído.");
      await reloadParticipants();
      await loadBase();
      if (currentDateISO) await loadChamadasForDate(currentDateISO);
      renderChamada();
    } catch (e) {
      pErr("Erro ao excluir: " + e.message);
    }
  });

  right.appendChild(btnEdit);
  right.appendChild(btnDel);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function renderParticipants() {
  if (!listaParticipantes) return;
  listaParticipantes.innerHTML = "";
  const filtered = mediumsAll.filter(matchesFilter);
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhum participante encontrado.";
    listaParticipantes.appendChild(empty);
    return;
  }
  for (const m of filtered) listaParticipantes.appendChild(makeRowParticipante(m));
}

async function reloadParticipants() {
  mediumsAll = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );
  renderParticipants();
  renderProximosHeader();
}

function openEditor(m) {
  const modal = document.createElement("div");
  modal.className = "modalBackdrop";
  const box = document.createElement("div");
  box.className = "modalBox";

  box.innerHTML = `
    <div class="modalTitle">Editar participante</div>
    <div class="grid2">
      <div>
        <label class="label">Nome</label>
        <input id="edNome" class="input" value="${(m.name || "").replace(/"/g, "&quot;")}" />
      </div>
      <div>
        <label class="label">Grupo</label>
        <select id="edGrupo" class="input">
          <option value="dirigente">Dirigente</option>
          <option value="incorporacao">Incorporação</option>
          <option value="desenvolvimento">Desenvolvimento</option>
          <option value="carencia">Carência</option>
        </select>
      </div>
    </div>

    <div class="checks" style="margin-top:10px;">
      <label class="check"><input id="edAtivo" type="checkbox" /> <span>Ativo</span></label>
      <label class="check"><input id="edMesa" type="checkbox" /> <span>Pode sentar na mesa</span></label>
      <label class="check"><input id="edPsico" type="checkbox" /> <span>Pode psicografar</span></label>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button id="btnSalvarEd" class="btn primary" type="button">Salvar</button>
      <button id="btnCancelarEd" class="btn" type="button">Cancelar</button>
    </div>
    <div id="edErr" class="msgErr"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const edNome = box.querySelector("#edNome");
  const edGrupo = box.querySelector("#edGrupo");
  const edAtivo = box.querySelector("#edAtivo");
  const edMesa = box.querySelector("#edMesa");
  const edPsico = box.querySelector("#edPsico");
  const edErr = box.querySelector("#edErr");

  edGrupo.value = m.group_type || "incorporacao";
  edAtivo.checked = !!m.active;
  edMesa.checked = Number(m.mesa) === 1;
  edPsico.checked = Number(m.psicografia) === 1;

  box.querySelector("#btnCancelarEd").addEventListener("click", () => modal.remove());

  box.querySelector("#btnSalvarEd").addEventListener("click", async () => {
    edErr.textContent = "";
    const name = (edNome.value || "").trim();
    const group_type = edGrupo.value;
    if (!name) {
      edErr.textContent = "Nome é obrigatório.";
      return;
    }

    try {
      await sbPatch("mediums", `id=eq.${m.id}`, {
        name,
        group_type,
        active: !!edAtivo.checked,
        mesa: edMesa.checked ? 1 : 0,
        psicografia: edPsico.checked ? 1 : 0,
        updated_at: new Date().toISOString(),
      });

      pOk("Atualizado.");
      modal.remove();

      await loadBase();
      await reloadParticipants();
      if (currentDateISO) await loadChamadasForDate(currentDateISO);
      renderChamada();
    } catch (e) {
      edErr.textContent = "Erro ao salvar: " + e.message;
    }
  });
}

async function onAdicionarParticipante() {
  pOk("");
  pErr("");

  const name = (novoNome?.value || "").trim();
  const group_type = novoGrupo?.value || "incorporacao";
  const active = !!novoAtivo?.checked;

  if (!name) return pErr("Informe o nome.");

  const payload = {
    name,
    group_type,
    active,
    faltas: 0,
    presencas: 0,
    mesa: novoMesa?.checked ? 1 : 0,
    psicografia: novoPsico?.checked ? 1 : 0,
    carencia_total: 0,
    carencia_atual: 0,
    primeira_incorporacao: false,
    inserted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await sbPost("mediums", [payload], "return=minimal");
    pOk("Participante adicionado.");

    if (novoNome) novoNome.value = "";
    if (novoMesa) novoMesa.checked = false;
    if (novoPsico) novoPsico.checked = false;
    if (novoAtivo) novoAtivo.checked = true;

    await loadBase();
    await reloadParticipants();
    if (currentDateISO) await loadChamadasForDate(currentDateISO);
    renderChamada();
  } catch (e) {
    pErr("Erro ao adicionar: " + e.message);
  }
}

/** ====== Tabs ====== */
function showTab(which) {
  if (!viewChamada || !viewParticipantes || !tabChamada || !tabParticipantes) return;
  const isChamada = which === "chamada";
  viewChamada.style.display = isChamada ? "" : "none";
  viewParticipantes.style.display = isChamada ? "none" : "";
  tabChamada.classList.toggle("active", isChamada);
  tabParticipantes.classList.toggle("active", !isChamada);
  if (!isChamada) renderParticipants();
}

/** ====== Boot ====== */
(async function init() {
  try {
    setConn(false, "Conectando...");
    await loadBase();
    setConn(true, "Supabase OK");
    setOk("Selecione a data e clique em “Verificar data”.");
    renderParticipants();
  } catch (e) {
    setConn(false, "Erro");
    setErro("Falha ao conectar: " + e.message);
    pErr("Falha ao conectar: " + e.message);
  }

  btnVerificar?.addEventListener("click", onVerificar);
  btnSalvar?.addEventListener("click", onSalvarTudo);

  tabChamada?.addEventListener("click", () => showTab("chamada"));
  tabParticipantes?.addEventListener("click", () => showTab("participantes"));

  btnRecarregarParticipantes?.addEventListener("click", async () => {
    try {
      pOk("Recarregando...");
      await reloadParticipants();
      pOk("Ok.");
    } catch (e) {
      pErr("Erro: " + e.message);
    }
  });

  partFiltroGrupo?.addEventListener("change", renderParticipants);
  partBusca?.addEventListener("input", renderParticipants);
  btnAdicionarParticipante?.addEventListener("click", onAdicionarParticipante);
})();
