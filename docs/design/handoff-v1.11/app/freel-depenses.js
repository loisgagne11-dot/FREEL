/* ============================================================
   FREEL — store partagé des dépenses (source unique de vérité)
   Achats l'édite, Argent le lit (TVA déductible + dossier de
   déclaration). Persistance localStorage. Charger AVANT les
   scripts de page.

   Modèle d'une dépense
     id, date 'YYYY-MM-DD', four, cat, ttc, tva, piece:bool,
     rec:bool (récurrente), acct:'pro'|'old'|'perso',
     recon:'matched'|'pending'|'nobank', bankId:string|null

   recon — l'état de rapprochement, explicite :
     matched  reliée à une opération du compte
     pending  saisie mais aucune opération bancaire associée
              (pas encore tombée, ou à relier)
     nobank   compte non synchronisé (ancien compte, perso) :
              aucun rapprochement n'est attendu
   ============================================================ */
window.FreelDepenses = (function(){
  'use strict';
  var KEY='freel-depenses-v1';

  var ACCOUNTS=[
    {id:'pro',   nm:'Compte pro · Qonto',      short:'Qonto', sync:true},
    {id:'old',   nm:'Ancien compte pro · BNP', short:'BNP',   sync:false, closed:true},
    {id:'perso', nm:'Compte perso (avance)',   short:'Perso', sync:false}
  ];
  var CATS=['Logiciels','Hébergement','Matériel','Déplacement','Coworking','Assurance RC Pro','Honoraires','Formation','Télécom','Autre'];

  function seedExpenses(){
    var out=[], mm=['01','02','03','04','05','06'];
    var REC=[
      {four:'Adobe Systems', cat:'Logiciels',   ttc:71.98, tva:12.00, d:'12'},
      {four:'OVHcloud',      cat:'Hébergement', ttc:35.98, tva:6.00,  d:'12'},
      {four:'WeWork',        cat:'Coworking',   ttc:264.00,tva:44.00, d:'02'},
      {four:'AXA',           cat:'Assurance RC Pro', ttc:38.00, tva:0, d:'01'}
    ];
    mm.forEach(function(m){
      REC.forEach(function(r,i){
        out.push({id:'r'+m+i, date:'2026-'+m+'-'+r.d, four:r.four, cat:r.cat, ttc:r.ttc, tva:r.tva,
                  piece:true, rec:true, acct:'pro', recon:'matched', bankId:null});
      });
    });
    out.push(
      {id:'p1', date:'2026-06-07', four:'Fnac Pro', cat:'Matériel', ttc:62.00, tva:10.33,
       piece:false, rec:false, acct:'pro', recon:'pending', bankId:null},
      {id:'p2', date:'2026-06-12', four:'SNCF', cat:'Déplacement', ttc:89.00, tva:0,
       piece:true, rec:false, acct:'pro', recon:'matched', bankId:null},
      {id:'p3', date:'2026-05-21', four:'Apple Store', cat:'Matériel', ttc:1299.00, tva:216.50,
       piece:true, rec:false, acct:'pro', recon:'matched', bankId:null},
      {id:'p4', date:'2026-04-09', four:'Formation UX', cat:'Formation', ttc:840.00, tva:140.00,
       piece:true, rec:false, acct:'pro', recon:'matched', bankId:null},
      {id:'o1', date:'2026-02-14', four:'Legalstart', cat:'Honoraires', ttc:190.00, tva:31.67,
       piece:true, rec:false, acct:'old', recon:'nobank', bankId:null},
      {id:'o2', date:'2026-01-23', four:'Bouygues Pro', cat:'Télécom', ttc:42.00, tva:7.00,
       piece:false, rec:false, acct:'old', recon:'nobank', bankId:null}
    );
    return out;
  }

  function seedBank(){
    return [
      {id:'b1', io:'in',  who:'Studio Lumen', date:'2026-06-04', raw:'VIR SEPA STUDIO LUMEN SARL', amt:4160,
       kind:'facture', hint:'Facture #023 · Studio Lumen', note:'passe la facture en encaissée + date 04/06', done:false, expId:null},
      {id:'b2', io:'out', who:'Fnac Pro', date:'2026-06-12', raw:'CB FNAC PRO PARIS', amt:62,
       kind:'achat', hint:'Achat « Nouveau clavier » (62 €)', note:'dépense déjà saisie — à relier', done:false, expId:null},
      {id:'b3', io:'out', who:'GitHub', date:'2026-06-09', raw:'PRLV GITHUB INC', amt:24,
       kind:'new', hint:'Nouvel achat · Logiciels', note:'aucune dépense saisie — créer + joindre', done:false, expId:null}
    ];
  }

  var subs=[];
  var state=load();
  function load(){
    try{
      var raw=JSON.parse(localStorage.getItem(KEY));
      if(raw && Array.isArray(raw.exp) && raw.exp.length) return raw;
    }catch(e){}
    return {exp:seedExpenses(), bank:seedBank()};
  }
  function persist(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
    subs.forEach(function(f){ try{ f(); }catch(e){} });
  }
  function subscribe(fn){ subs.push(fn); return function(){ subs=subs.filter(function(f){return f!==fn;}); }; }
  function reset(){ state={exp:seedExpenses(), bank:seedBank()}; persist(); }

  function all(){ return state.exp.slice().sort(function(a,b){ return a.date<b.date?1:a.date>b.date?-1:0; }); }
  function bank(){ return state.bank.slice(); }
  function byId(id){ return state.exp.filter(function(e){ return e.id===id; })[0]||null; }
  function account(id){ return ACCOUNTS.filter(function(a){ return a.id===id; })[0]||ACCOUNTS[0]; }

  var MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  function inPeriod(e,p){
    if(!p||p.kind==='all') return true;
    var y=+e.date.slice(0,4), m=+e.date.slice(5,7)-1;
    if(y!==p.y) return false;
    if(p.kind==='year') return true;
    if(p.kind==='quarter') return Math.floor(m/3)===p.q;
    return m===p.m;
  }
  function periodLabel(p){
    if(!p||p.kind==='all') return "tout l'historique";
    if(p.kind==='year') return 'année '+p.y;
    if(p.kind==='quarter') return 'T'+(p.q+1)+' '+p.y;
    return MONTHS[p.m]+' '+p.y;
  }
  function filter(p, acct){
    return all().filter(function(e){
      return inPeriod(e,p) && (!acct || acct==='tous' || e.acct===acct);
    });
  }

  function summary(p, acct){
    var list=filter(p,acct);
    var s={n:list.length, ttc:0, tva:0, recov:0, blocked:0, missing:0, pending:0, items:list};
    list.forEach(function(e){
      s.ttc+=e.ttc; s.tva+=e.tva;
      if(e.piece) s.recov+=e.tva; else { s.blocked+=e.tva; s.missing++; }
      if(e.recon==='pending') s.pending++;
    });
    return s;
  }

  function uid(){ return 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }

  function findMatch(exp){
    if(account(exp.acct).sync===false) return null;
    var t=Date.parse(exp.date);
    return state.bank.filter(function(b){
      if(b.io!=='out'||b.done||b.expId) return false;
      if(Math.abs(b.amt-exp.ttc)>0.5) return false;
      return Math.abs(Date.parse(b.date)-t)<=6*864e5;
    })[0]||null;
  }

  function add(input){
    var exp={
      id:uid(),
      date:input.date, four:input.four||'Sans nom', cat:input.cat||'Autre',
      ttc:+input.ttc||0, tva:+input.tva||0,
      piece:!!input.piece, rec:!!input.rec,
      acct:input.acct||'pro', recon:'pending', bankId:null
    };
    var match=null;
    if(account(exp.acct).sync===false) exp.recon='nobank';
    else match=findMatch(exp);
    state.exp.push(exp);
    persist();
    return {exp:exp, match:match};
  }

  function attachPiece(id){ var e=byId(id); if(e){ e.piece=true; persist(); } }
  function link(expId, bankId){
    var e=byId(expId), b=state.bank.filter(function(x){return x.id===bankId;})[0];
    if(!e||!b) return;
    e.recon='matched'; e.bankId=b.id;
    b.expId=e.id; b.done=true;
    persist();
  }
  function markNoBank(expId){ var e=byId(expId); if(e){ e.recon='nobank'; e.bankId=null; persist(); } }
  function closeBank(bankId){
    var b=state.bank.filter(function(x){return x.id===bankId;})[0];
    if(b){ b.done=true; persist(); }
  }
  function pendingList(){ return all().filter(function(e){ return e.recon==='pending'; }); }
  function openBank(){ return state.bank.filter(function(b){ return !b.done; }); }

  return {
    ACCOUNTS:ACCOUNTS, CATS:CATS, MONTHS:MONTHS,
    all:all, bank:bank, byId:byId, account:account,
    filter:filter, summary:summary, periodLabel:periodLabel, inPeriod:inPeriod,
    add:add, attachPiece:attachPiece, link:link, markNoBank:markNoBank, closeBank:closeBank,
    findMatch:findMatch, pendingList:pendingList, openBank:openBank,
    subscribe:subscribe, reset:reset
  };
})();
