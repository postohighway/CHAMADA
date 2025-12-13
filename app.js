/* =======================
   CHAMADA DE MÉDIUNS — app.js (COMPLETO)
   ======================= */

/* ===== CONFIG SUPABASE ===== */
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co"; // <-- TROQUE AQUI
const SUPABASE_ANON_KEY = "SUA_ANON_KEY_AQUI";          // <-- TROQUE AQUI

let sb = null;

/* ===== ESTADO ===== */
let mediumsCache = [];
let rotacaoMap = {}; // { group_type: last_medium_id }
let conectado = false;

/* ===== HELPERS DOM ===== */
const $ = (id) => document.getElementById(id);
function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function setHTML(id, html) { const el = $(id); if (el) el.innerHTML = html; }
function show(id) { const el = $(id); if (el) el.style.display = "block"; }
function hide(id) { const el = $(id); if (el) el.style.display = "none"; }

function setConectando(msg = "Conectando...") {
  setText("statusConexao", msg);
}
function setConectado(msg = "Conectado ✅") {
  setText("statusConexao", msg);
}
function setErro(msg) {
  setText("statusConexao", "Erro: " + msg);
}

/* ===== INIT ===== */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1) Verifica se a lib do supabase existe
    if (!window.supabase || !window.supabase.createClient) {
      setErro("Supabase JS não carregou. Confira o <script src=...supabase-js@2> no index.html (ANTES do app.js).");
      return;
    }

    // 2) Cria client
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 3) Conecta testando SELECT simples
    setConectando("Conectando ao Supabase...");
    await testarConexao();

    // 4) Wire UI
    wireUI();

    // 5) Carrega dados iniciais
    await carregarTudo();

  } catch (e) {
    console.error(e);
    setErro(e?.message || String(e));
  }
});

/* ===== TESTE CONEXÃO ===== */
async function testarConexao() {
  // teste “barato”: SELECT head/count
  const { error } = await sb
    .from("mediums")
    .select("id", { head: true, count: "exact" });

  if (error) {
    conectado = false;
    console.error("Erro Supabase:", error);
    setErro("não conectou (" + error.message + "). Verifique URL/KEY e RLS/policies.");
    throw error;
  }

  conectado = true;
  setConectado("Conectado ✅");
}

/* ===== EVENTOS UI ===== */
function wireUI() {
  // troca de abas (se existir)
  const tabChamada = $("tabChamada");
  const tabAdmin = $("tabAdmin");
  const abaChamada = $("abaChamada");
  const abaAdmin = $("abaAdmin");

  if (tabChamada && tabAdmin && abaChamada && abaAdmin) {
    tabChamada.addEventListener("click", () => {
      tabChamada.classList.add("active");
      tabAdmin.classList.remove("active");
      abaChamada.style.display = "block";
      abaAdmin.style.display = "none";
    });

    tabAdmin.addEventListener("click", async () => {
      tabAdmin.classList.add("active");
      tabChamada.classList.remove("active");
      abaAdmin.style.display = "block";
      abaChamada.style.display = "none";
      // garante lista atualizada
      await listarParticipantesAdmin();
    });
  }

  // verificar data
  const btnVerificar = $("btnVerificarData");
  if (btnVerificar) btnVerificar.addEventListener("click", async () => {
    await verificarData();
  });

  // salvar chamada
  const btnSalvar = $("btnSalvarChamada");
  if (btnSalvar) btnSalvar.addEventListener("click", async () => {
    await salvarChamada();
  });

  // admin: adicionar
  const btnAdd = $("btnAdicionarParticipante");
  if (btnAdd) btnAdd.addEventListener("click", async () => {
    await adicionarParticipante();
  });

  // admin: buscar
  const busca = $("adminBusca");
  if (busca) busca.addEventListener("input", () => listarParticipantesAdmin());
}

/* ===== CARREGAR DADOS ===== */
async function carregarTudo() {
  if (!conectado) return;

  await carregarRotacao();
  await carregarMediums();
  renderGruposChamada();
  await listarParticipantesAdmin(); // não trava se a aba não existir
}

/* ===== ROTACAO ===== */
async function carregarRotacao() {
  rotacaoMap = {};
  const { data, error } = await sb.from("rotacao").select("*");
  if (error) {
    console.error("Erro rotacao:", error);
    // não mata o app: só deixa sem rotação
    return;
  }
  (data || []).forEach((r) => {
    rotacaoMap[r.group_type] = r.last_medium_id;
  });
}

