/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

/** ✅ COLE AQUI (APENAS ANON PUBLIC KEY) */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ====== IDs UI ====== */
const $ = (id) => document.getElementById(id);

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

/** ====== Estado ====== */
let feriadosSet = new Set(); // YYYY-MM-DD
let mediumsAll = [];         // todos ativos
let chamadasMap = new Map(); // medium_id -> status (P/M/F/PS/"")
let rotacao = { mesa: null, psicografia: null }; // last_medium_id

let nextMesaId = null;
let nextPsicoId = null;

let currentDateISO = null;

/** ====== Utils ====== */
function setOk(msg = "Pronto") {
  elMsgErro.textContent = "";
  elMsgTopo.textContent = msg;
}
function setErro(msg) {
  elMsgErro.textContent = msg;
}
function setConn(ok, msg) {
  if (ok) {
    elStatusPill.classList.add("ok");
    elStatusPill.classList.remove("bad");
    elStatusText.textContent = msg || "Supabase OK";
  } else {
    elStatusPill.classList.add("bad");
    elStatusPill.classList.remove("ok");
    elStatusText.textContent = msg || "Sem conexão";
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function parseBRtoISO(br) {
  // aceita dd/mm/aaaa
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}
function isTuesday(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.getDay() === 2; // 0 dom ... 2 ter
}
function formatISOtoBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function headersJson() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: headersJson() });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
  return r.json();
}

async function sbUpsert(table, rows) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=medium_id,data`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      ...headersJson(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

async function sbPatchRotacao(group_type, last_medium_id) {
  const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.${encodeURIComponent(group_type)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      ...headersJson(),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ last_medium_id, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

/** ====== Carga inicial ====== */
async function loadBase() {
  // feriados
  const fer = await sbGet(`feriados?select=data`);
  feriadosSet = new Set(fer.map((x) => x.data));

  // mediums (ativos)
  // OBS: selecione também mesa/psicografia para elegibilidade da rotação
  const meds = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,active&active=eq.true&order=name.asc`
  );
  mediumsAll = meds;

  // rotacao
  const rot = await sbGet(`rotacao?select=group_type,last_medium_id`);
  rotacao = { mesa: null, psicografia: null };
  for (const r of rot) {
    if (r.group_type === "mesa") rotacao.mesa = r.last_medium_id || null;
    if (r.group_type === "psicografia") rotacao.psicografia = r.last_medium_id || null;
  }
}

/** ====== Carregar chamadas do dia ====== */
async function loadChamadasForDate(iso) {
  // chamadas do dia (todas)
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  chamadasMap = new Map(rows.map((r) => [r.medium_id, r.status || ""]));
}

/** ====== Rotação (cálculo do próximo com fallback) ====== */
function computeNextFromRotation(groupKey) {
  // groupKey: "mesa" or "psicografia"
  // Elegíveis: dirigentes ativos com mesa=1 (para mesa) ou psicografia=1 (para psicografia)
  const eligible = mediumsAll
    .filter((m) => m.group_type === "dirigente" && m.active === true)
    .filter((m) => (groupKey === "mesa" ? Number(m.mesa) === 1 : Number(m.psicografia) === 1))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  if (eligible.length === 0) return null;

  const lastId = rotacao[groupKey];

  // se lastId não existir ou não estiver na lista -> fallback para o primeiro
  const idx = eligible.findIndex((x) => x.id === lastId);
  if (idx === -1) return eligible[0].id;

  // próximo circular
  const next = eligible[(idx + 1) % eligible.length];
  return next.id;
}

function recomputeRotationBadges() {
  nextMesaId = computeNextFromRotation("mesa");
  nextPsicoId = computeNextFromRotation("psicografia");
}

/** ====== UI ====== */
function buildStatusOptions(medium) {
  // P / M / F para todos
  // PS somente para dirigente
  const base = ["P", "M", "F"];
  if (medium.group_type === "dirigente") base.push("PS");
  return base;
}

function statusLabel(s) {
  if (s === "P") return "P";
  if (s === "M") return "M";
  if (s === "F") return "F";
  if (s === "PS") return "PS";
  return "";
}

