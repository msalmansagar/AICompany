import { useEffect, useRef, useState } from 'react';
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
  Input,
  Select,
} from '@fluentui/react-components';
import {
  DocumentRegular,
  ArrowRightRegular,
  CopyRegular,
  SearchRegular,
} from '@fluentui/react-icons';
import type { FormSummary } from '@qdb/shared';
import { formApi } from '../../api/formApi';

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const useStyles = makeStyles({
  root: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: tokens.spacingVerticalXXL,
  },
  header: {
    marginBottom: tokens.spacingVerticalL,
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
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalL,
    flexWrap: 'wrap',
  },
  searchInput: {
    flex: '1 1 240px',
    minWidth: '200px',
    maxWidth: '400px',
  },
  statusSelect: {
    minWidth: '140px',
  },
  resultCount: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    marginLeft: 'auto',
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
    gap: tokens.spacingHorizontalXS,
  },
  footerActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXXS,
  },
  meta: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    flexShrink: 0,
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

interface CloneState {
  formCode: string;
  isPending: boolean;
}

export function FormCatalogue() {
  const styles = useStyles();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [cloneState, setCloneState] = useState<CloneState | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), SEARCH_DEBOUNCE_MS);
  }

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    formApi
      .list({ search: debouncedSearch || undefined, status })
      .then((res) => setForms(res.data))
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load forms');
      })
      .finally(() => setIsLoading(false));
  }, [debouncedSearch, status]);

  function openForm(formCode: string) {
    window.location.href = `/forms/${formCode}`;
  }

  function handleClone(e: React.MouseEvent, formCode: string) {
    e.stopPropagation();
    setCloneState({ formCode, isPending: true });
    formApi
      .clone(formCode)
      .then((res) => {
        window.location.href = `/forms/${res.data.newFormCode}`;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Clone failed';
        alert(message);
        setCloneState(null);
      });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (loadError && forms.length === 0) {
    return (
      <div className={styles.centered}>
        <Text className={styles.errorText}>{loadError}</Text>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text as="h1" className={styles.title}>Available Forms</Text>
        <Text className={styles.subtitle}>Select a form to begin.</Text>
      </div>

      <div className={styles.toolbar}>
        <Input
          className={styles.searchInput}
          contentBefore={<SearchRegular />}
          placeholder="Search by title or code…"
          value={searchInput}
          onChange={(_e, d) => handleSearchChange(d.value)}
          aria-label="Search forms"
        />
        <Select
          className={styles.statusSelect}
          value={status}
          onChange={(_e, d) => setStatus(d.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
        {!isLoading && (
          <Text className={styles.resultCount}>
            {forms.length} {forms.length === 1 ? 'form' : 'forms'}
          </Text>
        )}
      </div>

      {isLoading ? (
        <div className={styles.centered}>
          <Spinner size="large" label="Loading forms…" />
        </div>
      ) : forms.length === 0 ? (
        <div className={styles.centered}>
          <DocumentRegular fontSize={48} color={tokens.colorNeutralForeground3} />
          <Text>No forms match your search.</Text>
        </div>
      ) : (
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
                description={
                  <Badge appearance="tint" color="success" size="small">
                    v{form.version}
                  </Badge>
                }
              />

              {form.description && (
                <Text className={styles.cardDescription}>{form.description}</Text>
              )}

              <CardFooter className={styles.cardFooter}>
                <Text className={styles.meta}>Updated {formatDate(form.modifiedAt)}</Text>
                <div className={styles.footerActions}>
                  <Button
                    appearance="transparent"
                    icon={<CopyRegular />}
                    disabled={cloneState?.formCode === form.formCode && cloneState.isPending}
                    onClick={(e) => handleClone(e, form.formCode)}
                    aria-label={`Clone ${form.title}`}
                    title="Clone form"
                  />
                  <Button
                    appearance="transparent"
                    icon={<ArrowRightRegular />}
                    iconPosition="after"
                    onClick={(e) => { e.stopPropagation(); openForm(form.formCode); }}
                  >
                    Open
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
