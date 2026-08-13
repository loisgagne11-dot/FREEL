/* ============================================================
   FREEL — Achats · Justificatifs & Banque (prototype interactif)
   Le coffre à preuves : chaque dépense, sa pièce, son compte,
   son état de rapprochement. Toutes les données viennent du
   store partagé freel-depenses.js (Argent le lit pour la TVA).
   ============================================================ */
const { useState, useMemo, useEffect } = React;
const DEP = window.FreelDepenses;

const I = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5',
  chart:'M4 19V5M4 15l5-5 4 3 6-7',
  calc:'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2',
  cog:'M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 3.6h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4z',
  book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 19v2',
  wallet:'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5',
  cart:'M3 4h2l2.4 12.5a2 2 0 002 1.5h8.7a2 2 0 002-1.6L23 8H6M9 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  plus:'M12 5v14M5 12h14', minus:'M5 12h14',
  download:'M12 3v12M7 11l5 5 5-5M5 21h14',
  doc:'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5ZM14 3v5h5',
  paperclip:'M21 8.5 12.5 17a4 4 0 01-5.7-5.7l8-8a2.5 2.5 0 013.5 3.5l-8 8a1 1 0 01-1.4-1.4l7.3-7.3',
  cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18z',
  search:'M11 4a7 7 0 100 14 7 7 0 000-14M21 21l-4-4',
  shield:'M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z',
  building:'M6 3h12v18H6zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  link:'M9 15l6-6M10.5 6.5 12 5a4 4 0 015.7 5.7l-1.5 1.5M13.5 17.5 12 19a4 4 0 01-5.7-5.7l1.5-1.5',
  alert:'M12 3 2 20h20L12 3ZM12 10v5M12 18h.01',
  up:'M7 14l5-5 5 5', dn:'M7 10l5 5 5-5',
  bank:'M4 10h16M4 10 12 4l8 6M6 10v8M18 10v8M10 10v8M14 10v8M3 21h18',
  cal:'M3 4h18v17H3zM3 9h18M8 2v4M16 2v4',
  percent:'M19 5 5 19M7.5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M16.5 14a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  x:'M6 6l12 12M18 6 6 18', arrow:'M5 12h14M13 6l6 6-6 6', check:'M5 13l4 4L19 7',
  left:'M15 18l-6-6 6-6', right:'M9 18l6-6-6-6', clock:'M12 4a8 8 0 100 16 8 8 0 000-16M12 8v4l3 2',
};
function Ic({d, s=16, w=2, style}){
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {String(d).split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
  </svg>;
}
const eur=n=>Math.round(n).toLocaleString('fr-FR')+' €';
const eur2=n=>n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const CAT_IC={Logiciels:I.layers,'Hébergement':I.cloud,'Matériel':I.doc,'Déplacement':I.cal,Coworking:I.building,'Assurance RC Pro':I.shield,Honoraires:I.doc,Formation:I.book,'Télécom':I.cloud,Autre:I.cart};
const fdate=(iso,withY)=>iso.slice(8,10)+'/'+iso.slice(5,7)+(withY?'/'+iso.slice(2,4):'');
const RECON={
  matched:{lab:'rapprochée', cls:'ok', ic:I.check},
  pending:{lab:'en attente de rapprochement', cls:'wait', ic:I.clock},
  nobank:{lab:'hors compte synchronisé', cls:'na', ic:I.building},
};

/* ============================================================ */
function App(){
  const [,force]=useState(0);
  useEffect(()=>DEP.subscribe(()=>force(n=>n+1)),[]);

  const [period,setPeriod]=useState({kind:'month',y:2026,m:5});
  const [acct,setAcct]=useState('tous');
  const [modal,setModal]=useState(null);   // {kind:'achat'|'new'|'fromBank'|'link', ...}
  const [newMenu,setNewMenu]=useState(false), [expMenu,setExpMenu]=useState(false);

  useEffect(()=>{const h=()=>{setNewMenu(false);setExpMenu(false);};document.addEventListener('click',h);return()=>document.removeEventListener('click',h);},[]);
  // ouverture directe depuis une autre page : ?new=depense
  useEffect(()=>{
    if(new URLSearchParams(location.search).get('new')==='depense') setModal({kind:'new'});
  },[]);

  const list = DEP.filter(period, acct);
  const s = DEP.summary(period, acct);
  const openBank = DEP.openBank();
  const pending = DEP.pendingList();
  const toRec = openBank.length + pending.length;
  const recTotal = list.filter(e=>e.rec).reduce((t,e)=>t+e.ttc,0);
  const withY = period.kind==='all';

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">fre<b>e</b>l</div>
        <a className="nav" href="Pilote - Le Flux.html"><span className="ic"><Ic d={I.grid}/></span> Pilote</a>
        <a className="nav" href="Activité - Plan de charge.html"><span className="ic"><Ic d={I.layers}/></span> Activité &amp; congés</a>
        <a className="nav" href="Argent - Trésorerie & Performance.html"><span className="ic"><Ic d={I.wallet}/></span> Argent</a>
        <a className="nav on" href="Achats - Justificatifs & Banque.html"><span className="ic"><Ic d={I.cart}/></span> Achats</a>
        <a className="nav" href="Outils - Simulateurs.html"><span className="ic"><Ic d={I.calc}/></span> Outils</a>
        <a className="nav" href="Config.html"><span className="ic"><Ic d={I.cog}/></span> Config</a>
        <div className="rail-foot">
          <a className="nav" href="Config.html#livre"><span className="ic"><Ic d={I.book}/></span> Livre des recettes</a>
          <div className="who"><div className="ava">AL</div><div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13}}>Atelier L.</div>
            <div className="muted" style={{fontSize:11.5}}>Micro-BNC · ACRE</div></div></div>
          <div className="buildtag"><span className="pulse"></span> build <b>10</b> · 25 juil.</div>
        </div>
      </aside>

      <div className="main" data-screen-label="Achats — Justificatifs & Banque">
        <div className="topbar">
          {period.kind!=='all'
            ? <div className="month" style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="ico-btn sm" title="Période précédente" onClick={()=>stepPeriod(setPeriod,-1)}><Ic d={I.left} s={14}/></button>
                <b>{DEP.periodLabel(period)}</b>
                <button className="ico-btn sm" title="Période suivante" onClick={()=>stepPeriod(setPeriod,1)}><Ic d={I.right} s={14}/></button>
              </div>
            : <div className="month"><b>{DEP.periodLabel(period)}</b></div>}
          <div className="grow"></div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn" onClick={()=>{setExpMenu(!expMenu);setNewMenu(false);}}><Ic d={I.download} s={15}/> <span className="lbl-t">Exporter</span></button>
            <div className={'menu'+(expMenu?' open':'')}>
              <div className="cap">{DEP.periodLabel(period)}</div>
              <div className="mi" onClick={()=>FreelToast('Justificatifs ('+s.n+' pièces) — ZIP généré','ok')}><Ic d={I.doc} s={15}/> Justificatifs (ZIP)</div>
              <div className="mi" onClick={()=>FreelToast('Journal des achats (CSV) généré','ok')}><Ic d={I.doc} s={15}/> Journal des achats (CSV)</div>
            </div>
          </div>
          <div className="fab-wrap" onClick={e=>e.stopPropagation()}>
            <button className="btn primary" onClick={()=>{setNewMenu(!newMenu);setExpMenu(false);}}><Ic d={I.plus} s={15}/> Nouveau</button>
            <div className={'menu'+(newMenu?' open':'')}>
              <div className="cap">Ajouter une dépense</div>
              <div className="mi" onClick={()=>{setNewMenu(false);setModal({kind:'new'});}}><Ic d={I.cart} s={15}/> Saisie manuelle</div>
              <div className="mi" onClick={()=>{setNewMenu(false);setModal({kind:'new',fromOld:true});}}><Ic d={I.building} s={15}/> Dépense d'un autre compte</div>
              <div className="mi" onClick={()=>{setNewMenu(false);FreelToast('Import Drive — maquette','ok');}}><Ic d={I.cloud} s={15}/> Importer une facture (Drive)</div>
            </div>
          </div>
        </div>

        <div className="content">
          <div className="greet a-reveal">
            <div>
              <h1>Achats &amp; justificatifs <button className="info" aria-expanded="false" title="À quoi sert cet onglet">i</button></h1>
              <p className="explain">Chaque dépense, <b>sa preuve</b> et <b>son opération bancaire</b>. Prêtes pour tes déclarations.</p>
            </div>
            {s.missing>0
              ? <span className="tag num" style={{color:'var(--amber)',background:'var(--amber-soft)',borderColor:'rgba(227,179,95,.3)'}}>{s.missing} justificatif{s.missing>1?'s':''} manquant{s.missing>1?'s':''}</span>
              : <span className="tag num">Tout est justifié ✓</span>}
          </div>

          <PeriodBar period={period} setPeriod={setPeriod} acct={acct} setAcct={setAcct}/>

          <div className="kpis2 a-reveal" style={{animationDelay:'.05s'}}>
            <div className="kpi2"><div className="l">Dépenses · {DEP.periodLabel(period)}</div><div className="b">{eur(s.ttc)}</div><div className="s">{s.n} achats · TTC</div></div>
            <div className="kpi2"><div className="l">TVA déductible</div><div className="b" style={{color:'var(--muted-2)'}}>{eur(s.recov)}</div><div className="s">{s.blocked>0?eur(s.blocked)+' non récup. · pièce manquante':'récupérable dès ton assujettissement'}</div></div>
            <div className={'kpi2'+(toRec>0?' alert':'')}><div className="l">À rapprocher</div><div className="b" style={{color:toRec>0?'var(--amber)':'var(--green)'}}>{toRec}</div><div className="s">{openBank.length} opération(s) · {pending.length} dépense(s)</div></div>
            <div className={'kpi2'+(s.missing>0?' alert':'')}><div className="l">Justificatifs manquants</div><div className="b" style={{color:s.missing>0?'var(--amber)':'var(--green)'}}>{s.missing}</div><div className="s">à joindre avant déclaration</div></div>
          </div>

          <div className="grid12 a-reveal" style={{animationDelay:'.1s'}}>
            <div className="s12">
              <ReconCard openBank={openBank} pending={pending} setModal={setModal}/>
            </div>
            <div className="s12">
              <div className="card" data-fold={s.n+' achats · '+eur(s.ttc)+' TTC · TVA déductible '+eur(s.recov)+(s.missing>0?' · '+s.missing+' pièce(s) manquante(s)':'')}>
                <div className="card-h">
                  <span className="lbl">Registre des achats — {DEP.periodLabel(period)}</span>
                  <span className="muted" style={{fontSize:12}}>clic = détail &amp; pièce</span>
                </div>
                <div className="tblscroll"><table className="atbl">
                  <thead><tr>
                    <th>Date</th><th>Fournisseur</th><th className="n">TTC</th><th className="n">dont TVA</th><th>Justificatif</th><th>Rapprochement</th><th>Compte</th>
                  </tr></thead>
                  <tbody>
                    {list.length===0 && <tr><td colSpan="7" className="muted" style={{padding:'18px 0',fontSize:13}}>Aucune dépense sur cette période.</td></tr>}
                    {list.map(a=>{const r=RECON[a.recon];const ac=DEP.account(a.acct);return (
                      <tr key={a.id} className="arow" onClick={()=>setModal({kind:'achat',id:a.id})}>
                        <td className="n" style={{color:'var(--muted)'}}>{fdate(a.date,withY)}</td>
                        <td className="four"><b>{a.four}{a.rec&&<span className="recb" title="dépense récurrente · chaque mois">↻</span>}</b><span>{a.cat}</span></td>
                        <td className="n ttc">{eur2(a.ttc)}</td>
                        <td className="n tva">{a.tva>0?eur2(a.tva):'—'}</td>
                        <td>{a.piece
                          ? <span className="pieceflag ok"><Ic d={I.paperclip} s={13}/> pièce jointe</span>
                          : <span className="pieceflag miss"><Ic d={I.alert} s={13}/> <u>à joindre</u></span>}</td>
                        <td><span className={'rflag '+r.cls}><Ic d={r.ic} s={12}/> {a.recon==='matched'?'rapprochée':a.recon==='pending'?'en attente':'hors synchro'}</span></td>
                        <td><span className={'acctbadge a-'+a.acct}>{ac.short}</span></td>
                      </tr>
                    );})}
                  </tbody>
                  <tfoot><tr className="totrow">
                    <td colSpan="2">Total {DEP.periodLabel(period)} · {s.n} achats</td>
                    <td className="n ttc">{eur2(s.ttc)}</td>
                    <td className="n tva">{eur2(s.tva)}</td>
                    <td colSpan="3"></td>
                  </tr></tfoot>
                </table></div>
                {recTotal>0 && <div className="recline"><span className="recb">↻</span><span><b>{eur(recTotal)}</b> de dépenses récurrentes sur la période — recréées automatiquement chaque mois.</span></div>}
                <div className="tvahandoff">
                  <div className="th-b">
                    <Ic d={I.percent} s={15}/>
                    <span>En <b>franchise en base</b> aujourd'hui : ta TVA déductible se cumule ici, récupérable dès l'assujettissement. Le <b>suivi</b> et la <b>déclaration</b> vivent dans Argent — alimentés par ce registre.</span>
                  </div>
                  <a className="btn sm" href="Argent - Trésorerie & Performance.html"><Ic d={I.arrow} s={14}/> Suivi &amp; déclaration TVA</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal && modal.kind==='new' && <NewDepense fromOld={modal.fromOld} onClose={()=>setModal(null)}/>}
      {modal && modal.kind==='achat' && <AchatModal id={modal.id} setModal={setModal} onClose={()=>setModal(null)}/>}
      {modal && modal.kind==='fromBank' && <FromBank bid={modal.bid} onClose={()=>setModal(null)}/>}
      {modal && modal.kind==='link' && <LinkModal expId={modal.expId} onClose={()=>setModal(null)}/>}
    </div>
  );
}

