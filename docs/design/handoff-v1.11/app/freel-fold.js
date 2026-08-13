/* FREEL — pliage/dépliage des cartes (global).
   Clic sur l'en-tête (.card-h) = toggle. Plié : la carte n'affiche que
   l'en-tête + la synthèse portée par data-fold. Persisté par page. */
(function(){
  var KEY='freel-fold:'+decodeURIComponent(location.pathname.split('/').pop()||'');
  var saved={}; try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
  function idOf(card){var l=card.querySelector('.card-h .lbl');return l?l.textContent.trim():'';}
  function apply(){
    document.querySelectorAll('.card').forEach(function(c){
      var id=idOf(c); if(!id) return;
      if(saved[id]===true) c.classList.add('folded');
      else if(saved[id]===false) c.classList.remove('folded');
    });
  }
  document.addEventListener('click',function(e){
    var h=e.target.closest('.card-h'); if(!h) return;
    if(e.target.closest('button,a,input,select,label,.act')) return;
    var card=h.closest('.card'); if(!card) return;
    var id=idOf(card); if(!id) return;
    card.classList.toggle('folded');
    saved[id]=card.classList.contains('folded');
    try{localStorage.setItem(KEY,JSON.stringify(saved));}catch(err){}
  });
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  apply();
})();
