import {Random,mixSeed,randomIsometry,randomPureState,frameProbabilities,sampleFrequencies,fitReadout,predictionMetrics,toCSV} from '../src/index.js';
import {drawLineChart,downloadText} from '../src/browser.js';
const $=id=>document.getElementById(id), shotCounts=[10,20,50,100,200,500,1000], trials=80; let rows=[];
function inputs(){ $('training-value').textContent=$('training').value; $('ridge-value').textContent=(10**Number($('ridge').value)).toPrecision(2); }
for(const id of ['training','ridge']) $(id).addEventListener('input',inputs); inputs();
function blochZ(psi){return psi.re[0]**2+psi.im[0]**2-psi.re[1]**2-psi.im[1]**2;}
function draw(){drawLineChart($('chart'),[{color:'#2254d5',points:rows.map(r=>[Math.log10(r.shots),r.mse])}],{xLabel:'log₁₀ shots',yLabel:'MSE',yRange:[0,Math.max(.001,...rows.map(r=>r.mse))*1.1]});}
async function run(){
  const seed=Number($('seed').value), count=Number($('training').value), lambda=10**Number($('ridge').value);
  if(!Number.isSafeInteger(seed)||seed<0){$('status').textContent='Enter a nonnegative integer seed.';return;}
  $('run').disabled=true; $('export').disabled=true; rows=[]; $('data').textContent='';
  try {
    const modelRng=new Random(mixSeed(seed,0)), frame=randomIsometry(6,2,modelRng), states=Array.from({length:count+1},()=>randomPureState(2,modelRng));
    const probs=states.map(s=>frameProbabilities(frame,s)), labels=states.map(blochZ), truth=labels[count];
    for(const shots of shotCounts){
      $('status').textContent=`Running ${shots} shots…`; await new Promise(resolve=>setTimeout(resolve,0)); const predictions=[];
      for(let k=0;k<trials;k++){
        const rng=new Random(mixSeed(seed,shots,k)); const X=probs.slice(0,count).map(p=>sampleFrequencies(p,shots,rng));
        const fit=fitReadout(X,labels.slice(0,count),{lambda}); predictions.push(fit.predict(sampleFrequencies(probs[count],shots,rng)));
      }
      rows.push({shots,...predictionMetrics(predictions,truth)}); draw();
    }
    $('status').textContent=`Done · true z = ${truth.toFixed(3)}`;
    $('data').textContent=rows.map(r=>`${r.shots} shots: ${r.mse.toFixed(4)}`).join('  ·  ');
  }catch(e){$('status').textContent=`Error: ${e.message}`;} finally{$('run').disabled=false;$('export').disabled=rows.length===0;}
}
$('run').addEventListener('click',run);$('export').addEventListener('click',()=>downloadText(toCSV(rows,['shots','mean','bias','biasSquared','variance','mse']),'qelm-results.csv','text/csv;charset=utf-8'));
window.addEventListener('resize',()=>{if(rows.length)draw();}); run();
