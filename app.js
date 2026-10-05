(()=>{const API='https://api.github.com/repos/marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan/contents/ai/logs';

function newsNumber(name){const m=name.match(/^#(\d+)/);return m?Number(m[1]):-1;}
function newsDate(name){const m=name.match(/^#\d+ (\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})\.txt$/);return m?m.slice(1).join(''):'';}
function displayName(name){const m=name.match(/^#(\d+) (\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})\.txt$/);return m?\`${Number(m[1])}回目(${m[2]}/${m[3]}/${m[4]} ${m[5]}:${m[6]})\`:name.replace(/\.txt$/i,'');}
function sortLogs(files){return files.filter(x=>x.type==='file'&&x.name.endsWith('.txt')).sort((a,b)=>{const d=newsDate(b.name).localeCompare(newsDate(a.name));return d||newsNumber(b.name)-newsNumber(a.name);});}

async function getLogs(){const r=await fetch(API+'?ref=main&t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('ログ一覧の取得に失敗しました');return sortLogs(await r.json());}

async function loadLatest(){const output=document.getElementById('output');if(!output)return;try{const logs=await getLogs();if(!logs.length){output.textContent='ニュースログはまだありません。';return;}const r=await fetch(logs[0].download_url+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('最新ログの取得に失敗しました');output.textContent=await r.text();}catch(e){console.error(e);output.textContent='ニュースの取得に失敗しました。';}}

function render(logs){const list=document.getElementById('list');if(!list)return;list.innerHTML='';if(!logs.length){list.innerHTML='<li>該当するニュースがありません。</li>';return;}for(const f of logs){const li=document.createElement('li');const a=document.createElement('a');a.href='historyoutput.html?log='+encodeURIComponent(f.name);a.textContent=displayName(f.name);li.appendChild(a);list.appendChild(li);}}

async function loadHistory(){const list=document.getElementById('list');if(!list)return;try{window.__newsLogs=await getLogs();await searchNow();}catch(e){console.error(e);list.innerHTML='<li>履歴の取得に失敗しました。</li>';}}
async function searchNow(){const input=document.getElementById('searchInput');if(!input)return;const q=input.value.trim().toLocaleLowerCase();const logs=window.__newsLogs||[];if(!q){render(logs);return;}const matched=[];for(const f of logs){try{const r=await fetch(f.download_url+'?t='+Date.now(),{cache:'no-store'});const t=r.ok?await r.text():'';if((t+' '+displayName(f.name)).toLocaleLowerCase().includes(q))matched.push(f);}catch(e){console.error(e);}}render(matched);}

function initHistory(){const searchBtn=document.getElementById('searchBtn');const searchBox=document.getElementById('searchBox');const searchInput=document.getElementById('searchInput');if(searchBtn&&searchBox){searchBtn.addEventListener('click',()=>{const open=searchBox.style.display==='block';searchBox.style.display=open?'none':'block';if(!open)searchInput.focus();else{searchInput.value='';render(window.__newsLogs||[]);}});}if(searchInput){searchInput.addEventListener('input',searchNow);searchInput.addEventListener('keydown',async e=>{if(e.key==='Enter'){e.preventDefault();await loadHistory();}});}}

document.addEventListener('DOMContentLoaded',()=>{console.log('[MHN] app.js loaded');if(document.getElementById('output'))loadLatest();if(document.getElementById('list')){initHistory();loadHistory();}});
})();