const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const progress=document.querySelector('.progress');let queued=false;
function update(){queued=false;const range=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${range>0?scrollY/range:0})`;}
addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});addEventListener('resize',update);update();
if(!reduced&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target);}},{threshold:.15});document.querySelectorAll('.picture').forEach(el=>observer.observe(el));}
