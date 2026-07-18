#!/usr/bin/env bash
# Solar SCADA — VPS deployment script
# Usage: bash deploy.sh
set -e

REPO=/home/automystics-scada/htdocs/scada.automystics.tech
cd "$REPO"

echo "==> [1/7] Writing platform-admin backend route..."
cat > artifacts/api-server/src/routes/platform-admin-auth.ts << 'TSEOF'
import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, type SessionPayload } from "../middleware/authenticate";
import crypto from "crypto";
const router: IRouter = Router();
const WHITELISTED = new Set(["automystics.com@gmail.com","anandakumar.mani012@gmail.com"]);
const MASTER = process.env.PLATFORM_ADMIN_PASSCODE ?? "666666";
const OTP_TTL = 5*60*1000, COOLDOWN = 50*1000, SESS_MAX = 7*24*60*60*1000;
const cookieOpts = ()=>({signed:true,httpOnly:true,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production",maxAge:SESS_MAX,path:"/"});
interface Rec{otp:string;expiresAt:number;cooldownUntil:number;}
const store = new Map<string,Rec>();
setInterval(()=>{const n=Date.now();for(const[k,v]of store)if(n>v.expiresAt)store.delete(k);},10*60*1000);
const rng=()=>String(crypto.randomInt(100000,999999));
const mask=(e:string)=>{const[l,d]=e.split("@");if(!l||!d)return e;return`${l.slice(0,2)}${"*".repeat(Math.max(l.length-2,8))}@${d}`;};
async function adminSession():Promise<SessionPayload|null>{const[a]=await db.select().from(usersTable).where(eq(usersTable.isSuperAdmin,true)).limit(1);return a?{userId:a.id,orgId:a.orgId,roleId:a.roleId}:null;}
router.post("/platform-admin/login/email",(req,res)=>{
  const{email}=req.body as{email?:unknown};
  if(typeof email!=="string"||!email.trim()){res.status(400).json({error:"invalid_body",message:"email is required"});return;}
  const n=email.trim().toLowerCase();
  if(!WHITELISTED.has(n)){res.status(403).json({error:"not_whitelisted",message:"This email address is not authorised for platform access."});return;}
  const ex=store.get(n);const now=Date.now();
  if(ex&&now<ex.cooldownUntil){const s=Math.ceil((ex.cooldownUntil-now)/1000);res.status(429).json({error:"resend_cooldown",message:`Please wait ${s}s.`,secondsLeft:s,maskedEmail:mask(n)});return;}
  const otp=rng();store.set(n,{otp,expiresAt:now+OTP_TTL,cooldownUntil:now+COOLDOWN});
  res.json({ok:true,maskedEmail:mask(n),expiresInMs:OTP_TTL,resendCooldownMs:COOLDOWN});
});
router.post("/platform-admin/login/resend",(req,res)=>{
  const{email}=req.body as{email?:unknown};
  if(typeof email!=="string"||!email.trim()){res.status(400).json({error:"invalid_body",message:"email is required"});return;}
  const n=email.trim().toLowerCase();
  if(!WHITELISTED.has(n)){res.status(403).json({error:"not_whitelisted",message:"Email not authorised."});return;}
  const ex=store.get(n);const now=Date.now();
  if(ex&&now<ex.cooldownUntil){const s=Math.ceil((ex.cooldownUntil-now)/1000);res.status(429).json({error:"resend_cooldown",message:`Wait ${s}s`,secondsLeft:s});return;}
  const otp=rng();store.set(n,{otp,expiresAt:now+OTP_TTL,cooldownUntil:now+COOLDOWN});
  res.json({ok:true,maskedEmail:mask(n),expiresInMs:OTP_TTL,resendCooldownMs:COOLDOWN});
});
router.post("/platform-admin/login/verify-otp",async(req,res)=>{
  const{email,otp}=req.body as{email?:unknown;otp?:unknown};
  if(typeof email!=="string"||!email.trim()){res.status(400).json({error:"invalid_body",message:"email is required"});return;}
  if(typeof otp!=="string"||!otp.trim()){res.status(400).json({error:"invalid_body",message:"otp is required"});return;}
  const n=email.trim().toLowerCase(),p=otp.trim();
  if(!WHITELISTED.has(n)){res.status(403).json({error:"not_whitelisted",message:"Email not authorised."});return;}
  const mb=Buffer.from(MASTER.padEnd(32)),pb=Buffer.from(p.padEnd(32));
  const isMaster=mb.length===pb.length&&crypto.timingSafeEqual(mb,pb)&&p===MASTER;
  if(!isMaster){
    const r=store.get(n);
    if(!r){res.status(401).json({error:"no_otp",message:"No OTP found. Please request a new code."});return;}
    if(Date.now()>r.expiresAt){store.delete(n);res.status(401).json({error:"otp_expired",message:"OTP expired. Please request a new code."});return;}
    if(r.otp!==p){res.status(401).json({error:"invalid_otp",message:"Incorrect code. Please try again."});return;}
    store.delete(n);
  }
  const payload=await adminSession();
  if(!payload){res.status(500).json({error:"no_admin_user",message:"Platform admin account not found."});return;}
  res.cookie(SESSION_COOKIE,JSON.stringify(payload),cookieOpts());
  res.json({ok:true});
});
router.post("/platform-admin/login/logout",(_req,res)=>{res.clearCookie(SESSION_COOKIE,{path:"/"});res.json({ok:true});});
export default router;
TSEOF

echo "==> [2/7] Patching route index, app.ts and App.tsx..."
python3 - << 'PYEOF'
# Patch index.ts
with open('artifacts/api-server/src/routes/index.ts','r') as f: c=f.read()
if 'platform-admin-auth' not in c:
    c=c.replace('import authRouter from "./auth";','import authRouter from "./auth";\nimport platformAdminAuthRouter from "./platform-admin-auth";')
    c=c.replace('router.use(authRouter);\n\n// Edge','router.use(authRouter);\nrouter.use(platformAdminAuthRouter);\n\n// Edge')
    with open('artifacts/api-server/src/routes/index.ts','w') as f: f.write(c)
    print("  index.ts patched")
else: print("  index.ts already done")

# Patch app.ts
with open('artifacts/api-server/src/app.ts','r') as f: c=f.read()
if 'frontendDist' not in c:
    c=c.replace('import express, { type Express } from "express";','import express, { type Express } from "express";\nimport path from "path";\nimport fs from "fs";')
    c=c.replace('app.use("/api", router);\n\nexport default app;','''app.use("/api", router);
const frontendDist=process.env.FRONTEND_DIST??path.join(process.cwd(),"artifacts/solar-scada/dist/public");
if(fs.existsSync(frontendDist)){app.use(express.static(frontendDist));app.get("*",(_req,res)=>{res.sendFile(path.join(frontendDist,"index.html"));});}
else{console.warn("Frontend dist not found:",frontendDist);}
export default app;''')
    with open('artifacts/api-server/src/app.ts','w') as f: f.write(c)
    print("  app.ts patched")
else: print("  app.ts already done")

# Patch App.tsx
with open('artifacts/solar-scada/src/App.tsx','r') as f: c=f.read()
if 'platform-admin-login' not in c:
    c=c.replace("import NotFound from '@/pages/not-found';","import NotFound from '@/pages/not-found';\nimport PlatformAdminLogin from '@/pages/platform-admin-login';")
    c=c.replace('      <Route path="/login" component={Login} />','      <Route path="/platform-admin" component={PlatformAdminLogin} />\n      <Route path="/login" component={Login} />')
    with open('artifacts/solar-scada/src/App.tsx','w') as f: f.write(c)
    print("  App.tsx patched")
else: print("  App.tsx already done")
PYEOF

echo "==> [3/7] Writing frontend platform-admin page..."
cat > artifacts/solar-scada/src/pages/platform-admin-login.tsx << 'TSXEOF'
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, RotateCcw, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
const BASE = import.meta.env.BASE_URL;
function fmt(ms:number){const s=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;}
function EmailStep({onSuccess}:{onSuccess:(e:string,m:string,t:number)=>void}){
  const[email,setEmail]=useState("");const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  async function go(e:React.FormEvent){e.preventDefault();setError(null);setLoading(true);
    try{const r=await fetch(`${BASE}api/platform-admin/login/email`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.trim()})});
      const b=await r.json() as{ok?:boolean;maskedEmail?:string;expiresInMs?:number;message?:string};
      if(!r.ok){setError(b.message??"Access denied.");return;}
      onSuccess(email.trim().toLowerCase(),b.maskedEmail??email,b.expiresInMs??300000);
    }catch{setError("Could not reach the server.");}finally{setLoading(false);}
  }
  return(<div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
    <h2 className="text-2xl font-bold text-gray-900 mb-1">Admin access</h2>
    <p className="text-sm text-gray-500 mb-6">Enter your authorised email to receive a one-time code.</p>
    <form onSubmit={go} className="space-y-4">
      <div><label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus placeholder="you@gmail.com" className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"/>
      </div>
      {error&&<p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
      <button type="submit" disabled={loading||!email} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
        {loading&&<Loader2 className="h-4 w-4 animate-spin"/>}{loading?"Sending code…":"Send verification code"}
      </button>
    </form>
  </div>);
}
function OtpStep({email,maskedEmail,expiresInMs,onBack}:{email:string;maskedEmail:string;expiresInMs:number;onBack:()=>void}){
  const[,setLocation]=useLocation();const qc=useQueryClient();
  const[otp,setOtp]=useState("");const[error,setError]=useState<string|null>(null);const[loading,setLoading]=useState(false);
  const[msLeft,setMsLeft]=useState(expiresInMs);const[resendMs,setResendMs]=useState(50000);
  const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  useEffect(()=>{if(msLeft<=0)return;const id=setInterval(()=>setMsLeft(p=>Math.max(0,p-1000)),1000);return()=>clearInterval(id);},[msLeft]);
  useEffect(()=>{if(resendMs<=0)return;const id=setInterval(()=>setResendMs(p=>Math.max(0,p-1000)),1000);return()=>clearInterval(id);},[resendMs]);
  async function verify(e:React.FormEvent){e.preventDefault();setError(null);setLoading(true);
    try{const r=await fetch(`${BASE}api/platform-admin/login/verify-otp`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,otp:otp.trim()})});
      const b=await r.json() as{ok?:boolean;message?:string};
      if(!r.ok){setError(b.message??"Incorrect code.");return;}
      await qc.invalidateQueries({queryKey:["auth","me"]});setLocation("/");
    }catch{setError("Could not reach the server.");}finally{setLoading(false);}
  }
  async function resend(){if(resendMs>0)return;setError(null);
    try{const r=await fetch(`${BASE}api/platform-admin/login/resend`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
      const b=await r.json() as{ok?:boolean;expiresInMs?:number;message?:string};
      if(r.ok){setMsLeft(b.expiresInMs??300000);setResendMs(50000);setOtp("");}else{setError(b.message??"Could not resend.");}
    }catch{setError("Could not reach the server.");}
  }
  return(<div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
    <h2 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h2>
    <p className="text-sm text-gray-500 mb-1">We sent a 6-digit code to</p>
    <p className="text-sm font-semibold text-gray-800 mb-6">{maskedEmail}</p>
    <form onSubmit={verify} className="space-y-4">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">One-Time Password</label>
        <span className={`text-xs font-mono font-semibold ${msLeft<60000?"text-red-500":"text-gray-400"}`}>{msLeft>0?`Expires ${fmt(msLeft)}`:"Expired"}</span>
      </div>
      <input ref={ref} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="• • • • • •" required autoComplete="one-time-code" disabled={msLeft===0}
        className="w-full border-2 border-indigo-400 rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-[0.6em] text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition disabled:opacity-40"/>
      {error&&<p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
      <button type="submit" disabled={loading||otp.length<6||msLeft===0} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
        {loading?<Loader2 className="h-5 w-5 animate-spin"/>:<CheckCircle2 className="h-5 w-5"/>}{loading?"Verifying…":"Verify OTP"}
      </button>
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"><ArrowLeft className="h-3.5 w-3.5"/>Use different email</button>
        <button type="button" onClick={resend} disabled={resendMs>0} className="flex items-center gap-1 text-sm text-gray-400 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <RotateCcw className="h-3.5 w-3.5"/>{resendMs>0?`Resend OTP (${Math.ceil(resendMs/1000)}s)`:"Resend OTP"}
        </button>
      </div>
    </form>
  </div>);
}
export default function PlatformAdminLogin(){
  const[step,setStep]=useState<"email"|"otp">("email");
  const[email,setEmail]=useState("");const[masked,setMasked]=useState("");const[ttl,setTtl]=useState(300000);
  return(<div className="min-h-screen flex flex-col items-center justify-center p-6" style={{background:"linear-gradient(135deg,#0f1629 0%,#151d35 60%,#1a1040 100%)"}}>
    <div className="flex flex-col items-center mb-10 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)"}}>
        <ShieldCheck className="h-8 w-8 text-white" strokeWidth={2}/>
      </div>
      <h1 className="text-3xl font-bold text-white tracking-tight">Mystics Platform</h1>
      <p className="text-sm text-slate-400 mt-1.5">Admin Console</p>
    </div>
    {step==="email"
      ?<EmailStep onSuccess={(e,m,t)=>{setEmail(e);setMasked(m);setTtl(t);setStep("otp");}}/>
      :<OtpStep email={email} maskedEmail={masked} expiresInMs={ttl} onBack={()=>setStep("email")}/>}
    <p className="text-xs text-slate-600 mt-8">Unauthorised access is prohibited and monitored.</p>
  </div>);
}
TSXEOF

