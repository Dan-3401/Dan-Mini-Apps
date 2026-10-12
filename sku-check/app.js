'use strict';
// SKU CHECK β 0.3 – dependency-free, offline-only commodity CSV QA demonstration.
const $ = (id) => document.getElementById(id);
const names = {
  sku: ['sku','variant sku','商品コード','商品管理番号','管理番号','品番','商品id','product_id','商品番号'],
  title: ['title','商品名','商品タイトル','商品名称','name','product_name'],
  price: ['price','variant price','販売価格','価格','税込価格','商品価格','unit_price'],
  stock: ['inventory quantity','variant inventory qty','在庫数','在庫','在庫数量','数量','stock','quantity','inventory'],
  handle: ['url handle','handle'],
  opt1: ['option1 value','option1 value','option1 value','option1value'],
  opt2: ['option2 value','option2value'], opt3: ['option3 value','option3value']
};
let current = null, baseline = null, issues = [], diffs = [], risks = [];
let sourceFile = null, oldFile = null, usingSample = false;
const SAMPLE = 'SKU,商品名,価格,在庫数,カテゴリ\r\nAA-101,抹茶マグカップ,1980,12,雑貨\r\nAA-102,  和風ポーチ  ,1280,3,雑貨\r\nAA-101,重複サンプル,1980,12,雑貨\r\nAA-103,,500,5,雑貨\r\nAA-104,木製トレー,価格未定,8,雑貨\r\nAA-105,小皿,890,-2,食器\r\n,商品コード未入力,2000,4,雑貨\r\nAA-106,湯呑み,1200,,食器';
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csvCell = (v) => {const x = String(v ?? ''); return /[",\r\n]/.test(x) ? '"'+x.replace(/"/g,'""')+'"' : x;};
const safeReportCell = (v) => {const x = String(v ?? ''); return /^[\t\r\n ]*[=+@]/.test(x) || /^[\t\r\n ]*-(?!\d+(?:\.\d+)?$)/.test(x) ? "'"+x : x;};
const filenameBase = (s) => String(s || 'products').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u9fff]/g,'_').slice(0,70) || 'products';
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_-]/g,'');
function parseDelimited(raw, separator) {
  let text = String(raw).replace(/^\uFEFF/,''), field='', fields=[], list=[], rowLine=1, line=1, state='start';
  function emit(){ fields.push(field); field=''; if (fields.some(v => String(v).trim()!=='')) list.push({values:fields,startLine:rowLine}); fields=[]; rowLine=line; state='start'; }
  for(let i=0;i<text.length;i++) {
    let c=text[i];
    if(c==='\r' || c==='\n') {
      if(c==='\r' && text[i+1]==='\n') i++;
      if(state==='quoted') {field+='\n';line++;continue;}
      line++;emit();continue;
    }
    if(state==='quoted') {if(c==='"' && text[i+1]==='"'){field+='"';i++;} else if(c==='"'){state='afterquote';} else field+=c;continue;}
    if(c===separator){fields.push(field);field='';state='start';continue;}
    if(state==='afterquote') {if(c===' '||c==='\t')continue;throw new Error(`行${line}: 引用符の後に不正な文字があります。`);}
    if(c==='"') {if(state==='start'){state='quoted';}else throw new Error(`行${line}: 引用符の位置が不正です。`);continue;}
    field+=c;state='plain';
  }
  if(state==='quoted') throw new Error(`行${line}: 引用符が閉じられていません。`);
  fields.push(field);
  if(fields.some(v => String(v).trim()!==''))list.push({values:fields,startLine:rowLine});
  return list;
}
function detectDelimiter(text) {
  let winner=',', score=-Infinity;
  for(const sep of [',','\t',';']){
    try {
      let head=parseDelimited(text.slice(0,Math.min(text.length, 30000)),sep).slice(0,30);
      if(head.length<1)continue;
      const widths=head.map(r=>r.values.length), n=widths[0];
      const consistency=widths.filter(w=>w===n).length;
      const value=(n>1?consistency*8+n:0) - (widths.length-consistency)*4;
      if(value>score){score=value;winner=sep;}
    } catch {
      // If the slice ends inside a quoted field, fall back to a header-only guess.
      const header=String(text).split(/\r?\n/)[0];
      const count=header.split(sep).length;
      if(count>1 && count>score){score=count;winner=sep;}
    }
  }
  return winner;
}
function tableFrom(text,fileName){
  let s=$('delimiter').value, sep=s==='auto'?detectDelimiter(text):s==='tab'?'\t':s;
  const records=parseDelimited(text,sep);
  if(!records.length)throw new Error('CSVに読み込めるレコードがありません。');
  if(records.length>50001)throw new Error('デモ版はデータ50,000行までです。');
  const headers=records.shift().values.map((h,i)=>String(h).trim() || 'column_'+(i+1));
  if(headers.length<2)throw new Error('2列以上のCSV/TSVを指定してください。');
  return {headers,rows:records.map(r=>({no:r.startLine,values:r.values.slice()})),fileName,separator:sep};
}
function findIndex(headers,kind) {
  let keys=names[kind].map(norm);
  let i=headers.findIndex(h=>keys.includes(norm(h)));
  if(i<0 && ['sku','title','price','stock'].includes(kind))i=headers.findIndex(h=>keys.some(k=>norm(h).includes(k)));
  return i;
}
function getCell(row,idx){return idx<0?'':String(row.values[idx]??'').trim();}
function inferMode(t) {
  const h=t.headers.map(norm);
  return h.includes('urlhandle') || (h.includes('handle') && (h.includes('variantsku')||h.includes('variantprice')||h.includes('option1value'))) ? 'shopify':'generic';
}
function modeNow() {return $('mode').value==='auto'?inferMode(current):$('mode').value;}
function fillSelectors(t){
  for(const [id,kind] of [['skuCol','sku'],['nameCol','title'],['priceCol','price'],['stockCol','stock']]){
    const el=$(id);el.innerHTML='<option value="">列なし（対象外）</option>'+t.headers.map((h,i)=>`<option value="${i}">${escapeHtml(h)}</option>`).join('');
    const n=findIndex(t.headers,kind);el.value=n<0?'':String(n);el.disabled=false;
  }
}
function selected(id){const v=$(id).value;return v===''?-1:Number(v);}
function issue(no,level,col,message,value){issues.push({no,level,col,message,value});}
function numberText(raw){return String(raw).normalize('NFKC').replace(/[\s,￥¥]/g,'').replace(/^(JPY|円)/i,'');}
function validateNumber(row,idx,type){
  if(idx<0)return;
  const value=getCell(row,idx),column=current.headers[idx];
  if(!value){ if(modeNow()==='generic')issue(row.no,'warning',column,type==='price'?'価格が空欄です':'在庫数が空欄です',value);return; }
  const s=numberText(value), number=Number(s);
  if(type==='price'){
    if(!/^\d+(\.\d+)?$/.test(s) || !Number.isFinite(number))issue(row.no,'error',column,'価格は0以上の数値で入力してください',value);
  } else if(!/^\d+$/.test(s) || !Number.isSafeInteger(number))issue(row.no,'error',column,'在庫数は0以上の整数で入力してください',value);
}
function runCheck(){
  if(!current)return;
  issues=[];let dup=0, seen=new Map(), handleGroups=new Map();
  const h=current.headers, mode=modeNow(), si=selected('skuCol'),ti=selected('nameCol'),pi=selected('priceCol'),qi=selected('stockCol'),hi=findIndex(h,'handle');
  const sHead=new Map();h.forEach((v,i)=>{const k=norm(v);if(sHead.has(k))issue(1,'error',v,'列名が重複しています',v);sHead.set(k,i);});
  if(mode==='shopify' && hi<0)issue(1,'error','URL handle','Shopify形式にはURL handle（または旧形式Handle）列が必要です','');
  if(mode==='shopify' && ti<0)issue(1,'error','Title','Shopify形式にはTitle列が必要です','');
  for(const row of current.rows) {
    const v=row.values;
    if(v.length!==h.length)issue(row.no,'error','CSV構造',`列数が${v.length}列、ヘッダーは${h.length}列です`,'');
    if(si>=0){const s=getCell(row,si);if(mode==='generic'&&!s)issue(row.no,'error',h[si],'商品コードが空欄です',s);
      else if(s){if(seen.has(s)){dup++;issue(row.no,mode==='shopify'?'warning':'error',h[si],`SKUが他の行と重複（先行行：${seen.get(s)}）。Shopifyでは要確認`,s);}else seen.set(s,row.no);}}
    if(mode==='generic') {if(ti>=0 && !getCell(row,ti))issue(row.no,'error',h[ti],'商品名が空欄です','');}
    else if(hi>=0) {
      const handle=getCell(row,hi);
      if(!handle)issue(row.no,'error',h[hi],'URL handleが空欄です',handle);
      else {
        if(/\s/.test(handle))issue(row.no,'error',h[hi],'URL handleに空白が含まれています',handle);
        if(!handleGroups.has(handle))handleGroups.set(handle,[]);
        handleGroups.get(handle).push(row);
      }
    }
    validateNumber(row,pi,'price');validateNumber(row,qi,'stock');
    for(let j=0;j<Math.min(v.length,h.length);j++){
      const val=String(v[j]??'');
      if(/^[\s]*[=+@]/.test(val) || /^[\s]*-(?!\d+(?:\.\d+)?$)/.test(val)){
        // Potential spreadsheet formula injection when opening a CSV in Excel.
        issue(row.no,'warning',h[j],'Excelで数式として実行される可能性があります',val.slice(0,80));
      }
    }
  }
  if(mode==='shopify' && ti>=0)for(const [key,group] of handleGroups) {
    if(!group.some(r=>getCell(r,ti)!==''))issue(group[0].no,'error',h[ti],`商品「${key}」にTitleがありません`,'');
  }
  const bad=new Set(issues.filter(i=>i.no>1).map(i=>i.no));
  for(const [id,n] of [['mRows',current.rows.length],['mIssues',issues.length],['mDuplicate',dup],['mBadRows',bad.size]])$(id).textContent=n.toLocaleString('ja-JP');
  $('previewN').textContent=`（${issues.length}件）`;
  $('exportClean').disabled=issues.some(i=>i.col==='CSV構造' || i.message==='列名が重複しています');
  $('fileStatus').textContent=`${current.fileName} · ${current.rows.length.toLocaleString('ja-JP')}行 · ${mode==='shopify'?'Shopify':'汎用'}モード`;
  renderIssueTable();renderDataTable(bad);compareFiles();
}
function renderIssueTable(){
  if(!issues.length){$('issueWrap').innerHTML='<div class="empty">✅ 現在の条件では問題が検出されませんでした。アップロードできる保証ではありません。</div>';return;}
  let out='<table><thead><tr><th>CSV行</th><th>重要度</th><th>列</th><th>内容</th><th>元データ</th></tr></thead><tbody>';
  for(const o of issues.slice(0,200))out+=`<tr><td>${o.no}</td><td><span class="pill ${o.level==='error'?'bad':'warn'}">${o.level==='error'?'要修正':'要確認'}</span></td><td>${escapeHtml(o.col)}</td><td>${escapeHtml(o.message)}</td><td title="${escapeHtml(o.value)}">${escapeHtml(o.value)}</td></tr>`;
  $('issueWrap').innerHTML=out+'</tbody></table>';
}
function renderDataTable(bad){
  let out='<table><thead><tr><th>CSV行</th><th>判定</th>'+current.headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')+'</tr></thead><tbody>';
  for(const row of current.rows.slice(0,30)){
    out+=`<tr><td>${row.no}</td><td><span class="pill ${bad.has(row.no)?'bad':'ok'}">${bad.has(row.no)?'要確認':'OK'}</span></td>`;
    out+=current.headers.map((_,i)=>`<td title="${escapeHtml(row.values[i]??'')}">${escapeHtml(row.values[i]??'')}</td>`).join('')+'</tr>';
  }
  $('dataWrap').innerHTML=out+'</tbody></table>';
}
function rowsByKey(t,preferShopify){
  const sku=findIndex(t.headers,'sku'),handle=findIndex(t.headers,'handle'),o1=findIndex(t.headers,'opt1'),o2=findIndex(t.headers,'opt2'),o3=findIndex(t.headers,'opt3');
  const found=new Map(),duplicate=new Set(),handleCounts=new Map();
  if(preferShopify&&handle>=0)for(const row of t.rows){const h=getCell(row,handle);handleCounts.set(h,(handleCounts.get(h)||0)+1);}
  for(const row of t.rows){
    let k=getCell(row,sku);
    if(k)k='sku:'+k;
    else if(preferShopify&&handle>=0){
      const x=getCell(row,handle),opts=[o1,o2,o3].map(i=>getCell(row,i));
      if(x && opts.some(Boolean))k='variant:'+JSON.stringify([x,...opts]);
      else if(x && handleCounts.get(x)===1)k='handle:'+x;
    }
    if(!k)continue;
    if(found.has(k))duplicate.add(k);else found.set(k,row);
  }
  for(const key of duplicate)found.delete(key);
  return {found,duplicate};
}
// Limited and deliberately conservative Shopify overwrite-impact warnings.
// Compares two customer-provided snapshots; never accesses the live shop.
const productFields = [
 ['Description', ['description','body (html)']],
 ['Vendor', ['vendor']],
 ['Type', ['type','product type']],
 ['Tags', ['tags']],
 ['Product category', ['product category']],
 ['SEO title', ['seo title']],
 ['SEO description', ['seo description']],
 ['Status', ['status']],
 ['Published', ['published']]
];
function aliasIndex(headers,aliases){return headers.findIndex(h=>aliases.map(norm).includes(norm(h)));}
function handleGroup(t){
  const i=findIndex(t.headers,'handle'), groups=new Map();
  if(i<0)return groups;
  for(const r of t.rows){const h=getCell(r,i);if(!h)continue;
    if(!groups.has(h))groups.set(h,[]);groups.get(h).push(r);}
  return groups;
}
function addRisk(level,kind,handle,col,before,after,message,line){
  risks.push({level,kind,handle,col,before,after,message,line});
}
function findShopifyRisks(){
  risks=[];
  if(!baseline||!current||modeNow()!=='shopify')return;
  const prev=handleGroup(baseline), next=handleGroup(current);
  if(!prev.size||!next.size)return;
  for(const [handle,rows] of next){
    const old=prev.get(handle);if(!old)continue;
    for(const [field,aliases] of productFields){
      const oldCol=aliasIndex(baseline.headers,aliases),newCol=aliasIndex(current.headers,aliases);
      if(oldCol<0||newCol<0)continue; // An omitted column should not blank existing data.
      const oldVal=old.map(r=>getCell(r,oldCol)).find(Boolean)||'';
      const newVal=rows.map(r=>getCell(r,newCol)).find(Boolean)||'';
      if(oldVal&&!newVal)addRisk('high','空欄で上書きされる可能性',handle,field,oldVal,'',
        '更新時に同じ列が空欄だと既存データが空欄になる可能性があります。意図した変更か確認してください。',rows[0].no);
    }
  }
  const si=findIndex(current.headers,'sku'), oldSi=findIndex(baseline.headers,'sku');
  const hasVariantData=si>=0 || ['variant price','variant inventory qty','inventory quantity','weight value (grams)','option1 value'].some(k=>current.headers.some(h=>norm(h)===norm(k)));
  const hasOptionName=current.headers.some(h=>['option1 name','option1name'].includes(norm(h)));
  const hasOptionValue=current.headers.some(h=>['option1 value','option1value'].includes(norm(h)));
  if(hasVariantData&&(!hasOptionName||!hasOptionValue)){
    addRisk('high','バリエーション列の依存関係','(CSV全体)','Option1 name / Option1 value','-','-',
      'Shopifyで既存商品を更新する際、SKU等のバリエーション関連列はOption1 nameとOption1 valueに依存します。列の欠落によって既存バリエーションに影響が出る可能性があります。',1);
  }
  if(si>=0&&oldSi>=0){
    const unique=(table,skuIndex)=>{
      const seen=new Map(),duplicates=new Set();
      for(const row of table.rows){const id=getCell(row,skuIndex);if(!id)continue;
        if(seen.has(id))duplicates.add(id);else seen.set(id,row);}
      for(const id of duplicates)seen.delete(id);return seen;
    };
    const oldMap=unique(baseline,oldSi),newMap=unique(current,si);
    const oldHi=findIndex(baseline.headers,'handle'),newHi=findIndex(current.headers,'handle');
    for(const [sku,newRow] of newMap){
      const oldRow=oldMap.get(sku);if(!oldRow)continue;
      const oldHandle=getCell(oldRow,oldHi),newHandle=getCell(newRow,newHi);
      if(!oldHandle||oldHandle!==newHandle)continue;
      for(let n=1;n<=3;n++){
        const aliases=['option'+n+' value','option'+n+'value'];
        const a=aliasIndex(baseline.headers,aliases),b=aliasIndex(current.headers,aliases);
        if(a<0||b<0)continue;
        const v1=getCell(oldRow,a),v2=getCell(newRow,b);
        if(v1&&v2&&v1!==v2)addRisk('high','バリエーションID変更リスク',newHandle,'Option'+n+' value',v1,v2,
          '選択肢の値を変更するとShopifyでバリエーションIDが再作成され、外部アプリ連携に影響する可能性があります。',newRow.no);
      }
    }
  }
}
function renderRisks(){
  const panel=$('riskPanel');
  panel.style.display=baseline&&modeNow()==='shopify'?'block':'none';
  $('riskCount').textContent=String(risks.length);
  $('exportRisks').disabled=risks.length===0;
  if(!risks.length){$('riskWrap').innerHTML='<div class="empty">比較できる範囲では高リスクの変更候補が見つかりませんでした。安全性やインポート成功を保証するものではありません。</div>';return;}
  let out='<table><thead><tr><th>CSV行</th><th>リスク</th><th>Handle</th><th>対象列</th><th>旧値</th><th>新値</th><th>説明</th></tr></thead><tbody>';
  for(const r of risks.slice(0,200))out+=`<tr><td>${r.line}</td><td><span class="pill bad">${escapeHtml(r.kind)}</span></td><td>${escapeHtml(r.handle)}</td><td>${escapeHtml(r.col)}</td><td title="${escapeHtml(r.before)}">${escapeHtml(r.before)}</td><td title="${escapeHtml(r.after)}">${escapeHtml(r.after)}</td><td title="${escapeHtml(r.message)}">${escapeHtml(r.message)}</td></tr>`;
  $('riskWrap').innerHTML=out+'</tbody></table>';
}
function compareFiles(){
  diffs=[];findShopifyRisks();renderRisks();
  if(!baseline||!current){$('diffPanel').style.display='none';return;}
  $('diffPanel').style.display='block';
  const shopify=modeNow()==='shopify', before=rowsByKey(baseline,shopify),after=rowsByKey(current,shopify);
  const oldP=findIndex(baseline.headers,'price'),newP=selected('priceCol'),oldS=findIndex(baseline.headers,'stock'),newS=selected('stockCol');
  for(const [key,row] of after.found){
    const prior=before.found.get(key);
    if(!prior){diffs.push({kind:'追加候補',key,old:'',now:'',line:row.no});continue;}
    for(const [field,idx1,idx2] of [['価格',oldP,newP],['在庫',oldS,newS]]){
      if(idx1<0||idx2<0)continue;
      let a=getCell(prior,idx1),b=getCell(row,idx2);
      if(a!==b)diffs.push({kind:field+'変更候補',key,old:a,now:b,line:row.no});
    }
  }
  for(const [key,row] of before.found)if(!after.found.has(key))diffs.push({kind:'削除候補',key,old:'',now:'',line:row.no});
  const add=diffs.filter(d=>d.kind==='追加候補').length, del=diffs.filter(d=>d.kind==='削除候補').length, changed=diffs.length-add-del;
  $('diffSummary').textContent=`追加候補 ${add}件 · 削除候補 ${del}件 · 価格/在庫の変更候補 ${changed}件 · 比較除外（重複キー）${before.duplicate.size+after.duplicate.size}件`;
  if(!diffs.length){$('diffWrap').innerHTML='<div class="empty">比較可能な商品コードについて追加・削除・価格/在庫変更は見つかりませんでした。</div>';return;}
  let out='<table><thead><tr><th>種別</th><th>商品キー</th><th>変更前</th><th>変更後</th><th>参照行</th></tr></thead><tbody>';
  for(const d of diffs.slice(0,200))out+=`<tr><td>${escapeHtml(d.kind)}</td><td>${escapeHtml(d.key)}</td><td>${escapeHtml(d.old)}</td><td>${escapeHtml(d.now)}</td><td>${d.line}</td></tr>`;
  $('diffWrap').innerHTML=out+'</tbody></table>';
}
function saveCsv(matrix,name,protect=true,newline="\r\n"){
  const csv='\uFEFF'+matrix.map(r=>r.map(v=>csvCell(protect?safeReportCell(v):v)).join(',')).join(newline);
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function decodeFile(file){
  if(file.size>10*1024*1024)throw new Error('10MBを超えるファイルには対応していません。');
  const buffer=await file.arrayBuffer();
  return new TextDecoder($('encoding').value,{fatal:true}).decode(buffer);
}
async function uploadMain(file){
  if(!file)return;
  try{
    const text=await decodeFile(file),parsed=tableFrom(text,file.name);
    sourceFile=file;usingSample=false;current=parsed;fillSelectors(current);$('results').classList.remove('hidden');$('dropTitle').textContent=file.name;runCheck();
  }catch(err){$('fileStatus').textContent='読み込み失敗: '+err.message;}
}
async function uploadBase(file){
  if(!file){baseline=null;oldFile=null;compareFiles();return;}
  try{const text=await decodeFile(file);baseline=tableFrom(text,file.name);oldFile=file;$('baselineStatus').textContent=`比較ファイル: ${file.name}（${baseline.rows.length}行）`;compareFiles();}
  catch(err){oldFile=null;baseline=null;$('baselineStatus').textContent='比較ファイルの読み込み失敗: '+err.message;compareFiles();}
}
$('chooseBtn').addEventListener('click',()=> $('fileInput').click());
$('fileInput').addEventListener('change',e=>uploadMain(e.target.files[0]));
$('baselineInput').addEventListener('change',e=>uploadBase(e.target.files[0]));
$('sampleBtn').addEventListener('click',()=>{sourceFile=null;usingSample=true;current=tableFrom(SAMPLE,'sample_products.csv');fillSelectors(current);$('results').classList.remove('hidden');$('dropTitle').textContent='サンプルデータを表示中';runCheck();});
for(const id of ['skuCol','nameCol','priceCol','stockCol','mode'])$(id).addEventListener('change',()=>{if(current)runCheck();});
$('delimiter').addEventListener('change',()=>{if(usingSample){current=tableFrom(SAMPLE,'sample_products.csv');fillSelectors(current);runCheck();}else{if(sourceFile)uploadMain(sourceFile);if(oldFile)uploadBase(oldFile);}});
$('encoding').addEventListener('change',()=>{if(sourceFile)uploadMain(sourceFile);if(oldFile)uploadBase(oldFile);});
const drop=$('drop');drop.addEventListener('click',e=>{if(!e.target.closest('button'))$('fileInput').click();});
drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click();}});
for(const n of ['dragenter','dragover'])drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('over');});
for(const n of ['dragleave','drop'])drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('over');});
drop.addEventListener('drop',e=>uploadMain(e.dataTransfer.files[0]));
$('exportIssues').addEventListener('click',()=>saveCsv([['CSV行番号','重要度','列名','問題','元データ'],...issues.map(o=>[o.no,o.level==='error'?'要修正':'要確認',o.col,o.message,o.value])],filenameBase(current.fileName)+'_issues.csv',true));
$('exportRisks').addEventListener('click',()=>saveCsv([['CSV行番号','リスク種別','Handle','対象列','変更前','変更後','確認事項'],...risks.map(r=>[r.line,r.kind,r.handle,r.col,r.before,r.after,r.message])],filenameBase(current.fileName)+'_risk_report.csv',true));
$('exportDiff').addEventListener('click',()=>saveCsv([['種別','商品キー','変更前','変更後','参照行'],...diffs.map(d=>[d.kind,d.key,d.old,d.now,d.line])],filenameBase(current.fileName)+'_difference.csv',true));
$('exportClean').addEventListener('click',()=>{
  if(!current || $('exportClean').disabled)return;
  const containsFormula=current.rows.some(r=>r.values.some(v=>/^[\t\r\n ]*[=+@]/.test(String(v))));
  if(containsFormula && !confirm('数式に見える値が含まれています。CSVをExcelで開くと式が実行される可能性があります。元の値を保持して保存しますか？'))return;
  saveCsv([current.headers,...current.rows.map(r=>r.values)],filenameBase(current.fileName)+'_utf8.csv',false,modeNow()==='shopify'?'\n':'\r\n');
});