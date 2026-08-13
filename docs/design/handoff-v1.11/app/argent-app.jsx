/* ============================================================
   FREEL — Argent · Trésorerie & Performance (prototype interactif)
   Deux piliers : le cash réel (trésorerie, provisions, fiscal) et
   l'argent généré (CA mensuel, projection, capacité de versement).
   Curseur de réserve live, drill provisions/mois. Réutilise freel.css.
   ============================================================ */
const { useState, useMemo } = React;
const ET = window.FreelEtat;

const I = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5',
  chart:'M4 19V5M4 15l5-5 4 3 6-7',
  calc:'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2',
  cog:'M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 3.6h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4z',
  book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 19v2',
  wallet:'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5',
  cart:'M3 4h2l2.4 12.5a2 2 0 002 1.5h8.7a2 2 0 002-1.6L23 8H6M9 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  left:'M15 18l-6-6 6-6', right:'M9 18l6-6-6-6',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14',
  download:'M12 3v12M7 11l5 5 5-5M5 21h14',
  doc:'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5ZM14 3v5h5',
  up:'M7 14l5-5 5 5', dn:'M7 10l5 5 5-5',
  cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18z',
  search:'M11 4a7 7 0 100 14 7 7 0 000-14M21 21l-4-4',
  shield:'M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  percent:'M19 5 5 19M7.5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M16.5 14a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  scale:'M12 3v18M7 21h10M5 7h14l-3 7H8L5 7ZM12 3 5 7M12 3l7 4',
  building:'M6 3h12v18H6zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  check:'M5 13l4 4L19 7', x:'M6 6l12 12M18 6 6 18',
  alert:'M12 3 2 20h20L12 3ZM12 10v5M12 18h.01',
  arrow:'M5 12h14M13 6l6 6-6 6', zap:'M13 2 4 14h7l-1 8 9-12h-7z',
  sparkle:'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  users:'M9 8a3 3 0 100 6 3 3 0 000-6M3 20a6 6 0 0112 0M16 5a3 3 0 010 6M21 20a6 6 0 00-4-5.6',
  flag:'M5 21V4M5 4l9 1.5L5 14', cal:'M3 4h18v17H3zM3 9h18M8 2v4M16 2v4',
};
function Ic({d, s=16, w=2, style}){
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {String(d).split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
  </svg>;
}
const eur=n=>Math.round(n).toLocaleString('fr-FR')+' €';

/* ---------- données ---------- */
const SOLDE=8120, DISPO=4940;
/* répartition du solde — dérivée de l'état partagé, jamais saisie deux fois */
const REPART=[
  {k:'vers', dot:'var(--green)', nm:'À te verser', tag:'', v:ET.versable()},
  {k:'res', dot:'var(--green-deep)', nm:'Réserve matelas', tag:'', v:ET.reserve},
  {k:'prov', dot:'var(--slate)', nm:'Provisions dues', tag:'', v:ET.provisions()},
];
/* mouvements & charges : désormais dans l'onglet Achats (registre + récurrent) */
/* projection trésorerie : entrées / sorties détaillées par mois */
const FLOW=[
  {m:'juin', cur:true, in:[['Studio Lumen — #023',4160],['Atelier Novak — #022',1850]], out:[['Charges fixes',400],['Salaire versé',2470],['Provision URSSAF',1980],['Logiciels & divers',360]]},
  {m:'juil', in:[['Studio Lumen — #026',2410],['Brasserie — #027',2880],['Acompte mission',1910]], out:[['URSSAF T2',1980],['Salaire versé',2900],['Charges',920]]},
  {m:'août', in:[['Atelier Novak — #025',2400],['Maison Kessler',3000]], out:[['Acompte IR',620],['Salaire versé',3980],['Charges',400]]},
  {m:'sept', in:[['Studio Lumen',5200],['Brasserie',2900]], out:[['TVA (si bascule)',1100],['Salaire versé',5000],['Charges',800]]},
  {m:'oct', in:[['Clients divers',6200]], out:[['URSSAF T3',1850],['Salaire versé',3150],['Charges',400]]},
  {m:'nov', in:[['Clients divers',6800]], out:[['Salaire versé',5600],['Charges',400]]},
  {m:'déc', in:[['Clients divers',5600]], out:[['CFE',410],['Salaire versé',5590],['Charges',400]]},
];
function flowRows(){
  let solde=8120;
  return FLOW.map(f=>{const inT=f.in.reduce((s,x)=>s+x[1],0),outT=f.out.reduce((s,x)=>s+x[1],0);solde=solde+inT-outT;return {...f,inT,outT,solde};});
}
/* enveloppes : la CIBLE vient des échéances de l'état, seul le montant déjà
   mis de côté est propre aux provisions */
const ENVS=[
  {id:'urssaf', nm:ET.ech('urssaf').lab, sub:'éch. 5 juil', ic:I.shield, amt:ET.ech('urssaf').amt, tgt:ET.ech('urssaf').amt, pct:100, st:'', note:'couvert'},
  {id:'ir', nm:'Impôt revenu', sub:'acompte août', ic:I.percent, amt:380, tgt:ET.ech('ir').amt, pct:Math.round(380/ET.ech('ir').amt*100), st:'warn', note:Math.round(380/ET.ech('ir').amt*100)+'%'},
  {id:'tva', nm:'TVA à venir', sub:'si dépassement', ic:I.scale, amt:200, tgt:1100, pct:18, st:'bad', note:'à constituer'},
  {id:'res', nm:'Réserve matelas', sub:'coussin perso', ic:I.wallet, amt:1200, tgt:ET.reserve, pct:Math.round(1200/ET.reserve*100), st:'', note:'50% par mois'},
];
const FISCAL=[
  {x:9,  t:'URSSAF T1',  d:'5 avr',  status:'payee', kind:'urssaf', det:'Cotisations du 1ᵉʳ trimestre déclarées et payées.'},
  {x:30, t:'Acompte IR', d:'15 mai', status:'payee', kind:'ir',     det:'Acompte d\'impôt sur le revenu prélevé.'},
  {x:52, t:'URSSAF T2',  d:'5 juil', status:'adecl', kind:'urssaf', det:'À déclarer avant le 5 juillet. Provision déjà constituée (1 980 €).'},
  {x:64, t:'Seuil TVA',  d:'~ sept', status:'watch', kind:'tva',    det:'Franchise en base aujourd\'hui. Bascule TVA estimée en septembre au franchissement de 37 500 €.'},
  {x:80, t:'URSSAF T3',  d:'5 oct',  status:'todo',  kind:'urssaf', det:'Cotisations du 3ᵉ trimestre — échéance à venir.'},
  {x:94, t:'CFE',        d:'15 déc', status:'todo',  kind:'cfe',    det:'Cotisation foncière des entreprises — avis attendu en fin d\'année.'},
];
const FSTAT={
  payee:{cls:'done', lab:'déclarée · payée', ic:I.check},
  adecl:{cls:'next', lab:'à déclarer',       ic:I.alert},
  watch:{cls:'watch',lab:'à surveiller',     ic:I.flag},
  todo: {cls:'todo', lab:'à venir',          ic:null},
};
const PROV_DETAIL={
  urssaf:{title:'Provision · URSSAF T2', total:'1 980 €', sub:'couvert sur 1 980 € dus', rows:[['CA déclarable T2','17 200 €'],['Cotisations (10,6%)','1 823 €'],['Impôt libératoire (2,2%)','157 €']]},
  ir:{title:'Provision · Impôt revenu', total:'380 €', sub:'sur 620 € · acompte d\'août', rows:[['Base imposable','35 400 €'],['Prélèvement à la source','620 €'],['Déjà provisionné','380 €']]},
  tva:{title:'Provision · TVA à venir', total:'200 €', sub:'sur ~1 100 € · si dépassement ~sept.', rows:[['Seuil franchise','37 500 €'],['CA encaissé','32 400 €'],['TVA estimée à collecter','~1 100 €']]},
  res:{title:'Réserve matelas', total:'1 200 €', sub:'sur 1 500 € · coussin de sécurité', rows:[['Cible','1 500 €'],['Alimentation','50% du versable / mois'],['Autonomie ajoutée','~1 mois']]},
};
/* CA mensuel k€ : réalisé / encaissé */
const CA=[
  {m:'Jan', r:9.4, e:8.0}, {m:'Fév', r:9.8, e:9.4}, {m:'Mar', r:10.9, e:9.8},
  {m:'Avr', r:8.3, e:10.9}, {m:'Mai', r:11.4, e:8.3}, {m:'Juin', r:9.6, e:7.0, cur:true},
];
const CA_MAX=12;
const COMPO={
  Jan:{real:[['#018 · Maison Kessler',5200,'Payée'],['#019 · Studio Lumen',4200,'Payée']], enc:[['#016 · Maison Kessler',5000],['#017 · Studio Lumen',3000]]},
  'Fév':{real:[['#020 · Atelier Novak',3600,'Payée'],['#021 · Studio Lumen',6200,'Payée']], enc:[['#018 · Maison Kessler',5200],['#019 · Studio Lumen',4200]]},
  Mar:{real:[['#021 · Maison Kessler',5200,'Payée'],['#022 · Atelier Novak',3600,'Payée'],['#023 · Studio Lumen',2100,'Payée']], enc:[['#020 · Atelier Novak',3600],['#021 · Studio Lumen',6200]]},
  Avr:{real:[['#024 · Studio Lumen',4160,'Payée'],['#025 · Atelier Novak',4140,'Payée']], enc:[['#021 · Maison Kessler',5200],['#022 · Atelier Novak',3600],['Acompte mission',2100]]},
  Mai:{real:[['#026 · Studio Lumen',7800,'Payée'],['#025 · Atelier Novak',2400,'Envoyée'],['#024 · Studio Lumen',1200,'En retard']], enc:[['#024 · Studio Lumen',4160],['#025 · Atelier Novak',4140]]},
  Juin:{real:[['Refonte · Studio Lumen',6240,'En cours'],['Identité · Atelier Novak',3380,'En cours']], enc:[['#023 · Studio Lumen',4160],['#022 · Atelier Novak',2840]]},
};
const CAP=[
  {m:'jan', cap:2800, vers:60}, {m:'fév', cap:3100, vers:60}, {m:'mar', cap:6300, vers:60},
  {m:'avr', cap:5200, vers:40}, {m:'mai', cap:4400, vers:50}, {m:'juin', cap:4940, vers:50, cur:true},
  {m:'juil', cap:4200, vers:50, proj:true}, {m:'août', cap:2600, vers:50, proj:true}, {m:'sep', cap:5100, vers:50, proj:true},
];
const CAP_MAX=6300;

/* TVA — seuil de franchise + aperçu 1er trimestre assujetti (données de démo) */
const TVA_SEUIL=37500;
const TVA_COLLECTEE=[   // ventes une fois assujetti · [libellé, base HT, TVA 20%]
  ['#031 · Studio Lumen',6200,1240],
  ['#032 · Maison Kessler',3000,600],
];
const TVA_DEDUCTIBLE=[  // achats portant TVA (écho de l'écran Achats) · [fournisseur, base HT, TVA, pièce]
  ['Adobe Systems',60,12,true],
  ['WeWork',220,44,true],
  ['OVHcloud',30,6,true],
];
const tvaState=()=>(typeof localStorage!=='undefined'&&localStorage.getItem('freel_tva'))||'franchise';

/* ============================================================ */
function App(){
  const [tab,setTab]=useState('tres');
  const [modal,setModal]=useState(null);   // {type:'prov'|'month', key}
  const [newMenu,setNewMenu]=useState(false), [expMenu,setExpMenu]=useState(false);

  React.useEffect(()=>{const h=()=>{setNewMenu(false);setExpMenu(false);};document.addEventListener('click',h);return()=>document.removeEventListener('click',h);},[]);

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">fre<b>e</b>l</div>
        <a className="nav" href="Pilote - Le Flux.html"><span className="ic"><Ic d={I.grid}/></span> Pilote</a>
        <a className="nav" href="Activité - Plan de charge.html"><span className="ic"><Ic d={I.layers}/></span> Activité &amp; congés</a>
        <a className="nav on" href="Argent - Trésorerie & Performance.html"><span className="ic"><Ic d={I.wallet}/></span> Argent</a>
        <a className="nav" href="Achats - Justificatifs & Banque.html"><span className="ic"><Ic d={I.cart}/></span> Achats</a>
        <a className="nav" href="Outils - Simulateurs.html"><span className="ic"><Ic d={I.calc}/></span> Outils</a>
        <a className="nav" href="Config.html"><span className="ic"><Ic d={I.cog}/></span> Config</a>
        <div className="rail-foot">
          <a className="nav" href="Config.html"><span className="ic"><Ic d={I.book}/></span> Livre des recettes</a>
          <div className="who"><div className="ava">AL</div><div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13}}>Atelier L.</div>
            <div className="muted" style={{fontSize:11.5}}>Micro-BNC · ACRE</div></div></div>
          <div className="buildtag"><span className="pulse"></span> build <b>10</b> · 16 juil.</div>
        </div>
      </aside>

      <div className="main" data-screen-label="Argent — Trésorerie & Performance">
        <div className="topbar">
          <div className="month"><b>Juin 2026</b></div>
          <div className="grow"></div>
          <span className="synced on" title="Synchronisé · multi-appareils"><Ic d={I.cloud} s={15}/> <span className="pulse"></span></span>
          <div className="search"><Ic d={I.search} s={15}/> <span>Rechercher…</span><span className="kbd">⌘K</span></div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn" onClick={()=>{setExpMenu(!expMenu);setNewMenu(false);}}><Ic d={I.download} s={15}/> Exporter</button>
            <div className={'menu'+(expMenu?' open':'')}>
              <div className="cap">Comptable</div>
              <div className="mi" onClick={()=>FreelToast('Livre des recettes (CSV) généré','ok')}><Ic d={I.doc} s={15}/> Livre des recettes (CSV)</div>
              <div className="mi" onClick={()=>FreelToast('Export FEC généré','ok')}><Ic d={I.doc} s={15}/> Export FEC</div>
              <div className="mi" onClick={()=>setModal({type:'prov',key:'urssaf'})}><Ic d={I.doc} s={15}/> Détail des provisions</div>
            </div>
          </div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn primary" onClick={()=>{setNewMenu(!newMenu);setExpMenu(false);}}><Ic d={I.plus} s={15}/> Nouveau</button>
            <div className={'menu'+(newMenu?' open':'')}>
              <div className="cap">Saisir</div>
              <div className="mi" onClick={()=>{setNewMenu(false);FreelToast('Salaire — saisie maquette','ok');}}><Ic d={I.wallet} s={15}/> Salaire</div>
              <div className="mi" data-new="facture"><Ic d={I.doc} s={15}/> Facture</div>
              <div className="mi" onClick={()=>{setNewMenu(false);window.FreelDocs&&FreelDocs.encaissement();}}><Ic d={I.up} s={15}/> Encaissement</div>
              <div className="mi" onClick={()=>{setNewMenu(false);window.FreelDocs&&FreelDocs.charge();}}><Ic d={I.minus} s={15}/> Charge</div>
            </div>
          </div>
        </div>

        <div className="content">
          <div className="greet a-reveal">
            <div>
              <h1>Ton argent</h1>
              <p>Deux questions, deux réponses : ce que tu as <b style={{color:'var(--text)'}}>là, pour de vrai</b> — et ce que ton activité <b style={{color:'var(--text)'}}>génère</b>.</p>
            </div>
            <span className="tag num">Provisions · 100% couvertes</span>
          </div>

          <div className="pillars a-reveal" style={{animationDelay:'.05s'}}>
            <button className={'pillar'+(tab==='tres'?' on':'')} onClick={()=>setTab('tres')}>
              <span className="pic"><Ic d={I.wallet} s={19}/></span>
              <span className="pt"><b>Trésorerie</b><span>combien j'ai là, pour de vrai ?</span></span>
              <span className="pv"><span className="n">{eur(DISPO)}</span><span className="l">disponible</span></span>
            </button>
            <button className={'pillar'+(tab==='perf'?' on':'')} onClick={()=>setTab('perf')}>
              <span className="pic"><Ic d={I.chart} s={19}/></span>
              <span className="pt"><b>Performance</b><span>combien je gagne, je me verse ?</span></span>
              <span className="pv"><span className="n">{ET.keur(ET.caRealise)}</span><span className="l">CA réalisé 2026</span></span>
            </button>
          </div>

          <div className="a-reveal" style={{animationDelay:'.1s'}}>
            {tab==='tres' ? <Tresorerie setModal={setModal}/> : <Performance/>}
          </div>
        </div>
      </div>

      {modal && <DrillModal modal={modal} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ============ TRÉSORERIE ============ */
function Tresorerie({setModal}){
  const [hot,setHot]=useState(null);
  const tva=tvaState();
  const colT=TVA_COLLECTEE.reduce((s,x)=>s+x[2],0);
  const dedT=TVA_DEDUCTIBLE.reduce((s,x)=>s+x[2],0);
  // conic gradient
  let acc=0; const segs=REPART.map(r=>{const start=acc/SOLDE*100; acc+=r.v; const end=acc/SOLDE*100; return `${r.dot} ${start}% ${end}%`;});
  const conic=`conic-gradient(${segs.join(',')})`;
  const aToi=REPART.filter(r=>r.k!=='prov').reduce((s,r)=>s+r.v,0);
  return (
    <>
      <div className="kpis2">
        <div className="kpi2"><div className="l">Solde du compte</div><div className="b">{eur(ET.solde)}</div><div className="s">au 10 juin 2026</div></div>
        <div className="kpi2"><div className="l">Disponible</div><div className="b" style={{color:'var(--green)'}}>{eur(ET.dispo())}</div><div className="s">à toi, hors provisions</div></div>
        <div className="kpi2"><div className="l">À encaisser</div><div className="b" style={{color:'var(--amber)'}}>{eur(ET.attente())}</div><div className="s">{ET.factures.filter(f=>f.state!=='paid').length} factures en attente</div></div>
        <div className="kpi2"><div className="l">Autonomie</div><div className="b">{String(ET.autonomie()).replace('.',',')} <span style={{fontSize:15,color:'var(--muted)'}}>mois</span></div><div className="s">charges + provisions lissées</div></div>
      </div>

      <div className="grid12">
        <div className="s12"><FluxChart setModal={setModal}/></div>
        <div className="s12">
          <div className="card" data-fold={'À toi '+eur(ET.dispo())+' (réserve '+eur(ET.reserve)+' + versable '+eur(ET.versable())+') · dus '+eur(ET.provisions())+' · solde '+eur(ET.solde)}>
            <div className="card-h"><span className="lbl">Ton solde n'est pas tout à toi</span><span className="muted num" style={{fontSize:12}}>solde {eur(ET.solde)}</span></div>
            <div className="donutwrap">
              <div className="donutrow">
                <div className="donut2" style={{background:conic}}>
                  <div className="dc"><b>{eur(aToi)}</b><small>à toi · hors prov.</small></div>
                </div>
                <div className="leg2">
                  {REPART.map(r=>(
                    <div key={r.k} className={'li2'+(hot===r.k?' hot':'')} onMouseEnter={()=>setHot(r.k)} onMouseLeave={()=>setHot(null)}>
                      <span className="dot" style={{background:r.dot}}></span>
                      <span className="nm">{r.nm} {r.tag&&<b style={{color:r.dot}}>{r.tag}</b>}</span>
                      <span className="v">{eur(r.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="muted donutnote">Sur les <b style={{color:'var(--text)'}}>{eur(ET.solde)}</b> du compte, <b style={{color:'var(--green)'}}>{eur(ET.dispo())}</b> sont à toi — <b style={{color:'var(--green)'}}>{eur(ET.reserve)}</b> de réserve gardée + <b style={{color:'var(--green)'}}>{eur(ET.versable())}</b> que tu peux te verser. Les <b style={{color:'var(--text)'}}>{eur(ET.provisions())}</b> restants sont <b>dus</b> (URSSAF, impôt, TVA) — détaillés dans les enveloppes ci-dessous.</p>
            </div>
          </div>
        </div>



        <div className="s12">
          <div className="card" data-fold={eur(ENVS.reduce((s,e)=>s+e.amt,0))+' provisionnés / '+eur(ENVS.reduce((s,e)=>s+e.tgt,0))+' dus · '+ENVS.filter(e=>e.st).length+' enveloppe(s) en retard'}>
            <div className="card-h"><span className="lbl">Enveloppes de provision — combien est mis de côté</span><span className="muted" style={{fontSize:12}}>clic = détail</span></div>
            <div className="envs">
              {ENVS.map(e=>(
                <button key={e.id} className={'env k-'+e.id+(e.st?' risk':'')} onClick={()=>setModal(e.id==='tva'?{type:'tvadecl'}:{type:'prov',key:e.id})}>
                  <div className="efill" style={{width:e.pct+'%'}}></div>
                  <div className="etop"><div><div className="enm">{e.nm}</div><div className="esub">{e.sub}</div></div><div className="ei"><Ic d={e.ic} s={14}/></div></div>
                  <div className="ebot"><div className="eamt">{eur(e.amt)}</div><div className="etgt">/ {eur(e.tgt)}</div>
                    <div className={'edue'+(e.st?' late':'')}>{e.sub}</div></div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TVA : le suivi complet s'ouvre depuis l'enveloppe « TVA à venir » ci-dessus */}

        <div className="s12">
          <div className="card" data-fold="Micro-BNC 69 % (53 600 / 77 700 €) · franchise TVA 86 % — bascule estimée sept.">
            <div className="card-h"><span className="lbl">Seuils — où j'en suis</span><span className="muted" style={{fontSize:12}}>plafonds annuels</span></div>
            <div className="seuils2">
              <div className="gauge2">
                <div className="gt"><span className="nm">Plafond micro-BNC</span><span className="pc" style={{color:'var(--green)'}}>{ET.seuilBNCpct()}%</span></div>
                <div className="track"><i style={{width:ET.seuilBNCpct()+'%',background:'var(--green)'}}></i></div>
                <div className="gsub"><span className="muted num">{eur(ET.caEncaisse)} / {eur(ET.seuilBNC)}</span><span className="muted">proj. <b style={{color:'var(--text)'}}>{eur(ET.caProjection)}</b></span></div>
              </div>
              <div className="gauge2">
                <div className="gt"><span className="nm">Franchise TVA</span><span className="pc" style={{color:'var(--c-tva)'}}>{ET.seuilTVApct()}%</span></div>
                <div className="track"><i style={{width:ET.seuilTVApct()+'%',background:'var(--c-tva)'}}></i><span className="now" style={{left:ET.seuilTVApct()+'%'}}></span></div>
                <div className="gsub"><span className="muted num">{eur(ET.caEncaisse)} / {eur(ET.seuilTVA)}</span><span style={{color:'var(--red)'}}>dépass. ~ sept.</span></div>
              </div>
            </div>
            <p className="muted" style={{fontSize:11.5,margin:'14px 0 0',borderTop:'1px solid var(--line)',paddingTop:12,lineHeight:1.55}}>Au franchissement TVA, tu la factures dès le 1ᵉʳ jour du mois de dépassement.</p>
          </div>
        </div>

        <div className="s12">
          <div className="card" data-fold="Prochaine échéance : URSSAF T2 · 5 juillet · à déclarer (1 980 € provisionnés)">
            <div className="card-h"><span className="lbl">Échéancier &amp; obligations 2026</span>
              <span className="muted callegend" style={{fontSize:11.5}}>
                <span><i style={{background:'var(--c-urssaf)'}}></i>URSSAF</span>
                <span><i style={{background:'var(--c-tva)'}}></i>TVA</span>
                <span><i style={{background:'var(--c-ir)'}}></i>Impôt</span>
                <span><i style={{background:'var(--c-cfe)'}}></i>CFE</span>
              </span>
            </div>
            <div className="calband">
              <div className="calaxis"><span className="past" style={{width:'43%'}}></span></div>
              <div className="calnow" style={{left:'43%'}}><b>auj.</b></div>
              {FISCAL.map((f,i)=>{const st=FSTAT[f.status];return (
                <div key={i} className="cev" style={{left:f.x+'%'}} onClick={()=>{ if(f.kind==='urssaf') setModal({type:'prov',key:'urssaf'}); else if(f.kind==='tva') setModal({type:'tvadecl'}); else FreelToast(f.t+' · '+st.lab,'ok'); }}>
                  <span className={'tip'+(f.x>=78?' tr':f.x<=14?' tl':'')}><b>{f.t} · {f.d}</b><span className={'tst '+st.cls}>{st.lab}</span><em>{f.det}</em></span>
                  <span className={'cp k-'+f.kind+(f.status==='payee'?' paid':' up')}></span>
                  <span className="ct">{f.t}</span><span className="cd">{f.d}</span>
                </div>
              );})}
            </div>
            <div className="calmonths">{['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'].map(m=><span key={m}>{m}</span>)}</div>
            <p className="muted" style={{fontSize:11,margin:'8px 0 0',lineHeight:1.5}}>Couleur = type de charge · <b style={{color:'var(--text)'}}>point plein</b> = déclarée &amp; payée, <b style={{color:'var(--text)'}}>contour</b> = à venir. Survole pour le détail, clique pour ouvrir le dossier.</p>
          </div>
        </div>
        <div className="s4b-removed" style={{display:'none'}}></div>
      </div>
    </>
  );
}

/* ============ PERFORMANCE ============ */
function Performance(){
  const [pct,setPct]=useState(50);
  const [sel,setSel]=useState('Juin');
  const versable=Math.round(DISPO*(1-pct/100)/10)*10;
  const c=COMPO[sel]||{real:[],enc:[]};
  const realTot=c.real.reduce((s,x)=>s+x[1],0);
  const encTot=c.enc.reduce((s,x)=>s+x[1],0);
  const ecart=realTot-encTot;
  const caR=CA.reduce((s,x)=>s+x.r,0), caE=CA.reduce((s,x)=>s+x.e,0);
  return (
    <>
      <div className="kpis2">
        <div className="kpi2"><div className="l">CA réalisé · 2026</div><div className="b">{caR.toFixed(1).replace('.',',')} k€</div><div className="s">facturé, cumulé</div></div>
        <div className="kpi2"><div className="l">CA encaissé</div><div className="b" style={{color:'var(--green)'}}>{caE.toFixed(1).replace('.',',')} k€</div><div className="s">reçu sur le compte</div></div>
        <div className="kpi2"><div className="l">À encaisser</div><div className="b" style={{color:'var(--amber)'}}>{eur(ET.attente())}</div><div className="s">{ET.factures.filter(f=>f.state!=='paid').length} factures en attente</div></div>
        <div className="kpi2"><div className="l">Résultat projeté</div><div className="b">~46 k€</div><div className="s">après cotisations · fin 2026</div></div>
      </div>

      <div className="grid12">
        <div className="s8">
          <div className="card">
            <div className="card-h"><span className="lbl">CA réalisé vs encaissé — clic sur un mois = composition</span><span className="muted" style={{fontSize:12}}>montants en k€</span></div>
            <div className="cabars">
              {CA.map(c=>(
                <div key={c.m} className={'m'+(c.cur?' cur':'')+(sel===c.m?' sel':'')} onClick={()=>setSel(c.m)}>
                  <div className="grp"><i className="r" style={{height:(c.r/CA_MAX*100)+'%'}}></i><i className="e" style={{height:(c.e/CA_MAX*100)+'%'}}></i></div>
                  <div className="cav"><b>{c.r.toFixed(1).replace('.',',')}<span style={{fontSize:8,fontWeight:600,opacity:.65}}> k€</span></b><span>{c.e.toFixed(1).replace('.',',')}</span></div>
                  <div className="ml">{c.m}</div>
                </div>
              ))}
            </div>
            <div className="leg-inline">
              <span className="lg"><i style={{background:'var(--blue)'}}></i> CA réalisé <span className="muted">(facturé)</span></span>
              <span className="lg"><i style={{background:'var(--green)'}}></i> CA encaissé</span>
              <span style={{marginLeft:'auto',color:'var(--text)',fontWeight:600}}>Cumulé : {caR.toFixed(1).replace('.',',')} k€ réalisé · {caE.toFixed(1).replace('.',',')} k€ encaissé</span>
            </div>
          </div>
        </div>
        <div className="s4">
          <div className="card" style={{height:'100%'}}>
            <div className="card-h"><span className="lbl">Composition · {sel}</span></div>
            <div style={{fontSize:10.5,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--blue)',fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:2}}><span>Réalisé · facturé</span><span className="num">{eur(realTot)}</span></div>
            {c.real.map((r,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderBottom:'1px solid var(--line)',fontSize:12.5}}>
                <span style={{minWidth:0}}><b style={{fontWeight:600}}>{r[0].split(' · ')[0]}</b><span className="muted" style={{display:'block',fontSize:11}}>{r[0].split(' · ')[1]||''}{r[2]?' · '+r[2]:''}</span></span>
                <span className="num" style={{whiteSpace:'nowrap'}}>{eur(r[1])}</span>
              </div>
            ))}
            <div style={{fontSize:10.5,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--green)',fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'baseline',margin:'15px 0 2px'}}><span>Encaissé · reçu</span><span className="num">{eur(encTot)}</span></div>
            {c.enc.map((r,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',gap:8,padding:'7px 0',borderBottom:'1px solid var(--line)',fontSize:12.5}}>
                <span style={{minWidth:0}}><b style={{fontWeight:600}}>{r[0].split(' · ')[0]}</b><span className="muted" style={{display:'block',fontSize:11}}>{r[0].split(' · ')[1]||''}</span></span>
                <span className="num" style={{whiteSpace:'nowrap',color:'var(--green)'}}>{eur(r[1])}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',marginTop:12,paddingTop:11,borderTop:'1px solid var(--line)',fontSize:12.5}}>
              <span className="muted">{ecart>=0?'Reste à encaisser':'Encaissé d’avance'}</span>
              <b className="num" style={{color:ecart>0?'var(--amber)':'var(--green)'}}>{ecart>=0?'+':'−'}{eur(Math.abs(ecart))}</b>
            </div>
          </div>
        </div>

        <div className="s5">
          <div className="card">
            <div className="card-h"><span className="lbl" style={{color:'var(--green)'}}>Tu peux te verser</span>
              <span style={{fontFamily:'var(--mono)',fontSize:10.5,color:'var(--green)',background:'var(--green-glow)',border:'1px solid rgba(84,207,145,.3)',padding:'2px 8px',borderRadius:20}}>dispo − réserve</span>
            </div>
            <div style={{fontFamily:'var(--mono)',fontSize:42,fontWeight:700,color:'var(--green)',letterSpacing:'-.02em'}}>{eur(versable)}</div>
            <div style={{marginTop:18,borderTop:'1px solid var(--line)',paddingTop:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12.5,marginBottom:8}}>
                <span className="muted">Réserve auto gardée <span style={{color:'var(--muted-2)'}}>(matelas)</span></span>
                <span className="num" style={{color:'var(--text)'}}>{pct}%</span>
              </div>
              <input className="rng" type="range" min="0" max="80" step="5" value={pct} onChange={e=>setPct(+e.target.value)}/>
              <p className="muted" style={{fontSize:11.5,margin:'11px 0 0',lineHeight:1.55}}>Sur ta part disponible ({eur(DISPO)}), tu gardes <b style={{color:'var(--text)'}}>{pct}%</b> en réserve ({eur(DISPO*pct/100)}) et te verses le reste.</p>
            </div>
            <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:16}} onClick={()=>FreelToast('Versement de '+eur(versable)+' enregistré','ok')}><Ic d={I.wallet} s={15}/> Enregistrer le versement</button>
          </div>
        </div>
        <div className="s7">
          <div className="card">
            <div className="card-h"><span className="lbl">Capacité de versement par mois</span><span className="muted" style={{fontSize:12}}>barre = capacité · plein = versé</span></div>
            <div className="capbars">
              {CAP.map(c=>(
                <div key={c.m} className={'cb'+(c.cur?' cur':'')+(c.proj?' proj':'')}>
                  <span className="cv">{(c.cap/1000).toFixed(1).replace('.',',')}k</span>
                  <div className="track" style={{height:(c.cap/CAP_MAX*100)+'%'}}><span className="fill" style={{height:c.vers+'%'}}></span></div>
                  <span className="cm">{c.m}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{fontSize:11.5,margin:'14px 0 0',lineHeight:1.55,borderTop:'1px solid var(--line)',paddingTop:13}}>Hauteur = ce que tu <b style={{color:'var(--text)'}}>pouvais</b> te verser (revenu − charges). Plein vert = ce que tu as <b style={{color:'var(--green)'}}>pris</b> ; l'écart est resté en réserve. Hachuré = projeté.</p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============ DRILL MODAL ============ */
function FluxChart({setModal}){
  const rows=flowRows();
  const max=Math.max.apply(null, rows.map(r=>Math.max(r.inT,r.outT)));
  const endSolde=rows[rows.length-1].solde;
  const k=n=>(n/1000).toFixed(1).replace('.',',')+'k';
  const soldes=rows.map(r=>r.solde);
  const seuil=5000, minS=4500, maxS=Math.max.apply(null,soldes)+800;
  const X=i=>(i+0.5)/rows.length*700;
  const Y=v=>110-(v-minS)/(maxS-minS)*96;
  const line=rows.map((r,i)=>X(i).toFixed(1)+','+Y(r.solde).toFixed(1)).join(' ');
  const area='0,120 '+line+' 700,120';
  return (
    <div className="card">
      <div className="card-h">
        <span className="lbl">Évolution du compte — entrées, sorties &amp; solde</span>
        <span className="muted" style={{fontSize:12,display:'flex',gap:14,flexWrap:'wrap'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><i style={{width:14,height:2,background:'var(--green)',display:'inline-block'}}></i>solde</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><i style={{width:10,height:10,borderRadius:3,background:'var(--green)',display:'inline-block'}}></i>entrées</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:6}}><i style={{width:10,height:10,borderRadius:3,background:'var(--amber)',display:'inline-block'}}></i>sorties</span>
        </span>
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:16,marginBottom:8,flexWrap:'wrap'}}>
        <div><span className="muted" style={{fontSize:12}}>Solde aujourd'hui </span><b className="num" style={{fontSize:18}}>8 120 €</b></div>
        <Ic d={I.arrow} s={15} style={{color:'var(--muted-2)'}}/>
        <div><span className="muted" style={{fontSize:12}}>Projeté fin déc. </span><b className="num" style={{fontSize:18,color:'var(--green)'}}>{eur(endSolde)}</b></div>
        </div>
      <div className="soldecurve">
        <svg viewBox="0 0 700 120" preserveAspectRatio="none">
          <defs><linearGradient id="sgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#54cf91" stopOpacity=".20"/><stop offset="1" stopColor="#54cf91" stopOpacity="0"/></linearGradient></defs>
          <line x1="0" y1={Y(seuil)} x2="700" y2={Y(seuil)} stroke="#e3b35f" strokeOpacity=".5" strokeDasharray="5 5"/>
          <polygon points={area} fill="url(#sgrad)"/>
          <polyline points={line} fill="none" stroke="#54cf91" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
        {rows.map((r,i)=>(
          <React.Fragment key={i}>
            <span className="dot" style={{left:(X(i)/7).toFixed(2)+'%',top:(Y(r.solde)/120*100).toFixed(1)+'%'}}></span>
            <span className={'pt'+(r.cur?' cur':'')} style={{left:(X(i)/7).toFixed(2)+'%',top:(Y(r.solde)/120*100).toFixed(1)+'%'}}>{k(r.solde)}</span>
          </React.Fragment>
        ))}
        <span className="seuil" style={{top:(Y(seuil)/120*100).toFixed(1)+'%'}}>seuil 5 000 €</span>
      </div>
      <div className="fluxchart">
        {rows.map((r,i)=>{const net=r.inT-r.outT;return (
          <button key={i} className={'fluxcol'+(r.cur?' cur':'')} onClick={()=>setModal({type:'flow',i})}>
            <span className="inv">+{k(r.inT)}</span>
            <div className="fluxbars">
              <div className="half top"><div className="up" style={{height:(r.inT/max*100)+'%'}}></div></div>
              <span className="base"></span>
              <div className="half bot"><div className="dn" style={{height:(r.outT/max*100)+'%'}}></div></div>
            </div>
            <span className="outv">−{k(r.outT)}</span>
            <span className="ml">{r.m}</span>
            <span className="sld" style={{color:net>=0?'var(--green)':'var(--red)'}}>{net>=0?'+':'−'}{k(Math.abs(net))}</span>
          </button>
        );})}
      </div>
      <p className="muted" style={{fontSize:11.5,margin:'12px 0 0',lineHeight:1.5}}>La courbe = solde du compte mois par mois (montant à chaque point). Sous chaque mois : la <b style={{color:'var(--text)'}}>balance du mois</b> (entrées − sorties). Clique un mois pour le détail.</p>
    </div>
  );
}

function FlowModal({i,onClose}){
  const row=flowRows()[i];
  const net=row.inT-row.outT;
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>Flux de {row.m} 2026</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="resbox"><div><div className="muted" style={{fontSize:12}}>Solde fin de mois</div><div style={{fontSize:11.5,color:'var(--muted-2)',marginTop:2}}>net du mois {net>=0?'+':'−'}{eur(Math.abs(net))}</div></div><div className="rv" style={{color:row.solde<5000?'var(--red)':'var(--green)'}}>{eur(row.solde)}</div></div>
          <div className="lbl" style={{color:'var(--green)',marginBottom:8}}>Entrées · {eur(row.inT)}</div>
          {row.in.map((x,j)=><div key={j} className="drow"><div className="dn2"><b>{x[0]}</b></div><div className="da" style={{color:'var(--green)'}}>+{eur(x[1])}</div></div>)}
          <div className="lbl" style={{color:'var(--amber)',margin:'18px 0 8px'}}>Sorties · {eur(row.outT)}</div>
          {row.out.map((x,j)=><div key={j} className="drow"><div className="dn2"><b>{x[0]}</b></div><div className="da" style={{color:'var(--amber)'}}>−{eur(x[1])}</div></div>)}
        </div>
      </div>
    </div>
  );
}

function DeclarationUrssaf({onClose}){
  const CA=17200, soc=Math.round(CA*0.116), ir=Math.round(CA*0.022), total=soc+ir;
  const ENC=[['Avril · #021 Maison Kessler',5200],['Mai · #024 Studio Lumen',4160],['Mai · #025 Atelier Novak',4140],['Juin · #023 Studio Lumen',3700]];
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>Déclaration URSSAF · 2ᵉ trimestre 2026</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="resbox"><div><div className="muted" style={{fontSize:12}}>Total à payer · échéance 5 juillet</div><div style={{fontSize:11.5,color:'var(--muted-2)',marginTop:2}}>télépaiement · prélèvement SEPA</div></div><div className="rv" style={{color:'var(--amber)'}}>{eur(total)}</div></div>

          <div className="lbl" style={{marginBottom:6}}>Encaissements du trimestre · = {eur(CA)}</div>
          {ENC.map((x,i)=><div key={i} className="drow"><div className="dn2"><b>{x[0].split(' · ')[1]||x[0]}</b><span>{x[0].split(' · ')[0]}</span></div><div className="da">{eur(x[1])}</div></div>)}
          <a className="btn" style={{width:'100%',justifyContent:'center',margin:'12px 0 18px'}} href="Achats - Justificatifs & Banque.html"><Ic d={I.doc} s={15}/> Voir factures &amp; pièces</a>

          <div className="lbl" style={{marginBottom:8}}>À renseigner sur le portail</div>
          <div style={{border:'1px solid rgba(111,182,224,.3)',background:'var(--blue-soft)',borderRadius:11,padding:'4px 14px 6px',marginBottom:16}}>
            <div className="drow"><div className="dn2"><b>Nature de l'activité</b><span>prestations de services (BNC)</span></div></div>
            <div className="drow"><div className="dn2"><b>Période déclarée</b><span>avril · mai · juin 2026</span></div></div>
            <div className="drow" style={{borderBottom:'none'}}><div className="dn2"><b>Chiffre d'affaires encaissé</b><span>le seul chiffre à saisir — base encaissée</span></div><div className="da" style={{color:'var(--blue)',fontSize:16}}>{eur(CA)}</div></div>
          </div>

          <div className="lbl" style={{marginBottom:8}}>Calculé automatiquement par l'URSSAF</div>
          <div className="drow"><div className="dn2"><b>Cotisations sociales + CFP</b><span>11,6% · taux ACRE</span></div><div className="da">{eur(soc)}</div></div>
          <div className="drow"><div className="dn2"><b>Versement libératoire de l'impôt</b><span>2,2% · si option active</span></div><div className="da">{eur(ir)}</div></div>
          <div className="drow" style={{borderTop:'1px solid var(--line-2)'}}><div className="dn2"><b>Total prélevé</b></div><div className="da" style={{color:'var(--amber)',fontSize:15}}>{eur(total)}</div></div>

          <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:18}} onClick={()=>window.open('https://www.autoentrepreneur.urssaf.fr','_blank','noopener')}><Ic d={I.arrow} s={15}/> Déclarer sur autoentrepreneur.urssaf.fr</button>
          <p className="muted" style={{fontSize:11,margin:'12px 0 0',lineHeight:1.5}}>La part sociale (~1 980 €) est déjà dans ton bocal URSSAF ; le libératoire est ton impôt sur le revenu. Le CA à déclarer = somme des encaissements du trimestre (pas des factures émises).</p>
        </div>
      </div>
    </div>
  );
}

function TvaModal({onClose}){
  const DEP=window.FreelDepenses;
  const [p,setP]=useState({kind:'quarter',y:2026,q:1});
  const colT=TVA_COLLECTEE.reduce((s,x)=>s+x[2],0);
  const s=DEP?DEP.summary(p,'tous'):{items:[],tva:0,recov:0,blocked:0,missing:0,ttc:0,n:0};
  const net=colT-s.recov;
  const assuj=tvaState()==='assujetti';
  const QS=[{k:'quarter',q:0,l:'T1'},{k:'quarter',q:1,l:'T2'},{k:'quarter',q:2,l:'T3'},{k:'quarter',q:3,l:'T4'},{k:'year',l:'Année'}];
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>Dossier TVA · {DEP?DEP.periodLabel(p):''}</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="tvaper">
            {QS.map(q=>(
              <button key={q.l} className={'ps'+((p.kind===q.k&&(q.k==='year'||p.q===q.q))?' on':'')}
                onClick={()=>setP(q.k==='year'?{kind:'year',y:2026}:{kind:'quarter',y:2026,q:q.q})}>{q.l}</button>
            ))}
          </div>
          {!assuj && <div style={{display:'flex',gap:10,alignItems:'flex-start',padding:'11px 13px',borderRadius:11,background:'var(--blue-soft)',border:'1px solid rgba(111,182,224,.28)',margin:'14px 0 16px',fontSize:12,lineHeight:1.5}}><Ic d={I.shield} s={15} style={{color:'var(--blue)',flexShrink:0,marginTop:1}}/><span>Tu es encore en franchise : voici à quoi ressemblera ta déclaration <b>le jour du franchissement</b>. Le déductible est déjà réel, alimenté par tes achats.</span></div>}
          <div className="resbox"><div><div className="muted" style={{fontSize:12}}>TVA nette à reverser</div><div style={{fontSize:11.5,color:'var(--muted-2)',marginTop:2}}>collectée − déductible récupérable</div></div><div className="rv" style={{color:'var(--c-tva)'}}>{eur(net)}</div></div>

          <div className="lbl" style={{color:'var(--green)',marginBottom:6}}>TVA collectée · {eur(colT)}</div>
          {TVA_COLLECTEE.map((x,i)=><div key={i} className="drow"><div className="dn2"><b>{x[0]}</b><span>base {eur(x[1])} · 20%</span></div><div className="da" style={{color:'var(--green)'}}>{eur(x[2])}</div></div>)}

          <div className="lbl" style={{color:'var(--c-tva)',margin:'18px 0 6px'}}>TVA déductible récupérable · {eur(s.recov)}</div>
          {s.items.filter(e=>e.tva>0).length===0 && <p className="muted" style={{fontSize:12.5,padding:'6px 0'}}>Aucune dépense avec TVA sur cette période.</p>}
          {s.items.filter(e=>e.tva>0).map(e=>(
            <div key={e.id} className="drow">
              <div className="dn2"><b>{e.four}</b><span>{e.date.slice(8,10)}/{e.date.slice(5,7)} · {e.cat} · base {eur(e.ttc-e.tva)}{e.piece?' · pièce jointe ✓':' · sans pièce'}</span></div>
              <div className="da" style={{color:e.piece?'var(--c-tva)':'var(--muted-2)',textDecoration:e.piece?'none':'line-through'}}>{eur(e.tva)}</div>
            </div>
          ))}

          {s.blocked>0 && <div style={{display:'flex',gap:10,alignItems:'flex-start',padding:'11px 13px',borderRadius:11,background:'var(--amber-soft)',border:'1px solid rgba(227,179,95,.3)',marginTop:14,fontSize:12,lineHeight:1.5}}>
            <Ic d={I.alert} s={15} style={{color:'var(--amber)',flexShrink:0,marginTop:1}}/>
            <span><b>{eur(s.blocked)}</b> de TVA non récupérable : {s.missing} dépense{s.missing>1?'s':''} sans justificatif. Joins les pièces avant de déclarer.</span>
          </div>}

          <div className="frow2b">
            <a className="btn" href="Achats - Justificatifs & Banque.html"><Ic d={I.doc} s={15}/> Voir les pièces</a>
            <button className="btn" onClick={()=>FreelToast('Justificatifs de la période ('+s.items.filter(e=>e.piece).length+' pièces) — ZIP généré','ok')}><Ic d={I.download} s={15}/> Justificatifs (ZIP)</button>
          </div>
          <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={()=>{FreelToast('Dossier TVA prêt — à télédéclarer','ok');onClose();}}><Ic d={I.arrow} s={15}/> Préparer la télédéclaration</button>
        </div>
      </div>
    </div>
  );
}

function DrillModal({modal,onClose}){
  if(modal.type==='flow') return <FlowModal i={modal.i} onClose={onClose}/>;
  if(modal.type==='tvadecl') return <TvaModal onClose={onClose}/>;
  if(modal.key==='urssaf') return <DeclarationUrssaf onClose={onClose}/>;
  const d=PROV_DETAIL[modal.key]||PROV_DETAIL.urssaf;
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>{d.title}</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="resbox"><div><div className="muted" style={{fontSize:12}}>Provisionné</div><div style={{fontSize:11.5,color:'var(--muted-2)',marginTop:2}}>{d.sub}</div></div><div className="rv">{d.total}</div></div>
          <table className="tbl3">
            <tbody>
              {d.rows.map((r,i)=><tr key={i}><td>{r[0]}</td><td className="n">{r[1]}</td></tr>)}
            </tbody>
          </table>
          <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:18}} onClick={()=>{FreelToast('Provision mise à jour','ok');onClose();}}><Ic d={I.shield} s={15}/> Provisionner maintenant</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
