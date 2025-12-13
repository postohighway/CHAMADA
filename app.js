// =================== SUPABASE (SEM LOGIN) ===================
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY = "COLE_AQUI_SUA_ANON_KEY_DO_SUPABASE";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// =================== ESTADO ===================
let mediunsCache = [];
let rotaMap = {
  dirigente: { last_mesa: null, last_ps: null },
  incorporacao: { last_mesa: null },
  desenvolvimento: { last_mesa: null },
  carencia: { last_mesa: null },
};

function setStatus(txt) {
  const el = document.getElementById("statusRodape");
  if (el) el.textContent = txt;
}

function localISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("dataChamada").value = localISODate();
  setStatus("Carregando dados…");
  await init();
});

async function init() {
  try {
    await carregarMediuns();
    await carregarRotacao();
    renderGruposChamada();
    renderListaAdmin();
    setStatus("Online ✅");
  } catch (e) {
    console.error(e);
    setStatus("Erro ao carregar ❌");
    document.getElementById("avisoData").textContent =
      "Erro ao conectar no Supabase. Verifique URL/KEY e RLS das tabelas.";
    document.getElementById("avisoData").className = "notice bad";
  }
}

// =================== NAVEGAÇÃO ===================
window.mostrarAba = function (qual) {
  const abaChamada = document.getElementById("abaChamada");
  const abaAdmin = document.getElementById("abaAdmin");
  const tabChamada = document.getElementById("tabChamada");
  const tabAdmin = document.getElementById("tabAdmin");

  if (qual === "chamada") {
    abaChamada.style.display = "block";
    abaAdmin.style.display = "none";
    tabChamada.classList.add("active");
    tabAdmin.classList.remove("active");
    renderGruposChamada();
  } else {
    abaChamada.style.display = "none";
    abaAdmin.style.display = "block";
    tabChamada.classList.remove("active");
    tabAdmin.classList.add("active");
    renderListaAdmin();
  }
};

// =================== VERIFICAR DATA ===================
window.verificarData = async function verificarData() {
  const data = document.getElementById("dataChamada").value;
  const aviso = document.getElementById("avisoData");
  aviso.className = "notice";
  aviso.textContent = "";

  if (!data) {
    aviso.textContent = "Selecione uma data.";
    aviso.classList.add("bad");
    return false;
  }

  // 0=domingo ... 2=terça
  const diaSemana = new Date(data + "T03:00:00").getDay();
  if (diaSemana !== 2) {
    aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA.";
    aviso.classList.add("bad");
    return false;
  }

  // feriados
  const { data: fer, error } = await sb.from("feriados").select("*").eq("data", data);
  if (error) console.warn("Erro feriados:", error);

  if (fer && fer.length > 0) {
    aviso.textContent = "❌ Hoje é feriado! Chamada não permitida.";
    aviso.classList.add("bad");
    return false;
  }

  aviso.textContent = "✅ Data válida, pode registrar presença.";
  aviso.classList.add("ok");
  return true;
};

// =================== CARREGAR DADOS ===================
async function carregarMediuns() {
  const { data, error } = await sb.from("mediuns").select("*").order("name", { ascending: true });
  if (error) throw error;
  mediunsCache = (data || []).slice();
}

async function carregarRotacao() {
  const { data, error } = await sb.from("rotacao").select("*");
  if (error) throw error;

  // default
  rotaMap.dirigente.last_mesa = null;
  rotaMap.dirigente.last_ps = null;
  rotaMap.incorporacao.last_mesa = null;
  rotaMap.desenvolvimento.last_mesa = null;

  (data || []).forEach((r) => {
    if (r.group_type === "dirigente") {
      rotaMap.dirigente.last_mesa = r.last_medium_id || null;
      rotaMap.dirigente.last_ps = r.last_ps_medium_id || null;
    }
    if (r.group_type === "incorporacao") rotaMap.incorporacao.last_mesa = r.last_medium_id || null;
    if (r.group_type === "desenvolvimento") rotaMap.desenvolvimento.last_mesa = r.last_medium_id || null;
    if (r.group_type === "carencia") rotaMap.carencia.last_mesa = r.last_medium_id || null;
  });
}