function makeRow(m) {
  const current = chamadasMap.get(m.id) || "";

  const wrap = document.createElement("div");
  wrap.className = "itemRow";

  // destaque amarelo/vermelho só para dirigentes
  if (m.group_type === "dirigente") {
    if (m.id === nextMesaId) wrap.classList.add("nextMesa");
    if (m.id === nextPsicoId) wrap.classList.add("nextPsico");
  }

  const left = document.createElement("div");
  left.className = "itemLeft";

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = m.name || "(sem nome)";

  const meta = document.createElement("div");
  meta.className = "itemMeta";

  // percentuais (com regra do Marcelo: % Presença=(P+M)/(P+M+F))
  const pres = Number(m.presencas || 0);
  const falt = Number(m.faltas || 0);
  const denom = pres + falt;
  const presPct = denom === 0 ? 0 : Math.round((pres / denom) * 100);
  const faltPct = denom === 0 ? 0 : Math.round((falt / denom) * 100);

  meta.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  // badges de próximo
  const badges = document.createElement("div");
  badges.className = "badges";

  if (m.group_type === "dirigente" && m.id === nextMesaId) {
    const b = document.createElement("span");
    b.className = "badge badgeMesa";
    b.textContent = "Mesa (próximo)";
    badges.appendChild(b);
  }
  if (m.group_type === "dirigente" && m.id === nextPsicoId) {
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

  // radios
  const opts = buildStatusOptions(m);
  const radios = document.createElement("div");
  radios.className = "radioGroup";

  for (const s of opts) {
    const id = `r_${m.id}_${s}`;

    const lbl = document.createElement("label");
    lbl.className = "radioLbl";
    lbl.setAttribute("for", id);

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;
    inp.id = id;
    inp.value = s;
    inp.checked = current === s;

    inp.addEventListener("change", async () => {
      chamadasMap.set(m.id, s);
      renderResumo();
      // salva imediatamente só este item
      try {
        await sbUpsert("chamadas", [{ medium_id: m.id, data: currentDateISO, status: s }]);
        setOk("Salvo.");
      } catch (e) {
        setErro("Erro ao salvar marcação: " + e.message);
      }
    });

    const dot = document.createElement("span");
    dot.className = "dot";

    const txt = document.createElement("span");
    txt.className = "radioTxt";
    txt.textContent = statusLabel(s);

    lbl.appendChild(dot);
    lbl.appendChild(txt);

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  // limpar
  const btn = document.createElement("button");
  btn.className = "btnSmall";
  btn.textContent = "Limpar";
  btn.addEventListener("click", async () => {
    chamadasMap.set(m.id, "");
    renderAll(); // para desmarcar UI
    try {
      // apaga status do dia (deixa vazio)
      await sbUpsert("chamadas", [{ medium_id: m.id, data: currentDateISO, status: "" }]);
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

function clearLists() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
}

function renderAll() {
  clearLists();
  recomputeRotationBadges();

  const grupos = {
    dirigente: listaDirigentes,
    incorporacao: listaIncorporacao,
    desenvolvimento: listaDesenvolvimento,
    carencia: listaCarencia,
  };

  for (const m of mediumsAll) {
    const target = grupos[m.group_type];
    if (!target) continue;
    target.appendChild(makeRow(m));
  }

  renderResumo();
}

function renderResumo() {
  // contagem de status do dia
  let p = 0, m = 0, f = 0, ps = 0;

  // reservas mesa do dia (quem marcou M)
  const reservas = [];

  for (const med of mediumsAll) {
    const st = (chamadasMap.get(med.id) || "").toUpperCase();
    if (st === "P") p++;
    if (st === "M") { m++; reservas.push(med.name); }
    if (st === "F") f++;
    if (st === "PS") ps++;
  }

  const totalMarcado = p + m + f + ps;
  const presencaPct = (p + m + ps + f) === 0 ? 0 : Math.round(((p + m) / (p + m + f)) * 100); // regra: PS não entra como presença
  const faltasPct = (p + m + f) === 0 ? 0 : Math.round((f / (p + m + f)) * 100);

  elResumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${presencaPct}% | Faltas:${faltasPct}%`;

  elReservasMesa.textContent = reservas.length ? reservas.join(", ") : "—";
}

/** ====== Verificar data ====== */
async function onVerificar() {
  setErro("");
  const val = elData.value;

  // aceita input type=date (YYYY-MM-DD) OU dd/mm/aaaa
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) iso = val;
  else iso = parseBRtoISO(val);

  if (!iso) {
    setErro("Data inválida. Use dd/mm/aaaa ou selecione no calendário.");
    return;
  }
  if (!isTuesday(iso)) {
    setErro("Essa data não é terça-feira.");
    return;
  }
  if (feriadosSet.has(iso)) {
    setErro("Essa data está marcada como feriado.");
    return;
  }

  currentDateISO = iso;
  setOk(`Data válida: ${formatISOtoBR(iso)}`);

  await loadChamadasForDate(iso);
  renderAll();
}

/** ====== Salvar chamada (tudo) ====== */
async function onSalvarTudo() {
  if (!currentDateISO) {
    setErro("Selecione uma data e clique em Verificar data.");
    return;
  }

  try {
    const rows = [];
    for (const med of mediumsAll) {
      const st = (chamadasMap.get(med.id) || "");
      rows.push({ medium_id: med.id, data: currentDateISO, status: st });
    }
    await sbUpsert("chamadas", rows);
    setOk("Chamada salva.");
  } catch (e) {
    setErro("Erro ao salvar chamada: " + e.message);
  }
}

/** ====== Boot ====== */
(async function init() {
  try {
    setConn(false, "Conectando...");
    await loadBase();
    setConn(true, "Supabase OK");
    setOk("Selecione a data e clique em “Verificar data”.");
  } catch (e) {
    setConn(false, "Erro");
    setErro("Falha ao conectar no Supabase: " + e.message);
  }

  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvarTudo);
})();
