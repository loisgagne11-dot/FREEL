/* ============================================================
   FREEL — Config (prototype interactif)
   Profil, paramètres fiscaux, réserve (live), facturation, livre
   des recettes (export CSV réel), cloud, données (FEC/JSON/CSV).
   ============================================================ */
const { useState, useEffect } = React;

const I = {
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  layers:'M12 3 3 8l9 5 9-5-9-5ZM3 14l9 5 9-5',
  calc:'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M8 15h2M12 15h2',
  cog:'M12 9a3 3 0 100 6 3 3 0 000-6M19.4 13a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 3.6h-4l-.3 2.5a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.3 1 2-3.4z',
  book:'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 19v2',
  wallet:'M3 7a2 2 0 012-2h12v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5',
  cart:'M3 4h2l2.4 12.5a2 2 0 002 1.5h8.7a2 2 0 002-1.6L23 8H6M9 21a1 1 0 100-2 1 1 0 000 2M18 21a1 1 0 100-2 1 1 0 000 2',
  cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18z',
  search:'M11 4a7 7 0 100 14 7 7 0 000-14M21 21l-4-4',
  check:'M5 13l4 4L19 7', right:'M9 18l6-6-6-6',
  building:'M6 3h12v18H6zM9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  percent:'M19 5 5 19M7.5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5M16.5 14a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  doc:'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5ZM14 3v5h5',
  download:'M12 3v12M7 11l5 5 5-5M5 21h14', trash:'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
};
function Ic({d, s=16, w=2, style}){
  return <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {String(d).split('M').filter(Boolean).map((seg,i)=><path key={i} d={'M'+seg}/>)}
  </svg>;
}
const fmt=n=>Math.round(n).toLocaleString('fr-FR')+' €';

