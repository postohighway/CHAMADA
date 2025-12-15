/* =========================================================
   CHAMADA DE MÉDIUNS - app.js (ESTÁVEL)
   - NÃO usa service_role
   - REST + headers (apikey + Authorization)
   - Tabelas: public.mediums, public.chamadas, public.feriados
   ========================================================= */

/** ✅ COLE AQUI (APENAS ANON PUBLIC KEY) */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co"; // ex: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ====== IDs UI ====== */
const $ = (id) => document.getElementById(id);

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

const boxResumo = $("resumoGeral");
const boxReservasMesa = $("reservasMesa");

/** ====== Estado ====== */
let feriadosSet = new Set();     // YYYY-MM-DD
let mediums = [];                // lista completa de mediums ativos
let marcacoes = new Map();       // medium_id -> status (P/M/F/PS/"")
let rotacao = { mesa: null, psicografia: null }; // last_medium_id por rotação

/** ====== Util ====== */
function setStatus(ok, msg) {
  elStatusPill.classList.toggle("ok", !!ok);
  elStatusPill.classList.toggle("warn", !ok);
  elStatusText.textContent = msg || (ok ? "Conectado" : "Problema");
}

function toast(msg, isErr=false) {
  elMsgErro.style.display = isErr ? "block" : "none";
  elMsgTopo.style.display = isErr ? "none" : "block";
  (isErr ? elMsgErro : elMsgTopo).textContent = msg;
}