// =================== RENDER (CHAMADA) ===================
function renderGruposChamada() {
  const ativos = mediunsCache.filter((m) => m.active);

  const dirigentes = ativos.filter((m) => m.group_type === "dirigente");
  const incorporacao = ativos.filter((m) => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter((m) => m.group_type === "desenvolvimento");
  const carencia = ativos.filter((m) => m.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes, "dirigente");
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

function getNextId(lista, lastId) {
  if (!lista || lista.length === 0) return null;
  if (!lastId) return lista[0].id;
  const idx = lista.findIndex((m) => m.id === lastId);
  if (idx === -1 || idx === lista.length - 1) return lista[0].id;
  return lista[idx + 1].id;
}

function calcPercFalta(m, groupType) {
  const faltas = m.faltas || 0;
  const pres = m.presencas || 0;
  const mesa = m.mesa || 0;
  const ps = groupType === "dirigente" ? (m.psicografia || 0) : 0;

  const total = faltas + pres + mesa + ps;
  if (total <= 0) return { perc: 0, total: 0 };

  const perc = Math.round((faltas * 100) / total);
  return { perc, total };
}

function renderGrupo(divId, lista, groupType) {
  const div = document.getElementById(divId);
  div.innerHTML = "";

  if (!lista || lista.length === 0) {
    div.innerHTML = `<div class="empty">Nenhum médium neste grupo.</div>`;
    return;
  }

  // Próximos
  let nextMesaId = null;
  let nextPsId = null;

  if (groupType === "dirigente") {
    nextMesaId = getNextId(lista, rotaMap.dirigente.last_mesa);
    nextPsId = getNextId(lista, rotaMap.dirigente.last_ps);
  } else if (groupType === "incorporacao") {
    nextMesaId = getNextId(lista, rotaMap.incorporacao.last_mesa);
  } else if (groupType === "desenvolvimento") {
    nextMesaId = getNextId(lista, rotaMap.desenvolvimento.last_mesa);
  } else {
    // carencia: sem mesa/sem rotação
    nextMesaId = null;
  }

  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card";

    if (nextMesaId && m.id === nextMesaId) card.classList.add("next-mesa");
    if (nextPsId && m.id === nextPsId) card.classList.add("next-ps");

    const { perc } = calcPercFalta(m, groupType);
    const badgeClass = perc >= 30 ? "badge late" : "badge";

    // opções por grupo
    let radios = "";
    const inputName = `status_${m.id}`;

    if (groupType === "carencia") {
      radios = `
        <label class="opt"><input type="radio" name="${inputName}" value="P"> <span>P</span></label>
        <label class="opt"><input type="radio" name="${inputName}" value="F"> <span>F</span></label>
      `;
    } else if (groupType === "dirigente") {
      radios = `
        <label class="opt"><input type="radio" name="${inputName}" value="P"> <span>P</span></label>
        <label class="opt"><input type="radio" name="${inputName}" value="M"> <span>M</span></label>
        <label class="opt"><input type="radio" name="${inputName}" value="F"> <span>F</span></label>
        <label class="opt ps"><input type="radio" name="${inputName}" value="PS"> <span>PS</span></label>
      `;
    } else {
      radios = `
        <label class="opt"><input type="radio" name="${inputName}" value="P"> <span>P</span></label>
        <label class="opt"><input type="radio" name="${inputName}" value="M"> <span>M</span></label>
        <label class="opt"><input type="radio" name="${inputName}" value="F"> <span>F</span></label>
      `;
    }

    // tags
    const tags = [];
    if (nextMesaId && m.id === nextMesaId) tags.push(`<span class="tag next">PRÓXIMO (MESA)</span>`);
    if (nextPsId && m.id === nextPsId) tags.push(`<span class="tag ps">PRÓXIMO (PS)</span>`);

    card.innerHTML = `
      <div class="card-head">
        <div class="name-line">
          <span class="${badgeClass}">${perc}% falta</span>
          <span class="name">${m.name}</span>
        </div>
        <div class="tags">${tags.join("")}</div>
      </div>
      <div class="opts">${radios}</div>
    `;

    div.appendChild(card);
  });
}

