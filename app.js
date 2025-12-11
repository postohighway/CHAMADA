// =====================
// CONFIGURAÇÃO SUPABASE
// =====================

const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// lista com TODOS os médiuns
let mediumsCache = [];

// =====================
// LOGIN / LOGOUT
// =====================

async function login() {
  const email = document.getElementById("email").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const erroBox = document.getElementById("loginError");

  erroBox.textContent = "";

  if (!email || !senha) {
    erroBox.textContent = "Preencha email e senha.";
    return;
  }

  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      console.error("Erro login:", error);
      erroBox.textContent = "Erro no login: " + error.message;
      return;
    }

    document.getElementById("loginCard").style.display = "none";
    document.getElementById("app").style.display = "block";

    const hoje = new Date().toISOString().slice(0, 10);
    document.getElementById("dataChamada").value = hoje;

    await carregarMediums();
  } catch (e) {
    console.error("Exceção login:", e);
    erroBox.textContent = "Erro inesperado ao tentar entrar.";
  }
}

async function logout() {
  await sb.auth.signOut();
  document.getElementById("app").style.display = "none";
  document.getElementById("loginCard").style.display = "block";
}

// =====================
// TROCA DE ABA
// =====================

function mostrarAba(qual) {
  const abaChamada = document.getElementById("abaChamada");
  const abaAdmin = document.getElementById("abaAdmin");
  const tabChamada = document.getElementById("tabChamada");
  const tabAdmin = document.getElementById("tabAdmin");

  if (qual === "chamada") {
    abaChamada.style.display = "block";
    abaAdmin.style.display = "none";
    tabChamada.classList.add("active");
    tabAdmin.classList.remove("active");
  } else {
    abaChamada.style.display = "none";
    abaAdmin.style.display = "block";
    tabChamada.classList.remove("active");
    tabAdmin.classList.add("active");
    listarParticipantesAdmin();
  }
}

// =====================
// VERIFICAR DATA
// =====================

async function verificarData() {
  const data = document.getElementById("dataChamada").value;
  const aviso = document.getElementById("avisoData");

  aviso.textContent = "";

  if (!data) {
    aviso.textContent = "Selecione uma data.";
    return false;
  }

  const diaSemana = new Date(data + "T03:00:00").getDay(); // 2 = terça

  let feriados = [];
  try {
    const { data: feriadosData, error } = await sb
      .from("feriados")
      .select("*")
      .eq("data", data);

    if (!error && feriadosData) feriados = feriadosData;
  } catch (e) {
    console.error("Erro feriados:", e);
  }

  if (diaSemana !== 2) {
    aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA.";
    return false;
  }

  if (feriados.length > 0) {
    aviso.textContent = "❌ Hoje é feriado! Chamada não permitida.";
    return false;
  }

  aviso.textContent = "✔ Data válida, pode registrar presença.";
  return true;
}

// =====================
// CARREGAR MÉDIUNS
// =====================

async function carregarMediums() {
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Erro carregar médiuns:", error);
    alert("Erro ao carregar lista de médiuns.");
    return;
  }

  mediumsCache = data || [];
  renderGruposChamada();
}

function renderGruposChamada() {
  const ativos = mediumsCache.filter((m) => m.active);

  const dirigentes = ativos.filter((x) => x.group_type === "dirigente");
  const incorporacao = ativos.filter((x) => x.group_type === "incorporacao");
  const desenvolvimento = ativos.filter(
    (x) => x.group_type === "desenvolvimento"
  );
  const carencia = ativos.filter((x) => x.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes);
  renderGrupo("listaIncorporacao", incorporacao);
  renderGrupo("listaDesenvolvimento", desenvolvimento);
  renderGrupo("listaCarencia", carencia);
}

// 👉 AQUI ENTRA O LAYOUT EM CARTÕES
function renderGrupo(divId, lista) {
  const div = document.getElementById(divId);
  div.innerHTML = "";

  if (!lista || lista.length === 0) {
    div.innerHTML = "<i>Nenhum médium neste grupo.</i>";
    return;
  }

  lista.forEach((m) => {
    const card = document.createElement("div");
    card.className = "medium-card";

    let radios = `
      <label><input type="radio" name="${m.id}" value="P"> P</label>
      <label><input type="radio" name="${m.id}" value="M"> M</label>
      <label><input type="radio" name="${m.id}" value="F"> F</label>
    `;

    if (m.group_type === "dirigente") {
      radios += `<label><input type="radio" name="${m.id}" value="PS"> PS</label>`;
    }

    card.innerHTML = `
      <div class="medium-name">${m.name}</div>
      <div class="medium-options">
        ${radios}
      </div>
    `;

    div.appendChild(card);
  });
}

