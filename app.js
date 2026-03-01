/* app.js — compatível com index.html (2026-02-07-a)
   MODO MANUAL:
   - Salvar chamada: grava statuses do dia, NÃO altera tabela rotacao
   - “Próximos”: apenas exibe o que está salvo em rotacao
*/

(function () {
  // ====== CONFIG SUPABASE (usa globals que você já tem no projeto) ======
  const SUPABASE_URL = window.__SUPABASE_URL__;
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;

  // Se o supabase lib não estiver carregado, vai dar erro aqui.
  // (Seu projeto provavelmente já carrega via CDN em outro lugar.)
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ====== DOM helpers ======
  const $ = (id) => document.getElementById(id);

  function setStatus(text, ok = true) {
    const statusText = $("statusText");
    const statusPill = $("statusPill");
    if (statusText) statusText.textContent = text;

    if (statusPill) {
      statusPill.classList.toggle("ok", !!ok);
      statusPill.classList.toggle("bad", !ok);
    }
  }

  function setMsg(okText = "", errText = "") {
    const ok = $("msgTopo");
    const err = $("msgErro");
    if (ok) ok.textContent = okText || "";
    if (err) err.textContent = errText || "";
    if (okText) console.log("[OK]", okText);
    if (errText) console.error("[ERRO]", errText);
  }

  function isoTodayLocal() {
    // yyyy-mm-dd no fuso local
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // ====== Estado ======
  const state = {
    date: isoTodayLocal(),
    // mediums
    mediums: [],
    mediumsById: new Map(),
    // chamadas do dia
    chamadasByMediumId: new Map(), // medium_id -> row
    // rotacao: group_type -> last_medium_id
    rotacaoByGroup: new Map(),
  };

  // ====== Loaders ======
  async function loadMediums() {
    // IMPORTANTE: sua trigger reordena por nome, mas aqui garantimos também
    const { data, error } = await sb.from("mediums").select("*").order("name", { ascending: true });
    if (error) throw error;
    state.mediums = data || [];
    state.mediumsById = new Map(state.mediums.map((m) => [m.id, m]));
  }

  async function loadChamadas(date) {
    const { data, error } = await sb.from("chamadas").select("*").eq("data", date);
    if (error) throw error;
    const rows = data || [];
    state.chamadasByMediumId = new Map(rows.map((r) => [r.medium_id, r]));
  }

  async function loadRotacao() {
    const { data, error } = await sb.from("rotacao").select("*");
    if (error) throw error;
    const rows = data || [];
    state.rotacaoByGroup = new Map(rows.map((r) => [r.group_type, r.last_medium_id]));
  }

  // ====== Regras de exibição ======
  function getStatusForMedium(mediumId) {
    const row = state.chamadasByMediumId.get(mediumId);
    return row?.status || "P"; // padrão P se não existir ainda no dia
  }

  function getMediumName(id) {
    const m = state.mediumsById.get(id);
    return m ? m.name : "—";
  }

  function isMesaCandidate(m) {
    // Se sua tabela tiver esses campos, ótimo.
    // Se não tiver, não quebra (undefined vira false).
    return !!m.pode_mesa || !!m.mesa || !!m.can_mesa;
  }

  function isPsicoCandidate(m) {
    return !!m.pode_psicografar || !!m.psico || !!m.can_psico;
  }

  // ====== Render ======
  function renderProximos() {
    // Seus group_type conforme você já usa:
    // mesa_dirigente / psicografia / mesa_incorporacao / mesa_desenvolvimento
    const mesaDirId = state.rotacaoByGroup.get("mesa_dirigente");
    const psicoId = state.rotacaoByGroup.get("psicografia");
    const mesaIncId = state.rotacaoByGroup.get("mesa_incorporacao");
    const mesaDevId = state.rotacaoByGroup.get("mesa_desenvolvimento");

    $("nextMesaDirigenteName").textContent = mesaDirId ? getMediumName(mesaDirId) : "—";
    $("nextPsicoDirigenteName").textContent = psicoId ? getMediumName(psicoId) : "—";
    $("nextMesaIncorpName").textContent = mesaIncId ? getMediumName(mesaIncId) : "—";
    $("nextMesaDesenvName").textContent = mesaDevId ? getMediumName(mesaDevId) : "—";
  }

  function computeResumo() {
    // Conta no dia atual por status
    let P = 0, M = 0, F = 0, PS = 0;

    for (const m of state.mediums) {
      if (m.ativo === false || m.is_active === false) continue; // se tiver campo de ativo
      const st = getStatusForMedium(m.id);
      if (st === "P") P++;
      else if (st === "M") M++;
      else if (st === "F") F++;
      else if (st === "PS") PS++;
    }

    const denom = (P + M + F); // regra sua: % presença = (P+M)/(P+M+F)
    const pres = denom > 0 ? Math.round(((P + M) / denom) * 100) : 0;
    const falt = denom > 0 ? Math.round((F / denom) * 100) : 0;

    return { P, M, F, PS, pres, falt };
  }

  function renderResumo() {
    const r = computeResumo();
    $("resumoGeral").textContent = `P:${r.P} M:${r.M} F:${r.F} PS:${r.PS} | Presença:${r.pres}% | Faltas:${r.falt}%`;

    // Reservas da mesa: quem está com status M no dia
    const reservas = [];
    for (const m of state.mediums) {
      const st = getStatusForMedium(m.id);
      if (st === "M") reservas.push(m.name);
    }
    $("reservasMesa").textContent = reservas.length ? reservas.join(" • ") : "—";
  }

  function statusButton(label, isActive, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "miniBtn" + (isActive ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderList(containerId, group) {
    const root = $(containerId);
    root.innerHTML = "";

    // Filtra por grupo e (se existir) ativo=true
    const items = state.mediums
      .filter((m) => (m.group_type || m.grupo || m.group) === group)
      .filter((m) => (m.ativo === undefined && m.is_active === undefined) ? true : (m.ativo !== false && m.is_active !== false))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));

    for (const m of items) {
      const st = getStatusForMedium(m.id);

      const card = document.createElement("div");
      card.className = "rowCard";

      const left = document.createElement("div");
      left.className = "rowLeft";

      const title = document.createElement("div");
      title.className = "rowTitle";
      title.textContent = m.name;

      const sub = document.createElement("div");
      sub.className = "rowSub";
      // Mostra “Pode mesa/psico” se existir
      const mesaTxt = isMesaCandidate(m) ? "Mesa: Sim" : "Mesa: Não";
      const psicoTxt = isPsicoCandidate(m) ? "Psico: Sim" : "Psico: Não";
      sub.textContent = `${mesaTxt} | ${psicoTxt}`;

      left.appendChild(title);
      left.appendChild(sub);

      const right = document.createElement("div");
      right.className = "rowRight";

      // Botões de status (P/M/F e PS só para dirigente)
      const btnP = statusButton("P", st === "P", () => setLocalStatus(m.id, "P"));
      const btnM = statusButton("M", st === "M", () => setLocalStatus(m.id, "M"));
      const btnF = statusButton("F", st === "F", () => setLocalStatus(m.id, "F"));
      right.appendChild(btnP);
      right.appendChild(btnM);
      right.appendChild(btnF);

      if (group === "dirigente") {
        const btnPS = statusButton("PS", st === "PS", () => setLocalStatus(m.id, "PS"));
        right.appendChild(btnPS);
      }

      card.appendChild(left);
      card.appendChild(right);
      root.appendChild(card);
    }
  }

  function renderAllLists() {
    renderList("listaDirigentes", "dirigente");
    renderList("listaIncorporacao", "incorporacao");
    renderList("listaDesenvolvimento", "desenvolvimento");
    renderList("listaCarencia", "carencia");
  }

  // ====== Edição local de status (só em memória até salvar) ======
  function setLocalStatus(mediumId, status) {
    const existing = state.chamadasByMediumId.get(mediumId);
    if (existing) {
      existing.status = status;
    } else {
      state.chamadasByMediumId.set(mediumId, {
        data: state.date,
        medium_id: mediumId,
        status,
        is_ultimo_mesa: false,
      });
    }
    renderResumo();
    renderAllLists();
  }

  // ====== Ações ======
  async function verificarData() {
    setMsg("", "");
    try {
      const d = $("dataChamada").value;
      if (!d) {
        setMsg("", "Selecione uma data.");
        return;
      }
      state.date = d;
      await loadChamadas(state.date);
      renderProximos();
      renderResumo();
      renderAllLists();
      setMsg(`Data verificada: ${state.date}`, "");
    } catch (e) {
      setMsg("", `Erro ao verificar data: ${e.message || e}`);
    }
  }

  async function salvarChamada() {
    setMsg("", "");
    try {
      const date = state.date;

      // Gera rows apenas para participantes ativos e presentes na listagem de mediums
      const rows = state.mediums.map((m) => {
        const st = getStatusForMedium(m.id);
        return {
          data: date,
          medium_id: m.id,
          status: st,
          is_ultimo_mesa: false, // no modo manual você não usa isso pra rotacionar
        };
      });

      const { error } = await sb.from("chamadas").upsert(rows, { onConflict: "data,medium_id" });
      if (error) throw error;

      setMsg("Chamada salva. (Modo manual: próximos NÃO foram alterados.)", "");
    } catch (e) {
      setMsg("", `Erro ao salvar chamada: ${e.message || e}`);
    }
  }

  function imprimirProxima() {
    // Sem inventar layout. Só chama o print do navegador.
    window.print();
  }

  // ====== Tabs ======
  function setupTabs() {
    const tabChamada = $("tabChamada");
    const tabParticipantes = $("tabParticipantes");
    const viewChamada = $("viewChamada");
    const viewParticipantes = $("viewParticipantes");

    tabChamada.addEventListener("click", () => {
      tabChamada.classList.add("active");
      tabParticipantes.classList.remove("active");
      viewChamada.style.display = "";
      viewParticipantes.style.display = "none";
    });

    tabParticipantes.addEventListener("click", () => {
      tabParticipantes.classList.add("active");
      tabChamada.classList.remove("active");
      viewParticipantes.style.display = "";
      viewChamada.style.display = "none";
    });
  }

  // ====== Init ======
  async function init() {
    try {
      setStatus("Conectando...", true);
      setMsg("", "");

      setupTabs();

      // default date
      $("dataChamada").value = state.date;

      // eventos
      $("btnVerificar").addEventListener("click", verificarData);
      $("btnSalvar").addEventListener("click", salvarChamada);
      $("btnImprimirProxima").addEventListener("click", imprimirProxima);

      // carrega tudo
      await loadMediums();
      await loadChamadas(state.date);
      await loadRotacao();

      // render
      renderProximos();
      renderResumo();
      renderAllLists();

      setStatus("Conectado", true);
      setMsg("Supabase OK. Pronto.", "");
    } catch (e) {
      setStatus("Erro", false);
      setMsg("", `Falha ao iniciar: ${e.message || e}`);
    }
  }

  init();
})();
