/* =========================================================
   CHAMADA DE MÉDIUNS — FRONT DO ZERO (ESTÁVEL)
   ========================================================= */

let sb = null;

let mediums = [];
let rotacao = [];
let feriados = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setConn(text, ok = true) {
  const el = $("statusConn");
  el.textContent = text;
  el.style.borderColor = ok ? "rgba(32,209,122,.45)" : "rgba(255,75,75,.45)";
}

function setMsg(text) {
  $("statusMsg").textContent = text || "";
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

// Para não dar bug de fuso: força horário BR
function getDayBR(iso) {
  const d = new Date(`${iso}T03:00:00`);
  return d.getDay(); // 0 dom ... 2 ter
}

/* =========================
   LOADERS
   ========================= */

async function testarSelect() {
  const { error } = await sb.from("mediums").select("id").limit(1);
  if (error) throw error;
}

async function carregarMediums() {
  const { data, error } = await sb.from("mediums").select("*").order("name", { ascending: true });
  if (error) throw error;

  mediums = (data || []).map(m => ({
    ...m,
    name: String(m.name || "").trim(),
    active: m.active !== false
  }));
}

async function carregarRotacao() {
  const { data, error } = await sb.from("rotacao").select("*");
  if (error) throw error;
  rotacao = data || [];
}

async function carregarFeriados() {
  const { data, error } = await sb.from("feriados").select("*");
  if (error) throw error;
  feriados = data || [];
}

function isFeriado(iso) {
  return feriados.some(f => {
    const v = f.data || f.date || f.dia;
    return String(v || "").slice(0,10) === iso;
  });
}

/* =========================
   ROTAÇÃO (dirigente mesa/ps)
   ========================= */

function getRotRow(groupType) {
  return rotacao.find(r => r.group_type === groupType) || null;
}

function rotKeysForGroup(row) {
  const keys = Object.keys(row || {});
  const pick = (cands) => cands.find(k => keys.includes(k)) || null;

  // tenta várias possibilidades (pra não depender do schema exato)
  const mesaKey = pick(["last_mesa_id","last_medium_id","last_id","last"]);
  const psKey   = pick(["last_ps_id","last_psicografia_id","last_psico_id","last_ps","last_psicografia"]);

  return { mesaKey, psKey };
}

function nextFromRotation(list, lastId) {
  if (!list.length) return null;
  if (!lastId) return list[0].id;

  const idx = list.findIndex(m => m.id === lastId);
  if (idx === -1) return list[0].id;
  return list[(idx + 1) % list.length].id;
}

function computeNextDirigentes() {
  const dirigentes = mediums
    .filter(m => m.active)
    .filter(m => m.group_type === "dirigente")
    .sort((a,b)=> String(a.name).localeCompare(String(b.name), "pt-BR"));

  const rot = getRotRow("dirigente") || {};
  const { mesaKey, psKey } = rotKeysForGroup(rot);

  const lastMesa = mesaKey ? rot[mesaKey] : null;
  const lastPs   = psKey ? rot[psKey] : null;

  return {
    dirigentes,
    mesaKey,
    psKey,
    nextMesaId: nextFromRotation(dirigentes, lastMesa),
    nextPsId: nextFromRotation(dirigentes, lastPs),
  };
}

/* =========================
   UI: DATA
   ========================= */

async function verificarDataUI() {
  const iso = $("dataChamada").value;
  const aviso = $("avisoData");
  aviso.textContent = "";

  if (!iso) { aviso.textContent = "Selecione uma data."; return false; }
  if (getDayBR(iso) !== 2) { aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA."; return false; }

  try {
    await carregarFeriados();
  } catch (e) {
    aviso.textContent = "⚠️ Falha ao consultar feriados (verifique policy SELECT em feriados).";
    return true; // não bloqueia
  }

  if (isFeriado(iso)) { aviso.textContent = "❌ Hoje é feriado! Chamada não permitida."; return false; }

  aviso.textContent = "✅ Data válida.";
  return true;
}

/* =========================
   UI: RENDER
   ========================= */

function pctFalta(m) {
  const f = Number(m.faltas || 0);
  const p = Number(m.presencas || 0);
  const t = f + p;
  if (!t) return 0;
  return Math.round((f * 100) / t);
}

function makeRadio(name, value, label) {
  const id = `${name}_${value}_${Math.random().toString(16).slice(2)}`;
  return `
    <label class="r" for="${id}">
      <input id="${id}" type="radio" name="${name}" value="${value}">
      <span>${label}</span>
    </label>
  `;
}

function renderGrupo(divId, lista, opts) {
  const el = $(divId);

  if (!lista.length) {
    el.innerHTML = `<div class="item"><div class="item__left"><div class="muted">Nenhum médium neste grupo.</div></div></div>`;
    return;
  }

  const { groupType, nextMesaId, nextPsId } = opts;

  el.innerHTML = lista.map(m => {
    const p = pctFalta(m);
    const faltaAlta = p >= 30;

    let radios = "";
    if (groupType === "carencia") {
      radios += makeRadio(`st_${m.id}`, "P", "P");
      radios += makeRadio(`st_${m.id}`, "F", "F");
    } else if (groupType === "dirigente") {
      radios += makeRadio(`st_${m.id}`, "P", "P");
      radios += makeRadio(`st_${m.id}`, "M", "M");
      radios += makeRadio(`st_${m.id}`, "F", "F");
      radios += makeRadio(`st_${m.id}`, "PS", "PS");
    } else {
      radios += makeRadio(`st_${m.id}`, "P", "P");
      radios += makeRadio(`st_${m.id}`, "M", "M");
      radios += makeRadio(`st_${m.id}`, "F", "F");
    }

    let cls = "item";
    let tag = "";

    if (groupType === "dirigente") {
      const isMesa = m.id === nextMesaId;
      const isPs = m.id === nextPsId;

      if (isMesa && isPs) cls += " nextBoth";
      else if (isMesa) cls += " nextMesa";
      else if (isPs) cls += " nextPs";

      if (isMesa) tag += `<span class="tagNext">PRÓXIMO (MESA)</span>`;
      if (isPs) tag += `<span class="tagNext">PRÓXIMO (PS)</span>`;
    }

    return `
      <div class="${cls}">
        <div class="item__left">
          <div class="item__name">
            ${escapeHtml(m.name)}
            <span class="badge ${faltaAlta ? "badge--danger":""}">${p}% faltas</span>
          </div>
        </div>
        <div class="item__radios">${radios}</div>
        <div class="item__right">${tag}</div>
      </div>
    `;
  }).join("");
}

function renderChamada() {
  const ativos = mediums.filter(m => m.active);

  const { dirigentes, nextMesaId, nextPsId } = computeNextDirigentes();
  const incorporacao = ativos.filter(m => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter(m => m.group_type === "desenvolvimento");
  const carencia = ativos.filter(m => m.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes, { groupType: "dirigente", nextMesaId, nextPsId });
  renderGrupo("listaIncorporacao", incorporacao, { groupType: "incorporacao" });
  renderGrupo("listaDesenvolvimento", desenvolvimento, { groupType: "desenvolvimento" });
  renderGrupo("listaCarencia", carencia, { groupType: "carencia" });
}

/* =========================
   SALVAR CHAMADA
   ========================= */

function selectedStatusFor(id) {
  const el = document.querySelector(`input[name="st_${id}"]:checked`);
  return el ? el.value : null;
}

async function salvarChamada() {
  $("resultadoSalvar").textContent = "";

  const ok = await verificarDataUI();
  if (!ok) { $("resultadoSalvar").textContent = "Corrija a data antes de salvar."; return; }

  const iso = $("dataChamada").value;

  const registros = [];
  for (const m of mediums.filter(x => x.active)) {
    const st = selectedStatusFor(m.id);
    if (!st) continue;
    registros.push({ medium_id: m.id, data: iso, status: st });
  }

  if (!registros.length) { $("resultadoSalvar").textContent = "Nenhuma presença marcada."; return; }

  // 1) INSERT chamadas
  const { error: errIns } = await sb.from("chamadas").insert(registros);
  if (errIns) {
    $("resultadoSalvar").textContent = `❌ Erro ao salvar chamadas: ${errIns.message}`;
    return;
  }

  // 2) update presencas/faltas (PS conta como presença)
  for (const r of registros) {
    const m = mediums.find(x => x.id === r.medium_id);
    const pres = Number(m?.presencas || 0) + (r.status === "F" ? 0 : 1);
    const falt = Number(m?.faltas || 0) + (r.status === "F" ? 1 : 0);

    const { error: eUp } = await sb.from("mediums").update({ presencas: pres, faltas: falt }).eq("id", r.medium_id);
    if (eUp) {
      $("resultadoSalvar").textContent = `⚠️ Chamadas salvas, mas não consegui atualizar estatísticas (RLS): ${eUp.message}`;
      break;
    }
  }

  // 3) tentativa de atualizar rotação (se permitido)
  try {
    await carregarRotacao();
    const { mesaKey, psKey } = rotKeysForGroup(getRotRow("dirigente") || {});
    const rotRow = getRotRow("dirigente");

    let marcouMesaId = null;
    let marcouPsId = null;

    const idsDir = new Set(mediums.filter(m=>m.active && m.group_type==="dirigente").map(m=>m.id));
    for (const r of registros) {
      if (!idsDir.has(r.medium_id)) continue;
      if (r.status === "M") marcouMesaId = r.medium_id;
      if (r.status === "PS") marcouPsId = r.medium_id;
    }

    if (rotRow && (marcouMesaId || marcouPsId)) {
      const payload = {};
      if (mesaKey && marcouMesaId) payload[mesaKey] = marcouMesaId;
      if (psKey && marcouPsId) payload[psKey] = marcouPsId;

      if (Object.keys(payload).length) {
        const { error: eRot } = await sb.from("rotacao").update(payload).eq("group_type", "dirigente");
        if (eRot) {
          $("resultadoSalvar").textContent = `⚠️ Chamadas salvas, mas rotação não atualizou (RLS): ${eRot.message}`;
        }
      }
    }
  } catch {}

  await carregarTudo();
  $("resultadoSalvar").textContent = "✅ Chamada registrada!";
}

/* =========================
   PARTICIPANTES (admin)
   ========================= */

function groupLabel(g) {
  if (g === "dirigente") return "Dirigente";
  if (g === "incorporacao") return "Incorporação";
  if (g === "desenvolvimento") return "Desenvolvimento";
  if (g === "carencia") return "Carência";
  return g;
}

function renderAdminList() {
  const q = ($("busca").value || "").toLowerCase().trim();

  const list = mediums
    .slice()
    .sort((a,b)=> String(a.name).localeCompare(String(b.name), "pt-BR"))
    .filter(m => !q || String(m.name).toLowerCase().includes(q));

  const el = $("listaAdmin");
  el.innerHTML = list.map(m => `
    <div class="adminRow">
      <div>
        <div style="font-weight:950">${escapeHtml(m.name)}</div>
        <small>${groupLabel(m.group_type)}</small>
      </div>
      <div class="switch">
        <span>Ativo</span>
        <input type="checkbox" ${m.active ? "checked":""} data-act="${m.id}">
      </div>
      <div class="adminActions">
        <button class="btnMini" data-edit="${m.id}">Editar</button>
        <button class="btnMini btnMini--danger" data-del="${m.id}">Excluir</button>
      </div>
    </div>
  `).join("");

  el.querySelectorAll("input[data-act]").forEach(chk => {
    chk.addEventListener("change", async (e) => {
      const id = e.target.getAttribute("data-act");
      const active = e.target.checked;
      await updateMedium(id, { active });
    });
  });

  el.querySelectorAll("button[data-edit]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-edit");
      await editarMediumPrompt(id);
    });
  });

  el.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-del");
      if (!confirm("Excluir este participante?")) return;
      await deleteMedium(id);
    });
  });
}

