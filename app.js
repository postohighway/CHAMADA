/* =========================
   CONFIGURAÇÃO SUPABASE
========================= */
const SUPABASE_URL = "COLE_AQUI_SUA_URL";
const SUPABASE_ANON_KEY = "COLE_AQUI_SUA_ANON_KEY";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================
   STATE
========================= */
let mediumsCache = [];
let rotacaoMap = {}; // group_type -> last_medium_id
let session = null;

/* =========================
   HELPERS UI
========================= */
function $(id) { return document.getElementById(id); }

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt || "";
}

function show(id, on = true) {
  const el = $(id);
  if (!el) return;
  el.style.display = on ? "block" : "none";
}

function normalizeGroupType(v) {
  const s = (v || "").toString().trim().toLowerCase();
  if (s === "dirigente") return "dirigente";
  if (s === "incorporacao") return "incorporacao";
  if (s === "desenvolvimento") return "desenvolvimento";
  if (s === "carencia") return "carencia";
  // fallback
  return s;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isTuesday(dateISO) {
  const d = new Date(dateISO + "T03:00:00");
  return d.getDay() === 2; // 2 = terça
}

/* =========================
   AUTH
========================= */
async function initAuth() {
  // tenta pegar sessão atual
  const { data } = await sb.auth.getSession();
  session = data.session || null;

  sb.auth.onAuthStateChange((_event, _session) => {
    session = _session;
  });
}

async function login() {
  const email = $("email")?.value?.trim();
  const senha = $("senha")?.value?.trim();
  const box = $("loginError");
  if (box) box.textContent = "";

  if (!email || !senha) {
    if (box) box.textContent = "Preencha email e senha.";
    return;
  }

  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    if (box) box.textContent = "Erro no login: " + error.message;
    return;
  }

  show("loginCard", false);
  show("app", true);

  const dc = $("dataChamada");
  if (dc) dc.value = todayISO();

  await bootApp();
}

async function logout() {
  await sb.auth.signOut();
  show("app", false);
  show("loginCard", true);
}

/* =========================
   NAVEGAÇÃO ABAS
========================= */
async function mostrarAba(qual) {
  const abaChamada = $("abaChamada");
  const abaAdmin = $("abaAdmin");
  const tabChamada = $("tabChamada");
  const tabAdmin = $("tabAdmin");

  if (qual === "chamada") {
    if (abaChamada) abaChamada.style.display = "block";
    if (abaAdmin) abaAdmin.style.display = "none";
    tabChamada?.classList.add("active");
    tabAdmin?.classList.remove("active");
    await renderGruposChamada();
  } else {
    if (abaChamada) abaChamada.style.display = "none";
    if (abaAdmin) abaAdmin.style.display = "block";
    tabChamada?.classList.remove("active");
    tabAdmin?.classList.add("active");
    await listarParticipantesAdmin(); // <- aqui estava “Conectando…” pra sempre
  }
}

/* =========================
   SUPABASE LOADERS
========================= */
async function carregarRotacao() {
  rotacaoMap = {};
  const { data, error } = await sb.from("rotacao").select("*");
  if (error) throw error;

  (data || []).forEach(r => {
    rotacaoMap[r.group_type] = r.last_medium_id;
  });
}

async function carregarMediums() {
  // se a tabela chama "mediums", ok.
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  mediumsCache = data || [];
}

/* =========================
   VERIFICAR DATA (terça e não feriado)
========================= */
async function verificarData() {
  const dataISO = $("dataChamada")?.value;
  const aviso = $("avisoData");
  if (aviso) aviso.textContent = "";

  if (!dataISO) {
    if (aviso) aviso.textContent = "Selecione uma data.";
    return false;
  }

  if (!isTuesday(dataISO)) {
    if (aviso) aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA.";
    return false;
  }

  // feriados
  try {
    const { data, error } = await sb.from("feriados").select("*").eq("data", dataISO);
    if (error) throw error;
    if ((data || []).length > 0) {
      if (aviso) aviso.textContent = "❌ Hoje é feriado! Chamada não permitida.";
      return false;
    }
  } catch (e) {
    if (aviso) aviso.textContent = "⚠️ Erro ao consultar feriados (verifique RLS/políticas).";
    return false;
  }

  if (aviso) aviso.textContent = "✅ Data válida, pode registrar presença.";
  return true;
}

