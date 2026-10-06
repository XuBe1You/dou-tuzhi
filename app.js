/* 豆图纸 app.js — 纯前端，无任何外部依赖 */
'use strict';

/* ================= 色彩科学 ================= */
function srgbToLinear(c){ c/=255; return c<=0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }
function rgbToLab(r,g,b){
  const R=srgbToLinear(r),G=srgbToLinear(g),B=srgbToLinear(b);
  let x=(R*0.4124564+G*0.3575761+B*0.1804375)/0.95047;
  let y=(R*0.2126729+G*0.7151522+B*0.0721750);
  let z=(R*0.0193339+G*0.1191920+B*0.9503041)/1.08883;
  const f=t=> t>0.008856 ? Math.cbrt(t) : (7.787*t+16/116);
  x=f(x); y=f(y); z=f(z);
  return [116*y-16, 500*(x-y), 200*(y-z)];
}
/* CIEDE2000（Sharma 2005 实现） */
const RAD=Math.PI/180;
function ciede2000(L1,a1,b1,L2,a2,b2){
  const C1=Math.sqrt(a1*a1+b1*b1), C2=Math.sqrt(a2*a2+b2*b2), Cb=(C1+C2)/2;
  const C7=Math.pow(Cb,7), G=0.5*(1-Math.sqrt(C7/(C7+Math.pow(25,7))));
  const Ap1=(1+G)*a1, Ap2=(1+G)*a2;
  const Cp1=Math.sqrt(Ap1*Ap1+b1*b1), Cp2=Math.sqrt(Ap2*Ap2+b2*b2);
  const Hp1=(Math.atan2(b1,Ap1)/RAD+360)%360, Hp2=(Math.atan2(b2,Ap2)/RAD+360)%360;
  const dL=L2-L1, dC=Cp2-Cp1;
  let dH=0;
  if(Cp1*Cp2!==0){
    let dh=Hp2-Hp1;
    if(dh>180)dh-=360; else if(dh<-180)dh+=360;
    dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(dh*RAD/2);
  }
  let Hbb;
  if(Cp1*Cp2===0) Hbb=Hp1+Hp2;
  else{
    const diff=Math.abs(Hp1-Hp2), sum=Hp1+Hp2;
    Hbb=sum/2 + (diff>180 ? (sum<360?180:-180) : 0);
  }
  const Lbb=(L1+L2)/2, Cbb=(Cp1+Cp2)/2;
  const T=1-0.17*Math.cos((Hbb-30)*RAD)+0.24*Math.cos(2*Hbb*RAD)
        +0.32*Math.cos((3*Hbb+6)*RAD)-0.20*Math.cos((4*Hbb-63)*RAD);
  const dTheta=30*Math.exp(-Math.pow((Hbb-275)/25,2));
  const Cb7=Math.pow(Cbb,7);
  const Rc=2*Math.sqrt(Cb7/(Cb7+Math.pow(25,7)));
  const Sl=1+0.015*Math.pow(Lbb-50,2)/Math.sqrt(20+Math.pow(Lbb-50,2));
  const Sc=1+0.045*Cbb, Sh=1+0.015*Cbb*T;
  const Rt=-Math.sin(2*dTheta*RAD)*Rc;
  return Math.sqrt(Math.pow(dL/Sl,2)+Math.pow(dC/Sc,2)+Math.pow(dH/Sh,2)+Rt*(dC/Sc)*(dH/Sh));
}

/* ================= 全局状态 ================= */
const state={
  bitmap:null, imgName:'', srcW:0, srcH:0,
  palette:null,
  map:null, w:0, h:0,
  counts:null, total:0, usedCount:0,
  borderIdx:-1, borderLabel:'',
  busy:false, regenTimer:null,
};

const $=id=>document.getElementById(id);

