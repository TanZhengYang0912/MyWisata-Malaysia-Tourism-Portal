import { describe, expect, it } from 'vitest';
import { preferenceSurveySchema } from '../profile-schemas';

const validSurvey = {
  interests: ['food'], travelStyle: 'couple', budgetRange: 'mid_range', mobilityNeeds: 'none', preferredDistance: 'nearby',
};

describe('preferenceSurveySchema', () => {
  it('accepts a supported preferred distance', () => {
    expect(preferenceSurveySchema.parse(validSurvey).preferredDistance).toBe('nearby');
  });

  it('rejects an arbitrary preferred distance', () => {
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, preferredDistance: '3km' })).toThrow();
  });
});
