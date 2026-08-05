(function () {
  const demoSiteId = 'site_demo';
  const apiUrl = 'http://localhost:8787';

  document.querySelectorAll('[data-open-chat]').forEach((button) => {
    button.addEventListener('click', () => {
      if (window.Chatbot) {
        window.Chatbot.open();
        return;
      }
      document.querySelector('#demo-live')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('[data-demo-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-demo-prompt') || '';
      if (!prompt) return;
      if (window.Chatbot) {
        window.Chatbot.open();
        void window.Chatbot.send(prompt);
        return;
      }
      setTemporaryButtonText(button, 'Start API first');
    });
  });

  const form = document.querySelector('#demo-form');
  const status = document.querySelector('#form-status');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitDemoForm(form, status);
  });

  async function submitDemoForm(formElement, statusElement) {
    const values = Object.fromEntries(new FormData(formElement).entries());
    const email = String(values.email || '').trim();
    const name = String(values.name || '').trim();
    if (!email || !name) {
      setStatus(statusElement, 'Please add your name and email.', 'error');
      return;
    }

    setStatus(statusElement, 'Sending demo request...', '');
    try {
      const response = await fetch(`${apiUrl}/public/sites/${demoSiteId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name,
          email,
          company: String(values.platform || '').trim() || undefined,
          message: [
            `Demo request from landing page`,
            `Website: ${String(values.website || '').trim() || '-'}`,
            `Platform: ${String(values.platform || '').trim() || '-'}`,
            `Goal: ${String(values.goal || '').trim() || '-'}`,
          ].join('\n'),
          pageUrl: window.location.href,
          locale: 'en',
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(`lead_failed_${response.status}`);
      formElement.reset();
      setStatus(statusElement, 'Demo request sent. It is stored in the admin lead inbox.', 'success');
      if (window.Chatbot) {
        window.Chatbot.open();
        void window.Chatbot.send(`I booked a demo. My email is ${email}`);
      }
    } catch {
      setStatus(
        statusElement,
        'The demo API is not running. Start it with npm run dev:api, then submit again.',
        'error',
      );
    }
  }

  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text;
    node.className = `form-status ${kind}`.trim();
  }

  function setTemporaryButtonText(button, text) {
    const original = button.textContent;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1600);
  }
})();

