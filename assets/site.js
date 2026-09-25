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
