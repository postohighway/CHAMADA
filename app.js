/* =========================================================
   CHAMADA DE MÉDIUNS — app.js (ESTÁVEL)
   - NÃO usa "public." em tabela nenhuma
   - Supabase JS v2
   Tabelas:
     mediums   (id uuid, name text, group_type text, active bool, mesa int4, psicografia int4, ...)
     chamadas  (id uuid, medium_id uuid, data date, status text, created_at timestamptz)
     feriados  (id uuid, data date, descricao text)
     rotacao   (group_type text, last_medium_id uuid, updated_at timestamptz)
========================================================= */

/* ====== CONFIG SUPABASE (PREENCHA) ====== */
  const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/* ====== ESTADO ====== */
let sb = null;

let mediumsAll = [];
let mediumsAtivos = [];
let feriadosSet = new Set(); // "YYYY-MM-DD"

let chamadaHoje = new Map(); // medium_id -> status ("P","M","F","PS")
let carregou = false;

/* ====== HELPERS DOM (não mexe em layout) ====== */
const $ = (id) => document.getElementById(id);

function pickId(possibleIds) {
  for (const id of possibleIds) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function setText(el, t) { if (el) el.textContent = t; }
function setHTML(el, h) { if (el) el.innerHTML = h; }
function show(el) { if (el) el.style.display = "block"; }
function hide(el) { if (el) el.style.display = "none"; }

const elStatusConexao  = pickId(["statusConexao", "status", "statusSupabase"]);
const elMsgTopo        = pickId(["mensagemTopo", "message", "msgTopo"]);
const elAvisoData      = pickId(["avisoData", "statusData", "msgData"]);
const elDataChamada    = pickId(["dataChamada", "data", "inputData"]);
const elBtnVerificar   = pickId(["btnVerificarData", "verificarData", "btnVerificar"]);
const elBtnSalvar      = pickId(["btnSalvarChamada", "salvarChamada", "btnSalvar"]);
const elResultadoSalvar= pickId(["resultadoSalvar", "msgSalvar", "resultado"]);

const elListaDirigentes     = pickId(["listaDirigentes", "dirigentesList"]);
const elListaIncorporacao   = pickId(["listaIncorporacao", "incorporacaoList"]);
const elListaDesenvolvimento= pickId(["listaDesenvolvimento", "desenvolvimentoList"]);
const elListaCarencia       = pickId(["listaCarencia", "carenciaList"]);

/* ====== STATUS ====== */
function setConectando(msg = "Conectando...") {
  setText(elStatusConexao, msg);
}
function setConectado(msg = "Conectado ✅") {
  setText(elStatusConexao, msg);
}
function setErro(msg) {
  setText(elStatusConexao, "Erro");
  setText(elMsgTopo, msg);
  console.error(msg);
}

/* ====== INIT ====== */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) checa supabase-js
    if (!window.supabase || !window.supabase.createClient) {
      setErro("Supabase JS não carregou. Confira o <script src=...supabase-js> no index.html (antes do app.js).");
      return;
    }

    // 2) cria client
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 3) testa conexão / tabela (SEM public.)
    setConectando("Conectando ao Supabase...");
    await testarSelectBasico();

    // 4) carrega dados base
    await carregarFeriados();
    await carregarMediums();

    // 5) liga UI
    wireUI();

    setConectado("Conectado ✅");
    carregou = true;

  } catch (err) {
    setErro("Falha geral: " + (err?.message || String(err)));
  }
});

/* ====== TESTE ====== */
async function testarSelectBasico() {
  const { error } = await sb.from("mediums").select("id").limit(1);
  if (error) throw new Error("Teste SELECT falhou em 'mediums': " + error.message);
}

