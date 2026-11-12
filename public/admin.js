// admin.js - Panel de Control DINERO EXPRESS
(function () {
  let adminPin = sessionStorage.getItem('raffle_admin_pin') || '';
  let currentData = null;
  let activeFilter = 'all';
  let cachedTemplates = {};

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

  const searchBuyer = document.getElementById('searchBuyer');
  const buyersTableBody = document.getElementById('buyersTableBody');
  const chipFilters = document.querySelectorAll('.chip-filter[data-filter]');
  const filterAllCount = document.getElementById('filterAllCount');
  const filterResCount = document.getElementById('filterResCount');
  const filterPaidCount = document.getElementById('filterPaidCount');

  const configForm = document.getElementById('configForm');
  const cfgName = document.getElementById('cfgName');
  const cfgPrize = document.getElementById('cfgPrize');
  const cfgLottery = document.getElementById('cfgLottery');
  const cfgPrice = document.getElementById('cfgPrice');
  const cfgNequi = document.getElementById('cfgNequi');
  const cfgPin = document.getElementById('cfgPin');
  const btnResetRaffle = document.getElementById('btnResetRaffle');
  const btnExportCSV = document.getElementById('btnExportCSV');

  // Lotería Chontico
  const lotteryInputNumber = document.getElementById('lotteryInputNumber');
  const btnDeclareLotteryWinner = document.getElementById('btnDeclareLotteryWinner');
  const lotteryResultCard = document.getElementById('lotteryResultCard');

  // Plantillas WA
  const templatePreLaunch = document.getElementById('templatePreLaunch');
  const templateActive = document.getElementById('templateActive');
  const templateRemaining = document.getElementById('templateRemaining');
  const templateWinner = document.getElementById('templateWinner');

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
      renderStats();
      renderStatusBadge();
      renderBuyers();
      fillConfigForm();
      loadWhatsAppTemplates();
    } catch (err) {
      console.error(err);
    }
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
    const { stats, config } = currentData;
    
    statCollected.textContent = formatCOP(stats.collectedAmount);
    statPotential.textContent = formatCOP(stats.potentialAmount);
    statGoal.textContent = formatCOP(stats.totalGoal);
    statCount.textContent = `${stats.paid} / ${config.totalNumbers} (${stats.percentPaid}%)`;
    statProgress.style.width = `${stats.percentPaid}%`;
  }

  // Gestor de Afiche
  const adminFlyerPreview = document.getElementById('adminFlyerPreview');
  const flyerFileInput = document.getElementById('flyerFileInput');
  const btnSelectFlyerFile = document.getElementById('btnSelectFlyerFile');
  const flyerSelectedName = document.getElementById('flyerSelectedName');
  const btnSaveFlyer = document.getElementById('btnSaveFlyer');
  let selectedFlyerBase64 = null;

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

      flyerSelectedName.textContent = `Archivo: ${file.name} (${Math.round(file.size / 1024)} KB)`;
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
    cfgPrize.value = config.prize;
    cfgLottery.value = config.lotteryName || 'Lotería Chontico Día y Noche';
    cfgPrice.value = config.price;
    cfgNequi.value = config.nequi;
    cfgPin.value = adminPin;
  }

  function renderBuyers() {
    if (!currentData) return;
    const buyers = currentData.buyers || [];
    const query = (searchBuyer.value || '').toLowerCase().trim();

    const filtered = buyers.filter(b => {
      if (activeFilter === 'reserved' && b.status !== 'reserved') return false;
      if (activeFilter === 'paid' && b.status !== 'paid') return false;

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

    filterAllCount.textContent = buyers.length;
    filterResCount.textContent = resCount;
    filterPaidCount.textContent = paidCount;

    if (filtered.length === 0) {
      buyersTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">
            No hay participantes en este filtro.
          </td>
        </tr>
      `;
      return;
    }

    buyersTableBody.innerHTML = filtered.map(b => {
      const numFormatted = String(b.num).padStart(2, '0');
      const isReserved = b.status === 'reserved';
      const cleanPhone = (b.phone || '').replace(/\D/g, '');
      
      let timeNotice = '';
      if (isReserved && b.timeLeftSec !== undefined) {
        const m = Math.floor(b.timeLeftSec / 60);
        const s = b.timeLeftSec % 60;
        timeNotice = `<div style="font-size:0.75rem; color:#d97706; font-weight:700;">Expira en ${m}:${String(s).padStart(2, '0')}</div>`;
      }

      const waMsg = `Hola ${b.name}, te escribo de DINERO EXPRESS por tu boleta ${numFormatted} con la Lotería Chontico.`;
      const waUrl = `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(waMsg)}`;

      return `
        <tr>
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
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // Comprobante
  window.viewProof = function(url, num, name) {
    currentViewingProofNum = num;
    proofModalImg.src = url;
    proofModalTitle.textContent = `Comprobante N° ${String(num).padStart(2, '0')} - ${name}`;
    proofViewModal.style.display = 'flex';
  };

  if (btnCloseProofViewModal) btnCloseProofViewModal.onclick = () => proofViewModal.style.display = 'none';
  if (btnCloseProofViewBtn) btnCloseProofViewBtn.onclick = () => proofViewModal.style.display = 'none';
  if (btnProofApprove) {
    btnProofApprove.onclick = () => {
      if (currentViewingProofNum) {
        proofViewModal.style.display = 'none';
        setStatus(currentViewingProofNum, 'paid');
      }
    };
  }

  window.setStatus = async function (num, status) {
    const actionLabel = status === 'paid' ? 'marcar como PAGADO' : 'LIBERAR este número';
    if (!confirm(`¿Seguro que deseas ${actionLabel} el número ${num}?`)) return;

    try {
      const res = await fetch('/api/admin/set-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify({ num, status })
      });

      if (res.ok) {
        showToast(status === 'paid' ? `Número ${num} marcado como pagado.` : `Número ${num} liberado.`, 'success');
        loadAdminData();
      } else {
        showToast('No se pudo actualizar.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  };

  // Cambiar Estado de la Rifa
  async function updateRaffleStatus(newStatus) {
    try {
      const res = await fetch('/api/admin/set-raffle-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Estado cambiado a: ${newStatus === 'active' ? 'Abierta para Ventas' : 'En Espera (Pre-Lanzamiento)'}`, 'success');
        loadAdminData();
      }
    } catch {
      showToast('Error al cambiar estado.', 'error');
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

  // Cargar Plantillas de WhatsApp
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

  // Registrar Ganador de Lotería Chontico
  btnDeclareLotteryWinner.addEventListener('click', async () => {
    const rawNumber = (lotteryInputNumber.value || '').trim();
    if (!rawNumber) {
      showToast('Escribe el número de la lotería.', 'error');
      return;
    }

    if (!confirm(`¿Confirmas que el resultado de la Lotería Chontico fue ${rawNumber}?`)) return;

    btnDeclareLotteryWinner.disabled = true;
    btnDeclareLotteryWinner.textContent = 'Comprobando...';

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

      lotteryResultCard.style.display = 'block';
      lotteryResultCard.innerHTML = `
        <div style="font-size: 1.1rem; font-weight: 800; color: #10b981; margin-bottom: 6px;">
          🎉 ¡Resultado Oficial Lotería Chontico: ${data.lotteryDrawn}!
        </div>
        <div style="font-size: 0.95rem;">
          Número ganador en boleta: <strong style="font-size: 1.25rem; color: var(--nequi-pink);">${data.targetNum}</strong>
        </div>
        <div style="font-size: 1rem; margin-top: 4px;">
          Afortunado(a): <strong>${escapeHtml(data.winnerName)}</strong>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          Celular: ${escapeHtml(data.winnerPhone || 'Sin celular')} · Estado de Boleta: <strong>${data.ticketStatus.toUpperCase()}</strong>
        </div>
        <button class="btn-proceed" onclick="copyTemplate('winner')" style="margin-top: 10px; padding: 8px 14px; font-size: 0.85rem;">
          📋 Copiar Mensaje de Felicitación para WhatsApp
        </button>
      `;

      showToast(`¡Ganador registrado: Número ${data.targetNum}!`, 'success');
      loadAdminData();
    } catch {
      showToast('Error de conexión.', 'error');
    } finally {
      btnDeclareLotteryWinner.disabled = false;
      btnDeclareLotteryWinner.textContent = '🎯 Comprobar';
    }
  });

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

  // Guardar configuración
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newConfig = {
      name: cfgName.value.trim(),
      prize: cfgPrize.value.trim(),
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
        body: JSON.stringify(newConfig)
      });

      if (res.ok) {
        adminPin = newConfig.admin_pin;
        sessionStorage.setItem('raffle_admin_pin', adminPin);
        showToast('¡Configuración de DINERO EXPRESS guardada!', 'success');
        loadAdminData();
      } else {
        showToast('Error al guardar.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  // Reiniciar rifa
  btnResetRaffle.addEventListener('click', async () => {
    if (!confirm('⚠️ ¡ATENCIÓN! Esto liberará todos los números. ¿Deseas continuar?')) return;
    const check = prompt('Escribe REINICIAR en mayúsculas para confirmar:');
    if (check !== 'REINICIAR') return;

    try {
      const res = await fetch('/api/admin/reset-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        }
      });
      if (res.ok) {
        showToast('Rifa reiniciada por completo.', 'success');
        lotteryResultCard.style.display = 'none';
        loadAdminData();
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  function connectSSE() {
    const es = new EventSource('/api/events');
    es.addEventListener('numbers_updated', () => loadAdminData());
    es.addEventListener('numbers_released', () => loadAdminData());
    es.addEventListener('config_updated', () => loadAdminData());
    es.addEventListener('raffle_reset', () => loadAdminData());
    es.addEventListener('raffle_status_changed', () => loadAdminData());
    es.addEventListener('winner_announced', () => loadAdminData());
  }

  setInterval(() => {
    if (currentData) loadAdminData();
  }, 10000);
})();
