import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import TransactionDetailModal from '../components/TransactionDetailModal';
import { Transaction, TransactionStatus, GeoFence } from '../types';

describe('TransactionDetailModal with Geofencing', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockReset();
  });

  test('displays circle geofence correctly', () => {
    const circleGeoFence: GeoFence = {
      latitude: 40.7128,
      longitude: -74.0060,
      radiusKm: 5,
      locationName: 'New York City',
      shape: 'circle'
    };

    const mockTransaction: Transaction = {
      id: 'tx1',
      type: 'send',
      amount: 100,
      from_details: 'sender@example.com',
      to_details: 'recipient@example.com',
      date: new Date(),
      status: TransactionStatus.PENDING,
      description: 'Test payment with circle geofence',
      geoFence: circleGeoFence
    };

    render(
      <TransactionDetailModal 
        transaction={mockTransaction} 
        isOpen={true} 
        onClose={mockOnClose} 
      />
    );

    expect(screen.getByText('Geofence Active')).toBeInTheDocument();
    expect(screen.getByText(/Claimable within 5km of New York City/)).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('circle')).toBeInTheDocument();
  });

  test('displays polygon geofence correctly', () => {
    const polygonGeoFence: GeoFence = {
      latitude: 40.7128,
      longitude: -74.0060,
      locationName: 'Custom Area',
      shape: 'polygon',
      coordinates: [
        [40.7128, -74.0060],
        [40.7148, -74.0040],
        [40.7108, -74.0040],
        [40.7128, -74.0060]
      ]
    };

    const mockTransaction: Transaction = {
      id: 'tx2',
      type: 'send',
      amount: 50,
      from_details: 'sender@example.com',
      to_details: 'recipient@example.com',
      date: new Date(),
      status: TransactionStatus.PENDING,
      description: 'Test payment with polygon geofence',
      geoFence: polygonGeoFence
    };

    render(
      <TransactionDetailModal 
        transaction={mockTransaction} 
        isOpen={true} 
        onClose={mockOnClose} 
      />
    );

    expect(screen.getByText('Geofence Active')).toBeInTheDocument();
    expect(screen.getByText(/Claimable within Custom Area/)).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByTestId('polygon')).toBeInTheDocument();
  });

  test('handles legacy geofence format without shape property', () => {
    const legacyGeoFence = {
      latitude: 40.7128,
      longitude: -74.0060,
      radiusKm: 3,
      locationName: 'Legacy Location'
      // No shape property - should default to circle behavior
    } as GeoFence;

    const mockTransaction: Transaction = {
      id: 'tx3',
      type: 'send',
      amount: 75,
      from_details: 'sender@example.com',
      to_details: 'recipient@example.com',
      date: new Date(),
      status: TransactionStatus.PENDING,
      description: 'Test payment with legacy geofence',
      geoFence: legacyGeoFence
    };

    render(
      <TransactionDetailModal 
        transaction={mockTransaction} 
        isOpen={true} 
        onClose={mockOnClose} 
      />
    );

    expect(screen.getByText('Geofence Active')).toBeInTheDocument();
    expect(screen.getByText(/Claimable within 3km of Legacy Location/)).toBeInTheDocument();
    expect(screen.getByTestId('circle')).toBeInTheDocument();
  });

  test('displays transaction without geofence normally', () => {
    const mockTransaction: Transaction = {
      id: 'tx4',
      type: 'send',
      amount: 25,
      from_details: 'sender@example.com',
      to_details: 'recipient@example.com',
      date: new Date(),
      status: TransactionStatus.COMPLETED,
      description: 'Test payment without geofence'
    };

    render(
      <TransactionDetailModal 
        transaction={mockTransaction} 
        isOpen={true} 
        onClose={mockOnClose} 
      />
    );

    expect(screen.getByText('Test payment without geofence')).toBeInTheDocument();
    expect(screen.queryByText('Geofence Active')).not.toBeInTheDocument();
  });
});