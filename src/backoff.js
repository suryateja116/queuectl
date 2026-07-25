function delaySecondsFor(attempts, base) {
  if (attempts < 0) {
    throw new Error('Attempts cannot be negative');
  }
  return Math.pow(base, attempts);
}

function nextRetryDate(attempts, base, now = new Date()) {
  const delay = delaySecondsFor(attempts, base);
  return new Date(now.getTime() + delay * 1000);
}

module.exports = {
  delaySecondsFor,
  nextRetryDate,
};
