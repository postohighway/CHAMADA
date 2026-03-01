/* ===========================
   SUPABASE CONFIG (REST)
=========================== */
const SUPABASE_URL = window.SUPABASE_URL || "";
const SUPABASE_ANON = window.SUPABASE_ANON || "";

/* ===========================
   DOM (bate com seu index.html)
=========================== */
const $statusPill = document.getElementById("statusPill");
const $statusText = document.getElementById("statusText");
const $msgTopo = document.getElementById("msgTopo");
const $msgErro = document.getElementById("msgErro");

const $dataChamada = document.getElementById("dataChamada");
const $btnVerificar = document.getElementById("btnVerificar");
const $btnSalvar = document.getElementById("btnSalvar");
const $btnImprimirProxima = document.getElementById("btnImprimirProxima");

const $resumoGeral = document.getElementById("resumoGeral");
const $reservasMesa = document.getElementById("reservasMesa");

const $nextMesaDirigenteName = document.getElementById("nextMesaDirigenteName");
const $nextPsicoDirigenteName = document.getElementById("nextPsicoDirigenteName");
const $nextMesaIncorpName = document.getElementById("nextMesaIncorpName");
const $nextMesaDesenvName = document.getElementById("nextMesaDesenvName");

const $listaDirigentes = document.getElementById("listaDirigentes");
const $listaIncorporacao = document.getElementById("listaIncorporacao");
const $listaDesenvolvimento = document.getElementById("listaDesenvolvimento");
const $listaCarencia = document.getElementById("listaCarencia");

// Tabs / Participantes
const $tabChamada = document.getElementById("tabChamada");
const $tabParticipantes = document.getElementById("tabParticipantes");
const $viewChamada = document.getElementById("viewChamada");
const $viewParticipantes = document.getElementById("viewParticipantes");

const $partFiltroGrupo = document.getElementById("partFiltroGrupo");
const $partBusca = document.getElementById("partBusca");
const $btnRecarregarParticipantes = document.getElementById("btnRecarregarParticipantes");
const $partMsg = document.getElementById("partMsg");
const $partErr = document.getElementById("partErr");
const $listaParticipantes = document.getElementById("listaParticipantes");

const $novoNome = document.getElementById("novoNome");
const $novoGrupo = document.getElementById("novoGrupo");
const $novoAtivo = document.getElementById("novoAtivo");
const $novoMesa = document.getElementById("novoMesa");
const $novoPsico = document.getElementById("novoPsico");
const $btnAdicionarParticipante = document.getElementById("btnAdicionarParticipante");

/* ===========================
   STATE
=========================== */
let currentDateISO = null;

// mediums
let mediumsAll = [];
let ORDERED = {
  dirigente: [],
  incorporacao: [],
  desenvolvimento: [],
  carencia: []
};

// chamadas do dia: medium_id -> "P"|"F"|"M"|"PS"
let chamadasMap = new Map();

// rotação (tabela rotacao): guarda last_medium_id por group_type
// OBS: aqui a rotação é MANUAL: você escolhe "quem é o próximo"
// e a gente grava o last_medium_id como o "anterior" na fila
let rotacao = {
  mesa_desenvolvimento: null,
  mesa_dirigente: null,
  mesa_incorporacao: null,
  psicografia: null
};

/* ===========================
   HTTP HELPERS
=========================== */
function mustConfigOk() {
  return !!(SUPABASE_URL && SUPABASE_ANON && SUPABASE_URL.startsWith("http"));
}

