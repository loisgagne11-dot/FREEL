/* ============================================================
   FREEL — JS partagé (icônes, menus, sous-onglets, tweaks)
   Chargé par Activite.html / Finances.html / Config.html
   ============================================================ */
const FREEL_ICONS = {
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19V5"/><path d="m4 15 5-5 4 3 6-7"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L4.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M19 19v2"/></svg>',
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5"/><circle cx="16" cy="13" r="1.3" fill="currentColor" stroke="none"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L23 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-5 5 5"/></svg>',
  dn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>',
  flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4l9 1.5L5 14"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 18h.01"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3Z"/><path d="M8 8h8M8 12h8"/></svg>',
  percent:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
  scale:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h14l-3 7H8L5 7Z"/><path d="M12 3 5 7M12 3l7 4"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.4 4.3M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.5 9.5 0 0 0 2.6-.4"/></svg>',
  chevdown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 21h14"/></svg>',
  cloud:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 18 18H7Z"/></svg>',
  zap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  calc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  expand:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H3v-6M21 9V3h-6M3 21l7-7M21 3l-7 7"/></svg>'
};

// ============================================================
// Système de modale latérale (drill-down) — partagé
// FreelSheet.open(titre, htmlString) ouvre un panneau ; clic scrim/✕ ferme.
// ============================================================
window.FreelSheet = (function(){
  var scrim, sheet, titleEl, bodyEl, built=false;
  function build(){
    scrim=document.createElement('div');scrim.className='scrim';
    sheet=document.createElement('aside');sheet.className='sheet';
    sheet.innerHTML='<div class="sheet-h"><span class="st"></span><button class="sx" aria-label="Fermer">'+(FREEL_ICONS.x)+'</button></div><div class="sheet-b"></div>';
    document.body.appendChild(scrim);document.body.appendChild(sheet);
    titleEl=sheet.querySelector('.st');bodyEl=sheet.querySelector('.sheet-b');
    scrim.addEventListener('click',close);
    sheet.querySelector('.sx').addEventListener('click',close);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
    built=true;
  }
  function open(title,html){
    if(!built)build();
    titleEl.textContent=title;bodyEl.innerHTML=html;bodyEl.scrollTop=0;
    // toute feuille ouverte est reliée à l'état partagé : les [data-fx] sont remplis ici,
    // quel que soit le déclencheur (source unique, jamais de littéral figé)
    if(window.FreelEtat) window.FreelEtat.bindAll(bodyEl);
    requestAnimationFrame(function(){scrim.classList.add('open');sheet.classList.add('open');});
  }
  function close(){if(!built)return;scrim.classList.remove('open');sheet.classList.remove('open');}
  return {open:open,close:close};
})();

// ============================================================
// Toast léger + formulaires de saisie (menus "+ Nouveau" / "Exporter")
// ============================================================
window.FreelToast=function(msg,kind){
  var t=document.createElement('div');
  t.className='freel-toast'+(kind?(' '+kind):'');
  t.innerHTML=(kind==='ok'?FREEL_ICONS.check:FREEL_ICONS.zap)+'<span>'+msg+'</span>';
  document.body.appendChild(t);
  requestAnimationFrame(function(){t.classList.add('show');});
  setTimeout(function(){t.classList.remove('show');setTimeout(function(){t.remove();},250);},2600);
};

