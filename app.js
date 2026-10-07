const API='https://api.github.com/repos/marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan/contents/ai/logs';

function newsNumber(name){
  const m=name.match(/^#(\d+)/);
  return m?Number(m[1]):-1;
}

function newsDate(name){
  const m=name.match(/^#\d+ (\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})\.txt$/);
  return m?m.slice(1).join(''):'';
}

function displayName(name){
  const m=name.match(/^#(\d+) (\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})\.txt$/);
  return m?`${Number(m[1])}回目(${m[2]}/${m[3]}/${m[4]} ${m[5]}:${m[6]})`:name.replace(/\.txt$/i,'');
}

function sortLogs(files){
  return files
    .filter(x=>x.type==='file'&&x.name.endsWith('.txt'))
    .sort((a,b)=>{
      const d=newsDate(b.name).localeCompare(newsDate(a.name));
      return d||newsNumber(b.name)-newsNumber(a.name);
    });
}

async function getLogs(){
  console.log('[MHN] fetching log list');
  const r=await fetch(API+'?ref=main&ts='+Date.now(),{cache:'no-store'});
  console.log('[MHN] log list response',r.status);
  if(!r.ok) throw Error('ログ一覧の取得に失敗しました');
  const files=await r.json();
  const logs=sortLogs(files);
  console.log('[MHN] logs found:',logs.length,'latest:',logs[0]?.name||'(none)');
  return logs;
}

async function loadLatest(){
  const output=document.getElementById('output');
  if(!output) return;
  output.textContent='読み込み中...';
  try{
    const logs=await getLogs();
    if(!logs.length){
      output.textContent='ニュースログはまだありません。';
      return;
    }
    const file=logs[0];
    const url='https://raw.githubusercontent.com/marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan/main/ai/logs/'+encodeURIComponent(file.name)+'?ts='+Date.now();
    console.log('[MHN] fetching latest:',file.name);
    const r=await fetch(url,{cache:'no-store'});
    console.log('[MHN] latest response',r.status);
    if(!r.ok) throw Error('最新ログの取得に失敗しました');
    output.textContent=await r.text();
  }catch(e){
    console.error('[MHN] latest load error',e);
    output.textContent='ニュースの取得に失敗しました。';
  }
}

function render(logs){
  const list=document.getElementById('list');
  if(!list) return;
  list.innerHTML='';
  if(!logs.length){
    list.innerHTML='<li>該当するニュースがありません。</li>';
    return;
  }
  for(const f of logs){
    const li=document.createElement('li');
    const a=document.createElement('a');
    a.href='historyoutput.html?log='+encodeURIComponent(f.name);
    a.textContent=displayName(f.name);
    li.appendChild(a);
    list.appendChild(li);
  }
}

async function loadHistory(){
  const list=document.getElementById('list');
  if(!list) return;
  try{
    window.__newsLogs=await getLogs();
    await searchNow();
  }catch(e){
    console.error('[MHN] history load error',e);
    list.innerHTML='<li>履歴の取得に失敗しました。</li>';
  }
}

async function searchNow(){
  const input=document.getElementById('searchInput');
  if(!input) return;
  const q=input.value.trim().toLocaleLowerCase();
  const logs=window.__newsLogs||[];
  if(!q){
    render(logs);
    return;
  }
  const matched=[];
  for(const f of logs){
    try{
      const url='https://raw.githubusercontent.com/marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan/main/ai/logs/'+encodeURIComponent(f.name)+'?ts='+Date.now();
      const r=await fetch(url,{cache:'no-store'});
      const t=r.ok?await r.text():'';
      if((t+' '+displayName(f.name)).toLocaleLowerCase().includes(q)) matched.push(f);
    }catch(e){
      console.error('[MHN] search error',e);
    }
  }
  render(matched);
}

function initHistory(){
  const searchBtn=document.getElementById('searchBtn');
  const searchBox=document.getElementById('searchBox');
  const searchInput=document.getElementById('searchInput');
  if(searchBtn&&searchBox){
    searchBtn.addEventListener('click',()=>{
      const open=searchBox.style.display==='block';
      searchBox.style.display=open?'none':'block';
      if(!open) searchInput.focus();
      else{
        searchInput.value='';
        render(window.__newsLogs||[]);
      }
    });
  }
  if(searchInput){
    searchInput.addEventListener('input',searchNow);
    searchInput.addEventListener('keydown',async e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        await loadHistory();
      }
    });
  }
}

console.log('[MHN] app.js loaded');
if(document.getElementById('output')){
  loadLatest();
}else if(document.getElementById('list')){
  initHistory();
  loadHistory();
}