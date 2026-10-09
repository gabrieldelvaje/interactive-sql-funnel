import { initializeDatabase, query, SCHEMA, isReady } from "./data-lab.js";
import { DEFAULT_COLUMNS, TABLE_LABELS, getRelations, getColumns, buildQuery, DIMENSIONS, METRICS } from "./builder.js";
import { lessons, grade } from "./lessons.js";
import { renderSqlDiff } from "./sql-diff.js";

const $ = (selector) => document.querySelector(selector);
const state = { mode:"aggregate", base:"orders", relation:"", columns:[...DEFAULT_COLUMNS], dimension:"month", metric:"revenue", status:"", region:"", window:false, drill:"",limit:25 };
let oldSql="", updateTimer=null, running=false, rerun=false, lessonIndex=0, lessonRunning=false;
let complete=new Set();
try { complete=new Set(JSON.parse(localStorage.getItem("sql-lab-completed")||"[]")); } catch {}
const number=value=>Number(value||0).toLocaleString("pt-BR",{maximumFractionDigits:2});
const safeText=value=>value===null||value===undefined?"NULL":String(value);
function errorText(e){return e?.message||String(e)||"Erro na consulta."}
function setFeedback(selector,message,kind="") {
  const el=$(selector); el.hidden=!message; el.textContent=message;el.className="feedback "+kind;
}
function putTable(selector,result) {
  const table=$(selector),head=table.querySelector("thead"),body=table.querySelector("tbody");
  head.replaceChildren();body.replaceChildren();
  if(!result||!result.columns.length) return;
  const header=document.createElement("tr");
  for(const key of result.columns){const th=document.createElement("th");th.textContent=key;header.append(th);}head.append(header);
  for(const row of result.rows){
    const tr=document.createElement("tr");
    for(const key of result.columns){const td=document.createElement("td");const val=row[key];td.textContent=val===null?"NULL":typeof val==="number"?number(val):safeText(val);tr.append(td);}body.append(tr);
  }
}
function renderChart(result) {
  const chart=$("#chart");chart.replaceChildren();
  if(state.mode==="rows"){chart.innerHTML='<div class="empty">Exibição tabular. Selecione ANÁLISE para gerar visualizações e agregações.</div>';return;}
  if(!result?.rows?.length){chart.innerHTML='<div class="empty">Nenhum dado encontrado para esta combinação.</div>';return;}
  const values=result.rows.slice(0,16);
  const max=Math.max(...values.map(row=>Number(row.value)||0),1);
  for(const row of values) {
    const label=safeText(row.label),value=Number(row.value)||0;
    const button=document.createElement("button");
    button.type="button";button.className="chart-col"+(state.drill===label?" is-selected":"");
    button.setAttribute("aria-label",label+": "+number(value));
    button.title=label+" — "+number(value)+(state.dimension==="month"?"":" · clique para filtrar");
    button.disabled=state.dimension==="month";
    const display=document.createElement("span");display.className="chart-value";display.textContent=number(value);
    const track=document.createElement("span");track.className="chart-track";
    const bar=document.createElement("span");bar.className="chart-bar";bar.style.height=Math.max(3,Math.round(value/max*100))+"%";track.append(bar);
    const name=document.createElement("span");name.className="chart-label";name.textContent=label.slice(0,10);name.title=label;
    button.append(display,track,name);
    button.addEventListener("click",()=>{
      state.drill=state.drill===label?"":label;
      $("#clear-drill").hidden=!state.drill;
      schedule();
    });
    chart.append(button);
  }
}
function renderColumns() {
  const base=state.base, relation=state.relation,all=getColumns(base,relation);
  state.columns=state.columns.filter(x=>all.some(y=>y.id===x));
  if(!state.columns.length) state.columns=all.slice(0,Math.min(4,all.length)).map(x=>x.id);
  const parent=$("#column-options");parent.replaceChildren();
  for(const col of all){
    const label=document.createElement("label"),check=document.createElement("input"),text=document.createElement("span");
    check.type="checkbox";check.value=col.id;check.checked=state.columns.includes(col.id);
    text.textContent=col.label;
    check.addEventListener("change",()=>{
      if(check.checked)state.columns.push(col.id);
      else if(state.columns.length>1)state.columns=state.columns.filter(x=>x!==col.id);
      else check.checked=true;
      schedule();
    });
    label.append(check,text);parent.append(label);
  }
}
function renderRelations(){
  const target=$("#relation"),relations=getRelations(state.base);
  target.replaceChildren();
  for(const [value,label] of [["","Nenhuma tabela"],...relations.map(rel=>[rel,rel+" — "+TABLE_LABELS[rel]])]){
    const option=document.createElement("option");option.value=value;option.textContent=label;target.append(option);
  }
  if(!relations.includes(state.relation))state.relation="";
  target.value=state.relation;
  $("#row-status").disabled=state.base!=="orders";
  $("#row-region").disabled=state.base!=="customers"&&state.relation!=="customers";
  renderColumns();
}
function paintBuilder(){
  const rows=state.mode==="rows";
  $("#controls-aggregate").hidden=rows;$("#controls-rows").hidden=!rows;
  $("#mode-buttons").querySelectorAll("button").forEach(btn=>btn.classList.toggle("selected",btn.dataset.mode===state.mode));
  $("#dimension").value=state.dimension;$("#metric").value=state.metric;
  $("#agg-status").value=state.status;$("#agg-region").value=state.region;
  $("#window-toggle").checked=state.window;
  $("#base-table").value=state.base;$("#row-status").value=state.status;$("#row-region").value=state.region;
  $("#row-limit").value=String(state.limit);
  $("#clear-drill").hidden=!state.drill;
  renderRelations();
}
function updateSqlPreview() {
  const sql=buildQuery(state);
  renderSqlDiff($("#sql-code"),oldSql,sql);
  oldSql=sql;return sql;
}
async function refresh() {
  const sql=updateSqlPreview();
  $("#chart-heading").textContent=state.mode==="rows"?"Selected rows":METRICS[state.metric]+" / "+DIMENSIONS[state.dimension].title;
  if(!isReady()){ $("#explore-status").textContent="Aguardando conexão local…";return; }
  if(running){rerun=true;return;}
  running=true;rerun=false;
  const start=performance.now();
  setFeedback("#visual-error","");
  $("#explore-status").textContent="Executando SQL…";
  $("#query-meta").textContent="EXECUTANDO";
  try {
    const result=await query(sql,180);
    if(rerun)return;
    putTable("#explore-results",result);
    renderChart(result);
    const elapsed=Math.round(performance.now()-start);
    $("#result-meta").textContent=result.total+" registros · "+elapsed+" ms";
    $("#table-count").textContent=result.limited?"Exibindo 180 de "+result.total:""+result.total+" linhas";
    $("#explore-status").textContent="CONSULTA EXECUTADA";
    $("#query-meta").textContent=elapsed+" MS";
  }catch(e){
    if(!rerun){setFeedback("#visual-error",errorText(e),"error");$("#explore-status").textContent="ERRO NO SQL";$("#query-meta").textContent="ERRO";}
  }finally{
    running=false;
    if(rerun){rerun=false;refresh();}
  }
}
function schedule(){updateSqlPreview();clearTimeout(updateTimer);updateTimer=setTimeout(refresh,95);}
function resetBuilder() {
  Object.assign(state,{mode:"aggregate",base:"orders",relation:"",columns:[...DEFAULT_COLUMNS],dimension:"month",metric:"revenue",status:"",region:"",window:false,drill:"",limit:25});
  paintBuilder();schedule();
}
function setPreset(name){
  Object.assign(state,{mode:"aggregate",metric:"revenue",status:"",region:"",drill:"",window:false});
  if(name==="revenue") state.dimension="region";
  if(name==="rank"){state.dimension="category";state.window=true;}
  if(name==="time"){state.dimension="month";state.window=true;}
  paintBuilder();schedule();
}
function initBuilder(){
  $("#mode-buttons").addEventListener("click",event=>{
    const button=event.target.closest("button[data-mode]");if(!button)return;
    state.mode=button.dataset.mode;paintBuilder();schedule();
  });
  for(const [id,key] of [["dimension","dimension"],["metric","metric"],["agg-status","status"],["agg-region","region"],["row-status","status"],["row-region","region"]]){
    $("#"+id).addEventListener("change",event=>{
      state[key]=event.target.value;
      if(key==="dimension")state.drill="";
      schedule();
    });
  }
  $("#window-toggle").addEventListener("change",event=>{state.window=event.target.checked;schedule();});
  $("#base-table").addEventListener("change",event=>{
    state.base=event.target.value;state.relation="";
    state.columns=getColumns(state.base,"").slice(0,5).map(c=>c.id);
    paintBuilder();schedule();
  });
  $("#relation").addEventListener("change",event=>{
    state.relation=event.target.value;
    renderRelations();schedule();
  });
  $("#row-limit").addEventListener("change",event=>{state.limit=Number(event.target.value);schedule();});
  $("#reset-builder").addEventListener("click",resetBuilder);
  $("#clear-drill").addEventListener("click",()=>{state.drill="";$("#clear-drill").hidden=true;schedule();});
  document.querySelectorAll("[data-preset]").forEach(button=>button.addEventListener("click",()=>setPreset(button.dataset.preset)));
  $("#copy-query").addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(buildQuery(state));$("#copy-query").textContent="COPIADO ✓";setTimeout(()=>$("#copy-query").textContent="COPIAR SQL ↗",1400);}
    catch{setFeedback("#visual-error","Não foi possível copiar automaticamente. Selecione o código manualmente.","error");}
  });
  $("#open-in-sandbox").addEventListener("click",()=>{
    location.hash="sandbox";
    $("#sandbox-editor").value=buildQuery(state);
    setFeedback("#sandbox-feedback","Consulta transferida do Explorador. Execute para ver o resultado no sandbox.","");
    $("#sandbox-editor").focus();
  });
  paintBuilder();updateSqlPreview();
}
function showPage(page) {
  const isSandbox=page==="sandbox";
  $("#page-explore").hidden=isSandbox;$("#page-sandbox").hidden=!isSandbox;
  document.querySelectorAll("[data-nav]").forEach(a=>a.classList.toggle("active",a.dataset.nav===(isSandbox?"sandbox":"explore")));
  $("#hero-kicker").textContent=isSandbox?"02 — INTERACTIVE SQL LEARNING":"01 — VISUAL QUERY BUILDER";
  $("#hero-title").innerHTML=isSandbox?"Learn SQL.<br><em>Make it work.</em>":"Explore data.<br><em>See the SQL.</em>";
  $("#hero-copy").textContent=isSandbox?"Escreva e execute consultas sobre o mesmo banco. Aprenda conceitos fundamentais e resolva desafios com validação automática.":"Selecione tabelas, colunas e relacionamentos. Transforme uma análise visual em uma consulta SQL de verdade, executada no navegador.";
}
function showLesson(index){
  lessonIndex=index;
  const lesson=lessons[index];
  $("#lesson-level").textContent=lesson.level.toUpperCase()+" / "+lesson.id+" · "+lesson.topic;
  $("#lesson-title").textContent=lesson.title;
  $("#lesson-description").textContent=lesson.description;
  $("#lesson-task").textContent=lesson.task;
  $("#sandbox-editor").value=lesson.starter;
  $("#lesson-hint").hidden=true;$("#sandbox-feedback").hidden=true;
  $("#sandbox-result-meta").textContent="Pronto para executar";
  putTable("#sandbox-results",null);
  renderLessons();
}
function renderLessons(){
  const list=$("#lesson-list");list.replaceChildren();
  for(const [i,lesson] of lessons.entries()){
    const button=document.createElement("button");button.type="button";
    button.className="lesson-btn"+(i===lessonIndex?" active":"")+(complete.has(lesson.id)?" passed":"");
    button.innerHTML='<span class="num">'+(complete.has(lesson.id)?"✓":lesson.id)+'</span>';
    const box=document.createElement("span"),name=document.createElement("strong"),subtitle=document.createElement("small");
    name.textContent=lesson.title;subtitle.textContent=lesson.topic;box.append(name,subtitle);button.append(box);
    button.addEventListener("click",()=>showLesson(i));list.append(button);
  }
  $("#progress-text").textContent=complete.size;
  $("#progress-bar").style.width=(complete.size/lessons.length*100)+"%";
}
function renderSchema(){
  const parent=$("#schema-list");parent.replaceChildren();
  for(const [table,cols] of Object.entries(SCHEMA)){
    const d=document.createElement("details");d.className="schema-item";
    const summary=document.createElement("summary");summary.textContent=table;d.append(summary);
    const ul=document.createElement("ul");
    for(const name of cols){const li=document.createElement("li");li.textContent=name;ul.append(li);}
    const demo=document.createElement("li"),button=document.createElement("button");
    button.type="button";button.className="text-link";button.textContent="SELECT * FROM "+table+" ↗";
    button.addEventListener("click",()=>{$("#sandbox-editor").value="SELECT *\nFROM "+table+"\nLIMIT 10;";$("#sandbox-editor").focus();});
    demo.append(button);ul.append(demo);d.append(ul);parent.append(d);
  }
}
async function runSandbox(check=false){
  if(!isReady()){setFeedback("#sandbox-feedback","O banco ainda está inicializando.","error");return;}
  if(lessonRunning)return;
  lessonRunning=true;
  $("#execute-query").disabled=true;$("#check-answer").disabled=true;
  $("#sandbox-result-meta").textContent="Executando…";
  const current=lessons[lessonIndex],started=performance.now();
  try{
    const actual=await query($("#sandbox-editor").value,150);
    putTable("#sandbox-results",actual);
    $("#sandbox-result-meta").textContent=actual.total+" linhas · "+Math.round(performance.now()-started)+" ms"+(actual.limited?" (150 exibidas)":"");
    if(check){
      const expected=await query(current.solution,150);
      const verdict=grade(actual,expected,current.ordered);
      setFeedback("#sandbox-feedback",verdict.detail,verdict.passed?"success":"error");
      if(verdict.passed){complete.add(current.id);try{localStorage.setItem("sql-lab-completed",JSON.stringify([...complete]));}catch{}renderLessons();}
    }else setFeedback("#sandbox-feedback","Consulta executada. Revise o resultado ou clique em VERIFICAR DESAFIO.","");
  }catch(e){setFeedback("#sandbox-feedback",errorText(e),"error");$("#sandbox-result-meta").textContent="Falha na execução";}
  finally{lessonRunning=false;$("#execute-query").disabled=false;$("#check-answer").disabled=false;}
}
function initSandbox(){
  renderSchema();showLesson(0);
  $("#execute-query").addEventListener("click",()=>runSandbox(false));
  $("#check-answer").addEventListener("click",()=>runSandbox(true));
  $("#reset-query").addEventListener("click",()=>showLesson(lessonIndex));
  $("#show-hint").addEventListener("click",()=>{
    const hint=$("#lesson-hint");hint.hidden=!hint.hidden;hint.textContent=lessons[lessonIndex].hint;
  });
  $("#show-solution").addEventListener("click",()=>{
    $("#sandbox-editor").value=lessons[lessonIndex].solution;
    setFeedback("#sandbox-feedback","Solução de referência inserida. Execute e confira como o SQL funciona.","");
  });
  $("#sandbox-editor").addEventListener("keydown",event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();runSandbox(false);}
    if(event.key==="Tab"){event.preventDefault();const el=event.target,a=el.selectionStart,b=el.selectionEnd;el.value=el.value.slice(0,a)+"  "+el.value.slice(b);el.selectionStart=el.selectionEnd=a+2;}
  });
  $("#reset-database").addEventListener("click",()=>location.reload());
}
async function init(){
  initBuilder();initSandbox();
  const route=()=>showPage(location.hash.replace("#","")==="sandbox"?"sandbox":"explore");
  addEventListener("hashchange",route);route();
  const status=$("#engine-status");
  try{
    await initializeDatabase(text=>{status.querySelector("span").textContent=text;$("#explore-status").textContent=text;});
    status.classList.add("ready");status.querySelector("span").textContent="DUCKDB · ONLINE";
    await refresh();
  }catch(err){
    status.classList.add("failed");status.querySelector("span").textContent="ERRO NA ENGINE";
    const global=$("#global-error");global.hidden=false;global.textContent="O banco não pôde ser inicializado: "+errorText(err)+" Atualize a página para tentar novamente.";
    $("#explore-status").textContent="ERRO DE CARREGAMENTO";
  }
}
init();
