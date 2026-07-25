const test = require('node:test');
const assert = require('node:assert');
const { delaySecondsFor, nextRetryDate } = require('../src/backoff');

test('backoff calculations', async (t) => {
  await t.test('base=2 gives exponential backoff', () => {
    assert.strictEqual(delaySecondsFor(1, 2), 2);
    assert.strictEqual(delaySecondsFor(2, 2), 4);
    assert.strictEqual(delaySecondsFor(3, 2), 8);
  });

  await t.test('different base changes the result', () => {
    assert.strictEqual(delaySecondsFor(1, 3), 3);
    assert.strictEqual(delaySecondsFor(2, 3), 9);
    assert.strictEqual(delaySecondsFor(3, 3), 27);
  });

  await t.test('nextRetryDate offsets correctly from a fixed now date', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    // delay for 1 attempt with base 2 is 2 seconds
    const expected = new Date('2024-01-01T12:00:02Z');
    
    const result = nextRetryDate(1, 2, now);
    assert.strictEqual(result.getTime(), expected.getTime());
  });

  await t.test('delaySecondsFor throws on negative attempts', () => {
    assert.throws(() => {
      delaySecondsFor(-1, 2);
    }, Error);
  });
});
