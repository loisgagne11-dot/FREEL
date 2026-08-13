/* ============================================================
   FREEL — Activité · Plan de charge (prototype interactif)
   Calendrier semaine/mois, éditeur de journée 1-clic (travail /
   congé / indispo), indicateurs + intelligence live. Persistance
   localStorage. Réutilise freel.css ; documents via FreelDocs.
   ============================================================ */
const { useState, useEffect, useMemo, useRef } = React;

/* ---------- icônes ---------- */
const I = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5',
  chart:'M4 19V5M4 15l5-5 4 3 6-7',
  calc:'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2',
  cog:'M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 3.6h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4z',
  book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 19v2',
  left:'M15 18l-6-6 6-6', right:'M9 18l6-6-6-6',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14',
  download:'M12 3v12M7 11l5 5 5-5M5 21h14',
  doc:'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5ZM14 3v5h5',
  wallet:'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5',
  cart:'M3 4h2l2.4 12.5a2 2 0 002 1.5h8.7a2 2 0 002-1.6L23 8H6M9 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  users:'M9 8a3 3 0 100 6 3 3 0 000-6M3 20a6 6 0 0112 0M16 5a3 3 0 010 6M21 20a6 6 0 00-4-5.6',
  sun:'M12 8a4 4 0 100 8 4 4 0 000-8M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  ban:'M5.6 5.6l12.8 12.8M12 3a9 9 0 100 18 9 9 0 000-18',
  check:'M5 13l4 4L19 7',
  x:'M6 6l12 12M18 6 6 18',
  alert:'M12 3 2 20h20L12 3ZM12 10v5M12 18h.01',
  edit:'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4Z',
  home:'M3 11l9-7 9 7M5 9.5V20h14V9.5',
  building:'M6 3h12v18H6zM12 3v18',
  shuffle:'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M16 21h5v-5M14 14l7 7M3 3l7 7',
  cal:'M3 4h18v17H3zM3 9h18M8 2v4M16 2v4',
  search:'M11 4a7 7 0 100 14 7 7 0 000-14M21 21l-4-4',
  cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18z',
  zap:'M13 2 4 14h7l-1 8 9-12h-7z',
  sparkle:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  receipt:'M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3ZM8 8h8M8 12h6',
  arrow:'M5 12h14M13 6l6 6-6 6',
  flag:'M5 21V4M5 4l9 1.5L5 14',
};
function Ic({d, s=16, w=2, fill=false, style}){
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor"
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {String(d).split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
    </svg>
  );
}

/* ---------- données ---------- */
const TJM = 520;
const CL = {
  SL:{name:'Studio Lumen', short:'SL', cls:'sl', color:'var(--green)', bg:'var(--green)', missions:['Refonte du site','Design system','Direction artistique']},
  AN:{name:'Atelier Novak', short:'AN', cls:'an', color:'var(--blue)', bg:'var(--blue)', missions:['Identité de marque','Charte éditoriale']},
  BV:{name:"Brasserie Vent d'Ouest", short:'BV', cls:'bv', color:'#c7b2ee', bg:'#b59ae0', missions:['Carte & menus','Signalétique']},
  MK:{name:'Maison Kessler', short:'MK', cls:'mk', color:'var(--amber)', bg:'var(--amber)', missions:['Catalogue produits','Packaging']},
};
const LOC = { home:{label:'Télétravail', icon:I.home}, site:{label:'Sur site', icon:I.building}, mix:{label:'Mixte', icon:I.shuffle} };
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DOW = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const YEAR = 2026, MONTH = 5; // juin 2026
const TODAY = 10;