/* ================= 色板 ================= */
function initPaletteSelect(){
  const sel=$('paletteSel');
  (window.BEAD_PALETTES||[]).forEach(p=>{
    const o=document.createElement('option');
    o.value=p.id; o.textContent=`${p.label}（${p.colors.length}色）`;
    if(p.id==='mard-221') o.selected=true;
    sel.appendChild(o);
  });
  sel.addEventListener('change',()=>{ loadPalette(); queueRegen(); });
}
function loadPalette(){
  const id=$('paletteSel').value;
  const raw=(window.BEAD_PALETTES||[]).find(p=>p.id===id)||window.BEAD_PALETTES[0];
  state.palette={
    id:raw.id, label:raw.label,
    colors:raw.colors.map(c=>{
      const hex=c.hex.replace('#','');
      const rgb=[parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
      return {
        code:c.code, name:c.name, hex:'#'+hex.padStart(6,'0'), rgb,
        lab:rgbToLab(rgb[0],rgb[1],rgb[2]),
        light:rgb.map(v=>Math.round(v+(255-v)*0.32)),
      };
    }),
  };
}

/* ================= 最近色查找（带量化缓存） ================= */
function makeNearest(){
  const cache=new Map(), cols=state.palette.colors;
  return function(r,g,b){
    const key=((r>>2)<<12)|((g>>2)<<6)|(b>>2);
    const hit=cache.get(key);
    if(hit!==undefined) return hit;
    const lab=rgbToLab(r,g,b);
    let best=0,bd=Infinity;
    for(let i=0;i<cols.length;i++){
      const c=cols[i].lab;
      const d=ciede2000(lab[0],lab[1],lab[2],c[0],c[1],c[2]);
      if(d<bd){bd=d;best=i;}
    }
    cache.set(key,best);
    return best;
  };
}

/* ================= 图片载入 ================= */
async function handleFile(file){
  if(!file || !file.type.startsWith('image/')){ toast('请选择图片文件'); return; }
  try{
    let bmp;
    try{ bmp=await createImageBitmap(file,{imageOrientation:'from-image'}); }
    catch(e){ bmp=await loadViaImg(file); }
    setImage(bmp, file.name || '粘贴的图片');
  }catch(err){ toast('图片读取失败，换一张试试'); }
}
function loadViaImg(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); res(img); };
    img.onerror=rej; img.src=url;
  });
}
function setImage(bmp,name){
  state.bitmap=bmp;
  state.srcW=bmp.width||bmp.naturalWidth; state.srcH=bmp.height||bmp.naturalHeight;
  state.imgName=(String(name).replace(/\.[^.]+$/,'')||'pattern').slice(0,40);
  $('imgName').textContent=`✅ ${name}（${state.srcW}×${state.srcH}）`;
  $('imgMeta').hidden=false;
  $('btnGenerate').disabled=false;
  updateSizeLabel();
}
/* 示例图片：内置画一个渐变爱心 */
async function loadDemo(){
  const c=document.createElement('canvas'); c.width=c.height=512;
  const x=c.getContext('2d');
  x.fillStyle='#ffffff'; x.fillRect(0,0,512,512);
  x.setTransform(1.4,0,0,1.4,-102,-112);
  const g=x.createLinearGradient(120,120,400,400);
  g.addColorStop(0,'#ff8fb3'); g.addColorStop(1,'#e0245e');
  x.fillStyle=g;
  x.beginPath();
  x.moveTo(256,420);
  x.bezierCurveTo(90,300,110,140,220,150);
  x.bezierCurveTo(260,154,256,190,256,190);
  x.bezierCurveTo(256,190,252,154,292,150);
  x.bezierCurveTo(402,140,422,300,256,420);
  x.fill();
  x.fillStyle='#ffd166';
  star(x,120,110,26); star(x,405,140,20); star(x,392,392,16);
  const bmp=await createImageBitmap(c);
  setImage(bmp,'示例图片');
}
function star(x,cx,cy,r){
  x.beginPath();
  for(let i=0;i<10;i++){
    const rad=i%2===0?r:r*0.45, a=Math.PI/5*i-Math.PI/2;
    const px=cx+Math.cos(a)*rad, py=cy+Math.sin(a)*rad;
    i===0?x.moveTo(px,py):x.lineTo(px,py);
  }
  x.closePath(); x.fill();
}

