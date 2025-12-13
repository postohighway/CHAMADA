/* =========================
   CHAMADA DE MÉDIUNS — app.js (VERSÃO ESTÁVEL)
   - nunca trava em "Conectando..."
   - erros aparecem na tela e no console
   ========================= */

// ====== CONFIG SUPABASE (PREENCHA) ======
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "SUA_ANON_KEY_AQUI";

// ====== TIMEOUT PADRÃO (ms) ======
const REQUEST_TIMEOUT = 12000;

// ====== HELPERS DOM ======
const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

function setText(id, txt) {
  const n = el(id);
  if (n) n.textContent = txt ?? "";
}

function show(id, yes) {
  const n = el(id);
  if (n) n.style.display = yes ? "block" : "none";
}

function setBanner(msg, type = "info") {
  // opcional: se você tiver um banner/alerta
  const box = el("bannerMsg");
  if (!box) return;
  box.textContent = msg || "";
  box.className = `banner ${type}`; // se não existir CSS, ok
  box.style.display = msg ? "block" : "none";
}

function setConnecting(msg) {
  const n = el("adminStatus"); // texto "Conectando..." na aba participantes
  if (n) n.textContent = msg || "";
}

function safeLower(s) {
  return (s || "").toString().toLowerCase();
}

// ====== TIMEOUT WRAPPER ======
async function withTimeout(promise, ms, label = "request") {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout em ${label} (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

// ====== SUPABASE INIT ======
let sb = null;
function initSupabase() {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase JS não carregou. Confirme o <script src='@supabase/supabase-js@2'> antes do app.js.");
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes("SEU-PROJETO")) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY no app.js.");
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

// ====== ESTADO ======
let mediunsCache = []; // lista completa vinda do banco
let rotaMap = {};      // { dirigente: last_medium_id, ... }
let sessionCache = null;

// ====== GRUPOS ======
const GRUPOS = [
  { key: "dirigente", label: "Dirigentes" },
  { key: "incorporacao", label: "Médiuns de Incorporação" },
  { key: "desenvolvimento", label: "Médiuns em Desenvolvimento" },
  { key: "carencia", label: "Médiuns em Carência" },
];

// ====== LOGIN (se você usa) ======
async function carregarSessao() {
  const { data, error } = await withTimeout(sb.auth.getSession(), REQUEST_TIMEOUT, "getSession");
  if (error) throw error;
  sessionCache = data?.session || null;
  return sessionCache;
}

// ====== UI: TROCA DE ABA ======
function mostrarAba(qual) {
  const abaChamada = el("abaChamada");
  const abaAdmin = el("abaAdmin");
  const tabChamada = el("tabChamada");
  const tabAdmin = el("tabAdmin");

  if (qual === "chamada") {
    if (abaChamada) abaChamada.style.display = "block";
    if (abaAdmin) abaAdmin.style.display = "none";
    if (tabChamada) tabChamada.classList.add("active");
    if (tabAdmin) tabAdmin.classList.remove("active");
  } else {
    if (abaChamada) abaChamada.style.display = "none";
    if (abaAdmin) abaAdmin.style.display = "block";
    if (tabChamada) tabChamada.classList.remove("active");
    if (tabAdmin) tabAdmin.classList.add("active");
    // sempre recarrega participantes ao entrar
    listarParticipantesAdmin().catch((e) => {
      console.error("Erro listarParticipantesAdmin:", e);
      setConnecting("Erro ao carregar participantes. Veja Console (F12).");
    });
  }
}

// ====== DATA: TERÇA + FERIADOS (não trava se falhar) ======
async function isFeriado(dataISO) {
  // Se a tabela/rls falhar, a gente NÃO trava o app — só avisa e deixa passar.
  try {
    const q = sb.from("feriados").select("*").eq("data", dataISO).limit(1);
    const { data, error } = await withTimeout(q, REQUEST_TIMEOUT, "select feriados");
    if (error) throw error;
    return (data || []).length > 0;
  } catch (e) {
    console.warn("Aviso: falha ao consultar feriados (seguindo sem bloquear):", e?.message || e);
    setBanner("Aviso: falha ao consultar feriados (RLS/políticas). Seguindo sem bloquear.", "warn");
    return false;
  }
}

async function verificarData() {
  const data = el("dataChamada")?.value;
  const aviso = el("avisoData");
  if (aviso) aviso.textContent = "";

  if (!data) {
    if (aviso) aviso.textContent = "Selecione uma data.";
    return false;
  }

  // 0 dom, 1 seg, 2 ter...
  const dia = new Date(data + "T03:00:00").getDay();
  if (dia !== 2) {
    if (aviso) aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA.";
    return false;
  }

  const fer = await isFeriado(data);
  if (fer) {
    if (aviso) aviso.textContent = "❌ Hoje é feriado. Chamada não permitida.";
    return false;
  }

  if (aviso) aviso.textContent = "✅ Data válida, pode registrar presença.";
  return true;
}

// ====== BANCO: CARREGAR MÉDIUNS + ROTAÇÃO ======
async function carregarMediuns() {
  // Sempre finaliza com mensagem; nunca trava no "conectando".
  try {
    setBanner("", "info");

    const q = sb.from("mediums").select("*").order("name", { ascending: true });
    const { data, error } = await withTimeout(q, REQUEST_TIMEOUT, "select mediums");
    if (error) throw error;

    mediunsCache = (data || []).map((m) => ({
      ...m,
      active: m.active !== false,
      faltas: m.faltas || 0,
      presencas: m.presencas || 0,
    }));

    await carregarRotacao();
    renderGruposChamada();
    return true;
  } catch (e) {
    console.error("Erro carregarMediuns:", e);

    // Mostra erro em tela
    setBanner("Erro ao conectar/carregar no Supabase. Verifique URL/KEY e RLS/políticas das tabelas.", "error");

    // Se existir algum placeholder de erro
    setText("erroCarregar", "Erro ao carregar ✗");

    // Limpa listas para não ficar nada estranho
    limparListasChamadaComMensagem("Falha ao carregar. Veja Console (F12).");
    return false;
  }
}

async function carregarRotacao() {
  try {
    rotaMap = {};
    const q = sb.from("rotacao").select("*");
    const { data, error } = await withTimeout(q, REQUEST_TIMEOUT, "select rotacao");
    if (error) throw error;
    (data || []).forEach((r) => {
      rotaMap[r.group_type] = r.last_medium_id;
    });
  } catch (e) {
    console.warn("Falha ao carregar rotação (seguindo com rotação vazia):", e);
    rotaMap = {};
  }
}

// ====== RENDER: CHAMADA ======
function limparListasChamadaComMensagem(msg) {
  const ids = ["listaDirigentes", "listaIncorporacao", "listaDesenvolvimento", "listaCarencia"];
  ids.forEach((id) => {
    const d = el(id);
    if (d) d.innerHTML = `<div class="empty">${msg}</div>`;
  });
}

function getNextMediumId(lista, lastId) {
  if (!lista || lista.length === 0) return null;
  if (!lastId) return lista[0].id;
  const idx = lista.findIndex((m) => m.id === lastId);
  if (idx === -1 || idx === lista.length - 1) return lista[0].id;
  return lista[idx + 1].id;
}

function calcPercFaltas(m) {
  const faltas = m.faltas || 0;
  const pres = m.presencas || 0;
  const total = faltas + pres;
  if (total <= 0) return 0;
  return Math.round((faltas * 100) / total);
}

function renderGruposChamada() {
  const ativos = mediunsCache.filter((m) => m.active);

  const dirigentes = ativos.filter((x) => x.group_type === "dirigente");
  const incorporacao = ativos.filter((x) => x.group_type === "incorporacao");
  const desenvolvimento = ativos.filter((x) => x.group_type === "desenvolvimento");
  const carencia = ativos.filter((x) => x.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes, "dirigente");
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

function renderGrupo(divId, lista, groupType) {
  const div = el(divId);
  if (!div) return;

  if (!lista || lista.length === 0) {
    div.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  div.innerHTML = "";

  // Carência NÃO participa da rotação/mesa
  const usaRotacao = groupType !== "carencia";
  const nextId = usaRotacao ? getNextMediumId(lista, rotaMap[groupType] || null) : null;

  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card";

    // destaque de próximo (mesa) — amarelo
    const isNextMesa = usaRotacao && m.id === nextId;
    if (isNextMesa) card.classList.add("medium-next"); // amarelo via CSS

    // destaque de próximo (psicografia) — vermelho SOMENTE para dirigente marcado com PS
    // aqui nós só sinalizamos se for o "próximo dirigente" e ele estiver com PS no dia (a marcação é no radio do dia)
    // o contorno vermelho real vai aparecer quando você escolher PS naquele dirigente.
    // (o “próximo PS” de verdade é derivado do último PS salvo na rotação — isso fica no salvarChamada)
    // Para UI: colocamos um badge fixo “PRÓXIMO (MESA)” para o amarelo.
    const perc = calcPercFaltas(m);
    const percHtml = `<span class="perc ${perc >= 30 ? "perc-alta" : ""}">${perc}% faltas</span>`;

    // radios
    let radios = "";
    if (groupType === "carencia") {
      // Carência só P/F
      radios = `
        <label><input type="radio" name="st_${m.id}" value="P"> <span>P</span></label>
        <label><input type="radio" name="st_${m.id}" value="F"> <span>F</span></label>
      `;
    } else if (groupType === "dirigente") {
      // Dirigentes: P/M/F/PS
      radios = `
        <label><input type="radio" name="st_${m.id}" value="P"> <span>P</span></label>
        <label><input type="radio" name="st_${m.id}" value="M"> <span>M</span></label>
        <label><input type="radio" name="st_${m.id}" value="F"> <span>F</span></label>
        <label><input type="radio" name="st_${m.id}" value="PS"> <span class="ps">PS</span></label>
      `;
    } else {
      // outros: P/M/F
      radios = `
        <label><input type="radio" name="st_${m.id}" value="P"> <span>P</span></label>
        <label><input type="radio" name="st_${m.id}" value="M"> <span>M</span></label>
        <label><input type="radio" name="st_${m.id}" value="F"> <span>F</span></label>
      `;
    }

    const badgeMesa = isNextMesa && usaRotacao ? `<span class="badge badge-mesa">PRÓXIMO (MESA)</span>` : "";
    card.innerHTML = `
      <div class="card-top">
        <div class="name">${m.name} ${percHtml}</div>
        <div class="badges">${badgeMesa}</div>
      </div>
      <div class="radios">${radios}</div>
    `;

    // Quando selecionar PS em dirigente: contorno vermelho (próximo psicografia do dia)
    if (groupType === "dirigente") {
      card.addEventListener("change", (ev) => {
        const v = card.querySelector(`input[name="st_${m.id}"]:checked`)?.value;
        // remove vermelho em todos
        document.querySelectorAll("#listaDirigentes .medium-card").forEach((c) => c.classList.remove("medium-ps-next"));
        if (v === "PS") {
          card.classList.add("medium-ps-next"); // vermelho via CSS
        }
      });
    }

    div.appendChild(card);
  });
}

// ====== SALVAR CHAMADA ======
async function salvarChamada() {
  const data = el("dataChamada")?.value;
  const ok = await verificarData();
  if (!ok) return;

  try {
    setBanner("", "info");

    const registros = [];
    const dirigentes = mediunsCache.filter((m) => m.active && m.group_type === "dirigente");
    const ativos = mediunsCache.filter((m) => m.active);

    for (const m of ativos) {
      const v = document.querySelector(`input[name="st_${m.id}"]:checked`)?.value;
      if (!v) continue;
      registros.push({ medium_id: m.id, data, status: v });
    }

    if (registros.length === 0) {
      setBanner("Nenhuma presença marcada.", "warn");
      return;
    }

    // 1) insere chamadas
    const ins = sb.from("chamadas").insert(registros);
    const { error: eIns } = await withTimeout(ins, REQUEST_TIMEOUT, "insert chamadas");
    if (eIns) throw eIns;

    // 2) atualiza contadores em mediums (faltas/presencas) e ativa flags se você usa
    await atualizarEstatisticas(registros);

    // 3) atualiza rotação:
    // - Mesa: qualquer M conta para mesa (exceto carência)
    // - Psicografia: dirigente com PS também deve virar "chamado na próxima" (contorno vermelho na próxima)
    await atualizarRotacao(registros);

    // 4) recarrega tudo
    await carregarMediuns();

    setBanner("✅ Chamada registrada com sucesso!", "ok");
  } catch (e) {
    console.error("Erro salvarChamada:", e);
    setBanner("❌ Erro ao salvar chamada. Veja Console (F12).", "error");
  }
}

async function atualizarEstatisticas(registros) {
  // agrupa por medium_id: pres++ se P ou M ou PS, falta++ se F
  const deltas = {};
  registros.forEach((r) => {
    if (!deltas[r.medium_id]) deltas[r.medium_id] = { pres: 0, falt: 0 };
    const st = r.status;
    if (st === "F") deltas[r.medium_id].falt += 1;
    else deltas[r.medium_id].pres += 1; // P, M, PS contam presença
  });

  for (const [mid, d] of Object.entries(deltas)) {
    // pega valores atuais do cache (mais rápido) e atualiza
    const atual = mediunsCache.find((m) => m.id === mid);
    const faltas = (atual?.faltas || 0) + d.falt;
    const presencas = (atual?.presencas || 0) + d.pres;

    const up = sb.from("mediums").update({ faltas, presencas }).eq("id", mid);
    const { error } = await withTimeout(up, REQUEST_TIMEOUT, "update mediums");
    if (error) throw error;
  }
}

async function atualizarRotacao(registros) {
  // Último "mesa" por grupo (exceto carência):
  // - dirigente: status M define "mesa"
  // - incorporacao/desenvolvimento: status M define "mesa"
  // - carencia: não atualiza
  //
  // Psicografia:
  // - dirigente com status PS atualiza rotação do grupo 'dirigente' também, mas como "psicografia"
  //   (pra UI, a próxima psicografia fica no grupo dirigente, separado do amarelo)
  //
  // Como seu schema de rotacao só tem last_medium_id por group_type,
  // vamos guardar:
  // - 'dirigente' = último M (mesa) OU (se quiser) último chamado geral
  // E vamos adicionar um registro extra:
  // - 'dirigente_ps' = último PS
  //
  // Se você ainda não tem 'dirigente_ps' na tabela rotacao, criamos via upsert.

  // garante que existe linha 'dirigente_ps'
  try {
    await withTimeout(
      sb.from("rotacao").upsert([{ group_type: "dirigente_ps", last_medium_id: null }], { onConflict: "group_type" }),
      REQUEST_TIMEOUT,
      "upsert rotacao dirigente_ps"
    );
  } catch (e) {
    // se falhar, não trava; mas ideal ter policy UPDATE/SELECT ok
    console.warn("Não consegui garantir rotacao dirigente_ps:", e?.message || e);
  }

  const byMedium = {};
  registros.forEach((r) => (byMedium[r.medium_id] = r.status));

  // helper por grupo
  function ultimoPorGrupo(grupo, statusAlvo) {
    const lista = mediunsCache
      .filter((m) => m.active && m.group_type === grupo)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    // pega o último na ordem alfabética que marcou statusAlvo (último "executado" na chamada)
    // como não temos “ordem de marcação”, usamos o primeiro encontrado em ordem alfabética como referência de rotação:
    // -> melhor: se você quiser, eu adapto depois para salvar “ordem de clique”.
    const marcados = lista.filter((m) => byMedium[m.id] === statusAlvo);
    if (marcados.length === 0) return null;
    // escolhe o último marcado na lista ordenada
    return marcados[marcados.length - 1].id;
  }

  // atualiza MESA (M) por grupo exceto carência
  const updates = [];

  ["dirigente", "incorporacao", "desenvolvimento"].forEach((g) => {
    const ultMesa = ultimoPorGrupo(g, "M");
    if (ultMesa) updates.push({ group_type: g, last_medium_id: ultMesa });
  });

  // atualiza PS (dirigente_ps)
  const ultPS = ultimoPorGrupo("dirigente", "PS");
  if (ultPS) updates.push({ group_type: "dirigente_ps", last_medium_id: ultPS });

  if (updates.length === 0) return;

  const up = sb.from("rotacao").upsert(updates, { onConflict: "group_type" });
  const { error } = await withTimeout(up, REQUEST_TIMEOUT, "upsert rotacao");
  if (error) throw error;
}

// ====== ABA PARTICIPANTES (ADMIN) ======
async function listarParticipantesAdmin() {
  try {
    setConnecting("Conectando...");
    const q = sb.from("mediums").select("*").order("name", { ascending: true });
    const { data, error } = await withTimeout(q, REQUEST_TIMEOUT, "select mediums (admin)");
    if (error) throw error;

    const lista = el("listaAdmin");
    if (!lista) {
      setConnecting("Erro: elemento #listaAdmin não existe no HTML.");
      return;
    }

    lista.innerHTML = "";
    (data || []).forEach((m) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      row.innerHTML = `
        <div class="admin-name">
          <strong>${m.name}</strong>
          <span class="admin-meta">(${m.group_type}) ${m.active === false ? "— INATIVO" : ""}</span>
        </div>
        <div class="admin-actions">
          <button class="btn-sm" data-act="toggle">${m.active === false ? "Ativar" : "Desativar"}</button>
          <button class="btn-sm" data-act="edit">Editar</button>
          <button class="btn-sm danger" data-act="del">Excluir</button>
        </div>
      `;

      row.querySelectorAll("button").forEach((b) => {
        b.addEventListener("click", async () => {
          const act = b.dataset.act;
          if (act === "toggle") {
            await toggleAtivo(m.id, m.active !== false);
          } else if (act === "edit") {
            await editarParticipante(m);
          } else if (act === "del") {
            await excluirParticipante(m.id, m.name);
          }
        });
      });

      lista.appendChild(row);
    });

    setConnecting("");
  } catch (e) {
    console.error("Erro listarParticipantesAdmin:", e);
    setConnecting(`Erro ao carregar participantes: ${e?.message || e}`);
  }
}

async function toggleAtivo(id, estavaAtivo) {
  try {
    const up = sb.from("mediums").update({ active: !estavaAtivo }).eq("id", id);
    const { error } = await withTimeout(up, REQUEST_TIMEOUT, "update active");
    if (error) throw error;
    await listarParticipantesAdmin();
    await carregarMediuns(); // reflete na chamada também
  } catch (e) {
    console.error("Erro toggleAtivo:", e);
    alert("Erro ao ativar/desativar. Veja Console (F12).");
  }
}

async function editarParticipante(m) {
  const novoNome = prompt("Novo nome:", m.name);
  if (!novoNome) return;

  const novoGrupo = prompt("Novo grupo (dirigente/incorporacao/desenvolvimento/carencia):", m.group_type);
  if (!novoGrupo) return;

  try {
    const up = sb.from("mediums").update({ name: novoNome.trim(), group_type: novoGrupo.trim() }).eq("id", m.id);
    const { error } = await withTimeout(up, REQUEST_TIMEOUT, "update mediums edit");
    if (error) throw error;
    await listarParticipantesAdmin();
    await carregarMediuns();
  } catch (e) {
    console.error("Erro editarParticipante:", e);
    alert("Erro ao editar. Veja Console (F12).");
  }
}

async function excluirParticipante(id, nome) {
  if (!confirm(`Excluir "${nome}"?`)) return;
  try {
    const del = sb.from("mediums").delete().eq("id", id);
    const { error } = await withTimeout(del, REQUEST_TIMEOUT, "delete mediums");
    if (error) throw error;
    await listarParticipantesAdmin();
    await carregarMediuns();
  } catch (e) {
    console.error("Erro excluirParticipante:", e);
    alert("Erro ao excluir. Veja Console (F12).");
  }
}

async function adicionarParticipante() {
  const nome = el("novoNome")?.value?.trim();
  const grupo = el("novoGrupo")?.value?.trim();
  if (!nome || !grupo) {
    alert("Preencha Nome e Grupo.");
    return;
  }
  try {
    const ins = sb.from("mediums").insert([{ name: nome, group_type: grupo, active: true, faltas: 0, presencas: 0 }]);
    const { error } = await withTimeout(ins, REQUEST_TIMEOUT, "insert mediums");
    if (error) throw error;

    el("novoNome").value = "";
    await listarParticipantesAdmin();
    await carregarMediuns();
  } catch (e) {
    console.error("Erro adicionarParticipante:", e);
    alert("Erro ao adicionar. Veja Console (F12).");
  }
}

// ====== BUSCA ADMIN ======
function filtrarAdmin() {
  const q = safeLower(el("buscaAdmin")?.value || "");
  const lista = el("listaAdmin");
  if (!lista) return;
  [...lista.children].forEach((row) => {
    const t = safeLower(row.textContent);
    row.style.display = t.includes(q) ? "flex" : "none";
  });
}

// ====== BOOT ======
document.addEventListener("DOMContentLoaded", async () => {
  try {
    initSupabase();

    // binds botões/abas
    el("tabChamada")?.addEventListener("click", () => mostrarAba("chamada"));
    el("tabAdmin")?.addEventListener("click", () => mostrarAba("admin"));

    el("btnVerificarData")?.addEventListener("click", verificarData);
    el("btnSalvarChamada")?.addEventListener("click", salvarChamada);

    el("btnAdicionar")?.addEventListener("click", adicionarParticipante);
    el("buscaAdmin")?.addEventListener("input", filtrarAdmin);

    // default data hoje (ISO)
    const hoje = new Date().toISOString().slice(0, 10);
    if (el("dataChamada")) el("dataChamada").value = hoje;

    // tenta carregar sessão (se tiver login)
    try {
      await carregarSessao();
    } catch (e) {
      console.warn("Sessão não carregada (seguindo assim mesmo):", e?.message || e);
    }

    // carrega dados iniciais
    await carregarMediuns();

    // abre a aba chamada por padrão
    mostrarAba("chamada");
  } catch (e) {
    console.error("Falha no boot:", e);
    setBanner(e?.message || String(e), "error");
    limparListasChamadaComMensagem("Erro crítico no app.js. Veja Console (F12).");
    setConnecting("Erro crítico no app.js. Veja Console (F12).");
  }
});
