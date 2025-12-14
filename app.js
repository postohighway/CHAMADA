/* app.js — CHAMADA NÚCLEO (estável)
   - Corrige marcações P/M/F/PS (iPhone/Android/PC)
   - Usa event delegation e radio-group por medium_id
*/

 const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";
// CDN supabase-js precisa estar no index.html (veja seção 2)
let sb = null;
document.querySelectorAll('input[type=radio]').forEach(r => {
  r.addEventListener('click', () => console.log('CLICK', r.id));
});

const $ = (id) => document.getElementById(id);
const pickId = (...ids) => ids.map($).find(Boolean);

// Elementos (tenta várias possibilidades pra não “quebrar” se você mudou id)
const elStatus = pickId("statusConexao", "status", "statusSupabase");
const elMsg = pickId("mensagemTopo", "message", "msgTopo");
const elData = pickId("dataChamada", "data", "inputData", "dataInput");
const elBtnVerificar = pickId("btnVerificarData", "verificarData", "btnVerificar");
const elBtnSalvar = pickId("btnSalvarChamada", "salvarChamada", "btnSalvar");
const elResultado = pickId("resultadoSalvar", "msgSalvar", "resultado");

// containers
const elListaDirigentes = pickId("listaDirigentes", "dirigentesList");
const elListaIncorporacao = pickId("listaIncorporacao", "incorporacaoList");
const elListaDesenvolvimento = pickId("listaDesenvolvimento", "desenvolvimentoList");
const elListaCarencia = pickId("listaCarencia", "carenciaList");

// estado
let feriadosSet = new Set();               // YYYY-MM-DD
let mediumsAtivos = [];                    // rows
let chamadaData = null;                    // YYYY-MM-DD
let dataValida = false;
let selecoes = new Map();                  // medium_id -> status ('P','M','F','PS')

// ===== UI helpers =====
function setStatus(texto, ok = true) {
  if (!elStatus) return;
  elStatus.textContent = texto;
  elStatus.style.opacity = "1";
}
function setMsg(texto, tipo = "info") {
  if (!elMsg) return;
  elMsg.textContent = texto;
  elMsg.style.opacity = "1";
  elMsg.style.color = tipo === "erro" ? "#ff6b6b" : "";
}
function setResultado(texto, ok = true) {
  if (!elResultado) return;
  elResultado.textContent = texto;
  elResultado.style.color = ok ? "" : "#ff6b6b";
}
function ymdFromInput(value) {
  // aceita "YYYY-MM-DD" (input type=date) ou "DD/MM/YYYY"
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function isTuesday(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.getDay() === 2; // 0 dom ... 2 ter
}

// ===== render =====
function clearLists() {
  [elListaDirigentes, elListaIncorporacao, elListaDesenvolvimento, elListaCarencia].forEach(el => {
    if (el) el.innerHTML = "";
  });
}

function groupTitle(type) {
  // só pra garantir coerência
  if (type === "dirigente") return "dirigente";
  if (type === "incorporacao") return "incorporacao";
  if (type === "desenvolvimento") return "desenvolvimento";
  if (type === "carencia") return "carencia";
  return type || "outros";
}

function containerForGroup(type) {
  const t = groupTitle(type);
  if (t === "dirigente") return elListaDirigentes;
  if (t === "incorporacao") return elListaIncorporacao;
  if (t === "desenvolvimento") return elListaDesenvolvimento;
  if (t === "carencia") return elListaCarencia;
  return elListaDesenvolvimento; // fallback
}

function mediumRowHTML(m) {
  const mid = m.id;
  const name = m.name ?? "(sem nome)";
  const grupo = groupTitle(m.group_type);

  const disableMesa = (grupo === "carencia");     // carência não marca mesa
  const disablePS   = (grupo === "carencia");     // e também não psicografia

  // IMPORTANTE: name único por pessoa => radio funciona certo no iPhone
  const radioName = `st-${mid}`;

  const mk = (code, label, disabled) => {
    const inputId = `r-${mid}-${code}`;
    return `
      <label class="opt ${disabled ? "disabled" : ""}" for="${inputId}">
        <input
          id="${inputId}"
          type="radio"
          name="${radioName}"
          value="${code}"
          data-medium-id="${mid}"
          ${disabled ? "disabled" : ""}
        />
        <span>${label}</span>
      </label>
    `;
  };

  return `
    <div class="row" data-medium-id="${mid}">
      <div class="nm">${name}</div>
      <div class="opts">
        ${mk("P", "P", false)}
        ${mk("M", "M", disableMesa)}
        ${mk("F", "F", false)}
        ${mk("PS", "PS", disablePS)}
      </div>
    </div>
  `;
}

function renderAll() {
  clearLists();
  const ativos = mediumsAtivos.filter(m => m.active === true);

  // ordena por nome
  ativos.sort((a,b) => (a.name||"").localeCompare(b.name||"", "pt-BR"));

  for (const m of ativos) {
    const el = containerForGroup(m.group_type);
    if (!el) continue;
    el.insertAdjacentHTML("beforeend", mediumRowHTML(m));
  }

  // Reaplica seleções já feitas (se o usuário mexeu e a lista re-renderizou)
  for (const [mid, status] of selecoes.entries()) {
    const id = `r-${mid}-${status}`;
    const input = document.getElementById(id);
    if (input && !input.disabled) input.checked = true;
  }
}

// ===== listeners (event delegation) =====
function attachDelegation() {
  const root = document.body;
  root.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.type !== "radio") return;

    const mid = t.dataset.mediumId;
    const val = t.value;
    if (!mid || !val) return;

    selecoes.set(mid, val);
    // (opcional) debug:
    // console.log("Seleção:", mid, val);
  });
}

