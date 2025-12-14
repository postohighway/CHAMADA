/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ======= IDs UI ======= */
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

/** ======= Estado ======= */
let feriadosSet = new Set(); // YYYY-MM-DD
let mediums = []; // {id,name,group_type}
let marcacoes = new Map(); // medium_id -> status ("P","M","F","PS", "")

/** ======= Util ======= */
function setPill(type, text) {
  elStatusPill.classList.remove("pill-ok", "pill-err", "pill-warn");
  if (type === "ok") elStatusPill.classList.add("pill-ok");
  else if (type === "err") elStatusPill.classList.add("pill-err");
  else elStatusPill.classList.add("pill-warn");
  elStatusText.textContent = text;
}

function showErro(msg, detalhe) {
  elMsgErro.style.display = "block";
  elMsgErro.textContent = detalhe ? `${msg} — ${detalhe}` : msg;
  console.error("[ERRO]", msg, detalhe || "");
}

function clearErro() {
  elMsgErro.style.display = "none";
  elMsgErro.textContent = "";
}

function setMsg(msg) {
  elMsgTopo.textContent = msg || "";
}

function ymdFromInputDate(value) {
  // value já vem YYYY-MM-DD do input date
  return value || "";
}

function isTuesday(ymd) {
  const d = new Date(ymd + "T12:00:00"); // meio-dia para evitar bugs de fuso
  return d.getDay() === 2; // 0 dom ... 2 ter
}

/** ======= REST helper ======= */
async function apiFetch(path, { method = "GET", body = null } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes("COLE_AQUI") ||
      SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
    throw new Error("Você não colou SUPABASE_URL e SUPABASE_ANON_KEY no app.js");
  }

  const url = `${SUPABASE_URL}${path}`;

  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Prefer": "return=representation",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const err = typeof data === "string" ? data : (data?.message || JSON.stringify(data));
    throw new Error(`${res.status} ${res.statusText} — ${err}`);
  }

  return data;
}

/** ======= Carregamento inicial ======= */
async function carregarFeriados() {
  // tenta pegar tudo
  const rows = await apiFetch(`/rest/v1/feriados?select=data`);
  feriadosSet = new Set((rows || []).map(r => r.data)); // já vem YYYY-MM-DD
}

async function carregarMediums() {
  const rows = await apiFetch(`/rest/v1/mediums?select=id,name,group_type&order=name.asc`);
  mediums = rows || [];
}

/** ======= Render ======= */
function limparListas() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
}

function grupoContainer(group_type) {
  const gt = (group_type || "").toLowerCase();
  if (gt === "dirigente") return listaDirigentes;
  if (gt === "incorporacao" || gt === "incorporação") return listaIncorporacao;
  if (gt === "desenvolvimento") return listaDesenvolvimento;
  if (gt === "carencia" || gt === "carência") return listaCarencia;
  // fallback: joga em desenvolvimento
  return listaDesenvolvimento;
}

function criarLinhaMedium(m) {
  const row = document.createElement("div");
  row.className = "row";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = m.name;

  const opts = document.createElement("div");
  opts.className = "opts";

  // opções oficiais
  // "" = sem marcação, P, M, F, PS
  const opcoes = ["", "P", "M", "F", "PS"];

  opcoes.forEach((val) => {
    const label = document.createElement("label");
    label.className = "opt";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = `status_${m.id}`;
    input.value = val;

    // carência: não permite M nem PS (como você mesmo definiu)
    const gt = (m.group_type || "").toLowerCase();
    if (gt === "carencia" || gt === "carência") {
      if (val === "M" || val === "PS") input.disabled = true;
    }

    const span = document.createElement("span");
    span.textContent = val === "" ? " " : val;

    // marca se já tem no estado
    const atual = marcacoes.get(m.id) || "";
    if (atual === val) input.checked = true;

    input.addEventListener("change", () => {
      marcacoes.set(m.id, val);
    });

    label.appendChild(input);
    label.appendChild(span);
    opts.appendChild(label);
  });

  row.appendChild(name);
  row.appendChild(opts);
  return row;
}

function renderMediums() {
  limparListas();

  // sempre mantém a ordem por nome (já vem do SQL)
  mediums.forEach(m => {
    const container = grupoContainer(m.group_type);
    container.appendChild(criarLinhaMedium(m));
  });
}

/** ======= Data / chamada ======= */
async function carregarMarcacoesDaData(ymd) {
  // busca chamada do dia e aplica no map
  const rows = await apiFetch(`/rest/v1/chamadas?select=medium_id,status&data=eq.${encodeURIComponent(ymd)}`);
  marcacoes.clear();
  (rows || []).forEach(r => {
    marcacoes.set(r.medium_id, r.status || "");
  });
}

function validarData(ymd) {
  if (!ymd) return { ok:false, msg:"Selecione uma data." };

  if (!isTuesday(ymd)) {
    return { ok:false, msg:"Data inválida: a reunião é terça-feira." };
  }

  if (feriadosSet.has(ymd)) {
    return { ok:false, msg:"Data inválida: é feriado cadastrado." };
  }

  return { ok:true, msg:"Data válida." };
}

async function verificarData() {
  clearErro();
  setMsg("");

  const ymd = ymdFromInputDate(elData.value);
  const v = validarData(ymd);
  if (!v.ok) {
    setMsg(v.msg);
    return;
  }

  setMsg(v.msg);

  // carrega marcações existentes e re-render para “pintar” radios
  try {
    await carregarMarcacoesDaData(ymd);
    renderMediums();
  } catch (e) {
    showErro("Falha ao carregar marcações dessa data", e.message);
  }
}

async function salvarChamada() {
  clearErro();
  setMsg("");

  const ymd = ymdFromInputDate(elData.value);
  const v = validarData(ymd);
  if (!v.ok) {
    setMsg(v.msg);
    return;
  }

  // monta payload apenas com quem tem status marcado (não-vazio)
  const linhas = [];
  for (const m of mediums) {
    const st = (marcacoes.get(m.id) || "").trim();
    if (st) {
      linhas.push({
        medium_id: m.id,
        data: ymd,
        status: st
      });
    }
  }

  try {
    // estratégia “sem dor de cabeça”:
    // 1) apaga tudo do dia
    // 2) insere tudo de novo
    await apiFetch(`/rest/v1/chamadas?data=eq.${encodeURIComponent(ymd)}`, { method: "DELETE" });

    if (linhas.length > 0) {
      await apiFetch(`/rest/v1/chamadas`, { method: "POST", body: linhas });
    }

    setMsg("Chamada salva com sucesso.");
  } catch (e) {
    showErro("Falha ao salvar chamada", e.message);
  }
}

/** ======= Boot ======= */
async function init() {
  try {
    setPill("warn", "Conectando...");
    clearErro();
    setMsg("");

    // carrega dados básicos
    await carregarFeriados();
    await carregarMediums();

    // render base
    renderMediums();

    setPill("ok", "Conectado ✅");
    setMsg("Pronto");

  } catch (e) {
    setPill("err", "Erro");
    showErro("Não conectou no Supabase", e.message);
  }
}

btnVerificar.addEventListener("click", verificarData);
btnSalvar.addEventListener("click", salvarChamada);

init();






