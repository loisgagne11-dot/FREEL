/* ============================================================
   FREEL — Documents & saisie riche
   Trois vrais outils, à parité (et au-delà) de l'app de base :
     • FreelDocs.facture()  → éditeur de lignes + aperçu live + PDF téléchargeable
     • FreelDocs.cra()      → CRA jour-par-jour, aperçu + impression/PDF
     • FreelDocs.mission()  → assistant + échéancier de facturation
   Branché sur les menus « Nouveau » / « Exporter » (capture-phase,
   prioritaire sur FreelForms). Charger APRÈS freel.js.
   ============================================================ */
window.FreelDocs = (function(){
  'use strict';

  /* ---------- identité émettrice + clients ---------- */
  var ME = {
    nom:'Atelier L. — Loïs Mercier', activite:'Designer graphique · micro-entrepreneur',
    adr:'14 rue des Récollets, 75010 Paris', siret:'SIRET 912 457 881 00027',
    iban:'FR00 0000 0000 0000 0000 0000 000', email:'contact@atelier-demo.fr', tjm:520
  };
  var CLIENTS = {
    'Studio Lumen':       { adr:'8 quai de Seine, 75019 Paris',       siret:'SIRET 814 220 113 00018', contact:'compta@studiolumen.fr', delai:30 },
    'Atelier Novak':      { adr:'22 rue Oberkampf, 75011 Paris',      siret:'SIRET 790 551 402 00024', contact:'hello@ateliernovak.fr',  delai:60 },
    "Brasserie Vent d'Ouest":{ adr:'5 place du Marché, 44000 Nantes', siret:'SIRET 888 014 559 00012', contact:'gerance@ventdouest.fr',  delai:30 },
    'Maison Kessler':     { adr:'30 cours Mirabeau, 13100 Aix-en-Provence', siret:'SIRET 902 778 145 00031', contact:'studio@maisonkessler.fr', delai:30 }
  };
  var MISSIONS = {
    'Studio Lumen':['Refonte du site','Design system','Direction artistique'],
    'Atelier Novak':['Identité de marque','Charte éditoriale'],
    "Brasserie Vent d'Ouest":['Carte & menus','Signalétique'],
    'Maison Kessler':['Catalogue produits','Packaging']
  };

  /* ---------- utils ---------- */
  function eur(n){ return Math.round(n).toLocaleString('fr-FR').replace(/\u202f/g,'\u00a0') + '\u00a0€'; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function todayFR(){ return new Date(2026,5,10).toLocaleDateString('fr-FR'); }
  function addDays(base, d){ var x=new Date(base); x.setDate(x.getDate()+d); return x; }
  function frDate(d){ return d.toLocaleDateString('fr-FR'); }
  function opts(arr, sel){ return arr.map(function(o){ return '<option'+(o===sel?' selected':'')+'>'+esc(o)+'</option>'; }).join(''); }
  var ICO = (window.FREEL_ICONS||{});
  // filet de sécurité : icônes minimales si la page hôte ne les fournit pas
  (function(){
    var fb = {
      x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>',
      download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>',
      mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
      plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
      check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
      layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/></svg>',
      wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5"/><circle cx="17" cy="13" r="1.4" fill="currentColor"/></svg>',
      receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3v18l2-1.3L9 21l2-1.3L13 21l2-1.3L17 21l2-1.3V3l-2 1.3L15 3l-2 1.3L11 3 9 4.3 7 3Z"/><path d="M8 8h8M8 12h6"/></svg>',
      camera:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.2"/></svg>'
    };
    for(var k in fb){ if(!ICO[k]) ICO[k]=fb[k]; }
  })();

  /* ---------- styles injectés (indépendants de la page) ---------- */
  function injectCSS(){
    if (document.getElementById('freel-docs-css')) return;
    var s = document.createElement('style'); s.id='freel-docs-css';
    s.textContent = [
'.docscrim{position:fixed;inset:0;background:rgba(4,6,4,.68);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .2s;z-index:120;}',
'.docscrim.open{opacity:1;pointer-events:auto;}',
'.docmodal{position:fixed;top:50%;left:50%;transform:translate(-50%,-47%) scale(.985);opacity:0;pointer-events:none;width:min(1140px,96vw);height:min(880px,92vh);background:var(--panel);border:1px solid var(--line-2);border-radius:18px;box-shadow:0 44px 130px rgba(0,0,0,.62);z-index:121;display:flex;flex-direction:column;transition:opacity .2s,transform .2s;overflow:hidden;}',
'.docmodal.open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1);}',
'.docmodal-h{display:flex;align-items:center;gap:13px;padding:17px 22px;border-bottom:1px solid var(--line);flex-shrink:0;}',
'.docmodal-h .dico{width:30px;height:30px;border-radius:8px;background:var(--green-glow);color:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
'.docmodal-h .dico svg{width:16px;height:16px;}',
'.docmodal-h b{font-size:16px;letter-spacing:-.2px;}',
'.docmodal-h .dsub{font-size:12px;color:var(--muted);font-family:var(--mono);}',
'.docmodal-h .dx{margin-left:auto;width:32px;height:32px;border-radius:9px;border:1px solid var(--line-2);background:var(--panel-2);color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer;}',
'.docmodal-h .dx:hover{color:var(--text);background:var(--panel-3);}.docmodal-h .dx svg{width:15px;height:15px;}',
'.docmodal-body{display:grid;grid-template-columns:374px minmax(0,1fr);flex:1;min-height:0;overflow:hidden;}',
'.doc-form{padding:20px 22px 28px;overflow-y:auto;border-right:1px solid var(--line);}',
'.doc-form .seclbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted-2);margin:20px 0 11px;}.doc-form .seclbl:first-child{margin-top:0;}',
'.doc-preview{padding:26px;overflow-y:auto;background:var(--bg);display:flex;justify-content:center;align-items:flex-start;}',
'.docmodal-foot{display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid var(--line);flex-shrink:0;background:var(--panel);}',
'.docmodal-foot .ftnote{font-size:12px;color:var(--muted);margin-right:auto;line-height:1.4;}',
'.docmodal-foot .ftnote b{color:var(--text);}',
'.frow2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
'.liners{display:flex;flex-direction:column;gap:8px;margin-bottom:10px;}',
'.liner{display:grid;grid-template-columns:1fr 54px 76px 26px;gap:7px;align-items:center;}',
'.liner input{background:var(--panel-2);border:1px solid var(--line-2);border-radius:8px;padding:8px 9px;color:var(--text);font-family:inherit;font-size:12.5px;width:100%;}',
'.liner input:focus{outline:none;border-color:var(--green);}',
'.liner .lqty,.liner .lpu{font-family:var(--mono);text-align:right;}',
'.liner .lrm{width:26px;height:30px;border:1px solid var(--line-2);border-radius:7px;background:var(--panel-2);color:var(--muted-2);cursor:pointer;display:flex;align-items:center;justify-content:center;}',
'.liner .lrm:hover{color:var(--red);border-color:rgba(226,113,95,.4);}.liner .lrm svg{width:13px;height:13px;}',
'.liner-head{display:grid;grid-template-columns:1fr 54px 76px 26px;gap:7px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-2);margin-bottom:3px;}',
'.liner-head span:nth-child(2),.liner-head span:nth-child(3){text-align:right;}',
'.addline{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--green);background:var(--green-glow);border:1px solid rgba(84,207,145,.25);border-radius:8px;padding:7px 11px;cursor:pointer;font-family:inherit;}',
'.addline svg{width:13px;height:13px;}',
'.doc-tot{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:13px;border-top:1px solid var(--line);}',
'.doc-tot .tl{font-size:13px;color:var(--muted);}.doc-tot .tv{font-family:var(--mono);font-size:21px;font-weight:700;color:var(--green);}',
'.dchips{display:flex;flex-wrap:wrap;gap:7px;}',
'.dchip{font-size:12px;padding:7px 11px;border-radius:9px;border:1px solid var(--line-2);background:var(--panel-2);color:var(--muted);cursor:pointer;user-select:none;font-family:inherit;}',
'.dchip.on{border-color:var(--green);background:var(--green-glow);color:var(--green);}',
'.estbox{background:var(--panel-2);border:1px solid var(--line-2);border-radius:12px;padding:14px 16px;margin-top:6px;}',
'.estbox .er{display:flex;align-items:baseline;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px;}',
'.estbox .er:last-child{border-bottom:0;}.estbox .er b{font-family:var(--mono);}',
'.estbox .er .big{font-size:18px;font-weight:700;color:var(--green);}',
/* ---- paper ---- */
'.paper{background:#fcfcfa;color:#1d1d1b;width:100%;max-width:600px;border-radius:6px;box-shadow:0 12px 40px rgba(0,0,0,.4);padding:42px 44px;font-size:12.5px;line-height:1.55;}',
'.paper *{box-sizing:border-box;}',
'.paper .ph{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:30px;}',
'.paper .pbrand{font-size:19px;font-weight:800;letter-spacing:-.5px;color:#111;}',
'.paper .pbrand i{color:#2e9e6b;font-style:normal;}',
'.paper .pmeta{font-size:11px;color:#6a6a66;margin-top:5px;line-height:1.5;}',
'.paper .pdoc{text-align:right;flex-shrink:0;}',
'.paper .pdoc .dt{font-size:22px;font-weight:800;letter-spacing:-.5px;color:#111;text-transform:uppercase;}',
'.paper .pdoc .dn{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#2e9e6b;margin-top:3px;}',
'.paper .pdoc .dd{font-size:11px;color:#6a6a66;margin-top:7px;line-height:1.6;}',
'.paper .pto{background:#f1f1ec;border-radius:7px;padding:13px 15px;margin-bottom:24px;}',
'.paper .pto .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:#8a8a85;margin-bottom:4px;}',
'.paper .pto .nm{font-weight:700;font-size:13.5px;color:#111;}',
'.paper .pto .ad{font-size:11px;color:#6a6a66;margin-top:2px;}',
'.paper table.pt{width:100%;border-collapse:collapse;margin-bottom:8px;}',
'.paper table.pt th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a85;border-bottom:1.5px solid #1d1d1b;padding:0 0 7px;}',
'.paper table.pt th.n,.paper table.pt td.n{text-align:right;font-family:ui-monospace,Menlo,monospace;}',
'.paper table.pt td{padding:9px 0;border-bottom:1px solid #e6e6e0;vertical-align:top;}',
'.paper table.pt td .d2{font-size:10.5px;color:#8a8a85;margin-top:2px;}',
'.paper .ptot{margin-left:auto;width:58%;margin-top:14px;}',
'.paper .ptot .r{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;}',
'.paper .ptot .r.grand{border-top:1.5px solid #1d1d1b;margin-top:5px;padding-top:10px;font-size:15px;font-weight:800;color:#111;}',
'.paper .ptot .r .v{font-family:ui-monospace,Menlo,monospace;}',
'.paper .pnote{clear:both;margin-top:26px;padding-top:16px;border-top:1px solid #e6e6e0;font-size:10.5px;color:#6a6a66;line-height:1.7;}',
'.paper .pnote b{color:#1d1d1b;}',
'.paper .craday{display:grid;grid-template-columns:80px 1fr 56px;gap:10px;padding:7px 0;border-bottom:1px solid #ececec;font-size:11.5px;}',
'.paper .craday .cdd{color:#6a6a66;}.paper .craday .cvv{text-align:right;font-family:ui-monospace,Menlo,monospace;}',
'.paper .cratot{display:grid;grid-template-columns:80px 1fr 56px;gap:10px;padding:11px 0 0;font-weight:800;color:#111;}',
'.paper .crasign{display:flex;gap:30px;margin-top:34px;}',
'.paper .crasign .sg{flex:1;font-size:10.5px;color:#8a8a85;}',
'.paper .crasign .sg .ln{height:50px;border:1px dashed #c8c8c0;border-radius:6px;margin-top:6px;}',
'@media print{body{background:#fff;margin:0;}.paper{box-shadow:none;max-width:none;border-radius:0;padding:24mm 20mm;}}',
/* ---- encaissement list ---- */
'.paylist{display:flex;flex-direction:column;gap:9px;}',
'.payrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line-2);border-radius:13px;background:var(--panel-2);padding:13px 15px;transition:border-color .14s;}',
'.payrow:hover{border-color:var(--line);}',
'.payrow.done{opacity:.62;}',
'.payrow.draft{opacity:.7;border-style:dashed;}',
'.payrow .pav{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#06140d;flex-shrink:0;}',
'.payrow .pinfo{flex:1;min-width:120px;}',
'.payrow .pinfo b{font-size:13.5px;font-weight:600;display:block;}',
'.payrow .pinfo span{font-size:11.5px;color:var(--muted);}',
'.payrow .pamt{font-family:var(--mono);font-size:14.5px;font-weight:700;}',
'.payrow .pamt.ok{color:var(--green);}',
'.payrow .pbtn{appearance:none;border:1px solid var(--green);background:var(--green-glow);color:var(--green);font-family:inherit;font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:9px;cursor:pointer;white-space:nowrap;}',
'.payrow .pbtn:hover{background:rgba(84,207,145,.18);}',
'.payrow .pbtn.undo{border-color:var(--line-2);background:var(--panel-3);color:var(--muted);}',
'.payrow .pbtn.ghost{border:1px dashed var(--line-2);background:none;color:var(--muted-2);cursor:default;}',
'.payrow .payedit{display:none;flex-basis:100%;width:100%;border-top:1px solid var(--line);margin-top:4px;padding-top:13px;gap:12px;flex-direction:column;}',
'.payrow.editing .payedit{display:flex;}',
'.payrow.editing .pbtn[data-pay]{display:none;}',
'.payedit .pe-row{display:flex;align-items:center;gap:12px;}',
'.payedit .pe-row label{font-size:12px;color:var(--muted);width:148px;flex-shrink:0;}',
'.payedit .pe-row input,.payedit .pe-row select{flex:1;background:var(--panel);border:1px solid var(--line-2);border-radius:8px;padding:8px 11px;color:var(--text);font-family:inherit;font-size:13px;}',
'.payedit .pe-foot{display:flex;justify-content:flex-end;gap:9px;}',
/* ---- charge photo drop ---- */
'.photodrop{display:block;border:1.5px dashed var(--line-2);border-radius:14px;background:var(--panel-2);min-height:150px;cursor:pointer;overflow:hidden;position:relative;transition:border-color .14s;}',
'.photodrop:hover{border-color:var(--green);}',
'.photodrop .pd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:30px 16px;text-align:center;min-height:150px;}',
'.photodrop .pd-ic{width:38px;height:38px;border-radius:11px;background:var(--panel-3);color:var(--muted);display:flex;align-items:center;justify-content:center;}',
'.photodrop .pd-ic svg{width:19px;height:19px;}',
'.photodrop .pd-empty b{font-size:13px;font-weight:600;color:var(--text);}',
'.photodrop .pd-empty span{font-size:11.5px;color:var(--muted);}',
'.photodrop .pd-img{width:100%;display:block;}',
'.crecup-toggle{display:flex;align-items:center;gap:9px;margin-top:16px;font-size:13px;font-weight:600;cursor:pointer;}',
'.liver-head{display:grid;grid-template-columns:72px 1fr 26px;gap:7px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-2);margin-bottom:3px;}',
'.livers{display:flex;flex-direction:column;gap:7px;margin-bottom:10px;}',
'.liver{display:grid;grid-template-columns:72px 1fr 26px;gap:7px;align-items:center;}',
'.liver input{background:var(--panel-2);border:1px solid var(--line-2);border-radius:8px;padding:8px 9px;color:var(--text);font-family:inherit;font-size:12.5px;width:100%;}',
'.liver input:focus{outline:none;border-color:var(--green);}',
'.liver .lv-lot{font-family:var(--mono);font-size:11.5px;}',
'.liver .lrm{width:26px;height:30px;border:1px solid var(--line-2);border-radius:7px;background:var(--panel-2);color:var(--muted-2);cursor:pointer;display:flex;align-items:center;justify-content:center;}',
'.liver .lrm:hover{color:var(--red);border-color:rgba(226,113,95,.4);}.liver .lrm svg{width:13px;height:13px;}',
/* ---- mission éditeur ---- */
'.autobox{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--green-glow);border:1px solid rgba(84,207,145,.28);border-radius:11px;padding:11px 14px;font-size:12.5px;color:var(--muted);}',
'.autobox b{font-family:var(--mono);font-size:16px;color:var(--green);}',
'.pipe4{display:flex;gap:0;border:1px solid var(--line-2);border-radius:10px;overflow:hidden;}',
'.pseg{flex:1;appearance:none;border:none;border-right:1px solid var(--line-2);background:var(--panel-2);color:var(--muted);font-family:inherit;font-size:12px;font-weight:600;padding:9px 4px;cursor:pointer;}',
'.pseg:last-child{border-right:none;}',
'.pseg.on{background:var(--green-glow);color:var(--green);box-shadow:inset 0 -2px 0 var(--green);}',
'.pseg.lost.on{background:var(--red-soft);color:var(--red);box-shadow:inset 0 -2px 0 var(--red);}',
'.wdays{display:flex;gap:5px;margin-bottom:12px;}',
'.wd{width:30px;height:30px;border-radius:8px;border:1px solid var(--line-2);background:var(--panel-2);color:var(--muted);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;}',
'.wd.on{border-color:var(--green);background:var(--green-glow);color:var(--green);}',
'.wd.we{opacity:.5;}',
'.seg-head{display:grid;grid-template-columns:1.1fr 1.2fr 70px 56px 80px;gap:8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-2);padding:0 2px 6px;}',
'.segs{display:flex;flex-direction:column;gap:6px;}',
'.segrow{display:grid;grid-template-columns:1.1fr 1.2fr 70px 56px 80px;gap:8px;align-items:center;}',
'.segrow .segm{font-size:12.5px;font-weight:600;}',
'.segrow select,.segrow input{background:var(--panel-2);border:1px solid var(--line-2);border-radius:7px;padding:7px 8px;color:var(--text);font-family:inherit;font-size:12px;width:100%;}',
'.segrow input{font-family:var(--mono);text-align:right;}',
'.segrow select:focus,.segrow input:focus{outline:none;border-color:var(--green);}',
'.segrow .seg-j{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right;}',
'.segrow .seg-ca{font-family:var(--mono);font-size:12.5px;font-weight:700;color:var(--green);text-align:right;}',
'.reps{display:flex;flex-direction:column;gap:7px;margin-bottom:10px;}',
'.reprow{display:grid;grid-template-columns:1fr 64px auto 26px;gap:8px;align-items:center;}',
'.reprow select{background:var(--panel-2);border:1px solid var(--line-2);border-radius:7px;padding:8px 9px;color:var(--text);font-family:inherit;font-size:12.5px;}',
'.reprow input{background:var(--panel-2);border:1px solid var(--line-2);border-radius:7px;padding:8px 9px;color:var(--text);font-family:var(--mono);font-size:12.5px;text-align:right;}',
'.reprow .lrm{width:26px;height:30px;border:1px solid var(--line-2);border-radius:7px;background:var(--panel-2);color:var(--muted-2);cursor:pointer;display:flex;align-items:center;justify-content:center;}',
'.reprow .lrm:hover{color:var(--red);}.reprow .lrm svg{width:13px;height:13px;}',
'.crecup-toggle input{accent-color:var(--green);width:16px;height:16px;cursor:pointer;}',
'.docmodal.wide{width:min(1180px,97vw);}',
'@media(max-width:840px){.docmodal-body{grid-template-columns:1fr;}.doc-preview{display:none;}.docmodal.wide .doc-preview{display:block;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ---------- modale ---------- */
  var scrim, modal, builtModal=false;
  function buildModal(){
    scrim=document.createElement('div'); scrim.className='docscrim';
    modal=document.createElement('div'); modal.className='docmodal'; modal.setAttribute('role','dialog');
    modal.innerHTML =
      '<div class="docmodal-h"><span class="dico"></span><div><b class="dtitle"></b> <span class="dsub"></span></div><button class="dx" aria-label="Fermer">'+(ICO.x||'×')+'</button></div>'+
      '<div class="docmodal-body"><div class="doc-form"></div><div class="doc-preview"></div></div>'+
      '<div class="docmodal-foot"></div>';
    document.body.appendChild(scrim); document.body.appendChild(modal);
    scrim.addEventListener('click', close);
    modal.querySelector('.dx').addEventListener('click', close);
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal.classList.contains('open')) close(); });
    builtModal=true;
  }
  function open(cfg){
    injectCSS(); if(!builtModal) buildModal();
    modal.querySelector('.dico').innerHTML = ICO[cfg.icon]||'';
    modal.querySelector('.dtitle').textContent = cfg.title;
    modal.querySelector('.dsub').textContent = cfg.sub||'';
    modal.querySelector('.doc-form').innerHTML = cfg.form;
    modal.querySelector('.doc-preview').innerHTML = '<div class="paper"></div>';
    modal.querySelector('.docmodal-foot').innerHTML = cfg.foot;
    modal.classList.toggle('wide', !!cfg.wide);
    requestAnimationFrame(function(){ scrim.classList.add('open'); modal.classList.add('open'); });
    if (cfg.wire) cfg.wire(modal);
  }
  function close(){ if(!builtModal) return; scrim.classList.remove('open'); modal.classList.remove('open'); }
  function paperEl(){ return modal.querySelector('.paper'); }
  function $(sel){ return modal.querySelector(sel); }
  function $all(sel){ return [].slice.call(modal.querySelectorAll(sel)); }

  /* ---------- téléchargement / impression ---------- */
  function standalone(title, inner){
    var css = document.getElementById('freel-docs-css').textContent;
    // ne garder que les règles .paper / @media pour le document autonome
    return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>'+esc(title)+
      '</title><style>body{margin:0;padding:24px;background:#33352f;font-family:\'Hanken Grotesk\',system-ui,sans-serif;display:flex;justify-content:center;}'+css+'</style></head><body>'+inner+'</body></html>';
  }
  function download(filename, title, inner){
    var blob = new Blob([standalone(title, inner)], {type:'text/html'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ a.remove(); URL.revokeObjectURL(url); }, 120);
    if (window.FreelToast) FreelToast(filename+' téléchargé', 'ok');
  }
  function printDoc(title, inner){
    var f=document.createElement('iframe');
    f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(f);
    var d=f.contentWindow.document; d.open(); d.write(standalone(title, inner)); d.close();
    setTimeout(function(){ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ if(window.FreelToast) FreelToast('Impression bloquée — utilise « Télécharger »','warn'); } setTimeout(function(){ f.remove(); }, 1500); }, 350);
  }

  /* ============================================================
     1) FACTURE — éditeur de lignes + aperçu live + PDF
     ============================================================ */
  function invoiceHTML(d){
    var rows = d.lines.map(function(l){
      var amt = (l.qty||0)*(l.pu||0);
      return '<tr><td><b>'+esc(l.label||'—')+'</b>'+(l.sub?'<div class="d2">'+esc(l.sub)+'</div>':'')+'</td>'+
             '<td class="n">'+(l.qty||0).toLocaleString('fr-FR')+'</td>'+
             '<td class="n">'+eur(l.pu||0)+'</td>'+
             '<td class="n">'+eur(amt)+'</td></tr>';
    }).join('');
    var total = d.lines.reduce(function(s,l){ return s+(l.qty||0)*(l.pu||0); }, 0);
    var cl = CLIENTS[d.client]||{adr:'',siret:'',delai:30};
    return ''+
    '<div class="ph"><div><div class="pbrand">Atelier&nbsp;<i>L.</i></div>'+
      '<div class="pmeta">'+esc(ME.activite)+'<br>'+esc(ME.adr)+'<br>'+esc(ME.siret)+'</div></div>'+
      '<div class="pdoc"><div class="dt">Facture</div><div class="dn">'+esc(d.num)+'</div>'+
        '<div class="dd">Émise le '+esc(d.dateEmis)+'<br>Échéance '+esc(d.dateEch)+'<br>'+esc(d.periode)+'</div></div></div>'+
    '<div class="pto"><div class="k">Facturé à</div><div class="nm">'+esc(d.client)+'</div>'+
      '<div class="ad">'+esc(cl.adr)+(cl.siret?' · '+esc(cl.siret):'')+'</div></div>'+
    '<table class="pt"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">P.U. HT</th><th class="n">Total HT</th></tr></thead>'+
      '<tbody>'+(rows||'<tr><td colspan="4" style="color:#aaa;padding:18px 0;">Aucune ligne</td></tr>')+'</tbody></table>'+
    '<div class="ptot"><div class="r"><span>Total HT</span><span class="v">'+eur(total)+'</span></div>'+
      '<div class="r"><span>TVA (franchise)</span><span class="v">—</span></div>'+
      '<div class="r grand"><span>Net à payer</span><span class="v">'+eur(total)+'</span></div></div>'+
    '<div class="pnote"><b>TVA non applicable, art.&nbsp;293&nbsp;B du CGI.</b> Règlement par virement sous '+cl.delai+' jours — IBAN '+esc(ME.iban)+'.<br>'+
      'Pénalités de retard : 3× le taux d\'intérêt légal. Indemnité forfaitaire de recouvrement : 40&nbsp;€. Pas d\'escompte pour paiement anticipé.</div>';
  }

  function facture(prefill){
    prefill = prefill||{};
    var client = prefill.client || 'Studio Lumen';
    var state = {
      client: client,
      num: prefill.num || '2026-028',
      dateEmis: todayFR(),
      periode: prefill.periode || 'Juin 2026',
      lines: prefill.lines || [
        { label:'Refonte du site — intégration', sub:'régie · TJM 520 €', qty:6, pu:520 },
        { label:'Responsive & recette', sub:'régie · TJM 520 €', qty:1.5, pu:520 }
      ]
    };
    function dEch(){ var cl=CLIENTS[state.client]||{delai:30}; return frDate(addDays(new Date(2026,5,10), cl.delai)); }
    function data(){ return { client:state.client, num:state.num, dateEmis:state.dateEmis, dateEch:dEch(), periode:state.periode, lines:state.lines }; }

    function linerRows(){
      return state.lines.map(function(l,i){
        return '<div class="liner" data-i="'+i+'">'+
          '<input class="llabel" value="'+esc(l.label)+'" placeholder="Désignation">'+
          '<input class="lqty" value="'+l.qty+'" inputmode="decimal">'+
          '<input class="lpu" value="'+l.pu+'" inputmode="decimal">'+
          '<button class="lrm" title="Retirer">'+(ICO.trash||'×')+'</button></div>';
      }).join('');
    }
    function formHTML(){
      return ''+
      '<div class="seclbl">Client & période</div>'+
      '<div class="field"><label>Client</label><select class="fClient">'+opts(Object.keys(CLIENTS), state.client)+'</select></div>'+
      '<div class="frow2"><div class="field"><label>N° de facture</label><input class="fNum" value="'+esc(state.num)+'"></div>'+
        '<div class="field"><label>Période</label><input class="fPer" value="'+esc(state.periode)+'"></div></div>'+
      '<div class="seclbl">Lignes de prestation</div>'+
      '<div class="liner-head"><span>Désignation</span><span>Qté (j)</span><span>P.U. HT</span><span></span></div>'+
      '<div class="liners">'+linerRows()+'</div>'+
      '<button class="addline">'+(ICO.plus||'+')+' Ajouter une ligne</button>'+
      '<div class="doc-tot"><span class="tl">Total HT · franchise TVA</span><span class="tv fTotal"></span></div>';
    }
    function render(){
      paperEl().innerHTML = invoiceHTML(data());
      var total = state.lines.reduce(function(s,l){ return s+(l.qty||0)*(l.pu||0); }, 0);
      var ft=$('.fTotal'); if(ft) ft.textContent = eur(total);
    }
    function rebindLines(){
      $('.liners').innerHTML = linerRows();
      $all('.liner').forEach(bindLiner);
      render();
    }
    function bindLiner(row){
      var i = +row.dataset.i;
      row.querySelector('.llabel').addEventListener('input', function(e){ state.lines[i].label=e.target.value; render(); });
      row.querySelector('.lqty').addEventListener('input', function(e){ state.lines[i].qty=parseFloat(e.target.value.replace(',','.'))||0; render(); });
      row.querySelector('.lpu').addEventListener('input', function(e){ state.lines[i].pu=parseFloat(e.target.value.replace(',','.'))||0; render(); });
      row.querySelector('.lrm').addEventListener('click', function(){ if(state.lines.length>1){ state.lines.splice(i,1); rebindLines(); } });
    }
    open({
      icon:'doc', title:'Nouvelle facture', sub:state.num,
      form: formHTML(),
      foot: '<span class="ftnote"><b>TVA non applicable</b>, art. 293 B du CGI · échéance auto selon le client</span>'+
        '<button class="btn" data-act="draft">Enregistrer brouillon</button>'+
        '<button class="btn" data-act="print">'+(ICO.doc||'')+' Imprimer</button>'+
        '<button class="btn primary" data-act="dl">'+(ICO.download||'')+' Télécharger le PDF</button>',
      wire: function(m){
        $('.fClient').addEventListener('change', function(e){ state.client=e.target.value; m.querySelector('.dsub').textContent=state.num; render(); });
        $('.fNum').addEventListener('input', function(e){ state.num=e.target.value; m.querySelector('.dsub').textContent=state.num; render(); });
        $('.fPer').addEventListener('input', function(e){ state.periode=e.target.value; render(); });
        $('.addline').addEventListener('click', function(){ state.lines.push({label:'',sub:'',qty:1,pu:ME.tjm}); rebindLines(); });
        $all('.liner').forEach(bindLiner);
        m.querySelector('.docmodal-foot').addEventListener('click', function(e){
          var b=e.target.closest('[data-act]'); if(!b) return; var a=b.dataset.act;
          var fname = 'Facture_'+state.num+'_'+state.client.replace(/[^a-z0-9]+/gi,'-')+'.html';
          if(a==='dl') download(fname, 'Facture '+state.num, '<div class="paper">'+invoiceHTML(data())+'</div>');
          if(a==='print') printDoc('Facture '+state.num, '<div class="paper">'+invoiceHTML(data())+'</div>');
          if(a==='draft'){ if(window.FreelToast) FreelToast('Facture '+state.num+' enregistrée en brouillon','ok'); close(); }
        });
        render();
      }
    });
  }

  /* ============================================================
     2) CRA — synthèse hebdomadaire (suivi d'activité, sans montants)
     ============================================================ */
  function cra(prefill){
    prefill = prefill||{};
    var CLIST = Object.keys(MISSIONS);
    var c1 = CLIST[0]||'Client A', c2 = CLIST[1]||c1;
    var state = { mois:'Juin 2026', weeks:[
      {label:'Semaine 1', range:'01 → 05 juin', rows:[{client:c1,tt:2,site:1},{client:c2,tt:1.5,site:0}], tasks:'Intégration des maquettes accueil · kickoff refonte catalogue'},
      {label:'Semaine 2', range:'08 → 12 juin', rows:[{client:c1,tt:3,site:1},{client:c2,tt:1,site:0}], tasks:'Responsive & recette · itérations design fiches produit'},
      {label:'Semaine 3', range:'15 → 19 juin', rows:[{client:c1,tt:2,site:2},{client:c2,tt:0,site:1}], tasks:'Direction artistique · atelier recette client sur site'},
      {label:'Semaine 4', range:'22 → 26 juin', rows:[{client:c1,tt:2.5,site:0},{client:c2,tt:1,site:0}], tasks:'Préparation des livrables · corrections finales'}
    ]};
    var G = 'grid-template-columns:86px 1fr 62px 62px 64px;';
    function fj(n){ return n.toLocaleString('fr-FR'); }
    function wTotal(w){ return w.rows.reduce(function(s,r){ return s+r.tt+r.site; },0); }
    function perClient(){
      var map={};
      state.weeks.forEach(function(w){ w.rows.forEach(function(r){
        if(!map[r.client]) map[r.client]={tt:0,site:0};
        map[r.client].tt+=r.tt; map[r.client].site+=r.site;
      });});
      return map;
    }
    function grand(){ var m=perClient(), t=0; Object.keys(m).forEach(function(k){ t+=m[k].tt+m[k].site; }); return t; }

    function craHTML(){
      var head = '<div class="craday" style="'+G+'font-weight:800;color:#111;border-bottom:1.5px solid #1d1d1b;"><span>Semaine</span><span>Client</span><span class="cvv">Télétrav.</span><span class="cvv">Sur site</span><span class="cvv">Total</span></div>';
      var wk = state.weeks.map(function(w){
        var lines = w.rows.filter(function(r){ return r.tt+r.site>0; }).map(function(r){
          return '<div class="craday" style="'+G+'"><span class="cdd"></span><span>'+esc(r.client)+'</span><span class="cvv">'+fj(r.tt)+' j</span><span class="cvv">'+fj(r.site)+' j</span><span class="cvv" style="font-weight:700;">'+fj(r.tt+r.site)+' j</span></div>';
        }).join('');
        return '<div class="craday" style="'+G+'font-weight:700;color:#111;background:#f6f6f2;"><span class="cdd">'+esc(w.label)+'</span><span>'+esc(w.range)+'</span><span class="cvv"></span><span class="cvv"></span><span class="cvv">'+fj(wTotal(w))+' j</span></div>'+
          lines+
          (w.tasks?'<div style="padding:4px 0 10px 96px;font-size:10.5px;color:#6a6a66;font-style:italic;border-bottom:1px solid #ececec;">Tâches — '+esc(w.tasks)+'</div>':'');
      }).join('');
      var pc = perClient();
      var tot = Object.keys(pc).map(function(k){
        return '<div class="craday" style="'+G+'"><span class="cdd"></span><span style="font-weight:700;">'+esc(k)+'</span><span class="cvv">'+fj(pc[k].tt)+' j</span><span class="cvv">'+fj(pc[k].site)+' j</span><span class="cvv" style="font-weight:700;">'+fj(pc[k].tt+pc[k].site)+' j</span></div>';
      }).join('');
      return ''+
      '<div class="ph"><div><div class="pbrand">Atelier&nbsp;<i>L.</i></div>'+
        '<div class="pmeta">'+esc(ME.activite)+'<br>'+esc(ME.adr)+'</div></div>'+
        '<div class="pdoc"><div class="dt" style="font-size:17px;">Compte-rendu d\'activité</div><div class="dn">'+esc(state.mois)+'</div>'+
          '<div class="dd">Synthèse hebdomadaire<br>Tous clients</div></div></div>'+
      head + wk +
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a85;font-weight:700;margin:18px 0 4px;">Totaux du mois par client</div>'+
      tot+
      '<div class="cratot" style="'+G+'"><span></span><span>Grand total · '+esc(state.mois)+'</span><span class="cvv"></span><span class="cvv"></span><span style="text-align:right;font-family:ui-monospace,monospace;">'+fj(grand())+' j</span></div>'+
      '<div class="pnote">Suivi d\'activité uniquement — <b>aucun montant</b> : la facturation (TJM, €) se fait depuis les factures.</div>'+
      '<div class="crasign"><div class="sg">Validé par le prestataire<div class="ln"></div></div><div class="sg">Bon pour accord — client(s)<div class="ln"></div></div></div>';
    }

    var IN = 'style="background:var(--panel-2);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:6px 8px;font-size:12.5px;width:100%;"';
    function formHTML(){
      return ''+
      '<div class="field"><label>Mois</label><select class="cMois">'+opts(['Juin 2026','Mai 2026','Avril 2026'], state.mois)+'</select></div>'+
      state.weeks.map(function(w,wi){
        return '<div class="seclbl mt">'+esc(w.label)+' <span style="text-transform:none;letter-spacing:0;color:var(--muted);font-weight:400;">'+esc(w.range)+'</span></div>'+
          '<div style="display:grid;grid-template-columns:1fr 72px 72px;gap:8px;font-size:10px;letter-spacing:.05em;color:var(--muted-2);text-transform:uppercase;margin-bottom:5px;"><span></span><span>Télétrav.</span><span>Sur site</span></div>'+
          w.rows.map(function(r,ri){
            return '<div style="display:grid;grid-template-columns:1fr 72px 72px;gap:8px;margin-bottom:6px;align-items:center;">'+
              '<span style="font-size:12.5px;">'+esc(r.client)+'</span>'+
              '<input class="cIn" data-w="'+wi+'" data-r="'+ri+'" data-k="tt" type="number" step="0.5" min="0" max="5" value="'+r.tt+'" '+IN+'>'+
              '<input class="cIn" data-w="'+wi+'" data-r="'+ri+'" data-k="site" type="number" step="0.5" min="0" max="5" value="'+r.site+'" '+IN+'>'+
            '</div>';
          }).join('')+
          '<div class="field"><label>Tâches accomplies</label><textarea class="cTask" data-w="'+wi+'" rows="2" '+IN+'>'+esc(w.tasks)+'</textarea></div>';
      }).join('')+
      '<div class="estbox" style="margin-top:16px;"><div class="er"><span>Total du mois</span><b class="cTot"></b></div></div>';
    }
    function render(){
      paperEl().innerHTML = craHTML();
      var a=$('.cTot'); if(a) a.textContent = fj(grand())+' j';
    }
    open({
      icon:'doc', title:'Compte-rendu d\'activité', sub:'synthèse hebdomadaire · '+state.mois,
      form: formHTML(),
      foot:'<span class="ftnote">Synthèse <b>par semaine</b> reprise du calendrier · suivi d\'activité, sans montants</span>'+
        '<button class="btn" data-act="send">'+(ICO.mail||'')+' Envoyer</button>'+
        '<button class="btn" data-act="print">'+(ICO.doc||'')+' Imprimer</button>'+
        '<button class="btn primary" data-act="dl">'+(ICO.download||'')+' Télécharger le PDF</button>',
      wire:function(m){
        $all('.cIn').forEach(function(inp){ inp.addEventListener('input', function(){
          var w=+inp.dataset.w, r=+inp.dataset.r, k=inp.dataset.k;
          state.weeks[w].rows[r][k] = Math.max(0, parseFloat(inp.value)||0);
          render();
        }); });
        $all('.cTask').forEach(function(ta){ ta.addEventListener('input', function(){
          state.weeks[+ta.dataset.w].tasks = ta.value; render();
        }); });
        $('.cMois').addEventListener('change', function(e){ state.mois=e.target.value; m.querySelector('.dsub').textContent='synthèse hebdomadaire · '+state.mois; render(); });
        m.querySelector('.docmodal-foot').addEventListener('click', function(e){
          var b=e.target.closest('[data-act]'); if(!b) return; var a=b.dataset.act;
          var fname='CRA_'+state.mois.replace(' ','-')+'.html';
          if(a==='dl') download(fname,'CRA '+state.mois,'<div class="paper">'+craHTML()+'</div>');
          if(a==='print') printDoc('CRA '+state.mois,'<div class="paper">'+craHTML()+'</div>');
          if(a==='send'){ if(window.FreelToast) FreelToast('CRA '+state.mois+' envoyé','ok'); close(); }
        });
        render();
      }
    });
  }

  /* ============================================================
     3) MISSION — éditeur fidèle (6 blocs, CA toujours calculé)
        Principe : on ne saisit JAMAIS un nombre de jours —
        l'app compte les jours ouvrés de la période × le rythme.
     ============================================================ */
  function parseFR(str){ var m=(str||'').split('/'); var y=+m[2]; if(y<100)y+=2000; return new Date(y||2026,(+m[1]||1)-1,+m[0]||1); }
  function monthsBetween(d1,d2){
    var out=[], cur=new Date(d1.getFullYear(), d1.getMonth(), 1);
    while(cur<=d2){
      var y=cur.getFullYear(), mo=cur.getMonth();
      var first=new Date(y,mo,1), last=new Date(y,mo+1,0);
      var lo=d1>first?d1:first, hi=d2<last?d2:last, wd=0, dd=new Date(lo);
      while(dd<=hi){ var w=dd.getDay(); if(w>=1&&w<=5)wd++; dd.setDate(dd.getDate()+1); }
      out.push({ key:y+'-'+(mo+1), label:MONTHS_FR[mo]+' '+String(y).slice(2), wd:wd });
      cur.setMonth(cur.getMonth()+1);
    }
    return out;
  }
  var MONTHS_FR=['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
  var RYTHMES=['Temps plein','Mi-temps','Jours précis'];

  function mission(prefill){
    prefill = prefill||{};
    var state = {
      nom: prefill.nom || 'Refonte du site',
      client: prefill.client || 'Studio Lumen',
      model: prefill.model || 'Régie',          // Régie · TJM | Forfait | Par lots
      tjm: prefill.tjm || ME.tjm,
      forfait: prefill.forfait || 9360,
      lots: prefill.lots || [ {nom:'Cadrage & maquettes', montant:3600}, {nom:'Intégration', montant:4200}, {nom:'Recette & mise en ligne', montant:1560} ],
      debut: prefill.debut || '01/05/2026',
      fin: prefill.fin || '31/07/2026',
      statut: prefill.statut || 'Active',
      weekdays: prefill.weekdays || {1:true,2:true,3:false,4:true,5:false}, // pour « Jours précis »
      seg: {},   // overrides par mois : key -> {rythme, tjm}
      clients: prefill.clients || [ {client:'Studio Lumen', jsem:3}, {client:'Atelier Novak', jsem:1.5} ]
    };
    function wdCount(){ return Object.keys(state.weekdays).filter(function(k){return state.weekdays[k];}).length; }
    function factor(rythme){ return rythme==='Mi-temps'?0.5:(rythme==='Jours précis'? Math.max(0,wdCount())/5 : 1); }
    function segMonths(){ return monthsBetween(parseFR(state.debut), parseFR(state.fin)); }
    function segOf(key){ return state.seg[key] || {rythme:'Temps plein', tjm:state.tjm}; }
    function totals(){
      var months=segMonths(), wdTot=0, jFact=0, ca=0;
      months.forEach(function(m){ var sg=segOf(m.key); var f=factor(sg.rythme); wdTot+=m.wd; jFact+=m.wd*f; ca+=m.wd*f*sg.tjm; });
      if(state.model==='Forfait') ca=state.forfait;
      if(state.model==='Par lots') ca=state.lots.reduce(function(s2,l){return s2+(+l.montant||0);},0);
      return { wdTot:wdTot, jFact:Math.round(jFact*10)/10, ca:ca };
    }
    function jfmt(n){ return (Math.round(n*10)/10+'').replace('.',',')+' j'; }

    /* ---- aperçu (colonne droite) ---- */
    function summaryHTML(){
      var t=totals(), cl=CLIENTS[state.client]||{adr:''}, net=t.ca*0.78;
      var stColor=state.statut==='Active'?'var(--green)':(state.statut==='Prospect'?'var(--amber)':(state.statut==='Perdue'?'var(--red)':'var(--blue)'));
      var modelLine = state.model==='Régie' ? ('Régie · TJM '+eur(state.tjm)) : (state.model==='Forfait'?'Forfait':'Par lots');
      return ''+
      '<div class="paper" style="max-width:560px;">'+
        '<div class="ph"><div><div class="pbrand">'+esc(state.nom||'Nouvelle mission')+'</div>'+
          '<div class="pmeta">'+esc(state.client)+(cl.adr?' · '+esc(cl.adr):'')+'</div></div>'+
          '<div class="pdoc"><div class="dn" style="font-size:12px;color:'+stColor+';">● '+esc(state.statut)+'</div>'+
            '<div class="dd">'+esc(modelLine)+'<br>'+esc(state.debut)+' → '+esc(state.fin)+'</div></div></div>'+
        '<table class="pt"><thead><tr><th>Cadrage</th><th class="n">Valeur</th></tr></thead><tbody>'+
          '<tr><td>Jours ouvrés de la période</td><td class="n">'+t.wdTot+' j</td></tr>'+
          (state.model==='Régie'?'<tr><td>Jours facturés (selon rythme)</td><td class="n">'+jfmt(t.jFact)+'</td></tr>':'')+
          '<tr><td><b>CA estimé HT</b> <span style="color:#8a8a85;">— calculé</span></td><td class="n"><b>'+eur(t.ca)+'</b></td></tr>'+
          '<tr><td>Cotisations + impôt (~22%)</td><td class="n">− '+eur(t.ca*0.22)+'</td></tr>'+
          '<tr><td><b>Net estimé pour toi</b></td><td class="n"><b>'+eur(net)+'</b></td></tr>'+
        '</tbody></table>'+
        (state.clients.length?(
          '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a85;font-weight:700;margin:16px 0 7px;">Répartition par client · 1 CRA chacun</div>'+
          state.clients.map(function(c){ return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ececec;font-size:12px;"><span>'+esc(c.client)+'</span><b style="color:#2e9e6b;font-family:ui-monospace,monospace;">'+(c.jsem+'').replace('.',',')+' j / sem</b></div>'; }).join('')
        ):'')+
        '<div class="pnote">Le montant est <b>recalculé</b> à partir du TJM, de la période et du rythme — jamais saisi à la main. Il alimente le CA projeté, l\'occupation et le CRA (un par client).</div>'+
      '</div>';
    }

    /* ---- segments (bloc 5) ---- */
    function segRows(){
      return segMonths().map(function(m){
        var sg=segOf(m.key), f=factor(sg.rythme), j=m.wd*f, ca=j*sg.tjm;
        return '<div class="segrow" data-key="'+m.key+'">'+
          '<span class="segm">'+esc(m.label)+'</span>'+
          '<select class="seg-ryth">'+opts(RYTHMES,sg.rythme)+'</select>'+
          '<input class="seg-tjm" value="'+sg.tjm+'" inputmode="decimal">'+
          '<span class="seg-j">'+jfmt(j)+'</span>'+
          '<span class="seg-ca">'+eur(ca)+'</span>'+
        '</div>';
      }).join('');
    }
    function lotRows(){
      return state.lots.map(function(l,i){
        return '<div class="liner" data-i="'+i+'"><input class="lot-nom" value="'+esc(l.nom)+'" placeholder="Lot / livrable">'+
          '<input class="lot-mt lqty" value="'+l.montant+'" inputmode="decimal" style="grid-column:span 2;"><button class="lrm" title="Retirer">'+(ICO.trash||'×')+'</button></div>';
      }).join('');
    }
    function weekdayToggles(){
      var L=['L','M','M','J','V','S','D'];
      return '<div class="wdays">'+L.map(function(lab,i){ var d=i+1; var on=state.weekdays[d]; var wkend=d>=6;
        return '<button class="wd'+(on?' on':'')+(wkend?' we':'')+'" data-d="'+d+'">'+lab+'</button>'; }).join('')+'</div>';
    }

    function formHTML(){
      return ''+
      '<div class="seclbl">1 · Identité</div>'+
      '<div class="field"><label>Nom de la mission</label><input class="mNom" value="'+esc(state.nom)+'"></div>'+
      '<div class="field"><label>Client principal</label><select class="mClient">'+opts(Object.keys(CLIENTS).concat(['+ Nouveau client']), state.client)+'</select></div>'+

      '<div class="seclbl mt">2 · Modèle de prix</div>'+
      '<div class="field"><label>Facturation</label><div class="dchips">'+
        ['Régie','Forfait','Par lots'].map(function(v){ return '<button class="dchip mModel'+(v===state.model?' on':'')+'" data-v="'+v+'">'+(v==='Régie'?'Régie · TJM':v)+'</button>'; }).join('')+'</div></div>'+
      '<div class="field mRegie"><label>TJM <span class="muted" style="font-weight:400;">— aucun nombre de jours à saisir</span></label><input class="mTjm lqty" value="'+state.tjm+'" inputmode="decimal"></div>'+
      '<div class="field mForfait" style="display:none;"><label>Montant forfait HT</label><input class="mForf lqty" value="'+state.forfait+'" inputmode="decimal"></div>'+
      '<div class="mLots" style="display:none;"><div class="liner-head"><span>Lot / livrable</span><span style="grid-column:span 2;">Montant HT</span><span></span></div><div class="lots">'+lotRows()+'</div><button class="addline addlot">'+(ICO.plus||'+')+' Ajouter un lot</button></div>'+

      '<div class="seclbl mt">3 · Planning</div>'+
      '<div class="frow2"><div class="field"><label>Début</label><input class="mDebut" value="'+esc(state.debut)+'"></div>'+
        '<div class="field"><label>Fin</label><input class="mFin" value="'+esc(state.fin)+'"></div></div>'+
      '<div class="autobox"><span>Jours ouvrés sur la période <span class="muted" style="font-weight:400;">— comptés par l\'app</span></span><b class="mWd">—</b></div>'+

      '<div class="seclbl mt">4 · Cycle de vie</div>'+
      '<div class="pipe4">'+['Prospect','Active','Terminée','Perdue'].map(function(s2){ return '<button class="pseg mStatut'+(s2===state.statut?' on':'')+(s2==='Perdue'?' lost':'')+'" data-v="'+s2+'">'+s2+'</button>'; }).join('')+'</div>'+

      '<div class="mSegWrap"><div class="seclbl mt">5 · Rythme &amp; segments <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0;">— le montant se calcule tout seul</span></div>'+
      '<p class="help muted" style="font-size:11.5px;margin:0 0 11px;line-height:1.5;">Découpe la période ; chaque mois a son rythme et son TJM. Pour « Jours précis », choisis les jours travaillés dans la semaine :</p>'+
      weekdayToggles()+
      '<div class="seg-head"><span>Période</span><span>Rythme</span><span>TJM</span><span>Jours</span><span>CA</span></div>'+
      '<div class="segs">'+segRows()+'</div></div>'+

      '<div class="seclbl mt">6 · Répartition par client <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0;">— 1 CRA chacun</span></div>'+
      '<div class="reps">'+state.clients.map(function(c,i){ return '<div class="reprow" data-i="'+i+'"><select class="rep-cl">'+opts(Object.keys(CLIENTS),c.client)+'</select><input class="rep-j lqty" value="'+c.jsem+'" inputmode="decimal"><span class="muted" style="font-size:12px;">j / sem</span><button class="lrm" title="Retirer">'+(ICO.trash||'×')+'</button></div>'; }).join('')+'</div>'+
      '<button class="addline addrep">'+(ICO.plus||'+')+' Ajouter un client</button>';
    }

    function syncModel(){
      var rg=state.model==='Régie', fo=state.model==='Forfait', lo=state.model==='Par lots';
      $('.mRegie').style.display=rg?'block':'none';
      $('.mForfait').style.display=fo?'block':'none';
      $('.mLots').style.display=lo?'block':'none';
      $('.mSegWrap').style.display=rg?'block':'none';
    }
    function render(){
      paperEl().outerHTML = summaryHTML();
      var t=totals();
      var wd=$('.mWd'); if(wd) wd.textContent=t.wdTot+' j';
    }
    function refreshSegs(){ var c=$('.segs'); if(c){ c.innerHTML=segRows(); bindSegs(); } render(); }
    function bindSegs(){
      $all('.segrow').forEach(function(row){
        var key=row.dataset.key;
        row.querySelector('.seg-ryth').addEventListener('change', function(e){ var sg=segOf(key); state.seg[key]={rythme:e.target.value, tjm:sg.tjm}; refreshSegs(); });
        row.querySelector('.seg-tjm').addEventListener('input', function(e){ var sg=segOf(key); state.seg[key]={rythme:sg.rythme, tjm:parseFloat(e.target.value.replace(',','.'))||0}; refreshSegs(); });
      });
    }
    function bindLots(){
      $all('.lots .liner').forEach(function(row){ var i=+row.dataset.i;
        row.querySelector('.lot-nom').addEventListener('input',function(e){ state.lots[i].nom=e.target.value; render(); });
        row.querySelector('.lot-mt').addEventListener('input',function(e){ state.lots[i].montant=parseFloat(e.target.value.replace(',','.'))||0; render(); });
        row.querySelector('.lrm').addEventListener('click',function(){ if(state.lots.length>1){ state.lots.splice(i,1); $('.lots').innerHTML=lotRows(); bindLots(); render(); } });
      });
    }
    function bindReps(){
      $all('.reprow').forEach(function(row){ var i=+row.dataset.i;
        row.querySelector('.rep-cl').addEventListener('change',function(e){ state.clients[i].client=e.target.value; render(); });
        row.querySelector('.rep-j').addEventListener('input',function(e){ state.clients[i].jsem=parseFloat(e.target.value.replace(',','.'))||0; render(); });
        row.querySelector('.lrm').addEventListener('click',function(){ state.clients.splice(i,1); $('.reps').innerHTML=state.clients.map(function(c,j){return '<div class="reprow" data-i="'+j+'"><select class="rep-cl">'+opts(Object.keys(CLIENTS),c.client)+'</select><input class="rep-j lqty" value="'+c.jsem+'" inputmode="decimal"><span class="muted" style="font-size:12px;">j / sem</span><button class="lrm">'+(ICO.trash||'×')+'</button></div>';}).join(''); bindReps(); render(); });
      });
    }
    open({
      icon:'layers', title:'Nouvelle mission', sub:'le montant se calcule — jamais saisi',
      form: formHTML(),
      foot:'<span class="ftnote">Alimente le <b>CA projeté</b>, l\'occupation et le <b>CRA</b> (un par client)</span>'+
        '<button class="btn" data-act="facture">'+(ICO.doc||'')+' Créer la 1ʳᵉ facture</button>'+
        '<button class="btn primary" data-act="create">'+(ICO.check||'')+' Créer la mission</button>',
      wire:function(m){
        $('.mNom').addEventListener('input', function(e){ state.nom=e.target.value; render(); });
        $('.mClient').addEventListener('change', function(e){ state.client=e.target.value; render(); });
        $('.mTjm').addEventListener('input', function(e){ state.tjm=parseFloat(e.target.value.replace(',','.'))||0; refreshSegs(); });
        $('.mForf').addEventListener('input', function(e){ state.forfait=parseFloat(e.target.value.replace(',','.'))||0; render(); });
        $('.mDebut').addEventListener('input', function(e){ state.debut=e.target.value; refreshSegs(); });
        $('.mFin').addEventListener('input', function(e){ state.fin=e.target.value; refreshSegs(); });
        $('.addlot').addEventListener('click', function(){ state.lots.push({nom:'',montant:0}); $('.lots').innerHTML=lotRows(); bindLots(); render(); });
        $('.addrep').addEventListener('click', function(){ state.clients.push({client:Object.keys(CLIENTS)[0], jsem:1}); $('.reps').innerHTML=$('.reps').innerHTML+''; var html=state.clients.map(function(c,j){return '<div class="reprow" data-i="'+j+'"><select class="rep-cl">'+opts(Object.keys(CLIENTS),c.client)+'</select><input class="rep-j lqty" value="'+c.jsem+'" inputmode="decimal"><span class="muted" style="font-size:12px;">j / sem</span><button class="lrm">'+(ICO.trash||'×')+'</button></div>';}).join(''); $('.reps').innerHTML=html; bindReps(); render(); });
        $all('.mModel').forEach(function(b){ b.addEventListener('click', function(){ $all('.mModel').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); state.model=b.dataset.v; syncModel(); render(); }); });
        $all('.mStatut').forEach(function(b){ b.addEventListener('click', function(){ $all('.mStatut').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); state.statut=b.dataset.v; render(); }); });
        $all('.wd').forEach(function(b){ b.addEventListener('click', function(){ var d=+b.dataset.d; state.weekdays[d]=!state.weekdays[d]; b.classList.toggle('on'); refreshSegs(); }); });
        bindSegs(); bindLots(); bindReps(); syncModel(); render();
        m.querySelector('.docmodal-foot').addEventListener('click', function(e){
          var b=e.target.closest('[data-act]'); if(!b) return;
          var t=totals();
          if(b.dataset.act==='create'){ if(window.FreelToast) FreelToast('Mission « '+state.nom+' » créée · CA estimé '+eur(t.ca),'ok'); close(); }
          if(b.dataset.act==='facture'){ close(); setTimeout(function(){ facture({ client:state.client,
            lines:[{label:state.nom, sub:(state.model==='Régie'?'régie · TJM '+eur(state.tjm):state.model.toLowerCase()), qty:(state.model==='Régie'?t.jFact:1), pu:(state.model==='Régie'?state.tjm:t.ca)}] }); }, 220); }
        });
      }
    });
  }

  /* ============================================================
     4) ENCAISSEMENT — pointer une facture comme payée
     ============================================================ */
  var PENDING = [
    { num:'2026-024', client:'Studio Lumen', amount:1200, sent:'12 mai', due:'29 mai', late:true },
    { num:'2026-025', client:'Atelier Novak', amount:2400, sent:'28 mai', due:'27 juil.', late:false },
    { num:'2026-026', client:'Studio Lumen', amount:2410, sent:'04 juin', due:'04 juil.', late:false },
    { num:'2026-027', client:"Brasserie Vent d'Ouest", amount:2880, sent:'—', due:'à émettre', draft:true }
  ];
  function todayInput(){ return '2026-06-15'; }
  function shortCl(name){ var m={'Studio Lumen':'SL','Atelier Novak':'AN',"Brasserie Vent d'Ouest":'BV','Maison Kessler':'MK'}; return m[name]||'?'; }
  function clColor(name){ var m={'Studio Lumen':'var(--green)','Atelier Novak':'var(--blue)',"Brasserie Vent d'Ouest":'#b59ae0','Maison Kessler':'var(--amber)'}; return m[name]||'var(--muted)'; }

  function encaissement(){
    var paid = {};
    function totalPending(){ return PENDING.filter(function(p){ return !p.draft && !paid[p.num]; }).reduce(function(s,p){ return s+p.amount; }, 0); }
    function rowHTML(p){
      var done = paid[p.num];
      return '<div class="payrow'+(done?' done':'')+(p.draft?' draft':'')+'" data-num="'+p.num+'">'+
        '<span class="pav" style="background:'+clColor(p.client)+'">'+shortCl(p.client)+'</span>'+
        '<div class="pinfo"><b>'+esc(p.client)+'</b><span>'+esc(p.num)+' · émise '+esc(p.sent)+' · échéance '+esc(p.due)+'</span></div>'+
        (p.late&&!done?'<span class="chip2 bad" style="margin-right:8px;">en retard</span>':'')+
        '<span class="pamt'+(done?' ok':'')+'">'+(done?'✓ ':'')+eur(p.amount)+'</span>'+
        (p.draft?'<span class="pbtn ghost">à émettre</span>':(done?'<button class="pbtn undo" data-undo="'+p.num+'">annuler</button>':'<button class="pbtn" data-pay="'+p.num+'">Marquer payé</button>'))+
        '<div class="payedit" data-edit="'+p.num+'">'+
          '<div class="pe-row"><label>Date d\'encaissement</label><input type="date" class="pe-date" value="'+todayInput()+'"></div>'+
          '<div class="pe-row"><label>Compte crédité</label><select class="pe-acct"><option>Compte pro · Qonto</option><option>Compte perso</option><option>Espèces</option></select></div>'+
          '<div class="pe-foot"><button class="btn sm" data-cancel="'+p.num+'">Annuler</button><button class="btn primary sm" data-confirm="'+p.num+'">'+(ICO.check||'')+' Confirmer l\'encaissement</button></div>'+
        '</div>'+
        '</div>';
    }
    function render(){
      $('.paylist').innerHTML = PENDING.map(rowHTML).join('');
      $('.pend-tot').textContent = eur(totalPending());
      var n = PENDING.filter(function(p){ return !p.draft && !paid[p.num]; }).length;
      $('.pend-n').textContent = n + ' facture' + (n>1?'s':'') + ' en attente';
    }
    open({
      icon:'wallet', title:'Encaissements', sub:'pointe une facture comme payée',
      form:'<div class="seclbl">Reste à encaisser</div>'+
        '<div class="estbox" style="margin-bottom:4px;"><div class="er"><span class="pend-n">—</span><b class="big pend-tot" style="color:var(--amber);">—</b></div></div>'+
        '<p class="help muted" style="font-size:12px;margin-top:12px;line-height:1.5;">Clique <b>Marquer payé</b> sur une facture : la date du jour est pré-remplie (modifiable). L\'encaissement alimente ta trésorerie et la base URSSAF.</p>'+
        '<div class="seclbl mt" style="margin-top:20px;">Astuce</div>'+
        '<p class="help muted" style="font-size:12px;line-height:1.5;">Active la <b>synchro bancaire</b> (Config) pour que Freel rapproche les virements automatiquement, sans pointage manuel.</p>',
      foot:'<span class="ftnote">Encaissé ≠ facturé — seul l\'<b>encaissé</b> compte pour l\'URSSAF</span><button class="btn primary" data-done>Terminé</button>',
      wide:true,
      wire:function(m){
        // remplacer la colonne aperçu par la liste interactive
        var prev = m.querySelector('.doc-preview');
        prev.style.cssText = 'padding:22px;overflow-y:auto;display:block;background:var(--bg);';
        prev.innerHTML = '<div class="paylist"></div>';
        render();
        prev.addEventListener('click', function(e){
          var t;
          if ((t=e.target.closest('[data-pay]'))){ var row=prev.querySelector('.payrow[data-num="'+t.dataset.pay+'"]'); row.classList.add('editing'); return; }
          if ((t=e.target.closest('[data-cancel]'))){ prev.querySelector('.payrow[data-num="'+t.dataset.cancel+'"]').classList.remove('editing'); return; }
          if ((t=e.target.closest('[data-confirm]'))){
            var num=t.dataset.confirm; var row=prev.querySelector('.payrow[data-num="'+num+'"]');
            var de=row.querySelector('.pe-date'); var date=de?de.value:'';
            paid[num]=true; render();
            var p=PENDING.filter(function(x){return x.num===num;})[0];
            if(window.FreelToast) FreelToast(eur(p.amount)+' encaissé · '+p.client,'ok');
            return;
          }
          if ((t=e.target.closest('[data-undo]'))){ delete paid[t.dataset.undo]; render(); return; }
        });
        m.querySelector('.docmodal-foot').addEventListener('click', function(e){ if(e.target.closest('[data-done]')) close(); });
      }
    });
  }

  /* ============================================================
     5) CHARGE / DÉPENSE — avec photo de justificatif + TVA récupérable
     ============================================================ */
  function charge(){
    var CATS=['Logiciels & abonnements','Matériel','Déplacement','Coworking / loyer','Sous-traitance','Frais bancaires','Autre'];
    var state={ label:'', cat:CATS[0], ht:0, tva:20, date:todayInput(), recup:true, photo:null };
    function tvaAmt(){ return state.ht*state.tva/100; }
    function ttc(){ return state.ht*(1+state.tva/100); }
    function render(){
      $('.c-ht-out').textContent = eur(state.ht);
      $('.c-tva-out').textContent = eur(tvaAmt());
      $('.c-ttc-out').textContent = eur(ttc());
      var rc=$('.c-recup-box');
      if(rc) rc.style.display = state.recup ? 'flex' : 'none';
      $('.c-recup-out').textContent = eur(state.recup?tvaAmt():0);
    }
    open({
      icon:'receipt', title:'Nouvelle charge', sub:'dépense + justificatif',
      form:'<div class="seclbl">Dépense</div>'+
        '<div class="field"><label>Libellé</label><input class="c-label" placeholder="ex. Abonnement Adobe"></div>'+
        '<div class="field"><label>Catégorie</label><select class="c-cat">'+opts(CATS,state.cat)+'</select></div>'+
        '<div class="frow2"><div class="field"><label>Montant HT</label><input class="c-ht lqty" inputmode="decimal" value="0"></div>'+
          '<div class="field"><label>Date</label><input type="date" class="c-date" value="'+state.date+'"></div></div>'+
        '<div class="seclbl mt">TVA</div>'+
        '<div class="field"><label>Taux de TVA</label><div class="dchips c-tva-chips">'+
          [0,5.5,10,20].map(function(r){ return '<button class="dchip c-tva-opt'+(r===20?' on':'')+'" data-tva="'+r+'">'+(r+'').replace('.',',')+'%</button>'; }).join('')+'</div></div>'+
        '<label class="crecup-toggle"><input type="checkbox" class="c-recup" checked> TVA récupérable <span class="muted" style="font-weight:400;">(si tu es assujetti à la TVA)</span></label>',
      foot:'<span class="ftnote">En franchise de TVA, la récupération s\'active <b>après la bascule</b></span>'+
        '<button class="btn" data-act="another">Enregistrer + nouvelle</button>'+
        '<button class="btn primary" data-act="save">'+(ICO.check||'')+' Enregistrer la charge</button>',
      wire:function(m){
        // colonne droite = justificatif photo + récap TVA
        var prev=m.querySelector('.doc-preview');
        prev.style.cssText='padding:22px;overflow-y:auto;display:block;background:var(--bg);';
        prev.innerHTML=
          '<div class="seclbl" style="margin-top:0;">Justificatif</div>'+
          '<label class="photodrop"><input type="file" accept="image/*" class="c-photo" hidden>'+
            '<div class="pd-empty"><span class="pd-ic">'+(ICO.camera||ICO.doc||'')+'</span><b>Ajouter une photo</b><span>facture, ticket, reçu — glisse ou clique</span></div>'+
            '<img class="pd-img" style="display:none;">'+
          '</label>'+
          '<div class="seclbl mt">Récapitulatif</div>'+
          '<div class="estbox"><div class="er"><span>Montant HT</span><b class="c-ht-out">0 €</b></div>'+
            '<div class="er"><span>TVA <span class="c-tva-lbl">20%</span></span><b class="c-tva-out">0 €</b></div>'+
            '<div class="er"><span>Total TTC</span><b class="big c-ttc-out" style="color:var(--text);">0 €</b></div></div>'+
          '<div class="estbox c-recup-box" style="margin-top:10px;align-items:center;border-color:rgba(84,207,145,.3);background:var(--green-glow);">'+
            '<div style="flex:1;"><div style="font-size:12px;color:var(--muted);">TVA récupérable</div><div style="font-size:11px;color:var(--muted-2);margin-top:2px;">crédit de TVA à déduire</div></div>'+
            '<b class="c-recup-out" style="font-family:var(--mono);font-size:18px;color:var(--green);">0 €</b></div>'+
          '<p class="help muted" style="font-size:11.5px;margin-top:12px;line-height:1.5;">Le suivi cumulé de la TVA récupérable apparaît dans <b>Argent</b> une fois la bascule TVA effectuée.</p>';
        render();
        $('.c-label').addEventListener('input',function(e){ state.label=e.target.value; });
        $('.c-cat').addEventListener('change',function(e){ state.cat=e.target.value; });
        $('.c-ht').addEventListener('input',function(e){ state.ht=parseFloat(e.target.value.replace(',','.'))||0; render(); });
        $('.c-date').addEventListener('change',function(e){ state.date=e.target.value; });
        $('.c-recup').addEventListener('change',function(e){ state.recup=e.target.checked; render(); });
        $all('.c-tva-opt').forEach(function(b){ b.addEventListener('click',function(){
          $all('.c-tva-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on');
          state.tva=parseFloat(b.dataset.tva); m.querySelector('.c-tva-lbl').textContent=(state.tva+'').replace('.',',')+'%'; render();
        }); });
        var fi=$('.c-photo');
        fi.addEventListener('change',function(e){
          var f=e.target.files&&e.target.files[0]; if(!f) return;
          var rd=new FileReader(); rd.onload=function(ev){ var img=$('.pd-img'); img.src=ev.target.result; img.style.display='block'; $('.pd-empty').style.display='none'; }; rd.readAsDataURL(f);
        });
        m.querySelector('.docmodal-foot').addEventListener('click',function(e){
          var b=e.target.closest('[data-act]'); if(!b) return;
          if(window.FreelToast) FreelToast('Charge enregistrée'+(state.label?' · '+state.label:'')+' · '+eur(ttc())+' TTC','ok');
          if(b.dataset.act==='save') close();
          else { state={label:'',cat:CATS[0],ht:0,tva:20,date:todayInput(),recup:true,photo:null};
            $('.c-label').value=''; $('.c-ht').value='0'; var img=$('.pd-img'); img.style.display='none'; $('.pd-empty').style.display=''; render(); }
        });
      }
    });
  }

  /* ---------- branchement sur les menus (capture-phase) ---------- */
  function wireTriggers(){
    document.addEventListener('click', function(e){
      var nw = e.target.closest('[data-new]');
      if (nw && (nw.dataset.new==='mission' || nw.dataset.new==='facture' || nw.dataset.new==='encaissement' || nw.dataset.new==='charge')){
        e.preventDefault(); e.stopImmediatePropagation();
        document.querySelectorAll('.menu').forEach(function(x){ x.classList.remove('open'); });
        if (nw.dataset.new==='mission') mission();
        else if (nw.dataset.new==='encaissement') encaissement();
        else if (nw.dataset.new==='charge') charge();
        else facture();
        return;
      }
      var ex = e.target.closest('[data-export]');
      if (ex && (ex.dataset.export==='cra' || ex.dataset.export==='factures-pdf')){
        e.preventDefault(); e.stopImmediatePropagation();
        document.querySelectorAll('.menu').forEach(function(x){ x.classList.remove('open'); });
        if (ex.dataset.export==='cra') cra(); else facture();
        return;
      }
    }, true);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', wireTriggers);
  else wireTriggers();

  return { facture:facture, cra:cra, mission:mission, encaissement:encaissement, charge:charge };
})();
