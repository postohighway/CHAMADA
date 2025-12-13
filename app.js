/* =========================================================
   CHAMADA DE MÉDIUNS — app.js (ZERADO / ESTÁVEL)
   - Não altera estética (somente lógica)
   - Supabase + RLS
   - Tabelas esperadas:
       public.mediums  (id uuid, name text, group_type text, active bool, mesa bool, psicografia bool, ...)
       public.chamadas (id uuid, medium_id uuid, data date, status text, created_at timestamptz)
       public.feriados (id?, data date, ...)
   ========================================================= */

/* ====== CONFIG SUPABASE (OK) ====== */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/* ====== ESTADO ====== */
let sb = null;

let mediumsAll = [];      // todos
let mediumsAtivos = [];   // ativos
let feriadosSet = new Set();

let chamadasHoje = new Map(); // medium_id -> status selecionado na UI
let carregou = false;

/* ====== HELPERS DOM (não mexe no layout) ====== */
const $ = (id) => document.getElementById(id);

// tenta achar um elemento por várias opções (pra não quebrar se o id variar)
function pickId(possiveisIds) {
  for (const id of possiveisIds) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}
function text(el, t) { if (el) el.textContent = t; }
function html(el, h) { if (el) el.innerHTML = h; }
function show(el) { if (el) el.style.display = "block"; }
function hide(el) { if (el) el.style.display = "none"; }

const elStatusConexao = pickId(["statusConexao", "status", "statusSupabase"]);
const elMsgTopo = pickId(["mensagemTopo", "mensagem", "msgTopo"]);
const elAvisoData = pickId(["avisoData", "statusData", "msgData"]);
const elDataChamada = pickId(["dataChamada", "data", "inputData"]);
const elBtnVerificar = pickId(["btnVerificarData", "verificarData", "btnVerificar"]);
const elBtnSalvar = pickId(["btnSalvarChamada", "salvarChamada", "btnSalvar"]);
const elResultadoSalvar = pickId(["resultadoSalvar", "msgSalvar", "resultado"]);

// containers da chamada
const elListaDirigentes     = pickId(["listaDirigentes", "dirigentesList"]);
const elListaIncorporacao   = pickId(["listaIncorporacao", "incorporacaoList"]);
const elListaDesenvolvimento= pickId(["listaDesenvolvimento", "desenvolvimentoList"]);
const elListaCarencia       = pickId(["listaCarencia", "carenciaList"]);

// participantes
const elBuscaPart = pickId(["buscaParticipantes", "buscarParticipante", "busca"]);
const elNovoNome  = pickId(["novoNome", "nomeNovo", "nome"]);
const elNovoGrupo = pickId(["novoGrupo", "grupoNovo", "grupo"]);
const elBtnAdd    = pickId(["btnAdicionarParticipante", "adicionarParticipante", "btnAdicionar"]);
const elListaParticipantes = pickId(["listaParticipantes", "lista", "participantesList"]);

function setConectando(msg = "Conectando...") {
  if (elStatusConexao) {
    elStatusConexao.textContent = msg;
    // não altera classes/estética
  }
}
function setConectado(msg = "Conectado ✅") {
  if (elStatusConexao) elStatusConexao.textContent = msg;
}
function setErroTopo(msg) {
  if (elMsgTopo) elMsgTopo.textContent = msg;
}

/* ====== INIT ====== */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Supabase lib carregada?
    if (!window.supabase || !window.supabase.createClient) {
      setConectando("Supabase JS não carregou (verifique o <script> do supabase-js).");
      return;
    }

    // 2) client
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 3) Teste rápido
    setConectando("Conectando ao Supabase...");
    await testeSelectBasico();

    // 4) Wire UI
    wireUI();

    // 5) Carregar dados
    await carregarTudo();

    setConectado("Conectado ✅");
    carregou = true;
  } catch (e) {
    console.error(e);
    setConectando("Falha ao iniciar: " + (e?.message || e));
  }
});

/* ====== TESTE DE CONEXÃO ====== */
async function testeSelectBasico() {
  // Se isso falhar, não é “tela”: é conexão/URL/KEY/RLS/SDK
  const { data, error } = await sb.from("mediums").select("id").limit(1);
  if (error) throw new Error("Falha no SELECT mediums: " + error.message);
  return data;
}

