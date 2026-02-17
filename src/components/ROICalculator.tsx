import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ─── Constants & defaults (based on Bloomberg methodology) ───────────────────

const DEFAULTS = {
  preMbaSalary: 80000,
  postMbaSalary: 140000,
  signingBonus: 30000,
  tuitionAndExpenses: 131303,
  loanAmount: 59891,
  interestRate: 5.9,
  loanTerm: 10,
  programLength: 22,
  investmentReturn: 5.5,
  preMbaWageGrowth: 4.1,
  postMbaWageGrowth: 4.2,
  inflation: 2.6,
};

const SLIDER_CONFIG: Record<string, { min: number; max: number; step: number; format: 'currency' | 'percent' | 'years' | 'months' }> = {
  preMbaSalary:      { min: 20000,  max: 300000, step: 1000,  format: 'currency' },
  postMbaSalary:     { min: 30000,  max: 500000, step: 1000,  format: 'currency' },
  signingBonus:      { min: 0,      max: 100000, step: 500,   format: 'currency' },
  tuitionAndExpenses:{ min: 25000,  max: 300000, step: 1000,  format: 'currency' },
  loanAmount:        { min: 0,      max: 200000, step: 1000,  format: 'currency' },
  interestRate:      { min: 0,      max: 15,     step: 0.1,   format: 'percent'  },
  loanTerm:          { min: 1,      max: 15,     step: 1,     format: 'years'    },
  programLength:     { min: 10,     max: 36,     step: 1,     format: 'months'   },
};

