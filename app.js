// === Data Store ===
const STORAGE_KEY = 'flashcards_app_data';
const DECK_COLORS = ['#4361ee','#7c3aed','#ec4899','#ef4444','#f59e0b','#10b981','#06b6d4','#8b5cf6'];

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

const ACHIEVEMENTS = [
  { id: 'first_review', name: 'První krok', desc: 'Dokončete první opakování', icon: '\u{1F3AF}', check: (d) => d.stats.totalReviews >= 1 },
  { id: 'reviews_100', name: 'Pilný student', desc: '100 opakování', icon: '\u{1F4D6}', check: (d) => d.stats.totalReviews >= 100 },
  { id: 'reviews_500', name: 'Studijní manažer', desc: '500 opakování', icon: '\u{1F3C6}', check: (d) => d.stats.totalReviews >= 500 },
  { id: 'reviews_1000', name: 'Mistr učení', desc: '1000 opakování', icon: '\u{1F451}', check: (d) => d.stats.totalReviews >= 1000 },
  { id: 'streak_3', name: 'Třídenní série', desc: '3 dny v řadě', icon: '\u{1F525}', check: (d) => d.stats.currentStreak >= 3 },
  { id: 'streak_7', name: 'Týdenní válec', desc: '7 dnů v řadě', icon: '\u{2B50}', check: (d) => d.stats.currentStreak >= 7 },
  { id: 'streak_30', name: 'Měsíční legenda', desc: '30 dnů v řadě', icon: '\u{1F48E}', check: (d) => d.stats.currentStreak >= 30 },
  { id: 'cards_50', name: 'Sběratel', desc: 'Vytvořte 50 kartiček', icon: '\u{1F0CF}', check: (d) => d.cards.length >= 50 },
  { id: 'cards_200', name: 'Knihovna', desc: '200 kartiček', icon: '\u{1F4DA}', check: (d) => d.cards.length >= 200 },
  { id: 'decks_5', name: 'Organizátor', desc: '5 balíčků', icon: '\u{1F4C1}', check: (d) => d.decks.length >= 5 },
  { id: 'daily_goal', name: 'Cílový střelec', desc: 'Splňte denní cíl', icon: '\u{1F3AF}', check: (d) => {
    const today = SRS.todayStr();
    const ts = d.stats.dailyStats[today];
    return ts && ts.reviews >= d.settings.dailyGoal;
  }},
];

