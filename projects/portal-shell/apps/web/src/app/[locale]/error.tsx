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
    minHeight: '60vh',
    gap: tokens.spacingVerticalL,
    textAlign: 'center',
    paddingInline: tokens.spacingHorizontalXXL,
  },
});

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <Title2>Something went wrong</Title2>
      <Body1>{error.message || 'An unexpected error occurred. Please try again.'}</Body1>
      <Button appearance="primary" icon={<ArrowResetRegular />} onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
