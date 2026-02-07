// SM-2 Spaced Repetition Algorithm + Quiz Engine

const SRS = {
  // Quality mapping: user 1-5 -> SM-2 internal 0-5
  QUALITY_MAP: { 1: 0, 2: 2, 3: 3, 4: 4, 5: 5 },

  LABELS: {
    1: 'Neznám',
    2: 'Špatně',
    3: 'Těžko',
    4: 'Dobře',
    5: 'Snadné'
  },

  /**
   * SM-2 algorithm: calculate next review parameters.
   */
  calculate(quality, repetitions, easeFactor, interval) {
    let newEF = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEF < 1.3) newEF = 1.3;

    let newInterval;
    let newReps;

    if (quality >= 3) {
      if (repetitions === 0) {
        newInterval = 1;
      } else if (repetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.ceil(interval * newEF);
      }
      newReps = repetitions + 1;
    } else {
      newReps = 0;
      newInterval = 1;
    }

    const now = new Date();
    const nextReview = new Date(now);
    nextReview.setDate(nextReview.getDate() + newInterval);

    return {
      repetitions: newReps,
      easeFactor: Math.round(newEF * 100) / 100,
      interval: newInterval,
      nextReview: SRS.toLocalDateStr(nextReview)
    };
  },

  /** Get today's date as YYYY-MM-DD in local timezone */
  todayStr() {
    return SRS.toLocalDateStr(new Date());
  },

  toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Get cards due for review, ordered by priority.
   */
  getDueCards(cards, deckId, newLimit) {
    const today = SRS.todayStr();
    let filtered = deckId ? cards.filter(c => c.deckId === deckId) : cards;
    filtered = filtered.filter(c => c.status !== 'suspended');

    const overdue = filtered
      .filter(c => c.status === 'review' && c.nextReview && c.nextReview <= today)
      .sort((a, b) => (a.nextReview || '').localeCompare(b.nextReview || ''));

    const learning = filtered
      .filter(c => c.status === 'learning')
      .sort((a, b) => (a.nextReview || '').localeCompare(b.nextReview || ''));

    const newCards = filtered
      .filter(c => c.status === 'new')
      .slice(0, newLimit || 20);

    return [...overdue, ...learning, ...newCards];
  },

  /**
   * Get ALL non-suspended cards for cram mode (shuffled).
   */
  getCramCards(cards, deckId) {
    let filtered = deckId ? cards.filter(c => c.deckId === deckId) : cards;
    filtered = filtered.filter(c => c.status !== 'suspended');
    return [...filtered].sort(() => Math.random() - 0.5);
  },

  /**
   * Count cards due today for a deck (or all decks if no deckId).
   */
  countDue(cards, deckId) {
    const today = SRS.todayStr();
    return cards.filter(c =>
      (!deckId || c.deckId === deckId) &&
      c.status !== 'suspended' &&
      (c.status === 'new' || c.status === 'learning' ||
        (c.status === 'review' && c.nextReview && c.nextReview <= today))
    ).length;
  },

  /**
   * Generate quiz questions from cards.
   */
  generateQuiz(cards, options = {}) {
    const count = Math.min(options.count || 10, cards.length);
    const types = options.types || ['mc', 'tf', 'type'];
    const questions = [];

    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    for (const card of selected) {
      let availableTypes = [...types];
      if (cards.length < 4) {
        availableTypes = availableTypes.filter(t => t !== 'mc');
      }
      if (availableTypes.length === 0) availableTypes = ['type'];

      const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];

      if (type === 'mc') {
        const others = cards.filter(c => c.id !== card.id);
        const distractors = others
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map(c => c.back);
        const allOptions = [card.back, ...distractors].sort(() => Math.random() - 0.5);
        questions.push({
          type: 'mc',
          question: card.front,
          correctAnswer: card.back,
          options: allOptions,
          cardId: card.id
        });
      } else if (type === 'tf') {
        const isTrue = Math.random() > 0.5;
        let statement;
        if (isTrue) {
          statement = card.back;
        } else {
          const others = cards.filter(c => c.id !== card.id);
          if (others.length > 0) {
            statement = others[Math.floor(Math.random() * others.length)].back;
          } else {
            statement = card.back;
          }
        }
        questions.push({
          type: 'tf',
          question: card.front,
          statement: statement,
          isTrue: isTrue,
          correctAnswer: card.back,
          cardId: card.id
        });
      } else {
        questions.push({
          type: 'type',
          question: card.front,
          correctAnswer: card.back,
          cardId: card.id
        });
      }
    }

    return questions;
  },

  /**
   * Check typed answer against correct answer.
   */
  checkTypeAnswer(userAnswer, correctAnswer) {
    const normalize = s => s.trim().toLowerCase();
    const ua = normalize(userAnswer);
    const ca = normalize(correctAnswer);

    if (ua === ca) return { correct: true, similarity: 1 };
    if (ca.includes(ua) && ua.length > 3) return { correct: true, similarity: 0.8 };

    const dist = SRS.levenshtein(ua, ca);
    const maxLen = Math.max(ua.length, ca.length);
    const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;

    return { correct: similarity >= 0.8, similarity };
  },

  levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => {
      const row = new Array(n + 1);
      row[0] = i;
      return row;
    });
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }
};
