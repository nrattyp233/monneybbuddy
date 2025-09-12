import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendMoney from '../components/SendMoney';
import { Account } from '../types';

// Mock react-leaflet to avoid requiring a real map in JSDOM
vi.mock('react-leaflet', () => {
  return {
    MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
    TileLayer: () => null,
    Circle: () => null,
    useMap: () => ({ flyTo: () => {} }),
    useMapEvents: () => ({}),
  };
});

describe('SendMoney', () => {
  const accounts: Account[] = [
    { id: 'acc1', name: 'Checking', provider: 'Bank', type: 'bank', balance: 1000 },
    { id: 'acc2', name: 'Savings', provider: 'Bank', type: 'bank', balance: 500 },
  ];

  test('calculates fee and total, validates required fields, sends with time restriction, and toggles geofence', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(undefined);

    // Stub alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<SendMoney accounts={accounts} onSend={onSend} />);

  // Initially fee and total should be $0.00
  const initFeeRow = screen.getByText(/Transaction Fee \(3%\):/i).parentElement!;
  expect(within(initFeeRow).getByText('$0.00')).toBeInTheDocument();
  const initTotalRow = screen.getByText(/Total Debit:/i).parentElement!;
  expect(within(initTotalRow).getByText('$0.00')).toBeInTheDocument();

    // Submit without required fields -> alert
    await user.click(screen.getByRole('button', { name: /pay \$0\.00/i }));
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockClear();

    // Fill fields
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/recipient/i), 'friend@example.com');
    await user.type(screen.getByLabelText(/description/i), 'Dinner');

  // Fee should be $3.00 and total $103.00
  const feeRow = screen.getByText(/Transaction Fee \(3%\):/i).parentElement!;
  expect(within(feeRow).getByText('$3.00')).toBeInTheDocument();
  const totalRow = screen.getByText(/Total Debit:/i).parentElement!;
  expect(within(totalRow).getByText('$103.00')).toBeInTheDocument();

    // Enable time restriction and set hours
    const timeToggle = screen.getByText(/Add Time Restriction/i).closest('div')!.parentElement!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await user.click(timeToggle);
    const hoursInput = await screen.findByLabelText(/Claim within \(hours\)/i);
    await user.clear(hoursInput);
    await user.type(hoursInput, '12');

  // Enable geofence and expect map container to show
  const geoToggle = screen.getByText(/Add Geofence/i).closest('div')!.parentElement!.querySelector('input[type="checkbox"]') as HTMLInputElement;
  await user.click(geoToggle);
  expect(await screen.findByTestId('map')).toBeInTheDocument();

    // Submit
    await user.click(screen.getByRole('button', { name: /pay \$103\.00/i }));

    expect(onSend).toHaveBeenCalledTimes(1);
    const [fromAccountId, to, amount, description, geoFence, timeRestriction] = onSend.mock.calls[0];
    expect(fromAccountId).toBe('acc1');
    expect(to).toBe('friend@example.com');
    expect(amount).toBe(100);
    expect(description).toBe('Dinner');
    expect(geoFence).toBeUndefined();
    expect(timeRestriction).toBeTruthy();
  });
});
