import { describe, expect, it } from 'vitest';
import { createReviewCsv, validateFarmInputReview, type FarmInputReview } from '../src/review';

const validReview: FarmInputReview = {
  id: 'review-1',
  createdAt: '2026-08-21T00:00:00.000Z',
  contactName: 'Alex Farmer',
  email: 'alex@example.com',
  phone: '0400 000 000',
  propertyName: 'Gumtree Farm',
  region: 'Riverina',
  state: 'NSW',
  postcode: '2680',
  farmingSystem: 'Broadacre',
  totalHectares: 500,
  currentInputs: 'Current program summary',
  mainConstraint: 'Input efficiency',
  soilTestAvailability: 'available',
  preferredContact: 'email',
  notes: '',
};

describe('Farm Input Review brief', () => {
  it('validates the required conversion fields', () => {
    expect(validateFarmInputReview(validReview)).toEqual([]);
    expect(validateFarmInputReview({ ...validReview, email: '' })).toContain(
      'Add an email address for email contact.',
    );
  });

  it('creates a portable CSV brief', () => {
    const csv = createReviewCsv(validReview);
    expect(csv).toContain('"Property or business","Gumtree Farm"');
    expect(csv).toContain('"Hectares under review","500"');
    expect(csv).toContain('"Main constraint","Input efficiency"');
  });
});
