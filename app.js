/* ============================================================
   CHAMADA DE MÉDIUNS — app.js (ESTÁVEL)
   - NÃO usa sb_secret
   - Depende do UMD do supabase-js carregado antes (window.supabase)
   - Tabelas:
     public.mediums (id uuid, name text, group_type text, active bool, mesa int, psicografia int, ...)
     public.feriados (id uuid, data date, descricao text)
     public.chamadas (id uuid, medium_id uuid, data date, status text, created_at timestamptz)
   ============================================================ */

// >>>>> COLE AQUI (Project URL + anon public JWT) <<<<<
  const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

let sb = null;

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);

const elStatus = $("statusConexao");
const elMsgTopo = $("mensagemTopo");
const elResSalvar = $("resultadoSalvar");

const elData = $("dataChamada");
const elBtnVerificar = $("btnVerificarData");
const elBtnSalvar = $("btnSalvarChamada");

const elDirigentes = $("listaDirigentes");
const elIncorp = $("listaIncorporacao");
const elDesenv = $("listaDesenvolvimento");
const elCarencia = $("listaCarencia");

function setStatus(texto, tipo = "info") {
  if (!elStatus) return;
  elStatus.textContent = texto;
  elStatus.dataset.tipo = tipo; // se quiser estilizar no CSS
}
function setMsg(el, texto, tipo = "info") {
  if (!el) return;
  el.textContent = texto || "";
  el.dataset.tipo = tipo;
}
function limparMsgs() {
  setMsg(elMsgTopo, "");
  setMsg(elResSalvar, "");
}

// ---------- Estado ----------
let feriadosSet = new Set(); // "YYYY-MM-DD"
let mediumsAtivos = [];      // lista de mediums active=true
let statusPorMedium = new Map(); // medium_id => "P"|"M"|"F"|"PS"

// ---------- Boot ----------
window.addEventListener("DOMContentLoaded", async () => {
  limparMsgs();

  // 1) Confirma Supabase JS carregado
  if (!window.supabase || !window.supabase.createClient) {
    setStatus("Erro", "erro");
    setMsg(elMsgTopo,
      "Supabase JS não carregou. Verifique se o <script> do supabase-js está ANTES do app.js no index.html.",
      "erro"
    );
    return;
  }

  // 2) Cria client
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 3) Carrega dados base
  try {
    setStatus("Conectando...", "info");

    // Teste rápido de API (pega 1 linha)
    await testarSelect();

    // Carrega feriados e mediums
    await carregarFeriados();
    await carregarMediums();

    // Wire UI
    wireUI();

    setStatus("Conectado ✅", "ok");
    setMsg(elMsgTopo, "Pronto", "ok");
  } catch (e) {
    setStatus("Erro", "erro");
    setMsg(elMsgTopo, normalizarErro(e), "erro");
  }
});

async function testarSelect() {
  // Se der: "Could not find the table 'public.mediums' in the schema cache"
  // então o problema é no Supabase (Exposed schemas / cache), não no front.
  const { error } = await sb.from("mediums").select("id").limit(1);
  if (error) throw error;
}

async function carregarFeriados() {
  const { data, error } = await sb.from("feriados").select("data");
  if (error) throw error;
  feriadosSet = new Set((data || []).map((r) => r.data)); // já vem YYYY-MM-DD
}

async function carregarMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("id,name,group_type,active,mesa,psicografia")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  mediumsAtivos = data || [];
  renderListas();
}

function wireUI() {
  // default data = hoje
  if (elData && !elData.value) {
    elData.value = new Date().toISOString().slice(0, 10);
  }

  elBtnVerificar?.addEventListener("click", () => {
    limparMsgs();
    const d = elData?.value;
    if (!d) return setMsg(elMsgTopo, "Selecione uma data.", "erro");

    if (feriadosSet.has(d)) {
      setMsg(elMsgTopo, "Data é feriado. Reunião não ocorre.", "erro");
    } else {
      setMsg(elMsgTopo, "Data válida.", "ok");
    }
  });

  elBtnSalvar?.addEventListener("click", async () => {
    limparMsgs();
    const d = elData?.value;
    if (!d) return setMsg(elResSalvar, "Selecione uma data.", "erro");
    if (feriadosSet.has(d)) return setMsg(elResSalvar, "Não salva em feriado.", "erro");

    // Monta inserts com o que foi marcado
    const payload = [];
    for (const [medium_id, status] of statusPorMedium.entries()) {
      payload.push({ medium_id, data: d, status });
    }

    if (payload.length === 0) {
      return setMsg(elResSalvar, "Nenhum status selecionado.", "erro");
    }

    try {
      setStatus("Salvando...", "info");

      const { error } = await sb.from("chamadas").insert(payload);

      if (error) throw error;

      setStatus("Conectado ✅", "ok");
      setMsg(elResSalvar, `Chamada salva (${payload.length} registros).`, "ok");
    } catch (e) {
      setStatus("Erro", "erro");
      setMsg(elResSalvar, "Erro ao salvar chamadas: " + normalizarErro(e), "erro");
    }
  });
}

function renderListas() {
  // separa por grupo_type
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
    else grupos.desenvolvimento.push(m); // fallback
  }

  elDirigentes.innerHTML = "";
  elIncorp.innerHTML = "";
  elDesenv.innerHTML = "";
  elCarencia.innerHTML = "";

  renderGrupo(elDirigentes, grupos.dirigente);
  renderGrupo(elIncorp, grupos.incorporacao);
  renderGrupo(elDesenv, grupos.desenvolvimento);
  renderGrupo(elCarencia, grupos.carencia);
}

function renderGrupo(container, lista) {
  if (!container) return;
  if (!lista || lista.length === 0) {
    container.innerHTML = `<div class="vazio">—</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const m of lista) {
    const card = document.createElement("div");
    card.className = "medium-card";

    const nome = document.createElement("div");
    nome.className = "medium-name";
    nome.textContent = m.name || "(sem nome)";

    const radios = document.createElement("div");
    radios.className = "status-radios";

    // P / M / F / PS
    const opcoes = [
      { v: "P", label: "P" },
      { v: "M", label: "M" },
      { v: "F", label: "F" },
      { v: "PS", label: "PS" }
    ];

    for (const opt of opcoes) {
      const wrap = document.createElement("label");
      wrap.className = "radio";

      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `st_${m.id}`;
      inp.value = opt.v;

      // se já marcou antes
      if (statusPorMedium.get(m.id) === opt.v) inp.checked = true;

      inp.addEventListener("change", () => {
        statusPorMedium.set(m.id, opt.v);
      });

      const span = document.createElement("span");
      span.textContent = opt.label;

      wrap.appendChild(inp);
      wrap.appendChild(span);
      radios.appendChild(wrap);
    }

    card.appendChild(nome);
    card.appendChild(radios);
    frag.appendChild(card);
  }

  container.appendChild(frag);
}

function normalizarErro(e) {
  if (!e) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  if (e.message) return e.message;
  try { return JSON.stringify(e); } catch { return String(e); }
}