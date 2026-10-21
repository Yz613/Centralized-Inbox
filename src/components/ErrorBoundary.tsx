import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Reset selected project / thread in localStorage if corrupted
    try {
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
    } catch {}
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white min-h-[300px]">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 shadow-xs border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#1f1f1f] mb-1">
            {this.props.fallbackTitle || 'Something interrupted this view'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
            {this.state.error?.message || 'A temporary render error occurred. Click below to refresh your view.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Reset View</span>
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-semibold transition cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
