export type SoilTestAvailability = 'available' | 'not-available' | 'unsure';
export type PreferredContact = 'phone' | 'email';

export interface FarmInputReview {
  id: string;
  createdAt: string;
  contactName: string;
  email: string;
  phone: string;
  propertyName: string;
  region: string;
  state: string;
  postcode: string;
  farmingSystem: string;
  totalHectares: number;
  currentInputs: string;
  mainConstraint: string;
  soilTestAvailability: SoilTestAvailability;
  preferredContact: PreferredContact;
  notes: string;
}

const csvCell = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;

export function validateFarmInputReview(review: FarmInputReview): string[] {
  const errors: string[] = [];
  if (!review.contactName) errors.push('Add a contact name.');
  if (!review.propertyName) errors.push('Add a property or business name.');
  if (!review.region) errors.push('Add the farm region.');
  if (review.totalHectares <= 0) errors.push('Enter the hectares under review.');
  if (!review.mainConstraint) errors.push('Describe the main soil or input constraint.');
  if (review.postcode && !/^\d{4}$/.test(review.postcode)) errors.push('Enter the postcode as four digits.');
  if (review.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(review.email)) errors.push('Enter a valid email address.');
  if (review.preferredContact === 'email' && !review.email) errors.push('Add an email address for email contact.');
  if (review.preferredContact === 'phone' && !review.phone) errors.push('Add a phone number for phone contact.');
  return errors;
}

export function createReviewCsv(review: FarmInputReview): string {
  const rows: Array<[string, string | number]> = [
    ['Contact name', review.contactName],
    ['Email', review.email],
    ['Phone', review.phone],
    ['Property or business', review.propertyName],
    ['Region', review.region],
    ['State', review.state],
    ['Postcode', review.postcode],
    ['Farming system', review.farmingSystem],
    ['Hectares under review', review.totalHectares],
    ['Current inputs or program', review.currentInputs],
    ['Main constraint', review.mainConstraint],
    ['Soil test availability', review.soilTestAvailability],
    ['Preferred contact', review.preferredContact],
    ['Additional notes', review.notes],
    ['Created at', review.createdAt],
  ];

  return ['Field,Value', ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)].join('\n');
}
