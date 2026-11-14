import { describe, expect, it } from 'vitest';
import {
  buildProductRecommendation,
  combineProductRecommendationFollowUp,
  getProductRecommendationCandidates,
  parseProductRecommendationIntent,
  validateProductRecommendationSelection,
  type RecommendationActivity,
} from '../product-recommendations';

const activities: RecommendationActivity[] = [
  {
    id: 'family-penang', name: 'Penang Family Park', category: 'Activity', categorySlug: 'activity',
    description: 'A family-friendly outdoor attraction', price: 80, rating: 4.8, reviews: 40,
    isFamilyFriendly: true, place: { state: 'Penang' }, outlet: { city: 'George Town', state: 'Penang' },
  },
  {
    id: 'food-kl', name: 'Local Food Tour', category: 'Food', categorySlug: 'food',
    description: 'A guided local food walk', price: 60, rating: 4.6, reviews: 30,
    isFamilyFriendly: false, place: null, outlet: { city: 'Kuala Lumpur', state: 'Kuala Lumpur' },
  },
  {
    id: 'inactive-expensive', name: 'Luxury Water Park', category: 'Activity', categorySlug: 'activity',
    description: 'Family friendly', price: 250, rating: 5, reviews: 500,
    isFamilyFriendly: true, place: { state: 'Penang' }, outlet: { city: 'Penang', state: 'Penang' },
  },
  {
    id: 'beach-penang', name: 'Penang Beach Learning Walk', category: 'Activity', categorySlug: 'activity',
    description: 'A family beach nature activity', price: 70, rating: 3.9, reviews: 6,
    isFamilyFriendly: true, place: { state: 'Penang' }, outlet: { city: 'Penang', state: 'Penang' },
  },
];

describe('product recommendation input', () => {
  it('recognizes a mixed-language product recommendation and extracts supported filters', () => {
    expect(parseProductRecommendationIntent('推荐几个适合小孩的 Penang 活动，RM100以内')).toEqual({
      category: 'activity', state: 'Penang', familyFriendlyOnly: true, priceMax: 100,
    });
  });

  it('returns no intent for an ordinary support question', () => {
    expect(parseProductRecommendationIntent('我的订单确认了吗？')).toBeNull();
  });

  it('keeps the original recommendation request when the user types a clarification answer', () => {
    expect(combineProductRecommendationFollowUp('推荐一些适合小孩的商品', '户外活动')).toBe('推荐一些适合小孩的商品 户外活动');
  });
});

describe('product recommendation candidates', () => {
  it('asks for a category when the request has no key product category', () => {
    expect(buildProductRecommendation('给我推荐一下', activities)).toMatchObject({
      kind: 'clarification',
      question: 'category',
      options: ['food', 'activity', 'accommodation', 'retail'],
    });
  });

  it('filters by category, location, family suitability, and budget using catalogue facts', () => {
    expect(buildProductRecommendation('推荐Penang适合小孩的活动，RM100以内', activities)).toMatchObject({
      kind: 'results',
      products: [
        { id: 'family-penang', price: 80, state: 'Penang' },
        { id: 'beach-penang', price: 70, state: 'Penang' },
      ],
    });
  });

  it('ranks a textually relevant real product ahead of a higher-rated generic match', () => {
    const filters = parseProductRecommendationIntent('Recommend a family beach activity in Penang under RM100');
    expect(filters).not.toBeNull();
    expect(getProductRecommendationCandidates(filters!, activities, 'Recommend a family beach activity in Penang under RM100')[0].id)
      .toBe('beach-penang');
  });

  it('returns a recoverable empty result instead of relaxing user filters silently', () => {
    expect(buildProductRecommendation('推荐Penang适合小孩的活动，RM50以内', activities)).toMatchObject({
      kind: 'no-results',
      category: 'activity',
    });
  });

  it('accepts only unique product ids from the supplied candidate list', () => {
    expect(validateProductRecommendationSelection({
      suggestions: [
        { productId: 'family-penang' },
        { productId: 'family-penang' },
        { productId: 'not-in-catalogue' },
      ],
    }, [{ id: 'family-penang' }])).toEqual(['family-penang']);
  });
});
