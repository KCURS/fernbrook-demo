import { validateQuote, LIMITS } from './validation.js';

const REQUEST_TIMEOUT_MS = 20000;
const REFERENCE_RE = /^Q-\d{8}-[A-Z0-9]{6}$/;
const FIELDS = ['name', 'email', 'phone', 'service', 'zip', 'details', 'consent'];

const form = document.getElementById('quote-form');
const submitBtn = document.getElementById('submit');
const submitLabel = submitBtn.querySelector('.button-label');
const summary = document.getElementById('error-summary');
const summaryList = document.getElementById('error-summary-list');
const submitError = document.getElementById('submit-error');
const result = document.getElementById('result');
const intakeStatus = document.getElementById('intake-status');
const detailsInput = document.getElementById('details');
const detailsCount = document.getElementById('details-count');

let submitting = false;
let attempted = false;
let idempotencyKey = crypto.randomUUID();
let lastFailedSnapshot = null;

// ----- Status banner: tell visitors up front if requests can't be delivered.
fetch('api/status', { headers: { Accept: 'application/json' } })
  .then((r) => (r.ok ? r.json() : null))
  .then((s) => {
    if (s && s.intakeEnabled === false) intakeStatus.hidden = false;
  })
  .catch(() => {});

// ----- Mobile call-to-action bar: hide it while the quote section (so it never
// covers the form), the round call-to-action button or the hero button is on screen.
const mobileCta = document.getElementById('mobile-cta');
if (mobileCta && 'IntersectionObserver' in window) {
  const onScreen = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target);
      mobileCta.classList.toggle('is-hidden', onScreen.size > 0);
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  ['quote', 'cta-title'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) io.observe(id === 'cta-title' ? el.closest('.cta') : el);
  });
  // Also while the hero's own button is on screen, so two identical buttons never show at once.
  const heroActions = document.querySelector('.hero-actions');
  if (heroActions) io.observe(heroActions);
}

// ----- Service cards preselect the matching option in the form.
document.querySelectorAll('[data-select-service]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const radio = form.querySelector(`input[name="service"][value="${btn.dataset.selectService}"]`);
    if (!radio) return;
    radio.checked = true;
    if (attempted) showFieldError('service', null);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('quote').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    radio.focus({ preventScroll: true });
  });
});

// ----- Character counter.
function updateCounter() {
  const len = detailsInput.value.length;
  detailsCount.textContent = `${len} / ${LIMITS.detailsMax}`;
  detailsCount.classList.toggle('is-over', len > LIMITS.detailsMax);
}
detailsInput.addEventListener('input', updateCounter);
updateCounter();

// ----- Helpers.
function readForm() {
  const fd = new FormData(form);
  return {
    name: fd.get('name') ?? '',
    email: fd.get('email') ?? '',
    phone: fd.get('phone') ?? '',
    service: fd.get('service') ?? '',
    zip: fd.get('zip') ?? '',
    details: fd.get('details') ?? '',
    consent: form.elements.consent.checked,
    website: fd.get('website') ?? '',
  };
}

function controlFor(field) {
  if (field === 'service') return form.querySelector('fieldset[aria-describedby="service-error"]');
  return form.elements[field];
}

function focusTargetFor(field) {
  if (field === 'service') {
    return form.querySelector('input[name="service"]:checked') || form.querySelector('input[name="service"]');
  }
  return form.elements[field];
}

function showFieldError(field, message) {
  const el = document.getElementById(`${field}-error`);
  const control = controlFor(field);
  if (message) {
    el.textContent = message;
    el.hidden = false;
    control?.setAttribute('aria-invalid', 'true');
  } else {
    el.textContent = '';
    el.hidden = true;
    control?.removeAttribute('aria-invalid');
  }
}