/* ================= 参数 ================= */
function gridW(){ return Math.max(10, Math.min(220, parseInt($('gridSize').value,10)||58)); }
/* 图案区尺寸 + 描边一圈后的成品尺寸（成品 = 用户选的豆板宽度，保证放得下） */
function computeDims(){
  let dw=Math.max(8,gridW()-2);
  let dh=Math.round(dw*state.srcH/state.srcW);
  if(dh>218){ dh=218; dw=Math.max(8,Math.round(dh*state.srcW/state.srcH)); }
  if(dh<8){ dh=8; }
  return { dw, dh, fw:dw+2, fh:dh+2 };
}
function updateSizeLabel(){
  if(!state.bitmap){
    const fw=gridW();
    $('gridSizeLabel').textContent=fw;
    $('sizeOut').textContent=`${fw} 颗宽 · 描边沿图案轮廓生成 · 高度按图片比例自动算`;
    return;
  }
  const d=computeDims();
  $('gridSizeLabel').textContent=d.fw;
  $('sizeOut').textContent=`成品 ${d.fw}×${d.fh} 颗（描边沿图案轮廓，图案区 ${d.dw}×${d.dh}）· 5mm 豆约 ${(d.fw*0.5).toFixed(0)}×${(d.fh*0.5).toFixed(0)} cm`;
}
function currentParams(){
  return {
    w:gridW(),
    paletteId:$('paletteSel').value,
    maxColors:parseInt($('maxColorsSel').value,10)||0,
    dither:parseFloat($('ditherSel').value),
    enhance:$('enhanceChk').checked,
    cutBg:$('cutBgChk').checked,
    border:$('borderSel').value,
  };
}

