const CHURCHES=["Central","Cachoeira da Serra","Jardim Vitória","Jardim Planalto","PDS Brasília","Vila Isol","Terra Nossa","Pedra Alta"];
const AREAS={"Identidade":"#ff0046","Liderança":"#00bddd","Novas Gerações":"#ffb800","Discipulado":"#00c97b"};
const AREA_ICONS={"Identidade":"assets/icone_identidade.png","Liderança":"assets/icone_lideranca.png","Novas Gerações":"assets/icone_novasgeracoes.png","Discipulado":"assets/icone_discipulado.png"};
const USERS=[
 {id:"USR-KEVIN",email:"kevin.fernandes@adventistas.org",code:"2515",name:"Kevin Fernandes",role:"Pastor Distrital",church:"Todas",district:"Castelo de Sonhos",active:true,area:"Castelo de Sonhos"},
 {id:"USR-ADMIN",email:"admin",code:"1844",name:"Administrador Master",role:"Administrador da Missão",church:"Todas",district:"Todos",active:true,area:"Todas"},
 {id:"USR-SECRETARIA-CENTRAL",email:"secretaria@central.org",code:"1234",name:"Secretaria IASD Central",role:"Ancião/Secretária Local",church:"Central",district:"Castelo de Sonhos",active:true,area:"IASD Central"}
];
let user=null,records=[],tasks=[],evidences=[],systemUsers=[],churchStats=[],requirements=[],churchProfiles=[],dailyVerse=null,currentAiReport="",evidenceEditMode=false,selectedChurch="Todas",selectedYear="2026",selectedMonth="Todos",deferredPrompt=null,currentPriority="Identidade",selectedCriterionCode=null,criteriaStatus="Todos";
const $=id=>document.getElementById(id),clamp=n=>Math.max(0,Math.min(100,Number(n)||0)),pct=(a,b)=>b?clamp(a/b*100):0;
function toast(m){const e=$("toast");e.textContent=m;e.classList.add("show");clearTimeout(window.tt);window.tt=setTimeout(()=>e.classList.remove("show"),2800)}
function endpoint(){return window.APP_CONFIG.APPS_SCRIPT_URL}
function jsonp(url,action="list",extra={}){return new Promise((resolve,reject)=>{const cb="cb_"+Date.now()+"_"+Math.random().toString(36).slice(2),s=document.createElement("script");const timer=setTimeout(()=>{cleanup();reject(new Error("timeout"))},25000);function cleanup(){clearTimeout(timer);s.remove();try{delete window[cb]}catch(e){}}window[cb]=d=>{cleanup();resolve(d)};const u=new URL(url);u.searchParams.set("action",action);u.searchParams.set("callback",cb);u.searchParams.set("_",Date.now());Object.entries(extra).forEach(([k,v])=>u.searchParams.set(k,v));s.src=u;s.onerror=()=>{cleanup();reject(new Error("network"))};document.head.appendChild(s)})}
function normalize(r){return {...r,ano:String(r.ano),meta:Number(r.meta)||0,alcancado:Number(r.alcancado)||0,codigo:r.codigo_requisito||r.codigo}}
async function login(){
  const email=$("loginEmail").value.trim().toLowerCase();
  const code=$("loginCode").value;
  $("loginButton").disabled=true;
  $("loginButton").textContent="Entrando...";
  $("loginMessage").textContent="";
  try{
    let authenticated=null;
    try{
      const result=await jsonp(endpoint(),"login",{email,codigo:code});
      authenticated=result?.user||result?.data||null;
    }catch(_e){}
    if(!authenticated){
      authenticated=USERS.find(u=>u.email.toLowerCase()===email&&u.code===code&&u.active!==false)||null;
    }
    if(!authenticated) throw new Error("Credenciais inválidas.");
    user={
      email:authenticated.email||email,
      name:authenticated.nome||authenticated.name||email,
      role:authenticated.funcao||authenticated.perfil||authenticated.role||"Usuário",
      church:authenticated.igreja||authenticated.church||(String(authenticated.funcao||authenticated.perfil||authenticated.role||"").includes("Local")?(authenticated.area_atuacao||authenticated.area||"Central"):"Todas"),
      district:authenticated.area_atuacao||authenticated.distrito||authenticated.district||"Castelo de Sonhos"
    };
    localStorage.setItem("sessionUser",JSON.stringify(user));
    startApp();
  }catch(error){
    $("loginMessage").textContent="Usuário ou senha inválidos.";
  }finally{
    $("loginButton").disabled=false;
    $("loginButton").textContent="Entrar";
  }
}

function jsonpLong(url,action="list",extra={},timeoutMs=180000,onProgress=null){
  return new Promise((resolve,reject)=>{
    const cb="cb_long_"+Date.now()+"_"+Math.random().toString(36).slice(2);
    const script=document.createElement("script");
    let progressTimer=null;

    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error("A análise ultrapassou o tempo máximo de 3 minutos. Tente novamente."));
    },timeoutMs);

    function cleanup(){
      clearTimeout(timer);
      if(progressTimer)clearInterval(progressTimer);
      script.remove();
      try{delete window[cb]}catch(_e){}
    }

    window[cb]=data=>{
      cleanup();
      resolve(data);
    };

    const requestUrl=new URL(url);
    requestUrl.searchParams.set("action",action);
    requestUrl.searchParams.set("callback",cb);
    requestUrl.searchParams.set("_",Date.now());

    Object.entries(extra).forEach(([key,value])=>{
      requestUrl.searchParams.set(key,value);
    });

    if(typeof onProgress==="function"){
      let elapsed=0;
      progressTimer=setInterval(()=>{
        elapsed+=10;
        onProgress(elapsed);
      },10000);
    }

    script.src=requestUrl.toString();
    script.onerror=()=>{
      cleanup();
      reject(new Error("Falha de comunicação com o Apps Script."));
    };

    document.head.appendChild(script);
  });
}

