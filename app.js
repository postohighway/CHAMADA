/* ============================================================
   CHAMADA DE MEDIUNS - app.js
   Versao: 2026-03-16
   Destaques:
   - Ordem de fila por (ordem_grupo, sort_order, name)
   - Dirigente mesa: amarelo | Psicografia: vermelho
   - Incorporação: 4 próximos em verde | Desenvolvimento: 4 próximos em azul claro
   - Se faltou (F), rotação pula para o próximo disponível
   - Dirigentes: duas estrelas (Mesa + Psicografia), sempre visíveis
   - Incorporação: todos na rotação da mesa; Desenvolvimento/Dirigente: pode_mesa (legado mesa)
   - Carência: meta de presenças (P/M/PS nas chamadas) → migra auto para Desenvolvimento ao salvar
   ============================================================ */

console.log("APP.JS CARREGADO: 2026-03-16");

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

/* Upsert de rotação: insere se não existir, atualiza se existir (group_type = PK) */
async function sbUpsertRotacao(groupType, lastMediumId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rotacao?on_conflict=group_type`, {
    method: "POST",
    headers: {
      ...headersJson("resolution=merge-duplicates,return=minimal"),
    },
    body: JSON.stringify([{ group_type: groupType, last_medium_id: lastMediumId }]),
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
const novoMetaCarencia = must("novoMetaCarencia");
const novoMetaCarenciaWrap = must("novoMetaCarenciaWrap");
const btnAdicionarParticipante = must("btnAdicionarParticipante");

function syncNovoMetaCarenciaWrap() {
  novoMetaCarenciaWrap.style.display = novoGrupo.value === "carencia" ? "" : "none";
}

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

/* Estrela: quem foi o último a sentar (definido pelo clique do usuário) */
let starLast = {
  mesa_dirigente: null,
  psicografia: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null,
};

/* Targets atuais (para destaque e impressão) */
/* mesa_dirigente e psicografia: 1 id; mesa_incorporacao e mesa_desenvolvimento: array de 4 ids */
let nextTargets = {
  mesa_dirigente: null,
  mesa_incorporacao: [],   // 4 próximos para incorporação
  mesa_desenvolvimento: [], // 4 próximos para desenvolvimento
  psicografia: null,
};

/* ====== UI helpers ====== */
function setOk(msg = "") { msgTopo.textContent = msg; msgErro.textContent = ""; }
function setErro(msg = "") { msgErro.textContent = msg; }
function setConn(ok, msg) { statusText.textContent = msg; statusPill.classList.toggle("ok", !!ok); }

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

/* Pode entrar na rotação da mesa (coluna pode_mesa; legado: mesa > 0) */
function podeSentarMesa(m) {
  if (m.pode_mesa === true || m.pode_mesa === false) return !!m.pode_mesa;
  return Number(m.mesa ?? 0) > 0;
}

/* Dirigente pode psicografar (campo psicografia 1/0) */
function podePsicografar(m) {
  if (m.group_type !== "dirigente") return false;
  return Number(m.psicografia ?? 0) > 0;
}

/* Incorporação: todos entram na rotação da mesa. Desenvolvimento e dirigentes: só com pode_mesa / legado. */
function eligibleParaMesa(group_type) {
  const list = eligible(group_type);
  if (group_type === "incorporacao") return list;
  return list.filter(podeSentarMesa);
}

/* regra: só dirigentes com psicografia habilitada entram na rotação de psico */
function eligiblePsicoDirigentes() {
  return eligible("dirigente").filter(podePsicografar);
}

/* ====== ROTACAO ====== */
function computeNext(list, lastId) {
  if (!list.length) return null;
  if (!lastId) return list[0];
  const idx = list.findIndex((x) => x.id === lastId);
  if (idx === -1) return list[0];
  return list[(idx + 1) % list.length];
}

/* Retorna os 4 próximos na fila (para incorporação e desenvolvimento) */
function computeNext4(list, lastId) {
  if (!list.length) return [];
  const startIdx = !lastId ? 0 : (list.findIndex((x) => x.id === lastId) + 1) % list.length;
  const result = [];
  for (let i = 0; i < 4; i++) {
    result.push(list[(startIdx + i) % list.length]);
  }
  return result;
}

/* Verifica se a pessoa está marcada F (falta) na data atual */
function isFalta(m) {
  return (chamadasMap.get(m.id) || "").toUpperCase() === "F";
}

/* Próximo na fila PULANDO quem está marcado F (falta) - rotação desce para o próximo disponível */
function computeNextExcludingF(list, lastId) {
  if (!list.length) return null;
  const n = list.length;
  const startIdx = !lastId ? -1 : list.findIndex((x) => x.id === lastId);
  for (let i = 1; i <= n; i++) {
    const idx = (startIdx + i) % n;
    const m = list[idx];
    if (!isFalta(m)) return m;
  }
  return null;
}

/* 4 próximos na fila PULANDO quem está marcado F */
function computeNext4ExcludingF(list, lastId) {
  if (!list.length) return [];
  const n = list.length;
  const startIdx = !lastId ? -1 : list.findIndex((x) => x.id === lastId);
  const result = [];
  for (let i = 1; i <= n * 2 && result.length < 4; i++) {
    const idx = (startIdx + i) % n;
    const m = list[idx];
    if (!isFalta(m)) result.push(m);
  }
  return result;
}


function computeNextSkip(list, lastId, skipId) {
  if (!list.length) return null;
  let n = computeNext(list, lastId);
  if (!skipId || list.length === 1) return n;
  if (n && n.id === skipId) n = computeNext(list, n.id);
  return n;
}

/* Retorna o lastId efetivo: prioriza starLast, senão usa rotacao do banco */
function getLastForGroup(groupKey) {
  return starLast[groupKey] ?? rotacao[groupKey] ?? null;
}

/* ====== LOAD ====== */
async function loadMediums() {
  const base =
    "id,name,group_type,active,presencas,faltas,mesa,psicografia,ordem_grupo,sort_order";
  const withPs = `${base},pode_mesa`;
  const withAll = `${withPs},carencia_meta_presencas`;
  try {
    mediumsAll = await sbGet(`mediums?select=${withAll}`);
  } catch (e) {
    const t = e.message || String(e);
    if (t.includes("carencia_meta_presencas")) {
      try {
        mediumsAll = await sbGet(`mediums?select=${withPs}`);
      } catch (e2) {
        const t2 = e2.message || String(e2);
        if (t2.includes("pode_mesa")) {
          mediumsAll = await sbGet(`mediums?select=${base}`);
        } else {
          throw e2;
        }
      }
    } else if (t.includes("pode_mesa")) {
      mediumsAll = await sbGet(`mediums?select=${base}`);
    } else {
      throw e;
    }
  }
}

/* Conta presenças e faltas a partir de todas as linhas em chamadas (P, M, PS = presença; F = falta). */
async function syncPresenceStatsFromChamadas() {
  const promoted = [];
  let chRows;
  try {
    chRows = await sbGet("chamadas?select=medium_id,status");
  } catch (e) {
    return promoted;
  }
  const agg = new Map();
  for (const r of chRows) {
    const id = r.medium_id;
    if (id == null) continue;
    const st = (r.status || "").toUpperCase();
    if (!agg.has(id)) agg.set(id, { pres: 0, fal: 0 });
    const c = agg.get(id);
    if (st === "F") c.fal += 1;
    else if (st === "P" || st === "M" || st === "PS") c.pres += 1;
  }

  for (const m of mediumsAll) {
    if (!m.active) continue;
    const { pres, fal } = agg.get(m.id) || { pres: 0, fal: 0 };
    const metaN = Number(m.carencia_meta_presencas);
    const patch = {};
    if (Number(m.presencas || 0) !== pres || Number(m.faltas || 0) !== fal) {
      patch.presencas = pres;
      patch.faltas = fal;
    }
    if (
      m.group_type === "carencia" &&
      Number.isFinite(metaN) &&
      metaN > 0 &&
      pres >= metaN
    ) {
      patch.group_type = "desenvolvimento";
      patch.carencia_meta_presencas = null;
    }
    if (Object.keys(patch).length) {
      const nm = nameOf(m);
      try {
        await sbPatch(`mediums?id=eq.${m.id}`, patch);
        if (patch.group_type === "desenvolvimento") promoted.push(nm);
      } catch (err) {
        const t = err.message || String(err);
        if (t.includes("carencia_meta_presencas")) {
          const p2 = { ...patch };
          delete p2.carencia_meta_presencas;
          await sbPatch(`mediums?id=eq.${m.id}`, p2);
          if (p2.group_type === "desenvolvimento") promoted.push(nm);
        } else {
          throw err;
        }
      }
    }
  }
  return promoted;
}

function parseMetaCarenciaInput(val) {
  const s = String(val ?? "").trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
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
  starLast = { ...rotacao };
}

async function loadChamadasForDate(iso) {
  chamadasMap = new Map();
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  for (const r of rows) {
    chamadasMap.set(r.medium_id, (r.status || "").toUpperCase());
  }
}

/* ====== PROXIMOS ====== */
function computeTargetsFromRotacao() {
  const dir = eligibleParaMesa("dirigente");
  const inc = eligibleParaMesa("incorporacao");
  const des = eligibleParaMesa("desenvolvimento");
  const ps  = eligiblePsicoDirigentes();

  /* Usa versões que PULAM quem está F (falta): rotação desce para o próximo disponível */
  const nextMesaDir = computeNextExcludingF(dir, getLastForGroup("mesa_dirigente"));
  const nextMesaInc4 = computeNext4ExcludingF(inc, getLastForGroup("mesa_incorporacao"));
  const nextMesaDes4 = computeNext4ExcludingF(des, getLastForGroup("mesa_desenvolvimento"));

  let nextPsico = computeNextExcludingF(ps, getLastForGroup("psicografia"));
  if (nextPsico && nextMesaDir && nextPsico.id === nextMesaDir.id) {
    nextPsico = computeNextExcludingF(ps, nextPsico.id);
  }

  nextTargets = {
    mesa_dirigente: nextMesaDir ? nextMesaDir.id : null,
    mesa_incorporacao: nextMesaInc4.map((m) => m.id),
    mesa_desenvolvimento: nextMesaDes4.map((m) => m.id),
    psicografia: nextPsico ? nextPsico.id : null,
  };

  return { nextMesaDir, nextMesaInc4, nextMesaDes4, nextPsico };
}

function renderProximos() {
  const { nextMesaDir, nextMesaInc4, nextMesaDes4, nextPsico } = computeTargetsFromRotacao();

  nextMesaDirigenteName.textContent = nextMesaDir ? nameOf(nextMesaDir) : "—";
  nextMesaIncorpName.textContent    = nextMesaInc4.length ? nextMesaInc4.map(nameOf).join(", ") : "—";
  nextMesaDesenvName.textContent    = nextMesaDes4.length ? nextMesaDes4.map(nameOf).join(", ") : "—";
  nextPsicoDirigenteName.textContent= nextPsico ? nameOf(nextPsico) : "—";
}

/* ====== RESUMO ====== */
function renderResumo() {
  const active = mediumsAll.filter((m) => m.active === true);

  let p = 0, m = 0, f = 0, ps = 0;
  const mesa = [];

  for (const med of active) {
    const st = statusParaResumo(med);
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
  if (m.group_type === "carencia") return ["P", "F"];
  const base = ["P", "M", "F"];
  if (m.group_type === "dirigente") base.push("PS");
  return base;
}

/* Carência não usa M; se no mapa ainda houver M (legado), trata como P. */
function normalizarStatusCarencia(m) {
  if (m.group_type !== "carencia") return;
  const st = (chamadasMap.get(m.id) || "").toUpperCase();
  if (st === "M") chamadasMap.set(m.id, "P");
}

function statusParaResumo(med) {
  const st = (chamadasMap.get(med.id) || "").toUpperCase();
  if (med.group_type === "carencia" && st === "M") return "P";
  return st;
}

/* Texto de acompanhamento meta carência → desenvolvimento */
function textoMetaCarencia(m) {
  if (m.group_type !== "carencia") return "";
  const metaN = Number(m.carencia_meta_presencas);
  const p = Number(m.presencas || 0);
  if (!Number.isFinite(metaN) || metaN < 1) {
    return " | Carência: defina em Participantes → Editar quantas presenças (P ou PS) são necessárias para ir a Desenvolvimento";
  }
  const falta = Math.max(0, metaN - p);
  if (falta > 0) {
    return ` | Faltam ${falta} presença(ões) para Desenvolvimento (meta ${metaN}; contadas ${p} nas chamadas)`;
  }
  return ` | Meta de ${metaN} presenças atingida — salve a chamada para migrar automaticamente`;
}

function makeRow(m) {
  const wrap = document.createElement("div");
  wrap.className = "itemRow";

  // Destaques por "próximo"
  const isMesaDirNext = m.group_type === "dirigente" && m.id === nextTargets.mesa_dirigente;
  const isPsicoNext   = m.group_type === "dirigente" && m.id === nextTargets.psicografia;
  const isIncorpNext = m.group_type === "incorporacao" && nextTargets.mesa_incorporacao.includes(m.id);
  const isDesenvNext = m.group_type === "desenvolvimento" && nextTargets.mesa_desenvolvimento.includes(m.id);

  if (isMesaDirNext) wrap.classList.add("nextMesa");
  if (isPsicoNext) wrap.classList.add("nextPsico");
  if (isIncorpNext) wrap.classList.add("nextIncorp");
  if (isDesenvNext) wrap.classList.add("nextDesenv");

  const left = document.createElement("div");
  left.className = "itemLeft";

  const starTipMesaOff =
    "Marque “Pode sentar na mesa” em Participantes → Editar para usar esta estrela.";
  const starTipPsicoOff =
    "Marque “Pode psicografar” em Participantes → Editar para usar esta estrela.";

  const starWrap = document.createElement("div");
  if (m.group_type === "dirigente") {
    starWrap.className = "starGroup";
    const okMesa = podeSentarMesa(m);
    const okPsico = podePsicografar(m);

    const lblM = document.createElement("span");
    lblM.className = "starLabel";
    lblM.textContent = "Mesa";
    const starMesa = document.createElement("button");
    starMesa.type = "button";
    starMesa.className = "btnStar btnStarMesa";
    starMesa.textContent = "★";
    if (okMesa) {
      starMesa.title = "Último a dirigir na MESA — a rotação de mesa parte do próximo";
      starMesa.classList.toggle("starred", starLast.mesa_dirigente === m.id);
      starMesa.addEventListener("click", () => {
        starLast.mesa_dirigente = m.id;
        renderChamada();
      });
    } else {
      starMesa.disabled = true;
      starMesa.classList.add("btnStarOff");
      starMesa.title = starTipMesaOff;
    }
    starMesa.setAttribute("aria-label", okMesa ? "Estrela último na mesa" : "Mesa: habilitar em Participantes");
    starWrap.appendChild(lblM);
    starWrap.appendChild(starMesa);

    const lblP = document.createElement("span");
    lblP.className = "starLabel";
    lblP.textContent = "Psico";
    const starPsico = document.createElement("button");
    starPsico.type = "button";
    starPsico.className = "btnStar btnStarPsico";
    starPsico.textContent = "★";
    if (okPsico) {
      starPsico.title = "Último na PSICOGRAFIA — a rotação de psico parte do próximo";
      starPsico.classList.toggle("starred", starLast.psicografia === m.id);
      starPsico.addEventListener("click", () => {
        starLast.psicografia = m.id;
        renderChamada();
      });
    } else {
      starPsico.disabled = true;
      starPsico.classList.add("btnStarOff");
      starPsico.title = starTipPsicoOff;
    }
    starPsico.setAttribute("aria-label", okPsico ? "Estrela último na psicografia" : "Psico: habilitar em Participantes");
    starWrap.appendChild(lblP);
    starWrap.appendChild(starPsico);
  } else if (m.group_type === "incorporacao") {
    const groupKey = "mesa_incorporacao";
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "btnStar";
    starBtn.textContent = "★";
    starBtn.title = "Último a sentar na mesa (Incorporação) — a rotação parte do próximo";
    starBtn.classList.toggle("starred", starLast[groupKey] === m.id);
    starBtn.addEventListener("click", () => {
      starLast[groupKey] = m.id;
      renderChamada();
    });
    starBtn.setAttribute("aria-label", "Estrela último na mesa do grupo");
    starWrap.appendChild(starBtn);
  } else if (m.group_type === "desenvolvimento") {
    const groupKey = "mesa_desenvolvimento";
    const okMesa = podeSentarMesa(m);
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "btnStar";
    starBtn.textContent = "★";
    if (okMesa) {
      starBtn.title = "Último a sentar na mesa neste grupo — a rotação parte do próximo";
      starBtn.classList.toggle("starred", starLast[groupKey] === m.id);
      starBtn.addEventListener("click", () => {
        starLast[groupKey] = m.id;
        renderChamada();
      });
    } else {
      starBtn.disabled = true;
      starBtn.classList.add("btnStarOff");
      starBtn.title = starTipMesaOff;
    }
    starBtn.setAttribute("aria-label", okMesa ? "Estrela último na mesa do grupo" : "Habilitar mesa em Participantes");
    starWrap.appendChild(starBtn);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "starGroup";
    placeholder.style.visibility = "hidden";
    placeholder.style.width = "28px";
    starWrap.appendChild(placeholder);
  }

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = nameOf(m);

  const pres = Number(m.presencas || 0);
  const falt = Number(m.faltas || 0);
  const mesaCount = Number(m.mesa ?? 0);
  const denom = pres + falt;
  const presPct = denom ? Math.round((pres / denom) * 100) : 0;
  const faltPct = denom ? Math.round((falt / denom) * 100) : 0;

  const meta = document.createElement("div");
  meta.className = "itemMeta";
  let metaText = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;
  if ((m.group_type === "incorporacao" || m.group_type === "desenvolvimento") && mesaCount > 0) {
    metaText += ` | Vezes na mesa: ${mesaCount}`;
  }
  if ((m.group_type === "dirigente" || m.group_type === "desenvolvimento") && !podeSentarMesa(m)) {
    metaText += " | Sem rotação na mesa";
  }
  if (m.group_type === "dirigente" && !podePsicografar(m)) {
    metaText += " | Sem psicografia";
  }
  metaText += textoMetaCarencia(m);
  meta.textContent = metaText;

  const leftText = document.createElement("div");
  leftText.className = "itemLeftText";
  leftText.appendChild(title);
  leftText.appendChild(meta);
  left.appendChild(starWrap);
  left.appendChild(leftText);

  const right = document.createElement("div");
  right.className = "itemRight";

  const radios = document.createElement("div");
  radios.className = "radioGroup";

  normalizarStatusCarencia(m);
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
      renderChamada();
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  if (m.group_type === "carencia") {
    const stack = document.createElement("div");
    stack.className = "chamadaPromocaoStack";
    stack.appendChild(radios);

    const btnDev = document.createElement("button");
    btnDev.type = "button";
    btnDev.className = "btn small btnPassarDesenvolvimento";
    btnDev.textContent = "Passar para Desenvolvimento";
    btnDev.title = "Altera o grupo desta pessoa de Carência para Médiuns em Desenvolvimento";
    btnDev.addEventListener("click", async () => {
      const n = nameOf(m);
      const ok = confirm(
        `Passar "${n}" de Carência para Médiuns em Desenvolvimento?\n\nA pessoa passará a aparecer na lista de Desenvolvimento e na rotação (se estiver habilitada para a mesa na aba Participantes).`
      );
      if (!ok) return;
      try {
        await sbPatch(`mediums?id=eq.${m.id}`, { group_type: "desenvolvimento" });
        setOk(`"${n}" agora está em Desenvolvimento.`);
        setErro("");
        await loadMediums();
        renderChamada();
      } catch (e) {
        setErro("Não foi possível alterar o grupo: " + (e.message || String(e)));
      }
    });
    stack.appendChild(btnDev);
    right.appendChild(stack);
  } else if (m.group_type === "desenvolvimento") {
    const stack = document.createElement("div");
    stack.className = "chamadaPromocaoStack";
    stack.appendChild(radios);

    const btnInc = document.createElement("button");
    btnInc.type = "button";
    btnInc.className = "btn small btnPassarIncorporacao";
    btnInc.textContent = "Passar para Incorporação";
    btnInc.title = "Altera o grupo desta pessoa de Desenvolvimento para Médiuns de Incorporação (após incorporar)";
    btnInc.addEventListener("click", async () => {
      const n = nameOf(m);
      const ok = confirm(
        `Passar "${n}" de Desenvolvimento para Incorporação?\n\nUse quando a pessoa já tiver incorporado. Ela passará a aparecer na lista de Incorporação e na rotação da mesa desse grupo (se “pode sentar na mesa” estiver marcado em Participantes).`
      );
      if (!ok) return;
      try {
        await sbPatch(`mediums?id=eq.${m.id}`, { group_type: "incorporacao" });
        setOk(`"${n}" agora está em Incorporação.`);
        setErro("");
        await loadMediums();
        renderChamada();
      } catch (e) {
        setErro("Não foi possível alterar o grupo: " + (e.message || String(e)));
      }
    });
    stack.appendChild(btnInc);
    right.appendChild(stack);
  } else {
    right.appendChild(radios);
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

  // Recalcula targets (para destaque consistente mesmo se mudou active/rotacao)
  renderProximos();

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const car = eligible("carencia");

  for (const m of dir) listaDirigentes.appendChild(makeRow(m));
  for (const m of inc) listaIncorporacao.appendChild(makeRow(m));
  for (const m of des) listaDesenvolvimento.appendChild(makeRow(m));
  for (const m of car) listaCarencia.appendChild(makeRow(m));

  renderResumo();
}

/* ====== SALVAR ====== */
async function persistRotacaoFromClicks() {
  let lastMesaDir = starLast.mesa_dirigente;
  let lastMesaInc = starLast.mesa_incorporacao;
  let lastMesaDes = starLast.mesa_desenvolvimento;
  let lastPsico = starLast.psicografia;

  // Garante que não seja a mesma pessoa em Mesa e Psicografia
  if (lastMesaDir && lastPsico && lastMesaDir === lastPsico) {
    const psList = eligiblePsicoDirigentes();
    lastPsico = computeNextSkip(psList, lastPsico, lastMesaDir)?.id || lastPsico;
  }

  if (lastMesaDir) await sbUpsertRotacao("mesa_dirigente", lastMesaDir);
  if (lastMesaInc) await sbUpsertRotacao("mesa_incorporacao", lastMesaInc);
  if (lastMesaDes) await sbUpsertRotacao("mesa_desenvolvimento", lastMesaDes);
  if (lastPsico) await sbUpsertRotacao("psicografia", lastPsico);
}

async function onSalvarTudo() {
  if (!currentDateISO) return setErro("Selecione a data e clique em Verificar data.");

  try {
    const active = mediumsAll.filter((m) => m.active === true);
    const rows = [];

    for (const m of active) {
      let st = (chamadasMap.get(m.id) || "").toUpperCase();
      if (m.group_type === "carencia" && st === "M") st = "P";
      if (["P", "M", "F", "PS"].includes(st)) {
        rows.push({ medium_id: m.id, data: currentDateISO, status: st });
      }
    }
    if (rows.length) await sbUpsertChamadas(rows);

    let promoted = [];
    try {
      promoted = await syncPresenceStatsFromChamadas();
    } catch (e) {
      console.warn("syncPresenceStatsFromChamadas", e);
    }
    await loadMediums();

    await persistRotacaoFromClicks();
    await loadRotacao();
    renderChamada();

    let msg = "Chamada salva e rotação atualizada.";
    if (promoted.length) {
      msg += ` Promovido(s) para Desenvolvimento (meta na carência): ${promoted.join(", ")}.`;
    }
    setOk(msg);
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
  await loadRotacao(); // Sempre recarrega rotação para mostrar os PRÓXIMOS corretos
  try {
    await syncPresenceStatsFromChamadas();
  } catch (_) { /* ignora */ }
  await loadMediums();
  setOk(`Data carregada: ${iso}`);
  renderChamada();
}

/* ====== IMPRESSÃO: PRÓXIMA TERÇA ====== */
function pad2(n) { return String(n).padStart(2, "0"); }

function toISODate(d) {
  const yy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
}

function nextTuesdayISO(fromDate = new Date()) {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  // 0=domingo ... 2=terça
  let add = (2 - d.getDay() + 7) % 7;
  if (add === 0) add = 7; // se hoje é terça, pega a próxima
  d.setDate(d.getDate() + add);
  return toISODate(d);
}

function formatBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildPrintDoc(dateISO) {
  const { nextMesaDir, nextMesaInc4, nextMesaDes4, nextPsico } = computeTargetsFromRotacao();

  const dir = eligible("dirigente");
  const inc = eligible("incorporacao");
  const des = eligible("desenvolvimento");
  const car = eligible("carencia");

  function rowStyle(m, opts) {
    if (!opts.highlight) return "";
    const h = opts.highlight;
    const printFix = "-webkit-print-color-adjust:exact;print-color-adjust:exact;";
    if (h.mesaDirId && m.id === h.mesaDirId) return `background:#fff4d6 !important;border-left:4px solid #f59e0b;font-weight:600;${printFix}`;
    if (h.psicoId && m.id === h.psicoId) return `background:#ffe3e3 !important;border-left:4px solid #ef4444;font-weight:600;${printFix}`;
    if (h.incIds && h.incIds.includes(m.id)) return `background:#d1fae5 !important;border-left:4px solid #10b981;${printFix}`;
    if (h.desIds && h.desIds.includes(m.id)) return `background:#dbeafe !important;border-left:4px solid #3b82f6;${printFix}`;
    return "";
  }

  function mkTable(list, opts={ ps:false }) {
    const cols = opts.ps ? "<th>PS</th>" : "";
    const rows = list.map((m, i) => {
      const cellStyle = rowStyle(m, opts);
      return `
      <tr>
        <td style="width:36px;text-align:right;${cellStyle}">${i+1}</td>
        <td style="${cellStyle}">${esc(nameOf(m))}</td>
        <td style="text-align:center;${cellStyle}">[ ]</td>
        <td style="text-align:center;${cellStyle}">[ ]</td>
        <td style="text-align:center;${cellStyle}">[ ]</td>
        ${opts.ps ? `<td style="text-align:center;${cellStyle}">[ ]</td>` : ''}
      </tr>
    `;
    }).join("");

    return `
      <table>
        <thead>
          <tr>
            <th style="width:36px;">#</th>
            <th>Nome</th>
            <th>P</th>
            <th>M</th>
            <th>F</th>
            ${cols}
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6">—</td></tr>'}
        </tbody>
      </table>
    `;
  }

  const reservas = `
    <div class="resBox">
      <div><strong>Data:</strong> ${formatBR(dateISO)} (terça-feira)</div>
      <div style="margin-top:6px;">
        <strong>Reservas sugeridas (para conferência):</strong><br/>
        Mesa Dirigente: <span class="tag warn">${esc(nextMesaDir ? nameOf(nextMesaDir) : "—")}</span>
        Psicografia: <span class="tag err">${esc(nextPsico ? nameOf(nextPsico) : "—")}</span><br/>
        Mesa Incorporação: <span class="tag inc">${esc(nextMesaInc4.length ? nextMesaInc4.map(nameOf).join(", ") : "—")}</span><br/>
        Mesa Desenvolvimento: <span class="tag des">${esc(nextMesaDes4.length ? nextMesaDes4.map(nameOf).join(", ") : "—")}</span>
      </div>
      <div style="margin-top:10px; color:#333; font-size:12px;">
        <strong>Marcação na lista:</strong> amarelo = Dirigente (Mesa) | vermelho = Psicografia | verde = 4 Incorporação | azul = 4 Desenvolvimento
      </div>
      <div style="margin-top:6px; color:#666; font-size:11px;">
        Observação: esta impressão é um “backup” para fazer a chamada manualmente se o sistema falhar.
      </div>
    </div>
  `;

  return `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Impressão - Chamada ${formatBR(dateISO)}</title>
  <style>
    body{font-family:Arial, sans-serif; margin:18px; color:#111}
    h1{margin:0 0 6px; font-size:18px}
    h2{margin:18px 0 8px; font-size:14px}
    .resBox{border:1px solid #999; padding:10px; border-radius:8px; background:#f7f7f7}
    .tag{display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; border:1px solid #999}
    .warn{background:#fff4d6; border-color:#f59e0b}
    .err{background:#ffe3e3; border-color:#ef4444}
    .inc{background:#d1fae5; border-color:#10b981}
    .des{background:#dbeafe; border-color:#3b82f6}
    table{width:100%; border-collapse:collapse; margin-top:6px}
    th,td{border:1px solid #999; padding:6px 8px; font-size:12px}
    th{background:#efefef; text-align:left}
    @media print{ .noPrint{display:none} }
    @media print{ td[style*="background"]{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important } }
  </style>
</head>
<body>
  <div class="noPrint" style="text-align:right; margin-bottom:10px;">
    <button onclick="window.print()">Imprimir</button>
    <span style="margin-left:12px; font-size:12px; color:#666;">Dica: ative "Gráficos de fundo" nas opções de impressão para ver as cores.</span>
  </div>

  <h1>Chamada de Médiuns - ${formatBR(dateISO)}</h1>
  ${reservas}

  <h2>Dirigentes</h2>
  ${mkTable(dir, { ps: true, highlight: { mesaDirId: nextMesaDir?.id, psicoId: nextPsico?.id } })}

  <h2>Médiuns de Incorporação</h2>
  ${mkTable(inc, { highlight: { incIds: nextMesaInc4.map(m => m.id) } })}

  <h2>Médiuns em Desenvolvimento</h2>
  ${mkTable(des, { highlight: { desIds: nextMesaDes4.map(m => m.id) } })}

  <h2>Médiuns em Carência</h2>
  ${mkTable(car)}
</body>
</html>
  `;
}

