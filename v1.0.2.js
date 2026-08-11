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