const LABELS: Record<string, { title: string; subtitle: string; medianLabel: string }> = {
  preMbaSalary:       { title: 'Pre-MBA annual salary',          subtitle: 'Your annual salary before attending business school', medianLabel: 'Median' },
  postMbaSalary:      { title: 'Post-MBA annual salary',         subtitle: 'Expected annual salary after graduation',            medianLabel: 'Median' },
  signingBonus:       { title: 'Signing bonus',                  subtitle: 'Expected one-time signing bonus after graduation',   medianLabel: 'Median' },
  tuitionAndExpenses: { title: 'Out-of-pocket expenses',         subtitle: 'Tuition, room, board & other living expenses',       medianLabel: 'Median' },
  loanAmount:         { title: 'How much will you borrow?',      subtitle: 'Total student loan amount',                          medianLabel: 'Median' },
  interestRate:       { title: 'Interest rate',                  subtitle: 'Annual interest rate on your student loans',          medianLabel: 'Average' },
  loanTerm:           { title: 'Loan term',                      subtitle: 'How long to repay your student loans',               medianLabel: 'Typical' },
  programLength:      { title: 'Program length',                 subtitle: 'Months away from full-time work',                    medianLabel: 'Median' },
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtCurrency(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtValue(value: number, format: 'currency' | 'percent' | 'years' | 'months'): string {
  switch (format) {
    case 'currency': return fmtCurrency(value);
    case 'percent':  return fmtPercent(value);
    case 'years':    return `${value} yr${value !== 1 ? 's' : ''}`;
    case 'months':   return `${value} mo`;
  }
}

function fmtMinMax(value: number, format: 'currency' | 'percent' | 'years' | 'months'): string {
  switch (format) {
    case 'currency':
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value}`;
    case 'percent':  return `${value}%`;
    case 'years':    return `${value}`;
    case 'months':   return `${value}`;
  }
}

// ─── ROI Calculation (Bloomberg methodology) ─────────────────────────────────

interface ROIResult {
  annualizedROI: number;
  netROI: number;
  totalCost: number;
  tuitionExpenses: number;
  loanInterest: number;
  forgoneIncome: number;
  totalReturn: number;
  salaryEdge: number;
  bonusCompounded: number;
}

function calculateROI(inputs: typeof DEFAULTS): ROIResult {
  const {
    preMbaSalary, postMbaSalary, signingBonus,
    tuitionAndExpenses, loanAmount, interestRate, loanTerm,
    programLength, preMbaWageGrowth, postMbaWageGrowth, inflation,
  } = inputs;

  // Real (inflation-adjusted) growth rates
  const realPreGrowth  = (preMbaWageGrowth - inflation) / 100;
  const realPostGrowth = (postMbaWageGrowth - inflation) / 100;
  const realRate       = Math.max((interestRate - inflation) / 100, 0);
  const realInvestReturn = (5.5 - inflation) / 100;

  // Forgone income: monthly pre-MBA salary × months away
  const monthlyPreMba = preMbaSalary / 12;
  const forgoneIncome = monthlyPreMba * programLength;

  // Loan interest (simple amortization total interest)
  let loanInterest = 0;
  if (loanAmount > 0 && realRate > 0 && loanTerm > 0) {
    const monthlyRate = realRate / 12;
    const numPayments = loanTerm * 12;
    const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
    loanInterest = (monthlyPayment * numPayments) - loanAmount;
  }

  const totalCost = tuitionAndExpenses + forgoneIncome + loanInterest;

  // 10-year salary advantage (post-MBA vs counterfactual pre-MBA trajectory)
  let salaryEdge = 0;
  for (let year = 1; year <= 10; year++) {
    const postSalary = postMbaSalary * Math.pow(1 + realPostGrowth, year - 1);
    const preSalary  = preMbaSalary  * Math.pow(1 + realPreGrowth, year - 1 + programLength / 12);
    salaryEdge += postSalary - preSalary;
  }

  // Signing bonus compounded for 10 years
  const bonusCompounded = signingBonus * Math.pow(1 + realInvestReturn, 10);

  const totalReturn = salaryEdge + bonusCompounded;
  const netROI = totalReturn - totalCost;

  // Annualized ROI: (grossReturn / investment) ^ (1/10) - 1
  const grossRatio = totalReturn / totalCost;
  const annualizedROI = grossRatio > 0 ? (Math.pow(grossRatio, 1 / 10) - 1) * 100 : 0;

  return {
    annualizedROI,
    netROI,
    totalCost,
    tuitionExpenses: tuitionAndExpenses,
    loanInterest,
    forgoneIncome,
    totalReturn,
    salaryEdge,
    bonusCompounded,
  };
}

// ─── Custom Slider Component ─────────────────────────────────────────────────

interface SliderProps {
  id: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  format: 'currency' | 'percent' | 'years' | 'months';
  label: { title: string; subtitle: string; medianLabel: string };
  onChange: (value: number) => void;
}

function Slider({ id, value, defaultValue, min, max, step, format, label, onChange }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pct = ((value - min) / (max - min)) * 100;
  const medianPct = ((defaultValue - min) / (max - min)) * 100;

  const getValueFromEvent = useCallback((clientX: number) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    return Math.round(raw / step) * step;
  }, [min, max, step, value]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onChange(getValueFromEvent(e.clientX));
  }, [getValueFromEvent, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    onChange(getValueFromEvent(e.clientX));
  }, [isDragging, getValueFromEvent, onChange]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="roi-slider-group">
      <div className="roi-slider-header">
        <h3 className="roi-slider-title">{label.title}</h3>
      </div>
      <p className="roi-slider-subtitle">
        {label.subtitle} &middot; {label.medianLabel}: <strong>{fmtValue(defaultValue, format)}</strong>
      </p>

      <div className="roi-slider-container">
        {/* Current value tooltip */}
        <div className="roi-slider-tooltip" style={{ left: `${pct}%` }}>
          <span className="roi-slider-tooltip-text">{fmtValue(value, format)}</span>
          <svg width="10" height="6" viewBox="0 0 10 6" className="roi-slider-tooltip-arrow">
            <polygon points="0,0 10,0 5,6" fill="#00BFA6" />
          </svg>
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className="roi-slider-track"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-label={label.title}
          tabIndex={0}
        >
          <div className="roi-slider-rail" />
          {/* Thumb */}
          <div className="roi-slider-thumb" style={{ left: `${pct}%` }}>
            <svg width="14" height="10" viewBox="0 0 14 10">
              <polygon points="0,0 14,0 7,10" fill="#00BFA6" />
            </svg>
          </div>
          {/* Median marker */}
          <div className="roi-slider-median" style={{ left: `${medianPct}%` }}>
            <span className="roi-slider-median-badge">{label.medianLabel}</span>
          </div>
        </div>

        {/* Min/Max */}
        <div className="roi-slider-range">
          <span>{fmtMinMax(min, format)}</span>
          <span>{fmtMinMax(max, format)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Result Card Component ───────────────────────────────────────────────────

interface ResultCardProps {
  label: string;
  value: string;
  accent?: boolean;
}

function ResultCard({ label, value, accent }: ResultCardProps) {
  return (
    <div className="roi-result-card">
      <div className={`roi-result-value ${accent ? 'roi-accent' : ''}`}>{value}</div>
      <div className="roi-result-label">{label}</div>
    </div>
  );
}

// ─── Main Calculator Component ───────────────────────────────────────────────

export default function ROICalculator() {
  const [inputs, setInputs] = useState(DEFAULTS);

  const update = useCallback((key: string) => (value: number) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetAll = useCallback(() => {
    setInputs(DEFAULTS);
  }, []);

  const result = useMemo(() => calculateROI(inputs), [inputs]);

  const sliderOrder = [
    'preMbaSalary', 'postMbaSalary', 'signingBonus',
    'tuitionAndExpenses', 'loanAmount', 'interestRate',
    'loanTerm', 'programLength',
  ];

  return (
    <div className="roi-calculator">
      {/* Header */}
      <header className="roi-header">
        <h1 className="roi-title">MBA Return on Investment Calculator</h1>
        <p className="roi-description">
          Is an MBA worth it? Adjust the sliders below to estimate your personal return on investment
          over the 10 years after graduation.
        </p>
      </header>

      {/* Results summary — always visible, updates live */}
      <section className="roi-results">
        <div className="roi-results-summary">
          <p className="roi-results-headline">
            Your estimated annualized ROI: <span className="roi-accent">{fmtPercent(result.annualizedROI)}</span>, netting{' '}
            <span className="roi-accent">{fmtCurrency(result.netROI)}</span> over 10 years
          </p>
        </div>

        <div className="roi-results-grid">
          <ResultCard label="Tuition & expenses" value={fmtCurrency(result.tuitionExpenses)} />
          <ResultCard label="Loan interest" value={fmtCurrency(result.loanInterest)} />
          <ResultCard label="Net forgone income" value={fmtCurrency(result.forgoneIncome)} />
          <ResultCard label="Total MBA investment" value={fmtCurrency(result.totalCost)} accent />
        </div>

        <div className="roi-results-grid roi-results-returns">
          <ResultCard label="10-yr salary advantage" value={fmtCurrency(result.salaryEdge)} />
          <ResultCard label="Signing bonus (compounded)" value={fmtCurrency(result.bonusCompounded)} />
          <ResultCard label="Total 10-yr return" value={fmtCurrency(result.totalReturn)} accent />
          <ResultCard label="Annualized ROI" value={fmtPercent(result.annualizedROI)} accent />
        </div>

        <button onClick={resetAll} className="roi-reset-btn">
          Reset to defaults
        </button>
      </section>

      {/* Sliders */}
      <section className="roi-sliders">
        {sliderOrder.map((key) => {
          const cfg = SLIDER_CONFIG[key];
          const lbl = LABELS[key];
          return (
            <Slider
              key={key}
              id={key}
              value={(inputs as any)[key]}
              defaultValue={(DEFAULTS as any)[key]}
              min={cfg.min}
              max={cfg.max}
              step={cfg.step}
              format={cfg.format}
              label={lbl}
              onChange={update(key)}
            />
          );
        })}
      </section>

      {/* Methodology note */}
      <footer className="roi-footer">
        <p>
          Calculations use a simplified version of{' '}
          <a href="https://www.bloomberg.com/graphics/mba-return-on-investment/" target="_blank" rel="noopener noreferrer">
            Bloomberg Businessweek's methodology
          </a>
          . Salary growth rates, inflation, and investment returns are assumed constant.
          This tool is for illustrative purposes only.
        </p>
      </footer>
    </div>
  );
}
