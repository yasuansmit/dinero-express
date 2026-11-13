// admin.js - Panel de Control DINERO EXPRESS - Multi-Tabla
(function () {
  let adminPin = sessionStorage.getItem('raffle_admin_pin') || '';
  let currentData = null;
  let currentAdminTableId = 1;
  let activeFilter = 'all';
  let cachedTemplates = {};
  const selectedBatchNumbers = new Set();

  // DOM
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const adminPinInput = document.getElementById('adminPinInput');
  const adminPanel = document.getElementById('adminPanel');

  const currentStatusBadge = document.getElementById('currentStatusBadge');
  const btnSetPreLaunch = document.getElementById('btnSetPreLaunch');
  const btnSetActive = document.getElementById('btnSetActive');

  const statCollected = document.getElementById('statCollected');
  const statPotential = document.getElementById('statPotential');
  const statGoal = document.getElementById('statGoal');
  const statCount = document.getElementById('statCount');
  const statProgress = document.getElementById('statProgress');

  const tabBtnBuyers = document.getElementById('tabBtnBuyers');
  const tabBtnWhatsApp = document.getElementById('tabBtnWhatsApp');
  const tabBtnLottery = document.getElementById('tabBtnLottery');
  const tabBtnConfig = document.getElementById('tabBtnConfig');

  const sectionBuyers = document.getElementById('sectionBuyers');
  const sectionWhatsApp = document.getElementById('sectionWhatsApp');
  const sectionLottery = document.getElementById('sectionLottery');
  const sectionConfig = document.getElementById('sectionConfig');

  const adminTableSelector = document.getElementById('adminTableSelector');
  const btnAdminAddTable = document.getElementById('btnAdminAddTable');
  const adminTablesConfigList = document.getElementById('adminTablesConfigList');

  const searchBuyer = document.getElementById('searchBuyer');
  const buyersTableBody = document.getElementById('buyersTableBody');
  const chipFilters = document.querySelectorAll('.chip-filter[data-filter]');
  const filterAllCount = document.getElementById('filterAllCount');
  const filterResCount = document.getElementById('filterResCount');
  const filterPaidCount = document.getElementById('filterPaidCount');
  const filterProofCount = document.getElementById('filterProofCount');
  const btnDownloadBackup = document.getElementById('btnDownloadBackup');

  let adminAudioCtx = null;
  function playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!adminAudioCtx) adminAudioCtx = new AudioCtx();
      if (adminAudioCtx.state === 'suspended') adminAudioCtx.resume();

      const now = adminAudioCtx.currentTime;
      [880, 1318.5].forEach((freq, idx) => {
        const osc = adminAudioCtx.createOscillator();
        const gain = adminAudioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.25, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(adminAudioCtx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.35);
      });
    } catch {}
  }

  // Lote masivo
  const batchActionBar = document.getElementById('batchActionBar');
  const batchSelectedCount = document.getElementById('batchSelectedCount');
  const btnBatchMarkPaid = document.getElementById('btnBatchMarkPaid');
  const btnBatchFree = document.getElementById('btnBatchFree');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  const configForm = document.getElementById('configForm');
  const cfgName = document.getElementById('cfgName');
  const cfgPrizeFirst = document.getElementById('cfgPrizeFirst');
  const cfgPrizeMiddle = document.getElementById('cfgPrizeMiddle');
  const cfgPrizeLast = document.getElementById('cfgPrizeLast');
  const cfgLottery = document.getElementById('cfgLottery');
  const cfgPrice = document.getElementById('cfgPrice');
  const cfgNequi = document.getElementById('cfgNequi');
  const cfgPin = document.getElementById('cfgPin');
  const btnResetRaffle = document.getElementById('btnResetRaffle');
  const btnExportCSV = document.getElementById('btnExportCSV');

  // Afiche
  const adminFlyerPreview = document.getElementById('adminFlyerPreview');
  const flyerFileInput = document.getElementById('flyerFileInput');
  const btnSelectFlyerFile = document.getElementById('btnSelectFlyerFile');
  const flyerSelectedName = document.getElementById('flyerSelectedName');
  const btnSaveFlyer = document.getElementById('btnSaveFlyer');
  let selectedFlyerBase64 = null;

  // Lotería Chontico
  const lotteryInputNumber = document.getElementById('lotteryInputNumber');
  const btnDeclareLotteryWinner = document.getElementById('btnDeclareLotteryWinner');
  const lotteryResultCard = document.getElementById('lotteryResultCard');

  // Plantillas WA
  const templatePreLaunch = document.getElementById('templatePreLaunch');
  const templateActive = document.getElementById('templateActive');
  const templateRemaining = document.getElementById('templateRemaining');
  const templateWinner = document.getElementById('templateWinner');
  const directWinnersButtonsContainer = document.getElementById('directWinnersButtonsContainer');

  // Modal Comprobante
  const proofViewModal = document.getElementById('proofViewModal');
  const proofModalImg = document.getElementById('proofModalImg');
  const proofModalTitle = document.getElementById('proofModalTitle');
  const btnCloseProofViewModal = document.getElementById('btnCloseProofViewModal');
  const btnCloseProofViewBtn = document.getElementById('btnCloseProofViewBtn');
  const btnProofApprove = document.getElementById('btnProofApprove');
  let currentViewingProofNum = null;

  const themeToggle = document.getElementById('themeToggleAdmin');
  const toastBox = document.getElementById('toastBox');

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span style="font-weight:900;">${icon}</span> <span>${message}</span>`;
    toastBox.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function formatCOP(val) {
    return '$' + Number(val || 0).toLocaleString('es-CO');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Tema
  const savedTheme = localStorage.getItem('rifa_theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rifa_theme', next);
    themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = adminPinInput.value.trim();
    if (!pin) return;

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (res.ok) {
        adminPin = pin;
        sessionStorage.setItem('raffle_admin_pin', pin);
        loginModal.style.display = 'none';
        adminPanel.style.display = 'block';
        loadAdminData();
        loadWhatsAppTemplates();
        connectSSE();
      } else {
        showToast('PIN incorrecto. Intenta de nuevo.', 'error');
        adminPinInput.value = '';
        adminPinInput.focus();
      }
    } catch {
      showToast('Error al conectar con el servidor.', 'error');
    }
  });

  if (adminPin) {
    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: adminPin })
    }).then(res => {
      if (res.ok) {
        loginModal.style.display = 'none';
        adminPanel.style.display = 'block';
        loadAdminData();
        loadWhatsAppTemplates();
        connectSSE();
      } else {
        sessionStorage.removeItem('raffle_admin_pin');
      }
    });
  }

  // Obtener tabla activa actual
  function getSelectedAdminTable() {
    if (!currentData || !currentData.tables) return null;
    return currentData.tables.find(t => t.id === currentAdminTableId) || currentData.tables[0] || null;
  }

  // Cargar datos
  async function loadAdminData() {
    try {
      const res = await fetch('/api/admin/data', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (res.status === 401) {
        sessionStorage.removeItem('raffle_admin_pin');
        location.reload();
        return;
      }
      currentData = await res.json();

      // Validar currentAdminTableId
      if (!currentData.tables.find(t => t.id === currentAdminTableId)) {
        currentAdminTableId = currentData.tables[0] ? currentData.tables[0].id : 1;
      }

      renderTableSelector();
      renderStats();
      renderStatusBadge();
      renderBuyers();
      fillConfigForm();
      renderTablesConfigList();
      loadWhatsAppTemplates();

      // Si hay ganadores existentes en alguna tabla, mostrarlos
      const hasWinners = currentData.tables.some(t => t.winners && t.winners.length > 0);
      if (hasWinners) {
        renderAllTablesLotteryWinners(currentData.tables, currentData.config.winningNumber || '');
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Renderizar pestañas de tablas para la administradora
  function renderTableSelector() {
    if (!adminTableSelector || !currentData || !currentData.tables) return;
    const tables = currentData.tables;

    adminTableSelector.innerHTML = tables.map(t => {
      const isSelected = t.id === currentAdminTableId;
      const paidPct = t.stats ? t.stats.percentPaid : 0;
      return `
        <button type="button" class="btn-tool ${isSelected ? 'active' : ''}" data-table-id="${t.id}" style="
          padding: 8px 16px; font-size: 0.9rem; font-weight: 800; border-radius: 10px; white-space: nowrap;
          ${isSelected ? 'background: var(--nequi-pink); color: white; border-color: var(--nequi-pink); box-shadow: 0 4px 12px rgba(218,0,129,0.3);' : ''}
        ">
          📋 ${escapeHtml(t.name)} <span style="font-size:0.75rem; opacity:0.85;">(${paidPct}%)</span>
        </button>
      `;
    }).join('');

    adminTableSelector.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.tableId, 10);
        if (id !== currentAdminTableId) {
          selectedBatchNumbers.clear();
          currentAdminTableId = id;
          renderTableSelector();
          renderStats();
          renderBuyers();
        }
      });
    });
  }

  // Abrir Nueva Tabla
  if (btnAdminAddTable) {
    btnAdminAddTable.addEventListener('click', async () => {
      const tables = (currentData && currentData.tables) || [];
      const nextNum = tables.length + 1;
      const defaultName = `Tabla ${nextNum}`;

      const name = prompt(`Ingresa el nombre para la nueva tabla:`, defaultName);
      if (name === null) return; // canceló

      const pozoStr = prompt(`Ingresa el Pozo Acumulado inicial para ${name} (en COP):`, '5000000');
      if (pozoStr === null) return;
      const pozoAmount = parseInt(pozoStr, 10) || 5000000;

      const incStr = prompt(`¿Cuánto se le sumará al pozo si nadie lo gana en esta tabla? (Incremento por rifa):`, '500000');
      if (incStr === null) return;
      const pozoIncrement = parseInt(incStr, 10) || 500000;

      btnAdminAddTable.disabled = true;
      btnAdminAddTable.textContent = 'Creando tabla...';

      try {
        const res = await fetch('/api/admin/add-table', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin
          },
          body: JSON.stringify({ name: name.trim() || defaultName, pozoAmount, pozoIncrement })
        });

        const data = await res.json();
        if (res.ok) {
          showToast(`¡${data.name} abierta con éxito con 100 números nuevos! 🎉`, 'success');
          currentAdminTableId = data.tableId;
          await loadAdminData();
        } else {
          showToast(data.error || 'Error al abrir tabla.', 'error');
        }
      } catch {
        showToast('Error de conexión.', 'error');
      } finally {
        btnAdminAddTable.disabled = false;
        btnAdminAddTable.textContent = '➕ Abrir Nueva Tabla';
      }
    });
  }

  function renderStatusBadge() {
    if (!currentData) return;
    const s = currentData.config.raffleStatus || 'active';
    currentStatusBadge.className = `status-pill ${s}`;
    if (s === 'pre_launch') {
      currentStatusBadge.textContent = '⏸️ En Espera (Pre-Lanzamiento)';
    } else if (s === 'active') {
      currentStatusBadge.textContent = '🟢 Abierta para Ventas';
    } else if (s === 'finished') {
      currentStatusBadge.textContent = '🏁 Rifa Finalizada / Jugada';
    }
  }

  function renderStats() {
    if (!currentData) return;
    const t = getSelectedAdminTable();
    const stats = t ? t.stats : currentData.stats;
    const totalNumbers = t ? t.totalNumbers : 100;
    const totalTaken = (stats.paid || 0) + (stats.reserved || 0);

    statCollected.textContent = formatCOP(stats.collectedAmount || 0);
    statPotential.textContent = formatCOP(stats.potentialAmount || 0);
    statGoal.textContent = formatCOP(stats.totalGoal || 0);
    statCount.textContent = `${stats.paid || 0} / ${totalNumbers} (${totalTaken} apar./pag.)`;
    statProgress.style.width = `${stats.percentPaid || 0}%`;
  }

  // Afiche
  if (btnSelectFlyerFile) {
    btnSelectFlyerFile.addEventListener('click', () => flyerFileInput.click());
  }

  if (flyerFileInput) {
    flyerFileInput.addEventListener('change', () => {
      const file = flyerFileInput.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona una imagen válida.', 'error');
        return;
      }

      flyerSelectedName.textContent = `Archivo seleccionado: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      btnSaveFlyer.style.display = 'inline-flex';

      const reader = new FileReader();
      reader.onload = () => {
        selectedFlyerBase64 = reader.result;
        adminFlyerPreview.src = selectedFlyerBase64;
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnSaveFlyer) {
    btnSaveFlyer.addEventListener('click', async () => {
      if (!selectedFlyerBase64) return;
      btnSaveFlyer.disabled = true;
      btnSaveFlyer.textContent = 'Subiendo afiche...';

      try {
        const res = await fetch('/api/admin/upload-flyer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin
          },
          body: JSON.stringify({ imageBase64: selectedFlyerBase64 })
        });

        if (res.ok) {
          showToast('¡Afiche oficial actualizado y publicado con éxito! 🖼️', 'success');
          btnSaveFlyer.style.display = 'none';
          btnSelectFlyerFile.textContent = '✓ Afiche Guardado';
          loadAdminData();
        } else {
          showToast('No se pudo subir la imagen.', 'error');
        }
      } catch {
        showToast('Error de conexión al subir afiche.', 'error');
      } finally {
        btnSaveFlyer.disabled = false;
        btnSaveFlyer.textContent = '💾 Guardar y Publicar Nuevo Afiche';
      }
    });
  }

  function fillConfigForm() {
    if (!currentData) return;
    const { config } = currentData;
    if (adminFlyerPreview && config.flyerUrl) {
      adminFlyerPreview.src = config.flyerUrl;
    }
    cfgName.value = config.name;
    if (cfgPrizeFirst) cfgPrizeFirst.value = config.prizeFirst || '$150.000 COP';
    if (cfgPrizeMiddle) cfgPrizeMiddle.value = config.prizeMiddle || '$150.000 COP';
    if (cfgPrizeLast) cfgPrizeLast.value = config.prizeLast || config.prize || '$400.000 COP';
    cfgLottery.value = config.lotteryName || 'Lotería Chontico Día y Noche';
    cfgPrice.value = config.price;
    cfgNequi.value = config.nequi;
    cfgPin.value = adminPin;
  }

  // Lista de Tablas y Pozos en la Configuración
  function renderTablesConfigList() {
    if (!adminTablesConfigList || !currentData || !currentData.tables) return;
    const tables = currentData.tables;

    adminTablesConfigList.innerHTML = tables.map(t => {
      const isExtra = t.id > 1;
      return `
        <div style="background: rgba(255,255,255,0.04); border: 1.5px solid var(--border); border-radius: 12px; padding: 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
            <strong style="font-size: 1rem; color: #fde047;">📋 ${escapeHtml(t.name)}</strong>
            ${isExtra ? `<button type="button" class="action-btn free" onclick="removeTable(${t.id}, '${escapeHtml(t.name)}')" style="padding: 4px 10px; font-size: 0.75rem;">🗑️ Eliminar Tabla</button>` : '<span style="font-size:0.75rem; color:var(--text-muted);">(Tabla Principal)</span>'}
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size:0.72rem; color:var(--text-muted); display:block; font-weight:700;">Pozo Acumulado (COP)</label>
              <input type="number" step="100000" id="cfgPozo_${t.id}" value="${t.pozoAmount || 5000000}" class="field-input" style="padding: 8px; font-size: 0.88rem; font-weight:700;">
            </div>
            <div>
              <label style="font-size:0.72rem; color:var(--text-muted); display:block; font-weight:700;">Suma por Rifa si no se gana</label>
              <input type="number" step="100000" id="cfgInc_${t.id}" value="${t.pozoIncrement || 500000}" class="field-input" style="padding: 8px; font-size: 0.88rem; font-weight:700;">
            </div>
          </div>

          <button type="button" class="btn-tool" onclick="saveTableConfig(${t.id})" style="margin-top: 10px; width: 100%; padding: 8px; font-size: 0.82rem; font-weight: 800;">
            💾 Guardar Pozo de ${escapeHtml(t.name)}
          </button>
        </div>
      `;
    }).join('');
  }

  window.saveTableConfig = async function(tableId) {
    const pozoInp = document.getElementById(`cfgPozo_${tableId}`);
    const incInp = document.getElementById(`cfgInc_${tableId}`);
    if (!pozoInp || !incInp) return;

    try {
      const res = await fetch('/api/admin/update-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({
          tableId,
          pozoAmount: parseInt(pozoInp.value, 10),
          pozoIncrement: parseInt(incInp.value, 10)
        })
      });
      if (res.ok) {
        showToast('¡Pozo de la tabla actualizado!', 'success');
        loadAdminData();
      } else {
        showToast('Error al actualizar pozo.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  };

  window.removeTable = async function(tableId, tableName) {
    if (!confirm(`¿Estás SEGURA de eliminar ${tableName}? Se borrarán sus 100 números y compradores.`)) return;
    try {
      const res = await fetch('/api/admin/remove-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ tableId })
      });
      if (res.ok) {
        showToast(`${tableName} eliminada correctamente.`, 'info');
        currentAdminTableId = 1;
        loadAdminData();
      } else {
        showToast('No se pudo eliminar la tabla.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  };

  function renderBuyers() {
    if (!currentData) return;
    const t = getSelectedAdminTable();
    const buyers = t ? t.buyers || [] : [];
    const query = (searchBuyer.value || '').toLowerCase().trim();

    const filtered = buyers.filter(b => {
      if (activeFilter === 'reserved' && b.status !== 'reserved') return false;
      if (activeFilter === 'paid' && b.status !== 'paid') return false;
      if (activeFilter === 'proof' && !b.proofImage) return false;

      if (query) {
        const numStr = String(b.num).padStart(2, '0');
        const nameStr = (b.name || '').toLowerCase();
        const phoneStr = (b.phone || '').toLowerCase();
        return numStr.includes(query) || nameStr.includes(query) || phoneStr.includes(query);
      }
      return true;
    });

    const resCount = buyers.filter(b => b.status === 'reserved').length;
    const paidCount = buyers.filter(b => b.status === 'paid').length;
    const proofCount = buyers.filter(b => !!b.proofImage).length;

    filterAllCount.textContent = buyers.length;
    filterResCount.textContent = resCount;
    filterPaidCount.textContent = paidCount;
    if (filterProofCount) filterProofCount.textContent = proofCount;

    if (filtered.length === 0) {
      buyersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">
            No hay participantes en ${t ? escapeHtml(t.name) : 'esta tabla'} con este filtro.
          </td>
        </tr>
      `;
      updateBatchUI();
      return;
    }

    buyersTableBody.innerHTML = filtered.map(b => {
      const numFormatted = String(b.num).padStart(2, '0');
      const isReserved = b.status === 'reserved';
      const cleanPhone = (b.phone || '').replace(/\D/g, '');
      const isChecked = selectedBatchNumbers.has(b.num);
      
      let timeNotice = '';
      if (isReserved && b.timeLeftSec !== undefined) {
        const m = Math.floor(b.timeLeftSec / 60);
        const s = b.timeLeftSec % 60;
        timeNotice = `<div style="font-size:0.75rem; color:#d97706; font-weight:700;">Expira en ${m}:${String(s).padStart(2, '0')}</div>`;
      }

      const tableName = t ? t.name : '';
      const waMsg = `Hola ${b.name}, te escribo de DINERO EXPRESS por tu boleta ${numFormatted} (${tableName}) con la Lotería Chontico.`;
      const waUrl = `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(waMsg)}`;

      return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" class="buyer-checkbox" data-num="${b.num}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color: var(--nequi-pink);">
          </td>
          <td><strong style="font-size:1.15rem; color:var(--nequi-pink); font-family:monospace;">${numFormatted}</strong></td>
          <td><strong>${escapeHtml(b.name || 'Sin nombre')}</strong></td>
          <td><span style="font-family:monospace;">${escapeHtml(b.phone || 'Sin celular')}</span></td>
          <td>
            <span style="display:inline-block; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; ${b.status === 'reserved' ? 'background:var(--res-bg); color:var(--res-text); border:1px solid var(--res-border);' : 'background:var(--free-bg); color:var(--free-text); border:1px solid var(--free-border);'}">
              ${b.status === 'reserved' ? 'Apartado' : 'Pagado'}
            </span>
            ${timeNotice}
          </td>
          <td style="text-align: right;">
            <div class="action-group">
              ${b.proofImage ? `<button class="action-btn" style="background:#8b5cf6; color:white;" onclick="viewProof('${b.proofImage}', ${b.num}, '${escapeHtml(b.name)}')">👁️ Recibo</button>` : ''}
              ${cleanPhone ? `<a href="${waUrl}" target="_blank" class="action-btn wa" title="Abrir WhatsApp">💬 WA</a>` : ''}
              ${isReserved ? `<button class="action-btn pay" onclick="setStatus(${b.num}, 'paid')">✓ Marcar Pagado</button>` : ''}
              <button class="action-btn free" onclick="setStatus(${b.num}, 'free')">✕ Liberar</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const checkboxes = buyersTableBody.querySelectorAll('.buyer-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const n = parseInt(cb.dataset.num, 10);
        if (cb.checked) {
          selectedBatchNumbers.add(n);
        } else {
          selectedBatchNumbers.delete(n);
        }
        updateBatchUI();
      });
    });

    updateBatchUI();
  }

  function updateBatchUI() {
    const count = selectedBatchNumbers.size;
    batchSelectedCount.textContent = count;
    if (count > 0) {
      batchActionBar.style.display = 'flex';
    } else {
      batchActionBar.style.display = 'none';
      selectAllCheckbox.checked = false;
    }
  }

  selectAllCheckbox.addEventListener('change', () => {
    const isChecked = selectAllCheckbox.checked;
    const checkboxes = buyersTableBody.querySelectorAll('.buyer-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = isChecked;
      const n = parseInt(cb.dataset.num, 10);
      if (isChecked) {
        selectedBatchNumbers.add(n);
      } else {
        selectedBatchNumbers.delete(n);
      }
    });
    updateBatchUI();
  });

  // Acciones en Lote con tableId
  if (btnBatchMarkPaid) {
    btnBatchMarkPaid.addEventListener('click', async () => {
      const nums = Array.from(selectedBatchNumbers);
      if (!nums.length) return;
      if (!confirm(`¿Marcar ${nums.length} boletas como PAGADAS en la tabla seleccionada?`)) return;

      btnBatchMarkPaid.disabled = true;
      btnBatchMarkPaid.textContent = 'Actualizando...';

      try {
        const res = await fetch('/api/admin/set-batch-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin
          },
          body: JSON.stringify({ numbers: nums, status: 'paid', tableId: currentAdminTableId })
        });

        if (res.ok) {
          showToast(`¡${nums.length} boletas marcadas como PAGADAS! ✓`, 'success');
          selectedBatchNumbers.clear();
          loadAdminData();
        } else {
          showToast('Error al actualizar lote.', 'error');
        }
      } catch {
        showToast('Error de conexión.', 'error');
      } finally {
        btnBatchMarkPaid.disabled = false;
        btnBatchMarkPaid.textContent = '✓ Marcar Selección como PAGADAS';
      }
    });
  }

  if (btnBatchFree) {
    btnBatchFree.addEventListener('click', async () => {
      const nums = Array.from(selectedBatchNumbers);
      if (!nums.length) return;
      if (!confirm(`¿LIBERAR ${nums.length} boletas para dejarlas disponibles de nuevo?`)) return;

      btnBatchFree.disabled = true;
      btnBatchFree.textContent = 'Liberando...';

      try {
        const res = await fetch('/api/admin/set-batch-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-pin': adminPin
          },
          body: JSON.stringify({ numbers: nums, status: 'free', tableId: currentAdminTableId })
        });

        if (res.ok) {
          showToast(`¡${nums.length} boletas liberadas exitosamente!`, 'success');
          selectedBatchNumbers.clear();
          loadAdminData();
        } else {
          showToast('Error al liberar lote.', 'error');
        }
      } catch {
        showToast('Error de conexión.', 'error');
      } finally {
        btnBatchFree.disabled = false;
        btnBatchFree.textContent = '✕ Liberar Selección';
      }
    });
  }

  // Cambiar estado de 1 número con tableId
  window.setStatus = async function(num, status) {
    const actionLabel = status === 'paid' ? 'PAGADO' : 'LIBRE';
    if (!confirm(`¿Marcar el número ${String(num).padStart(2, '0')} como ${actionLabel}?`)) return;

    try {
      const res = await fetch('/api/admin/set-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify({ num, status, tableId: currentAdminTableId })
      });

      if (res.ok) {
        showToast(`Número ${String(num).padStart(2, '0')} actualizado a ${actionLabel}.`, 'success');
        selectedBatchNumbers.delete(num);
        loadAdminData();
      } else {
        showToast('Error al actualizar estado.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  };

  // Ver Recibo
  window.viewProof = function(url, num, name) {
    currentViewingProofNum = num;
    proofModalTitle.textContent = `Comprobante · Boleta #${String(num).padStart(2, '0')} - ${name}`;
    proofModalImg.src = url;
    proofViewModal.style.display = 'flex';
  };

  if (btnProofApprove) {
    btnProofApprove.addEventListener('click', async () => {
      if (!currentViewingProofNum) return;
      proofViewModal.style.display = 'none';
      await setStatus(currentViewingProofNum, 'paid');
      currentViewingProofNum = null;
    });
  }

  if (btnCloseProofViewModal) btnCloseProofViewModal.onclick = () => { proofViewModal.style.display = 'none'; };
  if (btnCloseProofViewBtn) btnCloseProofViewBtn.onclick = () => { proofViewModal.style.display = 'none'; };

  // Guardar Configuración
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      name: cfgName.value.trim(),
      prizeFirst: cfgPrizeFirst ? cfgPrizeFirst.value.trim() : '$150.000 COP',
      prizeMiddle: cfgPrizeMiddle ? cfgPrizeMiddle.value.trim() : '$150.000 COP',
      prizeLast: cfgPrizeLast ? cfgPrizeLast.value.trim() : '$400.000 COP',
      prize: cfgPrizeLast ? cfgPrizeLast.value.trim() : '$400.000 COP',
      lottery_name: cfgLottery.value.trim(),
      price: parseInt(cfgPrice.value, 10),
      nequi: cfgNequi.value.trim(),
      admin_pin: cfgPin.value.trim()
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast('¡Configuración guardada exitosamente!', 'success');
        if (payload.admin_pin !== adminPin) {
          adminPin = payload.admin_pin;
          sessionStorage.setItem('raffle_admin_pin', adminPin);
        }
        loadAdminData();
      } else {
        showToast('No se pudo guardar la configuración.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  // Reiniciar Rifa
  btnResetRaffle.addEventListener('click', async () => {
    const confirmation = prompt('⚠️ ACCIÓN IRREVERSIBLE ⚠️\nEscribe "REINICIAR" para dejar libres todos los números y borrar los datos de venta:');
    if (confirmation !== 'REINICIAR') {
      showToast('Reinicio cancelado.', 'info');
      return;
    }

    try {
      const res = await fetch('/api/admin/reset-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        }
      });

      if (res.ok) {
        showToast('Rifa reiniciada correctamente.', 'success');
        selectedBatchNumbers.clear();
        currentAdminTableId = 1;
        loadAdminData();
      } else {
        showToast('Error al reiniciar rifa.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  // Cambiar estado global
  async function updateRaffleStatus(status) {
    try {
      const res = await fetch('/api/admin/set-raffle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify({ status })
      });

      if (res.ok) {
        showToast('Estado de la rifa actualizado.', 'success');
        loadAdminData();
      } else {
        showToast('Error al cambiar estado.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  }

  btnSetPreLaunch.addEventListener('click', () => {
    if (confirm('¿Poner la rifa en modo Pre-Lanzamiento? Los participantes verán la información pero NO podrán comprar números todavía.')) {
      updateRaffleStatus('pre_launch');
    }
  });

  btnSetActive.addEventListener('click', () => {
    if (confirm('¿Abrir las ventas ahora mismo? Todos los participantes podrán escoger y apartar sus números de inmediato.')) {
      updateRaffleStatus('active');
    }
  });

  // Renderizar Ganadores de TODAS las Tablas con Pozo y WhatsApp
  function renderAllTablesLotteryWinners(tablesResults, lotteryDrawn) {
    if (!lotteryResultCard || !tablesResults || !tablesResults.length) return;

    lotteryResultCard.style.display = 'block';
    const drawnLabel = lotteryDrawn ? ` (Sorteo Chontico: ${escapeHtml(lotteryDrawn)})` : '';

    let html = `
      <div style="font-size: 1.25rem; font-weight: 900; color: #10b981; margin-bottom: 4px; text-align: center;">
        🎉 ¡RESULTADOS OFICIALES LOTERÍA CHONTICO${drawnLabel}!
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-bottom: 16px;">
        Presiona el botón verde de cada ganador para notificarlo directamente a su WhatsApp.
      </p>
    `;

    tablesResults.forEach(table => {
      const tName = table.tableName || table.name || `Tabla ${table.tableId || table.id}`;
      const winners = table.winners || [];
      const pozoWon = !!table.pozoWon;
      const pozoWinner = table.pozoWinnerName;
      const pozoAmount = table.pozoAmount || 5000000;

      html += `
        <div style="background: rgba(255, 255, 255, 0.04); border: 2px solid var(--nequi-pink); border-radius: 16px; padding: 16px; margin-bottom: 16px;">
          <div style="font-size: 1.15rem; font-weight: 900; color: #fde047; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span>📋 ${escapeHtml(tName)}</span>
            <span style="font-size: 0.85rem; color: #a7f3d0;">Pozo: ${formatCOP(pozoAmount)}</span>
          </div>
      `;

      // Banner de Pozo Acumulado
      if (pozoWon && pozoWinner) {
        html += `
          <div style="background: linear-gradient(135deg, #92400e, #b45309); border: 2px solid #fde047; border-radius: 12px; padding: 12px; text-align: center; margin-bottom: 12px; box-shadow: 0 4px 14px rgba(253, 224, 71, 0.3);">
            <div style="font-size: 1.4rem;">🎰💰👑</div>
            <div style="font-size: 0.95rem; font-weight: 900; color: #fde047;">¡POZO ACUMULADO GANADO!</div>
            <div style="font-size: 1.15rem; font-weight: 900; color: #ffffff; margin: 2px 0;">
              ${escapeHtml(pozoWinner)} acertó las primeras 2 y últimas 2 cifras
            </div>
            <div style="font-size: 1.25rem; font-weight: 900; color: #4ade80;">
              Premio: ${formatCOP(pozoAmount)} COP
            </div>
          </div>
        `;
      } else {
        html += `
          <div style="background: rgba(0, 0, 0, 0.25); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 10px; padding: 10px; font-size: 0.82rem; color: #cbd5e1; margin-bottom: 12px; text-align: center;">
            💰 <strong>Pozo Acumulado:</strong> Nadie acertó ambas cifras en esta tabla. Se acumula automáticamente a <strong>${formatCOP(pozoAmount)} COP</strong> para la próxima rifa.
          </div>
        `;
      }

      // 3 Ganadores de la tabla
      html += `<div style="display: flex; flex-direction: column; gap: 10px;">`;
      winners.forEach(w => {
        const waBtn = w.waUrl
          ? `<a href="${w.waUrl}" target="_blank" rel="noopener noreferrer" class="action-btn wa" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 10px 14px; margin-top: 8px; font-size: 0.88rem; font-weight: 800; border-radius: 10px; background: #25D366; color: #ffffff; text-decoration: none; box-shadow: 0 4px 12px rgba(37,211,102,0.35);">
               💬 Notificar por WhatsApp a ${escapeHtml(w.name)} (${escapeHtml(w.phone)})
             </a>`
          : `<div style="margin-top: 6px; font-size: 0.78rem; color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 6px; border-radius: 8px; text-align: center;">
               ⚠️ Sin celular registrado para WhatsApp
             </div>`;

        html += `
          <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 0.72rem; font-weight: 800; color: #a7f3d0; text-transform: uppercase;">
                ${escapeHtml(w.tier)}
              </span>
              <span style="font-size: 1.1rem; font-weight: 900; color: #34d399;">
                ${escapeHtml(w.prize)}
              </span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 900; color: #ffffff;">
              Boleta <strong style="color: var(--nequi-pink); font-size: 1.25rem;">#${escapeHtml(w.num)}</strong>
            </div>
            <div style="font-size: 0.92rem; margin-top: 2px; color: var(--text-main);">
              👤 Ganador(a): <strong>${escapeHtml(w.name)}</strong>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              📱 Celular: <strong>${escapeHtml(w.phone || 'Sin número')}</strong> · Estado: <span class="badge ${w.status}">${w.status.toUpperCase()}</span>
            </div>
            ${waBtn}
          </div>
        `;
      });
      html += `</div></div>`;
    });

    html += `
      <button class="btn-tool" onclick="copyTemplate('winner')" style="margin-top: 10px; width: 100%; padding: 12px 14px; font-size: 0.92rem; font-weight: 800;">
        📋 Copiar Resumen Completo para el Grupo de WhatsApp
      </button>
    `;

    lotteryResultCard.innerHTML = html;
  }

  // Registrar Ganador de Lotería Chontico
  btnDeclareLotteryWinner.addEventListener('click', async () => {
    const rawNumber = (lotteryInputNumber.value || '').trim();
    if (!rawNumber) {
      showToast('Escribe el número de la lotería.', 'error');
      return;
    }

    if (!confirm(`¿Confirmas que el resultado de la Lotería Chontico fue ${rawNumber}? El sistema comprobará todas las tablas activas.`)) return;

    btnDeclareLotteryWinner.disabled = true;
    btnDeclareLotteryWinner.textContent = 'Comprobando todas las tablas...';

    try {
      const res = await fetch('/api/admin/set-lottery-winner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify({ rawNumber })
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Error al registrar resultado.', 'error');
        return;
      }

      if (data.results && data.results.length > 0) {
        renderAllTablesLotteryWinners(data.results, data.lotteryDrawn);
      }

      showToast('¡Resultados calculados y registrados para todas las tablas! 🏆', 'success');
      loadAdminData();
    } catch {
      showToast('Error de conexión.', 'error');
    } finally {
      btnDeclareLotteryWinner.disabled = false;
      btnDeclareLotteryWinner.textContent = '🎯 Comprobar';
    }
  });

  // Plantillas de WhatsApp
  function renderTemplateWinnerButtons() {
    if (!directWinnersButtonsContainer || !currentData || !currentData.tables) return;
    const tables = currentData.tables.filter(t => t.winners && t.winners.length > 0);
    if (!tables.length) {
      directWinnersButtonsContainer.innerHTML = '';
      return;
    }

    let html = `
      <div style="font-size: 0.85rem; font-weight: 800; color: #a7f3d0; margin-top: 10px; margin-bottom: 6px;">
        📲 Notificar individualmente por WhatsApp a cada ganador:
      </div>
    `;

    tables.forEach(t => {
      html += `<div style="font-size:0.8rem; font-weight:800; color:#fde047; margin-top:6px;">📋 ${escapeHtml(t.name)}:</div>`;
      (t.winners || []).forEach(w => {
        if (w.waUrl) {
          html += `
            <a href="${w.waUrl}" target="_blank" rel="noopener noreferrer" class="action-btn wa" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 9px 12px; font-size: 0.85rem; font-weight: 800; border-radius: 10px; background: #25D366; color: #ffffff; text-decoration: none; margin-bottom: 4px; box-shadow: 0 3px 10px rgba(37,211,102,0.3);">
              💬 Notificar a ${escapeHtml(w.name)} (${escapeHtml(w.phone)}) · Boleta #${w.num} (${w.prize})
            </a>
          `;
        } else {
          html += `
            <div style="font-size: 0.78rem; color: var(--text-muted); padding: 6px 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom:3px;">
              ⚠️ Boleta #${w.num} (${escapeHtml(w.tier)}): Sin celular registrado (${escapeHtml(w.name)})
            </div>
          `;
        }
      });
    });

    directWinnersButtonsContainer.innerHTML = html;
  }

  async function loadWhatsAppTemplates() {
    try {
      const res = await fetch('/api/admin/whatsapp-templates', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (!res.ok) return;
      const data = await res.json();
      cachedTemplates = data.templates || {};

      templatePreLaunch.textContent = cachedTemplates.preLaunch || '';
      templateActive.textContent = cachedTemplates.active || '';
      templateRemaining.textContent = cachedTemplates.remaining || '';
      templateWinner.textContent = cachedTemplates.winner || '';
      renderTemplateWinnerButtons();
    } catch {}
  }

  window.copyTemplate = async function(key) {
    const text = cachedTemplates[key];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('¡Mensaje copiado! Pégalo en tu grupo de WhatsApp.', 'success');
    } catch {
      prompt('Copia este mensaje:', text);
    }
  };

  // Filtros
  searchBuyer.addEventListener('input', renderBuyers);
  chipFilters.forEach(btn => {
    btn.addEventListener('click', () => {
      chipFilters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderBuyers();
    });
  });

  // Pestañas
  function showTab(tab) {
    [tabBtnBuyers, tabBtnWhatsApp, tabBtnLottery, tabBtnConfig].forEach(b => b.classList.remove('active'));
    [sectionBuyers, sectionWhatsApp, sectionLottery, sectionConfig].forEach(s => s.style.display = 'none');

    if (tab === 'buyers') {
      tabBtnBuyers.classList.add('active');
      sectionBuyers.style.display = 'block';
    } else if (tab === 'whatsapp') {
      tabBtnWhatsApp.classList.add('active');
      sectionWhatsApp.style.display = 'block';
      loadWhatsAppTemplates();
    } else if (tab === 'lottery') {
      tabBtnLottery.classList.add('active');
      sectionLottery.style.display = 'block';
    } else if (tab === 'config') {
      tabBtnConfig.classList.add('active');
      sectionConfig.style.display = 'block';
    }
  }

  tabBtnBuyers.addEventListener('click', () => showTab('buyers'));
  tabBtnWhatsApp.addEventListener('click', () => showTab('whatsapp'));
  tabBtnLottery.addEventListener('click', () => showTab('lottery'));
  tabBtnConfig.addEventListener('click', () => showTab('config'));

  // Exportar Excel (CSV)
  btnExportCSV.addEventListener('click', () => {
    window.location.href = `/api/admin/export-csv?pin=${encodeURIComponent(adminPin)}`;
    showToast('Descargando archivo Excel...', 'success');
  });

  // Descargar Respaldo Completo JSON
  if (btnDownloadBackup) {
    btnDownloadBackup.addEventListener('click', () => {
      window.location.href = `/api/admin/backup-json?pin=${encodeURIComponent(adminPin)}`;
      showToast('Descargando copia de seguridad JSON...', 'success');
    });
  }

  // Debounce SSE para alto tráfico
  let adminSseDebounce = null;
  function debouncedLoadAdminData() {
    if (adminSseDebounce) clearTimeout(adminSseDebounce);
    adminSseDebounce = setTimeout(() => {
      loadAdminData();
    }, 250);
  }

  // SSE
  function connectSSE() {
    const es = new EventSource('/api/events');
    es.addEventListener('numbers_updated', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.action === 'reserved') {
          playNotificationChime();
          showToast(`🔔 ¡Nueva boleta apartada!`, 'info');
        } else if (d.action === 'proof_uploaded') {
          playNotificationChime();
          showToast(`📸 ¡Nuevo comprobante de pago subido!`, 'success');
        }
      } catch {}
      debouncedLoadAdminData();
    });
    es.addEventListener('numbers_released', () => debouncedLoadAdminData());
    es.addEventListener('raffle_status_changed', () => debouncedLoadAdminData());
    es.addEventListener('winner_announced', () => debouncedLoadAdminData());
    es.addEventListener('config_updated', () => debouncedLoadAdminData());
    es.addEventListener('table_added', () => debouncedLoadAdminData());
    es.addEventListener('table_removed', () => debouncedLoadAdminData());
    es.addEventListener('raffle_reset', () => {
      selectedBatchNumbers.clear();
      currentAdminTableId = 1;
      debouncedLoadAdminData();
      showToast('La rifa ha sido reiniciada.', 'info');
    });
    es.onerror = () => {};
  }
})();
