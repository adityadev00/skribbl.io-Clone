import type { ComponentPropsWithRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-marker-blue text-white border-ink shadow-[3px_3px_0_0_var(--color-ink)] hover:brightness-110 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
  secondary: 'bg-white text-ink border-ink hover:bg-highlighter/40',
  danger: 'bg-white text-marker-red border-marker-red hover:bg-marker-red/10',
  ghost: 'border-transparent text-ink-soft hover:text-ink hover:bg-ink/5',
};

interface Props extends ComponentPropsWithRef<'button'> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading, disabled, className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-5 py-2.5 text-lg font-bold
        transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
