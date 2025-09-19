-- Add account preferences and transaction account tracking
-- This migration adds support for multiple accounts per user with send/receive preferences

-- Add account preference columns to accounts table
ALTER TABLE accounts 
ADD COLUMN can_send BOOLEAN DEFAULT true,
ADD COLUMN can_receive BOOLEAN DEFAULT true,
ADD COLUMN is_default_send BOOLEAN DEFAULT false,
ADD COLUMN is_default_receive BOOLEAN DEFAULT false;

-- Add account tracking columns to transactions table
ALTER TABLE transactions
ADD COLUMN from_account_id UUID REFERENCES accounts(id),
ADD COLUMN to_account_id UUID REFERENCES accounts(id),
ADD COLUMN completed_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX idx_transactions_from_account ON transactions(from_account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_account_id);
CREATE INDEX idx_accounts_user_preferences ON accounts(user_id, can_send, can_receive);

-- Update existing accounts to be able to send and receive by default
UPDATE accounts SET 
  can_send = true, 
  can_receive = true, 
  is_default_send = true, 
  is_default_receive = true;

-- Comment describing the new columns
COMMENT ON COLUMN accounts.can_send IS 'Whether this account can be used to send money';
COMMENT ON COLUMN accounts.can_receive IS 'Whether this account can be used to receive money';
COMMENT ON COLUMN accounts.is_default_send IS 'Whether this is the default account for sending money';
COMMENT ON COLUMN accounts.is_default_receive IS 'Whether this is the default account for receiving money';
COMMENT ON COLUMN transactions.from_account_id IS 'The source account ID for bank-to-bank transfers';
COMMENT ON COLUMN transactions.to_account_id IS 'The destination account ID for bank-to-bank transfers';
COMMENT ON COLUMN transactions.completed_at IS 'When the transfer was completed (for tracking)';
