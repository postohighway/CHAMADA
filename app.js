/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

/** ✅ COLE AQUI (APENAS ANON PUBLIC KEY) */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

const TB_MEDIUMS = "mediums";
const TB_CHAMADAS = "chamadas";
const TB_FERIADOS = "feriados";

const COL_DATE = "data";
const COL_MEDIUMID = "medium_id";
const COL_STATUS = "status";

const $ = (id) => document.getElementById(id);

/** UI */
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

/** Estado */
let feriadosSet = new Set(); // YYYY-MM-DD
let mediums = [];            // rows de mediums
let statusPorMedium = new Map(); // medium_id -> P/M/F/PS/""
let dataAtual = "";

/** Helpers */
function setMsg(ok = "", err = "") {
  elMsgTopo.textContent = ok;
  elMsgErro.textContent = err;
}

function setPill(kind, text, sub = "") {
  elStatusPill.className = `pill ${kind || ""}`.trim();
  elStatusPill.textContent = text;
  elStatusText.textContent = sub;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function isoFromDateInput(v) {
  return (v || "").trim(); // input date -> YYYY-MM-DD
}

function isTuesday(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.getUTCDay() === 2;
}

function norm(s) {
  return (s || "").toLowerCase().trim();
}

function groupKey(group_type) {
  const g = norm(group_type);
  if (g.includes("dir")) return "dirigentes";
  if (g.includes("inc")) return "incorporacao";
  if (g.includes("sus")) return "sustentacao";
  if (g.includes("des")) return "desenvolvimento";
  if (g.includes("car")) return "carencia";
  return "desenvolvimento";
}

function allowed(group) {
  if (group === "dirigentes") return ["P", "M", "F", "PS"];
  if (group === "carencia") return ["P", "F"];
  return ["P", "M", "F"];
}

function calcPessoa(m) {
  const pres = Number(m.presencas || 0);
  const falt = Number(m.faltas || 0);
  const total = pres + falt;
  const pPres = total ? Math.round((pres / total) * 100) : 0;
  const pFalt = total ? Math.round((falt / total) * 100) : 0;
  return { pres, falt, total, pPres, pFalt };
}

/** Supabase REST */
function headers() {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function supaGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: headers() });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJson(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
  return safeJson(t) ?? [];
}

async function supaDeleteChamadasByDate(iso) {
  const url = `${SUPABASE_URL}/rest/v1/${TB_CHAMADAS}?${COL_DATE}=eq.${encodeURIComponent(iso)}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { ...headers(), "Prefer": "return=minimal" },
  });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJson(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
}

async function supaInsertChamadas(rows) {
  const url = `${SUPABASE_URL}/rest/v1/${TB_CHAMADAS}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers(), "Prefer": "return=minimal" },
    body: JSON.stringify(rows),
  });
  const t = await r.text();
  if (!r.ok) {
    const j = safeJson(t);
    throw new Error(j?.message || t || `HTTP ${r.status}`);
  }
}

/** Validação de data */
async function verificarData() {
  const iso = isoFromDateInput(elData.value);
  setMsg("", "");

  if (!iso) { setMsg("", "Escolha uma data."); return false; }
  if (!isTuesday(iso)) { setMsg("", "A reunião é terça-feira. Escolha uma terça."); return false; }
  if (feriadosSet.has(iso)) { setMsg("", "Essa data está em feriados. Não pode haver reunião."); return false; }

  setMsg("Data válida.", "");
  return true;
}

/** Load */
async function loadFeriados() {
  const rows = await supaGet(`${TB_FERIADOS}?select=${COL_DATE}`);
  feriadosSet = new Set(rows.map(r => r[COL_DATE]).filter(Boolean));
}

async function loadMediums() {
  // Puxa também presencas/faltas para mostrar % na tela
  mediums = await supaGet(`${TB_MEDIUMS}?select=id,name,group_type,presencas,faltas&order=name.asc`);
}

