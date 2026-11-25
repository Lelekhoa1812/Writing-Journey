import { cn } from '../lib/cn';

export default function Button({ tone = 'quiet', className, type = 'button', ...props }) {
  return <button type={type} className={cn(`btn btn-${tone}`, className)} {...props} />;
}