/* ====== UI EVENTS ====== */
function wireUI() {
  if (elBtnVerificar) {
    elBtnVerificar.addEventListener("click", async () => {
      await verificarData();
    });
  }

  if (elBtnSalvar) {
    elBtnSalvar.addEventListener("click", async () => {
      await salvarChamada();
    });
  }

  if (elBtnAdd) {
    elBtnAdd.addEventListener("click", async () => {
      await adicionarParticipante();
    });
  }

  if (elBuscaPart) {
    elBuscaPart.addEventListener("input", () => {
      renderParticipantes();
    });
  }

  // se tiver input de data, já sugere hoje
  if (elDataChamada && !elDataChamada.value) {
    // deixa no formato que seu input aceitar (muitos aceitam YYYY-MM-DD)
    const hoje = new Date();
    const iso = hoje.toISOString().slice(0, 10);
    elDataChamada.value = iso;
  }
}

/* ====== LOADERS ====== */
async function carregarTudo() {
  await carregarFeriados();
  await carregarMediums();
  await renderChamada();
  await renderParticipantes();
}

async function carregarFeriados() {
  feriadosSet = new Set();
  const { data, error } = await sb.from("feriados").select("data");
  if (error) {
    // não trava o app, mas avisa (seu print antigo mostrava isso)
    console.warn("Erro feriados:", error);
    if (elAvisoData) elAvisoData.textContent = "⚠️ Erro ao consultar feriados (verifique RLS/políticas).";
    return;
  }
  (data || []).forEach((r) => {
    if (r?.data) feriadosSet.add(String(r.data));
  });
}

async function carregarMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error("Erro ao carregar mediums: " + error.message);

  mediumsAll = data || [];
  mediumsAtivos = mediumsAll.filter((m) => m.active === true);
}

/* ====== VALIDAÇÃO DATA ====== */
async function verificarData() {
  if (!elDataChamada) return false;

  const dataStr = elDataChamada.value;
  if (!dataStr) {
    if (elAvisoData) elAvisoData.textContent = "Selecione uma data.";
    return false;
  }

  // dia da semana (0 dom ... 2 terça)
  const d = new Date(dataStr + "T03:00:00"); // evita timezone quebrar
  const diaSemana = d.getDay();

  // terça-feira somente
  if (diaSemana !== 2) {
    if (elAvisoData) elAvisoData.textContent = "✘ Chamada só pode ser feita em TERÇA-FEIRA.";
    return false;
  }

  // feriado
  if (feriadosSet.has(dataStr)) {
    if (elAvisoData) elAvisoData.textContent = "✘ Hoje é feriado! Chamada não permitida.";
    return false;
  }

  if (elAvisoData) elAvisoData.textContent = "✅ Data válida, pode registrar presença.";
  return true;
}

/* ====== RENDER CHAMADA ====== */
async function renderChamada() {
  chamadasHoje = new Map(); // limpa seleção em memória

  const ativos = mediumsAtivos.slice();

  const dirigentes = ativos.filter((m) => m.group_type === "dirigente");
  const incorporacao = ativos.filter((m) => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter((m) => m.group_type === "desenvolvimento");
  const carencia = ativos.filter((m) => m.group_type === "carencia");

  renderGrupo(elListaDirigentes, dirigentes, "dirigente");
  renderGrupo(elListaIncorporacao, incorporacao, "incorporacao");
  renderGrupo(elListaDesenvolvimento, desenvolvimento, "desenvolvimento");
  renderGrupo(elListaCarencia, carencia, "carencia");
}

function renderGrupo(container, lista, groupType) {
  if (!container) return;

  if (!lista || lista.length === 0) {
    container.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  container.innerHTML = "";
  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card"; // mantém seu CSS

    // tags “próximo”
    const tagMesa = m.mesa ? `<span class="tag-next tag-mesa">PRÓXIMO (MESA)</span>` : "";
    const tagPS   = m.psicografia ? `<span class="tag-next tag-ps">PRÓXIMO (PS)</span>` : "";

    // % falta (se tiver faltas/presencas)
    const faltas = Number(m.faltas || 0);
    const pres = Number(m.presencas || 0);
    const total = faltas + pres;
    const perc = total > 0 ? Math.round((faltas * 100) / total) : 0;
    const percHtml = `<span class="badge-falta">${perc}% faltas</span>`;

    // radios
    let radios = "";
    if (groupType === "carencia") {
      radios = radiosHTML(m.id, ["P", "F"]);
    } else if (groupType === "dirigente") {
      // dirigentes tem PS também
      radios = radiosHTML(m.id, ["P", "M", "F", "PS"]);
    } else {
      radios = radiosHTML(m.id, ["P", "M", "F"]);
    }

    card.innerHTML = `
      <div class="card-left">
        <div class="medium-name">${escapeHtml(m.name || "")} ${percHtml}</div>
      </div>
      <div class="card-right">
        <div class="next-tags">${tagMesa} ${tagPS}</div>
        <div class="radios">${radios}</div>
      </div>
    `;

    // eventos radios
    card.querySelectorAll(`input[name="status_${m.id}"]`).forEach((inp) => {
      inp.addEventListener("change", () => {
        chamadasHoje.set(m.id, inp.value);
      });
    });

    container.appendChild(card);
  });
}