function getNextMediumId(lista, lastId) {
  if (!lista || lista.length === 0) return null;
  if (!lastId) return lista[0].id;
  const idx = lista.findIndex((m) => m.id === lastId);
  if (idx === -1) return lista[0].id;
  return (idx === lista.length - 1) ? lista[0].id : lista[idx + 1].id;
}

/* ===== MEDIUMS ===== */
async function carregarMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Erro carregar mediums:", error);
    setErro("Erro ao carregar 'mediums': " + error.message);
    throw error;
  }
  mediumsCache = data || [];

  // some mensagem “Conectando…” que pode estar no admin
  const loadingAdmin = $("adminLoading");
  if (loadingAdmin) loadingAdmin.style.display = "none";
}

/* ===== VERIFICAR DATA (terça + feriado) ===== */
async function verificarData() {
  const data = $("dataChamada")?.value;
  const aviso = $("avisoData");

  if (!data) {
    if (aviso) aviso.textContent = "Selecione uma data.";
    return false;
  }

  // terça-feira: 0 dom, 1 seg, 2 ter...
  const diaSemana = new Date(data + "T03:00:00").getDay();
  if (diaSemana !== 2) {
    if (aviso) aviso.textContent = "❌ Chamada só pode ser feita na TERÇA-FEIRA.";
    return false;
  }

  // feriados (se a tabela existir e estiver liberada)
  const { data: fer, error } = await sb.from("feriados").select("*").eq("data", data);
  if (error) {
    if (aviso) aviso.textContent = "⚠️ Não consegui consultar feriados (RLS/policies/erro). Mas pode continuar.";
    return true; // não bloqueia
  }
  if ((fer || []).length > 0) {
    if (aviso) aviso.textContent = "❌ Hoje é feriado. Chamada não permitida.";
    return false;
  }

  if (aviso) aviso.textContent = "✅ Data válida, pode registrar presença.";
  return true;
}