window.FreelForms=(function(){
  // chaque champ : [label, type, valeur/options, attrs]
  var F={
    salaire:{title:'Verser un salaire',icon:'wallet',cta:'Enregistrer le versement',fields:[
      ['Montant à verser','money',(window.FreelEtat?window.FreelEtat.eur(window.FreelEtat.versable()).replace(/\s*€/,''):'2 470')],['Date de versement','text','01/07/2026'],
      ['Compte de destination','select',['Compte perso · FR00 0000 … 0000 000','Livret pro']],['Note (facultatif)','text','']],
      foot:'Disponible ce mois : '+(window.FreelEtat?window.FreelEtat.eur(window.FreelEtat.dispo()):'4 940 €')+' · le compte perso destinataire se règle dans Config → Réserve & versements'},
    charge:{title:'Nouvelle charge',icon:'minus',cta:'Ajouter la charge',fields:[
      ['Libellé','text','Adobe Creative Cloud'],['Montant','money','62'],
      ['Catégorie','select',['Logiciels','Coworking','Matériel','Déplacements','Télécom','Autre']],
      ['Date','text','07/06/2026'],['Récurrente','toggle',true]],
      foot:'Les charges récurrentes sont reportées chaque mois dans la projection.'},
    facture:{title:'Nouvelle facture',icon:'doc',cta:'Générer la facture',fields:[
      ['Client','select',['Studio Lumen','Atelier Novak','Brasserie Vent d\'Ouest','+ Nouveau client']],
      ['Mission','select',['Refonte du site','Identité de marque','Carte & menus']],
      ['Montant HT','money','3 600'],['Date d\'émission','text','07/06/2026'],
      ['Échéance','select',['30 jours','15 jours','45 jours','À réception']]],
      foot:'N° 2026-028 · TVA non applicable, art. 293 B du CGI'},
    mission:{title:'Nouvelle mission',icon:'layers',cta:'Créer la mission',fields:[
      ['Nom de la mission','text','Refonte du site'],['Client','select',['Studio Lumen','Atelier Novak','+ Nouveau client']],
      ['TJM','money','520'],['Jours estimés','text','18'],['Début','text','01/07/2026']],
      foot:'Valeur estimée : 9 360 € · alimente le CA projeté.'},
    conge:{title:'Poser un congé',icon:'calendar',cta:'Enregistrer le congé',fields:[
      ['Du','text','10/06/2026'],['Au','text','12/06/2026'],
      ['Type','select',['Congé','RTT','Maladie','Indisponible']],['Demi-journée','toggle',false]],
      foot:'Les jours posés sont retirés du CA projeté et du taux d\'occupation.'},
    encaissement:{title:'Enregistrer un encaissement',icon:'up',cta:'Valider l\'encaissement',fields:[
      ['Facture liée','select',['#024 · Studio Lumen','#025 · Atelier Novak','Sans rattachement']],
      ['Montant reçu','money','1 200'],['Date','text','07/06/2026'],
      ['Mode','select',['Virement','Chèque','Espèces']]],
      foot:'L\'encaissement déclenche la base de cotisations URSSAF (déclaratif).'},
    devis:{title:'Nouveau devis',icon:'doc',cta:'Créer le devis',fields:[
      ['Client','select',['Studio Lumen','Atelier Novak','+ Nouveau client']],
      ['Objet','text','Prestation de design'],['Montant HT','money','4 200'],
      ['Validité','select',['30 jours','15 jours','60 jours']]],
      foot:'Un devis accepté se convertit en facture en un clic.'}
  };
  function buildField(f){
    var lbl='<label>'+f[0]+'</label>';
    if(f[1]==='money')return '<div class="field"><label>'+f[0]+'</label><div style="display:flex;align-items:center;gap:6px;background:var(--panel-2);border:1px solid var(--line-2);border-radius:9px;padding:10px 12px;"><input style="flex:1;background:none;border:none;color:var(--text);font-family:var(--mono);font-size:15px;font-weight:600;" value="'+f[2]+'"><span style="font-family:var(--mono);color:var(--muted);">€</span></div></div>';
    if(f[1]==='select')return '<div class="field">'+lbl+'<select>'+f[2].map(function(o){return '<option>'+o+'</option>';}).join('')+'</select></div>';
    if(f[1]==='toggle')return '<div class="toggle-lite"><span>'+f[0]+'</span><input type="checkbox" class="sw-mini"'+(f[2]?' checked':'')+'></div>';
    return '<div class="field">'+lbl+'<input type="text" value="'+(f[2]||'')+'" placeholder="'+f[0]+'"></div>';
  }
  function open(key){
    var c=F[key]; if(!c)return;
    var rows=c.fields.map(buildField);
    // grouper en paires sauf money/toggle large
    var html='<form onsubmit="return false" class="freel-form">';
    html+='<div class="form-grid">'+rows.join('')+'</div>';
    if(c.foot)html+='<p class="help" style="margin:16px 0 0;">'+c.foot+'</p>';
    html+='<div style="display:flex;gap:9px;margin-top:22px;"><button type="button" class="btn primary" style="flex:1;justify-content:center;" data-formok="'+c.cta+'">'+(FREEL_ICONS[c.icon]||'')+' '+c.cta+'</button><button type="button" class="btn" data-formcancel>Annuler</button></div>';
    html+='</form>';
    FreelSheet.open(c.title,html);
    var b=document.querySelector('[data-formok]'),x=document.querySelector('[data-formcancel]');
    if(b)b.addEventListener('click',function(){FreelSheet.close();FreelToast(b.dataset.formok+' — enregistré (maquette)','ok');});
    if(x)x.addEventListener('click',function(){FreelSheet.close();});
  }
  return {open:open};
})();

