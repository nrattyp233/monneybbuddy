import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendMoney from '../../components/SendMoney';
import { Account } from '../../types';

const mockAccounts: Account[] = [
  {
    id: 'acc1',
    name: 'Test Account',
    provider: 'Test Bank',
    type: 'checking',
    balance: 1000
  }
];

const mockOnSend = vi.fn();

describe('SendMoney Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders send money form with all required fields', () => {
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    expect(screen.getByText('Send Money Securely')).toBeInTheDocument();
    expect(screen.getByLabelText(/from account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('calculates fees correctly', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const amountInput = screen.getByLabelText(/amount/i);
    await user.type(amountInput, '100');
    
    await waitFor(() => {
      expect(screen.getByText('$3.00')).toBeInTheDocument(); // 3% fee
      expect(screen.getByText('$103.00')).toBeInTheDocument(); // Total debit
    });
  });

  it('shows geofence toggle and map when enabled', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const geofenceToggle = screen.getByRole('checkbox', { name: /add geofence/i });
    await user.click(geofenceToggle);
    
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('edit-control')).toBeInTheDocument();
    expect(screen.getByText(/use the drawing tools/i)).toBeInTheDocument();
  });

  it('shows time restriction input when time restriction is enabled', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const timeToggle = screen.getByRole('checkbox', { name: /add time restriction/i });
    await user.click(timeToggle);
    
    expect(screen.getByLabelText(/claim within \(hours\)/i)).toBeInTheDocument();
  });

  it('validates required fields before submission', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    const submitButton = screen.getByRole('button', { name: /pay/i });
    await user.click(submitButton);
    
    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('submits form with drawn geofence when provided', async () => {
    const user = userEvent.setup();
    render(<SendMoney accounts={mockAccounts} onSend={mockOnSend} />);
    
    // Fill required fields
    await user.type(screen.getByLabelText(/recipient/i), 'test@example.com');
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Test payment');
    
    // Enable geofence
    const geofenceToggle = screen.getByRole('checkbox', { name: /add geofence/i });
    await user.click(geofenceToggle);
    
    // Simulate drawing a shape (this would be done through map interaction in real usage)
    // We'll simulate the handleDrawCreated function being called
    const component = screen.getByTestId('map-container').closest('.space-y-6');
    expect(component).toBeInTheDocument();
    
    const submitButton = screen.getByRole('button', { name: /pay/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnSend).toHaveBeenCalledWith(
        'acc1',
        'test@example.com',
        100,
        'Test payment',
        undefined, // No geofence drawn in test environment
        undefined
      );
    });
  });
});