/* =========================
   ROTAÇÃO / PRÓXIMOS
========================= */
function getNextId(lista, lastId) {
  if (!lista || lista.length === 0) return null;
  if (!lastId) return lista[0].id;
  const idx = lista.findIndex(m => m.id === lastId);
  if (idx === -1 || idx === lista.length - 1) return lista[0].id;
  return lista[idx + 1].id;
}

function getRotacaoKey(groupType, kind) {
  // kind: "mesa" | "ps"
  if (groupType === "dirigente") {
    if (kind === "ps") return "dirigente_ps";
    return "dirigente_mesa";
  }
  return groupType;
}

/* =========================
   RENDER CHAMADA
========================= */
async function renderGruposChamada() {
  // filtra ativos
  const ativos = mediumsCache.filter(m => m.active !== false);

  const dirigentes = ativos.filter(m => normalizeGroupType(m.group_type) === "dirigente");
  const incorporacao = ativos.filter(m => normalizeGroupType(m.group_type) === "incorporacao");
  const desenvolvimento = ativos.filter(m => normalizeGroupType(m.group_type) === "desenvolvimento");
  const carencia = ativos.filter(m => normalizeGroupType(m.group_type) === "carencia");

  renderGrupo("listaDirigentes", dirigentes, "dirigente");
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

function calcPercFaltas(m) {
  const faltas = Number(m.faltas || 0);
  const pres = Number(m.presencas || 0);
  const total = faltas + pres;
  if (total <= 0) return 0;
  return Math.round((faltas * 100) / total);
}

function renderGrupo(divId, lista, groupType) {
  const div = $(divId);
  if (!div) return;

  div.innerHTML = "";
  if (!lista || lista.length === 0) {
    div.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  // regras: carência não entra na rotação (nem mesa)
  const useRotacaoMesa = groupType !== "carencia";
  const useRotacaoPS = groupType === "dirigente"; // só dirigentes têm PS

  const nextMesaId = useRotacaoMesa
    ? getNextId(lista, rotacaoMap[getRotacaoKey(groupType, "mesa")] || rotacaoMap[groupType] || null)
    : null;

  const nextPsId = useRotacaoPS
    ? getNextId(lista, rotacaoMap[getRotacaoKey(groupType, "ps")] || null)
    : null;

  lista.forEach(m => {
    const card = document.createElement("div");
    card.className = "medium-card";

    const perc = calcPercFaltas(m);
    const badgeAlta = perc >= 30 ? `<span class="badge-falta-alta">Falta alta</span>` : "";
    const percTxt = `<span class="perc-faltas">${perc}% faltas</span>`;

    const isNextMesa = useRotacaoMesa && m.id === nextMesaId;
    const isNextPs = useRotacaoPS && m.id === nextPsId;

    if (isNextMesa) card.classList.add("next-mesa");
    if (isNextPs) card.classList.add("next-ps");

    // radios
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
        <label><input type="radio" name="${m.id}" value="PS"> <span class="ps-label">PS</span></label>
      `;
    } else {
      radios = `
        <label><input type="radio" name="${m.id}" value="P"> P</label>
        <label><input type="radio" name="${m.id}" value="M"> M</label>
        <label><input type="radio" name="${m.id}" value="F"> F</label>
      `;
    }

    const tagMesa = isNextMesa ? `<span class="tag-next tag-mesa">PRÓXIMO (MESA)</span>` : "";
    const tagPs = isNextPs ? `<span class="tag-next tag-ps">PRÓXIMO (PS)</span>` : "";

    card.innerHTML = `
      <div class="medium-header">
        <div class="medium-name">
          ${m.name} ${percTxt} ${badgeAlta}
        </div>
        <div class="medium-tags">
          ${tagMesa}
          ${tagPs}
        </div>
      </div>
      <div class="medium-radios">
        ${radios}
      </div>
    `;

    div.appendChild(card);
  });
}

/* =========================
   SALVAR CHAMADA + ATUALIZA ESTATÍSTICAS + ATUALIZA ROTAÇÃO
========================= */
async function salvarChamada() {
  setText("resultadoSalvar", "");
  const dataISO = $("dataChamada")?.value;
  const ok = await verificarData();
  if (!ok) {
    setText("resultadoSalvar", "Corrija a data antes de salvar.");
    return;
  }

  const registros = [];
  for (const m of mediumsCache) {
    if (m.active === false) continue;
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    if (!sel) continue;
    registros.push({
      medium_id: m.id,
      data: dataISO,
      status: sel.value
    });
  }

  if (registros.length === 0) {
    setText("resultadoSalvar", "Nenhuma presença marcada.");
    return;
  }

  // 1) insere chamadas
  const ins = await sb.from("chamadas").insert(registros);
  if (ins.error) {
    console.error(ins.error);
    setText("resultadoSalvar", "❌ Erro ao salvar: " + ins.error.message);
    return;
  }

  // 2) atualiza contadores no mediums (faltas/presencas/mesa/psicografia)
  const deltas = {}; // id -> { pres, falt, mesa, ps }
  registros.forEach(r => {
    if (!deltas[r.medium_id]) deltas[r.medium_id] = { pres: 0, falt: 0, mesa: 0, ps: 0 };
    if (r.status === "F") deltas[r.medium_id].falt += 1;
    else deltas[r.medium_id].pres += 1;

    if (r.status === "M") deltas[r.medium_id].mesa += 1;
    if (r.status === "PS") deltas[r.medium_id].ps += 1;
  });

  for (const id of Object.keys(deltas)) {
    const m = mediumsCache.find(x => x.id === id);
    if (!m) continue;

    const up = {
      presencas: Number(m.presencas || 0) + deltas[id].pres,
      faltas: Number(m.faltas || 0) + deltas[id].falt,
      mesa: Number(m.mesa || 0) + deltas[id].mesa,
      psicografia: Number(m.psicografia || 0) + deltas[id].ps
    };

    const r = await sb.from("mediums").update(up).eq("id", id);
    if (r.error) {
      console.error("update mediums error", r.error);
      setText("resultadoSalvar", "⚠️ Salvou a chamada, mas falhou ao atualizar estatísticas: " + r.error.message);
      // continua mesmo assim
    }
  }

  // 3) atualiza rotação:
  // - Para grupos com M: grava last_medium_id (mesa)
  // - Para dirigente com PS: grava last_medium_id (ps)
  // - Carência: não atualiza rotação por mesa
  const byId = new Map(mediumsCache.map(m => [m.id, m]));

  // mesa:
  const mesaRegs = registros.filter(r => r.status === "M");
  for (const r of mesaRegs) {
    const m = byId.get(r.medium_id);
    if (!m) continue;
    const gt = normalizeGroupType(m.group_type);
    if (gt === "carencia") continue;

    const key = getRotacaoKey(gt, "mesa");
    const u = await sb.from("rotacao").update({ last_medium_id: r.medium_id, updated_at: new Date().toISOString() }).eq("group_type", key);
    if (u.error) console.error("update rotacao mesa error", u.error);
  }

  // psicografia:
  const psRegs = registros.filter(r => r.status === "PS");
  for (const r of psRegs) {
    const m = byId.get(r.medium_id);
    if (!m) continue;
    const gt = normalizeGroupType(m.group_type);
    if (gt !== "dirigente") continue;

    const key = getRotacaoKey(gt, "ps");
    const u = await sb.from("rotacao").update({ last_medium_id: r.medium_id, updated_at: new Date().toISOString() }).eq("group_type", key);
    if (u.error) console.error("update rotacao ps error", u.error);
  }

  // 4) recarrega tudo
  await carregarMediums();
  await carregarRotacao();
  await renderGruposChamada();

  setText("resultadoSalvar", "✅ Chamada registrada com sucesso!");
}

/* =========================
   ADMIN / PARTICIPANTES
========================= */
async function listarParticipantesAdmin() {
  // UI
  setText("adminStatus", "Conectando...");
  const listDiv = $("adminLista");
  if (listDiv) listDiv.innerHTML = "";

  try {
    await carregarMediums(); // garante dados atualizados
    setText("adminStatus", "");

    const q = ($("adminBusca")?.value || "").trim().toLowerCase();

    const lista = mediumsCache
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"))
      .filter(m => !q || (m.name || "").toLowerCase().includes(q));

    if (!listDiv) return;

    listDiv.innerHTML = "";
    if (lista.length === 0) {
      listDiv.innerHTML = `<div class="empty">Nenhum participante encontrado.</div>`;
      return;
    }

    lista.forEach(m => {
      const item = document.createElement("div");
      item.className = "admin-item";

      const gt = normalizeGroupType(m.group_type);
      const ativo = m.active !== false;

      item.innerHTML = `
        <div class="admin-item-row">
          <div class="admin-item-name">
            <strong>${m.name}</strong>
            <span class="admin-pill">${gt}</span>
            <span class="admin-pill ${ativo ? "on" : "off"}">${ativo ? "ATIVO" : "INATIVO"}</span>
          </div>
          <div class="admin-item-actions">
            <button class="btn-mini" data-act="edit">Editar</button>
            <button class="btn-mini" data-act="toggle">${ativo ? "Desativar" : "Ativar"}</button>
            <button class="btn-mini danger" data-act="delete">Excluir</button>
          </div>
        </div>
      `;

      item.querySelector('[data-act="edit"]').addEventListener("click", async () => {
        const novoNome = prompt("Nome:", m.name || "");
        if (novoNome === null) return;

        const novoGrupo = prompt("Grupo (dirigente/incorporacao/desenvolvimento/carencia):", gt);
        if (novoGrupo === null) return;

        const upd = await sb.from("mediums").update({
          name: novoNome.trim(),
          group_type: normalizeGroupType(novoGrupo),
          updated_at: new Date().toISOString()
        }).eq("id", m.id);

        if (upd.error) {
          alert("Erro ao editar: " + upd.error.message);
          return;
        }
        await listarParticipantesAdmin();
        await carregarRotacao();
        await renderGruposChamada();
      });

      item.querySelector('[data-act="toggle"]').addEventListener("click", async () => {
        const upd = await sb.from("mediums").update({
          active: !ativo,
          updated_at: new Date().toISOString()
        }).eq("id", m.id);

        if (upd.error) {
          alert("Erro ao ativar/desativar: " + upd.error.message);
          return;
        }
        await listarParticipantesAdmin();
        await renderGruposChamada();
      });

      item.querySelector('[data-act="delete"]').addEventListener("click", async () => {
        if (!confirm(`Excluir "${m.name}"?`)) return;

        const del = await sb.from("mediums").delete().eq("id", m.id);
        if (del.error) {
          alert("Erro ao excluir: " + del.error.message);
          return;
        }
        await listarParticipantesAdmin();
        await carregarRotacao();
        await renderGruposChamada();
      });

      listDiv.appendChild(item);
    });
  } catch (e) {
    console.error(e);
    setText("adminStatus", "❌ Erro ao carregar participantes: " + (e?.message || e));
  }
}

async function adicionarParticipante() {
  const nome = ($("novoNome")?.value || "").trim();
  const grupo = normalizeGroupType($("novoGrupo")?.value || "dirigente");

  if (!nome) {
    alert("Informe o nome.");
    return;
  }

  const ins = await sb.from("mediums").insert([{
    name: nome,
    group_type: grupo,
    faltas: 0,
    presencas: 0,
    mesa: 0,
    psicografia: 0,
    carencia_total: 0,
    carencia_atual: 0,
    primeira_incorporacao: false,
    active: true
  }]);

  if (ins.error) {
    alert("Erro ao adicionar: " + ins.error.message);
    return;
  }

  $("novoNome").value = "";
  await listarParticipantesAdmin();
  await renderGruposChamada();
}

/* =========================
   BOOT
========================= */
async function bootApp() {
  try {
    await carregarMediums();
    await carregarRotacao();
    await renderGruposChamada();
  } catch (e) {
    console.error(e);
    setText("resultadoSalvar", "❌ Erro ao carregar: " + (e?.message || e));
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await initAuth();

  // se já tem sessão, entra direto
  if (session) {
    show("loginCard", false);
    show("app", true);
    const dc = $("dataChamada");
    if (dc && !dc.value) dc.value = todayISO();
    await bootApp();
  } else {
    show("app", false);
    show("loginCard", true);
  }

  // binds (se existirem no seu index.html)
  $("btnLogin")?.addEventListener("click", login);
  $("btnLogout")?.addEventListener("click", logout);

  $("btnVerificar")?.addEventListener("click", verificarData);
  $("btnSalvar")?.addEventListener("click", salvarChamada);

  $("tabChamada")?.addEventListener("click", () => mostrarAba("chamada"));
  $("tabAdmin")?.addEventListener("click", () => mostrarAba("admin"));

  $("btnAddParticipante")?.addEventListener("click", adicionarParticipante);
  $("adminBusca")?.addEventListener("input", listarParticipantesAdmin);
});
