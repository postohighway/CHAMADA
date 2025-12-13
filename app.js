/* =========================================================
   CHAMADA DE MÉDIUNS — app.js (ZERADO / ESTÁVEL)
   Não altera estética (somente lógica).
   Tabelas esperadas:
     public.mediums  (id uuid, name text, group_type text, active bool, mesa bool, psicografia bool, ...)
     public.chamadas (id uuid, medium_id uuid, data date, status text, created_at timestamptz)
     public.feriados (id?, data date)
     public.rotacao  (group_type text, last_medium_id uuid)
========================================================= */

/* ===== CONFIG SUPABASE ===== */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc"; // começa com eyJ...

/* ===== ESTADO ===== */
let sb = null;

let mediumsAll = [];     // todos
let mediumsAtivos = [];  // ativos
let feriadosSet = new Set(); // yyyy-mm-dd

let rotacaoMap = {}; // { group_type: last_medium_id }

/* ===== HELPERS DOM (não mexe no layout) ===== */
const $ = (id) => document.getElementById(id);

function pickId(possibleIds) {
  for (const id of possibleIds) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function setText(el, txt) { if (el) el.textContent = txt; }
function setHTML(el, html) { if (el) el.innerHTML = html; }
function show(el) { if (el) el.style.display = "block"; }
function hide(el) { if (el) el.style.display = "none"; }

/* IDs (tentamos vários nomes pra não quebrar se variou) */
const elStatusConexao = pickId(["statusConexao", "status", "statusSupabase"]);
const elMsgTopo = pickId(["mensagemTopo", "mensagem", "msgTopo"]);
const elAvisoData = pickId(["avisoData", "statusData", "msgData"]);
const elDataChamada = pickId(["dataChamada", "data", "inputData"]);
const elBtnVerificar = pickId(["btnVerificarData", "verificarData", "btnVerificar"]);
const elBtnSalvar = pickId(["btnSalvarChamada", "salvarChamada", "btnSalvar"]);
const elResultadoSalvar = pickId(["resultadoSalvar", "msgSalvar", "resultado"]);

/* containers chamada */
const elListaDirigentes = pickId(["listaDirigentes", "dirigentesList"]);
const elListaIncorporacao = pickId(["listaIncorporacao", "incorporacaoList"]);
const elListaDesenvolvimento = pickId(["listaDesenvolvimento", "desenvolvimentoList"]);
const elListaCarencia = pickId(["listaCarencia", "carenciaList"]);

/* containers participantes */
const elBusca = pickId(["buscarParticipantes", "buscarParticipante", "busca"]);
const elNovoNome = pickId(["novoNome", "nomeNovo", "nome"]);
const elNovoGrupo = pickId(["novoGrupo", "grupoNovo", "grupo"]);
const elBtnAdd = pickId(["btnAdicionarParticipante", "adicionarParticipante", "btnAdicionar"]);
const elListaParticipantes = pickId(["listaParticipantes", "lista", "participantesList"]);

function setConectando(msg = "Conectando...") {
  if (elStatusConexao) {
    elStatusConexao.classList?.remove("ok");
    elStatusConexao.classList?.add("warn");
    setText(elStatusConexao, msg);
  }
}
function setConectado(msg = "Conectado ✅") {
  if (elStatusConexao) {
    elStatusConexao.classList?.remove("warn");
    elStatusConexao.classList?.add("ok");
    setText(elStatusConexao, msg);
  }
}
function setErro(msg) {
  if (elStatusConexao) {
    elStatusConexao.classList?.remove("ok");
    elStatusConexao.classList?.add("err");
    setText(elStatusConexao, "Erro: " + msg);
  }
  if (elResultadoSalvar) setText(elResultadoSalvar, "❌ " + msg);
  console.error("[APP] ERRO:", msg);
}

/* ===== UTIL ===== */
function toISODate(d) {
  // d: Date
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseInputDateToISO(value) {
  // aceita "YYYY-MM-DD" ou "DD/MM/YYYY" (se seu input for texto)
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = m[1], mm = m[2], yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/* ===== SUPABASE ===== */
async function testarConexao() {
  // teste simples
  const { error } = await sb.from("mediums").select("id").limit(1);
  if (error) throw new Error(error.message);
}

async function carregarFeriados() {
  const { data, error } = await sb.from("feriados").select("data");
  if (error) throw new Error("Feriados: " + error.message);
  feriadosSet = new Set((data || []).map((r) => r.data));
}

async function carregarRotacao() {
  const { data, error } = await sb.from("rotacao").select("group_type,last_medium_id");
  if (error) throw new Error("Rotação: " + error.message);
  rotacaoMap = {};
  (data || []).forEach((r) => { rotacaoMap[r.group_type] = r.last_medium_id; });
}

async function carregarMediums() {
  const { data, error } = await sb.from("mediums")
    .select("id,name,group_type,active,mesa,psicografia,faltas,presencas")
    .order("name", { ascending: true });

  if (error) throw new Error("Participantes: " + error.message);

  mediumsAll = data || [];
  mediumsAtivos = mediumsAll.filter((m) => m.active === true);
}

/* ===== REGRAS DATA ===== */
async function verificarData() {
  if (!elDataChamada) return false;

  const iso = parseInputDateToISO(elDataChamada.value);
  if (!iso) {
    if (elAvisoData) setText(elAvisoData, "Selecione uma data válida.");
    return false;
  }

  const dt = new Date(iso + "T03:00:00"); // evita bug fuso BR
  const diaSemana = dt.getDay(); // 0 dom, 1 seg, 2 ter...

  // terça-feira apenas
  if (diaSemana !== 2) {
    if (elAvisoData) setText(elAvisoData, "❌ Chamada só pode ser feita em TERÇA-FEIRA.");
    return false;
  }

  // feriado
  if (feriadosSet.has(iso)) {
    if (elAvisoData) setText(elAvisoData, "❌ Hoje é feriado! Chamada não permitida.");
    return false;
  }

  if (elAvisoData) setText(elAvisoData, "✅ Data válida.");
  return true;
}

/* ===== RENDER CHAMADA ===== */
function getNextMediumId(lista, lastId) {
  if (!lista || lista.length === 0) return null;
  if (!lastId) return lista[0].id;
  const idx = lista.findIndex((m) => m.id === lastId);
  if (idx === -1 || idx === lista.length - 1) return lista[0].id;
  return lista[idx + 1].id;
}

function renderGrupo(containerEl, lista, groupType) {
  if (!containerEl) return;

  const useRot = groupType !== "carencia";
  const lastId = rotacaoMap[groupType] || null;
  const nextId = useRot ? getNextMediumId(lista, lastId) : null;

  if (!lista || lista.length === 0) {
    setHTML(containerEl, `<div class="card">Nenhum médium neste grupo.</div>`);
    return;
  }

  containerEl.innerHTML = "";

  lista.forEach((m) => {
    const totalChamadas = (m.faltas || 0) + (m.presencas || 0);
    const perc = totalChamadas > 0 ? Math.round(((m.faltas || 0) * 100) / totalChamadas) : 0;
    const tagNext = (useRot && m.id === nextId)
      ? (groupType === "dirigente" ? `<span class="badge proximo">PRÓXIMO (PS)</span>` : `<span class="badge proximo">PRÓXIMO</span>`)
      : "";

    // Status radios: carência só P/F; demais P/M/F; dirigente tem PS
    let radios = "";
    if (groupType === "carencia") {
      radios = `
        <label><input type="radio" name="${m.id}" value="P"> P</label>
        <label><input type="radio" name="${m.id}" value="F"> F</label>
      `;
    } else if (groupType === "dirigente") {
      radios = `
        <label><input type="radio" name="${m.id}" value="P"> P</label>
        <label><input type="radio" name="${m.id}" value="M"> M</label>
        <label><input type="radio" name="${m.id}" value="F"> F</label>
        <label><input type="radio" name="${m.id}" value="PS"> PS</label>
      `;
    } else {
      radios = `
        <label><input type="radio" name="${m.id}" value="P"> P</label>
        <label><input type="radio" name="${m.id}" value="M"> M</label>
        <label><input type="radio" name="${m.id}" value="F"> F</label>
      `;
    }

    const card = document.createElement("div");
    card.className = "card medium";

    card.innerHTML = `
      <div class="linha1">
        <div class="nome">${m.name}</div>
        <div class="perc">${perc}% faltas</div>
        ${tagNext}
      </div>
      <div class="linha2 radios">
        ${radios}
      </div>
    `;

    containerEl.appendChild(card);
  });
}

function renderChamada() {
  const ativos = mediumsAtivos;

  const dirigentes = ativos.filter((m) => m.group_type === "dirigente");
  const incorporacao = ativos.filter((m) => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter((m) => m.group_type === "desenvolvimento");
  const carencia = ativos.filter((m) => m.group_type === "carencia");

  renderGrupo(elListaDirigentes, dirigentes, "dirigente");
  renderGrupo(elListaIncorporacao, incorporacao, "incorporacao");
  renderGrupo(elListaDesenvolvimento, desenvolvimento, "desenvolvimento");
  renderGrupo(elListaCarencia, carencia, "carencia");
}

/* ===== PARTICIPANTES ===== */
function renderParticipantesLista(lista) {
  if (!elListaParticipantes) return;
  if (!lista || lista.length === 0) {
    setHTML(elListaParticipantes, `<div class="card">Nenhum participante encontrado.</div>`);
    return;
  }

  elListaParticipantes.innerHTML = "";
  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "card participante";
    card.innerHTML = `
      <div class="linha1">
        <div class="nome">${m.name}</div>
        <div class="grupo">${m.group_type}</div>
      </div>
      <div class="linha2">
        <label>
          <input type="checkbox" data-id="${m.id}" class="toggleAtivo" ${m.active ? "checked" : ""}/>
          Ativo
        </label>
      </div>
    `;
    elListaParticipantes.appendChild(card);
  });

  // toggle ativo
  elListaParticipantes.querySelectorAll(".toggleAtivo").forEach((chk) => {
    chk.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-id");
      const ativo = e.target.checked;

      try {
        const { error } = await sb.from("mediums").update({ active: ativo }).eq("id", id);
        if (error) throw new Error(error.message);

        // atualiza memória e telas
        const idx = mediumsAll.findIndex((x) => x.id === id);
        if (idx >= 0) mediumsAll[idx].active = ativo;
        mediumsAtivos = mediumsAll.filter((m) => m.active === true);
        renderChamada();
      } catch (err) {
        setErro("Não foi possível atualizar participante: " + err.message);
      }
    });
  });
}