/* ================= 核心：生成 ================= */
function generate(){
  if(!state.bitmap||state.busy) return;
  state.busy=true;
  $('busy').hidden=false;
  setTimeout(()=>{
    try{ generateSync(); }
    catch(err){ console.error(err); toast('生成失败：'+err.message); }
    state.busy=false; $('busy').hidden=true;
  },30);
}
function generateSync(){
  const p=currentParams();
  loadPalette();

  /* 图案区尺寸（成品 = 图案区 + 描边一圈） */
  const dims=computeDims();
  const w=dims.dw, h=dims.dh;

  const img=drawScaled(state.bitmap,w,h,p.enhance);
  const px=img.data;

  /* 背景检测：内容区四边取中位色（去背景与轮廓描边都要用） */
  let bgLab=null;
  {
    const rs=[],gs=[],bs=[];
    const push=(i)=>{ rs.push(px[i]); gs.push(px[i+1]); bs.push(px[i+2]); };
    for(let x=0;x<w;x++){ push(x*4); push(((h-1)*w+x)*4); }
    for(let y=0;y<h;y++){ push(y*w*4); push((y*w+w-1)*4); }
    const med=a=>{ a.sort((m,n)=>m-n); return a[Math.floor(a.length/2)]; };
    bgLab=rgbToLab(med(rs),med(gs),med(bs));
  }

  const nearest=makeNearest();
  const map=new Int16Array(w*h).fill(-1);
  const doDither=p.dither>0;
  const err=doDither?new Float32Array(w*h*3):null;
  const strength=p.dither;

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=y*w+x, o=i*4;
      if(px[o+3]<128){ map[i]=-1; continue; }
      let r=px[o],g=px[o+1],b=px[o+2];
      if(err){ r=clamp255(r+err[i*3]); g=clamp255(g+err[i*3+1]); b=clamp255(b+err[i*3+2]); }
      if(p.cutBg&&bgLab){
        const lab=rgbToLab(r,g,b);
        if(ciede2000(lab[0],lab[1],lab[2],bgLab[0],bgLab[1],bgLab[2])<15){
          map[i]=-1; continue;
        }
      }
      const idx=nearest(Math.round(r),Math.round(g),Math.round(b));
      map[i]=idx;
      if(err){
        const c=state.palette.colors[idx].rgb;
        const er=(r-c[0])*strength, eg=(g-c[1])*strength, eb=(b-c[2])*strength;
        if(x+1<w)          addErr(err,(i+1)*3,er*7/16,eg*7/16,eb*7/16);
        if(y+1<h){
          if(x>0)          addErr(err,(i+w-1)*3,er*3/16,eg*3/16,eb*3/16);
                           addErr(err,(i+w)*3,er*5/16,eg*5/16,eb*5/16);
          if(x+1<w)        addErr(err,(i+w+1)*3,er/16,eg/16,eb/16);
        }
      }
    }
  }

  /* ===== 硬性要求：沿图案轮廓的黑/白描边 =====
     有可辨认背景/透明区时：描边贴着主体轮廓走（爱心周围跟爱心形状一圈）；
     整图铺满（如照片）时：退化为最外圈方框描边。 */
  const cols=state.palette.colors;
  let blackIdx=0,wL=Infinity,whiteIdx=0,bL=-Infinity;
  for(let i=0;i<cols.length;i++){
    const L=cols[i].lab[0];
    if(L<wL){ wL=L; blackIdx=i; }
    if(L>bL){ bL=L; whiteIdx=i; }
  }
  let borderIdx=blackIdx, borderLabel='黑';

  /* 内容区分类：主体 vs 背景（空格，或与背景色感知接近的格子） */
  const bgIdx=(()=>{ let bi=0,bd=Infinity; for(let i=0;i<cols.length;i++){ const c=cols[i].lab; const d=ciede2000(bgLab[0],bgLab[1],bgLab[2],c[0],c[1],c[2]); if(d<bd){bd=d;bi=i;} } return bi; })();
  const outTh=20;
  const isOutContent=i=>{
    if(map[i]===-1) return true;
    const c=cols[map[i]].lab;
    return ciede2000(c[0],c[1],c[2],bgLab[0],bgLab[1],bgLab[2])<outTh;
  };
  let outsideN=0, subjectN=0, edgeLSum=0, edgeN=0, hasEmpty=false;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(map[i]===-1) hasEmpty=true;
    if(isOutContent(i)){ outsideN++; continue; }
    subjectN++;
    let boundary=false;
    for(let dy=-1;dy<=1&&!boundary;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if(nx<0||ny<0||nx>=w||ny>=h){ boundary=true; break; }
      if(isOutContent(ny*w+nx)){ boundary=true; break; }
    }
    if(boundary){ edgeLSum+=cols[map[i]].lab[0]; edgeN++; }
  }
  const caseA = hasEmpty || (outsideN/(w*h))>=0.12;   // 有背景可辨 → 轮廓描边

  const meanEdgeL = edgeN>0 ? edgeLSum/edgeN : 100;
  if(p.border==='white'){ borderIdx=whiteIdx; borderLabel='白'; }
  else if(p.border==='auto' && meanEdgeL<50){ borderIdx=whiteIdx; borderLabel='白'; }

  const fw=w+2, fh=h+2;
  const fMap=new Int16Array(fw*fh);
  if(caseA && subjectN>0){
    /* 边距圈 = 背景（去背景时留空，保留背景时铺背景豆），随后描边贴轮廓生成 */
    fMap.fill(p.cutBg?-1:bgIdx);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) fMap[(y+1)*fw+(x+1)]=map[y*w+x];
    /* 基于快照收集轮廓格：与主体 8 邻相接的背景格 → 描边色 */
    const snap=new Int16Array(fMap);
    const isOut=i=>{
      const v=snap[i];
      if(v===-1) return true;
      const c=cols[v].lab;
      return ciede2000(c[0],c[1],c[2],bgLab[0],bgLab[1],bgLab[2])<outTh;
    };
    const toOutline=[];
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
      const i=y*fw+x;
      if(!isOut(i)) continue;
      let touch=false;
      for(let dy=-1;dy<=1&&!touch;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy) continue;
        const nx=x+dx, ny=y+dy;
        if(nx<0||ny<0||nx>=fw||ny>=fh) continue;
        if(!isOut(ny*fw+nx)){ touch=true; break; }
      }
      if(touch) toOutline.push(i);
    }
    for(const i of toOutline) fMap[i]=borderIdx;
  }else{
    /* 无背景可辨：整图铺满 → 最外一圈方框描边 */
    fMap.fill(-1);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) fMap[(y+1)*fw+(x+1)]=map[y*w+x];
    for(let x=0;x<fw;x++){ fMap[x]=borderIdx; fMap[(fh-1)*fw+x]=borderIdx; }
    for(let y=0;y<fh;y++){ fMap[y*fw]=borderIdx; fMap[y*fw+fw-1]=borderIdx; }
  }

  /* 颜色数上限：用量最少的颜色并入最近的在用色（描边色受保护，永不被合并） */
  let cap=p.maxColors; if(cap===0) cap=64;
  const counts=new Map();
  for(let i=0;i<fMap.length;i++){ const v=fMap[i]; if(v>=0) counts.set(v,(counts.get(v)||0)+1); }
  while(counts.size>cap){
    let minIdx=-1,minC=Infinity;
    for(const [k,c] of counts){ if(k!==borderIdx&&c<minC){ minC=c; minIdx=k; } }
    if(minIdx<0) break;
    let best=-1,bd=Infinity;
    const a=state.palette.colors[minIdx].lab;
    for(const k of counts.keys()){
      if(k===minIdx) continue;
      const b2=state.palette.colors[k].lab;
      const d=ciede2000(a[0],a[1],a[2],b2[0],b2[1],b2[2]);
      if(d<bd){bd=d;best=k;}
    }
    if(best<0) break;
    for(let i=0;i<fMap.length;i++) if(fMap[i]===minIdx) fMap[i]=best;
    counts.set(best,(counts.get(best)||0)+minC);
    counts.delete(minIdx);
  }

  state.map=fMap; state.w=fw; state.h=fh;
  state.borderIdx=borderIdx; state.borderLabel=borderLabel;
  state.counts=counts;
  state.total=[...counts.values()].reduce((s,v)=>s+v,0);
  state.usedCount=counts.size;

  renderAll();
  $('resultCard').hidden=false;
  $('resultCard').scrollIntoView({behavior:'smooth',block:'start'});
}
function addErr(arr,o,r,g,b){ arr[o]+=r; arr[o+1]+=g; arr[o+2]+=b; }
function clamp255(v){ return v<0?0:(v>255?255:v); }

