/* ============================================================
   CHAMADA DE MÉDIUNS - app.js (ROTAÇÃO 3 FILAS + PS SEPARADO)
   Versão: 2026-01-15-a
   ============================================================ */

console.log("APP.JS CARREGADO: 2026-01-15-a");

/** 🔑 COLE AQUI */
const SUPABASE_URL = "https://nouzzyrevykdmnqifjjt.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdXp6eXJldnlrZG1ucWlmamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTYzMDIsImV4cCI6MjA4MDk3MjMwMn0.s2OzeSXe7CrKDNl6fXkTcMj_Vgitod0l0h0BiJA79nc";

/** ====== DOM ====== */
const $ = (id) => document.getElementById(id);
function must(id){
  const e = $(id);
  if(!e){
    const msg = `ERRO FRONT: ID NÃO ENCONTRADO NO HTML: ${id}`;
    console.error(msg);
    // tenta mostrar na tela se existir msgErro
    const me = $("msgErro");
    if(me) me.textContent = msg;
    throw new Error(msg);
  }
  return e;
}

/** ====== Tabs ====== */
const tabChamada = must("tabChamada");
const tabParticipantes = must("tabParticipantes");
const viewChamada = must("viewChamada");
const viewParticipantes = must("viewParticipantes");

/** ====== CHAMADA UI ====== */
const elStatusPill = must("statusPill");
const elStatusText = must("statusText");
const elMsgTopo = must("msgTopo");
const elMsgErro = must("msgErro");
const elData = must("dataChamada");
const btnVerificar = must("btnVerificar");
const btnSalvar = must("btnSalvar");

const listaDirigentes = must("listaDirigentes");
const listaIncorporacao = must("listaIncorporacao");
const listaDesenvolvimento = must("listaDesenvolvimento");
const listaCarencia = must("listaCarencia");

const elResumoGeral = must("resumoGeral");
const elReservasMesa = must("reservasMesa");

/** ====== Próximos ====== */
const elNextMesaDirigenteName = must("nextMesaDirigenteName");
const elNextPsicoDirigenteName = must("nextPsicoDirigenteName");
const elNextMesaIncorpName = must("nextMesaIncorpName");
const elNextMesaDesenvName = must("nextMesaDesenvName");

/** ====== PARTICIPANTES UI ====== */
const partFiltroGrupo = must("partFiltroGrupo");
const partBusca = must("partBusca");
const btnRecarregarParticipantes = must("btnRecarregarParticipantes");
const listaParticipantes = must("listaParticipantes");
const novoNome = must("novoNome");
const novoGrupo = must("novoGrupo");
const novoAtivo = must("novoAtivo");
const novoMesa = must("novoMesa");
const novoPsico = must("novoPsico");
const btnAdicionarParticipante = must("btnAdicionarParticipante");
const partMsg = must("partMsg");
const partErr = must("partErr");

/** ====== Estado ====== */
let feriadosSet = new Set();
let mediumsAll = [];
let chamadasMap = new Map();

let rotacao = {
  mesa_dirigente: null,
  mesa_incorporacao: null,
  mesa_desenvolvimento: null,
  psicografia_dirigente: null
};

let rotacaoView = null;
let rotacaoStart = null;

let nextMesaDirigenteId = null;
let nextMesaIncorpId = null;
let nextMesaDesenvId = null;
let nextPsicoDirigenteId = null;

let currentDateISO = null;

/** ====== UI utils ====== */
function setOk(msg = "") {
  elMsgTopo.textContent = msg;
  elMsgErro.textContent = "";
}
function setErro(msg = "") {
  elMsgErro.textContent = msg;
}
function setConn(ok, msg) {
  elStatusPill.classList.toggle("ok", !!ok);
  elStatusPill.classList.toggle("bad", !ok);
  elStatusText.textContent = msg || (ok ? "Supabase OK" : "Sem conexão");
}
function pOk(msg = "") { partMsg.textContent = msg; partErr.textContent = ""; }
function pErr(msg = "") { partErr.textContent = msg; partMsg.textContent = ""; }

