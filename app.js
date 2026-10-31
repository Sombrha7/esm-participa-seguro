/* ESM Participa Seguro · sitio estático GitHub Pages + backend Supabase.
   Todos los controles de autorización se ejecutan en la base de datos (RLS/RPC).
   En GitHub solo se publica este frontend y la llave pública de Supabase. */
'use strict';
(() => {
  const config=window.ESM_CONFIG||{};
  const root=document.getElementById('app');
  const adminLink=document.getElementById('nav-admin');
  const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||'') && !!config.supabasePublishableKey && !String(config.supabasePublishableKey).startsWith('TU_');
  const sp=(configured && window.supabase?.createClient) ? window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey) : null;
  const ratings=[
    {value:1,label:'Totalmente en desacuerdo'}, {value:2,label:'En desacuerdo'},
    {value:3,label:'Ni de acuerdo ni en desacuerdo'}, {value:4,label:'De acuerdo'},
    {value:5,label:'Totalmente de acuerdo'}, {value:0,label:'No sé / No aplica'}
  ];
  const store={status:'none',questions:[],areas:[],cargos:[],answers:{},admin:false,tab:'dashboard',filters:{area:'',cargo:'',turno:''},adminQuestions:[],adminOptions:null,dashboard:null,newCodes:[]};
  // El comprobante temporal se mantiene solamente durante esta pestaña.
  // No contiene el código original y NO identifica las respuestas guardadas.
  const TICKET_KEY='esm_encuesta_acceso_v3';
  let temporaryTicket='';
  const getTicket=()=>{try{return sessionStorage.getItem(TICKET_KEY)||temporaryTicket;}catch(_){return temporaryTicket}};
  const saveTicket=t=>{temporaryTicket=t;try{sessionStorage.setItem(TICKET_KEY,t)}catch(_){/* Se conserva al menos mientras la pestaña no recargue */}};
  const clearTicket=()=>{temporaryTicket='';try{sessionStorage.removeItem(TICKET_KEY)}catch(_){}};
  const $=(s)=>document.querySelector(s);
  const esc=(x)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(x)=>x==null?'—':String(x);
  const notice=(text)=>`<div class="notice"><span class="icon" aria-hidden="true">◈</span><div>${esc(text)}</div></div>`;
  const fail=(err)=>String(err?.message||err||'No fue posible completar la operación.');
  const banner=(text,isError=true)=>`<div class="${isError?'form-error':'form-success'}" role="alert">${esc(text)}</div>`;
  const selectOptions=(items,chosen,empty)=>`<option value="">${esc(empty)}</option>`+(items||[]).map(x=>`<option value="${esc(x)}" ${x===chosen?'selected':''}>${esc(x)}</option>`).join('');
  async function rpc(name,args){const {data,error}=await sp.rpc(name,args||{});if(error)throw error;return data;}
  function waiting(){root.innerHTML='<div class="card loading"><span class="spinner"></span><p>Cargando información…</p></div>';}
  function route(){return location.hash==='#admin'?'admin':'worker'}
  function toggleNav(){adminLink.innerHTML=route()==='admin'?'← Volver a encuesta':'⚙ Administrador';adminLink.href=route()==='admin'?'#encuesta':'#admin'}
  function pageIntro(){return `<section class="hero"><div class="eyebrow">ESM · CULTURA PREVENTIVA</div><h1>Tu voz también protege.</h1><p>Queremos saber si cuentas con la confianza y el respaldo necesarios para detener trabajos inseguros.</p></section>`;}
  async function init(){
    toggleNav();
    if(!sp){root.innerHTML=`${pageIntro()}<div class="card entry-card"><h2>Falta conectar Supabase</h2><p class="muted">Abre el archivo <b>config.js</b> y reemplaza los datos de ejemplo por la URL y la llave publicable de tu proyecto Supabase. Luego publica estos archivos en GitHub Pages.</p>${notice('Nunca publiques contraseñas ni claves de servicio en GitHub.')}</div>`;return;}
    waiting();
    try {if(route()==='admin') await adminPage();else await workerPage();}
    catch(e){root.innerHTML=pageIntro()+`<div class="card entry-card">${banner(fail(e))}<button class="button" id="retry">Reintentar</button></div>`;$('#retry')?.addEventListener('click',init);}
  }
  async function workerPage(){
    let state='none';
    const ticket=getTicket();
    if(ticket){state=await rpc('survey_code_state',{p_ticket:ticket});if(state==='none')clearTicket();}
    store.status=state;
    if(state==='ready')await loadQuestionnaire();
    renderWorker();
  }
  async function loadQuestionnaire(){
    const ticket=getTicket();
    const [questions,options]=await Promise.all([
      rpc('survey_code_questions',{p_ticket:ticket}),
      rpc('survey_code_options',{p_ticket:ticket})
    ]);
    store.questions=questions||[];store.areas=options?.areas||[];store.cargos=options?.cargos||[];
  }
  function renderWorker(error='',success=''){
    const intro=pageIntro();
    if(store.status==='submitted'){
      root.innerHTML=intro+`<div class="card complete"><div class="check">✓</div><h2>¡Gracias por participar!</h2><p>Tu encuesta fue recibida. No se guarda junto a tu código de acceso.</p>${notice('Los resultados se entregan de manera agrupada, no por persona.')}<a class="button" href="#encuesta">Encuesta finalizada</a></div>`;return;
    }
    if(store.status!=='ready'){
      root.innerHTML=intro+`<div class="card entry-card"><div class="section-label">ACCESO CONFIDENCIAL</div><h2>Ingresa a la encuesta</h2><p class="muted">Ingresa únicamente con tu código individual autorizado. No solicitamos contraseña, nombre, RUT ni correo electrónico.</p>
      <form id="access-form" class="form"><label class="form-label">Código único de acceso<input id="code" required maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ESM-XXXX-XXXX-XXXX"></label>
      <button class="button primary" type="submit" id="enter">Ingresar a la encuesta →</button></form><div id="form-feedback">${error?banner(error):success?banner(success,false):''}</div>
      ${notice('Esta encuesta busca mejorar la seguridad. Responde con sinceridad, criterio y responsabilidad. Tu identidad no se solicita y los resultados se analizan de forma agrupada.')}</div>`;
      $('#access-form').addEventListener('submit',async e=>{e.preventDefault();const submit=$('#enter');submit.disabled=true;$('#form-feedback').innerHTML='';try{
        const result=await rpc('survey_code_claim',{p_code:$('#code').value.trim().toUpperCase()});
        if(result?.status!=='ready'||!result?.ticket)throw Error('Código no autorizado o ya utilizado. Verifica que corresponda al listado oficial de ESM.');
        saveTicket(result.ticket);
        store.status='ready';store.answers={};await loadQuestionnaire();renderWorker();
      }catch(e){$('#form-feedback').innerHTML=banner(fail(e));submit.disabled=false;}});return;
    }
    const questions=store.questions.map((q,i)=>`<div class="question"><div class="tag">PREGUNTA ${i+1} DE ${store.questions.length} · ${esc(q.dimension)}</div><h3>${esc(q.text)}</h3><div class="rating" role="group" aria-label="${esc(q.text)}">${ratings.map(r=>`<label class="choice"><input type="radio" name="q-${esc(q.id)}" value="${r.value}" ${store.answers[q.id]===r.value?'checked':''} required><span>${esc(r.label)}</span></label>`).join('')}</div></div>`).join('');
    root.innerHTML=intro+`<section class="card"><div class="section-label">ENCUESTA DE EMPODERAMIENTO EN SEGURIDAD</div><h2>Cuéntanos tu experiencia</h2><p class="muted">Selecciona tu área de trabajo, cargo y turno. Después, responde las preguntas según lo que ocurre realmente.</p>
      ${notice('Encuesta sin nombre, RUT ni correo. El código no se guarda junto a las respuestas. Área, cargo y turno se utilizan exclusivamente para el análisis estadístico agrupado.')}
      <form id="survey-form" class="form"><div class="form-grid"><label class="form-label">Área<select name="area" required>${selectOptions(store.areas,'','Selecciona tu área')}</select></label>
      <label class="form-label">Cargo<select name="cargo" required>${selectOptions(store.cargos,'','Selecciona tu cargo')}</select></label>
      <label class="form-label">Turno<select name="turno" required><option value="">Selecciona tu turno</option><option value="A">Turno A</option><option value="B">Turno B</option></select></label></div>
      <div>${questions}</div><div id="form-feedback">${error?banner(error):''}</div><div class="survey-actions"><span class="note">Al enviar, el código queda utilizado y no permite otra encuesta.</span><button id="submit-survey" class="button primary" type="submit">Enviar respuestas →</button></div></form>
    </section>`;
    $('#survey-form').addEventListener('change',e=>{if(e.target.type==='radio'){const id=e.target.name.slice(2);store.answers[id]=Number(e.target.value);}});
    $('#survey-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const values=new FormData(f);const answers={};store.questions.forEach(q=>{if(values.has('q-'+q.id))answers[q.id]=Number(values.get('q-'+q.id));});
      if(Object.keys(answers).length!==store.questions.length){$('#form-feedback').innerHTML=banner('Falta responder una o más preguntas.');return;}
      const button=$('#submit-survey');button.disabled=true;
      try {await rpc('survey_code_submit',{p_ticket:getTicket(),p_area:values.get('area'),p_cargo:values.get('cargo'),p_turno:values.get('turno'),p_answers:answers});store.status='submitted';store.answers={};renderWorker();}
      catch(err){$('#form-feedback').innerHTML=banner('No fue posible guardar las respuestas: '+fail(err));button.disabled=false;}
    });
  }
  async function adminPage(){const {data:{session}}=await sp.auth.getSession();if(session&&!session.user.is_anonymous){store.admin=(await rpc('survey_is_admin'))===true;}else store.admin=false;if(store.admin){await renderAdmin();}else renderLogin();}
  function renderLogin(error=''){
    root.innerHTML=`<div class="card login-card"><div class="section-label">ACCESO RESTRINGIDO</div><h1 class="headline">Panel administrador</h1><p class="muted">Solo la cuenta autorizada puede consultar estadísticas y gestionar preguntas. El control de permisos está en Supabase.</p>
    <form class="form" id="admin-login"><label class="form-label">Correo institucional<input type="email" id="admin-email" placeholder="Correo de administrador" autocomplete="username" required></label>
    <label class="form-label">Contraseña<input type="password" id="admin-password" autocomplete="current-password" required></label><button type="submit" id="admin-enter" class="button primary">Ingresar al dashboard →</button></form><div id="login-feedback">${error?banner(error):''}</div>
    ${notice('Las credenciales del administrador se configuran exclusivamente en Supabase. No se guardan en esta página.')}</div>`;
    $('#admin-login').addEventListener('submit',async e=>{e.preventDefault();let btn=$('#admin-enter');btn.disabled=true;$('#login-feedback').innerHTML='';try{
      const {error:err}=await sp.auth.signInWithPassword({email:$('#admin-email').value.trim(),password:$('#admin-password').value});if(err)throw err;
      if((await rpc('survey_is_admin'))!==true){await sp.auth.signOut();throw Error('Esta cuenta no tiene autorización de administrador.');}
      store.admin=true;store.tab='dashboard';await renderAdmin();
    }catch(e){$('#login-feedback').innerHTML=banner(fail(e));btn.disabled=false;}});
  }
  async function adminLogout(){await sp.auth.signOut();store.newCodes=[];store.admin=false;store.tab='dashboard';renderLogin();}
  async function renderAdmin(){
    root.innerHTML=`<div class="admin-title"><div><div class="eyebrow">PANEL DE CONTROL ESM</div><h1>Participación y seguridad</h1><p class="muted">Indicadores agrupados · decisiones para la mejora continua</p></div><button class="button" id="logout">Cerrar sesión</button></div>
      <nav class="admin-tabs" aria-label="Secciones de administración"><button data-tab="dashboard" class="${store.tab==='dashboard'?'active':''}">▤ Resultados</button><button data-tab="questions" class="${store.tab==='questions'?'active':''}">☷ Preguntas</button><button data-tab="codes" class="${store.tab==='codes'?'active':''}">♯ Códigos</button><button data-tab="qr" class="${store.tab==='qr'?'active':''}">▦ Enlace y QR</button></nav><section id="admin-content"></section>`;
    $('#logout').addEventListener('click',adminLogout);
    document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{if(store.tab==='codes' && store.newCodes?.length && !confirm('¿Ya descargaste el lote de códigos? Al salir no podrás volver a visualizarlos.'))return; if(store.tab==='codes')store.newCodes=[];store.tab=el.dataset.tab;renderAdmin();}));
    $('#admin-content').innerHTML='<div class="card loading"><span class="spinner"></span></div>';
    try{if(store.tab==='dashboard')await adminDashboard();else if(store.tab==='questions')await adminQuestions();else if(store.tab==='codes')await adminCodes();else adminQR();}catch(e){$('#admin-content').innerHTML=`<div class="card">${banner(fail(e))}<button class="button" id="refresh">Reintentar</button></div>`;$('#refresh')?.addEventListener('click',()=>renderAdmin());}
  }
  function metric(label,value,desc){return `<article class="metric"><div class="m-label">${esc(label)}</div><strong>${esc(number(value))}</strong><div class="m-sub">${esc(desc)}</div></article>`;}
  async function adminDashboard(){
    const [opts,data]=await Promise.all([rpc('survey_admin_options'),rpc('survey_admin_dashboard',{p_area:store.filters.area||null,p_cargo:store.filters.cargo||null,p_turno:store.filters.turno||null})]);
    store.adminOptions=opts;store.dashboard=data;
    const f=store.filters;
    const filtered=Object.values(f).some(Boolean);
    const q=(data.questions||[]).slice().sort((a,b)=>(a.favorable_pct??101)-(b.favorable_pct??101));
    const max=n=>Math.max(0,Math.min(100,Number(n)||0));
    const rows=q.map(x=>{const pct=Number(x.favorable_pct);const klass=pct>=80?'':pct>=60?'warn':'low';return `<tr><td>${esc(x.dimension)}</td><td>${esc(x.text)}</td><td>${esc(x.n)}</td><td>${esc(number(x.average))}</td><td><span class="pill ${klass}">${esc(number(x.favorable_pct))}%</span></td><td>${esc(number(x.unfavorable_pct))}%</td></tr>`}).join('');
    const br=(vals,kind)=>vals?.length?vals.map(x=>`<div class="item-row"><span>${esc(kind==='turnos'?'Turno '+x.name:x.name)}</span><strong>${esc(x.n)} respuestas</strong></div>`).join(''):'<p class="muted">No hay segmentos publicables (mínimo cinco respuestas).</p>';
    $('#admin-content').innerHTML=`<div class="toolbar"><div><div class="section-label">DASHBOARD DE EMPODERAMIENTO</div><h2>Resultados de la encuesta</h2><p class="note">Favorabilidad: respuestas 4 y 5, excluyendo “No sé / No aplica”.</p></div><div class="actions"><button class="button" id="export">↓ Exportar CSV</button><button class="button" id="print">▣ Imprimir</button><button class="button" id="reload">↻ Actualizar</button></div></div>
      <div class="filters"><label class="form-label">Área<select id="filter-area">${selectOptions(opts.areas,f.area,'Todas las áreas')}</select></label><label class="form-label">Cargo<select id="filter-cargo">${selectOptions(opts.cargos,f.cargo,'Todos los cargos')}</select></label><label class="form-label">Turno<select id="filter-turno">${selectOptions(['A','B'],f.turno,'Ambos turnos')}</select></label></div>
      <div class="metrics">${metric('Códigos creados',data.codes_total,'Total de credenciales únicas')}${metric('Códigos utilizados',data.codes_redeemed,'Códigos activados')}${metric('Encuestas recibidas',data.responses_total,'Respuestas completas')}${metric('Avance sobre códigos',data.codes_total?Math.round(100*data.responses_total/data.codes_total)+'%':'—','No equivale a cobertura real si faltan distribuir códigos')}${metric('Favorabilidad',data.suppressed?'Protegido':number(data.favorable_pct)+'%','Resultados del grupo seleccionado')}</div>
      ${data.suppressed?`<div class="card privacy"><div class="lock">🔒</div><div><strong>Datos protegidos</strong><p>En la selección actual hay menos de cinco encuestas. No se muestran resultados por área, cargo ni turno para reducir el riesgo de identificación indirecta.</p><p class="note">Para ver el resumen, quita filtros o reúne más participaciones.</p></div></div>`:
      `<div class="cols"><div class="card"><h3>Preguntas con menor favorabilidad</h3><p class="note">Cuanto menor el porcentaje, mayor necesidad de revisar esa dimensión.</p>${q.length?q.map(x=>`<div class="breakdown"><span class="name">${esc(x.dimension)}</span><span class="track"><span class="fill" style="display:block;width:${max(x.favorable_pct)}%"></span></span><strong>${esc(number(x.favorable_pct))}%</strong></div>`).join(''):'<p class="muted">Sin resultados suficientes por pregunta.</p>'}</div>
        <div class="card"><h3>Lectura del resultado</h3><div class="item-row"><span>Promedio general</span><strong>${esc(number(data.average))} / 5</strong></div><div class="item-row"><span>80% a 100%</span><span class="pill">Favorable</span></div><div class="item-row"><span>60% a 79,9%</span><span class="pill warn">Seguimiento</span></div><div class="item-row"><span>Menos de 60%</span><span class="pill low">Priorizar mejoras</span></div><p class="note">Criterios internos orientativos; no equivalen al instrumento CEAL-SM/SUSESO.</p></div></div>
       <div class="card" style="margin-bottom:17px"><h3>Detalle por pregunta</h3><div class="table-wrap"><table class="table"><thead><tr><th>Dimensión</th><th>Pregunta</th><th>N</th><th>Media</th><th>Favorables</th><th>Desfavorables</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Aún no hay resultados publicables.</td></tr>'}</tbody></table></div></div>
       <div class="cols"><div class="card"><h3>Participación por área</h3>${br(data.areas)}</div><div class="card"><h3>Participación por cargo</h3>${br(data.cargos)}</div></div>
       <div class="card"><h3>Participación por turno</h3>${br(data.turnos,'turnos')}</div>`}
       <p class="note">Los filtros se aplican solo a estadísticas agrupadas. Evita cruzar resultados de grupos pequeños o utilizar diferencias entre filtros para identificar respuestas.</p>`;
    ['area','cargo','turno'].forEach(id=>$('#filter-'+id).addEventListener('change',e=>{store.filters[id]=e.target.value;adminDashboard().catch(err=>$('#admin-content').innerHTML=banner(fail(err)));}));
    $('#reload').addEventListener('click',()=>adminDashboard());$('#print').addEventListener('click',()=>print());
    $('#export').disabled=!!data.suppressed;$('#export').addEventListener('click',()=>exportCSV(q));
  }
  function exportCSV(items){const cells=[['Dimensión','Pregunta','Participantes','Promedio','Favorables %','Desfavorables %']];for(const q of items)cells.push([q.dimension,q.text,q.n,q.average??'',q.favorable_pct??'',q.unfavorable_pct??'']);
    const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const text='\ufeff'+cells.map(row=>row.map(safe).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ESM_resultados_agrupados.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function adminQuestions(message=''){
    const list=await rpc('survey_admin_questions');store.adminQuestions=list;
    $('#admin-content').innerHTML=`<div class="section-label">GESTIÓN DE CUESTIONARIO</div><h2>Administrar preguntas</h2><p class="muted">Agrega, edita o archiva preguntas. Al editar una pregunta que ya tiene respuestas, se conserva una versión histórica.</p>
      ${message?banner(message,false):''}<div class="cols"><div class="card"><h3 id="form-title">Nueva pregunta</h3><form id="question-editor" class="form"><input type="hidden" id="q-id"><label class="form-label">Dimensión<input required minlength="3" maxlength="100" id="q-dimension" placeholder="Ej.: Confianza"></label><label class="form-label">Pregunta para trabajadores<textarea id="q-text" minlength="12" maxlength="350" required placeholder="Escribe una pregunta clara y específica"></textarea></label><div class="actions"><button class="button primary" type="submit" id="save-question">Guardar pregunta</button><button type="button" class="button" id="cancel-edit">Limpiar</button></div></form><div id="editor-feedback"></div></div>
      <div class="card"><h3>Preguntas activas e históricas</h3>${list.map(q=>`<div class="question-admin"><div><div class="q-meta">${esc(q.dimension)} · ${q.active?'ACTIVA':'ARCHIVADA'}</div><p>${esc(q.text)}</p></div><div class="actions"><button class="button small" data-edit="${esc(q.id)}">Editar</button><button class="button small ${q.active?'danger':''}" data-toggle="${esc(q.id)}">${q.active?'Archivar':'Reactivar'}</button></div></div>`).join('')}</div></div>`;
    $('#question-editor').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#save-question');btn.disabled=true;$('#editor-feedback').innerHTML='';try{
      await rpc('survey_admin_save_question',{p_id:$('#q-id').value||null,p_text:$('#q-text').value.trim(),p_dimension:$('#q-dimension').value.trim()});await adminQuestions('Pregunta guardada correctamente.');
    }catch(err){$('#editor-feedback').innerHTML=banner(fail(err));btn.disabled=false;}});
    $('#cancel-edit').addEventListener('click',()=>{$('#question-editor').reset();$('#q-id').value='';$('#form-title').textContent='Nueva pregunta';});
    document.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{const q=list.find(x=>x.id===btn.dataset.edit);if(!q)return;$('#q-id').value=q.id;$('#q-dimension').value=q.dimension;$('#q-text').value=q.text;$('#form-title').textContent='Editar pregunta';$('#question-editor').scrollIntoView({behavior:'smooth',block:'start'});}));
    document.querySelectorAll('[data-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{const q=list.find(x=>x.id===btn.dataset.toggle);if(!q)return;const verb=q.active?'archivar':'reactivar';if(!confirm(`¿Deseas ${verb} esta pregunta? Se conservarán los resultados históricos.`))return;btn.disabled=true;try{await rpc('survey_admin_toggle_question',{p_id:q.id,p_active:!q.active});await adminQuestions('Pregunta actualizada.');}catch(err){alert(fail(err));btn.disabled=false;}}));
  }

  // Los códigos legibles se muestran UNA SOLA VEZ después de generarse.
  // Nunca se almacenan en localStorage ni se envían al repositorio de GitHub.
  async function adminCodes(){
    const data=await rpc('survey_admin_dashboard',{p_area:null,p_cargo:null,p_turno:null});
    const available=Math.max(0,Number(data.codes_total||0)-Number(data.codes_redeemed||0));
    $('#admin-content').innerHTML=`<div class="section-label">ADMINISTRACIÓN DE ACCESOS</div><h2>Crear nuevos códigos</h2>
    <p class="muted">Cada código es individual y se puede activar una sola vez. No se solicita una contraseña general. No publiques este listado en GitHub.</p>
    <div class="metrics">${metric('Total registrados',data.codes_total,'Inicialmente 300 + nuevos lotes')}${metric('Ya utilizados',data.codes_redeemed,'Código activado por trabajador')}${metric('Sin utilizar',available,'Disponibles para distribución')}</div>
    <div class="cols"><div class="card"><h3>Generar códigos nuevos</h3><form id="create-codes" class="form"><label class="form-label">Cantidad nueva (1 a 100)<input type="number" id="code-quantity" min="1" max="100" step="1" value="10" required></label><button class="button primary" id="new-code-btn" type="submit">Generar códigos seguros</button></form><div id="codes-feedback"></div><p class="note">Para 300 códigos adicionales, genera tres lotes de 100. La base evita duplicados y los nuevos códigos quedan activos inmediatamente.</p></div>
    <div class="card"><h3>Entrega y custodia</h3><p>1. Genera el lote y descarga su CSV.</p><p>2. Conserva el archivo solo en un lugar restringido.</p><p>3. Entrega códigos distintos, sin asociarlos a nombres ni RUT.</p><p>4. No guardes los códigos en el repositorio de GitHub.</p><p class="note">Por diseño, un código perdido no puede recuperarse del sistema; deberá emitirse otro. Los códigos recién generados tienen formato ESM-XXXX-XXXX-XXXX-XXXX.</p></div></div>
    <div id="new-code-results" class="card" style="display:none"><h3>Códigos del lote recién creado</h3><div class="notice"><span class="icon">ⓘ</span><span>Esta es la única visualización de los códigos nuevos. Descárgalos antes de salir de esta sección.</span></div><label class="form-label">Lista para distribución<textarea id="new-codes-text" readonly rows="10" spellcheck="false"></textarea></label><div class="actions"><button class="button primary" type="button" id="download-codes">Descargar CSV de este lote</button><button class="button" type="button" id="copy-codes">Copiar lista</button></div></div>`;
    $('#create-codes').addEventListener('submit',async e=>{e.preventDefault();
      const n=Number($('#code-quantity').value); if(!Number.isInteger(n)||n<1||n>100){$('#codes-feedback').innerHTML=banner('Indica entre 1 y 100 códigos.');return;}
      if(store.newCodes?.length && !confirm('Hay un lote generado aún visible. ¿Ya descargaste su CSV? Al continuar se reemplazará la lista en pantalla.')) return;
      const btn=$('#new-code-btn');btn.disabled=true;$('#codes-feedback').innerHTML='';
      try{
        const codes=await rpc('survey_admin_generate_codes',{p_count:n});
        if(!Array.isArray(codes)||codes.length!==n)throw Error('No se obtuvo el lote completo. Revisa la base de datos antes de generar nuevamente.');
        store.newCodes=codes;
        $('#codes-feedback').innerHTML=banner('Se generaron '+n+' códigos nuevos. Descarga este lote ahora.',false);
        $('#new-code-results').style.display='block';$('#new-codes-text').value=codes.join('\n');
        btn.disabled=false;
        $('#new-code-results').scrollIntoView({block:'start',behavior:'smooth'});
      }catch(err){$('#codes-feedback').innerHTML=banner(fail(err));btn.disabled=false;}
    });
    $('#download-codes').addEventListener('click',()=>{
      if(!store.newCodes.length)return;
      const txt='N°;Código individual\r\n'+store.newCodes.map((c,i)=>`${i+1};${c}`).join('\r\n');
      const url=URL.createObjectURL(new Blob(['\ufeff'+txt],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='ESM_codigos_nuevos_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
    });
    $('#copy-codes').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(store.newCodes.join('\n'));$('#copy-codes').textContent='Copiado';}catch(e){$('#new-codes-text').select();}});
  }

  function adminQR(){const url=location.origin+location.pathname+'#encuesta';$('#admin-content').innerHTML=`<div class="section-label">DIFUSIÓN EN FAENA</div><h2>Enlace y código QR</h2><div class="qr-layout"><div class="card qr-frame"><h3>Escanea y participa</h3><div class="qr-code" id="qr-image"></div><p class="note">Este QR lleva a la encuesta, no al dashboard.</p></div><div class="card"><h3>Dirección web para trabajadores</h3><p class="url" id="share-url">${esc(url)}</p><div class="actions"><button class="button primary" id="copy-url">Copiar enlace</button><button class="button" id="print-qr">Imprimir QR</button></div><p class="muted">Distribuye un código diferente a cada trabajador. Evita asociar códigos con nombres o RUT.</p>${notice('Un trabajador completa una sola encuesta. Los resultados se muestran únicamente de forma agrupada.')}</div></div>`;
    if(window.QRCode){new window.QRCode($('#qr-image'),{text:url,width:230,height:230,colorDark:'#102c49',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});}
    else $('#qr-image').textContent='No se pudo cargar el generador QR. Puedes compartir el enlace.';
    $('#copy-url').addEventListener('click',()=>navigator.clipboard?.writeText(url).then(()=>{$('#copy-url').textContent='¡Copiado!';}).catch(()=>prompt('Copia el enlace:',url)));
    $('#print-qr').addEventListener('click',()=>print());
  }
  window.addEventListener('hashchange',init);
  init();
})();
