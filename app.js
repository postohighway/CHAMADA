/* app.js — CHAMADA (manual de próximos; sem rotação automática)
   Regras:
   - Salvar chamada NÃO mexe em rotacao
   - Próximos são definidos manualmente por botões (upsert em rotacao)
*/

const SUPABASE_URL = window.__SUPABASE_URL__;
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ====== Estado ====== */
let state = {
  tab: "chamada",
  date: new Date().toISOString().slice(0, 10),

  mediums: [],            // tabela mediums
  mediumsById: new Map(),

  chamados: [],           // registros da chamada do dia
  chamadosByKey: new Map(), // key: `${date}:${medium_id}` => row

  rotacao: [],            // tabela rotacao (agora = "proximos" manuais)
  rotacaoByGroup: new Map(), // group_type => last_medium_id

  filtros: {
    incluirCarencia: true,
    incluirDirigente: true,
    incluirIncorporacao: true,
    incluirDesenvolvimento: true,
  },

  msgs: { ok: "", err: "" }
};

/* ====== Helpers ====== */
function setMsg(ok = "", err = "") {
  state.msgs.ok = ok;
  state.msgs.err = err;
  $("#msgOk").textContent = ok || "";
  $("#msgErr").textContent = err || "";
}

function groupOrder(g) {
  // ordem visual
  const map = {
    carencia: 1,
    desenvolvimento: 2,
    dirigente: 3,
    incorporacao: 4
  };
  return map[g] ?? 99;
}

function humanGroup(g) {
  const map = {
    carencia: "Carência",
    desenvolvimento: "Desenvolvimento",
    dirigente: "Dirigente",
    incorporacao: "Incorporação",
  };
  return map[g] || g;
}

function rotacaoKeyToHuman(gt) {
  const map = {
    mesa_desenvolvimento: "Mesa (Desenvolvimento)",
    mesa_dirigente: "Mesa (Dirigente)",
    mesa_incorporacao: "Mesa (Incorporação)",
    psicografia: "Psicografia",
  };
  return map[gt] || gt;
}

function safeNameById(id) {
  const m = state.mediumsById.get(id);
  return m ? m.name : "(não definido)";
}

/* ====== UI: Tabs ====== */
function setTab(tab) {
  state.tab = tab;
  $$(".tabBtn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tabPage").forEach(p => p.classList.toggle("active", p.id === `page_${tab}`));
}

/* ====== Loaders ====== */
async function loadMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  state.mediums = data || [];
  state.mediumsById = new Map(state.mediums.map(m => [m.id, m]));
}

async function loadChamadas(date) {
  const { data, error } = await sb
    .from("chamadas")
    .select("*")
    .eq("data", date);

  if (error) throw error;

  state.chamados = data || [];
  state.chamadosByKey = new Map(
    state.chamados.map(r => [`${r.data}:${r.medium_id}`, r])
  );
}

async function loadRotacao() {
  const { data, error } = await sb
    .from("rotacao")
    .select("*");

  if (error) throw error;

  state.rotacao = data || [];
  state.rotacaoByGroup = new Map(
    state.rotacao.map(r => [r.group_type, r.last_medium_id])
  );
}

/* ====== Render: Próximos (manual) ====== */
function renderProximos() {
  // Mostra exatamente o que está gravado em rotacao
  const targets = [
    { group_type: "mesa_desenvolvimento", label: "Mesa (Desenvolvimento)" },
    { group_type: "mesa_dirigente", label: "Mesa (Dirigente)" },
    { group_type: "mesa_incorporacao", label: "Mesa (Incorporação)" },
    { group_type: "psicografia", label: "Psicografia" },
  ];

  const box = $("#nextGrid");
  box.innerHTML = "";

  targets.forEach(t => {
    const id = state.rotacaoByGroup.get(t.group_type);
    const name = id ? safeNameById(id) : "(não definido)";

    const card = document.createElement("div");
    card.className = "miniCard";
    card.innerHTML = `
      <div class="miniTitle">${t.label}</div>
      <div class="miniValue">${name}</div>
    `;
    box.appendChild(card);
  });

  $("#hintNext").textContent =
    "Modo MANUAL: ao terminar a chamada, use os botões “Próx.” para definir quem será o próximo em cada grupo. Salvar a chamada NÃO altera mais isso.";
}