function pad2(n){ return String(n).padStart(2,"0"); }
function parseBRtoISO(br){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec((br||"").trim());
  if(!m) return null;
  const dd=+m[1], mm=+m[2], yy=+m[3];
  if(mm<1||mm>12||dd<1||dd>31) return null;
  return `${yy}-${pad2(mm)}-${pad2(dd)}`;
}
function isTuesday(iso){
  const d=new Date(iso+"T00:00:00");
  return d.getDay()===2;
}
function formatISOtoBR(iso){
  const [y,m,d]=iso.split("-");
  return `${d}/${m}/${y}`;
}
function deepCopy(obj){ return JSON.parse(JSON.stringify(obj)); }

/** ====== Supabase REST ====== */
function headersJson(){
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type":"application/json"
  };
}
async function sbGet(path){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headersJson()});
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
  return r.json();
}
async function sbPost(table, rows, prefer="return=minimal"){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{
    method:"POST",
    headers:{...headersJson(), Prefer: prefer},
    body: JSON.stringify(rows)
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
  try { return await r.json(); } catch { return []; }
}
async function sbPatch(table, whereQS, body){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?${whereQS}`,{
    method:"PATCH",
    headers:{...headersJson(), Prefer:"return=minimal"},
    body: JSON.stringify(body)
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
}
async function sbDelete(table, whereQS){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?${whereQS}`,{
    method:"DELETE",
    headers:{...headersJson(), Prefer:"return=minimal"},
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
}

async function sbDeleteChamada(medium_id, iso){
  const whereQS = `medium_id=eq.${medium_id}&data=eq.${iso}`;
  await sbDelete("chamadas", whereQS);
}
async function sbUpsertChamadas(rows){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/chamadas?on_conflict=medium_id,data`,{
    method:"POST",
    headers:{...headersJson(), Prefer:"resolution=merge-duplicates,return=minimal"},
    body: JSON.stringify(rows)
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
}
async function sbPatchRotacao(group_type, last_medium_id){
  const url = `${SUPABASE_URL}/rest/v1/rotacao?group_type=eq.${encodeURIComponent(group_type)}`;
  const r=await fetch(url,{
    method:"PATCH",
    headers:{...headersJson(), Prefer:"return=minimal"},
    body: JSON.stringify({ last_medium_id })
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
  rotacao[group_type] = last_medium_id;
}

/** ====== Snapshot de rotação por data ====== */
async function loadRotacaoSnapshotForDate(iso){
  const rows = await sbGet(
    `rotacao_historico?select=data,mesa_dirigente_last_id,mesa_incorporacao_last_id,mesa_desenvolvimento_last_id,psicografia_dirigente_last_id&data=eq.${iso}&limit=1`
  );
  if(!rows || rows.length===0) return null;
  const r = rows[0];
  return {
    mesa_dirigente: r.mesa_dirigente_last_id || null,
    mesa_incorporacao: r.mesa_incorporacao_last_id || null,
    mesa_desenvolvimento: r.mesa_desenvolvimento_last_id || null,
    psicografia_dirigente: r.psicografia_dirigente_last_id || null
  };
}
async function upsertRotacaoSnapshotForDate(iso){
  const payload = [{
    data: iso,
    mesa_dirigente_last_id: rotacao.mesa_dirigente,
    mesa_incorporacao_last_id: rotacao.mesa_incorporacao,
    mesa_desenvolvimento_last_id: rotacao.mesa_desenvolvimento,
    psicografia_dirigente_last_id: rotacao.psicografia_dirigente,
    updated_at: new Date().toISOString()
  }];

  const r=await fetch(`${SUPABASE_URL}/rest/v1/rotacao_historico?on_conflict=data`,{
    method:"POST",
    headers:{...headersJson(), Prefer:"resolution=merge-duplicates,return=minimal"},
    body: JSON.stringify(payload)
  });
  if(!r.ok){ throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`); }
}

/** ====== Loads ====== */
async function loadBase(){
  const fer = await sbGet(`feriados?select=data`);
  feriadosSet = new Set(fer.map(x=>x.data));

  mediumsAll = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );

  const rot = await sbGet(`rotacao?select=group_type,last_medium_id`);
  rotacao = {
    mesa_dirigente: null,
    mesa_incorporacao: null,
    mesa_desenvolvimento: null,
    psicografia_dirigente: null
  };
  for(const r of rot){
    if(Object.prototype.hasOwnProperty.call(rotacao, r.group_type)){
      rotacao[r.group_type] = r.last_medium_id || null;
    }
  }

  renderProximosHeader();
}

