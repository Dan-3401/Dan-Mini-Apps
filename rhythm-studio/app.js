const $ = (id) => document.getElementById(id);
const canvas = $("visualizer"), ctx = canvas.getContext("2d", { alpha: true });
const audio = $("audioEl"), video = $("videoEl");
let media = audio, audioCtx, source, analyser, audioDest, data, raf, objectUrl, currentFile, activeRecorder, demoPhase = 0, exporting = false, exportCancelled = false, autoGain = 1, energy = .18;
const state = { style: "circle", colorA: "#7c5cff", colorB: "#39e7d6", count: 96, power: 1.35, thickness: 4, smooth: .78, radius: 150, spectrumLayout: "center", dynamicGain: true, mirror: true, glow: true };
const values = ["count","power","thickness","smooth","radius"];
const fmt = { count:v=>v, power:v=>(v/100).toFixed(2), thickness:v=>v, smooth:v=>`${v}%`, radius:v=>v };

function toast(text){const t=$("toast");t.textContent=text;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function lerp(a,b,t){return a+(b-a)*t}
function hexRgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function mixColor(a,b,t,alpha=1){const x=hexRgb(a),y=hexRgb(b);return `rgba(${x.map((n,i)=>Math.round(lerp(n,y[i],t))).join(",")},${alpha})`}
function fitCanvas(){const raw=$("resolution").value;let w,h;if(raw.includes("x"))[w,h]=raw.split("x").map(Number);else w=h=Number(raw);canvas.width=w;canvas.height=h;$("checker").style.aspectRatio=`${w}/${h}`}
function arrangeSpectrum(bands,n){
  if(state.spectrumLayout==="original")return bands.slice(0,n);
  const half=bands.slice(0,Math.ceil(n/2));
  return (state.spectrumLayout==="edges"?half.concat([...half].reverse()):[...half].reverse().concat(half)).slice(0,n);
}
function fakeSpectrum(n){const bandCount=state.spectrumLayout==="original"?n:Math.ceil(n/2),bands=Array.from({length:bandCount},(_,i)=>{const x=i/bandCount*Math.PI;return Math.max(.05,.2+.14*Math.sin(x*3+demoPhase*2)+.1*Math.sin(x*8-demoPhase*4)+.08*Math.sin(x*13+demoPhase*3))});return arrangeSpectrum(bands,n)}
function spectrum(n){
  if(!analyser||media.paused)return fakeSpectrum(n);
  analyser.getByteFrequencyData(data);
  const bandCount=state.spectrumLayout==="original"?n:Math.ceil(n/2), maxBin=Math.min(data.length-1,460);
  let bands=Array.from({length:bandCount},(_,i)=>{
    const t=i/Math.max(1,bandCount-1), center=Math.floor(lerp(1,maxBin,Math.pow(t,1.75))), spread=Math.max(1,Math.floor(1+t*5));
    let total=0, samples=0;
    for(let j=-spread;j<=spread;j++){const idx=Math.max(0,Math.min(data.length-1,center+j));total+=data[idx];samples++}
    return Math.pow(total/samples/255,.72);
  });
  const peak=Math.max(...bands,.01), avg=bands.reduce((sum,v)=>sum+v,0)/bands.length;
  autoGain=state.dynamicGain?lerp(autoGain,Math.min(3.4,Math.max(.9,.82/peak)),.075):1;
  energy=lerp(energy,avg,.12);
  bands=bands.map((v,i)=>{
    const prev=bands[Math.max(0,i-1)],next=bands[Math.min(bands.length-1,i+1)],detail=v*.72+(prev+next)*.14;
    const livingFloor=state.dynamicGain?.018+energy*.12*(.7+.3*Math.sin(i*.83+demoPhase*4)):0;
    return Math.min(1,Math.max(livingFloor,detail*autoGain));
  });
  return arrangeSpectrum(bands,n);
}
function prep(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.lineWidth=state.thickness;ctx.lineCap="round";ctx.shadowBlur=state.glow?20:0}
function paintCircle(vals){const r=Math.min(state.radius,Math.min(canvas.width,canvas.height)*.34);vals.forEach((v,i)=>{const a=i/vals.length*Math.PI*2-Math.PI/2,len=12+v*150*state.power, color=mixColor(state.colorA,state.colorB,i/vals.length);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r+len),Math.sin(a)*(r+len));ctx.stroke()})}
function paintBars(vals){const width=Math.min(canvas.width*.78,1200), gap=width/vals.length, base=Math.min(320,canvas.height*.32);vals.forEach((v,i)=>{const h=10+v*base*state.power,x=-width/2+i*gap;ctx.strokeStyle=mixColor(state.colorA,state.colorB,i/vals.length);ctx.shadowColor=ctx.strokeStyle;ctx.lineWidth=Math.max(2,gap*.58);ctx.beginPath();ctx.moveTo(x,state.mirror?h/2:0);ctx.lineTo(x,-h/2);ctx.stroke()})}
function paintWave(vals){const width=canvas.width*.78, amp=Math.min(260,canvas.height*.28);for(const side of state.mirror?[-1,1]:[-1]){ctx.beginPath();vals.forEach((v,i)=>{const x=-width/2+i/(vals.length-1)*width,y=side*(6+v*amp*state.power);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=side<0?state.colorA:state.colorB;ctx.shadowColor=ctx.strokeStyle;ctx.stroke()}}
function paintOrbit(vals){const r=Math.min(state.radius,Math.min(canvas.width,canvas.height)*.3);ctx.strokeStyle=mixColor(state.colorA,state.colorB,.5,.32);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();vals.forEach((v,i)=>{const a=i/vals.length*Math.PI*2+demoPhase,r2=r+(v*130*state.power);ctx.fillStyle=mixColor(state.colorA,state.colorB,i/vals.length,.9);ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(Math.cos(a)*r2,Math.sin(a)*r2,Math.max(2,state.thickness*.6+v*7),0,Math.PI*2);ctx.fill()})}
function paintLine(vals){const width=canvas.width*.8;ctx.beginPath();vals.forEach((v,i)=>{const x=-width/2+i/(vals.length-1)*width,y=(v-.2)*-190*state.power*Math.sin(i*.7+demoPhase*2);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=state.colorA;ctx.shadowColor=state.colorB;ctx.stroke()}
function renderValues(vals){prep();({circle:paintCircle,bars:paintBars,wave:paintWave,orbit:paintOrbit,line:paintLine}[state.style])(vals);ctx.restore()}
function draw(){demoPhase+=.012;renderValues(spectrum(state.count));syncTime();raf=requestAnimationFrame(draw)}
function syncTime(){if(!media.duration||!isFinite(media.duration))return;$("seek").value=media.currentTime/media.duration*1000;$("currentTime").textContent=time(media.currentTime);$("duration").textContent=time(media.duration)}
function time(sec){sec=Math.floor(sec||0);return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`}
function setupAudio(){if(source)return;audioCtx=new AudioContext();source=audioCtx.createMediaElementSource(media);analyser=audioCtx.createAnalyser();audioDest=audioCtx.createMediaStreamDestination();analyser.fftSize=2048;analyser.smoothingTimeConstant=state.smooth;data=new Uint8Array(analyser.frequencyBinCount);source.connect(analyser);analyser.connect(audioCtx.destination);analyser.connect(audioDest)}
function loadFile(file){if(!file||(!file.type.startsWith("audio/")&&!file.type.startsWith("video/")))return toast("请选择音频或视频文件");if(objectUrl)URL.revokeObjectURL(objectUrl);if(source){location.reload();return}currentFile=file;objectUrl=URL.createObjectURL(file);media=file.type.startsWith("video/")?video:audio;media.src=objectUrl;media.load();$("fileName").textContent=file.name;$("fileMeta").textContent=`${(file.size/1024/1024).toFixed(2)} MB · ${file.type || "媒体文件"}`;$("fileCard").classList.remove("hidden");$("statusText").textContent="素材已载入";toast("素材载入完成")}
async function togglePlay(){if(!objectUrl)return toast("请先拖入一个音频或视频文件");setupAudio();if(audioCtx.state==="suspended")await audioCtx.resume();if(media.paused){await media.play();$("playBtn").textContent="❚❚";$("statusText").textContent="正在播放"}else{media.pause();$("playBtn").textContent="▶";$("statusText").textContent="已暂停"}}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}
function canvasBlob(){return new Promise(resolve=>canvas.toBlob(resolve,"image/png"))}
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function zipHeader(size){return new DataView(new ArrayBuffer(size))}
function zipFiles(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  files.forEach(file=>{const name=enc.encode(file.name),bytes=file.bytes,crc=crc32(bytes),local=zipHeader(30+name.length);local.setUint32(0,0x04034b50,true);local.setUint16(4,20,true);local.setUint16(6,0,true);local.setUint16(8,0,true);local.setUint32(14,crc,true);local.setUint32(18,bytes.length,true);local.setUint32(22,bytes.length,true);local.setUint16(26,name.length,true);new Uint8Array(local.buffer,30).set(name);parts.push(local.buffer,bytes);const dir=zipHeader(46+name.length);dir.setUint32(0,0x02014b50,true);dir.setUint16(4,20,true);dir.setUint16(6,20,true);dir.setUint32(16,crc,true);dir.setUint32(20,bytes.length,true);dir.setUint32(24,bytes.length,true);dir.setUint16(28,name.length,true);dir.setUint32(42,offset,true);new Uint8Array(dir.buffer,46).set(name);central.push(dir.buffer);offset+=local.byteLength+bytes.length});
  const centralSize=central.reduce((sum,x)=>sum+x.byteLength,0),end=zipHeader(22);end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);return new Blob([...parts,...central,end.buffer],{type:"application/zip"});
}
function offlineSpectrum(samples,sampleRate,time,n){
  const bandCount=state.spectrumLayout==="original"?n:Math.ceil(n/2),start=Math.floor(time*sampleRate),windowSize=256,bands=[];
  for(let band=0;band<bandCount;band++){const t=band/Math.max(1,bandCount-1),freq=55*Math.pow(145,t),step=Math.PI*2*freq/sampleRate;let re=0,im=0;for(let i=0;i<windowSize;i++){const sample=samples[Math.min(samples.length-1,start+i)]||0,win=.5-.5*Math.cos(Math.PI*2*i/(windowSize-1));re+=sample*win*Math.cos(step*i);im-=sample*win*Math.sin(step*i)}bands.push(Math.min(1,Math.pow(Math.sqrt(re*re+im*im)/windowSize*7,.62)))}
  const peak=Math.max(...bands,.01),avg=bands.reduce((sum,v)=>sum+v,0)/bands.length,gain=state.dynamicGain?Math.min(3.4,Math.max(.9,.82/peak)):1;
  return arrangeSpectrum(bands.map((v,i)=>Math.min(1,Math.max(state.dynamicGain?.012+avg*.08*(.7+.3*Math.sin(i*.83+demoPhase*4)):0,v*gain))),n);
}
async function decodeOfflineAudio(){
  if(!currentFile)throw new Error("missing file");
  if(!currentFile.type.startsWith("audio/"))throw new Error("audio only");
  const decodeCtx=new AudioContext(),buffer=await decodeCtx.decodeAudioData(await currentFile.arrayBuffer());
  await decodeCtx.close();return buffer;
}
async function writeHandle(handle,data){const writable=await handle.createWritable();await writable.write(data);await writable.close()}
async function exportPngFolder(){
  if(!currentFile)return toast("请先导入素材再导出");
  if(!currentFile.type.startsWith("audio/"))return toast("视频素材请使用兼容 WebM 导出");
  if(!window.showDirectoryPicker)return toast("当前浏览器不支持文件夹写入，请使用 Chrome 或 Edge");
  if(!confirm("请选择 D:、E: 或其他非 C: 盘文件夹。\n\n浏览器不会向网页暴露完整盘符，因此应用无法自动检查盘符。帧文件只会写入你接下来手动授权的目录。"))return;
  toast("请选择 D:、E: 或其他非 C: 盘目录");
  let root;try{root=await window.showDirectoryPicker({mode:"readwrite"})}catch(error){if(error.name!=="AbortError")console.error(error);return}
  exporting=true;exportCancelled=false;cancelAnimationFrame(raf);media.pause();$("playBtn").textContent="▶";$("exportBtn").textContent="取消导出";
  try{
    const buffer=await decodeOfflineAudio(),samples=buffer.getChannelData(0),fps=Math.min(30,Number($("fps").value)),frames=Math.ceil(buffer.duration*fps),stamp=new Date().toISOString().replace(/[:.]/g,"-"),project=await root.getDirectoryHandle(`rhythm-sequence-${stamp}`,{create:true}),folder=await project.getDirectoryHandle("frames",{create:true});
    await writeHandle(await project.getFileHandle("sequence-info.txt",{create:true}),`PNG sequence\nfps=${fps}\nframes=${frames}\nduration=${buffer.duration.toFixed(3)}\nsize=${canvas.width}x${canvas.height}\nsource=${currentFile.name}\n`);
    for(let frame=0;frame<frames;frame++){if(exportCancelled)throw new Error("cancelled");demoPhase=frame/fps*.72;renderValues(offlineSpectrum(samples,buffer.sampleRate,frame/fps,state.count));const blob=await canvasBlob(),handle=await folder.getFileHandle(`frame-${String(frame+1).padStart(6,"0")}.png`,{create:true});await writeHandle(handle,blob);if(frame%5===0||frame===frames-1){const percent=Math.round((frame+1)/frames*100);$("statusText").textContent=`正在写入透明序列 ${percent}%`;await new Promise(requestAnimationFrame)}}
    toast("透明 PNG 序列已写入所选文件夹");
  }catch(error){if(error.message==="cancelled")toast("已取消导出，已生成的帧保留在所选文件夹");else{console.error(error);toast(error.message==="audio only"?"视频素材请使用兼容 WebM 导出":"文件夹导出失败，请检查目录权限")}}
  finally{exporting=false;exportCancelled=false;$("exportBtn").textContent="导出素材";$("statusText").textContent="导出结束";draw()}
}
async function exportPngZip(){
  if(!currentFile)return toast("请先导入素材再导出");
  if(!currentFile.type.startsWith("audio/"))return toast("视频素材请使用兼容 WebM 导出");
  exporting=true;exportCancelled=false;cancelAnimationFrame(raf);media.pause();$("playBtn").textContent="▶";$("exportBtn").textContent="取消导出";
  try{
    const decodeCtx=new AudioContext(),buffer=await decodeCtx.decodeAudioData(await currentFile.arrayBuffer()),samples=buffer.getChannelData(0),fps=Math.min(30,Number($("fps").value)),frames=Math.ceil(buffer.duration*fps),files=[];
    await decodeCtx.close();if(frames>3600)throw new Error("PNG sequence export is limited to two minutes");
    for(let frame=0;frame<frames;frame++){if(exportCancelled)throw new Error("cancelled");demoPhase=frame/fps*.72;renderValues(offlineSpectrum(samples,buffer.sampleRate,frame/fps,state.count));const blob=await canvasBlob();files.push({name:`frames/frame-${String(frame+1).padStart(6,"0")}.png`,bytes:new Uint8Array(await blob.arrayBuffer())});if(frame%10===0||frame===frames-1){const percent=Math.round((frame+1)/frames*100);$("statusText").textContent=`正在准备 ZIP ${percent}%`;await new Promise(requestAnimationFrame)}}
    const manifest=new TextEncoder().encode(`PNG sequence\nfps=${fps}\nframes=${frames}\nduration=${buffer.duration.toFixed(3)}\nsize=${canvas.width}x${canvas.height}\n`);
    files.unshift({name:"sequence-info.txt",bytes:manifest});$("exportBtn").textContent="正在打包 ZIP…";download(zipFiles(files),`rhythm-png-sequence-${Date.now()}.zip`);toast("透明 PNG 序列已导出");
  }catch(error){if(error.message==="cancelled")toast("已取消 ZIP 导出");else{console.error(error);toast(error.message.includes("two minutes")?"ZIP 适合 2 分钟内素材，请选择文件夹导出":"快速导出失败，请改用文件夹导出")}}
  finally{exporting=false;exportCancelled=false;$("exportBtn").textContent="导出素材";$("statusText").textContent="导出结束";draw()}
}
async function exportWebm(){if(!objectUrl)return toast("请先导入素材再导出");if(!window.MediaRecorder)return toast("当前浏览器不支持录制导出");setupAudio();if(audioCtx.state==="suspended")await audioCtx.resume();const stream=canvas.captureStream(Number($("fps").value));if($("includeAudio").checked&&audioDest.stream.getAudioTracks()[0])stream.addTrack(audioDest.stream.getAudioTracks()[0]);const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));const chunks=[],rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:12000000}:undefined);activeRecorder=rec;rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);rec.onstop=()=>{if(!exportCancelled)download(new Blob(chunks,{type:rec.mimeType||"video/webm"}),`rhythm-overlay-${Date.now()}.webm`);activeRecorder=null;exporting=false;$("exportBtn").textContent="导出素材";toast(exportCancelled?"已取消 WebM 录制":"透明 WebM 已导出");exportCancelled=false};exporting=true;exportCancelled=false;$("exportBtn").textContent="取消录制";media.currentTime=0;await media.play();$("playBtn").textContent="❚❚";rec.start(500);media.onended=()=>{rec.stop();$("playBtn").textContent="▶";$("statusText").textContent="导出完成"};toast("兼容 WebM 需要实时录制，播放结束后自动下载")}
values.forEach(id=>$(id).addEventListener("input",e=>{let v=Number(e.target.value);state[id]=id==="power"?v/100:id==="smooth"?v/100:v;$(`${id}Out`).textContent=fmt[id](v);if(id==="smooth"&&analyser)analyser.smoothingTimeConstant=state.smooth}));
["colorA","colorB"].forEach(id=>$(id).addEventListener("input",e=>state[id]=e.target.value));
$("spectrumLayout").addEventListener("change",e=>state.spectrumLayout=e.target.value);
["dynamicGain","mirror","glow"].forEach(id=>$(id).addEventListener("change",e=>{state[id]=e.target.checked;if(id==="dynamicGain")autoGain=1}));
$("exportMode").addEventListener("change",e=>{const mode=e.target.value,webm=mode==="webm";$("includeAudio").disabled=!webm;if(!webm)$("includeAudio").checked=false;$("exportHint").textContent=mode==="folder"?"逐帧直接写入你选择的文件夹，不占用大量内存。请选择 D:、E: 或其他非 C: 盘目录。":mode==="pngzip"?"离线逐帧渲染并打包。适合 2 分钟内素材，按最高 30 FPS 导出。":"兼容性较好，可选择包含原音频。受浏览器媒体时间轴限制，需要等待素材实时播放完成。"});
document.querySelectorAll(".style-card").forEach(btn=>btn.addEventListener("click",()=>{document.querySelector(".style-card.active").classList.remove("active");btn.classList.add("active");state.style=btn.dataset.style}));
const dz=$("dropZone");["dragenter","dragover"].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add("dragover")}));["dragleave","drop"].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove("dragover")}));dz.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));$("fileInput").addEventListener("change",e=>loadFile(e.target.files[0]));$("playBtn").addEventListener("click",togglePlay);$("exportBtn").addEventListener("click",()=>{if(exporting){exportCancelled=true;if(activeRecorder&&activeRecorder.state!=="inactive"){media.pause();activeRecorder.stop()}return toast("正在取消导出…")}const mode=$("exportMode").value;return mode==="folder"?exportPngFolder():mode==="pngzip"?exportPngZip():exportWebm()});$("resolution").addEventListener("change",fitCanvas);$("seek").addEventListener("input",e=>{if(media.duration)media.currentTime=e.target.value/1000*media.duration});$("removeFileBtn").addEventListener("click",()=>location.reload());$("resetBtn").addEventListener("click",()=>location.reload());[audio,video].forEach(el=>el.addEventListener("loadedmetadata",syncTime));$("includeAudio").disabled=true;fitCanvas();draw();
if(!window.showDirectoryPicker)$("exportHint").textContent="当前浏览器不支持直接写入文件夹。请双击 launch.cmd，并使用 Chrome 或 Edge 打开；也可切换到短素材 ZIP 或 WebM。";
