/* =========================
   CONFIGURAÇÃO SUPABASE
========================= */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

let sb = null;

/* =========================
   CACHE / ESTADO
========================= */
let mediumsCache = [];
let rotaMap = {
  dirigente: null,        // last_medium_id (mesa)
  incorporacao: null,     // last_medium_id (mesa)
  desenvolvimento: null,  // last_medium_id (mesa)
  carencia: null,         // sempre null (sem rotação)
  psicografia: null,      // last_medium_id (psicografia - dirigente)
};

const GROUPS = ["dirigente", "incorporacao", "desenvolvimento", "carencia"];

/* =========================
   HELPERS DOM
========================= */
function $(id) {
  return document.getElementById(id);
}
function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}
function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}
function show(id) {
  const el = $(id);
  if (el) el.style.display = "block";
}
function hide(id) {
  const el = $(id);
  if (el) el.style.display = "none";
}
function disable(id, disabled) {
  const el = $(id);
  if (el) el.disabled = !!disabled;
}

/* =========================
   INIT
========================= */
function initSupabaseOrDie() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error(
      "Supabase JS não carregou. Confirme o <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> no index.html"
    );
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function initApp() {
  try {
    initSupabaseOrDie();
  } catch (e) {
    console.error(e);
    setText("erroGlobal", "Erro: supabase-js não carregou no navegador.");
    return;
  }

  // Setar data padrão (hoje) se existir input
  const dataInput = $("dataChamada");
  if (dataInput && !dataInput.value) {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");
    dataInput.value = `${yyyy}-${mm}-${dd}`;
  }

  // Bind botões
  const btnVerificar = $("btnVerificarData");
  if (btnVerificar) btnVerificar.addEventListener("click", verificarData);

  const btnSalvar = $("btnSalvar");
  if (btnSalvar) btnSalvar.addEventListener("click", salvarChamada);

  const btnAbaChamada = $("tabChamada");
  if (btnAbaChamada) btnAbaChamada.addEventListener("click", () => mostrarAba("chamada"));

  const btnAbaAdmin = $("tabAdmin");
  if (btnAbaAdmin) btnAbaAdmin.addEventListener("click", () => mostrarAba("admin"));

  const btnSair = $("btnSair");
  if (btnSair) btnSair.addEventListener("click", logout);

  const btnLogin = $("btnLogin");
  if (btnLogin) btnLogin.addEventListener("click", login);

  const btnSalvarParticipante = $("btnSalvarParticipante");
  if (btnSalvarParticipante) btnSalvarParticipante.addEventListener("click", salvarParticipanteAdmin);

  const btnNovoParticipante = $("btnNovoParticipante");
  if (btnNovoParticipante) btnNovoParticipante.addEventListener("click", prepararNovoParticipanteAdmin);

  // Se existe loginCard, começa em login. Se não, já abre app direto.
  if ($("loginCard")) {
    show("loginCard");
    hide("app");
    // tenta manter sessão:
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) {
        hide("loginCard");
        show("app");
        await bootAfterLogin();
      }
    } catch (e) {
      // se auth falhar, só deixa login
      console.warn("Auth session check falhou:", e);
    }
  } else {
    show("app");
    await bootAfterLogin();
  }
}

async function bootAfterLogin() {
  setText("erroGlobal", "");
  await carregarTudo();
  mostrarAba("chamada");
}

/* =========================
   LOGIN / LOGOUT
========================= */
async function login() {
  const email = $("email")?.value?.trim() || "";
  const senha = $("senha")?.value?.trim() || "";
  setText("loginError", "");

  if (!email || !senha) {
    setText("loginError", "Preencha email e senha.");
    return;
  }

  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) {
      console.error("Erro login:", error);
      setText("loginError", "Erro no login: " + (error.message || "desconhecido"));
      return;
    }
    hide("loginCard");
    show("app");
    await bootAfterLogin();
  } catch (e) {
    console.error("Exceção login:", e);
    setText("loginError", "Erro inesperado ao tentar entrar.");
  }
}