echo "==> [4/7] Building API server..."
pnpm --filter @workspace/api-server run build

echo "==> [5/7] Building frontend..."
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/solar-scada run build

echo "==> [6/7] Setting up proxy service on port 3003..."
cat > serve.mjs << 'EOF'
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const PORT=Number(process.env.PORT??3003),API_PORT=Number(process.env.API_PORT??8080);
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const STATIC=path.join(__dirname,'artifacts/solar-scada/dist/public');
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
function proxy(req,res){const o={hostname:'127.0.0.1',port:API_PORT,path:req.url,method:req.method,headers:{...req.headers,host:'localhost'}};const p=http.request(o,r=>{res.writeHead(r.statusCode??502,r.headers);r.pipe(res,{end:true});});p.on('error',()=>{try{res.writeHead(502).end('API unavailable');}catch{}});req.pipe(p,{end:true});}
http.createServer((req,res)=>{
  const url=(req.url??'/').split('?')[0];
  if(url.startsWith('/api/')){proxy(req,res);return;}
  let f=path.join(STATIC,url==='/'?'index.html':url);
  if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(STATIC,'index.html');
  if(!fs.existsSync(f)){res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]??'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('Proxy :'+PORT+' -> API :'+API_PORT));
EOF

cat > /etc/systemd/system/solar-scada-proxy.service << 'EOF'
[Unit]
Description=Solar SCADA Proxy :3003
After=network.target solar-scada-api.service
[Service]
Type=simple
User=root
WorkingDirectory=/home/automystics-scada/htdocs/scada.automystics.tech
ExecStart=/usr/bin/node serve.mjs
Restart=always
RestartSec=5
Environment=PORT=3003
Environment=API_PORT=8080
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF

echo "==> [7/7] Restarting services..."
systemctl daemon-reload
systemctl enable solar-scada-proxy
systemctl restart solar-scada-api
systemctl restart solar-scada-proxy
sleep 3

echo ""
echo "==> Health checks..."
curl -s http://127.0.0.1:8080/api/healthz && echo " <- API OK"
curl -s http://127.0.0.1:3003/api/healthz && echo " <- Proxy OK"
curl -s http://127.0.0.1:3003/ | grep -o '<title>.*</title>' && echo " <- Frontend OK"
echo ""
echo "==> Done! Visit https://scada.automystics.tech"
echo "==> Platform admin: https://scada.automystics.tech/platform-admin"
