// ===================== CONFIGURAÇÃO SUPABASE =====================
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY = "COLE_AQUI_SOMENTE_A_ANON_PUBLIC"; // <- cole aqui

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== ESTADO =====================
let mediunsCache = [];
let rotaMap = {}; // group_type -> { last_medium_id, last_psico_id }
let selectedAdminId = null;

// ===================== HELPERS =====================
function el(id){ return document.getElementById(id); }
function norm(s){ return (s||"").toString().trim(); }

function pctFaltas(m){
  const faltas = Number(m.faltas || 0);
  const pres = Number(m.presencas || 0);
  const total = faltas + pres;
  if(total <= 0) return { txt:"0%", bad:false };
  const perc = Math.round((faltas * 100) / total);
  return { txt: `${perc}%`, bad: perc >= 30 };
}

function groupLabel(g){
  if(g==="dirigente") return "Dirigente";
  if(g==="incorporacao") return "Incorporação";
  if(g==="desenvolvimento") return "Desenvolvimento";
  if(g==="carencia") return "Carência";
  return g;
}

// próximo na lista alfabética (circular), baseado no "lastId"
function nextAfter(list, lastId){
  if(!list || list.length===0) return null;
  if(!lastId) return list[0].id;
  const idx = list.findIndex(x => x.id === lastId);
  if(idx < 0) return list[0].id;
  if(idx === list.length - 1) return list[0].id;
  return list[idx + 1].id;
}

// ===================== LOGIN / LOGOUT =====================
async function login(){
  const email = norm(el("email").value);
  const senha = norm(el("senha").value);
  const erroBox = el("loginError");
  erroBox.textContent = "";

  if(!email || !senha){
    erroBox.textContent = "Preencha email e senha.";
    return;
  }

  try{
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error){
      console.error("Erro login:", error);
      erroBox.textContent = error.message || "Erro no login.";
      return;
    }
    el("loginCard").classList.add("hidden");
    el("app").classList.remove("hidden");

    // data padrão: hoje
    const hoje = new Date().toISOString().slice(0,10);
    el("dataChamada").value = hoje;

    await carregarTudo();
  }catch(e){
    console.error(e);
    erroBox.textContent = "Erro inesperado ao entrar.";
  }
}

async function logout(){
  try{ await sb.auth.signOut(); }catch(_){}
  el("app").classList.add("hidden");
  el("loginCard").classList.remove("hidden");
}

// ===================== ABAS =====================
function mostrarAba(qual){
  const abaChamada = el("abaChamada");
  const abaAdmin = el("abaAdmin");
  const tabChamada = el("tabChamada");
  const tabAdmin = el("tabAdmin");

  if(qual==="chamada"){
    abaChamada.classList.remove("hidden");
    abaAdmin.classList.add("hidden");
    tabChamada.classList.add("active");
    tabAdmin.classList.remove("active");
  }else{
    abaChamada.classList.add("hidden");
    abaAdmin.classList.remove("hidden");
    tabChamada.classList.remove("active");
    tabAdmin.classList.add("active");
    listarParticipantesAdmin();
  }
}

// ===================== DATA (terça + não feriado) =====================
async function verificarData(){
  const data = el("dataChamada").value;
  const aviso = el("avisoData");
  aviso.textContent = "";

  if(!data){
    aviso.textContent = "Selecione uma data.";
    el("btnSalvar").disabled = true;
    return false;
  }

  // 0 dom, 1 seg, 2 ter...
  const diaSemana = new Date(data + "T03:00:00").getDay();
  if(diaSemana !== 2){
    aviso.textContent = "❌ Chamada só pode ser feita em TERÇA-FEIRA.";
    el("btnSalvar").disabled = true;
    return false;
  }

  try{
    const { data: feriadosData, error } = await sb.from("feriados").select("*").eq("data", data);
    if(error) throw error;

    if((feriadosData||[]).length > 0){
      aviso.textContent = "❌ Hoje é feriado! Chamada não permitida.";
      el("btnSalvar").disabled = true;
      return false;
    }
  }catch(e){
    console.error("Erro feriados:", e);
    aviso.textContent = "⚠️ Erro ao consultar feriados (verifique RLS/políticas).";
    // ainda assim não deixa salvar
    el("btnSalvar").disabled = true;
    return false;
  }

  aviso.textContent = "✅ Data válida, pode registrar presença.";
  el("btnSalvar").disabled = false;
  return true;
}