const Store = {
  _data: null,

  defaultData() {
    return {
      version: 3,
      settings: { darkMode: false, cardsPerSession: 20, groqApiKey: '', dailyGoal: 20, deckSortMode: 'manual', enableReversed: false, speedRoundTime: 30 },
      decks: [],
      cards: [],
      reviewLog: [],
      stats: {
        totalReviews: 0, totalCorrect: 0, currentStreak: 0, longestStreak: 0,
        lastStudyDate: null, dailyStats: {}
      },
      gamification: { xp: 0, level: 1, achievements: [] }
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this._data = raw ? JSON.parse(raw) : this.defaultData();
    } catch (e) {
      this._data = this.defaultData();
    }
    this._migrate();
    return this._data;
  },

  _migrate() {
    const d = this._data;
    if (!d.version || d.version < 2) {
      d.settings.dailyGoal = d.settings.dailyGoal || 20;
      d.settings.deckSortMode = d.settings.deckSortMode || 'manual';
      d.settings.enableReversed = d.settings.enableReversed || false;
      d.gamification = d.gamification || { xp: 0, level: 1, achievements: [] };
      for (const deck of d.decks) { if (deck.sortOrder === undefined) deck.sortOrder = 0; }
      for (const card of d.cards) {
        if (card.hint === undefined) card.hint = '';
        if (card.favorite === undefined) card.favorite = false;
      }
      d.version = 2;
    }
    if (d.version < 3) {
      d.settings.speedRoundTime = d.settings.speedRoundTime || 30;
      d.version = 3;
    }
    if (d.version < 4) {
      d.settings.ttsAutoFront = d.settings.ttsAutoFront || false;
      d.settings.ttsAutoBack = d.settings.ttsAutoBack || false;
      d.settings.ttsRate = d.settings.ttsRate || 1.0;
      d.settings.ttsVoice = d.settings.ttsVoice || '';
      d.version = 4;
    }
    this.save();
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      if (typeof App !== 'undefined' && App.toast) App.toast('Chyba při ukládání dat. Úložiště je plné.', 'error');
    }
  },

  get data() { if (!this._data) this.load(); return this._data; },

  createDeck(name, description, color) {
    const deck = {
      id: generateId('deck'), name, description: description || '',
      color: color || DECK_COLORS[this.data.decks.length % DECK_COLORS.length],
      sortOrder: this.data.decks.length,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    this.data.decks.push(deck);
    this.save();
    return deck;
  },

  updateDeck(id, updates) {
    const deck = this.data.decks.find(d => d.id === id);
    if (!deck) return null;
    Object.assign(deck, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return deck;
  },

  deleteDeck(id) {
    this.data.decks = this.data.decks.filter(d => d.id !== id);
    this.data.cards = this.data.cards.filter(c => c.deckId !== id);
    this.data.reviewLog = this.data.reviewLog.filter(r => r.deckId !== id);
    this.save();
  },

  getDeck(id) { return this.data.decks.find(d => d.id === id) || null; },

  createCard(deckId, front, back, tags, hint) {
    const card = {
      id: generateId('card'), deckId, front, back, tags: tags || [], hint: hint || '',
      favorite: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      repetitions: 0, easeFactor: 2.5, interval: 0, nextReview: null, status: 'new'
    };
    this.data.cards.push(card);
    this.save();
    return card;
  },

  updateCard(id, updates) {
    const card = this.data.cards.find(c => c.id === id);
    if (!card) return null;
    Object.assign(card, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return card;
  },

  deleteCard(id) { this.data.cards = this.data.cards.filter(c => c.id !== id); this.save(); },

  deleteCards(ids) {
    const set = new Set(ids);
    this.data.cards = this.data.cards.filter(c => !set.has(c.id));
    this.save();
  },

  getCardsByDeck(deckId) { return this.data.cards.filter(c => c.deckId === deckId); },

  searchCards(query, deckId, activeTag) {
    let cards = deckId ? this.getCardsByDeck(deckId) : this.data.cards;
    if (query) {
      const q = query.toLowerCase();
      cards = cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q));
    }
    if (activeTag) cards = cards.filter(c => c.tags.includes(activeTag));
    return cards;
  },

  recordReview(cardId, userQuality) {
    const card = this.data.cards.find(c => c.id === cardId);
    if (!card) return;
    const quality = SRS.QUALITY_MAP[userQuality];
    const prev = { interval: card.interval, ef: card.easeFactor };
    const result = SRS.calculate(quality, card.repetitions, card.easeFactor, card.interval);
    card.repetitions = result.repetitions;
    card.easeFactor = result.easeFactor;
    card.interval = result.interval;
    card.nextReview = result.nextReview;
    card.status = quality >= 3 ? 'review' : 'learning';

    this.data.reviewLog.push({
      cardId, deckId: card.deckId, timestamp: new Date().toISOString(), quality: userQuality,
      previousInterval: prev.interval, newInterval: result.interval, previousEF: prev.ef, newEF: result.easeFactor
    });

    const today = SRS.todayStr();
    if (!this.data.stats.dailyStats[today]) this.data.stats.dailyStats[today] = { reviews: 0, correct: 0, newCards: 0 };
    this.data.stats.dailyStats[today].reviews++;
    if (quality >= 3) this.data.stats.dailyStats[today].correct++;
    this.data.stats.totalReviews++;
    if (quality >= 3) this.data.stats.totalCorrect++;
    this.updateStreak(today);

    let xpGain = 10;
    if (userQuality >= 4) xpGain += 5;
    if (userQuality === 5) xpGain += 10;
    Gamification.addXP(xpGain);

    const ts = this.data.stats.dailyStats[today];
    if (ts && ts.reviews === this.data.settings.dailyGoal) {
      Gamification.addXP(50);
      App.toast('Denní cíl splněn! +50 XP', 'success');
    }

    Gamification.checkAchievements();
    this.save();
  },

  updateStreak(today) {
    const last = this.data.stats.lastStudyDate;
    if (!last) { this.data.stats.currentStreak = 1; }
    else if (last === today) { /* same day */ }
    else {
      const lastDate = new Date(last);
      const todayDate = new Date(today);
      const diff = Math.round((todayDate - lastDate) / 86400000);
      this.data.stats.currentStreak = diff === 1 ? this.data.stats.currentStreak + 1 : 1;
    }
    this.data.stats.lastStudyDate = today;
    if (this.data.stats.currentStreak > this.data.stats.longestStreak)
      this.data.stats.longestStreak = this.data.stats.currentStreak;
  },

  exportJSON() { return JSON.stringify(this.data, null, 2); },

  importJSON(jsonStr, mode) {
    try {
      const imported = JSON.parse(jsonStr);
      if (mode === 'replace') { this._data = imported; }
      else {
        const existingDeckIds = new Set(this.data.decks.map(d => d.id));
        const existingCardIds = new Set(this.data.cards.map(c => c.id));
        for (const deck of (imported.decks || [])) { if (!existingDeckIds.has(deck.id)) this.data.decks.push(deck); }
        for (const card of (imported.cards || [])) { if (!existingCardIds.has(card.id)) this.data.cards.push(card); }
        for (const entry of (imported.reviewLog || [])) { this.data.reviewLog.push(entry); }
      }
      this._migrate();
      this.save();
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  clearAll() { this._data = this.defaultData(); this.save(); }
};

// === Gamification ===
const Gamification = {
  addXP(amount) {
    const g = Store.data.gamification;
    const oldLevel = g.level;
    g.xp += amount;
    g.level = Math.floor(g.xp / 500) + 1;
    if (g.level > oldLevel) {
      App.toast(`Level UP! Úroveň ${g.level}`, 'success');
    }
  },

  checkAchievements() {
    const g = Store.data.gamification;
    const d = Store.data;
    const unlocked = new Set(g.achievements.map(a => a.id));
    for (const ach of ACHIEVEMENTS) {
      if (!unlocked.has(ach.id) && ach.check(d)) {
        g.achievements.push({ id: ach.id, unlockedAt: new Date().toISOString() });
        App.toast(`${ach.icon} Odznak: ${ach.name}`, 'success');
      }
    }
  }
};

// === Markdown Parser ===
const Markdown = {
  render(text) {
    if (!text) return '';
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => '<pre><code>' + code.trim() + '</code></pre>');
    const lines = html.split('\n');
    let result = [];
    let inList = false;
    let listType = '';
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (line.match(/^### /)) { closeLists(); result.push('<h3>' + inline(line.slice(4)) + '</h3>'); continue; }
      if (line.match(/^## /)) { closeLists(); result.push('<h2>' + inline(line.slice(3)) + '</h2>'); continue; }
      if (line.match(/^# /)) { closeLists(); result.push('<h1>' + inline(line.slice(2)) + '</h1>'); continue; }
      if (line.match(/^&gt; /)) { closeLists(); result.push('<blockquote>' + inline(line.slice(5)) + '</blockquote>'); continue; }
      if (line.match(/^[-*] /)) {
        if (listType !== 'ul') { closeLists(); result.push('<ul>'); inList = true; listType = 'ul'; }
        result.push('<li>' + inline(line.slice(2)) + '</li>');
        continue;
      }
      if (line.match(/^\d+\. /)) {
        if (listType !== 'ol') { closeLists(); result.push('<ol>'); inList = true; listType = 'ol'; }
        result.push('<li>' + inline(line.replace(/^\d+\. /, '')) + '</li>');
        continue;
      }
      closeLists();
      if (line.trim() === '') { result.push('<br>'); }
      else { result.push(inline(line)); }
    }
    closeLists();
    function closeLists() {
      if (inList) { result.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; listType = ''; }
    }
    function inline(s) {
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return s;
    }
    return '<div class="md-content">' + result.join('\n') + '</div>';
  }
};

// === Import Parsers ===
const Importer = {
  parseCSV(text, separator) {
    separator = separator || ';';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const cards = []; const errors = []; let startIdx = 0;
    if (lines.length > 0) {
      const first = lines[0].toLowerCase();
      if (first.includes('front') || first.includes('back') || first.includes('otazka') || first.includes('otázka') || first.includes('odpoved') || first.includes('odpověd')) startIdx = 1;
    }
    for (let i = startIdx; i < lines.length; i++) {
      const parts = Importer._splitCSV(lines[i], separator);
      if (parts.length >= 2) cards.push({ front: parts[0].trim(), back: parts[1].trim() });
      else errors.push(`Řádek ${i + 1}: chybí oddělovač`);
    }
    return { cards, errors };
  },

  _splitCSV(line, sep) {
    const parts = []; let current = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === sep && !inQuotes) { parts.push(current); current = ''; }
      else current += ch;
    }
    parts.push(current);
    return parts;
  },

  parseText(text) {
    const cards = []; const errors = [];
    const blocks = text.split(/\n\s*\n/);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;
      const qaMatch = block.match(/^(?:Q|Ot[aá]zka)\s*:\s*([\s\S]*?)(?:\n\s*(?:A|Odpov[eě][dď])\s*:\s*)([\s\S]*)$/im);
      if (qaMatch) cards.push({ front: qaMatch[1].trim(), back: qaMatch[2].trim() });
      else errors.push(`Blok ${i + 1}: nerozpoznaný formát`);
    }
    return { cards, errors };
  },

  parseMarkdown(text) {
    const cards = []; const errors = [];
    const lines = text.split('\n');
    let currentFront = null; let currentBack = [];
    for (const line of lines) {
      if (line.match(/^##\s+(.+)/)) {
        if (currentFront !== null && currentBack.length > 0)
          cards.push({ front: currentFront, back: currentBack.join('\n').trim() });
        currentFront = line.replace(/^##\s+/, '').trim();
        currentBack = [];
      } else if (line.match(/^#\s+/) && currentFront === null) { /* H1 = deck name, skip */ }
      else if (currentFront !== null) currentBack.push(line);
    }
    if (currentFront !== null && currentBack.length > 0)
      cards.push({ front: currentFront, back: currentBack.join('\n').trim() });
    if (cards.length === 0) {
      const blocks = text.split(/\n\s*\n/);
      for (const block of blocks) {
        const b = block.trim();
        const sepIdx = b.indexOf('\n---\n');
        if (sepIdx !== -1) {
          const front = b.substring(0, sepIdx).trim();
          const back = b.substring(sepIdx + 5).trim();
          if (front && back) cards.push({ front, back });
        }
      }
    }
    return { cards, errors };
  },

  importCards(parsedCards, deckId, tags) {
    let imported = 0;
    for (const pc of parsedCards) {
      if (pc.front && pc.back) { Store.createCard(deckId, pc.front, pc.back, tags || []); imported++; }
    }
    return { imported, skipped: parsedCards.length - imported };
  }
};

// === AI Generator ===
const AIGenerator = {
  async generate(text, apiKey) {
    const systemPrompt = `Jsi expert na vytváření studijních kartiček. Z dodaného textu vytvoř co nejvíce kartiček pro efektivní učení.
Pravidla:
- Každá kartička má otázku (front) a odpověď (back)
- Otázky by měly být jasné, konkrétní a testovatelné
- Odpovědi by měly být stručné ale úplné
- Pokryj všechny důležité pojmy, definice, fakta
- Piš česky, pokud je text v češtině
DŮLEŽITÉ: Odpověz POUZE platným JSON polem:
[{"front": "otázka", "back": "odpověď"}]`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 8192, temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Vytvoř kartičky z tohoto textu:\n\n${text}` }
        ]
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Chyba ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('AI vrátila prázdnou odpověď.');
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const bracketMatch = content.match(/\[[\s\S]*\]/);
    const candidates = [codeBlockMatch?.[1]?.trim(), bracketMatch?.[0]?.trim(), content.trim()].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const cards = JSON.parse(candidate);
        if (Array.isArray(cards) && cards.length > 0 && cards[0].front) return cards.filter(c => c.front && c.back);
      } catch (e) { /* try next */ }
    }
    throw new Error('Nepodařilo se zpracovat odpověď AI.');
  }
};

// === Charts ===
const Charts = {
  drawHeatmap(container, dailyStats) {
    const days = 91; const today = new Date(); container.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'heatmap-grid';
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today); date.setDate(date.getDate() - i);
      const dateStr = SRS.toLocalDateStr(date);
      const stat = dailyStats[dateStr]; const reviews = stat ? stat.reviews : 0;
      const cell = document.createElement('div'); cell.className = 'heatmap-cell';
      if (reviews >= 20) cell.className += ' heatmap-level-4';
      else if (reviews >= 10) cell.className += ' heatmap-level-3';
      else if (reviews >= 5) cell.className += ' heatmap-level-2';
      else if (reviews >= 1) cell.className += ' heatmap-level-1';
      cell.title = `${dateStr}: ${reviews} opakování`;
      grid.appendChild(cell);
    }
    container.appendChild(grid);
  },

  drawLineChart(canvas, dailyStats) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = 200 * dpr; canvas.style.height = '200px';
    ctx.scale(dpr, dpr);
    const w = rect.width, h = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartW = w - padding.left - padding.right, chartH = h - padding.top - padding.bottom;
    const today = new Date(); const data = []; const labels = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = SRS.toLocalDateStr(d); const stat = dailyStats[ds];
      data.push(stat ? stat.reviews : 0); labels.push(d.getDate() + '.');
    }
    const maxVal = Math.max(...data, 1);
    ctx.clearRect(0, 0, w, h);
    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#a0a0b8' : '#555770';
    const gridColor = isDark ? '#2e2e48' : '#e0e2e8';
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
    }
    ctx.fillStyle = textColor; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.fillText(Math.round(maxVal * (1 - i / 4)), padding.left - 8, y + 4);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < data.length; i += 5) {
      ctx.fillText(labels[i], padding.left + (chartW / (data.length - 1)) * i, h - 8);
    }
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      const y = padding.top + chartH - (data[i] / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#4361ee'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH); ctx.closePath();
    ctx.fillStyle = isDark ? 'rgba(67,97,238,0.15)' : 'rgba(67,97,238,0.1)'; ctx.fill();
    ctx.fillStyle = '#4361ee';
    for (let i = 0; i < data.length; i++) {
      const x = padding.left + (chartW / (data.length - 1)) * i;
      const y = padding.top + chartH - (data[i] / maxVal) * chartH;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawBarChart(canvas, deckData) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    const barHeight = 30, gap = 8;
    const h = deckData.length * (barHeight + gap) + 40;
    canvas.height = h * dpr; canvas.style.height = h + 'px'; ctx.scale(dpr, dpr);
    const w = rect.width;
    const padding = { left: 120, right: 20 }; const chartW = w - padding.left - padding.right;
    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#a0a0b8' : '#555770';
    ctx.clearRect(0, 0, w, h); ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    const maxTotal = Math.max(...deckData.map(d => d.total), 1);
    for (let i = 0; i < deckData.length; i++) {
      const d = deckData[i]; const y = 10 + i * (barHeight + gap);
      ctx.fillStyle = textColor;
      ctx.fillText(d.name.length > 15 ? d.name.substring(0, 14) + '...' : d.name, padding.left - 10, y + barHeight / 2 + 4);
      const totalW = (d.total / maxTotal) * chartW; let x = padding.left;
      const segments = [{ count: d.newCount, color: '#4361ee' }, { count: d.learningCount, color: '#f59e0b' }, { count: d.reviewCount, color: '#10b981' }];
      for (const seg of segments) {
        const sw = d.total > 0 ? (seg.count / d.total) * totalW : 0;
        if (sw > 0) { ctx.fillStyle = seg.color; ctx.fillRect(x, y, sw, barHeight); x += sw; }
      }
    }
    const legendY = h - 20;
    const legends = [{ label: 'Nové', color: '#4361ee' }, { label: 'Učení', color: '#f59e0b' }, { label: 'Opakování', color: '#10b981' }];
    ctx.textAlign = 'left'; let lx = padding.left;
    for (const l of legends) {
      ctx.fillStyle = l.color; ctx.fillRect(lx, legendY, 12, 12);
      ctx.fillStyle = textColor; ctx.fillText(l.label, lx + 16, legendY + 10);
      lx += ctx.measureText(l.label).width + 36;
    }
  }
};

// === Main Application ===
const App = {
  currentView: null,
  studySession: null,
  quizSession: null,
  _matchSession: null,
  _undoStack: [],
  _searchDebounce: null,

  init() {
    Store.load();
    if (Store.data.settings.darkMode) document.body.classList.add('dark');
    window.addEventListener('hashchange', () => App.route());
    document.addEventListener('keydown', (e) => App.handleKeyboard(e));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        // Check for updates every 5 minutes
        setInterval(() => reg.update(), 5 * 60 * 1000);
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data && e.data.type === 'UPDATE_AVAILABLE') {
          App.toast('Nová verze dostupná', 'info', 15000, {
            label: 'Aktualizovat',
            handler: () => {
              if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
              }
              window.location.reload();
            }
          });
        }
      });
      // On new SW activation, reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App._installPrompt = e; });
    if (!window.location.hash) window.location.hash = '#decks';
    else App.route();
  },

  navigate(hash) { window.location.hash = hash; },

  route() {
    const hash = window.location.hash || '#decks';
    const parts = hash.split('/');
    const view = parts[0]; const param = parts[1] || null;
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === view);
    });
    document.getElementById('nav-links').classList.remove('open');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    this.currentView = view;
    // Clear speed timer if leaving study
    if (view !== '#study' && view !== '#speed' && view !== '#cram' && view !== '#study-all') {
      if (this.studySession && this.studySession._speedTimer) {
        clearInterval(this.studySession._speedTimer);
        this.studySession._speedTimer = null;
      }
    }
    switch (view) {
      case '#decks': this.showView('view-decks'); this.renderDecks(); break;
      case '#deck': this.showView('view-deck-detail'); this.renderDeckDetail(param); break;
      case '#edit': this.showView('view-card-edit'); this.renderCardEdit(param, parts[2]); break;
      case '#study': this.showView('view-study'); this.renderStudy(param); break;
      case '#study-all': this.showView('view-study'); this.renderStudyAll(); break;
      case '#cram': this.showView('view-study'); this.renderCram(param); break;
      case '#speed': this.showView('view-study'); this.renderSpeed(param); break;
      case '#match': this.showView('view-match'); this.renderMatch(param); break;
      case '#quiz': this.showView('view-quiz'); this.renderQuizSetup(); break;
      case '#quiz-active': this.showView('view-quiz-active'); this.renderQuizActive(); break;
      case '#quiz-results': this.showView('view-quiz-results'); this.renderQuizResults(); break;
      case '#stats': this.showView('view-stats'); this.renderStats(); break;
      case '#import': this.showView('view-import'); this.renderImport(); break;
      case '#settings': this.showView('view-settings'); this.renderSettings(); break;
      case '#favorites': this.showView('view-favorites'); this.renderFavorites(); break;
      case '#share': this.showView('view-share'); this.renderShareImport(param); break;
      default: this.showView('view-decks'); this.renderDecks();
    }
  },

  showView(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); },
  toggleNav() { document.getElementById('nav-links').classList.toggle('open'); },

  // === Toast ===
  toast(message, type, duration, action) {
    type = type || 'info'; duration = duration || 3000;
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-msg">${this.esc(message)}</span>`;
    if (action) {
      const btn = document.createElement('button');
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.onclick = () => { action.handler(); el.remove(); };
      el.appendChild(btn);
    }
    container.appendChild(el);
    setTimeout(() => { el.classList.add('toast-exit'); setTimeout(() => el.remove(), 300); }, duration);
  },

  // === Undo ===
  undoDelete(type, data) {
    this._undoStack.push({ type, data });
    this.toast(`${type === 'deck' ? 'Balíček' : data.length + ' kartiček'} smazáno`, 'info', 8000, {
      label: 'Zpět',
      handler: () => {
        const item = this._undoStack.pop();
        if (!item) return;
        if (item.type === 'deck') {
          Store.data.decks.push(item.data.deck);
          for (const c of item.data.cards) Store.data.cards.push(c);
          Store.save();
        } else {
          for (const c of item.data) Store.data.cards.push(c);
          Store.save();
        }
        App.toast('Obnoveno', 'success');
        App.route();
      }
    });
  },

  // === Leech Detection ===
  isLeech(cardId) {
    let failures = 0;
    for (const r of Store.data.reviewLog) {
      if (r.cardId === cardId && r.quality <= 2) {
        failures++;
        if (failures >= 8) return true;
      }
    }
    return false;
  },

  getLeechCards() {
    const leechIds = new Set();
    const failCounts = {};
    for (const r of Store.data.reviewLog) {
      if (r.quality <= 2) {
        failCounts[r.cardId] = (failCounts[r.cardId] || 0) + 1;
        if (failCounts[r.cardId] >= 8) leechIds.add(r.cardId);
      }
    }
    return Store.data.cards.filter(c => leechIds.has(c.id));
  },

  // === Deck Dashboard ===
  renderDecks() {
    const container = document.getElementById('view-decks');
    let decks = [...Store.data.decks];
    const sortMode = Store.data.settings.deckSortMode;

    if (sortMode === 'name') decks.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortMode === 'date') decks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sortMode === 'due') decks.sort((a, b) => SRS.countDue(Store.data.cards, b.id) - SRS.countDue(Store.data.cards, a.id));
    else decks.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    const today = SRS.todayStr();
    const todayStats = Store.data.stats.dailyStats[today] || { reviews: 0 };
    const goal = Store.data.settings.dailyGoal;
    const goalPct = Math.min(100, Math.round(todayStats.reviews / goal * 100));
    const g = Store.data.gamification;
    const totalDue = SRS.countDue(Store.data.cards);

    let html = `
      <div class="page-header">
        <h1>Moje balíčky</h1>
        <div class="header-actions">
          ${totalDue > 0 ? `<button class="btn btn-success" onclick="App.navigate('#study-all')">Studovat vše (${totalDue})</button>` : ''}
          <button class="btn btn-primary" onclick="App.showDeckForm()">+ Nový balíček</button>
        </div>
      </div>
      <div class="daily-goal-widget">
        <div class="daily-goal-info">
          <div class="goal-title">Denní cíl</div>
          <div class="goal-numbers">${todayStats.reviews} / ${goal}</div>
        </div>
        <div class="daily-goal-bar"><div class="daily-goal-fill ${goalPct >= 100 ? 'complete' : ''}" style="width:${goalPct}%"></div></div>
        <div class="daily-goal-xp">
          <div class="xp-level">Lv. ${g.level}</div>
          <div class="xp-amount">${g.xp} XP</div>
        </div>
      </div>
      <div class="deck-sort-bar">
        <select class="select" onchange="App.setDeckSort(this.value)">
          <option value="manual" ${sortMode==='manual'?'selected':''}>Vlastní pořadí</option>
          <option value="name" ${sortMode==='name'?'selected':''}>Podle názvu</option>
          <option value="date" ${sortMode==='date'?'selected':''}>Podle data</option>
          <option value="due" ${sortMode==='due'?'selected':''}>Podle k opakování</option>
        </select>
      </div>
      <div id="deck-form-area"></div>`;

    if (decks.length === 0) {
      html += `<div class="empty-state"><div class="empty-state-icon">\u{1F4DA}</div><h3>Žádné balíčky</h3><p>Vytvořte svůj první balíček kartiček a začněte se učit!</p><button class="btn btn-primary" onclick="App.showDeckForm()">Vytvořit balíček</button></div>`;
    } else {
      html += '<div class="deck-grid">';
      for (let idx = 0; idx < decks.length; idx++) {
        const deck = decks[idx];
        const cards = Store.getCardsByDeck(deck.id);
        const due = SRS.countDue(Store.data.cards, deck.id);
        const draggable = sortMode === 'manual' ? 'draggable="true" ondragstart="App.dragDeck(event,\''+deck.id+'\')" ondragover="App.dragOverDeck(event)" ondrop="App.dropDeck(event,\''+deck.id+'\')" ondragend="App.dragEndDeck(event)"' : '';
        html += `
          <div class="card deck-card card-clickable" ${draggable} onclick="App.navigate('#deck/${deck.id}')">
            <div class="deck-accent" style="background:${deck.color}"></div>
            <div class="deck-name">${App.esc(deck.name)}</div>
            <div class="deck-desc">${App.esc(deck.description)}</div>
            <div class="deck-meta">
              <span>${cards.length} kartiček</span>
              ${due > 0 ? `<span class="deck-due-badge">${due} k opakování</span>` : '<span class="text-muted">Vše hotovo</span>'}
            </div>
            <div class="deck-actions" onclick="event.stopPropagation()">
              <button class="btn btn-primary btn-sm" onclick="App.navigate('#study/${deck.id}')" ${cards.length===0?'disabled':''}>Studovat</button>
              <button class="btn btn-warning btn-sm" onclick="App.navigate('#cram/${deck.id}')" ${cards.length===0?'disabled':''}>Procvičit</button>
              <button class="btn btn-secondary btn-sm" onclick="App.navigate('#speed/${deck.id}')" ${cards.length===0?'disabled':''}>Rychlé kolo</button>
              <button class="btn btn-secondary btn-sm" onclick="App.navigate('#match/${deck.id}')" ${cards.length<4?'disabled':''}>Párování</button>
              <button class="btn btn-secondary btn-sm" onclick="App.startQuiz('${deck.id}')" ${cards.length<2?'disabled':''}>Kvíz</button>
              <button class="btn btn-secondary btn-sm" onclick="App.showDeckForm('${deck.id}')">Upravit</button>
              <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteDeck('${deck.id}')">Smazat</button>
              <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); App.shareDeck('${deck.id}')">Sdílet</button>
            </div>
          </div>`;
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  setDeckSort(mode) {
    Store.data.settings.deckSortMode = mode;
    Store.save();
    this.renderDecks();
  },

  _dragDeckId: null,
  dragDeck(e, id) { this._dragDeckId = id; e.target.closest('.deck-card').classList.add('dragging'); },
  dragOverDeck(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); },
  dragEndDeck(e) { document.querySelectorAll('.deck-card').forEach(c => c.classList.remove('dragging', 'drag-over')); },
  dropDeck(e, targetId) {
    e.preventDefault();
    document.querySelectorAll('.deck-card').forEach(c => c.classList.remove('drag-over'));
    if (!this._dragDeckId || this._dragDeckId === targetId) return;
    const decks = Store.data.decks;
    const fromIdx = decks.findIndex(d => d.id === this._dragDeckId);
    const toIdx = decks.findIndex(d => d.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = decks.splice(fromIdx, 1);
    decks.splice(toIdx, 0, moved);
    decks.forEach((d, i) => d.sortOrder = i);
    Store.save();
    this._dragDeckId = null;
    this.renderDecks();
  },

  showDeckForm(deckId) {
    const area = document.getElementById('deck-form-area');
    const deck = deckId ? Store.getDeck(deckId) : null;
    const name = deck ? deck.name : '';
    const desc = deck ? deck.description : '';
    const color = deck ? deck.color : DECK_COLORS[Store.data.decks.length % DECK_COLORS.length];
    area.innerHTML = `
      <div class="card mb-2">
        <h3>${deck ? 'Upravit balíček' : 'Nový balíček'}</h3>
        <div class="form-group mt-1"><label class="form-label">Název</label><input class="input" id="deck-name" value="${App.esc(name)}" placeholder="Název balíčku..." autofocus></div>
        <div class="form-group"><label class="form-label">Popis</label><input class="input" id="deck-desc" value="${App.esc(desc)}" placeholder="Krátký popis (nepovinné)"></div>
        <div class="form-group"><label class="form-label">Barva</label>
          <div class="color-options" id="color-options">${DECK_COLORS.map(c => `<div class="color-option ${c===color?'selected':''}" style="background:${c}" data-color="${c}" onclick="App.selectColor(this)"></div>`).join('')}</div>
        </div>
        <div class="flex-between">
          <button class="btn btn-secondary" onclick="App.hideDeckForm()">Zrušit</button>
          <button class="btn btn-primary" onclick="App.saveDeck('${deckId||''}')">${deck?'Uložit':'Vytvořit'}</button>
        </div>
      </div>`;
    document.getElementById('deck-name').focus();
  },

  hideDeckForm() { const a = document.getElementById('deck-form-area'); if (a) a.innerHTML = ''; },
  selectColor(el) { document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected')); el.classList.add('selected'); },

  saveDeck(deckId) {
    const name = document.getElementById('deck-name').value.trim();
    if (!name) { App.toast('Zadejte název balíčku', 'warning'); return; }
    const desc = document.getElementById('deck-desc').value.trim();
    const colorEl = document.querySelector('.color-option.selected');
    const color = colorEl ? colorEl.dataset.color : DECK_COLORS[0];
    if (deckId) Store.updateDeck(deckId, { name, description: desc, color });
    else Store.createDeck(name, desc, color);
    Gamification.checkAchievements();
    this.renderDecks();
  },

  confirmDeleteDeck(deckId) {
    const deck = Store.getDeck(deckId);
    if (!deck) return;
    const cards = Store.getCardsByDeck(deckId);
    App.showModal('Smazat balíček',
      `<p>Opravdu chcete smazat balíček <strong>${App.esc(deck.name)}</strong> a všech <strong>${cards.length}</strong> kartiček?</p>`,
      [
        { label: 'Zrušit', class: 'btn-secondary', action: () => App.hideModal() },
        { label: 'Smazat', class: 'btn-danger', action: () => {
          const deckCopy = { ...deck };
          const cardsCopy = cards.map(c => ({ ...c }));
          Store.deleteDeck(deckId);
          App.hideModal();
          App.undoDelete('deck', { deck: deckCopy, cards: cardsCopy });
          App.renderDecks();
        }}
      ]);
  },

  // === Deck Detail ===
  _deckDetailState: { search: '', activeTag: null, selected: new Set(), deckId: null },

  renderDeckDetail(deckId) {
    if (deckId) this._deckDetailState.deckId = deckId;
    else deckId = this._deckDetailState.deckId;
    const container = document.getElementById('view-deck-detail');
    const deck = Store.getDeck(deckId);
    if (!deck) { this.navigate('#decks'); return; }
    const state = this._deckDetailState;
    const allCards = Store.getCardsByDeck(deckId);
    const cards = Store.searchCards(state.search, deckId, state.activeTag);
    const allTags = [...new Set(allCards.flatMap(c => c.tags))].sort();

    let html = `
      <div class="page-header">
        <div>
          <button class="btn btn-secondary btn-sm mb-1" onclick="App.navigate('#decks')">&#8592; Zpět</button>
          <h1 style="color:${deck.color}">${App.esc(deck.name)}</h1>
          ${deck.description ? `<p class="text-muted text-sm">${App.esc(deck.description)}</p>` : ''}
        </div>
        <div class="header-actions">
          <button class="btn btn-primary btn-sm" onclick="App.navigate('#edit/new/${deckId}')">+ Přidat kartičku</button>
          ${state.selected.size > 0 ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSelectedCards()">Smazat (${state.selected.size})</button>` : ''}
        </div>
      </div>
      <div class="search-bar">
        <input class="input" placeholder="Hledat v kartičkách..." value="${App.esc(state.search)}" oninput="App._deckDetailState.search=this.value; App.renderDeckDetail()">
      </div>`;

    if (allTags.length > 0) {
      html += '<div class="tag-filters">';
      html += `<span class="tag tag-filter ${!state.activeTag?'active':''}" onclick="App._deckDetailState.activeTag=null; App.renderDeckDetail()">Vše</span>`;
      for (const tag of allTags) {
        html += `<span class="tag tag-filter ${state.activeTag===tag?'active':''}" onclick="App._deckDetailState.activeTag='${App.esc(tag)}'; App.renderDeckDetail()">${App.esc(tag)}</span>`;
      }
      html += '</div>';
    }

    if (allCards.length === 0) {
      html += `<div class="empty-state"><div class="empty-state-icon">\u{1F0CF}</div><h3>Žádné kartičky</h3><p>Přidejte kartičky ručně nebo importujte ze souboru.</p>
        <div class="header-actions" style="justify-content:center"><button class="btn btn-primary" onclick="App.navigate('#edit/new/${deckId}')">Přidat kartičku</button><button class="btn btn-secondary" onclick="App.navigate('#import')">Importovat</button></div></div>`;
    } else if (cards.length === 0) {
      html += '<div class="empty-state"><h3>Žádné výsledky</h3><p>Zkuste jiný hledaný výraz.</p></div>';
    } else {
      html += `<p class="text-muted text-sm mb-1">${cards.length} kartiček</p><div class="card-list">`;
      for (const card of cards) {
        const checked = state.selected.has(card.id) ? 'checked' : '';
        const statusClass = 'status-' + card.status;
        const statusLabel = card.status === 'new' ? 'Nová' : card.status === 'learning' ? 'Učení' : card.status === 'suspended' ? 'Pozast.' : 'Opakování';
        const leech = App.isLeech(card.id);
        html += `
          <div class="card-list-item">
            <div class="checkbox-wrapper" onclick="event.stopPropagation()"><input type="checkbox" ${checked} onchange="App.toggleCardSelect('${card.id}', this.checked)"></div>
            <button class="favorite-btn ${card.favorite?'active':''}" onclick="event.stopPropagation(); App.toggleFavorite('${card.id}')" title="Oblíbené">${card.favorite?'\u2605':'\u2606'}</button>
            <div class="card-front-text" onclick="App.navigate('#edit/${card.id}')">${App.esc(card.front)}</div>
            ${card.tags.map(t => `<span class="tag">${App.esc(t)}</span>`).join('')}
            ${leech ? '<span class="leech-badge">\u{1FA78} Leech</span>' : ''}
            <span class="status-badge ${statusClass}">${statusLabel}</span>
            <button class="btn-icon" onclick="event.stopPropagation(); App.toggleSuspend('${card.id}')" title="${card.status==='suspended'?'Obnovit':'Pozastavit'}">
              ${card.status==='suspended'?'\u25B6':'\u23F8'}
            </button>
          </div>`;
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  toggleCardSelect(cardId, checked) {
    if (checked) this._deckDetailState.selected.add(cardId);
    else this._deckDetailState.selected.delete(cardId);
    this.renderDeckDetail();
  },

  toggleFavorite(cardId) {
    const card = Store.data.cards.find(c => c.id === cardId);
    if (card) { card.favorite = !card.favorite; Store.save(); }
    if (this.currentView === '#favorites') this.renderFavorites();
    else this.renderDeckDetail();
  },

  toggleSuspend(cardId) {
    const card = Store.data.cards.find(c => c.id === cardId);
    if (!card) return;
    card.status = card.status === 'suspended' ? 'new' : 'suspended';
    Store.save();
    this.renderDeckDetail();
  },

  deleteSelectedCards() {
    const count = this._deckDetailState.selected.size;
    App.showModal('Smazat kartičky', `<p>Opravdu chcete smazat ${count} kartiček?</p>`, [
      { label: 'Zrušit', class: 'btn-secondary', action: () => App.hideModal() },
      { label: 'Smazat', class: 'btn-danger', action: () => {
        const ids = [...this._deckDetailState.selected];
        const cardsCopy = ids.map(id => ({ ...Store.data.cards.find(c => c.id === id) })).filter(Boolean);
        Store.deleteCards(ids);
        this._deckDetailState.selected.clear();
        App.hideModal();
        App.undoDelete('cards', cardsCopy);
        App.renderDeckDetail();
      }}
    ]);
  },

  // === Favorites ===
  renderFavorites() {
    const container = document.getElementById('view-favorites');
    const favCards = Store.data.cards.filter(c => c.favorite);
    let html = '<div class="page-header"><h1>\u2605 Oblíbené kartičky</h1></div>';
    if (favCards.length === 0) {
      html += '<div class="empty-state"><h3>Žádné oblíbené</h3><p>Kliknutím na hvězdičku u kartičky ji přidáte do oblíbených.</p></div>';
    } else {
      html += `<p class="text-muted text-sm mb-1">${favCards.length} kartiček</p><div class="card-list">`;
      for (const card of favCards) {
        const deck = Store.getDeck(card.deckId);
        html += `
          <div class="card-list-item" onclick="App.navigate('#edit/${card.id}')">
            <button class="favorite-btn active" onclick="event.stopPropagation(); App.toggleFavorite('${card.id}')">\u2605</button>
            <div class="card-front-text">${App.esc(card.front)}</div>
            ${deck ? `<span class="tag" style="background:${deck.color}20; color:${deck.color}">${App.esc(deck.name)}</span>` : ''}
          </div>`;
      }
      html += '</div>';
    }
    container.innerHTML = html;
  },

  // === Card Edit ===
  renderCardEdit(cardId, deckId) {
    const container = document.getElementById('view-card-edit');
    const isNew = cardId === 'new';
    const card = isNew ? null : Store.data.cards.find(c => c.id === cardId);
    const targetDeckId = isNew ? deckId : (card ? card.deckId : null);
    if (!isNew && !card) { this.navigate('#decks'); return; }

    const front = card ? card.front : '';
    const back = card ? card.back : '';
    const tags = card ? card.tags.join(', ') : '';
    const hint = card ? (card.hint || '') : '';

    let html = `
      <div class="page-header"><h1>${isNew ? 'Nová kartička' : 'Upravit kartičku'}</h1></div>
      <div class="card">
        <div class="form-group"><label class="form-label">Otázka (přední strana)</label>
          <textarea class="textarea" id="card-front" rows="3" placeholder="Napište otázku...">${App.esc(front)}</textarea></div>
        <div class="form-group"><label class="form-label">Odpověď (zadní strana)</label>
          <textarea class="textarea" id="card-back" rows="4" placeholder="Napište odpověď...">${App.esc(back)}</textarea></div>
        <div class="form-group"><label class="form-label">Nápověda (nepovinné)</label>
          <input class="input" id="card-hint" value="${App.esc(hint)}" placeholder="Zobrazí se před otočením karty"></div>
        <div class="form-group"><label class="form-label">Tagy (oddělené čárkou)</label>
          <input class="input" id="card-tags" value="${App.esc(tags)}" placeholder="např. biologie, buňky"></div>
        ${!isNew && card ? `
          <div class="text-sm text-muted mt-1">
            Stav: ${card.status} | EF: ${card.easeFactor} | Interval: ${card.interval} dní | Další: ${card.nextReview || 'zatím neopakována'}
            ${App.isLeech(card.id) ? ' | <span class="leech-badge">\u{1FA78} Leech</span>' : ''}
          </div>
          <div class="mt-1">
            <button class="btn btn-sm ${card.status==='suspended'?'btn-success':'btn-secondary'}" onclick="App.toggleSuspend('${card.id}'); App.renderCardEdit('${cardId}')">
              ${card.status==='suspended' ? '\u25B6 Obnovit' : '\u23F8 Pozastavit'}
            </button>
          </div>
        ` : ''}
        <div class="flex-between mt-2">
          <button class="btn btn-secondary" onclick="history.back()">Zrušit</button>
          <div class="header-actions">
            ${!isNew ? `<button class="btn btn-danger" onclick="App.deleteCardFromEdit('${cardId}')">Smazat</button>` : ''}
            <button class="btn btn-primary" onclick="App.saveCard('${isNew?'new':cardId}', '${targetDeckId}')">${isNew?'Vytvořit':'Uložit'}</button>
          </div>
        </div>
      </div>`;

    if (isNew) {
      html += `<div class="text-center mt-2"><button class="btn btn-secondary" onclick="App.saveCardAndNext('${targetDeckId}')">Uložit a přidat další</button></div>`;
    }

    if (!isNew && card) {
      const reviews = Store.data.reviewLog.filter(r => r.cardId === cardId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      if (reviews.length > 0) {
        html += `<div class="card mt-2"><h3 class="mb-1">Historie opakování (${reviews.length})</h3><div class="review-history"><table>
          <thead><tr><th>Datum</th><th>Hodnocení</th><th>Interval</th><th>EF</th></tr></thead><tbody>`;
        for (const r of reviews.slice(0, 20)) {
          const d = new Date(r.timestamp);
          html += `<tr><td>${d.toLocaleDateString('cs-CZ')}</td><td>${r.quality}/5 (${SRS.LABELS[r.quality]})</td><td>${r.previousInterval} \u2192 ${r.newInterval}d</td><td>${r.previousEF.toFixed(2)} \u2192 ${r.newEF.toFixed(2)}</td></tr>`;
        }
        html += '</tbody></table></div></div>';
      }
    }

    container.innerHTML = html;
    document.getElementById('card-front').focus();
  },

  saveCard(cardId, deckId) {
    const front = document.getElementById('card-front').value.trim();
    const back = document.getElementById('card-back').value.trim();
    const tags = document.getElementById('card-tags').value.split(',').map(t => t.trim()).filter(t => t);
    const hint = document.getElementById('card-hint').value.trim();
    if (!front || !back) { App.toast('Vyplňte otázku i odpověď', 'warning'); return; }
    if (cardId === 'new') { Store.createCard(deckId, front, back, tags, hint); this.navigate('#deck/' + deckId); }
    else { Store.updateCard(cardId, { front, back, tags, hint }); history.back(); }
    Gamification.checkAchievements();
  },

  saveCardAndNext(deckId) {
    const front = document.getElementById('card-front').value.trim();
    const back = document.getElementById('card-back').value.trim();
    const tags = document.getElementById('card-tags').value.split(',').map(t => t.trim()).filter(t => t);
    const hint = document.getElementById('card-hint').value.trim();
    if (!front || !back) { App.toast('Vyplňte otázku i odpověď', 'warning'); return; }
    Store.createCard(deckId, front, back, tags, hint);
    document.getElementById('card-front').value = '';
    document.getElementById('card-back').value = '';
    document.getElementById('card-hint').value = '';
    document.getElementById('card-front').focus();
    App.toast('Kartička vytvořena', 'success');
  },

  deleteCardFromEdit(cardId) {
    App.showModal('Smazat kartičku', '<p>Opravdu chcete smazat tuto kartičku?</p>', [
      { label: 'Zrušit', class: 'btn-secondary', action: () => App.hideModal() },
      { label: 'Smazat', class: 'btn-danger', action: () => {
        const card = Store.data.cards.find(c => c.id === cardId);
        const deckId = card ? card.deckId : null;
        const cardCopy = card ? { ...card } : null;
        Store.deleteCard(cardId);
        App.hideModal();
        if (cardCopy) App.undoDelete('cards', [cardCopy]);
        if (deckId) App.navigate('#deck/' + deckId);
        else App.navigate('#decks');
      }}
    ]);
  },

  // === Study Session ===
  renderStudy(deckId) {
    const container = document.getElementById('view-study');
    const deck = Store.getDeck(deckId);
    if (!deck) { this.navigate('#decks'); return; }
    const dueCards = SRS.getDueCards(Store.data.cards, deckId, Store.data.settings.cardsPerSession);
    if (dueCards.length === 0) {
      container.innerHTML = `<div class="session-summary"><h2>Vše hotovo!</h2><p class="text-muted">V balíčku <strong>${App.esc(deck.name)}</strong> nejsou žádné kartičky k opakování.</p><button class="btn btn-primary mt-2" onclick="App.navigate('#decks')">Zpět na balíčky</button></div>`;
      return;
    }
    let sessionCards = [];
    for (const card of dueCards) {
      sessionCards.push(card);
      if (Store.data.settings.enableReversed) {
        sessionCards.push({ ...card, _reversed: true });
      }
    }
    if (Store.data.settings.enableReversed) sessionCards.sort(() => Math.random() - 0.5);
    this.studySession = { deckId, cards: sessionCards, current: 0, flipped: false, hintShown: false, ratings: [], startTime: Date.now(), isCram: false, isSpeed: false, isMultiDeck: false, _reStudyCount: {} };
    this._renderStudyCard();
  },

  renderStudyAll() {
    const container = document.getElementById('view-study');
    const allDue = SRS.getDueCards(Store.data.cards, null, Store.data.settings.cardsPerSession);
    if (allDue.length === 0) {
      container.innerHTML = `<div class="session-summary"><h2>Vše hotovo!</h2><p class="text-muted">Žádné kartičky k opakování v žádném balíčku.</p><button class="btn btn-primary mt-2" onclick="App.navigate('#decks')">Zpět na balíčky</button></div>`;
      return;
    }
    this.studySession = { deckId: null, cards: allDue, current: 0, flipped: false, hintShown: false, ratings: [], startTime: Date.now(), isCram: false, isSpeed: false, isMultiDeck: true, _reStudyCount: {} };
    this._renderStudyCard();
  },

  renderCram(deckId) {
    const container = document.getElementById('view-study');
    const deck = Store.getDeck(deckId);
    if (!deck) { this.navigate('#decks'); return; }
    const cramCards = SRS.getCramCards(Store.data.cards, deckId);
    if (cramCards.length === 0) {
      container.innerHTML = `<div class="session-summary"><h2>Žádné kartičky</h2><p class="text-muted">Balíček <strong>${App.esc(deck.name)}</strong> je prázdný.</p><button class="btn btn-primary mt-2" onclick="App.navigate('#decks')">Zpět</button></div>`;
      return;
    }
    this.studySession = { deckId, cards: cramCards, current: 0, flipped: false, hintShown: false, ratings: [], startTime: Date.now(), isCram: true, isSpeed: false, isMultiDeck: false, _reStudyCount: {} };
    this._renderStudyCard();
  },

  renderSpeed(deckId) {
    const container = document.getElementById('view-study');
    const deck = Store.getDeck(deckId);
    if (!deck) { this.navigate('#decks'); return; }
    const dueCards = SRS.getDueCards(Store.data.cards, deckId, Store.data.settings.cardsPerSession);
    if (dueCards.length === 0) {
      container.innerHTML = `<div class="session-summary"><h2>Vše hotovo!</h2><p class="text-muted">Žádné kartičky k opakování.</p><button class="btn btn-primary mt-2" onclick="App.navigate('#decks')">Zpět</button></div>`;
      return;
    }
    this.studySession = { deckId, cards: dueCards, current: 0, flipped: false, hintShown: false, ratings: [], startTime: Date.now(), isCram: false, isSpeed: true, isMultiDeck: false, _reStudyCount: {}, _speedTimer: null, _speedTimerStarted: false, _speedTimeLeft: Store.data.settings.speedRoundTime || 30 };
    this._renderStudyCard();
  },

  _renderStudyCard() {
    const container = document.getElementById('view-study');
    const s = this.studySession;
    if (!s || s.current >= s.cards.length) { this._renderStudySummary(); return; }

    const card = s.cards[s.current];
    const isReversed = card._reversed;
    const isReStudy = card._reStudy;
    const frontText = isReversed ? card.back : card.front;
    const backText = isReversed ? card.front : card.back;
    const progress = ((s.current) / s.cards.length * 100).toFixed(0);

    let deckName;
    if (s.isMultiDeck) {
      const cardDeck = Store.getDeck(card.deckId);
      deckName = cardDeck ? App.esc(cardDeck.name) : 'Všechny balíčky';
    } else {
      const deck = Store.getDeck(s.deckId);
      deckName = deck ? App.esc(deck.name) : '';
    }

    let html = '';

    // Speed round timer
    if (s.isSpeed) {
      const total = Store.data.settings.speedRoundTime || 30;
      const pct = (s._speedTimeLeft / total) * 100;
      html += `
        <div class="speed-info">
          <span class="cram-indicator">\u26A1 Rychlé kolo</span>
          <span id="speed-time-text" class="speed-time-text">${s._speedTimeLeft}s</span>
        </div>
        <div class="speed-timer-container">
          <div class="speed-timer-bar ${s._speedTimeLeft <= 5 ? 'danger' : ''}" id="speed-timer-bar" style="width:${pct}%"></div>
        </div>`;
    }

    html += `
      <div class="study-progress">
        <span>${deckName} ${s.isCram ? '<span class="cram-indicator">Procvičování</span>' : ''} ${isReversed ? '<span class="cram-indicator">Obrácená</span>' : ''} ${isReStudy ? '<span class="restudy-indicator">Opakování</span>' : ''}</span>
        <span>Karta ${s.current + 1} / ${s.cards.length}</span>
      </div>
      <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="flashcard-container" onclick="App.flipCard()">
        <div class="flashcard ${s.flipped?'flipped':''}">
          <div class="flashcard-face flashcard-front">
            <span class="flashcard-label">${isReversed?'Odpověď':'Otázka'}</span>
            <button class="flashcard-tts" onclick="event.stopPropagation(); App.speak('${App.escAttr(frontText)}')" title="Přečíst nahlas">\u{1F50A}</button>
            <div>${Markdown.render(frontText)}</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <span class="flashcard-label">${isReversed?'Otázka':'Odpověď'}</span>
            <button class="flashcard-tts" onclick="event.stopPropagation(); App.speak('${App.escAttr(backText)}')" title="Přečíst nahlas">\u{1F50A}</button>
            <div>${Markdown.render(backText)}</div>
          </div>
        </div>
      </div>`;

    if (!s.flipped) {
      if (card.hint && !isReversed) {
        html += `<div class="hint-container">`;
        if (s.hintShown) { html += `<div class="hint-text">${App.esc(card.hint)}</div>`; }
        else { html += `<button class="btn btn-sm btn-secondary" onclick="App.showHint()">Nápověda (H)</button>`; }
        html += `</div>`;
      }
      html += `<div class="text-center"><button class="favorite-btn ${card.favorite?'active':''}" onclick="App.toggleFavoriteStudy('${card.id}')" style="font-size:1.5rem">${card.favorite?'\u2605':'\u2606'}</button></div>`;
      html += `<div class="flip-hint">Klikněte pro otočení (mezerník) · Přeskočit (→)</div>`;
    } else {
      html += `<div class="flip-hint" style="margin-bottom:0.5rem">Klikněte pro návrat na otázku (mezerník)</div>`;
      html += `<div class="text-center mb-1 text-sm text-muted">Jak dobře jste to věděl/a?</div>
        <div class="rating-buttons">
          ${[1,2,3,4,5].map(r => `<button class="rating-btn" data-rating="${r}" onclick="App.rateCard(${r})"><span class="rating-num">${r}</span><span>${SRS.LABELS[r]}</span></button>`).join('')}
        </div>`;
    }
    html += `<div class="text-center mt-2 study-bottom-actions"><button class="btn btn-secondary btn-sm" onclick="App.skipCard()">Přeskočit (→)</button> <button class="btn btn-secondary btn-sm" onclick="App.navigate('#decks')">Ukončit sezení</button></div>`;
    container.innerHTML = html;

    // Start speed timer for new card
    if (s.isSpeed && !s._speedTimerStarted) {
      s._speedTimerStarted = true;
      s._speedTimeLeft = Store.data.settings.speedRoundTime || 30;
      if (s._speedTimer) clearInterval(s._speedTimer);
      s._speedTimer = setInterval(() => {
        s._speedTimeLeft--;
        const timerBar = document.getElementById('speed-timer-bar');
        const timeText = document.getElementById('speed-time-text');
        if (timerBar) {
          const total = Store.data.settings.speedRoundTime || 30;
          timerBar.style.width = ((s._speedTimeLeft / total) * 100) + '%';
          if (s._speedTimeLeft <= 5) timerBar.classList.add('danger');
        }
        if (timeText) timeText.textContent = s._speedTimeLeft + 's';
        if (s._speedTimeLeft <= 0) {
          clearInterval(s._speedTimer);
          s._speedTimer = null;
          App.rateCard(1);
        }
      }, 1000);
    }

    // Auto-read TTS
    const settings = Store.data.settings;
    if (!s.flipped && settings.ttsAutoFront) {
      this._autoRead(isReversed ? card.back : card.front);
    } else if (s.flipped && settings.ttsAutoBack) {
      this._autoRead(isReversed ? card.front : card.back);
    }
  },

  showHint() {
    if (this.studySession) { this.studySession.hintShown = true; this._renderStudyCard(); }
  },

  flipCard() {
    if (!this.studySession) return;
    this.studySession.flipped = !this.studySession.flipped;
    this._renderStudyCard();
  },

  skipCard() {
    const s = this.studySession;
    if (!s) return;
    this.stopSpeaking();
    if (s._speedTimer) { clearInterval(s._speedTimer); s._speedTimer = null; }
    s._speedTimerStarted = false;
    s.current++;
    s.flipped = false;
    s.hintShown = false;
    this._renderStudyCard();
  },

  toggleFavoriteStudy(cardId) {
    const card = Store.data.cards.find(c => c.id === cardId);
    if (card) { card.favorite = !card.favorite; Store.save(); this._renderStudyCard(); }
  },

  rateCard(quality) {
    const s = this.studySession;
    if (!s) return;
    this.stopSpeaking();

    // Clear speed timer
    if (s._speedTimer) { clearInterval(s._speedTimer); s._speedTimer = null; }
    s._speedTimerStarted = false;

    const card = s.cards[s.current];
    const isReStudy = card._reStudy;

    if (!s.isCram && !isReStudy) Store.recordReview(card.id, quality);
    s.ratings.push(quality);

    // Re-study failed cards (max 2 repeats per card)
    if (quality <= 2 && !s.isCram && !isReStudy) {
      const count = s._reStudyCount[card.id] || 0;
      if (count < 2) {
        s._reStudyCount[card.id] = count + 1;
        const insertPos = Math.min(s.current + 1 + Math.floor(Math.random() * 4), s.cards.length);
        s.cards.splice(insertPos, 0, { ...card, _reStudy: true });
      }
    }

    s.current++;
    s.flipped = false;
    s.hintShown = false;
    this._renderStudyCard();
  },

  _renderStudySummary() {
    const container = document.getElementById('view-study');
    const s = this.studySession;
    if (s._speedTimer) { clearInterval(s._speedTimer); s._speedTimer = null; }

    let deckName;
    if (s.isMultiDeck) {
      deckName = 'Všechny balíčky';
    } else {
      const deck = Store.getDeck(s.deckId);
      deckName = deck ? App.esc(deck.name) : '';
    }

    const elapsed = Math.round((Date.now() - s.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const avgRating = s.ratings.length > 0 ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1) : '0';
    const correctCount = s.ratings.filter(r => r >= 3).length;

    const modeLabel = s.isCram ? 'Procvičování dokončeno!' : s.isSpeed ? 'Rychlé kolo dokončeno!' : 'Sezení dokončeno!';
    const modeNote = s.isCram ? ' (procvičování)' : s.isSpeed ? ' (rychlé kolo)' : '';
    const againHash = s.isMultiDeck ? '#study-all' : s.isSpeed ? `#speed/${s.deckId}` : s.isCram ? `#cram/${s.deckId}` : `#study/${s.deckId}`;

    container.innerHTML = `
      <div class="session-summary">
        <h2>${modeLabel}</h2>
        <p class="text-muted">${deckName}${modeNote}</p>
        <div class="session-stats mt-2">
          <div class="session-stat"><div class="stat-value">${s.ratings.length}</div><div class="stat-label">Kartiček</div></div>
          <div class="session-stat"><div class="stat-value">${correctCount}/${s.ratings.length}</div><div class="stat-label">Správně</div></div>
          <div class="session-stat"><div class="stat-value">${avgRating}</div><div class="stat-label">Průměr</div></div>
          <div class="session-stat"><div class="stat-value">${minutes}:${String(seconds).padStart(2,'0')}</div><div class="stat-label">Čas</div></div>
        </div>
        <div class="header-actions" style="justify-content:center">
          <button class="btn btn-primary" onclick="App.navigate('${againHash}')">Studovat znovu</button>
          <button class="btn btn-secondary" onclick="App.navigate('#decks')">Zpět na balíčky</button>
        </div>
      </div>`;
  },

  // === TTS ===
  speak(text) {
    if (!('speechSynthesis' in window)) { this.toast('TTS není podporováno', 'warning'); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'cs-CZ';
    utter.rate = Store.data.settings.ttsRate || 1.0;
    const voiceName = Store.data.settings.ttsVoice;
    if (voiceName) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.name === voiceName);
      if (match) utter.voice = match;
    }
    window.speechSynthesis.speak(utter);
  },

  stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  },

  _autoRead(text) {
    setTimeout(() => this.speak(text), 200);
  },

  // === Match Game ===
  renderMatch(deckId) {
    const container = document.getElementById('view-match');
    const deck = Store.getDeck(deckId);
    if (!deck) { this.navigate('#decks'); return; }
    const allCards = Store.getCardsByDeck(deckId).filter(c => c.status !== 'suspended');
    if (allCards.length < 4) {
      container.innerHTML = `<div class="session-summary"><h2>Nedostatek kartiček</h2><p class="text-muted">Pro párování potřebujete alespoň 4 kartičky.</p><button class="btn btn-primary mt-2" onclick="App.navigate('#decks')">Zpět</button></div>`;
      return;
    }
    const count = Math.min(6, allCards.length);
    const shuffled = [...allCards].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    this._matchSession = {
      deckId,
      pairs: selected.map(c => ({ id: c.id, front: c.front, back: c.back })),
      fronts: [...selected].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, front: c.front })),
      backs: [...selected].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, back: c.back })),
      selectedFront: null,
      selectedBack: null,
      matched: new Set(),
      errors: 0,
      startTime: Date.now(),
      _showError: null
    };
    this._renderMatchBoard();
  },

  _renderMatchBoard() {
    const container = document.getElementById('view-match');
    const m = this._matchSession;
    if (!m) { this.navigate('#decks'); return; }
    const deck = Store.getDeck(m.deckId);

    if (m.matched.size === m.pairs.length) {
      this._renderMatchResults();
      return;
    }

    let html = `
      <div class="page-header">
        <h1>Párování – ${App.esc(deck.name)}</h1>
        <span class="text-muted">${m.matched.size} / ${m.pairs.length} párů | Chyby: ${m.errors}</span>
      </div>
      <div class="match-board">
        <div class="match-column">
          <h3 class="text-center mb-1">Otázky</h3>`;

    for (const f of m.fronts) {
      const isMatched = m.matched.has(f.id);
      const isSelected = m.selectedFront === f.id;
      const isError = m._showError && m._showError.front === f.id;
      html += `<div class="match-card ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''} ${isError ? 'incorrect' : ''}"
        onclick="${isMatched || m._showError ? '' : `App.selectMatchFront('${f.id}')`}">${App.esc(f.front)}</div>`;
    }

    html += `</div><div class="match-column"><h3 class="text-center mb-1">Odpovědi</h3>`;

    for (const b of m.backs) {
      const isMatched = m.matched.has(b.id);
      const isSelected = m.selectedBack === b.id;
      const isError = m._showError && m._showError.back === b.id;
      html += `<div class="match-card ${isMatched ? 'matched' : ''} ${isSelected ? 'selected' : ''} ${isError ? 'incorrect' : ''}"
        onclick="${isMatched || m._showError ? '' : `App.selectMatchBack('${b.id}')`}">${App.esc(b.back)}</div>`;
    }

    html += `</div></div>
      <div class="text-center mt-2"><button class="btn btn-secondary btn-sm" onclick="App.navigate('#decks')">Ukončit</button></div>`;
    container.innerHTML = html;
  },

  selectMatchFront(id) {
    const m = this._matchSession;
    if (!m || m._showError) return;
    m.selectedFront = id;
    if (m.selectedBack) { this._checkMatch(); }
    else { this._renderMatchBoard(); }
  },

  selectMatchBack(id) {
    const m = this._matchSession;
    if (!m || m._showError) return;
    m.selectedBack = id;
    if (m.selectedFront) { this._checkMatch(); }
    else { this._renderMatchBoard(); }
  },

  _checkMatch() {
    const m = this._matchSession;
    if (m.selectedFront === m.selectedBack) {
      m.matched.add(m.selectedFront);
      m.selectedFront = null;
      m.selectedBack = null;
      this._renderMatchBoard();
    } else {
      m.errors++;
      m._showError = { front: m.selectedFront, back: m.selectedBack };
      this._renderMatchBoard();
      setTimeout(() => {
        m._showError = null;
        m.selectedFront = null;
        m.selectedBack = null;
        this._renderMatchBoard();
      }, 600);
    }
  },

  _renderMatchResults() {
    const container = document.getElementById('view-match');
    const m = this._matchSession;
    const deck = Store.getDeck(m.deckId);
    const elapsed = Math.round((Date.now() - m.startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    // Perfect match achievement
    if (m.errors === 0 && m.pairs.length >= 4) {
      const g = Store.data.gamification;
      if (!g.achievements.find(a => a.id === 'match_perfect')) {
        g.achievements.push({ id: 'match_perfect', unlockedAt: new Date().toISOString() });
        App.toast('\u{1F3AF} Odznak: Párový mistr!', 'success');
        Store.save();
      }
    }

    // Speed demon achievement
    if (this.studySession && this.studySession.isSpeed) {
      const g = Store.data.gamification;
      if (!g.achievements.find(a => a.id === 'speed_demon')) {
        g.achievements.push({ id: 'speed_demon', unlockedAt: new Date().toISOString() });
        App.toast('\u26A1 Odznak: Blesk!', 'success');
        Store.save();
      }
    }

    container.innerHTML = `
      <div class="session-summary">
        <h2>Párování dokončeno!</h2>
        <p class="text-muted">${App.esc(deck.name)}</p>
        <div class="session-stats mt-2">
          <div class="session-stat"><div class="stat-value">${m.pairs.length}</div><div class="stat-label">Párů</div></div>
          <div class="session-stat"><div class="stat-value">${m.errors}</div><div class="stat-label">Chyb</div></div>
          <div class="session-stat"><div class="stat-value">${minutes}:${String(seconds).padStart(2,'0')}</div><div class="stat-label">Čas</div></div>
        </div>
        <div class="header-actions" style="justify-content:center">
          <button class="btn btn-primary" onclick="App.navigate('#match/${m.deckId}')">Hrát znovu</button>
          <button class="btn btn-secondary" onclick="App.navigate('#decks')">Zpět na balíčky</button>
        </div>
      </div>`;
  },

  // === Quiz ===
  startQuiz(deckId) { this._quizDeckId = deckId; this.navigate('#quiz'); },

  renderQuizSetup() {
    const container = document.getElementById('view-quiz');
    const decks = Store.data.decks.filter(d => Store.getCardsByDeck(d.id).length >= 2);
    if (decks.length === 0) {
      container.innerHTML = `<div class="page-header"><h1>Kvíz</h1></div><div class="empty-state"><h3>Nedostatek kartiček</h3><p>Pro kvíz potřebujete alespoň 2 kartičky v balíčku.</p><button class="btn btn-primary" onclick="App.navigate('#decks')">Zpět</button></div>`;
      return;
    }
    container.innerHTML = `
      <div class="page-header"><h1>Kvíz</h1></div>
      <div class="card">
        <div class="form-group"><label class="form-label">Balíček</label>
          <select class="select" id="quiz-deck">${decks.map(d => `<option value="${d.id}" ${d.id===this._quizDeckId?'selected':''}>${App.esc(d.name)} (${Store.getCardsByDeck(d.id).length})</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Počet otázek</label>
          <input class="input" type="number" id="quiz-count" value="10" min="1" max="100"></div>
        <div class="form-group"><label class="form-label">Typy otázek</label>
          <div>
            <label style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;cursor:pointer"><input type="checkbox" id="quiz-type-mc" checked> Výběr z možností</label>
            <label style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.3rem;cursor:pointer"><input type="checkbox" id="quiz-type-tf" checked> Pravda / Nepravda</label>
            <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer"><input type="checkbox" id="quiz-type-type" checked> Napište odpověď</label>
          </div></div>
        <button class="btn btn-primary btn-block btn-lg" onclick="App.launchQuiz()">Spustit kvíz</button>
      </div>`;
  },

  launchQuiz() {
    const deckId = document.getElementById('quiz-deck').value;
    const count = parseInt(document.getElementById('quiz-count').value) || 10;
    const types = [];
    if (document.getElementById('quiz-type-mc').checked) types.push('mc');
    if (document.getElementById('quiz-type-tf').checked) types.push('tf');
    if (document.getElementById('quiz-type-type').checked) types.push('type');
    if (types.length === 0) { App.toast('Vyberte alespoň jeden typ otázky', 'warning'); return; }
    const cards = Store.getCardsByDeck(deckId);
    this.quizSession = { deckId, questions: SRS.generateQuiz(cards, { count, types }), current: 0, answers: [], answered: false };
    this.navigate('#quiz-active');
  },

  renderQuizActive() {
    const container = document.getElementById('view-quiz-active');
    const s = this.quizSession;
    if (!s || s.current >= s.questions.length) { this.navigate('#quiz-results'); return; }
    const q = s.questions[s.current];
    const progress = ((s.current) / s.questions.length * 100).toFixed(0);

    let html = `
      <div class="study-progress"><span>Kvíz</span><span>Otázka ${s.current+1} / ${s.questions.length}</span></div>
      <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="card">
        <div class="quiz-question-text quiz-md">${Markdown.render(q.question)}</div>`;

    if (q.type === 'mc') {
      for (const opt of q.options) {
        let cls = 'quiz-option';
        if (s.answered) {
          if (opt === q.correctAnswer) cls += ' correct';
          else if (s.answers[s.current]?.userAnswer === opt) cls += ' incorrect';
          cls += '" disabled="disabled';
        }
        html += `<button class="${cls}" onclick="App.answerQuiz('mc', '${App.escAttr(opt)}')">${App.esc(opt)}</button>`;
      }
    } else if (q.type === 'tf') {
      html += `<div class="quiz-statement">${App.esc(q.statement)}</div><div class="quiz-tf-buttons">`;
      if (s.answered) {
        const ua = s.answers[s.current]?.userAnswer;
        html += `<button class="btn ${ua===true?(q.isTrue?'btn-success':'btn-danger'):'btn-secondary'}" disabled>Pravda</button>`;
        html += `<button class="btn ${ua===false?(!q.isTrue?'btn-success':'btn-danger'):'btn-secondary'}" disabled>Nepravda</button>`;
      } else {
        html += `<button class="btn btn-success" onclick="App.answerQuiz('tf', true)">Pravda</button>`;
        html += `<button class="btn btn-danger" onclick="App.answerQuiz('tf', false)">Nepravda</button>`;
      }
      html += '</div>';
    } else {
      if (s.answered) {
        html += `<input class="input" value="${App.esc(s.answers[s.current]?.userAnswer||'')}" disabled>`;
      } else {
        html += `<input class="input" id="quiz-type-input" placeholder="Napište odpověď..." onkeydown="if(event.key==='Enter') App.answerQuiz('type', this.value)">`;
        html += `<button class="btn btn-primary btn-block mt-1" onclick="App.answerQuiz('type', document.getElementById('quiz-type-input').value)">Potvrdit</button>`;
      }
    }

    if (s.answered) {
      const ans = s.answers[s.current];
      html += ans.correct ? `<div class="quiz-feedback correct">Správně!</div>` : `<div class="quiz-feedback incorrect">Špatně. Správná odpověď: ${App.esc(q.correctAnswer)}</div>`;
      html += `<button class="btn btn-primary btn-block mt-1" onclick="App.nextQuizQuestion()">Další otázka</button>`;
    }
    html += '</div>';
    container.innerHTML = html;
    if (!s.answered && q.type === 'type') { const i = document.getElementById('quiz-type-input'); if (i) i.focus(); }
  },

  answerQuiz(type, answer) {
    const s = this.quizSession;
    if (!s || s.answered) return;
    const q = s.questions[s.current];
    let correct = type === 'mc' ? answer === q.correctAnswer : type === 'tf' ? answer === q.isTrue : SRS.checkTypeAnswer(answer, q.correctAnswer).correct;
    s.answers[s.current] = { userAnswer: answer, correct };
    s.answered = true;
    this.renderQuizActive();
  },

  nextQuizQuestion() {
    const s = this.quizSession;
    if (!s) return;
    s.current++; s.answered = false;
    if (s.current >= s.questions.length) this.navigate('#quiz-results');
    else this.renderQuizActive();
  },

  renderQuizResults() {
    const container = document.getElementById('view-quiz-results');
    const s = this.quizSession;
    if (!s) { this.navigate('#quiz'); return; }
    const total = s.answers.length;
    const correct = s.answers.filter(a => a?.correct).length;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    const deck = Store.getDeck(s.deckId);

    if (pct === 100 && total >= 5) {
      const g = Store.data.gamification;
      if (!g.achievements.find(a => a.id === 'perfect_quiz')) {
        g.achievements.push({ id: 'perfect_quiz', unlockedAt: new Date().toISOString() });
        App.toast('\u{1F4AF} Odznak: Perfekcionista!', 'success');
        Store.save();
      }
    }

    let html = `
      <div class="session-summary">
        <h2>Výsledky kvízu</h2>
        <p class="text-muted">${deck ? App.esc(deck.name) : ''}</p>
        <div class="session-stats mt-2">
          <div class="session-stat"><div class="stat-value" style="color: ${pct>=70?'var(--success)':pct>=40?'var(--warning)':'var(--danger)'}">${pct}%</div><div class="stat-label">Úspěšnost</div></div>
          <div class="session-stat"><div class="stat-value">${correct} / ${total}</div><div class="stat-label">Správně</div></div>
        </div>
      </div>
      <div class="card mt-2"><h3 class="mb-1">Přehled otázek</h3>`;
    for (let i = 0; i < s.questions.length; i++) {
      const q = s.questions[i]; const a = s.answers[i]; const isCorrect = a?.correct;
      html += `<div style="padding:0.6rem 0;border-bottom:1px solid var(--border)"><div class="flex-between"><strong>${i+1}. ${App.esc(q.question)}</strong><span class="status-badge ${isCorrect?'status-review':'status-learning'}">${isCorrect?'Správně':'Špatně'}</span></div>${!isCorrect?`<div class="text-sm text-muted mt-1">Správná odpověď: ${App.esc(q.correctAnswer)}</div>`:''}</div>`;
    }
    html += `</div><div class="header-actions mt-2" style="justify-content:center"><button class="btn btn-primary" onclick="App.navigate('#quiz')">Nový kvíz</button><button class="btn btn-secondary" onclick="App.navigate('#decks')">Zpět na balíčky</button></div>`;
    container.innerHTML = html;
  },

  // === Statistics ===
  renderStats() {
    const container = document.getElementById('view-stats');
    const stats = Store.data.stats;
    const totalCards = Store.data.cards.length;
    const learnedCards = Store.data.cards.filter(c => c.status === 'review').length;
    const accuracy = stats.totalReviews > 0 ? Math.round(stats.totalCorrect / stats.totalReviews * 100) : 0;
    const g = Store.data.gamification;

    let html = `
      <div class="page-header"><h1>Statistiky</h1></div>
      <div class="stats-grid">
        <div class="card stat-card"><div class="stat-value">${totalCards}</div><div class="stat-label">Celkem kartiček</div></div>
        <div class="card stat-card"><div class="stat-value">${learnedCards}</div><div class="stat-label">Naučeno</div></div>
        <div class="card stat-card"><div class="stat-value">${accuracy}%</div><div class="stat-label">Přesnost</div></div>
        <div class="card stat-card"><div class="stat-value">${stats.currentStreak}</div><div class="stat-label">Aktuální streak</div></div>
        <div class="card stat-card"><div class="stat-value">Lv.${g.level}</div><div class="stat-label">${g.xp} XP</div></div>
      </div>
      <div class="chart-container card"><h3>Aktivita (posledních 90 dní)</h3><div id="heatmap-container" class="mt-1"></div></div>
      <div class="chart-container card"><h3>Opakování za posledních 30 dní</h3><canvas id="line-chart" class="mt-1"></canvas></div>`;

    if (Store.data.decks.length > 0) {
      html += `<div class="chart-container card"><h3>Kartičky dle balíčku</h3><canvas id="bar-chart" class="mt-1"></canvas></div>`;
    }

    html += this._renderWeeklyReport();

    // Leech cards
    const leechCards = this.getLeechCards();
    if (leechCards.length > 0) {
      html += `<div class="card mt-2"><h3 class="mb-1">\u{1FA78} Leech kartičky (${leechCards.length})</h3><p class="text-sm text-muted mb-1">Kartičky s 8+ neúspěšnými opakováními. Zvažte přeformulování nebo rozdělení.</p><div class="card-list">`;
      for (const card of leechCards.slice(0, 10)) {
        const deck = Store.getDeck(card.deckId);
        html += `<div class="card-list-item" onclick="App.navigate('#edit/${card.id}')"><span class="leech-badge">\u{1FA78}</span><div class="card-front-text">${App.esc(card.front)}</div>${deck ? `<span class="tag" style="background:${deck.color}20;color:${deck.color}">${App.esc(deck.name)}</span>` : ''}</div>`;
      }
      html += '</div></div>';
    }

    // Achievements
    html += `<div class="card mt-2"><h3>Odznaky</h3><div class="achievements-grid">`;
    const unlockedIds = new Set(g.achievements.map(a => a.id));
    const allAch = [...ACHIEVEMENTS,
      { id: 'perfect_quiz', name: 'Perfekcionista', desc: 'Kvíz na 100%', icon: '\u{1F4AF}' },
      { id: 'match_perfect', name: 'Párový mistr', desc: 'Dokonalé párování', icon: '\u{1F3AF}' },
      { id: 'speed_demon', name: 'Blesk', desc: 'Dokončete rychlé kolo', icon: '\u26A1' }
    ];
    for (const ach of allAch) {
      const unlocked = unlockedIds.has(ach.id);
      const achData = unlocked ? g.achievements.find(a => a.id === ach.id) : null;
      html += `<div class="achievement-card ${unlocked?'':'locked'}"><span class="ach-icon">${ach.icon}</span><div class="ach-info"><div class="ach-name">${ach.name}</div><div class="ach-desc">${ach.desc}</div>${unlocked && achData ? `<div class="ach-date">${new Date(achData.unlockedAt).toLocaleDateString('cs-CZ')}</div>` : ''}</div></div>`;
    }
    html += '</div></div>';

    html += `<div class="card mt-2"><h3 class="mb-1">Plán na 7 dní</h3><div id="upcoming-list"></div></div>`;

    container.innerHTML = html;

    requestAnimationFrame(() => {
      Charts.drawHeatmap(document.getElementById('heatmap-container'), stats.dailyStats);
      Charts.drawLineChart(document.getElementById('line-chart'), stats.dailyStats);
      if (Store.data.decks.length > 0) {
        const deckData = Store.data.decks.map(d => {
          const cards = Store.getCardsByDeck(d.id);
          return { name: d.name, total: cards.length, newCount: cards.filter(c => c.status==='new').length, learningCount: cards.filter(c => c.status==='learning').length, reviewCount: cards.filter(c => c.status==='review').length };
        });
        Charts.drawBarChart(document.getElementById('bar-chart'), deckData);
      }
      const upcomingEl = document.getElementById('upcoming-list');
      let upHtml = '';
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const ds = SRS.toLocalDateStr(d);
        const dueCount = Store.data.cards.filter(c => c.status === 'review' && c.nextReview === ds).length + (i === 0 ? Store.data.cards.filter(c => c.status === 'new' || c.status === 'learning').length : 0);
        const dayName = i === 0 ? 'Dnes' : i === 1 ? 'Zítra' : d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
        upHtml += `<div class="flex-between" style="padding:0.4rem 0;border-bottom:1px solid var(--border)"><span>${dayName}</span><span class="deck-due-badge">${dueCount}</span></div>`;
      }
      upcomingEl.innerHTML = upHtml;
    });
  },

  _renderWeeklyReport() {
    const ds = Store.data.stats.dailyStats;
    const today = new Date();
    function sumPeriod(startDaysAgo, endDaysAgo) {
      let reviews = 0, correct = 0;
      for (let i = startDaysAgo; i >= endDaysAgo; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const s = ds[SRS.toLocalDateStr(d)];
        if (s) { reviews += s.reviews; correct += s.correct; }
      }
      return { reviews, correct, accuracy: reviews > 0 ? Math.round(correct / reviews * 100) : 0 };
    }
    const thisWeek = sumPeriod(6, 0);
    const lastWeek = sumPeriod(13, 7);
    function trend(current, previous) {
      if (previous === 0 && current === 0) return { cls: 'same', text: '-' };
      if (previous === 0) return { cls: 'up', text: '+100%' };
      const pct = Math.round((current - previous) / previous * 100);
      return { cls: pct > 0 ? 'up' : pct < 0 ? 'down' : 'same', text: (pct > 0 ? '+' : '') + pct + '%' };
    }
    const revTrend = trend(thisWeek.reviews, lastWeek.reviews);
    const accTrend = trend(thisWeek.accuracy, lastWeek.accuracy);
    return `<div class="card mt-2"><h3 class="mb-1">Týdenní report</h3>
      <div class="report-grid">
        <div class="report-metric"><div class="metric-value">${thisWeek.reviews}</div><div class="metric-label">Opakování tento týden</div><div class="metric-trend ${revTrend.cls}">${revTrend.text} vs minulý týden</div></div>
        <div class="report-metric"><div class="metric-value">${thisWeek.accuracy}%</div><div class="metric-label">Přesnost</div><div class="metric-trend ${accTrend.cls}">${accTrend.text} vs minulý týden</div></div>
        <div class="report-metric"><div class="metric-value">${lastWeek.reviews}</div><div class="metric-label">Opakování minulý týden</div></div>
      </div></div>`;
  },

  // === Import ===
  _importState: { tab: 'file', parsed: null, errors: [], aiLoading: false, _fileFormat: 'auto', _fileContent: null, _fileInfo: null },

  renderImport() {
    const container = document.getElementById('view-import');
    const state = this._importState;
    const decks = Store.data.decks;
    const hasApiKey = !!(Store.data.settings.groqApiKey);

    let html = `
      <div class="page-header"><h1>Import kartiček</h1></div>
      <div class="import-tabs">
        <button class="import-tab ${state.tab==='file'?'active':''}" onclick="App._importState.tab='file'; App._importState.parsed=null; App.renderImport()">Nahrát soubor</button>
        <button class="import-tab ${state.tab==='ai'?'active':''}" onclick="App._importState.tab='ai'; App._importState.parsed=null; App.renderImport()">AI generování</button>
        <button class="import-tab ${state.tab==='csv'?'active':''}" onclick="App._importState.tab='csv'; App._importState.parsed=null; App.renderImport()">CSV</button>
        <button class="import-tab ${state.tab==='text'?'active':''}" onclick="App._importState.tab='text'; App._importState.parsed=null; App.renderImport()">Text (Q/A)</button>
        <button class="import-tab ${state.tab==='md'?'active':''}" onclick="App._importState.tab='md'; App._importState.parsed=null; App.renderImport()">Markdown</button>
        <button class="import-tab ${state.tab==='json'?'active':''}" onclick="App._importState.tab='json'; App._importState.parsed=null; App.renderImport()">JSON záloha</button>
      </div><div class="card">`;

    if (state.tab === 'file') {
      html += `<div class="file-drop-zone" id="file-drop-zone" onclick="document.getElementById('file-upload-input').click()">
          <div class="file-drop-icon">\u{1F4C1}</div>
          <p><strong>Přetáhněte soubory sem</strong></p>
          <p class="text-sm text-muted">nebo klikněte pro výběr</p>
          <p class="text-sm text-muted mt-1">Podporované formáty: .txt, .csv, .tsv, .md, .json</p>
          <input type="file" id="file-upload-input" multiple style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none" onclick="event.stopPropagation()" onchange="App.handleFileUpload(this.files)">
        </div>
        <div class="form-group mt-1"><label class="form-label">Formát souboru</label>
          <select class="select" id="file-format" onchange="App._importState._fileFormat=this.value; if(App._importState._fileContent) App._reparseFile()">
            <option value="auto">Automatická detekce</option>
            <option value="csv-semi">CSV (středník ;)</option>
            <option value="csv-comma">CSV (čárka ,)</option>
            <option value="csv-tab">TSV (tabulátor)</option>
            <option value="csv-pipe">Odděleno |</option>
            <option value="text">Text (Q:/A:)</option>
            <option value="md">Markdown (## otázka)</option>
            <option value="one-per-line">Jedna kartička na 2 řádky</option>
          </select></div>
        <div class="form-group"><label class="form-label">Cílový balíček</label><select class="select" id="import-deck">${decks.map(d => `<option value="${d.id}">${App.esc(d.name)}</option>`).join('')}<option value="__new__">+ Vytvořit nový balíček</option><option value="__from_file__">Z názvu souboru</option></select></div>
        <div class="form-group" id="import-new-deck-group" style="display:none"><label class="form-label">Název nového balíčku</label><input class="input" id="import-new-deck-name" placeholder="Název balíčku..."></div>
        ${state._fileInfo ? `<div class="file-info mt-1"><span class="badge">${App.esc(state._fileInfo.name)}</span> <span class="text-sm text-muted">${(state._fileInfo.size/1024).toFixed(1)} KB · ${state._fileInfo.lines} řádků · formát: ${App.esc(state._fileInfo.detectedFormat)}</span></div>` : ''}`;
    } else if (state.tab === 'ai') {
      if (!hasApiKey) {
        html += `<div class="empty-state"><div class="empty-state-icon">\u{1F916}</div><h3>API klíč není nastaven</h3><p>Pro AI generování kartiček potřebujete Groq API klíč v nastavení.</p><button class="btn btn-primary" onclick="App.navigate('#settings')">Přejít do nastavení</button></div>`;
      } else {
        html += `<p class="text-sm text-muted mb-1">Vložte studijní text a AI automaticky vygeneruje kartičky.</p>
          <div class="form-group"><label class="form-label">Nahrajte soubor nebo vložte text</label><input type="file" id="import-file" onchange="App.handleImportFile(this)"></div>
          <div class="form-group"><textarea class="textarea" id="ai-text" rows="12" placeholder="Vložte sem studijní text...">${App.esc(state._aiText||'')}</textarea></div>
          <div class="form-group"><label class="form-label">Cílový balíček</label><select class="select" id="import-deck">${decks.map(d => `<option value="${d.id}">${App.esc(d.name)}</option>`).join('')}<option value="__new__">+ Vytvořit nový balíček</option></select></div>
          <div class="form-group" id="import-new-deck-group" style="display:none"><label class="form-label">Název nového balíčku</label><input class="input" id="import-new-deck-name" placeholder="Název balíčku..."></div>
          <button class="btn btn-primary btn-block btn-lg" onclick="App.generateAI()" ${state.aiLoading?'disabled':''}>${state.aiLoading?'Generuji kartičky...':'Vygenerovat kartičky pomocí AI'}</button>
          ${state.aiLoading ? '<p class="text-center text-sm text-muted mt-1">AI analyzuje text... (10-30s)</p>' : ''}`;
      }
    } else if (state.tab === 'json') {
      html += `<p class="text-sm text-muted mb-1">Nahrajte JSON soubor exportovaný z této aplikace.</p>
        <input type="file" id="import-file" onchange="App.handleImportFile(this)">
        <div class="form-group mt-1"><label class="form-label">Režim importu</label><select class="select" id="import-json-mode"><option value="merge">Sloučit</option><option value="replace">Nahradit</option></select></div>
        <button class="btn btn-primary btn-block mt-1" id="import-json-btn" onclick="App.importJSONBackup()" disabled>Importovat</button>`;
    } else {
      const placeholder = state.tab === 'csv' ? 'otázka;odpověď' : state.tab === 'text' ? 'Q: Otázka?\nA: Odpověď' : '## Otázka\nOdpověď';
      html += `<div class="form-group"><label class="form-label">Nahrajte soubor nebo vložte text</label><input type="file" id="import-file" onchange="App.handleImportFile(this)"></div>
        <div class="form-group"><textarea class="textarea" id="import-text" rows="8" placeholder="${placeholder}"></textarea></div>
        ${state.tab === 'csv' ? `<div class="form-group"><label class="form-label">Oddělovač</label><select class="select" id="import-sep" style="width:auto"><option value=";">Středník (;)</option><option value=",">Čárka (,)</option><option value="\t">Tabulátor</option></select></div>` : ''}
        <div class="form-group"><label class="form-label">Cílový balíček</label><select class="select" id="import-deck">${decks.map(d => `<option value="${d.id}">${App.esc(d.name)}</option>`).join('')}<option value="__new__">+ Vytvořit nový balíček</option></select></div>
        <div class="form-group" id="import-new-deck-group" style="display:none"><label class="form-label">Název nového balíčku</label><input class="input" id="import-new-deck-name" placeholder="Název balíčku..."></div>
        <button class="btn btn-secondary btn-block" onclick="App.previewImport()">Náhled</button>`;
    }

    if (state.parsed && state.parsed.length > 0) {
      html += `<div class="import-preview mt-1"><table><thead><tr><th>#</th><th>Otázka</th><th>Odpověď</th></tr></thead><tbody>
        ${state.parsed.map((c, i) => `<tr><td>${i+1}</td><td>${App.esc(c.front)}</td><td>${App.esc(c.back)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="text-sm mt-1">${state.parsed.length} kartiček k importu</p>
        ${state.errors.length > 0 ? `<p class="text-sm" style="color:var(--warning)">${state.errors.join('<br>')}</p>` : ''}
        <button class="btn btn-primary btn-block mt-1" onclick="App.confirmImport()">Importovat ${state.parsed.length} kartiček</button>`;
    }

    html += '</div>';
    container.innerHTML = html;
    const deckSelect = document.getElementById('import-deck');
    if (deckSelect) deckSelect.addEventListener('change', () => {
      const ng = document.getElementById('import-new-deck-group');
      if (ng) ng.style.display = (deckSelect.value === '__new__' || deckSelect.value === '__from_file__') ? 'block' : 'none';
      if (deckSelect.value === '__from_file__') {
        const nameInput = document.getElementById('import-new-deck-name');
        if (nameInput) nameInput.placeholder = 'Název se převezme ze souboru';
      }
    });
    if (state.tab === 'file') this._setupFileDrop();
  },

  handleImportFile(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const clean = e.target.result.replace(/^\uFEFF/, '');
      if (this._importState.tab === 'json') { this._importJsonData = clean; const btn = document.getElementById('import-json-btn'); if (btn) btn.disabled = false; }
      else if (this._importState.tab === 'ai') { const ta = document.getElementById('ai-text'); if (ta) ta.value = clean; }
      else { const ta = document.getElementById('import-text'); if (ta) ta.value = clean; }
    };
    reader.readAsText(file, 'UTF-8');
  },

  handleFileUpload(files) {
    if (!files || files.length === 0) return;
    const state = this._importState;
    // Process multiple files
    state._pendingFiles = Array.from(files);
    state._allParsed = [];
    state._allErrors = [];
    state.parsed = null;
    state.errors = [];

    this.toast(`Načítám ${files.length} soubor${files.length > 1 ? 'y' : ''}...`, 'info');

    let processed = 0;
    for (const file of state._pendingFiles) {
      const reader = new FileReader();
      reader.onerror = () => {
        state._allErrors.push(`${file.name}: nepodařilo se přečíst soubor`);
        processed++;
        if (processed === state._pendingFiles.length) this._finalizeFileUpload(files);
      };
      reader.onload = (e) => {
        try {
        const content = (e.target.result || '').replace(/^\uFEFF/, '');
        const ext = file.name.split('.').pop().toLowerCase();

        // JSON backup – handle separately
        if (ext === 'json') {
          try {
            const data = JSON.parse(content);
            if (data.decks && data.cards) {
              // Full backup format
              this._importJsonData = content;
              state._fileInfo = { name: file.name, size: file.size, lines: content.split('\n').length, detectedFormat: 'JSON záloha' };
              state.tab = 'json';
              this.renderImport();
              return;
            }
            // Array of {front, back} objects
            if (Array.isArray(data)) {
              const cards = data.filter(c => c.front && c.back).map(c => ({ front: String(c.front).trim(), back: String(c.back).trim() }));
              state._allParsed.push(...cards);
            }
          } catch (err) {
            state._allErrors.push(`${file.name}: neplatný JSON`);
          }
          processed++;
          if (processed === state._pendingFiles.length) this._finalizeFileUpload(files);
          return;
        }

        const format = state._fileFormat || 'auto';
        const detected = format === 'auto' ? this._detectFileFormat(content, ext) : format;
        const result = this._parseByFormat(content, detected);

        state._fileInfo = { name: files.length > 1 ? `${files.length} souborů` : file.name, size: file.size, lines: content.split('\n').length, detectedFormat: this._formatLabel(detected) };
        state._fileContent = content;
        state._allParsed.push(...result.cards);
        state._allErrors.push(...result.errors.map(err => `${file.name}: ${err}`));

        processed++;
        if (processed === state._pendingFiles.length) this._finalizeFileUpload(files);
        } catch (err) {
          state._allErrors.push(`${file.name}: chyba zpracování (${err.message})`);
          processed++;
          if (processed === state._pendingFiles.length) this._finalizeFileUpload(files);
        }
      };
      reader.readAsText(file, 'UTF-8');
    }
  },

  _finalizeFileUpload(files) {
    const state = this._importState;
    state.parsed = state._allParsed;
    state.errors = state._allErrors;

    // Auto-set deck name from file
    const deckSelect = document.getElementById('import-deck');
    if (deckSelect && deckSelect.value === '__from_file__' && files.length === 1) {
      const baseName = files[0].name.replace(/\.[^.]+$/, '');
      deckSelect.value = '__new__';
      const nameInput = document.getElementById('import-new-deck-name');
      if (nameInput) nameInput.value = baseName;
      const ng = document.getElementById('import-new-deck-group');
      if (ng) ng.style.display = 'block';
    }

    this.renderImport();
    if (state.parsed.length > 0) {
      this.toast(`Nalezeno ${state.parsed.length} kartiček`, 'success');
    } else {
      this.toast('Žádné kartičky nenalezeny. Zkuste změnit formát.', 'warning');
    }
  },

  _reparseFile() {
    const state = this._importState;
    if (!state._fileContent) return;
    const format = state._fileFormat || 'auto';
    const ext = (state._fileInfo && state._fileInfo.name) ? state._fileInfo.name.split('.').pop().toLowerCase() : 'txt';
    const detected = format === 'auto' ? this._detectFileFormat(state._fileContent, ext) : format;
    const result = this._parseByFormat(state._fileContent, detected);
    state.parsed = result.cards;
    state.errors = result.errors;
    if (state._fileInfo) state._fileInfo.detectedFormat = this._formatLabel(detected);
    this.renderImport();
  },

  _detectFileFormat(content, ext) {
    const lines = content.split('\n').filter(l => l.trim());
    if (ext === 'md') return 'md';
    if (ext === 'tsv') return 'csv-tab';

    // Check for Q:/A: pattern
    if (lines.some(l => /^(?:Q|Otázka)\s*:/i.test(l))) return 'text';
    // Check for markdown headings
    if (lines.filter(l => /^##\s+/.test(l)).length >= 2) return 'md';

    // Try delimiters – pick the one with most consistent column count
    const delimiters = { 'csv-tab': '\t', 'csv-semi': ';', 'csv-comma': ',', 'csv-pipe': '|' };
    let bestFormat = 'one-per-line';
    let bestScore = 0;

    for (const [fmt, sep] of Object.entries(delimiters)) {
      const colCounts = lines.slice(0, 20).map(l => l.split(sep).length);
      const hasTwoCols = colCounts.filter(c => c >= 2).length;
      const consistency = hasTwoCols / colCounts.length;
      if (consistency > 0.7 && hasTwoCols > bestScore) {
        bestScore = hasTwoCols;
        bestFormat = fmt;
      }
    }
    return bestFormat;
  },

  _parseByFormat(content, format) {
    if (format === 'text') return Importer.parseText(content);
    if (format === 'md') return Importer.parseMarkdown(content);
    if (format === 'one-per-line') return this._parseAlternatingLines(content);
    // CSV variants
    const sepMap = { 'csv-semi': ';', 'csv-comma': ',', 'csv-tab': '\t', 'csv-pipe': '|' };
    return Importer.parseCSV(content, sepMap[format] || ';');
  },

  _parseAlternatingLines(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    const cards = []; const errors = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      cards.push({ front: lines[i], back: lines[i + 1] });
    }
    if (lines.length % 2 !== 0) errors.push('Lichý počet řádků – poslední řádek ignorován');
    return { cards, errors };
  },

  _formatLabel(fmt) {
    const labels = { 'csv-semi': 'CSV (;)', 'csv-comma': 'CSV (,)', 'csv-tab': 'TSV (tab)', 'csv-pipe': 'Odděleno |', 'text': 'Text Q/A', 'md': 'Markdown', 'one-per-line': '2 řádky na kartičku', 'auto': 'Auto' };
    return labels[fmt] || fmt;
  },

  _setupFileDrop() {
    const zone = document.getElementById('file-drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) this.handleFileUpload(e.dataTransfer.files);
    });
  },

  previewImport() {
    const text = document.getElementById('import-text').value;
    if (!text.trim()) { App.toast('Vložte text nebo nahrajte soubor', 'warning'); return; }
    let result;
    if (this._importState.tab === 'csv') result = Importer.parseCSV(text, document.getElementById('import-sep').value);
    else if (this._importState.tab === 'text') result = Importer.parseText(text);
    else result = Importer.parseMarkdown(text);
    this._importState.parsed = result.cards;
    this._importState.errors = result.errors;
    this.renderImport();
  },

  async generateAI() {
    const textEl = document.getElementById('ai-text'); if (!textEl) return;
    const text = textEl.value.trim();
    if (!text) { App.toast('Vložte text pro generování', 'warning'); return; }
    if (text.length < 50) { App.toast('Text je příliš krátký', 'warning'); return; }
    if (/^https?:\/\/\S+$/m.test(text.trim())) { App.toast('Vložte text, ne odkaz', 'warning'); return; }
    const apiKey = Store.data.settings.groqApiKey;
    if (!apiKey) { App.toast('Nastavte Groq API klíč', 'warning'); return; }
    this._importState._aiText = text;
    this._importState.aiLoading = true;
    this._importState.parsed = null;
    this._importState.errors = [];
    this.renderImport();
    try {
      const cards = await AIGenerator.generate(text, apiKey);
      this._importState.parsed = cards;
      this._importState.aiLoading = false;
      this.renderImport();
    } catch (e) {
      this._importState.aiLoading = false;
      this._importState.errors = [e.message];
      this.renderImport();
      App.toast('Chyba: ' + e.message, 'error');
    }
  },

  confirmImport() {
    const state = this._importState;
    if (!state.parsed || state.parsed.length === 0) return;
    let deckId = document.getElementById('import-deck').value;
    if (deckId === '__new__' || deckId === '__from_file__') {
      let name = (document.getElementById('import-new-deck-name') || {}).value;
      name = (name || '').trim();
      if (!name && state._fileInfo) name = state._fileInfo.name.replace(/\.[^.]+$/, '');
      if (!name) { App.toast('Zadejte název nového balíčku', 'warning'); return; }
      deckId = Store.createDeck(name).id;
    }
    const result = Importer.importCards(state.parsed, deckId);
    state.parsed = null; state.errors = [];
    App.toast(`Importováno ${result.imported} kartiček`, 'success');
    Gamification.checkAchievements();
    this.navigate('#deck/' + deckId);
  },

  importJSONBackup() {
    if (!this._importJsonData) return;
    const mode = document.getElementById('import-json-mode').value;
    if (mode === 'replace') {
      App.showModal('Nahradit data', '<p>Opravdu chcete nahradit všechna data?</p>', [
        { label: 'Zrušit', class: 'btn-secondary', action: () => App.hideModal() },
        { label: 'Nahradit', class: 'btn-danger', action: () => {
          App.hideModal();
          const r = Store.importJSON(this._importJsonData, 'replace');
          if (r.success) { App.toast('Import úspěšný!', 'success'); App.navigate('#decks'); }
          else App.toast('Chyba: ' + r.error, 'error');
        }}
      ]);
      return;
    }
    const r = Store.importJSON(this._importJsonData, mode);
    if (r.success) { App.toast('Import úspěšný!', 'success'); this.navigate('#decks'); }
    else App.toast('Chyba: ' + r.error, 'error');
  },

  // === Settings ===
  renderSettings() {
    const container = document.getElementById('view-settings');
    const settings = Store.data.settings;
    const dataSize = (new Blob([JSON.stringify(Store.data)]).size / 1024).toFixed(1);

    container.innerHTML = `
      <div class="page-header"><h1>Nastavení</h1></div>
      <div class="card mb-2"><h3 class="mb-1">Vzhled</h3>
        <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer"><input type="checkbox" id="setting-dark" ${settings.darkMode?'checked':''} onchange="App.toggleDarkMode(this.checked)"><span>Tmavé téma</span></label></div>
      <div class="card mb-2"><h3 class="mb-1">Studium</h3>
        <div class="form-group"><label class="form-label">Počet nových kartiček za sezení</label>
          <input class="input" type="number" id="setting-cps" value="${settings.cardsPerSession}" min="1" max="100" onchange="App.updateSetting('cardsPerSession', parseInt(this.value))"></div>
        <div class="form-group"><label class="form-label">Denní cíl (počet opakování)</label>
          <input class="input" type="number" id="setting-goal" value="${settings.dailyGoal}" min="1" max="200" onchange="App.updateSetting('dailyGoal', parseInt(this.value))"></div>
        <div class="form-group"><label class="form-label">Čas na kartičku – rychlé kolo (sekundy)</label>
          <input class="input" type="number" id="setting-speed" value="${settings.speedRoundTime}" min="5" max="120" onchange="App.updateSetting('speedRoundTime', parseInt(this.value))"></div>
        <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer"><input type="checkbox" ${settings.enableReversed?'checked':''} onchange="App.updateSetting('enableReversed', this.checked)"><span>Obousměrné kartičky (otázka &#8596; odpověď)</span></label></div>
      <div class="card mb-2"><h3 class="mb-1">\u{1F50A} Čtení nahlas (TTS)</h3>
        <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;margin-bottom:0.5rem"><input type="checkbox" ${settings.ttsAutoFront?'checked':''} onchange="App.updateSetting('ttsAutoFront', this.checked)"><span>Automaticky přečíst otázku</span></label>
        <label style="display:flex;align-items:center;gap:0.6rem;cursor:pointer;margin-bottom:0.5rem"><input type="checkbox" ${settings.ttsAutoBack?'checked':''} onchange="App.updateSetting('ttsAutoBack', this.checked)"><span>Automaticky přečíst odpověď po otočení</span></label>
        <div class="form-group"><label class="form-label">Rychlost řeči: <strong id="tts-rate-label">${settings.ttsRate || 1.0}×</strong></label>
          <input type="range" min="0.5" max="2" step="0.1" value="${settings.ttsRate || 1.0}" style="width:100%" onchange="App.updateSetting('ttsRate', parseFloat(this.value)); document.getElementById('tts-rate-label').textContent=this.value+'×'"></div>
        <div class="form-group"><label class="form-label">Hlas</label>
          <select class="input" id="setting-tts-voice" onchange="App.updateSetting('ttsVoice', this.value)"><option value="">Výchozí</option></select></div>
        <button class="btn btn-secondary btn-sm" onclick="App.speak('Toto je ukázkový text pro testování hlasu.')">Vyzkoušet hlas</button></div>
      <div class="card mb-2"><h3 class="mb-1">Groq API (zdarma)</h3>
        <p class="text-sm text-muted mb-1">Pro AI generování kartiček. Klíč získáte na <a href="https://console.groq.com/keys" target="_blank">console.groq.com</a></p>
        <div class="form-group"><label class="form-label">API klíč</label>
          <input class="input" type="password" id="setting-api-key" value="${App.esc(settings.groqApiKey||'')}" placeholder="gsk_..." onchange="App.updateSetting('groqApiKey', this.value.trim())"></div>
        ${settings.groqApiKey ? '<p class="text-sm" style="color:var(--success)">API klíč je nastaven</p>' : ''}</div>
      <div class="card mb-2"><h3 class="mb-1">Data</h3>
        <p class="text-sm text-muted mb-1">Velikost: ${dataSize} KB | Kartiček: ${Store.data.cards.length} | Balíčků: ${Store.data.decks.length}</p>
        <div class="header-actions">
          <button class="btn btn-secondary" onclick="App.exportData()">Exportovat JSON</button>
          <button class="btn btn-secondary" onclick="App.navigate('#import')">Importovat</button>
        </div></div>
      ${App._installPrompt ? `<div class="card mb-2"><h3 class="mb-1">Instalace</h3><p class="text-sm text-muted mb-1">Nainstalujte si aplikaci na plochu pro offline přístup.</p><button class="btn btn-primary" onclick="App.installPWA()">Nainstalovat aplikaci</button></div>` : ''}
      <div class="card mb-2"><h3 class="mb-1">Klávesové zkratky</h3>
        <div class="shortcuts-grid">
          <kbd>/</kbd><span>Globální vyhledávání</span>
          <kbd>N</kbd><span>Nový balíček / kartička</span>
          <kbd>Space</kbd><span>Otočit kartičku (tam i zpět)</span>
          <kbd>→</kbd><span>Přeskočit kartičku</span>
          <kbd>1-5</kbd><span>Hodnotit kartičku</span>
          <kbd>H</kbd><span>Zobrazit nápovědu</span>
          <kbd>?</kbd><span>Tato nápověda</span>
          <kbd>Esc</kbd><span>Zavřít dialog</span>
        </div></div>
      <div class="card"><h3 class="mb-1">Nebezpečná zóna</h3>
        <button class="btn btn-danger" onclick="App.confirmClearAll()">Smazat všechna data</button></div>`;

    // Populate TTS voice list
    this._populateTTSVoices();
  },

  _populateTTSVoices() {
    if (!('speechSynthesis' in window)) return;
    const populate = () => {
      const select = document.getElementById('setting-tts-voice');
      if (!select) return;
      const voices = window.speechSynthesis.getVoices();
      const current = Store.data.settings.ttsVoice || '';
      select.innerHTML = '<option value="">Výchozí</option>';
      for (const v of voices) {
        const label = `${v.name} (${v.lang})`;
        select.innerHTML += `<option value="${App.esc(v.name)}" ${v.name === current ? 'selected' : ''}>${App.esc(label)}</option>`;
      }
    };
    populate();
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = populate;
    }
  },

  toggleDarkMode(enabled) { Store.data.settings.darkMode = enabled; Store.save(); document.body.classList.toggle('dark', enabled); },
  updateSetting(key, value) { Store.data.settings[key] = value; Store.save(); },

  exportData() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = 'karticky-zaloha-' + SRS.todayStr() + '.json';
    a.click(); URL.revokeObjectURL(url);
  },

  installPWA() {
    if (App._installPrompt) {
      App._installPrompt.prompt();
      App._installPrompt.userChoice.then(r => {
        if (r.outcome === 'accepted') App.toast('Aplikace nainstalována!', 'success');
        App._installPrompt = null;
      });
    }
  },

  confirmClearAll() {
    App.showModal('Smazat všechna data', '<p>Opravdu chcete smazat všechna data? Tato akce je <strong>nevratná</strong>!</p>', [
      { label: 'Zrušit', class: 'btn-secondary', action: () => App.hideModal() },
      { label: 'Smazat vše', class: 'btn-danger', action: () => { Store.clearAll(); App.hideModal(); App.navigate('#decks'); } }
    ]);
  },

  // === Global Search ===
  showGlobalSearch() {
    const overlay = document.getElementById('search-overlay');
    overlay.classList.remove('hidden');
    const input = document.getElementById('global-search-input');
    input.value = ''; input.focus();
    document.getElementById('global-search-results').innerHTML = '<div class="search-empty">Začněte psát pro vyhledávání...</div>';
    input.oninput = () => {
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => this._performSearch(input.value), 150);
    };
    overlay.onclick = (e) => { if (e.target === overlay) this.hideGlobalSearch(); };
  },

  hideGlobalSearch() { document.getElementById('search-overlay').classList.add('hidden'); },

  _performSearch(query) {
    const results = document.getElementById('global-search-results');
    if (!query.trim()) { results.innerHTML = '<div class="search-empty">Začněte psát pro vyhledávání...</div>'; return; }
    const cards = Store.searchCards(query.trim());
    if (cards.length === 0) { results.innerHTML = '<div class="search-empty">Žádné výsledky</div>'; return; }
    let html = '';
    for (const card of cards.slice(0, 20)) {
      const deck = Store.getDeck(card.deckId);
      html += `<div class="search-result-item" onclick="App.hideGlobalSearch(); App.navigate('#edit/${card.id}')">
        <div class="result-text"><div class="result-front">${App.esc(card.front)}</div><div class="result-back">${App.esc(card.back)}</div></div>
        ${deck ? `<span class="result-deck">${App.esc(deck.name)}</span>` : ''}</div>`;
    }
    if (cards.length > 20) html += `<div class="search-empty">...a dalších ${cards.length - 20} výsledků</div>`;
    results.innerHTML = html;
  },

  // === Deck Sharing ===
  shareDeck(deckId) {
    const deck = Store.getDeck(deckId);
    if (!deck) return;
    const cards = Store.getCardsByDeck(deckId).map(c => ({ front: c.front, back: c.back, tags: c.tags, hint: c.hint || '' }));
    const data = { name: deck.name, description: deck.description, color: deck.color, cards };
    try {
      const json = JSON.stringify(data);
      const encoded = btoa(unescape(encodeURIComponent(json)));
      if (encoded.length > 6000) {
        App.toast('Balíček je příliš velký pro sdílení odkazem. Použijte JSON export.', 'warning');
        return;
      }
      const url = window.location.origin + window.location.pathname + '#share/' + encoded;
      App.showModal('Sdílet balíček', `
        <p>Odkaz pro import balíčku <strong>${App.esc(deck.name)}</strong> (${cards.length} kartiček):</p>
        <div class="share-url-box"><input class="input" id="share-url" value="${App.esc(url)}" readonly><button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('share-url').value); App.toast('Zkopírováno!','success')">Kopírovat</button></div>
      `, [{ label: 'Zavřít', class: 'btn-secondary', action: () => App.hideModal() }]);
    } catch (e) { App.toast('Chyba při sdílení', 'error'); }
  },

  renderShareImport(encoded) {
    const container = document.getElementById('view-share');
    if (!encoded) { this.navigate('#decks'); return; }
    try {
      const json = decodeURIComponent(escape(atob(encoded)));
      const data = JSON.parse(json);
      container.innerHTML = `
        <div class="page-header"><h1>Import sdíleného balíčku</h1></div>
        <div class="card">
          <h3>${App.esc(data.name)}</h3>
          ${data.description ? `<p class="text-muted text-sm">${App.esc(data.description)}</p>` : ''}
          <p class="mt-1"><strong>${data.cards.length}</strong> kartiček</p>
          <div class="import-preview mt-1"><table><thead><tr><th>#</th><th>Otázka</th><th>Odpověď</th></tr></thead><tbody>
            ${data.cards.slice(0, 10).map((c, i) => `<tr><td>${i+1}</td><td>${App.esc(c.front)}</td><td>${App.esc(c.back)}</td></tr>`).join('')}
            ${data.cards.length > 10 ? `<tr><td colspan="3" class="text-muted">...a dalších ${data.cards.length - 10}</td></tr>` : ''}
          </tbody></table></div>
          <button class="btn btn-primary btn-block mt-2" onclick="App._importSharedDeck()">Importovat balíček</button>
          <button class="btn btn-secondary btn-block mt-1" onclick="App.navigate('#decks')">Zrušit</button>
        </div>`;
      this._sharedDeckData = data;
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><h3>Neplatný odkaz</h3><p>Sdílený odkaz je poškozený nebo neplatný.</p><button class="btn btn-primary" onclick="App.navigate('#decks')">Zpět</button></div>`;
    }
  },

  _importSharedDeck() {
    const data = this._sharedDeckData;
    if (!data) return;
    const deck = Store.createDeck(data.name, data.description, data.color);
    for (const c of data.cards) Store.createCard(deck.id, c.front, c.back, c.tags || [], c.hint || '');
    App.toast(`Importováno: ${data.name} (${data.cards.length} kartiček)`, 'success');
    this.navigate('#deck/' + deck.id);
  },

  // === Modal ===
  showModal(title, body, buttons) {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `<h2>${title}</h2>${body}<div class="modal-buttons">${buttons.map((b, i) => `<button class="btn ${b.class}" onclick="App._modalActions[${i}]()">${b.label}</button>`).join('')}</div>`;
    this._modalActions = buttons.map(b => b.action);
    overlay.classList.remove('hidden');
  },

  hideModal() { document.getElementById('modal-overlay').classList.add('hidden'); },

  // === Keyboard shortcuts ===
  handleKeyboard(e) {
    const tag = document.activeElement.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape') {
      this.hideModal();
      this.hideGlobalSearch();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      this.showGlobalSearch();
      return;
    }

    // Study / Speed / Cram session shortcuts
    if ((this.currentView === '#study' || this.currentView === '#speed' || this.currentView === '#cram' || this.currentView === '#study-all') && this.studySession) {
      if (e.code === 'Space' && !inInput) { e.preventDefault(); this.flipCard(); }
      else if (this.studySession.flipped && e.key >= '1' && e.key <= '5' && !inInput) { e.preventDefault(); this.rateCard(parseInt(e.key)); }
      else if (e.key === 'h' && !this.studySession.flipped && !inInput) { this.showHint(); }
      else if (e.key === 'ArrowRight' && !inInput) { e.preventDefault(); this.skipCard(); }
    }

    // Quiz shortcuts
    if (this.currentView === '#quiz-active' && this.quizSession) {
      if (e.key === 'Enter' && this.quizSession.answered && !inInput) { e.preventDefault(); this.nextQuizQuestion(); }
    }

    // Global shortcuts (not in input)
    if (!inInput) {
      if (e.key === '/') { e.preventDefault(); this.showGlobalSearch(); }
      if (e.key === '?') { this.navigate('#settings'); }
      if (e.key === 'n' && this.currentView === '#decks') { this.showDeckForm(); }
      if (e.key === 'n' && this.currentView === '#deck') { this.navigate('#edit/new/' + this._deckDetailState.deckId); }
    }
  },

  // === Utilities ===
  esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  escAttr(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
  }
};

// === Init ===
document.addEventListener('DOMContentLoaded', () => App.init());