function download(filename, text, mime){
  const blob=new Blob([text],{type:mime||'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},120);
  if(window.FreelToast) FreelToast(filename+' téléchargé','ok');
}

const LIVRE=[
  ['04/06/2026','2026-023','Studio Lumen','Prestation design','Virement',4160],
  ['28/05/2026','2026-022','Atelier Novak','Prestation design','Virement',3600],
  ['14/04/2026','2026-021','Maison Kessler','Prestation design','Virement',5200],
  ['02/03/2026','2026-020','Studio Lumen','Acompte mission','Virement',2800],
];

const SECTIONS=[
  {id:'profil', ic:I.building, t:'Profil & statut', s:'Micro-BNC · ACRE · SIRET'},
  {id:'fiscal', ic:I.percent, t:'Paramètres fiscaux', s:'Abattement, cotisations, TVA'},
  {id:'reserve', ic:I.wallet, t:'Réserve & versements', s:'Matelas, seuil de sécurité'},
  {id:'factu', ic:I.doc, t:'Facturation', s:'Numérotation, RIB, mentions'},
  {id:'livre', ic:I.book, t:'Livre des recettes', s:'Registre obligatoire'},
  {id:'cloud', ic:I.cloud, t:'Compte & Cloud Sync', s:'Multi-appareils · stockage des pièces'},
  {id:'data', ic:I.download, t:'Données & export', s:'FEC, sauvegarde, RGPD'},
];

/* ============================================================ */
function App(){
  const [sec,setSec]=useState(()=> location.hash==='#livre' ? 'livre' : 'profil');
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">fre<b>e</b>l</div>
        <a className="nav" href="Pilote - Le Flux.html"><span className="ic"><Ic d={I.grid}/></span> Pilote</a>
        <a className="nav" href="Activité - Plan de charge.html"><span className="ic"><Ic d={I.layers}/></span> Activité &amp; congés</a>
        <a className="nav" href="Argent - Trésorerie & Performance.html"><span className="ic"><Ic d={I.wallet}/></span> Argent</a>
        <a className="nav" href="Achats - Justificatifs & Banque.html"><span className="ic"><Ic d={I.cart}/></span> Achats</a>
        <a className="nav" href="Outils - Simulateurs.html"><span className="ic"><Ic d={I.calc}/></span> Outils</a>
        <a className="nav on" href="Config.html"><span className="ic"><Ic d={I.cog}/></span> Config</a>
        <div className="rail-foot">
          <a className="nav" href="#" onClick={e=>{e.preventDefault();setSec('livre');}}><span className="ic"><Ic d={I.book}/></span> Livre des recettes</a>
          <div className="who"><div className="ava">AL</div><div style={{minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13}}>Atelier L.</div>
            <div className="muted" style={{fontSize:11.5}}>Micro-BNC · ACRE</div></div></div>
          <div className="buildtag"><span className="pulse"></span> build <b>6</b> · 14 juil.</div>
        </div>
      </aside>

      <div className="main" data-screen-label="Config">
        <div className="topbar">
          <div className="pagetitle" style={{fontSize:15,fontWeight:600}}>Config</div>
          <div className="grow"></div>
          <div className="search"><Ic d={I.search} s={15}/> <span>Rechercher un réglage…</span><span className="kbd">⌘K</span></div>
          <button className="btn primary" onClick={()=>FreelToast('Réglages enregistrés','ok')}><Ic d={I.check} s={15}/> Enregistrer</button>
        </div>

        <div className="content">
          <div className="greet a-reveal">
            <div>
              <h1>Configuration</h1>
              <p>Ton statut, tes règles fiscales et de provision — c'est ce qui pilote tous les calculs de l'app.</p>
            </div>
          </div>

          <div className="cfg-shell a-reveal" style={{animationDelay:'.05s'}}>
            <div className="cfg-list">
              {SECTIONS.map(s=>(
                <button key={s.id} className={'cfg-item'+(sec===s.id?' on':'')} onClick={()=>setSec(s.id)}>
                  <span className="ci"><Ic d={s.ic} s={16}/></span>
                  <div><div className="ct">{s.t}</div><div className="cs">{s.s}</div></div>
                  <span className="chev"><Ic d={I.right} s={15}/></span>
                </button>
              ))}
            </div>
            <div className="card">
              {sec==='profil' && <Profil/>}
              {sec==='fiscal' && <Fiscal/>}
              {sec==='reserve' && <Reserve/>}
              {sec==='factu' && <Factu/>}
              {sec==='livre' && <Livre/>}
              {sec==='cloud' && <Cloud/>}
              {sec==='data' && <Data/>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveBar({note}){
  return <div className="save-bar"><button className="btn primary sm" onClick={()=>FreelToast('Enregistré','ok')}><Ic d={I.check} s={14}/> Enregistrer</button><span className="muted">{note}</span></div>;
}
function Field({label,value,help,type}){
  const [v,setV]=useState(value);
  return <div className="field"><label>{label}</label>{type==='select'
    ? <select value={v} onChange={e=>setV(e.target.value)}>{value.map(o=><option key={o}>{o}</option>)}</select>
    : <input className={typeof value==='string'&&/[0-9]/.test(value)&&!/[a-z]/i.test(value.replace('€',''))?'num':''} value={v} onChange={e=>setV(e.target.value)}/>}
    {help&&<p className="help">{help}</p>}</div>;
}
function Toggle({b,s,def=true}){
  const [on,setOn]=useState(def);
  return <div className="toggle-row"><div className="tx"><b>{b}</b><span>{s}</span></div>
    <input type="checkbox" className="sw-toggle" checked={on} onChange={e=>setOn(e.target.checked)}/></div>;
}

function Profil(){
  return <>
    <h2 className="sect-h">Profil &amp; statut</h2>
    <p className="sect-sub">Identité de l'entreprise. Le régime et l'ACRE déterminent tes plafonds et tes taux.</p>
    <div className="frow"><Field label="Nom commercial" value="Atelier L."/><Field label="Nom & prénom" value="Loïs Mercier"/></div>
    <div className="frow"><Field label="SIRET" value="912 457 881 00027"/><Field label="Activité (code APE)" value="74.10Z · Design"/></div>
    <div className="frow"><Field label="N° TVA intracommunautaire" value="FR 32 912457881" help="Affiché sur les factures — obligatoire dès l'assujettissement TVA."/><Field label="Adresse du siège" value="14 rue des Récollets, 75010 Paris" help="Figure sur les factures et détermine la commune — donc la base et le taux — de ta CFE."/></div>
    <div className="frow"><Field label="Régime" type="select" value={['Micro-BNC (libéral)','Micro-BIC (vente)','Micro-BIC (services)']}/><Field label="Début d'activité" value="01/02/2025"/></div>
    <Toggle b="ACRE — exonération partielle" s="Réduction de 50% des cotisations la 1ʳᵉ année. Active jusqu'au 31/12/2026."/>
    <Toggle b="Versement libératoire de l'impôt" s="Impôt payé en % du CA (2,2% BNC) plutôt qu'au barème."/>
    <SaveBar note="Dernière modif · 12 mai 2026"/>
  </>;
}
function Fiscal(){
  return <>
    <h2 className="sect-h">Paramètres fiscaux</h2>
    <p className="sect-sub">Pré-remplis selon ton statut. Ne les modifie que si ta situation change — ils alimentent toutes les projections.</p>
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 15px',border:'1px solid rgba(84,207,145,.3)',background:'var(--green-glow)',borderRadius:12,marginBottom:18}}>
      <span className="pulse"></span>
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600}}>Barèmes 2026 à jour</div><div className="muted" style={{fontSize:11.5,marginTop:2}}>Abattement, cotisations, plafonds, seuil TVA — vérifiés le 11 juil. 2026 · source URSSAF / BOFiP</div></div>
      <button className="btn sm" onClick={()=>FreelToast('Vérification faite — barèmes déjà à jour (URSSAF, BOFiP)','ok')}><Ic d={I.cloud} s={14}/> Mettre à jour</button>
    </div>
    <div className="frow"><Field label="Abattement forfaitaire" value="34 %" help="Micro-BNC : 34% du CA. Le reste est ta base imposable."/><Field label="Taux de cotisations (avec ACRE)" value="10,6 %" help="Taux plein BNC 21,1% → 10,6% avec ACRE."/></div>
    <div className="frow"><Field label="Impôt libératoire" value="2,2 %"/><Field label="Formation professionnelle (CFP)" value="0,2 %"/></div>
    <div className="frow"><Field label="Plafond micro-BNC" value="77 700 €"/><Field label="Seuil franchise TVA" value="37 500 €"/></div>
    <Periodicite/>
    <Toggle b="Mise à jour automatique des barèmes" s="Freel applique les nouveaux taux et plafonds dès leur publication officielle, et te signale ce qui a changé."/>
    <Toggle b="Alerte d'approche des seuils" s="Me prévenir à 85% du plafond ou de la franchise TVA."/>
    <TvaOption/>
    <SaveBar note="Verrouillé sur le statut Micro-BNC"/>
  </>;
}
function Periodicite(){
  const [v,setV]=useState('Trimestriel');
  return <div className="toggle-row"><div className="tx"><b>Périodicité des cotisations</b><span>Rythme de déclaration URSSAF — pilote l'échéancier « À déclarer » du Pilote.</span></div>
    <div className="seg">{['Mensuel','Trimestriel'].map(o=><button key={o} className={v===o?'on':''} onClick={()=>setV(o)}>{o}</button>)}</div></div>;
}
function TvaOption(){
  const [on,setOn]=useState(()=>{try{return localStorage.getItem('freel_tva')==='assujetti';}catch(e){return false;}});
  function set(v){ setOn(v); try{localStorage.setItem('freel_tva', v?'assujetti':'franchise');}catch(e){} FreelToast(v?'TVA activée — appliquée à tes prochaines factures + Argent':'Retour en franchise en base','ok'); }
  return <div id="tva" className="toggle-row" style={{scrollMarginTop:80}}><div className="tx"><b>TVA — assujettissement</b><span>S'active <b>automatiquement</b> au-delà de 37 500 € encaissés (obligation légale, avec avertissement). Tu peux aussi <b>opter volontairement</b> dès maintenant.</span></div>
    <input type="checkbox" className="sw-toggle" checked={on} onChange={e=>set(e.target.checked)}/></div>;
}
function Reserve(){
  const DISPO=4940;
  const [pct,setPct]=useState(50);
  const keep=Math.round(DISPO*pct/100/10)*10, vers=DISPO-keep;
  return <>
    <h2 className="sect-h">Réserve &amp; versements</h2>
    <p className="sect-sub">La règle qui transforme ton disponible en salaire. C'est la même que sur la carte « Tu peux te verser ».</p>
    <div style={{margin:'6px 0 22px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
        <label style={{color:'var(--muted)',fontSize:12,fontWeight:500}}>Réserve matelas gardée chaque mois</label>
        <span className="num" style={{fontSize:18,color:'var(--green)',fontWeight:700}}>{pct}%</span>
      </div>
      <input className="rng" type="range" min="0" max="80" step="5" value={pct} onChange={e=>setPct(+e.target.value)}/>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:9,fontSize:12}}>
        <span className="muted">Sur 4 940 € dispo → versable <b className="num" style={{color:'var(--green)'}}>{fmt(vers)}</b></span>
        <span className="muted">réserve <b className="num" style={{color:'var(--text)'}}>{fmt(keep)}</b></span>
      </div>
    </div>
    <div className="frow"><Field label="Seuil de sécurité trésorerie" value="5 000 €" help="Plancher affiché sur tes courbes. Sous ce niveau, l'app alerte."/><Field label="Jour de versement préféré" value="1ᵉʳ du mois"/></div>
    <Field label="Compte perso de virement (salaire)" value="FR00 0000 0000 0000 0000 0000 000" help="IBAN destinataire quand tu cliques « Verser » sur le Pilote."/>
    <Toggle b="Provisionner automatiquement" s="Mettre de côté URSSAF & impôt à chaque encaissement."/>
    <Toggle b="Me rappeler le versement" s="Notification quand le versable est calculé."/>
    <SaveBar note="Appliqué dès le mois en cours"/>
  </>;
}
function Factu(){
  return <>
    <h2 className="sect-h">Facturation</h2>
    <p className="sect-sub">Format des factures générées et coordonnées de paiement.</p>
    <div className="frow"><Field label="Préfixe de numérotation" value="2026-"/><Field label="Prochain numéro" value="028"/></div>
    <div className="frow"><Field label="Délai de paiement par défaut" type="select" value={['30 jours','15 jours','45 jours','À réception']}/><Field label="Pénalités de retard" value="3 × taux légal"/></div>
    <Field label="IBAN (encaissements)" value="FR00 0000 0000 0000 0000 0000 000"/>
    <Field label="Mention légale (micro, non assujetti TVA)" value="TVA non applicable, art. 293 B du CGI"/>
    <Toggle b="Logo sur les factures" s="Affiché en en-tête du PDF."/>
    <SaveBar note="Aperçu PDF disponible à la génération"/>
  </>;
}
function Livre(){
  const total=LIVRE.reduce((s,r)=>s+r[5],0);
  function exportCSV(){
    const head='Date;N°;Client;Nature;Mode;Montant HT\n';
    const body=LIVRE.map(r=>r.slice(0,5).join(';')+';'+r[5]).join('\n');
    download('Livre-recettes-2026.csv', '\uFEFF'+head+body, 'text/csv');
  }
  return <>
    <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
      <div><h2 className="sect-h">Livre des recettes</h2><p className="sect-sub" style={{marginBottom:8}}>Registre obligatoire en micro : chaque encaissement, daté et chronologique. Généré automatiquement à partir de tes factures payées.</p></div>
      <button className="btn sm" style={{marginBottom:8}} onClick={exportCSV}><Ic d={I.download} s={14}/> Exporter CSV</button>
    </div>
    <table className="tbl" style={{marginTop:8}}>
      <thead><tr><th>Date</th><th>N°</th><th>Client</th><th>Nature</th><th>Mode</th><th className="n">Montant</th></tr></thead>
      <tbody>
        {LIVRE.map((r,i)=>(<tr key={i}><td className="num">{r[0]}</td><td className="num">{r[1]}</td><td>{r[2]}</td><td className="muted">{r[3]}</td><td className="muted">{r[4]}</td><td className="n num">{fmt(r[5])}</td></tr>))}
        <tr className="tot"><td colSpan="5">Total encaissé 2026</td><td className="n num" style={{color:'var(--green)'}}>{fmt(total)}</td></tr>
      </tbody>
    </table>
  </>;
}
function Cloud(){
  return <>
    <h2 className="sect-h">Compte &amp; Cloud Sync</h2>
    <p className="sect-sub">Tes données sont synchronisées entre tes appareils en temps réel via ton compte chiffré.</p>
    <div className="acctcard">
      <div className="ava" style={{width:42,height:42,borderRadius:11}}>LM</div>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600}}>contact@atelier-demo.fr</div><div className="muted" style={{fontSize:12.5}}>Connecté · <span className="synced" style={{display:'inline-flex'}}><Ic d={I.cloud} s={13}/> <span className="pulse"></span> sync. il y a 2 min</span></div></div>
      <button className="btn sm" onClick={()=>FreelToast('Déconnexion — maquette','ok')}>Se déconnecter</button>
    </div>
    <Toggle b="Synchronisation temps réel" s="Pousser chaque modification vers le cloud instantanément."/>
    <div className="toggle-row"><div className="tx"><b>Appareils connectés</b><span>iPhone · MacBook · navigateur web</span></div><span className="chip2">3 actifs</span></div>
    <div className="toggle-row"><div className="tx"><b>Dernière sauvegarde cloud</b><span>Automatique à chaque changement</span></div><span className="num muted" style={{fontSize:12.5}}>10 juin 2026 · 14:32</span></div>
    <div className="stor-h">Stockage des pièces justificatives</div>
    <div className="cloud">
      <div className="cl-lo"><Ic d={I.cloud} s={18}/></div>
      <div className="cl-b"><b>Google Drive</b><span className="on">connecté · /Freel/Justificatifs 2026</span></div>
      <span className="chip2 ok">42 fichiers</span>
    </div>
    <div className="cloud">
      <div className="cl-lo"><Ic d={I.cloud} s={18}/></div>
      <div className="cl-b"><b>OneDrive</b><span>non connecté</span></div>
      <button className="btn sm" onClick={()=>FreelToast('Connexion OneDrive — maquette','ok')}>Connecter</button>
    </div>
    <p className="help" style={{marginTop:14}}>Chiffrement de bout en bout. Tu peux travailler hors-ligne : la synchro reprend au retour du réseau. Chaque justificatif déposé sur Achats est copié ici et conservé 10 ans (obligation légale).</p>
  </>;
}
function Data(){
  function fec(){
    const head='JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|Debit|Credit\n';
    const body=LIVRE.map((r,i)=>`VE|Ventes|${r[1]}|${r[0].split('/').reverse().join('')}|706000|Prestations|0|${r[5]}`).join('\n');
    download('FEC-2026.txt', head+body, 'text/plain');
  }
  function csv(){
    const head='Date;N°;Client;Nature;Mode;Montant HT\n';
    download('Livre-recettes-2026.csv', '\uFEFF'+head+LIVRE.map(r=>r.slice(0,5).join(';')+';'+r[5]).join('\n'), 'text/csv');
  }
  function json(){
    download('freel-sauvegarde-2026.json', JSON.stringify({profil:{nom:'Atelier L.',siret:'912 457 881 00027'},recettes:LIVRE,export:new Date().toISOString()},null,2), 'application/json');
  }
  return <>
    <h2 className="sect-h">Données &amp; export</h2>
    <p className="sect-sub">Tes données t'appartiennent. Exporte pour ton comptable, sauvegarde, ou efface tout.</p>
    <div className="toggle-row"><div className="tx"><b>Export FEC</b><span>Fichier des écritures comptables, format administration.</span></div><button className="btn sm" onClick={fec}><Ic d={I.download} s={14}/> Générer</button></div>
    <div className="toggle-row"><div className="tx"><b>Livre des recettes (CSV)</b><span>Registre complet de l'année en cours.</span></div><button className="btn sm" onClick={csv}><Ic d={I.download} s={14}/> Télécharger</button></div>
    <div className="toggle-row"><div className="tx"><b>Sauvegarde complète (JSON)</b><span>Toutes tes données, réimportables à tout moment.</span></div><button className="btn sm" onClick={json}><Ic d={I.download} s={14}/> Sauvegarder</button></div>
    <Toggle b="Synchronisation bancaire" s="Rapprochement automatique des encaissements." def={false}/>
    <div className="toggle-row"><div className="tx"><b style={{color:'var(--red)'}}>Effacer toutes les données</b><span>Suppression définitive du compte (RGPD). Irréversible.</span></div><button className="btn sm" style={{color:'var(--red)',borderColor:'rgba(226,113,95,.4)'}} onClick={()=>FreelToast('Suppression — confirmation requise (maquette)','warn')}><Ic d={I.trash} s={14}/> Supprimer</button></div>
  </>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
