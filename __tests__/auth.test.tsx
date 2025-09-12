import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Place mocks before importing the component under test
let signInMock = vi.fn().mockResolvedValue({ error: null });
let signUpMock = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
vi.mock('../services/supabase', () => {
  const auth = {
    signUp: (...args: any[]) => signUpMock(...args),
    signInWithPassword: (...args: any[]) => signInMock(...args),
  };
  return { getSupabase: () => ({ auth }) };
});

vi.mock('../components/Mascot3DCanvas', () => ({
  __esModule: true,
  default: () => <div data-testid="mascot-placeholder" />,
}));

vi.mock('../components/MascotGuide', () => ({
  __esModule: true,
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

import Auth from '../components/Auth';

describe('Auth screen', () => {
  it('renders and shows title', () => {
    render(<Auth />);
    expect(screen.getByText(/Money Buddy - Geo Safe/i)).toBeInTheDocument();
  });

  it('toggles between Sign In and Sign Up views', async () => {
    render(<Auth />);
    const user = userEvent.setup();
    // There may be multiple matching toggles due to strict rendering; click the last occurrence.
    const toggles = await screen.findAllByRole('button', { name: /don't have an account\? sign up/i });
    await user.click(toggles[toggles.length - 1]);
    // After toggle, the text should flip
    const afters = await screen.findAllByRole('button', { name: /already have an account\? sign in/i });
    const after = afters[afters.length - 1];
    expect(after).toBeInTheDocument();
  });

  it('renders email and password inputs and accepts typing', async () => {
    render(<Auth />);
    const user = userEvent.setup();
    const email = screen.getByLabelText(/email address/i) as HTMLInputElement;
    const password = screen.getByLabelText(/password/i) as HTMLInputElement;
    await user.type(email, 'user@example.com');
    await user.type(password, 'secret123');
    expect(email.value).toBe('user@example.com');
    expect(password.value).toBe('secret123');
  });
});
