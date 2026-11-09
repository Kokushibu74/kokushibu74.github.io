/* SWARM REBIRTH — The S Awakening
 * Canvas-only cinematic opening for the existing Swarm Rebuild.
 * Preserves the site's DOM, styles, layout, and original sound engine.
 */
(() => {
  "use strict";
  if (window.__swarmRebirth) return;

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = REDUCED ? 2800 : 9000;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const ease = t => t*t*(3-2*t);
  let active = null;

  function bezier(a,b,c,d,t) {
    const m=1-t;
    return {x:m*m*m*a.x+3*m*m*t*b.x+3*m*t*t*c.x+t*t*t*d.x,
      y:m*m*m*a.y+3*m*m*t*b.y+3*m*t*t*c.y+t*t*t*d.y};
  }

  function sPoint(u,cx,cy,size) {
    const p0={x:cx+size*.20,y:cy-size*.34},p1={x:cx+size*.02,y:cy-size*.50};
    const p2={x:cx-size*.28,y:cy-size*.42},p3={x:cx-size*.27,y:cy-size*.18};
    const p4={x:cx-size*.25,y:cy+size*.02},p5={x:cx+size*.29,y:cy-size*.02};
    const p6={x:cx+size*.27,y:cy+size*.20},p7={x:cx+size*.24,y:cy+size*.43};
    const p8={x:cx-size*.02,y:cy+size*.49},p9={x:cx-size*.25,y:cy+size*.32};
    if(u<1/3)return bezier(p0,p1,p2,p3,u*3);
    if(u<2/3)return bezier(p3,p4,p5,p6,(u-1/3)*3);
    return bezier(p6,p7,p8,p9,(u-2/3)*3);
  }

  function makeOverlay() {
    const root=document.createElement("div");
    root.id="swarm-rebirth-overlay";
    root.setAttribute("role","status");
    root.setAttribute("aria-label","Swarm Rebirth animation");
    root.innerHTML='<canvas aria-hidden="true"></canvas><div class="sr-mark"><span class="sr-kicker">KOKUSHIBU74 · INTELLIGENCE</span><span class="sr-title">THE S AWAKENING</span><span class="sr-caption">A NEW FORM OF CREATION</span></div>';
    const style=document.createElement("style");
    style.textContent=
      "#swarm-rebirth-overlay{position:fixed;inset:0;z-index:2147483647;overflow:hidden;background:#030611;opacity:1;isolation:isolate;pointer-events:none;color:#eafaff}"+
      "#swarm-rebirth-overlay canvas{position:absolute;inset:0;width:100%;height:100%;display:block}"+
      "#swarm-rebirth-overlay .sr-mark{position:absolute;left:0;right:0;bottom:clamp(42px,9vh,88px);display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;opacity:0;animation:sr-copy-in .7s ease 1.1s forwards}"+
      "#swarm-rebirth-overlay .sr-kicker{font:600 9px/1.3 'JetBrains Mono',monospace;letter-spacing:.24em;color:rgba(167,190,220,.68)}"+
      "#swarm-rebirth-overlay .sr-title{font:800 clamp(13px,2vw,19px)/1.2 'Outfit',sans-serif;letter-spacing:.28em;color:#e8fbff;text-shadow:0 0 18px rgba(0,220,255,.24)}"+
      "#swarm-rebirth-overlay .sr-caption{font:500 8px/1.3 'JetBrains Mono',monospace;letter-spacing:.2em;color:rgba(126,155,190,.6)}"+
      "@keyframes sr-copy-in{to{opacity:1}}"+
      "@media(max-width:600px){#swarm-rebirth-overlay .sr-mark{bottom:calc(34px + env(safe-area-inset-bottom))}#swarm-rebirth-overlay .sr-kicker{font-size:8px;letter-spacing:.16em}#swarm-rebirth-overlay .sr-title{letter-spacing:.19em}}"+
      "@media(prefers-reduced-motion:reduce){#swarm-rebirth-overlay .sr-mark{animation:none;opacity:1}}";
    root.appendChild(style);
    document.body.appendChild(root);
    return {root,canvas:root.querySelector("canvas")};
  }

  function launch(swarm) {
    if(active){active.cancel();return;}
    if(!swarm||typeof swarm.start!=="function")return;
    if(swarm.app){swarm.stop(false);return;}

    // Prime the existing Web Audio context synchronously inside the user's click.
    // This intro adds no music, samples, or new sound effects.
    if(typeof swarm.primeSound==="function")swarm.primeSound();

    const made=makeOverlay(),root=made.root,canvas=made.canvas;
    const ctx=canvas.getContext("2d",{alpha:false,desynchronized:true});
    if(!ctx){
      root.remove();
      if(typeof swarm.cancelPrimeSound==="function")swarm.cancelPrimeSound();
      swarm.start();
      return;
    }

    const mobile=matchMedia("(max-width: 767px)").matches;
    const count=REDUCED?90:(mobile?170:300);
    const particles=Array.from({length:count},(_,i)=>({
      x:Math.random(),y:Math.random(),seed:Math.random()*Math.PI*2,u:i/(Math.max(1,Math.floor(count*.76)-1)),
      form:i<count*.76,size:Math.random()*1.6+.45,hue:Math.random()
    }));
    const stars=Array.from({length:mobile?55:100},()=>({
      x:Math.random(),y:Math.random(),r:Math.random()*1.1+.2,a:Math.random()*.45+.12,phase:Math.random()*Math.PI*2
    }));
    let width=0,height=0,dpr=1,raf=0,started=false,finished=false,disposed=false;
    let startAt=0,swarmStartedAt=0;

    function resize(){
      width=innerWidth;height=innerHeight;
      dpr=Math.min(devicePixelRatio||1,mobile?1.35:1.65);
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    window.addEventListener("resize",resize,{passive:true});

    function draw(now){
      if(disposed)return;
      const elapsed=now-startAt,t=clamp(elapsed/DURATION,0,1);
      const cx=width*.5,cy=height*.46,size=Math.min(width*.78,height*.72,520);
      const gather=ease(clamp((t-.12)/.35,0,1));
      const form=ease(clamp((t-.34)/.25,0,1));
      const burst=clamp((t-.76)/.22,0,1);

      ctx.fillStyle="rgba(3,6,17,.22)";ctx.fillRect(0,0,width,height);
      const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.68);
      bg.addColorStop(0,"rgba(10,27,49,.36)");bg.addColorStop(.55,"rgba(5,12,29,.12)");bg.addColorStop(1,"rgba(3,6,17,0)");
      ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);

      for(const s of stars){
        ctx.globalAlpha=s.a*(.55+.45*Math.sin(now*.0007+s.phase));
        ctx.fillStyle="#b9eaff";ctx.beginPath();ctx.arc(s.x*width,s.y*height,s.r,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;

      // Tiny cyan spark: the S is not visible before this point.
      const sparkIn=clamp(t/.13,0,1),sparkOut=1-clamp((t-.2)/.13,0,1),sparkAlpha=sparkIn*sparkOut;
      if(sparkAlpha>0){
        const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,42);
        glow.addColorStop(0,"rgba(150,250,255,"+(.95*sparkAlpha)+")");
        glow.addColorStop(.16,"rgba(0,218,255,"+(.42*sparkAlpha)+")");
        glow.addColorStop(1,"rgba(0,150,255,0)");
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,42,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="rgba(220,255,255,"+sparkAlpha+")";ctx.beginPath();ctx.arc(cx,cy,2+sparkIn*5+Math.sin(now*.012)*1.2,0,Math.PI*2);ctx.fill();
      }

      // Energy filaments converge toward the future S silhouette.
      if(t>.12&&t<.57){
        const a=clamp((t-.12)/.15,0,1)*(1-clamp((t-.48)/.09,0,1));
        for(let i=0;i<18;i++){
          const ang=i/18*Math.PI*2+now*.00012,inner=18+gather*size*.16,outer=size*.72;
          ctx.beginPath();ctx.moveTo(cx+Math.cos(ang)*outer,cy+Math.sin(ang)*outer);
          ctx.quadraticCurveTo(cx+Math.cos(ang+.3)*size*.28,cy+Math.sin(ang+.3)*size*.28,cx+Math.cos(ang)*inner,cy+Math.sin(ang)*inner);
          ctx.strokeStyle=i%3===0?"rgba(143,103,255,"+(a*.24)+")":"rgba(0,211,255,"+(a*.25)+")";
          ctx.lineWidth=.7;ctx.stroke();
        }
      }

      // Organic particle gathering resolves into a crisp, precise S.
      for(const p of particles){
        const target=sPoint(p.u,cx,cy,size),orbit=now*.00045+p.seed;
        const gx=cx+Math.cos(orbit)*size*(.15+.28*(1-gather));
        const gy=cy+Math.sin(orbit*1.17)*size*(.20+.25*(1-gather));
        const fx=target.x+Math.sin(now*.0018+p.seed)*size*.006;
        const fy=target.y+Math.cos(now*.0015+p.seed)*size*.006;
        let tx=p.x*width,ty=p.y*height;
        if(p.form){
          if(t<.36){tx=p.x*width+(gx-p.x*width)*gather;ty=p.y*height+(gy-p.y*height)*gather;}
          else if(t<.76){tx=gx+(fx-gx)*form;ty=gy+(fy-gy)*form;}
          else{
            const angle=Math.atan2(target.y-cy,target.x-cx)+p.seed*.08;
            const dist=size*(.08+burst*.88)+(p.seed%1)*size*.22;
            tx=cx+Math.cos(angle)*dist;ty=cy+Math.sin(angle)*dist;
          }
        }else{
          const a=orbit+p.seed;tx=cx+Math.cos(a)*size*(.16+burst*.7);ty=cy+Math.sin(a*1.13)*size*(.18+burst*.65);
        }
        const stiffness=t<.36?.055:t<.76?.14:.08;
        p.x+=(tx-p.x*width)*stiffness/width;p.y+=(ty-p.y*height)*stiffness/height;
        const x=p.x*width,y=p.y*height,alpha=t<.12?clamp(t/.12,0,1):t>.76?1-burst*.28:1;
        ctx.globalAlpha=alpha;ctx.fillStyle=p.hue>.72?"#b69cff":p.hue>.25?"#39dcff":"#b8faff";
        ctx.shadowColor=p.hue>.72?"#946aff":"#00cfff";ctx.shadowBlur=t>.32&&t<.77?10:5;
        ctx.beginPath();ctx.arc(x,y,p.size*(1+Math.sin(now*.004+p.seed)*.18),0,Math.PI*2);ctx.fill();
      }
      ctx.shadowBlur=0;ctx.globalAlpha=1;

      // A restrained plasma stroke sharpens the particle-formed S.
      if(t>.40&&t<.78){
        const alpha=clamp((t-.40)/.12,0,1)*(1-clamp((t-.70)/.08,0,1));
        ctx.save();ctx.beginPath();const p0=sPoint(0,cx,cy,size);ctx.moveTo(p0.x,p0.y);
        for(let i=1;i<=90;i++){const p=sPoint(i/90,cx,cy,size);ctx.lineTo(p.x,p.y);}
        const grad=ctx.createLinearGradient(cx-size*.3,cy-size*.4,cx+size*.3,cy+size*.4);
        grad.addColorStop(0,"rgba(0,239,255,"+(.85*alpha)+")");
        grad.addColorStop(.5,"rgba(135,116,255,"+(.9*alpha)+")");
        grad.addColorStop(1,"rgba(0,224,255,"+(.85*alpha)+")");
        ctx.strokeStyle=grad;ctx.lineWidth=2.1;ctx.shadowColor="#00dfff";ctx.shadowBlur=18;ctx.stroke();ctx.restore();
      }

      // Fine cosmic fractures flare behind the formed mark.
      if(t>.55&&t<.79){
        const a=clamp((t-.55)/.08,0,1)*(1-clamp((t-.72)/.07,0,1));
        for(let i=0;i<22;i++){
          const angle=i/22*Math.PI*2+.17,inner=size*.12,outer=size*(.35+.13*Math.sin(i*8.3));
          ctx.beginPath();ctx.moveTo(cx+Math.cos(angle)*inner,cy+Math.sin(angle)*inner);
          const bend=angle+.12*Math.sin(i*4.1);ctx.lineTo(cx+Math.cos(bend)*outer,cy+Math.sin(bend)*outer);
          ctx.strokeStyle=i%2?"rgba(0,220,255,"+(a*.30)+")":"rgba(151,106,255,"+(a*.34)+")";
          ctx.lineWidth=i%5===0?1.2:.55;ctx.stroke();
        }
      }

      // One controlled energy ring marks the transformation.
      if(t>.59&&t<.88){
        const q=clamp((t-.59)/.29,0,1);ctx.beginPath();ctx.arc(cx,cy,size*(.12+q*.68),0,Math.PI*2);
        ctx.strokeStyle="rgba(54,214,255,"+((1-q)*.38)+")";ctx.lineWidth=1.2;
        ctx.shadowColor="#00cfff";ctx.shadowBlur=16;ctx.stroke();ctx.shadowBlur=0;
      }

      if(t>.76){
        ctx.globalAlpha=clamp((t-.76)/.12,0,1)*.45;ctx.fillStyle="#75eaff";
        ctx.font="600 9px monospace";ctx.textAlign="center";ctx.fillText("SWARM INITIALIZING",cx,cy+size*.66);ctx.globalAlpha=1;
      }
      if(t<1)raf=requestAnimationFrame(draw);
      else beginSwarm();
    }

    function finishOverlay(){
      if(finished||disposed)return;finished=true;
      root.style.transition="opacity .65s ease";root.style.opacity="0";setTimeout(dispose,700);
    }

    function beginSwarm(){
      if(started||disposed)return;started=true;swarmStartedAt=performance.now();
      try{
        swarm.start();
        const host=swarm.app&&swarm.app.view&&swarm.app.view.host;
        if(host)host.style.setProperty("z-index","2147483646","important");
      }catch(err){
        console.error("[swarm-rebirth] unable to start original swarm",err);dispose();return;
      }
      const waitForEngine=()=>{
        if(disposed)return;
        const app=swarm.app;
        if(app&&app.engine&&app.engine.started){finishOverlay();return;}
        if(performance.now()-swarmStartedAt>30000){
          console.error("[swarm-rebirth] original swarm did not reach its running state");
          if(swarm.app)swarm.stop(false);dispose();return;
        }
        raf=requestAnimationFrame(waitForEngine);
      };
      raf=requestAnimationFrame(waitForEngine);
    }

    function dispose(){
      if(disposed)return;disposed=true;cancelAnimationFrame(raf);
      window.removeEventListener("resize",resize);window.removeEventListener("keydown",onKey,true);
      root.remove();if(active&&active.root===root)active=null;
    }

    function cancel(){
      if(disposed)return;cancelAnimationFrame(raf);
      if(swarm.app)swarm.stop(false);
      else if(typeof swarm.cancelPrimeSound==="function")swarm.cancelPrimeSound();
      dispose();
    }

    function onKey(e){
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();cancel();}
    }
    window.addEventListener("keydown",onKey,true);
    active={root,cancel};startAt=performance.now();
    ctx.fillStyle="#030611";ctx.fillRect(0,0,width,height);raf=requestAnimationFrame(draw);
  }

  window.__swarmRebirth={launch,get active(){return !!active;}};
})();