// Drobné pomůcky pro tvorbu DOM bez frameworku.

/**
 * h('button', { class: 'btn', onclick: fn }, 'Text', childEl)
 * Atributy začínající „on“ jsou posluchače událostí, „dataset“ a „style“ jako objekty.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

/** Pole <option> ze seznamu [hodnota, popisek]. */
export function options(list, selected) {
  return list.map(([v, label]) => h('option', { value: v, selected: String(v) === String(selected) }, label));
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Stáhne text jako soubor. */
export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Načte obrázek, zmenší ho (max. rozměr) a vrátí data URL – logo nezabere moc místa v localStorage. */
export function imageToDataUrl(file, maxPx = 600) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Soubor není obrázek.'));
      img.onload = () => {
        if (file.type === 'image/svg+xml' && String(r.result).length < 200000) {
          resolve(String(r.result));
          return;
        }
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        // Fotky (JPEG) zůstanou JPEG, ostatní PNG kvůli průhlednosti
        resolve(file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png'));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}
