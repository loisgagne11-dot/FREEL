/* ============================================================
   FREEL — Outils & simulateurs (prototype interactif)
   IR barème vs libératoire (live), CFE, rendement, rapprochement
   bancaire, et CRA → lance l'éditeur réel (FreelDocs.cra).
   ============================================================ */
const { useState, useMemo } = React;

const I = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5',
  chart:'M4 19V5M4 15l5-5 4 3 6-7',
  calc:'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2',
  cog:'M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 3.6h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4z',
  book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 19v2',
  wallet:'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5',
  cart:'M3 4h2l2.4 12.5a2 2 0 002 1.5h8.7a2 2 0 002-1.6L23 8H6M9 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18z',
  search:'M11 4a7 7 0 100 14 7 7 0 000-14M21 21l-4-4',
  check:'M5 13l4 4L19 7', x:'M6 6l12 12M18 6 6 18',
  upload:'M12 16V4M7 9l5-5 5 5M5 21h14', zap:'M13 2 4 14h7l-1 8 9-12h-7z',
  percent:'M19 5 5 19M7.5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M16.5 14a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  building:'M6 3h12v18H6zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  doc:'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5ZM14 3v5h5',
  scale:'M12 3v18M7 21h10M5 7h14l-3 7H8L5 7ZM12 3 5 7M12 3l7 4',
  mail:'M3 5h18v14H3zM3 7l9 6 9-6',
};
function Ic({d, s=16, w=2, style}){
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {String(d).split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
  </svg>;
}
const fmt=n=>Math.round(n).toLocaleString('fr-FR')+' €';
const num=s=>parseFloat(String(s).replace(/[^\d,.-]/g,'').replace(/\s/g,'').replace(',','.'))||0;

/* ---------- fiscalité : barème IR 2026 (revenus 2025) ---------- */
const BR=[[0,11497,0],[11497,29315,0.11],[29315,83823,0.30],[83823,180294,0.41],[180294,Infinity,0.45]];
function irBareme(base,parts){let q=base/parts,t=0;BR.forEach(b=>{if(q>b[0])t+=(Math.min(q,b[1])-b[0])*b[2];});return t*parts;}
function margRate(base,parts){let q=base/parts,r=0;BR.forEach(b=>{if(q>b[0])r=b[2];});return r;}

/* ============================================================ */
function App(){
  const [tab,setTab]=useState('impot');
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">fre<b>e</b>l</div>
        <a className="nav" href="Pilote - Le Flux.html"><span className="ic"><Ic d={I.grid}/></span> Pilote</a>
        <a className="nav" href="Activité - Plan de charge.html"><span className="ic"><Ic d={I.layers}/></span> Activité &amp; congés</a>
        <a className="nav" href="Argent - Trésorerie & Performance.html"><span className="ic"><Ic d={I.wallet}/></span> Argent</a>
        <a className="nav" href="Achats - Justificatifs & Banque.html"><span className="ic"><Ic d={I.cart}/></span> Achats</a>
        <a className="nav on" href="Outils - Simulateurs.html"><span className="ic"><Ic d={I.calc}/></span> Outils</a>
        <a className="nav" href="Config.html"><span className="ic"><Ic d={I.cog}/></span> Config</a>
        <div className="rail-foot">
          <a className="nav" href="Config.html"><span className="ic"><Ic d={I.book}/></span> Livre des recettes</a>
          <div className="who"><div className="ava">AL</div><div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13}}>Atelier L.</div>
            <div className="muted" style={{fontSize:11.5}}>Micro-BNC · ACRE</div></div></div>
          <div className="buildtag"><span className="pulse"></span> build <b>5</b> · 11 juil.</div>
        </div>
      </aside>

      <div className="main" data-screen-label="Outils — Simulateurs">
        <div className="topbar">
          <div className="pagetitle" style={{fontSize:15,fontWeight:600}}>Outils &amp; simulateurs</div>
          <div className="grow"></div>
          <span className="synced on" title="Synchronisé · multi-appareils"><Ic d={I.cloud} s={15}/> <span className="pulse"></span></span>
          <div className="search"><Ic d={I.search} s={15}/> <span>Rechercher…</span><span className="kbd">⌘K</span></div>
        </div>

        <div className="content">
          <div className="greet a-reveal">
            <div>
              <h1>Outils &amp; simulateurs</h1>
              <p>Calculs fiscaux, rendement, rapprochement bancaire et compte-rendu d'activité — tout est recalculé en direct.</p>
            </div>
          </div>

          <div className="subtabs2 a-reveal" style={{animationDelay:'.05s'}}>
            <button className={'stab'+(tab==='impot'?' on':'')} onClick={()=>setTab('impot')}><Ic d={I.percent} s={15}/> Impôt &amp; CFE</button>
            <button className={'stab'+(tab==='compte'?' on':'')} onClick={()=>setTab('compte')}><Ic d={I.wallet} s={15}/> Compte pro &amp; banque</button>
            <button className={'stab'+(tab==='cra'?' on':'')} onClick={()=>setTab('cra')}><Ic d={I.doc} s={15}/> CRA</button>
          </div>

          <div className="a-reveal" style={{animationDelay:'.1s'}}>
            {tab==='impot' && <ImpotCFE/>}
            {tab==='compte' && <ComptePro/>}
            {tab==='cra' && <CRA/>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ IMPÔT & CFE ============ */
function ImpotCFE(){
  const [ca,setCa]=useState('53 600');
  const [parts,setParts]=useState('1');
  const [autres,setAutres]=useState('0');
  const [per,setPer]=useState('0');
  const r=useMemo(()=>{
    const CA=num(ca), P=Math.max(num(parts),1);
    const microBase=CA*0.66, other=num(autres), perV=num(per);
    const baseWith=Math.max(0, other+microBase-perV);       // foyer, micro inclus
    const baseWithout=Math.max(0, other-perV);              // foyer, micro exclu
    const baseNoPer=Math.max(0, other+microBase);           // sans PER
    const irWith=irBareme(baseWith,P), irWithout=irBareme(baseWithout,P);
    const microBareme=Math.max(0, irWith-irWithout);        // IR marginal du micro au barème
    const lib=CA*0.022;
    const marg=margRate(baseWith,P);
    const perSave=Math.max(0, irBareme(baseNoPer,P)-irWith);
    return {CA,P,microBase,other,perV,baseWith,irWith,microBareme,lib,marg,perSave,libWin:lib<=microBareme};
  },[ca,parts,autres,per]);

  // CFE
  const [cfeBase,setCfeBase]=useState('560');
  const [cfeTaux,setCfeTaux]=useState('26,5 %');
  const cfe=Math.round(num(cfeBase)*num(cfeTaux)/100);
  const CFE_SCALE=[['≤ 5 000 €','exonéré'],['5 001 → 10 000','237 → 565 €'],['10 001 → 32 600','237 → 1 130 €'],['32 601 → 100 000','237 → 2 375 €'],['100 001 → 250 000','237 → 3 958 €'],['> 250 000','237 → 6 250 €']];

  const tranches=[]; let q=r.baseWith/r.P;
  BR.forEach(b=>{ if(q<=b[0]) return; const inB=Math.min(q,b[1])-b[0], taxP=inB*b[2]*r.P, fill=Math.min(inB/((b[1]-b[0])||1)*100,100);
    const hi=b[1]===Infinity?'∞':Math.round(b[1]).toLocaleString('fr-FR'); tranches.push({rate:b[2],lo:Math.round(b[0]).toLocaleString('fr-FR'),hi,taxP,fill}); });

  return (
    <div className="grid12">
      <div className="s7">
        <div className="card">
          <div className="card-h"><span className="lbl">Calculateur d'impôt — barème vs versement libératoire</span></div>
          <div className="frow" style={{marginBottom:14}}>
            <div className="bigfield"><label>CA annuel encaissé (HT)</label><div className="inwrap"><input value={ca} onChange={e=>setCa(e.target.value)} inputMode="numeric"/><span className="suf">€</span></div></div>
            <div className="bigfield"><label>Parts fiscales du foyer</label><div className="inwrap"><input value={parts} onChange={e=>setParts(e.target.value)} inputMode="decimal"/><span className="suf">part</span></div></div>
          </div>
          <div className="frow">
            <div className="field2"><label>Autres revenus imposables du foyer (salaire conjoint…)</label><input className="num" value={autres} onChange={e=>setAutres(e.target.value)} inputMode="numeric"/></div>
            <div className="field2"><label>Versement PER déductible</label><input className="num" value={per} onChange={e=>setPer(e.target.value)} inputMode="numeric"/></div>
          </div>
          <p className="muted" style={{fontSize:12,margin:'4px 0 16px',lineHeight:1.6}}>Base imposable du foyer = <b style={{color:'var(--text)'}}>{fmt(r.other)}</b> (autres revenus) + <b style={{color:'var(--text)'}}>{fmt(r.microBase)}</b> (micro après abattement 34%){r.perV>0&&<> − <b style={{color:'var(--green)'}}>{fmt(r.perV)}</b> (PER)</>} = <span className="num">{fmt(r.baseWith)}</span>. Le libératoire (2,2% du CA) sort le micro du barème.</p>
          <div className="compare">
            <div className={'opt'+(!r.libWin?' win':'')}>
              {!r.libWin && <div className="wintag">avantageux</div>}
              <div className="ol">Micro au barème</div>
              <div className="ov">{fmt(r.microBareme)}</div>
              <div className="od">soit <span className="num">{r.CA?(r.microBareme/r.CA*100).toFixed(1).replace('.',','):'—'}%</span> du CA · ta tranche marg. <span className="num">{r.marg*100}%</span></div>
            </div>
            <div className={'opt'+(r.libWin?' win':'')}>
              {r.libWin && <div className="wintag">avantageux</div>}
              <div className="ol">Micro au libératoire (2,2%)</div>
              <div className="ov">{fmt(r.lib)}</div>
              <div className="od">prélevé à chaque déclaration URSSAF</div>
            </div>
          </div>
          {r.perSave>0 && <div style={{display:'flex',alignItems:'center',gap:9,marginTop:13,padding:'11px 13px',border:'1px solid rgba(84,207,145,.3)',background:'var(--green-glow)',borderRadius:11,fontSize:12.5,lineHeight:1.5}}><Ic d={I.check} s={15} style={{color:'var(--green)',flexShrink:0}}/><span>Ton versement PER de <b>{fmt(r.perV)}</b> te fait économiser <b style={{color:'var(--green)'}}>{fmt(r.perSave)}</b> d'impôt au barème cette année.</span></div>}
          <div style={{marginTop:14}}><button className="info" aria-expanded="false" title="Comment lire cette comparaison">i</button><p className="explain">Avec d'autres revenus, le micro se cumule à ta base et peut basculer dans une tranche plus haute — le libératoire devient souvent gagnant. Estimation indicative (hors décote &amp; plafonnement).</p></div>
        </div>
      </div>

      <div className="s5">
        <div className="card">
          <div className="card-h"><span className="lbl">Impôt du foyer par tranche</span><span className="muted num" style={{fontSize:12}}>2026</span></div>
          {tranches.length ? tranches.map((t,i)=>(
            <div key={i} className="brk">
              <div className="bt"><b>{t.rate*100}%</b><span>{t.lo} → {t.hi} €</span></div>
              <div className="bbar"><i style={{width:t.fill+'%'}}></i></div>
              <div className="bv">{fmt(t.taxP)}</div>
            </div>
          )) : <p className="muted" style={{fontSize:12.5}}>Revenu sous le seuil imposable.</p>}
          <div className="resbox" style={{marginTop:16}}>
            <div><div className="lbl" style={{margin:0}}>Impôt total du foyer</div><div className="muted" style={{fontSize:11.5,marginTop:3}}>micro + autres revenus − PER, au barème</div></div>
            <div className="rv">{fmt(r.irWith)}</div>
          </div>
        </div>
      </div>

      <div className="s12">
        <div className="card">
          <div className="card-h"><span className="lbl">Simulateur CFE — Cotisation Foncière des Entreprises</span><span className="chip2 ok">exonéré année 1</span></div>
          <div className="grid12" style={{gap:18}}>
            <div className="s4">
              <div className="field2"><label>Base minimum fixée par la commune (€)</label><input value={cfeBase} onChange={e=>setCfeBase(e.target.value)}/></div>
              <div className="field2" style={{margin:0}}><label>Taux global communal</label><input value={cfeTaux} onChange={e=>setCfeTaux(e.target.value)}/></div>
            </div>
            <div className="s4">
              <div className="lbl">Barème de base minimum (CA N−2)</div>
              <div style={{marginTop:8}}>{CFE_SCALE.map((row,i)=>(<div key={i} className="scalerow"><span className="muted">{row[0]}</span><span className="num">{row[1]}</span></div>))}</div>
            </div>
            <div className="s4" style={{display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <div className="resbox"><div><div className="lbl" style={{margin:0}}>CFE estimée 2026</div><div className="muted" style={{fontSize:11.5,marginTop:3}}>à payer le 15 déc.</div></div><div className="rv">{fmt(cfe)}</div></div>
              <p className="muted" style={{fontSize:11.5,margin:'14px 0 0',lineHeight:1.55}}>CFE = base minimum × taux communal. Exonération totale la 1ʳᵉ année civile, puis CA &lt; 5 000 € exonéré.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ COMPTE PRO & BANQUE ============ */
function ComptePro(){
  const [solde,setSolde]=useState('8 120');
  const [taux,setTaux]=useState('3,0 %');
  const mois=num(solde)*num(taux)/100/12, an=num(solde)*num(taux)/100;
  const [matches,setMatches]=useState([
    {st:'ok', t:'VIR STUDIO LUMEN', s:'04 juin · rapproché → facture #023', v:'+4 160 €', vc:'var(--green)'},
    {st:'ok', t:'PRLV ADOBE + OVH', s:'03 juin · rapproché → charge logiciels', v:'−142 €', vc:''},
    {st:'q', t:'VIR 600,00 NOVAK', s:'28 mai · non rapproché — facture probable #022', v:'+600 €', vc:'var(--green)'},
  ]);
  function validate(i){ setMatches(m=>m.map((x,j)=>j===i?{...x,st:'ok',s:x.s.replace('non rapproché — facture probable','rapproché → facture')}:x)); FreelToast('Ligne rapprochée','ok'); }
  return (
    <div className="grid12">
      <div className="s5">
        <div className="card">
          <div className="card-h"><span className="lbl">Rendement du compte pro</span><span className="chip2 ok"><Ic d={I.zap} s={12} style={{marginRight:4,verticalAlign:'-2px'}}/> actif</span></div>
          <div className="bigfield" style={{marginBottom:12}}><label>Solde moyen placé</label><div className="inwrap"><input value={solde} onChange={e=>setSolde(e.target.value)} inputMode="numeric"/><span className="suf">€</span></div></div>
          <div className="field2"><label>Taux annuel brut</label><input value={taux} onChange={e=>setTaux(e.target.value)}/></div>
          <div style={{display:'flex',gap:14,marginTop:4}}>
            <div className="resbox" style={{flex:1}}><div><div className="lbl" style={{margin:0}}>Intérêts / mois</div></div><div className="rv" style={{fontSize:22}}>{fmt(mois)}</div></div>
            <div className="resbox" style={{flex:1}}><div><div className="lbl" style={{margin:0}}>Sur 12 mois</div></div><div className="rv" style={{fontSize:22}}>{fmt(an)}</div></div>
          </div>
          <p className="muted" style={{fontSize:11.5,margin:'14px 0 0',lineHeight:1.55}}>Les intérêts sont intégrés automatiquement à la trésorerie projetée (voir Argent).</p>
        </div>
      </div>
      <div className="s7">
        <div className="card">
          <div className="card-h"><span className="lbl">Import relevé bancaire &amp; rapprochement</span><span className="muted" style={{fontSize:12}}>3 lignes · {matches.filter(m=>m.st==='q').length} à valider</span></div>
          <div className="dropzone" onClick={()=>FreelToast('Import CSV/OFX — maquette','ok')}><Ic d={I.upload} s={22}/>Déposer un relevé (CSV / OFX)<br/>rapprochement auto avec tes factures</div>
          <div style={{marginTop:16}}>
            {matches.map((m,i)=>(
              <div key={i} className="matchrow">
                <div className={'mc '+m.st}><Ic d={m.st==='ok'?I.check:I.upload} s={15}/></div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13.5}}>{m.t}</div><div className="muted" style={{fontSize:12}}>{m.s}</div></div>
                {m.st==='q'
                  ? <button className="minibtn" onClick={()=>validate(i)}>Valider</button>
                  : <div className="num" style={{color:m.vc}}>{m.v}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ CRA ============ */
function CRA(){
  const recents=[
    {m:'Mai 2026 · Studio Lumen', s:'18 j · envoyé le 02/06', },
    {m:'Mai 2026 · Atelier Novak', s:'9 j · validé', },
    {m:'Avril 2026 · Studio Lumen', s:'20 j · archivé', },
  ];
  return (
    <div className="grid12">
      <div className="s7">
        <div className="launch">
          <h3>Générer un compte-rendu d'activité</h3>
          <p>Le CRA est une <b style={{color:'var(--text)'}}>synthèse hebdomadaire</b> reprise du calendrier : par semaine, les jours par client en <b style={{color:'var(--text)'}}>télétravail / sur site</b> et les tâches accomplies (éditables), puis les totaux par client et le total du mois. Pas de montants — c'est un suivi d'activité, la facture s'occupe des €.</p>
          <button className="btn primary" onClick={()=>window.FreelDocs&&FreelDocs.cra()}><Ic d={I.doc} s={15}/> Ouvrir le générateur de CRA</button>
        </div>
      </div>
      <div className="s5">
        <div className="card">
          <div className="card-h"><span className="lbl">CRA récents</span></div>
          {recents.map((c,i)=>(
            <div key={i} className="craitem">
              <div className="ci"><Ic d={I.doc} s={16}/></div>
              <div className="cm"><b>{c.m}</b><span>{c.s}</span></div>
              <button className="minibtn" onClick={()=>window.FreelDocs&&FreelDocs.cra()}>Rouvrir</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
