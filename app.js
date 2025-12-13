/**********************************************************
 * CHAMADA DE MÉDIUNS — app.js (VERSÃO FINAL ESTÁVEL)
 * - Sem login
 * - Supabase anon
 * - Não quebra se faltar elemento no HTML
 **********************************************************/

/* ===== CONFIG SUPABASE ===== */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/* ===== ESTADO ===== */
let sb = null;
let mediumsCache = [];
let rotacaoMap = {};

/* ===== HELPERS DOM (NÃO QUEBRAM) ===== */
const $ = (id) => document.getElementById(id);

function setText(id, txt) {
  const el = $(id);
  if (el) el.innerText = txt;
}

function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function setStatus(msg, ok = false) {
  const el = $("statusConexao");
  if (!el) {
    console.warn("statusConexao:", msg);
    return;
  }
  el.innerText = msg;
  el.style.color = ok ? "#22c55e" : "#ef4444";
}

/* ===== INIT ===== */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Confere Supabase JS
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase JS não carregou (script)", false);
      return;
    }

    // 2) Cria client
    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    setStatus("Conectando ao Supabase…");

    // 3) Teste real de conexão
    await testarConexao();

    // 4) Carregamentos
    await carregarRotacao();
    await carregarMediums();

    setStatus("Conectado ✔", true);
  } catch (err) {
    console.error(err);
    setStatus("Erro: " + err.message);
  }
});

/* ===== TESTE DE CONEXÃO ===== */
async function testarConexao() {
  const { error } = await sb
    .from("mediums")
    .select("id")
    .limit(1);

  if (error) {
    throw new Error("Falha no SELECT mediums: " + error.message);
  }
}

/* ===== ROTACAO ===== */
async function carregarRotacao() {
  const { data, error } = await sb
    .from("rotacao")
    .select("*");

  if (error) {
    throw new Error("Erro rotacao: " + error.message);
  }

  rotacaoMap = {};
  (data || []).forEach((r) => {
    rotacaoMap[r.group_type] = r.last_medium_id;
  });
}

/* ===== MEDIUNS ===== */
async function carregarMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error("Erro mediums: " + error.message);
  }

  mediumsCache = data || [];
  renderizarGrupos();
}

/* ===== RENDER ===== */
function renderizarGrupos() {
  renderGrupo("dirigente", "listaDirigentes");
  renderGrupo("incorporacao", "listaIncorporacao");
  renderGrupo("desenvolvimento", "listaDesenvolvimento");
  renderGrupo("carencia", "listaCarencia");
}

function renderGrupo(tipo, divId) {
  const el = $(divId);
  if (!el) return;

  const lista = mediumsCache.filter((m) => m.group_type === tipo);

  if (lista.length === 0) {
    el.innerHTML = "<div>Nenhum médium neste grupo.</div>";
    return;
  }

  const lastId = rotacaoMap[tipo] || null;
  let nextId = null;

  if (lastId) {
    const idx = lista.findIndex((m) => m.id === lastId);
    nextId = lista[(idx + 1) % lista.length]?.id;
  } else {
    nextId = lista[0].id;
  }

  el.innerHTML = "";

  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card";

    if (m.id === nextId) {
      card.classList.add("medium-next");
    }

    card.innerHTML = `
      <strong>${m.name}</strong>
      <div>${m.group_type}</div>
    `;

    el.appendChild(card);
  });
}
