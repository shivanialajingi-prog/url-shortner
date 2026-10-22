const form = document.querySelector('#shorten-form');
const urlInput = document.querySelector('#url');
const customCodeInput = document.querySelector('#custom-code');
const result = document.querySelector('#result');
const shortUrl = document.querySelector('#short-url');
const copyButton = document.querySelector('#copy-button');
const copyStatus = document.querySelector('#copy-status');
const errorMessage = document.querySelector('#error');
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  result.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Creating…';

  try {
    const response = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: urlInput.value,
        customCode: customCodeInput.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    shortUrl.href = data.shortUrl;
    shortUrl.textContent = data.shortUrl;
    copyStatus.textContent = '';
    result.hidden = false;
  } catch (error) {
    errorMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Shorten URL';
  }
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shortUrl.href);
    copyStatus.textContent = 'Copied to clipboard.';
  } catch {
    copyStatus.textContent = 'Copy failed — select the link above.';
  }
});
