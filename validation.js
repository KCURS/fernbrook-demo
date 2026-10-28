// Shared validation rules. Imported by the browser (form.js) and by the server
// (server.js) so both sides apply exactly the same normalization and limits.

export const SERVICES = Object.freeze({
  standard: 'Limpeza residencial padrão',
  deep: 'Limpeza pesada',
  move: 'Limpeza de mudança (entrada ou saída)',
  upholstery: 'Higienização de estofados',
  other: 'Outro',
});

export const LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 100,
  emailMax: 254,
  detailsMin: 10,
  detailsMax: 1000,
});

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;
const PHONE_CHARS_RE = /^[\d\s().+-]+$/;

/** Collapse runs of whitespace into one space and trim. */
export function normalizeLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Keep line breaks, but trim each line, collapse inner spaces and extra blank lines. */
export function normalizeMultiline(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Returns "(555) 123-4567" for a plausible US number, or null. */
export function normalizeUsPhone(value) {
  const raw = normalizeLine(value);
  if (!PHONE_CHARS_RE.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3))) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Validate and normalize a quote request.
 * @returns {{ ok: boolean, data: object, errors: Record<string, string> }}
 */
export function validateQuote(input = {}) {
  const errors = {};
  const data = {};

  const name = normalizeLine(input.name);
  if (!name) errors.name = 'Informe seu nome completo.';
  else if (name.length < LIMITS.nameMin) errors.name = `O nome precisa ter pelo menos ${LIMITS.nameMin} caracteres.`;
  else if (name.length > LIMITS.nameMax) errors.name = `O nome pode ter no máximo ${LIMITS.nameMax} caracteres.`;
  data.name = name;

  const email = normalizeLine(input.email);
  if (!email) errors.email = 'Informe seu e-mail.';
  else if (email.length > LIMITS.emailMax || !EMAIL_RE.test(email)) {
    errors.email = 'Informe um e-mail válido, como nome@exemplo.com.';
  }
  data.email = email;

  const phoneRaw = normalizeLine(input.phone);
  data.phone = '';
  if (phoneRaw) {
    const phone = normalizeUsPhone(phoneRaw);
    if (!phone) errors.phone = 'Use um telefone dos EUA com 10 dígitos, como (555) 123-4567, ou deixe em branco.';
    else data.phone = phone;
  }

  const service = normalizeLine(input.service);
  if (!service) errors.service = 'Escolha o serviço desejado.';
  else if (!Object.hasOwn(SERVICES, service)) errors.service = 'Escolha um dos serviços da lista.';
  data.service = service;

  const zip = normalizeLine(input.zip);
  if (zip && !ZIP_RE.test(zip)) errors.zip = 'Use um ZIP code dos EUA com 5 dígitos, como 12345 ou 12345-6789, ou deixe em branco.';
  data.zip = zip;

  const details = normalizeMultiline(input.details);
  if (!details) errors.details = 'Conte um pouco sobre o que você precisa.';
  else if (details.length < LIMITS.detailsMin) errors.details = `Acrescente mais detalhes (pelo menos ${LIMITS.detailsMin} caracteres).`;
  else if (details.length > LIMITS.detailsMax) errors.details = `Os detalhes podem ter no máximo ${LIMITS.detailsMax} caracteres.`;
  data.details = details;

  if (input.consent !== true) errors.consent = 'Marque a caixa para que a empresa possa entrar em contato sobre este pedido.';
  data.consent = input.consent === true;

  return { ok: Object.keys(errors).length === 0, data, errors };
}