function drawScaled(bitmap,tw,th,enhance){
  let src=bitmap, sw=bitmap.width||bitmap.naturalWidth, sh=bitmap.height||bitmap.naturalHeight;
  while(sw>=tw*2&&sh>=th*2){
    const nw=Math.max(tw,Math.floor(sw/2)), nh=Math.max(th,Math.floor(sh/2));
    const c=document.createElement('canvas'); c.width=nw; c.height=nh;
    const cx=c.getContext('2d');
    cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high';
    cx.drawImage(src,0,0,nw,nh);
    src=c; sw=nw; sh=nh;
  }
  const c=document.createElement('canvas'); c.width=tw; c.height=th;
  const cx=c.getContext('2d',{willReadFrequently:true});
  cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high';
  try{ if(enhance) cx.filter='saturate(1.22) contrast(1.07)'; }catch(e){}
  cx.drawImage(src,0,0,tw,th);
  return cx.getImageData(0,0,tw,th);
}

/* ================= 渲染 ================= */
function renderAll(){
  $('statSize').textContent=`${state.w}×${state.h}`;
  $('statTotal').textContent=state.total.toLocaleString();
  $('statColors').textContent=state.usedCount;
  $('statBorder').textContent=(state.counts.get(state.borderIdx)||0).toLocaleString();
  $('statBorderLabel').textContent=`${state.borderLabel}边豆数`;
  renderPreview($('numToggle').checked);
  renderBOM();
}
function renderPreview(numbered){
  const cv=$('previewCanvas'), box=cv.parentElement;
  const avail=Math.max(280,box.clientWidth-4);
  const cell=Math.max(3,Math.min(26,Math.floor(avail/state.w)));
  const dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=state.w*cell*dpr; cv.height=state.h*cell*dpr;
  cv.style.width=(state.w*cell)+'px';
  const ctx=cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,state.w*cell,state.h*cell);
  const cols=state.palette.colors;
  for(let y=0;y<state.h;y++)for(let x=0;x<state.w;x++){
    const idx=state.map[y*state.w+x];
    const cx=x*cell, cy=y*cell;
    if(idx<0){ ctx.fillStyle='#f1f4f8'; ctx.fillRect(cx,cy,cell,cell); continue; }
    drawBead(ctx,cx+cell/2,cy+cell/2,cell*0.46,cols[idx],numbered?cell:0);
  }
}
function drawBead(ctx,cx,cy,r,col,numFontSize){
  const g=ctx.createRadialGradient(cx-r*0.3,cy-r*0.35,r*0.1,cx,cy,r*1.05);
  g.addColorStop(0,`rgb(${col.light[0]},${col.light[1]},${col.light[2]})`);
  g.addColorStop(1,col.hex);
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(40,30,20,.10)'; ctx.lineWidth=Math.max(.5,r*.06);
  ctx.stroke();
  if(numFontSize>=13){
    const lum=0.299*col.rgb[0]+0.587*col.rgb[1]+0.114*col.rgb[2];
    ctx.fillStyle=lum>150?'rgba(35,30,25,.85)':'rgba(255,255,255,.92)';
    ctx.font=`700 ${Math.round(numFontSize*0.36)}px system-ui,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(col.code,cx,cy+0.5);
  }
}
function renderBOM(){
  const rows=[...state.counts.entries()]
    .map(([idx,count])=>({col:state.palette.colors[idx],count}))
    .sort((a,b)=>b.count-a.count);
  const tb=$('bomBody'); tb.innerHTML='';
  for(const r of rows){
    const tr=document.createElement('tr');
    const pct=(r.count/state.total*100);
    tr.innerHTML=
      `<td><span class="swatch" style="background:${r.col.hex}"></span></td>`+
      `<td><b>${esc(r.col.code)}</b></td>`+
      `<td class="muted">${esc(r.col.name||'—')}</td>`+
      `<td>${r.count.toLocaleString()}</td>`+
      `<td style="min-width:90px"><span class="bar" style="width:${pct.toFixed(1)}%;background:${r.col.hex}"></span><span class="muted small">${pct.toFixed(1)}%</span></td>`;
    tb.appendChild(tr);
  }
}
function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

/* ================= 导出 ================= */
function exportCanvas(numbered){
  const w=state.w,h=state.h,cols=state.palette.colors;
  let cell=36; const pad=64, header=96;
  while(w*cell+pad*2>9000&&cell>4) cell--;
  const W=w*cell+pad*2, H=h*cell+pad*2+header;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#2d2a26';
  ctx.font='700 30px system-ui,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText(`${w}×${h} 颗 · ${state.borderLabel||'描'}边沿轮廓 · 共 ${state.total.toLocaleString()} 豆 · ${state.usedCount} 色 · ${state.palette.label}`,pad,42);
  ctx.fillStyle='#8a8378'; ctx.font='15px system-ui,sans-serif';
  ctx.fillText('豆图纸生成 · 每 10 格一条辅助线 · 色号见配豆清单',pad,68);

  const ox=pad, oy=pad+header;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const idx=state.map[y*w+x];
    if(idx<0){ ctx.fillStyle='#f1f4f8'; ctx.fillRect(ox+x*cell,oy+y*cell,cell,cell); continue; }
    drawBead(ctx,ox+x*cell+cell/2,oy+y*cell+cell/2,cell*0.47,cols[idx],numbered?cell:0);
  }
  ctx.lineWidth=1;
  for(let x=0;x<=w;x++){
    ctx.strokeStyle=x%10===0?'rgba(45,42,38,.45)':'rgba(45,42,38,.07)';
    ctx.beginPath(); ctx.moveTo(ox+x*cell+.5,oy); ctx.lineTo(ox+x*cell+.5,oy+h*cell); ctx.stroke();
  }
  for(let y=0;y<=h;y++){
    ctx.strokeStyle=y%10===0?'rgba(45,42,38,.45)':'rgba(45,42,38,.07)';
    ctx.beginPath(); ctx.moveTo(ox,oy+y*cell+.5); ctx.lineTo(ox+w*cell,oy+y*cell+.5); ctx.stroke();
  }
  ctx.fillStyle='#8a8378'; ctx.font='13px system-ui,sans-serif';
  for(let x=10;x<=w;x+=10) ctx.fillText(String(x),ox+x*cell-8,oy-6);
  for(let y=10;y<=h;y+=10) ctx.fillText(String(y),6,oy+y*cell+4);
  ctx.fillStyle='#c9c0b2'; ctx.font='14px system-ui,sans-serif';
  ctx.fillText('由「豆图纸」生成 — 免费拼豆图纸工具',ox,oy+h*cell+34);
  return cv;
}
function download(blobOrCanvas,filename){
  const done=b=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b); a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},400);
  };
  if(blobOrCanvas.toBlob) blobOrCanvas.toBlob(done,'image/png');
  else done(blobOrCanvas);
}
function fname(suffix,ext){ return `${state.imgName||'pattern'}-${state.w}x${state.h}${suffix}.${ext}`; }

function exportCSV(){
  const rows=[...state.counts.entries()]
    .map(([idx,count])=>({col:state.palette.colors[idx],count}))
    .sort((a,b)=>b.count-a.count);
  const lines=[['豆号','名称','颜色','颗数'].join(',')];
  for(const r of rows) lines.push([r.col.code,`"${(r.col.name||'').replace(/"/g,'""')}"`,r.col.hex,r.count].join(','));
  lines.push(['合计','','',state.total].join(','));
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  download(blob,fname('','csv'));
}
function printView(){
  const url=exportCanvas(true).toDataURL('image/png');
  const rows=[...state.counts.entries()]
    .map(([idx,count])=>({col:state.palette.colors[idx],count}))
    .sort((a,b)=>b.count-a.count);
  const bomRows=rows.map(r=>
    `<tr><td><span class="sw" style="background:${r.col.hex}"></span></td><td><b>${esc(r.col.code)}</b></td><td>${esc(r.col.name||'')}</td><td>${r.count}</td></tr>`).join('');
  const w=window.open('','_blank');
  if(!w){ toast('浏览器拦截了弹窗，请允许弹窗后重试'); return; }
  w.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(state.imgName)} 拼豆图纸</title>
  <style>
    body{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#222;margin:24px}
    h1{font-size:20px} p.sub{color:#777;font-size:13px;margin:4px 0 18px}
    img{width:100%;max-width:760px;border:1px solid #eee}
    table{border-collapse:collapse;margin-top:18px;font-size:13px}
    th,td{border:1px solid #ddd;padding:5px 12px;text-align:left}
    .sw{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:middle}
    .credit{margin-top:20px;color:#999;font-size:12px}
  </style></head><body>
  <h1>${esc(state.imgName)} — 拼豆图纸 ${state.w}×${state.h}</h1>
  <p class="sub">共 ${state.total.toLocaleString()} 豆 · ${state.usedCount} 色 · ${state.borderLabel||''}边沿轮廓描边 · ${esc(state.palette.label)} · 由「豆图纸」免费生成</p>
  <img src="${url}" alt="拼豆图纸">
  <h3 style="margin-top:22px">配豆清单</h3>
  <table><tr><th></th><th>豆号</th><th>名称</th><th>颗数</th></tr>${bomRows}</table>
  <p class="credit">豆图纸 DouTuZhi · 色板数据 craft-color-codes by MakeBead (CC BY 4.0)</p>
  <script>setTimeout(function(){window.print()},400)<\/script>
  </body></html>`);
  w.document.close();
}

/* ================= 交互接线 ================= */
function queueRegen(){
  clearTimeout(state.regenTimer);
  if(!state.map){ updateSizeLabel(); return; }
  state.regenTimer=setTimeout(generate,300);
}
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600);
}
function saveSettings(){
  try{ localStorage.setItem('doutu.v1',JSON.stringify(currentParams())); }catch(e){}
}
function restoreSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('doutu.v1')||'null'); if(!s) return;
    if(s.w) $('gridSize').value=Math.max(10,Math.min(220,s.w));
    if(s.paletteId){ const opt=$('paletteSel').querySelector(`option[value="${s.paletteId}"]`); if(opt) $('paletteSel').value=s.paletteId; }
    if(s.maxColors!==undefined) $('maxColorsSel').value=String(s.maxColors);
    if(s.dither!==undefined) $('ditherSel').value=String(s.dither);
    if(s.border){ const bo=$('borderSel').querySelector(`option[value="${s.border}"]`); if(bo) $('borderSel').value=s.border; }
    $('enhanceChk').checked=s.enhance!==false;
    $('cutBgChk').checked=!!s.cutBg;
  }catch(e){}
}

function bindEvents(){
  const dz=$('dropZone'), fi=$('fileInput');
  dz.addEventListener('click',()=>fi.click());
  dz.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') fi.click(); });
  fi.addEventListener('change',()=>{ if(fi.files[0]) handleFile(fi.files[0]); fi.value=''; });
  ['dragover','dragenter'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('is-drag');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('is-drag');}));
  dz.addEventListener('drop',e=>{ const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) handleFile(f); });
  document.addEventListener('paste',e=>{
    const items=(e.clipboardData&&e.clipboardData.items)||[];
    const item=[...items].find(i=>i.type&&i.type.startsWith('image/'));
    if(item) handleFile(item.getAsFile());
  });
  $('btnDemo').addEventListener('click',e=>{ e.stopPropagation(); loadDemo(); });
  $('btnChangeImg').addEventListener('click',()=>fi.click());

  $('gridSize').addEventListener('input',()=>{
    [...$('sizeChips').children].forEach(c=>c.classList.toggle('is-on',c.dataset.w===$('gridSize').value));
    updateSizeLabel(); queueRegen();
  });
  $('sizeChips').addEventListener('click',e=>{
    const b=e.target.closest('.sizechip'); if(!b) return;
    [...$('sizeChips').children].forEach(c=>c.classList.toggle('is-on',c===b));
    $('gridSize').value=b.dataset.w; updateSizeLabel(); queueRegen();
  });
  ['maxColorsSel','ditherSel','borderSel'].forEach(id=>$(id).addEventListener('change',()=>{saveSettings();queueRegen();}));
  ['enhanceChk','cutBgChk'].forEach(id=>$(id).addEventListener('change',()=>{saveSettings();queueRegen();}));

  $('btnGenerate').addEventListener('click',()=>{ saveSettings(); generate(); });
  $('btnRedo').addEventListener('click',()=>$('settingsCard').scrollIntoView({behavior:'smooth'}));
  $('numToggle').addEventListener('change',()=>renderPreview($('numToggle').checked));

  $('btnPng').addEventListener('click',()=>download(exportCanvas(false),fname('','png')));
  $('btnPngNum').addEventListener('click',()=>download(exportCanvas(true),fname('-编号','png')));
  $('btnCsv').addEventListener('click',exportCSV);
  $('btnPrint').addEventListener('click',printView);

  let rz; window.addEventListener('resize',()=>{
    clearTimeout(rz);
    rz=setTimeout(()=>{ if(state.map) renderPreview($('numToggle').checked); },200);
  });
}

initPaletteSelect();
restoreSettings();
loadPalette();
updateSizeLabel();
bindEvents();
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
