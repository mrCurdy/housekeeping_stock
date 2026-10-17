import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, FormField, Input, Switch } from '.';

describe('UI components', () => {
  it('Button shows a spinner and is disabled while loading', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button', { name: /save/i });
    expect(btn).toBeDisabled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('FormField links label and error to its control', () => {
    render(
      <FormField label="Email" error="Required">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required');
  });

  it('Switch toggles', async () => {
    const onChange = vi.fn();
    render(<Switch label="Dark" checked={false} onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
