import { describe, expect, it } from 'vitest';
import { bioSchema, preferenceSurveySchema } from '../profile-schemas';

const validSurvey = {
  interests: ['food'], travelStyle: 'solo', budgetRange: 'mid_range', mobilityNeeds: 'none', preferredRadiusKm: 5,
};

describe('preferenceSurveySchema', () => {
  it('accepts a supported preferred radius', () => {
    expect(preferenceSurveySchema.parse(validSurvey).preferredRadiusKm).toBe(5);
  });

  it('rejects a non-numeric or out-of-range preferred radius', () => {
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, preferredRadiusKm: '3km' })).toThrow();
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, preferredRadiusKm: -1 })).toThrow();
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, preferredRadiusKm: 501 })).toThrow();
  });

  it('rejects an interest outside the shared category vocabulary', () => {
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, interests: ['skydiving'] })).toThrow();
  });

  it('requires a supported Travel Style and rejects group composition fields', () => {
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, travelStyle: 'mid_range' })).toThrow();
    expect(() => preferenceSurveySchema.parse({ ...validSurvey, groupComposition: ['solo'] })).toThrow();
  });
});

describe('bioSchema', () => {
  it.each([0, 2, 31, 200])('rejects a new or edited bio of %i characters', (length) => {
    expect(bioSchema.safeParse({ bio: 'x'.repeat(length) }).success).toBe(false);
  });

  it.each([3, 30])('accepts a required bio of %i characters', (length) => {
    expect(bioSchema.parse({ bio: 'x'.repeat(length) }).bio).toHaveLength(length);
  });

  it('trims whitespace and accepts a three-character Chinese bio', () => {
    expect(bioSchema.parse({ bio: '  爱旅行  ' }).bio).toBe('爱旅行');
    expect(bioSchema.safeParse({ bio: '    ' }).success).toBe(false);
  });
});
