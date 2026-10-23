const LEGACY_KEY='dojoHamdarPrototypeV1';
const collections=[
 {name:'events',id:item=>item.id},
 {name:'athletes',id:item=>item.id},
 {name:'matches',id:item=>item.id},
 {name:'brackets',id:item=>item.id},
 {name:'schedules',id:item=>item.eventId}
];
let db={events:[],athletes:[],matches:[],brackets:[],schedules:[]};
let baseline={events:[],athletes:[],matches:[],brackets:[],schedules:[]};
let view='public';
let currentUser=null;
let dataReady=false;
let dataError='';
let loginError='';
let cloudIsEmpty=false;
let saveQueue=Promise.resolve();
const cloudDb=window.firebaseDb;
const cloudAuth=window.firebaseAuth;
const app=document.querySelector('#app');

function cloneData(value){return JSON.parse(JSON.stringify(value))}
function canonical(value){
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
function storedCollections(source){
 return Object.fromEntries(collections.map(collection=>[collection.name,source[collection.name].map((item,index)=>({...item,sortOrder:index}))]));
}
function normalizeLegacyData(value){
 const normalized={events:[],athletes:[],matches:[],brackets:[],schedules:[]};
 for(const collection of collections){
  normalized[collection.name]=Array.isArray(value[collection.name])?value[collection.name]:[];
 }
 normalized.events=normalized.events.filter(event=>event.id!=='evt-teste');
 normalized.athletes=normalized.athletes.filter(athlete=>athlete.eventId!=='evt-teste');
 normalized.matches=normalized.matches.filter(match=>match.eventId!=='evt-teste');
 normalized.brackets=normalized.brackets.filter(bracket=>bracket.eventId!=='evt-teste');
 normalized.schedules=normalized.schedules.filter(schedule=>schedule.eventId!=='evt-teste');
 return normalized;
}
function readLegacyData(){
 try{
  const raw=localStorage.getItem(LEGACY_KEY);
  return raw?normalizeLegacyData(JSON.parse(raw)):null;
 }catch(error){
  console.error('Não foi possível ler os dados locais antigos.',error);
  return null;
 }
}
function dataCounts(source){
 return collections.map(collection=>source[collection.name].length).reduce((total,count)=>total+count,0);
}
async function loadCloudData(){
 const loaded=await Promise.all(collections.map(async collection=>{
  const snapshot=await cloudDb.collection(collection.name).get();
  return [collection.name,snapshot.docs.map(document=>({...document.data(),id:document.id}))];
 }));
 db=Object.fromEntries(loaded);
 for(const collection of collections){
  db[collection.name].sort((a,b)=>(Number(a.sortOrder)||0)-(Number(b.sortOrder)||0)||String(a.id).localeCompare(String(b.id)));
  db[collection.name]=db[collection.name].map((item,index)=>({...item,sortOrder:index}));
 }
 baseline=cloneData(db);
 cloudIsEmpty=dataCounts(db)===0;
 dataReady=true;
 render();
}
function save(){
 if(!currentUser){
  alert('Entre com uma conta administradora para salvar alterações.');
  return Promise.resolve(false);
 }
 saveQueue=saveQueue.then(async()=>{
  const next=storedCollections(db);
  const operations=[];
  for(const collection of collections){
   const previous=new Map(baseline[collection.name].map(item=>[String(collection.id(item)),item]));
   const current=new Map(next[collection.name].map(item=>[String(collection.id(item)),item]));
   for(const [id,item] of previous){
    if(!current.has(id))operations.push({type:'delete',reference:cloudDb.collection(collection.name).doc(id)});
   }
   for(const [id,item] of current){
    if(canonical(previous.get(id))!==canonical(item)){
     operations.push({type:'set',reference:cloudDb.collection(collection.name).doc(id),value:item});
    }
   }
  }
  for(let offset=0;offset<operations.length;offset+=500){
   const batch=cloudDb.batch();
   operations.slice(offset,offset+500).forEach(operation=>{
    if(operation.type==='delete')batch.delete(operation.reference);
    else batch.set(operation.reference,operation.value);
   });
   await batch.commit();
  }
  baseline=cloneData(next);
  cloudIsEmpty=dataCounts(db)===0;
  return true;
 }).catch(error=>{
  console.error('Falha ao sincronizar os dados com o Firestore.',error);
  alert(`Não foi possível salvar no banco de dados: ${error.message||error}. Confira sua conexão e as regras de acesso do Firestore.`);
  db=cloneData(baseline);
  render();
  return false;
 });
 return saveQueue;
}
function adminLoginView(){
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">Área protegida</div><h2>Administração</h2><div class="muted">Entre com a conta administradora cadastrada no Firebase.</div></div><span class="badge gold">Login necessário</span></section><section class="card"><form id="adminLoginForm"><label>E-mail</label><input name="email" type="email" autocomplete="username" required><label>Senha</label><input name="password" type="password" autocomplete="current-password" required><button class="primary" type="submit">Entrar</button></form><p class="small muted">Não há cadastro público. Crie a conta no Firebase Authentication e autorize o UID na coleção admins do Firestore.</p>${loginError?`<div class="notice">${esc(loginError)}</div>`:''}</section>`;
 document.querySelector('#adminLoginForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const fields=new FormData(event.currentTarget);
  try{
   await cloudAuth.signInWithEmailAndPassword(fields.get('email'),fields.get('password'));
   loginError='';
  }catch(error){
   console.error('Falha ao entrar na administração.',error);
   loginError='Não foi possível entrar. Verifique o e-mail, a senha e se o método E-mail/Senha está habilitado no Firebase.';
   render();
  }
 });
}
async function logoutAdmin(){
 try{await cloudAuth.signOut()}catch(error){console.error('Falha ao sair da administração.',error);alert(`Não foi possível sair: ${error.message||error}`)}
}
async function importLegacyData(){
 if(!currentUser||!cloudIsEmpty)return;
 const legacy=readLegacyData();
 if(!legacy||dataCounts(legacy)===0)return;
 if(!confirm(`Importar ${legacy.events.length} campeonato(s), ${legacy.athletes.length} atleta(s), ${legacy.matches.length} resultado(s), ${legacy.brackets.length} chave(s) e ${legacy.schedules.length} cronograma(s) deste navegador? O evento de teste e seus atletas fictícios serão ignorados.`))return;
 db=legacy;
 if(await save())render();
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateFmt(s){if(!s)return 'Data a definir';const [y,m,d]=s.split('-');return `${d}/${m}/${y}`}
function eventName(id){return db.events.find(e=>e.id===id)?.name||'Campeonato removido'}
function stat(n,l){return `<div class="stat"><b>${n}</b><span class="muted">${l}</span></div>`}
function render(){
 document.querySelector('header').style.display='';
 document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(dataError){app.innerHTML=`<section class="card notice"><b>Falha ao carregar o banco de dados.</b><p>${esc(dataError)}</p><p>Confira se o Firestore foi criado e se as regras permitem leitura pública.</p></section>`;return}
 if(!dataReady){app.innerHTML='<section class="card empty">Conectando ao banco de dados...</section>';return}
 if(view==='public')publicView();
 if(view==='results')resultsView();
 if(view==='admin')adminView();
}
function publicView(){
 const featured=db.events.find(e=>e.name==='Festival Pequenos Guerreiros')||db.events[0];
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">DOJO HAMDAR · PLATAFORMA DE EVENTOS</div><h2>Campeonatos de Taekwondo</h2><div class="muted">Eventos, atletas inscritos, cronograma e chaves em um só lugar.</div></div><span class="badge gold">Área pública</span></section>
 <div class="stats">${stat(db.events.length,'Eventos')}${stat(db.athletes.length,'Atletas inscritos')}${stat(db.matches.length,'Resultados publicados')}</div>
 <div class="sectionhead"><div><h2 style="margin:0">Eventos disponíveis</h2><p class="muted" style="margin:3px 0">Selecione um evento para consultar as informações.</p></div></div>
 <div class="grid">${db.events.length?db.events.map(e=>{const count=db.athletes.filter(a=>a.eventId===e.id).length;return `<article class="card event-card"><span class="badge">${esc(e.status)}</span><div class="event-title">${esc(e.name)}</div><div class="event-meta"><span>▦ ${dateFmt(e.date)}</span><span>⌖ ${esc(e.city||'Local a definir')}</span></div><p class="muted">${esc(e.modality||'Taekwondo')} · ${count} atleta(s) cadastrado(s)</p><div style="margin-top:auto"><button class="primary" style="width:100%" onclick="showEvent('${e.id}')">Acessar evento →</button></div></article>`}).join(''):'<div class="empty">Ainda não há campeonatos cadastrados.</div>'}</div>`;
}
function showEvent(id,section='inicio',search=''){const e=db.events.find(x=>x.id===id);if(!e)return;const athletes=db.athletes.filter(a=>a.eventId===id);const schedule=db.schedules.find(x=>x.eventId===id);const brackets=db.brackets.filter(x=>x.eventId===id);const matches=db.matches.filter(x=>x.eventId===id);const totalCats=new Set(athletes.map(a=>a.category||'Categoria não definida')).size;
 const nav=`<div class="event-links"><button class="event-link" onclick="showEvent('${id}','inscricoes')">♧ Inscrições <span>Atletas por categoria</span></button><button class="event-link" onclick="showEvent('${id}','cronograma')">◷ Cronograma <span>Horários por quadra</span></button><button class="event-link" onclick="showEvent('${id}','chaves')">♧ Chaves <span>Confrontos e pareamentos</span></button><button class="event-link" onclick="showEvent('${id}','aovivo')">● Ao vivo <span>Resultados registrados</span></button></div>`;
 let content='';
 if(section==='inscricoes'){
 const q=search.trim().toLocaleLowerCase('pt-BR');const list=athletes.filter(a=>[a.name,a.team,a.category,a.belt,a.ageGroup].join(' ').toLocaleLowerCase('pt-BR').includes(q));const groups={};list.forEach(a=>(groups[a.category||'Categoria não definida']??=[]).push(a));
 content=`<label for="athleteSearch">Buscar atleta, equipe ou categoria</label><input class="searchbar" id="athleteSearch" placeholder="Digite um nome, equipe ou categoria" value="${esc(search)}" oninput="showEvent('${id}','inscricoes',this.value)"><p class="muted">${Object.keys(groups).length} categorias · ${list.length} atletas inscritos</p>${Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([cat,ats])=>`<div class="category-card"><div class="category-heading"><span>${esc(cat).toUpperCase()}</span><span class="badge">${ats.length}</span></div>${ats.map(a=>`<div class="athlete-row"><div><b>${esc(a.name)}</b><small>${esc(a.team||'Equipe não informada')} · ${esc(a.belt||'Faixa não informada')}</small></div><div style="text-align:right;white-space:nowrap"><b>${esc(a.weight||'—')} kg</b><small>${esc(a.ageGroup||'')}</small></div></div>`).join('')}</div>`).join('')||'<div class="card empty">Nenhum atleta corresponde à busca.</div>'}`;
 }else if(section==='cronograma'){
 content=schedule?`<div class="event-summary">${stat(schedule.courts,'Quadras')}${stat(schedule.fights.length,'Lutas agendadas')}${stat(schedule.fightMinutes+' min','Duração média')}</div><div class="fight-list">${schedule.fights.map((m,i)=>`<article class="fight-card"><div class="fight-top"><span class="fight-chip">◷ ${esc(m.time)}</span><span class="fight-chip court">♧ QUADRA ${m.court}</span><span class="fight-number">#${i+1}</span><span class="fight-chip round">${esc(m.round||'LUTA')}</span><span class="fight-state">◷ Pendente</span></div><div class="fight-category">${esc(m.category||'Categoria não informada')}</div><div class="fighter">${esc(m.a||'Atleta a definir')}<small>🥋 ${esc(m.teamA||'Equipe não informada')}</small></div><div class="fight-vs">VS</div><div class="fighter">${esc(m.b||'Atleta a definir')}<small>🥋 ${esc(m.teamB||'Equipe não informada')}</small></div></article>`).join('')}</div><p class="small muted">Horários estimados; podem mudar durante o evento conforme a duração real das lutas.</p>`:'<div class="card empty">O cronograma ainda não foi gerado pela organização.</div>';
 }else if(section==='chaves'){
 content=brackets.length?brackets.map(g=>`<div class="category-card"><div class="category-heading">${esc(g.category)} <span class="badge">${g.pairs.length} luta(s)</span></div>${g.pairs.map((pair,i)=>`<div class="athlete-row"><div><small>LUTA ${i+1}</small><b>${esc(pair[0]||'A definir')}</b><small>×</small><b>${esc(pair[1]||'Passa direto')}</b></div></div>`).join('')}</div>`).join(''):'<div class="card empty">As chaves serão exibidas aqui quando a organização iniciar o evento.</div>';
 }else if(section==='aovivo'){
 const panel=new URLSearchParams(location.hash.replace(/^#/, '?')).get('livePanel')||'geral';
 const selectedCourt=Number(new URLSearchParams(location.hash.replace(/^#/, '?')).get('court')||1);
 const liveNav=`<div class="live-modes"><button class="live-mode ${panel==='geral'?'active':''}" onclick="showLivePanel('${id}','geral')">▦ Geral · Todas as quadras</button><button class="live-mode ${panel==='staff'?'active':''}" onclick="showLivePanel('${id}','staff')">⚙ Staff · Escolher quadra</button></div>`;
 if(schedule && schedule.fights.length){
   const states=schedule.fights.map((m,i)=>({...m,_index:i,_number:i+1,_status:m.status||'Pendente'}));
   const courts=Array.from({length:Number(schedule.courts)||1},(_,idx)=>idx+1);
   const courtList=c=>states.filter(m=>Number(m.court)===c).sort((a,b)=>a._index-b._index);
   const currentFor=list=>list.find(m=>m._status==='Em andamento')||list.find(m=>m._status==='Pendente');
   if(panel==='staff'){
     const list=courtList(selectedCourt),current=currentFor(list),upcoming=list.filter(m=>m._status==='Pendente'&&(!current||m._index!==current._index)).slice(0,3);
     const picker=`<div class="live-modes">${courts.map(c=>`<button class="live-mode ${c===selectedCourt?'active':''}" onclick="showLivePanel('${id}','staff',${c})">Quadra ${c}</button>`).join('')}</div>`;
     const mainFight=current?`<div class="staff-current"><div class="live-status">● ${current._status==='Em andamento'?'EM ANDAMENTO':'PRÓXIMA LUTA'}</div><div style="font-size:clamp(26px,4vw,42px);font-weight:950;margin:8px 0">LUTA #${String(current._number).padStart(2,'0')}</div><div style="font-weight:850;margin:8px 0 14px">${esc(current.category||'Categoria não informada')} · ${esc(current.round||'LUTA')}</div><div class="tv-fight"><div class="tv-num">${String(current._number).padStart(2,'0')}</div><div class="tv-blue">${esc(current.a||'Atleta 1')}<small>AZUL</small></div></div><div class="tv-fight"><div class="tv-num">VS</div><div class="tv-red">${esc(current.b||'Atleta 2')}<small>VERMELHO</small></div></div><p>Horário previsto: ${esc(current.time)}</p><p class="small" style="color:#cbd5e1">Painel informativo — controle das lutas somente pela Administração.</p></div>`:'<div class="empty">Não há lutas pendentes nesta quadra.</div>';
     content=`${liveNav}${picker}<div class="staff-screen"><h2 style="margin:0 0 12px">QUADRA ${selectedCourt}</h2><div class="staff-layout"><div>${mainFight}</div><aside class="staff-upcoming"><h3 style="margin:0 0 10px">PRÓXIMAS LUTAS</h3>${upcoming.length?upcoming.map(m=>`<div class="tv-fight"><div class="tv-num">${String(m._number).padStart(2,'0')}</div><div><div class="tv-blue">${esc(m.a||'Atleta 1')}<small>AZUL</small></div><div class="tv-red">${esc(m.b||'Atleta 2')}<small>VERMELHO</small></div><small>${esc(m.time)} · ${esc(m.category||'Categoria não informada')}</small></div></div>`).join(''):'<p>Sem próximas lutas pendentes.</p>'}</aside></div></div>`;
   }else{
     const cards=courts.map(c=>{const list=courtList(c),current=currentFor(list),upcoming=list.filter(m=>m._status==='Pendente'&&(!current||m._index!==current._index)).slice(0,3);return `<article class="tv-court"><h3 style="margin:0 0 10px">QUADRA ${c}</h3>${current?`<div class="tv-fight"><div class="tv-num">${String(current._number).padStart(2,'0')}</div><div><div style="font-weight:900;font-size:12px;margin-bottom:5px">${esc(current.category||'Categoria não informada')} · ${esc(current.time)} ${current._status==='Em andamento'?'· AO VIVO':'· PRÓXIMA'}</div><div class="tv-blue">${esc(current.a||'Atleta 1')}<small>AZUL</small></div><div class="tv-red">${esc(current.b||'Atleta 2')}<small>VERMELHO</small></div></div></div>`:'<p>Sem lutas pendentes</p>'}${upcoming.map(m=>`<div class="tv-fight"><div class="tv-num">${String(m._number).padStart(2,'0')}</div><div><div class="tv-blue">${esc(m.a||'Atleta 1')}<small>AZUL · ${esc(m.time)}</small></div><div class="tv-red">${esc(m.b||'Atleta 2')}<small>VERMELHO · ${esc(m.category||'')}</small></div></div></div>`).join('')}</article>`}).join('');
     content=`${liveNav}<div class="tv-board"><h2 style="margin:0 0 14px">PAINEL GERAL · TODAS AS QUADRAS</h2><div class="tv-grid">${cards}</div></div><p class="small muted">Painel geral para exibir em uma televisão. Para controlar uma quadra, abra Staff e selecione a quadra correspondente.</p>`;
   }
 }else{content=`${liveNav}<div class="card empty">Para usar Staff e Geral, inicie o evento na Administração e gere o cronograma das lutas.</div>`}
 }else{content=`<div class="card"><h3>Informações do evento</h3><p>${esc(e.description||'Informações adicionais serão divulgadas pela organização.')}</p><div class="event-summary">${stat(athletes.length,'Atletas')}${stat(totalCats,'Categorias')}${stat(matches.length,'Resultados')}</div>${nav}<p class="small muted">Consulte as inscrições, o cronograma estimado, as chaves e os resultados do evento.</p></div>`;}
 app.innerHTML=`<button class="secondary" onclick="render()">← Voltar aos eventos</button><section class="hero" style="margin-top:14px"><div><div class="eyebrow">EVENTO · ${esc(e.modality||'Taekwondo')}</div><h2>${esc(e.name)}</h2><div class="event-meta"><span>▦ ${dateFmt(e.date)}</span><span>⌖ ${esc(e.city||'Local a definir')}</span></div></div><span class="event-status">${esc(e.status)}</span></section>${section!=='inicio'?`<div class="sectionhead"><h3 style="margin:0">${({inscricoes:'Inscrições',cronograma:'Cronograma',chaves:'Chaves',aovivo:'Ao vivo'})[section]}</h3>${nav}</div>`:''}<section>${content}</section>`;
 document.querySelector('header').style.display='none';
 if(section==='inscricoes'){const input=document.querySelector('#athleteSearch');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length)}}
}
function resultsView(){
 const ms=db.matches;
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">Placar e classificação</div><h2>Resultados das lutas</h2><div class="muted">Resultados publicados pela organização.</div></div></section>${ms.length?`<div class="tablewrap"><table><tr><th>Campeonato</th><th>Categoria</th><th>Confronto</th><th>Placar</th><th>Vencedor</th></tr>${ms.map(m=>`<tr><td>${esc(eventName(m.eventId))}</td><td>${esc(m.category)}</td><td>${esc(m.red)} × ${esc(m.blue)}</td><td>${esc(m.scoreRed)} – ${esc(m.scoreBlue)}</td><td><b>${esc(m.winner)}</b></td></tr>`).join('')}</table></div>`:'<div class="card empty">Os resultados aparecerão aqui quando a organização registrar as primeiras lutas.</div>'}`;
}
function adminView(){
 if(!currentUser){adminLoginView();return}
 const legacy=cloudIsEmpty?readLegacyData():null;
 const legacyCount=legacy?dataCounts(legacy):0;
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">Administração protegida</div><h2>Administração</h2><div class="muted">Gerencie dados compartilhados pelo Firebase · ${esc(currentUser.email||'Conta autenticada')}</div></div><button class="secondary" onclick="logoutAdmin()">Sair</button></section>
 <div class="notice"><b>Privacidade:</b> os dados mostrados nas páginas públicas (incluindo nomes, categorias, equipes e pesos dos atletas) podem ser lidos por qualquer visitante. Cadastre somente informações autorizadas.</div>
 ${legacyCount?`<section class="card"><h3>Dados antigos neste navegador</h3><p>${legacy.events.length} campeonato(s) · ${legacy.athletes.length} atletas · ${legacy.matches.length} resultados · ${legacy.brackets.length} chaves · ${legacy.schedules.length} cronogramas.</p><p class="small muted">A importação não inclui o evento de teste nem os atletas fictícios associados.</p><button class="primary" onclick="importLegacyData()">Importar dados locais para o Firestore</button></section>`:''}
 <div class="grid">
 <section class="card"><h3>➕ Criar campeonato</h3><form id="eventForm"><label>Nome do campeonato *</label><input name="name" required placeholder="Ex.: Copa Dojo Hamdar"><div class="row"><div><label>Data</label><input type="date" name="date"></div><div><label>Modalidade</label><select name="modality"><option>Taekwondo</option><option>Hapkido</option><option>Artes marciais mistas</option><option>Outra</option></select></div></div><label>Cidade / local</label><input name="city" placeholder="Rio Branco do Sul - PR"><label>Status</label><select name="status"><option>Planejamento</option><option>Inscrições abertas</option><option>Inscrições encerradas</option><option>Em andamento</option><option>Finalizado</option></select><label>Descrição pública</label><textarea name="description" rows="3" placeholder="Informações, horário e observações"></textarea><button class="primary" type="submit">Salvar campeonato</button></form></section>
 <section class="card"><h3>➕ Inscrever atleta</h3><form id="athleteForm"><label>Campeonato *</label><select name="eventId" required>${db.events.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select><label>Nome do atleta *</label><input name="name" required placeholder="Nome completo"><label>Faixa / graduação *</label><select name="belt" required><option value="">Selecione primeiro a faixa</option><option>Branca</option><option>Amarela a laranja</option><option>Verde a azul clara</option><option>Roxa a ponta preta</option><option>Preta</option></select><label>Categoria de idade *</label><select name="ageGroup" required><option value="">Selecione a faixa primeiro</option><option>Fraldinha (até 6 anos)</option><option>Mirim (7 a 8 anos)</option><option>Infantil (9 a 11 anos)</option><option>Cadete (12 a 14 anos)</option><option>Júnior (15 a 17 anos)</option><option>Adulto (18 a 30 anos)</option><option>Master (acima de 30 anos)</option></select><div class="row"><div><label>Sexo *</label><select name="sex" required><option value="">Selecione</option><option>Masculino</option><option>Feminino</option></select></div><div><label>Peso do atleta (kg) *</label><input name="weight" type="number" min="10" max="250" step="0.1" required placeholder="Ex.: 32,5"></div></div><div class="notice small">A categoria de peso será registrada junto com a idade, sexo e graduação. A conferência final deve seguir o regulamento oficial do festival.</div><div class="row"><div><label>Equipe</label><input name="team" placeholder="Equipe / academia"></div><div><label>Categoria identificada</label><input name="categoryPreview" readonly placeholder="Preenchida automaticamente"></div></div><button class="primary" type="submit">Inscrever atleta</button></form></section>
 <section class="card"><h3>➕ Registrar resultado</h3><form id="matchForm"><label>Campeonato *</label><select name="eventId" required>${db.events.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select><label>Categoria</label><input name="category" placeholder="Ex.: Juvenil -48 kg"><div class="row"><div><label>Atleta lado azul</label><input name="blue" required></div><div><label>Atleta lado vermelho</label><input name="red" required></div></div><div class="row"><div><label>Pontos azul</label><input type="number" name="scoreBlue" min="0" value="0" required></div><div><label>Pontos vermelho</label><input type="number" name="scoreRed" min="0" value="0" required></div></div><label>Vencedor (preencha conforme resultado oficial)</label><input name="winner" required placeholder="Nome do vencedor"><button class="primary" type="submit">Salvar resultado</button></form></section>
 <section class="card"><h3>Dados cadastrados</h3><p>${db.events.length} campeonatos · ${db.athletes.length} atletas · ${db.matches.length} resultados</p><div class="actions"><button class="secondary" onclick="exportData()">Exportar backup JSON</button><button class="danger" onclick="resetData()">Apagar todos os dados</button></div><p class="small muted">Exporte um backup regularmente. Os dados são compartilhados pelo Firestore.</p></section></div>
 <section class="card" style="margin-top:15px"><div class="sectionhead"><div><h3>Inscritos por categoria</h3><p class="muted">Veja todos os atletas inscritos no evento, agrupados pela categoria.</p></div><div style="min-width:220px"><label>Evento</label><select id="rosterEvent">${db.events.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div></div><div id="rosterContent"></div></section>
 <section class="card" style="margin-top:15px"><div class="sectionhead"><div><h3>▶ Iniciar evento</h3><p class="muted">Informe a quantidade de quadras e o horário inicial. O sistema gera as chaves e estima os horários de cada luta.</p></div></div><form id="startEventForm"><div class="row"><div><label>Evento *</label><select name="eventId" required>${db.events.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div><div><label>Quantidade de quadras *</label><input name="courts" type="number" min="1" max="20" value="2" required></div><div><label>Horário de início *</label><input name="startTime" type="time" value="09:00" required></div><div><label>Duração média por luta (minutos)</label><input name="fightMinutes" type="number" min="1" max="60" value="9" required></div></div><button class="primary" type="submit">Iniciar evento e montar programação</button></form><div id="scheduleContent" style="margin-top:15px"></div><p class="small muted">Os horários são estimativas. Atrasos, interrupções e lutas que terminem antes/depois podem alterar a programação.</p></section>
 <section class="card" style="margin-top:15px"><div class="sectionhead"><div><h3>Chaves automáticas</h3><p class="muted">Pareamento pela ordem de inscrição: o 1º atleta enfrenta o 3º, e o 2º enfrenta o 4º. O padrão se repete em cada grupo de quatro; atleta sem adversário passa direto.</p></div><button class="primary" id="generateBrackets">Gerar chaves do evento</button></div><div id="bracketContent"></div><p class="small muted">Confira as chaves antes de usá-las oficialmente.</p></section>
 <section class="card" style="margin-top:15px"><div class="sectionhead"><h3>Campeonatos cadastrados</h3></div>${db.events.length?`<div class="tablewrap"><table><tr><th>Nome</th><th>Data</th><th>Status</th><th>Ações</th></tr>${db.events.map(e=>`<tr><td>${esc(e.name)}</td><td>${dateFmt(e.date)}</td><td>${esc(e.status)}</td><td><button class="danger" onclick="deleteEvent('${e.id}')">Excluir</button></td></tr>`).join('')}</table></div>`:'<p class="muted">Nenhum campeonato.</p>'}</section>`;
 document.querySelector('#eventForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);db.events.push({id:crypto.randomUUID(),name:f.get('name').trim(),date:f.get('date'),modality:f.get('modality'),city:f.get('city').trim(),status:f.get('status'),description:f.get('description').trim()});save().then(saved=>{if(saved)render()})});
 const athleteForm=document.querySelector('#athleteForm');
 const beltSelect=athleteForm.elements.belt, ageSelect=athleteForm.elements.ageGroup, sexSelect=athleteForm.elements.sex, weightInput=athleteForm.elements.weight, preview=athleteForm.elements.categoryPreview;
 function weightDivision(age,sex,weight){const w=Number(weight);if(!weight||!sex||!age)return 'Aguardando dados';if(age.startsWith('Fraldinha')||age.startsWith('Mirim'))return 'Sem divisão de peso';let limits;if(age.startsWith('Infantil'))limits=[30,35,40,45];else if(age.startsWith('Cadete'))limits=sex==='Masculino'?[37,45,53,61]:[37,44,51,59];else if(age.startsWith('Júnior'))limits=sex==='Masculino'?[45,51,55,59,63,68,73]:[42,46,49,53,57,62];else if(age.startsWith('Adulto'))limits=sex==='Masculino'?[58,68,80]:[49,57,67];else limits=sex==='Masculino'?[58,68,80]:[49,57,67];const n=limits.find(x=>w<=x);return n===undefined?`Acima de ${limits[limits.length-1]} kg`:`Até ${n} kg`;}
 function updateCategory(){const age=ageSelect.value,sex=sexSelect.value,weight=weightInput.value;if(!age||!sex||!weight){preview.value='';return}preview.value=`${age.split(' (')[0]} • ${sex} • ${weightDivision(age,sex,weight)}${beltSelect.value?' • '+beltSelect.value:''}`;}
 [beltSelect,ageSelect,sexSelect,weightInput].forEach(el=>el.addEventListener('change',updateCategory));weightInput.addEventListener('input',updateCategory);
 athleteForm.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const category=preview.value||`${f.get('ageGroup')} • ${f.get('sex')} • ${f.get('weight')} kg • ${f.get('belt')}`;db.athletes.push({id:crypto.randomUUID(),eventId:f.get('eventId'),name:f.get('name').trim(),team:f.get('team').trim(),belt:f.get('belt'),ageGroup:f.get('ageGroup'),sex:f.get('sex'),weight:f.get('weight'),category});save().then(saved=>{if(saved)render()})});
 function renderRoster(){const sel=document.querySelector('#rosterEvent'),box=document.querySelector('#rosterContent');if(!sel||!box)return;const id=sel.value;const list=db.athletes.filter(a=>a.eventId===id);if(!list.length){box.innerHTML='<div class="empty">Ainda não há atletas inscritos neste evento.</div>';return;}const groups={};list.forEach(a=>{(groups[a.category||'Categoria não definida']??=[]).push(a)});box.innerHTML=Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([cat,ats])=>`<div style="margin-bottom:18px"><div class="sectionhead"><h4>${esc(cat)}</h4><span class="badge">${ats.length} inscrito(s)</span></div><div class="tablewrap"><table><tr><th>Atleta</th><th>Equipe</th><th>Faixa</th><th>Idade</th><th>Peso</th></tr>${ats.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.team||'—')}</td><td>${esc(a.belt||'—')}</td><td>${esc(a.ageGroup||'—')}</td><td>${esc(a.weight||'—')} kg</td></tr>`).join('')}</table></div></div>`).join('');}
 function renderBrackets(){const sel=document.querySelector('#rosterEvent'),box=document.querySelector('#bracketContent');if(!sel||!box)return;const items=db.brackets.filter(b=>b.eventId===sel.value);if(!items.length){box.innerHTML='<div class="empty">As chaves deste evento ainda não foram geradas.</div>';return;}box.innerHTML=items.map(group=>`<div style="margin-bottom:18px"><h4>${esc(group.category)}</h4>${group.pairs.map((pair,i)=>`<div class="card" style="margin:8px 0;background:#f8fafc"><b>Luta ${i+1}</b><p style="margin:5px 0">🔵 ${esc(pair[0]||'—')} <strong>×</strong> 🔴 ${esc(pair[1]||'Folga — passa direto')}</p></div>`).join('')}</div>`).join('');}
 function renderSchedule(){const form=document.querySelector('#startEventForm'),box=document.querySelector('#scheduleContent');if(!form||!box)return;const id=form.elements.eventId.value;const plan=db.schedules.find(x=>x.eventId===id);if(!plan){box.innerHTML='<div class="empty">O evento ainda não foi iniciado.</div>';return;}if(!plan.courtStatus)plan.courtStatus={};plan.fights.forEach(m=>{if(!m.status)m.status='Pendente'});const courtControls=Array.from({length:Number(plan.courts)||1},(_,i)=>i+1).map(c=>{const status=plan.courtStatus[c]||'Parada';const active=plan.fights.find(m=>Number(m.court)===c&&m.status==='Em andamento');const next=plan.fights.find(m=>Number(m.court)===c&&m.status==='Pendente');return `<div class="card" style="margin:10px 0;background:#f8fafc"><div class="sectionhead"><div><h4 style="margin:0">Quadra ${c} · ${esc(status)}</h4><p class="small muted">${active?`Em andamento: ${esc(active.a)} × ${esc(active.b)}`:next?`Próxima: ${esc(next.a)} × ${esc(next.b)}`:'Sem lutas pendentes'}</p></div><div class="actions">${status==='Em andamento'?`<button class="secondary" onclick="stopCourt('${plan.eventId}',${c})">■ Parar quadra</button>`:`<button class="primary" onclick="startCourt('${plan.eventId}',${c})">▶ Iniciar quadra</button>`}${active?`<button class="danger" onclick="finishCourtFight('${plan.eventId}',${c},${plan.fights.indexOf(active)})">✓ Finalizar luta</button>`:''}</div></div></div>`}).join('');box.innerHTML=`<div class="stats">${stat(plan.courts,'Quadras')}${stat(plan.fights.length,'Lutas agendadas')}${stat(plan.fightMinutes+' min','Por luta')}</div><div class="actions" style="margin:12px 0"><button class="primary" onclick="startAllCourts('${plan.eventId}')">▶ Iniciar todas as quadras</button><button class="secondary" onclick="stopAllCourts('${plan.eventId}')">■ Parar todas as quadras</button></div><h4>Controle individual das quadras</h4>${courtControls}<div class="tablewrap"><table><tr><th>Horário estimado</th><th>Quadra</th><th>Categoria</th><th>Confronto</th><th>Status</th></tr>${plan.fights.map((m,i)=>`<tr><td><b>${esc(m.time)}</b></td><td>Quadra ${m.court}</td><td>${esc(m.category)}</td><td>${esc(m.a)} × ${esc(m.b)}</td><td>${esc(m.status)}</td></tr>`).join('')}</table></div>`;}
 const rosterSelect=document.querySelector('#rosterEvent');if(rosterSelect)rosterSelect.addEventListener('change',()=>{renderRoster();renderBrackets();const sf=document.querySelector('#startEventForm');if(sf)sf.elements.eventId.value=rosterSelect.value;renderSchedule()});renderRoster();renderBrackets();
 function makeBrackets(id){const list=db.athletes.filter(a=>a.eventId===id);if(!list.length)return false;const groups={};list.forEach(a=>{(groups[a.category||'Categoria não definida']??=[]).push(a.name)});db.brackets=db.brackets.filter(b=>b.eventId!==id);Object.entries(groups).forEach(([category,names])=>{const pairs=[];for(let base=0;base<names.length;base+=4){const block=names.slice(base,base+4);if(block.length>=3)pairs.push([block[0],block[2]]);else if(block.length===2)pairs.push([block[0],block[1]]);else if(block.length===1)pairs.push([block[0],'Folga — passa direto']);if(block.length===4)pairs.push([block[1],block[3]]);else if(block.length===3)pairs.push([block[1],'Folga — passa direto']);}db.brackets.push({id:crypto.randomUUID(),eventId:id,category,pairs});});return true;}
 const genBtn=document.querySelector('#generateBrackets');if(genBtn)genBtn.addEventListener('click',async()=>{const id=document.querySelector('#rosterEvent')?.value;if(!id){alert('Cadastre um evento primeiro.');return;}if(!db.athletes.some(a=>a.eventId===id)){alert('Não há atletas inscritos neste evento.');return;}if(!confirm('Gerar/substituir as chaves seguindo a ordem de inscrição?'))return;makeBrackets(id);if(!await save())return;renderBrackets();alert('Chaves geradas: 1º contra 3º e 2º contra 4º, por grupo de quatro.');});
 const startForm=document.querySelector('#startEventForm');if(startForm){startForm.elements.eventId.value=document.querySelector('#rosterEvent')?.value||db.events[0]?.id||'';startForm.elements.eventId.addEventListener('change',renderSchedule);startForm.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(startForm),id=f.get('eventId'),courts=Number(f.get('courts')),mins=Number(f.get('fightMinutes')),start=f.get('startTime');if(!db.athletes.some(a=>a.eventId===id)){alert('Inscreva pelo menos um atleta antes de iniciar o evento.');return;}if(!confirm('Iniciar este evento? As chaves e os horários anteriores serão substituídos.'))return;makeBrackets(id);const groups=db.brackets.filter(b=>b.eventId===id),all=[];groups.forEach(g=>g.pairs.forEach((pair,i)=>{if(pair[1]&&!pair[1].startsWith('Folga'))all.push({category:g.category,a:pair[0],b:pair[1],round:'ELIMINATÓRIA'});}));const [hh,mm]=start.split(':').map(Number),base=hh*60+mm;const fights=all.map((m,i)=>{const court=(i%courts)+1,slot=Math.floor(i/courts),total=base+slot*mins;return {...m,court,time:String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0')};});db.schedules=db.schedules.filter(x=>x.eventId!==id);db.schedules.push({eventId:id,courts,fightMinutes:mins,startTime:start,fights,courtStatus:Object.fromEntries(Array.from({length:courts},(_,i)=>[i+1,'Parada']))});const ev=db.events.find(x=>x.id===id);if(ev)ev.status='Em andamento';if(!await save())return;renderBrackets();renderSchedule();alert('Evento iniciado! Chaves e horários estimados foram montados.');});renderSchedule();} 
 document.querySelector('#matchForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);db.matches.push({id:crypto.randomUUID(),eventId:f.get('eventId'),category:f.get('category').trim(),blue:f.get('blue').trim(),red:f.get('red').trim(),scoreBlue:f.get('scoreBlue'),scoreRed:f.get('scoreRed'),winner:f.get('winner').trim()});save().then(saved=>{if(saved)render()})});
}
function showLivePanel(eventId,panel,court=1){location.hash=`livePanel=${panel}&court=${court}`;showEvent(eventId,'aovivo');}
function startCourt(eventId,court){const p=db.schedules.find(x=>x.eventId===eventId);if(!p)return;if(!p.courtStatus)p.courtStatus={};p.courtStatus[court]='Em andamento';const active=p.fights.find(m=>Number(m.court)===Number(court)&&m.status==='Em andamento');if(!active){const next=p.fights.find(m=>Number(m.court)===Number(court)&&m.status!=='Finalizada');if(next)next.status='Em andamento';}save().then(saved=>{if(saved)render()});}
function startAllCourts(eventId){const p=db.schedules.find(x=>x.eventId===eventId);if(!p)return;if(!p.courtStatus)p.courtStatus={};for(let c=1;c<=Number(p.courts);c++){p.courtStatus[c]='Em andamento';if(!p.fights.some(m=>Number(m.court)===c&&m.status==='Em andamento')){const next=p.fights.find(m=>Number(m.court)===c&&m.status!=='Finalizada');if(next)next.status='Em andamento';}}save().then(saved=>{if(saved)render()});}
function stopCourt(eventId,court){const p=db.schedules.find(x=>x.eventId===eventId);if(!p)return;if(!p.courtStatus)p.courtStatus={};p.courtStatus[court]='Parada';p.fights.forEach(m=>{if(Number(m.court)===Number(court)&&m.status==='Em andamento')m.status='Pendente'});save().then(saved=>{if(saved)render()});}
function stopAllCourts(eventId){const p=db.schedules.find(x=>x.eventId===eventId);if(!p)return;if(!p.courtStatus)p.courtStatus={};for(let c=1;c<=Number(p.courts);c++)stopCourtQuiet(p,c);save().then(saved=>{if(saved)render()});}
function stopCourtQuiet(p,c){p.courtStatus[c]='Parada';p.fights.forEach(m=>{if(Number(m.court)===Number(c)&&m.status==='Em andamento')m.status='Pendente'});}
function finishCourtFight(eventId,court,index){const p=db.schedules.find(x=>x.eventId===eventId);if(!p||!p.fights[index])return;const fight=p.fights[index];if(!confirm(`Finalizar a luta #${index+1}: ${fight.a} × ${fight.b}?`))return;fight.status='Finalizada';const next=p.fights.find(m=>Number(m.court)===Number(court)&&m.status==='Pendente');if((p.courtStatus||{})[court]==='Em andamento'&&next)next.status='Em andamento';save().then(saved=>{if(saved)render()});}
function setLiveFight(eventId,index,nextStatus){const plan=db.schedules.find(x=>x.eventId===eventId);if(!plan||!plan.fights[index])return;if(nextStatus==='Em andamento'){plan.fights.forEach((f,i)=>{if(Number(f.court)===Number(plan.fights[index].court)&&f.status==='Em andamento')f.status='Pendente'});}plan.fights[index].status=nextStatus;save().then(saved=>{if(saved)showEvent(eventId,'aovivo')})}
function deleteEvent(id){if(!confirm('Excluir este campeonato e os dados vinculados?'))return;db.events=db.events.filter(e=>e.id!==id);db.athletes=db.athletes.filter(a=>a.eventId!==id);db.matches=db.matches.filter(m=>m.eventId!==id);db.brackets=db.brackets.filter(b=>b.eventId!==id);db.schedules=db.schedules.filter(s=>s.eventId!==id);save().then(saved=>{if(saved)render()})}
function resetData(){if(!confirm('Tem certeza? Isso apaga todos os dados compartilhados no Firestore.'))return;db={events:[],athletes:[],matches:[],brackets:[],schedules:[]};save().then(saved=>{if(saved)render()})}
function exportData(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup-dojo-hamdar.json';a.click();URL.revokeObjectURL(a.href)}
document.querySelector('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;view=b.dataset.view;render()});
if(cloudDb&&cloudAuth){
 cloudAuth.onAuthStateChanged(user=>{currentUser=user;if(view==='admin')render()});
 loadCloudData().catch(error=>{
  console.error('Falha ao carregar dados do Firestore.',error);
  dataError=`Não foi possível conectar ao Firestore (${error.code||'erro de conexão'}).`;
  dataReady=true;
  render();
 });
}else{
 dataError='Os SDKs do Firebase não foram carregados. Verifique a conexão com a internet e a configuração do projeto.';
 dataReady=true;
 render();
}
