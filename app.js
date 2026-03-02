/* ============================================================
   CHAMADA DE MEDIUNS - app.js
   Versao: 2026-01-21-a
   Destaques:
   - Ordem de fila por (ordem_grupo, sort_order, name)
   - Destaque visual: amarelo (próximo mesa) / vermelho (próximo psicografia)
   - Botão: Imprimir próxima chamada (próxima terça-feira)
   - Participantes: botão "X" para desativar (remover do front) sem quebrar histórico
   ============================================================ */

console.log("APP.JS Carregado");

/* ===========================
   SUPABASE REST CONFIG
=========================== */
// IMPORTANTE: você define isso em config.js (ou via window) no seu deploy
const SUPABASE_URL = 'https://nouzzyrevykdmnqifjjt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc';


/* ===========================
   REST HELPERS (PostgREST)
=========================== */
async function httpGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `GET ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPost(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `POST ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPatch(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `PATCH ${path} failed`);
  return text ? JSON.parse(text) : [];
}

/* ===========================
   DOM
=========================== */
const $statusPill = document.getElementById("statusPill");
const $statusText = document.getElementById("statusText");
const $msgTopo = document.getElementById("msgTopo");
const $msgErro = document.getElementById("msgErro");

const $dataChamada = document.getElementById("dataChamada");
const $btnVerificar = document.getElementById("btnVerificar");
const $btnSalvar = document.getElementById("btnSalvar");
const $btnImprimirProxima = document.getElementById("btnImprimirProxima");

const $nextMesaDirigenteName = document.getElementById("nextMesaDirigenteName");
const $nextPsicoDirigenteName = document.getElementById("nextPsicoDirigenteName");
const $nextMesaIncorpName = document.getElementById("nextMesaIncorpName");
const $nextMesaDesenvName = document.getElementById("nextMesaDesenvName");

const $listaDirigentes = document.getElementById("listaDirigentes");
const $listaIncorporacao = document.getElementById("listaIncorporacao");
const $listaDesenvolvimento = document.getElementById("listaDesenvolvimento");
const $listaCarencia = document.getElementById("listaCarencia");

const $tabChamada = document.getElementById("tabChamada");
const $tabParticipantes = document.getElementById("tabParticipantes");
const $viewChamada = document.getElementById("viewChamada");
const $viewParticipantes = document.getElementById("viewParticipantes");

const $partFiltroGrupo = document.getElementById("partFiltroGrupo");
const $partBusca = document.getElementById("partBusca");
const $btnRecarregarParticipantes = document.getElementById("btnRecarregarParticipantes");
const $partMsg = document.getElementById("partMsg");
const $partErr = document.getElementById("partErr");
const $listaParticipantes = document.getElementById("listaParticipantes");

const $novoNome = document.getElementById("novoNome");
const $novoGrupo = document.getElementById("novoGrupo");
const $novoAtivo = document.getElementById("novoAtivo");
const $novoMesa = document.getElementById("novoMesa");
const $novoPsico = document.getElementById("novoPsico");
const $btnAdicionarParticipante = document.getElementById("btnAdicionarParticipante");

/* ===========================
   STATE
=========================== */
let mediumsAll = [];
let chamadasDia = []; // rows da tabela chamadas do dia
let currentISO = null;

// Tabela rotacao (agora em MODO MANUAL):
// rotacao.last_medium_id = PRÓXIMO (não "último")
let rotacao = {
  mesa_desenvolvimento: null,
  mesa_dirigente: null,
  mesa_incorporacao: null,
  psicografia: null
};

// alvo atual (mesma coisa, só pra UI)
let nextTargets = {
  mesa_dirigente: null,
  psicografia: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null
};

/* ===========================
   UI HELPERS
=========================== */
function setOk(msg) {
  $msgErro.textContent = "";
  $msgTopo.textContent = msg || "";
}
function setErr(msg) {
  $msgTopo.textContent = "";
  $msgErro.textContent = msg || "";
}
function setConn(ok, txt) {
  $statusPill.classList.toggle("ok", !!ok);
  $statusPill.classList.toggle("err", !ok);
  $statusText.textContent = txt || (ok ? "Conectado" : "Erro na conexão");
}

function isoTodayLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function nextTuesdayISO(fromISO) {
  const [y, m, d] = fromISO.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const day = base.getDay(); // 0 dom ... 2 ter
  const target = 2;
  let add = (target - day + 7) % 7;
  if (add === 0) add = 7;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + add);
  const off = next.getTimezoneOffset();
  const local = new Date(next.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function nameById(id) {
  return (mediumsAll.find((m) => m.id === id)?.name) || "—";
}

function isActive(m) {
  return m && m.active === true;
}

function groupLabel(gt) {
  if (gt === "dirigente") return "Dirigente";
  if (gt === "incorporacao") return "Incorporação";
  if (gt === "desenvolvimento") return "Desenvolvimento";
  if (gt === "carencia") return "Carência";
  return gt || "—";
}

/* ===========================
   LOADERS
=========================== */
async function loadMediums() {
  // mantém o que já estava: pega campos que você já usa
  const data = await httpGet("mediums?select=id,name,group_type,active,sort_order,ordem_grupo,pode_mesa,pode_psicografar&order=group_type.asc,sort_order.asc,ordem_grupo.asc,name.asc");
  mediumsAll = data || [];
}

async function loadRotacao() {
  const data = await httpGet("rotacao?select=group_type,last_medium_id");
  // reset
  rotacao = {
    mesa_desenvolvimento: null,
    mesa_dirigente: null,
    mesa_incorporacao: null,
    psicografia: null
  };
  for (const r of data || []) {
    rotacao[r.group_type] = r.last_medium_id || null;
  }
  nextTargets = computeTargetsFromRotacao();
}

async function loadChamadasForDate(iso) {
  const rows = await httpGet(`chamadas?select=medium_id,status,data&data=eq.${iso}`);
  chamadasDia = rows || [];
}

/* ===========================
   MODO MANUAL: targets da próxima
=========================== */
function computeTargetsFromRotacao() {
  // MODO MANUAL:
  // A tabela rotacao.last_medium_id passa a significar "PRÓXIMO" (e não "último").
  // Assim, quem você marcar como próximo já aparece direto aqui e nas marcações amarelas/vermelhas.
  return {
    mesa_dirigente: rotacao?.mesa_dirigente || null,
    psicografia: rotacao?.psicografia || null,
    mesa_incorporacao: rotacao?.mesa_incorporacao || null,
    mesa_desenvolvimento: rotacao?.mesa_desenvolvimento || null
  };
}

async function setNextManual(roleKey, mediumId) {
  try {
    if (!roleKey || !mediumId) return;

    // grava direto em rotacao (sem automação)
    await httpPatch(`rotacao?group_type=eq.${roleKey}`, { last_medium_id: mediumId });

    // atualiza estado local
    rotacao[roleKey] = mediumId;

    nextTargets = computeTargetsFromRotacao();
    renderProximos();
    renderChamada();

    const nome = nameById(mediumId);
    setOk(`Próximo definido: ${roleKey} → ${nome}`);
  } catch (e) {
    console.error(e);
    setErr(`Erro ao definir próximo: ${e.message}`);
  }
}

/* ===========================
   CHAMADA HELPERS
=========================== */
function getStatusFor(mediumId) {
  const r = chamadasDia.find((x) => x.medium_id === mediumId);
  return (r?.status || "").toUpperCase();
}

function setStatusFor(mediumId, status) {
  status = (status || "").toUpperCase();
  const idx = chamadasDia.findIndex((x) => x.medium_id === mediumId);
  if (idx >= 0) {
    chamadasDia[idx].status = status;
  } else {
    chamadasDia.push({ data: currentISO, medium_id: mediumId, status });
  }
}

function canMesa(m) {
  // se seu banco usa "pode_mesa" / "pode_psicografar"
  if (m.group_type === "dirigente") return true; // dirigente pode ter M e PS, a UI já controla
  return m.pode_mesa === true || m.pode_mesa === 1 || m.pode_mesa === "true";
}

function canPsico(m) {
  return m.pode_psicografar === true || m.pode_psicografar === 1 || m.pode_psicografar === "true";
}

function makeRow(m) {
  const row = document.createElement("div");
  row.className = "row";

  // left
  const left = document.createElement("div");
  left.className = "name";

  const t = document.createElement("div");
  t.className = "title";
  t.textContent = m.name || "—";

  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = groupLabel(m.group_type);

  left.appendChild(t);
  left.appendChild(sub);

  // right
  const right = document.createElement("div");
  right.className = "badges";

  const st = getStatusFor(m.id);

  // destaque manual do "próximo"
  const isNextMesa =
    (m.id === nextTargets.mesa_dirigente && m.group_type === "dirigente") ||
    (m.id === nextTargets.mesa_incorporacao && m.group_type === "incorporacao") ||
    (m.id === nextTargets.mesa_desenvolvimento && m.group_type === "desenvolvimento");

  const isNextPsico = (m.id === nextTargets.psicografia && m.group_type === "dirigente");

  if (isNextMesa) row.classList.add("nextMesa");
  if (isNextPsico) row.classList.add("nextPsico");

  // radios
  const radios = document.createElement("div");
  radios.className = "radioGroup";

  // ====== MODO MANUAL: definir PRÓXIMOS (grava na tabela rotacao) ======
  const nextBtns = document.createElement("div");
  nextBtns.className = "nextBtns";

  function mkNextBtn(label, roleKey) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btnNext";
    b.textContent = label;
    b.onclick = (ev) => {
      ev.stopPropagation();
      setNextManual(roleKey, m.id);
    };
    return b;
  }

  if (m.group_type === "dirigente") {
    nextBtns.appendChild(mkNextBtn("Próx Mesa", "mesa_dirigente"));
    nextBtns.appendChild(mkNextBtn("Próx PS", "psicografia"));
  } else if (m.group_type === "incorporacao") {
    nextBtns.appendChild(mkNextBtn("Próx Mesa", "mesa_incorporacao"));
  } else if (m.group_type === "desenvolvimento") {
    nextBtns.appendChild(mkNextBtn("Próx Mesa", "mesa_desenvolvimento"));
  }

  if (nextBtns.childNodes.length) right.appendChild(nextBtns);

  function mkRadio(label, val, enabled = true) {
    const w = document.createElement("label");
    w.className = "radioPill";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st-${m.id}`;
    inp.value = val;
    inp.checked = st === val;
    inp.disabled = !enabled;
    inp.onchange = () => {
      setStatusFor(m.id, val);
      renderResumo();
    };
    const span = document.createElement("span");
    span.textContent = label;
    w.appendChild(inp);
    w.appendChild(span);
    return w;
  }

  const canM = m.group_type === "dirigente" ? true : canMesa(m);
  const canPS = m.group_type === "dirigente" ? canPsico(m) : false;

  radios.appendChild(mkRadio("P", "P", true));
  radios.appendChild(mkRadio("F", "F", true));

  if (m.group_type === "dirigente") {
    radios.appendChild(mkRadio("M", "M", true));
    radios.appendChild(mkRadio("PS", "PS", canPS));
  } else {
    radios.appendChild(mkRadio("M", "M", canM));
  }

  right.appendChild(radios);

  row.appendChild(left);
  row.appendChild(right);

  return row;
}

/* ===========================
   RENDER CHAMADA
=========================== */
function renderProximos() {
  $nextMesaDirigenteName.textContent = nameById(nextTargets.mesa_dirigente);
  $nextPsicoDirigenteName.textContent = nameById(nextTargets.psicografia);
  $nextMesaIncorpName.textContent = nameById(nextTargets.mesa_incorporacao);
  $nextMesaDesenvName.textContent = nameById(nextTargets.mesa_desenvolvimento);
}

function renderResumo() {
  // mantém resumo simples (sem mexer no layout)
  const counts = { P: 0, F: 0, M: 0, PS: 0 };
  for (const r of chamadasDia) {
    const s = (r.status || "").toUpperCase();
    if (counts[s] != null) counts[s]++;
  }
  const total = counts.P + counts.F + counts.M + counts.PS;
  const pres = total ? Math.round(((counts.P + counts.M) / total) * 100) : 0;
  const falt = total ? Math.round((counts.F / total) * 100) : 0;

  const $resumoGeral = document.getElementById("resumoGeral");
  $resumoGeral.textContent = `P:${counts.P} M:${counts.M} F:${counts.F} PS:${counts.PS} | Presença:${pres}% | Faltas:${falt}%`;
}

function renderChamada() {
  renderProximos();
  renderResumo();

  const active = mediumsAll.filter(isActive);

  const dirigentes = active.filter((m) => m.group_type === "dirigente");
  const incorp = active.filter((m) => m.group_type === "incorporacao");
  const desenv = active.filter((m) => m.group_type === "desenvolvimento");
  const carencia = active.filter((m) => m.group_type === "carencia");

  // (ordem já vem do banco; se tiver sort_order/ordem_grupo)
  const sortFn = (a, b) => {
    const as = (a.sort_order ?? a.ordem_grupo ?? 999999);
    const bs = (b.sort_order ?? b.ordem_grupo ?? 999999);
    if (as !== bs) return as - bs;
    return (a.name || "").localeCompare(b.name || "");
  };

  dirigentes.sort(sortFn);
  incorp.sort(sortFn);
  desenv.sort(sortFn);
  carencia.sort(sortFn);

  $listaDirigentes.innerHTML = "";
  $listaIncorporacao.innerHTML = "";
  $listaDesenvolvimento.innerHTML = "";
  $listaCarencia.innerHTML = "";

  dirigentes.forEach((m) => $listaDirigentes.appendChild(makeRow(m)));
  incorp.forEach((m) => $listaIncorporacao.appendChild(makeRow(m)));
  desenv.forEach((m) => $listaDesenvolvimento.appendChild(makeRow(m)));
  carencia.forEach((m) => $listaCarencia.appendChild(makeRow(m)));
}

/* ===========================
   SAVE CHAMADA (SEM ROTACAO)
=========================== */
async function onSalvarTudo() {
  if (!currentISO) {
    setErr("Defina a data antes de salvar.");
    return;
  }
  try {
    setOk("Salvando...");

    // monta rows para upsert
    const rows = chamadasDia
      .filter((r) => r.medium_id && r.status)
      .map((r) => ({
        medium_id: r.medium_id,
        data: currentISO,
        status: (r.status || "").toUpperCase()
      }));

    if (rows.length) {
      await httpPost("chamadas", rows, "resolution=merge-duplicates,return=minimal");
    }

    // Modo manual: rotação NÃO é atualizada aqui.
    setOk("Chamada salva.");
  } catch (e) {
    console.error(e);
    setErr(`Erro ao salvar: ${e.message}`);
  }
}

/* ===========================
   PRINT NEXT (usa rotacao manual)
=========================== */
function buildPrintHTML(nextISO) {
  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:24px}
      h1{margin:0 0 4px 0}
      .sub{color:#444; margin-bottom:16px}
      table{border-collapse:collapse; width:100%}
      td,th{border:1px solid #ddd; padding:8px}
      th{text-align:left; background:#f5f5f5}
      .k{width:240px}
    </style>
  `;
  return `
    <html><head><meta charset="utf-8" />${style}</head>
    <body>
      <h1>Próxima Chamada</h1>
      <div class="sub">Data: <b>${nextISO}</b></div>

      <table>
        <thead><tr><th class="k">Função</th><th>Nome</th></tr></thead>
        <tbody>
          <tr><td>Dirigente (Mesa)</td><td>${nameById(nextTargets.mesa_dirigente)}</td></tr>
          <tr><td>Dirigente (Psicografia)</td><td>${nameById(nextTargets.psicografia)}</td></tr>
          <tr><td>Incorporação (Mesa)</td><td>${nameById(nextTargets.mesa_incorporacao)}</td></tr>
          <tr><td>Desenvolvimento (Mesa)</td><td>${nameById(nextTargets.mesa_desenvolvimento)}</td></tr>
        </tbody>
      </table>

      <script>window.onload=()=>window.print()</script>
    </body></html>
  `;
}

function onPrintNext() {
  const base = currentISO || isoTodayLocal();
  const nextISO = nextTuesdayISO(base);

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(buildPrintHTML(nextISO));
  w.document.close();
}

/* ===========================
   TABS
=========================== */
function showTab(which) {
  const isChamada = which === "chamada";
  $tabChamada.classList.toggle("active", isChamada);
  $tabParticipantes.classList.toggle("active", !isChamada);
  $viewChamada.style.display = isChamada ? "" : "none";
  $viewParticipantes.style.display = isChamada ? "none" : "";
}

/* ===========================
   PARTICIPANTES (mínimo)
=========================== */
function partSetOk(msg) {
  $partErr.textContent = "";
  $partMsg.textContent = msg || "";
}
function partSetErr(msg) {
  $partMsg.textContent = "";
  $partErr.textContent = msg || "";
}

function renderParticipantes() {
  const filtro = ($partFiltroGrupo.value || "").trim();
  const busca = ($partBusca.value || "").trim().toLowerCase();

  let list = [...mediumsAll];

  if (filtro) list = list.filter((m) => m.group_type === filtro);
  if (busca) list = list.filter((m) => (m.name || "").toLowerCase().includes(busca));

  list.sort((a, b) => (a.group_type || "").localeCompare(b.group_type || "") || (a.name || "").localeCompare(b.name || ""));

  $listaParticipantes.innerHTML = "";
  for (const m of list) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.className = "name";

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = m.name || "—";

    const s = document.createElement("div");
    s.className = "sub";
    s.textContent = `${groupLabel(m.group_type)} • ${m.active ? "ativo" : "inativo"}`;

    left.appendChild(t);
    left.appendChild(s);

    const right = document.createElement("div");
    right.className = "badges";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btnNext";
    btn.textContent = m.active ? "Desativar" : "Ativar";
    btn.onclick = async () => {
      try {
        await httpPatch(`mediums?id=eq.${m.id}`, { active: !m.active });
        m.active = !m.active;
        partSetOk("Atualizado.");
        renderParticipantes();
        renderChamada();
      } catch (e) {
        partSetErr(e.message);
      }
    };

    right.appendChild(btn);

    row.appendChild(left);
    row.appendChild(right);
    $listaParticipantes.appendChild(row);
  }
}