async function loadChamadasForDate(iso){
  const rows = await sbGet(`chamadas?select=medium_id,status&data=eq.${iso}`);
  chamadasMap = new Map(rows.map(r=>[r.medium_id, (r.status||"").toUpperCase()]));
}

async function refreshCounts(){
  try{
    const rows = await sbGet(`mediums?select=id,presencas,faltas&limit=1000`);
    const map = new Map(rows.map(r=>[r.id, r]));
    mediumsAll = mediumsAll.map(m=>{
      const r = map.get(m.id);
      return r ? {...m, presencas:r.presencas, faltas:r.faltas} : m;
    });
  }catch(e){
    console.warn("refreshCounts falhou:", e.message);
  }
}

/** ====== Rotação helpers ====== */
function eligibleByGroup(group_type){
  return mediumsAll
    .filter(m=>m.active===true && m.group_type===group_type)
    .sort((a,b)=>(a.name||"").localeCompare(b.name||"","pt-BR"));
}
function eligibleDirigentePsico(){
  return mediumsAll
    .filter(m=>m.active===true && m.group_type==="dirigente" && Number(m.psicografia)===1)
    .sort((a,b)=>(a.name||"").localeCompare(b.name||"","pt-BR"));
}
function computeNext(list, lastId){
  if(list.length===0) return null;
  const idx=list.findIndex(x=>x.id===lastId);
  if(idx===-1) return list[0].id;
  return list[(idx+1)%list.length].id;
}
function advanceLastId(list, lastId, steps){
  if(!steps || steps<=0) return lastId || null;
  if(!list || list.length===0) return lastId || null;

  let cur = lastId || null;
  for(let i=0;i<steps;i++){
    cur = computeNext(list, cur);
  }
  return cur;
}
function findNameById(id){
  if(!id) return "—";
  const m = mediumsAll.find(x=>x.id===id);
  return (m && m.name) ? m.name : "—";
}
function computeNextSkip(list, lastId, forbiddenId){
  if(!list || list.length===0) return null;
  let cand = computeNext(list, lastId);
  if(forbiddenId && cand===forbiddenId && list.length>1){
    cand = computeNext(list, cand);
  }
  return cand;
}
function renderProximosHeader(){
  const dir = eligibleByGroup("dirigente");
  const inc = eligibleByGroup("incorporacao");
  const des = eligibleByGroup("desenvolvimento");
  const ps  = eligibleDirigentePsico();

  const nextDirMesaId = computeNext(dir, rotacao.mesa_dirigente);
  const nextIncMesaId = computeNext(inc, rotacao.mesa_incorporacao);
  const nextDesMesaId = computeNext(des, rotacao.mesa_desenvolvimento);
  const nextPsicoId   = computeNextSkip(ps, rotacao.psicografia_dirigente, nextDirMesaId);

  elNextMesaDirigenteName.textContent = findNameById(nextDirMesaId);
  elNextMesaIncorpName.textContent    = findNameById(nextIncMesaId);
  elNextMesaDesenvName.textContent    = findNameById(nextDesMesaId);
  elNextPsicoDirigenteName.textContent= findNameById(nextPsicoId);
}
function recomputeRotationBadges(){
  const base = rotacaoView || rotacao;

  const dir = eligibleByGroup("dirigente");
  const inc = eligibleByGroup("incorporacao");
  const des = eligibleByGroup("desenvolvimento");
  const ps  = eligibleDirigentePsico();

  nextMesaDirigenteId = computeNext(dir, base.mesa_dirigente);
  nextMesaIncorpId    = computeNext(inc, base.mesa_incorporacao);
  nextMesaDesenvId    = computeNext(des, base.mesa_desenvolvimento);
  nextPsicoDirigenteId= computeNextSkip(ps,  base.psicografia_dirigente, nextMesaDirigenteId);
}

/** ====== Render CHAMADA ====== */
function buildStatusOptions(m){
  const base=["P","M","F"];
  if(m.group_type==="dirigente") base.push("PS");
  return base;
}

