/* =========================================================
   CHAMADA DE MÉDIUNS — app.js (VERSÃO FINAL FUNCIONAL)
   GitHub Pages + Supabase (SEM AUTH / SEM LOGIN)
   ========================================================= */

/* ========= CONFIG SUPABASE (SEUS DADOS REAIS) ========= */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/* ========= ESTADO ========= */
let sb = null;
let participantes = [];
let rotacaoMap = {};
let conectado = false;

/* ========= HELPERS DOM ========= */
const $ = (id) => document.getElementById(id);

function setStatus(txt, ok = false) {
  const el = $("statusConexao");
  if (!el) return;
  el.innerText = txt;
  el.style.color = ok ? "#22c55e" : "#f87171";
}

/* ========= INIT ========= */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Confere Supabase JS
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("❌ Supabase JS não carregou (ver script no index.html)");
      return;
    }

    // 2) Cria client
    sb = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    setStatus("🔄 Conectando ao Supabase...");

    // 3) Teste REAL de conexão
    await testeConexao();

    // 4) Carrega dados
    await carregarParticipantes();
    await carregarRotacao();

    setStatus("✅ Conectado", true);

  } catch (err) {
    console.error(err);
    setStatus("❌ Erro: " + err.message);
  }
});

/* ========= TESTE DE CONEXÃO ========= */
async function testeConexao() {
  const { data, error } = await sb
    .from("mediums")
    .select("id")
    .limit(1);

  if (error) {
    throw new Error("Falha no SELECT mediums: " + error.message);
  }
}

/* ========= PARTICIPANTES ========= */
async function carregarParticipantes() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    throw new Error("Erro ao carregar participantes: " + error.message);
  }

  participantes = data || [];
  renderParticipantes();
}

function renderParticipantes() {
  const container = $("listaParticipantes");
  if (!container) return;

  container.innerHTML = "";

  if (participantes.length === 0) {
    container.innerHTML = "<p>Nenhum participante cadastrado.</p>";
    return;
  }

  participantes.forEach((p) => {
    const div = document.createElement("div");
    div.className = "participante";

    div.innerHTML = `
      <strong>${p.nome}</strong>
      <span class="grupo">${p.grupo || ""}</span>
    `;

    container.appendChild(div);
  });
}

/* ========= ROTAÇÃO ========= */
async function carregarRotacao() {
  const { data, error } = await sb
    .from("rotacao")
    .select("*");

  if (error) {
    throw new Error("Erro ao carregar rotação: " + error.message);
  }

  rotacaoMap = {};
  (data || []).forEach((r) => {
    rotacaoMap[r.grupo] = r.medium_id;
  });
}

/* ========= CHAMADA ========= */
async function salvarChamada(payload) {
  const { error } = await sb
    .from("chamadas")
    .insert(payload);

  if (error) {
    alert("Erro ao salvar chamada: " + error.message);
    return;
  }

  alert("Chamada salva com sucesso!");
}