async function loadChamadas(iso) {
  const rows = await supaGet(
    `${TB_CHAMADAS}?select=${COL_MEDIUMID},${COL_STATUS}&${COL_DATE}=eq.${encodeURIComponent(iso)}`
  );

  statusPorMedium = new Map();
  for (const r of rows) {
    const mid = r[COL_MEDIUMID];
    const st = (r[COL_STATUS] || "").toUpperCase();
    if (mid) statusPorMedium.set(mid, st);
  }

  // trava PS fora de dirigentes
  for (const m of mediums) {
    const g = groupKey(m.group_type);
    const st = statusPorMedium.get(m.id);
    if (st === "PS" && g !== "dirigentes") statusPorMedium.set(m.id, "");
  }
}

/** Render */
function clearAll() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaSustentacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
}

function resumoGrupo(arr, group) {
  let P=0,M=0,F=0,PS=0;
  for (const m of arr) {
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    if (st === "P") P++;
    else if (st === "M") M++;
    else if (st === "F") F++;
    else if (st === "PS") PS++;
  }
  const total = P+M+F;
  const pres = P+M;
  const percPres = total ? Math.round((pres/total)*100) : 0;
  const percFalt = total ? Math.round((F/total)*100) : 0;

  // PS só para dirigentes
  const psTxt = (group === "dirigentes") ? ` | PS:${PS}` : "";
  return `P:${P} M:${M} F:${F}${psTxt} | Presença:${percPres}% | Faltas:${percFalt}%`;
}

