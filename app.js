/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

/** ✅ COLE AQUI (APENAS ANON PUBLIC KEY) */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ====== Helpers DOM ====== */
const $ = (id) => document.getElementById(id);

/** ====== Tabs ====== */
const tabChamada = $("tabChamada");
const tabParticipantes = $("tabParticipantes");
const viewChamada = $("viewChamada");
const viewParticipantes = $("viewParticipantes");

/** ====== CHAMADA: IDs UI ====== */
const elStatusPill = $("statusPill");
const elStatusText = $("statusText");
const elMsgTopo = $("msgTopo");
const elMsgErro = $("msgErro");
const elData = $("dataChamada");
const btnVerificar = $("btnVerificar");
const btnSalvar = $("btnSalvar");

const listaDirigentes = $("listaDirigentes");
const listaIncorporacao = $("listaIncorporacao");
const listaDesenvolvimento = $("listaDesenvolvimento");
const listaCarencia = $("listaCarencia");

const elResumoGeral = $("resumoGeral");
const elReservasMesa = $("reservasMesa");

/** ====== PARTICIPANTES: IDs UI ====== */
const partFiltroGrupo = $("partFiltroGrupo");
const partBusca = $("partBusca");
const btnRecarregarParticipantes = $("btnRecarregarParticipantes");
const listaParticipantes = $("listaParticipantes");

const novoNome = $("novoNome");
const novoGrupo = $("novoGrupo");
const novoAtivo = $("novoAtivo");
const novoMesa = $("novoMesa");
const novoPsico = $("novoPsico");

const btnAdicionarParticipante = $("btnAdicionarParticipante");
const partMsg = $("partMsg");
const partErr = $("partErr");

/** ====== Estado ====== */
let feriadosSet = new Set(); // YYYY-MM-DD
let mediumsAll = [];         // todos ativos/inativos (para participantes), e também usados na chamada (filtrando active=true)
let chamadasMap = new Map(); // medium_id -> status (P/M/F/PS/"")
let rotacao = { mesa: null, psicografia: null }; // last_medium_id

let nextMesaId = null;
let nextPsicoId = null;

let currentDateISO = null;

/** ====== UI utils ====== */
function setOk(msg = "Pronto") {
  elMsgErro.textContent = "";
  elMsgTopo.textContent = msg;
}
function setErro(msg) {
  elMsgErro.textContent = msg;
}
function setConn(ok, msg) {
  if (ok) {
    elStatusPill.classList.add("ok");
    elStatusPill.classList.remove("bad");
    elStatusText.textContent = msg || "Supabase OK";
  } else {
    elStatusPill.classList.add("bad");
    elStatusPill.classList.remove("ok");
    elStatusText.textContent = msg || "Sem conexão";
  }
}

function pOk(msg) {
  partErr.textContent = "";
  partMsg.textContent = msg || "";
}
function pErr(msg) {
  partMsg.textContent = "";
  partErr.textContent = msg || "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function parseBRtoISO(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}
function isTuesday(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.getDay() === 2;
}
function formatISOtoBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** ====== Supabase REST ====== */
function headersJson() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: headersJson() });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
  return r.json();
}

async function sbPost(table, rows, prefer = "return=representation") {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headersJson(), Prefer: prefer },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
  return r.json().catch(() => []);
}

async function sbPatch(table, whereQS, body) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${whereQS}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...headersJson(), Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

async function sbDelete(table, whereQS) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${whereQS}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { ...headersJson(), Prefer: "return=minimal" },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

