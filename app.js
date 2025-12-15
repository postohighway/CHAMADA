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
const TB_ROTACAO = "rotacao";

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
let feriadosSet = new Set();            // YYYY-MM-DD
let mediums = [];                       // rows mediums
let statusPorMedium = new Map();        // medium_id -> P/M/F/PS/""
let dataAtual = "";

// rotação
let rotacaoLast = new Map();            // group_type -> last_medium_id
let nextStartByGroup = new Map();       // grupo (key) -> next medium id (ponto de início amarelo)
let nextPsId = "";                      // próximo da psicografia (destacado)

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
  return (v || "").trim();
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

async function supaDeleteBy(table, where) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${where}`;
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

async function supaInsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
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
  // puxa também mesa/psicografia para elegibilidade e destaques
  mediums = await supaGet(`${TB_MEDIUMS}?select=id,name,group_type,presencas,faltas,mesa,psicografia&order=name.asc`);
}

async function loadRotacao() {
  const rows = await supaGet(`${TB_ROTACAO}?select=group_type,last_medium_id`);
  rotacaoLast = new Map();
  for (const r of rows) {
    if (r.group_type) rotacaoLast.set(String(r.group_type), r.last_medium_id || "");
  }
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

/** Rotação - cálculo do "próximo" */
function nextAfter(lastId, list) {
  if (!list.length) return "";
  const idx = list.findIndex(x => x.id === lastId);
  if (idx === -1) return list[0].id;
  return list[(idx + 1) % list.length].id;
}

function computeRotacaoHighlights(groups) {
  nextStartByGroup = new Map();

  // Rotação da mesa: usamos apenas os elegíveis (mesa=1) em incorp/sust
  const incEligible = groups.incorporacao.filter(m => Number(m.mesa || 0) === 1);
  const susEligible = groups.sustentacao.filter(m => Number(m.mesa || 0) === 1);

  const lastInc = rotacaoLast.get("incorporacao") || rotacaoLast.get("incorporação") || "";
  const lastSus = rotacaoLast.get("sustentacao") || rotacaoLast.get("sustentação") || "";

  const nextInc = nextAfter(lastInc, incEligible);
  const nextSus = nextAfter(lastSus, susEligible);

  if (nextInc) nextStartByGroup.set("incorporacao", nextInc);
  if (nextSus) nextStartByGroup.set("sustentacao", nextSus);

  // Psicografia: elegíveis com psicografia=1 dentro de dirigentes
  const psEligible = groups.dirigentes.filter(m => Number(m.psicografia || 0) === 1);

  const lastPs = rotacaoLast.get("psicografia") || "";
  nextPsId = nextAfter(lastPs, psEligible);
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
  const psTxt = (group === "dirigentes") ? ` | PS:${PS}` : "";
  return `P:${P} M:${M} F:${F}${psTxt} | Presença:${percPres}% | Faltas:${percFalt}%`;
}

function renderGrupo(container, resumoEl, group, arr) {
  const opts = allowed(group);
  resumoEl.textContent = `(${arr.length}) ${resumoGrupo(arr, group)}`;

  const startId = nextStartByGroup.get(group) || "";

  for (const m of arr) {
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    const pessoa = calcPessoa(m);

    const row = document.createElement("div");

    // Destaque PS automático (vermelho) e destaque ponto de início (amarelo)
    const isPsAuto = (group === "dirigentes" && nextPsId && m.id === nextPsId);
    const isStart = (startId && m.id === startId);

    row.className = "item"
      + (isStart ? " nextStart" : "")
      + (isPsAuto ? " psAuto" : "")
      + (group==="dirigentes" && st==="PS" ? " ps" : "");

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

    // Badges (amarelo / psicografia)
    const badges = document.createElement("div");
    badges.style.display = "flex";
    badges.style.gap = "8px";
    badges.style.marginTop = "6px";
    badges.style.flexWrap = "wrap";

    if (isStart) {
      const b = document.createElement("span");
      b.className = "badgeStart";
      b.textContent = "🟡 Início da rotação (Mesa)";
      badges.appendChild(b);
    }

    if (isPsAuto) {
      const b = document.createElement("span");
      b.className = "badgePS";
      b.textContent = "🔴 Psicografia (próximo)";
      badges.appendChild(b);
    }

    if (badges.childNodes.length) nameBlock.appendChild(badges);

    const controls = document.createElement("div");
    controls.className = "controls";

    const radios = document.createElement("div");
    radios.className = "radios";
    const rname = `m_${m.id}`;

    // regras extras:
    // - PS só aparece em dirigentes
    // - M só aparece para quem é elegível mesa=1 (exceto dirigentes, onde M existe normal)
    const mesaEligible = Number(m.mesa || 0) === 1;

    for (const o of opts) {
      if (o === "PS" && group !== "dirigentes") continue;
      if (o === "M" && group !== "dirigentes" && group !== "carencia" && !mesaEligible) {
        // para incorp/sust/desenvolvimento: só mostra M se mesa=1
        continue;
      }

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

  for (const m of mediums) groups[groupKey(m.group_type)].push(m);

  for (const k of Object.keys(groups)) {
    groups[k].sort((a,b)=>(a.name||"").localeCompare((b.name||""), "pt-BR"));
  }

  // calcula destaques da rotação
  computeRotacaoHighlights(groups);

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

/** Salvar + atualizar rotação */
async function salvar() {
  setMsg("", "");
  const iso = isoFromDateInput(elData.value);
  if (!iso) { setMsg("", "Escolha uma data."); return; }

  const ok = await verificarData();
  if (!ok) return;

  // INSERT chamadas
  const callRows = [];
  // para rotação:
  const lastMByGroup = new Map(); // "incorporacao"/"sustentacao" -> medium_id
  let psSelecionado = "";         // medium_id

  for (const m of mediums) {
    const g = groupKey(m.group_type);
    const st = (statusPorMedium.get(m.id) || "").toUpperCase();
    if (!st) continue;

    // valida por grupo
    if (!allowed(g).includes(st)) continue;

    callRows.push({
      [COL_MEDIUMID]: m.id,
      [COL_DATE]: iso,
      [COL_STATUS]: st
    });

    if (st === "M") {
      // atualiza rotação só para incorp/sust (mesa)
      if (g === "incorporacao" || g === "sustentacao") {
        lastMByGroup.set(g, m.id);
      }
    }
    if (st === "PS" && g === "dirigentes") {
      psSelecionado = m.id;
    }
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    // Salva chamadas
    await supaDeleteBy(TB_CHAMADAS, `${COL_DATE}=eq.${encodeURIComponent(iso)}`);
    if (callRows.length) await supaInsert(TB_CHAMADAS, callRows);

    // Atualiza rotação mesa (se marcou M)
    const now = new Date().toISOString();

    for (const [g, mid] of lastMByGroup.entries()) {
      await supaDeleteBy(TB_ROTACAO, `group_type=eq.${encodeURIComponent(g)}`);
      await supaInsert(TB_ROTACAO, [{ group_type: g, last_medium_id: mid, updated_at: now }]);
    }

    // Atualiza rotação psicografia (se marcou PS)
    if (psSelecionado) {
      await supaDeleteBy(TB_ROTACAO, `group_type=eq.psicografia`);
      await supaInsert(TB_ROTACAO, [{ group_type: "psicografia", last_medium_id: psSelecionado, updated_at: now }]);
    }

    setMsg("Chamada salva com sucesso ✅", "");

    // Recarrega tudo para refletir rotação e psicografia em QUALQUER data
    await loadRotacao();
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
    await loadRotacao();

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
      await loadRotacao();      // << importante: rotação funciona em qualquer data
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

