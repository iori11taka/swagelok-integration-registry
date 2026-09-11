(() => {
  'use strict';

  const data = window.CLASSIFICATION_DATA || { taxonomy: {}, profiles: [] };

  const normalize = (value = '') => String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

  const STOP = new Set('DE DEL LA EL LOS LAS Y E O U PARA POR CON SIN EN UN UNA UNO DOS TRES CUATRO CINCO SE SERIE ACERO INOX INOXIDABLE PULG PULGADA PULGADAS PSI PSIG BAR MAX MIN ENTRADA SALIDA IN OUT X A AL'.split(' '));
  const tokenize = text => normalize(text).split(' ').filter(t => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));

  const exactRules = [
    {
      name: 'Central semiautomática',
      test: t => /\bCENTRAL\b/.test(t) && /SEMIAUTOM|SEMI AUTOM/.test(t),
      result: ['CENTRAL DE GASES', 'CENTRAL SEMIAUTOMATICA', 'CENTRAL SEMIAUTOMATICA'], confidence: 99
    },
    {
      name: 'Central para dos botellas',
      test: t => /\bCENTRAL\b/.test(t) && /(DOS|2)\s*(BOT|BOTELLA|BOTELLAS|CIL|CILINDRO|CILINDROS)/.test(t),
      result: ['CENTRAL DE GASES', 'CENTRAL PARA DOS BOTELLAS', 'CENTRAL PARA DOS BOTELLAS'], confidence: 99
    },
    {
      name: 'Central para una botella',
      test: t => /\bCENTRAL\b/.test(t) && /(UNA|1)\s*(BOT|BOTELLA|BOTELLAS|CIL|CILINDRO|CILINDROS)/.test(t),
      result: ['CENTRAL DE GASES', 'CENTRAL PARA UNA BOTELLA', 'CENTRAL PARA UNA BOTELLA'], confidence: 99
    },
    {
      name: 'Central de gases',
      test: t => /\bCENTRAL(E?S)?\b/.test(t) && /(GAS|GASES|REGULADOR|CGA|BOTELLA|CILINDRO)/.test(t),
      result: ['CENTRAL DE GASES', 'CENTRAL PARA UNA BOTELLA', 'CENTRAL PARA UNA BOTELLA'], confidence: 87
    },
    {
      name: 'Punto de uso',
      test: t => /(PUNTO DE (USO|CONSUMO)|POINT OF USE)/.test(t),
      result: ['CENTRAL DE GASES', 'PUNTO DE USO', 'PUNTO DE USO'], confidence: 97
    },
    {
      name: 'Manguera ensamblada',
      test: t => /\b(MANGUERA|HOSE)\b/.test(t),
      result: ['ENSAMBLES SIMPLES', 'ENSAMBLES SIMPLES', 'MANGUERAS ENSAMBLADAS'], confidence: 94
    },
    {
      name: 'Cilindro de muestreo',
      test: t => /(CILINDRO|BOTELLA).*(MUESTRE|MUESTRA)|MUESTRE.*(CILINDRO|BOTELLA)/.test(t),
      result: ['CILINDROS DE MUESTREO', 'CILINDROS DE MUESTREO', 'CILINDROS DE MUESTREO'], confidence: 97
    },
    {
      name: 'Panel de muestreo de líquidos',
      test: t => /PANEL.*MUESTRE/.test(t) && /(LIQUID|AGUA|CONDENSADO)/.test(t),
      result: ['PANELES DE MUESTREO', 'PANEL DE MUESTREO LIQUIDOS', 'PANEL DE MUESTREO LIQUIDOS'], confidence: 96
    },
    {
      name: 'Panel de muestreo de gases',
      test: t => /PANEL.*MUESTRE/.test(t) && /(GAS|GASES|GASEOS)/.test(t),
      result: ['PANELES DE MUESTREO', 'PANEL DE MUESTREO GASES', 'PANEL DE MUESTREO GASES'], confidence: 96
    },
    {
      name: 'Sonda de toma de muestras',
      test: t => /(SONDA|PROBE).*(MUESTRE|MUESTRA)|MUESTRE.*(SONDA|PROBE)/.test(t),
      result: ['SUBSISTEMAS PREDISEÑADOS', 'SONDA DE TOMA DE MUESTRAS', 'SPM LOCAL'], confidence: 96
    },
    {
      name: 'Bloque distribuidor',
      test: t => /(BLOQUE|HEADER|MANIFOLD).*(DISTRIB|DISTRIBU)/.test(t),
      result: ['SUBSISTEMAS PREDISEÑADOS', 'BLOQUE DISTRIBUIDOR', 'FDH LOCAL'], confidence: 92
    },
    {
      name: 'Estación de preacondicionamiento',
      test: t => /(PREACONDICION|PRE ACONDICION)/.test(t),
      result: ['SUBSISTEMAS PREDISEÑADOS', 'ESTACION DE PREACONDICION', 'FSM LOCAL'], confidence: 97
    },
    {
      name: 'Visor de nivel',
      test: t => /(VISOR|INDICADOR).*(NIVEL)|NIVEL.*(VISOR|INDICADOR)/.test(t),
      result: ['VISORES DE NIVEL', 'VISORES DE NIVEL', 'VISORES DE NIVEL'], confidence: 96
    },
    {
      name: 'Banco de calibración',
      test: t => /BANCO.*CALIBR/.test(t),
      result: ['BANCO DE CALIBRACION', 'BANCO DE CALIBRACION', 'BANCO DE CALIBRACION'], confidence: 98
    },
    {
      name: 'Válvula actuada',
      test: t => /VALVULA/.test(t) && /(ACTUAD|NEUMATIC|LIMIT SWITCH|SOLENOIDE)/.test(t),
      result: ['VALVULAS ACTUADAS', 'VALVULAS ACTUADAS', 'VALVULAS ACTUADAS'], confidence: 92
    },
    {
      name: 'Panel neumático',
      test: t => /PANEL/.test(t) && /NEUMATIC/.test(t),
      result: ['PANELES NEUMATICOS', 'PANELES NEUMATICOS', 'PANELES NEUMATICOS'], confidence: 96
    },
    {
      name: 'Secador de humedad',
      test: t => /(SECADOR|DRYER).*(HUMEDAD|AIRE)|HUMEDAD.*SECADOR/.test(t),
      result: ['SISTEMA DE ACONDICIONAMIENTO DE AIRE', 'SECADOR DE HUMEDAD', 'SECADOR DE HUMEDAD'], confidence: 96
    },
    {
      name: 'Drenaje mecánico automático',
      test: t => /DRENAJE/.test(t) && /(MECANIC|AUTOMATIC)/.test(t),
      result: ['SISTEMA DE ACONDICIONAMIENTO DE AIRE', 'DRENAJE MECANICO AUTOMATICO', 'DRENAJE MECANICO AUTOMATICO'], confidence: 95
    },
    {
      name: 'Panel de regulación',
      test: t => /PANEL/.test(t) && /(REGULACION|REGULADOR|PRESION)/.test(t),
      result: ['PANEL DE REGULACIÓN', 'PANEL DE REGULACIÓN', 'PANEL DE REGULACIÓN'], confidence: 91
    }
  ];

  function learnedClassification(description) {
    const inputTokens = new Set(tokenize(description));
    if (!inputTokens.size) return null;
    let best = null;
    for (const profile of data.profiles || []) {
      let score = 0;
      let matched = 0;
      for (const [token, weight] of profile.keywords || []) {
        if (inputTokens.has(token)) { score += Number(weight); matched++; }
      }
      if (!matched) continue;
      // Small prior from historical frequency without allowing the biggest class to dominate.
      score += Math.log10((profile.count || 1) + 1) * 0.08;
      const normalizedScore = score / Math.sqrt(inputTokens.size);
      if (!best || normalizedScore > best.score) best = { profile, score: normalizedScore, matched };
    }
    if (!best) return null;
    const confidence = Math.max(55, Math.min(88, Math.round(55 + best.score * 16 + Math.min(best.matched, 4) * 2)));
    return {
      family: best.profile.family,
      subfamily: best.profile.subfamily,
      subsubfamily: best.profile.subsubfamily,
      confidence,
      source: 'histórico',
      reason: `Coincidencia con ${best.profile.count} registros históricos de la misma clasificación.`
    };
  }

  function classify(description) {
    const text = normalize(description);
    if (!text) return null;
    for (const rule of exactRules) {
      if (rule.test(text)) {
        const [family, subfamily, subsubfamily] = rule.result;
        return { family, subfamily, subsubfamily, confidence: rule.confidence, source: 'regla histórica', reason: rule.name };
      }
    }
    return learnedClassification(description);
  }

  window.ClassificationEngine = {
    classify,
    taxonomy: data.taxonomy || {},
    sourceRecords: data.sourceRecords || 0,
    labeledRecords: data.labeledRecords || 0
  };
})();
