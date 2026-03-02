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

async function httpGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `GET ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPost(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `POST ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPatch(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `PATCH ${path} failed`);
  return text ? JSON.parse(text) : [];
}

/* ===========================
   DOM
=========================== */
const tabChamada = document.getElementById("tabChamada");
const tabParticipantes = document.getElementById("tabParticipantes");
const viewChamada = document.getElementById("viewChamada");
const viewParticipantes = document.getElementById("viewParticipantes");

const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const msgTopo = document.getElementById("msgTopo");
const msgErro = document.getElementById("msgErro");

const dataChamada = document.getElementById("dataChamada");
const btnVerificar = document.getElementById("btnVerificar");
const btnSalvar = document.getElementById("btnSalvar");
const btnImprimirProxima = document.getElementById("btnImprimirProxima");

const resumoGeral = document.getElementById("resumoGeral");
const reservasMesa = document.getElementById("reservasMesa");

const nextMesaDirigenteName = document.getElementById("nextMesaDirigenteName");
const nextPsicoDirigenteName = document.getElementById("nextPsicoDirigenteName");
const nextMesaIncorpName = document.getElementById("nextMesaIncorpName");
const nextMesaDesenvName = document.getElementById("nextMesaDesenvName");

const listaDirigentes = document.getElementById("listaDirigentes");
const listaIncorporacao = document.getElementById("listaIncorporacao");
const listaDesenvolvimento = document.getElementById("listaDesenvolvimento");
const listaCarencia = document.getElementById("listaCarencia");

const partFiltroGrupo = document.getElementById("partFiltroGrupo");
const partBusca = document.getElementById("partBusca");
const btnRecarregarParticipantes = document.getElementById("btnRecarregarParticipantes");
const partMsg = document.getElementById("partMsg");
const partErr = document.getElementById("partErr");
const listaParticipantes = document.getElementById("listaParticipantes");

const novoNome = document.getElementById("novoNome");
const novoGrupo = document.getElementById("novoGrupo");
const novoAtivo = document.getElementById("novoAtivo");
const novoMesa = document.getElementById("novoMesa");
const novoPsico = document.getElementById("novoPsico");
const btnAdicionarParticipante = document.getElementById("btnAdicionarParticipante");

/* ===========================
   STATE
=========================== */
let mediumsAll = [];
let rotacao = {
  mesa_desenvolvimento: null,
  mesa_dirigente: null,
  mesa_incorporacao: null,
  psicografia: null,
};

let chamadasMap = new Map(); // medium_id -> status (P/F/M/PS)
let currentDateISO = null;

let ORDERED_MEDIUMS = {
  dirigente: [],
  incorporacao: [],
  desenvolvimento: [],
  carencia: [],
};

