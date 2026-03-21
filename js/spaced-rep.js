/**
 * spaced-rep.js — SM-2 Spaced Repetition Engine (simplified)
 *
 * Each card has:
 *   - interval: days until next review
 *   - ease: ease factor (default 2.5)
 *   - due: timestamp when card is due
 *   - reviews: total review count
 *   - correct: total correct count
 *   - streak: consecutive correct
 */

const SR = {
  INITIAL_EASE: 2.5,
  MIN_EASE: 1.3,

  /**
   * Create default card state
   */
  newCard(id) {
    return {
      id,
      interval: 0,
      ease: this.INITIAL_EASE,
      due: 0, // immediately due
      reviews: 0,
      correct: 0,
      streak: 0,
      lastReview: 0,
    };
  },

  /**
   * Update card after review.
   * quality: 0=again, 1=hard, 2=good, 3=easy
   */
  review(card, quality) {
    const now = Date.now();
    card.reviews++;
    card.lastReview = now;

    if (quality >= 2) {
      // Correct
      card.correct++;
      card.streak++;

      if (card.interval === 0) {
        card.interval = 1;
      } else if (card.interval === 1) {
        card.interval = 3;
      } else {
        card.interval = Math.round(card.interval * card.ease);
      }

      // Adjust ease
      const easeAdj = quality === 3 ? 0.15 : quality === 2 ? 0 : -0.15;
      card.ease = Math.max(this.MIN_EASE, card.ease + easeAdj);

    } else {
      // Incorrect
      card.streak = 0;
      card.interval = quality === 1 ? Math.max(1, Math.round(card.interval * 0.5)) : 0;
      card.ease = Math.max(this.MIN_EASE, card.ease - 0.2);
    }

    card.due = now + card.interval * 24 * 60 * 60 * 1000;
    return card;
  },

  /**
   * Check if card is due now
   */
  isDue(card) {
    return Date.now() >= card.due;
  },

  /**
   * Check if card is "mastered" (interval >= 21 days)
   */
  isMastered(card) {
    return card.interval >= 21;
  },

  /**
   * Score from binary correct/incorrect
   */
  binaryToQuality(isCorrect) {
    return isCorrect ? 2 : 0;
  },
};
