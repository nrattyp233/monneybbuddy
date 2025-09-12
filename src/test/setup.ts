import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';

// Mock leaflet and react-leaflet to avoid DOM issues in tests
vi.mock('leaflet', () => ({
  map: vi.fn(),
  tileLayer: vi.fn(),
  marker: vi.fn(),
  circle: vi.fn(),
  polygon: vi.fn(),
  Icon: {
    Default: {
      mergeOptions: vi.fn(),
    },
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => React.createElement('div', { 'data-testid': 'map-container' }, children),
  TileLayer: () => React.createElement('div', { 'data-testid': 'tile-layer' }),
  Circle: () => React.createElement('div', { 'data-testid': 'circle' }),
  FeatureGroup: ({ children }: any) => React.createElement('div', { 'data-testid': 'feature-group' }, children),
  useMap: vi.fn(() => ({
    flyTo: vi.fn(),
  })),
}));

vi.mock('react-leaflet-draw', () => ({
  EditControl: () => React.createElement('div', { 'data-testid': 'edit-control' }),
}));

// Mock global for any missing globals
global.L = {
  map: vi.fn(),
  tileLayer: vi.fn(),
  marker: vi.fn(),
  circle: vi.fn(),
  polygon: vi.fn(),
};