// ===== Supabase =====
async function connectSupabase() {
  try {
    setStatus("Conectando...", true);

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // teste leve
    const { error } = await sb.from("mediums").select("id").limit(1);
    if (error) throw error;

    setStatus("Conectado ✅", true);
    return true;
  } catch (e) {
    console.error(e);
    setStatus("Erro ❌", false);
    setMsg(String(e.message || e), "erro");
    return false;
  }
}

async function loadFeriados() {
  const { data, error } = await sb.from("feriados").select("data");
  if (error) throw error;
  feriadosSet = new Set((data || []).map(r => r.data));
}

async function loadMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("id,name,group_type,active")
    .order("name", { ascending: true });

  if (error) throw error;
  mediumsAtivos = data || [];
}

// ===== Validação de data =====
function validarData() {
  const ymd = ymdFromInput(elData?.value || "");
  if (!ymd) {
    dataValida = false;
    setMsg("Informe uma data válida.", "erro");
    return;
  }

  // regra: terça-feira e não feriado
  if (!isTuesday(ymd)) {
    dataValida = false;
    setMsg("A reunião é terça-feira. Escolha uma terça.", "erro");
    return;
  }
  if (feriadosSet.has(ymd)) {
    dataValida = false;
    setMsg("Data cai em feriado cadastrado.", "erro");
    return;
  }

  chamadaData = ymd;
  dataValida = true;
  setMsg("Data válida.", "info");
}

// ===== Salvar chamada =====
async function salvarChamada() {
  try {
    setResultado("");
    if (!dataValida || !chamadaData) {
      setResultado("Verifique a data antes de salvar.", false);
      return;
    }
    if (selecoes.size === 0) {
      setResultado("Marque pelo menos 1 pessoa antes de salvar.", false);
      return;
    }

    // monta payload
    const rows = [];
    for (const [medium_id, status] of selecoes.entries()) {
      rows.push({ medium_id, data: chamadaData, status });
    }

    // upsert (precisa de UNIQUE(medium_id,data) — te passo o SQL abaixo)
    const { error } = await sb
      .from("chamadas")
      .upsert(rows, { onConflict: "medium_id,data" });

    if (error) throw error;

    setResultado("Chamada salva ✅", true);
  } catch (e) {
    console.error(e);
    setResultado("Erro ao salvar: " + (e.message || e), false);
  }
}

// ===== init =====
async function init() {
  attachDelegation();

  const ok = await connectSupabase();
  if (!ok) return;

  try {
    await loadFeriados();
    await loadMediums();
    renderAll();
  } catch (e) {
    console.error(e);
    setMsg("Erro carregando dados: " + (e.message || e), "erro");
  }

  elBtnVerificar?.addEventListener("click", validarData);
  elBtnSalvar?.addEventListener("click", salvarChamada);
}

window.addEventListener("DOMContentLoaded", init);

