import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, CircleAlert, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...values: Parameters<typeof clsx>) {
  return twMerge(clsx(...values));
}

export function Button({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return <button className={cn('button', `button-${variant}`, className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('card', className)} {...props} />;
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('badge', className)} {...props} />;
}

export function PageLoader({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="page-loader" role="status"><span className="spinner" /><span>{label}</span></div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return <div className="empty-state"><span className="empty-mark">✳</span><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}

interface ToastMessage { id: number; text: string; type: 'success' | 'error'; }
interface ToastContextValue { notify: (text: string, type?: ToastMessage['type']) => void; }
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const notify = useCallback((text: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now() + Math.random();
    setMessages(items => [...items, { id, text, type }]);
    window.setTimeout(() => setMessages(items => items.filter(item => item.id !== id)), 4000);
  }, []);

  return <ToastContext.Provider value={{ notify }}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {messages.map(message => <div className={`toast toast-${message.type}`} key={message.id}>
        {message.type === 'success' ? <Check size={17} /> : <CircleAlert size={17} />}
        <span>{message.text}</span>
        <button aria-label="Dismiss notification" onClick={() => setMessages(items => items.filter(item => item.id !== message.id))}><X size={15} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context.notify;
}

export function Modal({ open, onOpenChange, title, description, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="dialog-content">
        <div className="dialog-heading">
          <div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div>
          <Dialog.Close asChild><button className="icon-button" aria-label="Close dialog"><X size={18} /></button></Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(value => value === 'dark' ? 'light' : 'dark') };
}