async function sbUpsertChamadas(rows) {
  const url = `${SUPABASE_URL}/rest/v1/chamadas?on_conflict=medium_id,data`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      ...headersJson(),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

async function sbPatchRotacao(group_type, last_medium_id) {
  const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.${encodeURIComponent(group_type)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...headersJson(), Prefer: "return=minimal" },
    body: JSON.stringify({ last_medium_id, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${t}`);
  }
}

/** ====== Cargas ====== */
async function loadBase() {
  const fer = await sbGet(`feriados?select=data`);
  feriadosSet = new Set(fer.map((x) => x.data));

  // para PARTICIPANTES precisamos de todos (ativos e inativos)
  const meds = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );
  mediumsAll = meds;

  const rot = await sbGet(`rotacao?select=group_type,last_medium_id`);
  rotacao = { mesa: null, psicografia: null };
  for (const r of rot) {
    if (r.group_type === "mesa") rotacao.mesa = r.last_medium_id || null;
    if (r.group_type === "psicografia") rotacao.psicografia = r.last_medium_id || null;
  }
}

async function loadChamadasForDate(iso) {
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  chamadasMap = new Map(rows.map((r) => [r.medium_id, (r.status || "").toUpperCase()]));
}

/** ====== Rotação ====== */
function computeNextFromRotation(groupKey) {
  const eligible = mediumsAll
    .filter((m) => m.active === true && m.group_type === "dirigente")
    .filter((m) => (groupKey === "mesa" ? Number(m.mesa) === 1 : Number(m.psicografia) === 1))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

  if (eligible.length === 0) return null;

  const lastId = rotacao[groupKey];
  const idx = eligible.findIndex((x) => x.id === lastId);
  if (idx === -1) return eligible[0].id;

  return eligible[(idx + 1) % eligible.length].id;
}

function recomputeRotationBadges() {
  nextMesaId = computeNextFromRotation("mesa");
  nextPsicoId = computeNextFromRotation("psicografia");
}

/** ====== Render CHAMADA ====== */
function buildStatusOptions(medium) {
  const base = ["P", "M", "F"];
  if (medium.group_type === "dirigente") base.push("PS");
  return base;
}

function makeRowChamada(m) {
  const current = chamadasMap.get(m.id) || "";

  const wrap = document.createElement("div");
  wrap.className = "itemRow";

  if (m.group_type === "dirigente") {
    if (m.id === nextMesaId) wrap.classList.add("nextMesa");
    if (m.id === nextPsicoId) wrap.classList.add("nextPsico");
  }

  const left = document.createElement("div");
  left.className = "itemLeft";

  const title = document.createElement("div");
  title.className = "itemName";
  title.textContent = m.name || "(sem nome)";

  const meta = document.createElement("div");
  meta.className = "itemMeta";

  const pres = Number(m.presencas || 0);
  const falt = Number(m.faltas || 0);
  const denom = pres + falt;
  const presPct = denom === 0 ? 0 : Math.round((pres / denom) * 100);
  const faltPct = denom === 0 ? 0 : Math.round((falt / denom) * 100);

  meta.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  const badges = document.createElement("div");
  badges.className = "badges";

  if (m.group_type === "dirigente" && m.id === nextMesaId) {
    const b = document.createElement("span");
    b.className = "badge badgeMesa";
    b.textContent = "Mesa (próximo)";
    badges.appendChild(b);
  }
  if (m.group_type === "dirigente" && m.id === nextPsicoId) {
    const b = document.createElement("span");
    b.className = "badge badgePsico";
    b.textContent = "Psicografia (próximo)";
    badges.appendChild(b);
  }

  left.appendChild(title);
  left.appendChild(meta);
  left.appendChild(badges);

  const right = document.createElement("div");
  right.className = "itemRight";

  const opts = buildStatusOptions(m);
  const radios = document.createElement("div");
  radios.className = "radioGroup";

  for (const s of opts) {
    const id = `r_${m.id}_${s}`;

    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = `st_${m.id}`;
    inp.id = id;
    inp.value = s;
    inp.checked = current === s;

    const lbl = document.createElement("label");
    lbl.className = "radioLbl";
    lbl.setAttribute("for", id);

    const dot = document.createElement("span");
    dot.className = "dot";

    const txt = document.createElement("span");
    txt.className = "radioTxt";
    txt.textContent = s;

    lbl.appendChild(dot);
    lbl.appendChild(txt);

    inp.addEventListener("change", async () => {
      chamadasMap.set(m.id, s);
      renderResumo();
      try {
        await sbUpsertChamadas([{ medium_id: m.id, data: currentDateISO, status: s }]);
        setOk("Salvo.");
      } catch (e) {
        setErro("Erro ao salvar marcação: " + e.message);
      }
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  const btn = document.createElement("button");
  btn.className = "btnSmall";
  btn.textContent = "Limpar";
  btn.addEventListener("click", async () => {
    chamadasMap.set(m.id, "");
    renderChamada(); // re-render para limpar radios
    try {
      await sbUpsertChamadas([{ medium_id: m.id, data: currentDateISO, status: "" }]);
      setOk("Limpo.");
    } catch (e) {
      setErro("Erro ao limpar: " + e.message);
    }
  });

  right.appendChild(radios);
  right.appendChild(btn);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function clearChamadaLists() {
  listaDirigentes.innerHTML = "";
  listaIncorporacao.innerHTML = "";
  listaDesenvolvimento.innerHTML = "";
  listaCarencia.innerHTML = "";
}

function renderChamada() {
  clearChamadaLists();
  recomputeRotationBadges();

  const activeOnly = mediumsAll.filter((m) => m.active === true);

  const grupos = {
    dirigente: listaDirigentes,
    incorporacao: listaIncorporacao,
    desenvolvimento: listaDesenvolvimento,
    carencia: listaCarencia,
  };

  for (const m of activeOnly) {
    const target = grupos[m.group_type];
    if (!target) continue;
    target.appendChild(makeRowChamada(m));
  }

  renderResumo();
}

function renderResumo() {
  let p = 0, m = 0, f = 0, ps = 0;
  const reservas = [];

  const activeOnly = mediumsAll.filter((x) => x.active === true);

  for (const med of activeOnly) {
    const st = (chamadasMap.get(med.id) || "").toUpperCase();
    if (st === "P") p++;
    if (st === "M") { m++; reservas.push(med.name); }
    if (st === "F") f++;
    if (st === "PS") ps++;
  }

  const presencaPct = (p + m + f) === 0 ? 0 : Math.round(((p + m) / (p + m + f)) * 100);
  const faltasPct = (p + m + f) === 0 ? 0 : Math.round((f / (p + m + f)) * 100);

  elResumoGeral.textContent = `P:${p} M:${m} F:${f} PS:${ps} | Presença:${presencaPct}% | Faltas:${faltasPct}%`;
  elReservasMesa.textContent = reservas.length ? reservas.join(", ") : "—";
}

/** ====== CHAMADA: eventos ====== */
async function onVerificar() {
  setErro("");
  const val = elData.value;

  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) iso = val;
  else iso = parseBRtoISO(val);

  if (!iso) return setErro("Data inválida. Use dd/mm/aaaa ou selecione no calendário.");
  if (!isTuesday(iso)) return setErro("Essa data não é terça-feira.");
  if (feriadosSet.has(iso)) return setErro("Essa data está marcada como feriado.");

  currentDateISO = iso;
  setOk(`Data válida: ${formatISOtoBR(iso)}`);

  await loadChamadasForDate(iso);
  renderChamada();
}

async function onSalvarTudo() {
  if (!currentDateISO) return setErro("Selecione uma data e clique em Verificar data.");

  try {
    const activeOnly = mediumsAll.filter((m) => m.active === true);
    const rows = activeOnly.map((med) => ({
      medium_id: med.id,
      data: currentDateISO,
      status: (chamadasMap.get(med.id) || ""),
    }));
    await sbUpsertChamadas(rows);
    setOk("Chamada salva.");
  } catch (e) {
    setErro("Erro ao salvar chamada: " + e.message);
  }
}

/** ====== PARTICIPANTES: render ====== */
function groupLabel(gt) {
  if (gt === "dirigente") return "Dirigente";
  if (gt === "incorporacao") return "Incorporação";
  if (gt === "desenvolvimento") return "Desenvolvimento";
  if (gt === "carencia") return "Carência";
  return gt || "—";
}

function matchesFilter(m) {
  const g = (partFiltroGrupo.value || "").trim();
  const q = (partBusca.value || "").trim().toLowerCase();

  if (g && m.group_type !== g) return false;
  if (q && !(m.name || "").toLowerCase().includes(q)) return false;
  return true;
}

function makeRowParticipante(m) {
  const wrap = document.createElement("div");
  wrap.className = "partRow";

  const left = document.createElement("div");
  left.className = "partLeft";

  const title = document.createElement("div");
  title.className = "partName";
  title.textContent = m.name || "(sem nome)";

  const meta = document.createElement("div");
  meta.className = "partMeta";
  meta.textContent = `${groupLabel(m.group_type)} • ${m.active ? "Ativo" : "Inativo"} • Mesa:${Number(m.mesa) === 1 ? "Sim" : "Não"} • Psicografia:${Number(m.psicografia) === 1 ? "Sim" : "Não"}`;

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "partRight";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btnSmall";
  btnEdit.textContent = "Editar";

  const btnDel = document.createElement("button");
  btnDel.className = "btnSmall danger";
  btnDel.textContent = "Excluir";

  btnEdit.addEventListener("click", () => openEditor(m));
  btnDel.addEventListener("click", async () => {
    if (!confirm(`Excluir "${m.name}"?`)) return;
    try {
      await sbDelete("mediums", `id=eq.${m.id}`);
      pOk("Excluído.");
      await reloadParticipants();
      // também recarrega a chamada (caso esteja na aba)
      if (currentDateISO) {
        await loadChamadasForDate(currentDateISO);
      }
      renderChamada();
    } catch (e) {
      pErr("Erro ao excluir: " + e.message);
    }
  });

  right.appendChild(btnEdit);
  right.appendChild(btnDel);

  wrap.appendChild(left);
  wrap.appendChild(right);

  return wrap;
}

function openEditor(m) {
  // modal simples inline
  const modal = document.createElement("div");
  modal.className = "modalBackdrop";

  const box = document.createElement("div");
  box.className = "modalBox";

  box.innerHTML = `
    <div class="modalTitle">Editar participante</div>
    <div class="grid2">
      <div>
        <label class="label">Nome</label>
        <input id="edNome" class="input" value="${(m.name || "").replace(/"/g, "&quot;")}" />
      </div>
      <div>
        <label class="label">Grupo</label>
        <select id="edGrupo" class="input">
          <option value="dirigente">Dirigente</option>
          <option value="incorporacao">Incorporação</option>
          <option value="desenvolvimento">Desenvolvimento</option>
          <option value="carencia">Carência</option>
        </select>
      </div>
    </div>

    <div class="checks" style="margin-top:10px;">
      <label class="check"><input id="edAtivo" type="checkbox" /> <span>Ativo</span></label>
      <label class="check"><input id="edMesa" type="checkbox" /> <span>Habilita Mesa (amarelo)</span></label>
      <label class="check"><input id="edPsico" type="checkbox" /> <span>Habilita Psicografia (vermelho)</span></label>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button id="btnSalvarEd" class="btn primary" type="button">Salvar</button>
      <button id="btnCancelarEd" class="btn" type="button">Cancelar</button>
    </div>
    <div id="edErr" class="msgErr"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const edNome = box.querySelector("#edNome");
  const edGrupo = box.querySelector("#edGrupo");
  const edAtivo = box.querySelector("#edAtivo");
  const edMesa = box.querySelector("#edMesa");
  const edPsico = box.querySelector("#edPsico");
  const edErr = box.querySelector("#edErr");

  edGrupo.value = m.group_type || "incorporacao";
  edAtivo.checked = !!m.active;
  edMesa.checked = Number(m.mesa) === 1;
  edPsico.checked = Number(m.psicografia) === 1;

  // regra: mesa/psicografia só faz sentido em dirigente, mas deixo editar e o código da rotação só usa dirigentes
  box.querySelector("#btnCancelarEd").addEventListener("click", () => modal.remove());

  box.querySelector("#btnSalvarEd").addEventListener("click", async () => {
    edErr.textContent = "";
    const name = (edNome.value || "").trim();
    const group_type = edGrupo.value;
    if (!name) {
      edErr.textContent = "Nome é obrigatório.";
      return;
    }
    try {
      await sbPatch("mediums", `id=eq.${m.id}`, {
        name,
        group_type,
        active: edAtivo.checked,
        mesa: edMesa.checked ? 1 : 0,
        psicografia: edPsico.checked ? 1 : 0,
        updated_at: new Date().toISOString(),
      });

      pOk("Atualizado.");
      modal.remove();

      await reloadParticipants();
      // recarrega base para chamada/rotação
      await loadBase();
      if (currentDateISO) await loadChamadasForDate(currentDateISO);
      renderChamada();
    } catch (e) {
      edErr.textContent = "Erro ao salvar: " + e.message;
    }
  });
}

function renderParticipants() {
  listaParticipantes.innerHTML = "";

  const filtered = mediumsAll.filter(matchesFilter);
  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nenhum participante encontrado.";
    listaParticipantes.appendChild(empty);
    return;
  }

  for (const m of filtered) {
    listaParticipantes.appendChild(makeRowParticipante(m));
  }
}