async function logout() {
  try {
    await sb.auth.signOut();
  } catch (e) {
    console.warn("signOut falhou:", e);
  }
  if ($("loginCard")) {
    show("loginCard");
    hide("app");
  }
}

/* =========================
   ABAS
========================= */
function mostrarAba(qual) {
  const abaChamada = $("abaChamada");
  const abaAdmin = $("abaAdmin");

  if (qual === "admin") {
    if (abaChamada) abaChamada.style.display = "none";
    if (abaAdmin) abaAdmin.style.display = "block";
    $("tabChamada")?.classList.remove("active");
    $("tabAdmin")?.classList.add("active");
    listarParticipantesAdmin();
  } else {
    if (abaAdmin) abaAdmin.style.display = "none";
    if (abaChamada) abaChamada.style.display = "block";
    $("tabAdmin")?.classList.remove("active");
    $("tabChamada")?.classList.add("active");
  }
}

/* =========================
   DATA / FERIADOS
========================= */
function getSelectedDateISO() {
  // suporte a input date (yyyy-mm-dd) ou texto (dd/mm/yyyy)
  const raw = $("dataChamada")?.value?.trim() || "";
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // dd/mm/yyyy
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return null;
}

function getDayOfWeekBR(dateISO) {
  // força TZ BR pra não virar o dia
  const d = new Date(dateISO + "T12:00:00-03:00");
  return d.getDay(); // 0 dom ... 2 ter ...
}

async function verificarData() {
  setText("avisoData", "");
  const dateISO = getSelectedDateISO();
  if (!dateISO) {
    setText("avisoData", "Selecione uma data válida.");
    return false;
  }

  // Terça-feira
  const dow = getDayOfWeekBR(dateISO);
  if (dow !== 2) {
    setText("avisoData", "❌ Chamada só pode ser feita em TERÇA-FEIRA.");
    return false;
  }

  // Verificar feriado
  try {
    const { data, error } = await sb.from("feriados").select("data").eq("data", dateISO).limit(1);
    if (error) {
      console.error("Erro ao consultar feriados:", error);
      setText("avisoData", "⚠️ Erro ao consultar feriados (verifique RLS/políticas).");
      return false;
    }
    if (data && data.length > 0) {
      setText("avisoData", "❌ Hoje é feriado! Chamada não permitida.");
      return false;
    }
  } catch (e) {
    console.error("Exceção feriados:", e);
    setText("avisoData", "⚠️ Erro ao consultar feriados.");
    return false;
  }

  setText("avisoData", "✅ Data válida, pode registrar presença.");
  return true;
}

/* =========================
   CARREGAR DADOS
========================= */
async function carregarTudo() {
  setText("erroGlobal", "");
  setText("resultadoSalvar", "");
  await carregarRotacao();
  await carregarMediums();
  renderGruposChamada();
}

async function carregarMediums() {
  try {
    const { data, error } = await sb
      .from("mediums")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro carregar mediums:", error);
      setText("erroGlobal", "Erro ao conectar no Supabase. Verifique URL/KEY e RLS das tabelas.");
      mediumsCache = [];
      return;
    }

    mediumsCache = (data || []).filter((m) => m.active !== false);
  } catch (e) {
    console.error("Exceção carregar mediums:", e);
    setText("erroGlobal", "Erro ao conectar no Supabase. Verifique URL/KEY e RLS das tabelas.");
    mediumsCache = [];
  }
}

