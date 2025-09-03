import React, { useState } from 'react';
import { Account, LockedSaving } from '../types';
import { SAVINGS_LOCK_PERIODS, EARLY_WITHDRAWAL_PENALTY_RATE } from '../constants';
import { LockIcon, AlertTriangleIcon, RefreshCwIcon } from './icons';

interface LockedSavingsProps {
    accounts: Account[];
    lockedSavings: LockedSaving[];
    onLock: (accountId: string, amount: number, period: number) => Promise<void>;
    onWithdraw: (saving: LockedSaving) => void;
}

const LockedSavings: React.FC<LockedSavingsProps> = ({ accounts, lockedSavings, onLock, onWithdraw }) => {
    const [accountId, setAccountId] = useState(accounts[0]?.id || '');
    const [amount, setAmount] = useState('');
    const [period, setPeriod] = useState<number>(SAVINGS_LOCK_PERIODS[0]);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleLock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountId || !amount || parseFloat(amount) <= 0) {
             alert('Please fill all required fields correctly.');
            return;
        }

        setIsProcessing(true);
        try {
            await onLock(accountId, parseFloat(amount), period);
            setAmount('');
        } catch (error) {
            // Error is handled by the parent component's alert
        } finally {
            setIsProcessing(false);
        }
    };

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const getStatusChip = (status: LockedSaving['status']) => {
        const styles = {
            'Pending': 'bg-yellow-900 text-yellow-300',
            'Locked': 'bg-purple-900 text-purple-300',
            'Withdrawn': 'bg-gray-700 text-gray-400',
            'Failed': 'bg-red-900 text-red-300',
        };
        return <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles[status]}`}>{status}</span>;
    }

    return (
        <div className="p-4 md:p-6 bg-violet-950/40 backdrop-blur-sm border border-violet-500/20 rounded-2xl shadow-lg">
            <h3 className="text-2xl font-bold text-violet-300 mb-6">Locked Savings</h3>
            
            <form onSubmit={handleLock} className="space-y-4 mb-8 p-4 bg-gray-900/50 rounded-lg">
                <p className="text-sm text-gray-300 mb-4">Lock real funds into a secure vault using PayPal. Funds will be transferred to a holding account and returned upon withdrawal.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="lockAccount" className="block text-sm font-medium text-gray-300 mb-1">Source Account (for tracking)</label>
                        <select id="lockAccount" name="lockAccount" value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition">
                             {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name}
                                </option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="lockAmount" className="block text-sm font-medium text-gray-300 mb-1">Amount to Lock</label>
                        <input type="number" id="lockAmount" name="lockAmount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoComplete="transaction-amount" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition" />
                    </div>
                </div>
                <div>
                     <label className="block text-sm font-medium text-gray-300 mb-1">Lock Period</label>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {SAVINGS_LOCK_PERIODS.map(p => (
                            <button key={p} type="button" onClick={() => setPeriod(p)} className={`p-3 rounded-md text-center font-semibold transition ${period === p ? 'bg-lime-500 text-purple-900' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                {p} months
                            </button>
                        ))}
                    </div>
                </div>
                <button type="submit" disabled={isProcessing} className="w-full bg-lime-500 hover:bg-lime-400 text-purple-900 font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-lime-500/20 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-wait">
                    {isProcessing ? (
                        <>
                            <RefreshCwIcon className="w-5 h-5 animate-spin" />
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            <LockIcon className="w-5 h-5" />
                            <span>Lock Funds via PayPal</span>
                        </>
                    )}
                </button>
            </form>

            <h4 className="text-xl font-semibold text-white mt-8 mb-4">Your Locked Funds</h4>
            <div className="space-y-4">
                {lockedSavings.length > 0 ? lockedSavings.map(saving => {
                    const penalty = saving.amount * EARLY_WITHDRAWAL_PENALTY_RATE;
                    const receivable = saving.amount - penalty;
                    const isMatured = new Date() > saving.endDate;

                    return (
                        <div key={saving.id} className={`p-4 rounded-lg border ${saving.status === 'Withdrawn' ? 'bg-gray-700/50 border-gray-600' : 'bg-purple-900/30 border-purple-500/50'}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-2xl font-bold text-lime-300">{formatCurrency(saving.amount)}</p>
                                    <p className="text-sm text-gray-400">
                                        Locked for {saving.lockPeriodMonths} months.
                                        {saving.status === 'Locked' && ` Matures on ${saving.endDate.toLocaleDateString()}`}
                                    </p>
                                    <div className="mt-1">{getStatusChip(saving.status)}</div>
                                </div>
                                {saving.status === 'Locked' && (
                                     <button 
                                        onClick={() => onWithdraw(saving)}
                                        className={`font-bold py-2 px-4 rounded-lg transition-colors text-sm ${isMatured ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                                     >
                                        {isMatured ? 'Withdraw' : 'Withdraw Early'}
                                     </button>
                                )}
                                {saving.status === 'Pending' && (
                                     <p className="text-sm font-semibold text-yellow-300">Awaiting PayPal confirmation...</p>
                                )}
                            </div>
                            {saving.status === 'Locked' && !isMatured && (
                                <div className="mt-3 p-3 bg-red-900/50 border border-red-500/50 rounded-md flex items-center space-x-3 text-sm">
                                    <AlertTriangleIcon className="w-8 h-8 text-red-400 flex-shrink-0"/>
                                    <div>
                                        <p className="font-semibold text-red-300">Early withdrawal penalty (5%): {formatCurrency(penalty)}</p>
                                        <p className="text-red-400">You will receive {formatCurrency(receivable)}.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }) : <p className="text-center text-gray-400 py-4">You have no funds in locked savings.</p>}
            </div>
        </div>
    );
};

export default LockedSavings;