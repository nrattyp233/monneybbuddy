export interface Account {
  id: string;
  name: string; // "My Visa Card"
  provider: string; // "Visa"
  type: string; // 'checking', 'savings', etc.
  balance: number | null;
  logo?: string; // Optional: base64 data URI
}

export enum TransactionStatus {
  PENDING = 'Pending',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
  RETURNED = 'Returned',
  LOCKED = 'Locked',
  DECLINED = 'Declined',
}

export interface GeoFence {
  geoJson: any; // GeoJSON object representing the drawn shape
  locationName: string;
}

export interface TimeRestriction {
  expiresAt: Date;
}

export interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'lock' | 'penalty' | 'request' | 'fee';
  amount: number;
  from_details: string;
  to_details: string;
  date: Date;
  status: TransactionStatus;
  geoFence?: GeoFence;
  timeRestriction?: TimeRestriction;
  description: string;
  paypal_order_id?: string;
  fee?: number;
}

export interface LockedSaving {
  id: string;
  accountId: string;
  amount: number;
  lockPeriodMonths: number;
  startDate: Date;
  endDate: Date;
  status: 'Pending' | 'Locked' | 'Withdrawn' | 'Failed';
  paypal_order_id?: string;
}

export interface User {
    name: string;
    email: string;
}

// New Theme Types
export interface PanelTheme {
    bg: string;
    border: string;
    heading: string;
}

export interface ThemeColors {
    primaryActionBg: string;
    primaryActionText: string;
    highlight: string;
    highlightSecondary: string;
    modalBg: string;
    modalTitle: string;
    tabActiveBg: string;
    tabActiveText: string;
}

export interface Theme {
    id: string;
    name: string;
    gradient: string;
    colors: ThemeColors;
    panels: {
        balance: PanelTheme;
        send: PanelTheme;
        lock: PanelTheme;
        history: PanelTheme;
        security: PanelTheme;
    };
}