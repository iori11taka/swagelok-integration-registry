(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const supabaseUrl = cfg.supabaseUrl || cfg.SUPABASE_URL || '';
  const supabaseKey = cfg.supabaseAnonKey || cfg.SUPABASE_ANON_KEY || '';
  const hasSupabaseConfig = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && !!supabaseKey && !/YOUR_|AQUI_/i.test(supabaseKey);
  const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const classifier = window.ClassificationEngine;
  let records = [];
  let classificationTimer = null;
  let lastAutoClassification = null;
  let currentSession = null;
  const views = ['dashboard', 'records', 'new'];
  const $ = id => document.getElementById(id);

  function showView(name) {
    views.forEach(v => $(v + 'View').classList.toggle('active-view', v === name));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    $('pageTitle').textContent = name === 'new' ? 'Nueva integración' : name === 'records' ? 'Histórico de Integraciones' : 'Registro de Integraciones';
    if (name === 'new') prepareNextCode();
  }

  function setAuthGate(open) {
    $('authGate').classList.toggle('auth-gate-hidden', !open);
    document.body.classList.toggle('auth-locked', open);
  }

  function showRecoveryMode() {
    setAuthGate(true);
    $('loginForm').hidden = true;
    $('recoveryForm').hidden = false;
    $('authTitle').textContent = 'Crear nueva contraseña';
    const intro = document.querySelector('.auth-copy p:last-child');
    if (intro) intro.textContent = 'Define una nueva contraseña para tu cuenta autorizada.';
    $('recoveryStatus').textContent = '';
  }

  function showLoginMode() {
    $('loginForm').hidden = false;
    $('recoveryForm').hidden = true;
    $('authTitle').textContent = 'Iniciar sesión';
    const intro = document.querySelector('.auth-copy p:last-child');
    if (intro) intro.textContent = 'Accede con el usuario autorizado de Supabase para consultar y registrar integraciones.';
  }

  function setSessionUI(session) {
    currentSession = session || null;
    if (session?.user) {
      $('sessionEmail').textContent = session.user.email || 'Usuario autenticado';
      $('sessionBox').hidden = false;
      setAuthGate(false);
    } else {
      $('sessionEmail').textContent = '';
      $('sessionBox').hidden = true;
      setAuthGate(true);
      records = [];
      renderAll();
    }
  }

  async function initializeAuth() {
    if (!supabaseClient) {
      $('loginStatus').textContent = 'Falta configurar Supabase en config.js.';
      setAuthGate(true);
      return;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.error('getSession:', error);
    setSessionUI(data?.session || null);

    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        currentSession = session || null;
        showRecoveryMode();
        return;
      }
      setSessionUI(session);
      if (session) await loadRecords();
    });

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hash.get('type') === 'recovery') {
      showRecoveryMode();
    } else if (data?.session) {
      await loadRecords();
    }
  }

  async function signIn(email, password) {
    $('loginStatus').textContent = 'Validando acceso...';
    $('loginButton').disabled = true;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setSessionUI(data.session);
      $('loginStatus').textContent = '';
      $('loginForm').reset();
      await loadRecords();
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      $('loginStatus').textContent =
        /invalid login credentials/i.test(msg)
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Revisa el usuario y la conexión.';
    } finally {
      $('loginButton').disabled = false;
    }
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    setSessionUI(null);
    showView('dashboard');
  }

  async function fetchAllRecords() {
    const pageSize = 1000;
    let from = 0;
    let all = [];
    while (true) {
      const { data, error } = await supabaseClient
        .from('integrations')
        .select('*')
        .order('integration_year', { ascending: false })
        .order('sequence_number', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function loadRecords() {
    if (!supabaseClient || !currentSession) {
      records = [];
      renderAll();
      return;
    }
    $('refreshButton').disabled = true;
    $('refreshButton').textContent = 'Actualizando...';
    try {
      records = await fetchAllRecords();
      renderAll();
    } catch (error) {
      console.error('loadRecords:', error);
      if (/jwt|auth|permission|row-level|rls/i.test(String(error?.message || ''))) {
        $('loginStatus').textContent = 'La sesión no tiene permiso para consultar los registros.';
      }
    } finally {
      $('refreshButton').disabled = false;
      $('refreshButton').textContent = 'Actualizar';
    }
  }

  function renderAll() {
    renderDashboard();
    fillFilters();
    renderTable();
  }

  function renderDashboard() {
    const currentYear = new Date().getFullYear();
    const thisYear = records.filter(r => Number(r.integration_year) === currentYear).length;
    const clients = new Set(records.map(r => (r.client || '').trim().toLowerCase()).filter(Boolean)).size;
    const incomplete = records.filter(r =>
      !r.client || !r.responsible || !r.family || !r.subfamily || !r.subsubfamily ||
      /incompleta|revisi/i.test(r.review_status || '')
    ).length;

    $('kpiTotal').textContent = records.length.toLocaleString('es-PE');
    $('kpiYear').textContent = thisYear.toLocaleString('es-PE');
    $('kpiClients').textContent = clients.toLocaleString('es-PE');
    $('kpiIncomplete').textContent = incomplete.toLocaleString('es-PE');

    const familyCount = new Set(records.map(r => (r.family || '').trim()).filter(Boolean)).size;
    const years = [...new Set(records.map(r => Number(r.integration_year)).filter(Boolean))].sort((a,b)=>a-b);
    const classified = records.filter(r => r.family && r.subfamily && r.subsubfamily).length;
    if ($('statFamilies')) $('statFamilies').textContent = familyCount.toLocaleString('es-PE');
    if ($('statYears')) $('statYears').textContent = years.length.toLocaleString('es-PE');
    if ($('statClassified')) $('statClassified').textContent = records.length ? `${Math.round(classified / records.length * 100)}%` : '0%';
    if ($('sidebarCount')) $('sidebarCount').textContent = `${records.length.toLocaleString('es-PE')} registros`;

    const byYear = {};
    records.forEach(r => {
      const y = Number(r.integration_year);
      if (y) byYear[y] = (byYear[y] || 0) + 1;
    });
    const topYears = Object.entries(byYear)
      .sort((a,b)=>Number(b[0])-Number(a[0]))
      .slice(0,6);
    const maxYear = Math.max(1, ...topYears.map(([,v]) => v));
    if ($('yearBars')) {
      $('yearBars').innerHTML = topYears.map(([year,count]) => `
        <div class="year-bar-row">
          <strong>${year}</strong>
          <div class="year-bar-track"><div class="year-bar-fill" style="width:${Math.max(6, Math.round(count/maxYear*100))}%"></div></div>
          <span>${count}</span>
        </div>`).join('') || '<div class="muted">Sin datos anuales.</div>';
    }

    $('recentList').innerHTML = records.slice(0, 7).map(r => `
      <div class="recent-item">
        <div class="code-pill">${escapeHtml(r.code)}</div>
        <div>
          <strong>${escapeHtml(r.description || 'Sin descripción')}</strong>
          <div class="muted">${escapeHtml(r.client || 'Cliente no definido')}</div>
        </div>
        <div class="muted">${r.is_legacy ? `Histórico · ${escapeHtml(r.integration_year || '')}` : formatDate(r.created_at)}</div>
      </div>`).join('') || '<div class="muted">Aún no hay registros disponibles.</div>';
  }

  function fillFilters() {
    const years = [...new Set(records.map(r => r.integration_year).filter(Boolean))].sort((a,b) => b-a);
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const y = $('yearFilter').value, f = $('familyFilter').value;
    $('yearFilter').innerHTML = '<option value="">Todos los años</option>' + years.map(v => `<option value="${v}">${v}</option>`).join('');
    $('familyFilter').innerHTML = '<option value="">Todas las familias</option>' + families.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    $('yearFilter').value = y;
    $('familyFilter').value = f;
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
      <td>${r.is_legacy ? escapeHtml(String(r.integration_year || '—')) : formatDate(r.created_at)}</td>
    </tr>`).join('');
  }

  async function prepareNextCode() {
    if (!supabaseClient || !currentSession) {
      $('code').value = 'Inicia sesión para generar código';
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
    if (!description) return updateClassificationUI(null);
    applyClassification(classifier?.classify(description) || null);
  }

  function scheduleClassification() {
    clearTimeout(classificationTimer);
    classificationTimer = setTimeout(runClassification, 350);
  }

  async function createIntegration(payload) {
    if (!supabaseClient || !currentSession) throw new Error('AUTH_REQUIRED');
    const { data, error } = await supabaseClient.rpc('create_integration', { p_data: payload });
    if (error) throw error;
    return data;
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!supabaseClient) {
      $('loginStatus').textContent = 'Supabase no está configurado.';
      return;
    }
    await signIn($('loginEmail').value.trim(), $('loginPassword').value);
  });


  $('recoveryForm').addEventListener('submit', async e => {
    e.preventDefault();
    const p1 = $('newPassword').value;
    const p2 = $('confirmPassword').value;
    if (p1.length < 8) {
      $('recoveryStatus').textContent = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }
    if (p1 !== p2) {
      $('recoveryStatus').textContent = 'Las contraseñas no coinciden.';
      return;
    }
    $('recoveryButton').disabled = true;
    $('recoveryStatus').textContent = 'Guardando contraseña...';
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: p1 });
      if (error) throw error;
      $('recoveryStatus').textContent = 'Contraseña actualizada correctamente.';
      history.replaceState({}, document.title, window.location.pathname + window.location.search);
      await supabaseClient.auth.signOut();
      showLoginMode();
      setSessionUI(null);
      $('loginStatus').textContent = 'Contraseña actualizada. Ya puedes iniciar sesión.';
      $('recoveryForm').reset();
    } catch (err) {
      console.error('password recovery:', err);
      const msg = String(err?.message || '');
      $('recoveryStatus').textContent = /expired|invalid/i.test(msg)
        ? 'El enlace de recuperación expiró o ya fue usado. Solicita uno nuevo.'
        : 'No se pudo actualizar la contraseña.';
    } finally {
      $('recoveryButton').disabled = false;
    }
  });

  $('logoutButton').addEventListener('click', signOut);

  $('integrationForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('formStatus').textContent = 'Guardando...';
    const manualClassification = !lastAutoClassification;
    const payload = {
      description: $('description').value.trim(),
      client: $('client').value.trim(),
      responsible: $('responsible').value.trim(),
      family: $('family').value || null,
      subfamily: $('subfamily').value || null,
      subsubfamily: $('subsubfamily').value || null,
      notes: $('notes').value.trim() || null,
      classification_confidence: manualClassification ? null : (lastAutoClassification?.confidence || null),
      classification_source: manualClassification ? 'manual' : 'automatic'
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
      $('formStatus').textContent =
        err?.message === 'AUTH_REQUIRED'
          ? 'Debes iniciar sesión.'
          : 'No se pudo guardar. Revisa Supabase y la consola.';
    }
  });

  document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $('heroNewButton').addEventListener('click', () => showView('new'));
  const heroRecordsButton = $('heroRecordsButton');
  if (heroRecordsButton) heroRecordsButton.addEventListener('click', () => showView('records'));
  const recentViewAll = $('recentViewAll');
  if (recentViewAll) recentViewAll.addEventListener('click', () => showView('records'));
  const globalQuickSearch = $('globalQuickSearch');
  if (globalQuickSearch) globalQuickSearch.addEventListener('input', () => {
    const target = $('searchInput');
    if (target) {
      target.value = globalQuickSearch.value;
      if (globalQuickSearch.value.trim()) showView('records');
      renderTable();
    }
  });
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
  $('subsubfamily').addEventListener('change', () => {
    lastAutoClassification = null;
    $('classificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });

  function escapeHtml(v='') {
    return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function formatDate(v) {
    if (!v) return '—';
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  }

  populateFamilies();
  initializeAuth();
})();
