const enc = new TextEncoder();
const SESSION_COOKIE = "nsh_session";
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
const fail = (message,status=400) => json({error:message},status);
const id = () => crypto.randomUUID();
function randomToken(n=32){const b=new Uint8Array(n);crypto.getRandomValues(b);let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function sha256(s){const d=await crypto.subtle.digest("SHA-256",enc.encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hashPassword(password,salt=randomToken(16)){const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:310000,hash:"SHA-256"},key,256);let raw="";for(const b of new Uint8Array(bits))raw+=String.fromCharCode(b);return `pbkdf2$310000$${salt}$${btoa(raw)}`}
async function verifyPassword(password,stored){try{const [kind,iter,salt,want]=stored.split("$");if(kind!=="pbkdf2"||Number(iter)!==310000)return false;const got=(await hashPassword(password,salt)).split("$")[3];if(got.length!==want.length)return false;let d=0;for(let i=0;i<got.length;i++)d|=got.charCodeAt(i)^want.charCodeAt(i);return d===0}catch{return false}}
function tokenFrom(request){const c=request.headers.get("Cookie")||"";const p=c.split(";").map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+"="));return p?decodeURIComponent(p.slice(SESSION_COOKIE.length+1)):null}
function cookie(token,days=7){return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days*86400}`}
function clearCookie(){return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
async function userFor(request,env){if(!env.DB)return null;const t=tokenFrom(request);if(!t)return null;const h=await sha256(t);const u=await env.DB.prepare("SELECT u.id,u.email,u.name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?").bind(h).first();if(!u)return null;if(u.expires_at<Math.floor(Date.now()/1000)){await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(h).run();return null}return {id:u.id,email:u.email,name:u.name,role:u.role}}
async function session(env,uid,days=7){const t=randomToken(32),h=await sha256(t),expires=Math.floor(Date.now()/1000)+days*86400;await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(h,uid,expires).run();return t}
async function body(request){try{return await request.json()}catch{return null}}
const validEmail=s=>typeof s==="string"&&s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const validPassword=s=>typeof s==="string"&&s.length>=10&&s.length<=200;
const safeName=(s,f)=>typeof s==="string"&&s.trim()?s.trim().slice(0,80):f;
async function route(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==="/api/me"&&method==="GET")return json({user:await userFor(request,env),setupRequired:!env.DB});
 if(path==="/api/login"&&method==="POST"){
  if(!env.DB)return fail("Backend not configured: create and bind D1 first.",503);const b=await body(request);if(!b||!validEmail(b.email)||typeof b.password!=="string")return fail("Enter a valid email and password.");
  const email=b.email.trim().toLowerCase(),u=await env.DB.prepare("SELECT id,email,name,role,password_hash FROM users WHERE email=?").bind(email).first();if(!u||!await verifyPassword(b.password,u.password_hash))return fail("Email or password is incorrect.",401);
  const days=Math.min(30,Math.max(1,Number(env.SESSION_DAYS)||7)),t=await session(env,u.id,days);return json({user:{id:u.id,email:u.email,name:u.name,role:u.role}},200,{"Set-Cookie":cookie(t,days)});
 }
 if(path==="/api/register"&&method==="POST"){
  if(!env.DB)return fail("Backend not configured: create and bind D1 first.",503);const b=await body(request);if(!b||!validEmail(b.email)||!validPassword(b.password))return fail("Use a valid email and a password of at least 10 characters.");
  const email=b.email.trim().toLowerCase();if(await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return fail("An account with that email already exists.",409);
  const uid=id(),name=safeName(b.name,email.split("@")[0]),pass=await hashPassword(b.password);try{await env.DB.prepare("INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,'student')").bind(uid,email,name,pass).run()}catch{return fail("Could not create account. Try again.",500)}
  const t=await session(env,uid,7);return json({user:{id:uid,email,name,role:"student"}},201,{"Set-Cookie":cookie(t,7)});
 }
 if(path==="/api/admin/bootstrap"&&method==="POST"){
  if(!env.DB)return fail("Backend not configured: create and bind D1 first.",503);if(!env.OWNER_SETUP_SECRET)return fail("Owner setup is disabled. Add OWNER_SETUP_SECRET in Cloudflare Pages settings, redeploy, and try again.",503);
  const b=await body(request);if(!b||typeof b.setupSecret!=="string"||b.setupSecret!==env.OWNER_SETUP_SECRET)return fail("Owner setup secret is incorrect.",403);if(!validEmail(b.email)||!validPassword(b.password))return fail("Use a valid email and a password of at least 10 characters.");
  const c=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='owner'").first();if(Number(c?.n||0)>0)return fail("An owner account already exists. Owner setup is one-time.",409);
  const email=b.email.trim().toLowerCase();if(await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first())return fail("That email is already registered. Choose another email.",409);
  const uid=id(),name=safeName(b.name,"Hub Owner"),pass=await hashPassword(b.password);await env.DB.prepare("INSERT INTO users(id,email,name,password_hash,role) VALUES(?,?,?,?,'owner')").bind(uid,email,name,pass).run();const t=await session(env,uid,7);return json({user:{id:uid,email,name,role:"owner"}},201,{"Set-Cookie":cookie(t,7)});
 }
 if(path==="/api/logout"&&method==="POST"){const t=tokenFrom(request);if(t&&env.DB)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(t)).run();return json({ok:true},200,{"Set-Cookie":clearCookie()})}
 if(path==="/api/resources"&&method==="GET"){if(!env.DB)return json({resources:[]});const {results=[]}=await env.DB.prepare("SELECT id,title,subject,type,description,url,created_at FROM resources ORDER BY created_at DESC LIMIT 300").all();return json({resources:results})}
 if(path==="/api/resources"&&method==="POST"){
  const u=await userFor(request,env);if(!u)return fail("Sign in required.",401);if(u.role!=="owner")return fail("Owner access required.",403);const b=await body(request);if(!b||typeof b.title!=="string"||!b.title.trim()||!["Physics","Chemistry","Biology","General"].includes(b.subject)||b.type!=="link")return fail("For links, enter a title, valid subject and format.");
  let parsed;try{parsed=new URL(b.url)}catch{return fail("Enter a valid URL.")}if(!["https:","http:"].includes(parsed.protocol))return fail("Only HTTP(S) URLs are allowed.");const rid=id();await env.DB.prepare("INSERT INTO resources(id,title,subject,type,description,url,created_by) VALUES(?,?,?,'link',?,?,?)").bind(rid,b.title.trim().slice(0,140),b.subject,String(b.description||"").slice(0,400),parsed.href,u.id).run();return json({ok:true,resource:{id:rid,title:b.title.trim(),subject:b.subject,type:"link",url:parsed.href}},201)
 }
 if(path==="/api/upload"&&method==="POST"){
  const u=await userFor(request,env);if(!u)return fail("Sign in required.",401);if(u.role!=="owner")return fail("Owner access required.",403);if(!env.DB||!env.FILES)return fail("Upload backend not configured. Bind D1 as DB and R2 as FILES.",503);if(Number(request.headers.get("content-length")||0)>20*1024*1024+100000)return fail("File is too large. Maximum upload size is 20 MB.",413);
  let f;try{f=await request.formData()}catch{return fail("Could not read upload form.")}const title=String(f.get("title")||"").trim(),subject=String(f.get("subject")||""),type=String(f.get("type")||""),description=String(f.get("description")||"").slice(0,400),file=f.get("file");
  if(!title||title.length>140||!["Physics","Chemistry","Biology","General"].includes(subject)||!["pdf","epub","video"].includes(type)||!file||typeof file.arrayBuffer!=="function")return fail("Check title, subject, format and selected file.");if(file.size<1||file.size>20*1024*1024)return fail("Choose a file smaller than 20 MB.",413);
  const name=(file.name||"").toLowerCase(),ext=type==="pdf"&&name.endsWith(".pdf")?"pdf":type==="epub"&&name.endsWith(".epub")?"epub":type==="video"&&/\.(mp4|webm|mov|m4v)$/.test(name)?name.split(".").pop():null;if(!ext)return fail("File extension does not match selected format. PDF, EPUB or MP4/WebM/MOV videos only.");
  const rid=id(),key=`resources/${rid}.${ext}`,ct=type==="pdf"?"application/pdf":type==="epub"?"application/epub+zip":(file.type||"video/mp4");await env.FILES.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:ct,cacheControl:"public, max-age=3600"}});
  try{await env.DB.prepare("INSERT INTO resources(id,title,subject,type,description,url,object_key,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(rid,title,subject,type,description,`/api/file/${rid}`,key,u.id).run()}catch{await env.FILES.delete(key);return fail("Could not save resource metadata.",500)}return json({ok:true,resource:{id:rid,title,subject,type,url:`/api/file/${rid}`}},201)
 }
 if(path.startsWith("/api/file/")&&method==="GET"){
  if(!env.DB||!env.FILES)return fail("File storage is not configured.",503);const rid=path.slice("/api/file/".length);const row=await env.DB.prepare("SELECT title,type,object_key FROM resources WHERE id=?").bind(rid).first();if(!row||!row.object_key)return fail("File not found.",404);const obj=await env.FILES.get(row.object_key);if(!obj)return fail("File not found.",404);const h=new Headers();obj.writeHttpMetadata(h);h.set("Content-Disposition",`inline; filename="${String(row.title).replace(/["\r\n]/g,"").slice(0,120)}"`);h.set("X-Content-Type-Options","nosniff");h.set("Cache-Control","public, max-age=3600");return new Response(obj.body,{headers:h})
 }
 if(path==="/api/notices"&&method==="GET"){if(!env.DB)return json({notices:[]});const {results=[]}=await env.DB.prepare("SELECT id,title,body,created_at FROM notices ORDER BY created_at DESC LIMIT 100").all();return json({notices:results})}
 if(path==="/api/notices"&&method==="POST"){const u=await userFor(request,env);if(!u)return fail("Sign in required.",401);if(u.role!=="owner")return fail("Owner access required.",403);const b=await body(request);if(!b||typeof b.title!=="string"||!b.title.trim()||typeof b.body!=="string"||!b.body.trim())return fail("Enter a headline and message.");await env.DB.prepare("INSERT INTO notices(id,title,body,created_by) VALUES(?,?,?,?)").bind(id(),b.title.trim().slice(0,140),b.body.trim().slice(0,1200),u.id).run();return json({ok:true},201)}
 if(path==="/api/state"&&(method==="GET"||method==="PUT")){
  const u=await userFor(request,env);if(!u)return fail("Sign in required.",401);if(method==="GET"){const row=await env.DB.prepare("SELECT state_json FROM user_state WHERE user_id=?").bind(u.id).first();let state={};try{state=JSON.parse(row?.state_json||"{}")}catch{}return json({state})}
  const b=await body(request);if(!b||!b.state||typeof b.state!=="object"||Array.isArray(b.state))return fail("Invalid state payload.");const allowed=new Set(["progress","tasks","goal"]),state={};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(b.state,k))state[k]=b.state[k];const raw=JSON.stringify(state);if(raw.length>100000)return fail("Saved progress is too large.");await env.DB.prepare("INSERT INTO user_state(user_id,state_json,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET state_json=excluded.state_json,updated_at=datetime('now')").bind(u.id,raw).run();return json({ok:true})
 }
 return null;
}
export default {async fetch(request,env,ctx){if(new URL(request.url).pathname.startsWith("/api/")){try{return await route(request,env)||fail("Not found.",404)}catch(e){return fail("Server error. Check Cloudflare Pages Functions logs.",500)}}return env.ASSETS.fetch(request)}};
