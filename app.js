(() => {
  // ===== COLE AQUI =====
  const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const pillConn = $("pillConn");
  const dt = $("dt");
  const group = $("group");
  const onlyActive = $("onlyActive");
  const btnLoad = $("btnLoad");
  const btnSave = $("btnSave");
  const tbody = $("tbody");
  const msg = $("msg");
  const logEl = $("log");

  // ===== STATE =====
  let sb = null;
  let currentList = [];
  let currentDate = "";
  let currentGroup = "";

  // ===== UTIL =====
  function now() {
    const d = new Date();
    return d.toLocaleTimeString();
  }
  function log(line) {
    logEl.textContent += `[${now()}] ${line}\n`;
  }
  function setPill(text, ok = true) {
    pillConn.textContent = text;
    pillConn.style.borderColor = ok ? "#cfeee3" : "#f2c9c9";
    pillConn.style.color = ok ? "#0a7" : "#c22";
  }
  function setMsg(text, type = "ok") {
    msg.textContent = text || "";
    msg.className = "statusline " + (type === "err" ? "err" : "ok");
  }
  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Timeout REAL (mata o “carregando infinito”)
  async function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(`Timeout em ${ms}ms (${label})`)), ms);
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
      throw new Error("Supabase JS não carregou (CDN). Verifique internet / bloqueador / script.");
    }
  }

  function renderList(list) {
    tbody.innerHTML = "";
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Nenhum médium encontrado.</td></tr>`;
      btnSave.disabled = true;
      return;
    }
    list.forEach((m, i) => {
      const tr = document.createElement("tr");
      tr.dataset.mid = m.id;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${m.name}</td>
        <td>
          <select>
            <option value="">—</option>
            <option value="P">P</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
    btnSave.disabled = false;
  }

  async function loadMediuns(groupType, activeOnly) {
    log(`Consultando mediuns (group_type=${groupType}, activeOnly=${activeOnly})…`);

    let q = sb
      .from("mediuns")
      .select("id,name,group_type,active")
      .eq("group_type", groupType)
      .order("name", { ascending: true });

    if (activeOnly) q = q.eq("active", true);

    const res = await withTimeout(q, 12000, "loadMediuns");
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function loadChamadas(dateISO) {
    log(`Consultando chamadas (date=${dateISO})…`);

    const q = sb
      .from("chamadas")
      .select("medium_id,status,date")
      .eq("date", dateISO);

    const res = await withTimeout(q, 12000, "loadChamadas");
    if (res.error) throw res.error;

    const map = new Map();
    (res.data || []).forEach(r => map.set(r.medium_id, r.status));
    return map;
  }

  async function applyChamadas(map) {
    let marked = 0;
    for (const tr of tbody.querySelectorAll("tr[data-mid]")) {
      const mid = tr.dataset.mid;
      const sel = tr.querySelector("select");
      const st = map.get(mid) || "";
      sel.value = st;
      if (st) marked++;
    }
    log(`Chamada aplicada na tela. Marcados: ${marked}`);
  }

  async function doLoad() {
    btnLoad.disabled = true;
    btnSave.disabled = true;

    currentDate = dt.value;
    currentGroup = group.value;
    const activeOnly = onlyActive.value === "1";

    setMsg("Carregando…", "ok");
    log("=== INÍCIO LOAD ===");

    try {
      // teste de conexão “simples”: buscar 1 linha da tabela mediuns (não depende de auth)
      log("Teste rápido de conexão…");
      const test = await withTimeout(
        sb.from("mediuns").select("id").limit(1),
        12000,
        "testConnection"
      );
      if (test.error) throw test.error;
      log("Conexão OK (mediuns limit 1).");

      const list = await loadMediuns(currentGroup, activeOnly);
      currentList = list;
      renderList(list);

      const callsMap = await loadChamadas(currentDate);
      await applyChamadas(callsMap);

      setMsg(`OK. Carregados: ${list.length}`, "ok");
      setPill("Conectado", true);
    } catch (e) {
      console.error(e);
      setMsg(`ERRO AO CARREGAR: ${e.message || e}`, "err");
      setPill("Erro", false);
      log(`ERRO: ${e.message || e}`);
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Falhou ao carregar. Veja a mensagem/log acima.</td></tr>`;
    } finally {
      btnLoad.disabled = false;
      btnSave.disabled = currentList.length === 0;
      log("=== FIM LOAD ===");
    }
  }

  async function doSave() {
    btnSave.disabled = true;
    setMsg("Salvando…", "ok");
    log("=== INÍCIO SAVE ===");

    try {
      const rows = [];
      for (const tr of tbody.querySelectorAll("tr[data-mid]")) {
        const medium_id = tr.dataset.mid;
        const status = tr.querySelector("select").value || "";
        if (!status) continue;
        rows.push({ medium_id, date: currentDate, status });
      }

      if (!rows.length) {
        setMsg("Nada marcado para salvar.", "err");
        log("Nada marcado.");
        return;
      }

      log(`Upsert chamadas: ${rows.length} linhas…`);
      const res = await withTimeout(
        sb.from("chamadas").upsert(rows, { onConflict: "medium_id,date" }),
        12000,
        "saveChamadas"
      );
      if (res.error) throw res.error;

      setMsg(`Salvo. Linhas: ${rows.length}`, "ok");
      log("Salvou OK.");
    } catch (e) {
      console.error(e);
      setMsg(`ERRO AO SALVAR: ${e.message || e}`, "err");
      log(`ERRO: ${e.message || e}`);
    } finally {
      btnSave.disabled = currentList.length === 0;
      log("=== FIM SAVE ===");
    }
  }

  function boot() {
    // Captura erros “silenciosos” (pra não ficar em “carregando”)
    window.addEventListener("unhandledrejection", (ev) => {
      log(`PROMISE REJECTION: ${ev.reason?.message || ev.reason}`);
      setMsg(`Erro (promise): ${ev.reason?.message || ev.reason}`, "err");
    });
    window.addEventListener("error", (ev) => {
      log(`JS ERROR: ${ev.message}`);
      setMsg(`Erro JS: ${ev.message}`, "err");
    });

    try {
      assertConfig();
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false }
      });

      dt.value = todayISO();
      setPill("Pronto", true);
      setMsg("Pronto. Clique em Carregar.", "ok");
      log("Boot OK.");
    } catch (e) {
      setPill("Config inválida", false);
      setMsg(`CONFIG: ${e.message || e}`, "err");
      log(`CONFIG ERROR: ${e.message || e}`);
    }
  }

  // eventos
  document.addEventListener("DOMContentLoaded", boot);
  btnLoad.addEventListener("click", doLoad);
  btnSave.addEventListener("click", doSave);
})();