function makeRowChamada(m){
  const current = chamadasMap.get(m.id) || "";

  const wrap=document.createElement("div");
  wrap.className="itemRow";

  if(m.group_type==="dirigente"){
    if(m.id===nextMesaDirigenteId) wrap.classList.add("nextMesa");
    if(m.id===nextPsicoDirigenteId) wrap.classList.add("nextPsico");
  }
  if(m.group_type==="incorporacao" && m.id===nextMesaIncorpId) wrap.classList.add("nextMesa");
  if(m.group_type==="desenvolvimento" && m.id===nextMesaDesenvId) wrap.classList.add("nextMesa");

  const left=document.createElement("div"); left.className="itemLeft";
  const title=document.createElement("div"); title.className="itemName"; title.textContent=m.name||"(sem nome)";

  const meta=document.createElement("div"); meta.className="itemMeta";
  const pres=Number(m.presencas||0), falt=Number(m.faltas||0);
  const denom=pres+falt;
  const presPct=denom?Math.round((pres/denom)*100):0;
  const faltPct=denom?Math.round((falt/denom)*100):0;
  meta.textContent=`Presenças: ${pres} | Faltas: ${falt} | Presença: ${presPct}% | Faltas: ${faltPct}%`;

  const badges=document.createElement("div"); badges.className="badges";

  if(m.group_type==="dirigente" && m.id===nextMesaDirigenteId){
    const b=document.createElement("span"); b.className="badge badgeMesa"; b.textContent="Mesa (próximo dirigente)";
    badges.appendChild(b);
  }
  if(m.group_type==="incorporacao" && m.id===nextMesaIncorpId){
    const b=document.createElement("span"); b.className="badge badgeMesa"; b.textContent="Mesa (próximo incorp.)";
    badges.appendChild(b);
  }
  if(m.group_type==="desenvolvimento" && m.id===nextMesaDesenvId){
    const b=document.createElement("span"); b.className="badge badgeMesa"; b.textContent="Mesa (próximo desenv.)";
    badges.appendChild(b);
  }
  if(m.group_type==="dirigente" && m.id===nextPsicoDirigenteId){
    const b=document.createElement("span"); b.className="badge badgePsico"; b.textContent="Psicografia (próximo)";
    badges.appendChild(b);
  }

  left.appendChild(title);
  left.appendChild(meta);
  left.appendChild(badges);

  const right=document.createElement("div"); right.className="itemRight";
  const radios=document.createElement("div"); radios.className="radioGroup";

  for(const s of buildStatusOptions(m)){
    const id=`r_${m.id}_${s}`;

    const inp=document.createElement("input");
    inp.type="radio"; inp.name=`st_${m.id}`; inp.id=id; inp.value=s;
    inp.checked=(current===s);

    const lbl=document.createElement("label");
    lbl.className="radioLbl"; lbl.setAttribute("for",id);

    const dot=document.createElement("span"); dot.className="dot";
    const txt=document.createElement("span"); txt.className="radioTxt"; txt.textContent=s;
    lbl.appendChild(dot); lbl.appendChild(txt);

    inp.addEventListener("change", async ()=>{
      if(!currentDateISO){ setErro("Selecione a data e verifique."); return; }

      chamadasMap.set(m.id, s);
      renderResumo();

      try{
        await sbUpsertChamadas([{ medium_id:m.id, data: currentDateISO, status:s }]);
        setOk("Salvo.");
      }catch(e){
        setErro("Erro ao salvar: " + e.message);
      }
    });

    radios.appendChild(inp);
    radios.appendChild(lbl);
  }

  const btn=document.createElement("button");
  btn.className="btnSmall"; btn.textContent="Limpar";
  btn.addEventListener("click", async ()=>{
    if(!currentDateISO){ setErro("Selecione a data e verifique."); return; }
    chamadasMap.set(m.id,"");
    try{
      await sbDeleteChamada(m.id, currentDateISO);
      chamadasMap.delete(m.id);
      renderChamada();
      setOk("Limpo.");
    }catch(e){
      setErro("Erro ao limpar: " + e.message);
    }
  });

  right.appendChild(radios);
  right.appendChild(btn);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}

