// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActionLogList } from './game-client-ui';
import type { LogEntry } from './game-rules';

describe('ActionLogList', () => {
  it('bolds every occurrence of every card name in a log message', () => {
    const entry: LogEntry = {
      id: 'log-1',
      turn: 1,
      phase: 'main',
      activePlayer: 'player',
      cardNames: ['Nerezza, Umbrasco Scion', 'Test Subject'],
      suffix: 'Nerezza, Umbrasco Scion took Test Subject. Test Subject entered staging.',
    };

    const { container } = render(
      <ol>
        <ActionLogList entries={[entry]} />
      </ol>,
    );

    expect(container.querySelector('ol ol li')).toHaveTextContent(entry.suffix);
    expect([...container.querySelectorAll('strong')].map((element) => element.textContent)).toEqual([
      'Nerezza, Umbrasco Scion',
      'Test Subject',
      'Test Subject',
    ]);
  });
});
