/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrengthMeter } from './password-strength-meter';

const dictionary = {
  label: 'Password strength',
  values: {
    tooWeak: 'Too weak',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    veryStrong: 'Very strong',
  },
};

describe('PasswordStrengthMeter', () => {
  it('renders an empty password as too weak with no fill', () => {
    const { container } = render(<PasswordStrengthMeter password="" dictionary={dictionary} />);

    expect(screen.getByText('Too weak')).toBeInTheDocument();
    expect(container.querySelector('.transition-all')).toHaveStyle({ width: '0%' });
  });

  it('scores strong passwords using length, case, digits, and symbols', () => {
    const { container } = render(<PasswordStrengthMeter password="LongPassword123!" dictionary={dictionary} />);

    expect(screen.getByText('Very strong')).toBeInTheDocument();
    expect(container.querySelector('.transition-all')).toHaveStyle({ width: '100%' });
  });
});