async function reloadParticipants() {
  // recarrega mediumsAll completo
  const meds = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );
  mediumsAll = meds;
  renderParticipants();
}

/** ====== PARTICIPANTES: adicionar ====== */
async function onAdicionarParticipante() {
  pErr("");
  pOk("");

  const name = (novoNome.value || "").trim();
  const group_type = novoGrupo.value;
  if (!name) return pErr("Informe o nome.");

  const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());

  const row = {
    id,
    name,
    group_type,
    active: !!novoAtivo.checked,
    mesa: novoMesa.checked ? 1 : 0,
    psicografia: novoPsico.checked ? 1 : 0,
    faltas: 0,
    presencas: 0,
    carencia_total: null,
    carencia_atual: null,
    primeira_incorporacao: false,
    inserted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await sbPost("mediums", [row], "return=minimal");
    pOk("Participante adicionado.");

    // limpa form
    novoNome.value = "";
    novoMesa.checked = false;
    novoPsico.checked = false;
    novoAtivo.checked = true;
    novoGrupo.value = "dirigente";

    // recarrega tudo (inclusive chamada/rotação)
    await loadBase();
    await reloadParticipants();
    if (currentDateISO) await loadChamadasForDate(currentDateISO);
    renderChamada();
  } catch (e) {
    pErr("Erro ao adicionar: " + e.message);
  }
}

