(() => {
  // ==========================
  // CONFIG (COLE AQUI)
  // ==========================
  const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

  // Valores esperados em mediuns.group_type
  const GROUPS = [
    { key: "dirigentes", el: "list_dirigentes", label: "Dirigentes", allowM: true },
    { key: "incorporacao", el: "list_incorporacao", label: "Incorporação", allowM: true },
    { key: "desenvolvimento", el: "list_desenvolvimento", label: "Desenvolvimento", allowM: true },
    { key: "carencia", el: "list_carencia", label: "Carência", allowM: false }, // só P/F
  ];

  const TIMEOUT_MS = 12000;

  // ==========================
  // DOM
  // ==========================
  const $ = (id) => document.getElementById(id);
  const dotConn = $("dotConn");
  const txtConn = $("txtConn");
  const msg = $("msg");
  const dt = $("dt");
  const btnVerificar = $("btnVerificar");
  const btnSalvar = $("btnSalvar");

  // ==========================
  // STATE
  // ==========================
  let sb = null;
  let currentDate = "";
  // statusState[medium_id] = "P"|"M"|"F"|"" (vazio = não marcado)
  const statusState = new Map();
  // mediumsByGroup[key] = [{id,name}]
  const mediumsByGroup = new Map();

  // ==========================
  // UTILS
  // ==========================
  function setConn(state, text) {
    // state: "idle" | "ok" | "err" | "wait"
    dotConn.classList.remove("ok", "err");
    if (state === "ok") dotConn.classList.add("ok");
    if (state === "err") dotConn.classList.add("err");
    txtConn.textContent = text;
  }

  function setMsg(text, isErr = false) {
    msg.style.color = isErr ? "var(--red)" : "var(--muted)";
    msg.textContent = text;
  }

  async function withTimeout(promise, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`Timeout (${label})`)), TIMEOUT_MS);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(t);
    }
  }

  function assertConfig() {
    if (!SUPABASE_URL || SUPABASE_URL.includes("COLE_AQUI")) {
      throw new Error("Falta SUPABASE_URL no app.js");
    }
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("COLE_AQUI")) {
      throw new Error("Falta SUPABASE_ANON_KEY (pública) no app.js");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS não carregou (CDN).");
    }
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // ==========================
  // RENDER
  // ==========================
  function renderAll() {
    for (const g of GROUPS) renderGroup(g);
    btnSalvar.disabled = !currentDate; // só habilita após verificar
  }

  function renderGroup(groupMeta) {
    const container = $(groupMeta.el);
    container.innerHTML = "";

    const list = mediumsByGroup.get(groupMeta.key) || [];
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "small";
      empty.textContent = "Nenhum médium encontrado.";
      container.appendChild(empty);
      return;
    }

    for (const m of list) {
      const item = document.createElement("div");
      item.className = "item";

      const left = document.createElement("div");
      left.innerHTML = `<div class="name">${escapeHtml(m.name)}</div>`;

      const right = document.createElement("div");
      right.className = "seg";

      const st = statusState.get(m.id) || "";

      const bP = mkBtn("P", st === "P", false, () => setStatus(m.id, "P"));
      const bM = mkBtn("M", st === "M", !groupMeta.allowM, () => setStatus(m.id, "M"));
      const bF = mkBtn("F", st === "F", false, () => setStatus(m.id, "F"));

      right.appendChild(bP);
      right.appendChild(bM);
      right.appendChild(bF);

      item.appendChild(left);
      item.appendChild(right);
      container.appendChild(item);
    }
  }

  function mkBtn(label, active, disabled, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    if (active) b.classList.add("active");
    if (disabled) b.classList.add("disabled");
    b.disabled = disabled;
    b.addEventListener("click", onClick);
    return b;
  }

  function setStatus(mediumId, status) {
    // toggle: se clicar no mesmo, limpa
    const cur = statusState.get(mediumId) || "";
    statusState.set(mediumId, cur === status ? "" : status);
    // re-render só o grupo inteiro (simples e estável)
    renderAll();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ==========================
  // SUPABASE DATA
  // ==========================
  async function testConnection() {
    // Teste simples: select 1 da tabela mediuns (não usa auth)
    const q = sb.from("mediuns").select("id").limit(1);
    const res = await withTimeout(q, "testConnection");
    if (res.error) throw res.error;
  }

  async function loadMediunsForGroup(groupKey) {
    const q = sb
      .from("mediuns")
      .select("id,name,group_type,active")
      .eq("group_type", groupKey)
      .eq("active", true)
      .order("name", { ascending: true });

    const res = await withTimeout(q, `loadMediuns:${groupKey}`);
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function loadChamadasForDate(dateISO) {
    const q = sb
      .from("chamadas")
      .select("medium_id,status,date")
      .eq("date", dateISO);

    const res = await withTimeout(q, "loadChamadas");
    if (res.error) throw res.error;

    const map = new Map();
    (res.data || []).forEach(r => map.set(r.medium_id, r.status));
    return map;
  }

  async function saveChamadas(dateISO) {
    const rows = [];
    for (const [medium_id, status] of statusState.entries()) {
      if (!status) continue;
      rows.push({ medium_id, date: dateISO, status });
    }
    if (!rows.length) return 0;

    // precisa ter UNIQUE (medium_id, date) para onConflict funcionar bem
    const q = sb.from("chamadas").upsert(rows, { onConflict: "medium_id,date" });
    const res = await withTimeout(q, "saveChamadas");
    if (res.error) throw res.error;
    return rows.length;
  }

  // ==========================
  // ACTIONS
  // ==========================
  async function onVerificar() {
    btnVerificar.disabled = true;
    btnSalvar.disabled = true;
    setConn("wait", "Conectando...");
    setMsg("Verificando conexão e carregando listas...");

    try {
      currentDate = dt.value;
      if (!currentDate) throw new Error("Selecione uma data.");

      await testConnection();
      setConn("ok", "Conectado");

      // Carrega mediuns por grupo
      for (const g of GROUPS) {
        const list = await loadMediunsForGroup(g.key);
        mediumsByGroup.set(g.key, list);
      }

      // Carrega chamadas do dia e aplica
      statusState.clear();
      const calls = await loadChamadasForDate(currentDate);
      for (const [mid, st] of calls.entries()) statusState.set(mid, st);

      renderAll();
      setMsg("Listas carregadas. Marque P/M/F e clique em Salvar chamada.");
      btnSalvar.disabled = false;
    } catch (e) {
      setConn("err", "Erro");
      setMsg(`Erro: ${e.message || e}`, true);
    } finally {
      btnVerificar.disabled = false;
    }
  }

  async function onSalvar() {
    btnSalvar.disabled = true;
    setMsg("Salvando...");

    try {
      if (!currentDate) throw new Error("Clique em “Verificar data” antes de salvar.");

      const n = await saveChamadas(currentDate);
      setMsg(n ? `Salvo com sucesso. Itens gravados: ${n}` : "Nada marcado para salvar.");
    } catch (e) {
      setMsg(`Erro ao salvar: ${e.message || e}`, true);
    } finally {
      btnSalvar.disabled = false;
    }
  }

  // ==========================
  // BOOT
  // ==========================
  function boot() {
    try {
      assertConfig();

      // *** PONTO-CHAVE: SEM AUTH ***
      sb = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      dt.value = todayISO();
      setConn("wait", "Pronto");
      setMsg("Selecione a data e clique em “Verificar data”.");
    } catch (e) {
      setConn("err", "Config");
      setMsg(`Config: ${e.message || e}`, true);
    }
  }

  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvar);
  document.addEventListener("DOMContentLoaded", boot);
})();