// ===================== LOAD PRINCIPAL =====================
async function carregarTudo(){
  await carregarMediuns();
  await carregarRotacao();
  renderGruposChamada();
  atualizarContadoresMesa();
}

async function carregarMediuns(){
  const { data, error } = await sb
    .from("mediums")
    .select("*")
    .order("name", { ascending: true });

  if(error){
    console.error("Erro carregar mediuns:", error);
    alert("Erro ao carregar lista de médiuns. Veja console (F12).");
    mediunsCache = [];
    return;
  }

  mediunsCache = (data || []).map(m => ({
    ...m,
    name: norm(m.name),
    group_type: norm(m.group_type),
    active: m.active !== false
  }));
}

async function carregarRotacao(){
  rotaMap = {};
  const { data, error } = await sb.from("rotacao").select("*");
  if(error){
    console.error("Erro carregar rotacao:", error);
    // se não existir ainda, mantém vazio
    return;
  }
  (data||[]).forEach(r=>{
    rotaMap[r.group_type] = {
      last_medium_id: r.last_medium_id || null,
      last_psico_id: r.last_psico_id || null // se existir
    };
  });
}

// ===================== RENDER CHAMADA =====================
function renderGruposChamada(){
  const ativos = mediunsCache.filter(m => m.active);

  const dirigentes = ativos.filter(m => m.group_type === "dirigente");
  const incorporacao = ativos.filter(m => m.group_type === "incorporacao");
  const desenvolvimento = ativos.filter(m => m.group_type === "desenvolvimento");
  const carencia = ativos.filter(m => m.group_type === "carencia");

  renderGrupo("listaDirigentes", dirigentes, "dirigente");
  renderGrupo("listaIncorporacao", incorporacao, "incorporacao");
  renderGrupo("listaDesenvolvimento", desenvolvimento, "desenvolvimento");
  renderGrupo("listaCarencia", carencia, "carencia");
}

