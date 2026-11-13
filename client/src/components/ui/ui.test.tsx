import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddForm, Button, ClearableInput, FormField, Input, Switch } from '.';

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

  it('AddForm adds the trimmed name and clears itself', async () => {
    const onAdd = vi.fn(() => true);
    render(<AddForm placeholder="New item" label="Add" onAdd={onAdd} />);
    const input = screen.getByRole('textbox', { name: 'New item' });
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.type(input, '  Towels  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('Towels');
    expect(input).toHaveValue('');
  });

  it('ClearableInput shows × only with onClear, and × calls it', async () => {
    const onClear = vi.fn();
    const { rerender } = render(<ClearableInput value="5" onCommit={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear manual value' })).not.toBeInTheDocument();
    rerender(<ClearableInput value="5" onCommit={() => {}} onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear manual value' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
