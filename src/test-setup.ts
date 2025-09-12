import '@testing-library/jest-dom'
import { vi } from 'vitest'
import React from 'react'

// Mock leaflet and leaflet-draw
const MockCircle = function() {} as any;
const MockPolygon = function() {} as any;

(global as any).L = {
  Control: { Draw: vi.fn() },
  control: { layers: vi.fn() },
  Draw: {
    Event: {
      CREATED: 'draw:created',
      EDITED: 'draw:edited',
      DELETED: 'draw:deleted'
    }
  },
  Circle: MockCircle,
  Polygon: MockPolygon
};

// Mock react-leaflet components
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => React.createElement('div', { 'data-testid': 'map-container' }, children),
  TileLayer: () => React.createElement('div', { 'data-testid': 'tile-layer' }),
  FeatureGroup: ({ children }: any) => React.createElement('div', { 'data-testid': 'feature-group' }, children),
  Circle: () => React.createElement('div', { 'data-testid': 'circle' }),
  Polygon: () => React.createElement('div', { 'data-testid': 'polygon' }),
  useMap: () => ({
    flyTo: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })
}));

// Mock react-leaflet-draw
vi.mock('react-leaflet-draw', () => ({
  EditControl: ({ onCreated, onEdited, onDeleted }: any) => 
    React.createElement('div', {
      'data-testid': 'edit-control',
      onClick: () => {
        // Simulate drawing a circle - create a mock that matches L.Circle
        const mockLayer = {
          getLatLng: () => ({ lat: 40.7128, lng: -74.0060 }),
          getRadius: () => 5000
        };
        
        // Make it appear as an instance of L.Circle by setting a constructor property
        Object.defineProperty(mockLayer, 'constructor', {
          value: MockCircle,
          writable: false
        });
        
        const mockEvent = {
          layer: mockLayer
        };
        onCreated && onCreated(mockEvent);
      }
    })
}));

// Mock leaflet imports
vi.mock('leaflet', () => ({
  default: {},
  Circle: vi.fn(),
  Polygon: vi.fn()
}));

vi.mock('leaflet-draw', () => ({}));
