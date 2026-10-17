import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/save/settings';

describe('réglages', () => {
  it('qualité haute par défaut, anciens réglages « moyenne » passés en haute une seule fois', () => {
    expect(DEFAULT_SETTINGS.quality).toBe('high');
    expect(sanitizeSettings({ quality: 'medium' }).quality).toBe('high');
    expect(sanitizeSettings({ quality: 'low' }).quality).toBe('low');
    // un choix « moyenne » fait après la migration est respecté
    expect(sanitizeSettings({ quality: 'medium', version: 2 }).quality).toBe('medium');
    expect(sanitizeSettings({ quality: 'ultra' }).quality).toBe('high');
  });
});
