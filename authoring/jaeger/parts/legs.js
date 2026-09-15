async function buildLegs(c){
  const {pelvis,mat,H,D}=c;const {part,box,cyl,ring,shell,plate,bolt,pivot}=H;
  for(const s of [-1,1]){
    const n=s===1?'R':'L';
    const hip=pivot('Hip_'+n,[0,0,s*.69],pelvis);
    cyl('HipBearing_'+n,.26,.61,mat.dark,hip,[0,0,0]);
    cyl('HipBearingInset_'+n,.194,.64,mat.steel,hip,[0,0,0]);
    await box('FemurCore_'+n,[.37,1.41,.38],mat.dark,hip,[0,-.90,0],.07);
    part('ThighArmor_'+n,shell([[-1.53,.24,.29],[-1.41,.33,.38],[-.64,.39,.43],[-.27,.32,.39],[-.19,.21,.26]],.65),mat.armor,hip);
    // Front face clears the curved armor bulge; inset retains its separation.
    part('ThighFrontPanel_'+n,plate([[-.27,-.21],[-.26,.20],[-.65,.29],[-1.34,.19],[-1.46,0],[-1.30,-.19],[-.65,-.29]],.07,.020),mat.panel,hip,[.375,0,0]);
    part('ThighInset_'+n,plate([[-.37,-.095],[-.40,.15],[-.65,.18],[-.76,.02],[-.67,-.12]],.036,.008),mat.armor,hip,[.434,0,0]);
    cyl('ThighOuterDisk_'+n,.106,.052,mat.edge,hip,[.02,-.43,s*.42]);
    cyl('ThighOuterDiskInset_'+n,.075,.059,mat.steel,hip,[.02,-.43,s*.43]);
    for(const z of [-.25,.25]){
      cyl('HamstringRod_'+n+z,.049,1.01,mat.steel,hip,[-.19,-1.02,z],'y');
      cyl('HamstringSleeve_'+n+z,.073,.26,mat.edge,hip,[-.19,-.83,z],'y');
    }
    const knee=pivot('Knee_'+n,[0,-D.thigh,0],hip);
    cyl('KneeAxle_'+n,.237,.67,mat.dark,knee,[0,0,0]);
    for(const z of [-.345,.345]){
      cyl('KneeCover_'+n+z,.201,.056,mat.steel,knee,[0,0,z]);
      cyl('KneeInset_'+n+z,.145,.063,mat.edge,knee,[0,0,z]);
      ring('KneeSeal_'+n+z,.173,.014,mat.dark,knee,[0,0,z+(z>0?.035:-.035)]);
    }
    part('Patella_'+n,plate([[.13,-.19],[.20,0],[.13,.19],[-.21,.17],[-.38,0],[-.21,-.17]],.22,.037),mat.armor,knee,[.26,0,0]);
    part('KneeHighlight_'+n,plate([[.10,-.095],[.14,0],[.10,.095],[-.19,0]],.035,.008),mat.panel,knee,[.386,0,0]);
    await box('TibiaCore_'+n,[.28,1.42,.28],mat.dark,knee,[-.04,-.91,0],.064);
    part('ShinArmor_'+n,shell([[-1.56,.17,.20,.04],[-1.40,.23,.26,.05],[-.64,.33,.32,.07],[-.30,.34,.32,.035],[-.22,.20,.23]],.68),mat.armor,knee);
    part('ShinFrontPlate_'+n,plate([[-.27,-.21],[-.33,.22],[-.64,.25],[-1.46,.12],[-1.57,0],[-1.38,-.11],[-.64,-.25]],.105,.027),mat.panel,knee,[.364,0,0]);
    part('ShinCenterRidge_'+n,plate([[-.31,-.025],[-.36,.035],[-1.48,.025],[-1.52,-.017]],.036,.007),mat.armor,knee,[.444,0,0]);
    for(const z of [-.20,.20]){
      cyl('CalfPiston_'+n+z,.045,1.12,mat.steel,knee,[-.245,-.94,z],'y');
      cyl('CalfPistonSleeve_'+n+z,.068,.46,mat.edge,knee,[-.245,-.61,z],'y');
    }
    const ankle=pivot('Ankle_'+n,[0,-D.shin,0],knee);
    cyl('AnkleAxle_'+n,.204,.56,mat.dark,ankle,[0,0,0]);
    for(const z of [-.30,.30]){
      cyl('AnkleBearing_'+n+z,.169,.055,mat.steel,ankle,[0,0,z]);
      cyl('AnkleBearingInset_'+n+z,.111,.062,mat.edge,ankle,[0,0,z]);
    }
    // Sole is exactly Y=-.68 in ankle space; all forward locomotion is +X.
    await box('HeelSole_'+n,[.56,.13,.61],mat.dark,ankle,[-.19,-.615,0],.035);
    await box('HeelArmor_'+n,[.55,.32,.62],mat.armor,ankle,[-.21,-.38,0],.074);
    await box('FootBridge_'+n,[.69,.20,.59],mat.edge,ankle,[.27,-.48,0],.045);
    const boot=shell([[-.56,.57,.31,.21],[-.44,.55,.32,.19],[-.25,.40,.29,.05],[-.12,.23,.21,-.05]],.61);
    part('FootInstep_'+n,boot,mat.armor,ankle);
    part('InstepPlate_'+n,plate([[-.18,-.14],[-.16,.14],[-.45,.245],[-.52,.17],[-.49,-.17]],.075,.016),mat.panel,ankle,[.54,0,0],[0,0,18]);
    const toe=pivot('Toe_'+n,[.65,-.40,0],ankle);
    for(let i=0;i<3;i++){
      const z=(i-1)*.209;
      await box('ToeSole_'+n+i,[.40,.105,.192],mat.dark,toe,[.015,-.2275,z],.022);
      await box('ToeArmor_'+n+i,[.41,.23,.19],mat.armor,toe,[.015,-.082,z],.037);
      await box('ToeTip_'+n+i,[.03,.14,.14],mat.panel,toe,[.224,-.10,z],.009);
    }
    pivot('FootContact_'+n,[.16,-.68,0],ankle);
    pivot('HeelContact_'+n,[-.43,-.68,0],ankle);
    pivot('ToeContact_'+n,[.90,-.68,0],ankle);
  }
}
