/* ============================================================
   CHAMADA DE MEDIUNS - app.js
   Versao: 2026-02-07-a
   FIX DEFINITIVO: MU (Último da Mesa) gravado no banco
   - MU existe APENAS para incorporação e desenvolvimento
   - Dirigente mesa (M) e psicografia (PS) continuam 1 por dia
   ============================================================ */

console.log("APP.JS CARREGADO: 2026-02-07-a");

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
const btnImprimirProxima = must("btnImprimirProxima");

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

// MU (Último da Mesa) - somente para incorporação e desenvolvimento
let ultimoMesaById = new Map(); // medium_id -> boolean

/* timestamps de clique: fallback */
const tsMesa = new Map();
const tsPsico = new Map();

/* targets calculados a partir da rotacao */
let nextTargets = {
  mesa_dirigente: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null,
  psicografia: null,
};

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
  if (!bestId && ids.length) bestId = ids[ids.length - 1];
  return bestId;
}

/* ====== LOAD ====== */
async function loadMediums() {
  // IMPORTANTISSIMO: trazer ordem_grupo e sort_order
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
  ultimoMesaById = new Map();

  const rows = await sbGet(`chamadas?select=medium_id,status,is_ultimo_mesa&data=eq.${iso}`);
  for (const r of rows) {
    const st = (r.status || "").toUpperCase();
    chamadasMap.set(r.medium_id, st);
    ultimoMesaById.set(r.medium_id, !!r.is_ultimo_mesa);
  }
}

/* ====== PROXIMOS / TARGETS ====== */
function computeTargetsFromRotacao() {
  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  const nextMesaDir = computeNext(dir, rotacao.mesa_dirigente);
  const nextMesaInc = computeNext(inc, rotacao.mesa_incorporacao);
  const nextMesaDes = computeNext(des, rotacao.mesa_desenvolvimento);

  const nextPsico = computeNextSkip(ps, rotacao.psicografia, nextMesaDir ? nextMesaDir.id : null);

  nextTargets = {
    mesa_dirigente: nextMesaDir ? nextMesaDir.id : null,
    mesa_incorporacao: nextMesaInc ? nextMesaInc.id : null,
    mesa_desenvolvimento: nextMesaDes ? nextMesaDes.id : null,
    psicografia: nextPsico ? nextPsico.id : null,
  };

  return { nextMesaDir, nextMesaInc, nextMesaDes, nextPsico };
}

