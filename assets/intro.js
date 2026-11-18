/* 遊戲群島：開局介紹頁。
   每款遊戲的 showSetup() 仍然用原本的 openModal() 畫出設定畫面（開頭是 .setup-art 主視覺）。
   這支檔案偵測到設定畫面後，把它改成一整頁的「介紹＋開局設定」：
   - 背景不透明，遊戲盤面不會在後面露出來；
   - 寬螢幕左右兩欄（左：封面、故事、特色；右：玩家設定與開始鈕），窄螢幕單欄；
   - 開局前的其他對話框（加入房間、線上房間等）也維持不透明背景，直到遊戲真正開始。
   版面樣式在 ui.css 的「開局介紹頁」段落。 */
(function(){
  const LEFT=el=>el.classList.contains('setup-art')||el.tagName==='H2'||el.classList.contains('sub')||el.classList.contains('pitch');
  const m=location.pathname.match(/\/games\/([^/]+)\//);
  let cover=null;
  if(m){
    cover=new Image();cover.className='intro-cover';cover.alt='';cover.decoding='async';
    cover.onload=()=>cover.classList.add('ok');cover.onerror=()=>{cover=null;};
    cover.src='../../covers/'+m[1]+'.webp';
  }
  function build(modal){
    const first=modal.firstElementChild;
    if(!first||!first.classList.contains('setup-art'))return false;
    const kids=[...modal.children];
    const top=document.createElement('div');top.className='intro-top';
    const l=document.createElement('div');l.className='intro-l';
    const r=document.createElement('div');r.className='intro-r';
    const h=document.createElement('h3');h.className='intro-h';h.textContent='開局設定';r.appendChild(h);
    let left=true;
    kids.forEach(k=>{if(left&&!LEFT(k))left=false;(left?l:r).appendChild(k);});
    const home=r.querySelector('.acts a.btn[href]');
    if(home){home.classList.add('intro-home');top.appendChild(home);}
    if(cover)l.querySelector('.setup-art').appendChild(cover);
    modal.append(top,l,r);
    return true;
  }
  function attach(){
    const ov=document.getElementById('overlay'),modal=document.getElementById('modal');
    if(!ov||!modal)return false;
    let busy=false;
    const sync=closed=>{
      const isSetup=!!modal.querySelector(':scope > .intro-l')||build(modal);
      ov.classList.toggle('intro',isSetup);
      if(isSetup)document.body.classList.add('pregame');
      else if(closed||ov.hidden)document.body.classList.remove('pregame');
    };
    const mo=new MutationObserver(recs=>{
      if(busy)return;
      const closed=recs.some(r=>r.type==='attributes'&&r.oldValue===null);
      busy=true;try{sync(closed);}finally{mo.takeRecords();busy=false;}
    });
    mo.observe(modal,{childList:true});
    mo.observe(ov,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
    sync(false);
    return true;
  }
  if(!attach())document.addEventListener('DOMContentLoaded',attach);
})();