function clearChamadaLists(){
  listaDirigentes.innerHTML="";
  listaIncorporacao.innerHTML="";
  listaDesenvolvimento.innerHTML="";
  listaCarencia.innerHTML="";
}
function renderChamada(){
  clearChamadaLists();
  recomputeRotationBadges();

  const activeOnly = mediumsAll.filter(m=>m.active===true);

  const grupos = {
    dirigente: listaDirigentes,
    incorporacao: listaIncorporacao,
    desenvolvimento: listaDesenvolvimento,
    carencia: listaCarencia
  };

  for(const m of activeOnly){
    const target = grupos[m.group_type];
    if(!target) continue;
    target.appendChild(makeRowChamada(m));
  }

  renderResumo();
}

function renderResumo(){
  let p=0, mm=0, f=0, ps=0;
  const reservas=[];
  const activeOnly=mediumsAll.filter(m=>m.active===true);

  for(const med of activeOnly){
    const st=(chamadasMap.get(med.id)||"").toUpperCase();
    if(st==="P") p++;
    if(st==="M"){ mm++; reservas.push(med.name); }
    if(st==="F") f++;
    if(st==="PS") ps++;
  }

  const presPct = (p+mm+f) ? Math.round(((p+mm)/(p+mm+f))*100) : 0;
  const faltPct = (p+mm+f) ? Math.round((f/(p+mm+f))*100) : 0;

  elResumoGeral.textContent = `P:${p} M:${mm} F:${f} PS:${ps} | Presença:${presPct}% | Faltas:${faltPct}%`;
  elReservasMesa.textContent = reservas.length ? reservas.join(", ") : "—";
}

/** ====== Verificar data / salvar tudo ====== */
async function onVerificar(){
  setErro("");
  const val = elData.value || "";

  let iso=null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(val)) iso=val;
  else iso=parseBRtoISO(val);

  if(!iso) return setErro("Data inválida.");
  if(!isTuesday(iso)) return setErro("Essa data não é terça-feira.");
  if(feriadosSet.has(iso)) return setErro("Essa data está marcada como feriado.");

  currentDateISO=iso;

  rotacaoView = await loadRotacaoSnapshotForDate(iso);
  rotacaoStart = deepCopy(rotacaoView || rotacao);

  if(rotacaoView){
    setOk(`Data válida: ${formatISOtoBR(iso)} • (modo histórico fiel)`);
  }else{
    setOk(`Data válida: ${formatISOtoBR(iso)} • (sem snapshot — usando rotação atual)`);
  }

  await loadChamadasForDate(iso);
  renderChamada();
  await refreshCounts();
  renderChamada();
  renderProximosHeader();
}

