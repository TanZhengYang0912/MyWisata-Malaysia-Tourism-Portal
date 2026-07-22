import { describe, expect, it } from 'vitest';
import { bioSchema, preferenceSurveySchema } from '../profile-schemas';

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

describe('bioSchema', () => {
  it('requires the teacher-approved 30 to 200 character range', () => {
    expect(() => bioSchema.parse({ bio: 'Too short bio' })).toThrow();
    expect(bioSchema.parse({ bio: 'A local guide who enjoys sharing practical travel tips and authentic food discoveries.' }).bio).toHaveLength(86);
    expect(() => bioSchema.parse({ bio: 'x'.repeat(201) })).toThrow();
  });
});
