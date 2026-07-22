import { describe, expect, it } from 'vitest';
import { bioSchema, preferenceSurveySchema } from '../profile-schemas';

const validSurvey = {
  interests: ['food'], travelStyle: 'mid_range', budgetRange: 'mid_range', mobilityNeeds: 'none', preferredRadiusKm: 5,
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
});

describe('bioSchema', () => {
  it('requires the teacher-approved 30 to 200 character range', () => {
    expect(() => bioSchema.parse({ bio: 'Too short bio' })).toThrow();
    expect(bioSchema.parse({ bio: 'A local guide who enjoys sharing practical travel tips and authentic food discoveries.' }).bio).toHaveLength(86);
    expect(() => bioSchema.parse({ bio: 'x'.repeat(201) })).toThrow();
  });
});
