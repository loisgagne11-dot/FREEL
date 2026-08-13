/* ============================================================
   FREEL — état financier partagé (source unique de vérité)
   Toutes les pages lisent ici : Pilote, Argent, Outils, formulaires.
   Aucun montant ne doit être écrit en dur dans une page.

   FAITS  = ce qui est saisi / lu sur les comptes
   DÉRIVÉ = tout le reste, recalculé (jamais stocké en double)

   Binder : tout élément <span data-fx="dispo"> reçoit la valeur
   formatée. data-fx-raw pour un nombre brut, data-fx-pct pour un %.
   ============================================================ */
window.FreelEtat = (function(){
  'use strict';
  var KEY='freel-etat-v1';

  /* ---------------- FAITS ---------------- */
  var FACTS={
    solde:8120,                 // solde du compte pro au 10/06/2026
    reserve:2470,               // réserve matelas gardée (curseur Pilote)
    // factures du mois : l'état pilote les entrées
    factures:[
      {num:'021', client:'Atelier Novak', amt:3200, state:'paid', date:'2026-06-03'},
      {num:'022', client:'Café Bianca',   amt:2810, state:'paid', date:'2026-06-05'},
      {num:'023', client:'Maison Vala',   amt:2410, state:'wait', date:'2026-06-18'},
      {num:'024', client:'Studio Lumen',  amt:1200, state:'late', date:'2026-05-20', dueDays:18}
    ],
    // échéances sociales & fiscales de l'exercice
    echeances:[
      {id:'urssaf', lab:'URSSAF T2',  amt:1980, state:'wait', due:'2026-07-05', kind:'urssaf'},
      {id:'ir',     lab:'Acompte IR', amt:620,  state:'paid', due:'2026-05-15', kind:'ir'},
      {id:'cfe',    lab:'CFE',        amt:410,  state:'wait', due:'2026-12-15', kind:'cfe'},
      {id:'cfp',    lab:'CFP',        amt:170,  state:'wait', due:'2026-07-05', kind:'urssaf'}
    ],
    // chiffre d'affaires
    caRealise:59400,            // facturé 2026 à date
    caEncaisse:32400,           // encaissé 2026 (base des seuils)
    caProjection:74200,         // projection fin d'année
    baseUrssafT2:7970,          // recettes encaissées avril→juin (assiette T2)
    encaisseMois:{avril:2680, mai:2880, juin:2410},
    // seuils légaux 2026
    seuilBNC:77700,
    seuilTVA:37500,
    // taux
    tauxUrssaf:0.246, tauxCFP:0.002, tauxIR:0.022,
    tva:'franchise'             // 'franchise' | 'assujetti'
  };

  var subs=[];
  var state=load();
  function load(){
    var base=JSON.parse(JSON.stringify(FACTS));
    try{
      var raw=JSON.parse(localStorage.getItem(KEY));
      if(raw && typeof raw.solde==='number'){
        // fusion : un état enregistré par une version antérieure ne doit pas
        // faire disparaître les faits ajoutés depuis
        Object.keys(base).forEach(function(k){
          if(raw[k]!==undefined && raw[k]!==null) base[k]=raw[k];
        });
      }
    }catch(e){}
    return base;
  }
  function persist(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
    subs.forEach(function(f){ try{ f(); }catch(e){} });
    bindAll();
  }
  function subscribe(fn){ subs.push(fn); return function(){ subs=subs.filter(function(f){return f!==fn;}); }; }
  function reset(){ state=JSON.parse(JSON.stringify(FACTS)); persist(); }
  function set(k,v){ state[k]=v; persist(); }
  function toggleFacture(num){
    var f=state.factures.filter(function(x){ return x.num===num; })[0];
    if(!f) return;
    f.state = f.state==='paid' ? 'wait' : 'paid';
    persist();
  }
  function toggleEcheance(id){
    var e=state.echeances.filter(function(x){ return x.id===id; })[0];
    if(!e) return;
    e.state = e.state==='paid' ? 'wait' : 'paid';
    persist();
  }

  /* ---------------- DÉRIVÉ ---------------- */
  function sum(a){ return a.reduce(function(s,x){ return s+x.amt; },0); }
  function encaisse(){ return sum(state.factures.filter(function(f){ return f.state==='paid'; })); }
  function attente(){ return sum(state.factures.filter(function(f){ return f.state!=='paid'; })); }
  function retards(){ return state.factures.filter(function(f){ return f.state==='late'; }); }
  function sortiesPayees(){ return sum(state.echeances.filter(function(e){ return e.state==='paid'; })); }
  function sortiesAVenir(){ return sum(state.echeances.filter(function(e){ return e.state!=='paid'; })); }
  function sortiesTotal(){ return sum(state.echeances); }
  /* provisions dues = toutes les échéances de l'exercice restant à couvrir */
  function provisions(){ return sortiesTotal(); }
  function dispo(){ return state.solde - provisions(); }
  function versable(){ return Math.max(0, dispo() - state.reserve); }
  /* rémunération du mois = ce qui est entré moins ce qui sort */
  function remuMois(){ return Math.max(0, encaisse() - sortiesTotal()); }
  function seuilTVApct(){ return Math.round(state.caEncaisse/state.seuilTVA*100); }
  function seuilBNCpct(){ return Math.round(state.caEncaisse/state.seuilBNC*100); }
  function margeTVA(){ return Math.max(0, state.seuilTVA - state.caEncaisse); }
  function ech(id){ return state.echeances.filter(function(e){ return e.id===id; })[0]||{amt:0,lab:''}; }
  function facture(num){ return state.factures.filter(function(f){ return f.num===num; })[0]||{amt:0,client:''}; }
  /* cotisations du trimestre, déduites de l'assiette × taux (jamais saisies) */
  function cotisUrssaf(){ return state.baseUrssafT2*0.212; }   // 21,2 % avec ACRE
  function cotisCFP(){ return state.baseUrssafT2*state.tauxCFP; }
  function cotisIR(){ return state.baseUrssafT2*state.tauxIR*1.56; } // IR libératoire BNC
  function prelevT2(){ return cotisUrssaf()+cotisCFP(); }
  function depenses(){ // TTC des achats de l'année, via le store dépenses
    if(!window.FreelDepenses) return 0;
    return window.FreelDepenses.summary({kind:'year',y:2026},'tous').ttc;
  }
  function tvaDeductible(){
    if(!window.FreelDepenses) return 0;
    return window.FreelDepenses.summary({kind:'year',y:2026},'tous').recov;
  }
  function recurrentMensuel(){ // charges qui retombent chaque mois
    if(!window.FreelDepenses) return 0;
    return window.FreelDepenses.all()
      .filter(function(e){ return e.rec && e.date.slice(0,7)==='2026-06'; })
      .reduce(function(s,e){ return s+e.ttc; },0);
  }
  function burnMensuel(){ // charges récurrentes + provisions lissées sur l'exercice
    return recurrentMensuel() + provisions()/6;
  }
  function autonomie(){ // mois de trésorerie disponible au rythme réel
    var b=burnMensuel();
    return b>0 ? Math.round(dispo()/b*10)/10 : 0;
  }

  /* ---------------- formats ---------------- */
  function r10(n){ return Math.round(n/10)*10; }
  var nb=function(n){ return Math.round(n).toLocaleString('fr-FR'); };
  function eur(n){ return nb(n)+'\u00a0€'; }
  function eurR(n){ return nb(r10(n))+'\u00a0€'; }
  function keur(n){ return (Math.round(n/100)/10).toLocaleString('fr-FR')+' k€'; }

  /* ---------------- valeurs exposées au binder ---------------- */
  function values(){
    var v={
      solde:eur(state.solde),
      reserve:eur(state.reserve),
      provisions:eur(provisions()),
      dispo:eur(dispo()),
      versable:eur(versable()),
      remuMois:eurR(remuMois()),
      encaisse:eurR(encaisse()),
      attente:eurR(attente()),
      sortiesTotal:eurR(sortiesTotal()),
      sortiesPayees:eurR(sortiesPayees()),
      sortiesAVenir:eurR(sortiesAVenir()),
      urssaf:eur(ech('urssaf').amt),
      ir:eur(ech('ir').amt),
      cfe:eur(ech('cfe').amt),
      cfp:eur(ech('cfp').amt),
      caRealise:eur(state.caRealise),
      caRealiseK:keur(state.caRealise),
      caEncaisse:eur(state.caEncaisse),
      caProjection:eur(state.caProjection),
      seuilTVA:eur(state.seuilTVA),
      seuilBNC:eur(state.seuilBNC),
      seuilTVApct:seuilTVApct()+'\u00a0%',
      seuilBNCpct:seuilBNCpct()+'\u00a0%',
      margeTVA:eur(margeTVA()),
      depenses:eur(depenses()),
      tvaDeductible:eur(tvaDeductible()),
      baseUrssaf:eur(state.baseUrssafT2),
      cotisUrssaf:eurR(cotisUrssaf()),
      cotisCFP:eur(cotisCFP()),
      cotisIR:eurR(cotisIR()),
      prelevT2:eurR(prelevT2()),
      encAvril:eur(state.encaisseMois.avril),
      encMai:eur(state.encaisseMois.mai),
      encJuin:eur(state.encaisseMois.juin),
      autonomie:String(autonomie()).replace('.',',')
    };
    /* une clé par facture : fac024 = montant, facCli024 = client */
    state.factures.forEach(function(f){
      v['fac'+f.num]=eur(f.amt);
      v['facCli'+f.num]=f.client;
    });
    return v;
  }

  /* remplit tous les [data-fx] de la page */
  function bindAll(root){
    var v=values();
    (root||document).querySelectorAll('[data-fx]').forEach(function(el){
      var k=el.getAttribute('data-fx');
      if(v[k]!==undefined) el.textContent=v[k];
    });
  }

  var api={
    /* faits */
    get solde(){ return state.solde; },
    get reserve(){ return state.reserve; },
    get factures(){ return state.factures.slice(); },
    get echeances(){ return state.echeances.slice(); },
    get caRealise(){ return state.caRealise; },
    get caEncaisse(){ return state.caEncaisse; },
    get caProjection(){ return state.caProjection; },
    get seuilBNC(){ return state.seuilBNC; },
    get seuilTVA(){ return state.seuilTVA; },
    get tva(){ return state.tva; },
    /* dérivé */
    encaisse:encaisse, attente:attente, retards:retards,
    sortiesPayees:sortiesPayees, sortiesAVenir:sortiesAVenir, sortiesTotal:sortiesTotal,
    provisions:provisions, dispo:dispo, versable:versable, remuMois:remuMois,
    seuilTVApct:seuilTVApct, seuilBNCpct:seuilBNCpct, margeTVA:margeTVA,
    depenses:depenses, tvaDeductible:tvaDeductible, autonomie:autonomie, ech:ech,
    facture:facture, cotisUrssaf:cotisUrssaf, cotisCFP:cotisCFP, cotisIR:cotisIR, prelevT2:prelevT2,
    recurrentMensuel:recurrentMensuel, burnMensuel:burnMensuel,
    /* utilitaires */
    eur:eur, eurR:eurR, keur:keur, values:values, bindAll:bindAll,
    set:set, subscribe:subscribe, reset:reset,
    toggleFacture:toggleFacture, toggleEcheance:toggleEcheance
  };

  function boot(){ bindAll(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(boot,0); });
  else setTimeout(boot,0);

  return api;
})();
