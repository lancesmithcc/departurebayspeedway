// Artistic crowns on measured canopy peaks. Geometry is deterministic; species is
// deliberately not claimed from DSM height alone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const randomFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

export function surveyedTreeGeometry(kind) {
  const rand=randomFor(kind==='conifer'?341:812),wood=[],leaves=[];
  const trunk=new THREE.CylinderGeometry(.002,.013,.93,7,1);trunk.translate(0,.465,0);wood.push(trunk);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),q=new THREE.Quaternion();
  const branch=(x,y,z)=>{
    a.set(0,y-.06,0);b.set(x,y,z);direction.subVectors(b,a);const len=direction.length();
    const g=new THREE.CylinderGeometry(.0008,.003,len,4,1);q.setFromUnitVectors(up,direction.normalize());g.applyQuaternion(q);g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);wood.push(g);
  };
  for(let i=0;i<100;i++){
    const t=(i+.5)/100,angle=i*2.39996+rand()*.5;
    const y=kind==='conifer'?.27+t*.68:.45+t*.45;
    const radius=kind==='conifer'?.18*(1-t)*(.6+rand()*.4):Math.sqrt(Math.max(0,1-((y-.68)/.27)**2))*.19;
    const distance=radius*(.4+rand()*.6),x=Math.cos(angle)*distance,z=Math.sin(angle)*distance;
    if(i%8===0)branch(x,y,z);
    const width=(kind==='conifer'?.12:.15)*( .65+rand()*.55);
    for(let k=0;k<3;k++){
      const g=new THREE.PlaneGeometry(width,width*.78);
      g.rotateX((rand()-.5)*1.6+k*.65);g.rotateY(angle+k*Math.PI/3);g.translate(x,y,z);
      const colour=new THREE.Color().setRGB(.32+rand()*.13,.46+rand()*.17,.24+rand()*.10);
      const colours=new Float32Array(g.attributes.position.count*3);
      for(let v=0;v<g.attributes.position.count;v++)colour.toArray(colours,v*3);
      g.setAttribute('color',new THREE.BufferAttribute(colours,3));leaves.push(g);
    }
  }
  // Geometry top defines measured height, not the top of an invisible trunk.
  const woody=mergeGeometries(wood,false),foliage=mergeGeometries(leaves,false);
  woody.computeBoundingBox();foliage.computeBoundingBox();const height=Math.max(woody.boundingBox.max.y,foliage.boundingBox.max.y);
  for(const g of [woody,foliage]){g.scale(1/height,1/height,1/height);g.computeBoundingBox();g.computeBoundingSphere();}
  [...wood,...leaves].forEach(g=>g.dispose());return {wood:woody,foliage};
}

export function leafSprayTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const g=canvas.getContext('2d'),rand=randomFor(9451);
  g.lineCap='round';
  for(let branch=0;branch<11;branch++){
    const angle=-Math.PI*.92+branch*Math.PI*.084;
    const endX=128+Math.cos(angle)*105,endY=224+Math.sin(angle)*190;
    g.strokeStyle='#3c4930';g.lineWidth=2.2;g.beginPath();g.moveTo(128,242);g.quadraticCurveTo(120,endY+45,endX,endY);g.stroke();
    for(let j=1;j<16;j++){
      const t=j/16,x=128+(endX-128)*t,y=238+(endY-238)*t;
      for(const side of [-1,1]){
        const spread=(1-t*.6)*(9+rand()*10),xx=x+side*spread,yy=y-5-rand()*8;
        g.strokeStyle='#3b4b2f';g.lineWidth=.8;g.beginPath();g.moveTo(x,y);g.lineTo(xx,yy);g.stroke();
        g.save();g.translate(xx,yy);g.rotate(side*.7+(rand()-.5)*.7);
        g.fillStyle=['#567244','#63824a','#435f38','#78925a','#4c6b40'][Math.floor(rand()*5)];
        g.beginPath();g.ellipse(0,0,2.1+rand()*2,5+rand()*4,0,0,Math.PI*2);g.fill();g.restore();
      }
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
