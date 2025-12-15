/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

/** ✅ COLE AQUI (APENAS ANON PUBLIC KEY) */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ✅ NOMES DO SEU BANCO (conforme print) */
const TB_MEDIUMS   = "mediums";
const TB_CHAMADAS  = "chamadas";
const TB_FERIADOS  = "feriados";

const COL_DATE     = "data";
const COL_MEDIUMID = "medium_id";
const COL_STATUS   = "status";

/** ===== IDs UI ===== */
const $ = (id) => document.getElementById(id);

const elStatusPill = $("statusPill");
const elStatusText = $("statusText");
const elMsgTopo = $("msgTopo");
const elMsgErro = $("msgErro");

const elData = $("dataChamada");
const btnVerificar = $("btnVerificar");
const btnSalvar = $("btnSalvar");

const elResumoGeral = $("resumoGeral");
const elReservasMesa = $("reservasMesa");

const listaDirigentes = $("listaDirigentes");
const listaIncorporacao = $("listaIncorporacao");
const listaSustentacao = $("listaSustentacao");
const listaDesenvolvimento = $("listaDesenvolvimento");
const listaCarencia = $("listaCarencia");

const resumoDirigentes = $("resumoDirigentes");
const resumoIncorporacao = $("resumoIncorporacao");
const resumoSustentacao = $("resumoSustentacao");
const resumoDesenvolvimento = $("resumoDesenvolvimento");
const resumoCarencia = $("resumoCarencia");

/** ===== Estado ===== */
let feriadosSet = new Set();          // YYYY-MM-DD
let mediums = [];                     // {id,name,group_type}
let statusPorMedium = new Map();      // medium_id -> "P"|"M"|"F"|"PS"|""  (PS só dirigentes)
let dataAtual = "";

/** ===== UI helpers ===== */
function setMsg(okMsg = "", errMsg = "") {
  elMsgTopo.textContent = okMsg || "";
  elMsgErro.textContent = errMsg || "";
}

function setPill(kind, text, sub = "") {
  elStatusPill.className =
    "pill " + (kind === "ok" ? "pill-ok" : kind === "bad" ? "pill-bad" : "pill-warn");
  elStatusPill.textContent = text;
  elStatusText.textContent = sub;
}

function isoFromInputDate(value) {
  return (value || "").trim(); // input date já vem YYYY-MM-DD
}

function isTuesday(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.getUTCDay() === 2;
}

function prettyBR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** ===== Supabase REST ===== */
function supaHeaders() {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supaGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: supaHeaders() });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJsonParse(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
  return safeJsonParse(t) ?? [];
}

async function supaDeleteChamadasByDate(iso) {
  // DELETE /chamadas?data=eq.2025-12-02
  const url = `${SUPABASE_URL}/rest/v1/${TB_CHAMADAS}?${COL_DATE}=eq.${encodeURIComponent(iso)}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: {
      ...supaHeaders(),
      "Prefer": "return=minimal",
    },
  });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJsonParse(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
}

async function supaInsertChamadas(rows) {
  const url = `${SUPABASE_URL}/rest/v1/${TB_CHAMADAS}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      ...supaHeaders(),
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJsonParse(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
}

/** ===== Grupos ===== */
function normGroup(g) {
  return (g || "").toLowerCase().trim();
}

function groupKeyFromDB(group_type) {
  const k = normGroup(group_type);
  if (k.includes("dir")) return "dirigentes";
  if (k.includes("inc")) return "incorporacao";
  if (k.includes("sus")) return "sustentacao";
  if (k.includes("des")) return "desenvolvimento";
  if (k.includes("car")) return "carencia";
  return "desenvolvimento";
}

function allowedOptionsForGroup(groupKey) {
  // PS só em Dirigentes; Carência só P/F
  if (groupKey === "dirigentes") return ["P", "M", "F", "PS"];
  if (groupKey === "carencia") return ["P", "F"];
  return ["P", "M", "F"];
}

/** ===== Percentuais ===== */
function calcResumo(statusList) {
  let P = 0, M = 0, F = 0, PS = 0;
  for (const s of statusList) {
    if (s === "P") P++;
    else if (s === "M") M++;
    else if (s === "F") F++;
    else if (s === "PS") PS++;
  }
  const totalPMF = P + M + F;
  const presenca = P + M;
  const percPres = totalPMF ? Math.round((presenca / totalPMF) * 100) : 0;
  const percFalta = totalPMF ? Math.round((F / totalPMF) * 100) : 0;
  return { P, M, F, PS, totalPMF, presenca, percPres, percFalta };
}

function resumoText(r) {
  const base = `P:${r.P}  M:${r.M}  F:${r.F}`;
  const ps = r.PS ? `  PS:${r.PS}` : "";
  const perc = r.totalPMF ? `  | Presença: ${r.percPres}%  | Faltas: ${r.percFalta}%` : `  | —`;
  return base + ps + perc;
}

/** ===== Render ===== */
function clearLists() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaSustentacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
}

