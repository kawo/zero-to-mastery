import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StatusMessage } from './StatusMessage';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches rendering errors so one broken view doesn't blank the whole app.
 * (Data-loading errors are handled by each page; this is for bugs.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rendering error:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset, error);
    return (
      <StatusMessage
        tone="error"
        title="Something went wrong"
        description="This part of the page hit an unexpected problem. Trying again usually fixes it."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              Go to the home page
            </Button>
          </div>
        }
      />
    );
  }
}