(function(){
  function init(){
    // 1) remplacer les jetons d'icônes $ICO_x$
    document.body.innerHTML = document.body.innerHTML.replace(/\$ICO_(\w+)\$/g,(m,k)=>FREEL_ICONS[k]||'');

    // 2) menus déroulants (.fab-wrap > button + .menu)
    document.querySelectorAll('.fab-wrap').forEach(w=>{
      const b=w.querySelector('button'), m=w.querySelector('.menu');
      if(!b||!m) return;
      b.addEventListener('click',e=>{
        e.stopPropagation();
        const open=m.classList.contains('open');
        document.querySelectorAll('.menu').forEach(x=>x.classList.remove('open'));
        m.classList.toggle('open',!open);
      });
    });
    document.addEventListener('click',()=>document.querySelectorAll('.menu').forEach(x=>x.classList.remove('open')));

    // 3) navigation mois (visuel)
    const cm=document.getElementById('curM');
    if(cm){
      const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      let mi=parseInt(cm.dataset.m||'5',10);
      const set=()=>cm.textContent=months[mi]+' 2026';
      const p=document.getElementById('prevM'), n=document.getElementById('nextM');
      if(p)p.addEventListener('click',()=>{mi=(mi+11)%12;set();});
      if(n)n.addEventListener('click',()=>{mi=(mi+1)%12;set();});
    }

    // 4) sous-onglets : [data-tabs] englobe .subtab + .tabpane
    document.querySelectorAll('[data-tabs]').forEach(group=>{
      const tabs=[...group.querySelectorAll('.subtab')];
      tabs.forEach(t=>t.addEventListener('click',()=>{
        tabs.forEach(x=>x.classList.remove('on'));
        t.classList.add('on');
        const key=t.dataset.tab;
        group.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('on',p.dataset.pane===key));
        window.scrollTo({top:0,behavior:'smooth'});
      }));
    });

    // 5) config : liste de sections cliquables
    document.querySelectorAll('[data-cfg]').forEach(group=>{
      const items=[...group.querySelectorAll('.cfg-item')];
      items.forEach(it=>it.addEventListener('click',()=>{
        items.forEach(x=>x.classList.remove('on'));
        it.classList.add('on');
        const key=it.dataset.cfg;
        group.querySelectorAll('.cfgpane').forEach(p=>p.classList.toggle('on',p.dataset.pane===key));
      }));
    });

    // 6) donuts déclaratifs (data-donut = conic-gradient complet)
    document.querySelectorAll('[data-donut]').forEach(d=>{ d.style.background=d.getAttribute('data-donut'); });

    // 7) tweaks
    const fn=document.getElementById('twFn');
    if(fn)fn.addEventListener('change',e=>document.body.classList.toggle('show-fn',e.target.checked));
    document.querySelectorAll('.sw').forEach(s=>s.addEventListener('click',()=>{
      document.querySelectorAll('.sw').forEach(x=>x.classList.remove('sel'));
      s.classList.add('sel');
      document.documentElement.style.setProperty('--green',s.dataset.h);
    }));

    // 8) mode Privacy — floute les montants .blurnum
    const pv=document.getElementById('privacyBtn');
    if(pv)pv.addEventListener('click',()=>{
      const on=document.body.classList.toggle('privacy');
      pv.innerHTML=(on?FREEL_ICONS.eyeoff:FREEL_ICONS.eye);
      pv.title=on?'Montants masqués':'Masquer les montants';
    });

    // 9) sélecteur d'année (multi-années) — visuel
    const yb=document.getElementById('yearBtn');
    if(yb){
      const yl=yb.querySelector('.yv');
      let y=parseInt(yl.textContent,10)||2026;
      yb.addEventListener('click',()=>{y=y>=2026?2024:y+1;yl.textContent=y;
        document.querySelectorAll('[data-year]').forEach(n=>n.textContent=y);});
    }

    // 10) déclencheurs de modale : [data-sheet] = id d'un <template>
    document.querySelectorAll('[data-sheet]').forEach(t=>t.addEventListener('click',function(e){
      e.preventDefault();
      const tpl=document.getElementById(t.dataset.sheet);
      if(tpl)FreelSheet.open(t.dataset.sheetTitle||'Détail',tpl.innerHTML);
    }));

    // 11) menus "+ Nouveau" → formulaire de saisie ; "Exporter" → toast
    document.querySelectorAll('[data-new]').forEach(t=>t.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();
      document.querySelectorAll('.menu').forEach(x=>x.classList.remove('open'));
      if(t.dataset.new==='conge'){ location.href='Activité - Plan de charge.html#conge'; return; }
      FreelForms.open(t.dataset.new);
    }));
    document.querySelectorAll('[data-export]').forEach(t=>t.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();
      document.querySelectorAll('.menu').forEach(x=>x.classList.remove('open'));
      FreelToast('Export « '+(t.dataset.exportLabel||t.dataset.export)+' » généré','ok');
    }));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
