import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import SendMoney from '../components/SendMoney';
import { Account } from '../types';

// Mock accounts data
const mockAccounts: Account[] = [
  {
    id: 'acc1',
    name: 'Test Account',
    provider: 'Test Bank',
    type: 'checking',
    balance: 1000,
  },
];

describe('SendMoney Component', () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    mockOnSend.mockReset();
  });

  test('renders send money form correctly', () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    expect(screen.getByText('Send Money Securely')).toBeInTheDocument();
    expect(screen.getByLabelText(/from account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  test('calculates fees correctly', async () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.change(amountInput, { target: { value: '100' } });
    
    await waitFor(() => {
      expect(screen.getByText('$3.00')).toBeInTheDocument(); // 3% fee
      expect(screen.getByText('$103.00')).toBeInTheDocument(); // Total
    });
  });

  test('shows geofence drawing controls when enabled', () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const geofenceToggle = screen.getByLabelText(/add geofence/i);
    fireEvent.click(geofenceToggle);
    
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('edit-control')).toBeInTheDocument();
    expect(screen.getByText(/use the drawing tools to create a geofence area/i)).toBeInTheDocument();
  });

  test('submits form with geofence data when drawn', async () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    // Fill form
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test payment' } });
    
    // Enable geofence using the specific toggle
    const geofenceToggle = screen.getByLabelText(/add geofence/i);
    fireEvent.click(geofenceToggle);
    
    // Simulate drawing by clicking the edit control
    const editControl = screen.getByTestId('edit-control');
    fireEvent.click(editControl);
    
    // Submit form
    const submitButton = screen.getByRole('button', { name: /pay \$51\.50/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(
        'acc1',
        'test@example.com',
        50,
        'Test payment',
        expect.objectContaining({
          latitude: 40.7128,
          longitude: -74.0060,
          shape: 'circle',
          locationName: 'Drawn Circle'
        }),
        undefined
      );
    });
  });

  test('prevents submission with insufficient funds', async () => {
    const poorAccount: Account[] = [
      { ...mockAccounts[0], balance: 10 }
    ];
    
    // Mock window.alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    
    render(<SendMoney accounts={poorAccount} onSend={mockOnSend} />);
    
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test payment' } });
    
    const submitButton = screen.getByRole('button', { name: /pay \$103\.00/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Insufficient funds to cover the amount and transaction fee.');
      expect(mockOnSend).not.toHaveBeenCalled();
    });
    
    alertSpy.mockRestore();
  });

  test('shows time restriction input when enabled', () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    // Find time restriction toggle by looking for the text and then the checkbox
    const timeToggle = screen.getByLabelText(/add time restriction/i);
    fireEvent.click(timeToggle);
    
    expect(screen.getByLabelText(/claim within \(hours\)/i)).toBeInTheDocument();
  });
});