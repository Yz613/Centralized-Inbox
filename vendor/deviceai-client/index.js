const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_FIELDS = 80;

const primitive = /^(string|boolean|number|integer(?:\s+-?\d+\s*-\s*-?\d+)?)$/;
function validateSchema(schema) {
  let fields = 0;
  function walk(value, depth) {
    if (depth > MAX_SCHEMA_DEPTH) throw new Error('Schema is too deeply nested');
    if (typeof value === 'string') {
      if (!primitive.test(value.trim())) throw new Error(`Unsupported schema type: ${value}`);
      return;
    }
    if (Array.isArray(value)) {
      if (value.length !== 1) throw new Error('Array schemas need one element type');
      walk(value[0], depth + 1);
      return;
    }
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid schema');
    for (const [key, child] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || ++fields > MAX_SCHEMA_FIELDS) throw new Error('Invalid or oversized schema');
      walk(child, depth + 1);
    }
  }
  walk(schema, 0);
  return schema;
}

function validateOutput(value, schema, path = 'output') {
  if (typeof schema === 'string') {
    const [kind, bounds] = schema.trim().toLowerCase().split(/\s+/, 2);
    if (kind === 'integer') {
      if (!Number.isInteger(value)) throw new Error(`${path} must be an integer`);
      const match = schema.match(/(-?\d+)\s*-\s*(-?\d+)/);
      if (match && (value < Number(match[1]) || value > Number(match[2]))) throw new Error(`${path} is outside its range`);
    } else if (typeof value !== kind || (kind === 'number' && !Number.isFinite(value))) {
      throw new Error(`${path} must be ${kind}`);
    }
    return value;
  }
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    value.forEach((item, i) => validateOutput(item, schema[0], `${path}[${i}]`));
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  for (const [key, child] of Object.entries(schema)) {
    if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key} is missing`);
    validateOutput(value[key], child, `${path}.${key}`);
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(schema, key)) throw new Error(`${path}.${key} is unexpected`);
  return value;
}

function normalizeRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Request must be an object');
  const normalized = {
    task: request.task ?? request.prompt ?? request.instructions ?? '',
    instructions: request.instructions ?? '',
    input: request.input ?? null,
    imageDataUrl: request.imageDataUrl ?? null,
    responseSchema: request.responseSchema ?? null,
    localOnly: request.localOnly === true,
    needsCurrentInformation: request.needsCurrentInformation === true,
    requiresTools: request.requiresTools ?? []
  };
  if (typeof normalized.task !== 'string' || typeof normalized.instructions !== 'string' || normalized.task.length > 16000 || normalized.instructions.length > 16000 || !normalized.task.trim()) throw new Error('A short task or prompt is required');
  if (!Array.isArray(normalized.requiresTools) || normalized.requiresTools.some(x => typeof x !== 'string')) throw new Error('requiresTools must be a string array');
  if (normalized.imageDataUrl !== null && (typeof normalized.imageDataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(normalized.imageDataUrl) || normalized.imageDataUrl.length > 3_000_000)) throw new Error('Use one PNG, JPEG, or WebP image under 2 MB');
  if (normalized.responseSchema) validateSchema(normalized.responseSchema);
  if (new TextEncoder().encode(JSON.stringify({ ...normalized, imageDataUrl: null })).length > 256 * 1024) throw new Error('Text request exceeds 256 KB');
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > MAX_REQUEST_BYTES) throw new Error('Request exceeds 256 KB');
  return normalized;
}



const current = /\b(today|tonight|yesterday|right now|latest|current|recent|this week|this month|last (?:\d+|six|three|twelve) (?:days|weeks|months)|stock market today|live)\b/i;
const research = /\b(research|search (?:the )?web|browse|look up online|find (?:current|latest)|cite (?:sources|websites)|check (?:the )?internet)\b/i;
const external = /\b(send (?:an? )?email|book (?:a )?(?:meeting|flight)|post to|update (?:my )?(?:calendar|crm)|call (?:an? )?api)\b/i;

function decide(request, contextLimit = 4096) {
  const r = normalizeRequest(request);
  const text = `${r.task}\n${r.instructions}`;
  if (r.needsCurrentInformation || current.test(text) && /\b(what happened|news|market|revenue|expanded|price|weather|who is|research|find|tell me)\b/i.test(text) || research.test(text) && /\b(company|web|internet|current|latest|sources|revenue)\b/i.test(text)) return { reasonCode: 'current_information', reason: 'This request needs current information or web research.' };
  if (r.requiresTools.length || external.test(text)) return { reasonCode: 'external_tool', reason: 'This request needs an external tool that DeviceAI cannot use.' };
  const bytes = new TextEncoder().encode(JSON.stringify(r.input ?? '')).length + text.length;
  if (bytes / 3 > Math.max(512, contextLimit - 768)) return { reasonCode: 'context_limit', reason: 'The supplied information is larger than this device model can reliably process at once.' };
  return null;
}

function createHandoff(request, reasonCode, reason) {
  const r = normalizeRequest(request);
  if (r.localOnly) return { status: 'local_failed', reasonCode, reason };
  const sections = ['TASK', r.task, 'TODAY', new Date().toISOString().slice(0, 10)];
  if (r.instructions && r.instructions !== r.task) sections.push('INSTRUCTIONS', r.instructions);
  if (r.input !== null) sections.push('INPUT DATA', typeof r.input === 'string' ? r.input : JSON.stringify(r.input, null, 2));
  if (r.imageDataUrl) sections.push('IMAGE', 'Attach the original image manually when you paste this prompt. The image is intentionally not embedded in clipboard text.');
  if (r.responseSchema) sections.push('EXPECTED OUTPUT', `Return valid JSON matching this field specification:\n${JSON.stringify(r.responseSchema, null, 2)}`);
  sections.push('IMPORTANT REQUIREMENTS', `Reason on-device processing could not finish: ${reason}\nUse current sources and cite them when research is needed. Clearly distinguish verified facts from uncertainty. Follow the requested response format.`);
  return { status: 'cloud_handoff_required', reasonCode, reason, copyPrompt: sections.join('\n\n'), suggestedDestination: 'either' };
}

const androidPending = new Map();
function sendNative(request) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    // Omit absent media at the bridge boundary; native JSON parsers can turn null into the string "null".
    const nativeRequest = { ...request };
    if (nativeRequest.imageDataUrl === null) delete nativeRequest.imageDataUrl;
    const bridge = globalThis.DeviceAINative;
    if (bridge?.postMessage) {
      if (!bridge.__deviceAIListenerReady) {
        bridge.onmessage = event => {
          try {
            const message = JSON.parse(event.data);
            const pending = androidPending.get(message.id);
            if (pending) { androidPending.delete(message.id); clearTimeout(pending.timeout); pending.resolve(message.result); }
          } catch { /* Malformed native replies cannot resolve a pending request. */ }
        };
        bridge.__deviceAIListenerReady = true;
      }
      const timeout = setTimeout(() => { androidPending.delete(id); reject(new Error('DeviceAI timed out')); }, 120000);
      androidPending.set(id, { resolve, reject, timeout });
      bridge.postMessage(JSON.stringify({ id, action: 'run', request: nativeRequest }));
      return;
    }
    if (typeof window === 'undefined') return reject(new Error('Open this tool in DeviceAI or an approved Chromium browser'));
    const timeout = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('DeviceAI browser extension is unavailable')); }, 120000);
    function listener(event) {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.channel !== 'deviceai:response' || event.data.id !== id) return;
      clearTimeout(timeout); window.removeEventListener('message', listener);
      event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
    }
    window.addEventListener('message', listener);
    window.postMessage({ channel: 'deviceai:request', id, action: 'run', request: nativeRequest }, window.location.origin);
  });
}

const deviceAI = {
  async run(request) {
    const r = normalizeRequest(request);
    const decision = decide(r);
    if (decision) return createHandoff(r, decision.reasonCode, decision.reason);
    let result;
    try { result = await sendNative(r); }
    catch (error) { return { status: 'local_failed', reasonCode: 'bridge_unavailable', reason: error.message }; }
    if (result.status === 'local_success' && r.responseSchema) {
      try { validateOutput(result.output, r.responseSchema); }
      catch { return createHandoff(r, 'invalid_structured_output', 'The local model did not produce valid structured output.'); }
    }
    if (result.status === 'cloud_handoff_required') return createHandoff(r, result.reasonCode, result.reason);
    return result;
  },
  showHandoff(result, target = document.body) {
    if (result.status !== 'cloud_handoff_required') throw new Error('A cloud handoff result is required');
    const panel = document.createElement('section'); panel.className = 'deviceai-handoff';
    panel.style.cssText = 'max-width:640px;padding:24px;border:1px solid var(--deviceai-border,#d1d5db);border-radius:16px;background:var(--deviceai-background,#fff);color:var(--deviceai-text,#111827);font:16px system-ui;box-shadow:0 8px 30px #0001';
    const title = document.createElement('h2'); title.textContent = 'This needs a cloud model'; panel.append(title);
    const reason = document.createElement('p'); reason.textContent = result.reason; panel.append(reason);
    const privacy = document.createElement('p'); privacy.textContent = 'Nothing was sent to a cloud AI. Copy the prompt and paste it yourself.'; panel.append(privacy);
    const preview = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Review prompt'; const pre = document.createElement('pre'); pre.textContent = result.copyPrompt; pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:13px ui-monospace,monospace'; preview.append(summary, pre); panel.append(preview);
    const copy = document.createElement('button'); copy.textContent = 'COPY PROMPT'; copy.style.cssText = 'padding:12px 20px;background:var(--deviceai-button,#111827);color:var(--deviceai-button-text,white);border:0;border-radius:8px;cursor:pointer;font-weight:700';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(result.copyPrompt); copy.textContent = 'COPIED'; } catch { preview.open = true; copy.textContent = 'Select and copy the prompt above'; } }; panel.append(copy);
    for (const [label, url] of [['Open ChatGPT', 'https://chatgpt.com/'], ['Open Gemini', 'https://gemini.google.com/']]) {
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = label; a.style.cssText = 'display:inline-block;margin:12px;color:#1d4ed8'; panel.append(a);
    }
    target.append(panel); return panel;
  }
};

export { deviceAI, decide, createHandoff, normalizeRequest, validateOutput };