function radiosHTML(mediumId, opcoes) {
  return opcoes
    .map((v) => {
      const id = `st_${mediumId}_${v}`;
      return `
        <label class="radio">
          <input type="radio" id="${id}" name="status_${mediumId}" value="${v}">
          <span>${v}</span>
        </label>
      `;
    })
    .join("");
}

/* ====== SALVAR CHAMADA ====== */
async function salvarChamada() {
  if (elResultadoSalvar) elResultadoSalvar.textContent = "";

  // valida data
  const okData = await verificarData();
  if (!okData) {
    if (elResultadoSalvar) elResultadoSalvar.textContent = "Corrija a data antes de salvar.";
    return;
  }
  const dataStr = elDataChamada?.value;
  if (!dataStr) return;

  // monta registros
  const registros = [];
  for (const [mediumId, status] of chamadasHoje.entries()) {
    registros.push({ medium_id: mediumId, data: dataStr, status });
  }

  if (registros.length === 0) {
    if (elResultadoSalvar) elResultadoSalvar.textContent = "Nenhuma presença marcada.";
    return;
  }

  try {
    const { error } = await sb.from("chamadas").insert(registros);

    if (error) {
      console.error("Erro insert chamadas:", error);

      // Se for RLS (o seu print do iPhone)
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("rls")) {
        if (elResultadoSalvar) {
          elResultadoSalvar.textContent =
            '❌ RLS bloqueou o INSERT na tabela "chamadas".\n' +
            "Você precisa liberar INSERT para role anon (ou voltar a usar login).\n" +
            "Se quiser, eu te mando o SQL exato.";
        }
        return;
      }

      if (elResultadoSalvar) elResultadoSalvar.textContent = "❌ Erro ao salvar: " + error.message;
      return;
    }

    if (elResultadoSalvar) elResultadoSalvar.textContent = "✅ Chamada salva com sucesso!";

    // após salvar: atualiza contadores e “próximos”
    await atualizarEstatisticasEAtribuicoes(registros);

    // recarrega dados e redesenha
    await carregarMediums();
    await renderChamada();
    await renderParticipantes();
  } catch (e) {
    console.error(e);
    if (elResultadoSalvar) elResultadoSalvar.textContent = "❌ Exceção ao salvar: " + (e?.message || e);
  }
}

/* ====== ATUALIZA ESTATÍSTICAS / MESA / PS (sem mexer no layout) ====== */
async function atualizarEstatisticasEAtribuicoes(registros) {
  // 1) Atualiza presencas/faltas no mediums
  // 2) Se status == 'M' -> gira "mesa" (somente dirigentes)
  //    Se status == 'PS' -> gira "psicografia" (somente dirigentes)

  // cache de mediums por id
  const byId = new Map(mediumsAll.map((m) => [m.id, m]));

  // Atualização simples (um por um) para ficar robusto sem RPC
  for (const r of registros) {
    const m = byId.get(r.medium_id);
    if (!m) continue;

    const status = r.status;

    // faltas/presencas
    if (status === "F") {
      const novo = Number(m.faltas || 0) + 1;
      await sb.from("mediums").update({ faltas: novo }).eq("id", r.medium_id);
      m.faltas = novo;
    } else {
      // P / M / PS contam como presença (do seu padrão anterior)
      const novo = Number(m.presencas || 0) + 1;
      await sb.from("mediums").update({ presencas: novo }).eq("id", r.medium_id);
      m.presencas = novo;
    }

    // rotação mesa / psicografia: só se for dirigente
    if (m.group_type === "dirigente") {
      if (status === "M") {
        await rotacionarFlag("mesa");
      }
      if (status === "PS") {
        await rotacionarFlag("psicografia");
      }
    }
  }
}

