var no=Object.create;var Gi=Object.defineProperty;var Rr=Object.getOwnPropertyDescriptor;var oo=Object.getOwnPropertyNames;var ao=Object.getPrototypeOf,lo=Object.prototype.hasOwnProperty;var _i=(c,i)=>()=>(c&&(i=c(c=0)),i);var co=(c,i)=>()=>(i||c((i={exports:{}}).exports,i),i.exports),Dr=(c,i)=>{for(var e in i)Gi(c,e,{get:i[e],enumerable:!0})},ho=(c,i,e,t)=>{if(i&&typeof i=="object"||typeof i=="function")for(let s of oo(i))!lo.call(c,s)&&s!==e&&Gi(c,s,{get:()=>i[s],enumerable:!(t=Rr(i,s))||t.enumerable});return c};var uo=(c,i,e)=>(e=c!=null?no(ao(c)):{},ho(i||!c||!c.__esModule?Gi(e,"default",{value:c,enumerable:!0}):e,c));var d=(c,i,e,t)=>{for(var s=t>1?void 0:t?Rr(i,e):i,n=c.length-1,o;n>=0;n--)(o=c[n])&&(s=(t?o(i,e,s):o(s))||s);return t&&s&&Gi(i,e,s),s};var we=_i(()=>{});var me,Qi,Yi,Hr=_i(()=>{globalThis.crypto?.subtle&&(me=globalThis.crypto.subtle);Qi=class Qi{constructor(i){this.keys=new Map;this.cryptoErrorShown=!1;this.storageKey=i||Qi.DEFAULT_STORAGE_KEY,this.loadKeysFromStorage()}ensureCryptoAvailable(){if(!me)throw this.cryptoErrorShown||(this.showCryptoError(),this.cryptoErrorShown=!0),new Error("Web Crypto API is not available")}showCryptoError(){if(!document.body){console.error("Web Crypto API not available and DOM not ready to show error");return}let i=window.location.hostname,e=i.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/),t=i!=="localhost"&&i!=="127.0.0.1",s=`SSH key operations are unavailable because the Web Crypto API is not accessible.

`;if(e||t&&window.location.protocol==="http:"?(e&&window.location.protocol==="https:"?s+=`Even though you're using HTTPS, browsers block the Web Crypto API on local network IPs.

`:s+=`This happens when accessing VibeTunnel over HTTP from non-localhost addresses.

`,s+=`To fix this, use one of these methods:
`,s+=`1. Access via http://localhost:4020 instead
`,s+=`   - Use SSH tunnel: ssh -L 4020:localhost:4020 user@server
`,s+=`2. Enable HTTPS on the server (recommended for production)
`,s+=`3. For Chrome: Enable insecure origins at chrome://flags/#unsafely-treat-insecure-origin-as-secure
`,s+=`   - Add your server URL (e.g., http://192.168.1.100:4020)
`,s+=`   - Restart Chrome after changing the flag
`,s+="   - Note: Firefox also enforces these restrictions since v75"):(s+=`Your browser may not support the Web Crypto API or it may be disabled.
`,s+="Please use a modern browser (Chrome 60+, Firefox 75+, Safari 11+)."),!document.querySelector("#crypto-error-style")){let n=document.createElement("style");n.id="crypto-error-style",n.textContent=`
        .crypto-error-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: #dc2626;
          color: white;
          padding: 16px;
          z-index: 9999;
          font-family: monospace;
          white-space: pre-wrap;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
      `,document.head.appendChild(n)}if(!document.querySelector(".crypto-error-banner")){let n=document.createElement("div");n.className="crypto-error-banner",n.textContent=s,document.body.appendChild(n)}}isUnlocked(){return!0}async addKey(i,e){if(this.ensureCryptoAvailable(),!me)throw new Error("Crypto not available");try{let t=await this.parsePrivateKey(e),s=this.generateKeyId(),n={id:s,name:i,publicKey:t.publicKey,privateKey:e,algorithm:"Ed25519",encrypted:t.encrypted,fingerprint:t.fingerprint,createdAt:new Date().toISOString()};return this.keys.set(s,n),this.saveKeysToStorage(),s}catch(t){throw new Error(`Failed to add SSH key: ${t}`)}}removeKey(i){this.keys.delete(i),this.saveKeysToStorage()}listKeys(){return Array.from(this.keys.values()).map(i=>({id:i.id,name:i.name,publicKey:i.publicKey,algorithm:i.algorithm,encrypted:i.encrypted,fingerprint:i.fingerprint,createdAt:i.createdAt}))}async sign(i,e){if(this.ensureCryptoAvailable(),!me)throw new Error("Crypto not available");let t=this.keys.get(i);if(!t)throw new Error("SSH key not found");if(!t.privateKey)throw new Error("Private key not available for signing");try{let s=t.privateKey;if(t.encrypted){let a=await this.promptForPassword(t.name);if(!a)throw new Error("Password required for encrypted key");s=await this.decryptPrivateKey(t.privateKey,a)}let n=await this.importPrivateKey(s,t.algorithm),o=this.base64ToArrayBuffer(e),r=await me.sign({name:"Ed25519"},n,o);return{signature:this.arrayBufferToBase64(r),algorithm:t.algorithm}}catch(s){throw new Error(`Failed to sign data: ${s}`)}}async generateKeyPair(i,e){if(this.ensureCryptoAvailable(),!me)throw new Error("Crypto not available");console.log(`\u{1F511} SSH Agent: Starting Ed25519 key generation for "${i}"`);try{let s=await me.generateKey({name:"Ed25519"},!0,["sign","verify"]),n=await me.exportKey("pkcs8",s.privateKey),o=await me.exportKey("raw",s.publicKey),r=this.arrayBufferToPEM(n,"PRIVATE KEY"),a=this.convertEd25519ToSSHPublicKey(o),m=!!e;e&&(r=await this.encryptPrivateKey(r,e));let p=this.generateKeyId(),h={id:p,name:i,publicKey:a,privateKey:r,algorithm:"Ed25519",encrypted:m,fingerprint:await this.generateFingerprint(a),createdAt:new Date().toISOString()};return this.keys.set(p,h),await this.saveKeysToStorage(),console.log(`\u{1F511} SSH Agent: Key "${i}" generated successfully with ID: ${p}`),{keyId:p,privateKeyPEM:r}}catch(t){throw new Error(`Failed to generate key pair: ${t}`)}}getPublicKey(i){let e=this.keys.get(i);return e?e.publicKey:null}getPrivateKey(i){let e=this.keys.get(i);return e?e.privateKey:null}async parsePrivateKey(i){let e=i.includes("BEGIN ENCRYPTED PRIVATE KEY")||i.includes("Proc-Type: 4,ENCRYPTED");if(i.includes("BEGIN PRIVATE KEY")||i.includes("BEGIN ENCRYPTED PRIVATE KEY")){let t="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIImported...";return{publicKey:t,algorithm:"Ed25519",fingerprint:await this.generateFingerprint(t),encrypted:e}}throw new Error("Only Ed25519 private keys are supported")}async importPrivateKey(i,e){if(!me)throw new Error("Crypto not available");let t=i.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s/g,""),s=this.base64ToArrayBuffer(t);return me.importKey("pkcs8",s,{name:"Ed25519"},!1,["sign"])}convertEd25519ToSSHPublicKey(i){let e=new Uint8Array(i),s=new TextEncoder().encode("ssh-ed25519"),n=new ArrayBuffer(4+s.length+4+e.length),o=new DataView(n),r=new Uint8Array(n),a=0;return o.setUint32(a,s.length,!1),a+=4,r.set(s,a),a+=s.length,o.setUint32(a,e.length,!1),a+=4,r.set(e,a),`ssh-ed25519 ${this.arrayBufferToBase64(n)}`}async generateFingerprint(i){if(!me)throw new Error("Crypto not available");let e=new TextEncoder,t=await me.digest("SHA-256",e.encode(i));return this.arrayBufferToBase64(t).substring(0,16)}generateKeyId(){return window.crypto.randomUUID()}arrayBufferToBase64(i){let e=new Uint8Array(i),t="";for(let s=0;s<e.length;s++)t+=String.fromCharCode(e[s]);return btoa(t)}base64ToArrayBuffer(i){let e=atob(i),t=new Uint8Array(e.length);for(let s=0;s<e.length;s++)t[s]=e.charCodeAt(s);return t.buffer}arrayBufferToPEM(i,e){let s=this.arrayBufferToBase64(i).match(/.{1,64}/g)||[];return`-----BEGIN ${e}-----
${s.join(`
`)}
-----END ${e}-----`}async loadKeysFromStorage(){try{let i=localStorage.getItem(this.storageKey);if(i){let e=JSON.parse(i);this.keys.clear(),e.forEach(t=>this.keys.set(t.id,t))}}catch(i){console.error("Failed to load SSH keys from storage:",i)}}async saveKeysToStorage(){try{let i=Array.from(this.keys.values());localStorage.setItem(this.storageKey,JSON.stringify(i))}catch(i){console.error("Failed to save SSH keys to storage:",i)}}async encryptPrivateKey(i,e){if(!me)throw new Error("Crypto not available");let t=new TextEncoder,s=t.encode(i),n=await me.importKey("raw",t.encode(e),{name:"PBKDF2"},!1,["deriveKey"]),o=crypto.getRandomValues(new Uint8Array(16)),r=await me.deriveKey({name:"PBKDF2",salt:o,iterations:1e5,hash:"SHA-256"},n,{name:"AES-GCM",length:256},!1,["encrypt"]),a=crypto.getRandomValues(new Uint8Array(12)),m=await me.encrypt({name:"AES-GCM",iv:a},r,s),p=new Uint8Array(o.length+a.length+m.byteLength);return p.set(o,0),p.set(a,o.length),p.set(new Uint8Array(m),o.length+a.length),`-----BEGIN ENCRYPTED PRIVATE KEY-----
${this.arrayBufferToBase64(p.buffer)}
-----END ENCRYPTED PRIVATE KEY-----`}async decryptPrivateKey(i,e){if(!me)throw new Error("Crypto not available");let t=i.replace("-----BEGIN ENCRYPTED PRIVATE KEY-----","").replace("-----END ENCRYPTED PRIVATE KEY-----","").replace(/\s/g,""),s=this.base64ToArrayBuffer(t),n=new Uint8Array(s),o=n.slice(0,16),r=n.slice(16,28),a=n.slice(28),m=new TextEncoder,p=await me.importKey("raw",m.encode(e),{name:"PBKDF2"},!1,["deriveKey"]),h=await me.deriveKey({name:"PBKDF2",salt:o,iterations:1e5,hash:"SHA-256"},p,{name:"AES-GCM",length:256},!1,["decrypt"]),v=await me.decrypt({name:"AES-GCM",iv:r},h,a);return new TextDecoder().decode(v)}async promptForPassword(i){return window.prompt(`Enter password for SSH key "${i}":`)}};Qi.DEFAULT_STORAGE_KEY="vibetunnel_ssh_keys";Yi=Qi});var Fr={};Dr(Fr,{AuthClient:()=>Xi,authClient:()=>N});var xe,nt,Xi,N,Me=_i(()=>{we();q();Hr();xe=P("auth-client"),nt=class nt{constructor(){this.currentUser=null;this.sshAgent=new Yi,this.loadCurrentUser()}getSSHAgent(){return this.sshAgent}isAuthenticated(){return this.currentUser!==null&&this.isTokenValid()}getCurrentUser(){return this.currentUser}async getCurrentSystemUser(){try{let i=await fetch("/api/auth/current-user");if(i.ok)return(await i.json()).userId;throw new Error("Failed to get current user")}catch(i){throw xe.error("Failed to get current system user:",i),i}}async getUserAvatar(i){try{let r=await fetch(`/api/auth/avatar/${i}`);if(r.ok){let a=await r.json();if(a.avatar&&a.avatar.startsWith("data:"))return a.avatar}}catch(r){xe.error("Failed to get user avatar:",r)}let e=getComputedStyle(document.documentElement),t=e.getPropertyValue("--color-text-dim").trim().split(" ").map(r=>Number.parseInt(r)),s=e.getPropertyValue("--color-text-muted").trim().split(" ").map(r=>Number.parseInt(r)),n=`rgb(${t.join(", ")})`,o=`rgb(${s.join(", ")})`;return"data:image/svg+xml;base64,"+btoa(`
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="${n}"/>
        <circle cx="24" cy="18" r="8" fill="${o}"/>
        <path d="M8 38c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="${o}"/>
      </svg>
    `)}async authenticateWithSSHKey(i,e){try{if(!this.sshAgent.isUnlocked())return{success:!1,error:"SSH agent is locked"};let t=await this.createChallenge(i),s=await this.sshAgent.sign(e,t.challenge),n=this.sshAgent.getPublicKey(e);if(!n)return{success:!1,error:"SSH key not found"};let r=await(await fetch("/api/auth/ssh-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({challengeId:t.challengeId,publicKey:n,signature:s.signature})})).json();return xe.log("\u{1F510} SSH key auth server response:",r),r.success?(xe.log("\u2705 SSH key auth successful, setting current user"),this.setCurrentUser({userId:r.userId,token:r.token,authMethod:"ssh-key",loginTime:Date.now()}),xe.log("\u{1F464} Current user set:",this.getCurrentUser())):xe.log("\u274C SSH key auth failed:",r.error),r}catch(t){return xe.error("SSH key authentication failed:",t),{success:!1,error:"SSH key authentication failed"}}}async authenticateWithPassword(i,e){try{let s=await(await fetch("/api/auth/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:i,password:e})})).json();return s.success&&this.setCurrentUser({userId:s.userId,token:s.token,authMethod:"password",loginTime:Date.now()}),s}catch(t){return xe.error("Password authentication failed:",t),{success:!1,error:"Password authentication failed"}}}async authenticate(i){if(xe.log("\u{1F680} Starting SSH authentication for user:",i),this.sshAgent.isUnlocked()){let e=this.sshAgent.listKeys();xe.log("\u{1F5DD}\uFE0F Found SSH keys:",e.length,e.map(t=>({id:t.id,name:t.name})));for(let t of e)try{xe.log(`\u{1F511} Trying SSH key: ${t.name} (${t.id})`);let s=await this.authenticateWithSSHKey(i,t.id);if(xe.log(`\u{1F3AF} SSH key ${t.name} result:`,s),s.success)return xe.log(`\u2705 Authenticated with SSH key: ${t.name}`),s}catch(s){xe.warn(`\u274C SSH key authentication failed for key ${t.name}:`,s)}}else xe.log("\u{1F512} SSH agent is locked");return{success:!1,error:"SSH key authentication failed. Password authentication required."}}async logout(){try{this.currentUser?.token&&await fetch("/api/auth/logout",{method:"POST",headers:{Authorization:`Bearer ${this.currentUser.token}`,"Content-Type":"application/json"}})}catch(i){xe.warn("Server logout failed:",i)}finally{this.clearCurrentUser()}}getAuthHeader(){return this.currentUser?.token?{Authorization:`Bearer ${this.currentUser.token}`}:{}}async fetch(i,e){let t={...this.getAuthHeader(),...e?.headers||{}};return fetch(i,{...e,headers:t})}async verifyToken(){if(!this.currentUser?.token)return!1;try{return(await(await fetch("/api/auth/verify",{headers:{Authorization:`Bearer ${this.currentUser.token}`}})).json()).valid}catch(i){return xe.error("Token verification failed:",i),!1}}async unlockSSHAgent(i){return!0}lockSSHAgent(){}isSSHAgentUnlocked(){return!0}async createChallenge(i){let e=await fetch("/api/auth/challenge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:i})});if(!e.ok)throw new Error("Failed to create authentication challenge");return e.json()}setCurrentUser(i){this.currentUser=i,this.saveCurrentUser()}setNoAuthUser(i){this.setCurrentUser({userId:i,token:"no-auth-token",authMethod:"password",loginTime:Date.now()}),xe.log("\u{1F464} No-auth user set:",this.getCurrentUser())}clearCurrentUser(){this.currentUser=null,localStorage.removeItem(nt.TOKEN_KEY),localStorage.removeItem(nt.USER_KEY)}saveCurrentUser(){this.currentUser&&(localStorage.setItem(nt.TOKEN_KEY,this.currentUser.token),localStorage.setItem(nt.USER_KEY,JSON.stringify({userId:this.currentUser.userId,authMethod:this.currentUser.authMethod,loginTime:this.currentUser.loginTime})))}loadCurrentUser(){try{let i=localStorage.getItem(nt.TOKEN_KEY),e=localStorage.getItem(nt.USER_KEY);if(i&&e){let t=JSON.parse(e);this.currentUser={token:i,userId:t.userId,authMethod:t.authMethod,loginTime:t.loginTime},this.verifyToken().then(s=>{s||this.clearCurrentUser()})}}catch(i){xe.error("Failed to load current user:",i),this.clearCurrentUser()}}isTokenValid(){if(!this.currentUser)return!1;let i=Date.now()-this.currentUser.loginTime,e=1440*60*1e3;return i<e}};nt.TOKEN_KEY="vibetunnel_auth_token",nt.USER_KEY="vibetunnel_user_data";Xi=nt,N=new Xi});async function fo(){let c=Date.now();if(Ei&&c-Ei.timestamp<mo)return Ei.noAuth;try{let i=await fetch("/api/auth/config");if(i.ok)return Ei={noAuth:(await i.json()).noAuth===!0,timestamp:c},Ei.noAuth}catch{}return!1}function go(c){return c.map(i=>{if(typeof i=="object"&&i!==null)try{return JSON.stringify(i,null,2)}catch{return String(i)}return i})}async function vo(c,i,e){try{let{authClient:t}=await Promise.resolve().then(()=>(Me(),Fr)),s=t.getAuthHeader(),n=await fo();if(!s.Authorization&&!n)return;let o={"Content-Type":"application/json"};s.Authorization&&(o.Authorization=s.Authorization),await fetch("/api/logs/client",{method:"POST",headers:o,body:JSON.stringify({level:c,module:i,args:go(e)})})}catch{}}function P(c){let i=e=>(...t)=>{e==="debug"&&!po||(console[e](`[${c}]`,...t),vo(e,c,t))};return{log:i("log"),warn:i("warn"),error:i("error"),debug:i("debug")}}var po,Ei,mo,q=_i(()=>{we();po=!1,Ei=null,mo=6e4});var zn={};Dr(zn,{TerminalRenderer:()=>Ts,decodeBinaryBuffer:()=>On,renderLineFromBuffer:()=>Hn,renderLineFromCells:()=>Fn});function Dn(c){return c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Hn(c,i,e=-1){let t="",s="",n="",o="",r=()=>{if(s){let a=Dn(s);t+=`<span class="${n}"${o?` style="${o}"`:""}>${a}</span>`,s=""}};for(let a=0;a<c.length;a++){if(c.getCell(a,i),!i)continue;let m=i.getChars()||" ";if(i.getWidth()===0)continue;let{classes:h,style:v}=jo(i,a===e);(h!==n||v!==o)&&(r(),n=h,o=v),s+=m}return r(),t}function Fn(c,i=-1){let e="",t="",s="",n="",o=()=>{if(t){let a=Dn(t);e+=`<span class="${s}"${n?` style="${n}"`:""}>${a}</span>`,t=""}},r=0;for(let a of c){if(a.width===0)continue;let{classes:m,style:p}=Go(a,r===i);(m!==s||p!==n)&&(o(),s=m,n=p),t+=a.char,r+=a.width}return o(),e||(e='<span class="terminal-char">&nbsp;</span>'),e}function jo(c,i){let e="terminal-char",t="";i&&(e+=" cursor");let s=c.getFgColor();if(s!==void 0){if(typeof s=="number"&&s>=0&&s<=255)t+=`color: var(--terminal-color-${s});`;else if(typeof s=="number"&&s>255){let o=s>>16&255,r=s>>8&255,a=s&255;t+=`color: rgb(${o}, ${r}, ${a});`}}let n=c.getBgColor();if(n!==void 0){if(typeof n=="number"&&n>=0&&n<=255)t+=`background-color: var(--terminal-color-${n});`;else if(typeof n=="number"&&n>255){let o=n>>16&255,r=n>>8&255,a=n&255;t+=`background-color: rgb(${o}, ${r}, ${a});`}}if(c.isBold()&&(e+=" bold"),c.isItalic()&&(e+=" italic"),c.isUnderline()&&(e+=" underline"),c.isDim()&&(e+=" dim"),c.isStrikethrough()&&(e+=" strikethrough"),c.isInverse()){let o=t.match(/color: ([^;]+);/)?.[1],r=t.match(/background-color: ([^;]+);/)?.[1];o&&r?(t=t.replace(/color: [^;]+;/,`color: ${r};`),t=t.replace(/background-color: [^;]+;/,`background-color: ${o};`)):o?(t=t.replace(/color: [^;]+;/,"color: #1e1e1e;"),t+=`background-color: ${o};`):t+="color: #1e1e1e; background-color: #d4d4d4;"}return c.isInvisible()&&(t+="opacity: 0;"),{classes:e,style:t}}function Go(c,i){let e="terminal-char",t="";if(i&&(e+=" cursor"),c.fg!==void 0)if(c.fg>=0&&c.fg<=255)t+=`color: var(--terminal-color-${c.fg});`;else{let n=c.fg>>16&255,o=c.fg>>8&255,r=c.fg&255;t+=`color: rgb(${n}, ${o}, ${r});`}else t+="color: #d4d4d4;";if(c.bg!==void 0)if(c.bg>=0&&c.bg<=255)t+=`background-color: var(--terminal-color-${c.bg});`;else{let n=c.bg>>16&255,o=c.bg>>8&255,r=c.bg&255;t+=`background-color: rgb(${n}, ${o}, ${r});`}let s=c.attributes||0;if(s&1&&(e+=" bold"),s&2&&(e+=" italic"),s&4&&(e+=" underline"),s&8&&(e+=" dim"),s&64&&(e+=" strikethrough"),s&16){let n=t.match(/color: ([^;]+);/)?.[1],o=t.match(/background-color: ([^;]+);/)?.[1];n&&o?(t=t.replace(/color: [^;]+;/,`color: ${o};`),t=t.replace(/background-color: [^;]+;/,`background-color: ${n};`)):n?(t=t.replace(/color: [^;]+;/,"color: #1e1e1e;"),t+=`background-color: ${n};`):t+="color: #1e1e1e; background-color: #d4d4d4;"}return s&32&&(t+="opacity: 0;"),{classes:e,style:t}}function On(c){let i=new DataView(c),e=0,t=i.getUint16(e,!0);if(e+=2,t!==22100)throw new Error("Invalid buffer format");let s=i.getUint8(e++);if(s!==1)throw new Error(`Unsupported buffer version: ${s}`);let n=i.getUint8(e++),o=i.getUint32(e,!0);e+=4;let r=i.getUint32(e,!0);e+=4;let a=i.getInt32(e,!0);e+=4;let m=i.getInt32(e,!0);e+=4;let p=i.getInt32(e,!0);e+=4,e+=4;let h=[],v=new Uint8Array(c);for(;e<v.length;){let f=v[e++];if(f===254){let w=v[e++];for(let x=0;x<w;x++)h.push([{char:" ",width:1}])}else if(f===253){let w=i.getUint16(e,!0);e+=2;let x=[];for(let l=0;l<w;l++){let g=Yo(v,e);e=g.offset,x.push(g.cell)}h.push(x)}}return{cols:o,rows:r,viewportY:a,cursorX:m,cursorY:p,cells:h}}function Yo(c,i){let e=c[i++],t=!!(e&128),s=!!(e&64),n=!!(e&32),o=!!(e&16),r=!!(e&8),a=!!(e&4),m=e&3;if(e===0)return{cell:{char:" ",width:1},offset:i};let p;if(m===0)p=" ";else if(s){let v=c[i++],f=c.slice(i,i+v);p=new TextDecoder().decode(f),i+=v}else p=String.fromCharCode(c[i++]);let h={char:p,width:1};if(t){let v=c[i++];v!==0&&(h.attributes=v),n&&(r?(h.fg=c[i]<<16|c[i+1]<<8|c[i+2],i+=3):h.fg=c[i++]),o&&(a?(h.bg=c[i]<<16|c[i+1]<<8|c[i+2],i+=3):h.bg=c[i++])}return{cell:h,offset:i}}var Ts,wr=_i(()=>{Ts={renderLineFromBuffer:Hn,renderLineFromCells:Fn,decodeBinaryBuffer:On}});var Yn=co(Gn=>{(()=>{"use strict";var c={349:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.CircularList=void 0;let m=a(460),p=a(844);class h extends p.Disposable{constructor(f){super(),this._maxLength=f,this.onDeleteEmitter=this.register(new m.EventEmitter),this.onDelete=this.onDeleteEmitter.event,this.onInsertEmitter=this.register(new m.EventEmitter),this.onInsert=this.onInsertEmitter.event,this.onTrimEmitter=this.register(new m.EventEmitter),this.onTrim=this.onTrimEmitter.event,this._array=new Array(this._maxLength),this._startIndex=0,this._length=0}get maxLength(){return this._maxLength}set maxLength(f){if(this._maxLength===f)return;let w=new Array(f);for(let x=0;x<Math.min(f,this.length);x++)w[x]=this._array[this._getCyclicIndex(x)];this._array=w,this._maxLength=f,this._startIndex=0}get length(){return this._length}set length(f){if(f>this._length)for(let w=this._length;w<f;w++)this._array[w]=void 0;this._length=f}get(f){return this._array[this._getCyclicIndex(f)]}set(f,w){this._array[this._getCyclicIndex(f)]=w}push(f){this._array[this._getCyclicIndex(this._length)]=f,this._length===this._maxLength?(this._startIndex=++this._startIndex%this._maxLength,this.onTrimEmitter.fire(1)):this._length++}recycle(){if(this._length!==this._maxLength)throw new Error("Can only recycle when the buffer is full");return this._startIndex=++this._startIndex%this._maxLength,this.onTrimEmitter.fire(1),this._array[this._getCyclicIndex(this._length-1)]}get isFull(){return this._length===this._maxLength}pop(){return this._array[this._getCyclicIndex(this._length---1)]}splice(f,w,...x){if(w){for(let l=f;l<this._length-w;l++)this._array[this._getCyclicIndex(l)]=this._array[this._getCyclicIndex(l+w)];this._length-=w,this.onDeleteEmitter.fire({index:f,amount:w})}for(let l=this._length-1;l>=f;l--)this._array[this._getCyclicIndex(l+x.length)]=this._array[this._getCyclicIndex(l)];for(let l=0;l<x.length;l++)this._array[this._getCyclicIndex(f+l)]=x[l];if(x.length&&this.onInsertEmitter.fire({index:f,amount:x.length}),this._length+x.length>this._maxLength){let l=this._length+x.length-this._maxLength;this._startIndex+=l,this._length=this._maxLength,this.onTrimEmitter.fire(l)}else this._length+=x.length}trimStart(f){f>this._length&&(f=this._length),this._startIndex+=f,this._length-=f,this.onTrimEmitter.fire(f)}shiftElements(f,w,x){if(!(w<=0)){if(f<0||f>=this._length)throw new Error("start argument out of range");if(f+x<0)throw new Error("Cannot shift elements in list beyond index 0");if(x>0){for(let g=w-1;g>=0;g--)this.set(f+g+x,this.get(f+g));let l=f+w+x-this._length;if(l>0)for(this._length+=l;this._length>this._maxLength;)this._length--,this._startIndex++,this.onTrimEmitter.fire(1)}else for(let l=0;l<w;l++)this.set(f+l+x,this.get(f+l))}}_getCyclicIndex(f){return(this._startIndex+f)%this._maxLength}}r.CircularList=h},439:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.clone=void 0,r.clone=function a(m,p=5){if(typeof m!="object")return m;let h=Array.isArray(m)?[]:{};for(let v in m)h[v]=p<=1?m[v]:m[v]&&a(m[v],p-1);return h}},969:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.CoreTerminal=void 0;let m=a(844),p=a(585),h=a(348),v=a(866),f=a(744),w=a(302),x=a(83),l=a(460),g=a(753),y=a(480),b=a(994),k=a(282),E=a(435),A=a(981),B=a(660),L=!1;class W extends m.Disposable{get onScroll(){return this._onScrollApi||(this._onScrollApi=this.register(new l.EventEmitter),this._onScroll.event(O=>{this._onScrollApi?.fire(O.position)})),this._onScrollApi.event}get cols(){return this._bufferService.cols}get rows(){return this._bufferService.rows}get buffers(){return this._bufferService.buffers}get options(){return this.optionsService.options}set options(O){for(let F in O)this.optionsService.options[F]=O[F]}constructor(O){super(),this._windowsWrappingHeuristics=this.register(new m.MutableDisposable),this._onBinary=this.register(new l.EventEmitter),this.onBinary=this._onBinary.event,this._onData=this.register(new l.EventEmitter),this.onData=this._onData.event,this._onLineFeed=this.register(new l.EventEmitter),this.onLineFeed=this._onLineFeed.event,this._onResize=this.register(new l.EventEmitter),this.onResize=this._onResize.event,this._onWriteParsed=this.register(new l.EventEmitter),this.onWriteParsed=this._onWriteParsed.event,this._onScroll=this.register(new l.EventEmitter),this._instantiationService=new h.InstantiationService,this.optionsService=this.register(new w.OptionsService(O)),this._instantiationService.setService(p.IOptionsService,this.optionsService),this._bufferService=this.register(this._instantiationService.createInstance(f.BufferService)),this._instantiationService.setService(p.IBufferService,this._bufferService),this._logService=this.register(this._instantiationService.createInstance(v.LogService)),this._instantiationService.setService(p.ILogService,this._logService),this.coreService=this.register(this._instantiationService.createInstance(x.CoreService)),this._instantiationService.setService(p.ICoreService,this.coreService),this.coreMouseService=this.register(this._instantiationService.createInstance(g.CoreMouseService)),this._instantiationService.setService(p.ICoreMouseService,this.coreMouseService),this.unicodeService=this.register(this._instantiationService.createInstance(y.UnicodeService)),this._instantiationService.setService(p.IUnicodeService,this.unicodeService),this._charsetService=this._instantiationService.createInstance(b.CharsetService),this._instantiationService.setService(p.ICharsetService,this._charsetService),this._oscLinkService=this._instantiationService.createInstance(B.OscLinkService),this._instantiationService.setService(p.IOscLinkService,this._oscLinkService),this._inputHandler=this.register(new E.InputHandler(this._bufferService,this._charsetService,this.coreService,this._logService,this.optionsService,this._oscLinkService,this.coreMouseService,this.unicodeService)),this.register((0,l.forwardEvent)(this._inputHandler.onLineFeed,this._onLineFeed)),this.register(this._inputHandler),this.register((0,l.forwardEvent)(this._bufferService.onResize,this._onResize)),this.register((0,l.forwardEvent)(this.coreService.onData,this._onData)),this.register((0,l.forwardEvent)(this.coreService.onBinary,this._onBinary)),this.register(this.coreService.onRequestScrollToBottom(()=>this.scrollToBottom())),this.register(this.coreService.onUserInput(()=>this._writeBuffer.handleUserInput())),this.register(this.optionsService.onMultipleOptionChange(["windowsMode","windowsPty"],()=>this._handleWindowsPtyOptionChange())),this.register(this._bufferService.onScroll(F=>{this._onScroll.fire({position:this._bufferService.buffer.ydisp,source:0}),this._inputHandler.markRangeDirty(this._bufferService.buffer.scrollTop,this._bufferService.buffer.scrollBottom)})),this.register(this._inputHandler.onScroll(F=>{this._onScroll.fire({position:this._bufferService.buffer.ydisp,source:0}),this._inputHandler.markRangeDirty(this._bufferService.buffer.scrollTop,this._bufferService.buffer.scrollBottom)})),this._writeBuffer=this.register(new A.WriteBuffer((F,U)=>this._inputHandler.parse(F,U))),this.register((0,l.forwardEvent)(this._writeBuffer.onWriteParsed,this._onWriteParsed))}write(O,F){this._writeBuffer.write(O,F)}writeSync(O,F){this._logService.logLevel<=p.LogLevelEnum.WARN&&!L&&(this._logService.warn("writeSync is unreliable and will be removed soon."),L=!0),this._writeBuffer.writeSync(O,F)}input(O,F=!0){this.coreService.triggerDataEvent(O,F)}resize(O,F){isNaN(O)||isNaN(F)||(O=Math.max(O,f.MINIMUM_COLS),F=Math.max(F,f.MINIMUM_ROWS),this._bufferService.resize(O,F))}scroll(O,F=!1){this._bufferService.scroll(O,F)}scrollLines(O,F,U){this._bufferService.scrollLines(O,F,U)}scrollPages(O){this.scrollLines(O*(this.rows-1))}scrollToTop(){this.scrollLines(-this._bufferService.buffer.ydisp)}scrollToBottom(){this.scrollLines(this._bufferService.buffer.ybase-this._bufferService.buffer.ydisp)}scrollToLine(O){let F=O-this._bufferService.buffer.ydisp;F!==0&&this.scrollLines(F)}registerEscHandler(O,F){return this._inputHandler.registerEscHandler(O,F)}registerDcsHandler(O,F){return this._inputHandler.registerDcsHandler(O,F)}registerCsiHandler(O,F){return this._inputHandler.registerCsiHandler(O,F)}registerOscHandler(O,F){return this._inputHandler.registerOscHandler(O,F)}_setup(){this._handleWindowsPtyOptionChange()}reset(){this._inputHandler.reset(),this._bufferService.reset(),this._charsetService.reset(),this.coreService.reset(),this.coreMouseService.reset()}_handleWindowsPtyOptionChange(){let O=!1,F=this.optionsService.rawOptions.windowsPty;F&&F.buildNumber!==void 0&&F.buildNumber!==void 0?O=F.backend==="conpty"&&F.buildNumber<21376:this.optionsService.rawOptions.windowsMode&&(O=!0),O?this._enableWindowsWrappingHeuristics():this._windowsWrappingHeuristics.clear()}_enableWindowsWrappingHeuristics(){if(!this._windowsWrappingHeuristics.value){let O=[];O.push(this.onLineFeed(k.updateWindowsModeWrappedState.bind(null,this._bufferService))),O.push(this.registerCsiHandler({final:"H"},()=>((0,k.updateWindowsModeWrappedState)(this._bufferService),!1))),this._windowsWrappingHeuristics.value=(0,m.toDisposable)(()=>{for(let F of O)F.dispose()})}}}r.CoreTerminal=W},460:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.runAndSubscribe=r.forwardEvent=r.EventEmitter=void 0,r.EventEmitter=class{constructor(){this._listeners=[],this._disposed=!1}get event(){return this._event||(this._event=a=>(this._listeners.push(a),{dispose:()=>{if(!this._disposed){for(let p=0;p<this._listeners.length;p++)if(this._listeners[p]===a)return void this._listeners.splice(p,1)}}})),this._event}fire(a,m){let p=[];for(let h=0;h<this._listeners.length;h++)p.push(this._listeners[h]);for(let h=0;h<p.length;h++)p[h].call(void 0,a,m)}dispose(){this.clearListeners(),this._disposed=!0}clearListeners(){this._listeners&&(this._listeners.length=0)}},r.forwardEvent=function(a,m){return a(p=>m.fire(p))},r.runAndSubscribe=function(a,m){return m(void 0),a(p=>m(p))}},435:function(o,r,a){var m=this&&this.__decorate||function(Z,S,$,T){var I,z=arguments.length,Y=z<3?S:T===null?T=Object.getOwnPropertyDescriptor(S,$):T;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")Y=Reflect.decorate(Z,S,$,T);else for(var oe=Z.length-1;oe>=0;oe--)(I=Z[oe])&&(Y=(z<3?I(Y):z>3?I(S,$,Y):I(S,$))||Y);return z>3&&Y&&Object.defineProperty(S,$,Y),Y},p=this&&this.__param||function(Z,S){return function($,T){S($,T,Z)}};Object.defineProperty(r,"__esModule",{value:!0}),r.InputHandler=r.WindowsOptionsReportType=void 0;let h=a(584),v=a(116),f=a(15),w=a(844),x=a(482),l=a(437),g=a(460),y=a(643),b=a(511),k=a(734),E=a(585),A=a(480),B=a(242),L=a(351),W=a(941),he={"(":0,")":1,"*":2,"+":3,"-":1,".":2},O=131072;function F(Z,S){if(Z>24)return S.setWinLines||!1;switch(Z){case 1:return!!S.restoreWin;case 2:return!!S.minimizeWin;case 3:return!!S.setWinPosition;case 4:return!!S.setWinSizePixels;case 5:return!!S.raiseWin;case 6:return!!S.lowerWin;case 7:return!!S.refreshWin;case 8:return!!S.setWinSizeChars;case 9:return!!S.maximizeWin;case 10:return!!S.fullscreenWin;case 11:return!!S.getWinState;case 13:return!!S.getWinPosition;case 14:return!!S.getWinSizePixels;case 15:return!!S.getScreenSizePixels;case 16:return!!S.getCellSizePixels;case 18:return!!S.getWinSizeChars;case 19:return!!S.getScreenSizeChars;case 20:return!!S.getIconTitle;case 21:return!!S.getWinTitle;case 22:return!!S.pushTitle;case 23:return!!S.popTitle;case 24:return!!S.setWinLines}return!1}var U;(function(Z){Z[Z.GET_WIN_SIZE_PIXELS=0]="GET_WIN_SIZE_PIXELS",Z[Z.GET_CELL_SIZE_PIXELS=1]="GET_CELL_SIZE_PIXELS"})(U||(r.WindowsOptionsReportType=U={}));let rt=0;class Xe extends w.Disposable{getAttrData(){return this._curAttrData}constructor(S,$,T,I,z,Y,oe,de,Je=new f.EscapeSequenceParser){super(),this._bufferService=S,this._charsetService=$,this._coreService=T,this._logService=I,this._optionsService=z,this._oscLinkService=Y,this._coreMouseService=oe,this._unicodeService=de,this._parser=Je,this._parseBuffer=new Uint32Array(4096),this._stringDecoder=new x.StringToUtf32,this._utf8Decoder=new x.Utf8ToUtf32,this._workCell=new b.CellData,this._windowTitle="",this._iconName="",this._windowTitleStack=[],this._iconNameStack=[],this._curAttrData=l.DEFAULT_ATTR_DATA.clone(),this._eraseAttrDataInternal=l.DEFAULT_ATTR_DATA.clone(),this._onRequestBell=this.register(new g.EventEmitter),this.onRequestBell=this._onRequestBell.event,this._onRequestRefreshRows=this.register(new g.EventEmitter),this.onRequestRefreshRows=this._onRequestRefreshRows.event,this._onRequestReset=this.register(new g.EventEmitter),this.onRequestReset=this._onRequestReset.event,this._onRequestSendFocus=this.register(new g.EventEmitter),this.onRequestSendFocus=this._onRequestSendFocus.event,this._onRequestSyncScrollBar=this.register(new g.EventEmitter),this.onRequestSyncScrollBar=this._onRequestSyncScrollBar.event,this._onRequestWindowsOptionsReport=this.register(new g.EventEmitter),this.onRequestWindowsOptionsReport=this._onRequestWindowsOptionsReport.event,this._onA11yChar=this.register(new g.EventEmitter),this.onA11yChar=this._onA11yChar.event,this._onA11yTab=this.register(new g.EventEmitter),this.onA11yTab=this._onA11yTab.event,this._onCursorMove=this.register(new g.EventEmitter),this.onCursorMove=this._onCursorMove.event,this._onLineFeed=this.register(new g.EventEmitter),this.onLineFeed=this._onLineFeed.event,this._onScroll=this.register(new g.EventEmitter),this.onScroll=this._onScroll.event,this._onTitleChange=this.register(new g.EventEmitter),this.onTitleChange=this._onTitleChange.event,this._onColor=this.register(new g.EventEmitter),this.onColor=this._onColor.event,this._parseStack={paused:!1,cursorStartX:0,cursorStartY:0,decodedLength:0,position:0},this._specialColors=[256,257,258],this.register(this._parser),this._dirtyRowTracker=new re(this._bufferService),this._activeBuffer=this._bufferService.buffer,this.register(this._bufferService.buffers.onBufferActivate(M=>this._activeBuffer=M.activeBuffer)),this._parser.setCsiHandlerFallback((M,ne)=>{this._logService.debug("Unknown CSI code: ",{identifier:this._parser.identToString(M),params:ne.toArray()})}),this._parser.setEscHandlerFallback(M=>{this._logService.debug("Unknown ESC code: ",{identifier:this._parser.identToString(M)})}),this._parser.setExecuteHandlerFallback(M=>{this._logService.debug("Unknown EXECUTE code: ",{code:M})}),this._parser.setOscHandlerFallback((M,ne,V)=>{this._logService.debug("Unknown OSC code: ",{identifier:M,action:ne,data:V})}),this._parser.setDcsHandlerFallback((M,ne,V)=>{ne==="HOOK"&&(V=V.toArray()),this._logService.debug("Unknown DCS code: ",{identifier:this._parser.identToString(M),action:ne,payload:V})}),this._parser.setPrintHandler((M,ne,V)=>this.print(M,ne,V)),this._parser.registerCsiHandler({final:"@"},M=>this.insertChars(M)),this._parser.registerCsiHandler({intermediates:" ",final:"@"},M=>this.scrollLeft(M)),this._parser.registerCsiHandler({final:"A"},M=>this.cursorUp(M)),this._parser.registerCsiHandler({intermediates:" ",final:"A"},M=>this.scrollRight(M)),this._parser.registerCsiHandler({final:"B"},M=>this.cursorDown(M)),this._parser.registerCsiHandler({final:"C"},M=>this.cursorForward(M)),this._parser.registerCsiHandler({final:"D"},M=>this.cursorBackward(M)),this._parser.registerCsiHandler({final:"E"},M=>this.cursorNextLine(M)),this._parser.registerCsiHandler({final:"F"},M=>this.cursorPrecedingLine(M)),this._parser.registerCsiHandler({final:"G"},M=>this.cursorCharAbsolute(M)),this._parser.registerCsiHandler({final:"H"},M=>this.cursorPosition(M)),this._parser.registerCsiHandler({final:"I"},M=>this.cursorForwardTab(M)),this._parser.registerCsiHandler({final:"J"},M=>this.eraseInDisplay(M,!1)),this._parser.registerCsiHandler({prefix:"?",final:"J"},M=>this.eraseInDisplay(M,!0)),this._parser.registerCsiHandler({final:"K"},M=>this.eraseInLine(M,!1)),this._parser.registerCsiHandler({prefix:"?",final:"K"},M=>this.eraseInLine(M,!0)),this._parser.registerCsiHandler({final:"L"},M=>this.insertLines(M)),this._parser.registerCsiHandler({final:"M"},M=>this.deleteLines(M)),this._parser.registerCsiHandler({final:"P"},M=>this.deleteChars(M)),this._parser.registerCsiHandler({final:"S"},M=>this.scrollUp(M)),this._parser.registerCsiHandler({final:"T"},M=>this.scrollDown(M)),this._parser.registerCsiHandler({final:"X"},M=>this.eraseChars(M)),this._parser.registerCsiHandler({final:"Z"},M=>this.cursorBackwardTab(M)),this._parser.registerCsiHandler({final:"`"},M=>this.charPosAbsolute(M)),this._parser.registerCsiHandler({final:"a"},M=>this.hPositionRelative(M)),this._parser.registerCsiHandler({final:"b"},M=>this.repeatPrecedingCharacter(M)),this._parser.registerCsiHandler({final:"c"},M=>this.sendDeviceAttributesPrimary(M)),this._parser.registerCsiHandler({prefix:">",final:"c"},M=>this.sendDeviceAttributesSecondary(M)),this._parser.registerCsiHandler({final:"d"},M=>this.linePosAbsolute(M)),this._parser.registerCsiHandler({final:"e"},M=>this.vPositionRelative(M)),this._parser.registerCsiHandler({final:"f"},M=>this.hVPosition(M)),this._parser.registerCsiHandler({final:"g"},M=>this.tabClear(M)),this._parser.registerCsiHandler({final:"h"},M=>this.setMode(M)),this._parser.registerCsiHandler({prefix:"?",final:"h"},M=>this.setModePrivate(M)),this._parser.registerCsiHandler({final:"l"},M=>this.resetMode(M)),this._parser.registerCsiHandler({prefix:"?",final:"l"},M=>this.resetModePrivate(M)),this._parser.registerCsiHandler({final:"m"},M=>this.charAttributes(M)),this._parser.registerCsiHandler({final:"n"},M=>this.deviceStatus(M)),this._parser.registerCsiHandler({prefix:"?",final:"n"},M=>this.deviceStatusPrivate(M)),this._parser.registerCsiHandler({intermediates:"!",final:"p"},M=>this.softReset(M)),this._parser.registerCsiHandler({intermediates:" ",final:"q"},M=>this.setCursorStyle(M)),this._parser.registerCsiHandler({final:"r"},M=>this.setScrollRegion(M)),this._parser.registerCsiHandler({final:"s"},M=>this.saveCursor(M)),this._parser.registerCsiHandler({final:"t"},M=>this.windowOptions(M)),this._parser.registerCsiHandler({final:"u"},M=>this.restoreCursor(M)),this._parser.registerCsiHandler({intermediates:"'",final:"}"},M=>this.insertColumns(M)),this._parser.registerCsiHandler({intermediates:"'",final:"~"},M=>this.deleteColumns(M)),this._parser.registerCsiHandler({intermediates:'"',final:"q"},M=>this.selectProtected(M)),this._parser.registerCsiHandler({intermediates:"$",final:"p"},M=>this.requestMode(M,!0)),this._parser.registerCsiHandler({prefix:"?",intermediates:"$",final:"p"},M=>this.requestMode(M,!1)),this._parser.setExecuteHandler(h.C0.BEL,()=>this.bell()),this._parser.setExecuteHandler(h.C0.LF,()=>this.lineFeed()),this._parser.setExecuteHandler(h.C0.VT,()=>this.lineFeed()),this._parser.setExecuteHandler(h.C0.FF,()=>this.lineFeed()),this._parser.setExecuteHandler(h.C0.CR,()=>this.carriageReturn()),this._parser.setExecuteHandler(h.C0.BS,()=>this.backspace()),this._parser.setExecuteHandler(h.C0.HT,()=>this.tab()),this._parser.setExecuteHandler(h.C0.SO,()=>this.shiftOut()),this._parser.setExecuteHandler(h.C0.SI,()=>this.shiftIn()),this._parser.setExecuteHandler(h.C1.IND,()=>this.index()),this._parser.setExecuteHandler(h.C1.NEL,()=>this.nextLine()),this._parser.setExecuteHandler(h.C1.HTS,()=>this.tabSet()),this._parser.registerOscHandler(0,new B.OscHandler(M=>(this.setTitle(M),this.setIconName(M),!0))),this._parser.registerOscHandler(1,new B.OscHandler(M=>this.setIconName(M))),this._parser.registerOscHandler(2,new B.OscHandler(M=>this.setTitle(M))),this._parser.registerOscHandler(4,new B.OscHandler(M=>this.setOrReportIndexedColor(M))),this._parser.registerOscHandler(8,new B.OscHandler(M=>this.setHyperlink(M))),this._parser.registerOscHandler(10,new B.OscHandler(M=>this.setOrReportFgColor(M))),this._parser.registerOscHandler(11,new B.OscHandler(M=>this.setOrReportBgColor(M))),this._parser.registerOscHandler(12,new B.OscHandler(M=>this.setOrReportCursorColor(M))),this._parser.registerOscHandler(104,new B.OscHandler(M=>this.restoreIndexedColor(M))),this._parser.registerOscHandler(110,new B.OscHandler(M=>this.restoreFgColor(M))),this._parser.registerOscHandler(111,new B.OscHandler(M=>this.restoreBgColor(M))),this._parser.registerOscHandler(112,new B.OscHandler(M=>this.restoreCursorColor(M))),this._parser.registerEscHandler({final:"7"},()=>this.saveCursor()),this._parser.registerEscHandler({final:"8"},()=>this.restoreCursor()),this._parser.registerEscHandler({final:"D"},()=>this.index()),this._parser.registerEscHandler({final:"E"},()=>this.nextLine()),this._parser.registerEscHandler({final:"H"},()=>this.tabSet()),this._parser.registerEscHandler({final:"M"},()=>this.reverseIndex()),this._parser.registerEscHandler({final:"="},()=>this.keypadApplicationMode()),this._parser.registerEscHandler({final:">"},()=>this.keypadNumericMode()),this._parser.registerEscHandler({final:"c"},()=>this.fullReset()),this._parser.registerEscHandler({final:"n"},()=>this.setgLevel(2)),this._parser.registerEscHandler({final:"o"},()=>this.setgLevel(3)),this._parser.registerEscHandler({final:"|"},()=>this.setgLevel(3)),this._parser.registerEscHandler({final:"}"},()=>this.setgLevel(2)),this._parser.registerEscHandler({final:"~"},()=>this.setgLevel(1)),this._parser.registerEscHandler({intermediates:"%",final:"@"},()=>this.selectDefaultCharset()),this._parser.registerEscHandler({intermediates:"%",final:"G"},()=>this.selectDefaultCharset());for(let M in v.CHARSETS)this._parser.registerEscHandler({intermediates:"(",final:M},()=>this.selectCharset("("+M)),this._parser.registerEscHandler({intermediates:")",final:M},()=>this.selectCharset(")"+M)),this._parser.registerEscHandler({intermediates:"*",final:M},()=>this.selectCharset("*"+M)),this._parser.registerEscHandler({intermediates:"+",final:M},()=>this.selectCharset("+"+M)),this._parser.registerEscHandler({intermediates:"-",final:M},()=>this.selectCharset("-"+M)),this._parser.registerEscHandler({intermediates:".",final:M},()=>this.selectCharset("."+M)),this._parser.registerEscHandler({intermediates:"/",final:M},()=>this.selectCharset("/"+M));this._parser.registerEscHandler({intermediates:"#",final:"8"},()=>this.screenAlignmentPattern()),this._parser.setErrorHandler(M=>(this._logService.error("Parsing error: ",M),M)),this._parser.registerDcsHandler({intermediates:"$",final:"q"},new L.DcsHandler((M,ne)=>this.requestStatusString(M,ne)))}_preserveStack(S,$,T,I){this._parseStack.paused=!0,this._parseStack.cursorStartX=S,this._parseStack.cursorStartY=$,this._parseStack.decodedLength=T,this._parseStack.position=I}_logSlowResolvingAsync(S){this._logService.logLevel<=E.LogLevelEnum.WARN&&Promise.race([S,new Promise(($,T)=>setTimeout(()=>T("#SLOW_TIMEOUT"),5e3))]).catch($=>{if($!=="#SLOW_TIMEOUT")throw $;console.warn("async parser handler taking longer than 5000 ms")})}_getCurrentLinkId(){return this._curAttrData.extended.urlId}parse(S,$){let T,I=this._activeBuffer.x,z=this._activeBuffer.y,Y=0,oe=this._parseStack.paused;if(oe){if(T=this._parser.parse(this._parseBuffer,this._parseStack.decodedLength,$))return this._logSlowResolvingAsync(T),T;I=this._parseStack.cursorStartX,z=this._parseStack.cursorStartY,this._parseStack.paused=!1,S.length>O&&(Y=this._parseStack.position+O)}if(this._logService.logLevel<=E.LogLevelEnum.DEBUG&&this._logService.debug("parsing data"+(typeof S=="string"?` "${S}"`:` "${Array.prototype.map.call(S,M=>String.fromCharCode(M)).join("")}"`),typeof S=="string"?S.split("").map(M=>M.charCodeAt(0)):S),this._parseBuffer.length<S.length&&this._parseBuffer.length<O&&(this._parseBuffer=new Uint32Array(Math.min(S.length,O))),oe||this._dirtyRowTracker.clearRange(),S.length>O)for(let M=Y;M<S.length;M+=O){let ne=M+O<S.length?M+O:S.length,V=typeof S=="string"?this._stringDecoder.decode(S.substring(M,ne),this._parseBuffer):this._utf8Decoder.decode(S.subarray(M,ne),this._parseBuffer);if(T=this._parser.parse(this._parseBuffer,V))return this._preserveStack(I,z,V,M),this._logSlowResolvingAsync(T),T}else if(!oe){let M=typeof S=="string"?this._stringDecoder.decode(S,this._parseBuffer):this._utf8Decoder.decode(S,this._parseBuffer);if(T=this._parser.parse(this._parseBuffer,M))return this._preserveStack(I,z,M,0),this._logSlowResolvingAsync(T),T}this._activeBuffer.x===I&&this._activeBuffer.y===z||this._onCursorMove.fire();let de=this._dirtyRowTracker.end+(this._bufferService.buffer.ybase-this._bufferService.buffer.ydisp),Je=this._dirtyRowTracker.start+(this._bufferService.buffer.ybase-this._bufferService.buffer.ydisp);Je<this._bufferService.rows&&this._onRequestRefreshRows.fire(Math.min(Je,this._bufferService.rows-1),Math.min(de,this._bufferService.rows-1))}print(S,$,T){let I,z,Y=this._charsetService.charset,oe=this._optionsService.rawOptions.screenReaderMode,de=this._bufferService.cols,Je=this._coreService.decPrivateModes.wraparound,M=this._coreService.modes.insertMode,ne=this._curAttrData,V=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);this._dirtyRowTracker.markDirty(this._activeBuffer.y),this._activeBuffer.x&&T-$>0&&V.getWidth(this._activeBuffer.x-1)===2&&V.setCellFromCodepoint(this._activeBuffer.x-1,0,1,ne);let ee=this._parser.precedingJoinState;for(let oi=$;oi<T;++oi){if(I=S[oi],I<127&&Y){let Ot=Y[String.fromCharCode(I)];Ot&&(I=Ot.charCodeAt(0))}let ai=this._unicodeService.charProperties(I,ee);z=A.UnicodeService.extractWidth(ai);let ji=A.UnicodeService.extractShouldJoin(ai),Ft=ji?A.UnicodeService.extractWidth(ee):0;if(ee=ai,oe&&this._onA11yChar.fire((0,x.stringFromCodePoint)(I)),this._getCurrentLinkId()&&this._oscLinkService.addLineToLink(this._getCurrentLinkId(),this._activeBuffer.ybase+this._activeBuffer.y),this._activeBuffer.x+z-Ft>de){if(Je){let Ot=V,ki=this._activeBuffer.x-Ft;for(this._activeBuffer.x=Ft,this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData(),!0)):(this._activeBuffer.y>=this._bufferService.rows&&(this._activeBuffer.y=this._bufferService.rows-1),this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=!0),V=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y),Ft>0&&V instanceof l.BufferLine&&V.copyCellsFrom(Ot,ki,0,Ft,!1);ki<de;)Ot.setCellFromCodepoint(ki++,0,1,ne)}else if(this._activeBuffer.x=de-1,z===2)continue}if(ji&&this._activeBuffer.x){let Ot=V.getWidth(this._activeBuffer.x-1)?1:2;V.addCodepointToCell(this._activeBuffer.x-Ot,I,z);for(let ki=z-Ft;--ki>=0;)V.setCellFromCodepoint(this._activeBuffer.x++,0,0,ne)}else if(M&&(V.insertCells(this._activeBuffer.x,z-Ft,this._activeBuffer.getNullCell(ne)),V.getWidth(de-1)===2&&V.setCellFromCodepoint(de-1,y.NULL_CELL_CODE,y.NULL_CELL_WIDTH,ne)),V.setCellFromCodepoint(this._activeBuffer.x++,I,z,ne),z>0)for(;--z;)V.setCellFromCodepoint(this._activeBuffer.x++,0,0,ne)}this._parser.precedingJoinState=ee,this._activeBuffer.x<de&&T-$>0&&V.getWidth(this._activeBuffer.x)===0&&!V.hasContent(this._activeBuffer.x)&&V.setCellFromCodepoint(this._activeBuffer.x,0,1,ne),this._dirtyRowTracker.markDirty(this._activeBuffer.y)}registerCsiHandler(S,$){return S.final!=="t"||S.prefix||S.intermediates?this._parser.registerCsiHandler(S,$):this._parser.registerCsiHandler(S,T=>!F(T.params[0],this._optionsService.rawOptions.windowOptions)||$(T))}registerDcsHandler(S,$){return this._parser.registerDcsHandler(S,new L.DcsHandler($))}registerEscHandler(S,$){return this._parser.registerEscHandler(S,$)}registerOscHandler(S,$){return this._parser.registerOscHandler(S,new B.OscHandler($))}bell(){return this._onRequestBell.fire(),!0}lineFeed(){return this._dirtyRowTracker.markDirty(this._activeBuffer.y),this._optionsService.rawOptions.convertEol&&(this._activeBuffer.x=0),this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData())):this._activeBuffer.y>=this._bufferService.rows?this._activeBuffer.y=this._bufferService.rows-1:this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=!1,this._activeBuffer.x>=this._bufferService.cols&&this._activeBuffer.x--,this._dirtyRowTracker.markDirty(this._activeBuffer.y),this._onLineFeed.fire(),!0}carriageReturn(){return this._activeBuffer.x=0,!0}backspace(){if(!this._coreService.decPrivateModes.reverseWraparound)return this._restrictCursor(),this._activeBuffer.x>0&&this._activeBuffer.x--,!0;if(this._restrictCursor(this._bufferService.cols),this._activeBuffer.x>0)this._activeBuffer.x--;else if(this._activeBuffer.x===0&&this._activeBuffer.y>this._activeBuffer.scrollTop&&this._activeBuffer.y<=this._activeBuffer.scrollBottom&&this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y)?.isWrapped){this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=!1,this._activeBuffer.y--,this._activeBuffer.x=this._bufferService.cols-1;let S=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);S.hasWidth(this._activeBuffer.x)&&!S.hasContent(this._activeBuffer.x)&&this._activeBuffer.x--}return this._restrictCursor(),!0}tab(){if(this._activeBuffer.x>=this._bufferService.cols)return!0;let S=this._activeBuffer.x;return this._activeBuffer.x=this._activeBuffer.nextStop(),this._optionsService.rawOptions.screenReaderMode&&this._onA11yTab.fire(this._activeBuffer.x-S),!0}shiftOut(){return this._charsetService.setgLevel(1),!0}shiftIn(){return this._charsetService.setgLevel(0),!0}_restrictCursor(S=this._bufferService.cols-1){this._activeBuffer.x=Math.min(S,Math.max(0,this._activeBuffer.x)),this._activeBuffer.y=this._coreService.decPrivateModes.origin?Math.min(this._activeBuffer.scrollBottom,Math.max(this._activeBuffer.scrollTop,this._activeBuffer.y)):Math.min(this._bufferService.rows-1,Math.max(0,this._activeBuffer.y)),this._dirtyRowTracker.markDirty(this._activeBuffer.y)}_setCursor(S,$){this._dirtyRowTracker.markDirty(this._activeBuffer.y),this._coreService.decPrivateModes.origin?(this._activeBuffer.x=S,this._activeBuffer.y=this._activeBuffer.scrollTop+$):(this._activeBuffer.x=S,this._activeBuffer.y=$),this._restrictCursor(),this._dirtyRowTracker.markDirty(this._activeBuffer.y)}_moveCursor(S,$){this._restrictCursor(),this._setCursor(this._activeBuffer.x+S,this._activeBuffer.y+$)}cursorUp(S){let $=this._activeBuffer.y-this._activeBuffer.scrollTop;return $>=0?this._moveCursor(0,-Math.min($,S.params[0]||1)):this._moveCursor(0,-(S.params[0]||1)),!0}cursorDown(S){let $=this._activeBuffer.scrollBottom-this._activeBuffer.y;return $>=0?this._moveCursor(0,Math.min($,S.params[0]||1)):this._moveCursor(0,S.params[0]||1),!0}cursorForward(S){return this._moveCursor(S.params[0]||1,0),!0}cursorBackward(S){return this._moveCursor(-(S.params[0]||1),0),!0}cursorNextLine(S){return this.cursorDown(S),this._activeBuffer.x=0,!0}cursorPrecedingLine(S){return this.cursorUp(S),this._activeBuffer.x=0,!0}cursorCharAbsolute(S){return this._setCursor((S.params[0]||1)-1,this._activeBuffer.y),!0}cursorPosition(S){return this._setCursor(S.length>=2?(S.params[1]||1)-1:0,(S.params[0]||1)-1),!0}charPosAbsolute(S){return this._setCursor((S.params[0]||1)-1,this._activeBuffer.y),!0}hPositionRelative(S){return this._moveCursor(S.params[0]||1,0),!0}linePosAbsolute(S){return this._setCursor(this._activeBuffer.x,(S.params[0]||1)-1),!0}vPositionRelative(S){return this._moveCursor(0,S.params[0]||1),!0}hVPosition(S){return this.cursorPosition(S),!0}tabClear(S){let $=S.params[0];return $===0?delete this._activeBuffer.tabs[this._activeBuffer.x]:$===3&&(this._activeBuffer.tabs={}),!0}cursorForwardTab(S){if(this._activeBuffer.x>=this._bufferService.cols)return!0;let $=S.params[0]||1;for(;$--;)this._activeBuffer.x=this._activeBuffer.nextStop();return!0}cursorBackwardTab(S){if(this._activeBuffer.x>=this._bufferService.cols)return!0;let $=S.params[0]||1;for(;$--;)this._activeBuffer.x=this._activeBuffer.prevStop();return!0}selectProtected(S){let $=S.params[0];return $===1&&(this._curAttrData.bg|=536870912),$!==2&&$!==0||(this._curAttrData.bg&=-536870913),!0}_eraseInBufferLine(S,$,T,I=!1,z=!1){let Y=this._activeBuffer.lines.get(this._activeBuffer.ybase+S);Y.replaceCells($,T,this._activeBuffer.getNullCell(this._eraseAttrData()),z),I&&(Y.isWrapped=!1)}_resetBufferLine(S,$=!1){let T=this._activeBuffer.lines.get(this._activeBuffer.ybase+S);T&&(T.fill(this._activeBuffer.getNullCell(this._eraseAttrData()),$),this._bufferService.buffer.clearMarkers(this._activeBuffer.ybase+S),T.isWrapped=!1)}eraseInDisplay(S,$=!1){let T;switch(this._restrictCursor(this._bufferService.cols),S.params[0]){case 0:for(T=this._activeBuffer.y,this._dirtyRowTracker.markDirty(T),this._eraseInBufferLine(T++,this._activeBuffer.x,this._bufferService.cols,this._activeBuffer.x===0,$);T<this._bufferService.rows;T++)this._resetBufferLine(T,$);this._dirtyRowTracker.markDirty(T);break;case 1:for(T=this._activeBuffer.y,this._dirtyRowTracker.markDirty(T),this._eraseInBufferLine(T,0,this._activeBuffer.x+1,!0,$),this._activeBuffer.x+1>=this._bufferService.cols&&(this._activeBuffer.lines.get(T+1).isWrapped=!1);T--;)this._resetBufferLine(T,$);this._dirtyRowTracker.markDirty(0);break;case 2:for(T=this._bufferService.rows,this._dirtyRowTracker.markDirty(T-1);T--;)this._resetBufferLine(T,$);this._dirtyRowTracker.markDirty(0);break;case 3:let I=this._activeBuffer.lines.length-this._bufferService.rows;I>0&&(this._activeBuffer.lines.trimStart(I),this._activeBuffer.ybase=Math.max(this._activeBuffer.ybase-I,0),this._activeBuffer.ydisp=Math.max(this._activeBuffer.ydisp-I,0),this._onScroll.fire(0))}return!0}eraseInLine(S,$=!1){switch(this._restrictCursor(this._bufferService.cols),S.params[0]){case 0:this._eraseInBufferLine(this._activeBuffer.y,this._activeBuffer.x,this._bufferService.cols,this._activeBuffer.x===0,$);break;case 1:this._eraseInBufferLine(this._activeBuffer.y,0,this._activeBuffer.x+1,!1,$);break;case 2:this._eraseInBufferLine(this._activeBuffer.y,0,this._bufferService.cols,!0,$)}return this._dirtyRowTracker.markDirty(this._activeBuffer.y),!0}insertLines(S){this._restrictCursor();let $=S.params[0]||1;if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let T=this._activeBuffer.ybase+this._activeBuffer.y,I=this._bufferService.rows-1-this._activeBuffer.scrollBottom,z=this._bufferService.rows-1+this._activeBuffer.ybase-I+1;for(;$--;)this._activeBuffer.lines.splice(z-1,1),this._activeBuffer.lines.splice(T,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y,this._activeBuffer.scrollBottom),this._activeBuffer.x=0,!0}deleteLines(S){this._restrictCursor();let $=S.params[0]||1;if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let T=this._activeBuffer.ybase+this._activeBuffer.y,I;for(I=this._bufferService.rows-1-this._activeBuffer.scrollBottom,I=this._bufferService.rows-1+this._activeBuffer.ybase-I;$--;)this._activeBuffer.lines.splice(T,1),this._activeBuffer.lines.splice(I,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y,this._activeBuffer.scrollBottom),this._activeBuffer.x=0,!0}insertChars(S){this._restrictCursor();let $=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return $&&($.insertCells(this._activeBuffer.x,S.params[0]||1,this._activeBuffer.getNullCell(this._eraseAttrData())),this._dirtyRowTracker.markDirty(this._activeBuffer.y)),!0}deleteChars(S){this._restrictCursor();let $=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return $&&($.deleteCells(this._activeBuffer.x,S.params[0]||1,this._activeBuffer.getNullCell(this._eraseAttrData())),this._dirtyRowTracker.markDirty(this._activeBuffer.y)),!0}scrollUp(S){let $=S.params[0]||1;for(;$--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,0,this._activeBuffer.getBlankLine(this._eraseAttrData()));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}scrollDown(S){let $=S.params[0]||1;for(;$--;)this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollBottom,1),this._activeBuffer.lines.splice(this._activeBuffer.ybase+this._activeBuffer.scrollTop,0,this._activeBuffer.getBlankLine(l.DEFAULT_ATTR_DATA));return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}scrollLeft(S){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let $=S.params[0]||1;for(let T=this._activeBuffer.scrollTop;T<=this._activeBuffer.scrollBottom;++T){let I=this._activeBuffer.lines.get(this._activeBuffer.ybase+T);I.deleteCells(0,$,this._activeBuffer.getNullCell(this._eraseAttrData())),I.isWrapped=!1}return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}scrollRight(S){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let $=S.params[0]||1;for(let T=this._activeBuffer.scrollTop;T<=this._activeBuffer.scrollBottom;++T){let I=this._activeBuffer.lines.get(this._activeBuffer.ybase+T);I.insertCells(0,$,this._activeBuffer.getNullCell(this._eraseAttrData())),I.isWrapped=!1}return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}insertColumns(S){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let $=S.params[0]||1;for(let T=this._activeBuffer.scrollTop;T<=this._activeBuffer.scrollBottom;++T){let I=this._activeBuffer.lines.get(this._activeBuffer.ybase+T);I.insertCells(this._activeBuffer.x,$,this._activeBuffer.getNullCell(this._eraseAttrData())),I.isWrapped=!1}return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}deleteColumns(S){if(this._activeBuffer.y>this._activeBuffer.scrollBottom||this._activeBuffer.y<this._activeBuffer.scrollTop)return!0;let $=S.params[0]||1;for(let T=this._activeBuffer.scrollTop;T<=this._activeBuffer.scrollBottom;++T){let I=this._activeBuffer.lines.get(this._activeBuffer.ybase+T);I.deleteCells(this._activeBuffer.x,$,this._activeBuffer.getNullCell(this._eraseAttrData())),I.isWrapped=!1}return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom),!0}eraseChars(S){this._restrictCursor();let $=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y);return $&&($.replaceCells(this._activeBuffer.x,this._activeBuffer.x+(S.params[0]||1),this._activeBuffer.getNullCell(this._eraseAttrData())),this._dirtyRowTracker.markDirty(this._activeBuffer.y)),!0}repeatPrecedingCharacter(S){let $=this._parser.precedingJoinState;if(!$)return!0;let T=S.params[0]||1,I=A.UnicodeService.extractWidth($),z=this._activeBuffer.x-I,Y=this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).getString(z),oe=new Uint32Array(Y.length*T),de=0;for(let M=0;M<Y.length;){let ne=Y.codePointAt(M)||0;oe[de++]=ne,M+=ne>65535?2:1}let Je=de;for(let M=1;M<T;++M)oe.copyWithin(Je,0,de),Je+=de;return this.print(oe,0,Je),!0}sendDeviceAttributesPrimary(S){return S.params[0]>0||(this._is("xterm")||this._is("rxvt-unicode")||this._is("screen")?this._coreService.triggerDataEvent(h.C0.ESC+"[?1;2c"):this._is("linux")&&this._coreService.triggerDataEvent(h.C0.ESC+"[?6c")),!0}sendDeviceAttributesSecondary(S){return S.params[0]>0||(this._is("xterm")?this._coreService.triggerDataEvent(h.C0.ESC+"[>0;276;0c"):this._is("rxvt-unicode")?this._coreService.triggerDataEvent(h.C0.ESC+"[>85;95;0c"):this._is("linux")?this._coreService.triggerDataEvent(S.params[0]+"c"):this._is("screen")&&this._coreService.triggerDataEvent(h.C0.ESC+"[>83;40003;0c")),!0}_is(S){return(this._optionsService.rawOptions.termName+"").indexOf(S)===0}setMode(S){for(let $=0;$<S.length;$++)switch(S.params[$]){case 4:this._coreService.modes.insertMode=!0;break;case 20:this._optionsService.options.convertEol=!0}return!0}setModePrivate(S){for(let $=0;$<S.length;$++)switch(S.params[$]){case 1:this._coreService.decPrivateModes.applicationCursorKeys=!0;break;case 2:this._charsetService.setgCharset(0,v.DEFAULT_CHARSET),this._charsetService.setgCharset(1,v.DEFAULT_CHARSET),this._charsetService.setgCharset(2,v.DEFAULT_CHARSET),this._charsetService.setgCharset(3,v.DEFAULT_CHARSET);break;case 3:this._optionsService.rawOptions.windowOptions.setWinLines&&(this._bufferService.resize(132,this._bufferService.rows),this._onRequestReset.fire());break;case 6:this._coreService.decPrivateModes.origin=!0,this._setCursor(0,0);break;case 7:this._coreService.decPrivateModes.wraparound=!0;break;case 12:this._optionsService.options.cursorBlink=!0;break;case 45:this._coreService.decPrivateModes.reverseWraparound=!0;break;case 66:this._logService.debug("Serial port requested application keypad."),this._coreService.decPrivateModes.applicationKeypad=!0,this._onRequestSyncScrollBar.fire();break;case 9:this._coreMouseService.activeProtocol="X10";break;case 1e3:this._coreMouseService.activeProtocol="VT200";break;case 1002:this._coreMouseService.activeProtocol="DRAG";break;case 1003:this._coreMouseService.activeProtocol="ANY";break;case 1004:this._coreService.decPrivateModes.sendFocus=!0,this._onRequestSendFocus.fire();break;case 1005:this._logService.debug("DECSET 1005 not supported (see #2507)");break;case 1006:this._coreMouseService.activeEncoding="SGR";break;case 1015:this._logService.debug("DECSET 1015 not supported (see #2507)");break;case 1016:this._coreMouseService.activeEncoding="SGR_PIXELS";break;case 25:this._coreService.isCursorHidden=!1;break;case 1048:this.saveCursor();break;case 1049:this.saveCursor();case 47:case 1047:this._bufferService.buffers.activateAltBuffer(this._eraseAttrData()),this._coreService.isCursorInitialized=!0,this._onRequestRefreshRows.fire(0,this._bufferService.rows-1),this._onRequestSyncScrollBar.fire();break;case 2004:this._coreService.decPrivateModes.bracketedPasteMode=!0}return!0}resetMode(S){for(let $=0;$<S.length;$++)switch(S.params[$]){case 4:this._coreService.modes.insertMode=!1;break;case 20:this._optionsService.options.convertEol=!1}return!0}resetModePrivate(S){for(let $=0;$<S.length;$++)switch(S.params[$]){case 1:this._coreService.decPrivateModes.applicationCursorKeys=!1;break;case 3:this._optionsService.rawOptions.windowOptions.setWinLines&&(this._bufferService.resize(80,this._bufferService.rows),this._onRequestReset.fire());break;case 6:this._coreService.decPrivateModes.origin=!1,this._setCursor(0,0);break;case 7:this._coreService.decPrivateModes.wraparound=!1;break;case 12:this._optionsService.options.cursorBlink=!1;break;case 45:this._coreService.decPrivateModes.reverseWraparound=!1;break;case 66:this._logService.debug("Switching back to normal keypad."),this._coreService.decPrivateModes.applicationKeypad=!1,this._onRequestSyncScrollBar.fire();break;case 9:case 1e3:case 1002:case 1003:this._coreMouseService.activeProtocol="NONE";break;case 1004:this._coreService.decPrivateModes.sendFocus=!1;break;case 1005:this._logService.debug("DECRST 1005 not supported (see #2507)");break;case 1006:case 1016:this._coreMouseService.activeEncoding="DEFAULT";break;case 1015:this._logService.debug("DECRST 1015 not supported (see #2507)");break;case 25:this._coreService.isCursorHidden=!0;break;case 1048:this.restoreCursor();break;case 1049:case 47:case 1047:this._bufferService.buffers.activateNormalBuffer(),S.params[$]===1049&&this.restoreCursor(),this._coreService.isCursorInitialized=!0,this._onRequestRefreshRows.fire(0,this._bufferService.rows-1),this._onRequestSyncScrollBar.fire();break;case 2004:this._coreService.decPrivateModes.bracketedPasteMode=!1}return!0}requestMode(S,$){let T=this._coreService.decPrivateModes,{activeProtocol:I,activeEncoding:z}=this._coreMouseService,Y=this._coreService,{buffers:oe,cols:de}=this._bufferService,{active:Je,alt:M}=oe,ne=this._optionsService.rawOptions,V=ji=>ji?1:2,ee=S.params[0];return oi=ee,ai=$?ee===2?4:ee===4?V(Y.modes.insertMode):ee===12?3:ee===20?V(ne.convertEol):0:ee===1?V(T.applicationCursorKeys):ee===3?ne.windowOptions.setWinLines?de===80?2:de===132?1:0:0:ee===6?V(T.origin):ee===7?V(T.wraparound):ee===8?3:ee===9?V(I==="X10"):ee===12?V(ne.cursorBlink):ee===25?V(!Y.isCursorHidden):ee===45?V(T.reverseWraparound):ee===66?V(T.applicationKeypad):ee===67?4:ee===1e3?V(I==="VT200"):ee===1002?V(I==="DRAG"):ee===1003?V(I==="ANY"):ee===1004?V(T.sendFocus):ee===1005?4:ee===1006?V(z==="SGR"):ee===1015?4:ee===1016?V(z==="SGR_PIXELS"):ee===1048?1:ee===47||ee===1047||ee===1049?V(Je===M):ee===2004?V(T.bracketedPasteMode):0,Y.triggerDataEvent(`${h.C0.ESC}[${$?"":"?"}${oi};${ai}$y`),!0;var oi,ai}_updateAttrColor(S,$,T,I,z){return $===2?(S|=50331648,S&=-16777216,S|=k.AttributeData.fromColorRGB([T,I,z])):$===5&&(S&=-50331904,S|=33554432|255&T),S}_extractColor(S,$,T){let I=[0,0,-1,0,0,0],z=0,Y=0;do{if(I[Y+z]=S.params[$+Y],S.hasSubParams($+Y)){let oe=S.getSubParams($+Y),de=0;do I[1]===5&&(z=1),I[Y+de+1+z]=oe[de];while(++de<oe.length&&de+Y+1+z<I.length);break}if(I[1]===5&&Y+z>=2||I[1]===2&&Y+z>=5)break;I[1]&&(z=1)}while(++Y+$<S.length&&Y+z<I.length);for(let oe=2;oe<I.length;++oe)I[oe]===-1&&(I[oe]=0);switch(I[0]){case 38:T.fg=this._updateAttrColor(T.fg,I[1],I[3],I[4],I[5]);break;case 48:T.bg=this._updateAttrColor(T.bg,I[1],I[3],I[4],I[5]);break;case 58:T.extended=T.extended.clone(),T.extended.underlineColor=this._updateAttrColor(T.extended.underlineColor,I[1],I[3],I[4],I[5])}return Y}_processUnderline(S,$){$.extended=$.extended.clone(),(!~S||S>5)&&(S=1),$.extended.underlineStyle=S,$.fg|=268435456,S===0&&($.fg&=-268435457),$.updateExtended()}_processSGR0(S){S.fg=l.DEFAULT_ATTR_DATA.fg,S.bg=l.DEFAULT_ATTR_DATA.bg,S.extended=S.extended.clone(),S.extended.underlineStyle=0,S.extended.underlineColor&=-67108864,S.updateExtended()}charAttributes(S){if(S.length===1&&S.params[0]===0)return this._processSGR0(this._curAttrData),!0;let $=S.length,T,I=this._curAttrData;for(let z=0;z<$;z++)T=S.params[z],T>=30&&T<=37?(I.fg&=-50331904,I.fg|=16777216|T-30):T>=40&&T<=47?(I.bg&=-50331904,I.bg|=16777216|T-40):T>=90&&T<=97?(I.fg&=-50331904,I.fg|=16777224|T-90):T>=100&&T<=107?(I.bg&=-50331904,I.bg|=16777224|T-100):T===0?this._processSGR0(I):T===1?I.fg|=134217728:T===3?I.bg|=67108864:T===4?(I.fg|=268435456,this._processUnderline(S.hasSubParams(z)?S.getSubParams(z)[0]:1,I)):T===5?I.fg|=536870912:T===7?I.fg|=67108864:T===8?I.fg|=1073741824:T===9?I.fg|=2147483648:T===2?I.bg|=134217728:T===21?this._processUnderline(2,I):T===22?(I.fg&=-134217729,I.bg&=-134217729):T===23?I.bg&=-67108865:T===24?(I.fg&=-268435457,this._processUnderline(0,I)):T===25?I.fg&=-536870913:T===27?I.fg&=-67108865:T===28?I.fg&=-1073741825:T===29?I.fg&=2147483647:T===39?(I.fg&=-67108864,I.fg|=16777215&l.DEFAULT_ATTR_DATA.fg):T===49?(I.bg&=-67108864,I.bg|=16777215&l.DEFAULT_ATTR_DATA.bg):T===38||T===48||T===58?z+=this._extractColor(S,z,I):T===53?I.bg|=1073741824:T===55?I.bg&=-1073741825:T===59?(I.extended=I.extended.clone(),I.extended.underlineColor=-1,I.updateExtended()):T===100?(I.fg&=-67108864,I.fg|=16777215&l.DEFAULT_ATTR_DATA.fg,I.bg&=-67108864,I.bg|=16777215&l.DEFAULT_ATTR_DATA.bg):this._logService.debug("Unknown SGR attribute: %d.",T);return!0}deviceStatus(S){switch(S.params[0]){case 5:this._coreService.triggerDataEvent(`${h.C0.ESC}[0n`);break;case 6:let $=this._activeBuffer.y+1,T=this._activeBuffer.x+1;this._coreService.triggerDataEvent(`${h.C0.ESC}[${$};${T}R`)}return!0}deviceStatusPrivate(S){if(S.params[0]===6){let $=this._activeBuffer.y+1,T=this._activeBuffer.x+1;this._coreService.triggerDataEvent(`${h.C0.ESC}[?${$};${T}R`)}return!0}softReset(S){return this._coreService.isCursorHidden=!1,this._onRequestSyncScrollBar.fire(),this._activeBuffer.scrollTop=0,this._activeBuffer.scrollBottom=this._bufferService.rows-1,this._curAttrData=l.DEFAULT_ATTR_DATA.clone(),this._coreService.reset(),this._charsetService.reset(),this._activeBuffer.savedX=0,this._activeBuffer.savedY=this._activeBuffer.ybase,this._activeBuffer.savedCurAttrData.fg=this._curAttrData.fg,this._activeBuffer.savedCurAttrData.bg=this._curAttrData.bg,this._activeBuffer.savedCharset=this._charsetService.charset,this._coreService.decPrivateModes.origin=!1,!0}setCursorStyle(S){let $=S.params[0]||1;switch($){case 1:case 2:this._optionsService.options.cursorStyle="block";break;case 3:case 4:this._optionsService.options.cursorStyle="underline";break;case 5:case 6:this._optionsService.options.cursorStyle="bar"}let T=$%2==1;return this._optionsService.options.cursorBlink=T,!0}setScrollRegion(S){let $=S.params[0]||1,T;return(S.length<2||(T=S.params[1])>this._bufferService.rows||T===0)&&(T=this._bufferService.rows),T>$&&(this._activeBuffer.scrollTop=$-1,this._activeBuffer.scrollBottom=T-1,this._setCursor(0,0)),!0}windowOptions(S){if(!F(S.params[0],this._optionsService.rawOptions.windowOptions))return!0;let $=S.length>1?S.params[1]:0;switch(S.params[0]){case 14:$!==2&&this._onRequestWindowsOptionsReport.fire(U.GET_WIN_SIZE_PIXELS);break;case 16:this._onRequestWindowsOptionsReport.fire(U.GET_CELL_SIZE_PIXELS);break;case 18:this._bufferService&&this._coreService.triggerDataEvent(`${h.C0.ESC}[8;${this._bufferService.rows};${this._bufferService.cols}t`);break;case 22:$!==0&&$!==2||(this._windowTitleStack.push(this._windowTitle),this._windowTitleStack.length>10&&this._windowTitleStack.shift()),$!==0&&$!==1||(this._iconNameStack.push(this._iconName),this._iconNameStack.length>10&&this._iconNameStack.shift());break;case 23:$!==0&&$!==2||this._windowTitleStack.length&&this.setTitle(this._windowTitleStack.pop()),$!==0&&$!==1||this._iconNameStack.length&&this.setIconName(this._iconNameStack.pop())}return!0}saveCursor(S){return this._activeBuffer.savedX=this._activeBuffer.x,this._activeBuffer.savedY=this._activeBuffer.ybase+this._activeBuffer.y,this._activeBuffer.savedCurAttrData.fg=this._curAttrData.fg,this._activeBuffer.savedCurAttrData.bg=this._curAttrData.bg,this._activeBuffer.savedCharset=this._charsetService.charset,!0}restoreCursor(S){return this._activeBuffer.x=this._activeBuffer.savedX||0,this._activeBuffer.y=Math.max(this._activeBuffer.savedY-this._activeBuffer.ybase,0),this._curAttrData.fg=this._activeBuffer.savedCurAttrData.fg,this._curAttrData.bg=this._activeBuffer.savedCurAttrData.bg,this._charsetService.charset=this._savedCharset,this._activeBuffer.savedCharset&&(this._charsetService.charset=this._activeBuffer.savedCharset),this._restrictCursor(),!0}setTitle(S){return this._windowTitle=S,this._onTitleChange.fire(S),!0}setIconName(S){return this._iconName=S,!0}setOrReportIndexedColor(S){let $=[],T=S.split(";");for(;T.length>1;){let I=T.shift(),z=T.shift();if(/^\d+$/.exec(I)){let Y=parseInt(I);if(ze(Y))if(z==="?")$.push({type:0,index:Y});else{let oe=(0,W.parseColor)(z);oe&&$.push({type:1,index:Y,color:oe})}}}return $.length&&this._onColor.fire($),!0}setHyperlink(S){let $=S.split(";");return!($.length<2)&&($[1]?this._createHyperlink($[0],$[1]):!$[0]&&this._finishHyperlink())}_createHyperlink(S,$){this._getCurrentLinkId()&&this._finishHyperlink();let T=S.split(":"),I,z=T.findIndex(Y=>Y.startsWith("id="));return z!==-1&&(I=T[z].slice(3)||void 0),this._curAttrData.extended=this._curAttrData.extended.clone(),this._curAttrData.extended.urlId=this._oscLinkService.registerLink({id:I,uri:$}),this._curAttrData.updateExtended(),!0}_finishHyperlink(){return this._curAttrData.extended=this._curAttrData.extended.clone(),this._curAttrData.extended.urlId=0,this._curAttrData.updateExtended(),!0}_setOrReportSpecialColor(S,$){let T=S.split(";");for(let I=0;I<T.length&&!($>=this._specialColors.length);++I,++$)if(T[I]==="?")this._onColor.fire([{type:0,index:this._specialColors[$]}]);else{let z=(0,W.parseColor)(T[I]);z&&this._onColor.fire([{type:1,index:this._specialColors[$],color:z}])}return!0}setOrReportFgColor(S){return this._setOrReportSpecialColor(S,0)}setOrReportBgColor(S){return this._setOrReportSpecialColor(S,1)}setOrReportCursorColor(S){return this._setOrReportSpecialColor(S,2)}restoreIndexedColor(S){if(!S)return this._onColor.fire([{type:2}]),!0;let $=[],T=S.split(";");for(let I=0;I<T.length;++I)if(/^\d+$/.exec(T[I])){let z=parseInt(T[I]);ze(z)&&$.push({type:2,index:z})}return $.length&&this._onColor.fire($),!0}restoreFgColor(S){return this._onColor.fire([{type:2,index:256}]),!0}restoreBgColor(S){return this._onColor.fire([{type:2,index:257}]),!0}restoreCursorColor(S){return this._onColor.fire([{type:2,index:258}]),!0}nextLine(){return this._activeBuffer.x=0,this.index(),!0}keypadApplicationMode(){return this._logService.debug("Serial port requested application keypad."),this._coreService.decPrivateModes.applicationKeypad=!0,this._onRequestSyncScrollBar.fire(),!0}keypadNumericMode(){return this._logService.debug("Switching back to normal keypad."),this._coreService.decPrivateModes.applicationKeypad=!1,this._onRequestSyncScrollBar.fire(),!0}selectDefaultCharset(){return this._charsetService.setgLevel(0),this._charsetService.setgCharset(0,v.DEFAULT_CHARSET),!0}selectCharset(S){return S.length!==2?(this.selectDefaultCharset(),!0):(S[0]==="/"||this._charsetService.setgCharset(he[S[0]],v.CHARSETS[S[1]]||v.DEFAULT_CHARSET),!0)}index(){return this._restrictCursor(),this._activeBuffer.y++,this._activeBuffer.y===this._activeBuffer.scrollBottom+1?(this._activeBuffer.y--,this._bufferService.scroll(this._eraseAttrData())):this._activeBuffer.y>=this._bufferService.rows&&(this._activeBuffer.y=this._bufferService.rows-1),this._restrictCursor(),!0}tabSet(){return this._activeBuffer.tabs[this._activeBuffer.x]=!0,!0}reverseIndex(){if(this._restrictCursor(),this._activeBuffer.y===this._activeBuffer.scrollTop){let S=this._activeBuffer.scrollBottom-this._activeBuffer.scrollTop;this._activeBuffer.lines.shiftElements(this._activeBuffer.ybase+this._activeBuffer.y,S,1),this._activeBuffer.lines.set(this._activeBuffer.ybase+this._activeBuffer.y,this._activeBuffer.getBlankLine(this._eraseAttrData())),this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop,this._activeBuffer.scrollBottom)}else this._activeBuffer.y--,this._restrictCursor();return!0}fullReset(){return this._parser.reset(),this._onRequestReset.fire(),!0}reset(){this._curAttrData=l.DEFAULT_ATTR_DATA.clone(),this._eraseAttrDataInternal=l.DEFAULT_ATTR_DATA.clone()}_eraseAttrData(){return this._eraseAttrDataInternal.bg&=-67108864,this._eraseAttrDataInternal.bg|=67108863&this._curAttrData.bg,this._eraseAttrDataInternal}setgLevel(S){return this._charsetService.setgLevel(S),!0}screenAlignmentPattern(){let S=new b.CellData;S.content=4194373,S.fg=this._curAttrData.fg,S.bg=this._curAttrData.bg,this._setCursor(0,0);for(let $=0;$<this._bufferService.rows;++$){let T=this._activeBuffer.ybase+this._activeBuffer.y+$,I=this._activeBuffer.lines.get(T);I&&(I.fill(S),I.isWrapped=!1)}return this._dirtyRowTracker.markAllDirty(),this._setCursor(0,0),!0}requestStatusString(S,$){let T=this._bufferService.buffer,I=this._optionsService.rawOptions;return(z=>(this._coreService.triggerDataEvent(`${h.C0.ESC}${z}${h.C0.ESC}\\`),!0))(S==='"q'?`P1$r${this._curAttrData.isProtected()?1:0}"q`:S==='"p'?'P1$r61;1"p':S==="r"?`P1$r${T.scrollTop+1};${T.scrollBottom+1}r`:S==="m"?"P1$r0m":S===" q"?`P1$r${{block:2,underline:4,bar:6}[I.cursorStyle]-(I.cursorBlink?1:0)} q`:"P0$r")}markRangeDirty(S,$){this._dirtyRowTracker.markRangeDirty(S,$)}}r.InputHandler=Xe;let re=class{constructor(Z){this._bufferService=Z,this.clearRange()}clearRange(){this.start=this._bufferService.buffer.y,this.end=this._bufferService.buffer.y}markDirty(Z){Z<this.start?this.start=Z:Z>this.end&&(this.end=Z)}markRangeDirty(Z,S){Z>S&&(rt=Z,Z=S,S=rt),Z<this.start&&(this.start=Z),S>this.end&&(this.end=S)}markAllDirty(){this.markRangeDirty(0,this._bufferService.rows-1)}};function ze(Z){return 0<=Z&&Z<256}re=m([p(0,E.IBufferService)],re)},844:(o,r)=>{function a(m){for(let p of m)p.dispose();m.length=0}Object.defineProperty(r,"__esModule",{value:!0}),r.getDisposeArrayDisposable=r.disposeArray=r.toDisposable=r.MutableDisposable=r.Disposable=void 0,r.Disposable=class{constructor(){this._disposables=[],this._isDisposed=!1}dispose(){this._isDisposed=!0;for(let m of this._disposables)m.dispose();this._disposables.length=0}register(m){return this._disposables.push(m),m}unregister(m){let p=this._disposables.indexOf(m);p!==-1&&this._disposables.splice(p,1)}},r.MutableDisposable=class{constructor(){this._isDisposed=!1}get value(){return this._isDisposed?void 0:this._value}set value(m){this._isDisposed||m===this._value||(this._value?.dispose(),this._value=m)}clear(){this.value=void 0}dispose(){this._isDisposed=!0,this._value?.dispose(),this._value=void 0}},r.toDisposable=function(m){return{dispose:m}},r.disposeArray=a,r.getDisposeArrayDisposable=function(m){return{dispose:()=>a(m)}}},114:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.isChromeOS=r.isLinux=r.isWindows=r.isIphone=r.isIpad=r.isMac=r.getSafariVersion=r.isSafari=r.isLegacyEdge=r.isFirefox=r.isNode=void 0,r.isNode=typeof process<"u"&&"title"in process;let a=r.isNode?"node":navigator.userAgent,m=r.isNode?"node":navigator.platform;r.isFirefox=a.includes("Firefox"),r.isLegacyEdge=a.includes("Edge"),r.isSafari=/^((?!chrome|android).)*safari/i.test(a),r.getSafariVersion=function(){if(!r.isSafari)return 0;let p=a.match(/Version\/(\d+)/);return p===null||p.length<2?0:parseInt(p[1])},r.isMac=["Macintosh","MacIntel","MacPPC","Mac68K"].includes(m),r.isIpad=m==="iPad",r.isIphone=m==="iPhone",r.isWindows=["Windows","Win16","Win32","WinCE"].includes(m),r.isLinux=m.indexOf("Linux")>=0,r.isChromeOS=/\bCrOS\b/.test(a)},226:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.DebouncedIdleTask=r.IdleTaskQueue=r.PriorityTaskQueue=void 0;let m=a(114);class p{constructor(){this._tasks=[],this._i=0}enqueue(f){this._tasks.push(f),this._start()}flush(){for(;this._i<this._tasks.length;)this._tasks[this._i]()||this._i++;this.clear()}clear(){this._idleCallback&&(this._cancelCallback(this._idleCallback),this._idleCallback=void 0),this._i=0,this._tasks.length=0}_start(){this._idleCallback||(this._idleCallback=this._requestCallback(this._process.bind(this)))}_process(f){this._idleCallback=void 0;let w=0,x=0,l=f.timeRemaining(),g=0;for(;this._i<this._tasks.length;){if(w=Date.now(),this._tasks[this._i]()||this._i++,w=Math.max(1,Date.now()-w),x=Math.max(w,x),g=f.timeRemaining(),1.5*x>g)return l-w<-20&&console.warn(`task queue exceeded allotted deadline by ${Math.abs(Math.round(l-w))}ms`),void this._start();l=g}this.clear()}}class h extends p{_requestCallback(f){return setTimeout(()=>f(this._createDeadline(16)))}_cancelCallback(f){clearTimeout(f)}_createDeadline(f){let w=Date.now()+f;return{timeRemaining:()=>Math.max(0,w-Date.now())}}}r.PriorityTaskQueue=h,r.IdleTaskQueue=!m.isNode&&"requestIdleCallback"in window?class extends p{_requestCallback(v){return requestIdleCallback(v)}_cancelCallback(v){cancelIdleCallback(v)}}:h,r.DebouncedIdleTask=class{constructor(){this._queue=new r.IdleTaskQueue}set(v){this._queue.clear(),this._queue.enqueue(v)}flush(){this._queue.flush()}}},282:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.updateWindowsModeWrappedState=void 0;let m=a(643);r.updateWindowsModeWrappedState=function(p){let h=p.buffer.lines.get(p.buffer.ybase+p.buffer.y-1),v=h?.get(p.cols-1),f=p.buffer.lines.get(p.buffer.ybase+p.buffer.y);f&&v&&(f.isWrapped=v[m.CHAR_DATA_CODE_INDEX]!==m.NULL_CELL_CODE&&v[m.CHAR_DATA_CODE_INDEX]!==m.WHITESPACE_CELL_CODE)}},734:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.ExtendedAttrs=r.AttributeData=void 0;class a{constructor(){this.fg=0,this.bg=0,this.extended=new m}static toColorRGB(h){return[h>>>16&255,h>>>8&255,255&h]}static fromColorRGB(h){return(255&h[0])<<16|(255&h[1])<<8|255&h[2]}clone(){let h=new a;return h.fg=this.fg,h.bg=this.bg,h.extended=this.extended.clone(),h}isInverse(){return 67108864&this.fg}isBold(){return 134217728&this.fg}isUnderline(){return this.hasExtendedAttrs()&&this.extended.underlineStyle!==0?1:268435456&this.fg}isBlink(){return 536870912&this.fg}isInvisible(){return 1073741824&this.fg}isItalic(){return 67108864&this.bg}isDim(){return 134217728&this.bg}isStrikethrough(){return 2147483648&this.fg}isProtected(){return 536870912&this.bg}isOverline(){return 1073741824&this.bg}getFgColorMode(){return 50331648&this.fg}getBgColorMode(){return 50331648&this.bg}isFgRGB(){return(50331648&this.fg)==50331648}isBgRGB(){return(50331648&this.bg)==50331648}isFgPalette(){return(50331648&this.fg)==16777216||(50331648&this.fg)==33554432}isBgPalette(){return(50331648&this.bg)==16777216||(50331648&this.bg)==33554432}isFgDefault(){return(50331648&this.fg)==0}isBgDefault(){return(50331648&this.bg)==0}isAttributeDefault(){return this.fg===0&&this.bg===0}getFgColor(){switch(50331648&this.fg){case 16777216:case 33554432:return 255&this.fg;case 50331648:return 16777215&this.fg;default:return-1}}getBgColor(){switch(50331648&this.bg){case 16777216:case 33554432:return 255&this.bg;case 50331648:return 16777215&this.bg;default:return-1}}hasExtendedAttrs(){return 268435456&this.bg}updateExtended(){this.extended.isEmpty()?this.bg&=-268435457:this.bg|=268435456}getUnderlineColor(){if(268435456&this.bg&&~this.extended.underlineColor)switch(50331648&this.extended.underlineColor){case 16777216:case 33554432:return 255&this.extended.underlineColor;case 50331648:return 16777215&this.extended.underlineColor;default:return this.getFgColor()}return this.getFgColor()}getUnderlineColorMode(){return 268435456&this.bg&&~this.extended.underlineColor?50331648&this.extended.underlineColor:this.getFgColorMode()}isUnderlineColorRGB(){return 268435456&this.bg&&~this.extended.underlineColor?(50331648&this.extended.underlineColor)==50331648:this.isFgRGB()}isUnderlineColorPalette(){return 268435456&this.bg&&~this.extended.underlineColor?(50331648&this.extended.underlineColor)==16777216||(50331648&this.extended.underlineColor)==33554432:this.isFgPalette()}isUnderlineColorDefault(){return 268435456&this.bg&&~this.extended.underlineColor?(50331648&this.extended.underlineColor)==0:this.isFgDefault()}getUnderlineStyle(){return 268435456&this.fg?268435456&this.bg?this.extended.underlineStyle:1:0}getUnderlineVariantOffset(){return this.extended.underlineVariantOffset}}r.AttributeData=a;class m{get ext(){return this._urlId?-469762049&this._ext|this.underlineStyle<<26:this._ext}set ext(h){this._ext=h}get underlineStyle(){return this._urlId?5:(469762048&this._ext)>>26}set underlineStyle(h){this._ext&=-469762049,this._ext|=h<<26&469762048}get underlineColor(){return 67108863&this._ext}set underlineColor(h){this._ext&=-67108864,this._ext|=67108863&h}get urlId(){return this._urlId}set urlId(h){this._urlId=h}get underlineVariantOffset(){let h=(3758096384&this._ext)>>29;return h<0?4294967288^h:h}set underlineVariantOffset(h){this._ext&=536870911,this._ext|=h<<29&3758096384}constructor(h=0,v=0){this._ext=0,this._urlId=0,this._ext=h,this._urlId=v}clone(){return new m(this._ext,this._urlId)}isEmpty(){return this.underlineStyle===0&&this._urlId===0}}r.ExtendedAttrs=m},92:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.Buffer=r.MAX_BUFFER_SIZE=void 0;let m=a(349),p=a(226),h=a(734),v=a(437),f=a(634),w=a(511),x=a(643),l=a(863),g=a(116);r.MAX_BUFFER_SIZE=4294967295,r.Buffer=class{constructor(y,b,k){this._hasScrollback=y,this._optionsService=b,this._bufferService=k,this.ydisp=0,this.ybase=0,this.y=0,this.x=0,this.tabs={},this.savedY=0,this.savedX=0,this.savedCurAttrData=v.DEFAULT_ATTR_DATA.clone(),this.savedCharset=g.DEFAULT_CHARSET,this.markers=[],this._nullCell=w.CellData.fromCharData([0,x.NULL_CELL_CHAR,x.NULL_CELL_WIDTH,x.NULL_CELL_CODE]),this._whitespaceCell=w.CellData.fromCharData([0,x.WHITESPACE_CELL_CHAR,x.WHITESPACE_CELL_WIDTH,x.WHITESPACE_CELL_CODE]),this._isClearing=!1,this._memoryCleanupQueue=new p.IdleTaskQueue,this._memoryCleanupPosition=0,this._cols=this._bufferService.cols,this._rows=this._bufferService.rows,this.lines=new m.CircularList(this._getCorrectBufferLength(this._rows)),this.scrollTop=0,this.scrollBottom=this._rows-1,this.setupTabStops()}getNullCell(y){return y?(this._nullCell.fg=y.fg,this._nullCell.bg=y.bg,this._nullCell.extended=y.extended):(this._nullCell.fg=0,this._nullCell.bg=0,this._nullCell.extended=new h.ExtendedAttrs),this._nullCell}getWhitespaceCell(y){return y?(this._whitespaceCell.fg=y.fg,this._whitespaceCell.bg=y.bg,this._whitespaceCell.extended=y.extended):(this._whitespaceCell.fg=0,this._whitespaceCell.bg=0,this._whitespaceCell.extended=new h.ExtendedAttrs),this._whitespaceCell}getBlankLine(y,b){return new v.BufferLine(this._bufferService.cols,this.getNullCell(y),b)}get hasScrollback(){return this._hasScrollback&&this.lines.maxLength>this._rows}get isCursorInViewport(){let y=this.ybase+this.y-this.ydisp;return y>=0&&y<this._rows}_getCorrectBufferLength(y){if(!this._hasScrollback)return y;let b=y+this._optionsService.rawOptions.scrollback;return b>r.MAX_BUFFER_SIZE?r.MAX_BUFFER_SIZE:b}fillViewportRows(y){if(this.lines.length===0){y===void 0&&(y=v.DEFAULT_ATTR_DATA);let b=this._rows;for(;b--;)this.lines.push(this.getBlankLine(y))}}clear(){this.ydisp=0,this.ybase=0,this.y=0,this.x=0,this.lines=new m.CircularList(this._getCorrectBufferLength(this._rows)),this.scrollTop=0,this.scrollBottom=this._rows-1,this.setupTabStops()}resize(y,b){let k=this.getNullCell(v.DEFAULT_ATTR_DATA),E=0,A=this._getCorrectBufferLength(b);if(A>this.lines.maxLength&&(this.lines.maxLength=A),this.lines.length>0){if(this._cols<y)for(let L=0;L<this.lines.length;L++)E+=+this.lines.get(L).resize(y,k);let B=0;if(this._rows<b)for(let L=this._rows;L<b;L++)this.lines.length<b+this.ybase&&(this._optionsService.rawOptions.windowsMode||this._optionsService.rawOptions.windowsPty.backend!==void 0||this._optionsService.rawOptions.windowsPty.buildNumber!==void 0?this.lines.push(new v.BufferLine(y,k)):this.ybase>0&&this.lines.length<=this.ybase+this.y+B+1?(this.ybase--,B++,this.ydisp>0&&this.ydisp--):this.lines.push(new v.BufferLine(y,k)));else for(let L=this._rows;L>b;L--)this.lines.length>b+this.ybase&&(this.lines.length>this.ybase+this.y+1?this.lines.pop():(this.ybase++,this.ydisp++));if(A<this.lines.maxLength){let L=this.lines.length-A;L>0&&(this.lines.trimStart(L),this.ybase=Math.max(this.ybase-L,0),this.ydisp=Math.max(this.ydisp-L,0),this.savedY=Math.max(this.savedY-L,0)),this.lines.maxLength=A}this.x=Math.min(this.x,y-1),this.y=Math.min(this.y,b-1),B&&(this.y+=B),this.savedX=Math.min(this.savedX,y-1),this.scrollTop=0}if(this.scrollBottom=b-1,this._isReflowEnabled&&(this._reflow(y,b),this._cols>y))for(let B=0;B<this.lines.length;B++)E+=+this.lines.get(B).resize(y,k);this._cols=y,this._rows=b,this._memoryCleanupQueue.clear(),E>.1*this.lines.length&&(this._memoryCleanupPosition=0,this._memoryCleanupQueue.enqueue(()=>this._batchedMemoryCleanup()))}_batchedMemoryCleanup(){let y=!0;this._memoryCleanupPosition>=this.lines.length&&(this._memoryCleanupPosition=0,y=!1);let b=0;for(;this._memoryCleanupPosition<this.lines.length;)if(b+=this.lines.get(this._memoryCleanupPosition++).cleanupMemory(),b>100)return!0;return y}get _isReflowEnabled(){let y=this._optionsService.rawOptions.windowsPty;return y&&y.buildNumber?this._hasScrollback&&y.backend==="conpty"&&y.buildNumber>=21376:this._hasScrollback&&!this._optionsService.rawOptions.windowsMode}_reflow(y,b){this._cols!==y&&(y>this._cols?this._reflowLarger(y,b):this._reflowSmaller(y,b))}_reflowLarger(y,b){let k=(0,f.reflowLargerGetLinesToRemove)(this.lines,this._cols,y,this.ybase+this.y,this.getNullCell(v.DEFAULT_ATTR_DATA));if(k.length>0){let E=(0,f.reflowLargerCreateNewLayout)(this.lines,k);(0,f.reflowLargerApplyNewLayout)(this.lines,E.layout),this._reflowLargerAdjustViewport(y,b,E.countRemoved)}}_reflowLargerAdjustViewport(y,b,k){let E=this.getNullCell(v.DEFAULT_ATTR_DATA),A=k;for(;A-- >0;)this.ybase===0?(this.y>0&&this.y--,this.lines.length<b&&this.lines.push(new v.BufferLine(y,E))):(this.ydisp===this.ybase&&this.ydisp--,this.ybase--);this.savedY=Math.max(this.savedY-k,0)}_reflowSmaller(y,b){let k=this.getNullCell(v.DEFAULT_ATTR_DATA),E=[],A=0;for(let B=this.lines.length-1;B>=0;B--){let L=this.lines.get(B);if(!L||!L.isWrapped&&L.getTrimmedLength()<=y)continue;let W=[L];for(;L.isWrapped&&B>0;)L=this.lines.get(--B),W.unshift(L);let he=this.ybase+this.y;if(he>=B&&he<B+W.length)continue;let O=W[W.length-1].getTrimmedLength(),F=(0,f.reflowSmallerGetNewLineLengths)(W,this._cols,y),U=F.length-W.length,rt;rt=this.ybase===0&&this.y!==this.lines.length-1?Math.max(0,this.y-this.lines.maxLength+U):Math.max(0,this.lines.length-this.lines.maxLength+U);let Xe=[];for(let T=0;T<U;T++){let I=this.getBlankLine(v.DEFAULT_ATTR_DATA,!0);Xe.push(I)}Xe.length>0&&(E.push({start:B+W.length+A,newLines:Xe}),A+=Xe.length),W.push(...Xe);let re=F.length-1,ze=F[re];ze===0&&(re--,ze=F[re]);let Z=W.length-U-1,S=O;for(;Z>=0;){let T=Math.min(S,ze);if(W[re]===void 0)break;if(W[re].copyCellsFrom(W[Z],S-T,ze-T,T,!0),ze-=T,ze===0&&(re--,ze=F[re]),S-=T,S===0){Z--;let I=Math.max(Z,0);S=(0,f.getWrappedLineTrimmedLength)(W,I,this._cols)}}for(let T=0;T<W.length;T++)F[T]<y&&W[T].setCell(F[T],k);let $=U-rt;for(;$-- >0;)this.ybase===0?this.y<b-1?(this.y++,this.lines.pop()):(this.ybase++,this.ydisp++):this.ybase<Math.min(this.lines.maxLength,this.lines.length+A)-b&&(this.ybase===this.ydisp&&this.ydisp++,this.ybase++);this.savedY=Math.min(this.savedY+U,this.ybase+b-1)}if(E.length>0){let B=[],L=[];for(let re=0;re<this.lines.length;re++)L.push(this.lines.get(re));let W=this.lines.length,he=W-1,O=0,F=E[O];this.lines.length=Math.min(this.lines.maxLength,this.lines.length+A);let U=0;for(let re=Math.min(this.lines.maxLength-1,W+A-1);re>=0;re--)if(F&&F.start>he+U){for(let ze=F.newLines.length-1;ze>=0;ze--)this.lines.set(re--,F.newLines[ze]);re++,B.push({index:he+1,amount:F.newLines.length}),U+=F.newLines.length,F=E[++O]}else this.lines.set(re,L[he--]);let rt=0;for(let re=B.length-1;re>=0;re--)B[re].index+=rt,this.lines.onInsertEmitter.fire(B[re]),rt+=B[re].amount;let Xe=Math.max(0,W+A-this.lines.maxLength);Xe>0&&this.lines.onTrimEmitter.fire(Xe)}}translateBufferLineToString(y,b,k=0,E){let A=this.lines.get(y);return A?A.translateToString(b,k,E):""}getWrappedRangeForLine(y){let b=y,k=y;for(;b>0&&this.lines.get(b).isWrapped;)b--;for(;k+1<this.lines.length&&this.lines.get(k+1).isWrapped;)k++;return{first:b,last:k}}setupTabStops(y){for(y!=null?this.tabs[y]||(y=this.prevStop(y)):(this.tabs={},y=0);y<this._cols;y+=this._optionsService.rawOptions.tabStopWidth)this.tabs[y]=!0}prevStop(y){for(y==null&&(y=this.x);!this.tabs[--y]&&y>0;);return y>=this._cols?this._cols-1:y<0?0:y}nextStop(y){for(y==null&&(y=this.x);!this.tabs[++y]&&y<this._cols;);return y>=this._cols?this._cols-1:y<0?0:y}clearMarkers(y){this._isClearing=!0;for(let b=0;b<this.markers.length;b++)this.markers[b].line===y&&(this.markers[b].dispose(),this.markers.splice(b--,1));this._isClearing=!1}clearAllMarkers(){this._isClearing=!0;for(let y=0;y<this.markers.length;y++)this.markers[y].dispose(),this.markers.splice(y--,1);this._isClearing=!1}addMarker(y){let b=new l.Marker(y);return this.markers.push(b),b.register(this.lines.onTrim(k=>{b.line-=k,b.line<0&&b.dispose()})),b.register(this.lines.onInsert(k=>{b.line>=k.index&&(b.line+=k.amount)})),b.register(this.lines.onDelete(k=>{b.line>=k.index&&b.line<k.index+k.amount&&b.dispose(),b.line>k.index&&(b.line-=k.amount)})),b.register(b.onDispose(()=>this._removeMarker(b))),b}_removeMarker(y){this._isClearing||this.markers.splice(this.markers.indexOf(y),1)}}},437:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.BufferLine=r.DEFAULT_ATTR_DATA=void 0;let m=a(734),p=a(511),h=a(643),v=a(482);r.DEFAULT_ATTR_DATA=Object.freeze(new m.AttributeData);let f=0;class w{constructor(l,g,y=!1){this.isWrapped=y,this._combined={},this._extendedAttrs={},this._data=new Uint32Array(3*l);let b=g||p.CellData.fromCharData([0,h.NULL_CELL_CHAR,h.NULL_CELL_WIDTH,h.NULL_CELL_CODE]);for(let k=0;k<l;++k)this.setCell(k,b);this.length=l}get(l){let g=this._data[3*l+0],y=2097151&g;return[this._data[3*l+1],2097152&g?this._combined[l]:y?(0,v.stringFromCodePoint)(y):"",g>>22,2097152&g?this._combined[l].charCodeAt(this._combined[l].length-1):y]}set(l,g){this._data[3*l+1]=g[h.CHAR_DATA_ATTR_INDEX],g[h.CHAR_DATA_CHAR_INDEX].length>1?(this._combined[l]=g[1],this._data[3*l+0]=2097152|l|g[h.CHAR_DATA_WIDTH_INDEX]<<22):this._data[3*l+0]=g[h.CHAR_DATA_CHAR_INDEX].charCodeAt(0)|g[h.CHAR_DATA_WIDTH_INDEX]<<22}getWidth(l){return this._data[3*l+0]>>22}hasWidth(l){return 12582912&this._data[3*l+0]}getFg(l){return this._data[3*l+1]}getBg(l){return this._data[3*l+2]}hasContent(l){return 4194303&this._data[3*l+0]}getCodePoint(l){let g=this._data[3*l+0];return 2097152&g?this._combined[l].charCodeAt(this._combined[l].length-1):2097151&g}isCombined(l){return 2097152&this._data[3*l+0]}getString(l){let g=this._data[3*l+0];return 2097152&g?this._combined[l]:2097151&g?(0,v.stringFromCodePoint)(2097151&g):""}isProtected(l){return 536870912&this._data[3*l+2]}loadCell(l,g){return f=3*l,g.content=this._data[f+0],g.fg=this._data[f+1],g.bg=this._data[f+2],2097152&g.content&&(g.combinedData=this._combined[l]),268435456&g.bg&&(g.extended=this._extendedAttrs[l]),g}setCell(l,g){2097152&g.content&&(this._combined[l]=g.combinedData),268435456&g.bg&&(this._extendedAttrs[l]=g.extended),this._data[3*l+0]=g.content,this._data[3*l+1]=g.fg,this._data[3*l+2]=g.bg}setCellFromCodepoint(l,g,y,b){268435456&b.bg&&(this._extendedAttrs[l]=b.extended),this._data[3*l+0]=g|y<<22,this._data[3*l+1]=b.fg,this._data[3*l+2]=b.bg}addCodepointToCell(l,g,y){let b=this._data[3*l+0];2097152&b?this._combined[l]+=(0,v.stringFromCodePoint)(g):2097151&b?(this._combined[l]=(0,v.stringFromCodePoint)(2097151&b)+(0,v.stringFromCodePoint)(g),b&=-2097152,b|=2097152):b=g|4194304,y&&(b&=-12582913,b|=y<<22),this._data[3*l+0]=b}insertCells(l,g,y){if((l%=this.length)&&this.getWidth(l-1)===2&&this.setCellFromCodepoint(l-1,0,1,y),g<this.length-l){let b=new p.CellData;for(let k=this.length-l-g-1;k>=0;--k)this.setCell(l+g+k,this.loadCell(l+k,b));for(let k=0;k<g;++k)this.setCell(l+k,y)}else for(let b=l;b<this.length;++b)this.setCell(b,y);this.getWidth(this.length-1)===2&&this.setCellFromCodepoint(this.length-1,0,1,y)}deleteCells(l,g,y){if(l%=this.length,g<this.length-l){let b=new p.CellData;for(let k=0;k<this.length-l-g;++k)this.setCell(l+k,this.loadCell(l+g+k,b));for(let k=this.length-g;k<this.length;++k)this.setCell(k,y)}else for(let b=l;b<this.length;++b)this.setCell(b,y);l&&this.getWidth(l-1)===2&&this.setCellFromCodepoint(l-1,0,1,y),this.getWidth(l)!==0||this.hasContent(l)||this.setCellFromCodepoint(l,0,1,y)}replaceCells(l,g,y,b=!1){if(b)for(l&&this.getWidth(l-1)===2&&!this.isProtected(l-1)&&this.setCellFromCodepoint(l-1,0,1,y),g<this.length&&this.getWidth(g-1)===2&&!this.isProtected(g)&&this.setCellFromCodepoint(g,0,1,y);l<g&&l<this.length;)this.isProtected(l)||this.setCell(l,y),l++;else for(l&&this.getWidth(l-1)===2&&this.setCellFromCodepoint(l-1,0,1,y),g<this.length&&this.getWidth(g-1)===2&&this.setCellFromCodepoint(g,0,1,y);l<g&&l<this.length;)this.setCell(l++,y)}resize(l,g){if(l===this.length)return 4*this._data.length*2<this._data.buffer.byteLength;let y=3*l;if(l>this.length){if(this._data.buffer.byteLength>=4*y)this._data=new Uint32Array(this._data.buffer,0,y);else{let b=new Uint32Array(y);b.set(this._data),this._data=b}for(let b=this.length;b<l;++b)this.setCell(b,g)}else{this._data=this._data.subarray(0,y);let b=Object.keys(this._combined);for(let E=0;E<b.length;E++){let A=parseInt(b[E],10);A>=l&&delete this._combined[A]}let k=Object.keys(this._extendedAttrs);for(let E=0;E<k.length;E++){let A=parseInt(k[E],10);A>=l&&delete this._extendedAttrs[A]}}return this.length=l,4*y*2<this._data.buffer.byteLength}cleanupMemory(){if(4*this._data.length*2<this._data.buffer.byteLength){let l=new Uint32Array(this._data.length);return l.set(this._data),this._data=l,1}return 0}fill(l,g=!1){if(g)for(let y=0;y<this.length;++y)this.isProtected(y)||this.setCell(y,l);else{this._combined={},this._extendedAttrs={};for(let y=0;y<this.length;++y)this.setCell(y,l)}}copyFrom(l){this.length!==l.length?this._data=new Uint32Array(l._data):this._data.set(l._data),this.length=l.length,this._combined={};for(let g in l._combined)this._combined[g]=l._combined[g];this._extendedAttrs={};for(let g in l._extendedAttrs)this._extendedAttrs[g]=l._extendedAttrs[g];this.isWrapped=l.isWrapped}clone(){let l=new w(0);l._data=new Uint32Array(this._data),l.length=this.length;for(let g in this._combined)l._combined[g]=this._combined[g];for(let g in this._extendedAttrs)l._extendedAttrs[g]=this._extendedAttrs[g];return l.isWrapped=this.isWrapped,l}getTrimmedLength(){for(let l=this.length-1;l>=0;--l)if(4194303&this._data[3*l+0])return l+(this._data[3*l+0]>>22);return 0}getNoBgTrimmedLength(){for(let l=this.length-1;l>=0;--l)if(4194303&this._data[3*l+0]||50331648&this._data[3*l+2])return l+(this._data[3*l+0]>>22);return 0}copyCellsFrom(l,g,y,b,k){let E=l._data;if(k)for(let B=b-1;B>=0;B--){for(let L=0;L<3;L++)this._data[3*(y+B)+L]=E[3*(g+B)+L];268435456&E[3*(g+B)+2]&&(this._extendedAttrs[y+B]=l._extendedAttrs[g+B])}else for(let B=0;B<b;B++){for(let L=0;L<3;L++)this._data[3*(y+B)+L]=E[3*(g+B)+L];268435456&E[3*(g+B)+2]&&(this._extendedAttrs[y+B]=l._extendedAttrs[g+B])}let A=Object.keys(l._combined);for(let B=0;B<A.length;B++){let L=parseInt(A[B],10);L>=g&&(this._combined[L-g+y]=l._combined[L])}}translateToString(l,g,y,b){g=g??0,y=y??this.length,l&&(y=Math.min(y,this.getTrimmedLength())),b&&(b.length=0);let k="";for(;g<y;){let E=this._data[3*g+0],A=2097151&E,B=2097152&E?this._combined[g]:A?(0,v.stringFromCodePoint)(A):h.WHITESPACE_CELL_CHAR;if(k+=B,b)for(let L=0;L<B.length;++L)b.push(g);g+=E>>22||1}return b&&b.push(g),k}}r.BufferLine=w},634:(o,r)=>{function a(m,p,h){if(p===m.length-1)return m[p].getTrimmedLength();let v=!m[p].hasContent(h-1)&&m[p].getWidth(h-1)===1,f=m[p+1].getWidth(0)===2;return v&&f?h-1:h}Object.defineProperty(r,"__esModule",{value:!0}),r.getWrappedLineTrimmedLength=r.reflowSmallerGetNewLineLengths=r.reflowLargerApplyNewLayout=r.reflowLargerCreateNewLayout=r.reflowLargerGetLinesToRemove=void 0,r.reflowLargerGetLinesToRemove=function(m,p,h,v,f){let w=[];for(let x=0;x<m.length-1;x++){let l=x,g=m.get(++l);if(!g.isWrapped)continue;let y=[m.get(x)];for(;l<m.length&&g.isWrapped;)y.push(g),g=m.get(++l);if(v>=x&&v<l){x+=y.length-1;continue}let b=0,k=a(y,b,p),E=1,A=0;for(;E<y.length;){let L=a(y,E,p),W=L-A,he=h-k,O=Math.min(W,he);y[b].copyCellsFrom(y[E],A,k,O,!1),k+=O,k===h&&(b++,k=0),A+=O,A===L&&(E++,A=0),k===0&&b!==0&&y[b-1].getWidth(h-1)===2&&(y[b].copyCellsFrom(y[b-1],h-1,k++,1,!1),y[b-1].setCell(h-1,f))}y[b].replaceCells(k,h,f);let B=0;for(let L=y.length-1;L>0&&(L>b||y[L].getTrimmedLength()===0);L--)B++;B>0&&(w.push(x+y.length-B),w.push(B)),x+=y.length-1}return w},r.reflowLargerCreateNewLayout=function(m,p){let h=[],v=0,f=p[v],w=0;for(let x=0;x<m.length;x++)if(f===x){let l=p[++v];m.onDeleteEmitter.fire({index:x-w,amount:l}),x+=l-1,w+=l,f=p[++v]}else h.push(x);return{layout:h,countRemoved:w}},r.reflowLargerApplyNewLayout=function(m,p){let h=[];for(let v=0;v<p.length;v++)h.push(m.get(p[v]));for(let v=0;v<h.length;v++)m.set(v,h[v]);m.length=p.length},r.reflowSmallerGetNewLineLengths=function(m,p,h){let v=[],f=m.map((g,y)=>a(m,y,p)).reduce((g,y)=>g+y),w=0,x=0,l=0;for(;l<f;){if(f-l<h){v.push(f-l);break}w+=h;let g=a(m,x,p);w>g&&(w-=g,x++);let y=m[x].getWidth(w-1)===2;y&&w--;let b=y?h-1:h;v.push(b),l+=b}return v},r.getWrappedLineTrimmedLength=a},295:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.BufferSet=void 0;let m=a(460),p=a(844),h=a(92);class v extends p.Disposable{constructor(w,x){super(),this._optionsService=w,this._bufferService=x,this._onBufferActivate=this.register(new m.EventEmitter),this.onBufferActivate=this._onBufferActivate.event,this.reset(),this.register(this._optionsService.onSpecificOptionChange("scrollback",()=>this.resize(this._bufferService.cols,this._bufferService.rows))),this.register(this._optionsService.onSpecificOptionChange("tabStopWidth",()=>this.setupTabStops()))}reset(){this._normal=new h.Buffer(!0,this._optionsService,this._bufferService),this._normal.fillViewportRows(),this._alt=new h.Buffer(!1,this._optionsService,this._bufferService),this._activeBuffer=this._normal,this._onBufferActivate.fire({activeBuffer:this._normal,inactiveBuffer:this._alt}),this.setupTabStops()}get alt(){return this._alt}get active(){return this._activeBuffer}get normal(){return this._normal}activateNormalBuffer(){this._activeBuffer!==this._normal&&(this._normal.x=this._alt.x,this._normal.y=this._alt.y,this._alt.clearAllMarkers(),this._alt.clear(),this._activeBuffer=this._normal,this._onBufferActivate.fire({activeBuffer:this._normal,inactiveBuffer:this._alt}))}activateAltBuffer(w){this._activeBuffer!==this._alt&&(this._alt.fillViewportRows(w),this._alt.x=this._normal.x,this._alt.y=this._normal.y,this._activeBuffer=this._alt,this._onBufferActivate.fire({activeBuffer:this._alt,inactiveBuffer:this._normal}))}resize(w,x){this._normal.resize(w,x),this._alt.resize(w,x),this.setupTabStops(w)}setupTabStops(w){this._normal.setupTabStops(w),this._alt.setupTabStops(w)}}r.BufferSet=v},511:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.CellData=void 0;let m=a(482),p=a(643),h=a(734);class v extends h.AttributeData{constructor(){super(...arguments),this.content=0,this.fg=0,this.bg=0,this.extended=new h.ExtendedAttrs,this.combinedData=""}static fromCharData(w){let x=new v;return x.setFromCharData(w),x}isCombined(){return 2097152&this.content}getWidth(){return this.content>>22}getChars(){return 2097152&this.content?this.combinedData:2097151&this.content?(0,m.stringFromCodePoint)(2097151&this.content):""}getCode(){return this.isCombined()?this.combinedData.charCodeAt(this.combinedData.length-1):2097151&this.content}setFromCharData(w){this.fg=w[p.CHAR_DATA_ATTR_INDEX],this.bg=0;let x=!1;if(w[p.CHAR_DATA_CHAR_INDEX].length>2)x=!0;else if(w[p.CHAR_DATA_CHAR_INDEX].length===2){let l=w[p.CHAR_DATA_CHAR_INDEX].charCodeAt(0);if(55296<=l&&l<=56319){let g=w[p.CHAR_DATA_CHAR_INDEX].charCodeAt(1);56320<=g&&g<=57343?this.content=1024*(l-55296)+g-56320+65536|w[p.CHAR_DATA_WIDTH_INDEX]<<22:x=!0}else x=!0}else this.content=w[p.CHAR_DATA_CHAR_INDEX].charCodeAt(0)|w[p.CHAR_DATA_WIDTH_INDEX]<<22;x&&(this.combinedData=w[p.CHAR_DATA_CHAR_INDEX],this.content=2097152|w[p.CHAR_DATA_WIDTH_INDEX]<<22)}getAsCharData(){return[this.fg,this.getChars(),this.getWidth(),this.getCode()]}}r.CellData=v},643:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.WHITESPACE_CELL_CODE=r.WHITESPACE_CELL_WIDTH=r.WHITESPACE_CELL_CHAR=r.NULL_CELL_CODE=r.NULL_CELL_WIDTH=r.NULL_CELL_CHAR=r.CHAR_DATA_CODE_INDEX=r.CHAR_DATA_WIDTH_INDEX=r.CHAR_DATA_CHAR_INDEX=r.CHAR_DATA_ATTR_INDEX=r.DEFAULT_EXT=r.DEFAULT_ATTR=r.DEFAULT_COLOR=void 0,r.DEFAULT_COLOR=0,r.DEFAULT_ATTR=256|r.DEFAULT_COLOR<<9,r.DEFAULT_EXT=0,r.CHAR_DATA_ATTR_INDEX=0,r.CHAR_DATA_CHAR_INDEX=1,r.CHAR_DATA_WIDTH_INDEX=2,r.CHAR_DATA_CODE_INDEX=3,r.NULL_CELL_CHAR="",r.NULL_CELL_WIDTH=1,r.NULL_CELL_CODE=0,r.WHITESPACE_CELL_CHAR=" ",r.WHITESPACE_CELL_WIDTH=1,r.WHITESPACE_CELL_CODE=32},863:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.Marker=void 0;let m=a(460),p=a(844);class h{get id(){return this._id}constructor(f){this.line=f,this.isDisposed=!1,this._disposables=[],this._id=h._nextId++,this._onDispose=this.register(new m.EventEmitter),this.onDispose=this._onDispose.event}dispose(){this.isDisposed||(this.isDisposed=!0,this.line=-1,this._onDispose.fire(),(0,p.disposeArray)(this._disposables),this._disposables.length=0)}register(f){return this._disposables.push(f),f}}r.Marker=h,h._nextId=1},116:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.DEFAULT_CHARSET=r.CHARSETS=void 0,r.CHARSETS={},r.DEFAULT_CHARSET=r.CHARSETS.B,r.CHARSETS[0]={"`":"\u25C6",a:"\u2592",b:"\u2409",c:"\u240C",d:"\u240D",e:"\u240A",f:"\xB0",g:"\xB1",h:"\u2424",i:"\u240B",j:"\u2518",k:"\u2510",l:"\u250C",m:"\u2514",n:"\u253C",o:"\u23BA",p:"\u23BB",q:"\u2500",r:"\u23BC",s:"\u23BD",t:"\u251C",u:"\u2524",v:"\u2534",w:"\u252C",x:"\u2502",y:"\u2264",z:"\u2265","{":"\u03C0","|":"\u2260","}":"\xA3","~":"\xB7"},r.CHARSETS.A={"#":"\xA3"},r.CHARSETS.B=void 0,r.CHARSETS[4]={"#":"\xA3","@":"\xBE","[":"ij","\\":"\xBD","]":"|","{":"\xA8","|":"f","}":"\xBC","~":"\xB4"},r.CHARSETS.C=r.CHARSETS[5]={"[":"\xC4","\\":"\xD6","]":"\xC5","^":"\xDC","`":"\xE9","{":"\xE4","|":"\xF6","}":"\xE5","~":"\xFC"},r.CHARSETS.R={"#":"\xA3","@":"\xE0","[":"\xB0","\\":"\xE7","]":"\xA7","{":"\xE9","|":"\xF9","}":"\xE8","~":"\xA8"},r.CHARSETS.Q={"@":"\xE0","[":"\xE2","\\":"\xE7","]":"\xEA","^":"\xEE","`":"\xF4","{":"\xE9","|":"\xF9","}":"\xE8","~":"\xFB"},r.CHARSETS.K={"@":"\xA7","[":"\xC4","\\":"\xD6","]":"\xDC","{":"\xE4","|":"\xF6","}":"\xFC","~":"\xDF"},r.CHARSETS.Y={"#":"\xA3","@":"\xA7","[":"\xB0","\\":"\xE7","]":"\xE9","`":"\xF9","{":"\xE0","|":"\xF2","}":"\xE8","~":"\xEC"},r.CHARSETS.E=r.CHARSETS[6]={"@":"\xC4","[":"\xC6","\\":"\xD8","]":"\xC5","^":"\xDC","`":"\xE4","{":"\xE6","|":"\xF8","}":"\xE5","~":"\xFC"},r.CHARSETS.Z={"#":"\xA3","@":"\xA7","[":"\xA1","\\":"\xD1","]":"\xBF","{":"\xB0","|":"\xF1","}":"\xE7"},r.CHARSETS.H=r.CHARSETS[7]={"@":"\xC9","[":"\xC4","\\":"\xD6","]":"\xC5","^":"\xDC","`":"\xE9","{":"\xE4","|":"\xF6","}":"\xE5","~":"\xFC"},r.CHARSETS["="]={"#":"\xF9","@":"\xE0","[":"\xE9","\\":"\xE7","]":"\xEA","^":"\xEE",_:"\xE8","`":"\xF4","{":"\xE4","|":"\xF6","}":"\xFC","~":"\xFB"}},584:(o,r)=>{var a,m,p;Object.defineProperty(r,"__esModule",{value:!0}),r.C1_ESCAPED=r.C1=r.C0=void 0,function(h){h.NUL="\0",h.SOH="",h.STX="",h.ETX="",h.EOT="",h.ENQ="",h.ACK="",h.BEL="\x07",h.BS="\b",h.HT="	",h.LF=`
`,h.VT="\v",h.FF="\f",h.CR="\r",h.SO="",h.SI="",h.DLE="",h.DC1="",h.DC2="",h.DC3="",h.DC4="",h.NAK="",h.SYN="",h.ETB="",h.CAN="",h.EM="",h.SUB="",h.ESC="\x1B",h.FS="",h.GS="",h.RS="",h.US="",h.SP=" ",h.DEL="\x7F"}(a||(r.C0=a={})),function(h){h.PAD="\x80",h.HOP="\x81",h.BPH="\x82",h.NBH="\x83",h.IND="\x84",h.NEL="\x85",h.SSA="\x86",h.ESA="\x87",h.HTS="\x88",h.HTJ="\x89",h.VTS="\x8A",h.PLD="\x8B",h.PLU="\x8C",h.RI="\x8D",h.SS2="\x8E",h.SS3="\x8F",h.DCS="\x90",h.PU1="\x91",h.PU2="\x92",h.STS="\x93",h.CCH="\x94",h.MW="\x95",h.SPA="\x96",h.EPA="\x97",h.SOS="\x98",h.SGCI="\x99",h.SCI="\x9A",h.CSI="\x9B",h.ST="\x9C",h.OSC="\x9D",h.PM="\x9E",h.APC="\x9F"}(m||(r.C1=m={})),function(h){h.ST=`${a.ESC}\\`}(p||(r.C1_ESCAPED=p={}))},482:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.Utf8ToUtf32=r.StringToUtf32=r.utf32ToString=r.stringFromCodePoint=void 0,r.stringFromCodePoint=function(a){return a>65535?(a-=65536,String.fromCharCode(55296+(a>>10))+String.fromCharCode(a%1024+56320)):String.fromCharCode(a)},r.utf32ToString=function(a,m=0,p=a.length){let h="";for(let v=m;v<p;++v){let f=a[v];f>65535?(f-=65536,h+=String.fromCharCode(55296+(f>>10))+String.fromCharCode(f%1024+56320)):h+=String.fromCharCode(f)}return h},r.StringToUtf32=class{constructor(){this._interim=0}clear(){this._interim=0}decode(a,m){let p=a.length;if(!p)return 0;let h=0,v=0;if(this._interim){let f=a.charCodeAt(v++);56320<=f&&f<=57343?m[h++]=1024*(this._interim-55296)+f-56320+65536:(m[h++]=this._interim,m[h++]=f),this._interim=0}for(let f=v;f<p;++f){let w=a.charCodeAt(f);if(55296<=w&&w<=56319){if(++f>=p)return this._interim=w,h;let x=a.charCodeAt(f);56320<=x&&x<=57343?m[h++]=1024*(w-55296)+x-56320+65536:(m[h++]=w,m[h++]=x)}else w!==65279&&(m[h++]=w)}return h}},r.Utf8ToUtf32=class{constructor(){this.interim=new Uint8Array(3)}clear(){this.interim.fill(0)}decode(a,m){let p=a.length;if(!p)return 0;let h,v,f,w,x=0,l=0,g=0;if(this.interim[0]){let k=!1,E=this.interim[0];E&=(224&E)==192?31:(240&E)==224?15:7;let A,B=0;for(;(A=63&this.interim[++B])&&B<4;)E<<=6,E|=A;let L=(224&this.interim[0])==192?2:(240&this.interim[0])==224?3:4,W=L-B;for(;g<W;){if(g>=p)return 0;if(A=a[g++],(192&A)!=128){g--,k=!0;break}this.interim[B++]=A,E<<=6,E|=63&A}k||(L===2?E<128?g--:m[x++]=E:L===3?E<2048||E>=55296&&E<=57343||E===65279||(m[x++]=E):E<65536||E>1114111||(m[x++]=E)),this.interim.fill(0)}let y=p-4,b=g;for(;b<p;){for(;!(!(b<y)||128&(h=a[b])||128&(v=a[b+1])||128&(f=a[b+2])||128&(w=a[b+3]));)m[x++]=h,m[x++]=v,m[x++]=f,m[x++]=w,b+=4;if(h=a[b++],h<128)m[x++]=h;else if((224&h)==192){if(b>=p)return this.interim[0]=h,x;if(v=a[b++],(192&v)!=128){b--;continue}if(l=(31&h)<<6|63&v,l<128){b--;continue}m[x++]=l}else if((240&h)==224){if(b>=p)return this.interim[0]=h,x;if(v=a[b++],(192&v)!=128){b--;continue}if(b>=p)return this.interim[0]=h,this.interim[1]=v,x;if(f=a[b++],(192&f)!=128){b--;continue}if(l=(15&h)<<12|(63&v)<<6|63&f,l<2048||l>=55296&&l<=57343||l===65279)continue;m[x++]=l}else if((248&h)==240){if(b>=p)return this.interim[0]=h,x;if(v=a[b++],(192&v)!=128){b--;continue}if(b>=p)return this.interim[0]=h,this.interim[1]=v,x;if(f=a[b++],(192&f)!=128){b--;continue}if(b>=p)return this.interim[0]=h,this.interim[1]=v,this.interim[2]=f,x;if(w=a[b++],(192&w)!=128){b--;continue}if(l=(7&h)<<18|(63&v)<<12|(63&f)<<6|63&w,l<65536||l>1114111)continue;m[x++]=l}}return x}}},225:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.UnicodeV6=void 0;let m=a(480),p=[[768,879],[1155,1158],[1160,1161],[1425,1469],[1471,1471],[1473,1474],[1476,1477],[1479,1479],[1536,1539],[1552,1557],[1611,1630],[1648,1648],[1750,1764],[1767,1768],[1770,1773],[1807,1807],[1809,1809],[1840,1866],[1958,1968],[2027,2035],[2305,2306],[2364,2364],[2369,2376],[2381,2381],[2385,2388],[2402,2403],[2433,2433],[2492,2492],[2497,2500],[2509,2509],[2530,2531],[2561,2562],[2620,2620],[2625,2626],[2631,2632],[2635,2637],[2672,2673],[2689,2690],[2748,2748],[2753,2757],[2759,2760],[2765,2765],[2786,2787],[2817,2817],[2876,2876],[2879,2879],[2881,2883],[2893,2893],[2902,2902],[2946,2946],[3008,3008],[3021,3021],[3134,3136],[3142,3144],[3146,3149],[3157,3158],[3260,3260],[3263,3263],[3270,3270],[3276,3277],[3298,3299],[3393,3395],[3405,3405],[3530,3530],[3538,3540],[3542,3542],[3633,3633],[3636,3642],[3655,3662],[3761,3761],[3764,3769],[3771,3772],[3784,3789],[3864,3865],[3893,3893],[3895,3895],[3897,3897],[3953,3966],[3968,3972],[3974,3975],[3984,3991],[3993,4028],[4038,4038],[4141,4144],[4146,4146],[4150,4151],[4153,4153],[4184,4185],[4448,4607],[4959,4959],[5906,5908],[5938,5940],[5970,5971],[6002,6003],[6068,6069],[6071,6077],[6086,6086],[6089,6099],[6109,6109],[6155,6157],[6313,6313],[6432,6434],[6439,6440],[6450,6450],[6457,6459],[6679,6680],[6912,6915],[6964,6964],[6966,6970],[6972,6972],[6978,6978],[7019,7027],[7616,7626],[7678,7679],[8203,8207],[8234,8238],[8288,8291],[8298,8303],[8400,8431],[12330,12335],[12441,12442],[43014,43014],[43019,43019],[43045,43046],[64286,64286],[65024,65039],[65056,65059],[65279,65279],[65529,65531]],h=[[68097,68099],[68101,68102],[68108,68111],[68152,68154],[68159,68159],[119143,119145],[119155,119170],[119173,119179],[119210,119213],[119362,119364],[917505,917505],[917536,917631],[917760,917999]],v;r.UnicodeV6=class{constructor(){if(this.version="6",!v){v=new Uint8Array(65536),v.fill(1),v[0]=0,v.fill(0,1,32),v.fill(0,127,160),v.fill(2,4352,4448),v[9001]=2,v[9002]=2,v.fill(2,11904,42192),v[12351]=1,v.fill(2,44032,55204),v.fill(2,63744,64256),v.fill(2,65040,65050),v.fill(2,65072,65136),v.fill(2,65280,65377),v.fill(2,65504,65511);for(let f=0;f<p.length;++f)v.fill(0,p[f][0],p[f][1]+1)}}wcwidth(f){return f<32?0:f<127?1:f<65536?v[f]:function(w,x){let l,g=0,y=x.length-1;if(w<x[0][0]||w>x[y][1])return!1;for(;y>=g;)if(l=g+y>>1,w>x[l][1])g=l+1;else{if(!(w<x[l][0]))return!0;y=l-1}return!1}(f,h)?0:f>=131072&&f<=196605||f>=196608&&f<=262141?2:1}charProperties(f,w){let x=this.wcwidth(f),l=x===0&&w!==0;if(l){let g=m.UnicodeService.extractWidth(w);g===0?l=!1:g>x&&(x=g)}return m.UnicodeService.createPropertyValue(0,x,l)}}},981:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.WriteBuffer=void 0;let m=a(460),p=a(844);class h extends p.Disposable{constructor(f){super(),this._action=f,this._writeBuffer=[],this._callbacks=[],this._pendingData=0,this._bufferOffset=0,this._isSyncWriting=!1,this._syncCalls=0,this._didUserInput=!1,this._onWriteParsed=this.register(new m.EventEmitter),this.onWriteParsed=this._onWriteParsed.event}handleUserInput(){this._didUserInput=!0}writeSync(f,w){if(w!==void 0&&this._syncCalls>w)return void(this._syncCalls=0);if(this._pendingData+=f.length,this._writeBuffer.push(f),this._callbacks.push(void 0),this._syncCalls++,this._isSyncWriting)return;let x;for(this._isSyncWriting=!0;x=this._writeBuffer.shift();){this._action(x);let l=this._callbacks.shift();l&&l()}this._pendingData=0,this._bufferOffset=2147483647,this._isSyncWriting=!1,this._syncCalls=0}write(f,w){if(this._pendingData>5e7)throw new Error("write data discarded, use flow control to avoid losing data");if(!this._writeBuffer.length){if(this._bufferOffset=0,this._didUserInput)return this._didUserInput=!1,this._pendingData+=f.length,this._writeBuffer.push(f),this._callbacks.push(w),void this._innerWrite();setTimeout(()=>this._innerWrite())}this._pendingData+=f.length,this._writeBuffer.push(f),this._callbacks.push(w)}_innerWrite(f=0,w=!0){let x=f||Date.now();for(;this._writeBuffer.length>this._bufferOffset;){let l=this._writeBuffer[this._bufferOffset],g=this._action(l,w);if(g){let b=k=>Date.now()-x>=12?setTimeout(()=>this._innerWrite(0,k)):this._innerWrite(x,k);return void g.catch(k=>(queueMicrotask(()=>{throw k}),Promise.resolve(!1))).then(b)}let y=this._callbacks[this._bufferOffset];if(y&&y(),this._bufferOffset++,this._pendingData-=l.length,Date.now()-x>=12)break}this._writeBuffer.length>this._bufferOffset?(this._bufferOffset>50&&(this._writeBuffer=this._writeBuffer.slice(this._bufferOffset),this._callbacks=this._callbacks.slice(this._bufferOffset),this._bufferOffset=0),setTimeout(()=>this._innerWrite())):(this._writeBuffer.length=0,this._callbacks.length=0,this._pendingData=0,this._bufferOffset=0),this._onWriteParsed.fire()}}r.WriteBuffer=h},941:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.toRgbString=r.parseColor=void 0;let a=/^([\da-f])\/([\da-f])\/([\da-f])$|^([\da-f]{2})\/([\da-f]{2})\/([\da-f]{2})$|^([\da-f]{3})\/([\da-f]{3})\/([\da-f]{3})$|^([\da-f]{4})\/([\da-f]{4})\/([\da-f]{4})$/,m=/^[\da-f]+$/;function p(h,v){let f=h.toString(16),w=f.length<2?"0"+f:f;switch(v){case 4:return f[0];case 8:return w;case 12:return(w+w).slice(0,3);default:return w+w}}r.parseColor=function(h){if(!h)return;let v=h.toLowerCase();if(v.indexOf("rgb:")===0){v=v.slice(4);let f=a.exec(v);if(f){let w=f[1]?15:f[4]?255:f[7]?4095:65535;return[Math.round(parseInt(f[1]||f[4]||f[7]||f[10],16)/w*255),Math.round(parseInt(f[2]||f[5]||f[8]||f[11],16)/w*255),Math.round(parseInt(f[3]||f[6]||f[9]||f[12],16)/w*255)]}}else if(v.indexOf("#")===0&&(v=v.slice(1),m.exec(v)&&[3,6,9,12].includes(v.length))){let f=v.length/3,w=[0,0,0];for(let x=0;x<3;++x){let l=parseInt(v.slice(f*x,f*x+f),16);w[x]=f===1?l<<4:f===2?l:f===3?l>>4:l>>8}return w}},r.toRgbString=function(h,v=16){let[f,w,x]=h;return`rgb:${p(f,v)}/${p(w,v)}/${p(x,v)}`}},770:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.PAYLOAD_LIMIT=void 0,r.PAYLOAD_LIMIT=1e7},351:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.DcsHandler=r.DcsParser=void 0;let m=a(482),p=a(742),h=a(770),v=[];r.DcsParser=class{constructor(){this._handlers=Object.create(null),this._active=v,this._ident=0,this._handlerFb=()=>{},this._stack={paused:!1,loopPosition:0,fallThrough:!1}}dispose(){this._handlers=Object.create(null),this._handlerFb=()=>{},this._active=v}registerHandler(w,x){this._handlers[w]===void 0&&(this._handlers[w]=[]);let l=this._handlers[w];return l.push(x),{dispose:()=>{let g=l.indexOf(x);g!==-1&&l.splice(g,1)}}}clearHandler(w){this._handlers[w]&&delete this._handlers[w]}setHandlerFallback(w){this._handlerFb=w}reset(){if(this._active.length)for(let w=this._stack.paused?this._stack.loopPosition-1:this._active.length-1;w>=0;--w)this._active[w].unhook(!1);this._stack.paused=!1,this._active=v,this._ident=0}hook(w,x){if(this.reset(),this._ident=w,this._active=this._handlers[w]||v,this._active.length)for(let l=this._active.length-1;l>=0;l--)this._active[l].hook(x);else this._handlerFb(this._ident,"HOOK",x)}put(w,x,l){if(this._active.length)for(let g=this._active.length-1;g>=0;g--)this._active[g].put(w,x,l);else this._handlerFb(this._ident,"PUT",(0,m.utf32ToString)(w,x,l))}unhook(w,x=!0){if(this._active.length){let l=!1,g=this._active.length-1,y=!1;if(this._stack.paused&&(g=this._stack.loopPosition-1,l=x,y=this._stack.fallThrough,this._stack.paused=!1),!y&&l===!1){for(;g>=0&&(l=this._active[g].unhook(w),l!==!0);g--)if(l instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=g,this._stack.fallThrough=!1,l;g--}for(;g>=0;g--)if(l=this._active[g].unhook(!1),l instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=g,this._stack.fallThrough=!0,l}else this._handlerFb(this._ident,"UNHOOK",w);this._active=v,this._ident=0}};let f=new p.Params;f.addParam(0),r.DcsHandler=class{constructor(w){this._handler=w,this._data="",this._params=f,this._hitLimit=!1}hook(w){this._params=w.length>1||w.params[0]?w.clone():f,this._data="",this._hitLimit=!1}put(w,x,l){this._hitLimit||(this._data+=(0,m.utf32ToString)(w,x,l),this._data.length>h.PAYLOAD_LIMIT&&(this._data="",this._hitLimit=!0))}unhook(w){let x=!1;if(this._hitLimit)x=!1;else if(w&&(x=this._handler(this._data,this._params),x instanceof Promise))return x.then(l=>(this._params=f,this._data="",this._hitLimit=!1,l));return this._params=f,this._data="",this._hitLimit=!1,x}}},15:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.EscapeSequenceParser=r.VT500_TRANSITION_TABLE=r.TransitionTable=void 0;let m=a(844),p=a(742),h=a(242),v=a(351);class f{constructor(g){this.table=new Uint8Array(g)}setDefault(g,y){this.table.fill(g<<4|y)}add(g,y,b,k){this.table[y<<8|g]=b<<4|k}addMany(g,y,b,k){for(let E=0;E<g.length;E++)this.table[y<<8|g[E]]=b<<4|k}}r.TransitionTable=f;let w=160;r.VT500_TRANSITION_TABLE=function(){let l=new f(4095),g=Array.apply(null,Array(256)).map((B,L)=>L),y=(B,L)=>g.slice(B,L),b=y(32,127),k=y(0,24);k.push(25),k.push.apply(k,y(28,32));let E=y(0,14),A;for(A in l.setDefault(1,0),l.addMany(b,0,2,0),E)l.addMany([24,26,153,154],A,3,0),l.addMany(y(128,144),A,3,0),l.addMany(y(144,152),A,3,0),l.add(156,A,0,0),l.add(27,A,11,1),l.add(157,A,4,8),l.addMany([152,158,159],A,0,7),l.add(155,A,11,3),l.add(144,A,11,9);return l.addMany(k,0,3,0),l.addMany(k,1,3,1),l.add(127,1,0,1),l.addMany(k,8,0,8),l.addMany(k,3,3,3),l.add(127,3,0,3),l.addMany(k,4,3,4),l.add(127,4,0,4),l.addMany(k,6,3,6),l.addMany(k,5,3,5),l.add(127,5,0,5),l.addMany(k,2,3,2),l.add(127,2,0,2),l.add(93,1,4,8),l.addMany(b,8,5,8),l.add(127,8,5,8),l.addMany([156,27,24,26,7],8,6,0),l.addMany(y(28,32),8,0,8),l.addMany([88,94,95],1,0,7),l.addMany(b,7,0,7),l.addMany(k,7,0,7),l.add(156,7,0,0),l.add(127,7,0,7),l.add(91,1,11,3),l.addMany(y(64,127),3,7,0),l.addMany(y(48,60),3,8,4),l.addMany([60,61,62,63],3,9,4),l.addMany(y(48,60),4,8,4),l.addMany(y(64,127),4,7,0),l.addMany([60,61,62,63],4,0,6),l.addMany(y(32,64),6,0,6),l.add(127,6,0,6),l.addMany(y(64,127),6,0,0),l.addMany(y(32,48),3,9,5),l.addMany(y(32,48),5,9,5),l.addMany(y(48,64),5,0,6),l.addMany(y(64,127),5,7,0),l.addMany(y(32,48),4,9,5),l.addMany(y(32,48),1,9,2),l.addMany(y(32,48),2,9,2),l.addMany(y(48,127),2,10,0),l.addMany(y(48,80),1,10,0),l.addMany(y(81,88),1,10,0),l.addMany([89,90,92],1,10,0),l.addMany(y(96,127),1,10,0),l.add(80,1,11,9),l.addMany(k,9,0,9),l.add(127,9,0,9),l.addMany(y(28,32),9,0,9),l.addMany(y(32,48),9,9,12),l.addMany(y(48,60),9,8,10),l.addMany([60,61,62,63],9,9,10),l.addMany(k,11,0,11),l.addMany(y(32,128),11,0,11),l.addMany(y(28,32),11,0,11),l.addMany(k,10,0,10),l.add(127,10,0,10),l.addMany(y(28,32),10,0,10),l.addMany(y(48,60),10,8,10),l.addMany([60,61,62,63],10,0,11),l.addMany(y(32,48),10,9,12),l.addMany(k,12,0,12),l.add(127,12,0,12),l.addMany(y(28,32),12,0,12),l.addMany(y(32,48),12,9,12),l.addMany(y(48,64),12,0,11),l.addMany(y(64,127),12,12,13),l.addMany(y(64,127),10,12,13),l.addMany(y(64,127),9,12,13),l.addMany(k,13,13,13),l.addMany(b,13,13,13),l.add(127,13,0,13),l.addMany([27,156,24,26],13,14,0),l.add(w,0,2,0),l.add(w,8,5,8),l.add(w,6,0,6),l.add(w,11,0,11),l.add(w,13,13,13),l}();class x extends m.Disposable{constructor(g=r.VT500_TRANSITION_TABLE){super(),this._transitions=g,this._parseStack={state:0,handlers:[],handlerPos:0,transition:0,chunkPos:0},this.initialState=0,this.currentState=this.initialState,this._params=new p.Params,this._params.addParam(0),this._collect=0,this.precedingJoinState=0,this._printHandlerFb=(y,b,k)=>{},this._executeHandlerFb=y=>{},this._csiHandlerFb=(y,b)=>{},this._escHandlerFb=y=>{},this._errorHandlerFb=y=>y,this._printHandler=this._printHandlerFb,this._executeHandlers=Object.create(null),this._csiHandlers=Object.create(null),this._escHandlers=Object.create(null),this.register((0,m.toDisposable)(()=>{this._csiHandlers=Object.create(null),this._executeHandlers=Object.create(null),this._escHandlers=Object.create(null)})),this._oscParser=this.register(new h.OscParser),this._dcsParser=this.register(new v.DcsParser),this._errorHandler=this._errorHandlerFb,this.registerEscHandler({final:"\\"},()=>!0)}_identifier(g,y=[64,126]){let b=0;if(g.prefix){if(g.prefix.length>1)throw new Error("only one byte as prefix supported");if(b=g.prefix.charCodeAt(0),b&&60>b||b>63)throw new Error("prefix must be in range 0x3c .. 0x3f")}if(g.intermediates){if(g.intermediates.length>2)throw new Error("only two bytes as intermediates are supported");for(let E=0;E<g.intermediates.length;++E){let A=g.intermediates.charCodeAt(E);if(32>A||A>47)throw new Error("intermediate must be in range 0x20 .. 0x2f");b<<=8,b|=A}}if(g.final.length!==1)throw new Error("final must be a single byte");let k=g.final.charCodeAt(0);if(y[0]>k||k>y[1])throw new Error(`final must be in range ${y[0]} .. ${y[1]}`);return b<<=8,b|=k,b}identToString(g){let y=[];for(;g;)y.push(String.fromCharCode(255&g)),g>>=8;return y.reverse().join("")}setPrintHandler(g){this._printHandler=g}clearPrintHandler(){this._printHandler=this._printHandlerFb}registerEscHandler(g,y){let b=this._identifier(g,[48,126]);this._escHandlers[b]===void 0&&(this._escHandlers[b]=[]);let k=this._escHandlers[b];return k.push(y),{dispose:()=>{let E=k.indexOf(y);E!==-1&&k.splice(E,1)}}}clearEscHandler(g){this._escHandlers[this._identifier(g,[48,126])]&&delete this._escHandlers[this._identifier(g,[48,126])]}setEscHandlerFallback(g){this._escHandlerFb=g}setExecuteHandler(g,y){this._executeHandlers[g.charCodeAt(0)]=y}clearExecuteHandler(g){this._executeHandlers[g.charCodeAt(0)]&&delete this._executeHandlers[g.charCodeAt(0)]}setExecuteHandlerFallback(g){this._executeHandlerFb=g}registerCsiHandler(g,y){let b=this._identifier(g);this._csiHandlers[b]===void 0&&(this._csiHandlers[b]=[]);let k=this._csiHandlers[b];return k.push(y),{dispose:()=>{let E=k.indexOf(y);E!==-1&&k.splice(E,1)}}}clearCsiHandler(g){this._csiHandlers[this._identifier(g)]&&delete this._csiHandlers[this._identifier(g)]}setCsiHandlerFallback(g){this._csiHandlerFb=g}registerDcsHandler(g,y){return this._dcsParser.registerHandler(this._identifier(g),y)}clearDcsHandler(g){this._dcsParser.clearHandler(this._identifier(g))}setDcsHandlerFallback(g){this._dcsParser.setHandlerFallback(g)}registerOscHandler(g,y){return this._oscParser.registerHandler(g,y)}clearOscHandler(g){this._oscParser.clearHandler(g)}setOscHandlerFallback(g){this._oscParser.setHandlerFallback(g)}setErrorHandler(g){this._errorHandler=g}clearErrorHandler(){this._errorHandler=this._errorHandlerFb}reset(){this.currentState=this.initialState,this._oscParser.reset(),this._dcsParser.reset(),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingJoinState=0,this._parseStack.state!==0&&(this._parseStack.state=2,this._parseStack.handlers=[])}_preserveStack(g,y,b,k,E){this._parseStack.state=g,this._parseStack.handlers=y,this._parseStack.handlerPos=b,this._parseStack.transition=k,this._parseStack.chunkPos=E}parse(g,y,b){let k,E=0,A=0,B=0;if(this._parseStack.state)if(this._parseStack.state===2)this._parseStack.state=0,B=this._parseStack.chunkPos+1;else{if(b===void 0||this._parseStack.state===1)throw this._parseStack.state=1,new Error("improper continuation due to previous async handler, giving up parsing");let L=this._parseStack.handlers,W=this._parseStack.handlerPos-1;switch(this._parseStack.state){case 3:if(b===!1&&W>-1){for(;W>=0&&(k=L[W](this._params),k!==!0);W--)if(k instanceof Promise)return this._parseStack.handlerPos=W,k}this._parseStack.handlers=[];break;case 4:if(b===!1&&W>-1){for(;W>=0&&(k=L[W](),k!==!0);W--)if(k instanceof Promise)return this._parseStack.handlerPos=W,k}this._parseStack.handlers=[];break;case 6:if(E=g[this._parseStack.chunkPos],k=this._dcsParser.unhook(E!==24&&E!==26,b),k)return k;E===27&&(this._parseStack.transition|=1),this._params.reset(),this._params.addParam(0),this._collect=0;break;case 5:if(E=g[this._parseStack.chunkPos],k=this._oscParser.end(E!==24&&E!==26,b),k)return k;E===27&&(this._parseStack.transition|=1),this._params.reset(),this._params.addParam(0),this._collect=0}this._parseStack.state=0,B=this._parseStack.chunkPos+1,this.precedingJoinState=0,this.currentState=15&this._parseStack.transition}for(let L=B;L<y;++L){switch(E=g[L],A=this._transitions.table[this.currentState<<8|(E<160?E:w)],A>>4){case 2:for(let U=L+1;;++U){if(U>=y||(E=g[U])<32||E>126&&E<w){this._printHandler(g,L,U),L=U-1;break}if(++U>=y||(E=g[U])<32||E>126&&E<w){this._printHandler(g,L,U),L=U-1;break}if(++U>=y||(E=g[U])<32||E>126&&E<w){this._printHandler(g,L,U),L=U-1;break}if(++U>=y||(E=g[U])<32||E>126&&E<w){this._printHandler(g,L,U),L=U-1;break}}break;case 3:this._executeHandlers[E]?this._executeHandlers[E]():this._executeHandlerFb(E),this.precedingJoinState=0;break;case 0:break;case 1:if(this._errorHandler({position:L,code:E,currentState:this.currentState,collect:this._collect,params:this._params,abort:!1}).abort)return;break;case 7:let W=this._csiHandlers[this._collect<<8|E],he=W?W.length-1:-1;for(;he>=0&&(k=W[he](this._params),k!==!0);he--)if(k instanceof Promise)return this._preserveStack(3,W,he,A,L),k;he<0&&this._csiHandlerFb(this._collect<<8|E,this._params),this.precedingJoinState=0;break;case 8:do switch(E){case 59:this._params.addParam(0);break;case 58:this._params.addSubParam(-1);break;default:this._params.addDigit(E-48)}while(++L<y&&(E=g[L])>47&&E<60);L--;break;case 9:this._collect<<=8,this._collect|=E;break;case 10:let O=this._escHandlers[this._collect<<8|E],F=O?O.length-1:-1;for(;F>=0&&(k=O[F](),k!==!0);F--)if(k instanceof Promise)return this._preserveStack(4,O,F,A,L),k;F<0&&this._escHandlerFb(this._collect<<8|E),this.precedingJoinState=0;break;case 11:this._params.reset(),this._params.addParam(0),this._collect=0;break;case 12:this._dcsParser.hook(this._collect<<8|E,this._params);break;case 13:for(let U=L+1;;++U)if(U>=y||(E=g[U])===24||E===26||E===27||E>127&&E<w){this._dcsParser.put(g,L,U),L=U-1;break}break;case 14:if(k=this._dcsParser.unhook(E!==24&&E!==26),k)return this._preserveStack(6,[],0,A,L),k;E===27&&(A|=1),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingJoinState=0;break;case 4:this._oscParser.start();break;case 5:for(let U=L+1;;U++)if(U>=y||(E=g[U])<32||E>127&&E<w){this._oscParser.put(g,L,U),L=U-1;break}break;case 6:if(k=this._oscParser.end(E!==24&&E!==26),k)return this._preserveStack(5,[],0,A,L),k;E===27&&(A|=1),this._params.reset(),this._params.addParam(0),this._collect=0,this.precedingJoinState=0}this.currentState=15&A}}}r.EscapeSequenceParser=x},242:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.OscHandler=r.OscParser=void 0;let m=a(770),p=a(482),h=[];r.OscParser=class{constructor(){this._state=0,this._active=h,this._id=-1,this._handlers=Object.create(null),this._handlerFb=()=>{},this._stack={paused:!1,loopPosition:0,fallThrough:!1}}registerHandler(v,f){this._handlers[v]===void 0&&(this._handlers[v]=[]);let w=this._handlers[v];return w.push(f),{dispose:()=>{let x=w.indexOf(f);x!==-1&&w.splice(x,1)}}}clearHandler(v){this._handlers[v]&&delete this._handlers[v]}setHandlerFallback(v){this._handlerFb=v}dispose(){this._handlers=Object.create(null),this._handlerFb=()=>{},this._active=h}reset(){if(this._state===2)for(let v=this._stack.paused?this._stack.loopPosition-1:this._active.length-1;v>=0;--v)this._active[v].end(!1);this._stack.paused=!1,this._active=h,this._id=-1,this._state=0}_start(){if(this._active=this._handlers[this._id]||h,this._active.length)for(let v=this._active.length-1;v>=0;v--)this._active[v].start();else this._handlerFb(this._id,"START")}_put(v,f,w){if(this._active.length)for(let x=this._active.length-1;x>=0;x--)this._active[x].put(v,f,w);else this._handlerFb(this._id,"PUT",(0,p.utf32ToString)(v,f,w))}start(){this.reset(),this._state=1}put(v,f,w){if(this._state!==3){if(this._state===1)for(;f<w;){let x=v[f++];if(x===59){this._state=2,this._start();break}if(x<48||57<x)return void(this._state=3);this._id===-1&&(this._id=0),this._id=10*this._id+x-48}this._state===2&&w-f>0&&this._put(v,f,w)}}end(v,f=!0){if(this._state!==0){if(this._state!==3)if(this._state===1&&this._start(),this._active.length){let w=!1,x=this._active.length-1,l=!1;if(this._stack.paused&&(x=this._stack.loopPosition-1,w=f,l=this._stack.fallThrough,this._stack.paused=!1),!l&&w===!1){for(;x>=0&&(w=this._active[x].end(v),w!==!0);x--)if(w instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=x,this._stack.fallThrough=!1,w;x--}for(;x>=0;x--)if(w=this._active[x].end(!1),w instanceof Promise)return this._stack.paused=!0,this._stack.loopPosition=x,this._stack.fallThrough=!0,w}else this._handlerFb(this._id,"END",v);this._active=h,this._id=-1,this._state=0}}},r.OscHandler=class{constructor(v){this._handler=v,this._data="",this._hitLimit=!1}start(){this._data="",this._hitLimit=!1}put(v,f,w){this._hitLimit||(this._data+=(0,p.utf32ToString)(v,f,w),this._data.length>m.PAYLOAD_LIMIT&&(this._data="",this._hitLimit=!0))}end(v){let f=!1;if(this._hitLimit)f=!1;else if(v&&(f=this._handler(this._data),f instanceof Promise))return f.then(w=>(this._data="",this._hitLimit=!1,w));return this._data="",this._hitLimit=!1,f}}},742:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.Params=void 0;let a=2147483647;class m{static fromArray(h){let v=new m;if(!h.length)return v;for(let f=Array.isArray(h[0])?1:0;f<h.length;++f){let w=h[f];if(Array.isArray(w))for(let x=0;x<w.length;++x)v.addSubParam(w[x]);else v.addParam(w)}return v}constructor(h=32,v=32){if(this.maxLength=h,this.maxSubParamsLength=v,v>256)throw new Error("maxSubParamsLength must not be greater than 256");this.params=new Int32Array(h),this.length=0,this._subParams=new Int32Array(v),this._subParamsLength=0,this._subParamsIdx=new Uint16Array(h),this._rejectDigits=!1,this._rejectSubDigits=!1,this._digitIsSub=!1}clone(){let h=new m(this.maxLength,this.maxSubParamsLength);return h.params.set(this.params),h.length=this.length,h._subParams.set(this._subParams),h._subParamsLength=this._subParamsLength,h._subParamsIdx.set(this._subParamsIdx),h._rejectDigits=this._rejectDigits,h._rejectSubDigits=this._rejectSubDigits,h._digitIsSub=this._digitIsSub,h}toArray(){let h=[];for(let v=0;v<this.length;++v){h.push(this.params[v]);let f=this._subParamsIdx[v]>>8,w=255&this._subParamsIdx[v];w-f>0&&h.push(Array.prototype.slice.call(this._subParams,f,w))}return h}reset(){this.length=0,this._subParamsLength=0,this._rejectDigits=!1,this._rejectSubDigits=!1,this._digitIsSub=!1}addParam(h){if(this._digitIsSub=!1,this.length>=this.maxLength)this._rejectDigits=!0;else{if(h<-1)throw new Error("values lesser than -1 are not allowed");this._subParamsIdx[this.length]=this._subParamsLength<<8|this._subParamsLength,this.params[this.length++]=h>a?a:h}}addSubParam(h){if(this._digitIsSub=!0,this.length)if(this._rejectDigits||this._subParamsLength>=this.maxSubParamsLength)this._rejectSubDigits=!0;else{if(h<-1)throw new Error("values lesser than -1 are not allowed");this._subParams[this._subParamsLength++]=h>a?a:h,this._subParamsIdx[this.length-1]++}}hasSubParams(h){return(255&this._subParamsIdx[h])-(this._subParamsIdx[h]>>8)>0}getSubParams(h){let v=this._subParamsIdx[h]>>8,f=255&this._subParamsIdx[h];return f-v>0?this._subParams.subarray(v,f):null}getSubParamsAll(){let h={};for(let v=0;v<this.length;++v){let f=this._subParamsIdx[v]>>8,w=255&this._subParamsIdx[v];w-f>0&&(h[v]=this._subParams.slice(f,w))}return h}addDigit(h){let v;if(this._rejectDigits||!(v=this._digitIsSub?this._subParamsLength:this.length)||this._digitIsSub&&this._rejectSubDigits)return;let f=this._digitIsSub?this._subParams:this.params,w=f[v-1];f[v-1]=~w?Math.min(10*w+h,a):h}}r.Params=m},741:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.AddonManager=void 0,r.AddonManager=class{constructor(){this._addons=[]}dispose(){for(let a=this._addons.length-1;a>=0;a--)this._addons[a].instance.dispose()}loadAddon(a,m){let p={instance:m,dispose:m.dispose,isDisposed:!1};this._addons.push(p),m.dispose=()=>this._wrappedAddonDispose(p),m.activate(a)}_wrappedAddonDispose(a){if(a.isDisposed)return;let m=-1;for(let p=0;p<this._addons.length;p++)if(this._addons[p]===a){m=p;break}if(m===-1)throw new Error("Could not dispose an addon that has not been loaded");a.isDisposed=!0,a.dispose.apply(a.instance),this._addons.splice(m,1)}}},771:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.BufferApiView=void 0;let m=a(785),p=a(511);r.BufferApiView=class{constructor(h,v){this._buffer=h,this.type=v}init(h){return this._buffer=h,this}get cursorY(){return this._buffer.y}get cursorX(){return this._buffer.x}get viewportY(){return this._buffer.ydisp}get baseY(){return this._buffer.ybase}get length(){return this._buffer.lines.length}getLine(h){let v=this._buffer.lines.get(h);if(v)return new m.BufferLineApiView(v)}getNullCell(){return new p.CellData}}},785:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.BufferLineApiView=void 0;let m=a(511);r.BufferLineApiView=class{constructor(p){this._line=p}get isWrapped(){return this._line.isWrapped}get length(){return this._line.length}getCell(p,h){if(!(p<0||p>=this._line.length))return h?(this._line.loadCell(p,h),h):this._line.loadCell(p,new m.CellData)}translateToString(p,h,v){return this._line.translateToString(p,h,v)}}},285:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.BufferNamespaceApi=void 0;let m=a(771),p=a(460),h=a(844);class v extends h.Disposable{constructor(w){super(),this._core=w,this._onBufferChange=this.register(new p.EventEmitter),this.onBufferChange=this._onBufferChange.event,this._normal=new m.BufferApiView(this._core.buffers.normal,"normal"),this._alternate=new m.BufferApiView(this._core.buffers.alt,"alternate"),this._core.buffers.onBufferActivate(()=>this._onBufferChange.fire(this.active))}get active(){if(this._core.buffers.active===this._core.buffers.normal)return this.normal;if(this._core.buffers.active===this._core.buffers.alt)return this.alternate;throw new Error("Active buffer is neither normal nor alternate")}get normal(){return this._normal.init(this._core.buffers.normal)}get alternate(){return this._alternate.init(this._core.buffers.alt)}}r.BufferNamespaceApi=v},975:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.ParserApi=void 0,r.ParserApi=class{constructor(a){this._core=a}registerCsiHandler(a,m){return this._core.registerCsiHandler(a,p=>m(p.toArray()))}addCsiHandler(a,m){return this.registerCsiHandler(a,m)}registerDcsHandler(a,m){return this._core.registerDcsHandler(a,(p,h)=>m(p,h.toArray()))}addDcsHandler(a,m){return this.registerDcsHandler(a,m)}registerEscHandler(a,m){return this._core.registerEscHandler(a,m)}addEscHandler(a,m){return this.registerEscHandler(a,m)}registerOscHandler(a,m){return this._core.registerOscHandler(a,m)}addOscHandler(a,m){return this.registerOscHandler(a,m)}}},90:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.UnicodeApi=void 0,r.UnicodeApi=class{constructor(a){this._core=a}register(a){this._core.unicodeService.register(a)}get versions(){return this._core.unicodeService.versions}get activeVersion(){return this._core.unicodeService.activeVersion}set activeVersion(a){this._core.unicodeService.activeVersion=a}}},744:function(o,r,a){var m=this&&this.__decorate||function(l,g,y,b){var k,E=arguments.length,A=E<3?g:b===null?b=Object.getOwnPropertyDescriptor(g,y):b;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")A=Reflect.decorate(l,g,y,b);else for(var B=l.length-1;B>=0;B--)(k=l[B])&&(A=(E<3?k(A):E>3?k(g,y,A):k(g,y))||A);return E>3&&A&&Object.defineProperty(g,y,A),A},p=this&&this.__param||function(l,g){return function(y,b){g(y,b,l)}};Object.defineProperty(r,"__esModule",{value:!0}),r.BufferService=r.MINIMUM_ROWS=r.MINIMUM_COLS=void 0;let h=a(460),v=a(844),f=a(295),w=a(585);r.MINIMUM_COLS=2,r.MINIMUM_ROWS=1;let x=r.BufferService=class extends v.Disposable{get buffer(){return this.buffers.active}constructor(l){super(),this.isUserScrolling=!1,this._onResize=this.register(new h.EventEmitter),this.onResize=this._onResize.event,this._onScroll=this.register(new h.EventEmitter),this.onScroll=this._onScroll.event,this.cols=Math.max(l.rawOptions.cols||0,r.MINIMUM_COLS),this.rows=Math.max(l.rawOptions.rows||0,r.MINIMUM_ROWS),this.buffers=this.register(new f.BufferSet(l,this))}resize(l,g){this.cols=l,this.rows=g,this.buffers.resize(l,g),this._onResize.fire({cols:l,rows:g})}reset(){this.buffers.reset(),this.isUserScrolling=!1}scroll(l,g=!1){let y=this.buffer,b;b=this._cachedBlankLine,b&&b.length===this.cols&&b.getFg(0)===l.fg&&b.getBg(0)===l.bg||(b=y.getBlankLine(l,g),this._cachedBlankLine=b),b.isWrapped=g;let k=y.ybase+y.scrollTop,E=y.ybase+y.scrollBottom;if(y.scrollTop===0){let A=y.lines.isFull;E===y.lines.length-1?A?y.lines.recycle().copyFrom(b):y.lines.push(b.clone()):y.lines.splice(E+1,0,b.clone()),A?this.isUserScrolling&&(y.ydisp=Math.max(y.ydisp-1,0)):(y.ybase++,this.isUserScrolling||y.ydisp++)}else{let A=E-k+1;y.lines.shiftElements(k+1,A-1,-1),y.lines.set(E,b.clone())}this.isUserScrolling||(y.ydisp=y.ybase),this._onScroll.fire(y.ydisp)}scrollLines(l,g,y){let b=this.buffer;if(l<0){if(b.ydisp===0)return;this.isUserScrolling=!0}else l+b.ydisp>=b.ybase&&(this.isUserScrolling=!1);let k=b.ydisp;b.ydisp=Math.max(Math.min(b.ydisp+l,b.ybase),0),k!==b.ydisp&&(g||this._onScroll.fire(b.ydisp))}};r.BufferService=x=m([p(0,w.IOptionsService)],x)},994:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.CharsetService=void 0,r.CharsetService=class{constructor(){this.glevel=0,this._charsets=[]}reset(){this.charset=void 0,this._charsets=[],this.glevel=0}setgLevel(a){this.glevel=a,this.charset=this._charsets[a]}setgCharset(a,m){this._charsets[a]=m,this.glevel===a&&(this.charset=m)}}},753:function(o,r,a){var m=this&&this.__decorate||function(b,k,E,A){var B,L=arguments.length,W=L<3?k:A===null?A=Object.getOwnPropertyDescriptor(k,E):A;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")W=Reflect.decorate(b,k,E,A);else for(var he=b.length-1;he>=0;he--)(B=b[he])&&(W=(L<3?B(W):L>3?B(k,E,W):B(k,E))||W);return L>3&&W&&Object.defineProperty(k,E,W),W},p=this&&this.__param||function(b,k){return function(E,A){k(E,A,b)}};Object.defineProperty(r,"__esModule",{value:!0}),r.CoreMouseService=void 0;let h=a(585),v=a(460),f=a(844),w={NONE:{events:0,restrict:()=>!1},X10:{events:1,restrict:b=>b.button!==4&&b.action===1&&(b.ctrl=!1,b.alt=!1,b.shift=!1,!0)},VT200:{events:19,restrict:b=>b.action!==32},DRAG:{events:23,restrict:b=>b.action!==32||b.button!==3},ANY:{events:31,restrict:b=>!0}};function x(b,k){let E=(b.ctrl?16:0)|(b.shift?4:0)|(b.alt?8:0);return b.button===4?(E|=64,E|=b.action):(E|=3&b.button,4&b.button&&(E|=64),8&b.button&&(E|=128),b.action===32?E|=32:b.action!==0||k||(E|=3)),E}let l=String.fromCharCode,g={DEFAULT:b=>{let k=[x(b,!1)+32,b.col+32,b.row+32];return k[0]>255||k[1]>255||k[2]>255?"":`\x1B[M${l(k[0])}${l(k[1])}${l(k[2])}`},SGR:b=>{let k=b.action===0&&b.button!==4?"m":"M";return`\x1B[<${x(b,!0)};${b.col};${b.row}${k}`},SGR_PIXELS:b=>{let k=b.action===0&&b.button!==4?"m":"M";return`\x1B[<${x(b,!0)};${b.x};${b.y}${k}`}},y=r.CoreMouseService=class extends f.Disposable{constructor(b,k){super(),this._bufferService=b,this._coreService=k,this._protocols={},this._encodings={},this._activeProtocol="",this._activeEncoding="",this._lastEvent=null,this._onProtocolChange=this.register(new v.EventEmitter),this.onProtocolChange=this._onProtocolChange.event;for(let E of Object.keys(w))this.addProtocol(E,w[E]);for(let E of Object.keys(g))this.addEncoding(E,g[E]);this.reset()}addProtocol(b,k){this._protocols[b]=k}addEncoding(b,k){this._encodings[b]=k}get activeProtocol(){return this._activeProtocol}get areMouseEventsActive(){return this._protocols[this._activeProtocol].events!==0}set activeProtocol(b){if(!this._protocols[b])throw new Error(`unknown protocol "${b}"`);this._activeProtocol=b,this._onProtocolChange.fire(this._protocols[b].events)}get activeEncoding(){return this._activeEncoding}set activeEncoding(b){if(!this._encodings[b])throw new Error(`unknown encoding "${b}"`);this._activeEncoding=b}reset(){this.activeProtocol="NONE",this.activeEncoding="DEFAULT",this._lastEvent=null}triggerMouseEvent(b){if(b.col<0||b.col>=this._bufferService.cols||b.row<0||b.row>=this._bufferService.rows||b.button===4&&b.action===32||b.button===3&&b.action!==32||b.button!==4&&(b.action===2||b.action===3)||(b.col++,b.row++,b.action===32&&this._lastEvent&&this._equalEvents(this._lastEvent,b,this._activeEncoding==="SGR_PIXELS"))||!this._protocols[this._activeProtocol].restrict(b))return!1;let k=this._encodings[this._activeEncoding](b);return k&&(this._activeEncoding==="DEFAULT"?this._coreService.triggerBinaryEvent(k):this._coreService.triggerDataEvent(k,!0)),this._lastEvent=b,!0}explainEvents(b){return{down:!!(1&b),up:!!(2&b),drag:!!(4&b),move:!!(8&b),wheel:!!(16&b)}}_equalEvents(b,k,E){if(E){if(b.x!==k.x||b.y!==k.y)return!1}else if(b.col!==k.col||b.row!==k.row)return!1;return b.button===k.button&&b.action===k.action&&b.ctrl===k.ctrl&&b.alt===k.alt&&b.shift===k.shift}};r.CoreMouseService=y=m([p(0,h.IBufferService),p(1,h.ICoreService)],y)},83:function(o,r,a){var m=this&&this.__decorate||function(y,b,k,E){var A,B=arguments.length,L=B<3?b:E===null?E=Object.getOwnPropertyDescriptor(b,k):E;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")L=Reflect.decorate(y,b,k,E);else for(var W=y.length-1;W>=0;W--)(A=y[W])&&(L=(B<3?A(L):B>3?A(b,k,L):A(b,k))||L);return B>3&&L&&Object.defineProperty(b,k,L),L},p=this&&this.__param||function(y,b){return function(k,E){b(k,E,y)}};Object.defineProperty(r,"__esModule",{value:!0}),r.CoreService=void 0;let h=a(439),v=a(460),f=a(844),w=a(585),x=Object.freeze({insertMode:!1}),l=Object.freeze({applicationCursorKeys:!1,applicationKeypad:!1,bracketedPasteMode:!1,origin:!1,reverseWraparound:!1,sendFocus:!1,wraparound:!0}),g=r.CoreService=class extends f.Disposable{constructor(y,b,k){super(),this._bufferService=y,this._logService=b,this._optionsService=k,this.isCursorInitialized=!1,this.isCursorHidden=!1,this._onData=this.register(new v.EventEmitter),this.onData=this._onData.event,this._onUserInput=this.register(new v.EventEmitter),this.onUserInput=this._onUserInput.event,this._onBinary=this.register(new v.EventEmitter),this.onBinary=this._onBinary.event,this._onRequestScrollToBottom=this.register(new v.EventEmitter),this.onRequestScrollToBottom=this._onRequestScrollToBottom.event,this.modes=(0,h.clone)(x),this.decPrivateModes=(0,h.clone)(l)}reset(){this.modes=(0,h.clone)(x),this.decPrivateModes=(0,h.clone)(l)}triggerDataEvent(y,b=!1){if(this._optionsService.rawOptions.disableStdin)return;let k=this._bufferService.buffer;b&&this._optionsService.rawOptions.scrollOnUserInput&&k.ybase!==k.ydisp&&this._onRequestScrollToBottom.fire(),b&&this._onUserInput.fire(),this._logService.debug(`sending data "${y}"`,()=>y.split("").map(E=>E.charCodeAt(0))),this._onData.fire(y)}triggerBinaryEvent(y){this._optionsService.rawOptions.disableStdin||(this._logService.debug(`sending binary "${y}"`,()=>y.split("").map(b=>b.charCodeAt(0))),this._onBinary.fire(y))}};r.CoreService=g=m([p(0,w.IBufferService),p(1,w.ILogService),p(2,w.IOptionsService)],g)},348:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.InstantiationService=r.ServiceCollection=void 0;let m=a(585),p=a(343);class h{constructor(...f){this._entries=new Map;for(let[w,x]of f)this.set(w,x)}set(f,w){let x=this._entries.get(f);return this._entries.set(f,w),x}forEach(f){for(let[w,x]of this._entries.entries())f(w,x)}has(f){return this._entries.has(f)}get(f){return this._entries.get(f)}}r.ServiceCollection=h,r.InstantiationService=class{constructor(){this._services=new h,this._services.set(m.IInstantiationService,this)}setService(v,f){this._services.set(v,f)}getService(v){return this._services.get(v)}createInstance(v,...f){let w=(0,p.getServiceDependencies)(v).sort((g,y)=>g.index-y.index),x=[];for(let g of w){let y=this._services.get(g.id);if(!y)throw new Error(`[createInstance] ${v.name} depends on UNKNOWN service ${g.id}.`);x.push(y)}let l=w.length>0?w[0].index:f.length;if(f.length!==l)throw new Error(`[createInstance] First service dependency of ${v.name} at position ${l+1} conflicts with ${f.length} static arguments`);return new v(...f,...x)}}},866:function(o,r,a){var m=this&&this.__decorate||function(l,g,y,b){var k,E=arguments.length,A=E<3?g:b===null?b=Object.getOwnPropertyDescriptor(g,y):b;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")A=Reflect.decorate(l,g,y,b);else for(var B=l.length-1;B>=0;B--)(k=l[B])&&(A=(E<3?k(A):E>3?k(g,y,A):k(g,y))||A);return E>3&&A&&Object.defineProperty(g,y,A),A},p=this&&this.__param||function(l,g){return function(y,b){g(y,b,l)}};Object.defineProperty(r,"__esModule",{value:!0}),r.traceCall=r.setTraceLogger=r.LogService=void 0;let h=a(844),v=a(585),f={trace:v.LogLevelEnum.TRACE,debug:v.LogLevelEnum.DEBUG,info:v.LogLevelEnum.INFO,warn:v.LogLevelEnum.WARN,error:v.LogLevelEnum.ERROR,off:v.LogLevelEnum.OFF},w,x=r.LogService=class extends h.Disposable{get logLevel(){return this._logLevel}constructor(l){super(),this._optionsService=l,this._logLevel=v.LogLevelEnum.OFF,this._updateLogLevel(),this.register(this._optionsService.onSpecificOptionChange("logLevel",()=>this._updateLogLevel())),w=this}_updateLogLevel(){this._logLevel=f[this._optionsService.rawOptions.logLevel]}_evalLazyOptionalParams(l){for(let g=0;g<l.length;g++)typeof l[g]=="function"&&(l[g]=l[g]())}_log(l,g,y){this._evalLazyOptionalParams(y),l.call(console,(this._optionsService.options.logger?"":"xterm.js: ")+g,...y)}trace(l,...g){this._logLevel<=v.LogLevelEnum.TRACE&&this._log(this._optionsService.options.logger?.trace.bind(this._optionsService.options.logger)??console.log,l,g)}debug(l,...g){this._logLevel<=v.LogLevelEnum.DEBUG&&this._log(this._optionsService.options.logger?.debug.bind(this._optionsService.options.logger)??console.log,l,g)}info(l,...g){this._logLevel<=v.LogLevelEnum.INFO&&this._log(this._optionsService.options.logger?.info.bind(this._optionsService.options.logger)??console.info,l,g)}warn(l,...g){this._logLevel<=v.LogLevelEnum.WARN&&this._log(this._optionsService.options.logger?.warn.bind(this._optionsService.options.logger)??console.warn,l,g)}error(l,...g){this._logLevel<=v.LogLevelEnum.ERROR&&this._log(this._optionsService.options.logger?.error.bind(this._optionsService.options.logger)??console.error,l,g)}};r.LogService=x=m([p(0,v.IOptionsService)],x),r.setTraceLogger=function(l){w=l},r.traceCall=function(l,g,y){if(typeof y.value!="function")throw new Error("not supported");let b=y.value;y.value=function(...k){if(w.logLevel!==v.LogLevelEnum.TRACE)return b.apply(this,k);w.trace(`GlyphRenderer#${b.name}(${k.map(A=>JSON.stringify(A)).join(", ")})`);let E=b.apply(this,k);return w.trace(`GlyphRenderer#${b.name} return`,E),E}}},302:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.OptionsService=r.DEFAULT_OPTIONS=void 0;let m=a(460),p=a(844),h=a(114);r.DEFAULT_OPTIONS={cols:80,rows:24,cursorBlink:!1,cursorStyle:"block",cursorWidth:1,cursorInactiveStyle:"outline",customGlyphs:!0,drawBoldTextInBrightColors:!0,documentOverride:null,fastScrollModifier:"alt",fastScrollSensitivity:5,fontFamily:"courier-new, courier, monospace",fontSize:15,fontWeight:"normal",fontWeightBold:"bold",ignoreBracketedPasteMode:!1,lineHeight:1,letterSpacing:0,linkHandler:null,logLevel:"info",logger:null,scrollback:1e3,scrollOnUserInput:!0,scrollSensitivity:1,screenReaderMode:!1,smoothScrollDuration:0,macOptionIsMeta:!1,macOptionClickForcesSelection:!1,minimumContrastRatio:1,disableStdin:!1,allowProposedApi:!1,allowTransparency:!1,tabStopWidth:8,theme:{},rescaleOverlappingGlyphs:!1,rightClickSelectsWord:h.isMac,windowOptions:{},windowsMode:!1,windowsPty:{},wordSeparator:" ()[]{}',\"`",altClickMovesCursor:!0,convertEol:!1,termName:"xterm",cancelEvents:!1,overviewRulerWidth:0};let v=["normal","bold","100","200","300","400","500","600","700","800","900"];class f extends p.Disposable{constructor(x){super(),this._onOptionChange=this.register(new m.EventEmitter),this.onOptionChange=this._onOptionChange.event;let l={...r.DEFAULT_OPTIONS};for(let g in x)if(g in l)try{let y=x[g];l[g]=this._sanitizeAndValidateOption(g,y)}catch(y){console.error(y)}this.rawOptions=l,this.options={...l},this._setupOptions(),this.register((0,p.toDisposable)(()=>{this.rawOptions.linkHandler=null,this.rawOptions.documentOverride=null}))}onSpecificOptionChange(x,l){return this.onOptionChange(g=>{g===x&&l(this.rawOptions[x])})}onMultipleOptionChange(x,l){return this.onOptionChange(g=>{x.indexOf(g)!==-1&&l()})}_setupOptions(){let x=g=>{if(!(g in r.DEFAULT_OPTIONS))throw new Error(`No option with key "${g}"`);return this.rawOptions[g]},l=(g,y)=>{if(!(g in r.DEFAULT_OPTIONS))throw new Error(`No option with key "${g}"`);y=this._sanitizeAndValidateOption(g,y),this.rawOptions[g]!==y&&(this.rawOptions[g]=y,this._onOptionChange.fire(g))};for(let g in this.rawOptions){let y={get:x.bind(this,g),set:l.bind(this,g)};Object.defineProperty(this.options,g,y)}}_sanitizeAndValidateOption(x,l){switch(x){case"cursorStyle":if(l||(l=r.DEFAULT_OPTIONS[x]),!function(g){return g==="block"||g==="underline"||g==="bar"}(l))throw new Error(`"${l}" is not a valid value for ${x}`);break;case"wordSeparator":l||(l=r.DEFAULT_OPTIONS[x]);break;case"fontWeight":case"fontWeightBold":if(typeof l=="number"&&1<=l&&l<=1e3)break;l=v.includes(l)?l:r.DEFAULT_OPTIONS[x];break;case"cursorWidth":l=Math.floor(l);case"lineHeight":case"tabStopWidth":if(l<1)throw new Error(`${x} cannot be less than 1, value: ${l}`);break;case"minimumContrastRatio":l=Math.max(1,Math.min(21,Math.round(10*l)/10));break;case"scrollback":if((l=Math.min(l,4294967295))<0)throw new Error(`${x} cannot be less than 0, value: ${l}`);break;case"fastScrollSensitivity":case"scrollSensitivity":if(l<=0)throw new Error(`${x} cannot be less than or equal to 0, value: ${l}`);break;case"rows":case"cols":if(!l&&l!==0)throw new Error(`${x} must be numeric, value: ${l}`);break;case"windowsPty":l=l??{}}return l}}r.OptionsService=f},660:function(o,r,a){var m=this&&this.__decorate||function(f,w,x,l){var g,y=arguments.length,b=y<3?w:l===null?l=Object.getOwnPropertyDescriptor(w,x):l;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")b=Reflect.decorate(f,w,x,l);else for(var k=f.length-1;k>=0;k--)(g=f[k])&&(b=(y<3?g(b):y>3?g(w,x,b):g(w,x))||b);return y>3&&b&&Object.defineProperty(w,x,b),b},p=this&&this.__param||function(f,w){return function(x,l){w(x,l,f)}};Object.defineProperty(r,"__esModule",{value:!0}),r.OscLinkService=void 0;let h=a(585),v=r.OscLinkService=class{constructor(f){this._bufferService=f,this._nextId=1,this._entriesWithId=new Map,this._dataByLinkId=new Map}registerLink(f){let w=this._bufferService.buffer;if(f.id===void 0){let k=w.addMarker(w.ybase+w.y),E={data:f,id:this._nextId++,lines:[k]};return k.onDispose(()=>this._removeMarkerFromLink(E,k)),this._dataByLinkId.set(E.id,E),E.id}let x=f,l=this._getEntryIdKey(x),g=this._entriesWithId.get(l);if(g)return this.addLineToLink(g.id,w.ybase+w.y),g.id;let y=w.addMarker(w.ybase+w.y),b={id:this._nextId++,key:this._getEntryIdKey(x),data:x,lines:[y]};return y.onDispose(()=>this._removeMarkerFromLink(b,y)),this._entriesWithId.set(b.key,b),this._dataByLinkId.set(b.id,b),b.id}addLineToLink(f,w){let x=this._dataByLinkId.get(f);if(x&&x.lines.every(l=>l.line!==w)){let l=this._bufferService.buffer.addMarker(w);x.lines.push(l),l.onDispose(()=>this._removeMarkerFromLink(x,l))}}getLinkData(f){return this._dataByLinkId.get(f)?.data}_getEntryIdKey(f){return`${f.id};;${f.uri}`}_removeMarkerFromLink(f,w){let x=f.lines.indexOf(w);x!==-1&&(f.lines.splice(x,1),f.lines.length===0&&(f.data.id!==void 0&&this._entriesWithId.delete(f.key),this._dataByLinkId.delete(f.id)))}};r.OscLinkService=v=m([p(0,h.IBufferService)],v)},343:(o,r)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.createDecorator=r.getServiceDependencies=r.serviceRegistry=void 0;let a="di$target",m="di$dependencies";r.serviceRegistry=new Map,r.getServiceDependencies=function(p){return p[m]||[]},r.createDecorator=function(p){if(r.serviceRegistry.has(p))return r.serviceRegistry.get(p);let h=function(v,f,w){if(arguments.length!==3)throw new Error("@IServiceName-decorator can only be used to decorate a parameter");(function(x,l,g){l[a]===l?l[m].push({id:x,index:g}):(l[m]=[{id:x,index:g}],l[a]=l)})(h,v,w)};return h.toString=()=>p,r.serviceRegistry.set(p,h),h}},585:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.IDecorationService=r.IUnicodeService=r.IOscLinkService=r.IOptionsService=r.ILogService=r.LogLevelEnum=r.IInstantiationService=r.ICharsetService=r.ICoreService=r.ICoreMouseService=r.IBufferService=void 0;let m=a(343);var p;r.IBufferService=(0,m.createDecorator)("BufferService"),r.ICoreMouseService=(0,m.createDecorator)("CoreMouseService"),r.ICoreService=(0,m.createDecorator)("CoreService"),r.ICharsetService=(0,m.createDecorator)("CharsetService"),r.IInstantiationService=(0,m.createDecorator)("InstantiationService"),function(h){h[h.TRACE=0]="TRACE",h[h.DEBUG=1]="DEBUG",h[h.INFO=2]="INFO",h[h.WARN=3]="WARN",h[h.ERROR=4]="ERROR",h[h.OFF=5]="OFF"}(p||(r.LogLevelEnum=p={})),r.ILogService=(0,m.createDecorator)("LogService"),r.IOptionsService=(0,m.createDecorator)("OptionsService"),r.IOscLinkService=(0,m.createDecorator)("OscLinkService"),r.IUnicodeService=(0,m.createDecorator)("UnicodeService"),r.IDecorationService=(0,m.createDecorator)("DecorationService")},480:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.UnicodeService=void 0;let m=a(460),p=a(225);class h{static extractShouldJoin(f){return(1&f)!=0}static extractWidth(f){return f>>1&3}static extractCharKind(f){return f>>3}static createPropertyValue(f,w,x=!1){return(16777215&f)<<3|(3&w)<<1|(x?1:0)}constructor(){this._providers=Object.create(null),this._active="",this._onChange=new m.EventEmitter,this.onChange=this._onChange.event;let f=new p.UnicodeV6;this.register(f),this._active=f.version,this._activeProvider=f}dispose(){this._onChange.dispose()}get versions(){return Object.keys(this._providers)}get activeVersion(){return this._active}set activeVersion(f){if(!this._providers[f])throw new Error(`unknown Unicode version "${f}"`);this._active=f,this._activeProvider=this._providers[f],this._onChange.fire(f)}register(f){this._providers[f.version]=f}wcwidth(f){return this._activeProvider.wcwidth(f)}getStringCellWidth(f){let w=0,x=0,l=f.length;for(let g=0;g<l;++g){let y=f.charCodeAt(g);if(55296<=y&&y<=56319){if(++g>=l)return w+this.wcwidth(y);let E=f.charCodeAt(g);56320<=E&&E<=57343?y=1024*(y-55296)+E-56320+65536:w+=this.wcwidth(E)}let b=this.charProperties(y,x),k=h.extractWidth(b);h.extractShouldJoin(b)&&(k-=h.extractWidth(x)),w+=k,x=b}return w}charProperties(f,w){return this._activeProvider.charProperties(f,w)}}r.UnicodeService=h},781:(o,r,a)=>{Object.defineProperty(r,"__esModule",{value:!0}),r.Terminal=void 0;let m=a(437),p=a(969),h=a(460);class v extends p.CoreTerminal{constructor(w={}){super(w),this._onBell=this.register(new h.EventEmitter),this.onBell=this._onBell.event,this._onCursorMove=this.register(new h.EventEmitter),this.onCursorMove=this._onCursorMove.event,this._onTitleChange=this.register(new h.EventEmitter),this.onTitleChange=this._onTitleChange.event,this._onA11yCharEmitter=this.register(new h.EventEmitter),this.onA11yChar=this._onA11yCharEmitter.event,this._onA11yTabEmitter=this.register(new h.EventEmitter),this.onA11yTab=this._onA11yTabEmitter.event,this._setup(),this.register(this._inputHandler.onRequestBell(()=>this.bell())),this.register(this._inputHandler.onRequestReset(()=>this.reset())),this.register((0,h.forwardEvent)(this._inputHandler.onCursorMove,this._onCursorMove)),this.register((0,h.forwardEvent)(this._inputHandler.onTitleChange,this._onTitleChange)),this.register((0,h.forwardEvent)(this._inputHandler.onA11yChar,this._onA11yCharEmitter)),this.register((0,h.forwardEvent)(this._inputHandler.onA11yTab,this._onA11yTabEmitter))}get buffer(){return this.buffers.active}get markers(){return this.buffer.markers}addMarker(w){if(this.buffer===this.buffers.normal)return this.buffer.addMarker(this.buffer.ybase+this.buffer.y+w)}bell(){this._onBell.fire()}input(w,x=!0){this.coreService.triggerDataEvent(w,x)}resize(w,x){w===this.cols&&x===this.rows||super.resize(w,x)}clear(){if(this.buffer.ybase!==0||this.buffer.y!==0){this.buffer.lines.set(0,this.buffer.lines.get(this.buffer.ybase+this.buffer.y)),this.buffer.lines.length=1,this.buffer.ydisp=0,this.buffer.ybase=0,this.buffer.y=0;for(let w=1;w<this.rows;w++)this.buffer.lines.push(this.buffer.getBlankLine(m.DEFAULT_ATTR_DATA));this._onScroll.fire({position:this.buffer.ydisp,source:0})}}reset(){this.options.rows=this.rows,this.options.cols=this.cols,this._setup(),super.reset()}}r.Terminal=v}},i={};function e(o){var r=i[o];if(r!==void 0)return r.exports;var a=i[o]={exports:{}};return c[o].call(a.exports,a,a.exports,e),a.exports}var t={};(()=>{var o=t;Object.defineProperty(o,"__esModule",{value:!0}),o.Terminal=void 0;let r=e(285),a=e(975),m=e(90),p=e(781),h=e(741),v=e(844),f=["cols","rows"];class w extends v.Disposable{constructor(l){super(),this._core=this.register(new p.Terminal(l)),this._addonManager=this.register(new h.AddonManager),this._publicOptions={...this._core.options};let g=b=>this._core.options[b],y=(b,k)=>{this._checkReadonlyOptions(b),this._core.options[b]=k};for(let b in this._core.options){Object.defineProperty(this._publicOptions,b,{get:()=>this._core.options[b],set:E=>{this._checkReadonlyOptions(b),this._core.options[b]=E}});let k={get:g.bind(this,b),set:y.bind(this,b)};Object.defineProperty(this._publicOptions,b,k)}}_checkReadonlyOptions(l){if(f.includes(l))throw new Error(`Option "${l}" can only be set in the constructor`)}_checkProposedApi(){if(!this._core.optionsService.options.allowProposedApi)throw new Error("You must set the allowProposedApi option to true to use proposed API")}get onBell(){return this._core.onBell}get onBinary(){return this._core.onBinary}get onCursorMove(){return this._core.onCursorMove}get onData(){return this._core.onData}get onLineFeed(){return this._core.onLineFeed}get onResize(){return this._core.onResize}get onScroll(){return this._core.onScroll}get onTitleChange(){return this._core.onTitleChange}get parser(){return this._checkProposedApi(),this._parser||(this._parser=new a.ParserApi(this._core)),this._parser}get unicode(){return this._checkProposedApi(),new m.UnicodeApi(this._core)}get rows(){return this._core.rows}get cols(){return this._core.cols}get buffer(){return this._checkProposedApi(),this._buffer||(this._buffer=this.register(new r.BufferNamespaceApi(this._core))),this._buffer}get markers(){return this._checkProposedApi(),this._core.markers}get modes(){let l=this._core.coreService.decPrivateModes,g="none";switch(this._core.coreMouseService.activeProtocol){case"X10":g="x10";break;case"VT200":g="vt200";break;case"DRAG":g="drag";break;case"ANY":g="any"}return{applicationCursorKeysMode:l.applicationCursorKeys,applicationKeypadMode:l.applicationKeypad,bracketedPasteMode:l.bracketedPasteMode,insertMode:this._core.coreService.modes.insertMode,mouseTrackingMode:g,originMode:l.origin,reverseWraparoundMode:l.reverseWraparound,sendFocusMode:l.sendFocus,wraparoundMode:l.wraparound}}get options(){return this._publicOptions}set options(l){for(let g in l)this._publicOptions[g]=l[g]}input(l,g=!0){this._core.input(l,g)}resize(l,g){this._verifyIntegers(l,g),this._core.resize(l,g)}registerMarker(l=0){return this._checkProposedApi(),this._verifyIntegers(l),this._core.addMarker(l)}addMarker(l){return this.registerMarker(l)}dispose(){super.dispose()}scrollLines(l){this._verifyIntegers(l),this._core.scrollLines(l)}scrollPages(l){this._verifyIntegers(l),this._core.scrollPages(l)}scrollToTop(){this._core.scrollToTop()}scrollToBottom(){this._core.scrollToBottom()}scrollToLine(l){this._verifyIntegers(l),this._core.scrollToLine(l)}clear(){this._core.clear()}write(l,g){this._core.write(l,g)}writeln(l,g){this._core.write(l),this._core.write(`\r
`,g)}reset(){this._core.reset()}loadAddon(l){this._addonManager.loadAddon(this,l)}_verifyIntegers(...l){for(let g of l)if(g===1/0||isNaN(g)||g%1!=0)throw new Error("This API only accepts integers")}}o.Terminal=w})();var s=Gn;for(var n in t)s[n]=t[n];t.__esModule&&Object.defineProperty(s,"__esModule",{value:!0})})()});q();function zt(){let c=document.documentElement.getAttribute("data-theme");return c==="dark"?"dark":c==="light"?"light":window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}function Vs(){return zt()==="dark"}function bo(c){let i=getComputedStyle(document.documentElement).getPropertyValue(`--color-${c}`).trim();if(!i)return"#000000";let[e,t,s]=i.split(" ").map(n=>Number.parseInt(n,10));return`#${e.toString(16).padStart(2,"0")}${t.toString(16).padStart(2,"0")}${s.toString(16).padStart(2,"0")}`}function Or(){let c=bo("text");return encodeURIComponent(c)}var Ti=P("monaco-loader"),zr=!1,Ji=null;async function yo(){return Ji||(Ji=new Promise((c,i)=>{let e=()=>{let t=document.createElement("script");t.src="/monaco-editor/vs/loader.js",t.async=!0,t.defer=!0,t.onload=()=>{window.require.config({paths:{vs:"/monaco-editor/vs"}}),window.MonacoEnvironment={getWorker:(s,n)=>new Worker("data:,")},window.require(["vs/editor/editor.main"],()=>{Ti.debug("Monaco Editor loaded via AMD with lazy loading"),c()})},t.onerror=()=>{i(new Error("Failed to load Monaco loader script"))},document.head.appendChild(t)};"requestIdleCallback"in window?requestIdleCallback(e,{timeout:2e3}):setTimeout(e,100)}),Ji)}async function Zi(){if(!zr)try{Ti.debug("Loading Monaco Editor..."),window.monaco||await yo(),Ti.debug("Initializing Monaco Editor...");let c=window.monaco;c.languages.register({id:"shell"}),c.languages.setMonarchTokensProvider("shell",{tokenizer:{root:[[/^#.*$/,"comment"],[/\$\w+/,"variable"],[/\b(echo|cd|ls|grep|find|chmod|mkdir|rm|cp|mv|touch|cat|sed|awk|curl|wget|git|pnpm|npm|yarn|docker|kubectl)\b/,"keyword"],[/"([^"\\]|\\.)*"/,"string"],[/'([^'\\]|\\.)*'/,"string"]]}}),c.editor.setTheme(Vs()?"vs-dark":"vs"),new MutationObserver(()=>{c.editor.setTheme(Vs()?"vs-dark":"vs")}).observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme"]}),zr=!0,Ti.debug("Monaco Editor initialized successfully")}catch(c){throw Ti.error("Failed to initialize Monaco Editor:",c),c}}var Ma=typeof window<"u"?window.monaco:void 0;we();var Ue="~/Documents";var Nr=[{name:"\u2728 claude",command:"claude --dangerously-skip-permissions"},{name:"\u2728 gemini",command:"gemini"},{command:"opencode"},{command:"crush"},{command:"zsh"},{command:"node"}],es={enabled:!1,sessionStart:!1,sessionExit:!0,commandCompletion:!1,commandError:!0,bell:!0,claudeTurn:!1,soundEnabled:!0,vibrationEnabled:!1},Wr={enabled:!0,sessionStart:!1,sessionExit:!0,commandCompletion:!1,commandError:!0,bell:!0,claudeTurn:!0,soundEnabled:!0,vibrationEnabled:!1};q();Me();q();var ae=P("notification-event-service"),js=class{constructor(i){this.authClient=i;this.eventSource=null;this.isConnected=!1;this.connectionStateHandlers=new Set;this.eventListeners=new Map;this.reconnectTimer=null;this.reconnectDelay=1e3;this.maxReconnectDelay=3e4;this.shouldReconnect=!0;this.isConnecting=!1}async connect(){if(this.eventSource||this.isConnecting){ae.debug("Already connected or connecting to notification event stream");return}let i=!this.authClient||!this.authClient.getAuthHeader().Authorization;if(i)ae.debug("No-auth mode - connecting to SSE without checking preferences");else try{ae.debug("Checking notification preferences..."),await X.waitForInitialization();let t=await X.loadPreferences();if(ae.debug("Loaded notification preferences:",t),!t.enabled){ae.debug("Notifications are disabled, not connecting to SSE"),this.isConnecting=!1;return}}catch(t){ae.warn("Could not check notification preferences:",t)}this.isConnecting=!0,ae.log("Connecting to notification event stream...");let e="/api/events";if(!i&&this.authClient){let t=this.authClient.getAuthHeader();if(t.Authorization?.startsWith("Bearer ")){let s=t.Authorization.substring(7);e=`${e}?token=${encodeURIComponent(s)}`,ae.debug("Added auth token to EventSource URL")}}else ae.debug("No auth mode - connecting without token");this.eventSource=new EventSource(e),ae.log(`EventSource created with URL: ${e}, readyState: ${this.eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`),this.eventSource.onopen=()=>{ae.log("\u2705 SSE onopen event fired - connection established"),this.isConnected=!0,this.isConnecting=!1,this.reconnectDelay=1e3,this.notifyConnectionState(!0)},setTimeout(()=>{ae.log(`SSE state after 100ms: readyState=${this.eventSource?.readyState}, isConnected=${this.isConnected}`)},100),setTimeout(()=>{ae.log(`SSE state after 500ms: readyState=${this.eventSource?.readyState}, isConnected=${this.isConnected}`)},500),setTimeout(()=>{ae.log(`SSE state after 1s: readyState=${this.eventSource?.readyState}, isConnected=${this.isConnected}`),this.eventSource?.readyState===EventSource.OPEN&&!this.isConnected&&(ae.warn("\u26A0\uFE0F SSE is OPEN but onopen never fired - manually setting connected state"),this.isConnected=!0,this.isConnecting=!1,this.notifyConnectionState(!0))},1e3),this.eventSource.onmessage=t=>{ae.log("\u{1F4E8} Received SSE message:",t.data);try{let s=JSON.parse(t.data);ae.log("Parsed notification event:",s),s.type==="connected"&&(ae.log("\u2705 Received connected event from SSE"),this.isConnected||(this.isConnected=!0,this.isConnecting=!1,this.notifyConnectionState(!0))),s.type&&this.notify(s.type,s)}catch{ae.log("Received non-JSON event:",t.data)}},this.eventSource.onerror=t=>{let s=this.eventSource?.readyState,n=this.eventSource?.url||"unknown";s===EventSource.CONNECTING?ae.warn(`\u26A0\uFE0F SSE connection failed while connecting to ${n} (likely auth or CORS issue)`):s===EventSource.OPEN?ae.warn("\u26A0\uFE0F SSE connection error while open (network issue)"):s===EventSource.CLOSED&&ae.debug("SSE connection closed"),ae.error("\u274C Notification event stream error:",t),ae.log(`EventSource readyState on error: ${s} (0=CONNECTING, 1=OPEN, 2=CLOSED), URL: ${n}`),this.isConnected=!1,this.isConnecting=!1,this.notifyConnectionState(!1),this.shouldReconnect&&this.scheduleReconnect()}}disconnect(){ae.log("Disconnecting from notification event stream"),this.shouldReconnect=!1,this.reconnectTimer&&(clearTimeout(this.reconnectTimer),this.reconnectTimer=null),this.eventSource&&(this.eventSource.close(),this.eventSource=null,this.isConnected=!1,this.notifyConnectionState(!1))}scheduleReconnect(){this.reconnectTimer||!this.shouldReconnect||(ae.debug(`Scheduling reconnect in ${this.reconnectDelay}ms...`),this.eventSource&&(this.eventSource.close(),this.eventSource=null),this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,this.shouldReconnect&&(this.connect(),this.reconnectDelay=Math.min(this.reconnectDelay*2,this.maxReconnectDelay))},this.reconnectDelay))}getConnectionStatus(){return this.isConnected}onConnectionStateChange(i){return this.connectionStateHandlers.add(i),()=>{this.connectionStateHandlers.delete(i)}}on(i,e){return this.eventListeners.has(i)||this.eventListeners.set(i,new Set),this.eventListeners.get(i)?.add(e),()=>{this.off(i,e)}}off(i,e){this.eventListeners.get(i)?.delete(e)}notify(i,e){this.eventListeners.get(i)?.forEach(t=>{try{t(e)}catch(s){ae.error(`Error in event handler for ${i}:`,s)}})}notifyConnectionState(i){this.connectionStateHandlers.forEach(e=>{try{e(i)}catch(t){ae.error("Error in connection state handler:",t)}})}setAuthClient(i){this.authClient=i}},ot=new js;we();q();var Nt=P("server-config-service"),Wt=class{constructor(i){this.CACHE_TTL=6e4;this.authClient=i}setAuthClient(i){this.authClient=i,this.clearCache()}clearCache(){this.configCache=void 0,this.cacheTimestamp=void 0}isCacheValid(){return!this.configCache||!this.cacheTimestamp?!1:Date.now()-this.cacheTimestamp<this.CACHE_TTL}async loadConfig(i=!1){if(!i&&this.isCacheValid()&&this.configCache)return Nt.debug("Returning cached server config"),this.configCache;try{let e=await fetch("/api/config",{headers:this.authClient?this.authClient.getAuthHeader():{}});if(!e.ok)throw new Error(`Failed to load config: ${e.statusText}`);let t=await e.json();return this.configCache=t,this.cacheTimestamp=Date.now(),Nt.debug("Loaded server config:",t),t}catch(e){return Nt.error("Failed to load server config:",e),{repositoryBasePath:Ue,serverConfigured:!1,quickStartCommands:[]}}}async updateQuickStartCommands(i){if(!i||!Array.isArray(i))throw new Error("Invalid quick start commands");let e=i.filter(t=>t&&typeof t.command=="string"&&t.command.trim());try{let t=await fetch("/api/config",{method:"PUT",headers:{"Content-Type":"application/json",...this.authClient?this.authClient.getAuthHeader():{}},body:JSON.stringify({quickStartCommands:e})});if(!t.ok)throw new Error(`Failed to update config: ${t.statusText}`);this.clearCache(),Nt.debug("Updated quick start commands:",e)}catch(t){throw Nt.error("Failed to update quick start commands:",t),t}}async getRepositoryBasePath(){return(await this.loadConfig()).repositoryBasePath||Ue}async isServerConfigured(){return(await this.loadConfig()).serverConfigured??!1}async getQuickStartCommands(){return(await this.loadConfig()).quickStartCommands||[]}async updateConfig(i){if(!i||typeof i!="object")throw new Error("Invalid configuration updates");try{let e=await fetch("/api/config",{method:"PUT",headers:{"Content-Type":"application/json",...this.authClient?this.authClient.getAuthHeader():{}},body:JSON.stringify(i)});if(!e.ok)throw new Error(`Failed to update config: ${e.statusText}`);this.clearCache(),Nt.debug("Updated server config:",i)}catch(e){throw Nt.error("Failed to update server config:",e),e}}async getNotificationPreferences(){return(await this.loadConfig()).notificationPreferences}async updateNotificationPreferences(i){await this.updateConfig({notificationPreferences:i})}},Gs=new Wt;var K=P("push-notification-service"),Ys=class{constructor(){this.serviceWorkerRegistration=null;this.pushSubscription=null;this.permissionChangeCallbacks=new Set;this.subscriptionChangeCallbacks=new Set;this.initialized=!1;this.vapidPublicKey=null;this.initializationPromise=null;this.pushNotificationsAvailable=!1}async initialize(){return this.initializationPromise?this.initializationPromise:(this.initializationPromise=this._initialize().catch(i=>{K.error("failed to initialize push notification service:",i)}),this.initializationPromise)}async _initialize(){if(!this.initialized)try{if(!("serviceWorker"in navigator)){K.warn("service workers not supported");return}if(!("PushManager"in window)){K.warn("push messaging not supported");return}if(!window.isSecureContext){K.warn("Push notifications require HTTPS or localhost. Current context is not secure.");return}await this.fetchVapidPublicKey(),this.serviceWorkerRegistration=await navigator.serviceWorker.register("/sw.js",{scope:"/"}),K.log("service worker registered successfully");let i=await navigator.serviceWorker.ready;this.serviceWorkerRegistration||(this.serviceWorkerRegistration=i),this.pushSubscription=await this.serviceWorkerRegistration.pushManager.getSubscription(),K.log("Existing push subscription found:",{hasSubscription:!!this.pushSubscription,endpoint:`${this.pushSubscription?.endpoint?.substring(0,50)}...`}),navigator.serviceWorker.addEventListener("message",this.handleServiceWorkerMessage.bind(this)),this.monitorPermissionChanges(),await this.autoResubscribe(),this.initialized=!0,K.log("push notification service initialized")}catch(i){throw K.error("failed to initialize service worker:",i),i}}handleServiceWorkerMessage(i){let{data:e}=i;switch(e.type){case"notification-action":{this.handleNotificationAction(e.action,e.data);break}}}handleNotificationAction(i,e){window.dispatchEvent(new CustomEvent("notification-action",{detail:{action:i,data:e}}))}monitorPermissionChanges(){"permissions"in navigator&&navigator.permissions.query({name:"notifications"}).then(i=>{i.addEventListener("change",()=>{this.notifyPermissionChange(i.state)})}).catch(i=>{K.warn("failed to monitor permission changes:",i)})}notifyPermissionChange(i){this.permissionChangeCallbacks.forEach(e=>{try{e(i)}catch(t){K.error("error in permission change callback:",t)}})}notifySubscriptionChange(i){this.subscriptionChangeCallbacks.forEach(e=>{try{e(i)}catch(t){K.error("error in subscription change callback:",t)}})}async autoResubscribe(){try{let i=await this.loadPreferences();if(K.log("Auto-resubscribe checking preferences:",{enabled:i.enabled,hasPermission:this.getPermission()==="granted",hasServiceWorker:!!this.serviceWorkerRegistration,hasVapidKey:!!this.vapidPublicKey,hasExistingSubscription:!!this.pushSubscription}),i.enabled){if(K.log("Notifications were previously enabled, checking subscription state..."),this.getPermission()!=="granted"){K.warn("Permission not granted, cannot auto-resubscribe"),i.enabled=!1,await this.savePreferences(i);return}if(!this.serviceWorkerRegistration){K.warn("Service worker not ready, cannot auto-resubscribe");return}if(!this.vapidPublicKey){K.warn("VAPID key not available, cannot auto-resubscribe");return}if(this.pushSubscription){K.log("Active subscription already exists");let t=this.pushSubscriptionToInterface(this.pushSubscription);this.notifySubscriptionChange(t),await this.sendSubscriptionToServer(t)}else{K.log("No active subscription found, attempting to resubscribe...");let t=await this.subscribe();t?(K.log("Successfully auto-resubscribed to push notifications"),this.notifySubscriptionChange(t),await this.showWelcomeNotification()):(K.warn("Failed to auto-resubscribe, user will need to manually enable"),i.enabled=!1,await this.savePreferences(i))}}else K.log("Notifications not previously enabled, skipping auto-resubscribe")}catch(i){K.error("Error during auto-resubscribe:",i)}}async requestPermission(){if(!("Notification"in window))throw new Error("Notifications not supported");let i=Notification.permission;return i==="default"&&(i=await Notification.requestPermission()),this.notifyPermissionChange(i),i}getPermission(){return"Notification"in window?Notification.permission:"denied"}async subscribe(){if(!this.serviceWorkerRegistration)throw new Error("Service worker not initialized");try{if(await this.requestPermission()!=="granted")throw new Error("Notification permission denied");if(!this.vapidPublicKey)throw new Error("VAPID public key not available");let e=this.urlBase64ToUint8Array(this.vapidPublicKey);this.pushSubscription=await this.serviceWorkerRegistration.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:e});let t=this.pushSubscriptionToInterface(this.pushSubscription);return await this.sendSubscriptionToServer(t),this.notifySubscriptionChange(t),K.log("successfully subscribed to push notifications"),t}catch(i){throw K.error("failed to subscribe to push notifications:",i),i}}async unsubscribe(){if(this.pushSubscription)try{await this.pushSubscription.unsubscribe(),await this.removeSubscriptionFromServer(),this.pushSubscription=null,this.notifySubscriptionChange(null),K.log("successfully unsubscribed from push notifications")}catch(i){throw K.error("failed to unsubscribe from push notifications:",i),i}}getSubscription(){return this.pushSubscription?this.pushSubscriptionToInterface(this.pushSubscription):null}async waitForInitialization(){this.initializationPromise&&await this.initializationPromise}isSupported(){return"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window?window.isSecureContext?this.isIOSSafari()?this.isStandalone():!0:(K.warn("Push notifications require HTTPS or localhost"),!1):!1}isIOSSafari(){let i=navigator.userAgent.toLowerCase();return/iphone|ipad|ipod/.test(i)}isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||"standalone"in window.navigator&&window.navigator.standalone===!0}isSubscribed(){return this.pushSubscription!==null}async testNotification(){if(K.log("\u{1F514} Testing notification system..."),!this.serviceWorkerRegistration)throw new Error("Service worker not initialized");try{let i=new Promise(s=>{let n=!1,o=setTimeout(()=>{n||(K.warn("\u23F1\uFE0F Timeout waiting for SSE test notification"),r(),s())},5e3),r=ot.on("test-notification",async a=>{K.log("\u{1F4E8} Received test notification via SSE:",a),n=!0,clearTimeout(o),r();let m=a;this.serviceWorkerRegistration&&this.getPermission()==="granted"&&(await this.serviceWorkerRegistration.showNotification(m.title||"VibeTunnel Test",{body:m.body||"Test notification received via SSE!",icon:"/apple-touch-icon.png",badge:"/favicon-32.png",tag:"vibetunnel-test-sse",requireInteraction:!1}),K.log("\u2705 Displayed SSE test notification")),s()})});K.log("\u{1F4E4} Sending test notification request to server...");let e=await fetch("/api/test-notification",{method:"POST",headers:{"Content-Type":"application/json",...N.getAuthHeader()}});if(!e.ok){let s=await e.json();throw K.error("\u274C Server test notification failed:",s),new Error(s.error||"Failed to send test notification")}let t=await e.json();K.log("\u2705 Server test notification sent successfully:",t),await i,K.log("\u{1F389} Test notification complete - notification sent to all connected clients")}catch(i){throw K.error("\u274C Test notification failed:",i),i}}async clearAllNotifications(){if(this.serviceWorkerRegistration)try{let i=await this.serviceWorkerRegistration.getNotifications();for(let e of i)e.tag?.startsWith("vibetunnel-")&&e.close();K.log("cleared all notifications")}catch(i){K.error("failed to clear notifications:",i)}}async savePreferences(i){try{await Gs.updateNotificationPreferences(i),K.debug("saved notification preferences to config")}catch(e){throw K.error("failed to save notification preferences:",e),e}}async loadPreferences(){try{return await Gs.getNotificationPreferences()||this.getDefaultPreferences()}catch(i){return K.error("failed to load notification preferences from config:",i),this.getDefaultPreferences()}}getDefaultPreferences(){return es}getRecommendedPreferences(){return Wr}onPermissionChange(i){return this.permissionChangeCallbacks.add(i),()=>this.permissionChangeCallbacks.delete(i)}onSubscriptionChange(i){return this.subscriptionChangeCallbacks.add(i),()=>this.subscriptionChangeCallbacks.delete(i)}pushSubscriptionToInterface(i){let e=i.getKey("p256dh"),t=i.getKey("auth");if(!e||!t)throw new Error("Failed to get subscription keys");return{endpoint:i.endpoint,keys:{p256dh:this.arrayBufferToBase64(e),auth:this.arrayBufferToBase64(t)}}}async sendSubscriptionToServer(i){try{let e=await fetch("/api/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json",...N.getAuthHeader()},body:JSON.stringify(i)});if(!e.ok){let s=await e.text();throw new Error(`Server responded with ${e.status}: ${s||e.statusText}`)}let t=await e.json();K.log("subscription sent to server successfully",t)}catch(e){throw K.error("failed to send subscription to server:",e),e}}async removeSubscriptionFromServer(){try{let i=await fetch("/api/push/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:this.pushSubscription?.endpoint})});if(!i.ok)throw new Error(`Server responded with ${i.status}: ${i.statusText}`);K.log("subscription removed from server")}catch(i){K.error("failed to remove subscription from server:",i)}}urlBase64ToUint8Array(i){let e="=".repeat((4-i.length%4)%4),t=(i+e).replace(/-/g,"+").replace(/_/g,"/"),s=window.atob(t),n=new Uint8Array(s.length);for(let o=0;o<s.length;++o)n[o]=s.charCodeAt(o);return n}arrayBufferToBase64(i){let e=new Uint8Array(i),t="";for(let s=0;s<e.byteLength;s++)t+=String.fromCharCode(e[s]);return window.btoa(t)}async fetchVapidPublicKey(){try{let i=await fetch("/api/push/vapid-public-key",{headers:N.getAuthHeader()});if(!i.ok){if(i.status===503){K.warn("Push notifications not configured on server"),this.pushNotificationsAvailable=!1;return}throw new Error(`Server responded with ${i.status}: ${i.statusText}`)}let e=await i.json();if(!e.publicKey||!e.enabled){K.warn("Push notifications disabled on server"),this.pushNotificationsAvailable=!1;return}this.vapidPublicKey=e.publicKey,this.pushNotificationsAvailable=!0,K.log("VAPID public key fetched from server"),K.debug(`Public key: ${e.publicKey.substring(0,20)}...`)}catch(i){throw K.error("Failed to fetch VAPID public key:",i),this.pushNotificationsAvailable=!1,i}}async getServerStatus(){try{let i=await fetch("/api/push/status");if(!i.ok)throw new Error(`Server responded with ${i.status}: ${i.statusText}`);return await i.json()}catch(i){throw K.error("Failed to get server push status:",i),i}}async sendTestNotification(i){try{if(K.log("Sending test notification..."),!this.serviceWorkerRegistration)throw new Error("Service worker not registered");if(!this.vapidPublicKey)throw new Error("VAPID public key not available");if(!this.pushSubscription)throw new Error("No active push subscription");let e=await this.getServerStatus();if(!e.enabled)throw new Error("Push notifications disabled on server");if(!e.configured)throw new Error("VAPID keys not configured on server");let t=await fetch("/api/push/test",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:i||"Test notification from VibeTunnel"})});if(!t.ok){let n=await t.text();throw new Error(`Server responded with ${t.status}: ${n}`)}let s=await t.json();K.log("Test notification sent successfully:",s)}catch(e){throw K.error("Failed to send test notification:",e),e}}hasVapidKey(){return!!this.vapidPublicKey}getVapidPublicKey(){return this.vapidPublicKey}async refreshVapidConfig(){try{await this.fetchVapidPublicKey()}catch{}}async showWelcomeNotification(){if(this.serviceWorkerRegistration)try{await this.serviceWorkerRegistration.showNotification("VibeTunnel Notifications Active",{body:"You'll receive notifications for session events",icon:"/apple-touch-icon.png",badge:"/favicon-32.png",tag:"vibetunnel-welcome",requireInteraction:!1,silent:!1}),K.log("Welcome notification displayed")}catch(i){K.error("Failed to show welcome notification:",i)}}async forceRefreshSubscription(){try{K.log("Force refreshing subscription state"),this.pushSubscription=null,await this.waitForInitialization(),(await this.loadPreferences()).enabled&&await this.autoResubscribe(),K.log("Subscription state refresh completed")}catch(i){K.error("Error during subscription refresh:",i)}}getSubscriptionStatus(){return{hasPermission:this.getPermission()==="granted",hasServiceWorker:!!this.serviceWorkerRegistration,hasVapidKey:!!this.vapidPublicKey,hasSubscription:!!this.pushSubscription,preferences:null}}dispose(){this.permissionChangeCallbacks.clear(),this.subscriptionChangeCallbacks.clear(),this.initialized=!1,this.vapidPublicKey=null,this.pushNotificationsAvailable=!1}},X=new Ys;q();var ke=P("offline-notification-manager"),wo="vibetunnel-offline",xo=1,We="notifications",Qs=class{constructor(){this.db=null;this.isOnline=navigator.onLine;this.processingQueue=!1;this.initialized=!1;this.initialize().catch(i=>{ke.error("failed to initialize offline notification manager:",i)})}async initialize(){if(!this.initialized)try{await this.initializeDB(),this.setupOnlineListeners(),this.isOnline&&this.processQueue().catch(i=>{ke.error("failed to process initial queue:",i)}),this.initialized=!0,ke.log("offline notification manager initialized")}catch(i){throw ke.error("failed to initialize offline notification manager:",i),i}}async initializeDB(){return new Promise((i,e)=>{let t=indexedDB.open(wo,xo);t.onerror=()=>{e(new Error("Failed to open IndexedDB"))},t.onsuccess=()=>{this.db=t.result,i()},t.onupgradeneeded=s=>{let n=s.target.result;if(!n.objectStoreNames.contains(We)){let o=n.createObjectStore(We,{keyPath:"id"});o.createIndex("timestamp","timestamp"),o.createIndex("nextRetry","nextRetry")}}})}setupOnlineListeners(){window.addEventListener("online",()=>{ke.log("connection restored, processing queued notifications"),this.isOnline=!0,this.processQueue().catch(i=>{ke.error("failed to process queue after going online:",i)})}),window.addEventListener("offline",()=>{ke.log("connection lost, queueing notifications"),this.isOnline=!1})}async queueNotification(i,e=3){if(!this.db)throw new Error("Database not initialized");let t={id:this.generateId(),timestamp:Date.now(),payload:i,retryCount:0,maxRetries:e,nextRetry:Date.now()};try{return await this.storeNotification(t),ke.log("notification queued:",t.id),this.isOnline&&this.processQueue().catch(s=>{ke.error("failed to process queue after queueing:",s)}),t.id}catch(s){throw ke.error("failed to queue notification:",s),s}}async processQueue(){if(!(!this.db||this.processingQueue||!this.isOnline)){this.processingQueue=!0;try{let i=await this.getPendingNotifications();ke.log(`processing ${i.length} queued notifications`);for(let e of i)try{await this.processNotification(e)}catch(t){ke.error("failed to process notification:",e.id,t)}}catch(i){ke.error("failed to process notification queue:",i)}finally{this.processingQueue=!1}}}async processNotification(i){try{(await navigator.serviceWorker.ready).active?.postMessage({type:"QUEUE_NOTIFICATION",payload:i.payload}),await this.removeNotification(i.id),ke.log("notification processed successfully:",i.id)}catch(e){if(i.retryCount++,i.retryCount>=i.maxRetries)await this.removeNotification(i.id),ke.warn("notification max retries reached, removing:",i.id);else{let t=2**i.retryCount*1e3;i.nextRetry=Date.now()+t,await this.updateNotification(i),ke.log(`notification retry scheduled for ${new Date(i.nextRetry).toISOString()}:`,i.id)}throw e}}async getPendingNotifications(){if(!this.db)return[];let i=this.db;return new Promise((e,t)=>{let o=i.transaction([We],"readonly").objectStore(We).index("nextRetry"),r=IDBKeyRange.upperBound(Date.now()),a=o.getAll(r);a.onsuccess=()=>{e(a.result)},a.onerror=()=>{t(new Error("Failed to get pending notifications"))}})}async storeNotification(i){if(!this.db)throw new Error("Database not initialized");let e=this.db;return new Promise((t,s)=>{let r=e.transaction([We],"readwrite").objectStore(We).add(i);r.onsuccess=()=>t(),r.onerror=()=>s(new Error("Failed to store notification"))})}async updateNotification(i){if(!this.db)throw new Error("Database not initialized");let e=this.db;return new Promise((t,s)=>{let r=e.transaction([We],"readwrite").objectStore(We).put(i);r.onsuccess=()=>t(),r.onerror=()=>s(new Error("Failed to update notification"))})}async removeNotification(i){if(!this.db)throw new Error("Database not initialized");let e=this.db;return new Promise((t,s)=>{let r=e.transaction([We],"readwrite").objectStore(We).delete(i);r.onsuccess=()=>t(),r.onerror=()=>s(new Error("Failed to remove notification"))})}async getQueueStats(){if(!this.db)return{total:0,pending:0,failed:0,lastProcessed:0};let i=this.db;return new Promise((e,t)=>{let o=i.transaction([We],"readonly").objectStore(We).getAll();o.onsuccess=()=>{let r=o.result,a=Date.now(),m={total:r.length,pending:r.filter(p=>p.nextRetry<=a&&p.retryCount<p.maxRetries).length,failed:r.filter(p=>p.retryCount>=p.maxRetries).length,lastProcessed:Math.max(...r.map(p=>p.timestamp),0)};e(m)},o.onerror=()=>{t(new Error("Failed to get queue stats"))}})}async clearQueue(){if(!this.db)return;let i=this.db;return new Promise((e,t)=>{let o=i.transaction([We],"readwrite").objectStore(We).clear();o.onsuccess=()=>{ke.log("notification queue cleared"),e()},o.onerror=()=>{t(new Error("Failed to clear queue"))}})}isDeviceOnline(){return this.isOnline}async forceProcessQueue(){this.isOnline&&await this.processQueue()}generateId(){return`${Date.now()}-${Math.random().toString(36).substr(2,9)}`}dispose(){this.db&&(this.db.close(),this.db=null),window.removeEventListener("online",this.processQueue),window.removeEventListener("offline",()=>{}),this.initialized=!1}},Ga=new Qs;function So(){typeof window>"u"||typeof window.crypto>"u"||typeof window.crypto.randomUUID!="function"&&(window.crypto.randomUUID=()=>{let c=window.crypto.getRandomValues.bind(window.crypto),i=new Uint8Array(16);c(i),i[6]=i[6]&15|64,i[8]=i[8]&63|128;let e=[];for(let t=0;t<16;t++){let s=i[t];e.push((s<16?"0":"")+s.toString(16))}return[e.slice(0,4).join(""),e.slice(4,6).join(""),e.slice(6,8).join(""),e.slice(8,10).join(""),e.slice(10,16).join("")].join("-")},console.log("[crypto-polyfill] Added crypto.randomUUID() polyfill"))}So();function Ur(){let c=typeof process<"u"&&process.versions?.node,i=globalThis;if(i.__xtermErrorsSuppressed)return;i.__xtermErrorsSuppressed=!0;let e=console.error,t=console.warn;console.error=(...s)=>{Kr(s)||e.apply(console,s)},console.warn=(...s)=>{Kr(s)||t.apply(console,s)},c&&process.env.VIBETUNNEL_DEBUG==="1"&&t.call(console,"[suppress-xterm-errors] xterm.js error suppression activated")}function Kr(c){if(!c[0]||typeof c[0]!="string")return!1;let i=c[0];return!!(i.includes("xterm.js: Parsing error:")||i.includes("Unable to process character")&&i.includes("xterm"))}var ts=globalThis,is=ts.ShadowRoot&&(ts.ShadyCSS===void 0||ts.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Xs=Symbol(),qr=new WeakMap,Mi=class{constructor(i,e,t){if(this._$cssResult$=!0,t!==Xs)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=i,this.t=e}get styleSheet(){let i=this.o,e=this.t;if(is&&i===void 0){let t=e!==void 0&&e.length===1;t&&(i=qr.get(e)),i===void 0&&((this.o=i=new CSSStyleSheet).replaceSync(this.cssText),t&&qr.set(e,i))}return i}toString(){return this.cssText}},Vr=c=>new Mi(typeof c=="string"?c:c+"",void 0,Xs),Kt=(c,...i)=>{let e=c.length===1?c[0]:i.reduce((t,s,n)=>t+(o=>{if(o._$cssResult$===!0)return o.cssText;if(typeof o=="number")return o;throw Error("Value passed to 'css' function must be a 'css' function result: "+o+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+c[n+1],c[0]);return new Mi(e,c,Xs)},jr=(c,i)=>{if(is)c.adoptedStyleSheets=i.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(let e of i){let t=document.createElement("style"),s=ts.litNonce;s!==void 0&&t.setAttribute("nonce",s),t.textContent=e.cssText,c.appendChild(t)}},Js=is?c=>c:c=>c instanceof CSSStyleSheet?(i=>{let e="";for(let t of i.cssRules)e+=t.cssText;return Vr(e)})(c):c;var{is:Co,defineProperty:ko,getOwnPropertyDescriptor:_o,getOwnPropertyNames:Eo,getOwnPropertySymbols:To,getPrototypeOf:Mo}=Object,kt=globalThis,Gr=kt.trustedTypes,$o=Gr?Gr.emptyScript:"",Io=kt.reactiveElementPolyfillSupport,$i=(c,i)=>c,Ii={toAttribute(c,i){switch(i){case Boolean:c=c?$o:null;break;case Object:case Array:c=c==null?c:JSON.stringify(c)}return c},fromAttribute(c,i){let e=c;switch(i){case Boolean:e=c!==null;break;case Number:e=c===null?null:Number(c);break;case Object:case Array:try{e=JSON.parse(c)}catch{e=null}}return e}},ss=(c,i)=>!Co(c,i),Yr={attribute:!0,type:String,converter:Ii,reflect:!1,useDefault:!1,hasChanged:ss};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),kt.litPropertyMetadata??(kt.litPropertyMetadata=new WeakMap);var pt=class extends HTMLElement{static addInitializer(i){this._$Ei(),(this.l??(this.l=[])).push(i)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(i,e=Yr){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(i)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(i,e),!e.noAccessor){let t=Symbol(),s=this.getPropertyDescriptor(i,t,e);s!==void 0&&ko(this.prototype,i,s)}}static getPropertyDescriptor(i,e,t){let{get:s,set:n}=_o(this.prototype,i)??{get(){return this[e]},set(o){this[e]=o}};return{get:s,set(o){let r=s?.call(this);n?.call(this,o),this.requestUpdate(i,r,t)},configurable:!0,enumerable:!0}}static getPropertyOptions(i){return this.elementProperties.get(i)??Yr}static _$Ei(){if(this.hasOwnProperty($i("elementProperties")))return;let i=Mo(this);i.finalize(),i.l!==void 0&&(this.l=[...i.l]),this.elementProperties=new Map(i.elementProperties)}static finalize(){if(this.hasOwnProperty($i("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty($i("properties"))){let e=this.properties,t=[...Eo(e),...To(e)];for(let s of t)this.createProperty(s,e[s])}let i=this[Symbol.metadata];if(i!==null){let e=litPropertyMetadata.get(i);if(e!==void 0)for(let[t,s]of e)this.elementProperties.set(t,s)}this._$Eh=new Map;for(let[e,t]of this.elementProperties){let s=this._$Eu(e,t);s!==void 0&&this._$Eh.set(s,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(i){let e=[];if(Array.isArray(i)){let t=new Set(i.flat(1/0).reverse());for(let s of t)e.unshift(Js(s))}else i!==void 0&&e.push(Js(i));return e}static _$Eu(i,e){let t=e.attribute;return t===!1?void 0:typeof t=="string"?t:typeof i=="string"?i.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(i=>this.enableUpdating=i),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(i=>i(this))}addController(i){(this._$EO??(this._$EO=new Set)).add(i),this.renderRoot!==void 0&&this.isConnected&&i.hostConnected?.()}removeController(i){this._$EO?.delete(i)}_$E_(){let i=new Map,e=this.constructor.elementProperties;for(let t of e.keys())this.hasOwnProperty(t)&&(i.set(t,this[t]),delete this[t]);i.size>0&&(this._$Ep=i)}createRenderRoot(){let i=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return jr(i,this.constructor.elementStyles),i}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(i=>i.hostConnected?.())}enableUpdating(i){}disconnectedCallback(){this._$EO?.forEach(i=>i.hostDisconnected?.())}attributeChangedCallback(i,e,t){this._$AK(i,t)}_$ET(i,e){let t=this.constructor.elementProperties.get(i),s=this.constructor._$Eu(i,t);if(s!==void 0&&t.reflect===!0){let n=(t.converter?.toAttribute!==void 0?t.converter:Ii).toAttribute(e,t.type);this._$Em=i,n==null?this.removeAttribute(s):this.setAttribute(s,n),this._$Em=null}}_$AK(i,e){let t=this.constructor,s=t._$Eh.get(i);if(s!==void 0&&this._$Em!==s){let n=t.getPropertyOptions(s),o=typeof n.converter=="function"?{fromAttribute:n.converter}:n.converter?.fromAttribute!==void 0?n.converter:Ii;this._$Em=s;let r=o.fromAttribute(e,n.type);this[s]=r??this._$Ej?.get(s)??r,this._$Em=null}}requestUpdate(i,e,t){if(i!==void 0){let s=this.constructor,n=this[i];if(t??(t=s.getPropertyOptions(i)),!((t.hasChanged??ss)(n,e)||t.useDefault&&t.reflect&&n===this._$Ej?.get(i)&&!this.hasAttribute(s._$Eu(i,t))))return;this.C(i,e,t)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(i,e,{useDefault:t,reflect:s,wrapped:n},o){t&&!(this._$Ej??(this._$Ej=new Map)).has(i)&&(this._$Ej.set(i,o??e??this[i]),n!==!0||o!==void 0)||(this._$AL.has(i)||(this.hasUpdated||t||(e=void 0),this._$AL.set(i,e)),s===!0&&this._$Em!==i&&(this._$Eq??(this._$Eq=new Set)).add(i))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}let i=this.scheduleUpdate();return i!=null&&await i,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(let[s,n]of this._$Ep)this[s]=n;this._$Ep=void 0}let t=this.constructor.elementProperties;if(t.size>0)for(let[s,n]of t){let{wrapped:o}=n,r=this[s];o!==!0||this._$AL.has(s)||r===void 0||this.C(s,void 0,n,r)}}let i=!1,e=this._$AL;try{i=this.shouldUpdate(e),i?(this.willUpdate(e),this._$EO?.forEach(t=>t.hostUpdate?.()),this.update(e)):this._$EM()}catch(t){throw i=!1,this._$EM(),t}i&&this._$AE(e)}willUpdate(i){}_$AE(i){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(i)),this.updated(i)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(i){return!0}update(i){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(i){}firstUpdated(i){}};pt.elementStyles=[],pt.shadowRootOptions={mode:"open"},pt[$i("elementProperties")]=new Map,pt[$i("finalized")]=new Map,Io?.({ReactiveElement:pt}),(kt.reactiveElementVersions??(kt.reactiveElementVersions=[])).push("2.1.1");var Li=globalThis,rs=Li.trustedTypes,Qr=rs?rs.createPolicy("lit-html",{createHTML:c=>c}):void 0,er="$lit$",mt=`lit$${Math.random().toFixed(9).slice(2)}$`,tr="?"+mt,Ao=`<${tr}>`,Vt=document,Pi=()=>Vt.createComment(""),Bi=c=>c===null||typeof c!="object"&&typeof c!="function",ir=Array.isArray,sn=c=>ir(c)||typeof c?.[Symbol.iterator]=="function",Zs=`[ 	
\f\r]`,Ai=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Xr=/-->/g,Jr=/>/g,Ut=RegExp(`>|${Zs}(?:([^\\s"'>=/]+)(${Zs}*=${Zs}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Zr=/'/g,en=/"/g,rn=/^(?:script|style|textarea|title)$/i,sr=c=>(i,...e)=>({_$litType$:c,strings:i,values:e}),u=sr(1),il=sr(2),sl=sr(3),ft=Symbol.for("lit-noChange"),j=Symbol.for("lit-nothing"),tn=new WeakMap,qt=Vt.createTreeWalker(Vt,129);function nn(c,i){if(!ir(c)||!c.hasOwnProperty("raw"))throw Error("invalid template strings array");return Qr!==void 0?Qr.createHTML(i):i}var on=(c,i)=>{let e=c.length-1,t=[],s,n=i===2?"<svg>":i===3?"<math>":"",o=Ai;for(let r=0;r<e;r++){let a=c[r],m,p,h=-1,v=0;for(;v<a.length&&(o.lastIndex=v,p=o.exec(a),p!==null);)v=o.lastIndex,o===Ai?p[1]==="!--"?o=Xr:p[1]!==void 0?o=Jr:p[2]!==void 0?(rn.test(p[2])&&(s=RegExp("</"+p[2],"g")),o=Ut):p[3]!==void 0&&(o=Ut):o===Ut?p[0]===">"?(o=s??Ai,h=-1):p[1]===void 0?h=-2:(h=o.lastIndex-p[2].length,m=p[1],o=p[3]===void 0?Ut:p[3]==='"'?en:Zr):o===en||o===Zr?o=Ut:o===Xr||o===Jr?o=Ai:(o=Ut,s=void 0);let f=o===Ut&&c[r+1].startsWith("/>")?" ":"";n+=o===Ai?a+Ao:h>=0?(t.push(m),a.slice(0,h)+er+a.slice(h)+mt+f):a+mt+(h===-2?r:f)}return[nn(c,n+(c[e]||"<?>")+(i===2?"</svg>":i===3?"</math>":"")),t]},Ri=class c{constructor({strings:i,_$litType$:e},t){let s;this.parts=[];let n=0,o=0,r=i.length-1,a=this.parts,[m,p]=on(i,e);if(this.el=c.createElement(m,t),qt.currentNode=this.el.content,e===2||e===3){let h=this.el.content.firstChild;h.replaceWith(...h.childNodes)}for(;(s=qt.nextNode())!==null&&a.length<r;){if(s.nodeType===1){if(s.hasAttributes())for(let h of s.getAttributeNames())if(h.endsWith(er)){let v=p[o++],f=s.getAttribute(h).split(mt),w=/([.?@])?(.*)/.exec(v);a.push({type:1,index:n,name:w[2],strings:f,ctor:w[1]==="."?os:w[1]==="?"?as:w[1]==="@"?ls:Gt}),s.removeAttribute(h)}else h.startsWith(mt)&&(a.push({type:6,index:n}),s.removeAttribute(h));if(rn.test(s.tagName)){let h=s.textContent.split(mt),v=h.length-1;if(v>0){s.textContent=rs?rs.emptyScript:"";for(let f=0;f<v;f++)s.append(h[f],Pi()),qt.nextNode(),a.push({type:2,index:++n});s.append(h[v],Pi())}}}else if(s.nodeType===8)if(s.data===tr)a.push({type:2,index:n});else{let h=-1;for(;(h=s.data.indexOf(mt,h+1))!==-1;)a.push({type:7,index:n}),h+=mt.length-1}n++}}static createElement(i,e){let t=Vt.createElement("template");return t.innerHTML=i,t}};function jt(c,i,e=c,t){if(i===ft)return i;let s=t!==void 0?e._$Co?.[t]:e._$Cl,n=Bi(i)?void 0:i._$litDirective$;return s?.constructor!==n&&(s?._$AO?.(!1),n===void 0?s=void 0:(s=new n(c),s._$AT(c,e,t)),t!==void 0?(e._$Co??(e._$Co=[]))[t]=s:e._$Cl=s),s!==void 0&&(i=jt(c,s._$AS(c,i.values),s,t)),i}var ns=class{constructor(i,e){this._$AV=[],this._$AN=void 0,this._$AD=i,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(i){let{el:{content:e},parts:t}=this._$AD,s=(i?.creationScope??Vt).importNode(e,!0);qt.currentNode=s;let n=qt.nextNode(),o=0,r=0,a=t[0];for(;a!==void 0;){if(o===a.index){let m;a.type===2?m=new li(n,n.nextSibling,this,i):a.type===1?m=new a.ctor(n,a.name,a.strings,this,i):a.type===6&&(m=new cs(n,this,i)),this._$AV.push(m),a=t[++r]}o!==a?.index&&(n=qt.nextNode(),o++)}return qt.currentNode=Vt,s}p(i){let e=0;for(let t of this._$AV)t!==void 0&&(t.strings!==void 0?(t._$AI(i,t,e),e+=t.strings.length-2):t._$AI(i[e])),e++}},li=class c{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(i,e,t,s){this.type=2,this._$AH=j,this._$AN=void 0,this._$AA=i,this._$AB=e,this._$AM=t,this.options=s,this._$Cv=s?.isConnected??!0}get parentNode(){let i=this._$AA.parentNode,e=this._$AM;return e!==void 0&&i?.nodeType===11&&(i=e.parentNode),i}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(i,e=this){i=jt(this,i,e),Bi(i)?i===j||i==null||i===""?(this._$AH!==j&&this._$AR(),this._$AH=j):i!==this._$AH&&i!==ft&&this._(i):i._$litType$!==void 0?this.$(i):i.nodeType!==void 0?this.T(i):sn(i)?this.k(i):this._(i)}O(i){return this._$AA.parentNode.insertBefore(i,this._$AB)}T(i){this._$AH!==i&&(this._$AR(),this._$AH=this.O(i))}_(i){this._$AH!==j&&Bi(this._$AH)?this._$AA.nextSibling.data=i:this.T(Vt.createTextNode(i)),this._$AH=i}$(i){let{values:e,_$litType$:t}=i,s=typeof t=="number"?this._$AC(i):(t.el===void 0&&(t.el=Ri.createElement(nn(t.h,t.h[0]),this.options)),t);if(this._$AH?._$AD===s)this._$AH.p(e);else{let n=new ns(s,this),o=n.u(this.options);n.p(e),this.T(o),this._$AH=n}}_$AC(i){let e=tn.get(i.strings);return e===void 0&&tn.set(i.strings,e=new Ri(i)),e}k(i){ir(this._$AH)||(this._$AH=[],this._$AR());let e=this._$AH,t,s=0;for(let n of i)s===e.length?e.push(t=new c(this.O(Pi()),this.O(Pi()),this,this.options)):t=e[s],t._$AI(n),s++;s<e.length&&(this._$AR(t&&t._$AB.nextSibling,s),e.length=s)}_$AR(i=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);i!==this._$AB;){let t=i.nextSibling;i.remove(),i=t}}setConnected(i){this._$AM===void 0&&(this._$Cv=i,this._$AP?.(i))}},Gt=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(i,e,t,s,n){this.type=1,this._$AH=j,this._$AN=void 0,this.element=i,this.name=e,this._$AM=s,this.options=n,t.length>2||t[0]!==""||t[1]!==""?(this._$AH=Array(t.length-1).fill(new String),this.strings=t):this._$AH=j}_$AI(i,e=this,t,s){let n=this.strings,o=!1;if(n===void 0)i=jt(this,i,e,0),o=!Bi(i)||i!==this._$AH&&i!==ft,o&&(this._$AH=i);else{let r=i,a,m;for(i=n[0],a=0;a<n.length-1;a++)m=jt(this,r[t+a],e,a),m===ft&&(m=this._$AH[a]),o||(o=!Bi(m)||m!==this._$AH[a]),m===j?i=j:i!==j&&(i+=(m??"")+n[a+1]),this._$AH[a]=m}o&&!s&&this.j(i)}j(i){i===j?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,i??"")}},os=class extends Gt{constructor(){super(...arguments),this.type=3}j(i){this.element[this.name]=i===j?void 0:i}},as=class extends Gt{constructor(){super(...arguments),this.type=4}j(i){this.element.toggleAttribute(this.name,!!i&&i!==j)}},ls=class extends Gt{constructor(i,e,t,s,n){super(i,e,t,s,n),this.type=5}_$AI(i,e=this){if((i=jt(this,i,e,0)??j)===ft)return;let t=this._$AH,s=i===j&&t!==j||i.capture!==t.capture||i.once!==t.once||i.passive!==t.passive,n=i!==j&&(t===j||s);s&&this.element.removeEventListener(this.name,this,t),n&&this.element.addEventListener(this.name,this,i),this._$AH=i}handleEvent(i){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,i):this._$AH.handleEvent(i)}},cs=class{constructor(i,e,t){this.element=i,this.type=6,this._$AN=void 0,this._$AM=e,this.options=t}get _$AU(){return this._$AM._$AU}_$AI(i){jt(this,i)}},an={M:er,P:mt,A:tr,C:1,L:on,R:ns,D:sn,V:jt,I:li,H:Gt,N:as,U:ls,B:os,F:cs},Lo=Li.litHtmlPolyfillSupport;Lo?.(Ri,li),(Li.litHtmlVersions??(Li.litHtmlVersions=[])).push("3.3.1");var ln=(c,i,e)=>{let t=e?.renderBefore??i,s=t._$litPart$;if(s===void 0){let n=e?.renderBefore??null;t._$litPart$=s=new li(i.insertBefore(Pi(),n),n,void 0,e??{})}return s._$AI(c),s};var Di=globalThis,R=class extends pt{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;let i=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=i.firstChild),i}update(i){let e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(i),this._$Do=ln(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return ft}};R._$litElement$=!0,R.finalized=!0,Di.litElementHydrateSupport?.({LitElement:R});var Po=Di.litElementPolyfillSupport;Po?.({LitElement:R});(Di.litElementVersions??(Di.litElementVersions=[])).push("4.2.1");var D=c=>(i,e)=>{e!==void 0?e.addInitializer(()=>{customElements.define(c,i)}):customElements.define(c,i)};var Bo={attribute:!0,type:String,converter:Ii,reflect:!1,hasChanged:ss},Ro=(c=Bo,i,e)=>{let{kind:t,metadata:s}=e,n=globalThis.litPropertyMetadata.get(s);if(n===void 0&&globalThis.litPropertyMetadata.set(s,n=new Map),t==="setter"&&((c=Object.create(c)).wrapped=!0),n.set(e.name,c),t==="accessor"){let{name:o}=e;return{set(r){let a=i.get.call(this);i.set.call(this,r),this.requestUpdate(o,a,c)},init(r){return r!==void 0&&this.C(o,void 0,c,r),r}}}if(t==="setter"){let{name:o}=e;return function(r){let a=this[o];i.call(this,r),this.requestUpdate(o,a,c)}}throw Error("Unsupported decorator location: "+t)};function C(c){return(i,e)=>typeof e=="object"?Ro(c,i,e):((t,s,n)=>{let o=s.hasOwnProperty(n);return s.constructor.createProperty(n,t),o?Object.getOwnPropertyDescriptor(s,n):void 0})(c,i,e)}function _(c){return C({...c,state:!0,attribute:!1})}var Yt=(c,i,e)=>(e.configurable=!0,e.enumerable=!0,Reflect.decorate&&typeof i!="object"&&Object.defineProperty(c,i,e),e);function rr(c,i){return(e,t,s)=>{let n=o=>o.renderRoot?.querySelector(c)??null;if(i){let{get:o,set:r}=typeof t=="object"?e:s??(()=>{let a=Symbol();return{get(){return this[a]},set(m){this[a]=m}}})();return Yt(e,t,{get(){let a=o.call(this);return a===void 0&&(a=n(this),(a!==null||this.hasUpdated)&&r.call(this,a)),a}})}return Yt(e,t,{get(){return n(this)}})}}var hs={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},Qt=c=>(...i)=>({_$litDirective$:c,values:i}),_t=class{constructor(i){}get _$AU(){return this._$AM._$AU}_$AT(i,e,t){this._$Ct=i,this._$AM=e,this._$Ci=t}_$AS(i,e){return this.update(i,e)}update(i,e){return this.render(...e)}};var{I:Do}=an;var hn=c=>c.strings===void 0,cn=()=>document.createComment(""),ci=(c,i,e)=>{let t=c._$AA.parentNode,s=i===void 0?c._$AB:i._$AA;if(e===void 0){let n=t.insertBefore(cn(),s),o=t.insertBefore(cn(),s);e=new Do(n,o,c,c.options)}else{let n=e._$AB.nextSibling,o=e._$AM,r=o!==c;if(r){let a;e._$AQ?.(c),e._$AM=c,e._$AP!==void 0&&(a=c._$AU)!==o._$AU&&e._$AP(a)}if(n!==s||r){let a=e._$AA;for(;a!==n;){let m=a.nextSibling;t.insertBefore(a,s),a=m}}}return e},Et=(c,i,e=c)=>(c._$AI(i,e),c),Ho={},ds=(c,i=Ho)=>c._$AH=i,dn=c=>c._$AH,us=c=>{c._$AR(),c._$AA.remove()};var un=Qt(class extends _t{constructor(){super(...arguments),this.key=j}render(c,i){return this.key=c,i}update(c,[i,e]){return i!==this.key&&(ds(c),this.key=i),e}});we();function hi(){return navigator.platform.toLowerCase().includes("mac")}var Fo=/^[0-9]$/,pn={mac:{withCmd:{noModifiers:["t","n","w","q","h","m",","],withShift:["t","n","a","z","]","[","j","c"],withAlt:["w"]}},other:{withCtrl:{noModifiers:["t","n","w","h"],withShift:["t","n","j","c"],withAlt:["f4"]}}},nr={mac:["c","x","v"],other:["c","x","v"]};function ps(c){let{key:i,ctrlKey:e,metaKey:t,altKey:s,shiftKey:n}=c,o=i.toLowerCase(),r=hi()?t:e;if((hi()?e:t)||!r)return!!(!hi()&&s&&!e&&!t&&!n&&o==="f4");let m=n?"withShift":s?"withAlt":"noModifiers",p=hi()?"mac":"other";return!!((hi()?pn.mac.withCmd:pn.other.withCtrl)[m]?.includes(o)||!n&&!s&&(Fo.test(i)||nr[p].includes(o)))}function or(c){let{key:i,ctrlKey:e,metaKey:t,altKey:s,shiftKey:n}=c,o=i.toLowerCase();return hi()?t&&!e&&!s&&!n&&nr.mac.includes(o):e&&!t&&!s&&!n&&nr.other.includes(o)}var at={MOBILE:768,TABLET:1024,DESKTOP:1280},Tt={DEFAULT_WIDTH:420,MIN_WIDTH:240,MAX_WIDTH:600,MOBILE_RIGHT_MARGIN:80},ar={SIDEBAR:200,MOBILE_SLIDE:200,RESIZE_HANDLE:200},ie={SESSION_LIST_BOTTOM_BAR:10,TERMINAL_OVERLAY:15,LOG_BUTTON:20,MOBILE_OVERLAY:25,SIDEBAR_MOBILE:30,MOBILE_INPUT_OVERLAY:40,CTRL_ALPHA_OVERLAY:45,TERMINAL_QUICK_KEYS:48,WIDTH_SELECTOR_DROPDOWN:60,BRANCH_SELECTOR_DROPDOWN:65,IME_INPUT:70,MODAL_BACKDROP:100,MODAL:105,FILE_PICKER:110,SESSION_EXITED_OVERLAY:120,NOTIFICATION:150,FILE_BROWSER:1100};var Xt={AUTO_REFRESH_INTERVAL:1e3,SESSION_SEARCH_DELAY:500,KILL_ALL_ANIMATION_DELAY:500,ERROR_MESSAGE_TIMEOUT:5e3,SUCCESS_MESSAGE_TIMEOUT:5e3,KILL_ALL_BUTTON_DISABLE_DURATION:2e3};q();function ms(){return/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||!!navigator.maxTouchPoints&&navigator.maxTouchPoints>1}function mn(){return/iPad|iPhone|iPod/.test(navigator.userAgent)}var lr=class{constructor(){this.callbacks=new Set;this.resizeObserver=null;this.currentState=this.getMediaQueryState();try{this.resizeObserver=new ResizeObserver(()=>{try{let i=this.getMediaQueryState();this.hasStateChanged(this.currentState,i)&&(this.currentState=i,this.notifyCallbacks(i))}catch(i){console.error("Error in ResizeObserver callback:",i)}}),this.resizeObserver.observe(document.documentElement)}catch(i){console.error("Failed to initialize ResizeObserver:",i),this.setupFallbackResizeListener()}}setupFallbackResizeListener(){let i,e=()=>{clearTimeout(i),i=window.setTimeout(()=>{let t=this.getMediaQueryState();this.hasStateChanged(this.currentState,t)&&(this.currentState=t,this.notifyCallbacks(t))},100)};window.addEventListener("resize",e)}getMediaQueryState(){let i=window.innerWidth;return{isMobile:i<at.MOBILE,isTablet:i>=at.MOBILE&&i<at.DESKTOP,isDesktop:i>=at.DESKTOP}}hasStateChanged(i,e){return i.isMobile!==e.isMobile||i.isTablet!==e.isTablet||i.isDesktop!==e.isDesktop}notifyCallbacks(i){this.callbacks.forEach(e=>e(i))}subscribe(i){return this.callbacks.add(i),i(this.currentState),()=>{this.callbacks.delete(i)}}getCurrentState(){return{...this.currentState}}destroy(){this.resizeObserver&&this.resizeObserver.disconnect(),this.callbacks.clear()}},Mt=new lr;q();var fn=P("terminal-utils");function gn(c,i){requestAnimationFrame(()=>{let t=(i||document).querySelector("vibe-terminal");t?.fitTerminal?(fn.debug(`triggering terminal resize for session ${c}`),t.fitTerminal()):fn.warn(`terminal not found or fitTerminal method unavailable for session ${c}`)})}var cr=class c{constructor(){this.cleanupFunctions=[];this.currentSessionId=null}static getInstance(){return c.instance||(c.instance=new c),c.instance}setSessionTitle(i){document.title=`VibeTunnel - ${i}`}setListTitle(i){document.title=i>0?`VibeTunnel - ${i} Session${i!==1?"s":""}`:"VibeTunnel"}setFileBrowserTitle(){document.title="VibeTunnel - File Browser"}initAutoUpdates(){this.cleanup();let i=()=>{let o=new URL(window.location.href).searchParams.get("session");o!==this.currentSessionId&&(this.currentSessionId=o,o||setTimeout(()=>{let r=document.querySelectorAll("session-card").length;this.setListTitle(r)},100))};i();let e=null,t=new MutationObserver(()=>{e&&clearTimeout(e),e=setTimeout(i,100)});t.observe(document.body,{childList:!0,subtree:!0});let s=()=>i();window.addEventListener("popstate",s),this.cleanupFunctions=[()=>t.disconnect(),()=>window.removeEventListener("popstate",s),()=>{e&&clearTimeout(e)}]}cleanup(){this.cleanupFunctions.forEach(i=>i()),this.cleanupFunctions=[]}},$t=cr.getInstance();var di=class extends R{constructor(){super(...arguments);this.size=24}render(){return u`
      <img
        src="/apple-touch-icon.png"
        alt="VibeTunnel"
        style="width: ${this.size}px; height: ${this.size}px"
        class="terminal-icon"
      />
    `}};di.styles=Kt`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    svg {
      display: block;
      width: var(--icon-size, 24px);
      height: var(--icon-size, 24px);
    }

    .terminal-icon {
      border-radius: 20%;
      box-shadow:
        0 2px 8px rgb(var(--color-bg-base) / 0.3),
        0 1px 3px rgb(var(--color-bg-base) / 0.2);
      background: rgb(var(--color-text-bright) / 0.05);
      padding: 2px;
    }
  `,d([C({type:Number})],di.prototype,"size",2),di=d([D("terminal-icon")],di);q();var fs=P("notification-status"),ui=class extends R{constructor(){super(...arguments);this.isSSEConnected=!1;this.notificationPermission="default"}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),setTimeout(()=>{this.initializeComponent()},10)}disconnectedCallback(){super.disconnectedCallback(),this.connectionStateUnsubscribe&&this.connectionStateUnsubscribe()}initializeComponent(){this.isSSEConnected=ot.getConnectionStatus(),fs.debug("Initial SSE connection status:",this.isSSEConnected),this.notificationPermission=typeof Notification<"u"?Notification.permission:"default",fs.debug("Initial notification permission:",this.notificationPermission),this.requestUpdate(),this.connectionStateUnsubscribe=ot.onConnectionStateChange(e=>{fs.log(`SSE connection state changed: ${e?"connected":"disconnected"}`),this.isSSEConnected=e}),typeof navigator<"u"&&navigator.permissions&&navigator.permissions.query({name:"notifications"}).then(e=>{e.addEventListener("change",()=>{this.notificationPermission=typeof Notification<"u"?Notification.permission:"default",fs.debug("Notification permission changed:",this.notificationPermission)})}).catch(()=>{})}handleClick(){this.dispatchEvent(new CustomEvent("open-settings"))}getStatusConfig(){return this.notificationPermission==="denied"?{color:"text-red-400",tooltip:"Settings (Notifications denied)"}:this.notificationPermission==="default"?{color:"text-gray-400",tooltip:"Settings (Notifications disabled)"}:this.isSSEConnected?{color:"text-status-success",tooltip:"Settings (Notifications connected)"}:{color:"text-muted",tooltip:"Settings (Notifications disconnected)"}}renderIcon(){return u`
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
      </svg>
    `}render(){let{color:e,tooltip:t}=this.getStatusConfig();return u`
      <button
        @click=${this.handleClick}
        class="bg-bg-tertiary border border-border rounded-lg p-2 ${e} transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary hover:shadow-sm"
        title="${t}"
      >
        ${this.renderIcon()}
      </button>
    `}};d([_()],ui.prototype,"isSSEConnected",2),d([_()],ui.prototype,"notificationPermission",2),ui=d([D("notification-status")],ui);var qe=class extends R{constructor(){super(...arguments);this.sessions=[];this.hideExited=!0;this.currentUser=null;this.authMethod=null;this.currentTheme="system";this.killingAll=!1;this.showUserMenu=!1;this.handleClickOutside=e=>{e.target.closest(".user-menu-container")||(this.showUserMenu=!1)}}createRenderRoot(){return this}get runningSessions(){return this.sessions.filter(e=>e.status==="running")}get exitedSessions(){return this.sessions.filter(e=>e.status==="exited")}handleCreateSession(e){let s=e.currentTarget.getBoundingClientRect();document.documentElement.style.setProperty("--vt-button-x",`${s.left+s.width/2}px`),document.documentElement.style.setProperty("--vt-button-y",`${s.top+s.height/2}px`),document.documentElement.style.setProperty("--vt-button-width",`${s.width}px`),document.documentElement.style.setProperty("--vt-button-height",`${s.height}px`),this.dispatchEvent(new CustomEvent("create-session"))}handleKillAll(){this.killingAll||(this.killingAll=!0,this.requestUpdate(),this.dispatchEvent(new CustomEvent("kill-all-sessions")),window.setTimeout(()=>{this.killingAll=!1},Xt.KILL_ALL_BUTTON_DISABLE_DURATION))}handleCleanExited(){this.dispatchEvent(new CustomEvent("clean-exited-sessions"))}handleHideExitedToggle(){this.dispatchEvent(new CustomEvent("hide-exited-change",{detail:!this.hideExited}))}handleOpenFileBrowser(){this.dispatchEvent(new CustomEvent("open-file-browser"))}handleOpenTmuxSessions(){this.dispatchEvent(new CustomEvent("open-tmux-sessions"))}handleOpenSettings(){this.showUserMenu=!1,this.dispatchEvent(new CustomEvent("open-settings"))}handleLogout(){this.showUserMenu=!1,this.dispatchEvent(new CustomEvent("logout"))}toggleUserMenu(){this.showUserMenu=!this.showUserMenu}handleHomeClick(){this.dispatchEvent(new CustomEvent("navigate-to-list"))}connectedCallback(){super.connectedCallback(),document.addEventListener("click",this.handleClickOutside);let e=localStorage.getItem("vibetunnel-theme");this.currentTheme=e||"system"}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("click",this.handleClickOutside)}};d([C({type:Array})],qe.prototype,"sessions",2),d([C({type:Boolean})],qe.prototype,"hideExited",2),d([C({type:String})],qe.prototype,"currentUser",2),d([C({type:String})],qe.prototype,"authMethod",2),d([C({type:String})],qe.prototype,"currentTheme",2),d([_()],qe.prototype,"killingAll",2),d([_()],qe.prototype,"showUserMenu",2);var gs=class extends qe{render(){let i=this.runningSessions;return u`
      <div
        class="app-header sidebar-header bg-bg-secondary px-4 py-2"
        style="padding-top: max(0.625rem, env(safe-area-inset-top));"
      >
        <!-- Compact layout for sidebar -->
        <div class="flex items-center gap-2">
          <!-- Toggle button -->
          <button
            class="p-2 text-primary bg-bg-tertiary border border-border hover:bg-surface-hover hover:border-primary rounded-md transition-all duration-200 flex-shrink-0"
            @click=${()=>this.dispatchEvent(new CustomEvent("toggle-sidebar"))}
            title="Collapse sidebar (⌘B)"
            aria-label="Collapse sidebar"
            aria-expanded="true"
            aria-controls="sidebar"
            data-button-id="toggle-sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/>
            </svg>
          </button>
          
          <!-- Go to Root button -->
          <button
            class="p-2 text-primary bg-bg-tertiary border border-border hover:bg-surface-hover hover:border-primary rounded-md transition-all duration-200 flex-shrink-0"
            @click=${()=>{window.location.href="/"}}
            title="Go to root"
            data-testid="go-to-root-button-sidebar"
            data-button-id="go-to-root"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <!-- Four small rounded rectangles icon -->
              <rect x="3" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
              <rect x="11" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
              <rect x="3" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
              <rect x="11" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
            </svg>
          </button>
          
          <!-- Title and logo with flex-grow for centering -->
          <button
            class="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer group flex-grow"
            title="Go to home"
            @click=${this.handleHomeClick}
          >
            <terminal-icon size="20"></terminal-icon>
            <div class="min-w-0">
              <h1
                class="text-sm font-bold text-primary font-mono group-hover:underline truncate"
              >
                VibeTunnel
              </h1>
              <p class="text-text-muted text-xs font-mono">
                ${i.length} ${i.length===1?"session":"sessions"}
              </p>
            </div>
          </button>
          
          <!-- Action buttons group with consistent styling -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- tmux Sessions button -->
            <button
              class="p-2 text-primary bg-bg-tertiary border border-border hover:bg-surface-hover hover:border-primary rounded-md transition-all duration-200 flex-shrink-0"
              @click=${this.handleOpenTmuxSessions}
              title="tmux Sessions"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2v12h12V2H2zM1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm7 3h5v2H8V5zm0 3h5v2H8V8zm0 3h5v2H8v-2zM3 5h4v2H3V5zm0 3h4v2H3V8zm0 3h4v2H3v-2z"/>
              </svg>
            </button>
            <!-- Create Session button with dark theme styling -->
            <button
              class="p-2 text-primary bg-bg-tertiary border border-border hover:bg-surface-hover hover:border-primary rounded-md transition-all duration-200 flex-shrink-0"
              @click=${this.handleCreateSession}
              title="Create New Session (⌘K)"
              data-testid="create-session-button"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
              </svg>
            </button>
            
            <!-- User menu -->
            ${this.renderCompactUserMenu()}
          </div>
        </div>
      </div>
    `}renderCompactUserMenu(){return this.currentUser?u`
      <div class="user-menu-container relative">
        <button
          class="font-mono text-xs px-2 py-1 text-text-muted hover:text-text rounded border border-border hover:bg-bg-tertiary transition-all duration-200"
          @click=${this.toggleUserMenu}
          title="User menu"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
            />
          </svg>
        </button>
        ${this.showUserMenu?u`
              <div
                class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 min-w-32"
              >
                <div
                  class="px-3 py-1.5 text-xs text-text-muted border-b border-border font-mono"
                >
                  ${this.currentUser}
                </div>
                <button
                  class="w-full text-left px-3 py-1.5 text-xs font-mono text-status-warning hover:bg-bg-secondary hover:text-status-error"
                  @click=${this.handleLogout}
                >
                  Logout
                </button>
              </div>
            `:""}
      </div>
    `:u``}};gs=d([D("sidebar-header")],gs);var Hi=class extends R{constructor(){super(...arguments);this.theme="system";this.STORAGE_KEY="vibetunnel-theme";this.handleSystemThemeChange=()=>{this.theme==="system"&&this.applyTheme()}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback();let e=localStorage.getItem(this.STORAGE_KEY);this.theme=e||"system",this.mediaQuery=window.matchMedia("(prefers-color-scheme: dark)"),this.mediaQuery.addEventListener("change",this.handleSystemThemeChange),this.applyTheme()}disconnectedCallback(){super.disconnectedCallback(),this.mediaQuery?.removeEventListener("change",this.handleSystemThemeChange)}applyTheme(){let e=document.documentElement,t;this.theme==="system"?t=this.mediaQuery?.matches?"dark":"light":t=this.theme,e.setAttribute("data-theme",t);let s=document.querySelector('meta[name="theme-color"]');s&&s.setAttribute("content",t==="dark"?"#0a0a0a":"#fafafa")}cycleTheme(){let e=["light","dark","system"],s=(e.indexOf(this.theme)+1)%e.length;this.theme=e[s],localStorage.setItem(this.STORAGE_KEY,this.theme),this.applyTheme(),this.dispatchEvent(new CustomEvent("theme-changed",{detail:{theme:this.theme},bubbles:!0,composed:!0}))}getIcon(){switch(this.theme){case"light":return u`
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
          </svg>
        `;case"dark":return u`
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
          </svg>
        `;case"system":return u`
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2C5.858 2 2.5 5.358 2.5 9.5S5.858 17 10 17s7.5-3.358 7.5-7.5S14.142 2 10 2zM10 15.5V4.5c3.314 0 6 2.686 6 6s-2.686 6-6 6z"/>
          </svg>
        `}}getTooltip(){let e=this.theme==="system"?"Auto (System)":this.theme.charAt(0).toUpperCase()+this.theme.slice(1),t=this.theme==="light"?"Dark":this.theme==="dark"?"Auto":"Light";return`Theme: ${e} (click for ${t})`}render(){return u`
      <button
        @click=${this.cycleTheme}
        class="bg-bg-tertiary border border-border rounded-lg p-2 font-mono text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary hover:shadow-sm flex-shrink-0"
        title="${this.getTooltip()}"
        aria-label="Toggle theme"
      >
        ${this.getIcon()}
      </button>
    `}};d([C({type:String})],Hi.prototype,"theme",2),Hi=d([D("theme-toggle-icon")],Hi);var vs=class extends qe{render(){let i=this.runningSessions;return u`
      <div
        class="app-header bg-bg-secondary border-b border-border p-3"
        style="padding-top: max(0.75rem, calc(0.75rem + env(safe-area-inset-top)));"
      >
        <div class="flex items-center justify-between">
          <button
            class="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer group"
            title="Go to home"
            @click=${this.handleHomeClick}
          >
            <terminal-icon size="24"></terminal-icon>
            <div class="flex items-baseline gap-2">
              <h1 class="text-xl font-bold text-primary font-mono group-hover:underline">
                VibeTunnel
              </h1>
              <p class="text-text-muted text-xs font-mono">
                (${i.length})
              </p>
            </div>
          </button>

          <div class="flex items-center gap-2">
            <notification-status
              @open-settings=${()=>this.dispatchEvent(new CustomEvent("open-settings"))}
            ></notification-status>
            <theme-toggle-icon
              .theme=${this.currentTheme}
              @theme-changed=${e=>{this.currentTheme=e.detail.theme}}
            ></theme-toggle-icon>
            <button
              class="p-2 bg-bg-tertiary text-muted border border-border hover:border-primary hover:text-primary hover:bg-surface-hover rounded-lg transition-all duration-200"
              @click=${()=>this.dispatchEvent(new CustomEvent("open-file-browser"))}
              title="Browse Files (⌘O)"
              data-testid="file-browser-button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path
                  d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v1h4c.966 0 1.75.784 1.75 1.75v7.75A1.75 1.75 0 0113 15H3a1.75 1.75 0 01-1.75-1.75V2.75C1.25 1.784 1.784 1 1.75 1zM2.75 2.5v10.75c0 .138.112.25.25.25h10a.25.25 0 00.25-.25V5.5a.25.25 0 00-.25-.25H8.75v-2.5a.25.25 0 00-.25-.25h-5.5a.25.25 0 00-.25.25z"
                />
              </svg>
            </button>
            <button
              class="p-2 bg-bg-tertiary text-muted border border-border hover:border-primary hover:text-primary hover:bg-surface-hover rounded-lg transition-all duration-200"
              @click=${this.handleOpenTmuxSessions}
              title="tmux Sessions"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2v12h12V2H2zM1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm7 3h5v2H8V5zm0 3h5v2H8V8zm0 3h5v2H8v-2zM3 5h4v2H3V5zm0 3h4v2H3V8zm0 3h4v2H3v-2z"/>
              </svg>
            </button>
            <button
              class="p-2 bg-primary text-text-bright hover:bg-primary-light rounded-lg transition-all duration-200 vt-create-button"
              @click=${this.handleCreateSession}
              title="Create New Session"
              data-testid="create-session-button"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
              </svg>
            </button>
            ${this.renderUserMenu()}
          </div>
        </div>
      </div>
    `}renderUserMenu(){return this.currentUser?u`
      <div class="user-menu-container relative flex-shrink-0">
        <button
          class="font-mono text-sm px-3 py-2 text-text border border-border hover:bg-bg-tertiary hover:text-text rounded-lg transition-all duration-200 flex items-center gap-2"
          @click=${this.toggleUserMenu}
          title="User menu"
        >
          <span class="hidden sm:inline">${this.currentUser}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="sm:hidden"
          >
            <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM3 18a7 7 0 1114 0H3z" />
          </svg>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            class="transition-transform ${this.showUserMenu?"rotate-180":""}"
          >
            <path d="M5 7L1 3h8z" />
          </svg>
        </button>
        ${this.showUserMenu?u`
              <div
                class="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 min-w-36"
              >
                <div class="px-3 py-2 text-sm text-text-muted border-b border-border">
                  ${this.authMethod||"authenticated"}
                </div>
                <button
                  class="w-full text-left px-3 py-2 text-sm font-mono text-status-warning hover:bg-bg-secondary hover:text-status-error"
                  @click=${this.handleLogout}
                >
                  Logout
                </button>
              </div>
            `:""}
      </div>
    `:u``}};vs=d([D("full-header")],vs);var gt=class extends R{constructor(){super(...arguments);this.sessions=[];this.hideExited=!0;this.showSplitView=!1;this.currentUser=null;this.authMethod=null;this.forwardEvent=e=>{this.dispatchEvent(new CustomEvent(e.type,{detail:e.detail,bubbles:!1}))}}createRenderRoot(){return this}render(){return this.showSplitView?this.renderSidebarHeader():this.renderFullHeader()}renderSidebarHeader(){return u`
      <sidebar-header
        .sessions=${this.sessions}
        .hideExited=${this.hideExited}
        .currentUser=${this.currentUser}
        .authMethod=${this.authMethod}
        @create-session=${this.forwardEvent}
        @hide-exited-change=${this.forwardEvent}
        @kill-all-sessions=${this.forwardEvent}
        @clean-exited-sessions=${this.forwardEvent}
        @open-file-browser=${this.forwardEvent}
        @open-tmux-sessions=${this.forwardEvent}
        @open-settings=${this.forwardEvent}
        @logout=${this.forwardEvent}
        @navigate-to-list=${this.forwardEvent}
        @toggle-sidebar=${this.forwardEvent}
      ></sidebar-header>
    `}renderFullHeader(){return u`
      <full-header
        .sessions=${this.sessions}
        .hideExited=${this.hideExited}
        .currentUser=${this.currentUser}
        .authMethod=${this.authMethod}
        @create-session=${this.forwardEvent}
        @hide-exited-change=${this.forwardEvent}
        @kill-all-sessions=${this.forwardEvent}
        @clean-exited-sessions=${this.forwardEvent}
        @open-file-browser=${this.forwardEvent}
        @open-tmux-sessions=${this.forwardEvent}
        @open-settings=${this.forwardEvent}
        @logout=${this.forwardEvent}
        @navigate-to-list=${this.forwardEvent}
      ></full-header>
    `}};d([C({type:Array})],gt.prototype,"sessions",2),d([C({type:Boolean})],gt.prototype,"hideExited",2),d([C({type:Boolean})],gt.prototype,"showSplitView",2),d([C({type:String})],gt.prototype,"currentUser",2),d([C({type:String})],gt.prototype,"authMethod",2),gt=d([D("app-header")],gt);var Fi=(c,i)=>{let e=c._$AN;if(e===void 0)return!1;for(let t of e)t._$AO?.(i,!1),Fi(t,i);return!0},bs=c=>{let i,e;do{if((i=c._$AM)===void 0)break;e=i._$AN,e.delete(c),c=i}while(e?.size===0)},vn=c=>{for(let i;i=c._$AM;c=i){let e=i._$AN;if(e===void 0)i._$AN=e=new Set;else if(e.has(c))break;e.add(c),No(i)}};function Oo(c){this._$AN!==void 0?(bs(this),this._$AM=c,vn(this)):this._$AM=c}function zo(c,i=!1,e=0){let t=this._$AH,s=this._$AN;if(s!==void 0&&s.size!==0)if(i)if(Array.isArray(t))for(let n=e;n<t.length;n++)Fi(t[n],!1),bs(t[n]);else t!=null&&(Fi(t,!1),bs(t));else Fi(this,c)}var No=c=>{c.type==hs.CHILD&&(c._$AP??(c._$AP=zo),c._$AQ??(c._$AQ=Oo))},ys=class extends _t{constructor(){super(...arguments),this._$AN=void 0}_$AT(i,e,t){super._$AT(i,e,t),vn(this),this.isConnected=i._$AU}_$AO(i,e=!0){i!==this.isConnected&&(this.isConnected=i,i?this.reconnected?.():this.disconnected?.()),e&&(Fi(this,i),bs(this))}setValue(i){if(hn(this._$Ct))this._$Ct._$AI(i,this);else{let e=[...this._$Ct._$AH];e[this._$Ci]=i,this._$Ct._$AI(e,this,0)}}disconnected(){}reconnected(){}};var Oi=()=>new dr,dr=class{},hr=new WeakMap,pi=Qt(class extends ys{render(c){return j}update(c,[i]){let e=i!==this.G;return e&&this.G!==void 0&&this.rt(void 0),(e||this.lt!==this.ct)&&(this.G=i,this.ht=c.options?.host,this.rt(this.ct=c.element)),j}rt(c){if(this.isConnected||(c=void 0),typeof this.G=="function"){let i=this.ht??globalThis,e=hr.get(i);e===void 0&&(e=new WeakMap,hr.set(i,e)),e.get(this.G)!==void 0&&this.G.call(this.ht,void 0),e.set(this.G,c),c!==void 0&&this.G.call(this.ht,c)}else this.G.value=c}get lt(){return typeof this.G=="function"?hr.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}});Me();function ur(c,i){if(i==="directory")return u`
      <svg class="w-5 h-5 text-status-info" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    `;let e=c.split(".").pop()?.toLowerCase();return{js:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm6 3a1 1 0 011 1v2a1 1 0 11-2 0V9h-.5a.5.5 0 000 1H10a1 1 0 110 2H8.5A2.5 2.5 0 016 9.5V8a1 1 0 011-1h3z"
      />
    </svg>`,mjs:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm6 3a1 1 0 011 1v2a1 1 0 11-2 0V9h-.5a.5.5 0 000 1H10a1 1 0 110 2H8.5A2.5 2.5 0 016 9.5V8a1 1 0 011-1h3z"
      />
    </svg>`,cjs:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm6 3a1 1 0 011 1v2a1 1 0 11-2 0V9h-.5a.5.5 0 000 1H10a1 1 0 110 2H8.5A2.5 2.5 0 016 9.5V8a1 1 0 011-1h3z"
      />
    </svg>`,ts:u`<svg class="w-5 h-5 text-status-info" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm6 3h4v1h-1v4a1 1 0 11-2 0V8h-1a1 1 0 110-2zM6 7h2v6H6V7z"
      />
    </svg>`,tsx:u`<svg class="w-5 h-5 text-status-info" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm6 3h4v1h-1v4a1 1 0 11-2 0V8h-1a1 1 0 110-2zM6 7h2v6H6V7z"
      />
    </svg>`,jsx:u`<svg class="w-5 h-5 text-status-info" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 114 0 2 2 0 01-4 0zm6-2a2 2 0 104 0 2 2 0 00-4 0z"
      />
    </svg>`,html:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm1 2h10v2H5V5zm0 4h10v2H5V9zm0 4h6v2H5v-2z"
      />
    </svg>`,htm:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm1 2h10v2H5V5zm0 4h10v2H5V9zm0 4h6v2H5v-2z"
      />
    </svg>`,css:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm4 6a2 2 0 100 4 2 2 0 000-4zm4-2a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>`,scss:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm4 6a2 2 0 100 4 2 2 0 000-4zm4-2a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>`,sass:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm4 6a2 2 0 100 4 2 2 0 000-4zm4-2a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>`,less:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm4 6a2 2 0 100 4 2 2 0 000-4zm4-2a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>`,json:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,jsonc:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,xml:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,yaml:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,yml:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,md:u`<svg class="w-5 h-5 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v8h12V6H4zm2 2h8v1H6V8zm0 2h8v1H6v-1zm0 2h6v1H6v-1z"
      />
    </svg>`,markdown:u`<svg class="w-5 h-5 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm2 0v8h12V6H4zm2 2h8v1H6V8zm0 2h8v1H6v-1zm0 2h6v1H6v-1z"
      />
    </svg>`,txt:u`<svg class="w-5 h-5 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5zm2 2v6h8V7H6zm2 1h4v1H8V8zm0 2h4v1H8v-1z"
      />
    </svg>`,text:u`<svg class="w-5 h-5 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v10H4V5zm2 2v6h8V7H6zm2 1h4v1H8V8zm0 2h4v1H8v-1z"
      />
    </svg>`,png:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,jpg:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,jpeg:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,gif:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,webp:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,bmp:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
        clip-rule="evenodd"
      />
    </svg>`,svg:u`<svg class="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm6 6L8 7l2 2 2-2-2 2 2 2-2-2-2 2 2-2z"
      />
    </svg>`,zip:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,tar:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,gz:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,rar:u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,"7z":u`<svg class="w-5 h-5 text-status-warning" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>`,pdf:u`<svg class="w-5 h-5 text-status-error" fill="currentColor" viewBox="0 0 20 20">
      <path d="M4 18h12V6h-4V2H4v16zm8-14v4h4l-4-4zM6 10h8v1H6v-1zm0 2h8v1H6v-1zm0 2h6v1H6v-1z" />
    </svg>`,sh:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 101.414 1.414L17.414 6H19a1 1 0 100-2H3zM3 11a1 1 0 100 2h3.586l-2.293 2.293a1 1 0 101.414 1.414L9.414 13H11a1 1 0 100-2H3z"
      />
    </svg>`,bash:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 101.414 1.414L17.414 6H19a1 1 0 100-2H3zM3 11a1 1 0 100 2h3.586l-2.293 2.293a1 1 0 101.414 1.414L9.414 13H11a1 1 0 100-2H3z"
      />
    </svg>`,zsh:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 101.414 1.414L17.414 6H19a1 1 0 100-2H3zM3 11a1 1 0 100 2h3.586l-2.293 2.293a1 1 0 101.414 1.414L9.414 13H11a1 1 0 100-2H3z"
      />
    </svg>`,fish:u`<svg class="w-5 h-5 text-status-success" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 000 2h11.586l-2.293 2.293a1 1 0 101.414 1.414L17.414 6H19a1 1 0 100-2H3zM3 11a1 1 0 100 2h3.586l-2.293 2.293a1 1 0 101.414 1.414L9.414 13H11a1 1 0 100-2H3z"
      />
    </svg>`}[e||""]||Wo()}function Wo(){return u`
    <svg class="w-5 h-5 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
        clip-rule="evenodd"
      />
    </svg>
  `}function bn(){return u`
    <svg class="w-5 h-5 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
        clip-rule="evenodd"
      />
    </svg>
  `}function pr(c){if(!c||c==="unchanged")return"";let i={modified:"M",added:"A",deleted:"D",untracked:"?",unchanged:""};return u`
    <span class="text-xs px-1.5 py-0.5 rounded font-bold ${{modified:"bg-status-warning/20 text-status-warning",added:"bg-status-success/20 text-status-success",deleted:"bg-status-error/20 text-status-error",untracked:"bg-text-dim/20 text-text-dim",unchanged:""}[c]}">
      ${i[c]}
    </span>
  `}var ws={close:u`
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M6 18L18 6M6 6l12 12"
      ></path>
    </svg>
  `,folder:u`
    <svg class="w-6 h-6 text-status-info" fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
    </svg>
  `,git:u`
    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
      <path
        fill-rule="evenodd"
        d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"
      />
    </svg>
  `,preview:u`
    <svg class="w-16 h-16 mb-4 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        fill-rule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
        clip-rule="evenodd"
      />
    </svg>
  `,binary:u`
    <svg class="w-16 h-16 mb-4 text-text-dim" fill="currentColor" viewBox="0 0 20 20">
      <path
        d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
      />
    </svg>
  `};q();var Ko=/^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:[/\\]Users[/\\][^/\\]+|\/root)/;function Pe(c){return c?c.startsWith("~")?c:c.replace(Ko,"~"):""}async function xs(c){try{return await navigator.clipboard.writeText(c),!0}catch{let e=document.createElement("textarea");e.value=c,e.style.position="fixed",e.style.left="-999999px",e.style.top="-999999px",document.body.appendChild(e),e.focus(),e.select();try{let t=document.execCommand("copy");return document.body.removeChild(e),t}catch{return document.body.removeChild(e),!1}}}q();var mi=P("monaco-editor"),$e=class extends R{constructor(){super(...arguments);this.content="";this.originalContent="";this.modifiedContent="";this.language="";this.filename="";this.readOnly=!1;this.mode="normal";this.showModeToggle=!1;this.options={};this.isLoading=!0;this.diffMode="sideBySide";this.containerWidth=0;this.containerRef=Oi();this.editor=null;this.resizeObserver=null;this.monacoLoaded=!1}createRenderRoot(){return this}async connectedCallback(){super.connectedCallback(),await this.loadMonaco(),this.setupResizeObserver(),await this.updateComplete,this.containerRef.value&&!this.editor&&!this.isLoading&&await this.createEditor()}disconnectedCallback(){super.disconnectedCallback(),this.disposeEditor(),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null)}async loadMonaco(){if(this.monacoLoaded||window.monaco){this.monacoLoaded=!0,this.isLoading=!1;return}try{mi.debug("Loading Monaco Editor..."),await Zi(),this.monacoLoaded=!0,this.isLoading=!1,mi.debug("Monaco Editor loaded successfully")}catch(e){mi.error("Failed to load Monaco Editor:",e),this.isLoading=!1}}setupResizeObserver(){this.resizeObserver=new ResizeObserver(e=>{for(let t of e){if(this.containerWidth=t.contentRect.width,this.mode==="diff"&&this.editor){let n=this.containerWidth<768?"inline":"sideBySide";n!==this.diffMode&&(this.diffMode=n,this.recreateEditor())}this.editor&&this.editor.layout()}}),this.containerRef.value&&this.resizeObserver.observe(this.containerRef.value)}async updated(e){super.updated(e),(e.has("mode")||e.has("content")&&!this.editor||e.has("originalContent")&&this.mode==="diff"||e.has("modifiedContent")&&this.mode==="diff")&&!this.isLoading&&this.containerRef.value?await this.recreateEditor():this.editor&&!this.isLoading&&(e.has("content")&&this.mode==="normal"&&this.updateContent(),(e.has("language")||e.has("filename"))&&this.updateLanguage(),e.has("readOnly")&&this.updateReadOnly())}async recreateEditor(){this.disposeEditor(),await this.createEditor()}async createEditor(){if(!(!this.containerRef.value||!window.monaco))try{this.setupTheme();let e={theme:"vs-dark",automaticLayout:!0,fontSize:14,fontFamily:"'Fira Code', Menlo, Monaco, 'Courier New', monospace",fontLigatures:!0,minimap:{enabled:!1},scrollBeyondLastLine:!1,renderWhitespace:"selection",readOnly:this.readOnly,folding:!0,foldingStrategy:"indentation",foldingHighlight:!0,showFoldingControls:"always",renderLineHighlight:"all",renderLineHighlightOnlyWhenFocus:!1,...this.options};if(this.mode==="diff"){let t={readOnly:!0,automaticLayout:!0,scrollBeyondLastLine:!1,minimap:{enabled:!1},renderWhitespace:"selection",renderSideBySide:this.diffMode==="sideBySide",ignoreTrimWhitespace:!1};this.editor=window.monaco.editor.createDiffEditor(this.containerRef.value,t);let s=this.detectLanguage(),n=Date.now(),o=`${this.filename||"untitled"}-${n}`,r=window.monaco.editor.createModel(this.originalContent||"",s,window.monaco.Uri.parse(`file:///${o}#original`)),a=window.monaco.editor.createModel(this.modifiedContent||"",s,window.monaco.Uri.parse(`file:///${o}#modified`));mi.debug("Creating diff editor");let m=this.editor;m.setModel({original:r,modified:a});let p=()=>{this.editor&&this.editor.layout()},h=m.onDidUpdateDiff(()=>{p(),h.dispose()});setTimeout(p,200)}else this.editor=window.monaco.editor.create(this.containerRef.value,{...e,value:this.content,language:this.detectLanguage()}),this.readOnly||(this.editor.addCommand(window.monaco.KeyMod.CtrlCmd|window.monaco.KeyCode.KeyS,()=>{this.handleSave()}),this.editor.onDidChangeModelContent(()=>{let t=this.editor?.getValue()||"";this.dispatchEvent(new CustomEvent("content-changed",{detail:{content:t},bubbles:!0,composed:!0}))}));mi.debug(`Created ${this.mode} editor`)}catch(e){mi.error("Failed to create editor:",e)}}setupTheme(){window.monaco}detectLanguage(){if(this.language)return this.language;if(this.filename){let e=this.filename.split(".").pop()?.toLowerCase();return{js:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",json:"json",html:"html",htm:"html",css:"css",scss:"scss",sass:"sass",less:"less",py:"python",rb:"ruby",go:"go",rs:"rust",java:"java",c:"c",cpp:"cpp",cs:"csharp",php:"php",swift:"swift",kt:"kotlin",scala:"scala",r:"r",sql:"sql",sh:"shell",bash:"shell",zsh:"shell",fish:"shell",ps1:"powershell",yml:"yaml",yaml:"yaml",xml:"xml",md:"markdown",markdown:"markdown",dockerfile:"dockerfile",makefile:"makefile",gitignore:"gitignore"}[e||""]||"plaintext"}return"plaintext"}updateContent(){if(!this.editor||this.mode==="diff")return;this.editor.getValue()!==this.content&&this.editor.setValue(this.content)}updateLanguage(){if(!this.editor||!window.monaco)return;let e=this.detectLanguage();if(this.mode==="normal"){let t=this.editor.getModel();t&&window.monaco.editor.setModelLanguage(t,e)}else{let t=this.editor,s=t.getOriginalEditor().getModel(),n=t.getModifiedEditor().getModel();s&&window.monaco.editor.setModelLanguage(s,e),n&&window.monaco.editor.setModelLanguage(n,e)}}updateReadOnly(){this.editor&&(this.mode==="normal"?this.editor.updateOptions({readOnly:this.readOnly}):this.editor.getModifiedEditor().updateOptions({readOnly:this.readOnly}))}handleSave(){if(this.readOnly||!this.editor||this.mode==="diff")return;let e=this.editor.getValue();this.dispatchEvent(new CustomEvent("save",{detail:{content:e},bubbles:!0,composed:!0}))}toggleDiffMode(){if(this.mode!=="diff")return;this.diffMode=this.diffMode==="inline"?"sideBySide":"inline";let e="",t="";if(this.editor){let n=this.editor.getModel();n&&(e=n.original?.getValue()||this.originalContent||"",t=n.modified?.getValue()||this.modifiedContent||"")}this.originalContent=e,this.modifiedContent=t,this.recreateEditor()}disposeEditor(){if(this.editor){if(this.mode==="diff"){let e=this.editor,t=e.getModel();e.setModel(null),t&&setTimeout(()=>{t.original?.dispose(),t.modified?.dispose()},0)}this.editor.dispose(),this.editor=null}}render(){return u`
      <div
        class="monaco-editor-root"
        style="display: block; width: 100%; height: 100%; position: relative;"
      >
        <div
          class="editor-container"
          ${pi(this.containerRef)}
          style="width: 100%; height: 100%; position: relative; background: rgb(var(--color-bg-secondary));"
        >
          ${this.isLoading?u`
                <div
                  class="loading"
                  style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgb(var(--color-text-muted)); font-family: ui-monospace, monospace;"
                >
                  Loading editor...
                </div>
              `:""}
          ${this.showModeToggle&&this.mode==="diff"&&!this.isLoading?u`
                <button
                  class="mode-toggle"
                  style="position: absolute; top: 10px; right: 10px; z-index: 10; background: rgb(var(--color-surface)); border: 1px solid rgb(var(--color-border)); color: rgb(var(--color-text)); padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;"
                  @click=${this.toggleDiffMode}
                  title="Toggle between inline and side-by-side diff"
                  @mouseenter=${e=>{let t=e.target;t.style.background="rgb(var(--color-surface-hover))",t.style.borderColor="rgb(var(--color-border-focus))"}}
                  @mouseleave=${e=>{let t=e.target;t.style.background="rgb(var(--color-surface))",t.style.borderColor="rgb(var(--color-border))"}}
                >
                  ${this.diffMode==="inline"?"Side by Side":"Inline"}
                </button>
              `:""}
        </div>
      </div>
    `}};d([C({type:String})],$e.prototype,"content",2),d([C({type:String})],$e.prototype,"originalContent",2),d([C({type:String})],$e.prototype,"modifiedContent",2),d([C({type:String})],$e.prototype,"language",2),d([C({type:String})],$e.prototype,"filename",2),d([C({type:Boolean})],$e.prototype,"readOnly",2),d([C({type:String})],$e.prototype,"mode",2),d([C({type:Boolean})],$e.prototype,"showModeToggle",2),d([C({type:Object})],$e.prototype,"options",2),d([_()],$e.prototype,"isLoading",2),d([_()],$e.prototype,"diffMode",2),d([_()],$e.prototype,"containerWidth",2),$e=d([D("monaco-editor")],$e);var tt=class extends R{constructor(){super(...arguments);this.visible=!1;this.modalClass="";this.contentClass="modal-content font-mono text-sm w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl";this.transitionName="";this.ariaLabel="Modal dialog";this.closeOnBackdrop=!0;this.closeOnEscape=!0;this.handleKeyDown=e=>{this.visible&&e.key==="Escape"&&this.closeOnEscape&&(e.preventDefault(),e.stopPropagation(),this.handleClose())}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback()}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("keydown",this.handleKeyDown)}updated(e){super.updated(e),(e.has("visible")||e.has("closeOnEscape"))&&(this.visible&&this.closeOnEscape?document.addEventListener("keydown",this.handleKeyDown):document.removeEventListener("keydown",this.handleKeyDown)),e.has("visible")&&this.visible&&!this.hasAttribute("no-autofocus")&&requestAnimationFrame(()=>{this.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus()})}handleBackdropClick(e){this.closeOnBackdrop&&e.target===e.currentTarget&&(e.preventDefault(),e.stopPropagation(),this.handleClose())}handleClose(){this.dispatchEvent(new CustomEvent("close"))}render(){if(!this.visible)return u``;let e=this.transitionName?`view-transition-name: ${this.transitionName}`:"";return u`
      <!-- Modal container with backdrop and centered content -->
      <div 
        class="modal-backdrop flex items-center justify-center p-2 sm:p-4 ${this.modalClass}"
        @click=${this.handleBackdropClick}
        data-testid="modal-backdrop"
      >
        <!-- Modal content centered within backdrop -->
        <div
          class="${this.contentClass}"
          style="${e}"
          role="dialog"
          aria-modal="true"
          aria-label="${this.ariaLabel}"
          data-testid="modal-content"
          @click=${t=>t.stopPropagation()}
        >
          <slot></slot>
        </div>
      </div>
    `}};d([C({type:Boolean})],tt.prototype,"visible",2),d([C({type:String})],tt.prototype,"modalClass",2),d([C({type:String})],tt.prototype,"contentClass",2),d([C({type:String})],tt.prototype,"transitionName",2),d([C({type:String})],tt.prototype,"ariaLabel",2),d([C({type:Boolean})],tt.prototype,"closeOnBackdrop",2),d([C({type:Boolean})],tt.prototype,"closeOnEscape",2),tt=d([D("modal-wrapper")],tt);var Be=P("file-browser"),le=class extends R{constructor(){super(...arguments);this.visible=!1;this.mode="browse";this.session=null;this.currentPath="";this.currentFullPath="";this.files=[];this.loading=!1;this.selectedFile=null;this.preview=null;this.diff=null;this.diffContent=null;this.gitFilter="all";this.showHidden=!1;this.gitStatus=null;this.previewLoading=!1;this.showDiff=!1;this.errorMessage="";this.mobileView="list";this.isMobile=window.innerWidth<768;this.editingPath=!1;this.pathInputValue="";this.editorRef=Oi();this.pathInputRef=Oi();this.noAuthMode=!1;this.handleKeyDown=e=>{this.visible&&(e.key==="Escape"?this.editingPath&&(e.preventDefault(),e.stopImmediatePropagation(),this.cancelPathEdit()):e.key==="Enter"&&this.selectedFile&&this.selectedFile.type==="file"&&!this.editingPath?(e.preventDefault(),this.insertPathIntoTerminal()):(e.metaKey||e.ctrlKey)&&e.key==="c"&&this.selectedFile&&(e.preventDefault(),this.handleCopyToClipboard(this.selectedFile.path)))};this.handleResize=()=>{this.isMobile=window.innerWidth<768,!this.isMobile&&this.mobileView==="preview"&&(this.mobileView="list")};this.touchStartX=0;this.touchStartY=0}createRenderRoot(){return this}async connectedCallback(){super.connectedCallback(),await this.checkAuthConfig(),this.visible&&(this.currentPath=this.session?.workingDir||".",await this.loadDirectory(this.currentPath)),document.addEventListener("keydown",this.handleKeyDown),window.addEventListener("resize",this.handleResize),this.setupTouchHandlers()}async updated(e){if(super.updated(e),e.has("visible"))this.visible&&(this.currentPath=this.session?.workingDir||".",await this.loadDirectory(this.currentPath));else if(e.has("session")&&this.visible){let s=e.get("session")?.workingDir,n=this.session?.workingDir;s!==n&&(this.currentPath=n||".",await this.loadDirectory(this.currentPath))}}async loadDirectory(e){this.loading=!0;try{let s=`/api/fs/browse?${new URLSearchParams({path:e,showHidden:this.showHidden.toString(),gitFilter:this.gitFilter})}`;Be.debug(`loading directory: ${e}`),Be.debug(`fetching URL: ${s}`);let n=this.noAuthMode?{}:{...N.getAuthHeader()},o=await fetch(s,{headers:n});if(Be.debug(`response status: ${o.status}`),o.ok){let r=await o.json();Be.debug(`received ${r.files?.length||0} files`),this.currentPath=r.fullPath||r.path,this.currentFullPath=r.fullPath,this.files=r.files||[],this.gitStatus=r.gitStatus,this.errorMessage=""}else{let r="Failed to load directory";try{r=(await o.json()).error||r}catch{r=`Failed to load directory (${o.status})`}Be.error(`failed to load directory: ${o.status}`,new Error(r)),this.showErrorMessage(r)}}catch(t){Be.error("error loading directory:",t),this.showErrorMessage("Network error loading directory")}finally{this.loading=!1}}async loadPreview(e){if(e.type!=="directory"){this.previewLoading=!0,this.selectedFile=e,this.showDiff=!1;try{Be.debug(`loading preview for file: ${e.name}`),Be.debug(`file path: ${e.path}`);let t=this.noAuthMode?{}:{...N.getAuthHeader()},s=await fetch(`/api/fs/preview?path=${encodeURIComponent(e.path)}`,{headers:t});s.ok?(this.preview=await s.json(),this.requestUpdate()):Be.error(`preview failed: ${s.status}`,new Error(await s.text()))}catch(t){Be.error("error loading preview:",t)}finally{this.previewLoading=!1}}}async loadDiff(e){if(!(e.type==="directory"||!e.gitStatus||e.gitStatus==="unchanged")){this.previewLoading=!0,this.showDiff=!0;try{let t=this.noAuthMode?{}:{...N.getAuthHeader()},[s,n]=await Promise.all([fetch(`/api/fs/diff?path=${encodeURIComponent(e.path)}`,{headers:t}),fetch(`/api/fs/diff-content?path=${encodeURIComponent(e.path)}`,{headers:t})]);s.ok&&(this.diff=await s.json()),n.ok&&(this.diffContent=await n.json())}catch(t){Be.error("error loading diff:",t)}finally{this.previewLoading=!1}}}handleFileClick(e){e.type==="directory"?this.loadDirectory(e.path):(this.selectedFile?.path!==e.path&&(this.preview=null,this.diff=null,this.diffContent=null,this.showDiff=!1),this.selectedFile=e,this.isMobile&&(this.mobileView="preview"),this.loadPreview(e))}async handleCopyToClipboard(e){await xs(e)?Be.debug(`copied to clipboard: ${e}`):Be.error("failed to copy to clipboard")}insertPathIntoTerminal(){if(!this.selectedFile)return;let e;this.currentFullPath&&this.selectedFile.name?e=this.currentFullPath.endsWith("/")?this.currentFullPath+this.selectedFile.name:`${this.currentFullPath}/${this.selectedFile.name}`:e=this.selectedFile.path,this.dispatchEvent(new CustomEvent("insert-path",{detail:{path:e,type:this.selectedFile.type},bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("browser-cancel"))}showErrorMessage(e){this.errorMessage=e,setTimeout(()=>{this.errorMessage=""},5e3)}handleParentClick(){let e;if(this.currentFullPath!=="/"){if(this.currentFullPath){let t=this.currentFullPath.split("/").filter(s=>s!=="");t.length===0?e="/":(t.pop(),e=t.length===0?"/":`/${t.join("/")}`)}else{let t=this.currentPath.split("/").filter(s=>s!=="");t.length<=1?e="/":(t.pop(),e=`/${t.join("/")}`)}this.loadDirectory(e)}}toggleGitFilter(){this.gitFilter=this.gitFilter==="all"?"changed":"all",this.loadDirectory(this.currentPath)}toggleHidden(){this.showHidden=!this.showHidden,this.loadDirectory(this.currentPath)}toggleDiff(){this.selectedFile?.gitStatus&&this.selectedFile.gitStatus!=="unchanged"&&(this.showDiff?this.loadPreview(this.selectedFile):this.loadDiff(this.selectedFile))}handleSelect(){this.mode==="select"&&this.currentPath&&this.dispatchEvent(new CustomEvent("directory-selected",{detail:this.currentFullPath||this.currentPath}))}handleCancel(){this.dispatchEvent(new CustomEvent("browser-cancel"))}renderPreview(){if(this.previewLoading)return u`
        <div class="flex items-center justify-center h-full text-text-muted">
          Loading preview...
        </div>
      `;if(this.showDiff&&(this.diff||this.diffContent))return this.renderDiff();if(!this.preview)return u`
        <div class="flex flex-col items-center justify-center h-full text-text-muted">
          ${ws.preview}
          <div>Select a file to preview</div>
        </div>
      `;switch(this.preview.type){case"image":return u`
          <div class="flex items-center justify-center p-4 h-full">
            <img
              src="${this.preview.url}"
              alt="${this.selectedFile?.name}"
              class="max-w-full max-h-full object-contain rounded"
            />
          </div>
        `;case"text":return u`
          <monaco-editor
            ${pi(this.editorRef)}
            .content=${this.preview.content||""}
            .language=${this.preview.language||""}
            .filename=${this.selectedFile?.name||""}
            .readOnly=${!0}
            mode="normal"
            class="h-full w-full"
          ></monaco-editor>
        `;case"binary":return u`
          <div class="flex flex-col items-center justify-center h-full text-text-muted">
            ${ws.binary}
            <div class="text-lg mb-2">Binary File</div>
            <div class="text-sm">${this.preview.humanSize||`${this.preview.size} bytes`}</div>
            <div class="text-sm text-text-muted mt-2">
              ${this.preview.mimeType||"Unknown type"}
            </div>
          </div>
        `}}renderDiff(){if(!this.diffContent&&(!this.diff||!this.diff.diff))return u`
        <div class="flex items-center justify-center h-full text-text-muted">
          No changes in this file
        </div>
      `;if(this.diffContent)return u`
        <monaco-editor
          ${pi(this.editorRef)}
          .originalContent=${this.diffContent.originalContent||""}
          .modifiedContent=${this.diffContent.modifiedContent||""}
          .language=${this.diffContent.language||""}
          .filename=${this.selectedFile?.name||""}
          .readOnly=${!0}
          mode="diff"
          .showModeToggle=${!0}
          class="h-full w-full"
        ></monaco-editor>
      `;if(!this.diff)return u``;let e=this.diff.diff.split(`
`);return u`
      <div class="overflow-auto h-full p-4 font-mono text-xs">
        ${e.map(t=>{let s="text-text-muted";return t.startsWith("+")?s="text-status-success bg-status-success/10":t.startsWith("-")?s="text-status-error bg-status-error/10":t.startsWith("@@")&&(s="text-status-info font-semibold"),u`<div class="whitespace-pre ${s}">${t}</div>`})}
      </div>
    `}render(){return this.visible?u`
      <div class="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center" style="z-index: ${ie.FILE_BROWSER};" @click=${this.handleCancel}>
        <div class="fixed inset-0 bg-bg flex flex-col" style="z-index: ${ie.FILE_BROWSER};" @click=${e=>e.stopPropagation()}>
        ${this.isMobile&&this.mobileView==="preview"?u`
              <div class="absolute top-1/2 left-2 -translate-y-1/2 text-text-muted opacity-50">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  ></path>
                </svg>
              </div>
            `:""}
        <div
          class="w-full h-full flex flex-col overflow-hidden"
          data-testid="file-browser"
        >
          <!-- Compact Header (like session-view) -->
          <div
            class="flex items-center justify-between px-3 py-2 border-b border-border/50 text-sm min-w-0 bg-bg-secondary"
            style="padding-top: max(0.5rem, env(safe-area-inset-top)); padding-left: max(0.75rem, env(safe-area-inset-left)); padding-right: max(0.75rem, env(safe-area-inset-right));"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <button
                class="text-text-muted hover:text-primary font-mono text-xs px-2 py-1 flex-shrink-0 transition-colors flex items-center gap-1"
                @click=${this.handleCancel}
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 19l-7-7 7-7"
                  ></path>
                </svg>
                <span>Back</span>
              </button>
              <div class="text-primary min-w-0 flex-1 overflow-hidden flex items-center gap-2">
                ${this.editingPath?u`
                      <input
                        ${pi(this.pathInputRef)}
                        type="text"
                        .value=${this.pathInputValue}
                        @input=${this.handlePathInput}
                        @keydown=${this.handlePathKeyDown}
                        @blur=${this.handlePathBlur}
                        class="bg-bg border border-border/50 rounded px-2 py-1 text-status-info text-xs sm:text-sm font-mono w-full min-w-0 focus:outline-none focus:border-primary"
                        placeholder="Enter path and press Enter"
                      />
                    `:u`
                      <div
                        class="text-status-info text-xs sm:text-sm overflow-hidden text-ellipsis whitespace-nowrap font-mono cursor-pointer hover:bg-light rounded px-1 py-1 -mx-1"
                        title="${this.currentFullPath||this.currentPath||"File Browser"} (click to edit)"
                        @click=${this.handlePathClick}
                      >
                        ${Pe(this.currentFullPath||this.currentPath||"File Browser")}
                      </div>
                    `}
                ${this.gitStatus?.branch?u`
                      <span class="text-text-muted text-xs flex items-center gap-1 font-mono flex-shrink-0">
                        ${ws.git} ${this.gitStatus.branch}
                      </span>
                    `:""}
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
              ${this.errorMessage?u`
                    <div
                      class="bg-status-error/20 border border-status-error text-status-error px-2 py-1 rounded text-xs"
                    >
                      ${this.errorMessage}
                    </div>
                  `:""}
            </div>
          </div>

          <!-- Main content -->
          <div class="flex-1 flex overflow-hidden">
            <!-- File list -->
            <div
              class="${this.isMobile&&this.mobileView==="preview"?"hidden":""} ${this.isMobile?"w-full":"w-80"} bg-bg-secondary border-r border-border/50 flex flex-col"
            >
              <!-- File list header with toggles -->
              <div
                class="bg-bg-secondary border-b border-border/50 p-3 flex items-center justify-between"
              >
                <div class="flex gap-2">
                  <button
                    class="btn-secondary text-xs px-2 py-1 font-mono ${this.gitFilter==="changed"?"bg-primary text-bg":""}"
                    @click=${this.toggleGitFilter}
                    title="Show only Git changes"
                  >
                    Git Changes
                  </button>
                  <button
                    class="btn-secondary text-xs px-2 py-1 font-mono ${this.showHidden?"bg-primary text-bg":""}"
                    @click=${this.toggleHidden}
                    title="Show hidden files"
                  >
                    Hidden Files
                  </button>
                </div>
              </div>

              <!-- File list content -->
              <div
                class="flex-1 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30"
              >
                ${this.loading?u`
                      <div class="flex items-center justify-center h-full text-text-muted">
                        Loading...
                      </div>
                    `:u`
                      ${this.currentFullPath!=="/"?u`
                            <div
                              class="p-3 hover:bg-light cursor-pointer transition-colors flex items-center gap-2 border-b border-border/50"
                              @click=${this.handleParentClick}
                            >
                              ${bn()}
                              <span class="text-text-muted">..</span>
                            </div>
                          `:""}
                      ${this.files.map(e=>u`
                          <div
                            class="p-3 hover:bg-light cursor-pointer transition-colors flex items-center gap-2 
                            ${this.selectedFile?.path===e.path?"bg-light border-l-2 border-primary":""}"
                            @click=${()=>this.handleFileClick(e)}
                          >
                            <span class="flex-shrink-0 relative">
                              ${ur(e.name,e.type)}
                              ${e.isSymlink?u`
                                    <svg
                                      class="w-3 h-3 text-text-muted absolute -bottom-1 -right-1">
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                        clip-rule="evenodd"
                                      />
                                    </svg>
                                  `:""}
                            </span>
                            <span
                              class="flex-1 text-sm whitespace-nowrap ${e.type==="directory"?"text-status-info":"text-text"}"
                              title="${e.name}${e.isSymlink?" (symlink)":""}"
                              >${e.name}</span
                            >
                            <span class="flex-shrink-0"
                              >${pr(e.gitStatus)}</span
                            >
                          </div>
                        `)}
                    `}
              </div>
            </div>

            <!-- Preview pane -->
            <div
              class="${this.isMobile&&this.mobileView==="list"?"hidden":""} ${this.isMobile?"w-full":"flex-1"} bg-bg flex flex-col overflow-hidden"
            >
              ${this.selectedFile?u`
                    <div
                      class="bg-bg-secondary border-b border-border/50 p-3 ${this.isMobile?"space-y-2":"flex items-center justify-between"}"
                    >
                      <div class="flex items-center gap-2 ${this.isMobile?"min-w-0":""}">
                        ${this.isMobile?u`
                              <button
                                @click=${()=>{this.mobileView="list"}}
                                class="text-text-muted hover:text-primary transition-colors flex-shrink-0"
                                title="Back to files"
                              >
                                <svg
                                  class="w-5 h-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M15 19l-7-7 7-7"
                                  ></path>
                                </svg>
                              </button>
                            `:""}
                        <span class="flex-shrink-0 relative"
                          >${ur(this.selectedFile.name,this.selectedFile.type)}
                          ${this.selectedFile.isSymlink?u`
                                <svg
                                  class="w-3 h-3 text-muted absolute -bottom-1 -right-1"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fill-rule="evenodd"
                                    d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                    clip-rule="evenodd"
                                  />
                                </svg>
                              `:""}
                        </span>
                        <span class="font-mono text-sm ${this.isMobile?"truncate":""}"
                          >${this.selectedFile.name}${this.selectedFile.isSymlink?" \u2192":""}</span
                        >
                        ${pr(this.selectedFile.gitStatus)}
                      </div>
                      <div
                        class="${this.isMobile?"grid grid-cols-2 gap-2":"flex gap-2 flex-shrink-0"}"
                      >
                        ${this.selectedFile.type==="file"?u`
                              <button
                                class="btn-secondary text-xs px-2 py-1 font-mono"
                                @click=${()=>this.selectedFile&&this.handleCopyToClipboard(this.selectedFile.path)}
                                title="Copy path to clipboard (⌘C)"
                              >
                                Copy Path
                              </button>
                              ${this.mode==="browse"?u`
                                    <button
                                      class="btn-primary text-xs px-2 py-1 font-mono"
                                      @click=${this.insertPathIntoTerminal}
                                      title="Insert path into terminal (Enter)"
                                    >
                                      Insert Path
                                    </button>
                                  `:""}
                            `:""}
                        ${this.selectedFile.gitStatus&&this.selectedFile.gitStatus!=="unchanged"?u`
                              <button
                                class="btn-secondary text-xs px-2 py-1 font-mono ${this.showDiff?"bg-primary text-bg":""} ${this.isMobile&&this.selectedFile.type==="file"&&this.mode==="browse"?"":"col-span-2"}"
                                @click=${this.toggleDiff}
                              >
                                ${this.showDiff?"View File":"View Diff"}
                              </button>
                            `:""}
                      </div>
                    </div>
                  `:""}
              <div class="flex-1 overflow-hidden">${this.renderPreview()}</div>
            </div>
          </div>

          ${this.mode==="select"?u`
                <div class="p-4 border-t border-border/50 flex gap-4">
                  <button class="btn-ghost font-mono flex-1" @click=${this.handleCancel}>
                    Cancel
                  </button>
                  <button class="btn-primary font-mono flex-1" @click=${this.handleSelect}>
                    Select Directory
                  </button>
                </div>
              `:""}
        </div>
        </div>
      </div>
    `:u``}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("keydown",this.handleKeyDown),window.removeEventListener("resize",this.handleResize),this.removeTouchHandlers()}async checkAuthConfig(){try{let e=await fetch("/api/auth/config");if(e.ok){let t=await e.json();this.noAuthMode=t.noAuth===!0,Be.debug("Auth config:",t)}}catch(e){Be.error("Failed to fetch auth config:",e)}}setupTouchHandlers(){if(!this.isMobile)return;let e=s=>{this.touchStartX=s.touches[0].clientX,this.touchStartY=s.touches[0].clientY},t=s=>{if(!this.visible||!this.isMobile)return;let n=s.changedTouches[0].clientX-this.touchStartX,o=Math.abs(s.changedTouches[0].clientY-this.touchStartY);Math.abs(n)>50&&o<50&&n>0&&(this.mobileView==="preview"?this.mobileView="list":this.handleCancel())};document.addEventListener("touchstart",e),document.addEventListener("touchend",t),this._touchHandlers={handleTouchStart:e,handleTouchEnd:t}}removeTouchHandlers(){let e=this._touchHandlers;e&&(document.removeEventListener("touchstart",e.handleTouchStart),document.removeEventListener("touchend",e.handleTouchEnd))}handlePathClick(){this.editingPath=!0,this.pathInputValue=this.currentFullPath||this.currentPath||"",this.requestUpdate(),setTimeout(()=>{this.pathInputRef.value&&(this.pathInputRef.value.focus(),this.pathInputRef.value.select())},0)}handlePathInput(e){let t=e.target;this.pathInputValue=t.value}handlePathKeyDown(e){e.key==="Enter"?(e.preventDefault(),this.navigateToPath()):e.key==="Escape"&&(e.preventDefault(),this.cancelPathEdit())}handlePathBlur(){}async navigateToPath(){let e=this.pathInputValue.trim();e?(this.editingPath=!1,await this.loadDirectory(e)):this.cancelPathEdit()}cancelPathEdit(){this.editingPath=!1,this.pathInputValue=""}};d([C({type:Boolean})],le.prototype,"visible",2),d([C({type:String})],le.prototype,"mode",2),d([C({type:Object})],le.prototype,"session",2),d([_()],le.prototype,"currentPath",2),d([_()],le.prototype,"currentFullPath",2),d([_()],le.prototype,"files",2),d([_()],le.prototype,"loading",2),d([_()],le.prototype,"selectedFile",2),d([_()],le.prototype,"preview",2),d([_()],le.prototype,"diff",2),d([_()],le.prototype,"diffContent",2),d([_()],le.prototype,"gitFilter",2),d([_()],le.prototype,"showHidden",2),d([_()],le.prototype,"gitStatus",2),d([_()],le.prototype,"previewLoading",2),d([_()],le.prototype,"showDiff",2),d([_()],le.prototype,"errorMessage",2),d([_()],le.prototype,"mobileView",2),d([_()],le.prototype,"isMobile",2),d([_()],le.prototype,"editingPath",2),d([_()],le.prototype,"pathInputValue",2),le=d([D("file-browser")],le);q();var Uo=P("git-branch-selector"),ue=class extends R{constructor(){super(...arguments);this.gitRepoInfo=null;this.disabled=!1;this.isCreating=!1;this.currentBranch="";this.selectedBaseBranch="";this.availableBranches=[];this.availableWorktrees=[];this.isLoadingBranches=!1;this.isLoadingWorktrees=!1;this.followMode=!1;this.followBranch=null;this.showFollowMode=!1;this.showCreateWorktree=!1;this.newBranchName="";this.isCreatingWorktree=!1;this.customPath="";this.useCustomPath=!1}createRenderRoot(){return this}handleBaseBranchChange(e){let t=e.target;this.selectedBaseBranch=t.value,this.dispatchEvent(new CustomEvent("branch-changed",{detail:{branch:t.value},bubbles:!0,composed:!0}))}handleWorktreeChange(e){let t=e.target;this.selectedWorktree=t.value==="none"?void 0:t.value,this.dispatchEvent(new CustomEvent("worktree-changed",{detail:{worktree:this.selectedWorktree},bubbles:!0,composed:!0}))}async handleCreateWorktree(){let e=this.newBranchName.trim();if(!e)return;let t=this.validateBranchName(e);if(t){this.dispatchEvent(new CustomEvent("error",{detail:t,bubbles:!0,composed:!0}));return}this.isCreatingWorktree=!0,this.dispatchEvent(new CustomEvent("create-worktree",{detail:{branchName:e,baseBranch:this.selectedBaseBranch||"main",customPath:this.useCustomPath?this.customPath.trim():null},bubbles:!0,composed:!0}))}validateBranchName(e){return this.availableBranches.includes(e)?`Branch '${e}' already exists`:e.startsWith("-")||e.endsWith("-")?"Branch name cannot start or end with a hyphen":e.includes("..")||e.includes("~")||e.includes("^")||e.includes(":")?"Branch name contains invalid characters (.. ~ ^ :)":e.endsWith(".lock")?"Branch name cannot end with .lock":e.includes("//")||e.includes("\\")?"Branch name cannot contain consecutive slashes":["HEAD","FETCH_HEAD","ORIG_HEAD","MERGE_HEAD"].includes(e.toUpperCase())?`'${e}' is a reserved Git name`:null}handleNewBranchInput(e){this.newBranchName=e.target.value}handleCancelCreateWorktree(){this.showCreateWorktree=!1,this.newBranchName="",this.customPath="",this.useCustomPath=!1}render(){return this.gitRepoInfo?.isGitRepo?(Uo.log("Rendering Git branch selector",{isGitRepo:this.gitRepoInfo?.isGitRepo,currentBranch:this.currentBranch,selectedBaseBranch:this.selectedBaseBranch}),u`
      <div class="mb-2 sm:mb-3 mt-2 sm:mt-3">
        <div class="space-y-2">
          <!-- Base Branch Selection -->
          <div>
            <label class="form-label text-text-muted text-[10px] sm:text-xs lg:text-sm flex items-center gap-2">
              ${this.availableWorktrees.some(e=>e.isCurrentWorktree&&!e.isMainWorktree)?"Base Branch for Current Worktree:":this.selectedWorktree?"Base Branch for Worktree:":"Switch to Branch:"}
              ${this.gitRepoInfo?.hasChanges&&!this.selectedWorktree?u`
                  <span class="text-yellow-500 text-[9px] sm:text-[10px] flex items-center gap-1">
                    <span>●</span>
                    <span>Uncommitted changes</span>
                  </span>
                `:""}
            </label>
            <div class="relative">
              <select
                .value=${this.selectedBaseBranch||this.currentBranch}
                @change=${this.handleBaseBranchChange}
                class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm appearance-none pr-8 ${this.gitRepoInfo?.hasChanges&&!this.selectedWorktree?"opacity-50 cursor-not-allowed":""}"
                ?disabled=${this.disabled||this.isCreating||this.isLoadingBranches||this.gitRepoInfo?.hasChanges&&!this.selectedWorktree}
                data-testid="git-base-branch-select"
              >
                ${this.availableBranches.map(e=>u`
                    <option value="${e}" ?selected=${e===(this.selectedBaseBranch||this.currentBranch)}>
                      ${e}${e===this.currentBranch?" (current)":""}
                    </option>
                  `)}
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-muted">
                <svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            ${this.isLoadingBranches?j:u`
                <p class="text-[9px] sm:text-[10px] text-text-muted mt-1">
                  ${this.gitRepoInfo?.hasChanges&&!this.selectedWorktree?u`<span class="text-yellow-500">Branch switching is disabled due to uncommitted changes. Commit or stash changes first.</span>`:this.selectedWorktree?`Session will use worktree: ${this.selectedWorktree}`:this.selectedBaseBranch&&this.selectedBaseBranch!==this.currentBranch?`Session will start on ${this.selectedBaseBranch}`:""}
                  ${this.followMode&&this.followBranch&&(this.gitRepoInfo?.hasChanges&&!this.selectedWorktree||this.selectedWorktree||this.selectedBaseBranch&&this.selectedBaseBranch!==this.currentBranch)?u`${this.gitRepoInfo?.hasChanges&&!this.selectedWorktree||this.selectedWorktree||this.selectedBaseBranch&&this.selectedBaseBranch!==this.currentBranch?u`<br>`:""}<span class="text-primary">Follow mode active: following ${this.followBranch}</span>`:this.followMode&&this.followBranch?u`<span class="text-primary">Follow mode active: following ${this.followBranch}</span>`:""}
                </p>
              `}
          </div>
          
          <!-- Worktree Selection -->
          <div>
            <label class="form-label text-text-muted text-[10px] sm:text-xs lg:text-sm">
              Worktree:
            </label>
            ${this.showCreateWorktree?u`
                <!-- Create Worktree Mode -->
                <div class="space-y-2">
                  <input
                    type="text"
                    .value=${this.newBranchName}
                    @input=${this.handleNewBranchInput}
                    placeholder="New branch name"
                    class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm"
                    ?disabled=${this.disabled||this.isCreating||this.isCreatingWorktree}
                    @keydown=${e=>{e.key==="Escape"&&this.handleCancelCreateWorktree()}}
                  />
                  
                  <!-- Path customization toggle -->
                  <label class="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      .checked=${this.useCustomPath}
                      @change=${e=>{this.useCustomPath=e.target.checked,this.useCustomPath||(this.customPath="")}}
                      ?disabled=${this.disabled||this.isCreating||this.isCreatingWorktree}
                      class="rounded"
                    />
                    <span>Customize worktree path</span>
                  </label>
                  
                  <!-- Custom path input -->
                  ${this.useCustomPath?u`
                      <div class="space-y-1">
                        <input
                          type="text"
                          .value=${this.customPath}
                          @input=${e=>{this.customPath=e.target.value}}
                          placeholder="/path/to/worktree"
                          class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm"
                          ?disabled=${this.disabled||this.isCreating||this.isCreatingWorktree}
                        />
                        <div class="text-[10px] text-text-dim">
                          ${this.customPath.trim()?`Will create at: ${this.customPath.trim()}`:"Enter absolute path for the worktree"}
                        </div>
                      </div>
                    `:u`
                      <div class="text-[10px] text-text-dim">
                        Will use default path: ${this.gitRepoInfo?.repoPath||""}-${this.newBranchName.trim().replace(/[^a-zA-Z0-9-_]/g,"-")||"branch"}
                      </div>
                    `}
                  
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      @click=${this.handleCancelCreateWorktree}
                      class="text-[10px] sm:text-xs text-text-muted hover:text-text transition-colors"
                      ?disabled=${this.disabled||this.isCreating||this.isCreatingWorktree}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      @click=${this.handleCreateWorktree}
                      class="text-[10px] sm:text-xs px-2 py-1 bg-primary text-bg-elevated rounded hover:bg-primary-dark transition-colors disabled:opacity-50"
                      ?disabled=${!this.newBranchName.trim()||this.useCustomPath&&!this.customPath.trim()||this.disabled||this.isCreating||this.isCreatingWorktree}
                    >
                      ${this.isCreatingWorktree?"Creating...":"Create"}
                    </button>
                  </div>
                </div>
              `:u`
                <div class="relative">
                  <select
                    .value=${this.selectedWorktree||"none"}
                    @change=${this.handleWorktreeChange}
                    class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm appearance-none pr-8"
                    ?disabled=${this.disabled||this.isCreating||this.isLoadingWorktrees}
                    data-testid="git-worktree-select"
                  >
                    <option value="none">
                      ${this.availableWorktrees.some(e=>e.isCurrentWorktree&&!e.isMainWorktree)?"Use main repository":"Use selected worktree"}
                    </option>
                    ${this.availableWorktrees.map(e=>{let t=e.path.split("/").pop()||e.path,s=t.toLowerCase()!==e.branch.toLowerCase()&&!t.toLowerCase().endsWith(`-${e.branch.toLowerCase()}`);return u`
                        <option value="${e.branch}" ?selected=${e.branch===this.selectedWorktree}>
                          ${t}${s?` [${e.branch}]`:""}${e.isMainWorktree?" (main)":""}${e.isCurrentWorktree?" (current)":""}${this.followMode&&this.followBranch===e.branch?" \u26A1\uFE0F following":""}
                        </option>
                      `})}
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-text-muted">
                    <svg class="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    @click=${()=>{this.showCreateWorktree=!0,this.newBranchName=""}}
                    class="text-[10px] sm:text-xs text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
                    ?disabled=${this.disabled||this.isCreating}
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Create new worktree
                  </button>
                </div>
              `}
          </div>
        </div>
      </div>
    `):j}};d([C({type:Object})],ue.prototype,"gitRepoInfo",2),d([C({type:Boolean})],ue.prototype,"disabled",2),d([C({type:Boolean})],ue.prototype,"isCreating",2),d([C({type:String})],ue.prototype,"currentBranch",2),d([C({type:String})],ue.prototype,"selectedBaseBranch",2),d([C({type:String})],ue.prototype,"selectedWorktree",2),d([C({type:Array})],ue.prototype,"availableBranches",2),d([C({type:Array})],ue.prototype,"availableWorktrees",2),d([C({type:Boolean})],ue.prototype,"isLoadingBranches",2),d([C({type:Boolean})],ue.prototype,"isLoadingWorktrees",2),d([C({type:Boolean})],ue.prototype,"followMode",2),d([C({type:String})],ue.prototype,"followBranch",2),d([C({type:Boolean})],ue.prototype,"showFollowMode",2),d([C({type:String})],ue.prototype,"branchSwitchWarning",2),d([_()],ue.prototype,"showCreateWorktree",2),d([_()],ue.prototype,"newBranchName",2),d([_()],ue.prototype,"isCreatingWorktree",2),d([_()],ue.prototype,"customPath",2),d([_()],ue.prototype,"useCustomPath",2),ue=d([D("git-branch-selector")],ue);q();var Nh=P("quick-start-editor"),It=class extends R{constructor(){super(...arguments);this.commands=[];this.editing=!1;this.editableCommands=[];this.draggedIndex=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.editableCommands=[...this.commands]}updated(e){e.has("commands")&&(this.editableCommands=[...this.commands])}handleStartEdit(){this.editing=!0,this.editableCommands=[...this.commands],this.dispatchEvent(new CustomEvent("editing-changed",{detail:{editing:!0},bubbles:!0,composed:!0}))}handleSave(){let e=this.editableCommands.filter(t=>t.command.trim());this.dispatchEvent(new CustomEvent("quick-start-changed",{detail:e,bubbles:!0,composed:!0})),this.editing=!1,this.dispatchEvent(new CustomEvent("editing-changed",{detail:{editing:!1},bubbles:!0,composed:!0}))}handleCancel(){this.editableCommands=[...this.commands],this.editing=!1,this.dispatchEvent(new CustomEvent("cancel")),this.dispatchEvent(new CustomEvent("editing-changed",{detail:{editing:!1},bubbles:!0,composed:!0}))}handleNameChange(e,t){this.editableCommands=[...this.editableCommands],this.editableCommands[e]={...this.editableCommands[e],name:t||void 0},this.requestUpdate()}handleCommandChange(e,t){this.editableCommands=[...this.editableCommands],this.editableCommands[e]={...this.editableCommands[e],command:t},this.requestUpdate()}handleAddCommand(){this.editableCommands=[...this.editableCommands,{command:""}],this.requestUpdate(),setTimeout(()=>{let e=this.querySelectorAll("input[data-command-input]");e[e.length-1]?.focus()},0)}handleResetToDefaults(){this.editableCommands=[...Nr],this.requestUpdate()}handleRemoveCommand(e){this.editableCommands=this.editableCommands.filter((t,s)=>s!==e),this.requestUpdate()}handleDragStart(e,t){this.draggedIndex=t,e.dataTransfer&&(e.dataTransfer.effectAllowed="move",e.dataTransfer.setData("text/html","")),e.target.classList.add("opacity-50")}handleDragEnd(e){e.target.classList.remove("opacity-50"),this.draggedIndex=null}handleDragOver(e){e.preventDefault(),e.dataTransfer&&(e.dataTransfer.dropEffect="move")}handleDrop(e,t){if(e.preventDefault(),this.draggedIndex===null||this.draggedIndex===t)return;let s=[...this.editableCommands],n=s[this.draggedIndex];s.splice(this.draggedIndex,1);let o=this.draggedIndex<t?t-1:t;s.splice(o,0,n),this.editableCommands=s,this.requestUpdate()}render(){return this.editing?u`
      <div class="w-full px-3 sm:px-4 lg:px-6 bg-bg-elevated py-3 sm:py-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-medium text-text-muted">Commands shown in the new session form for quick access.</h3>
          <div class="flex gap-2">
            <button
              id="quick-start-cancel-button"
              @click=${this.handleCancel}
              class="text-text-muted hover:text-text text-[10px] transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              id="quick-start-save-button"
              @click=${this.handleSave}
              class="text-primary hover:text-primary-hover text-[10px] font-medium transition-colors duration-200"
            >
              Save
            </button>
          </div>
        </div>
        
        <div class="space-y-2 max-h-48 overflow-y-auto">
          ${this.editableCommands.map((e,t)=>u`
            <div 
              id=${`quick-start-command-item-${t}`}
              draggable="true"
              @dragstart=${s=>this.handleDragStart(s,t)}
              @dragend=${this.handleDragEnd}
              @dragover=${this.handleDragOver}
              @drop=${s=>this.handleDrop(s,t)}
              class="flex items-center gap-2 p-2 bg-bg-secondary/50 border border-border/30 rounded-lg cursor-move hover:border-border/50 transition-colors duration-200"
            >
              <svg class="w-3 h-3 text-text-muted flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
              
              <input
                id=${`quick-start-name-input-${t}`}
                type="text"
                .value=${e.name||""}
                @input=${s=>this.handleNameChange(t,s.target.value)}
                placeholder="Display name (optional)"
                class="flex-1 min-w-0 bg-bg-secondary border border-border/30 rounded px-2 py-1 text-[10px] text-text focus:border-primary focus:outline-none"
              />
              
              <input
                id=${`quick-start-command-input-${t}`}
                type="text"
                .value=${e.command}
                @input=${s=>this.handleCommandChange(t,s.target.value)}
                placeholder="Command"
                data-command-input
                class="flex-1 min-w-0 bg-bg-secondary border border-border/30 rounded px-2 py-1 text-[10px] text-text font-mono focus:border-primary focus:outline-none"
              />
              
              <button
                id=${`quick-start-remove-command-${t}`}
                @click=${()=>this.handleRemoveCommand(t)}
                class="text-text-muted hover:text-error transition-colors duration-200 p-1"
                title="Remove command"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          `)}
        </div>
        
        <!-- Bottom actions -->
        <div class="flex justify-between items-center mt-4">
          <button
            id="quick-start-reset-button"
            @click=${this.handleResetToDefaults}
            class="text-primary hover:text-primary-hover text-[10px] transition-colors duration-200"
            title="Reset to default commands"
          >
            Reset to Defaults
          </button>
          
          <div class="flex gap-4 items-center">
            <button
              id="quick-start-delete-all-button"
              @click=${()=>{this.editableCommands=[],this.requestUpdate()}}
              class="text-error hover:text-error-hover text-xs transition-colors duration-200"
            >
              Delete All
            </button>
            
            <button
              id="quick-start-add-command-button"
              @click=${this.handleAddCommand}
              class="bg-bg-secondary hover:bg-hover text-text-muted hover:text-primary px-3 py-1.5 rounded-md transition-colors duration-200 text-xs font-medium flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6" />
              </svg>
              Add
            </button>
          </div>
        </div>
      </div>
    `:u`
        <button
          id="quick-start-edit-button"
          @click=${this.handleStartEdit}
          class="text-primary hover:text-primary-hover text-[10px] sm:text-xs transition-colors duration-200 flex items-center gap-1"
          title="Edit quick start commands"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
      `}};d([C({type:Array})],It.prototype,"commands",2),d([C({type:Boolean})],It.prototype,"editing",2),d([_()],It.prototype,"editableCommands",2),d([_()],It.prototype,"draggedIndex",2),It=d([D("quick-start-editor")],It);var vt=class extends R{constructor(){super(...arguments);this.commands=[];this.selectedCommand="";this.disabled=!1;this.isCreating=!1;this.editMode=!1}createRenderRoot(){return this}handleQuickStartClick(e){this.dispatchEvent(new CustomEvent("quick-start-selected",{detail:{command:e},bubbles:!0,composed:!0}))}handleQuickStartChanged(e){this.dispatchEvent(new CustomEvent("quick-start-changed",{detail:e.detail,bubbles:!0,composed:!0}))}handleEditingChanged(e){this.editMode=e.detail.editing}render(){return u`
      <div class="${this.editMode?"mt-3 sm:mt-4 mb-3 sm:mb-4":"mb-3 sm:mb-4"}">
        ${this.editMode?u`
            <!-- Full width editor when in edit mode -->
            <div class="-mx-3 sm:-mx-4 lg:-mx-6">
              <quick-start-editor
                .commands=${this.commands.map(e=>({name:e.label===e.command?void 0:e.label,command:e.command}))}
                .editing=${!0}
                @quick-start-changed=${this.handleQuickStartChanged}
                @editing-changed=${this.handleEditingChanged}
              ></quick-start-editor>
            </div>
          `:u`
            <!-- Normal mode with Edit button -->
            <div class="flex items-center justify-between mb-1 sm:mb-2 mt-3 sm:mt-4">
              <label class="form-label text-text-muted uppercase text-[9px] sm:text-[10px] lg:text-xs tracking-wider">
                Quick Start
              </label>
              <quick-start-editor
                .commands=${this.commands.map(e=>({name:e.label===e.command?void 0:e.label,command:e.command}))}
                .editing=${!1}
                @quick-start-changed=${this.handleQuickStartChanged}
                @editing-changed=${this.handleEditingChanged}
              ></quick-start-editor>
            </div>
          `}
        ${this.editMode?"":u`
            <div class="grid grid-cols-2 gap-2 sm:gap-2.5 lg:gap-3 mt-1.5 sm:mt-2">
              ${this.commands.map(({label:e,command:t})=>u`
                  <button
                    @click=${()=>this.handleQuickStartClick(t)}
                    class="${this.selectedCommand===t?"px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4 lg:py-3 rounded-lg border text-left transition-all bg-primary/10 border-primary/50 text-primary hover:bg-primary/20 font-medium text-[10px] sm:text-xs lg:text-sm":"px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4 lg:py-3 rounded-lg border text-left transition-all bg-bg-elevated border-border/50 text-text hover:bg-hover hover:border-primary/50 hover:text-primary text-[10px] sm:text-xs lg:text-sm"}"
                    ?disabled=${this.disabled||this.isCreating}
                    type="button"
                  >
                    ${e}
                  </button>
                `)}
            </div>
          `}
      </div>
    `}};d([C({type:Array})],vt.prototype,"commands",2),d([C({type:String})],vt.prototype,"selectedCommand",2),d([C({type:Boolean})],vt.prototype,"disabled",2),d([C({type:Boolean})],vt.prototype,"isCreating",2),d([_()],vt.prototype,"editMode",2),vt=d([D("quick-start-section")],vt);we();we();function wn(c){switch(c){case"none":return"Apps control their own titles";case"filter":return"Blocks all title changes";case"static":return"Shows path and command";case"dynamic":return"\u25CB idle \u25CF active \u25B6 running";default:return""}}var Re=class extends R{constructor(){super(...arguments);this.macAppConnected=!1;this.spawnWindow=!1;this.titleMode="dynamic";this.gitRepoInfo=null;this.followMode=!1;this.followBranch=null;this.showFollowMode=!1;this.disabled=!1;this.isCreating=!1;this.expanded=!1}createRenderRoot(){return this}handleToggle(){this.expanded=!this.expanded}handleSpawnWindowToggle(){this.dispatchEvent(new CustomEvent("spawn-window-changed",{detail:{enabled:!this.spawnWindow},bubbles:!0,composed:!0}))}handleTitleModeChange(e){let t=e.target;this.dispatchEvent(new CustomEvent("title-mode-changed",{detail:{mode:t.value},bubbles:!0,composed:!0}))}handleFollowModeToggle(){this.dispatchEvent(new CustomEvent("follow-mode-changed",{detail:{enabled:!this.showFollowMode},bubbles:!0,composed:!0}))}render(){return u`
      <div class="mb-2 sm:mb-4 lg:mb-6">
        <button
          id="session-options-button"
          @click=${this.handleToggle}
          class="flex items-center gap-1.5 sm:gap-2 text-text-muted hover:text-primary transition-colors duration-200"
          type="button"
          aria-expanded="${this.expanded}"
        >
          <svg 
            width="8" 
            height="8" 
            class="sm:w-2 sm:h-2 lg:w-2.5 lg:h-2.5 transition-transform duration-200 flex-shrink-0" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            style="transform: ${this.expanded?"rotate(90deg)":"rotate(0deg)"}"
          >
            <path
              d="M5.22 1.22a.75.75 0 011.06 0l6.25 6.25a.75.75 0 010 1.06l-6.25 6.25a.75.75 0 01-1.06-1.06L10.94 8 5.22 2.28a.75.75 0 010-1.06z"
            />
          </svg>
          <span class="form-label mb-0 text-text-muted uppercase text-[9px] sm:text-[10px] lg:text-xs tracking-wider">Options</span>
        </button>

        ${this.expanded?u`
            <div class="mt-2 sm:mt-3">
              <!-- Spawn Window Toggle - Only show when Mac app is connected -->
              ${this.macAppConnected?u`
                  <div class="flex items-center justify-between bg-bg-elevated border border-border/50 rounded-lg p-2 sm:p-3 lg:p-4 mb-2 sm:mb-3">
                    <div class="flex-1 pr-2 sm:pr-3 lg:pr-4">
                      <span class="text-primary text-[10px] sm:text-xs lg:text-sm font-medium">Spawn window</span>
                      <p class="text-[9px] sm:text-[10px] lg:text-xs text-text-muted mt-0.5 hidden sm:block">Opens native terminal window</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked="${this.spawnWindow}"
                      @click=${this.handleSpawnWindowToggle}
                      class="relative inline-flex h-4 w-8 sm:h-5 sm:w-10 lg:h-6 lg:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-bg-secondary ${this.spawnWindow?"bg-primary":"bg-border/50"}"
                      ?disabled=${this.disabled||this.isCreating}
                      data-testid="spawn-window-toggle"
                    >
                      <span
                        class="inline-block h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 transform rounded-full bg-bg-elevated transition-transform ${this.spawnWindow?"translate-x-4 sm:translate-x-5":"translate-x-0.5"}"
                      ></span>
                    </button>
                  </div>
                `:""}

              <!-- Terminal Title Mode -->
              <div class="flex items-center justify-between bg-bg-elevated border border-border/50 rounded-lg p-2 sm:p-3 lg:p-4 mb-2 sm:mb-3">
                <div class="flex-1 pr-2 sm:pr-3 lg:pr-4">
                  <span class="text-primary text-[10px] sm:text-xs lg:text-sm font-medium">Terminal Title Mode</span>
                  <p class="text-[9px] sm:text-[10px] lg:text-xs text-text-muted mt-0.5 hidden sm:block">
                    ${wn(this.titleMode)}
                  </p>
                </div>
                <div class="relative">
                  <select
                    .value=${this.titleMode}
                    @change=${this.handleTitleModeChange}
                    class="bg-bg-tertiary border border-border/50 rounded-lg px-1.5 py-1 pr-6 sm:px-2 sm:py-1.5 sm:pr-7 lg:px-3 lg:py-2 lg:pr-8 text-text text-[10px] sm:text-xs lg:text-sm transition-all duration-200 hover:border-primary/50 focus:border-primary focus:outline-none appearance-none cursor-pointer"
                    style="min-width: 80px"
                    ?disabled=${this.disabled||this.isCreating}
                  >
                    <option value="${"none"}" class="bg-bg-tertiary text-text" ?selected=${this.titleMode==="none"}>None</option>
                    <option value="${"filter"}" class="bg-bg-tertiary text-text" ?selected=${this.titleMode==="filter"}>Filter</option>
                    <option value="${"static"}" class="bg-bg-tertiary text-text" ?selected=${this.titleMode==="static"}>Static</option>
                    <option value="${"dynamic"}" class="bg-bg-tertiary text-text" ?selected=${this.titleMode==="dynamic"}>Dynamic</option>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 sm:px-1.5 lg:px-2 text-text-muted">
                    <svg class="h-2.5 w-2.5 sm:h-3 sm:w-3 lg:h-4 lg:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Follow Mode Toggle - Show only when a worktree is selected -->
              ${this.gitRepoInfo?.isGitRepo&&this.selectedWorktree&&this.selectedWorktree!=="none"?u`
                  <div class="flex items-center justify-between bg-bg-elevated border border-border/50 rounded-lg p-2 sm:p-3 lg:p-4">
                    <div class="flex-1 pr-2 sm:pr-3 lg:pr-4">
                      <span class="text-primary text-[10px] sm:text-xs lg:text-sm font-medium">Follow Mode</span>
                      <p class="text-[9px] sm:text-[10px] lg:text-xs text-text-muted mt-0.5 hidden sm:block">
                        ${this.followMode?`Currently following: ${this.followBranch||"unknown"}`:"Keep main repository in sync with this worktree"}
                      </p>
                    </div>
                    <button
                      role="switch"
                      aria-checked="${this.showFollowMode}"
                      @click=${this.handleFollowModeToggle}
                      class="relative inline-flex h-4 w-8 sm:h-5 sm:w-10 lg:h-6 lg:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-bg-secondary ${this.showFollowMode?"bg-primary":"bg-border/50"}"
                      ?disabled=${this.disabled||this.isCreating||this.followMode}
                      data-testid="follow-mode-toggle"
                    >
                      <span
                        class="inline-block h-3 w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5 transform rounded-full bg-bg-elevated transition-transform ${this.showFollowMode?"translate-x-4 sm:translate-x-5":"translate-x-0.5"}"
                      ></span>
                    </button>
                  </div>
                `:""}
            </div>
          `:""}
      </div>
    `}};d([C({type:Boolean})],Re.prototype,"macAppConnected",2),d([C({type:Boolean})],Re.prototype,"spawnWindow",2),d([C({type:String})],Re.prototype,"titleMode",2),d([C({type:Object})],Re.prototype,"gitRepoInfo",2),d([C({type:Boolean})],Re.prototype,"followMode",2),d([C({type:String})],Re.prototype,"followBranch",2),d([C({type:Boolean})],Re.prototype,"showFollowMode",2),d([C({type:String})],Re.prototype,"selectedWorktree",2),d([C({type:Boolean})],Re.prototype,"disabled",2),d([C({type:Boolean})],Re.prototype,"isCreating",2),d([_()],Re.prototype,"expanded",2),Re=d([D("form-options-section")],Re);var At=class extends R{constructor(){super(...arguments);this.visible=!1;this.items=[];this.selectedIndex=-1;this.isLoading=!1}createRenderRoot(){return this}handleItemClick(e){this.dispatchEvent(new CustomEvent("item-selected",{detail:{suggestion:e.suggestion},bubbles:!0,composed:!0}))}render(){return!this.visible||this.items.length===0?j:u`
      <div class="absolute left-0 right-0 mt-1 bg-bg-elevated border border-border/50 rounded-lg overflow-hidden shadow-lg z-50">
        <div class="max-h-48 sm:max-h-64 lg:max-h-80 overflow-y-auto">
          ${this.items.map((e,t)=>u`
              <button
                @click=${()=>this.handleItemClick(e)}
                class="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors duration-200 flex items-center gap-2 ${t===this.selectedIndex?"bg-primary/20 border-l-2 border-primary":""}"
                type="button"
              >
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 16 16" 
                  fill="currentColor"
                  class="${e.isRepository?"text-primary":"text-text-muted"} flex-shrink-0"
                >
                  ${e.isRepository?u`<path d="M4.177 7.823A4.5 4.5 0 118 12.5a4.474 4.474 0 01-1.653-.316.75.75 0 11.557-1.392 2.999 2.999 0 001.096.208 3 3 0 10-2.108-5.134.75.75 0 01.236.662l.428 3.009a.75.75 0 01-1.255.592L2.847 7.677a.75.75 0 01.426-1.27A4.476 4.476 0 014.177 7.823zM8 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 018 1zm3.197 2.197a.75.75 0 01.092.992l-1 1.25a.75.75 0 01-1.17-.938l1-1.25a.75.75 0 01.992-.092.75.75 0 01.086.038zM5.75 8a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 015.75 8zm5.447 2.197a.75.75 0 01.092.992l-1 1.25a.75.75 0 11-1.17-.938l1-1.25a.75.75 0 01.992-.092.75.75 0 01.086.038z" />`:e.type==="directory"?u`<path d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v1h4c.966 0 1.75.784 1.75 1.75v7.75A1.75 1.75 0 0113 15H3a1.75 1.75 0 01-1.75-1.75V2.75C1.25 1.784 1.784 1 1.75 1zM2.75 2.5v10.75c0 .138.112.25.25.25h10a.25.25 0 00.25-.25V5.5a.25.25 0 00-.25-.25H8.75v-2.5a.25.25 0 00-.25-.25h-5.5a.25.25 0 00-.25.25z" />`:u`<path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0113.25 16h-9.5A1.75 1.75 0 012 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 00.25-.25V6h-2.75A1.75 1.75 0 019 4.25V1.5H3.75zm6.75.062V4.25c0 .138.112.25.25.25h2.688a.252.252 0 00-.011-.013l-2.914-2.914a.272.272 0 00-.013-.011z" />`}
                </svg>
                
                <!-- Folder name -->
                <span class="text-text text-xs sm:text-sm font-medium min-w-0">
                  ${e.name}
                </span>
                
                <!-- Git branch and worktree indicator -->
                ${e.gitBranch?u`
                    <span class="text-primary text-[9px] sm:text-[10px] flex items-center gap-1">
                      <span>[${e.gitBranch}]</span>
                      ${e.isWorktree?u`<span class="text-purple-500 ml-0.5" title="Git worktree">
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
                            </svg>
                          </span>`:j}
                    </span>`:j}
                
                <!-- Git changes indicators -->
                ${e.gitAddedCount||e.gitModifiedCount||e.gitDeletedCount?u`
                    <div class="flex items-center gap-1.5 text-[9px] sm:text-[10px]">
                      ${e.gitAddedCount&&e.gitAddedCount>0?u`
                          <span class="flex items-center gap-0.5 text-green-500">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                            <span>${e.gitAddedCount}</span>
                          </span>
                        `:j}
                      ${e.gitModifiedCount&&e.gitModifiedCount>0?u`
                          <span class="flex items-center gap-0.5 text-yellow-500">
                            <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" />
                            </svg>
                            <span>${e.gitModifiedCount}</span>
                          </span>
                        `:j}
                      ${e.gitDeletedCount&&e.gitDeletedCount>0?u`
                          <span class="flex items-center gap-0.5 text-red-500">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                            <span>${e.gitDeletedCount}</span>
                          </span>
                        `:j}
                    </div>
                  `:j}
                
                <!-- Spacer -->
                <div class="flex-1"></div>
              </button>
            `)}
        </div>
      </div>
    `}};d([C({type:Boolean})],At.prototype,"visible",2),d([C({type:Array})],At.prototype,"items",2),d([C({type:Number})],At.prototype,"selectedIndex",2),d([C({type:Boolean})],At.prototype,"isLoading",2),At=d([D("directory-autocomplete")],At);var fi=class extends R{constructor(){super(...arguments);this.visible=!1;this.repositories=[]}createRenderRoot(){return this}handleRepositoryClick(e){this.dispatchEvent(new CustomEvent("repository-selected",{detail:{path:e},bubbles:!0,composed:!0}))}render(){return!this.visible||this.repositories.length===0?j:u`
      <div class="mt-2 bg-bg-elevated border border-border/50 rounded-lg overflow-hidden">
        <div class="max-h-48 overflow-y-auto">
          ${this.repositories.map(e=>u`
              <button
                @click=${()=>this.handleRepositoryClick(e.path)}
                class="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors duration-200 border-b border-border/30 last:border-b-0"
                type="button"
              >
                <div class="flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <div class="text-text text-xs sm:text-sm font-medium">${e.folderName}</div>
                    </div>
                    <div class="text-text-muted text-[9px] sm:text-[10px] mt-0.5">${e.relativePath}</div>
                  </div>
                  <div class="text-text-muted text-[9px] sm:text-[10px]">
                    ${new Date(e.lastModified).toLocaleDateString()}
                  </div>
                </div>
              </button>
            `)}
        </div>
      </div>
    `}};d([C({type:Boolean})],fi.prototype,"visible",2),d([C({type:Array})],fi.prototype,"repositories",2),fi=d([D("repository-dropdown")],fi);we();we();q();var gi=P("git-service"),Jt=class{constructor(i){this.authClient=i}async checkGitRepo(i){try{let e=await fetch(`/api/git/repo-info?path=${encodeURIComponent(i)}`,{headers:this.authClient.getAuthHeader()});if(!e.ok)throw new Error(`Failed to check git repo: ${e.statusText}`);return await e.json()}catch(e){throw gi.error("Failed to check git repo:",e),e}}async listWorktrees(i){try{let e=await fetch(`/api/worktrees?repoPath=${encodeURIComponent(i)}`,{headers:this.authClient.getAuthHeader()});if(!e.ok)throw new Error(`Failed to list worktrees: ${e.statusText}`);return await e.json()}catch(e){throw gi.error("Failed to list worktrees:",e),e}}async createWorktree(i,e,t,s){try{let n=await fetch("/api/worktrees",{method:"POST",headers:{"Content-Type":"application/json",...this.authClient.getAuthHeader()},body:JSON.stringify({repoPath:i,branch:e,path:t,baseBranch:s})});if(!n.ok){let o=await n.json().catch(()=>({error:"Unknown error"}));throw new Error(o.error||`Failed to create worktree: ${n.statusText}`)}}catch(n){throw gi.error("Failed to create worktree:",n),n}}async deleteWorktree(i,e,t=!1){try{let s=new URLSearchParams({repoPath:i});t&&s.append("force","true");let n=await fetch(`/api/worktrees/${encodeURIComponent(e)}?${s}`,{method:"DELETE",headers:this.authClient.getAuthHeader()});if(!n.ok){let o=await n.json().catch(()=>({error:"Unknown error"}));throw new Error(o.error||`Failed to delete worktree: ${n.statusText}`)}}catch(s){throw gi.error("Failed to delete worktree:",s),s}}async pruneWorktrees(i){try{let e=await fetch("/api/worktrees/prune",{method:"POST",headers:{"Content-Type":"application/json",...this.authClient.getAuthHeader()},body:JSON.stringify({repoPath:i})});if(!e.ok)throw new Error(`Failed to prune worktrees: ${e.statusText}`)}catch(e){throw gi.error("Failed to prune worktrees:",e),e}}async setFollowMode(i,e,t){try{let s=await fetch("/api/worktrees/follow",{method:"POST",headers:{"Content-Type":"application/json",...this.authClient.getAuthHeader()},body:JSON.stringify({repoPath:i,branch:e,enable:t})});if(!s.ok){let n=await s.json().catch(()=>({error:"Unknown error"}));throw new Error(n.error||`Failed to set follow mode: ${s.statusText}`)}}catch(s){throw gi.error("Failed to set follow mode:",s),s}}};q();var mr=P("repository-service"),Lt=class{constructor(i,e){this.authClient=i,this.serverConfigService=e}async discoverRepositories(){try{let i=await this.serverConfigService.getRepositoryBasePath(),e=await fetch(`/api/repositories/discover?path=${encodeURIComponent(i)}`,{headers:this.authClient.getAuthHeader()});if(e.ok){let t=await e.json();return mr.debug(`Discovered ${t.length} repositories`),t}else return mr.error("Failed to discover repositories"),[]}catch(i){return mr.error("Error discovering repositories:",i),[]}}};we();q();var fr=P("session-service"),zi=class{constructor(i){this.authClient=i}async createSession(i){try{let e=await fetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json",...this.authClient.getAuthHeader()},body:JSON.stringify(i)});if(e.ok){let t=await e.json();return fr.log("Session created successfully:",t.sessionId),t}else{let t=await e.json(),s=t.details||t.error||"Unknown error";throw fr.error("Failed to create session:",s),new Error(s)}}catch(e){throw e instanceof Error&&e.message?e:(fr.error("Error creating session:",e),new Error("Failed to create session"))}}};function xn(c){let i=[],e="",t=!1,s="";for(let n=0;n<c.length;n++){let o=c[n];(o==='"'||o==="'")&&!t?(t=!0,s=o):o===s&&t?(t=!1,s=""):o===" "&&!t?e&&(i.push(e),e=""):e+=o}return e&&i.push(e),i}q();q();var Ni=P("storage-utils"),it={WORKING_DIR:"vibetunnel_last_working_dir",COMMAND:"vibetunnel_last_command",SPAWN_WINDOW:"vibetunnel_spawn_window",TITLE_MODE:"vibetunnel_title_mode"};function Sn(){try{let c=localStorage.getItem(it.WORKING_DIR)||void 0,i=localStorage.getItem(it.COMMAND)||void 0,e=localStorage.getItem(it.SPAWN_WINDOW),t=localStorage.getItem(it.TITLE_MODE);return{workingDir:c,command:i,spawnWindow:e!==null?e==="true":void 0,titleMode:t||void 0}}catch(c){return Ni.warn("Failed to load from localStorage:",c),{}}}function Cn(c){try{c.workingDir&&localStorage.setItem(it.WORKING_DIR,c.workingDir),c.command&&localStorage.setItem(it.COMMAND,c.command),c.spawnWindow!==void 0&&localStorage.setItem(it.SPAWN_WINDOW,String(c.spawnWindow)),c.titleMode!==void 0&&localStorage.setItem(it.TITLE_MODE,c.titleMode)}catch(i){Ni.warn("Failed to save to localStorage:",i)}}function kn(c){try{return localStorage.getItem(it[c])}catch(i){return Ni.warn(`Failed to get ${c} from localStorage:`,i),null}}function _n(c,i){try{localStorage.setItem(it[c],i)}catch(e){Ni.warn(`Failed to set ${c} in localStorage:`,e)}}function En(c){try{localStorage.removeItem(it[c])}catch(i){Ni.warn(`Failed to remove ${c} from localStorage:`,i)}}q();var Tn=P("autocomplete-manager"),Ss=class{constructor(i){this.repositories=[];this.authClient=i}setAuthClient(i){this.authClient=i}setRepositories(i){this.repositories=i}async fetchCompletions(i){if(!i)return[];try{let e=await fetch(`/api/fs/completions?path=${encodeURIComponent(i)}`,{headers:this.authClient?.getAuthHeader()||{}});if(!e.ok)return Tn.error("Failed to fetch completions"),[];let n=((await e.json()).completions||[]).filter(a=>a.type==="directory");if((!i.includes("/")||(i.match(/\//g)||[]).length===1&&i.endsWith("/")===!1)&&this.repositories.length>0){let a=i.toLowerCase().replace("~/",""),m=this.repositories.filter(v=>v.folderName.toLowerCase().includes(a)).map(v=>({name:v.folderName,path:v.relativePath,type:"directory",suggestion:v.path,isRepository:!0,gitBranch:v.gitBranch,gitStatusCount:0})),p=new Set(n.map(v=>v.suggestion)),h=m.filter(v=>!p.has(v.suggestion));n.push(...h)}return this.sortCompletions(n,i).slice(0,20)}catch(e){return Tn.error("Error fetching completions:",e),[]}}sortCompletions(i,e){let s=e.toLowerCase().split("/").pop()||"";return i.sort((n,o)=>{let r=n.name.toLowerCase()===s,a=o.name.toLowerCase()===s;if(r&&!a)return-1;if(!r&&a)return 1;let m=n.name.toLowerCase().startsWith(s),p=o.name.toLowerCase().startsWith(s);return m&&!p?-1:!m&&p?1:n.isRepository&&!o.isRepository?-1:!n.isRepository&&o.isRepository?1:n.name.localeCompare(o.name)})}filterCompletions(i,e){if(!e)return i;let t=e.toLowerCase();return i.filter(s=>{let n=s.name.toLowerCase(),o=s.path.toLowerCase();return n.includes(t)||o.includes(t)})}};we();q();var Zt=P("git-utils");async function Mn(c,i){try{let e=await fetch(`/api/repositories/branches?${new URLSearchParams({path:c})}`,{headers:i.getAuthHeader()});if(e.ok){let t=await e.json(),s=t.map(o=>o.name),n=t.find(o=>o.current)?.name||null;return{branches:s,currentBranch:n}}else return Zt.error("Failed to load branches:",e.statusText),{branches:[],currentBranch:null}}catch(e){return Zt.error("Failed to load branches:",e),{branches:[],currentBranch:null}}}async function $n(c,i){try{let e=await fetch(`/api/worktrees?${new URLSearchParams({repoPath:c})}`,{headers:i.getAuthHeader()});if(e.ok){let t=await e.json();return{followMode:!!t.followBranch,followBranch:t.followBranch||null}}else return Zt.error("Failed to check follow mode:",e.statusText),{followMode:!1,followBranch:null}}catch(e){return Zt.error("Failed to check follow mode:",e),{followMode:!1,followBranch:null}}}async function In(c,i,e){try{let t=await fetch("/api/worktrees/follow",{method:"POST",headers:{...e.getAuthHeader(),"Content-Type":"application/json"},body:JSON.stringify({repoPath:c,branch:i,enable:!0})});return t.ok?(Zt.log("Follow mode enabled successfully"),!0):(Zt.error("Failed to enable follow mode:",t.statusText),!1)}catch(t){return Zt.error("Error enabling follow mode:",t),!1}}function An(c,i){let e=i.trim().replace(/[^a-zA-Z0-9-_]/g,"-");return`${c}-${e}`}var se=P("session-create-form"),Q=class extends R{constructor(){super(...arguments);this.workingDir=Ue;this.command="zsh";this.sessionName="";this.disabled=!1;this.visible=!1;this.spawnWindow=!1;this.titleMode="dynamic";this.isCreating=!1;this.showFileBrowser=!1;this.showRepositoryDropdown=!1;this.repositories=[];this.macAppConnected=!1;this.showCompletions=!1;this.completions=[];this.selectedCompletionIndex=-1;this.isLoadingCompletions=!1;this.gitRepoInfo=null;this.availableBranches=[];this.currentBranch="";this.selectedBaseBranch="";this.availableWorktrees=[];this.isLoadingBranches=!1;this.isLoadingWorktrees=!1;this.followMode=!1;this.followBranch=null;this.showFollowMode=!1;this.quickStartCommands=[{label:"\u2728 claude",command:"claude"},{label:"\u2728 gemini",command:"gemini"},{label:"\u2728 opencode",command:"opencode"},{label:"zsh",command:"zsh"},{label:"python3",command:"python3"},{label:"node",command:"node"},{label:"\u25B6\uFE0F pnpm run dev",command:"pnpm run dev"}];this.selectedQuickStart="";this.isDiscovering=!1;this.isCheckingGit=!1;this.isCheckingFollowMode=!1;this.handleGlobalKeyDown=e=>{if(this.visible){if(e.key==="Escape")e.preventDefault(),e.stopPropagation(),this.showCompletions?(this.showCompletions=!1,this.selectedCompletionIndex=-1):this.handleCancel();else if(e.key==="Enter"){if(e.target instanceof HTMLTextAreaElement||this.showCompletions&&this.selectedCompletionIndex>=0)return;!this.disabled&&!this.isCreating&&this.workingDir?.trim()&&this.command?.trim()&&(e.preventDefault(),e.stopPropagation(),this.handleCreate())}}}}createRenderRoot(){return this}async connectedCallback(){super.connectedCallback(),this.autocompleteManager=new Ss(this.authClient),this.serverConfigService=new Wt(this.authClient),this.authClient&&(this.repositoryService=new Lt(this.authClient,this.serverConfigService),this.sessionService=new zi(this.authClient),this.gitService=new Jt(this.authClient)),await this.loadFromLocalStorage(),this.checkServerStatus(),this.loadServerConfig()}disconnectedCallback(){super.disconnectedCallback(),this.visible&&document.removeEventListener("keydown",this.handleGlobalKeyDown),this.completionsDebounceTimer&&clearTimeout(this.completionsDebounceTimer),this.gitCheckDebounceTimer&&clearTimeout(this.gitCheckDebounceTimer)}async loadFromLocalStorage(){let e=Sn(),t=Ue;if(this.serverConfigService)try{t=await this.serverConfigService.getRepositoryBasePath()}catch(s){se.error("Failed to get repository base path from server:",s),t=Ue}this.workingDir=e.workingDir||t||Ue,this.command=e.command||"zsh",this.spawnWindow=e.spawnWindow??!1,this.titleMode=e.titleMode||"dynamic",this.requestUpdate()}saveToLocalStorage(){let e=this.workingDir?.trim()||"",t=this.command?.trim()||"";Cn({workingDir:e,command:t,spawnWindow:this.spawnWindow,titleMode:this.titleMode})}async loadServerConfig(){if(this.serverConfigService)try{let e=await this.serverConfigService.getQuickStartCommands();e&&e.length>0&&(this.quickStartCommands=e.map(t=>({label:t.name||t.command,command:t.command})),se.debug("Loaded quick start commands from server:",this.quickStartCommands))}catch(e){se.error("Failed to load server config:",e)}}async handleQuickStartChanged(e){let t=e.detail;if(!this.serverConfigService){se.error("Server config service not initialized");return}try{await this.serverConfigService.updateQuickStartCommands(t),this.quickStartCommands=t.map(s=>({label:s.name||s.command,command:s.command})),se.debug("Updated quick start commands:",this.quickStartCommands)}catch(s){se.error("Failed to save quick start commands:",s)}}async checkServerStatus(){if(!this.authClient){se.warn("checkServerStatus called without authClient"),this.macAppConnected=!1;return}try{let e=await fetch("/api/server/status",{headers:this.authClient.getAuthHeader()});if(e.ok){let t=await e.json();this.macAppConnected=t.macAppConnected||!1,se.debug("server status:",t)}}catch(e){se.warn("failed to check server status:",e),this.macAppConnected=!1}}updated(e){super.updated(e),e.has("authClient")&&this.authClient&&(!this.repositoryService&&this.serverConfigService&&(this.repositoryService=new Lt(this.authClient,this.serverConfigService)),this.sessionService||(this.sessionService=new zi(this.authClient)),this.gitService||(this.gitService=new Jt(this.authClient)),this.autocompleteManager.setAuthClient(this.authClient),this.serverConfigService&&this.serverConfigService.setAuthClient(this.authClient)),e.has("visible")&&(this.visible?(this.workingDir=Ue,this.command="zsh",this.sessionName="",this.spawnWindow=!1,this.titleMode="dynamic",this.branchSwitchWarning=void 0,this.loadFromLocalStorage().then(()=>{this.checkGitRepository()}).catch(t=>{se.error("Failed to load from localStorage:",t)}),this.checkServerStatus(),document.addEventListener("keydown",this.handleGlobalKeyDown),this.setAttribute("data-modal-state","open"),this.setAttribute("data-modal-rendered","true"),this.discoverRepositories()):(document.removeEventListener("keydown",this.handleGlobalKeyDown),this.removeAttribute("data-modal-state"),this.removeAttribute("data-modal-rendered")))}handleWorkingDirChange(e){let t=e.target;this.workingDir=t.value,this.dispatchEvent(new CustomEvent("working-dir-change",{detail:this.workingDir})),this.showRepositoryDropdown=!1,this.completionsDebounceTimer&&clearTimeout(this.completionsDebounceTimer),this.completionsDebounceTimer=setTimeout(()=>{this.fetchCompletions()},300),this.gitCheckDebounceTimer&&clearTimeout(this.gitCheckDebounceTimer),this.gitCheckDebounceTimer=setTimeout(()=>{this.checkGitRepository()},500)}handleCommandChange(e){let t=e.target;this.command=t.value,this.command.toLowerCase().includes("claude")&&(this.titleMode="dynamic")}handleSessionNameChange(e){let t=e.target;this.sessionName=t.value}handleSpawnWindowChanged(e){this.spawnWindow=e.detail.enabled}handleTitleModeChanged(e){this.titleMode=e.detail.mode}handleFollowModeChanged(e){this.showFollowMode=e.detail.enabled}handleBrowse(){se.debug("handleBrowse called, setting showFileBrowser to true"),this.showFileBrowser=!0,this.requestUpdate()}handleDirectorySelected(e){this.workingDir=Pe(e.detail),this.showFileBrowser=!1,this.checkGitRepository()}handleBrowserCancel(){this.showFileBrowser=!1}async handleCreate(){if(!this.workingDir?.trim()||!this.command?.trim()){this.dispatchEvent(new CustomEvent("error",{detail:"Please fill in both working directory and command"}));return}this.isCreating=!0;let e=this.spawnWindow&&this.macAppConnected,t=this.workingDir?.trim()||"",s="";if(this.selectedWorktree&&this.availableWorktrees.length>0){let o=this.availableWorktrees.find(r=>r.branch===this.selectedWorktree);o?.path&&(t=Pe(o.path),s=this.selectedWorktree,se.log(`Using worktree path: ${t} for branch: ${this.selectedWorktree}`))}else this.gitRepoInfo?.isGitRepo&&this.selectedBaseBranch&&this.selectedBaseBranch!==this.currentBranch?(se.log(`Attempting to switch from ${this.currentBranch} to ${this.selectedBaseBranch}`),se.log(`Selected branch ${this.selectedBaseBranch} differs from current branch ${this.currentBranch}, but direct branch switching is not supported. Using current branch.`),s=this.currentBranch,this.branchSwitchWarning=`Cannot switch to ${this.selectedBaseBranch} without a worktree. Create a worktree or use the current branch ${this.currentBranch}.`):s=this.selectedBaseBranch||this.currentBranch;let n={command:xn(this.command?.trim()||""),workingDir:t,spawn_terminal:e,titleMode:this.titleMode};if(this.gitRepoInfo?.isGitRepo&&this.gitRepoInfo.repoPath&&s&&(n.gitRepoPath=this.gitRepoInfo.repoPath,n.gitBranch=s),e||(n.cols=120,n.rows=30),this.sessionName?.trim()&&(n.name=this.sessionName.trim()),this.showFollowMode&&this.selectedWorktree&&this.selectedWorktree!=="none"&&this.gitRepoInfo?.repoPath&&s&&this.authClient)try{this.followMode&&this.followBranch&&this.followBranch!==s&&se.log(`Follow mode is already active for branch: ${this.followBranch}, switching to: ${s}`),se.log(`Enabling follow mode for worktree branch: ${s}`),await In(this.gitRepoInfo.repoPath,s,this.authClient)?(se.log("Follow mode enabled successfully for worktree"),this.followMode=!0,this.followBranch=s):this.dispatchEvent(new CustomEvent("error",{detail:"Failed to enable follow mode. Session will be created without follow mode.",bubbles:!0,composed:!0}))}catch(o){se.error("Error enabling follow mode:",o),this.dispatchEvent(new CustomEvent("error",{detail:"Error enabling follow mode. Session will be created without follow mode.",bubbles:!0,composed:!0}))}try{if(!this.sessionService)throw new Error("Session service not initialized");let o=await this.sessionService.createSession(n);if(window.location.search.includes("test=true")||navigator.userAgent.includes("HeadlessChrome")){let a=kn("SPAWN_WINDOW");this.saveToLocalStorage(),a!==null?_n("SPAWN_WINDOW",a):En("SPAWN_WINDOW")}else this.saveToLocalStorage();this.command="",this.sessionName="",this.dispatchEvent(new CustomEvent("session-created",{detail:o}))}catch(o){let r=o instanceof Error?o.message:"Failed to create session";se.error("Error creating session:",o),this.dispatchEvent(new CustomEvent("error",{detail:r}))}finally{this.isCreating=!1}}handleCancel(){this.dispatchEvent(new CustomEvent("cancel"))}handleBackdropClick(e){e.target===e.currentTarget&&this.handleCancel()}handleQuickStartSelected(e){let t=e.detail.command;this.command=t,this.selectedQuickStart=t,t.toLowerCase().includes("claude")&&(this.titleMode="dynamic")}handleBranchChanged(e){this.selectedBaseBranch=e.detail.branch,this.branchSwitchWarning=void 0}handleWorktreeChanged(e){this.selectedWorktree=e.detail.worktree,this.branchSwitchWarning=void 0,(!this.selectedWorktree||this.selectedWorktree==="none")&&(this.showFollowMode=!1)}async handleCreateWorktreeRequest(e){let{branchName:t,baseBranch:s,customPath:n}=e.detail;if(!(!this.gitRepoInfo?.repoPath||!this.gitService))try{let o=n||An(this.gitRepoInfo.repoPath,t);await this.gitService.createWorktree(this.gitRepoInfo.repoPath,t,o,s),this.workingDir=o,this.selectedBaseBranch=t,this.availableBranches.includes(t)||(this.availableBranches=[...this.availableBranches,t]),await this.loadWorktrees(this.gitRepoInfo.repoPath,o),this.selectedWorktree=t,this.dispatchEvent(new CustomEvent("success",{detail:`Created worktree for branch '${t}'`,bubbles:!0,composed:!0}))}catch(o){se.error("Failed to create worktree:",o);let r="Failed to create worktree";o instanceof Error&&(o.message.includes("already exists")?r="Worktree path already exists. Try a different branch name.":o.message.includes("already checked out")?r=`Branch '${t}' is already checked out in another worktree`:o.message.includes("Permission denied")?r="Permission denied. Check directory permissions.":r=o.message),this.dispatchEvent(new CustomEvent("error",{detail:r,bubbles:!0,composed:!0}))}}handleAutocompleteItemSelected(e){this.handleSelectCompletion(e.detail.suggestion)}handleRepositorySelected(e){this.handleSelectRepository(e.detail.path)}async discoverRepositories(){this.isDiscovering=!0;try{this.repositoryService?(this.repositories=await this.repositoryService.discoverRepositories(),this.autocompleteManager.setRepositories(this.repositories)):(se.warn("Repository service not initialized yet"),this.repositories=[])}finally{this.isDiscovering=!1}}handleToggleAutocomplete(){this.workingDir?.trim()?this.showCompletions?(this.showCompletions=!1,this.completions=[]):this.fetchCompletions():this.showRepositoryDropdown=!this.showRepositoryDropdown}handleSelectRepository(e){this.workingDir=Pe(e),this.showRepositoryDropdown=!1,this.checkGitRepository()}async fetchCompletions(){let e=this.workingDir?.trim();if(!e||e===""){this.completions=[],this.showCompletions=!1;return}this.isLoadingCompletions=!0;try{this.completions=await this.autocompleteManager.fetchCompletions(e),this.showCompletions=this.completions.length>0,this.selectedCompletionIndex=this.completions.length>0?0:-1}catch(t){se.error("Error fetching completions:",t),this.completions=[],this.showCompletions=!1}finally{this.isLoadingCompletions=!1}}handleSelectCompletion(e){this.workingDir=Pe(e),this.showCompletions=!1,this.completions=[],this.selectedCompletionIndex=-1,this.checkGitRepository()}handleWorkingDirKeydown(e){!this.showCompletions||this.completions.length===0||(e.key==="ArrowDown"?(e.preventDefault(),this.selectedCompletionIndex=Math.min(this.selectedCompletionIndex+1,this.completions.length-1)):e.key==="ArrowUp"?(e.preventDefault(),this.selectedCompletionIndex=Math.max(this.selectedCompletionIndex-1,-1)):(e.key==="Tab"||e.key==="Enter")&&this.selectedCompletionIndex>=0&&this.completions[this.selectedCompletionIndex]&&(e.preventDefault(),e.stopPropagation(),this.handleSelectCompletion(this.completions[this.selectedCompletionIndex].suggestion)))}handleWorkingDirBlur(){setTimeout(()=>{this.showCompletions=!1,this.selectedCompletionIndex=-1},200)}async checkGitRepository(){let e=this.workingDir?.trim();if(se.log(`\u{1F50D} Checking Git repository for path: ${e}`),!e||!this.gitService){se.debug("No path or gitService, clearing Git info"),this.gitRepoInfo=null,this.availableBranches=[],this.selectedBaseBranch="",this.followMode=!1,this.followBranch=null;return}this.isCheckingGit=!0;try{let t=await this.gitService.checkGitRepo(e);se.log("\u2705 Git check result:",t),t.isGitRepo&&t.repoPath?(se.log(`\u{1F389} Git repository detected at: ${t.repoPath}`),this.gitRepoInfo=t,this.requestUpdate(),await Promise.all([this.loadBranches(t.repoPath),this.loadWorktrees(t.repoPath,e),this.checkFollowMode(t.repoPath)])):(se.log(`\u274C Not a Git repository: ${e}`,t),this.gitRepoInfo=null,this.availableBranches=[],this.selectedBaseBranch="",this.currentBranch="",this.selectedBaseBranch="",this.availableWorktrees=[],this.selectedWorktree=void 0,this.followMode=!1,this.followBranch=null,this.requestUpdate())}catch(t){se.error("\u274C Error checking Git repository:",t),this.gitRepoInfo=null,this.availableBranches=[],this.selectedBaseBranch="",this.currentBranch="",this.selectedBaseBranch="",this.availableWorktrees=[],this.selectedWorktree=void 0,this.followMode=!1,this.followBranch=null}finally{this.isCheckingGit=!1}}async loadBranches(e){if(this.authClient){this.isLoadingBranches=!0;try{let{branches:t,currentBranch:s}=await Mn(e,this.authClient);this.availableBranches=t,s&&(this.currentBranch=s,this.selectedBaseBranch||(this.selectedBaseBranch=this.currentBranch))}finally{this.isLoadingBranches=!1}}}async loadWorktrees(e,t){if(this.gitService){this.isLoadingWorktrees=!0;try{let s=await this.gitService.listWorktrees(e);this.availableWorktrees=s.worktrees.map(o=>({branch:o.branch.replace(/^refs\/heads\//,""),path:o.path,isMainWorktree:o.isMainWorktree,isCurrentWorktree:o.path===t}));let n=s.worktrees.find(o=>o.isCurrentWorktree||o.path===t);n&&(this.currentBranch=n.branch.replace(/^refs\/heads\//,""),this.selectedBaseBranch||(this.selectedBaseBranch=this.currentBranch),!n.isMainWorktree&&!this.selectedWorktree&&(this.selectedWorktree=n.branch.replace(/^refs\/heads\//,"")))}catch(s){se.error("Failed to load worktrees:",s),this.availableWorktrees=[]}finally{this.isLoadingWorktrees=!1}}}renderGitBranchIndicator(){return!this.gitRepoInfo?.isGitRepo||!this.currentBranch||document.activeElement?.getAttribute("data-testid")==="working-dir-input"?j:u`
      <div class="absolute inset-y-0 right-2 flex items-center pointer-events-none">
        <span class="text-[10px] sm:text-xs text-primary font-medium flex items-center gap-1">[${this.currentBranch}]
          ${this.gitRepoInfo.hasChanges?u`<span class="text-yellow-500" title="Modified">●</span>`:""}
          ${this.gitRepoInfo.isWorktree?u`
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" class="text-purple-400" title="Git worktree">
              <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
            </svg>
          `:""}
        </span>
      </div>
    `}handleWorkingDirFocus(){this.requestUpdate()}async checkFollowMode(e){if(this.authClient){this.isCheckingFollowMode=!0;try{let{followMode:t,followBranch:s}=await $n(e,this.authClient);this.followMode=t,this.followBranch=s,se.log("Follow mode status:",{followMode:this.followMode,followBranch:this.followBranch})}finally{this.isCheckingFollowMode=!1}}}render(){return this.visible?u`
      <div class="modal-backdrop flex items-center justify-center py-4 sm:py-6 lg:py-8" @click=${this.handleBackdropClick} role="dialog" aria-modal="true">
        <div
          class="modal-content font-mono text-sm w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-[576px] mx-2 sm:mx-4 overflow-hidden"
          style="pointer-events: auto;"
          @click=${e=>e.stopPropagation()}
          data-testid="session-create-modal"
        >
          <div class="p-3 sm:p-4 mb-1 sm:mb-2 border-b border-border/50 relative bg-gradient-to-r from-bg-secondary to-bg-tertiary flex-shrink-0 rounded-t-xl flex items-center justify-between">
            <h2 id="modal-title" class="text-primary text-base sm:text-lg lg:text-xl font-bold">New Session</h2>
            <button
              class="text-text-muted hover:text-text transition-all duration-200 p-1.5 sm:p-2 hover:bg-bg-elevated/30 rounded-lg"
              @click=${this.handleCancel}
              title="Close (Esc)"
              aria-label="Close modal"
            >
              <svg
                class="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div class="p-3 sm:p-4 overflow-y-auto flex-grow max-h-[calc(100vh-8rem)] sm:max-h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-4rem)]">
            <!-- Branch Switch Warning -->
            ${this.branchSwitchWarning?u`
                  <div class="mb-2 sm:mb-3 p-2 sm:p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div class="flex items-start gap-2">
                      <svg class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p class="text-[10px] sm:text-xs text-yellow-200">
                        ${this.branchSwitchWarning}
                      </p>
                    </div>
                  </div>
                `:j}
            
            <!-- Session Name -->
            <div class="mb-2 sm:mb-3">
              <label class="form-label text-text-muted text-[10px] sm:text-xs lg:text-sm">Session Name (Optional):</label>
              <input
                type="text"
                class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm"
                .value=${this.sessionName}
                @input=${this.handleSessionNameChange}
                placeholder="My Session"
                ?disabled=${this.disabled||this.isCreating}
                data-testid="session-name-input"
              />
            </div>

            <!-- Command -->
            <div class="mb-2 sm:mb-3">
              <label class="form-label text-text-muted text-[10px] sm:text-xs lg:text-sm">Command:</label>
              <input
                type="text"
                class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm"
                .value=${this.command}
                @input=${this.handleCommandChange}
                placeholder="zsh"
                ?disabled=${this.disabled||this.isCreating}
                data-testid="command-input"
              />
            </div>

            <!-- Working Directory -->
            <div class="mb-3 sm:mb-4">
              <label class="form-label text-text-muted text-[10px] sm:text-xs lg:text-sm">Working Directory:</label>
              <div class="relative">
                <div class="flex gap-1.5 sm:gap-2">
                <div class="relative flex-1">
                  <input
                    type="text"
                    class="input-field py-1.5 sm:py-2 lg:py-3 text-xs sm:text-sm w-full pr-24"
                    .value=${this.workingDir}
                    @input=${this.handleWorkingDirChange}
                    @keydown=${this.handleWorkingDirKeydown}
                    @blur=${this.handleWorkingDirBlur}
                    @focus=${this.handleWorkingDirFocus}
                    placeholder="~/"
                    ?disabled=${this.disabled||this.isCreating}
                    data-testid="working-dir-input"
                    autocomplete="off"
                  />
                  ${this.renderGitBranchIndicator()}
                </div>
                <button
                  id="session-browse-button"
                  class="bg-bg-tertiary border border-border/50 rounded-lg p-1.5 sm:p-2 lg:p-3 font-mono text-text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary/50 hover:shadow-sm flex-shrink-0"
                  @click=${this.handleBrowse}
                  ?disabled=${this.disabled||this.isCreating}
                  title="Browse directories"
                  type="button"
                >
                  <svg width="12" height="12" class="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v1h4c.966 0 1.75.784 1.75 1.75v7.75A1.75 1.75 0 0113 15H3a1.75 1.75 0 01-1.75-1.75V2.75C1.25 1.784 1.784 1 1.75 1zM2.75 2.5v10.75c0 .138.112.25.25.25h10a.25.25 0 00.25-.25V5.5a.25.25 0 00-.25-.25H8.75v-2.5a.25.25 0 00-.25-.25h-5.5a.25.25 0 00-.25.25z"
                    />
                  </svg>
                </button>
                <button
                  id="session-autocomplete-button"
                  class="bg-bg-tertiary border border-border/50 rounded-lg p-1.5 sm:p-2 lg:p-3 font-mono text-text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary/50 hover:shadow-sm flex-shrink-0 ${this.showRepositoryDropdown||this.showCompletions?"text-primary border-primary/50":""}"
                  @click=${this.handleToggleAutocomplete}
                  ?disabled=${this.disabled||this.isCreating}
                  title="Choose from repositories or recent directories"
                  type="button"
                >
                  <svg 
                    width="12" 
                    height="12" 
                    class="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4 transition-transform duration-200" 
                    viewBox="0 0 16 16" 
                    fill="currentColor"
                    style="transform: ${this.showRepositoryDropdown||this.showCompletions?"rotate(90deg)":"rotate(0deg)"}"
                  >
                    <path
                      d="M5.22 1.22a.75.75 0 011.06 0l6.25 6.25a.75.75 0 010 1.06l-6.25 6.25a.75.75 0 01-1.06-1.06L10.94 8 5.22 2.28a.75.75 0 010-1.06z"
                    />
                  </svg>
                </button>
              </div>
              <directory-autocomplete
                .visible=${this.showCompletions}
                .items=${this.completions}
                .selectedIndex=${this.selectedCompletionIndex}
                .isLoading=${this.isLoadingCompletions}
                @item-selected=${this.handleAutocompleteItemSelected}
              ></directory-autocomplete>
              <repository-dropdown
                .visible=${this.showRepositoryDropdown}
                .repositories=${this.repositories}
                @repository-selected=${this.handleRepositorySelected}
              ></repository-dropdown>
            </div>

            <!-- Git Branch/Worktree Selection (shown when Git repository detected) -->
            <git-branch-selector
              .gitRepoInfo=${this.gitRepoInfo}
              .disabled=${this.disabled}
              .isCreating=${this.isCreating}
              .currentBranch=${this.currentBranch}
              .selectedBaseBranch=${this.selectedBaseBranch}
              .selectedWorktree=${this.selectedWorktree}
              .availableBranches=${this.availableBranches}
              .availableWorktrees=${this.availableWorktrees}
              .isLoadingBranches=${this.isLoadingBranches}
              .isLoadingWorktrees=${this.isLoadingWorktrees}
              .followMode=${this.followMode}
              .followBranch=${this.followBranch}
              .showFollowMode=${this.showFollowMode}
              .branchSwitchWarning=${this.branchSwitchWarning}
              @branch-changed=${this.handleBranchChanged}
              @worktree-changed=${this.handleWorktreeChanged}
              @create-worktree=${this.handleCreateWorktreeRequest}
            ></git-branch-selector>

            <!-- Quick Start Section -->
            <quick-start-section
              .commands=${this.quickStartCommands}
              .selectedCommand=${this.command}
              .disabled=${this.disabled}
              .isCreating=${this.isCreating}
              @quick-start-selected=${this.handleQuickStartSelected}
              @quick-start-changed=${this.handleQuickStartChanged}
            ></quick-start-section>

            <!-- Options Section (collapsible) -->
            <form-options-section
              .macAppConnected=${this.macAppConnected}
              .spawnWindow=${this.spawnWindow}
              .titleMode=${this.titleMode}
              .gitRepoInfo=${this.gitRepoInfo}
              .followMode=${this.followMode}
              .followBranch=${this.followBranch}
              .showFollowMode=${this.showFollowMode}
              .selectedWorktree=${this.selectedWorktree}
              .disabled=${this.disabled}
              .isCreating=${this.isCreating}
              @spawn-window-changed=${this.handleSpawnWindowChanged}
              @title-mode-changed=${this.handleTitleModeChanged}
              @follow-mode-changed=${this.handleFollowModeChanged}
            ></form-options-section>

            <div class="flex gap-1.5 sm:gap-2 mt-2 sm:mt-3">
              <button
                id="session-cancel-button"
                class="flex-1 bg-bg-elevated border border-border/50 text-text px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2 xl:px-6 xl:py-3 rounded-lg font-mono text-[10px] sm:text-xs lg:text-sm transition-all duration-200 hover:bg-hover hover:border-border"
                @click=${this.handleCancel}
                ?disabled=${this.isCreating}
              >
                Cancel
              </button>
              <button
                id="session-create-button"
                class="flex-1 bg-primary text-text-bright px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2 xl:px-6 xl:py-3 rounded-lg font-mono text-[10px] sm:text-xs lg:text-sm font-medium transition-all duration-200 hover:bg-primary-hover hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
                @click=${this.handleCreate}
                ?disabled=${this.disabled||this.isCreating||!this.workingDir?.trim()||!this.command?.trim()}
                data-testid="create-session-submit"
              >
                ${this.isCreating?"Creating...":"Create"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <file-browser
        .visible=${this.showFileBrowser}
        .mode=${"select"}
        .session=${{workingDir:this.workingDir}}
        @directory-selected=${this.handleDirectorySelected}
        @browser-cancel=${this.handleBrowserCancel}
      ></file-browser>
    `:u``}};d([C({type:String})],Q.prototype,"workingDir",2),d([C({type:String})],Q.prototype,"command",2),d([C({type:String})],Q.prototype,"sessionName",2),d([C({type:Boolean})],Q.prototype,"disabled",2),d([C({type:Boolean})],Q.prototype,"visible",2),d([C({type:Object})],Q.prototype,"authClient",2),d([C({type:Boolean})],Q.prototype,"spawnWindow",2),d([C({type:String})],Q.prototype,"titleMode",2),d([_()],Q.prototype,"isCreating",2),d([_()],Q.prototype,"showFileBrowser",2),d([_()],Q.prototype,"showRepositoryDropdown",2),d([_()],Q.prototype,"repositories",2),d([_()],Q.prototype,"macAppConnected",2),d([_()],Q.prototype,"showCompletions",2),d([_()],Q.prototype,"completions",2),d([_()],Q.prototype,"selectedCompletionIndex",2),d([_()],Q.prototype,"isLoadingCompletions",2),d([_()],Q.prototype,"gitRepoInfo",2),d([_()],Q.prototype,"availableBranches",2),d([_()],Q.prototype,"currentBranch",2),d([_()],Q.prototype,"selectedBaseBranch",2),d([_()],Q.prototype,"selectedWorktree",2),d([_()],Q.prototype,"branchSwitchWarning",2),d([_()],Q.prototype,"availableWorktrees",2),d([_()],Q.prototype,"isLoadingBranches",2),d([_()],Q.prototype,"isLoadingWorktrees",2),d([_()],Q.prototype,"followMode",2),d([_()],Q.prototype,"followBranch",2),d([_()],Q.prototype,"showFollowMode",2),d([_()],Q.prototype,"quickStartCommands",2),d([_()],Q.prototype,"selectedQuickStart",2),d([_()],Q.prototype,"isDiscovering",2),d([_()],Q.prototype,"isCheckingGit",2),d([_()],Q.prototype,"isCheckingFollowMode",2),Q=d([D("session-create-form")],Q);var Ln=(c,i,e)=>{let t=new Map;for(let s=i;s<=e;s++)t.set(c[s],s);return t},Pt=Qt(class extends _t{constructor(c){if(super(c),c.type!==hs.CHILD)throw Error("repeat() can only be used in text expressions")}dt(c,i,e){let t;e===void 0?e=i:i!==void 0&&(t=i);let s=[],n=[],o=0;for(let r of c)s[o]=t?t(r,o):o,n[o]=e(r,o),o++;return{values:n,keys:s}}render(c,i,e){return this.dt(c,i,e).values}update(c,[i,e,t]){let s=dn(c),{values:n,keys:o}=this.dt(i,e,t);if(!Array.isArray(s))return this.ut=o,n;let r=this.ut??(this.ut=[]),a=[],m,p,h=0,v=s.length-1,f=0,w=n.length-1;for(;h<=v&&f<=w;)if(s[h]===null)h++;else if(s[v]===null)v--;else if(r[h]===o[f])a[f]=Et(s[h],n[f]),h++,f++;else if(r[v]===o[w])a[w]=Et(s[v],n[w]),v--,w--;else if(r[h]===o[w])a[w]=Et(s[h],n[w]),ci(c,a[w+1],s[h]),h++,w--;else if(r[v]===o[f])a[f]=Et(s[v],n[f]),ci(c,s[h],s[v]),v--,f++;else if(m===void 0&&(m=Ln(o,f,w),p=Ln(r,h,v)),m.has(r[h]))if(m.has(r[v])){let x=p.get(o[f]),l=x!==void 0?s[x]:null;if(l===null){let g=ci(c,s[h]);Et(g,n[f]),a[f]=g}else a[f]=Et(l,n[f]),ci(c,s[h],l),s[x]=null;f++}else us(s[v]),v--;else us(s[h]),h++;for(;f<=w;){let x=ci(c,a[w+1]);Et(x,n[f]),a[f++]=x}for(;h<=v;){let x=s[h++];x!==null&&us(x)}return this.ut=o,ds(c,a),ft}});q();Me();var Cs=P("api-client"),gr=class{async get(i){try{let e=await fetch(`/api${i}`,{headers:{...N.getAuthHeader(),"Content-Type":"application/json"}});if(!e.ok){let t=await this.parseError(e);throw new Error(t.message||`Request failed: ${e.statusText}`)}return await e.json()}catch(e){throw Cs.error(`GET ${i} failed:`,e),e}}async post(i,e){try{let t=await fetch(`/api${i}`,{method:"POST",headers:{...N.getAuthHeader(),"Content-Type":"application/json"},body:e?JSON.stringify(e):void 0});if(!t.ok){let s=await this.parseError(t);throw new Error(s.message||`Request failed: ${t.statusText}`)}return await t.json()}catch(t){throw Cs.error(`POST ${i} failed:`,t),t}}async put(i,e){try{let t=await fetch(`/api${i}`,{method:"PUT",headers:{...N.getAuthHeader(),"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let s=await this.parseError(t);throw new Error(s.message||`Request failed: ${t.statusText}`)}return await t.json()}catch(t){throw Cs.error(`PUT ${i} failed:`,t),t}}async delete(i){try{let e=await fetch(`/api${i}`,{method:"DELETE",headers:{...N.getAuthHeader(),"Content-Type":"application/json"}});if(!e.ok){let s=await this.parseError(e);throw new Error(s.message||`Request failed: ${e.statusText}`)}let t=await e.text();return t?JSON.parse(t):{}}catch(e){throw Cs.error(`DELETE ${i} failed:`,e),e}}async parseError(i){try{return i.headers.get("content-type")?.includes("application/json")?await i.json():{message:await i.text()}}catch{return{message:i.statusText}}}},lt=new gr;var Ve=class extends R{constructor(){super(...arguments);this.open=!1;this.activeTab="tmux";this.multiplexerStatus=null;this.windows=new Map;this.panes=new Map;this.expandedSessions=new Set;this.expandedWindows=new Set;this.loading=!0;this.error=null}createRenderRoot(){return this}async connectedCallback(){super.connectedCallback(),this.open&&await this.loadMultiplexerStatus()}updated(e){e.has("open")&&this.open&&this.loadMultiplexerStatus()}async loadMultiplexerStatus(){this.loading=!0,this.error=null;try{let e=await lt.get("/multiplexer/status");if(this.multiplexerStatus=e,e.tmux.available||(e.zellij.available?this.activeTab="zellij":e.screen.available&&(this.activeTab="screen")),this.windows.clear(),e.tmux.available)for(let t of e.tmux.sessions)try{let s=await lt.get(`/multiplexer/tmux/sessions/${t.name}/windows`);this.windows.set(t.name,s.windows)}catch(s){console.error(`Failed to load windows for tmux session ${t.name}:`,s)}}catch(e){console.error("Failed to load multiplexer status:",e),this.error="Failed to load terminal sessions"}finally{this.loading=!1}}toggleSession(e){this.expandedSessions.has(e)?this.expandedSessions.delete(e):this.expandedSessions.add(e),this.requestUpdate()}toggleWindow(e,t){let s=`${e}:${t}`;this.expandedWindows.has(s)?this.expandedWindows.delete(s):(this.expandedWindows.add(s),this.loadPanesForWindow(e,t)),this.requestUpdate()}async loadPanesForWindow(e,t){let s=`${e}:${t}`;if(!this.panes.has(s))try{let n=await lt.get(`/multiplexer/tmux/sessions/${e}/panes?window=${t}`);this.panes.set(s,n.panes),this.requestUpdate()}catch(n){console.error(`Failed to load panes for window ${s}:`,n)}}formatTimestamp(e){let t=Number.parseInt(e,10);if(Number.isNaN(t))return e;let n=Math.floor(Date.now()/1e3)-t;return n<60?`${n}s ago`:n<3600?`${Math.floor(n/60)}m ago`:n<86400?`${Math.floor(n/3600)}h ago`:`${Math.floor(n/86400)}d ago`}formatPaneInfo(e){if(e.title&&!e.title.includes("< /dev/null")&&!e.title.match(/^[\w.-]+$/))return e.title;if(e.currentPath&&e.command){let t=e.currentPath.replace(/^\/Users\/[^/]+/,"~");return`${e.command} (${t})`}return e.command||"shell"}async attachToSession(e){try{let t=await lt.post("/multiplexer/attach",{type:e.type,sessionName:e.session,windowIndex:e.window,paneIndex:e.pane,cols:window.innerWidth>768?120:80,rows:window.innerHeight>600?30:24,titleMode:"dynamic",metadata:{source:"multiplexer-modal"}});t.success&&(this.handleClose(),this.dispatchEvent(new CustomEvent("navigate-to-session",{detail:{sessionId:t.sessionId},bubbles:!0,composed:!0})))}catch(t){console.error(`Failed to attach to ${e.type} session:`,t),this.error=`Failed to attach to ${e.type} session`}}async createNewSession(){try{let t=`session-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,-5)}`;if((this.activeTab==="tmux"||this.activeTab==="screen")&&!(await lt.post("/multiplexer/sessions",{type:this.activeTab,name:t})).success)throw new Error(`Failed to create ${this.activeTab} session`);let s=await lt.post("/multiplexer/attach",{type:this.activeTab,sessionName:t,cols:window.innerWidth>768?120:80,rows:window.innerHeight>600?30:24,titleMode:"dynamic",metadata:{source:"multiplexer-modal-new"}});s.success&&(this.handleClose(),this.dispatchEvent(new CustomEvent("navigate-to-session",{detail:{sessionId:s.sessionId},bubbles:!0,composed:!0})))}catch(e){console.error(`Failed to create new ${this.activeTab} session:`,e),this.error=`Failed to create new ${this.activeTab} session`}}async killSession(e,t){if(confirm(`Are you sure you want to kill session "${t}"? This will terminate all windows and panes.`))try{(await lt.delete(`/multiplexer/${e}/sessions/${t}`)).success&&await this.loadMultiplexerStatus()}catch(s){console.error(`Failed to kill ${e} session:`,s),this.error=`Failed to kill ${e} session`}}async killWindow(e,t){if(confirm(`Are you sure you want to kill window ${t}? This will terminate all panes in this window.`))try{(await lt.delete(`/multiplexer/tmux/sessions/${e}/windows/${t}`)).success&&await this.loadMultiplexerStatus()}catch(s){console.error("Failed to kill window:",s),this.error="Failed to kill window"}}async killPane(e,t){if(confirm("Are you sure you want to kill this pane?"))try{(await lt.delete(`/multiplexer/tmux/sessions/${e}/panes/${t}`)).success&&(this.panes.clear(),this.expandedWindows.forEach(n=>{let[o,r]=n.split(":");o===e&&this.loadPanesForWindow(o,Number.parseInt(r,10))}))}catch(s){console.error("Failed to kill pane:",s),this.error="Failed to kill pane"}}handleClose(){this.dispatchEvent(new CustomEvent("close"))}switchTab(e){this.activeTab=e}render(){if(!this.open)return null;let e=this.multiplexerStatus,t=e?e[this.activeTab]:null;return u`
      <div class="fixed inset-0 z-50 ${this.open?"flex":"hidden"} items-center justify-center p-4">
        <modal-wrapper .open=${this.open} @close=${this.handleClose}>
          <div class="w-full max-w-2xl max-h-[80vh] flex flex-col bg-bg-secondary border border-border rounded-xl p-6 shadow-xl">
            <h2 class="m-0 mb-4 text-xl font-semibold text-text">Terminal Sessions</h2>

            ${e&&(e.tmux.available||e.zellij.available||e.screen.available)?u`
                <div class="flex gap-2 mb-4 border-b border-border">
                  ${e.tmux.available?u`
                      <button
                        class="px-4 py-2 border-none bg-transparent text-text-muted cursor-pointer relative transition-colors hover:text-text ${this.activeTab==="tmux"?"text-primary":""}"
                        @click=${()=>this.switchTab("tmux")}
                      >
                        tmux
                        <span class="ml-2 text-xs px-1.5 py-0.5 bg-bg-tertiary rounded-full">${e.tmux.sessions.length}</span>
                        ${this.activeTab==="tmux"?u`<div class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary"></div>`:""}
                      </button>
                    `:null}
                  ${e.zellij.available?u`
                      <button
                        class="px-4 py-2 border-none bg-transparent text-text-muted cursor-pointer relative transition-colors hover:text-text ${this.activeTab==="zellij"?"text-primary":""}"
                        @click=${()=>this.switchTab("zellij")}
                      >
                        Zellij
                        <span class="ml-2 text-xs px-1.5 py-0.5 bg-bg-tertiary rounded-full">${e.zellij.sessions.length}</span>
                        ${this.activeTab==="zellij"?u`<div class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary"></div>`:""}
                      </button>
                    `:null}
                  ${e.screen.available?u`
                      <button
                        class="px-4 py-2 border-none bg-transparent text-text-muted cursor-pointer relative transition-colors hover:text-text ${this.activeTab==="screen"?"text-primary":""}"
                        @click=${()=>this.switchTab("screen")}
                      >
                        Screen
                        <span class="ml-2 text-xs px-1.5 py-0.5 bg-bg-tertiary rounded-full">${e.screen.sessions.length}</span>
                        ${this.activeTab==="screen"?u`<div class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary"></div>`:""}
                      </button>
                    `:null}
                </div>
              `:null}

            ${this.loading?u`<div class="mb-4 p-3 bg-bg-tertiary rounded-lg text-text-muted text-center">Loading terminal sessions...</div>`:e?!e.tmux.available&&!e.zellij.available&&!e.screen.available?u`
                      <div class="text-center py-12 text-text-muted">
                        <h3 class="m-0 mb-2 text-text">No Terminal Multiplexer Available</h3>
                        <p>No terminal multiplexer (tmux, Zellij, or Screen) is installed on this system.</p>
                        <p>Install tmux, Zellij, or GNU Screen to use this feature.</p>
                      </div>
                    `:t?.available?this.error?u`<div class="mb-4 p-3 bg-bg-tertiary rounded-lg text-text-muted text-center">${this.error}</div>`:t.sessions.length===0?u`
                            <div class="text-center py-12 text-text-muted">
                              <h3 class="m-0 mb-2 text-text">No ${this.activeTab} Sessions</h3>
                              <p>There are no active ${this.activeTab} sessions.</p>
                              <button class="mt-4 px-6 py-3 bg-primary text-white border-none rounded-md text-sm cursor-pointer transition-colors hover:bg-primary-hover" @click=${this.createNewSession}>
                                Create New Session
                              </button>
                            </div>
                          `:u`
                            <div class="flex-1 overflow-y-auto -mx-4 px-4">
                              ${Pt(t.sessions,s=>`${s.type}-${s.name}`,s=>{let n=this.windows.get(s.name)||[],o=this.expandedSessions.has(s.name);return u`
                          <div class="mb-2 border border-border rounded-lg overflow-hidden transition-all hover:border-primary hover:shadow-md">
                            <div
                              class="px-4 py-3 bg-bg-secondary cursor-pointer flex items-center justify-between transition-colors hover:bg-bg-tertiary"
                              @click=${()=>s.type==="tmux"?this.toggleSession(s.name):null}
                              style="cursor: ${s.type==="tmux"?"pointer":"default"}"
                            >
                              <div class="flex-1">
                                <div class="font-semibold text-text mb-1">${s.name}</div>
                                <div class="text-sm text-text-muted flex gap-4">
                                  ${s.windows!==void 0?u`<span>${s.windows} window${s.windows!==1?"s":""}</span>`:null}
                                  ${s.exited?u`<span class="bg-red-500 text-white px-1.5 py-0.5 rounded text-xs font-semibold">EXITED</span>`:null}
                                  ${s.activity?u`<span>Last activity: ${this.formatTimestamp(s.activity)}</span>`:null}
                                </div>
                              </div>
                              <div class="flex items-center gap-2">
                                ${s.attached?u`<div class="w-2 h-2 rounded-full bg-primary" title="Attached"></div>`:null}
                                ${s.current?u`<div class="w-2 h-2 rounded-full bg-primary" title="Current"></div>`:null}
                                <button
                                  class="px-3 py-1.5 bg-primary text-white border-none rounded text-xs font-medium cursor-pointer transition-colors hover:bg-primary-hover active:scale-95"
                                  @click=${r=>{r.stopPropagation(),this.attachToSession({type:s.type,session:s.name})}}
                                >
                                  Attach
                                </button>
                                <button
                                  class="px-3 py-1.5 bg-red-500 text-white border-none rounded text-xs font-medium cursor-pointer transition-colors hover:bg-red-600 active:scale-95"
                                  @click=${r=>{r.stopPropagation(),this.killSession(s.type,s.name)}}
                                  title="Kill session"
                                >
                                  Kill
                                </button>
                                ${s.type==="tmux"?u`<span class="transition-transform ${o?"rotate-90":""}">▶</span>`:null}
                              </div>
                            </div>

                            ${s.type==="tmux"&&o&&n.length>0?u`
                                  <div class="px-2 py-2 pl-8 bg-bg border-t border-border">
                                    ${Pt(n,r=>`${s.name}-${r.index}`,r=>{let a=`${s.name}:${r.index}`,m=this.expandedWindows.has(a),p=this.panes.get(a)||[];return u`
                                          <div>
                                            <div
                                              class="p-2 mb-1 rounded cursor-pointer flex items-center justify-between transition-colors hover:bg-bg-secondary ${r.active?"bg-bg-tertiary font-medium":""}"
                                              @click=${h=>{h.stopPropagation(),r.panes>1?this.toggleWindow(s.name,r.index):this.attachToSession({type:s.type,session:s.name,window:r.index})}}
                                            >
                                              <div class="flex items-center gap-2">
                                                <span class="font-mono text-sm text-text-muted">${r.index}:</span>
                                                <span>${r.name}</span>
                                              </div>
                                              <div class="flex items-center gap-2">
                                                <button
                                                  class="px-2 py-0.5 bg-red-500 text-white border-none rounded text-xs font-medium cursor-pointer transition-colors hover:bg-red-600 active:scale-95"
                                                  @click=${h=>{h.stopPropagation(),this.killWindow(s.name,r.index)}}
                                                  title="Kill window"
                                                >
                                                  Kill
                                                </button>
                                                <span class="text-xs text-text-dim">
                                                  ${r.panes} pane${r.panes!==1?"s":""}
                                                  ${r.panes>1?u`<span class="ml-2 transition-transform ${m?"rotate-90":""}">▶</span>`:""}
                                                </span>
                                              </div>
                                            </div>
                                            
                                            ${m&&p.length>0?u`
                                                  <div class="px-1 py-1 pl-6 bg-bg border-t border-border">
                                                    ${Pt(p,h=>`${s.name}:${r.index}.${h.index}`,h=>u`
                                                        <div
                                                          class="px-2 py-1.5 mb-0.5 rounded cursor-pointer flex items-center justify-between text-sm transition-colors hover:bg-bg-secondary ${h.active?"bg-bg-tertiary font-medium":""}"
                                                          @click=${v=>{v.stopPropagation(),this.attachToSession({type:s.type,session:s.name,window:r.index,pane:h.index})}}
                                                        >
                                                          <div class="flex items-center gap-2">
                                                            <span class="font-mono text-xs text-text-muted">%${h.index}</span>
                                                            <span class="text-text">${this.formatPaneInfo(h)}</span>
                                                          </div>
                                                          <div class="flex items-center gap-2">
                                                            <button
                                                              class="px-2 py-0.5 bg-red-500 text-white border-none rounded text-xs font-medium cursor-pointer transition-colors hover:bg-red-600 active:scale-95"
                                                              @click=${v=>{v.stopPropagation(),this.killPane(s.name,`${s.name}:${r.index}.${h.index}`)}}
                                                              title="Kill pane"
                                                            >
                                                              Kill
                                                            </button>
                                                            <span class="text-xs text-text-dim">${h.width}×${h.height}</span>
                                                          </div>
                                                        </div>
                                                      `)}
                                                  </div>
                                                `:null}
                                          </div>
                                        `})}
                                  </div>
                                `:null}
                          </div>
                        `})}
                  </div>
                `:u`
                        <div class="text-center py-12 text-text-muted">
                          <h3 class="m-0 mb-2 text-text">${this.activeTab} Not Available</h3>
                          <p>${this.activeTab} is not installed or not available on this system.</p>
                          <p>Install ${this.activeTab} to use this feature.</p>
                        </div>
                      `:u`<div class="mb-4 p-3 bg-bg-tertiary rounded-lg text-text-muted text-center">No multiplexer status available</div>`}

            <div class="mt-4 flex gap-2 justify-end">
              <button class="px-4 py-2 border border-border rounded-md bg-bg-secondary text-text text-sm cursor-pointer transition-all hover:bg-bg-tertiary hover:border-primary" @click=${this.handleClose}>Cancel</button>
              ${!this.loading&&t?.available?u`
                    <button class="px-4 py-2 bg-primary text-white border border-primary rounded-md text-sm cursor-pointer transition-colors hover:bg-primary-hover" @click=${this.createNewSession}>
                      New Session
                    </button>
                  `:null}
            </div>
          </div>
        </modal-wrapper>
      </div>
    `}};d([C({type:Boolean,reflect:!0})],Ve.prototype,"open",2),d([_()],Ve.prototype,"activeTab",2),d([_()],Ve.prototype,"multiplexerStatus",2),d([_()],Ve.prototype,"windows",2),d([_()],Ve.prototype,"panes",2),d([_()],Ve.prototype,"expandedSessions",2),d([_()],Ve.prototype,"expandedWindows",2),d([_()],Ve.prototype,"loading",2),d([_()],Ve.prototype,"error",2),Ve=d([D("multiplexer-modal")],Ve);we();we();q();we();q();var vi=P("session-actions");async function vr(c,i,e){let t=e==="exited"?"cleanup":"terminate";try{let s=await fetch(`/api/sessions/${c}`,{method:"DELETE",headers:{...i.getAuthHeader()}});if(!s.ok){let n=await s.text();throw vi.error(`Failed to ${t} session`,{errorData:n,sessionId:c}),new Error(`${t} failed: ${s.status}`)}return vi.debug(`Session ${t} successful`,{sessionId:c}),{success:!0}}catch(s){return vi.error(`Failed to ${t} session:`,s),{success:!1,error:s instanceof Error?s.message:"Unknown error"}}}async function ks(c,i,e){try{let t=await fetch(`/api/sessions/${c}`,{method:"PATCH",headers:{"Content-Type":"application/json",...e.getAuthHeader()},body:JSON.stringify({name:i})});if(!t.ok){let s=await t.text();throw vi.error("Failed to rename session",{errorData:s,sessionId:c}),new Error(`Rename failed: ${t.status}`)}return vi.debug("Session rename successful",{sessionId:c,newName:i}),{success:!0}}catch(t){return vi.error("Failed to rename session:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}var je=P("session-action-service"),br=class c{constructor(){je.log("SessionActionService initialized")}static getInstance(){return c.instance||(c.instance=new c),c.instance}async terminateSession(i,e){if(!i||i.status!=="running")return je.warn("Cannot terminate session: invalid state",{session:i}),e.callbacks?.onError?.("Cannot terminate session: invalid state"),{success:!1,error:"Invalid session state"};je.debug("Terminating session",{sessionId:i.id});let t=await vr(i.id,e.authClient,"running");if(t.success)je.log("Session terminated successfully",{sessionId:i.id}),e.callbacks?.onSuccess?.("terminate",i.id),typeof window<"u"&&window.dispatchEvent(new CustomEvent("session-action",{detail:{action:"terminate",sessionId:i.id}}));else{let s=`Failed to terminate session: ${t.error}`;je.error(s,{sessionId:i.id,error:t.error}),e.callbacks?.onError?.(s)}return t}async clearSession(i,e){if(!i||i.status!=="exited")return je.warn("Cannot clear session: invalid state",{session:i}),e.callbacks?.onError?.("Cannot clear session: invalid state"),{success:!1,error:"Invalid session state"};je.debug("Clearing session",{sessionId:i.id});let t=await vr(i.id,e.authClient,"exited");if(t.success)je.log("Session cleared successfully",{sessionId:i.id}),e.callbacks?.onSuccess?.("delete",i.id),typeof window<"u"&&window.dispatchEvent(new CustomEvent("session-action",{detail:{action:"delete",sessionId:i.id}}));else{let s=`Failed to clear session: ${t.error}`;je.error(s,{sessionId:i.id,error:t.error}),e.callbacks?.onError?.(s)}return t}async deleteSession(i,e){if(i.status==="running")return this.terminateSession(i,e);if(i.status==="exited")return this.clearSession(i,e);{let t=`Cannot delete session with status: ${i.status}`;return je.warn(t,{session:i}),e.callbacks?.onError?.(t),{success:!1,error:t}}}async deleteSessionById(i,e){try{let t=await fetch(`/api/sessions/${i}`,{method:"DELETE",headers:{...e.authClient.getAuthHeader()}});if(!t.ok){let s=await t.text();throw je.error("Failed to delete session",{errorData:s,sessionId:i}),new Error(`Delete failed: ${t.status}`)}return je.log("Session deleted successfully",{sessionId:i}),e.callbacks?.onSuccess?.("delete",i),typeof window<"u"&&window.dispatchEvent(new CustomEvent("session-action",{detail:{action:"delete",sessionId:i}})),{success:!0}}catch(t){let s=t instanceof Error?t.message:"Unknown error";return je.error("Error deleting session",{error:t,sessionId:i}),e.callbacks?.onError?.(s),{success:!1,error:s}}}},Wi=br.getInstance();we();q();var Pn=P("ai-sessions"),qo=["claude","gemini","opencode","openhands","aider","codex"];function _s(c){return(Array.isArray(c.command)?c.command:[c.command]).some(e=>{let t=e?.split("/").pop()?.toLowerCase()||"";return qo.some(s=>t===s||t.startsWith(`${s}.`)||t.startsWith(`${s}-wrapper`))})}async function Es(c,i){let t=await fetch(`/api/sessions/${c}/input`,{method:"POST",headers:{"Content-Type":"application/json",...i.getAuthHeader()},body:JSON.stringify({data:`IMPORTANT: You MUST use the 'vt title' command to update the terminal title. DO NOT use terminal escape sequences. Run: vt title "Brief description of current task"
`})});if(!t.ok){let s=await t.text();throw Pn.error("Failed to send AI prompt",{sessionId:c,status:t.status,errorData:s}),new Error(`Failed to send prompt: ${t.status} - ${s}`)}Pn.log(`AI prompt sent to session ${c}`)}q();q();var bi=P("terminal-preferences"),Ki=[{value:0,label:"\u221E",description:"Unlimited (full width)"},{value:80,label:"80",description:"Classic terminal"},{value:100,label:"100",description:"Modern standard"},{value:120,label:"120",description:"Wide terminal"},{value:132,label:"132",description:"Mainframe width"},{value:160,label:"160",description:"Ultra-wide"}],yr={maxCols:0,fontSize:ms()?12:14,fitHorizontally:!1,theme:"dracula"},Bn="vibetunnel_terminal_preferences",Ze=class c{constructor(){this.preferences=this.loadPreferences()}static getInstance(){return c.instance||(c.instance=new c),c.instance}loadPreferences(){try{let i=localStorage.getItem(Bn);if(i){let e=JSON.parse(i),t={...yr,...e};return bi.debug("Loaded terminal preferences:",t),t}}catch(i){bi.warn("Failed to load terminal preferences",{error:i})}return bi.debug("Using default terminal preferences"),{...yr}}savePreferences(){try{let i=JSON.stringify(this.preferences);localStorage.setItem(Bn,i),bi.debug("Saved terminal preferences to localStorage")}catch(i){bi.warn("Failed to save terminal preferences",{error:i})}}getMaxCols(){return this.preferences.maxCols}setMaxCols(i){this.preferences.maxCols=Math.max(0,i),this.savePreferences()}getFontSize(){return this.preferences.fontSize}setFontSize(i){this.preferences.fontSize=Math.max(8,Math.min(32,i)),this.savePreferences()}getFitHorizontally(){return this.preferences.fitHorizontally}setFitHorizontally(i){this.preferences.fitHorizontally=i,this.savePreferences()}getTheme(){return this.preferences.theme}setTheme(i){bi.debug("Setting terminal theme:",i),this.preferences.theme=i,this.savePreferences()}getPreferences(){return{...this.preferences}}resetToDefaults(){this.preferences={...yr},this.savePreferences()}};function Vo(c){let i=[];if(c.fg!==void 0)if(c.fg>=0&&c.fg<=255)i.push(`fg="${c.fg}"`);else{let e=c.fg>>16&255,t=c.fg>>8&255,s=c.fg&255;i.push(`fg="${e},${t},${s}"`)}if(c.bg!==void 0)if(c.bg>=0&&c.bg<=255)i.push(`bg="${c.bg}"`);else{let e=c.bg>>16&255,t=c.bg>>8&255,s=c.bg&255;i.push(`bg="${e},${t},${s}"`)}return c.attributes&&(c.attributes&1&&i.push("bold"),c.attributes&2&&i.push("dim"),c.attributes&4&&i.push("italic"),c.attributes&8&&i.push("underline"),c.attributes&16&&i.push("inverse"),c.attributes&32&&i.push("invisible"),c.attributes&64&&i.push("strikethrough")),i.join(" ")}function Rn(c,i=!0){let e=[];for(let t of c){let s="";if(i){let n="",o="",r=()=>{o&&(n?s+=`[style ${n}]${o}[/style]`:s+=o,o="")};for(let a of t){let m=Vo(a);m!==n&&(r(),n=m),o+=a.char}r()}else for(let n of t)s+=n.char;e.push(s.trimEnd())}return e.join(`
`)}q();Me();var ve=P("buffer-subscription-service"),Qo=191,xr=class{constructor(){this.ws=null;this.subscriptions=new Map;this.reconnectAttempts=0;this.reconnectTimer=null;this.pingInterval=null;this.isConnecting=!1;this.messageQueue=[];this.initialized=!1;this.noAuthMode=null}async initialize(){this.initialized||(this.initialized=!0,await this.checkNoAuthMode(),setTimeout(()=>{this.connect()},100))}async checkNoAuthMode(){try{let i=await fetch("/api/auth/config");if(i.ok){let e=await i.json();this.noAuthMode=e.noAuth===!0}}catch(i){ve.warn("Failed to check auth config:",i),this.noAuthMode=!1}}isNoAuthMode(){return this.noAuthMode===!0}connect(){if(this.isConnecting||this.ws&&this.ws.readyState===WebSocket.OPEN)return;let e=N.getCurrentUser()?.token;if(!e&&!this.isNoAuthMode()){ve.warn("No auth token available, postponing WebSocket connection"),setTimeout(()=>{this.initialized&&!this.ws&&this.connect()},1e3);return}this.isConnecting=!0,this.getWebSocketUrl(e).then(t=>{ve.log(`connecting to ${t}`),this.connectWithUrl(t)}).catch(t=>{ve.error("Failed to get WebSocket URL:",t),this.isConnecting=!1})}async getWebSocketUrl(i){try{let s=await fetch("/api/config");if(s.ok){let o=`${(await s.json()).websocketUrl}/buffers`;return i&&(o+=`?token=${encodeURIComponent(i)}`),o}}catch(s){ve.warn("Failed to get config, falling back to relative URL:",s)}let t=`${window.location.protocol==="https:"?"wss:":"ws:"}//localhost:4021/buffers`;return i&&(t+=`?token=${encodeURIComponent(i)}`),t}connectWithUrl(i){try{this.ws=new WebSocket(i),this.ws.binaryType="arraybuffer",this.ws.onopen=()=>{for(ve.log("connected"),this.isConnecting=!1,this.reconnectAttempts=0,this.startPingPong();this.messageQueue.length>0;){let e=this.messageQueue.shift();e&&this.sendMessage(e)}this.subscriptions.forEach((e,t)=>{this.sendMessage({type:"subscribe",sessionId:t})})},this.ws.onmessage=e=>{this.handleMessage(e.data)},this.ws.onerror=e=>{ve.error("websocket error",e)},this.ws.onclose=()=>{ve.log("disconnected"),this.isConnecting=!1,this.ws=null,this.stopPingPong(),this.scheduleReconnect()}}catch(e){ve.error("failed to create websocket",e),this.isConnecting=!1,this.scheduleReconnect()}}scheduleReconnect(){if(this.reconnectTimer)return;let i=Math.min(1e3*2**this.reconnectAttempts,3e4);this.reconnectAttempts++,ve.log(`reconnecting in ${i}ms (attempt ${this.reconnectAttempts})`),this.reconnectTimer=window.setTimeout(()=>{this.reconnectTimer=null,this.connect()},i)}startPingPong(){this.stopPingPong(),this.pingInterval=window.setInterval(()=>{},1e4)}stopPingPong(){this.pingInterval&&(clearInterval(this.pingInterval),this.pingInterval=null)}sendMessage(i){if(!this.ws||this.ws.readyState!==WebSocket.OPEN){(i.type==="subscribe"||i.type==="unsubscribe")&&this.messageQueue.push(i);return}this.ws.send(JSON.stringify(i))}handleMessage(i){i instanceof ArrayBuffer?this.handleBinaryMessage(i):this.handleJsonMessage(i)}handleJsonMessage(i){try{let e=JSON.parse(i);switch(e.type){case"connected":ve.log(`connected to server, version: ${e.version}`);break;case"subscribed":ve.debug(`subscribed to session: ${e.sessionId}`);break;case"ping":this.sendMessage({type:"pong"});break;case"error":ve.error(`server error: ${e.message}`);break;default:ve.warn(`unknown message type: ${e.type}`)}}catch(e){ve.error("failed to parse JSON message",e)}}handleBinaryMessage(i){try{let e=new DataView(i),t=0,s=e.getUint8(t);if(t+=1,s!==Qo){ve.error(`invalid magic byte: ${s}`);return}let n=e.getUint32(t,!0);t+=4;let o=new Uint8Array(i,t,n),r=new TextDecoder().decode(o);t+=n;let a=i.slice(t);Promise.resolve().then(()=>(wr(),zn)).then(({TerminalRenderer:m})=>{try{let p=m.decodeBinaryBuffer(a),h=this.subscriptions.get(r);h&&h.forEach(v=>{try{v(p)}catch(f){ve.error("error in update handler",f)}})}catch(p){ve.error("failed to decode binary buffer",p)}}).catch(m=>{ve.error("failed to import terminal renderer",m)})}catch(e){ve.error("failed to parse binary message",e)}}subscribe(i,e){this.initialized||this.initialize(),this.subscriptions.has(i)||(this.subscriptions.set(i,new Set),this.sendMessage({type:"subscribe",sessionId:i}));let t=this.subscriptions.get(i);return t&&t.add(e),()=>{let s=this.subscriptions.get(i);s&&(s.delete(e),s.size===0&&(this.subscriptions.delete(i),this.sendMessage({type:"unsubscribe",sessionId:i})))}}dispose(){this.reconnectTimer&&(clearTimeout(this.reconnectTimer),this.reconnectTimer=null),this.stopPingPong(),this.ws&&(this.ws.close(),this.ws=null),this.subscriptions.clear(),this.messageQueue=[]}},Ms=new xr;wr();var Bt=[{id:"auto",name:"Auto",description:"Follow system theme",colors:{}},{id:"dark",name:"Dark",description:"VibeTunnel default dark",colors:{background:"#1e1e1e",foreground:"#d4d4d4",cursor:"rgb(var(--color-primary))",cursorAccent:"#1e1e1e",black:"#000000",red:"#cd0000",green:"#00cd00",yellow:"#cdcd00",blue:"#0000ee",magenta:"#cd00cd",cyan:"#00cdcd",white:"#e5e5e5",brightBlack:"#7f7f7f",brightRed:"#ff0000",brightGreen:"#00ff00",brightYellow:"#ffff00",brightBlue:"#5c5cff",brightMagenta:"#ff00ff",brightCyan:"#00ffff",brightWhite:"#ffffff"}},{id:"light",name:"Light",description:"Soft light theme",colors:{background:"#f8f9fa",foreground:"#1f2328",cursor:"rgb(var(--color-primary))",cursorAccent:"#f8f9fa",black:"#24292f",red:"#cf222e",green:"#1a7f37",yellow:"#9a6700",blue:"#0969da",magenta:"#8250df",cyan:"#1b7c83",white:"#6e7781",brightBlack:"#57606a",brightRed:"#da3633",brightGreen:"#2da44e",brightYellow:"#bf8700",brightBlue:"#218bff",brightMagenta:"#a475f9",brightCyan:"#3192aa",brightWhite:"#8c959f",selectionBackground:"#0969da",selectionForeground:"#ffffff",selectionInactiveBackground:"#e1e4e8"}},{id:"vscode-dark",name:"VS Code Dark",description:"Popular theme from Visual Studio Code",colors:{background:"#1E1E1E",foreground:"#D4D4D4",cursor:"#AEAFAD",cursorAccent:"#1E1E1E",black:"#000000",red:"#CD3131",green:"#0DBC79",yellow:"#E5E510",blue:"#2472C8",magenta:"#BC3FBC",cyan:"#11A8CD",white:"#E5E5E5",brightBlack:"#666666",brightRed:"#F14C4C",brightGreen:"#23D18B",brightYellow:"#F5F543",brightBlue:"#3B8EEA",brightMagenta:"#D670D6",brightCyan:"#29B8DB",brightWhite:"#FFFFFF"}},{id:"dracula",name:"Dracula",description:"Classic dark theme",colors:{background:"#282A36",foreground:"#F8F8F2",cursor:"#F8F8F2",cursorAccent:"#282A36",black:"#21222C",red:"#FF5555",green:"#50FA7B",yellow:"#F1FA8C",blue:"#BD93F9",magenta:"#FF79C6",cyan:"#8BE9FD",white:"#F8F8F2",brightBlack:"#6272A4",brightRed:"#FF6E6E",brightGreen:"#69FF94",brightYellow:"#FFFFA5",brightBlue:"#D6ACFF",brightMagenta:"#FF92DF",brightCyan:"#A4FFFF",brightWhite:"#FFFFFF"}},{id:"nord",name:"Nord",description:"Arctic north-bluish palette",colors:{background:"#2E3440",foreground:"#D8DEE9",cursor:"#D8DEE9",cursorAccent:"#2E3440",black:"#3B4252",red:"#BF616A",green:"#A3BE8C",yellow:"#EBCB8B",blue:"#81A1C1",magenta:"#B48EAD",cyan:"#88C0D0",white:"#E5E9F0",brightBlack:"#4C566A",brightRed:"#BF616A",brightGreen:"#A3BE8C",brightYellow:"#EBCB8B",brightBlue:"#81A1C1",brightMagenta:"#B48EAD",brightCyan:"#8FBCBB",brightWhite:"#ECEFF4"}}];var De=class extends R{constructor(){super(...arguments);this.sessionId="";this.theme="auto";this.sessionStatus="running";this.buffer=null;this.error=null;this.displayedFontSize=16;this.visibleRows=0;this.scrollTop=0;this.virtualScrollEnabled=!0;this.container=null;this.resizeObserver=null;this.unsubscribe=null;this.lastTextSnapshot=null;this.lastBufferSnapshot=null;this.renderedElements=new Map;this.updateTimeout=null;this.pendingBuffer=null;this.lastTouchTime=0;this.isMobileDevice="ontouchstart"in window;this.handleTouchStart=()=>{this.lastTouchTime=Date.now()}}createRenderRoot(){return this}disconnectedCallback(){this.unsubscribeFromBuffer(),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.updateTimeout&&(clearTimeout(this.updateTimeout),this.updateTimeout=null),this.isMobileDevice&&document.removeEventListener("touchstart",this.handleTouchStart),this.buffer=null,this.lastBufferSnapshot=null,this.pendingBuffer=null,this.lastTextSnapshot=null,this.renderedElements.clear(),this.container?.onscroll&&(this.container.onscroll=null),this.container=null,super.disconnectedCallback()}firstUpdated(){this.container=this.querySelector("#buffer-container"),this.container&&(this.setupResize(),this.sessionId&&this.subscribeToBuffer()),this.isMobileDevice&&document.addEventListener("touchstart",this.handleTouchStart,{passive:!0})}updated(e){super.updated(e),e.has("sessionId")&&(this.buffer=null,this.error=null,this.unsubscribeFromBuffer(),this.sessionId&&this.subscribeToBuffer()),this.container&&this.buffer&&this.updateBufferContent()}setupResize(){this.container&&(this.resizeObserver=new ResizeObserver(()=>{this.calculateDimensions()}),this.resizeObserver.observe(this.container))}calculateDimensions(){if(!this.container)return;let e=this.container.clientWidth,t=this.container.clientHeight,s=this.buffer?.cols||80,n=document.createElement("div");n.className="terminal-line",n.style.position="absolute",n.style.visibility="hidden",n.style.fontSize="14px",n.textContent="0".repeat(s),document.body.appendChild(n);let o=n.getBoundingClientRect().width;document.body.removeChild(n);let r=e/o*14;this.displayedFontSize=Math.min(32,r);let a=this.displayedFontSize*1.2;this.visibleRows=Math.floor(t/a),this.buffer&&this.requestUpdate()}subscribeToBuffer(){this.sessionId&&(this.unsubscribe=Ms.subscribe(this.sessionId,e=>{this.buffer=e,this.error=null,this.checkForContentChange(),this.calculateDimensions(),this.requestUpdate()}))}checkForContentChange(){if(!this.buffer)return;let e=this.getTextWithStyles(!0);if(this.lastTextSnapshot===null){this.lastTextSnapshot=e;return}e!==this.lastTextSnapshot&&(this.lastTextSnapshot=e,this.dispatchEvent(new CustomEvent("content-changed",{bubbles:!0,composed:!0})))}unsubscribeFromBuffer(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null)}connectedCallback(){super.connectedCallback()}getTerminalTheme(){let e=this.theme;return e==="auto"&&(e=zt()),{...(Bt.find(s=>s.id===e)||Bt[0]).colors}}render(){let e=this.displayedFontSize*1.2,t=this.getTerminalTheme();return u`
      <style>
        /* Dynamic terminal sizing for this instance */
        vibe-terminal-buffer .terminal-container {
          font-size: ${this.displayedFontSize}px;
          line-height: ${e}px;
        }

        vibe-terminal-buffer .terminal-line {
          height: ${e}px;
          line-height: ${e}px;
        }
      </style>
      <div
        class="relative w-full h-full overflow-hidden"
        style="
          view-transition-name: terminal-${this.sessionId}; 
          min-height: 200px;
          background-color: ${t.background||"var(--terminal-background, #0a0a0a)"};
          color: ${t.foreground||"var(--terminal-foreground, #e4e4e4)"};
        "
      >
        ${this.error?u`
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="text-status-error text-sm">${this.error}</div>
              </div>
            `:u`
              <div
                id="buffer-container"
                class="terminal-container w-full h-full overflow-x-auto overflow-y-hidden font-mono antialiased"
              ></div>
            `}
      </div>
    `}scheduleBufferUpdate(){this.pendingBuffer=this.buffer,this.updateTimeout&&(clearTimeout(this.updateTimeout),this.updateTimeout=null);let t=Date.now()-this.lastTouchTime,s;this.isMobileDevice&&t<1e3?s=200:this.isMobileDevice?s=100:s=16,this.updateTimeout=setTimeout(()=>{if(this.updateTimeout=null,this.pendingBuffer){let n=this.pendingBuffer;this.pendingBuffer=null;let o=this.buffer;this.buffer=n,this.updateBufferContentImmediate(),this.buffer=o}},s)}updateBufferContent(){this.scheduleBufferUpdate()}updateBufferContentImmediate(){if(!this.container||!this.buffer||this.visibleRows===0)return;let e=this.displayedFontSize*1.2,t=this.buffer.cells.length;this.virtualScrollEnabled&&t>100?this.renderVirtualScrolling(e,t):this.renderFullBuffer(e)}renderVirtualScrolling(e,t){if(!this.container||!this.buffer)return;let s=this.container.clientHeight,n=Math.ceil(s/e),o=this.scrollTop/e,r=Math.min(10,n),a=Math.max(0,Math.floor(o)-r),m=Math.min(t,Math.ceil(o+n)+r),p=t*e,h=a*e,v=`
      <div style="height: ${p}px; position: relative;">
        <div style="transform: translateY(${h}px);">
    `;for(let f=a;f<m;f++){let w=this.buffer.cells[f];if(!w)continue;let l=f===this.buffer.cursorY&&this.sessionStatus==="running"?this.buffer.cursorX:-1,g=Ts.renderLineFromCells(w,l);v+=`<div class="terminal-line" style="height: ${e}px; line-height: ${e}px;" data-row="${f}">${g}</div>`}v+="</div></div>",this.container.onscroll||(this.container.onscroll=()=>{this.scrollTop=this.container.scrollTop,this.updateTimeout||(this.updateTimeout=setTimeout(()=>{this.updateTimeout=null,this.updateBufferContentImmediate()},16))}),this.container.innerHTML=v,this.container.style.overflowY="auto"}renderFullBuffer(e){if(!this.container||!this.buffer)return;let t="";for(let s=0;s<this.buffer.cells.length;s++){let n=this.buffer.cells[s],r=s===this.buffer.cursorY&&this.sessionStatus==="running"?this.buffer.cursorX:-1,a=Ts.renderLineFromCells(n,r);t+=`<div class="terminal-line" style="height: ${e}px; line-height: ${e}px;">${a}</div>`}if(t===""||this.buffer.cells.length===0)for(let s=0;s<Math.max(3,this.visibleRows);s++)t+=`<div class="terminal-line" style="height: ${e}px; line-height: ${e}px;">&nbsp;</div>`;this.container.innerHTML=t,this.container.style.overflowY="hidden"}refresh(){this.buffer&&this.requestUpdate()}getTextWithStyles(e=!0){return this.buffer?Rn(this.buffer.cells,e):""}};d([C({type:String})],De.prototype,"sessionId",2),d([C({type:String})],De.prototype,"theme",2),d([C({type:String})],De.prototype,"sessionStatus",2),d([_()],De.prototype,"buffer",2),d([_()],De.prototype,"error",2),d([_()],De.prototype,"displayedFontSize",2),d([_()],De.prototype,"visibleRows",2),d([_()],De.prototype,"scrollTop",2),d([_()],De.prototype,"virtualScrollEnabled",2),De=d([D("vibe-terminal-buffer")],De);q();var yi=class extends R{constructor(){super(...arguments);this.size=16}render(){return u`
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="--icon-size: ${this.size}px"
        class="copy-icon"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `}};yi.styles=Kt`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0.4;
      transition: opacity 0.2s ease;
    }

    :host(:hover) {
      opacity: 0.8;
    }

    svg {
      display: block;
      width: var(--icon-size, 16px);
      height: var(--icon-size, 16px);
    }
  `,d([C({type:Number})],yi.prototype,"size",2),yi=d([D("copy-icon")],yi);var Nn=P("clickable-path"),ei=class extends R{constructor(){super(...arguments);this.path="";this.class="";this.iconSize=12}createRenderRoot(){return this}async handleClick(e){if(e.stopPropagation(),e.preventDefault(),!!this.path)try{if(await xs(this.path))Nn.log("Path copied to clipboard",{path:this.path}),this.dispatchEvent(new CustomEvent("path-copied",{detail:{path:this.path},bubbles:!0,composed:!0}));else throw new Error("Copy command failed")}catch(t){Nn.error("Failed to copy path to clipboard",{error:t,path:this.path}),this.dispatchEvent(new CustomEvent("path-copy-failed",{detail:{path:this.path,error:t instanceof Error?t.message:"Unknown error"},bubbles:!0,composed:!0}))}}render(){if(!this.path)return u``;let e=Pe(this.path);return u`
      <div
        class="truncate cursor-pointer hover:text-accent-green transition-colors inline-flex items-center gap-1 max-w-full ${this.class}"
        title="Click to copy path"
        @click=${this.handleClick}
      >
        <span class="truncate">${e}</span>
        <copy-icon size="${this.iconSize}" class="flex-shrink-0"></copy-icon>
      </div>
    `}};d([C({type:String})],ei.prototype,"path",2),d([C({type:String})],ei.prototype,"class",2),d([C({type:Number})],ei.prototype,"iconSize",2),ei=d([D("clickable-path")],ei);var ct=class extends R{constructor(){super(...arguments);this.value="";this.placeholder="";this.isEditing=!1;this.editValue=""}render(){return this.isEditing?u`
        <div class="edit-container">
          <input
            type="text"
            .value=${this.editValue}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            placeholder=${this.placeholder}
          />
          <div class="action-buttons">
            <button class="save" @click=${e=>{e.stopPropagation(),this.handleSave()}} title="Save (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button class="cancel" @click=${e=>{e.stopPropagation(),this.handleCancel()}} title="Cancel (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `:u`
      <div class="display-container">
        <span class="display-text" title=${this.value}>${this.value}</span>
        <svg
          class="edit-icon"
          @click=${e=>{e.stopPropagation(),this.startEdit()}}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </div>
    `}updated(e){e.has("isEditing")&&this.isEditing&&requestAnimationFrame(()=>{this.inputElement=this.shadowRoot?.querySelector("input"),this.inputElement&&(this.inputElement.focus(),this.inputElement.select())})}startEdit(){this.editValue=this.value,this.isEditing=!0}handleInput(e){let t=e.target;this.editValue=t.value}handleKeyDown(e){e.key==="Enter"?(e.preventDefault(),this.handleSave()):e.key==="Escape"&&(e.preventDefault(),this.handleCancel())}handleSave(){let e=this.editValue.trim();e&&e!==this.value&&this.onSave?.(e),this.isEditing=!1}handleCancel(){this.isEditing=!1,this.editValue=""}};ct.styles=Kt`
    :host {
      display: block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }

    .display-container {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      max-width: 100%;
      min-width: 0;
    }

    .display-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
      max-width: 100%;
    }

    .edit-icon {
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      flex-shrink: 0;
      width: 1em;
      height: 1em;
    }

    /* Always show on touch devices */
    @media (hover: none) and (pointer: coarse) {
      .edit-icon {
        opacity: 0.5;
      }
    }

    :host(:hover) .edit-icon {
      opacity: 0.5;
    }

    .edit-icon:hover {
      opacity: 1 !important;
    }

    .edit-container {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      width: 100%;
    }

    input {
      background: rgb(var(--color-bg-tertiary));
      border: 1px solid rgb(var(--color-border));
      color: inherit;
      font: inherit;
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
      outline: none;
      width: 100%;
      min-width: 0;
    }

    input:focus {
      border-color: rgb(var(--color-primary));
    }

    .action-buttons {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.125rem;
      border-radius: 0.25rem;
      color: rgb(var(--color-text-muted));
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
    }

    button:hover {
      background: rgb(var(--color-bg-tertiary));
    }

    button.save {
      color: rgb(var(--color-primary));
    }

    button.save:hover {
      background: rgb(var(--color-primary));
      background-opacity: 0.2;
    }

    button.cancel {
      color: rgb(var(--color-status-error));
    }

    button.cancel:hover {
      background: rgb(var(--color-status-error));
      background-opacity: 0.2;
    }
  `,d([C({type:String})],ct.prototype,"value",2),d([C({type:String})],ct.prototype,"placeholder",2),d([C({attribute:!1})],ct.prototype,"onSave",2),d([_()],ct.prototype,"isEditing",2),d([_()],ct.prototype,"editValue",2),ct=d([D("inline-edit")],ct);var Rt=P("session-card"),Xo=u`
  <svg
    class="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M12 8l-2 2m4-2l-2 2m4 0l-2 2"
      opacity="0.6"
    />
  </svg>
`,Ge=class extends R{constructor(){super(...arguments);this.selected=!1;this.killing=!1;this.killingFrame=0;this.isActive=!1;this.isSendingPrompt=!1;this.terminalTheme="auto";this.isHovered=!1;this.killingInterval=null;this.activityTimeout=null;this.storageListener=null;this.themeChangeListener=null;this.preferencesManager=Ze.getInstance()}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.loadThemeFromStorage(),this.storageListener=e=>{e.key==="vibetunnel_terminal_preferences"&&this.loadThemeFromStorage()},window.addEventListener("storage",this.storageListener),this.themeChangeListener=e=>{this.terminalTheme=e.detail},window.addEventListener("terminal-theme-changed",this.themeChangeListener)}disconnectedCallback(){super.disconnectedCallback(),this.killingInterval&&clearInterval(this.killingInterval),this.activityTimeout&&clearTimeout(this.activityTimeout),this.storageListener&&(window.removeEventListener("storage",this.storageListener),this.storageListener=null),this.themeChangeListener&&(window.removeEventListener("terminal-theme-changed",this.themeChangeListener),this.themeChangeListener=null)}handleCardClick(){this.dispatchEvent(new CustomEvent("session-select",{detail:this.session,bubbles:!0,composed:!0}))}handleContentChanged(){this.session.status==="running"&&(this.isActive=!0,this.activityTimeout&&clearTimeout(this.activityTimeout),this.activityTimeout=window.setTimeout(()=>{this.isActive=!1,this.activityTimeout=null},500))}async handleKillClick(e){e.stopPropagation(),e.preventDefault(),await this.kill()}async kill(){if(this.killing||this.session.status!=="running"&&this.session.status!=="exited")return!1;let e=this.session.status==="exited";this.killing=!0,this.killingFrame=0,this.killingInterval=window.setInterval(()=>{this.killingFrame=(this.killingFrame+1)%4,this.requestUpdate()},200);let t=setTimeout(()=>{Rt.warn(`Kill operation timed out for session ${this.session.id}`),this.stopKillingAnimation(),this.dispatchEvent(new CustomEvent("session-kill-error",{detail:{sessionId:this.session.id,error:"Kill operation timed out"},bubbles:!0,composed:!0}))},1e4);e&&(this.classList.add("black-hole-collapsing"),await new Promise(o=>setTimeout(o,300)));let s=this.session.status==="exited",n=await Wi.deleteSession(this.session,{authClient:this.authClient,callbacks:{onError:o=>{Rt.error("Error killing session",{error:o,sessionId:this.session.id}),this.dispatchEvent(new CustomEvent("session-kill-error",{detail:{sessionId:this.session.id,error:o},bubbles:!0,composed:!0})),clearTimeout(t)},onSuccess:()=>{this.dispatchEvent(new CustomEvent("session-killed",{detail:{sessionId:this.session.id,session:this.session},bubbles:!0,composed:!0})),Rt.log(`Session ${this.session.id} ${s?"cleaned up":"killed"} successfully`),clearTimeout(t)}}});return this.stopKillingAnimation(),clearTimeout(t),n.success}stopKillingAnimation(){this.killing=!1,this.killingInterval&&(clearInterval(this.killingInterval),this.killingInterval=null)}getKillingText(){let e=["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"];return e[this.killingFrame%e.length]}async handleRename(e){let t=await ks(this.session.id,e,this.authClient);t.success?(this.session={...this.session,name:e},this.dispatchEvent(new CustomEvent("session-renamed",{detail:{sessionId:this.session.id,newName:e},bubbles:!0,composed:!0})),Rt.log(`Session ${this.session.id} renamed to: ${e}`)):this.dispatchEvent(new CustomEvent("session-rename-error",{detail:{sessionId:this.session.id,error:t.error||"Unknown error"},bubbles:!0,composed:!0}))}async handleMagicButton(){if(!(!this.session||this.isSendingPrompt)){this.isSendingPrompt=!0,Rt.log("Magic button clicked for session",this.session.id);try{await Es(this.session.id,this.authClient)}catch(e){Rt.error("Failed to send AI prompt",e),this.dispatchEvent(new CustomEvent("show-toast",{detail:{message:"Failed to send prompt to AI assistant",type:"error"},bubbles:!0,composed:!0}))}finally{this.isSendingPrompt=!1}}}handleMouseEnter(){this.isHovered=!0}handleMouseLeave(){this.isHovered=!1}loadThemeFromStorage(){this.terminalTheme=this.preferencesManager.getTheme()}render(){return this.session.name||Rt.warn("Session missing name",{sessionId:this.session.id,name:this.session.name,command:this.session.command}),u`
      <div
        class="card cursor-pointer overflow-hidden flex flex-col h-full ${this.killing?"opacity-60":""} ${this.isActive&&this.session.status==="running"?"ring-2 ring-primary shadow-glow-sm":""} ${this.selected?"ring-2 ring-accent-primary shadow-card-hover":""}"
        style="view-transition-name: session-${this.session.id}; --session-id: session-${this.session.id}"
        data-session-id="${this.session.id}"
        data-testid="session-card"
        data-session-status="${this.session.status}"
        data-is-killing="${this.killing}"
        @click=${this.handleCardClick}
        @mouseenter=${this.handleMouseEnter}
        @mouseleave=${this.handleMouseLeave}
      >
        <!-- Compact Header -->
        <div
          class="flex justify-between items-center px-3 py-2 border-b border-border bg-gradient-to-r from-bg-secondary to-bg-tertiary"
        >
          <div class="text-xs font-mono pr-2 flex-1 min-w-0 text-primary">
            <div class="flex items-center gap-2">
              <inline-edit
                .value=${this.session.name||this.session.command?.join(" ")||""}
                .placeholder=${this.session.command?.join(" ")||""}
                .onSave=${async e=>{try{await this.handleRename(e)}catch(t){Rt.debug("Rename error caught in onSave",{error:t})}}}
              ></inline-edit>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            ${this.session.status==="running"&&_s(this.session)?u`
                  <button
                    class="bg-transparent border-0 p-0 cursor-pointer opacity-50 hover:opacity-100 transition-opacity duration-200 text-primary"
                    @click=${e=>{e.stopPropagation(),this.handleMagicButton()}}
                    id="session-magic-button"
                    title="Send prompt to update terminal title"
                    aria-label="Send magic prompt to AI assistant"
                    ?disabled=${this.isSendingPrompt}
                  >
                    ${this.isSendingPrompt?u`<span class="block w-5 h-5 flex items-center justify-center animate-spin">⠋</span>`:Xo}
                  </button>
                `:""}
            ${this.session.status==="running"||this.session.status==="exited"?u`
                  <button
                    class="p-1 rounded-full transition-all duration-200 disabled:opacity-50 flex-shrink-0 ${this.session.status==="running"?"text-status-error hover:bg-status-error/20":"text-status-warning hover:bg-status-warning/20"}"
                    @click=${this.handleKillClick}
                    ?disabled=${this.killing}
                    id="session-kill-button"
                    title="${this.session.status==="running"?"Kill session":"Clean up session"}"
                    data-testid="kill-session-button"
                  >
                    ${this.killing?u`<span class="block w-5 h-5 flex items-center justify-center"
                          >${this.getKillingText()}</span
                        >`:u`
                          <svg
                            class="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <circle cx="12" cy="12" r="10" stroke-width="2" />
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M15 9l-6 6m0-6l6 6"
                            />
                          </svg>
                        `}
                  </button>
                `:""}
          </div>
        </div>

        <!-- Terminal display (main content) -->
        <div
          class="session-preview bg-bg overflow-hidden flex-1 relative ${this.session.status==="exited"?"session-exited":""}"
          style="background: linear-gradient(to bottom, rgb(var(--color-bg)), rgb(var(--color-bg-secondary))); box-shadow: inset 0 1px 3px rgb(var(--color-bg) / 0.5);"
        >
          ${this.killing?u`
                <div class="w-full h-full flex items-center justify-center text-status-error">
                  <div class="text-center font-mono">
                    <div class="text-4xl mb-2">${this.getKillingText()}</div>
                    <div class="text-sm">Killing session...</div>
                  </div>
                </div>
              `:u`
                <vibe-terminal-buffer
                  .sessionId=${this.session.id}
                  .theme=${this.terminalTheme}
                  class="w-full h-full"
                  style="pointer-events: none;"
                  @content-changed=${this.handleContentChanged}
                ></vibe-terminal-buffer>
              `}
        </div>

        <!-- Compact Footer -->
        <div
          class="px-3 py-2 text-text-muted text-xs border-t border-border bg-gradient-to-r from-bg-tertiary to-bg-secondary"
        >
          <div class="flex justify-between items-center min-w-0">
            <span 
              class="${this.getActivityStatusColor()} text-xs flex items-center gap-1 flex-shrink-0"
              data-status="${this.session.status}"
              data-killing="${this.killing}"
            >
              <div class="w-2 h-2 rounded-full ${this.getStatusDotColor()}"></div>
              ${this.getActivityStatusText()}
              ${this.session.status==="running"&&this.isActive&&!this.session.activityStatus?.specificStatus?u`<span class="text-primary animate-pulse ml-1">●</span>`:""}
            </span>
            ${this.renderGitStatus()}
          </div>
          <div class="text-xs opacity-75 min-w-0 mt-1">
            <clickable-path .path=${this.session.workingDir} .iconSize=${12}></clickable-path>
          </div>
        </div>
      </div>
    `}renderGitStatus(){return this.session.gitBranch?u`
      <div class="flex items-center gap-1 text-[10px] flex-shrink-0">
        ${this.session.gitBranch?u`
          <span class="px-1.5 py-0.5 bg-surface-2 rounded-sm">${this.session.gitBranch}</span>
        `:""}
        
        ${this.session.gitAheadCount&&this.session.gitAheadCount>0?u`
          <span class="text-status-success flex items-center gap-0.5">
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 4l-4 4h3v4h2v-4h3L8 4z"/>
            </svg>
            ${this.session.gitAheadCount}
          </span>
        `:""}
        
        ${this.session.gitBehindCount&&this.session.gitBehindCount>0?u`
          <span class="text-status-warning flex items-center gap-0.5">
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 12l4-4h-3V4H7v4H4l4 4z"/>
            </svg>
            ${this.session.gitBehindCount}
          </span>
        `:""}
        
        ${this.session.gitHasChanges?u`
          <span class="text-yellow-500">●</span>
        `:""}
        
        ${this.session.gitIsWorktree?u`
          <span class="text-purple-400" title="Git worktree">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
            </svg>
          </span>
        `:""}
      </div>
    `:""}getActivityStatusText(){return this.killing?"killing...":this.session.active===!1?"waiting":this.session.status==="running"&&this.session.activityStatus?.specificStatus?this.session.activityStatus.specificStatus.status:this.session.status}getActivityStatusColor(){return this.killing?"text-status-error":this.session.active===!1?"text-text-muted":this.session.status==="running"&&this.session.activityStatus?.specificStatus?"text-status-warning":this.session.status==="running"?"text-status-success":"text-status-warning"}getStatusDotColor(){return this.killing?"bg-status-error animate-pulse":this.session.active===!1?"bg-muted":this.session.status==="running"?this.session.activityStatus?.specificStatus?"bg-status-warning animate-pulse":this.session.activityStatus?.isActive||this.isActive?"bg-status-success":"bg-status-success ring-1 ring-status-success/50":"bg-status-warning"}};d([C({type:Object})],Ge.prototype,"session",2),d([C({type:Object})],Ge.prototype,"authClient",2),d([C({type:Boolean})],Ge.prototype,"selected",2),d([_()],Ge.prototype,"killing",2),d([_()],Ge.prototype,"killingFrame",2),d([_()],Ge.prototype,"isActive",2),d([_()],Ge.prototype,"isSendingPrompt",2),d([_()],Ge.prototype,"terminalTheme",2),d([_()],Ge.prototype,"isHovered",2),Ge=d([D("session-card")],Ge);function Sr(c){let i=Math.floor(c/1e3),e=Math.floor(i/60),t=Math.floor(e/60),s=Math.floor(t/24);return s>0?`${s}d ${t%24}h`:t>0?`${t}h ${e%60}m`:e>0?`${e}m ${i%60}s`:`${i}s`}function Jo(c){let i=new Date(c).getTime();if(Number.isNaN(i))return 0;let e=Date.now();return Math.max(0,e-i)}function Cr(c,i){if(!i)return Sr(Jo(c));let e=new Date(c).getTime(),t=new Date(i).getTime();return Number.isNaN(e)||Number.isNaN(t)||t<e?Sr(0):Sr(t-e)}var bt=class extends R{constructor(){super(...arguments);this.selected=!1;this.sessionType="active"}createRenderRoot(){return this}handleClick(){this.dispatchEvent(new CustomEvent("session-select",{detail:this.session,bubbles:!0,composed:!0}))}handleRename(e){this.dispatchEvent(new CustomEvent("session-rename",{detail:{sessionId:this.session.id,newName:e},bubbles:!0,composed:!0}))}async handleDelete(e){e.stopPropagation();let t=this.session.status==="exited"?"session-cleanup":"session-delete";this.dispatchEvent(new CustomEvent(t,{detail:{sessionId:this.session.id},bubbles:!0,composed:!0}))}renderStatusIndicator(){let e=this.session;return e.status==="exited"?u`<div class="w-2.5 h-2.5 rounded-full bg-status-warning"></div>`:e.activityStatus?.isActive===!1?u`<div class="w-2.5 h-2.5 rounded-full bg-status-success ring-1 ring-status-success/50"></div>`:u`
      <div class="relative">
        <div
          class="w-2.5 h-2.5 rounded-full ${e.activityStatus?.specificStatus?"bg-status-warning animate-pulse-primary":"bg-status-success"}"
          title="${e.activityStatus?.specificStatus?`Active: ${e.activityStatus.specificStatus.app}`:"Active"}"
        ></div>
        <!-- Pulse ring for active sessions -->
        ${e.status==="running"&&e.activityStatus?.isActive?u`<div class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-status-success opacity-30 animate-ping"></div>`:""}
      </div>
    `}renderGitChanges(){if(!this.session.gitRepoPath)return"";let e=[];return this.session.gitHasChanges&&e.push(u`<span class="text-status-warning ml-1">●</span>`),this.session.gitAheadCount&&this.session.gitAheadCount>0&&e.push(u`<span class="text-status-success ml-1">↑${this.session.gitAheadCount}</span>`),this.session.gitBehindCount&&this.session.gitBehindCount>0&&e.push(u`<span class="text-status-warning ml-1">↓${this.session.gitBehindCount}</span>`),e.length===0?"":u`${e}`}renderSessionName(){let e=this.session.name||(Array.isArray(this.session.command)?this.session.command.join(" "):this.session.command);return this.sessionType!=="exited"?u`
        <inline-edit
          .value=${e}
          .placeholder=${Array.isArray(this.session.command)?this.session.command.join(" "):this.session.command}
          .onSave=${t=>this.handleRename(t)}
        ></inline-edit>
      `:u`<span title="${e}">${e}</span>`}renderDeleteButton(){let e=this.session.status==="exited",t=e?"btn-ghost text-text-muted p-1.5 rounded-md transition-all hover:text-status-warning hover:bg-bg-elevated hover:shadow-sm":"btn-ghost text-text-muted p-1.5 rounded-md transition-all hover:text-status-error hover:bg-bg-elevated hover:shadow-sm hover:scale-110",s=e?"Clean up session":"Kill Session";return u`
      <button
        class="${t}"
        @click=${this.handleDelete}
        title="${s}"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `}render(){let e=this.session,t=e.status==="exited",s="ontouchstart"in window,n=["group","flex","items-center","gap-3","p-3","rounded-lg","cursor-pointer",this.selected?"bg-bg-elevated border border-accent-primary shadow-card-hover":t?"bg-bg-secondary border border-border hover:bg-bg-tertiary hover:border-border-light hover:shadow-card opacity-75":"bg-bg-secondary border border-border hover:bg-bg-tertiary hover:border-border-light hover:shadow-card"].join(" "),o=this.selected?"text-accent-primary font-medium":t?"text-text-muted group-hover:text-text transition-colors":"text-text group-hover:text-accent-primary transition-colors",r=t?"text-text-dim":"text-text-muted";return u`
      <div class="${n}" style="margin-bottom: 12px;" @click=${this.handleClick}>
        <!-- Session number and status indicator -->
        <div class="flex items-center gap-2 flex-shrink-0">
          ${this.sessionNumber?u`
            <span class="text-xs font-mono ${this.selected?"text-accent-primary":"text-text-muted"} min-w-[1.5rem] text-center">
              ${this.sessionNumber}
            </span>
          `:""}
          <div class="relative">
            ${this.renderStatusIndicator()}
          </div>
        </div>
        
        <!-- Elegant divider line -->
        <div class="w-px h-full self-stretch bg-gradient-to-b from-transparent via-border to-transparent"></div>
        
        <!-- Session content -->
        <div class="flex-1 min-w-0">
          <!-- Row 1: Session name -->
          <div class="text-sm font-mono truncate ${o}">
            ${this.renderSessionName()}
          </div>
          
          <!-- Row 2: Path, branch, and git changes -->
          <div class="text-xs ${r} truncate flex items-center gap-1 mt-1">
            <span class="truncate">${Pe(e.workingDir)}</span>
            ${e.gitBranch?u`
                  <span class="text-text-muted/50">·</span>
                  <span class="text-status-success font-mono">[${e.gitBranch}]</span>
                  ${e.gitIsWorktree?u`<span class="text-purple-400 ml-0.5">⎇</span>`:""}
                  <!-- Git changes indicator after branch -->
                  ${this.renderGitChanges()}
                `:""}
          </div>
          
          <!-- Row 3: Activity status (only shown if there's activity) -->
          ${this.sessionType==="active"&&e.activityStatus?.specificStatus?u`
                <div class="text-xs text-status-warning truncate mt-1">
                  <span class="flex-shrink-0">${e.activityStatus.specificStatus.status}</span>
                </div>
              `:""}
        </div>
        
        <!-- Right side: duration and close button -->
        <div class="relative flex items-center flex-shrink-0 gap-1">
          ${s?u`
                <!-- Touch devices: Close button left of time -->
                ${this.renderDeleteButton()}
                <div class="text-xs text-text-${t?"dim":"muted"} font-mono">
                  ${e.startedAt?Cr(e.startedAt,e.status==="exited"?e.lastModified:void 0):""}
                </div>
              `:u`
                <!-- Desktop: Time that hides on hover -->
                <div class="text-xs text-text-${t?"dim":"muted"} font-mono transition-opacity group-hover:opacity-0">
                  ${e.startedAt?Cr(e.startedAt,e.status==="exited"?e.lastModified:void 0):""}
                </div>
                
                <!-- Desktop: Buttons show on hover -->
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0">
                  ${this.renderDeleteButton()}
                </div>
              `}
        </div>
      </div>
    `}};d([C({type:Object})],bt.prototype,"session",2),d([C({type:Object})],bt.prototype,"authClient",2),d([C({type:Boolean})],bt.prototype,"selected",2),d([C({type:String})],bt.prototype,"sessionType",2),d([C({type:Number})],bt.prototype,"sessionNumber",2),bt=d([D("compact-session-card")],bt);function $s(c){if(c==="/")return"";let i=c.split("/"),e=i[i.length-1]||c,t=[/-tree(?:test)?$/i,/-worktree$/i,/-wt-\w+$/i,/-work$/i,/-temp$/i,/-branch-\w+$/i,/-\w+$/i];for(let s of t)if(s.test(e)){let n=e.replace(s,"");if(n&&n.length>=2)return n}return e}var Dt=class extends R{createRenderRoot(){return this}getRepoName(){return $s(this.repoPath)}renderFollowModeIndicator(){if(!this.followMode)return"";let i=this.followMode.replace(/^refs\/heads\//,"");return u`
      <span class="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded flex items-center gap-1" 
            title="Following worktree: ${i}">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        ${i}
      </span>
    `}render(){return u`
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M15 9a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h4 class="text-sm font-medium text-text-muted flex items-center gap-2">
            ${this.getRepoName()}
            ${this.renderFollowModeIndicator()}
          </h4>
        </div>
        <div class="flex items-center gap-2">
          ${this.followModeSelector}
          ${this.worktreeSelector}
        </div>
      </div>
    `}};d([C({type:String})],Dt.prototype,"repoPath",2),d([C({type:String})],Dt.prototype,"followMode",2),d([C({type:Object})],Dt.prototype,"followModeSelector",2),d([C({type:Object})],Dt.prototype,"worktreeSelector",2),Dt=d([D("repository-header")],Dt);q();var ti=P("session-list"),_e=class extends R{constructor(){super(...arguments);this.sessions=[];this.loading=!1;this.hideExited=!0;this.selectedSessionId=null;this.compactMode=!1;this.cleaningExited=!1;this.repoFollowMode=new Map;this.loadingFollowMode=new Set;this.showFollowDropdown=new Map;this.repoWorktrees=new Map;this.loadingWorktrees=new Set;this.showWorktreeDropdown=new Map;this.handleClickOutside=e=>{let t=e.target;t.closest('[id^="branch-selector-"]')||t.closest(".branch-dropdown")||t.closest('[id^="follow-selector-"]')||t.closest(".follow-dropdown")||t.closest('[id^="worktree-selector-"]')||t.closest(".worktree-dropdown")||(this.showFollowDropdown.size>0||this.showWorktreeDropdown.size>0)&&(this.showFollowDropdown=new Map,this.showWorktreeDropdown=new Map,this.requestUpdate())};this.handleKeyDown=e=>{let{key:t}=e;if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Enter"].includes(t))return;let s=e.target;if(s!==this&&(s.closest("input, textarea, select")||s.isContentEditable))return;let n=this.getVisibleSessions();if(n.length===0)return;e.preventDefault(),e.stopPropagation();let o=this.selectedSessionId?n.findIndex(a=>a.id===this.selectedSessionId):0;if(o<0&&(o=0),t==="Enter"){this.handleSessionSelect({detail:n[o]});return}let r=this.getGridColumns();if(t==="ArrowLeft")o=(o-1+n.length)%n.length;else if(t==="ArrowRight")o=(o+1)%n.length;else if(t==="ArrowUp"){if(o=o-r,o<0){let a=o+r,m=Math.floor((n.length-1)/r)*r;o=Math.min(m+a,n.length-1)}}else if(t==="ArrowDown"){let a=o;o=o+r,o>=n.length&&(o=a%r)}this.selectedSessionId=n[o].id,this.requestUpdate(),setTimeout(()=>{let a=this.querySelector("session-card[selected]")||this.querySelector('div[class*="bg-bg-elevated"][class*="border-accent-primary"]');a&&a.scrollIntoView({behavior:"smooth",block:"nearest"})},0)};this.handleSessionRenamed=e=>{let{sessionId:t,newName:s}=e.detail,n=this.sessions.findIndex(o=>o.id===t);n>=0&&(this.sessions[n]={...this.sessions[n],name:s},this.requestUpdate())};this.handleSessionRenameError=e=>{let{sessionId:t,error:s}=e.detail;ti.error(`failed to rename session ${t}:`,s),this.dispatchEvent(new CustomEvent("error",{detail:`Failed to rename session: ${s}`}))}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.tabIndex=0,this.addEventListener("keydown",this.handleKeyDown),document.addEventListener("click",this.handleClickOutside)}updated(e){super.updated(e),e.has("sessions")&&this.loadFollowModeForAllRepos()}async loadFollowModeForAllRepos(){let e=this.groupSessionsByRepo(this.sessions);for(let[t]of e)t&&!this.repoWorktrees.has(t)&&this.loadWorktreesForRepo(t)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this.handleKeyDown),document.removeEventListener("click",this.handleClickOutside)}getVisibleSessions(){let e=this.sessions.filter(s=>s.status==="running"),t=this.sessions.filter(s=>s.status==="exited");return this.hideExited?e:e.concat(t)}getGridColumns(){let e=this.querySelector(".session-flex-responsive");if(!e||this.compactMode)return 1;let n=window.getComputedStyle(e).getPropertyValue("grid-template-columns").split(" ").filter(o=>o&&o!=="0px").length;if(n===0||n===1){let o=e.clientWidth,r=280,a=20;return Math.max(1,Math.floor((o+a)/(r+a)))}return n}handleSessionSelect(e){let t=e.detail;this.dispatchEvent(new CustomEvent("navigate-to-session",{detail:{sessionId:t.id},bubbles:!0,composed:!0}))}async handleSessionKilled(e){let{sessionId:t}=e.detail;ti.debug(`session ${t} killed, updating session list`),this.sessions=this.sessions.filter(s=>s.id!==t),this.dispatchEvent(new CustomEvent("session-killed",{detail:t,bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("refresh"))}handleSessionKillError(e){let{sessionId:t,error:s}=e.detail;ti.error(`failed to kill session ${t}:`,s),this.dispatchEvent(new CustomEvent("error",{detail:`Failed to kill session: ${s}`}))}async handleCleanupExited(){if(!this.cleaningExited){this.cleaningExited=!0,this.requestUpdate();try{if((await fetch("/api/cleanup-exited",{method:"POST",headers:{...this.authClient.getAuthHeader()}})).ok){if(this.sessions.filter(s=>s.status==="exited").length>0){let s=this.querySelectorAll("session-card"),n=[];s.forEach(o=>{let r=o;r.session?.status==="exited"&&n.push(r)}),n.forEach(o=>{o.classList.add("black-hole-collapsing")}),n.length>0&&await new Promise(o=>setTimeout(o,300)),this.sessions=this.sessions.filter(o=>o.status!=="exited")}this.dispatchEvent(new CustomEvent("refresh"))}else this.dispatchEvent(new CustomEvent("error",{detail:"Failed to cleanup exited sessions"}))}catch(e){ti.error("error cleaning up exited sessions:",e),this.dispatchEvent(new CustomEvent("error",{detail:"Failed to cleanup exited sessions"}))}finally{this.cleaningExited=!1,this.requestUpdate()}}}groupSessionsByRepo(e){let t=new Map;e.forEach(o=>{let r=o.gitMainRepoPath||o.gitRepoPath||null;t.has(r)||t.set(r,[]);let a=t.get(r);a&&a.push(o)});let s=new Map;if(t.has(null)){let o=t.get(null);o&&s.set(null,o)}let n=Array.from(t.keys()).filter(o=>o!==null);return n.sort((o,r)=>{let a=this.getRepoName(o),m=this.getRepoName(r);return a.localeCompare(m)}),n.forEach(o=>{let r=t.get(o);r&&s.set(o,r)}),s}getRepoName(e){return $s(e)}async handleFollowModeChange(e,t){this.repoFollowMode.set(e,t);let s=new Map(this.showFollowDropdown);for(let[n]of s)n.startsWith(`${e}:`)&&s.delete(n);this.showFollowDropdown=s,this.requestUpdate();try{if(!(await fetch("/api/worktrees/follow",{method:"POST",headers:{"Content-Type":"application/json",...this.authClient.getAuthHeader()},body:JSON.stringify({repoPath:e,branch:t,enable:!!t})})).ok)throw new Error("Failed to update follow mode");let o=new CustomEvent("show-toast",{detail:{message:t?`Following worktree branch: ${t.replace(/^refs\/heads\//,"")}`:"Follow mode disabled",type:"success"},bubbles:!0,composed:!0});this.dispatchEvent(o)}catch(n){ti.error("Error updating follow mode:",n);let o=new CustomEvent("show-toast",{detail:{message:"Failed to update follow mode",type:"error"},bubbles:!0,composed:!0});this.dispatchEvent(o)}}toggleFollowDropdown(e){let t=this.showFollowDropdown.get(e)||!1,s=new Map(this.showFollowDropdown),n=new Map(this.showWorktreeDropdown);if(t)s.delete(e);else{s.clear(),s.set(e,!0);let o=e.split(":")[0];this.loadWorktreesForRepo(o)}n.clear(),this.showFollowDropdown=s,this.showWorktreeDropdown=n,this.requestUpdate()}renderFollowModeSelector(e,t=""){let s=this.repoWorktrees.get(e)||[],n=this.repoFollowMode.get(e),o=this.loadingFollowMode.has(e),r=`${e}:${t}`,a=this.showFollowDropdown.get(r)||!1,m=this.sessions.filter(f=>(f.gitMainRepoPath||f.gitRepoPath)===e),p=s.filter(f=>{let w=f.path.replace(/^\/private/,""),x=e.replace(/^\/private/,"");return w!==x});if(!m.some(f=>f.workingDir?p.some(w=>f.workingDir?.startsWith(w.path)):!1)&&p.length===0)return u``;let v=n?n.replace(/^refs\/heads\//,""):"Standalone";return u`
      <div class="relative">
        <button
          class="flex items-center gap-1 px-2 py-1 text-xs bg-bg-secondary hover:bg-bg-tertiary rounded-md border border-border transition-colors"
          @click=${()=>this.toggleFollowDropdown(r)}
          id="follow-selector-${r.replace(/[^a-zA-Z0-9]/g,"-")}"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <span class="font-mono text-xs">${v}</span>
          ${o?u`<span class="animate-spin">⟳</span>`:u`
              <svg class="w-3 h-3 transition-transform ${a?"rotate-180":""}" 
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            `}
        </button>
        
        ${a?u`
          <div class="follow-dropdown absolute right-0 mt-1 w-64 bg-bg-elevated border border-border rounded-md shadow-lg max-h-96 overflow-y-auto" style="z-index: ${ie.BRANCH_SELECTOR_DROPDOWN}">
            <div class="py-1">
              <button
                class="w-full text-left px-3 py-2 text-xs hover:bg-bg-elevated transition-colors flex items-center justify-between"
                @click=${()=>this.handleFollowModeChange(e,void 0)}
              >
                <span class="font-mono ${n?"":"text-accent-primary font-semibold"}">Standalone</span>
                ${n?"":u`<span class="text-accent-primary">✓</span>`}
              </button>
              
              ${p.map(f=>u`
                <button
                  class="w-full text-left px-3 py-2 text-xs hover:bg-bg-elevated transition-colors flex items-center justify-between"
                  @click=${()=>this.handleFollowModeChange(e,f.branch)}
                >
                  <div class="flex flex-col gap-1">
                    <span class="font-mono ${n===f.branch?"text-accent-primary font-semibold":""}">
                      Follow: ${f.branch.replace(/^refs\/heads\//,"")}
                    </span>
                    <span class="text-[10px] text-text-muted">${Pe(f.path)}</span>
                  </div>
                  ${n===f.branch?u`<span class="text-accent-primary">✓</span>`:""}
                </button>
              `)}
            </div>
          </div>
        `:""}
      </div>
    `}async loadWorktreesForRepo(e){if(!(this.loadingWorktrees.has(e)||this.repoWorktrees.has(e))){this.loadingWorktrees.add(e),this.requestUpdate();try{let t=await fetch(`/api/worktrees?${new URLSearchParams({repoPath:e})}`,{headers:this.authClient.getAuthHeader()});if(t.ok){let s=await t.json();this.repoWorktrees.set(e,s.worktrees||[]),this.repoFollowMode.set(e,s.followBranch)}else ti.error(`Failed to load worktrees for ${e}`)}catch(t){ti.error("Error loading worktrees:",t)}finally{this.loadingWorktrees.delete(e),this.requestUpdate()}}}toggleWorktreeDropdown(e){let t=this.showWorktreeDropdown.get(e)||!1,s=new Map,n=new Map;if(!t){n.set(e,!0);let o=e.split(":")[0];this.loadWorktreesForRepo(o)}this.showFollowDropdown=s,this.showWorktreeDropdown=n,this.requestUpdate()}createSessionInWorktree(e){this.showWorktreeDropdown=new Map,this.requestUpdate();let t=new CustomEvent("open-create-dialog",{detail:{workingDir:e},bubbles:!0,composed:!0});this.dispatchEvent(t)}renderWorktreeSelector(e,t=""){let s=this.repoWorktrees.get(e)||[],n=this.loadingWorktrees.has(e),o=`${e}:${t}`,r=this.showWorktreeDropdown.get(o)||!1;return u`
      <div class="relative">
        <button
          class="flex items-center gap-1 px-2 py-1 text-xs bg-bg-secondary hover:bg-bg-tertiary rounded-md border border-border transition-colors"
          @click=${()=>this.toggleWorktreeDropdown(o)}
          id="worktree-selector-${o.replace(/[^a-zA-Z0-9]/g,"-")}"
          title="Worktrees"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <span class="font-mono">${s.length||0}</span>
          ${n?u`<span class="animate-spin">⟳</span>`:u`
              <svg class="w-3 h-3 transition-transform ${r?"rotate-180":""}" 
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            `}
        </button>
        
        ${r?u`
          <div class="worktree-dropdown absolute right-0 mt-1 w-96 bg-bg-elevated border border-border rounded-md shadow-lg max-h-96 overflow-y-auto" style="z-index: ${ie.BRANCH_SELECTOR_DROPDOWN}">
            ${s.length===0&&!n?u`<div class="px-3 py-2 text-xs text-text-muted">No worktrees found</div>`:u`
                <div class="py-1">
                  ${s.map(a=>u`
                    <div class="border-b border-border last:border-b-0">
                      <div class="px-3 py-2">
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <svg class="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M15 9a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <div class="font-mono text-sm truncate">
                              ${a.branch.replace(/^refs\/heads\//,"")}
                            </div>
                            ${a.detached?u`
                              <span class="text-[10px] px-1.5 py-0.5 bg-status-warning/20 text-status-warning rounded flex-shrink-0">
                                detached
                              </span>
                            `:""}
                          </div>
                          <button
                            class="p-1 hover:bg-bg-elevated rounded transition-colors flex-shrink-0"
                            @click=${()=>this.createSessionInWorktree(a.path)}
                            title="Create new session in this worktree"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        </div>
                        <div class="text-[10px] text-text-muted truncate pl-5">${a.path}</div>
                      </div>
                    </div>
                  `)}
                </div>
              `}
          </div>
        `:""}
      </div>
    `}render(){let e=this.sessions.filter(p=>p.status==="running"&&p.activityStatus?.isActive!==!1),t=this.sessions.filter(p=>p.status==="running"&&p.activityStatus?.isActive===!1),s=this.sessions.filter(p=>p.status==="exited"),n=e.length>0,o=t.length>0,r=s.length>0,a=!this.hideExited&&(o||r),m=0;return u`
      <div class="font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-primary rounded-lg" data-testid="session-list-container">
        <div class="p-4 pt-5">
        ${!n&&!o&&(!r||this.hideExited)?u`
              <div class="text-text-muted text-center py-8">
                ${this.loading?"Loading sessions...":this.hideExited&&this.sessions.length>0?u`
                        <div class="space-y-4 max-w-2xl mx-auto text-left">
                          <div class="text-lg font-semibold text-text">
                            No running sessions
                          </div>
                          <div class="text-sm text-text-muted">
                            There are exited sessions. Show them by toggling "Hide exited" above.
                          </div>
                        </div>
                      `:u`
                        <div class="space-y-6 max-w-2xl mx-auto text-left">
                          <div class="text-lg font-semibold text-text">
                            No terminal sessions yet!
                          </div>

                          <div class="space-y-3">
                            <div class="text-sm text-text-muted">
                              Get started by using the
                              <code class="bg-bg-secondary px-2 py-1 rounded">vt</code> command
                              in your terminal:
                            </div>

                            <div
                              class="bg-bg-secondary p-4 rounded-lg font-mono text-xs space-y-2"
                            >
                              <div class="text-status-success">vt pnpm run dev</div>
                              <div class="text-text-muted pl-4"># Monitor your dev server</div>

                              <div class="text-status-success">vt claude --dangerously...</div>
                              <div class="text-text-muted pl-4">
                                # Keep an eye on AI agents
                              </div>

                              <div class="text-status-success">vt --shell</div>
                              <div class="text-text-muted pl-4">
                                # Open an interactive shell
                              </div>

                              <div class="text-status-success">vt python train.py</div>
                              <div class="text-text-muted pl-4">
                                # Watch long-running scripts
                              </div>
                            </div>
                          </div>

                          <div class="space-y-3 border-t border-border pt-4">
                            <div class="text-sm font-semibold text-text">
                              Haven't installed the CLI yet?
                            </div>
                            <div class="text-sm text-text-muted space-y-1">
                              <div>→ Click the VibeTunnel menu bar icon</div>
                              <div>→ Go to Settings → Advanced → Install CLI Tools</div>
                            </div>
                          </div>

                          <div class="text-xs text-text-muted mt-4">
                            Once installed, any command prefixed with
                            <code class="bg-bg-secondary px-1 rounded">vt</code> will appear
                            here, accessible from any browser at localhost:4020.
                          </div>
                        </div>
                      `}
              </div>
            `:u`
              <!-- Active Sessions -->
              ${n?u`
                    <div class="mb-6 mt-2">
                      <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                        Active <span class="text-text-dim">(${e.length})</span>
                      </h3>
                      ${Array.from(this.groupSessionsByRepo(e)).map(([p,h])=>u`
                          <div class="${p?"mb-6 mt-6":"mb-4"}">
                            ${p?u`
                                  <repository-header
                                    .repoPath=${p}
                                    .followMode=${this.repoFollowMode.get(p)}
                                    .followModeSelector=${this.renderFollowModeSelector(p,"active")}
                                    .worktreeSelector=${this.renderWorktreeSelector(p,"active")}
                                  ></repository-header>
                                `:""}
                            <div class="${this.compactMode?"":"session-flex-responsive"} relative">
                              ${Pt(h,v=>v.id,v=>{let f=++m;return u`
                    ${this.compactMode?u`
                          <compact-session-card
                            .session=${v}
                            .authClient=${this.authClient}
                            .selected=${v.id===this.selectedSessionId}
                            .sessionType=${"active"}
                            .sessionNumber=${f}
                            @session-select=${this.handleSessionSelect}
                            @session-rename=${this.handleSessionRenamed}
                            @session-delete=${this.handleSessionKilled}
                          ></compact-session-card>
                        `:u`
                          <!-- Full session card for main view -->
                          <session-card
                            .session=${v}
                            .authClient=${this.authClient}
                            .selected=${v.id===this.selectedSessionId}
                            @session-select=${this.handleSessionSelect}
                            @session-killed=${this.handleSessionKilled}
                            @session-kill-error=${this.handleSessionKillError}
                            @session-renamed=${this.handleSessionRenamed}
                            @session-rename-error=${this.handleSessionRenameError}
                          >
                          </session-card>
                        `}
                  `})}
                            </div>
                          </div>
                        `)}
                    </div>
                  `:""}
              
              <!-- Idle Sessions -->
              ${o?u`
                    <div class="mb-6 ${n?"":"mt-2"}">
                      <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                        Idle <span class="text-text-dim">(${t.length})</span>
                      </h3>
                      ${Array.from(this.groupSessionsByRepo(t)).map(([p,h])=>u`
                          <div class="${p?"mb-6 mt-6":"mb-4"}">
                            ${p?u`
                                  <repository-header
                                    .repoPath=${p}
                                    .followMode=${this.repoFollowMode.get(p)}
                                    .followModeSelector=${this.renderFollowModeSelector(p,"idle")}
                                    .worktreeSelector=${this.renderWorktreeSelector(p,"idle")}
                                  ></repository-header>
                                `:""}
                            <div class="${this.compactMode?"":"session-flex-responsive"} relative">
                              ${Pt(h,v=>v.id,v=>{let f=++m;return u`
                            ${this.compactMode?u`
                                  <compact-session-card
                                    .session=${v}
                                    .authClient=${this.authClient}
                                    .selected=${v.id===this.selectedSessionId}
                                    .sessionType=${"idle"}
                                    .sessionNumber=${f}
                                    @session-select=${this.handleSessionSelect}
                                    @session-rename=${this.handleSessionRenamed}
                                    @session-delete=${this.handleSessionKilled}
                                  ></compact-session-card>
                                `:u`
                                  <!-- Full session card for main view -->
                                  <session-card
                                    .session=${v}
                                    .authClient=${this.authClient}
                                    .selected=${v.id===this.selectedSessionId}
                                    @session-select=${this.handleSessionSelect}
                                    @session-killed=${this.handleSessionKilled}
                                    @session-kill-error=${this.handleSessionKillError}
                                    @session-renamed=${this.handleSessionRenamed}
                                    @session-rename-error=${this.handleSessionRenameError}
                                          >
                                  </session-card>
                                `}
                          `})}
                            </div>
                          </div>
                        `)}
                    </div>
                  `:""}
              
              <!-- Exited Sessions -->
              ${a&&r?u`
                    <div class="${!n&&!o?"mt-2":""}">
                      <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                        Exited <span class="text-text-dim">(${s.length})</span>
                      </h3>
                      ${Array.from(this.groupSessionsByRepo(s)).map(([p,h])=>u`
                          <div class="${p?"mb-6 mt-6":"mb-4"}">
                            ${p?u`
                                  <repository-header
                                    .repoPath=${p}
                                    .followMode=${this.repoFollowMode.get(p)}
                                    .followModeSelector=${this.renderFollowModeSelector(p,"exited")}
                                    .worktreeSelector=${this.renderWorktreeSelector(p,"exited")}
                                  ></repository-header>
                                `:""}
                            <div class="${this.compactMode?"":"session-flex-responsive"} relative">
                              ${Pt(h,v=>v.id,v=>{let f=++m;return u`
                            ${this.compactMode?u`
                                  <compact-session-card
                                    .session=${v}
                                    .authClient=${this.authClient}
                                    .selected=${v.id===this.selectedSessionId}
                                    .sessionType=${"exited"}
                                    .sessionNumber=${f}
                                    @session-select=${this.handleSessionSelect}
                                    @session-cleanup=${this.handleSessionKilled}
                                  ></compact-session-card>
                                `:u`
                                  <!-- Full session card for main view -->
                                  <session-card
                                    .session=${v}
                                    .authClient=${this.authClient}
                                    .selected=${v.id===this.selectedSessionId}
                                    @session-select=${this.handleSessionSelect}
                                    @session-killed=${this.handleSessionKilled}
                                    @session-kill-error=${this.handleSessionKillError}
                                    @session-renamed=${this.handleSessionRenamed}
                                    @session-rename-error=${this.handleSessionRenameError}
                                          >
                                  </session-card>
                                `}
                          `})}
                            </div>
                          </div>
                        `)}
                    </div>
                  `:""}
            `}
        </div>

        ${this.renderExitedControls()}
      </div>
    `}renderExitedControls(){let e=this.sessions.filter(o=>o.status==="exited"),t=this.sessions.filter(o=>o.status==="running"),s=t.filter(o=>o.activityStatus?.isActive!==!1),n=t.filter(o=>o.activityStatus?.isActive===!1);return this.sessions.length===0?"":u`
      <div class="sticky bottom-0 border-t border-border bg-bg-secondary shadow-lg" style="z-index: ${ie.SESSION_LIST_BOTTOM_BAR};">
        <div class="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <!-- Status group (left side) -->
          <div class="flex flex-wrap items-center gap-3 sm:gap-4">
            <!-- Session counts -->
            <div class="flex items-center gap-2 sm:gap-3 font-mono text-xs">
              ${s.length>0?u`
                <span class="text-status-success whitespace-nowrap">${s.length} Active</span>
              `:""}
              ${n.length>0?u`
                <span class="text-text-muted whitespace-nowrap">${n.length} Idle</span>
              `:""}
              ${e.length>0?u`
                <span class="text-text-dim whitespace-nowrap">${e.length} Exited</span>
              `:""}
            </div>

            <!-- Show exited toggle (only if there are exited sessions) -->
            ${e.length>0?u`
              <label class="flex items-center gap-2 cursor-pointer group whitespace-nowrap">
                <input
                  type="checkbox"
                  class="session-toggle-checkbox"
                  ?checked=${!this.hideExited}
                  @change=${o=>{let r=o.target.checked;this.dispatchEvent(new CustomEvent("hide-exited-change",{detail:!r}))}}
                  id="show-exited-toggle"
                  data-testid="show-exited-toggle"
                />
                <span class="text-xs text-text-muted group-hover:text-text font-mono select-none">
                  Show
                </span>
              </label>
            `:""}
          </div>

          <!-- Actions group (right side) -->
          <div class="flex items-center gap-2 ml-auto">
            <!-- Clean button (only visible when showing exited sessions) -->
            ${!this.hideExited&&e.length>0?u`
              <button
                class="font-mono text-xs px-3 py-1.5 rounded-md border transition-all duration-200 border-status-warning bg-status-warning/10 text-status-warning hover:bg-status-warning/20 hover:shadow-glow-warning-sm active:scale-95 disabled:opacity-50"
                id="clean-exited-button"
                @click=${this.handleCleanupExited}
                ?disabled=${this.cleaningExited}
                data-testid="clean-exited-button"
              >
                ${this.cleaningExited?u`
                  <span class="flex items-center gap-1">
                    <span class="animate-spin">⟳</span>
                    Cleaning...
                  </span>
                `:"Clean"}
              </button>
            `:""}
            
            <!-- Kill All button (always visible if there are running sessions) -->
            ${t.length>0?u`
              <button
                class="font-mono text-xs px-3 py-1.5 rounded-md border transition-all duration-200 border-status-error bg-status-error/10 text-status-error hover:bg-status-error/20 hover:shadow-glow-error-sm active:scale-95"
                id="kill-all-button"
                @click=${()=>this.dispatchEvent(new CustomEvent("kill-all-sessions"))}
                data-testid="kill-all-button"
              >
                Kill All
              </button>
            `:""}
          </div>
        </div>
      </div>
    `}};d([C({type:Array})],_e.prototype,"sessions",2),d([C({type:Boolean})],_e.prototype,"loading",2),d([C({type:Boolean})],_e.prototype,"hideExited",2),d([C({type:Object})],_e.prototype,"authClient",2),d([C({type:String})],_e.prototype,"selectedSessionId",2),d([C({type:Boolean})],_e.prototype,"compactMode",2),d([_()],_e.prototype,"cleaningExited",2),d([_()],_e.prototype,"repoFollowMode",2),d([_()],_e.prototype,"loadingFollowMode",2),d([_()],_e.prototype,"showFollowDropdown",2),d([_()],_e.prototype,"repoWorktrees",2),d([_()],_e.prototype,"loadingWorktrees",2),d([_()],_e.prototype,"showWorktreeDropdown",2),_e=d([D("session-list")],_e);q();var Wn=P("keyboard-capture-indicator"),ht=class extends R{constructor(){super(...arguments);this.active=!0;this.isMobile=!1;this.animating=!1;this.lastCapturedShortcut="";this.showDynamicTooltip=!1;this.isHovered=!1;this.isMacOS=navigator.platform.toLowerCase().includes("mac");this.handleShortcutCaptured=e=>{let{shortcut:t,browserAction:s,terminalAction:n}=e.detail;this.lastCapturedShortcut=this.formatShortcutInfo(t,s,n),this.animating=!0,this.showDynamicTooltip=!0,this.animationTimeout&&clearTimeout(this.animationTimeout),this.tooltipTimeout&&clearTimeout(this.tooltipTimeout),this.animationTimeout=window.setTimeout(()=>{this.animating=!1},400),this.tooltipTimeout=window.setTimeout(()=>{this.showDynamicTooltip=!1},3e3)}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),window.addEventListener("shortcut-captured",this.handleShortcutCaptured)}willUpdate(e){e.has("active")&&Wn.log(`Keyboard capture indicator updated: ${this.active?"ON":"OFF"}`)}disconnectedCallback(){super.disconnectedCallback(),window.removeEventListener("shortcut-captured",this.handleShortcutCaptured),this.animationTimeout&&clearTimeout(this.animationTimeout),this.tooltipTimeout&&clearTimeout(this.tooltipTimeout)}formatShortcutInfo(e,t,s){return`"${e}" \u2192 Terminal: ${s} (not Browser: ${t})`}handleClick(){let e=!this.active;this.dispatchEvent(new CustomEvent("capture-toggled",{detail:{active:e},bubbles:!0,composed:!0})),Wn.log(`Keyboard capture toggle requested: ${e?"enable":"disable"}`)}getOSSpecificShortcuts(){return this.isMacOS?[{key:"Cmd+1...9",desc:"Switch to session 1 to 9"},{key:"Cmd+0",desc:"Switch to session 10"},{key:"Cmd+A",desc:"Line start (not select all)"},{key:"Cmd+E",desc:"Line end"},{key:"Cmd+R",desc:"History search (not reload)"},{key:"Cmd+L",desc:"Clear screen (not address bar)"},{key:"Cmd+D",desc:"EOF/Exit (not bookmark)"},{key:"Cmd+F",desc:"Forward char (not find)"},{key:"Cmd+P",desc:"Previous cmd (not print)"},{key:"Cmd+U",desc:"Delete to start (not view source)"},{key:"Cmd+K",desc:"Delete to end (not search bar)"},{key:"Option+D",desc:"Delete word forward"}]:[{key:"Ctrl+1...9",desc:"Switch to session 1 to 9"},{key:"Ctrl+0",desc:"Switch to session 10"},{key:"Ctrl+A",desc:"Line start (not select all)"},{key:"Ctrl+E",desc:"Line end"},{key:"Ctrl+R",desc:"History search (not reload)"},{key:"Ctrl+L",desc:"Clear screen (not address bar)"},{key:"Ctrl+D",desc:"EOF/Exit (not bookmark)"},{key:"Ctrl+F",desc:"Forward char (not find)"},{key:"Ctrl+P",desc:"Previous cmd (not print)"},{key:"Ctrl+U",desc:"Delete to start (not view source)"},{key:"Ctrl+K",desc:"Delete to end (not search bar)"},{key:"Alt+D",desc:"Delete word forward"}]}renderKeyboardIcon(){return u`
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="7" cy="10" r="1"/>
        <circle cx="12" cy="10" r="1"/>
        <circle cx="17" cy="10" r="1"/>
        <circle cx="7" cy="14" r="1"/>
        <rect x="9" y="13" width="6" height="2" rx="1"/>
        <circle cx="17" cy="14" r="1"/>
      </svg>
    `}render(){if(this.isMobile)return u``;let e=`
      bg-bg-tertiary border border-border rounded-lg p-2 font-mono 
      transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary 
      hover:shadow-sm flex-shrink-0
      ${this.active?"text-primary":"text-muted"}
      ${this.animating?"animating":""}
    `.trim(),t=this.showDynamicTooltip&&this.lastCapturedShortcut?u`<div class="tooltip dynamic">${this.lastCapturedShortcut}</div>`:u`
          <div class="tooltip">
            <div>
              <strong>Keyboard Capture ${this.active?"ON":"OFF"}</strong>
            </div>
            <div style="margin-top: 0.5em;">
              ${this.active?"Terminal receives priority for shortcuts":"Browser shortcuts work normally"}
            </div>
            <div style="margin-top: 0.5em;">
              Double-tap <span class="shortcut-key">Escape</span> to toggle
            </div>
            ${this.active?u`
              <div class="shortcut-list">
                <div style="margin-bottom: 0.5em; font-weight: bold;">Captured for terminal:</div>
                ${this.getOSSpecificShortcuts().map(({key:s,desc:n})=>u`
                  <div class="shortcut-item">
                    <span class="shortcut-key">${s}</span>
                    <span class="shortcut-desc">${n}</span>
                  </div>
                `)}
              </div>
            `:""}
          </div>
        `;return u`
      <div 
        class="relative flex-shrink-0"
        @mouseenter=${()=>{this.isHovered=!0}}
        @mouseleave=${()=>{this.isHovered=!1}}
      >
        <button 
          class="${e}"
          @click=${this.handleClick}
        >
          ${this.renderKeyboardIcon()}
        </button>
        ${this.isHovered?u`
          <div 
            style="
              position: absolute;
              top: 100%;
              left: 50%;
              transform: translateX(-50%);
              margin-top: 0.5em;
              padding: 0.75em 1em;
              background: #1a1a1a;
              color: #e0e0e0;
              border: 1px solid #333;
              border-radius: 0.25em;
              font-size: 0.875em;
              white-space: normal;
              z-index: 1000;
              max-width: 300px;
              width: 300px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            "
          >
            <div>
              <strong>Keyboard Capture ${this.active?"ON":"OFF"}</strong>
            </div>
            <div style="margin-top: 0.5em;">
              ${this.active?"Terminal receives priority for shortcuts":"Browser shortcuts work normally"}
            </div>
            <div style="margin-top: 0.5em;">
              Double-tap <strong>Escape</strong> to toggle
            </div>
            ${this.active?u`
              <div style="margin-top: 0.5em; padding-top: 0.5em; border-top: 1px solid #333;">
                <div style="margin-bottom: 0.5em; font-weight: bold;">Captured for terminal:</div>
                ${this.getOSSpecificShortcuts().map(({key:s,desc:n})=>u`
                  <div style="display: flex; justify-content: space-between; gap: 1em; margin: 0.25em 0; font-family: monospace;">
                    <span style="font-weight: bold;">${s}</span>
                    <span style="color: #999;">${n}</span>
                  </div>
                `)}
              </div>
            `:""}
          </div>
        `:""}
      </div>
    `}};d([C({type:Boolean})],ht.prototype,"active",2),d([C({type:Boolean})],ht.prototype,"isMobile",2),d([_()],ht.prototype,"animating",2),d([_()],ht.prototype,"lastCapturedShortcut",2),d([_()],ht.prototype,"showDynamicTooltip",2),d([_()],ht.prototype,"isHovered",2),ht=d([D("keyboard-capture-indicator")],ht);var wi=class extends R{constructor(){super(...arguments);this.session=null;this.detailed=!1}createRenderRoot(){return this}updated(e){if(super.updated(e),e.has("session")){let t=e.get("session");t?.gitRepoPath!==this.session?.gitRepoPath&&console.debug("[GitStatusBadge] Git repo path changed",{oldGitRepoPath:t?.gitRepoPath,newGitRepoPath:this.session?.gitRepoPath,oldId:t?.id,newId:this.session?.id})}}render(){if(!this.session?.gitRepoPath)return console.debug("[GitStatusBadge] Not rendering - no gitRepoPath",this.session),null;let e=(this.session?.gitModifiedCount??0)>0||(this.session?.gitAddedCount??0)>0||(this.session?.gitDeletedCount??0)>0,t=(this.session?.gitAheadCount??0)>0||(this.session?.gitBehindCount??0)>0;return u`
      <div class="flex items-center gap-1.5 text-xs">
        ${this.renderBranchInfo()}
        ${this.renderLocalChanges()}
        ${this.renderRemoteChanges()}
      </div>
    `}renderBranchInfo(){let e=this.session?.gitBranch||"git",t=this.session?.gitIsWorktree||!1;return u`
      <span class="text-muted-foreground">
        [${e}${t?" \u2022":""}]
      </span>
    `}renderLocalChanges(){if(!this.session)return null;let e=this.session?.gitAddedCount??0,t=this.session?.gitModifiedCount??0,s=this.session?.gitDeletedCount??0,n=e+t+s;return n===0&&!this.detailed?null:this.detailed?u`
        <span class="flex items-center gap-1">
          ${e>0?u`
            <span class="text-green-600 dark:text-green-400" title="New files">
              +${e}
            </span>
          `:null}
          ${t>0?u`
            <span class="text-yellow-600 dark:text-yellow-400" title="Modified files">
              ~${t}
            </span>
          `:null}
          ${s>0?u`
            <span class="text-red-600 dark:text-red-400" title="Deleted files">
              -${s}
            </span>
          `:null}
        </span>
      `:u`
        <span class="text-yellow-600 dark:text-yellow-400" title="${e} new, ${t} modified, ${s} deleted">
          ●${n}
        </span>
      `}renderRemoteChanges(){if(!this.session)return null;let e=this.session?.gitAheadCount??0,t=this.session?.gitBehindCount??0;return e===0&&t===0?null:u`
      <span class="flex items-center gap-0.5">
        ${e>0?u`
          <span class="text-green-600 dark:text-green-400" title="Commits ahead">
            ↑${e}
          </span>
        `:null}
        ${t>0?u`
          <span class="text-red-600 dark:text-red-400" title="Commits behind">
            ↓${t}
          </span>
        `:null}
      </span>
    `}};d([C({type:Object})],wi.prototype,"session",2),d([C({type:Boolean})],wi.prototype,"detailed",2),wi=d([D("git-status-badge")],wi);Me();q();var fe=class extends R{constructor(){super(...arguments);this.session=null;this.widthLabel="";this.widthTooltip="";this.currentTheme="system";this.macAppConnected=!1;this.hasGitRepo=!1;this.viewMode="terminal";this.showMenu=!1;this.focusedIndex=-1;this.handleOutsideClick=e=>{e.composedPath().includes(this)||(this.showMenu=!1,this.focusedIndex=-1)};this.handleKeyDown=e=>{this.showMenu&&(e.key==="Escape"?(e.preventDefault(),this.showMenu=!1,this.focusedIndex=-1,this.querySelector('button[aria-label="More actions menu"]')?.focus()):e.key==="ArrowDown"||e.key==="ArrowUp"?(e.preventDefault(),this.navigateMenu(e.key==="ArrowDown"?1:-1)):e.key==="Enter"&&this.focusedIndex>=0&&(e.preventDefault(),this.selectFocusedItem()))};this.handleMenuButtonKeyDown=e=>{if(e.key==="ArrowDown"&&this.showMenu){e.preventDefault(),this.focusedIndex=0;let t=this.getMenuItems();t[0]&&t[0].focus()}}}createRenderRoot(){return this}toggleMenu(e){e.stopPropagation(),this.showMenu=!this.showMenu,this.showMenu||(this.focusedIndex=-1)}handleAction(e){e&&(this.showMenu=!1,this.focusedIndex=-1,setTimeout(()=>{e()},50))}handleThemeChange(){let e=["light","dark","system"],s=(e.indexOf(this.currentTheme)+1)%e.length,n=e[s];this.currentTheme=n,localStorage.setItem("vibetunnel-theme",n);let o=document.documentElement,r=window.matchMedia("(prefers-color-scheme: dark)"),a;n==="system"?a=r.matches?"dark":"light":a=n,o.setAttribute("data-theme",a);let m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute("content",a==="dark"?"#0a0a0a":"#fafafa"),this.dispatchEvent(new CustomEvent("theme-changed",{detail:{theme:n},bubbles:!0,composed:!0})),this.showMenu=!1,this.focusedIndex=-1}getThemeIcon(){switch(this.currentTheme){case"light":return u`<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>
        </svg>`;case"dark":return u`<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
        </svg>`;case"system":return u`<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"/>
        </svg>`}}getThemeLabel(){return this.currentTheme.charAt(0).toUpperCase()+this.currentTheme.slice(1)}connectedCallback(){super.connectedCallback(),document.addEventListener("click",this.handleOutsideClick),document.addEventListener("keydown",this.handleKeyDown);let e=localStorage.getItem("vibetunnel-theme");this.currentTheme=e||"system"}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("click",this.handleOutsideClick),document.removeEventListener("keydown",this.handleKeyDown)}navigateMenu(e){let t=this.getMenuItems();if(t.length===0)return;let s=this.focusedIndex+e;s<0?s=t.length-1:s>=t.length&&(s=0),this.focusedIndex=s;let n=t[s];n&&n.focus()}getMenuItems(){return this.showMenu?Array.from(this.querySelectorAll("button[data-testid]")).filter(t=>t.tagName==="BUTTON"):[]}selectFocusedItem(){let t=this.getMenuItems()[this.focusedIndex];t&&t.click()}render(){return u`
      <div class="relative w-[44px] flex-shrink-0">
        <button
          class="p-2 bg-bg-tertiary border ${this.showMenu?"text-primary border-primary":"text-primary border-border"} hover:border-primary hover:text-primary hover:bg-surface-hover rounded-lg transition-all duration-200"
          @click=${this.toggleMenu}
          @keydown=${this.handleMenuButtonKeyDown}
          title="More actions"
          aria-label="More actions menu"
          aria-expanded=${this.showMenu}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        
        ${this.showMenu?this.renderDropdown():j}
      </div>
    `}renderDropdown(){let e=0;return u`
      <div 
        class="absolute right-0 top-full mt-2 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[250px]"
        style="z-index: ${ie.WIDTH_SELECTOR_DROPDOWN};"
      >
        
        <!-- New Session -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleAction(this.onCreateSession)}
          data-testid="compact-new-session"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2Z" clip-rule="evenodd"/>
          </svg>
          New Session
        </button>
        
        <div class="border-t border-border my-1"></div>
        
        <!-- File Browser -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleAction(this.onOpenFileBrowser)}
          data-testid="compact-file-browser"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v1h4c.966 0 1.75.784 1.75 1.75v7.75A1.75 1.75 0 0113 15H3a1.75 1.75 0 01-1.75-1.75V2.75C1.25 1.784 1.784 1 1.75 1zM2.75 2.5v10.75c0 .138.112.25.25.25h10a.25.25 0 00.25-.25V5.5a.25.25 0 00-.25-.25H8.75v-2.5a.25.25 0 00-.25-.25h-5.5a.25.25 0 00-.25.25z"/>
          </svg>
          Browse Files
        </button>
        
        <!-- Upload Image -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleAction(this.onUploadImage)}
          data-testid="compact-upload-image"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 2h-13C.67 2 0 2.67 0 3.5v9c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zM5.5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM13 11H3l2.5-3L7 10l2.5-3L13 11z"/>
          </svg>
          Upload Image
        </button>
        
        <!-- Width Settings -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleAction(this.onMaxWidthToggle)}
          data-testid="compact-width-settings"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z"/>
          </svg>
          Width: ${this.widthLabel}
        </button>
        
        <!-- Git Worktree Toggle (only for git repos) -->
        ${this.hasGitRepo?u`
              <button
                class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
                @click=${()=>this.handleAction(this.onToggleViewMode)}
                data-testid="compact-worktree-toggle"
                tabindex="${this.showMenu?"0":"-1"}"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                </svg>
                ${this.viewMode==="terminal"?"Show Worktrees":"Show Terminal"}
              </button>
            `:j}
        
        <!-- Theme Toggle -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleThemeChange()}
          data-testid="compact-theme-toggle"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          ${this.getThemeIcon()}
          Theme: ${this.getThemeLabel()}
        </button>
        
        <!-- Settings -->
        <button
          class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
          @click=${()=>this.handleAction(this.onOpenSettings)}
          data-testid="compact-settings"
          tabindex="${this.showMenu?"0":"-1"}"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
          </svg>
          Settings
        </button>
        
        ${this.session?u`
          <div class="border-t border-border my-1"></div>
          
          <!-- Session Actions -->
          ${this.session.status==="running"?u`
            <button
              class="w-full text-left px-4 py-3 text-sm font-mono text-status-error hover:bg-surface-hover flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover":""}"
              @click=${()=>this.handleAction(this.onTerminateSession)}
              data-testid="compact-terminate-session"
              tabindex="${this.showMenu?"0":"-1"}"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM4.5 7.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7z"/>
              </svg>
              Terminate Session
            </button>
          `:u`
            <button
              class="w-full text-left px-4 py-3 text-sm font-mono text-text-muted hover:bg-surface-hover hover:text-primary flex items-center gap-3 ${this.focusedIndex===e++?"bg-surface-hover text-primary":""}"
              @click=${()=>this.handleAction(this.onClearSession)}
              data-testid="compact-clear-session"
              tabindex="${this.showMenu?"0":"-1"}"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
              Clear Session
            </button>
          `}
        `:j}
      </div>
    `}};d([C({type:Object})],fe.prototype,"session",2),d([C({type:String})],fe.prototype,"widthLabel",2),d([C({type:String})],fe.prototype,"widthTooltip",2),d([C({type:Function})],fe.prototype,"onCreateSession",2),d([C({type:Function})],fe.prototype,"onOpenFileBrowser",2),d([C({type:Function})],fe.prototype,"onUploadImage",2),d([C({type:Function})],fe.prototype,"onMaxWidthToggle",2),d([C({type:Function})],fe.prototype,"onOpenSettings",2),d([C({type:String})],fe.prototype,"currentTheme",2),d([C({type:Boolean})],fe.prototype,"macAppConnected",2),d([C({type:Function})],fe.prototype,"onTerminateSession",2),d([C({type:Function})],fe.prototype,"onClearSession",2),d([C({type:Boolean})],fe.prototype,"hasGitRepo",2),d([C({type:String})],fe.prototype,"viewMode",2),d([C({type:Function})],fe.prototype,"onToggleViewMode",2),d([_()],fe.prototype,"showMenu",2),d([_()],fe.prototype,"focusedIndex",2),fe=d([D("compact-menu")],fe);var Zo=50,Ye=class extends R{constructor(){super(...arguments);this.isMobile=!1;this.hasCamera=!1;this.showMenu=!1;this.focusedIndex=-1;this.hasClipboardImage=!1;this.handleOutsideClick=e=>{e.composedPath().includes(this)||(this.showMenu=!1,this.focusedIndex=-1)};this.handleKeyDown=e=>{this.showMenu&&(e.key==="Escape"?(e.preventDefault(),this.showMenu=!1,this.focusedIndex=-1,this.querySelector('button[aria-label="Upload image menu"]')?.focus()):e.key==="ArrowDown"||e.key==="ArrowUp"?(e.preventDefault(),this.navigateMenu(e.key==="ArrowDown"?1:-1)):e.key==="Enter"&&this.focusedIndex>=0&&(e.preventDefault(),this.selectFocusedItem()))};this.handleMenuButtonKeyDown=e=>{if(e.key==="ArrowDown"&&this.showMenu){e.preventDefault(),this.focusedIndex=0;let t=this.getMenuItems();t[0]&&t[0].focus()}}}createRenderRoot(){return this}toggleMenu(e){e.stopPropagation(),this.showMenu=!this.showMenu,this.showMenu?this.checkClipboardContent():this.focusedIndex=-1}handleAction(e){e&&(this.showMenu=!1,this.focusedIndex=-1,setTimeout(()=>{e()},Zo))}connectedCallback(){super.connectedCallback(),document.addEventListener("click",this.handleOutsideClick),document.addEventListener("keydown",this.handleKeyDown),this.checkCameraAvailability()}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("click",this.handleOutsideClick),document.removeEventListener("keydown",this.handleKeyDown),this.showMenu&&(this.showMenu=!1,this.focusedIndex=-1)}async checkCameraAvailability(){try{let e=await navigator.mediaDevices.enumerateDevices();this.hasCamera=e.some(t=>t.kind==="videoinput")}catch{this.hasCamera=!1}}async checkClipboardContent(){try{if(!navigator.clipboard||!navigator.clipboard.read){this.hasClipboardImage=!1;return}let e=await navigator.clipboard.read();for(let t of e)if(t.types.some(n=>n.startsWith("image/"))){this.hasClipboardImage=!0;return}this.hasClipboardImage=!1}catch{this.hasClipboardImage=!1}}navigateMenu(e){let t=this.getMenuItems();if(t.length===0)return;let s=this.focusedIndex+e;s<0?s=t.length-1:s>=t.length&&(s=0),this.focusedIndex=s;let n=t[s];n&&n.focus()}getMenuItems(){return this.showMenu?Array.from(this.querySelectorAll("button[data-action]")).filter(t=>t.tagName==="BUTTON"):[]}selectFocusedItem(){let t=this.getMenuItems()[this.focusedIndex];t&&t.click()}getAvailableMenuItems(){let e=[];return this.hasClipboardImage&&e.push({id:"paste",label:"Paste from Clipboard",ariaLabel:"Paste image from clipboard",action:()=>this.handleAction(this.onPasteImage),icon:u`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M5.75 1a.75.75 0 00-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75h-4.5zM6.5 4V2.5h3V4h-3z"/>
          <path d="M1.75 5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h12.5a.75.75 0 00.75-.75v-8.5a.75.75 0 00-.75-.75H11v1.5h2.5v6.5h-11v-6.5H5V5H1.75z"/>
          <path d="M8.5 9.5a.5.5 0 10-1 0V11H6a.5.5 0 000 1h1.5v1.5a.5.5 0 001 0V12H10a.5.5 0 000-1H8.5V9.5z"/>
        </svg>`}),e.push({id:"select",label:"Select Image",ariaLabel:"Select image from device",action:()=>this.handleAction(this.onSelectImage),icon:u`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M14.5 2h-13C.67 2 0 2.67 0 3.5v9c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zM5.5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM13 11H3l2.5-3L7 10l2.5-3L13 11z"/>
      </svg>`}),this.isMobile&&this.hasCamera&&e.push({id:"camera",label:"Camera",ariaLabel:"Take photo with camera",action:()=>this.handleAction(this.onOpenCamera),icon:u`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M10.5 2.5a.5.5 0 00-.5-.5H6a.5.5 0 00-.5.5V3H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-2.5v-.5zM6.5 3h3v.5h-3V3zM13 4a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h10z"/>
          <path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM6 8a2 2 0 114 0 2 2 0 01-4 0z"/>
        </svg>`}),(this.hasClipboardImage||this.isMobile&&this.hasCamera)&&e.push({id:"divider",isDivider:!0}),e.push({id:"browse",label:"Browse Files",ariaLabel:"Browse files on device",action:()=>this.handleAction(this.onBrowseFiles),icon:u`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v1h4c.966 0 1.75.784 1.75 1.75v7.75A1.75 1.75 0 0113 15H3a1.75 1.75 0 01-1.75-1.75V2.75C1.25 1.784 1.784 1 1.75 1zM2.75 2.5v10.75c0 .138.112.25.25.25h10a.25.25 0 00.25-.25V5.5a.25.25 0 00-.25-.25H8.75v-2.5a.25.25 0 00-.25-.25h-5.5a.25.25 0 00-.25.25z"/>
      </svg>`}),e}render(){return u`
      <div class="relative">
        <vt-tooltip content="Upload Image (⌘U)" .show=${!this.isMobile}>
          <button
            class="bg-bg-tertiary border border-border rounded-lg p-2 font-mono text-text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary hover:shadow-sm flex-shrink-0"
            @click=${this.toggleMenu}
            @keydown=${this.handleMenuButtonKeyDown}
            title="Upload Image"
            aria-label="Upload image menu"
            aria-expanded=${this.showMenu}
            data-testid="image-upload-button"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14.5 2h-13C.67 2 0 2.67 0 3.5v9c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zM5.5 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM13 11H3l2.5-3L7 10l2.5-3L13 11z"/>
            </svg>
          </button>
        </vt-tooltip>
        
        ${this.showMenu?this.renderDropdown():j}
      </div>
    `}renderDropdown(){let e=this.getAvailableMenuItems(),t=0;return u`
      <div 
        class="absolute right-0 top-full mt-2 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[240px]"
        style="z-index: ${ie.WIDTH_SELECTOR_DROPDOWN};"
      >
        ${e.map(s=>{if(s.isDivider)return u`<div class="border-t border-border my-1"></div>`;let n=t++;return u`
            <button
              class="w-full text-left px-4 py-3 text-sm font-mono text-primary hover:bg-secondary hover:text-primary flex items-center gap-3 ${this.focusedIndex===n?"bg-secondary text-primary":""}"
              @click=${s.action}
              data-action=${s.id}
              tabindex="${this.showMenu?"0":"-1"}"
              aria-label=${s.ariaLabel}
            >
              ${s.icon}
              ${s.label}
            </button>
          `})}
      </div>
    `}};d([C({type:Function})],Ye.prototype,"onPasteImage",2),d([C({type:Function})],Ye.prototype,"onSelectImage",2),d([C({type:Function})],Ye.prototype,"onOpenCamera",2),d([C({type:Function})],Ye.prototype,"onBrowseFiles",2),d([C({type:Boolean})],Ye.prototype,"isMobile",2),d([C({type:Boolean})],Ye.prototype,"hasCamera",2),d([_()],Ye.prototype,"showMenu",2),d([_()],Ye.prototype,"focusedIndex",2),d([_()],Ye.prototype,"hasClipboardImage",2),Ye=d([D("image-upload-menu")],Ye);var yt=class extends R{constructor(){super(...arguments);this.session=null;this.showMenu=!1;this.focusedIndex=-1;this.handleOutsideClick=e=>{e.composedPath().includes(this)||(this.showMenu=!1,this.focusedIndex=-1)};this.handleKeyDown=e=>{this.showMenu&&(e.key==="Escape"?(e.preventDefault(),this.showMenu=!1,this.focusedIndex=-1,this.querySelector('button[aria-label="Session actions menu"]')?.focus()):e.key==="ArrowDown"||e.key==="ArrowUp"?(e.preventDefault(),this.navigateMenu(e.key==="ArrowDown"?1:-1)):e.key==="Enter"&&this.focusedIndex>=0&&(e.preventDefault(),this.selectFocusedItem()))};this.handleMenuButtonKeyDown=e=>{if(e.key==="ArrowDown"&&this.showMenu){e.preventDefault(),this.focusedIndex=0;let t=this.getMenuItems();t[0]&&t[0].focus()}}}createRenderRoot(){return this}toggleMenu(e){e.stopPropagation(),this.showMenu=!this.showMenu,this.showMenu||(this.focusedIndex=-1)}handleAction(e){e&&(this.showMenu=!1,this.focusedIndex=-1,setTimeout(()=>{e()},50))}connectedCallback(){super.connectedCallback(),document.addEventListener("click",this.handleOutsideClick),document.addEventListener("keydown",this.handleKeyDown)}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("click",this.handleOutsideClick),document.removeEventListener("keydown",this.handleKeyDown)}navigateMenu(e){let t=this.getMenuItems();if(t.length===0)return;let s=this.focusedIndex+e;s<0?s=t.length-1:s>=t.length&&(s=0),this.focusedIndex=s;let n=t[s];n&&n.focus()}getMenuItems(){return this.showMenu?Array.from(this.querySelectorAll("button[data-action]")).filter(t=>t.tagName==="BUTTON"):[]}selectFocusedItem(){let t=this.getMenuItems()[this.focusedIndex];t&&t.click()}getStatusText(){return this.session?"active"in this.session&&this.session.active===!1?"waiting":this.session.status:""}getStatusColor(){return!this.session||"active"in this.session&&this.session.active===!1?"text-muted":this.session.status==="running"?"text-status-success":"text-status-warning"}getStatusDotColor(){return!this.session||"active"in this.session&&this.session.active===!1?"bg-muted":this.session.status==="running"?"bg-status-success":"bg-status-warning"}render(){if(!this.session)return null;let e=this.session.status==="running",t=this.getStatusText();return u`
      <div class="relative">
        <button
          class="flex items-center gap-2 bg-bg-tertiary border border-border rounded-lg px-3 py-2 transition-all duration-200 hover:bg-surface-hover hover:border-primary hover:shadow-sm ${this.showMenu?"border-primary shadow-sm":""}"
          @click=${this.toggleMenu}
          @keydown=${this.handleMenuButtonKeyDown}
          title="${e?"Running - Click for actions":"Exited - Click for actions"}"
          aria-label="Session actions menu"
          aria-expanded=${this.showMenu}
        >
          <span class="text-xs flex items-center gap-2 font-medium ${this.getStatusColor()}">
            <div class="relative">
              <div class="w-2 h-2 rounded-full ${this.getStatusDotColor()}"></div>
              ${t==="running"?u`<div class="absolute inset-0 w-2 h-2 rounded-full bg-status-success animate-ping opacity-50"></div>`:""}
            </div>
            ${t.toUpperCase()}
          </span>
          <!-- Dropdown arrow -->
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            class="transition-transform text-text-muted ${this.showMenu?"rotate-180":""}"
          >
            <path d="M5 7L1 3h8z" />
          </svg>
        </button>
        
        ${this.showMenu?this.renderDropdown(e):j}
      </div>
    `}renderDropdown(e){let t=0;return u`
      <div 
        class="absolute right-0 top-full mt-2 bg-surface border border-border rounded-lg shadow-xl py-1 min-w-[250px]"
        style="z-index: ${ie.WIDTH_SELECTOR_DROPDOWN};"
      >
        ${e?u`
            <button
              class="w-full text-left px-6 py-3 text-sm font-mono text-status-error hover:bg-bg-secondary flex items-center gap-3 ${this.focusedIndex===t++?"bg-bg-secondary":""}"
              @click=${()=>this.handleAction(this.onTerminate)}
              data-action="terminate"
              tabindex="${this.showMenu?"0":"-1"}"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM4.5 7.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7z"/>
              </svg>
              Terminate Session
            </button>
          `:u`
            <button
              class="w-full text-left px-6 py-3 text-sm font-mono text-text-muted hover:bg-bg-secondary hover:text-primary flex items-center gap-3 ${this.focusedIndex===t++?"bg-bg-secondary text-primary":""}"
              @click=${()=>this.handleAction(this.onClear)}
              data-action="clear"
              tabindex="${this.showMenu?"0":"-1"}"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
              </svg>
              Clear Session
            </button>
          `}
      </div>
    `}};d([C({type:Object})],yt.prototype,"session",2),d([C({type:Function})],yt.prototype,"onTerminate",2),d([C({type:Function})],yt.prototype,"onClear",2),d([_()],yt.prototype,"showMenu",2),d([_()],yt.prototype,"focusedIndex",2),yt=d([D("session-status-dropdown")],yt);var Kn=P("session-header"),te=class extends R{constructor(){super(...arguments);this.session=null;this.showBackButton=!0;this.showSidebarToggle=!1;this.sidebarCollapsed=!1;this.terminalMaxCols=0;this.terminalFontSize=14;this.customWidth="";this.showWidthSelector=!1;this.widthLabel="";this.widthTooltip="";this.currentTheme="system";this.keyboardCaptureActive=!0;this.isMobile=!1;this.macAppConnected=!1;this.hasGitRepo=!1;this.viewMode="terminal";this.isHovered=!1;this.useCompactMenu=!1;this.handleMouseEnter=()=>{this.isHovered=!0};this.handleMouseLeave=()=>{this.isHovered=!1}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback();let e=localStorage.getItem("vibetunnel-theme");this.currentTheme=e||"system",this.setupResizeObserver()}disconnectedCallback(){super.disconnectedCallback(),this.resizeObserver&&this.resizeObserver.disconnect()}updated(e){super.updated(e)}setupResizeObserver(){this.resizeObserver=new ResizeObserver(e=>{for(let t of e)this.checkButtonSpace(t.contentRect.width)}),this.updateComplete.then(()=>{requestAnimationFrame(()=>{let e=this.querySelector(".session-header-container");if(e){this.resizeObserver?.observe(e);let t=e.clientWidth;this.checkButtonSpace(t)}})})}checkButtonSpace(e){let w=300+(this.showSidebarToggle&&this.sidebarCollapsed?56:0)+100+392+48,l=e<w+150;l!==this.useCompactMenu&&(this.useCompactMenu=l,this.requestUpdate())}getStatusText(){return this.session?"active"in this.session&&this.session.active===!1?"waiting":this.session.status:""}getStatusDotColor(){return!this.session||"active"in this.session&&this.session.active===!1?"bg-bg-muted":this.session.status==="running"?"bg-status-success":"bg-status-warning"}render(){return this.session?u`
      <!-- Header content -->
      <div
        class="flex items-center justify-between border-b border-border text-sm min-w-0 bg-bg-secondary px-4 py-2 session-header-container"
        style="padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right));"
      >
        <div class="flex items-center gap-3 min-w-0 flex-1 overflow-hidden flex-shrink">
          <!-- Sidebar Toggle (when sidebar is collapsed) - visible on all screen sizes -->
          ${this.showSidebarToggle&&this.sidebarCollapsed?u`
                <button
                  class="bg-bg-tertiary border border-border rounded-md p-2 text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${()=>this.onSidebarToggle?.()}
                  title="Show sidebar (⌘B)"
                  aria-label="Show sidebar"
                  aria-expanded="false"
                  aria-controls="sidebar"
                >
                  <!-- Right chevron icon to expand sidebar -->
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/>
                  </svg>
                </button>
                
                <!-- Go to Root button (desktop only) -->
                <button
                  class="hidden sm:flex bg-bg-tertiary border border-border text-primary rounded-md p-2 transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${()=>{window.location.href="/"}}
                  title="Go to root"
                  data-testid="go-to-root-button"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <!-- Four small rounded rectangles icon -->
                    <rect x="3" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="11" y="3" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="3" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
                    <rect x="11" y="11" width="6" height="6" rx="1.5" ry="1.5"/>
                  </svg>
                </button>
                
                <!-- Create Session button (desktop only) -->
                <button
                  class="hidden sm:flex bg-bg-tertiary border border-border text-primary rounded-md p-2 transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${()=>this.onCreateSession?.()}
                  title="Create New Session (⌘K)"
                  data-testid="create-session-button"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
                  </svg>
                </button>
              `:""}
          
          <!-- Status dot - visible on mobile, after sidebar toggle -->
          <div class="sm:hidden relative flex-shrink-0">
            <div class="w-2.5 h-2.5 rounded-full ${this.getStatusDotColor()}"></div>
            ${this.getStatusText()==="running"?u`<div class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-status-success animate-ping opacity-50"></div>`:""}
          </div>
          ${this.showBackButton?u`
                <button
                  class="bg-bg-tertiary border border-border rounded-md px-3 py-1.5 font-mono text-xs text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                  @click=${()=>this.onBack?.()}
                >
                  Back
                </button>
              `:""}
          <div class="text-primary min-w-0 flex-1 overflow-hidden">
            <div class="text-bright font-medium text-xs sm:text-sm min-w-0 overflow-hidden">
              <div class="flex items-center gap-1 min-w-0 overflow-hidden" @mouseenter=${this.handleMouseEnter} @mouseleave=${this.handleMouseLeave}>
                <inline-edit
                  class="min-w-0 overflow-hidden block max-w-xs sm:max-w-md"
                  .value=${this.session.name||(Array.isArray(this.session.command)?this.session.command.join(" "):this.session.command)}
                  .placeholder=${Array.isArray(this.session.command)?this.session.command.join(" "):this.session.command}
                  .onSave=${e=>this.handleRename(e)}
                ></inline-edit>
                ${_s(this.session)?u`
                      <button
                        class="bg-transparent border-0 p-0 cursor-pointer transition-opacity duration-200 text-primary magic-button flex-shrink-0 ${this.isHovered?"opacity-50 hover:opacity-100":"opacity-0"} ml-1"
                        @click=${e=>{e.stopPropagation(),this.handleMagicButton()}}
                        title="Send prompt to update terminal title"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <!-- Wand -->
                          <path d="M9.5 21.5L21.5 9.5a1 1 0 000-1.414l-1.086-1.086a1 1 0 00-1.414 0L7 19l2.5 2.5z" opacity="0.9"/>
                          <path d="M6 18l-1.5 3.5a.5.5 0 00.7.7L8.5 21l-2.5-3z" opacity="0.9"/>
                          <!-- Sparkles/Rays -->
                          <circle cx="8" cy="4" r="1"/>
                          <circle cx="4" cy="8" r="1"/>
                          <circle cx="16" cy="4" r="1"/>
                          <circle cx="20" cy="8" r="1"/>
                          <circle cx="12" cy="2" r=".5"/>
                          <circle cx="2" cy="12" r=".5"/>
                          <circle cx="22" cy="12" r=".5"/>
                          <circle cx="18" cy="2" r=".5"/>
                        </svg>
                      </button>
                      <style>
                        /* Always show magic button on touch devices */
                        @media (hover: none) and (pointer: coarse) {
                          .magic-button {
                            opacity: 0.5 !important;
                          }
                          .magic-button:hover {
                            opacity: 1 !important;
                          }
                        }
                      </style>
                    `:""}
              </div>
            </div>
            <div class="text-xs opacity-75 mt-0.5 flex items-center gap-2 min-w-0">
              <clickable-path 
                class="truncate"
                .path=${this.session.workingDir} 
                .iconSize=${12}
              ></clickable-path>
              ${this.session.gitRepoPath?u`
                    <git-status-badge
                      class="flex-shrink-0"
                      .session=${this.session}
                      .detailed=${!1}
                    ></git-status-badge>
                  `:""}
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
          <!-- Keyboard capture indicator (always visible) -->
          <keyboard-capture-indicator
            .active=${this.keyboardCaptureActive}
            .isMobile=${this.isMobile}
            @capture-toggled=${e=>{this.dispatchEvent(new CustomEvent("capture-toggled",{detail:e.detail,bubbles:!0,composed:!0}))}}
          ></keyboard-capture-indicator>
          
          <!-- Responsive button container -->
          ${this.useCompactMenu||this.isMobile?u`
              <!-- Compact menu for tight spaces or mobile -->
              <div class="flex flex-shrink-0">
                <compact-menu
                  .session=${this.session}
                  .widthLabel=${this.widthLabel}
                  .widthTooltip=${this.widthTooltip}
                  .onOpenFileBrowser=${this.onOpenFileBrowser}
                  .onUploadImage=${()=>this.handleMobileUploadImage()}
                  .onMaxWidthToggle=${this.onMaxWidthToggle}
                  .onOpenSettings=${this.onOpenSettings}
                  .onCreateSession=${this.onCreateSession}
                  .currentTheme=${this.currentTheme}
                  .macAppConnected=${this.macAppConnected}
                  .onTerminateSession=${this.onTerminateSession}
                  .onClearSession=${this.onClearSession}
                  .hasGitRepo=${this.hasGitRepo}
                  .viewMode=${this.viewMode}
                  .onToggleViewMode=${()=>this.dispatchEvent(new CustomEvent("toggle-view-mode"))}
                  @theme-changed=${e=>{this.currentTheme=e.detail.theme}}
                ></compact-menu>
              </div>
            `:u`
              <!-- Individual buttons for larger screens -->
              <div class="flex items-center gap-2">
                <!-- Git worktree toggle button (visible when session has Git repo) -->
                ${this.hasGitRepo?u`
                      <button
                        class="bg-bg-tertiary border border-border rounded-md p-2 text-primary transition-all duration-200 hover:bg-surface-hover hover:border-primary flex-shrink-0"
                        @click=${()=>this.onToggleViewMode?.()}
                        title="${this.viewMode==="terminal"?"Show Worktrees":"Show Terminal"}"
                        data-testid="worktree-toggle-button"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
                        </svg>
                      </button>
                    `:""}

                <!-- Status dropdown -->
                <session-status-dropdown
                  .session=${this.session}
                  .onTerminate=${this.onTerminateSession}
                  .onClear=${this.onClearSession}
                ></session-status-dropdown>
                
                <!-- Image Upload Menu -->
                <image-upload-menu
                  .onPasteImage=${()=>this.handlePasteImage()}
                  .onSelectImage=${()=>this.handleSelectImage()}
                  .onOpenCamera=${()=>this.handleOpenCamera()}
                  .onBrowseFiles=${()=>this.onOpenFileBrowser?.()}
                  .isMobile=${this.isMobile}
                ></image-upload-menu>
                
                <!-- Theme toggle -->
                <theme-toggle-icon
                  .theme=${this.currentTheme}
                  @theme-changed=${e=>{this.currentTheme=e.detail.theme}}
                ></theme-toggle-icon>
                
                <!-- Settings button -->
                <notification-status
                  @open-settings=${()=>this.onOpenSettings?.()}
                ></notification-status>
                
                
                <!-- Terminal size button -->
                <button
                  class="bg-bg-tertiary border border-border rounded-lg px-3 py-2 font-mono text-xs text-text-muted transition-all duration-200 hover:text-primary hover:bg-surface-hover hover:border-primary hover:shadow-sm flex-shrink-0 width-selector-button"
                  @click=${()=>this.onMaxWidthToggle?.()}
                  title="${this.widthTooltip}"
                >
                  ${this.widthLabel}
                </button>
              </div>
            `}
        </div>
      </div>
    `:null}handleRename(e){this.session&&this.dispatchEvent(new CustomEvent("session-rename",{detail:{sessionId:this.session.id,newName:e},bubbles:!0,composed:!0}))}handleMagicButton(){this.session&&(Kn.log("Magic button clicked for session",this.session.id),Es(this.session.id,N).catch(e=>{Kn.error("Failed to send AI prompt",e)}))}handlePasteImage(){this.dispatchEvent(new CustomEvent("paste-image",{bubbles:!0,composed:!0}))}handleSelectImage(){this.dispatchEvent(new CustomEvent("select-image",{bubbles:!0,composed:!0}))}handleOpenCamera(){this.dispatchEvent(new CustomEvent("open-camera",{bubbles:!0,composed:!0}))}handleMobileUploadImage(){this.dispatchEvent(new CustomEvent("select-image",{bubbles:!0,composed:!0}))}};d([C({type:Object})],te.prototype,"session",2),d([C({type:Boolean})],te.prototype,"showBackButton",2),d([C({type:Boolean})],te.prototype,"showSidebarToggle",2),d([C({type:Boolean})],te.prototype,"sidebarCollapsed",2),d([C({type:Number})],te.prototype,"terminalMaxCols",2),d([C({type:Number})],te.prototype,"terminalFontSize",2),d([C({type:String})],te.prototype,"customWidth",2),d([C({type:Boolean})],te.prototype,"showWidthSelector",2),d([C({type:String})],te.prototype,"widthLabel",2),d([C({type:String})],te.prototype,"widthTooltip",2),d([C({type:Function})],te.prototype,"onBack",2),d([C({type:Function})],te.prototype,"onSidebarToggle",2),d([C({type:Function})],te.prototype,"onOpenFileBrowser",2),d([C({type:Function})],te.prototype,"onCreateSession",2),d([C({type:Function})],te.prototype,"onOpenImagePicker",2),d([C({type:Function})],te.prototype,"onMaxWidthToggle",2),d([C({type:Function})],te.prototype,"onWidthSelect",2),d([C({type:Function})],te.prototype,"onFontSizeChange",2),d([C({type:Function})],te.prototype,"onOpenSettings",2),d([C({type:String})],te.prototype,"currentTheme",2),d([C({type:Boolean})],te.prototype,"keyboardCaptureActive",2),d([C({type:Boolean})],te.prototype,"isMobile",2),d([C({type:Boolean})],te.prototype,"macAppConnected",2),d([C({type:Function})],te.prototype,"onTerminateSession",2),d([C({type:Function})],te.prototype,"onClearSession",2),d([C({type:Boolean})],te.prototype,"hasGitRepo",2),d([C({type:String})],te.prototype,"viewMode",2),d([C({type:Function})],te.prototype,"onToggleViewMode",2),d([_()],te.prototype,"isHovered",2),d([_()],te.prototype,"useCompactMenu",2),te=d([D("session-header")],te);q();var Ui=P("worktree-manager"),Se=class extends R{constructor(){super(...arguments);this.repoPath="";this.worktrees=[];this.baseBranch="main";this.loading=!1;this.error="";this.showDeleteConfirm=!1;this.deleteTargetBranch="";this.deleteHasChanges=!1;this.showCreateWorktree=!1;this.newBranchName="";this.newWorktreePath="";this.useCustomPath=!1;this.isCreatingWorktree=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.repoPath&&this.gitService&&this.loadWorktrees()}willUpdate(e){(e.has("repoPath")||e.has("gitService"))&&this.repoPath&&this.gitService&&this.loadWorktrees()}async loadWorktrees(){if(!(!this.gitService||!this.repoPath)){this.loading=!0,this.error="";try{let e=await this.gitService.listWorktrees(this.repoPath);this.worktrees=e.worktrees,this.baseBranch=e.baseBranch,this.followBranch=e.followBranch}catch(e){Ui.error("Failed to load worktrees:",e),this.error=e instanceof Error?e.message:"Failed to load worktrees"}finally{this.loading=!1}}}async handleSwitchBranch(e){!this.gitService||!this.repoPath||(Ui.log(`Branch switching to ${e} requested, but direct branch switching is not supported. Use worktrees instead.`),this.dispatchEvent(new CustomEvent("error",{detail:{message:`Direct branch switching is no longer supported. Create a worktree for branch '${e}' instead.`}})))}async handleDeleteWorktree(e,t){this.showDeleteConfirm=!0,this.deleteTargetBranch=e,this.deleteHasChanges=t}async confirmDelete(){if(!(!this.gitService||!this.repoPath||!this.deleteTargetBranch))try{await this.gitService.deleteWorktree(this.repoPath,this.deleteTargetBranch,this.deleteHasChanges),this.showDeleteConfirm=!1,this.deleteTargetBranch="",this.deleteHasChanges=!1,await this.loadWorktrees()}catch(e){Ui.error("Failed to delete worktree:",e),this.dispatchEvent(new CustomEvent("error",{detail:{message:`Failed to delete worktree: ${e instanceof Error?e.message:"Unknown error"}`}}))}}cancelDelete(){this.showDeleteConfirm=!1,this.deleteTargetBranch="",this.deleteHasChanges=!1}async handleToggleFollow(e,t){if(this.gitService)try{await this.gitService.setFollowMode(this.repoPath,e,t),await this.loadWorktrees();let s=t?"enabled":"disabled";this.dispatchEvent(new CustomEvent("success",{detail:{message:`Follow mode ${s} for ${e}`},bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("check-git-notifications",{bubbles:!0,composed:!0}))}catch(s){Ui.error("Failed to toggle follow mode:",s),this.dispatchEvent(new CustomEvent("error",{detail:{message:`Failed to toggle follow mode: ${s instanceof Error?s.message:"Unknown error"}`}}))}}formatPath(e){return Pe(e)}async handleCreateWorktree(){let e=this.newBranchName.trim();if(!e||!this.gitService||!this.repoPath)return;let t=this.validateBranchName(e);if(t){this.dispatchEvent(new CustomEvent("error",{detail:{message:t},bubbles:!0,composed:!0}));return}this.isCreatingWorktree=!0;try{let s=this.useCustomPath&&this.newWorktreePath.trim()?this.newWorktreePath.trim():this.generateWorktreePath(e);await this.gitService.createWorktree(this.repoPath,e,s,this.baseBranch),this.showCreateWorktree=!1,this.newBranchName="",this.newWorktreePath="",this.useCustomPath=!1,await this.loadWorktrees(),this.dispatchEvent(new CustomEvent("success",{detail:{message:`Created worktree for branch '${e}'`},bubbles:!0,composed:!0}))}catch(s){Ui.error("Failed to create worktree:",s);let n="Failed to create worktree";s instanceof Error&&(s.message.includes("already exists")?n="Worktree path already exists. Try a different branch name or path.":s.message.includes("already checked out")?n=`Branch '${e}' is already checked out in another worktree`:n=s.message),this.dispatchEvent(new CustomEvent("error",{detail:{message:n},bubbles:!0,composed:!0}))}finally{this.isCreatingWorktree=!1}}validateBranchName(e){return this.worktrees.map(n=>n.branch.replace(/^refs\/heads\//,"")).includes(e)?`Branch '${e}' already exists`:e.startsWith("-")||e.endsWith("-")?"Branch name cannot start or end with a hyphen":e.includes("..")||e.includes("~")||e.includes("^")||e.includes(":")?"Branch name contains invalid characters (.. ~ ^ :)":e.endsWith(".lock")?"Branch name cannot end with .lock":e.includes("//")||e.includes("\\")?"Branch name cannot contain consecutive slashes":["HEAD","FETCH_HEAD","ORIG_HEAD","MERGE_HEAD"].includes(e.toUpperCase())?`'${e}' is a reserved Git name`:null}generateWorktreePath(e){let t=e.trim().replace(/[^a-zA-Z0-9-_]/g,"-");return`${this.repoPath}-${t}`}handleCancelCreateWorktree(){this.showCreateWorktree=!1,this.newBranchName="",this.newWorktreePath="",this.useCustomPath=!1}render(){return u`
      <div class="p-4 h-full overflow-y-auto bg-bg">
        <div class="max-w-4xl mx-auto">
          <div class="mb-6">
            <h1 class="text-xl font-bold text-text">Git Worktrees</h1>
          </div>

        ${this.error?u`
          <div class="bg-status-error text-white px-4 py-2 rounded mb-4">
            ${this.error}
          </div>
        `:""}

        ${this.loading?u`
          <div class="flex justify-center items-center py-8">
            <div class="text-secondary">Loading worktrees...</div>
          </div>
        `:u`
          <div class="space-y-4">
            <div class="text-sm text-text-muted mb-4">
              Repository: <span class="font-mono text-text break-all">${this.formatPath(this.repoPath)}</span>
            </div>
            
            ${this.worktrees.length===0||this.worktrees.length===1&&this.worktrees[0].isMainWorktree?u`
              <div class="text-center py-12 space-y-4">
                <div class="text-text-muted text-lg">
                  No additional worktrees found
                </div>
                <div class="text-text-dim text-sm max-w-md mx-auto">
                  This repository only has the main worktree. You can create additional worktrees using the git worktree command in your terminal.
                </div>
                <div class="mt-6">
                  <code class="text-xs bg-surface px-2 py-1 rounded font-mono text-text-muted">
                    git worktree add ../feature-branch feature-branch
                  </code>
                </div>
              </div>
            `:u`
              <div class="grid gap-4">
                ${this.worktrees.map(e=>u`
                  <div class="bg-surface rounded-lg p-4 border border-border hover:border-border-focus transition-colors">
                    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-2 flex-wrap">
                          <h3 class="font-semibold text-lg text-text">
                            ${e.branch||"detached"}
                          </h3>
                          ${e.isMainWorktree?u`
                            <span class="px-2 py-1 text-xs bg-primary text-bg-elevated rounded">Main</span>
                          `:""}
                          ${e.isCurrentWorktree?u`
                            <span class="px-2 py-1 text-xs bg-status-success text-bg-elevated rounded">Current</span>
                          `:""}
                        </div>
                        
                        <div class="text-sm text-text-muted space-y-1">
                          <div class="font-mono text-text-dim break-all">${this.formatPath(e.path)}</div>
                          ${e.HEAD?u`
                            <div class="text-text-muted">HEAD: <span class="font-mono">${e.HEAD.slice(0,7)}</span></div>
                          `:""}
                          ${e.commitsAhead!==void 0?u`
                            <div class="flex items-center gap-4 flex-wrap">
                              ${e.commitsAhead>0?u`
                                <span class="text-status-success">↑ ${e.commitsAhead} ahead</span>
                              `:""}
                              ${e.hasUncommittedChanges?u`
                                <span class="text-status-warning">● Uncommitted changes</span>
                              `:""}
                            </div>
                          `:""}
                        </div>
                      </div>
                      
                      <div class="flex gap-2 flex-wrap sm:flex-nowrap sm:ml-4">
                        ${!e.isMainWorktree&&!e.isCurrentWorktree?u`
                          <button
                            @click=${()=>this.handleToggleFollow(e.branch,this.followBranch!==e.branch)}
                            class="px-3 py-1 text-sm font-medium ${this.followBranch===e.branch?"text-bg-elevated bg-status-success hover:bg-status-success/90":"text-text bg-surface hover:bg-surface-hover border border-border"} rounded transition-colors"
                            title="${this.followBranch===e.branch?"Disable follow mode":"Enable follow mode"}"
                          >
                            ${this.followBranch===e.branch?"Following":"Follow"}
                          </button>
                        `:""}
                        ${e.isCurrentWorktree?"":u`
                          <button
                            @click=${()=>this.handleSwitchBranch(e.branch)}
                            class="px-3 py-1 text-sm font-medium text-bg-elevated bg-primary rounded hover:bg-primary-hover transition-colors"
                          >
                            Switch
                          </button>
                        `}
                        ${e.isMainWorktree?"":u`
                          <button
                            @click=${()=>this.handleDeleteWorktree(e.branch,e.hasUncommittedChanges||!1)}
                            class="px-3 py-1 text-sm font-medium text-bg-elevated bg-status-error rounded hover:bg-status-error/90 transition-colors"
                          >
                            Delete
                          </button>
                        `}
                      </div>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>

          <!-- Create New Worktree Button -->
          <div class="mt-6 flex justify-center">
            <button
              @click=${()=>{this.showCreateWorktree=!0}}
              class="px-4 py-2 text-sm font-medium text-bg-elevated bg-primary rounded hover:bg-primary-hover transition-colors flex items-center gap-2"
              ?disabled=${this.loading}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Create New Worktree
            </button>
          </div>
        `}

        <!-- Create Worktree Modal -->
        ${this.showCreateWorktree?u`
            <div class="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div class="bg-surface rounded-lg p-6 max-w-md w-full border border-border shadow-elevated">
                <h3 class="text-lg font-semibold mb-4 text-text">Create New Worktree</h3>
                
                <div class="space-y-4">
                  <!-- Branch Name Input -->
                  <div>
                    <label class="block text-sm font-medium text-text-muted mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      .value=${this.newBranchName}
                      @input=${e=>{this.newBranchName=e.target.value}}
                      placeholder="feature/new-feature"
                      class="w-full px-3 py-2 bg-bg border border-border rounded focus:border-primary focus:outline-none text-text"
                      ?disabled=${this.isCreatingWorktree}
                      @keydown=${e=>{e.key==="Enter"&&this.newBranchName.trim()?this.handleCreateWorktree():e.key==="Escape"&&this.handleCancelCreateWorktree()}}
                    />
                    ${this.newBranchName.trim()?u`
                        <div class="text-xs mt-1 ${this.validateBranchName(this.newBranchName)?"text-status-error":"text-text-dim"}">
                          ${this.validateBranchName(this.newBranchName)||"Valid branch name"}
                        </div>
                      `:""}
                  </div>

                  <!-- Base Branch Selection -->
                  <div>
                    <label class="block text-sm font-medium text-text-muted mb-1">
                      Base Branch
                    </label>
                    <div class="text-sm text-text bg-bg px-3 py-2 border border-border rounded">
                      ${this.baseBranch}
                    </div>
                  </div>

                  <!-- Path Customization -->
                  <div>
                    <label class="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        .checked=${this.useCustomPath}
                        @change=${e=>{this.useCustomPath=e.target.checked,this.useCustomPath||(this.newWorktreePath="")}}
                        ?disabled=${this.isCreatingWorktree}
                        class="rounded"
                      />
                      <span>Customize worktree path</span>
                    </label>
                  </div>

                  ${this.useCustomPath?u`
                      <div>
                        <label class="block text-sm font-medium text-text-muted mb-1">
                          Custom Path
                        </label>
                        <input
                          type="text"
                          .value=${this.newWorktreePath}
                          @input=${e=>{this.newWorktreePath=e.target.value}}
                          placeholder="/path/to/worktree"
                          class="w-full px-3 py-2 bg-bg border border-border rounded focus:border-primary focus:outline-none text-text"
                          ?disabled=${this.isCreatingWorktree}
                        />
                        <div class="text-xs text-text-dim mt-1">
                          ${this.newWorktreePath.trim()?`Will create at: ${this.newWorktreePath.trim()}`:"Enter absolute path for the worktree"}
                        </div>
                      </div>
                    `:u`
                      <div class="text-xs text-text-dim">
                        Default path: ${this.generateWorktreePath(this.newBranchName.trim()||"branch")}
                      </div>
                    `}
                </div>

                <!-- Modal Actions -->
                <div class="flex justify-end gap-2 mt-6">
                  <button
                    @click=${this.handleCancelCreateWorktree}
                    class="px-4 py-2 text-sm font-medium text-text bg-surface rounded hover:bg-surface-hover transition-colors border border-border"
                    ?disabled=${this.isCreatingWorktree}
                  >
                    Cancel
                  </button>
                  <button
                    @click=${this.handleCreateWorktree}
                    class="px-4 py-2 text-sm font-medium text-bg-elevated bg-primary rounded hover:bg-primary-hover transition-colors disabled:opacity-50"
                    ?disabled=${!this.newBranchName.trim()||!!this.validateBranchName(this.newBranchName.trim())||this.useCustomPath&&!this.newWorktreePath.trim()||this.isCreatingWorktree}
                  >
                    ${this.isCreatingWorktree?"Creating...":"Create Worktree"}
                  </button>
                </div>
              </div>
            </div>
          `:""}

        ${this.showDeleteConfirm?u`
          <div class="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div class="bg-surface rounded-lg p-6 max-w-md w-full border border-border shadow-elevated">
              <h3 class="text-lg font-semibold mb-4 text-text">Confirm Delete</h3>
              <p class="text-text-muted mb-4">
                Are you sure you want to delete the worktree for branch 
                <span class="font-mono font-semibold text-text">${this.deleteTargetBranch}</span>?
              </p>
              ${this.deleteHasChanges?u`
                <p class="text-status-warning mb-4">
                  ⚠️ This worktree has uncommitted changes that will be lost.
                </p>
              `:""}
              <div class="flex justify-end gap-2">
                <button
                  @click=${this.cancelDelete}
                  class="px-4 py-2 text-sm font-medium text-text bg-surface rounded hover:bg-surface-hover transition-colors border border-border"
                >
                  Cancel
                </button>
                <button
                  @click=${this.confirmDelete}
                  class="px-4 py-2 text-sm font-medium text-bg-elevated bg-status-error rounded hover:bg-status-error/90 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        `:""}
        </div>
      </div>
    `}};d([C({type:Object})],Se.prototype,"gitService",2),d([C({type:String})],Se.prototype,"repoPath",2),d([_()],Se.prototype,"worktrees",2),d([_()],Se.prototype,"baseBranch",2),d([_()],Se.prototype,"followBranch",2),d([_()],Se.prototype,"loading",2),d([_()],Se.prototype,"error",2),d([_()],Se.prototype,"showDeleteConfirm",2),d([_()],Se.prototype,"deleteTargetBranch",2),d([_()],Se.prototype,"deleteHasChanges",2),d([_()],Se.prototype,"showCreateWorktree",2),d([_()],Se.prototype,"newBranchName",2),d([_()],Se.prototype,"newWorktreePath",2),d([_()],Se.prototype,"useCustomPath",2),d([_()],Se.prototype,"isCreatingWorktree",2),Se=d([D("worktree-manager")],Se);Me();q();Me();q();var ii=P("cast-converter");function si(c){let i=c.trim().split(`
`),e=null,t=[],s=[],n=0;for(let o of i)if(o.trim())try{let r=JSON.parse(o);if(r.version&&r.width&&r.height){e=r;continue}if(Array.isArray(r)&&r.length>=3){let a={timestamp:r[0],type:r[1],data:r[2]};t.push(a),a.timestamp>n&&(n=a.timestamp),a.type==="o"&&s.push(a.data)}}catch{ii.warn("failed to parse cast line")}return{header:e,content:s.join(""),events:t,totalDuration:n}}async function ea(c){let i=await fetch(c);if(!i.ok)throw new Error(`Failed to load cast file: ${i.status} ${i.statusText}`);let e=await i.text();return si(e)}function ta(c){return si(c).content}function ia(c){let i=si(c);return{cols:i.header?.width||80,rows:i.header?.height||24}}function Un(c){let i=si(c),e=[],t=0;for(let s of i.events){let n=Math.max(0,(s.timestamp-t)*1e3);if(s.type==="o")e.push({delay:n,type:"output",data:s.data});else if(s.type==="r"){let o=s.data.match(/^(\d+)x(\d+)$/);o&&e.push({delay:n,type:"resize",data:s.data,cols:Number.parseInt(o[1],10),rows:Number.parseInt(o[2],10)})}t=s.timestamp}return e}async function sa(c,i,e=1){let t=Un(i),s=si(i);c.setTerminalSize&&s.header&&c.setTerminalSize(s.header.width,s.header.height);for(let n of t){let o=n.delay/e;o>0&&await new Promise(r=>setTimeout(r,o)),n.type==="output"?c.write(n.data):n.type==="resize"&&c.setTerminalSize&&n.cols&&n.rows&&c.setTerminalSize(n.cols,n.rows)}}async function ra(c,i){let e=si(i),t=e.header?.width||80,s=e.header?.height||24;c.setTerminalSize&&c.setTerminalSize(t,s);let n=1024*1024,o="",r=0,a=()=>{o.length>0&&(c.write(o,!1),o="",r=0)};for(let m of e.events)if(m.type==="o"){if(m.data){let p=m.data.length;r+p>n&&o.length>0&&a(),o+=m.data,r+=p}}else if(m.type==="r"){a();let p=m.data.match(/^(\d+)x(\d+)$/);if(p&&c.setTerminalSize){let h=Number.parseInt(p[1],10),v=Number.parseInt(p[2],10);c.setTerminalSize(h,v)}}a()}function na(c,i){let e=new EventSource(i),t="",s=null,n=16,o=()=>{t.length>0&&(c.write(t,!0),t=""),s=null},r=m=>{t+=m,s===null&&(s=window.setTimeout(o,n))},a=()=>{s!==null&&(clearTimeout(s),o()),e.readyState!==EventSource.CLOSED&&e.close()};return e.onmessage=m=>{try{let p=JSON.parse(m.data);if(ii.debug("SSE message received:",{type:Array.isArray(p)?p[1]:"header"}),p.version&&p.width&&p.height)return;if(Array.isArray(p)&&p.length>=3){let[h,v,f]=p;h==="exit"?(a(),c.dispatchEvent&&c.dispatchEvent(new CustomEvent("session-exit",{detail:{exitCode:p[1],sessionId:p[2]||null},bubbles:!0}))):v==="o"?r(f):v==="r"?s!==null&&(clearTimeout(s),o()):v==="i"||ii.error("unknown stream message format")}}catch(p){ii.error("failed to parse stream message:",p)}},e.onerror=m=>{ii.error("stream connection error:",m),e.readyState===EventSource.CLOSED&&ii.debug("stream connection closed")},e.onopen=()=>{ii.debug(`stream connection established to: ${i}`)},{eventSource:e,disconnect:a}}var kr={convertCast:si,loadAndConvert:ea,convertToOutputOnly:ta,getTerminalDimensions:ia,convertToTimedEvents:Un,playOnTerminal:sa,dumpToTerminal:ra,connectToStream:na};q();var dt=P("connection-manager"),Is=class{constructor(i,e){this.onSessionExit=i;this.onSessionUpdate=e;this.streamConnection=null;this.reconnectCount=0;this.terminal=null;this.session=null;this.isConnected=!1}setTerminal(i){this.terminal=i}setSession(i){this.session=i}setConnected(i){this.isConnected=i}connectToStream(){if(!this.terminal||!this.session){dt.warn("Cannot connect to stream - missing terminal or session");return}if(!this.isConnected){dt.warn("Component already disconnected, not connecting to stream");return}dt.log(`Connecting to stream for session ${this.session.id}`),this.cleanupStreamConnection();let i=N.getCurrentUser(),e=`/api/sessions/${this.session.id}/stream`;i?.token&&(e+=`?token=${encodeURIComponent(i.token)}`);let t=kr.connectToStream(this.terminal,e),s=h=>{let f=h.detail?.sessionId||this.session?.id;dt.log(`Received session-exit event for session ${f}`),f&&this.onSessionExit(f)};this.terminal.addEventListener("session-exit",s);let n=h=>{try{let v=JSON.parse(h.data);if(dt.debug("Received session-update event:",v),v.type==="git-status-update"&&this.session&&v.sessionId===this.session.id){let f={...this.session,gitModifiedCount:v.gitModifiedCount,gitAddedCount:v.gitAddedCount,gitDeletedCount:v.gitDeletedCount,gitAheadCount:v.gitAheadCount,gitBehindCount:v.gitBehindCount};this.session=f,this.onSessionUpdate(f)}}catch(v){dt.error("Failed to parse session-update event:",v)}};t.eventSource.addEventListener("session-update",n);let o=t.eventSource,r=0,a=3,m=5e3,p=()=>{let h=Date.now();if(h-r>m&&(this.reconnectCount=0),this.reconnectCount++,r=h,dt.log(`stream error #${this.reconnectCount} for session ${this.session?.id}`),this.reconnectCount>=a&&(dt.warn(`session ${this.session?.id} marked as exited due to excessive reconnections`),this.session&&this.session.status!=="exited")){let v={...this.session,status:"exited"};this.session=v,this.onSessionUpdate(v),this.cleanupStreamConnection(),requestAnimationFrame(()=>{this.loadSessionSnapshot()})}};o.addEventListener("error",p),this.streamConnection={...t,errorHandler:p,sessionExitHandler:s,sessionUpdateHandler:n}}cleanupStreamConnection(){this.streamConnection&&(dt.log("Cleaning up stream connection"),this.streamConnection.sessionExitHandler&&this.terminal&&this.terminal.removeEventListener("session-exit",this.streamConnection.sessionExitHandler),this.streamConnection.sessionUpdateHandler&&this.streamConnection.eventSource&&this.streamConnection.eventSource.removeEventListener("session-update",this.streamConnection.sessionUpdateHandler),this.streamConnection.disconnect(),this.streamConnection=null)}getReconnectCount(){return this.reconnectCount}async loadSessionSnapshot(){if(!(!this.terminal||!this.session))try{let i=`/api/sessions/${this.session.id}/snapshot`,e=await fetch(i);if(!e.ok)throw new Error(`Failed to fetch snapshot: ${e.status}`);let t=await e.text();this.terminal.clear(),await kr.dumpToTerminal(this.terminal,t),this.terminal.queueCallback(()=>{this.terminal&&this.terminal.scrollToBottom()})}catch(i){dt.error("failed to load session snapshot",i)}}};q();var xi=class extends EventTarget{emit(i,e){this.dispatchEvent(new CustomEvent(i,{detail:e}))}on(i,e){this.addEventListener(i,e)}off(i,e){this.removeEventListener(i,e)}};var J=P("direct-keyboard-manager"),As=class extends xi{constructor(e){super();this.hiddenInput=null;this.focusRetentionInterval=null;this.inputManager=null;this.sessionViewElement=null;this.callbacks=null;this.showQuickKeys=!1;this.keyboardMode=!1;this.keyboardActivationTimeout=null;this.captureClickHandler=null;this.globalPasteHandler=null;this.isComposing=!1;this.hiddenInputFocused=!1;this.keyboardModeTimestamp=0;this.compositionBuffer="";this.handleQuickKeyPress=async(e,t,s,n,o)=>{if(!this.inputManager){J.error("No input manager found");return}if(s&&e==="Done"){J.log("Done button pressed - dismissing keyboard"),this.dismissKeyboard();return}else{if(t&&e==="Control")return;if(e==="CtrlFull"){console.log("[DirectKeyboardManager] CtrlFull pressed, toggling Ctrl+Alpha overlay"),this.callbacks&&this.callbacks.toggleCtrlAlpha();let r=this.callbacks?.getShowCtrlAlpha()??!1;console.log("[DirectKeyboardManager] showCtrlAlpha after toggle:",r),r||(this.callbacks&&this.callbacks.clearCtrlSequence(),!(this.callbacks?.getDisableFocusManagement()??!1)&&this.hiddenInput&&this.showQuickKeys&&(this.startFocusRetention(),this.delayedRefocusHiddenInput()));return}else if(e==="Paste"){if(J.log("Paste button pressed - attempting clipboard read"),J.log("Clipboard context:",{hasClipboard:!!navigator.clipboard,hasReadText:!!navigator.clipboard?.readText,isSecureContext:window.isSecureContext,protocol:window.location.protocol,userAgent:navigator.userAgent.includes("Safari")?"Safari":"Other"}),window.isSecureContext&&navigator.clipboard&&navigator.clipboard.readText)try{J.log("Secure context detected - trying modern clipboard API...");let r=await navigator.clipboard.readText();if(J.log("Clipboard read successful, text length:",r?.length||0),r&&this.inputManager){J.log("Sending clipboard text to terminal"),this.inputManager.sendInputText(r);return}else if(!r){J.warn("Clipboard is empty or contains no text");return}}catch(r){let a=r;J.warn("Clipboard API failed despite secure context:",{name:a?.name,message:a?.message})}else J.log("Not in secure context (HTTP) - clipboard API unavailable, using textarea fallback");J.log("Using iOS native paste fallback with existing hidden input"),this.triggerNativePasteWithHiddenInput()}else if(e==="Ctrl+A")this.inputManager.sendControlSequence("");else if(e==="Ctrl+C")this.inputManager.sendControlSequence("");else if(e==="Ctrl+D")this.inputManager.sendControlSequence("");else if(e==="Ctrl+E")this.inputManager.sendControlSequence("");else if(e==="Ctrl+K")this.inputManager.sendControlSequence("\v");else if(e==="Ctrl+L")this.inputManager.sendControlSequence("\f");else if(e==="Ctrl+R")this.inputManager.sendControlSequence("");else if(e==="Ctrl+U")this.inputManager.sendControlSequence("");else if(e==="Ctrl+W")this.inputManager.sendControlSequence("");else if(e==="Ctrl+Z")this.inputManager.sendControlSequence("");else if(e==="Option")this.inputManager.sendControlSequence("\x1B");else{if(e==="Command")return;if(e==="Delete")this.inputManager.sendInput("delete");else if(e==="Done"){this.dismissKeyboard();return}else if(e.startsWith("F")){let r=Number.parseInt(e.substring(1));r>=1&&r<=12&&this.inputManager.sendInput(`f${r}`)}else{let r=e;e==="Tab"?r="tab":e==="Escape"?r="escape":e==="ArrowUp"?r="arrow_up":e==="ArrowDown"?r="arrow_down":e==="ArrowLeft"?r="arrow_left":e==="ArrowRight"?r="arrow_right":e==="PageUp"?r="page_up":e==="PageDown"?r="page_down":e==="Home"?r="home":e==="End"&&(r="end"),r.length===1?this.inputManager.sendInputText(r):this.inputManager.sendInput(r.toLowerCase())}}}requestAnimationFrame(()=>{!(this.callbacks?.getDisableFocusManagement()??!1)&&this.hiddenInput&&this.showQuickKeys&&this.hiddenInput.focus()})};this.instanceId=e,this.setupGlobalPasteListener(),this.ensureHiddenInputVisible()}setInputManager(e){this.inputManager=e}setSessionViewElement(e){this.sessionViewElement=e}setCallbacks(e){this.callbacks=e}getShowQuickKeys(){return this.showQuickKeys}setShowQuickKeys(e){this.showQuickKeys=e,e||(this.hiddenInputFocused=!1,this.focusRetentionInterval&&(clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=null),this.hiddenInput&&this.hiddenInput.blur(),J.log("Quick keys force hidden by external trigger"))}focusHiddenInput(){J.log("Entering keyboard mode"),this.keyboardMode=!0,this.keyboardModeTimestamp=Date.now(),this.captureClickHandler||(this.captureClickHandler=e=>{if(this.keyboardMode){let t=e.target;if(t.closest(".terminal-quick-keys-container")||t.closest("session-header")||t.closest("app-header")||t.closest(".modal-backdrop")||t.closest(".modal-content")||t.closest(".sidebar")||t.closest("unified-settings")||t.closest("notification-status")||t.closest("button")||t.closest("a")||t.closest('[role="button"]')||t.closest(".settings-button")||t.closest(".notification-button"))return;(t.closest("#terminal-container")||t.closest("vibe-terminal"))&&this.hiddenInput&&this.hiddenInput.focus()}},document.addEventListener("click",this.captureClickHandler,!0),document.addEventListener("pointerdown",this.captureClickHandler,!0)),this.focusRetentionInterval&&clearInterval(this.focusRetentionInterval),this.startFocusRetention(),this.ensureHiddenInputVisible()}ensureHiddenInputVisible(){this.hiddenInput?this.hiddenInput.parentNode||document.body.appendChild(this.hiddenInput):this.createHiddenInput(),this.keyboardMode&&!this.showQuickKeys&&(this.showQuickKeys=!0,this.callbacks&&(this.callbacks.updateShowQuickKeys(!0),J.log("Showing quick keys immediately in keyboard mode"))),this.hiddenInput&&this.keyboardMode&&(this.hiddenInput.style.display="block",this.hiddenInput.style.visibility="visible",this.hiddenInput.focus(),this.hiddenInput.value=" ",this.hiddenInput.setSelectionRange(0,1),setTimeout(()=>{this.hiddenInput&&(this.hiddenInput.value="")},50),J.log("Focused hidden input with dummy value trick"))}createHiddenInput(){this.hiddenInput=document.createElement("input"),this.hiddenInput.type="text",this.hiddenInput.style.position="absolute",this.hiddenInput.style.opacity="0.01",this.hiddenInput.style.fontSize="16px",this.hiddenInput.style.border="none",this.hiddenInput.style.outline="none",this.hiddenInput.style.background="transparent",this.hiddenInput.style.color="transparent",this.hiddenInput.style.caretColor="transparent",this.hiddenInput.style.cursor="default",this.hiddenInput.style.pointerEvents="none",this.hiddenInput.placeholder="",this.hiddenInput.style.webkitUserSelect="text",this.hiddenInput.autocapitalize="none",this.hiddenInput.autocomplete="off",this.hiddenInput.setAttribute("autocorrect","off"),this.hiddenInput.setAttribute("spellcheck","false"),this.hiddenInput.setAttribute("data-autocorrect","off"),this.hiddenInput.setAttribute("data-gramm","false"),this.hiddenInput.setAttribute("data-ms-editor","false"),this.hiddenInput.setAttribute("data-smartpunctuation","false"),this.hiddenInput.setAttribute("data-form-type","other"),this.hiddenInput.setAttribute("inputmode","text"),this.hiddenInput.setAttribute("enterkeyhint","done"),this.hiddenInput.setAttribute("aria-hidden","true"),this.updateHiddenInputPosition(),this.hiddenInput.addEventListener("compositionstart",()=>{this.isComposing=!0,this.compositionBuffer=""}),this.hiddenInput.addEventListener("compositionupdate",e=>{let t=e;this.compositionBuffer=t.data||""}),this.hiddenInput.addEventListener("compositionend",e=>{let t=e;this.isComposing=!1;let s=t.data||this.hiddenInput?.value||"";if(s){let n=this.callbacks?.getShowMobileInput()??!1,o=this.callbacks?.getShowCtrlAlpha()??!1;!n&&!o&&this.inputManager&&this.inputManager.sendInputText(s)}this.hiddenInput&&(this.hiddenInput.value=""),this.compositionBuffer=""}),this.hiddenInput.addEventListener("input",e=>{let t=e.target;if(!this.isComposing&&t.value){let s=this.callbacks?.getShowMobileInput()??!1,n=this.callbacks?.getShowCtrlAlpha()??!1;!s&&!n&&this.inputManager&&this.inputManager.sendInputText(t.value),t.value=""}}),this.hiddenInput.addEventListener("keydown",e=>{let t=this.callbacks?.getShowMobileInput()??!1,s=this.callbacks?.getShowCtrlAlpha()??!1;t||s||(["Enter","Backspace","Tab","Escape"].includes(e.key)&&e.preventDefault(),e.key==="Enter"&&this.inputManager?this.inputManager.sendInput("enter"):e.key==="Backspace"&&this.inputManager?this.inputManager.sendInput("backspace"):e.key==="Tab"&&this.inputManager?this.inputManager.sendInput(e.shiftKey?"shift_tab":"tab"):e.key==="Escape"&&this.inputManager&&this.inputManager.sendInput("escape"))}),this.hiddenInput.addEventListener("focus",()=>{this.hiddenInputFocused=!0,J.log(`Hidden input focused. Keyboard mode: ${this.keyboardMode}`),this.hiddenInput&&this.keyboardMode&&(this.hiddenInput.style.pointerEvents="auto"),this.keyboardMode?(this.showQuickKeys=!0,this.callbacks&&(this.callbacks.updateShowQuickKeys(!0),J.log("Showing quick keys due to keyboard mode")),this.hiddenInput&&this.hiddenInput.setSelectionRange(0,0)):(this.callbacks?.getKeyboardHeight()??0)>50&&(this.showQuickKeys=!0,this.callbacks&&this.callbacks.updateShowQuickKeys(!0));let e=this.callbacks?.getVisualViewportHandler();e&&e(),this.focusRetentionInterval||this.startFocusRetention()}),this.hiddenInput.addEventListener("blur",e=>{let t=e;if(J.log(`Hidden input blurred. Keyboard mode: ${this.keyboardMode}`),J.log(`Active element: ${document.activeElement?.tagName}, class: ${document.activeElement?.className}`),this.keyboardMode){J.log("In keyboard mode - maintaining focus"),setTimeout(()=>{this.keyboardMode&&this.hiddenInput&&document.activeElement!==this.hiddenInput&&(J.log("Refocusing hidden input to maintain keyboard"),this.hiddenInput.focus())},50);return}!(this.callbacks?.getDisableFocusManagement()??!1)&&this.showQuickKeys&&this.hiddenInput?setTimeout(()=>{let n=document.activeElement;!(this.sessionViewElement?.contains(n)??!1)&&n&&n!==document.body&&(this.hiddenInputFocused=!1,this.showQuickKeys=!1,this.callbacks&&this.callbacks.updateShowQuickKeys(!1),J.log("Focus left component, hiding quick keys"),this.focusRetentionInterval&&(clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=null))},100):this.hiddenInputFocused=!1}),document.body.appendChild(this.hiddenInput)}startFocusRetention(){this.focusRetentionInterval=setInterval(()=>{let e=this.callbacks?.getDisableFocusManagement()??!1,t=this.callbacks?.getShowMobileInput()??!1,s=this.callbacks?.getShowCtrlAlpha()??!1;if(this.keyboardMode&&this.hiddenInput&&document.activeElement!==this.hiddenInput){J.log("Keyboard mode: forcing focus on hidden input"),this.hiddenInput.focus();return}!e&&this.showQuickKeys&&this.hiddenInput&&document.activeElement!==this.hiddenInput&&!t&&!s&&(J.log("Refocusing hidden input to maintain keyboard"),this.hiddenInput.focus())},100)}delayedRefocusHiddenInput(){setTimeout(()=>{!(this.callbacks?.getDisableFocusManagement()??!1)&&this.hiddenInput&&this.hiddenInput.focus()},100)}shouldRefocusHiddenInput(){return!(this.callbacks?.getDisableFocusManagement()??!1)&&!!this.hiddenInput&&this.showQuickKeys}refocusHiddenInput(){setTimeout(()=>{!(this.callbacks?.getDisableFocusManagement()??!1)&&this.hiddenInput&&this.hiddenInput.focus()},100)}startFocusRetentionPublic(){this.startFocusRetention()}delayedRefocusHiddenInputPublic(){this.delayedRefocusHiddenInput()}updateHiddenInputPosition(){this.hiddenInput&&(this.keyboardMode?(this.hiddenInput.style.position="fixed",this.hiddenInput.style.bottom="50px",this.hiddenInput.style.left="50%",this.hiddenInput.style.transform="translateX(-50%)",this.hiddenInput.style.width="1px",this.hiddenInput.style.height="1px",this.hiddenInput.style.zIndex=String(ie.TERMINAL_OVERLAY+100),this.hiddenInput.style.pointerEvents="auto"):(this.hiddenInput.style.position="fixed",this.hiddenInput.style.left="-9999px",this.hiddenInput.style.top="-9999px",this.hiddenInput.style.width="1px",this.hiddenInput.style.height="1px",this.hiddenInput.style.zIndex="-1",this.hiddenInput.style.pointerEvents="none"))}triggerNativePasteWithHiddenInput(){if(!this.hiddenInput){J.error("No hidden input available for paste fallback");return}J.log("Making hidden input temporarily visible for paste");let e={position:this.hiddenInput.style.position,opacity:this.hiddenInput.style.opacity,left:this.hiddenInput.style.left,top:this.hiddenInput.style.top,width:this.hiddenInput.style.width,height:this.hiddenInput.style.height,backgroundColor:this.hiddenInput.style.backgroundColor,border:this.hiddenInput.style.border,borderRadius:this.hiddenInput.style.borderRadius,padding:this.hiddenInput.style.padding,zIndex:this.hiddenInput.style.zIndex};this.hiddenInput.style.position="fixed",this.hiddenInput.style.left="50%",this.hiddenInput.style.top="50%",this.hiddenInput.style.transform="translate(-50%, -50%)",this.hiddenInput.style.width="200px",this.hiddenInput.style.height="40px",this.hiddenInput.style.opacity="1",this.hiddenInput.style.backgroundColor="white",this.hiddenInput.style.border="2px solid #007AFF",this.hiddenInput.style.borderRadius="8px",this.hiddenInput.style.padding="8px",this.hiddenInput.style.zIndex="10000",this.hiddenInput.placeholder="Long-press to paste";let t=()=>{this.hiddenInput&&(Object.entries(e).forEach(([n,o])=>{o!==void 0&&this.hiddenInput?.style&&(this.hiddenInput.style[n]=o)}),this.hiddenInput.placeholder="",J.log("Restored hidden input to original state"))},s=n=>{n.preventDefault(),n.stopPropagation();let o=n.clipboardData?.getData("text/plain");J.log("Native paste event received, text length:",o?.length||0),o&&this.inputManager?(J.log("Sending native paste text to terminal"),this.inputManager.sendInputText(o)):J.warn("No clipboard data received in paste event"),this.hiddenInput?.removeEventListener("paste",s),t(),J.log("Removed paste event listener and restored styles")};this.hiddenInput.addEventListener("paste",s),this.hiddenInput.focus(),this.hiddenInput.select(),J.log("Input is now visible and focused - long-press to see paste menu"),setTimeout(()=>{this.hiddenInput&&(this.hiddenInput.removeEventListener("paste",s),t(),J.log("Paste timeout - restored input to hidden state"))},1e4)}setupGlobalPasteListener(){this.globalPasteHandler=e=>{let t=e;if(this.hiddenInput&&document.activeElement===this.hiddenInput&&this.showQuickKeys){let s=t.clipboardData?.getData("text/plain");s&&this.inputManager&&(J.log("Global paste event captured, text length:",s.length),this.inputManager.sendInputText(s),t.preventDefault(),t.stopPropagation())}},typeof document<"u"&&(document.addEventListener("paste",this.globalPasteHandler),J.log("Global paste listener setup for CMD+V support"))}dismissKeyboard(){this.keyboardMode=!1,this.keyboardModeTimestamp=0,this.captureClickHandler&&(document.removeEventListener("click",this.captureClickHandler,!0),document.removeEventListener("pointerdown",this.captureClickHandler,!0),this.captureClickHandler=null),this.showQuickKeys=!1,this.callbacks&&(this.callbacks.updateShowQuickKeys(!1),this.callbacks.setKeyboardHeight(0)),this.focusRetentionInterval&&(clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=null),this.keyboardActivationTimeout&&(clearTimeout(this.keyboardActivationTimeout),this.keyboardActivationTimeout=null),this.hiddenInput&&(this.hiddenInput.blur(),this.hiddenInputFocused=!1,this.updateHiddenInputPosition()),J.log("Keyboard dismissed")}cleanup(){this.focusRetentionInterval&&(clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=null),this.keyboardActivationTimeout&&(clearTimeout(this.keyboardActivationTimeout),this.keyboardActivationTimeout=null),this.captureClickHandler&&(document.removeEventListener("click",this.captureClickHandler,!0),document.removeEventListener("pointerdown",this.captureClickHandler,!0),this.captureClickHandler=null),this.globalPasteHandler&&(document.removeEventListener("paste",this.globalPasteHandler),this.globalPasteHandler=null),this.hiddenInput&&(this.hiddenInput.remove(),this.hiddenInput=null)}getKeyboardMode(){return this.keyboardMode}isRecentlyEnteredKeyboardMode(){return this.keyboardMode?Date.now()-this.keyboardModeTimestamp<2e3:!1}showVisibleInputForKeyboard(){if(document.getElementById("vibe-visible-keyboard-input"))return;let e=document.createElement("input");e.type="text",e.id="vibe-visible-keyboard-input",e.placeholder="Type here...",e.style.position="fixed",e.style.bottom="80px",e.style.left="50%",e.style.transform="translateX(-50%)",e.style.zIndex="9999",e.style.fontSize="18px",e.style.padding="0.5em",e.style.background="#fff",e.style.color="#000",e.style.border="1px solid #ccc",e.style.borderRadius="6px",document.body.appendChild(e),setTimeout(()=>{e.focus(),console.log("Input focused:",document.activeElement===e)},50);let t=()=>{e.value&&this.inputManager&&this.inputManager.sendInputText(e.value),e.remove()};e.addEventListener("blur",t),e.addEventListener("keydown",s=>{s.key==="Enter"&&t()})}};q();var Ee=P("file-operations-manager"),Ls=class{constructor(){this.callbacks=null;this.dragCounter=0;this.dragLeaveTimer=null;this.globalDragOverTimer=null;this.boundHandleDragOver=this.handleDragOver.bind(this),this.boundHandleDragEnter=this.handleDragEnter.bind(this),this.boundHandleDragLeave=this.handleDragLeave.bind(this),this.boundHandleDrop=this.handleDrop.bind(this),this.boundHandlePaste=this.handlePaste.bind(this),this.boundHandleDragEnd=this.handleDragEnd.bind(this),this.boundGlobalDragOver=this.handleGlobalDragOver.bind(this)}setCallbacks(i){this.callbacks=i}setupEventListeners(i){i.addEventListener("dragover",this.boundHandleDragOver),i.addEventListener("dragenter",this.boundHandleDragEnter),i.addEventListener("dragleave",this.boundHandleDragLeave),i.addEventListener("drop",this.boundHandleDrop),document.addEventListener("paste",this.boundHandlePaste),document.addEventListener("dragend",this.boundHandleDragEnd),document.addEventListener("dragover",this.boundGlobalDragOver,!0)}removeEventListeners(i){i.removeEventListener("dragover",this.boundHandleDragOver),i.removeEventListener("dragenter",this.boundHandleDragEnter),i.removeEventListener("dragleave",this.boundHandleDragLeave),i.removeEventListener("drop",this.boundHandleDrop),document.removeEventListener("paste",this.boundHandlePaste),document.removeEventListener("dragend",this.boundHandleDragEnd),document.removeEventListener("dragover",this.boundGlobalDragOver,!0),this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.globalDragOverTimer&&(clearTimeout(this.globalDragOverTimer),this.globalDragOverTimer=null),this.dragCounter=0,this.callbacks&&this.callbacks.setIsDragOver(!1)}openFileBrowser(){this.callbacks&&this.callbacks.setShowFileBrowser(!0)}closeFileBrowser(){this.callbacks&&this.callbacks.setShowFileBrowser(!1)}openFilePicker(){if(this.callbacks)if(this.callbacks.getIsMobile())this.callbacks.setShowImagePicker(!0);else{let i=this.callbacks.querySelector("file-picker");i&&typeof i.openFilePicker=="function"&&i.openFilePicker()}}closeFilePicker(){this.callbacks&&this.callbacks.setShowImagePicker(!1)}selectImage(){if(!this.callbacks)return;let i=this.callbacks.querySelector("file-picker");i&&typeof i.openImagePicker=="function"?i.openImagePicker():Ee.error("File picker component not found or openImagePicker method not available")}openCamera(){if(!this.callbacks)return;let i=this.callbacks.querySelector("file-picker");i&&typeof i.openCamera=="function"?i.openCamera():Ee.error("File picker component not found or openCamera method not available")}async pasteImage(){if(this.callbacks)try{let i=await navigator.clipboard.read();for(let e of i){let t=e.types.filter(s=>s.startsWith("image/"));for(let s of t){let n=await e.getType(s),o=new File([n],`pasted-image.${s.split("/")[1]}`,{type:s});await this.uploadFile(o),Ee.log("Successfully pasted image from clipboard");return}}Ee.log("No image found in clipboard"),this.callbacks.dispatchEvent(new CustomEvent("error",{detail:"No image found in clipboard",bubbles:!0,composed:!0}))}catch(i){Ee.error("Failed to paste image from clipboard:",i),this.callbacks.dispatchEvent(new CustomEvent("error",{detail:"Failed to access clipboard. Please check permissions.",bubbles:!0,composed:!0}))}}async handleFileSelected(i){if(!this.callbacks)return;let e=this.callbacks.getSession(),t=this.callbacks.getInputManager();if(!i||!e||!t)return;this.callbacks.setShowImagePicker(!1);let s=i.includes(" ")?`"${i}"`:i;await t.sendInputText(s),Ee.log(`inserted file path into terminal: ${s}`)}handleFileError(i){this.callbacks&&(Ee.error("File picker error:",i),this.callbacks.dispatchEvent(new CustomEvent("error",{detail:i})))}async insertPath(i,e){if(!this.callbacks)return;let t=this.callbacks.getSession();if(!i||!t)return;let s=i.includes(" ")?`"${i}"`:i,n=this.callbacks.getInputManager();n&&await n.sendInputText(s),Ee.log(`inserted ${e} path into terminal: ${s}`)}resetDragState(){this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.dragCounter=0,this.callbacks&&this.callbacks.setIsDragOver(!1)}handleDragOver(i){i.preventDefault(),i.stopPropagation(),this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.globalDragOverTimer&&(clearTimeout(this.globalDragOverTimer),this.globalDragOverTimer=null),i.dataTransfer?.types.includes("Files")&&this.callbacks&&this.callbacks.setIsDragOver(!0)}handleDragEnter(i){i.preventDefault(),i.stopPropagation(),this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.dragCounter++,i.dataTransfer?.types.includes("Files")&&this.callbacks&&this.callbacks.setIsDragOver(!0)}handleDragLeave(i){i.preventDefault(),i.stopPropagation(),this.dragCounter--,this.dragLeaveTimer&&clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=setTimeout(()=>{this.dragCounter<=0&&this.callbacks&&(this.callbacks.setIsDragOver(!1),this.dragCounter=0)},100)}async handleDrop(i){i.preventDefault(),i.stopPropagation(),this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.callbacks&&this.callbacks.setIsDragOver(!1),this.dragCounter=0;let e=Array.from(i.dataTransfer?.files||[]);if(e.length===0){Ee.warn("No files found in drop");return}for(let t of e)try{await this.uploadFile(t),Ee.log(`Successfully uploaded file: ${t.name}`)}catch(s){Ee.error(`Failed to upload file: ${t.name}`,s)}}handleDragEnd(i){i.preventDefault(),i.stopPropagation(),this.dragLeaveTimer&&(clearTimeout(this.dragLeaveTimer),this.dragLeaveTimer=null),this.dragCounter=0,this.callbacks&&this.callbacks.setIsDragOver(!1),Ee.debug("Drag operation ended, resetting drag state")}handleGlobalDragOver(i){this.globalDragOverTimer&&(clearTimeout(this.globalDragOverTimer),this.globalDragOverTimer=null),this.callbacks&&this.dragCounter>0&&(this.globalDragOverTimer=setTimeout(()=>{this.dragCounter=0,this.callbacks&&this.callbacks.setIsDragOver(!1),Ee.debug("No drag events detected, clearing drag state")},500))}async handlePaste(i){if(!this.callbacks)return;let e=this.callbacks.getShowFileBrowser(),t=this.callbacks.getShowImagePicker(),s=this.callbacks.getShowMobileInput();if(!this.shouldHandlePaste(e,t,s))return;let o=Array.from(i.clipboardData?.items||[]).filter(r=>r.kind==="file");if(o.length!==0){i.preventDefault();for(let r of o){let a=r.getAsFile();if(a)try{await this.uploadFile(a),Ee.log(`Successfully pasted and uploaded file: ${a.name}`)}catch(m){Ee.error(`Failed to upload pasted file: ${a?.name}`,m)}}}}async uploadFile(i){if(this.callbacks)try{let e=this.callbacks.querySelector("file-picker");e&&typeof e.uploadFile=="function"?await e.uploadFile(i):Ee.error("File picker component not found or upload method not available")}catch(e){Ee.error("Failed to upload dropped/pasted file:",e),this.callbacks.dispatchEvent(new CustomEvent("error",{detail:e instanceof Error?e.message:"Failed to upload file"}))}}shouldHandlePaste(i,e,t){return!i&&!e&&!t}};Me();q();var He=P("websocket-input-client"),_r=class{constructor(){this.ws=null;this.session=null;this.reconnectTimeout=null;this.connectionPromise=null;this.isConnecting=!1;this.RECONNECT_DELAY=1e3;this.MAX_RECONNECT_DELAY=5e3;this.cleanup=this.cleanup.bind(this),typeof window<"u"&&window.addEventListener("beforeunload",this.cleanup)}async connect(i){if(this.session?.id===i.id&&this.ws?.readyState===WebSocket.OPEN){He.debug(`Already connected to session ${i.id}`);return}if(this.session?.id!==i.id&&(He.debug(`Switching from session ${this.session?.id} to ${i.id}`),this.disconnect()),this.session=i,He.debug(`Connecting to WebSocket for session ${i.id}`),this.connectionPromise)return this.connectionPromise;this.connectionPromise=this.establishConnection();try{await this.connectionPromise}finally{this.connectionPromise=null}}async establishConnection(){if(!this.session)throw new Error("No session provided");this.isConnecting=!0;let i=this.session.id,e=typeof window<"u"?localStorage.getItem("vibetunnel_auth_token")||localStorage.getItem("auth_token")||`dev-token-${Date.now()}`:`dev-token-${Date.now()}`;try{let t=await this.getWebSocketUrl(i,e);He.log(`Connecting to WebSocket: ${t}`),this.ws=new WebSocket(t),this.ws.onopen=()=>{He.log("WebSocket connected successfully"),this.isConnecting=!1},this.ws.onclose=s=>{He.log(`WebSocket closed: code=${s.code}, reason=${s.reason}`),this.isConnecting=!1,this.ws=null,this.scheduleReconnect()},this.ws.onerror=s=>{He.error("WebSocket error:",s),this.isConnecting=!1},await new Promise((s,n)=>{let o=setTimeout(()=>{n(new Error("WebSocket connection timeout"))},5e3);this.ws?.addEventListener("open",()=>{clearTimeout(o),s()}),this.ws?.addEventListener("error",()=>{clearTimeout(o),n(new Error("WebSocket connection failed"))})})}catch(t){throw He.error("Failed to establish WebSocket connection:",t),this.isConnecting=!1,t}}sendInput(i){if(!this.session||!this.ws||this.ws.readyState!==WebSocket.OPEN)return!1;try{let e;if(i.key)e=`\0${i.key}\0`,He.debug(`Sending special key: "${i.key}" as: ${JSON.stringify(e)}`);else if(i.text)e=i.text,He.debug(`Sending text: ${JSON.stringify(e)}`);else return!1;return this.ws.send(e),He.debug("Sent raw input via WebSocket:",JSON.stringify(e)),!0}catch(e){return He.error("Failed to send via WebSocket:",e),!1}}async getWebSocketUrl(i,e){try{let n=await fetch("/api/config");if(n.ok)return`${(await n.json()).websocketUrl}/ws?sessionId=${i}&token=${encodeURIComponent(e)}`}catch(n){He.warn("Failed to get config, falling back to relative URL:",n)}return`${typeof window<"u"&&window.location.protocol==="https:"?"wss:":"ws:"}//localhost:4021/ws?sessionId=${i}&token=${encodeURIComponent(e)}`}scheduleReconnect(){if(this.reconnectTimeout)return;let i=Math.min(this.RECONNECT_DELAY*2,this.MAX_RECONNECT_DELAY);He.log(`Scheduling reconnect in ${i}ms`),this.reconnectTimeout=setTimeout(()=>{this.reconnectTimeout=null,this.session&&this.connect(this.session).catch(e=>{He.error("Reconnection failed:",e)})},i)}isConnected(){return this.ws?.readyState===WebSocket.OPEN}disconnect(){this.reconnectTimeout&&(clearTimeout(this.reconnectTimeout),this.reconnectTimeout=null),this.ws&&(this.ws.close(),this.ws=null),this.session=null,this.isConnecting=!1}cleanup(){this.disconnect(),typeof window<"u"&&window.removeEventListener("beforeunload",this.cleanup)}},Ps=new _r;function wt(c){c.preventDefault(),c.stopPropagation()}var oa=["ArrowLeft","ArrowRight","Home","End"];function Bs(c){return c.metaKey||c.ctrlKey||c.altKey?!0:oa.includes(c.key)}q();q();var Si=P("ime-input"),Rs=class{constructor(i){this.isComposing=!1;this.documentClickHandler=null;this.globalPasteHandler=null;this.focusRetentionInterval=null;this.handleCompositionStart=()=>{this.isComposing=!0,document.body.setAttribute("data-ime-composing","true"),this.updatePosition(),Si.log("IME composition started")};this.handleCompositionUpdate=i=>{Si.log("IME composition update:",i.data)};this.handleCompositionEnd=i=>{this.isComposing=!1,document.body.removeAttribute("data-ime-composing");let e=i.data;e&&this.options.onTextInput(e),this.input.value="",Si.log("IME composition ended:",e)};this.handleInput=i=>{let e=i.target,t=e.value;this.isComposing||t&&(this.options.onTextInput(t),e.value="")};this.handleKeydown=i=>{if(!((i.metaKey||i.ctrlKey)&&i.key==="v")&&!this.isComposing&&this.options.onSpecialKey)switch(i.key){case"Enter":i.preventDefault(),this.input.value.trim()&&(this.options.onTextInput(this.input.value),this.input.value=""),this.options.onSpecialKey("enter");break;case"Backspace":this.input.value||(i.preventDefault(),this.options.onSpecialKey("backspace"));break;case"Tab":i.preventDefault(),this.options.onSpecialKey(i.shiftKey?"shift_tab":"tab");break;case"Escape":i.preventDefault(),this.options.onSpecialKey("escape");break;case"ArrowUp":i.preventDefault(),this.options.onSpecialKey("arrow_up");break;case"ArrowDown":i.preventDefault(),this.options.onSpecialKey("arrow_down");break;case"ArrowLeft":this.input.value||(i.preventDefault(),this.options.onSpecialKey("arrow_left"));break;case"ArrowRight":this.input.value||(i.preventDefault(),this.options.onSpecialKey("arrow_right"));break;case"Delete":i.preventDefault(),i.stopPropagation(),this.options.onSpecialKey("delete");break}};this.handlePaste=i=>{let e=i.clipboardData?.getData("text");e&&(this.options.onTextInput(e),this.input.value="",i.preventDefault())};this.handleFocus=()=>{document.body.setAttribute("data-ime-input-focused","true"),Si.log("IME input focused"),this.startFocusRetention()};this.handleBlur=()=>{Si.log("IME input blurred"),setTimeout(()=>{document.activeElement!==this.input&&(document.body.removeAttribute("data-ime-input-focused"),this.stopFocusRetention())},50)};this.options=i,this.input=this.createInput(),this.setupEventListeners(),i.autoFocus&&this.focus()}createInput(){let i=document.createElement("input");return i.type="text",i.style.position="absolute",i.style.top="0px",i.style.left="0px",i.style.transform="none",i.style.width="1px",i.style.height="1px",i.style.fontSize="16px",i.style.padding="0",i.style.border="none",i.style.borderRadius="0",i.style.backgroundColor="transparent",i.style.color="transparent",i.style.zIndex=String(this.options.zIndex||ie.IME_INPUT),i.style.opacity="0",i.style.pointerEvents="none",i.placeholder="CJK Input",i.autocapitalize="off",i.setAttribute("autocorrect","off"),i.autocomplete="off",i.spellcheck=!1,this.options.className&&(i.className=this.options.className),this.options.container.appendChild(i),i}setupEventListeners(){this.input.addEventListener("compositionstart",this.handleCompositionStart),this.input.addEventListener("compositionupdate",this.handleCompositionUpdate),this.input.addEventListener("compositionend",this.handleCompositionEnd),this.input.addEventListener("input",this.handleInput),this.input.addEventListener("keydown",this.handleKeydown),this.input.addEventListener("paste",this.handlePaste),this.input.addEventListener("focus",this.handleFocus),this.input.addEventListener("blur",this.handleBlur),this.documentClickHandler=i=>{let e=i.target;(this.options.container.contains(e)||e===this.options.container)&&this.focus()},document.addEventListener("click",this.documentClickHandler),this.globalPasteHandler=i=>{let e=i,t=i.target;if(t===this.input||t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.contentEditable==="true"||t.closest?.(".monaco-editor")||t.closest?.("[data-keybinding-context]"))return;let s=e.clipboardData?.getData("text");s&&(this.options.onTextInput(s),e.preventDefault())},document.addEventListener("paste",this.globalPasteHandler)}updatePosition(){if(!this.options.getCursorInfo){this.input.style.left="10px",this.input.style.top="10px";return}let i=this.options.getCursorInfo();if(!i){this.input.style.left="10px",this.input.style.top="10px";return}this.input.style.left=`${Math.max(10,i.x)}px`,this.input.style.top=`${Math.max(10,i.y)}px`}focus(){this.updatePosition(),requestAnimationFrame(()=>{this.input.focus(),document.activeElement!==this.input&&requestAnimationFrame(()=>{document.activeElement!==this.input&&this.input.focus()})})}blur(){this.input.blur()}isFocused(){return document.activeElement===this.input}isComposingText(){return this.isComposing}startFocusRetention(){typeof process<"u"&&!1||typeof globalThis.beforeEach<"u"||(this.focusRetentionInterval&&clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=setInterval(()=>{document.activeElement!==this.input&&this.input.focus()},100))}stopFocusRetention(){this.focusRetentionInterval&&(clearInterval(this.focusRetentionInterval),this.focusRetentionInterval=null)}stopFocusRetentionForTesting(){this.stopFocusRetention()}cleanup(){this.stopFocusRetention(),this.input.removeEventListener("compositionstart",this.handleCompositionStart),this.input.removeEventListener("compositionupdate",this.handleCompositionUpdate),this.input.removeEventListener("compositionend",this.handleCompositionEnd),this.input.removeEventListener("input",this.handleInput),this.input.removeEventListener("keydown",this.handleKeydown),this.input.removeEventListener("paste",this.handlePaste),this.input.removeEventListener("focus",this.handleFocus),this.input.removeEventListener("blur",this.handleBlur),this.documentClickHandler&&(document.removeEventListener("click",this.documentClickHandler),this.documentClickHandler=null),this.globalPasteHandler&&(document.removeEventListener("paste",this.globalPasteHandler),this.globalPasteHandler=null),document.body.removeAttribute("data-ime-input-focused"),document.body.removeAttribute("data-ime-composing"),this.input.remove(),Si.log("IME input cleaned up")}};var xt=P("input-manager"),Ds=class{constructor(){this.session=null;this.callbacks=null;this.useWebSocketInput=!0;this.lastEscapeTime=0;this.DOUBLE_ESCAPE_THRESHOLD=500;this.imeInput=null}setSession(i){!i&&this.imeInput&&this.cleanup(),this.session=i,i&&!this.imeInput&&this.setupIMEInput();let t=new URLSearchParams(window.location.search).get("socket_input");t!==null&&(this.useWebSocketInput=t==="true",xt.log(`WebSocket input ${this.useWebSocketInput?"enabled":"disabled"} via URL parameter`)),i&&this.useWebSocketInput&&Ps.connect(i).catch(s=>{xt.debug("WebSocket connection failed, will use HTTP fallback:",s)})}setCallbacks(i){this.callbacks=i}setupIMEInput(){if(ms()){console.log("\u{1F50D} Skipping IME input setup on mobile device"),xt.log("Skipping IME input setup on mobile device");return}console.log("\u{1F50D} Setting up IME input on desktop device");let i=document.getElementById("terminal-container");if(!i){console.warn("\u{1F30F} InputManager: Terminal container not found, cannot setup IME input");return}this.imeInput=new Rs({container:i,onTextInput:e=>{this.sendInputText(e)},onSpecialKey:e=>{this.sendInput(e)},getCursorInfo:()=>null,autoFocus:!0})}async handleKeyboardInput(i){if(!this.session||this.imeInput?.isFocused()&&!Bs(i)||this.imeInput?.isComposingText())return;let{key:e,ctrlKey:t,altKey:s,metaKey:n,shiftKey:o}=i;if(e==="Escape"&&this.session.status==="exited")return;if(this.session.status==="exited"){xt.log("ignoring keyboard input - session has exited");return}if(or(i))return;if(s&&!t&&!n&&!o){if(e==="ArrowLeft"){wt(i),await this.sendInput("\x1Bb");return}if(e==="ArrowRight"){wt(i),await this.sendInput("\x1Bf");return}if(e==="Backspace"){wt(i),await this.sendInput("");return}}let r="";switch(e){case"Enter":t?r="ctrl_enter":o?r="shift_enter":r="enter";break;case"Escape":{let a=Date.now();if(a-this.lastEscapeTime<this.DOUBLE_ESCAPE_THRESHOLD){if(xt.log("\u{1F504} Double Escape detected in input manager - toggling keyboard capture"),this.callbacks){let h=!(this.callbacks.getKeyboardCaptureActive?.()??!0),v=new CustomEvent("capture-toggled",{detail:{active:h},bubbles:!0,composed:!0});document.dispatchEvent(v)}this.lastEscapeTime=0;return}this.lastEscapeTime=a,r="escape";break}case"ArrowUp":r="arrow_up";break;case"ArrowDown":r="arrow_down";break;case"ArrowLeft":r="arrow_left";break;case"ArrowRight":r="arrow_right";break;case"Tab":r=o?"shift_tab":"tab";break;case"Backspace":r="backspace";break;case"Delete":r="delete";break;case" ":r=" ";break;default:if(e.length===1)r=e;else return;break}if(t&&e.length===1&&e!=="Enter"){let a=e.toLowerCase().charCodeAt(0);a>=97&&a<=122&&(r=String.fromCharCode(a-96))}await this.sendInput(r)}async sendInputInternal(i,e){if(this.session)try{if(this.useWebSocketInput&&Ps.sendInput(i))return;xt.debug("WebSocket unavailable, falling back to HTTP");let t=await fetch(`/api/sessions/${this.session.id}/input`,{method:"POST",headers:{"Content-Type":"application/json",...N.getAuthHeader()},body:JSON.stringify(i)});t.ok||(t.status===400?(xt.log("session no longer accepting input (likely exited)"),this.session&&(this.session.status="exited",this.callbacks&&this.callbacks.requestUpdate())):xt.error(`failed to ${e}`,{status:t.status}))}catch(t){xt.error(`error ${e}`,t)}}async sendInputText(i){await this.sendInputInternal({text:i},"send input to session")}async sendControlSequence(i){await this.sendInputInternal({text:i},"send control sequence to session")}async sendInput(i){let t=["enter","escape","backspace","tab","shift_tab","arrow_up","arrow_down","arrow_left","arrow_right","ctrl_enter","shift_enter","page_up","page_down","home","end","delete","f1","f2","f3","f4","f5","f6","f7","f8","f9","f10","f11","f12"].includes(i)?{key:i}:{text:i};await this.sendInputInternal(t,"send input to session")}isKeyboardShortcut(i){let e=i.target;if(e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.tagName==="SELECT"||e.contentEditable==="true"||e.closest?.(".monaco-editor")||e.closest?.("[data-keybinding-context]")||e.closest?.(".editor-container")||e.closest?.("inline-edit"))return!!or(i);if(ps(i))return!0;let t=/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)||navigator.platform&&navigator.platform.indexOf("Mac")>=0;if(i.key==="F12"||!t&&i.ctrlKey&&i.shiftKey&&i.key==="I"||t&&i.metaKey&&i.altKey&&i.key==="I"||(i.altKey||i.metaKey)&&i.key==="Tab")return!0;let s=/Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)||navigator.platform&&navigator.platform.indexOf("Mac")>=0,n=i.key.toLowerCase();return!!(s&&i.metaKey&&i.altKey&&["arrowleft","arrowright"].includes(n)||!(this.callbacks?.getKeyboardCaptureActive?.()??!0)&&(s&&i.metaKey&&!i.shiftKey&&!i.altKey&&["a","f","r","l","p","s","d"].includes(n)||!s&&i.ctrlKey&&!i.shiftKey&&!i.altKey&&["a","f","r","l","p","s","d"].includes(n)))}cleanup(){this.imeInput&&(this.imeInput.cleanup(),this.imeInput=null),this.useWebSocketInput&&Ps.disconnect(),this.session=null,this.callbacks=null}getIMEInputForTesting(){return this.imeInput}};q();var Ke=P("lifecycle-event-manager"),Hs=class extends xi{constructor(){super();this.callbacks=null;this.session=null;this.sessionViewElement=null;this.touchStartX=0;this.touchStartY=0;this.keyboardListenerAdded=!1;this.touchListenersAdded=!1;this.visualViewportHandler=null;this.clickHandler=null;this.touchCapabilityCache=null;this.handlePreferencesChanged=e=>{if(!this.callbacks)return;let s=e.detail;this.callbacks.setUseDirectKeyboard(s.useDirectKeyboard),s.touchKeyboardPreference&&(localStorage.setItem("touchKeyboardPreference",s.touchKeyboardPreference),this.touchCapabilityCache=null,this.updateMobileStatus());let n=this.callbacks.getIsMobile(),o=this.callbacks.getUseDirectKeyboard(),r=this.callbacks.getDirectKeyboardManager();n&&o&&!r.getShowQuickKeys()?r.ensureHiddenInputVisible():o||(r.cleanup(),this.callbacks.setShowQuickKeys(!1))};this.handleWindowResize=()=>{this.callbacks&&(this.touchCapabilityCache=null,this.updateMobileStatus())};this.keyboardHandler=e=>{if(!this.callbacks||this.callbacks.getDisableFocusManagement()||document.body.getAttribute("data-ime-input-focused")==="true"&&!Bs(e)||document.body.getAttribute("data-ime-composing")==="true"||this.callbacks.getInputManager()?.isKeyboardShortcut(e))return;if((e.metaKey||e.ctrlKey)&&e.key==="o"){wt(e),this.callbacks.setShowFileBrowser(!0);return}if(!this.session)return;let s=e.composedPath();for(let n of s)if(n instanceof HTMLElement&&n.tagName?.toLowerCase()==="inline-edit")return;if(e.key==="Escape"&&this.session.status==="exited"){this.callbacks.handleBack();return}wt(e),this.callbacks.handleKeyboardInput(e)};this.touchStartHandler=e=>{if(!this.callbacks||!this.callbacks.getIsMobile())return;let s=e.touches[0];this.touchStartX=s.clientX,this.touchStartY=s.clientY};this.touchEndHandler=e=>{if(!this.callbacks||!this.callbacks.getIsMobile())return;let s=e.changedTouches[0],n=s.clientX,o=s.clientY,r=n-this.touchStartX,a=o-this.touchStartY,m=r>100,p=Math.abs(a)<100,h=this.touchStartX<50;m&&p&&h&&this.callbacks.handleBack()};this.handleClickOutside=e=>{if(!this.callbacks)return;if(this.callbacks.getShowWidthSelector()){let s=e.target,n=this.callbacks.querySelector(".width-selector-container"),o=this.callbacks.querySelector(".width-selector-button");!n?.contains(s)&&!o?.contains(s)&&(this.callbacks.setShowWidthSelector(!1),this.callbacks.setCustomWidth(""))}};Ke.log("LifecycleEventManager initialized")}setSessionViewElement(e){this.sessionViewElement=e}setCallbacks(e){this.callbacks=e}setSession(e){this.session=e}detectTouchCapabilities(){if(this.touchCapabilityCache)return this.touchCapabilityCache;let e="ontouchstart"in window||navigator.maxTouchPoints>0||(navigator.msMaxTouchPoints??0)>0||window.matchMedia?.("(any-pointer: coarse)").matches===!0,t=window.matchMedia("(any-pointer: coarse)").matches,s=window.matchMedia("(any-pointer: fine)").matches,n=window.matchMedia("(any-hover: hover)").matches;return this.touchCapabilityCache={hasTouch:e,isCoarsePointer:t,hasFinePointer:s,hasHover:n},Ke.log("Touch capabilities detected:",this.touchCapabilityCache),this.touchCapabilityCache}shouldEnableTouchKeyboard(){let e=localStorage.getItem("touchKeyboardPreference")||"auto";if(e==="always")return!0;if(e==="never")return!1;let t=this.detectTouchCapabilities(),s=t.hasTouch&&t.isCoarsePointer&&!t.hasHover,n=t.hasTouch&&t.hasFinePointer,r=Math.min(window.innerWidth,window.innerHeight)<1024;return s||n&&r}updateMobileStatus(){if(!this.callbacks)return;let e=this.shouldEnableTouchKeyboard(),t=this.detectTouchCapabilities(),s=window.innerWidth,n=t.hasTouch&&s>=768,o=t.hasTouch&&s<768;if(window.__deviceType=n?"tablet":o?"phone":"desktop",this.callbacks.getIsMobile()!==e&&(this.callbacks.setIsMobile(e),!e)){let a=this.callbacks.getDirectKeyboardManager();a&&(a.cleanup(),this.callbacks.setShowQuickKeys(!1))}}setupLifecycle(){if(!this.callbacks)return;this.callbacks.setTabIndex(0),this.clickHandler=()=>{this.callbacks?.getDisableFocusManagement()||this.callbacks?.focus()},this.callbacks.addEventListener("click",this.clickHandler),document.addEventListener("click",this.handleClickOutside),this.session||this.callbacks.startLoading();let e=this.shouldEnableTouchKeyboard(),t=this.detectTouchCapabilities(),s=window.innerWidth,n=t.hasTouch&&s>=768,o=t.hasTouch&&s<768;window.__deviceType=n?"tablet":o?"phone":"desktop",this.callbacks.setIsMobile(e),Ke.log("Touch keyboard enabled:",e),Ke.log("Device type:",window.__deviceType),window.addEventListener("app-preferences-changed",this.handlePreferencesChanged),window.addEventListener("resize",this.handleWindowResize),this.setupMobileFeatures(e),this.setupEventListeners(e)}setupMobileFeatures(e){if(this.callbacks){if(e&&"virtualKeyboard"in navigator)try{let t=navigator;t.virtualKeyboard&&(t.virtualKeyboard.overlaysContent=!0),Ke.log("VirtualKeyboard API: overlaysContent enabled")}catch(t){Ke.warn("Failed to set virtualKeyboard.overlaysContent:",t)}else e&&Ke.log("VirtualKeyboard API not available on this device");if(e&&window.visualViewport){let t=0;this.visualViewportHandler=()=>{let s=window.visualViewport;if(!s||!this.callbacks)return;let n=window.innerHeight-s.height;this.callbacks.setKeyboardHeight(n);let o=this.callbacks.querySelector("terminal-quick-keys");if(o&&(o.keyboardHeight=n),Ke.log(`Visual Viewport keyboard height: ${n}px`),t>50&&n<50){Ke.log("Keyboard dismissed detected via viewport change");let r=this.callbacks.getUseDirectKeyboard(),a=this.callbacks.getDirectKeyboardManager();if(r&&a&&a.getShowQuickKeys()){if(a.isRecentlyEnteredKeyboardMode?.()??!1){Ke.log("Ignoring keyboard dismissal - recently entered keyboard mode, likely iOS animation");return}this.callbacks.setShowQuickKeys(!1),a.setShowQuickKeys&&a.setShowQuickKeys(!1),Ke.log("Force hiding quick keys after keyboard dismissal")}}t=n},window.visualViewport.addEventListener("resize",this.visualViewportHandler),window.visualViewport.addEventListener("scroll",this.visualViewportHandler)}}}setupEventListeners(e){!e&&!this.keyboardListenerAdded?(document.addEventListener("keydown",this.keyboardHandler),this.keyboardListenerAdded=!0):e&&!this.touchListenersAdded&&(document.addEventListener("touchstart",this.touchStartHandler,{passive:!0}),document.addEventListener("touchend",this.touchEndHandler,{passive:!0}),this.touchListenersAdded=!0)}teardownLifecycle(){if(!this.callbacks)return;Ke.log("SessionView disconnectedCallback called",{sessionId:this.session?.id,sessionStatus:this.session?.status}),this.callbacks.setConnected(!1);let e=this.callbacks.getTerminalLifecycleManager();this.session&&this.session.status!=="exited"&&e&&(Ke.log("Calling resetTerminalSize for session",this.session.id),e.resetTerminalSize());let t=this.callbacks.getConnectionManager();t&&t.setConnected(!1),e&&e.cleanup(),document.removeEventListener("click",this.handleClickOutside),this.clickHandler&&(this.callbacks.removeEventListener("click",this.clickHandler),this.clickHandler=null),!this.callbacks.getIsMobile()&&this.keyboardListenerAdded?(document.removeEventListener("keydown",this.keyboardHandler),this.keyboardListenerAdded=!1):this.callbacks.getIsMobile()&&this.touchListenersAdded&&(document.removeEventListener("touchstart",this.touchStartHandler),document.removeEventListener("touchend",this.touchEndHandler),this.touchListenersAdded=!1);let s=this.callbacks.getDirectKeyboardManager();s&&s.cleanup(),this.visualViewportHandler&&window.visualViewport&&(window.visualViewport.removeEventListener("resize",this.visualViewportHandler),window.visualViewport.removeEventListener("scroll",this.visualViewportHandler),this.visualViewportHandler=null),window.removeEventListener("app-preferences-changed",this.handlePreferencesChanged),window.removeEventListener("resize",this.handleWindowResize),this.callbacks.stopLoading(),t&&t.cleanupStreamConnection()}cleanup(){Ke.log("LifecycleEventManager cleanup"),document.removeEventListener("click",this.handleClickOutside),window.removeEventListener("app-preferences-changed",this.handlePreferencesChanged),window.removeEventListener("resize",this.handleWindowResize),!this.callbacks?.getIsMobile()&&this.keyboardListenerAdded?(document.removeEventListener("keydown",this.keyboardHandler),this.keyboardListenerAdded=!1):this.callbacks?.getIsMobile()&&this.touchListenersAdded&&(document.removeEventListener("touchstart",this.touchStartHandler),document.removeEventListener("touchend",this.touchEndHandler),this.touchListenersAdded=!1),this.visualViewportHandler&&window.visualViewport&&(window.visualViewport.removeEventListener("resize",this.visualViewportHandler),window.visualViewport.removeEventListener("scroll",this.visualViewportHandler),this.visualViewportHandler=null),this.clickHandler=null,this.sessionViewElement=null,this.callbacks=null,this.session=null}};var Fs=class{constructor(){this.loading=!1;this.loadingFrame=0;this.loadingInterval=null}isLoading(){return this.loading}getLoadingFrame(){return this.loadingFrame}startLoading(i){this.loading=!0,this.loadingFrame=0,this.loadingInterval=window.setInterval(()=>{this.loadingFrame=(this.loadingFrame+1)%4,i&&i()},200)}stopLoading(){this.loading=!1,this.loadingInterval&&(clearInterval(this.loadingInterval),this.loadingInterval=null)}getLoadingText(){let i=["\u280B","\u2819","\u2839","\u2838","\u283C","\u2834","\u2826","\u2827","\u2807","\u280F"];return i[this.loadingFrame%i.length]}cleanup(){this.loadingInterval&&(clearInterval(this.loadingInterval),this.loadingInterval=null)}};var Os=class{constructor(i){this.inputManager=null;this.sessionView=i}setInputManager(i){this.inputManager=i}handleMobileInputToggle(){if(this.sessionView.shouldUseDirectKeyboard()){this.sessionView.focusHiddenInput();return}this.sessionView.toggleMobileInputDisplay()}async handleMobileInputSendOnly(i){let e=i?.trim();if(e)try{this.inputManager&&await this.inputManager.sendInputText(e),this.sessionView.clearMobileInputText(),this.sessionView.requestUpdate(),this.sessionView.closeMobileInput(),this.sessionView.shouldRefocusHiddenInput()&&this.sessionView.refocusHiddenInput(),this.sessionView.refreshTerminalAfterMobileInput()}catch(t){console.error("error sending mobile input",t)}}async handleMobileInputSend(i){let e=i?.trim();if(e)try{this.inputManager&&(await this.inputManager.sendInputText(e),await this.inputManager.sendInput("enter")),this.sessionView.clearMobileInputText(),this.sessionView.requestUpdate(),this.sessionView.closeMobileInput(),this.sessionView.shouldRefocusHiddenInput()&&this.sessionView.refocusHiddenInput(),this.sessionView.refreshTerminalAfterMobileInput()}catch(t){console.error("error sending mobile input",t)}}handleMobileInputCancel(){this.sessionView.closeMobileInput(),this.sessionView.clearMobileInputText(),this.sessionView.shouldRefocusHiddenInput()&&(this.sessionView.startFocusRetention(),this.sessionView.delayedRefocusHiddenInput())}cleanup(){this.inputManager=null}};Me();q();var qi=P("session-actions-handler"),zs=class{constructor(){this.callbacks=null}setCallbacks(i){this.callbacks=i}async handleRename(i,e){if(!this.callbacks)return;let t=this.callbacks.getSession();if(!t||i!==t.id)return;let s=await ks(i,e,N);if(s.success){let n=e;this.callbacks.setSession({...t,name:n});let o=n||t.command.join(" ");$t.setSessionTitle(o),this.callbacks.dispatchEvent(new CustomEvent("session-renamed",{detail:{sessionId:i,newName:n},bubbles:!0,composed:!0})),qi.log(`Session ${i} renamed to: ${n}`)}else this.callbacks.dispatchEvent(new CustomEvent("error",{detail:`Failed to rename session: ${s.error}`,bubbles:!0,composed:!0}))}async handleTerminateSession(){if(!this.callbacks)return;let i=this.callbacks.getSession();i&&await Wi.terminateSession(i,{authClient:N,callbacks:{onError:e=>{this.callbacks&&this.callbacks.dispatchEvent(new CustomEvent("error",{detail:e,bubbles:!0,composed:!0}))},onSuccess:()=>{}}})}async handleClearSession(){if(!this.callbacks)return;let i=this.callbacks.getSession();i&&await Wi.clearSession(i,{authClient:N,callbacks:{onError:e=>{this.callbacks&&this.callbacks.dispatchEvent(new CustomEvent("error",{detail:e,bubbles:!0,composed:!0}))},onSuccess:()=>{this.callbacks&&this.callbacks.handleBack()}}})}handleToggleViewMode(){if(!this.callbacks||!this.callbacks.getSession()?.gitRepoPath)return;let t=this.callbacks.getViewMode()==="terminal"?"worktree":"terminal";this.callbacks.setViewMode(t),t==="terminal"&&requestAnimationFrame(()=>{this.callbacks?.ensureTerminalInitialized()})}handleSessionExit(i,e){if(!this.callbacks)return;let t=this.callbacks.getSession();if(!t||i!==t.id)return;qi.log("Session exit event received",{sessionId:i,exitCode:e}),this.callbacks.setSession({...t,status:"exited"}),this.callbacks.requestUpdate(),this.callbacks.dispatchEvent(new CustomEvent("session-status-changed",{detail:{sessionId:t.id,newStatus:"exited",exitCode:e},bubbles:!0})),new URLSearchParams(window.location.search).get("session")===i&&(qi.log(`Session ${i} exited, attempting to close window`),setTimeout(()=>{try{window.close(),setTimeout(()=>{qi.log("Window close failed - likely opened as a regular tab")},100)}catch(o){qi.warn("Failed to close window:",o)}},500))}canToggleViewMode(i){return!!i?.gitRepoPath}};we();Me();q();var Ie=P("terminal-lifecycle-manager"),Ns=class{constructor(){this.session=null;this.terminal=null;this.connectionManager=null;this.inputManager=null;this.connected=!1;this.terminalFontSize=14;this.terminalMaxCols=0;this.terminalTheme="auto";this.resizeTimeout=null;this.lastResizeWidth=0;this.lastResizeHeight=0;this.domElement=null;this.eventHandlers=null;this.stateCallbacks=null}setSession(i){this.session=i}setTerminal(i){this.terminal=i}setConnectionManager(i){this.connectionManager=i}setInputManager(i){this.inputManager=i}setConnected(i){this.connected=i}setTerminalFontSize(i){this.terminalFontSize=i}setTerminalMaxCols(i){this.terminalMaxCols=i}setTerminalTheme(i){this.terminalTheme=i}getTerminal(){return this.terminal}setDomElement(i){this.domElement=i}setEventHandlers(i){this.eventHandlers=i}setStateCallbacks(i){this.stateCallbacks=i}setupTerminal(){}async initializeTerminal(){if(!this.domElement){Ie.warn("Cannot initialize terminal - missing DOM element");return}let i=this.domElement.querySelector("terminal-renderer vibe-terminal")||this.domElement.querySelector("terminal-renderer vibe-terminal-binary")||this.domElement.querySelector("vibe-terminal")||this.domElement.querySelector("vibe-terminal-binary");if(Ie.debug("Terminal search results:",{hasTerminalRenderer:!!this.domElement.querySelector("terminal-renderer"),hasDirectTerminal:!!this.domElement.querySelector("vibe-terminal"),hasDirectBinaryTerminal:!!this.domElement.querySelector("vibe-terminal-binary"),hasNestedTerminal:!!this.domElement.querySelector("terminal-renderer vibe-terminal"),hasNestedBinaryTerminal:!!this.domElement.querySelector("terminal-renderer vibe-terminal-binary"),foundElement:!!i,sessionId:this.session?.id}),!i||!this.session){Ie.warn("Cannot initialize terminal - missing element or session");return}this.terminal=i,this.connectionManager&&(this.connectionManager.setTerminal(this.terminal),this.connectionManager.setSession(this.session)),this.terminal.cols=80,this.terminal.rows=24,this.terminal.fontSize=this.terminalFontSize,this.terminal.fitHorizontally=!1,this.terminal.maxCols=this.terminalMaxCols,this.terminal.theme=this.terminalTheme,this.eventHandlers&&(this.terminal.addEventListener("session-exit",this.eventHandlers.handleSessionExit),this.terminal.addEventListener("terminal-resize",this.eventHandlers.handleTerminalResize),this.terminal.addEventListener("terminal-paste",this.eventHandlers.handleTerminalPaste)),setTimeout(()=>{this.connected&&this.connectionManager?(Ie.debug("Connecting to stream for terminal",{terminalElement:!!this.terminal,sessionId:this.session?.id,connected:this.connected}),this.connectionManager.connectToStream()):Ie.warn("Component disconnected before stream connection")},0)}async handleTerminalResize(i){let e=i,{cols:t,rows:s,isMobile:n,isHeightOnlyChange:o,source:r}=e.detail;if(Ie.debug("Terminal resize event:",{cols:t,rows:s,source:r,sessionId:this.session?.id}),this.stateCallbacks&&this.stateCallbacks.updateTerminalDimensions(t,s),n&&o){Ie.debug(`skipping mobile height-only resize to server: ${t}x${s} (source: ${r})`);return}this.resizeTimeout&&clearTimeout(this.resizeTimeout),this.resizeTimeout=window.setTimeout(async()=>{if(t===this.lastResizeWidth&&s===this.lastResizeHeight){Ie.debug(`skipping redundant resize request: ${t}x${s}`);return}if(this.session&&this.session.status!=="exited")try{Ie.debug(`sending resize request: ${t}x${s} (was ${this.lastResizeWidth}x${this.lastResizeHeight})`);let a=await fetch(`/api/sessions/${this.session.id}/resize`,{method:"POST",headers:{"Content-Type":"application/json",...N.getAuthHeader()},body:JSON.stringify({cols:t,rows:s})});a.ok?(this.lastResizeWidth=t,this.lastResizeHeight=s):Ie.warn(`failed to resize session: ${a.status}`)}catch(a){Ie.warn("failed to send resize request",a)}},250)}handleTerminalPaste(i){let t=i.detail?.text;t&&this.session&&this.inputManager&&this.inputManager.sendInputText(t)}async resetTerminalSize(){if(!this.session){Ie.warn("resetTerminalSize called but no session available");return}Ie.log("Sending reset-size request for session",this.session.id);try{let i=await fetch(`/api/sessions/${this.session.id}/reset-size`,{method:"POST",headers:{"Content-Type":"application/json",...N.getAuthHeader()}});i.ok?Ie.log("terminal size reset successfully for session",this.session.id):Ie.error("failed to reset terminal size",{status:i.status,sessionId:this.session.id})}catch(i){Ie.error("error resetting terminal size",{error:i,sessionId:this.session.id})}}cleanup(){this.resizeTimeout&&(clearTimeout(this.resizeTimeout),this.resizeTimeout=null)}};q();var Er=P("terminal-settings-manager"),Ws=class{constructor(){this.preferencesManager=Ze.getInstance();this.callbacks=null;this.terminalMaxCols=0;this.terminalFontSize=14;this.terminalTheme="auto";this.terminalFitHorizontally=!1;this.loadPreferences()}setCallbacks(i){this.callbacks=i,i&&(i.setTerminalMaxCols(this.terminalMaxCols),i.setTerminalFontSize(this.terminalFontSize),i.setTerminalTheme(this.terminalTheme))}loadPreferences(){this.terminalMaxCols=this.preferencesManager.getMaxCols(),this.terminalFontSize=this.preferencesManager.getFontSize(),this.terminalTheme=this.preferencesManager.getTheme(),Er.debug("Loaded terminal preferences:",{maxCols:this.terminalMaxCols,fontSize:this.terminalFontSize,theme:this.terminalTheme})}getMaxCols(){return this.terminalMaxCols}getFontSize(){return this.terminalFontSize}getTheme(){return this.terminalTheme}handleMaxWidthToggle(){this.callbacks&&this.callbacks.setShowWidthSelector(!0)}handleWidthSelect(i){if(!this.callbacks)return;this.terminalMaxCols=i,this.preferencesManager.setMaxCols(i),this.callbacks.setShowWidthSelector(!1),this.callbacks.setTerminalMaxCols(i);let e=this.callbacks.getTerminalLifecycleManager();e&&e.setTerminalMaxCols(i);let t=this.callbacks.getTerminalElement();t?(t.maxCols=i,t.setUserOverrideWidth(!0),t.requestUpdate()):Er.warn("Terminal component not found when setting width")}getCurrentWidthLabel(){if(!this.callbacks)return"\u221E";let i=this.callbacks.getTerminalElement(),e=i?.userOverrideWidth||!1,t=i?.initialCols||0,n=this.callbacks.getSession()?.id?.startsWith("fwd_");if(this.terminalMaxCols===0&&t>0&&!e&&n)return`\u2264${t}`;if(this.terminalMaxCols===0)return"\u221E";{let o=Ki.find(r=>r.value===this.terminalMaxCols);return o?o.label:this.terminalMaxCols.toString()}}getWidthTooltip(){if(!this.callbacks)return"Terminal width: Unlimited";let i=this.callbacks.getTerminalElement(),e=i?.userOverrideWidth||!1,t=i?.initialCols||0,n=this.callbacks.getSession()?.id?.startsWith("fwd_");return this.terminalMaxCols===0&&t>0&&!e&&n?`Terminal width: Limited to native terminal width (${t} columns)`:`Terminal width: ${this.terminalMaxCols===0?"Unlimited":`${this.terminalMaxCols} columns`}`}handleFontSizeChange(i){if(!this.callbacks)return;let e=Math.max(8,Math.min(32,i));this.terminalFontSize=e,this.preferencesManager.setFontSize(e),this.callbacks.setTerminalFontSize(e);let t=this.callbacks.getTerminalLifecycleManager();t&&t.setTerminalFontSize(e);let s=this.callbacks.getTerminalElement();s&&(s.fontSize=e,s.requestUpdate())}handleThemeChange(i){if(!this.callbacks)return;Er.debug("Changing terminal theme to:",i),this.terminalTheme=i,this.preferencesManager.setTheme(i),this.callbacks.setTerminalTheme(i);let e=this.callbacks.getTerminalLifecycleManager();e&&e.setTerminalTheme(i);let t=this.callbacks.getTerminalElement();t&&(t.theme=i,t.requestUpdate())}handleTerminalFitToggle(){if(!this.callbacks)return;this.terminalFitHorizontally=!this.terminalFitHorizontally;let i=this.callbacks.getTerminalElement();i?.handleFitToggle&&i.handleFitToggle()}getTerminalMaxCols(){return this.terminalMaxCols}getTerminalFontSize(){return this.terminalFontSize}getTerminalTheme(){return this.terminalTheme}getTerminalFitHorizontally(){return this.terminalFitHorizontally}initializeTerminal(i){i.maxCols=this.terminalMaxCols,i.fontSize=this.terminalFontSize,i.theme=this.terminalTheme}};q();var qn=P("ui-state-manager"),Ks=class{constructor(){this.state={connected:!1,macAppConnected:!1,isMobile:!1,isLandscape:!1,showMobileInput:!1,mobileInputText:"",useDirectKeyboard:!0,showQuickKeys:!1,keyboardHeight:0,touchStartX:0,touchStartY:0,terminalCols:0,terminalRows:0,showCtrlAlpha:!1,ctrlSequence:[],showFileBrowser:!1,showImagePicker:!1,showWidthSelector:!1,customWidth:"",isDragOver:!1,terminalFitHorizontally:!1,terminalMaxCols:0,terminalFontSize:14,terminalTheme:"auto",useBinaryMode:!1,viewMode:"terminal",keyboardCaptureActive:!0};this.callbacks=null}setCallbacks(i){this.callbacks=i}getState(){return{...this.state}}setConnected(i){this.state.connected=i,this.callbacks?.requestUpdate()}setMacAppConnected(i){this.state.macAppConnected=i,this.callbacks?.requestUpdate()}setIsMobile(i){this.state.isMobile=i,this.callbacks?.requestUpdate()}setIsLandscape(i){this.state.isLandscape=i,this.callbacks?.requestUpdate()}setShowMobileInput(i){this.state.showMobileInput=i,this.callbacks?.requestUpdate()}setMobileInputText(i){this.state.mobileInputText=i,this.callbacks?.requestUpdate()}setUseDirectKeyboard(i){this.state.useDirectKeyboard=i,this.callbacks?.requestUpdate()}setShowQuickKeys(i){this.state.showQuickKeys=i,this.callbacks?.requestUpdate()}setKeyboardHeight(i){this.state.keyboardHeight=i,this.callbacks?.requestUpdate()}setTouchStart(i,e){this.state.touchStartX=i,this.state.touchStartY=e}setTerminalDimensions(i,e){this.state.terminalCols=i,this.state.terminalRows=e,this.callbacks?.requestUpdate()}setShowCtrlAlpha(i){this.state.showCtrlAlpha=i,this.callbacks?.requestUpdate()}setCtrlSequence(i){this.state.ctrlSequence=i,this.callbacks?.requestUpdate()}addCtrlSequence(i){this.state.ctrlSequence=[...this.state.ctrlSequence,i],this.callbacks?.requestUpdate()}clearCtrlSequence(){this.state.ctrlSequence=[],this.callbacks?.requestUpdate()}setShowFileBrowser(i){this.state.showFileBrowser=i,this.callbacks?.requestUpdate()}setShowImagePicker(i){this.state.showImagePicker=i,this.callbacks?.requestUpdate()}setShowWidthSelector(i){this.state.showWidthSelector=i,this.callbacks?.requestUpdate()}setCustomWidth(i){this.state.customWidth=i,this.callbacks?.requestUpdate()}setIsDragOver(i){this.state.isDragOver=i,this.callbacks?.requestUpdate()}setTerminalFitHorizontally(i){this.state.terminalFitHorizontally=i,this.callbacks?.requestUpdate()}setTerminalMaxCols(i){this.state.terminalMaxCols=i,this.callbacks?.requestUpdate()}setTerminalFontSize(i){this.state.terminalFontSize=i,this.callbacks?.requestUpdate()}setTerminalTheme(i){this.state.terminalTheme=i,this.callbacks?.requestUpdate()}setUseBinaryMode(i){this.state.useBinaryMode=i,this.callbacks?.requestUpdate()}setViewMode(i){this.state.viewMode=i,this.callbacks?.requestUpdate()}setKeyboardCaptureActive(i){this.state.keyboardCaptureActive=i,this.callbacks?.requestUpdate()}toggleMobileInput(){this.state.showMobileInput=!this.state.showMobileInput,this.callbacks?.requestUpdate()}toggleCtrlAlpha(){this.state.showCtrlAlpha=!this.state.showCtrlAlpha,this.callbacks?.requestUpdate()}toggleDirectKeyboard(){this.state.useDirectKeyboard=!this.state.useDirectKeyboard;try{let i=localStorage.getItem("vibetunnel_app_preferences"),e=i?JSON.parse(i):{};e.useDirectKeyboard=this.state.useDirectKeyboard,localStorage.setItem("vibetunnel_app_preferences",JSON.stringify(e)),window.dispatchEvent(new CustomEvent("app-preferences-changed",{detail:e}))}catch(i){qn.error("Failed to save direct keyboard preference",i)}this.callbacks?.requestUpdate()}checkOrientation(){let i=window.matchMedia("(orientation: landscape)").matches;this.state.isLandscape=i,this.callbacks?.requestUpdate()}loadDirectKeyboardPreference(){try{let i=localStorage.getItem("vibetunnel_app_preferences");if(i){let e=JSON.parse(i);this.state.useDirectKeyboard=e.useDirectKeyboard??!0}else this.state.useDirectKeyboard=!0}catch(i){qn.error("Failed to load app preferences",i),this.state.useDirectKeyboard=!0}}};q();var Vn="1.0.0-beta.16";var ce=P("settings"),jn={useDirectKeyboard:!0,useBinaryMode:!1},Ht="vibetunnel_app_preferences",Ae=class extends R{constructor(){super(...arguments);this.visible=!1;this.notificationPreferences=es;this.permission="default";this.subscription=null;this.isLoading=!1;this.testingNotification=!1;this.appPreferences=jn;this.repositoryBasePath=Ue;this.mediaState=Mt.getCurrentState();this.repositoryCount=0;this.isDiscoveringRepositories=!1;this.handleKeyDown=e=>{e.key==="Escape"&&this.visible&&this.handleClose()}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.initializeNotifications(),this.loadAppPreferences(),this.serverConfigService=new Wt(this.authClient),this.authClient&&(this.repositoryService=new Lt(this.authClient,this.serverConfigService)),this.unsubscribeResponsive=Mt.subscribe(e=>{this.mediaState=e})}disconnectedCallback(){super.disconnectedCallback(),this.permissionChangeUnsubscribe&&this.permissionChangeUnsubscribe(),this.subscriptionChangeUnsubscribe&&this.subscriptionChangeUnsubscribe(),this.unsubscribeResponsive&&this.unsubscribeResponsive(),document.removeEventListener("keydown",this.handleKeyDown)}willUpdate(e){e.has("visible")&&(this.visible?(document.addEventListener("keydown",this.handleKeyDown),this.requestUpdate(),this.discoverRepositories(),this.refreshNotificationState()):document.removeEventListener("keydown",this.handleKeyDown)),e.has("authClient")&&this.authClient&&(!this.repositoryService&&this.serverConfigService&&(this.repositoryService=new Lt(this.authClient,this.serverConfigService)),this.serverConfigService&&this.serverConfigService.setAuthClient(this.authClient),this.visible&&this.discoverRepositories())}async initializeNotifications(){await X.waitForInitialization(),this.permission=X.getPermission(),this.subscription=X.getSubscription(),this.notificationPreferences=await X.loadPreferences();let e=X.getSubscriptionStatus();ce.debug("Notification initialization status:",e),this.notificationPreferences.enabled&&!this.subscription&&e.hasPermission&&(ce.log("Notifications enabled but no subscription found, attempting to refresh..."),await X.forceRefreshSubscription(),this.subscription=X.getSubscription()),this.permissionChangeUnsubscribe=X.onPermissionChange(t=>{this.permission=t,this.requestUpdate()}),this.subscriptionChangeUnsubscribe=X.onSubscriptionChange(t=>{this.subscription=t,this.requestUpdate()})}async refreshNotificationState(){this.permission=X.getPermission(),this.subscription=X.getSubscription(),this.notificationPreferences=await X.loadPreferences(),ce.debug("Refreshed notification state:",{permission:this.permission,hasSubscription:!!this.subscription,preferencesEnabled:this.notificationPreferences.enabled})}updated(e){super.updated(e),e.has("visible")&&this.visible&&this.loadAppPreferences()}async loadAppPreferences(){try{let e=localStorage.getItem(Ht);if(e&&(this.appPreferences={...jn,...JSON.parse(e)}),this.serverConfigService)try{let t=await this.serverConfigService.loadConfig(this.visible);this.repositoryBasePath=t.repositoryBasePath||Ue,ce.debug("Loaded repository base path:",this.repositoryBasePath),this.requestUpdate()}catch(t){ce.warn("Failed to fetch server config",t)}this.visible&&this.repositoryService&&this.discoverRepositories()}catch(e){ce.error("Failed to load app preferences",e)}}saveAppPreferences(){try{localStorage.setItem(Ht,JSON.stringify(this.appPreferences)),window.dispatchEvent(new CustomEvent("app-preferences-changed",{detail:this.appPreferences}))}catch(e){ce.error("Failed to save app preferences",e)}}async discoverRepositories(){if(!(!this.repositoryService||this.isDiscoveringRepositories)){this.isDiscoveringRepositories=!0;try{await new Promise(t=>setTimeout(t,100));let e=await this.repositoryService.discoverRepositories();this.repositoryCount=e.length,ce.log(`Discovered ${this.repositoryCount} repositories in ${this.repositoryBasePath}`)}catch(e){ce.error("Failed to discover repositories",e),this.repositoryCount=0}finally{this.isDiscoveringRepositories=!1}}}handleClose(){this.dispatchEvent(new CustomEvent("close"))}handleBackdropClick(e){e.target===e.currentTarget&&this.handleClose()}async handleToggleNotifications(){if(!this.isLoading){this.isLoading=!0;try{this.notificationPreferences.enabled?(await X.unsubscribe(),this.notificationPreferences={...this.notificationPreferences,enabled:!1},await X.savePreferences(this.notificationPreferences),this.dispatchEvent(new CustomEvent("notifications-disabled"))):await X.requestPermission()==="granted"?((await X.loadPreferences()).enabled?this.notificationPreferences={...this.notificationPreferences,enabled:!0}:(this.notificationPreferences=X.getRecommendedPreferences(),ce.log("Using recommended notification preferences for first-time enable")),await X.subscribe()?(await X.savePreferences(this.notificationPreferences),await this.showWelcomeNotification(),this.dispatchEvent(new CustomEvent("notifications-enabled"))):this.dispatchEvent(new CustomEvent("error",{detail:"Failed to subscribe to notifications"}))):this.dispatchEvent(new CustomEvent("error",{detail:"Notification permission denied. Please enable notifications in your browser settings."}))}catch(e){ce.error("Failed to toggle notifications:",e),this.dispatchEvent(new CustomEvent("error",{detail:"Failed to toggle notifications"}))}finally{this.isLoading=!1}}}async handleForceRefresh(){try{await X.forceRefreshSubscription(),this.subscription=X.getSubscription(),this.notificationPreferences=await X.loadPreferences(),ce.log("Force refresh completed")}catch(e){ce.error("Force refresh failed:",e)}}async handleTestNotification(){if(!this.testingNotification){this.testingNotification=!0;try{if(ce.log("\u{1F9EA} Starting test notification..."),ce.debug("Step 1: Checking service worker registration"),!X.isSupported())throw new Error("Push notifications not supported in this browser");ce.debug("Step 2: Checking notification permissions");let e=X.getPermission();if(e!=="granted")throw new Error(`Notification permission is ${e}, not granted`);if(ce.debug("Step 3: Checking push subscription"),!X.getSubscription())throw new Error("No active push subscription found");ce.debug("Step 4: Checking server push notification status");let s=await X.getServerStatus();if(!s.enabled)throw new Error("Push notifications disabled on server");if(!s.configured)throw new Error("VAPID keys not configured on server");ce.debug("Step 5: Sending test notification"),await X.sendTestNotification("Test notification from VibeTunnel"),ce.log("\u2705 Test notification sent successfully"),this.dispatchEvent(new CustomEvent("success",{detail:"Test notification sent successfully"}))}catch(e){let t=e instanceof Error?e.message:String(e);ce.error("\u274C Test notification failed:",t);let s="";t.includes("permission")?s="Please grant notification permissions in your browser settings":t.includes("subscription")?s="Please enable notifications in settings first":t.includes("server")?s="Server push notification service is not available":t.includes("VAPID")?s="VAPID keys are not properly configured":s="Check browser console for more details",this.dispatchEvent(new CustomEvent("error",{detail:`Test notification failed: ${t}. ${s}`}))}finally{this.testingNotification=!1}}}async handleNotificationPreferenceChange(e,t){this.notificationPreferences={...this.notificationPreferences,[e]:t},await X.savePreferences(this.notificationPreferences)}async showWelcomeNotification(){let e=await navigator.serviceWorker.ready;if(e)try{await e.showNotification("VibeTunnel Notifications Enabled",{body:"You'll now receive notifications for session events",icon:"/apple-touch-icon.png",badge:"/favicon-32.png",tag:"vibetunnel-settings-welcome",requireInteraction:!1,silent:!1}),ce.log("Settings welcome notification displayed")}catch(t){ce.error("Failed to show settings welcome notification:",t)}}handleAppPreferenceChange(e,t){this.appPreferences={...this.appPreferences,[e]:t},this.saveAppPreferences()}async handleRepositoryBasePathChange(e){if(this.serverConfigService)try{await this.serverConfigService.updateConfig({repositoryBasePath:e}),this.repositoryBasePath=e,this.discoverRepositories()}catch(t){ce.error("Failed to update repository base path:",t),this.requestUpdate()}}get isNotificationsSupported(){return X.isSupported()}get isNotificationsEnabled(){return this.notificationPreferences.enabled}renderSubscriptionStatus(){return this.subscription||X.isSubscribed()?u`
        <div class="flex items-center space-x-2">
          <span class="text-status-success font-mono">✓</span>
          <span class="text-sm text-primary">Active</span>
        </div>
      `:this.permission==="granted"?u`
        <div class="flex items-center space-x-2">
          <span class="text-status-warning font-mono">!</span>
          <span class="text-sm text-primary">Not subscribed</span>
        </div>
      `:u`
        <div class="flex items-center space-x-2">
          <span class="text-status-error font-mono">✗</span>
          <span class="text-sm text-primary">Disabled</span>
        </div>
      `}isIOSSafari(){let e=navigator.userAgent.toLowerCase();return/iphone|ipad|ipod/.test(e)}isStandalone(){return window.matchMedia("(display-mode: standalone)").matches||"standalone"in window.navigator&&window.navigator.standalone===!0}render(){return this.visible?u`
      <div class="modal-backdrop flex items-center justify-center" @click=${this.handleBackdropClick}>
        <div
          class="modal-content font-mono text-sm w-full max-w-[calc(100vw-1rem)] sm:max-w-md lg:max-w-2xl mx-2 sm:mx-4 max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col"
        >
          <!-- Header -->
          <div class="p-4 pb-4 border-b border-border/50 relative flex-shrink-0">
            <h2 class="text-primary text-lg font-bold">Settings</h2>
            <button
              class="absolute top-4 right-4 text-text-muted hover:text-primary transition-colors p-1"
              @click=${this.handleClose}
              title="Close"
              aria-label="Close settings"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-4 space-y-6">
            ${this.renderNotificationSettings()}
            ${this.renderAppSettings()}
          </div>

          <!-- Footer -->
          <div class="p-4 pt-3 border-t border-border/50 flex-shrink-0">
            <div class="flex items-center justify-between text-xs font-mono">
              <span class="text-muted">v${Vn}</span>
              <a href="/logs" class="text-primary hover:text-primary-hover transition-colors" target="_blank">
                View Logs
              </a>
            </div>
          </div>
        </div>
      </div>
    `:u``}renderNotificationSettings(){let e=this.isIOSSafari(),t=this.isStandalone(),s=this.permission==="granted"&&this.subscription;return u`
      <div class="space-y-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-md font-bold text-primary">Notifications</h3>
          ${this.renderSubscriptionStatus()}
        </div>
        
        ${this.isNotificationsSupported?u`
              <!-- Main toggle -->
              <div class="flex items-center justify-between p-4 bg-bg-tertiary rounded-lg border border-border/50">
                <div class="flex-1">
                  <label class="text-primary font-medium">Enable Notifications</label>
                  <p class="text-muted text-xs mt-1">
                    Receive alerts for session events
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked="${this.notificationPreferences.enabled}"
                  @click=${this.handleToggleNotifications}
                  ?disabled=${this.isLoading}
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-base ${this.notificationPreferences.enabled?"bg-primary":"bg-border"}"
                >
                  <span
                    class="inline-block h-5 w-5 transform rounded-full bg-bg-elevated transition-transform ${this.notificationPreferences.enabled?"translate-x-5":"translate-x-0.5"}"
                  ></span>
                </button>
              </div>

              ${this.isNotificationsEnabled?u`
                    <!-- Notification types -->
                    <div class="mt-4 space-y-4">
                      <div>
                        <h4 class="text-sm font-medium text-text-muted mb-3">Notification Types</h4>
                        <div class="space-y-2 bg-bg rounded-lg p-3">
                          ${this.renderNotificationToggle("sessionExit","Session Exit","When a session terminates or crashes (shows exit code)")}
                          ${this.renderNotificationToggle("sessionStart","Session Start","When a new session starts (useful for shared terminals)")}
                          ${this.renderNotificationToggle("commandError","Session Errors","When commands fail with non-zero exit codes")}
                          ${this.renderNotificationToggle("commandCompletion","Command Completion","When commands taking >3 seconds finish (builds, tests, etc.)")}
                          ${this.renderNotificationToggle("bell","System Alerts","Terminal bell (^G) from vim, IRC mentions, completion sounds")}
                          ${this.renderNotificationToggle("claudeTurn","Claude Turn","When Claude AI finishes responding and awaits input")}
                        </div>
                      </div>

                      <!-- Sound and vibration -->
                      <div>
                        <h4 class="text-sm font-medium text-text-muted mb-3">Notification Behavior</h4>
                        <div class="space-y-2 bg-bg rounded-lg p-3">
                          ${this.renderNotificationToggle("soundEnabled","Sound","Play a notification sound when alerts are triggered")}
                          ${this.renderNotificationToggle("vibrationEnabled","Vibration","Vibrate device with notifications (mobile devices only)")}
                        </div>
                      </div>
                    </div>

                    <!-- Test button -->
                    <div class="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                      <p class="text-xs text-muted">Test your notification settings</p>
                      <button
                        class="btn-secondary text-xs px-3 py-1.5"
                        @click=${this.handleTestNotification}
                        ?disabled=${this.testingNotification||!s}
                      >
                        ${this.testingNotification?"Testing...":"Test Notification"}
                      </button>
                    </div>

                    <!-- Debug section (only in development) -->
                    ${""}
                  `:""}
            `:u`
              <div class="p-4 bg-status-warning/10 border border-status-warning rounded-lg">
                ${e&&!t?u`
                      <p class="text-sm text-status-warning mb-2">
                        Push notifications require installing this app to your home screen.
                      </p>
                      <p class="text-xs text-status-warning opacity-80">
                        Tap the share button in Safari and select "Add to Home Screen" to enable push notifications.
                      </p>
                    `:window.isSecureContext?u`
                      <p class="text-sm text-status-warning">
                        Push notifications are not supported in this browser.
                      </p>
                    `:u`
                      <p class="text-sm text-status-warning mb-2">
                        ⚠️ Push notifications require a secure connection
                      </p>
                      <p class="text-xs text-status-warning opacity-80 mb-2">
                        You're accessing VibeTunnel via ${window.location.protocol}//${window.location.hostname}
                      </p>
                      <p class="text-xs text-status-info opacity-90">
                        To enable notifications, access VibeTunnel using:
                        <br>• https://${window.location.hostname}${window.location.port?`:${window.location.port}`:""}
                        <br>• http://localhost:${window.location.port||"4020"}
                        <br>• http://127.0.0.1:${window.location.port||"4020"}
                      </p>
                    `}
              </div>
            `}
      </div>
    `}renderNotificationToggle(e,t,s){return u`
      <div class="flex items-center justify-between py-2">
        <div class="flex-1 pr-4">
          <label class="text-primary text-sm font-medium">${t}</label>
          <p class="text-muted text-xs">${s}</p>
        </div>
        <button
          role="switch"
          aria-checked="${this.notificationPreferences[e]}"
          @click=${()=>this.handleNotificationPreferenceChange(e,!this.notificationPreferences[e])}
          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-base ${this.notificationPreferences[e]?"bg-primary":"bg-border"}"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-bg-elevated transition-transform ${this.notificationPreferences[e]?"translate-x-4":"translate-x-0.5"}"
          ></span>
        </button>
      </div>
    `}renderAppSettings(){return u`
      <div class="space-y-4">
        <h3 class="text-md font-bold text-primary mb-3">Application</h3>
        
        <!-- Direct keyboard input (Mobile only) -->
        ${this.mediaState.isMobile?u`
              <div class="flex items-center justify-between p-4 bg-bg-tertiary rounded-lg border border-border/50">
                <div class="flex-1">
                  <label class="text-primary font-medium">
                    Use Direct Keyboard
                  </label>
                  <p class="text-muted text-xs mt-1">
                    Capture keyboard input directly without showing a text field (desktop-like experience)
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked="${this.appPreferences.useDirectKeyboard}"
                  @click=${()=>this.handleAppPreferenceChange("useDirectKeyboard",!this.appPreferences.useDirectKeyboard)}
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-base ${this.appPreferences.useDirectKeyboard?"bg-primary":"bg-border"}"
                >
                  <span
                    class="inline-block h-5 w-5 transform rounded-full bg-bg-elevated transition-transform ${this.appPreferences.useDirectKeyboard?"translate-x-5":"translate-x-0.5"}"
                  ></span>
                </button>
              </div>
            `:""}


        <!-- Repository Base Path -->
        <div class="p-4 bg-bg-tertiary rounded-lg border border-border/50">
          <div class="mb-3">
            <div class="flex items-center justify-between">
              <label class="text-primary font-medium">Repository Base Path</label>
              <div class="flex items-center gap-2">
                ${this.isDiscoveringRepositories?u`<span id="repository-status" class="text-muted text-xs">Scanning...</span>`:u`<span id="repository-status" class="text-muted text-xs">${this.repositoryCount} repositories found</span>`}
                <button
                  @click=${()=>this.discoverRepositories()}
                  ?disabled=${this.isDiscoveringRepositories}
                  class="text-primary hover:text-primary-hover text-xs transition-colors duration-200"
                  title="Refresh repository list"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
            <p class="text-muted text-xs mt-1">
              Default directory for new sessions and repository discovery.
            </p>
          </div>
          <div class="flex gap-2">
            <input
              type="text"
              .value=${this.repositoryBasePath}
              @input=${e=>{let t=e.target;this.handleRepositoryBasePathChange(t.value)}}
              placeholder="~/"
              class="input-field py-2 text-sm flex-1"
            />
          </div>
        </div>
      </div>
    `}};d([C({type:Boolean})],Ae.prototype,"visible",2),d([C({type:Object})],Ae.prototype,"authClient",2),d([_()],Ae.prototype,"notificationPreferences",2),d([_()],Ae.prototype,"permission",2),d([_()],Ae.prototype,"subscription",2),d([_()],Ae.prototype,"isLoading",2),d([_()],Ae.prototype,"testingNotification",2),d([_()],Ae.prototype,"appPreferences",2),d([_()],Ae.prototype,"repositoryBasePath",2),d([_()],Ae.prototype,"mediaState",2),d([_()],Ae.prototype,"repositoryCount",2),d([_()],Ae.prototype,"isDiscoveringRepositories",2),Ae=d([D("vt-settings")],Ae);var to=uo(Yn());var Qn="terminal-shortcut",aa=[{pattern:/\bctrl\+([a-z])\b/gi,keySequence:c=>`ctrl_${c[1].toLowerCase()}`},{pattern:/\bctrl\+([0-9])\b/gi,keySequence:c=>`ctrl_${c[1]}`},{pattern:/\bctrl\+f([1-9]|1[0-2])\b/gi,keySequence:c=>`ctrl_f${c[1]}`},{pattern:/\bctrl\+shift\+([a-z])\b/gi,keySequence:c=>`ctrl_shift_${c[1].toLowerCase()}`},{pattern:/\balt\+([a-z])\b/gi,keySequence:c=>`alt_${c[1].toLowerCase()}`},{pattern:/\bcmd\+([a-z])\b/gi,keySequence:c=>`cmd_${c[1].toLowerCase()}`},{pattern:/\bf([1-9]|1[0-2])\b/gi,keySequence:c=>`f${c[1]}`},{pattern:/\besc\b/gi,keySequence:()=>"escape"},{pattern:/\bescape\b/gi,keySequence:()=>"escape"},{pattern:/\btab\b/gi,keySequence:()=>"tab"},{pattern:/\bshift\+tab\b/gi,keySequence:()=>"shift_tab"},{pattern:/\benter\b/gi,keySequence:()=>"enter"},{pattern:/\breturn\b/gi,keySequence:()=>"enter"},{pattern:/\bbackspace\b/gi,keySequence:()=>"backspace"},{pattern:/\bdelete\b/gi,keySequence:()=>"delete"},{pattern:/\bspace\b/gi,keySequence:()=>" "},{pattern:/\barrow\s+(up|down|left|right)\b/gi,keySequence:c=>`arrow_${c[1].toLowerCase()}`},{pattern:/\b(up|down|left|right)\s+arrow\b/gi,keySequence:c=>`arrow_${c[1].toLowerCase()}`},{pattern:/\bpage\s+(up|down)\b/gi,keySequence:c=>`page_${c[1].toLowerCase()}`},{pattern:/\b(home|end)\b/gi,keySequence:c=>c[1].toLowerCase()},{pattern:/\besc\s+to\s+(interrupt|quit|exit|cancel)\b/gi,keySequence:()=>"escape"},{pattern:/\bpress\s+esc\b/gi,keySequence:()=>"escape"},{pattern:/\bpress\s+enter\b/gi,keySequence:()=>"enter"},{pattern:/\bpress\s+tab\b/gi,keySequence:()=>"tab"},{pattern:/\bpress\s+ctrl\+([a-z])\b/gi,keySequence:c=>`ctrl_${c[1].toLowerCase()}`},{pattern:/\bctrl\+([a-z])\s+to\s+\w+/gi,keySequence:c=>`ctrl_${c[1].toLowerCase()}`},{pattern:/\bq\s+to\s+(quit|exit)\b/gi,keySequence:()=>"q"},{pattern:/\bpress\s+q\b/gi,keySequence:()=>"q"},{pattern:/❯\s*(\d+)\.\s+.*/g,keySequence:c=>c[1]},{pattern:/(\d+)\.\s+.*/g,keySequence:c=>c[1]}];function Xn(c,i){new Tr(c,i).process()}var Tr=class{constructor(i,e){this.processedRanges=new Map;this.container=i,this.lines=i.querySelectorAll(".terminal-line"),this.onShortcutClick=e}process(){if(this.lines.length!==0)for(let i=0;i<this.lines.length;i++)this.processLine(i)}processLine(i){let e=this.getLineText(i);if(!e)return;let t=this.findShortcutsInLine(e);for(let s of t)this.isRangeProcessed(i,s.start,s.end)||(this.createShortcutLink(s,i),this.markRangeAsProcessed(i,s.start,s.end))}findShortcutsInLine(i){let e=[];for(let s of aa){s.pattern.lastIndex=0;let n=s.pattern.exec(i);for(;n!==null;){let o=n[0],r=s.keySequence(n),a=n.index,m=n.index+o.length;e.push({text:o,keySequence:r,start:a,end:m}),n=s.pattern.exec(i)}}e.sort((s,n)=>s.start-n.start);let t=[];for(let s of e)t.some(o=>s.start<o.end&&s.end>o.start)||t.push(s);return t}createShortcutLink(i,e){let t=this.lines[e];new Mr(t,i,this.onShortcutClick).createLink()}getLineText(i){return i<0||i>=this.lines.length?"":this.lines[i].textContent||""}isRangeProcessed(i,e,t){let s=this.processedRanges.get(i);return s?s.some(n=>e<n.end&&t>n.start):!1}markRangeAsProcessed(i,e,t){this.processedRanges.has(i)||this.processedRanges.set(i,[]);let s=this.processedRanges.get(i);s&&s.push({start:e,end:t})}},Mr=class{constructor(i,e,t){this.lineElement=i,this.shortcut=e,this.onShortcutClick=t}createLink(){this.wrapTextInLink(this.lineElement,this.shortcut.start,this.shortcut.end)}wrapTextInLink(i,e,t){let s=document.createTreeWalker(i,NodeFilter.SHOW_TEXT,null),n=[],o=0,r=s.nextNode();for(;r;){let a=r,m=a.textContent||"",p=o,h=o+m.length;h>e&&p<t&&n.push({node:a,start:p,end:h}),o=h,r=s.nextNode()}for(let a=n.length-1;a>=0;a--){let{node:m,start:p}=n[a],h=m.textContent||"",v=Math.max(0,e-p),f=Math.min(h.length,t-p);v<f&&this.wrapTextNode(m,v,f)}}wrapTextNode(i,e,t){let s=i.parentNode;if(!s||this.isInsideClickable(s))return;let n=i.textContent||"",o=n.substring(0,e),r=n.substring(e,t),a=n.substring(t),m=this.createShortcutElement(r),p=document.createDocumentFragment();o&&p.appendChild(document.createTextNode(o)),p.appendChild(m),a&&p.appendChild(document.createTextNode(a)),s.replaceChild(p,i)}createShortcutElement(i){let e=document.createElement("span");return e.className=Qn,e.style.color="#9ca3af",e.style.textDecoration="underline",e.style.textDecorationStyle="dotted",e.style.cursor="pointer",e.style.fontWeight="500",e.textContent=i,e.addEventListener("click",t=>{t.preventDefault(),t.stopPropagation(),this.onShortcutClick(this.shortcut.keySequence)}),e.addEventListener("mouseenter",()=>{e.style.backgroundColor="rgba(156, 163, 175, 0.2)",e.style.color="#d1d5db"}),e.addEventListener("mouseleave",()=>{e.style.backgroundColor="",e.style.color="#9ca3af"}),e.title=`Click to send: ${this.shortcut.keySequence}`,e}isInsideClickable(i){let e=i;for(;e&&e!==document.body;){if(e.tagName==="A"&&e.classList.contains("terminal-link")||e.tagName==="SPAN"&&e.classList.contains(Qn))return!0;e=e.parentElement}return!1}};q();var la=["https://","http://","file://"],Jn="terminal-link",Us=/https?:\/\/|file:\/\//g,ca=/(^|\s)(h|ht|htt|http|https|https:|https:\/|https:\/\/|f|fi|fil|file|file:|file:\/|file:\/\/)$/,$r=/^[a-zA-Z0-9[\].-]/,ha=/^[/a-zA-Z0-9[\].-]/,Zn=/[^\w\-._~:/?#[\]@!$&'()*+,;=%{}|\\^`]/,da=/^(https?:\/\/(localhost|[\d.]+|\[[\da-fA-F:]+\]|(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.[a-zA-Z]+))(:\d+)?.*|file:\/\/.+)/,ua=/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;function pa(c){new Ir(c).process()}var Ir=class{constructor(i){this.processedRanges=new Map;this.container=i,this.lines=i.querySelectorAll(".terminal-line")}process(){if(this.lines.length!==0)for(let i=0;i<this.lines.length;i++)this.processLine(i)}processLine(i){i>0&&this.checkPreviousLineContinuation(i),this.findUrlsInLine(i)}checkPreviousLineContinuation(i){let e=this.getLineText(i),t=this.getLineText(i-1),s=this.findIncompleteUrlAtLineEnd(t,e);if(s){let{startPos:n}=s,o=this.buildMultiLineUrl(i-1,n);o&&this.isValidUrl(o.url)&&(this.isRangeProcessed(i-1,n,o.endLine)||(this.createUrlLinks(o.url,i-1,o.endLine,n),this.markRangeAsProcessed(i-1,o.endLine,n,o.url)))}}findIncompleteUrlAtLineEnd(i,e){for(let s of la){let n=i.lastIndexOf(s);if(n>=0&&i.endsWith(s)&&$r.test(e.trimStart()))return{startPos:n,protocol:s}}let t=i.match(ca);if(t){let s=t[2],n=(t.index??0)+(t[1]?1:0);if(this.isValidContinuation(s,e))return{startPos:n,protocol:s}}return null}isValidContinuation(i,e){let t=e.trimStart();if(i==="https://"||i==="file://")return $r.test(t);if(i.endsWith("/"))return ha.test(t);let s=i+t;return/^(https?:\/\/|file:\/\/)/.test(s)}isValidUrlContinuation(i,e){let t=e.trimStart();if(!t)return!1;if(!i.includes("://")){let n=i+t;return/^(https?:|file:|https?:\/|file:\/|https?:\/\/|file:\/\/)/.test(n)}if(i.match(/(https?:|file:)\/\/$/))return $r.test(t);if(/^(and|or|but|the|is|are|was|were|been|have|has|had|will|would|could|should|may|might|check|visit|go|see|click|open|navigate)\b/i.test(t)||/^[!?;]/.test(t)||/^\.(\s|$)/.test(t))return!1;let s=t.split(/\s/)[0];return/[/:._-]/.test(s)?!0:/^[a-zA-Z]+$/.test(s)&&s.length>2?!/^(next|line|with|text|this|that|then|when|where|which|while|after|before|during|since|until|above|below|between|into|through|under|over|about|against|among|around|behind|beside|beyond|inside|outside|toward|within|without|according|although|because|however|therefore|moreover|nevertheless|furthermore|otherwise|meanwhile|indeed|instead|likewise|similarly|specifically|subsequently|ultimately|additionally|consequently|eventually|finally|initially|particularly|previously|recently|suddenly|usually)/i.test(s):/^[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]/.test(t)}findUrlsInLine(i){let e=this.getLineText(i);Us.lastIndex=0;let t=Us.exec(e);for(;t!==null;){let s=t.index;if(this.isPositionProcessed(i,s)){t=Us.exec(e);continue}let n=this.buildMultiLineUrl(i,s);n&&this.isValidUrl(n.url)&&(this.createUrlLinks(n.url,i,n.endLine,s),this.markRangeAsProcessed(i,n.endLine,s,n.url)),t=Us.exec(e)}}buildMultiLineUrl(i,e){let t="",s=i;for(let n=i;n<this.lines.length;n++){let o=this.getLineText(n),r;if(n===i)r=o.substring(e);else{let m=t;if(!this.isValidUrlContinuation(m,o)){s=n-1;break}if(r=o.trimStart(),!r){s=n-1;break}}let a=this.findUrlEndInText(r);if(a>=0){t+=r.substring(0,a),s=n;break}else if(t+=r,s=n,n===this.lines.length-1)break}return{url:this.cleanUrl(t),endLine:s}}findUrlEndInText(i){let e=i.search(/\s/);if(e>=0)return e;let t=i.match(Zn);return t&&t.index!==void 0?t.index:-1}createUrlLinks(i,e,t,s){new Ar(this.lines,i).createLinks(e,t,s)}getLineText(i){return i<0||i>=this.lines.length?"":this.lines[i].textContent||""}isValidUrl(i){if(i.length<7||i.length>2048||/[\n\r\t]/.test(i)||!da.test(i))return!1;try{let e=new URL(i);if(!["http:","https:","file:"].includes(e.protocol))return!1;if(e.protocol==="http:"||e.protocol==="https:"){let t=e.hostname;if(t==="localhost"||/^[\d.]+$/.test(t)||t.startsWith("["))return!0;let s=t.split(".");if(s.length<2)return!1;for(let o=0;o<s.length;o++)if(!ua.test(s[o]))return!1;let n=s[s.length-1];if(!/[a-zA-Z]/.test(n))return!1}return!0}catch{return!1}}cleanUrl(i){let e=i,t=(e.match(/\(/g)||[]).length,s=(e.match(/\)/g)||[]).length;if(s>t){let n=s-t;e=e.replace(/\)+$/,o=>o.substring(0,o.length-n))}return e=e.replace(/[.,;:!?]+$/,""),e}isRangeProcessed(i,e,t){for(let s=i;s<=t;s++)if(this.isPositionProcessed(s,s===i?e:0))return!0;return!1}isPositionProcessed(i,e){let t=this.processedRanges.get(i);return t?t.some(s=>e>=s.start&&e<s.end):!1}markRangeAsProcessed(i,e,t,s){let n=s,o=i;for(;o<=e&&n.length>0;){let r=this.getLineText(o);this.processedRanges.has(o)||this.processedRanges.set(o,[]);let a=this.processedRanges.get(o);if(!a)continue;let m,p;if(o===i){m=t;let h=r.substring(t),v=Math.min(h.length,n.length);p=t+v}else{let h=r.match(/^\s*/);m=h?h[0].length:0;let v=r.substring(m),f=Math.min(v.length,n.length);if(o===e){let w=v.substring(0,f).search(Zn);w>=0&&(f=w)}p=m+f}a.push({start:m,end:p}),n=n.substring(p-m),o++}}},Ar=class{constructor(i,e){this.lines=i,this.url=e}createLinks(i,e,t){let s=this.url;for(let n=i;n<=e;n++){let o=this.lines[n],r=o.textContent||"",a,m;if(n===i){a=t;let p=r.substring(t);m=t+Math.min(p.length,s.length)}else{let p=r.match(/^\s*/);a=p?p[0].length:0;let h=r.substring(a),v=Math.min(h.length,s.length),f=h.match(/[\s<>"'`]/),w=f?Math.min(f.index??v,v):v;m=a+w}if(a<m&&(this.wrapTextInLink(o,a,m),s=s.substring(m-a)),s.length===0)break}}wrapTextInLink(i,e,t){let s=document.createTreeWalker(i,NodeFilter.SHOW_TEXT,null),n=[],o=0,r=s.nextNode();for(;r;){let a=r,m=a.textContent||"",p=o,h=o+m.length;h>e&&p<t&&n.push({node:a,start:p,end:h}),o=h,r=s.nextNode()}for(let a=n.length-1;a>=0;a--){let{node:m,start:p}=n[a],h=m.textContent||"",v=Math.max(0,e-p),f=Math.min(h.length,t-p);v<f&&this.wrapTextNode(m,v,f)}}wrapTextNode(i,e,t){let s=i.parentNode;if(!s||this.isInsideLink(s))return;let n=i.textContent||"",o=n.substring(0,e),r=n.substring(e,t),a=n.substring(t),m=this.createLinkElement(r),p=document.createDocumentFragment();o&&p.appendChild(document.createTextNode(o)),p.appendChild(m),a&&p.appendChild(document.createTextNode(a)),s.replaceChild(p,i)}createLinkElement(i){let e=document.createElement("a");return e.className=Jn,e.href=this.url,e.target="_blank",e.rel="noopener noreferrer",e.style.color="#4fc3f7",e.style.textDecoration="underline",e.style.cursor="pointer",e.textContent=i,e.addEventListener("mouseenter",()=>{e.style.backgroundColor="rgba(79, 195, 247, 0.2)"}),e.addEventListener("mouseleave",()=>{e.style.backgroundColor=""}),e}isInsideLink(i){let e=i;for(;e&&e!==document.body;){if(e.tagName==="A"&&e.classList.contains(Jn))return!0;e=e.parentElement}return!1}},eo={processLinks:pa};var G=P("terminal"),be=class extends R{constructor(){super(...arguments);this.sessionId="";this.sessionStatus="running";this.cols=80;this.rows=24;this.fontSize=14;this.fitHorizontally=!1;this.maxCols=0;this.theme="auto";this.disableClick=!1;this.hideScrollButton=!1;this.initialCols=0;this.initialRows=0;this.originalFontSize=14;this.userOverrideWidth=!1;this.terminal=null;this._viewportY=0;this.followCursorEnabled=!0;this.programmaticScroll=!1;this.debugMode=!1;this.renderCount=0;this.totalRenderTime=0;this.lastRenderTime=0;this.actualRows=24;this.cursorVisible=!0;this.container=null;this.explicitSizeSet=!1;this.renderPending=!1;this.momentumVelocityY=0;this.momentumVelocityX=0;this.momentumAnimation=null;this.resizeObserver=null;this.mobileWidthResizeComplete=!1;this.pendingResize=null;this.lastCols=0;this.lastRows=0;this.isMobile=!1;this.mobileInitialResizeTimeout=null;this.operationQueue=[];this.handleScrollToBottom=()=>{this.followCursorEnabled=!0,this.scrollToBottom(),this.requestUpdate()};this.handleFitToggle=()=>{if(!this.terminal||!this.container){this.fitHorizontally=!this.fitHorizontally,this.requestUpdate();return}let e=this.terminal.buffer.active,t=this.fontSize*1.2,s=t>0?this.viewportY/t:0,n=this.isScrolledToBottom();if(this.fitHorizontally||(this.originalFontSize=this.fontSize),this.fitHorizontally=!this.fitHorizontally,this.fitHorizontally||(this.fontSize=this.originalFontSize),this.requestResize("fit-mode-change"),n)this.scrollToBottom();else{let o=this.fontSize*1.2,r=Math.max(0,(e.length-this.actualRows)*o),a=s*o;this.viewportY=Math.max(0,Math.min(r,a))}this.requestUpdate()};this.handlePaste=async e=>{e.preventDefault(),e.stopPropagation();let t=e.clipboardData?.getData("text/plain");if(!t&&navigator.clipboard)try{t=await navigator.clipboard.readText()}catch(s){G.error("Failed to read clipboard via navigator API",s)}t&&this.dispatchEvent(new CustomEvent("terminal-paste",{detail:{text:t},bubbles:!0}))};this.handleClick=()=>{this.disableClick||this.container&&this.container.focus()};this.handleShortcutClick=e=>{this.dispatchEvent(new CustomEvent("terminal-input",{detail:{text:e},bubbles:!0}))}}createRenderRoot(){return this}get viewportY(){return this._viewportY}set viewportY(e){this._viewportY=e}queueRenderOperation(e){this.operationQueue.push(e),this.renderPending||(this.renderPending=!0,requestAnimationFrame(()=>{this.processOperationQueue().then(()=>{this.operationQueue.length===0&&(this.renderPending=!1)})}))}requestRenderBuffer(){G.debug("Requesting render buffer update"),this.queueRenderOperation(()=>{G.debug("Executing render operation"),this.renderBuffer()})}async processOperationQueue(){let e=performance.now(),t=8;for(;this.operationQueue.length>0;){let s=this.operationQueue.shift();if(s&&await s(),performance.now()-e>t&&this.operationQueue.length>0){await new Promise(n=>{requestAnimationFrame(()=>{this.processOperationQueue().then(n)})});return}}this.renderBuffer(),this.operationQueue.length===0&&(this.renderPending=!1)}connectedCallback(){let e=Ze.getInstance();if(this.theme=e.getTheme(),super.connectedCallback(),this.debugMode=new URLSearchParams(window.location.search).has("debug"),this.themeObserver=new MutationObserver(()=>{this.terminal&&this.theme==="auto"?(G.debug("Auto theme detected system change, updating terminal"),this.terminal.options.theme=this.getTerminalTheme(),this.updateTerminalColorProperties(this.getTerminalTheme()),this.requestRenderBuffer()):this.theme!=="auto"&&G.debug("Ignoring system theme change - explicit theme selected:",this.theme)}),this.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["data-theme"]}),this.sessionId)try{let t=localStorage.getItem(`terminal-width-override-${this.sessionId}`);t!==null&&(this.userOverrideWidth=t==="true")}catch(t){G.warn("Failed to load terminal width preference from localStorage:",t)}}updated(e){if(e.has("sessionId")&&this.sessionId)try{let t=localStorage.getItem(`terminal-width-override-${this.sessionId}`);t!==null&&(this.userOverrideWidth=t==="true",this.container&&this.requestResize("property-change"))}catch(t){G.warn("Failed to load terminal width preference from localStorage:",t)}if((e.has("cols")||e.has("rows"))&&(this.terminal&&!this.explicitSizeSet&&this.reinitializeTerminal(),this.explicitSizeSet=!1),e.has("fontSize")&&(this.fitHorizontally||(this.originalFontSize=this.fontSize),this.terminal&&this.container&&this.requestResize("property-change")),e.has("fitHorizontally")&&(this.fitHorizontally||(this.fontSize=this.originalFontSize),this.requestResize("property-change")),e.has("maxCols")&&this.terminal&&this.container&&this.requestResize("property-change"),e.has("theme"))if(G.debug("Terminal theme changed to:",this.theme),this.terminal?.options){let t=this.getTerminalTheme();G.debug("Applying terminal theme:",this.theme),this.terminal.options.theme=t,this.updateTerminalColorProperties(t),this.container&&(this.container.innerHTML=""),this.requestRenderBuffer()}else G.warn("No terminal instance found for theme update")}disconnectedCallback(){this.cleanup(),this.themeObserver&&this.themeObserver.disconnect(),super.disconnectedCallback()}setUserOverrideWidth(e){if(this.userOverrideWidth=e,this.isMobile&&e&&(this.mobileWidthResizeComplete=!1,G.debug("[Terminal] Mobile: Resetting width resize block for user-initiated change")),this.sessionId)try{localStorage.setItem(`terminal-width-override-${this.sessionId}`,String(e))}catch(t){G.warn("Failed to save terminal width preference to localStorage:",t)}this.container&&this.requestResize("property-change")}cleanup(){this.momentumAnimation&&(cancelAnimationFrame(this.momentumAnimation),this.momentumAnimation=null),this.resizeObserver&&(this.resizeObserver.disconnect(),this.resizeObserver=null),this.pendingResize&&(cancelAnimationFrame(this.pendingResize),this.pendingResize=null),this.mobileInitialResizeTimeout&&(clearTimeout(this.mobileInitialResizeTimeout),this.mobileInitialResizeTimeout=null),this.terminal&&(this.terminal.dispose(),this.terminal=null)}firstUpdated(){this.originalFontSize=this.fontSize,this.initializeTerminal()}requestResize(e){this.isMobile=window.innerWidth<768,G.debug(`[Terminal] Resize requested from ${e} (mobile: ${this.isMobile}, width: ${window.innerWidth})`),this.pendingResize&&cancelAnimationFrame(this.pendingResize),this.pendingResize=requestAnimationFrame(()=>{this.fitTerminal(e),this.pendingResize=null})}shouldResize(e,t){if(this.isMobile&&this.mobileWidthResizeComplete&&!this.userOverrideWidth){let n=this.lastCols!==e,o=this.lastRows!==t;return n?(G.debug("[Terminal] Preventing WIDTH resize on mobile (width already set)"),!1):o?(G.debug(`[Terminal] Allowing HEIGHT resize on mobile: ${this.lastRows} \u2192 ${t} rows`),this.lastRows=t,!0):!1}let s=this.lastCols!==e||this.lastRows!==t;return s&&(G.debug(`[Terminal] Dimensions changed: ${this.lastCols}x${this.lastRows} \u2192 ${e}x${t}`),this.lastCols=e,this.lastRows=t,this.isMobile&&!this.mobileWidthResizeComplete&&(this.mobileWidthResizeComplete=!0,G.debug("[Terminal] Mobile WIDTH resize complete - blocking future width changes"))),s}getTerminalTheme(){let e=this.theme;return e==="auto"&&(e=zt()),{...(Bt.find(s=>s.id===e)||Bt[0]).colors}}updateTerminalColorProperties(e){G.debug("Updating terminal CSS color properties"),Object.entries({black:0,red:1,green:2,yellow:3,blue:4,magenta:5,cyan:6,white:7,brightBlack:8,brightRed:9,brightGreen:10,brightYellow:11,brightBlue:12,brightMagenta:13,brightCyan:14,brightWhite:15}).forEach(([s,n])=>{if(e[s]){let o=`--terminal-color-${n}`;document.documentElement.style.setProperty(o,e[s]),G.debug(`Set CSS property ${o}:`,e[s])}}),e.foreground&&(document.documentElement.style.setProperty("--terminal-foreground",e.foreground),G.debug("Set terminal foreground color:",e.foreground)),e.background&&(document.documentElement.style.setProperty("--terminal-background",e.background),G.debug("Set terminal background color:",e.background)),G.debug("CSS terminal color properties updated")}async initializeTerminal(){try{if(G.debug("initializeTerminal starting"),this.requestUpdate(),this.container=this.querySelector("#terminal-container"),!this.container){let e=new Error("Terminal container not found");throw G.error("terminal container not found",e),e}G.debug("Terminal container found, proceeding with setup"),await this.setupTerminal(),this.setupResize(),this.setupScrolling(),this.viewportY=0,this.terminal&&this.terminal.scrollToTop(),this.requestUpdate()}catch(e){G.error("failed to initialize terminal:",e),this.requestUpdate()}}async reinitializeTerminal(){if(this.terminal){this.container&&this.container.offsetHeight;let e=Number.isFinite(this.cols)?Math.floor(this.cols):80,t=Number.isFinite(this.rows)?Math.floor(this.rows):24;this.terminal.resize(e,t),this.requestResize("property-change")}}async setupTerminal(){try{this.terminal=new to.Terminal({cursorBlink:!0,cursorStyle:"block",cursorWidth:1,lineHeight:1.2,letterSpacing:0,scrollback:1e4,allowProposedApi:!0,allowTransparency:!1,convertEol:!0,drawBoldTextInBrightColors:!0,minimumContrastRatio:1,macOptionIsMeta:!0,altClickMovesCursor:!0,rightClickSelectsWord:!1,wordSeparator:" ()[]{}'\"`",theme:this.getTerminalTheme()}),this.terminal.resize(this.cols,this.rows),this.requestRenderBuffer()}catch(e){throw G.error("failed to create terminal:",e),e}}measureCharacterWidth(){if(!this.container)return 8;let e=document.createElement("div");e.className="terminal-line",e.style.position="absolute",e.style.visibility="hidden",e.style.top="0",e.style.left="0",e.style.fontSize=`${this.fontSize}px`,e.style.fontFamily="Hack Nerd Font Mono, Fira Code, monospace";let t="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?",s=Math.ceil(this.cols/t.length),n=t.repeat(s).substring(0,this.cols);e.textContent=n,this.container.appendChild(e);let r=e.getBoundingClientRect().width/this.cols;return this.container.removeChild(e),Number.isFinite(r)&&r>0?r:8}fitTerminal(e){if(!this.terminal||!this.container){G.warn("[Terminal] Cannot fit terminal: terminal or container not initialized");return}let t=Date.now(),s=this._lastFitTime?t-this._lastFitTime:0;this._lastFitTime=t,G.debug("[Terminal] \u{1F4F1} fitTerminal called",{source:e||"unknown",isMobile:this.isMobile,windowWidth:window.innerWidth,timeSinceLastFit:s,cols:this.cols,rows:this.rows,actualRows:this.actualRows,bufferLength:this.terminal.buffer.active.length}),this.isMobile&&G.debug(`[Terminal] Mobile detected in fitTerminal - source: ${e}, userAgent: ${navigator.userAgent}`);let n=this.actualRows,o=this.fontSize*1.2,r=this.isScrolledToBottom(),a=o>0?this.viewportY/o:0;if(this.fitHorizontally){let m=this.container.clientWidth,p=this.container.clientHeight,h=m/this.cols,v=this.measureCharacterWidth(),f=h/v,w=this.fontSize*f,x=Math.max(4,Math.min(32,w));this.fontSize=x;let l=this.fontSize*1.2,g=Math.max(1,Math.floor(p/l));if(this.actualRows=g,this.rows=g,this.terminal){let y=Number.isFinite(this.cols)?Math.floor(this.cols):80,b=Number.isFinite(this.rows)?Math.floor(this.rows):24,k=this.lastCols,E=this.lastRows;if(this.shouldResize(y,b)){G.debug(`Resizing terminal (${e||"unknown"}): ${y}x${b}`),this.terminal.resize(y,b);let B=!(y!==k)&&b!==E;this.dispatchEvent(new CustomEvent("terminal-resize",{detail:{cols:y,rows:b,isMobile:this.isMobile,isHeightOnlyChange:B,source:e||"unknown"},bubbles:!0}))}else G.debug(`Skipping resize (${e||"unknown"}): dimensions unchanged`)}}else{let m=this.container.clientWidth||800,p=this.container.clientHeight||600,h=this.fontSize*1.2,v=this.measureCharacterWidth(),f=Number.isFinite(v)&&v>0?v:8,w=Math.max(20,Math.floor(m/f))-1,x=this.sessionId.startsWith("fwd_");if(this.maxCols>0?this.cols=Math.min(w,this.maxCols):this.userOverrideWidth?this.cols=w:this.initialCols>0&&x?this.cols=Math.min(w,this.initialCols):this.cols=w,this.rows=Math.max(6,Math.floor(p/h)),this.actualRows=this.rows,this.terminal){let l=Number.isFinite(this.cols)?Math.floor(this.cols):80,g=Number.isFinite(this.rows)?Math.floor(this.rows):24,y=this.lastCols,b=this.lastRows;if(this.shouldResize(l,g)){G.debug(`Resizing terminal (${e||"unknown"}): ${l}x${g}`),this.terminal.resize(l,g);let E=!(l!==y)&&g!==b;this.dispatchEvent(new CustomEvent("terminal-resize",{detail:{cols:l,rows:g,isMobile:this.isMobile,isHeightOnlyChange:E,source:e||"unknown"},bubbles:!0}))}else G.debug(`Skipping resize (${e||"unknown"}): dimensions unchanged`)}}if(this.terminal){let m=this.terminal.buffer.active,p=this.fontSize*1.2,h=Math.max(0,(m.length-this.actualRows)*p);if(r)this.viewportY=h;else{let v=a*p,f=Math.max(0,Math.min(h,v));this.viewportY=f}}this.requestRenderBuffer(),this.requestUpdate()}setupResize(){if(!this.container)return;let e=768;this.isMobile=window.innerWidth<e,G.debug(`[Terminal] Setting up resize - isMobile: ${this.isMobile}, width: ${window.innerWidth}, userAgent: ${navigator.userAgent}`),this.isMobile?(G.debug("[Terminal] Mobile detected - scheduling initial resize in 200ms"),this.mobileInitialResizeTimeout=setTimeout(()=>{G.debug("[Terminal] Mobile: Executing initial resize"),this.fitTerminal("initial-mobile-only"),G.debug("[Terminal] Mobile: Initial width set, future WIDTH resizes blocked (height allowed for keyboard)"),this.mobileInitialResizeTimeout=null},200)):(G.debug("[Terminal] Desktop detected - setting up resize observers"),this.resizeObserver=new ResizeObserver(()=>{G.debug("[Terminal] ResizeObserver triggered"),this.requestResize("ResizeObserver")}),this.resizeObserver.observe(this.container),window.addEventListener("resize",()=>{G.debug("[Terminal] Window resize event triggered"),this.requestResize("window-resize")}),G.debug("[Terminal] Desktop: Requesting initial resize"),this.requestResize("initial-desktop"))}setupScrolling(){if(!this.container)return;this.container.addEventListener("wheel",p=>{p.preventDefault();let h=this.fontSize*1.2,v=0,f=0;switch(p.deltaMode){case WheelEvent.DOM_DELTA_PIXEL:v=p.deltaY,f=p.deltaX;break;case WheelEvent.DOM_DELTA_LINE:v=p.deltaY*h,f=p.deltaX*h;break;case WheelEvent.DOM_DELTA_PAGE:v=p.deltaY*(this.actualRows*h),f=p.deltaX*(this.actualRows*h);break}let w=.5;v*=w,f*=w,Math.abs(v)>0&&this.scrollViewportPixels(v),Math.abs(f)>0&&!this.fitHorizontally&&this.container&&(this.container.scrollLeft+=f)},{passive:!1});let e=!1,t=0,s=0,n=[],o=p=>{p.pointerType!=="touch"||!p.isPrimary||(this.momentumAnimation&&(cancelAnimationFrame(this.momentumAnimation),this.momentumAnimation=null),e=!1,t=p.clientY,s=p.clientX,n=[{y:p.clientY,x:p.clientX,time:performance.now()}],this.container?.setPointerCapture(p.pointerId))},r=p=>{if(p.pointerType!=="touch"||!this.container?.hasPointerCapture(p.pointerId))return;let h=p.clientY,v=p.clientX,f=t-h,w=s-v,x=performance.now();n.push({y:h,x:v,time:x}),n.length>5&&n.shift(),!e&&(Math.abs(f)>5||Math.abs(w)>5)&&(e=!0),e&&(Math.abs(f)>0&&(this.scrollViewportPixels(f),t=h),Math.abs(w)>0&&!this.fitHorizontally&&(this.container.scrollLeft+=w,s=v))},a=p=>{if(p.pointerType==="touch"){if(e&&n.length>=2){let h=performance.now(),v=n[n.length-1],f=n[n.length-2],w=h-f.time,x=v.y-f.y,l=v.x-f.x,g=w>0?-x/w:0,y=w>0?-l/w:0,b=.3;(Math.abs(g)>b||Math.abs(y)>b)&&this.startMomentum(g,y)}this.container?.releasePointerCapture(p.pointerId)}},m=p=>{p.pointerType==="touch"&&this.container?.releasePointerCapture(p.pointerId)};this.container.addEventListener("pointerdown",o),this.container.addEventListener("pointermove",r),this.container.addEventListener("pointerup",a),this.container.addEventListener("pointercancel",m)}scrollViewportPixels(e){if(!this.terminal)return;let t=this.terminal.buffer.active,s=this.fontSize*1.2,n=Math.max(0,(t.length-this.actualRows)*s),o=Math.max(0,Math.min(n,this.viewportY+e));o!==this.viewportY&&(this.viewportY=o,this.updateFollowCursorState(),this.requestRenderBuffer())}startMomentum(e,t){this.momentumVelocityY=e*16,this.momentumVelocityX=t*16,this.momentumAnimation&&cancelAnimationFrame(this.momentumAnimation),this.animateMomentum()}animateMomentum(){let s=this.momentumVelocityY,n=this.momentumVelocityX,o=!1;if(Math.abs(s)>.1){let r=this.terminal?.buffer.active;if(r){let a=this.fontSize*1.2,m=Math.max(0,(r.length-this.actualRows)*a),p=Math.max(0,Math.min(m,this.viewportY+s));p!==this.viewportY?(this.viewportY=p,o=!0,this.updateFollowCursorState()):this.momentumVelocityY=0}}if(Math.abs(n)>.1&&!this.fitHorizontally&&this.container){let r=this.container.scrollLeft+n;this.container.scrollLeft=r,o=!0}this.momentumVelocityY*=.92,this.momentumVelocityX*=.92,Math.abs(this.momentumVelocityY)>.1||Math.abs(this.momentumVelocityX)>.1?(this.momentumAnimation=requestAnimationFrame(()=>{this.animateMomentum()}),o&&this.renderBuffer()):(this.momentumAnimation=null,this.momentumVelocityY=0,this.momentumVelocityX=0)}renderBuffer(){if(!this.terminal||!this.container){G.warn("renderBuffer called but missing terminal or container",{hasTerminal:!!this.terminal,hasContainer:!!this.container});return}G.debug("renderBuffer executing");let e=this.debugMode?performance.now():0;this.debugMode&&this.renderCount++;let t=this.terminal.buffer.active,s=t.length,n=this.fontSize*1.2,o=this.viewportY/n,r=Math.floor(o),a=(o-r)*n,m="",p=t.getNullCell(),h=this.terminal.buffer.active.cursorX,v=this.terminal.buffer.active.cursorY+this.terminal.buffer.active.viewportY;for(let f=0;f<this.actualRows;f++){let w=r+f,x=a>0?` style="transform: translateY(-${a}px);"`:"";if(w>=s){m+=`<div class="terminal-line"${x}></div>`;continue}let l=t.getLine(w);if(!l){m+=`<div class="terminal-line"${x}></div>`;continue}let g=w===v,y=this.renderLine(l,p,g&&this.cursorVisible?h:-1);m+=`<div class="terminal-line"${x}>${y||""}</div>`}if(this.container.innerHTML=m,eo.processLinks(this.container),Xn(this.container,this.handleShortcutClick),this.debugMode){let f=performance.now();this.lastRenderTime=f-e,this.totalRenderTime+=this.lastRenderTime,this.requestUpdate()}}renderLine(e,t,s=-1){let n="",o="",r="",a="",m=h=>h.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),p=()=>{if(o){let h=m(o);n+=`<span class="${r}"${a?` style="${a}"`:""}>${h}</span>`,o=""}};for(let h=0;h<e.length;h++){if(e.getCell(h,t),!t)continue;let v=t.getChars()||" ";if(t.getWidth()===0)continue;let w="terminal-char",x="",l=h===s;l&&(w+=" cursor");let g=t.getFgColor();if(g!==void 0){if(typeof g=="number"&&g>=0&&g<=255)x+=`color: var(--terminal-color-${g});`;else if(typeof g=="number"&&g>255){let O=g>>16&255,F=g>>8&255,U=g&255;x+=`color: rgb(${O}, ${F}, ${U});`}}let y=t.getBgColor();if(y!==void 0){if(typeof y=="number"&&y>=0&&y<=255)x+=`background-color: var(--terminal-color-${y});`;else if(typeof y=="number"&&y>255){let O=y>>16&255,F=y>>8&255,U=y&255;x+=`background-color: rgb(${O}, ${F}, ${U});`}}let b=t.isBold(),k=t.isItalic(),E=t.isUnderline(),A=t.isDim(),B=t.isInverse(),L=t.isInvisible(),W=t.isStrikethrough(),he=t.isOverline();if(b&&(w+=" bold"),k&&(w+=" italic"),E&&(w+=" underline"),A&&(w+=" dim"),W&&(w+=" strikethrough"),he&&(w+=" overline"),B){let O=x.match(/color: ([^;]+);/)?.[1],F=x.match(/background-color: ([^;]+);/)?.[1],U="var(--terminal-foreground, #e4e4e4)",rt="var(--terminal-background, #0a0a0a)",Xe=O||U,re=F||rt;x="",x+=`color: ${re};`,x+=`background-color: ${Xe};`}l&&(x+="background-color: rgb(var(--color-primary));"),L&&(x+="opacity: 0;"),(w!==r||x!==a)&&(p(),r=w,a=x),o+=v}return p(),n}write(e,t=!0){if(!this.terminal){G.warn("Terminal.write called but no terminal instance exists");return}this.isMobile&&e.length>100&&G.debug("[Terminal] \u{1F4F1} Large write to terminal",{sessionId:this.sessionId,dataLength:e.length,followCursor:t,bufferLength:this.terminal.buffer.active.length,scrollPosition:this._viewportY}),e.includes("\x1B[?25l")&&(this.cursorVisible=!1),e.includes("\x1B[?25h")&&(this.cursorVisible=!0),this.queueRenderOperation(async()=>{this.terminal&&(await new Promise(s=>{this.terminal?this.terminal.write(e,s):s()}),t&&this.followCursorEnabled&&this.followCursor())})}clear(){this.terminal&&this.queueRenderOperation(()=>{this.terminal&&(this.terminal.clear(),this.viewportY=0)})}setTerminalSize(e,t){this.cols=e,this.rows=t,this.terminal&&(this.explicitSizeSet=!0,this.queueRenderOperation(()=>{this.terminal&&(this.terminal.resize(e,t),this.requestUpdate())}))}scrollToBottom(){this.terminal&&this.queueRenderOperation(()=>{if(!this.terminal)return;this.requestResize("property-change");let e=this.terminal.buffer.active,t=this.fontSize*1.2,s=Math.max(0,(e.length-this.actualRows)*t);this.programmaticScroll=!0,this.viewportY=s,this.programmaticScroll=!1})}scrollToPosition(e){this.terminal&&this.queueRenderOperation(()=>{if(!this.terminal)return;let t=this.terminal.buffer.active,s=this.fontSize*1.2,n=Math.max(0,t.length-this.actualRows);this.programmaticScroll=!0,this.viewportY=Math.max(0,Math.min(n,e))*s,this.programmaticScroll=!1})}queueCallback(e){this.queueRenderOperation(e)}getTerminalSize(){return{cols:this.cols,rows:this.rows}}getVisibleRows(){return this.actualRows}getBufferSize(){return this.terminal?this.terminal.buffer.active.length:0}getScrollPosition(){let e=this.fontSize*1.2;return Math.round(this.viewportY/e)}getMaxScrollPosition(){if(!this.terminal)return 0;let e=this.terminal.buffer.active;return Math.max(0,e.length-this.actualRows)}isScrolledToBottom(){if(!this.terminal)return!0;let e=this.terminal.buffer.active,t=this.fontSize*1.2,s=Math.max(0,(e.length-this.actualRows)*t);return this.viewportY>=s-t}updateFollowCursorState(){if(this.programmaticScroll)return;let e=this.isScrolledToBottom();e&&!this.followCursorEnabled?this.followCursorEnabled=!0:!e&&this.followCursorEnabled&&(this.followCursorEnabled=!1)}followCursor(){if(!this.terminal)return;let e=this.terminal.buffer.active,t=e.cursorY+e.viewportY,s=this.fontSize*1.2,n=t,o=Math.floor(this.viewportY/s),r=o+this.actualRows-1;this.programmaticScroll=!0,n<o?this.viewportY=n*s:n>r&&(this.viewportY=Math.max(0,(n-this.actualRows+1)*s));let a=Math.max(0,(e.length-this.actualRows)*s);this.viewportY=Math.min(this.viewportY,a),this.programmaticScroll=!1}render(){let e=this.getTerminalTheme(),t=`
      view-transition-name: session-${this.sessionId};
      background-color: ${e.background||"var(--terminal-background, #0a0a0a)"};
      color: ${e.foreground||"var(--terminal-foreground, #e4e4e4)"};
    `;return u`
      <style>
        /* Dynamic terminal sizing */
        .terminal-container {
          font-size: ${this.fontSize}px;
          line-height: ${this.fontSize*1.2}px;
          touch-action: none !important;
        }

        .terminal-line {
          height: ${this.fontSize*1.2}px;
          line-height: ${this.fontSize*1.2}px;
        }
      </style>
      <div class="relative w-full h-full p-0 m-0">
        <div
          id="terminal-container"
          class="terminal-container w-full h-full overflow-hidden p-0 m-0"
          tabindex="0"
          contenteditable="false"
          style="${t}"
          @paste=${this.handlePaste}
          @click=${this.handleClick}
          data-testid="terminal-container"
        ></div>
        ${!this.followCursorEnabled&&!this.hideScrollButton?u`
              <div
                class="scroll-to-bottom"
                @click=${this.handleScrollToBottom}
                title="Scroll to bottom"
              >
                ↓
              </div>
            `:""}
        ${this.debugMode?u`
              <div class="debug-overlay">
                <div class="metric">
                  <span class="metric-label">Renders:</span>
                  <span class="metric-value">${this.renderCount}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Avg:</span>
                  <span class="metric-value"
                    >${this.renderCount>0?(this.totalRenderTime/this.renderCount).toFixed(2):"0.00"}ms</span
                  >
                </div>
                <div class="metric">
                  <span class="metric-label">Last:</span>
                  <span class="metric-value">${this.lastRenderTime.toFixed(2)}ms</span>
                </div>
              </div>
            `:""}
      </div>
    `}};d([C({type:String})],be.prototype,"sessionId",2),d([C({type:String})],be.prototype,"sessionStatus",2),d([C({type:Number})],be.prototype,"cols",2),d([C({type:Number})],be.prototype,"rows",2),d([C({type:Number})],be.prototype,"fontSize",2),d([C({type:Boolean})],be.prototype,"fitHorizontally",2),d([C({type:Number})],be.prototype,"maxCols",2),d([C({type:String})],be.prototype,"theme",2),d([C({type:Boolean})],be.prototype,"disableClick",2),d([C({type:Boolean})],be.prototype,"hideScrollButton",2),d([C({type:Number})],be.prototype,"initialCols",2),d([C({type:Number})],be.prototype,"initialRows",2),d([_()],be.prototype,"terminal",2),d([_()],be.prototype,"followCursorEnabled",2),d([_()],be.prototype,"actualRows",2),d([_()],be.prototype,"cursorVisible",2),be=d([D("vibe-terminal")],be);we();Me();q();var qs=P("vibe-terminal-binary"),Ce=class extends De{constructor(){super(...arguments);this.sessionStatus="running";this.fitHorizontally=!1;this.maxCols=0;this.disableClick=!1;this.hideScrollButton=!1;this.initialCols=0;this.initialRows=0;this.cols=80;this.rows=24;this.fontSize=14;this.userOverrideWidth=!1;this.showScrollToBottomButton=!1;this.currentCols=80;this.currentRows=24;this.terminalResizeObserver=null;this.preferencesManager=Ze.getInstance();this.isScrolledToBottom=!0;this.handleFontSizeChange=e=>{let t=e;this.fontSize=t.detail};this.handleThemeChange=e=>{let t=e;this.theme=t.detail};this.handleInput=e=>{let t=e.target,s=t.value;s&&(this.sendInputText(s),t.value="")};this.handleKeydown=e=>{let{key:t,ctrlKey:s}=e,n="";if(t==="Enter")n="\r";else if(t==="Tab")n="	";else if(t==="Backspace")n="\x7F";else if(t==="Escape")n="\x1B";else if(t==="ArrowUp")n="\x1B[A";else if(t==="ArrowDown")n="\x1B[B";else if(t==="ArrowRight")n="\x1B[C";else if(t==="ArrowLeft")n="\x1B[D";else if(s&&t.length===1){let o=t.toUpperCase().charCodeAt(0)-64;o>=1&&o<=26&&(n=String.fromCharCode(o))}n&&(wt(e),this.sendInputText(n))}}connectedCallback(){super.connectedCallback(),this.fontSize=this.preferencesManager.getFontSize(),this.theme=this.preferencesManager.getTheme(),this.currentCols=this.cols,this.currentRows=this.rows,window.addEventListener("terminal-font-size-changed",this.handleFontSizeChange),window.addEventListener("terminal-theme-changed",this.handleThemeChange)}disconnectedCallback(){super.disconnectedCallback(),window.removeEventListener("terminal-font-size-changed",this.handleFontSizeChange),window.removeEventListener("terminal-theme-changed",this.handleThemeChange),this.hiddenInput&&(this.hiddenInput.removeEventListener("input",this.handleInput),this.hiddenInput.removeEventListener("keydown",this.handleKeydown),this.hiddenInput.remove(),this.hiddenInput=void 0),this.terminalResizeObserver&&(this.terminalResizeObserver.disconnect(),this.terminalResizeObserver=null)}firstUpdated(){super.firstUpdated(),this.terminalContainer&&!this.disableClick&&this.setupInputHandling(),this.setupResizeObserver(),this.setupScrollTracking(),this.dispatchEvent(new CustomEvent("terminal-ready")),this.updateTerminalSize()}updated(e){super.updated(e),e.has("fontSize")&&this.updateTerminalSize(),(e.has("cols")||e.has("rows"))&&(this.currentCols=this.cols,this.currentRows=this.rows,this.updateTerminalSize())}render(){let e=this.theme==="auto"?zt():this.theme,t=this.fontSize*1.2;return u`
      <style>
        /* Override parent's dynamic font sizing with fixed font size */
        vibe-terminal-binary .terminal-container {
          font-size: ${this.fontSize}px !important;
          line-height: ${t}px !important;
        }

        vibe-terminal-binary .terminal-line {
          height: ${t}px !important;
          line-height: ${t}px !important;
        }
        
        /* Hide parent's font size styles */
        vibe-terminal-buffer .terminal-container {
          font-size: ${this.fontSize}px !important;
          line-height: ${t}px !important;
        }

        vibe-terminal-buffer .terminal-line {
          height: ${t}px !important;
          line-height: ${t}px !important;
        }
      </style>
      <div class="relative h-full flex flex-col">
        <!-- Terminal container -->
        <div 
          id="terminal-container"
          class="terminal-scroll-container flex-1 overflow-auto ${e}"
          style="font-size: ${this.fontSize}px;"
        >
          <!-- Use parent's render for buffer content -->
          ${super.render()}
        </div>
        
        <!-- Scroll to bottom button -->
        ${!this.hideScrollButton&&this.showScrollToBottomButton?u`
          <button
            @click=${()=>this.scrollToBottom()}
            class="absolute bottom-4 right-4 bg-bg-secondary border border-border rounded-full p-2 shadow-md hover:bg-bg-tertiary transition-all duration-200"
            title="Scroll to bottom"
          >
            <svg class="w-5 h-5 text-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        `:""}
      </div>
    `}setupResizeObserver(){this.terminalContainer&&(this.terminalResizeObserver=new ResizeObserver(()=>{this.updateTerminalSize()}),this.terminalResizeObserver.observe(this.terminalContainer))}setupScrollTracking(){this.scrollContainer&&this.scrollContainer.addEventListener("scroll",()=>{let e=this.scrollContainer,t=e?.scrollTop||0,s=e?.scrollHeight||0,n=e?.clientHeight||0;this.isScrolledToBottom=t+n>=s-10,this.showScrollToBottomButton=!this.isScrolledToBottom&&s>n})}updateTerminalSize(){if(!this.terminalContainer)return;let e=this.terminalContainer.getBoundingClientRect(),t=this.fontSize*.6,s=this.fontSize*1.5,n=Math.floor(e.width/t),o=Math.floor(e.height/s);!this.fitHorizontally&&!this.userOverrideWidth?n=this.initialCols||80:this.maxCols>0&&n>this.maxCols&&(n=this.maxCols),(n!==this.currentCols||o!==this.currentRows)&&(this.currentCols=n,this.currentRows=o,this.dispatchEvent(new CustomEvent("terminal-resize",{detail:{cols:n,rows:o}})))}setupInputHandling(){this.hiddenInput=document.createElement("input"),this.hiddenInput.type="text",this.hiddenInput.style.position="absolute",this.hiddenInput.style.left="-9999px",this.hiddenInput.style.width="1px",this.hiddenInput.style.height="1px",this.hiddenInput.style.opacity="0",this.hiddenInput.autocapitalize="off",this.hiddenInput.setAttribute("autocorrect","off"),this.hiddenInput.autocomplete="off",this.hiddenInput.spellcheck=!1,this.terminalContainer?.appendChild(this.hiddenInput),this.hiddenInput.addEventListener("input",this.handleInput),this.hiddenInput.addEventListener("keydown",this.handleKeydown),this.terminalContainer?.addEventListener("click",()=>{this.disableClick||this.focus()})}async sendInputText(e){if(this.sessionId)try{let t=N.getCurrentUser(),s={"Content-Type":"application/json"};t?.token&&(s.Authorization=`Bearer ${t.token}`),await fetch(`/api/sessions/${this.sessionId}/input`,{method:"POST",headers:s,body:JSON.stringify({text:e})}),this.dispatchEvent(new CustomEvent("terminal-input",{detail:e}))}catch(t){qs.error("Failed to send input:",t)}}focus(){this.hiddenInput?.focus()}blur(){this.hiddenInput?.blur()}clear(){qs.warn("Clear not supported in binary mode")}write(e){qs.warn("Direct write not supported in binary mode",e)}setUserOverrideWidth(e){this.userOverrideWidth=e}handleFitToggle(){qs.warn("Fit toggle not supported in binary mode")}fitTerminal(){this.updateTerminalSize()}scrollToBottom(){this.scrollContainer&&(this.scrollContainer.scrollTop=this.scrollContainer.scrollHeight)}};d([C({type:String})],Ce.prototype,"sessionStatus",2),d([C({type:Boolean})],Ce.prototype,"fitHorizontally",2),d([C({type:Number})],Ce.prototype,"maxCols",2),d([C({type:Boolean})],Ce.prototype,"disableClick",2),d([C({type:Boolean})],Ce.prototype,"hideScrollButton",2),d([C({type:Number})],Ce.prototype,"initialCols",2),d([C({type:Number})],Ce.prototype,"initialRows",2),d([C({type:Number})],Ce.prototype,"cols",2),d([C({type:Number})],Ce.prototype,"rows",2),d([C({type:Number})],Ce.prototype,"fontSize",2),d([_()],Ce.prototype,"showScrollToBottomButton",2),d([_()],Ce.prototype,"currentCols",2),d([_()],Ce.prototype,"currentRows",2),d([rr("#terminal-container")],Ce.prototype,"terminalContainer",2),d([rr(".terminal-scroll-container")],Ce.prototype,"scrollContainer",2),Ce=d([D("vibe-terminal-binary")],Ce);var Fe=class extends R{constructor(){super();this.session=null;this.useBinaryMode=!1;this.terminalFontSize=14;this.terminalMaxCols=0;this.terminalTheme="auto";this.disableClick=!1;this.hideScrollButton=!1;this.handleClick=this.handleClick.bind(this),this.handleTerminalInput=this.handleTerminalInput.bind(this),this.handleTerminalResize=this.handleTerminalResize.bind(this),this.handleTerminalReady=this.handleTerminalReady.bind(this)}createRenderRoot(){return this}render(){return this.session?this.useBinaryMode?u`
        <vibe-terminal-binary
          .sessionId=${this.session.id||""}
          .sessionStatus=${this.session.status||"running"}
          .cols=${80}
          .rows=${24}
          .fontSize=${this.terminalFontSize}
          .fitHorizontally=${!1}
          .maxCols=${this.terminalMaxCols}
          .theme=${this.terminalTheme}
          .initialCols=${this.session.initialCols||0}
          .initialRows=${this.session.initialRows||0}
          .disableClick=${this.disableClick}
          .hideScrollButton=${this.hideScrollButton}
          class="w-full h-full p-0 m-0 terminal-container"
          @click=${e=>this.handleClick(e)}
          @terminal-input=${e=>this.handleTerminalInput(e)}
          @terminal-resize=${e=>this.handleTerminalResize(e)}
          @terminal-ready=${e=>this.handleTerminalReady(e)}
        ></vibe-terminal-binary>
      `:u`
        <vibe-terminal
          .sessionId=${this.session.id||""}
          .sessionStatus=${this.session.status||"running"}
          .cols=${80}
          .rows=${24}
          .fontSize=${this.terminalFontSize}
          .fitHorizontally=${!1}
          .maxCols=${this.terminalMaxCols}
          .theme=${this.terminalTheme}
          .initialCols=${this.session.initialCols||0}
          .initialRows=${this.session.initialRows||0}
          .disableClick=${this.disableClick}
          .hideScrollButton=${this.hideScrollButton}
          class="w-full h-full p-0 m-0 terminal-container"
          @click=${e=>this.handleClick(e)}
          @terminal-input=${e=>this.handleTerminalInput(e)}
          @terminal-resize=${e=>this.handleTerminalResize(e)}
          @terminal-ready=${e=>this.handleTerminalReady(e)}
        ></vibe-terminal>
      `:u``}handleClick(e){this.onTerminalClick?.(e)}handleTerminalInput(e){this.onTerminalInput?.(e)}handleTerminalResize(e){this.onTerminalResize?.(e)}handleTerminalReady(e){this.onTerminalReady?.(e)}};d([C({type:Object})],Fe.prototype,"session",2),d([C({type:Boolean})],Fe.prototype,"useBinaryMode",2),d([C({type:Number})],Fe.prototype,"terminalFontSize",2),d([C({type:Number})],Fe.prototype,"terminalMaxCols",2),d([C({type:String})],Fe.prototype,"terminalTheme",2),d([C({type:Boolean})],Fe.prototype,"disableClick",2),d([C({type:Boolean})],Fe.prototype,"hideScrollButton",2),d([C({type:Object})],Fe.prototype,"onTerminalClick",2),d([C({type:Object})],Fe.prototype,"onTerminalInput",2),d([C({type:Object})],Fe.prototype,"onTerminalResize",2),d([C({type:Object})],Fe.prototype,"onTerminalReady",2),Fe=d([D("terminal-renderer")],Fe);q();var io=P("mobile-input-overlay"),Oe=class extends R{constructor(){super(...arguments);this.visible=!1;this.mobileInputText="";this.keyboardHeight=0;this.touchStartX=0;this.touchStartY=0;this.isComposing=!1;this.compositionBuffer="";this.touchStartHandler=e=>{let t=e.touches[0];this.touchStartX=t.clientX,this.touchStartY=t.clientY};this.touchEndHandler=e=>{let t=e.changedTouches[0],s=t.clientX,n=t.clientY,o=s-this.touchStartX,r=n-this.touchStartY,a=o>100,m=Math.abs(r)<100,p=this.touchStartX<50;a&&m&&p&&this.handleBack&&this.handleBack()};this.handleCompositionStart=e=>{this.isComposing=!0,this.compositionBuffer=""};this.handleCompositionUpdate=e=>{this.compositionBuffer=e.data||""};this.handleCompositionEnd=e=>{this.isComposing=!1;let t=e.data||"",s=e.target;s&&t&&(this.mobileInputText=s.value,this.onTextChange?.(s.value),this.requestUpdate()),this.compositionBuffer=""}}createRenderRoot(){return this}handleMobileInputChange(e){let t=e.target;this.isComposing||(this.mobileInputText=t.value,this.onTextChange?.(t.value),this.requestUpdate())}focusMobileTextarea(){let e=this.querySelector("#mobile-input-textarea");e&&(e.focus(),e.setAttribute("readonly","readonly"),e.focus(),setTimeout(()=>{e.removeAttribute("readonly"),e.focus(),e.setSelectionRange(e.value.length,e.value.length)},100))}async handleMobileInputSendOnly(){let e=this.querySelector("#mobile-input-textarea"),t=e?.value?.trim()||this.mobileInputText.trim();t&&(this.onSend?.(t),this.mobileInputText="",e&&(e.value=""),this.requestUpdate())}async handleMobileInputSend(){let e=this.querySelector("#mobile-input-textarea"),t=e?.value?.trim()||this.mobileInputText.trim();t&&(this.onSendWithEnter?.(t),this.mobileInputText="",e&&(e.value=""),this.requestUpdate())}handleKeydown(e){e.key==="Enter"&&(e.ctrlKey||e.metaKey)?(e.preventDefault(),this.handleMobileInputSend()):e.key==="Escape"&&(e.preventDefault(),this.onCancel?.())}handleFocus(e){e.stopPropagation(),io.log("Mobile input textarea focused")}handleBlur(e){e.stopPropagation(),io.log("Mobile input textarea blurred")}handleContainerClick(e){e.stopPropagation(),this.focusMobileTextarea()}updated(){this.visible&&setTimeout(()=>{this.focusMobileTextarea()},100)}render(){return this.visible?u`
      <modal-wrapper
        .visible=${this.visible}
        modalClass="z-40" /* z-40 ensures overlay appears above base UI elements */
        contentClass="fixed inset-0 flex flex-col z-40" /* z-40 matches modal backdrop z-index */
        ariaLabel="Mobile input overlay"
        @close=${()=>this.onCancel?.()}
        .closeOnBackdrop=${!0}
        .closeOnEscape=${!1}
      >
        <div @touchstart=${this.touchStartHandler} @touchend=${this.touchEndHandler} class="h-full flex flex-col">
          <!-- Spacer to push content up above keyboard -->
          <div class="flex-1"></div>

          <div
            class="mobile-input-container font-mono text-sm mx-4 flex flex-col"
            style="background: rgb(var(--color-bg)); border: 1px solid rgb(var(--color-primary)); border-radius: 8px; margin-bottom: ${this.keyboardHeight>0?`${this.keyboardHeight}px`:"env(keyboard-inset-height, 0px)"};"
            @click=${this.handleContainerClick}
          >
          <!-- Input Area -->
          <div class="p-4 flex flex-col">
            <textarea
              id="mobile-input-textarea"
              class="w-full font-mono text-sm resize-none outline-none"
              placeholder="Type your command here..."
              .value=${this.mobileInputText}
              @input=${this.handleMobileInputChange}
              @focus=${this.handleFocus}
              @blur=${this.handleBlur}
              @keydown=${this.handleKeydown}
              @compositionstart=${this.handleCompositionStart}
              @compositionupdate=${this.handleCompositionUpdate}
              @compositionend=${this.handleCompositionEnd}
              style="height: 120px; background: rgb(var(--color-bg)); color: rgb(var(--color-text)); border: none; padding: 12px;"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              data-autocorrect="off"
              data-gramm="false"
              data-ms-editor="false"
              data-smartpunctuation="false"
              data-form-type="other"
              inputmode="text"
              enterkeyhint="done"
            ></textarea>
          </div>

          <!-- Controls -->
          <div class="p-4 flex gap-2" style="border-top: 1px solid rgb(var(--color-border));">
            <button
              class="font-mono px-3 py-2 text-xs transition-colors btn-ghost"
              @click=${()=>this.onCancel?.()}
            >
              CANCEL
            </button>
            <button
              class="flex-1 font-mono px-3 py-2 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed btn-ghost"
              @click=${this.handleMobileInputSendOnly}
              ?disabled=${!this.mobileInputText.trim()}
            >
              SEND
            </button>
            <button
              class="flex-1 font-mono px-3 py-2 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed btn-secondary"
              @click=${this.handleMobileInputSend}
              ?disabled=${!this.mobileInputText.trim()}
            >
              SEND + ⏎
            </button>
          </div>
        </div>
        </div>
      </modal-wrapper>
    `:null}};d([C({type:Boolean})],Oe.prototype,"visible",2),d([C({type:String})],Oe.prototype,"mobileInputText",2),d([C({type:Number})],Oe.prototype,"keyboardHeight",2),d([C({type:Number})],Oe.prototype,"touchStartX",2),d([C({type:Number})],Oe.prototype,"touchStartY",2),d([C({type:Function})],Oe.prototype,"onSend",2),d([C({type:Function})],Oe.prototype,"onSendWithEnter",2),d([C({type:Function})],Oe.prototype,"onCancel",2),d([C({type:Function})],Oe.prototype,"onTextChange",2),d([C({type:Function})],Oe.prototype,"handleBack",2),d([C({type:String})],Oe.prototype,"compositionBuffer",2),Oe=d([D("mobile-input-overlay")],Oe);var st=class extends R{constructor(){super(...arguments);this.visible=!1;this.ctrlSequence=[];this.keyboardHeight=0}createRenderRoot(){return this}handleCtrlKey(e){this.onCtrlKey?.(e)}render(){return console.log("[CtrlAlphaOverlay] render called, visible:",this.visible),this.visible?u`
      <!-- Direct backdrop -->
      <div 
        class="fixed inset-0 bg-bg/80 flex items-center justify-center p-4"
        style="z-index: 1000; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);"
        @click=${e=>{e.target===e.currentTarget&&this.onCancel?.()}}
      >
        <!-- Modal content -->
        <div
          class="bg-surface border-2 border-primary rounded-lg p-4 shadow-xl relative"
          style="z-index: 1001; background-color: rgb(var(--color-bg-secondary)); max-height: 80vh; overflow-y: auto; max-width: 24rem; width: 100%;"
          @click=${e=>e.stopPropagation()}
        >
          <div class="text-primary text-center mb-2 font-bold">Ctrl + Key</div>

          <!-- Help text -->
          <div class="text-xs text-text-muted text-center mb-3 opacity-70">
            Build sequences like ctrl+c ctrl+c
          </div>

          <!-- Current sequence display -->
          ${this.ctrlSequence.length>0?u`
                <div class="text-center mb-4 p-2 border border-border rounded bg-bg">
                  <div class="text-xs text-text-muted mb-1">Current sequence:</div>
                  <div class="text-sm text-primary font-bold">
                    ${this.ctrlSequence.map(e=>`Ctrl+${e}`).join(" ")}
                  </div>
                </div>
              `:""}

          <!-- Grid of A-Z buttons -->
          <div class="grid grid-cols-6 gap-1 mb-3">
            ${["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"].map(e=>u`
                <button
                  class="font-mono text-xs transition-all cursor-pointer aspect-square flex items-center justify-center quick-start-btn py-2"
                  @click=${()=>this.handleCtrlKey(e)}
                >
                  ${e}
                </button>
              `)}
          </div>

          <!-- Common shortcuts info -->
          <div class="text-xs text-text-muted text-center mb-3">
            <div>Common: C=interrupt, X=exit, O=save, W=search</div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-2 justify-center">
            <button
              class="font-mono px-4 py-2 text-sm transition-all cursor-pointer btn-ghost"
              @click=${()=>this.onCancel?.()}
            >
              CANCEL
            </button>
            ${this.ctrlSequence.length>0?u`
                  <button
                    class="font-mono px-3 py-2 text-sm transition-all cursor-pointer btn-ghost"
                    @click=${()=>this.onClearSequence?.()}
                  >
                    CLEAR
                  </button>
                  <button
                    class="font-mono px-3 py-2 text-sm transition-all cursor-pointer btn-secondary"
                    @click=${()=>this.onSendSequence?.()}
                  >
                    SEND
                  </button>
                `:""}
          </div>
        </div>
      </div>
    `:null}};d([C({type:Boolean})],st.prototype,"visible",2),d([C({type:Array})],st.prototype,"ctrlSequence",2),d([C({type:Number})],st.prototype,"keyboardHeight",2),d([C({type:Function})],st.prototype,"onCtrlKey",2),d([C({type:Function})],st.prototype,"onSendSequence",2),d([C({type:Function})],st.prototype,"onClearSequence",2),d([C({type:Function})],st.prototype,"onCancel",2),st=d([D("ctrl-alpha-overlay")],st);var Lr=[{key:"Escape",label:"Esc",row:1},{key:"Control",label:"Ctrl",modifier:!0,row:1},{key:"CtrlExpand",label:"\u2303",toggle:!0,row:1},{key:"F",label:"F",toggle:!0,row:1},{key:"Tab",label:"Tab",row:1},{key:"shift_tab",label:"\u21E4",row:1},{key:"ArrowUp",label:"\u2191",arrow:!0,row:1},{key:"ArrowDown",label:"\u2193",arrow:!0,row:1},{key:"ArrowLeft",label:"\u2190",arrow:!0,row:1},{key:"ArrowRight",label:"\u2192",arrow:!0,row:1},{key:"PageUp",label:"PgUp",row:1},{key:"PageDown",label:"PgDn",row:1},{key:"Home",label:"Home",row:2},{key:"Paste",label:"Paste",row:2},{key:"End",label:"End",row:2},{key:"Delete",label:"Del",row:2},{key:"`",label:"`",row:2},{key:"~",label:"~",row:2},{key:"|",label:"|",row:2},{key:"/",label:"/",row:2},{key:"\\",label:"\\",row:2},{key:"-",label:"-",row:2},{key:"Option",label:"\u2325",modifier:!0,row:3},{key:"Command",label:"\u2318",modifier:!0,row:3},{key:"Ctrl+C",label:"^C",combo:!0,row:3},{key:"Ctrl+Z",label:"^Z",combo:!0,row:3},{key:"'",label:"'",row:3},{key:'"',label:'"',row:3},{key:"{",label:"{",row:3},{key:"}",label:"}",row:3},{key:"[",label:"[",row:3},{key:"]",label:"]",row:3},{key:"(",label:"(",row:3},{key:")",label:")",row:3}],ma=[{key:"Ctrl+D",label:"^D",combo:!0,description:"EOF/logout"},{key:"Ctrl+L",label:"^L",combo:!0,description:"Clear screen"},{key:"Ctrl+R",label:"^R",combo:!0,description:"Reverse search"},{key:"Ctrl+W",label:"^W",combo:!0,description:"Delete word"},{key:"Ctrl+U",label:"^U",combo:!0,description:"Clear line"},{key:"Ctrl+A",label:"^A",combo:!0,description:"Start of line"},{key:"Ctrl+E",label:"^E",combo:!0,description:"End of line"},{key:"Ctrl+K",label:"^K",combo:!0,description:"Kill to EOL"},{key:"CtrlFull",label:"Ctrl\u2026",special:!0,description:"Full Ctrl UI"}],fa=Array.from({length:12},(c,i)=>({key:`F${i+1}`,label:`F${i+1}`,func:!0})),ge={key:"Done",label:"Done",special:!0},St=class extends R{constructor(){super(...arguments);this.visible=!1;this.showFunctionKeys=!1;this.showCtrlKeys=!1;this.isLandscape=!1;this.keyRepeatInterval=null;this.keyRepeatTimeout=null;this.orientationHandler=null;this.activeModifiers=new Set}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.checkOrientation(),this.orientationHandler=()=>{this.checkOrientation()},window.addEventListener("resize",this.orientationHandler),window.addEventListener("orientationchange",this.orientationHandler)}checkOrientation(){this.isLandscape=window.innerWidth>window.innerHeight&&window.innerWidth>600}getButtonSizeClass(e){return this.isLandscape?"px-0.5 py-1":"px-1 py-1.5"}getButtonFontClass(e){return e.length>=4?"quick-key-btn-xs":e.length===3?"quick-key-btn-small":"quick-key-btn-medium"}updated(e){super.updated(e)}handleKeyPress(e,t=!1,s=!1,n=!1,o){if(o&&(o.preventDefault(),o.stopPropagation()),n&&e==="F"){this.showFunctionKeys=!this.showFunctionKeys,this.showCtrlKeys=!1;return}if(n&&e==="CtrlExpand"){this.showCtrlKeys=!this.showCtrlKeys,this.showFunctionKeys=!1;return}if(this.showFunctionKeys&&e.startsWith("F")&&e!=="F"&&(this.showFunctionKeys=!1),this.showCtrlKeys&&e.startsWith("Ctrl+")&&(this.showCtrlKeys=!1),t&&e==="Option"){this.activeModifiers.has("Option")?this.activeModifiers.delete("Option"):this.activeModifiers.add("Option"),this.requestUpdate();return}if(this.activeModifiers.has("Option")&&e.startsWith("Arrow")){this.activeModifiers.delete("Option"),this.requestUpdate(),this.onKeyPress&&(this.onKeyPress("Option",!0,!1),this.onKeyPress(e,!1,!1));return}this.activeModifiers.has("Option")&&!e.startsWith("Arrow")&&(this.activeModifiers.clear(),this.requestUpdate()),this.onKeyPress&&this.onKeyPress(e,t,s,n)}handlePasteImmediate(e){console.log("[QuickKeys] Paste button touched - delegating to paste handler"),this.onKeyPress&&this.onKeyPress("Paste",!1,!1)}startKeyRepeat(e,t,s){e.startsWith("Arrow")&&(this.stopKeyRepeat(),this.onKeyPress&&this.onKeyPress(e,t,s,!1),this.keyRepeatTimeout=window.setTimeout(()=>{this.keyRepeatInterval=window.setInterval(()=>{this.onKeyPress&&this.onKeyPress(e,t,s)},50)},500))}stopKeyRepeat(){this.keyRepeatTimeout&&(clearTimeout(this.keyRepeatTimeout),this.keyRepeatTimeout=null),this.keyRepeatInterval&&(clearInterval(this.keyRepeatInterval),this.keyRepeatInterval=null)}disconnectedCallback(){super.disconnectedCallback(),this.stopKeyRepeat(),this.orientationHandler&&(window.removeEventListener("resize",this.orientationHandler),window.removeEventListener("orientationchange",this.orientationHandler),this.orientationHandler=null)}renderStyles(){return u`
      <style>
        
        /* Quick keys container - positioned above keyboard */
        .terminal-quick-keys-container {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: ${ie.TERMINAL_QUICK_KEYS};
          background-color: rgb(var(--color-bg-secondary) / 0.98);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          width: 100vw;
          max-width: 100vw;
          /* No safe areas needed when above keyboard */
          padding-left: 0;
          padding-right: 0;
          margin-left: 0;
          margin-right: 0;
          box-sizing: border-box;
        }
        
        /* The actual bar with buttons */
        .quick-keys-bar {
          background: transparent;
          border-top: 1px solid rgb(var(--color-border-base) / 0.5);
          padding: 0.25rem 0;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }
        
        /* Button rows - ensure full width */
        .quick-keys-bar > div {
          width: 100%;
          padding-left: 0.125rem;
          padding-right: 0.125rem;
        }
        
        /* Quick key buttons */
        .quick-key-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          flex: 1 1 0;
          min-width: 0;
        }
        
        /* Modifier key styling */
        .modifier-key {
          background-color: rgb(var(--color-bg-tertiary));
          border-color: rgb(var(--color-border-base));
        }
        
        .modifier-key:hover {
          background-color: rgb(var(--color-bg-secondary));
        }
        
        /* Active modifier styling */
        .modifier-key.active {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .modifier-key.active:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Arrow key styling */
        .arrow-key {
          font-size: 1rem;
          padding: 0.375rem 0.5rem;
        }
        
        /* Medium font for short character buttons */
        .quick-key-btn-medium {
          font-size: 13px;
        }
        
        /* Small font for mobile keyboard buttons */
        .quick-key-btn-small {
          font-size: 10px;
        }
        
        /* Extra small font for long text buttons */
        .quick-key-btn-xs {
          font-size: 8px;
        }
        
        /* Combo key styling (like ^C, ^Z) */
        .combo-key {
          background-color: rgb(var(--color-bg-tertiary));
          border-color: rgb(var(--color-border-accent));
        }
        
        .combo-key:hover {
          background-color: rgb(var(--color-bg-secondary));
        }
        
        /* Special key styling (like ABC) */
        .special-key {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .special-key:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Function key styling */
        .func-key-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          flex: 1 1 0;
          min-width: 0;
        }
        
        /* Scrollable row styling */
        .scrollable-row {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        
        /* Hide scrollbar but keep functionality */
        .scrollable-row::-webkit-scrollbar {
          display: none;
        }
        
        .scrollable-row {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        /* Toggle button styling */
        .toggle-key {
          background-color: rgb(var(--color-bg-secondary));
          border-color: rgb(var(--color-border-accent));
        }
        
        .toggle-key:hover {
          background-color: rgb(var(--color-bg-tertiary));
        }
        
        .toggle-key.active {
          background-color: rgb(var(--color-primary));
          border-color: rgb(var(--color-primary));
          color: rgb(var(--color-text-bright));
        }
        
        .toggle-key.active:hover {
          background-color: rgb(var(--color-primary-hover));
        }
        
        /* Ctrl shortcut button styling */
        .ctrl-shortcut-btn {
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
          flex: 1 1 0;
          min-width: 0;
        }
        
      </style>
    `}render(){return this.visible?u`
      <div 
        class="terminal-quick-keys-container"
        @mousedown=${e=>e.preventDefault()}
        @touchstart=${e=>e.preventDefault()}
      >
        <div class="quick-keys-bar">
          <!-- Row 1 -->
          <div class="flex gap-0.5 mb-0.5">
            ${Lr.filter(e=>e.row===1).map(({key:e,label:t,modifier:s,arrow:n,toggle:o})=>u`
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(t)} min-w-0 ${this.getButtonSizeClass(t)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${s?"modifier-key":""} ${n?"arrow-key":""} ${o?"toggle-key":""} ${o&&(e==="CtrlExpand"&&this.showCtrlKeys||e==="F"&&this.showFunctionKeys)?"active":""} ${s&&e==="Option"&&this.activeModifiers.has("Option")?"active":""}"
                  @mousedown=${r=>{r.preventDefault(),r.stopPropagation()}}
                  @touchstart=${r=>{r.preventDefault(),r.stopPropagation(),n&&this.startKeyRepeat(e,s||!1,!1)}}
                  @touchend=${r=>{r.preventDefault(),r.stopPropagation(),n?this.stopKeyRepeat():this.handleKeyPress(e,s,!1,o,r)}}
                  @touchcancel=${r=>{n&&this.stopKeyRepeat()}}
                  @click=${r=>{r.detail!==0&&!n&&this.handleKeyPress(e,s,!1,o,r)}}
                >
                  ${t}
                </button>
              `)}
          </div>
          
          <!-- Row 2 or Function Keys or Ctrl Shortcuts (with Done button always visible) -->
          ${this.showCtrlKeys?u`
              <!-- Ctrl shortcuts row with Done button -->
              <div class="flex gap-0.5 mb-0.5">
                ${ma.map(({key:e,label:t,combo:s,special:n})=>u`
                    <button
                      type="button"
                      tabindex="-1"
                      class="ctrl-shortcut-btn ${this.getButtonFontClass(t)} min-w-0 ${this.getButtonSizeClass(t)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${s?"combo-key":""} ${n?"special-key":""}"
                      @mousedown=${o=>{o.preventDefault(),o.stopPropagation()}}
                      @touchstart=${o=>{o.preventDefault(),o.stopPropagation()}}
                      @touchend=${o=>{o.preventDefault(),o.stopPropagation(),this.handleKeyPress(e,!1,n,!1,o)}}
                      @click=${o=>{o.detail!==0&&this.handleKeyPress(e,!1,n,!1,o)}}
                    >
                      ${t}
                    </button>
                  `)}
                <!-- Done button -->
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(ge.label)} min-w-0 ${this.getButtonSizeClass(ge.label)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap special-key"
                  @mousedown=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchstart=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchend=${e=>{e.preventDefault(),e.stopPropagation(),this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                  @click=${e=>{e.detail!==0&&this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                >
                  ${ge.label}
                </button>
              </div>
            `:this.showFunctionKeys?u`
              <!-- Function keys row with Done button -->
              <div class="flex gap-0.5 mb-0.5">
                ${fa.map(({key:e,label:t})=>u`
                    <button
                      type="button"
                      tabindex="-1"
                      class="func-key-btn ${this.getButtonFontClass(t)} min-w-0 ${this.getButtonSizeClass(t)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap"
                      @mousedown=${s=>{s.preventDefault(),s.stopPropagation()}}
                      @touchstart=${s=>{s.preventDefault(),s.stopPropagation()}}
                      @touchend=${s=>{s.preventDefault(),s.stopPropagation(),this.handleKeyPress(e,!1,!1,!1,s)}}
                      @click=${s=>{s.detail!==0&&this.handleKeyPress(e,!1,!1,!1,s)}}
                    >
                      ${t}
                    </button>
                  `)}
                <!-- Done button -->
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(ge.label)} min-w-0 ${this.getButtonSizeClass(ge.label)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap special-key"
                  @mousedown=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchstart=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchend=${e=>{e.preventDefault(),e.stopPropagation(),this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                  @click=${e=>{e.detail!==0&&this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                >
                  ${ge.label}
                </button>
              </div>
            `:u`
              <!-- Regular row 2 -->
              <div class="flex gap-0.5 mb-0.5 ">
                ${Lr.filter(e=>e.row===2).map(({key:e,label:t,modifier:s,combo:n,toggle:o})=>u`
                    <button
                      type="button"
                      tabindex="-1"
                      class="quick-key-btn ${this.getButtonFontClass(t)} min-w-0 ${this.getButtonSizeClass(t)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${s?"modifier-key":""} ${n?"combo-key":""} ${o?"toggle-key":""} ${o&&this.showFunctionKeys?"active":""}"
                      @mousedown=${r=>{r.preventDefault(),r.stopPropagation()}}
                      @touchstart=${r=>{r.preventDefault(),r.stopPropagation()}}
                      @touchend=${r=>{r.preventDefault(),r.stopPropagation(),e==="Paste"?this.handlePasteImmediate(r):this.handleKeyPress(e,s||n,!1,!1,r)}}
                      @click=${r=>{r.detail!==0&&this.handleKeyPress(e,s||n,!1,!1,r)}}
                    >
                      ${t}
                    </button>
                  `)}
                <!-- Done button (in regular row 2) -->
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(ge.label)} min-w-0 ${this.getButtonSizeClass(ge.label)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap special-key"
                  @mousedown=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchstart=${e=>{e.preventDefault(),e.stopPropagation()}}
                  @touchend=${e=>{e.preventDefault(),e.stopPropagation(),this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                  @click=${e=>{e.detail!==0&&this.handleKeyPress(ge.key,!1,ge.special,!1,e)}}
                >
                  ${ge.label}
                </button>
              </div>
            `}
          
          <!-- Row 3 - Additional special characters (always visible) -->
          <div class="flex gap-0.5 ">
            ${Lr.filter(e=>e.row===3).map(({key:e,label:t,modifier:s,combo:n})=>u`
                <button
                  type="button"
                  tabindex="-1"
                  class="quick-key-btn ${this.getButtonFontClass(t)} min-w-0 ${this.getButtonSizeClass(t)} bg-bg-tertiary text-primary font-mono rounded border border-border hover:bg-surface hover:border-primary transition-all whitespace-nowrap ${s?"modifier-key":""} ${n?"combo-key":""} ${s&&e==="Option"&&this.activeModifiers.has("Option")?"active":""}"
                  @mousedown=${o=>{o.preventDefault(),o.stopPropagation()}}
                  @touchstart=${o=>{o.preventDefault(),o.stopPropagation()}}
                  @touchend=${o=>{o.preventDefault(),o.stopPropagation(),this.handleKeyPress(e,s||n,!1,!1,o)}}
                  @click=${o=>{o.detail!==0&&this.handleKeyPress(e,s||n,!1,!1,o)}}
                >
                  ${t}
                </button>
              `)}
          </div>
        </div>
      </div>
      ${this.renderStyles()}
    `:""}};d([C({type:Function})],St.prototype,"onKeyPress",2),d([C({type:Boolean})],St.prototype,"visible",2),d([_()],St.prototype,"showFunctionKeys",2),d([_()],St.prototype,"showCtrlKeys",2),d([_()],St.prototype,"isLandscape",2),St=d([D("terminal-quick-keys")],St);Me();q();var so=P("file-picker"),Ct=class extends R{constructor(){super(...arguments);this.visible=!1;this.showPathOption=!0;this.directSelect=!1;this.uploading=!1;this.uploadProgress=0;this.fileInput=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.createFileInput()}updated(e){super.updated(e),e.has("visible")&&this.visible&&this.directSelect&&setTimeout(()=>{this.handleFileClick(),this.visible=!1},10)}disconnectedCallback(){super.disconnectedCallback(),this.fileInput&&(this.fileInput.remove(),this.fileInput=null)}createFileInput(){this.fileInput=document.createElement("input"),this.fileInput.type="file",this.fileInput.accept="*/*",this.fileInput.capture="environment",this.fileInput.style.display="none",this.fileInput.addEventListener("change",this.handleFileSelect.bind(this)),document.body.appendChild(this.fileInput)}async handleFileSelect(e){let t=e.target,s=t.files?.[0];if(s){try{await this.uploadFileToServer(s)}catch(n){so.error("Failed to upload file:",n),this.dispatchEvent(new CustomEvent("file-error",{detail:n instanceof Error?n.message:"Failed to upload file"}))}t.value=""}}async uploadFile(e){return this.uploadFileToServer(e)}openFilePicker(){this.handleFileClick()}openImagePicker(){this.fileInput||this.createFileInput(),this.fileInput&&(this.fileInput.accept="image/*",this.fileInput.removeAttribute("capture"),this.fileInput.click())}openCamera(){this.fileInput||this.createFileInput(),this.fileInput&&(this.fileInput.accept="image/*",this.fileInput.capture="environment",this.fileInput.click())}async uploadFileToServer(e){this.uploading=!0,this.uploadProgress=0;try{let t=new FormData;t.append("file",e);let s=new XMLHttpRequest;return new Promise((n,o)=>{s.upload.addEventListener("progress",a=>{a.lengthComputable&&(this.uploadProgress=a.loaded/a.total*100)}),s.addEventListener("load",()=>{if(this.uploading=!1,s.status===200)try{let a=JSON.parse(s.responseText);a.success?(so.log(`File uploaded successfully: ${a.filename}`),this.dispatchEvent(new CustomEvent("file-selected",{detail:{path:a.path,relativePath:a.relativePath,filename:a.filename,originalName:a.originalName,size:a.size,mimetype:a.mimetype}})),n()):o(new Error(a.error||"Upload failed"))}catch{o(new Error("Invalid response from server"))}else o(new Error(`Upload failed with status ${s.status}`))}),s.addEventListener("error",()=>{this.uploading=!1,o(new Error("Upload failed"))}),s.addEventListener("abort",()=>{this.uploading=!1,o(new Error("Upload aborted"))}),s.open("POST","/api/files/upload");let r=N.getAuthHeader();for(let[a,m]of Object.entries(r))s.setRequestHeader(a,m);s.send(t)})}catch(t){throw this.uploading=!1,t}}handleFileClick(){this.fileInput||this.createFileInput(),this.fileInput&&(this.fileInput.accept="*/*",this.fileInput.removeAttribute("capture"),this.fileInput.click())}handleCancel(){this.dispatchEvent(new CustomEvent("file-cancel"))}render(){return this.visible?u`
      <div class="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center animate-fade-in" style="z-index: ${ie.FILE_PICKER};" @click=${this.handleCancel}>
        <div class="bg-elevated border border-border/50 rounded-xl shadow-2xl p-8 m-4 max-w-sm w-full animate-scale-in" @click=${e=>e.stopPropagation()}>
          <h3 class="text-xl font-bold text-primary mb-6">
            Select File
          </h3>
          
          ${this.uploading?u`
            <div class="mb-6">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm text-text-muted font-mono">Uploading...</span>
                <span class="text-sm text-primary font-mono font-medium">${Math.round(this.uploadProgress)}%</span>
              </div>
              <div class="w-full bg-bg-secondary rounded-full h-2 overflow-hidden">
                <div 
                  class="bg-gradient-to-r from-primary to-primary-light h-2 rounded-full transition-all duration-300 shadow-glow-sm" 
                  style="width: ${this.uploadProgress}%"
                ></div>
              </div>
            </div>
          `:u`
            <div class="space-y-4">
              <button
                id="file-picker-choose-button"
                @click=${this.handleFileClick}
                class="w-full bg-primary text-bg font-medium py-4 px-6 rounded-lg flex items-center justify-center gap-3 transition-all duration-200 hover:bg-primary-light hover:shadow-glow active:scale-95"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-5L9 2H4z" clip-rule="evenodd"/>
                </svg>
                <span class="font-mono">Choose File</span>
              </button>
            </div>
          `}
          
          <div class="mt-6 pt-6 border-t border-border/50">
            <button
              id="file-picker-cancel-button"
              @click=${this.handleCancel}
              class="w-full bg-bg-secondary border border-border/50 text-primary font-mono py-3 px-6 rounded-lg transition-all duration-200 hover:bg-surface hover:border-primary active:scale-95"
              ?disabled=${this.uploading}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    `:u`<div style="display: none;"></div>`}};d([C({type:Boolean})],Ct.prototype,"visible",2),d([C({type:Boolean})],Ct.prototype,"showPathOption",2),d([C({type:Boolean})],Ct.prototype,"directSelect",2),d([_()],Ct.prototype,"uploading",2),d([_()],Ct.prototype,"uploadProgress",2),Ct=d([D("file-picker")],Ct);q();var Ci=P("terminal-settings-modal"),Le=class extends R{constructor(){super(...arguments);this.preferencesManager=Ze.getInstance();this.visible=!1;this.terminalMaxCols=0;this.terminalFontSize=14;this._terminalTheme="auto";this.customWidth="";this.showCustomInput=!1;this.isMobile=!1;this.useBinaryMode=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.terminalTheme=this.preferencesManager.getTheme(),this.loadBinaryModePreference()}get terminalTheme(){return this._terminalTheme}set terminalTheme(e){Ci.debug("Terminal theme set to:",e),this._terminalTheme=e,this.requestUpdate()}handleCustomWidthInput(e){let t=e.target;this.customWidth=t.value,this.requestUpdate()}handleCustomWidthSubmit(){let e=Number.parseInt(this.customWidth,10);!Number.isNaN(e)&&e>=20&&e<=500&&(this.onWidthSelect?.(e),this.customWidth="",this.showCustomInput=!1)}handleClose(){this.showCustomInput=!1,this.customWidth="",this.onClose?.()}handleCustomWidthKeydown(e){e.key==="Enter"?this.handleCustomWidthSubmit():e.key==="Escape"&&this.handleClose()}getArrowColor(){return Or()}loadBinaryModePreference(){try{let e=localStorage.getItem(Ht);if(e){let t=JSON.parse(e);this.useBinaryMode=t.useBinaryMode??!1}}catch(e){Ci.warn("Failed to load binary mode preference",e)}}saveBinaryModePreference(e){try{let t=localStorage.getItem(Ht),s=t?JSON.parse(t):{};s.useBinaryMode=e,localStorage.setItem(Ht,JSON.stringify(s)),window.dispatchEvent(new CustomEvent("app-preferences-changed",{detail:s})),window.dispatchEvent(new CustomEvent("terminal-binary-mode-changed",{detail:e}))}catch(t){Ci.error("Failed to save binary mode preference",t)}}updated(e){super.updated(e),(e.has("terminalTheme")||e.has("visible"))&&requestAnimationFrame(()=>{let t=this.querySelector("#theme-select");t&&this.terminalTheme&&(Ci.debug("Updating theme select value to:",this.terminalTheme),t.value=this.terminalTheme)})}render(){if(!this.visible)return null;Ci.debug("Dialog opening, terminal theme:",this.terminalTheme);let e=this.terminalMaxCols>0&&!Ki.find(t=>t.value===this.terminalMaxCols);return u`
      <!-- Backdrop to close on outside click -->
      <div 
        class="fixed inset-0 z-40" 
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-settings-title"
        @click=${()=>this.handleClose()}
      ></div>
      
      <!-- Terminal settings modal -->
      <div
        class="width-selector-container fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-surface border border-border rounded-lg shadow-elevated w-[400px] max-w-[90vw] animate-fade-in"
        style="z-index: ${ie.WIDTH_SELECTOR_DROPDOWN};"
      >
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h2 id="terminal-settings-title" class="text-lg font-semibold text-text-bright">Terminal Settings</h2>
            <button
              class="text-text-muted hover:text-primary transition-colors p-1"
              @click=${()=>this.handleClose()}
              title="Close"
              aria-label="Close terminal settings"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <!-- Settings grid -->
          <div class="space-y-4">
            <!-- Width setting -->
            <div class="grid grid-cols-[120px_1fr] gap-4 items-center">
              <label class="text-sm font-medium text-text-bright text-right">Width</label>
              <select
                class="w-full bg-bg-secondary border border-border rounded-md pl-4 pr-10 py-3 text-sm font-mono text-text focus:border-primary focus:shadow-glow-sm cursor-pointer appearance-none"
                style="background-image: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22${this.getArrowColor()}%22%3e%3cpath fill-rule=%22evenodd%22 d=%22M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z%22 clip-rule=%22evenodd%22/%3e%3c/svg%3e'); background-position: right 0.75rem center; background-repeat: no-repeat; background-size: 1.25em 1.25em;"
                .value=${e||this.showCustomInput?"custom":String(this.terminalMaxCols)}
                @click=${t=>t.stopPropagation()}
                @mousedown=${t=>t.stopPropagation()}
                @change=${t=>{t.stopPropagation();let s=t.target.value;s==="custom"?(this.showCustomInput=!0,this.customWidth=e?String(this.terminalMaxCols):""):(this.showCustomInput=!1,this.customWidth="",this.onWidthSelect?.(Number.parseInt(s)))}}
              >
                <option value="0">Fit to Window</option>
                ${Ki.slice(1).map(t=>u`
                    <option value=${t.value}>
                      ${t.description} (${t.value})
                    </option>
                  `)}
                <option value="custom">Custom...</option>
              </select>
            </div>
            
            <!-- Custom width input (conditional) -->
            ${this.showCustomInput?u`
              <div class="grid grid-cols-[120px_1fr] gap-4 items-center">
                <div></div>
                <div class="flex gap-2">
                  <input
                    type="number"
                    min="20"
                    max="500"
                    placeholder="Enter width (20-500)"
                    .value=${this.customWidth}
                    @input=${this.handleCustomWidthInput}
                    @keydown=${this.handleCustomWidthKeydown}
                    @click=${t=>t.stopPropagation()}
                    class="flex-1 bg-bg-secondary border border-border rounded-md px-4 py-3 text-sm font-mono text-text placeholder:text-text-dim focus:border-primary focus:shadow-glow-sm transition-all"
                    autofocus
                  />
                  <button
                    class="px-4 py-3 rounded-md text-sm font-medium transition-all duration-200
                      ${!this.customWidth||Number.parseInt(this.customWidth)<20||Number.parseInt(this.customWidth)>500?"bg-bg-secondary border border-border text-text-muted cursor-not-allowed":"bg-primary text-text-bright hover:bg-primary-hover active:scale-95"}"
                    @click=${this.handleCustomWidthSubmit}
                    ?disabled=${!this.customWidth||Number.parseInt(this.customWidth)<20||Number.parseInt(this.customWidth)>500}
                  >
                    Set
                  </button>
                </div>
              </div>
            `:""}
          
            <!-- Font size setting -->
            <div class="grid grid-cols-[120px_1fr] gap-4 items-center">
              <label class="text-sm font-medium text-text-bright text-right">Font Size</label>
              <div class="flex items-center gap-3 bg-bg-secondary border border-border rounded-md px-4 py-2">
                <button
                  class="w-8 h-8 rounded-md border transition-all duration-200 flex items-center justify-center
                    ${this.terminalFontSize<=8?"border-border bg-bg-tertiary text-text-muted cursor-not-allowed":"border-border bg-bg-elevated text-text hover:border-primary hover:text-primary active:scale-95"}"
                  @click=${()=>this.onFontSizeChange?.(this.terminalFontSize-1)}
                  ?disabled=${this.terminalFontSize<=8}
                  title="Decrease font size"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <span class="font-mono text-base font-medium text-text-bright min-w-[60px] text-center">
                  ${this.terminalFontSize}px
                </span>
                <button
                  class="w-8 h-8 rounded-md border transition-all duration-200 flex items-center justify-center
                    ${this.terminalFontSize>=32?"border-border bg-bg-tertiary text-text-muted cursor-not-allowed":"border-border bg-bg-elevated text-text hover:border-primary hover:text-primary active:scale-95"}"
                  @click=${()=>this.onFontSizeChange?.(this.terminalFontSize+1)}
                  ?disabled=${this.terminalFontSize>=32}
                  title="Increase font size"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <div class="flex-1"></div>
              </div>
            </div>
            
            <!-- Theme setting -->
            <div class="grid grid-cols-[120px_1fr] gap-4 items-center">
              <label class="text-sm font-medium text-text-bright text-right">Theme</label>
              <select
                id="theme-select"
                class="w-full bg-bg-secondary border border-border rounded-md pl-4 pr-10 py-3 text-sm font-mono text-text focus:border-primary focus:shadow-glow-sm cursor-pointer appearance-none"
                style="background-image: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22${this.getArrowColor()}%22%3e%3cpath fill-rule=%22evenodd%22 d=%22M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z%22 clip-rule=%22evenodd%22/%3e%3c/svg%3e'); background-position: right 0.75rem center; background-repeat: no-repeat; background-size: 1.25em 1.25em;"
                @click=${t=>t.stopPropagation()}
                @mousedown=${t=>t.stopPropagation()}
                @change=${t=>{t.stopPropagation();let s=t.target.value;Ci.debug("Theme changed to:",s),this.preferencesManager.setTheme(s),window.dispatchEvent(new CustomEvent("terminal-theme-changed",{detail:s})),this.onThemeChange?.(s)}}
              >
                ${Bt.map(t=>u`<option value=${t.id}>${t.name}</option>`)}
              </select>
            </div>
            
            <!-- Binary Mode setting -->
            <div>
              <div class="grid grid-cols-[120px_1fr] gap-4 items-center">
                <label class="text-sm font-medium text-text-bright text-right">Binary Mode</label>
                <div class="flex items-center justify-between bg-bg-secondary border border-border rounded-md px-4 py-3">
                  <button
                    role="switch"
                    aria-checked="${this.useBinaryMode}"
                    @click=${()=>{this.useBinaryMode=!this.useBinaryMode,this.saveBinaryModePreference(this.useBinaryMode)}}
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-base ${this.useBinaryMode?"bg-primary":"bg-border"}"
                  >
                    <span
                      class="inline-block h-5 w-5 transform rounded-full bg-bg-elevated transition-transform ${this.useBinaryMode?"translate-x-5":"translate-x-0.5"}"
                    ></span>
                  </button>
                </div>
              </div>
              <p class="text-xs text-text-muted mt-2">Experimental: More efficient for high-throughput sessions</p>
            </div>
          </div>
        </div>
      </div>
    `}};d([C({type:Boolean})],Le.prototype,"visible",2),d([C({type:Number})],Le.prototype,"terminalMaxCols",2),d([C({type:Number})],Le.prototype,"terminalFontSize",2),d([C({type:String})],Le.prototype,"terminalTheme",1),d([C({type:String})],Le.prototype,"customWidth",2),d([C({type:Boolean})],Le.prototype,"showCustomInput",2),d([C({type:Function})],Le.prototype,"onWidthSelect",2),d([C({type:Function})],Le.prototype,"onFontSizeChange",2),d([C({type:Function})],Le.prototype,"onThemeChange",2),d([C({type:Function})],Le.prototype,"onClose",2),d([C({type:Boolean})],Le.prototype,"isMobile",2),d([_()],Le.prototype,"useBinaryMode",2),Le=d([D("terminal-settings-modal")],Le);var ri=class extends R{constructor(){super(...arguments);this.session=null;this.uiState=null;this.callbacks=null}createRenderRoot(){return this}render(){return!this.uiState||!this.callbacks?u``:u`
      <!-- Floating Session Exited Banner -->
      ${this.session?.status==="exited"?u`
            <div
              class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              style="z-index: ${ie.SESSION_EXITED_OVERLAY}; pointer-events: none !important;"
            >
              <div
                class="bg-elevated border border-status-warning text-status-warning font-medium text-sm tracking-wide px-6 py-3 rounded-lg shadow-elevated animate-scale-in"
                style="pointer-events: none !important;"
              >
                <span class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-status-warning"></span>
                  SESSION EXITED
                </span>
              </div>
            </div>
          `:""}
      
      <!-- Mobile Input Overlay -->
      <mobile-input-overlay
        .visible=${this.uiState.isMobile&&this.uiState.showMobileInput}
        .mobileInputText=${this.uiState.mobileInputText}
        .keyboardHeight=${this.uiState.keyboardHeight}
        .touchStartX=${this.uiState.touchStartX}
        .touchStartY=${this.uiState.touchStartY}
        .onSend=${this.callbacks.onMobileInputSendOnly}
        .onSendWithEnter=${this.callbacks.onMobileInputSend}
        .onCancel=${this.callbacks.onMobileInputCancel}
        .onTextChange=${this.callbacks.onMobileInputTextChange}
        .handleBack=${this.callbacks.handleBack}
      ></mobile-input-overlay>
      
      <!-- Ctrl+Alpha Overlay -->
      ${(()=>{let e=this.uiState.isMobile&&this.uiState.showCtrlAlpha;return console.log("[OverlaysContainer] Ctrl+Alpha visible:",e,"isMobile:",this.uiState.isMobile,"showCtrlAlpha:",this.uiState.showCtrlAlpha,"z-index should be above",ie.TERMINAL_QUICK_KEYS),u`
          <ctrl-alpha-overlay
            .visible=${e}
            .ctrlSequence=${this.uiState.ctrlSequence}
            .keyboardHeight=${this.uiState.keyboardHeight}
            .onCtrlKey=${this.callbacks.onCtrlKey}
            .onSendSequence=${this.callbacks.onSendCtrlSequence}
            .onClearSequence=${this.callbacks.onClearCtrlSequence}
            .onCancel=${this.callbacks.onCtrlAlphaCancel}
          ></ctrl-alpha-overlay>
        `})()}
      
      <!-- Floating Keyboard Button (for direct keyboard mode on mobile) -->
      ${this.uiState.isMobile&&this.uiState.useDirectKeyboard&&!this.uiState.showQuickKeys?u`
            <div
              class="keyboard-button"
              @pointerdown=${e=>{e.preventDefault(),e.stopPropagation(),this.callbacks?.onKeyboardButtonClick()}}
              title="Show keyboard"
            >
              ⌨
            </div>
          `:""}
      
      <!-- Terminal Quick Keys (for direct keyboard mode) -->
      <terminal-quick-keys
        .visible=${this.uiState.isMobile&&this.uiState.useDirectKeyboard&&this.uiState.showQuickKeys}
        .onKeyPress=${this.callbacks.onQuickKeyPress}
      ></terminal-quick-keys>
      
      <!-- File Browser Modal -->
      <file-browser
        .visible=${this.uiState.showFileBrowser}
        .mode=${"browse"}
        .session=${this.session}
        @browser-cancel=${this.callbacks.onCloseFileBrowser}
        @insert-path=${this.callbacks.onInsertPath}
      ></file-browser>
      
      <!-- File Picker Modal -->
      <file-picker
        .visible=${this.uiState.showImagePicker}
        @file-selected=${this.callbacks.onFileSelected}
        @file-error=${this.callbacks.onFileError}
        @file-cancel=${this.callbacks.onCloseFilePicker}
      ></file-picker>
      
      <!-- Width Selector Modal -->
      <terminal-settings-modal
        .visible=${this.uiState.showWidthSelector}
        .terminalMaxCols=${this.uiState.terminalMaxCols}
        .terminalFontSize=${this.uiState.terminalFontSize}
        .terminalTheme=${this.uiState.terminalTheme}
        .customWidth=${this.uiState.customWidth}
        .isMobile=${this.uiState.isMobile}
        .onWidthSelect=${this.callbacks.onWidthSelect}
        .onFontSizeChange=${this.callbacks.onFontSizeChange}
        .onThemeChange=${this.callbacks.onThemeChange}
        .onClose=${this.callbacks.onCloseWidthSelector}
      ></terminal-settings-modal>
      
      <!-- Drag & Drop Overlay -->
      ${this.uiState.isDragOver?u`
            <div class="fixed inset-0 bg-bg/90 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none animate-fade-in">
              <div class="bg-elevated border-2 border-dashed border-primary rounded-xl p-10 text-center max-w-md mx-4 shadow-2xl animate-scale-in">
                <div class="relative mb-6">
                  <div class="w-24 h-24 mx-auto bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center shadow-glow">
                    <svg class="w-12 h-12 text-base" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                    </svg>
                  </div>
                  <div class="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
                </div>
                <h3 class="text-2xl font-bold text-primary mb-3">Drop files here</h3>
                <p class="text-sm text-text-muted mb-4">Files will be uploaded and the path sent to terminal</p>
                <div class="inline-flex items-center gap-2 text-xs text-text-dim bg-bg-secondary px-4 py-2 rounded-lg">
                  <span class="opacity-75">Or press</span>
                  <kbd class="px-2 py-1 bg-bg-tertiary border border-border rounded text-primary font-mono text-xs">⌘V</kbd>
                  <span class="opacity-75">to paste from clipboard</span>
                </div>
              </div>
            </div>
          `:""}
    `}};d([C({type:Object})],ri.prototype,"session",2),d([C({type:Object})],ri.prototype,"uiState",2),d([C({type:Object})],ri.prototype,"callbacks",2),ri=d([D("overlays-container")],ri);var ye=P("session-view"),ut=class extends R{constructor(){super(...arguments);this.session=null;this.showBackButton=!0;this.showSidebarToggle=!1;this.sidebarCollapsed=!1;this.disableFocusManagement=!1;this.keyboardCaptureActive=!0;this.loadingAnimationManager=new Fs;this.fileOperationsManager=new Ls;this.terminalSettingsManager=new Ws;this.sessionActionsHandler=new zs;this.uiStateManager=new Ks;this.gitService=new Jt(N);this.boundHandleTerminalClick=this.handleTerminalClick.bind(this);this.boundHandleTerminalInput=this.handleTerminalInput.bind(this);this.boundHandleTerminalResize=this.handleTerminalResize.bind(this);this.boundHandleTerminalReady=this.handleTerminalReady.bind(this);this.instanceId=`session-view-${Math.random().toString(36).substr(2,9)}`;this._updateTerminalTransformTimeout=null;this.handleBinaryModeChange=e=>{let s=e.detail,n=this.uiStateManager.getState();n.useBinaryMode!==s&&(this.uiStateManager.setUseBinaryMode(s),this.session&&n.connected&&(this.connectionManager.cleanupStreamConnection(),this.requestUpdate(),requestAnimationFrame(()=>{this.ensureTerminalInitialized()})))}}createRenderRoot(){return this}createLifecycleEventManagerCallbacks(){return{requestUpdate:()=>this.requestUpdate(),handleBack:()=>this.handleBack(),handleKeyboardInput:e=>this.handleKeyboardInput(e),getIsMobile:()=>this.uiStateManager.getState().isMobile,setIsMobile:e=>{this.uiStateManager.setIsMobile(e)},getUseDirectKeyboard:()=>this.uiStateManager.getState().useDirectKeyboard,setUseDirectKeyboard:e=>{this.uiStateManager.setUseDirectKeyboard(e)},getDirectKeyboardManager:()=>({getShowQuickKeys:()=>this.directKeyboardManager.getShowQuickKeys(),setShowQuickKeys:e=>this.directKeyboardManager.setShowQuickKeys(e),ensureHiddenInputVisible:()=>this.directKeyboardManager.ensureHiddenInputVisible(),cleanup:()=>this.directKeyboardManager.cleanup(),getKeyboardMode:()=>this.directKeyboardManager.getKeyboardMode(),isRecentlyEnteredKeyboardMode:()=>this.directKeyboardManager.isRecentlyEnteredKeyboardMode()}),setShowQuickKeys:e=>{this.uiStateManager.setShowQuickKeys(e),this.updateTerminalTransform()},setShowFileBrowser:e=>{this.uiStateManager.setShowFileBrowser(e)},getInputManager:()=>this.inputManager,getShowWidthSelector:()=>this.uiStateManager.getState().showWidthSelector,setShowWidthSelector:e=>{this.uiStateManager.setShowWidthSelector(e)},setCustomWidth:e=>{this.uiStateManager.setCustomWidth(e)},querySelector:e=>this.querySelector(e),setTabIndex:e=>{this.tabIndex=e},addEventListener:(e,t)=>this.addEventListener(e,t),removeEventListener:(e,t)=>this.removeEventListener(e,t),focus:()=>this.focus(),getDisableFocusManagement:()=>this.disableFocusManagement,startLoading:()=>this.loadingAnimationManager.startLoading(()=>this.requestUpdate()),stopLoading:()=>this.loadingAnimationManager.stopLoading(),setKeyboardHeight:e=>{this.uiStateManager.setKeyboardHeight(e),this.updateTerminalTransform()},getTerminalLifecycleManager:()=>this.terminalLifecycleManager?{resetTerminalSize:()=>this.terminalLifecycleManager.resetTerminalSize(),cleanup:()=>this.terminalLifecycleManager.cleanup()}:null,getConnectionManager:()=>this.connectionManager?{setConnected:e=>this.connectionManager.setConnected(e),cleanupStreamConnection:()=>this.connectionManager.cleanupStreamConnection()}:null,setConnected:e=>{this.uiStateManager.setConnected(e)},getKeyboardCaptureActive:()=>this.uiStateManager.getState().keyboardCaptureActive}}connectedCallback(){super.connectedCallback(),this.uiStateManager.setCallbacks({requestUpdate:()=>this.requestUpdate()}),this.fileOperationsManager.setCallbacks({requestUpdate:()=>this.requestUpdate(),getSession:()=>this.session,getInputManager:()=>this.inputManager,querySelector:a=>this.querySelector(a),setIsDragOver:a=>this.uiStateManager.setIsDragOver(a),setShowFileBrowser:a=>this.uiStateManager.setShowFileBrowser(a),setShowImagePicker:a=>this.uiStateManager.setShowImagePicker(a),getIsMobile:()=>this.uiStateManager.getState().isMobile,getShowFileBrowser:()=>this.uiStateManager.getState().showFileBrowser,getShowImagePicker:()=>this.uiStateManager.getState().showImagePicker,getShowMobileInput:()=>this.uiStateManager.getState().showMobileInput,dispatchEvent:a=>this.dispatchEvent(a)}),this.terminalSettingsManager.setCallbacks({requestUpdate:()=>this.requestUpdate(),getSession:()=>this.session,getTerminalElement:()=>this.getTerminalElement(),setTerminalMaxCols:a=>this.uiStateManager.setTerminalMaxCols(a),setTerminalFontSize:a=>this.uiStateManager.setTerminalFontSize(a),setTerminalTheme:a=>this.uiStateManager.setTerminalTheme(a),setShowWidthSelector:a=>this.uiStateManager.setShowWidthSelector(a),setCustomWidth:a=>this.uiStateManager.setCustomWidth(a),getTerminalLifecycleManager:()=>this.terminalLifecycleManager}),this.sessionActionsHandler.setCallbacks({getSession:()=>this.session,setSession:a=>{this.session=a},requestUpdate:()=>this.requestUpdate(),dispatchEvent:a=>this.dispatchEvent(a),getViewMode:()=>this.uiStateManager.getState().viewMode,setViewMode:a=>this.uiStateManager.setViewMode(a),handleBack:()=>this.handleBack(),ensureTerminalInitialized:()=>this.ensureTerminalInitialized()}),this.uiStateManager.loadDirectKeyboardPreference(),this.checkServerStatus(),this.checkOrientation(),this.loadBinaryModePreference(),this.boundHandleOrientationChange=()=>this.handleOrientationChange(),window.addEventListener("orientationchange",this.boundHandleOrientationChange),window.addEventListener("resize",this.boundHandleOrientationChange),window.addEventListener("terminal-binary-mode-changed",this.handleBinaryModeChange),this.connectionManager=new Is(a=>{this.session&&a===this.session.id&&(this.session={...this.session,status:"exited"},this.requestUpdate(),new URLSearchParams(window.location.search).get("session")===a&&(ye.log(`Session ${a} exited, attempting to close window`),setTimeout(()=>{try{window.close(),setTimeout(()=>{ye.log("Window close failed - likely opened as a regular tab")},100)}catch(h){ye.warn("Failed to close window:",h)}},500)))},a=>{this.session=a,this.requestUpdate()}),this.connectionManager.setConnected(!0),this.uiStateManager.setConnected(!0),this.inputManager=new Ds,this.inputManager.setCallbacks({requestUpdate:()=>this.requestUpdate(),getKeyboardCaptureActive:()=>this.uiStateManager.getState().keyboardCaptureActive,getTerminalElement:()=>this.getTerminalElement()}),this.mobileInputManager=new Os(this),this.mobileInputManager.setInputManager(this.inputManager),this.directKeyboardManager=new As(this.instanceId),this.directKeyboardManager.setInputManager(this.inputManager),this.directKeyboardManager.setSessionViewElement(this);let e={getShowMobileInput:()=>this.uiStateManager.getState().showMobileInput,getShowCtrlAlpha:()=>this.uiStateManager.getState().showCtrlAlpha,getDisableFocusManagement:()=>this.disableFocusManagement,getVisualViewportHandler:()=>{if(this.lifecycleEventManager&&window.visualViewport){let a=window.visualViewport,m=window.innerHeight-a.height;return this.uiStateManager.setKeyboardHeight(m),ye.log(`Visual Viewport keyboard height (manual trigger): ${m}px`),()=>{if(window.visualViewport){let p=window.innerHeight-window.visualViewport.height;this.uiStateManager.setKeyboardHeight(p)}}}return null},getKeyboardHeight:()=>this.uiStateManager.getState().keyboardHeight,setKeyboardHeight:a=>{this.uiStateManager.setKeyboardHeight(a),this.updateTerminalTransform(),this.requestUpdate()},updateShowQuickKeys:a=>{this.uiStateManager.setShowQuickKeys(a),this.requestUpdate(),this.updateTerminalTransform()},toggleMobileInput:()=>{this.uiStateManager.toggleMobileInput(),this.requestUpdate()},clearMobileInputText:()=>{this.uiStateManager.setMobileInputText(""),this.requestUpdate()},toggleCtrlAlpha:()=>{this.uiStateManager.toggleCtrlAlpha(),this.requestUpdate()},clearCtrlSequence:()=>{this.uiStateManager.clearCtrlSequence(),this.requestUpdate()}};this.directKeyboardManager.setCallbacks(e),this.terminalLifecycleManager=new Ns,this.terminalLifecycleManager.setConnectionManager(this.connectionManager),this.terminalLifecycleManager.setInputManager(this.inputManager),this.terminalLifecycleManager.setConnected(this.uiStateManager.getState().connected),this.terminalLifecycleManager.setDomElement(this);let t={handleSessionExit:this.handleSessionExit.bind(this),handleTerminalResize:this.terminalLifecycleManager.handleTerminalResize.bind(this.terminalLifecycleManager),handleTerminalPaste:this.terminalLifecycleManager.handleTerminalPaste.bind(this.terminalLifecycleManager)};this.terminalLifecycleManager.setEventHandlers(t);let s={updateTerminalDimensions:(a,m)=>{this.uiStateManager.setTerminalDimensions(a,m),this.requestUpdate()}};this.terminalLifecycleManager.setStateCallbacks(s),this.session&&(this.inputManager.setSession(this.session),this.terminalLifecycleManager.setSession(this.session));let n=this.terminalSettingsManager.getMaxCols(),o=this.terminalSettingsManager.getFontSize(),r=this.terminalSettingsManager.getTheme();this.uiStateManager.setTerminalMaxCols(n),this.uiStateManager.setTerminalFontSize(o),this.uiStateManager.setTerminalTheme(r),ye.debug("Loaded terminal theme:",r),this.terminalLifecycleManager.setTerminalFontSize(o),this.terminalLifecycleManager.setTerminalMaxCols(n),this.terminalLifecycleManager.setTerminalTheme(r),this.lifecycleEventManager=new Hs,this.lifecycleEventManager.setSessionViewElement(this),this.lifecycleEventManager.setCallbacks(this.createLifecycleEventManagerCallbacks()),this.lifecycleEventManager.setSession(this.session);try{let a=localStorage.getItem("vibetunnel_app_preferences");if(a){let m=JSON.parse(a);this.uiStateManager.setUseDirectKeyboard(m.useDirectKeyboard??!0)}else this.uiStateManager.setUseDirectKeyboard(!0)}catch(a){ye.error("Failed to load app preferences",a),this.uiStateManager.setUseDirectKeyboard(!0)}this.lifecycleEventManager.setupLifecycle(),this.fileOperationsManager.setupEventListeners(this)}disconnectedCallback(){super.disconnectedCallback(),this.boundHandleOrientationChange&&(window.removeEventListener("orientationchange",this.boundHandleOrientationChange),window.removeEventListener("resize",this.boundHandleOrientationChange)),window.removeEventListener("terminal-binary-mode-changed",this.handleBinaryModeChange),this.fileOperationsManager.removeEventListeners(this),this.fileOperationsManager.resetDragState(),this._updateTerminalTransformTimeout&&(clearTimeout(this._updateTerminalTransformTimeout),this._updateTerminalTransformTimeout=null),this.lifecycleEventManager&&(this.lifecycleEventManager.teardownLifecycle(),this.lifecycleEventManager.cleanup()),this.loadingAnimationManager.cleanup()}checkOrientation(){let e=window.matchMedia("(orientation: landscape)").matches;this.uiStateManager.setIsLandscape(e)}handleOrientationChange(){this.checkOrientation(),this.requestUpdate()}loadBinaryModePreference(){try{let e=localStorage.getItem(Ht);if(e){let t=JSON.parse(e);this.uiStateManager.setUseBinaryMode(t.useBinaryMode??!1)}}catch(e){ye.warn("Failed to load binary mode preference",e)}}getTerminalElement(){let e=this.querySelector("terminal-renderer");return e?this.uiStateManager.getState().useBinaryMode?e.querySelector("vibe-terminal-binary"):e.querySelector("vibe-terminal"):this.uiStateManager.getState().useBinaryMode?this.querySelector("vibe-terminal-binary"):this.querySelector("vibe-terminal")}firstUpdated(e){super.firstUpdated(e);let t=this.terminalSettingsManager.getTerminalTheme();ye.debug("Loaded terminal theme from preferences:",t)}updated(e){if(super.updated(e),e.has("session")){let t=e.get("session");t?.id!==this.session?.id&&t&&(ye.log("Session changed, cleaning up old stream connection"),this.connectionManager&&this.connectionManager.cleanupStreamConnection(),this.terminalLifecycleManager&&this.terminalLifecycleManager.cleanup()),this.inputManager&&this.inputManager.setSession(this.session),this.terminalLifecycleManager&&this.terminalLifecycleManager.setSession(this.session),this.lifecycleEventManager&&this.lifecycleEventManager.setSession(this.session),this.session&&this.uiStateManager.getState().connected&&!t&&(ye.log("Session data now available, initializing terminal"),this.ensureTerminalInitialized())}e.has("session")&&this.session&&this.loadingAnimationManager.isLoading()&&(this.loadingAnimationManager.stopLoading(),this.ensureTerminalInitialized()),e.has("connected")&&this.uiStateManager.getState().connected&&this.session&&this.ensureTerminalInitialized(),e.has("keyboardCaptureActive")&&(this.uiStateManager.setKeyboardCaptureActive(this.keyboardCaptureActive),ye.log(`Keyboard capture state updated to: ${this.keyboardCaptureActive}`))}ensureTerminalInitialized(){if(!this.session||!this.uiStateManager.getState().connected){ye.log("Cannot initialize terminal: missing session or not connected");return}if(this.terminalLifecycleManager.getTerminal()){ye.log("Terminal already initialized");return}if(!this.getTerminalElement()){ye.log("Terminal element not found in DOM, deferring initialization"),setTimeout(()=>{requestAnimationFrame(()=>{this.ensureTerminalInitialized()})},100);return}ye.log("Initializing terminal with session:",this.session.id),this.terminalLifecycleManager.setupTerminal(),this.terminalLifecycleManager.initializeTerminal()}async handleKeyboardInput(e){this.inputManager&&(await this.inputManager.handleKeyboardInput(e),this.session&&this.session.status)}handleBack(){this.dispatchEvent(new CustomEvent("navigate-to-list",{bubbles:!0,composed:!0}))}handleSidebarToggle(){this.dispatchEvent(new CustomEvent("toggle-sidebar",{bubbles:!0,composed:!0}))}handleCreateSession(){this.dispatchEvent(new CustomEvent("create-session",{bubbles:!0,composed:!0}))}async checkServerStatus(){try{let e=await fetch("/api/server/status",{headers:N.getAuthHeader()});if(e.ok){let t=await e.json();this.uiStateManager.setMacAppConnected(t.macAppConnected||!1),ye.debug("server status:",t)}}catch(e){ye.warn("failed to check server status:",e),this.uiStateManager.setMacAppConnected(!1)}}handleOpenSettings(){this.dispatchEvent(new CustomEvent("open-settings",{bubbles:!0,composed:!0}))}handleSessionExit(e){let t=e;this.sessionActionsHandler.handleSessionExit(t.detail.sessionId,t.detail.exitCode),this.session&&t.detail.sessionId===this.session.id&&this.connectionManager&&this.connectionManager.cleanupStreamConnection()}handleMobileInputToggle(){this.mobileInputManager.handleMobileInputToggle()}shouldUseDirectKeyboard(){return this.uiStateManager.getState().useDirectKeyboard}toggleMobileInputDisplay(){this.uiStateManager.toggleMobileInput(),this.uiStateManager.getState().showMobileInput||this.refreshTerminalAfterMobileInput()}async handleSpecialKey(e){this.inputManager&&await this.inputManager.sendInputText(e)}async handleCtrlKey(e){this.uiStateManager.addCtrlSequence(e)}async handleSendCtrlSequence(){let e=this.uiStateManager.getState().ctrlSequence;if(this.inputManager)for(let t of e){let s=String.fromCharCode(t.charCodeAt(0)-64);await this.inputManager.sendInputText(s)}this.uiStateManager.clearCtrlSequence(),this.uiStateManager.setShowCtrlAlpha(!1),this.directKeyboardManager.shouldRefocusHiddenInput()&&setTimeout(()=>{this.directKeyboardManager.refocusHiddenInput(),this.directKeyboardManager.startFocusRetentionPublic()},50)}handleClearCtrlSequence(){this.uiStateManager.clearCtrlSequence()}handleCtrlAlphaCancel(){this.uiStateManager.setShowCtrlAlpha(!1),this.uiStateManager.clearCtrlSequence(),this.directKeyboardManager.shouldRefocusHiddenInput()&&setTimeout(()=>{this.directKeyboardManager.refocusHiddenInput(),this.directKeyboardManager.startFocusRetentionPublic()},50)}toggleDirectKeyboard(){this.uiStateManager.toggleDirectKeyboard();let e=this.uiStateManager.getState();e.isMobile&&e.useDirectKeyboard&&this.directKeyboardManager.ensureHiddenInputVisible()}handleKeyboardButtonClick(){this.uiStateManager.setShowQuickKeys(!0),this.updateTerminalTransform(),this.directKeyboardManager.focusHiddenInput(),this.requestUpdate()}handleTerminalClick(e){let t=this.uiStateManager.getState();if(t.isMobile&&t.useDirectKeyboard){e.stopPropagation(),e.preventDefault();return}}async handleTerminalInput(e){let{text:t}=e.detail;this.inputManager&&t&&await this.inputManager.sendInputText(t)}handleTerminalResize(e){ye.log("Terminal resized:",e.detail),this.terminalLifecycleManager.handleTerminalResize(e)}handleTerminalReady(){ye.log("Terminal ready event received"),this.ensureTerminalInitialized()}updateTerminalTransform(){this._updateTerminalTransformTimeout&&clearTimeout(this._updateTerminalTransformTimeout);let e=this.uiStateManager.getState();this._updateTerminalTransformTimeout=setTimeout(()=>{ye.log(`Terminal transform updated: quickKeys=${e.showQuickKeys}, keyboardHeight=${e.keyboardHeight}px`),this.requestUpdate(),requestAnimationFrame(()=>{let t=this.getTerminalElement();if(t){let s=t;typeof s.fitTerminal=="function"&&s.fitTerminal(),(e.keyboardHeight>0||e.showQuickKeys)&&setTimeout(()=>{"scrollToBottom"in t&&t.scrollToBottom();let n=this.querySelector(".terminal-area");n&&(n.scrollTop=n.scrollHeight)},50)}})},100)}focusHiddenInput(){this.directKeyboardManager.focusHiddenInput()}getMobileInputText(){return this.uiStateManager.getState().mobileInputText}clearMobileInputText(){this.uiStateManager.setMobileInputText("")}closeMobileInput(){this.uiStateManager.setShowMobileInput(!1)}shouldRefocusHiddenInput(){return this.directKeyboardManager.shouldRefocusHiddenInput()}refocusHiddenInput(){this.directKeyboardManager.refocusHiddenInput()}startFocusRetention(){this.directKeyboardManager.startFocusRetentionPublic()}delayedRefocusHiddenInput(){this.directKeyboardManager.delayedRefocusHiddenInputPublic()}refreshTerminalAfterMobileInput(){this.terminalLifecycleManager.getTerminal()&&setTimeout(()=>{let t=this.terminalLifecycleManager.getTerminal();if(t){let s=t;typeof s.fitTerminal=="function"&&s.fitTerminal(),t.scrollToBottom()}},300)}render(){if(!this.session)return u`
        <div class="fixed inset-0 bg-bg flex items-center justify-center">
          <div class="text-primary font-mono text-center">
            <div class="text-2xl mb-2">${this.loadingAnimationManager.getLoadingText()}</div>
            <div class="text-sm text-text-muted">Waiting for session...</div>
          </div>
        </div>
      `;let e=this.uiStateManager.getState();return u`
      <style>
        session-view *,
        session-view *:focus,
        session-view *:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        session-view:focus {
          outline: 2px solid rgb(var(--color-primary)) !important;
          outline-offset: -2px;
        }
        
        /* Grid layout for stable touch handling */
        .session-view-grid {
          display: grid;
          grid-template-areas:
            "header"
            "terminal"
            "quickkeys";
          grid-template-rows: auto 1fr auto;
          grid-template-columns: 1fr;
          height: 100vh;
          height: 100dvh;
          width: 100%;
          max-width: 100vw;
          position: relative;
          background-color: rgb(var(--color-bg));
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
          overflow: hidden;
          box-sizing: border-box;
        }
        
        /* Adjust grid when keyboard is visible */
        .session-view-grid[data-keyboard-visible="true"] {
          height: calc(100vh - var(--keyboard-height, 0px) - var(--quickkeys-height, 0px));
          height: calc(100dvh - var(--keyboard-height, 0px) - var(--quickkeys-height, 0px));
          transition: height 0.2s ease-out;
        }
        
        .session-header-area {
          grid-area: header;
        }
        
        .terminal-area {
          grid-area: terminal;
          position: relative;
          overflow: hidden;
          min-height: 0; /* Critical for grid */
          contain: layout style paint; /* Isolate terminal updates */
        }
        
        /* Make terminal content 50px larger to prevent clipping */
        .terminal-area vibe-terminal,
        .terminal-area vibe-terminal-binary {
          height: calc(100% + 50px) !important;
          margin-bottom: -50px !important;
        }
        
        /* Transform terminal up when quick keys are visible */
        .terminal-area[data-quickkeys-visible="true"] {
          transform: translateY(-110px);
          transition: transform 0.2s ease-out;
        }
        
        /* Add padding to terminal content when keyboard is visible */
        .terminal-area[data-quickkeys-visible="true"] vibe-terminal,
        .terminal-area[data-quickkeys-visible="true"] vibe-terminal-binary {
          padding-bottom: 70px !important;
          box-sizing: border-box;
        }
        
        .quickkeys-area {
          grid-area: quickkeys;
        }
        
        /* Overlay container - spans entire grid */
        .overlay-container {
          grid-area: 1 / 1 / -1 / -1;
          pointer-events: none;
          z-index: 20;
          position: relative;
        }
        
        .overlay-container > * {
          pointer-events: auto;
          touch-action: manipulation; /* Eliminates 300ms delay */
          -webkit-tap-highlight-color: transparent;
        }
        
        /* Apply touch optimizations to all interactive elements */
        button, [role="button"], .clickable {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
      </style>
      <!-- Background wrapper to extend header color to status bar -->
      <div class="bg-bg-secondary" style="padding-top: env(safe-area-inset-top);">
        <div
          class="session-view-grid"
          style="outline: none !important; box-shadow: none !important; --keyboard-height: ${e.keyboardHeight}px; --quickkeys-height: 0px;"
          data-keyboard-visible="${e.keyboardHeight>0||e.showQuickKeys?"true":"false"}"
        >
        <!-- Session Header Area -->
        <div class="session-header-area">
          <session-header
            .session=${this.session}
            .showBackButton=${this.showBackButton}
            .showSidebarToggle=${this.showSidebarToggle}
            .sidebarCollapsed=${this.sidebarCollapsed}
            .terminalMaxCols=${e.terminalMaxCols}
            .terminalFontSize=${e.terminalFontSize}
            .customWidth=${e.customWidth}
            .showWidthSelector=${e.showWidthSelector}
            .keyboardCaptureActive=${e.keyboardCaptureActive}
            .isMobile=${e.isMobile}
            .widthLabel=${this.terminalSettingsManager.getCurrentWidthLabel()}
            .widthTooltip=${this.terminalSettingsManager.getWidthTooltip()}
            .onBack=${()=>this.handleBack()}
            .onSidebarToggle=${()=>this.handleSidebarToggle()}
            .onCreateSession=${()=>this.handleCreateSession()}
            .onOpenFileBrowser=${()=>this.fileOperationsManager.openFileBrowser()}
            .onOpenImagePicker=${()=>this.fileOperationsManager.openFilePicker()}
            .onMaxWidthToggle=${()=>this.terminalSettingsManager.handleMaxWidthToggle()}
            .onWidthSelect=${t=>this.terminalSettingsManager.handleWidthSelect(t)}
            .onFontSizeChange=${t=>this.terminalSettingsManager.handleFontSizeChange(t)}
            .onOpenSettings=${()=>this.handleOpenSettings()}
            .macAppConnected=${e.macAppConnected}
            .onTerminateSession=${()=>this.sessionActionsHandler.handleTerminateSession()}
            .onClearSession=${()=>this.sessionActionsHandler.handleClearSession()}
            .onToggleViewMode=${()=>this.sessionActionsHandler.handleToggleViewMode()}
            @close-width-selector=${()=>{this.uiStateManager.setShowWidthSelector(!1),this.uiStateManager.setCustomWidth("")}}
            @session-rename=${async t=>{let{sessionId:s,newName:n}=t.detail;await this.sessionActionsHandler.handleRename(s,n)}}
            @paste-image=${async()=>await this.fileOperationsManager.pasteImage()}
            @select-image=${()=>this.fileOperationsManager.selectImage()}
            @open-camera=${()=>this.fileOperationsManager.openCamera()}
            @show-image-upload-options=${()=>this.fileOperationsManager.selectImage()}
            @toggle-view-mode=${()=>this.sessionActionsHandler.handleToggleViewMode()}
            @capture-toggled=${t=>{this.dispatchEvent(new CustomEvent("capture-toggled",{detail:t.detail,bubbles:!0,composed:!0}))}}
            .hasGitRepo=${!!this.session?.gitRepoPath}
            .viewMode=${e.viewMode}
          >
          </session-header>
        </div>

        <!-- Content Area (Terminal or Worktree) -->
        <div
          class="terminal-area bg-bg ${this.session?.status==="exited"&&e.viewMode==="terminal"?"session-exited opacity-90":""} ${e.isMobile&&e.isLandscape?"safe-area-left safe-area-right":""}"
          data-quickkeys-visible="${e.showQuickKeys}"
        >
          ${this.loadingAnimationManager.isLoading()?u`
                <!-- Enhanced Loading overlay -->
                <div
                  class="absolute inset-0 bg-bg/90 backdrop-filter backdrop-blur-sm flex items-center justify-center z-10 animate-fade-in"
                >
                  <div class="text-primary font-mono text-center">
                    <div class="text-2xl mb-3 text-primary animate-pulse-primary">${this.loadingAnimationManager.getLoadingText()}</div>
                    <div class="text-sm text-text-muted">Connecting to session...</div>
                  </div>
                </div>
              `:""}
          ${e.viewMode==="worktree"&&this.session?.gitRepoPath?u`
              <worktree-manager
                .gitService=${this.gitService}
                .repoPath=${this.session.gitRepoPath}
                @back=${()=>{this.uiStateManager.setViewMode("terminal")}}
              ></worktree-manager>
            `:e.viewMode==="terminal"?u`
              <!-- Enhanced Terminal Component -->
              <terminal-renderer
                id="session-terminal"
                .session=${this.session}
                .useBinaryMode=${e.useBinaryMode}
                .terminalFontSize=${e.terminalFontSize}
                .terminalMaxCols=${e.terminalMaxCols}
                .terminalTheme=${e.terminalTheme}
                .disableClick=${e.isMobile&&e.useDirectKeyboard}
                .hideScrollButton=${e.showQuickKeys}
                .onTerminalClick=${this.boundHandleTerminalClick}
                .onTerminalInput=${this.boundHandleTerminalInput}
                .onTerminalResize=${this.boundHandleTerminalResize}
                .onTerminalReady=${this.boundHandleTerminalReady}
              ></terminal-renderer>
            `:""}
        </div>

        <!-- Quick Keys Area -->
        <div class="quickkeys-area">
          <!-- Mobile Input Controls (only show when direct keyboard is disabled) -->
          ${e.isMobile&&!e.showMobileInput&&!e.useDirectKeyboard?u`
                <div class="p-4 bg-bg-secondary">
                <!-- First row: Arrow keys -->
                <div class="flex gap-2 mb-2">
                  <button
                    class="flex-1 font-mono px-3 py-2 text-sm transition-all cursor-pointer quick-start-btn"
                    @click=${()=>this.handleSpecialKey("arrow_up")}
                  >
                    <span class="text-xl">↑</span>
                  </button>
                  <button
                    class="flex-1 font-mono px-3 py-2 text-sm transition-all cursor-pointer quick-start-btn"
                    @click=${()=>this.handleSpecialKey("arrow_down")}
                  >
                    <span class="text-xl">↓</span>
                  </button>
                  <button
                    class="flex-1 font-mono px-3 py-2 text-sm transition-all cursor-pointer quick-start-btn"
                    @click=${()=>this.handleSpecialKey("arrow_left")}
                  >
                    <span class="text-xl">←</span>
                  </button>
                  <button
                    class="flex-1 font-mono px-3 py-2 text-sm transition-all cursor-pointer quick-start-btn"
                    @click=${()=>this.handleSpecialKey("arrow_right")}
                  >
                    <span class="text-xl">→</span>
                  </button>
                </div>

                <!-- Second row: Special keys -->
                <div class="flex gap-2">
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${()=>this.handleSpecialKey("escape")}
                  >
                    ESC
                  </button>
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${()=>this.handleSpecialKey("	")}
                  >
                    <span class="text-xl">⇥</span>
                  </button>
                  <button
                    class="flex-1 font-mono px-3 py-2 text-sm transition-all cursor-pointer quick-start-btn"
                    @click=${this.handleMobileInputToggle}
                  >
                    ABC123
                  </button>
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${()=>this.fileOperationsManager.openFilePicker()}
                    title="Upload file"
                  >
                    📷
                  </button>
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${this.toggleDirectKeyboard}
                    title="Switch to direct keyboard mode"
                  >
                    ⌨️
                  </button>
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${()=>this.uiStateManager.toggleCtrlAlpha()}
                  >
                    CTRL
                  </button>
                  <button
                    class="font-mono text-sm transition-all cursor-pointer w-16 quick-start-btn"
                    @click=${()=>this.handleSpecialKey("enter")}
                  >
                    <span class="text-xl">⏎</span>
                  </button>
                  </div>
                </div>
              `:""}
        </div>

        <!-- Overlay Container - All overlays go here for stable positioning -->
        <div class="overlay-container">
          <overlays-container
            .session=${this.session}
            .uiState=${e}
            .callbacks=${{onMobileInputSendOnly:t=>this.mobileInputManager.handleMobileInputSendOnly(t),onMobileInputSend:t=>this.mobileInputManager.handleMobileInputSend(t),onMobileInputCancel:()=>this.mobileInputManager.handleMobileInputCancel(),onMobileInputTextChange:t=>this.uiStateManager.setMobileInputText(t),onCtrlKey:t=>this.handleCtrlKey(t),onSendCtrlSequence:()=>this.handleSendCtrlSequence(),onClearCtrlSequence:()=>this.handleClearCtrlSequence(),onCtrlAlphaCancel:()=>this.handleCtrlAlphaCancel(),onQuickKeyPress:t=>this.directKeyboardManager.handleQuickKeyPress(t),onCloseFileBrowser:()=>this.fileOperationsManager.closeFileBrowser(),onInsertPath:async t=>{let{path:s,type:n}=t.detail;await this.fileOperationsManager.insertPath(s,n)},onFileSelected:async t=>{await this.fileOperationsManager.handleFileSelected(t.detail.path)},onFileError:t=>{this.fileOperationsManager.handleFileError(t.detail)},onCloseFilePicker:()=>this.fileOperationsManager.closeFilePicker(),onWidthSelect:t=>this.terminalSettingsManager.handleWidthSelect(t),onFontSizeChange:t=>this.terminalSettingsManager.handleFontSizeChange(t),onThemeChange:t=>this.terminalSettingsManager.handleThemeChange(t),onCloseWidthSelector:()=>{this.uiStateManager.setShowWidthSelector(!1),this.uiStateManager.setCustomWidth("")},onKeyboardButtonClick:()=>this.handleKeyboardButtonClick(),handleBack:()=>this.handleBack()}}
          ></overlays-container>
        </div>
      </div>
      </div>
    `}};d([C({type:Object})],ut.prototype,"session",2),d([C({type:Boolean})],ut.prototype,"showBackButton",2),d([C({type:Boolean})],ut.prototype,"showSidebarToggle",2),d([C({type:Boolean})],ut.prototype,"sidebarCollapsed",2),d([C({type:Boolean})],ut.prototype,"disableFocusManagement",2),d([C({type:Boolean})],ut.prototype,"keyboardCaptureActive",2),ut=d([D("session-view")],ut);we();Me();var et=class extends R{constructor(){super(...arguments);this.logs=[];this.loading=!0;this.filter="";this.levelFilter=new Set(["error","warn","log","debug"]);this.autoScroll=!0;this.logSize="";this.showClient=!0;this.showServer=!0;this.isFirstLoad=!0}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.loadLogs(),this.refreshInterval=window.setInterval(()=>this.loadLogs(),2e3)}disconnectedCallback(){super.disconnectedCallback(),this.refreshInterval&&clearInterval(this.refreshInterval)}async loadLogs(){try{let e=await fetch("/api/logs/info",{headers:{...N.getAuthHeader()}});if(e.ok){let n=await e.json();this.logSize=n.sizeHuman||""}let t=await fetch("/api/logs/raw",{headers:{...N.getAuthHeader()}});if(!t.ok)throw new Error("Failed to load logs");let s=await t.text();this.parseLogs(s),this.loading=!1,this.autoScroll&&requestAnimationFrame(()=>{let n=this.querySelector(".log-container");n&&(this.isFirstLoad?(n.scrollTop=n.scrollHeight,this.isFirstLoad=!1):n.scrollHeight-n.scrollTop-n.clientHeight<100&&(n.scrollTop=n.scrollHeight))})}catch(e){console.error("Failed to load logs:",e),this.loading=!1}}formatRelativeTime(e){let t=new Date(e),n=new Date().getTime()-t.getTime(),o=Math.floor(n/1e3),r=Math.floor(o/60),a=Math.floor(r/60);return o<60?`${o}s ago`:r<60?`${r}m ago`:a<24?`${a}h ago`:t.toLocaleTimeString("en-US",{hour12:!1})}parseLogs(e){let t=e.split(`
`),s=[],n=null;for(let o of t){if(!o.trim())continue;let r=o.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+(.*)$/);if(r){n&&s.push(n);let[,a,m,p,h]=r,v=p.startsWith("CLIENT:");n={timestamp:a,level:m.trim().toLowerCase(),module:v?p.substring(7):p,message:h,isClient:v}}else n?n.message+=`
${o}`:s.push({timestamp:"",level:"log",module:"unknown",message:o,isClient:!1})}n&&s.push(n),this.logs=s}toggleLevel(e){this.levelFilter.has(e)?this.levelFilter.delete(e):this.levelFilter.add(e),this.levelFilter=new Set(this.levelFilter)}async clearLogs(){if(confirm("Are you sure you want to clear all logs?"))try{if(!(await fetch("/api/logs/clear",{method:"DELETE",headers:{...N.getAuthHeader()}})).ok)throw new Error("Failed to clear logs");this.logs=[],this.logSize="0 Bytes"}catch(e){console.error("Failed to clear logs:",e)}}async downloadLogs(){try{let e=await fetch("/api/logs/raw",{headers:{...N.getAuthHeader()}});if(!e.ok)throw new Error("Failed to download logs");let t=await e.blob(),s=URL.createObjectURL(t),n=document.createElement("a");n.href=s,n.download=`vibetunnel-logs-${new Date().toISOString().split("T")[0]}.txt`,n.click(),URL.revokeObjectURL(s)}catch(e){console.error("Failed to download logs:",e)}}get filteredLogs(){return this.logs.filter(e=>{if(!this.levelFilter.has(e.level)||!this.showClient&&e.isClient||!this.showServer&&!e.isClient)return!1;if(this.filter){let t=this.filter.toLowerCase();return e.module.toLowerCase().includes(t)||e.message.toLowerCase().includes(t)}return!0})}render(){let e=u`
      <style>
        .log-container {
          /* Hide scrollbar by default */
          scrollbar-width: none; /* Firefox */
        }

        .log-container::-webkit-scrollbar {
          width: 8px;
          background: transparent;
        }

        .log-container::-webkit-scrollbar-track {
          background: transparent;
        }

        .log-container::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 4px;
        }

        /* Show scrollbar on hover */
        .log-container:hover::-webkit-scrollbar-thumb {
          background: rgb(var(--color-text-bright) / 0.2);
        }

        .log-container::-webkit-scrollbar-thumb:hover {
          background: rgb(var(--color-text-bright) / 0.3);
        }

        /* Firefox */
        .log-container:hover {
          scrollbar-width: thin;
          scrollbar-color: rgb(var(--color-text-bright) / 0.2) transparent;
        }
      </style>
    `;if(this.loading)return u`
        <div class="flex items-center justify-center h-screen bg-bg text-primary">
          <div class="text-center">
            <div
              class="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mb-4 mx-auto"
            ></div>
            <div>Loading logs...</div>
          </div>
        </div>
      `;let t=["error","warn","log","debug"];return u`
      ${e}
      <div class="flex flex-col h-full bg-bg text-primary font-mono">
        <!-- Header - single row on desktop, two rows on mobile -->
        <div class="bg-bg-secondary border-b border-border/50 p-3 sm:p-4">
          <!-- Mobile layout (two rows) -->
          <div class="sm:hidden">
            <!-- Top row with back button and title -->
            <div class="flex items-center gap-2 mb-3">
              <!-- Back button -->
              <button
                class="p-2 bg-bg border border-border/50 rounded text-sm text-primary hover:border-primary hover:text-primary transition-colors flex items-center gap-1 flex-shrink-0"
                @click=${()=>{window.location.href="/"}}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <h1
                class="text-base font-bold text-primary flex items-center gap-2 flex-shrink-0"
              >
                <terminal-icon size="20"></terminal-icon>
                <span>System Logs</span>
              </h1>

              <!-- Auto-scroll toggle (mobile position) -->
              <div class="ml-auto">
                <button
                  class="p-2 text-xs uppercase font-bold rounded transition-colors ${this.autoScroll?"bg-primary text-bg":"bg-bg-tertiary text-text-muted border border-border/50"}"
                  @click=${()=>{this.autoScroll=!this.autoScroll}}
                  title="Auto Scroll"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 5v14M19 12l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Filters row -->
            <div class="flex flex-wrap gap-2">
              <!-- Search input -->
              <input
                type="text"
                class="px-3 py-1.5 bg-bg border border-border/50 rounded text-sm text-primary placeholder-text-muted focus:outline-none focus:border-primary transition-colors w-full"
                placeholder="Filter logs..."
                .value=${this.filter}
                @input=${s=>{this.filter=s.target.value}}
              />

              <!-- Filters container -->
              <div class="flex gap-2 items-center">
                <!-- Level filters -->
                <div class="flex gap-1">
                  ${t.map(s=>u`
                      <button
                        class="px-1.5 py-1 text-xs uppercase font-bold rounded transition-colors ${this.levelFilter.has(s)?s==="error"?"bg-status-error/20 text-status-error border border-status-error":s==="warn"?"bg-status-warning/20 text-status-warning border border-status-warning":s==="debug"?"bg-bg-tertiary text-text-muted border border-border":"bg-primary/20 text-primary border border-primary":"bg-bg-tertiary text-text-muted border border-border"}"
                        @click=${()=>this.toggleLevel(s)}
                        title="${s} logs"
                      >
                        ${s==="error"?"ERR":s==="warn"?"WRN":s==="debug"?"DBG":"LOG"}
                      </button>
                    `)}
                </div>

                <!-- Client/Server toggles -->
                <div class="flex gap-1">
                  <button
                    class="px-1.5 py-1 text-xs uppercase font-bold rounded transition-colors ${this.showClient?"bg-status-warning/20 text-status-warning border border-status-warning":"bg-bg-tertiary text-text-muted border border-border"}"
                    @click=${()=>{this.showClient=!this.showClient}}
                    title="Client logs"
                  >
                    C
                  </button>
                  <button
                    class="px-1.5 py-1 text-xs uppercase font-bold rounded transition-colors ${this.showServer?"bg-primary/20 text-primary border border-primary":"bg-bg-tertiary text-text-muted border border-border"}"
                    @click=${()=>{this.showServer=!this.showServer}}
                    title="Server logs"
                  >
                    S
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Desktop layout (single row) -->
          <div class="hidden sm:flex items-center gap-3">
            <!-- Back button -->
            <button
              class="px-3 py-1.5 bg-bg border border-border rounded text-sm text-primary hover:border-primary hover:text-primary transition-colors flex items-center gap-2 flex-shrink-0"
              @click=${()=>{window.location.href="/"}}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>

            <h1 class="text-lg font-bold text-primary flex items-center gap-2 flex-shrink-0">
              <terminal-icon size="24"></terminal-icon>
              <span>System Logs</span>
            </h1>

            <div class="flex-1 flex flex-wrap gap-2 items-center justify-end">
              <!-- Search input -->
              <input
                type="text"
                class="px-3 py-1.5 bg-bg border border-border rounded text-sm text-primary placeholder-text-muted focus:outline-none focus:border-primary transition-colors flex-1 sm:flex-initial sm:w-64 md:w-80"
                placeholder="Filter logs..."
                .value=${this.filter}
                @input=${s=>{this.filter=s.target.value}}
              />

              <!-- Level filters -->
              <div class="flex gap-1">
                ${t.map(s=>u`
                    <button
                      class="px-2 py-1 text-xs uppercase font-bold rounded transition-colors ${this.levelFilter.has(s)?s==="error"?"bg-status-error/20 text-status-error border border-status-error":s==="warn"?"bg-status-warning/20 text-status-warning border border-status-warning":s==="debug"?"bg-bg-tertiary text-text-muted border border-border":"bg-primary/20 text-primary border border-primary":"bg-bg-tertiary text-text-muted border border-border"}"
                      @click=${()=>this.toggleLevel(s)}
                    >
                      ${s}
                    </button>
                  `)}
              </div>

              <!-- Client/Server toggles -->
              <div class="flex gap-1">
                <button
                  class="px-2 py-1 text-xs uppercase font-bold rounded transition-colors ${this.showClient?"bg-status-warning/20 text-status-warning border border-status-warning":"bg-bg-tertiary text-text-muted border border-border"}"
                  @click=${()=>{this.showClient=!this.showClient}}
                >
                  CLIENT
                </button>
                <button
                  class="px-2 py-1 text-xs uppercase font-bold rounded transition-colors ${this.showServer?"bg-primary/20 text-primary border border-primary":"bg-bg-tertiary text-text-muted border border-border"}"
                  @click=${()=>{this.showServer=!this.showServer}}
                >
                  SERVER
                </button>
              </div>

              <!-- Auto-scroll toggle -->
              <button
                class="px-3 py-1 text-xs uppercase font-bold rounded transition-colors ${this.autoScroll?"bg-primary/20 text-primary border border-primary":"bg-bg-tertiary text-text-muted border border-border"}"
                @click=${()=>{this.autoScroll=!this.autoScroll}}
              >
                AUTO SCROLL
              </button>
            </div>
          </div>
        </div>

        <!-- Log container -->
        <div
          class="log-container flex-1 overflow-y-auto p-4 bg-bg font-mono text-xs leading-relaxed"
        >
          ${this.filteredLogs.length===0?u`
                <div class="flex items-center justify-center h-full text-text-muted">
                  <div class="text-center">
                    <div>No logs to display</div>
                  </div>
                </div>
              `:this.filteredLogs.map(s=>{let n=s.message.includes(`
`),o=s.message.split(`
`);return u`
                  <div
                    class="group hover:bg-bg-secondary/50 transition-colors rounded ${s.isClient?"bg-status-warning/5 pl-2":"pl-2"}"
                  >
                    <!-- Desktop layout (hidden on mobile) -->
                    <div class="hidden sm:flex items-start gap-2 py-0.5">
                      <!-- Timestamp -->
                      <span class="text-text-muted w-16 flex-shrink-0 opacity-50"
                        >${this.formatRelativeTime(s.timestamp)}</span
                      >

                      <!-- Level -->
                      <span
                        class="w-10 text-center font-mono uppercase tracking-wider flex-shrink-0 ${s.level==="error"?"text-status-error bg-status-error/20 px-1 rounded font-bold":s.level==="warn"?"text-status-warning bg-status-warning/20 px-1 rounded font-bold":s.level==="debug"?"text-text-muted":"text-primary"}"
                        >${s.level==="error"?"ERR":s.level==="warn"?"WRN":s.level==="debug"?"DBG":"LOG"}</span
                      >

                      <!-- Source indicator -->
                      <span
                        class="flex-shrink-0 ${s.isClient?"text-status-warning font-bold":"text-primary"}"
                        >${s.isClient?"\u25C6 C":"\u25B8 S"}</span
                      >

                      <!-- Module -->
                      <span class="text-text-muted flex-shrink-0 font-mono">${s.module}</span>

                      <!-- Separator -->
                      <span class="text-text-muted flex-shrink-0">│</span>

                      <!-- Message -->
                      <span
                        class="flex-1 ${s.level==="error"?"text-status-error":s.level==="warn"?"text-status-warning":s.level==="debug"?"text-text-muted":s.isClient?"text-status-warning opacity-80":"text-primary"}"
                        >${o[0]}</span
                      >
                    </div>

                    <!-- Mobile layout (visible only on mobile) -->
                    <div class="sm:hidden py-1">
                      <div class="flex items-center gap-2 text-xs">
                        <span class="text-text-muted opacity-50"
                          >${this.formatRelativeTime(s.timestamp)}</span
                        >
                        <span
                          class="${s.level==="error"?"text-status-error font-bold":s.level==="warn"?"text-status-warning font-bold":s.level==="debug"?"text-text-muted":"text-primary"} uppercase"
                          >${s.level}</span
                        >
                        <span class="${s.isClient?"text-status-warning":"text-primary"}"
                          >${s.isClient?"[C]":"[S]"}</span
                        >
                        <span class="text-text-muted">${s.module}</span>
                      </div>
                      <div
                        class="mt-1 ${s.level==="error"?"text-status-error":s.level==="warn"?"text-status-warning":s.level==="debug"?"text-text-muted":s.isClient?"text-status-warning opacity-80":"text-primary"}"
                      >
                        ${o[0]}
                      </div>
                    </div>
                    ${n?u`
                          <div
                            class="hidden sm:block ml-36 ${s.level==="error"?"text-status-error":s.level==="warn"?"text-status-warning":"text-text-muted"}"
                          >
                            ${o.slice(1).map(r=>u`<div class="py-0.5">${r}</div>`)}
                          </div>
                          <div
                            class="sm:hidden mt-1 ${s.level==="error"?"text-status-error":s.level==="warn"?"text-status-warning":"text-text-muted"}"
                          >
                            ${o.slice(1).map(r=>u`<div class="py-0.5">${r}</div>`)}
                          </div>
                        `:""}
                  </div>
                `})}
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-between p-3 bg-bg-secondary border-t border-border text-xs"
        >
          <div class="text-text-muted">
            ${this.filteredLogs.length} / ${this.logs.length} logs
            ${this.logSize?u` <span class="text-text-muted">• ${this.logSize}</span>`:""}
          </div>
          <div class="flex gap-2">
            <button
              class="px-3 py-1 bg-bg border border-border rounded hover:border-primary hover:text-primary transition-colors"
              @click=${this.downloadLogs}
            >
              Download
            </button>
            <button
              class="px-3 py-1 bg-bg border border-status-error text-status-error rounded hover:bg-status-error hover:text-text-bright transition-colors"
              @click=${this.clearLogs}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    `}};d([_()],et.prototype,"logs",2),d([_()],et.prototype,"loading",2),d([_()],et.prototype,"filter",2),d([_()],et.prototype,"levelFilter",2),d([_()],et.prototype,"autoScroll",2),d([_()],et.prototype,"logSize",2),d([_()],et.prototype,"showClient",2),d([_()],et.prototype,"showServer",2),et=d([D("log-viewer")],et);var Qe=class extends R{constructor(){super(...arguments);this.loading=!1;this.error="";this.success="";this.currentUserId="";this.loginPassword="";this.userAvatar="";this.authConfig={enableSSHKeys:!1,disallowUserPassword:!1,noAuth:!1};this.isMobile=!1;this.handleOpenSettings=()=>{this.dispatchEvent(new CustomEvent("open-settings"))}}createRenderRoot(){return this}async connectedCallback(){super.connectedCallback(),console.log("\u{1F50C} Auth login component connected"),this.unsubscribeResponsive=Mt.subscribe(e=>{this.isMobile=e.isMobile}),await this.loadUserInfo()}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribeResponsive&&this.unsubscribeResponsive()}async loadUserInfo(){try{try{let e=await fetch("/api/auth/config");e.ok?(this.authConfig=await e.json(),console.log("\u2699\uFE0F Auth config loaded:",this.authConfig)):console.warn("\u26A0\uFE0F Failed to load auth config, using defaults:",e.status)}catch(e){console.error("\u274C Error loading auth config:",e)}this.currentUserId=await this.authClient.getCurrentSystemUser(),console.log("\u{1F464} Current user:",this.currentUserId),this.authConfig.noAuth||(this.userAvatar=await this.authClient.getUserAvatar(this.currentUserId),console.log("\u{1F5BC}\uFE0F User avatar loaded")),this.authConfig.noAuth&&(console.log("\u{1F513} No auth required, auto-logging in"),this.dispatchEvent(new CustomEvent("auth-success",{detail:{success:!0,userId:this.currentUserId,authMethod:"no-auth"}})))}catch{this.error="Failed to load user information"}}async handlePasswordLogin(e){if(e.preventDefault(),!this.loading){console.log("\u{1F510} Attempting password authentication..."),this.loading=!0,this.error="";try{let t=await this.authClient.authenticateWithPassword(this.currentUserId,this.loginPassword);console.log("\u{1F3AB} Password auth result:",t),t.success?(this.loginPassword="",this.dispatchEvent(new CustomEvent("auth-success",{detail:t}))):this.error=t.error||"Password authentication failed"}catch{this.error="Password authentication failed"}finally{this.loading=!1}}}async handleSSHKeyAuth(){if(!this.loading){console.log("\u{1F510} Attempting SSH key authentication..."),this.loading=!0,this.error="";try{let e=await this.authClient.authenticate(this.currentUserId);console.log("\u{1F3AF} SSH auth result:",e),e.success?this.dispatchEvent(new CustomEvent("auth-success",{detail:e})):this.error=e.error||"SSH key authentication failed. Please try password login."}catch(e){console.error("SSH key authentication error:",e),this.error="SSH key authentication failed"}finally{this.loading=!1}}}handleShowSSHKeyManager(){this.dispatchEvent(new CustomEvent("show-ssh-key-manager"))}render(){return console.log("\u{1F50D} Rendering auth login","enableSSHKeys:",this.authConfig.enableSSHKeys,"noAuth:",this.authConfig.noAuth),u`
      <div class="auth-container">
        <!-- Settings button in top right corner -->
        <button
          class="absolute top-4 right-4 p-2 text-text-muted hover:text-primary transition-colors"
          @click=${this.handleOpenSettings}
          title="Settings"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
          </svg>
        </button>
        
        <div class="w-full max-w-sm">
          <div class="auth-header">
            <div class="flex flex-col items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
              <terminal-icon
                size="${this.isMobile?"48":"56"}"
                style="filter: drop-shadow(0 0 15px rgb(var(--color-primary) / 0.4));"
              ></terminal-icon>
              <h2 class="auth-title text-2xl sm:text-3xl mt-1 sm:mt-2">VibeTunnel</h2>
              <p class="auth-subtitle text-xs sm:text-sm">Please authenticate to continue</p>
            </div>
          </div>

          ${this.error?u`
                <div
                  class="bg-status-error text-bg px-3 py-1.5 rounded mb-3 font-mono text-xs sm:text-sm"
                  data-testid="error-message"
                >
                  ${this.error}
                  <button
                    @click=${()=>{this.error=""}}
                    class="ml-2 text-bg hover:text-primary"
                    data-testid="error-close"
                  >
                    ✕
                  </button>
                </div>
              `:""}
          ${this.success?u`
                <div
                  class="bg-status-success text-bg px-3 py-1.5 rounded mb-3 font-mono text-xs sm:text-sm"
                >
                  ${this.success}
                  <button
                    @click=${()=>{this.success=""}}
                    class="ml-2 text-bg hover:text-primary"
                  >
                    ✕
                  </button>
                </div>
              `:""}

          <div class="auth-form">
            ${this.authConfig.disallowUserPassword?"":u`
                  <!-- Password Login Section (Primary) -->
                  <div class="p-5 sm:p-8">
                    <div class="flex flex-col items-center mb-4 sm:mb-6">
                      <div
                        class="w-24 h-24 sm:w-28 sm:h-28 rounded-full mb-3 sm:mb-4 overflow-hidden"
                        style="box-shadow: 0 0 25px rgb(var(--color-primary) / 0.3);"
                      >
                        ${this.userAvatar?u`
                              <img
                                src="${this.userAvatar}"
                                alt="User Avatar"
                                class="w-full h-full object-cover"
                                width="80"
                                height="80"
                              />
                            `:u`
                              <div
                                class="w-full h-full bg-bg-secondary flex items-center justify-center"
                              >
                                <svg
                                  class="w-12 h-12 sm:w-14 sm:h-14 text-text-muted"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                                </svg>
                              </div>
                            `}
                      </div>
                      <p class="text-primary text-base sm:text-lg font-medium">
                        Welcome back, ${this.currentUserId||"..."}
                      </p>
                    </div>
                    <form @submit=${this.handlePasswordLogin} class="space-y-3">
                      <div>
                        <input
                          type="password"
                          class="input-field"
                          data-testid="password-input"
                          placeholder="System Password"
                          .value=${this.loginPassword}
                          @input=${e=>{this.loginPassword=e.target.value}}
                          ?disabled=${this.loading}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        class="btn-primary w-full py-3 sm:py-4 mt-2"
                        data-testid="password-submit"
                        ?disabled=${this.loading||!this.loginPassword}
                      >
                        ${this.loading?"Authenticating...":"Login with Password"}
                      </button>
                    </form>
                  </div>
                `}
            ${this.authConfig.disallowUserPassword?u`
                  <!-- Avatar for SSH-only mode -->
                  <div class="ssh-key-item p-6 sm:p-8">
                    <div class="flex flex-col items-center mb-4 sm:mb-6">
                      <div
                        class="w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-2 sm:mb-3 overflow-hidden border-2 border-border"
                      >
                        ${this.userAvatar?u`
                              <img
                                src="${this.userAvatar}"
                                alt="User Avatar"
                                class="w-full h-full object-cover"
                                width="80"
                                height="80"
                              />
                            `:u`
                              <div
                                class="w-full h-full bg-bg-secondary flex items-center justify-center"
                              >
                                <svg
                                  class="w-8 h-8 sm:w-10 sm:h-10 text-text-muted"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                                </svg>
                              </div>
                            `}
                      </div>
                      <p class="text-primary text-xs sm:text-sm">
                        ${this.currentUserId?`Welcome back, ${this.currentUserId}`:"Please authenticate to continue"}
                      </p>
                      <p class="text-text-muted text-xs mt-1 sm:mt-2">
                        SSH key authentication required
                      </p>
                    </div>
                  </div>
                `:""}
            ${this.authConfig.enableSSHKeys===!0?u`
                  <!-- Divider (only show if password auth is also available) -->
                  ${this.authConfig.disallowUserPassword?"":u`
                        <div class="auth-divider py-2 sm:py-3">
                          <span>or</span>
                        </div>
                      `}

                  <!-- SSH Key Management Section -->
                  <div class="ssh-key-item p-6 sm:p-8">
                    <div class="flex items-center justify-between mb-3 sm:mb-4">
                      <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-primary"></div>
                        <span class="font-mono text-xs sm:text-sm">SSH Key Management</span>
                      </div>
                      <button
                        class="btn-ghost text-xs"
                        data-testid="manage-keys"
                        @click=${this.handleShowSSHKeyManager}
                      >
                        Manage Keys
                      </button>
                    </div>

                    <div class="space-y-3">
                      <div class="bg-bg border border-border rounded p-3">
                        <p class="text-text-muted text-xs mb-2">
                          Generate SSH keys for browser-based authentication
                        </p>
                        <p class="text-text-muted text-xs">
                          💡 SSH keys work in both browser and terminal
                        </p>
                      </div>

                      <button
                        class="btn-secondary w-full py-2.5 sm:py-3 text-sm sm:text-base"
                        data-testid="ssh-login"
                        @click=${this.handleSSHKeyAuth}
                        ?disabled=${this.loading}
                      >
                        ${this.loading?"Authenticating...":"Login with SSH Key"}
                      </button>
                    </div>
                  </div>
                `:""}
          </div>
        </div>
      </div>
    `}};d([C({type:Object})],Qe.prototype,"authClient",2),d([_()],Qe.prototype,"loading",2),d([_()],Qe.prototype,"error",2),d([_()],Qe.prototype,"success",2),d([_()],Qe.prototype,"currentUserId",2),d([_()],Qe.prototype,"loginPassword",2),d([_()],Qe.prototype,"userAvatar",2),d([_()],Qe.prototype,"authConfig",2),d([_()],Qe.prototype,"isMobile",2),Qe=d([D("auth-login")],Qe);var Te=class extends R{constructor(){super(...arguments);this.visible=!1;this.keys=[];this.loading=!1;this.error="";this.success="";this.showAddForm=!1;this.newKeyName="";this.newKeyPassword="";this.importKeyName="";this.importKeyContent="";this.showInstructions=!1;this.instructionsKeyId="";this.documentKeyHandler=e=>this.handleDocumentKeyDown(e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.refreshKeys()}updated(e){super.updated(e),e.has("visible")&&(this.visible?document.addEventListener("keydown",this.documentKeyHandler):document.removeEventListener("keydown",this.documentKeyHandler))}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("keydown",this.documentKeyHandler)}refreshKeys(){this.keys=this.sshAgent.listKeys()}async handleGenerateKey(){if(!this.newKeyName.trim()){this.error="Please enter a key name";return}this.loading=!0,this.error="";try{let e=await this.sshAgent.generateKeyPair(this.newKeyName,this.newKeyPassword||void 0);this.downloadPrivateKey(e.privateKeyPEM,this.newKeyName),this.success=`SSH key "${this.newKeyName}" generated successfully. Private key downloaded.`,this.newKeyName="",this.newKeyPassword="",this.showAddForm=!1,this.showInstructions=!0,this.instructionsKeyId=e.keyId,this.refreshKeys(),console.log("Generated key ID:",e.keyId)}catch(e){this.error=`Failed to generate key: ${e}`}finally{this.loading=!1}}downloadPrivateKey(e,t){let s=new Blob([e],{type:"text/plain"}),n=URL.createObjectURL(s),o=document.createElement("a");o.href=n,o.download=`${t.replace(/\s+/g,"_")}_private.pem`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(n)}async handleImportKey(){if(!this.importKeyName.trim()||!this.importKeyContent.trim()){this.error="Please enter both key name and private key content";return}this.loading=!0,this.error="";try{let e=await this.sshAgent.addKey(this.importKeyName,this.importKeyContent);this.success=`SSH key "${this.importKeyName}" imported successfully`,this.importKeyName="",this.importKeyContent="",this.showAddForm=!1,this.refreshKeys(),console.log("Imported key ID:",e)}catch(e){this.error=`Failed to import key: ${e}`}finally{this.loading=!1}}handleClose(){this.dispatchEvent(new CustomEvent("close"))}handleRemoveKey(e,t){confirm(`Are you sure you want to remove the SSH key "${t}"?`)&&(this.sshAgent.removeKey(e),this.success=`SSH key "${t}" removed successfully`,this.refreshKeys())}handleDownloadPublicKey(e,t){let s=this.sshAgent.getPublicKey(e);if(s){let n=new Blob([s],{type:"text/plain"}),o=URL.createObjectURL(n),r=document.createElement("a");r.href=o,r.download=`${t.replace(/\s+/g,"_")}_public.pub`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(o)}}handleBackdropClick(e){e.target===e.currentTarget&&this.handleClose()}handleDocumentKeyDown(e){e.key==="Escape"&&this.visible&&(e.preventDefault(),this.handleClose())}render(){return this.visible?u`
      <div 
        class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[1000]"
        @click=${this.handleBackdropClick}
      >
        <div
          class="bg-bg-secondary border border-border rounded-lg p-6 w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl z-[1001]"
          role="dialog"
          aria-modal="true"
          aria-label="SSH Key Manager"
          @click=${e=>e.stopPropagation()}
        >
          <div class="relative mb-8">
            <h2 class="text-2xl font-mono text-primary text-center">🔑 SSH Key Manager</h2>
            <button 
              @click=${this.handleClose} 
              class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface rounded transition-colors"
              title="Close"
            >
              ✕
            </button>
          </div>

          ${this.error?u`
                <div class="bg-status-error text-bg px-4 py-2 rounded mb-4 font-mono text-sm">
                  ${this.error}
                  <button
                    @click=${()=>{this.error=""}}
                    class="ml-2 text-bg hover:text-primary"
                  >
                    ✕
                  </button>
                </div>
              `:""}
          ${this.success?u`
                <div
                  class="bg-status-success text-bg px-4 py-2 rounded mb-4 font-mono text-sm"
                >
                  ${this.success}
                  <button
                    @click=${()=>{this.success=""}}
                    class="ml-2 text-bg hover:text-primary"
                  >
                    ✕
                  </button>
                </div>
              `:""}

          <div class="mb-8">
            <div class="flex items-center justify-between mb-6 pb-3 border-b border-border">
              <h3 class="font-mono text-xl text-primary">SSH Keys</h3>
              <button
                @click=${()=>{this.showAddForm=!this.showAddForm}}
                class="btn-primary px-4 py-2 font-medium"
                ?disabled=${this.loading}
              >
                ${this.showAddForm?"\u2715 Cancel":"+ Add Key"}
              </button>
            </div>

            ${this.showAddForm?u`
                  <div class="space-y-6 mb-8">
                    <!-- Generate New Key Section -->
                    <div class="bg-surface border border-border rounded-lg p-6">
                      <h4 class="text-primary font-mono text-lg mb-6 flex items-center gap-2 font-semibold">
                        🔑 Generate New SSH Key
                      </h4>

                      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label class="form-label"
                            >Key Name <span class="text-accent-red">*</span></label
                          >
                          <input
                            type="text"
                            class="input-field"
                            placeholder="Enter name for new key"
                            .value=${this.newKeyName}
                            @input=${e=>{this.newKeyName=e.target.value}}
                            ?disabled=${this.loading}
                          />
                        </div>
                        <div>
                          <label class="form-label">Algorithm</label>
                          <div
                            class="input-field bg-bg-secondary text-text-muted cursor-not-allowed"
                          >
                            Ed25519 (recommended)
                          </div>
                        </div>
                      </div>

                      <div class="mb-4">
                        <label class="form-label">Password (Optional)</label>
                        <input
                          type="password"
                          class="input-field"
                          placeholder="Enter password to encrypt private key (optional)"
                          .value=${this.newKeyPassword}
                          @input=${e=>{this.newKeyPassword=e.target.value}}
                          ?disabled=${this.loading}
                        />
                        <p class="text-text-muted text-xs mt-1">
                          💡 Leave empty for unencrypted key. Password is required when using the
                          key for signing.
                        </p>
                      </div>
                      <button
                        @click=${this.handleGenerateKey}
                        class="btn-primary"
                        ?disabled=${this.loading||!this.newKeyName.trim()}
                      >
                        ${this.loading?"Generating...":"Generate New Key"}
                      </button>
                    </div>

                    <!-- Import Existing Key Section -->
                    <div class="bg-surface border border-border rounded-lg p-6">
                      <h4 class="text-primary font-mono text-lg mb-6 flex items-center gap-2 font-semibold">
                        📁 Import Existing SSH Key
                      </h4>

                      <div class="mb-4">
                        <label class="form-label"
                          >Key Name <span class="text-accent-red">*</span></label
                        >
                        <input
                          type="text"
                          class="input-field"
                          placeholder="Enter name for imported key"
                          .value=${this.importKeyName}
                          @input=${e=>{this.importKeyName=e.target.value}}
                          ?disabled=${this.loading}
                        />
                      </div>

                      <div class="mb-4">
                        <label class="form-label"
                          >Private Key (PEM format) <span class="text-accent-red">*</span></label
                        >
                        <textarea
                          class="input-field"
                          rows="6"
                          placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                          .value=${this.importKeyContent}
                          @input=${e=>{this.importKeyContent=e.target.value}}
                          ?disabled=${this.loading}
                        ></textarea>
                        <p class="text-text-muted text-xs mt-1">
                          💡 If the key is password-protected, you'll be prompted for the password
                          when using it for authentication.
                        </p>
                      </div>

                      <button
                        @click=${this.handleImportKey}
                        class="btn-secondary"
                        ?disabled=${this.loading||!this.importKeyName.trim()||!this.importKeyContent.trim()}
                      >
                        ${this.loading?"Importing...":"Import Key"}
                      </button>
                    </div>
                  </div>
                `:""}
          </div>

          <!-- Instructions for new key -->
          ${this.showInstructions&&this.instructionsKeyId?u`
                <div class="bg-surface border border-border rounded-lg p-6 mb-8">
                  <div class="flex items-center justify-between mb-6">
                    <h4 class="text-primary font-mono text-lg font-semibold flex items-center gap-2">
                      📋 Setup Instructions
                    </h4>
                    <button
                      @click=${()=>{this.showInstructions=!1}}
                      class="w-8 h-8 flex items-center justify-center text-text-muted hover:text-primary hover:bg-bg rounded transition-colors"
                      title="Close instructions"
                    >
                      ✕
                    </button>
                  </div>
                  <div class="space-y-6">
                    <div class="bg-bg border border-border rounded-lg p-4">
                      <p class="text-text-muted text-sm mb-3 font-medium">
                        1. Add the public key to your authorized_keys file:
                      </p>
                      <div class="relative">
                        <pre
                          class="bg-secondary p-3 rounded-lg text-xs overflow-x-auto text-primary pr-20 font-mono"
                        >
echo "${this.sshAgent.getPublicKey(this.instructionsKeyId)}" >> ~/.ssh/authorized_keys</pre
                        >
                        <button
                          @click=${async()=>{let t=`echo "${this.sshAgent.getPublicKey(this.instructionsKeyId)}" >> ~/.ssh/authorized_keys`;await navigator.clipboard.writeText(t),this.success="Command copied to clipboard!"}}
                          class="absolute top-2 right-2 btn-ghost text-xs"
                          title="Copy command"
                        >
                          📋
                        </button>
                      </div>
                    </div>
                    <div class="bg-bg border border-border rounded-lg p-4">
                      <p class="text-text-muted text-sm mb-3 font-medium">2. Or copy the public key:</p>
                      <div class="relative">
                        <pre
                          class="bg-secondary p-3 rounded-lg text-xs overflow-x-auto text-primary pr-20 font-mono"
                        >
${this.sshAgent.getPublicKey(this.instructionsKeyId)}</pre
                        >
                        <button
                          @click=${async()=>{let e=this.sshAgent.getPublicKey(this.instructionsKeyId);e&&(await navigator.clipboard.writeText(e),this.success="Public key copied to clipboard!")}}
                          class="absolute top-2 right-2 btn-ghost text-xs"
                          title="Copy to clipboard"
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>
                    <div class="bg-status-info/10 border border-status-info/30 rounded-lg p-3">
                      <p class="text-status-info text-sm font-mono flex items-center gap-2">
                        💡 <strong>Tip:</strong> Make sure ~/.ssh/authorized_keys has correct permissions (600)
                      </p>
                    </div>
                  </div>
                </div>
              `:""}

          <!-- Keys List -->
          <div class="space-y-4">
            ${this.keys.length===0?u`
                  <div class="text-center py-12 text-text-muted border border-border rounded-lg bg-surface">
                    <div class="text-4xl mb-4">🔑</div>
                    <p class="font-mono text-lg mb-2 text-primary">No SSH keys found</p>
                    <p class="text-sm">Generate or import a key to get started</p>
                  </div>
                `:this.keys.map(e=>u`
                    <div class="ssh-key-item border border-border rounded-lg p-4 bg-surface hover:bg-bg transition-colors">
                      <div class="flex items-start justify-between">
                        <div class="flex-1">
                          <div class="flex items-center gap-2 mb-2">
                            <h4 class="font-mono font-semibold text-primary">${e.name}</h4>
                            <span class="badge badge-ed25519">${e.algorithm}</span>
                            ${e.encrypted?u`<span class="badge badge-encrypted">🔒 Encrypted</span>`:""}
                          </div>
                          <div class="text-sm text-text-muted font-mono space-y-1">
                            <div>ID: ${e.id}</div>
                            <div>Fingerprint: ${e.fingerprint}</div>
                            <div>Created: ${new Date(e.createdAt).toLocaleString()}</div>
                          </div>
                        </div>
                        <div class="flex gap-2">
                          <button
                            @click=${()=>this.handleDownloadPublicKey(e.id,e.name)}
                            class="btn-ghost text-xs"
                            title="Download Public Key"
                          >
                            📥 Public
                          </button>
                          <button
                            @click=${()=>this.handleRemoveKey(e.id,e.name)}
                            class="btn-ghost text-xs text-status-error hover:bg-status-error hover:text-bg"
                            title="Remove Key"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  `)}
          </div>
        </div>
      </div>
    `:u``}};d([C({type:Object})],Te.prototype,"sshAgent",2),d([C({type:Boolean})],Te.prototype,"visible",2),d([_()],Te.prototype,"keys",2),d([_()],Te.prototype,"loading",2),d([_()],Te.prototype,"error",2),d([_()],Te.prototype,"success",2),d([_()],Te.prototype,"showAddForm",2),d([_()],Te.prototype,"newKeyName",2),d([_()],Te.prototype,"newKeyPassword",2),d([_()],Te.prototype,"importKeyName",2),d([_()],Te.prototype,"importKeyContent",2),d([_()],Te.prototype,"showInstructions",2),d([_()],Te.prototype,"instructionsKeyId",2),Te=d([D("ssh-key-manager")],Te);q();var ga=P("git-notification-handler"),Vi=class extends R{constructor(){super(...arguments);this.notifications=[];this.autoHideTimers=new Map}createRenderRoot(){return this}setControlEventService(e){this.unsubscribe&&this.unsubscribe(),this.unsubscribe=e.onEvent(t=>{t.category==="git"&&t.action==="notification"&&this.handleGitNotification(t.data)})}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribe&&this.unsubscribe(),this.autoHideTimers.forEach(e=>clearTimeout(e)),this.autoHideTimers.clear()}handleGitNotification(e){let t={id:`git-notif-${Date.now()}-${Math.random()}`,data:e,timestamp:Date.now()};ga.debug("Received Git notification:",e),this.notifications=[...this.notifications,t];let s=setTimeout(()=>{this.dismissNotification(t.id)},1e4);this.autoHideTimers.set(t.id,s)}dismissNotification(e){this.notifications=this.notifications.filter(s=>s.id!==e);let t=this.autoHideTimers.get(e);t&&(clearTimeout(t),this.autoHideTimers.delete(e))}getNotificationIcon(e){switch(e){case"branch_switched":return u`
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.632 4.684C18.114 15.938 18 15.482 18 15c0-.482.114-.938.316-1.342m0 2.684a3 3 0 110-2.684M15 9a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        `;case"branch_diverged":return u`
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        `;case"follow_enabled":case"follow_disabled":return u`
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        `}}getNotificationClass(e){switch(e){case"branch_switched":case"follow_enabled":return"bg-blue-500";case"branch_diverged":return"bg-yellow-500";case"follow_disabled":return"bg-gray-500"}}formatNotificationMessage(e){switch(e.type){case"branch_switched":return e.message||`Branch switched to ${e.currentBranch}`;case"branch_diverged":return e.message||`Branch ${e.divergedBranch} has diverged (${e.aheadBy||0} ahead, ${e.behindBy||0} behind)`;case"follow_enabled":return e.message||`Follow mode enabled for ${e.currentBranch}`;case"follow_disabled":return e.message||"Follow mode disabled"}}render(){return this.notifications.length===0?u``:u`
      <div class="fixed top-4 right-4 space-y-2" style="z-index: ${ie.NOTIFICATION};">
        ${this.notifications.map(e=>u`
            <div
              class="flex items-start gap-3 p-4 rounded-lg shadow-lg text-white max-w-md animate-slide-in-right ${this.getNotificationClass(e.data.type)}"
            >
              <div class="flex-shrink-0">
                ${this.getNotificationIcon(e.data.type)}
              </div>
              <div class="flex-1">
                ${e.data.sessionTitle?u`
                      <div class="font-semibold text-sm mb-1">
                        ${e.data.sessionTitle}
                      </div>
                    `:""}
                <div class="text-sm">
                  ${this.formatNotificationMessage(e.data)}
                </div>
              </div>
              <button
                @click=${()=>this.dismissNotification(e.id)}
                class="flex-shrink-0 text-white/80 hover:text-white transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          `)}
      </div>
    `}};d([_()],Vi.prototype,"notifications",2),Vi=d([D("git-notification-handler")],Vi);Me();q();var ni=P("control-event-service"),Br=class{constructor(i){this.authClient=i;this.eventSource=null;this.handlers=[];this.reconnectTimer=null;this.reconnectDelay=1e3;this.maxReconnectDelay=3e4;this.isConnected=!1}connect(){if(this.eventSource)return;let i="/api/control/stream",t=this.authClient.getAuthHeader().Authorization,s=t?`${i}?auth=${encodeURIComponent(t)}`:i;ni.debug("Connecting to control event stream:",i),this.eventSource=new EventSource(s),this.eventSource.onopen=()=>{ni.debug("Control event stream connected"),this.isConnected=!0,this.reconnectDelay=1e3},this.eventSource.onmessage=n=>{try{let o=JSON.parse(n.data);ni.debug("Received control event:",o),this.notifyHandlers(o)}catch(o){ni.error("Failed to parse control event:",o,n.data)}},this.eventSource.onerror=n=>{ni.error("Control event stream error:",n),this.isConnected=!1,this.reconnect()}}disconnect(){this.reconnectTimer&&(clearTimeout(this.reconnectTimer),this.reconnectTimer=null),this.eventSource&&(this.eventSource.close(),this.eventSource=null,this.isConnected=!1)}reconnect(){this.reconnectTimer||(ni.debug(`Reconnecting in ${this.reconnectDelay}ms...`),this.disconnect(),this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,this.connect(),this.reconnectDelay=Math.min(this.reconnectDelay*2,this.maxReconnectDelay)},this.reconnectDelay))}onEvent(i){return this.handlers.push(i),()=>{let e=this.handlers.indexOf(i);e>=0&&this.handlers.splice(e,1)}}notifyHandlers(i){for(let e of this.handlers)try{e(i)}catch(t){ni.error("Error in event handler:",t)}}getConnectionStatus(){return this.isConnected}},Pr=null;function ro(c){return Pr||(Pr=new Br(c)),Pr}Ur();var H=P("app"),pe=class extends R{constructor(){super(...arguments);this.errorMessage="";this.successMessage="";this.sessions=[];this.loading=!1;this.currentView="auth";this.selectedSessionId=null;this.hideExited=this.loadHideExitedState();this.showCreateModal=!1;this.createDialogWorkingDir="";this.showTmuxModal=!1;this.showSSHKeyManager=!1;this.showSettings=!1;this.isAuthenticated=!1;this.sidebarCollapsed=this.loadSidebarState();this.sidebarWidth=this.loadSidebarWidth();this.isResizing=!1;this.mediaState=Mt.getCurrentState();this.hasActiveOverlay=!1;this.keyboardCaptureActive=!0;this.initialLoadComplete=!1;this.responsiveObserverInitialized=!1;this.initialRenderComplete=!1;this.sidebarAnimationReady=!1;this._cachedSelectedSessionId=null;this._lastLoggedView=null;this.hotReloadWs=null;this.errorTimeoutId=null;this.successTimeoutId=null;this.autoRefreshIntervalId=null;this.resizeCleanupFunctions=[];this.sessionLoadingState="idle";this.handleKeyDown=e=>{let t=navigator.platform.toLowerCase().includes("mac");if(this.currentView==="session"&&this.keyboardCaptureActive){let r=t?e.metaKey:e.ctrlKey,a=t?e.ctrlKey:e.metaKey;if(r&&!a&&!e.shiftKey&&!e.altKey&&/^[0-9]$/.test(e.key)){e.preventDefault(),e.stopPropagation();let m=e.key==="0"?10:Number.parseInt(e.key),p=this.sessions.filter(h=>h.status==="running"&&h.activityStatus?.isActive!==!1);if(m>0&&m<=p.length){let h=p[m-1];h&&(H.log(`Switching to session ${m}: ${h.name}`),this.handleNavigateToSession(new CustomEvent("navigate-to-session",{detail:{sessionId:h.id}})))}return}}let s=()=>{let r=e.key.toLowerCase(),a={"mod+a":{browser:"Select all",terminal:"Line start",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="a"},"mod+e":{browser:"Search/Extension",terminal:"Line end",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="e"},"mod+w":{browser:"Close tab",terminal:"Delete word",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="w"},"mod+r":{browser:"Reload",terminal:"History search",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="r"},"mod+l":{browser:"Address bar",terminal:"Clear screen",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="l"},"mod+d":{browser:"Bookmark",terminal:"EOF/Exit",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="d"},"mod+f":{browser:"Find",terminal:"Forward char",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="f"},"mod+p":{browser:"Print",terminal:"Previous cmd",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="p"},"mod+u":{browser:"View source",terminal:"Delete to start",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="u"},"mod+k":{browser:"Search bar",terminal:"Delete to end",check:()=>(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&r==="k"},"alt+d":{browser:"Address bar",terminal:"Delete word fwd",check:()=>e.altKey&&!e.ctrlKey&&!e.metaKey&&r==="d"}};for(let m of Object.values(a))if(m.check())return{captured:!0,browserAction:m.browser,terminalAction:m.terminal};return{captured:!1}};if(ps(e))return;let n=this.selectedSession?.status==="exited";if(this.currentView==="session"&&this.keyboardCaptureActive&&!n){let{captured:r,browserAction:a,terminalAction:m}=s();r&&window.dispatchEvent(new CustomEvent("shortcut-captured",{detail:{shortcut:this.formatShortcut(e),browserAction:a,terminalAction:m}}))}if(!(()=>{if(this.currentView!=="session"||!this.keyboardCaptureActive){let r=e.key.toLowerCase(),a=e.ctrlKey||e.metaKey,m=e.shiftKey,p=e.altKey;if(a&&!m&&!p&&(["t","w","r"].includes(r)||/^[0-9]$/.test(r)||["l","p","s","f","d","h","j"].includes(r))||a&&m&&!p&&(["t","r","n"].includes(r)||r==="delete"||r==="tab"||!t&&r==="q"||t&&r==="a")||a&&!m&&!p&&r==="tab"||["f5","f6","f11"].includes(r))return!0}return!1})()){if((e.metaKey||e.ctrlKey)&&e.key==="o"&&this.currentView==="list"){e.preventDefault(),this.handleNavigateToFileBrowser();return}if((e.metaKey||e.ctrlKey)&&e.key==="b"){e.preventDefault(),this.handleToggleSidebar();return}if(e.key==="Escape"&&(this.currentView==="session"||this.currentView==="file-browser")&&!this.showCreateModal){e.preventDefault(),this.handleNavigateToList();return}}};this.servicesInitialized=!1;this.handleMobileOverlayClick=e=>{this.isInSidebarDismissMode&&(e.preventDefault(),e.stopPropagation(),this.handleToggleSidebar())};this.handleResizeStart=e=>{e.preventDefault(),this.isResizing=!0,this.cleanupResizeListeners(),document.addEventListener("mousemove",this.handleResize),document.addEventListener("mouseup",this.handleResizeEnd),this.resizeCleanupFunctions.push(()=>{document.removeEventListener("mousemove",this.handleResize),document.removeEventListener("mouseup",this.handleResizeEnd)}),document.body.style.cursor="ew-resize",document.body.style.userSelect="none"};this.handleResize=e=>{if(!this.isResizing)return;let t=Math.max(Tt.MIN_WIDTH,Math.min(Tt.MAX_WIDTH,e.clientX));this.sidebarWidth=t,this.saveSidebarWidth(t)};this.handleResizeEnd=()=>{this.isResizing=!1,this.cleanupResizeListeners()};this.handlePopState=e=>{this.parseUrlAndSetState().catch(t=>H.error("Error parsing URL:",t))};this.handleOpenSettings=()=>{this.showSettings=!0};this.handleCloseSettings=()=>{this.showSettings=!1};this.handleOpenFileBrowser=()=>{this.handleNavigateToFileBrowser()};this.handleOpenCreateDialog=e=>{let t=e.detail?.workingDir||"";this.createDialogWorkingDir=t,this.handleCreateSession()};this.handleOpenTmuxSessions=()=>{this.showTmuxModal=!0};this.handleCaptureToggled=e=>{H.log("\u{1F3AF} handleCaptureToggled called with:",e.detail),this.keyboardCaptureActive=e.detail.active,H.log(`Keyboard capture ${this.keyboardCaptureActive?"enabled":"disabled"} via indicator`)}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.setupHotReload(),this.setupKeyboardShortcuts(),this.setupNotificationHandlers(),this.setupResponsiveObserver(),this.setupPreferences(),$t.initAutoUpdates(),document.addEventListener("capture-toggled",this.handleCaptureToggled),this.initializeApp()}firstUpdated(){if(this.controlEventService){let e=this.querySelector("git-notification-handler");e&&e.setControlEventService(this.controlEventService)}Promise.resolve().then(()=>{this.initialRenderComplete=!0,setTimeout(()=>{this.sidebarAnimationReady=!0},100)})}willUpdate(e){(e.has("showCreateModal")||e.has("showTmuxModal")||e.has("showSSHKeyManager")||e.has("showSettings"))&&(this.hasActiveOverlay=this.showCreateModal||this.showTmuxModal||this.showSSHKeyManager||this.showSettings),(e.has("sessions")||e.has("currentView"))&&this.requestUpdate(),e.has("currentView")&&(this.currentView==="session"?document.body.classList.add("in-session-view"):document.body.classList.remove("in-session-view"))}disconnectedCallback(){super.disconnectedCallback(),this.hotReloadWs&&this.hotReloadWs.close(),window.removeEventListener("popstate",this.handlePopState),window.removeEventListener("keydown",this.handleKeyDown),document.removeEventListener("capture-toggled",this.handleCaptureToggled),this.autoRefreshIntervalId!==null&&(clearInterval(this.autoRefreshIntervalId),this.autoRefreshIntervalId=null),this.responsiveUnsubscribe&&this.responsiveUnsubscribe(),this.cleanupResizeListeners()}setupKeyboardShortcuts(){window.addEventListener("keydown",this.handleKeyDown)}async initializeApp(){H.log("\u{1F680} initializeApp() started"),await this.checkAuthenticationStatus(),H.log("\u2705 checkAuthenticationStatus() completed",{isAuthenticated:this.isAuthenticated,sessionCount:this.sessions.length,currentView:this.currentView,initialLoadComplete:this.initialLoadComplete}),this.setupRouting(),H.log("\u2705 setupRouting() completed")}async checkAuthenticationStatus(){let e=!1;try{let t=await fetch("/api/auth/config");if(t.ok){let s=await t.json();if(H.log("\u{1F527} Auth config:",s),e=s.noAuth,s.noAuth){H.log("\u{1F513} No auth required, bypassing authentication"),this.isAuthenticated=!0,this.currentView="list",await this.initializeServices(e),await this.loadSessions(),this.startAutoRefresh(),this.initialLoadComplete=!0;return}if(s.tailscaleAuth&&s.authenticatedUser){H.log("\u{1F512} Authenticated via Tailscale:",s.authenticatedUser),this.isAuthenticated=!0,this.currentView="list",await this.initializeServices(e),await this.loadSessions(),this.startAutoRefresh(),this.initialLoadComplete=!0;return}}}catch(t){H.warn("\u26A0\uFE0F Could not fetch auth config:",t)}this.isAuthenticated=N.isAuthenticated(),H.log("\u{1F510} Authentication status:",this.isAuthenticated),this.isAuthenticated?(this.currentView="list",await this.initializeServices(e),await this.loadSessions(),this.startAutoRefresh(),this.initialLoadComplete=!0):this.currentView="auth"}async handleAuthSuccess(e){if(H.log("\u2705 Authentication successful",e.detail),e.detail?.authMethod==="no-auth"&&e.detail?.userId&&(N.setNoAuthUser(e.detail.userId),H.log("\u{1F464} No-auth user configured:",N.getCurrentUser())),this.isAuthenticated&&this.initialLoadComplete){H.debug("Already authenticated and initialized, skipping re-initialization");return}if(this.servicesInitialized||this.isAuthenticated){H.debug("Services already initialized or being initialized, skipping");return}this.isAuthenticated=!0,this.currentView="list",await this.initializeServices(!1),await this.loadSessions(),this.startAutoRefresh(),this.initialLoadComplete=!0;let s=new URL(window.location.href).pathname.split("/").filter(Boolean);if(s.length===2&&s[0]==="session"){let n=s[1];H.log(`Navigating to session ${n} from URL after auth`),this.selectedSessionId=n,this.sessionLoadingState="idle",this.currentView="session"}}async initializeServices(e=!1){if(this.servicesInitialized){H.debug("Services already initialized, skipping");return}H.log("\u{1F680} Initializing services...");try{await Ms.initialize(),H.log("Initializing push notification service..."),await X.initialize();let t=X.isSupported(),s=window.isSecureContext;H.log("Push notification initialization complete:",{isSupported:t,isSecureContext:s,location:window.location.hostname,protocol:window.location.protocol}),this.controlEventService=ro(N),this.controlEventService.connect(),ot.setAuthClient(N),await ot.connect(),this.servicesInitialized=!0,H.log("\u2705 Services initialized successfully")}catch(t){H.error("\u274C Failed to initialize services:",t)}}async handleLogout(){H.log("\u{1F44B} Logging out"),await N.logout(),this.isAuthenticated=!1,this.currentView="auth",this.sessions=[]}handleShowSSHKeyManager(){this.showSSHKeyManager=!0}handleCloseSSHKeyManager(){this.showSSHKeyManager=!1}showError(e){this.errorTimeoutId!==null&&(clearTimeout(this.errorTimeoutId),this.errorTimeoutId=null),this.errorMessage=e,this.errorTimeoutId=window.setTimeout(()=>{this.errorMessage="",this.errorTimeoutId=null},Xt.ERROR_MESSAGE_TIMEOUT)}showSuccess(e){this.successTimeoutId!==null&&(clearTimeout(this.successTimeoutId),this.successTimeoutId=null),this.successMessage=e,this.successTimeoutId=window.setTimeout(()=>{this.successMessage="",this.successTimeoutId=null},Xt.SUCCESS_MESSAGE_TIMEOUT)}clearError(){this.errorTimeoutId===null&&(this.errorMessage="")}async loadSessions(){this.initialLoadComplete||(this.loading=!0);let e=async()=>{try{let t=N.getAuthHeader(),s=await fetch("/api/sessions",{headers:t});if(s.ok){let n=await s.json(),o=n.filter(m=>m.activityStatus);o.length>0?H.debug("Sessions with activity status:",o.map(m=>({id:m.id,name:m.name,command:m.command,status:m.status,activityStatus:m.activityStatus}))):H.debug("No sessions have activity status");let r=n.map(m=>{let p=this.sessions.find(h=>h.id===m.id);if(p){if(!(p.status!==m.status||p.name!==m.name||p.workingDir!==m.workingDir||p.activityStatus!==m.activityStatus||p.exitCode!==m.exitCode||!p.gitRepoPath&&m.gitRepoPath||!1))return p;if(p.gitRepoPath&&!m.gitRepoPath)return H.debug("[App] Preserving Git info for session",{sessionId:p.id,gitRepoPath:p.gitRepoPath,gitModifiedCount:p.gitModifiedCount,gitUntrackedCount:p.gitUntrackedCount}),p.status=m.status,p.name=m.name,p.workingDir=m.workingDir,p.activityStatus=m.activityStatus,p.exitCode=m.exitCode,p.lastModified=m.lastModified,p.active=m.active,p.source=m.source,p.remoteId=m.remoteId,p.remoteName=m.remoteName,p.remoteUrl=m.remoteUrl,p}return m});if((r.length!==this.sessions.length||r.some((m,p)=>m!==this.sessions[p]))&&(this.sessions=r,this._cachedSelectedSession=void 0,this._cachedSelectedSessionId=null),this.clearError(),this.currentView==="list"){let m=this.sessions.length;$t.setListTitle(m)}this.selectedSessionId&&this.currentView==="session"&&(this.sessions.find(p=>p.id===this.selectedSessionId)?this.sessionLoadingState!=="loaded"&&(this.sessionLoadingState="loaded",H.debug(`Session ${this.selectedSessionId} found and loaded`)):this.sessionLoadingState==="loaded"?(this.sessionLoadingState="not-found",H.warn(`Session ${this.selectedSessionId} was loaded but is now missing (possibly cleaned up)`),this.showError(`Session ${this.selectedSessionId} not found`),this.handleNavigateToList()):this.sessionLoadingState==="loading"&&this.initialLoadComplete?(this.sessionLoadingState="not-found",H.warn(`Session ${this.selectedSessionId} not found after loading completed`),this.showError(`Session ${this.selectedSessionId} not found`),this.handleNavigateToList()):this.sessionLoadingState==="idle"&&(this.sessionLoadingState="loading",H.debug(`Looking for session ${this.selectedSessionId}...`)))}else if(s.status===401){this.handleLogout();return}else this.showError("Failed to load sessions")}catch(t){H.error("error loading sessions:",t),this.showError("Failed to load sessions")}finally{this.loading=!1,this.initialLoadComplete=!0}};if(!this.initialLoadComplete&&"startViewTransition"in document&&typeof document.startViewTransition=="function"){H.log("\u{1F3A8} Using View Transition API for initial session load"),document.body.classList.add("initial-session-load");let t=document.startViewTransition(async()=>{await e(),await this.updateComplete});t.ready.then(()=>{H.log("\u2728 Initial load view transition ready")}).catch(s=>{H.debug("View transition not supported or failed (this is normal):",s)}),t.finished.finally(()=>{H.log("\u2705 Initial load view transition finished"),document.body.classList.remove("initial-session-load")}).catch(()=>{document.body.classList.remove("initial-session-load")})}else this.initialLoadComplete?await e():(H.log("\u{1F3A8} Using CSS animation fallback for initial load"),document.body.classList.add("initial-session-load"),await e(),setTimeout(()=>{document.body.classList.remove("initial-session-load")},600))}startAutoRefresh(){this.autoRefreshIntervalId=window.setInterval(()=>{(this.currentView==="list"||this.currentView==="session")&&this.loadSessions()},Xt.AUTO_REFRESH_INTERVAL)}async handleSessionCreated(e){let t=e.detail.sessionId,s=e.detail.message;if(!t){this.showError("Session created but ID not found in response");return}if(this.showCreateModal=!1,s?.includes("Terminal spawned successfully")){this.showSuccess("Terminal window opened successfully");return}await this.waitForSessionAndSwitch(t)}async waitForSessionAndSwitch(e){console.log("[App] waitForSessionAndSwitch called with:",e);let t=10,s=Xt.SESSION_SEARCH_DELAY;for(let n=0;n<t;n++){await this.loadSessions();let o=this.sessions.find(r=>r.id===e);if(o){await this.handleNavigateToSession(new CustomEvent("navigate-to-session",{detail:{sessionId:o.id}}));return}await new Promise(r=>window.setTimeout(r,s))}H.log("session not found after all attempts"),this.showError("Session created but could not be found. Please refresh.")}handleSessionKilled(e){H.log(`session ${e.detail} killed`),this.loadSessions()}handleRefresh(){this.loadSessions()}handleError(e){this.showError(e.detail.message||e.detail)}async handleHideExitedChange(e){if(H.log("handleHideExitedChange",{currentHideExited:this.hideExited,newHideExited:e.detail,currentView:this.currentView}),this.currentView==="session"){this.hideExited=e.detail,this.saveHideExitedState(this.hideExited),await this.updateComplete,H.log("Skipped animations in session detail view");return}let s=this.hideExited,n=window.scrollY,o=document.documentElement.scrollHeight,r=window.innerHeight,a=n+r>=o-100;document.body.classList.add("sessions-animating"),H.log("Added sessions-animating class"),this.hideExited=e.detail,this.saveHideExitedState(this.hideExited),await this.updateComplete,H.log("Update complete, scheduling animation"),requestAnimationFrame(()=>{let m=s?"sessions-showing":"sessions-hiding";document.body.classList.add(m),H.log("Added animation class:",m);let p=document.querySelectorAll(".session-flex-responsive > session-card");H.log("Found session cards to animate:",p.length),a&&requestAnimationFrame(()=>{window.scrollTo({top:document.documentElement.scrollHeight-r,behavior:"instant"})}),setTimeout(()=>{document.body.classList.remove("sessions-animating","sessions-showing","sessions-hiding"),H.log("Cleaned up animation classes"),a&&window.scrollTo({top:document.documentElement.scrollHeight-r,behavior:"instant"})},300)})}handleCreateSession(){H.log("handleCreateSession called"),document.body.classList.remove("modal-closing"),this.createDialogWorkingDir="",this.showCreateModal=!0,H.log("showCreateModal set to true"),this.requestUpdate()}handleCreateModalClose(){this.showCreateModal=!1,this.createDialogWorkingDir="",this.requestUpdate()}cleanupSessionViewStream(){let e=this.querySelector("session-view");e?.streamConnection&&(H.log("Cleaning up stream connection"),e.streamConnection.disconnect(),e.streamConnection=null)}async handleNavigateToSession(e){let{sessionId:t}=e.detail;console.log("[App] handleNavigateToSession called with:",t),this.selectedSessionId!==t&&this.cleanupSessionViewStream(),H.debug("Navigation to session:",{sessionId:t,windowWidth:window.innerWidth,mobileBreakpoint:at.MOBILE,isMobile:this.mediaState.isMobile,currentSidebarCollapsed:this.sidebarCollapsed,mediaStateIsMobile:this.mediaState.isMobile}),this.selectedSessionId=t,this.sessionLoadingState="idle",this.currentView="session",this.updateUrl(t);let s=this.sessions.find(n=>n.id===t);if(s){let n=s.name||s.command.join(" ");console.log("[App] Setting title:",n),$t.setSessionTitle(n)}else console.log("[App] No session found:",t);this.mediaState.isMobile&&(this.sidebarCollapsed=!0,this.saveSidebarState(!0)),this.updateComplete.then(()=>{gn(t,this)})}handleNavigateToFileBrowser(e){this.selectedSessionId=e||null,$t.setFileBrowserTitle(),this.currentView="file-browser",this.updateUrl()}handleNavigateToList(){this.cleanupSessionViewStream();let e=this.sessions.length;$t.setListTitle(e),!(this.currentView==="session")&&"startViewTransition"in document&&typeof document.startViewTransition=="function"?document.startViewTransition(()=>(this.selectedSessionId=null,this.currentView="list",this.updateUrl(),this.updateComplete)):(this.selectedSessionId=null,this.currentView="list",this.updateUrl())}async handleKillAll(){let e=this.sessions.filter(o=>o.status==="running");if(e.length===0)return;let t=e.map(async o=>{try{let r=await fetch(`/api/sessions/${o.id}`,{method:"DELETE",headers:{...N.getAuthHeader()}});return r.ok?(H.debug(`Successfully killed session ${o.id}`),!0):(H.error(`Failed to kill session ${o.id}:`,r.status),!1)}catch(r){return H.error(`Error killing session ${o.id}:`,r),!1}}),n=(await Promise.all(t)).filter(o=>o).length;n===t.length?this.showSuccess(`All ${n} sessions killed successfully`):n>0?this.showError(`Killed ${n} of ${t.length} sessions`):this.showError("Failed to kill sessions"),await this.loadSessions()}handleCleanExited(){let e=this.querySelector("session-list");e?.handleCleanupExited&&e.handleCleanupExited()}handleToggleSidebar(){this.sidebarCollapsed=!this.sidebarCollapsed,this.saveSidebarState(this.sidebarCollapsed)}formatShortcut(e){let t=[];return e.ctrlKey&&t.push("Ctrl"),e.metaKey&&t.push("Cmd"),e.shiftKey&&t.push("Shift"),e.altKey&&t.push(navigator.platform.toLowerCase().includes("mac")?"Option":"Alt"),t.push(e.key),t.join("+")}handleSessionStatusChanged(e){H.log("Session status changed:",e.detail),this.loadSessions()}loadHideExitedState(){try{let e=localStorage.getItem("hideExitedSessions");return e!==null?e==="true":!0}catch(e){return H.error("error loading hideExited state:",e),!0}}saveHideExitedState(e){try{localStorage.setItem("hideExitedSessions",String(e))}catch(t){H.error("error saving hideExited state:",t)}}loadSidebarState(){try{let e=localStorage.getItem("sidebarCollapsed"),t=window.innerWidth<at.MOBILE,s=e!==null?e==="true":t;return H.debug("Loading sidebar state:",{savedValue:e,windowWidth:window.innerWidth,mobileBreakpoint:at.MOBILE,isMobile:t,hasSavedState:e!==null,resultingState:s?"collapsed":"expanded"}),s}catch(e){return H.error("error loading sidebar state:",e),window.innerWidth<at.MOBILE}}saveSidebarState(e){try{localStorage.setItem("sidebarCollapsed",String(e))}catch(t){H.error("error saving sidebar state:",t)}}loadSidebarWidth(){try{let e=localStorage.getItem("sidebarWidth"),t=e!==null?Number.parseInt(e,10):Tt.DEFAULT_WIDTH;return Math.max(Tt.MIN_WIDTH,Math.min(Tt.MAX_WIDTH,t))}catch(e){return H.error("error loading sidebar width:",e),Tt.DEFAULT_WIDTH}}saveSidebarWidth(e){try{localStorage.setItem("sidebarWidth",String(e))}catch(t){H.error("error saving sidebar width:",t)}}setupResponsiveObserver(){this.responsiveUnsubscribe=Mt.subscribe(e=>{let t=this.mediaState;this.mediaState=e,this.responsiveObserverInitialized&&this.initialRenderComplete?!t.isMobile&&e.isMobile&&!this.sidebarCollapsed?(this.sidebarCollapsed=!0,this.saveSidebarState(!0)):t.isMobile&&!e.isMobile&&this.sidebarCollapsed&&(this.sidebarCollapsed=!1,this.saveSidebarState(!1)):this.responsiveObserverInitialized||(this.responsiveObserverInitialized=!0)})}cleanupResizeListeners(){this.resizeCleanupFunctions.forEach(e=>e()),this.resizeCleanupFunctions=[],document.body.style.cursor="",document.body.style.userSelect=""}setupRouting(){window.addEventListener("popstate",this.handlePopState.bind(this)),this.parseUrlAndSetState().catch(e=>H.error("Error parsing URL:",e))}async parseUrlAndSetState(){let e=new URL(window.location.href),t=e.pathname.split("/").filter(Boolean);if(H.log("\u{1F50D} parseUrlAndSetState() called",{url:e.href,pathname:e.pathname,pathParts:t,currentView:this.currentView,isAuthenticated:this.isAuthenticated,sessionCount:this.sessions.length}),t.length===1){try{let n=await fetch("/api/auth/config");if(n.ok){if(!(await n.json()).noAuth&&!N.isAuthenticated()){this.currentView="auth",this.selectedSessionId=null;return}}else if(!N.isAuthenticated()){this.currentView="auth",this.selectedSessionId=null;return}}catch{if(!N.isAuthenticated()){this.currentView="auth",this.selectedSessionId=null;return}}if(t[0]==="file-browser"){this.currentView="file-browser";return}}let s=null;if(t.length===2&&t[0]==="session"&&(s=t[1]),!this.initialLoadComplete&&!this.isAuthenticated){H.log("\u{1F510} Not authenticated, redirecting to auth view"),this.currentView="auth",this.selectedSessionId=null;return}if(s){H.log(`\u{1F3AF} Navigating to session ${s} from URL`),this.sessions.length===0&&this.isAuthenticated&&(H.log("\u{1F4CB} Sessions not loaded yet, loading now..."),await this.loadSessions(),H.log("\u2705 Sessions loaded",{sessionCount:this.sessions.length}));let n=this.sessions.find(o=>o.id===s);if(H.log("\u{1F50D} Looking for session",{sessionId:s,found:!!n,availableSessions:this.sessions.map(o=>({id:o.id,status:o.status}))}),!n){H.warn(`\u274C Session ${s} not found in loaded sessions`),this.showError(`Session ${s} not found`),this.selectedSessionId=null,this.currentView="list";return}H.log("\u2705 Session found, navigating to session view",{sessionId:s,sessionStatus:n.status}),this.selectedSessionId=s,this.sessionLoadingState="loaded",this.currentView="session",this.requestUpdate(),H.log("\u{1F4CD} Navigation complete",{currentView:this.currentView,selectedSessionId:this.selectedSessionId,sessionLoadingState:this.sessionLoadingState})}else this.selectedSessionId=null,this.currentView="list"}updateUrl(e){let t=new URL(window.location.href);t.search="",this.currentView==="file-browser"?t.pathname="/file-browser":e?t.pathname=`/session/${e}`:t.pathname="/",window.history.pushState(null,"",t.toString())}setupHotReload(){if(typeof process<"u"&&!1||window.location.search.includes("test=true")||navigator.userAgent.includes("HeadlessChrome")||navigator.userAgent.includes("Headless")||window.__playwright!==void 0||navigator.userAgent.includes("Playwright")||navigator.webdriver===!0||window.location.port==="4022"){H.log("Hot reload disabled in test environment");return}if(window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1")try{let s=`${window.location.protocol==="https:"?"wss:":"ws:"}//${window.location.host}?hotReload=true`;this.hotReloadWs=new WebSocket(s),this.hotReloadWs.onmessage=n=>{JSON.parse(n.data).type==="reload"&&window.location.reload()},this.hotReloadWs.onerror=()=>{H.debug("Hot reload WebSocket connection failed (this is normal in production)")}}catch(t){H.debug("Hot reload setup failed (this is normal in production):",t)}}setupNotificationHandlers(){}setupPreferences(){try{let e=localStorage.getItem("vibetunnel_app_preferences");e&&JSON.parse(e)}catch(e){H.error("Failed to load app preferences",e)}window.addEventListener("app-preferences-changed",()=>{})}get showSplitView(){return this.currentView==="session"&&this.selectedSessionId!==null}get selectedSession(){if(this._cachedSelectedSessionId===this.selectedSessionId&&this._cachedSelectedSession){let e=this.sessions.find(t=>t.id===this._cachedSelectedSession?.id);if(e)return this._cachedSelectedSession=e,e}return this._cachedSelectedSessionId=this.selectedSessionId,this._cachedSelectedSession=this.sessions.find(e=>e.id===this.selectedSessionId),this._cachedSelectedSession}get sidebarClasses(){if(!this.showSplitView)return"w-full min-h-screen flex flex-col";let e="bg-secondary flex flex-col",t=this.mediaState.isMobile,s=this.sidebarAnimationReady&&!t?"sidebar-transition":"",n=t?"absolute left-0 top-0 bottom-0 flex":s,o=this.sidebarCollapsed?t?"hidden mobile-sessions-sidebar collapsed":"sm:overflow-hidden sm:translate-x-0 flex":t?"overflow-visible sm:translate-x-0 flex mobile-sessions-sidebar expanded":"overflow-visible sm:translate-x-0 flex";return`${e} ${this.showSplitView?o:""} ${this.showSplitView?n:""}`}get sidebarStyles(){if(!this.showSplitView)return"";let e=this.mediaState.isMobile;return this.sidebarCollapsed?"width: 0px;":e?`width: calc(100vw - ${Tt.MOBILE_RIGHT_MARGIN}px); z-index: ${ie.SIDEBAR_MOBILE};`:`width: ${this.sidebarWidth}px;`}get shouldShowMobileOverlay(){return this.showSplitView&&!this.sidebarCollapsed&&this.mediaState.isMobile}get shouldShowResizeHandle(){return this.showSplitView&&!this.sidebarCollapsed&&!this.mediaState.isMobile}get mainContainerClasses(){return this.showSplitView?`flex h-screen overflow-hidden relative ${mn()?"ios-split-view":""}`:"min-h-screen"}get isInSidebarDismissMode(){return!this.mediaState.isMobile||!this.shouldShowMobileOverlay?!1:window.innerHeight>window.innerWidth}render(){let e=this.showSplitView,t=this.selectedSession;return this.currentView!==this._lastLoggedView&&(H.log("\u{1F3A8} App render()",{currentView:this.currentView,showSplitView:e,selectedSessionId:this.selectedSessionId,selectedSession:t?{id:t.id,status:t.status}:null,isAuthenticated:this.isAuthenticated,sessionCount:this.sessions.length,cacheHit:this._cachedSelectedSessionId===this.selectedSessionId}),this._lastLoggedView=this.currentView),u`
      <!-- Error notification overlay -->
      ${this.errorMessage?u`
            <div class="fixed top-4 right-4" style="z-index: ${ie.MODAL_BACKDROP};">
              <div
                class="bg-status-error text-bg-elevated px-4 py-2 rounded shadow-lg font-mono text-sm"
              >
                ${this.errorMessage}
                <button
                  @click=${()=>{this.errorTimeoutId!==null&&(clearTimeout(this.errorTimeoutId),this.errorTimeoutId=null),this.errorMessage=""}}
                  class="ml-2 text-bg-elevated hover:text-text-muted"
                >
                  ✕
                </button>
              </div>
            </div>
          `:""}
      ${this.successMessage?u`
            <div class="fixed top-4 right-4" style="z-index: ${ie.MODAL_BACKDROP};">
              <div
                class="bg-status-success text-bg-elevated px-4 py-2 rounded shadow-lg font-mono text-sm"
              >
                ${this.successMessage}
                <button
                  @click=${()=>{this.successTimeoutId!==null&&(clearTimeout(this.successTimeoutId),this.successTimeoutId=null),this.successMessage=""}}
                  class="ml-2 text-bg-elevated hover:text-text-muted"
                >
                  ✕
                </button>
              </div>
            </div>
          `:""}

      <!-- Main content -->
      ${this.currentView==="auth"?u`
            <auth-login
              .authClient=${N}
              @auth-success=${this.handleAuthSuccess}
              @show-ssh-key-manager=${this.handleShowSSHKeyManager}
              @open-settings=${this.handleOpenSettings}
            ></auth-login>
          `:this.currentView==="file-browser"?u`
              <!-- Full page file browser view -->
              <file-browser
                .visible=${!0}
                .mode=${"browse"}
                .session=${this.selectedSession}
                @browser-cancel=${this.handleNavigateToList}
                @insert-path=${this.handleNavigateToList}
              ></file-browser>
            `:u`
      <!-- Main content with split view support -->
      <div class="${this.mainContainerClasses}">
        <!-- Mobile overlay when sidebar is open -->
        ${this.shouldShowMobileOverlay?u`
              <div
                class="fixed inset-0 sm:hidden transition-all ${this.isInSidebarDismissMode?"bg-bg/50 backdrop-blur-sm":"bg-transparent pointer-events-none"}"
                style="z-index: ${ie.MOBILE_OVERLAY}; transition-duration: ${ar.MOBILE_SLIDE}ms;"
                @click=${this.handleMobileOverlayClick}
              ></div>
            `:""}

        <!-- Sidebar with session list - always visible on desktop -->
        <div class="${this.sidebarClasses}" style="${this.sidebarStyles}">
          <app-header
            .sessions=${this.sessions}
            .hideExited=${this.hideExited}
            .showSplitView=${e}
            .currentUser=${N.getCurrentUser()?.userId||null}
            .authMethod=${N.getCurrentUser()?.authMethod||null}
            @create-session=${this.handleCreateSession}
            @hide-exited-change=${this.handleHideExitedChange}
            @kill-all-sessions=${this.handleKillAll}
            @clean-exited-sessions=${this.handleCleanExited}
            @open-file-browser=${this.handleOpenFileBrowser}
            @open-tmux-sessions=${this.handleOpenTmuxSessions}
            @open-settings=${this.handleOpenSettings}
            @logout=${this.handleLogout}
            @navigate-to-list=${this.handleNavigateToList}
            @toggle-sidebar=${this.handleToggleSidebar}
          ></app-header>
          <div class="${this.showSplitView?"flex-1 overflow-y-auto":"flex-1"} bg-secondary">
            <session-list
              .sessions=${this.sessions}
              .loading=${this.loading}
              .hideExited=${this.hideExited}
              .selectedSessionId=${this.selectedSessionId}
              .compactMode=${e}
              .collapsed=${this.sidebarCollapsed}
              .authClient=${N}
              @session-killed=${this.handleSessionKilled}
              @refresh=${this.handleRefresh}
              @error=${this.handleError}
              @hide-exited-change=${this.handleHideExitedChange}
              @kill-all-sessions=${this.handleKillAll}
              @navigate-to-session=${this.handleNavigateToSession}
              @open-file-browser=${this.handleOpenFileBrowser}
              @open-create-dialog=${this.handleOpenCreateDialog}
            ></session-list>
          </div>
        </div>

        <!-- Resize handle for sidebar -->
        ${this.shouldShowResizeHandle?u`
              <div
                class="w-1 bg-border hover:bg-accent-green cursor-ew-resize transition-colors ${this.isResizing?"bg-accent-green":""}"
                style="transition-duration: ${ar.RESIZE_HANDLE}ms;"
                @mousedown=${this.handleResizeStart}
                title="Drag to resize sidebar"
              ></div>
            `:""}

        <!-- Main content area -->
        ${e?u`
              <div class="flex-1 relative sm:static transition-none">
                ${un(this.selectedSessionId,u`
                    <session-view
                      .session=${t}
                      .showBackButton=${!1}
                      .showSidebarToggle=${!0}
                      .sidebarCollapsed=${this.sidebarCollapsed}
                      .disableFocusManagement=${this.hasActiveOverlay}
                      .keyboardCaptureActive=${this.keyboardCaptureActive}
                      @navigate-to-list=${this.handleNavigateToList}
                      @toggle-sidebar=${this.handleToggleSidebar}
                      @create-session=${this.handleCreateSession}
                      @session-status-changed=${this.handleSessionStatusChanged}
                      @open-settings=${this.handleOpenSettings}
                      @capture-toggled=${this.handleCaptureToggled}
                    ></session-view>
                  `)}
              </div>
            `:""}
      </div>
      `}


      <!-- Unified Settings Modal -->
      <vt-settings
        .visible=${this.showSettings}
        .authClient=${N}
        @close=${this.handleCloseSettings}
        @notifications-enabled=${async()=>{this.showSuccess("Notifications enabled"),await ot.connect()}}
        @notifications-disabled=${()=>{this.showSuccess("Notifications disabled"),ot.disconnect()}}
        @success=${n=>this.showSuccess(n.detail)}
        @error=${n=>this.showError(n.detail)}
      ></vt-settings>

      <!-- SSH Key Manager Modal -->
      <ssh-key-manager
        .visible=${this.showSSHKeyManager}
        .sshAgent=${N.getSSHAgent()}
        @close=${this.handleCloseSSHKeyManager}
      ></ssh-key-manager>

      <!-- Session Create Modal -->
      <session-create-form
        .visible=${this.showCreateModal}
        .workingDir=${this.createDialogWorkingDir}
        .authClient=${N}
        @session-created=${this.handleSessionCreated}
        @cancel=${this.handleCreateModalClose}
        @error=${this.handleError}
      ></session-create-form>

      <!-- Git Notification Handler -->
      <git-notification-handler></git-notification-handler>

      <!-- Multiplexer Modal (tmux/Zellij) -->
      <multiplexer-modal
        .open=${this.showTmuxModal}
        @close=${()=>{this.showTmuxModal=!1}}
        @navigate-to-session=${this.handleNavigateToSession}
        @create-session=${this.handleCreateSession}
      ></multiplexer-modal>
    `}};d([_()],pe.prototype,"errorMessage",2),d([_()],pe.prototype,"successMessage",2),d([_()],pe.prototype,"sessions",2),d([_()],pe.prototype,"loading",2),d([_()],pe.prototype,"currentView",2),d([_()],pe.prototype,"selectedSessionId",2),d([_()],pe.prototype,"hideExited",2),d([_()],pe.prototype,"showCreateModal",2),d([_()],pe.prototype,"createDialogWorkingDir",2),d([_()],pe.prototype,"showTmuxModal",2),d([_()],pe.prototype,"showSSHKeyManager",2),d([_()],pe.prototype,"showSettings",2),d([_()],pe.prototype,"isAuthenticated",2),d([_()],pe.prototype,"sidebarCollapsed",2),d([_()],pe.prototype,"sidebarWidth",2),d([_()],pe.prototype,"isResizing",2),d([_()],pe.prototype,"mediaState",2),d([_()],pe.prototype,"hasActiveOverlay",2),d([_()],pe.prototype,"keyboardCaptureActive",2),pe=d([D("vibetunnel-app")],pe);Zi().catch(console.error);window.addEventListener("notification-action",c=>{let{action:i,data:e}=c.detail,t=document.querySelector("vibetunnel-app");t&&t.dispatchEvent(new CustomEvent("notification-action",{detail:{action:i,data:e}}))});
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
@lit/reactive-element/decorators/custom-element.js:
@lit/reactive-element/decorators/property.js:
@lit/reactive-element/decorators/state.js:
@lit/reactive-element/decorators/event-options.js:
@lit/reactive-element/decorators/base.js:
@lit/reactive-element/decorators/query.js:
@lit/reactive-element/decorators/query-all.js:
@lit/reactive-element/decorators/query-async.js:
@lit/reactive-element/decorators/query-assigned-nodes.js:
lit-html/directive.js:
lit-html/async-directive.js:
lit-html/directives/repeat.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
lit-html/directives/keyed.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
lit-html/directives/ref.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
