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