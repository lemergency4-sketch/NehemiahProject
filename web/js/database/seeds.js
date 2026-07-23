// web/js/database/seeds.js
// Centralized seed data for Nehemiah Project — Treasury Pilot

export const MEETINGS = [
  'Sunday Glory Service',
  'Tent of Meeting',
  'Truth & Power Bible Study',
  'Prayer & Fasting',
  'General Ministry',
  'Conference',
  'Crusade',
  'Leadership Meeting',
  'Training & Equipping'
];

export const CATEGORIES = {
  giving: [
    'Tithes',
    'Offerings',
    'Love Offerings',
    'Missions Fund',
    'Kingdom Advance Partnership (KAP)',
    'Product Sales',
    'Donations',
    'First Fruits',
    'Thanksgiving Offering',
    'Other Giving'
  ],
  expense: [
    'Missions',
    'Sunday Service',
    'Conferences',
    'Crusades',
    'Stipends',
    'Administration',
    'Utilities',
    'Hospitality',
    'Transport',
    'Media & Production',
    'Benevolence',
    'Other Expenses'
  ]
};

export const PAYMENT_METHODS = [
  'Cash',
  'M-Pesa',
  'Bank Transfer',
  'PayPal',
  'Card',
  'Digital Wallet',
  'Cryptocurrency',
  'Property'
];

export const CURRENCIES = [
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', isDefault: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', isDefault: false },
  { code: 'UGX', name: 'Ugandan Shilling', symbol: 'UGX', isDefault: false },
  { code: 'GBP', name: 'British Pound', symbol: '£', isDefault: false },
  { code: 'EUR', name: 'Euro', symbol: '€', isDefault: false },
  { code: 'Property', name: 'Property', symbol: 'PROP', isDefault: false },
  { code: 'Digital Currency', name: 'Digital Currency', symbol: 'DIG', isDefault: false }
];

export const FUNDS = [
  'General Fund',
  'Missions Fund',
  'Building Fund',
  'Kingdom Advance Partnership (KAP)',
  'Benevolence Fund',
  'Conference Fund'
];