function restUrl(path) {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

async function httpGet(path) {
  const res = await fetch(restUrl(path), {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json"
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `GET ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPost(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(restUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `POST ${path} failed`);
  return text ? JSON.parse(text) : [];
}

async function httpPatch(path, body, prefer) {
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(restUrl(path), {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `PATCH ${path} failed`);
  return text ? JSON.parse(text) : [];
}

/* ===========================
   UI HELPERS
=========================== */
function showTop(msg) {
  $msgErro.textContent = "";
  $msgTopo.textContent = msg || "";
}
function showErr(msg) {
  $msgTopo.textContent = "";
  $msgErro.textContent = msg || "";
}
function setConnStatus(ok, text) {
  // mexe só no texto e na classe do pill (seu CSS já define estilos)
  $statusText.textContent = text || (ok ? "Conectado" : "Erro");
  $statusPill.classList.remove("ok", "bad");
  $statusPill.classList.add(ok ? "ok" : "bad");
}

function isoTodayLocal() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function nextTuesdayISO(fromISO) {
  const [y, m, d] = fromISO.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  const day = base.getDay(); // 0 dom ... 2 ter
  const target = 2; // terça
  let add = (target - day + 7) % 7;
  if (add === 0) add = 7;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + add);
  const off = next.getTimezoneOffset();
  const local = new Date(next.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeName(s) {
  return (s || "").trim();
}

function sortQueue(list) {
  // prioridade: sort_order, depois ordem_grupo, depois nome
  return [...list].sort((a, b) => {
    const as = (a.sort_order ?? a.ordem_grupo ?? 999999);
    const bs = (b.sort_order ?? b.ordem_grupo ?? 999999);
    if (as !== bs) return as - bs;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function getStatus(mId) {
  return (chamadasMap.get(mId) || "").toUpperCase();
}

function buildBadge(label, active, cls = "") {
  const s = document.createElement("span");
  s.className = `badge ${cls} ${active ? "active" : ""}`.trim();
  s.textContent = label;
  return s;
}

function rowEl(title, sub, badges, actionsEl, reserved = false) {
  const row = document.createElement("div");
  row.className = `row ${reserved ? "reserved" : ""}`.trim();

  const name = document.createElement("div");
  name.className = "name";

  const t = document.createElement("div");
  t.className = "title";
  t.textContent = title;

  const s = document.createElement("div");
  s.className = "sub";
  s.textContent = sub;

  name.appendChild(t);
  name.appendChild(s);

  const right = document.createElement("div");
  right.className = "badges";
  (badges || []).forEach((b) => right.appendChild(b));
  if (actionsEl) right.appendChild(actionsEl);

  row.appendChild(name);
  row.appendChild(right);
  return row;
}

/* ===========================
   ROTACAO (MANUAL)
   Você escolhe o "PRÓXIMO".
   A gente grava no banco o last_medium_id como o "anterior" do escolhido,
   para que a próxima lista seja calculada com getNextAfter().
=========================== */
function getPrevIdInQueue(group, selectedId) {
  const q = ORDERED[group] || [];
  if (!q.length) return null;
  const idx = q.findIndex((m) => m.id === selectedId);
  if (idx < 0) return null;
  const prevIdx = (idx - 1 + q.length) % q.length;
  return q[prevIdx]?.id || null;
}

function getNextAfter(group, lastId, count, excludeIds = new Set()) {
  const q = ORDERED[group] || [];
  if (!q.length) return [];
  let idx = 0;
  if (lastId) {
    const i = q.findIndex((m) => m.id === lastId);
    idx = i >= 0 ? (i + 1) % q.length : 0;
  }
  const out = [];
  let loops = 0;
  while (out.length < count && loops < q.length + 5) {
    const cand = q[idx];
    idx = (idx + 1) % q.length;
    loops++;
    if (!cand) continue;
    if (excludeIds.has(cand.id)) continue;
    out.push(cand);
  }
  return out;
}

async function setNextManual(rotacaoKey, group, selectedId) {
  // rotacaoKey: "mesa_dirigente" | "psicografia" | "mesa_incorporacao" | "mesa_desenvolvimento"
  // group: "dirigente" | "incorporacao" | "desenvolvimento"
  const prevId = getPrevIdInQueue(group, selectedId);
  if (!prevId) throw new Error("Não consegui calcular o anterior na fila (verifique a lista).");

  await httpPatch(`rotacao?group_type=eq.${rotacaoKey}`, { last_medium_id: prevId });
  rotacao[rotacaoKey] = prevId;

  // atualiza painéis "Próximos"
  renderNextPanel();
}

function renderNextPanel() {
  const dirMesa = getNextAfter("dirigente", rotacao.mesa_dirigente, 1);
  const psico = getNextAfter("dirigente", rotacao.psicografia, 1, new Set(dirMesa.map((x) => x.id)));
  const incMesa = getNextAfter("incorporacao", rotacao.mesa_incorporacao, 4);
  const desMesa = getNextAfter("desenvolvimento", rotacao.mesa_desenvolvimento, 4);

  $nextMesaDirigenteName.textContent = dirMesa[0]?.name || "—";
  $nextPsicoDirigenteName.textContent = psico[0]?.name || "—";
  $nextMesaIncorpName.textContent = incMesa.map((x) => x.name).join(", ") || "—";
  $nextMesaDesenvName.textContent = desMesa.map((x) => x.name).join(", ") || "—";

  // reservas da mesa (texto)
  const reservas = [
    `Dir(M): ${dirMesa.map((x) => x.name).join(", ") || "—"}`,
    `Dir(PS): ${psico.map((x) => x.name).join(", ") || "—"}`,
    `Inc(M): ${incMesa.map((x) => x.name).join(", ") || "—"}`,
    `Des(M): ${desMesa.map((x) => x.name).join(", ") || "—"}`
  ];
  $reservasMesa.textContent = reservas.join(" | ");
}

/* ===========================
   LOAD DATA
=========================== */
async function checkConnection() {
  if (!mustConfigOk()) {
    setConnStatus(false, "Config ausente");
    showErr("Faltou configurar SUPABASE_URL / SUPABASE_ANON (window.SUPABASE_URL / window.SUPABASE_ANON).");
    return false;
  }
  try {
    // ping simples
    await httpGet("mediums?select=id&limit=1");
    setConnStatus(true, "Conectado");
    return true;
  } catch (e) {
    console.error(e);
    setConnStatus(false, "Erro na conexão");
    showErr(`Erro ao conectar no Supabase REST: ${e.message}`);
    return false;
  }
}

async function loadMediums() {
  // pega tudo que precisa para ordenar e filtrar
  const data = await httpGet("mediums?select=id,name,group_type,active,sort_order,ordem_grupo&order=group_type.asc,sort_order.asc,ordem_grupo.asc,name.asc");
  mediumsAll = data || [];

  ORDERED.dirigente = sortQueue(mediumsAll.filter((m) => m.active === true && m.group_type === "dirigente"));
  ORDERED.incorporacao = sortQueue(mediumsAll.filter((m) => m.active === true && m.group_type === "incorporacao"));
  ORDERED.desenvolvimento = sortQueue(mediumsAll.filter((m) => m.active === true && m.group_type === "desenvolvimento"));
  ORDERED.carencia = sortQueue(mediumsAll.filter((m) => m.active === true && m.group_type === "carencia"));
}

async function loadRotacao() {
  const data = await httpGet("rotacao?select=group_type,last_medium_id");
  rotacao = {
    mesa_desenvolvimento: null,
    mesa_dirigente: null,
    mesa_incorporacao: null,
    psicografia: null
  };
  for (const r of data || []) {
    if (r.group_type in rotacao) rotacao[r.group_type] = r.last_medium_id || null;
  }
}

async function loadChamadasForDate(iso) {
  chamadasMap = new Map();
  const rows = await httpGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  for (const r of rows || []) {
    chamadasMap.set(r.medium_id, (r.status || "").toUpperCase());
  }
}

/* ===========================
   RENDER LISTAS
=========================== */
function renderResumo() {
  let p = 0, f = 0, m = 0, ps = 0;
  for (const st of chamadasMap.values()) {
    if (st === "P") p++;
    else if (st === "F") f++;
    else if (st === "M") m++;
    else if (st === "PS") ps++;
  }
  const total = p + f + m + ps;
  const pres = total ? Math.round(((p + m) / total) * 100) : 0;
  const falt = total ? Math.round((f / total) * 100) : 0;
  $resumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${pres}% | Faltas:${falt}%`;
}

function renderGroupList(container, group) {
  container.innerHTML = "";

  const q = ORDERED[group] || [];
  const reserved =
    group === "dirigente"
      ? {
          mesa: getNextAfter("dirigente", rotacao.mesa_dirigente, 1).map((x) => x.id),
          psico: getNextAfter("dirigente", rotacao.psicografia, 1).map((x) => x.id)
        }
      : group === "incorporacao"
      ? { mesa: getNextAfter("incorporacao", rotacao.mesa_incorporacao, 4).map((x) => x.id) }
      : group === "desenvolvimento"
      ? { mesa: getNextAfter("desenvolvimento", rotacao.mesa_desenvolvimento, 4).map((x) => x.id) }
      : { mesa: [] };

  for (const m of q) {
    const st = getStatus(m.id);

    // badges de status
    const badges = [];
    const bP = buildBadge("P", st === "P");
    const bF = buildBadge("F", st === "F", "danger");

    badges.push(bP, bF);

    let bM = null, bPS = null;
    if (group === "dirigente") {
      bM = buildBadge("M", st === "M", "warn");
      bPS = buildBadge("PS", st === "PS", "warn");
      badges.push(bM, bPS);
    } else if (group === "incorporacao" || group === "desenvolvimento") {
      bM = buildBadge("M", st === "M", "warn");
      badges.push(bM);
    }

    // ações "definir como próximo"
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.alignItems = "center";

    function mkBtn(label, onClick) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.style.padding = "6px 10px";
      btn.style.fontSize = "12px";
      btn.textContent = label;
      btn.onclick = onClick;
      return btn;
    }

    if (group === "dirigente") {
      actions.appendChild(
        mkBtn("Próx Mesa", async () => {
          try {
            showTop("");
            showErr("");
            await setNextManual("mesa_dirigente", "dirigente", m.id);
            showTop(`Próximo dirigente (Mesa): ${m.name}`);
            renderAll();
          } catch (e) {
            showErr(e.message);
          }
        })
      );
      actions.appendChild(
        mkBtn("Próx PS", async () => {
          try {
            showTop("");
            showErr("");
            await setNextManual("psicografia", "dirigente", m.id);
            showTop(`Próximo dirigente (Psicografia): ${m.name}`);
            renderAll();
          } catch (e) {
            showErr(e.message);
          }
        })
      );
    } else if (group === "incorporacao") {
      actions.appendChild(
        mkBtn("Próx Mesa", async () => {
          try {
            showTop("");
            showErr("");
            await setNextManual("mesa_incorporacao", "incorporacao", m.id);
            showTop(`Próximo da incorporação (Mesa): ${m.name}`);
            renderAll();
          } catch (e) {
            showErr(e.message);
          }
        })
      );
    } else if (group === "desenvolvimento") {
      actions.appendChild(
        mkBtn("Próx Mesa", async () => {
          try {
            showTop("");
            showErr("");
            await setNextManual("mesa_desenvolvimento", "desenvolvimento", m.id);
            showTop(`Próximo do desenvolvimento (Mesa): ${m.name}`);
            renderAll();
          } catch (e) {
            showErr(e.message);
          }
        })
      );
    }

    const isReserved =
      group === "dirigente"
        ? reserved.mesa.includes(m.id) || reserved.psico.includes(m.id)
        : reserved.mesa.includes(m.id);

    const sub =
      group === "dirigente"
        ? (reserved.mesa.includes(m.id)
            ? "Reservado: Mesa (próxima)"
            : reserved.psico.includes(m.id)
            ? "Reservado: Psicografia (próxima)"
            : "Dirigente")
        : group === "incorporacao"
        ? (reserved.mesa.includes(m.id) ? "Reservado: Mesa (próxima)" : "Incorporação")
        : group === "desenvolvimento"
        ? (reserved.mesa.includes(m.id) ? "Reservado: Mesa (próxima)" : "Desenvolvimento")
        : "Carência";

    const row = rowEl(m.name, sub, badges, actions, isReserved);

    // clicks status
    bP.onclick = () => {
      chamadasMap.set(m.id, "P");
      renderAll();
    };
    bF.onclick = () => {
      chamadasMap.set(m.id, "F");
      renderAll();
    };
    if (bM) {
      bM.onclick = () => {
        chamadasMap.set(m.id, "M");
        renderAll();
      };
    }
    if (bPS) {
      bPS.onclick = () => {
        chamadasMap.set(m.id, "PS");
        renderAll();
      };
    }

    container.appendChild(row);
  }
}

function renderAll() {
  renderResumo();
  renderNextPanel();

  renderGroupList($listaDirigentes, "dirigente");
  renderGroupList($listaIncorporacao, "incorporacao");
  renderGroupList($listaDesenvolvimento, "desenvolvimento");
  renderGroupList($listaCarencia, "carencia");
}

/* ===========================
   SAVE (SEM AUTOMAÇÃO)
   - salva statuses da chamada
   - NÃO mexe na rotacao automaticamente
=========================== */
async function salvarChamada() {
  if (!currentDateISO) {
    showErr("Defina a data antes de salvar.");
    return;
  }

  try {
    showTop("Salvando chamada...");
    showErr("");

    const rows = [];
    for (const [medium_id, status] of chamadasMap.entries()) {
      if (!status) continue;
      rows.push({ medium_id, data: currentDateISO, status: status.toUpperCase() });
    }

    if (rows.length) {
      await httpPost("chamadas", rows, "resolution=merge-duplicates,return=minimal");
    }

    showTop("Chamada salva com sucesso. (Rotação é MANUAL — use os botões Próx Mesa/Próx PS)");
  } catch (e) {
    console.error(e);
    showErr(`Erro ao salvar: ${e.message}`);
  }
}

/* ===========================
   PRINT NEXT
=========================== */
function buildPrintHTML(nextISO, targets) {
  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:24px}
      h1{margin:0 0 4px 0}
      .sub{color:#444; margin-bottom:16px}
      h2{margin:20px 0 8px 0}
      table{border-collapse:collapse; width:100%}
      td,th{border:1px solid #ddd; padding:8px}
      th{text-align:left; background:#f5f5f5}
    </style>
  `;
  function table(title, list) {
    const rows = list.map((x, i) => `<tr><td>${i + 1}</td><td>${x.name}</td></tr>`).join("");
    return `
      <h2>${title}</h2>
      <table>
        <thead><tr><th>#</th><th>Nome</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
  return `
    <html><head><meta charset="utf-8" />${style}</head>
    <body>
      <h1>Próxima Chamada</h1>
      <div class="sub">Data: <b>${nextISO}</b></div>
      ${table("Dirigente (Mesa)", targets.dirMesa)}
      ${table("Dirigente (Psicografia)", targets.psico)}
      ${table("Incorporação (Mesa)", targets.incMesa)}
      ${table("Desenvolvimento (Mesa)", targets.desMesa)}
      <script>window.onload=()=>window.print()</script>
    </body></html>
  `;
}

function getNextTargetsFromRotacao() {
  const dirMesa = getNextAfter("dirigente", rotacao.mesa_dirigente, 1);
  const psico = getNextAfter("dirigente", rotacao.psicografia, 1, new Set(dirMesa.map((x) => x.id)));
  const incMesa = getNextAfter("incorporacao", rotacao.mesa_incorporacao, 4);
  const desMesa = getNextAfter("desenvolvimento", rotacao.mesa_desenvolvimento, 4);
  return { dirMesa, psico, incMesa, desMesa };
}

function imprimirProxima() {
  const base = currentDateISO || isoTodayLocal();
  const nextISO = nextTuesdayISO(base);
  const targets = getNextTargetsFromRotacao();

  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(buildPrintHTML(nextISO, targets));
  w.document.close();
}

/* ===========================
   PARTICIPANTES (aba)
=========================== */
function tabSet(active) {
  if (active === "chamada") {
    $tabChamada.classList.add("active");
    $tabParticipantes.classList.remove("active");
    $viewChamada.style.display = "";
    $viewParticipantes.style.display = "none";
  } else {
    $tabParticipantes.classList.add("active");
    $tabChamada.classList.remove("active");
    $viewChamada.style.display = "none";
    $viewParticipantes.style.display = "";
    renderParticipants();
  }
}

function setPartMsg(msg) {
  $partErr.textContent = "";
  $partMsg.textContent = msg || "";
}
function setPartErr(msg) {
  $partMsg.textContent = "";
  $partErr.textContent = msg || "";
}

function renderParticipants() {
  $listaParticipantes.innerHTML = "";

  const filtro = ($partFiltroGrupo.value || "").trim();
  const busca = ($partBusca.value || "").toLowerCase().trim();

  const list = [...mediumsAll]
    .filter((m) => (filtro ? m.group_type === filtro : true))
    .filter((m) => (busca ? (m.name || "").toLowerCase().includes(busca) : true))
    .sort((a, b) => (a.group_type || "").localeCompare(b.group_type || "") || (a.name || "").localeCompare(b.name || ""));

  for (const m of list) {
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.alignItems = "center";

    const btnToggle = document.createElement("button");
    btnToggle.type = "button";
    btnToggle.className = "btn";
    btnToggle.style.padding = "6px 10px";
    btnToggle.style.fontSize = "12px";
    btnToggle.textContent = m.active ? "Desativar" : "Ativar";
    btnToggle.onclick = async () => {
      try {
        setPartMsg(`Atualizando ${m.name}...`);
        await httpPatch(`mediums?id=eq.${m.id}`, { active: !m.active });
        m.active = !m.active;
        await loadMediums();
        renderAll();
        renderParticipants();
        setPartMsg(`${m.name} atualizado.`);
      } catch (e) {
        console.error(e);
        setPartErr(e.message);
      }
    };

    actions.appendChild(btnToggle);

    const row = rowEl(
      m.name,
      `${m.group_type} • ${m.active ? "ativo" : "inativo"}`,
      [],
      actions,
      false
    );

    $listaParticipantes.appendChild(row);
  }
}

async function addParticipant() {
  try {
    const name = normalizeName($novoNome.value);
    const group_type = $novoGrupo.value;
    const active = !!$novoAtivo.checked;

    if (!name) {
      setPartErr("Informe o nome.");
      return;
    }

    setPartMsg("Adicionando participante...");
    setPartErr("");

    // Só inserimos básico.
    // Ordem alfabética/ordem_grupo você já tem trigger no banco — então não invento coluna.
    await httpPost(
      "mediums",
      [{ name, group_type, active }],
      "return=minimal"
    );

    $novoNome.value = "";
    await loadMediums();
    renderAll();
    renderParticipants();
    setPartMsg("Participante adicionado. (Ordenação será feita pelo banco/trigger.)");
  } catch (e) {
    console.error(e);
    setPartErr(e.message);
  }
}

/* ===========================
   EVENTS
=========================== */
$tabChamada?.addEventListener("click", () => tabSet("chamada"));
$tabParticipantes?.addEventListener("click", () => tabSet("participantes"));

$btnVerificar?.addEventListener("click", async () => {
  try {
    const iso = $dataChamada.value;
    if (!iso) return;
    currentDateISO = iso;
    showTop("Carregando chamada do dia...");
    showErr("");

    await loadChamadasForDate(iso);
    await loadRotacao();
    renderAll();

    showTop("Data carregada.");
  } catch (e) {
    console.error(e);
    showErr(`Erro ao verificar data: ${e.message}`);
  }
});

$btnSalvar?.addEventListener("click", salvarChamada);
$btnImprimirProxima?.addEventListener("click", imprimirProxima);

$btnRecarregarParticipantes?.addEventListener("click", () => {
  setPartMsg("Recarregando...");
  setPartErr("");
  renderParticipants();
  setPartMsg("OK.");
});

$partFiltroGrupo?.addEventListener("change", renderParticipants);
$partBusca?.addEventListener("input", renderParticipants);

$btnAdicionarParticipante?.addEventListener("click", addParticipant);

/* ===========================
   BOOT
=========================== */
async function boot() {
  $dataChamada.value = isoTodayLocal();
  currentDateISO = $dataChamada.value;

  setConnStatus(false, "Conectando...");
  showTop("");
  showErr("");

  const ok = await checkConnection();
  if (!ok) return;

  try {
    showTop("Carregando dados...");
    await loadMediums();
    await loadRotacao();
    await loadChamadasForDate(currentDateISO);
    renderAll();
    showTop("Pronto.");
  } catch (e) {
    console.error(e);
    showErr(`Falha ao iniciar: ${e.message}`);
  }
}

boot();