function renderProximos() {
  const { nextMesaDir, nextMesaInc, nextMesaDes, nextPsico } = computeTargetsFromRotacao();

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

/* ====== LISTA / RADIOS ====== */
function buildStatusOptions(m) {
  const base = ["P", "M", "F"];
  if (m.group_type === "dirigente") base.push("PS");
  return base;
}

function isMesaMultiGroup(group_type) {
  return group_type === "incorporacao" || group_type === "desenvolvimento";
}

function setUltimoMesaExclusive(group_type, chosenId) {
  // Só para incorporação e desenvolvimento
  if (!isMesaMultiGroup(group_type)) return;

  for (const m of mediumsAll) {
    if (m.group_type === group_type) {
      ultimoMesaById.set(m.id, m.id === chosenId);
    }
  }
}

function clearUltimoMesaIfNeeded(med) {
  if (!isMesaMultiGroup(med.group_type)) return;
  if (ultimoMesaById.get(med.id)) ultimoMesaById.set(med.id, false);
}

function enforceUniqueStatusInDirigentes(statusChar, chosenId) {
  // Para dirigente: deve existir no máximo 1 "M" e no máximo 1 "PS" por dia.
  for (const m of mediumsAll) {
    if (m.group_type !== "dirigente") continue;
    if (m.id === chosenId) continue;
    if ((chamadasMap.get(m.id) || "").toUpperCase() === statusChar) {
      // volta para Presente por segurança (não deixa "sem status")
      chamadasMap.set(m.id, "P");
    }
  }
}

function makeRow(m) {
  const wrap = document.createElement("div");
  wrap.className = "itemRow";

  // Destaques por "próximo"
  const isMesaNext =
    (m.group_type === "dirigente" && m.id === nextTargets.mesa_dirigente) ||
    (m.group_type === "incorporacao" && m.id === nextTargets.mesa_incorporacao) ||
    (m.group_type === "desenvolvimento" && m.id === nextTargets.mesa_desenvolvimento);

  const isPsicoNext =
    (m.group_type === "dirigente" && m.id === nextTargets.psicografia);

  if (isMesaNext) wrap.classList.add("nextMesa");
  if (isPsicoNext) wrap.classList.add("nextPsico");

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

      // 1) Atualiza status no mapa
      chamadasMap.set(m.id, s);

      // 2) Regras de unicidade (dirigentes)
      if (m.group_type === "dirigente" && s === "M") enforceUniqueStatusInDirigentes("M", m.id);
      if (m.group_type === "dirigente" && s === "PS") enforceUniqueStatusInDirigentes("PS", m.id);

      // 3) MU (Último da Mesa) — só incorp/desenv
      if (isMesaMultiGroup(m.group_type) && s !== "M") {
        clearUltimoMesaIfNeeded(m);
      }

      // 4) fallback timestamps
      if (s === "M") tsMesa.set(m.id, Date.now()); else tsMesa.delete(m.id);
      if (s === "PS") tsPsico.set(m.id, Date.now()); else tsPsico.delete(m.id);

      renderChamada();
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  right.appendChild(radios);

  // Botão ⭐ MU (Último da Mesa) — só incorporação e desenvolvimento
  if (isMesaMultiGroup(m.group_type)) {
    const stNow = (chamadasMap.get(m.id) || "").toUpperCase();
    const star = document.createElement("button");
    star.type = "button";
    star.className = "starBtn" + (ultimoMesaById.get(m.id) ? " on" : "");
    star.textContent = "★";
    star.title = "Definir como ÚLTIMO da mesa (MU) para rotacionar corretamente";

    star.disabled = stNow !== "M";

    star.addEventListener("click", () => {
      if (!currentDateISO) {
        setErro("Selecione a data e clique em Verificar data.");
        return;
      }
      const st = (chamadasMap.get(m.id) || "").toUpperCase();
      if (st !== "M") {
        setErro("MU só pode ser marcado em quem está como M (mesa).");
        return;
      }
      setUltimoMesaExclusive(m.group_type, m.id);
      renderChamada();
    });

    right.appendChild(star);
  }

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

  computeTargetsFromRotacao();

  for (const m of dir) listaDirigentes.appendChild(makeRow(m));
  for (const m of inc) listaIncorporacao.appendChild(makeRow(m));
  for (const m of des) listaDesenvolvimento.appendChild(makeRow(m));
  for (const m of car) listaCarencia.appendChild(makeRow(m));

  renderResumo();
  renderProximos();
}

/* ====== SALVAR ====== */
async function persistRotacaoFromClicks() {
  const active = mediumsAll.filter((m) => m.active === true);

  // Dirigente: no máximo 1 M e 1 PS
  const lastMesaDir = active
    .filter((m) => m.group_type === "dirigente" && (chamadasMap.get(m.id) || "").toUpperCase() === "M")
    .map((m) => m.id)[0] || null;

  const lastPsico = active
    .filter((m) => m.group_type === "dirigente" && (chamadasMap.get(m.id) || "").toUpperCase() === "PS")
    .map((m) => m.id)[0] || null;

  // Incorp/Desenv: MU é a fonte de verdade
  const incMesaIds = active
    .filter((m) => m.group_type === "incorporacao" && (chamadasMap.get(m.id) || "").toUpperCase() === "M")
    .map((m) => m.id);

  const desMesaIds = active
    .filter((m) => m.group_type === "desenvolvimento" && (chamadasMap.get(m.id) || "").toUpperCase() === "M")
    .map((m) => m.id);

  const lastMesaInc =
    incMesaIds.find((id) => ultimoMesaById.get(id) === true) ||
    pickLastClicked(incMesaIds, tsMesa) ||
    null;

  const lastMesaDes =
    desMesaIds.find((id) => ultimoMesaById.get(id) === true) ||
    pickLastClicked(desMesaIds, tsMesa) ||
    null;

  // Segurança: não permitir mesma pessoa em mesa_dirigente e psicografia
  let psicoFinal = lastPsico;
  if (lastMesaDir && psicoFinal && lastMesaDir === psicoFinal) {
    const psList = eligiblePsicoDirigentes();
    psicoFinal = computeNextSkip(psList, psicoFinal, lastMesaDir)?.id || psicoFinal;
  }

  if (lastMesaDir) await sbPatch(`rotacao?group_type=eq.mesa_dirigente`, { last_medium_id: lastMesaDir });
  if (lastMesaInc) await sbPatch(`rotacao?group_type=eq.mesa_incorporacao`, { last_medium_id: lastMesaInc });
  if (lastMesaDes) await sbPatch(`rotacao?group_type=eq.mesa_desenvolvimento`, { last_medium_id: lastMesaDes });
  if (psicoFinal)  await sbPatch(`rotacao?group_type=eq.psicografia`, { last_medium_id: psicoFinal });
}

async function onSalvarTudo() {
  if (!currentDateISO) return setErro("Selecione a data e clique em Verificar data.");

  try {
    const active = mediumsAll.filter((m) => m.active === true);

    // ===== Validação MU =====
    const incMesa = active.filter((m) => m.group_type === "incorporacao" && (chamadasMap.get(m.id) || "").toUpperCase() === "M");
    const desMesa = active.filter((m) => m.group_type === "desenvolvimento" && (chamadasMap.get(m.id) || "").toUpperCase() === "M");

    const incMU = incMesa.filter((m) => ultimoMesaById.get(m.id) === true);
    const desMU = desMesa.filter((m) => ultimoMesaById.get(m.id) === true);

    if (incMesa.length > 0 && incMU.length !== 1) {
      return setErro("Incorporação: marque exatamente 1 ⭐ (MU) entre os que estão como M.");
    }
    if (desMesa.length > 0 && desMU.length !== 1) {
      return setErro("Desenvolvimento: marque exatamente 1 ⭐ (MU) entre os que estão como M.");
    }

    // ===== Salva chamada (inclui is_ultimo_mesa) =====
    const rows = [];
    for (const m of active) {
      const st = (chamadasMap.get(m.id) || "").toUpperCase();
      if (!["P", "M", "F", "PS"].includes(st)) continue;

      const isUltimoMesa =
        (m.group_type === "incorporacao" || m.group_type === "desenvolvimento")
          ? (st === "M" && ultimoMesaById.get(m.id) === true)
          : false;

      rows.push({
        medium_id: m.id,
        data: currentDateISO,
        status: st,
        is_ultimo_mesa: isUltimoMesa
      });
    }

    if (rows.length) await sbUpsertChamadas(rows);

    await persistRotacaoFromClicks();
    await loadRotacao();
    renderChamada();

    setOk("Chamada salva. MU gravado (incorp/desenv) e rotação atualizada corretamente.");
  } catch (e) {
    setErro("Erro ao salvar: " + e.message);
  }
}

/* ====== VERIFICAR DATA ====== */
async function onVerificar() {
  setErro("");
  const iso = (dataChamada.value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return setErro("Data inválida.");
  currentDateISO = iso;
  await loadChamadasForDate(iso);
  setOk(`Data carregada: ${iso}`);
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

    const left = document.createElement("div");
    left.className = "itemLeft";
    left.innerHTML = `
      <div class="itemName">${nameOf(m)}</div>
      <div class="itemMeta">Grupo: ${m.group_type} | Ativo: ${m.active ? "Sim" : "Não"} | Ordem: ${m.ordem_grupo ?? "-"} / ${m.sort_order ?? "-"}</div>
    `;

    const right = document.createElement("div");
    right.className = "itemRight";

    // Botão "X" (soft delete): desativa para sumir do front sem quebrar histórico
    const btnX = document.createElement("button");
    btnX.className = "btn danger small";
    btnX.type = "button";
    btnX.textContent = "X";
    btnX.title = "Remover (desativar) participante";

    btnX.disabled = !m.active;
    btnX.addEventListener("click", async () => {
      const ok = confirm(`Remover (desativar) o participante "${nameOf(m)}"?\n\nIsso NÃO apaga chamadas antigas, apenas desativa para não aparecer no front.`);
      if (!ok) return;

      try {
        await sbPatch(`mediums?id=eq.${m.id}`, { active: false });
        pOk(`Participante removido (desativado): ${nameOf(m)}`);
        await reloadParticipants();
      } catch (e) {
        pErr("Erro ao remover: " + e.message);
      }
    });

    right.appendChild(btnX);

    row.appendChild(left);
    row.appendChild(right);
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

/* ====== IMPRIMIR PRÓXIMA CHAMADA ====== */
function pad2(n){ return String(n).padStart(2,"0"); }
function toISODate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function nextTuesdayFrom(date){
  const d = new Date(date);
  const day = d.getDay(); // 0 dom .. 2 ter
  const diff = (2 - day + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  d.setHours(0,0,0,0);
  return d;
}
function escapeHtml(s){
  return (s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function buildPrintDoc(dateISO) {
  const { nextMesaDir, nextMesaInc, nextMesaDes, nextPsico } = computeTargetsFromRotacao();

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");

  const html = `
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Chamada ${dateISO}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px}
        h1{margin:0 0 10px}
        .muted{color:#555;margin-bottom:18px}
        .box{border:1px solid #222;border-radius:10px;padding:12px;margin:10px 0}
        .row{display:flex;justify-content:space-between;gap:10px}
        .k{font-weight:700}
      </style>
    </head>
    <body>
      <h1>Chamada - ${dateISO}</h1>
      <div class="muted">Plano de reserva (caso o app falhe):</div>

      <div class="box">
        <div class="row"><div class="k">Dirigente (Mesa)</div><div>${escapeHtml(nextMesaDir ? nextMesaDir.name : "—")}</div></div>
        <div class="row"><div class="k">Dirigente (Psicografia)</div><div>${escapeHtml(nextPsico ? nextPsico.name : "—")}</div></div>
      </div>

      <div class="box">
        <div class="k">Incorporação (Mesa) - próximo</div>
        <div>${escapeHtml(nextMesaInc ? nextMesaInc.name : "—")}</div>
      </div>

      <div class="box">
        <div class="k">Desenvolvimento (Mesa) - próximo</div>
        <div>${escapeHtml(nextMesaDes ? nextMesaDes.name : "—")}</div>
      </div>

      <div class="muted" style="margin-top:20px">
        Obs.: Para rotação perfeita em Incorp/Desenv, marque ⭐ MU (Último da Mesa) no 4º "M".
      </div>
    </body>
  </html>`;
  return html;
}
function onImprimirProxima() {
  const base = currentDateISO ? new Date(currentDateISO + "T00:00:00") : new Date();
  const nextTue = nextTuesdayFrom(base);
  const iso = toISODate(nextTue);

  const w = window.open("", "_blank");
  if (!w) return setErro("Pop-up bloqueado. Libere pop-ups para imprimir.");
  w.document.open();
  w.document.write(buildPrintDoc(iso));
  w.document.close();
  w.focus();
  w.print();
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
  btnImprimirProxima.addEventListener("click", onImprimirProxima);

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
