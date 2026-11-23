import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed?.error) {
        readable = parsed.error.includes('Missing or insufficient permissions')
          ? 'You do not have permission to perform this action. Please make sure you are signed in with a verified account.'
          : parsed.error;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error) {
    console.error('MENUQR ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFF9F1] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl border border-[#E6DFD3] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#FFF1EE] text-[#C93B2B] flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-[#171923] mb-2">Something went wrong</h1>
            <p className="text-sm text-[#525866] mb-6 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#171923] text-white text-sm font-semibold hover:bg-[#2A2E3F] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Return to MENUQR
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
