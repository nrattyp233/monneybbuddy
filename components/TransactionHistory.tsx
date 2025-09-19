import React from 'react';
import { Transaction, TransactionStatus } from '../types';
import { SendIcon, LockIcon, DollarSignIcon, RefreshCwIcon, MapPinIcon } from './icons';

interface TransactionHistoryProps {
  transactions: Transaction[];
  currentUserEmail: string;
  onTransactionClick: (transaction: Transaction) => void;
  onApproveRequest: (transaction: Transaction) => void;
  onDeclineRequest: (transaction: Transaction) => void;
  onClaimTransaction: (transaction: Transaction) => void;
  isClaimingId: string | null;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, currentUserEmail, onTransactionClick, onApproveRequest, onDeclineRequest, onClaimTransaction, isClaimingId }) => {

    const getStatusChip = (status: TransactionStatus) => {
        const statuses: Record<TransactionStatus, string> = {
            [TransactionStatus.COMPLETED]: "bg-green-900 text-green-300",
            [TransactionStatus.PENDING]: "bg-yellow-900 text-yellow-300",
            [TransactionStatus.FAILED]: "bg-red-900 text-red-300",
            [TransactionStatus.RETURNED]: "bg-blue-900 text-blue-300",
            [TransactionStatus.LOCKED]: "bg-purple-900 text-purple-300",
            [TransactionStatus.DECLINED]: "bg-gray-700 text-gray-400",
        };
        return <span className={`text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full ${statuses[status]}`}>{status}</span>;
    };

    const getIcon = (tx: Transaction) => {
      switch(tx.type) {
        case 'send':
          return <div className='p-2 rounded-full bg-red-500/20'><SendIcon className='w-6 h-6 text-red-400' /></div>
        case 'receive':
          return <div className='p-2 rounded-full bg-green-500/20'><SendIcon className='w-6 h-6 text-green-400 rotate-180' /></div>
        case 'request':
          // If I sent the request, it's outgoing. If it was sent to me, it's incoming.
          const isMyRequestToSomeoneElse = tx.from_details === currentUserEmail;
          return <div className={`p-2 rounded-full ${isMyRequestToSomeoneElse ? 'bg-cyan-500/20' : 'bg-green-500/20'}`}><DollarSignIcon className={`w-6 h-6 ${isMyRequestToSomeoneElse ? 'text-cyan-400' : 'text-green-400'}`} /></div>
        case 'lock':
        case 'penalty':
          return <div className='p-2 rounded-full bg-purple-500/20'><LockIcon className='w-6 h-6 text-purple-400'/></div>
        case 'fee':
            return <div className='p-2 rounded-full bg-gray-500/20'><DollarSignIcon className='w-6 h-6 text-gray-400'/></div>
        default:
          return <div className='p-2 rounded-full bg-gray-500/20'><RefreshCwIcon className='w-6 h-6 text-gray-400'/></div>
      }
    }

    const incomingRequests = transactions.filter(tx => tx.type === 'request' && tx.status === TransactionStatus.PENDING && tx.to_details === currentUserEmail);
    // An incoming pending "send" is a conditional payment I need to claim.
    const pendingToClaim = transactions.filter(tx => 
        tx.type === 'send' && 
        tx.status === TransactionStatus.PENDING && 
        tx.to_details === currentUserEmail && 
        (tx.geoFence || tx.timeRestriction)
    );
    
    const otherPending = transactions.filter(tx => 
        tx.status === TransactionStatus.PENDING && 
        !incomingRequests.find(t => t.id === tx.id) && 
        !pendingToClaim.find(t => t.id === tx.id)
    );
    
    const history = transactions.filter(tx => tx.status !== TransactionStatus.PENDING);

    const actionRequired = [...incomingRequests, ...pendingToClaim];

    const renderTransactionItem = (tx: Transaction) => {
        const isMyIncomingRequest = tx.type === 'request' && tx.to_details === currentUserEmail && tx.status === TransactionStatus.PENDING;
        const isMyIncomingConditionalSend = tx.type === 'send' && tx.to_details === currentUserEmail && tx.status === TransactionStatus.PENDING && (tx.geoFence || tx.timeRestriction);

        const isActionable = isMyIncomingRequest || isMyIncomingConditionalSend;
        
        // Determine if it's a debit or credit from the current user's perspective
        let isDebit = false;
        if (tx.from_details === currentUserEmail) {
            isDebit = true;
        }
        if (tx.type === 'penalty' || tx.type === 'lock' || tx.type === 'fee') {
             isDebit = true; // These are always debits from user's main balance
        }
         if (tx.type === 'receive') {
            isDebit = false;
        }

        return (
            <div key={tx.id} className="bg-gray-900/50 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:bg-gray-900/80">
                <div onClick={() => onTransactionClick(tx)} className="flex items-center space-x-4 cursor-pointer flex-grow">
                   {getIcon(tx)}
                   <div className="flex-grow">
                      <p className="font-semibold text-white">{tx.description}</p>
                      <p className="text-sm text-gray-400">{tx.date.toLocaleString()}</p>
                       <div className="mt-1">{getStatusChip(tx.status)}</div>
                   </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex-grow flex items-center justify-end gap-2">
                         {isMyIncomingRequest && (
                            <>
                                <button onClick={(e) => { e.stopPropagation(); onDeclineRequest(tx); }} className="w-full sm:w-auto text-xs text-center justify-center flex-1 bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-500 transition font-bold">Decline</button>
                                <button onClick={(e) => { e.stopPropagation(); onApproveRequest(tx); }} className="w-full sm:w-auto text-xs text-center justify-center flex-1 bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-500 transition font-bold">Approve</button>
                            </>
                        )}
                        {isMyIncomingConditionalSend && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); onClaimTransaction(tx); }} 
                                disabled={isClaimingId === tx.id}
                                className="w-full sm:w-auto text-xs text-center justify-center flex items-center gap-2 flex-1 bg-lime-600 text-white px-3 py-2 rounded-md hover:bg-lime-500 transition font-bold disabled:bg-gray-500 disabled:cursor-wait"
                            >
                                {isClaimingId === tx.id ? <RefreshCwIcon className="w-4 h-4 animate-spin"/> : <MapPinIcon className="w-4 h-4"/>}
                                {isClaimingId === tx.id ? 'Claiming...' : 'Claim'}
                            </button>
                        )}
                         {tx.status === TransactionStatus.PENDING && !isActionable && (
                             <span className="text-xs text-yellow-400 font-semibold pr-2">Awaiting action</span>
                         )}
                    </div>
                     <p onClick={() => onTransactionClick(tx)} className={`font-bold text-xl text-right flex-shrink-0 w-24 cursor-pointer ${isDebit ? 'text-red-400' : 'text-lime-400'}`}>
                        {isDebit ? '-' : '+'} ${tx.amount.toFixed(2)}
                    </p>
                </div>
            </div>
        );
    }

  return (
    <div className="p-4 md:p-6 bg-slate-900/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-lg">
      <h3 className="text-2xl font-bold text-slate-300 mb-6">Transaction History</h3>
      <div className="space-y-6">
        {(actionRequired.length > 0 || otherPending.length > 0) && (
            <div>
                <h4 className="text-lg font-semibold text-lime-300 mb-3">Action Required & Pending</h4>
                <div className="space-y-3">
                    {actionRequired.map(tx => renderTransactionItem(tx))}
                    {otherPending.map(tx => renderTransactionItem(tx))}
                </div>
            </div>
        )}
        
        <div>
            <h4 className="text-lg font-semibold text-slate-300 mb-3">Completed & Past</h4>
             <div className="space-y-3">
                {history.length > 0 ? history.map((tx) => renderTransactionItem(tx)) : (
                    (actionRequired.length === 0 && otherPending.length === 0) && <p className="text-center text-gray-400 py-8">No transactions yet.</p>
                )}
              </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionHistory;