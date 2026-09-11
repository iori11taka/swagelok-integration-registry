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

  const itemMasterHierarchy = window.ITEM_MASTER_HIERARCHY || [];
  let records = [];
  let originalEditCode = '';
  let currentSession = null;
  let recordsPage = 1;
  const recordsPerPage = 12;
  const views = ['dashboard', 'records', 'new'];
  const $ = id => document.getElementById(id);

  function getCategory(code) { return itemMasterHierarchy.find(x => x.code === code) || null; }
  function getGroup(categoryCode, groupCode) { return getCategory(categoryCode)?.groups?.find(x => x.code === groupCode) || null; }
  function getSeries(categoryCode, groupCode, seriesCode) { return getGroup(categoryCode, groupCode)?.series?.find(x => x.code === seriesCode) || null; }
  function hierarchyLabel(record, compact=false) {
    if (!record?.category_code) return 'Sin Item Master';
    if (!record?.group_code) return compact ? record.category_code : `${record.category_code} — ${record.category_name || ''}`;
    if (!record?.series_code) return compact ? `${record.group_code} · ${record.group_name || ''}` : `${record.category_code} — ${record.category_name || ''} / ${record.group_code} — ${record.group_name || ''}`;
    return compact ? `${record.group_code} · ${record.series_code} — ${record.series_name || ''}` : `${record.category_code} — ${record.category_name || ''} / ${record.group_code} — ${record.group_name || ''} / ${record.series_code} — ${record.series_name || ''}`;
  }
  function isMapped(record) { return !!(record?.category_code && record?.group_code && record?.series_code); }
  function populateCategorySelect(id, selected='', allowBlank=true) {
    const el=$(id); if(!el) return;
    el.innerHTML=(allowBlank?'<option value="">Sin Category</option>':'<option value="">Seleccionar Category</option>')+itemMasterHierarchy.map(x=>`<option value="${escapeHtml(x.code)}"${x.code===selected?' selected':''}>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</option>`).join('');
  }
  function populateGroupSelect(id, categoryCode, selected='', allowBlank=true) {
    const el=$(id); if(!el) return; const c=getCategory(categoryCode);
    el.innerHTML=(allowBlank?'<option value="">Sin Group</option>':'<option value="">Seleccionar Group</option>')+(c?.groups||[]).map(x=>`<option value="${escapeHtml(x.code)}"${x.code===selected?' selected':''}>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</option>`).join('');
    el.disabled=!categoryCode;
  }
  function populateSeriesSelect(id, categoryCode, groupCode, selected='', allowBlank=true) {
    const el=$(id); if(!el) return; const g=getGroup(categoryCode,groupCode);
    el.innerHTML=(allowBlank?'<option value="">Sin Series</option>':'<option value="">Seleccionar Series</option>')+(g?.series||[]).map(x=>`<option value="${escapeHtml(x.code)}"${x.code===selected?' selected':''}>${escapeHtml(x.code)} — ${escapeHtml(x.name)}</option>`).join('');
    el.disabled=!(categoryCode&&groupCode);
  }
  function selectedHierarchyPayload(categoryCode,groupCode,seriesCode) {
    const c=getCategory(categoryCode), g=getGroup(categoryCode,groupCode), s=getSeries(categoryCode,groupCode,seriesCode);
    return {category_code:c?.code||null,category_name:c?.name||null,group_code:g?.code||null,group_name:g?.name||null,series_code:s?.code||null,series_name:s?.name||null};
  }

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
    return !!(r.code && r.description && r.client && r.responsible) &&
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
    const group = $('dashboardGroupFilter')?.value || '';
    const status = $('dashboardStatusFilter')?.value || '';

    return records.filter(r => {
      const bag = [r.code, r.description, r.client, r.responsible, r.category_code, r.category_name, r.group_code, r.group_name, r.series_code, r.series_name].join(' ').toLowerCase();
      const statusOk = !status || (status === 'complete' ? isRecordComplete(r) : !isRecordComplete(r));
      return (!q || bag.includes(q)) &&
        (!year || String(r.integration_year) === year) &&
        (!group || r.group_code === group) &&
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
        <td>${escapeHtml(hierarchyLabel(r, true))}</td>
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
    const unmappedCount = records.filter(r => !isMapped(r)).length;
    const latest = latestIntegrationRecord();

    $('kpiTotal').textContent = records.length.toLocaleString('es-PE');
    $('kpiYear').textContent = thisYearRecords.length.toLocaleString('es-PE');
    $('kpiClients').textContent = clients.toLocaleString('es-PE');
    $('kpiIncomplete').textContent = incomplete.toLocaleString('es-PE');
    if ($('statUnmapped')) $('statUnmapped').textContent = unmappedCount.toLocaleString('es-PE');
    if ($('currentYearLabel')) $('currentYearLabel').textContent = currentYear;
    if ($('latestCode')) $('latestCode').textContent = latest?.code || '—';
    if ($('latestCodeDate')) $('latestCodeDate').textContent = latest?.integration_year ? `Registro ${latest.integration_year}` : 'Registro histórico';

    const years = [...new Set(records.map(r => Number(r.integration_year)).filter(y => y >= 2000 && y <= currentYear))]
      .sort((a,b) => a-b);
    const groups = itemMasterHierarchy.flatMap(c => c.groups || []).filter((g,i,a) => a.findIndex(x => x.code === g.code) === i);

    for (const id of ['dashboardYearFilter']) {
      if ($(id)) {
        const old = $(id).value;
        $(id).innerHTML = '<option value="">Todos los años</option>' + years.slice(-12).reverse().map(y => `<option value="${y}">${y}</option>`).join('');
        $(id).value = old;
      }
    }
    if ($('dashboardGroupFilter')) {
      const old = $('dashboardGroupFilter').value;
      $('dashboardGroupFilter').innerHTML = '<option value="">Todos los Group</option>' + groups.map(g => `<option value="${escapeHtml(g.code)}">${escapeHtml(g.code)} — ${escapeHtml(g.name)}</option>`).join('');
      $('dashboardGroupFilter').value = old;
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
    const groups = itemMasterHierarchy.flatMap(c => c.groups || []).filter((g,i,a) => a.findIndex(x => x.code === g.code) === i);
    const y = $('yearFilter').value, g = $('groupFilter').value;

    $('yearFilter').innerHTML = '<option value="">Todos los años</option>' + years.map(v => `<option value="${v}">${v}</option>`).join('');
    $('groupFilter').innerHTML = '<option value="">Todos los Group</option>' + groups.map(v => `<option value="${escapeHtml(v.code)}">${escapeHtml(v.code)} — ${escapeHtml(v.name)}</option>`).join('');
    $('yearFilter').value = y;
    $('groupFilter').value = g;
  }

  function renderTable() {
    const q = $('searchInput').value.trim().toLowerCase();
    const year = $('yearFilter').value;
    const group = $('groupFilter').value;
    const status = $('statusFilter')?.value || '';

    const filtered = records.filter(r => {
      const bag = [r.code, r.description, r.client, r.responsible, r.category_code, r.category_name, r.group_code, r.group_name, r.series_code, r.series_name].join(' ').toLowerCase();
      const statusOk = !status || (status === 'complete' ? isRecordComplete(r) : !isRecordComplete(r));
      return (!q || bag.includes(q)) &&
        (!year || String(r.integration_year) === year) &&
        (!group || r.group_code === group) &&
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
      <td>${escapeHtml(hierarchyLabel(r, true))}</td>
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

  function initializeNewHierarchy() {
    populateCategorySelect('categoryCode','',false);
    populateGroupSelect('groupCode','','',false);
    populateSeriesSelect('seriesCode','','','',false);
  }

  function setEditClassification(record) {
    populateCategorySelect('editCategoryCode',record.category_code||'',true);
    populateGroupSelect('editGroupCode',record.category_code||'',record.group_code||'',true);
    populateSeriesSelect('editSeriesCode',record.category_code||'',record.group_code||'',record.series_code||'',true);
    const state=$('editHierarchyState');
    if(state){ state.textContent=isMapped(record)?`${record.series_code} asignada`:'Sin Item Master'; state.className=`manual-badge${isMapped(record)?' assigned':''}`; }
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

  $('editCategoryCode').addEventListener('change', () => {
    populateGroupSelect('editGroupCode',$('editCategoryCode').value,'',true);
    populateSeriesSelect('editSeriesCode','','','',true);
  });
  $('editGroupCode').addEventListener('change', () => {
    populateSeriesSelect('editSeriesCode',$('editCategoryCode').value,$('editGroupCode').value,'',true);
  });
  $('editSeriesCode').addEventListener('change', () => {
    const state=$('editHierarchyState'); if(state){state.textContent=$('editSeriesCode').value?`${$('editSeriesCode').value} asignada`:'Sin Series'; state.className=`manual-badge${$('editSeriesCode').value?' assigned':''}`;}
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
        ...selectedHierarchyPayload(
          $('editCategoryCode').value,
          $('editGroupCode').value,
          $('editSeriesCode').value
        ),
        notes: $('editNotes').value.trim() || null,
        review_status: (
          newCode &&
          $('editDescription').value.trim() &&
          $('editClient').value.trim() &&
          $('editResponsible').value.trim()
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
    const categoryCode = $('categoryCode').value;
    const groupCode = $('groupCode').value;
    const seriesCode = $('seriesCode').value;

    if (!categoryCode || !groupCode || !seriesCode) {
      $('formStatus').textContent = 'Selecciona Category, Group y Series.';
      return;
    }

    const payload = {
      description: $('description').value.trim(),
      client: $('client').value.trim(),
      responsible: $('responsible').value.trim(),
      ...selectedHierarchyPayload(categoryCode, groupCode, seriesCode),
      notes: $('notes').value.trim() || null
    };
    try {
      const created = await createIntegration(payload);
      $('formStatus').textContent = `Guardado: ${created.code || created}`;
      e.target.reset();
      initializeNewHierarchy();
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
  const unmappedCard = $('unmappedCard');
  if (unmappedCard) unmappedCard.addEventListener('click', () => {
    showView('records');
    if ($('groupFilter')) $('groupFilter').value = '';
    recordsPage = 1;
    renderTable();
  });

  ['dashboardSearch','dashboardYearFilter','dashboardGroupFilter','dashboardStatusFilter'].forEach(id => {
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
  ['searchInput','yearFilter','groupFilter','statusFilter'].forEach(id => {
    const el = $(id);
    if (!el) return;
    const handler = () => { recordsPage = 1; renderTable(); };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
  $('categoryCode').addEventListener('change', () => {
    populateGroupSelect('groupCode',$('categoryCode').value,'',false);
    populateSeriesSelect('seriesCode','','','',false);
  });
  $('groupCode').addEventListener('change', () => {
    populateSeriesSelect('seriesCode',$('categoryCode').value,$('groupCode').value,'',false);
  });

  function escapeHtml(v='') {
    return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function formatDate(v) {
    if (!v) return '—';
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  }

  initializeNewHierarchy();
  initializeAuth();
})();
