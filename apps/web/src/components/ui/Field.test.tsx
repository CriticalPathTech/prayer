import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Field } from './Field';

describe('Field', () => {
  it('renders label and help text', () => {
    render(
      <Field label="Email" help="We won't share it.">
        <input />
      </Field>,
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText("We won't share it.")).toBeInTheDocument();
  });
  it('prefers error over help when both are present', () => {
    render(
      <Field label="Email" help="ok" error="required">
        <input />
      </Field>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('required');
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
  });

  it('associates error text with the input via aria-describedby', () => {
    render(
      <Field label="Email" id="email" error="Email is required">
        <input />
      </Field>,
    );
    const input = screen.getByRole('textbox');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    const errorEl = document.getElementById(errorId!);
    expect(errorEl).toHaveTextContent('Email is required');
  });
});