/* ============ sélecteur de période + compte ============ */
function stepPeriod(setPeriod,d){
  setPeriod(p=>{
    if(p.kind==='month'){let m=p.m+d,y=p.y;if(m<0){m=11;y--;}if(m>11){m=0;y++;}return{kind:'month',y,m};}
    if(p.kind==='quarter'){let q=p.q+d,y=p.y;if(q<0){q=3;y--;}if(q>3){q=0;y++;}return{kind:'quarter',y,q};}
    if(p.kind==='year') return {kind:'year',y:p.y+d};
    return p;
  });
}
function PeriodBar({period,setPeriod,acct,setAcct}){
  const KINDS=[{k:'month',l:'Mois'},{k:'quarter',l:'Trimestre'},{k:'year',l:'Année'},{k:'all',l:'Tout'}];
  function setKind(k){
    if(k==='month') setPeriod({kind:'month',y:2026,m:5});
    else if(k==='quarter') setPeriod({kind:'quarter',y:2026,q:1});
    else if(k==='year') setPeriod({kind:'year',y:2026});
    else setPeriod({kind:'all'});
  }
  function step(d){
    setPeriod(p=>{
      if(p.kind==='month'){let m=p.m+d,y=p.y;if(m<0){m=11;y--;}if(m>11){m=0;y++;}return{kind:'month',y,m};}
      if(p.kind==='quarter'){let q=p.q+d,y=p.y;if(q<0){q=3;y--;}if(q>3){q=0;y++;}return{kind:'quarter',y,q};}
      if(p.kind==='year') return {kind:'year',y:p.y+d};
      return p;
    });
  }
  return (
    <div className="perbar a-reveal" style={{animationDelay:'.03s'}}>
      <div className="perseg">
        {KINDS.map(x=><button key={x.k} className={'ps'+(period.kind===x.k?' on':'')} onClick={()=>setKind(x.k)}>{x.l}</button>)}
      </div>

      <div className="grow"></div>
      <div className="acctseg">
        <button className={'ps'+(acct==='tous'?' on':'')} onClick={()=>setAcct('tous')}>Tous</button>
        {DEP.ACCOUNTS.map(a=><button key={a.id} className={'ps'+(acct===a.id?' on':'')} title={a.nm+(a.closed?' · clos':'')} onClick={()=>setAcct(a.id)}>{a.short}</button>)}
      </div>
    </div>
  );
}