async function onAdicionarParticipante() {
  try {
    const name = ($novoNome.value || "").trim();
    const group_type = ($novoGrupo.value || "").trim();
    if (!name) {
      partSetErr("Informe um nome.");
      return;
    }

    const body = [{
      name,
      group_type,
      active: $novoAtivo.checked,
      pode_mesa: $novoMesa.checked,
      pode_psicografar: $novoPsico.checked
    }];

    await httpPost("mediums", body, "return=minimal");
    partSetOk("Participante adicionado.");

    await loadMediums();
    renderParticipantes();
    renderChamada();

    $novoNome.value = "";
    $novoMesa.checked = false;
    $novoPsico.checked = false;
    $novoAtivo.checked = true;
  } catch (e) {
    console.error(e);
    partSetErr(e.message);
  }
}

/* ===========================
   INIT
=========================== */
async function init() {
  try {
    setConn(false, "Conectando...");
    setOk("");
    setErr("");

    const today = isoTodayLocal();
    $dataChamada.value = today;
    currentISO = today;

    await loadMediums();
    await loadRotacao();
    await loadChamadasForDate(currentISO);

    setConn(true, "Conectado");
    renderChamada();

    // participants tab
    renderParticipantes();
  } catch (e) {
    console.error(e);
    setConn(false, "Erro na conexão");
    setErr(`Erro ao conectar no Supabase REST: ${e.message}`);
  }
}