function showErrors(errors) {
  FIELDS.forEach((f) => showFieldError(f, errors[f]));
  const entries = FIELDS.filter((f) => errors[f]);
  summaryList.replaceChildren(
    ...entries.map((f) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${f === 'service' ? 'service-error' : f}`;
      a.textContent = errors[f];
      a.addEventListener('click', (e) => {
        e.preventDefault();
        focusTargetFor(f)?.focus();
      });
      li.append(a);
      return li;
    }),
  );
  summary.hidden = entries.length === 0;
  return entries;
}

function hideSubmitError() {
  submitError.hidden = true;
  submitError.replaceChildren();
}

function showSubmitError(message, fallbackContact) {
  const title = document.createElement('p');
  title.className = 'notice-title';
  title.textContent = 'Seu pedido não foi enviado.';
  const body = document.createElement('p');
  body.textContent = message;
  const keep = document.createElement('p');
  keep.textContent = 'Suas respostas continuam no formulário.';
  const wrap = document.createElement('div');
  wrap.append(title, body, keep);
  if (fallbackContact) {
    const alt = document.createElement('p');
    alt.textContent = `Outra forma de falar com a empresa: ${fallbackContact}`;
    wrap.append(alt);
  }
  submitError.replaceChildren(wrap);
  submitError.hidden = false;
  submitError.focus();
}

function setLoading(on) {
  submitting = on;
  submitBtn.classList.toggle('is-loading', on);
  submitBtn.setAttribute('aria-disabled', String(on));
  submitBtn.disabled = on;
  form.setAttribute('aria-busy', String(on));
  submitLabel.textContent = on ? 'Enviando…' : 'Enviar pedido';
}

function snapshot(values) {
  const { website, ...rest } = values;
  return JSON.stringify(rest);
}

function showSuccess(reference) {
  const title = document.createElement('p');
  title.className = 'notice-title';
  title.textContent = 'Pedido recebido';
  const body = document.createElement('p');
  body.append('Seu pedido foi registrado. O número de referência é ');
  const ref = document.createElement('span');
  ref.className = 'reference';
  ref.textContent = reference;
  body.append(ref, '. A empresa vai analisá-lo e entrar em contato.');
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'link-button';
  again.textContent = 'Fazer um novo pedido';
  again.addEventListener('click', () => {
    result.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('notice-icon');
  icon.innerHTML = '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8 12.5 2.5 2.5L16 9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

  const wrap = document.createElement('div');
  wrap.append(title, body, again);
  result.className = 'result notice notice-success';
  result.setAttribute('role', 'status');
  result.replaceChildren(icon, wrap);
  result.hidden = false;

  form.reset();
  updateCounter();
  attempted = false;
  FIELDS.forEach((f) => showFieldError(f, null));
  summary.hidden = true;
  form.hidden = true;
  result.focus();
}

// ----- Live validation after the first attempt, and on blur for touched fields.
form.addEventListener('input', () => {
  updateCounter();
  if (!attempted) return;
  const { errors } = validateQuote(readForm());
  FIELDS.forEach((f) => showFieldError(f, errors[f]));
  if (!summary.hidden && Object.keys(errors).length === 0) summary.hidden = true;
});
form.addEventListener('focusout', (e) => {
  const field = e.target.name;
  if (attempted || !FIELDS.includes(field) || field === 'service' || field === 'consent') return;
  if (!e.target.value) return;
  const { errors } = validateQuote(readForm());
  showFieldError(field, errors[field]);
});

// ----- Submit.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting) return;
  attempted = true;
  hideSubmitError();

  const values = readForm();
  const { ok, errors } = validateQuote(values);
  showErrors(errors);
  if (!ok) {
    summary.focus();
    return;
  }

  // Same content after a failure -> same key, so a retry can't create a duplicate.
  const snap = snapshot(values);
  if (lastFailedSnapshot !== null && lastFailedSnapshot !== snap) idempotencyKey = crypto.randomUUID();

  setLoading(true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch('api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...values, idempotencyKey }),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    // Only an explicit, well-formed confirmation counts as received.
    if (res.status === 201 && data?.ok === true && typeof data.reference === 'string' && REFERENCE_RE.test(data.reference)) {
      lastFailedSnapshot = null;
      idempotencyKey = crypto.randomUUID();
      showSuccess(data.reference);
      return;
    }

    lastFailedSnapshot = snap;
    if (res.status === 422 && data?.errors && typeof data.errors === 'object') {
      showErrors(data.errors);
      summary.focus();
      return;
    }
    const message = typeof data?.message === 'string' && data.ok === false
      ? data.message
      : 'Não conseguimos confirmar que o seu pedido foi salvo, então não podemos dizer que ele foi recebido. Tente novamente.';
    const fallback = typeof data?.fallbackContact === 'string' ? data.fallbackContact : null;
    showSubmitError(message, fallback);
  } catch (err) {
    lastFailedSnapshot = snap;
    const message = err?.name === 'AbortError'
      ? 'O pedido demorou demais e não conseguimos confirmar que foi salvo. Tente novamente.'
      : 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.';
    showSubmitError(message, null);
  } finally {
    clearTimeout(timer);
    setLoading(false);
  }
});