/* ============ rapprochement : les deux sens ============ */
function ReconCard({openBank,pending,setModal}){
  const total=openBank.length+pending.length;
  return (
    <div className="card" data-fold={total>0? total+' élément(s) à rapprocher' : 'Tout est rapproché ✓'}>
      <div className="card-h">
        <span className="lbl"><Ic d={I.bank} s={15} style={{verticalAlign:-3,marginRight:7,color:'var(--muted)'}}/>Rapprochement bancaire</span>
        <span className="muted" style={{fontSize:12}}>{total>0? total+' à traiter' : 'tout est rapproché'}</span>
      </div>

      {total===0 && <p className="muted" style={{fontSize:13,padding:'10px 0'}}>Chaque opération du compte est reliée à une facture ou à une dépense justifiée. ✓</p>}

      {openBank.length>0 && <div className="recsec">Opérations du compte sans dépense associée</div>}
      {openBank.map(b=>(
        <div key={b.id} className="rec">
          <div className={'rec-i '+b.io}><Ic d={b.io==='in'?I.up:I.minus} s={16}/></div>
          <div className="rec-b">
            <div className="l1"><b>{b.who}</b>
              {b.kind==='new' ? <span className="miniflag need">dépense à créer</span>
                : b.kind==='achat' ? <span className="miniflag need">à relier</span>
                : <span className="miniflag matched">à confirmer</span>}
            </div>
            <div className="bankraw">{fdate(b.date)} · {b.raw}</div>
            <div className="sugg">Proposé : <b>{b.hint}</b> — {b.note}</div>
          </div>
          <div className={'rec-amt'+(b.io==='in'?' in':'')}>{b.io==='in'?'+':'−'}{eur2(b.amt)}</div>
          <div className="rec-act">
            {b.kind==='facture' && <button className="btn sm primary" onClick={()=>{DEP.closeBank(b.id);FreelToast('Facture #023 rapprochée → encaissée le 04/06','ok');}}><Ic d={I.check} s={14}/> Associer</button>}
            {b.kind!=='facture' && <button className="btn sm" onClick={()=>setModal({kind:'fromBank',bid:b.id})}><Ic d={b.kind==='achat'?I.link:I.plus} s={14}/> {b.kind==='achat'?'Relier':'Créer la dépense'}</button>}
          </div>
        </div>
      ))}

      {pending.length>0 && <div className="recsec">Dépenses saisies en attente de leur opération bancaire</div>}
      {pending.map(e=>(
        <div key={e.id} className="rec">
          <div className="rec-i out"><Ic d={CAT_IC[e.cat]||I.cart} s={16}/></div>
          <div className="rec-b">
            <div className="l1"><b>{e.four}</b>
              {!e.piece && <span className="miniflag need">justif. manquant</span>}
              <span className="miniflag wait">en attente</span>
            </div>
            <div className="bankraw">{fdate(e.date,true)} · {e.cat} · saisie manuelle</div>
            <div className="sugg">{DEP.findMatch(e)
              ? <>Opération compatible trouvée : <b>{DEP.findMatch(e).raw}</b> — à confirmer</>
              : <>Aucune opération correspondante sur le compte pro — elle n'est peut-être pas encore tombée.</>}</div>
          </div>
          <div className="rec-amt">−{eur2(e.ttc)}</div>
          <div className="rec-act">
            <button className="btn sm" onClick={()=>setModal({kind:'link',expId:e.id})}><Ic d={I.link} s={14}/> Relier</button>
            <button className="btn sm ghost" onClick={()=>{DEP.markNoBank(e.id);FreelToast('Dépense marquée hors compte synchronisé','ok');}}>Hors compte</button>
          </div>
        </div>
      ))}

      <p className="muted" style={{fontSize:11.5,margin:'13px 0 0',lineHeight:1.5,borderTop:'1px solid var(--line)',paddingTop:12}}>Deux sens possibles : l'opération existe déjà sur le compte et tu la <b style={{color:'var(--text)'}}>relies</b> à ta dépense, ou tu saisis la dépense avant que l'opération tombe et elle reste <b style={{color:'var(--text)'}}>en attente</b>. Les dépenses d'un compte non synchronisé (ancien compte) ne réclament aucun rapprochement.</p>
    </div>
  );
}

/* ============ nouvelle dépense ============ */
function NewDepense({fromOld,onClose}){
  const [f,setF]=useState({date:'2026-06-15',four:'',cat:'Logiciels',ttc:'',tvaOn:true,acct:fromOld?'old':'pro',rec:false,piece:false});
  const set=(k,v)=>setF(o=>({...o,[k]:v}));
  const ttcN=parseFloat(String(f.ttc).replace(',','.'))||0;
  const tvaN=f.tvaOn? Math.round(ttcN/1.2*0.2*100)/100 : 0;
  const ac=DEP.account(f.acct);

  function save(){
    if(!f.four.trim()||!ttcN){ FreelToast('Fournisseur et montant sont requis','warn'); return; }
    const {exp,match}=DEP.add({date:f.date,four:f.four.trim(),cat:f.cat,ttc:ttcN,tva:tvaN,acct:f.acct,rec:f.rec,piece:f.piece});
    if(match){
      DEP.link(exp.id,match.id);
      FreelToast('Dépense ajoutée et rapprochée avec « '+match.raw+' »','ok');
    } else if(exp.recon==='nobank'){
      FreelToast('Dépense ajoutée sur '+ac.short+' — aucun rapprochement attendu','ok');
    } else {
      FreelToast('Dépense ajoutée — en attente de rapprochement bancaire','ok');
    }
    onClose();
  }

  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>Nouvelle dépense</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="frow2">
            <label className="fld"><span>Date</span><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></label>
            <label className="fld"><span>Montant TTC</span><input type="text" inputMode="decimal" placeholder="0,00" value={f.ttc} onChange={e=>set('ttc',e.target.value)}/></label>
          </div>
          <label className="fld"><span>Fournisseur</span><input type="text" placeholder="ex. GitHub" value={f.four} onChange={e=>set('four',e.target.value)}/></label>
          <div className="frow2">
            <label className="fld"><span>Catégorie</span>
              <select value={f.cat} onChange={e=>set('cat',e.target.value)}>{DEP.CATS.map(c=><option key={c}>{c}</option>)}</select>
            </label>
            <label className="fld"><span>Compte</span>
              <select value={f.acct} onChange={e=>set('acct',e.target.value)}>
                {DEP.ACCOUNTS.map(a=><option key={a.id} value={a.id}>{a.nm}{a.closed?' · clos':''}</option>)}
              </select>
            </label>
          </div>

          <div className="tvatog">
            <label className="chk"><input type="checkbox" checked={f.tvaOn} onChange={e=>set('tvaOn',e.target.checked)}/> <span>TVA 20 % incluse</span></label>
            <span className="num">{f.tvaOn? 'dont TVA '+eur2(tvaN) : 'sans TVA'}</span>
          </div>
          <label className="chk" style={{marginTop:10}}><input type="checkbox" checked={f.rec} onChange={e=>set('rec',e.target.checked)}/> <span>Dépense récurrente (chaque mois)</span></label>

          {!ac.sync && <div className="noteblk"><Ic d={I.building} s={15}/><span><b>{ac.nm}</b> n'est pas synchronisé : cette dépense entre directement au registre, sans rapprochement à faire. C'est la bonne voie pour rattraper l'historique d'un ancien compte.</span></div>}
          {ac.sync && <div className="noteblk"><Ic d={I.bank} s={15}/><span>Freel cherchera l'opération correspondante sur <b>{ac.short}</b>. Si elle n'est pas encore tombée, la dépense reste <b>en attente de rapprochement</b>.</span></div>}

          <div className="piecebox" style={{marginTop:14}}>
            <div className="pbh"><span className="lbl">Justificatif</span>
              {f.piece? <span className="miniflag matched">joint</span> : <span className="miniflag need">recommandé</span>}</div>
            <div className="slotwrap">
              <image-slot id="piece-new" shape="rounded" radius="10" placeholder="Glisse la facture / le reçu"></image-slot>
            </div>
            <label className="chk" style={{marginTop:10}}><input type="checkbox" checked={f.piece} onChange={e=>set('piece',e.target.checked)}/> <span>J'ai joint le justificatif</span></label>
          </div>

          <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:16}} onClick={save}>
            <Ic d={I.check} s={15}/> Enregistrer la dépense
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ détail d'une dépense ============ */
function AchatModal({id,setModal,onClose}){
  const a=DEP.byId(id);
  const [attached,setAttached]=useState(a?a.piece:false);
  if(!a) return null;
  const r=RECON[a.recon], ac=DEP.account(a.acct);
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>{a.four}</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="drow"><div className="dn2"><b>{fdate(a.date,true)} · {a.cat}</b><span>{ac.nm}</span></div><div className="da">{eur2(a.ttc)}</div></div>
          <div className="drow"><div className="dn2"><b>TVA</b><span>{a.tva>0?'20 % incluse · déductible si assujetti':'sans TVA'}</span></div><div className="da">{a.tva>0?eur2(a.tva):'—'}</div></div>
          <div className="drow"><div className="dn2"><b>Rapprochement</b><span>{r.lab}</span></div>
            <div className={'rflag '+r.cls}><Ic d={r.ic} s={12}/> {a.recon==='matched'?'rapprochée':a.recon==='pending'?'en attente':'hors synchro'}</div></div>

          {a.recon==='pending' && <div className="frow2" style={{marginTop:12}}>
            <button className="btn sm" onClick={()=>{onClose();setModal({kind:'link',expId:a.id});}}><Ic d={I.link} s={14}/> Relier à une opération</button>
            <button className="btn sm ghost" onClick={()=>{DEP.markNoBank(a.id);FreelToast('Marquée hors compte synchronisé','ok');onClose();}}>Payé hors compte</button>
          </div>}

          <div className="piecebox" style={{marginTop:16}}>
            <div className="pbh">
              <span className="lbl">Justificatif</span>
              {attached? <span className="miniflag matched">joint · sur Drive</span> : <span className="miniflag need">à déposer</span>}
            </div>
            <div className="slotwrap">
              <image-slot id={'piece-'+a.id} shape="rounded" radius="10" placeholder="Glisse la facture / le reçu (image ou capture)"></image-slot>
            </div>
            <p className="muted" style={{fontSize:11,margin:'10px 0 0',lineHeight:1.5}}>Sans justificatif, la TVA de cette dépense n'est pas récupérable. La pièce est copiée dans ton Drive et conservée 10 ans.</p>
          </div>

          {!attached && <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:16}}
            onClick={()=>{DEP.attachPiece(a.id);setAttached(true);FreelToast('Justificatif joint à '+a.four,'ok');onClose();}}>
            <Ic d={I.check} s={15}/> Confirmer le justificatif
          </button>}
        </div>
      </div>
    </div>
  );
}

