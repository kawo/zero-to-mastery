import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Top-level boundary: fills the screen. */
  fullPage?: boolean;
}

interface State {
  error: Error | null;
}

/** Catches render errors so one broken page doesn't take down playback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // A stale lazy chunk after a deploy: a reload fetches the new one.
    const chunk =
      /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
        error.message,
      );
    return (
      <div
        className={this.props.fullPage ? 'grid min-h-dvh place-items-center p-6' : 'py-16'}
        role="alert"
      >
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="mt-2 text-muted">
            {chunk
              ? 'Tunebox was updated. Reload to get the latest version.'
              : 'This part of the app hit an error. Your music and playlists are safe.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            {!this.props.fullPage && !chunk && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => this.setState({ error: null })}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
