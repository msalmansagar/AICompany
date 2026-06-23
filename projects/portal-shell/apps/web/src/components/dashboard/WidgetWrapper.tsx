'use client';

import React, { Component } from 'react';
import type { ErrorInfo } from 'react';
import {
  Card,
  CardHeader,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ErrorCircleRegular } from '@fluentui/react-icons';

interface WidgetWrapperProps {
  title: string;
  children: React.ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const useErrorStyles = makeStyles({
  errorCard: {
    height: '100%',
    minHeight: '120px',
  },
  errorContent: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteRedForeground1,
    paddingTop: tokens.spacingVerticalM,
  },
});

function WidgetErrorFallback({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const styles = useErrorStyles();
  return (
    <Card className={styles.errorCard} appearance="filled-alternative">
      <CardHeader header={<Text weight="semibold">{title}</Text>} />
      <div className={styles.errorContent}>
        <ErrorCircleRegular />
        <Text size={200}>{message}</Text>
      </div>
    </Card>
  );
}

/**
 * Class-based error boundary wrapping each widget.
 * Catches runtime errors in widget render cycles so one broken widget
 * does not crash the entire dashboard.
 */
class WidgetErrorBoundary extends Component<
  { title: string; children: React.ReactNode },
  WidgetErrorBoundaryState
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): WidgetErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured error logging — console.error is acceptable in error boundaries
    console.error('[WidgetErrorBoundary]', {
      widgetTitle: this.props.title,
      error: error.message,
      componentStack: info.componentStack,
    });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <WidgetErrorFallback
          title={this.props.title}
          message="This widget encountered an error and cannot be displayed"
        />
      );
    }
    return this.props.children;
  }
}

export function WidgetWrapper({ title, children }: WidgetWrapperProps) {
  return <WidgetErrorBoundary title={title}>{children}</WidgetErrorBoundary>;
}