// regras:
// - carência: só P/F (NÃO tem mesa)
// - desenvolvimento/incorporação: P/M/F (mesa limitada a 4 em cada grupo)
// - dirigentes: P/M/F/PS (M = dirige a mesa, PS = psicografa)
// destaques:
// - amarelo = PRÓXIMO da mesa (por rotação)  (dirigente M, inc, des)
// - vermelho = PRÓXIMO da psicografia (dirigente PS)
function renderGrupo(divId, lista, groupType){
  const div = el(divId);
  div.innerHTML = "";

  if(!lista || lista.length === 0){
    div.innerHTML = `<div class="medium-card">Nenhum médium neste grupo.</div>`;
    return;
  }

  // ordena por nome
  const sorted = [...lista].sort((a,b)=> a.name.localeCompare(b.name,"pt-BR"));

  const r = rotaMap[groupType] || { last_medium_id:null, last_psico_id:null };

  const nextMesaId =
    (groupType === "carencia") ? null
    : nextAfter(sorted, r.last_medium_id);

  const nextPsicoId =
    (groupType === "dirigente")
    ? nextAfter(sorted, r.last_psico_id || r.last_medium_id) // fallback se coluna não existir
    : null;

  sorted.forEach(m=>{
    const card = document.createElement("div");
    card.className = "medium-card";

    // destaques
    const isNextMesa = !!nextMesaId && m.id === nextMesaId;
    const isNextPsico = !!nextPsicoId && m.id === nextPsicoId;

    if(isNextMesa) card.classList.add("medium-next");
    if(isNextPsico) card.classList.add("medium-ps-next");

    const { txt, bad } = pctFaltas(m);
    const percCls = bad ? "badge-perc bad" : "badge-perc";

    // opções por grupo
    let optionsHTML = "";

    if(groupType === "carencia"){
      optionsHTML = `
        <label class="opt"><input type="radio" name="${m.id}" value="P"> P</label>
        <label class="opt"><input type="radio" name="${m.id}" value="F"> F</label>
      `;
    }else if(groupType === "dirigente"){
      optionsHTML = `
        <label class="opt"><input type="radio" name="${m.id}" value="P"> P</label>
        <label class="opt"><input type="radio" name="${m.id}" value="M"> M</label>
        <label class="opt"><input type="radio" name="${m.id}" value="F"> F</label>
        <label class="opt"><input type="radio" name="${m.id}" value="PS"> <span class="ps-label">PS</span></label>
      `;
    }else{
      // desenvolvimento/incorporação
      optionsHTML = `
        <label class="opt"><input type="radio" name="${m.id}" value="P"> P</label>
        <label class="opt"><input type="radio" name="${m.id}" value="M" class="mesa-radio" data-group="${groupType}"> M</label>
        <label class="opt"><input type="radio" name="${m.id}" value="F"> F</label>
      `;
    }

    const nextTag = isNextMesa ? `<span class="badge-next">PRÓXIMO DA VEZ</span>` : "";
    const head = `
      <div class="medium-head">
        <div class="medium-name">
          <span class="${percCls}">${txt}</span>
          <span>${m.name}</span>
        </div>
        ${nextTag}
      </div>
    `;

    card.innerHTML = head + `<div class="medium-options">${optionsHTML}</div>`;
    div.appendChild(card);
  });

  // listeners para contagem de mesa
  div.querySelectorAll('input[type="radio"]').forEach(inp=>{
    inp.addEventListener("change", ()=>{
      atualizarContadoresMesa();
    });
  });
}

function atualizarContadoresMesa(){
  // conta quantos "M" estão marcados por grupo inc/des
  const ativos = mediunsCache.filter(m=>m.active);
  const inc = ativos.filter(m=>m.group_type==="incorporacao");
  const des = ativos.filter(m=>m.group_type==="desenvolvimento");

  const incCount = inc.reduce((acc,m)=>{
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    return acc + (sel && sel.value==="M" ? 1 : 0);
  },0);

  const desCount = des.reduce((acc,m)=>{
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    return acc + (sel && sel.value==="M" ? 1 : 0);
  },0);

  el("countIncorporacao").textContent = `Mesa marcados: ${incCount}/4`;
  el("countDesenvolvimento").textContent = `Mesa marcados: ${desCount}/4`;
}

// ===================== VALIDAR REGRAS ANTES DE SALVAR =====================
function validarRegrasAntesDeSalvar(){
  const ativos = mediunsCache.filter(m=>m.active);

  // carência não tem M (já não aparece, mas confere)
  const car = ativos.filter(m=>m.group_type==="carencia");
  for(const m of car){
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    if(sel && sel.value==="M") return { ok:false, msg:"Carência não pode sentar na mesa." };
  }

  // mesa: 4 em inc e 4 em des (pode ajustar depois se quiser flexibilizar)
  const inc = ativos.filter(m=>m.group_type==="incorporacao");
  const des = ativos.filter(m=>m.group_type==="desenvolvimento");

  const incM = inc.filter(m=>{
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    return sel && sel.value==="M";
  });
  const desM = des.filter(m=>{
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    return sel && sel.value==="M";
  });

  if(incM.length > 4) return { ok:false, msg:"Incorporação: máximo 4 na mesa." };
  if(desM.length > 4) return { ok:false, msg:"Desenvolvimento: máximo 4 na mesa." };

  // dirigentes: precisa 1 M (dirige) e 1 PS (psicografa), e não pode ser a mesma pessoa
  const dir = ativos.filter(m=>m.group_type==="dirigente");
  const dirM = [];
  const dirPS = [];

  for(const m of dir){
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    if(!sel) continue;
    if(sel.value==="M") dirM.push(m);
    if(sel.value==="PS") dirPS.push(m);
  }

  if(dirM.length > 1) return { ok:false, msg:"Dirigentes: só 1 pode estar como M (dirigindo)." };
  if(dirPS.length > 1) return { ok:false, msg:"Dirigentes: só 1 pode estar como PS (psicografando)." };
  if(dirM.length === 1 && dirPS.length === 1 && dirM[0].id === dirPS[0].id){
    return { ok:false, msg:"O mesmo dirigente não pode ser M e PS ao mesmo tempo." };
  }

  return { ok:true, msg:"ok", incM, desM, dirM, dirPS };
}