function renderGrupo(container, resumoEl, group, arr) {
  const opts = allowed(group);
  resumoEl.textContent = `(${arr.length}) ${resumoGrupo(arr, group)}`;

  for (const m of arr) {
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    const pessoa = calcPessoa(m);

    const row = document.createElement("div");
    row.className = "item" + (group==="dirigentes" && st==="PS" ? " ps" : "");

    const nameBlock = document.createElement("div");
    nameBlock.className = "nameBlock";

    const nome = document.createElement("div");
    nome.className = "nome";
    nome.textContent = m.name || "(sem nome)";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Presenças: ${pessoa.pres} | Faltas: ${pessoa.falt} | Presença: ${pessoa.pPres}% | Faltas: ${pessoa.pFalt}%`;

    nameBlock.appendChild(nome);
    nameBlock.appendChild(meta);

    const controls = document.createElement("div");
    controls.className = "controls";

    const radios = document.createElement("div");
    radios.className = "radios";
    const rname = `m_${m.id}`;

    for (const o of opts) {
      const lab = document.createElement("label");
      lab.className = "radioOpt";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = rname;
      inp.value = o;
      inp.checked = (st === o);

      inp.addEventListener("change", () => {
        statusPorMedium.set(m.id, o);
        renderAll();
      });

      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(o));
      radios.appendChild(lab);
    }

    const btnLimpar = document.createElement("button");
    btnLimpar.className = "btnSmall";
    btnLimpar.textContent = "Limpar";
    btnLimpar.addEventListener("click", () => {
      statusPorMedium.set(m.id, "");
      renderAll();
    });

    controls.appendChild(radios);
    controls.appendChild(btnLimpar);

    row.appendChild(nameBlock);
    row.appendChild(controls);

    container.appendChild(row);
  }
}

function renderResumoGeral(everyone) {
  let P=0,M=0,F=0,PS=0;
  const mesaNames = [];

  for (const m of everyone) {
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    if (st === "P") P++;
    else if (st === "M") { M++; mesaNames.push(m.name); }
    else if (st === "F") F++;
    else if (st === "PS") PS++;
  }

  const total = P+M+F;
  const pres = P+M;
  const percPres = total ? Math.round((pres/total)*100) : 0;
  const percFalt = total ? Math.round((F/total)*100) : 0;

  elResumoGeral.textContent = `P:${P} M:${M} F:${F} PS:${PS} | Presença:${percPres}% | Faltas:${percFalt}%`;

  mesaNames.sort((a,b)=> (a||"").localeCompare((b||""), "pt-BR"));
  elReservasMesa.textContent = mesaNames.length ? mesaNames.join(", ") : "—";
}

function renderAll() {
  clearAll();

  const groups = {
    dirigentes: [],
    incorporacao: [],
    sustentacao: [],
    desenvolvimento: [],
    carencia: []
  };

  for (const m of mediums) {
    groups[groupKey(m.group_type)].push(m);
  }

  // ordem alfabética
  for (const k of Object.keys(groups)) {
    groups[k].sort((a,b)=>(a.name||"").localeCompare((b.name||""), "pt-BR"));
  }

  renderGrupo(listaDirigentes, resumoDirigentes, "dirigentes", groups.dirigentes);
  renderGrupo(listaIncorporacao, resumoIncorporacao, "incorporacao", groups.incorporacao);
  renderGrupo(listaSustentacao, resumoSustentacao, "sustentacao", groups.sustentacao);
  renderGrupo(listaDesenvolvimento, resumoDesenvolvimento, "desenvolvimento", groups.desenvolvimento);
  renderGrupo(listaCarencia, resumoCarencia, "carencia", groups.carencia);

  const everyone = [
    ...groups.dirigentes,
    ...groups.incorporacao,
    ...groups.sustentacao,
    ...groups.desenvolvimento,
    ...groups.carencia
  ];
  renderResumoGeral(everyone);
}

/** Salvar */
async function salvar() {
  setMsg("", "");
  const iso = isoFromDateInput(elData.value);
  if (!iso) { setMsg("", "Escolha uma data."); return; }

  const ok = await verificarData();
  if (!ok) return;

  // monta linhas para INSERT
  const rows = [];
  for (const m of mediums) {
    const g = groupKey(m.group_type);
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    if (!st) continue;

    // valida por grupo
    if (!allowed(g).includes(st)) continue;

    rows.push({
      [COL_MEDIUMID]: m.id,
      [COL_DATE]: iso,
      [COL_STATUS]: st
    });
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    await supaDeleteChamadasByDate(iso);
    if (rows.length) await supaInsertChamadas(rows);

    setMsg("Chamada salva com sucesso ✅", "");
    await loadChamadas(iso);
    renderAll();
  } catch (e) {
    setMsg("", "Erro ao salvar: " + (e?.message || e));
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar chamada";
  }
}

/** Boot */
async function boot() {
  setPill("warn", "● Conectando...", "Testando Supabase...");

  if (!SUPABASE_URL.includes("supabase.co") || SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
    setPill("bad", "● Erro", "Cole SUPABASE_URL e SUPABASE_ANON_KEY no app.js");
    return;
  }

  try {
    // teste simples
    await supaGet(`${TB_MEDIUMS}?select=id&limit=1`);

    setPill("ok", "● Conectado ✅", "Supabase OK");

    await loadFeriados();
    await loadMediums();

    renderAll();
    setMsg("Selecione a data e clique em “Verificar data”.", "");

  } catch (e) {
    setPill("bad", "● Erro", e?.message || String(e));
    setMsg("", e?.message || String(e));
  }
}

/** Eventos */
btnVerificar.addEventListener("click", async () => {
  const ok = await verificarData();
  if (!ok) return;

  const iso = isoFromDateInput(elData.value);
  if (!iso) return;

  if (iso !== dataAtual) {
    dataAtual = iso;
    setMsg("Carregando marcações...", "");
    try {
      await loadChamadas(iso);
      renderAll();
      setMsg("Pronto", "");
    } catch (e) {
      setMsg("", "Erro ao carregar: " + (e?.message || e));
    }
  } else {
    setMsg("Data já carregada. Pode marcar e salvar.", "");
  }
});

btnSalvar.addEventListener("click", salvar);

boot();