function filtrarParticipantes() {
  const q = (elBusca?.value || "").trim().toLowerCase();
  const lista = q
    ? mediumsAll.filter((m) => (m.name || "").toLowerCase().includes(q))
    : mediumsAll;
  renderParticipantesLista(lista);
}

async function adicionarParticipante() {
  const nome = (elNovoNome?.value || "").trim();
  const grupo = (elNovoGrupo?.value || "").trim();

  if (!nome || !grupo) {
    setErro("Informe nome e grupo para adicionar.");
    return;
  }

  try {
    const payload = {
      name: nome,
      group_type: grupo,
      active: true,
      faltas: 0,
      presencas: 0,
      mesa: false,
      psicografia: false,
      carencia_total: 0,
      carencia_atual: 0,
      primeira_inc: false
    };

    const { error } = await sb.from("mediums").insert(payload);
    if (error) throw new Error(error.message);

    elNovoNome.value = "";
    await carregarMediums();
    filtrarParticipantes();
    renderChamada();
  } catch (err) {
    setErro("Erro ao adicionar participante: " + err.message);
  }
}

/* ===== SALVAR CHAMADA ===== */
async function salvarChamada() {
  if (elResultadoSalvar) setText(elResultadoSalvar, "");

  const ok = await verificarData();
  if (!ok) {
    if (elResultadoSalvar) setText(elResultadoSalvar, "Corrija a data antes de salvar.");
    return;
  }

  const dataISO = parseInputDateToISO(elDataChamada?.value);
  if (!dataISO) {
    setErro("Data inválida.");
    return;
  }

  // coleta status marcados
  const registros = [];
  const radios = document.querySelectorAll('input[type="radio"]:checked');
  radios.forEach((r) => {
    const mediumId = r.name; // usamos o id como name
    const status = r.value;  // P/M/F/PS
    registros.push({ medium_id: mediumId, data: dataISO, status });
  });

  if (registros.length === 0) {
    if (elResultadoSalvar) setText(elResultadoSalvar, "Nenhuma presença marcada.");
    return;
  }

  try {
    // insere tudo
    const { error } = await sb.from("chamadas").insert(registros);
    if (error) throw new Error(error.message);

    if (elResultadoSalvar) setText(elResultadoSalvar, "✅ Chamada salva!");
  } catch (err) {
    setErro("Erro ao salvar chamadas: " + err.message);
  }
}

/* ===== WIRE UI ===== */
function wireUI() {
  if (elBtnVerificar) elBtnVerificar.addEventListener("click", verificarData);
  if (elBtnSalvar) elBtnSalvar.addEventListener("click", salvarChamada);

  if (elBusca) elBusca.addEventListener("input", filtrarParticipantes);
  if (elBtnAdd) elBtnAdd.addEventListener("click", adicionarParticipante);
}

/* ===== INIT ===== */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      setErro("Supabase JS não carregou. Confira o <script src=...supabase-js> no index.html (antes do app.js).");
      return;
    }

    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    setConectando("Conectando ao Supabase...");
    await testarConexao();

    await carregarFeriados();
    await carregarRotacao();
    await carregarMediums();

    wireUI();

    // data default = hoje
    if (elDataChamada && !elDataChamada.value) {
      elDataChamada.value = toISODate(new Date());
    }

    renderChamada();
    filtrarParticipantes();

    setConectado("Conectado ✅");
  } catch (err) {
    setErro(err.message || String(err));
  }
});