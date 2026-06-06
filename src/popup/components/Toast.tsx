import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;
const EXIT_ANIMATION_MS = 200;

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-800 text-white',
  error: 'bg-red-800 text-white',
  info: 'bg-gray-800 text-white',
};

function createToastId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ToastContainerProps {
  toasts: ToastItem[];
}

function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-16 right-3 z-50 flex max-w-[280px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`rounded-lg px-3 py-2 text-xs font-medium shadow-lg transition-all duration-200 ${
            TYPE_STYLES[toast.type]
          } ${
            toast.exiting
              ? 'translate-x-2 opacity-0'
              : 'translate-x-0 opacity-100'
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id ? { ...toast, exiting: true } : toast,
      ),
    );

    const removeTimer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      timersRef.current.delete(`${id}-remove`);
    }, EXIT_ANIMATION_MS);

    timersRef.current.set(`${id}-remove`, removeTimer);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType, duration = DEFAULT_DURATION_MS) => {
      const id = createToastId();

      setToasts((current) => [
        ...current,
        { id, message, type, exiting: false },
      ]);

      const dismissTimer = window.setTimeout(() => {
        removeToast(id);
      }, duration);

      timersRef.current.set(id, dismissTimer);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
