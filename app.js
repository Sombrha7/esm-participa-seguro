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
  const store={status:'none',questions:[],areas:[],cargos:[],answers:{},admin:false,tab:'dashboard',filters:{area:'',cargo:'',turno:''},adminQuestions:[],adminOptions:null,dashboard:null,newCodes:[],responseFilters:{area:'',cargo:'',turno:'',from:'',to:''}};
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
  function pageIntro(){return `<section class="hero"><div class="eyebrow">ESM · CULTURA PREVENTIVA</div><h1>Tu voz también protege.</h1><p>Queremos conocer tu experiencia y percepción sobre la seguridad en el trabajo. Responde las siguientes preguntas con sinceridad.</p></section>`;}
  async function init(){
    toggleNav();
    root.classList.toggle('admin-main',route()==='admin');
    document.body.classList.toggle('admin-view',route()==='admin');
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
      root.innerHTML=intro+`<div class="card complete"><div class="check">✓</div><h2>¡Gracias por participar!</h2><p>Tu encuesta fue recibida. No se guarda junto a tu código de acceso.</p>${notice('El panel administrativo analiza las respuestas por área, cargo y turno. No se solicita nombre, RUT ni correo electrónico.')}<button class="button primary" type="button" id="new-survey">Realizar otra encuesta →</button></div>`;
      $('#new-survey').addEventListener('click',()=>{
        // El código anterior permanece consumido en Supabase. Solo se limpia
        // el comprobante de ESTA pestaña para que participe otra persona.
        clearTicket();
        store.status='none';
        store.answers={};
        store.questions=[];
        store.areas=[];
        store.cargos=[];
        if(location.hash!=='#encuesta') history.replaceState(null,'',location.pathname+location.search+'#encuesta');
        renderWorker();
        window.scrollTo(0,0);
      });
      return;
    }
    if(store.status!=='ready'){
      root.innerHTML=intro+`<div class="card entry-card"><div class="section-label">ACCESO CONFIDENCIAL</div><h2>Ingresa a la encuesta</h2><p class="muted">Ingresa únicamente con tu código individual autorizado. No solicitamos contraseña, nombre, RUT ni correo electrónico.</p>
      <form id="access-form" class="form"><label class="form-label">Código único de acceso<input id="code" required maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ESM-XXXX-XXXX-XXXX"></label>
      <button class="button primary" type="submit" id="enter">Ingresar a la encuesta →</button></form><div id="form-feedback">${error?banner(error):success?banner(success,false):''}</div>
      ${notice('Esta encuesta busca mejorar la seguridad. No se solicita nombre, RUT ni correo. Área, cargo y turno se utilizan para el análisis administrativo; en grupos muy pequeños, el contexto podría permitir inferencias.')}</div>`;
      $('#access-form').addEventListener('submit',async e=>{e.preventDefault();const submit=$('#enter');submit.disabled=true;$('#form-feedback').innerHTML='';try{
        const result=await rpc('survey_code_claim',{p_code:$('#code').value.trim().toUpperCase()});
        if(result?.status!=='ready'||!result?.ticket)throw Error('Código no autorizado o ya utilizado. Verifica que corresponda al listado oficial de ESM.');
        saveTicket(result.ticket);
        store.status='ready';store.answers={};await loadQuestionnaire();renderWorker();
      }catch(e){$('#form-feedback').innerHTML=banner(fail(e));submit.disabled=false;}});return;
    }
    const questions=store.questions.map((q,i)=>{
      const required=q.required!==false;
      if(q.type==='text')return `<div class="question"><div class="tag">PREGUNTA ${i+1} DE ${store.questions.length} · ${esc(q.dimension)} · OPCIONAL</div><h3>${esc(q.text)}</h3><label class="form-label"><textarea name="q-${esc(q.id)}" maxlength="1500" rows="5" placeholder="Puedes escribir una sugerencia breve (opcional)">${esc(store.answers[q.id]||'')}</textarea></label></div>`;
      const options=Array.isArray(q.choices)&&q.choices.length?q.choices.map(c=>({value:String(c.id),label:c.text})):ratings.map(r=>({value:String(r.value),label:r.label}));
      return `<div class="question"><div class="tag">PREGUNTA ${i+1} DE ${store.questions.length} · ${esc(q.dimension)}</div><h3>${esc(q.text)}</h3><div class="rating" role="group" aria-label="${esc(q.text)}">${options.map(o=>`<label class="choice"><input type="radio" name="q-${esc(q.id)}" value="${esc(o.value)}" ${String(store.answers[q.id]??'')===o.value?'checked':''} ${required?'required':''}><span>${esc(o.label)}</span></label>`).join('')}</div></div>`;
    }).join('');
    root.innerHTML=intro+`<section class="card"><div class="section-label">ENCUESTA DE EMPODERAMIENTO EN SEGURIDAD</div><h2>Cuéntanos tu experiencia</h2><p class="muted">Selecciona tu área de trabajo, cargo y turno. Después, responde las preguntas según lo que ocurre realmente.</p>
      ${notice('Encuesta sin nombre, RUT ni correo. El código no se guarda junto a las respuestas. Área, cargo y turno quedan asociados a la encuesta para el análisis administrativo confidencial.')}
      <form id="survey-form" class="form"><div class="form-grid"><label class="form-label">Área<select name="area" required>${selectOptions(store.areas,'','Selecciona tu área')}</select></label>
      <label class="form-label">Cargo<select name="cargo" required>${selectOptions(store.cargos,'','Selecciona tu cargo')}</select></label>
      <label class="form-label">Turno<select name="turno" required><option value="">Selecciona tu turno</option><option value="A">Turno A</option><option value="B">Turno B</option></select></label></div>
      <div>${questions}</div><div id="form-feedback">${error?banner(error):''}</div><div class="survey-actions"><span class="note">Al enviar, el código queda utilizado y no permite otra encuesta.</span><button id="submit-survey" class="button primary" type="submit">Enviar respuestas →</button></div></form>
    </section>`;
    $('#survey-form').addEventListener('change',e=>{if(e.target.name?.startsWith('q-')){const id=e.target.name.slice(2);store.answers[id]=e.target.value;}});
    $('#survey-form').addEventListener('input',e=>{if(e.target.name?.startsWith('q-')){const id=e.target.name.slice(2);store.answers[id]=e.target.value;}});
    $('#survey-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const values=new FormData(f);const answers={};store.questions.forEach(q=>{const key='q-'+q.id;if(values.has(key)){const value=String(values.get(key)??'');if(q.type!=='text'||value.trim())answers[q.id]=q.type==='text'?value.trim():value;}});
      const missing=store.questions.some(q=>q.required!==false&&!Object.prototype.hasOwnProperty.call(answers,q.id));
      if(missing){$('#form-feedback').innerHTML=banner('Falta responder una o más preguntas obligatorias.');return;}
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
      <nav class="admin-tabs" aria-label="Secciones de administración"><button data-tab="dashboard" class="${store.tab==='dashboard'?'active':''}">▤ Análisis estratégico</button><button data-tab="responses" class="${store.tab==='responses'?'active':''}">◫ Gestión de respuestas</button><button data-tab="questions" class="${store.tab==='questions'?'active':''}">☷ Preguntas</button><button data-tab="codes" class="${store.tab==='codes'?'active':''}">♯ Códigos</button><button data-tab="qr" class="${store.tab==='qr'?'active':''}">▦ Enlace y QR</button></nav><section id="admin-content"></section>`;
    $('#logout').addEventListener('click',adminLogout);
    document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{if(store.tab==='codes' && store.newCodes?.length && !confirm('¿Ya descargaste el lote de códigos? Al salir no podrás volver a visualizarlos.'))return; if(store.tab==='codes')store.newCodes=[];store.tab=el.dataset.tab;renderAdmin();}));
    $('#admin-content').innerHTML='<div class="card loading"><span class="spinner"></span></div>';
    try{if(store.tab==='dashboard')await adminDashboard();else if(store.tab==='responses')await adminResponses();else if(store.tab==='questions')await adminQuestions();else if(store.tab==='codes')await adminCodes();else adminQR();}catch(e){$('#admin-content').innerHTML=`<div class="card">${banner(fail(e))}<button class="button" id="refresh">Reintentar</button></div>`;$('#refresh')?.addEventListener('click',()=>renderAdmin());}
  }
  function metric(label,value,desc){return `<article class="metric"><div class="m-label">${esc(label)}</div><strong>${esc(number(value))}</strong><div class="m-sub">${esc(desc)}</div></article>`;}
  // Dashboard estratégico: el universo son las ENCUESTAS recibidas, jamás los códigos emitidos.
  const scoreClass=pct=>pct==null?'off':Number(pct)>=80?'':Number(pct)>=60?'warn':'low';
  const pctText=v=>v==null?'—':number(v)+'%';
  const mkPill=v=>`<span class="pill ${scoreClass(v)}">${esc(pctText(v))}</span>`;
  const countValid=x=>Number(x?.valid_n||0);
  const round1=n=>Math.round(Number(n||0)*10)/10;
  function questionAction(q){
    const key=String(q.key||'');
    if(key==='EMP2_01')return 'Conviene reforzar con ejemplos prácticos cuándo detener, cómo informar y qué respaldo existe.';
    if(key==='EMP2_02')return 'Conviene revisar el respaldo visible de la línea de mando y practicar conversaciones de detención sin consecuencias negativas.';
    if(key==='EMP2_03')return 'Conviene verificar si los reportes están generando controles antes de continuar y conversar los casos sin buscar culpables.';
    if(key==='EMP2_04')return 'Conviene reforzar el canal, responsable y tiempo esperado para reportar una condición insegura.';
    if(key==='EMP2_05')return 'Conviene alinear con operaciones que la urgencia no reemplaza la evaluación ni la aplicación de controles.';
    if(key==='EMP2_06')return 'Conviene verificar quién autoriza el reinicio y cómo se comprueba la eficacia de los controles.';
    if(key==='EMP2_07')return 'Conviene difundir y practicar la cadena alternativa de escalamiento cuando la jefatura directa no está disponible.';
    return 'Conviene revisar la tendencia con el equipo y acordar una medida verificable.';
  }
  function operationalConclusion(q,total){
    const choices=(q.choices||[]).map(c=>({...c,n:Number(c.n||0),score:c.score==null?null:Number(c.score)}));
    const answered=Number(total||0);
    if(!answered)return 'Aún no existen respuestas para elaborar una conclusión.';
    const ranked=choices.slice().sort((a,b)=>b.n-a.n||Number(a.position)-Number(b.position));
    const top=ranked[0];
    const second=ranked[1];
    const topPct=round1(top.n*100/answered);
    const valid=choices.filter(c=>c.score!=null).reduce((sum,c)=>sum+c.n,0);
    const favorable=choices.filter(c=>c.score!=null&&c.score>=4).reduce((sum,c)=>sum+c.n,0);
    const attention=choices.filter(c=>c.score!=null&&c.score<=2).reduce((sum,c)=>sum+c.n,0);
    const na=answered-valid;
    const favorablePct=valid?round1(favorable*100/valid):null;
    const attentionPct=valid?round1(attention*100/valid):null;
    const sample=answered<5?`Con ${answered} respuestas, la tendencia es preliminar y todavía no representa a toda la dotación. `:'';
    let tendency;
    if(top.n===second?.n&&top.n>0)tendency=`Las respuestas se distribuyen principalmente entre “${top.text}” y “${second.text}”. `;
    else if(topPct>50)tendency=`La mayoría se inclina por “${top.text}” (${topPct}%). `;
    else tendency=`La alternativa más seleccionada es “${top.text}” (${topPct}%), sin constituir una mayoría clara. `;
    let interpretation='';
    if(valid){
      if(attentionPct>=25)interpretation=`El ${attentionPct}% de las respuestas válidas se concentra en alternativas que pueden reflejar una brecha de ${String(q.dimension||'esta dimensión').toLowerCase()}. `;
      else if(favorablePct>=70)interpretation=`Predomina una percepción favorable (${favorablePct}% de las respuestas válidas), aunque conviene mantener el refuerzo y observar cambios. `;
      else interpretation=`El resultado es mixto: existe una base favorable de ${favorablePct}%, pero todavía no hay una percepción plenamente consolidada. `;
    }
    const noExperience=na?`${na} respuesta${na===1?'':'s'} corresponde${na===1?'':'n'} a “no aplica/no ha ocurrido”, por lo que la base interpretativa efectiva es menor. `:'';
    return sample+tendency+interpretation+noExperience+questionAction(q);
  }
  function segmentComparison(q,allRows){
    const rows=(allRows||[]).filter(x=>String(x.question_id)===String(q.id));
    const label={area:'Área/faena',cargo:'Cargo',turno:'Turno'};
    if(!rows.length)return `<details class="segment-details" open><summary>Gráficos por área, cargo y turno</summary><p class="note">Todavía no existen respuestas clasificadas para esta pregunta.</p></details>`;
    const grouped=new Map();
    for(const r of rows){
      const key=r.axis+'|'+r.segment;
      if(!grouped.has(key))grouped.set(key,{axis:r.axis,name:r.segment,n:Number(r.segment_n||0),counts:new Map(),attention:0,valid:0});
      const g=grouped.get(key),n=Number(r.n||0),score=r.score==null?null:Number(r.score);
      g.counts.set(String(r.choice_id),n);
      if(score!=null){g.valid+=n;if(score<=2)g.attention+=n;}
    }
    const groups=[...grouped.values()].map(g=>({...g,attentionPct:g.valid?round1(g.attention*100/g.valid):null}));
    const legend=(q.choices||[]).map(c=>`<span><i class="seg-color seg-c${esc(c.position)}"></i>${esc(c.text)}</span>`).join('');
    const panels=['area','cargo','turno'].map(axis=>{
      const list=groups.filter(g=>g.axis===axis).sort((a,b)=>(b.attentionPct??-1)-(a.attentionPct??-1)||a.name.localeCompare(b.name,'es'));
      if(!list.length)return `<section class="segment-axis"><h4>Gráfico por ${esc(label[axis])}</h4><p class="note">Sin respuestas clasificadas en este eje.</p></section>`;
      const bars=list.map(g=>{
        const pieces=(q.choices||[]).map(c=>{const n=Number(g.counts.get(String(c.id))||0),pct=g.n?round1(n*100/g.n):0;return pct?`<span class="seg-piece seg-c${esc(c.position)}" style="width:${pct}%" title="${esc(c.text)}: ${esc(n)} (${esc(pct)}%)"></span>`:''}).join('');
        return `<div class="segment-row"><div class="segment-row-head"><strong>${esc(g.name)}</strong><span>N=${esc(g.n)}${g.attentionPct==null?'':` · señal de refuerzo ${esc(g.attentionPct)}%`}</span></div><div class="segment-bar">${pieces}</div></div>`;
      }).join('');
      return `<section class="segment-axis"><h4>Gráfico por ${esc(label[axis])}</h4>${bars}</section>`;
    }).join('');
    const ranked=groups.filter(g=>g.attentionPct!=null).sort((a,b)=>b.attentionPct-a.attentionPct||b.n-a.n);
    const focus=ranked[0]&&ranked[0].attentionPct>0?`Mayor señal observada de refuerzo: ${label[ranked[0].axis]} “${ranked[0].name}” (${ranked[0].attentionPct}%, N=${ranked[0].n}).`:'No se observan señales críticas en los grupos analizados.';
    return `<details class="segment-details" open><summary>Gráficos por área, cargo y turno</summary><p class="note confidentiality-note"><strong>Vista administrativa confidencial:</strong> se muestran resultados desde N=1. Un grupo pequeño puede permitir inferir una respuesta por contexto; no difundas capturas ni resultados individuales.</p><div class="segment-legend">${legend}</div><div class="segment-focus">${esc(focus)}</div><div class="segment-panels">${panels}</div></details>`;
  }
  function participationAxes(segments,questions){
    const first=(questions||[]).find(q=>q.type==='single_choice');
    const axes={area:new Map(),cargo:new Map(),turno:new Map()};
    if(!first)return {area:[],cargo:[],turno:[]};
    for(const r of segments||[]){
      if(String(r.question_id)!==String(first.id)||!axes[r.axis])continue;
      const name=String(r.segment||'Sin especificar').trim()||'Sin especificar';
      if(!axes[r.axis].has(name))axes[r.axis].set(name,Number(r.segment_n||0));
    }
    return Object.fromEntries(Object.entries(axes).map(([axis,map])=>[axis,[...map].map(([name,n])=>({name,n})).sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name,'es'))]));
  }
  function compactParticipation(items){
    if((items||[]).length<=5)return items||[];
    const visible=items.slice(0,5);
    visible.push({name:`Otros (${items.length-5} grupos)`,n:items.slice(5).reduce((sum,x)=>sum+Number(x.n||0),0)});
    return visible;
  }
  function participationPanel(title,axis,items,total){
    const rows=compactParticipation(items).map(x=>{
      const pct=total?round1(Number(x.n||0)*100/total):0;
      return `<div class="executive-row"><div class="executive-row-head"><strong>${esc(x.name)}</strong><span>${esc(x.n)} · ${esc(pct)}%</span></div><div class="executive-track"><span class="executive-fill executive-${esc(axis)}" style="width:${Math.max(pct?3:0,Math.min(100,pct))}%"></span></div></div>`;
    }).join('');
    return `<section class="executive-axis"><h4>${esc(title)}</h4>${rows||'<p class="note">Aún no existen respuestas clasificadas.</p>'}</section>`;
  }
  function executiveParticipation(segments,questions,total){
    const axes=participationAxes(segments,questions);
    const coverage=`${axes.area.length} área${axes.area.length===1?'':'s'} · ${axes.cargo.length} cargo${axes.cargo.length===1?'':'s'} · ${axes.turno.length} turno${axes.turno.length===1?'':'s'}`;
    return {axes,html:`<section class="card executive-summary"><div class="executive-heading"><div><div class="section-label">RESUMEN EJECUTIVO</div><h3>Participación por variables operativas</h3><p class="note">Distribución de las encuestas analizadas. Estas barras muestran participación, no nivel de desempeño ni cumplimiento.</p></div><div class="executive-coverage"><strong>${esc(total)}</strong><span>encuestas</span><small>${esc(coverage)}</small></div></div><div class="executive-grid">${participationPanel('Por área/faena','area',axes.area,total)}${participationPanel('Por cargo','cargo',axes.cargo,total)}${participationPanel('Por turno','turno',axes.turno,total)}</div></section>`};
  }
  const advice=dim=>{
    const s=String(dim||'').toLowerCase();
    if(s.includes('autoridad'))return 'Reforzar la facultad de detener una tarea insegura.';
    if(s.includes('respaldo')||s.includes('jefatura'))return 'Revisar el respaldo explícito de la supervisión.';
    if(s.includes('confianza'))return 'Fortalecer una cultura sin represalias y escuchar al equipo.';
    if(s.includes('conocimiento'))return 'Practicar cómo detener, informar y escalar condiciones inseguras.';
    if(s.includes('efectividad')||s.includes('gestión'))return 'Verificar correcciones antes de reiniciar los trabajos.';
    return 'Revisar el resultado con el equipo y acordar medidas verificables.';
  };
  function priorityCards(data){
    const list=[];
    for(const [axis,title] of [['areas','Área'],['cargos','Cargo'],['turnos','Turno']]){
      if(data[axis]?.protected)continue;
      for(const r of data[axis]?.matrix||[]){
        if(r.favorable_pct==null||Number(r.favorable_pct)>=80||countValid(r)<5)continue;
        list.push({...r,axis,title});
      }
    }
    list.sort((a,b)=>Number(a.favorable_pct)-Number(b.favorable_pct)||Number(b.valid_n)-Number(a.valid_n));
    // Evitar tres alertas iguales por la misma combinación.
    const used=new Set();
    const cards=[];
    for(const x of list){
      const key=x.axis+'|'+x.name+'|'+x.question_id;
      if(used.has(key))continue;used.add(key);
      cards.push(`<div class="priority-item"><div><div class="priority-meta">${esc(x.title)} · ${esc(x.name)} · ${esc(x.dimension)} · ${esc(x.valid_n)} respuestas válidas</div><strong>${esc(advice(x.dimension))}</strong></div>${mkPill(x.favorable_pct)}</div>`);
      if(cards.length===5)break;
    }
    if(!cards.length)return '<p class="muted">Sin brechas publicables bajo el criterio interno del 80%. Los segmentos pequeños permanecen protegidos.</p>';
    return cards.join('');
  }
  function axisPanel(axisObj, label, questions, axisType){
    if(axisObj?.protected)return `<section class="card"><h3>${esc(label)}</h3><p class="muted">Desglose protegido: al menos un grupo tiene menos de 5 encuestas. No mostramos resultados parciales que permitan inferir respuestas.</p></section>`;
    const segments=axisObj?.segments||[];
    if(!segments.length)return `<section class="card"><h3>${esc(label)}</h3><p class="muted">Todavía no hay grupos con información suficiente.</p></section>`;
    const cells=new Map((axisObj.matrix||[]).map(x=>[x.name+'|'+x.question_id,x]));
    const head=questions.map(q=>`<th title="${esc(q.text)}">P${esc(q.position)} · ${esc(q.dimension)}</th>`).join('');
    const rows=segments.map(s=>`<tr><th scope="row">${esc(axisType==='turnos'?'Turno '+s.name:s.name)}</th><td>${esc(s.n)}</td><td>${mkPill(s.favorable_pct)}</td>${questions.map(q=>{
      const v=cells.get(s.name+'|'+q.id);
      return `<td>${v&&v.favorable_pct!=null?`<span class="heat ${scoreClass(v.favorable_pct)}" title="${esc(q.text)} · ${esc(v.valid_n)} respuestas válidas">${esc(pctText(v.favorable_pct))}</span>`:'<span class="hidden-stat" title="Sin mínimo publicable">—</span>'}</td>`;
    }).join('')}</tr>`).join('');
    return `<section class="card strategic-section"><h3>${esc(label)}</h3><p class="note">Ordenado por menor favorabilidad general. Cada celda muestra la favorabilidad de esa pregunta dentro del grupo; “—” indica dato protegido o sin base suficiente.</p>
      <div class="table-wrap"><table class="table matrix-table"><thead><tr><th>Grupo</th><th>Encuestas</th><th>General</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  async function adminLegacyDashboard(){
    const args={p_area:store.filters.area||null,p_cargo:store.filters.cargo||null,p_turno:store.filters.turno||null};
    const [opts,data]=await Promise.all([rpc('survey_admin_options'),rpc('survey_admin_insights',args)]);
    store.adminOptions=opts;store.dashboard=data;
    const f=store.filters;
    const filtered=Object.values(f).some(Boolean);
    const q=(data.questions||[]).slice().sort((a,b)=>Number(a.position)-Number(b.position));
    const ranked=q.slice().sort((a,b)=>Number(a.favorable_pct)-Number(b.favorable_pct));
    const fmtBar=x=>`<div class="breakdown"><span class="name" title="${esc(x.text)}">${esc(x.dimension)}</span><span class="track"><span class="fill ${scoreClass(x.favorable_pct)}" style="width:${Math.max(0,Math.min(100,Number(x.favorable_pct)||0))}%"></span></span><strong>${esc(pctText(x.favorable_pct))}</strong></div>`;
    const weak=ranked.find(x=>x.favorable_pct!=null);
    const detail=q.map(x=>`<tr><td>P${esc(x.position)}</td><td><strong>${esc(x.dimension)}</strong><div class="note">${esc(x.text)}</div></td><td>${esc(x.n)}</td><td>${esc(x.valid_n)}</td><td>${mkPill(x.favorable_pct)}</td><td>${esc(pctText(x.unfavorable_pct))}</td><td>${esc(pctText(x.neutral_pct))}</td><td>${esc(x.na_n)}</td></tr>`).join('');
    $('#admin-content').innerHTML=`<div class="toolbar"><div><div class="section-label">DASHBOARD ESTRATÉGICO · ESM</div><h2>¿Dónde debemos reforzar la seguridad?</h2><p class="note">Base: encuestas efectivamente respondidas. Sin metas ni porcentajes calculados sobre los códigos distribuidos.</p></div><div class="actions"><button class="button" id="export">↓ Descargar resumen</button><button class="button" id="print">▣ Imprimir</button><button class="button" id="reload">↻ Actualizar</button></div></div>
      <div class="filters"><label class="form-label">Área<select id="filter-area">${selectOptions(opts.areas,f.area,'Todas las áreas')}</select></label><label class="form-label">Cargo<select id="filter-cargo">${selectOptions(opts.cargos,f.cargo,'Todos los cargos')}</select></label><label class="form-label">Turno<select id="filter-turno">${selectOptions(['A','B'],f.turno,'Ambos turnos')}</select></label></div>
      <div class="metrics">${metric('Encuestas recibidas',data.responses_total,'Total global de encuestas completas')}${metric('Encuestas de la selección',data.suppressed?'Protegido':data.selected_n,filtered?'Con filtros actuales':'Sin filtros')}${metric('Favorabilidad',data.suppressed?'Protegido':pctText(data.favorable_pct),'Respuestas 4 y 5 / respuestas válidas')}${metric('Desacuerdo',data.suppressed?'Protegido':pctText(data.unfavorable_pct),'Respuestas 1 y 2 / respuestas válidas')}${metric('Foco principal',data.suppressed?'Protegido':weak?.dimension||'—','Pregunta con menor favorabilidad publicable')}</div>
      ${data.suppressed?`<div class="card privacy"><div class="lock">🔒</div><div><strong>Resultados protegidos</strong><p>Hay menos de cinco encuestas en la selección actual. Puedes ver el total global, pero aún no porcentajes por pregunta, área, cargo o turno.</p><p class="note">Completa más encuestas o utiliza una selección más amplia. No es necesario generar más códigos para calcular estos indicadores.</p></div></div>`:
      `<div class="cols"><section class="card"><h3>Preguntas que requieren atención</h3><p class="note">Orden de menor a mayor favorabilidad. Comparación de respuestas válidas (1 a 5), excluyendo “No sé / No aplica”.</p>${ranked.length?ranked.map(fmtBar).join(''):'<p class="muted">Las preguntas todavía no alcanzan el mínimo de cinco respuestas válidas.</p>'}</section>
      <section class="card"><h3>Prioridad para jefaturas y SSMA</h3>${priorityCards(data)}<p class="note">Las medidas son orientativas: contrastar con observaciones en terreno antes de decidir una intervención.</p></section></div>
      <section class="card strategic-section"><h3>Detalle de cada pregunta</h3><p class="note">Favorabilidad: 4–5; desacuerdo: 1–2; neutral: 3. “No aplica”: 0, no integra el denominador de porcentajes.</p><div class="table-wrap"><table class="table"><thead><tr><th>N.º</th><th>Pregunta / dimensión</th><th>Encuestas</th><th>Válidas</th><th>Favorables</th><th>Desacuerdo</th><th>Neutral</th><th>No aplica</th></tr></thead><tbody>${detail||'<tr><td colspan="8">Aún no hay datos suficientes.</td></tr>'}</tbody></table></div></section>
      <div class="strategic-panels">${axisPanel(data.areas,'Comparación estratégica por área',q,'areas')}${axisPanel(data.cargos,'Comparación estratégica por cargo',q,'cargos')}${axisPanel(data.turnos,'Comparación por turno A / B',q,'turnos')}</div>`}
      <p class="note privacy-note">Privacidad: se muestran solo agregados de grupos con un mínimo de 5 encuestas y, para cada pregunta, 5 respuestas válidas. Se oculta un eje completo si algún segmento tiene menos de 5 encuestas. Evita comparar filtros para inferir respuestas individuales. Estos criterios son internos, no resultados CEAL-SM/SUSESO.</p>`;
    ['area','cargo','turno'].forEach(id=>$('#filter-'+id).addEventListener('change',e=>{store.filters[id]=e.target.value;adminDashboard().catch(err=>$('#admin-content').innerHTML=banner(fail(err)));}));
    $('#reload').addEventListener('click',()=>adminDashboard());$('#print').addEventListener('click',()=>print());
    $('#export').disabled=!!data.suppressed;$('#export').addEventListener('click',()=>exportInsightsCSV(data));
  }
  function exportInsightsCSV(data){
    const cols=[['Tipo','Área/Cargo/Turno','Dimensión','Pregunta','Encuestas','Respuestas válidas','Favorables %','Desacuerdo %','Neutrales %']];
    for(const q of data.questions||[])cols.push(['Pregunta','General',q.dimension,q.text,q.n,q.valid_n,q.favorable_pct,q.unfavorable_pct,q.neutral_pct]);
    for(const [name,obj] of [['Área',data.areas],['Cargo',data.cargos],['Turno',data.turnos]]){
      if(obj?.protected)continue;
      for(const x of obj?.segments||[])cols.push([name,x.name,'Resumen','',x.n,x.valid_n,x.favorable_pct,x.unfavorable_pct,'']);
      for(const x of obj?.matrix||[])cols.push([name+' - Pregunta',x.name,x.dimension,x.text,x.n,x.valid_n,x.favorable_pct,x.unfavorable_pct,'']);
    }
    const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const csv='\ufeff'+cols.map(row=>row.map(safe).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='ESM_dashboard_encuestas_agrupadas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function adminDashboard(){
    const args={p_area:store.filters.area||null,p_cargo:store.filters.cargo||null,p_turno:store.filters.turno||null};
    let data;
    try{data=await rpc('survey_admin_operational_results',args);}
    catch(err){
      // Compatibilidad durante la publicación: antes de ejecutar la migración
      // de Supabase se mantiene disponible el dashboard anterior.
      if(/survey_admin_operational_results|schema cache|function/i.test(fail(err)))return adminLegacyDashboard();
      throw err;
    }
    const [opts,segments]=await Promise.all([
      rpc('survey_admin_options'),
      rpc('survey_admin_operational_segments',args).catch(()=>[])
    ]);
    data.segments=segments||[];
    store.adminOptions=opts;store.dashboard=data;
    const f=store.filters;
    const filtered=Object.values(f).some(Boolean);
    const questions=(data.questions||[]).slice().sort((a,b)=>Number(a.position)-Number(b.position));
    const participation=executiveParticipation(data.segments,questions,Number(data.selected_n||0));
    const participatingCargos=participation.axes.cargo.length;
    const choiceSections=questions.filter(q=>q.type==='single_choice').map(q=>{
      const total=Number(q.answered_n||0);
      const rows=(q.choices||[]).map(c=>{
        const n=Number(c.n||0);const pct=total?Math.round(n*1000/total)/10:0;
        return `<div class="answer-row"><div><strong>${esc(c.text)}</strong><div class="note">${esc(n)} respuesta${n===1?'':'s'} · ${esc(pct)}%</div></div><span class="track"><span class="fill" style="display:block;width:${Math.max(0,Math.min(100,pct))}%"></span></span></div>`;
      }).join('');
      return `<section class="card operational-question"><div class="q-meta">PREGUNTA ${esc(q.position)} · ${esc(q.dimension)} · N=${esc(total)}</div><h3>${esc(q.text)}</h3><div class="analysis-note"><div><span>QUÉ BUSCA</span><p>${esc(q.purpose||'Explorar esta dimensión de la experiencia de seguridad.')}</p></div><div><span>QUÉ PUEDE REFLEJAR</span><p>${esc(q.guidance||'Una oportunidad para conversar con el equipo y revisar prácticas de trabajo.')}</p></div></div><div class="answer-list">${rows||'<p class="muted">Aún no hay respuestas.</p>'}</div><div class="current-reading"><strong>Conclusión orientativa</strong><p>${esc(operationalConclusion(q,total))}</p></div>${segmentComparison(q,segments)}</section>`;
    }).join('');
    const comments=(data.comments||[]).map((x,i)=>`<div class="comment-item"><strong>Comentario ${i+1}</strong><p>${esc(x)}</p></div>`).join('');
    $('#admin-content').innerHTML=`<div class="toolbar"><div><div class="section-label">RESULTADOS OPERACIONALES · ESM</div><h2>Percepción y prácticas de seguridad</h2><p class="note">El resultado general y los gráficos por área, cargo y turno se muestran desde la primera respuesta. Vista administrativa confidencial.</p></div><div class="actions"><button class="button" id="export">↓ Exportar Excel</button><button class="button" id="print">▣ Imprimir</button><button class="button" id="reload">↻ Actualizar</button></div></div>
      <div class="filters"><label class="form-label">Área<select id="filter-area">${selectOptions(opts.areas,f.area,'Todas las áreas')}</select></label><label class="form-label">Cargo<select id="filter-cargo">${selectOptions(opts.cargos,f.cargo,'Todos los cargos')}</select></label><label class="form-label">Turno<select id="filter-turno">${selectOptions(['A','B'],f.turno,'Ambos turnos')}</select></label></div>
      <div class="metrics">${metric('Encuestas recibidas',data.responses_total,'Respuestas de la nueva versión')}${metric('Encuestas analizadas',data.suppressed?'Protegido':data.selected_n,filtered?'Selección filtrada':'Resultado general')}${metric('Dimensiones evaluadas',questions.filter(q=>q.type==='single_choice').length,'Una pregunta por dimensión')}${metric('Cargos participando',participatingCargos,'Con al menos una encuesta')}</div>
      ${data.suppressed?`<div class="card privacy"><div class="lock">🔒</div><div><strong>Resultados protegidos</strong><p>La selección contiene menos de cinco encuestas. Amplía el filtro o reúne más respuestas para evitar la identificación indirecta.</p></div></div>`:`${participation.html}<div class="operational-grid">${choiceSections}</div>${comments?`<section class="card"><h3>Sugerencias abiertas históricas</h3><p class="note">Los comentarios no incluyen nombre, RUT, código ni correo. Revisa si el propio texto contiene datos personales antes de compartirlo.</p>${comments}</section>`:''}`}
      <p class="note privacy-note">Uso ético: interpreta tendencias y brechas colectivas. Las alternativas no se presentan como respuestas “buenas” o “malas” y no deben utilizarse para sancionar trabajadores.</p>`;
    ['area','cargo','turno'].forEach(id=>$('#filter-'+id).addEventListener('change',e=>{store.filters[id]=e.target.value;adminDashboard().catch(err=>$('#admin-content').innerHTML=banner(fail(err)));}));
    $('#reload').addEventListener('click',()=>adminDashboard());$('#print').addEventListener('click',()=>print());
    $('#export').disabled=!!data.suppressed;$('#export').addEventListener('click',()=>exportOperationalExcel(data));
  }
  async function exportOperationalExcel(data){
    const rows=[];
    for(const q of data.questions||[]){
      if(q.type!=='single_choice')continue;
      const total=Number(q.answered_n||0);
      for(const c of q.choices||[])rows.push({Pregunta:q.position,Dimensión:q.dimension,'Qué busca':q.purpose||'','Qué puede reflejar':q.guidance||'',Texto:q.text,Alternativa:c.text,Respuestas:Number(c.n||0),'Porcentaje':total?Math.round(Number(c.n||0)*1000/total)/10:0,'Total pregunta':total});
    }
    const comments=(data.comments||[]).map((x,i)=>({N:i+1,Comentario:x}));
    if(!window.XLSX){
      try{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}catch(_){/* Si el CDN falla, se entrega CSV compatible con Excel. */}
    }
    if(window.XLSX){
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Resultados');
      const segmentRows=(data.segments||[]).map(x=>({Pregunta:(data.questions||[]).find(q=>String(q.id)===String(x.question_id))?.position||'',Eje:x.axis,Grupo:x.segment,'N grupo':x.segment_n,Alternativa:x.choice_text,Respuestas:x.n,Puntaje:x.score??''}));
      if(segmentRows.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(segmentRows),'Comparación grupos');
      const participation=participationAxes(data.segments,data.questions||[]);
      const participationRows=[];
      for(const [axis,items] of Object.entries(participation))for(const x of items)participationRows.push({Eje:axis==='area'?'Área/faena':axis==='cargo'?'Cargo':'Turno',Grupo:x.name,Encuestas:x.n,Porcentaje:data.selected_n?round1(Number(x.n||0)*100/Number(data.selected_n)):0});
      if(participationRows.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(participationRows),'Participación');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(comments),'Comentarios');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Encuestas recibidas',data.responses_total],['Encuestas analizadas',data.selected_n],['Preguntas vigentes',7],['Cargos participando',participation.cargo.length],['Generado',new Date().toLocaleString('es-CL')]]),'Resumen');
      XLSX.writeFile(wb,'ESM_resultados_encuesta_operacional.xlsx');
      return;
    }
    const safe=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const csv='\ufeff'+[['Pregunta','Dimensión','Qué busca','Qué puede reflejar','Texto','Alternativa','Respuestas','Porcentaje','Total pregunta'],...rows.map(r=>[r.Pregunta,r.Dimensión,r['Qué busca'],r['Qué puede reflejar'],r.Texto,r.Alternativa,r.Respuestas,r.Porcentaje,r['Total pregunta']])].map(r=>r.map(safe).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ESM_resultados_encuesta_operacional.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  // Gestión de respuestas: nunca muestra registros individuales ni respuestas crudas.
  // Se permite borrar grupos >=5 o reiniciar por completo la campaña de prueba.
  async function adminResponses(message=''){
    const f=store.responseFilters;
    const args={p_area:f.area||null,p_cargo:f.cargo||null,p_turno:f.turno||null,
      p_day_from:f.from||null,p_day_to:f.to||null};
    const [opts,preview,historyRows]=await Promise.all([
      rpc('survey_admin_options'),
      rpc('survey_admin_responses_preview',args),
      rpc('survey_admin_deletion_history')
    ]);
    const fmtDate=d=>d?String(d).slice(0,10):'—';
    const isAll=!!preview.all_selected;
    const countLabel=preview.protected?'Menos de 5 (protegido)':number(preview.selected_count);
    const countDesc=preview.protected?'El recuento exacto se oculta para proteger a los trabajadores.':
      (isAll?'Sin filtros activos':'Área, cargo, turno y fechas seleccionados');
    const items=(historyRows||[]).map(h=>{
      const fields=h.filters||{};
      const scope=h.full_reset?'Campaña completa':[
        fields.area&&'Área: '+fields.area,
        fields.cargo&&'Cargo: '+fields.cargo,
        fields.turno&&'Turno: '+fields.turno,
        fields.desde&&'Desde: '+fields.desde,
        fields.hasta&&'Hasta: '+fields.hasta
      ].filter(Boolean).join(' · ');
      return `<tr><td>${esc(fmtDate(h.day))}</td><td>${esc(h.deleted)}</td><td>${esc(scope||'Selección')}</td><td>${esc(h.reason)}</td></tr>`;
    }).join('');
    $('#admin-content').innerHTML=`
      <div class="toolbar"><div><div class="section-label">ADMINISTRACIÓN PRIVADA · ESM</div>
      <h2>Gestión de respuestas</h2><p class="muted">Consulta por área, cargo, turno o fechas y elimina registros de prueba cuando corresponda.</p></div></div>
      ${message?banner(message,false):''}
      <section class="card strategic-section">
        <h3>Filtrar las encuestas recibidas</h3>
        <form id="manage-filters" class="form"><div class="management-filter-grid">
          <label class="form-label">Área<select name="area">${selectOptions(opts.areas||[],f.area,'Todas las áreas')}</select></label>
          <label class="form-label">Cargo<select name="cargo">${selectOptions(opts.cargos||[],f.cargo,'Todos los cargos')}</select></label>
          <label class="form-label">Turno<select name="turno">${selectOptions(['A','B'],f.turno,'Ambos turnos')}</select></label>
          <label class="form-label">Desde<input type="date" name="from" value="${esc(f.from)}"></label>
          <label class="form-label">Hasta<input type="date" name="to" value="${esc(f.to)}"></label>
        </div><div class="actions"><button type="submit" class="button primary">Aplicar filtros</button>
          <button type="button" id="manage-clear" class="button">Limpiar filtros</button></div></form>
        <div class="management-summary">
          ${metric('Encuestas recibidas',preview.global_total,'Total histórico, sin depender de la cantidad de códigos')}
          ${metric('Encuestas seleccionadas',countLabel,countDesc)}
        </div>
        ${notice('Para proteger la confidencialidad, este panel no permite ver ni descargar respuestas individuales. Los filtros con menos de cinco encuestas no muestran su recuento ni pueden eliminarse selectivamente.')}
      </section>
      <div class="cols">
        <section class="card">
          <h3>Eliminar las encuestas filtradas</h3>
          <p class="muted">Elimina todas las encuestas que coinciden con los filtros actuales, solo si el grupo contiene al menos cinco registros. También se eliminan sus respuestas a las preguntas.</p>
          <button class="button danger" type="button" id="manage-delete-filter" ${preview.eligible_filtered_delete?'':'disabled'}>Eliminar selección filtrada</button>
          <p class="note">${isAll?'Selecciona al menos un filtro para usar esta opción.':preview.protected?'Selección protegida (menos de cinco).':preview.eligible_filtered_delete?'Hay una selección publicable para revisar.':'No hay selección eliminable.'}</p>
        </section>
        <section class="card">
          <h3>Reiniciar todas las encuestas</h3>
          <p class="muted">Úsalo únicamente para limpiar pruebas o iniciar una campaña desde cero. Elimina todas las encuestas y sus respuestas, aunque exista solo una.</p>
          <button class="button danger" type="button" id="manage-delete-all" ${preview.can_reset_all?'':'disabled'}>Eliminar todas las encuestas</button>
          <p class="note">Los códigos utilizados seguirán utilizados. Este procedimiento no crea ni reactiva credenciales.</p>
        </section>
      </div>
      <section class="card strategic-section management-confirm" id="delete-confirm-panel" hidden>
        <div class="section-label">ACCIÓN IRREVERSIBLE</div><h3 id="delete-confirm-title">Confirmar eliminación</h3>
        <p class="muted" id="delete-confirm-description"></p>
        <form id="delete-confirm-form" class="form">
          <label class="form-label">Motivo (obligatorio, mínimo 12 caracteres)
            <textarea id="delete-reason" minlength="12" maxlength="300" required placeholder="Ejemplo: eliminación de encuestas utilizadas para probar la plataforma"></textarea></label>
          <label class="form-label">Escribe exactamente <strong id="delete-confirm-phrase"></strong> para continuar
            <input id="delete-confirm-input" autocomplete="off" required spellcheck="false"></label>
          <div class="actions"><button class="button danger" id="delete-confirm-button" type="submit">Confirmar eliminación definitiva</button>
            <button class="button" type="button" id="delete-cancel">Cancelar</button></div>
          <div id="delete-feedback"></div>
        </form>
      </section>
      <section class="card strategic-section"><h3>Historial de eliminaciones</h3>
        <p class="note">Registro administrativo de cuándo, cuántas encuestas y por qué se eliminaron. No conserva respuestas individuales.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Eliminadas</th><th>Alcance</th><th>Motivo</th></tr></thead>
        <tbody>${items||'<tr><td colspan="4">Todavía no hay eliminaciones registradas.</td></tr>'}</tbody></table></div>
      </section>`;

    $('#manage-filters').addEventListener('submit',e=>{
      e.preventDefault();const v=new FormData(e.currentTarget);
      const from=String(v.get('from')||''),to=String(v.get('to')||'');
      if(from&&to&&from>to){alert('La fecha Desde no puede ser posterior a Hasta.');return;}
      store.responseFilters={area:String(v.get('area')||''),cargo:String(v.get('cargo')||''),turno:String(v.get('turno')||''),from,to};
      adminResponses().catch(e=>$('#admin-content').innerHTML=banner(fail(e)));
    });
    $('#manage-clear').addEventListener('click',()=>{
      store.responseFilters={area:'',cargo:'',turno:'',from:'',to:''};
      adminResponses().catch(e=>$('#admin-content').innerHTML=banner(fail(e)));
    });
    let deleteAll=false;
    const panel=$('#delete-confirm-panel');
    const openConfirm=all=>{
      deleteAll=all;
      $('#delete-confirm-form').reset();$('#delete-feedback').innerHTML='';
      const phrase=all?'ELIMINAR TODAS':'ELIMINAR FILTRO';
      $('#delete-confirm-phrase').textContent=phrase;
      $('#delete-confirm-title').textContent=all?'Reiniciar toda la campaña':'Eliminar encuestas filtradas';
      $('#delete-confirm-description').textContent=all?
        `Se eliminarán las ${preview.global_total} encuestas registradas en toda la campaña, sin importar los filtros. Esta acción no se puede revertir.`:
        `Se eliminarán las ${preview.selected_count} encuestas que coinciden con los filtros aplicados. Esta acción no se puede revertir.`;
      panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
    };
    $('#manage-delete-filter').addEventListener('click',()=>openConfirm(false));
    $('#manage-delete-all').addEventListener('click',()=>openConfirm(true));
    $('#delete-cancel').addEventListener('click',()=>{panel.hidden=true;});
    $('#delete-confirm-form').addEventListener('submit',async e=>{
      e.preventDefault();const required=deleteAll?'ELIMINAR TODAS':'ELIMINAR FILTRO';
      const typed=$('#delete-confirm-input').value.trim();
      if(typed!==required){$('#delete-feedback').innerHTML=banner('La frase de confirmación no coincide.');return;}
      const reason=$('#delete-reason').value.trim();
      if(reason.length<12){$('#delete-feedback').innerHTML=banner('Especifica un motivo de al menos 12 caracteres.');return;}
      const expected=deleteAll?Number(preview.global_total):Number(preview.selected_count);
      if(!confirm(`Confirmación final: ¿eliminar definitivamente ${expected} encuestas?`))return;
      const btn=$('#delete-confirm-button');btn.disabled=true;
      $('#delete-feedback').innerHTML='';
      try{
        const result=await rpc('survey_admin_delete_responses',{
          p_area:deleteAll?null:args.p_area,
          p_cargo:deleteAll?null:args.p_cargo,
          p_turno:deleteAll?null:args.p_turno,
          p_day_from:deleteAll?null:args.p_day_from,
          p_day_to:deleteAll?null:args.p_day_to,
          p_reason:reason,p_confirmation:required,p_expected_count:expected,p_all:deleteAll
        });
        store.dashboard=null;
        if(deleteAll)store.responseFilters={area:'',cargo:'',turno:'',from:'',to:''};
        await adminResponses(`Eliminación registrada: ${result.deleted} encuestas. Los códigos ya utilizados permanecen bloqueados.`);
      }catch(err){$('#delete-feedback').innerHTML=banner(fail(err));btn.disabled=false;}
    });
  }

  async function adminQuestions(message=''){
    const list=await rpc('survey_admin_questions');store.adminQuestions=list;
    const operational=(list||[]).filter(q=>q.active&&String(q.key||'').startsWith('EMP2_')).sort((a,b)=>Number(a.position)-Number(b.position));
    if(operational.length){
      $('#admin-content').innerHTML=`<div class="section-label">CUESTIONARIO OPERACIONAL</div><h2>7 preguntas y dimensiones vigentes</h2><p class="muted">Cada pregunta mide una dimensión distinta. Las versiones anteriores permanecen archivadas para conservar la trazabilidad histórica.</p>${operational.map(q=>`<section class="card" style="margin-bottom:14px"><div class="q-meta">PREGUNTA ${esc(q.position)} · ${esc(q.dimension)} · ${q.required?'OBLIGATORIA':'OPCIONAL'}</div><h3>${esc(q.text)}</h3><div class="analysis-note"><div><span>QUÉ BUSCA</span><p>${esc(q.purpose||'')}</p></div><div><span>QUÉ PUEDE REFLEJAR</span><p>${esc(q.guidance||'')}</p></div></div>${q.type==='text'?'<p class="note">Respuesta abierta opcional, máximo 1.500 caracteres.</p>':`<ol>${(q.choices||[]).filter(c=>c.active!==false).map(c=>`<li>${esc(c.text)}</li>`).join('')}</ol>`}</section>`).join('')}<p class="note">Si en el futuro necesitas cambiar una pregunta, debe crearse una nueva versión para no alterar el significado de las respuestas anteriores.</p>`;
      return;
    }
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
