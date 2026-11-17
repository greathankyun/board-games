/* ================= 遊戲群島 online multiplayer (shared) =================
   Host-authoritative: the host's device runs the game engine and publishes a public snapshot with every
   hidden thing stripped out. Remote players push actions; the host validates and applies them.
   - Each remote player's private view is end-to-end encrypted (ECDH P-256 + AES-GCM) to that player only.
   - Actions are encrypted with the same per-player key, so nobody can send moves for someone else
     (knowing a player's id is not enough), and replayed actions are dropped.
   - Presence: every device writes a heartbeat; the host sees who dropped, a dropped player whose turn it is
     gets an AI stand-in after a grace period, and gets the seat back automatically when they return.
   - Clients see a banner when the host or their own connection drops.
   Transport: Firebase Realtime Database, or a same-browser BroadcastChannel transport for testing (?net=local).

   A game includes this file before its own script and supplies, as globals:
     S, GAME, LOBBY, setupCfg, SPEED, SPEEDS, timer, UI(optional)
     openModal, closeModal, esc, avatar, lsGet, lsSet, log, pn, showSetup, clearSave, render, $
   GAME = {id,name,hostKey,clientKey,min,max,aiNames,secretHint,
           start(cfg), strip(pub), secret(i), applySecret(seat,sec), waiting(), action(seat,a),
           afterTakeover(seats), afterReclaim?(seat), resumeUI(), clientReset(prev), clientModal()} */
