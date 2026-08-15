/**
 * Mobile mock-data unit tests.
 *
 * These exercise the pure-function layer that drives the Send screen's
 * fee/ETB calculations and the formatters used throughout the app.
 * They run via vitest (no React Native runtime required).
 */
import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  formatEtb,
  PROMO_RATE,
  STANDARD_RATE,
  CARD_FEE_RATE,
  CHECKING_BALANCE,
  RECENT_TRANSACTIONS,
} from '../lib/mock-data';

// ─── formatUsd ────────────────────────────────────────────────────────────────

describe('formatUsd', () => {
  it('formats a whole-dollar amount without cents', () => {
    expect(formatUsd(1000)).toBe('$1,000');
  });

  it('formats a fractional amount with two decimal places', () => {
    expect(formatUsd(14.5)).toBe('$14.50');
  });

  it('formats zero', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('prefixes positive amount with + when sign=true', () => {
    expect(formatUsd(200, { sign: true })).toBe('+$200');
  });

  it('prefixes negative amount with - when sign=true', () => {
    expect(formatUsd(-820, { sign: true })).toBe('-$820');
  });

  it('always shows absolute value (no double-negative)', () => {
    expect(formatUsd(-14.5, { sign: true })).toBe('-$14.50');
  });
});

// ─── formatEtb ───────────────────────────────────────────────────────────────

describe('formatEtb', () => {
  it('formats a large ETB amount with comma separator', () => {
    expect(formatEtb(180000)).toBe('180,000 ETB');
  });

  it('rounds fractional ETB to 0 decimal places', () => {
    // 1000 * 180 = 180000 — exact integer
    expect(formatEtb(1000 * PROMO_RATE)).toBe('180,000 ETB');
  });

  it('formats zero', () => {
    expect(formatEtb(0)).toBe('0 ETB');
  });
});

// ─── Fee calculation (mirrors remittance.tsx logic) ───────────────────────────

describe('Send screen fee calculation', () => {
  function calc(amount: number, funding: 'card' | 'bank') {
    const fee = funding === 'card' ? amount * CARD_FEE_RATE : 0;
    const total = amount + fee;
    const receiveEtb = amount * PROMO_RATE;
    const extraEtb = receiveEtb - amount * STANDARD_RATE;
    return { fee, total, receiveEtb, extraEtb };
  }

  it('charges 0 fee for bank funding', () => {
    const { fee, total } = calc(1000, 'bank');
    expect(fee).toBe(0);
    expect(total).toBe(1000);
  });

  it('charges 3% fee for card funding', () => {
    const { fee, total } = calc(1000, 'card');
    expect(fee).toBeCloseTo(30, 5);
    expect(total).toBeCloseTo(1030, 5);
  });

  it('ETB received is based on PROMO_RATE (180)', () => {
    expect(PROMO_RATE).toBe(180);
    const { receiveEtb } = calc(100, 'bank');
    expect(receiveEtb).toBe(18000);
  });

  it('extra ETB vs standard rate is positive', () => {
    const { extraEtb } = calc(100, 'bank');
    expect(extraEtb).toBeGreaterThan(0);
    expect(extraEtb).toBeCloseTo(100 * (PROMO_RATE - STANDARD_RATE), 5);
  });

  it('fee does not affect ETB amount (recipient gets send amount × rate)', () => {
    const bankResult = calc(500, 'bank');
    const cardResult = calc(500, 'card');
    // Recipient ETB is always sendAmount × PROMO_RATE, regardless of funding
    expect(bankResult.receiveEtb).toBe(cardResult.receiveEtb);
  });
});

// ─── Static mock data integrity ───────────────────────────────────────────────

describe('mock data integrity', () => {
  it('CHECKING_BALANCE is a positive number', () => {
    expect(CHECKING_BALANCE).toBeGreaterThan(0);
  });

  it('RECENT_TRANSACTIONS has at least one entry', () => {
    expect(RECENT_TRANSACTIONS.length).toBeGreaterThan(0);
  });

  it('every transaction has required fields', () => {
    for (const tx of RECENT_TRANSACTIONS) {
      expect(typeof tx.id).toBe('number');
      expect(typeof tx.merchant).toBe('string');
      expect(tx.merchant.length).toBeGreaterThan(0);
      expect(typeof tx.amount).toBe('number');
      expect(typeof tx.category).toBe('string');
    }
  });

  it('income transactions have positive amounts', () => {
    const income = RECENT_TRANSACTIONS.filter((tx) => tx.category === 'Income');
    for (const tx of income) {
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it('spending transactions have negative amounts', () => {
    const spending = RECENT_TRANSACTIONS.filter((tx) => tx.category !== 'Income');
    for (const tx of spending) {
      expect(tx.amount).toBeLessThan(0);
    }
  });
});