/* ====== DATA ====== */
function toISODate(d) {
  // d pode ser "YYYY-MM-DD" ou Date
  if (typeof d === "string") return d.slice(0, 10);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isTercaFeira(iso) {
  const dt = new Date(iso + "T12:00:00"); // meio-dia evita bug de timezone
  return dt.getDay() === 2; // 2 = terça
}

function isFeriado(iso) {
  return feriadosSet.has(iso);
}

/* ====== LOADERS ====== */
async function carregarFeriados() {
  const { data, error } = await sb.from("feriados").select("data");
  if (error) throw new Error("Erro ao carregar feriados: " + error.message);
  feriadosSet = new Set((data || []).map(r => toISODate(r.data)));
}

async function carregarMediums() {
  // carrega todos e depois filtra ativos
  const { data, error } = await sb
    .from("mediums")
    .select("id, name, group_type, active, mesa, psicografia, presencas, faltas, carencia_total, carencia_atual, primeira_incorporacao")
    .order("name", { ascending: true });

  if (error) throw new Error("Erro ao carregar mediums: " + error.message);

  mediumsAll = data || [];
  mediumsAtivos = mediumsAll.filter(m => m.active === true);

  renderListas();
}

/* ====== RENDER ====== */
function renderListas() {
  const grupos = {
    dirigente: [],
    incorporacao: [],
    desenvolvimento: [],
    carencia: []
  };

  for (const m of mediumsAtivos) {
    const gt = (m.group_type || "").toLowerCase();
    if (gt.includes("dirig")) grupos.dirigente.push(m);
    else if (gt.includes("incorp")) grupos.incorporacao.push(m);
    else if (gt.includes("desenv")) grupos.desenvolvimento.push(m);
    else if (gt.includes("carenc")) grupos.carencia.push(m);
    else grupos.desenvolvimento.push(m); // default seguro
  }

  setHTML(elListaDirigentes,      grupos.dirigente.map(cardMedium).join(""));
  setHTML(elListaIncorporacao,    grupos.incorporacao.map(cardMedium).join(""));
  setHTML(elListaDesenvolvimento, grupos.desenvolvimento.map(cardMedium).join(""));
  setHTML(elListaCarencia,        grupos.carencia.map(cardMedium).join(""));

  // liga eventos dos radios
  document.querySelectorAll("input[type=radio][data-medium]").forEach(r => {
    r.addEventListener("change", (e) => {
      const mid = e.target.getAttribute("data-medium");
      const st = e.target.value;
      chamadaHoje.set(mid, st);
    });
  });
}

function pctFaltas(m) {
  const p = Number(m.presencas || 0);
  const f = Number(m.faltas || 0);
  const tot = p + f;
  if (!tot) return 0;
  return Math.round((f / tot) * 100);
}

function cardMedium(m) {
  const faltasPct = pctFaltas(m);

  // Mantém a sua regra visual: P / M / F / PS
  // (IDs/classes do CSS você já tem; não mexo aqui, só HTML)
  return `
    <div class="card-medium" data-id="${m.id}">
      <div class="card-medium-left">
        <div class="card-medium-name">${escapeHtml(m.name || "")}</div>
        <div class="badge-faltas">${faltasPct}% faltas</div>
      </div>
      <div class="card-medium-right">
        <label><input type="radio" name="st_${m.id}" value="P"  data-medium="${m.id}"> P</label>
        <label><input type="radio" name="st_${m.id}" value="M"  data-medium="${m.id}"> M</label>
        <label><input type="radio" name="st_${m.id}" value="F"  data-medium="${m.id}"> F</label>
        <label><input type="radio" name="st_${m.id}" value="PS" data-medium="${m.id}"> PS</label>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ====== UI ====== */
function wireUI() {
  if (elBtnVerificar) {
    elBtnVerificar.addEventListener("click", () => {
      const iso = getDataSelecionada();
      if (!iso) return;
      validarData(iso);
    });
  }

  if (elBtnSalvar) {
    elBtnSalvar.addEventListener("click", async () => {
      const iso = getDataSelecionada();
      if (!iso) return;

      const ok = validarData(iso);
      if (!ok) return;

      await salvarChamada(iso);
    });
  }
}

function getDataSelecionada() {
  if (!elDataChamada) {
    setText(elMsgTopo, "Campo de data não encontrado no HTML.");
    return null;
  }

  const v = elDataChamada.value;

  // Se for <input type="date">, vem YYYY-MM-DD
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // Se for texto tipo "12 de dez. de 2025" não vou tentar parsear aqui
  // (pra não quebrar). Você pode manter input date no HTML.
  setText(elMsgTopo, "Selecione a data no campo (formato de calendário).");
  return null;
}

function validarData(iso) {
  // regra: terça-feira e não feriado
  if (!isTercaFeira(iso)) {
    setText(elAvisoData, "❌ Data inválida: precisa ser terça-feira.");
    return false;
  }
  if (isFeriado(iso)) {
    setText(elAvisoData, "❌ Data inválida: é feriado.");
    return false;
  }
  setText(elAvisoData, "✅ Data válida.");
  return true;
}

/* ====== SAVE ====== */
async function salvarChamada(iso) {
  try {
    setText(elResultadoSalvar, "Salvando...");

    // monta rows
    const rows = [];
    for (const [medium_id, status] of chamadaHoje.entries()) {
      if (!status) continue;
      rows.push({ medium_id, data: iso, status });
    }

    if (!rows.length) {
      setText(elResultadoSalvar, "Nenhuma marcação selecionada.");
      return;
    }

    const { error } = await sb.from("chamadas").insert(rows);
    if (error) throw new Error(error.message);

    setText(elResultadoSalvar, "✅ Chamada salva!");
  } catch (err) {
    setText(elResultadoSalvar, "❌ Erro ao salvar: " + (err?.message || String(err)));
  }
}