/** ====== Tabs ====== */
function showTab(which) {
  const isChamada = which === "chamada";
  viewChamada.style.display = isChamada ? "" : "none";
  viewParticipantes.style.display = isChamada ? "none" : "";

  tabChamada.classList.toggle("active", isChamada);
  tabParticipantes.classList.toggle("active", !isChamada);

  if (!isChamada) {
    // sempre que entrar, renderiza participantes
    renderParticipants();
  }
}

/** ====== Boot ====== */
(async function init() {
  try {
    setConn(false, "Conectando...");
    await loadBase();
    setConn(true, "Supabase OK");
    setOk("Selecione a data e clique em “Verificar data”.");

    // participantes
    renderParticipants();
  } catch (e) {
    setConn(false, "Erro");
    setErro("Falha ao conectar no Supabase: " + e.message);
    pErr("Falha ao conectar no Supabase: " + e.message);
  }

  // eventos chamada
  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvarTudo);

  // eventos tabs
  tabChamada.addEventListener("click", () => showTab("chamada"));
  tabParticipantes.addEventListener("click", () => showTab("participantes"));

  // eventos participantes
  btnRecarregarParticipantes.addEventListener("click", async () => {
    try {
      pOk("Recarregando...");
      await reloadParticipants();
      pOk("Ok.");
    } catch (e) {
      pErr("Erro: " + e.message);
    }
  });

  partFiltroGrupo.addEventListener("change", renderParticipants);
  partBusca.addEventListener("input", renderParticipants);
  btnAdicionarParticipante.addEventListener("click", onAdicionarParticipante);
})();

