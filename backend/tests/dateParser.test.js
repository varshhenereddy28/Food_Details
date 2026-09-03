import { describe, expect, it } from 'vitest';
import { extractDates } from '../src/dateParser.js';

describe('food label date parser', () => {
  it.each([
    ['EXP 12/2026', '2026-12-01'], ['Best Before 05 DEC 26', '2026-12-05'], ['MFD: 03-09-2026', '2026-09-03'],
    ['USE BY 2026.12.05', '2026-12-05'], ['PKD 01/02/24', '2024-02-01'], ['EXPIRY 31/01/25', '2025-01-31'],
    ['MFG 2024-03-04', '2024-03-04'], ['BEST BEFORE MAR 9 2027', '2027-03-09'], ['USE BY 7.8.26', '2026-08-07'],
    ['EXP 01-2030', '2030-01-01'], ['MFD 15 AUG 2023', '2023-08-15'], ['EXP 2025/11/30', '2025-11-30'],
    ['MANUFACTURED 22.02.24', '2024-02-22'], ['BEST BEFORE 09-2028', '2028-09-01'], ['MFG 2023.1.2', '2023-01-02']
  ])('parses %s', (text, expected) => expect(extractDates(text).candidates[0].date).toBe(expected));
  it('disambiguates unlabelled dates by order', () => expect(extractDates('01/01/24 01/01/25')).toMatchObject({ manufacturing:'2024-01-01', expiry:'2025-01-01' }));
});