function toISODate(inputValue) {
  // aceita yyyy-mm-dd do input type=date
  if (!inputValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) return inputValue;

  // aceita dd/mm/aaaa se você ainda usar texto em algum lugar
  const m = inputValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isFeriado(iso) {
  return feriadosSet.has(iso);
}

function headers() {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

async function sbDelete(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { method: "DELETE", headers: headers() });
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

/** ====== Carregamentos ====== */
async function carregarFeriados() {
  const rows = await sbGet(`feriados?select=data`);
  feriadosSet = new Set(rows.map(x => x.data));
}

async function carregarMediums() {
  // garante campos que precisamos
  const rows = await sbGet(`mediums?select=id,name,group_type,active,presencas,faltas,mesa,psicografia&active=eq.true&order=name.asc`);
  mediums = rows;
}

async function carregarRotacao() {
  // rotacao: group_type ('mesa','psicografia'), last_medium_id
  const rows = await sbGet(`rotacao?select=group_type,last_medium_id`);
  rotacao = { mesa: null, psicografia: null };
  for (const r of rows) {
    if (r.group_type === "mesa") rotacao.mesa = r.last_medium_id;
    if (r.group_type === "psicografia") rotacao.psicografia = r.last_medium_id;
  }
}

/** ====== Chamada (por data) ====== */
async function carregarChamadaDoDia(iso) {
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  marcacoes = new Map();
  for (const r of rows) marcacoes.set(r.medium_id, r.status);
}

/** ====== Rotação (cálculo do próximo) ====== */
function proximoDaLista(lista, lastId) {
  if (!lista.length) return null;
  const idx = lastId ? lista.findIndex(x => x.id === lastId) : -1;
  const next = lista[(idx + 1 + lista.length) % lista.length];
  return next?.id || null;
}

function getDirigentes() {
  return mediums.filter(m => m.group_type === "dirigente");
}
function getIncorporacao() {
  return mediums.filter(m => m.group_type === "incorporacao");
}
function getDesenvolvimento() {
  return mediums.filter(m => m.group_type === "desenvolvimento");
}
function getCarencia() {
  return mediums.filter(m => m.group_type === "carencia");
}

function getElegiveisMesa() {
  // amarelo: dirigentes com flag mesa=1
  return getDirigentes().filter(m => Number(m.mesa) === 1);
}
function getElegiveisPsico() {
  // vermelho: dirigentes com flag psicografia=1
  return getDirigentes().filter(m => Number(m.psicografia) === 1);
}

/** ====== UI Render ====== */
function renderTudo() {
  const dirigentes = getDirigentes();
  const incorp = getIncorporacao();
  const desenv = getDesenvolvimento();
  const car = getCarencia();

  // calcula próximos (amarelo/vermelho) SEPARADOS
  const nextMesaId = proximoDaLista(getElegiveisMesa(), rotacao.mesa);
  const nextPsicoId = proximoDaLista(getElegiveisPsico(), rotacao.psicografia);

  renderGrupo(listaDirigentes, dirigentes, {
    titulo: "Dirigentes",
    opcoes: ["P","M","F","PS"],       // ✅ PS só aqui
    highlightMesaId: nextMesaId,      // ✅ amarelo
    highlightPsicoId: nextPsicoId,    // ✅ vermelho
    mostraStats: true
  });

  renderGrupo(listaIncorporacao, incorp, {
    titulo: "Médiuns de Incorporação",
    opcoes: ["P","M","F"],            // ✅ volta M, sem PS
    mostraStats: false
  });

  renderGrupo(listaDesenvolvimento, desenv, {
    titulo: "Médiuns em Desenvolvimento",
    opcoes: ["P","M","F"],            // ✅ volta M, sem PS
    mostraStats: false
  });

  renderGrupo(listaCarencia, car, {
    titulo: "Médiuns em Carência",
    opcoes: ["P","M","F"],            // ✅ volta M, sem PS
    mostraStats: false
  });

  renderResumo(dirigentes);
}

function renderGrupo(container, lista, cfg) {
  container.innerHTML = "";

  for (const m of lista) {
    const statusAtual = marcacoes.get(m.id) || "";

    const row = document.createElement("div");
    row.className = "linhaMedium";

    // Destaques: amarelo e vermelho independentes
    if (cfg.highlightMesaId && m.id === cfg.highlightMesaId) row.classList.add("hlMesa");
    if (cfg.highlightPsicoId && m.id === cfg.highlightPsicoId) row.classList.add("hlPsico");

    const nome = document.createElement("div");
    nome.className = "nome";
    nome.textContent = m.name;

    const sub = document.createElement("div");
    sub.className = "sub";
    if (cfg.mostraStats) {
      const pres = Number(m.presencas || 0);
      const falt = Number(m.faltas || 0);
      const total = pres + falt;
      const pctPres = total ? Math.round((pres / total) * 100) : 0;
      const pctFalt = total ? Math.round((falt / total) * 100) : 0;
      sub.textContent = `Presenças: ${pres} | Faltas: ${falt} | Presença: ${pctPres}% | Faltas: ${pctFalt}%`;
    } else {
      sub.textContent = "";
    }

    const controles = document.createElement("div");
    controles.className = "controles";

    // radios
    for (const op of cfg.opcoes) {
      const wrap = document.createElement("label");
      wrap.className = "opcao";

      const r = document.createElement("input");
      r.type = "radio";
      r.name = `st_${m.id}`;
      r.value = op;
      r.checked = (statusAtual === op);

      r.addEventListener("change", () => {
        marcacoes.set(m.id, op);
        renderResumo(getDirigentes()); // atualiza contadores
      });

      const t = document.createElement("span");
      t.textContent = op;

      wrap.appendChild(r);
      wrap.appendChild(t);
      controles.appendChild(wrap);
    }

    const btnLimpar = document.createElement("button");
    btnLimpar.className = "btnLimpar";
    btnLimpar.textContent = "Limpar";
    btnLimpar.addEventListener("click", () => {
      marcacoes.delete(m.id);
      renderTudo();
    });

    row.appendChild(nome);
    row.appendChild(sub);
    row.appendChild(controles);
    row.appendChild(btnLimpar);

    container.appendChild(row);
  }
}

/** ====== Resumo / Reservas ====== */
function renderResumo(dirigentes) {
  // contagem do DIA (marcacoes)
  let p=0,m=0,f=0,ps=0;
  const reservasMesa = [];

  for (const d of dirigentes) {
    const st = marcacoes.get(d.id);
    if (!st) continue;
    if (st === "P") p++;
    else if (st === "M") { m++; reservasMesa.push(d.name); }
    else if (st === "F") f++;
    else if (st === "PS") ps++;
  }

  const denom = (p+m+f);
  const presPct = denom ? Math.round(((p+m)/denom)*100) : 0;
  const faltPct = denom ? Math.round((f/denom)*100) : 0;

  if (boxResumo) {
    boxResumo.textContent = `P:${p}  M:${m}  F:${f}  PS:${ps}  |  Presença:${presPct}%  |  Faltas:${faltPct}%`;
  }
  if (boxReservasMesa) {
    boxReservasMesa.textContent = reservasMesa.length ? reservasMesa.join(", ") : "—";
  }
}

/** ====== Verificar data ====== */
async function verificarData() {
  const iso = toISODate(elData.value);
  if (!iso) { toast("Data inválida. Use o seletor.", true); return; }

  if (isFeriado(iso)) {
    toast("Essa data está marcada como feriado. (Você pode decidir não fazer chamada.)", false);
  } else {
    toast("Data válida.", false);
  }

  await carregarChamadaDoDia(iso);
  renderTudo();
}

/** ====== Salvar chamada ====== */
async function salvarChamada() {
  const iso = toISODate(elData.value);
  if (!iso) { toast("Selecione uma data antes de salvar.", true); return; }

  // remove registros do dia e re-insere (simples e consistente)
  await sbDelete(`chamadas?data=eq.${iso}`);

  const payload = [];
  for (const [medium_id, status] of marcacoes.entries()) {
    if (!status) continue;
    payload.push({ medium_id, data: iso, status });
  }

  if (payload.length) {
    await sbPost(`chamadas`, payload);
  }

  toast("Chamada salva com sucesso.", false);

  // 🔁 Atualiza rotações:
  // - Mesa (amarelo) avança quando alguém foi marcado "M"
  // - Psicografia (vermelho) avança quando alguém foi marcado "PS"
  await atualizarRotacoesAposSalvar();

  // recarrega rotação e redesenha (pra já aparecer novo amarelo/vermelho)
  await carregarRotacao();
  renderTudo();
}

async function atualizarRotacoesAposSalvar() {
  // pega quem foi marcado hoje
  let ultimoM = null;
  let ultimoPS = null;

  // regra: se tiver mais de um M/PS, pega o último na ordem da lista (nome)
  // (pode ajustar depois, mas assim fica determinístico)
  const dirigentes = getDirigentes();

  for (const d of dirigentes) {
    const st = marcacoes.get(d.id);
    if (st === "M") ultimoM = d.id;
    if (st === "PS") ultimoPS = d.id;
  }

  // se marcou alguém como M, set last_medium_id da rotação mesa
  if (ultimoM) {
    await sbPost("rotacao", [{
      group_type: "mesa",
      last_medium_id: ultimoM,
      updated_at: new Date().toISOString()
    }]).catch(async () => {
      // se POST falhar por conflito, tenta PATCH
      const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.mesa`;
      await fetch(url, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ last_medium_id: ultimoM, updated_at: new Date().toISOString() })
      });
    });
  }

  // se marcou alguém como PS, set last_medium_id da rotação psicografia
  if (ultimoPS) {
    await sbPost("rotacao", [{
      group_type: "psicografia",
      last_medium_id: ultimoPS,
      updated_at: new Date().toISOString()
    }]).catch(async () => {
      const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.psicografia`;
      await fetch(url, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ last_medium_id: ultimoPS, updated_at: new Date().toISOString() })
      });
    });
  }
}

/** ====== Boot ====== */
async function boot() {
  try {
    setStatus(false, "Conectando...");
    await Promise.all([
      carregarFeriados(),
      carregarMediums(),
      carregarRotacao()
    ]);
    setStatus(true, "Supabase OK");
    toast("Selecione a data e clique em “Verificar data”.", false);
    renderTudo();
  } catch (e) {
    console.error(e);
    setStatus(false, "Falha ao conectar");
    toast(String(e), true);
  }
}

/** ====== Eventos ====== */
btnVerificar?.addEventListener("click", () => verificarData().catch(err => toast(String(err), true)));
btnSalvar?.addEventListener("click", () => salvarChamada().catch(err => toast(String(err), true)));

boot();
