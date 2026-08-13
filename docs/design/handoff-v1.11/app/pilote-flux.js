/* ============================================================
   FREEL — Pilote · Le Flux (logique de page)
   Données alignées sur le Cockpit « Le Fil » (Loïs · juin 2026) :
   solde 8 120 € · provisions dues 3 180 € · réserve 2 600 €
   → versable 2 340 € · TVA 32 400/37 500 (franchi ≈ sept.)
   Chargé APRÈS freel.js (qui remplace les jetons $ICO_x$).
   ============================================================ */
(function(){

  /* ---------- helpers ---------- */
  function $(id){ return document.getElementById(id); }
  function setTxt(id, t){ var el=$(id); if(el) el.textContent=t; }
  function r10(n){ return Math.round(n/10)*10; }
  function eur(n){ return r10(n).toLocaleString('fr-FR') + '\u00a0€'; }

  /* ---------- flux : rendu depuis l'état partagé ---------- */
  var E=window.FreelEtat;
  var ST_LABELS = { in:{ paid:'encaissé', wait:'en attente', late:'retard' }, out:{ paid:'payé', wait:'à venir' } };
  function renderFlux(){
    if(!E) return;
    var inW=document.querySelector('.fcol.in .fitems');
    if(inW) inW.innerHTML=E.factures.map(function(f){
      var st = f.state==='paid' ? 'paid' : (f.state==='late' ? 'late' : 'wait');
      return '<button class="fit" data-kind="fac" data-key="'+f.num+'" data-amt="'+f.amt+'" data-state="'+(f.state==='paid'?'paid':'wait')+'">'+
        '<span class="fit-n">'+f.client+'</span>'+
        '<span class="fit-r"><span class="st-pill '+st+'">'+ST_LABELS.in[f.state]+'</span></span></button>';
    }).join('');
    var outW=document.querySelector('.fcol.out .fitems');
    if(outW) outW.innerHTML=E.echeances.map(function(e){
      return '<button class="fit" data-kind="ech" data-key="'+e.id+'" data-amt="'+e.amt+'" data-state="'+e.state+'">'+
        '<span class="fit-n">'+e.lab+'</span>'+
        '<span class="fit-r"><span class="st-pill '+e.state+'">'+ST_LABELS.out[e.state]+'</span></span></button>';
    }).join('');
  }

  /* ---------- flux : statuts en direct ---------- */
  function tally(col){
    var paid=0, wait=0;
    document.querySelectorAll('.fcol.' + col + ' .fit').forEach(function(f){
      var a = parseFloat(f.dataset.amt) || 0;
      if (f.dataset.state==='paid') paid += a; else wait += a;
    });
    return { paid:paid, wait:wait };
  }
  function recompute(){
    var i = tally('in'), o = tally('out');
    var oTotal = o.paid + o.wait;
    setTxt('inMain', eur(i.paid));
    setTxt('inSub', eur(i.wait));
    setTxt('outMain', eur(oTotal));
    setTxt('outPaid', eur(o.paid));
    setTxt('outWait', eur(o.wait));
    setTxt('payMain', eur(Math.max(0, i.paid - oTotal)));
  }
  var FIT_LABELS = { in:{ paid:'encaissé', wait:'en attente' }, out:{ paid:'payé', wait:'à venir' } };
  function toggleFit(fit){
    var col = fit.closest('.fcol').dataset.col;
    var kind=fit.dataset.kind, key=fit.dataset.key;
    var nm = fit.querySelector('.fit-n');
    var label = nm && nm.childNodes[0] ? nm.childNodes[0].textContent.trim() : 'Ligne';
    if(E && kind==='fac') E.toggleFacture(key);
    else if(E && kind==='ech') E.toggleEcheance(key);
    renderFlux();
    recompute();
    var now = (kind==='fac')
      ? (E.factures.filter(function(f){return f.num===key;})[0]||{}).state
      : (E.echeances.filter(function(e){return e.id===key;})[0]||{}).state;
    if (window.FreelToast) FreelToast(label + ' → ' + FIT_LABELS[col][now==='paid'?'paid':'wait'], 'ok');
  }

  /* ---------- décisions / intelligence ---------- */
  var done = {};
  function markDone(key, msg){
    if (done[key]) return;
    done[key] = true;
    var dec = $({relance:'decRelance',prov:'decProv',dep:'decDep',cra:'decCra',decl:'decDecl'}[key]);
    if (dec){
      dec.classList.add('done');
      var b = dec.querySelector('.act');
      if (b) b.textContent = 'Fait ✓';
    }
    var dc = $('decCount');
    if (dc){
      var openDec = ['relance','prov','dep','decl'].filter(function(k){ return !done[k]; }).length;
      dc.textContent = openDec ? openDec + ' à traiter' : 'tout est traité';
      dc.className = 'chip2 ' + (openDec ? 'warn' : 'ok');
    }
    if (window.FreelToast) FreelToast(msg, 'ok');
    if (window.FreelSheet) FreelSheet.close();
  }

  /* ---------- propositions Claude Code ---------- */
  function selectedProps(){
    return [].slice.call(document.querySelectorAll('.prop')).filter(function(p){
      var c = p.querySelector('input[type=checkbox]');
      return c && c.checked;
    });
  }
  function refreshSel(){
    document.querySelectorAll('.prop').forEach(function(p){
      var c = p.querySelector('input[type=checkbox]');
      p.classList.toggle('sel', !!(c && c.checked));
    });
    var n = selectedProps().length;
    setTxt('selCount', n + ' retenu' + (n>1?'s':''));
  }
  function buildBrief(){
    var sel = selectedProps();
    var list = sel.length ? sel : [].slice.call(document.querySelectorAll('.prop'));
    var head = '# Freel — modules d\u2019intelligence à construire\n' +
      'Contexte : app de pilotage pour micro-entrepreneur (vanilla JS + localStorage). ' +
      'Organisation cible : Pilote (Le Flux) / Activité / Argent, ruban d\u2019intelligence transversal. ' +
      'La saisie de journée est enrichie (mission · durée ¼–1 j · tâche) et alimente le CRA sans ressaisie.\n\n';
    var body = list.map(function(p, i){
      return (i+1) + '. **' + p.dataset.prop + '**\n   ' + p.dataset.spec;
    }).join('\n\n');
    return head + body + '\n';
  }
  function copyBrief(){
    var txt = buildBrief();
    function fallback(){
      if (window.FreelSheet) FreelSheet.open('Brief Claude Code',
        '<p class="lbl">Copie ce texte dans Claude Code</p>' +
        '<textarea style="width:100%;height:320px;background:var(--panel-2);border:1px solid var(--line-2);border-radius:10px;color:var(--text);font-family:var(--mono);font-size:11.5px;padding:12px;line-height:1.5;">' +
        txt.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</textarea>');
    }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        if (window.FreelToast) FreelToast('Brief copié — colle-le dans Claude Code', 'ok');
      }, fallback);
    } else fallback();
  }

  /* ---------- wiring ---------- */
  function init(){
    renderFlux();
    recompute();

    document.addEventListener('click', function(e){
      var t;
      if ((t = e.target.closest('.fit'))){ toggleFit(t); return; }
      if ((t = e.target.closest('[data-action]'))){
        var a = t.dataset.action;
        if (a==='relance') markDone('relance', 'Relance envoyée à Studio Lumen');
        if (a==='prov') markDone('prov', E.eur(E.ech('urssaf').amt)+' provisionnés — bocal URSSAF prêt pour le 5 juillet');
        if (a==='dep') markDone('dep', 'Noté — objectif < 40 % suivi dans Santé');
        if (a==='decl') markDone('decl', 'Déclaration URSSAF T2 marquée faite — prélèvement de '+E.eur(E.ech('urssaf').amt)+' le 5 juillet');
        if (a==='cra') markDone('cra', 'CRA de mai envoyé à Atelier Novak');
        return;
      }
      if (e.target.closest('[data-action-close]')){ if (window.FreelSheet) FreelSheet.close(); return; }
      if (e.target.closest('#briefBtn')){ copyBrief(); return; }
      if ((t = e.target.closest('.sheet-b [data-sheet]'))){
        var tpl = document.getElementById(t.dataset.sheet);
        if (tpl && window.FreelSheet) FreelSheet.open(t.dataset.sheetTitle||'Détail', tpl.innerHTML);
        return;
      }
    });

    document.addEventListener('input', function(e){
      if (e.target.matches('.prop input[type=checkbox]')) refreshSel();
    });

    var tw = $('twProps');
    if (tw) tw.addEventListener('change', function(){
      document.body.classList.toggle('hide-props', !tw.checked);
    });

    // réglages maquette : repliés par défaut, hors du chemin de lecture
    var tt = $('twToggle'), tb = $('tweakbar');
    if (tt && tb) tt.addEventListener('click', function(){
      tb.hidden = !tb.hidden;
      tt.classList.toggle('on', !tb.hidden);
    });

    refreshSel();
  }

  // freel.js remplace body.innerHTML au DOMContentLoaded → on passe après lui.
  function boot(){ setTimeout(init, 0); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