function key(d){ return YEAR+'-'+String(MONTH+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function dowOf(d){ return (new Date(YEAR,MONTH,d).getDay()+6)%7; } // 0=Lun
function daysInMonth(){ return new Date(YEAR,MONTH+1,0).getDate(); }

/* seed réaliste — ~18,5 j travaillés, 2 j de congé (10–12 juin) */
function seed(){
  const s = {};
  const set=(d,am,pm)=>{ s[key(d)]={am,pm}; };
  const W=(c,m,l)=>({type:'work',client:c,mission:CL[c].missions[m||0],loc:l||'home'});
  const C=()=>({type:'conge'}); const N=null;
  set(1, W('SL',0), W('SL',0)); set(2, W('SL',0,'site'), W('SL',0,'site'));
  set(3, W('SL',0), W('AN',0)); set(4, W('AN',0), W('AN',0,'site'));
  set(5, W('AN',0), N);
  set(8, W('SL',1), W('SL',1)); set(9, W('SL',1,'site'), W('SL',1,'site'));
  set(10, C(), C()); set(11, C(), C());           // congé posé
  set(12, W('BV',0), W('BV',0,'site'));
  set(15, W('SL',0), W('SL',0)); set(16, W('AN',1), W('AN',1));
  set(17, W('SL',0,'mix'), W('SL',0,'mix')); set(18, W('BV',0), N);
  set(19, W('MK',0), W('MK',0));
  set(22, W('SL',2), W('SL',2)); set(23, W('SL',2), W('AN',0));
  set(24, W('AN',0), W('AN',0)); set(25, W('MK',1), W('MK',1,'site'));
  set(26, W('SL',0), N);
  set(29, W('SL',0), W('SL',0)); set(30, W('AN',0), W('AN',0));
  return s;
}
function loadSched(){
  try{ const r=localStorage.getItem('freel_activite_v2'); if(r) return JSON.parse(r); }catch(e){}
  return seed();
}

/* ---------- helpers de calcul ---------- */
function slotVal(sl){ return sl && sl.type==='work' ? 0.5 : 0; }
function isWorkday(d){ return dowOf(d) < 5; }

function computeMonth(sched){
  let worked=0, conge=0, ouvres=0, home=0, workSlots=0;
  const byClient={}; 
  for(let d=1; d<=daysInMonth(); d++){
    if(isWorkday(d)) ouvres+=1;
    const day=sched[key(d)]||{};
    ['am','pm'].forEach(p=>{
      const sl=day[p];
      if(sl && sl.type==='work'){ worked+=0.5; workSlots++; const cc=Object.keys(CL).find(k=>CL[k].missions.includes(sl.mission))|| (sl.client); byClient[sl.client]=(byClient[sl.client]||0)+0.5; if(sl.loc==='home') home++; if(sl.loc==='mix') home+=0.5; }
      else if(sl && sl.type==='conge'){ conge+=0.5; }
    });
  }
  const occ = ouvres? Math.round(worked/ouvres*100) : 0;
  const homePct = workSlots? Math.round(home/workSlots*100) : 0;
  return { worked, conge, ouvres, occ, homePct, byClient, ca: worked*TJM };
}

/* semaines du mois (lundis) */
function weekStarts(){
  const starts=[]; let d=1;
  // reculer au lundi de la 1re semaine
  let first = 1 - dowOf(1);
  for(let s=first; s<=daysInMonth(); s+=7) starts.push(s);
  return starts;
}

/* ============================================================ */
function App(){
  const [tab,setTab] = useState('plan');
  const [view,setView] = useState('week');
  const [sched,setSched] = useState(loadSched);
  const [wk,setWk] = useState(()=>{ const s=weekStarts(); return Math.max(0, s.findIndex(x=> TODAY>=x && TODAY<x+7)); });
  const [editing,setEditing] = useState(null); // {day, slot:'am'|'pm'}
  const [newMenu,setNewMenu]=useState(false), [expMenu,setExpMenu]=useState(false);

  useEffect(()=>{ try{ localStorage.setItem('freel_activite_v2', JSON.stringify(sched)); }catch(e){} },[sched]);
  useEffect(()=>{ const h=()=>{setNewMenu(false);setExpMenu(false);}; document.addEventListener('click',h); return ()=>document.removeEventListener('click',h); },[]);

  const m = useMemo(()=>computeMonth(sched),[sched]);
  const starts = weekStarts();

  function applySlot(day, which, val){
    setSched(prev=>{
      const next={...prev}; const k=key(day);
      const cur={...(next[k]||{am:null,pm:null})};
      if(which==='day'){ cur.am=val; cur.pm=val; }
      else cur[which]=val;
      next[k]=cur; return next;
    });
  }

  // arrivée depuis le Pilote (« + Nouveau → Congés ») : ouvre la pose de congé sur le plan de charge
  React.useEffect(()=>{
    if(location.hash==='#conge'){
      setEditing({day:TODAY, which:'day', force:'conge'});
      history.replaceState(null,'',location.pathname);
    }
  },[]);

  return (
    <div className="app">
      {/* RAIL */}
      <aside className="rail">
        <div className="brand">fre<b>e</b>l</div>
        <a className="nav" href="Pilote - Le Flux.html"><span className="ic"><Ic d={I.grid}/></span> Pilote</a>
        <a className="nav on" href="Activité - Plan de charge.html"><span className="ic"><Ic d={I.layers}/></span> Activité &amp; congés</a>
        <a className="nav" href="Argent - Trésorerie & Performance.html"><span className="ic"><Ic d={I.wallet}/></span> Argent</a>
        <a className="nav" href="Achats - Justificatifs & Banque.html"><span className="ic"><Ic d={I.cart}/></span> Achats</a>
        <a className="nav" href="Outils - Simulateurs.html"><span className="ic"><Ic d={I.calc}/></span> Outils</a>
        <a className="nav" href="Config.html"><span className="ic"><Ic d={I.cog}/></span> Config</a>
        <div className="rail-foot">
          <a className="nav" href="Config.html"><span className="ic"><Ic d={I.book}/></span> Livre des recettes</a>
          <div className="who">
            <div className="ava">AL</div>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>Atelier L.</div>
              <div className="muted" style={{fontSize:11.5}}>Micro-BNC · ACRE</div>
            </div>
          </div>
          <div className="buildtag"><span className="pulse"></span> build <b>5</b> · 11 juil.</div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main" data-screen-label="Activité & congés">
        <div className="topbar">
          <div className="month">
            <b>Juin 2026</b>
          </div>
          <div className="grow"></div>
          <span className="synced on" title="Synchronisé · multi-appareils"><Ic d={I.cloud} s={15}/> <span className="pulse"></span></span>
          <div className="search"><Ic d={I.search} s={15}/> <span>Rechercher…</span><span className="kbd">⌘K</span></div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn" onClick={()=>{setExpMenu(!expMenu);setNewMenu(false);}}><Ic d={I.download} s={15}/> Exporter</button>
            <div className={'menu'+(expMenu?' open':'')}>
              <div className="cap">Documents</div>
              <div className="mi" data-export="cra"><Ic d={I.doc} s={15}/> Compte-rendu d'activité</div>
              <div className="mi" data-export="factures-pdf"><Ic d={I.doc} s={15}/> Factures (PDF)</div>
            </div>
          </div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn primary" onClick={()=>{setNewMenu(!newMenu);setExpMenu(false);}}><Ic d={I.plus} s={15}/> Nouveau</button>
            <div className={'menu'+(newMenu?' open':'')}>
              <div className="cap">Saisir</div>
              <div className="mi" onClick={()=>{setNewMenu(false); setEditing({day:TODAY, which:'day'});}}><Ic d={I.cal} s={15}/> Journée d'activité</div>
              <div className="mi" data-new="mission"><Ic d={I.layers} s={15}/> Mission</div>
              <div className="mi" data-new="facture"><Ic d={I.doc} s={15}/> Facture</div>
              <div className="mi" onClick={()=>{setNewMenu(false); window.FreelDocs&&FreelDocs.encaissement();}}><Ic d={I.wallet} s={15}/> Encaissement</div>
              <div className="mi" onClick={()=>{setNewMenu(false); setEditing({day:TODAY, which:'day', force:'conge'});}}><Ic d={I.sun} s={15}/> Congé</div>
              <div className="mi" onClick={()=>{setNewMenu(false); window.FreelDocs&&FreelDocs.charge();}}><Ic d={I.minus} s={15}/> Charge</div>
            </div>
          </div>
        </div>

        <div className="content">
          <div className="greet a-reveal">
            <div>
              <h1>Ton plan de charge</h1>
              <p>Clique n'importe quelle demi-journée pour l'attribuer, poser un congé ou la libérer. Tout se recalcule en direct.</p>
            </div>
            <span className="tag"><b className="num">{m.worked.toLocaleString('fr-FR')}</b> j travaillés · {m.occ}% occupé</span>
          </div>

          <div className="subtabs2 a-reveal" style={{animationDelay:'.05s'}}>
            <Tab id="plan" cur={tab} set={setTab} icon={I.cal}>Plan de charge</Tab>
            <Tab id="missions" cur={tab} set={setTab} icon={I.layers} cnt="5">Missions</Tab>
            <Tab id="factures" cur={tab} set={setTab} icon={I.doc} cnt="6">Factures</Tab>
            <Tab id="clients" cur={tab} set={setTab} icon={I.users} cnt="4">Clients</Tab>
          </div>

          <div className="a-reveal" style={{animationDelay:'.1s'}}>
            {tab==='plan' && <PlanDeCharge {...{view,setView,sched,wk,setWk,starts,setEditing,m}}/>}
            {tab==='missions' && <Missions/>}
            {tab==='factures' && <Factures/>}
            {tab==='clients' && <Clients m={m}/>}
          </div>
        </div>
      </div>

      {editing && <SlotEditor edit={editing} sched={sched} onClose={()=>setEditing(null)} onApply={applySlot}/>}
    </div>
  );
}

function Tab({id,cur,set,icon,cnt,children}){
  return (
    <button className={'stab'+(cur===id?' on':'')} onClick={()=>set(id)}>
      <Ic d={icon} s={15}/> {children}{cnt && <span className="cnt">{cnt}</span>}
    </button>
  );
}

/* ============ PLAN DE CHARGE ============ */
function PlanDeCharge({view,setView,sched,wk,setWk,starts,setEditing,m}){
  const ouvres=(()=>{ let n=0;
    if(view==='week'){ const st=starts[wk]; for(let i=0;i<7;i++){ const d=st+i; if(d>=1&&d<=daysInMonth()&&dowOf(d)<5) n++; } }
    else for(let d=1;d<=daysInMonth();d++) if(dowOf(d)<5) n++;
    return n; })();
  const intel = useMemo(()=>buildIntel(sched,m,wk,starts),[sched,m,wk,starts]);
  return (
    <div className="planwrap">
      <div className="calcard">
        <div className="calhead">
          <div>
            <div className="ctitle">{view==='week'?'Vue semaine':'Vue mois'}</div>
            <div className="csub">{view==='week'?'matin / après-midi · client · lieu':'Juin 2026 · couleur = client'} · <b style={{color:'var(--text)',fontWeight:600}}>{ouvres} j ouvrés</b></div>
          </div>
          {view==='week' && <WeekNav wk={wk} setWk={setWk} starts={starts}/>}
          <div className="seg">
            <button className={view==='week'?'on':''} onClick={()=>setView('week')}><Ic d={I.cal} s={13}/> Semaine</button>
            <button className={view==='month'?'on':''} onClick={()=>setView('month')}><Ic d={I.grid} s={13}/> Mois</button>
          </div>
        </div>
        {view==='week'
          ? <WeekView sched={sched} start={starts[wk]} setEditing={setEditing}/>
          : <MonthView sched={sched} setEditing={setEditing}/>}
        <Legend/>
      </div>
      <div className="icol">
        <IndicatorCard m={m}/>
        <CraCard/>
        <IntelCard notes={intel} setEditing={setEditing}/>
      </div>
    </div>
  );
}

function WeekNav({wk,setWk,starts}){
  const start = starts[wk];
  const end = Math.min(start+6, daysInMonth());
  const sLbl = start<1 ? '…' : start;
  return (
    <div className="wknav">
      <button disabled={wk<=0} onClick={()=>setWk(Math.max(0,wk-1))}><Ic d={I.left} s={15}/></button>
      <span className="wlabel">{sLbl}–{end} juin</span>
      <button disabled={wk>=starts.length-1} onClick={()=>setWk(Math.min(starts.length-1,wk+1))}><Ic d={I.right} s={15}/></button>
    </div>
  );
}

function slotClass(sl){
  if(!sl) return 'free';
  if(sl.type==='conge') return 'conge';
  if(sl.type==='indispo') return 'indispo';
  return CL[sl.client] ? CL[sl.client].cls : 'free';
}
function slotLabel(sl){
  if(!sl) return 'libre';
  if(sl.type==='conge') return 'Congé';
  if(sl.type==='indispo') return 'Indispo';
  return CL[sl.client] ? CL[sl.client].name : '—';
}

function WeekView({sched,start,setEditing}){
  const days=[];
  for(let i=0;i<7;i++){ const d=start+i; days.push(d); }
  return (
    <div className="wk">
      {days.map((d,i)=>{
        const valid = d>=1 && d<=daysInMonth();
        const we = i>=5;
        const day = valid ? (sched[key(d)]||{}) : {};
        return (
          <div key={i} className={'wd'+(we?' we':'')+(d===TODAY?' today':'')}>
            <div className="wd-h">{DOW[i]} {valid?d:''}</div>
            {['am','pm'].map(p=>{
              const sl=day[p]; const cls=slotClass(sl);
              return (
                <button key={p} className={'slot '+cls} disabled={!valid}
                  onClick={()=>valid&&setEditing({day:d,which:p})}>
                  <div className="sk">
                    <span>{p==='am'?'Matin':'Après-m.'}</span>
                    {sl&&sl.type==='work'&&sl.loc&&<span className="loc"><Ic d={LOC[sl.loc].icon} s={11}/></span>}
                  </div>
                  <b>{slotLabel(sl)}</b>
                  {sl&&sl.type==='work'&&<div className="mz">{sl.mission}</div>}
                  <span className="editdot"><Ic d={I.edit} s={12}/></span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({sched,setEditing}){
  const lead = dowOf(1);
  const total = daysInMonth();
  const cells=[];
  for(let i=0;i<lead;i++) cells.push(null);
  for(let d=1;d<=total;d++) cells.push(d);
  return (
    <div>
      <div className="mc">
        {DOW.map(x=><div key={x} className="dow">{x}</div>)}
        {cells.map((d,i)=>{
          if(d===null) return <div key={i} className="d empty"></div>;
          const we=dowOf(d)>=5;
          const day=sched[key(d)]||{};
          const loc = (day.am&&day.am.loc) || (day.pm&&day.pm.loc);
          return (
            <div key={i} className={'d'+(we?' we':'')+(d===TODAY?' today':'')} onClick={()=>setEditing({day:d,which:'day'})}>
              <span className="num">{d}</span>
              <div className={'hh '+slotClass(day.am)}>{day.am?(day.am.type==='work'?CL[day.am.client].short:(day.am.type==='conge'?'C':'×')):''}</div>
              <div className={'hh '+slotClass(day.pm)}>{day.pm?(day.pm.type==='work'?CL[day.pm.client].short:(day.pm.type==='conge'?'C':'×')):''}</div>
              {loc&&<span className="loc"><Ic d={LOC[loc].icon} s={10}/></span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend(){
  return (
    <div className="cal-leg">
      {Object.keys(CL).map(k=><span key={k} className="lg"><i style={{background:CL[k].bg}}></i> {CL[k].name}</span>)}
      <span className="lg"><i style={{background:'var(--amber)'}}></i> Congé</span>
      <span className="lg"><Ic d={I.home} s={12}/> télétravail</span>
      <span className="lg"><Ic d={I.building} s={12}/> sur site</span>
    </div>
  );
}

/* ============ indicateurs + intelligence ============ */
function IndicatorCard({m}){
  const occCls = m.occ>100?'r':(m.occ<60?'a':'g');
  const occW = Math.min(m.occ,118);
  const clients = Object.keys(m.byClient).sort((a,b)=>m.byClient[b]-m.byClient[a]);
  const totalC = clients.reduce((s,k)=>s+m.byClient[k],0)||1;
  return (
    <div className="icard">
      <div className="ih"><Ic d={I.chart} s={13}/> Le mois en chiffres</div>
      <div className="imet"><span className="k">Jours travaillés</span><span className="v g">{m.worked.toLocaleString('fr-FR')}<span style={{fontSize:13,color:'var(--muted)'}}> j</span></span></div>
      <div className="imet"><span className="k">CA généré</span><span className="v">{(m.ca).toLocaleString('fr-FR')} €</span></div>
      <div style={{margin:'4px 0 14px'}}>
        <div className="imet" style={{marginBottom:4}}><span className="k">Occupation</span><span className={'v '+occCls} style={{fontSize:17}}>{m.occ}%</span></div>
        <div className="occbar"><i style={{width:occW+'%',background:occCls==='r'?'var(--red)':(occCls==='a'?'var(--amber)':'var(--green)')}}></i><span className="mk100"></span></div>
        <div className="muted" style={{fontSize:11,fontFamily:'var(--mono)'}}>{m.worked.toLocaleString('fr-FR')} / {m.ouvres} j ouvrés · {m.conge.toLocaleString('fr-FR')} j congé</div>
      </div>
      <div className="ih" style={{marginBottom:9}}>Répartition clients</div>
      <div className="split">
        {clients.map(k=><i key={k} style={{width:(m.byClient[k]/totalC*100)+'%',background:CL[k].bg}}></i>)}
      </div>
      <div className="splleg">
        {clients.map(k=><div key={k} className="r"><i style={{background:CL[k].bg}}></i> {CL[k].name} <b>{m.byClient[k].toLocaleString('fr-FR')} j</b></div>)}
      </div>
      <div className="imet" style={{marginTop:14,marginBottom:0}}><span className="k">Télétravail</span><span className="v" style={{fontSize:17}}>{m.homePct}%</span></div>
    </div>
  );
}

function buildIntel(sched,m,wk,starts){
  const notes=[];
  // trous dans la semaine courante
  const start=starts[wk]; let free=0;
  for(let i=0;i<5;i++){ const d=start+i; if(d<1||d>daysInMonth()) continue; const day=sched[key(d)]||{};
    ['am','pm'].forEach(p=>{ if(!day[p]) free++; }); }
  if(free>0) notes.push({k:'info',icon:I.cal,html:<span><b>{free} demi-journée{free>1?'s':''} libre{free>1?'s':''}</b> cette semaine. <span>Soit ~{(free*0.5*TJM).toLocaleString('fr-FR')} € de capacité encore ouverte.</span></span>, cta:null});
  // occupation
  if(m.occ>100) notes.push({k:'warn',icon:I.alert,html:<span>Tu es <b>en surcharge</b> ({m.occ}%). <span>Vérifie qu'aucune journée ne porte deux missions par erreur.</span></span>});
  else if(m.occ<60) notes.push({k:'info',icon:I.zap,html:<span>Occupation à <b>{m.occ}%</b> — <span>de la place pour prospecter ou avancer un projet perso.</span></span>});
  else notes.push({k:'ok',icon:I.check,html:<span>Rythme sain à <b>{m.occ}%</b> <span>— ni sous-charge, ni burn.</span></span>});
  // dépendance client
  const clients=Object.keys(m.byClient); const tot=clients.reduce((s,k)=>s+m.byClient[k],0)||1;
  const top=clients.sort((a,b)=>m.byClient[b]-m.byClient[a])[0];
  if(top){ const pct=Math.round(m.byClient[top]/tot*100);
    if(pct>=55) notes.push({k:'warn',icon:I.users,html:<span><b>{CL[top].name}</b> pèse <b>{pct}%</b> de ton mois. <span>Au-delà de 50%, un retard de paiement devient un risque.</span></span>});
  }
  // congé → CRA
  if(m.conge>0) notes.push({k:'ok',icon:I.sun,html:<span><b>{m.conge.toLocaleString('fr-FR')} j de congé</b> déduits du CA projeté <span>et retirés de l'occupation.</span></span>});
  return notes;
}

function CraCard(){
  return (
    <div className="icard" style={{borderColor:'rgba(111,182,224,.3)'}}>
      <div className="ih" style={{color:'var(--blue)'}}><Ic d={I.doc} s={13}/> Compte-rendu d'activité</div>
      <p style={{fontSize:12.5,color:'var(--muted)',lineHeight:1.55,margin:'0 0 14px'}}>Le mois saisi ici alimente le CRA <b style={{color:'var(--text)'}}>sans ressaisie</b> — jours par mission, prêt à envoyer ou facturer.</p>
      <button className="btn primary" style={{width:'100%',justifyContent:'center'}} onClick={()=>window.FreelDocs&&FreelDocs.cra()}><Ic d={I.doc} s={15}/> Générer le CRA · juin</button>
    </div>
  );
}

function IntelCard({notes,setEditing}){
  return (
    <div className="intel">
      <div className="ih"><Ic d={I.sparkle} s={13}/> Ce que Freel remarque</div>
      {notes.map((n,i)=>(
        <div key={i} className={'inote '+n.k}>
          <div className="ic"><Ic d={n.icon} s={13}/></div>
          <div className="tx">{n.html}{n.cta&&<div><button onClick={n.cta.fn}>{n.cta.label}</button></div>}</div>
        </div>
      ))}
    </div>
  );
}

/* ============ SLOT EDITOR ============ */
function SlotEditor({edit,sched,onClose,onApply}){
  const day = sched[key(edit.day)]||{};
  const initWhich = edit.which || 'am';
  const [which,setWhich] = useState(initWhich);
  const ref = (initWhich==='day') ? (day.am||day.pm) : day[initWhich];
  const [type,setType] = useState(edit.force || (ref?ref.type:'work'));
  const [client,setClient] = useState((ref&&ref.client)||'SL');
  const [mission,setMission] = useState((ref&&ref.mission)||CL['SL'].missions[0]);
  const [loc,setLoc] = useState((ref&&ref.loc)||'home');

  const wd = new Date(YEAR,MONTH,edit.day);
  const dname = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][wd.getDay()];

  function save(){
    let val=null;
    if(type==='work') val={type:'work',client,mission,loc};
    else if(type==='conge') val={type:'conge'};
    else if(type==='indispo') val={type:'indispo'};
    else val=null;
    onApply(edit.day, which, val);
    if(window.FreelToast){
      const w = which==='day'?'journée':(which==='am'?'matin':'après-midi');
      const lbl = type==='work'?CL[client].name:(type==='conge'?'Congé':(type==='indispo'?'Indispo':'Libéré'));
      FreelToast(dname+' '+edit.day+' · '+w+' → '+lbl,'ok');
    }
    onClose();
  }

  return (
    <div className="edscrim" onClick={onClose}>
      <div className="edcard" onClick={e=>e.stopPropagation()}>
        <div className="edh">
          <div>
            <div className="ed-d">{dname} {edit.day} juin</div>
            <div className="ed-s">éditer une demi-journée ou la journée</div>
          </div>
          <button className="edx" onClick={onClose}><Ic d={I.x} s={14}/></button>
        </div>
        <div className="edb">
          <div className="whichseg">
            {[['am','Matin'],['pm','Après-midi'],['day','Journée']].map(([v,l])=>(
              <button key={v} className={which===v?'on':''} onClick={()=>setWhich(v)}>{l}</button>
            ))}
          </div>

          <p className="edseclbl mt">Type</p>
          <div className="typegrid">
            <button className={'typebtn work'+(type==='work'?' on':'')} onClick={()=>setType('work')}><Ic d={I.layers} s={16}/> Travail</button>
            <button className={'typebtn conge'+(type==='conge'?' on':'')} onClick={()=>setType('conge')}><Ic d={I.sun} s={16}/> Congé</button>
            <button className={'typebtn indispo'+(type==='indispo'?' on':'')} onClick={()=>setType('indispo')}><Ic d={I.ban} s={16}/> Indispo</button>
            <button className={'typebtn'+(type==='free'?' on':'')} onClick={()=>setType('free')}><Ic d={I.x} s={16}/> Libre</button>
          </div>

          {type==='work' && <>
            <p className="edseclbl mt">Client</p>
            <div className="clientchips">
              {Object.keys(CL).map(k=>(
                <button key={k} className={'cchip'+(client===k?' on':'')} onClick={()=>{setClient(k); setMission(CL[k].missions[0]);}}>
                  <span className="av" style={{background:CL[k].bg}}>{CL[k].short}</span>{CL[k].name}
                </button>
              ))}
            </div>
            <select className="edsel" value={mission} onChange={e=>setMission(e.target.value)}>
              {CL[client].missions.map(ms=><option key={ms}>{ms}</option>)}
            </select>
            <p className="edseclbl mt">Lieu</p>
            <div className="loc3">
              {Object.keys(LOC).map(l=>(
                <button key={l} className={loc===l?'on':''} onClick={()=>setLoc(l)}><Ic d={LOC[l].icon} s={13}/> {LOC[l].label}</button>
              ))}
            </div>
          </>}

          <div className="edfoot">
            <button className="btn" onClick={onClose}>Annuler</button>
            <button className="btn primary" onClick={save}><Ic d={I.check} s={15}/> Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ AUTRES ONGLETS (vues réelles, données du dossier) ============ */
function Missions(){
  const rows=[
    {c:'SL',m:'Refonte du site',st:'Active',j:'12 / 18 j',ca:'9 360 €',cls:'ok'},
    {c:'AN',m:'Identité de marque',st:'Active',j:'6,5 / 9 j',ca:'4 680 €',cls:'ok'},
    {c:'BV',m:'Carte & menus',st:'Active',j:'3 / 5 j',ca:'2 880 €',cls:'ok'},
    {c:'MK',m:'Catalogue produits',st:'Prospect',j:'— / 10 j',ca:'5 200 €',cls:'blue'},
    {c:'AN',m:'Charte éditoriale',st:'Perdue',j:'—',ca:'3 200 €',cls:'bad'},
  ];
  return (
    <div className="pane-grid">
      <div className="card span12" style={{padding:'8px 6px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px'}}>
          <div className="filtrow" style={{margin:0,flex:1}}>
            <span className="filt on">Toutes <span className="c">5</span></span>
            <span className="filt">Actives <span className="c">3</span></span>
            <span className="filt">Prospect <span className="c">1</span></span>
            <span className="filt">Perdues <span className="c">1</span></span>
          </div>
          <button className="btn primary" data-new="mission"><Ic d={I.plus} s={15}/> Nouvelle mission</button>
        </div>
        <table className="tbl2">
          <thead><tr><th>Client &amp; mission</th><th>Statut</th><th>Avancement</th><th className="n">CA mission</th><th className="n">Action</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i}>
                <td><div style={{display:'flex',alignItems:'center',gap:11}}><span className="av" style={{width:30,height:30,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#06140d',background:CL[r.c].bg,flexShrink:0}}>{CL[r.c].short}</span><div><b style={{fontWeight:600}}>{r.m}</b><div className="muted" style={{fontSize:12}}>{CL[r.c].name}</div></div></div></td>
                <td><span className={'chip2 '+r.cls}>{r.st}</span></td>
                <td className="muted num" style={{fontSize:13}}>{r.j}</td>
                <td className="n num">{r.ca}</td>
                <td className="n"><div style={{display:'inline-flex',gap:6}}>
                  <button className="miniact" title="Modifier la mission" onClick={()=>window.FreelDocs&&FreelDocs.mission({client:CL[r.c].name,nom:r.m})}><Ic d={I.edit} s={14}/></button>
                  <button className="miniact" data-new="facture" title="Facturer cette mission"><Ic d={I.doc} s={14}/></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Factures(){
  const rows=[
    {n:'2026-027',c:'BV',p:'Juin 2026',m:'2 880 €',enc:'',encE:'à émettre',st:'Brouillon',cls:'',act:I.edit},
    {n:'2026-024',c:'SL',p:'Mai 2026',m:'1 200 €',enc:'',encE:'attendu juin',st:'En retard · +18j',cls:'bad',act:I.mail},
    {n:'2026-025',c:'AN',p:'Mai 2026',m:'2 400 €',enc:'',encE:'attendu 25/07',st:'Envoyée',cls:'warn',act:I.doc},
    {n:'2026-023',c:'SL',p:'Avr 2026',m:'4 160 €',enc:'04 juin',st:'Payée',cls:'ok',act:I.doc},
    {n:'2026-022',c:'AN',p:'Avr 2026',m:'3 600 €',enc:'28 mai',st:'Payée',cls:'ok',act:I.doc},
    {n:'2026-021',c:'MK',p:'Mar 2026',m:'5 200 €',enc:'14 avr',st:'Payée',cls:'ok',act:I.doc},
  ];
  return (
    <div className="pane-grid">
      <div className="card span12" style={{padding:'8px 6px'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px'}}>
          <div style={{flex:1}}><b style={{fontSize:14}}>6 factures</b> <span className="muted" style={{fontSize:12.5}}>· 3 610 € en attente d'encaissement</span></div>
          <button className="btn" onClick={()=>window.FreelDocs&&FreelDocs.encaissement()}><Ic d={I.wallet} s={15}/> Encaisser</button>
          <button className="btn primary" data-new="facture"><Ic d={I.plus} s={15}/> Nouvelle facture</button>
        </div>
        <table className="tbl2">
          <thead><tr><th>N°</th><th>Client</th><th>Période</th><th className="n">Montant HT</th><th>Encaissé</th><th>Statut</th><th className="n">Action</th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i}>
                <td className="num">{r.n}</td>
                <td>{CL[r.c].name}</td>
                <td className="muted">{r.p}</td>
                <td className="n num">{r.m}</td>
                <td>{r.enc
                  ? <span style={{display:'inline-flex',alignItems:'center',gap:6,color:'var(--green)',fontFamily:'var(--mono)',fontSize:12.5}}><Ic d={I.check} s={13}/> {r.enc}</span>
                  : <span className="muted" style={{fontSize:12,fontStyle:'italic'}}>{r.encE}</span>}</td>
                <td><span className={'chip2 '+r.cls}>{r.st}</span></td>
                <td className="n"><button className="miniact" data-export="factures-pdf"><Ic d={r.act} s={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Clients({m}){
  const data=[
    {c:'SL',ca:'22 400 €',pct:'58%',cls:'bad',dso:42,ctr:30,note:'Dépendance > 50% — diversifie pour réduire le risque.',nc:'var(--red)'},
    {c:'AN',ca:'9 600 €',pct:'24%',cls:'',dso:58,ctr:60,note:'Paie dans les temps. Client fiable.',nc:'var(--muted)'},
    {c:'MK',ca:'5 200 €',pct:'18%',cls:'',dso:22,ctr:30,note:'Paie en avance. Excellent payeur.',nc:'var(--green)'},
  ];
  return (
    <div className="pane-grid">
      {data.map((d,i)=>(
        <div key={i} className="span4">
          <div className="clientcard">
            <div className="chh">
              <span className="av" style={{background:CL[d.c].bg}}>{CL[d.c].short}</span>
              <div style={{flex:1}}><div className="nm">{CL[d.c].name}</div></div>
              <span className={'chip2 '+d.cls}>{d.pct} du CA</span>
            </div>
            <div className="big2">{d.ca}</div>
            <div className="dso"><span className="muted">DSO réel <span style={{fontSize:11}}>· constaté</span></span><b style={{color:d.dso>d.ctr?'var(--amber)':'var(--green)'}}>{d.dso} j</b></div>
            <div className="dso"><span className="muted">Contractuel</span><b>{d.ctr} j</b></div>
            <p className="muted" style={{fontSize:12,margin:'12px 0 0',borderTop:'1px solid var(--line)',paddingTop:11,lineHeight:1.5}}><b style={{color:d.nc}}>•</b> {d.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Charges(){
  const recur=[
    {ic:I.layers,t:'Logiciels & abonnements',s:'Adobe, hébergement, outils',v:'142 €'},
    {ic:I.cog,t:'Assurance RC Pro',s:'mensualisée',v:'38 €'},
    {ic:I.building,t:'Coworking',s:'poste nomade 3j/sem',v:'220 €'},
  ];
  return (
    <div className="pane-grid">
      <div className="span6">
        <div className="card">
          <div className="card-h"><span className="lbl">Charges récurrentes</span><span className="muted" style={{fontSize:12}}>/ mois</span></div>
          {recur.map((c,i)=>(
            <div key={i} className="chargerow">
              <div className="ci"><Ic d={c.ic} s={15}/></div>
              <div className="cm"><b>{c.t}</b><span>{c.s}</span></div>
              <div className="cv">{c.v}</div>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:14,paddingTop:13,borderTop:'1px solid var(--line)'}}>
            <span className="muted" style={{fontSize:13}}>Total mensuel</span>
            <b className="num" style={{fontSize:17}}>400 €</b>
          </div>
        </div>
      </div>
      <div className="span6">
        <div className="card">
          <div className="card-h"><span className="lbl">Ce mois</span></div>
          <div className="chargerow"><div className="ci"><Ic d={I.receipt} s={15}/></div><div className="cm"><b>Nouveau clavier</b><span>Matériel · 07/06</span></div><div className="cv">62 €</div></div>
          <div className="chargerow"><div className="ci"><Ic d={I.cal} s={15}/></div><div className="cm"><b>Déplacement Nantes</b><span>Train · 12/06</span></div><div className="cv">89 €</div></div>
          <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:14}} onClick={()=>window.FreelToast&&FreelToast('Charge — saisie maquette','ok')}><Ic d={I.plus} s={15}/> Ajouter une charge</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
