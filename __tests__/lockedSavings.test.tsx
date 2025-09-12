import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LockedSavings from '../components/LockedSavings';
import { Account, LockedSaving } from '../types';

describe('LockedSavings', () => {
  const accounts: Account[] = [
    { id: 'acc1', name: 'Checking', provider: 'Bank', type: 'bank', balance: 1000 },
  ];

  test('locks funds via form and period selection', async () => {
    const user = userEvent.setup();
    const onLock = vi.fn().mockResolvedValue(undefined);

    render(
      <LockedSavings
        accounts={accounts}
        lockedSavings={[]}
        onLock={onLock}
        onWithdraw={vi.fn()}
      />
    );

    // Fill amount
    await user.type(screen.getByLabelText(/Amount to Lock/i), '200');

    // Choose a period (click the first button; default is first, click another to ensure change)
    const periodButtons = screen.getAllByRole('button', { name: /months/i });
    await user.click(periodButtons[1]);

    // Submit
    await user.click(screen.getByRole('button', { name: /Lock Funds via PayPal/i }));

    expect(onLock).toHaveBeenCalledTimes(1);
    const [accountId, amount, period] = onLock.mock.calls[0];
    expect(accountId).toBe('acc1');
    expect(amount).toBe(200);
    expect(typeof period).toBe('number');
  });

  test('shows withdraw vs withdraw early and calls onWithdraw', async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();

    const now = new Date();
    const past = new Date(now.getTime() - 24 * 3600 * 1000);
    const future = new Date(now.getTime() + 24 * 3600 * 1000);

    const savings: LockedSaving[] = [
      {
        id: 's1', accountId: 'acc1', amount: 100, lockPeriodMonths: 6,
        startDate: past, endDate: future, status: 'Locked'
      },
      {
        id: 's2', accountId: 'acc1', amount: 300, lockPeriodMonths: 3,
        startDate: past, endDate: past, status: 'Locked'
      },
      {
        id: 's3', accountId: 'acc1', amount: 50, lockPeriodMonths: 1,
        startDate: past, endDate: past, status: 'Withdrawn'
      },
      {
        id: 's4', accountId: 'acc1', amount: 75, lockPeriodMonths: 1,
        startDate: past, endDate: future, status: 'Pending'
      },
    ];

    render(
      <LockedSavings
        accounts={accounts}
        lockedSavings={savings}
        onLock={vi.fn()}
        onWithdraw={onWithdraw}
      />
    );

    // Early withdrawal warning section present for s1
    expect(screen.getByText(/Early withdrawal penalty \(5%\):/i)).toBeInTheDocument();

    // Buttons
    const earlyBtn = screen.getByRole('button', { name: /Withdraw Early/i });
    await user.click(earlyBtn);
    expect(onWithdraw).toHaveBeenCalledTimes(1);

    const withdrawBtn = screen.getByRole('button', { name: /^Withdraw$/i });
    await user.click(withdrawBtn);
    expect(onWithdraw).toHaveBeenCalledTimes(2);
  });
});