/* ====== Render: Lista da chamada ====== */
function getRowStatus(date, medium_id) {
  const r = state.chamadosByKey.get(`${date}:${medium_id}`);
  return r ? r.status : "P"; // default P
}

function setLocalStatus(date, medium_id, status) {
  const key = `${date}:${medium_id}`;
  const existing = state.chamadosByKey.get(key);
  if (existing) {
    existing.status = status;
  } else {
    state.chamadosByKey.set(key, {
      data: date,
      medium_id,
      status,
      is_ultimo_mesa: false
    });
  }
}

function shouldShowGroup(g) {
  if (g === "carencia") return state.filtros.incluirCarencia;
  if (g === "desenvolvimento") return state.filtros.incluirDesenvolvimento;
  if (g === "dirigente") return state.filtros.incluirDirigente;
  if (g === "incorporacao") return state.filtros.incluirIncorporacao;
  return true;
}

/* ---- Definir próximos manualmente (upsert em rotacao) ---- */
async function setProximo(group_type, medium_id) {
  setMsg("", "");
  try {
    const payload = { group_type, last_medium_id: medium_id };

    const { error } = await sb
      .from("rotacao")
      .upsert(payload, { onConflict: "group_type" });

    if (error) throw error;

    // atualiza estado local
    state.rotacaoByGroup.set(group_type, medium_id);

    renderProximos();
    renderChamadaList(); // para destacar na lista
    setMsg(`Próximo definido: ${rotacaoKeyToHuman(group_type)} → ${safeNameById(medium_id)}`, "");
  } catch (e) {
    setMsg("", `Erro ao definir próximo: ${e.message || e}`);
  }
}