/* gira a flag mesa/psicografia para o próximo dirigente ativo */
async function rotacionarFlag(flagName) {
  // pega dirigentes ativos
  const dirigentes = mediumsAtivos.filter((x) => x.group_type === "dirigente");

  if (dirigentes.length === 0) return;

  // acha o atual flag==true
  const idxAtual = dirigentes.findIndex((x) => x[flagName] === true);

  // se não tem nenhum marcado, marca o primeiro
  if (idxAtual === -1) {
    const first = dirigentes[0];
    await sb.from("mediums").update({ [flagName]: true }).eq("id", first.id);
    return;
  }

  const atual = dirigentes[idxAtual];
  const prox = dirigentes[(idxAtual + 1) % dirigentes.length];

  // desmarca atual, marca próximo
  await sb.from("mediums").update({ [flagName]: false }).eq("id", atual.id);
  await sb.from("mediums").update({ [flagName]: true }).eq("id", prox.id);
}

/* ====== PARTICIPANTES ====== */
async function renderParticipantes() {
  if (!elListaParticipantes) return;

  const termo = (elBuscaPart?.value || "").trim().toLowerCase();

  const lista = mediumsAll
    .filter((m) => {
      if (!termo) return true;
      return String(m.name || "").toLowerCase().includes(termo);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  const rows = lista.map((m) => {
    const ativo = m.active === true;
    const grupo = m.group_type || "";
    return `
      <div class="part-row">
        <div class="part-name">${escapeHtml(m.name || "")}</div>
        <div class="part-actions">
          <select class="part-grupo" data-id="${m.id}">
            ${optGrupo("dirigente", grupo)}
            ${optGrupo("incorporacao", grupo)}
            ${optGrupo("desenvolvimento", grupo)}
            ${optGrupo("carencia", grupo)}
          </select>
          <button class="part-toggle" data-id="${m.id}" data-ativo="${ativo ? "1" : "0"}">
            ${ativo ? "Ativo" : "Inativo"}
          </button>
        </div>
      </div>
    `;
  }).join("");

  elListaParticipantes.innerHTML = rows || `<div class="empty">Nenhum participante.</div>`;

  // listeners: troca grupo
  elListaParticipantes.querySelectorAll(".part-grupo").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.getAttribute("data-id");
      const val = sel.value;
      await sb.from("mediums").update({ group_type: val }).eq("id", id);
      await carregarMediums();
      await renderChamada();
      await renderParticipantes();
    });
  });

  // listeners: toggle ativo
  elListaParticipantes.querySelectorAll(".part-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const ativo = btn.getAttribute("data-ativo") === "1";
      await sb.from("mediums").update({ active: !ativo }).eq("id", id);
      await carregarMediums();
      await renderChamada();
      await renderParticipantes();
    });
  });
}

function optGrupo(valor, atual) {
  const sel = valor === atual ? "selected" : "";
  // label bonitinho sem mexer no CSS
  const label =
    valor === "dirigente" ? "Dirigente" :
    valor === "incorporacao" ? "Incorporação" :
    valor === "desenvolvimento" ? "Desenvolvimento" :
    valor === "carencia" ? "Carência" : valor;
  return `<option value="${valor}" ${sel}>${label}</option>`;
}

async function adicionarParticipante() {
  if (!elNovoNome || !elNovoGrupo) return;

  const name = (elNovoNome.value || "").trim();
  const group_type = elNovoGrupo.value;

  if (!name) return;

  const payload = {
    name,
    group_type,
    active: true,
    faltas: 0,
    presencas: 0,
  };

  const { error } = await sb.from("mediums").insert([payload]);
  if (error) {
    console.error(error);
    setErroTopo("Erro ao adicionar participante: " + error.message);
    return;
  }

  elNovoNome.value = "";
  await carregarMediums();
  await renderChamada();
  await renderParticipantes();
}

/* ====== UTIL ====== */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}