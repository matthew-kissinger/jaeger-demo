// Complete Jaeger, authored entirely in Kiln from reference/approved-mech.png.
// +X forward, +Y up, +Z right. Metres. No fixture, environment or external model.
const meta={name:'Jaeger - slate guardian',category:'character',role:'prop'};
const D={hipY:4.25,thigh:1.85,shin:1.72,ankleY:0.68,torsoY:0.78,shoulderY:1.63,shoulderZ:1.48,upper:1.28,fore:1.42};

function makeHelpers(mat){
  const uvCopies=new Map();
  function surfaceUV(geometry){
    if(geometry.attributes.uv)return geometry;
    if(uvCopies.has(geometry))return uvCopies.get(geometry);
    const p=geometry.attributes.position,n=geometry.attributes.normal,ix=geometry.index;
    const count=ix?ix.count:p.count,positions=[],normals=[],uvs=[];
    // Split only UV-less geometry at triangle boundaries. Per-face box projection
    // gives tiled detail on each orientation while preserving smooth normals.
    for(let t=0;t<count;t+=3){
      const ids=[0,1,2].map(k=>ix?ix.getX(t+k):t+k);
      const a=ids[0],b=ids[1],d=ids[2];
      const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a);
      const vx=p.getX(d)-p.getX(a),vy=p.getY(d)-p.getY(a),vz=p.getZ(d)-p.getZ(a);
      const ax=Math.abs(uy*vz-uz*vy),ay=Math.abs(uz*vx-ux*vz),az=Math.abs(ux*vy-uy*vx);
      for(const i of ids){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);positions.push(x,y,z);
        if(n)normals.push(n.getX(i),n.getY(i),n.getZ(i));
        if(ax>=ay&&ax>=az)uvs.push(z*2,y*2);
        else if(ay>=az)uvs.push(x*2,z*2);
        else uvs.push(x*2,y*2);
      }
    }
    const mapped=meshGeo({positions,uvs,...(n?{normals}:{})});
    uvCopies.set(geometry,mapped);return mapped;
  }
  function part(name,geo,material,parent,position=[0,0,0],rotation=[0,0,0]){
    const textured=material.map||material.normalMap||material.roughnessMap||material.metalnessMap;
    return createPart(name,textured?surfaceUV(geo):geo,material,{parent,position,rotation});
  }
  async function box(name,size,material,parent,position=[0,0,0],radius=.025,rotation=[0,0,0]){
    return part(name,await roundedBoxGeo(...size,radius,{segments:4,smooth:true}),material,parent,position,rotation);
  }
  function cyl(name,radius,length,material,parent,position=[0,0,0],axis='z'){
    return part(name,cylinderGeo(radius,radius,length,40),material,parent,position,axis==='x'?[0,0,90]:axis==='z'?[90,0,0]:[0,0,0]);
  }
  function ring(name,radius,tube,material,parent,position=[0,0,0],axis='z'){
    return part(name,torusGeo(radius,tube,8,48),material,parent,position,axis==='x'?[0,90,0]:axis==='y'?[90,0,0]:[0,0,0]);
  }
  function shell(stations,power=.68,segments=48){
    return loftProfiles(stations.map(([y,rx,rz,cx=0,cz=0])=>({profile:Array.from({length:segments},(_,i)=>{
      const a=i*2*Math.PI/segments,c=Math.cos(a),s=Math.sin(a);
      return [cx+rx*Math.sign(c)*Math.pow(Math.abs(c),power),cz+rz*Math.sign(s)*Math.pow(Math.abs(s),power)];
    }),frame:{origin:[0,y,0]}})));
  }
  function plate(points,thickness,bevel=.018){
    const cy=points.reduce((s,p)=>s+p[0],0)/points.length,cz=points.reduce((s,p)=>s+p[1],0)/points.length;
    const pos=[],idx=[],n=points.length;
    for(const [x,s] of [[-thickness/2,.94],[-thickness/2+bevel,1],[thickness/2-bevel,1],[thickness/2,.94]])
      for(const [y,z] of points)pos.push(x,cy+(y-cy)*s,cz+(z-cz)*s);
    for(let k=0;k<3;k++)for(let j=0;j<n;j++){
      const a=k*n+j,b=k*n+(j+1)%n,c=(k+1)*n+(j+1)%n,d=(k+1)*n+j;idx.push(a,b,d,b,c,d);
    }
    for(let j=1;j<n-1;j++){idx.push(0,j+1,j);idx.push(3*n,3*n+j,3*n+j+1);}
    let area=0;for(let j=0;j<n;j++)area+=points[j][0]*points[(j+1)%n][1]-points[(j+1)%n][0]*points[j][1];
    if(area<0)for(let j=0;j<idx.length;j+=3){const v=idx[j+1];idx[j+1]=idx[j+2];idx[j+2]=v;}
    // Textured parts receive face-aware UVs in part(), including their sidewalls.
    return meshGeo({positions:pos,indices:idx});
  }
  function bolt(name,parent,pos,axis='x',r=.034){
    const geo=copyGeometry(cylinderGeo(r,r,.015,40));
    const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
    const exposedSign=axis==='x'?-1:1;
    for(let i=0;i<p.count;i++)if(n.getY(i)*exposedSign<.99)uv.setXY(i,.02+uv.getX(i)*.05,.02+uv.getY(i)*.05);
    part(name,geo,mat.fastener,parent,pos,axis==='x'?[0,0,90]:axis==='z'?[90,0,0]:[0,0,0]);
  }
  function pivot(name,position,parent){return createPivot(name,position,parent);}
  return {part,box,cyl,ring,shell,plate,bolt,pivot};
}

async function build(){
  const root=createRoot('Jaeger');
  const mat=await buildMaterials();
  const H=makeHelpers(mat),motion=H.pivot('MotionRoot',[0,0,0],root);
  const pelvis=H.pivot('Pelvis',[0,D.hipY,0],motion);
  const torso=H.pivot('Torso',[0,D.torsoY,0],pelvis);
  const c={root,motion,pelvis,torso,mat,H,D};
  await buildBody(c);await buildLegs(c);await buildArms(c);
  root.userData.authoredWith='Kiln';root.userData.units='metres';root.userData.forward='+X';
  root.userData.reference='approved-mech.png';root.userData.assetStage='full-body-development';
  root.userData.rigType='rigid articulated hierarchy';
  root.userData.effectSockets=['MuzzleSocket_L','MuzzleSocket_R','BladeSocket_L','BladeSocket_R','ThrusterSocket_L','ThrusterSocket_R'];
  return root;
}