// =====================
// SALVAR CHAMADA
// =====================

async function salvarChamada() {
  const data = document.getElementById("dataChamada").value;
  const res = document.getElementById("resultadoSalvar");
  res.textContent = "";

  const ok = await verificarData();
  if (!ok) {
    res.textContent = "Corrija a data antes de salvar.";
    return;
  }

  const registros = [];

  mediumsCache.forEach((m) => {
    if (!m.active) return;
    const statusEl = document.querySelector(`input[name="${m.id}"]:checked`);
    if (!statusEl) return;

    registros.push({
      medium_id: m.id,
      data: data,
      status: statusEl.value,
    });
  });

  if (registros.length === 0) {
    res.textContent = "Nenhuma presença marcada.";
    return;
  }

  const { error } = await sb.from("chamadas").insert(registros);

  if (error) {
    console.error("Erro salvar chamadas:", error);
    res.textContent = "❌ Erro ao salvar: " + error.message;
    return;
  }

  res.textContent = "✔ Chamada registrada com sucesso!";
}

// =====================
// ADMIN - PARTICIPANTES
// =====================

function limparFormularioParticipante() {
  document.getElementById("mediumId").value = "";
  document.getElementById("mediumNome").value = "";
  document.getElementById("mediumGrupo").value = "dirigente";
  document.getElementById("mediumCarenciaTotal").value = "";
  document.getElementById("mediumAtivo").checked = true;
  document.getElementById("adminMensagem").textContent = "";
}

async function salvarParticipante() {
  const id = document.getElementById("mediumId").value;
  const nome = document.getElementById("mediumNome").value.trim();
  const grupo = document.getElementById("mediumGrupo").value;
  const carenciaTotalStr =
    document.getElementById("mediumCarenciaTotal").value.trim();
  const ativo = document.getElementById("mediumAtivo").checked;
  const msg = document.getElementById("adminMensagem");

  msg.textContent = "";

  if (!nome) {
    msg.textContent = "Informe o nome.";
    return;
  }

  const carenciaTotal =
    carenciaTotalStr === "" ? null : parseInt(carenciaTotalStr, 10);

  const payload = {
    name: nome,
    group_type: grupo,
    active: ativo,
    carencia_total: carenciaTotal,
  };

  let error = null;

  if (id) {
    const resp = await sb.from("mediums").update(payload).eq("id", id);
    error = resp.error;
  } else {
    const resp = await sb.from("mediums").insert(payload);
    error = resp.error;
  }

  if (error) {
    console.error("Erro salvar participante:", error);
    msg.textContent = "Erro ao salvar participante: " + error.message;
    return;
  }

  msg.textContent = "✔ Participante salvo com sucesso.";
  limparFormularioParticipante();
  await carregarMediums();
  listarParticipantesAdmin();
}

function listarParticipantesAdmin() {
  const cont = document.getElementById("tabelaParticipantes");
  cont.innerHTML = "";

  if (!mediumsCache || mediumsCache.length === 0) {
    cont.innerHTML = "<i>Nenhum participante cadastrado.</i>";
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Grupo</th>
          <th>Ativo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
  `;

  mediumsCache.forEach((m) => {
    html += `
      <tr>
        <td>${m.name}</td>
        <td>${m.group_type}</td>
        <td>${m.active ? "Sim" : "Não"}</td>
        <td>
          <button class="admin-btn admin-edit" onclick="editarParticipante('${m.id}')">Editar</button>
          <button class="admin-btn admin-delete" onclick="excluirParticipante('${m.id}')">Excluir</button>
        </td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  cont.innerHTML = html;
}

function editarParticipante(id) {
  const m = mediumsCache.find((x) => x.id === id);
  if (!m) return;

  document.getElementById("mediumId").value = m.id;
  document.getElementById("mediumNome").value = m.name;
  document.getElementById("mediumGrupo").value = m.group_type;
  document.getElementById("mediumCarenciaTotal").value =
    m.carencia_total ?? "";
  document.getElementById("mediumAtivo").checked = !!m.active;

  document.getElementById("adminMensagem").textContent =
    "Editando participante...";
}

async function excluirParticipante(id) {
  if (!confirm("Confirmar exclusão deste participante?")) return;

  const { error } = await sb.from("mediums").delete().eq("id", id);

  if (error) {
    console.error("Erro excluir participante:", error);
    document.getElementById("adminMensagem").textContent =
      "Erro ao excluir: " + error.message;
    return;
  }

  document.getElementById("adminMensagem").textContent =
    "✔ Participante excluído.";
  await carregarMediums();
  listarParticipantesAdmin();
}
