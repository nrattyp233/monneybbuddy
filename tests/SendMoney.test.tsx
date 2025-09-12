import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendMoney from '../components/SendMoney';
import { Account } from '../types';

// Mock react-leaflet and leaflet-draw dependencies
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  FeatureGroup: ({ children }: any) => <div data-testid="feature-group">{children}</div>,
  useMap: () => ({
    flyTo: vi.fn(),
  }),
}));

vi.mock('react-leaflet-draw', () => ({
  EditControl: ({ onCreated, onDeleted }: any) => (
    <div data-testid="edit-control">
      <button
        data-testid="draw-circle"
        onClick={() => {
          const mockLayer = {
            toGeoJSON: () => ({
              type: 'Feature',
              geometry: {
                type: 'Circle',
                coordinates: [-74.0060, 40.7128],
                radius: 500
              }
            }),
            getBounds: () => ({
              getCenter: () => ({ lat: 40.7128, lng: -74.0060 })
            })
          };
          onCreated({ layer: mockLayer });
        }}
      >
        Draw Circle
      </button>
      <button
        data-testid="delete-shape"
        onClick={() => onDeleted()}
      >
        Delete Shape
      </button>
    </div>
  ),
}));

// Mock leaflet CSS import
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({}));

const mockAccounts: Account[] = [
  {
    id: 'acc1',
    name: 'Test Checking',
    provider: 'Test Bank',
    type: 'checking',
    balance: 1000,
  },
  {
    id: 'acc2',
    name: 'Test Savings',
    provider: 'Test Bank',
    type: 'savings',
    balance: 5000,
  },
];

const mockOnSend = vi.fn();

describe('SendMoney Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the send money form with all required fields', () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    expect(screen.getByLabelText(/from account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByText(/add geofence/i)).toBeInTheDocument();
    expect(screen.getByText(/add time restriction/i)).toBeInTheDocument();
  });

  it('calculates transaction fee correctly at 3%', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    const amountInput = screen.getByLabelText(/amount/i);
    await user.type(amountInput, '100');

    await waitFor(() => {
      expect(screen.getByText('$3.00')).toBeInTheDocument(); // 3% fee
      expect(screen.getByText('$103.00')).toBeInTheDocument(); // Total debit
    });
  });

  it('shows validation alert for empty required fields', async () => {
    window.alert = vi.fn();
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    const submitButton = screen.getByRole('button', { name: /pay \$0\.00/i });
    await user.click(submitButton);

    expect(window.alert).toHaveBeenCalledWith('Please fill all required fields correctly.');
  });

  it('shows geofence drawing interface when geofence toggle is enabled', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    // Get all checkboxes and select the first one (geofence toggle)
    const checkboxes = screen.getAllByRole('checkbox');
    const geofenceToggle = checkboxes[0];
    await user.click(geofenceToggle);

    // Map container should be visible
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
      expect(screen.getByTestId('edit-control')).toBeInTheDocument();
    });

    // Should show instruction text
    expect(screen.getByText(/use the drawing tools on the map/i)).toBeInTheDocument();
  });

  it('handles geofence drawing and deletion', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        display_name: 'New York, NY, USA'
      })
    });

    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    // Enable geofence (first checkbox)
    const checkboxes = screen.getAllByRole('checkbox');
    const geofenceToggle = checkboxes[0];
    await user.click(geofenceToggle);

    // Draw a shape
    const drawButton = screen.getByTestId('draw-circle');
    await user.click(drawButton);

    await waitFor(() => {
      expect(screen.getByText(/geofence area defined/i)).toBeInTheDocument();
    });

    // Delete the shape
    const deleteButton = screen.getByTestId('delete-shape');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText(/geofence area defined/i)).not.toBeInTheDocument();
    });
  });

  it('shows time restriction input when time restriction toggle is enabled', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    // Time restriction toggle should be the second checkbox
    const toggles = screen.getAllByRole('checkbox');
    const timeToggle = toggles[1];
    await user.click(timeToggle);

    await waitFor(() => {
      expect(screen.getByLabelText(/claim within.*hours/i)).toBeInTheDocument();
    });
  });

  it('submits transaction with geofence when drawing is enabled', async () => {
    const user = userEvent.setup();
    
    // Mock fetch for location lookup
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        display_name: 'New York, NY, USA'
      })
    });
    
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    // Fill required fields
    await user.type(screen.getByLabelText(/recipient/i), 'test@example.com');
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Test payment');

    // Enable geofence (this enables the feature)
    const checkboxes = screen.getAllByRole('checkbox');
    const geofenceToggle = checkboxes[0];
    await user.click(geofenceToggle);

    // Wait for the drawing interface to appear
    await waitFor(() => {
      expect(screen.getByTestId('edit-control')).toBeInTheDocument();
    });

    // Simulate drawing by directly triggering the mock (testing the UI flow)
    const drawButton = screen.getByTestId('draw-circle');
    await user.click(drawButton);

    // Wait for the geofence confirmation to appear
    await waitFor(() => {
      expect(screen.getByText(/geofence area defined/i)).toBeInTheDocument();
    });

    // Submit form
    const submitButton = screen.getByRole('button', { name: /pay \$\d+\.\d+/i });
    await user.click(submitButton);

    // Verify the function was called (check that it includes geofence data)
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledTimes(1);
      const callArgs = mockOnSend.mock.calls[0];
      expect(callArgs[0]).toBe('acc1'); // from account
      expect(callArgs[1]).toBe('test@example.com'); // recipient
      expect(callArgs[2]).toBe(50); // amount
      expect(callArgs[3]).toBe('Test payment'); // description
      expect(callArgs[4]).toBeDefined(); // geofence should be defined
      expect(callArgs[4]).toHaveProperty('geometry');
      expect(callArgs[4]).toHaveProperty('locationName');
      expect(callArgs[5]).toBeUndefined(); // no time restriction
    });
  });

  it('submits transaction with time restriction', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);

    // Fill required fields
    await user.type(screen.getByLabelText(/recipient/i), 'test@example.com');
    await user.type(screen.getByLabelText(/amount/i), '25');
    await user.type(screen.getByLabelText(/description/i), 'Test with time limit');

    // Enable time restriction
    const timeToggle = screen.getAllByRole('checkbox')[1];
    await user.click(timeToggle);

    // Change hours
    const hoursInput = screen.getByLabelText(/claim within.*hours/i);
    await user.clear(hoursInput);
    await user.type(hoursInput, '12');

    // Submit form
    const submitButton = screen.getByRole('button', { name: /pay \$\d+\.\d+/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(
        'acc1',
        'test@example.com',
        25,
        'Test with time limit',
        undefined, // no geofence
        expect.objectContaining({
          expiresAt: expect.any(Date)
        })
      );

      // Verify the expiry date is approximately 12 hours from now
      const timeRestriction = mockOnSend.mock.calls[0][5];
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const actualExpiry = timeRestriction.expiresAt;
      
      // Allow 1 minute tolerance
      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(60000);
    });
  });
});