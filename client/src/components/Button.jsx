import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';

const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      tone: {
        pen: 'bg-pen text-pen-ink shadow-[0_8px_18px_-12px_var(--pen)] hover:brightness-110',
        quiet: 'border border-line bg-sheet text-ink hover:bg-desk',
        ghost: 'bg-transparent text-pen-ink hover:bg-white/10',
      },
    },
    defaultVariants: { tone: 'quiet' },
  },
);

export default function Button({ tone, className, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonStyles({ tone }), className)} {...props} />;
}