// =================== SALVAR CHAMADA ===================
window.salvarChamada = async function salvarChamada() {
  const data = document.getElementById("dataChamada").value;
  const res = document.getElementById("resultadoSalvar");
  res.textContent = "";
  res.className = "result";

  const ok = await window.verificarData();
  if (!ok) {
    res.textContent = "Corrija a data antes de salvar.";
    res.classList.add("bad");
    return;
  }

  // impede duplicar a mesma data (pra não bagunçar contadores)
  const { data: jaTem, error: e0 } = await sb.from("chamadas").select("id").eq("data", data).limit(1);
  if (e0) console.warn(e0);

  if (jaTem && jaTem.length > 0) {
    res.textContent = "Já existe chamada nessa data. Use outra data para teste.";
    res.classList.add("bad");
    return;
  }

  const ativos = mediunsCache.filter((m) => m.active);
  const registros = [];

  ativos.forEach((m) => {
    const sel = document.querySelector(`input[name="status_${m.id}"]:checked`);
    if (!sel) return;
    registros.push({ medium_id: m.id, data, status: sel.value });
  });

  if (registros.length === 0) {
    res.textContent = "Nenhuma presença marcada.";
    res.classList.add("bad");
    return;
  }

  // grava chamadas
  const { error } = await sb.from("chamadas").insert(registros);
  if (error) {
    console.error(error);
    res.textContent = "Erro ao salvar: " + error.message;
    res.classList.add("bad");
    return;
  }

  // atualiza contadores em mediuns (usando cache como base)
  const deltaById = {};
  registros.forEach((r) => {
    if (!deltaById[r.medium_id]) deltaById[r.medium_id] = { P: 0, M: 0, F: 0, PS: 0 };
    deltaById[r.medium_id][r.status] = (deltaById[r.medium_id][r.status] || 0) + 1;
  });

  for (const m of mediunsCache) {
    const d = deltaById[m.id];
    if (!d) continue;

    const patch = {
      presencas: (m.presencas || 0) + (d.P || 0),
      mesa: (m.mesa || 0) + (d.M || 0),
      faltas: (m.faltas || 0) + (d.F || 0),
      psicografia: (m.psicografia || 0) + (d.PS || 0),
    };

    // carencia não tem mesa/ps -> se por algum motivo vier, ignora
    if (m.group_type === "carencia") {
      patch.mesa = m.mesa || 0;
      patch.psicografia = m.psicografia || 0;
    }
    if (m.group_type !== "dirigente") {
      patch.psicografia = m.psicografia || 0;
    }

    const { error: e1 } = await sb.from("mediuns").update(patch).eq("id", m.id);
    if (e1) console.warn("Erro update mediuns:", e1);
  }

  // atualiza rotações (último que foi M/PS em cada grupo)
  await atualizarRotacaoPorRegistros(registros);

  // recarrega tudo
  await carregarMediuns();
  await carregarRotacao();
  renderGruposChamada();

  res.textContent = "✅ Chamada registrada com sucesso!";
  res.classList.add("ok");
};

async function atualizarRotacaoPorRegistros(registros) {
  const byId = Object.fromEntries(mediunsCache.map((m) => [m.id, m]));

  const grupos = {
    dirigente_M: [],
    dirigente_PS: [],
    incorporacao: [],
    desenvolvimento: [],
  };

  registros.forEach((r) => {
    const m = byId[r.medium_id];
    if (!m) return;

    if (m.group_type === "dirigente" && r.status === "M") grupos.dirigente_M.push(m);
    if (m.group_type === "dirigente" && r.status === "PS") grupos.dirigente_PS.push(m);
    if (m.group_type === "incorporacao" && r.status === "M") grupos.incorporacao.push(m);
    if (m.group_type === "desenvolvimento" && r.status === "M") grupos.desenvolvimento.push(m);
  });

  // como a lista já é ordenada por nome, "o último" é o maior índice
  const lastId = (arr) => (arr.length ? arr[arr.length - 1].id : null);

  const updDir = {
    last_medium_id: grupos.dirigente_M.length ? lastId(grupos.dirigente_M) : rotaMap.dirigente.last_mesa,
    last_ps_medium_id: grupos.dirigente_PS.length ? lastId(grupos.dirigente_PS) : rotaMap.dirigente.last_ps,
    updated_at: new Date().toISOString(),
  };

  await sb.from("rotacao").update(updDir).eq("group_type", "dirigente");

  if (grupos.incorporacao.length) {
    await sb
      .from("rotacao")
      .update({ last_medium_id: lastId(grupos.incorporacao), updated_at: new Date().toISOString() })
      .eq("group_type", "incorporacao");
  }

  if (grupos.desenvolvimento.length) {
    await sb
      .from("rotacao")
      .update({ last_medium_id: lastId(grupos.desenvolvimento), updated_at: new Date().toISOString() })
      .eq("group_type", "desenvolvimento");
  }
}

