/* ============================================================
   FREEL V1.11 — couche « indicateurs système »
   Injecte, sur TOUS les onglets, la pastille d'état : cloud (avec
   l'emplacement des documents), compte pro, fraîcheur des barèmes,
   palette. Chaque pastille
   ouvre son panneau (FreelSheet). Aucun calcul métier ici : on lit
   les stores existants quand ils sont là, sinon on affiche l'état
   connu de la maquette.
   Charger APRÈS freel.js.
   ============================================================ */
(function(){
  var TODAY='2026-06-10';
  var SYS={cloud:'2026-06-10T09:12', bank:'2026-06-09T22:40', drive:'gdrive',
           bareme:'2025', baremeVerifie:'2025-12-14', baremeDispo:'2026',
           source:'urssaf.fr · impots.gouv.fr · loi de finances 2026'};
  var DRIVES=[['local','Cet appareil','dossier Freel · aucune copie ailleurs'],
              ['gdrive','Google Drive','/Freel · 1,2 Go utilisés'],
              ['onedrive','OneDrive','compte pro Microsoft 365'],
              ['dropbox','Dropbox','/Apps/Freel'],
              ['coffre','Coffre chiffré Freel','clé sur ton appareil, illisible côté serveur']];
  function drive(){ for(var i=0;i<DRIVES.length;i++) if(DRIVES[i][0]===SYS.drive) return DRIVES[i]; return DRIVES[0]; }
  var THEMES=[['sombre','Sombre','contrastes chauds, économe en batterie',['#0b0f0c','#5fd39a','#e0b672']],
              ['nuit','Calme sombre','sauge et argile, en version nuit',['#1b1e14','#a3c489','#cba87a']],
              ['clair','Clair','fond blanc, lecture longue durée',['#f6f8f6','#17845a','#2b6ba6']],
              ['calme','Calme','sauge et argile, plus de personnalité',['#f4f2ee','#7d9b6f','#c4a06a']]];
  var THEME='sombre';
  try{ THEME=localStorage.getItem('freel-v111-theme')||'sombre'; }catch(e){}
  function applyTheme(t){ THEME=t; document.documentElement.setAttribute('data-theme',t);
    try{ localStorage.setItem('freel-v111-theme',t); }catch(e){} }
  applyTheme(THEME);
  function theme(){ for(var i=0;i<THEMES.length;i++) if(THEMES[i][0]===THEME) return THEMES[i]; return THEMES[0]; }
  var CHANGES=[['Plafond micro-BNC','77 700 €','83 600 €'],
               ['Cotisations BNC','24,6 %','26,1 %'],
               ['ACRE — fin des taux réduits','31/12/2026','28/02/2026']];
  try{ var raw=localStorage.getItem('freel-v111-sys'); if(raw) SYS=Object.assign(SYS,JSON.parse(raw)); }catch(e){}
  function save(){ try{ localStorage.setItem('freel-v111-sys',JSON.stringify(SYS)); }catch(e){} }

  var SVG={
    cloud:'M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0118 18H7Z',
    wallet:'M3 7h14M3 7v10a2 2 0 002 2h14a1 1 0 001-1v-8a1 1 0 00-1-1H5a2 2 0 010-4h12v4M16 13h.01',
    shield:'M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z',
    scale:'M12 3v18M7 21h10M5 7h14l-3 7H8L5 7Z',
    folder:'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7Z',
    palette:'M12 3a9 9 0 100 18h1a2 2 0 002-2 2 2 0 012-2h1a3 3 0 003-3 9 9 0 00-9-9ZM7 12h.01M9 8h.01M13 7h.01',
    lock:'M6 11h12v9H6v-9ZM9 11V8a3 3 0 016 0v3',
    refresh:'M20 12a8 8 0 11-2.3-5.7M20 4v5h-5',
    check:'M20 6 9 17l-5-5'
  };
  function ic(k){
    var d=SVG[k]; if(!d) return '';
    return '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+
      d.split('M').filter(Boolean).map(function(p){ return '<path d="M'+p+'"></path>'; }).join('')+'</svg>';
  }
  function days(d){ return Math.round((Date.parse(TODAY)-Date.parse(String(d).slice(0,10)))/864e5); }
  function ago(d){
    var j=days(d);
    if(j<=0) return String(d).length>10 ? "aujourd'hui à "+String(d).slice(11).replace(':','h') : "aujourd'hui";
    return j===1 ? 'hier' : 'il y a '+j+' j';
  }
  function fr(d){ return String(d).slice(0,10).split('-').reverse().join('/'); }
  function eur(n){ return (window.FreelEtat&&FreelEtat.eur) ? FreelEtat.eur(n) : Math.round(n)+' €'; }
  function counts(){
    var o={open:0,pending:0,missing:0,n:0};
    try{
      o.open=FreelDepenses.openBank().length;
      o.pending=FreelDepenses.pendingList().length;
      var s=FreelDepenses.summary({kind:'year',y:2026},'tous');
      o.missing=s.missing; o.n=s.n; o.blocked=s.blocked;
    }catch(e){}
    return o;
  }
  var SHEET=null;
  function ownSheet(){
    if(SHEET) return SHEET;
    var scrim=document.createElement('div'); scrim.className='scrim';
    var sheet=document.createElement('aside'); sheet.className='sheet';
    sheet.innerHTML='<div class="sheet-h"><span class="st"></span><button class="sx" aria-label="Fermer">'+
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>'+
      '</button></div><div class="sheet-b"></div>';
    document.body.appendChild(scrim); document.body.appendChild(sheet);
    function cl(){ scrim.classList.remove('open'); sheet.classList.remove('open'); }
    scrim.addEventListener('click',cl);
    sheet.querySelector('.sx').addEventListener('click',cl);
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') cl(); });
    SHEET={el:sheet,scrim:scrim,title:sheet.querySelector('.st'),body:sheet.querySelector('.sheet-b'),close:cl};
    return SHEET;
  }
  function openSheet(title,html){
    if(window.FreelSheet && FreelSheet.open) return FreelSheet.open(title,html);
    var s=ownSheet(); s.title.textContent=title; s.body.innerHTML=html;
    if(window.FreelEtat && FreelEtat.bindAll) try{ FreelEtat.bindAll(s.body); }catch(e){}
    requestAnimationFrame(function(){ s.scrim.classList.add('open'); s.el.classList.add('open'); });
  }
  function closeSheet(){
    if(window.FreelSheet && FreelSheet.close) return FreelSheet.close();
    if(SHEET) SHEET.close();
  }
  function row(l,s,v){ return '<div class="brk"><div class="bt"><b>'+l+'</b>'+(s?'<span>'+s+'</span>':'')+'</div><div class="bv">'+v+'</div></div>'; }
  function toast(m){ if(window.FreelToast) FreelToast(m,'ok'); }

  var PANELS={
    cloud:function(){
      var d=drive();
      return '<p class="muted" style="margin-top:0">Tes saisies partent sur le cloud dès qu\'elles sont enregistrées. Sans réseau, elles restent sur l\'appareil et remontent au retour.</p>'+
        row('Dernière synchronisation','chiffrée de bout en bout',ago(SYS.cloud))+
        row('MacBook Pro · Safari','cet appareil',"à l'instant")+
        row('iPhone · app','','hier à 19 h 40')+
        row('Chiffrement','AES-256 au repos','actif')+
        row('Documents déposés sur',d[2],d[1])+
        '<div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap"><button class="btn primary" id="v11Sync">'+ic('cloud')+' Resynchroniser maintenant</button>'+
        '<button class="btn" data-sys="drive">'+ic('folder')+' Changer d\'emplacement</button></div>';
    },
    drive:function(){
      var d=drive(), c=counts();
      return '<p class="muted" style="margin-top:0">Factures, justificatifs et pièces sont déposés en clair dans ton propre espace — tu gardes la main même sans Freel.</p>'+
        DRIVES.map(function(x){
          return '<button class="pick'+(x[0]===SYS.drive?' on':'')+'" data-drive="'+x[0]+'">'+
            '<span class="pic">'+ic(x[0]==='coffre'?'lock':x[0]==='local'?'folder':'cloud')+'</span>'+
            '<span><b>'+x[1]+'</b><span>'+x[2]+'</span></span><span class="ck"></span></button>';
        }).join('')+
        row('Pièces déposées','conservation légale jusqu\'en 2036',(c.n?(c.n-c.missing)+' / '+c.n:'à jour'))+
        row('Dernier dépôt','vers '+d[1],ago(SYS.cloud))+
        '<a class="btn" href="Config.html" style="margin-top:16px">Réglages du dossier</a>';
    },
    todo:function(){
      var t=todos();
      if(!t.length) return '<p class="muted" style="margin-top:0">Rien ne t\'attend : opérations reliées, pièces jointes, barème à jour.</p>';
      return '<p class="muted" style="margin-top:0">Tout ce qui attend une action, réuni. Chaque ligne mène là où ça se règle.</p>'+
        t.map(function(x){
          return '<div class="todo"><span class="tn">'+x.n+'</span><span class="tt"><b>'+x.t+'</b><span>'+x.s+'</span></span>'+
            (x.act? '<button class="btn sm primary" data-todo="'+x.act+'">'+x.cta+'</button>'
                  : '<a class="btn sm" href="'+x.href+'">'+x.cta+'</a>')+'</div>';
        }).join('');
    },
    theme:function(){
      return '<p class="muted" style="margin-top:0">Quatre palettes, même structure. Le choix suit ton appareil et vaut pour tous les onglets.</p>'+
        THEMES.map(function(t){
          return '<button class="pick'+(t[0]===THEME?' on':'')+'" data-theme-set="'+t[0]+'">'+
            '<span class="swatches">'+t[3].map(function(c){ return '<i style="background:'+c+'"></i>'; }).join('')+'</span>'+
            '<span><b>'+t[1]+'</b><span>'+t[2]+'</span></span><span class="ck"></span></button>';
        }).join('');
    },
    bank:function(){
      var c=counts(), solde=0;
      try{ solde=FreelEtat.solde; }catch(e){}
      return '<p class="muted" style="margin-top:0">Freel lit les opérations en <b>lecture seule</b> : aucun virement ne peut partir d\'ici sans toi.</p>'+
        row('Compte pro · Qonto','dernière opération lue '+ago(SYS.bank),eur(solde))+
        row('Connexion','mandat DSP2, à renouveler tous les 90 j','active')+
        row('Opérations non traitées','à relier à un achat ou une facture',c.open||'aucune')+
        row('Dépenses sans opération','saisies, en attente sur le compte',c.pending||'aucune')+
        row('Autres comptes','ancien compte BNP, perso','non synchronisés')+
        '<div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap"><button class="btn primary" id="v11Bank">'+ic('refresh')+' Relever les opérations</button>'+
        '<a class="btn" href="Achats - Justificatifs &amp; Banque.html">Ouvrir le rapprochement</a></div>';
    },
    bareme:function(){
      var aj=SYS.bareme===SYS.baremeDispo;
      return '<p class="muted" style="margin-top:0">'+(aj
        ? 'Les taux et seuils utilisés dans tous les calculs sont ceux du millésime en vigueur.'
        : 'Tes calculs tournent encore sur le barème <b>'+SYS.bareme+'</b>. '+CHANGES.length+' valeurs ont changé depuis.')+'</p>'+
        row('Millésime appliqué','vérifié le '+fr(SYS.baremeVerifie),SYS.bareme)+
        row('Source','',SYS.source)+
        (aj?'':'<p class="lbl" style="margin:18px 0 10px">Ce qui change avec le barème '+SYS.baremeDispo+'</p>'+
          CHANGES.map(function(c){ return row(c[0],'',c[1]+' → <b style="color:var(--green)">'+c[2]+'</b>'); }).join(''))+
        '<button class="btn '+(aj?'':'primary')+'" id="v11Maj" style="margin-top:16px">'+ic('scale')+' '+(aj?'Revérifier les barèmes':'Actualiser vers le barème '+SYS.baremeDispo)+'</button>';
    }
  };
  var TITLES={cloud:'Cloud & appareils',drive:'Où vivent tes documents',bank:'Compte pro',bareme:'Fraîcheur des barèmes',theme:'Palette',todo:'À traiter'};

  /* ---- ce qui attend une action, en un seul endroit ---- */
  var ACHATS='Achats - Justificatifs & Banque.html';
  /* une seule source pour les 6 écrans, chaque sujet rattaché à son onglet */
  function allTodos(){
    var t=[
      {tab:'Achats',n:3,t:'3 opérations du compte à relier',s:'Qonto · relevé lu '+ago(SYS.bank),cta:'Rapprocher',href:ACHATS},
      {tab:'Achats',n:1,t:'1 dépense en attente de son opération',s:'saisie faite, virement pas encore vu',cta:'Voir',href:ACHATS},
      {tab:'Achats',n:1,t:'1 justificatif manquant',s:'à joindre avant ta prochaine déclaration',cta:'Joindre',href:ACHATS},
      {tab:'Activité',n:1,t:'1 facture en retard',s:'Studio Lumen · #023 · échéance dépassée de 6 j',cta:'Relancer',href:'Activité - Plan de charge.html'},
      {tab:'Argent',n:1,t:'URSSAF T2 à provisionner',s:'1 980 € · échéance 5 juillet · la trésorerie le permet',cta:'Provisionner',href:'Argent - Trésorerie & Performance.html'}
    ];
    if(SYS.bareme!==SYS.baremeDispo) t.push({tab:'Outils',n:1,t:'Barème '+SYS.baremeDispo+' à appliquer',s:CHANGES.length+' valeurs ont changé depuis '+SYS.bareme+' · '+SYS.source.split(' · ')[0],cta:'Actualiser',act:'bareme'});
    return t;
  }
  function screenTab(){
    var t=document.title||'';
    if(/Pilote/i.test(t)) return 'Pilote';
    if(/Activité/i.test(t)) return 'Activité';
    if(/Argent/i.test(t)) return 'Argent';
    if(/Achats/i.test(t)) return 'Achats';
    if(/Outils/i.test(t)) return 'Outils';
    if(/Config/i.test(t)) return 'Config';
    return '';
  }
  /* Pilote est le poste de pilotage : il voit tout. Les autres onglets ne voient qu'eux. */
  function todos(){
    var tab=screenTab(), all=allTodos();
    if(tab==='Pilote'||!tab) return all;
    return all.filter(function(x){ return x.tab===tab; });
  }
  function countBy(){
    var m={}; allTodos().forEach(function(x){ m[x.tab]=(m[x.tab]||0)+x.n; }); return m;
  }
  function badges(){
    var m=countBy();
    document.querySelectorAll('.rail .nav').forEach(function(a){
      var old=a.querySelector('.navbadge'); if(old) old.parentNode.removeChild(old);
      var lbl=(a.querySelector('.nl')||a).textContent.trim(), key=null;
      Object.keys(m).forEach(function(k){ if(lbl.indexOf(k)===0) key=k; });
      if(!key) return;
      var b=document.createElement('b'); b.className='navbadge'; b.textContent=m[key];
      b.title=m[key]+' à traiter dans '+key;
      a.appendChild(b);
    });
  }
  function placeFab(el){
    var mobile=window.innerWidth<=760;
    var bar=document.getElementById('v11Sys'), top=document.querySelector('.topbar');
    if(mobile){ if(el.parentNode!==document.body) document.body.appendChild(el); }
    else if(bar){ if(el.parentNode!==bar || bar.firstChild!==el) bar.insertBefore(el,bar.firstChild); }
    else if(top && el.parentNode!==top) top.appendChild(el);
    el.classList.toggle('inbar',!mobile);
  }
  function todoTitle(){
    var tab=screenTab();
    return (tab && tab!=='Pilote') ? 'À traiter · '+tab : 'À traiter';
  }
  function fab(){
    var t=todos(), el=document.getElementById('v11Todo');
    if(!el){ el=document.createElement('button'); el.id='v11Todo'; el.type='button'; document.body.appendChild(el);
      window.addEventListener('resize',function(){ placeFab(el); }); }
    if(!t.length){ el.className='todofab ok'; el.title='Rien à traiter sur cet onglet'; el.innerHTML=ic('check')+'<em>à jour</em>'; }
    else {
      var n=0; t.forEach(function(x){ n+=(typeof x.n==='number'? x.n : 1); });
      el.className='todofab'; el.title=t.length+' sujet(s) à traiter'+(screenTab()==='Pilote'?' — tous onglets':' sur cet onglet');
      el.innerHTML='<b>'+n+'</b><em>à traiter</em>';
    }
    placeFab(el);
  }

  function chips(){
    var d=drive();
    return [
      ['cloud','cloud','Cloud','','synchro '+ago(SYS.cloud)],
      ['drive',(SYS.drive==='coffre'?'lock':'folder'),d[1],'','documents déposés sur '+d[1]],
      ['bank','wallet','Qonto','','compte pro relié · lecture seule'],
      ['theme','palette','Palette','thm','palette '+theme()[1].toLowerCase()]
    ];
  }
  function render(){
    var bar=document.getElementById('v11Sys'); if(!bar) return;
    var keep=document.getElementById('v11Todo');
    if(keep && keep.parentNode===bar) bar.removeChild(keep);
    bar.innerHTML=chips().map(function(x){
      var dot=x[0]==='theme'
        ? '<i>'+theme()[3].map(function(c){ return '<b style="background:'+c+'"></b>'; }).join('')+'</i>'
        : '<i></i>';
      return '<button class="'+x[3]+'" data-sys="'+x[0]+'" title="'+x[2]+' · '+x[4]+'">'+dot+ic(x[1])+'<em>'+x[2]+'</em></button>';
    }).join('');
    if(keep) bar.insertBefore(keep,bar.firstChild);
  }
  function wrapNavLabels(){
    document.querySelectorAll('.rail .nav').forEach(function(a){
      if(a.querySelector('.nl')) return;
      var moved=false;
      Array.prototype.slice.call(a.childNodes).forEach(function(n){
        if(n.nodeType===3 && n.textContent.trim()){
          var sp=document.createElement('span'); sp.className='nl'; sp.textContent=n.textContent.trim();
          a.replaceChild(sp,n); moved=true;
        }
      });
      return moved;
    });
  }
  function mount(){
    var top=document.querySelector('.topbar'); if(!top||document.getElementById('v11Sys')) return;
    var bar=document.createElement('div'); bar.className='sysbar'; bar.id='v11Sys';
    var anchor=top.querySelector('.synced') || top.querySelector('#yearBtn') || top.querySelector('.grow');
    if(anchor && anchor.classList.contains('synced')){ anchor.parentNode.replaceChild(bar,anchor); }
    else if(anchor && anchor.id==='yearBtn'){ top.insertBefore(bar,anchor); }
    else if(anchor){ anchor.parentNode.insertBefore(bar,anchor.nextSibling); }
    else top.appendChild(bar);
    render();
  }
  document.addEventListener('mouseover',function(e){
    var i=e.target.closest&&e.target.closest('.info'); if(!i) return;
    var t=findExplain(i); if(t && !t.classList.contains('pin')) t.classList.add('open');
  });
  document.addEventListener('mouseout',function(e){
    var i=e.target.closest&&e.target.closest('.info'); if(!i) return;
    var t=findExplain(i); if(t && !t.classList.contains('pin')) t.classList.remove('open');
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-sys]');
    if(b){ openSheet(TITLES[b.getAttribute('data-sys')], PANELS[b.getAttribute('data-sys')]()); return; }
    if(e.target.closest('#v11Sync')){ SYS.cloud=TODAY+'T09:12'; save(); render(); closeSheet(); toast('Synchronisation terminée'); return; }
    if(e.target.closest('#v11Bank')){ SYS.bank=TODAY+'T09:40'; save(); render(); closeSheet(); toast('Relevé à jour — aucune nouvelle opération'); return; }
    var dv=e.target.closest('[data-drive]');
    if(dv){ SYS.drive=dv.getAttribute('data-drive'); save(); render();
      openSheet(TITLES.drive, PANELS.drive()); toast('Documents déposés sur '+drive()[1]); return; }
    var th=e.target.closest('[data-theme-set]');
    if(th){ applyTheme(th.getAttribute('data-theme-set')); render();
      openSheet(TITLES.theme, PANELS.theme()); toast('Palette '+theme()[1].toLowerCase()); return; }
    if(e.target.closest('#v11Maj')){
      var aj=SYS.bareme===SYS.baremeDispo;
      SYS.bareme=SYS.baremeDispo; SYS.baremeVerifie=TODAY; save(); render(); fab(); freshRender(); closeSheet();
      toast(aj?'Barèmes revérifiés — aucun changement':'Barème 2026 appliqué — '+CHANGES.length+' valeurs mises à jour');
      return;
    }
    if(e.target.closest('#v11Todo')){ openSheet(todoTitle(), PANELS.todo()); return; }
    if(e.target.closest('[data-todo="bareme"]')){
      SYS.bareme=SYS.baremeDispo; SYS.baremeVerifie=TODAY; save(); render(); fab(); freshRender();
      openSheet(todoTitle(), PANELS.todo());
      toast('Barème '+SYS.bareme+' appliqué — '+CHANGES.length+' valeurs mises à jour'); return;
    }
    var inf=e.target.closest('.info');
    if(inf){ var tgt=findExplain(inf);
      if(tgt){ var o=tgt.classList.toggle('pin'); tgt.classList.toggle('open',o); inf.setAttribute('aria-expanded',o?'true':'false'); }
      return; }
    if(e.target.closest('#v11Fresh')){ openSheet(TITLES.bareme, PANELS.bareme()); }
  });

  /* bandeau de fraîcheur : sur les écrans qui portent [data-fresh] */
  function freshRender(){
    document.querySelectorAll('[data-fresh]').forEach(function(el){
      var aj=SYS.bareme===SYS.baremeDispo;
      el.className='freshbar'+(aj?' ok':'');
      el.innerHTML='<div>'+(aj? 'Barème '+SYS.bareme+' en vigueur' : 'Barème '+SYS.bareme+' — des valeurs '+SYS.baremeDispo+' sont disponibles')+
        '<span>Vérifié le '+fr(SYS.baremeVerifie)+' · '+SYS.source+'</span></div>'+
        '<button id="v11Fresh">'+(aj?'Revérifier':'Actualiser les valeurs')+'</button>';
    });
  }
  function findExplain(el){
    function scan(n){ while(n){ if(n.classList&&n.classList.contains('explain')) return n; n=n.nextElementSibling; } return null; }
    return scan(el.nextElementSibling) || (el.parentNode && scan(el.parentNode.nextElementSibling)) || null;
  }
  /* les textes d'explication passent derrière un « i » (survol ou clic) */
  function mkInfo(title){
    var b=document.createElement('button'); b.type='button'; b.className='info';
    b.setAttribute('aria-expanded','false'); b.title=title||'En savoir plus'; b.textContent='i';
    return b;
  }
  var INLINE='.pay-note,.tvahandoff .th-b span,p.help,.card>p.muted,.icard>p,.recsec+p.muted,.lever,.sect-sub-inline';
  function collapse(){
    /* 1. sous-titre porté par un titre : le « i » se pose dans le titre */
    [['h1','.greet p','Ce que fait cet écran'],
     ['.sect-h','.sect-sub','À quoi sert ce réglage']].forEach(function(sel){
      document.querySelectorAll(sel[1]).forEach(function(p){
        var h=p.parentNode.querySelector(sel[0]); if(!h) return;
        if(!h.querySelector('.info')) h.appendChild(mkInfo(sel[2]));
        p.classList.add('explain');
      });
    });
    /* 2. paragraphes d'explication dans les cartes : le « i » prend leur place */
    document.querySelectorAll(INLINE).forEach(function(p){
      if(p.classList.contains('explain')) return;
      if((p.textContent||'').trim().length<70) return;
      if(p.querySelector('input,select,button')) return;
      var b=mkInfo('Explication');
      p.parentNode.insertBefore(b,p);
      p.classList.add('explain');
    });
  }
  function ensure(){
    mount(); wrapNavLabels(); badges(); fab(); collapse();
    freshRender();
  }
  var tries=0, pending=false;
  function loop(){ ensure(); if(++tries<16 && !document.getElementById('v11Sys')) setTimeout(loop,250); }
  function watch(){
    var root=document.getElementById('root')||document.body;
    new MutationObserver(function(){
      if(pending) return; pending=true;
      requestAnimationFrame(function(){ pending=false; ensure(); });
    }).observe(root,{childList:true,subtree:true});
  }
  setTimeout(watch,400);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(loop,30); });
  else setTimeout(loop,30);
})();
