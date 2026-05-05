import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';
import { Spinner } from '../Spinner';

describe('Badge', () => {
  it('renders W with correct text', () => {
    render(<Badge result="W" />);
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('renders D with correct text', () => {
    render(<Badge result="D" />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('renders L with correct text', () => {
    render(<Badge result="L" />);
    expect(screen.getByText('L')).toBeInTheDocument();
  });
});

describe('Spinner', () => {
  it('is present in the DOM', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('respects custom size prop', () => {
    const { container } = render(<Spinner size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });
});
