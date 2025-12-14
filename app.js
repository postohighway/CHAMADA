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

/** ====== Headers ====== */
const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/** ====== Estado ====== */
let dataAtivaISO = null;           // YYYY-MM-DD
let mediums = [];                  // lista do banco
let marcacoes = new Map();         // medium_id -> status ("P","M","F","PS")

/** ====== Helpers ====== */
function setStatus(tipo, texto) {
  // tipo: "ok" | "warn" | "err" | "load"
  if (elStatusText) elStatusText.innerText = texto || "";

  if (!elStatusPill) return;
  elStatusPill.classList.remove("ok", "warn", "err", "load");

  if (tipo) elStatusPill.classList.add(tipo);
}

function setTopo(msg) {
  if (elMsgTopo) elMsgTopo.innerText = msg || "";
}
function setErro(msg) {
  if (elMsgErro) elMsgErro.innerText = msg || "";
}

function ddmmyyyyToISO(ddmmyyyy) {
  // aceita "09/12/2025"
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const iso = `${yyyy.toString().padStart(4,"0")}-${mm.toString().padStart(2,"0")}-${dd.toString().padStart(2,"0")}`;
  return iso;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function supaGet(path) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, { method: "GET", headers });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (_) {}
  if (!res.ok) {
    console.error("❌ GET erro", res.status, url, txt);
    throw new Error(`GET ${res.status}: ${txt}`);
  }
  return json;
}

async function supaPost(path, body) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch (_) {}
  if (!res.ok) {
    console.error("❌ POST erro", res.status, url, txt);
    throw new Error(`POST ${res.status}: ${txt}`);
  }
  return json;
}

async function supaDelete(path) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, { method: "DELETE", headers });
  const txt = await res.text();
  if (!res.ok) {
    console.error("❌ DELETE erro", res.status, url, txt);
    throw new Error(`DELETE ${res.status}: ${txt}`);
  }
  return true;
}

/** ====== Conexão ====== */
async function testarConexao() {
  setStatus("load", "Conectando...");
  setErro("");
  try {
    const data = await supaGet(`/rest/v1/mediums?select=id&limit=1`);
    console.log("✅ Conectado Supabase", data);
    setStatus("ok", "Conectado");
    return true;
  } catch (e) {
    setStatus("err", "Erro");
    setErro(String(e.message || e));
    return false;
  }
}

/** ====== Carregar dados ====== */
async function carregarMediums() {
  // group_type esperado: "dirigente", "incorporacao", "desenvolvimento", "carencia"
  // (pode ser maiúsculo/minúsculo — vou normalizar)
  const list = await supaGet(`/rest/v1/mediums?select=id,name,group_type&order=name.asc`);
  mediums = Array.isArray(list) ? list : [];
  console.log("📋 mediums:", mediums);
}

async function carregarMarcacoesDaData(iso) {
  marcacoes.clear();

  // busca marcações já salvas
  // ⚠️ aqui assume tabela public.chamadas com colunas: data, medium_id, status
  const q = `/rest/v1/chamadas?select=medium_id,status&data=eq.${encodeURIComponent(iso)}`;
  const rows = await supaGet(q);

  (rows || []).forEach(r => {
    if (r.medium_id && r.status) marcacoes.set(r.medium_id, r.status);
  });

  console.log("📝 marcações carregadas", iso, Object.fromEntries(marcacoes));
}