function renderChamadaList() {
  const list = $("#chamadaList");
  list.innerHTML = "";

  const date = state.date;

  // ordena por grupo e nome
  const sorted = [...state.mediums]
    .filter(m => shouldShowGroup(m.group_type))
    .sort((a, b) => {
      const ga = groupOrder(a.group_type);
      const gb = groupOrder(b.group_type);
      if (ga !== gb) return ga - gb;
      return (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
    });

  // mapas de "proximos" para destaque
  const nextMesaDev = state.rotacaoByGroup.get("mesa_desenvolvimento");
  const nextMesaDir = state.rotacaoByGroup.get("mesa_dirigente");
  const nextMesaInc = state.rotacaoByGroup.get("mesa_incorporacao");
  const nextPsico = state.rotacaoByGroup.get("psicografia");

  // cria seções por grupo
  let currentGroup = null;

  sorted.forEach(m => {
    if (m.group_type !== currentGroup) {
      currentGroup = m.group_type;
      const h = document.createElement("div");
      h.className = "sectionTitle";
      h.textContent = humanGroup(currentGroup);
      list.appendChild(h);
    }

    const status = getRowStatus(date, m.id);

    const row = document.createElement("div");
    row.className = "itemRow";

    // destaque: próximo mesa/psico conforme grupo
    if (m.group_type === "desenvolvimento" && nextMesaDev === m.id) row.classList.add("nextMesa");
    if (m.group_type === "dirigente" && nextMesaDir === m.id) row.classList.add("nextMesa");
    if (m.group_type === "incorporacao" && nextMesaInc === m.id) row.classList.add("nextMesa");
    if (m.group_type === "dirigente" && nextPsico === m.id) row.classList.add("nextPsico");

    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName">${m.name}</div>
        <div class="itemMeta">${humanGroup(m.group_type)}</div>
      </div>

      <div class="itemRight">
        <div class="radioGroup" data-mid="${m.id}">
          ${renderRadio(m.id, "P", "P")}
          ${renderRadio(m.id, "F", "F")}
          ${renderRadio(m.id, "M", "M")}
          ${m.group_type === "dirigente" ? renderRadio(m.id, "PS", "PS") : ""}
        </div>

        ${renderProximoButtons(m)}
      </div>
    `;

    list.appendChild(row);

    // set radio checked
    const group = row.querySelector(`.radioGroup[data-mid="${m.id}"]`);
    const input = group.querySelector(`input[value="${status}"]`);
    if (input) input.checked = true;

    // events radio
    group.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("change", () => {
        setLocalStatus(date, m.id, inp.value);
      });
    });

    // events próximos
    const btnMesa = row.querySelector(`[data-action="setNextMesa"]`);
    if (btnMesa) {
      btnMesa.addEventListener("click", async () => {
        const gt =
          m.group_type === "desenvolvimento" ? "mesa_desenvolvimento" :
          m.group_type === "dirigente" ? "mesa_dirigente" :
          m.group_type === "incorporacao" ? "mesa_incorporacao" :
          null;
        if (!gt) return;
        await setProximo(gt, m.id);
      });
    }

    const btnPsico = row.querySelector(`[data-action="setNextPsico"]`);
    if (btnPsico) {
      btnPsico.addEventListener("click", async () => {
        await setProximo("psicografia", m.id);
      });
    }
  });

  if (!sorted.length) {
    list.innerHTML = `<div class="empty">Nenhum participante para mostrar (verifique filtros).</div>`;
  }
}

function renderRadio(mid, value, label) {
  const id = `r_${mid}_${value}`;
  return `
    <input type="radio" id="${id}" name="st_${mid}" value="${value}">
    <label class="radioLbl" for="${id}">
      <span class="dot"></span>
      <span class="radioTxt">${label}</span>
    </label>
  `;
}

function renderProximoButtons(m) {
  // carencia não participa de "próximo"
  if (m.group_type === "carencia") return "";

  if (m.group_type === "dirigente") {
    return `
      <button class="btn small" type="button" data-action="setNextMesa">Próx. Mesa</button>
      <button class="btn small" type="button" data-action="setNextPsico">Próx. Psicografia</button>
    `;
  }

  // desenvolvimento / incorporacao
  return `<button class="btn small" type="button" data-action="setNextMesa">Próx. Mesa</button>`;
}

/* ====== Salvar chamada (sem mexer em rotacao) ====== */
async function onSalvarTudo() {
  setMsg("", "");
  try {
    const date = state.date;

    // montar payloads da chamada (somente presença/falta/mesa/ps)
    const rows = [];
    for (const m of state.mediums) {
      if (!shouldShowGroup(m.group_type)) continue;

      const status = getRowStatus(date, m.id);
      rows.push({
        data: date,
        medium_id: m.id,
        status,
        // is_ultimo_mesa fica irrelevante no modo manual (mantemos false)
        is_ultimo_mesa: false
      });
    }

    // upsert em chamadas (garante registro do dia para todos exibidos)
    const { error } = await sb
      .from("chamadas")
      .upsert(rows, { onConflict: "data,medium_id" });

    if (error) throw error;

    setMsg("Chamada salva. (Modo MANUAL: próximos não foram alterados.)", "");
    await loadChamadas(date); // recarrega para manter consistência
    renderChamadaList();
  } catch (e) {
    setMsg("", `Erro ao salvar: ${e.message || e}`);
  }
}

/* ====== Participantes (mantém ordenação alfabética via trigger do banco) ====== */
async function onAddMedium() {
  setMsg("", "");
  const name = $("#newName").value.trim();
  const group_type = $("#newGroup").value;

  if (!name) {
    setMsg("", "Digite o nome do participante.");
    return;
  }

  try {
    const { error } = await sb
      .from("mediums")
      .insert({ name, group_type });

    if (error) throw error;

    $("#newName").value = "";
    setMsg("Participante adicionado. (O banco reordena por nome automaticamente.)", "");

    await loadMediums();
    renderChamadaList();
    renderMediumsList();
    renderProximos();
  } catch (e) {
    setMsg("", `Erro ao adicionar: ${e.message || e}`);
  }
}

function renderMediumsList() {
  const box = $("#mediumsList");
  box.innerHTML = "";

  const sorted = [...state.mediums].sort((a, b) => {
    const ga = groupOrder(a.group_type);
    const gb = groupOrder(b.group_type);
    if (ga !== gb) return ga - gb;
    return (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
  });

  let currentGroup = null;
  sorted.forEach(m => {
    if (m.group_type !== currentGroup) {
      currentGroup = m.group_type;
      const h = document.createElement("div");
      h.className = "sectionTitle";
      h.textContent = humanGroup(currentGroup);
      box.appendChild(h);
    }

    const row = document.createElement("div");
    row.className = "itemRow";
    row.innerHTML = `
      <div class="itemLeft">
        <div class="itemName">${m.name}</div>
        <div class="itemMeta">${humanGroup(m.group_type)}</div>
      </div>
      <div class="itemRight">
        <button class="btn small danger" type="button" data-del="${m.id}">Excluir</button>
      </div>
    `;
    box.appendChild(row);

    row.querySelector(`[data-del="${m.id}"]`).addEventListener("click", async () => {
      await onDeleteMedium(m.id);
    });
  });

  if (!sorted.length) box.innerHTML = `<div class="empty">Sem participantes cadastrados.</div>`;
}

async function onDeleteMedium(id) {
  setMsg("", "");
  try {
    // atenção: pode quebrar chamadas antigas se tiver FK — faça conforme seu esquema
    const { error } = await sb.from("mediums").delete().eq("id", id);
    if (error) throw error;

    setMsg("Participante excluído.", "");
    await loadMediums();
    renderChamadaList();
    renderMediumsList();
    renderProximos();
  } catch (e) {
    setMsg("", `Erro ao excluir: ${e.message || e}`);
  }
}

/* ====== Init ====== */
async function init() {
  try {
    // listeners
    $$(".tabBtn").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

    $("#dateInput").value = state.date;
    $("#dateInput").addEventListener("change", async () => {
      state.date = $("#dateInput").value;
      await loadChamadas(state.date);
      renderChamadaList();
    });

    $("#btnSalvar").addEventListener("click", onSalvarTudo);

    // filtros
    $("#fCarencia").checked = state.filtros.incluirCarencia;
    $("#fDirigente").checked = state.filtros.incluirDirigente;
    $("#fIncorporacao").checked = state.filtros.incluirIncorporacao;
    $("#fDesenvolvimento").checked = state.filtros.incluirDesenvolvimento;

    $("#fCarencia").addEventListener("change", () => { state.filtros.incluirCarencia = $("#fCarencia").checked; renderChamadaList(); });
    $("#fDirigente").addEventListener("change", () => { state.filtros.incluirDirigente = $("#fDirigente").checked; renderChamadaList(); });
    $("#fIncorporacao").addEventListener("change", () => { state.filtros.incluirIncorporacao = $("#fIncorporacao").checked; renderChamadaList(); });
    $("#fDesenvolvimento").addEventListener("change", () => { state.filtros.incluirDesenvolvimento = $("#fDesenvolvimento").checked; renderChamadaList(); });

    // participantes
    $("#btnAdd").addEventListener("click", onAddMedium);

    // load
    await loadMediums();
    await loadChamadas(state.date);
    await loadRotacao();

    renderProximos();
    renderChamadaList();
    renderMediumsList();

    setTab("chamada");
    setMsg("OK. Modo MANUAL de próximos ativo.", "");
  } catch (e) {
    setMsg("", `Falha ao iniciar: ${e.message || e}`);
  }
}

init();
