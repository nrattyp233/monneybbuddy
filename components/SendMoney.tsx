import React, { useState, useEffect, useRef } from 'react';
import { Account, GeoFence, TimeRestriction } from '../types';
import { MapPinIcon, ClockIcon, RefreshCwIcon, DollarSignIcon } from './icons';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet-draw';

interface SendMoneyProps {
    accounts: Account[];
    onSend: (fromAccountId: string, to: string, amount: number, description: string, geoFence: GeoFence | undefined, timeRestriction: TimeRestriction | undefined) => Promise<void>;
}

const TRANSACTION_FEE_RATE = 0.03; // 3%

const SendMoney: React.FC<SendMoneyProps> = ({ accounts, onSend }) => {
    const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [useGeoFence, setUseGeoFence] = useState(false);
    const [useTimeRestriction, setUseTimeRestriction] = useState(false);
    const [hours, setHours] = useState('24');
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Fee calculation
    const [fee, setFee] = useState(0);
    const [totalDebit, setTotalDebit] = useState(0);

    // Drawing state
    const [drawnLayers, setDrawnLayers] = useState<L.Layer[]>([]);
    const featureGroupRef = useRef<L.FeatureGroup>(null);

    useEffect(() => {
        const numericAmount = parseFloat(amount);
        if (!isNaN(numericAmount) && numericAmount > 0) {
            const calculatedFee = numericAmount * TRANSACTION_FEE_RATE;
            setFee(calculatedFee);
            setTotalDebit(numericAmount + calculatedFee);
        } else {
            setFee(0);
            setTotalDebit(0);
        }
    }, [amount]);

    // Handle drawing events
    const onCreated = (e: any) => {
        const { layer } = e;
        setDrawnLayers([layer]);
        
        // Clear any previous drawings
        if (featureGroupRef.current) {
            featureGroupRef.current.clearLayers();
            featureGroupRef.current.addLayer(layer);
        }
    };

    const onDeleted = () => {
        setDrawnLayers([]);
    };

    const onEdited = (e: any) => {
        const { layers } = e;
        const updatedLayers: L.Layer[] = [];
        layers.eachLayer((layer: L.Layer) => {
            updatedLayers.push(layer);
        });
        setDrawnLayers(updatedLayers);
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fromAccountId || !recipient || !amount || parseFloat(amount) <= 0 || !description) {
            alert('Please fill all required fields correctly.');
            return;
        }

        const fromAccount = accounts.find(acc => acc.id === fromAccountId);
        if (fromAccount && (fromAccount.balance === null || fromAccount.balance < totalDebit)) {
            alert("Insufficient funds to cover the amount and transaction fee.");
            return;
        }

        let geoFence: GeoFence | undefined = undefined;
        if (useGeoFence && drawnLayers.length > 0) {
            const layer = drawnLayers[0];
            
            // Check if it has circle properties (getLatLng and getRadius)
            if (typeof (layer as any).getLatLng === 'function' && typeof (layer as any).getRadius === 'function') {
                // Handle circle
                const center = (layer as any).getLatLng();
                const radius = (layer as any).getRadius() / 1000; // Convert meters to km
                geoFence = {
                    latitude: center.lat,
                    longitude: center.lng,
                    radiusKm: radius,
                    locationName: "Drawn Circle",
                    shape: 'circle'
                };
            } else if (typeof (layer as any).getLatLngs === 'function') {
                // Handle polygon
                const latLngs = (layer as any).getLatLngs()[0] as L.LatLng[];
                const coordinates = latLngs.map(latlng => [latlng.lat, latlng.lng]);
                
                // Calculate center of polygon
                const center = latLngs.reduce(
                    (acc, latlng) => ({ lat: acc.lat + latlng.lat, lng: acc.lng + latlng.lng }),
                    { lat: 0, lng: 0 }
                );
                center.lat /= latLngs.length;
                center.lng /= latLngs.length;
                
                geoFence = {
                    latitude: center.lat,
                    longitude: center.lng,
                    locationName: "Drawn Area",
                    shape: 'polygon',
                    coordinates: coordinates
                };
            }
        }

        let timeRestriction: TimeRestriction | undefined = undefined;
        if (useTimeRestriction && hours) {
            const expiryDate = new Date();
            expiryDate.setHours(expiryDate.getHours() + parseInt(hours, 10));
            timeRestriction = { expiresAt: expiryDate };
        }
        
        setIsProcessing(true);
        try {
            await onSend(fromAccountId, recipient, parseFloat(amount), description, geoFence, timeRestriction);
            setRecipient('');
            setAmount('');
            setDescription('');
            setDrawnLayers([]);
            if (featureGroupRef.current) {
                featureGroupRef.current.clearLayers();
            }
        } catch (error) {
            // Error is alerted in the parent component
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-4 md:p-6 bg-cyan-950/40 backdrop-blur-sm border border-cyan-500/20 rounded-2xl shadow-lg">
            <h3 className="text-2xl font-bold text-cyan-300 mb-6">Send Money Securely</h3>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="fromAccount" className="block text-sm font-medium text-gray-300 mb-1">From Account</label>
                        <select id="fromAccount" name="fromAccount" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition">
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id} disabled={acc.balance === null}>
                                    {acc.name} - {acc.balance !== null ? `$${acc.balance.toFixed(2)}` : 'Balance N/A'}
                                </option>
                            ))}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">Amount ($)</label>
                        <input type="number" id="amount" name="amount" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoComplete="transaction-amount" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition" />
                    </div>
                </div>
                 <div>
                    <label htmlFor="recipient" className="block text-sm font-medium text-gray-300 mb-1">Recipient (Email or @username)</label>
                    <input type="text" id="recipient" name="recipient" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="buddy@example.com" autoComplete="email" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition" />
                </div>
                 <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                    <input type="text" id="description" name="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., Dinner last night" autoComplete="off" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition" />
                </div>

                <div className="p-4 bg-gray-900/50 rounded-lg space-y-2 border border-white/10">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Transaction Fee (3%):</span>
                        <span className="font-medium text-white">${fee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-bold">
                        <span className="text-lime-300">Total Debit:</span>
                        <span className="text-lime-300">${totalDebit.toFixed(2)}</span>
                    </div>
                </div>
                
                <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                             <MapPinIcon className="w-6 h-6 text-lime-400"/>
                             <span className="font-semibold text-white">Add Geofence</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={useGeoFence} 
                                onChange={() => setUseGeoFence(!useGeoFence)} 
                                className="sr-only peer"
                                aria-label="Add Geofence"
                            />
                            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-lime-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-500"></div>
                        </label>
                    </div>
                    {useGeoFence && (
                        <div className="pl-2 pr-2 md:pl-4 md:pr-4 space-y-4">
                            <div className="h-72 w-full rounded-lg overflow-hidden border-2 border-lime-400/30 shadow-lg">
                                <MapContainer 
                                    center={[40.7128, -74.0060]} 
                                    zoom={10} 
                                    style={{ height: '100%', width: '100%' }} 
                                    scrollWheelZoom={true}
                                >
                                    <TileLayer 
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
                                    />
                                    <FeatureGroup ref={featureGroupRef}>
                                        <EditControl
                                            position="topright"
                                            onCreated={onCreated}
                                            onDeleted={onDeleted}
                                            onEdited={onEdited}
                                            draw={{
                                                rectangle: false,
                                                marker: false,
                                                polyline: false,
                                                circlemarker: false,
                                                circle: {
                                                    shapeOptions: {
                                                        color: '#a3e635',
                                                        fillColor: '#a3e635',
                                                        fillOpacity: 0.3
                                                    }
                                                },
                                                polygon: {
                                                    shapeOptions: {
                                                        color: '#a3e635',
                                                        fillColor: '#a3e635',
                                                        fillOpacity: 0.3
                                                    }
                                                }
                                            }}
                                            edit={{
                                                featureGroup: featureGroupRef.current
                                            }}
                                        />
                                    </FeatureGroup>
                                </MapContainer>
                            </div>
                            <p className="text-xs text-gray-400">
                                Use the drawing tools to create a geofence area. You can draw a circle or polygon to define where the payment can be claimed.
                            </p>
                        </div>
                    )}
                     <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                        <div className="flex items-center space-x-3">
                            <ClockIcon className="w-6 h-6 text-lime-400"/>
                            <span className="font-semibold text-white">Add Time Restriction</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                             <input 
                                type="checkbox" 
                                checked={useTimeRestriction} 
                                onChange={() => setUseTimeRestriction(!useTimeRestriction)} 
                                className="sr-only peer"
                                aria-label="Add Time Restriction"
                            />
                            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-lime-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-lime-500"></div>
                        </label>
                    </div>
                     {useTimeRestriction && (
                         <div className="pl-4">
                            <label htmlFor="hours" className="block text-sm font-medium text-gray-300 mb-1">Claim within (hours)</label>
                            <input type="number" id="hours" name="hours" value={hours} onChange={e => setHours(e.target.value)} placeholder="24" autoComplete="off" className="w-full bg-gray-700 border border-gray-600 rounded-md p-3 focus:ring-lime-400 focus:border-lime-400 transition" />
                        </div>
                    )}
                </div>

                <button type="submit" disabled={isProcessing} className="w-full bg-lime-500 hover:bg-lime-400 text-purple-900 font-bold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-lime-500/20 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-wait">
                    {isProcessing ? (
                        <>
                            <RefreshCwIcon className="w-5 h-5 animate-spin" />
                            <span>Processing...</span>
                        </>
                    ) : (
                        <>
                            <DollarSignIcon className="w-5 h-5" />
                            <span>Pay ${totalDebit.toFixed(2)}</span>
                        </>
                    )}
                </button>
            </form>
        </div>
    );
};

export default SendMoney;