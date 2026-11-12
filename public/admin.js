// admin.js - Panel de Control para la Organizadora
(function () {
  let adminPin = sessionStorage.getItem('raffle_admin_pin') || '';
  let currentData = null;
  let activeFilter = 'all';

  // DOM
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const adminPinInput = document.getElementById('adminPinInput');
  const adminPanel = document.getElementById('adminPanel');

  const statCollected = document.getElementById('statCollected');
  const statPotential = document.getElementById('statPotential');
  const statGoal = document.getElementById('statGoal');
  const statCount = document.getElementById('statCount');
  const statProgress = document.getElementById('statProgress');
  const headerSub = document.getElementById('headerSub');

  const tabBtnBuyers = document.getElementById('tabBtnBuyers');
  const tabBtnConfig = document.getElementById('tabBtnConfig');
  const tabBtnDraw = document.getElementById('tabBtnDraw');
  const sectionBuyers = document.getElementById('sectionBuyers');
  const sectionConfig = document.getElementById('sectionConfig');
  const sectionDraw = document.getElementById('sectionDraw');

  const searchBuyer = document.getElementById('searchBuyer');
  const buyersTableBody = document.getElementById('buyersTableBody');
  const chipFilters = document.querySelectorAll('.chip-filter[data-filter]');
  const filterAllCount = document.getElementById('filterAllCount');
  const filterResCount = document.getElementById('filterResCount');
  const filterPaidCount = document.getElementById('filterPaidCount');

  const configForm = document.getElementById('configForm');
  const cfgName = document.getElementById('cfgName');
  const cfgPrize = document.getElementById('cfgPrize');
  const cfgPrice = document.getElementById('cfgPrice');
  const cfgNequi = document.getElementById('cfgNequi');
  const cfgPin = document.getElementById('cfgPin');
  const btnResetRaffle = document.getElementById('btnResetRaffle');
  const btnShareWhatsApp = document.getElementById('btnShareWhatsApp');
  const btnExportCSV = document.getElementById('btnExportCSV');

  const btnRunDraw = document.getElementById('btnRunDraw');
  const winnerBox = document.getElementById('winnerBox');
  const winnerNumber = document.getElementById('winnerNumber');
  const winnerBuyer = document.getElementById('winnerBuyer');
  const winnerPhone = document.getElementById('winnerPhone');

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
      renderBuyers();
      fillConfigForm();
    } catch (err) {
      console.error(err);
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

    headerSub.textContent = `${config.name} · Premio: ${config.prize}`;
  }

  function fillConfigForm() {
    if (!currentData) return;
    const { config } = currentData;
    cfgName.value = config.name;
    cfgPrize.value = config.prize;
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

      const waMsg = `Hola ${b.name}, te escribo de la rifa "${currentData.config.name}" por tu número ${numFormatted}.`;
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

  // Modal de Comprobante
  const proofViewModal = document.getElementById('proofViewModal');
  const proofModalImg = document.getElementById('proofModalImg');
  const proofModalTitle = document.getElementById('proofModalTitle');
  const btnCloseProofViewModal = document.getElementById('btnCloseProofViewModal');
  const btnCloseProofViewBtn = document.getElementById('btnCloseProofViewBtn');
  const btnProofApprove = document.getElementById('btnProofApprove');
  let currentViewingProofNum = null;

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
    [tabBtnBuyers, tabBtnConfig, tabBtnDraw].forEach(b => b.classList.remove('active'));
    [sectionBuyers, sectionConfig, sectionDraw].forEach(s => s.style.display = 'none');

    if (tab === 'buyers') {
      tabBtnBuyers.classList.add('active');
      sectionBuyers.style.display = 'block';
    } else if (tab === 'config') {
      tabBtnConfig.classList.add('active');
      sectionConfig.style.display = 'block';
    } else if (tab === 'draw') {
      tabBtnDraw.classList.add('active');
      sectionDraw.style.display = 'block';
    }
  }

  tabBtnBuyers.addEventListener('click', () => showTab('buyers'));
  tabBtnConfig.addEventListener('click', () => showTab('config'));
  tabBtnDraw.addEventListener('click', () => showTab('draw'));

  // Exportar a Excel (CSV)
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
        showToast('¡Configuración guardada correctamente!', 'success');
        loadAdminData();
      } else {
        showToast('Error al guardar.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  // Sorteo Digital
  btnRunDraw.addEventListener('click', async () => {
    if (!confirm('¿Deseas realizar el sorteo digital ahora mismo entre las boletas pagadas?')) return;

    btnRunDraw.disabled = true;
    btnRunDraw.textContent = '🎰 Girando ruleta...';

    try {
      const res = await fetch('/api/admin/draw-winner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin
        }
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'No se pudo realizar el sorteo.', 'error');
        return;
      }

      // Animación de números antes de mostrar el ganador
      winnerBox.style.display = 'block';
      let ticks = 0;
      const interval = setInterval(() => {
        winnerNumber.textContent = String(Math.floor(Math.random() * 100) + 1).padStart(2, '0');
        ticks++;
        if (ticks > 20) {
          clearInterval(interval);
          const w = data.winner;
          winnerNumber.textContent = String(w.num).padStart(2, '0');
          winnerBuyer.textContent = `Ganador(a): ${w.name}`;
          winnerPhone.textContent = `Celular: ${w.phone}`;
          showToast(`¡Tenemos ganador! Número ${w.num} 🎉`, 'success');
        }
      }, 70);

    } catch {
      showToast('Error de conexión.', 'error');
    } finally {
      btnRunDraw.disabled = false;
      btnRunDraw.textContent = '🎰 Girar de Nuevo';
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
        winnerBox.style.display = 'none';
        loadAdminData();
      }
    } catch {
      showToast('Error de conexión.', 'error');
    }
  });

  // Compartir en WhatsApp
  btnShareWhatsApp.addEventListener('click', async () => {
    if (!currentData) return;
    const { config, stats } = currentData;
    const url = window.location.origin;

    const shareText = `🎟️ *¡GRAN RIFA ${config.name.toUpperCase()}!* 🎟️\n\n` +
      `🏆 *Premio:* ${config.prize}\n` +
      `💵 *Valor por número:* ${formatCOP(config.price)} COP\n` +
      `📱 *Pago por Nequi:* ${config.nequi}\n` +
      `⚡ *Disponibles:* ${stats.free} números restantes\n\n` +
      `👉 *Escoge y reserva tu número aquí en vivo:*\n${url}\n\n` +
      `_(La reserva dura 20 min mientras envías el comprobante)_`;

    try {
      await navigator.clipboard.writeText(shareText);
      showToast('¡Texto promocional copiado para WhatsApp! 📋', 'success');
    } catch {
      prompt('Copia este mensaje para el grupo de WhatsApp:', shareText);
    }
  });

  function connectSSE() {
    const es = new EventSource('/api/events');
    es.addEventListener('numbers_updated', () => loadAdminData());
    es.addEventListener('numbers_released', () => loadAdminData());
    es.addEventListener('config_updated', () => loadAdminData());
    es.addEventListener('raffle_reset', () => loadAdminData());
  }

  setInterval(() => {
    if (currentData) loadAdminData();
  }, 10000);
})();
