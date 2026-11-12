// app.js - Lógica interactiva moderna para los participantes
(function () {
  let config = {
    name: 'Rifa',
    prize: 'Cargando...',
    price: 15000,
    nequi: '',
    totalNumbers: 100,
    reserveMinutes: 20
  };

  let numbersData = {};
  const selectedNumbers = new Set();
  let countdownInterval = null;

  let currentReservedNumbers = [];

  // Web Audio API: Sonidos táctiles nativos de alta fidelidad
  const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;
  
  function playTickSound() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {}
  }

  function playSuccessSound() {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.25);
      });
    } catch {}
  }

  // DOM
  const raffleName = document.getElementById('raffleName');
  const rafflePrize = document.getElementById('rafflePrize');
  const rafflePrice = document.getElementById('rafflePrice');
  const progressPctText = document.getElementById('progressPctText');
  const progressFillBar = document.getElementById('progressFillBar');

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

  // Modales
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

  // Sistema de Notificaciones Toast
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

  // Formato de moneda COP
  function formatCOP(val) {
    return '$' + Number(val || 0).toLocaleString('es-CO');
  }

  // Tema Claro / Oscuro
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

  // Cargar datos desde el servidor
  async function loadData() {
    try {
      const res = await fetch('/api/raffle');
      if (!res.ok) throw new Error('Error de conexión');
      const data = await res.json();
      
      config = data.config;
      numbersData = {};
      data.numbers.forEach(item => {
        numbersData[item.num] = item;
      });

      renderHeader();
      renderGrid();
      updateStats();
    } catch (err) {
      console.error(err);
    }
  }

  function renderHeader() {
    raffleName.textContent = config.name;
    rafflePrize.textContent = config.prize;
    rafflePrice.textContent = formatCOP(config.price) + ' COP';
  }

  function updateStats() {
    let free = 0, res = 0, paid = 0;
    const total = config.totalNumbers || 100;
    
    for (let i = 1; i <= total; i++) {
      const item = numbersData[i] || { status: 'free' };
      if (item.status === 'free') free++;
      else if (item.status === 'reserved') res++;
      else if (item.status === 'paid') paid++;
    }

    countFree.textContent = free;
    countReserved.textContent = res;
    countPaid.textContent = paid;

    const taken = res + paid;
    const pct = Math.round((taken / total) * 100);
    progressPctText.textContent = `${pct}% (${taken}/${total})`;
    progressFillBar.style.width = `${pct}%`;
  }

  function renderGrid() {
    numbersGrid.innerHTML = '';
    const total = config.totalNumbers || 100;

    for (let i = 1; i <= total; i++) {
      const item = numbersData[i] || { status: 'free' };
      const btn = document.createElement('button');
      btn.className = 'ticket-num';
      
      const isSelected = selectedNumbers.has(i);

      if (isSelected && item.status !== 'free') {
        selectedNumbers.delete(i);
      }

      if (selectedNumbers.has(i)) {
        btn.classList.add('selected');
      } else {
        btn.classList.add(item.status);
      }

      // Dos dígitos con formato (01, 02... 100)
      btn.textContent = String(i).padStart(2, '0');

      if (item.status === 'free') {
        btn.addEventListener('click', () => toggleNumber(i));
      }

      numbersGrid.appendChild(btn);
    }

    updateSelectionUI();
  }

  function toggleNumber(num) {
    playTickSound();
    if (selectedNumbers.has(num)) {
      selectedNumbers.delete(num);
    } else {
      selectedNumbers.add(num);
    }
    renderGrid();
  }

  function updateSelectionUI() {
    const list = Array.from(selectedNumbers).sort((a, b) => a - b);
    const count = list.length;
    const total = count * config.price;

    selectionSummary.textContent = count === 0 ? '0 seleccionados' : count === 1 ? '1 número elegido' : `${count} números elegidos`;
    btnClearSelection.style.display = count > 0 ? 'inline-flex' : 'none';

    if (count > 0) {
      bottomBar.classList.remove('closed');
      barTotal.textContent = formatCOP(total);
      barNumbers.textContent = list.map(n => String(n).padStart(2, '0')).join(', ');
    } else {
      bottomBar.classList.add('closed');
    }
  }

  // Número de la Suerte (Ruleta de elección al azar entre libres)
  btnLuckyNumber.addEventListener('click', () => {
    const available = [];
    const total = config.totalNumbers || 100;
    for (let i = 1; i <= total; i++) {
      if ((numbersData[i] || {}).status === 'free' && !selectedNumbers.has(i)) {
        available.push(i);
      }
    }

    if (available.length === 0) {
      showToast('No quedan más números libres disponibles.', 'error');
      return;
    }

    const lucky = available[Math.floor(Math.random() * available.length)];
    selectedNumbers.add(lucky);
    renderGrid();
    showToast(`¡Agregamos el número de la suerte ${String(lucky).padStart(2, '0')}! 🎲`, 'success');
  });

  // Limpiar Selección
  btnClearSelection.addEventListener('click', () => {
    selectedNumbers.clear();
    renderGrid();
    showToast('Selección limpiada.');
  });

  // Abrir Modal Formulario
  btnOpenReserveModal.addEventListener('click', () => {
    const list = Array.from(selectedNumbers).sort((a, b) => a - b);
    if (!list.length) return;

    modalNumbersText.textContent = list.map(n => String(n).padStart(2, '0')).join(', ');
    modalTotalText.textContent = formatCOP(list.length * config.price) + ' COP';
    reserveModal.style.display = 'flex';
  });

  btnCloseReserveModal.addEventListener('click', () => {
    reserveModal.style.display = 'none';
  });

  // Enviar Reserva
  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = Array.from(selectedNumbers).sort((a, b) => a - b);
    if (!list.length) return;

    const name = buyerName.value.trim();
    const phone = buyerPhone.value.trim();

    btnSubmitReserve.disabled = true;
    btnSubmitReserve.textContent = 'Procesando reserva...';

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numbers: list,
          name,
          phone
        })
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'No se pudo reservar.', 'error');
        if (data.unavailable) {
          data.unavailable.forEach(n => selectedNumbers.delete(n));
          renderGrid();
        }
        btnSubmitReserve.disabled = false;
        btnSubmitReserve.textContent = 'Confirmar Reserva y Ver Nequi';
        return;
      }

      // Éxito
      reserveModal.style.display = 'none';
      selectedNumbers.clear();
      renderGrid();

      showPaymentSuccess(data);
      showToast('¡Números reservados exitosamente!', 'success');

    } catch {
      showToast('Error de conexión con el servidor.', 'error');
    } finally {
      btnSubmitReserve.disabled = false;
      btnSubmitReserve.textContent = 'Confirmar Reserva y Ver Nequi';
    }
  });

  function showPaymentSuccess(data) {
    currentReservedNumbers = data.reservedNumbers || [];
    playSuccessSound();
    payRefCode.textContent = data.refCode || 'REF-RESERVA';
    payNequiNumber.textContent = data.nequi.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    payTotalAmount.textContent = formatCOP(data.totalAmount) + ' COP';
    payNumbersList.textContent = data.reservedNumbers.map(n => String(n).padStart(2, '0')).join(', ');
    btnSendWhatsApp.href = data.waUrl;

    startTimer(data.expiresAt);
    paymentModal.style.display = 'flex';
  }

  function startTimer(expiresAt) {
    if (countdownInterval) clearInterval(countdownInterval);

    function update() {
      const remainingMs = Math.max(0, expiresAt - Date.now());
      const totalSec = Math.floor(remainingMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      
      countdownTimer.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

      if (remainingMs <= 0) {
        clearInterval(countdownInterval);
        countdownTimer.textContent = '¡Expirado!';
        showToast('El tiempo de reserva ha expirado.', 'error');
      }
    }

    update();
    countdownInterval = setInterval(update, 1000);
  }

  // Búsqueda Rápida de Número Específico
  const searchQuickNum = document.getElementById('searchQuickNum');
  const btnQuickSelect = document.getElementById('btnQuickSelect');

  function doQuickSelect() {
    const val = parseInt(searchQuickNum.value, 10);
    if (!val || val < 1 || val > (config.totalNumbers || 100)) {
      showToast('Ingresa un número válido entre 1 y ' + (config.totalNumbers || 100), 'error');
      return;
    }
    const item = numbersData[val] || {};
    if (item.status !== 'free') {
      showToast(`El número ${String(val).padStart(2, '0')} ya está ${item.status === 'reserved' ? 'apartado' : 'vendido'}.`, 'error');
      return;
    }
    selectedNumbers.add(val);
    playTickSound();
    renderGrid();
    showToast(`Número ${String(val).padStart(2, '0')} seleccionado.`, 'success');
    searchQuickNum.value = '';
  }

  if (btnQuickSelect) btnQuickSelect.addEventListener('click', doQuickSelect);
  if (searchQuickNum) {
    searchQuickNum.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doQuickSelect();
    });
  }

  // Subida de Comprobante
  const proofFileInput = document.getElementById('proofFileInput');
  const btnSelectProofFile = document.getElementById('btnSelectProofFile');
  const proofFileName = document.getElementById('proofFileName');
  const btnUploadProof = document.getElementById('btnUploadProof');
  let selectedProofBase64 = null;

  if (btnSelectProofFile) {
    btnSelectProofFile.addEventListener('click', () => proofFileInput.click());
  }

  if (proofFileInput) {
    proofFileInput.addEventListener('change', () => {
      const file = proofFileInput.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona una imagen (PNG o JPG)', 'error');
        return;
      }

      proofFileName.textContent = `Archivo: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      btnUploadProof.style.display = 'inline-flex';

      const reader = new FileReader();
      reader.onload = () => {
        selectedProofBase64 = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnUploadProof) {
    btnUploadProof.addEventListener('click', async () => {
      if (!selectedProofBase64 || !currentReservedNumbers.length) {
        showToast('No hay imagen o números para asociar.', 'error');
        return;
      }

      btnUploadProof.disabled = true;
      btnUploadProof.textContent = 'Subiendo comprobante...';

      try {
        const res = await fetch('/api/upload-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numbers: currentReservedNumbers,
            imageBase64: selectedProofBase64
          })
        });

        if (res.ok) {
          showToast('¡Comprobante recibido con éxito! La organizadora lo validará.', 'success');
          btnUploadProof.style.display = 'none';
          btnSelectProofFile.textContent = '✓ Comprobante Cargado';
          btnSelectProofFile.style.background = '#10b981';
          btnSelectProofFile.style.color = 'white';
        } else {
          showToast('No se pudo subir la imagen.', 'error');
        }
      } catch {
        showToast('Error de conexión al subir imagen.', 'error');
      } finally {
        btnUploadProof.disabled = false;
        btnUploadProof.textContent = '📤 Enviar Comprobante al Sistema';
      }
    });
  }

  // Copiar Nequi
  btnCopyNequi.addEventListener('click', async () => {
    try {
      const rawNum = payNequiNumber.textContent.replace(/\s/g, '');
      await navigator.clipboard.writeText(rawNum);
      const prev = btnCopyNequi.textContent;
      btnCopyNequi.textContent = '¡Copiado! ✓';
      btnCopyNequi.style.background = '#22c55e';
      showToast('¡Número Nequi copiado al portapapeles!', 'success');
      setTimeout(() => {
        btnCopyNequi.textContent = prev;
        btnCopyNequi.style.background = '';
      }, 2000);
    } catch {
      showToast('Copia manual: ' + config.nequi);
    }
  });

  btnClosePaymentModal.addEventListener('click', () => {
    paymentModal.style.display = 'none';
    if (countdownInterval) clearInterval(countdownInterval);
  });

  // Cerrar al hacer clic en fondo
  window.addEventListener('click', (e) => {
    if (e.target === reserveModal) reserveModal.style.display = 'none';
    if (e.target === paymentModal) paymentModal.style.display = 'none';
  });

  // TIEMPO REAL: Server-Sent Events (SSE)
  function connectSSE() {
    const es = new EventSource('/api/events');
    
    es.addEventListener('numbers_updated', (e) => {
      loadData();
    });

    es.addEventListener('numbers_released', (e) => {
      loadData();
      showToast('Se han liberado algunas boletas vencidas.', 'info');
    });

    es.addEventListener('config_updated', () => {
      loadData();
    });

    es.addEventListener('raffle_reset', () => {
      selectedNumbers.clear();
      loadData();
      showToast('La rifa ha sido reiniciada.', 'info');
    });

    es.onerror = () => {
      // Reintento en silencio
    };
  }

  loadData();
  connectSSE();
})();
