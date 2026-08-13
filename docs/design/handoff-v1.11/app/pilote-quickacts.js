/* FREEL — Pilote · barre d'actions rapides personnalisable.
   Chips par défaut + bouton « + » listant toutes les actions de l'appli.
   Ajout / retrait persistés en localStorage. Les chips portent les mêmes
   data-attributes que les menus de la topbar : les handlers globaux
   (freel-docs.js, pilote-flux.js) les prennent en charge sans câblage. */
(function(){
  var KEY='freel-quickacts';
  // freel.js déclare FREEL_ICONS en `const` global : pas exposé sur window.
  function icons(){ try{ return FREEL_ICONS||{}; }catch(e){ return window.FREEL_ICONS||{}; } }
  function ico(n){ return icons()[n]||''; }

  var CATALOG=[
    {id:'fac-dl',  g:'Documents', lab:'Télécharger une facture', ic:'doc',      attr:'data-export="factures-pdf"'},
    {id:'cra-dl',  g:'Documents', lab:'Télécharger le CRA',      ic:'doc',      attr:'data-export="cra"'},
    {id:'livre',   g:'Documents', lab:'Livre des recettes (CSV)',ic:'doc',      attr:'data-export="livre-csv"'},
    {id:'fec',     g:'Documents', lab:'Export FEC',              ic:'doc',      attr:'data-export="fec"'},
    {id:'json',    g:'Documents', lab:'Sauvegarde JSON',         ic:'doc',      attr:'data-export="json"'},
    {id:'new-fac', g:'Saisir',    lab:'Nouvelle facture',        ic:'plus',     attr:'data-new="facture"'},
    {id:'mission', g:'Saisir',    lab:'Nouvelle mission',        ic:'layers',   attr:'data-new="mission"'},
    {id:'encaisse',g:'Saisir',    lab:'Pointer un encaissement', ic:'up',       attr:'data-new="encaissement"'},
    {id:'charge',  g:'Saisir',    lab:'Ajouter une dépense',      ic:'minus',    href:'Achats - Justificatifs & Banque.html?new=depense'},
    {id:'salaire', g:'Saisir',    lab:'Me verser un salaire',    ic:'wallet',   attr:'data-new="salaire"'},
    {id:'conge',   g:'Saisir',    lab:'Poser des congés',        ic:'sun',      attr:'data-new="conge"'},
    {id:'activite',g:'Aller à',   lab:'Modifier activité & congés', ic:'sun',   href:'Activité - Plan de charge.html'},
    {id:'piece',   g:'Aller à',   lab:'Déposer un justificatif', ic:'receipt',  href:'Achats - Justificatifs & Banque.html?new=depense'},
    {id:'tresor',  g:'Aller à',   lab:'Voir ma trésorerie',      ic:'chart',    href:'Argent - Trésorerie & Performance.html'},
    {id:'simu',    g:'Aller à',   lab:'Simuler un tarif',        ic:'calc',     href:'Outils - Simulateurs.html'}
  ];
  var DEFAULT=['fac-dl','cra-dl','activite','new-fac'];

  function load(){
    try{ var v=JSON.parse(localStorage.getItem(KEY)); if(Array.isArray(v)&&v.length) return v; }catch(e){}
    return DEFAULT.slice();
  }
  function save(list){ try{ localStorage.setItem(KEY,JSON.stringify(list)); }catch(e){} }
  function byId(id){ for(var i=0;i<CATALOG.length;i++) if(CATALOG[i].id===id) return CATALOG[i]; return null; }

  var active=load();

  function chip(a){
    var inner=ico(a.ic)+' <span>'+a.lab+'</span><span class="qa-x" data-qa-del="'+a.id+'" title="Retirer">&times;</span>';
    return a.href
      ? '<a class="qa" href="'+a.href+'">'+inner+'</a>'
      : '<button class="qa" '+(a.attr||'')+'>'+inner+'</button>';
  }

  function menu(){
    var out='', groups=[];
    CATALOG.forEach(function(a){ if(groups.indexOf(a.g)<0) groups.push(a.g); });
    groups.forEach(function(g){
      var items=CATALOG.filter(function(a){ return a.g===g && active.indexOf(a.id)<0; });
      if(!items.length) return;
      out+='<div class="cap">'+g+'</div>';
      items.forEach(function(a){ out+='<div class="mi" data-qa-add="'+a.id+'">'+ico(a.ic)+' '+a.lab+'</div>'; });
    });
    if(!out) out='<div class="cap">Toutes les actions sont déjà là</div>';
    return out;
  }

  function render(){
    var bar=document.getElementById('quickActs');
    if(!bar) return;
    var chips=active.map(byId).filter(Boolean).map(chip).join('');
    bar.innerHTML='<span class="qa-cap">Actions rapides</span>'+chips+
      '<span class="qa-wrap"><button class="qa add" id="qaAdd" title="Ajouter une action rapide">'+ico('plus')+'</button>'+
      '<div class="menu qa-menu" id="qaMenu">'+menu()+'</div></span>';
  }

  // capture : passe avant les handlers globaux (freel.js ferme tous les .menu au clic)
  document.addEventListener('click', function(e){
    var del=e.target.closest('[data-qa-del]');
    if(del){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      active=active.filter(function(x){ return x!==del.dataset.qaDel; });
      save(active); render();
      return;
    }
    if(e.target.closest('#qaAdd')){
      e.preventDefault(); e.stopPropagation();
      var m=document.getElementById('qaMenu');
      if(m) m.classList.toggle('open');
      return;
    }
    var add=e.target.closest('[data-qa-add]');
    if(add){
      e.preventDefault(); e.stopPropagation();
      if(active.indexOf(add.dataset.qaAdd)<0) active.push(add.dataset.qaAdd);
      save(active); render();
      return;
    }
    var mo=document.getElementById('qaMenu');
    if(mo && !e.target.closest('.qa-wrap')) mo.classList.remove('open');
  }, true);

  function boot(){ setTimeout(render,0); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
