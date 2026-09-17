// Reference data used by NIRIKSHAN's prototype assurance modules.
// Material rates are from Maharashtra PWD State Schedule of Rates 2022-23,
// exclusive of GST. They are historical benchmark inputs, not live market prices.
export const maharashtraSsrMaterialRates = [
  { name:'Cement / PPC', match:['cement','ppc'], rate:6000, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'PSC', match:['psc'], rate:6385, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'GGBFS', match:['ggbfs'], rate:4300, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'TMT FE-500 reinforcement', match:['tmt','fe-500','reinforcement'], rate:61000, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'HCRM / CRS reinforcement', match:['hcrm','crs reinforcement'], rate:63755, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Structural Steel', match:['structural steel'], rate:62575, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Tubular Steel', match:['tubular steel'], rate:65720, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-30 packed', match:['bitumen vg-30 packed'], rate:59411, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-10 packed', match:['bitumen vg-10 packed'], rate:57913, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-40 bulk', match:['bitumen vg-40 bulk'], rate:52764, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-30 bulk', match:['bitumen vg-30 bulk'], rate:49862, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-10 bulk', match:['bitumen vg-10 bulk'], rate:49488, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen VG-40 packed', match:['bitumen vg-40 packed'], rate:64748, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'Bitumen emulsion', match:['bitumen emulsion'], rate:40000, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'CRMB-55', match:['crmb-55','crmb 55'], rate:54954, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
  { name:'CRMB-60', match:['crmb-60','crmb 60'], rate:55580, unit:'MT', source:'Maharashtra PWD SSR 2022-23, Material Rates' },
];

export const boqPrototypeLines = [
  { item:'Cement / PPC', quantity:12, unit:'MT', rate:7200 },
  { item:'TMT FE-500 reinforcement', quantity:2.4, unit:'MT', rate:69000 },
  { item:'Structural Steel', quantity:1.2, unit:'MT', rate:64500 },
  { item:'Bitumen VG-30 packed', quantity:1.8, unit:'MT', rate:61500 },
];

// Explicitly synthetic records used only to demonstrate the cross-scheme workflow.
// They are intentionally not presented as government transaction records.
export const convergencePrototypeRecords = [
  { scheme:'MGNREGA', reference:'DEMO-MGNREGA-001', description:'Construction of CC Road', amount:420000, status:'Prototype overlap candidate', reason:'Same/similar work description in demonstration scheme register.' },
  { scheme:'Khelo India', reference:'DEMO-KI-014', description:'Construction of playground and sports infrastructure', amount:850000, status:'Prototype overlap candidate', reason:'Demonstrates convergence review for durable sports infrastructure.' },
  { scheme:'State Rural Infrastructure', reference:'DEMO-STATE-022', description:'Construction of community hall', amount:650000, status:'Prototype overlap candidate', reason:'Demonstrates a second-source funding record requiring scope/location comparison.' },
];
