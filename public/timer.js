(() => {
  const CIRCUMFERENCE = 339.3; // 2 * PI * 54

  let totalSeconds = 0;
  let remainingSeconds = 0;
  let timerInterval = null;
  let isRunning = false;

  const panel        = document.getElementById('timer-panel');
  const toggleBtn    = document.getElementById('timer-toggle');
  const closeBtn     = document.getElementById('close-timer');
  const display      = document.getElementById('timer-display');
  const statusText   = document.getElementById('timer-status');
  const ringFill     = document.getElementById('timer-ring-fill');
  const minInput     = document.getElementById('timer-min-input');
  const secInput     = document.getElementById('timer-sec-input');
  const startBtn     = document.getElementById('timer-start');
  const resetBtn     = document.getElementById('timer-reset');
  const chips        = document.querySelectorAll('.timer-chip');
  const overlay      = document.getElementById('timer-timeout-overlay');
  const dismissBtn   = document.getElementById('timer-timeout-dismiss');

  ringFill.style.strokeDasharray  = CIRCUMFERENCE;
  ringFill.style.strokeDashoffset = CIRCUMFERENCE;

  toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
  closeBtn.addEventListener('click',  () => panel.classList.add('hidden'));

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (isRunning) return;
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = parseInt(chip.dataset.minutes, 10);
      minInput.value = mins;
      secInput.value = 0;
      applyInputTime();
    });
  });

  minInput.addEventListener('input', () => { clearChips(); applyInputTime(); });
  secInput.addEventListener('input', () => { clearChips(); applyInputTime(); });

  function clearChips() {
    chips.forEach(c => c.classList.remove('active'));
  }

  function applyInputTime() {
    if (isRunning) return;
    const mins = Math.max(0, Math.min(99, parseInt(minInput.value, 10) || 0));
    const secs = Math.max(0, Math.min(59, parseInt(secInput.value, 10) || 0));
    setTime(mins * 60 + secs);
  }

  function setTime(seconds) {
    totalSeconds     = seconds;
    remainingSeconds = seconds;
    startBtn.disabled = seconds <= 0;
    startBtn.textContent = 'Start';
    statusText.textContent = seconds > 0 ? 'Ready' : 'Set a time';
    updateDisplay();
    snapRing();
  }

  function updateDisplay() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function snapRing() {
    ringFill.style.transition = 'none';
    updateRingOffset();
    updateRingColor();
    requestAnimationFrame(() => {
      ringFill.style.transition = '';
    });
  }

  function updateRingOffset() {
    const offset = totalSeconds === 0
      ? CIRCUMFERENCE
      : CIRCUMFERENCE * (1 - remainingSeconds / totalSeconds);
    ringFill.style.strokeDashoffset = offset;
  }

  function updateRingColor() {
    const progress = totalSeconds === 0 ? 0 : remainingSeconds / totalSeconds;
    let color, glow;
    if (progress > 0.5) {
      color = 'var(--accent-2)';
      glow  = '5px var(--accent-2)';
      ringFill.classList.remove('danger-pulse');
    } else if (progress > 0.25) {
      color = 'var(--warn)';
      glow  = '5px var(--warn)';
      ringFill.classList.remove('danger-pulse');
    } else {
      color = '#e05252';
      glow  = '6px #e05252';
      ringFill.classList.add('danger-pulse');
    }
    ringFill.style.stroke = color;
    ringFill.style.filter = `drop-shadow(0 0 ${glow})`;
    display.style.color   = progress <= 0.25 && totalSeconds > 0 ? '#e05252' : '';
  }

  startBtn.addEventListener('click', () => {
    if (totalSeconds === 0) return;
    isRunning ? pauseTimer() : startTimer();
  });

  resetBtn.addEventListener('click', resetTimer);

  function startTimer() {
    if (remainingSeconds <= 0) remainingSeconds = totalSeconds;
    isRunning = true;
    startBtn.textContent   = 'Pause';
    statusText.textContent = 'Running';
    timerInterval = setInterval(tick, 1000);
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    startBtn.textContent   = 'Resume';
    statusText.textContent = 'Paused';
  }

  function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    remainingSeconds = totalSeconds;
    startBtn.textContent  = 'Start';
    startBtn.disabled     = totalSeconds <= 0;
    statusText.textContent = totalSeconds > 0 ? 'Ready' : 'Set a time';
    ringFill.classList.remove('danger-pulse');
    overlay.classList.add('hidden');
    updateDisplay();
    snapRing();
  }

  function tick() {
    remainingSeconds--;
    updateDisplay();
    updateRingOffset();
    updateRingColor();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      isRunning = false;
      triggerTimeout();
    }
  }

  function triggerTimeout() {
    startBtn.textContent   = 'Restart';
    statusText.textContent = "Time's up!";
    spawnParticles();
    overlay.classList.remove('hidden');
  }

  function spawnParticles() {
    const container = document.getElementById('timer-particles');
    container.innerHTML = '';
    const colors = ['#54b7e8', '#79d2b9', '#ffb36b', '#ff6b9d', '#ffffff', '#ffd700', '#a78bfa'];
    const count  = 55;
    for (let i = 0; i < count; i++) {
      const p     = document.createElement('div');
      p.className = 'timer-particle';
      const angle    = (i / count) * 360 + (Math.random() * 14 - 7);
      const distance = 90 + Math.random() * 200;
      const rad      = (angle * Math.PI) / 180;
      const tx       = Math.cos(rad) * distance;
      const ty       = Math.sin(rad) * distance;
      const size     = 4 + Math.random() * 10;
      const duration = 0.55 + Math.random() * 1.2;
      const delay    = Math.random() * 0.45;
      const color    = colors[Math.floor(Math.random() * colors.length)];
      const radius   = Math.random() > 0.45 ? '50%' : '2px';
      p.style.cssText = [
        `--tx: ${tx}px`,
        `--ty: ${ty}px`,
        `width: ${size}px`,
        `height: ${size}px`,
        `background: ${color}`,
        `border-radius: ${radius}`,
        `animation-duration: ${duration}s`,
        `animation-delay: ${delay}s`,
      ].join(';');
      container.appendChild(p);
    }
  }

  dismissBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    ringFill.classList.remove('danger-pulse');
    remainingSeconds = totalSeconds;
    startBtn.textContent  = 'Start';
    startBtn.disabled     = totalSeconds <= 0;
    statusText.textContent = totalSeconds > 0 ? 'Ready' : 'Set a time';
    display.style.color   = '';
    updateDisplay();
    snapRing();
  });

  setTime(0);
})();