async function onSalvarTudo(){
  if(!currentDateISO) return setErro("Selecione uma data e clique em Verificar data.");

  try{
    const activeOnly=mediumsAll.filter(m=>m.active===true);
    const rows=activeOnly
      .map(m=>({ medium_id:m.id, data: currentDateISO, status:(chamadasMap.get(m.id)||"").toUpperCase() }))
      .filter(r=>["P","M","F","PS"].includes(r.status));
    await sbUpsertChamadas(rows);
    await refreshCounts();

    const base = rotacaoStart || rotacaoView || rotacao;

    const dirList = eligibleByGroup("dirigente");
    const incList = eligibleByGroup("incorporacao");
    const desList = eligibleByGroup("desenvolvimento");
    const psList  = eligibleDirigentePsico();

    const countMesaDir = activeOnly.filter(m=>m.group_type==="dirigente" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").length;
    const countMesaInc = activeOnly.filter(m=>m.group_type==="incorporacao" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").length;
    const countMesaDes = activeOnly.filter(m=>m.group_type==="desenvolvimento" && (chamadasMap.get(m.id)||"").toUpperCase()==="M").length;
    const countPsico   = activeOnly.filter(m=>m.group_type==="dirigente" && (chamadasMap.get(m.id)||"").toUpperCase()==="PS").length;

    const newLastMesaDir = advanceLastId(dirList, base.mesa_dirigente, countMesaDir);
    const newLastMesaInc = advanceLastId(incList, base.mesa_incorporacao, countMesaInc);
    const newLastMesaDes = advanceLastId(desList, base.mesa_desenvolvimento, countMesaDes);
    const newLastPsico   = advanceLastId(psList,  base.psicografia_dirigente, countPsico);

    if(countMesaDir>0) await sbPatchRotacao("mesa_dirigente", newLastMesaDir);
    if(countMesaInc>0) await sbPatchRotacao("mesa_incorporacao", newLastMesaInc);
    if(countMesaDes>0) await sbPatchRotacao("mesa_desenvolvimento", newLastMesaDes);
    if(countPsico>0)   await sbPatchRotacao("psicografia_dirigente", newLastPsico);

    await upsertRotacaoSnapshotForDate(currentDateISO);
    rotacaoView = await loadRotacaoSnapshotForDate(currentDateISO);

    renderProximosHeader();

    rotacaoView = null;
    rotacaoStart = null;

    recomputeRotationBadges();
    renderChamada();

    setOk("Chamada salva (rotação avançada corretamente).");
  }catch(e){
    setErro("Erro ao salvar chamada: " + e.message);
  }
}

/** ====== PARTICIPANTES (CRUD) ====== */
function groupLabel(gt){
  if(gt==="dirigente") return "Dirigente";
  if(gt==="incorporacao") return "Incorporação";
  if(gt==="desenvolvimento") return "Desenvolvimento";
  if(gt==="carencia") return "Carência";
  return gt||"—";
}
function matchesFilter(m){
  const g=(partFiltroGrupo.value||"").trim();
  const q=(partBusca.value||"").trim().toLowerCase();
  if(g && m.group_type!==g) return false;
  if(q && !(m.name||"").toLowerCase().includes(q)) return false;
  return true;
}
function makeRowParticipante(m){
  const wrap=document.createElement("div");
  wrap.className="partRow";

  const left=document.createElement("div");
  left.className="partLeft";
  const title=document.createElement("div");
  title.className="partName";
  title.textContent=m.name||"(sem nome)";
  const meta=document.createElement("div");
  meta.className="partMeta";
  meta.textContent=`${groupLabel(m.group_type)} • ${m.active?"Ativo":"Inativo"} • Mesa:${Number(m.mesa)===1?"Sim":"Não"} • Psicografia:${Number(m.psicografia)===1?"Sim":"Não"}`;
  left.appendChild(title);
  left.appendChild(meta);

  const right=document.createElement("div");
  right.className="partRight";

  const btnEdit=document.createElement("button");
  btnEdit.className="btnSmall";
  btnEdit.textContent="Editar";
  btnEdit.addEventListener("click", ()=>openEditor(m));

  const btnDel=document.createElement("button");
  btnDel.className="btnSmall danger";
  btnDel.textContent="Excluir";
  btnDel.addEventListener("click", async ()=>{
    if(!confirm(`Excluir "${m.name}"?`)) return;
    try{
      await sbDelete("mediums", `id=eq.${m.id}`);
      pOk("Excluído.");
      await reloadParticipants();
      await loadBase();
      if(currentDateISO) await loadChamadasForDate(currentDateISO);
      renderChamada();
    }catch(e){ pErr("Erro ao excluir: "+e.message); }
  });

  right.appendChild(btnEdit);
  right.appendChild(btnDel);

  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}
function renderParticipants(){
  listaParticipantes.innerHTML="";
  const filtered=mediumsAll.filter(matchesFilter);
  if(filtered.length===0){
    const empty=document.createElement("div");
    empty.className="empty";
    empty.textContent="Nenhum participante encontrado.";
    listaParticipantes.appendChild(empty);
    return;
  }
  for(const m of filtered) listaParticipantes.appendChild(makeRowParticipante(m));
}
async function reloadParticipants(){
  mediumsAll = await sbGet(
    `mediums?select=id,name,group_type,faltas,presencas,mesa,psicografia,carencia_total,carencia_atual,primeira_incorporacao,active&order=name.asc`
  );
  renderParticipants();
}
function openEditor(m){
  const modal=document.createElement("div");
  modal.className="modalBackdrop";
  const box=document.createElement("div");
  box.className="modalBox";

  box.innerHTML=`
    <div class="modalTitle">Editar participante</div>
    <div class="grid2">
      <div>
        <label class="label">Nome</label>
        <input id="edNome" class="input" value="${(m.name||"").replace(/"/g,"&quot;")}" />
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
      <label class="check"><input id="edMesa" type="checkbox" /> <span>Pode sentar na mesa</span></label>
      <label class="check"><input id="edPsico" type="checkbox" /> <span>Pode psicografar</span></label>
    </div>

    <div class="actionsRow" style="margin-top:14px;">
      <button id="btnSalvarEd" class="btn primary" type="button">Salvar</button>
      <button id="btnCancelarEd" class="btn" type="button">Cancelar</button>
    </div>
    <div id="edErr" class="msgErr"></div>
  `;

  modal.appendChild(box);
  document.body.appendChild(modal);

  const edNome=box.querySelector("#edNome");
  const edGrupo=box.querySelector("#edGrupo");
  const edAtivo=box.querySelector("#edAtivo");
  const edMesa=box.querySelector("#edMesa");
  const edPsico=box.querySelector("#edPsico");
  const edErr=box.querySelector("#edErr");

  edGrupo.value = m.group_type || "incorporacao";
  edAtivo.checked = !!m.active;
  edMesa.checked = Number(m.mesa)===1;
  edPsico.checked = Number(m.psicografia)===1;

  box.querySelector("#btnCancelarEd").addEventListener("click", ()=>modal.remove());

  box.querySelector("#btnSalvarEd").addEventListener("click", async ()=>{
    edErr.textContent="";
    const name=(edNome.value||"").trim();
    const group_type=edGrupo.value;
    if(!name){ edErr.textContent="Nome é obrigatório."; return; }

    try{
      await sbPatch("mediums", `id=eq.${m.id}`,{
        name,
        group_type,
        active: !!edAtivo.checked,
        mesa: edMesa.checked ? 1 : 0,
        psicografia: edPsico.checked ? 1 : 0,
        updated_at: new Date().toISOString()
      });

      pOk("Atualizado.");
      modal.remove();

      await loadBase();
      await reloadParticipants();
      if(currentDateISO) await loadChamadasForDate(currentDateISO);
      renderChamada();
    }catch(e){
      edErr.textContent="Erro ao salvar: "+e.message;
    }
  });
}
async function onAdicionarParticipante(){
  pOk(""); pErr("");

  const name=(novoNome.value||"").trim();
  const group_type=novoGrupo.value || "incorporacao";
  const active=!!novoAtivo.checked;

  if(!name) return pErr("Informe o nome.");

  const payload = {
    name,
    group_type,
    active,
    faltas: 0,
    presencas: 0,
    mesa: (novoMesa.checked ? 1 : 0),
    psicografia: (novoPsico.checked ? 1 : 0),
    carencia_total: 0,
    carencia_atual: 0,
    primeira_incorporacao: false,
    inserted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try{
    await sbPost("mediums", [payload], "return=minimal");
    pOk("Participante adicionado.");

    novoNome.value="";
    novoMesa.checked=false;
    novoPsico.checked=false;
    novoAtivo.checked=true;

    await loadBase();
    await reloadParticipants();
    if(currentDateISO) await loadChamadasForDate(currentDateISO);
    renderChamada();
  }catch(e){
    pErr("Erro ao adicionar: " + e.message);
  }
}

/** ====== Tabs ====== */
function showTab(which){
  const isChamada = which==="chamada";
  viewChamada.style.display = isChamada ? "" : "none";
  viewParticipantes.style.display = isChamada ? "none" : "";
  tabChamada.classList.toggle("active", isChamada);
  tabParticipantes.classList.toggle("active", !isChamada);
  if(!isChamada) renderParticipants();
}

/** ====== Boot ====== */
(async function init(){
  try{
    setConn(false,"Conectando...");
    await loadBase();
    setConn(true,"Supabase OK");
    setOk("Selecione a data e clique em “Verificar data”.");
    renderParticipants();
  }catch(e){
    setConn(false,"Erro");
    setErro("Falha ao conectar: " + e.message);
    pErr("Falha ao conectar: " + e.message);
  }

  btnVerificar.addEventListener("click", onVerificar);
  btnSalvar.addEventListener("click", onSalvarTudo);

  tabChamada.addEventListener("click", ()=>showTab("chamada"));
  tabParticipantes.addEventListener("click", ()=>showTab("participantes"));

  btnRecarregarParticipantes.addEventListener("click", async ()=>{
    try{
      await reloadParticipants();
      pOk("Recarregado.");
    }catch(e){
      pErr("Erro ao recarregar: " + e.message);
    }
  });

  partFiltroGrupo.addEventListener("change", renderParticipants);
  partBusca.addEventListener("input", renderParticipants);

  btnAdicionarParticipante.addEventListener("click", onAdicionarParticipante);
})();
