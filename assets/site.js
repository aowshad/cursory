// Cursory: shared helpers for the main page (and, from step 2.1, the value pages).
// Classic script, loaded before assets/demos.js and the page script.
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const root=document.documentElement;
const store={get:k=>{try{return localStorage.getItem(k)}catch(_){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}}};

/* ---------- theme ---------- */
const setTheme=t=>{root.setAttribute('data-theme',t);$$('.theme button').forEach(b=>b.setAttribute('aria-checked',b.dataset.t===t));try{localStorage.setItem('cursory-theme',t)}catch(_){}};
setTheme(root.getAttribute('data-theme')||'light');
$$('.theme button').forEach(b=>{b.addEventListener('click',()=>setTheme(b.dataset.t));b.addEventListener('keydown',e=>{if(/Arrow(Left|Right|Up|Down)/.test(e.key)){e.preventDefault();const n=b.dataset.t==='light'?'dark':'light';setTheme(n);$(`.theme [data-t="${n}"]`).focus()}})});

/* ---------- clipboard ---------- */
function copyText(t){
  if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(t).catch(()=>fallback(t));
  return Promise.resolve(fallback(t));
}
function fallback(t){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(_){}ta.remove()}

/* ---------- copy format ---------- */
const FMTS={css:'CSS',tw:'Tailwind',jsx:'JSX'};
// The only place snippet strings are built. What a .snip shows is exactly what its button copies.
function formatSnippet(value,fmt){
  if(fmt==='tw')return 'cursor-'+(/^url\(/.test(value)?'['+value.replace(/url\((["'])(.*?)\1\)/g,'url($2)').replace(/ /g,'_')+']':value);
  if(fmt==='jsx')return `style={{ cursor: '${value.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}' }}`;
  return `cursor: ${value};`;
}

/* ---------- toast ---------- */
let toastT;
function toast(text,code){const toastEl=$('#toast');if(!toastEl)return;toastEl.textContent=text;if(code){const c=document.createElement('code');c.textContent=code;toastEl.append(' ',c)}
  toastEl.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('show'),1800)}

/* ---------- icons ---------- */
const COPYI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>';
const CHECKI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const INFO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/></svg>';

/* ---------- info tooltips ---------- */
document.addEventListener('click',e=>{const b=e.target.closest('.info');$$('.info.open').forEach(x=>{if(x!==b)x.classList.remove('open')});if(b)b.classList.toggle('open')});

/* ---------- copy buttons and the copy format switch ---------- */
let fmt=(()=>{let f=null;try{f=new URLSearchParams(location.search).get('format')}catch(_){}
  if(f in FMTS){store.set('cursory-fmt',f);return f}f=store.get('cursory-fmt');return f in FMTS?f:'css'})();
function renderSnips(flash){
  $$('.snip[data-v],.tsnip[data-v]').forEach(s=>{$('code',s).textContent=formatSnippet(s.dataset.v,fmt);if(flash){clearTimeout(s._ft);s.classList.remove('flash');void s.offsetWidth;s.classList.add('flash');s._ft=setTimeout(()=>s.classList.remove('flash'),400)}});
  $$('#fmt button').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.f===fmt)));
}
function setFmt(f,announce){if(!(f in FMTS)||f===fmt)return;fmt=f;store.set('cursory-fmt',f);renderSnips(true);if(announce)toast(`Copy buttons now give ${FMTS[f]}`)}
// Call once the page's snippets (.snip / .tsnip with data-v) are in the DOM.
function initCopy(){
  $$('.copy').forEach(b=>{if(!b.querySelector('span'))b.innerHTML=COPYI+'<span>Copy</span>'});
  renderSnips(false);
  $$('#fmt button').forEach(b=>{b.tabIndex=b.dataset.f===fmt?0:-1;b.addEventListener('click',()=>{setFmt(b.dataset.f,true);$$('#fmt button').forEach(x=>x.tabIndex=x===b?0:-1)})});
  if($('#fmt'))$('#fmt').addEventListener('keydown',e=>{const k=['css','tw','jsx'],d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!d)return;e.preventDefault();
    const n=k[(k.indexOf(fmt)+d+k.length)%k.length];setFmt(n,true);$$('#fmt button').forEach(x=>x.tabIndex=x.dataset.f===n?0:-1);$(`#fmt [data-f="${n}"]`).focus()});
  document.addEventListener('click',e=>{const b=e.target.closest('.copy,.tcopy');if(!b)return;const tile=b.classList.contains('tcopy');
    const s=tile?$('.tsnip',b.closest('.ctile')):b.closest('.snip[data-v]');const text=s?formatSnippet(s.dataset.v,fmt):b.dataset.copy;if(!text)return;
    copyText(text).then(()=>{clearTimeout(b._t);b.classList.add('done');
      if(tile){b.innerHTML=CHECKI;b._t=setTimeout(()=>{b.innerHTML=COPYI;b.classList.remove('done')},1200)}
      else{const t=b.querySelector('span');t.textContent='Copied';b._t=setTimeout(()=>{t.textContent='Copy';b.classList.remove('done')},1200)}
      toast('Copied',text)})});
}

/* ---------- footer reference list ---------- */
// root is the path back to the site root: '' on the main page, '../../' on value pages.
function fillFooter(groups,root=''){
  const list=$('#foot-groups');if(!list)return;
  list.innerHTML=groups.map(g=>`<li><a href="${root}#${g.id}">${g.title}</a></li>`).join('')+`<li><a href="${root}builder.html">Cursor Studio</a></li><li><a href="${root}lint.html">Cursor Lint</a></li><li><a href="${root}#systems">Across systems</a></li>`;
}