/** ====== Render ====== */
function criarLinhaMedium(m) {
  const wrap = document.createElement("div");
  wrap.className = "linha-medium";

  const nome = document.createElement("div");
  nome.className = "nome-medium";
  nome.textContent = m.name || "(sem nome)";

  const opcoes = document.createElement("div");
  opcoes.className = "opcoes-medium";

  const statusAtual = marcacoes.get(m.id) || "";

  // cria radios P/M/F/PS (SEM rádio extra)
  const itens = ["P", "M", "F", "PS"];

  itens.forEach((v) => {
    const lab = document.createElement("label");
    lab.className = "opcao";

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;   // grupo por médium
    inp.value = v;

    if (v === statusAtual) inp.checked = true;

    inp.addEventListener("change", () => {
      marcacoes.set(m.id, v);
      console.log("✅ marcou", m.name, m.id, v);
      setTopo("Alterações pendentes. Clique em “Salvar chamada”.");
    });

    const txt = document.createElement("span");
    txt.textContent = v;

    lab.appendChild(inp);
    lab.appendChild(txt);
    opcoes.appendChild(lab);
  });

  // botão limpar (pra remover marcação)
  const btnLimpar = document.createElement("button");
  btnLimpar.type = "button";
  btnLimpar.className = "btn-limpar";
  btnLimpar.textContent = "Limpar";

  btnLimpar.addEventListener("click", () => {
    marcacoes.delete(m.id);
    // desmarca radios no DOM
    const radios = wrap.querySelectorAll(`input[name="st_${m.id}"]`);
    radios.forEach(r => (r.checked = false));
    console.log("🧹 limpou", m.name, m.id);
    setTopo("Alterações pendentes. Clique em “Salvar chamada”.");
  });

  opcoes.appendChild(btnLimpar);

  wrap.appendChild(nome);
  wrap.appendChild(opcoes);

  return wrap;
}

function renderizarTudo() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";

  const norm = (x) => String(x || "").trim().toLowerCase();

  mediums.forEach(m => {
    const gt = norm(m.group_type);

    const linha = criarLinhaMedium(m);

    if (gt === "dirigente") listaDirigentes.appendChild(linha);
    else if (gt === "incorporacao") listaIncorporacao.appendChild(linha);
    else if (gt === "desenvolvimento") listaDesenvolvimento.appendChild(linha);
    else if (gt === "carencia") listaCarencia.appendChild(linha);
    else {
      // se vier diferente, joga em desenvolvimento por padrão pra não sumir
      listaDesenvolvimento.appendChild(linha);
    }
  });
}

/** ====== Regras da data (básico) ====== */
async function verificarDataEPreparar() {
  setErro("");
  setTopo("");

  // tenta ler do input (date ou texto)
  let iso = null;

  // se for <input type="date">: value vem YYYY-MM-DD
  if (elData && /^\d{4}-\d{2}-\d{2}$/.test(elData.value || "")) {
    iso = elData.value;
  } else if (elData && /^\d{2}\/\d{2}\/\d{4}$/.test(elData.value || "")) {
    iso = ddmmyyyyToISO(elData.value);
  }

  if (!iso) {
    setErro("Data inválida. Use dd/mm/aaaa ou selecione no calendário.");
    return false;
  }

  dataAtivaISO = iso;
  console.log("📅 data ativa:", dataAtivaISO);

  // carrega marcações da data e renderiza
  await carregarMarcacoesDaData(dataAtivaISO);
  renderizarTudo();

  setTopo("Data válida.");
  return true;
}

/** ====== Salvar ====== */
async function salvarChamada() {
  setErro("");
  if (!dataAtivaISO) {
    setErro("Primeiro clique em “Verificar data”.");
    return;
  }

  // monta payload (só quem tem marcação)
  const payload = [];
  for (const m of mediums) {
    const st = marcacoes.get(m.id);
    if (st) payload.push({ data: dataAtivaISO, medium_id: m.id, status: st });
  }

  try {
    setStatus("load", "Salvando...");

    // estratégia mais segura: apaga tudo da data e reinsere
    await supaDelete(`/rest/v1/chamadas?data=eq.${encodeURIComponent(dataAtivaISO)}`);

    if (payload.length > 0) {
      await supaPost(`/rest/v1/chamadas`, payload);
    }

    setStatus("ok", "Conectado");
    setTopo("Chamada salva com sucesso ✅");
    console.log("💾 salva", dataAtivaISO, payload);
  } catch (e) {
    setStatus("err", "Erro");
    setErro(String(e.message || e));
  }
}

/** ====== Boot ====== */
async function boot() {
  const ok = await testarConexao();
  if (!ok) return;

  await carregarMediums();

  // render sem marcação (a data define)
  renderizarTudo();

  // se quiser, já seta hoje como padrão se o input estiver vazio
  if (elData && !elData.value) {
    // se for type="date"
    elData.value = todayISO();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  boot();

  if (btnVerificar) btnVerificar.addEventListener("click", verificarDataEPreparar);
  if (btnSalvar) btnSalvar.addEventListener("click", salvarChamada);
});