function renderAll() {
  clearLists();

  const groups = {
    dirigentes: [],
    incorporacao: [],
    sustentacao: [],
    desenvolvimento: [],
    carencia: [],
  };

  for (const m of mediums) {
    const key = groupKeyFromDB(m.group_type);
    groups[key].push(m);
  }

  renderGroup("dirigentes", groups.dirigentes, listaDirigentes, resumoDirigentes);
  renderGroup("incorporacao", groups.incorporacao, listaIncorporacao, resumoIncorporacao);
  renderGroup("sustentacao", groups.sustentacao, listaSustentacao, resumoSustentacao);
  renderGroup("desenvolvimento", groups.desenvolvimento, listaDesenvolvimento, resumoDesenvolvimento);
  renderGroup("carencia", groups.carencia, listaCarencia, resumoCarencia);

  renderResumoGeral(groups);
}

function renderGroup(groupKey, arr, container, resumoEl) {
  arr.sort((a, b) => (a.name || "").localeCompare((b.name || ""), "pt-BR"));

  const opts = allowedOptionsForGroup(groupKey);

  const statusList = arr.map(m => statusPorMedium.get(m.id) || "").filter(Boolean);
  const r = calcResumo(statusList);
  resumoEl.textContent = `(${arr.length} nomes) ` + resumoText(r);

  for (const m of arr) {
    const current = (statusPorMedium.get(m.id) || "").toUpperCase();

    const item = document.createElement("div");
    item.className = "item";

    // PS vermelho apenas Dirigentes
    if (groupKey === "dirigentes" && current === "PS") {
      item.classList.add("psicografia");
    }

    const left = document.createElement("div");
    left.className = "left";
    left.textContent = m.name || "(sem nome)";

    const right = document.createElement("div");
    right.className = "right";

    const radios = document.createElement("div");
    radios.className = "radios";

    const rname = `m_${m.id}`;
    for (const o of opts) {
      const label = document.createElement("label");
      label.className = "radioOpt";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = rname;
      input.value = o;
      input.checked = (current === o);

      input.addEventListener("change", () => {
        statusPorMedium.set(m.id, o);
        renderAll();
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + o));
      radios.appendChild(label);
    }

    const btnLimpar = document.createElement("button");
    btnLimpar.className = "btnSmall";
    btnLimpar.textContent = "Limpar";
    btnLimpar.addEventListener("click", () => {
      statusPorMedium.set(m.id, "");
      renderAll();
    });

    right.appendChild(radios);
    right.appendChild(btnLimpar);

    item.appendChild(left);
    item.appendChild(right);
    container.appendChild(item);
  }
}

function renderResumoGeral(groups) {
  const all = [
    ...groups.dirigentes,
    ...groups.incorporacao,
    ...groups.sustentacao,
    ...groups.desenvolvimento,
    ...groups.carencia,
  ];

  const statusList = all.map(m => statusPorMedium.get(m.id) || "").filter(Boolean);
  const r = calcResumo(statusList);
  elResumoGeral.textContent = resumoText(r);

  const mesaNames = [];
  for (const m of all) {
    if ((statusPorMedium.get(m.id) || "").toUpperCase() === "M") {
      mesaNames.push(m.name);
    }
  }
  mesaNames.sort((a, b) => (a || "").localeCompare((b || ""), "pt-BR"));
  elReservasMesa.textContent = mesaNames.length ? mesaNames.join(", ") : "—";
}

/** ===== Data / feriados ===== */
async function verificarData() {
  const iso = isoFromInputDate(elData.value);
  setMsg("", "");

  if (!iso) { setMsg("", "Escolha uma data."); return false; }
  if (!isTuesday(iso)) { setMsg("", "A reunião é na terça-feira. Escolha uma terça."); return false; }
  if (feriadosSet.has(iso)) { setMsg("", "Essa data é feriado. Não pode haver reunião."); return false; }

  setMsg("Data válida.", "");
  return true;
}