// ===================== SALVAR CHAMADA =====================
async function salvarChamada(){
  const data = el("dataChamada").value;
  const res = el("resultadoSalvar");
  res.textContent = "";

  const okData = await verificarData();
  if(!okData){
    res.textContent = "Corrija a data antes de salvar.";
    return;
  }

  const valid = validarRegrasAntesDeSalvar();
  if(!valid.ok){
    res.textContent = "❌ " + valid.msg;
    return;
  }

  // monta registros
  const registros = [];
  const ativos = mediunsCache.filter(m=>m.active);

  ativos.forEach(m=>{
    const sel = document.querySelector(`input[name="${m.id}"]:checked`);
    if(!sel) return;
    registros.push({
      medium_id: m.id,
      data,
      status: sel.value
    });
  });

  if(registros.length === 0){
    res.textContent = "Nenhuma presença marcada.";
    return;
  }

  try{
    // 1) inserir chamadas
    const { error: insErr } = await sb.from("chamadas").insert(registros);
    if(insErr){
      console.error("Erro insert chamadas:", insErr);
      res.textContent = "❌ Erro ao salvar chamadas (veja console).";
      return;
    }

    // 2) atualizar estatísticas em "mediums"
    // - P: presencas +1
    // - F: faltas +1
    // - M: presencas +1 e mesa +1
    // - PS: presencas +1 e psicografia +1
    // OBS: se quiser que PS também conte como mesa, me fala que eu ajusto.
    const updates = registros.map(r=>{
      const m = mediunsCache.find(x=>x.id===r.medium_id);
      const patch = { id: r.medium_id };
      const pres = Number(m.presencas||0);
      const fal = Number(m.faltas||0);
      const mesa = Number(m.mesa||0);
      const ps = Number(m.psicografia||0);

      if(r.status==="P") patch.presencas = pres + 1;
      if(r.status==="F") patch.faltas = fal + 1;
      if(r.status==="M"){ patch.presencas = pres + 1; patch.mesa = mesa + 1; }
      if(r.status==="PS"){ patch.presencas = pres + 1; patch.psicografia = ps + 1; }

      return patch;
    });

    // faz em sequência para evitar conflito (simples e robusto)
    for(const u of updates){
      // remove undefined
      const payload = {};
      Object.keys(u).forEach(k=>{
        if(u[k] !== undefined) payload[k] = u[k];
      });
      const { error: upErr } = await sb.from("mediums").update(payload).eq("id", u.id);
      if(upErr){
        console.error("Erro update mediums:", upErr);
        // não interrompe, mas avisa
      }
    }

    // 3) atualizar rotação:
    // - incorporacao: last_medium_id = último "M" marcado (o último na lista alfabética marcada, pra avançar a partir dele)
    // - desenvolvimento: idem
    // - dirigente:
    //    - last_medium_id = dirigente marcado como M (dirige a mesa)
    //    - last_psico_id = dirigente marcado como PS
    await atualizarRotacaoDepoisDeSalvar(valid);

    res.textContent = "✅ Chamada salva com sucesso!";
    // recarrega tudo para recalcular destaques (amarelo/vermelho)
    await carregarTudo();

  }catch(e){
    console.error(e);
    res.textContent = "❌ Erro inesperado ao salvar.";
  }
}