/* ===========================
   EVENTS
=========================== */
$btnVerificar.addEventListener("click", async () => {
  try {
    const iso = $dataChamada.value;
    if (!iso) return;
    currentISO = iso;

    setOk("Carregando data...");
    await loadChamadasForDate(currentISO);
    await loadRotacao();

    setOk("Data carregada.");
    renderChamada();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao verificar data: ${e.message}`);
  }
});

$btnSalvar.addEventListener("click", onSalvarTudo);
$btnImprimirProxima.addEventListener("click", onPrintNext);

$tabChamada.addEventListener("click", () => showTab("chamada"));
$tabParticipantes.addEventListener("click", () => showTab("participantes"));

$btnRecarregarParticipantes.addEventListener("click", async () => {
  try {
    partSetOk("Recarregando...");
    await loadMediums();
    partSetOk("Ok.");
    renderParticipantes();
    renderChamada();
  } catch (e) {
    partSetErr(e.message);
  }
});

$partFiltroGrupo.addEventListener("change", renderParticipantes);
$partBusca.addEventListener("input", renderParticipantes);

$btnAdicionarParticipante.addEventListener("click", onAdicionarParticipante);

// compatibilidade (mantém assinatura, mas sem uso)
async function persistRotacaoFromClicks() {
  // DESATIVADO (modo manual):
  // A rotação automática foi abandonada. Agora você define manualmente os "próximos"
  // clicando nos botões "Próx Mesa / Próx PS" e isso é gravado direto na tabela rotacao.
  return;
}

init();