/** ===== Load ===== */
async function loadFeriados() {
  const rows = await supaGet(`${TB_FERIADOS}?select=${COL_DATE}`);
  feriadosSet = new Set(rows.map(r => r[COL_DATE]).filter(Boolean));
}

async function loadMediums() {
  const rows = await supaGet(`${TB_MEDIUMS}?select=id,name,group_type&order=name.asc`);
  mediums = rows || [];
}

async function loadChamadasByDate(iso) {
  // /chamadas?select=medium_id,status&data=eq.2025-12-02
  const rows = await supaGet(
    `${TB_CHAMADAS}?select=${COL_MEDIUMID},${COL_STATUS}&${COL_DATE}=eq.${encodeURIComponent(iso)}`
  );

  statusPorMedium = new Map();
  for (const r of rows) {
    const mid = r[COL_MEDIUMID];
    const st = (r[COL_STATUS] || "").toUpperCase();
    if (mid) statusPorMedium.set(mid, st);
  }

  // segurança: PS não pode aparecer fora de Dirigentes
  for (const m of mediums) {
    const g = groupKeyFromDB(m.group_type);
    const st = statusPorMedium.get(m.id);
    if (st === "PS" && g !== "dirigentes") statusPorMedium.set(m.id, "");
  }
}

/** ===== Save ===== */
async function salvar() {
  setMsg("", "");

  const iso = isoFromInputDate(elData.value);
  if (!iso) { setMsg("", "Escolha uma data."); return; }

  const ok = await verificarData();
  if (!ok) return;

  // monta INSERT
  const rows = [];
  for (const m of mediums) {
    const g = groupKeyFromDB(m.group_type);
    const allowed = allowedOptionsForGroup(g);
    let st = (statusPorMedium.get(m.id) || "").toUpperCase();

    if (st && !allowed.includes(st)) st = "";
    if (st) {
      rows.push({
        [COL_MEDIUMID]: m.id,
        [COL_DATE]: iso,
        [COL_STATUS]: st,
      });
    }
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    // estratégia imbatível: apaga a data e re-insere
    await supaDeleteChamadasByDate(iso);
    if (rows.length) await supaInsertChamadas(rows);

    setMsg("Chamada salva com sucesso ✅", "");
    await loadChamadasByDate(iso);
    renderAll();
  } catch (e) {
    setMsg("", "Erro ao salvar: " + (e?.message || e));
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar chamada";
  }
}

/** ===== Conexão ===== */
async function testConnection() {
  await supaGet(`${TB_MEDIUMS}?select=id&limit=1`);
}

/** ===== Boot ===== */
async function boot() {
  setPill("warn", "● Conectando...", "Testando chave e endpoint...");

  if (!SUPABASE_URL.includes("supabase.co") || SUPABASE_ANON_KEY.includes("COLE_SUA")) {
    setPill("bad", "● Erro", "Cole SUPABASE_URL e SUPABASE_ANON_KEY no app.js");
    return;
  }

  try {
    await testConnection();
    setPill("ok", "● Conectado ✅", "Supabase OK");

    await loadFeriados();
    await loadMediums();

    // tenta hoje (se terça e não feriado)
    const hoje = new Date();
    const isoHoje = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0))
      .toISOString()
      .slice(0, 10);

    if (isTuesday(isoHoje) && !feriadosSet.has(isoHoje)) {
      elData.value = isoHoje;
      dataAtual = isoHoje;
      await loadChamadasByDate(isoHoje);
    } else {
      dataAtual = "";
      statusPorMedium = new Map();
    }

    renderAll();
    setMsg("Selecione a data e clique em “Verificar data”.", "");

  } catch (e) {
    const msg = (e?.message || String(e));
    setPill("bad", "● Erro", msg);
    setMsg("", msg);
  }
}

/** ===== Eventos ===== */
btnVerificar.addEventListener("click", async () => {
  const ok = await verificarData();
  if (!ok) return;

  const iso = isoFromInputDate(elData.value);
  if (!iso) return;

  if (iso !== dataAtual) {
    dataAtual = iso;
    setMsg("Carregando marcações da data " + prettyBR(iso) + "...", "");
    try {
      await loadChamadasByDate(iso);
      renderAll();
      setMsg("Pronto.", "");
    } catch (e) {
      setMsg("", "Erro ao carregar marcações: " + (e?.message || e));
    }
  }
});

btnSalvar.addEventListener("click", salvar);

boot();