/* ===== RENDER CHAMADA ===== */
function renderGruposChamada() {
  const ativos = mediumsCache.filter((m) => m.active !== false);

  const dirigentes = ativos.filter((m) => m.group_type === "dirigente");
  const incorporacao = ativos.filter((m) => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter((m) => m.group_type === "desenvolvimento");
  const carencia = ativos.filter((m) => m.group_type === "carencia");

  // rotações:
  // - mesa normal: usa o group_type (incorporacao/desenvolvimento/dirigente etc)
  // - psicografia: vamos usar group_type = "dirigente_ps" (se existir na sua rotacao)
  const nextDirMesa = getNextMediumId(dirigentes, rotacaoMap["dirigente"] || null);
  const nextDirPs = getNextMediumId(dirigentes, rotacaoMap["dirigente_ps"] || null);

  renderGrupo("listaDirigentes", dirigentes, "dirigente", { nextMesaId: nextDirMesa, nextPsId: nextDirPs });
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

function calcPercFalta(m) {
  const faltas = Number(m.faltas || 0);
  const presencas = Number(m.presencas || 0);
  const total = faltas + presencas;
  if (total <= 0) return 0;
  return Math.round((faltas * 100) / total);
}

function renderGrupo(divId, lista, groupType, opts = {}) {
  const div = $(divId);
  if (!div) return;

  div.innerHTML = "";

  if (!lista || lista.length === 0) {
    div.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  const useRotationMesa = (groupType !== "carencia"); // carência não vai à mesa
  const nextMesaId =
    opts.nextMesaId ||
    (useRotationMesa ? getNextMediumId(lista, rotacaoMap[groupType] || null) : null);

  const nextPsId = opts.nextPsId || null; // só p/ dirigentes (psicografia)

  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card";

    // Destaques
    if (useRotationMesa && m.id === nextMesaId) card.classList.add("medium-next"); // amarelo (mesa)
    if (groupType === "dirigente" && nextPsId && m.id === nextPsId) card.classList.add("medium-next-ps"); // vermelho (ps)

    // % faltas
    const perc = calcPercFalta(m);
    const percHtml = `<span class="badge-perc ${perc >= 30 ? "badge-falta-alta" : ""}">${perc}% faltas</span>`;

    // Radios: carência só P/F; demais P/M/F (+ PS p/ dirigente)
    const name = m.name || "(sem nome)";

    const radios = document.createElement("div");
    radios.className = "status-radios";

    function radio(label, value) {
      const wrap = document.createElement("label");
      wrap.className = "radio";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `status_${m.id}`;
      input.value = value;
      const span = document.createElement("span");
      span.textContent = label;
      wrap.appendChild(input);
      wrap.appendChild(span);
      return wrap;
    }

    radios.appendChild(radio("P", "P"));

    if (groupType !== "carencia") {
      radios.appendChild(radio("M", "M"));
      radios.appendChild(radio("F", "F"));
    } else {
      radios.appendChild(radio("F", "F"));
    }

    if (groupType === "dirigente") {
      // PS = psicografia (marcação especial)
      const ps = radio("PS", "PS");
      ps.classList.add("radio-ps");
      radios.appendChild(ps);
    }

    // tags “próximo”
    const tags = document.createElement("div");
    tags.className = "tags-next";
    if (useRotationMesa && m.id === nextMesaId) tags.innerHTML += `<span class="tag tag-mesa">PRÓXIMO (MESA)</span>`;
    if (groupType === "dirigente" && nextPsId && m.id === nextPsId) tags.innerHTML += `<span class="tag tag-ps">PRÓXIMO (PS)</span>`;

    card.innerHTML = `
      <div class="medium-header">
        <div class="medium-name">${name}</div>
        <div class="medium-right">
          ${percHtml}
          ${tags.innerHTML}
        </div>
      </div>
    `;

    card.appendChild(radios);
    div.appendChild(card);
  });
}

/* ===== SALVAR CHAMADA ===== */
async function salvarChamada() {
  const data = $("dataChamada")?.value;
  const res = $("resultadoSalvar");

  if (!data) {
    if (res) res.textContent = "Selecione uma data.";
    return;
  }

  const ok = await verificarData();
  if (!ok) {
    if (res) res.textContent = "Corrija a data antes de salvar.";
    return;
  }

  // coleta registros marcados
  const registros = [];
  mediumsCache.forEach((m) => {
    if (m.active === false) return;
    const sel = document.querySelector(`input[name="status_${m.id}"]:checked`);
    if (!sel) return;
    registros.push({
      medium_id: m.id,
      data: data,
      status: sel.value
    });
  });

  if (registros.length === 0) {
    if (res) res.textContent = "Nenhuma presença marcada.";
    return;
  }

  // INSERT chamadas
  const { error } = await sb.from("chamadas").insert(registros);
  if (error) {
    console.error("Erro salvar chamadas:", error);
    if (res) res.textContent = "❌ Erro ao salvar: " + error.message;
    return;
  }

  // Atualiza contadores em mediums (presencas/faltas) e rotação
  await atualizarEstatisticasERotacao(registros);

  // recarrega e redesenha
  await carregarRotacao();
  await carregarMediums();
  renderGruposChamada();

  if (res) res.textContent = "✅ Chamada registrada com sucesso!";
}

async function atualizarEstatisticasERotacao(registros) {
  // 1) computa deltas por medium
  const delta = {}; // { medium_id: { pres:0, falt:0 } }
  registros.forEach((r) => {
    if (!delta[r.medium_id]) delta[r.medium_id] = { pres: 0, falt: 0 };
    // P ou M conta como presença
    if (r.status === "F") delta[r.medium_id].falt += 1;
    else delta[r.medium_id].pres += 1;
  });

  // 2) aplica updates em lote (um a um, simples e seguro)
  for (const mid of Object.keys(delta)) {
    const { pres, falt } = delta[mid];
    // pega valores atuais
    const atual = mediumsCache.find((m) => m.id === mid) || {};
    const presencas = Number(atual.presencas || 0) + pres;
    const faltas = Number(atual.faltas || 0) + falt;

    const { error } = await sb.from("mediums").update({ presencas, faltas }).eq("id", mid);
    if (error) console.error("Erro update mediums:", mid, error);
  }

  // 3) atualiza rotação:
  // - Para cada grupo (exceto carência) se alguém marcou M → essa pessoa vira last_medium_id do grupo
  // - Para dirigentes, se alguém marcou PS → vira last_medium_id do group_type "dirigente_ps"
  const byId = (id) => mediumsCache.find((m) => m.id === id);

  // Mesa (M)
  const mesa = registros.filter((r) => r.status === "M");
  for (const r of mesa) {
    const m = byId(r.medium_id);
    if (!m) continue;
    if (m.group_type === "carencia") continue; // carência não vai à mesa
    const { error } = await sb.from("rotacao").update({ last_medium_id: m.id, updated_at: new Date().toISOString() }).eq("group_type", m.group_type);
    if (error) console.error("Erro update rotacao mesa:", error);
  }

  // Psicografia (PS) — somente dirigente
  const ps = registros.filter((r) => r.status === "PS");
  for (const r of ps) {
    const m = byId(r.medium_id);
    if (!m) continue;
    if (m.group_type !== "dirigente") continue;
    const { error } = await sb.from("rotacao").update({ last_medium_id: m.id, updated_at: new Date().toISOString() }).eq("group_type", "dirigente_ps");
    if (error) console.error("Erro update rotacao ps:", error);
  }
}

/* ===== ADMIN / PARTICIPANTES ===== */
async function listarParticipantesAdmin() {
  const box = $("adminLista");
  if (!box) return;

  // mostra loading se existir
  const loading = $("adminLoading");
  if (loading) loading.style.display = "block";

  try {
    // garante cache atualizado
    if (!mediumsCache || mediumsCache.length === 0) {
      await carregarMediums();
    }

    const termo = ($("adminBusca")?.value || "").trim().toLowerCase();
    const lista = mediumsCache
      .slice()
      .filter((m) => !termo || (m.name || "").toLowerCase().includes(termo))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

    box.innerHTML = "";

    if (lista.length === 0) {
      box.innerHTML = `<div class="empty">Nenhum participante encontrado.</div>`;
      return;
    }

    lista.forEach((m) => {
      const row = document.createElement("div");
      row.className = "admin-row";

      const active = (m.active !== false);

      row.innerHTML = `
        <div class="admin-col">
          <div class="admin-name">${m.name || ""}</div>
          <div class="admin-meta">
            <span class="chip">${m.group_type || "-"}</span>
            <span class="chip">${active ? "ativo" : "inativo"}</span>
          </div>
        </div>

        <div class="admin-actions">
          <button class="btn-small" data-act="editar">Editar</button>
          <button class="btn-small" data-act="ativar">${active ? "Desativar" : "Ativar"}</button>
          <button class="btn-small btn-danger" data-act="excluir">Excluir</button>
        </div>
      `;

      row.querySelector('[data-act="editar"]').addEventListener("click", async () => {
        const novoNome = prompt("Editar nome:", m.name || "");
        if (novoNome === null) return;
        const nomeFinal = novoNome.trim();
        if (!nomeFinal) return alert("Nome inválido.");

        const novoGrupo = prompt("Editar grupo (dirigente/incorporacao/desenvolvimento/carencia):", m.group_type || "");
        if (novoGrupo === null) return;
        const grupoFinal = novoGrupo.trim();

        const { error } = await sb.from("mediums").update({ name: nomeFinal, group_type: grupoFinal }).eq("id", m.id);
        if (error) return alert("Erro ao editar: " + error.message);

        await carregarTudo();
      });

      row.querySelector('[data-act="ativar"]').addEventListener("click", async () => {
        const { error } = await sb.from("mediums").update({ active: !active }).eq("id", m.id);
        if (error) return alert("Erro ao alterar ativo: " + error.message);
        await carregarTudo();
      });

      row.querySelector('[data-act="excluir"]').addEventListener("click", async () => {
        if (!confirm(`Excluir "${m.name}"?`)) return;
        const { error } = await sb.from("mediums").delete().eq("id", m.id);
        if (error) return alert("Erro ao excluir: " + error.message);
        await carregarTudo();
      });

      box.appendChild(row);
    });
  } finally {
    if (loading) loading.style.display = "none";
  }
}

async function adicionarParticipante() {
  const nome = $("adminNome")?.value?.trim();
  const grupo = $("adminGrupo")?.value?.trim();

  if (!nome) return alert("Informe o nome.");
  if (!grupo) return alert("Selecione o grupo.");

  const { error } = await sb.from("mediums").insert([{ name: nome, group_type: grupo, active: true, presencas: 0, faltas: 0 }]);
  if (error) {
    alert("Erro ao adicionar: " + error.message);
    return;
  }

  if ($("adminNome")) $("adminNome").value = "";
  await carregarTudo();
}