/* ===========================
   UI HELPERS
=========================== */
function setConn(text) {
  statusPill.classList.remove("ok", "err");
  statusPill.classList.add("ok");
  statusText.textContent = text || "Conectando...";
}
function setOk(text) {
  statusPill.classList.remove("err");
  statusPill.classList.add("ok");
  statusText.textContent = text || "OK";
  msgTopo.textContent = text || "";
  msgErro.textContent = "";
}
function setErr(text) {
  statusPill.classList.remove("ok");
  statusPill.classList.add("err");
  statusText.textContent = "Erro na conexão";
  msgErro.textContent = text || "Erro";
  msgTopo.textContent = "";
}
function clearMsgs() {
  msgTopo.textContent = "";
  msgErro.textContent = "";
  partMsg.textContent = "";
  partErr.textContent = "";
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

/* ===========================
   ORDER / QUEUE
=========================== */
function byGroup(list, group) {
  return list.filter((m) => m.active === true && m.group_type === group);
}

function sortQueue(list) {
  return [...list].sort((a, b) => {
    const as = a.sort_order ?? a.ordem_grupo ?? 999999;
    const bs = b.sort_order ?? b.ordem_grupo ?? 999999;
    if (as !== bs) return as - bs;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function computeNext(queue, lastId) {
  if (!queue.length) return null;
  if (!lastId) return queue[0];
  const idx = queue.findIndex((x) => x.id === lastId);
  if (idx < 0) return queue[0];
  return queue[(idx + 1) % queue.length];
}

/* ===========================
   LOAD
=========================== */
async function loadMediums() {
  const data = await httpGet(
    "mediums?select=id,name,group_type,active,can_mesa,can_psico,sort_order,ordem_grupo&order=group_type.asc,sort_order.asc,ordem_grupo.asc,name.asc"
  );
  mediumsAll = data || [];

  ORDERED_MEDIUMS.dirigente = sortQueue(byGroup(mediumsAll, "dirigente"));
  ORDERED_MEDIUMS.incorporacao = sortQueue(byGroup(mediumsAll, "incorporacao"));
  ORDERED_MEDIUMS.desenvolvimento = sortQueue(byGroup(mediumsAll, "desenvolvimento"));
  ORDERED_MEDIUMS.carencia = sortQueue(byGroup(mediumsAll, "carencia"));
}

async function loadRotacao() {
  const data = await httpGet("rotacao?select=group_type,last_medium_id");
  const base = {
    mesa_desenvolvimento: null,
    mesa_dirigente: null,
    mesa_incorporacao: null,
    psicografia: null,
  };
  for (const r of data || []) {
    base[r.group_type] = r.last_medium_id || null;
  }
  rotacao = base;
}

async function loadChamadasForDate(iso) {
  chamadasMap = new Map();
  const rows = await httpGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  for (const r of rows || []) {
    const st = (r.status || "").toUpperCase();
    chamadasMap.set(r.medium_id, st);
  }
}

/* ===========================
   RENDER ROWS
=========================== */
function makeRow(m, status, isNextMesa, isNextPsico) {
  const row = document.createElement("div");
  row.className = "row";

  if (isNextMesa) row.classList.add("nextMesa");
  if (isNextPsico) row.classList.add("nextPsico");

  const nameBox = document.createElement("div");
  nameBox.className = "name";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = m.name;

  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = `Grupo: ${m.group_type} | Ativo: ${m.active ? "Sim" : "Não"} | Ordem: ${m.sort_order ?? "-"} / ${m.ordem_grupo ?? "-"}`;

  nameBox.appendChild(title);
  nameBox.appendChild(sub);

  const radios = document.createElement("div");
  radios.className = "radios";

  function addRadio(label, value) {
    const wrap = document.createElement("label");
    wrap.className = "radioWrap";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `st_${m.id}`;
    input.value = value;
    input.checked = status === value;
    input.onchange = () => {
      chamadasMap.set(m.id, value);
      renderResumo();
    };

    const span = document.createElement("span");
    span.className = `radioLbl ${value === "F" ? "danger" : value === "M" || value === "PS" ? "warn" : ""}`;
    span.textContent = label;

    wrap.appendChild(input);
    wrap.appendChild(span);
    radios.appendChild(wrap);
  }

  addRadio("P", "P");
  addRadio("F", "F");
  if (m.group_type === "dirigente") {
    addRadio("M", "M");
    addRadio("PS", "PS");
  } else {
    addRadio("M", "M");
  }

  row.appendChild(nameBox);
  row.appendChild(radios);
  return row;
}

function getStatus(mId) {
  return (chamadasMap.get(mId) || "").toUpperCase();
}

/* ===========================
   PRÓXIMOS (painel)
=========================== */
function nameOf(id) {
  if (!id) return "—";
  const m = mediumsAll.find((x) => x.id === id);
  return m ? m.name : "—";
}

function computeTargetsFromRotacao() {
  const dir = ORDERED_MEDIUMS.dirigente || [];
  const inc = ORDERED_MEDIUMS.incorporacao || [];
  const des = ORDERED_MEDIUMS.desenvolvimento || [];

  const manual = (localStorage.getItem("manual_rotacao") === "1");

  function pickExact(list, id) {
    if (!id) return null;
    return list.find((x) => x.id === id) || null;
  }

  // Se estiver em modo manual, 'rotacao.last_medium_id' passa a ser o PRÓXIMO escolhido.
  // Se não, mantém o comportamento antigo (last -> next).
  const mesaDir = manual ? pickExact(dir, rotacao?.mesa_dirigente) : computeNext(dir, rotacao?.mesa_dirigente);
  let psico = manual ? pickExact(dir, rotacao?.psicografia) : computeNext(dir, rotacao?.psicografia);

  // Evita repetir a mesma pessoa em Mesa e Psicografia
  if (mesaDir && psico && mesaDir.id === psico.id) {
    psico = null;
  }

  const mesaInc = manual ? pickExact(inc, rotacao?.mesa_incorporacao) : computeNext(inc, rotacao?.mesa_incorporacao);
  const mesaDes = manual ? pickExact(des, rotacao?.mesa_desenvolvimento) : computeNext(des, rotacao?.mesa_desenvolvimento);

  return { mesaDir, psico, mesaInc, mesaDes };
}

function renderProximos() {
  const { mesaDir, psico, mesaInc, mesaDes } = computeTargetsFromRotacao();

  nextMesaDirigenteName.textContent = mesaDir ? mesaDir.name : "—";
  nextPsicoDirigenteName.textContent = psico ? psico.name : "—";
  nextMesaIncorpName.textContent = mesaInc ? mesaInc.name : "—";
  nextMesaDesenvName.textContent = mesaDes ? mesaDes.name : "—";
}

/* ===========================
   RESUMO
=========================== */
function renderResumo() {
  let P = 0, F = 0, M = 0, PS = 0;

  for (const st of chamadasMap.values()) {
    if (st === "P") P++;
    else if (st === "F") F++;
    else if (st === "M") M++;
    else if (st === "PS") PS++;
  }

  const total = P + F + M + PS;
  const pres = total ? Math.round(((P + M + PS) / total) * 100) : 0;
  const falt = total ? Math.round((F / total) * 100) : 0;

  resumoGeral.textContent = `P:${P} M:${M} F:${F} PS:${PS} | Presença:${pres}% | Faltas:${falt}%`;
}

/* ===========================
   RENDER LISTAS
=========================== */
function renderChamada() {
  const { mesaDir, psico, mesaInc, mesaDes } = computeTargetsFromRotacao();

  const dir = ORDERED_MEDIUMS.dirigente || [];
  const inc = ORDERED_MEDIUMS.incorporacao || [];
  const des = ORDERED_MEDIUMS.desenvolvimento || [];
  const car = ORDERED_MEDIUMS.carencia || [];

  // Dirigentes
  listaDirigentes.innerHTML = "";
  for (const m of dir) {
    const st = getStatus(m.id);
    const isNextMesa = mesaDir && mesaDir.id === m.id;
    const isNextPsico = psico && psico.id === m.id;
    const row = makeRow(m, st, isNextMesa, isNextPsico);

    // Botões para definir PRÓXIMOS (rotação manual)
    {
      const radiosBox = row.querySelector('.radios');
      if (radiosBox) {
        const bNextM = document.createElement('button');
        bNextM.type = 'button';
        bNextM.className = 'radioLbl';
        bNextM.textContent = '➜M';
        bNextM.title = 'Definir como próximo Dirigente (Mesa)';
        bNextM.onclick = () => setProximo('mesa_dirigente', m.id);

        const bNextPS = document.createElement('button');
        bNextPS.type = 'button';
        bNextPS.className = 'radioLbl';
        bNextPS.textContent = '➜PS';
        bNextPS.title = 'Definir como próximo Dirigente (Psicografia)';
        bNextPS.onclick = () => setProximo('psicografia', m.id);

        radiosBox.appendChild(bNextM);
        radiosBox.appendChild(bNextPS);
      }
    }

    listaDirigentes.appendChild(row);
  }

  // Incorporação
  listaIncorporacao.innerHTML = "";
  for (const m of inc) {
    const st = getStatus(m.id);
    const isNext = mesaInc && mesaInc.id === m.id;
    const row = makeRow(m, st, isNext, false);

    // Definir o INÍCIO da próxima mesa (4 nomes saem a partir deste)
    {
      const radiosBox = row.querySelector('.radios');
      if (radiosBox) {
        const bNextM = document.createElement('button');
        bNextM.type = 'button';
        bNextM.className = 'radioLbl';
        bNextM.textContent = '➜M';
        bNextM.title = 'Definir como início da próxima mesa (Incorporação)';
        bNextM.onclick = () => setProximo('mesa_incorporacao', m.id);
        radiosBox.appendChild(bNextM);
      }
    }

    listaIncorporacao.appendChild(row);
  }

  // Desenvolvimento
  listaDesenvolvimento.innerHTML = "";
  for (const m of des) {
    const st = getStatus(m.id);
    const isNext = mesaDes && mesaDes.id === m.id;
    const row = makeRow(m, st, isNext, false);

    // Definir o INÍCIO da próxima mesa (4 nomes saem a partir deste)
    {
      const radiosBox = row.querySelector('.radios');
      if (radiosBox) {
        const bNextM = document.createElement('button');
        bNextM.type = 'button';
        bNextM.className = 'radioLbl';
        bNextM.textContent = '➜M';
        bNextM.title = 'Definir como início da próxima mesa (Desenvolvimento)';
        bNextM.onclick = () => setProximo('mesa_desenvolvimento', m.id);
        radiosBox.appendChild(bNextM);
      }
    }

    listaDesenvolvimento.appendChild(row);
  }

  // Carência
  listaCarencia.innerHTML = "";
  for (const m of car) {
    const st = getStatus(m.id);
    const row = makeRow(m, st, false, false);
    listaCarencia.appendChild(row);
  }

  renderResumo();
  renderProximos();
}

/* ===========================
   PARTICIPANTES (ABA)
=========================== */
function matchesFilter(m) {
  const g = (partFiltroGrupo.value || "").trim();
  const q = (partBusca.value || "").trim().toLowerCase();

  if (g && m.group_type !== g) return false;
  if (q && !(m.name || "").toLowerCase().includes(q)) return false;
  return true;
}

function renderParticipantes() {
  listaParticipantes.innerHTML = "";
  partMsg.textContent = "";
  partErr.textContent = "";

  const list = [...mediumsAll].filter(matchesFilter).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  for (const m of list) {
    const row = document.createElement("div");
    row.className = "row";

    const nameBox = document.createElement("div");
    nameBox.className = "name";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = m.name;

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `Grupo: ${m.group_type} | Ativo: ${m.active ? "Sim" : "Não"} | Ordem: ${m.sort_order ?? "-"} / ${m.ordem_grupo ?? "-"}`;

    nameBox.appendChild(title);
    nameBox.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "participantsActions";

    const x = document.createElement("button");
    x.className = "xbtn";
    x.textContent = "X";
    x.title = "Desativar participante";
    x.onclick = async () => {
      try {
        partMsg.textContent = `Desativando ${m.name}...`;
        await httpPatch(`mediums?id=eq.${m.id}`, { active: false }, "return=minimal");
        const idx = mediumsAll.findIndex((z) => z.id === m.id);
        if (idx >= 0) mediumsAll[idx].active = false;
        await loadMediums(); // reordena e recarrega caches
        renderParticipantes();
        renderChamada();
        partMsg.textContent = `${m.name} desativado.`;
      } catch (e) {
        console.error(e);
        partErr.textContent = `Erro ao desativar: ${e.message}`;
      }
    };

    actions.appendChild(x);
    row.appendChild(nameBox);
    row.appendChild(actions);
    listaParticipantes.appendChild(row);
  }
}

/* ===========================
   ROTACAO (AUTOMAÇÃO ANTIGA)
   Mantida aqui só para referência, mas NÃO é chamada no SAVE.
=========================== */
async function persistRotacaoFromClicks() {
  // (mantido, mas não usado)
}

/* ===========================
   ROTACAO MANUAL (NOVO)
   - Ao invés de "automação", você define manualmente quem será o PRÓXIMO.
   - Quando você clicar em ➜M / ➜PS, isso grava direto na tabela rotacao.
=========================== */
async function setProximo(groupType, mediumId) {
  if (!groupType || !mediumId) return;
  try {
    setConn("Salvando próximo...");
    await httpPatch(`rotacao?group_type=eq.${groupType}`, { last_medium_id: mediumId }, "return=minimal");
    if (!rotacao) rotacao = {};
    rotacao[groupType] = mediumId;

    // liga o modo manual a partir do primeiro uso
    localStorage.setItem("manual_rotacao", "1");

    setOk("Próximo definido com sucesso.");
    renderProximos();
    renderChamada();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao definir próximo: ${e.message}`);
  }
}

/* ====== VERIFICAR DATA (carrega e renderiza) ====== */
async function onVerificarData() {
  clearMsgs();
  try {
    const iso = dataChamada.value;
    if (!iso) return;
    currentDateISO = iso;

    setConn("Carregando chamada...");
    await loadChamadasForDate(iso);
    await loadRotacao();

    setOk("Data carregada.");
    renderChamada();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao verificar data: ${e.message}`);
  }
}

/* ====== SAVE ====== */
async function onSalvarTudo() {
  clearMsgs();
  if (!currentDateISO) {
    setErr("Selecione uma data antes de salvar.");
    return;
  }

  try {
    setConn("Salvando...");

    const rows = [];
    for (const [medium_id, status] of chamadasMap.entries()) {
      if (!status) continue;
      rows.push({
        medium_id,
        data: currentDateISO,
        status: status.toUpperCase(),
      });
    }

    if (rows.length) {
      await httpPost("chamadas", rows, "resolution=merge-duplicates,return=minimal");
    }

    // Rotação agora é MANUAL: não atualizamos 'rotacao' automaticamente ao salvar.

    await loadRotacao();
    setOk("Chamada salva com sucesso.");
    renderChamada();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao salvar: ${e.message}`);
  }
}

/* ====== PRINT ====== */
function buildPrintDoc(nextISO, targets) {
  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:20px}
      h1{margin:0}
      .sub{margin:6px 0 18px 0; color:#444}
      .grid{display:grid; grid-template-columns:1fr 1fr; gap:12px}
      .card{border:1px solid #ddd; border-radius:10px; padding:14px}
      .t{font-weight:bold; margin-bottom:6px}
      .v{font-size:18px}
    </style>
  `;

  return `
    <html><head><meta charset="utf-8" />${style}</head>
    <body>
      <h1>Próxima Chamada</h1>
      <div class="sub">Data: <b>${nextISO}</b></div>

      <div class="grid">
        <div class="card"><div class="t">Dirigente (Mesa)</div><div class="v">${targets.mesaDir || "—"}</div></div>
        <div class="card"><div class="t">Dirigente (Psicografia)</div><div class="v">${targets.psico || "—"}</div></div>
        <div class="card"><div class="t">Incorporação (Mesa)</div><div class="v">${targets.mesaInc || "—"}</div></div>
        <div class="card"><div class="t">Desenvolvimento (Mesa)</div><div class="v">${targets.mesaDes || "—"}</div></div>
      </div>

      <script>window.onload=()=>window.print()</script>
    </body></html>
  `;
}

async function onImprimirProxima() {
  try {
    await loadRotacao();
    const base = currentDateISO || isoTodayLocal();
    const nextISO = nextTuesdayISO(base);

    const { mesaDir, psico, mesaInc, mesaDes } = computeTargetsFromRotacao();
    const targets = {
      mesaDir: mesaDir ? mesaDir.name : "—",
      psico: psico ? psico.name : "—",
      mesaInc: mesaInc ? mesaInc.name : "—",
      mesaDes: mesaDes ? mesaDes.name : "—",
    };

    const w = window.open("", "_blank");
    w.document.open();
    w.document.write(buildPrintDoc(nextISO, targets));
    w.document.close();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao imprimir: ${e.message}`);
  }
}

/* ===========================
   TABS
=========================== */
function setTab(which) {
  if (which === "chamada") {
    tabChamada.classList.add("active");
    tabParticipantes.classList.remove("active");
    viewChamada.style.display = "";
    viewParticipantes.style.display = "none";
  } else {
    tabParticipantes.classList.add("active");
    tabChamada.classList.remove("active");
    viewParticipantes.style.display = "";
    viewChamada.style.display = "none";
  }
}

tabChamada.addEventListener("click", () => setTab("chamada"));
tabParticipantes.addEventListener("click", () => {
  setTab("participantes");
  renderParticipantes();
});

/* ===========================
   PARTICIPANTS ACTIONS
=========================== */
btnRecarregarParticipantes.addEventListener("click", async () => {
  try {
    partMsg.textContent = "Recarregando...";
    await loadMediums();
    renderParticipantes();
    partMsg.textContent = "OK.";
  } catch (e) {
    console.error(e);
    partErr.textContent = `Erro: ${e.message}`;
  }
});

partFiltroGrupo.addEventListener("change", renderParticipantes);
partBusca.addEventListener("input", renderParticipantes);

btnAdicionarParticipante.addEventListener("click", async () => {
  partMsg.textContent = "";
  partErr.textContent = "";
  try {
    const name = (novoNome.value || "").trim();
    const group_type = (novoGrupo.value || "").trim();
    if (!name || !group_type) {
      partErr.textContent = "Nome e grupo são obrigatórios.";
      return;
    }

    const payload = {
      name,
      group_type,
      active: !!novoAtivo.checked,
      can_mesa: !!novoMesa.checked,
      can_psico: !!novoPsico.checked,
    };

    await httpPost("mediums", payload, "return=minimal");
    novoNome.value = "";
    novoMesa.checked = false;
    novoPsico.checked = false;

    await loadMediums();
    renderParticipantes();
    renderChamada();

    partMsg.textContent = "Participante adicionado.";
  } catch (e) {
    console.error(e);
    partErr.textContent = `Erro ao adicionar: ${e.message}`;
  }
});

/* ===========================
   EVENTS
=========================== */
btnVerificar.addEventListener("click", onVerificarData);
btnSalvar.addEventListener("click", onSalvarTudo);
btnImprimirProxima.addEventListener("click", onImprimirProxima);

/* ===========================
   BOOT
=========================== */
async function boot() {
  clearMsgs();
  try {
    if (!SUPABASE_URL.includes("supabase.co") || SUPABASE_ANON === "YOUR_ANON_KEY") {
      setErr("Config ausente: confira SUPABASE_URL e SUPABASE_ANON no config.js.");
      return;
    }

    setConn("Conectando...");
    dataChamada.value = isoTodayLocal();
    currentDateISO = dataChamada.value;

    await loadMediums();
    await loadRotacao();
    await loadChamadasForDate(currentDateISO);

    setOk("Supabase OK");
    renderChamada();
  } catch (e) {
    console.error(e);
    setErr(`Erro ao conectar no Supabase REST: ${e.message}`);
  }
}

boot();
