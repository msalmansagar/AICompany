import { useEffect, useState } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Badge,
  Button,
  Spinner,
  Card,
  CardHeader,
  CardFooter,
} from '@fluentui/react-components';
import { DocumentRegular, ArrowRightRegular } from '@fluentui/react-icons';
import type { FormSummary } from '@dfe/shared';
import { formApi } from '../../api/formApi';

const useStyles = makeStyles({
  root: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: tokens.spacingVerticalXXL,
  },
  header: {
    marginBottom: tokens.spacingVerticalXXL,
  },
  title: {
    display: 'block',
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightBold,
    marginBottom: tokens.spacingVerticalS,
  },
  subtitle: {
    display: 'block',
    color: tokens.colorNeutralForeground2,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: tokens.spacingVerticalL,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s ease',
    ':hover': {
      boxShadow: tokens.shadow16,
    },
  },
  cardDescription: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    display: 'block',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: tokens.spacingVerticalM,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
});

export function FormCatalogue() {
  const styles = useStyles();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    formApi
      .list()
      .then((res) => setForms(res.data))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load forms';
        setLoadError(message);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function openForm(formCode: string) {
    window.location.href = `/forms/${formCode}`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spinner size="large" label="Loading available forms..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.centered}>
        <Text className={styles.errorText}>{loadError}</Text>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className={styles.centered}>
        <DocumentRegular fontSize={48} color={tokens.colorNeutralForeground3} />
        <Text>No active forms are currently available.</Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" className={styles.title}>Available Forms</Text>
        <Text className={styles.subtitle}>Select a form to begin.</Text>
      </div>

      <div className={styles.grid}>
        {forms.map((form) => (
          <Card
            key={form.id}
            className={styles.card}
            onClick={() => openForm(form.formCode)}
          >
            <CardHeader
              image={<DocumentRegular fontSize={24} />}
              header={<Text weight="semibold">{form.title}</Text>}
              description={<Badge appearance="tint" color="success" size="small">v{form.version}</Badge>}
            />

            {form.description && (
              <Text className={styles.cardDescription}>{form.description}</Text>
            )}

            <CardFooter className={styles.cardFooter}>
              <Text className={styles.meta}>Updated {formatDate(form.modifiedAt)}</Text>
              <Button
                appearance="transparent"
                icon={<ArrowRightRegular />}
                iconPosition="after"
                onClick={(e) => { e.stopPropagation(); openForm(form.formCode); }}
              >
                Open
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