function lastMarkedIdByName(listMarked){
  if(!listMarked || listMarked.length===0) return null;
  const sorted = [...listMarked].sort((a,b)=> a.name.localeCompare(b.name,"pt-BR"));
  return sorted[sorted.length - 1].id;
}

async function atualizarRotacaoDepoisDeSalvar(valid){
  // inc/des: pega o "último" M marcado na ordem alfabética
  const incLast = lastMarkedIdByName(valid.incM);
  const desLast = lastMarkedIdByName(valid.desM);

  // dirigente M e PS (cada um no máximo 1)
  const dirMId = valid.dirM && valid.dirM.length ? valid.dirM[0].id : null;
  const dirPSId = valid.dirPS && valid.dirPS.length ? valid.dirPS[0].id : null;

  const rows = [];

  if(incLast) rows.push({ group_type:"incorporacao", last_medium_id: incLast });
  if(desLast) rows.push({ group_type:"desenvolvimento", last_medium_id: desLast });

  // dirigente: atualiza mesa e psico separadamente (se sua tabela tiver last_psico_id)
  if(dirMId || dirPSId){
    const payload = { group_type:"dirigente" };
    if(dirMId) payload.last_medium_id = dirMId;
    if(dirPSId) payload.last_psico_id = dirPSId;
    rows.push(payload);
  }

  // carencia não usa rotação de mesa
  if(rows.length === 0) return;

  // upsert em rotacao
  for(const r of rows){
    const { error } = await sb.from("rotacao").upsert(r, { onConflict: "group_type" });
    if(error){
      console.error("Erro upsert rotacao:", error);
    }
  }
}

// ===================== ADMIN =====================
function listarParticipantesAdmin(){
  const lista = el("adminLista");
  const msg = el("adminMsg");
  msg.textContent = "";
  lista.innerHTML = "";

  const busca = norm(el("adminBusca").value).toLowerCase();
  const grupo = el("adminFiltroGrupo").value;
  const ativo = el("adminFiltroAtivo").value;

  let items = [...mediunsCache];

  if(ativo === "ativos") items = items.filter(m=>m.active);
  if(ativo === "inativos") items = items.filter(m=>!m.active);
  if(grupo) items = items.filter(m=>m.group_type===grupo);
  if(busca) items = items.filter(m=> (m.name||"").toLowerCase().includes(busca));

  items.sort((a,b)=> (a.name||"").localeCompare(b.name||"","pt-BR"));

  items.forEach(m=>{
    const div = document.createElement("div");
    div.className = "admin-item";
    div.innerHTML = `
      <div>
        <div><b>${m.name}</b> ${m.active ? "" : "<span class='pill warn'>inativo</span>"}</div>
        <div class="meta">${groupLabel(m.group_type)}</div>
      </div>
      <div>
        <button class="btn" data-id="${m.id}">Editar</button>
      </div>
    `;
    div.querySelector("button").addEventListener("click", ()=> abrirModal(m.id));
    lista.appendChild(div);
  });

  if(items.length === 0){
    lista.innerHTML = `<div class="medium-card">Nada encontrado.</div>`;
  }
}

function abrirModal(id){
  selectedAdminId = id;
  const m = mediunsCache.find(x=>x.id===id);

  el("modal").classList.remove("hidden");
  el("modalMsg").textContent = "";

  if(!m){
    el("modalTitle").textContent = "Novo participante";
    el("mName").value = "";
    el("mGroup").value = "desenvolvimento";
    el("mActive").checked = true;
    el("mPrimeira").checked = false;
    el("mCarenciaTotal").value = 0;
    el("mCarenciaAtual").value = 0;
    el("btnInativarParticipante").textContent = "Cancelar";
    return;
  }

  el("modalTitle").textContent = "Editar participante";
  el("mName").value = m.name || "";
  el("mGroup").value = m.group_type || "desenvolvimento";
  el("mActive").checked = m.active !== false;
  el("mPrimeira").checked = !!m.primeira_incorporacao;
  el("mCarenciaTotal").value = Number(m.carencia_total || 0);
  el("mCarenciaAtual").value = Number(m.carencia_atual || 0);
  el("btnInativarParticipante").textContent = "Inativar";
}

