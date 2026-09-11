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
  let lastEditAutoClassification = null;
  let originalEditCode = '';
  let currentSession = null;
  let recordsPage = 1;
  const recordsPerPage = 12;
  const views = ['dashboard', 'records', 'new'];
  const $ = id => document.getElementById(id);

  function showView(name) {
    views.forEach(v => $(v + 'View').classList.toggle('active-view', v === name));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    if ($('pageTitle')) $('pageTitle').textContent = name === 'new' ? 'Nueva integración' : name === 'records' ? 'Histórico de Integraciones' : 'Registro de Integraciones';
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
      if ($('loginStatus')) $('loginStatus').textContent = '';
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

  function isRecordComplete(r) {
    return !!(r.code && r.description && r.client && r.responsible && r.family && r.subfamily && r.subsubfamily) &&
      !/incompleta|revisi/i.test(r.review_status || '');
  }

  function validCurrentYearRecords() {
    const year = new Date().getFullYear();
    return records.filter(r => Number(r.integration_year) === year);
  }

  function latestIntegrationRecord() {
    const year = new Date().getFullYear();
    const yy = String(year).slice(-2);
    const currentYearPattern = new RegExp(`^INT_\\d+-${yy}$`, 'i');
    const anyIntPattern = /^INT[_ -]?(\d+)[_-](\d{2})$/i;

    const currentYearMatch = records
      .filter(r => Number(r.integration_year) === year && currentYearPattern.test(String(r.code || '').trim()))
      .sort((a,b) => Number(b.sequence_number || 0) - Number(a.sequence_number || 0))[0];

    if (currentYearMatch) return currentYearMatch;

    return records
      .filter(r => anyIntPattern.test(String(r.code || '').trim()))
      .sort((a,b) => {
        const ay = Number(a.integration_year || 0);
        const by = Number(b.integration_year || 0);
        if (by !== ay) return by - ay;
        return Number(b.sequence_number || 0) - Number(a.sequence_number || 0);
      })[0] || records.find(r => r.code) || null;
  }

  function dashboardFilteredRecords() {
    const q = ($('dashboardSearch')?.value || '').trim().toLowerCase();
    const year = $('dashboardYearFilter')?.value || '';
    const family = $('dashboardFamilyFilter')?.value || '';
    const status = $('dashboardStatusFilter')?.value || '';

    return records.filter(r => {
      const bag = [r.code, r.description, r.client, r.responsible, r.family, r.subfamily, r.subsubfamily].join(' ').toLowerCase();
      const statusOk = !status || (status === 'complete' ? isRecordComplete(r) : !isRecordComplete(r));
      return (!q || bag.includes(q)) &&
        (!year || String(r.integration_year) === year) &&
        (!family || r.family === family) &&
        statusOk;
    });
  }

  function renderDashboardTable() {
    const filtered = dashboardFilteredRecords();
    const rows = filtered.slice(0, 6);

    if ($('dashboardRecordsBody')) {
      $('dashboardRecordsBody').innerHTML = rows.map(r => `<tr>
        <td><span class="industrial-code">${escapeHtml(r.code || '—')}</span></td>
        <td class="dash-desc">${escapeHtml(r.description || 'Sin descripción')}</td>
        <td>${escapeHtml(r.client || '—')}</td>
        <td>${escapeHtml(r.family || '—')}</td>
        <td><span class="status-pill ${isRecordComplete(r) ? 'complete' : 'incomplete'}">${isRecordComplete(r) ? 'Completo' : 'Incompleto'}</span></td>
        <td>${r.integration_year ? escapeHtml(String(r.integration_year)) : '—'}</td>
        <td><button class="table-edit" type="button" data-edit-id="${escapeHtml(r.id)}">Editar</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty-cell">No hay registros para los filtros aplicados.</td></tr>';
    }

    if ($('dashboardRecordCount')) {
      $('dashboardRecordCount').textContent = filtered.length
        ? `Mostrando ${Math.min(6, filtered.length)} de ${filtered.length.toLocaleString('es-PE')} registros`
        : 'Sin registros';
    }

    document.querySelectorAll('#dashboardRecordsBody [data-edit-id]').forEach(button => {
      button.addEventListener('click', () => openEditModal(button.dataset.editId));
    });
  }

  function renderDashboard() {
    const currentYear = new Date().getFullYear();
    const thisYearRecords = validCurrentYearRecords();
    const clients = new Set(records.map(r => (r.client || '').trim().toLowerCase()).filter(Boolean)).size;
    const incomplete = records.filter(r => !isRecordComplete(r)).length;
    const familyCount = new Set(records.map(r => (r.family || '').trim()).filter(Boolean)).size;
    const latest = latestIntegrationRecord();

    $('kpiTotal').textContent = records.length.toLocaleString('es-PE');
    $('kpiYear').textContent = thisYearRecords.length.toLocaleString('es-PE');
    $('kpiClients').textContent = clients.toLocaleString('es-PE');
    $('kpiIncomplete').textContent = incomplete.toLocaleString('es-PE');
    if ($('statFamilies')) $('statFamilies').textContent = familyCount.toLocaleString('es-PE');
    if ($('currentYearLabel')) $('currentYearLabel').textContent = currentYear;
    if ($('latestCode')) $('latestCode').textContent = latest?.code || '—';
    if ($('latestCodeDate')) $('latestCodeDate').textContent = latest?.integration_year ? `Registro ${latest.integration_year}` : 'Registro histórico';

    const years = [...new Set(records.map(r => Number(r.integration_year)).filter(y => y >= 2000 && y <= currentYear))]
      .sort((a,b) => a-b);
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();

    for (const id of ['dashboardYearFilter']) {
      if ($(id)) {
        const old = $(id).value;
        $(id).innerHTML = '<option value="">Todos los años</option>' + years.slice(-12).reverse().map(y => `<option value="${y}">${y}</option>`).join('');
        $(id).value = old;
      }
    }
    if ($('dashboardFamilyFilter')) {
      const old = $('dashboardFamilyFilter').value;
      $('dashboardFamilyFilter').innerHTML = '<option value="">Todas las familias</option>' + families.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
      $('dashboardFamilyFilter').value = old;
    }

    const byYear = {};
    records.forEach(r => {
      const y = Number(r.integration_year);
      if (y >= 2000 && y <= currentYear) byYear[y] = (byYear[y] || 0) + 1;
    });
    const chartYears = Object.entries(byYear).sort((a,b) => Number(a[0]) - Number(b[0])).slice(-5);
    const maxCount = Math.max(1, ...chartYears.map(([,v]) => v));

    if ($('yearBars')) {
      $('yearBars').innerHTML = chartYears.map(([year,count]) => `
        <div class="year-column">
          <span class="year-count">${count}</span>
          <div class="year-column-track">
            <div class="year-column-fill" style="height:${Math.max(12, Math.round(count/maxCount*100))}%"></div>
          </div>
          <strong>${year}</strong>
        </div>`).join('');
    }

    const recent = records.slice(0, 5);
    $('recentList').innerHTML = recent.map((r, index) => `
      <button class="recent-row" type="button" data-edit-id="${escapeHtml(r.id)}">
        <span class="recent-dot ${isRecordComplete(r) ? 'blue' : index === 1 ? 'red' : 'gray'}"></span>
        <span class="recent-copy">
          <strong>${escapeHtml(r.code || 'Sin código')}</strong>
          <small>${escapeHtml(r.client || 'Cliente no especificado')}</small>
        </span>
        <span class="recent-time">${r.integration_year ? r.integration_year : '—'}</span>
      </button>`).join('');

    document.querySelectorAll('#recentList [data-edit-id]').forEach(button => {
      button.addEventListener('click', () => openEditModal(button.dataset.editId));
    });

    renderDashboardTable();
  }

  function fillFilters() {
    const currentYear = new Date().getFullYear();
    const years = [...new Set(records.map(r => Number(r.integration_year)).filter(y => y >= 2000 && y <= currentYear))].sort((a,b) => b-a);
    const families = [...new Set(records.map(r => r.family).filter(Boolean))].sort();
    const y = $('yearFilter').value, f = $('familyFilter').value;

    $('yearFilter').innerHTML = '<option value="">Todos los años</option>' + years.map(v => `<option value="${v}">${v}</option>`).join('');
    $('familyFilter').innerHTML = '<option value="">Todas las familias</option>' + families.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    $('yearFilter').value = y;
    $('familyFilter').value = f;
  }

  function renderTable() {
    const q = $('searchInput').value.trim().toLowerCase();
    const year = $('yearFilter').value;
    const family = $('familyFilter').value;
    const status = $('statusFilter')?.value || '';

    const filtered = records.filter(r => {
      const bag = [r.code, r.description, r.client, r.responsible, r.family, r.subfamily, r.subsubfamily].join(' ').toLowerCase();
      const statusOk = !status || (status === 'complete' ? isRecordComplete(r) : !isRecordComplete(r));
      return (!q || bag.includes(q)) &&
        (!year || String(r.integration_year) === year) &&
        (!family || r.family === family) &&
        statusOk;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / recordsPerPage));
    if (recordsPage > totalPages) recordsPage = totalPages;
    const start = (recordsPage - 1) * recordsPerPage;
    const pageRows = filtered.slice(start, start + recordsPerPage);

    $('recordsBody').innerHTML = pageRows.map(r => `<tr>
      <td><span class="industrial-code">${escapeHtml(r.code || '—')}</span></td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${escapeHtml(r.client || '—')}</td>
      <td>${escapeHtml(r.responsible || '—')}</td>
      <td>${escapeHtml(r.family || '—')}</td>
      <td>${r.integration_year ? escapeHtml(String(r.integration_year)) : '—'}</td>
      <td class="row-actions">
        <button class="table-edit" type="button" data-edit-id="${escapeHtml(r.id)}">Editar</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-cell">No se encontraron registros.</td></tr>';

    if ($('recordsCount')) {
      const shownFrom = filtered.length ? start + 1 : 0;
      const shownTo = Math.min(start + recordsPerPage, filtered.length);
      $('recordsCount').textContent = `Mostrando ${shownFrom}–${shownTo} de ${filtered.length.toLocaleString('es-PE')} registros`;
    }

    if ($('recordsPagination')) {
      const buttons = [];
      const add = (label, page, disabled=false, active=false) =>
        buttons.push(`<button class="pager-button${active ? ' active' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`);

      add('‹', Math.max(1, recordsPage - 1), recordsPage === 1);
      const first = Math.max(1, Math.min(recordsPage - 2, totalPages - 4));
      const last = Math.min(totalPages, first + 4);
      for (let p = first; p <= last; p++) add(String(p), p, false, p === recordsPage);
      if (last < totalPages) buttons.push('<span class="pager-ellipsis">…</span>');
      if (totalPages > 1 && last < totalPages) add(String(totalPages), totalPages, false, recordsPage === totalPages);
      add('›', Math.min(totalPages, recordsPage + 1), recordsPage === totalPages);

      $('recordsPagination').innerHTML = buttons.join('');
      $('recordsPagination').querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          recordsPage = Number(btn.dataset.page);
          renderTable();
          document.querySelector('#recordsView .panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    document.querySelectorAll('#recordsBody [data-edit-id]').forEach(button => {
      button.addEventListener('click', () => openEditModal(button.dataset.editId));
    });
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


  function populateEditFamilies(selected = '') {
    if (!classifier) return;
    const families = Object.keys(classifier.taxonomy || {}).sort();
    $('editFamily').innerHTML = '<option value="">Seleccionar familia</option>' + families.map(v => option(v, v === selected)).join('');
    populateEditSubfamilies(selected, '');
  }

  function populateEditSubfamilies(family, selected = '') {
    const subs = classifier?.taxonomy?.[family] ? Object.keys(classifier.taxonomy[family]).sort() : [];
    $('editSubfamily').innerHTML = '<option value="">Seleccionar subfamilia</option>' + subs.map(v => option(v, v === selected)).join('');
    populateEditSubsubfamilies(family, selected, '');
  }

  function populateEditSubsubfamilies(family, subfamily, selected = '') {
    const values = classifier?.taxonomy?.[family]?.[subfamily] || [];
    $('editSubsubfamily').innerHTML = '<option value="">Seleccionar sub-subfamilia</option>' + values.map(v => option(v, v === selected)).join('');
  }

  function setEditClassification(record) {
    populateEditFamilies(record.family || '');
    populateEditSubfamilies(record.family || '', record.subfamily || '');
    populateEditSubsubfamilies(record.family || '', record.subfamily || '', record.subsubfamily || '');
    lastEditAutoClassification = null;
    $('editClassificationConfidence').textContent = record.classification_source === 'automatic' ? 'Automática' : 'Manual / histórica';
    $('editClassificationConfidence').className = 'confidence-badge neutral';
    $('editClassificationMessage').textContent = 'Clasificación actual cargada. Puedes modificarla manualmente o volver a analizar la descripción.';
  }

  function openEditModal(id) {
    const record = records.find(r => String(r.id) === String(id));
    if (!record) return;

    $('editId').value = record.id;
    originalEditCode = record.code || '';
    $('editCode').value = originalEditCode;
    $('editClient').value = record.client || '';
    $('editDescription').value = record.description || '';
    $('editResponsible').value = record.responsible || '';
    $('editNotes').value = record.notes || '';
    $('editFormStatus').textContent = '';
    setEditClassification(record);

    $('editModal').hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(() => $('editDescription').focus(), 0);
  }

  function closeEditModal() {
    $('editModal').hidden = true;
    document.body.classList.remove('modal-open');
    $('editIntegrationForm').reset();
    lastEditAutoClassification = null;
  }

  function runEditClassification() {
    const description = $('editDescription').value.trim();
    const result = description ? classifier?.classify(description) : null;

    if (!result) {
      lastEditAutoClassification = null;
      $('editClassificationConfidence').textContent = 'Sin sugerencia';
      $('editClassificationConfidence').className = 'confidence-badge neutral';
      $('editClassificationMessage').textContent = 'No hay suficiente información para sugerir una clasificación.';
      return;
    }

    lastEditAutoClassification = result;
    populateEditFamilies(result.family);
    populateEditSubfamilies(result.family, result.subfamily);
    populateEditSubsubfamilies(result.family, result.subfamily, result.subsubfamily);

    const level = result.confidence >= 90 ? 'high' : result.confidence >= 75 ? 'medium' : 'low';
    $('editClassificationConfidence').textContent = `${result.confidence}% confianza`;
    $('editClassificationConfidence').className = `confidence-badge ${level}`;
    $('editClassificationMessage').innerHTML =
      `<strong>${escapeHtml(result.family)}</strong> → ${escapeHtml(result.subfamily)} → ${escapeHtml(result.subsubfamily)}`;
  }


  async function codeExistsInAnotherRecord(code, currentId) {
    const normalized = String(code || '').trim();
    if (!normalized) return false;

    const { data, error } = await supabaseClient
      .from('integrations')
      .select('id, code')
      .eq('code', normalized)
      .limit(5);

    if (error) throw error;
    return (data || []).some(row => String(row.id) !== String(currentId));
  }

  async function updateIntegration(id, payload) {
    if (!supabaseClient || !currentSession) throw new Error('AUTH_REQUIRED');

    const { data, error } = await supabaseClient
      .from('integrations')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
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


  $('closeEditModal').addEventListener('click', closeEditModal);
  $('cancelEditButton').addEventListener('click', closeEditModal);

  $('editModal').addEventListener('click', e => {
    if (e.target === $('editModal')) closeEditModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('editModal').hidden) closeEditModal();
  });

  $('editClassifyButton').addEventListener('click', runEditClassification);

  $('editFamily').addEventListener('change', () => {
    populateEditSubfamilies($('editFamily').value, '');
    lastEditAutoClassification = null;
    $('editClassificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });

  $('editSubfamily').addEventListener('change', () => {
    populateEditSubsubfamilies($('editFamily').value, $('editSubfamily').value, '');
    lastEditAutoClassification = null;
    $('editClassificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });

  $('editSubsubfamily').addEventListener('change', () => {
    lastEditAutoClassification = null;
    $('editClassificationMessage').textContent = 'Clasificación ajustada manualmente.';
  });

  $('editIntegrationForm').addEventListener('submit', async e => {
    e.preventDefault();

    const id = $('editId').value;
    const newCode = $('editCode').value.trim();

    $('editFormStatus').textContent = '';
    $('saveEditButton').disabled = true;

    try {
      if (!newCode) {
        $('editFormStatus').textContent = 'El código de integración no puede quedar vacío.';
        $('editCode').focus();
        return;
      }

      // If the code changed, explicitly prevent duplicates across the full historical base.
      if (newCode !== originalEditCode) {
        $('editFormStatus').textContent = 'Validando código...';
        const duplicate = await codeExistsInAnotherRecord(newCode, id);
        if (duplicate) {
          $('editFormStatus').textContent = `El código ${newCode} ya existe en otro registro.`;
          $('editCode').focus();
          $('editCode').select();
          return;
        }
      }

      $('editFormStatus').textContent = 'Guardando cambios...';

      const codeChanged = newCode !== originalEditCode;

      const payload = {
        code: newCode,
        description: $('editDescription').value.trim(),
        client: $('editClient').value.trim(),
        responsible: $('editResponsible').value.trim(),
        family: $('editFamily').value || null,
        subfamily: $('editSubfamily').value || null,
        subsubfamily: $('editSubsubfamily').value || null,
        notes: $('editNotes').value.trim() || null,
        classification_source: lastEditAutoClassification ? 'automatic' : 'manual',
        classification_confidence: lastEditAutoClassification?.confidence || null,
        review_status: (
          newCode &&
          $('editClient').value.trim() &&
          $('editResponsible').value.trim() &&
          $('editFamily').value &&
          $('editSubfamily').value &&
          $('editSubsubfamily').value
        ) ? 'OK' : 'REQUIERE REVISIÓN'
      };

      const updated = await updateIntegration(id, payload);

      // The existing audit trigger stores BEFORE and AFTER snapshots automatically,
      // so a code correction is traceable without extra frontend writes.
      originalEditCode = updated.code || newCode;

      $('editFormStatus').textContent = codeChanged
        ? `Código actualizado a ${updated.code || newCode}. Cambios guardados.`
        : 'Cambios guardados correctamente.';

      await loadRecords();
      setTimeout(closeEditModal, 500);
    } catch (err) {
      console.error('updateIntegration:', err);
      const message = String(err?.message || '');

      if (/duplicate key|unique/i.test(message)) {
        $('editFormStatus').textContent = 'Ese código ya está registrado.';
      } else if (/permission|403|rls/i.test(message)) {
        $('editFormStatus').textContent = 'Tu usuario no tiene permiso para actualizar registros.';
      } else {
        $('editFormStatus').textContent = 'No se pudieron guardar los cambios.';
      }
    } finally {
      $('saveEditButton').disabled = false;
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
  const dashboardViewAll = $('dashboardViewAll');
  if (dashboardViewAll) dashboardViewAll.addEventListener('click', () => showView('records'));

  const yearsViewDetail = $('yearsViewDetail');
  if (yearsViewDetail) yearsViewDetail.addEventListener('click', () => showView('records'));

  const incompleteCard = $('incompleteCard');
  if (incompleteCard) incompleteCard.addEventListener('click', () => {
    showView('records');
    if ($('statusFilter')) $('statusFilter').value = 'incomplete';
    recordsPage = 1;
    renderTable();
  });

  const clientsCard = $('clientsCard');
  if (clientsCard) clientsCard.addEventListener('click', () => showView('records'));
  const familiesCard = $('familiesCard');
  if (familiesCard) familiesCard.addEventListener('click', () => showView('records'));

  ['dashboardSearch','dashboardYearFilter','dashboardFamilyFilter','dashboardStatusFilter'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', renderDashboardTable);
    if (el) el.addEventListener('change', renderDashboardTable);
  });

  const dashboardNextPage = $('dashboardNextPage');
  if (dashboardNextPage) dashboardNextPage.addEventListener('click', () => showView('records'));
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
  ['searchInput','yearFilter','familyFilter','statusFilter'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const handler = () => { recordsPage = 1; renderTable(); };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
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
