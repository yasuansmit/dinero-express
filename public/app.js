// app.js - DINERO EXPRESS - Multi-Tabla
(function () {
  let config = { name: 'Rifa', prize: '', price: 12000, nequi: '', totalNumbers: 100, reserveMinutes: 20 };
  let tablesData = [];
  let currentTableId = null;
  const selectedNumbers = new Set();
  let countdownInterval = null;
  let currentReservedNumbers = [];
  let currentReserveTableId = null;

  // Audio
  const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;
  function playTickSound() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.05);
    } catch {}
  }
  function playSuccessSound() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.25);
      });
    } catch {}
  }

  // DOM
  const raffleName = document.getElementById('raffleName');
  const rafflePrice = document.getElementById('rafflePrice');
  const progressPctText = document.getElementById('progressPctText');
  const progressFillBar = document.getElementById('progressFillBar');
  const preLaunchBanner = document.getElementById('preLaunchBanner');
  const officialWinnerBanner = document.getElementById('officialWinnerBanner');
  const bannerLotteryInfo = document.getElementById('bannerLotteryInfo');
  const winnersTiersContainer = document.getElementById('winnersTiersContainer');
  const boardCard = document.getElementById('boardCard');
  const liveStatusLabel = document.getElementById('liveStatusLabel');
  const btnOpenFlyerModal = document.getElementById('btnOpenFlyerModal');
  const flyerModal = document.getElementById('flyerModal');
  const btnCloseFlyerModal = document.getElementById('btnCloseFlyerModal');
  const btnCloseFlyerBtn = document.getElementById('btnCloseFlyerBtn');
  const countFree = document.getElementById('countFree');
  const countReserved = document.getElementById('countReserved');
  const countPaid = document.getElementById('countPaid');
  const numbersGrid = document.getElementById('numbersGrid');
  const selectionSummary = document.getElementById('selectionSummary');
  const btnLuckyNumber = document.getElementById('btnLuckyNumber');
  const btnClearSelection = document.getElementById('btnClearSelection');
  const bottomBar = document.getElementById('bottomBar');
  const barTotal = document.getElementById('barTotal');
  const barNumbers = document.getElementById('barNumbers');
  const btnOpenReserveModal = document.getElementById('btnOpenReserveModal');
  const mainHeroNequi = document.getElementById('mainHeroNequi');
  const btnCopyNequiHeader = document.getElementById('btnCopyNequiHeader');
  const btnTopPay = document.getElementById('btnTopPay');
  const topPayCount = document.getElementById('topPayCount');
  const inlinePurchaseCard = document.getElementById('inlinePurchaseCard');
  const inlineHelpText = document.getElementById('inlineHelpText');
  const inlineNumsText = document.getElementById('inlineNumsText');
  const inlineTotalText = document.getElementById('inlineTotalText');
  const btnInlineProceed = document.getElementById('btnInlineProceed');
  const headerFlyerImg = document.getElementById('headerFlyerImg');
  const modalFlyerImg = document.getElementById('modalFlyerImg');
  const reserveModal = document.getElementById('reserveModal');
  const btnCloseReserveModal = document.getElementById('btnCloseReserveModal');
  const reserveForm = document.getElementById('reserveForm');
  const modalNumbersText = document.getElementById('modalNumbersText');
  const modalTotalText = document.getElementById('modalTotalText');
  const buyerName = document.getElementById('buyerName');
  const buyerPhone = document.getElementById('buyerPhone');
  const btnSubmitReserve = document.getElementById('btnSubmitReserve');
  const paymentModal = document.getElementById('paymentModal');
  const btnClosePaymentModal = document.getElementById('btnClosePaymentModal');
  const payRefCode = document.getElementById('payRefCode');
  const payNequiNumber = document.getElementById('payNequiNumber');
  const btnCopyNequi = document.getElementById('btnCopyNequi');
  const payTotalAmount = document.getElementById('payTotalAmount');
  const payNumbersList = document.getElementById('payNumbersList');
  const countdownTimer = document.getElementById('countdownTimer');
  const btnSendWhatsApp = document.getElementById('btnSendWhatsApp');
  const themeToggle = document.getElementById('themeToggle');
  const toastBox = document.getElementById('toastBox');
  const tableTabsContainer = document.getElementById('tableTabsContainer');
  const heroPozoAmount = document.getElementById('heroPozoAmount');

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span style="font-weight:900;">${icon}</span> <span>${message}</span>`;
    toastBox.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; toast.style.transition = 'all 0.3s ease'; setTimeout(() => toast.remove(), 300); }, 3500);
  }
  function formatCOP(val) { return '$' + Number(val || 0).toLocaleString('es-CO'); }
  function escapeHtml(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

  // Tema
  const savedTheme = localStorage.getItem('rifa_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rifa_theme', next);
    themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });

  function getCurrentTable() {
    return tablesData.find(t => t.id === currentTableId) || tablesData[0] || null;
  }
  function getNumbersData() {
    const t = getCurrentTable();
    if (!t) return {};
    const map = {};
    (t.numbers || []).forEach(n => { map[n.num] = n; });
    return map;
  }

  async function loadData() {
    try {
      const res = await fetch('/api/raffle');
      if (!res.ok) throw new Error('Error de conexión');
      const data = await res.json();
      config = data.config;
      tablesData = data.tables || [];

      // Si no hay tabla seleccionada, tomar la primera activa
      if (!currentTableId || !tablesData.find(t => t.id === currentTableId)) {
        const active = tablesData.find(t => t.isActive);
        currentTableId = active ? active.id : (tablesData[0] ? tablesData[0].id : 1);
      }

      renderTableTabs();
      renderHeader();
      updateStats();
      renderGrid();
    } catch (err) { console.error(err); }
  }

  function renderTableTabs() {
    if (!tableTabsContainer) return;
    if (tablesData.length <= 1) {
      tableTabsContainer.style.display = 'none';
      return;
    }
    tableTabsContainer.style.display = 'flex';
    tableTabsContainer.innerHTML = tablesData.filter(t => t.isActive).map(t => {
      const isActive = t.id === currentTableId;
      const freeCount = (t.numbers || []).filter(n => n.status === 'free').length;
      return `<button class="btn-tool ${isActive ? 'active' : ''}" data-table-id="${t.id}" style="
        padding: 8px 16px; font-size: 0.88rem; font-weight: 800; border-radius: 10px; white-space: nowrap;
        ${isActive ? 'background: var(--nequi-pink); color: white; border-color: var(--nequi-pink);' : ''}
      ">
        📋 ${escapeHtml(t.name)} <span style="font-size:0.72rem; opacity:0.8;">(${freeCount} libres)</span>
      </button>`;
    }).join('');

    tableTabsContainer.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tId = parseInt(btn.dataset.tableId, 10);
        if (tId !== currentTableId) {
          selectedNumbers.clear();
          currentTableId = tId;
          renderTableTabs();
          updateStats();
          renderGrid();
        }
      });
    });
  }

  function renderHeader() {
    raffleName.textContent = config.name;
    rafflePrice.textContent = formatCOP(config.price) + ' COP';
    if (mainHeroNequi && config.nequi) mainHeroNequi.textContent = config.nequi.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    if (config.flyerUrl) {
      if (headerFlyerImg) headerFlyerImg.src = config.flyerUrl;
      if (modalFlyerImg) modalFlyerImg.src = config.flyerUrl;
    }

    // Pozo del tabla actual
    const ct = getCurrentTable();
    if (heroPozoAmount && ct) {
      heroPozoAmount.textContent = formatCOP(ct.pozoAmount);
    }

    const status = config.raffleStatus || 'active';
    if (status === 'pre_launch') {
      preLaunchBanner.style.display = 'block';
      boardCard.classList.add('grid-locked-overlay');
      if (liveStatusLabel) liveStatusLabel.textContent = 'En Espera · Próximamente';
    } else {
      preLaunchBanner.style.display = 'none';
      boardCard.classList.remove('grid-locked-overlay');
      if (liveStatusLabel) liveStatusLabel.textContent = 'En Vivo';
    }

    // Banner de ganadores - mostrar de todas las tablas
    const tablesWithWinners = tablesData.filter(t => t.winners && t.winners.length > 0);
    if (tablesWithWinners.length > 0) {
      if (officialWinnerBanner) officialWinnerBanner.style.display = 'block';
      if (bannerLotteryInfo) bannerLotteryInfo.textContent = `Sorteo Oficial: ${config.lotteryName || 'Lotería Chontico'}`;
      if (winnersTiersContainer) {
        let html = '';
        for (const t of tablesWithWinners) {
          html += `<div style="font-size: 0.88rem; font-weight: 900; color: #fde047; margin-top: 8px; margin-bottom: 6px; text-align: center;">📋 ${escapeHtml(t.name)}</div>`;
          if (t.pozoWon && t.pozoWinnerName) {
            html += `<div style="background: linear-gradient(135deg, #92400e, #b45309); border: 2px solid #fde047; border-radius: 14px; padding: 14px; text-align: center; margin-bottom: 8px;">
              <div style="font-size: 1.3rem;">🎰💰🎉</div>
              <div style="font-size: 0.95rem; font-weight: 900; color: #fde047;">¡POZO ACUMULADO GANADO!</div>
              <div style="font-size: 1.1rem; font-weight: 900; color: #ffffff;">${escapeHtml(t.pozoWinnerName)} ganó ${formatCOP(t.pozoAmount)} COP</div>
            </div>`;
          }
          html += t.winners.map(w => `
            <div style="background: rgba(0,0,0,0.35); border: 1.5px solid rgba(255,255,255,0.2); border-radius: 14px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <div>
                <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: #a7f3d0;">${escapeHtml(w.tier)}</div>
                <div style="font-size: 1.05rem; font-weight: 900; color: #ffffff; margin-top: 3px;">
                  Boleta <strong style="color: #fde047; font-size: 1.25rem;">#${escapeHtml(w.num)}</strong> · ${escapeHtml(w.name)}
                </div>
              </div>
              <div style="text-align: right; min-width: 110px;">
                <div style="font-size: 0.68rem; color: #d1fae5; text-transform: uppercase; font-weight: 700;">Premio</div>
                <div style="font-size: 1.15rem; font-weight: 900; color: #34d399;">${escapeHtml(w.prize)}</div>
              </div>
            </div>
          `).join('');
        }
        winnersTiersContainer.innerHTML = html;
      }
    } else {
      if (officialWinnerBanner) officialWinnerBanner.style.display = 'none';
    }
  }

  function updateStats() {
    const numbersData = getNumbersData();
    const ct = getCurrentTable();
    const total = ct ? ct.totalNumbers : 100;
    let free = 0, res = 0, paid = 0;
    for (let i = 1; i <= total; i++) {
      const item = numbersData[i] || { status: 'free' };
      if (item.status === 'free') free++;
      else if (item.status === 'reserved') res++;
      else if (item.status === 'paid') paid++;
    }
    if (countFree) countFree.textContent = free;
    if (countReserved) countReserved.textContent = res;
    if (countPaid) countPaid.textContent = paid;
    const taken = res + paid;
    const pct = Math.round((taken / total) * 100);
    if (progressPctText) progressPctText.textContent = `${pct}% (${taken}/${total})`;
    if (progressFillBar) progressFillBar.style.width = `${pct}%`;
  }

  function renderGrid() {
    const numbersData = getNumbersData();
    const ct = getCurrentTable();
    const total = ct ? ct.totalNumbers : 100;
    numbersGrid.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const item = numbersData[i] || { status: 'free' };
      const btn = document.createElement('button');
      btn.className = 'ticket-num';
      if (selectedNumbers.has(i) && item.status !== 'free') selectedNumbers.delete(i);
      if (selectedNumbers.has(i)) btn.classList.add('selected');
      else btn.classList.add(item.status);
      btn.textContent = String(i).padStart(2, '0');
      if (item.status === 'free') btn.addEventListener('click', () => toggleNumber(i));
      numbersGrid.appendChild(btn);
    }
    updateSelectionUI();
  }

  function toggleNumber(num) {
    playTickSound();
    if (selectedNumbers.has(num)) selectedNumbers.delete(num);
    else selectedNumbers.add(num);
    renderGrid();
  }

  function updateSelectionUI() {
    try {
      const list = Array.from(selectedNumbers).sort((a, b) => a - b);
      const count = list.length;
      const total = count * (config.price || 12000);
      const numsFormatted = list.map(n => String(n).padStart(2, '0')).join(', ');
      if (selectionSummary) selectionSummary.textContent = count === 0 ? '0 seleccionados' : count === 1 ? '1 número elegido' : `${count} números elegidos`;
      if (btnClearSelection) btnClearSelection.style.display = count > 0 ? 'inline-flex' : 'none';
      if (count > 0) {
        if (btnTopPay) { btnTopPay.disabled = false; btnTopPay.style.opacity = '1'; btnTopPay.style.cursor = 'pointer'; btnTopPay.textContent = `💳 PAGAR (${count})`; }
        if (bottomBar) bottomBar.classList.remove('closed');
        if (barTotal) barTotal.textContent = formatCOP(total);
        if (barNumbers) barNumbers.textContent = numsFormatted;
        if (btnInlineProceed) { btnInlineProceed.disabled = false; btnInlineProceed.style.opacity = '1'; btnInlineProceed.style.cursor = 'pointer'; btnInlineProceed.textContent = `💳 PAGAR ${formatCOP(total)} COP AHORA`; }
        if (inlineHelpText) inlineHelpText.textContent = '🎉 ¡Boletas listas! Toca el botón verde para pagar:';
        if (inlineNumsText) inlineNumsText.textContent = 'Boletas: ' + numsFormatted;
        if (inlineTotalText) inlineTotalText.textContent = `Total a transferir: ${formatCOP(total)} COP`;
      } else {
        if (btnTopPay) { btnTopPay.disabled = true; btnTopPay.style.opacity = '0.55'; btnTopPay.style.cursor = 'not-allowed'; btnTopPay.textContent = '💳 PAGAR (0)'; }
        if (bottomBar) bottomBar.classList.add('closed');
        if (btnInlineProceed) { btnInlineProceed.disabled = true; btnInlineProceed.style.opacity = '0.6'; btnInlineProceed.style.cursor = 'not-allowed'; btnInlineProceed.textContent = '💳 PAGAR POR NEQUI AHORA'; }
        if (inlineHelpText) inlineHelpText.textContent = '👆 Toca tus números favoritos arriba para pagar';
        if (inlineNumsText) inlineNumsText.textContent = 'Boletas: Ninguna seleccionada';
        if (inlineTotalText) inlineTotalText.textContent = 'Total: $0 COP';
      }
    } catch (err) { console.error('Error en updateSelectionUI:', err); }
  }

  // Lucky Number
  btnLuckyNumber.addEventListener('click', () => {
    const numbersData = getNumbersData();
    const ct = getCurrentTable();
    const total = ct ? ct.totalNumbers : 100;
    const available = [];
    for (let i = 1; i <= total; i++) {
      if ((numbersData[i] || {}).status === 'free' && !selectedNumbers.has(i)) available.push(i);
    }
    if (!available.length) { showToast('No quedan más números libres.', 'error'); return; }
    const lucky = available[Math.floor(Math.random() * available.length)];
    selectedNumbers.add(lucky); renderGrid();
    showToast(`¡Número de la suerte ${String(lucky).padStart(2, '0')}! 🎲`, 'success');
  });

  btnClearSelection.addEventListener('click', () => { selectedNumbers.clear(); renderGrid(); showToast('Selección limpiada.'); });

  // Reserve Flow
  function openReserveFlow() {
    const list = Array.from(selectedNumbers).sort((a, b) => a - b);
    if (!list.length) return;
    const ct = getCurrentTable();
    const tableName = ct ? ct.name : '';
    modalNumbersText.textContent = list.map(n => String(n).padStart(2, '0')).join(', ') + (tableName ? ` (${tableName})` : '');
    modalTotalText.textContent = formatCOP(list.length * config.price) + ' COP';
    reserveModal.style.display = 'flex';
  }

  btnOpenReserveModal.addEventListener('click', openReserveFlow);
  if (btnInlineProceed) btnInlineProceed.addEventListener('click', openReserveFlow);
  if (btnTopPay) btnTopPay.addEventListener('click', openReserveFlow);

  if (btnCopyNequiHeader) {
    btnCopyNequiHeader.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(config.nequi.replace(/\D/g, ''));
        showToast('¡Nequi copiado!', 'success');
        const prev = btnCopyNequiHeader.textContent;
        btnCopyNequiHeader.textContent = '¡Copiado! ✓';
        setTimeout(() => { btnCopyNequiHeader.textContent = prev; }, 2000);
      } catch { showToast('Nequi: ' + config.nequi); }
    });
  }

  btnCloseReserveModal.addEventListener('click', () => { reserveModal.style.display = 'none'; });

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = Array.from(selectedNumbers).sort((a, b) => a - b);
    if (!list.length) return;
    btnSubmitReserve.disabled = true;
    btnSubmitReserve.textContent = 'Procesando reserva...';
    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: currentTableId, numbers: list, name: buyerName.value.trim(), phone: buyerPhone.value.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'No se pudo reservar.', 'error');
        if (data.unavailable) { data.unavailable.forEach(n => selectedNumbers.delete(n)); renderGrid(); }
        return;
      }
      reserveModal.style.display = 'none';
      selectedNumbers.clear();
      currentReservedNumbers = data.reservedNumbers || [];
      currentReserveTableId = data.tableId;
      renderGrid();
      showPaymentSuccess(data);
      showToast('¡Números reservados!', 'success');
    } catch { showToast('Error de conexión.', 'error'); }
    finally { btnSubmitReserve.disabled = false; btnSubmitReserve.textContent = 'Confirmar Reserva y Ver Nequi'; }
  });

  function showPaymentSuccess(data) {
    playSuccessSound();
    payRefCode.textContent = data.refCode || 'REF';
    payNequiNumber.textContent = data.nequi.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    payTotalAmount.textContent = formatCOP(data.totalAmount) + ' COP';
    payNumbersList.textContent = data.reservedNumbers.map(n => String(n).padStart(2, '0')).join(', ') + ` (${data.tableName || 'Tabla'})`;
    btnSendWhatsApp.href = data.waUrl;
    startTimer(data.expiresAt);
    paymentModal.style.display = 'flex';
  }

  function startTimer(expiresAt) {
    if (countdownInterval) clearInterval(countdownInterval);
    function update() {
      const rem = Math.max(0, expiresAt - Date.now());
      const sec = Math.floor(rem / 1000), m = Math.floor(sec / 60), s = sec % 60;
      countdownTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (rem <= 0) { clearInterval(countdownInterval); countdownTimer.textContent = '¡Expirado!'; }
    }
    update(); countdownInterval = setInterval(update, 1000);
  }

  // Quick search
  const searchQuickNum = document.getElementById('searchQuickNum');
  const btnQuickSelect = document.getElementById('btnQuickSelect');
  function doQuickSelect() {
    const numbersData = getNumbersData();
    const val = parseInt(searchQuickNum.value, 10);
    const ct = getCurrentTable();
    const total = ct ? ct.totalNumbers : 100;
    if (!val || val < 1 || val > total) { showToast(`Ingresa un número entre 1 y ${total}`, 'error'); return; }
    if ((numbersData[val] || {}).status !== 'free') { showToast(`El ${String(val).padStart(2,'0')} ya está ocupado.`, 'error'); return; }
    selectedNumbers.add(val); playTickSound(); renderGrid();
    showToast(`Número ${String(val).padStart(2, '0')} seleccionado.`, 'success');
    searchQuickNum.value = '';
  }
  if (btnQuickSelect) btnQuickSelect.addEventListener('click', doQuickSelect);
  if (searchQuickNum) searchQuickNum.addEventListener('keypress', e => { if (e.key === 'Enter') doQuickSelect(); });

  // Proof Upload
  const proofFileInput = document.getElementById('proofFileInput');
  const btnSelectProofFile = document.getElementById('btnSelectProofFile');
  const proofFileName = document.getElementById('proofFileName');
  const btnUploadProof = document.getElementById('btnUploadProof');
  let selectedProofBase64 = null;
  if (btnSelectProofFile) btnSelectProofFile.addEventListener('click', () => proofFileInput.click());
  if (proofFileInput) proofFileInput.addEventListener('change', () => {
    const file = proofFileInput.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Selecciona una imagen', 'error'); return; }
    proofFileName.textContent = `Archivo: ${file.name}`;
    btnUploadProof.style.display = 'inline-flex';
    const reader = new FileReader(); reader.onload = () => { selectedProofBase64 = reader.result; }; reader.readAsDataURL(file);
  });
  if (btnUploadProof) btnUploadProof.addEventListener('click', async () => {
    if (!selectedProofBase64 || !currentReservedNumbers.length) return;
    btnUploadProof.disabled = true; btnUploadProof.textContent = 'Subiendo...';
    try {
      const res = await fetch('/api/upload-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: currentReservedNumbers, tableId: currentReserveTableId || currentTableId, imageBase64: selectedProofBase64 }) });
      if (res.ok) { showToast('¡Comprobante recibido!', 'success'); btnUploadProof.style.display = 'none'; btnSelectProofFile.textContent = '✓ Cargado'; btnSelectProofFile.style.background = '#10b981'; }
      else showToast('Error al subir.', 'error');
    } catch { showToast('Error de conexión.', 'error'); }
    finally { btnUploadProof.disabled = false; btnUploadProof.textContent = '📤 Enviar Comprobante'; }
  });

  // Copy Nequi
  btnCopyNequi.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(payNequiNumber.textContent.replace(/\s/g, ''));
      btnCopyNequi.textContent = '¡Copiado! ✓'; btnCopyNequi.style.background = '#22c55e';
      showToast('¡Nequi copiado!', 'success');
      setTimeout(() => { btnCopyNequi.textContent = '📋 Copiar'; btnCopyNequi.style.background = ''; }, 2000);
    } catch { showToast('Copia manual: ' + config.nequi); }
  });

  btnClosePaymentModal.addEventListener('click', () => { paymentModal.style.display = 'none'; if (countdownInterval) clearInterval(countdownInterval); });
  if (btnOpenFlyerModal) btnOpenFlyerModal.onclick = () => flyerModal.style.display = 'flex';
  if (btnCloseFlyerModal) btnCloseFlyerModal.onclick = () => flyerModal.style.display = 'none';
  if (btnCloseFlyerBtn) btnCloseFlyerBtn.onclick = () => flyerModal.style.display = 'none';
  window.addEventListener('click', (e) => { if (e.target === reserveModal) reserveModal.style.display = 'none'; if (e.target === paymentModal) paymentModal.style.display = 'none'; });

  // SSE
  function connectSSE() {
    const es = new EventSource('/api/events');
    es.addEventListener('numbers_updated', () => loadData());
    es.addEventListener('numbers_released', () => { loadData(); showToast('Se liberaron boletas vencidas.', 'info'); });
    es.addEventListener('raffle_status_changed', (e) => {
      loadData();
      try { const d = JSON.parse(e.data); if (d.status === 'active') { showToast('🔥 ¡VENTAS ABIERTAS!', 'success'); playSuccessSound(); } } catch {}
    });
    es.addEventListener('winner_announced', () => { loadData(); showToast('🏆 ¡RESULTADOS OFICIALES DE LOTERÍA CHONTICO! 🎉', 'success'); playSuccessSound(); });
    es.addEventListener('config_updated', () => loadData());
    es.addEventListener('table_added', () => { loadData(); showToast('Se ha abierto una nueva tabla.', 'info'); });
    es.addEventListener('table_removed', () => { loadData(); });
    es.addEventListener('raffle_reset', () => { selectedNumbers.clear(); loadData(); showToast('La rifa ha sido reiniciada.', 'info'); });
    es.onerror = () => {};
  }

  loadData();
  connectSSE();
})();
