'use strict';

const body = document.body;
const userId = body.dataset.userId;

if (userId) {
  const eventKey = `avance.events.v2.${userId}`;
  const playedEventKey = `avance.events-played.v2.${userId}`;
  const reminderKey = `avance.reminder-30.v2.${userId}`;
  const pendingKey = 'avance.pending-dashboard-sounds.v1';
  const handledKey = 'avance.handled-sale.v1';
  const enabledKey = 'avance.sounds-enabled.v1';
  const soundControl = document.querySelector('#sound-control');
  const isDashboard = window.location.pathname === '/';
  const isSalesPage = window.location.pathname === '/sales' || window.location.pathname.startsWith('/sales/');
  const soundFiles = {
    sale_created: '/assets/sounds/venda.mp3',
    ranking_overtake: '/assets/sounds/ultrapassagem.mp3',
    daily_goal_reached: '/assets/sounds/meta.mp3',
    reminder_30: '/assets/sounds/audio_30.mp3'
  };

  let lastId = 0;
  let audioContext;
  let soundBuffers = {};
  let soundsEnabled = false;
  let unlockPromise;
  let soundQueue = Promise.resolve();
  let drainingPending = false;
  let reminderInFlightSlot = null;
  let isAudioLeader = !navigator.locks;
  let claimingAudioLeadership = false;

  const readJson = (storage, key) => {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
  };

  const setSoundControl = (enabled) => {
    if (!soundControl) return;
    soundControl.textContent = enabled ? 'Sons ativos' : 'Ativar sons';
    soundControl.dataset.enabled = String(enabled);
    soundControl.setAttribute('aria-pressed', String(enabled));
  };

  const unlockAudio = () => {
    if (soundsEnabled && audioContext?.state === 'running') return Promise.resolve(true);
    if (unlockPromise) return unlockPromise;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return Promise.resolve(false);
    if (!audioContext) audioContext = new AudioContext();
    unlockPromise = (async () => {
      try {
        await audioContext.resume();
        if (Object.keys(soundBuffers).length !== Object.keys(soundFiles).length) {
          const loaded = await Promise.all(Object.entries(soundFiles).map(async ([type, file]) => {
            const response = await fetch(file, { cache: 'force-cache' });
            if (!response.ok) throw new Error(`Falha ao carregar ${file}`);
            return [type, await audioContext.decodeAudioData(await response.arrayBuffer())];
          }));
          soundBuffers = Object.fromEntries(loaded);
        }
        soundsEnabled = audioContext.state === 'running';
        if (soundsEnabled) sessionStorage.setItem(enabledKey, '1');
        setSoundControl(soundsEnabled);
        return soundsEnabled;
      } catch {
        soundsEnabled = false;
        setSoundControl(false);
        return false;
      } finally {
        unlockPromise = null;
      }
    })();
    return unlockPromise;
  };

  const playNow = (type) => new Promise((resolve) => {
    const file = soundFiles[type];
    if (!file) return resolve(false);
    const buffer = soundBuffers[type];
    if (soundsEnabled && buffer && audioContext?.state === 'running') {
      const source = audioContext.createBufferSource();
      let finished = false;
      const finish = () => { if (!finished) { finished = true; resolve(true); } };
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.addEventListener('ended', finish, { once: true });
      source.start();
      window.setTimeout(finish, Math.ceil(buffer.duration * 1000) + 1000);
      return;
    }

    const audio = new Audio(file);
    let finished = false;
    const finish = (played) => { if (!finished) { finished = true; resolve(played); } };
    audio.preload = 'auto';
    audio.addEventListener('ended', () => finish(true), { once: true });
    audio.addEventListener('error', () => finish(false), { once: true });
    audio.play().catch(() => { setSoundControl(false); finish(false); });
    window.setTimeout(() => { audio.pause(); finish(false); }, 60000);
  });

  const queueSound = (type, onStart) => {
    const task = soundQueue.catch(() => false).then(async () => {
      if (typeof onStart === 'function') onStart();
      return playNow(type);
    });
    soundQueue = task.then(() => undefined, () => undefined);
    return task;
  };

  const celebrate = (type) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    body.classList.add(type === 'ranking_overtake' ? 'flash' : 'celebrate');
    setTimeout(() => body.classList.remove('flash', 'celebrate'), 1200);
  };

  const handledSaleId = () => {
    const handled = readJson(sessionStorage, handledKey);
    if (!handled || Date.now() - Number(handled.createdAt || 0) > 10 * 60 * 1000) {
      sessionStorage.removeItem(handledKey);
      return null;
    }
    return Number(handled.saleId);
  };

  const originatedByActiveLocalFlow = (payload) => {
    const key = `avance.local-sale-flow.v1.${userId}`;
    const flow = readJson(localStorage, key);
    if (!flow || Date.now() - Number(flow.startedAt || 0) > 2 * 60 * 1000) {
      localStorage.removeItem(key);
      return false;
    }
    return Number(payload?.createdBy) === Number(userId);
  };

  const claimAudioLeadership = () => {
    if (!isDashboard || !navigator.locks || isAudioLeader || claimingAudioLeadership) return;
    claimingAudioLeadership = true;
    navigator.locks.request(`avance-audio-leader-${userId}`, { ifAvailable: true }, (lock) => {
      claimingAudioLeadership = false;
      if (!lock) return undefined;
      isAudioLeader = true;
      return new Promise((resolve) => window.addEventListener('pagehide', resolve, { once: true }));
    }).catch(() => { claimingAudioLeadership = false; });
  };

  const consume = (event) => {
    const id = Number(event.lastEventId);
    if (!id || id <= lastId) return;
    lastId = id;
    localStorage.setItem(eventKey, String(id));
    let payload = event.payload;
    if (typeof payload === 'string') try { payload = JSON.parse(payload); } catch { payload = null; }
    if (!payload && event.data) try { payload = JSON.parse(event.data); } catch { payload = null; }
    if (Number(payload?.saleId) === handledSaleId()) return;
    if (originatedByActiveLocalFlow(payload)) return;
    if (event.type === 'ranking_overtake' && !isDashboard) return;
    if (!isAudioLeader) return;
    const globallyPlayedId = Number(localStorage.getItem(playedEventKey) || 0);
    if (id <= globallyPlayedId) return;
    localStorage.setItem(playedEventKey, String(id));
    queueSound(event.type, event.type === 'sale_created' ? null : () => celebrate(event.type));
  };

  const drainPendingDashboardSounds = async () => {
    if (!isDashboard || drainingPending) return;
    const pending = readJson(sessionStorage, pendingKey);
    if (!pending?.sounds?.length) return;
    drainingPending = true;
    try {
      await unlockAudio();
      while (pending.sounds.length) {
        const type = pending.sounds[0];
        const played = await queueSound(type, () => celebrate(type));
        if (!played) return;
        pending.sounds.shift();
        sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      }
      sessionStorage.removeItem(pendingKey);
    } finally {
      drainingPending = false;
    }
  };

  const activateSounds = async () => {
    if (await unlockAudio()) {
      drainPendingDashboardSounds();
      playHalfHourReminder();
    }
  };

  setSoundControl(false);
  document.addEventListener('pointerdown', activateSounds, { once: true });
  document.addEventListener('keydown', activateSounds, { once: true });
  soundControl?.addEventListener('click', activateSounds);
  window.AvanceAudio = { unlock: unlockAudio, play: queueSound };

  const localBusinessTime = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: body.dataset.timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts();
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  };

  async function playHalfHourReminder() {
    if (!isDashboard || !isAudioLeader || !soundsEnabled) return;
    const time = localBusinessTime();
    const hour = Number(time.hour);
    const minute = Number(time.minute);
    const withinMorning = hour >= 8 && hour < 12;
    const withinAfternoon = (hour === 13 && minute >= 30) || (hour >= 14 && hour < 17) || (hour === 17 && (minute === 0 || minute === 30));
    if ((minute !== 0 && minute !== 30) || (!withinMorning && !withinAfternoon)) return;
    const slot = `${time.year}-${time.month}-${time.day}-${hour}-${minute}`;
    if (localStorage.getItem(reminderKey) === slot || reminderInFlightSlot === slot) return;
    reminderInFlightSlot = slot;
    try {
      if (await queueSound('reminder_30')) localStorage.setItem(reminderKey, slot);
    } finally {
      if (reminderInFlightSlot === slot) reminderInFlightSlot = null;
    }
  }

  claimAudioLeadership();
  window.setInterval(claimAudioLeadership, 5000);
  window.setInterval(playHalfHourReminder, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') playHalfHourReminder();
  });
  if (sessionStorage.getItem(enabledKey) === '1') activateSounds();
  drainPendingDashboardSounds();

  let polling = false;
  const poll = async () => {
    try {
      const response = await fetch(`/api/v1/dashboard/events/poll?after=${lastId}`, { credentials: 'same-origin' });
      const json = await response.json();
      for (const row of json.data || []) consume({ lastEventId: String(row.id), type: row.type, payload: row.payload });
    } catch {}
    if (polling) setTimeout(poll, 5000);
  };

  const startLiveEvents = async () => {
    if (!isDashboard || isSalesPage) return;
    try {
      const response = await fetch('/api/v1/dashboard/events/cursor', { credentials: 'same-origin' });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error('Cursor indisponível');
      lastId = Number(json.data?.lastId || 0);
      localStorage.setItem(eventKey, String(lastId));
    } catch {
      window.setTimeout(startLiveEvents, 5000);
      return;
    }

    if (window.EventSource) {
      const source = new EventSource(`/api/v1/dashboard/events?after=${lastId}`);
      for (const type of ['sale_created', 'ranking_overtake', 'daily_goal_reached']) source.addEventListener(type, consume);
      source.onerror = () => { source.close(); polling = true; poll(); };
    } else {
      polling = true;
      poll();
    }
  };

  startLiveEvents();
}
