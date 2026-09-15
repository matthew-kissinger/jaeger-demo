async function buildBody(c){
  const {pelvis,torso,mat,H}=c;const {part,box,cyl,ring,shell,plate,bolt,pivot}=H;
  // Pelvis and abdominal structure are intentionally narrower than the chest.
  part('PelvisCore',shell([[-.24,.34,.55],[-.15,.47,.80],[.21,.46,.83],[.40,.31,.60]],.7),mat.dark,pelvis);
  part('PelvisBelt',shell([[.20,.45,.79],[.26,.48,.85],[.42,.36,.70],[.46,.30,.57]],.63),mat.armor,pelvis);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    part('HipArmor_'+n,plate([[.24,.15*s],[.26,.77*s],[-.05,.98*s],[-.44,.69*s],[-.25,.34*s]],.14),mat.armor,pelvis,[.42,0,0]);
    part('HipArmorInset_'+n,plate([[.14,.40*s],[.11,.65*s],[-.17,.76*s],[-.19,.49*s]],.045,.010),mat.panel,pelvis,[.505,0,0]);
    cyl('HipRotor_'+n,.25,.19,mat.steel,pelvis,[0,-.04,s*.72]);
    ring('HipSeal_'+n,.23,.034,mat.dark,pelvis,[0,-.04,s*.83]);
  }
  part('PelvisCentralGuard',plate([[.23,-.24],[.34,0],[.23,.24],[-.35,.19],[-.56,0],[-.35,-.19]],.18),mat.panel,pelvis,[.50,0,0]);
  part('PelvisGuardInset',plate([[.13,-.13],[.18,.1],[-.33,.09],[-.40,0],[-.25,-.10]],.038,.007),mat.armor,pelvis,[.61,0,0]);
  // Abdomen: armored annular vertebrae around the rotary waist.
  cyl('WaistBearing',.43,.65,mat.dark,pelvis,[0,.67,0],'y');
  for(let i=0;i<4;i++){
    part('AbdominalRing'+i,shell([[.43+i*.145,.39,.52],[.47+i*.145,.44,.56],[.54+i*.145,.44,.56],[.57+i*.145,.39,.52]],.73),i%2?mat.edge:mat.dark,pelvis);
    for(const s of [-1,1])await box('AbdominalRib'+i+s,[.09,.10,.18],mat.steel,pelvis,[.411,.505+i*.145,s*.33],.019);
  }
  for(const s of [-1,1]){
    cyl('LumbarPiston'+s,.067,.68,mat.steel,pelvis,[-.27,.69,s*.42],'y');
    cyl('LumbarSleeve'+s,.092,.24,mat.edge,pelvis,[-.27,.64,s*.42],'y');
  }
  // Torso follows the reference's broad clavicles and V-shaped lower chest.
  // Keep the internal frame inside the armor envelope instead of crossing the rear/flank seam.
  part('ThoraxInnerFrame',shell([[.19,.20,.36],[.40,.24,.59],[.94,.32,.82],[1.46,.29,.86],[1.65,.17,.57]],.64),mat.dark,torso);
  part('ThoraxRearShell',shell([[.38,.43,.71,-.12],[.67,.50,1.01,-.10],[1.40,.43,1.10,-.08],[1.73,.26,.77,-.09]],.65),mat.armor,torso);
  part('LowerThoraxArmor',shell([[.18,.25,.48,.09],[.28,.34,.65,.09],[.49,.43,.86,.09],[.78,.47,.98,.075],[1.01,.44,1.03,.035]],.64),mat.armor,torso);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    const chest=plate([[1.77,.014*s],[1.69,.93*s],[1.34,1.21*s],[.93,1.09*s],[.54,.30*s],[.79,.055*s]],.18,.034);
    const p=chest.attributes.position;
    for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)+.085*Math.sin((p.getY(i)-.40)*2.0)-.12*Math.abs(p.getZ(i)));
    chest.computeVertexNormals();
    part('ChestArmor_'+n,s===-1?mapChestPaint(chest):chest,s===-1?mat.markedArmor:mat.armor,torso,[.55,0,0]);
    part('ClavicleTrim_'+n,plate([[1.76,.14*s],[1.72,.78*s],[1.56,.95*s],[1.55,.78*s],[1.62,.17*s]],.045,.009),mat.panel,torso,[.612,0,0]);
    // Deep red vent recesses follow the downward V of the breastplate.
    const vent=pivot('ChestVent_'+n,[.575,.90,s*.73],torso);vent.rotation.x=s*.39;
    await box('VentHousing_'+n,[.12,.19,.72],mat.edge,vent,[0,0,0],.035);
    await box('VentVoid_'+n,[.022,.116,.60],mat.dark,vent,[.072,0,0],.010);
    for(let i=0;i<7;i++)await box('VentSlat_'+n+i,[.032,.092,.031],mat.red,vent,[.092,0,-.254+i*.084],.010,[0,0,-8]);
    for(const yz of [[1.48,.75],[1.06,1.01]])bolt('ChestFastener_'+n+yz[0],torso,[.535,yz[0],s*yz[1]],'x',.024);
    part('LateralThorax_'+n,shell([[.46,.29,.17],[.58,.36,.22],[1.14,.33,.26],[1.33,.20,.19]],.6),mat.edge,torso,[-.03,0,s*1.0]);
    cyl('ShoulderSocket_'+n,.31,.40,mat.dark,torso,[0,1.63,s*1.25]);
    ring('ShoulderSocketSeal_'+n,.29,.025,mat.steel,torso,[0,1.63,s*1.44]);
  }
  // Concentric reactor with a real recessed center, outer ring and separate rim.
  cyl('ReactorBlackHousing',.405,.17,mat.dark,torso,[.69,.71,0],'x');
  cyl('ReactorBezel',.365,.09,mat.ivory,torso,[.798,.71,0],'x');
  cyl('ReactorInnerRecess',.245,.096,mat.edge,torso,[.82,.71,0],'x');
  ring('ReactorOuterRing',.340,.030,mat.steel,torso,[.858,.71,0],'x');
  ring('ReactorInnerRing',.229,.026,mat.ivory,torso,[.877,.71,0],'x');
  cyl('ReactorGlass',.190,.025,mat.cyan,torso,[.883,.71,0],'x');
  cyl('ReactorCore',.108,.031,mat.ivory,torso,[.900,.71,0],'x');
  for(let i=0;i<3;i++){
    const a=i*2*Math.PI/3;
    bolt('ReactorBolt'+i,torso,[.864,.71+Math.cos(a)*.296,Math.sin(a)*.296],'x',.027);
  }
  // Compact protected neck and helmet, with swept brow and a gold face window.
  cyl('NeckBearing',.24,.35,mat.steel,torso,[0,1.90,0],'y');
  ring('NeckSeal',.25,.041,mat.dark,torso,[0,1.86,0],'y');
  for(const s of [-1,1])part('Collar_'+s,plate([[1.57,.32*s],[1.80,.40*s],[1.81,.61*s],[1.56,.67*s]],.29),mat.panel,torso,[.02,0,0]);
  const head=pivot('Head',[0,1.94,0],torso);
  part('HelmetShell',shell([[.02,.20,.24],[.14,.30,.31],[.42,.36,.38],[.65,.29,.34],[.80,.16,.21],[.845,.035,.08]],.76),mat.armor,head,[-.005,0,0]);
  part('HelmetFaceRecess',plate([[.60,-.25],[.68,0],[.60,.25],[.23,.19],[.075,0],[.23,-.19]],.075,.014),mat.dark,head,[.325,0,0]);
  part('GoldenVisor',plate([[.55,-.215],[.60,0],[.55,.215],[.25,.151],[.15,0],[.25,-.151]],.045,.010),mat.yellow,head,[.371,0,0]);
  part('HelmetBrow',plate([[.70,-.29],[.76,0],[.70,.29],[.52,.21],[.435,0],[.52,-.21]],.10,.020),mat.panel,head,[.410,0,0]);
  part('HelmetBrowSpine',plate([[.72,-.028],[.795,0],[.72,.028],[.48,0]],.031,.006),mat.armor,head,[.470,0,0]);
  part('HelmetJawGuard',plate([[.235,-.14],[.17,0],[.235,.14],[.05,.11],[-.025,0],[.05,-.11]],.083,.018),mat.panel,head,[.38,0,0]);
  for(const s of [-1,1]){
    cyl('HelmetEar_'+s,.13,.09,mat.edge,head,[-.05,.40,s*.36]);
    cyl('HelmetEarCover_'+s,.091,.096,mat.panel,head,[-.05,.40,s*.37]);
    part('HelmetCheek_'+s,plate([[.41,.22*s],[.34,.32*s],[.13,.24*s],[.03,.08*s],[.18,.15*s]],.087,.012),mat.armor,head,[.29,0,0]);
  }
  // Backpack, vented fins and two articulated booster nozzles.
  const backpack=pivot('Backpack',[-.60,1.0,0],torso);
  await box('BackpackFrame',[.42,1.32,1.26],mat.edge,backpack,[-.16,0,0],.11);
  await box('BackpackCentralArmor',[.11,1.18,.45],mat.armor,backpack,[-.42,.10,0],.05);
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    await box('BackpackSideArmor_'+n,[.22,1.02,.40],mat.armor,backpack,[-.32,.02,s*.48],.065);
    for(let i=0;i<5;i++)await box('BackVent_'+n+i,[.030,.038,.25],mat.dark,backpack,[-.448,.31-i*.10,s*.48],.009);
    const fin=pivot('DorsalFin_'+n,[.02,.70,s*.48],backpack);fin.rotation.z=.10;
    part('DorsalFinArmor_'+n,plate([[0,-.16],[1.13,-.105],[1.27,.03],[1.15,.13],[0,.18]],.12,.023),mat.armor,fin);
    for(let i=0;i<6;i++)await box('DorsalFinVent_'+n+i,[.128,.06,.065],mat.dark,fin,[0,.20+i*.13,0],.014);
    const thruster=pivot('Thruster_'+n,[-.38,-.40,s*.43],backpack);thruster.rotation.z=-.25;
    part('ThrusterHousing_'+n,cylinderGeo(.23,.30,.58,48),mat.armor,thruster,[0,0,0],[-0,0,90]);
    // Adjacent bands replace the shield surface; no coplanar overlay sheets.
    cyl('ThrusterHeatShield_'+n,.277,.12,mat.edge,thruster,[-.26,0,0],'x');
    cyl('ThrusterHeatBlue_'+n,.277,.05,mat.heatBlue,thruster,[-.345,0,0],'x');
    cyl('ThrusterHeatWarm_'+n,.277,.05,mat.heatWarm,thruster,[-.395,0,0],'x');
    ring('ThrusterRim_'+n,.249,.030,mat.steel,thruster,[-.431,0,0],'x');
    cyl('ThrusterNozzleDark_'+n,.221,.018,mat.dark,thruster,[-.435,0,0],'x');
    ring('ThrusterInnerRing_'+n,.147,.020,mat.bladeMetal,thruster,[-.448,0,0],'x');
    cyl('ThrusterCore_'+n,.104,.013,mat.dark,thruster,[-.455,0,0],'x');
    pivot('ThrusterSocket_'+n,[-.49,0,0],thruster);
  }
}
