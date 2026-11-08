import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AIUsageDetails } from '../components/UI/AIUsageDetails';

test('does not present missing provider counters as measured zero tokens', () => {
  render(
    <AIUsageDetails
      usage={{
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 2500,
        toolCalls: 0,
        usageReported: false,
      }}
    />
  );
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  expect(screen.getByText(/not the full provider bill/)).toBeInTheDocument();
});
