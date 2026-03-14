export const SECOND_HAND_CATEGORIES = ['SH Battery', 'SH Inverter'] as const;

export type SecondHandCategory = (typeof SECOND_HAND_CATEGORIES)[number];

export const SECOND_HAND_TRANSACTION_TYPES = ['SALE', 'RENT_OUT', 'GOOD_WILL'] as const;

export type SecondHandTransactionType = (typeof SECOND_HAND_TRANSACTION_TYPES)[number];

export const SECOND_HAND_LIFECYCLE_STATUSES = ['SOLD', 'ACTIVE', 'PARTIALLY_RETURNED', 'RETURNED'] as const;

export type SecondHandLifecycleStatus = (typeof SECOND_HAND_LIFECYCLE_STATUSES)[number];

export const SECOND_HAND_TRANSACTION_LABELS: Record<SecondHandTransactionType, string> = {
  SALE: 'Sale (Second Hand)',
  RENT_OUT: 'Rent Out (Second Hand)',
  GOOD_WILL: 'Good Will (Second Hand)',
};

export const SECOND_HAND_STATUS_LABELS: Record<SecondHandLifecycleStatus, string> = {
  SOLD: 'Sold',
  ACTIVE: 'Out',
  PARTIALLY_RETURNED: 'Partially Returned',
  RETURNED: 'Returned',
};

export const isSecondHandCategory = (category: string | null | undefined): category is SecondHandCategory =>
  SECOND_HAND_CATEGORIES.includes(category as SecondHandCategory);