async function updateMedium(id, patch) {
  $("msgAdmin").textContent = "";
  try {
    const { error } = await sb.from("mediums").update(patch).eq("id", id);
    if (error) throw error;
    await carregarTudo();
    $("msgAdmin").textContent = "✅ Atualizado.";
  } catch (e) {
    $("msgAdmin").textContent = `❌ Sem permissão (RLS) ou erro: ${e.message}`;
  }
}

async function deleteMedium(id) {
  $("msgAdmin").textContent = "";
  try {
    const { error } = await sb.from("mediums").delete().eq("id", id);
    if (error) throw error;
    await carregarTudo();
    $("msgAdmin").textContent = "✅ Excluído.";
  } catch (e) {
    $("msgAdmin").textContent = `❌ Sem permissão (RLS) ou erro: ${e.message}`;
  }
}

async function editarMediumPrompt(id) {
  const m = mediums.find(x => x.id === id);
  if (!m) return;

  const novoNome = prompt("Nome:", m.name);
  if (novoNome === null) return;

  const novoGrupo = prompt("Grupo (dirigente/incorporacao/desenvolvimento/carencia):", m.group_type);
  if (novoGrupo === null) return;

  await updateMedium(id, { name: novoNome.trim(), group_type: novoGrupo.trim() });
}

