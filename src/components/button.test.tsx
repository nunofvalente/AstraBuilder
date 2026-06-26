/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrimaryButton } from './primary-button';
import { SecondaryButton } from './secondary-button';
import { TertiaryButton } from './tertiary-button';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  push.mockReset();
});

describe('button components', () => {
  it('renders primary buttons and navigates when href is provided', () => {
    const onClick = vi.fn();
    render(
      <PrimaryButton href="/decks" onClick={onClick}>
        Open decks
      </PrimaryButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open decks' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/decks');
  });

  it('does not navigate primary buttons when click handlers prevent default', () => {
    render(
      <PrimaryButton href="/decks" onClick={(event) => event.preventDefault()}>
        Open decks
      </PrimaryButton>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open decks' }));

    expect(push).not.toHaveBeenCalled();
  });

  it('renders secondary and tertiary buttons as anchors when href is present', () => {
    render(
      <>
        <SecondaryButton href="/collection">Collection</SecondaryButton>
        <TertiaryButton href="/settings">Settings</TertiaryButton>
      </>,
    );

    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('renders secondary and tertiary buttons as native buttons by default', () => {
    render(
      <>
        <SecondaryButton>Cancel</SecondaryButton>
        <TertiaryButton>Reset</TertiaryButton>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveAttribute('type', 'button');
  });
});
