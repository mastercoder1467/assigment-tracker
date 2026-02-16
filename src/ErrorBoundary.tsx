import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Keep a console breadcrumb for devtools, but always render a visible fallback UI.
    // eslint-disable-next-line no-console
    console.error("Render error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          padding: 24,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "pre-wrap"
        }}
      >
        <h1 style={{ marginTop: 0 }}>App Render Error</h1>
        <div>{String(this.state.error.message || this.state.error)}</div>
      </div>
    );
  }
}

