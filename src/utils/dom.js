/**
 * Helpers DOM - Simplifier la création d'éléments
 */

/**
 * Créer un élément avec attributs et enfants
 * @param {string} tag - Nom de la balise
 * @param {object} attrs - Attributs et propriétés
 * @param {Array|string} children - Enfants ou texte
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  // Appliquer les attributs
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      // Event listeners
      const event = key.slice(2).toLowerCase();
      element.addEventListener(event, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else {
      element.setAttribute(key, value);
    }
  });

  // Ajouter les enfants
  if (typeof children === 'string' || typeof children === 'number') {
    element.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach(child => {
      if (child instanceof HTMLElement) {
        element.appendChild(child);
      } else if (typeof child === 'string' || typeof child === 'number') {
        element.appendChild(document.createTextNode(child));
      }
    });
  } else if (children instanceof HTMLElement) {
    element.appendChild(children);
  }

  return element;
}

/**
 * Sélectionner un élément
 */
export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * Sélectionner plusieurs éléments
 */
export function $$(selector, parent = document) {
  return Array.from(parent.querySelectorAll(selector));
}

/**
 * Vider un élément
 */
export function empty(element) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (element) {
    element.innerHTML = '';
  }
  return element;
}

/**
 * Afficher/masquer un élément
 */
export function toggle(element, show) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return;

  if (show === undefined) {
    element.style.display = element.style.display === 'none' ? '' : 'none';
  } else {
    element.style.display = show ? '' : 'none';
  }
}

/**
 * Ajouter/retirer une classe
 */
export function toggleClass(element, className, add) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return;

  if (add === undefined) {
    element.classList.toggle(className);
  } else {
    element.classList.toggle(className, add);
  }
}

/**
 * Animer l'apparition d'un élément
 */
export function fadeIn(element, duration = 200) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return;

  element.style.opacity = '0';
  element.style.display = '';
  element.style.transition = `opacity ${duration}ms`;

  requestAnimationFrame(() => {
    element.style.opacity = '1';
  });
}

/**
 * Animer la disparition d'un élément
 */
export function fadeOut(element, duration = 200) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return;

  element.style.transition = `opacity ${duration}ms`;
  element.style.opacity = '0';

  setTimeout(() => {
    element.style.display = 'none';
  }, duration);
}

/**
 * Délégation d'événements
 */
export function delegate(parent, selector, event, handler) {
  if (typeof parent === 'string') {
    parent = $(parent);
  }
  if (!parent) return;

  parent.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target) {
      handler.call(target, e);
    }
  });
}

/**
 * Debounce une fonction
 */
export function debounce(fn, delay = 300) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle une fonction
 */
export function throttle(fn, delay = 300) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

/**
 * Copier du texte dans le presse-papier
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // Fallback pour les anciens navigateurs
    const textarea = el('textarea', {
      value: text,
      style: {
        position: 'absolute',
        left: '-9999px'
      }
    });
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

/**
 * Télécharger un fichier
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = el('a', {
    href: url,
    download: filename,
    style: { display: 'none' }
  });

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Obtenir les données d'un formulaire
 */
export function getFormData(form) {
  if (typeof form === 'string') {
    form = $(form);
  }
  if (!form) return {};

  const formData = new FormData(form);
  const data = {};

  for (const [key, value] of formData.entries()) {
    // Gérer les champs multiples (checkboxes)
    if (data[key]) {
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(value);
    } else {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Scroller vers un élément
 */
export function scrollTo(element, options = {}) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return;

  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
    ...options
  });
}

/**
 * Vérifier si un élément est visible
 */
export function isVisible(element) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return false;

  return element.offsetWidth > 0 || element.offsetHeight > 0;
}

/**
 * Obtenir la position d'un élément
 */
export function getPosition(element) {
  if (typeof element === 'string') {
    element = $(element);
  }
  if (!element) return { top: 0, left: 0, width: 0, height: 0 };

  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height
  };
}

/**
 * Attendre un délai
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exécuter une fonction au prochain repaint
 */
export function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}
