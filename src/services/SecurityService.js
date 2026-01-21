/**
 * Service de sécurité - CSRF, Rate limiting, Token management
 */

class SecurityService {
  constructor() {
    this.csrfToken = null;
    this.rateLimits = new Map(); // Map<key, {count, resetTime}>
  }

  /**
   * Générer un token CSRF
   */
  generateCSRFToken() {
    const token = this.generateRandomToken(32);
    this.csrfToken = token;
    sessionStorage.setItem('csrf_token', token);
    return token;
  }

  /**
   * Valider un token CSRF
   */
  validateCSRFToken(token) {
    const storedToken = sessionStorage.getItem('csrf_token');
    return token && storedToken && token === storedToken;
  }

  /**
   * Obtenir le token CSRF actuel (ou en créer un)
   */
  getCSRFToken() {
    if (!this.csrfToken) {
      const stored = sessionStorage.getItem('csrf_token');
      if (stored) {
        this.csrfToken = stored;
      } else {
        this.generateCSRFToken();
      }
    }
    return this.csrfToken;
  }

  /**
   * Générer un token aléatoire sécurisé
   */
  generateRandomToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Rate limiting - Vérifier si une action est autorisée
   * @param {string} key - Clé unique (ex: 'auth:login:user@example.com')
   * @param {number} maxAttempts - Nombre maximum de tentatives
   * @param {number} windowMs - Fenêtre de temps en ms
   */
  checkRateLimit(key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const limit = this.rateLimits.get(key);

    if (!limit) {
      // Première tentative
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    // Vérifier si la fenêtre est expirée
    if (now > limit.resetTime) {
      // Réinitialiser
      this.rateLimits.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, remaining: maxAttempts - 1 };
    }

    // Vérifier le nombre de tentatives
    if (limit.count >= maxAttempts) {
      const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        message: `Trop de tentatives. Réessayez dans ${retryAfter} secondes.`
      };
    }

    // Incrémenter le compteur
    limit.count++;
    return {
      allowed: true,
      remaining: maxAttempts - limit.count
    };
  }

  /**
   * Réinitialiser un rate limit
   */
  resetRateLimit(key) {
    this.rateLimits.delete(key);
  }

  /**
   * Nettoyer les rate limits expirés (à appeler périodiquement)
   */
  cleanExpiredRateLimits() {
    const now = Date.now();
    for (const [key, limit] of this.rateLimits.entries()) {
      if (now > limit.resetTime) {
        this.rateLimits.delete(key);
      }
    }
  }

  /**
   * Vérifier la force d'un mot de passe
   */
  checkPasswordStrength(password) {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };

    const score = Object.values(checks).filter(Boolean).length;

    let strength = 'weak';
    if (score >= 5) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return {
      score,
      strength,
      checks,
      message: this.getPasswordStrengthMessage(strength)
    };
  }

  /**
   * Message de force de mot de passe
   */
  getPasswordStrengthMessage(strength) {
    const messages = {
      weak: 'Mot de passe faible - ajoutez majuscules, chiffres et caractères spéciaux',
      medium: 'Mot de passe moyen - ajoutez plus de variété',
      strong: 'Mot de passe fort ✓'
    };
    return messages[strength] || '';
  }

  /**
   * Protéger une fonction avec rate limiting
   */
  withRateLimit(fn, key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    return async (...args) => {
      const limit = this.checkRateLimit(key, maxAttempts, windowMs);

      if (!limit.allowed) {
        throw new Error(limit.message || 'Rate limit exceeded');
      }

      try {
        const result = await fn(...args);
        // Succès - réinitialiser le compteur
        this.resetRateLimit(key);
        return result;
      } catch (error) {
        // Erreur - conserver le compteur
        throw error;
      }
    };
  }

  /**
   * Détecter des patterns d'attaque (patterns simples)
   */
  detectSuspiciousActivity(input) {
    const suspiciousPatterns = [
      // SQL Injection
      /(\bOR\b|\bAND\b).*[=<>]/i,
      /UNION.*SELECT/i,
      /DROP\s+TABLE/i,
      /INSERT\s+INTO/i,
      /DELETE\s+FROM/i,

      // XSS
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,
      /<iframe/gi,

      // Path traversal
      /\.\.\//g,
      /\.\.\\/g,

      // Command injection
      /;\s*(ls|cat|rm|wget|curl|nc|bash)/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        console.warn('Suspicious activity detected:', pattern, input.substring(0, 100));
        return true;
      }
    }

    return false;
  }

  /**
   * Logger les événements de sécurité
   */
  logSecurityEvent(event, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      ...details,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.warn('[SECURITY]', logEntry);

    // TODO: Envoyer au backend pour analyse
    // Sauvegarder temporairement en localStorage
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    logs.push(logEntry);

    // Garder seulement les 100 derniers événements
    if (logs.length > 100) {
      logs.shift();
    }

    localStorage.setItem('security_logs', JSON.stringify(logs));
  }

  /**
   * Obtenir les logs de sécurité
   */
  getSecurityLogs() {
    return JSON.parse(localStorage.getItem('security_logs') || '[]');
  }

  /**
   * Effacer les logs de sécurité
   */
  clearSecurityLogs() {
    localStorage.removeItem('security_logs');
  }
}

// Singleton
export { SecurityService };
export const securityService = new SecurityService();

// Nettoyer les rate limits expirés toutes les 5 minutes
setInterval(() => {
  securityService.cleanExpiredRateLimits();
}, 5 * 60 * 1000);
