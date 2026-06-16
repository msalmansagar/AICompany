'use client';

import React from 'react';
import {
  Title2,
  Body1,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowResetRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    gap: tokens.spacingVerticalL,
    textAlign: 'center',
  },
});

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PortalErrorPage({ error, reset }: ErrorPageProps) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <Title2>Page Error</Title2>
      <Body1>{error.message || 'An error occurred loading this page.'}</Body1>
      <Button appearance="primary" icon={<ArrowResetRegular />} onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