async function adicionarParticipante() {
  $("msgAdmin").textContent = "";

  const name = ($("novoNome").value || "").trim();
  const group_type = $("novoGrupo").value;

  if (!name) { $("msgAdmin").textContent = "Informe o nome."; return; }

  try {
    const payload = { name, group_type, active: true, faltas: 0, presencas: 0 };
    const { error } = await sb.from("mediums").insert(payload);
    if (error) throw error;

    $("novoNome").value = "";
    await carregarTudo();
    $("msgAdmin").textContent = "✅ Adicionado.";
  } catch (e) {
    $("msgAdmin").textContent = `❌ Sem permissão (RLS) ou erro: ${e.message}`;
  }
}

/* =========================
   ABAS + BOOT
   ========================= */

function showTab(which) {
  const isChamada = which === "chamada";
  $("abaChamada").classList.toggle("hidden", !isChamada);
  $("abaParticipantes").classList.toggle("hidden", isChamada);
  $("btnTabChamada").classList.toggle("chip--active", isChamada);
  $("btnTabParticipantes").classList.toggle("chip--active", !isChamada);
}

async function carregarTudo() {
  setConn("Carregando…", true);
  setMsg("");

  await carregarMediums();
  await carregarRotacao();

  renderChamada();
  renderAdminList();

  // informa modo admin (se RLS bloquear)
  $("statusAdmin").textContent =
    "Se ações de editar/adicionar/excluir derem erro, é porque o banco está com RLS permitindo só SELECT para anon.";

  setConn("Conectado ✅", true);
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (!window.supabase || !window.supabase.createClient) {
      setConn("❌ supabase-js não carregou", false);
      setMsg("Verifique o script do supabase-js no index.html (deve vir antes do app.js).");
      return;
    }

    const URL = window.__SUPABASE_URL__;
    const KEY = window.__SUPABASE_ANON_KEY__;
    sb = window.supabase.createClient(URL, KEY);

    $("dataChamada").value = todayISO();
    $("btnVerificarData").addEventListener("click", verificarDataUI);
    $("btnSalvar").addEventListener("click", salvarChamada);

    $("btnTabChamada").addEventListener("click", () => showTab("chamada"));
    $("btnTabParticipantes").addEventListener("click", () => showTab("participantes"));

    $("busca").addEventListener("input", renderAdminList);
    $("btnAdicionar").addEventListener("click", adicionarParticipante);

    setConn("Testando conexão…", true);
    await testarSelect();

    await carregarTudo();
  } catch (e) {
    setConn("❌ Erro ao conectar", false);
    setMsg(e?.message || String(e));
    console.error(e);
  }
});