function fecharModal(){
  el("modal").classList.add("hidden");
  selectedAdminId = null;
}

async function salvarParticipante(){
  const name = norm(el("mName").value);
  const group_type = el("mGroup").value;
  const active = el("mActive").checked;
  const primeira_incorporacao = el("mPrimeira").checked;
  const carencia_total = Number(el("mCarenciaTotal").value || 0);
  const carencia_atual = Number(el("mCarenciaAtual").value || 0);

  const msg = el("modalMsg");
  msg.textContent = "";

  if(!name){
    msg.textContent = "❌ Informe o nome.";
    return;
  }

  try{
    // novo
    if(!selectedAdminId){
      const payload = {
        name,
        group_type,
        active,
        primeira_incorporacao,
        carencia_total,
        carencia_atual,
        faltas: 0,
        presencas: 0,
        mesa: 0,
        psicografia: 0
      };
      const { error } = await sb.from("mediums").insert(payload);
      if(error){
        console.error(error);
        msg.textContent = "❌ Erro ao criar (veja console).";
        return;
      }
      msg.textContent = "✅ Criado com sucesso!";
    }else{
      // update
      const payload = {
        name,
        group_type,
        active,
        primeira_incorporacao,
        carencia_total,
        carencia_atual
      };
      const { error } = await sb.from("mediums").update(payload).eq("id", selectedAdminId);
      if(error){
        console.error(error);
        msg.textContent = "❌ Erro ao salvar (veja console).";
        return;
      }
      msg.textContent = "✅ Salvo!";
    }

    await carregarTudo();
    listarParticipantesAdmin();

  }catch(e){
    console.error(e);
    msg.textContent = "❌ Erro inesperado.";
  }
}

async function inativarOuCancelar(){
  const msg = el("modalMsg");
  msg.textContent = "";

  // se for "novo", aqui vira cancelar
  if(!selectedAdminId){
    fecharModal();
    return;
  }

  try{
    const { error } = await sb.from("mediums").update({ active:false }).eq("id", selectedAdminId);
    if(error){
      console.error(error);
      msg.textContent = "❌ Erro ao inativar.";
      return;
    }
    msg.textContent = "✅ Inativado!";
    await carregarTudo();
    listarParticipantesAdmin();
  }catch(e){
    console.error(e);
    msg.textContent = "❌ Erro inesperado.";
  }
}

// ===================== EVENTOS =====================
el("btnEntrar").addEventListener("click", login);
el("btnSair").addEventListener("click", logout);

el("tabChamada").addEventListener("click", ()=> mostrarAba("chamada"));
el("tabAdmin").addEventListener("click", ()=> mostrarAba("admin"));

el("btnVerificar").addEventListener("click", verificarData);
el("btnSalvar").addEventListener("click", salvarChamada);

el("adminBusca").addEventListener("input", listarParticipantesAdmin);
el("adminFiltroGrupo").addEventListener("change", listarParticipantesAdmin);
el("adminFiltroAtivo").addEventListener("change", listarParticipantesAdmin);

el("btnNovo").addEventListener("click", ()=>{
  selectedAdminId = null;
  abrirModal(null);
});

el("btnFecharModal").addEventListener("click", fecharModal);
el("btnSalvarParticipante").addEventListener("click", salvarParticipante);
el("btnInativarParticipante").addEventListener("click", inativarOuCancelar);

// tenta manter sessão
(async ()=>{
  const { data } = await sb.auth.getSession();
  if(data && data.session){
    el("loginCard").classList.add("hidden");
    el("app").classList.remove("hidden");
    const hoje = new Date().toISOString().slice(0,10);
    el("dataChamada").value = hoje;
    await carregarTudo();
  }
})();