/* ============ depuis une opération bancaire ============ */
function FromBank({bid,onClose}){
  const b=DEP.bank().filter(x=>x.id===bid)[0];
  if(!b) return null;
  // candidates : dépenses en attente de même montant
  const cands=DEP.pendingList().filter(e=>Math.abs(e.ttc-b.amt)<0.5);
  const [cat,setCat]=useState('Logiciels');
  const [piece,setPiece]=useState(false);
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={e=>e.stopPropagation()}>
        <div className="mh"><b>{cands.length?'Relier l\'opération':'Nouvelle dépense · '+b.who}</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="drow"><div className="dn2"><b>{fdate(b.date,true)} · {b.raw}</b><span>opération du compte pro</span></div><div className="da">−{eur2(b.amt)}</div></div>

          {cands.length>0 && <>
            <div className="seclbl" style={{marginTop:14}}>Dépense déjà saisie qui correspond</div>
            {cands.map(e=>(
              <div key={e.id} className="candrow">
                <div className="dn2"><b>{e.four}</b><span>{fdate(e.date,true)} · {e.cat}{e.piece?' · pièce jointe':' · sans pièce'}</span></div>
                <button className="btn sm primary" onClick={()=>{DEP.link(e.id,b.id);FreelToast('Opération reliée à « '+e.four+' »','ok');onClose();}}><Ic d={I.check} s={14}/> Relier</button>
              </div>
            ))}
            <p className="muted" style={{fontSize:11.5,margin:'12px 0 0',lineHeight:1.5}}>Ce n'est pas la bonne ? Crée une nouvelle dépense ci-dessous.</p>
          </>}

          <div className="seclbl" style={{marginTop:16}}>{cands.length?'Ou créer une dépense':'Catégorie'}</div>
          <label className="fld"><span>Catégorie</span>
            <select value={cat} onChange={e=>setCat(e.target.value)}>{DEP.CATS.map(c=><option key={c}>{c}</option>)}</select>
          </label>
          <div className="piecebox" style={{marginTop:14}}>
            <div className="pbh"><span className="lbl">Justificatif</span>
              {piece? <span className="miniflag matched">joint</span> : <span className="miniflag need">à déposer</span>}</div>
            <div className="slotwrap">
              <image-slot id={'piece-bank-'+b.id} shape="rounded" radius="10" placeholder="Glisse la facture / le reçu"></image-slot>
            </div>
            <label className="chk" style={{marginTop:10}}><input type="checkbox" checked={piece} onChange={e=>setPiece(e.target.checked)}/> <span>J'ai joint le justificatif</span></label>
          </div>
          <button className="btn primary" style={{width:'100%',justifyContent:'center',marginTop:16}}
            onClick={()=>{
              const {exp}=DEP.add({date:b.date,four:b.who,cat:cat,ttc:b.amt,tva:Math.round(b.amt/1.2*0.2*100)/100,acct:'pro',piece:piece});
              DEP.link(exp.id,b.id);
              FreelToast('Dépense créée et rapprochée','ok');
              onClose();
            }}>
            <Ic d={I.check} s={15}/> Créer &amp; rapprocher
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ relier une dépense en attente ============ */
function LinkModal({expId,onClose}){
  const e=DEP.byId(expId);
  if(!e) return null;
  const ops=DEP.openBank().filter(b=>b.io==='out');
  return (
    <div className="mscrim" onClick={onClose}>
      <div className="mcard" onClick={ev=>ev.stopPropagation()}>
        <div className="mh"><b>Relier « {e.four} »</b><button className="mx" onClick={onClose}><Ic d={I.x} s={14}/></button></div>
        <div className="mb">
          <div className="drow"><div className="dn2"><b>{fdate(e.date,true)} · {e.cat}</b><span>dépense en attente de rapprochement</span></div><div className="da">−{eur2(e.ttc)}</div></div>
          <div className="seclbl" style={{marginTop:14}}>Opérations disponibles sur le compte pro</div>
          {ops.length===0 && <p className="muted" style={{fontSize:13,padding:'8px 0'}}>Aucune opération non rapprochée sur le compte. Si cette dépense a été payée autrement, marque-la « hors compte ».</p>}
          {ops.map(b=>{const near=Math.abs(b.amt-e.ttc)<0.5;return (
            <div key={b.id} className="candrow">
              <div className="dn2"><b>{b.who} · {eur2(b.amt)}</b><span>{fdate(b.date,true)} · {b.raw}{near?' · montant identique':''}</span></div>
              <button className={'btn sm'+(near?' primary':'')} onClick={()=>{DEP.link(e.id,b.id);FreelToast('« '+e.four+' » rapprochée','ok');onClose();}}><Ic d={I.link} s={14}/> Relier</button>
            </div>
          );})}
          <button className="btn" style={{width:'100%',justifyContent:'center',marginTop:16}}
            onClick={()=>{DEP.markNoBank(e.id);FreelToast('Marquée hors compte synchronisé','ok');onClose();}}>
            Payée hors compte synchronisé
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