function startApp(){$("loginScreen").classList.add("hidden");$("appRoot").classList.remove("hidden");$("profileName").textContent=user.name;$("profileRole").textContent=user.role;document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",!isMaster()));selectedChurch=user.church==="Todas"?"Todas":user.church;setupFilters();loadData()}
function logout(){localStorage.removeItem("sessionUser");location.reload()}
function canEditChurch(church){
  if(!user) return false;
  if(user.role==="Administrador da Missão") return true;
  if(user.role==="Pastor Distrital") return user.district==="Castelo de Sonhos";
  return user.church===church;
}
function isMaster(){return user?.role==="Administrador da Missão"}
function setupFilters(){$("churchFilter").innerHTML=["Todas",...CHURCHES].map(c=>`<option>${c}</option>`).join("");$("churchFilter").value=selectedChurch;$("churchFilter").disabled=user&&user.church!=="Todas";$("yearFilter").value=selectedYear}
async function loadData(){
  $("refreshIcon").classList.add("spin");
  try{
    const today=new Date().toISOString().slice(0,10);
    const results=await Promise.allSettled([
      jsonp(endpoint(),"list",{}),
      jsonp(endpoint(),"listChurchStats",{}),
      jsonp(endpoint(),"dailyVerse",{data:today}),
      jsonp(endpoint(),"listEvidences",{igreja:selectedChurch}),
      jsonp(endpoint(),"listRequirements",{}),
      jsonp(endpoint(),"listChurchProfiles",{})
    ]);
    if(results[0].status!=="fulfilled")throw new Error("Falha ao carregar os dados principais.");
    const main=results[0].value;
    const rows=Array.isArray(main)?main:main.data;
    if(!Array.isArray(rows))throw new Error("Resposta inválida.");
    records=rows.map(normalize);
    churchStats=results[1].status==="fulfilled"?(Array.isArray(results[1].value)?results[1].value:(results[1].value.data||[])):JSON.parse(localStorage.getItem("v84churchStats")||"[]");
    dailyVerse=results[2].status==="fulfilled"?(results[2].value.data||results[2].value):JSON.parse(localStorage.getItem("v84dailyVerse")||"null");
    evidences=results[3].status==="fulfilled"?(Array.isArray(results[3].value)?results[3].value:(results[3].value.data||[])):JSON.parse(localStorage.getItem("v84evidences")||"[]");
    requirements=results[4].status==="fulfilled"?(Array.isArray(results[4].value)?results[4].value:(results[4].value.data||[])):JSON.parse(localStorage.getItem("v84requirements")||"[]");
    churchProfiles=results[5].status==="fulfilled"?(Array.isArray(results[5].value)?results[5].value:(results[5].value.data||[])):JSON.parse(localStorage.getItem("v84churchProfiles")||"[]");
    applyDynamicGoalsV84();
    localStorage.setItem("v84records",JSON.stringify(records));
    localStorage.setItem("v84churchStats",JSON.stringify(churchStats));
    localStorage.setItem("v84dailyVerse",JSON.stringify(dailyVerse));
    localStorage.setItem("v84evidences",JSON.stringify(evidences));
    localStorage.setItem("v84requirements",JSON.stringify(requirements));
    localStorage.setItem("v84churchProfiles",JSON.stringify(churchProfiles));
    $("syncBadge").innerHTML="<i></i>Google Sheets conectado";
  }catch(e){
    console.error(e);
    records=JSON.parse(localStorage.getItem("v84records")||localStorage.getItem("v5cache")||"[]");
    churchStats=JSON.parse(localStorage.getItem("v84churchStats")||"[]");
    dailyVerse=JSON.parse(localStorage.getItem("v84dailyVerse")||"null");
    evidences=JSON.parse(localStorage.getItem("v84evidences")||"[]");
    requirements=JSON.parse(localStorage.getItem("v84requirements")||"[]");
    churchProfiles=JSON.parse(localStorage.getItem("v84churchProfiles")||"[]");
    applyDynamicGoalsV84();
    $("syncBadge").innerHTML="<i style='background:#ffb800'></i>Modo offline";
  }finally{
    $("refreshIcon").classList.remove("spin");
    renderAll();
  }
}
async function AtualizarSistema(){
  $("refreshButton").disabled=true;
  $("refreshIcon").classList.add("spin");
  try{
    await jsonp(endpoint(),"refreshSystem",{ano:selectedYear});
    await loadData();
    toast("Sistema atualizado com os dados mais recentes da planilha.");
  }catch(error){
    console.error(error);
    toast("Não foi possível concluir a atualização completa.");
  }finally{
    $("refreshButton").disabled=false;
    $("refreshIcon").classList.remove("spin");
  }
}
function filtered(){return records.filter(r=>r.ano===selectedYear&&(selectedChurch==="Todas"||r.igreja===selectedChurch))}
function aggregate(data,key){const m=new Map();data.forEach(r=>{const k=r[key];if(!m.has(k))m.set(k,{key:k,meta:0,alc:0,count:0});const x=m.get(k);x.meta+=r.meta;x.alc+=r.alcancado;x.count++});return [...m.values()].map(x=>({...x,percent:pct(x.alc,x.meta)}))}
function renderAll(){$("contextText").textContent=`${selectedChurch==="Todas"?"Distrito completo":selectedChurch} · ${selectedYear}`;$("lastUpdate").textContent="Última atualização: "+new Date().toLocaleString("pt-BR");renderMemberStats();renderDailyVerse();renderDashboard();renderPriorities();renderPlanner();renderTimeline();renderEvidence();renderRequirements();renderMyChurch();renderAdmin()}
function selectedChurchStats(){
  const empty={total:0,frequentes:0,naoFrequentes:0,transferir:0,resgatar:0};
  const map=s=>{
    const frequentes=Number(s.membros_frequentes||s.frequentes||s.membros_ativos||0);
    const naoFrequentes=Number(s.membros_nao_frequentes||s.nao_frequentes||Math.max(0,Number(s.total_membros||0)-Number(s.membros_ativos||0)));
    const transferir=Number(s.membros_a_transferir||s.a_transferir||0);
    const resgatar=Number(s.membros_a_resgatar||s.a_resgatar||0);
    const total=Number(s.total_membros||0)||(frequentes+naoFrequentes+transferir+resgatar);
    return{total,frequentes,naoFrequentes,transferir,resgatar};
  };
  if(selectedChurch==="Todas")return churchStats.reduce((a,s)=>{const x=map(s);return{total:a.total+x.total,frequentes:a.frequentes+x.frequentes,naoFrequentes:a.naoFrequentes+x.naoFrequentes,transferir:a.transferir+x.transferir,resgatar:a.resgatar+x.resgatar}},empty);
  return map(churchStats.find(x=>String(x.igreja)===String(selectedChurch))||{});
}
function renderMemberStats(){
  const s=selectedChurchStats();
  $("totalMembers").textContent=s.total;
  $("frequentMembers").textContent=s.frequentes;
  $("infrequentMembers").textContent=s.naoFrequentes;
  $("transferMembers").textContent=s.transferir;
  $("rescueMembers").textContent=s.resgatar;
  document.querySelectorAll("[data-member-edit]").forEach(b=>b.disabled=selectedChurch==="Todas"||!canEditChurch(selectedChurch));
}
function openMembersModal(){if(selectedChurch==="Todas")return toast("Selecione uma igreja para editar os membros.");if(!canEditChurch(selectedChurch))return;const s=selectedChurchStats();$("membersChurchName").textContent=selectedChurch;$("membersFrequentInput").value=s.frequentes;$("membersInfrequentInput").value=s.naoFrequentes;$("membersTransferInput").value=s.transferir;$("membersRescueInput").value=s.resgatar;updateMembersTotal();$("membersModal").classList.add("open")}
function updateMembersTotal(){$("membersTotalPreview").textContent=["membersFrequentInput","membersInfrequentInput","membersTransferInput","membersRescueInput"].reduce((s,id)=>s+(Number($(id).value)||0),0)}
async function saveMemberStats(){if(selectedChurch==="Todas"||!canEditChurch(selectedChurch))return;const row={igreja:selectedChurch,membros_frequentes:Number($("membersFrequentInput").value)||0,membros_nao_frequentes:Number($("membersInfrequentInput").value)||0,membros_a_transferir:Number($("membersTransferInput").value)||0,membros_a_resgatar:Number($("membersRescueInput").value)||0};row.total_membros=row.membros_frequentes+row.membros_nao_frequentes+row.membros_a_transferir+row.membros_a_resgatar;const body=new URLSearchParams({action:"saveChurchStats",...Object.fromEntries(Object.entries(row).map(([k,v])=>[k,String(v)])),usuario:user.email});$("saveMembersButton").disabled=true;try{await fetch(endpoint(),{method:"POST",mode:"no-cors",body});const idx=churchStats.findIndex(x=>x.igreja===selectedChurch);if(idx>=0)churchStats[idx]={...churchStats[idx],...row};else churchStats.push(row);localStorage.setItem("v83churchStats",JSON.stringify(churchStats));applyDynamicGoalsV84();renderMemberStats();renderDashboard();renderPriorities();$("membersModal").classList.remove("open");toast("Quantidade de membros salva e metas recalculadas.")}finally{$("saveMembersButton").disabled=false}}
function renderDailyVerse(){const text=dailyVerse?.texto_biblico||dailyVerse?.texto||"Tudo quanto fizerdes, fazei-o de todo o coração. — Colossenses 3:23";$("dailyBibleVerse").textContent=text}
function applyDynamicGoalsV84(){
  const statsMap=new Map(churchStats.map(s=>[String(s.igreja),s]));
  records=records.map(r=>{
    if(String(r.codigo)==="ID-01"){
      const s=statsMap.get(String(r.igreja))||{};
      const frequentes=Number(s.membros_frequentes||s.membros_ativos||0);
      return{...r,meta:Math.ceil(frequentes*0.60)};
    }
    return r;
  });
}
function renderDashboard(){const data=filtered(),total=data.reduce((a,r)=>({m:a.m+r.meta,a:a.a+r.alcancado}),{m:0,a:0}),p=pct(total.a,total.m);$("overallRadial").style.setProperty("--value",p);$("overallPercent").textContent=Math.round(p)+"%";$("overallGoal").textContent=Math.round(total.m);$("overallReached").textContent=Math.round(total.a);const areas=aggregate(data,"area");$("priorityCards").innerHTML=Object.entries(AREAS).map(([area,color])=>{const x=areas.find(v=>v.key===area)||{percent:0,alc:0,meta:0};return `<button type="button" class="priority-card" data-area="${area}" style="--accent:${color}"><div style="display:flex;align-items:center;justify-content:space-between"><img class="priority-card-icon-v8" src="${AREA_ICONS[area]}" alt=""><strong>${Math.round(x.percent)}%</strong></div><h3>${area}</h3><p>${Math.round(x.alc)} de ${Math.round(x.meta)} realizados</p><div class="progress"><i style="width:${x.percent}%"></i></div></button>`}).join("");document.querySelectorAll(".priority-card").forEach(b=>b.onclick=()=>openPriorityV6(b.dataset.area));const ranking=aggregate(data,"igreja").sort((a,b)=>b.percent-a.percent);$("rankingList").innerHTML=ranking.map((x,i)=>`<div class="ranking-item"><b>${i+1}</b><div><strong>${x.key}</strong><span>${Math.round(x.alc)} de ${Math.round(x.meta)}</span></div><strong>${Math.round(x.percent)}%</strong></div>`).join("");$("trafficGrid").innerHTML=areas.map(x=>{const c=x.percent>=80?"#00c97b":x.percent>=60?"#ffb800":"#ff0046";return `<div class="traffic-card"><strong><i class="traffic-status-dot" style="background:${c}"></i>${x.key}</strong><span>${Math.round(x.percent)}% alcançado</span><img class="traffic-priority-icon" src="${AREA_ICONS[x.key]}" alt="Ícone de ${x.key}"></div>`}).join("");const alerts=data.filter(r=>pct(r.alcancado,r.meta)<60).sort((a,b)=>pct(a.alcancado,a.meta)-pct(b.alcancado,b.meta)).slice(0,8);$("alertsList").innerHTML=alerts.map(r=>`<div class="alert-item"><img class="alert-priority-icon" src="${AREA_ICONS[r.area]||AREA_ICONS["Identidade"]}" alt="Ícone de ${r.area}"><div><strong>${r.titulo}</strong><span>${r.igreja} · ${r.area}</span></div><strong>${Math.round(pct(r.alcancado,r.meta))}%</strong></div>`).join("");drawEvolution()}
function drawEvolution(){const c=$("evolutionChart"),ctx=c.getContext("2d"),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle="#dbe6ea";ctx.lineWidth=1;for(let i=1;i<5;i++){let y=i*h/5;ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(w-20,y);ctx.stroke()}const vals=[28,35,42,49,58,62,68,71,74,79,83,87].map((v,i)=>clamp(v+(selectedChurch==="Todas"?0:(selectedChurch.length+i)%7)));ctx.strokeStyle="#00bddd";ctx.lineWidth=4;ctx.beginPath();vals.forEach((v,i)=>{const x=45+i*(w-70)/11,y=h-30-v*(h-55)/100;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.fillStyle="#102333";ctx.font="12px Inter";["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].forEach((m,i)=>ctx.fillText(m,35+i*(w-70)/11,h-8))}

function openPriorityV6(area){currentPriority=area;selectedCriterionCode=null;showView("priorities");renderPriorities();document.querySelectorAll("[data-priority]").forEach(b=>b.classList.toggle("active",b.dataset.priority===area))}
function renderPriorities(){
  const cfgColor=AREAS[currentPriority];
  document.documentElement.style.setProperty("--current",cfgColor);
  $("priorityAreaTitle").textContent=currentPriority;
  const shapeMap={"Identidade":"circle","Liderança":"triangle","Novas Gerações":"half","Discipulado":"square"};
  const areaDescriptions={"Identidade":"Fortalecer a identidade profética da Igreja, as crenças fundamentais e o estilo de vida adventista.","Liderança":"Formar e desenvolver líderes, fortalecendo competências espirituais, administrativas e pastorais.","Novas Gerações":"Integrar crianças, adolescentes e jovens à comunhão, fidelidade, liderança e missão.","Discipulado":"Desenvolver comunhão, relacionamento, missão e multiplicação por meio de uma jornada contínua de discipulado."};
  $("priorityAreaDescription").textContent=areaDescriptions[currentPriority]||"";
  $("priorityShapeV7").src=AREA_ICONS[currentPriority];
  $("priorityShapeV7").alt=`Ícone de ${currentPriority}`;$("priorityWatermarkV8").src=AREA_ICONS[currentPriority];
  $("priorityTabs").innerHTML=Object.entries(AREAS).map(([area,color])=>{const count=new Set(records.filter(r=>r.area===area&&r.ano===selectedYear&&(selectedChurch==="Todas"||r.igreja===selectedChurch)).map(r=>r.codigo)).size;return `<button class="priority-tab-v7 ${area===currentPriority?"active":""}" data-area="${area}" style="--tab:${color}"><span class="priority-tab-copy-v7"><img class="priority-tab-icon-v8" src="${AREA_ICONS[area]}" alt="">${area}</span><small>${count} critérios</small></button>`}).join("");
  document.querySelectorAll(".priority-tab-v7").forEach(b=>b.onclick=()=>{currentPriority=b.dataset.area;selectedCriterionCode=null;renderPriorities()});
  const rows=aggregateCriteriaV51();
  const totalGoal=rows.reduce((s,r)=>s+Number(r.meta||0),0),totalReached=rows.reduce((s,r)=>s+Number(r.alcancado||0),0),totalPercent=totalGoal?clamp(totalReached/totalGoal*100):0;
  $("priorityPercentV7").textContent=Math.round(totalPercent)+"%";$("priorityProgressV7").style.width=totalPercent+"%";$("priorityGoalV7").textContent=Math.round(totalGoal);$("priorityReachedV7").textContent=Math.round(totalReached);$("priorityCountV7").textContent=rows.length;
  const visible=rows.filter(r=>criteriaStatus==="Todos"||situationV51(percentV51(r))===criteriaStatus);
  $("criteriaListV51").innerHTML=visible.map((r,i)=>`<button class="criterion-v51 ${selectedCriterionCode===r.codigo?"active":""}" data-code="${r.codigo}"><b>${String(i+1).padStart(2,"0")}</b><span><strong>${r.titulo}</strong><small>${situationV51(percentV51(r))}</small></span><em>${Math.round(percentV51(r))}%</em></button>`).join("");
  document.querySelectorAll(".criterion-v51").forEach(b=>b.onclick=()=>{selectedCriterionCode=b.dataset.code;renderPriorities()});
  if(!selectedCriterionCode&&rows[0]) selectedCriterionCode=rows[0].codigo;
  renderCriterionFormV51();
}
function aggregateCriteriaV51(){
  const m=new Map();
  filtered().filter(r=>r.area===currentPriority).forEach(r=>{
    const k=r.codigo;
    if(!m.has(k))m.set(k,{...r,meta:0,alcancado:0});
    const x=m.get(k);
    x.meta+=Number(r.meta)||0;
    x.alcancado+=Number(r.alcancado)||0;
    if(selectedChurch!=="Todas")Object.assign(x,r);
  });
  return [...m.values()];
}
function percentV51(r){return Number(r.meta)>0?clamp(Number(r.alcancado)/Number(r.meta)*100):0}
function situationV51(p){return p>=100?"Concluído":p>=60?"Em andamento":"Atenção"}
function selectedCriterionRecordV51(){
  if(selectedChurch==="Todas")return aggregateCriteriaV51().find(r=>r.codigo===selectedCriterionCode);
  return filtered().find(r=>r.area===currentPriority&&r.codigo===selectedCriterionCode);
}
function renderCriterionFormV51(){
  const r=selectedCriterionRecordV51();
  if(!r)return;
  const p=percentV51(r);
  $("criterionTitleV51").textContent=r.titulo;
  $("criterionStatusV51").textContent=situationV51(p);
  $("criterionDescriptionV51").textContent=r.descricao||"";
  $("criterionQuestionV51").textContent=r.pergunta||"";
  $("actionPlanV51").value=r.plano_acao||"";
  $("goalInputV51").value=r.meta||0;
  $("reachedInputV51").value=r.alcancado||0;
  $("responsibleInputV51").value=r.responsavel||"";
  $("dateInputV51").value=normalizeDateV51(r.data_inicial);
  $("voteInputV51").value=r.voto||"";
  $("materialInputV51").value=r.material||"";
  updateLiveV51();
  const disabled=selectedChurch==="Todas"||!canEditChurch(selectedChurch);
  ["actionPlanV51","goalInputV51","reachedInputV51","responsibleInputV51","dateInputV51","voteInputV51","materialInputV51","saveCriterionV51"].forEach(id=>$(id).disabled=disabled);
  $("saveCriterionV51").textContent=disabled?"Selecione uma igreja para editar":"Salvar na planilha";
}
function normalizeDateV51(v){
  if(!v)return"";
  const s=String(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(s))return s.split("/").reverse().join("-");
  return"";
}
function updateLiveV51(){
  const g=Number($("goalInputV51").value)||0,a=Number($("reachedInputV51").value)||0,p=g?clamp(a/g*100):0;
  $("livePercentV51").textContent=Math.round(p)+"%";
  $("liveProgressV51").style.width=p+"%";
  $("criterionStatusV51").textContent=situationV51(p);
}
async function saveCriterionV51(){
  if(selectedChurch==="Todas"||!canEditChurch(selectedChurch))return;
  const r=selectedCriterionRecordV51();
  if(!r)return;
  const body=new URLSearchParams({
    action:"save",
    id:r.id,
    igreja:selectedChurch,
    distrito:"Castelo de Sonhos",
    ano:selectedYear,
    codigo_requisito:r.codigo,
    area:r.area,
    titulo:r.titulo,
    descricao:r.descricao||"",
    pergunta:r.pergunta||"",
    meta:$("goalInputV51").value,
    alcancado:$("reachedInputV51").value,
    plano_acao:$("actionPlanV51").value,
    responsavel:$("responsibleInputV51").value,
    data_inicial:$("dateInputV51").value,
    voto:$("voteInputV51").value,
    material:$("materialInputV51").value,
    usuario:user.email
  });
  $("saveCriterionV51").disabled=true;
  $("saveCriterionV51").textContent="Salvando...";
  try{
    await fetch(endpoint(),{method:"POST",mode:"no-cors",body});
    await new Promise(r=>setTimeout(r,1200));
    await loadData();
    toast("Critério salvo com sucesso.");
  }catch(e){toast("Não foi possível salvar.");}
  finally{$("saveCriterionV51").disabled=false;}
}

function normalizeTaskArea(task){
  if(task.area&&AREAS[task.area])return task.area;
  const record=records.find(r=>r.titulo===task.title);
  return record?.area||"Identidade";
}
function renderPlanner(){
  if(!tasks.length)tasks=JSON.parse(localStorage.getItem("v81tasks")||localStorage.getItem("v5tasks")||"[]");
  if(!tasks.length){filtered().slice(0,9).forEach((r,i)=>tasks.push({id:Date.now()+i,title:r.titulo,owner:r.responsavel||"Não definido",due:"2026-12-31",status:["Não iniciado","Em andamento","Concluído"][i%3],area:r.area}))}
  tasks=tasks.map(t=>({...t,area:normalizeTaskArea(t)}));
  const statuses=["Não iniciado","Em andamento","Concluído"];
  $("kanbanBoard").innerHTML=statuses.map(s=>`<section class="kanban-column"><h3>${s}</h3>${tasks.filter(t=>t.status===s).map(t=>`<article class="task-card" style="--task-color:${AREAS[t.area]}"><button type="button" class="task-edit-button" data-edit-task="${t.id}" title="Editar item">✎</button><span class="task-card-area"><img src="${AREA_ICONS[t.area]}" alt="">${t.area}</span><strong>${t.title}</strong><span>${t.owner}</span><span>Prazo: ${t.due||"—"}</span></article>`).join("")}</section>`).join("");
  document.querySelectorAll("[data-edit-task]").forEach(b=>b.onclick=()=>openTaskModal(b.dataset.editTask));
}
function renderTimeline(){
  const items=[...tasks].sort((a,b)=>(a.due||"").localeCompare(b.due||""));
  $("timelineList").innerHTML=items.map(t=>`<article class="timeline-item" style="--timeline-color:${AREAS[t.area]||AREAS.Identidade}"><strong>${t.title}</strong><span class="timeline-area"><img src="${AREA_ICONS[t.area]||AREA_ICONS.Identidade}" alt="">${t.area||"Identidade"}</span><span>${t.owner} · ${t.status} · ${t.due||"Sem prazo"}</span></article>`).join("");
}
function openTaskModal(id=null){
  const task=id?tasks.find(t=>String(t.id)===String(id)):null;
  $("taskModalTitle").textContent=task?"Editar item do planejamento":"Nova tarefa";
  $("taskId").value=task?.id||"";$("taskTitle").value=task?.title||"";$("taskArea").value=task?.area||currentPriority||"Identidade";$("taskOwner").value=task?.owner||"";$("taskDue").value=task?.due||"";$("taskStatus").value=task?.status||"Não iniciado";
  $("deleteTask").classList.toggle("hidden",!task);$("taskModal").classList.add("open");
}
function saveTaskItem(){
  const id=$("taskId").value,title=$("taskTitle").value.trim();if(!title)return toast("Informe o título da tarefa.");
  const data={id:id||Date.now(),title,area:$("taskArea").value,owner:$("taskOwner").value||"Não definido",due:$("taskDue").value,status:$("taskStatus").value};
  const idx=tasks.findIndex(t=>String(t.id)===String(id));if(idx>=0)tasks[idx]=data;else tasks.push(data);
  localStorage.setItem("v81tasks",JSON.stringify(tasks));$("taskModal").classList.remove("open");renderPlanner();renderTimeline();toast(idx>=0?"Item atualizado.":"Tarefa criada.");
}
function deleteTaskItem(){const id=$("taskId").value;if(!id)return;if(!confirm("Excluir este item do planejamento?"))return;tasks=tasks.filter(t=>String(t.id)!==String(id));localStorage.setItem("v81tasks",JSON.stringify(tasks));$("taskModal").classList.remove("open");renderPlanner();renderTimeline();toast("Item excluído.")}
function renderEvidence(){
  const opts=filtered().map(r=>`<option value="${r.id}">${r.igreja} · ${r.titulo}</option>`).join("");
  $("evidenceCriterion").innerHTML=opts;$("editEvidenceCriterion").innerHTML=opts;
  const visible=evidences.filter(e=>selectedChurch==="Todas"||!e.igreja||e.igreja===selectedChurch);
  $("evidenceGallery").classList.toggle("editing",evidenceEditMode);
  $("toggleEvidenceEdit").textContent=evidenceEditMode?"✓ Concluir edição":"✎ Editar evidências";
  $("evidenceGallery").innerHTML=visible.map(e=>{
    const src=e.url||e.preview||"";const isImage=(e.mime_type||e.mimeType||"").startsWith("image/")||/\.(png|jpe?g|webp|gif)$/i.test(e.arquivo||e.fileName||src);
    return `<article class="evidence-card masonry-item" data-evidence-id="${e.id}">${isImage&&src?`<img src="${src}" alt="${escapeAdmin(e.descricao||"Evidência")}" loading="lazy">`:`<div class="document-placeholder">📄</div>`}<div class="evidence-caption"><strong>${escapeAdmin(e.descricao||"Evidência")}</strong><span>${escapeAdmin(e.arquivo||e.fileName||"")}</span></div>${evidenceEditMode?`<button type="button" class="evidence-edit-button" data-edit-evidence="${e.id}">✎ Editar</button>`:""}</article>`
  }).join("");
  document.querySelectorAll("[data-edit-evidence]").forEach(b=>b.onclick=()=>openEvidenceEdit(b.dataset.editEvidence));
}
async function uploadEvidence(){
  const file=$("evidenceFile").files[0];if(!file)return toast("Selecione um arquivo.");
  const reader=new FileReader();reader.onload=async()=>{
    const base64=String(reader.result).split(",")[1]||"";const criterion=records.find(r=>r.id===$("evidenceCriterion").value);
    const payload={action:"uploadEvidence",registro_id:$("evidenceCriterion").value,igreja:criterion?.igreja||selectedChurch,descricao:$("evidenceDescription").value||"Evidência",fileName:file.name,mimeType:file.type,base64,usuario:user.email};
    $("uploadEvidence").disabled=true;try{await fetch(endpoint(),{method:"POST",mode:"no-cors",body:new URLSearchParams(payload)});await new Promise(r=>setTimeout(r,1200));try{const res=await jsonp(endpoint(),"listEvidences",{igreja:selectedChurch});evidences=Array.isArray(res)?res:(res.data||[])}catch(_e){evidences.push({id:"LOCAL-"+Date.now(),...payload,preview:reader.result,arquivo:file.name,mime_type:file.type})}localStorage.setItem("v83evidences",JSON.stringify(evidences));renderEvidence();toast("Evidência enviada.")}finally{$("uploadEvidence").disabled=false}
  };reader.readAsDataURL(file)
}
function openEvidenceEdit(id){const e=evidences.find(x=>String(x.id)===String(id));if(!e)return;$("editingEvidenceId").value=e.id;$("editEvidenceDescription").value=e.descricao||"";$("editEvidenceCriterion").value=e.registro_id||e.criterion||"";$("evidenceEditModal").classList.add("open")}
async function saveEvidenceEdit(){const id=$("editingEvidenceId").value,e=evidences.find(x=>String(x.id)===String(id));if(!e)return;const payload={action:"saveEvidence",id,descricao:$("editEvidenceDescription").value,registro_id:$("editEvidenceCriterion").value,usuario:user.email};await fetch(endpoint(),{method:"POST",mode:"no-cors",body:new URLSearchParams(payload)});e.descricao=payload.descricao;e.registro_id=payload.registro_id;localStorage.setItem("v83evidences",JSON.stringify(evidences));$("evidenceEditModal").classList.remove("open");renderEvidence();toast("Evidência atualizada.")}
async function deleteEvidence(){const id=$("editingEvidenceId").value;if(!confirm("Excluir esta evidência?"))return;await fetch(endpoint(),{method:"POST",mode:"no-cors",body:new URLSearchParams({action:"deleteEvidence",id,usuario:user.email})});evidences=evidences.filter(x=>String(x.id)!==String(id));localStorage.setItem("v83evidences",JSON.stringify(evidences));$("evidenceEditModal").classList.remove("open");renderEvidence();toast("Evidência excluída.")}
function canConfigureRequirements(){
  return isMaster()||user?.role==="Pastor Distrital";
}
function renderRequirements(){
  if(!$("requirementsGrid"))return;
  document.querySelectorAll(".requirements-access").forEach(el=>el.classList.toggle("hidden",!canConfigureRequirements()));
  const q=($("requirementSearch")?.value||"").trim().toLowerCase();
  const rows=(requirements||[]).filter(r=>`${r.codigo_requisito||""} ${r.titulo||""} ${r.area||""}`.toLowerCase().includes(q));
  $("requirementsCount").textContent=`${rows.length} requisito${rows.length===1?"":"s"}`;
  $("requirementsGrid").innerHTML=rows.map(r=>{
    const color=AREAS[r.area]||"#102333";
    const active=String(r.ativo??true).toLowerCase()!=="false";
    return `<article class="requirement-card" style="--current:${color}">
      <div class="requirement-top"><span class="requirement-code">${escapeAdmin(r.codigo_requisito)}</span><span class="access-pill ${active?"active":"inactive"}"><i></i>${active?"Ativo":"Inativo"}</span></div>
      <h3>${escapeAdmin(r.titulo)}</h3>
      <p>${escapeAdmin(r.descricao||"")}</p>
      <div class="requirement-meta"><span>${escapeAdmin(r.area)}</span><span>Meta padrão: ${Number(r.meta_padrao)||0}</span></div>
      <button class="requirement-edit" data-edit-requirement="${escapeAdmin(r.codigo_requisito)}">Editar</button>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-edit-requirement]").forEach(b=>b.onclick=()=>openRequirementModal(b.dataset.editRequirement));
}
function openRequirementModal(code=null){
  if(!canConfigureRequirements())return;
  const r=code?requirements.find(x=>String(x.codigo_requisito)===String(code)):null;
  $("requirementModalTitle").textContent=r?"Editar requisito":"Novo requisito";
  $("requirementOriginalCode").value=r?.codigo_requisito||"";
  $("requirementCodeInput").value=r?.codigo_requisito||"";
  $("requirementAreaInput").value=r?.area||"Identidade";
  $("requirementTitleInput").value=r?.titulo||"";
  $("requirementDescriptionInput").value=r?.descricao||"";
  $("requirementQuestionInput").value=r?.pergunta||"";
  $("requirementGoalInput").value=Number(r?.meta_padrao)||0;
  $("requirementActiveInput").value=String(String(r?.ativo??true).toLowerCase()!=="false");
  $("requirementModal").classList.add("open");
}
async function saveRequirementV84(){
  if(!canConfigureRequirements())return;
  const payload={
    action:"saveRequirement",
    codigo_original:$("requirementOriginalCode").value.trim(),
    codigo_requisito:$("requirementCodeInput").value.trim(),
    area:$("requirementAreaInput").value,
    titulo:$("requirementTitleInput").value.trim(),
    descricao:$("requirementDescriptionInput").value.trim(),
    pergunta:$("requirementQuestionInput").value.trim(),
    meta_padrao:$("requirementGoalInput").value,
    ativo:$("requirementActiveInput").value,
    usuario:user.email
  };
  if(!payload.codigo_requisito||!payload.titulo)return toast("Informe código e título.");
  $("saveRequirementButton").disabled=true;
  try{
    await fetch(endpoint(),{method:"POST",mode:"no-cors",body:new URLSearchParams(payload)});
    $("requirementModal").classList.remove("open");
    await AtualizarSistema();
    toast("Requisito salvo e registros sincronizados.");
  }finally{$("saveRequirementButton").disabled=false}
}
function selectedChurchProfile(){
  if(selectedChurch==="Todas")return null;
  return churchProfiles.find(p=>String(p.igreja)===String(selectedChurch))||{igreja:selectedChurch};
}
function renderMyChurch(){
  if(!$("churchProfileName"))return;
  const p=selectedChurchProfile();
  $("churchProfileName").textContent=selectedChurch==="Todas"?"Selecione uma igreja":selectedChurch;
  const disabled=selectedChurch==="Todas"||!canEditChurch(selectedChurch);
  $("churchEldersInput").value=Number(p?.quantidade_anciaos)||0;
  $("churchFamiliesInput").value=Number(p?.quantidade_familias)||0;
  $("churchPastorInput").value=p?.pastor_responsavel||"";$("churchFirstElderInput").value=p?.primeiro_anciao_diretor||"";$("churchFirstElderPhoneInput").value=p?.contato_primeiro_anciao_diretor||"";
  $("churchPhoneInput").value=p?.telefone||"";
  $("churchAddressInput").value=p?.endereco||"";
  $("churchEmailInput").value=p?.email||"";
  $("churchNotesInput").value=p?.observacoes||"";
  ["churchEldersInput","churchFamiliesInput","churchPastorInput","churchFirstElderInput","churchFirstElderPhoneInput","churchPhoneInput","churchAddressInput","churchEmailInput","churchNotesInput","saveChurchProfileButton"].forEach(id=>$(id).disabled=disabled);
}
async function saveChurchProfileV84(){
  if(selectedChurch==="Todas"||!canEditChurch(selectedChurch))return toast("Selecione uma igreja.");
  const payload={
    action:"saveChurchProfile",igreja:selectedChurch,
    quantidade_anciaos:$("churchEldersInput").value,
    quantidade_familias:$("churchFamiliesInput").value,
    pastor_responsavel:$("churchPastorInput").value,primeiro_anciao_diretor:$("churchFirstElderInput").value,contato_primeiro_anciao_diretor:$("churchFirstElderPhoneInput").value,
    telefone:$("churchPhoneInput").value,
    endereco:$("churchAddressInput").value,
    email:$("churchEmailInput").value,
    observacoes:$("churchNotesInput").value,
    usuario:user.email
  };
  $("saveChurchProfileButton").disabled=true;
  try{
    await fetch(endpoint(),{method:"POST",mode:"no-cors",body:new URLSearchParams(payload)});
    const local={...payload};
    const idx=churchProfiles.findIndex(x=>String(x.igreja)===String(selectedChurch));
    if(idx>=0)churchProfiles[idx]=local;else churchProfiles.push(local);
    localStorage.setItem("v84churchProfiles",JSON.stringify(churchProfiles));
    toast("Informações da igreja salvas.");
  }finally{$("saveChurchProfileButton").disabled=false}
}

function renderAdmin(){
  if(!isMaster()) return;
  loadUsersV52();
}

async function loadUsersV52(){
  try{
    const result=await jsonp(endpoint(),"listUsers",{});
    const rows=Array.isArray(result)?result:(result.data||result.users||[]);
    if(Array.isArray(rows)&&rows.length){
      systemUsers=rows.map(normalizeUserV52);
    }else{
      systemUsers=USERS.map(normalizeUserV52);
    }
  }catch(_e){
    systemUsers=JSON.parse(localStorage.getItem("v52users")||"null")||USERS.map(normalizeUserV52);
  }
  localStorage.setItem("v52users",JSON.stringify(systemUsers));
  renderUsersTableV52();
}
function normalizeUserV52(u){
  return {
    id:u.id||u.email||u.login||("USR-"+Date.now()),
    nome:u.nome||u.name||"",
    funcao:u.funcao||u.perfil||u.role||"",
    area:u.area_atuacao||u.area||u.distrito||u.igreja||"",
    login:u.login||u.email||"",
    senha:u.senha||u.code||"",
    ativo:String(u.ativo??u.active??true).toLowerCase()!=="false"
  };
}
function renderUsersTableV52(){
  const q=($("userSearch")?.value||"").trim().toLowerCase();
  const rows=systemUsers.filter(u=>`${u.nome} ${u.funcao} ${u.area} ${u.login}`.toLowerCase().includes(q));
  $("usersCount").textContent=`${rows.length} usuário${rows.length===1?"":"s"}`;
  $("usersTableBody").innerHTML=rows.map(u=>`
    <tr>
      <td><strong>${escapeAdmin(u.nome)}</strong></td>
      <td>${escapeAdmin(u.funcao)}</td>
      <td>${escapeAdmin(u.area)}</td>
      <td>${escapeAdmin(u.login)}</td>
      <td>••••••</td>
      <td><span class="access-pill ${u.ativo?"active":"inactive"}"><i></i>${u.ativo?"Ativo":"Inativo"}</span></td>
      <td>
        <div class="user-actions">
          <button class="user-action edit" data-edit-user="${escapeAdmin(u.id)}">Editar</button>
          <button class="user-action toggle" data-toggle-user="${escapeAdmin(u.id)}">${u.ativo?"Inativar":"Ativar"}</button>
          <button class="user-action delete" data-delete-user="${escapeAdmin(u.id)}">Excluir</button>
        </div>
      </td>
    </tr>`).join("");
  document.querySelectorAll("[data-edit-user]").forEach(b=>b.onclick=()=>openUserModalV52(b.dataset.editUser));
  document.querySelectorAll("[data-toggle-user]").forEach(b=>b.onclick=()=>toggleUserV52(b.dataset.toggleUser));
  document.querySelectorAll("[data-delete-user]").forEach(b=>b.onclick=()=>deleteUserV52(b.dataset.deleteUser));
}
function escapeAdmin(v){
  return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function openUserModalV52(id=null){
  const u=id?systemUsers.find(x=>String(x.id)===String(id)):null;
  $("userModalTitle").textContent=u?"Editar usuário":"Novo usuário";
  $("editingUserId").value=u?.id||"";
  $("userNameInput").value=u?.nome||"";
  $("userRoleInput").value=u?.funcao||"Pastor Distrital";
  $("userAreaInput").value=u?.area||"Castelo de Sonhos";
  $("userLoginInput").value=u?.login||"";
  $("userPasswordInput").value=u?.senha||"";
  $("userActiveInput").value=String(u?.ativo??true);
  $("userModal").classList.add("open");
}
async function saveUserV52(){
  if(!isMaster()) return;
  const payload={
    action:"saveUser",
    id:$("editingUserId").value||("USR-"+Date.now()),
    nome:$("userNameInput").value.trim(),
    funcao:$("userRoleInput").value,
    area_atuacao:$("userAreaInput").value.trim(),
    login:$("userLoginInput").value.trim(),
    senha:$("userPasswordInput").value,
    ativo:$("userActiveInput").value,
    usuario_admin:user.email
  };
  if(!payload.nome||!payload.login||!payload.senha){
    toast("Preencha nome, login e senha."); return;
  }
  $("saveUserButton").disabled=true;
  $("saveUserButton").textContent="Salvando...";
  try{
    const body=new URLSearchParams(payload);
    await fetch(endpoint(),{method:"POST",mode:"no-cors",body});
    const local=normalizeUserV52(payload);
    const idx=systemUsers.findIndex(x=>String(x.id)===String(local.id));
    if(idx>=0)systemUsers[idx]=local;else systemUsers.push(local);
    localStorage.setItem("v52users",JSON.stringify(systemUsers));
    $("userModal").classList.remove("open");
    renderUsersTableV52();
    toast("Usuário salvo.");
  }catch(_e){toast("Não foi possível salvar o usuário.");}
  finally{$("saveUserButton").disabled=false;$("saveUserButton").textContent="Salvar usuário";}
}
async function toggleUserV52(id){
  const u=systemUsers.find(x=>String(x.id)===String(id));
  if(!u)return;
  u.ativo=!u.ativo;
  await saveUserDirectV52(u);
}
async function deleteUserV52(id){
  const u=systemUsers.find(x=>String(x.id)===String(id));
  if(!u)return;
  if(u.login==="admin"){toast("O administrador master não pode ser excluído.");return;}
  if(!confirm(`Excluir o usuário ${u.nome}?`))return;
  const body=new URLSearchParams({action:"deleteUser",id:u.id,usuario_admin:user.email});
  await fetch(endpoint(),{method:"POST",mode:"no-cors",body});
  systemUsers=systemUsers.filter(x=>String(x.id)!==String(id));
  localStorage.setItem("v52users",JSON.stringify(systemUsers));
  renderUsersTableV52();
  toast("Usuário excluído.");
}
async function saveUserDirectV52(u){
  const body=new URLSearchParams({
    action:"saveUser",id:u.id,nome:u.nome,funcao:u.funcao,area_atuacao:u.area,
    login:u.login,senha:u.senha,ativo:String(u.ativo),usuario_admin:user.email
  });
  await fetch(endpoint(),{method:"POST",mode:"no-cors",body});
  localStorage.setItem("v52users",JSON.stringify(systemUsers));
  renderUsersTableV52();
  toast(u.ativo?"Acesso ativado.":"Acesso inativado.");
}

function showView(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(name+"View").classList.add("active");document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.view===name));const titles={dashboard:"Dashboard Executivo",priorities:"Prioridades Estratégicas",planner:"Planner",timeline:"Linha do tempo",evidence:"Evidências",reports:"Relatórios",requirements:"Requisitos",myChurch:"Minha Igreja",admin:"Administração"};$("viewTitle").textContent=titles[name]||name;if(name==="admin")loadUsersV52();if(name==="requirements")renderRequirements();if(name==="myChurch")renderMyChurch();$("sidebar").classList.remove("open")}
function exportCSV(){const rows=filtered(),headers=["igreja","ano","area","titulo","meta","alcancado","plano_acao","responsavel","data_inicial","voto","material"],csv=[headers,...rows.map(r=>headers.map(h=>r[h]??""))].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv"}));a.download="prioridades-estrategicas.csv";a.click();URL.revokeObjectURL(a.href)}
function shareWhatsApp(){const data=filtered(),t=data.reduce((a,r)=>({m:a.m+r.meta,x:a.x+r.alcancado}),{m:0,x:0}),text=`*Prioridades Estratégicas*\n${selectedChurch==="Todas"?"Distrito Castelo de Sonhos":selectedChurch} — ${selectedYear}\nResultado geral: *${Math.round(pct(t.x,t.m))}%*`;window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank")}
function markdownToHtmlV85(markdown){
  let text=escapeAdmin(markdown||"");
  text=text.replace(/^### (.*)$/gm,"<h3>$1</h3>")
           .replace(/^## (.*)$/gm,"<h2>$1</h2>")
           .replace(/^# (.*)$/gm,"<h1>$1</h1>")
           .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
           .replace(/\*(.*?)\*/g,"<em>$1</em>")
           .replace(/^> (.*)$/gm,"<blockquote>$1</blockquote>")
           .replace(/^\s*[-•] (.*)$/gm,"<li>$1</li>")
           .replace(/^\s*\d+\. (.*)$/gm,"<li>$1</li>")
           .replace(/\n{2,}/g,"</p><p>")
           .replace(/\n/g,"<br>");
  text=text.replace(/(?:<li>.*?<\/li>)(?:<br>)?/gs,m=>`<ul>${m.replace(/<br>/g,"")}</ul>`).replace(/<\/ul><ul>/g,"");
  return `<p>${text}</p>`;
}
async function generateAiReportV85(){
  if(selectedChurch==="Todas"){toast("Selecione uma igreja específica para gerar a análise completa.");return}
  $("aiReportModal").classList.add("open");
  $("aiReportTitle").textContent=`Relatório Completo — ${selectedChurch}`;
  $("aiReportContext").textContent=`Ano ${selectedYear} · análise administrativa, missiológica, teológica e relacional`;
  $("aiReportLoading").classList.remove("hidden");$("aiReportContent").innerHTML="";$("aiReportButton").disabled=true;
  try{
    const result=await jsonpLong(
      endpoint(),
      "aiChurchReport",
      {igreja:selectedChurch,ano:selectedYear,usuario:user.email},
      180000,
      elapsed=>{
        const message=elapsed<30
          ?"Organizando os dados da igreja..."
          :elapsed<60
            ?"Realizando a análise estratégica..."
            :"Preparando recomendações e plano de ação...";
        const loadingText=$("aiReportLoading")?.querySelector("span");
        if(loadingText)loadingText.textContent=message;
      }
    );
    if(!result?.ok)throw new Error(result?.error||"Falha na geração.");
    currentAiReport=String(result.data?.report||result.report||"");
    if(!currentAiReport)throw new Error("A IA não retornou conteúdo.");
    $("aiReportContent").innerHTML=markdownToHtmlV85(currentAiReport);
  }catch(error){
    console.error(error);
    $("aiReportContent").innerHTML=`<div class="inline-message"><strong>Não foi possível gerar o relatório.</strong><br>${escapeAdmin(error.message||"Verifique a configuração da chave de IA no Apps Script.")}</div>`;
  }finally{$("aiReportLoading").classList.add("hidden");$("aiReportButton").disabled=false}
}
function printAiReportV85(){if(!currentAiReport)return toast("Gere o relatório primeiro.");document.body.classList.add("ai-print-mode");window.print();setTimeout(()=>document.body.classList.remove("ai-print-mode"),300)}
function shareAiReportV85(){
  if(!currentAiReport)return toast("Gere o relatório primeiro.");
  const profile=selectedChurchProfile(),contact=normalizeWhatsappNumber(profile?.contato_primeiro_anciao_diretor);
  const summary=currentAiReport.length>3500?currentAiReport.slice(0,3500)+"…":currentAiReport;
  const text=`*Relatório Estratégico com IA — ${selectedChurch}*\n\n${summary}`;
  const target=contact?`https://wa.me/${contact}?text=`:"https://wa.me/?text=";
  window.open(target+encodeURIComponent(text),"_blank");
}


function aplicativoEstaInstalado(){
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

function dispositivoIOS(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function dispositivoAndroid(){
  return /android/i.test(window.navigator.userAgent);
}

function abrirAjudaInstalacao(tipo="generico"){
  const modal=$("installHelpModal");
  const title=$("installHelpTitle");
  const content=$("installHelpContent");
  if(!modal||!content)return;

  if(tipo==="ios"){
    title.textContent="Instalar no iPhone ou iPad";
    content.innerHTML=`
      <div class="install-help-step"><strong>1</strong><span>Abra esta página no <b>Safari</b>.</span></div>
      <div class="install-help-step"><strong>2</strong><span>Toque no botão <b>Compartilhar</b> — o quadrado com uma seta para cima.</span></div>
      <div class="install-help-step"><strong>3</strong><span>Escolha <b>Adicionar à Tela de Início</b>.</span></div>
      <div class="install-help-step"><strong>4</strong><span>Confirme em <b>Adicionar</b>.</span></div>
      <div class="install-help-note">No iOS, o navegador não exibe a janela automática de instalação. A instalação é feita pelo menu Compartilhar do Safari.</div>`;
  }else if(tipo==="android"){
    title.textContent="Instalar no Android";
    content.innerHTML=`
      <div class="install-help-step"><strong>1</strong><span>Abra a página no <b>Google Chrome</b>.</span></div>
      <div class="install-help-step"><strong>2</strong><span>Toque no menu de três pontos.</span></div>
      <div class="install-help-step"><strong>3</strong><span>Escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</span></div>
      <div class="install-help-note">Quando o Chrome disponibilizar a instalação automática, este mesmo botão abrirá a confirmação diretamente.</div>`;
  }else{
    title.textContent="Instalar no computador";
    content.innerHTML=`
      <div class="install-help-step"><strong>1</strong><span>Abra esta página no <b>Chrome</b> ou <b>Microsoft Edge</b>.</span></div>
      <div class="install-help-step"><strong>2</strong><span>Use o ícone de instalação na barra de endereço ou abra o menu do navegador.</span></div>
      <div class="install-help-step"><strong>3</strong><span>Escolha <b>Instalar Prioridades Estratégicas</b>.</span></div>
      <div class="install-help-note">Se a instalação já tiver sido realizada, procure o aplicativo no Menu Iniciar ou na lista de aplicativos.</div>`;
  }

  modal.classList.add("open");
}

async function executarInstalacaoPWA(){
  const botao=$("installButton");
  if(aplicativoEstaInstalado()){
    toast("O aplicativo já está instalado neste dispositivo.");
    return;
  }

  if(deferredPrompt){
    deferredPrompt.prompt();
    const escolha=await deferredPrompt.userChoice;
    if(escolha?.outcome==="accepted"){
      toast("Instalação iniciada.");
    }
    deferredPrompt=null;
    return;
  }

  if(dispositivoIOS()){
    abrirAjudaInstalacao("ios");
  }else if(dispositivoAndroid()){
    abrirAjudaInstalacao("android");
  }else{
    abrirAjudaInstalacao("desktop");
  }

  if(botao)botao.blur();
}

function atualizarEstadoBotaoInstalacao(){
  const botao=$("installButton");
  if(!botao)return;

  botao.classList.remove("hidden");
  const instalado=aplicativoEstaInstalado();
  botao.classList.toggle("pwa-installed",instalado);
  botao.title=instalado?"Aplicativo instalado":"Instalar aplicativo";
  botao.setAttribute("aria-label",instalado?"Aplicativo instalado":"Instalar aplicativo");
}

function configurarInstalacaoPWA(){
  const botao=$("installButton");
  if(!botao||botao.dataset.pwaBound==="1")return;
  botao.dataset.pwaBound="1";

  atualizarEstadoBotaoInstalacao();
  botao.addEventListener("click",executarInstalacaoPWA);

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    deferredPrompt=event;
    atualizarEstadoBotaoInstalacao();
  });

  window.addEventListener("appinstalled",()=>{
    deferredPrompt=null;
    atualizarEstadoBotaoInstalacao();
    toast("Aplicativo instalado com sucesso.");
  });

  const fechar=$("closeInstallHelpButton");
  if(fechar){
    fechar.addEventListener("click",()=>{
      $("installHelpModal")?.classList.remove("open");
    });
  }
}

async function sendEmail(){const email=$("reportEmail").value.trim();if(!email)return;const body=new URLSearchParams({action:"sendReport",email,igreja:selectedChurch,ano:selectedYear});await fetch(endpoint(),{method:"POST",mode:"no-cors",body});toast("Solicitação de envio realizada.");$("emailModal").classList.remove("open")}

async function alternarModoApresentacao(){
  const botao=$("presentationButton");
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }
  }catch(error){
    console.error("Erro ao alternar modo apresentação:",error);
    toast("Não foi possível alternar o modo apresentação.");
  }
}
function atualizarBotaoApresentacao(){
  const botao=$("presentationButton");
  if(!botao)return;
  const telaCheia=Boolean(document.fullscreenElement);
  botao.classList.toggle("fullscreen-active",telaCheia);
  botao.title=telaCheia?"Sair da tela cheia":"Modo apresentação";
  botao.setAttribute("aria-label",telaCheia?"Sair da tela cheia":"Entrar em tela cheia");
  botao.textContent=telaCheia?"⤢":"⛶";
}
document.addEventListener("fullscreenchange",atualizarBotaoApresentacao);

document.addEventListener("DOMContentLoaded",()=>{const saved=localStorage.getItem("sessionUser");if(saved){user=JSON.parse(saved);startApp()}$("loginButton").onclick=login;["loginEmail","loginCode"].forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();login()}}));$("logoutButton").onclick=logout;document.querySelectorAll(".nav-button[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));$("prioritiesToggle").onclick=()=>$("prioritySubmenu").classList.toggle("open");document.querySelectorAll("[data-priority]").forEach(b=>b.onclick=()=>openPriorityV6(b.dataset.priority));$("churchFilter").onchange=e=>{selectedChurch=e.target.value;renderAll()};$("yearFilter").onchange=e=>{selectedYear=e.target.value;renderAll()};$("monthFilter").onchange=e=>{selectedMonth=e.target.value;renderAll()};$("refreshButton").onclick=AtualizarSistema;$("mobileMenu").onclick=()=>$("sidebar").classList.toggle("open");$("sidebarLogoButton").onclick=()=>{document.body.classList.toggle("sidebar-collapsed");localStorage.setItem("sidebarCollapsed",document.body.classList.contains("sidebar-collapsed")?"1":"0")};if(localStorage.getItem("sidebarCollapsed")==="1")document.body.classList.add("sidebar-collapsed");$("presentationButton").onclick=alternarModoApresentacao;atualizarBotaoApresentacao();$("newTaskButton").onclick=()=>openTaskModal();$("saveTask").onclick=saveTaskItem;$("deleteTask").onclick=deleteTaskItem;$("criteriaStatusFilter").onchange=e=>{criteriaStatus=e.target.value;renderPriorities()};document.querySelectorAll("[data-member-edit]").forEach(b=>b.onclick=openMembersModal);["membersFrequentInput","membersInfrequentInput","membersTransferInput","membersRescueInput"].forEach(id=>$(id).oninput=updateMembersTotal);$("saveMembersButton").onclick=saveMemberStats;
  ["goalInputV51","reachedInputV51"].forEach(id=>$(id).oninput=updateLiveV51);
  $("saveCriterionV51").onclick=saveCriterionV51;
  $("newUserButton").onclick=()=>openUserModalV52();
  $("saveUserButton").onclick=saveUserV52;
  $("userSearch").oninput=renderUsersTableV52;$("newRequirementButton").onclick=()=>openRequirementModal();$("saveRequirementButton").onclick=saveRequirementV84;$("requirementSearch").oninput=renderRequirements;$("saveChurchProfileButton").onclick=saveChurchProfileV84;
  $("toggleEvidenceEdit").onclick=()=>{evidenceEditMode=!evidenceEditMode;renderEvidence()};$("saveEvidenceButton").onclick=saveEvidenceEdit;$("deleteEvidenceButton").onclick=deleteEvidence;$("uploadEvidence").onclick=uploadEvidence;$("aiReportButton").onclick=generateAiReportV85;$("printAiReportButton").onclick=printAiReportV85;$("shareAiReportButton").onclick=shareAiReportV85;$("pdfButton").onclick=()=>window.print();$("excelButton").onclick=exportCSV;$("whatsappButton").onclick=shareWhatsApp;$("emailButton").onclick=()=>$("emailModal").classList.add("open");$("sendEmail").onclick=sendEmail;document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove("open"));configurarInstalacaoPWA();if("serviceWorker"in navigator)navigator.serviceWorker.register("./service-worker.js",{scope:"./"})})


/* Prioridades DSA v1.0.1 — camada de atualização */
const FIELD_CHURCHES_V101=['Aeroporto','Aldeia','Alenquer','Almeirim','Anapú I','Anapú II','Assurini','Bela Vista','Boa Vista','Brasil Novo','Castelo de Sonhos','Central Altamira','Central Itaituba','Central Santarém','Floresta - Itaituba','Gurupá','IATAI','Interventoria','Jacareacanga','Jardim Altamira','Jardim Santarém','Juruti','Medicilândia','Mojuí dos Campos','Monte Alegre','Moraes Almeida','Mutirão','Nova República','Novo Horizonte','Novo Progresso','Novo Repartimento I','Novo Repartimento II','Novo Repartimento III','Óbidos','Pacajá I','Pacajá II','Piracanã','Placas','Porto de Moz','Premem','Ruropólis','Sentir Mais','Trairão','Uruará','Vila Nova','Vitória do Xingu'];
const MODULES_V101=['dashboard','priorities','planner','timeline','evidence','reports','requirements','myChurch'];
const DIFFICULTIES_V101=['Baixo envolvimento dos membros','Falta de líderes capacitados','Dificuldade de acompanhamento das metas','Baixa participação de jovens e adolescentes','Comunicação interna insuficiente','Poucos membros envolvidos na missão','Dificuldade com membros não frequentes','Necessidade de fortalecer pequenos grupos/UAPGs','Falta de recursos materiais ou financeiros','Dificuldade para cumprir prazos','Baixa integração entre departamentos','Necessidade de maior acompanhamento pastoral'];
const OFFICERS_V101=['Anciãos','Secretaria','Tesouraria','Escola Sabatina','Ministério Pessoal','Jovens','Desbravadores','Aventureiros','Ministério da Criança','Ministério do Adolescente','Ministério da Mulher','Mordomia','Família','Comunicação','ASA','Pequenos Grupos'];
let reportsV101=[],passwordResolverV101=null;
function isDevV101(){return user?.role==='Desenvolvedor'}
function userModulesV101(){const m=user?.modulos||user?.modules;return !m?MODULES_V101:String(m).split(',').map(x=>x.trim()).filter(Boolean)}
function availableChurchesV101(){if(!user)return CHURCHES;if(user.role==='Desenvolvedor'||user.role==='Administrador')return FIELD_CHURCHES_V101;const raw=String(user.igrejas||user.churches||user.church||'');if(raw&&raw!=='Todas')return raw.split(',').map(x=>x.trim()).filter(Boolean);return user.role==='Coordenador do Polo'?FIELD_CHURCHES_V101:CHURCHES}
function setupFilters(){const churches=availableChurchesV101();const opts=(user?.role==='Desenvolvedor'||user?.role==='Administrador'||user?.church==='Todas')?['Todas',...churches]:churches;$('churchFilter').innerHTML=[...new Set(opts)].map(c=>`<option>${escapeAdmin(c)}</option>`).join('');if(!opts.includes(selectedChurch))selectedChurch=opts[0]||'Todas';$('churchFilter').value=selectedChurch;$('churchFilter').disabled=opts.length===1;$('yearFilter').value=selectedYear}
function startApp(){ $('loginScreen').classList.add('hidden');$('appRoot').classList.remove('hidden');$('profileName').textContent=user.name;$('profileRole').textContent=user.role;if($('profilePhoto'))$('profilePhoto').src=user.foto_url||user.photo||'assets/avatar-default.svg';document.querySelectorAll('.dev-only').forEach(e=>e.classList.toggle('hidden',!isDevV101()));const mods=userModulesV101();document.querySelectorAll('.nav-button[data-view]').forEach(b=>{if(b.dataset.view!=='admin')b.classList.toggle('hidden',!mods.includes(b.dataset.view))});selectedChurch=user.church==='Todas'?'Todas':(user.church||availableChurchesV101()[0]||'Todas');setupFilters();loadDataV101()}
async function login(){const email=$('loginEmail').value.trim().toLowerCase(),code=$('loginCode').value;$('loginButton').disabled=true;$('loginButton').textContent='Entrando...';$('loginMessage').textContent='';try{const result=await jsonp(endpoint(),'login',{email,codigo:code}),a=result?.user||result?.data||null;if(!a)throw new Error('Credenciais inválidas');user={email:a.login||a.email||email,name:a.nome||a.name||email,role:a.funcao||a.role||'Usuário',church:a.igrejas==='Todas'?'Todas':(String(a.igrejas||'').split(',')[0]||a.igreja||a.area_atuacao||'Todas'),district:a.distrito||a.area_atuacao||'',igrejas:a.igrejas||'',polo:a.polo||'',modulos:a.modulos||'',foto_url:a.foto_url||''};localStorage.setItem('sessionUser',JSON.stringify(user));startApp()}catch(e){$('loginMessage').textContent='Usuário ou senha inválidos.'}finally{$('loginButton').disabled=false;$('loginButton').textContent='Entrar'}}
async function loadDataV101(){await loadData();try{const [pl,rep,req]=await Promise.all([jsonp(endpoint(),'listPlanner',{igreja:selectedChurch,ano:selectedYear}),jsonp(endpoint(),'listReports',{igreja:selectedChurch,ano:selectedYear}),jsonp(endpoint(),'listChurchRequirements',{igreja:selectedChurch})]);tasks=Array.isArray(pl?.data)?pl.data:(Array.isArray(pl)?pl:[]);tasks=tasks.map(t=>({id:t.id,title:t.titulo||t.title,area:t.area,owner:t.responsavel||t.owner,due:t.prazo||t.due,status:t.status,igreja:t.igreja,ano:t.ano}));reportsV101=Array.isArray(rep?.data)?rep.data:(Array.isArray(rep)?rep:[]);requirements=Array.isArray(req?.data)?req.data:(Array.isArray(req)?req:requirements);renderAll();renderReportHistoryV101()}catch(e){console.warn('Complementos v1.0.1 indisponíveis',e)}}
function renderAll(){$('contextText').textContent=`${selectedChurch==='Todas'?'Visão consolidada':selectedChurch} · ${selectedYear}`;$('lastUpdate').textContent='Última atualização: '+new Date().toLocaleString('pt-BR');renderMemberStats();renderDailyVerse();renderDashboard();renderPriorities();renderPlanner();renderTimeline();renderEvidence();renderRequirements();renderMyChurch();if(isDevV101())renderAdmin();renderReportDifficultyChecksV101();renderReportHistoryV101()}
function renderPlanner(){const list=tasks.filter(t=>(selectedChurch==='Todas'||t.igreja===selectedChurch)&&String(t.ano||selectedYear)===String(selectedYear)),statuses=['Não iniciado','Em andamento','Concluído'];$('kanbanBoard').innerHTML=statuses.map(s=>`<section class="kanban-column"><h3>${s}</h3>${list.filter(t=>t.status===s).map(t=>`<article class="task-card" style="--task-color:${AREAS[t.area]||AREAS.Identidade}"><button type="button" class="task-edit-button" data-edit-task="${t.id}" title="Editar item">✎</button><span class="task-card-area"><img src="${AREA_ICONS[t.area]||AREA_ICONS.Identidade}" alt="">${escapeAdmin(t.area||'Identidade')}</span><strong>${escapeAdmin(t.title)}</strong><span>${escapeAdmin(t.owner||'Não definido')}</span><span>Prazo: ${escapeAdmin(t.due||'—')}</span></article>`).join('')}</section>`).join('');document.querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>openTaskModal(b.dataset.editTask))}
function renderTimeline(){const list=tasks.filter(t=>(selectedChurch==='Todas'||t.igreja===selectedChurch)&&String(t.ano||selectedYear)===String(selectedYear)).sort((a,b)=>(a.due||'').localeCompare(b.due||''));$('timelineList').innerHTML=list.map(t=>`<article class="timeline-item" style="--timeline-color:${AREAS[t.area]||AREAS.Identidade}"><strong>${escapeAdmin(t.title)}</strong><span class="timeline-area"><img src="${AREA_ICONS[t.area]||AREA_ICONS.Identidade}" alt="">${escapeAdmin(t.area||'Identidade')}</span><span>${escapeAdmin(t.owner||'')} · ${escapeAdmin(t.status||'')} · ${escapeAdmin(t.due||'Sem prazo')}</span></article>`).join('')}
async function saveTaskItem(){if(selectedChurch==='Todas')return toast('Selecione uma igreja para criar o checklist.');const id=$('taskId').value,title=$('taskTitle').value.trim();if(!title)return toast('Informe o título da tarefa.');const payload={action:'savePlanner',id,titulo:title,area:$('taskArea').value,responsavel:$('taskOwner').value,prazo:$('taskDue').value,status:$('taskStatus').value,igreja:selectedChurch,ano:selectedYear,usuario:user.email};await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams(payload)});$('taskModal').classList.remove('open');await loadDataV101();toast(id?'Item atualizado.':'Tarefa criada.')}
function askPasswordV101(){return new Promise(resolve=>{passwordResolverV101=resolve;$('activePasswordInput').value='';$('passwordConfirmModal').classList.add('open');setTimeout(()=>$('activePasswordInput')?.focus(),50)})}
async function deleteTaskItem(){const id=$('taskId').value;if(!id)return;const senha=await askPasswordV101();if(!senha)return;await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams({action:'deletePlanner',id,usuario:user.email,senha})});$('taskModal').classList.remove('open');await loadDataV101();toast('Item excluído.')}
function renderEvidence(){const opts=filtered().map(r=>`<option value="${r.id}">${escapeAdmin(r.igreja)} · ${escapeAdmin(r.titulo)}</option>`).join('');$('evidenceCriterion').innerHTML=opts;$('editEvidenceCriterion').innerHTML=opts;const visible=evidences.filter(e=>selectedChurch==='Todas'||!e.igreja||e.igreja===selectedChurch);$('evidenceGallery').classList.toggle('editing',evidenceEditMode);$('toggleEvidenceEdit').textContent=evidenceEditMode?'✓ Concluir edição':'✎ Editar evidências';const recMap=new Map(records.map(r=>[String(r.id),r]));$('evidenceGallery').innerHTML=Object.keys(AREAS).map(area=>{const rows=visible.filter(e=>(recMap.get(String(e.registro_id))?.area||'Identidade')===area);if(!rows.length)return'';return `<section class="evidence-priority-group-v101"><h3><img src="${AREA_ICONS[area]}" alt="">${area}</h3><div class="evidence-gallery evidence-masonry">${rows.map(e=>{const src=e.file_id&&String(e.mime_type||'').startsWith('image/')?`https://drive.google.com/thumbnail?id=${encodeURIComponent(e.file_id)}&sz=w1600`:(e.url||e.preview||'');const isImage=String(e.mime_type||'').startsWith('image/')||/\.(png|jpe?g|webp|gif)$/i.test(e.arquivo||'');return `<article class="evidence-card masonry-item">${isImage&&src?`<img src="${src}" alt="${escapeAdmin(e.descricao||'Evidência')}" loading="lazy" onerror="this.outerHTML='<div class=\\'evidence-image-fallback-v101\\'>Imagem indisponível</div>'">`:`<div class="document-placeholder">📄</div>`}<div class="evidence-caption"><strong>${escapeAdmin(e.descricao||'Evidência')}</strong><span>${escapeAdmin(e.arquivo||'')}</span></div>${evidenceEditMode?`<button type="button" class="evidence-edit-button" data-edit-evidence="${e.id}">✎ Editar</button>`:''}</article>`}).join('')}</div></section>`}).join('');document.querySelectorAll('[data-edit-evidence]').forEach(b=>b.onclick=()=>openEvidenceEdit(b.dataset.editEvidence))}
async function deleteEvidence(){const id=$('editingEvidenceId').value,senha=await askPasswordV101();if(!senha)return;await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams({action:'deleteEvidence',id,usuario:user.email,senha})});$('evidenceEditModal').classList.remove('open');await loadDataV101();toast('Evidência excluída.')}
function renderRequirements(){if(!$('requirementsGrid'))return;document.querySelectorAll('.requirements-access').forEach(el=>el.classList.toggle('hidden',!canConfigureRequirements()));const q=($('requirementSearch')?.value||'').trim().toLowerCase(),rows=(requirements||[]).filter(r=>`${r.codigo_requisito||''} ${r.titulo||''} ${r.area||''}`.toLowerCase().includes(q));$('requirementsCount').textContent=`${rows.length} requisito${rows.length===1?'':'s'}`;$('requirementsGrid').innerHTML=rows.map(r=>`<article class="requirement-card" style="--current:${AREAS[r.area]||'#102333'}"><div class="requirement-top"><span class="requirement-code">${escapeAdmin(r.codigo_requisito)}</span><span class="access-pill ${r.ativo?'active':'inactive'}"><i></i>${r.ativo?'Ativo':'Inativo'}</span></div><h3>${escapeAdmin(r.titulo)}</h3><p>${escapeAdmin(r.descricao||'')}</p><div class="requirement-meta"><span>${escapeAdmin(r.area)}</span><span>Meta: ${Number(r.meta_padrao)||0}</span><span class="access-scope-v101">${selectedChurch==='Todas'?'Padrão geral':'Específico: '+escapeAdmin(selectedChurch)}</span></div><button class="requirement-edit" data-edit-requirement="${escapeAdmin(r.codigo_requisito)}">Editar</button></article>`).join('');document.querySelectorAll('[data-edit-requirement]').forEach(b=>b.onclick=()=>openRequirementModal(b.dataset.editRequirement))}
async function saveRequirementV84(){if(!canConfigureRequirements())return;const payload={action:'saveRequirement',igreja:selectedChurch,codigo_original:$('requirementOriginalCode').value.trim(),codigo_requisito:$('requirementCodeInput').value.trim(),area:$('requirementAreaInput').value,titulo:$('requirementTitleInput').value.trim(),descricao:$('requirementDescriptionInput').value.trim(),pergunta:$('requirementQuestionInput').value.trim(),meta_padrao:$('requirementGoalInput').value,ativo:$('requirementActiveInput').value,usuario:user.email};if(!payload.codigo_requisito||!payload.titulo)return toast('Informe código e título.');await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams(payload)});$('requirementModal').classList.remove('open');await loadDataV101();toast(selectedChurch==='Todas'?'Padrão atualizado para todas as igrejas.':'Meta específica da igreja salva.')}
function renderMyChurch(){if(!$('churchProfileName'))return;const p=selectedChurchProfile();$('churchProfileName').textContent=selectedChurch==='Todas'?'Selecione uma igreja':selectedChurch;const disabled=selectedChurch==='Todas'||!canEditChurch(selectedChurch);$('churchEldersInput').value=Number(p?.quantidade_anciaos)||0;$('churchFamiliesInput').value=Number(p?.quantidade_familias)||0;if($('churchUapgsInput'))$('churchUapgsInput').value=Number(p?.quantidade_uapgs)||0;$('churchFirstElderInput').value=p?.primeiro_anciao_diretor||'';$('churchFirstElderPhoneInput').value=p?.contato_primeiro_anciao_diretor||'';$('churchAddressInput').value=p?.endereco||'';$('churchEmailInput').value=p?.email||'';$('churchNotesInput').value=p?.observacoes||'';const selected=new Set(String(p?.oficiais||'').split('|').filter(Boolean));$('churchOfficersChecks').innerHTML=OFFICERS_V101.map(x=>`<label class="check-v101"><input type="checkbox" value="${escapeAdmin(x)}" ${selected.has(x)?'checked':''} ${disabled?'disabled':''}><span>${escapeAdmin(x)}</span></label>`).join('');['churchEldersInput','churchFamiliesInput','churchUapgsInput','churchFirstElderInput','churchFirstElderPhoneInput','churchAddressInput','churchEmailInput','churchNotesInput','saveChurchProfileButton'].filter(id=>$(id)).forEach(id=>$(id).disabled=disabled)}
async function saveChurchProfileV84(){if(selectedChurch==='Todas'||!canEditChurch(selectedChurch))return toast('Selecione uma igreja.');const oficiais=[...document.querySelectorAll('#churchOfficersChecks input:checked')].map(x=>x.value).join('|'),payload={action:'saveChurchProfile',igreja:selectedChurch,quantidade_anciaos:$('churchEldersInput').value,quantidade_familias:$('churchFamiliesInput').value,quantidade_uapgs:$('churchUapgsInput').value,oficiais,primeiro_anciao_diretor:$('churchFirstElderInput').value,contato_primeiro_anciao_diretor:$('churchFirstElderPhoneInput').value,endereco:$('churchAddressInput').value,email:$('churchEmailInput').value,observacoes:$('churchNotesInput').value,usuario:user.email};await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams(payload)});toast('Informações da igreja salvas.');await loadDataV101()}
function renderReportDifficultyChecksV101(){if(!$('reportDifficultyChecks'))return;$('reportDifficultyChecks').innerHTML=DIFFICULTIES_V101.map(x=>`<label class="check-v101"><input type="checkbox" value="${escapeAdmin(x)}"><span>${escapeAdmin(x)}</span></label>`).join('')}
function renderReportHistoryV101(){if(!$('reportHistoryList'))return;const rows=reportsV101.filter(r=>selectedChurch==='Todas'||r.igreja===selectedChurch);$('reportHistoryList').innerHTML=rows.length?rows.map(r=>`<article class="report-history-item-v101"><strong>${escapeAdmin(r.igreja)} — ${escapeAdmin(r.ano)}</strong><span>${escapeAdmin(r.data_hora||'')}</span><div class="report-history-actions-v101"><button data-report-open="${r.id}">Visualizar</button><button data-report-pdf="${r.id}">Salvar em PDF</button><button data-report-wa="${r.id}">WhatsApp</button><button data-report-edit="${r.id}">Editar</button></div></article>`).join(''):'<p>Nenhum relatório gerado para esta igreja.</p>';document.querySelectorAll('[data-report-open]').forEach(b=>b.onclick=()=>openHistoricalReportV101(b.dataset.reportOpen));document.querySelectorAll('[data-report-pdf]').forEach(b=>b.onclick=()=>printHistoricalReportV101(b.dataset.reportPdf));document.querySelectorAll('[data-report-wa]').forEach(b=>b.onclick=()=>shareHistoricalReportV101(b.dataset.reportWa));document.querySelectorAll('[data-report-edit]').forEach(b=>b.onclick=()=>editHistoricalReportV101(b.dataset.reportEdit))}
function reportByIdV101(id){return reportsV101.find(r=>String(r.id)===String(id))}
function openHistoricalReportV101(id){const r=reportByIdV101(id);if(!r)return;currentAiReport=r.relatorio||'';$('aiReportTitle').textContent=`Relatório Completo — ${r.igreja}`;$('aiReportContext').textContent=`Ano ${r.ano}`;$('aiReportContent').innerHTML=markdownToHtmlV85(currentAiReport);$('aiReportModal').classList.add('open')}
function printHistoricalReportV101(id){openHistoricalReportV101(id);setTimeout(printAiReportV85,100)}
function shareHistoricalReportV101(id){const r=reportByIdV101(id);if(!r)return;window.open('https://wa.me/?text='+encodeURIComponent(`*Relatório Estratégico — ${r.igreja}*\n${r.ano}\n\n${r.relatorio||''}`),'_blank')}
function editHistoricalReportV101(id){const r=reportByIdV101(id);if(!r)return;$('editingReportId').value=id;$('editingReportText').value=r.relatorio||'';$('reportEditModal').classList.add('open')}
async function saveEditedReportV101(){const id=$('editingReportId').value,r=reportByIdV101(id);if(!r)return;await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams({action:'saveReport',id,igreja:r.igreja,ano:r.ano,relatorio:$('editingReportText').value,dificuldades:r.dificuldades||'',usuario:user.email})});$('reportEditModal').classList.remove('open');await loadDataV101();toast('Relatório atualizado.')}
function shareWhatsApp(){const data=filtered(),areas=aggregate(data,'area'),total=data.reduce((a,r)=>({m:a.m+r.meta,x:a.x+r.alcancado}),{m:0,x:0}),alerts=data.filter(r=>pct(r.alcancado,r.meta)<60).sort((a,b)=>pct(a.alcancado,a.meta)-pct(b.alcancado,b.meta));const lines=['*Prioridades Estratégicas*','',`${selectedChurch} — ${selectedYear}`,''];Object.keys(AREAS).forEach(a=>{const x=areas.find(v=>v.key===a);lines.push(`*${a}:* ${Math.round(x?.percent||0)}%`)});lines.push('',`*Resultado geral:* ${Math.round(pct(total.x,total.m))}%`,'','*ALERTA — Pendências Prioritárias*');if(alerts.length)alerts.forEach(r=>lines.push(`• ${r.titulo}: ${Math.round(pct(r.alcancado,r.meta))}%`));else lines.push('Nenhuma pendência em situação de alerta.');window.open('https://wa.me/?text='+encodeURIComponent(lines.join('\n')),'_blank')}
async function generateAiReportV85(){if(selectedChurch==='Todas')return toast('Selecione uma igreja específica para gerar a análise completa.');$('aiReportModal').classList.add('open');$('aiReportTitle').textContent=`Relatório Completo — ${selectedChurch}`;$('aiReportContext').textContent=`Ano ${selectedYear} · análise completa`;$('aiReportLoading').classList.remove('hidden');$('aiReportContent').innerHTML='';$('aiReportButton').disabled=true;try{const difficulties=[...document.querySelectorAll('#reportDifficultyChecks input:checked')].map(x=>x.value).join('; '),result=await jsonpLong(endpoint(),'aiChurchReport',{igreja:selectedChurch,ano:selectedYear,usuario:user.email},180000);if(!result?.ok)throw new Error(result?.error||'Falha na geração.');currentAiReport=String(result.data?.report||result.report||'');$('aiReportContent').innerHTML=markdownToHtmlV85(currentAiReport);await new Promise(r=>setTimeout(r,400));const latest=await jsonp(endpoint(),'listReports',{igreja:selectedChurch,ano:selectedYear});reportsV101=latest.data||[];if(difficulties&&reportsV101[0])await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams({action:'saveReport',id:reportsV101[0].id,igreja:selectedChurch,ano:selectedYear,relatorio:currentAiReport,dificuldades,usuario:user.email})});renderReportHistoryV101()}catch(e){$('aiReportContent').innerHTML=`<div class="inline-message"><strong>Não foi possível gerar o relatório.</strong><br>${escapeAdmin(e.message||'Erro')}</div>`}finally{$('aiReportLoading').classList.add('hidden');$('aiReportButton').disabled=false}}
function renderAdmin(){if(!isDevV101())return;loadUsersV52()}
function normalizeUserV52(u){return{id:u.id||u.login,nome:u.nome||'',funcao:u.funcao||'',area:u.area_atuacao||'',login:u.login||'',senha:'',ativo:String(u.ativo??true).toLowerCase()!=='false',foto_url:u.foto_url||'',modulos:u.modulos||'',igrejas:u.igrejas||'',polo:u.polo||'',distrito:u.distrito||''}}
function openUserModalV52(id=null){if(!isDevV101())return;const u=id?systemUsers.find(x=>String(x.id)===String(id)):null;$('userModalTitle').textContent=u?'Editar usuário':'Novo usuário';$('editingUserId').value=u?.id||'';$('userNameInput').value=u?.nome||'';$('userRoleInput').value=u?.funcao||'Secretário(a)';$('userAreaInput').value=u?.area||'';$('userLoginInput').value=u?.login||'';$('userPasswordInput').value='';$('userActiveInput').value=String(u?.ativo??true);$('userChurchesInput').value=u?.igrejas||'';const selected=new Set(String(u?.modulos||MODULES_V101.join(',')).split(','));$('userModulesChecks').innerHTML=MODULES_V101.map(m=>`<label class="check-v101"><input type="checkbox" value="${m}" ${selected.has(m)?'checked':''}><span>${m}</span></label>`).join('');$('userModal').classList.add('open')}
async function saveUserV52(){if(!isDevV101())return;const senhaAdmin=await askPasswordV101();if(!senhaAdmin)return;const file=$('userPhotoInput').files[0],payload={action:'saveUser',id:$('editingUserId').value||('USR-'+Date.now()),nome:$('userNameInput').value.trim(),funcao:$('userRoleInput').value,area_atuacao:$('userAreaInput').value.trim(),login:$('userLoginInput').value.trim(),senha:$('userPasswordInput').value,ativo:$('userActiveInput').value,igrejas:$('userChurchesInput').value.trim(),modulos:[...document.querySelectorAll('#userModulesChecks input:checked')].map(x=>x.value).join(','),usuario_admin:user.email,senha_admin:senhaAdmin};if(file){const data=await fileToBase64V101(file);payload.foto_base64=data.split(',')[1];payload.foto_mime=file.type;payload.foto_nome=file.name}await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams(payload)});$('userModal').classList.remove('open');await loadUsersV52();toast('Usuário salvo.')}
function fileToBase64V101(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file)})}
async function deleteUserV52(id){if(!isDevV101())return;const senhaAdmin=await askPasswordV101();if(!senhaAdmin)return;await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams({action:'deleteUser',id,usuario_admin:user.email,senha_admin:senhaAdmin})});await loadUsersV52();toast('Usuário excluído.')}
function showView(name){if(name==='admin'&&!isDevV101())return;document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));$(name+'View').classList.add('active');document.querySelectorAll('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));const titles={dashboard:'Dashboard Executivo',priorities:'Prioridades Estratégicas',planner:'Planner',timeline:'Linha do tempo',evidence:'Evidências',reports:'Relatórios',requirements:'Requisitos',myChurch:'Minha Igreja',admin:'Opções do Desenvolvedor'};$('viewTitle').textContent=titles[name]||name;if(name==='admin')loadUsersV52();if(name==='reports')renderReportHistoryV101();if(name==='requirements')renderRequirements();if(name==='myChurch')renderMyChurch();$('sidebar').classList.remove('open')}
document.addEventListener('DOMContentLoaded',()=>{$('confirmPasswordButton').onclick=()=>{const v=$('activePasswordInput').value;$('passwordConfirmModal').classList.remove('open');const r=passwordResolverV101;passwordResolverV101=null;if(r)r(v)};$('saveEditedReportButton').onclick=saveEditedReportV101;const cf=$('churchFilter');if(cf)cf.onchange=async e=>{selectedChurch=e.target.value;await loadDataV101()};const yf=$('yearFilter');if(yf)yf.onchange=async e=>{selectedYear=e.target.value;await loadDataV101()}});
async function toggleUserV52(id){if(!isDevV101())return;const u=systemUsers.find(x=>String(x.id)===String(id));if(!u)return;const senhaAdmin=await askPasswordV101();if(!senhaAdmin)return;const payload={action:'saveUser',id:u.id,nome:u.nome,funcao:u.funcao,area_atuacao:u.area,login:u.login,senha:'',ativo:String(!u.ativo),igrejas:u.igrejas||'',modulos:u.modulos||MODULES_V101.join(','),polo:u.polo||'',distrito:u.distrito||'',usuario_admin:user.email,senha_admin:senhaAdmin};await fetch(endpoint(),{method:'POST',mode:'no-cors',body:new URLSearchParams(payload)});await loadUsersV52();toast(!u.ativo?'Acesso ativado.':'Acesso inativado.')}



/* ===== consolidado de v1.0.1.js ===== */


/* Prioridades DSA v1.0.2 — escopo por área de atuação/distrito */
const FIELD_CHURCHES_V102=FIELD_CHURCHES_V101.map(x=>x==='Castelo de Sonhos'?'Central Castelo de Sonhos':x);
const DISTRICT_CHURCHES_V102={
  'Castelo de Sonhos':['Central Castelo de Sonhos','Cachoeira da Serra','Jardim Vitória','Jardim Planalto','PDS Brasília','Vila Isol','Terra Nossa','Pedra Alta']
};
function normalizeChurchV102(name){
  const s=String(name||'').trim();
  return s==='Central'?'Central Castelo de Sonhos':s;
}
function sameChurchV102(a,b){return normalizeChurchV102(a)===normalizeChurchV102(b)}
function availableChurchesV101(){
  if(!user)return CHURCHES.map(normalizeChurchV102);
  if(user.role==='Desenvolvedor'||user.role==='Administrador')return FIELD_CHURCHES_V102.map(normalizeChurchV102);
  const resolved=Array.isArray(user.igrejas_resolvidas)?user.igrejas_resolvidas:[];
  if(resolved.length)return resolved.map(normalizeChurchV102);
  const raw=String(user.igrejas||user.churches||'').trim();
  if(raw&&raw!=='Todas')return raw.split(',').map(x=>normalizeChurchV102(x)).filter(Boolean);
  if(user.role==='Pastor Distrital'){
    const district=String(user.district||user.area_atuacao||'').trim();
    if(DISTRICT_CHURCHES_V102[district])return DISTRICT_CHURCHES_V102[district].slice();
  }
  if(user.role==='Coordenador do Polo')return [];
  const local=normalizeChurchV102(user.church||user.area_atuacao||'');
  return local&&local!=='Todas'?[local]:[];
}
function setupFilters(){
  const churches=[...new Set(availableChurchesV101())];
  const broad=user?.role==='Desenvolvedor'||user?.role==='Administrador';
  const opts=broad?['Todas',...churches]:churches;
  $('churchFilter').innerHTML=opts.map(c=>`<option>${escapeAdmin(c)}</option>`).join('');
  if(!opts.some(c=>sameChurchV102(c,selectedChurch)))selectedChurch=opts[0]||'Todas';
  else selectedChurch=opts.find(c=>sameChurchV102(c,selectedChurch))||selectedChurch;
  $('churchFilter').value=selectedChurch;
  $('churchFilter').disabled=opts.length<=1;
  $('yearFilter').value=selectedYear;
}
function filtered(){
  return records.filter(r=>r.ano===selectedYear&&(selectedChurch==='Todas'||sameChurchV102(r.igreja,selectedChurch)));
}
async function login(){
  const email=$('loginEmail').value.trim(),code=$('loginCode').value;
  $('loginButton').disabled=true;$('loginButton').textContent='Entrando...';$('loginMessage').textContent='';
  try{
    const result=await jsonp(endpoint(),'login',{email,codigo:code}),a=result?.user||result?.data||null;
    if(!a)throw new Error('Credenciais inválidas');
    const resolved=Array.isArray(a.igrejas_resolvidas)?a.igrejas_resolvidas:String(a.igrejas||'').split(',').map(x=>x.trim()).filter(Boolean);
    user={email:a.login||a.email||email,name:a.nome||a.name||email,role:a.funcao||a.role||'Usuário',church:a.igrejas==='Todas'?'Todas':(resolved[0]||a.igreja||''),district:a.distrito||a.area_atuacao||'',area_atuacao:a.area_atuacao||'',igrejas:a.igrejas||'',igrejas_resolvidas:resolved,polo:a.polo||'',modulos:a.modulos||'',foto_url:a.foto_url||''};
    localStorage.setItem('sessionUser',JSON.stringify(user));startApp();
  }catch(e){$('loginMessage').textContent='Usuário ou senha inválidos.'}
  finally{$('loginButton').disabled=false;$('loginButton').textContent='Entrar'}
}
function startApp(){
  $('loginScreen').classList.add('hidden');$('appRoot').classList.remove('hidden');$('profileName').textContent=user.name;$('profileRole').textContent=user.role;
  if($('profilePhoto'))$('profilePhoto').src=user.foto_url||user.photo||'assets/avatar-default.svg';
  document.querySelectorAll('.dev-only').forEach(e=>e.classList.toggle('hidden',!isDevV101()));
  const mods=userModulesV101();document.querySelectorAll('.nav-button[data-view]').forEach(b=>{if(b.dataset.view!=='admin')b.classList.toggle('hidden',!mods.includes(b.dataset.view))});
  const available=availableChurchesV101();selectedChurch=(user.role==='Desenvolvedor'||user.role==='Administrador')?'Todas':(available[0]||'Todas');
  setupFilters();loadDataV101();
}



/* ===== consolidado de v1.0.2.js ===== */


(() => {
  let scope=null, selectedDistrict="Todos";
  const role=()=>String(window.user?.role||"").trim();
  async function load(){
    if(!window.user)return;
    try{ const r=await jsonp(endpoint(),"listScopeV103",{email:window.user.email}); scope=r?.data||r; }catch(e){ console.error(e); }
    setup();
  }
  function ensureDistrict(){
    const bar=document.querySelector(".filterbar"), church=document.getElementById("churchFilter")?.closest("label");
    if(!bar||!church)return null;
    let w=document.getElementById("districtFilterWrap");
    if(!w){ w=document.createElement("label"); w.id="districtFilterWrap"; w.className="district-filter-v103"; w.innerHTML='<span>Distrito</span><select id="districtFilter"></select>'; bar.insertBefore(w,church); }
    return w;
  }
  function setup(){
    const w=ensureDistrict(); if(!w)return;
    const show=Boolean(scope?.showDistrictFilter);
    w.classList.toggle("hidden",!show);
    if(show){
      const s=document.getElementById("districtFilter"), ds=scope?.districts||[];
      s.innerHTML=['<option value="Todos">Todos</option>'].concat(ds.map(d=>`<option value="${escapeAdmin(d.distrito)}">${escapeAdmin(d.distrito)}</option>`)).join("");
      s.value=selectedDistrict;
      s.onchange=()=>{selectedDistrict=s.value; fillChurches();};
    }else selectedDistrict=scope?.districts?.[0]?.distrito||"Todos";
    fillChurches();
  }
  function fillChurches(){
    const s=document.getElementById("churchFilter"); if(!s)return;
    let ch=scope?.churches||[];
    if(selectedDistrict!=="Todos") ch=ch.filter(x=>String(x.distrito)===String(selectedDistrict));
    const uniq=[...new Set(ch.map(x=>x.igreja).filter(Boolean))];
    s.innerHTML=['<option value="Todas">Todas</option>'].concat(uniq.map(c=>`<option value="${escapeAdmin(c)}">${escapeAdmin(c)}</option>`)).join("");
    s.disabled=false; selectedChurch="Todas"; s.value="Todas"; if(typeof renderAll==="function")renderAll();
  }
  const old=window.startApp;
  if(typeof old==="function"){ window.startApp=function(){ old.apply(this,arguments); setTimeout(load,50); }; }
  else document.addEventListener("DOMContentLoaded",()=>setTimeout(load,200));
})();


/* ===== consolidado de v1.0.3.js ===== */


/* =========================================================
   Prioridades DSA v1.0.4 — Otimização de carregamento
   ========================================================= */
(() => {
  const CACHE_KEY = 'prioridades_v104_bootstrap';
  const CACHE_TTL = 5 * 60 * 1000;
  const EVIDENCE_TTL = 2 * 60 * 1000;
  let loadPromiseV104 = null;
  const evidenceCacheV104 = new Map();

  function applyBootstrapV104(data) {
    if (!data) return;
    const payload = data.data || data;
    if (Array.isArray(payload.records)) records = payload.records.map(normalize);
    if (Array.isArray(payload.churchStats)) churchStats = payload.churchStats;
    if (payload.dailyVerse) dailyVerse = payload.dailyVerse;
    if (Array.isArray(payload.requirements)) requirements = payload.requirements;
    if (Array.isArray(payload.churchProfiles)) churchProfiles = payload.churchProfiles;

    // Reaproveita o escopo territorial da v1.0.3 sem nova chamada.
    if (payload.scope && typeof window.v103ApplyScope === 'function') {
      try { window.v103ApplyScope(payload.scope); } catch (_e) {}
    }

    applyDynamicGoalsV84();
  }

  function cachedBootstrapV104() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || Date.now() - Number(obj.savedAt||0) > CACHE_TTL) return null;
      return obj.payload;
    } catch (_e) { return null; }
  }

  function saveBootstrapCacheV104(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({savedAt:Date.now(),payload}));
    } catch (_e) {}
  }

  function renderCurrentV104() {
    $("contextText").textContent = `${selectedChurch==="Todas"?"Distrito completo":selectedChurch} · ${selectedYear}`;
    $("lastUpdate").textContent = "Última atualização: " + new Date().toLocaleString("pt-BR");
    renderMemberStats();
    renderDailyVerse();

    const active = document.querySelector('.view.active')?.id || 'dashboardView';
    if (active === 'dashboardView') renderDashboard();
    else if (active === 'prioritiesView') renderPriorities();
    else if (active === 'plannerView') renderPlanner();
    else if (active === 'timelineView') renderTimeline();
    else if (active === 'evidenceView') renderEvidence();
    else if (active === 'requirementsView') renderRequirements();
    else if (active === 'myChurchView') renderMyChurch();
    else if (active === 'adminView') renderAdmin();
  }

  // Evita renderizar todos os módulos em cada alteração de filtro.
  renderAll = renderCurrentV104;

  async function loadDataV104(force=false) {
    if (loadPromiseV104 && !force) return loadPromiseV104;

    // Primeiro frame rápido a partir do cache local.
    if (!force) {
      const cached = cachedBootstrapV104();
      if (cached) {
        applyBootstrapV104(cached);
        $("syncBadge").innerHTML="<i></i>Dados em cache · sincronizando";
        renderCurrentV104();
      }
    }

    $("refreshIcon").classList.add("spin");

    loadPromiseV104 = (async () => {
      try {
        const today = new Date().toISOString().slice(0,10);
        const res = await jsonp(endpoint(),"bootstrapV104",{
          email:user?.email||"",
          data:today
        });

        const payload = res?.data || res;
        if (!payload || payload.ok === false) throw new Error(payload?.error || "Falha no carregamento otimizado.");

        applyBootstrapV104(payload);
        saveBootstrapCacheV104(payload);
        $("syncBadge").innerHTML="<i></i>Google Sheets conectado";
        renderCurrentV104();
        return payload;
      } catch (err) {
        console.error("V104 load:",err);
        // Fallback para o cache das versões anteriores
        if (!records.length) {
          records = JSON.parse(localStorage.getItem("v84records")||localStorage.getItem("v5cache")||"[]");
          churchStats = JSON.parse(localStorage.getItem("v84churchStats")||"[]");
          dailyVerse = JSON.parse(localStorage.getItem("v84dailyVerse")||"null");
          requirements = JSON.parse(localStorage.getItem("v84requirements")||"[]");
          churchProfiles = JSON.parse(localStorage.getItem("v84churchProfiles")||"[]");
          applyDynamicGoalsV84();
        }
        $("syncBadge").innerHTML="<i style='background:#ffb800'></i>Modo offline";
        renderCurrentV104();
        throw err;
      } finally {
        $("refreshIcon").classList.remove("spin");
        loadPromiseV104 = null;
      }
    })();

    return loadPromiseV104;
  }

  loadData = loadDataV104;

  AtualizarSistema = async function() {
    $("refreshButton").disabled = true;
    $("refreshIcon").classList.add("spin");
    try {
      await jsonp(endpoint(),"refreshSystem",{ano:selectedYear});
      localStorage.removeItem(CACHE_KEY);
      await loadDataV104(true);
      toast("Sistema atualizado.");
    } catch (e) {
      console.error(e);
      toast("Não foi possível concluir a atualização.");
    } finally {
      $("refreshButton").disabled = false;
      $("refreshIcon").classList.remove("spin");
    }
  };

  async function lazyEvidenceV104(force=false) {
    const key = selectedChurch || "Todas";
    const cached = evidenceCacheV104.get(key);
    if (!force && cached && Date.now()-cached.savedAt<EVIDENCE_TTL) {
      evidences = cached.data;
      renderEvidence();
      return;
    }
    try {
      const res = await jsonp(endpoint(),"listEvidences",{igreja:key});
      evidences = Array.isArray(res)?res:(res?.data||[]);
      evidenceCacheV104.set(key,{savedAt:Date.now(),data:evidences});
      renderEvidence();
    } catch(e) {
      console.error("Evidências:",e);
      renderEvidence();
    }
  }

  const baseShowViewV104 = showView;
  showView = function(name) {
    baseShowViewV104(name);

    if (name === "dashboard") renderDashboard();
    else if (name === "priorities") renderPriorities();
    else if (name === "planner") renderPlanner();
    else if (name === "timeline") renderTimeline();
    else if (name === "evidence") lazyEvidenceV104(false);
    else if (name === "requirements") renderRequirements();
    else if (name === "myChurch") renderMyChurch();
    else if (name === "admin") renderAdmin();
  };

  window.v104ForceRefresh = () => loadDataV104(true);
})();
