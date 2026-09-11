window.ITEM_MASTER_HIERARCHY = [
  {
    code: "A",
    name: "Training",
    groups: [
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "B",
    name: "On-Site Services",
    groups: [
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "C",
    name: "Service Other",
    groups: [
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "D",
    name: "Application Solution",
    groups: [
      {
        code: "DA",
        name: "PRESS",
        series: [
          { code: "DA1", name: "FLM (Fast Loop Module)" },
          { code: "DA2", name: "FSM (Field Station Module)" },
          { code: "DA3", name: "FDH (Fluid Distribution Header)" },
          { code: "DA4", name: "SPR (Retractable Probe)" },
          { code: "DA5", name: "SPW (Welded Probe)" },
          { code: "DA6", name: "SPV (Sample Probe Valve)" },
          { code: "DA7", name: "CSM (Calibration and Switching Module)" },
          { code: "DA8", name: "LPH (Low Pressure Header)" },
          { code: "DA9", name: "Other" },
          { code: "XXX", name: "N/A" }
        ]
      },
      {
        code: "DB",
        name: "Gas Distribution",
        series: [
          { code: "DB1", name: "SSI (Source Inlet Panel)" },
          { code: "DB2", name: "SCO (Changeover Panel)" },
          { code: "DB3", name: "SGP (Gas Panel)" },
          { code: "DB4", name: "SPU (Point of Use Panel)" },
          { code: "DB5", name: "Other" },
          { code: "XXX", name: "N/A" }
        ]
      },
      {
        code: "DC",
        name: "Sampling",
        series: [
          { code: "DC1", name: "GSM (Grab Sample Module)" },
          { code: "DC2", name: "GSL (Grab Sample Liquid)" },
          { code: "DC3", name: "GSC (Grab Sample Cylinder)" },
          { code: "DC4", name: "Ammonia Sampler" },
          { code: "DC5", name: "Other" },
          { code: "XXX", name: "N/A" }
        ]
      },
      {
        code: "DD",
        name: "Seal Support",
        series: [
          { code: "DD1", name: "Flush Plan" },
          { code: "DD2", name: "Gas Plan" },
          { code: "DD3", name: "Seal Pot" },
          { code: "DD4", name: "Other" },
          { code: "XXX", name: "N/A" }
        ]
      },
      {
        code: "DE",
        name: "Thermal Loop",
        series: [
          { code: "DE1", name: "Assemblies: Hose + Other Comp." },
          { code: "DE2", name: "Other (Kits, Accessories, etc.)" },
          { code: "XXX", name: "N/A" }
        ]
      },
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "E",
    name: "Custom Solutions",
    groups: [
      {
        code: "EA",
        name: "Custom Solutions",
        series: [
          { code: "EA1", name: "Basic Assembly" },
          { code: "EA2", name: "System Assembly" },
          { code: "XXX", name: "N/A" }
        ]
      },
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "F",
    name: "Local Product Configuration",
    groups: [
      { code: "FA", name: "Kitted Items", series: [
        { code: "FA1", name: "General" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FB", name: "Product Reconfiguration", series: [
        { code: "FB1", name: "Valve Handle Modification" },
        { code: "FB2", name: "O-Ring Change Out" },
        { code: "FB3", name: "Check Valve Setting" },
        { code: "FB4", name: "Relief Valve Setting" },
        { code: "FB5", name: "Fittings" },
        { code: "FB6", name: "Automated Ball Valve Assembly" },
        { code: "FB7", name: "Other" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FC", name: "Conversion (to a customer PN)", series: [
        { code: "FC1", name: "General" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FD", name: "Accessories", series: [
        { code: "FD1", name: "Tagging" },
        { code: "FD2", name: "Tube Fitting Stop Collar" },
        { code: "FD3", name: "Filling Gauge" },
        { code: "FD4", name: "Other" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FE", name: "Hose", series: [
        { code: "FE1", name: "Hose Assembly" },
        { code: "FE2", name: "Insulated Hose Assembly" },
        { code: "FE3", name: "Other" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FF", name: "Tubing", series: [
        { code: "FF1", name: "Tube Bending" },
        { code: "FF2", name: "Cut Lengths" },
        { code: "FF3", name: "Other" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "FG", name: "Other", series: [
        { code: "FG1", name: "Other" },
        { code: "XXX", name: "N/A" }
      ]},
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  },
  {
    code: "X",
    name: "N/A",
    groups: [
      { code: "XX", name: "N/A", series: [{ code: "XXX", name: "N/A" }] }
    ]
  }
];
