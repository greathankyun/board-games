// 牌桌：玩家圍坐在桌邊，發言以對話框浮在頭像旁，紀錄照常保留。
// 用法：
//   const T = PTable.mount(el)           // el 是空容器
//   T.render(seatsHTML[], {center, me})  // seatsHTML[i] 是第 i 位的座位內容；me 是坐在正下方的人
//   T.say(i, text, cls)                  // 讓第 i 位冒出對話框
//   T.watch(logArray)                    // 每次 render 後呼叫：log 新增的「…」發言自動冒泡
(function(){
  const css=`
.ptable{position:relative;width:100%;aspect-ratio:16/10;min-height:380px;margin:4px 0 6px}
.ptable .felt{position:absolute;left:13%;right:13%;top:17%;bottom:17%;border-radius:50%;
  background:radial-gradient(ellipse at 50% 40%,#2F7A57 0%,#21603F 62%,#174A31 100%);
  box-shadow:0 0 0 10px #8A5A36,0 0 0 13px #6B4227,0 14px 30px rgba(40,25,10,.35),inset 0 6px 24px rgba(0,0,0,.35);
  display:flex;align-items:center;justify-content:center;text-align:center;color:#F3F7EF;padding:6% 10%}
.ptable .felt::before{content:"";position:absolute;inset:7%;border-radius:50%;border:1.5px dashed rgba(255,255,255,.18)}
.ptable .center{position:relative;font-weight:800;font-size:14px;line-height:1.5;max-width:100%}
.ptable .center b{display:block;font-size:20px;font-family:"Noto Serif TC",serif;letter-spacing:.06em}
.ptable .pseat{position:absolute;width:132px;transform:translate(-50%,-50%);z-index:2;transition:left .4s,top .4s}
.ptable .pseat>*{box-shadow:0 4px 12px rgba(60,40,20,.14)}
.ptable .pseat.talking>*{outline:3px solid var(--yellow,#F5C443);outline-offset:1px}
.ptable .bubbles{position:absolute;inset:0;pointer-events:none;z-index:5}
.ptable .bub{position:absolute;max-width:220px;width:max-content;background:#fff;color:#1F2B27;border:2px solid #1F2B27;
  border-radius:14px;padding:7px 11px;font-size:14px;font-weight:800;line-height:1.4;box-shadow:0 6px 16px rgba(30,20,10,.22);
  animation:bubIn .25s ease-out both}
.ptable .bub.k{background:#FFF1D2}
.ptable .bub.out{animation:bubOut .35s ease-in both}
.ptable .bub::after{content:"";position:absolute;width:12px;height:12px;background:inherit;border:inherit;border-top:0;border-left:0}
.ptable .bub.up{transform:translate(-50%,-100%)} .ptable .bub.up::after{left:calc(50% - 6px);bottom:-8px;transform:rotate(45deg)}
.ptable .bub.dn{transform:translate(-50%,0)} .ptable .bub.dn::after{left:calc(50% - 6px);top:-8px;transform:rotate(-135deg)}
@keyframes bubIn{from{opacity:0;margin-top:8px}to{opacity:1;margin-top:0}}
@keyframes bubOut{to{opacity:0;margin-top:-6px}}
@media (max-width:640px){
  .ptable{aspect-ratio:3/4.3;min-height:0}
  .ptable .felt{left:20%;right:20%;top:15%;bottom:15%;box-shadow:0 0 0 7px #8A5A36,0 0 0 9px #6B4227,0 10px 20px rgba(40,25,10,.3),inset 0 4px 16px rgba(0,0,0,.35)}
  .ptable .center{font-size:12px}.ptable .center b{font-size:16px}
  .ptable .pseat{width:86px}
  .ptable .bub{max-width:132px;font-size:12px;padding:5px 8px;border-radius:12px}
}
@media (prefers-reduced-motion:reduce){.ptable .bub,.ptable .bub.out{animation:none}}`;
  if(!document.getElementById('ptable-css')){const s=document.createElement('style');s.id='ptable-css';s.textContent=css;document.head.appendChild(s);}

  function mount(el){
    el.innerHTML='<div class="ptable"><div class="felt"><div class="center"></div></div><div class="seats"></div><div class="bubbles" aria-live="polite"></div></div>';
    const root=el.firstChild,seatsEl=root.querySelector('.seats'),bubEl=root.querySelector('.bubbles'),centerEl=root.querySelector('.center');
    let pos=[],seen=null;const live={};
    function layout(n,me){
      const mob=matchMedia('(max-width:640px)').matches;
      const rx=mob?38:41,ry=mob?41:39;pos=[];
      for(let i=0;i<n;i++){const k=((i-(me||0))%n+n)%n;const a=Math.PI/2+k*2*Math.PI/n;
        pos.push({x:50+rx*Math.cos(a),y:50+ry*Math.sin(a),s:Math.sin(a)});}
    }
    function render(seats,opt={}){
      layout(seats.length,opt.me);
      seatsEl.innerHTML=seats.map((h,i)=>`<div class="pseat${live[i]?' talking':''}" data-pseat="${i}" style="left:${pos[i].x}%;top:${pos[i].y}%">${h}</div>`).join('');
      if(opt.center!=null)centerEl.innerHTML=opt.center;
      Object.keys(live).forEach(i=>place(live[i].el,+i));
    }
    function place(b,i){
      const p=pos[i];if(!p)return;const seat=seatsEl.querySelector(`[data-pseat="${i}"]`);
      const h=seat?seat.offsetHeight:80,H=root.offsetHeight||1,W=root.offsetWidth||1;
      const up=p.s>-0.35; // 上排的人對話框往下冒，其餘往上冒
      const off=(h/2+10)/H*100;
      b.className=b.className.replace(/\b(up|dn)\b/g,'').trim()+' '+(up?'up':'dn');
      b.style.top=(p.y+(up?-off:off))+'%';
      const half=Math.min(b.offsetWidth||160,W)/2/W*100;
      b.style.left=Math.min(100-half-1,Math.max(half+1,p.x))+'%';
    }
    function say(i,text,cls=''){
      if(live[i]){clearTimeout(live[i].t);live[i].el.remove();}
      const b=document.createElement('div');b.className='bub '+cls;b.textContent=text;bubEl.appendChild(b);
      const seat=seatsEl.querySelector(`[data-pseat="${i}"]`);if(seat)seat.classList.add('talking');
      place(b,i);
      const ms=Math.min(6500,2600+text.length*90);
      live[i]={el:b,t:setTimeout(()=>{b.classList.add('out');const s=seatsEl.querySelector(`[data-pseat="${i}"]`);if(s)s.classList.remove('talking');
        setTimeout(()=>{b.remove();if(live[i]&&live[i].el===b)delete live[i];},350);},ms)};
    }
    function clear(){Object.keys(live).forEach(i=>{clearTimeout(live[i].t);live[i].el.remove();delete live[i];});seen=null;}
    // 從紀錄抓新發言：條目要有說話者 a，內容裡有「…」
    function watch(log){
      if(!log)return;
      if(!seen||(log.length>1&&!log.some(l=>seen.has(l)))){seen=new WeakSet();log.forEach(l=>seen.add(l));return;}
      const fresh=[];for(const l of log){if(seen.has(l))break;fresh.push(l);}
      fresh.reverse().forEach(l=>{seen.add(l);if(l.a==null)return;
        const tmp=document.createElement('div');tmp.innerHTML=l.h;const t=tmp.textContent;const m=/[：:]「([^」]+)」/.exec(t);
        if(m)say(l.a,m[1],l.c||'');});
      log.forEach(l=>seen.add(l));
    }
    addEventListener('resize',()=>{if(seatsEl.children.length){layout(seatsEl.children.length,curMe);[...seatsEl.children].forEach((s,i)=>{s.style.left=pos[i].x+'%';s.style.top=pos[i].y+'%';});Object.keys(live).forEach(i=>place(live[i].el,+i));}});
    let curMe=0;const r0=render;
    return {root,render:(s,o={})=>{curMe=o.me||0;r0(s,o);},say,watch,clear};
  }
  window.PTable={mount};
})();