// =================== ADMIN (PARTICIPANTES) ===================
window.renderListaAdmin = function renderListaAdmin() {
  const container = document.getElementById("listaAdmin");
  const q = (document.getElementById("busca").value || "").trim().toLowerCase();

  const lista = mediunsCache
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((m) => !q || m.name.toLowerCase().includes(q));

  container.innerHTML = "";

  lista.forEach((m) => {
    const row = document.createElement("div");
    row.className = "admin-row";

    row.innerHTML = `
      <div class="admin-left">
        <div class="admin-name">${m.name}</div>
        <div class="admin-meta">
          <span class="chip">${m.group_type}</span>
          ${m.active ? `<span class="chip ok">ativo</span>` : `<span class="chip bad">inativo</span>`}
        </div>
      </div>

      <div class="admin-right">
        <select class="mini" onchange="adminTrocarGrupo('${m.id}', this.value)">
          <option value="dirigente" ${m.group_type === "dirigente" ? "selected" : ""}>dirigente</option>
          <option value="incorporacao" ${m.group_type === "incorporacao" ? "selected" : ""}>incorporacao</option>
          <option value="desenvolvimento" ${m.group_type === "desenvolvimento" ? "selected" : ""}>desenvolvimento</option>
          <option value="carencia" ${m.group_type === "carencia" ? "selected" : ""}>carencia</option>
        </select>

        <button class="btn mini" onclick="adminToggleAtivo('${m.id}', ${m.active ? "false" : "true"})">
          ${m.active ? "Desativar" : "Ativar"}
        </button>

        <button class="btn mini danger" onclick="adminExcluir('${m.id}')">Excluir</button>
      </div>
    `;

    container.appendChild(row);
  });
};

window.criarParticipante = async function criarParticipante() {
  const nome = (document.getElementById("novoNome").value || "").trim();
  const grupo = document.getElementById("novoGrupo").value;
  const msg = document.getElementById("adminMsg");
  msg.textContent = "";
  msg.className = "result";

  if (!nome) {
    msg.textContent = "Digite um nome.";
    msg.classList.add("bad");
    return;
  }

  const payload = {
    name: nome,
    group_type: grupo,
    active: true,
    faltas: 0,
    presencas: 0,
    mesa: 0,
    psicografia: 0,
    carencia_total: 0,
    carencia_atual: 0,
    primeira_incorporacao: false,
  };

  const { error } = await sb.from("mediuns").insert(payload);
  if (error) {
    msg.textContent = "Erro: " + error.message;
    msg.classList.add("bad");
    return;
  }

  document.getElementById("novoNome").value = "";
  msg.textContent = "✅ Adicionado!";
  msg.classList.add("ok");

  await carregarMediuns();
  renderListaAdmin();
  renderGruposChamada();
};

window.adminTrocarGrupo = async function adminTrocarGrupo(id, grupo) {
  await sb.from("mediuns").update({ group_type: grupo }).eq("id", id);
  await carregarMediuns();
  renderListaAdmin();
  renderGruposChamada();
};

window.adminToggleAtivo = async function adminToggleAtivo(id, ativo) {
  await sb.from("mediuns").update({ active: ativo }).eq("id", id);
  await carregarMediuns();
  renderListaAdmin();
  renderGruposChamada();
};

window.adminExcluir = async function adminExcluir(id) {
  const ok = confirm("Excluir este participante? (isso não apaga chamadas antigas)");
  if (!ok) return;

  const { error } = await sb.from("mediuns").delete().eq("id", id);
  if (error) alert("Erro: " + error.message);

  await carregarMediuns();
  renderListaAdmin();
  renderGruposChamada();
};
