(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const supabaseClient = (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY)
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;
  const classifier = window.ClassificationEngine;

  let records = [];
  let classificationTimer = null;
  let lastAutoClassification = null;
  const views = ['dashboard', 'records', 'new'];

  const $ = id => document.getElementById(id);

  function showView(name) {
    views.forEach(v => $(v + 'View').classList.toggle('active-view', v === name));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    $('pageTitle').textContent = name === 'new' ? 'Nueva integración' : name === 'records' ? 'Histórico de Integraciones' : 'Registro de Integraciones';
    if (name === 'new') prepareNextCode();
  }

  async function loadRecords() {
    if (!supabaseClient) {
      records = JSON.parse(localStorage.getItem('integration-demo-records') || '[]');
      renderAll();
      return;
    }
    const { data, error } = await supabaseClient
      .from('integrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return console.error(error);
    records = data || [];
    renderAll();
  }

  function renderAll() {
    renderDashboard();
    fillFilters();
    renderTable();
  }

  function renderDashboard() {
    const currentYear = new Date().getFullYear();
    $('kpiTotal').textContent = records.length;
    $('kpiYear').textContent = records.filter(r => Number(r.integration_year) === currentYear).length;
    $('kpiClients').textContent = new Set(records.map(r => (r.client || '').trim().toLowerCase()).filter(Boolean)).size;
    $('kpiIncomplete').textContent = records.filter(r => !r.client || !r.responsible || !r.family).length;
    $('recentList').innerHTML = records.slice(0, 8).map(r => `
      <div class="recent-item">
        <div class="code-pill">${escapeHtml(r.code)}</div>
        <div><strong>${escapeHtml(r.description || 'Sin descripción')}</strong><div class="muted">${escapeHtml(r.client || 'Cliente no definido')}</div></div>
        <div class="muted">${formatDate(r.created_at)}</div>
      </div>`).join('') || '<div class="muted">Aún no hay registros.</div>';
  }

  function fillFilters() {
    const years = [...new Set(records.map(r => r.integration_year).filter(Boolean))].sort((a,b) => b-a);
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const y = $('yearFilter').value, f = $('familyFilter').value;
    $('yearFilter').innerHTML = '<option value="">Todos los años</option>' + years.map(v => `<option value="${v}">${v}</option>`).join('');
    $('familyFilter').innerHTML = '<option value="">Todas las familias</option>' + families.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    $('yearFilter').value = y; $('familyFilter').value = f;
  }

  function renderTable() {
    const q = $('searchInput').value.trim().toLowerCase();
    const year = $('yearFilter').value;
    const family = $('familyFilter').value;
    const filtered = records.filter(r => {
      const bag = [r.code, r.description, r.client, r.responsible, r.family, r.subfamily, r.subsubfamily].join(' ').toLowerCase();
      return (!q || bag.includes(q)) && (!year || String(r.integration_year) === year) && (!family || r.family === family);
    });
    $('recordsBody').innerHTML = filtered.map(r => `<tr>
      <td><span class="code-pill">${escapeHtml(r.code)}</span></td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${escapeHtml(r.client || '—')}</td>
      <td>${escapeHtml(r.responsible || '—')}</td>
      <td>${escapeHtml(r.family || '—')}</td>
      <td>${formatDate(r.created_at)}</td>
    </tr>`).join('');
  }

  async function prepareNextCode() {
    if (!supabaseClient) {
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const nums = records.filter(r => Number(r.integration_year) === year).map(r => Number(r.sequence_number || 0));
      const next = (Math.max(0, ...nums) + 1).toString().padStart(3, '0');
      $('code').value = `INT_${next}-${yy}`;
      return;
    }
    const { data, error } = await supabaseClient.rpc('preview_next_integration_code');
    $('code').value = error ? 'Se asignará al guardar' : data;
  }

  function option(value, selected = false) {
    return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(value)}</option>`;
  }

  function populateFamilies(selected = '') {
    if (!classifier) return;
    const families = Object.keys(classifier.taxonomy || {}).sort();
    $('family').innerHTML = '<option value="">Seleccionar familia</option>' + families.map(v => option(v, v === selected)).join('');
    populateSubfamilies(selected, '');
  }

  function populateSubfamilies(family, selected = '') {
    const subs = classifier?.taxonomy?.[family] ? Object.keys(classifier.taxonomy[family]).sort() : [];
    $('subfamily').innerHTML = '<option value="">Seleccionar subfamilia</option>' + subs.map(v => option(v, v === selected)).join('');
    populateSubsubfamilies(family, selected, '');
  }

  function populateSubsubfamilies(family, subfamily, selected = '') {
    const values = classifier?.taxonomy?.[family]?.[subfamily] || [];
    $('subsubfamily').innerHTML = '<option value="">Seleccionar sub-subfamilia</option>' + values.map(v => option(v, v === selected)).join('');
  }

  function applyClassification(result) {
    if (!result) {
      lastAutoClassification = null;
      updateClassificationUI(null);
      return;
    }
    lastAutoClassification = result;
    populateFamilies(result.family);
    populateSubfamilies(result.family, result.subfamily);
    populateSubsubfamilies(result.family, result.subfamily, result.subsubfamily);
    updateClassificationUI(result);
  }

  function updateClassificationUI(result) {
    const badge = $('classificationConfidence');
    const message = $('classificationMessage');
    if (!result) {
      badge.textContent = 'Sin sugerencia';
      badge.className = 'confidence-badge neutral';
      message.textContent = 'No hay suficiente información todavía. Puedes seleccionar la clasificación manualmente.';
      return;
    }
    const level = result.confidence >= 90 ? 'high' : result.confidence >= 75 ? 'medium' : 'low';
    badge.textContent = `${result.confidence}% confianza`;
    badge.className = `confidence-badge ${level}`;
    message.innerHTML = `<strong>${escapeHtml(result.family)}</strong> → ${escapeHtml(result.subfamily)} → ${escapeHtml(result.subsubfamily)} <span class="classification-source">· ${escapeHtml(result.reason || result.source || '')}</span>`;
  }

  function runClassification() {
    const description = $('description').value.trim();
    if (!description) {
      updateClassificationUI(null);
      return;
    }
    applyClassification(classifier?.classify(description) || null);
  }

  function scheduleClassification() {
    clearTimeout(classificationTimer);
    classificationTimer = setTimeout(runClassification, 350);
  }

  async function createIntegration(payload) {
    if (!supabaseClient) {
      const year = new Date().getFullYear();
      const nums = records.filter(r => Number(r.integration_year) === year).map(r => Number(r.sequence_number || 0));
      const sequence = Math.max(0, ...nums) + 1;
      const item = { id: crypto.randomUUID(), code: `INT_${String(sequence).padStart(3,'0')}-${String(year).slice(-2)}`, integration_year: year, sequence_number: sequence, created_at: new Date().toISOString(), ...payload };
      records.unshift(item); localStorage.setItem('integration-demo-records', JSON.stringify(records)); return item;
    }
    const { data, error } = await supabaseClient.rpc('create_integration', { p_data: payload });
    if (error) throw error;
    return data;
  }

  $('integrationForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('formStatus').textContent = 'Guardando...';
    const payload = {
      description: $('description').value.trim(), client: $('client').value.trim(), responsible: $('responsible').value.trim(),
      family: $('family').value || null, subfamily: $('subfamily').value || null,
      subsubfamily: $('subsubfamily').value || null, notes: $('notes').value.trim() || null,
      classification_confidence: lastAutoClassification?.confidence || null,
      classification_source: lastAutoClassification?.source || null
    };
    try {
      const created = await createIntegration(payload);
      $('formStatus').textContent = `Guardado: ${created.code || created}`;
      e.target.reset();
      populateFamilies();
      updateClassificationUI(null);
      lastAutoClassification = null;
      await loadRecords();
      await prepareNextCode();
    } catch (err) {
      console.error(err);
      $('formStatus').textContent = 'No se pudo guardar. Revisa Supabase y la consola.';
    }
  });

  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $('heroNewButton').addEventListener('click', () => showView('new'));
  $('newFromRecords').addEventListener('click', () => showView('new'));
  $('refreshButton').addEventListener('click', loadRecords);
  ['searchInput','yearFilter','familyFilter'].forEach(id => $(id).addEventListener('input', renderTable));

  $('description').addEventListener('input', scheduleClassification);
  $('description').addEventListener('blur', runClassification);
  $('classifyButton').addEventListener('click', runClassification);
  $('family').addEventListener('change', () => {
    populateSubfamilies($('family').value, '');
    lastAutoClassification = null;
    $('classificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });
  $('subfamily').addEventListener('change', () => {
    populateSubsubfamilies($('family').value, $('subfamily').value, '');
    lastAutoClassification = null;
    $('classificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });
  $('subsubfamily').addEventListener('change', () => { lastAutoClassification = null; $('classificationMessage').textContent = 'Clasificación ajustada manualmente.'; });

  function escapeHtml(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function formatDate(v) { if (!v) return '—'; return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); }

  populateFamilies();
  loadRecords();
})();