const FIREBASE_CONFIG={"apiKey":"AIzaSyDX3vaUkNRwUVzY_0c_rcjlIz_cjlg_mmk","authDomain":"board-games-2c64d.firebaseapp.com","databaseURL":"https://board-games-2c64d-default-rtdb.asia-southeast1.firebasedatabase.app","projectId":"board-games-2c64d","storageBucket":"board-games-2c64d.firebasestorage.app","messagingSenderId":"1038938536228","appId":"1:1038938536228:web:931536e62f82f37fc91bb1"};
const rid=(n=12)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>'abcdefghijkmnpqrstuvwxyz23456789'[b%32]).join('');
const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const EC={name:'ECDH',namedCurve:'P-256'};
const Crypto={
  async gen(){const k=await crypto.subtle.generateKey(EC,true,['deriveKey']);return {priv:await crypto.subtle.exportKey('jwk',k.privateKey),pub:await crypto.subtle.exportKey('jwk',k.publicKey)};},
  async derive(privJwk,pubJwk){const priv=await crypto.subtle.importKey('jwk',privJwk,EC,false,['deriveKey']);const pub=await crypto.subtle.importKey('jwk',pubJwk,EC,false,[]);
    return crypto.subtle.deriveKey({name:'ECDH',public:pub},priv,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);},
  async enc(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(obj)));return b64(iv)+'.'+b64(new Uint8Array(ct));},
  async dec(key,s){const [iv,ct]=s.split('.');const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv)},key,unb64(ct));return JSON.parse(new TextDecoder().decode(pt));},
};
function LocalTx(){
  const bc=new BroadcastChannel('bg-net');const subs=[];
  const K=p=>'bgnet:'+p;
  const get=p=>{try{const v=localStorage.getItem(K(p));return v==null?null:JSON.parse(v);}catch(e){return null;}};
  const fire=m=>subs.slice().forEach(s=>{if(s.type==='v'&&s.path===m.path&&m.op==='set')s.cb(m.val);if(s.type==='a'&&m.op==='add'&&s.path===m.path&&!s.seen.has(m.key)){s.seen.add(m.key);s.cb(m.key,m.val);}});
  bc.onmessage=e=>fire(e.data);
  const send=m=>{fire(m);bc.postMessage(m);};
  return {
    set(p,v){localStorage.setItem(K(p),JSON.stringify(v));send({op:'set',path:p,val:v});},
    get(p){return Promise.resolve(get(p));},
    on(p,cb){const s={type:'v',path:p,cb};subs.push(s);const v=get(p);if(v!=null)setTimeout(()=>cb(v));return ()=>{const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);};},
    push(p,v){const key=Date.now().toString(36)+rid(4);const list=get(p+'/__list')||{};list[key]=v;localStorage.setItem(K(p+'/__list'),JSON.stringify(list));send({op:'add',path:p,key,val:v});},
    onAdd(p,cb){const s={type:'a',path:p,cb,seen:new Set()};subs.push(s);const list=get(p+'/__list')||{};setTimeout(()=>Object.keys(list).forEach(k=>{if(!s.seen.has(k)){s.seen.add(k);cb(k,list[k]);}}));return ()=>{const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);};},
    remove(p){const i=p.lastIndexOf('/');const base=p.slice(0,i),key=p.slice(i+1);const list=get(base+'/__list');if(list&&list[key]!==undefined){delete list[key];localStorage.setItem(K(base+'/__list'),JSON.stringify(list));}else{localStorage.removeItem(K(p));localStorage.removeItem(K(p+'/__list'));}},
    onDc(){},
    conn(){return ()=>{};},
  };
}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('load '+src));document.head.appendChild(s);});}
async function FirebaseTx(){
  if(!window.firebase){
    const bases=['https://www.gstatic.com/firebasejs/10.12.2/','https://cdn.jsdelivr.net/npm/firebase@10.12.2/'];
    let lastErr;
    for(const base of bases){try{await loadScript(base+'firebase-app-compat.js');await loadScript(base+'firebase-database-compat.js');lastErr=null;break;}catch(e){lastErr=e;}}
    if(lastErr)throw new Error('無法載入連線元件');
  }
  if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
  const db=firebase.database();
  return {
    set(p,v){return db.ref(p).set(v);},
    get(p){return Promise.race([db.ref(p).get().then(s=>s.val()),new Promise(ok=>setTimeout(()=>ok(null),2500))]).catch(()=>null);},
    on(p,cb){const r=db.ref(p);const f=s=>{const v=s.val();if(v!=null)cb(v);};r.on('value',f);return ()=>r.off('value',f);},
    push(p,v){return db.ref(p).push(v);},
    onAdd(p,cb){const r=db.ref(p);const f=s=>cb(s.key,s.val());r.on('child_added',f);return ()=>r.off('child_added',f);},
    remove(p){return db.ref(p).remove();},
    onDc(p,v){try{db.ref(p).onDisconnect().set(v);}catch(e){}},
    conn(cb){const r=db.ref('.info/connected');const f=s=>cb(!!s.val());r.on('value',f);return ()=>r.off('value',f);},
  };
}
function lsGet(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
function lsSet(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
const isRemote=i=>!!(S&&S.players[i]&&S.players[i].remote);
const localHumans=()=>S.players.filter(p=>!p.ai&&!p.remote);

/* ---------- presence banner (floating, independent of each game's layout) ---------- */
(function(){
  const css=`.netbanner{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;width:min(520px,calc(100vw - 24px));display:flex;flex-direction:column;gap:6px;pointer-events:none}
.netbanner>div{pointer-events:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#2B2622;color:#FFF8EC;border-radius:14px;padding:9px 14px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.25);line-height:1.4}
.netbanner>div.ok{background:#1F5C45}
.netbanner .t{flex:1;min-width:0}
.netbanner .dot{width:9px;height:9px;border-radius:50%;background:#E9643B;flex:none;animation:netpulse 1.2s infinite}
.netbanner>div.ok .dot{background:#7FD6A5;animation:none}
.netbanner button{margin-left:auto;border:0;border-radius:10px;background:#F4C542;color:#2B2622;font:inherit;font-weight:900;padding:6px 12px;cursor:pointer}
@keyframes netpulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.netbanner .t{flex:1;min-width:0}
.netbanner .dot{animation:none}}`;
  const add=()=>{if(document.getElementById('netbanner-css'))return;const st=document.createElement('style');st.id='netbanner-css';st.textContent=css;document.head.appendChild(st);};
  if(document.head)add();else document.addEventListener('DOMContentLoaded',add);
})();

const NET={
  role:null, code:null, seat:null, pid:null, tx:null, offs:[], ver:0, keys:{}, secret:null, secretRaw:null, aes:null, mkey:null, joins:[], hostKP:null, lastPub:null, nseats:0, lastSec:{},
  HB_MS:4000, DROP_MS:13000, AUTO_AI_MS:45000,
  seen:{}, lastN:{}, hbTimer:null, watchTimer:null, connected:true, hostSeen:0, offSince:{}, flash:null,
  get online(){return this.role==='host'||this.role==='client';},
  get client(){return this.role==='client';},
  get host(){return this.role==='host';},
  available(){return !!LOBBY&&typeof crypto!=='undefined'&&!!crypto.subtle&&typeof BroadcastChannel!=='undefined';},
  async ensureTx(){if(this.tx)return this.tx;this.tx=/[?&]net=local/.test(location.search)?LocalTx():await FirebaseTx();return this.tx;},
  off(){this.offs.forEach(f=>{try{f();}catch(e){}});this.offs=[];clearInterval(this.hbTimer);clearInterval(this.watchTimer);this.hbTimer=this.watchTimer=null;this.banner('');},
  leave(){
    if(this.role&&this.role!=='client'&&this.tx&&this.code){
      const c=this.code;
      try{this.tx.set(`rooms/${c}/meta`,JSON.stringify({status:'closed',game:GAME.id,t:Date.now()}));
        ['state','sec','joins','actions','hb'].forEach(k=>this.tx.remove(`rooms/${c}/${k}`));}catch(e){}
      lsSet(GAME.hostKey,null);
    }
    if(this.role==='client'){if(this.tx&&this.code&&this.pid)try{this.tx.set(`rooms/${this.code}/hb/${this.pid}`,'off');}catch(e){}lsSet(GAME.clientKey,null);}
    if(GAME.onLeave)try{GAME.onLeave();}catch(e){}
    this.off();Object.assign(this,{role:null,code:null,seat:null,pid:null,keys:{},secret:null,secretRaw:null,aes:null,mkey:null,joins:[],lastPub:null,lastSec:{},seen:{},lastN:{},offSince:{},hostSeen:0});
  },
  fail(err){console.error(err);openModal(`<h2>連線失敗</h2><p class="sub">${esc(err&&err.message||err)}。請確認網路後再試一次。</p><div class="acts"><button class="btn primary" data-m="ok">回到設定</button></div>`,()=>{this.leave();showSetup();});},
  setupBtns(){
    if(!this.available())return '';
    const c=lsGet(GAME.clientKey);
    return (c?`<button class="btn" data-m="net:rejoin">回到房間 ${esc(c.code)}</button>`:'')+'<button class="btn" data-m="net:join">加入房間</button><button class="btn" data-m="net:host">線上開房</button>';
  },
  setupHandle(m){
    if(m==='net:host'){this.hostLobby();return true;}
    if(m==='net:join'){this.joinPrompt();return true;}
    if(m==='net:rejoin'){this.rejoin();return true;}
    return false;
  },
  myName(){const inp=document.querySelector('[data-seat="0"]');let n=((inp?inp.value:setupCfg.seats[0].name)||'').trim();if(n==='你')n='';return n;},

  /* ---------- presence ---------- */
  startHeartbeat(id){
    const beat=()=>{if(this.tx&&this.code)try{this.tx.set(`rooms/${this.code}/hb/${id}`,{t:Date.now(),r:rid(3)});}catch(e){}};
    beat();clearInterval(this.hbTimer);this.hbTimer=setInterval(beat,this.HB_MS);
    this.tx.onDc(`rooms/${this.code}/hb/${id}`,'off');
    this.offs.push(this.tx.conn(ok=>{const was=this.connected;this.connected=ok;if(ok&&!was){beat();this.tx.onDc(`rooms/${this.code}/hb/${id}`,'off');if(this.client)this.resync();}this.paint();}));
    if(!this._vis){this._vis=true;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&this.online){const me=this.host?'host':this.pid;if(this.tx&&this.code)try{this.tx.set(`rooms/${this.code}/hb/${me}`,{t:Date.now(),r:rid(3)});}catch(e){}if(this.client)this.resync();}});}
  },
  watchPlayer(pid){
    if(this.seen[pid]!==undefined)return;this.seen[pid]=Date.now();
    this.offs.push(this.tx.on(`rooms/${this.code}/hb/${pid}`,v=>{
      if(v==='off'){this.seen[pid]=0;this.paint();return;}
      const wasOff=this.isOff(pid);this.seen[pid]=Date.now();
      if(wasOff)this.onBack(pid);
      this.paint();
    }));
  },
  isOff(pid){return !this.seen[pid]||Date.now()-this.seen[pid]>this.DROP_MS;},
  hostWatch(){
    S.players.forEach(p=>{if(p.pid)this.watchPlayer(p.pid);});
    clearInterval(this.watchTimer);
    this.watchTimer=setInterval(()=>this.hostTick(),1000);
  },
  hostTick(){
    if(!this.host||!S)return;
    const now=Date.now(),ws=S.phase==='end'?[]:GAME.waiting();
    S.players.forEach((p,i)=>{
      if(!p.pid)return;
      if(p.remote&&this.isOff(p.pid)){if(!this.offSince[p.pid])this.offSince[p.pid]=now;}
      else delete this.offSince[p.pid];
      // a dropped player we are waiting on gets an AI stand-in after the grace period
      if(p.remote&&ws.includes(i)&&this.offSince[p.pid]&&now-this.offSince[p.pid]>this.AUTO_AI_MS)this.takeover([i],true);
      // a stood-in player who came back gets their seat back between turns
      if(p.tookOver&&!this.isOff(p.pid)&&!ws.includes(i))this.reclaim(i);
    });
    this.paint();
  },
  onBack(pid){if(!this.host||!S)return;const i=S.players.findIndex(p=>p.pid===pid);if(i>=0&&!S.players[i].tookOver){this.flashMsg(`${S.players[i].name} 回來了`);}},
  reclaim(i){
    const p=S.players[i];if(!p||!p.tookOver)return;
    p.ai=false;p.remote=true;p.name=p.baseName||p.name.replace(/（AI 代打）$/,'');delete p.tookOver;delete p.baseName;
    if(S.cfgPlayers&&S.cfgPlayers[i])S.cfgPlayers[i]={name:p.name,ai:false,remote:true,pid:p.pid};
    try{log(`${pn(i)} 重新連線，拿回自己的座位`,'k');}catch(e){}
    this.flashMsg(`${p.name} 回來了，座位已還給他`);
    if(GAME.afterReclaim)GAME.afterReclaim(i);
    try{render();}catch(e){}
    this.publish();
  },
  flashMsg(t){this.flash={t,until:Date.now()+3500};this.paint();setTimeout(()=>this.paint(),3600);},
  banner(html){let el=document.getElementById('netbanner');if(!html){if(el)el.remove();return;}if(!el){el=document.createElement('div');el.id='netbanner';el.className='netbanner';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}if(el._h!==html){el._h=html;el.innerHTML=html;}},
  paint(){
    if(!this.online){this.banner('');return;}
    const rows=[],mmss=ms=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
    if(!this.connected)rows.push(`<div><span class="dot"></span><span class="t">你的網路中斷了，正在重新連線…</span></div>`);
    if(this.client&&this.connected&&this.hostSeen&&Date.now()-this.hostSeen>this.DROP_MS&&!(this.lastPub&&this.lastPub.phase==='end'))rows.push(`<div><span class="dot"></span><span class="t">房主連線中斷 ${mmss(Date.now()-this.hostSeen)}，等房主回來就能繼續</span></div>`);
    if(this.host&&S&&S.phase!=='end'){
      const ws=GAME.waiting(),now=Date.now();
      S.players.forEach((p,i)=>{if(!p.remote||!this.offSince[p.pid])return;const off=now-this.offSince[p.pid];
        const turn=ws.includes(i);const left=this.AUTO_AI_MS-off;
        rows.push(`<div><span class="dot"></span><span class="t">${esc(p.name)} 斷線 ${mmss(off)}${turn?`，${left>0?mmss(left)+' 後':'即將'}由 AI 代打`:''}</span>${turn?`<button data-net-take="${i}">現在改 AI</button>`:''}</div>`);});
    }
    if(this.flash&&Date.now()<this.flash.until)rows.push(`<div class="ok"><span class="dot"></span><span class="t">${esc(this.flash.t)}</span></div>`);
    this.banner(rows.join(''));
  },

  /* ---------- host ---------- */
  async freeCode(){
    for(let k=0;k<6;k++){
      const code=String(1000+Math.floor(Math.random()*9000));
      let busy=false;
      try{const m=await this.tx.get(`rooms/${code}/meta`);if(m){const meta=typeof m==='string'?JSON.parse(m):m;busy=meta.status!=='closed'&&Date.now()-(meta.t||0)<6*3600e3;}}catch(e){}
      if(!busy)return code;
    }
    return String(1000+Math.floor(Math.random()*9000));
  },
  async hostLobby(){
    const hostName=this.myName()||'房主';
    try{await this.ensureTx();}catch(e){return this.fail(e);}
    this.leave();
    this.role='lobby';this.code=await this.freeCode();this.joins=[];this.nseats=Math.max(GAME.min,Math.min(GAME.max,setupCfg.n));
    this.hostKP=await Crypto.gen();this.hostName=hostName;
    this.writeMeta('lobby');
    this.startHeartbeat('host');
    this.offs.push(this.tx.onAdd(`rooms/${this.code}/joins`,(k,v)=>{
      let j;try{j=JSON.parse(v);}catch(e){return;}
      if(this.role!=='lobby'||!j||!j.pid||!j.pub||this.joins.some(x=>x.pid===j.pid))return;
      if(this.joins.length>=GAME.max-1)return;
      j.name=String(j.name||'玩家').slice(0,10);
      // keep names unique so everyone can tell players apart
      const names=new Set([this.hostName,...this.joins.map(x=>x.name)]);let base=j.name,n=2;while(names.has(j.name))j.name=base.slice(0,8)+(n++);
      this.joins.push(j);
      if(this.nseats<this.joins.length+1)this.nseats=this.joins.length+1;
      this.writeMeta('lobby');this.lobbyModal();
    }));
    this.lobbyModal();
  },
  writeMeta(status){this.tx.set(`rooms/${this.code}/meta`,JSON.stringify({status,game:GAME.id,host:this.hostName,hostPub:this.hostKP&&this.hostKP.pub,players:[this.hostName,...this.joins.map(j=>j.name)],t:Date.now()}));},
  lobbyModal(){
    const n=this.nseats,min=Math.max(GAME.min,this.joins.length+1);
    const rows=[`<div class="seat">${avatar(0)}<b>${esc(this.hostName)}（你，房主）</b><span class="tag">已就位</span></div>`]
      .concat(this.joins.map((j,i)=>`<div class="seat">${avatar(i+1)}<b>${esc(j.name)}</b><span class="tag">已加入</span></div>`));
    for(let i=this.joins.length+1;i<n;i++)rows.push(`<div class="seat">${avatar(i)}<b style="color:var(--muted)">${GAME.aiNames[i%GAME.aiNames.length]}（AI 補位）</b><span class="tag">AI</span></div>`);
    const ks=[];for(let k=GAME.min;k<=GAME.max;k++)ks.push(k);
    const share=navigator.share?`<button class="btn" data-m="share">傳房號給朋友</button>`:'';
    openModal(`<h2>線上房間已開好</h2><p class="sub">請朋友打開桌遊大廳 →《${esc(GAME.name)}》→「加入房間」，輸入下面的房號。${GAME.secretHint||''}</p>
      <div class="roomcode num" aria-label="房號">${this.code.split('').map(d=>`<span>${d}</span>`).join('')}</div>
      <div class="field"><span>總人數（空位由 AI 補上）</span><div class="seg">${ks.map(k=>`<button data-m="ns:${k}" class="${k===n?'on':''}" ${k<min?'disabled':''}>${k} 人</button>`).join('')}</div></div>
      <div class="seats">${rows.join('')}</div>
      <p class="note">${this.joins.length?`已有 ${this.joins.length} 位朋友加入。`:'等待朋友加入中……也可以直接開始，跟 AI 玩。'}朋友中途斷線時，輪到他會先等 45 秒，再暫時由 AI 代打，他回來就自動還給他。</p>
      <div class="acts"><button class="btn" data-m="cancel">取消房間</button>${share}<button class="btn primary" data-m="go">開始遊戲（${n} 人）</button></div>`,
    m=>{if(m.startsWith('ns:')){this.nseats=+m.slice(3);this.lobbyModal();}
      else if(m==='share'){const url=location.href.split('?')[0].split('#')[0];navigator.share({title:GAME.name,text:`來玩《${GAME.name}》！打開後按「加入房間」，房號 ${this.code}`,url}).catch(()=>{});}
      else if(m==='cancel'){this.leave();showSetup();}else if(m==='go')this.startHosting();});
  },
  async startHosting(){
    closeModal();SPEED=SPEEDS[setupCfg.speed];
    const cfg=[{name:this.hostName,ai:false}];
    this.joins.forEach(j=>cfg.push({name:j.name,ai:false,remote:true,pid:j.pid}));
    const used=new Set(cfg.map(c=>c.name));
    for(let i=cfg.length;i<this.nseats;i++){let nm=GAME.aiNames[i%GAME.aiNames.length];if(used.has(nm))nm=GAME.aiNames.find(x=>!used.has(x))||nm+i;used.add(nm);cfg.push({name:nm,ai:true});}
    this.keys={};
    for(let i=1;i<=this.joins.length;i++){try{this.keys[i]=await Crypto.derive(this.hostKP.priv,this.joins[i-1].pub);}catch(e){console.error(e);}}
    this.role='host';this.lastSec={};this.writeMeta('playing');
    lsSet(GAME.hostKey,{code:this.code,hostKP:this.hostKP,joins:this.joins,hostName:this.hostName});
    this.listenActions();
    setupCfg.series={};
    GAME.start(cfg);
    this.hostWatch();
  },
  async resumeHost(sv){
    const h=lsGet(GAME.hostKey);if(!h||!sv.online||h.code!==sv.online.code)return false;
    try{await this.ensureTx();}catch(e){this.fail(e);return false;}
    this.off();
    Object.assign(this,{role:'host',code:h.code,hostKP:h.hostKP,joins:h.joins,hostName:h.hostName,lastSec:{},ver:Math.max(this.ver,sv.v||0),seen:{},offSince:{}});
    this.keys={};
    for(const [i,p] of sv.players.entries()){if(p.pid){const j=h.joins.find(x=>x.pid===p.pid);if(j)try{this.keys[i]=await Crypto.derive(h.hostKP.priv,j.pub);}catch(e){}}}
    this.writeMeta('playing');this.startHeartbeat('host');this.listenActions();
    setTimeout(()=>{if(this.host&&S)this.hostWatch();});
    return true;
  },
  listenActions(){
    this.offs.push(this.tx.onAdd(`rooms/${this.code}/actions`,async(k,v)=>{this.tx.remove(`rooms/${this.code}/actions/${k}`);let w;try{w=JSON.parse(v);}catch(e){return;}
      if(this.role!=='host'||!S||!w||!w.pid||!w.e)return;
      const seat=S.players.findIndex(p=>p.pid===w.pid);if(seat<0||!this.keys[seat])return;
      let a;try{a=await Crypto.dec(this.keys[seat],w.e);}catch(e){return;} // not signed by this player's key: ignore
      if(!a||typeof a._n!=='number'||a._n<=(this.lastN[seat]||0))return; // replay
      this.lastN[seat]=a._n;delete a._n;
      this.seen[w.pid]=Date.now();
      const p=S.players[seat];
      if(a.t==='__hello')return;
      if(!p.remote){if(p.tookOver)this.flashMsg(`${p.name.replace(/（AI 代打）$/,'')} 回來了，下一個空檔就把座位還給他`);return;}
      try{GAME.action(seat,a);}catch(e){console.error(e);}
    }));
  },
  takeover(seats,auto){ // host converts stalled remote players to AI (they get the seat back when they return)
    if(this.role!=='host'||!S)return;
    const ws=(seats||GAME.waiting()).filter(isRemote);if(!ws.length)return;
    ws.forEach(i=>{const p=S.players[i];p.baseName=p.name;p.tookOver=1;p.remote=false;p.ai=true;p.name=p.name+'（AI 代打）';delete this.offSince[p.pid];
      try{log(`${pn(i)} ${auto?'斷線超過 45 秒':'暫時離開'}，先由 AI 代打，回來會自動還給他`,'k');}catch(e){}});
    GAME.afterTakeover(ws);
    this.paint();
  },
  _pubQueued:false,
  publish(){
    if(this.role!=='host'||!S||this._pubQueued)return;
    this._pubQueued=true;
    setTimeout(()=>{this._pubQueued=false;if(this.role!=='host'||!S)return;
      const pub=JSON.parse(JSON.stringify(S));delete pub.viewer;delete pub.online;
      pub.series=setupCfg.series;
      GAME.strip(pub);
      pub.wait=GAME.waiting();
      pub.v=++this.ver;S.v=pub.v;
      const js=JSON.stringify(pub);
      // secrets first, so a client never sees a new public state without its matching private view
      this.pushSecrets().finally(()=>{if(this.role==='host')this.tx.set(`rooms/${this.code}/state`,js);});
    },0);
  },
  async pushSecrets(){
    for(const [i,p] of S.players.entries()){
      if(!p.pid||!this.keys[i])continue;
      const sec=GAME.secret(i);
      const js=JSON.stringify(sec);if(this.lastSec[i]===js)continue;this.lastSec[i]=js;
      try{const ct=await Crypto.enc(this.keys[i],sec);this.tx.set(`rooms/${this.code}/sec/${p.pid}`,ct);}catch(e){console.error(e);}
    }
  },
  barHTML(){
    if(!this.online||!S)return '';
    let take='';
    if(this.host&&S.phase!=='end'){const ws=GAME.waiting().filter(isRemote);if(ws.length)take=`<button class="passbtn" id="btnTakeover">${ws.map(i=>esc(S.players[i].name)).join('、')} 不在？改由 AI 代打</button>`;}
    return `${take}<div class="roombar"><span>線上房間</span><b class="num">${esc(this.code)}</b><span>${this.host?'你是房主':'你是 '+esc(S.players[this.seat]?S.players[this.seat].name:'')}</span><button class="linkbtn" id="btnLeaveRoom">離開房間</button></div>`;
  },
  waitHTML(){
    if(!this.online||!S)return '';
    const ws=GAME.waiting().filter(i=>i!==S.viewer&&!S.players[i].ai);
    return ws.length?`<div class="dnote">等待 ${ws.map(i=>esc(S.players[i].name)).join('、')} 做決定<span class="dots"></span></div>`:'';
  },
  confirmLeave(){
    openModal(`<h2>離開線上房間？</h2><p class="sub">${this.host?'你是房主，離開後房間會關閉，其他人也會被請出去。':'離開後這一局先由 AI 代打。之後用同一台裝置按「回到房間」可以拿回座位。'}</p><div class="acts"><button class="btn" data-m="no">留下來</button><button class="btn primary" data-m="yes">離開</button></div>`,
      m=>{if(m==='yes'){clearTimeout(timer);if(this.host){clearSave();this.leave();}else{const info=lsGet(GAME.clientKey);this.leave();if(info)lsSet(GAME.clientKey,info);}showSetup();}else{closeModal();if(this.client)this.resync();else GAME.resumeUI();}});
  },

  /* ---------- client ---------- */
  joinPrompt(){
    const nm=this.myName();
    openModal(`<h2>加入房間</h2><p class="sub">輸入房主畫面上的 4 位數房號。</p>
      <div class="field"><span>房號</span><input id="joinCode" class="codein num" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" placeholder="0000"></div>
      <div class="field"><span>你的名字</span><input id="joinName" class="codein" maxlength="10" value="${esc(nm)}" placeholder="例如：小明"></div>
      <p class="note" id="joinErr"></p>
      <div class="acts"><button class="btn" data-m="back">返回</button><button class="btn primary" data-m="join">加入</button></div>`,
    m=>{if(m==='back')return showSetup();const code=($('#joinCode').value||'').replace(/\D/g,''),name=($('#joinName').value||'').trim()||'玩家';
      if(!/^\d{4}$/.test(code)){$('#joinErr').textContent='房號是 4 位數字。';return;}
      this.joinRoom(code,name);});
    setTimeout(()=>{const i=$('#joinCode');if(i){i.focus();i.addEventListener('keydown',e=>{if(e.key==='Enter'){const b=document.querySelector('#overlay [data-m="join"]');b&&b.click();}});}});
  },
  async joinRoom(code,name){
    try{await this.ensureTx();}catch(e){return this.fail(e);}
    this.leave();
    // check the room before joining so a typo gets a clear answer instead of an endless wait
    let meta=null;try{const m=await this.tx.get(`rooms/${code}/meta`);meta=m&&(typeof m==='string'?JSON.parse(m):m);}catch(e){}
    if(meta&&meta.game&&meta.game!==GAME.id)return this.bye('房號不對',`這個房號是別款遊戲的房間，請確認房主開的是《${esc(GAME.name)}》。`);
    if(meta&&meta.status==='closed')return this.bye('房間已關閉','房主已經結束這個房間，請房主重新開房。');
    if(meta&&meta.status==='playing')return this.bye('遊戲已經開始','這個房間已經開打了。請房主開新房間，或者等下一局。');
    const kp=await Crypto.gen();
    const info={code,pid:rid(),name,kp,t:Date.now()};
    lsSet(GAME.clientKey,info);
    this.tx.push(`rooms/${code}/joins`,JSON.stringify({pid:info.pid,name,pub:kp.pub}));
    this.attachClient(info,!meta);
  },
  bye(t,s){this.leave();openModal(`<h2>${t}</h2><p class="sub">${s}</p><div class="acts"><button class="btn primary" data-m="ok">回到設定</button></div>`,()=>showSetup());},
  async rejoin(){const info=lsGet(GAME.clientKey);if(!info)return showSetup();try{await this.ensureTx();}catch(e){return this.fail(e);}this.attachClient(info);},
  attachClient(info,unknown){
    this.off();clearTimeout(timer);
    Object.assign(this,{role:'client',code:info.code,pid:info.pid,seat:null,secret:null,secretRaw:null,aes:null,mkey:null,lastPub:null,info,hostSeen:0});
    let meta=null;
    this.waitModal(null);
    if(unknown)setTimeout(()=>{if(this.client&&!meta&&this.code===info.code)this.bye('找不到房間',`沒有房號 ${esc(info.code)} 的房間。請再跟房主確認一次房號。`);},8000);
    this.startHeartbeat(info.pid);
    this.offs.push(this.tx.on(`rooms/${info.code}/hb/host`,v=>{if(v==='off')this.hostSeen=Date.now()-this.DROP_MS-1;else this.hostSeen=Date.now();this.paint();}));
    clearInterval(this.watchTimer);this.watchTimer=setInterval(()=>this.paint(),1000);
    this.offs.push(this.tx.on(`rooms/${info.code}/meta`,async v=>{
      try{meta=JSON.parse(v);}catch(e){return;}
      if(meta.game!==GAME.id)return this.bye('房號不對',`這個房號是別款遊戲的房間，請確認房主開的是《${esc(GAME.name)}》。`);
      if(meta.status==='closed')return this.bye('房間已關閉','房主結束了這個房間。');
      if(!this.aes&&meta.hostPub){try{this.aes=await Crypto.derive(info.kp.priv,meta.hostPub);this.trySecret();this.send({t:'__hello'});}catch(e){console.error(e);}}
      if(this.seat==null)this.waitModal(meta);
    }));
    this.offs.push(this.tx.on(`rooms/${info.code}/sec/${info.pid}`,v=>{this.secretRaw=v;this.trySecret();}));
    this.offs.push(this.tx.on(`rooms/${info.code}/state`,v=>{let pub;try{pub=JSON.parse(v);}catch(e){return;}
      if(this.lastPub&&pub.v<=this.lastPub.v&&pub.gid===this.lastPub.gid)return;
      const seat=pub.players.findIndex(p=>p.pid===info.pid);
      if(seat<0){if(this.seat!=null||pub.phase!=='idle')this.bye('來不及加入','這個房間的遊戲已經開始，沒有你的座位。');return;}
      const first=this.seat==null;this.seat=seat;this.lastPub=pub;this.hostSeen=Math.max(this.hostSeen,Date.now());if(first&&!$('#overlay').hidden)closeModal();this.sync();}));
  },
  async trySecret(){if(!this.aes||!this.secretRaw)return;const raw=this.secretRaw;try{const s=await Crypto.dec(this.aes,raw);if(raw!==this.secretRaw)return;this.secret=s;if(this.lastPub)this.sync();}catch(e){console.error(e);}},
  waitModal(meta){
    if(this.seat!=null)return;
    const list=meta&&meta.players?meta.players.map((n,i)=>`<div class="seat">${avatar(i)}<b>${esc(n)}</b><span class="tag">${i===0?'房主':'已加入'}</span></div>`).join(''):'<p class="note">連線中……</p>';
    openModal(`<h2>已加入房間 ${esc(this.code)}</h2><p class="sub">等房主按下開始。${GAME.secretHint||''}</p><div class="seats">${list}</div>
      <div class="acts"><button class="btn" data-m="leave">離開房間</button></div>`,()=>{this.leave();showSetup();});
  },
  sync(){
    if(!this.lastPub)return;
    const prev=S&&S.online&&S.online.client?S:null;
    S=JSON.parse(JSON.stringify(this.lastPub));S.online={code:this.code,client:true};S.viewer=this.seat;
    const sec=this.secret;
    if(sec)GAME.applySecret(this.seat,sec);
    S.secOK=!!sec;
    GAME.clientReset(prev);
    const m=GAME.clientModal();
    const key=m?m.key:null;
    if(key!==this.mkey){if(this.mopen&&!$('#overlay').hidden)closeModal();this.mkey=key;this.mopen=false;}
    render();
    if(m&&!this.mopen){this.mopen=true;m.open();}
    this.paint();
  },
  resync(){if(this.role==='client'&&this.lastPub){this.mkey=null;this.mopen=false;this.sync();}},
  _n:0,
  async send(a){
    if(this.role!=='client')return;
    if(!this.aes){this.flashMsg('還在連線，請再按一次');return;}
    const n=Date.now()*1000+(this._n=(this._n+1)%1000);
    const e=await Crypto.enc(this.aes,{...a,_n:n});
    this.tx.push(`rooms/${this.code}/actions`,JSON.stringify({pid:this.pid,e}));
  },
};
document.addEventListener('click',e=>{
  if(e.target.closest('#btnTakeover')){NET.takeover();return;}
  if(e.target.closest('#btnLeaveRoom')){NET.confirmLeave();return;}
  const t=e.target.closest('[data-net-take]');if(t){NET.takeover([+t.dataset.netTake]);return;}
});