async function onImprimirProxima() {
  try {
    // Garante base atualizada
    await loadMediums();
    await loadRotacao();

    const iso = nextTuesdayISO(new Date());
    const w = window.open("", "_blank");
    if (!w) {
      setErro("Bloqueio de pop-up: permita abrir nova aba para imprimir.");
      return;
    }
    w.document.open();
    w.document.write(buildPrintDoc(iso));
    w.document.close();
  } catch (e) {
    setErro("Erro ao preparar impressão: " + e.message);
  }
}

/* ====== PARTICIPANTES ====== */
function matchesFilter(m) {
  const g = (partFiltroGrupo.value || "").trim();
  const q = (partBusca.value || "").trim().toLowerCase();
  if (g && m.group_type !== g) return false;
  if (q && !nameOf(m).toLowerCase().includes(q)) return false;
  return true;
}

function parseOrdem(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function buildParticipantEditPanel(m, onClose) {
  const panel = document.createElement("div");
  panel.className = "partEditPanel";

  const g = document.createElement("div");
  g.className = "partEditGrid";

  const addField = (labelText, el) => {
    const wrap = document.createElement("div");
    wrap.className = "partEditField";
    const lbl = document.createElement("label");
    lbl.className = "label";
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    wrap.appendChild(el);
    g.appendChild(wrap);
  };

  const inpNome = document.createElement("input");
  inpNome.type = "text";
  inpNome.className = "input";
  inpNome.value = nameOf(m);

  const selGrupo = document.createElement("select");
  selGrupo.className = "input";
  for (const opt of [
    ["dirigente", "Dirigente"],
    ["incorporacao", "Incorporação"],
    ["desenvolvimento", "Desenvolvimento"],
    ["carencia", "Carência"],
  ]) {
    const o = document.createElement("option");
    o.value = opt[0];
    o.textContent = opt[1];
    if (m.group_type === opt[0]) o.selected = true;
    selGrupo.appendChild(o);
  }

  const chkAtivo = document.createElement("input");
  chkAtivo.type = "checkbox";
  chkAtivo.checked = !!m.active;
  const lblAtivo = document.createElement("label");
  lblAtivo.className = "check";
  lblAtivo.appendChild(chkAtivo);
  lblAtivo.appendChild(document.createTextNode(" Ativo (aparece na chamada)"));

  const chkMesa = document.createElement("input");
  chkMesa.type = "checkbox";
  chkMesa.checked = podeSentarMesa(m);
  const lblMesa = document.createElement("label");
  lblMesa.className = "check";
  lblMesa.appendChild(chkMesa);
  lblMesa.appendChild(document.createTextNode(" Pode sentar na mesa (entra na rotação)"));

  const chkPsico = document.createElement("input");
  chkPsico.type = "checkbox";
  chkPsico.checked = podePsicografar(m);
  const lblPsico = document.createElement("label");
  lblPsico.className = "check";
  lblPsico.appendChild(chkPsico);
  lblPsico.appendChild(document.createTextNode(" Pode psicografar (dirigentes)"));

  const inpOG = document.createElement("input");
  inpOG.type = "text";
  inpOG.className = "input";
  inpOG.placeholder = "opcional";
  inpOG.value = m.ordem_grupo != null ? String(m.ordem_grupo) : "";

  const inpSO = document.createElement("input");
  inpSO.type = "text";
  inpSO.className = "input";
  inpSO.placeholder = "opcional";
  inpSO.value = m.sort_order != null ? String(m.sort_order) : "";

  function syncPsicoVisibility() {
    const isDir = selGrupo.value === "dirigente";
    lblPsico.style.display = isDir ? "" : "none";
    if (!isDir) chkPsico.checked = false;
  }
  function syncMesaIncorpVisibility() {
    const isInc = selGrupo.value === "incorporacao";
    lblMesa.style.display = isInc ? "none" : "";
    if (isInc) chkMesa.checked = true;
  }
  const inpMetaCarencia = document.createElement("input");
  inpMetaCarencia.type = "number";
  inpMetaCarencia.min = "1";
  inpMetaCarencia.max = "999";
  inpMetaCarencia.className = "input";
  inpMetaCarencia.placeholder = "Ex.: 6 (vazio = sem meta)";
  {
    const metaN0 = Number(m.carencia_meta_presencas);
    if (Number.isFinite(metaN0) && metaN0 > 0) inpMetaCarencia.value = String(metaN0);
  }

  const wrapMetaCarencia = document.createElement("div");
  wrapMetaCarencia.className = "partEditField partEditMetaCarencia";
  const lblMetaCar = document.createElement("label");
  lblMetaCar.className = "label";
  lblMetaCar.textContent = "Meta na carência (presenças até Desenvolvimento)";
  const hintMetaCar = document.createElement("div");
  hintMetaCar.className = "muted";
  hintMetaCar.style.fontSize = "11px";
  hintMetaCar.style.marginTop = "4px";
  hintMetaCar.textContent =
    "Conta P, M e PS em todas as chamadas salvas. Ao atingir, migra ao salvar a chamada.";
  wrapMetaCarencia.appendChild(lblMetaCar);
  wrapMetaCarencia.appendChild(inpMetaCarencia);
  wrapMetaCarencia.appendChild(hintMetaCar);

  function syncMetaCarenciaVisibility() {
    wrapMetaCarencia.style.display = selGrupo.value === "carencia" ? "" : "none";
  }

  function onGrupoChange() {
    syncPsicoVisibility();
    syncMesaIncorpVisibility();
    syncMetaCarenciaVisibility();
  }
  selGrupo.addEventListener("change", onGrupoChange);

  addField("Nome", inpNome);
  addField("Grupo", selGrupo);
  addField("Ordem grupo", inpOG);
  addField("Ordem na fila (sort_order)", inpSO);
  g.appendChild(wrapMetaCarencia);

  onGrupoChange();

  const checksWrap = document.createElement("div");
  checksWrap.className = "partEditChecks";
  checksWrap.appendChild(lblAtivo);
  checksWrap.appendChild(lblMesa);
  checksWrap.appendChild(lblPsico);
  g.appendChild(checksWrap);

  const actions = document.createElement("div");
  actions.className = "partEditActions";

  const btnSalvar = document.createElement("button");
  btnSalvar.type = "button";
  btnSalvar.className = "btn primary small";
  btnSalvar.textContent = "Salvar";
  btnSalvar.addEventListener("click", async () => {
    const nome = (inpNome.value || "").trim();
    if (!nome) {
      pErr("Informe o nome.");
      return;
    }
    pOk("");
    pErr("");
    const group_type = selGrupo.value;
    const mesaFlag = group_type === "incorporacao" ? true : chkMesa.checked;
    const body = {
      name: nome,
      group_type,
      active: chkAtivo.checked,
      pode_mesa: mesaFlag,
      psicografia: group_type === "dirigente" && chkPsico.checked ? 1 : 0,
      ordem_grupo: parseOrdem(inpOG.value),
      sort_order: parseOrdem(inpSO.value),
      carencia_meta_presencas:
        group_type === "carencia" ? parseMetaCarenciaInput(inpMetaCarencia.value) : null,
    };
    try {
      let okMsg = `Participante atualizado: ${nome}`;
      try {
        await sbPatch(`mediums?id=eq.${m.id}`, body);
      } catch (e1) {
        const t = e1.message || String(e1);
        if (t.includes("carencia_meta_presencas") && t.includes("column")) {
          const b3 = { ...body };
          delete b3.carencia_meta_presencas;
          await sbPatch(`mediums?id=eq.${m.id}`, b3);
          okMsg = `Salvo sem meta na carência. Rode Querys/adicionar_carencia_meta_presencas.sql no Supabase.`;
        } else if (t.includes("pode_mesa") || t.includes("column")) {
          const b2 = { ...body };
          delete b2.pode_mesa;
          delete b2.carencia_meta_presencas;
          b2.mesa = mesaFlag ? 1 : 0;
          await sbPatch(`mediums?id=eq.${m.id}`, b2);
          okMsg = `Salvo (modo legado). Rode os scripts SQL no Supabase se precisar.`;
        } else {
          throw e1;
        }
      }
      pOk(okMsg);
      onClose();
      await reloadParticipants();
    } catch (e) {
      pErr("Erro ao salvar: " + (e.message || String(e)));
    }
  });

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "btn small";
  btnCancel.textContent = "Cancelar";
  btnCancel.addEventListener("click", onClose);

  actions.appendChild(btnSalvar);
  actions.appendChild(btnCancel);
  g.appendChild(actions);
  panel.appendChild(g);
  return panel;
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
    const wrap = document.createElement("div");
    wrap.className = "partRow";

    const row = document.createElement("div");
    row.className = "itemRow";

    const left = document.createElement("div");
    left.className = "itemLeft";

    const nameEl = document.createElement("div");
    nameEl.className = "itemName";
    nameEl.textContent = nameOf(m);

    const metaEl = document.createElement("div");
    metaEl.className = "itemMeta";
    const mesaTxt =
      m.group_type === "incorporacao" ? "Rotação mesa: sim (todo o grupo)" : podeSentarMesa(m) ? "Mesa: sim" : "Mesa: não";
    const psTxt = m.group_type === "dirigente" ? (podePsicografar(m) ? " | Psico: sim" : " | Psico: não") : "";
    const carTxt =
      m.group_type === "carencia"
        ? (() => {
            const metaN = Number(m.carencia_meta_presencas);
            const p = Number(m.presencas || 0);
            if (!Number.isFinite(metaN) || metaN < 1) {
              return " | Carência: sem meta — edite e informe presenças até Dev.";
            }
            const falta = Math.max(0, metaN - p);
            return falta > 0
              ? ` | Carência: faltam ${falta} pres. (meta ${metaN})`
              : ` | Carência: meta ${metaN} ok`;
          })()
        : "";
    metaEl.textContent = `Grupo: ${m.group_type} | Ativo: ${m.active ? "Sim" : "Não"} | ${mesaTxt}${psTxt}${carTxt} | Ordem: ${m.ordem_grupo ?? "-"} / ${m.sort_order ?? "-"}`;

    const leftText = document.createElement("div");
    leftText.className = "itemLeftText";
    leftText.appendChild(nameEl);
    leftText.appendChild(metaEl);
    left.appendChild(leftText);

    const right = document.createElement("div");
    right.className = "itemRight";

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn small";
    btnEdit.type = "button";
    btnEdit.textContent = "Editar";
    btnEdit.title = "Editar participante";

    const btnX = document.createElement("button");
    btnX.className = "btn danger small";
    btnX.type = "button";
    btnX.textContent = "X";
    btnX.title = "Remover (desativar) participante";
    btnX.disabled = !m.active;

    let editPanel = null;
    const closeEdit = () => {
      if (editPanel && editPanel.parentNode) editPanel.remove();
      editPanel = null;
      btnEdit.textContent = "Editar";
    };

    btnEdit.addEventListener("click", () => {
      if (editPanel) {
        closeEdit();
        return;
      }
      editPanel = buildParticipantEditPanel(m, closeEdit);
      wrap.appendChild(editPanel);
      btnEdit.textContent = "Fechar";
    });

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

    right.appendChild(btnEdit);
    right.appendChild(btnX);
    row.appendChild(left);
    row.appendChild(right);
    wrap.appendChild(row);
    listaParticipantes.appendChild(wrap);
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

  const rowNew = {
    name,
    group_type,
    active,
    pode_mesa: novoMesa.checked,
    mesa: 0,
    psicografia: group_type === "dirigente" && novoPsico.checked ? 1 : 0,
    presencas: 0,
    faltas: 0,
    ordem_grupo: null,
    sort_order: null
  };
  if (group_type === "carencia") {
    const mc = parseMetaCarenciaInput(novoMetaCarencia.value);
    if (mc != null) rowNew.carencia_meta_presencas = mc;
  }

  try {
    let okAdd = "Participante adicionado.";
    try {
      await sbPost("mediums", [rowNew], "return=minimal");
    } catch (e1) {
      const t = e1.message || String(e1);
      if (t.includes("carencia_meta_presencas")) {
        const b = { ...rowNew };
        delete b.carencia_meta_presencas;
        await sbPost("mediums", [b], "return=minimal");
        okAdd =
          "Participante adicionado. Rode Querys/adicionar_carencia_meta_presencas.sql no Supabase para usar meta na carência.";
      } else if (t.includes("pode_mesa") || t.includes("column")) {
        const legacy = { ...rowNew };
        delete legacy.pode_mesa;
        delete legacy.carencia_meta_presencas;
        legacy.mesa = novoMesa.checked ? 1 : 0;
        await sbPost("mediums", [legacy], "return=minimal");
        okAdd =
          "Participante adicionado. Rode os scripts SQL no Supabase (pode_mesa / meta carência) se precisar.";
      } else {
        throw e1;
      }
    }
    pOk(okAdd);
    novoNome.value = "";
    novoMesa.checked = false;
    novoPsico.checked = false;
    novoAtivo.checked = true;
    novoMetaCarencia.value = "";
    syncNovoMetaCarenciaWrap();
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

/* Carrega a última chamada para pré-preencher data e status */
async function loadUltimaChamada() {
  try {
    const rows = await sbGet("chamadas?select=data&order=data.desc&limit=1");
    if (rows.length && rows[0].data) {
      currentDateISO = rows[0].data;
      dataChamada.value = currentDateISO;
      await loadChamadasForDate(currentDateISO);
    }
  } catch (_) { /* ignora */ }
}

/* ====== INIT ====== */
(async function init() {
  try {
    setConn(false, "Conectando...");
    await sbGet("rotacao?select=group_type,last_medium_id&limit=1");
    setConn(true, "Supabase OK");

    await loadMediums();
    await loadRotacao();
    await loadUltimaChamada();

    let promovidos = [];
    try {
      promovidos = await syncPresenceStatsFromChamadas();
    } catch (_) { /* ignora */ }
    await loadMediums();

    let msgInit = currentDateISO
      ? `Última chamada: ${currentDateISO}.`
      : "Selecione a data e clique em Verificar data.";
    if (promovidos.length) {
      msgInit += ` Promovido(s) para Desenvolvimento (meta na carência): ${promovidos.join(", ")}.`;
    }
    setOk(msgInit);
    renderChamada();
    renderParticipants();
  } catch (e) {
    setConn(false, "Erro");
    setErro("Falha ao conectar: " + e.message);
  }

  novoGrupo.addEventListener("change", syncNovoMetaCarenciaWrap);
  syncNovoMetaCarenciaWrap();

  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvarTudo);
  btnImprimirProxima.addEventListener("click", onImprimirProxima);

  const btnForcarAtualizacao = document.getElementById("btnForcarAtualizacao");
  if (btnForcarAtualizacao) {
    btnForcarAtualizacao.addEventListener("click", () => {
      window.location.replace(window.location.pathname + "?nocache=" + Date.now());
    });
  }

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