async function carregarRotacao() {
  // rotacao esperado: group_type (PK), last_medium_id (mesa)
  // adicional: usar row group_type='psicografia' para rotação de psicografia (dirigentes)
  try {
    const { data, error } = await sb.from("rotacao").select("*");
    if (error) {
      console.error("Erro carregar rotacao:", error);
      // Não derruba o app — só não destaca
      return;
    }

    // reset
    rotaMap.dirigente = null;
    rotaMap.incorporacao = null;
    rotaMap.desenvolvimento = null;
    rotaMap.carencia = null;
    rotaMap.psicografia = null;

    (data || []).forEach((r) => {
      if (r.group_type && rotaMap.hasOwnProperty(r.group_type)) {
        rotaMap[r.group_type] = r.last_medium_id || null;
      }
    });
  } catch (e) {
    console.error("Exceção rotacao:", e);
  }
}

/* =========================
   ROTACAO HELPERS
========================= */
function getNextIdByLastId(list, lastId) {
  if (!list || list.length === 0) return null;
  if (!lastId) return list[0].id;

  const idx = list.findIndex((m) => m.id === lastId);
  if (idx === -1 || idx === list.length - 1) return list[0].id;
  return list[idx + 1].id;
}

/* =========================
   RENDER
========================= */
function renderGruposChamada() {
  const dirigentes = mediumsCache.filter((m) => m.group_type === "dirigente");
  const incorporacao = mediumsCache.filter((m) => m.group_type === "incorporacao");
  const desenvolvimento = mediumsCache.filter((m) => m.group_type === "desenvolvimento");
  const carencia = mediumsCache.filter((m) => m.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes, "dirigente");
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

function calcPercentFalta(m) {
  const faltas = Number(m.faltas || 0);
  const pres = Number(m.presencas || 0);
  const mesa = Number(m.mesa || 0);
  const ps = Number(m.psicografia || 0);

  // total considerado = faltas + presencas + mesa (+ psicografia como presença, se você quiser considerar)
  const total = faltas + pres + mesa + ps;
  if (total <= 0) return 0;
  return Math.round((faltas * 100) / total);
}

function buildRadiosHTML(groupType, id) {
  // nome do grupo de radios: attendance_{id}
  const name = `att_${id}`;

  if (groupType === "carencia") {
    // Carência: só P / F
    return `
      <label class="radio"><input type="radio" name="${name}" value="P"> <span>P</span></label>
      <label class="radio"><input type="radio" name="${name}" value="F"> <span>F</span></label>
    `;
  }

  // demais: P / M / F
  let radios = `
    <label class="radio"><input type="radio" name="${name}" value="P"> <span>P</span></label>
    <label class="radio"><input type="radio" name="${name}" value="M"> <span>M</span></label>
    <label class="radio"><input type="radio" name="${name}" value="F"> <span>F</span></label>
  `;

  // dirigentes: PS
  if (groupType === "dirigente") {
    radios += `
      <label class="radio radio-ps"><input type="radio" name="${name}" value="PS"> <span>PS</span></label>
    `;
  }

  return radios;
}

function renderGrupo(divId, list, groupType) {
  const div = $(divId);
  if (!div) return;

  div.innerHTML = "";

  if (!list || list.length === 0) {
    div.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  // Próximo da vez (Mesa)
  const useMesaRotation = groupType !== "carencia";
  const nextMesaId = useMesaRotation ? getNextIdByLastId(list, rotaMap[groupType] || null) : null;

  // Próximo da vez (Psicografia) apenas dirigentes
  const usePsRotation = groupType === "dirigente";
  const nextPsId = usePsRotation ? getNextIdByLastId(list, rotaMap.psicografia || null) : null;

  list.forEach((m) => {
    const perc = calcPercentFalta(m);
    const faltaAlta = perc >= 30;

    const card = document.createElement("div");
    card.className = "medium-card";

    // borda amarela (mesa)
    if (useMesaRotation && m.id === nextMesaId) card.classList.add("next-mesa");

    // borda vermelha (psicografia - dirigente)
    if (usePsRotation && m.id === nextPsId) card.classList.add("next-ps");

    const badgePerc = `
      <span class="badge-perc ${faltaAlta ? "badge-alta" : ""}">${perc}% faltas</span>
    `;

    const tagMesa = useMesaRotation && m.id === nextMesaId ? `<span class="tag tag-mesa">PRÓXIMO (MESA)</span>` : "";
    const tagPs = usePsRotation && m.id === nextPsId ? `<span class="tag tag-ps">PRÓXIMO (PS)</span>` : "";

    card.innerHTML = `
      <div class="card-top">
        <div class="name-line">
          <span class="name">${escapeHtml(m.name || "")}</span>
          ${badgePerc}
        </div>
        <div class="tags">
          ${tagMesa}
          ${tagPs}
        </div>
      </div>

      <div class="radios">
        ${buildRadiosHTML(groupType, m.id)}
      </div>
    `;

    div.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   SALVAR CHAMADA
========================= */
function getStatusForMediumId(id) {
  const el = document.querySelector(`input[name="att_${id}"]:checked`);
  return el ? el.value : null;
}

async function salvarChamada() {
  setText("resultadoSalvar", "");

  const ok = await verificarData();
  if (!ok) {
    setText("resultadoSalvar", "Corrija a data antes de salvar.");
    return;
  }

  const dateISO = getSelectedDateISO();
  if (!dateISO) {
    setText("resultadoSalvar", "Data inválida.");
    return;
  }

  if (!mediumsCache || mediumsCache.length === 0) {
    setText("resultadoSalvar", "Nenhum médium carregado.");
    return;
  }

  const registros = [];
  const statsDelta = new Map(); // medium_id -> {pres, falta, mesa, ps}

  for (const m of mediumsCache) {
    const status = getStatusForMediumId(m.id);
    if (!status) continue;

    registros.push({
      medium_id: m.id,
      data: dateISO,
      status: status,
    });

    if (!statsDelta.has(m.id)) statsDelta.set(m.id, { pres: 0, falta: 0, mesa: 0, ps: 0 });

    const d = statsDelta.get(m.id);
    if (status === "F") d.falta += 1;
    else if (status === "M") d.mesa += 1;
    else if (status === "PS") d.ps += 1;
    else d.pres += 1; // P
  }

  if (registros.length === 0) {
    setText("resultadoSalvar", "Nenhuma presença marcada.");
    return;
  }

  disable("btnSalvar", true);

  try {
    // 1) Inserir chamadas
    const { error: insertError } = await sb.from("chamadas").insert(registros);
    if (insertError) {
      console.error("Erro salvar chamadas:", insertError);
      setText("resultadoSalvar", "❌ Erro ao salvar (verifique RLS/policies da tabela chamadas).");
      disable("btnSalvar", false);
      return;
    }

    // 2) Atualizar contadores em mediums (incrementando)
    for (const [mediumId, d] of statsDelta.entries()) {
      // buscar atual para somar
      const { data: cur, error: selErr } = await sb
        .from("mediums")
        .select("id, faltas, presencas, mesa, psicografia")
        .eq("id", mediumId)
        .single();

      if (selErr) {
        console.warn("Falha ao buscar medium para update:", selErr);
        continue;
      }

      const payload = {
        faltas: Number(cur.faltas || 0) + d.falta,
        presencas: Number(cur.presencas || 0) + d.pres,
        mesa: Number(cur.mesa || 0) + d.mesa,
        psicografia: Number(cur.psicografia || 0) + d.ps,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await sb.from("mediums").update(payload).eq("id", mediumId);
      if (upErr) console.warn("Falha update medium:", upErr);
    }

    // 3) Atualizar rotação (mesa e psicografia)
    await atualizarRotacao(registros);

    // 4) Recarregar e re-render
    await carregarTudo();

    setText("resultadoSalvar", "✅ Chamada registrada com sucesso!");
  } catch (e) {
    console.error("Exceção salvar:", e);
    setText("resultadoSalvar", "❌ Erro inesperado ao salvar.");
  } finally {
    disable("btnSalvar", false);
  }
}

async function atualizarRotacao(registros) {
  // regra:
  // - mesa: se status == M => esse médium vira last_medium_id do grupo dele (exceto carencia)
  // - psicografia: se status == PS => esse dirigente vira last_medium_id do group_type='psicografia'
  // Observação: carência não entra em rotação.

  // Precisamos mapear medium_id -> group_type
  const byId = new Map(mediumsCache.map((m) => [m.id, m.group_type]));

  const mesaByGroup = {
    dirigente: null,
    incorporacao: null,
    desenvolvimento: null,
  };
  let psDirigenteId = null;

  for (const r of registros) {
    const g = byId.get(r.medium_id);
    if (!g) continue;

    if (r.status === "M") {
      if (g !== "carencia" && mesaByGroup.hasOwnProperty(g)) {
        mesaByGroup[g] = r.medium_id;
      }
    }

    if (r.status === "PS") {
      // psicografia somente para dirigente
      if (g === "dirigente") psDirigenteId = r.medium_id;
    }
  }

  // upsert mesa por grupo
  for (const g of Object.keys(mesaByGroup)) {
    const mid = mesaByGroup[g];
    if (!mid) continue;

    const { error } = await sb
      .from("rotacao")
      .upsert({ group_type: g, last_medium_id: mid, updated_at: new Date().toISOString() }, { onConflict: "group_type" });

    if (error) console.warn("Falha upsert rotacao mesa:", g, error);
  }

  // upsert psicografia
  if (psDirigenteId) {
    const { error } = await sb
      .from("rotacao")
      .upsert(
        { group_type: "psicografia", last_medium_id: psDirigenteId, updated_at: new Date().toISOString() },
        { onConflict: "group_type" }
      );
    if (error) console.warn("Falha upsert rotacao psicografia:", error);
  }
}

/* =========================
   ADMIN - PARTICIPANTES (CRUD)
========================= */
let adminEditId = null;

async function listarParticipantesAdmin() {
  const box = $("listaParticipantesAdmin");
  if (!box) return;

  box.innerHTML = `<div class="empty">Carregando...</div>`;

  try {
    const { data, error } = await sb.from("mediums").select("*").order("name", { ascending: true });
    if (error) {
      console.error("Erro listar participantes:", error);
      box.innerHTML = `<div class="empty">Erro ao listar (verifique RLS).</div>`;
      return;
    }

    const rows = data || [];
    if (rows.length === 0) {
      box.innerHTML = `<div class="empty">Nenhum participante cadastrado.</div>`;
      return;
    }

    box.innerHTML = "";
    rows.forEach((m) => {
      const line = document.createElement("div");
      line.className = "admin-row";

      const ativo = m.active !== false;

      line.innerHTML = `
        <div class="admin-col name">
          <b>${escapeHtml(m.name || "")}</b>
          <span class="admin-mini">${escapeHtml(m.group_type || "")}</span>
        </div>
        <div class="admin-col actions">
          <button class="btn-mini" data-act="edit" data-id="${m.id}">Editar</button>
          <button class="btn-mini" data-act="toggle" data-id="${m.id}">${ativo ? "Desativar" : "Ativar"}</button>
          <button class="btn-mini danger" data-act="del" data-id="${m.id}">Excluir</button>
        </div>
      `;

      box.appendChild(line);
    });

    // bind
    box.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        if (!id) return;

        if (act === "edit") await carregarParticipanteParaEditar(id);
        if (act === "toggle") await toggleAtivoParticipante(id);
        if (act === "del") await excluirParticipante(id);
      });
    });
  } catch (e) {
    console.error("Exceção listar participantes:", e);
    box.innerHTML = `<div class="empty">Erro inesperado.</div>`;
  }
}

function prepararNovoParticipanteAdmin() {
  adminEditId = null;
  setText("adminTituloForm", "Novo participante");
  if ($("adminNome")) $("adminNome").value = "";
  if ($("adminGrupo")) $("adminGrupo").value = "desenvolvimento";
  if ($("adminAtivo")) $("adminAtivo").checked = true;
  setText("adminMsg", "");
}

async function carregarParticipanteParaEditar(id) {
  setText("adminMsg", "");

  const { data, error } = await sb.from("mediums").select("*").eq("id", id).single();
  if (error) {
    console.error("Erro carregar participante:", error);
    setText("adminMsg", "Erro ao carregar participante (RLS?).");
    return;
  }

  adminEditId = id;
  setText("adminTituloForm", "Editar participante");

  if ($("adminNome")) $("adminNome").value = data.name || "";
  if ($("adminGrupo")) $("adminGrupo").value = data.group_type || "desenvolvimento";
  if ($("adminAtivo")) $("adminAtivo").checked = data.active !== false;
}

async function salvarParticipanteAdmin() {
  setText("adminMsg", "");

  const nome = $("adminNome")?.value?.trim() || "";
  const grupo = $("adminGrupo")?.value?.trim() || "";
  const ativo = $("adminAtivo") ? $("adminAtivo").checked : true;

  if (!nome) {
    setText("adminMsg", "Informe o nome.");
    return;
  }
  if (!grupo || !GROUPS.includes(grupo)) {
    setText("adminMsg", "Grupo inválido.");
    return;
  }

  const payload = {
    name: nome,
    group_type: grupo,
    active: ativo,
    updated_at: new Date().toISOString(),
  };

  try {
    if (!adminEditId) {
      // criar
      payload.faltas = 0;
      payload.presencas = 0;
      payload.mesa = 0;
      payload.psicografia = 0;
      payload.carencia_total = 0;
      payload.carencia_atual = 0;
      payload.primeira_incorporacao = false;
      payload.inserted_at = new Date().toISOString();

      const { error } = await sb.from("mediums").insert(payload);
      if (error) {
        console.error("Erro inserir participante:", error);
        setText("adminMsg", "Erro ao inserir (verifique RLS).");
        return;
      }
      setText("adminMsg", "✅ Participante criado.");
    } else {
      // editar
      const { error } = await sb.from("mediums").update(payload).eq("id", adminEditId);
      if (error) {
        console.error("Erro atualizar participante:", error);
        setText("adminMsg", "Erro ao atualizar (verifique RLS).");
        return;
      }
      setText("adminMsg", "✅ Alterações salvas.");
    }

    await listarParticipantesAdmin();
    await carregarTudo(); // reflete na chamada
  } catch (e) {
    console.error("Exceção salvar participante:", e);
    setText("adminMsg", "Erro inesperado ao salvar.");
  }
}

async function toggleAtivoParticipante(id) {
  setText("adminMsg", "");

  const { data, error } = await sb.from("mediums").select("id, active").eq("id", id).single();
  if (error) {
    console.error("Erro toggle:", error);
    setText("adminMsg", "Erro ao alterar ativo (RLS?).");
    return;
  }

  const novo = !(data.active !== false);

  const { error: upErr } = await sb
    .from("mediums")
    .update({ active: novo, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    console.error("Erro update ativo:", upErr);
    setText("adminMsg", "Erro ao salvar (RLS?).");
    return;
  }

  await listarParticipantesAdmin();
  await carregarTudo();
}

async function excluirParticipante(id) {
  setText("adminMsg", "");

  // cuidado: se tiver FK em chamadas, delete pode falhar. Nesse caso, desative ao invés de excluir.
  const ok = confirm("Tem certeza que deseja excluir? Se houver chamadas registradas, pode falhar.");
  if (!ok) return;

  const { error } = await sb.from("mediums").delete().eq("id", id);
  if (error) {
    console.error("Erro delete participante:", error);
    setText("adminMsg", "Não foi possível excluir (provável FK). Sugestão: use Desativar.");
    return;
  }

  await listarParticipantesAdmin();
  await carregarTudo();
}

/* =========================
   START
========================= */
document.addEventListener("DOMContentLoaded", initApp);
